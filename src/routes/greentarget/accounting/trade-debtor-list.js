// Green Target's legacy Trade Debtor List has two distinct dimensions:
// direct Trade Debtor GL accounts on page 1 and the customer-level CD_SD
// subledger on the following pages. The latter is deliberately independent of
// the GL account used by the journal line.

import { getMonthPeriod } from "./report-engine.js";

const LEGACY_LEDGER_START = "2026-01-01";
const LEGACY_SUBLEDGER_MONTH = "2026-06-01";
const SUNDRY_CONTROL_ACCOUNT = "CD_SD";
const UNALLOCATED_SNAPSHOT_CODE = "CD_SD (UNALLOCATED)";

/** @param {unknown} value @returns {number} */
const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** @param {number} value @returns {number} */
const money = (value) => Math.round(value * 100) / 100;

/** @param {string} ymd @returns {string} */
const toDisplayDate = (ymd) =>
  `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** @returns {string} */
const getReportDateTime = () => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.hour}:${parts.minute}:${parts.second}  ${parts.day} ${String(
    parts.month || ""
  ).toUpperCase()} ${parts.year}`;
};

/**
 * @param {number} year
 * @param {number} month
 * @returns {{ startStr: string, endStr: string }}
 */
const getPreviousMonthPeriod = (year, month) => {
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return getMonthPeriod(previousYear, previousMonth);
};

/**
 * @typedef {object} GTLegacyDebtorRow
 * @property {string} account_no
 * @property {string} particular
 * @property {number} closing_balance
 * @property {number} current_month
 * @property {number} previous_month
 * @property {number|null} source_page
 * @property {number|null} source_row
 */

/**
 * @typedef {object} GTLegacyDebtorTotals
 * @property {number} closing_balance
 * @property {number} current_month
 * @property {number} previous_month
 */

/** @returns {GTLegacyDebtorTotals} */
const emptyTotals = () => ({
  closing_balance: 0,
  current_month: 0,
  previous_month: 0,
});

/**
 * @param {GTLegacyDebtorRow[]} rows
 * @returns {GTLegacyDebtorTotals}
 */
const totalRows = (rows) => {
  const totals = rows.reduce(
    (result, row) => ({
      closing_balance: result.closing_balance + row.closing_balance,
      current_month: result.current_month + row.current_month,
      previous_month: result.previous_month + row.previous_month,
    }),
    emptyTotals()
  );
  return {
    closing_balance: money(totals.closing_balance),
    current_month: money(totals.current_month),
    previous_month: money(totals.previous_month),
  };
};

/**
 * @param {GTLegacyDebtorRow} row
 * @returns {boolean}
 */
export const isGTLegacyDebtorRowAllZero = (row) =>
  Math.abs(row.closing_balance) <= 0.005 &&
  Math.abs(row.current_month) <= 0.005 &&
  Math.abs(row.previous_month) <= 0.005;

/**
 * @param {Array<Record<string, unknown>>} rows
 * @returns {GTLegacyDebtorRow[]}
 */
const normalizeRows = (rows) =>
  rows.map((row) => ({
    account_no: String(row.account_no),
    particular: String(row.particular || "UNNAMED"),
    closing_balance: numeric(row.closing_balance),
    current_month: numeric(row.current_month),
    previous_month: numeric(row.previous_month),
    source_page:
      row.source_page === null || row.source_page === undefined
        ? null
        : Number(row.source_page),
    source_row:
      row.source_row === null || row.source_row === undefined
        ? null
        : Number(row.source_row),
  }));

/**
 * Direct-DEBTOR GL rows. Descendants are rolled into their direct root so the
 * CD_SD control remains one page-1 line before and after the July cutover.
 *
 * @param {import("pg").Pool} pool
 * @param {{ startStr: string, endStr: string }} period
 * @param {{ startStr: string, endStr: string }} previousPeriod
 * @returns {Promise<GTLegacyDebtorRow[]>}
 */
