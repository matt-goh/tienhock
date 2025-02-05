// src/services/einvoice-pdf.service.ts
import { api } from "../routes/utils/api";

// Static company configuration
export const COMPANY_INFO = {
  name: "TIEN HOCK FOOD INDUSTRIES S/B",
  tin: "C21636482050",
  reg_no: "201101025173",
  sst_id: "N/A",
  msic_code: "10741",
  address: "CL.215145645, KG KIBABAIG, PENAMPANG",
  city: "Kota Kinabalu",
  postcode: "88811",
  state: "Sabah",
  phone: "0168329291",
  email: "tienhockfood@gmail.com",
};

// Types
export interface EInvoicePDFData {
  company: typeof COMPANY_INFO;
  invoice: {
    number: string;
    uuid: string;
    long_id: string;
    type: string;
    date: string;
    submission_id: string;
  };
  buyer: {
    name: string;
    tin: string;
    reg_no: string;
    sst_no: string | null;
    address: string;
    city: string;
    state: string;
    contact: string;
    email: string;
  };
  amounts: {
    subtotal: number;
    tax: number;
    total: number;
  };
}

// Helper function to fetch customer details
const fetchCustomerDetails = async (receiverId: string) => {
  try {
    const response = await api.get(`/api/customers/by-tin/${receiverId}`);
    return response;
  } catch (error) {
    console.error("Error fetching customer details:", error);
    // Return default structure if customer not found
    return {
      name: "",
      tin_number: "",
      id_number: "",
      phone_number: "",
      email: "",
      address: "",
      city: "",
      state: "",
    };
  }
};

// Format date helper
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-MY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

// Format currency helper
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(amount);
};

// Main function to prepare PDF data
export const preparePDFData = async (
  einvoiceData: any
): Promise<EInvoicePDFData> => {
  // Fetch customer details
  const customerDetails = await fetchCustomerDetails(einvoiceData.receiver_id);

  // Calculate tax amount
  const subtotal = Number(einvoiceData.total_excluding_tax);
  const total = Number(einvoiceData.total_payable_amount);
  const tax = total - subtotal;

  // Combine all data
  return {
    company: COMPANY_INFO,
    invoice: {
      number: einvoiceData.internal_id,
      uuid: einvoiceData.uuid,
      long_id: einvoiceData.long_id,
      type: einvoiceData.type_name,
      date: formatDate(einvoiceData.datetime_validated),
      submission_id: einvoiceData.submission_uid,
    },
    buyer: {
      name: customerDetails.name,
      tin: customerDetails.tin_number || "",
      reg_no: customerDetails.id_number || "",
      sst_no: customerDetails.sst_no || "N/A",
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
  };
};
