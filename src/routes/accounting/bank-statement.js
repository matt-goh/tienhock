// src/routes/accounting/bank-statement.js
// Bank statement from journal: a running-ledger view of a single bank/cash
// account (item 1B-1). Reads posted journal lines for the chosen account in a
// month, seeds the running balance with the brought-forward (opening) balance =
// net of all posted lines before the month, and returns one row per transaction
// with a running balance. The account is treated as debit-normal (an asset), so
// a debit increases the balance and a credit decreases it.
import { Router } from "express";

export default function (pool) {
  const router = Router();

  const validateYearMonth = (year, month) => {
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      return { valid: false, error: "Invalid year. Must be between 1900 and 2100." };
    }
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return { valid: false, error: "Invalid month. Must be between 1 and 12." };
    }
    return { valid: true, year: yearNum, month: monthNum };
  };

  const pad = (n) => String(n).padStart(2, "0");

  // GET /:accountCode/:year/:month - running ledger for a bank/cash account
  router.get("/:accountCode/:year/:month", async (req, res) => {
    try {
      const { accountCode, year, month } = req.params;

      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      // Resolve the account (also gives us its display name)
      const accountResult = await pool.query(
        `SELECT code, description, ledger_type FROM account_codes WHERE code = $1`,
        [accountCode]
      );
      if (accountResult.rows.length === 0) {
        return res.status(404).json({ message: `Account ${accountCode} not found` });
      }
      const account = accountResult.rows[0];

      // Month boundaries as plain yyyy-MM-dd strings (TZ-safe, no Date round-trip).
      // Use a half-open range [startStr, nextMonthStr) so a Dec-31 entry with a
      // time component is still included.
      const { year: y, month: m } = validation;
      const startStr = `${y}-${pad(m)}-01`;
      const nextY = m === 12 ? y + 1 : y;
      const nextM = m === 12 ? 1 : m + 1;
      const nextMonthStr = `${nextY}-${pad(nextM)}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const endStr = `${y}-${pad(m)}-${pad(lastDay)}`;

      // Opening (brought-forward) balance = net of all posted lines before the month
      const openingResult = await pool.query(
        `SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) AS opening
           FROM journal_entry_lines jel
           JOIN journal_entries je ON jel.journal_entry_id = je.id
          WHERE je.status = 'posted'
            AND jel.account_code = $1
            AND je.entry_date < $2`,
        [accountCode, startStr]
      );
      const openingBalance = parseFloat(openingResult.rows[0].opening) || 0;

      // Transactions within the month, ordered for a stable running balance
      const txResult = await pool.query(
        `SELECT
            je.id              AS journal_entry_id,
            je.reference_no    AS reference_no,
            je.entry_type      AS entry_type,
            je.entry_date      AS entry_date,
            je.description     AS entry_description,
            jel.id             AS line_id,
            jel.line_number    AS line_number,
            jel.reference      AS cheque_no,
            jel.particulars    AS particulars,
            COALESCE(jel.debit_amount, 0)  AS debit_amount,
            COALESCE(jel.credit_amount, 0) AS credit_amount
           FROM journal_entry_lines jel
           JOIN journal_entries je ON jel.journal_entry_id = je.id
          WHERE je.status = 'posted'
            AND jel.account_code = $1
            AND je.entry_date >= $2
            AND je.entry_date < $3
          ORDER BY je.entry_date ASC, je.id ASC, jel.line_number ASC`,
        [accountCode, startStr, nextMonthStr]
      );

      let running = openingBalance;
      let totalDebit = 0;
      let totalCredit = 0;

      const transactions = txResult.rows.map((row) => {
        const debit = parseFloat(row.debit_amount) || 0;
        const credit = parseFloat(row.credit_amount) || 0;
        running += debit - credit;
        totalDebit += debit;
        totalCredit += credit;
        return {
          line_id: row.line_id,
          journal_entry_id: row.journal_entry_id,
          reference_no: row.reference_no,
          entry_type: row.entry_type,
          entry_date:
            row.entry_date instanceof Date
              ? row.entry_date.toISOString().split("T")[0]
              : String(row.entry_date).split("T")[0],
          cheque_no: row.cheque_no || null,
          particulars: row.particulars || row.entry_description || "",
          debit,
          credit,
          balance: running,
        };
      });

      res.json({
        account: {
          code: account.code,
          description: account.description,
          ledger_type: account.ledger_type,
        },
        period: {
          year: y,
          month: m,
          start_date: startStr,
          end_date: endStr,
        },
        opening_balance: openingBalance,
        transactions,
        closing_balance: running,
        totals: {
          debit: totalDebit,
          credit: totalCredit,
          count: transactions.length,
        },
      });
    } catch (error) {
      console.error("Error generating bank statement:", error);
      res.status(500).json({
        message: "Error generating bank statement",
        error: error.message,
      });
    }
  });

  return router;
}
