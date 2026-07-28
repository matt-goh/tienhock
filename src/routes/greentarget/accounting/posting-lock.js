// src/routes/greentarget/accounting/posting-lock.js
//
// Green Target posting lock (phase G7, handover R8). Clone of Tien Hock's
// `src/routes/accounting/posting-lock.js` with GT's own open date: GT's
// imported accounting history ends on 2026-06-30 and organic posting starts
// 2026-07-01 (handover R2). Mutations dated before the open date must stay
// behind this guard.
//
// Deliberate divergence from TH: TH applies its lock narrowly (manual journal
// create/update/cancel are NOT guarded, only restore is). GT guards every
// mutation path including manual journals, because the G7 gate is "pre-1-Jul
// mutations return 409" and an unguarded back-dated manual journal would
// silently rewrite the hash-pinned Jan-Jun parity. Direct SQL/migrations
// bypass this by design, exactly like TH.

export const GREEN_TARGET_ACCOUNTING_OPEN_DATE = "2026-07-01";
export const ACCOUNTING_PERIOD_LOCKED_CODE = "ACCOUNTING_PERIOD_LOCKED";

/**
 * Convert a supported date value to the server's LOCAL yyyy-MM-dd date.
 * Exact date-only strings pass through without a UTC round-trip.
 * (Clone of TH's toLocalAccountingDateString — cloned, not imported, per the
 * GT isolation principle.)
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
 * Assert that a Green Target accounting mutation falls in the open period.
 *
 * @param {string|number|Date} value
 * @param {string} [operation]
 * @returns {string} The normalized local date.
 */
export function assertGreenTargetAccountingDateUnlocked(
  value,
  operation = "Accounting transaction"
) {
  const transactionDate = toLocalAccountingDateString(value);
  if (transactionDate < GREEN_TARGET_ACCOUNTING_OPEN_DATE) {
    const error = new Error(
      `The Green Target accounting period before ${GREEN_TARGET_ACCOUNTING_OPEN_DATE} is locked. ${operation} dated ${transactionDate} cannot be changed.`
    );
    error.name = "AccountingPeriodLockedError";
    error.status = 409;
    // GT's operational routes read either error.status or error.statusCode.
    error.statusCode = 409;
    error.code = ACCOUNTING_PERIOD_LOCKED_CODE;
    error.accounting_date = transactionDate;
    error.open_date = GREEN_TARGET_ACCOUNTING_OPEN_DATE;
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
