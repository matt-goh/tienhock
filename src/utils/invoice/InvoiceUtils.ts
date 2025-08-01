// src/utils/invoice/InvoiceUtils.ts
import toast from "react-hot-toast";
import {
  ExtendedInvoiceData,
  InvoiceFilters,
  ProductItem,
  Payment,
} from "../../types/types";
import { api } from "../../routes/utils/api"; // Adjust path as needed
import { refreshCreditsCache } from "../../utils/catalogue/useCustomerCache";

// Helper to ensure products have UIDs for frontend state
const ensureProductsHaveUid = (products: any[]): ProductItem[] => {
  return (products || []).map((p: any) => ({
    ...p,
    // Ensure numeric types from backend are preserved if needed, parse if stored as string
    price: parseFloat(p.price || 0),
    quantity: parseInt(p.quantity || 0),
    freeProduct: parseInt(p.freeProduct || p.freeproduct || 0), // Handle potential casing diff
    returnProduct: parseInt(p.returnProduct || p.returnproduct || 0),
    tax: parseFloat(p.tax || 0),
    total: String(p.total || "0.00"), // Keep total as string for display consistency
    issubtotal: Boolean(p.issubtotal || false),
    // Assign UID if missing (essential for frontend list keys)
    uid: p.uid || crypto.randomUUID(),
  }));
};

