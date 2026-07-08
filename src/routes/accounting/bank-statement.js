// src/routes/accounting/bank-statement.js
// Bank statement from journal: a running-ledger view of a single bank/cash
// account (item 1B-1). Reads posted journal lines for the chosen account in a
// month, seeds the running balance with the brought-forward (opening) balance =
// net of all posted lines before the month, and returns one row per transaction
// with a running balance. The account is treated as debit-normal (an asset), so
// a debit increases the balance and a credit decreases it.
//
// Linked accounts: some ledgers surface posted lines from other accounts as
// money-in (a bank DEBIT). BANK_PBB pulls in the cash-received accounts so the
// bank book reads as a cash book. Only the cash-received accounts (CH_REV*) are
// linked — NOT the CASH_SALES/CR_SALES revenue accounts, which are the accrual
// counterpart of the same bills and would double-count the cash collected.
// CH_REV* are already debit-normal, so their money-in DEBIT is kept as recorded.
// See BANK_LINKED_ACCOUNTS below.
import { Router } from "express";

// Per-account link config. Keyed by the primary account being viewed.
//   swap: linked codes that are credit-normal — their debit/credit columns are
//         swapped so a revenue CREDIT shows as a bank DEBIT (money in).
//   keep: linked codes that are already debit-normal — kept exactly as recorded.
// Only applies to the listed primary accounts; every other account is unaffected.
const BANK_LINKED_ACCOUNTS = {
  BANK_PBB: {
    swap: [],
    keep: ["CH_REV1", "CH_REV2"],
  },
};

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

      // Resolve linked accounts surfaced inside this ledger (money-in view).
      // allCodes = the codes whose lines appear; swapCodes = credit-normal codes
      // whose debit/credit columns are swapped so their money-in reads as a debit.
      const linkCfg = BANK_LINKED_ACCOUNTS[accountCode];
      const swapCodes = linkCfg ? linkCfg.swap : [];
      const allCodes = linkCfg
        ? [accountCode, ...linkCfg.swap, ...linkCfg.keep]
        : [accountCode];

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

      // Opening (brought-forward) balance.
      // If an opening-balance anchor exists with as_of_date <= the period start, seed from
      // it and only add posted lines in [as_of_date, period_start) — everything before the
      // anchor is deliberately ignored (discards pre-cutover/migration noise). Otherwise
      // fall back to the net of all posted lines before the month.
      const anchorResult = await pool.query(
        `SELECT to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date, amount
           FROM account_opening_balances
          WHERE account_code = $1 AND as_of_date <= $2
          ORDER BY as_of_date DESC
          LIMIT 1`,
        [accountCode, startStr]
      );

      let openingBalance;
      let openingSource;
      if (anchorResult.rows.length > 0) {
        const anchor = anchorResult.rows[0];
        const anchorAmount = parseFloat(anchor.amount) || 0;
        const sinceResult = await pool.query(
          `SELECT COALESCE(SUM(
                (CASE WHEN jel.account_code = ANY($4::varchar[]) THEN jel.credit_amount ELSE jel.debit_amount END)
              - (CASE WHEN jel.account_code = ANY($4::varchar[]) THEN jel.debit_amount ELSE jel.credit_amount END)
             ), 0) AS movement
             FROM journal_entry_lines jel
             JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.status = 'posted'
              AND jel.account_code = ANY($1::varchar[])
              AND je.entry_date >= $2
              AND je.entry_date < $3`,
          [allCodes, anchor.as_of_date, startStr, swapCodes]
        );
        openingBalance =
          anchorAmount + (parseFloat(sinceResult.rows[0].movement) || 0);
        openingSource = {
          type: "anchored",
          as_of_date: anchor.as_of_date,
          amount: anchorAmount,
        };
      } else {
        const openingResult = await pool.query(
          `SELECT COALESCE(SUM(
                (CASE WHEN jel.account_code = ANY($3::varchar[]) THEN jel.credit_amount ELSE jel.debit_amount END)
              - (CASE WHEN jel.account_code = ANY($3::varchar[]) THEN jel.debit_amount ELSE jel.credit_amount END)
             ), 0) AS opening
             FROM journal_entry_lines jel
             JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.status = 'posted'
              AND jel.account_code = ANY($1::varchar[])
              AND je.entry_date < $2`,
          [allCodes, startStr, swapCodes]
        );
        openingBalance = parseFloat(openingResult.rows[0].opening) || 0;
        openingSource = { type: "derived" };
      }

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
            jel.account_code   AS account_code,
            COALESCE(CASE WHEN jel.account_code = ANY($4::varchar[]) THEN jel.credit_amount ELSE jel.debit_amount END, 0)  AS debit_amount,
            COALESCE(CASE WHEN jel.account_code = ANY($4::varchar[]) THEN jel.debit_amount ELSE jel.credit_amount END, 0) AS credit_amount
           FROM journal_entry_lines jel
           JOIN journal_entries je ON jel.journal_entry_id = je.id
          WHERE je.status = 'posted'
            AND jel.account_code = ANY($1::varchar[])
            AND je.entry_date >= $2
            AND je.entry_date < $3
          ORDER BY je.entry_date ASC, je.id ASC, jel.line_number ASC`,
        [allCodes, startStr, nextMonthStr, swapCodes]
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
              ? `${row.entry_date.getFullYear()}-${pad(row.entry_date.getMonth() + 1)}-${pad(row.entry_date.getDate())}`
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
        opening_source: openingSource,
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