const fetchDirectRows = async (pool, period, previousPeriod) => {
  const result = await pool.query(
    `WITH RECURSIVE direct_accounts AS (
       SELECT account.code, registry.description, registry.sort_order
         FROM greentarget.debtor_subledger_registry registry
         JOIN greentarget.account_codes account ON account.code = registry.code
        WHERE registry.kind IN ('named', 'control')
          AND registry.control_account_code = registry.code
          AND registry.effective_from <= $2::date
          -- effective_to is an exclusive registry boundary.
          AND (registry.effective_to IS NULL OR registry.effective_to > $2::date)
          AND account.parent_code = 'DEBTOR'
          AND account.ledger_type = 'TD'
     ),
     account_scope AS (
       SELECT direct.code AS root_code, direct.code AS account_code
         FROM direct_accounts direct
       UNION ALL
       SELECT scope.root_code, child.code
         FROM account_scope scope
         JOIN greentarget.account_codes child
           ON child.parent_code = scope.account_code
        WHERE child.ledger_type = 'TD'
     ),
     anchors AS (
       SELECT DISTINCT ON (scope.root_code, scope.account_code)
              scope.root_code,
              scope.account_code,
              opening.amount,
              opening.as_of_date
         FROM account_scope scope
         JOIN greentarget.account_opening_balances opening
           ON opening.account_code = scope.account_code
        WHERE opening.as_of_date <= $2::date
        ORDER BY scope.root_code, scope.account_code, opening.as_of_date DESC
     ),
     anchor_totals AS (
       SELECT scope.root_code, SUM(COALESCE(anchor.amount, 0)) AS amount
         FROM account_scope scope
         LEFT JOIN anchors anchor
           ON anchor.root_code = scope.root_code
          AND anchor.account_code = scope.account_code
        GROUP BY scope.root_code
     ),
     movement AS (
       SELECT scope.root_code,
              SUM(CASE
                    WHEN journal.id IS NOT NULL
                     AND journal.entry_date >= COALESCE(anchor.as_of_date, $5::date)
                     AND journal.entry_date <= $2::date
                    THEN line.debit_amount - line.credit_amount ELSE 0
                  END) AS closing_movement,
              SUM(CASE
                    WHEN journal.id IS NOT NULL
                     AND journal.entry_date >= $1::date
                     AND journal.entry_date <= $2::date
                    THEN line.debit_amount - line.credit_amount ELSE 0
                  END) AS current_month,
              SUM(CASE
                    WHEN journal.id IS NOT NULL
                     AND journal.entry_date >= $3::date
                     AND journal.entry_date <= $4::date
                    THEN line.debit_amount - line.credit_amount ELSE 0
                  END) AS previous_month
         FROM account_scope scope
         LEFT JOIN anchors anchor
           ON anchor.root_code = scope.root_code
          AND anchor.account_code = scope.account_code
         LEFT JOIN greentarget.journal_entry_lines line
           ON line.account_code = scope.account_code
         LEFT JOIN greentarget.journal_entries journal
           ON journal.id = line.journal_entry_id
          AND journal.status = 'posted'
          AND journal.entry_date <= $2::date
        GROUP BY scope.root_code
     )
     SELECT direct.code AS account_no,
            direct.description AS particular,
            (COALESCE(anchor.amount, 0)
             + COALESCE(movement.closing_movement, 0))::numeric(14,2)
              AS closing_balance,
            COALESCE(movement.current_month, 0)::numeric(14,2)
              AS current_month,
            COALESCE(movement.previous_month, 0)::numeric(14,2)
              AS previous_month,
            NULL::integer AS source_page,
            NULL::integer AS source_row
       FROM direct_accounts direct
       LEFT JOIN anchor_totals anchor ON anchor.root_code = direct.code
       LEFT JOIN movement ON movement.root_code = direct.code
      ORDER BY direct.sort_order, direct.code`,
    [
      period.startStr,
      period.endStr,
      previousPeriod.startStr,
      previousPeriod.endStr,
      LEGACY_LEDGER_START,
    ]
  );
  return normalizeRows(result.rows);
};

/**
 * June is immutable source evidence: its snapshot itself defines membership
 * and order. Current registry membership must never leak into this branch.
 *
 * @param {import("pg").Pool} pool
 * @param {string} monthStart
 * @param {string} previousMonthStart
 * @returns {Promise<GTLegacyDebtorRow[]>}
 */
