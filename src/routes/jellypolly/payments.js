// src/routes/sales/invoices/payments.js
import { Router } from "express";
import { requireChequeClearanceDate } from "../utils/cheque-clearance-date.js";
import { toLocalAccountingDateString } from "../accounting/posting-lock.js";

// Helper function (can be moved to a shared util if used elsewhere)
const updateCustomerCredit = async (client, customerId, amount) => {
  try {
    const updateQuery = `
      UPDATE customers
      SET credit_used = GREATEST(0, COALESCE(credit_used, 0) + $1)
      WHERE id = $2
      RETURNING credit_used, credit_limit
    `;
    const result = await client.query(updateQuery, [amount, customerId]);
    if (result.rows.length === 0) {
      console.warn(`Customer ${customerId} not found when updating credit`);
      return null;
    }
    return result.rows[0];
  } catch (error) {
    console.error(`Error updating credit for customer ${customerId}:`, error);
    throw error; // Re-throw to be caught by transaction handler
  }
};

const createPaymentError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
};

// Accepts only an explicit yyyy-MM-dd from the client so an edited date can
// never be reinterpreted through UTC on its way into the payment row.
const normalizeEditableDate = (value, label) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    const error = new Error(`${label} is required.`);
    error.status = 400;
    throw error;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const error = new Error(`${label} must be a valid date in yyyy-MM-dd format.`);
    error.status = 400;
    throw error;
  }
  try {
    return toLocalAccountingDateString(raw);
  } catch (_error) {
    const error = new Error(`${label} must be a valid date in yyyy-MM-dd format.`);
    error.status = 400;
    throw error;
  }
};

const fetchActiveAdjustmentForInvoice = async (client, invoiceId) => {
  const result = await client.query(
    `SELECT id, type
       FROM jellypolly.adjustment_documents
      WHERE original_invoice_id = $1
        AND status = 'active'
        AND COALESCE(is_consolidated, false) = false
      ORDER BY created_at DESC
      LIMIT 1`,
    [invoiceId]
  );
  return result.rows[0] || null;
};

