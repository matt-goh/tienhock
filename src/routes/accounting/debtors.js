// src/routes/accounting/debtors.js
import { Router } from "express";

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

      let grand_total_amount = 0;
      let grand_total_paid = 0;
      let grand_total_balance = 0;

      const salesmen = result.rows.map((row) => {
        const customers = row.customers || [];
        customers.forEach((customer) => {
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

  /**
   * As-of-date invoice aging for one or all customers. Each open invoice's
   * outstanding AS AT the period end = total − active receipts effective by
   * the end date − credit notes ≤ end + debit notes ≤ end. Receipt-backed
   * payments use the accounting posting/clearance date; legacy rows fall back
   * to payment_date. Never use today's mutable balance_due here.
   */
  const agingSql = `
    SELECT i.customerid,
      COALESCE(SUM(CASE WHEN inv_date >= $2 THEN outstanding ELSE 0 END), 0) AS aging_current,
      COALESCE(SUM(CASE WHEN inv_date >= ($2::date - INTERVAL '1 month') AND inv_date < $2 THEN outstanding ELSE 0 END), 0) AS aging_1_month,
      COALESCE(SUM(CASE WHEN inv_date >= ($2::date - INTERVAL '2 months') AND inv_date < ($2::date - INTERVAL '1 month') THEN outstanding ELSE 0 END), 0) AS aging_2_months,
      COALESCE(SUM(CASE WHEN inv_date < ($2::date - INTERVAL '2 months') THEN outstanding ELSE 0 END), 0) AS aging_3_plus
    FROM (
      SELECT i0.id, i0.customerid,
             (to_timestamp(i0.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS inv_date,
             i0.totalamountpayable
             - COALESCE((SELECT SUM(p.amount_paid)
                          FROM payments p
                          LEFT JOIN receipt_allocations ra
                            ON ra.id = p.receipt_allocation_id
                          LEFT JOIN receipts r ON r.id = ra.receipt_id
                          WHERE p.invoice_id = i0.id
                            AND (p.status IS NULL OR p.status = 'active')
                            AND COALESCE(r.posting_date, p.payment_date)::date <= $3), 0)
             - COALESCE((SELECT SUM(ad.totalamountpayable) FROM adjustment_documents ad
                          WHERE ad.original_invoice_id = i0.id AND ad.type = 'credit_note'
                            AND ad.status = 'active' AND COALESCE(ad.is_consolidated, false) = false
                            AND (to_timestamp(ad.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $3), 0)
             + COALESCE((SELECT SUM(ad.totalamountpayable) FROM adjustment_documents ad
                          WHERE ad.original_invoice_id = i0.id AND ad.type = 'debit_note'
                            AND ad.status = 'active' AND COALESCE(ad.is_consolidated, false) = false
                            AND (to_timestamp(ad.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $3), 0)
             AS outstanding
        FROM invoices i0
       WHERE i0.invoice_status <> 'cancelled'
         AND COALESCE(i0.is_consolidated, false) = false
         AND (to_timestamp(i0.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $3
         AND ($1::varchar IS NULL OR i0.customerid = $1)
    ) i
    WHERE i.outstanding > 0.01
    GROUP BY i.customerid
  `;

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

      // 4. Aging as at the period end (per-invoice as-of outstanding)
      const agingResult = await pool.query(agingSql, [customerId, startStr, endStr]);
      const agingRow = agingResult.rows[0] || {};
      const aging = {
        current_month: parseFloat(agingRow.aging_current || 0),
        one_month: parseFloat(agingRow.aging_1_month || 0),
        two_months: parseFloat(agingRow.aging_2_months || 0),
        three_months_plus: parseFloat(agingRow.aging_3_plus || 0),
      };

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
    const { month, year } = req.query;

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
      // posted movement from the anchor to the start; the period columns are
      // the child's posted debits (invoices/DN) and credits (receipts/CN/
      // cash-bill settlements); TOTAL DUE = B/F + debits − credits.
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
                          THEN jel.debit_amount ELSE 0 END) AS period_debits,
                 SUM(CASE WHEN je.entry_date >= $1 AND je.entry_date <= $2
                          THEN jel.credit_amount ELSE 0 END) AS period_credits
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
               COALESCE(m.period_debits, 0)::numeric(14,2) AS current_invoices,
               COALESCE(m.period_credits, 0)::numeric(14,2) AS payment,
               (COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0)
                + COALESCE(m.period_debits, 0) - COALESCE(m.period_credits, 0))::numeric(14,2) AS total_due
          FROM children ch
          LEFT JOIN anchors a ON a.account_code = ch.child_code
          LEFT JOIN movement m ON m.account_code = ch.child_code
         WHERE ABS(COALESCE(a.amount, 0) + COALESCE(m.pre_movement, 0)) > 0.005
            OR COALESCE(m.period_debits, 0) > 0.005
            OR COALESCE(m.period_credits, 0) > 0.005
         ORDER BY ch.customer_id ASC
      `;
      const result = await pool.query(query, [startStr, endStr]);

      // As-of aging for all customers in one pass (per-invoice outstanding at
      // the period end; never today's mutable balance_due).
      const agingResult = await pool.query(agingSql, [null, startStr, endStr]);
      const agingByCustomer = {};
      for (const row of agingResult.rows) {
        agingByCustomer[row.customerid] = row;
      }

      // Process results and calculate totals
      let totals = {
        bal_bf: 0,
        current_invoices: 0,
        payment: 0,
        total_due: 0,
        aging_current: 0,
        aging_1_month: 0,
        aging_2_months: 0,
        aging_3_plus: 0,
      };

      const customers = result.rows.map((row) => {
        const aging = agingByCustomer[row.customer_id] || {};
        const customer = {
          account_no: row.customer_id,
          particular: row.customer_name || "UNNAMED",
          bal_bf: parseFloat(row.bal_bf) || 0,
          current_invoices: parseFloat(row.current_invoices) || 0,
          payment: parseFloat(row.payment) || 0,
          total_due: parseFloat(row.total_due) || 0,
          aging_current: parseFloat(aging.aging_current) || 0,
          aging_1_month: parseFloat(aging.aging_1_month) || 0,
          aging_2_months: parseFloat(aging.aging_2_months) || 0,
          aging_3_plus: parseFloat(aging.aging_3_plus) || 0,
        };

        // Accumulate totals
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

      res.json({
        statement_date: statementDate,
        report_datetime: reportDateTime,
        statement_month: monthInt,
        statement_year: yearInt,
        customers,
        totals,
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
