// src/routes/greentarget/accounting/report-engine.js
//
// Green Target report engines (phase G5) — Trial Balance, Income Statement,
// Balance Sheet, and the Account Ledger / Bank Statement running ledger.
//
// This is a CLONE of the Tien Hock engines, never a parameterization of them
// (handover R1 + the G5 decision of 27 Jul 2026). Every FROM/JOIN in this file
// is schema-qualified `greentarget.`; nothing here can read or move a Tien Hock
// number, which is what makes "GT work cannot touch the audited TH books" a
// structural property rather than a promise. It is cloned rather than shared
// because the semantics genuinely differ:
//
//   * No stock, no CoGM, ever (R5 — `report_section='cogm'` is rejected by a
//     database CHECK). TH's EXACT_FISCAL_OPENING_STOCK_CTE and its
//     closing_stock_values injection are deliberately absent.
//   * Placement comes from `financial_statement_notes.statement_block`, not
//     from `category`. GT prints note 4 as a non-current asset, note 9 (Amount
//     Due To Directors) INSIDE current assets as a debit, and note 11/16 in
//     CURRENT liabilities while note 12 sits in a LONG-TERM LIABILITIES block
//     TH does not render at all. TH's nonCurrentLiabilityNotes = ["11","16"]
//     is simply wrong for GT.
//   * `fs_note` holds the printed Trial Balance APPX verbatim, which is the
//     legacy account master's own note field — NOT the statement note. Three
//     accounts disagree; see APPX_STATEMENT_OVERRIDES.
//   * A ledger orders by (month, posting_sequence, display_order). Never date.
//
// These functions are pure with respect to `pool`: the Express routers are thin
// wrappers, and dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs
// imports and RUNS them against the six printed scans. The harness therefore
// gates the shipped code, not a copy of its SQL.

/** Every table this module touches lives in this schema. Never `public`. */
export const GT_SCHEMA = "greentarget";

// ---------------------------------------------------------------------------
// The three APPX-vs-statement divergences — the whole list (G3, 26 Jul 2026)
// ---------------------------------------------------------------------------
// The Trial Balance prints each account's APPX straight from the legacy account
// master, so `account_codes.fs_note` stores the APPX. The Balance Sheet and
// Income Statement line notes are a SEPARATE statement layout, and for exactly
// three accounts the two disagree. The proof that they are different things is
// on the printed Income Statement itself: its "HIRE PURCHASE INTEREST" line
// carries no note at all, which no per-account note field could produce.
//
// All three are .00 in all six months with zero ledger rows, so this mapping is
// arithmetically free today. That is precisely why it is written down loudly
// now instead of being discovered later: `verify-legacy-reports.mjs` asserts
// both that the override is applied AND that the accounts are still dormant, so
// the day one of them moves, the gate says so.
//
// Each account also records its statement placement in `account_codes.notes`;
// the harness cross-checks this constant against that column so the two can
// never silently disagree.
export const APPX_STATEMENT_OVERRIDES = Object.freeze({
  "INPUT.TAX": Object.freeze({
    appx_note: "10", // Other Creditors
    report_section: "balance_sheet",
    statement_note: "17", // BS current assets, "INPUT TAX"
    evidence: "GT_BALANCE_SHEET.pdf line 8 prints INPUT TAX under note 17",
  }),
  FC_TL: Object.freeze({
    appx_note: "11", // Term Loans
    report_section: "income_statement",
    statement_note: "23", // IS finance costs, "TERM LOAN"
    evidence: "GT_INCOME_STATEMENT.pdf line 28 prints TERM LOAN under note 23",
  }),
  FC_HP: Object.freeze({
    appx_note: "16", // Hire Purchase Payable
    report_section: "income_statement",
    statement_note: null, // the printed line carries NO note
    synthetic: Object.freeze({
      name: "HIRE PURCHASE INTEREST",
      statement_block: "finance_costs",
      normal_balance: "debit",
      // Prints immediately before TERM LOAN (note 23, sort_order 900).
      sort_order: 899,
    }),
    evidence:
      "GT_INCOME_STATEMENT.pdf line 27 prints HIRE PURCHASE INTEREST with no note; " +
      "GT's note 23 is Term Loan (TH's 23 is Hire Purchase Interest — the documented collision)",
  }),
});

// ---------------------------------------------------------------------------
// Printed statement layout — transcribed from the scans (G1 fixtures)
// ---------------------------------------------------------------------------
// Which blocks print, in which order, under which headings. The LINES inside a
// block, and their order, come from the note catalogue (`statement_block` +
// `sort_order`), which G2 seeded in printed order — so the layout is data, not
// a list of note codes maintained here.

/** @type {ReadonlyArray<{block: string, headings: string[], subtotal_ref: string|null}>} */
export const INCOME_STATEMENT_BLOCKS = Object.freeze([
  { block: "revenue", headings: [], subtotal_ref: null },
  { block: "direct_costs", headings: ["LESS: DIRECT COSTS"], subtotal_ref: "direct_costs_total" },
  { block: "other_operating_income", headings: ["ADD:OTHER OPERATING INCOME"], subtotal_ref: "other_income_total" },
  { block: "administrative_expenses", headings: ["LESS:ADMINISTRATIVE EXPENSES"], subtotal_ref: null },
  { block: "finance_costs", headings: ["LESS:FINANCE COSTS", "INTEREST EXPENSES"], subtotal_ref: "finance_costs_total" },
  { block: "tax", headings: [], subtotal_ref: null },
].map(Object.freeze));