const fetchSnapshotChildRows = async (pool, monthStart, previousMonthStart) => {
  const result = await pool.query(
    `WITH current_snapshot AS (
       SELECT account_code, closing_balance, movement, source_page, source_row
         FROM greentarget.debtor_subledger_snapshots
        WHERE as_of_month = $1::date
          AND account_code <> $3
     ),
     previous_snapshot AS (
       SELECT account_code, movement
         FROM greentarget.debtor_subledger_snapshots
        WHERE as_of_month = $2::date
          AND account_code <> $3
     )
     SELECT current.account_code AS account_no,
            COALESCE(registry.description, current.account_code) AS particular,
            current.closing_balance,
            current.movement AS current_month,
            COALESCE(previous.movement, 0) AS previous_month,
            current.source_page,
            current.source_row
       FROM current_snapshot current
       LEFT JOIN greentarget.debtor_subledger_registry registry
         ON registry.code = current.account_code
        AND registry.control_account_code = $4
       LEFT JOIN previous_snapshot previous
         ON previous.account_code = current.account_code
      ORDER BY current.source_page, current.source_row, current.account_code`,
    [
      monthStart,
      previousMonthStart,
      UNALLOCATED_SNAPSHOT_CODE,
      SUNDRY_CONTROL_ACCOUNT,
    ]
  );
  return normalizeRows(result.rows);
};

/**
 * Post-cutover child movements are tagged on journal lines. The GL account may
 * still be CD_SD; debtor_subledger_code is the independent customer identity.
 *
 * @param {import("pg").Pool} pool
 * @param {{ startStr: string, endStr: string }} period
 * @param {{ startStr: string, endStr: string }} previousPeriod
 * @returns {Promise<GTLegacyDebtorRow[]>}
 */
const fetchTaggedChildRows = async (pool, period, previousPeriod) => {
  const result = await pool.query(
    `WITH registry_accounts AS (
       SELECT code, description, effective_from, effective_to, sort_order,
              source_page, source_row
        FROM greentarget.debtor_subledger_registry
       WHERE control_account_code = $5
          AND kind = 'sundry'
          AND effective_from <= $2::date
          -- effective_to is an exclusive registry boundary.
          AND (effective_to IS NULL OR effective_to > $2::date)
     ),
     latest_snapshot AS (
       SELECT DISTINCT ON (registry.code)
              registry.code,
              snapshot.as_of_month,
              snapshot.closing_balance
         FROM registry_accounts registry
         JOIN greentarget.debtor_subledger_snapshots snapshot
           ON snapshot.account_code = registry.code
          AND snapshot.as_of_month < $1::date
        ORDER BY registry.code, snapshot.as_of_month DESC
     ),
     previous_snapshot AS (
       SELECT snapshot.account_code, snapshot.movement
         FROM greentarget.debtor_subledger_snapshots snapshot
        WHERE snapshot.as_of_month = $3::date
          AND snapshot.account_code <> $6
     ),
     movement AS (
       SELECT registry.code,
              SUM(CASE
                    WHEN journal.entry_date >= COALESCE(
                           (snapshot.as_of_month + INTERVAL '1 month')::date,
                           registry.effective_from
                         )
                     AND journal.entry_date <= $2::date
                    THEN line.debit_amount - line.credit_amount ELSE 0
                  END) AS closing_movement,
              SUM(CASE
                    WHEN journal.entry_date >= $1::date
                     AND journal.entry_date <= $2::date
                    THEN line.debit_amount - line.credit_amount ELSE 0
                  END) AS current_month,
              SUM(CASE
                    WHEN journal.entry_date >= $3::date
                     AND journal.entry_date <= $4::date
                    THEN line.debit_amount - line.credit_amount ELSE 0
                  END) AS previous_month
         FROM registry_accounts registry
         LEFT JOIN latest_snapshot snapshot ON snapshot.code = registry.code
         LEFT JOIN greentarget.journal_entry_lines line
           ON line.debtor_subledger_code = registry.code
         LEFT JOIN greentarget.journal_entries journal
           ON journal.id = line.journal_entry_id
          AND journal.status = 'posted'
          AND journal.entry_date <= $2::date
        GROUP BY registry.code, registry.effective_from, snapshot.as_of_month
     )
     SELECT registry.code AS account_no,
            registry.description AS particular,
            (COALESCE(snapshot.closing_balance, 0)
             + COALESCE(movement.closing_movement, 0))::numeric(14,2)
              AS closing_balance,
            COALESCE(movement.current_month, 0)::numeric(14,2)
              AS current_month,
            (CASE WHEN previous.account_code IS NOT NULL
                  THEN previous.movement
                  ELSE COALESCE(movement.previous_month, 0)
             END)::numeric(14,2) AS previous_month,
            registry.source_page,
            registry.source_row
       FROM registry_accounts registry
       LEFT JOIN latest_snapshot snapshot ON snapshot.code = registry.code
       LEFT JOIN previous_snapshot previous ON previous.account_code = registry.code
       LEFT JOIN movement ON movement.code = registry.code
      ORDER BY registry.source_page ASC NULLS LAST,
               registry.source_row ASC NULLS LAST,
               registry.sort_order,
               registry.code`,
    [
      period.startStr,
      period.endStr,
      previousPeriod.startStr,
      previousPeriod.endStr,
      SUNDRY_CONTROL_ACCOUNT,
      UNALLOCATED_SNAPSHOT_CODE,
    ]
  );
  return normalizeRows(result.rows);
};

