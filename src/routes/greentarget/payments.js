// src/routes/greentarget/payments.js
import { Router } from "express";
import {
  cancelGTReceiptJournalEntry,
  syncGTReceiptJournalEntry,
  updateGTReceiptJournalReference,
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
 * selected invoice is also historical. Those imported operational receipts
 * remain non-posting; ERP receipts from July onward own one consolidated REC
 * journal through their durable receipt header.
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
 * A July-or-later invoice must already have its posted sales journal before
 * money can be received against it. Older imported invoices are deliberately
 * exempt: their sales side lives in the locked IMP history, while a genuine
 * July receipt still needs to post normally.
 *
 * A posted S journal qualifies when it is the invoice backlink (including an
 * adopted manual S journal) or, while the backlink is empty, is source-owned
 * by that invoice. This check never creates, restores or relinks a journal.
 *
 * @param {import("pg").PoolClient} client
 * @param {Array<Record<string, unknown>>} invoices
 * @returns {Promise<void>}
 */
const assertPostCutoverInvoicesHavePostedSalesJournals = async (
  client,
  invoices
) => {
  const postCutoverInvoiceIds = [
    ...new Set(
      invoices
        .filter(
          (invoice) =>
            toLocalAccountingDateString(invoice.date_issued) >=
            GREEN_TARGET_ACCOUNTING_OPEN_DATE
        )
        .map((invoice) => Number(invoice.invoice_id))
    ),
  ];
  if (postCutoverInvoiceIds.length === 0) {
    return;
  }

  const missingJournalResult = await client.query(
    `SELECT i.invoice_id, i.invoice_number
       FROM greentarget.invoices i
      WHERE i.invoice_id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1
            FROM greentarget.journal_entries je
           WHERE je.entry_type = 'S'
             AND je.status = 'posted'
             AND (
               (
                 je.id = i.journal_entry_id
                 AND (
                   je.source_type IS NULL
                   OR (je.source_type = 'invoice'
                       AND je.source_id = i.invoice_id::text)
                 )
               )
               OR (
                 i.journal_entry_id IS NULL
                 AND je.source_type = 'invoice'
                 AND je.source_id = i.invoice_id::text
               )
             )
        )
      ORDER BY i.invoice_id`,
    [postCutoverInvoiceIds]
  );
  if (missingJournalResult.rows.length === 0) {
    return;
  }

  const blockedInvoices = missingJournalResult.rows
    .map((invoice) => invoice.invoice_number || invoice.invoice_id)
    .join(", ");
  throw createPaymentError(
    409,
    `Cannot record or confirm a receipt for invoice(s) ${blockedInvoices} because the sales journal is missing or cancelled. Resolve the invoice journal first.`
  );
};

/**
 * Resolve the journal a receipt header owns, using the same order the receipt
 * journal service uses: the backlink first, then the source-owned posted
 * journal. Kept in step with `syncGTReceiptJournalEntry`.
 *
 * @param {import("pg").PoolClient|import("pg").Pool} queryable
 * @param {Record<string, unknown>} receipt
 * @param {boolean} [lockJournal]
 * @returns {Promise<Record<string, unknown>|null>}
 */
const fetchReceiptJournal = async (queryable, receipt, lockJournal = false) => {
  const lockClause = lockJournal ? " FOR UPDATE" : "";
  if (receipt.journal_entry_id) {
    const backlinkResult = await queryable.query(
      `SELECT id, status, manual_override
         FROM greentarget.journal_entries
        WHERE id = $1${lockClause}`,
      [Number(receipt.journal_entry_id)]
    );
    if (backlinkResult.rows.length > 0) {
      return backlinkResult.rows[0];
    }
  }
  const bySourceResult = await queryable.query(
    `SELECT id, status, manual_override
       FROM greentarget.journal_entries
      WHERE source_type = 'receipt'
        AND source_id = $1
        AND status = 'posted'
      LIMIT 1${lockClause}`,
    [String(receipt.id)]
  );
  return bySourceResult.rows[0] || null;
};

/**
 * Decide whether one more invoice allocation may join an existing receipt
 * header (handover rules J4, J5 and J6). Shared by the by-reference lookup and
 * the join path of POST / so the UI never reimplements the rules.
 *
 * A receipt whose journal was hand-edited (`manual_override`) is refused
 * because the journal service deliberately stops rebuilding it: joining would
 * move money operationally while leaving the ledger untouched.
 *
 * @param {import("pg").PoolClient|import("pg").Pool} queryable
 * @param {Record<string, unknown>} receipt
 * @param {number|null} invoiceId
 * @param {boolean} [lockJournal]
 * @returns {Promise<null|"cancelled"|"manual_override"|"invoice_already_allocated">}
 */
const resolveReceiptJoinBlockReason = async (
  queryable,
  receipt,
  invoiceId,
  lockJournal = false
) => {
  if (receipt.status === "cancelled") {
    return "cancelled";
  }
  const journal = await fetchReceiptJournal(queryable, receipt, lockJournal);
  if (journal?.manual_override) {
    return "manual_override";
  }
  if (invoiceId) {
    const allocatedResult = await queryable.query(
      `SELECT payment_id
         FROM greentarget.payments
        WHERE receipt_id = $1
          AND invoice_id = $2
          AND COALESCE(status, 'active') <> 'cancelled'
        LIMIT 1`,
      [Number(receipt.id), invoiceId]
    );
    if (allocatedResult.rows.length > 0) {
      return "invoice_already_allocated";
    }
  }
  return null;
};

/**
 * @param {"cancelled"|"manual_override"|"invoice_already_allocated"} blockReason
 * @param {Record<string, unknown>} receipt
 * @returns {string}
 */
const describeReceiptJoinBlock = (blockReason, receipt) => {
  const receiptLabel = receipt.display_reference || receipt.id;
  if (blockReason === "cancelled") {
    return `Receipt "${receiptLabel}" is cancelled, so no further payment can be added to it.`;
  }
  if (blockReason === "manual_override") {
    return `Receipt "${receiptLabel}" has a hand-edited journal, so it can no longer be rebuilt automatically. Record this payment under its own reference.`;
  }
  return `Receipt "${receiptLabel}" already has a payment for this invoice.`;
};

/**
 * Lock the durable receipt header and every allocation belonging to it.
 *
 * @param {import("pg").PoolClient} client
 * @param {number} paymentId
 * @returns {Promise<{ status: "active"|"pending"|"cancelled", receipt: Record<string, unknown>, payments: Array<Record<string, unknown>> }>}
 */
const fetchPaymentGroupForUpdate = async (client, paymentId) => {
  const targetResult = await client.query(
    `SELECT payment_id, receipt_id
       FROM greentarget.payments
      WHERE payment_id = $1`,
    [paymentId]
  );
  if (targetResult.rows.length === 0) {
    throw createPaymentError(404, "Payment not found");
  }
  const receiptResult = await client.query(
    `SELECT *
       FROM greentarget.receipts
      WHERE id = $1
      FOR UPDATE`,
    [targetResult.rows[0].receipt_id]
  );
  if (receiptResult.rows.length === 0) {
    throw createPaymentError(409, "Payment receipt header is missing");
  }
  const receipt = receiptResult.rows[0];

  const paymentResult = await client.query(
    `SELECT p.*, i.customer_id, i.balance_due,
            i.status AS invoice_status,
            i.date_issued AS invoice_date_issued,
            i.invoice_number
       FROM greentarget.payments p
       JOIN greentarget.invoices i ON i.invoice_id = p.invoice_id
      WHERE p.receipt_id = $1
      ORDER BY p.invoice_id, p.payment_id
      FOR UPDATE OF p, i`,
    [receipt.id]
  );
  if (paymentResult.rows.length === 0) {
    throw createPaymentError(409, "Payment status changed. Refresh and try again.");
  }

  return {
    status:
      receipt.status === "pending"
        ? "pending"
        : receipt.status === "cancelled"
        ? "cancelled"
        : "active",
    receipt,
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
               r.posting_date,
               r.origin AS receipt_origin,
               r.journal_entry_id AS receipt_journal_entry_id,
               COALESCE(r.journal_entry_id, p.journal_entry_id) AS journal_entry_id,
               i.invoice_number,
               c.name as customer_name
        FROM greentarget.payments p
        JOIN greentarget.receipts r ON r.id = p.receipt_id
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

  // Look one durable receipt up by its user-keyed GT reference so the invoice
  // and rental screens can offer to JOIN it instead of failing on a duplicate.
  // Registered before /receipts/:receiptId/group so a reference can never be
  // read as a receipt id. `joinable` resolves J4/J5 (and J6 when an invoice is
  // supplied) server-side.
  router.get("/receipts/by-reference/:ref(*)", async (req, res) => {
    try {
      const internalReference = normalizePaymentReference(
        req.params.ref,
        "Green Target reference number"
      );
      if (!internalReference) {
        throw createPaymentError(
          400,
          "Green Target reference number is required"
        );
      }

      /** @type {number|null} */
      let invoiceId = null;
      if (req.query.invoice_id !== undefined && req.query.invoice_id !== "") {
        invoiceId = Number(req.query.invoice_id);
        if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
          throw createPaymentError(400, "Invalid invoice id");
        }
      }

      const receiptResult = await pool.query(
        `SELECT r.*,
                (SELECT COUNT(*)
                   FROM greentarget.payments p
                  WHERE p.receipt_id = r.id
                    AND COALESCE(p.status, 'active') <> 'cancelled')
                  AS allocation_count
           FROM greentarget.receipts r
          WHERE UPPER(TRIM(r.display_reference)) = UPPER($1)
          LIMIT 1`,
        [internalReference]
      );
      if (receiptResult.rows.length === 0) {
        return res.json({
          exists: false,
          receipt: null,
          joinable: false,
          block_reason: null,
        });
      }

      const receipt = receiptResult.rows[0];
      const blockReason = await resolveReceiptJoinBlockReason(
        pool,
        receipt,
        invoiceId
      );

      res.json({
        exists: true,
        receipt: {
          receipt_id: Number(receipt.id),
          display_reference: receipt.display_reference,
          received_date: receipt.received_date,
          posting_date: receipt.posting_date,
          payment_method: receipt.payment_method,
          payment_reference: receipt.payment_reference,
          status: receipt.status,
          origin: receipt.origin,
          total_amount: Number(receipt.total_amount),
          allocation_count: Number(receipt.allocation_count),
        },
        joinable: blockReason === null,
        block_reason: blockReason,
      });
    } catch (error) {
      console.error("Error looking up Green Target receipt by reference:", error);
      const statusCode = Number(error?.statusCode) || 500;
      res.status(statusCode).json({
        message:
          statusCode < 500 ? error.message : "Error looking up the receipt",
        error: error.message,
      });
    }
  });

  // Receipt-first read model for the GT payment list/details dialog. Keep this
  // named route before all /:payment_id mutation routes so "receipts" can
  // never be interpreted as a payment id if a read-by-id route is added.
  router.get("/receipts/:receiptId/group", async (req, res) => {
    const receiptId = Number(req.params.receiptId);
    if (!Number.isInteger(receiptId) || receiptId <= 0) {
      return res.status(400).json({ message: "Invalid receipt id" });
    }

    try {
      // Read the header, journal and allocations in one statement so a
      // concurrent confirm/cancel cannot expose a mixed receipt snapshot.
      const groupResult = await pool.query(
        `SELECT r.id AS receipt_id,
                r.display_reference,
                r.received_date,
                r.posting_date,
                r.payment_method,
                r.payment_reference,
                r.bank_account,
                r.status,
                r.origin,
                r.total_amount,
                r.cancellation_date,
                r.cancellation_reason,
                je.id AS journal_entry_id,
                COALESCE(je.display_reference, je.reference_no)
                  AS journal_reference_no,
                je.entry_date AS journal_entry_date,
                je.status AS journal_status,
                p.payment_id,
                p.invoice_id,
                i.invoice_number,
                i.customer_id,
                c.name AS customer_name,
                p.amount_paid,
                p.status AS payment_status,
                -- A payment's rentals are always DERIVED through its invoice
                -- (invoice_rentals), never denormalised onto the payment. Kept
                -- as a subquery so the statement stays one row per allocation.
                (SELECT COALESCE(
                          json_agg(
                            json_build_object(
                              'rental_id', rn.rental_id,
                              'tong_no', rn.tong_no,
                              'date_placed', rn.date_placed,
                              'date_picked', rn.date_picked,
                              'location_site', loc.site,
                              'location_address', loc.address
                            )
                            ORDER BY rn.date_placed DESC, rn.rental_id DESC
                          ),
                          '[]'::json
                        )
                   FROM greentarget.invoice_rentals ir
                   JOIN greentarget.rentals rn
                     ON rn.rental_id = ir.rental_id
                   LEFT JOIN greentarget.locations loc
                     ON loc.location_id = rn.location_id
                  WHERE ir.invoice_id = p.invoice_id) AS invoice_rentals
           FROM greentarget.receipts r
           LEFT JOIN greentarget.journal_entries je
             ON je.id = r.journal_entry_id
           LEFT JOIN greentarget.payments p
             ON p.receipt_id = r.id
           LEFT JOIN greentarget.invoices i
             ON i.invoice_id = p.invoice_id
           LEFT JOIN greentarget.customers c
             ON c.customer_id = i.customer_id
          WHERE r.id = $1
          ORDER BY p.payment_id`,
        [receiptId]
      );
      if (groupResult.rows.length === 0) {
        return res.status(404).json({ message: "Receipt not found" });
      }

      /** @type {Record<string, unknown>} */
      const receipt = groupResult.rows[0];
      /** @type {Array<{
       *   payment_id: number,
       *   invoice_id: number,
       *   invoice_number: string,
       *   customer_id: number,
       *   customer_name: string,
       *   amount_paid: number,
       *   status: string,
       *   rentals: Array<Record<string, unknown>>
       * }>} */
      const allocations = groupResult.rows
        .filter((allocation) => allocation.payment_id !== null)
        .map((allocation) => ({
          payment_id: Number(allocation.payment_id),
          invoice_id: Number(allocation.invoice_id),
          invoice_number: allocation.invoice_number,
          customer_id: Number(allocation.customer_id),
          customer_name: allocation.customer_name,
          amount_paid: Number(allocation.amount_paid),
          status: allocation.payment_status || "active",
          rentals: allocation.invoice_rentals || [],
        }));

      res.json({
        receipt: {
          receipt_id: Number(receipt.receipt_id),
          display_reference: receipt.display_reference,
          received_date: receipt.received_date,
          posting_date: receipt.posting_date,
          payment_method: receipt.payment_method,
          payment_reference: receipt.payment_reference,
          bank_account: receipt.bank_account,
          status: receipt.status,
          origin: receipt.origin,
          total_amount: Number(receipt.total_amount),
          cancellation_date: receipt.cancellation_date,
          cancellation_reason: receipt.cancellation_reason,
        },
        representative_payment_id:
          allocations.length > 0 ? allocations[0].payment_id : null,
        journal: receipt.journal_entry_id
          ? {
              journal_entry_id: Number(receipt.journal_entry_id),
              reference_no: receipt.journal_reference_no,
              entry_date: receipt.journal_entry_date,
              status: receipt.journal_status,
            }
          : null,
        allocations,
      });
    } catch (error) {
      console.error("Error fetching Green Target receipt group:", error);
      res.status(500).json({
        message: "Error fetching receipt details",
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
        `SELECT id
          FROM greentarget.receipts
          WHERE UPPER(TRIM(display_reference)) = UPPER($1)
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
      await assertPostCutoverInvoicesHavePostedSalesJournals(
        client,
        invoiceResult.rows
      );

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
      const receiptStatus = initialStatus === "pending" ? "pending" : "posted";
      const receiptOrigin =
        paymentDate < GREEN_TARGET_ACCOUNTING_OPEN_DATE
          ? "legacy_operational"
          : "erp";
      const totalReceiptAmount =
        allocations.reduce(
          (sum, allocation) => sum + toPaymentCents(allocation.amountPaid),
          0
        ) / 100;
      const receiptResult = await client.query(
        `INSERT INTO greentarget.receipts (
           display_reference, received_date, posting_date, payment_method,
           payment_reference, bank_account, status, origin, total_amount,
           created_by, updated_by
         )
         VALUES ($1, $2, $3, $4, $5, 'PBB_1', $6, $7, $8, $9, $9)
         RETURNING *`,
        [
          internalReference,
          paymentDate,
          receiptStatus === "posted" ? paymentDate : null,
          paymentMethod,
          paymentReference || null,
          receiptStatus,
          receiptOrigin,
          totalReceiptAmount,
          req.staffId || null,
        ]
      );
      const receipt = receiptResult.rows[0];
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
             status,
             receipt_id,
             bank_account
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PBB_1')
           RETURNING *`,
          [
            allocation.invoiceId,
            paymentDate,
            allocation.amountPaid,
            paymentMethod,
            paymentReference || null,
            internalReference,
            initialStatus,
            receipt.id,
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
        }

        createdPayments.push(paymentResult.rows[0]);
      }

      if (activeCustomerIds.size > 0) {
        await client.query(
          `UPDATE greentarget.customers
              SET last_activity_date = CURRENT_DATE
            WHERE customer_id = ANY($1::int[])`,
          [Array.from(activeCustomerIds)]
        );
      }

      await syncGTReceiptJournalEntry(
        client,
        receipt,
        req.staffId || null
      );
      const createdPaymentIds = createdPayments.map((payment) =>
        Number(payment.payment_id)
      );
      const refreshedPayments = await client.query(
        `SELECT p.*,
                COALESCE(r.journal_entry_id, p.journal_entry_id) AS journal_entry_id,
                r.posting_date
           FROM greentarget.payments p
           JOIN greentarget.receipts r ON r.id = p.receipt_id
          WHERE p.payment_id = ANY($1::int[])
          ORDER BY p.payment_id`,
        [createdPaymentIds]
      );

      await client.query("COMMIT");
      res.status(201).json({
        message:
          initialStatus === "pending"
            ? "Payment batch created successfully (pending confirmation)"
            : "Payment batch created successfully",
        payments: refreshedPayments.rows,
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

  // Create a new payment. Pass `receipt_id` to JOIN an existing receipt header
  // instead of opening a new one; without it the behaviour is unchanged.
  router.post("/", async (req, res) => {
    const {
      invoice_id,
      payment_date,
      amount_paid,
      payment_method,
      payment_reference,
      internal_reference,
      receipt_id,
    } = req.body || {};

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const joinReceiptId =
        receipt_id === undefined || receipt_id === null || receipt_id === ""
          ? null
          : Number(receipt_id);
      if (
        joinReceiptId !== null &&
        (!Number.isInteger(joinReceiptId) || joinReceiptId <= 0)
      ) {
        throw createPaymentError(400, "Invalid receipt id");
      }

      // Joining inherits the header's banking fields, but the submitted GT
      // reference remains required as the identity the user confirmed.
      if (
        !invoice_id ||
        amount_paid === undefined ||
        amount_paid === null ||
        !internal_reference ||
        (joinReceiptId === null && (!payment_date || !payment_method))
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

      // Serialize the user-keyed GT reference before taking invoice locks so
      // every payment mutation — new receipt or join — uses one lock order.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [PAYMENT_REFERENCE_LOCK_KEY]
      );

      const expectedInternalReference = normalizePaymentReference(
        internal_reference,
        "Green Target reference number"
      );
      if (!expectedInternalReference) {
        throw createPaymentError(
          400,
          "Green Target reference number is required"
        );
      }

      /** @type {Record<string, unknown>|null} */
      let joinedReceipt = null;
      /** @type {string} */
      let normalizedPaymentDate;
      /** @type {string} */
      let normalizedPaymentMethod;
      /** @type {string} */
      let normalizedPaymentReference;
      /** @type {string} */
      let normalizedInternalReference;

      if (joinReceiptId !== null) {
        const joinTargetResult = await client.query(
          `SELECT r.*,
                  UPPER(TRIM(r.display_reference)) = UPPER($2)
                    AS reference_matches
             FROM greentarget.receipts r
            WHERE r.id = $1
            FOR UPDATE`,
          [joinReceiptId, expectedInternalReference]
        );
        if (joinTargetResult.rows.length === 0) {
          throw createPaymentError(404, "Receipt not found");
        }
        joinedReceipt = joinTargetResult.rows[0];
        if (!joinedReceipt.reference_matches) {
          throw createPaymentError(
            409,
            "This receipt reference was changed after it was checked. Check the reference and confirm the receipt again."
          );
        }
        const joinBlockReason = await resolveReceiptJoinBlockReason(
          client,
          joinedReceipt,
          Number(invoice_id),
          true
        );
        if (joinBlockReason) {
          throw createPaymentError(
            409,
            describeReceiptJoinBlock(joinBlockReason, joinedReceipt)
          );
        }

        // A receipt is ONE banking event: the allocation adopts the header's
        // date, method and cheque/transaction reference, and the client's
        // values for those fields are deliberately ignored.
        normalizedPaymentDate = toLocalAccountingDateString(
          joinedReceipt.received_date
        );
        normalizedPaymentMethod = String(joinedReceipt.payment_method);
        normalizedPaymentReference = String(
          joinedReceipt.payment_reference || ""
        );
        normalizedInternalReference = String(
          joinedReceipt.display_reference || ""
        ).trim();
      } else {
        normalizedPaymentReference = normalizePaymentReference(
          payment_reference,
          "Cheque / transaction reference"
        );
        normalizedInternalReference = expectedInternalReference;
        try {
          normalizedPaymentDate = toLocalAccountingDateString(payment_date);
        } catch {
          throw createPaymentError(400, "Payment received date is invalid");
        }
        if (!PAYMENT_METHODS.has(payment_method)) {
          throw createPaymentError(400, "Invalid payment method");
        }
        normalizedPaymentMethod = payment_method;

        const internalReferenceCheck = await client.query(
          `SELECT id
            FROM greentarget.receipts
            WHERE UPPER(TRIM(display_reference)) = UPPER($1)
            LIMIT 1`,
          [normalizedInternalReference]
        );
        if (internalReferenceCheck.rows.length > 0) {
          throw createPaymentError(
            409,
            `Green Target reference number "${normalizedInternalReference}" is already in use. Refresh and try again.`
          );
        }
      }

      // Lock the joining invoice AND every invoice already allocated to this
      // receipt in deterministic invoice-id order. Receipt cancellation and
      // confirmation use the same order, preventing cross-receipt deadlocks
      // when invoices have legitimate allocations in more than one receipt.
      const invoiceQuery = `
        SELECT i.*, c.customer_id
        FROM greentarget.invoices i
        JOIN greentarget.customers c ON i.customer_id = c.customer_id
        WHERE i.invoice_id = $1
           OR (
             $2::integer IS NOT NULL
             AND EXISTS (
               SELECT 1
                 FROM greentarget.payments existing_payment
                WHERE existing_payment.receipt_id = $2
                  AND existing_payment.invoice_id = i.invoice_id
             )
           )
        ORDER BY i.invoice_id
        FOR UPDATE OF i
      `;

      const invoiceResult = await client.query(invoiceQuery, [
        invoice_id,
        joinReceiptId,
      ]);

      const invoice = invoiceResult.rows.find(
        (row) => Number(row.invoice_id) === Number(invoice_id)
      );
      if (!invoice) {
        throw createPaymentError(404, `Invoice with ID ${invoice_id} not found`);
      }

      assertPaymentMutationDateAllowed(
        [invoice],
        normalizedPaymentDate,
        "Payment"
      );
      assertPaymentNotBeforeInvoices([invoice], normalizedPaymentDate);
      await assertPostCutoverInvoicesHavePostedSalesJournals(client, [invoice]);
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

      // Adding a second invoice to a pending cheque receipt is legitimate, so
      // only a pending payment on ANOTHER receipt blocks this one.
      const pendingPaymentResult = await client.query(
        `SELECT payment_id
           FROM greentarget.payments
          WHERE invoice_id = $1
            AND status = 'pending'
            AND ($2::integer IS NULL OR receipt_id IS DISTINCT FROM $2)
          LIMIT 1`,
        [invoice_id, joinReceiptId]
      );
      if (pendingPaymentResult.rows.length > 0) {
        throw createPaymentError(
          409,
          `Invoice ${invoice_id} already has a pending payment`
        );
      }

      // The receipt header owns the status, so a joined allocation inherits it
      // and stays pending — leaving the invoice balance alone — until the whole
      // cheque receipt is confirmed.
      const initialStatus = joinedReceipt
        ? joinedReceipt.status === "pending"
          ? "pending"
          : "active"
        : normalizedPaymentMethod === "cheque"
        ? "pending"
        : "active";
      let receipt = joinedReceipt;
      if (!receipt) {
        const receiptStatus = initialStatus === "pending" ? "pending" : "posted";
        const receiptOrigin =
          normalizedPaymentDate < GREEN_TARGET_ACCOUNTING_OPEN_DATE
            ? "legacy_operational"
            : "erp";
        const receiptResult = await client.query(
          `INSERT INTO greentarget.receipts (
             display_reference, received_date, posting_date, payment_method,
             payment_reference, bank_account, status, origin, total_amount,
             created_by, updated_by
           )
           VALUES ($1, $2, $3, $4, $5, 'PBB_1', $6, $7, $8, $9, $9)
           RETURNING *`,
          [
            normalizedInternalReference,
            normalizedPaymentDate,
            receiptStatus === "posted" ? normalizedPaymentDate : null,
            normalizedPaymentMethod,
            normalizedPaymentReference || null,
            receiptStatus,
            receiptOrigin,
            paymentAmount,
            req.staffId || null,
          ]
        );
        receipt = receiptResult.rows[0];
      }

      // Create the payment
      const paymentQuery = `
        INSERT INTO greentarget.payments (
          invoice_id,
          payment_date,
          amount_paid,
          payment_method,
          payment_reference,
          internal_reference,
          status,
          receipt_id,
          bank_account
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PBB_1')
        RETURNING *
      `;

      const paymentResult = await client.query(paymentQuery, [
        invoice_id,
        normalizedPaymentDate,
        paymentAmount,
        normalizedPaymentMethod,
        normalizedPaymentReference || null,
        normalizedInternalReference || null,
        initialStatus,
        receipt.id,
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

      if (joinedReceipt) {
        // The journal service asserts that the allocations equal the header
        // total, so the header must be increased BEFORE the sync and the
        // refreshed row is what gets passed to it.
        const joinedReceiptResult = await client.query(
          `UPDATE greentarget.receipts
              SET total_amount = total_amount + $1,
                  updated_at = CURRENT_TIMESTAMP,
                  updated_by = $2
            WHERE id = $3
            RETURNING *`,
          [paymentAmount, req.staffId || null, receipt.id]
        );
        receipt = joinedReceiptResult.rows[0];
      }

      await syncGTReceiptJournalEntry(
        client,
        receipt,
        req.staffId || null
      );

      const refreshedPaymentResult = await client.query(
        `SELECT p.*,
                COALESCE(r.journal_entry_id, p.journal_entry_id) AS journal_entry_id,
                r.posting_date
           FROM greentarget.payments p
           JOIN greentarget.receipts r ON r.id = p.receipt_id
          WHERE p.payment_id = $1`,
        [paymentResult.rows[0].payment_id]
      );
      await client.query("COMMIT");

      res.status(201).json({
        message: joinedReceipt
          ? `Payment added to receipt ${receipt.display_reference}`
          : initialStatus === "pending"
          ? "Payment created successfully (pending confirmation)"
          : "Payment created successfully",
        payment: refreshedPaymentResult.rows[0],
        receipt: {
          receipt_id: Number(receipt.id),
          display_reference: receipt.display_reference,
          received_date: receipt.received_date,
          payment_method: receipt.payment_method,
          payment_reference: receipt.payment_reference,
          status: receipt.status,
          total_amount: Number(receipt.total_amount),
          joined: joinedReceipt !== null,
        },
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
        req.params.ref,
        "Green Target reference number"
      );
      if (!internalReference) {
        throw createPaymentError(
          400,
          "Green Target reference number is required"
        );
      }
      let excludedReceiptId = null;

      if (exclude_payment_id) {
        const excludedPaymentId = Number(exclude_payment_id);
        if (!Number.isInteger(excludedPaymentId) || excludedPaymentId <= 0) {
          throw createPaymentError(400, "Invalid excluded payment id");
        }
        const excludedReceiptResult = await pool.query(
          `SELECT receipt_id
             FROM greentarget.payments
            WHERE payment_id = $1`,
          [excludedPaymentId]
        );
        excludedReceiptId = excludedReceiptResult.rows[0]?.receipt_id || null;
      }

      const result = await pool.query(
        `SELECT r.id,
                (SELECT MIN(p.payment_id)
                   FROM greentarget.payments p
                  WHERE p.receipt_id = r.id) AS payment_id
           FROM greentarget.receipts r
          WHERE UPPER(TRIM(r.display_reference)) = UPPER($1)
            AND ($2::integer IS NULL OR r.id <> $2)
          LIMIT 1`,
        [internalReference, excludedReceiptId]
      );

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
    const {
      internal_reference,
      payment_reference,
      expected_internal_reference,
    } = req.body || {};
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

      // Creation takes this lock before invoice locks. Match that order so
      // two receipt edits cannot both pass the friendly duplicate check (the
      // database unique index remains the final safety net).
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [PAYMENT_REFERENCE_LOCK_KEY]
      );
      const paymentGroup = await fetchPaymentGroupForUpdate(client, paymentId);
      if (paymentGroup.status === "cancelled") {
        throw createPaymentError(409, "A cancelled receipt cannot be edited");
      }

      if (expected_internal_reference !== undefined) {
        const normalizedExpectedReference = normalizePaymentReference(
          expected_internal_reference,
          "Expected Green Target reference number"
        );
        if (
          !normalizedExpectedReference ||
          normalizedExpectedReference !==
            String(paymentGroup.receipt.display_reference || "").trim()
        ) {
          throw createPaymentError(
            409,
            "This receipt reference was changed by another user. Refresh the receipt and try again."
          );
        }
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
          `SELECT id
             FROM greentarget.receipts
            WHERE UPPER(TRIM(display_reference)) = UPPER($1)
              AND id <> $2
            LIMIT 1`,
          [normalizedInternalReference, paymentGroup.receipt.id]
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
      const updatedReceiptResult = await client.query(
        `UPDATE greentarget.receipts
            SET display_reference = CASE
                  WHEN $1::boolean THEN $2 ELSE display_reference
                END,
                payment_reference = CASE
                  WHEN $3::boolean THEN $4 ELSE payment_reference
                END,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $5
          WHERE id = $6
          RETURNING *`,
        [
          internal_reference !== undefined,
          normalizedInternalReference,
          payment_reference !== undefined,
          normalizedPaymentReference || null,
          req.staffId || null,
          paymentGroup.receipt.id,
        ]
      );
      await updateGTReceiptJournalReference(
        client,
        updatedReceiptResult.rows[0]
      );

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
    const { posting_date } = req.body || {};
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

      if (!posting_date) {
        throw createPaymentError(
          400,
          "Bank clearance / posting date is required to confirm a cheque receipt"
        );
      }
      let postingDate;
      try {
        postingDate = toLocalAccountingDateString(posting_date);
      } catch {
        throw createPaymentError(400, "Bank clearance / posting date is invalid");
      }
      const receivedDate = toLocalAccountingDateString(
        paymentGroup.receipt.received_date
      );
      if (postingDate < receivedDate) {
        throw createPaymentError(
          400,
          "Bank clearance / posting date cannot be before the received date"
        );
      }

      const confirmationInvoices = paymentGroup.payments.map((payment) => ({
        invoice_id: payment.invoice_id,
        invoice_number: payment.invoice_number,
        date_issued: payment.invoice_date_issued,
      }));
      assertPaymentMutationDateAllowed(
        confirmationInvoices,
        postingDate,
        "Payment confirmation"
      );
      await assertPostCutoverInvoicesHavePostedSalesJournals(
        client,
        confirmationInvoices
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
      await client.query(
        `UPDATE greentarget.payments
            SET status = 'active'
          WHERE payment_id = ANY($1::int[])`,
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

      const customerIds = Array.from(invoiceBalances.values()).map(
        (invoiceBalance) => invoiceBalance.customerId
      );
      await client.query(
        `UPDATE greentarget.customers
            SET last_activity_date = CURRENT_DATE
          WHERE customer_id = ANY($1::int[])`,
        [customerIds]
      );

      const receiptResult = await client.query(
        `UPDATE greentarget.receipts
            SET status = 'posted',
                posting_date = $1,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $2
          WHERE id = $3
          RETURNING *`,
        [postingDate, req.staffId || null, paymentGroup.receipt.id]
      );
      await syncGTReceiptJournalEntry(
        client,
        receiptResult.rows[0],
        req.staffId || null
      );

      const refreshedPayments = await client.query(
        `SELECT p.*,
                COALESCE(r.journal_entry_id, p.journal_entry_id) AS journal_entry_id,
                r.posting_date
           FROM greentarget.payments p
           JOIN greentarget.receipts r ON r.id = p.receipt_id
          WHERE p.payment_id = ANY($1::int[])
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

      if (paymentGroup.receipt.journal_entry_id) {
        assertGreenTargetAccountingDateUnlocked(
          paymentGroup.receipt.posting_date ||
            paymentGroup.receipt.received_date,
          "Receipt cancellation"
        );
        await cancelGTReceiptJournalEntry(
          client,
          Number(paymentGroup.receipt.journal_entry_id),
          Number(paymentGroup.receipt.id)
        );
      } else {
        assertPaymentMutationDateAllowed(
          paymentGroup.payments.map((payment) => ({
            date_issued: payment.invoice_date_issued,
          })),
          toLocalAccountingDateString(paymentGroup.receipt.received_date),
          "Receipt cancellation"
        );
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
      await client.query(
        `UPDATE greentarget.receipts
            SET status = 'cancelled',
                cancellation_date = CURRENT_TIMESTAMP,
                cancellation_reason = $1,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $2
          WHERE id = $3`,
        [reason || null, req.staffId || null, paymentGroup.receipt.id]
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
