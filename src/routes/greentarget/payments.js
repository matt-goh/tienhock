// src/routes/greentarget/payments.js
import { Router } from "express";

const fetchActiveAdjustmentForInvoice = async (client, invoiceId) => {
  const result = await client.query(
    `SELECT id, type
       FROM greentarget.adjustment_documents
      WHERE original_invoice_id = $1
        AND status = 'active'
        AND COALESCE(is_consolidated, false) = false
      ORDER BY created_at DESC
      LIMIT 1`,
    [invoiceId]
  );
  return result.rows[0] || null;
};

const pad2 = (value) => String(value).padStart(2, "0");

const getMonthRange = (monthInt, yearInt) => {
  const nextMonth = monthInt === 12 ? 1 : monthInt + 1;
  const nextYear = monthInt === 12 ? yearInt + 1 : yearInt;
  return {
    startDate: `${yearInt}-${pad2(monthInt)}-01`,
    nextDate: `${nextYear}-${pad2(nextMonth)}-01`,
    endDate: `${yearInt}-${pad2(monthInt)}-${pad2(
      new Date(yearInt, monthInt, 0).getDate()
    )}`,
    statementDate: `${pad2(new Date(yearInt, monthInt, 0).getDate())}/${pad2(
      monthInt
    )}/${yearInt}`,
  };
};

const formatDisplayDate = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.substring(0, 10).split("-");
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const getDateSortTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const parseAmount = (value) => parseFloat(value || 0);
const PAYMENT_METHODS = new Set([
  "cash",
  "cheque",
  "bank_transfer",
  "online",
]);

/**
 * @param {number} statusCode
 * @param {string} message
 * @returns {Error & { statusCode: number }}
 */
const createPaymentError = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode });

