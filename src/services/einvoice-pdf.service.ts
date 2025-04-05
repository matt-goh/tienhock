// src/services/einvoice-pdf.service.ts
import { api } from "../routes/utils/api";
import {
  TIENHOCK_INFO,
  GREENTARGET_INFO,
} from "../utils/invoice/einvoice/companyInfo";
import { ExtendedInvoiceData } from "../types/types";

// Interface for PDF data structure
export interface EInvoicePDFData {
  company: typeof TIENHOCK_INFO;
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
  orderDetails: Array<{
    description: string;
    qty: number;
    price: string | number;
    total: string | number;
    tax: number;
  }>;
}

// Fetch customer data from API
const fetchCustomerData = async (customerId: string): Promise<any> => {
  try {
    // Check if customer ID is valid
    if (!customerId || customerId === "Consolidated customers") {
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
    }

    const customerData = await api.get(`/api/customers/${customerId}`);
    return customerData;
  } catch (error) {
    console.error("Error fetching customer data:", error);
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

// Helper function to format date
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

// Helper function to create consolidated order details
const createConsolidatedOrderDetails = async (einvoiceData: any) => {
  try {
    // Extract date part from the invoice ID (e.g., "202503" from "CON-202503")
    const datePart = einvoiceData.internal_id
      ? einvoiceData.internal_id.substring(4)
      : einvoiceData.id
      ? einvoiceData.id.substring(4)
      : "";

    // Format as "03/2025" instead of "202503"
    const year = datePart.substring(0, 4);
    const month = datePart.substring(4, 6);
    const formattedDate = `${month}/${year}`;

    // Convert values to numbers to ensure accurate calculation
    const totalExcludingTax = Number(einvoiceData.total_excluding_tax || 0);
    const totalPayableAmount = Number(
      einvoiceData.total_payable_amount || einvoiceData.totalamountpayable || 0
    );
    const rounding = Number(
      einvoiceData.total_rounding || einvoiceData.rounding || 0
    );

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
        tax: taxAmount,
      },
    ];
  } catch (error) {
    console.error("Error creating consolidated order details:", error);
    return [];
  }
};

// Original function to prepare PDF data from standard e-invoice format
export const preparePDFData = async (
  einvoiceData: any
): Promise<EInvoicePDFData> => {
  const isConsolidated =
    einvoiceData.is_consolidated ||
    (einvoiceData.internal_id && einvoiceData.internal_id.startsWith("CON-"));

  try {
    // Fetch customer data
    const customerId = einvoiceData.receiver_id || einvoiceData.customerid;
    const customerDetails = await fetchCustomerData(customerId);

    // Parse invoice date and time
    const createdDateString = einvoiceData.createddate || Date.now().toString();
    const createdDate = new Date(Number(createdDateString));
    const day = String(createdDate.getDate()).padStart(2, "0");
    const month = String(createdDate.getMonth() + 1).padStart(2, "0");
    const year = createdDate.getFullYear();
    const date = `${day}/${month}/${year}`;

    const hours = String(createdDate.getHours()).padStart(2, "0");
    const minutes = String(createdDate.getMinutes()).padStart(2, "0");
    const time = `${hours}:${minutes}`;

    // Get order details
    let orderDetails;
    if (isConsolidated) {
      orderDetails = await createConsolidatedOrderDetails(einvoiceData);
    } else {
      orderDetails = einvoiceData.orderDetails || [];
    }

    // Calculate totals
    const subtotal = Number(einvoiceData.total_excluding_tax || 0);
    const total = Number(
      einvoiceData.total_payable_amount || einvoiceData.totalamountpayable || 0
    );
    const rounding = Number(
      einvoiceData.total_rounding || einvoiceData.rounding || 0
    );
    let tax = einvoiceData.tax_amount || 0;

    // If product-level tax calculation is zero or unavailable, use total-based calculation
    if (tax === 0 && orderDetails.length > 0) {
      tax = orderDetails.reduce((sum: number, item: any) => {
        if (!item.issubtotal) {
          return sum + (Number(item.tax) || 0);
        }
        return sum;
      }, 0);
    }

    // If still zero, calculate from total
    if (tax === 0) {
      tax = total - subtotal - rounding;
    }

    // Combine all data
    return {
      company: TIENHOCK_INFO, // Default to TIENHOCK_INFO, can be customized based on data
      invoice: {
        number: einvoiceData.internal_id || einvoiceData.id,
        uuid: einvoiceData.uuid || "",
        long_id: einvoiceData.long_id || "",
        type: einvoiceData.type_name || einvoiceData.paymenttype || "INVOICE",
        datetime_validated:
          einvoiceData.datetime_validated || new Date().toISOString(),
        submission_id:
          einvoiceData.submission_uid || einvoiceData.submission_id || "",
        rounding: rounding,
        date,
        time,
      },
      buyer: {
        name: customerDetails.name || customerId,
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
      orderDetails: orderDetails.map((item: any) => ({
        description: item.description || "",
        qty: Number(item.qty || item.quantity || 0),
        price: item.price || 0,
        total: item.total || 0,
        tax: Number(item.tax || 0),
      })),
    };
  } catch (error) {
    console.error("Error preparing PDF data:", error);
    throw error;
  }
};

// Function to prepare PDF data from ExtendedInvoiceData
export const preparePDFDataFromInvoice = async (
  invoice: ExtendedInvoiceData
): Promise<EInvoicePDFData> => {
  // If we already have extended invoice data, just use the existing preparePDFData function
  // with required property mapping
  return preparePDFData({
    internal_id: invoice.id,
    receiver_id: invoice.customerid,
    uuid: invoice.uuid,
    long_id: invoice.long_id,
    createddate: invoice.createddate,
    total_excluding_tax: invoice.total_excluding_tax,
    tax_amount: invoice.tax_amount,
    total_rounding: invoice.rounding,
    total_payable_amount: invoice.totalamountpayable,
    submission_uid: invoice.submission_uid,
    datetime_validated: invoice.datetime_validated,
    is_consolidated: invoice.is_consolidated,
    orderDetails: invoice.products,
    type_name: invoice.paymenttype,
  });
};

// Function to handle batch preparation of PDF data
export const prepareBatchPDFData = async (
  invoices: ExtendedInvoiceData[]
): Promise<
  Array<{
    pdfData: EInvoicePDFData;
    invoice: ExtendedInvoiceData;
  }>
> => {
  const results = [];

  for (const invoice of invoices) {
    try {
      if (invoice.einvoice_status === "valid" && invoice.uuid) {
        const pdfData = await preparePDFDataFromInvoice(invoice);
        results.push({ pdfData, invoice });
      }
    } catch (error) {
      console.error(
        `Error preparing PDF data for invoice ${invoice.id}:`,
        error
      );
      // Continue with other invoices
    }
  }

  return results;
};

// Format currency helper
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(amount);
};
