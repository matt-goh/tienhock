import { toLocalAccountingDateString } from "../accounting/posting-lock.js";

export const CHEQUE_CLEARANCE_DATE_REQUIRED_CODE =
  "CHEQUE_CLEARANCE_DATE_REQUIRED";
export const CHEQUE_CLEARANCE_DATE_INVALID_CODE =
  "CHEQUE_CLEARANCE_DATE_INVALID";

/**
 * @param {string} message
 * @param {string} code
 * @returns {Error}
 */
function createClearanceDateError(message, code) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

/**
 * Require an actual bank-clearance date for a pending cheque.
 *
 * @param {unknown} value
 * @param {string|number|Date} receivedDate
 * @returns {string}
 */
export function requireChequeClearanceDate(value, receivedDate) {
  const clearanceDateValue = typeof value === "string" ? value.trim() : "";
  if (!clearanceDateValue) {
    throw createClearanceDateError(
      "Cheque Clearance Date is required. Select the date the cheque actually cleared the bank.",
      CHEQUE_CLEARANCE_DATE_REQUIRED_CODE
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clearanceDateValue)) {
    throw createClearanceDateError(
      "Cheque Clearance Date must be a valid date in yyyy-MM-dd format.",
      CHEQUE_CLEARANCE_DATE_INVALID_CODE
    );
  }

  let clearanceDate;
  try {
    clearanceDate = toLocalAccountingDateString(clearanceDateValue);
  } catch (_error) {
    throw createClearanceDateError(
      "Cheque Clearance Date must be a valid date in yyyy-MM-dd format.",
      CHEQUE_CLEARANCE_DATE_INVALID_CODE
    );
  }

  const normalizedReceivedDate =
    toLocalAccountingDateString(receivedDate);
  if (clearanceDate < normalizedReceivedDate) {
    throw createClearanceDateError(
      `Cheque Clearance Date cannot be before the received date (${normalizedReceivedDate}).`,
      CHEQUE_CLEARANCE_DATE_INVALID_CODE
    );
  }

  const today = toLocalAccountingDateString(new Date());
  if (clearanceDate > today) {
    throw createClearanceDateError(
      "Cheque Clearance Date cannot be in the future.",
      CHEQUE_CLEARANCE_DATE_INVALID_CODE
    );
  }

  return clearanceDate;
}
