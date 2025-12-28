// src/utils/payroll/moneyUtils.ts
// Centralized money utilities using cents-based (sen) arithmetic
// to avoid JavaScript floating-point precision errors.
//
// Example of the problem this solves:
//   10.01 + 10.02 + 10.03 = 30.060000000000002 (wrong!)
// With cents-based arithmetic:
//   1001 + 1002 + 1003 = 3006 -> 30.06 (correct!)

/**
 * Convert dollars/ringgit to cents/sen (integer)
 * @param dollars Amount in dollars/ringgit (e.g., 12.34)
 * @returns Amount in cents/sen as integer (e.g., 1234)
 */
export function toCents(dollars: number): number {
  // Round to avoid floating-point errors during conversion
  return Math.round(dollars * 100);
}

/**
 * Convert cents/sen to dollars/ringgit
 * @param cents Amount in cents/sen (e.g., 1234)
 * @returns Amount in dollars/ringgit (e.g., 12.34)
 */
export function toDollars(cents: number): number {
  return cents / 100;
}

/**
 * Multiply a monetary rate by a quantity using cents-based arithmetic
 * @param rate The rate in dollars/ringgit (e.g., 10.50)
 * @param quantity The multiplier (e.g., hours, units)
 * @returns Result in dollars/ringgit with 2 decimal precision
 */
export function multiplyMoney(rate: number, quantity: number): number {
  // Convert rate to cents, multiply, then convert back
  const rateCents = toCents(rate);
  const resultCents = Math.round(rateCents * quantity);
  return toDollars(resultCents);
}

/**
 * Add two monetary amounts using cents-based arithmetic
 * @param a First amount in dollars/ringgit
 * @param b Second amount in dollars/ringgit
 * @returns Sum in dollars/ringgit with 2 decimal precision
 */
export function addMoney(a: number, b: number): number {
  return toDollars(toCents(a) + toCents(b));
}

/**
 * Sum an array of monetary amounts using cents-based arithmetic
 * @param amounts Array of amounts in dollars/ringgit
 * @returns Sum in dollars/ringgit with 2 decimal precision
 */
export function sumMoney(amounts: number[]): number {
  const totalCents = amounts.reduce((sum, amount) => sum + toCents(amount), 0);
  return toDollars(totalCents);
}

/**
 * Sum monetary values from an array of objects using a selector function
 * Replaces patterns like: items.reduce((sum, item) => sum + item.amount, 0)
 * @param items Array of objects
 * @param selector Function to extract the monetary value from each item
 * @returns Sum in dollars/ringgit with 2 decimal precision
 */
export function sumMoneyBy<T>(
  items: T[],
  selector: (item: T) => number
): number {
  const totalCents = items.reduce(
    (sum, item) => sum + toCents(selector(item)),
    0
  );
  return toDollars(totalCents);
}

/**
 * Calculate a percentage of a base amount using cents-based arithmetic
 * @param base The base amount in dollars/ringgit
 * @param percentage The percentage rate (e.g., 5 for 5%)
 * @returns Result in dollars/ringgit with 2 decimal precision
 */
export function calculatePercentage(base: number, percentage: number): number {
  // Convert base to cents, apply percentage, round, convert back
  const baseCents = toCents(base);
  const resultCents = Math.round((baseCents * percentage) / 100);
  return toDollars(resultCents);
}

/**
 * Round a monetary amount to 2 decimal places
 * Convenience function that replaces Number(value.toFixed(2))
 * @param amount Amount in dollars/ringgit
 * @returns Amount rounded to 2 decimal places
 */
export function roundMoney(amount: number): number {
  return toDollars(toCents(amount));
}
