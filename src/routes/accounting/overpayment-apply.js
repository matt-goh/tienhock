// src/routes/accounting/overpayment-apply.js
// Overpayment application: consumes a customer's unapplied receipt excess
// (held in CUST_DEP) against their unpaid invoices. One payments row
// (payment_method 'overpayment') + one REC journal (DR CUST_DEP / CR customer
// debtor child, source_type 'payment') PER invoice; the FIFO distribution
// across the customer's excess allocations is recorded in
// overpayment_applications so cancelling the payment reverses exactly.
//
// Used by POST /api/payments/apply-overpayment (standalone apply) and by
// POST /api/receipts (overpayment applied alongside a money receipt in the
// same atomic transaction). Runs INSIDE the caller's transaction.

import { generateReceiptReference } from "./payment-journal.js";
import { getCustomerDebtorAccountCode } from "./debtorSync.js";
import { toLocalDateString } from "./receipt-service.js";
import { assertTienHockAccountingDateUnlocked } from "./posting-lock.js";
import { assertNoUnrepresentedImportedPaymentEvidence } from "./imported-payment-reconciliation.js";

const round2 = (v) => Math.round(parseFloat(v || 0) * 100) / 100;

/**
 * Applies overpayment to invoices of ONE customer.
 *
 * @param {object} client - pg client (transaction already begun by caller)
 * @param {object} payload
 * @param {Array<{invoice_id: string, amount: number}>} payload.allocations
 * @param {string|Date|number} [payload.payment_date] - posting date (default today)
 * @param {string} [payload.notes]
 * @param {string|null} userId
 * @returns {{ payments: object[], customer_id: string, total_applied: number }}
 */
