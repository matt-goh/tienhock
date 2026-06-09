// src/routes/accounting/opening-balances.js
// GL opening-balance anchors (item 1A-7, first used by the Bank Statement report).
// One signed amount per (account_code, as_of_date): DR-positive for assets. The Bank
// Statement report seeds its brought-forward balance from the latest anchor whose
// as_of_date is on/before the period start, ignoring every posted line before it — this
// discards pre-migration / pre-cutover noise without backdated journals.
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET /:accountCode - the applicable anchor (latest as_of_date), plus full history.
  // Optional ?as_of=yyyy-MM-dd returns the anchor applicable at that date.
  router.get("/:accountCode", async (req, res) => {
    try {
      const { accountCode } = req.params;
      const { as_of } = req.query;

      const params = [accountCode];
      let applicableSql = `
        SELECT id, account_code, to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date,
               amount, notes, created_at, updated_at, created_by
          FROM account_opening_balances
         WHERE account_code = $1`;
      if (as_of) {
        applicableSql += ` AND as_of_date <= $2`;
        params.push(as_of);
      }
      applicableSql += ` ORDER BY as_of_date DESC LIMIT 1`;

      const applicableResult = await pool.query(applicableSql, params);

      const historyResult = await pool.query(
        `SELECT id, account_code, to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date,
                amount, notes, created_at, updated_at, created_by
           FROM account_opening_balances
          WHERE account_code = $1
          ORDER BY as_of_date DESC`,
        [accountCode]
      );

      res.json({
        opening_balance: applicableResult.rows[0] || null,
        history: historyResult.rows,
      });
    } catch (error) {
      console.error("Error fetching opening balance:", error);
      res
        .status(500)
        .json({ message: "Error fetching opening balance", error: error.message });
    }
  });

  // PUT /:accountCode - upsert an anchor on (account_code, as_of_date)
  router.put("/:accountCode", async (req, res) => {
    try {
      const { accountCode } = req.params;
      const { as_of_date, amount, notes } = req.body;

      if (!as_of_date) {
        return res.status(400).json({ message: "as_of_date is required" });
      }
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum)) {
        return res.status(400).json({ message: "amount must be a number" });
      }

      // Account must exist
      const acResult = await pool.query(
        `SELECT 1 FROM account_codes WHERE code = $1`,
        [accountCode]
      );
      if (acResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: `Account ${accountCode} not found` });
      }

      const result = await pool.query(
        `INSERT INTO account_opening_balances
           (account_code, as_of_date, amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_code, as_of_date)
         DO UPDATE SET amount = EXCLUDED.amount,
                       notes = EXCLUDED.notes,
                       updated_at = CURRENT_TIMESTAMP
         RETURNING id, account_code, to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date,
                   amount, notes`,
        [accountCode, as_of_date, amountNum, notes || null, req.staffId || null]
      );

      res.json({
        message: "Opening balance saved",
        opening_balance: result.rows[0],
      });
    } catch (error) {
      console.error("Error saving opening balance:", error);
      res
        .status(500)
        .json({ message: "Error saving opening balance", error: error.message });
    }
  });

  // DELETE /:accountCode/:asOfDate - clear a specific anchor
  router.delete("/:accountCode/:asOfDate", async (req, res) => {
    try {
      const { accountCode, asOfDate } = req.params;
      const result = await pool.query(
        `DELETE FROM account_opening_balances
          WHERE account_code = $1 AND as_of_date = $2`,
        [accountCode, asOfDate]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Opening balance not found" });
      }
      res.json({ message: "Opening balance deleted" });
    } catch (error) {
      console.error("Error deleting opening balance:", error);
      res
        .status(500)
        .json({ message: "Error deleting opening balance", error: error.message });
    }
  });

  return router;
}