/**
 * Build the official GT legacy-style report data in one backend payload.
 * Totals always cover the full population; hideZero affects rows
 * only, and only when all three printed amounts are zero.
 *
 * @param {import("pg").Pool} pool
 * @param {{ year: number, month: number, hideZero?: boolean }} options
 */
export const buildGreenTargetLegacyDebtorList = async (pool, options) => {
  const { year, month, hideZero = false } = options;
  const period = getMonthPeriod(year, month);
  const previousPeriod = getPreviousMonthPeriod(year, month);

  const [directRowsAll, childRowsAll] = await Promise.all([
    fetchDirectRows(pool, period, previousPeriod),
    period.startStr === LEGACY_SUBLEDGER_MONTH
      ? fetchSnapshotChildRows(
          pool,
          period.startStr,
          previousPeriod.startStr
        )
      : fetchTaggedChildRows(pool, period, previousPeriod),
  ]);

  const directTotals = totalRows(directRowsAll);
  const visibleChildTotals = totalRows(childRowsAll);
  const sundryControl = directRowsAll.find(
    (row) => row.account_no === SUNDRY_CONTROL_ACCOUNT
  );
  if (!sundryControl) {
    throw new Error("Green Target CD_SD control account is missing from the debtor report");
  }
  const childControlTotals = {
    closing_balance: money(sundryControl.closing_balance),
    current_month: money(sundryControl.current_month),
    previous_month: money(sundryControl.previous_month),
  };
  const reconciliationResidual = {
    closing_balance: money(
      childControlTotals.closing_balance - visibleChildTotals.closing_balance
    ),
    current_month: money(
      childControlTotals.current_month - visibleChildTotals.current_month
    ),
    previous_month: money(
      childControlTotals.previous_month - visibleChildTotals.previous_month
    ),
  };

  const directRows = hideZero
    ? directRowsAll.filter((row) => !isGTLegacyDebtorRowAllZero(row))
    : directRowsAll;
  const childRows = hideZero
    ? childRowsAll.filter((row) => !isGTLegacyDebtorRowAllZero(row))
    : childRowsAll;

  return {
    statement_date: toDisplayDate(period.endStr),
    previous_statement_date: toDisplayDate(previousPeriod.endStr),
    report_datetime: getReportDateTime(),
    statement_month: month,
    statement_year: year,
    hide_zero: hideZero,
    direct: {
      rows: directRows,
      total_accounts: directRows.length,
      full_population: directRowsAll.length,
      control_totals: directTotals,
    },
    cd_sd: {
      rows: childRows,
      total_accounts: childRows.length,
      full_population: childRowsAll.length,
      visible_totals: visibleChildTotals,
      control_totals: childControlTotals,
      reconciliation_residual: reconciliationResidual,
    },
  };
};
