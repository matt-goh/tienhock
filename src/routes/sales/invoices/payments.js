// src/routes/sales/invoices/payments.js
import { Router } from "express";
import {
  createPaymentJournalEntry,
  createOverpaidJournalEntry,
  cancelPaymentJournalEntry,
} from "../../accounting/payment-journal.js";
import { determineBankAccount } from "../../../utils/payment-helpers.js";

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

export default function (pool) {
  const router = Router();

  // --- GET /api/payments (Get Payments) ---
  router.get("/", async (req, res) => {
    const { invoice_id, include_cancelled } = req.query; // Add new parameter

    try {
      let query = `
        SELECT
          p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
          p.payment_method, p.payment_reference, p.internal_reference,
          p.bank_account, p.journal_entry_id,
          p.notes, p.created_at, p.status, p.cancellation_date,
          je.reference_no as journal_reference_no
        FROM payments p
        LEFT JOIN journal_entries je ON p.journal_entry_id = je.id
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

  // --- GET /api/payments/all (Get All Payments with filters) ---
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
        p.payment_method, p.payment_reference, p.internal_reference,
        p.bank_account, p.journal_entry_id,
        p.notes, p.created_at, p.status, p.cancellation_date,
        i.customerid, i.salespersonid, c.name as customer_name,
        je.reference_no as journal_reference_no
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN customers c ON i.customerid = c.id
      LEFT JOIN journal_entries je ON p.journal_entry_id = je.id
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
        const searchParam = `$${paramCounter++}`;
        query += ` AND (
        p.invoice_id ILIKE ${searchParam} OR
        p.payment_reference ILIKE ${searchParam} OR
        CAST(p.amount_paid AS TEXT) ILIKE ${searchParam} OR
        c.name ILIKE ${searchParam}
      )`;
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

  // --- GET /api/payments/by-reference/:reference (Get payments by reference) ---
  router.get("/by-reference/:reference", async (req, res) => {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ message: "Payment reference is required" });
    }

    try {
      const query = `
        SELECT
          p.payment_id,
          p.invoice_id,
          p.amount_paid,
          c.name as customer_name
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        LEFT JOIN customers c ON i.customerid = c.id
        WHERE p.payment_reference = $1
          AND (p.status IS NULL OR p.status != 'cancelled')
        ORDER BY i.createddate DESC
      `;
      const result = await pool.query(query, [reference]);

      const payments = result.rows.map((p) => ({
        ...p,
        amount_paid: parseFloat(p.amount_paid || 0),
      }));

      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments by reference:", error);
      res.status(500).json({
        message: "Error fetching payments by reference",
        error: error.message,
      });
    }
  });

  // --- POST /api/payments (Create Payment) ---
  router.post("/", async (req, res) => {
    const {
      invoice_id,
      payment_date,
      amount_paid,
      payment_method,
      payment_reference,
      bank_account,
      notes,
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
        `SELECT payment_id FROM payments 
         WHERE invoice_id = $1 AND payment_reference = $2 
         AND (status IS NULL OR status != 'cancelled')`,
        [invoice_id, payment_reference.trim()]
      );
      
      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          message: `Payment reference "${payment_reference}" already exists for this invoice. Please use a unique reference.`,
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get Invoice details & Lock the row
      const invoiceQuery = `
      SELECT id, customerid, paymenttype, totalamountpayable, balance_due, invoice_status
      FROM invoices
      WHERE id = $1 FOR UPDATE
    `;
      const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice ${invoice_id} not found.`);
      }
      const invoice = invoiceResult.rows[0];
      const currentBalance = parseFloat(invoice.balance_due || 0);
      const paymentAmount = parseFloat(amount_paid);

      // 2. Check invoice status
      if (invoice.invoice_status === "cancelled") {
        throw new Error(
          `Invoice ${invoice_id} is cancelled and cannot receive payments.`
        );
      }

      // 3. Determine if this is an overpayment
      const isOverpayment = paymentAmount > currentBalance;
      const regularAmount = isOverpayment ? currentBalance : paymentAmount;
      const overpaidAmount = isOverpayment ? paymentAmount - currentBalance : 0;

      const createdPayments = [];

      // 4. Create the regular payment (up to balance due)
      if (regularAmount > 0) {
        const initialStatus =
          payment_method === "cheque" ? "pending" : "active";

        // Determine bank account (cash payments go to CASH, others to selected bank)
        const bankAccountCode = determineBankAccount(payment_method, bank_account);

        const insertPaymentQuery = `
        INSERT INTO payments (
          invoice_id, payment_date, amount_paid, payment_method,
          payment_reference, bank_account, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

        const paymentValues = [
          invoice_id,
          payment_date,
          regularAmount,
          payment_method,
          payment_reference || null,
          bankAccountCode,
          notes || null,
          initialStatus,
        ];
        const paymentResult = await client.query(
          insertPaymentQuery,
          paymentValues
        );
        const createdPayment = paymentResult.rows[0];

        // Create journal entry for active payments (not for pending cheques)
        if (initialStatus === "active") {
          const journalEntryId = await createPaymentJournalEntry(client, {
            payment_id: createdPayment.payment_id,
            invoice_id: invoice_id,
            payment_date: payment_date,
            amount_paid: regularAmount,
            payment_method: payment_method,
            bank_account: bankAccountCode,
            payment_reference: payment_reference,
            created_by: req.user?.id || null
          });

          // Update payment with journal_entry_id
          await client.query(
            'UPDATE payments SET journal_entry_id = $1 WHERE payment_id = $2',
            [journalEntryId, createdPayment.payment_id]
          );

          createdPayment.journal_entry_id = journalEntryId;
        }

        createdPayments.push(createdPayment);

        // Update invoice balance and status only for active payments
        if (initialStatus === "active") {
          const newBalance = Math.max(0, currentBalance - regularAmount);
          const finalNewBalance = parseFloat(newBalance.toFixed(2));

          let newStatus;
          if (finalNewBalance <= 0) {
            newStatus = "paid";
          } else {
            if (invoice.invoice_status === "Overdue") {
              newStatus = "Overdue";
            } else {
              newStatus = "Unpaid";
            }
          }

          const updateInvoiceQuery = `
          UPDATE invoices
          SET balance_due = $1, invoice_status = $2
          WHERE id = $3
        `;
          await client.query(updateInvoiceQuery, [
            finalNewBalance,
            newStatus,
            invoice_id,
          ]);

          // Update Customer Credit if it was an INVOICE payment
          if (invoice.paymenttype === "INVOICE") {
            await updateCustomerCredit(
              client,
              invoice.customerid,
              -regularAmount
            );
          }
        }
      }

      // 5. Create overpaid payment record if there's excess
      if (overpaidAmount > 0) {
        const overpaidStatus =
          payment_method === "cheque" ? "pending" : "overpaid";

        // Use same bank account as regular payment
        const bankAccountCode = determineBankAccount(payment_method, bank_account);

        const insertOverpaidQuery = `
        INSERT INTO payments (
          invoice_id, payment_date, amount_paid, payment_method,
          payment_reference, bank_account, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

        const overpaidValues = [
          invoice_id,
          payment_date,
          overpaidAmount,
          payment_method,
          payment_reference || null,
          bankAccountCode,
          (notes || "") + (notes ? " - " : "") + "Overpaid amount",
          overpaidStatus,
        ];
        const overpaidResult = await client.query(
          insertOverpaidQuery,
          overpaidValues
        );
        const overpaidPayment = overpaidResult.rows[0];

        // Create journal entry for overpaid payments (not for pending cheques)
        if (overpaidStatus === "overpaid") {
          const overpaidJournalId = await createOverpaidJournalEntry(client, {
            payment_id: overpaidPayment.payment_id,
            invoice_id: invoice_id,
            payment_date: payment_date,
            amount_paid: overpaidAmount,
            payment_method: payment_method,
            bank_account: bankAccountCode,
            payment_reference: payment_reference,
            created_by: req.user?.id || null
          });

          // Update payment with journal_entry_id
          await client.query(
            'UPDATE payments SET journal_entry_id = $1 WHERE payment_id = $2',
            [overpaidJournalId, overpaidPayment.payment_id]
          );

          overpaidPayment.journal_entry_id = overpaidJournalId;
        }

        createdPayments.push(overpaidPayment);
      }

      await client.query("COMMIT");

      // Format response
      const formattedPayments = createdPayments.map((payment) => ({
        ...payment,
        amount_paid: parseFloat(payment.amount_paid || 0),
      }));

      res.status(201).json({
        message: isOverpayment
          ? "Payment created successfully. Overpaid amount recorded separately."
          : "Payment created successfully",
        payments: formattedPayments,
        isOverpayment,
        regularAmount: regularAmount,
        overpaidAmount: overpaidAmount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating payment:", error);
      res
        .status(500)
        .json({ message: "Error creating payment", error: error.message });
    } finally {
      client.release();
    }
  });

  // --- PUT /api/payments/:payment_id/confirm - Mark pending payment as paid ---
  router.put("/:payment_id/confirm", async (req, res) => {
    const { payment_id } = req.params;
    const { bank_account } = req.body; // Accept bank_account from request body
    const paymentIdNum = parseInt(payment_id);

    if (isNaN(paymentIdNum)) {
      return res.status(400).json({ message: "Invalid payment ID." });
    }

    // Validate bank_account if provided
    if (bank_account && !['CASH', 'BANK_PBB', 'BANK_ABB'].includes(bank_account)) {
      return res.status(400).json({ message: "Invalid bank account. Must be one of: CASH, BANK_PBB, BANK_ABB" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get the initial payment to find its reference
      const initialPaymentQuery = `SELECT payment_reference FROM payments WHERE payment_id = $1 AND status = 'pending'`;
      const initialPaymentResult = await client.query(initialPaymentQuery, [
        paymentIdNum,
      ]);

      if (initialPaymentResult.rows.length === 0) {
        // Check if it was already confirmed to provide a better message
        const alreadyConfirmedCheck = await client.query(
          "SELECT payment_reference FROM payments WHERE payment_id = $1 AND (status = 'active' OR status = 'overpaid')",
          [paymentIdNum]
        );
        if (alreadyConfirmedCheck.rows.length > 0) {
          throw new Error(
            `Payment ${paymentIdNum} has already been confirmed.`
          );
        }
        throw new Error(
          `Payment ${paymentIdNum} not found or not in pending status.`
        );
      }
      const { payment_reference } = initialPaymentResult.rows[0];

      let paymentsToConfirm = [];

      // 2. Find all payments to confirm (single or batch)
      if (payment_reference) {
        // Batch confirmation
        const batchPaymentQuery = `
        SELECT p.*, i.customerid, i.paymenttype, i.invoice_status, i.balance_due
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE p.payment_reference = $1 AND p.status = 'pending'
        FOR UPDATE OF i, p -- Lock both associated invoice and payment rows
      `;
        const batchResult = await client.query(batchPaymentQuery, [
          payment_reference,
        ]);
        paymentsToConfirm = batchResult.rows;
      } else {
        // Single confirmation
        const singlePaymentQuery = `
        SELECT p.*, i.customerid, i.paymenttype, i.invoice_status, i.balance_due
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE p.payment_id = $1 AND p.status = 'pending'
        FOR UPDATE OF i, p
      `;
        const singleResult = await client.query(singlePaymentQuery, [
          paymentIdNum,
        ]);
        paymentsToConfirm = singleResult.rows;
      }

      if (paymentsToConfirm.length === 0) {
        throw new Error(`No pending payments found to confirm.`);
      }

      const confirmedPayments = [];

      // 3. Process each payment
      for (const payment of paymentsToConfirm) {
        const {
          payment_id: currentPaymentId,
          invoice_id,
          amount_paid,
          customerid,
          paymenttype,
          invoice_status,
          notes,
        } = payment;
        const paidAmount = parseFloat(amount_paid || 0);

        if (invoice_status === "cancelled") {
          console.warn(
            `Skipping confirmation for payment ${currentPaymentId} as its invoice ${invoice_id} is cancelled.`
          );
          continue;
        }

        // 4. Determine the appropriate status for this payment
        // Check if this is an overpaid payment by looking at the notes
        const isOverpaidPayment = notes && notes.includes("Overpaid amount");
        const newStatus = isOverpaidPayment ? "overpaid" : "active";

        // 5. Update payment status and bank_account
        const updatePaymentQuery = `
        UPDATE payments
        SET status = $1, bank_account = COALESCE($2, bank_account, 'BANK_PBB')
        WHERE payment_id = $3
        RETURNING *
      `;
        const updateResult = await client.query(updatePaymentQuery, [
          newStatus,
          bank_account || null, // Use provided bank_account or fall back to existing or default
          currentPaymentId,
        ]);
        const confirmedPaymentData = updateResult.rows[0];

        // 5a. Create journal entry for confirmed payments (cheques that were pending)
        if (newStatus === "active" && !confirmedPaymentData.journal_entry_id) {
          const journalEntryId = await createPaymentJournalEntry(client, {
            payment_id: confirmedPaymentData.payment_id,
            invoice_id: invoice_id,
            payment_date: confirmedPaymentData.payment_date,
            amount_paid: paidAmount,
            payment_method: confirmedPaymentData.payment_method,
            bank_account: confirmedPaymentData.bank_account || 'BANK_PBB',
            payment_reference: confirmedPaymentData.payment_reference,
            created_by: req.user?.id || null
          });

          // Update payment with journal_entry_id
          await client.query(
            'UPDATE payments SET journal_entry_id = $1 WHERE payment_id = $2',
            [journalEntryId, confirmedPaymentData.payment_id]
          );

          confirmedPaymentData.journal_entry_id = journalEntryId;
        }

        // 5b. Create journal entry for confirmed overpaid payments
        if (newStatus === "overpaid" && !confirmedPaymentData.journal_entry_id) {
          const journalEntryId = await createOverpaidJournalEntry(client, {
            payment_id: confirmedPaymentData.payment_id,
            invoice_id: invoice_id,
            payment_date: confirmedPaymentData.payment_date,
            amount_paid: paidAmount,
            payment_method: confirmedPaymentData.payment_method,
            bank_account: confirmedPaymentData.bank_account || 'BANK_PBB',
            payment_reference: confirmedPaymentData.payment_reference,
            created_by: req.user?.id || null
          });

          // Update payment with journal_entry_id
          await client.query(
            'UPDATE payments SET journal_entry_id = $1 WHERE payment_id = $2',
            [journalEntryId, confirmedPaymentData.payment_id]
          );

          confirmedPaymentData.journal_entry_id = journalEntryId;
        }

        // 6. Update Invoice balance and status (only for non-overpaid payments)
        if (newStatus === "active") {
          const currentBalance = parseFloat(payment.balance_due || 0);
          const newBalance = Math.max(0, currentBalance - paidAmount);
          const finalNewBalance = parseFloat(newBalance.toFixed(2));

          let invoiceNewStatus;
          if (finalNewBalance <= 0) {
            invoiceNewStatus = "paid";
          } else {
            invoiceNewStatus =
              invoice_status === "Overdue" ? "Overdue" : "Unpaid";
          }

          const updateInvoiceQuery = `
          UPDATE invoices
          SET balance_due = $1, invoice_status = $2
          WHERE id = $3
        `;
          await client.query(updateInvoiceQuery, [
            finalNewBalance,
            invoiceNewStatus,
            invoice_id,
          ]);

          // 7. Update Customer Credit if it was an INVOICE payment (only for active payments)
          if (paymenttype === "INVOICE") {
            await updateCustomerCredit(
              client,
              customerid,
              -paidAmount // Reduce credit used
            );
          }
        }

        confirmedPayments.push({
          ...confirmedPaymentData,
          amount_paid: parseFloat(confirmedPaymentData.amount_paid || 0),
        });
      }

      await client.query("COMMIT");

      const regularPayments = confirmedPayments.filter(
        (p) => p.status === "active"
      );
      const overpaidPayments = confirmedPayments.filter(
        (p) => p.status === "overpaid"
      );

      let message;
      if (overpaidPayments.length > 0 && regularPayments.length > 0) {
        message = `${regularPayments.length} payment(s) confirmed as active, ${overpaidPayments.length} payment(s) confirmed as overpaid.`;
      } else if (overpaidPayments.length > 0) {
        message = `${overpaidPayments.length} overpaid payment(s) confirmed.`;
      } else {
        message =
          confirmedPayments.length > 1
            ? `${confirmedPayments.length} payments confirmed successfully.`
            : "Payment confirmed successfully.";
      }

      res.json({
        message,
        payments: confirmedPayments,
        hasOverpaidPayments: overpaidPayments.length > 0,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error confirming payment(s):", error);
      res
        .status(500)
        .json({ message: "Error confirming payment(s)", error: error.message });
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
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE p.payment_id = $1 
          AND (p.status IS NULL OR p.status = 'active' OR p.status = 'pending' OR p.status = 'overpaid')
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

      // 2. Update payment status to cancelled
      const updateQuery = `
        UPDATE payments
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

      // 2a. Cancel the associated journal entry if it exists
      if (cancelledPayment.journal_entry_id) {
        await cancelPaymentJournalEntry(client, cancelledPayment.journal_entry_id);
      }

      // 3. Update Invoice balance and status (only for active payments)
      // Pending payments never affected the balance, so don't adjust it when cancelling
      if (payment.status === "active" || payment.status === null) {
        // Get current balance *after* locking
        const currentInvoiceState = await client.query(
          "SELECT balance_due, invoice_status FROM invoices WHERE id = $1",
          [invoice_id]
        );
        const currentBalance = parseFloat(
          currentInvoiceState.rows[0].balance_due || 0
        );
        const currentStatus = currentInvoiceState.rows[0].invoice_status;

        const newBalance = currentBalance + paidAmount;
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
          UPDATE invoices SET balance_due = $1, invoice_status = $2
          WHERE id = $3
        `;
        await client.query(updateInvoiceQuery, [
          finalNewBalance,
          newStatus,
          invoice_id,
        ]);

        // 4. Update Customer Credit if it was an INVOICE payment (only for active payments)
        if (paymenttype === "INVOICE") {
          await updateCustomerCredit(client, customerid, paidAmount); // Add back the amount to credit used
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
