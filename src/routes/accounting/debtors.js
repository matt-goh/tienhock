// src/routes/accounting/debtors.js
import { Router } from "express";
import {
  fetchUnappliedOverpayments,
  fetchUnappliedOverpaymentAsOf,
} from "./overpayments.js";

export default function (pool, config) {
  const router = Router();

  // GET /api/debtors - Get debtors report, with optional filtering by month and year of invoice creation
  router.get("/", async (req, res) => {
    const { month, year } = req.query;
    try {
      let filterClause = "";
      const queryParams = [];

      if (month && year) {
        const monthInt = parseInt(month, 10);
        const yearInt = parseInt(year, 10);

        if (!isNaN(monthInt) && !isNaN(yearInt)) {
          // --- THE FIX IS HERE ---
          // 1. Cast createddate (text) to a bigint
          // 2. Divide by 1000 to convert milliseconds to seconds
          // 3. Use to_timestamp() to convert the seconds-based timestamp to a proper date
          filterClause = `AND EXTRACT(YEAR FROM to_timestamp(i.createddate::bigint / 1000)) = $2
                          AND EXTRACT(MONTH FROM to_timestamp(i.createddate::bigint / 1000)) = $1`;
          queryParams.push(monthInt);
          queryParams.push(yearInt);
        }
      }

      const query = `
      WITH invoice_payments AS (
        -- Calculate total payments per invoice
        SELECT
          p.invoice_id,
          SUM(p.amount_paid) as total_paid,
          json_agg(
            json_build_object(
              'payment_id', p.payment_id,
              'payment_method', p.payment_method,
              'payment_reference', p.payment_reference,
              'date', p.payment_date,
              'amount', p.amount_paid,
              'status', p.status
            ) ORDER BY p.payment_date
          ) as payments
        FROM payments p
        WHERE p.status NOT IN ('cancelled', 'pending')
        GROUP BY p.invoice_id
      ),
      invoice_adjustments AS (
        -- Active adjustment documents that affect the invoice's debtor balance.
        -- A paired Refund Note clears the debtor credit created by its Credit
        -- Note; standalone Refund Notes use CUST_DEP and do not belong here.
        SELECT
          ad.original_invoice_id,
          json_agg(
            json_build_object(
              'id', ad.id,
              'display_id', ad.display_id,
              'type', ad.type,
              'date', ad.createddate::text,
              'debit_amount', CASE
                WHEN ad.type = 'debit_note'
                  OR (ad.type = 'refund_note' AND ad.paired_with_id IS NOT NULL)
                THEN ad.totalamountpayable
                ELSE 0
              END,
              'credit_amount', CASE
                WHEN ad.type = 'credit_note' THEN ad.totalamountpayable
                ELSE 0
              END,
              'reason', ad.reason
            ) ORDER BY ad.createddate, ad.id
          ) AS adjustment_docs
        FROM adjustment_documents ad
        WHERE ad.status = 'active'
          AND COALESCE(ad.is_consolidated, false) = false
          AND (
            ad.type IN ('credit_note', 'debit_note')
            OR (ad.type = 'refund_note' AND ad.paired_with_id IS NOT NULL)
          )
        GROUP BY ad.original_invoice_id
      ),
      unpaid_invoices AS (
        -- Get all unpaid/partially paid invoices, with optional date filter
        SELECT
          i.id as invoice_id,
          i.salespersonid,
          i.customerid,
          i.createddate,
          i.totalamountpayable,
          i.balance_due,
          COALESCE(ip.total_paid, 0) as total_paid,
          COALESCE(ip.payments, '[]'::json) as payments,
          COALESCE(ia.adjustment_docs, '[]'::json) as adjustment_docs
        FROM invoices i
        LEFT JOIN invoice_payments ip ON i.id = ip.invoice_id
        LEFT JOIN invoice_adjustments ia ON i.id = ia.original_invoice_id
        WHERE i.invoice_status IN ('Unpaid', 'Overdue')
          AND i.balance_due > 0.01
          ${filterClause}
      ),
      customer_aggregates AS (
        -- Aggregate by customer
        SELECT
          ui.salespersonid,
          ui.customerid,
          c.name as customer_name,
          c.phone_number,
          c.credit_limit,
          c.address,
          c.city,
          c.state,
          MAX(ui.createddate) as latest_invoice_date, -- For ordering customers
          json_agg(
            json_build_object(
              'invoice_id', ui.invoice_id,
              'invoice_number', ui.invoice_id,
              'date', ui.createddate,
              'amount', ui.totalamountpayable,
              'payments', ui.payments,
              'adjustmentDocs', ui.adjustment_docs,
              'balance', ui.balance_due
            ) ORDER BY ui.createddate
          ) as invoices,
          SUM(ui.totalamountpayable) as total_amount,
          SUM(ui.total_paid) as total_paid,
          SUM(ui.balance_due) as total_balance
        FROM unpaid_invoices ui
        JOIN customers c ON ui.customerid = c.id
        GROUP BY ui.salespersonid, ui.customerid, c.name, c.phone_number, c.credit_limit, c.address, c.city, c.state
      )
      -- Final aggregation by salesman
      SELECT
        s.id as salesman_id,
        s.name as salesman_name,
        json_agg(
          json_build_object(
            'customer_id', ca.customerid,
            'customer_name', ca.customer_name,
            'phone_number', ca.phone_number,
            'address', ca.address,
            'city', ca.city,
            'state', ca.state,
            'invoices', ca.invoices,
            'total_amount', ca.total_amount,
            'total_paid', ca.total_paid,
            'total_balance', ca.total_balance,
            'credit_limit', ca.credit_limit,
            'credit_balance', ca.credit_limit - ca.total_balance
          ) ORDER BY ca.latest_invoice_date DESC
        ) as customers,
        SUM(ca.total_balance) as total_balance
      FROM customer_aggregates ca
      JOIN staffs s ON ca.salespersonid = s.id
      GROUP BY s.id, s.name
      ORDER BY SUM(ca.total_balance) DESC
        `;

      const result = await pool.query(query, queryParams);

      // Non-posting display extra: unapplied receipt overpayments (excess
      // allocations) currently held in CUST_DEP per customer. Kept out of the
      // SQL totals above so invoice/paid/balance figures are untouched.
      const allCustomerIds = result.rows.flatMap((row) =>
        (row.customers || []).map((customer) => customer.customer_id)
      );
      const overpaymentByCustomer = await fetchUnappliedOverpayments(
        pool,
        allCustomerIds
      );

      let grand_total_amount = 0;
      let grand_total_paid = 0;
      let grand_total_balance = 0;

      const salesmen = result.rows.map((row) => {
        const customers = row.customers || [];
        customers.forEach((customer) => {
          customer.unapplied_overpayment =
            overpaymentByCustomer.get(customer.customer_id) || 0;
          grand_total_amount += parseFloat(customer.total_amount || 0);
          grand_total_paid += parseFloat(customer.total_paid || 0);
          grand_total_balance += parseFloat(customer.total_balance || 0);
        });

        return {
          salesman_id: row.salesman_id,
          salesman_name: row.salesman_name,
          customers: customers,
          total_balance: parseFloat(row.total_balance || 0),
        };
      });

      res.json({
        salesmen,
        grand_total_amount,
        grand_total_paid,
        grand_total_balance,
        report_date: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching debtors report:", error);
      res.status(500).json({
        message: "Error fetching debtors report",
        error: error.message,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Shared helpers (Phase 7): statements read the customer DEBTOR child ledger
  // (posted journal lines) so invoices, receipts, CN/DN/RN and cash-bill
  // settlements all appear, and historical statements never change when later
  // receipts arrive. Openings use the anchor rule: latest anchor on/before the
  // period start plus posted movement from the anchor to the start.
  // ---------------------------------------------------------------------------

  const pad2 = (n) => String(n).padStart(2, "0");
  const isoDate = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

  /**
   * Legacy signed-ledger monthly FIFO aging (V3 parity with the scanned Trade
   * Debtor List). Charges enter their calendar month as signed buckets
   * (debits of S/DN/RN plus signed CN); payments (credits of S plus signed
   * REC) normalize carried credits, then consume positive buckets
   * oldest-first, any excess crediting the payment month. Buckets always sum
   * to the customer's ledger close. The simulation rolls forward from each
   * child's exact 2026-01-01 opening anchor (the debtor ledger starts in
   * 2026); later checkpoint anchors are consistent with that roll-forward, so
   * they are not re-seeded. Returns a Map of customerId ->
   * { current_month, one_month, two_months, three_months_plus } (RM, 2dp).
   */
  const LEGACY_LEDGER_START = "2026-01-01";

  const computeLegacyFifoAging = async (endStr, periodYear, periodMonth) => {
    const [childrenResult, anchorResult, monthlyResult] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ON (ac.code)
                ac.code AS child_code, c.id AS customer_id
           FROM account_codes ac
           JOIN customers c ON ac.code = c.id OR ac.code LIKE c.id || '-D%'
          WHERE ac.parent_code = 'DEBTOR'
          ORDER BY ac.code, (ac.code = c.id) DESC`
      ),
      pool.query(
        `SELECT account_code, SUM(amount) AS amount
           FROM account_opening_balances
          WHERE as_of_date = $1
          GROUP BY account_code`,
        [LEGACY_LEDGER_START]
      ),
      pool.query(
        `SELECT jel.account_code,
                EXTRACT(YEAR FROM je.entry_date)::integer AS y,
                EXTRACT(MONTH FROM je.entry_date)::integer AS m,
                SUM(CASE WHEN COALESCE(je.legacy_entry_type, je.entry_type) IN ('S', 'DN', 'RN')
                         THEN jel.debit_amount ELSE 0 END)
              + SUM(CASE WHEN COALESCE(je.legacy_entry_type, je.entry_type) = 'CN'
                         THEN jel.debit_amount - jel.credit_amount ELSE 0 END) AS current_amount,
                SUM(CASE WHEN COALESCE(je.legacy_entry_type, je.entry_type) = 'S'
                         THEN jel.credit_amount ELSE 0 END)
              + SUM(CASE WHEN COALESCE(je.legacy_entry_type, je.entry_type) = 'REC'
                         THEN jel.credit_amount - jel.debit_amount ELSE 0 END) AS payment_amount
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
           JOIN account_codes ac ON ac.code = jel.account_code
          WHERE je.status = 'posted'
            AND ac.parent_code = 'DEBTOR'
            AND je.entry_date >= $1 AND je.entry_date <= $2
          GROUP BY jel.account_code,
                   EXTRACT(YEAR FROM je.entry_date),
                   EXTRACT(MONTH FROM je.entry_date)`,
        [LEGACY_LEDGER_START, endStr]
      ),
    ]);

    const anchorCentsByChild = new Map(
      anchorResult.rows.map((r) => [
        r.account_code,
        Math.round((parseFloat(r.amount) || 0) * 100),
      ])
    );
    const monthlyByChild = new Map();
    for (const r of monthlyResult.rows) {
      let months = monthlyByChild.get(r.account_code);
      if (!months) {
        months = new Map();
        monthlyByChild.set(r.account_code, months);
      }
      months.set(`${r.y}-${pad2(r.m)}`, {
        currentCents: Math.round((parseFloat(r.current_amount) || 0) * 100),
        paymentCents: Math.round((parseFloat(r.payment_amount) || 0) * 100),
      });
    }

    // Calendar months from the ledger start through the selected period.
    const monthKeys = [];
    for (let y = 2026, m = 1; y < periodYear || (y === periodYear && m <= periodMonth); ) {
      monthKeys.push(`${y}-${pad2(m)}`);
      m += 1;
      if (m === 13) {
        y += 1;
        m = 1;
      }
    }

    const agingByCustomer = new Map();
    for (const row of childrenResult.rows) {
      const buckets = [
        { key: "old", amountCents: anchorCentsByChild.get(row.child_code) || 0 },
      ];
      const months = monthlyByChild.get(row.child_code) || new Map();
      for (const key of monthKeys) {
        const movement = months.get(key) || { currentCents: 0, paymentCents: 0 };
        let { currentCents, paymentCents } = movement;
        if (paymentCents < 0) {
          // Not seen in the pinned window: fold a net-outgoing month into the
          // month's charges rather than carry a negative payment bucket.
          currentCents += paymentCents;
          paymentCents = 0;
        }
        if (paymentCents > 0) {
          // Normalize carried credits, then consume positive buckets oldest-first.
          for (const negative of buckets.filter((b) => b.amountCents < 0)) {
            for (const positive of buckets) {
              if (negative.amountCents >= 0) break;
              if (positive.amountCents <= 0) continue;
              const used = Math.min(-negative.amountCents, positive.amountCents);
              negative.amountCents += used;
              positive.amountCents -= used;
            }
          }
          let remaining = paymentCents;
          for (const bucket of buckets) {
            if (remaining <= 0) break;
            if (bucket.amountCents <= 0) continue;
            const used = Math.min(remaining, bucket.amountCents);
            bucket.amountCents -= used;
            remaining -= used;
          }
          currentCents -= remaining;
        }
        if (currentCents !== 0) buckets.push({ key, amountCents: currentCents });
      }

      const ageOf = (key) => {
        if (key === "old") return 3;
        const [y, m] = key.split("-").map(Number);
        return (periodYear - y) * 12 + (periodMonth - m);
      };
      let current = 0;
      let oneMonth = 0;
      let twoMonths = 0;
      let threePlus = 0;
      for (const bucket of buckets) {
        const age = ageOf(bucket.key);
        if (age === 0) current += bucket.amountCents;
        else if (age === 1) oneMonth += bucket.amountCents;
        else if (age === 2) twoMonths += bucket.amountCents;
        else threePlus += bucket.amountCents;
      }

      agingByCustomer.set(row.customer_id, {
        current_month: roundMoney(current / 100),
        one_month: roundMoney(oneMonth / 100),
        two_months: roundMoney(twoMonths / 100),
        three_months_plus: roundMoney(threePlus / 100),
      });
    }
    return agingByCustomer;
  };

  /** Resolve a customer's debtor child account code (same rule as debtorSync). */
  const resolveChildCode = async (customerId) => {
    const result = await pool.query(
      `SELECT code FROM account_codes
        WHERE parent_code = 'DEBTOR'
          AND (code = $1 OR code LIKE $1 || '-D%')
        ORDER BY (code = $1) DESC, code
        LIMIT 1`,
      [customerId]
    );
    return result.rows.length > 0 ? result.rows[0].code : null;
  };

  /** Anchor-rule opening balance of one child account at startStr (yyyy-MM-dd). */
  const childOpeningBalance = async (childCode, startStr) => {
    const anchorResult = await pool.query(
      `SELECT to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date, amount
         FROM account_opening_balances
        WHERE account_code = $1 AND as_of_date <= $2
        ORDER BY as_of_date DESC LIMIT 1`,
      [childCode, startStr]
    );
    const anchor = anchorResult.rows[0] || null;
    const movementResult = await pool.query(
      `SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) AS movement
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
          AND jel.account_code = $1
          AND je.entry_date < $2
          ${anchor ? "AND je.entry_date >= $3" : ""}`,
      anchor ? [childCode, startStr, anchor.as_of_date] : [childCode, startStr]
    );
    return (
      (anchor ? parseFloat(anchor.amount) || 0 : 0) +
      (parseFloat(movementResult.rows[0].movement) || 0)
    );
  };

  // GET /api/debtors/statement/:customerId - Customer statement for a month,
  // built from the customer's debtor child ledger (posted journal lines).
  router.get("/statement/:customerId", async (req, res) => {
    const { customerId } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required query parameters",
      });
    }

    const monthInt = parseInt(month, 10);
    const yearInt = parseInt(year, 10);

    if (isNaN(monthInt) || isNaN(yearInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({
        message: "Invalid month or year",
      });
    }

    try {
      const lastDay = new Date(yearInt, monthInt, 0).getDate();
      const startStr = isoDate(yearInt, monthInt, 1);
      const endStr = isoDate(yearInt, monthInt, lastDay);
      const statementDate = `${pad2(lastDay)}/${pad2(monthInt)}/${yearInt}`;

      // 1. Customer details
      const customerResult = await pool.query(
        `SELECT id, name, address, city, state, phone_number, email
           FROM customers WHERE id = $1`,
        [customerId]
      );
      if (customerResult.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const customer = customerResult.rows[0];

      const childCode = await resolveChildCode(customerId);

      // 2. Opening balance (anchor rule on the debtor child ledger)
      const previousBalance = childCode
        ? await childOpeningBalance(childCode, startStr)
        : 0;

      // 3. Transactions = posted journal lines on the child within the month
      //    (invoices, receipts, CN/DN/RN, cash-bill settlements), ordered like
      //    the Account Ledger.
      let transactions = [];
      let runningBalance = previousBalance;
      if (childCode) {
        const txResult = await pool.query(
          `SELECT je.entry_date,
                  COALESCE(jel.display_reference, je.display_reference, je.reference_no) AS ref,
                  jel.particulars,
                  jel.debit_amount, jel.credit_amount
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted'
              AND jel.account_code = $1
              AND je.entry_date >= $2 AND je.entry_date <= $3
              AND (jel.debit_amount > 0 OR jel.credit_amount > 0)
            ORDER BY je.entry_date,
                     je.posting_sequence ASC NULLS LAST,
                     COALESCE(jel.display_reference, je.display_reference, je.reference_no),
                     je.id, jel.line_number`,
          [childCode, startStr, endStr]
        );
        transactions = txResult.rows.map((row) => {
          const debit = parseFloat(row.debit_amount) || 0;
          const credit = parseFloat(row.credit_amount) || 0;
          runningBalance += debit - credit;
          const d =
            row.entry_date instanceof Date
              ? `${pad2(row.entry_date.getDate())}/${pad2(row.entry_date.getMonth() + 1)}/${row.entry_date.getFullYear()}`
              : String(row.entry_date).slice(0, 10).split("-").reverse().join("/");
          return {
            date: d,
            particulars: row.particulars || row.ref || "",
            reference: row.ref,
            type: debit > 0 ? "debit" : "credit",
            amount: debit > 0 ? debit : credit,
            running_balance: runningBalance,
          };
        });
      }

      // 4. Aging as at the period end (legacy signed-ledger monthly FIFO —
      //    the same model the printed Trade Debtor List uses; the buckets sum
      //    to the ledger close by construction).
      const agingByCustomer = await computeLegacyFifoAging(endStr, yearInt, monthInt);
      const aging = agingByCustomer.get(customerId) || {
        current_month: 0,
        one_month: 0,
        two_months: 0,
        three_months_plus: 0,
      };

      // Non-posting display extra: overpayments (receipt excess allocations)
      // held in CUST_DEP as at the statement date. Never part of the ledger
      // transactions or running balance above.
      const unappliedOverpayment = await fetchUnappliedOverpaymentAsOf(
        pool,
        customerId,
        endStr
      );

      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
          address: customer.address,
          city: customer.city,
          state: customer.state,
          phone_number: customer.phone_number,
          email: customer.email,
        },
        statement_date: statementDate,
        statement_month: monthInt,
        statement_year: yearInt,
        previous_balance: previousBalance,
        transactions,
        total_amount_due: runningBalance,
        aging,
        unapplied_overpayment: unappliedOverpayment,
      });
    } catch (error) {
      console.error("Error fetching customer statement:", error);
      res.status(500).json({
        message: "Error fetching customer statement",
        error: error.message,
      });
    }
  });

  // GET /api/debtors/general-statement - Get general debtor list for all customers
  // Shows all customers with any outstanding debt up to the specified month
  router.get("/general-statement", async (req, res) => {
    const { month, year, includeZero } = req.query;

    // Default to current month if not provided
    const now = new Date();
    const monthInt = month ? parseInt(month, 10) : now.getMonth() + 1;
    const yearInt = year ? parseInt(year, 10) : now.getFullYear();

    if (isNaN(monthInt) || isNaN(yearInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({
        message: "Invalid month or year",
      });
    }

    try {
      const lastDay = new Date(yearInt, monthInt, 0).getDate();
      const startStr = isoDate(yearInt, monthInt, 1);
      const endStr = isoDate(yearInt, monthInt, lastDay);

      // Format dates for display
      const statementDate = `${pad2(lastDay)}/${pad2(monthInt)}/${yearInt}`;
      const reportDateTime = new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      // One bulk query over the customer DEBTOR child ledgers (no per-customer
      // round-trips): BAL B/F = latest anchor on/before the period start plus
      // posted movement from the anchor to the start. CURRENT and PAYMENT
      // follow the legacy Trade Debtor List column rules (V3 parity):
      //   CURRENT = S/DN/RN debits net of CN credits (new charges);
      //   PAYMENT = REC and S cash-auto-collection credits net of REC debits
      //     (money received; positive).
      // Other journal types never appear in either column. TOTAL DUE is the
      // full ledger close (B/F + all movement) — identical to
      // B/F + CURRENT − PAYMENT whenever only the five legacy document types
      // moved, which is every month in the pinned Jan–May window.
      const query = `
        WITH children AS (
          -- One customer per child: the exact id match wins over the -D
          -- fallback pattern (customers literally named "X-D" exist).
          SELECT DISTINCT ON (ac.code)
                 ac.code AS child_code, c.id AS customer_id, c.name AS customer_name
            FROM account_codes ac
            JOIN customers c
              ON ac.code = c.id OR ac.code LIKE c.id || '-D%'
           WHERE ac.parent_code = 'DEBTOR'
           ORDER BY ac.code, (ac.code = c.id) DESC
        ),
        anchors AS (
          SELECT DISTINCT ON (aob.account_code)
                 aob.account_code, aob.amount,
                 to_char(aob.as_of_date, 'YYYY-MM-DD') AS as_of_date
            FROM account_opening_balances aob
            JOIN children ch ON ch.child_code = aob.account_code
           WHERE aob.as_of_date <= $1
           ORDER BY aob.account_code, aob.as_of_date DESC
        ),
        movement AS (
          SELECT jel.account_code,
                 SUM(CASE WHEN je.entry_date < $1
                            AND (a.as_of_date IS NULL OR je.entry_date >= a.as_of_date::date)
                          THEN jel.debit_amount - jel.credit_amount ELSE 0 END) AS pre_movement,
                 SUM(CASE WHEN je.entry_date >= $1 AND je.entry_date <= $2
                           AND COALESCE(je.legacy_entry_type, je.entry_type) IN ('S', 'DN', 'RN')
                          THEN jel.debit_amount ELSE 0 END)
               - SUM(CASE WHEN je.entry_date >= $1 AND je.entry_date <= $2
                           AND COALESCE(je.legacy_entry_type, je.entry_type) = 'CN'
                          THEN jel.credit_amount ELSE 0 END) AS current_invoices,
                 SUM(CASE WHEN je.entry_date >= $1 AND je.entry_date <= $2
                           AND COALESCE(je.legacy_entry_type, je.entry_type) IN ('S', 'REC')
                          THEN jel.credit_amount ELSE 0 END)
               - SUM(CASE WHEN je.entry_date >= $1 AND je.entry_date <= $2
                           AND COALESCE(je.legacy_entry_type, je.entry_type) = 'REC'
                          THEN jel.debit_amount ELSE 0 END) AS payment,
                 SUM(CASE WHEN je.entry_date >= $1 AND je.entry_date <= $2
                          THEN jel.debit_amount - jel.credit_amount ELSE 0 END) AS period_net
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            JOIN children ch ON ch.child_code = jel.account_code
            LEFT JOIN anchors a ON a.account_code = jel.account_code
           WHERE je.status = 'posted' AND je.entry_date <= $2
           GROUP BY jel.account_code
        )
        SELECT ch.customer_id,
               ch.customer_name,
               (COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0))::numeric(14,2) AS bal_bf,
               COALESCE(m.current_invoices, 0)::numeric(14,2) AS current_invoices,
               COALESCE(m.payment, 0)::numeric(14,2) AS payment,
               (COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0)
                + COALESCE(m.period_net, 0))::numeric(14,2) AS total_due
          FROM children ch
          LEFT JOIN anchors a ON a.account_code = ch.child_code
          LEFT JOIN movement m ON m.account_code = ch.child_code
         ORDER BY ch.customer_id ASC
      `;
      const result = await pool.query(query, [startStr, endStr]);

      // Legacy signed-ledger monthly FIFO aging for every customer in one pass.
      const agingByCustomer = await computeLegacyFifoAging(endStr, yearInt, monthInt);

      // Totals aggregate the FULL population, including the zero-close
      // customers the printed body omits (legacy report behaviour).
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
        const totalDue = parseFloat(row.total_due) || 0;
        const aging = agingByCustomer.get(row.customer_id) || {
          current_month: 0,
          one_month: 0,
          two_months: 0,
          three_months_plus: 0,
        };
        const customer = {
          account_no: row.customer_id,
          particular: row.customer_name || "UNNAMED",
          bal_bf: parseFloat(row.bal_bf) || 0,
          current_invoices: parseFloat(row.current_invoices) || 0,
          payment: parseFloat(row.payment) || 0,
          total_due: totalDue,
          aging_current: aging.current_month,
          aging_1_month: aging.one_month,
          aging_2_months: aging.two_months,
          aging_3_plus: aging.three_months_plus,
        };

        const agingSum =
          customer.aging_current +
          customer.aging_1_month +
          customer.aging_2_months +
          customer.aging_3_plus;
        if (Math.abs(agingSum - customer.total_due) > 0.005) {
          console.warn(
            `general-statement: FIFO aging ${agingSum.toFixed(2)} != ledger close ${customer.total_due.toFixed(2)} for ${customer.account_no}`
          );
        }

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

      // The printed body lists only nonzero closes; the totals row above still
      // aggregates the omitted zero-close rows. includeZero=1 (the interactive
      // By Customer view) returns the full population instead.
      let customers =
        includeZero === "1"
          ? allCustomers
          : allCustomers.filter((c) => Math.abs(c.total_due) > 0.005);

      // Interactive By Customer view extras (includeZero=1): server-side
      // search, zero-balance filter and pagination over the full population.
      // The totals above always aggregate every customer (legacy behaviour).
      let totalCustomers = customers.length;
      let page = 1;
      if (includeZero === "1") {
        const search = String(req.query.search || "")
          .trim()
          .toLowerCase();
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
          const limit = Math.max(1, parseInt(req.query.limit, 10) || 100);
          const maxPage = Math.max(1, Math.ceil(totalCustomers / limit));
          page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), maxPage);
          customers = customers.slice((page - 1) * limit, page * limit);
        }
      }

      for (const key of Object.keys(totals)) {
        totals[key] = roundMoney(totals[key]);
      }

      res.json({
        statement_date: statementDate,
        report_datetime: reportDateTime,
        statement_month: monthInt,
        statement_year: yearInt,
        customers,
        totals,
        total_customers: totalCustomers,
        page,
      });
    } catch (error) {
      console.error("Error fetching general statement:", error);
      res.status(500).json({
        message: "Error fetching general statement",
        error: error.message,
      });
    }
  });

  return router;
}
