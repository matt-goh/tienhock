// src/routes/greentarget/payments.js
import { Router } from "express";
import {
  syncGTPaymentJournalEntry,
  cancelGTPaymentJournalEntry,
  updateGTPaymentJournalReference,
} from "./accounting/payment-journal.js";
import {
  GREEN_TARGET_ACCOUNTING_OPEN_DATE,
  assertGreenTargetAccountingDateUnlocked,
  toLocalAccountingDateString,
} from "./accounting/posting-lock.js";

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
const MAX_PAYMENT_BATCH_SIZE = 100;
const MAX_PAYMENT_REFERENCE_LENGTH = 50;
const PAYMENT_REFERENCE_LOCK_KEY =
  "greentarget_payments_internal_reference";

/**
 * @param {number} statusCode
 * @param {string} message
 * @returns {Error & { statusCode: number }}
 */
const createPaymentError = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode });

/**
 * @typedef {object} NormalizedPaymentAllocation
 * @property {number} invoiceId
 * @property {number} amountPaid
 */

/**
 * @param {unknown} value
 * @param {string} fieldLabel
 * @returns {string}
 */
const normalizePaymentReference = (value, fieldLabel) => {
  const normalizedValue = String(value ?? "").trim();
  if (normalizedValue.length > MAX_PAYMENT_REFERENCE_LENGTH) {
    throw createPaymentError(
      400,
      `${fieldLabel} cannot exceed ${MAX_PAYMENT_REFERENCE_LENGTH} characters`
    );
  }
  return normalizedValue;
};

/**
 * @param {unknown} value
 * @param {string} fieldLabel
 * @returns {number}
 */
const normalizePaymentAmount = (value, fieldLabel) => {
  const amount = Number(value);
  const amountInCents = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    amountInCents < 1 ||
    Math.abs(amount * 100 - amountInCents) > 0.0000001
  ) {
    throw createPaymentError(
      400,
      `${fieldLabel} must be at least RM0.01 and use no more than two decimal places`
    );
  }
  return amountInCents / 100;
};

/**
 * @param {number|string} value
 * @returns {number}
 */
const toPaymentCents = (value) => Math.round(Number(value) * 100);

/**
 * Accept the legacy single-invoice payload and the payment-page batch payload.
 * A batch is one received date / GT reference / method with several invoice
 * allocations, matching Green Target's legacy receipt-entry screen.
 *
 * @param {Record<string, unknown>} body
 * @returns {{ isBatchRequest: boolean, allocations: NormalizedPaymentAllocation[] }}
 */
const normalizePaymentAllocations = (body) => {
  const isBatchRequest = Array.isArray(body.allocations);
  const rawAllocations = isBatchRequest
    ? body.allocations
    : [{ invoice_id: body.invoice_id, amount_paid: body.amount_paid }];

  if (rawAllocations.length === 0) {
    throw createPaymentError(400, "Select at least one invoice to pay");
  }
  if (rawAllocations.length > MAX_PAYMENT_BATCH_SIZE) {
    throw createPaymentError(
      400,
      `A payment can cover at most ${MAX_PAYMENT_BATCH_SIZE} invoices`
    );
  }

  /** @type {Set<number>} */
  const seenInvoiceIds = new Set();
  /** @type {NormalizedPaymentAllocation[]} */
  const allocations = rawAllocations.map((rawAllocation, index) => {
    if (typeof rawAllocation !== "object" || rawAllocation === null) {
      throw createPaymentError(
        400,
        `Invoice allocation ${index + 1} is invalid`
      );
    }

    const invoiceId = Number(rawAllocation.invoice_id);
    const amountPaid = normalizePaymentAmount(
      rawAllocation.amount_paid,
      `Payment for invoice ${invoiceId || index + 1}`
    );
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      throw createPaymentError(
        400,
        `Invoice allocation ${index + 1} has an invalid invoice id`
      );
    }
    if (seenInvoiceIds.has(invoiceId)) {
      throw createPaymentError(
        400,
        `Invoice ${invoiceId} is included more than once`
      );
    }
    seenInvoiceIds.add(invoiceId);
    return { invoiceId, amountPaid };
  });

  return { isBatchRequest, allocations };
};

