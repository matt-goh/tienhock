import type {
  AdjustmentDocument,
  ExtendedInvoiceData,
  InvoiceStatus,
} from "../../types/types";

export type InvoiceDisplayStatus =
  | InvoiceStatus
  | "refunded"
  | "partially_refunded"
  | "credit_balance"
  | "credited";

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
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
};
