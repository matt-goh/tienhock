// src/services/einvoice-pdf.service.ts
import { api } from "../routes/utils/api";
import { COMPANY_INFO } from "../utils/invoice/einvoice/companyInfo";

interface OrderDetail {
  description: string;
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
    rounding: number;
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
    // Check if this is a consolidated invoice
    if (invoiceId.startsWith("CON-")) {
      return fetchConsolidatedInvoiceDetails(invoiceId);
    }
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
      rounding: 0,
      date: "N/A",
      time: "N/A",
    };
  }
};

// Helper function to fetch consolidated invoice details
const fetchConsolidatedInvoiceDetails = async (invoiceId: string) => {
  try {
    // Parse month and year from consolidated invoice ID (CON-YYYYMM)
    const datePart = invoiceId.substring(4); // e.g., "202503"
    const year = datePart.substring(0, 4);
    const month = datePart.substring(4, 6);

    const formattedDate = `01/${month}/${year}`;

    return {
      date: formattedDate,
      time: "00:00",
      rounding: 0,
    };
  } catch (error) {
    console.error("Error parsing consolidated invoice details:", error);
    return {
      date: "N/A",
      time: "N/A",
      rounding: 0,
    };
  }
};

// Helper function to create consolidated order details
const createConsolidatedOrderDetails = async (einvoiceData: any) => {
  try {
    // Extract date part from the invoice ID (e.g., "202503" from "CON-202503")
    const datePart = einvoiceData.internal_id.substring(4);

    // Format as "03/2025" instead of "202503"
    const year = datePart.substring(0, 4);
    const month = datePart.substring(4, 6);
    const formattedDate = `${month}/${year}`;

    // Convert values to numbers to ensure accurate calculation
    const totalExcludingTax = Number(einvoiceData.total_excluding_tax || 0);
    const totalPayableAmount = Number(einvoiceData.total_payable_amount || 0);
    const rounding = Number(einvoiceData.total_rounding || 0);

    // Check if a specific tax amount is provided
    let taxAmount;
    // Calculate tax accounting for rounding
    taxAmount = totalPayableAmount - totalExcludingTax - rounding;

    return [
      {
        productname: `Consolidated Invoice for ${formattedDate}`,
        description: `Consolidated Invoice for ${formattedDate}`,
        qty: 1,
        price: totalExcludingTax.toString(),
        total: totalPayableAmount.toString(),
        tax: taxAmount.toString(),
      },
    ];
  } catch (error) {
    console.error("Error creating consolidated order details:", error);
    return [];
  }
};

const createConsolidatedCustomerDetails = () => {
  return {
    name: "Consolidated Buyers",
    tin_number: "EI00000000010",
    id_number: "-",
    phone_number: "-",
    email: "-",
    address: "-",
    city: "-",
    state: "",
    id_type: "BRN",
  };
};

// Helper function to fetch order details
const fetchOrderDetails = async (invoiceId: string, einvoiceData?: any) => {
  try {
    // Check if this is a consolidated invoice
    if (invoiceId.startsWith("CON-") && einvoiceData) {
      return createConsolidatedOrderDetails(einvoiceData);
    }
    const response = await api.get(`/api/invoices/details/${invoiceId}/items`);
    // Format the order details to ensure tax values are properly included
    return response.map((item: any) => ({
      ...item,
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
const fetchCustomerDetails = async (
  receiverId: string,
  isConsolidated: boolean = false
) => {
  try {
    // For consolidated invoices, use default customer details
    if (isConsolidated || receiverId === "EI00000000010") {
      return createConsolidatedCustomerDetails();
    }
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
  const isConsolidated =
    einvoiceData.is_consolidated || einvoiceData.internal_id.startsWith("CON-");
  // Fetch customer details
  const [customerDetails, invoiceDetails, orderDetails] = await Promise.all([
    fetchCustomerDetails(einvoiceData.receiver_id, isConsolidated),
    fetchInvoiceDetails(einvoiceData.internal_id),
    // Pass einvoiceData to fetchOrderDetails for consolidated invoices
    fetchOrderDetails(
      einvoiceData.internal_id,
      isConsolidated ? einvoiceData : null
    ),
  ]);

  // Calculate tax amount accounting for rounding
  const subtotal = Number(einvoiceData.total_excluding_tax);
  const total = Number(einvoiceData.total_payable_amount);
  const rounding = einvoiceData.total_rounding || 0;
  let tax = 0;

  // First try to calculate tax from product details if available
  if (orderDetails && orderDetails.length > 0) {
    // Sum product-level taxes
    tax = orderDetails.reduce(
      (sum: number, item: { issubtotal: any; tax: any }) => {
        if (!item.issubtotal) {
          return sum + (Number(item.tax) || 0);
        }
        return sum;
      },
      0
    );
  }

  // If product-level tax calculation is zero or unavailable, use total-based calculation
  if (tax === 0) {
    tax = total - subtotal - rounding;
  }

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
      rounding: rounding,
      date: invoiceDetails.date,
      time: invoiceDetails.time,
    },
    buyer: {
      name: customerDetails.name,
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
    orderDetails: orderDetails,
  };
};