/**
 * A received date before the accounting cutover is allowed only when every
 * selected invoice is also historical. That payment stays operational-only
 * and cannot mutate the locked ledger. A later receipt against an older
 * invoice is a genuine organic collection and keeps the normal journal path.
 *
 * @param {Array<Record<string, unknown>>} invoices
 * @param {string} paymentDate
 * @param {string} operation
 * @returns {void}
 */
const assertPaymentMutationDateAllowed = (invoices, paymentDate, operation) => {
  const isHistoricalReceivedDate =
    paymentDate < GREEN_TARGET_ACCOUNTING_OPEN_DATE;
  const containsOnlyHistoricalInvoices = invoices.every(
    (invoice) =>
      toLocalAccountingDateString(invoice.date_issued) <
      GREEN_TARGET_ACCOUNTING_OPEN_DATE
  );
  if (!isHistoricalReceivedDate || !containsOnlyHistoricalInvoices) {
    assertGreenTargetAccountingDateUnlocked(paymentDate, operation);
  }
};

/**
 * @param {Array<Record<string, unknown>>} invoices
 * @param {string} paymentDate
 * @returns {void}
 */
const assertPaymentNotBeforeInvoices = (invoices, paymentDate) => {
  const laterInvoice = invoices.find(
    (invoice) =>
      paymentDate < toLocalAccountingDateString(invoice.date_issued)
  );
  if (laterInvoice) {
    throw createPaymentError(
      400,
      `Payment received date cannot be before invoice ${
        laterInvoice.invoice_number || laterInvoice.invoice_id
      }`
    );
  }
};

/**
 * Lock and return every active row belonging to the same user-keyed receipt
 * as the selected payment. Legacy rows without a GT reference remain single.
 *
 * @param {import("pg").PoolClient} client
 * @param {number} paymentId
 * @returns {Promise<{ status: "active"|"pending"|"cancelled", payments: Array<Record<string, unknown>> }>}
 */
