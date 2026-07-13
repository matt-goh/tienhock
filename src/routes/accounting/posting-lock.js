// Tien Hock's imported accounting history ends on 2026-05-31. Mutations that
// would post to, reverse, or rewrite that history must stay behind this guard.

export const TIEN_HOCK_ACCOUNTING_OPEN_DATE = "2026-06-01";
export const ACCOUNTING_PERIOD_LOCKED_CODE = "ACCOUNTING_PERIOD_LOCKED";

/**
 * Convert a supported date value to the server's LOCAL yyyy-MM-dd date.
 * Exact date-only strings pass through without a UTC round-trip.
 *
 * @param {string|number|Date} value
 * @returns {string}
 */
export function toLocalAccountingDateString(value) {
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]);
      const day = Number(dateOnlyMatch[3]);
      const validationDate = new Date(year, month - 1, day);
      if (
        validationDate.getFullYear() !== year ||
        validationDate.getMonth() !== month - 1 ||
        validationDate.getDate() !== day
      ) {
        throw new Error(`Invalid accounting date: ${value}`);
      }
      return trimmedValue;
    }
  }

  const parsedDate =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? new Date(Number(value.trim()))
      : value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);
  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid accounting date: ${value}`);
  }

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Assert that a Tien Hock accounting mutation falls in the open period.
 *
 * @param {string|number|Date} value
 * @param {string} [operation]
 * @returns {string} The normalized local date.
 */
export function assertTienHockAccountingDateUnlocked(
  value,
  operation = "Accounting transaction"
) {
  const transactionDate = toLocalAccountingDateString(value);
  if (transactionDate < TIEN_HOCK_ACCOUNTING_OPEN_DATE) {
    const error = new Error(
      `The Tien Hock accounting period before ${TIEN_HOCK_ACCOUNTING_OPEN_DATE} is locked. ${operation} dated ${transactionDate} cannot be changed.`
    );
    error.name = "AccountingPeriodLockedError";
    error.status = 409;
    error.code = ACCOUNTING_PERIOD_LOCKED_CODE;
    error.accounting_date = transactionDate;
    error.open_date = TIEN_HOCK_ACCOUNTING_OPEN_DATE;
    throw error;
  }
  return transactionDate;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isAccountingPeriodLockedError(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      error.code === ACCOUNTING_PERIOD_LOCKED_CODE
  );
}
