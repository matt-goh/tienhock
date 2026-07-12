// src/routes/accounting/bank-statement.js
// Bank statement / Account Ledger from journal: a running-ledger view of any
// account (item 1B-1/1B-2) for a MONTH or an ARBITRARY DATE RANGE. Reads posted
// journal lines for the chosen account, seeds the running balance with the
// brought-forward (opening) balance (anchor-aware), and returns one row per
// transaction with a running balance. The account is treated as debit-normal
// (an asset), so a debit increases the balance and a credit decreases it.
//
// Linked accounts (PRE-CUTOVER ONLY): before the 1 June 2026 accounting
// cutover, no real RV bank-in journals exist, so the BANK_PBB ledger surfaces
// the cash-received holding accounts (CH_REV*) as synthetic money-in rows to
// keep the historical May proof intact. From the cutover onward, cash reaches
// the bank ONLY through real RV bank-in journals (DR bank / CR CH_REV*), and
// the synthetic projection is excluded from EVERY calculation path (anchor
// movement, derived opening, period rows, totals). No date can ever produce
// both a synthetic row and a real bank line.
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

const pad = (n) => String(n).padStart(2, "0");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive yyyy-MM-dd -> exclusive next-day yyyy-MM-dd (local math, no TZ). */
const nextDayStr = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
};

/**
 * Builds the running-ledger response for [startStr, endStr] (both inclusive).
 * Throws { status, message } on a missing account.
 */
async function buildLedger(pool, accountCode, startStr, endStr) {
  // Resolve the account (also gives us its display name)
  const accountResult = await pool.query(
    `SELECT code, description, ledger_type FROM account_codes WHERE code = $1`,
    [accountCode]
  );
  if (accountResult.rows.length === 0) {
    const err = new Error(`Account ${accountCode} not found`);
    err.status = 404;
    throw err;
  }
  const account = accountResult.rows[0];

  // Resolve linked accounts surfaced inside this ledger (money-in view).
  // linkedCodes only contribute lines dated BEFORE the cutover (header note);
  // swapCodes = credit-normal linked codes whose columns are swapped.
  const linkCfg = BANK_LINKED_ACCOUNTS[accountCode];
  const swapCodes = linkCfg ? linkCfg.swap : [];
  const linkedCodes = linkCfg ? [...linkCfg.swap, ...linkCfg.keep] : [];

  const nextStr = nextDayStr(endStr);

  // Line-inclusion predicate shared by every calculation path: the primary
  // account always; linked codes only before the cutover.
  const lineFilter = (p1, p2, p3) => `
          (jel.account_code = $${p1}
           OR (jel.account_code = ANY($${p2}::varchar[]) AND je.entry_date < $${p3}))`;

  // Opening (brought-forward) balance.
  // If an opening-balance anchor exists with as_of_date <= the period start, seed from
  // it and only add posted lines in [as_of_date, period_start) — everything before the
  // anchor is deliberately ignored. Otherwise fall back to the net of all posted lines
  // before the period.
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
          AND ${lineFilter(1, 5, 6)}
          AND je.entry_date >= $2
          AND je.entry_date < $3`,
      [accountCode, anchor.as_of_date, startStr, swapCodes, linkedCodes, LINKED_ACCOUNTS_CUTOFF]
    );
    openingBalance = anchorAmount + (parseFloat(sinceResult.rows[0].movement) || 0);
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

  // Transactions within the period. Journal column = the legacy-visible
  // reference (line override, then header display, then reference_no);
  // Cheque column = the persisted cheque contract with the header fallback
  // (never the Journal reference). Ordered by accounting date, persisted
  // posting sequence, then the visible reference — the legacy within-day
  // print order (verified row-by-row against the June 2026 fixtures).
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
    [accountCode, startStr, nextStr, swapCodes, linkedCodes, LINKED_ACCOUNTS_CUTOFF]
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
      internal_reference: row.internal_reference,
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

  return {
    account: {
      code: account.code,
      description: account.description,
      ledger_type: account.ledger_type,
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
  };
}

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

  // GET /usage-counts — number of posted journal lines per account code, for
  // ranking the Account Ledger "browse all accounts" list by most-used first.
  router.get("/usage-counts", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT jel.account_code AS code, COUNT(*)::int AS count
           FROM journal_entry_lines jel
           JOIN journal_entries je ON jel.journal_entry_id = je.id
          WHERE je.status = 'posted'
          GROUP BY jel.account_code`
      );
      const counts = {};
      result.rows.forEach((row) => {
        counts[row.code] = row.count;
      });
      res.json(counts);
    } catch (error) {
      console.error("Error fetching account usage counts:", error);
      res.status(500).json({
        message: "Error fetching account usage counts",
        error: error.message,
      });
    }
  });

  // GET /:accountCode/range/:start/:end — arbitrary inclusive date range
  router.get("/:accountCode/range/:start/:end", async (req, res) => {
    try {
      const { accountCode, start, end } = req.params;
      if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
        return res.status(400).json({ message: "Dates must be yyyy-MM-dd" });
      }
      if (start > end) {
        return res.status(400).json({ message: "start must be on or before end" });
      }
      const ledger = await buildLedger(pool, accountCode, start, end);
      res.json({
        ...ledger,
        period: {
          mode: "range",
          year: parseInt(start.slice(0, 4), 10),
          month: parseInt(start.slice(5, 7), 10),
          start_date: start,
          end_date: end,
        },
      });
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error generating account ledger range:", error);
      res.status(500).json({
        message: "Error generating account ledger",
        error: error.message,
      });
    }
  });

  // GET /:accountCode/:year/:month - running ledger for a calendar month
  // (kept for existing callers; equivalent to the range route over the month)
  router.get("/:accountCode/:year/:month", async (req, res) => {
    try {
      const { accountCode, year, month } = req.params;

      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const { year: y, month: m } = validation;
      const startStr = `${y}-${pad(m)}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const endStr = `${y}-${pad(m)}-${pad(lastDay)}`;

      const ledger = await buildLedger(pool, accountCode, startStr, endStr);
      res.json({
        ...ledger,
        period: {
          mode: "month",
          year: y,
          month: m,
          start_date: startStr,
          end_date: endStr,
        },
      });
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error generating bank statement:", error);
      res.status(500).json({
        message: "Error generating bank statement",
        error: error.message,
      });
    }
  });

  return router;
}