const fetchPaymentGroupForUpdate = async (client, paymentId) => {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [PAYMENT_REFERENCE_LOCK_KEY]
  );
  const targetResult = await client.query(
    `SELECT payment_id, internal_reference, payment_date, payment_method,
            CASE
              WHEN status = 'pending' THEN 'pending'
              WHEN status = 'cancelled' THEN 'cancelled'
              ELSE 'active'
            END AS normalized_status
       FROM greentarget.payments
      WHERE payment_id = $1`,
    [paymentId]
  );
  if (targetResult.rows.length === 0) {
    throw createPaymentError(404, "Payment not found");
  }

  const target = targetResult.rows[0];
  const internalReference = String(target.internal_reference || "").trim();

  const paymentResult = await client.query(
    `SELECT p.*, i.customer_id, i.balance_due,
            i.status AS invoice_status,
            i.date_issued AS invoice_date_issued,
            i.invoice_number
       FROM greentarget.payments p
       JOIN greentarget.invoices i ON i.invoice_id = p.invoice_id
      WHERE (
              p.payment_id = $1
              OR (
                $2::text <> ''
                AND p.internal_reference = $2
                AND p.payment_date = $3::date
                AND p.payment_method = $4
              )
            )
        AND CASE
              WHEN p.status = 'pending' THEN 'pending'
              WHEN p.status = 'cancelled' THEN 'cancelled'
              ELSE 'active'
            END = $5
      ORDER BY p.invoice_id, p.payment_id
      FOR UPDATE OF p, i`,
    [
      paymentId,
      internalReference,
      target.payment_date,
      target.payment_method,
      target.normalized_status,
    ]
  );
  if (paymentResult.rows.length === 0) {
    throw createPaymentError(409, "Payment status changed. Refresh and try again.");
  }

  return {
    status: target.normalized_status,
    payments: paymentResult.rows,
  };
};

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

  // Create one received payment batch covering one or more invoices.
  router.post("/batch", async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      /** @type {Record<string, unknown>} */
      const body = req.body || {};
      const { allocations } = normalizePaymentAllocations(body);
      const paymentMethod = String(body.payment_method || "").trim();
      const paymentReference = normalizePaymentReference(
        body.payment_reference,
        "Cheque / transaction reference"
      );
      const internalReference = normalizePaymentReference(
        body.internal_reference,
        "Green Target reference number"
      );

      if (!body.payment_date || !paymentMethod || !internalReference) {
        throw createPaymentError(
          400,
          "Payment received date, payment method and Green Target reference number are required"
        );
      }
      if (!PAYMENT_METHODS.has(paymentMethod)) {
        throw createPaymentError(400, "Invalid payment method");
      }

      /** @type {string} */
      let paymentDate;
      try {
        paymentDate = toLocalAccountingDateString(body.payment_date);
      } catch {
        throw createPaymentError(400, "Payment received date is invalid");
      }

      // Serialize the user-keyed GT reference before taking invoice locks so
      // every payment mutation uses one consistent lock order.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [PAYMENT_REFERENCE_LOCK_KEY]
      );
      const internalReferenceCheck = await client.query(
        `SELECT payment_id
          FROM greentarget.payments
          WHERE UPPER(TRIM(internal_reference)) = UPPER($1)
          LIMIT 1`,
        [internalReference]
      );
      if (internalReferenceCheck.rows.length > 0) {
        throw createPaymentError(
          409,
          `Green Target reference number "${internalReference}" is already in use`
        );
      }

      const invoiceIds = allocations
        .map((allocation) => allocation.invoiceId)
        .sort(
          (firstInvoiceId, secondInvoiceId) =>
            firstInvoiceId - secondInvoiceId
        );
      const invoiceResult = await client.query(
        `SELECT i.*, c.customer_id
           FROM greentarget.invoices i
           JOIN greentarget.customers c ON i.customer_id = c.customer_id
          WHERE i.invoice_id = ANY($1::int[])
          ORDER BY i.invoice_id
          FOR UPDATE OF i`,
        [invoiceIds]
      );

      if (invoiceResult.rows.length !== invoiceIds.length) {
        const foundInvoiceIds = new Set(
          invoiceResult.rows.map((invoice) => Number(invoice.invoice_id))
        );
        const missingInvoiceId = invoiceIds.find(
          (invoiceId) => !foundInvoiceIds.has(invoiceId)
        );
        throw createPaymentError(
          404,
          `Invoice with ID ${missingInvoiceId} not found`
        );
      }

      assertPaymentMutationDateAllowed(
        invoiceResult.rows,
        paymentDate,
        "Payment"
      );
      assertPaymentNotBeforeInvoices(invoiceResult.rows, paymentDate);

      if (paymentReference) {
        const duplicatePaymentReference = await client.query(
          `SELECT invoice_id
             FROM greentarget.payments
            WHERE invoice_id = ANY($1::int[])
              AND payment_reference = $2
              AND (status IS NULL OR status != 'cancelled')
            LIMIT 1`,
          [invoiceIds, paymentReference]
        );
        if (duplicatePaymentReference.rows.length > 0) {
          throw createPaymentError(
            409,
            `Cheque / transaction reference "${paymentReference}" already exists for invoice ${duplicatePaymentReference.rows[0].invoice_id}`
          );
        }
      }

      const pendingPaymentResult = await client.query(
        `SELECT invoice_id
           FROM greentarget.payments
          WHERE invoice_id = ANY($1::int[])
            AND status = 'pending'
          LIMIT 1`,
        [invoiceIds]
      );
      if (pendingPaymentResult.rows.length > 0) {
        throw createPaymentError(
          409,
          `Invoice ${pendingPaymentResult.rows[0].invoice_id} already has a pending payment`
        );
      }

      /** @type {Map<number, Record<string, unknown>>} */
      const invoiceById = new Map(
        invoiceResult.rows.map((invoice) => [
          Number(invoice.invoice_id),
          invoice,
        ])
      );
      for (const allocation of allocations) {
        const invoice = invoiceById.get(allocation.invoiceId);
        const currentBalance = Number(invoice.balance_due);
        if (
          !Number.isFinite(currentBalance) ||
          currentBalance <= 0 ||
          !["active", "overdue"].includes(invoice.status)
        ) {
          throw createPaymentError(
            409,
            `Invoice ${
              invoice.invoice_number || allocation.invoiceId
            } is no longer available for payment`
          );
        }
        if (
          toPaymentCents(allocation.amountPaid) >
          toPaymentCents(currentBalance)
        ) {
          throw createPaymentError(
            409,
            `Payment for invoice ${
              invoice.invoice_number || allocation.invoiceId
            } cannot exceed its current balance of RM${currentBalance.toFixed(
              2
            )}`
          );
        }
      }

      const initialStatus =
        paymentMethod === "cheque" ? "pending" : "active";
      /** @type {Array<Record<string, unknown>>} */
      const createdPayments = [];
      /** @type {Set<number>} */
      const activeCustomerIds = new Set();

      for (const allocation of allocations) {
        const invoice = invoiceById.get(allocation.invoiceId);
        const paymentResult = await client.query(
          `INSERT INTO greentarget.payments (
             invoice_id,
             payment_date,
             amount_paid,
             payment_method,
             payment_reference,
             internal_reference,
             status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            allocation.invoiceId,
            paymentDate,
            allocation.amountPaid,
            paymentMethod,
            paymentReference || null,
            internalReference,
            initialStatus,
          ]
        );

        if (initialStatus === "active") {
          const currentBalance = Number(invoice.balance_due);
          const newBalanceDue =
            Math.max(
              0,
              toPaymentCents(currentBalance) -
                toPaymentCents(allocation.amountPaid)
            ) / 100;
          const newStatus =
            newBalanceDue === 0
              ? "paid"
              : invoice.status === "overdue"
              ? "overdue"
              : "active";
          await client.query(
            `UPDATE greentarget.invoices
                SET balance_due = $1, status = $2
              WHERE invoice_id = $3`,
            [newBalanceDue, newStatus, allocation.invoiceId]
          );
          activeCustomerIds.add(Number(invoice.customer_id));

          // A genuinely historical received date returns without posting;
          // receipts from the cutover onward create their balanced REC journal.
          await syncGTPaymentJournalEntry(
            client,
            paymentResult.rows[0],
            invoice,
            null
          );
        }

        const refreshedPaymentResult = await client.query(
          "SELECT * FROM greentarget.payments WHERE payment_id = $1",
          [paymentResult.rows[0].payment_id]
        );
        createdPayments.push(refreshedPaymentResult.rows[0]);
      }

      if (activeCustomerIds.size > 0) {
        await client.query(
          `UPDATE greentarget.customers
              SET last_activity_date = CURRENT_DATE
            WHERE customer_id = ANY($1::int[])`,
          [Array.from(activeCustomerIds)]
        );
      }

      await client.query("COMMIT");
      res.status(201).json({
        message:
          initialStatus === "pending"
            ? "Payment batch created successfully (pending confirmation)"
            : "Payment batch created successfully",
        payments: createdPayments,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating Green Target payment batch:", error);
      const statusCode = Number(error?.statusCode) || 500;
      res.status(statusCode).json({
        message:
          statusCode < 500 ? error.message : "Error creating payment batch",
        error: error.message,
      });
    } finally {
      client.release();
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
    } = req.body || {};

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if required fields are provided
      if (
        !invoice_id ||
        !payment_date ||
        amount_paid === undefined ||
        amount_paid === null ||
        !payment_method ||
        !internal_reference
      ) {
        throw createPaymentError(
          400,
          "Missing required fields: invoice_id, payment_date, amount_paid, payment_method, internal_reference"
        );
      }

      const paymentAmount = normalizePaymentAmount(
        amount_paid,
        "Payment amount"
      );
      const normalizedPaymentReference = normalizePaymentReference(
        payment_reference,
        "Cheque / transaction reference"
      );
      const normalizedInternalReference = normalizePaymentReference(
        internal_reference,
        "Green Target reference number"
      );
      if (!normalizedInternalReference) {
        throw createPaymentError(
          400,
          "Green Target reference number is required"
        );
      }
      /** @type {string} */
      let normalizedPaymentDate;
      try {
        normalizedPaymentDate = toLocalAccountingDateString(payment_date);
      } catch {
        throw createPaymentError(400, "Payment received date is invalid");
      }
      if (!PAYMENT_METHODS.has(payment_method)) {
        throw createPaymentError(400, "Invalid payment method");
      }

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [PAYMENT_REFERENCE_LOCK_KEY]
      );
      const internalReferenceCheck = await client.query(
        `SELECT payment_id
          FROM greentarget.payments
          WHERE UPPER(TRIM(internal_reference)) = UPPER($1)
          LIMIT 1`,
        [normalizedInternalReference]
      );
      if (internalReferenceCheck.rows.length > 0) {
        throw createPaymentError(
          409,
          `Green Target reference number "${normalizedInternalReference}" is already in use. Refresh and try again.`
        );
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
      assertPaymentMutationDateAllowed(
        [invoice],
        normalizedPaymentDate,
        "Payment"
      );
      assertPaymentNotBeforeInvoices([invoice], normalizedPaymentDate);
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
      if (toPaymentCents(paymentAmount) > toPaymentCents(currentBalance)) {
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
        normalizedPaymentDate,
        paymentAmount,
        payment_method,
        normalizedPaymentReference || null,
        normalizedInternalReference || null,
        initialStatus,
      ]);

      // Only update invoice balance if payment is active (not pending)
      if (initialStatus === "active") {
        const newBalanceDue =
          Math.max(
            0,
            toPaymentCents(currentBalance) - toPaymentCents(paymentAmount)
          ) / 100;
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

      // A genuinely historical received date returns without posting;
      // receipts from the cutover onward create their balanced REC journal.
      if (initialStatus === "active") {
        await syncGTPaymentJournalEntry(
          client,
          paymentResult.rows[0],
          invoice,
          null
        );
      }

      const refreshedPaymentResult = await client.query(
        "SELECT * FROM greentarget.payments WHERE payment_id = $1",
        [paymentResult.rows[0].payment_id]
      );
      await client.query("COMMIT");

      res.status(201).json({
        message:
          initialStatus === "pending"
            ? "Payment created successfully (pending confirmation)"
            : "Payment created successfully",
        payment: refreshedPaymentResult.rows[0],
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
    const { exclude_payment_id } = req.query;

    try {
      const internalReference = normalizePaymentReference(
        decodeURIComponent(req.params.ref),
        "Green Target reference number"
      );
      if (!internalReference) {
        throw createPaymentError(
          400,
          "Green Target reference number is required"
        );
      }
      let query = `
        SELECT payment_id 
        FROM greentarget.payments 
        WHERE UPPER(TRIM(internal_reference)) = UPPER($1)
      `;
      const params = [internalReference];

      if (exclude_payment_id) {
        const excludedPaymentId = Number(exclude_payment_id);
        if (!Number.isInteger(excludedPaymentId) || excludedPaymentId <= 0) {
          throw createPaymentError(400, "Invalid excluded payment id");
        }
        const excludedGroupResult = await pool.query(
          `SELECT grouped.payment_id
             FROM greentarget.payments selected
             JOIN greentarget.payments grouped
               ON grouped.payment_id = selected.payment_id
               OR (
                 COALESCE(TRIM(selected.internal_reference), '') <> ''
                 AND grouped.internal_reference = selected.internal_reference
                 AND grouped.payment_date = selected.payment_date
                 AND grouped.payment_method = selected.payment_method
                 AND CASE
                       WHEN grouped.status = 'pending' THEN 'pending'
                       WHEN grouped.status = 'cancelled' THEN 'cancelled'
                       ELSE 'active'
                     END = CASE
                       WHEN selected.status = 'pending' THEN 'pending'
                       WHEN selected.status = 'cancelled' THEN 'cancelled'
                       ELSE 'active'
                     END
               )
            WHERE selected.payment_id = $1`,
          [excludedPaymentId]
        );
        const excludedPaymentIds = excludedGroupResult.rows.map((payment) =>
          Number(payment.payment_id)
        );
        query += " AND NOT (payment_id = ANY($2::int[]))";
        params.push(
          excludedPaymentIds.length > 0
            ? excludedPaymentIds
            : [excludedPaymentId]
        );
      }

      const result = await pool.query(query, params);

      res.json({
        available: result.rows.length === 0,
        exists: result.rows.length > 0,
        existing_id: result.rows.length > 0 ? result.rows[0].payment_id : null,
      });
    } catch (error) {
      console.error("Error checking Green Target reference:", error);
      const statusCode = Number(error?.statusCode) || 500;
      res.status(statusCode).json({
        message:
          statusCode < 500
            ? error.message
            : "Error checking Green Target reference",
        error: error.message,
      });
    }
  });

  // Update receipt reference fields across every allocation in the receipt.
  router.put("/:payment_id", async (req, res) => {
    const paymentId = Number(req.params.payment_id);
    const { internal_reference, payment_reference } = req.body || {};
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        throw createPaymentError(400, "Invalid payment id");
      }
      if (
        internal_reference === undefined &&
        payment_reference === undefined
      ) {
        throw createPaymentError(400, "No updatable fields provided");
      }

      const paymentGroup = await fetchPaymentGroupForUpdate(client, paymentId);
      if (paymentGroup.status === "cancelled") {
        throw createPaymentError(409, "A cancelled receipt cannot be edited");
      }

      const normalizedInternalReference =
        internal_reference === undefined
          ? null
          : normalizePaymentReference(
              internal_reference,
              "Green Target reference number"
            );
      if (
        internal_reference !== undefined &&
        !normalizedInternalReference
      ) {
        throw createPaymentError(
          400,
          "Green Target reference number is required"
        );
      }
      const normalizedPaymentReference =
        payment_reference === undefined
          ? null
          : normalizePaymentReference(
              payment_reference,
              "Cheque / transaction reference"
            );
      const paymentIds = paymentGroup.payments.map((payment) =>
        Number(payment.payment_id)
      );
      const invoiceIds = paymentGroup.payments.map((payment) =>
        Number(payment.invoice_id)
      );

      if (normalizedInternalReference !== null) {
        const duplicateResult = await client.query(
          `SELECT payment_id
             FROM greentarget.payments
            WHERE UPPER(TRIM(internal_reference)) = UPPER($1)
              AND NOT (payment_id = ANY($2::int[]))
            LIMIT 1`,
          [normalizedInternalReference, paymentIds]
        );
        if (duplicateResult.rows.length > 0) {
          throw createPaymentError(
            409,
            `Green Target reference number "${normalizedInternalReference}" is already in use`
          );
        }
      }
      if (normalizedPaymentReference) {
        const duplicatePaymentReference = await client.query(
          `SELECT invoice_id
             FROM greentarget.payments
            WHERE invoice_id = ANY($1::int[])
              AND payment_reference = $2
              AND NOT (payment_id = ANY($3::int[]))
              AND (status IS NULL OR status != 'cancelled')
            LIMIT 1`,
          [invoiceIds, normalizedPaymentReference, paymentIds]
        );
        if (duplicatePaymentReference.rows.length > 0) {
          throw createPaymentError(
            409,
            `Cheque / transaction reference "${normalizedPaymentReference}" already exists for invoice ${duplicatePaymentReference.rows[0].invoice_id}`
          );
        }
      }

      const updateResult = await client.query(
        `UPDATE greentarget.payments
            SET internal_reference = CASE WHEN $1::boolean THEN $2 ELSE internal_reference END,
                payment_reference = CASE WHEN $3::boolean THEN $4 ELSE payment_reference END
          WHERE payment_id = ANY($5::int[])
          RETURNING *`,
        [
          internal_reference !== undefined,
          normalizedInternalReference,
          payment_reference !== undefined,
          normalizedPaymentReference || null,
          paymentIds,
        ]
      );

      for (const updatedPayment of updateResult.rows) {
        if (!updatedPayment.journal_entry_id) {
          continue;
        }
        const originalPayment = paymentGroup.payments.find(
          (payment) =>
            Number(payment.payment_id) === Number(updatedPayment.payment_id)
        );
        if (!originalPayment) {
          throw new Error("Updated payment is missing from its receipt group");
        }
        await updateGTPaymentJournalReference(
          client,
          updatedPayment,
          {
            customer_id: originalPayment.customer_id,
            invoice_number: originalPayment.invoice_number,
            date_issued: originalPayment.invoice_date_issued,
          }
        );
      }

      await client.query("COMMIT");
      const selectedPayment = updateResult.rows.find(
        (payment) => Number(payment.payment_id) === paymentId
      );

      res.json({
        message:
          updateResult.rows.length > 1
            ? "Receipt references updated successfully"
            : "Payment references updated successfully",
        payment: selectedPayment,
        payments: updateResult.rows,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating Green Target receipt:", error);
      const statusCode = Number(error?.statusCode) || 500;
      res.status(statusCode).json({
        message:
          statusCode < 500 ? error.message : "Error updating payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Confirm every allocation in one pending cheque receipt.
  router.put("/:payment_id/confirm", async (req, res) => {
    const paymentId = Number(req.params.payment_id);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        throw createPaymentError(400, "Invalid payment id");
      }

      const paymentGroup = await fetchPaymentGroupForUpdate(client, paymentId);
      if (paymentGroup.status !== "pending") {
        throw createPaymentError(409, "Payment is not pending confirmation");
      }

      assertPaymentMutationDateAllowed(
        paymentGroup.payments.map((payment) => ({
          date_issued: payment.invoice_date_issued,
        })),
        toLocalAccountingDateString(paymentGroup.payments[0].payment_date),
        "Payment confirmation"
      );

      /** @type {Map<number, { balanceCents: number, status: string, customerId: number }> } */
      const invoiceBalances = new Map();
      for (const payment of paymentGroup.payments) {
        const invoiceId = Number(payment.invoice_id);
        let invoiceBalance = invoiceBalances.get(invoiceId);
        if (!invoiceBalance) {
          const currentBalance = Number(payment.balance_due);
          if (
            !Number.isFinite(currentBalance) ||
            currentBalance <= 0 ||
            !["active", "overdue"].includes(payment.invoice_status)
          ) {
            throw createPaymentError(
              409,
              `Invoice ${payment.invoice_number || invoiceId} is no longer available for payment`
            );
          }
          invoiceBalance = {
            balanceCents: toPaymentCents(currentBalance),
            status: payment.invoice_status,
            customerId: Number(payment.customer_id),
          };
          invoiceBalances.set(invoiceId, invoiceBalance);
        }

        const paymentAmount = normalizePaymentAmount(
          payment.amount_paid,
          `Payment for invoice ${payment.invoice_number || invoiceId}`
        );
        invoiceBalance.balanceCents -= toPaymentCents(paymentAmount);
        if (invoiceBalance.balanceCents < 0) {
          throw createPaymentError(
            409,
            `Pending receipt exceeds the current balance of invoice ${
              payment.invoice_number || invoiceId
            }`
          );
        }
      }

      const paymentIds = paymentGroup.payments.map((payment) =>
        Number(payment.payment_id)
      );
      const updatedPaymentResult = await client.query(
        `UPDATE greentarget.payments
            SET status = 'active'
          WHERE payment_id = ANY($1::int[])
          RETURNING *`,
        [paymentIds]
      );

      for (const [invoiceId, invoiceBalance] of invoiceBalances) {
        const newStatus =
          invoiceBalance.balanceCents === 0
            ? "paid"
            : invoiceBalance.status === "overdue"
            ? "overdue"
            : "active";
        await client.query(
          `UPDATE greentarget.invoices
              SET balance_due = $1, status = $2
            WHERE invoice_id = $3`,
          [invoiceBalance.balanceCents / 100, newStatus, invoiceId]
        );
      }

      const updatedPaymentById = new Map(
        updatedPaymentResult.rows.map((payment) => [
          Number(payment.payment_id),
          payment,
        ])
      );
      const paymentsInCreationOrder = [...paymentGroup.payments].sort(
        (firstPayment, secondPayment) =>
          Number(firstPayment.payment_id) - Number(secondPayment.payment_id)
      );
      for (const originalPayment of paymentsInCreationOrder) {
        const updatedPayment = updatedPaymentById.get(
          Number(originalPayment.payment_id)
        );
        if (!updatedPayment) {
          throw new Error("Receipt confirmation missed a payment allocation");
        }
        await syncGTPaymentJournalEntry(
          client,
          updatedPayment,
          {
            customer_id: originalPayment.customer_id,
            invoice_number: originalPayment.invoice_number,
            date_issued: originalPayment.invoice_date_issued,
          },
          null
        );
      }

      const customerIds = Array.from(invoiceBalances.values()).map(
        (invoiceBalance) => invoiceBalance.customerId
      );
      await client.query(
        `UPDATE greentarget.customers
            SET last_activity_date = CURRENT_DATE
          WHERE customer_id = ANY($1::int[])`,
        [customerIds]
      );

      const refreshedPayments = await client.query(
        `SELECT * FROM greentarget.payments
          WHERE payment_id = ANY($1::int[])
          ORDER BY payment_id`,
        [paymentIds]
      );

      await client.query("COMMIT");

      const selectedPayment = refreshedPayments.rows.find(
        (payment) => Number(payment.payment_id) === paymentId
      );

      res.json({
        message:
          refreshedPayments.rows.length > 1
            ? "Receipt confirmed successfully"
            : "Payment confirmed successfully",
        payment: selectedPayment,
        payments: refreshedPayments.rows,
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
    const paymentId = Number(req.params.payment_id);
    const { reason } = req.body || {}; // Optional cancellation reason
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        throw createPaymentError(400, "Invalid payment id");
      }

      const paymentGroup = await fetchPaymentGroupForUpdate(client, paymentId);
      if (paymentGroup.status === "cancelled") {
        throw createPaymentError(409, "Payment is already cancelled");
      }

      /** @type {Map<number, { balanceCents: number, status: string }> } */
      const invoiceBalances = new Map();
      for (const payment of paymentGroup.payments) {
        if (paymentGroup.status === "active") {
          if (payment.invoice_status === "cancelled") {
            throw createPaymentError(
              400,
              `Cannot cancel payment for cancelled invoice ${
                payment.invoice_number || payment.invoice_id
              }`
            );
          }
          const existingAdjustment = await fetchActiveAdjustmentForInvoice(
            client,
            payment.invoice_id
          );
          if (existingAdjustment) {
            throw createPaymentError(
              400,
              `Cannot cancel this receipt because invoice ${
                payment.invoice_number || payment.invoice_id
              } has active adjustment document ${existingAdjustment.id}. Cancel the adjustment document first.`
            );
          }
        }

        if (payment.journal_entry_id) {
          assertGreenTargetAccountingDateUnlocked(
            payment.payment_date,
            "Payment cancellation"
          );
          await cancelGTPaymentJournalEntry(
            client,
            Number(payment.journal_entry_id)
          );
        } else {
          assertPaymentMutationDateAllowed(
            [{ date_issued: payment.invoice_date_issued }],
            toLocalAccountingDateString(payment.payment_date),
            "Payment cancellation"
          );
        }

        if (paymentGroup.status === "active") {
          const invoiceId = Number(payment.invoice_id);
          let invoiceBalance = invoiceBalances.get(invoiceId);
          if (!invoiceBalance) {
            const currentBalance = Number(payment.balance_due);
            if (!Number.isFinite(currentBalance)) {
              throw createPaymentError(
                409,
                `Invoice ${payment.invoice_number || invoiceId} has an invalid balance`
              );
            }
            invoiceBalance = {
              balanceCents: toPaymentCents(currentBalance),
              status: payment.invoice_status,
            };
            invoiceBalances.set(invoiceId, invoiceBalance);
          }
          const paymentAmount = normalizePaymentAmount(
            payment.amount_paid,
            `Payment for invoice ${payment.invoice_number || invoiceId}`
          );
          invoiceBalance.balanceCents += toPaymentCents(paymentAmount);
        }
      }

      const paymentIds = paymentGroup.payments.map((payment) =>
        Number(payment.payment_id)
      );
      const updateResult = await client.query(
        `UPDATE greentarget.payments
            SET status = 'cancelled',
                cancellation_date = CURRENT_TIMESTAMP,
                cancellation_reason = $1
          WHERE payment_id = ANY($2::int[])
          RETURNING *`,
        [reason || null, paymentIds]
      );

      for (const [invoiceId, invoiceBalance] of invoiceBalances) {
        const newStatus =
          invoiceBalance.balanceCents > 0
            ? invoiceBalance.status === "overdue"
              ? "overdue"
              : "active"
            : "paid";
        await client.query(
          `UPDATE greentarget.invoices
              SET balance_due = $1, status = $2
            WHERE invoice_id = $3`,
          [invoiceBalance.balanceCents / 100, newStatus, invoiceId]
        );
      }

      await client.query("COMMIT");

      const selectedPayment = updateResult.rows.find(
        (payment) => Number(payment.payment_id) === paymentId
      );

      res.json({
        message:
          updateResult.rows.length > 1
            ? "Receipt cancelled successfully"
            : "Payment cancelled successfully",
        payment: selectedPayment,
        payments: updateResult.rows,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling payment:", error);
      const statusCode = Number(error?.statusCode) || 500;
      res.status(statusCode).json({
        message:
          statusCode < 500 ? error.message : "Error cancelling payment",
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
