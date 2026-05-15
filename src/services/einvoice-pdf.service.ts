// src/services/einvoice-pdf.service.ts
import { api } from "../routes/utils/api";
import {
  TIENHOCK_INFO,
  JELLYPOLLY_INFO,
} from "../utils/invoice/einvoice/companyInfo";
import {
  createConsolidatedReceiptGroups,
  toAmount,
} from "../utils/invoice/einvoice/consolidatedReceiptGrouping";
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

type CompanyContext = "tienhock" | "jellypolly";

interface ConsolidatedSourceInvoice {
  id?: string | number;
  invoice_number?: string;
  internal_id?: string;
  total_excluding_tax?: number | string;
  amount?: number | string;
  tax_amount?: number | string;
  rounding?: number | string;
  totalamountpayable?: number | string;
  total_payable_amount?: number | string;
  products?: Array<any>;
  orderDetails?: Array<any>;
}

// Fetch customer data from cache or API
const fetchCustomerData = async (
  customerId: string,
  context: CompanyContext = "tienhock"
): Promise<any> => {
  try {
    // Check if customer ID is valid
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

    // Try to get from localStorage cache first
    const CACHE_KEY = "customers_cache";
    const cachedData = localStorage.getItem(CACHE_KEY);

    if (cachedData) {
      try {
        const { data } = JSON.parse(cachedData);
        // Find the customer in the cached array
        const customer = data.find((c: any) => c.id === customerId);

        if (customer) {
          return customer;
        }
      } catch (e) {
        console.warn("Error parsing customer cache:", e);
      }
    }

    // If not in cache, fall back to API call
    console.log(`Customer ${customerId} not found in cache, fetching from API`);
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

const getCompanyInfo = (context: CompanyContext | "greentarget") => {
  switch (context) {
    case "jellypolly":
      return JELLYPOLLY_INFO;
    default:
      return TIENHOCK_INFO;
  }
};

const parseConsolidatedInvoiceReferences = (value: any): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => String(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item: unknown) => String(item)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  return [];
};

const calculateSourceInvoiceAmounts = (
  invoice: ConsolidatedSourceInvoice
): {
  subtotal: number;
  tax: number;
  rounding: number;
  total: number;
} => {
  const productData: Array<any> | undefined =
    invoice.products || invoice.orderDetails;
  let subtotal: number = 0;
  let tax: number = 0;

  if (productData && Array.isArray(productData) && productData.length > 0) {
    productData.forEach((product: any): void => {
      if (!product.issubtotal) {
        const quantity: number = toAmount(product.quantity);
        const price: number = toAmount(product.price);

        if (quantity === 0 && product.total) {
          subtotal += toAmount(product.total);
        } else {
          subtotal += price * quantity;
        }

        tax += toAmount(product.tax);
      }
    });
  } else {
    subtotal = toAmount(invoice.amount || invoice.total_excluding_tax);
  }

  if (tax === 0 && toAmount(invoice.tax_amount) > 0) {
    tax = toAmount(invoice.tax_amount);
  }

  if (tax === 0) {
    tax = Math.max(
      toAmount(invoice.totalamountpayable || invoice.total_payable_amount) -
        subtotal -
        toAmount(invoice.rounding),
      0
    );
  }

  return {
    subtotal,
    tax,
    rounding: toAmount(invoice.rounding),
    total: toAmount(invoice.totalamountpayable || invoice.total_payable_amount),
  };
};

const fetchConsolidatedSourceInvoices = async (
  einvoiceData: any,
  companyContext: CompanyContext
): Promise<ConsolidatedSourceInvoice[]> => {
  if (
    Array.isArray(einvoiceData.consolidated_source_invoices) &&
    einvoiceData.consolidated_source_invoices.length > 0
  ) {
    return einvoiceData.consolidated_source_invoices;
  }

  const invoiceReferences: string[] = parseConsolidatedInvoiceReferences(
    einvoiceData.consolidated_invoices
  );

  if (invoiceReferences.length === 0) {
    return [];
  }

  const baseEndpoint: string =
    companyContext === "jellypolly"
      ? "/jellypolly/api/einvoice"
      : "/api/einvoice";

  try {
    const batchInvoices: any = await api.post(
      `${baseEndpoint}/consolidated-source-invoices`,
      { invoiceIds: invoiceReferences }
    );

    if (Array.isArray(batchInvoices)) {
      const invoiceByReference: Map<string, ConsolidatedSourceInvoice> =
        new Map(
          batchInvoices.map((invoice: any): [string, ConsolidatedSourceInvoice] => [
            String(invoice.id || invoice.invoice_number),
            invoice,
          ])
        );

      return invoiceReferences
        .map((invoiceReference: string): ConsolidatedSourceInvoice | null => {
          const invoice: ConsolidatedSourceInvoice | undefined =
            invoiceByReference.get(invoiceReference);

          if (!invoice) {
            return null;
          }

          return {
            ...invoice,
            id: invoice.id || invoiceReference,
            internal_id:
              invoice.internal_id || String(invoice.id || invoiceReference),
          };
        })
        .filter(
          (invoice): invoice is ConsolidatedSourceInvoice => invoice !== null
        );
    }
  } catch (error) {
    console.warn(
      "Failed to fetch consolidated source invoices in batch:",
      error
    );
  }

  const sourceInvoices: ConsolidatedSourceInvoice[] = [];
  const fallbackBaseEndpoint: string =
    companyContext === "jellypolly"
      ? "/jellypolly/api/invoices"
      : "/api/invoices";

  for (const invoiceReference of invoiceReferences) {
    try {
      const invoiceData: any = await api.get(
        `${fallbackBaseEndpoint}/${encodeURIComponent(invoiceReference)}`
      );
      sourceInvoices.push({
        ...invoiceData,
        id: invoiceData.id || invoiceReference,
        internal_id: invoiceData.internal_id || invoiceReference,
      });
    } catch (error) {
      console.warn(
        `Failed to fetch consolidated source invoice ${invoiceReference}:`,
        error
      );
    }
  }

  return sourceInvoices;
};

const resolveConsolidatedAmounts = (
  einvoiceData: any
): {
  subtotal: number;
  total: number;
  rounding: number;
  tax: number;
} => {
  const storedSubtotal: number = Number(einvoiceData.total_excluding_tax || 0);
  const total: number = Number(
    einvoiceData.total_payable_amount || einvoiceData.totalamountpayable || 0
  );
  const rounding: number = Number(
    einvoiceData.total_rounding || einvoiceData.rounding || 0
  );
  const storedTax: number = Number(einvoiceData.tax_amount || 0);

  if (storedSubtotal > 0) {
    return {
      subtotal: storedSubtotal,
      total,
      rounding,
      tax:
        storedTax !== 0
          ? storedTax
          : Math.max(total - storedSubtotal - rounding, 0),
    };
  }

  return {
    subtotal: Math.max(total - storedTax - rounding, 0),
    total,
    rounding,
    tax: storedTax,
  };
};

// Helper function to create consolidated order details
const createConsolidatedOrderDetails = async (
  einvoiceData: any,
  companyContext: CompanyContext
) => {
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

    const amounts = resolveConsolidatedAmounts(einvoiceData);
    const sourceInvoices: ConsolidatedSourceInvoice[] =
      await fetchConsolidatedSourceInvoices(einvoiceData, companyContext);

    if (sourceInvoices.length > 0) {
      const receiptGroups = createConsolidatedReceiptGroups(
        sourceInvoices,
        calculateSourceInvoiceAmounts
      );

      return receiptGroups.map((group: any) => ({
        productname: group.description,
        description: group.description,
        qty: 1,
        price: group.amounts.subtotal.toString(),
        total: group.amounts.total.toString(),
        tax: group.amounts.tax,
      }));
    }

    return [
      {
        productname: `Consolidated Invoice for ${formattedDate}`,
        description: `Consolidated Invoice for ${formattedDate}`,
        qty: 1,
        price: amounts.subtotal.toString(),
        total: amounts.total.toString(),
        tax: amounts.tax,
      },
    ];
  } catch (error) {
    console.error("Error creating consolidated order details:", error);
    return [];
  }
};

