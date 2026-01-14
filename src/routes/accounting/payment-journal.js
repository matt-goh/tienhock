// src/routes/accounting/payment-journal.js
// Helper module for auto-generating journal entries from customer payments

import { determineBankAccount } from '../../utils/payment-helpers.js';

/**
 * Generates the next reference number for receipts
 * Format: REC-YYYYMM-XXXX (e.g., REC-202601-0001)
 */
export async function generateReceiptReference(client, paymentDate) {
  try {
    const date = new Date(paymentDate);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid payment date: ${paymentDate}`);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const yearMonth = `${year}${month}`;
    const pattern = `REC-${yearMonth}-%`;

    const query = `
      SELECT reference_no
      FROM journal_entries
      WHERE reference_no LIKE $1
        AND entry_type = 'REC'
      ORDER BY reference_no DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    const result = await client.query(query, [pattern]);

    let nextNumber = 1;
    if (result.rows.length > 0) {
      // Extract number from reference like "REC-202601-0001"
      const lastRef = result.rows[0].reference_no;
      const match = lastRef.match(/^REC-\d{6}-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const nextReference = `REC-${yearMonth}-${String(nextNumber).padStart(4, "0")}`;
    return nextReference;
  } catch (error) {
    console.error("Error generating receipt reference:", error);
    throw error;
  }
}

/**
 * Determines the debit account based on payment method and bank selection
 * Now uses centralized utility function
 */
function getDebitAccount(payment) {
  return determineBankAccount(payment.payment_method, payment.bank_account);
}

/**
 * Creates a journal entry for a customer payment
 *
 * Journal Structure:
 *   DR Bank/Cash (increase asset)
 *   CR Trade Receivables (decrease asset)
 *
 * @param {Object} client - PostgreSQL client (for transaction support)
 * @param {Object} payment - Payment data
 * @param {number} payment.payment_id - Payment ID
 * @param {number} payment.invoice_id - Invoice ID
 * @param {string} payment.payment_date - Payment date (YYYY-MM-DD)
 * @param {number} payment.amount_paid - Amount paid
 * @param {string} payment.payment_method - Payment method (cash, cheque, bank_transfer, online)
 * @param {string} payment.bank_account - Bank account code (CASH, BANK_PBB, BANK_ABB)
 * @param {string} payment.payment_reference - Customer's reference (optional)
 * @returns {number} journal_entry_id
 */
export async function createPaymentJournalEntry(client, payment) {
  try {
    // Determine debit account (which company bank/cash receives the money)
    const debitAccount = getDebitAccount(payment);
    const creditAccount = 'TR'; // Trade Receivables

    // Validate that required account codes exist and are active
    const validateQuery = `
      SELECT code FROM account_codes
      WHERE code IN ($1, $2) AND is_active = true
    `;
    const validateResult = await client.query(validateQuery, [debitAccount, creditAccount]);

    if (validateResult.rows.length !== 2) {
      const foundCodes = validateResult.rows.map(r => r.code);
      const missing = [debitAccount, creditAccount].filter(code => !foundCodes.includes(code));
      throw new Error(`Required account codes not found or inactive: ${missing.join(', ')}`);
    }

    // Generate reference number
    const reference_no = await generateReceiptReference(client, payment.payment_date);

    // Round amount to 2 decimal places
    const amount = Math.round(parseFloat(payment.amount_paid) * 100) / 100;

    // Build description
    let description = `Payment received - Invoice #${payment.invoice_id}`;
    if (payment.payment_reference) {
      description += ` (Ref: ${payment.payment_reference})`;
    }

    // Insert journal entry header
    const entryQuery = `
      INSERT INTO journal_entries (
        reference_no, entry_type, entry_date, description,
        total_debit, total_credit, status,
        created_at, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
      RETURNING id
    `;

    const entryValues = [
      reference_no,
      'REC', // Receipt type
      payment.payment_date,
      description,
      amount, // total_debit
      amount, // total_credit
      'posted', // Auto-post immediately
      payment.created_by || null
    ];

    const entryResult = await client.query(entryQuery, entryValues);
    const journalEntryId = entryResult.rows[0].id;

    // Insert journal entry lines
    const linesQuery = `
      INSERT INTO journal_entry_lines (
        journal_entry_id, line_number, account_code,
        debit_amount, credit_amount, reference, particulars, created_at
      )
      VALUES
        ($1, 1, $2, $3, 0, $4, $5, NOW()),
        ($1, 2, $6, 0, $7, $4, $8, NOW())
    `;

    const linesValues = [
      journalEntryId,
      debitAccount, // Line 1: DR Bank/Cash
      amount,
      reference_no,
      `Receipt from Invoice #${payment.invoice_id}`,
      creditAccount, // Line 2: CR Trade Receivables
      amount,
      `Payment for Invoice #${payment.invoice_id}`
    ];

    await client.query(linesQuery, linesValues);

    console.log(`✓ Created journal entry ${reference_no} for payment ${payment.payment_id}`);
    return journalEntryId;

  } catch (error) {
    console.error("Error creating payment journal entry:", error);
    throw error;
  }
}

/**
 * Creates a journal entry for an overpaid payment (excess amount)
 *
 * Journal Structure:
 *   DR Bank/Cash (increase asset - money received)
 *   CR Customer Deposits (increase liability - owed to customer)
 *
 * @param {Object} client - PostgreSQL client (for transaction support)
 * @param {Object} payment - Payment data (same structure as createPaymentJournalEntry)
 * @returns {number} journal_entry_id
 */
export async function createOverpaidJournalEntry(client, payment) {
  try {
    // Determine debit account (which company bank/cash receives the money)
    const debitAccount = getDebitAccount(payment);
    const creditAccount = 'CUST_DEP'; // Customer Deposits (liability)

    // Validate that required account codes exist and are active
    const validateQuery = `
      SELECT code FROM account_codes
      WHERE code IN ($1, $2) AND is_active = true
    `;
    const validateResult = await client.query(validateQuery, [debitAccount, creditAccount]);

    if (validateResult.rows.length !== 2) {
      const foundCodes = validateResult.rows.map(r => r.code);
      const missing = [debitAccount, creditAccount].filter(code => !foundCodes.includes(code));
      throw new Error(`Required account codes not found or inactive: ${missing.join(', ')}`);
    }

    // Generate reference number (uses same REC sequence)
    const reference_no = await generateReceiptReference(client, payment.payment_date);

    // Round amount to 2 decimal places
    const amount = Math.round(parseFloat(payment.amount_paid) * 100) / 100;

    // Build description
    let description = `Customer overpayment - Invoice #${payment.invoice_id}`;
    if (payment.payment_reference) {
      description += ` (Ref: ${payment.payment_reference})`;
    }

    // Insert journal entry header
    const entryQuery = `
      INSERT INTO journal_entries (
        reference_no, entry_type, entry_date, description,
        total_debit, total_credit, status,
        created_at, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
      RETURNING id
    `;

    const entryValues = [
      reference_no,
      'REC', // Receipt type
      payment.payment_date,
      description,
      amount, // total_debit
      amount, // total_credit
      'posted', // Auto-post immediately
      payment.created_by || null
    ];

    const entryResult = await client.query(entryQuery, entryValues);
    const journalEntryId = entryResult.rows[0].id;

    // Insert journal entry lines
    const linesQuery = `
      INSERT INTO journal_entry_lines (
        journal_entry_id, line_number, account_code,
        debit_amount, credit_amount, reference, particulars, created_at
      )
      VALUES
        ($1, 1, $2, $3, 0, $4, $5, NOW()),
        ($1, 2, $6, 0, $7, $4, $8, NOW())
    `;

    const linesValues = [
      journalEntryId,
      debitAccount, // Line 1: DR Bank/Cash
      amount,
      reference_no,
      `Overpayment received - Invoice #${payment.invoice_id}`,
      creditAccount, // Line 2: CR Customer Deposits
      amount,
      `Customer deposit from overpayment - Invoice #${payment.invoice_id}`
    ];

    await client.query(linesQuery, linesValues);

    console.log(`✓ Created overpaid journal entry ${reference_no} for payment ${payment.payment_id}`);
    return journalEntryId;

  } catch (error) {
    console.error("Error creating overpaid journal entry:", error);
    throw error;
  }
}

/**
 * Cancels a journal entry (sets status to 'cancelled')
 * Used when a payment is cancelled/reversed
 *
 * @param {Object} client - PostgreSQL client
 * @param {number} journalEntryId - Journal entry ID to cancel
 * @returns {boolean} success
 */
export async function cancelPaymentJournalEntry(client, journalEntryId) {
  try {
    if (!journalEntryId) {
      console.log("No journal entry to cancel");
      return false;
    }

    const query = `
      UPDATE journal_entries
      SET status = 'cancelled',
          updated_at = NOW()
      WHERE id = $1
        AND entry_type = 'REC'
        AND status = 'posted'
      RETURNING id, reference_no
    `;

    const result = await client.query(query, [journalEntryId]);

    if (result.rows.length > 0) {
      console.log(`✓ Cancelled journal entry ${result.rows[0].reference_no}`);
      return true;
    }

    console.log(`Journal entry ${journalEntryId} not found or already cancelled`);
    return false;

  } catch (error) {
    console.error("Error cancelling payment journal entry:", error);
    throw error;
  }
}

/**
 * Helper function to validate journal entry was created correctly
 * Useful for testing
 */
export async function validatePaymentJournal(client, journalEntryId) {
  try {
    const query = `
      SELECT
        je.id, je.reference_no, je.entry_type, je.status,
        je.total_debit, je.total_credit,
        json_agg(
          json_build_object(
            'account_code', jel.account_code,
            'debit', jel.debit_amount,
            'credit', jel.credit_amount
          ) ORDER BY jel.line_number
        ) as lines
      FROM journal_entries je
      JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
      WHERE je.id = $1
      GROUP BY je.id
    `;

    const result = await client.query(query, [journalEntryId]);

    if (result.rows.length === 0) {
      return { valid: false, error: 'Journal entry not found' };
    }

    const entry = result.rows[0];

    // Validate debits = credits
    if (Math.abs(entry.total_debit - entry.total_credit) > 0.01) {
      return {
        valid: false,
        error: `Debits (${entry.total_debit}) != Credits (${entry.total_credit})`
      };
    }

    // Validate has exactly 2 lines
    if (entry.lines.length !== 2) {
      return {
        valid: false,
        error: `Expected 2 lines, got ${entry.lines.length}`
      };
    }

    // Validate one debit, one credit
    const hasDebit = entry.lines.some(line => line.debit > 0);
    const hasCredit = entry.lines.some(line => line.credit > 0);

    if (!hasDebit || !hasCredit) {
      return {
        valid: false,
        error: 'Missing debit or credit line'
      };
    }

    return {
      valid: true,
      entry: entry
    };

  } catch (error) {
    console.error("Error validating payment journal:", error);
    return { valid: false, error: error.message };
  }
}
