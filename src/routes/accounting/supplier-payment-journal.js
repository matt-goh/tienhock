// src/routes/accounting/supplier-payment-journal.js
// Helper module for auto-generating journal entries from supplier payments

import { determineBankAccount } from '../../utils/payment-helpers.js';

export async function generatePayReference(client, paymentDate) {
  const date = new Date(paymentDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid payment date: ${paymentDate}`);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const yearMonth = `${year}${month}`;
  const pattern = `PAY-${yearMonth}-%`;

  const result = await client.query(
    `SELECT reference_no
     FROM journal_entries
     WHERE reference_no LIKE $1 AND entry_type = 'PAY'
     ORDER BY reference_no DESC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [pattern]
  );

  let nextNumber = 1;
  if (result.rows.length > 0) {
    const match = result.rows[0].reference_no.match(/^PAY-\d{6}-(\d+)$/);
    if (match) nextNumber = Number.parseInt(match[1], 10) + 1;
  }
  return `PAY-${yearMonth}-${String(nextNumber).padStart(4, '0')}`;
}

export async function generatePVReference(client, paymentDate) {
  const date = new Date(paymentDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid payment date: ${paymentDate}`);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const yearMonth = `${year}${month}`;
  const pattern = `PV-${yearMonth}-%`;

  const result = await client.query(
    `SELECT internal_reference
     FROM supplier_payments
     WHERE internal_reference LIKE $1
     ORDER BY internal_reference DESC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [pattern]
  );

  let nextNumber = 1;
  if (result.rows.length > 0) {
    const match = result.rows[0].internal_reference.match(/^PV-\d{6}-(\d+)$/);
    if (match) nextNumber = Number.parseInt(match[1], 10) + 1;
  }
  return `PV-${yearMonth}-${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Creates a journal entry for a supplier payment.
 *
 * Journal structure:
 *   DR Trade Payables (TP) — decrease liability
 *   CR Bank/Cash         — decrease asset (money leaves)
 */
export async function createSupplierPaymentJournalEntry(
  client,
  payment,
  supplierLabel,
  invoiceDocNo
) {
  const debitAccount = 'TP';
  const creditAccount = determineBankAccount(
    payment.payment_method,
    payment.bank_account
  );

  // Validate both account codes
  const validateResult = await client.query(
    `SELECT code FROM account_codes WHERE code IN ($1, $2) AND is_active = true`,
    [debitAccount, creditAccount]
  );
  if (validateResult.rows.length !== 2) {
    const found = validateResult.rows.map((r) => r.code);
    const missing = [debitAccount, creditAccount].filter(
      (code) => !found.includes(code)
    );
    throw new Error(
      `Required account codes not found or inactive: ${missing.join(', ')}`
    );
  }

  const referenceNo = await generatePayReference(client, payment.payment_date);
  const amount = Math.round(parseFloat(payment.amount_paid) * 100) / 100;

  const supplier = supplierLabel?.trim() || 'supplier';
  const docNo = invoiceDocNo || `Invoice #${payment.invoice_id}`;
  let description = `Payment to ${supplier} - ${docNo}`;
  if (payment.payment_reference) {
    description += ` (Ref: ${payment.payment_reference})`;
  }

  const entryResult = await client.query(
    `INSERT INTO journal_entries (
       reference_no, entry_type, entry_date, description,
       total_debit, total_credit, status, created_at, created_by
     ) VALUES ($1, 'PAY', $2, $3, $4, $5, 'posted', NOW(), $6)
     RETURNING id`,
    [
      referenceNo,
      payment.payment_date,
      description,
      amount,
      amount,
      payment.created_by || null,
    ]
  );
  const journalEntryId = entryResult.rows[0].id;

  await client.query(
    `INSERT INTO journal_entry_lines (
       journal_entry_id, line_number, account_code,
       debit_amount, credit_amount, reference, particulars, created_at
     ) VALUES
       ($1, 1, $2, $3, 0, $4, $5, NOW()),
       ($1, 2, $6, 0, $3, $4, $7, NOW())`,
    [
      journalEntryId,
      debitAccount,
      amount,
      referenceNo,
      `Settle payable - ${docNo}`,
      creditAccount,
      `Payment to ${supplier} - ${docNo}`,
    ]
  );

  return { journalEntryId, referenceNo };
}

/**
 * Cancels a supplier-payment journal entry (sets status to 'cancelled').
 */
export async function cancelSupplierPaymentJournalEntry(client, journalEntryId) {
  if (!journalEntryId) return false;
  const result = await client.query(
    `UPDATE journal_entries
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND entry_type = 'PAY' AND status = 'posted'
     RETURNING id`,
    [journalEntryId]
  );
  return result.rows.length > 0;
}
