// src/routes/greentarget/accounting/debtors.js
//
// Green Target debtors routes (phase G6). Read-only thin router over the
// `greentarget.` ledger — the GT clone of Tien Hock's /api/debtors, emitting
// the exact response shapes the shared DebtorsReportPage consumes.
//
// Mounted at /greentarget/api/debtors (src/routes/index.js).
//
// GT has no open-item subledger (no invoices/payments tables for sales): its
// debtor ledger is a RUNNING-BALANCE ledger imported from the legacy system.
// Through June 2026, the 28 trade debtors are the direct TD children of the
// DEBTOR control account. From July, CD_SD is a control account whose direct
// children carry its detailed balances; top-level reports roll active TD
// descendants into their original direct-DEBTOR row.
//
//   * GET /                  — one pseudo-salesman group ("Trade Debtors") with
//                              one pseudo-customer per TD child. B/F row for the
//                              opening, one row per month DEBIT line, and a
//                              RECEIPTS row carrying the month CREDIT lines as
//                              payments. Balances stay SIGNED (KBOX -0.01 and
//                              RUMAH MERAH -1.00 are genuine credit balances).
//   * GET /statement/:id     — one debtor's monthly statement, built from
//                              buildAccountLedger (report-engine.js).
//   * GET /general-statement — one row per debtor: bal_bf / current_invoices /
//                              payment / total_due, plus a monthly FIFO aging
//                              rolled forward from the 2026-01-01 anchors (the
//                              buckets sum to each debtor's closing exactly).
//
// June 2026 gate: grand_total_balance === general-statement total_due ===
// 156,782.22 (printed Trial Balance note 22).
import { Router } from "express";

import {
  buildAccountLedger,
  getMonthPeriod,
  validateYearMonth,
} from "./report-engine.js";

/** Every GT opening anchor sits on this date; the imported ledger starts here. */
const LEGACY_LEDGER_START = "2026-01-01";

/** Default reporting month: the last imported month (Jun 2026). */
const DEFAULT_YEAR = 2026;
const DEFAULT_MONTH = 6;

/** CD_SD child ledgers become the source of truth from this date onward. */
const DEBTOR_SUBLEDGER_CUTOVER = "2026-07-01";

/** Round to whole cents (same convention as report-engine.js). */
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** pg returns `numeric` as a string; `null` for a missing aggregate. */
const num = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** RM string -> exact integer cents. */
const cents = (value) => Math.round(num(value) * 100);

const pad2 = (n) => String(n).padStart(2, "0");

/** @param {string} startStr Local yyyy-MM-dd month start. */
const useDescendantAggregation = (startStr) =>
  startStr >= DEBTOR_SUBLEDGER_CUTOVER;

/**
 * @param {number} year
 * @param {number} month
 * @returns {{ year: number, month: number, startStr: string, endStr: string }}
 */
const getPreviousMonthPeriod = (year, month) => {
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return {
    year: previousYear,
    month: previousMonth,
    ...getMonthPeriod(previousYear, previousMonth),
  };
};

/**
 * FIFO-age signed monthly net buckets into the four report buckets.
 * @param {Map<string, number>} monthlyCents Keyed by yyyy-MM.
 * @param {number} periodYear
 * @param {number} periodMonth
 */
const ageMonthlyCents = (monthlyCents, periodYear, periodMonth) => {
  /** @type {Array<{ key: string, amountCents: number }>} */
  const buckets = [];
  const monthKeys = [...monthlyCents.keys()].sort();

  for (const key of monthKeys) {
    let net = monthlyCents.get(key) || 0;
    if (net > 0) {
      for (const bucket of buckets) {
        if (net <= 0) break;
        if (bucket.amountCents >= 0) continue;
        const used = Math.min(-bucket.amountCents, net);
        bucket.amountCents += used;
        net -= used;
      }
      if (net > 0) buckets.push({ key, amountCents: net });
    } else if (net < 0) {
      let remaining = -net;
      for (const bucket of buckets) {
        if (remaining <= 0) break;
        if (bucket.amountCents <= 0) continue;
        const used = Math.min(bucket.amountCents, remaining);
        bucket.amountCents -= used;
        remaining -= used;
      }
      if (remaining > 0) buckets.push({ key, amountCents: -remaining });
    }
  }

  const ageOf = (key) => {
    const [year, month] = key.split("-").map(Number);
    return (periodYear - year) * 12 + (periodMonth - month);
  };
  let current = 0;
  let oneMonth = 0;
  let twoMonths = 0;
  let threePlus = 0;
  for (const bucket of buckets) {
    if (bucket.amountCents === 0) continue;
    const age = ageOf(bucket.key);
    if (age <= 0) current += bucket.amountCents;
    else if (age === 1) oneMonth += bucket.amountCents;
    else if (age === 2) twoMonths += bucket.amountCents;
    else threePlus += bucket.amountCents;
  }

  return {
    current_month: money(current / 100),
    one_month: money(oneMonth / 100),
    two_months: money(twoMonths / 100),
    three_months_plus: money(threePlus / 100),
  };
};