// CREATE Invoice
export const createInvoice = async (
  invoiceData: ExtendedInvoiceData
): Promise<ExtendedInvoiceData> => {
  try {
    // Prepare data for backend (map frontend state to backend expected structure)
    const dataToSubmit = {
      ...invoiceData,
      // Explicitly map fields expected by the backend endpoint
      id: invoiceData.id, // Send the full ID (e.g., "I1001")
      salespersonid: invoiceData.salespersonid,
      customerid: invoiceData.customerid,
      createddate: invoiceData.createddate,
      paymenttype: invoiceData.paymenttype,
      total_excluding_tax: Number(invoiceData.total_excluding_tax || 0),
      tax_amount: Number(invoiceData.tax_amount || 0),
      rounding: Number(invoiceData.rounding || 0),
      totalamountpayable: Number(invoiceData.totalamountpayable || 0),
      invoice_status: invoiceData.invoice_status || "active",
      // Send products without frontend-specific fields (uid, istotal, etc.)
      // Backend expects specific fields: code, price, quantity, etc.
      products: (invoiceData.products || [])
        .filter((p) => !p.istotal) // Filter out frontend-only total row
        .map(
          ({
            uid,
            istotal,
            issubtotal,
            amount,
            rounding: productRounding,
            ...rest
          }) => ({
            ...rest,
            issubtotal: issubtotal || false, // Ensure boolean presence
            price: Number(rest.price || 0), // Ensure numbers
            quantity: Number(rest.quantity || 0),
            freeProduct: Number(rest.freeProduct || 0),
            returnProduct: Number(rest.returnProduct || 0),
            tax: Number(rest.tax || 0),
            total: String(rest.total || "0.00"), // Ensure string
          })
        ),
      // Remove frontend-only fields not needed by backend create endpoint
      customerName: undefined,
      isEditing: undefined,
      originalId: undefined, // ID is immutable, no originalId needed
      einvoice_status: null, // Typically null on creation
      uuid: null,
      submission_uid: null,
      long_id: null,
      datetime_validated: null,
      is_consolidated: false,
      consolidated_invoices: null,
      cancellation_date: undefined,
    };

    // Remove undefined properties before sending
    Object.keys(dataToSubmit).forEach(
      (key) =>
        (dataToSubmit as Record<string, any>)[key] === undefined &&
        delete (dataToSubmit as Record<string, any>)[key]
    );

    const response = await api.post("/api/invoices/submit", dataToSubmit); // Use the correct create endpoint
    if (!response || !response.invoice) {
      throw new Error("Invalid response received after creating invoice.");
    }

    await refreshCreditsCache(); // Refresh customer cache

    // Map response back to frontend state shape
    const savedInvoice = response.invoice;
    return {
      ...savedInvoice,
      // Ensure correct types and add UIDs for products
      products: ensureProductsHaveUid(
        savedInvoice.products || invoiceData.products
      ), // Use original products if backend doesn't return them
      customerName:
        savedInvoice.customerName ||
        invoiceData.customerName ||
        savedInvoice.customerid, // Get name from response or fallback
    };
  } catch (error) {
    console.error("Error creating invoice:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    toast.error(`Failed to create invoice: ${errorMessage}`);
    throw new Error(errorMessage); // Re-throw for component handling
  }
};

// GET Invoices (List)
export const getInvoices = async (
  filters: InvoiceFilters,
  page: number = 1,
  limit: number = 15,
  searchTerm: string = ""
) => {
  try {
    // Build query parameters
    const params = new URLSearchParams();

    // Add pagination
    params.append("page", page.toString());
    params.append("limit", limit.toString());

    // Add date range
    if (filters.dateRange.start) {
      params.append("startDate", filters.dateRange.start.getTime().toString());
    }
    if (filters.dateRange.end) {
      params.append("endDate", filters.dateRange.end.getTime().toString());
    }

    // Add salesperson filter
    if (filters.salespersonId && filters.salespersonId.length > 0) {
      params.append("salesman", filters.salespersonId.join(","));
    }

    // Add customer filter
    if (filters.customerId) {
      params.append("customerId", filters.customerId);
    }

    // Add payment type filter
    if (filters.paymentType) {
      params.append("paymentType", filters.paymentType);
    }

    // Add invoice status filter
    if (filters.invoiceStatus && filters.invoiceStatus.length > 0) {
      params.append("invoiceStatus", filters.invoiceStatus.join(","));
    }

    // Add e-invoice status filter
    if (filters.eInvoiceStatus && filters.eInvoiceStatus.length > 0) {
      params.append("eInvoiceStatus", filters.eInvoiceStatus.join(","));
    }

    // Handle consolidation filter
    if (filters.consolidation === "consolidated") {
      params.append("consolidated_only", "true");
    } else if (filters.consolidation === "individual") {
      params.append("exclude_consolidated", "true");
    }

    // Add search term
    if (searchTerm) {
      params.append("search", searchTerm);
    }

    // Make the API call with all parameters
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const response = await api.get(`/api/invoices${queryString}`);

    return response;
  } catch (error) {
    console.error("Error fetching invoices:", error);
    throw error;
  }
};

// CANCEL Invoice (formerly delete) - Now returns the updated invoice data
export const cancelInvoice = async (
  id: string
): Promise<ExtendedInvoiceData> => {
  try {
    // Backend DELETE /:id now handles the cancellation logic (updating status)
    const response = await api.delete(`/api/invoices/${id}`);

    // Update this check to look for deletedInvoice instead of invoice
    if (!response || (!response.invoice && !response.deletedInvoice)) {
      throw new Error("Invalid response received after cancelling invoice.");
    }

    await refreshCreditsCache(); // Refresh customer cache

    // Use deletedInvoice if present, otherwise fall back to invoice
    const cancelledInvoice = response.deletedInvoice || response.invoice;

    return {
      ...cancelledInvoice,
      // Ensure correct types and add UIDs for products from the *cancelled* record if available
      products: ensureProductsHaveUid(cancelledInvoice.products || []),
      customerName:
        cancelledInvoice.customerName || cancelledInvoice.customerid,
    };
  } catch (error) {
    console.error("Error cancelling invoice:", error);
    // Check for specific backend messages like "already cancelled"
    const errorMessage =
      error instanceof Error ? error.message : "Failed to cancel invoice";
    toast.error(errorMessage);
    throw new Error(errorMessage); // Re-throw
  }
};

// GET Invoice By ID (Added helper)
export const getInvoiceById = async (
  id: string
): Promise<ExtendedInvoiceData> => {
  try {
    const inv = await api.get(`/api/invoices/${id}`);

    if (!inv || !inv.id) {
      throw new Error("Invoice not found or invalid response.");
    }

    // Map backend data to frontend ExtendedInvoiceData shape
    return {
      ...inv,
      total_excluding_tax: parseFloat(inv.total_excluding_tax || 0),
      tax_amount: parseFloat(inv.tax_amount || 0),
      rounding: parseFloat(inv.rounding || 0),
      totalamountpayable: parseFloat(inv.totalamountpayable || 0),
      products: ensureProductsHaveUid(inv.products),
      customerName: inv.customerName || inv.customerid,
      is_consolidated: Boolean(inv.is_consolidated || false),
      consolidated_invoices: inv.consolidated_invoices,
    };
  } catch (error) {
    console.error(`Error fetching invoice ${id}:`, error);
    const errorMessage =
      error instanceof Error ? error.message : `Failed to fetch invoice ${id}`;
    toast.error(errorMessage);
    throw new Error(errorMessage); // Re-throw
  }
};

// GET Multiple Invoices By IDs (batch fetch)
export const getInvoicesByIds = async (
  ids: string[]
): Promise<ExtendedInvoiceData[]> => {
  try {
    if (!ids.length) return [];

    // Create URL-safe parameter string (comma-separated IDs)
    const idsParam = ids.join(",");

    // Use a new backend endpoint that can handle multiple IDs
    const response = await api.get(`/api/invoices/batch?ids=${idsParam}`);

    if (!response || !Array.isArray(response)) {
      throw new Error("Invalid response format from batch invoice endpoint");
    }

    // Map backend data to frontend ExtendedInvoiceData shape
    return response.map((inv) => ({
      ...inv,
      total_excluding_tax: parseFloat(inv.total_excluding_tax || 0),
      tax_amount: parseFloat(inv.tax_amount || 0),
      rounding: parseFloat(inv.rounding || 0),
      totalamountpayable: parseFloat(inv.totalamountpayable || 0),
      products: ensureProductsHaveUid(inv.products),
      customerName: inv.customerName || inv.customerid,
      is_consolidated: Boolean(inv.is_consolidated || false),
      consolidated_invoices: inv.consolidated_invoices,
    }));
  } catch (error) {
    console.error(`Error batch fetching invoices:`, error);
    const errorMessage =
      error instanceof Error ? error.message : `Failed to fetch invoices`;
    toast.error(errorMessage);
    throw new Error(errorMessage);
  }
};

// Check Duplicate Invoice Number (No changes needed if endpoint is same)
export const checkDuplicateInvoiceNo = async (
  invoiceNo: string
): Promise<boolean> => {
  if (!invoiceNo) return false; // Don't check empty string

  try {
    const response = await api.get(`/api/invoices/${invoiceNo}`);
    if (response.message === "Invoice not found") {
      return false; // Not a duplicate
    } else if (response.id) {
      // If we get an ID back, it means the invoice exists
      return true; // Duplicate found
    }

    return false; // Default case if response is unexpected
  } catch (error: any) {
    // If we get a 404, the invoice doesn't exist
    if (error.status === 404) {
      return false;
    }
    return false; // Err on the side of caution and let the server validate
  }
};

// Sync cancellation status for an e-invoice
export const syncCancellationStatus = async (invoiceId: string) => {
  try {
    const response = await api.post(
      `/api/einvoice/cancelled/${invoiceId}/sync`
    );
    return response;
  } catch (error) {
    console.error(
      `Error syncing cancellation status for invoice ${invoiceId}:`,
      error
    );
    throw error;
  }
};

// CREATE Payment
export const createPayment = async (
  paymentData: Omit<Payment, "payment_id" | "created_at">
): Promise<Payment[]> => {
  try {
    const response = await api.post("/api/payments", paymentData);
    // Backend now returns { message: string, payments: Payment[], ... }
    if (!response || !response.payments || !Array.isArray(response.payments)) {
      throw new Error("Invalid response received after creating payment(s).");
    }
    await refreshCreditsCache(); // Refresh customer cache
    return response.payments; // Return the array of created payments
  } catch (error: any) {
    console.error("Error creating payment:", error);
    const errorMessage =
      error.response?.data?.message || // Use backend error message if available
      (error instanceof Error ? error.message : "Failed to record payment");
    toast.error(errorMessage);
    throw new Error(errorMessage);
  }
};

// CONFIRM Payment (mark pending payment as paid)
export const confirmPayment = async (paymentId: number): Promise<Payment[]> => {
  try {
    const response = await api.put(`/api/payments/${paymentId}/confirm`);
    // The backend now returns { message: string, payments: Payment[] }
    if (!response || !response.payments || !Array.isArray(response.payments)) {
      throw new Error("Invalid response received after confirming payment(s).");
    }
    await refreshCreditsCache(); // Refresh customer cache

    // The calling component will handle the success toast.

    return response.payments;
  } catch (error: any) {
    console.error(`Error confirming payment ${paymentId}:`, error);
    const errorMessage =
      error.response?.data?.message ||
      (error instanceof Error ? error.message : "Failed to confirm payment(s)");
    toast.error(errorMessage);
    throw new Error(errorMessage);
  }
};

// GET Payments for a specific Invoice
export const getPaymentsForInvoice = async (
  invoiceId: string,
  includeCancelled: boolean = false
): Promise<Payment[]> => {
  try {
    const response = await api.get(
      `/api/payments?invoice_id=${invoiceId}${
        includeCancelled ? "&include_cancelled=true" : ""
      }`
    );
    return response || []; // Assuming backend returns array directly or null/undefined
  } catch (error: any) {
    console.error(`Error fetching payments for invoice ${invoiceId}:`, error);
    const errorMessage =
      error.response?.data?.message ||
      (error instanceof Error
        ? error.message
        : "Failed to fetch payment history");
    toast.error(errorMessage);
    throw new Error(errorMessage);
  }
};

// CANCEL Payment
export const cancelPayment = async (
  paymentId: number,
  reason?: string
): Promise<Payment> => {
  try {
    const response = await api.put(`/api/payments/${paymentId}/cancel`, {
      reason,
    });
    if (!response || !response.payment) {
      throw new Error("Invalid response received after cancelling payment.");
    }
    await refreshCreditsCache(); // Refresh customer cache
    return response.payment;
  } catch (error: any) {
    console.error(`Error cancelling payment ${paymentId}:`, error);
    const errorMessage =
      error.response?.data?.message ||
      (error instanceof Error ? error.message : "Failed to cancel payment");
    toast.error(errorMessage);
    throw new Error(errorMessage);
  }
};

// Keep the deletePayment function for backward compatibility, but mark as deprecated
/**
 * @deprecated Use cancelPayment instead
 */
export const deletePayment = async (paymentId: number): Promise<Payment> => {
  return cancelPayment(paymentId);
};
