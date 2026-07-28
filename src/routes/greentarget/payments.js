// src/routes/greentarget/payments.js
import { Router } from "express";
import {
  syncGTPaymentJournalEntry,
  cancelGTPaymentJournalEntry,
  updateGTPaymentJournalReference,
} from "./accounting/payment-journal.js";
import { assertGreenTargetAccountingDateUnlocked } from "./accounting/posting-lock.js";

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

      // G7: the posting lock guards the payment's accounting date; the
      // payment-owned REC journal posts only for active payments on organic
      // (post-cutover) invoices — pending cheques post at confirmation.
      assertGreenTargetAccountingDateUnlocked(payment_date, "Payment");
      if (initialStatus === "active") {
        await syncGTPaymentJournalEntry(
          client,
          paymentResult.rows[0],
          invoice,
          null
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

      // G7: keep the payment-owned journal's visible reference in step
      // (amounts and dates are not editable on GT payments).
      await updateGTPaymentJournalReference(pool, result.rows[0]);

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
        SELECT p.*, i.customer_id, i.balance_due, i.status as invoice_status,
               i.date_issued as invoice_date_issued, i.invoice_number
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

      // G7: a confirmed cheque posts its REC journal now (pending cheques
      // post nothing at creation).
      assertGreenTargetAccountingDateUnlocked(
        payment.payment_date,
        "Payment confirmation"
      );
      await syncGTPaymentJournalEntry(
        client,
        updatedPayment.rows[0],
        {
          customer_id: payment.customer_id,
          invoice_number: payment.invoice_number,
          date_issued: payment.invoice_date_issued,
        },
        null
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

      // G7: cancelling a payment is a locked-period mutation when dated
      // pre-cutover, and its REC journal is cancelled with it (pending
      // cheques never posted one).
      assertGreenTargetAccountingDateUnlocked(
        payment.payment_date,
        "Payment cancellation"
      );
      if (payment.journal_entry_id) {
        await cancelGTPaymentJournalEntry(client, payment.journal_entry_id);
      }

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
      res.status(error.statusCode || (isUserError ? 400 : 500)).json({
        message: isUserError || error.statusCode ? error.message : "Error cancelling payment",
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