export async function applyOverpayment(client, payload, userId) {
  const { allocations, notes } = payload;

  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw Object.assign(
      new Error("allocations must be a non-empty array of { invoice_id, amount }"),
      { status: 400 }
    );
  }

  // 1. Normalize amounts and merge duplicate invoices
  const mergedByInvoice = new Map();
  allocations.forEach((a, i) => {
    const amount = round2(a && a.amount);
    if (!a || !a.invoice_id) {
      throw Object.assign(
        new Error(`Allocation ${i + 1}: invoice_id is required`),
        { status: 400 }
      );
    }
    if (!(amount > 0)) {
      throw Object.assign(
        new Error(`Allocation ${i + 1}: amount must be a positive number`),
        { status: 400 }
      );
    }
    const invoiceId = String(a.invoice_id);
    mergedByInvoice.set(
      invoiceId,
      round2((mergedByInvoice.get(invoiceId) || 0) + amount)
    );
  });
  const allocs = [...mergedByInvoice.entries()].map(([invoice_id, amount]) => ({
    invoice_id,
    amount,
  }));
  const applyDate = toLocalDateString(payload.payment_date || new Date());

  // 2. Lock invoices; require one customer and per-invoice balance caps
  const invoiceIds = allocs.map((a) => a.invoice_id).sort();
  const invoiceResult = await client.query(
    `SELECT id, customerid, paymenttype, balance_due, invoice_status
       FROM invoices WHERE id = ANY($1::varchar[]) ORDER BY id FOR UPDATE`,
    [invoiceIds]
  );
  const invoiceMap = {};
  for (const row of invoiceResult.rows) invoiceMap[row.id] = row;
  let customerId = null;
  for (const a of allocs) {
    const inv = invoiceMap[a.invoice_id];
    if (!inv) {
      throw Object.assign(new Error(`Invoice ${a.invoice_id} not found`), {
        status: 404,
      });
    }
    if (inv.invoice_status === "cancelled") {
      throw Object.assign(
        new Error(
          `Invoice ${a.invoice_id} is cancelled and cannot receive payments`
        ),
        { status: 400 }
      );
    }
    if (customerId === null) customerId = inv.customerid;
    if (inv.customerid !== customerId) {
      throw Object.assign(
        new Error(
          "Overpayment can only be applied to invoices of one customer at a time"
        ),
        { status: 400 }
      );
    }
    const balance = round2(inv.balance_due);
    if (a.amount > balance + 0.005) {
      throw Object.assign(
        new Error(
          `Invoice ${a.invoice_id}: apply amount RM${a.amount.toFixed(
            2
          )} exceeds balance due RM${balance.toFixed(2)}`
        ),
        { status: 400 }
      );
    }
  }
  const totalApply = round2(allocs.reduce((s, a) => s + a.amount, 0));

  for (const allocation of allocs) {
    await assertNoUnrepresentedImportedPaymentEvidence(
      client,
      {
        allocations: [{ type: "invoice", ...allocation }],
        payment_reference: "",
        received_date: applyDate,
        payment_method: "cash",
      },
      "Overpayment application"
    );
  }

  // 3. Lock the customer's excess allocations FIFO and check coverage
  const excessResult = await client.query(
    `SELECT ra.id,
            (ra.amount - ra.applied_amount - ra.refunded_amount) AS remaining
       FROM receipt_allocations ra
       JOIN receipts r ON r.id = ra.receipt_id
      WHERE ra.allocation_type = 'excess'
        AND r.status = 'posted'
        AND ra.customer_id = $1
        AND ra.amount - ra.applied_amount - ra.refunded_amount > 0.005
      ORDER BY r.posting_date, ra.receipt_id, ra.line_number
      FOR UPDATE OF ra`,
    [customerId]
  );
  const excessRows = excessResult.rows;
  const totalAvailable = round2(
    excessRows.reduce((s, r) => s + parseFloat(r.remaining), 0)
  );
  if (totalApply > totalAvailable + 0.005) {
    throw Object.assign(
      new Error(
        `Apply amount RM${totalApply.toFixed(
          2
        )} exceeds the customer's unapplied overpayment RM${totalAvailable.toFixed(
          2
        )}`
      ),
      { status: 400 }
    );
  }

  // 4. Posting date guard + accounts
  assertTienHockAccountingDateUnlocked(applyDate, "Overpayment application");
  const debtorAccount = await getCustomerDebtorAccountCode(client, customerId);

  // FIFO consumption cursor across the locked excess rows
  let cursor = 0;
  let cursorRemaining =
    excessRows.length > 0 ? parseFloat(excessRows[0].remaining) : 0;
  const takeFromExcess = (amount) => {
    const takes = [];
    let left = amount;
    while (left > 0.005 && cursor < excessRows.length) {
      const take = round2(Math.min(left, cursorRemaining));
      takes.push({
        receipt_allocation_id: excessRows[cursor].id,
        amount: take,
      });
      left = round2(left - take);
      cursorRemaining = round2(cursorRemaining - take);
      if (cursorRemaining <= 0.005) {
        cursor += 1;
        cursorRemaining =
          cursor < excessRows.length
            ? parseFloat(excessRows[cursor].remaining)
            : 0;
      }
    }
    if (left > 0.005) {
      throw new Error(
        "Overpayment coverage changed while applying; please retry"
      );
    }
    return takes;
  };

  const createdPayments = [];
  for (const a of allocs) {
    const inv = invoiceMap[a.invoice_id];

    // 5a. Payment-history row (one per invoice)
    const paymentResult = await client.query(
      `INSERT INTO payments (
         invoice_id, payment_date, amount_paid, payment_method,
         payment_reference, bank_account, notes, status, is_auto_collection
       ) VALUES ($1, $2, $3, 'overpayment', NULL, NULL, $4, 'active', false)
       RETURNING *`,
      [
        a.invoice_id,
        applyDate,
        a.amount,
        notes || "Customer overpayment applied",
      ]
    );
    const payment = paymentResult.rows[0];

    // 5b. REC journal DR CUST_DEP / CR customer debtor child
    const referenceNo = await generateReceiptReference(client, applyDate);
    const journalResult = await client.query(
      `INSERT INTO journal_entries (
         reference_no, entry_type, entry_date, description,
         total_debit, total_credit, status,
         source_type, source_id, created_at, created_by
       ) VALUES ($1, 'REC', $2, $3, $4, $4, 'posted', 'payment', $5, NOW(), $6)
       RETURNING id`,
      [
        referenceNo,
        applyDate,
        `Overpayment applied - INV/NO: ${a.invoice_id} - ${customerId}`,
        a.amount,
        String(payment.payment_id),
        userId || null,
      ]
    );
    const journalEntryId = journalResult.rows[0].id;
    await client.query(
      `INSERT INTO journal_entry_lines (
         journal_entry_id, line_number, account_code, debit_amount, credit_amount,
         reference, particulars, created_at
       ) VALUES
         ($1, 1, 'CUST_DEP', $2, 0, $3, $4, NOW()),
         ($1, 2, $5, 0, $2, $3, $6, NOW())`,
      [
        journalEntryId,
        a.amount,
        referenceNo,
        `Overpayment applied - ${customerId}`,
        debtorAccount,
        `INV/NO: ${a.invoice_id} - ${customerId}`,
      ]
    );
    await client.query(
      `UPDATE payments SET journal_entry_id = $1 WHERE payment_id = $2`,
      [journalEntryId, payment.payment_id]
    );

    // 5c. Consume excess FIFO + record the distribution for reversal
    for (const take of takeFromExcess(a.amount)) {
      await client.query(
        `UPDATE receipt_allocations SET applied_amount = applied_amount + $2 WHERE id = $1`,
        [take.receipt_allocation_id, take.amount]
      );
      await client.query(
        `INSERT INTO overpayment_applications (payment_id, receipt_allocation_id, amount)
         VALUES ($1, $2, $3)`,
        [payment.payment_id, take.receipt_allocation_id, take.amount]
      );
    }

    // 5d. Invoice balance + customer credit
    const newBalance = round2(Math.max(0, round2(inv.balance_due) - a.amount));
    inv.balance_due = newBalance;
    const newStatus =
      newBalance <= 0
        ? "paid"
        : inv.invoice_status === "Overdue"
        ? "Overdue"
        : "Unpaid";
    inv.invoice_status = newStatus;
    await client.query(
      `UPDATE invoices SET balance_due = $1, invoice_status = $2 WHERE id = $3`,
      [newBalance, newStatus, a.invoice_id]
    );
    if (inv.paymenttype === "INVOICE") {
      await client.query(
        `UPDATE customers SET credit_used = GREATEST(0, COALESCE(credit_used, 0) - $1) WHERE id = $2`,
        [a.amount, customerId]
      );
    }

    createdPayments.push({
      ...payment,
      journal_entry_id: journalEntryId,
      amount_paid: parseFloat(payment.amount_paid),
    });
  }

  return {
    payments: createdPayments,
    customer_id: customerId,
    total_applied: totalApply,
  };
}