/**
 * `subtotal_sign` reproduces the legacy printer's TWO uses of brackets, which
 * the G1 fixtures record as `bracketConvention`. On a LINE a bracket is an
 * ordinary sign (TRADE PAYABLE "( 5,621.20)" is a debit balance sitting in a
 * payable account). On the CURRENT LIABILITIES SUBTOTAL it is a "less" marker:
 * the lines above sum to +85,945.05 and the subtotal prints ( 85,945.05), so
 * that one subtotal is the NEGATED sum of its lines. The long-term block's
 * single bracketed line and bracketed subtotal already agree in sign.
 * @type {ReadonlyArray<{block: string, headings: string[], subtotal_ref: string|null, subtotal_sign: 1|-1}>}
 */
export const BALANCE_SHEET_BLOCKS = Object.freeze([
  { block: "non_current_assets", headings: ["NON-CURRENT ASSET"], subtotal_ref: null, subtotal_sign: 1 },
  { block: "current_assets", headings: ["CURRENT ASSETS"], subtotal_ref: "current_assets_total", subtotal_sign: 1 },
  { block: "current_liabilities", headings: ["LESS:CURRENT LIABILITIES"], subtotal_ref: "current_liabilities_total", subtotal_sign: -1 },
  { block: "equity", headings: ["FINANCED BY"], subtotal_ref: "shareholders_funds_total", subtotal_sign: 1 },
  { block: "long_term_liabilities", headings: ["LONG-TERM LIABILITIES"], subtotal_ref: "long_term_liabilities_total", subtotal_sign: 1 },
].map(Object.freeze));

/**
 * The Balance Sheet's profit line. It is NOT a note: the scan prints "DN" in
 * the note column, which G2 established is a printer marker and deliberately
 * did not create as a note code. Its amount is the Income Statement's
 * "PROFIT FOR THE FINANCIAL YEAR", taken from the same engine call so the two
 * statements cannot drift apart.
 */