// Original function to prepare PDF data from standard e-invoice format
export const preparePDFData = async (
  einvoiceData: any,
  companyContext: CompanyContext = "tienhock"
): Promise<EInvoicePDFData> => {
  const isConsolidated =
    einvoiceData.is_consolidated ||
    (einvoiceData.internal_id && einvoiceData.internal_id.startsWith("CON-"));

  try {
    // Get appropriate company info
    const companyInfo = getCompanyInfo(companyContext);

    // Fetch customer data
    const customerId = einvoiceData.receiver_id || einvoiceData.customerid;
    const customerDetails = await fetchCustomerData(customerId, companyContext);

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
      orderDetails = await createConsolidatedOrderDetails(
        einvoiceData,
        companyContext
      );
    } else {
      orderDetails = einvoiceData.orderDetails || [];
    }

    // Calculate totals
    const consolidatedAmounts = isConsolidated
      ? resolveConsolidatedAmounts(einvoiceData)
      : null;
    const subtotal: number =
      consolidatedAmounts?.subtotal ??
      Number(einvoiceData.total_excluding_tax || 0);
    const total: number =
      consolidatedAmounts?.total ??
      Number(
        einvoiceData.total_payable_amount ||
          einvoiceData.totalamountpayable ||
          0
      );
    const rounding: number =
      consolidatedAmounts?.rounding ??
      Number(einvoiceData.total_rounding || einvoiceData.rounding || 0);
    let tax: number =
      consolidatedAmounts?.tax ?? Number(einvoiceData.tax_amount || 0);

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
      company: companyInfo,
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
  invoice: ExtendedInvoiceData,
  companyContext: CompanyContext = "tienhock"
): Promise<EInvoicePDFData> => {
  // If we already have extended invoice data, just use the existing preparePDFData function
  // with required property mapping
  return preparePDFData(
    {
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
      consolidated_invoices: invoice.consolidated_invoices,
      consolidated_source_invoices: (invoice as any)
        .consolidated_source_invoices,
      orderDetails: invoice.products,
      type_name: invoice.paymenttype,
    },
    companyContext
  );
};

// Function to handle batch preparation of PDF data
export const prepareBatchPDFData = async (
  invoices: ExtendedInvoiceData[],
  companyContext: CompanyContext = "tienhock"
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
        const pdfData = await preparePDFDataFromInvoice(
          invoice,
          companyContext
        );
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
