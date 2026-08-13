// src/routes/jellypolly/debtors.js
import { Router } from "express";
import { JELLY_POLLY_DEBTOR_MOVEMENTS_CTE } from "./account-ledger.js";

const pad2 = (value) => String(value).padStart(2, "0");
const isoDate = (year, month, day) =>
  `${year}-${pad2(month)}-${pad2(day)}`;
const cents = (value) => Math.round((Number(value) || 0) * 100);
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

export default function (pool, config) {
const router = Router();

  /**
   * Build signed FIFO aging from the same virtual movements and opening-anchor
   * cutoff used by the JP Account Ledger. The applicable anchor is the latest
   * one on/before the selected month start; its residual is always the oldest
   * bucket, and subsequent credits (payments or credit notes) consume positive
   * buckets oldest first. Every returned set is asserted to add back to its
   * ledger close.
   *
   * @param {string} startStr
   * @param {string} endStr
   * @param {number} periodYear
   * @param {number} periodMonth
   * @returns {Promise<Map<string, {
   *   current_month: number,
   *   one_month: number,
   *   two_months: number,
   *   three_months_plus: number,
   *   total_due: number
   * }>>}
   */
  const computeAnchorAwareAging = async (
    startStr,
    endStr,
    periodYear,
    periodMonth
  ) => {
    const result = await pool.query(
      `${JELLY_POLLY_DEBTOR_MOVEMENTS_CTE},
       customer_scope AS (
         SELECT customer_id
         FROM movements
         WHERE entry_date <= $2::date
         UNION
         SELECT customer_id
         FROM jellypolly.debtor_opening_balances
         WHERE as_of_date <= $1::date
       ),
       anchors AS (
         SELECT DISTINCT ON (opening.customer_id)
                opening.customer_id,
                opening.as_of_date,
                opening.amount
         FROM jellypolly.debtor_opening_balances opening
         JOIN customer_scope scope ON scope.customer_id = opening.customer_id
         WHERE opening.as_of_date <= $1::date
         ORDER BY opening.customer_id, opening.as_of_date DESC
       )
       SELECT scope.customer_id,
              TO_CHAR(anchor.as_of_date, 'YYYY-MM-DD') AS anchor_date,
              anchor.amount AS anchor_amount,
              EXTRACT(YEAR FROM movement.entry_date)::integer AS movement_year,
              EXTRACT(MONTH FROM movement.entry_date)::integer AS movement_month,
              COALESCE(SUM(movement.debit_amount), 0) AS debit_amount,
              COALESCE(SUM(movement.credit_amount), 0) AS credit_amount
       FROM customer_scope scope
       LEFT JOIN anchors anchor ON anchor.customer_id = scope.customer_id
       LEFT JOIN movements movement
         ON movement.customer_id = scope.customer_id
        AND movement.entry_date <= $2::date
        AND (
          anchor.as_of_date IS NULL
          OR movement.entry_date >= anchor.as_of_date
        )
       GROUP BY scope.customer_id,
                anchor.as_of_date,
                anchor.amount,
                EXTRACT(YEAR FROM movement.entry_date),
                EXTRACT(MONTH FROM movement.entry_date)
       ORDER BY scope.customer_id,
                movement_year ASC NULLS FIRST,
                movement_month ASC NULLS FIRST`,
      [startStr, endStr]
    );

    const rowsByCustomer = new Map();
    for (const row of result.rows) {
      let customerRows = rowsByCustomer.get(row.customer_id);
      if (!customerRows) {
        customerRows = [];
        rowsByCustomer.set(row.customer_id, customerRows);
      }
      customerRows.push(row);
    }

    const agingByCustomer = new Map();
    for (const [customerId, rows] of rowsByCustomer.entries()) {
      const firstRow = rows[0];
      const buckets = [];
      if (firstRow.anchor_date) {
        buckets.push({ key: "opening", amountCents: cents(firstRow.anchor_amount) });
      }

      for (const row of rows) {
        if (row.movement_year === null || row.movement_month === null) continue;

        let debitCents = cents(row.debit_amount);
        let creditCents = cents(row.credit_amount);
        if (debitCents < 0) {
          creditCents -= debitCents;
          debitCents = 0;
        }
        if (creditCents < 0) {
          debitCents -= creditCents;
          creditCents = 0;
        }

        // Carried customer credits are applied before a new debit is aged.
        for (const bucket of buckets) {
          if (debitCents <= 0) break;
          if (bucket.amountCents >= 0) continue;
          const used = Math.min(debitCents, -bucket.amountCents);
          bucket.amountCents += used;
          debitCents -= used;
        }

        if (debitCents > 0) {
          buckets.push({
            key: `${row.movement_year}-${pad2(row.movement_month)}`,
            amountCents: debitCents,
          });
        }

        // Both receipts and adjustment credits reduce the oldest positive
        // debtor balance. Any excess remains a signed credit in this month.
        let remainingCredit = creditCents;
        for (const bucket of buckets) {
          if (remainingCredit <= 0) break;
          if (bucket.amountCents <= 0) continue;
          const used = Math.min(remainingCredit, bucket.amountCents);
          bucket.amountCents -= used;
          remainingCredit -= used;
        }

        if (remainingCredit > 0) {
          buckets.push({
            key: `${row.movement_year}-${pad2(row.movement_month)}`,
            amountCents: -remainingCredit,
          });
        }
      }

      let current = 0;
      let oneMonth = 0;
      let twoMonths = 0;
      let threePlus = 0;
      for (const bucket of buckets) {
        let age = 3;
        if (bucket.key !== "opening") {
          const [year, month] = bucket.key.split("-").map(Number);
          age = (periodYear - year) * 12 + (periodMonth - month);
        }

        if (age <= 0) current += bucket.amountCents;
        else if (age === 1) oneMonth += bucket.amountCents;
        else if (age === 2) twoMonths += bucket.amountCents;
        else threePlus += bucket.amountCents;
      }

      const totalCents = buckets.reduce(
        (total, bucket) => total + bucket.amountCents,
        0
      );
      const agingTotalCents = current + oneMonth + twoMonths + threePlus;
      if (agingTotalCents !== totalCents) {
        throw new Error(
          `Jelly Polly aging does not reconcile for ${customerId}: ${agingTotalCents} != ${totalCents}`
        );
      }

      agingByCustomer.set(customerId, {
        current_month: money(current / 100),
        one_month: money(oneMonth / 100),
        two_months: money(twoMonths / 100),
        three_months_plus: money(threePlus / 100),
        total_due: money(totalCents / 100),
      });
    }

    return agingByCustomer;
  };

  // GET /jellypolly/api/debtors - Get JellyPolly debtors report, with optional filtering by month and year of invoice creation
  router.get("/", async (req, res) => {
    const { month, year } = req.query;
    try {
      let filterClause = "";
      const queryParams = [];

      if (month && year) {
        const monthInt = parseInt(month, 10);
        const yearInt = parseInt(year, 10);

        if (!isNaN(monthInt) && !isNaN(yearInt)) {
          // Cast createddate (text) to a bigint, divide by 1000 to convert milliseconds to seconds
          // Use to_timestamp() to convert the seconds-based timestamp to a proper date
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
              'date', COALESCE(p.posting_date, p.payment_date::date),
              'amount', p.amount_paid,
              'status', p.status
            ) ORDER BY COALESCE(p.posting_date, p.payment_date::date)
          ) as payments
        FROM jellypolly.payments p
        WHERE p.status NOT IN ('cancelled', 'pending')
        GROUP BY p.invoice_id
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
          COALESCE(ip.payments, '[]'::json) as payments
        FROM jellypolly.invoices i
        LEFT JOIN invoice_payments ip ON i.id = ip.invoice_id
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
      console.error("Error fetching JellyPolly debtors report:", error);
      res.status(500).json({
        message: "Error fetching JellyPolly debtors report",
        error: error.message,
      });
    }
  });

  // GET /jellypolly/api/debtors/statement/:customerId - Get customer statement for a specific month
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
      const startOfMonthDate = isoDate(yearInt, monthInt, 1);
      const endOfMonthDate = isoDate(yearInt, monthInt, lastDay);
      const statementDate = `${pad2(lastDay)}/${pad2(monthInt)}/${yearInt}`;

      const customerResult = await pool.query(
        `SELECT id, name, address, city, state, phone_number, email
           FROM customers
          WHERE id = $1`,
        [customerId]
      );

      if (customerResult.rows.length === 0) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }

      const customer = customerResult.rows[0];
      const [ledgerResult, agingByCustomer] = await Promise.all([
        pool.query(
          `${JELLY_POLLY_DEBTOR_MOVEMENTS_CTE},
           anchor AS (
             SELECT as_of_date, amount
             FROM jellypolly.debtor_opening_balances
             WHERE customer_id = $1
               AND as_of_date <= $2::date
             ORDER BY as_of_date DESC
             LIMIT 1
           ),
           opening AS (
             SELECT COALESCE((SELECT amount FROM anchor), 0)
                    + COALESCE(SUM(debit_amount - credit_amount), 0)
                      AS opening_balance
             FROM movements
             WHERE customer_id = $1
               AND entry_date < $2::date
               AND (
                 NOT EXISTS (SELECT 1 FROM anchor)
                 OR entry_date >= (SELECT as_of_date FROM anchor)
               )
           ),
           period_rows AS (
             SELECT *
             FROM movements
             WHERE customer_id = $1
               AND entry_date >= $2::date
               AND entry_date <= $3::date
           )
           SELECT opening.opening_balance,
                  TO_CHAR(anchor.as_of_date, 'YYYY-MM-DD') AS anchor_date,
                  anchor.amount AS anchor_amount,
                  TO_CHAR(period_row.entry_date, 'DD/MM/YYYY') AS entry_date,
                  period_row.particulars,
                  period_row.debit_amount,
                  period_row.credit_amount,
                  period_row.source_type,
                  period_row.source_id,
                  period_row.invoice_id
           FROM opening
           LEFT JOIN anchor ON true
           LEFT JOIN period_rows period_row ON true
           ORDER BY period_row.entry_date ASC NULLS LAST,
                    period_row.same_day_order ASC NULLS LAST,
                    period_row.reference_no ASC NULLS LAST,
                    period_row.source_id ASC NULLS LAST`,
          [customerId, startOfMonthDate, endOfMonthDate]
        ),
        computeAnchorAwareAging(
          startOfMonthDate,
          endOfMonthDate,
          yearInt,
          monthInt
        ),
      ]);

      const previousBalanceCents = cents(
        ledgerResult.rows[0]?.opening_balance || 0
      );
      let runningBalanceCents = previousBalanceCents;
      const transactions = ledgerResult.rows
        .filter((row) => row.entry_date !== null)
        .map((row) => {
          const debitCents = cents(row.debit_amount);
          const creditCents = cents(row.credit_amount);
          const netCents = debitCents - creditCents;
          runningBalanceCents += netCents;

          let particulars = row.particulars || "";
          if (row.source_type === "invoice") {
            particulars = `INV/${row.invoice_id}`;
          } else if (row.source_type === "payment") {
            particulars = `INV/NO : ${row.invoice_id}/${customerId}`;
          }

          return {
            date: row.entry_date,
            particulars,
            type: netCents >= 0 ? "debit" : "credit",
            amount: money(Math.abs(netCents) / 100),
            running_balance: money(runningBalanceCents / 100),
          };
        });

      const aging = agingByCustomer.get(customerId) || {
        current_month: 0,
        one_month: 0,
        two_months: 0,
        three_months_plus: 0,
        total_due: 0,
      };
      if (cents(aging.total_due) !== runningBalanceCents) {
        throw new Error(
          `Jelly Polly statement aging ${aging.total_due.toFixed(2)} does not match ledger close ${money(runningBalanceCents / 100).toFixed(2)} for ${customerId}`
        );
      }

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
        previous_balance: money(previousBalanceCents / 100),
        opening_source: ledgerResult.rows[0]?.anchor_date
          ? {
              type: "anchored",
              as_of_date: ledgerResult.rows[0].anchor_date,
              amount: money(ledgerResult.rows[0].anchor_amount),
            }
          : { type: "derived" },
        transactions,
        total_amount_due: money(runningBalanceCents / 100),
        aging: {
          current_month: aging.current_month,
          one_month: aging.one_month,
          two_months: aging.two_months,
          three_months_plus: aging.three_months_plus,
        },
      });
    } catch (error) {
      console.error("Error fetching JellyPolly customer statement:", error);
      res.status(500).json({
        message: "Error fetching customer statement",
        error: error.message,
      });
    }
  });

  // GET /jellypolly/api/debtors/general-statement - Get general debtor list for all customers
  router.get("/general-statement", async (req, res) => {
    const { month, year, includeZero } = req.query;
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
      const startOfMonthDate = isoDate(yearInt, monthInt, 1);
      const endOfMonthDate = isoDate(yearInt, monthInt, lastDay);
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

      const [result, agingByCustomer] = await Promise.all([
        pool.query(
          `${JELLY_POLLY_DEBTOR_MOVEMENTS_CTE},
           customer_scope AS (
             SELECT customer_id
             FROM movements
             WHERE entry_date <= $2::date
             UNION
             SELECT customer_id
             FROM jellypolly.debtor_opening_balances
             WHERE as_of_date <= $1::date
           ),
           anchors AS (
             SELECT DISTINCT ON (opening.customer_id)
                    opening.customer_id,
                    opening.as_of_date,
                    opening.amount
             FROM jellypolly.debtor_opening_balances opening
             JOIN customer_scope scope ON scope.customer_id = opening.customer_id
             WHERE opening.as_of_date <= $1::date
             ORDER BY opening.customer_id, opening.as_of_date DESC
           ),
           exact_anchors AS (
             SELECT customer_id, as_of_date, amount
             FROM jellypolly.debtor_opening_balances
             WHERE as_of_date = $1::date
           ),
           movement_totals AS (
             SELECT scope.customer_id,
                    COALESCE(SUM(
                      CASE
                        WHEN movement.entry_date < $1::date
                         AND (
                           anchor.as_of_date IS NULL
                           OR movement.entry_date >= anchor.as_of_date
                         )
                        THEN movement.debit_amount - movement.credit_amount
                        ELSE 0
                      END
                    ), 0) AS pre_movement,
                    COALESCE(SUM(
                      CASE
                        WHEN movement.entry_date >= $1::date
                         AND movement.entry_date <= $2::date
                         AND movement.source_type <> 'payment'
                        THEN movement.debit_amount - movement.credit_amount
                        ELSE 0
                      END
                    ), 0) AS current_invoices,
                    COALESCE(SUM(
                      CASE
                        WHEN movement.entry_date >= $1::date
                         AND movement.entry_date <= $2::date
                         AND movement.source_type = 'payment'
                        THEN movement.credit_amount - movement.debit_amount
                        ELSE 0
                      END
                    ), 0) AS payment
             FROM customer_scope scope
             LEFT JOIN anchors anchor ON anchor.customer_id = scope.customer_id
             LEFT JOIN movements movement
               ON movement.customer_id = scope.customer_id
              AND movement.entry_date <= $2::date
             GROUP BY scope.customer_id
           )
           SELECT scope.customer_id,
                  customer.name AS customer_name,
                  (COALESCE(anchor.amount, 0)
                    + COALESCE(total.pre_movement, 0))::numeric(15,2) AS bal_bf,
                  COALESCE(total.current_invoices, 0)::numeric(15,2)
                    AS current_invoices,
                  COALESCE(total.payment, 0)::numeric(15,2) AS payment,
                  (COALESCE(anchor.amount, 0)
                    + COALESCE(total.pre_movement, 0)
                    + COALESCE(total.current_invoices, 0)
                    - COALESCE(total.payment, 0))::numeric(15,2) AS total_due,
                  exact.amount AS opening_amount,
                  TO_CHAR(exact.as_of_date, 'YYYY-MM-DD') AS opening_as_of_date
           FROM customer_scope scope
           JOIN customers customer ON customer.id = scope.customer_id
           LEFT JOIN anchors anchor ON anchor.customer_id = scope.customer_id
           LEFT JOIN exact_anchors exact
             ON exact.customer_id = scope.customer_id
           LEFT JOIN movement_totals total
             ON total.customer_id = scope.customer_id
           ORDER BY scope.customer_id ASC`,
          [startOfMonthDate, endOfMonthDate]
        ),
        computeAnchorAwareAging(
          startOfMonthDate,
          endOfMonthDate,
          yearInt,
          monthInt
        ),
      ]);

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

      let customers = result.rows.map((row) => {
        const aging = agingByCustomer.get(row.customer_id) || {
          current_month: 0,
          one_month: 0,
          two_months: 0,
          three_months_plus: 0,
          total_due: 0,
        };
        const customer = {
          account_no: row.customer_id,
          particular: row.customer_name || "UNNAMED",
          bal_bf: money(row.bal_bf),
          current_invoices: money(row.current_invoices),
          payment: money(row.payment),
          total_due: money(row.total_due),
          opening_amount:
            row.opening_amount === null ? null : money(row.opening_amount),
          opening_as_of_date: row.opening_as_of_date || null,
          aging_current: aging.current_month,
          aging_1_month: aging.one_month,
          aging_2_months: aging.two_months,
          aging_3_plus: aging.three_months_plus,
        };

        if (cents(customer.total_due) !== cents(aging.total_due)) {
          throw new Error(
            `Jelly Polly general-statement aging ${aging.total_due.toFixed(2)} does not match ledger close ${customer.total_due.toFixed(2)} for ${customer.account_no}`
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

      for (const key of Object.keys(totals)) {
        totals[key] = money(totals[key]);
      }
      if (
        cents(totals.total_due) !==
        cents(
          totals.aging_current +
            totals.aging_1_month +
            totals.aging_2_months +
            totals.aging_3_plus
        )
      ) {
        throw new Error(
          "Jelly Polly general-statement aging totals do not reconcile"
        );
      }

      if (includeZero !== "1") {
        customers = customers.filter(
          (customer) =>
            Math.abs(customer.bal_bf) > 0.005 ||
            Math.abs(customer.current_invoices) > 0.005 ||
            Math.abs(customer.payment) > 0.005 ||
            Math.abs(customer.total_due) > 0.005
        );
      }

      // includeZero=1 (the interactive By Customer view): merge in every other
      // shared customer as a zero JP row. Customers carrying only a JP opening
      // anchor are already returned by the SQL above with their true balance.
      if (includeZero === "1") {
        const present = new Set(customers.map((c) => c.account_no));
        const allResult = await pool.query(
          `SELECT id, name FROM customers ORDER BY id ASC`
        );
        for (const row of allResult.rows) {
          if (present.has(row.id)) continue;
          customers.push({
            account_no: row.id,
            particular: row.name || "UNNAMED",
            bal_bf: 0,
            current_invoices: 0,
            payment: 0,
            total_due: 0,
            opening_amount: null,
            opening_as_of_date: null,
            aging_current: 0,
            aging_1_month: 0,
            aging_2_months: 0,
            aging_3_plus: 0,
          });
        }
        customers.sort((a, b) => a.account_no.localeCompare(b.account_no));
      }

      // Server-side search, zero-balance filter and pagination for the
      // interactive By Customer view. Totals above always aggregate the full
      // JP debtor scope before search, zero filtering, and pagination.
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
          const limit = Math.max(1, parseInt(req.query.limit, 10) || 200);
          const maxPage = Math.max(1, Math.ceil(totalCustomers / limit));
          page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), maxPage);
          customers = customers.slice((page - 1) * limit, page * limit);
        }
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
      console.error("Error fetching JellyPolly general statement:", error);
      res.status(500).json({
        message: "Error fetching general statement",
        error: error.message,
      });
    }
  });

  return router;
}
