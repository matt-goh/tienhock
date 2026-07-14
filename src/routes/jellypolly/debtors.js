// src/routes/jellypolly/debtors.js
import { Router } from "express";

export default function (pool, config) {
const router = Router();

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
      const startOfMonth = new Date(yearInt, monthInt - 1, 1);
      const endOfMonth = new Date(yearInt, monthInt, 0);
      const startOfMonthTs = startOfMonth.getTime();
      const endOfMonthTs = new Date(
        yearInt,
        monthInt,
        0,
        23,
        59,
        59,
        999
      ).getTime();
      const startOfMonthDate = `${yearInt}-${String(monthInt).padStart(
        2,
        "0"
      )}-01`;
      const endOfMonthDate = `${yearInt}-${String(monthInt).padStart(
        2,
        "0"
      )}-${String(endOfMonth.getDate()).padStart(2, "0")}`;

      const statementDate = endOfMonth.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

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

      const previousBalanceResult = await pool.query(
        `SELECT
          (SELECT COALESCE(SUM(totalamountpayable), 0)
             FROM jellypolly.invoices
             WHERE customerid = $1
               AND createddate::bigint < $2)
          -
          (SELECT COALESCE(SUM(p.amount_paid), 0)
             FROM jellypolly.payments p
             JOIN jellypolly.invoices i ON p.invoice_id = i.id
             WHERE i.customerid = $1
               AND p.status NOT IN ('cancelled', 'pending')
               AND COALESCE(p.posting_date, p.payment_date::date) < $3::date)
          AS previous_balance`,
        [customerId, startOfMonthTs, startOfMonthDate]
      );
      const previousBalance = parseFloat(
        previousBalanceResult.rows[0]?.previous_balance || 0
      );

      const invoicesResult = await pool.query(
        `SELECT
           id as invoice_id,
           createddate,
           totalamountpayable as amount,
           balance_due
         FROM jellypolly.invoices
         WHERE customerid = $1
           AND createddate::bigint >= $2
           AND createddate::bigint <= $3
         ORDER BY createddate::bigint ASC`,
        [customerId, startOfMonthTs, endOfMonthTs]
      );

      const paymentsResult = await pool.query(
        `SELECT
           p.payment_id,
           p.invoice_id,
           COALESCE(p.posting_date, p.payment_date::date) AS payment_date,
           p.amount_paid,
           p.payment_reference
         FROM jellypolly.payments p
         JOIN jellypolly.invoices i ON p.invoice_id = i.id
         WHERE i.customerid = $1
           AND p.status NOT IN ('cancelled', 'pending')
           AND COALESCE(p.posting_date, p.payment_date::date) >= $2::date
           AND COALESCE(p.posting_date, p.payment_date::date) <= $3::date
         ORDER BY COALESCE(p.posting_date, p.payment_date::date) ASC`,
        [customerId, startOfMonthDate, endOfMonthDate]
      );

      const transactions = [];
      let runningBalance = previousBalance;
      const allTransactions = [];

      for (const inv of invoicesResult.rows) {
        const invoiceDate = new Date(parseInt(inv.createddate, 10));
        allTransactions.push({
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

      for (const pay of paymentsResult.rows) {
        const paymentDate = new Date(pay.payment_date);
        allTransactions.push({
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

      allTransactions.sort((a, b) => a.sortKey - b.sortKey);

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

      const agingResult = await pool.query(
        `SELECT
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
        FROM jellypolly.invoices
        WHERE customerid = $1
          AND invoice_status IN ('Unpaid', 'Overdue')
          AND balance_due > 0.01
          AND createddate::bigint <= $4`,
        [customerId, startOfMonth, endOfMonth, endOfMonthTs]
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
        aging: {
          current_month: parseFloat(agingResult.rows[0]?.current_month || 0),
          one_month: parseFloat(agingResult.rows[0]?.one_month || 0),
          two_months: parseFloat(agingResult.rows[0]?.two_months || 0),
          three_months_plus: parseFloat(
            agingResult.rows[0]?.three_months_plus || 0
          ),
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
    const { month, year } = req.query;
    const now = new Date();
    const monthInt = month ? parseInt(month, 10) : now.getMonth() + 1;
    const yearInt = year ? parseInt(year, 10) : now.getFullYear();

    if (isNaN(monthInt) || isNaN(yearInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({
        message: "Invalid month or year",
      });
    }

    try {
      const startOfMonth = new Date(yearInt, monthInt - 1, 1);
      const endOfMonth = new Date(yearInt, monthInt, 0);
      const startOfMonthTs = startOfMonth.getTime();
      const endOfMonthTs = new Date(
        yearInt,
        monthInt,
        0,
        23,
        59,
        59,
        999
      ).getTime();
      const startOfMonthDate = `${yearInt}-${String(monthInt).padStart(
        2,
        "0"
      )}-01`;
      const endOfMonthDate = `${yearInt}-${String(monthInt).padStart(
        2,
        "0"
      )}-${String(endOfMonth.getDate()).padStart(2, "0")}`;

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

      const result = await pool.query(
        `WITH customer_invoices AS (
          SELECT
            c.id as customer_id,
            c.name as customer_name,
            i.id as invoice_id,
            i.createddate,
            i.balance_due,
            i.totalamountpayable
          FROM customers c
          JOIN jellypolly.invoices i ON c.id = i.customerid
          WHERE i.invoice_status IN ('Unpaid', 'Overdue')
            AND i.balance_due > 0.01
            AND i.createddate::bigint <= $1
        ),
        customer_payments AS (
          SELECT
            c.id as customer_id,
            COALESCE(SUM(p.amount_paid), 0) as monthly_payment
          FROM customers c
          JOIN jellypolly.invoices i ON c.id = i.customerid
          JOIN jellypolly.payments p ON i.id = p.invoice_id
          WHERE p.status NOT IN ('cancelled', 'pending')
            AND COALESCE(p.posting_date, p.payment_date::date) >= $2::date
            AND COALESCE(p.posting_date, p.payment_date::date) <= $3::date
          GROUP BY c.id
        ),
        customer_summary AS (
          SELECT
            ci.customer_id,
            ci.customer_name,
            COALESCE(SUM(CASE
              WHEN ci.createddate::bigint < $4
              THEN ci.balance_due ELSE 0 END), 0) as bal_bf,
            COALESCE(SUM(CASE
              WHEN ci.createddate::bigint >= $4 AND ci.createddate::bigint <= $1
              THEN ci.totalamountpayable ELSE 0 END), 0) as current_invoices,
            COALESCE(SUM(ci.balance_due), 0) as total_due,
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
        ORDER BY cs.customer_id ASC`,
        [
          endOfMonthTs,
          startOfMonthDate,
          endOfMonthDate,
          startOfMonthTs,
          startOfMonth,
          endOfMonth,
        ]
      );

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
      console.error("Error fetching JellyPolly general statement:", error);
      res.status(500).json({
        message: "Error fetching general statement",
        error: error.message,
      });
    }
  });

  return router;
}
