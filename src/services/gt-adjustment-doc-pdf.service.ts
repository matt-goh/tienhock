// src/services/gt-adjustment-doc-pdf.service.ts
// Prepares a Green Target adjustment doc for rendering by GTAdjustmentDocPDF.
// Fetches the GT customer from /greentarget/api/customers/:id to populate
// the BILLING TO box.
import { api } from "../routes/utils/api";
import type {
  AdjustmentDocType,
  AdjustmentDocument,
  EInvoiceStatus,
} from "../types/types";
import { GTAdjustmentDocPDFData } from "../utils/greenTarget/PDF/AdjustmentDocs/GTAdjustmentDocPDF";

export interface GTAdjustmentDocFull {
  id: string;
  type: AdjustmentDocType;
  original_invoice_id: number;
  original_invoice_number: string;
  customer_id: number | null;
  customer_name: string | null;
  date_issued: string;
  reason: string | null;
  amount_before_tax: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  refund_method: string | null;
  refund_reference: string | null;
  bank_account: string | null;
  uuid: string | null;
  long_id: string | null;
  datetime_validated: string | null;
  einvoice_status: EInvoiceStatus;
  status: AdjustmentDocument["status"];
  lines?: Array<{
    id?: number;
    line_number?: number;
    description: string | null;
    quantity: number | string | null;
    price: number | string | null;
    tax: number | string | null;
    total: number | string | null;
    issubtotal: boolean;
  }>;
}

const formatIsoDate = (s: string | null | undefined): string => {
  if (!s) return "—";
  // `s` may be a full UTC ISO string from a `date` column; read local fields
  // (CLAUDE.md rule 17) — slicing would keep the UTC (previous) day.
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
};

const fetchGTCustomer = async (customerId: number | null): Promise<any> => {
  if (!customerId) return null;
  try {
    return await api.get(`/greentarget/api/customers/${customerId}`);
  } catch (error) {
    console.error("Error fetching GT customer for adjustment doc PDF:", error);
    return null;
  }
};

export const prepareGTAdjustmentDocPDFData = async (
  doc: GTAdjustmentDocFull
): Promise<GTAdjustmentDocPDFData> => {
  const customer = await fetchGTCustomer(doc.customer_id);

  const refund =
    doc.type === "refund_note"
      ? {
          method: doc.refund_method,
          bank_account: doc.bank_account,
          reference: doc.refund_reference,
        }
      : undefined;

  const orderDetails = (doc.lines || [])
    .filter((line) => !line.issubtotal)
    .map((line) => ({
      description: line.description || "",
      qty: Number(line.quantity) || 0,
      price: Number(line.price) || 0,
      total: Number(line.total) || 0,
      tax: Number(line.tax) || 0,
    }));

  return {
    doc: {
      id: doc.id,
      type: doc.type,
      originalInvoiceNumber: doc.original_invoice_number,
      uuid: doc.uuid || "",
      long_id: doc.long_id || "",
      datetime_validated: doc.datetime_validated || "",
      date: formatIsoDate(doc.date_issued),
      reason: doc.reason,
      refund,
    },
    buyer: {
      name:
        (customer && customer.name) ||
        doc.customer_name ||
        (doc.customer_id ? `#${doc.customer_id}` : "-"),
      tin: (customer && customer.tin_number) || "",
      reg_no: (customer && customer.id_number) || "",
      address: (customer && customer.additional_info) || "",
      contact: (customer && customer.phone_number) || "",
      email: (customer && customer.email) || "",
    },
    amounts: {
      subtotal: Number(doc.amount_before_tax) || 0,
      tax: Number(doc.tax_amount) || 0,
      total: Number(doc.total_amount) || 0,
    },
    orderDetails,
  };
};
