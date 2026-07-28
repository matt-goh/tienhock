import type {
  AdjustmentDocument,
  ExtendedInvoiceData,
  InvoiceStatus,
  ProductItem,
  ZeroValueKind,
} from "../../types/types";

export type { ZeroValueKind };

export type InvoiceDisplayStatus =
  | InvoiceStatus
  | "refunded"
  | "partially_refunded"
  | "credit_balance"
  | "credited"
  | ZeroValueKind;

const MONEY_TOLERANCE: number = 0.005;

const roundMoney = (amount: number): number => Number(amount.toFixed(2));

const getActiveAdjustmentDocs = (
  adjustmentDocs: AdjustmentDocument[]
): AdjustmentDocument[] =>
  adjustmentDocs.filter(
    (doc: AdjustmentDocument) => doc.status === "active" && !doc.is_consolidated
  );

const getActivePairedRefundTotal = (
  adjustmentDocs: AdjustmentDocument[]
): number =>
  getActiveAdjustmentDocs(adjustmentDocs)
    .filter((doc: AdjustmentDocument) => {
      if (doc.type !== "refund_note") return false;
      if (!doc.paired_with_id) return false;
      return doc.paired_status === "active";
    })
    .reduce((sum: number, doc: AdjustmentDocument) => {
      return sum + Number(doc.totalamountpayable || 0);
    }, 0);

const hasActiveUnrefundedCreditNote = (
  adjustmentDocs: AdjustmentDocument[]
): boolean =>
  getActiveAdjustmentDocs(adjustmentDocs).some(
    (doc: AdjustmentDocument) =>
      doc.type === "credit_note" && doc.paired_status !== "active"
  );

/**
 * A bill that totals RM0.00 carries no sales value, so MyInvois rejects it as an
 * individual e-Invoice - the monthly consolidated e-Invoice covers it instead.
 * The stored total is a safe test: it never disagrees with the amount the
 * e-Invoice would declare about being zero.
 */
export const isZeroValueBill = (invoice: ExtendedInvoiceData): boolean =>
  roundMoney(Number(invoice.totalamountpayable || 0)) === 0;

/**
 * Classifies WHY a bill is RM0.00, for display. Returns null for a bill that
 * carries value.
 *
 * List pages get `zero_value_kind` from the API (line items are not fetched
 * there); detail and form pages compute it from the loaded line items.
 */
export const getZeroValueKind = (
  invoice: ExtendedInvoiceData
): ZeroValueKind | null => {
  if (!isZeroValueBill(invoice)) return null;

  if (invoice.zero_value_kind) return invoice.zero_value_kind;

  const lineItems: ProductItem[] = (invoice.products || []).filter(
    (item: ProductItem) => !item.issubtotal && !item.istotal
  );
  if (lineItems.length === 0) return "zero_value";

  const hasGoods: boolean = lineItems.some(
    (item: ProductItem) =>
      Number(item.quantity || 0) > 0 || Number(item.freeProduct || 0) > 0
  );
  if (hasGoods) return "free_goods";

  const hasReturn: boolean = lineItems.some(
    (item: ProductItem) => Number(item.returnProduct || 0) > 0
  );
  return hasReturn ? "returns_only" : "zero_value";
};

/**
 * The explanation shown on the invoice details page for why a RM0.00 bill does
 * not need its own e-Invoice. Null when the bill carries value.
 */
export const getZeroValueNote = (kind: ZeroValueKind | null): string | null => {
  if (kind === "returns_only") {
    return "This bill only records returned products and carries no sales value, so it does not need its own e-Invoice.";
  }
  if (kind === "free_goods") {
    return "This bill only records goods given away free and carries no sales value, so it does not need its own e-Invoice.";
  }
  if (kind === "zero_value") {
    return "This bill totals RM0.00 and carries no sales value, so it does not need its own e-Invoice.";
  }
  return null;
};

export const isInvoiceFullyRefunded = (
  invoice: ExtendedInvoiceData,
  adjustmentDocs: AdjustmentDocument[]
): boolean => {
  if (invoice.invoice_status === "cancelled") return false;
  if (roundMoney(Number(invoice.balance_due || 0)) !== 0) return false;

  const invoiceTotal: number = roundMoney(
    Number(invoice.totalamountpayable || 0)
  );
  if (invoiceTotal <= 0) return false;

  const pairedRefundTotal: number = getActivePairedRefundTotal(adjustmentDocs);

  return roundMoney(pairedRefundTotal) >= invoiceTotal - MONEY_TOLERANCE;
};

export const getInvoiceDisplayStatus = (
  invoice: ExtendedInvoiceData,
  adjustmentDocs: AdjustmentDocument[]
): InvoiceDisplayStatus => {
  if (invoice.invoice_status === "cancelled") return invoice.invoice_status;

  const zeroValueKind: ZeroValueKind | null = getZeroValueKind(invoice);
  if (zeroValueKind) return zeroValueKind;

  const balanceDue: number = roundMoney(Number(invoice.balance_due || 0));
  const invoiceTotal: number = roundMoney(
    Number(invoice.totalamountpayable || 0)
  );
  const pairedRefundTotal: number = roundMoney(
    getActivePairedRefundTotal(adjustmentDocs)
  );

  if (
    balanceDue === 0 &&
    invoiceTotal > 0 &&
    pairedRefundTotal >= invoiceTotal - MONEY_TOLERANCE
  ) {
    return "refunded";
  }

  if (
    balanceDue === 0 &&
    pairedRefundTotal > MONEY_TOLERANCE &&
    pairedRefundTotal < invoiceTotal - MONEY_TOLERANCE
  ) {
    return "partially_refunded";
  }

  if (hasActiveUnrefundedCreditNote(adjustmentDocs)) {
    return balanceDue < 0 ? "credit_balance" : "credited";
  }

  return invoice.invoice_status;
};

export const getInvoiceDisplayStatusLabel = (
  status: InvoiceDisplayStatus
): string => {
  if (status === "refunded") return "Refunded";
  if (status === "partially_refunded") return "Partially Refunded";
  if (status === "credit_balance") return "Credit Balance";
  if (status === "credited") return "Credited";
  if (status === "returns_only") return "Returns Only";
  if (status === "free_goods") return "Free Goods";
  if (status === "zero_value") return "Zero Value";
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
};
