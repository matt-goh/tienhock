// src/services/einvoice-pdf.service.ts
import { api } from "../routes/utils/api";
import { COMPANY_INFO } from "../utils/invoice/einvoice/companyInfo";

interface OrderDetail {
  productname: string;
  qty: number;
  price: string;
  total: string;
  tax: number;
}

// Types
export interface EInvoicePDFData {
  company: typeof COMPANY_INFO;
  invoice: {
    number: string;
    uuid: string;
    long_id: string;
    type: string;
    datetime_validated: string;
    submission_id: string;
    date: string;
    time: string;
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
  orderDetails: OrderDetail[];
}

// Helper function to fetch invoice details
const fetchInvoiceDetails = async (invoiceId: string) => {
  try {
    // Get the invoice from the main invoices endpoint
    const response = await api.get(`/api/invoices?invoiceId=${invoiceId}`);

    if (!response || !Array.isArray(response) || response.length === 0) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    const invoice = response[0];

    // Format the timestamp into date and time
    const createdDate = new Date(Number(invoice.createddate));
    const day = String(createdDate.getDate()).padStart(2, "0");
    const month = String(createdDate.getMonth() + 1).padStart(2, "0");
    const year = createdDate.getFullYear();

    // Format for display
    const date = `${day}/${month}/${year}`;
    const hours = String(createdDate.getHours()).padStart(2, "0");
    const minutes = String(createdDate.getMinutes()).padStart(2, "0");
    const time = `${hours}:${minutes}`;

    return { date, time };
  } catch (error) {
    console.error("Error fetching invoice details:", error);
    // Return fallback values instead of throwing
    return {
      date: "N/A",
      time: "N/A",
    };
  }
};

// Helper function to fetch order details
const fetchOrderDetails = async (invoiceId: string) => {
  try {
    const response = await api.get(`/api/invoices/details/${invoiceId}/items`);
    // Format the order details to ensure tax values are properly included
    return response.map((item: any) => ({
      ...item,
      productname: item.description || "",
      tax: Number(item.tax || 0),
      qty: Number(item.qty || 0),
      price:
        typeof item.price === "number" ? item.price.toString() : item.price,
      total:
        typeof item.total === "number" ? item.total.toString() : item.total,
    }));
  } catch (error) {
    console.error("Error fetching order details:", error);
    throw error;
  }
};

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
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // Convert 0 to 12

  return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
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
  const [customerDetails, invoiceDetails, orderDetails] = await Promise.all([
    fetchCustomerDetails(einvoiceData.receiver_id),
    fetchInvoiceDetails(einvoiceData.internal_id),
    fetchOrderDetails(einvoiceData.internal_id),
  ]);

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
      datetime_validated: formatDate(einvoiceData.datetime_validated),
      submission_id: einvoiceData.submission_uid,
      date: invoiceDetails.date,
      time: invoiceDetails.time,
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
    orderDetails: orderDetails,
  };
};