/** "YYYY-MM-DD" (a to_char string, never a Date) -> "DD/MM/YYYY". */
const toDisplayDate = (ymd) =>
  `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/**
 * @param {import("pg").Pool} pool
 * @returns {import("express").Router}
 */
export default function createGreenTargetDebtorsRouter(pool) {
  const router = Router();

  /**
   * Resolve and validate the ?month&year query. Defaults to the last imported
   * month (6/2026) so a bare call always lands on real data.
   */
  const resolvePeriod = (query, res) => {
    const validation = validateYearMonth(
      query.year ?? DEFAULT_YEAR,
      query.month ?? DEFAULT_MONTH
    );
    if (!validation.valid) {
      res.status(400).json({ message: validation.error });
      return null;
    }
    return validation; // { valid: true, year, month }
  };

  /**
   * All direct TD children with their opening balance at startStr (anchor rule:
   * latest anchor on/before startStr plus posted movement from the anchor to
   * startStr). Ordered by the printed Trial Balance order (sort_order).
   */
  const fetchChildrenWithOpenings = async (
    startStr,
    includeDescendants
  ) => {
    const result = await pool.query(
      `WITH RECURSIVE children AS (
         SELECT code, description, sort_order
           FROM greentarget.account_codes
          WHERE parent_code = 'DEBTOR'
            AND ledger_type = 'TD'
            AND is_active = true
       ),
       account_scope AS (
         SELECT ch.code AS root_code, ch.code AS account_code
           FROM children ch
         UNION
         SELECT scope.root_code, ac.code
           FROM account_scope scope
           JOIN greentarget.account_codes ac
             ON ac.parent_code = scope.account_code
          WHERE $2::boolean
            AND ac.ledger_type = 'TD'
            AND ac.is_active = true
       ),
       anchors AS (
         SELECT DISTINCT ON (scope.root_code, scope.account_code)
                scope.root_code,
                scope.account_code,
                aob.amount,
                aob.as_of_date
           FROM account_scope scope
           JOIN greentarget.account_opening_balances aob
             ON aob.account_code = scope.account_code
          WHERE aob.as_of_date <= $1::date
          ORDER BY scope.root_code, scope.account_code, aob.as_of_date DESC
       ),
       pre AS (
         SELECT scope.root_code,
                scope.account_code,
                SUM(jel.debit_amount - jel.credit_amount) AS movement
           FROM account_scope scope
           JOIN greentarget.journal_entry_lines jel
             ON jel.account_code = scope.account_code
           JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
           LEFT JOIN anchors a
             ON a.root_code = scope.root_code
            AND a.account_code = scope.account_code
          WHERE je.status = 'posted'
            AND je.entry_date < $1::date
            AND (a.as_of_date IS NULL OR je.entry_date >= a.as_of_date)
          GROUP BY scope.root_code, scope.account_code
       ),
       balances AS (
         SELECT scope.root_code,
                SUM(COALESCE(a.amount, 0) + COALESCE(p.movement, 0)) AS opening
           FROM account_scope scope
           LEFT JOIN anchors a
             ON a.root_code = scope.root_code
            AND a.account_code = scope.account_code
           LEFT JOIN pre p
             ON p.root_code = scope.root_code
            AND p.account_code = scope.account_code
          GROUP BY scope.root_code
       )
       SELECT ch.code,
              ch.description,
              ch.sort_order,
              COALESCE(b.opening, 0)::numeric(14,2) AS opening
         FROM children ch
         LEFT JOIN balances b ON b.root_code = ch.code
        ORDER BY ch.sort_order ASC, ch.code ASC`,
      [startStr, includeDescendants]
    );
    return result.rows;
  };

  /**
   * Posted TD-child ledger lines inside [startStr, endStr], in GT ledger order
   * (posting_sequence, then display_order — never a bare date sort).
   */
  const fetchMonthLines = async (
    startStr,
    endStr,
    includeDescendants
  ) => {
    const result = await pool.query(
      `WITH RECURSIVE children AS (
         SELECT code
           FROM greentarget.account_codes
          WHERE parent_code = 'DEBTOR'
            AND ledger_type = 'TD'
            AND is_active = true
       ),
       account_scope AS (
         SELECT ch.code AS root_code, ch.code AS account_code
           FROM children ch
         UNION
         SELECT scope.root_code, ac.code
           FROM account_scope scope
           JOIN greentarget.account_codes ac
             ON ac.parent_code = scope.account_code
          WHERE $3::boolean
            AND ac.ledger_type = 'TD'
            AND ac.is_active = true
       )
       SELECT scope.root_code AS account_code,
              jel.id AS line_id,
              COALESCE(jel.display_reference, je.display_reference, je.reference_no) AS ref,
              to_char(je.entry_date, 'YYYY-MM-DD') AS entry_date,
              jel.debit_amount,
              jel.credit_amount
         FROM account_scope scope
         JOIN greentarget.journal_entry_lines jel
           ON jel.account_code = scope.account_code
         JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
          AND je.entry_date >= $1::date
          AND je.entry_date <= $2::date
          AND (jel.debit_amount > 0 OR jel.credit_amount > 0)
        ORDER BY scope.root_code,
                 je.posting_sequence ASC NULLS LAST,
                 je.entry_date ASC,
                 je.id ASC,
                 jel.display_order ASC NULLS LAST,
                 jel.line_number ASC,
                 jel.id ASC`,
      [startStr, endStr, includeDescendants]
    );
    return result.rows;
  };

  /**
   * Monthly FIFO aging for every direct TD child as at the period end, rolled
   * forward from each scoped account's latest applicable anchor. Each month's
   * net movement is a
   * signed bucket: positive nets first offset carried credit buckets, negative
   * nets consume positive buckets oldest-first, any excess crediting the
   * current month. Buckets always sum to the child's ledger close.
   *
   * Returns a Map of account code ->
   * { current_month, one_month, two_months, three_months_plus } (RM, 2dp).
   */
  const computeFifoAging = async (
    endStr,
    periodYear,
    periodMonth,
    includeDescendants
  ) => {
    const [anchorResult, monthlyResult] = await Promise.all([
      pool.query(
        `WITH RECURSIVE children AS (
           SELECT code
             FROM greentarget.account_codes
            WHERE parent_code = 'DEBTOR'
              AND ledger_type = 'TD'
              AND is_active = true
         ),
         account_scope AS (
           SELECT ch.code AS root_code, ch.code AS account_code
             FROM children ch
           UNION
           SELECT scope.root_code, ac.code
             FROM account_scope scope
             JOIN greentarget.account_codes ac
               ON ac.parent_code = scope.account_code
            WHERE $2::boolean
              AND ac.ledger_type = 'TD'
              AND ac.is_active = true
         )
         SELECT scope.root_code,
                scope.account_code,
                to_char(anchor.as_of_date, 'YYYY-MM') AS anchor_month,
                anchor.amount
           FROM account_scope scope
           LEFT JOIN LATERAL (
             SELECT aob.as_of_date, aob.amount
               FROM greentarget.account_opening_balances aob
              WHERE aob.account_code = scope.account_code
                AND aob.as_of_date <= $1::date
              ORDER BY aob.as_of_date DESC
              LIMIT 1
           ) anchor ON true`,
        [endStr, includeDescendants]
      ),
      pool.query(
        `WITH RECURSIVE children AS (
           SELECT code
             FROM greentarget.account_codes
            WHERE parent_code = 'DEBTOR'
              AND ledger_type = 'TD'
              AND is_active = true
         ),
         account_scope AS (
           SELECT ch.code AS root_code, ch.code AS account_code
             FROM children ch
           UNION
           SELECT scope.root_code, ac.code
             FROM account_scope scope
             JOIN greentarget.account_codes ac
               ON ac.parent_code = scope.account_code
            WHERE $2::boolean
              AND ac.ledger_type = 'TD'
              AND ac.is_active = true
         ),
         anchored_scope AS (
           SELECT scope.root_code,
                  scope.account_code,
                  anchor.as_of_date
             FROM account_scope scope
             LEFT JOIN LATERAL (
               SELECT aob.as_of_date
                 FROM greentarget.account_opening_balances aob
                WHERE aob.account_code = scope.account_code
                  AND aob.as_of_date <= $1::date
                ORDER BY aob.as_of_date DESC
                LIMIT 1
             ) anchor ON true
         )
         SELECT scope.root_code,
                EXTRACT(YEAR FROM je.entry_date)::integer AS y,
                EXTRACT(MONTH FROM je.entry_date)::integer AS m,
                SUM(jel.debit_amount - jel.credit_amount) AS net
           FROM anchored_scope scope
           JOIN greentarget.journal_entry_lines jel
             ON jel.account_code = scope.account_code
           JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.status = 'posted'
            AND je.entry_date >= COALESCE(scope.as_of_date, $3::date)
            AND je.entry_date <= $1::date
          GROUP BY scope.root_code,
                   EXTRACT(YEAR FROM je.entry_date),
                   EXTRACT(MONTH FROM je.entry_date)`,
        [endStr, includeDescendants, LEGACY_LEDGER_START]
      ),
    ]);

    const monthlyByCode = new Map();
    for (const row of anchorResult.rows) {
      let months = monthlyByCode.get(row.root_code);
      if (!months) {
        months = new Map();
        monthlyByCode.set(row.root_code, months);
      }
      if (row.anchor_month) {
        months.set(
          row.anchor_month,
          (months.get(row.anchor_month) || 0) + cents(row.amount)
        );
      }
    }
    for (const row of monthlyResult.rows) {
      let months = monthlyByCode.get(row.root_code);
      if (!months) {
        months = new Map();
        monthlyByCode.set(row.root_code, months);
      }
      const key = `${row.y}-${pad2(row.m)}`;
      months.set(key, (months.get(key) || 0) + cents(row.net));
    }

    const agingByCode = new Map();
    for (const [code, months] of monthlyByCode) {
      agingByCode.set(code, ageMonthlyCents(months, periodYear, periodMonth));
    }
    return agingByCode;
  };

  /** FIFO aging for one exact TD account, including a nested CD_SD child. */
  const computeAccountFifoAging = async (
    accountCode,
    endStr,
    periodYear,
    periodMonth
  ) => {
    const anchorResult = await pool.query(
      `SELECT to_char(aob.as_of_date, 'YYYY-MM-DD') AS anchor_date,
              to_char(aob.as_of_date, 'YYYY-MM') AS anchor_month,
              aob.amount
         FROM greentarget.account_opening_balances aob
        WHERE aob.account_code = $1
          AND aob.as_of_date <= $2::date
        ORDER BY aob.as_of_date DESC
        LIMIT 1`,
      [accountCode, endStr]
    );
    const anchor = anchorResult.rows[0] || null;
    const movementStart = anchor?.anchor_date || LEGACY_LEDGER_START;
    const monthlyResult = await pool.query(
      `SELECT EXTRACT(YEAR FROM je.entry_date)::integer AS y,
              EXTRACT(MONTH FROM je.entry_date)::integer AS m,
              SUM(jel.debit_amount - jel.credit_amount) AS net
         FROM greentarget.journal_entry_lines jel
         JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
          AND jel.account_code = $1
          AND je.entry_date >= $2::date
          AND je.entry_date <= $3::date
        GROUP BY EXTRACT(YEAR FROM je.entry_date),
                 EXTRACT(MONTH FROM je.entry_date)`,
      [accountCode, movementStart, endStr]
    );

    const months = new Map();
    if (anchor) {
      months.set(anchor.anchor_month, cents(anchor.amount));
    }
    for (const row of monthlyResult.rows) {
      const key = `${row.y}-${pad2(row.m)}`;
      months.set(key, (months.get(key) || 0) + cents(row.net));
    }
    return ageMonthlyCents(months, periodYear, periodMonth);
  };

  // GET / - Debtors report for one month: one pseudo-salesman group holding one
  // pseudo-customer per TD child. B/F row = opening, one row per month debit
  // line, RECEIPTS row = the month's credit lines as payments.
  router.get("/", async (req, res) => {
    const period = resolvePeriod(req.query, res);
    if (!period) return;
    const { year, month } = period;

    try {
      const { startStr, endStr } = getMonthPeriod(year, month);
      const includeDescendants = useDescendantAggregation(startStr);
      const [children, monthLines] = await Promise.all([
        fetchChildrenWithOpenings(startStr, includeDescendants),
        fetchMonthLines(startStr, endStr, includeDescendants),
      ]);

      const linesByCode = new Map();
      for (const line of monthLines) {
        let list = linesByCode.get(line.account_code);
        if (!list) {
          list = [];
          linesByCode.set(line.account_code, list);
        }
        list.push(line);
      }

      let grandAmountCents = 0;
      let grandPaidCents = 0;
      let grandBalanceCents = 0;

      const customers = children.map((child) => {
        const openingCents = cents(child.opening);
        const lines = linesByCode.get(child.code) || [];

        const invoices = [];
        if (openingCents !== 0) {
          invoices.push({
            invoice_id: "B/F",
            invoice_number: "BALANCE B/F",
            date: startStr,
            amount: money(openingCents / 100),
            payments: [],
            balance: money(openingCents / 100),
          });
        }

        let debitCents = 0;
        let creditCents = 0;
        const payments = [];
        for (const line of lines) {
          const debit = cents(line.debit_amount);
          const credit = cents(line.credit_amount);
          if (debit > 0) {
            debitCents += debit;
            invoices.push({
              invoice_id: line.ref,
              invoice_number: line.ref,
              date: line.entry_date,
              amount: money(debit / 100),
              payments: [],
              balance: money(debit / 100),
            });
          } else if (credit > 0) {
            creditCents += credit;
            payments.push({
              payment_id: line.line_id,
              payment_method: "ledger",
              payment_reference: line.ref,
              date: line.entry_date,
              amount: money(credit / 100),
              status: "active",
            });
          }
        }
        if (payments.length > 0) {
          invoices.push({
            invoice_id: "RECEIPTS",
            invoice_number: "RECEIPTS",
            date: endStr,
            amount: 0,
            payments,
            balance: 0,
          });
        }

        const totalAmountCents = openingCents + debitCents;
        const totalPaidCents = creditCents;
        const totalBalanceCents = totalAmountCents - totalPaidCents;

        grandAmountCents += totalAmountCents;
        grandPaidCents += totalPaidCents;
        grandBalanceCents += totalBalanceCents;

        const totalBalance = money(totalBalanceCents / 100);
        return {
          customer_id: child.code,
          customer_name: child.description,
          invoices,
          total_amount: money(totalAmountCents / 100),
          total_paid: money(totalPaidCents / 100),
          total_balance: totalBalance,
          credit_limit: 0,
          credit_balance: money(-totalBalance),
        };
      });

      res.json({
        salesmen: [
          {
            salesman_id: "LEDGER",
            salesman_name: "Trade Debtors",
            customers,
            total_balance: money(grandBalanceCents / 100),
          },
        ],
        grand_total_amount: money(grandAmountCents / 100),
        grand_total_paid: money(grandPaidCents / 100),
        grand_total_balance: money(grandBalanceCents / 100),
        report_date: endStr,
      });
    } catch (error) {
      console.error("Error fetching Green Target debtors report:", error);
      res.status(500).json({
        message: "Error fetching Green Target debtors report",
        error: error.message,
      });
    }
  });

  // GET /sub-schedule/CD_SD - Detailed sundry-debtor schedule. June 2026 is
  // the immutable imported snapshot; later months roll the child ledgers
  // forward from their latest anchors. July's previous-month column comes
  // from the June snapshot because child-ledger posting starts on 1 July.
  router.get("/sub-schedule/CD_SD", async (req, res) => {
    const period = resolvePeriod(req.query, res);
    if (!period) return;
    const { year, month } = period;
    const { startStr, endStr } = getMonthPeriod(year, month);
    if (startStr < "2026-06-01") {
      return res.status(400).json({
        message: "CD_SD sub-schedule is available from June 2026 onward",
      });
    }

    try {
      const previousPeriod = getPreviousMonthPeriod(year, month);
      let result;
      if (startStr === "2026-06-01") {
        result = await pool.query(
          `WITH children AS (
             SELECT code, description, sort_order
               FROM greentarget.account_codes
              WHERE parent_code = 'CD_SD'
                AND ledger_type = 'TD'
                AND is_active = true
           ),
           current_snapshot AS (
             SELECT account_code,
                    closing_balance,
                    movement,
                    source_page,
                    source_row
               FROM greentarget.debtor_subledger_snapshots
              WHERE as_of_month = $1::date
           ),
           previous_snapshot AS (
             SELECT account_code, movement
               FROM greentarget.debtor_subledger_snapshots
              WHERE as_of_month = $2::date
           ),
           schedule_accounts AS (
             SELECT ch.code, ch.description, ch.sort_order
               FROM children ch
             UNION ALL
             SELECT current_snapshot.account_code AS code,
                    CASE
                      WHEN current_snapshot.account_code = 'CD_SD (UNALLOCATED)'
                      THEN 'UNALLOCATED LEGACY / UNMAPPED CONTROL BALANCE'
                      ELSE current_snapshot.account_code
                    END AS description,
                    2147483647 AS sort_order
               FROM current_snapshot
              WHERE NOT EXISTS (
                SELECT 1
                  FROM children ch
                 WHERE ch.code = current_snapshot.account_code
              )
           )
           SELECT schedule_accounts.code,
                  schedule_accounts.description,
                  COALESCE(current_snapshot.closing_balance, 0)::numeric(14,2)
                    AS closing_balance,
                  COALESCE(current_snapshot.movement, 0)::numeric(14,2)
                    AS current_month,
                  COALESCE(previous_snapshot.movement, 0)::numeric(14,2)
                    AS previous_month,
                  current_snapshot.source_page,
                  current_snapshot.source_row
             FROM schedule_accounts
             LEFT JOIN current_snapshot
               ON current_snapshot.account_code = schedule_accounts.code
             LEFT JOIN previous_snapshot
               ON previous_snapshot.account_code = schedule_accounts.code
            ORDER BY current_snapshot.source_page ASC NULLS LAST,
                     current_snapshot.source_row ASC NULLS LAST,
                     schedule_accounts.sort_order ASC,
                     schedule_accounts.code ASC`,
          [startStr, previousPeriod.startStr]
        );
      } else {
        const useSnapshotPrevious = startStr === DEBTOR_SUBLEDGER_CUTOVER;
        result = await pool.query(
          `WITH children AS (
             SELECT code, description, sort_order
               FROM greentarget.account_codes
              WHERE parent_code = 'CD_SD'
                AND ledger_type = 'TD'
                AND is_active = true
           ),
           schedule_accounts AS (
             SELECT ch.code,
                    ch.code AS ledger_account_code,
                    ch.description,
                    ch.sort_order
               FROM children ch
             UNION ALL
             SELECT 'CD_SD (UNALLOCATED)' AS code,
                    'CD_SD' AS ledger_account_code,
                    'UNALLOCATED LEGACY / UNMAPPED CONTROL BALANCE' AS description,
                    2147483647 AS sort_order
           ),
           anchors AS (
             SELECT schedule_accounts.code AS account_code,
                    anchor.as_of_date,
                    anchor.amount
               FROM schedule_accounts
               LEFT JOIN LATERAL (
                 SELECT aob.as_of_date, aob.amount
                   FROM greentarget.account_opening_balances aob
                  WHERE aob.account_code = schedule_accounts.ledger_account_code
                    AND aob.as_of_date <= $1::date
                  ORDER BY aob.as_of_date DESC
                  LIMIT 1
               ) anchor ON true
           ),
           movement AS (
             SELECT schedule_accounts.code AS account_code,
                    SUM(CASE
                          WHEN je.entry_date >= COALESCE(a.as_of_date, $5::date)
                           AND je.entry_date <= $1::date
                          THEN jel.debit_amount - jel.credit_amount ELSE 0
                        END) AS closing_movement,
                    SUM(CASE
                          WHEN je.entry_date >= $2::date
                           AND je.entry_date <= $1::date
                          THEN jel.debit_amount - jel.credit_amount ELSE 0
                        END) AS current_month,
                    SUM(CASE
                          WHEN je.entry_date >= $3::date
                           AND je.entry_date <= $4::date
                          THEN jel.debit_amount - jel.credit_amount ELSE 0
                        END) AS previous_month
               FROM schedule_accounts
               JOIN greentarget.journal_entry_lines jel
                 ON jel.account_code = schedule_accounts.ledger_account_code
               JOIN greentarget.journal_entries je
                 ON je.id = jel.journal_entry_id
               LEFT JOIN anchors a
                 ON a.account_code = schedule_accounts.code
              WHERE je.status = 'posted'
                AND je.entry_date <= $1::date
              GROUP BY schedule_accounts.code
           ),
           previous_snapshot AS (
             SELECT account_code, movement
               FROM greentarget.debtor_subledger_snapshots
              WHERE as_of_month = $3::date
           ),
           display_order AS (
             SELECT account_code, source_page, source_row
               FROM greentarget.debtor_subledger_snapshots
              WHERE as_of_month = '2026-06-01'::date
           )
           SELECT schedule_accounts.code,
                  schedule_accounts.description,
                  (COALESCE(a.amount, 0)
                   + COALESCE(m.closing_movement, 0))::numeric(14,2)
                    AS closing_balance,
                  COALESCE(m.current_month, 0)::numeric(14,2) AS current_month,
                  (CASE WHEN $6::boolean
                        THEN COALESCE(previous_snapshot.movement, 0)
                        ELSE COALESCE(m.previous_month, 0)
                   END)::numeric(14,2) AS previous_month,
                  display_order.source_page,
                  display_order.source_row
             FROM schedule_accounts
             LEFT JOIN anchors a ON a.account_code = schedule_accounts.code
             LEFT JOIN movement m ON m.account_code = schedule_accounts.code
             LEFT JOIN previous_snapshot
               ON previous_snapshot.account_code = schedule_accounts.code
             LEFT JOIN display_order
               ON display_order.account_code = schedule_accounts.code
            ORDER BY display_order.source_page ASC NULLS LAST,
                     display_order.source_row ASC NULLS LAST,
                     schedule_accounts.sort_order ASC,
                     schedule_accounts.code ASC`,
          [
            endStr,
            startStr,
            previousPeriod.startStr,
            previousPeriod.endStr,
            LEGACY_LEDGER_START,
            useSnapshotPrevious,
          ]
        );
      }

      const totals = {
        closing_balance: 0,
        current_month: 0,
        previous_month: 0,
      };
      const allRows = result.rows.map((row) => {
        const scheduleRow = {
          account_no: row.code,
          particular: row.description || "UNNAMED",
          closing_balance: num(row.closing_balance),
          current_month: num(row.current_month),
          previous_month: num(row.previous_month),
          source_page: row.source_page === null ? null : Number(row.source_page),
          source_row: row.source_row === null ? null : Number(row.source_row),
        };
        totals.closing_balance += scheduleRow.closing_balance;
        totals.current_month += scheduleRow.current_month;
        totals.previous_month += scheduleRow.previous_month;
        return scheduleRow;
      });

      const includeZero = req.query.includeZero === "1";
      const hideZero = req.query.hideZero === "1" || !includeZero;
      let rows = hideZero
        ? allRows.filter(
            (row) =>
              Math.abs(row.closing_balance) > 0.005 ||
              Math.abs(row.current_month) > 0.005 ||
              Math.abs(row.previous_month) > 0.005
          )
        : allRows;

      const search = String(req.query.search || "").trim().toLowerCase();
      if (search) {
        rows = rows.filter(
          (row) =>
            row.account_no.toLowerCase().includes(search) ||
            row.particular.toLowerCase().includes(search)
        );
      }

      const totalAccounts = rows.length;
      const limit = Math.min(
        1000,
        Math.max(1, parseInt(req.query.limit, 10) || 200)
      );
      const totalPages = Math.max(1, Math.ceil(totalAccounts / limit));
      const page = Math.min(
        totalPages,
        Math.max(1, parseInt(req.query.page, 10) || 1)
      );
      rows = rows.slice((page - 1) * limit, page * limit);

      for (const key of Object.keys(totals)) {
        totals[key] = money(totals[key]);
      }

      res.json({
        statement_date: toDisplayDate(endStr),
        statement_month: month,
        statement_year: year,
        rows,
        totals,
        total_accounts: totalAccounts,
        page,
        limit,
        total_pages: totalPages,
      });
    } catch (error) {
      console.error("Error fetching Green Target CD_SD sub-schedule:", error);
      res.status(500).json({
        message: "Error fetching Green Target CD_SD sub-schedule",
        error: error.message,
      });
    }
  });

  // GET /statement/:customerId - One debtor's monthly statement, built from
  // the account ledger. customerId is a TD child account code.
  router.get("/statement/:customerId", async (req, res) => {
    const { customerId } = req.params;
    const period = resolvePeriod(req.query, res);
    if (!period) return;
    const { year, month } = period;

    try {
      const { startStr, endStr } = getMonthPeriod(year, month);
      const lastDay = Number(endStr.slice(8, 10));

      const accountResult = await pool.query(
        `WITH RECURSIVE lineage AS (
           SELECT code, parent_code, ledger_type, is_active
             FROM greentarget.account_codes
            WHERE code = $1
           UNION
           SELECT parent.code,
                  parent.parent_code,
                  parent.ledger_type,
                  parent.is_active
             FROM greentarget.account_codes parent
             JOIN lineage child ON parent.code = child.parent_code
         )
         SELECT EXISTS (
                  SELECT 1
                    FROM lineage
                   WHERE code = $1
                     AND ledger_type = 'TD'
                     AND is_active = true
                ) AS is_active_td,
                EXISTS (
                  SELECT 1 FROM lineage WHERE code = 'DEBTOR'
                ) AS is_debtor_descendant`,
        [customerId]
      );
      const accountCheck = accountResult.rows[0];
      if (!accountCheck?.is_active_td || !accountCheck.is_debtor_descendant) {
        return res.status(404).json({ message: "Debtor account not found" });
      }

      const ledger = await buildAccountLedger(pool, customerId, startStr, endStr);

      const transactions = ledger.transactions
        .filter((tx) => tx.debit > 0 || tx.credit > 0)
        .map((tx) => ({
          date: toDisplayDate(tx.entry_date),
          particulars: tx.particulars || tx.reference_no || "",
          reference: tx.reference_no,
          type: tx.debit > 0 ? "debit" : "credit",
          amount: tx.debit > 0 ? tx.debit : tx.credit,
          running_balance: tx.balance,
        }));

      const aging = await computeAccountFifoAging(
        customerId,
        endStr,
        year,
        month
      );

      res.json({
        customer: {
          id: ledger.account.code,
          name: ledger.account.description,
        },
        statement_date: `${pad2(lastDay)}/${pad2(month)}/${year}`,
        statement_month: month,
        statement_year: year,
        previous_balance: ledger.opening_balance,
        transactions,
        total_amount_due: ledger.closing_balance,
        aging,
      });
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({ message: "Debtor account not found" });
      }
      console.error("Error fetching Green Target customer statement:", error);
      res.status(500).json({
        message: "Error fetching Green Target customer statement",
        error: error.message,
      });
    }
  });

  // GET /general-statement - One row per debtor: bal_bf / current_invoices /
  // payment / total_due, with the same includeZero/search/hideZero/pagination
  // behaviour as the TH endpoint so the shared page's By Customer view works.
  router.get("/general-statement", async (req, res) => {
    const period = resolvePeriod(req.query, res);
    if (!period) return;
    const { year, month } = period;

    try {
      const { startStr, endStr } = getMonthPeriod(year, month);
      const lastDay = Number(endStr.slice(8, 10));
      const statementDate = `${pad2(lastDay)}/${pad2(month)}/${year}`;
      const reportDateTime = new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const includeDescendants = useDescendantAggregation(startStr);

      const result = await pool.query(
        `WITH RECURSIVE children AS (
           SELECT code, description, sort_order
             FROM greentarget.account_codes
            WHERE parent_code = 'DEBTOR'
              AND ledger_type = 'TD'
              AND is_active = true
         ),
         account_scope AS (
           SELECT ch.code AS root_code, ch.code AS account_code
             FROM children ch
           UNION
           SELECT scope.root_code, ac.code
             FROM account_scope scope
             JOIN greentarget.account_codes ac
               ON ac.parent_code = scope.account_code
            WHERE $3::boolean
              AND ac.ledger_type = 'TD'
              AND ac.is_active = true
         ),
         anchors AS (
           SELECT DISTINCT ON (scope.root_code, scope.account_code)
                  scope.root_code,
                  scope.account_code,
                  aob.amount,
                  aob.as_of_date
             FROM account_scope scope
             JOIN greentarget.account_opening_balances aob
               ON aob.account_code = scope.account_code
            WHERE aob.as_of_date <= $1::date
            ORDER BY scope.root_code, scope.account_code, aob.as_of_date DESC
         ),
         anchor_totals AS (
           SELECT scope.root_code,
                  SUM(COALESCE(a.amount, 0)) AS amount
             FROM account_scope scope
             LEFT JOIN anchors a
               ON a.root_code = scope.root_code
              AND a.account_code = scope.account_code
            GROUP BY scope.root_code
         ),
         movement AS (
           SELECT scope.root_code,
                  SUM(CASE WHEN je.entry_date < $1::date
                            AND (a.as_of_date IS NULL OR je.entry_date >= a.as_of_date)
                           THEN jel.debit_amount - jel.credit_amount ELSE 0 END) AS pre_movement,
                  SUM(CASE WHEN je.entry_date >= $1::date AND je.entry_date <= $2::date
                           THEN jel.debit_amount ELSE 0 END) AS current_invoices,
                  SUM(CASE WHEN je.entry_date >= $1::date AND je.entry_date <= $2::date
                           THEN jel.credit_amount ELSE 0 END) AS payment,
                  SUM(CASE WHEN je.entry_date >= $1::date AND je.entry_date <= $2::date
                           THEN jel.debit_amount - jel.credit_amount ELSE 0 END) AS period_net
             FROM account_scope scope
             JOIN greentarget.journal_entry_lines jel
               ON jel.account_code = scope.account_code
             JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
             LEFT JOIN anchors a
               ON a.root_code = scope.root_code
              AND a.account_code = scope.account_code
            WHERE je.status = 'posted' AND je.entry_date <= $2::date
            GROUP BY scope.root_code
         )
         SELECT ch.code,
                ch.description,
                (COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0))::numeric(14,2) AS bal_bf,
                COALESCE(m.current_invoices, 0)::numeric(14,2) AS current_invoices,
                COALESCE(m.payment, 0)::numeric(14,2) AS payment,
                (COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0)
                 + COALESCE(m.period_net, 0))::numeric(14,2) AS total_due
           FROM children ch
           LEFT JOIN anchor_totals a ON a.root_code = ch.code
           LEFT JOIN movement m ON m.root_code = ch.code
          ORDER BY ch.sort_order ASC, ch.code ASC`,
        [startStr, endStr, includeDescendants]
      );

      const agingByCode = await computeFifoAging(
        endStr,
        year,
        month,
        includeDescendants
      );

      // Totals aggregate the FULL population, including zero-close debtors
      // (same legacy behaviour as TH).
      const totals = {
        bal_bf: 0,
        current_invoices: 0,
        payment: 0,
        total_due: 0,
        aging_current: 0,
        aging_1_month: 0,
        aging_2_months: 0,
        aging_3_plus: 0,
      };

      const allCustomers = result.rows.map((row) => {
        const aging = agingByCode.get(row.code) || {
          current_month: 0,
          one_month: 0,
          two_months: 0,
          three_months_plus: 0,
        };
        const customer = {
          account_no: row.code,
          particular: row.description || "UNNAMED",
          bal_bf: num(row.bal_bf),
          current_invoices: num(row.current_invoices),
          payment: num(row.payment),
          total_due: num(row.total_due),
          aging_current: aging.current_month,
          aging_1_month: aging.one_month,
          aging_2_months: aging.two_months,
          aging_3_plus: aging.three_months_plus,
        };

        totals.bal_bf += customer.bal_bf;
        totals.current_invoices += customer.current_invoices;
        totals.payment += customer.payment;
        totals.total_due += customer.total_due;
        totals.aging_current += customer.aging_current;
        totals.aging_1_month += customer.aging_1_month;
        totals.aging_2_months += customer.aging_2_months;
        totals.aging_3_plus += customer.aging_3_plus;

        return customer;
      });

      // The printed body lists only nonzero closes; includeZero=1 (the
      // interactive By Customer view) returns the full population with
      // server-side search, zero-balance filter and pagination.
      let customers =
        req.query.includeZero === "1"
          ? allCustomers
          : allCustomers.filter((c) => Math.abs(c.total_due) > 0.005);

      let totalCustomers = customers.length;
      let page = 1;
      if (req.query.includeZero === "1") {
        const search = String(req.query.search || "").trim().toLowerCase();
        if (search) {
          customers = customers.filter(
            (c) =>
              c.account_no.toLowerCase().includes(search) ||
              c.particular.toLowerCase().includes(search)
          );
        }
        if (req.query.hideZero === "1") {
          customers = customers.filter((c) => Math.abs(c.total_due) > 0.005);
        }
        totalCustomers = customers.length;
        if (req.query.page || req.query.limit) {
          const limit = Math.max(1, parseInt(req.query.limit, 10) || 200);
          const maxPage = Math.max(1, Math.ceil(totalCustomers / limit));
          page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), maxPage);
          customers = customers.slice((page - 1) * limit, page * limit);
        }
      }

      for (const key of Object.keys(totals)) {
        totals[key] = money(totals[key]);
      }

      res.json({
        statement_date: statementDate,
        report_datetime: reportDateTime,
        statement_month: month,
        statement_year: year,
        customers,
        totals,
        total_customers: totalCustomers,
        page,
      });
    } catch (error) {
      console.error("Error fetching Green Target general statement:", error);
      res.status(500).json({
        message: "Error fetching Green Target general statement",
        error: error.message,
      });
    }
  });

  return router;
}
