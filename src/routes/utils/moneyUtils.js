// src/routes/utils/moneyUtils.js
// Centralized money utilities using cents-based (sen) arithmetic
// to avoid JavaScript floating-point precision errors.
//
// Example of the problem this solves:
//   10.01 + 10.02 + 10.03 = 30.060000000000002 (wrong!)
// With cents-based arithmetic:
//   1001 + 1002 + 1003 = 3006 -> 30.06 (correct!)

/**
 * Convert dollars/ringgit to cents/sen (integer)
 * @param {number} dollars Amount in dollars/ringgit (e.g., 12.34)
 * @returns {number} Amount in cents/sen as integer (e.g., 1234)
 */
export function toCents(dollars) {
  // Round to avoid floating-point errors during conversion
  return Math.round(dollars * 100);
}

/**
 * Convert cents/sen to dollars/ringgit
 * @param {number} cents Amount in cents/sen (e.g., 1234)
 * @returns {number} Amount in dollars/ringgit (e.g., 12.34)
 */
export function toDollars(cents) {
  return cents / 100;
}

/**
 * Multiply a monetary rate by a quantity using cents-based arithmetic
 * @param {number} rate The rate in dollars/ringgit (e.g., 10.50)
 * @param {number} quantity The multiplier (e.g., hours, units)
 * @returns {number} Result in dollars/ringgit with 2 decimal precision
 */
export function multiplyMoney(rate, quantity) {
  // Convert rate to cents, multiply, then convert back
  const rateCents = toCents(rate);
  const resultCents = Math.round(rateCents * quantity);
  return toDollars(resultCents);
}

/**
 * Add two monetary amounts using cents-based arithmetic
 * @param {number} a First amount in dollars/ringgit
 * @param {number} b Second amount in dollars/ringgit
 * @returns {number} Sum in dollars/ringgit with 2 decimal precision
 */
export function addMoney(a, b) {
  return toDollars(toCents(a) + toCents(b));
}

/**
 * Sum an array of monetary amounts using cents-based arithmetic
 * @param {number[]} amounts Array of amounts in dollars/ringgit
 * @returns {number} Sum in dollars/ringgit with 2 decimal precision
 */
export function sumMoney(amounts) {
  const totalCents = amounts.reduce((sum, amount) => sum + toCents(amount), 0);
  return toDollars(totalCents);
}

/**
 * Sum monetary values from an array of objects using a selector function
 * Replaces patterns like: items.reduce((sum, item) => sum + item.amount, 0)
 * @param {Array} items Array of objects
 * @param {Function} selector Function to extract the monetary value from each item
 * @returns {number} Sum in dollars/ringgit with 2 decimal precision
 */
export function sumMoneyBy(items, selector) {
  const totalCents = items.reduce(
    (sum, item) => sum + toCents(selector(item)),
    0
  );
  return toDollars(totalCents);
}

/**
 * Calculate a percentage of a base amount using cents-based arithmetic
 * @param {number} base The base amount in dollars/ringgit
 * @param {number} percentage The percentage rate (e.g., 5 for 5%)
 * @returns {number} Result in dollars/ringgit with 2 decimal precision
 */
export function calculatePercentage(base, percentage) {
  // Convert base to cents, apply percentage, round, convert back
  const baseCents = toCents(base);
  const resultCents = Math.round((baseCents * percentage) / 100);
  return toDollars(resultCents);
}

/**
 * Round a monetary amount to 2 decimal places
 * Convenience function that replaces Number(value.toFixed(2))
 * @param {number} amount Amount in dollars/ringgit
 * @returns {number} Amount rounded to 2 decimal places
 */
export function roundMoney(amount) {
  return toDollars(toCents(amount));
}
