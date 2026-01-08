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
        FROM invoices i
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
      console.error("Error fetching debtors report:", error);
      res.status(500).json({
        message: "Error fetching debtors report",
        error: error.message,
      });
    }
  });

  // GET /api/debtors/statement/:customerId - Get customer statement for a specific month
  router.get("/statement/:customerId", async (req, res) => {
    const { customerId } = req.params;
    const { month, year } = req.query;

    // Validate required parameters
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
      // Calculate statement period dates
      const startOfMonth = new Date(yearInt, monthInt - 1, 1);
      const endOfMonth = new Date(yearInt, monthInt, 0); // Last day of month
      const startOfMonthTs = startOfMonth.getTime();
      const endOfMonthTs = new Date(yearInt, monthInt, 0, 23, 59, 59, 999).getTime();

      // Format statement date (end of month)
      const statementDate = endOfMonth.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      // 1. Get customer details
      const customerQuery = `
        SELECT id, name, address, city, state, phone_number, email
        FROM customers
        WHERE id = $1
      `;
      const customerResult = await pool.query(customerQuery, [customerId]);

      if (customerResult.rows.length === 0) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }

      const customer = customerResult.rows[0];

      // 2. Get previous balance (unpaid invoices before the selected month)
      const previousBalanceQuery = `
        SELECT COALESCE(SUM(balance_due), 0) as previous_balance
        FROM invoices
        WHERE customerid = $1
          AND invoice_status IN ('Unpaid', 'Overdue')
          AND balance_due > 0.01
          AND createddate::bigint < $2
      `;
      const previousBalanceResult = await pool.query(previousBalanceQuery, [
        customerId,
        startOfMonthTs,
      ]);
      const previousBalance = parseFloat(
        previousBalanceResult.rows[0]?.previous_balance || 0
      );

      // 3. Get all invoices for this customer in the selected month (as DEBIT transactions)
      const invoicesQuery = `
        SELECT
          id as invoice_id,
          createddate,
          totalamountpayable as amount,
          balance_due
        FROM invoices
        WHERE customerid = $1
          AND createddate::bigint >= $2
          AND createddate::bigint <= $3
        ORDER BY createddate::bigint ASC
      `;
      const invoicesResult = await pool.query(invoicesQuery, [
        customerId,
        startOfMonthTs,
        endOfMonthTs,
      ]);

      // 4. Get all payments for this customer's invoices in the selected month (as CREDIT transactions)
      // Use date range that includes the full last day of the month
      const endOfMonthEndOfDay = new Date(yearInt, monthInt, 0, 23, 59, 59, 999);
      const paymentsQuery = `
        SELECT
          p.payment_id,
          p.invoice_id,
          p.payment_date,
          p.amount_paid,
          p.payment_reference
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE i.customerid = $1
          AND p.status NOT IN ('cancelled', 'pending')
          AND p.payment_date >= $2
          AND p.payment_date <= $3
        ORDER BY p.payment_date ASC
      `;
      const paymentsResult = await pool.query(paymentsQuery, [
        customerId,
        startOfMonth.toISOString(),
        endOfMonthEndOfDay.toISOString(),
      ]);

      // 5. Build transactions array with running balance
      const transactions = [];
      let runningBalance = previousBalance;

      // Combine invoices and payments, then sort by date
      const allTransactions = [];

      // Add invoices (DEBIT)
      for (const inv of invoicesResult.rows) {
        const invoiceDate = new Date(parseInt(inv.createddate, 10));
        allTransactions.push({
          date: invoiceDate,
          dateStr: invoiceDate.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }),
          particulars: `INV/${inv.invoice_id}`,
          type: "debit",
          amount: parseFloat(inv.amount),
          sortKey: invoiceDate.getTime(),
        });
      }

      // Add payments (CREDIT)
      for (const pay of paymentsResult.rows) {
        const paymentDate = new Date(pay.payment_date);
        allTransactions.push({
          date: paymentDate,
          dateStr: paymentDate.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }),
          particulars: `INV/NO : ${pay.invoice_id}/${customerId}`,
          type: "credit",
          amount: parseFloat(pay.amount_paid),
          sortKey: paymentDate.getTime(),
        });
      }

      // Sort by date
      allTransactions.sort((a, b) => a.sortKey - b.sortKey);

      // Calculate running balance
      for (const txn of allTransactions) {
        if (txn.type === "debit") {
          runningBalance += txn.amount;
        } else {
          runningBalance -= txn.amount;
        }
        transactions.push({
          date: txn.dateStr,
          particulars: txn.particulars,
          type: txn.type,
          amount: txn.amount,
          running_balance: runningBalance,
        });
      }

      // 6. Calculate aging breakdown based on invoice creation date relative to selected month
      // Aging is calculated on ALL unpaid invoices up to end of selected month
      const agingQuery = `
        SELECT
          COALESCE(SUM(CASE
            WHEN to_timestamp(createddate::bigint / 1000) >= $2
                 AND to_timestamp(createddate::bigint / 1000) <= $3
            THEN balance_due ELSE 0 END), 0) as current_month,
          COALESCE(SUM(CASE
            WHEN to_timestamp(createddate::bigint / 1000) >= ($2 - INTERVAL '1 month')
                 AND to_timestamp(createddate::bigint / 1000) < $2
            THEN balance_due ELSE 0 END), 0) as one_month,
          COALESCE(SUM(CASE
            WHEN to_timestamp(createddate::bigint / 1000) >= ($2 - INTERVAL '2 months')
                 AND to_timestamp(createddate::bigint / 1000) < ($2 - INTERVAL '1 month')
            THEN balance_due ELSE 0 END), 0) as two_months,
          COALESCE(SUM(CASE
            WHEN to_timestamp(createddate::bigint / 1000) < ($2 - INTERVAL '2 months')
            THEN balance_due ELSE 0 END), 0) as three_months_plus
        FROM invoices
        WHERE customerid = $1
          AND invoice_status IN ('Unpaid', 'Overdue')
          AND balance_due > 0.01
          AND createddate::bigint <= $4
      `;
      const agingResult = await pool.query(agingQuery, [
        customerId,
        startOfMonth,
        endOfMonth,
        endOfMonthTs,
      ]);

      const aging = {
        current_month: parseFloat(agingResult.rows[0]?.current_month || 0),
        one_month: parseFloat(agingResult.rows[0]?.one_month || 0),
        two_months: parseFloat(agingResult.rows[0]?.two_months || 0),
        three_months_plus: parseFloat(agingResult.rows[0]?.three_months_plus || 0),
      };

      // Final total amount due is the running balance after all transactions
      const totalAmountDue = runningBalance;

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
        total_amount_due: totalAmountDue,
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
      // Calculate statement period dates
      const startOfMonth = new Date(yearInt, monthInt - 1, 1);
      const endOfMonth = new Date(yearInt, monthInt, 0);
      const startOfMonthTs = startOfMonth.getTime();
      const endOfMonthTs = new Date(yearInt, monthInt, 0, 23, 59, 59, 999).getTime();

      // Format dates for display
      const statementDate = endOfMonth.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const reportDateTime = new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      // Get all customers with outstanding invoices up to end of selected month
      const query = `
        WITH customer_invoices AS (
          SELECT
            c.id as customer_id,
            c.name as customer_name,
            i.id as invoice_id,
            i.createddate,
            i.balance_due,
            i.totalamountpayable
          FROM customers c
          JOIN invoices i ON c.id = i.customerid
          WHERE i.invoice_status IN ('Unpaid', 'Overdue')
            AND i.balance_due > 0.01
            AND i.createddate::bigint <= $1
        ),
        customer_payments AS (
          SELECT
            c.id as customer_id,
            COALESCE(SUM(p.amount_paid), 0) as monthly_payment
          FROM customers c
          JOIN invoices i ON c.id = i.customerid
          JOIN payments p ON i.id = p.invoice_id
          WHERE p.status NOT IN ('cancelled', 'pending')
            AND p.payment_date >= $2
            AND p.payment_date <= $3
          GROUP BY c.id
        ),
        customer_summary AS (
          SELECT
            ci.customer_id,
            ci.customer_name,
            -- Balance B/F: invoices before selected month
            COALESCE(SUM(CASE
              WHEN ci.createddate::bigint < $4
              THEN ci.balance_due ELSE 0 END), 0) as bal_bf,
            -- Current month invoices
            COALESCE(SUM(CASE
              WHEN ci.createddate::bigint >= $4 AND ci.createddate::bigint <= $1
              THEN ci.totalamountpayable ELSE 0 END), 0) as current_invoices,
            -- Total due (sum of all outstanding)
            COALESCE(SUM(ci.balance_due), 0) as total_due,
            -- Aging breakdown based on invoice creation date
            COALESCE(SUM(CASE
              WHEN to_timestamp(ci.createddate::bigint / 1000) >= $5
                   AND to_timestamp(ci.createddate::bigint / 1000) <= $6
              THEN ci.balance_due ELSE 0 END), 0) as aging_current,
            COALESCE(SUM(CASE
              WHEN to_timestamp(ci.createddate::bigint / 1000) >= ($5 - INTERVAL '1 month')
                   AND to_timestamp(ci.createddate::bigint / 1000) < $5
              THEN ci.balance_due ELSE 0 END), 0) as aging_1_month,
            COALESCE(SUM(CASE
              WHEN to_timestamp(ci.createddate::bigint / 1000) >= ($5 - INTERVAL '2 months')
                   AND to_timestamp(ci.createddate::bigint / 1000) < ($5 - INTERVAL '1 month')
              THEN ci.balance_due ELSE 0 END), 0) as aging_2_months,
            COALESCE(SUM(CASE
              WHEN to_timestamp(ci.createddate::bigint / 1000) < ($5 - INTERVAL '2 months')
              THEN ci.balance_due ELSE 0 END), 0) as aging_3_plus
          FROM customer_invoices ci
          GROUP BY ci.customer_id, ci.customer_name
        )
        SELECT
          cs.customer_id,
          cs.customer_name,
          cs.bal_bf,
          cs.current_invoices,
          COALESCE(cp.monthly_payment, 0) as payment,
          cs.total_due,
          cs.aging_current,
          cs.aging_1_month,
          cs.aging_2_months,
          cs.aging_3_plus
        FROM customer_summary cs
        LEFT JOIN customer_payments cp ON cs.customer_id = cp.customer_id
        ORDER BY cs.customer_id ASC
      `;

      const result = await pool.query(query, [
        endOfMonthTs,                    // $1 - end of selected month (timestamp)
        startOfMonth.toISOString(),      // $2 - start of month for payments
        new Date(yearInt, monthInt, 0, 23, 59, 59, 999).toISOString(), // $3 - end of month for payments
        startOfMonthTs,                  // $4 - start of selected month (timestamp)
        startOfMonth,                    // $5 - start of month (date for aging)
        endOfMonth,                      // $6 - end of month (date for aging)
      ]);

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
        const customer = {
          account_no: row.customer_id,
          particular: row.customer_name || "UNNAMED",
          bal_bf: parseFloat(row.bal_bf) || 0,
          current_invoices: parseFloat(row.current_invoices) || 0,
          payment: parseFloat(row.payment) || 0,
          total_due: parseFloat(row.total_due) || 0,
          aging_current: parseFloat(row.aging_current) || 0,
          aging_1_month: parseFloat(row.aging_1_month) || 0,
          aging_2_months: parseFloat(row.aging_2_months) || 0,
          aging_3_plus: parseFloat(row.aging_3_plus) || 0,
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
