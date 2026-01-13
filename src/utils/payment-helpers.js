// src/utils/payment-helpers.js
// Utility functions for payment processing

/**
 * Determines the appropriate bank account code based on payment method
 *
 * @param {string} paymentMethod - Payment method (cash, cheque, bank_transfer, online)
 * @param {string} bankAccount - User-selected bank account (BANK_PBB or BANK_ABB)
 * @returns {string} Account code (CASH, BANK_PBB, or BANK_ABB)
 */
export function determineBankAccount(paymentMethod, bankAccount) {
  if (paymentMethod === 'cash') {
    return 'CASH';
  }
  // For non-cash payments, use selected bank or default to Public Bank
  return bankAccount || 'BANK_PBB';
}

/**
 * Validates a bank account code
 *
 * @param {string} bankAccount - Bank account code
 * @returns {boolean} True if valid
 */
export function isValidBankAccount(bankAccount) {
  const validAccounts = ['CASH', 'BANK_PBB', 'BANK_ABB'];
  return validAccounts.includes(bankAccount);
}
