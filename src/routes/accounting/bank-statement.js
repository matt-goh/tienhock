// src/routes/accounting/bank-statement.js
// Bank statement from journal: a running-ledger view of a single bank/cash
// account (item 1B-1). Reads posted journal lines for the chosen account in a
// month, seeds the running balance with the brought-forward (opening) balance =
// net of all posted lines before the month, and returns one row per transaction
// with a running balance. The account is treated as debit-normal (an asset), so
// a debit increases the balance and a credit decreases it.
//
// Linked accounts (PRE-CUTOVER ONLY): before the 1 June 2026 accounting
// cutover, no real RV bank-in journals exist, so the BANK_PBB ledger surfaces
// the cash-received holding accounts (CH_REV*) as synthetic money-in rows to
// keep the historical May proof intact. From the cutover onward, cash reaches
// the bank ONLY through real RV bank-in journals (DR bank / CR CH_REV*), and
// the synthetic projection is excluded from EVERY calculation path (anchor
// movement, derived opening, month rows, totals). No date can ever produce
// both a synthetic row and a real bank line: synthetic rows come from S/REC
// journals dated before the cutover, real bank lines from RV journals dated on
// or after it.
import { Router } from "express";

// Per-account link config. Keyed by the primary account being viewed.
//   swap: linked codes that are credit-normal — their debit/credit columns are
//         swapped so a revenue CREDIT shows as a bank DEBIT (money in).
//   keep: linked codes that are already debit-normal — kept exactly as recorded.
// Only applies to the listed primary accounts; every other account is unaffected.
// Linked lines are only included when je.entry_date < LINKED_ACCOUNTS_CUTOFF.
const BANK_LINKED_ACCOUNTS = {
  BANK_PBB: {
    swap: [],
    keep: ["CH_REV1", "CH_REV2"],
  },
};
const LINKED_ACCOUNTS_CUTOFF = "2026-06-01";

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
      // linkedCodes only contribute lines dated BEFORE the cutover (see the
      // header comment); swapCodes = credit-normal linked codes whose columns
      // are swapped so their money-in reads as a debit.
      const linkCfg = BANK_LINKED_ACCOUNTS[accountCode];
      const swapCodes = linkCfg ? linkCfg.swap : [];
      const linkedCodes = linkCfg ? [...linkCfg.swap, ...linkCfg.keep] : [];

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

      // Line-inclusion predicate shared by every calculation path: the primary
      // account always; linked codes only before the cutover.
      const lineFilter = (p1, p2, p3) => `
              (jel.account_code = $${p1}
               OR (jel.account_code = ANY($${p2}::varchar[]) AND je.entry_date < $${p3}))`;

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
              AND ${lineFilter(1, 5, 6)}
              AND je.entry_date >= $2
              AND je.entry_date < $3`,
          [accountCode, anchor.as_of_date, startStr, swapCodes, linkedCodes, LINKED_ACCOUNTS_CUTOFF]
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
              AND ${lineFilter(1, 4, 5)}
              AND je.entry_date < $2`,
          [accountCode, startStr, swapCodes, linkedCodes, LINKED_ACCOUNTS_CUTOFF]
        );
        openingBalance = parseFloat(openingResult.rows[0].opening) || 0;
        openingSource = { type: "derived" };
      }

      // Transactions within the month. Journal column = the legacy-visible
      // reference (line override, then header display, then reference_no);
      // Cheque column = the persisted cheque contract with the header fallback
      // (never the Journal reference). Ordered by accounting date, persisted
      // posting sequence, journal id, then line display order.
      const txResult = await pool.query(
        `SELECT
            je.id              AS journal_entry_id,
            COALESCE(jel.display_reference, je.display_reference, je.reference_no) AS reference_no,
            je.reference_no    AS internal_reference,
            je.entry_type      AS entry_type,
            je.entry_date      AS entry_date,
            je.description     AS entry_description,
            jel.id             AS line_id,
            jel.line_number    AS line_number,
            COALESCE(jel.cheque_reference, je.cheque_no) AS cheque_no,
            jel.particulars    AS particulars,
            jel.account_code   AS account_code,
            COALESCE(CASE WHEN jel.account_code = ANY($4::varchar[]) THEN jel.credit_amount ELSE jel.debit_amount END, 0)  AS debit_amount,
            COALESCE(CASE WHEN jel.account_code = ANY($4::varchar[]) THEN jel.debit_amount ELSE jel.credit_amount END, 0) AS credit_amount
           FROM journal_entry_lines jel
           JOIN journal_entries je ON jel.journal_entry_id = je.id
          WHERE je.status = 'posted'
            AND ${lineFilter(1, 5, 6)}
            AND je.entry_date >= $2
            AND je.entry_date < $3
          ORDER BY je.entry_date ASC,
                   je.posting_sequence ASC NULLS LAST,
                   COALESCE(jel.display_reference, je.display_reference, je.reference_no) ASC,
                   je.id ASC,
                   jel.display_order ASC NULLS LAST,
                   jel.line_number ASC`,
        [accountCode, startStr, nextMonthStr, swapCodes, linkedCodes, LINKED_ACCOUNTS_CUTOFF]
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
