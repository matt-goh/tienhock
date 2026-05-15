/**
 * @typedef {Object} ConsolidatedAmounts
 * @property {number} subtotal
 * @property {number} tax
 * @property {number} rounding
 * @property {number} total
 */

/**
 * @typedef {Object} ConsolidatedReceiptGroup
 * @property {string} description
 * @property {Array<any>} invoices
 * @property {ConsolidatedAmounts} amounts
 */

const EMPTY_AMOUNTS = {
  subtotal: 0,
  tax: 0,
  rounding: 0,
  total: 0,
};

/**
 * @param {unknown} value
 * @returns {number}
 */
export const toAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

/**
 * @param {number} amount
 * @returns {string}
 */
export const formatAmount = (amount) => toAmount(amount).toFixed(2);

/**
 * @param {unknown} value
 * @returns {string}
 */
export const escapeXmlText = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * @param {unknown} invoice
 * @returns {string}
 */
export const getInvoiceReference = (invoice) => {
  if (!invoice || typeof invoice !== "object") {
    return "";
  }

  const source = /** @type {Record<string, unknown>} */ (invoice);
  const reference =
    source.invoice_number ??
    source.internal_id ??
    source.id ??
    source.invoice_id ??
    "";

  return String(reference).trim();
};

/**
 * @param {string} reference
 * @returns {{ numericValue: number, width: number } | null}
 */
const parseNumericReference = (reference) => {
  const matches = reference.match(/\d+/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const numericText = matches[matches.length - 1];
  const numericValue = Number.parseInt(numericText, 10);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return {
    numericValue,
    width: numericText.length,
  };
};

/**
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
const formatReceiptNumber = (value, width) =>
  String(value).padStart(width, "0");

/**
 * @param {ConsolidatedAmounts} left
 * @param {ConsolidatedAmounts} right
 * @returns {ConsolidatedAmounts}
 */
const addAmounts = (left, right) => ({
  subtotal: left.subtotal + right.subtotal,
  tax: left.tax + right.tax,
  rounding: left.rounding + right.rounding,
  total: left.total + right.total,
});

/**
 * @param {Array<any>} invoices
 * @param {(invoice: any) => ConsolidatedAmounts} getAmounts
 * @returns {ConsolidatedReceiptGroup[]}
 */
export const createConsolidatedReceiptGroups = (
  invoices,
  getAmounts = () => EMPTY_AMOUNTS
) => {
  const parsedInvoices = [];
  const unparseableInvoices = [];

  invoices.forEach((invoice, originalIndex) => {
    const reference = getInvoiceReference(invoice);
    const parsedReference = parseNumericReference(reference);
    const amounts = getAmounts(invoice);

    if (!parsedReference) {
      unparseableInvoices.push({
        invoice,
        originalIndex,
        reference: reference || "Unknown receipt",
        amounts,
      });
      return;
    }

    parsedInvoices.push({
      invoice,
      originalIndex,
      numericValue: parsedReference.numericValue,
      width: parsedReference.width,
      amounts,
    });
  });

  parsedInvoices.sort((left, right) => {
    if (left.numericValue !== right.numericValue) {
      return left.numericValue - right.numericValue;
    }

    return left.originalIndex - right.originalIndex;
  });

  const grouped = [];
  let currentGroup = null;

  parsedInvoices.forEach((entry) => {
    const isContinuous =
      currentGroup &&
      (entry.numericValue === currentGroup.endValue ||
        entry.numericValue === currentGroup.endValue + 1);

    if (!isContinuous) {
      currentGroup = {
        startValue: entry.numericValue,
        endValue: entry.numericValue,
        width: entry.width,
        invoices: [],
        amounts: { ...EMPTY_AMOUNTS },
      };
      grouped.push(currentGroup);
    }

    currentGroup.endValue = Math.max(currentGroup.endValue, entry.numericValue);
    currentGroup.width = Math.max(currentGroup.width, entry.width);
    currentGroup.invoices.push(entry.invoice);
    currentGroup.amounts = addAmounts(currentGroup.amounts, entry.amounts);
  });

  const receiptGroups = grouped.map((group) => {
    const start = formatReceiptNumber(group.startValue, group.width);
    const end = formatReceiptNumber(group.endValue, group.width);

    return {
      description: start === end ? start : `${start}-${end}`,
      invoices: group.invoices,
      amounts: group.amounts,
    };
  });

  unparseableInvoices.forEach((entry) => {
    receiptGroups.push({
      description: entry.reference,
      invoices: [entry.invoice],
      amounts: entry.amounts,
    });
  });

  return receiptGroups;
};