const CURRENT_YEAR_PROFIT_LINE = Object.freeze({
  name: "PROFIT FOR THE FINANCIAL YEAR",
  statement_block: "equity",
  // Prints after SHARE CAPITAL (21, sort 300) and RETAINED PROFIT B/F (20, 301).
  sort_order: 302,
  note_marker: "DN",
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Round to whole cents. Every amount this module emits passes through here, so
 * downstream JS sums are over exact cent multiples and cannot accumulate a
 * float residue that a harness would then have to tolerate.
 * @param {number} value
 * @returns {number}
 */
const money = (value) => Math.round(value * 100) / 100;

/** pg returns `numeric` as a string; `null` for a missing aggregate. */
const num = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Local yyyy-MM-dd year-to-date bounds (Jan 1 -> last day of `month`).
 * Never derived through toISOString(): the server runs in UTC+8, so that would
 * shift Jan 1 back to Dec 31 and drop the last day of the month (rule 17).
 * @param {number} year
 * @param {number} month
 * @returns {{ startStr: string, endStr: string }}
 */
export function getYtdPeriod(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startStr: `${year}-01-01`,
    endStr: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/**
 * Inclusive local yyyy-MM-dd bounds of one calendar month.
 * @param {number} year
 * @param {number} month
 * @returns {{ startStr: string, endStr: string }}
 */
export function getMonthPeriod(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startStr: `${year}-${pad(month)}-01`,
    endStr: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/**
 * @param {string|number} year
 * @param {string|number} month
 * @returns {{ valid: true, year: number, month: number } | { valid: false, error: string }}
 */
export function validateYearMonth(year, month) {
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
    return { valid: false, error: "Invalid year. Must be between 1900 and 2100." };
  }
  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
    return { valid: false, error: "Invalid month. Must be between 1 and 12." };
  }
  return { valid: true, year: yearNum, month: monthNum };
}

/** @param {string} value */
export const isDateString = (value) => DATE_RE.test(value);

// ---------------------------------------------------------------------------
// The anchored-balance CTEs — and the mechanism that makes BTFS print blank
// ---------------------------------------------------------------------------
// As-of semantics: for each account take the latest opening anchor on or before
// the period end and add only posted movement from that anchor date onward. An
// unanchored account starts at $1 (Jan 1).
//
// ⚠ The final `WHERE ap.anchor_date IS NOT NULL OR am.code IS NOT NULL` is
// load-bearing and must never become a COALESCE over the full chart. `BTFS`
// "BATTERY FORKLIFT (KB)" is the one account all six Trial Balance scans print
// with DEBIT and CREDIT genuinely BLANK rather than .00. G3 carries it in the
// chart and G4 deliberately gave it NO anchor and NO journal line, so its
// ABSENCE here is exactly what reproduces that printing. An engine that LEFT
// JOINed the whole chart and defaulted a missing balance to 0.00 would turn its
// blanks into .00 silently.
//
// $1 = period start (Jan 1), $2 = period end.
const ANCHORED_ACCOUNT_BALANCES_CTES = `
        latest_anchors AS (
          SELECT DISTINCT ON (aob.account_code)
            aob.account_code,
            aob.as_of_date,
            aob.amount
          FROM greentarget.account_opening_balances aob
          WHERE aob.as_of_date <= $2::date
          ORDER BY aob.account_code, aob.as_of_date DESC
        ),
        account_periods AS (
          SELECT
            ac.code,
            la.as_of_date AS anchor_date,
            la.amount AS anchor_amount,
            COALESCE(la.as_of_date, $1::date) AS movement_start
          FROM greentarget.account_codes ac
          LEFT JOIN latest_anchors la ON la.account_code = ac.code
          WHERE ac.is_active = true
        ),
        account_movements AS (
          SELECT
            ap.code,
            SUM(
              COALESCE(jel.debit_amount, 0)
              - COALESCE(jel.credit_amount, 0)
            ) AS net
          FROM account_periods ap
          JOIN greentarget.journal_entry_lines jel ON jel.account_code = ap.code
          JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.status = 'posted'
            AND je.entry_date >= ap.movement_start
            AND je.entry_date <= $2::date
          GROUP BY ap.code
        ),
        account_balances AS (
          SELECT
            ap.code,
            COALESCE(ap.anchor_amount, 0) + COALESCE(am.net, 0) AS net
          FROM account_periods ap
          LEFT JOIN account_movements am ON am.code = ap.code
          WHERE ap.anchor_date IS NOT NULL OR am.code IS NOT NULL
        )`;

// ===========================================================================
// TRIAL BALANCE
// ===========================================================================

/**
 * Year-to-date Trial Balance as of the end of `month`.
 *
 * Two GT-specific behaviours worth knowing:
 *
 * 1. Rows are ordered by `account_codes.sort_order`, which G3 loaded as the
 *    PRINTED Trial Balance line number (1..475, debtor children 1001..1028).
 *    Tien Hock orders by (ledger_type, code); that would not reproduce the
 *    printed page.
 * 2. The 28 `TD` debtor children collapse into the single printed
 *    "DEBTOR / TRADE DEBTOR / APPX 22" control row, using the real DEBTOR
 *    account's own description, note and printed position. Because that row is
 *    a NET, the two debtor credit balances (KBOX -0.01, RUMAH MERAH -1.00) are
 *    absorbed into it — which is why the grouped grand total equals the printed
 *    grand total exactly, while itemizing with `ledgerType='TD'` yields a total
 *    exactly 1.01 higher. Neither figure is wrong; they are different reports.
 *
 * @param {import("pg").Pool} pool
 * @param {{ year: number, month: number, ledgerType?: string|null, search?: string|null,
 *           hideZero?: boolean, limit?: number|null, offset?: number }} options
 */
export async function buildTrialBalance(pool, options) {
  const {
    year,
    month,
    ledgerType = null,
    search = null,
    hideZero = false,
    limit = null,
    offset = 0,
  } = options;

  const { startStr, endStr } = getYtdPeriod(year, month);

  const baseParams = [startStr, endStr];
  let ledgerFilter = "";
  if (ledgerType) {
    baseParams.push(ledgerType);
    ledgerFilter = ` AND ac.ledger_type = $${baseParams.length}`;
  }

  // Filtering to TD itemizes every debtor child instead of netting them.
  const groupTd = ledgerType !== "TD";

  const baseCte = `
    WITH ${ANCHORED_ACCOUNT_BALANCES_CTES},
    raw_accounts AS (
      SELECT
        ac.code,
        ac.description,
        ac.ledger_type,
        ac.fs_note,
        fsn.name AS note_name,
        fsn.normal_balance,
        ac.sort_order,
        ab.net
      FROM account_balances ab
      JOIN greentarget.account_codes ac ON ac.code = ab.code
      LEFT JOIN greentarget.financial_statement_notes fsn ON fsn.code = ac.fs_note
      WHERE ac.is_active = true${ledgerFilter}
    ),
    active_accounts AS (
      ${
        groupTd
          ? `SELECT * FROM raw_accounts WHERE ledger_type IS DISTINCT FROM 'TD'
             UNION ALL
             SELECT
               dc.code,
               dc.description,
               dc.ledger_type,
               dc.fs_note,
               dcn.name AS note_name,
               dcn.normal_balance,
               dc.sort_order,
               SUM(r.net) AS net
             FROM raw_accounts r
             CROSS JOIN greentarget.account_codes dc
             LEFT JOIN greentarget.financial_statement_notes dcn ON dcn.code = dc.fs_note
             WHERE r.ledger_type = 'TD'
               AND dc.code = 'DEBTOR'
             GROUP BY dc.code, dc.description, dc.ledger_type, dc.fs_note,
                      dcn.name, dcn.normal_balance, dc.sort_order
             HAVING COUNT(*) > 0`
          : `SELECT * FROM raw_accounts`
      }
    )`;

  const totalsResult = await pool.query(
    `${baseCte}
     SELECT
       COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0) AS total_debit,
       COALESCE(SUM(CASE WHEN net < 0 THEN -net ELSE 0 END), 0) AS total_credit
     FROM active_accounts`,
    baseParams
  );
  const totalDebit = money(num(totalsResult.rows[0].total_debit));
  const totalCredit = money(num(totalsResult.rows[0].total_credit));

  const rowParams = [...baseParams];
  let rowsQuery = `${baseCte}
     SELECT *, COUNT(*) OVER() AS full_count
     FROM active_accounts
     WHERE 1=1`;

  if (search) {
    // Escape ILIKE wildcards so a search for "CD_" matches literally.
    const escaped = String(search).replace(/[\\%_]/g, (m) => `\\${m}`);
    rowParams.push(`%${escaped}%`);
    rowsQuery += ` AND (code ILIKE $${rowParams.length} OR description ILIKE $${rowParams.length} OR fs_note ILIKE $${rowParams.length})`;
  }
  if (hideZero) {
    rowsQuery += ` AND ABS(net) > 0.001`;
  }

  // The printed order (see the doc comment).
  rowsQuery += ` ORDER BY sort_order ASC NULLS LAST, code ASC`;

  if (Number.isInteger(limit) && limit > 0) {
    rowParams.push(limit, offset);
    rowsQuery += ` LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`;
  }

  const result = await pool.query(rowsQuery, rowParams);
  const filteredTotal = result.rows.length > 0 ? parseInt(result.rows[0].full_count, 10) : 0;

  const accounts = result.rows.map((row) => {
    const net = money(num(row.net));
    return {
      code: row.code,
      description: row.description,
      ledger_type: row.ledger_type,
      fs_note: row.fs_note,
      note_name: row.note_name,
      sort_order: row.sort_order === null ? null : Number(row.sort_order),
      debit: net > 0 ? net : 0,
      credit: net < 0 ? Math.abs(net) : 0,
      balance: row.normal_balance === "credit" ? -net : net,
    };
  });

  return {
    period: { year, month, start_date: startStr, end_date: endStr },
    accounts,
    pagination: {
      total: filteredTotal,
      limit: Number.isInteger(limit) && limit > 0 ? limit : null,
      offset,
    },
    totals: {
      debit: totalDebit,
      credit: totalCredit,
      difference: money(Math.abs(totalDebit - totalCredit)),
      is_balanced: Math.abs(totalDebit - totalCredit) < 0.005,
    },
  };
}

// ===========================================================================
// Shared statement plumbing
// ===========================================================================

/**
 * The active note catalogue, keyed by code.
 * @param {import("pg").Pool} pool
 */
async function fetchNotes(pool) {
  const result = await pool.query(
    `SELECT code, name, description, category, report_section, statement_block,
            normal_balance, sort_order, parent_note
       FROM greentarget.financial_statement_notes
      WHERE is_active = true
      ORDER BY sort_order, code`
  );
  return new Map(result.rows.map((row) => [row.code, row]));
}

/**
 * Posted movement per account over [start, end]. This is the P&L measure: no
 * anchor is added. Every GT income-statement account opens at 0.00 on
 * 2026-01-01 (proved in G3, re-asserted in G4 and by the G5 harness), so this
 * is also what makes the Balance Sheet balance by construction — see
 * buildBalanceSheet.
 * @param {import("pg").Pool} pool
 */
async function fetchAccountMovements(pool, startStr, endStr) {
  const result = await pool.query(
    `SELECT
       ac.code,
       ac.description,
       ac.fs_note,
       SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) AS net
     FROM greentarget.account_codes ac
     JOIN greentarget.journal_entry_lines jel ON jel.account_code = ac.code
     JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted'
       AND ac.is_active = true
       AND je.entry_date >= $1::date
       AND je.entry_date <= $2::date
     GROUP BY ac.code, ac.description, ac.fs_note`,
    [startStr, endStr]
  );
  return result.rows.map((row) => ({ ...row, net: money(num(row.net)) }));
}

/**
 * As-of anchored balance per account. Only accounts with an anchor or posted
 * movement are returned — see the note on ANCHORED_ACCOUNT_BALANCES_CTES.
 * @param {import("pg").Pool} pool
 */
async function fetchAccountBalances(pool, startStr, endStr) {
  const result = await pool.query(
    `WITH ${ANCHORED_ACCOUNT_BALANCES_CTES}
     SELECT ac.code, ac.description, ac.fs_note, ab.net
       FROM account_balances ab
       JOIN greentarget.account_codes ac ON ac.code = ab.code
      WHERE ac.is_active = true`,
    [startStr, endStr]
  );
  return result.rows.map((row) => ({ ...row, net: money(num(row.net)) }));
}

/**
 * Where does one account's amount print? Applies the three documented
 * APPX-vs-statement overrides, then falls back to the account's own APPX.
 *
 * @param {string} code
 * @param {string|null} fsNote
 * @param {Map<string, any>} notes
 * @param {"income_statement"|"balance_sheet"} section
 * @returns {{ kind: "note", note: any } | { kind: "synthetic", line: any, account: string }
 *          | { kind: "other_section" } | { kind: "unmapped", reason: string }}
 */
function resolvePlacement(code, fsNote, notes, section) {
  const override = APPX_STATEMENT_OVERRIDES[code];
  if (override) {
    if (override.report_section !== section) return { kind: "other_section" };
    if (override.statement_note === null) {
      return { kind: "synthetic", line: override.synthetic, account: code };
    }
    const note = notes.get(override.statement_note);
    if (!note) {
      return { kind: "unmapped", reason: `override target note ${override.statement_note} is missing or inactive` };
    }
    return { kind: "note", note };
  }

  if (!fsNote) return { kind: "unmapped", reason: "account has no fs_note" };
  const note = notes.get(fsNote);
  if (!note) return { kind: "unmapped", reason: `fs_note ${fsNote} is unknown or inactive` };
  if (note.report_section !== section) return { kind: "other_section" };
  return { kind: "note", note };
}

/** Presented amount: credit-normal lines print as the negated debit balance. */
const present = (net, normalBalance) => money(normalBalance === "credit" ? -net : net);

/**
 * Fold accounts into statement lines for one section, applying the overrides.
 * Every ACTIVE note of the section gets a line even at .00, because the printed
 * statements list them all.
 *
 * @returns {{ lines: any[], unmapped: any[], overrideAudit: any[] }}
 */
function foldIntoLines(accounts, notes, section) {
  /** @type {Map<string, any>} */
  const lines = new Map();

  for (const note of notes.values()) {
    if (note.report_section !== section) continue;
    lines.set(`note:${note.code}`, {
      note: note.code,
      note_marker: null,
      name: note.name,
      statement_block: note.statement_block,
      sort_order: Number(note.sort_order),
      normal_balance: note.normal_balance,
      net: 0,
      accounts: [],
    });
  }

  const unmapped = [];
  const overrideAudit = [];

  for (const account of accounts) {
    const placement = resolvePlacement(account.code, account.fs_note, notes, section);

    if (placement.kind === "other_section") continue;
    if (placement.kind === "unmapped") {
      // Only a nonzero orphan can move a printed figure; a dormant one is noise.
      if (account.net !== 0) {
        unmapped.push({
          code: account.code,
          description: account.description,
          fs_note: account.fs_note,
          amount: account.net,
          reason: placement.reason,
        });
      }
      continue;
    }

    let key;
    if (placement.kind === "synthetic") {
      key = `synthetic:${placement.account}`;
      if (!lines.has(key)) {
        lines.set(key, {
          note: null,
          note_marker: null,
          name: placement.line.name,
          statement_block: placement.line.statement_block,
          sort_order: placement.line.sort_order,
          normal_balance: placement.line.normal_balance,
          net: 0,
          accounts: [],
        });
      }
    } else {
      key = `note:${placement.note.code}`;
    }

    const line = lines.get(key);
    line.net = money(line.net + account.net);
    line.accounts.push(account.code);

    const override = APPX_STATEMENT_OVERRIDES[account.code];
    if (override) {
      overrideAudit.push({
        account: account.code,
        appx_note: override.appx_note,
        statement_note: override.statement_note,
        statement_block: line.statement_block,
        statement_line: line.name,
        amount: account.net,
      });
    }
  }

  return { lines: [...lines.values()], unmapped, overrideAudit };
}

/**
 * A synthetic line for an override account is only created when that account
 * has activity in the period. The printed statement shows the line regardless
 * (at .00), so ensure it exists.
 */
function ensureSyntheticLines(lines, section) {
  for (const [code, override] of Object.entries(APPX_STATEMENT_OVERRIDES)) {
    if (override.report_section !== section || override.statement_note !== null) continue;
    if (lines.some((line) => line.name === override.synthetic.name)) continue;
    lines.push({
      note: null,
      note_marker: null,
      name: override.synthetic.name,
      statement_block: override.synthetic.statement_block,
      sort_order: override.synthetic.sort_order,
      normal_balance: override.synthetic.normal_balance,
      net: 0,
      accounts: [],
      placeholder_for: code,
    });
  }
  return lines;
}

/** Group lines into the printed blocks, in printed order. */
function assembleBlocks(lines, blockSpecs) {
  const byBlock = new Map(blockSpecs.map((spec) => [spec.block, []]));
  for (const line of lines) {
    const bucket = byBlock.get(line.statement_block);
    if (bucket) bucket.push(line);
  }

  return blockSpecs.map((spec) => {
    const items = byBlock
      .get(spec.block)
      .sort((a, b) => a.sort_order - b.sort_order || String(a.name).localeCompare(String(b.name)))
      .map((line) => ({
        note: line.note,
        note_marker: line.note_marker,
        name: line.name,
        amount: present(line.net, line.normal_balance),
        accounts: line.accounts,
      }));

    const sum = money(items.reduce((total, item) => total + item.amount, 0));
    const sign = spec.subtotal_sign ?? 1;

    return {
      block: spec.block,
      headings: spec.headings,
      subtotal_ref: spec.subtotal_ref,
      items,
      total: money(sign * sum),
    };
  });
}

const blockTotal = (blocks, name) => blocks.find((block) => block.block === name)?.total ?? 0;

// ===========================================================================
// INCOME STATEMENT
// ===========================================================================

/**
 * Year-to-date Income Statement, Jan 1 -> end of `month`.
 *
 * YTD is not a choice — it is what the legacy printer produces. The June scan's
 * header reads "FOR THE MONTH OF 06/2026" but its revenue of 265,208.20 is the
 * SIX-MONTH movement of TGA + TGB + WS_OTH + WS_OTH4, and page 2 is titled
 * "PROFIT FOR THE FINANCIAL YEAR". The Trial Balances carry the same misleading
 * header over the same cumulative figures (handover §9, G1).
 *
 * @param {import("pg").Pool} pool
 * @param {{ year: number, month: number }} options
 */
export async function buildIncomeStatement(pool, { year, month }) {
  const { startStr, endStr } = getYtdPeriod(year, month);

  const [notes, movements] = await Promise.all([
    fetchNotes(pool),
    fetchAccountMovements(pool, startStr, endStr),
  ]);

  const { lines, unmapped, overrideAudit } = foldIntoLines(movements, notes, "income_statement");
  const blocks = assembleBlocks(
    ensureSyntheticLines(lines, "income_statement"),
    INCOME_STATEMENT_BLOCKS
  );

  const revenue = blockTotal(blocks, "revenue");
  const directCosts = blockTotal(blocks, "direct_costs");
  const grossProfit = money(revenue - directCosts);
  const otherIncome = blockTotal(blocks, "other_operating_income");
  const afterOtherIncome = money(grossProfit + otherIncome);
  const administrative = blockTotal(blocks, "administrative_expenses");
  const operatingProfit = money(afterOtherIncome - administrative);
  const financeCosts = blockTotal(blocks, "finance_costs");
  const profitBeforeTaxation = money(operatingProfit - financeCosts);
  const tax = blockTotal(blocks, "tax");
  const profitForTheFinancialYear = money(profitBeforeTaxation - tax);

  return {
    period: { year, month, start_date: startStr, end_date: endStr, basis: "year_to_date" },
    blocks,
    subtotals: {
      direct_costs_total: directCosts,
      gross_profit: grossProfit,
      other_income_total: otherIncome,
      after_other_income: afterOtherIncome,
      administrative_expenses_total: administrative,
      operating_profit: operatingProfit,
      finance_costs_total: financeCosts,
      profit_before_taxation: profitBeforeTaxation,
      tax_total: tax,
      profit_for_the_financial_year: profitForTheFinancialYear,
    },
    unmapped_accounts: unmapped,
    override_audit: overrideAudit,
  };
}

// ===========================================================================
// BALANCE SHEET
// ===========================================================================

/**
 * Balance Sheet as of the end of `month`.
 *
 * The profit line is the Income Statement's own
 * `profit_for_the_financial_year`, taken from the same engine call rather than
 * recomputed, so the two statements cannot drift apart.
 *
 * Why it balances: a balanced trial balance means every account's as-of net
 * sums to zero, so Σ(balance-sheet accounts) = -Σ(income-statement accounts).
 * Every GT income-statement account opens at 0.00 on 2026-01-01, so its as-of
 * net equals its period movement, and -Σ(movement) is exactly the presented
 * profit. `is_balanced` is therefore a real gate on that invariant, not
 * decoration: if an income-statement account ever acquires a nonzero opening
 * anchor, this stops balancing and says so.
 *
 * @param {import("pg").Pool} pool
 * @param {{ year: number, month: number }} options
 */
export async function buildBalanceSheet(pool, { year, month }) {
  const { startStr, endStr } = getYtdPeriod(year, month);

  const [notes, balances, incomeStatement] = await Promise.all([
    fetchNotes(pool),
    fetchAccountBalances(pool, startStr, endStr),
    buildIncomeStatement(pool, { year, month }),
  ]);

  const { lines, unmapped, overrideAudit } = foldIntoLines(balances, notes, "balance_sheet");

  const profit = incomeStatement.subtotals.profit_for_the_financial_year;
  lines.push({
    note: null,
    note_marker: CURRENT_YEAR_PROFIT_LINE.note_marker,
    name: CURRENT_YEAR_PROFIT_LINE.name,
    statement_block: CURRENT_YEAR_PROFIT_LINE.statement_block,
    sort_order: CURRENT_YEAR_PROFIT_LINE.sort_order,
    // Already presented by the Income Statement; keep it as-is.
    normal_balance: "debit",
    net: profit,
    accounts: [],
  });

  const blocks = assembleBlocks(
    ensureSyntheticLines(lines, "balance_sheet"),
    BALANCE_SHEET_BLOCKS
  );

  const nonCurrentAssets = blockTotal(blocks, "non_current_assets");
  const currentAssets = blockTotal(blocks, "current_assets");
  const currentLiabilities = blockTotal(blocks, "current_liabilities");
  const netCurrentAssets = money(currentAssets + currentLiabilities);
  const netAssets = money(nonCurrentAssets + netCurrentAssets);
  const shareholdersFunds = blockTotal(blocks, "equity");
  const longTermLiabilities = blockTotal(blocks, "long_term_liabilities");
  const financedBy = money(shareholdersFunds + longTermLiabilities);

  return {
    period: { year, month, start_date: startStr, as_of_date: endStr },
    blocks,
    subtotals: {
      non_current_assets_total: nonCurrentAssets,
      current_assets_total: currentAssets,
      current_liabilities_total: currentLiabilities,
      net_current_assets: netCurrentAssets,
      net_assets: netAssets,
      shareholders_funds_total: shareholdersFunds,
      long_term_liabilities_total: longTermLiabilities,
      financed_by: financedBy,
    },
    profit_for_the_financial_year: profit,
    unmapped_accounts: unmapped,
    override_audit: overrideAudit,
    is_balanced: Math.abs(netAssets - financedBy) < 0.005,
  };
}

// ===========================================================================
// ACCOUNT LEDGER / BANK STATEMENT
// ===========================================================================
//
// One engine serves both pages, exactly as on Tien Hock — where the page is
// called "Account Ledger" and its backend is `bank-statement.js`. A GT bank
// statement is this ledger pointed at one of the five APPX-19 `BK` accounts.
//
// ⚠ Row order is (month, posting_sequence, display_order) — NEVER date.
// Green Target's legacy report orders an account's rows by month and then by
// document type: JWDR/06/26 dated 30 Jun prints BEFORE PBEB004/06 dated 12 Jun.
// Only 477 of 502 printed sections are date-monotonic; all 502 are
// month-monotonic. G4 measured that ordering journals by (month, journal_ref)
// in C collation reproduces all 502 printed sections with zero violations, and
// stored that ordinal in `posting_sequence`. A date sort silently prints the
// wrong order, and nothing about the totals would reveal it.

/**
 * List every account for the ledger picker, with its posted-line count.
 * @param {import("pg").Pool} pool
 */
export async function listLedgerAccounts(pool) {
  const result = await pool.query(
    `WITH gl_usage AS (
       SELECT jel.account_code, COUNT(*)::int AS transaction_count
         FROM greentarget.journal_entry_lines jel
         JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
        GROUP BY jel.account_code
     ), subledger_usage AS (
       SELECT jel.debtor_subledger_code AS code,
              COUNT(*)::int AS transaction_count
         FROM greentarget.journal_entry_lines jel
         JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
          AND jel.debtor_subledger_code IS NOT NULL
        GROUP BY jel.debtor_subledger_code
     )
     SELECT *
       FROM (
         SELECT ac.code, ac.description, ac.ledger_type, ac.parent_code,
                ac.level, ac.sort_order, ac.is_active, ac.is_system, ac.fs_note,
                COALESCE(usage.transaction_count, 0)::int AS transaction_count,
                false AS is_subledger
           FROM greentarget.account_codes ac
           LEFT JOIN gl_usage usage ON usage.account_code = ac.code
          WHERE ac.is_active = true

         UNION ALL

         SELECT registry.code, registry.description, 'TD'::varchar AS ledger_type,
                'CD_SD'::varchar AS parent_code, 3 AS level,
                registry.sort_order, registry.is_active, false AS is_system,
                '22'::varchar AS fs_note,
                COALESCE(usage.transaction_count, 0)::int AS transaction_count,
                true AS is_subledger
           FROM greentarget.debtor_subledger_registry registry
           LEFT JOIN subledger_usage usage ON usage.code = registry.code
          WHERE registry.kind = 'sundry'
            AND registry.is_active = true
       ) accounts
      ORDER BY is_subledger, sort_order ASC NULLS LAST, code ASC`
  );
  return result.rows.map((row) => ({
    ...row,
    level: row.level === null ? null : Number(row.level),
    sort_order: row.sort_order === null ? null : Number(row.sort_order),
  }));
}

/**
 * Running ledger for one account over [startStr, endStr], both inclusive.
 * The account is treated as debit-normal: a debit raises the running balance.
 *
 * Opening balance: if an anchor exists on or before the period start, seed from
 * it and add only posted lines in [anchor, start) — everything before the
 * anchor is deliberately ignored. Otherwise fall back to the net of all posted
 * lines before the period.
 *
 * `is_derived` marks the 1,433 CD_SD counter-cash legs that G4 synthesised with
 * the user's approval on 26 Jul 2026. They are ordinary posted lines and are
 * included in every balance and total; the flag exists because the legacy
 * export prints no cash-in-hand leg at all, so CD_SD's ledger legitimately
 * shows 1,433 rows that appear on no scan. It is resolved by joining the
 * journal's staging group key back to `import_legacy_rows`, not by matching the
 * "(DERIVED - COUNTER CASH …)" suffix on the particulars — a correctness signal
 * should not hang off free text.
 *
 * @param {import("pg").Pool} pool
 * @param {string} accountCode
 * @param {string} startStr yyyy-MM-dd
 * @param {string} endStr yyyy-MM-dd
 */
export async function buildAccountLedger(pool, accountCode, startStr, endStr) {
  const accountResult = await pool.query(
    `SELECT code, description, ledger_type, fs_note, parent_code, false AS is_subledger
       FROM greentarget.account_codes
      WHERE code = $1 AND is_active = true

     UNION ALL

     SELECT registry.code, registry.description, 'TD'::varchar AS ledger_type,
            '22'::varchar AS fs_note, 'CD_SD'::varchar AS parent_code,
            true AS is_subledger
       FROM greentarget.debtor_subledger_registry registry
      WHERE registry.code = $1
        AND registry.kind = 'sundry'
        AND registry.is_active = true
     LIMIT 1`,
    [accountCode]
  );
  if (accountResult.rows.length === 0) {
    const error = new Error(`Account ${accountCode} not found`);
    error.status = 404;
    throw error;
  }
  const account = accountResult.rows[0];
  const isSubledger = account.is_subledger === true;

  const anchorResult = await pool.query(
    `SELECT to_char(anchor_date, 'YYYY-MM-DD') AS as_of_date, amount
       FROM (
         SELECT as_of_date AS anchor_date, amount
           FROM greentarget.account_opening_balances
          WHERE $3::boolean = false
            AND account_code = $1
            AND as_of_date <= $2::date

         UNION ALL

         SELECT (as_of_month + INTERVAL '1 month')::date AS anchor_date,
                closing_balance AS amount
           FROM greentarget.debtor_subledger_snapshots
          WHERE $3::boolean = true
            AND account_code = $1
            AND (as_of_month + INTERVAL '1 month')::date <= $2::date
       ) anchors
      ORDER BY anchor_date DESC
      LIMIT 1`,
    [accountCode, startStr, isSubledger]
  );

  let openingBalance;
  let openingSource;
  if (anchorResult.rows.length > 0) {
    const anchor = anchorResult.rows[0];
    const anchorAmount = money(num(anchor.amount));
    const sinceResult = await pool.query(
      `SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) AS movement
         FROM greentarget.journal_entry_lines jel
         JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
          AND (
            ($4::boolean = false AND jel.account_code = $1)
            OR
            ($4::boolean = true AND (
              jel.debtor_subledger_code = $1 OR jel.account_code = $1
            ))
          )
          AND je.entry_date >= $2::date
          AND je.entry_date < $3::date`,
      [accountCode, anchor.as_of_date, startStr, isSubledger]
    );
    openingBalance = money(anchorAmount + num(sinceResult.rows[0].movement));
    openingSource = { type: "anchored", as_of_date: anchor.as_of_date, amount: anchorAmount };
  } else {
    const openingResult = await pool.query(
      `SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) AS opening
         FROM greentarget.journal_entry_lines jel
         JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
          AND (
            ($3::boolean = false AND jel.account_code = $1)
            OR
            ($3::boolean = true AND (
              jel.debtor_subledger_code = $1 OR jel.account_code = $1
            ))
          )
          AND je.entry_date < $2::date`,
      [accountCode, startStr, isSubledger]
    );
    openingBalance = money(num(openingResult.rows[0].opening));
    openingSource = { type: "derived" };
  }

  const txResult = await pool.query(
    `SELECT
       je.id                AS journal_entry_id,
       COALESCE(jel.display_reference, je.display_reference, je.reference_no) AS reference_no,
       je.reference_no      AS internal_reference,
       je.entry_type        AS entry_type,
       je.legacy_entry_type AS legacy_entry_type,
       to_char(je.entry_date, 'YYYY-MM-DD') AS entry_date,
       je.description       AS entry_description,
       je.posting_sequence  AS posting_sequence,
       je.source_type       AS source_type,
       je.source_id         AS source_id,
       jel.id               AS line_id,
       jel.line_number      AS line_number,
       jel.display_order    AS display_order,
       COALESCE(jel.cheque_reference, je.cheque_no) AS cheque_no,
       jel.particulars      AS particulars,
       jel.account_code     AS account_code,
       COALESCE(jel.debit_amount, 0)  AS debit_amount,
       COALESCE(jel.credit_amount, 0) AS credit_amount,
       EXISTS (
         SELECT 1
           FROM greentarget.import_legacy_rows staged
          WHERE je.source_type = 'legacy_import'
            AND staged.source_kind = 'DERIVED'
            AND staged.record_kind = 'transaction'
            AND staged.journal_group_key = je.source_id
            AND staged.account_code = jel.account_code
       ) AS is_derived
     FROM greentarget.journal_entry_lines jel
     JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted'
       AND (
         ($4::boolean = false AND jel.account_code = $1)
         OR
         ($4::boolean = true AND (
           jel.debtor_subledger_code = $1 OR jel.account_code = $1
         ))
       )
       AND je.entry_date >= $2::date
       AND je.entry_date <= $3::date
     ORDER BY DATE_TRUNC('month', je.entry_date) ASC,
              je.posting_sequence ASC NULLS LAST,
              je.entry_date ASC,
              je.id ASC,
              jel.display_order ASC NULLS LAST,
              jel.line_number ASC,
              jel.id ASC`,
    [accountCode, startStr, endStr, isSubledger]
  );

  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const transactions = txResult.rows.map((row) => {
    const debit = money(num(row.debit_amount));
    const credit = money(num(row.credit_amount));
    running = money(running + debit - credit);
    totalDebit = money(totalDebit + debit);
    totalCredit = money(totalCredit + credit);
    return {
      line_id: row.line_id,
      journal_entry_id: row.journal_entry_id,
      reference_no: row.reference_no,
      internal_reference: row.internal_reference,
      entry_type: row.entry_type,
      legacy_entry_type: row.legacy_entry_type,
      entry_date: row.entry_date,
      cheque_no: row.cheque_no || null,
      particulars: row.particulars || row.entry_description || "",
      debit,
      credit,
      balance: running,
      is_derived: row.is_derived === true || row.is_derived === "t",
      source_type: row.source_type,
      source_id: row.source_id,
      posting_sequence: row.posting_sequence === null ? null : Number(row.posting_sequence),
      display_order: row.display_order === null ? null : Number(row.display_order),
    };
  });

  return {
    account: {
      code: account.code,
      description: account.description,
      ledger_type: account.ledger_type,
      fs_note: account.fs_note,
      parent_code: account.parent_code,
    },
    opening_balance: openingBalance,
    opening_source: openingSource,
    transactions,
    closing_balance: running,
    totals: {
      debit: totalDebit,
      credit: totalCredit,
      count: transactions.length,
      derived_count: transactions.filter((tx) => tx.is_derived).length,
    },
  };
}