export default function (pool) {
  const router = Router();

  // --- GET /api/payments (Get Payments) ---
  // Added filtering by invoice_id
  router.get("/", async (req, res) => {
    const { invoice_id, include_cancelled } = req.query; // Add new parameter

    try {
      let query = `
        SELECT
          p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
          p.posting_date,
          p.payment_method, p.payment_reference, p.internal_reference,
          p.notes, p.created_at, p.status, p.cancellation_date
        FROM jellypolly.payments p
        WHERE 1=1
      `;
      const queryParams = [];
      let paramCounter = 1;

      if (invoice_id) {
        queryParams.push(invoice_id);
        query += ` AND p.invoice_id = $${paramCounter++}`;
      }

      // Only include active payments by default
      if (include_cancelled !== "true") {
        query += ` AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending' OR p.status = 'overpaid')`;
      }

      query += " ORDER BY p.payment_date DESC, p.created_at DESC";

      const result = await pool.query(query, queryParams);

      // Parse amount_paid to number before sending
      const payments = result.rows.map((p) => ({
        ...p,
        amount_paid: parseFloat(p.amount_paid || 0),
      }));

      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res
        .status(500)
        .json({ message: "Error fetching payments", error: error.message });
    }
  });

  // --- GET /api/payments/all (Get All Payments with Enhanced Filters) ---
  router.get("/all", async (req, res) => {
    const {
      startDate,
      endDate,
      paymentMethod,
      status,
      search,
      include_cancelled = "true",
    } = req.query;

    try {
      let query = `
        SELECT
          p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
          p.posting_date,
          p.payment_method, p.payment_reference, p.internal_reference,
          p.notes, p.created_at, p.status, p.cancellation_date,
          i.customerid, i.salespersonid, c.name as customer_name
        FROM jellypolly.payments p
        JOIN jellypolly.invoices i ON p.invoice_id = i.id
        LEFT JOIN customers c ON i.customerid = c.id
        WHERE 1=1
      `;

      const queryParams = [];
      let paramCounter = 1;

      // Date filter
      if (startDate && endDate) {
        queryParams.push(
          new Date(parseInt(startDate)),
          new Date(parseInt(endDate))
        );
        query += ` AND p.payment_date BETWEEN $${paramCounter++} AND $${paramCounter++}`;
      }

      // Payment method filter
      if (paymentMethod) {
        queryParams.push(paymentMethod);
        query += ` AND p.payment_method = $${paramCounter++}`;
      }

      // Status filter
      if (status) {
        if (status === "active") {
          query += ` AND (p.status = 'active' OR p.status = 'pending' OR p.status = 'overpaid')`;
        } else {
          queryParams.push(status);
          query += ` AND p.status = $${paramCounter++}`;
        }
      } else if (include_cancelled !== "true") {
        query += ` AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending' OR p.status = 'overpaid')`;
      }

      // Search filter
      if (search) {
        queryParams.push(`%${search}%`);
        query += ` AND (
          p.invoice_id ILIKE $${paramCounter++} OR
          p.payment_reference ILIKE $${paramCounter++} OR
          p.internal_reference ILIKE $${paramCounter++} OR
          CAST(p.amount_paid AS TEXT) ILIKE $${paramCounter++} OR
          c.name ILIKE $${paramCounter++} OR
          CAST(i.salespersonid AS TEXT) ILIKE $${paramCounter++}
        )`;
        
        // Add the search parameter multiple times for each ILIKE condition
        for (let i = 1; i < 6; i++) {
          queryParams.push(`%${search}%`);
        }
      }

      query += " ORDER BY p.payment_date DESC, p.created_at DESC";

      const result = await pool.query(query, queryParams);

      // Parse amount_paid to number before sending
      const payments = result.rows.map((p) => ({
        ...p,
        amount_paid: parseFloat(p.amount_paid || 0),
      }));

      res.json(payments);
    } catch (error) {
      console.error("Error fetching all payments:", error);
      res
        .status(500)
        .json({ message: "Error fetching payments", error: error.message });
    }
  });

  // --- GET /reference-usage/:ref ---
  // Which ACTIVE payments already carry this reference, so the payment form can
  // warn while the user types instead of only rejecting on save. Optional
  // ?exclude_invoice_id keeps the same-invoice case (a hard error on create) out
  // of the cross-invoice warning.
  router.get("/reference-usage/:ref(*)", async (req, res) => {
    const reference = String(req.params.ref || "").trim();
    const excludeInvoiceId =
      typeof req.query.exclude_invoice_id === "string" &&
      req.query.exclude_invoice_id.trim()
        ? req.query.exclude_invoice_id.trim()
        : null;

    if (!reference) {
      return res.json({ reference: "", count: 0, payments: [] });
    }

    try {
      const result = await pool.query(
        `SELECT p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
                p.payment_method, p.payment_reference, p.status,
                i.customerid
          FROM jellypolly.payments p
          LEFT JOIN jellypolly.invoices i ON i.id = p.invoice_id
          WHERE UPPER(TRIM(p.payment_reference)) = UPPER($1)
            AND ($2::varchar IS NULL OR p.invoice_id <> $2)
            AND (p.status IS NULL OR p.status NOT IN ('cancelled', 'pending'))
          ORDER BY p.payment_date DESC, p.payment_id DESC
          LIMIT 20`,
        [reference, excludeInvoiceId]
      );

      res.json({
        reference,
        count: result.rows.length,
        payments: result.rows,
      });
    } catch (error) {
      console.error("Error checking Jelly Polly reference usage:", error);
      res.status(500).json({
        message: "Error checking payment reference",
        error: error.message,
      });
    }
  });

  // --- POST /api/payments (Create Payment) ---
  router.post("/", async (req, res) => {
    const {
      invoice_id, // Required: ID of the invoice being paid
      payment_date, // Required: Date of payment
      amount_paid, // Required: Amount being paid
      payment_method, // Required: 'cash', 'cheque', 'bank_transfer', 'online'
      payment_reference, // Optional: Cheque no, transaction ID, etc.
      notes, // Optional: Any notes about the payment
      // Set once the user has seen which other invoices already use this
      // reference and confirmed it is the same transfer.
      confirm_duplicate_reference,
      // internal_reference is NOT expected from frontend for standard payments
    } = req.body;

    // Basic validation
    if (!invoice_id || !payment_date || !amount_paid || !payment_method) {
      return res.status(400).json({
        message:
          "Missing required fields: invoice_id, payment_date, amount_paid, payment_method",
      });
    }
    if (isNaN(parseFloat(amount_paid)) || parseFloat(amount_paid) <= 0) {
      return res.status(400).json({
        message: "Invalid payment amount. Must be a positive number.",
      });
    }

    // Check for duplicate payment reference for the same invoice
    if (payment_reference && payment_reference.trim()) {
      const duplicateCheck = await pool.query(
        `SELECT payment_id FROM jellypolly.payments
         WHERE invoice_id = $1 AND payment_reference = $2
         AND (status IS NULL OR status != 'cancelled')`,
        [invoice_id, payment_reference.trim()]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          message: `Payment reference "${payment_reference}" already exists for this invoice. Please use a unique reference.`,
        });
      }

      // The same reference on ANOTHER invoice is legitimate — one transfer can
      // settle several invoices — but it is also how a mis-keyed reference
      // hides, and Jelly Polly has no receipt header to group them under. So it
      // is reported and requires an explicit confirmation instead of a silent
      // pass, which is all the same-invoice check used to allow.
      if (!confirm_duplicate_reference) {
        const otherInvoiceUsage = await pool.query(
          `SELECT p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
                  p.payment_method, p.status
             FROM jellypolly.payments p
            WHERE UPPER(TRIM(p.payment_reference)) = UPPER($1)
              AND p.invoice_id <> $2
              AND (p.status IS NULL OR p.status NOT IN ('cancelled', 'pending'))
            ORDER BY p.payment_date DESC, p.payment_id DESC
            LIMIT 20`,
          [payment_reference.trim(), invoice_id]
        );

        if (otherInvoiceUsage.rows.length > 0) {
          return res.status(409).json({
            code: "DUPLICATE_PAYMENT_REFERENCE",
            requires_confirmation: true,
            message: `Reference "${payment_reference.trim()}" is already used by ${
              otherInvoiceUsage.rows.length === 1
                ? "another payment"
                : `${otherInvoiceUsage.rows.length} other payments`
            }. Confirm that this is the same transfer, or use a different reference.`,
            reference: payment_reference.trim(),
            payments: otherInvoiceUsage.rows,
          });
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get Invoice details & Lock the row
      const invoiceQuery = `
        SELECT id, customerid, paymenttype, totalamountpayable, balance_due, invoice_status
        FROM jellypolly.invoices
        WHERE id = $1 FOR UPDATE
      `;
      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        throw createPaymentError(404, `Invoice ${invoice_id} not found.`);
      }
      const invoice = invoiceResult.rows[0];
      const currentBalance = parseFloat(invoice.balance_due || 0);

      // 2. Check invoice status and payment amount
      if (invoice.invoice_status === "cancelled") {
        throw createPaymentError(
          409,
          `Invoice ${invoice_id} is cancelled and cannot receive payments.`
        );
      }
      if (parseFloat(amount_paid) > currentBalance) {
        throw createPaymentError(
          400,
          `Payment amount (${parseFloat(amount_paid).toFixed(
            2
          )}) exceeds balance due (${currentBalance.toFixed(2)}).`
        );
      }

      // 3. Insert the payment record
      const insertPaymentQuery = `
  INSERT INTO jellypolly.payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, notes, status, posting_date
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING *
`;

      // Determine initial status based on payment method
      const initialStatus = payment_method === "cheque" ? "pending" : "active";

      const paymentValues = [
        invoice_id,
        payment_date,
        parseFloat(amount_paid),
        payment_method,
        payment_reference || null, // Use null if empty/undefined
        notes || null,
        initialStatus, // Set initial status based on payment method
        initialStatus === "pending" ? null : payment_date,
      ];
      const paymentResult = await client.query(
        insertPaymentQuery,
        paymentValues
      );
      const createdPayment = paymentResult.rows[0];

      // Only update invoice balance and customer credit if payment is active (not pending)
      if (initialStatus === "active") {
        // 4. Update Invoice balance and status
        const newBalance = Math.max(
          0,
          currentBalance - parseFloat(amount_paid)
        );
        // Round to 2 decimal places to avoid floating point issues
        const finalNewBalance = parseFloat(newBalance.toFixed(2));

        // Get current invoice status to maintain overdue status for partial payments
        let newStatus;
        if (finalNewBalance <= 0) {
          newStatus = "paid"; // Always paid if balance is 0
        } else {
          // If still has balance, maintain "overdue" status if it was already overdue
          if (invoice.invoice_status === "Overdue") {
            newStatus = "Overdue"; // Maintain overdue status for partial payments
          } else {
            newStatus = "Unpaid"; // Otherwise use normal unpaid status
          }
        }

        const updateInvoiceQuery = `
    UPDATE jellypolly.invoices
    SET balance_due = $1, invoice_status = $2
    WHERE id = $3
  `;
        await client.query(updateInvoiceQuery, [
          finalNewBalance,
          newStatus,
          invoice_id,
        ]);

        // 5. Update Customer Credit if it was an INVOICE payment
        if (invoice.paymenttype === "INVOICE") {
          await updateCustomerCredit(
            client,
            invoice.customerid,
            -parseFloat(amount_paid) // Reduce credit used
          );
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Payment created successfully",
        // Parse amount back to float for consistency in response
        payment: {
          ...createdPayment,
          amount_paid: parseFloat(createdPayment.amount_paid || 0),
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating payment:", error);
      const status = error.status || 500;
      res
        .status(status)
        .json({
          code: error.code,
          message: status < 500 ? error.message : "Error creating payment",
          error: status < 500 ? undefined : error.message,
          requires_confirmation: error.requires_confirmation || undefined,
          candidate: error.candidate || undefined,
        });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/payments/:payment_id/confirm - Mark pending payment as paid ---
  router.put("/:payment_id/confirm", async (req, res) => {
    const { payment_id } = req.params;
    const { posting_date } = req.body;
    const paymentIdNum = parseInt(payment_id);

    if (isNaN(paymentIdNum)) {
      return res.status(400).json({ message: "Invalid payment ID." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get Payment details & Lock Invoice Row
      const paymentQuery = `
      SELECT p.*, i.customerid, i.paymenttype, i.invoice_status, i.balance_due
      FROM jellypolly.payments p
      JOIN jellypolly.invoices i ON p.invoice_id = i.id
      WHERE p.payment_id = $1 AND p.status = 'pending'
      FOR UPDATE OF p, i
    `;
      const paymentResult = await client.query(paymentQuery, [paymentIdNum]);

      if (paymentResult.rows.length === 0) {
        throw new Error(
          `Payment ${paymentIdNum} not found or not in pending status.`
        );
      }
      const payment = paymentResult.rows[0];
      const {
        invoice_id,
        amount_paid,
        customerid,
        paymenttype,
        invoice_status,
      } = payment;
      const paidAmount = parseFloat(amount_paid || 0);
      const postingDate = requireChequeClearanceDate(
        posting_date,
        payment.payment_date
      );

      // Prevent confirming payment if invoice is cancelled
      if (invoice_status === "cancelled") {
        throw new Error(
          `Cannot confirm payment for a cancelled invoice (${invoice_id}).`
        );
      }

      // 2. Update payment status to active
      const updatePaymentQuery = `
      UPDATE jellypolly.payments 
      SET status = 'active', posting_date = $2
      WHERE payment_id = $1
      RETURNING *
    `;
      const updateResult = await client.query(updatePaymentQuery, [
        paymentIdNum,
        postingDate,
      ]);
      const confirmedPayment = updateResult.rows[0];

      // 3. Update Invoice balance and status (same logic as original payment creation)
      const currentBalance = parseFloat(payment.balance_due || 0);
      const newBalance = Math.max(0, currentBalance - paidAmount);
      const finalNewBalance = parseFloat(newBalance.toFixed(2));

      let newStatus;
      if (finalNewBalance <= 0) {
        newStatus = "paid";
      } else {
        if (invoice_status === "Overdue") {
          newStatus = "Overdue";
        } else {
          newStatus = "Unpaid";
        }
      }

      const updateInvoiceQuery = `
      UPDATE jellypolly.invoices
      SET balance_due = $1, invoice_status = $2
      WHERE id = $3
    `;
      await client.query(updateInvoiceQuery, [
        finalNewBalance,
        newStatus,
        invoice_id,
      ]);

      // 4. Update Customer Credit if it was an INVOICE payment
      if (paymenttype === "INVOICE") {
        await updateCustomerCredit(
          client,
          customerid,
          -paidAmount // Reduce credit used
        );
      }

      await client.query("COMMIT");

      res.json({
        message: "Payment confirmed successfully",
        payment: {
          ...confirmedPayment,
          amount_paid: parseFloat(confirmedPayment.amount_paid || 0),
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error confirming payment:", error);
      res
        .status(error.status || 500)
        .json({
          message: error.message || "Error confirming payment",
          code: error.code,
        });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/payments/:payment_id/date - Correct a mis-keyed payment date ---
  // Jelly Polly posts no journal entries, so a date correction only rewrites the
  // payment rows; the debtors report and account ledger read
  // COALESCE(posting_date, payment_date) at query time and follow automatically.
  // Payment Management groups a cheque by reference + date + method, so the whole
  // group moves together or a multi-invoice cheque would split into two rows.
  router.put("/:payment_id/date", async (req, res) => {
    const { payment_id } = req.params;
    const { payment_date, posting_date, expected_payment_date } = req.body;
    const paymentIdNum = parseInt(payment_id, 10);

    if (isNaN(paymentIdNum)) {
      return res.status(400).json({ message: "Invalid payment ID." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const anchorResult = await client.query(
        `SELECT p.*, i.paymenttype
           FROM jellypolly.payments p
           JOIN jellypolly.invoices i ON i.id = p.invoice_id
          WHERE p.payment_id = $1
          FOR UPDATE OF p`,
        [paymentIdNum]
      );
      if (anchorResult.rows.length === 0) {
        const error = new Error("Payment not found.");
        error.status = 404;
        throw error;
      }

      const anchor = anchorResult.rows[0];
      if (anchor.status === "cancelled") {
        const error = new Error(
          "This payment is cancelled and its date cannot be changed."
        );
        error.status = 400;
        throw error;
      }
      // A cash bill's collection belongs to the invoice: changing the invoice
      // date already rewrites it, so editing it here would silently revert.
      if (anchor.paymenttype === "CASH") {
        const error = new Error(
          "This payment belongs to a cash bill and always follows the bill date. Change the invoice date instead."
        );
        error.status = 400;
        throw error;
      }

      const currentDate = toLocalAccountingDateString(anchor.payment_date);
      const normalizedExpectedDate =
        expected_payment_date === null || expected_payment_date === undefined
          ? null
          : toLocalAccountingDateString(expected_payment_date);
      if (normalizedExpectedDate && normalizedExpectedDate !== currentDate) {
        const error = new Error(
          "This payment date changed after you opened it. Reload and try again."
        );
        error.status = 409;
        error.code = "PAYMENT_DATE_CHANGED";
        throw error;
      }

      // No future-date guard: a post-dated cheque is legitimately received now
      // and dated later. Only the clearance date below is constrained — money
      // cannot have cleared the bank in the future.
      const nextDate = normalizeEditableDate(payment_date, "Payment date");
      const today = toLocalAccountingDateString(new Date());

      // The visible payment group: same cheque/transfer reference keyed on the
      // same day with the same method. A payment with no reference is its own
      // group, exactly as Payment Management renders it.
      const groupResult = anchor.payment_reference
        ? await client.query(
            `SELECT payment_id, posting_date
               FROM jellypolly.payments
              WHERE payment_reference = $1
                AND payment_date::date = $2::date
                AND payment_method = $3
                AND (status IS NULL OR status != 'cancelled')
              ORDER BY payment_id
              FOR UPDATE`,
            [anchor.payment_reference, currentDate, anchor.payment_method]
          )
        : { rows: [{ payment_id: anchor.payment_id, posting_date: anchor.posting_date }] };

      const groupIds = groupResult.rows.map((row) => row.payment_id);
      if (!groupIds.includes(paymentIdNum)) {
        const error = new Error(
          "This payment group changed after you opened it. Reload and try again."
        );
        error.status = 409;
        error.code = "PAYMENT_DATE_CHANGED";
        throw error;
      }

      // Confirmed payments carry an accounting date of their own; members still
      // pending have none and must keep it until they are confirmed. An omitted
      // clearance date leaves every posting date untouched rather than
      // flattening a group that was confirmed in more than one batch.
      const postedRows = groupResult.rows.filter(
        (row) => row.posting_date !== null
      );
      const postedIds = postedRows.map((row) => row.payment_id);
      let nextPostingDate = null;
      if (posting_date !== null && posting_date !== undefined) {
        if (postedIds.length === 0) {
          const error = new Error(
            "This payment has not been confirmed yet, so it has no clearance date to change."
          );
          error.status = 400;
          throw error;
        }
        nextPostingDate = normalizeEditableDate(posting_date, "Clearance date");
        if (nextPostingDate < nextDate) {
          const error = new Error(
            `Clearance date cannot be before the payment date (${nextDate}).`
          );
          error.status = 400;
          throw error;
        }
        if (nextPostingDate > today) {
          const error = new Error("Clearance date cannot be in the future.");
          error.status = 400;
          throw error;
        }
      } else {
        for (const row of postedRows) {
          const existingPostingDate = toLocalAccountingDateString(
            row.posting_date
          );
          if (existingPostingDate < nextDate) {
            const error = new Error(
              `Payment ${row.payment_id} cleared on ${existingPostingDate}, before the new payment date (${nextDate}). Set the clearance date as well.`
            );
            error.status = 400;
            throw error;
          }
        }
      }

      await client.query(
        `UPDATE jellypolly.payments SET payment_date = $2::date WHERE payment_id = ANY($1::int[])`,
        [groupIds, nextDate]
      );
      if (nextPostingDate) {
        await client.query(
          `UPDATE jellypolly.payments SET posting_date = $2::date WHERE payment_id = ANY($1::int[])`,
          [postedIds, nextPostingDate]
        );
      }

      const updated = await client.query(
        `SELECT payment_id, invoice_id, payment_date, posting_date, amount_paid,
                payment_method, payment_reference, status
           FROM jellypolly.payments
          WHERE payment_id = ANY($1::int[])
          ORDER BY payment_id`,
        [groupIds]
      );

      await client.query("COMMIT");

      res.json({
        message:
          groupIds.length > 1
            ? `Date updated for ${groupIds.length} payments under reference ${anchor.payment_reference}.`
            : "Payment date updated.",
        payment_date: nextDate,
        posting_date: nextPostingDate,
        updated_payment_count: groupIds.length,
        payments: updated.rows.map((p) => ({
          ...p,
          amount_paid: parseFloat(p.amount_paid || 0),
        })),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating payment date:", error);
      res.status(error.status || 500).json({
        code: error.code,
        message: error.message || "Error updating payment date",
      });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/payments/:payment_id/cancel (Cancel Payment) ---
  router.put("/:payment_id/cancel", async (req, res) => {
    const { payment_id } = req.params;
    const { reason } = req.body; // Optional cancellation reason
    const paymentIdNum = parseInt(payment_id);

    if (isNaN(paymentIdNum)) {
      return res.status(400).json({ message: "Invalid payment ID." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get Payment details & Lock Invoice Row
      const paymentQuery = `
        SELECT p.*, i.customerid, i.paymenttype, i.invoice_status
        FROM jellypolly.payments p
        JOIN jellypolly.invoices i ON p.invoice_id = i.id
        WHERE p.payment_id = $1 
          AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending')
        FOR UPDATE OF i -- Lock the associated invoice row
      `;
      const paymentResult = await client.query(paymentQuery, [paymentIdNum]);

      if (paymentResult.rows.length === 0) {
        throw new Error(
          `Payment ${paymentIdNum} not found or already cancelled.`
        );
      }
      const payment = paymentResult.rows[0];
      const {
        invoice_id,
        amount_paid,
        customerid,
        paymenttype,
        invoice_status,
      } = payment;
      const paidAmount = parseFloat(amount_paid || 0);

      // Optional: Prevent canceling payment if invoice is cancelled?
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

      // 2. Update payment status to cancelled
      const updateQuery = `
        UPDATE jellypolly.payments 
        SET status = 'cancelled', 
            cancellation_date = NOW(),
            cancellation_reason = $1
        WHERE payment_id = $2
        RETURNING *
      `;
      const updateResult = await client.query(updateQuery, [
        reason || null,
        paymentIdNum,
      ]);
      const cancelledPayment = updateResult.rows[0];

      // 3. If the payment was active, revert the balance and credit.
      // If it was pending, no financial changes are needed.
      if (payment.status === "active") {
        // Get current balance *after* locking
        const currentInvoiceState = await client.query(
          "SELECT balance_due, invoice_status, totalamountpayable FROM jellypolly.invoices WHERE id = $1",
          [invoice_id]
        );
        const currentBalance = parseFloat(
          currentInvoiceState.rows[0].balance_due || 0
        );
        const currentStatus = currentInvoiceState.rows[0].invoice_status;
        const totalPayable = parseFloat(
          currentInvoiceState.rows[0].totalamountpayable || 0
        );

        // Cap the restored balance at what is genuinely unpaid (invoice total
        // minus the remaining active payments), so a stray active payment can
        // never inflate the balance past the invoice total. Safe because
        // cancellation is blocked when active adjustment documents exist.
        const otherActiveResult = await client.query(
          `SELECT COALESCE(SUM(amount_paid), 0) AS active_paid
           FROM jellypolly.payments
           WHERE invoice_id = $1 AND payment_id != $2
             AND (status IS NULL OR status = 'active')`,
          [invoice_id, paymentIdNum]
        );
        const otherActivePaid = parseFloat(
          otherActiveResult.rows[0].active_paid || 0
        );
        const maxBalance = Math.max(0, totalPayable - otherActivePaid);

        const newBalance = Math.min(currentBalance + paidAmount, maxBalance);
        // Round to 2 decimal places
        const finalNewBalance = parseFloat(newBalance.toFixed(2));

        // Determine the new status
        let newStatus;
        if (finalNewBalance <= 0) {
          newStatus = "paid"; // Fully paid
        } else {
          // If invoice was overdue before, keep it overdue
          if (currentStatus === "Overdue") {
            newStatus = "Overdue";
          } else {
            // Otherwise use normal unpaid status
            newStatus = "Unpaid";
          }
        }

        const updateInvoiceQuery = `
          UPDATE jellypolly.invoices SET balance_due = $1, invoice_status = $2
          WHERE id = $3
        `;
        await client.query(updateInvoiceQuery, [
          finalNewBalance,
          newStatus,
          invoice_id,
        ]);

        // 4. Update Customer Credit if it was an INVOICE payment
        if (paymenttype === "INVOICE") {
          // Add back the actual balance increase (matches the cap above)
          const balanceRestored = parseFloat(
            (finalNewBalance - currentBalance).toFixed(2)
          );
          if (balanceRestored > 0) {
            await updateCustomerCredit(client, customerid, balanceRestored);
          }
        }
      } else {
        // For pending payments, no balance or credit adjustments needed
        console.log(
          `Cancelled pending payment ${paymentIdNum} - no balance/credit adjustments made`
        );
      }

      await client.query("COMMIT");

      res.json({
        message: "Payment cancelled successfully",
        // Parse amount back to float
        payment: {
          ...cancelledPayment,
          amount_paid: parseFloat(cancelledPayment.amount_paid || 0),
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling payment:", error);
      res
        .status(500)
        .json({ message: "Error cancelling payment", error: error.message });
    } finally {
      client.release();
    }
  });

  // Keep the DELETE endpoint for backward compatibility but mark as deprecated
  router.delete("/:payment_id", async (req, res) => {
    const { payment_id } = req.params;

    // Forward the request to the new cancel endpoint
    req.method = "PUT";
    req.url = `/${payment_id}/cancel`;

    // Add deprecation warning header
    res.setHeader(
      "X-Deprecated-API",
      "Use PUT /api/payments/:payment_id/cancel instead"
    );

    // Pass to the cancel endpoint handler
    router.handle(req, res);
  });

  return router;
}
