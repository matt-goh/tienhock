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
// The 28 trade debtors are the TD children of the DEBTOR control account.
// Every figure below is therefore derived from greentarget.journal_entry_lines
// anchored on greentarget.account_opening_balances (all anchors 2026-01-01):
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
   * All 28 TD children with their opening balance at startStr (anchor rule:
   * latest anchor on/before startStr plus posted movement from the anchor to
   * startStr). Ordered by the printed Trial Balance order (sort_order).
   */
  const fetchChildrenWithOpenings = async (startStr) => {
    const result = await pool.query(
      `WITH children AS (
         SELECT code, description, sort_order
           FROM greentarget.account_codes
          WHERE parent_code = 'DEBTOR'
            AND ledger_type = 'TD'
            AND is_active = true
       ),
       anchors AS (
         SELECT DISTINCT ON (aob.account_code)
                aob.account_code, aob.amount, aob.as_of_date
           FROM greentarget.account_opening_balances aob
           JOIN children ch ON ch.code = aob.account_code
          WHERE aob.as_of_date <= $1::date
          ORDER BY aob.account_code, aob.as_of_date DESC
       ),
       pre AS (
         SELECT jel.account_code,
                SUM(jel.debit_amount - jel.credit_amount) AS movement
           FROM greentarget.journal_entry_lines jel
           JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
           JOIN children ch ON ch.code = jel.account_code
           LEFT JOIN anchors a ON a.account_code = jel.account_code
          WHERE je.status = 'posted'
            AND je.entry_date < $1::date
            AND (a.as_of_date IS NULL OR je.entry_date >= a.as_of_date)
          GROUP BY jel.account_code
       )
       SELECT ch.code,
              ch.description,
              ch.sort_order,
              (COALESCE(a.amount, 0) + COALESCE(p.movement, 0))::numeric(14,2) AS opening
         FROM children ch
         LEFT JOIN anchors a ON a.account_code = ch.code
         LEFT JOIN pre p ON p.account_code = ch.code
        ORDER BY ch.sort_order ASC, ch.code ASC`,
      [startStr]
    );
    return result.rows;
  };

  /**
   * Posted TD-child ledger lines inside [startStr, endStr], in GT ledger order
   * (posting_sequence, then display_order — never a bare date sort).
   */
  const fetchMonthLines = async (startStr, endStr) => {
    const result = await pool.query(
      `SELECT jel.account_code,
              jel.id AS line_id,
              COALESCE(jel.display_reference, je.display_reference, je.reference_no) AS ref,
              to_char(je.entry_date, 'YYYY-MM-DD') AS entry_date,
              jel.debit_amount,
              jel.credit_amount
         FROM greentarget.journal_entry_lines jel
         JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
         JOIN greentarget.account_codes ac ON ac.code = jel.account_code
        WHERE je.status = 'posted'
          AND ac.parent_code = 'DEBTOR'
          AND je.entry_date >= $1::date
          AND je.entry_date <= $2::date
          AND (jel.debit_amount > 0 OR jel.credit_amount > 0)
        ORDER BY jel.account_code,
                 je.posting_sequence ASC NULLS LAST,
                 je.entry_date ASC,
                 je.id ASC,
                 jel.display_order ASC NULLS LAST,
                 jel.line_number ASC,
                 jel.id ASC`,
      [startStr, endStr]
    );
    return result.rows;
  };

  /**
   * Monthly FIFO aging for every TD child as at the period end, rolled forward
   * from the exact 2026-01-01 opening anchors. Each month's net movement is a
   * signed bucket: positive nets first offset carried credit buckets, negative
   * nets consume positive buckets oldest-first, any excess crediting the
   * current month. Buckets always sum to the child's ledger close.
   *
   * Returns a Map of account code ->
   * { current_month, one_month, two_months, three_months_plus } (RM, 2dp).
   */
  const computeFifoAging = async (endStr, periodYear, periodMonth) => {
    const [childrenResult, anchorResult, monthlyResult] = await Promise.all([
      pool.query(
        `SELECT code
           FROM greentarget.account_codes
          WHERE parent_code = 'DEBTOR' AND ledger_type = 'TD' AND is_active = true`
      ),
      pool.query(
        `SELECT aob.account_code, SUM(aob.amount) AS amount
           FROM greentarget.account_opening_balances aob
           JOIN greentarget.account_codes ac ON ac.code = aob.account_code
          WHERE ac.parent_code = 'DEBTOR'
            AND aob.as_of_date = $1::date
          GROUP BY aob.account_code`,
        [LEGACY_LEDGER_START]
      ),
      pool.query(
        `SELECT jel.account_code,
                EXTRACT(YEAR FROM je.entry_date)::integer AS y,
                EXTRACT(MONTH FROM je.entry_date)::integer AS m,
                SUM(jel.debit_amount - jel.credit_amount) AS net
           FROM greentarget.journal_entry_lines jel
           JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
           JOIN greentarget.account_codes ac ON ac.code = jel.account_code
          WHERE je.status = 'posted'
            AND ac.parent_code = 'DEBTOR'
            AND je.entry_date >= $1::date
            AND je.entry_date <= $2::date
          GROUP BY jel.account_code,
                   EXTRACT(YEAR FROM je.entry_date),
                   EXTRACT(MONTH FROM je.entry_date)`,
        [LEGACY_LEDGER_START, endStr]
      ),
    ]);

    const anchorCentsByCode = new Map(
      anchorResult.rows.map((row) => [row.account_code, cents(row.amount)])
    );
    const monthlyByCode = new Map();
    for (const row of monthlyResult.rows) {
      let months = monthlyByCode.get(row.account_code);
      if (!months) {
        months = new Map();
        monthlyByCode.set(row.account_code, months);
      }
      months.set(`${row.y}-${pad2(row.m)}`, cents(row.net));
    }

    const monthKeys = [];
    for (
      let y = 2026, m = 1;
      y < periodYear || (y === periodYear && m <= periodMonth);

    ) {
      monthKeys.push(`${y}-${pad2(m)}`);
      m += 1;
      if (m === 13) {
        y += 1;
        m = 1;
      }
    }

    const agingByCode = new Map();
    for (const child of childrenResult.rows) {
      const buckets = [];
      const anchorCents = anchorCentsByCode.get(child.code) || 0;
      if (anchorCents !== 0) {
        buckets.push({ key: "2026-01", amountCents: anchorCents });
      }
      const months = monthlyByCode.get(child.code) || new Map();
      for (const key of monthKeys) {
        let net = months.get(key) || 0;
        if (net > 0) {
          // New charges first settle carried credit buckets, oldest first.
          for (const bucket of buckets) {
            if (net <= 0) break;
            if (bucket.amountCents >= 0) continue;
            const used = Math.min(-bucket.amountCents, net);
            bucket.amountCents += used;
            net -= used;
          }
          if (net > 0) buckets.push({ key, amountCents: net });
        } else if (net < 0) {
          // Money received consumes positive buckets oldest-first; any excess
          // credits the current month.
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
        const [y, m] = key.split("-").map(Number);
        return (periodYear - y) * 12 + (periodMonth - m);
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

      agingByCode.set(child.code, {
        current_month: money(current / 100),
        one_month: money(oneMonth / 100),
        two_months: money(twoMonths / 100),
        three_months_plus: money(threePlus / 100),
      });
    }
    return agingByCode;
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
      const [children, monthLines] = await Promise.all([
        fetchChildrenWithOpenings(startStr),
        fetchMonthLines(startStr, endStr),
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

      const ledger = await buildAccountLedger(pool, customerId, startStr, endStr);
      if (ledger.account.parent_code !== "DEBTOR") {
        return res.status(404).json({ message: "Debtor account not found" });
      }

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

      const agingByCode = await computeFifoAging(endStr, year, month);
      const aging = agingByCode.get(customerId) || {
        current_month: 0,
        one_month: 0,
        two_months: 0,
        three_months_plus: 0,
      };

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

      const result = await pool.query(
        `WITH children AS (
           SELECT code, description, sort_order
             FROM greentarget.account_codes
            WHERE parent_code = 'DEBTOR'
              AND ledger_type = 'TD'
              AND is_active = true
         ),
         anchors AS (
           SELECT DISTINCT ON (aob.account_code)
                  aob.account_code, aob.amount, aob.as_of_date
             FROM greentarget.account_opening_balances aob
             JOIN children ch ON ch.code = aob.account_code
            WHERE aob.as_of_date <= $1::date
            ORDER BY aob.account_code, aob.as_of_date DESC
         ),
         movement AS (
           SELECT jel.account_code,
                  SUM(CASE WHEN je.entry_date < $1::date
                            AND (a.as_of_date IS NULL OR je.entry_date >= a.as_of_date)
                           THEN jel.debit_amount - jel.credit_amount ELSE 0 END) AS pre_movement,
                  SUM(CASE WHEN je.entry_date >= $1::date AND je.entry_date <= $2::date
                           THEN jel.debit_amount ELSE 0 END) AS current_invoices,
                  SUM(CASE WHEN je.entry_date >= $1::date AND je.entry_date <= $2::date
                           THEN jel.credit_amount ELSE 0 END) AS payment,
                  SUM(CASE WHEN je.entry_date >= $1::date AND je.entry_date <= $2::date
                           THEN jel.debit_amount - jel.credit_amount ELSE 0 END) AS period_net
             FROM greentarget.journal_entry_lines jel
             JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
             JOIN children ch ON ch.code = jel.account_code
             LEFT JOIN anchors a ON a.account_code = jel.account_code
            WHERE je.status = 'posted' AND je.entry_date <= $2::date
            GROUP BY jel.account_code
         )
         SELECT ch.code,
                ch.description,
                (COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0))::numeric(14,2) AS bal_bf,
                COALESCE(m.current_invoices, 0)::numeric(14,2) AS current_invoices,
                COALESCE(m.payment, 0)::numeric(14,2) AS payment,
                (COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0)
                 + COALESCE(m.period_net, 0))::numeric(14,2) AS total_due
           FROM children ch
           LEFT JOIN anchors a ON a.account_code = ch.code
           LEFT JOIN movement m ON m.account_code = ch.code
          ORDER BY ch.sort_order ASC, ch.code ASC`,
        [startStr, endStr]
      );

      const agingByCode = await computeFifoAging(endStr, year, month);

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
