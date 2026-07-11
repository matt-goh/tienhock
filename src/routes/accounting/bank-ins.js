// src/routes/accounting/bank-ins.js
// RV cash bank-in endpoints (Tien Hock). See bank-in-service.js for the
// accounting contract.
import { Router } from "express";
import {
  getNextRvNumber,
  getCashSalesPools,
  getUnbankedCashReceipts,
  createBankIn,
  cancelBankIn,
} from "./bank-in-service.js";

export default function (pool) {
  const router = Router();

  // --- GET /api/bank-ins/next-rv?date=yyyy-MM-dd — prefill the shared RV number ---
  router.get("/next-rv", async (req, res) => {
    try {
      const dateStr = String(req.query.date || "").slice(0, 10);
      const base = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : null;
      const now = new Date();
      const year = base ? parseInt(base.slice(0, 4), 10) : now.getFullYear();
      const month = base ? parseInt(base.slice(5, 7), 10) : now.getMonth() + 1;
      const client = await pool.connect();
      try {
        const next = await getNextRvNumber(client, year, month);
        res.json({ ...next, rv_year: year, rv_month: month });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error getting next RV number:", error);
      res.status(500).json({ message: "Error getting next RV number", error: error.message });
    }
  });

  // --- GET /api/bank-ins/pools — CH_REV1 date pools + CH_REV2 unbanked receipts ---
  router.get("/pools", async (req, res) => {
    const client = await pool.connect();
    try {
      const [cashSales, receipts] = [
        await getCashSalesPools(client),
        await getUnbankedCashReceipts(client),
      ];
      res.json({ cash_sales: cashSales, cash_receipts: receipts });
    } catch (error) {
      console.error("Error fetching bank-in pools:", error);
      res.status(500).json({ message: "Error fetching bank-in pools", error: error.message });
    } finally {
      client.release();
    }
  });

  // --- GET /api/bank-ins — list ---
  router.get("/", async (req, res) => {
    const { startDate, endDate, status, limit = "100" } = req.query;
    try {
      const params = [];
      let where = "WHERE 1=1";
      if (startDate) {
        params.push(String(startDate).slice(0, 10));
        where += ` AND bi.posting_date >= $${params.length}`;
      }
      if (endDate) {
        params.push(String(endDate).slice(0, 10));
        where += ` AND bi.posting_date <= $${params.length}`;
      }
      if (status) {
        params.push(status);
        where += ` AND bi.status = $${params.length}`;
      }
      params.push(Math.min(parseInt(limit, 10) || 100, 500));
      const result = await pool.query(
        `SELECT bi.*, rv.rv_number, rv.rv_year, je.reference_no AS journal_reference_no,
                (SELECT json_agg(json_build_object(
                    'id', big.id, 'group_number', big.group_number,
                    'holding_account', big.holding_account, 'amount', big.amount,
                    'description', big.description
                  ) ORDER BY big.group_number)
                   FROM bank_in_groups big WHERE big.bank_in_id = bi.id) AS groups
           FROM bank_ins bi
           JOIN rv_registry rv ON rv.id = bi.rv_registry_id
           LEFT JOIN journal_entries je ON je.id = bi.journal_entry_id
          ${where}
          ORDER BY bi.posting_date DESC, rv.rv_seq DESC
          LIMIT $${params.length}`,
        params
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error listing bank-ins:", error);
      res.status(500).json({ message: "Error listing bank-ins", error: error.message });
    }
  });

  // --- GET /api/bank-ins/:id ---
  router.get("/:id", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT bi.*, rv.rv_number, rv.rv_year, je.reference_no AS journal_reference_no
           FROM bank_ins bi
           JOIN rv_registry rv ON rv.id = bi.rv_registry_id
           LEFT JOIN journal_entries je ON je.id = bi.journal_entry_id
          WHERE bi.id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Bank-in not found" });
      }
      const groups = await pool.query(
        `SELECT big.*,
                (SELECT json_agg(json_build_object(
                    'id', bia.id, 'source_type', bia.source_type,
                    'source_date', bia.source_date, 'receipt_id', bia.receipt_id,
                    'amount', bia.amount
                  ) ORDER BY bia.id)
                   FROM bank_in_allocations bia WHERE bia.group_id = big.id) AS allocations
           FROM bank_in_groups big
          WHERE big.bank_in_id = $1
          ORDER BY big.group_number`,
        [req.params.id]
      );
      res.json({ ...result.rows[0], groups: groups.rows });
    } catch (error) {
      console.error("Error fetching bank-in:", error);
      res.status(500).json({ message: "Error fetching bank-in", error: error.message });
    }
  });

  // --- POST /api/bank-ins — create + post one RV bank-in atomically ---
  router.post("/", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Strip import-only switches from external calls.
      const { skip_pool_validation, allow_month_mismatch, legacy_particulars, ...payload } = req.body || {};
      const result = await createBankIn(client, payload, req.user?.id || null);
      await client.query("COMMIT");
      res.status(201).json({ message: `Bank-in ${result.rv_number} posted`, ...result });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating bank-in:", error);
      res.status(400).json({ message: error.message || "Error creating bank-in" });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/bank-ins/:id/cancel ---
  router.put("/:id/cancel", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await cancelBankIn(
        client,
        parseInt(req.params.id, 10),
        req.body?.reason || null,
        req.user?.id || null
      );
      await client.query("COMMIT");
      res.json({ message: "Bank-in cancelled; source amounts returned to their pools", ...result });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling bank-in:", error);
      res.status(400).json({ message: error.message || "Error cancelling bank-in" });
    } finally {
      client.release();
    }
  });

  return router;
}
