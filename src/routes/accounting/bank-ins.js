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

  // --- GET /api/bank-ins — list (structured bank-ins + manually keyed RV journals) ---
  router.get("/", async (req, res) => {
    const { startDate, endDate, status, limit = "100" } = req.query;
    try {
      const params = [];
      let biWhere = "WHERE 1=1";
      // Manually keyed RV journals: entry_type 'RV' with no owning bank_ins row.
      let jeWhere =
        "WHERE je.entry_type = 'RV'" +
        " AND NOT EXISTS (SELECT 1 FROM bank_ins x WHERE x.journal_entry_id = je.id)";
      if (startDate) {
        params.push(String(startDate).slice(0, 10));
        biWhere += ` AND bi.posting_date >= $${params.length}`;
        jeWhere += ` AND je.entry_date >= $${params.length}`;
      }
      if (endDate) {
        params.push(String(endDate).slice(0, 10));
        biWhere += ` AND bi.posting_date <= $${params.length}`;
        jeWhere += ` AND je.entry_date <= $${params.length}`;
      }
      if (status) {
        params.push(status);
        biWhere += ` AND bi.status = $${params.length}`;
        jeWhere += ` AND je.status = $${params.length}`;
      }
      params.push(Math.min(parseInt(limit, 10) || 100, 500));
      const result = await pool.query(
        `SELECT * FROM (
           SELECT bi.id, 'bank_in'::text AS kind, rv.rv_number, rv.rv_year, rv.rv_seq,
                  bi.posting_date, bi.bank_account, bi.total_amount, bi.status,
                  bi.notes AS description, bi.journal_entry_id,
                  je.reference_no AS journal_reference_no,
                  (SELECT json_agg(json_build_object(
                      'id', big.id, 'group_number', big.group_number,
                      'holding_account', big.holding_account, 'amount', big.amount,
                      'description', big.description
                    ) ORDER BY big.group_number)
                     FROM bank_in_groups big WHERE big.bank_in_id = bi.id) AS groups
             FROM bank_ins bi
             JOIN rv_registry rv ON rv.id = bi.rv_registry_id
             LEFT JOIN journal_entries je ON je.id = bi.journal_entry_id
            ${biWhere}
           UNION ALL
           SELECT je.id, 'manual_journal'::text AS kind, je.reference_no AS rv_number,
                  NULL::int AS rv_year,
                  (substring(je.reference_no from 'RV(\d+)/[0-9]{2}'))::int AS rv_seq,
                  je.entry_date AS posting_date,
                  (SELECT jel.account_code
                     FROM journal_entry_lines jel
                    WHERE jel.journal_entry_id = je.id AND jel.debit_amount > 0
                    ORDER BY jel.line_number
                    LIMIT 1) AS bank_account,
                  je.total_debit AS total_amount, je.status, je.description,
                  je.id AS journal_entry_id,
                  je.reference_no AS journal_reference_no,
                  NULL::json AS groups
             FROM journal_entries je
            ${jeWhere}
         ) combined
         ORDER BY posting_date DESC, rv_seq DESC NULLS LAST, id DESC
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
