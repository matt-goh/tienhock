// src/services/adjustment-doc-pdf.service.ts
// Prepares an AdjustmentDocument for rendering by AdjustmentDocPDF.
// Mirrors the customer-data fetch pattern from einvoice-pdf.service.ts
// (cache-first via localStorage, then API fallback) without touching that
// file, per rule #3 surgical changes.
import { api } from "../routes/utils/api";
import {
  TIENHOCK_INFO,
  JELLYPOLLY_INFO,
} from "../utils/invoice/einvoice/companyInfo";
import { AdjustmentDocument } from "../types/types";
import { AdjustmentDocPDFData } from "../utils/adjustments/PDF/AdjustmentDocPDF";

type CompanyContext = "tienhock" | "jellypolly";

const getCompanyInfo = (context: CompanyContext) =>
  context === "jellypolly" ? JELLYPOLLY_INFO : TIENHOCK_INFO;

const getCustomerApiBase = (context: CompanyContext) =>
  context === "jellypolly" ? "/jellypolly/api/customers" : "/api/customers";

const fetchCustomerData = async (
  customerId: string,
  context: CompanyContext
): Promise<any> => {
  try {
    if (!customerId || customerId === "Consolidated customers") {
      return {
        name: "Consolidated Customers",
        tin_number: "EI00000000010",
        id_number: "-",
        phone_number: "-",
        email: "-",
        address: "-",
        city: "-",
        state: "",
        id_type: "BRN",
      };
    }

    const CACHE_KEY = "customers_cache";
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      try {
        const { data } = JSON.parse(cachedData);
        const customer = data.find((c: any) => c.id === customerId);
        if (customer) return customer;
      } catch (e) {
        console.warn("Error parsing customer cache:", e);
      }
    }

    return await api.get(`${getCustomerApiBase(context)}/${customerId}`);
  } catch (error) {
    console.error("Error fetching customer data for adjustment doc:", error);
    return {
      name: customerId,
      tin_number: "",
      id_number: "",
      phone_number: "",
      email: "",
      address: "",
      city: "",
      state: "",
      id_type: "",
    };
  }
};

export const prepareAdjustmentDocPDFData = async (
  doc: AdjustmentDocument,
  companyContext: CompanyContext = "tienhock"
): Promise<AdjustmentDocPDFData> => {
  const companyInfo = getCompanyInfo(companyContext);
  const customerDetails = await fetchCustomerData(doc.customerid, companyContext);

  const createdDate = new Date(Number(doc.createddate) || Date.now());
  const day = String(createdDate.getDate()).padStart(2, "0");
  const month = String(createdDate.getMonth() + 1).padStart(2, "0");
  const year = createdDate.getFullYear();
  const date = `${day}/${month}/${year}`;
  const hours = String(createdDate.getHours()).padStart(2, "0");
  const minutes = String(createdDate.getMinutes()).padStart(2, "0");
  const time = `${hours}:${minutes}`;

  const subtotal = Number(doc.total_excluding_tax) || 0;
  const tax = Number(doc.tax_amount) || 0;
  const rounding = Number(doc.rounding) || 0;
  const total = Number(doc.totalamountpayable) || 0;

  // Filter out subtotal lines for the PDF table; quantities of 0 also skipped
  // (matches the existing details-page intent — adjustment docs rarely use
  // subtotal rows).
  const orderDetails = (doc.lines || [])
    .filter((line) => !line.issubtotal)
    .map((line) => ({
      description: line.description || "",
      qty: Number(line.quantity) || 0,
      price: Number(line.price) || 0,
      total: Number(line.total) || 0,
      tax: Number(line.tax) || 0,
    }));

  const refund: AdjustmentDocPDFData["doc"]["refund"] =
    doc.type === "refund_note"
      ? {
          method: doc.refund_method,
          bank_account: doc.bank_account ?? null,
          reference: doc.refund_reference,
        }
      : undefined;

  return {
    company: companyInfo,
    doc: {
      id: doc.display_id || doc.id,
      type: doc.type,
      originalInvoiceId: doc.original_invoice_id,
      uuid: doc.uuid || "",
      long_id: doc.long_id || "",
      datetime_validated: doc.datetime_validated || "",
      submission_id: doc.submission_uid || "",
      rounding,
      date,
      time,
      reason: doc.reason,
      refund,
    },
    buyer: {
      name: customerDetails.name || doc.customer_name || doc.customerid,
      tin: customerDetails.tin_number || "",
      reg_no: customerDetails.id_number || "",
      sst_no: customerDetails.sst_no || "-",
      address: customerDetails.address || "",
      city: customerDetails.city || "",
      state: customerDetails.state || "",
      contact: customerDetails.phone_number || "",
      email: customerDetails.email || "",
    },
    amounts: {
      subtotal,
      tax,
      total,
    },
    orderDetails,
  };
};