export default function (pool) {
  const router = Router();

  // Get all payments (with optional invoice_id filter)
  router.get("/", async (req, res) => {
    const { invoice_id, include_cancelled, customer_id } = req.query;

    try {
      let query = `
        SELECT p.*, 
               i.invoice_number,
               c.name as customer_name
        FROM greentarget.payments p
        JOIN greentarget.invoices i ON p.invoice_id = i.invoice_id
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
      `;

      const queryParams = [];
      let paramCounter = 1;

      if (invoice_id) {
        query += " WHERE p.invoice_id = $1";
        queryParams.push(invoice_id);
        paramCounter++;
      } else {
        query += " WHERE 1=1";
      }

      if (customer_id) {
        query += ` AND i.customer_id = $${paramCounter}`;
        queryParams.push(customer_id);
        paramCounter++;
      }

      // Only include active payments by default
      if (include_cancelled !== "true") {
        query += ` AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending')`;
      }

      query += " ORDER BY p.payment_date DESC";

      const result = await pool.query(query, queryParams);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target payments:", error);
      res.status(500).json({
        message: "Error fetching payments",
        error: error.message,
      });
    }
  });

  // Create a new payment
  router.post("/", async (req, res) => {
    const {
      invoice_id,
      payment_date,
      amount_paid,
      payment_method,
      payment_reference,
      internal_reference,
    } = req.body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if required fields are provided
      if (
        !invoice_id ||
        !payment_date ||
        amount_paid === undefined ||
        amount_paid === null ||
        !payment_method
      ) {
        throw createPaymentError(
          400,
          "Missing required fields: invoice_id, payment_date, amount_paid, payment_method"
        );
      }

      const paymentAmount = Number(amount_paid);
      const normalizedPaymentReference = String(payment_reference || "").trim();
      const normalizedInternalReference = String(internal_reference || "").trim();
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        throw createPaymentError(
          400,
          "Payment amount must be a finite number greater than zero"
        );
      }
      if (!PAYMENT_METHODS.has(payment_method)) {
        throw createPaymentError(400, "Invalid payment method");
      }

      // Get invoice details
      const invoiceQuery = `
        SELECT i.*, c.customer_id
        FROM greentarget.invoices i
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
        WHERE i.invoice_id = $1
        FOR UPDATE OF i
      `;

      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        throw createPaymentError(404, `Invoice with ID ${invoice_id} not found`);
      }

      const invoice = invoiceResult.rows[0];
      const currentBalance = Number(invoice.balance_due);
      if (
        !Number.isFinite(currentBalance) ||
        currentBalance <= 0 ||
        !["active", "overdue"].includes(invoice.status)
      ) {
        throw createPaymentError(
          409,
          `Invoice ${invoice_id} is no longer available for payment`
        );
      }
      if (paymentAmount > currentBalance) {
        throw createPaymentError(
          409,
          `Payment amount cannot exceed the current invoice balance of RM${currentBalance.toFixed(
            2
          )}`
        );
      }

      // Run duplicate checks after locking the invoice so concurrent requests
      // for the same invoice cannot both pass this check.
      if (normalizedPaymentReference) {
        const duplicateCheck = await client.query(
          `SELECT payment_id FROM greentarget.payments
           WHERE invoice_id = $1 AND payment_reference = $2
           AND (status IS NULL OR status != 'cancelled')`,
          [invoice_id, normalizedPaymentReference]
        );

        if (duplicateCheck.rows.length > 0) {
          throw createPaymentError(
            409,
            `Payment reference "${normalizedPaymentReference}" already exists for this invoice. Please use a unique reference.`
          );
        }
      }

      if (normalizedInternalReference) {
        // The client previews the next RV reference, but the server must
        // serialize the final uniqueness check across different invoices.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          ["greentarget_payments_internal_reference"]
        );
        const internalReferenceCheck = await client.query(
          `SELECT payment_id
             FROM greentarget.payments
            WHERE internal_reference = $1
              AND (status IS NULL OR status != 'cancelled')
            LIMIT 1`,
          [normalizedInternalReference]
        );
        if (internalReferenceCheck.rows.length > 0) {
          throw createPaymentError(
            409,
            `Internal reference "${normalizedInternalReference}" is already in use. Refresh and try again.`
          );
        }
      }

      const pendingPaymentResult = await client.query(
        `SELECT payment_id
           FROM greentarget.payments
          WHERE invoice_id = $1
            AND status = 'pending'
          LIMIT 1`,
        [invoice_id]
      );
      if (pendingPaymentResult.rows.length > 0) {
        throw createPaymentError(
          409,
          `Invoice ${invoice_id} already has a pending payment`
        );
      }

      // Determine initial status based on payment method
      const initialStatus = payment_method === "cheque" ? "pending" : "active";

      // Create the payment
      const paymentQuery = `
        INSERT INTO greentarget.payments (
          invoice_id,
          payment_date,
          amount_paid,
          payment_method,
          payment_reference,
          internal_reference,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const paymentResult = await client.query(paymentQuery, [
        invoice_id,
        payment_date,
        paymentAmount,
        payment_method,
        normalizedPaymentReference || null,
        normalizedInternalReference || null,
        initialStatus,
      ]);

      // Only update invoice balance if payment is active (not pending)
      if (initialStatus === "active") {
        const newBalanceDue = Math.max(
          0,
          currentBalance - paymentAmount
        );
        const currentStatus = invoice.status;

        if (newBalanceDue === 0) {
          // If fully paid, always set to paid
          await client.query(
            `UPDATE greentarget.invoices SET balance_due = $1, status = 'paid' WHERE invoice_id = $2`,
            [newBalanceDue, invoice_id]
          );
        } else {
          // If partially paid, maintain overdue status if already overdue
          const newStatus = currentStatus === "overdue" ? "overdue" : "active";

          await client.query(
            `UPDATE greentarget.invoices SET balance_due = $1, status = $2 WHERE invoice_id = $3`,
            [newBalanceDue, newStatus, invoice_id]
          );
        }

        // Update customer last_activity_date only for active payments
        await client.query(
          `UPDATE greentarget.customers SET last_activity_date = CURRENT_DATE WHERE customer_id = $1`,
          [invoice.customer_id]
        );
      }

      await client.query("COMMIT");

      res.status(201).json({
        message:
          initialStatus === "pending"
            ? "Payment created successfully (pending confirmation)"
            : "Payment created successfully",
        payment: paymentResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating Green Target payment:", error);
      const statusCode = Number(error?.statusCode) || 500;
      res.status(statusCode).json({
        message:
          statusCode < 500 ? error.message : "Error creating payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Get debtors report
  router.get("/debtors", async (req, res) => {
    const { month, year } = req.query;

    try {
      const queryParams = [];
      let monthFilterClause = "";

      if (month && year) {
        const monthInt = parseInt(month, 10);
        const yearInt = parseInt(year, 10);

        if (!isNaN(monthInt) && !isNaN(yearInt) && monthInt >= 1 && monthInt <= 12) {
          const { startDate, nextDate } = getMonthRange(monthInt, yearInt);
          queryParams.push(startDate, nextDate);
          monthFilterClause = "AND i.date_issued >= $1::date AND i.date_issued < $2::date";
        }
      }

      const query = `
        WITH invoice_payments AS (
          SELECT
            p.invoice_id,
            json_agg(
              json_build_object(
                'payment_id', p.payment_id,
                'payment_method', p.payment_method,
                'payment_reference', p.payment_reference,
                'date', p.payment_date,
                'amount', p.amount_paid,
                'status', p.status
              ) ORDER BY p.payment_date, p.payment_id
            ) AS payments
          FROM greentarget.payments p
          WHERE p.status IS NULL OR p.status = 'active'
          GROUP BY p.invoice_id
        ),
        outstanding_invoices AS (
          SELECT
            i.invoice_id,
            i.invoice_number,
            i.customer_id,
            i.date_issued,
            i.total_amount,
            i.balance_due,
            GREATEST(i.total_amount - i.balance_due, 0) AS total_paid,
            COALESCE(ip.payments, '[]'::json) AS payments
          FROM greentarget.invoices i
          LEFT JOIN invoice_payments ip ON i.invoice_id = ip.invoice_id
          WHERE i.status IN ('active', 'overdue')
            AND i.balance_due > 0.01
            AND COALESCE(i.is_consolidated, false) = false
            AND i.type != 'consolidated'
            ${monthFilterClause}
        ),
        customer_aggregates AS (
          SELECT
            oi.customer_id,
            c.name AS customer_name,
            c.phone_number,
            c.state,
            c.additional_info,
            MAX(oi.date_issued) AS latest_invoice_date,
            json_agg(
              json_build_object(
                'invoice_id', oi.invoice_id,
                'invoice_number', oi.invoice_number,
                'date', oi.date_issued,
                'amount', oi.total_amount,
                'payments', oi.payments,
                'balance', oi.balance_due
              ) ORDER BY oi.date_issued, oi.invoice_id
            ) AS invoices,
            SUM(oi.total_amount) AS total_amount,
            SUM(oi.total_paid) AS total_paid,
            SUM(oi.balance_due) AS total_balance
          FROM outstanding_invoices oi
          JOIN greentarget.customers c ON oi.customer_id = c.customer_id
          GROUP BY oi.customer_id, c.name, c.phone_number, c.state, c.additional_info
        )
        SELECT *
        FROM customer_aggregates
        ORDER BY total_balance DESC, latest_invoice_date DESC
      `;

      const result = await pool.query(query, queryParams);

      let grand_total_amount = 0;
      let grand_total_paid = 0;
      let grand_total_balance = 0;

      const customers = result.rows.map((row) => {
        const totalAmount = parseAmount(row.total_amount);
        const totalPaid = parseAmount(row.total_paid);
        const totalBalance = parseAmount(row.total_balance);

        grand_total_amount += totalAmount;
        grand_total_paid += totalPaid;
        grand_total_balance += totalBalance;

        return {
          customer_id: String(row.customer_id),
          customer_name: row.customer_name,
          phone_number: row.phone_number,
          address: row.additional_info,
          city: null,
          state: row.state,
          invoices: row.invoices || [],
          total_amount: totalAmount,
          total_paid: totalPaid,
          total_balance: totalBalance,
          credit_limit: 0,
          credit_balance: -totalBalance,
        };
      });

      const salesmen = customers.length
        ? [
            {
              salesman_id: "GT",
              salesman_name: "Green Target",
              customers,
              total_balance: grand_total_balance,
            },
          ]
        : [];

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

  router.get("/debtors/statement/:customerId", async (req, res) => {
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
      return res.status(400).json({ message: "Invalid month or year" });
    }

    const { startDate, nextDate, statementDate } = getMonthRange(
      monthInt,
      yearInt
    );

    try {
      const customerResult = await pool.query(
        `SELECT customer_id, name, phone_number, email, state, additional_info
           FROM greentarget.customers
          WHERE customer_id = $1`,
        [customerId]
      );

      if (customerResult.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const customer = customerResult.rows[0];

      const previousBalanceResult = await pool.query(
        `SELECT
           (SELECT COALESCE(SUM(total_amount), 0)
              FROM greentarget.invoices
             WHERE customer_id = $1
               AND status != 'cancelled'
               AND COALESCE(is_consolidated, false) = false
               AND type != 'consolidated'
               AND date_issued < $2::date)
           -
           (SELECT COALESCE(SUM(p.amount_paid), 0)
              FROM greentarget.payments p
              JOIN greentarget.invoices i ON p.invoice_id = i.invoice_id
             WHERE i.customer_id = $1
               AND i.status != 'cancelled'
               AND (p.status IS NULL OR p.status = 'active')
               AND p.payment_date < $2::date)
           AS previous_balance`,
        [customerId, startDate]
      );

      const previousBalance = parseAmount(
        previousBalanceResult.rows[0]?.previous_balance
      );

      const invoicesResult = await pool.query(
        `SELECT invoice_id, invoice_number, date_issued, total_amount, balance_due
           FROM greentarget.invoices
          WHERE customer_id = $1
            AND status != 'cancelled'
            AND COALESCE(is_consolidated, false) = false
            AND type != 'consolidated'
            AND date_issued >= $2::date
            AND date_issued < $3::date
          ORDER BY date_issued, invoice_id`,
        [customerId, startDate, nextDate]
      );

      const paymentsResult = await pool.query(
        `SELECT p.payment_id, p.invoice_id, i.invoice_number, p.payment_date,
                p.amount_paid, p.payment_reference
           FROM greentarget.payments p
           JOIN greentarget.invoices i ON p.invoice_id = i.invoice_id
          WHERE i.customer_id = $1
            AND i.status != 'cancelled'
            AND (p.status IS NULL OR p.status = 'active')
            AND p.payment_date >= $2::date
            AND p.payment_date < $3::date
          ORDER BY p.payment_date, p.payment_id`,
        [customerId, startDate, nextDate]
      );

      const allTransactions = [];

      invoicesResult.rows.forEach((invoice) => {
        allTransactions.push({
          dateStr: formatDisplayDate(invoice.date_issued),
          particulars: `INV/${invoice.invoice_number || invoice.invoice_id}`,
          type: "debit",
          amount: parseAmount(invoice.total_amount),
          sortKey: getDateSortTime(invoice.date_issued) * 2,
        });
      });

      paymentsResult.rows.forEach((payment) => {
        allTransactions.push({
          dateStr: formatDisplayDate(payment.payment_date),
          particulars: `INV/NO : ${
            payment.invoice_number || payment.invoice_id
          }/${customerId}`,
          type: "credit",
          amount: parseAmount(payment.amount_paid),
          sortKey: getDateSortTime(payment.payment_date) * 2 + 1,
        });
      });

      allTransactions.sort((a, b) => a.sortKey - b.sortKey);

      let runningBalance = previousBalance;
      const transactions = allTransactions.map((transaction) => {
        runningBalance +=
          transaction.type === "debit" ? transaction.amount : -transaction.amount;
        return {
          date: transaction.dateStr,
          particulars: transaction.particulars,
          type: transaction.type,
          amount: transaction.amount,
          running_balance: runningBalance,
        };
      });

      const agingResult = await pool.query(
        `SELECT
           COALESCE(SUM(CASE
             WHEN date_issued >= $2::date AND date_issued < $3::date
             THEN balance_due ELSE 0 END), 0) AS current_month,
           COALESCE(SUM(CASE
             WHEN date_issued >= ($2::date - INTERVAL '1 month')
              AND date_issued < $2::date
             THEN balance_due ELSE 0 END), 0) AS one_month,
           COALESCE(SUM(CASE
             WHEN date_issued >= ($2::date - INTERVAL '2 months')
              AND date_issued < ($2::date - INTERVAL '1 month')
             THEN balance_due ELSE 0 END), 0) AS two_months,
           COALESCE(SUM(CASE
             WHEN date_issued < ($2::date - INTERVAL '2 months')
             THEN balance_due ELSE 0 END), 0) AS three_months_plus
         FROM greentarget.invoices
         WHERE customer_id = $1
           AND status IN ('active', 'overdue')
           AND balance_due > 0.01
           AND COALESCE(is_consolidated, false) = false
           AND type != 'consolidated'
           AND date_issued < $3::date`,
        [customerId, startDate, nextDate]
      );

      res.json({
        customer: {
          id: String(customer.customer_id),
          name: customer.name,
          address: customer.additional_info,
          city: null,
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
          current_month: parseAmount(agingResult.rows[0]?.current_month),
          one_month: parseAmount(agingResult.rows[0]?.one_month),
          two_months: parseAmount(agingResult.rows[0]?.two_months),
          three_months_plus: parseAmount(
            agingResult.rows[0]?.three_months_plus
          ),
        },
      });
    } catch (error) {
      console.error("Error fetching Green Target customer statement:", error);
      res.status(500).json({
        message: "Error fetching customer statement",
        error: error.message,
      });
    }
  });

  router.get("/debtors/general-statement", async (req, res) => {
    const includeZero = req.query.includeZero;
    const now = new Date();
    const monthInt = req.query.month
      ? parseInt(req.query.month, 10)
      : now.getMonth() + 1;
    const yearInt = req.query.year
      ? parseInt(req.query.year, 10)
      : now.getFullYear();

    if (isNaN(monthInt) || isNaN(yearInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({ message: "Invalid month or year" });
    }

    const { startDate, nextDate, statementDate } = getMonthRange(
      monthInt,
      yearInt
    );
    const reportDateTime = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    try {
      const result = await pool.query(
        `WITH customer_invoices AS (
           SELECT
             c.customer_id,
             c.name AS customer_name,
             i.invoice_id,
             i.date_issued,
             i.balance_due,
             i.total_amount
           FROM greentarget.customers c
           JOIN greentarget.invoices i ON c.customer_id = i.customer_id
           WHERE i.status IN ('active', 'overdue')
             AND i.balance_due > 0.01
             AND COALESCE(i.is_consolidated, false) = false
             AND i.type != 'consolidated'
             AND i.date_issued < $2::date
         ),
         customer_payments AS (
           SELECT
             i.customer_id,
             COALESCE(SUM(p.amount_paid), 0) AS monthly_payment
           FROM greentarget.invoices i
           JOIN greentarget.payments p ON i.invoice_id = p.invoice_id
           WHERE (p.status IS NULL OR p.status = 'active')
             AND i.status != 'cancelled'
             AND COALESCE(i.is_consolidated, false) = false
             AND i.type != 'consolidated'
             AND p.payment_date >= $1::date
             AND p.payment_date < $2::date
           GROUP BY i.customer_id
         ),
         customer_summary AS (
           SELECT
             ci.customer_id,
             ci.customer_name,
             COALESCE(SUM(CASE
               WHEN ci.date_issued < $1::date
               THEN ci.balance_due ELSE 0 END), 0) AS bal_bf,
             COALESCE(SUM(CASE
               WHEN ci.date_issued >= $1::date AND ci.date_issued < $2::date
               THEN ci.total_amount ELSE 0 END), 0) AS current_invoices,
             COALESCE(SUM(ci.balance_due), 0) AS total_due,
             COALESCE(SUM(CASE
               WHEN ci.date_issued >= $1::date AND ci.date_issued < $2::date
               THEN ci.balance_due ELSE 0 END), 0) AS aging_current,
             COALESCE(SUM(CASE
               WHEN ci.date_issued >= ($1::date - INTERVAL '1 month')
                AND ci.date_issued < $1::date
               THEN ci.balance_due ELSE 0 END), 0) AS aging_1_month,
             COALESCE(SUM(CASE
               WHEN ci.date_issued >= ($1::date - INTERVAL '2 months')
                AND ci.date_issued < ($1::date - INTERVAL '1 month')
               THEN ci.balance_due ELSE 0 END), 0) AS aging_2_months,
             COALESCE(SUM(CASE
               WHEN ci.date_issued < ($1::date - INTERVAL '2 months')
               THEN ci.balance_due ELSE 0 END), 0) AS aging_3_plus
           FROM customer_invoices ci
           GROUP BY ci.customer_id, ci.customer_name
         )
         SELECT
           cs.customer_id,
           cs.customer_name,
           cs.bal_bf,
           cs.current_invoices,
           COALESCE(cp.monthly_payment, 0) AS payment,
           cs.total_due,
           cs.aging_current,
           cs.aging_1_month,
           cs.aging_2_months,
           cs.aging_3_plus
         FROM customer_summary cs
         LEFT JOIN customer_payments cp ON cs.customer_id = cp.customer_id
         ORDER BY cs.customer_id ASC`,
        [startDate, nextDate]
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

      let customers = result.rows.map((row) => {
        const customer = {
          account_no: String(row.customer_id),
          particular: row.customer_name || "UNNAMED",
          bal_bf: parseAmount(row.bal_bf),
          current_invoices: parseAmount(row.current_invoices),
          payment: parseAmount(row.payment),
          total_due: parseAmount(row.total_due),
          aging_current: parseAmount(row.aging_current),
          aging_1_month: parseAmount(row.aging_1_month),
          aging_2_months: parseAmount(row.aging_2_months),
          aging_3_plus: parseAmount(row.aging_3_plus),
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

      // includeZero=1 (the interactive By Customer view): the SQL above only
      // returns customers with open GT invoices, so merge in every other
      // Green Target customer as a zero row.
      if (includeZero === "1") {
        const present = new Set(customers.map((c) => c.account_no));
        const allResult = await pool.query(
          `SELECT customer_id, name FROM greentarget.customers ORDER BY customer_id ASC`
        );
        for (const row of allResult.rows) {
          const accountNo = String(row.customer_id);
          if (present.has(accountNo)) continue;
          customers.push({
            account_no: accountNo,
            particular: row.name || "UNNAMED",
            bal_bf: 0,
            current_invoices: 0,
            payment: 0,
            total_due: 0,
            aging_current: 0,
            aging_1_month: 0,
            aging_2_months: 0,
            aging_3_plus: 0,
          });
        }
        customers.sort((a, b) => a.account_no.localeCompare(b.account_no));
      }

      // Server-side search, zero-balance filter and pagination for the
      // interactive By Customer view. Totals above always aggregate the
      // customers with open invoices.
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
      console.error("Error fetching Green Target general statement:", error);
      res.status(500).json({
        message: "Error fetching general statement",
        error: error.message,
      });
    }
  });

  // Check if internal reference is available
  router.get("/check-internal-ref/:ref(*)", async (req, res) => {
    const internal_reference = decodeURIComponent(req.params.ref);
    const { exclude_payment_id } = req.query;

    try {
      let query = `
        SELECT payment_id 
        FROM greentarget.payments 
        WHERE internal_reference = $1 
        AND (status IS NULL OR status != 'cancelled')
      `;
      const params = [internal_reference];

      if (exclude_payment_id) {
        query += " AND payment_id != $2";
        params.push(parseInt(exclude_payment_id, 10));
      }

      const result = await pool.query(query, params);

      res.json({
        available: result.rows.length === 0,
        exists: result.rows.length > 0,
        existing_id: result.rows.length > 0 ? result.rows[0].payment_id : null,
      });
    } catch (error) {
      console.error("Error checking internal reference:", error);
      res.status(500).json({
        message: "Error checking internal reference",
        error: error.message,
      });
    }
  });

  // Update a payment (currently for reference fields only to avoid balance complexity)
  router.put("/:payment_id", async (req, res) => {
    const { payment_id } = req.params;
    const { internal_reference, payment_reference } = req.body;

    // Check if there is anything to update
    if (internal_reference === undefined && payment_reference === undefined) {
      return res.status(400).json({ message: "No updatable fields provided." });
    }

    try {
      // If internal_reference is being updated, check for duplicates on non-cancelled payments
      if (internal_reference !== undefined && internal_reference !== null) {
        const checkQuery = `
          SELECT payment_id 
          FROM greentarget.payments 
          WHERE internal_reference = $1 
            AND payment_id != $2 
            AND (status IS NULL OR status != 'cancelled')
        `;
        const checkResult = await pool.query(checkQuery, [
          internal_reference,
          payment_id,
        ]);
        if (checkResult.rows.length > 0) {
          return res.status(409).json({
            // 409 Conflict
            message: `Internal reference "${internal_reference}" is already in use on an active payment.`,
            error: "duplicate_reference",
          });
        }
      }

      // Build the update query dynamically
      const fieldsToUpdate = [];
      const queryParams = [];
      let paramIndex = 1;

      if (internal_reference !== undefined) {
        fieldsToUpdate.push(`internal_reference = $${paramIndex++}`);
        queryParams.push(internal_reference);
      }

      if (payment_reference !== undefined) {
        fieldsToUpdate.push(`payment_reference = $${paramIndex++}`);
        queryParams.push(payment_reference);
      }

      queryParams.push(payment_id);

      const query = `
        UPDATE greentarget.payments
        SET ${fieldsToUpdate.join(", ")}
        WHERE payment_id = $${paramIndex}
        RETURNING *
      `;

      const result = await pool.query(query, queryParams);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Payment not found" });
      }

      res.json({
        message: "Payment updated successfully",
        payment: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating payment:", error);
      res.status(500).json({
        message: "Error updating payment",
        error: error.message,
      });
    }
  });

  // Confirm pending payment
  router.put("/:payment_id/confirm", async (req, res) => {
    const { payment_id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get the payment details and lock the payment row
      const paymentQuery = `
        SELECT p.*, i.customer_id, i.balance_due, i.status as invoice_status
        FROM greentarget.payments p
        JOIN greentarget.invoices i ON p.invoice_id = i.invoice_id
        WHERE p.payment_id = $1 AND p.status = 'pending'
        FOR UPDATE OF p, i
      `;
      const paymentResult = await client.query(paymentQuery, [payment_id]);

      if (paymentResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Payment not found or not in pending status",
        });
      }

      const payment = paymentResult.rows[0];
      const { invoice_id, amount_paid, customer_id } = payment;
      const currentBalance = Number(payment.balance_due);
      const paymentAmount = Number(amount_paid);

      if (
        !Number.isFinite(currentBalance) ||
        currentBalance <= 0 ||
        !["active", "overdue"].includes(payment.invoice_status)
      ) {
        throw createPaymentError(
          409,
          `Invoice ${invoice_id} is no longer available for payment`
        );
      }
      if (
        !Number.isFinite(paymentAmount) ||
        paymentAmount <= 0 ||
        paymentAmount > currentBalance
      ) {
        throw createPaymentError(
          409,
          `Pending payment cannot exceed the current invoice balance of RM${currentBalance.toFixed(
            2
          )}`
        );
      }

      // Update payment status to active
      const updatePaymentQuery = `
        UPDATE greentarget.payments 
        SET status = 'active' 
        WHERE payment_id = $1
        RETURNING *
      `;
      const updatedPayment = await client.query(updatePaymentQuery, [
        payment_id,
      ]);

      // Update invoice balance and status
      const newBalanceDue = Math.max(0, currentBalance - paymentAmount);
      const currentInvoiceStatus = payment.invoice_status;

      let newInvoiceStatus;
      if (newBalanceDue === 0) {
        newInvoiceStatus = "paid";
      } else {
        newInvoiceStatus =
          currentInvoiceStatus === "overdue" ? "overdue" : "active";
      }

      await client.query(
        `UPDATE greentarget.invoices SET balance_due = $1, status = $2 WHERE invoice_id = $3`,
        [newBalanceDue, newInvoiceStatus, invoice_id]
      );

      // Update customer last_activity_date
      await client.query(
        `UPDATE greentarget.customers SET last_activity_date = CURRENT_DATE WHERE customer_id = $1`,
        [customer_id]
      );

      await client.query("COMMIT");

      res.json({
        message: "Payment confirmed successfully",
        payment: updatedPayment.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error confirming Green Target payment:", error);
      const statusCode = Number(error?.statusCode) || 500;
      res.status(statusCode).json({
        message:
          statusCode < 500 ? error.message : "Error confirming payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  router.put("/:payment_id/cancel", async (req, res) => {
    const { payment_id } = req.params;
    const { reason } = req.body; // Optional cancellation reason
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get payment details and related invoice status, and lock rows for update
      const paymentQuery = `
        SELECT p.*, i.customer_id, i.balance_due, i.status as invoice_status
        FROM greentarget.payments p
        JOIN greentarget.invoices i ON p.invoice_id = i.invoice_id
        WHERE p.payment_id = $1 AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending')
        FOR UPDATE OF p, i
      `;
      const paymentResult = await client.query(paymentQuery, [payment_id]);

      if (paymentResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ message: "Payment not found or already cancelled" });
      }

      const payment = paymentResult.rows[0];
      const {
        invoice_id,
        amount_paid,
        invoice_status,
        status: payment_status,
      } = payment;

      if (payment_status !== "pending") {
        if (invoice_status === "cancelled") {
          throw new Error(
            `Cannot cancel payment for a cancelled invoice (${invoice_id}).`
          );
        }

        const existingAdjustment = await fetchActiveAdjustmentForInvoice(
          client,
          invoice_id
        );
        if (existingAdjustment) {
          throw new Error(
            `Cannot cancel payment for invoice ${invoice_id} because active adjustment document ${existingAdjustment.id} exists. Cancel the adjustment document first.`
          );
        }
      }

      // Set payment status to cancelled
      const updatePaymentQuery = `
        UPDATE greentarget.payments
        SET status = 'cancelled',
            cancellation_date = CURRENT_TIMESTAMP,
            cancellation_reason = $1
        WHERE payment_id = $2
        RETURNING *
      `;
      const updateResult = await client.query(updatePaymentQuery, [
        reason || null,
        payment_id,
      ]);

      // Pending cheques have not reduced the invoice balance or updated the
      // customer's paid activity, so cancelling one must only cancel the
      // payment row. Active payments still restore the invoice balance.
      if (payment_status !== "pending") {
        const currentBalance = parseFloat(payment.balance_due);
        const paymentAmount = parseFloat(amount_paid);
        const newBalance = currentBalance + paymentAmount;

        let newStatus;
        if (newBalance > 0) {
          newStatus = invoice_status === "overdue" ? "overdue" : "active";
        } else {
          newStatus = "paid";
        }

        await client.query(
          "UPDATE greentarget.invoices SET balance_due = $1, status = $2 WHERE invoice_id = $3",
          [newBalance, newStatus, invoice_id]
        );
      }

      await client.query("COMMIT");

      res.json({
        message: "Payment cancelled successfully",
        payment: updateResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling payment:", error);
      const isUserError =
        typeof error.message === "string" &&
        (error.message.startsWith("Cannot cancel payment") ||
          error.message.includes("active adjustment document"));
      res.status(isUserError ? 400 : 500).json({
        message: isUserError ? error.message : "Error cancelling payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Replace Delete with redirect to Cancel for backward compatibility
  router.delete("/:payment_id", async (req, res) => {
    const { payment_id } = req.params;

    // Forward to the cancel endpoint
    req.method = "PUT";
    req.url = `/${payment_id}/cancel`;

    // Add deprecation warning header
    res.setHeader(
      "X-Deprecated-API",
      "Use PUT /greentarget/api/payments/:payment_id/cancel instead"
    );

    // Pass the request to the cancel handler
    router.handle(req, res);
  });

  return router;
}
