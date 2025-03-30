// src/utils/invoice/InvoiceUtils.ts
import toast from "react-hot-toast";
import {
  ExtendedInvoiceData,
  InvoiceFilters,
  ProductItem,
} from "../../types/types";
import { api } from "../../routes/utils/api"; // Adjust path as needed

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
    // Frontend duplicate check (optional, backend enforces)
    // const isDuplicate = await checkDuplicateInvoiceNo(invoiceData.id);
    // if (isDuplicate) {
    //   throw new Error("Duplicate invoice number detected by frontend check.");
    // }

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
  page: number,
  limit: number,
  searchTerm: string
): Promise<{
  data: ExtendedInvoiceData[];
  total: number;
  totalPages: number;
}> => {
  try {
    const params = new URLSearchParams();

    // Date Range
    if (filters.dateRange.start) {
      const startDate = new Date(filters.dateRange.start);
      startDate.setHours(0, 0, 0, 0); // Start of the day
      params.append("startDate", startDate.getTime().toString());
    }
    if (filters.dateRange.end) {
      const endDate = new Date(filters.dateRange.end);
      endDate.setHours(23, 59, 59, 999); // End of the day
      params.append("endDate", endDate.getTime().toString());
    }

    // Other Filters (check backend expects comma-separated strings)
    if (filters.applySalespersonFilter && filters.salespersonId?.length)
      params.append("salesman", filters.salespersonId.join(","));
    if (filters.applyCustomerFilter && filters.customerId?.length)
      params.append("customer", filters.customerId.join(","));
    if (filters.applyPaymentTypeFilter && filters.paymentType)
      params.append("paymentType", filters.paymentType); // CASH or INVOICE
    if (filters.applyInvoiceStatusFilter && filters.invoiceStatus?.length)
      params.append("invoiceStatus", filters.invoiceStatus.join(","));
    if (filters.applyEInvoiceStatusFilter && filters.eInvoiceStatus?.length)
      params.append("eInvoiceStatus", filters.eInvoiceStatus.join(","));

    // Search Term
    if (searchTerm) params.append("search", searchTerm);

    // Pagination
    params.append("page", page.toString());
    params.append("limit", limit.toString());

    const response = await api.get(`/api/invoices?${params.toString()}`);

    if (!response || !response.data || !response.pagination) {
      console.error("Invalid response format fetching invoices:", response);
      throw new Error("Invalid response format from server");
    }

    // Map backend data to frontend ExtendedInvoiceData shape
    const mappedData = response.data.map(
      (inv: any): ExtendedInvoiceData => ({
        ...inv,
        // Ensure numeric types (backend should return numbers, but safeguard here)
        total_excluding_tax: parseFloat(inv.total_excluding_tax || 0),
        tax_amount: parseFloat(inv.tax_amount || 0),
        rounding: parseFloat(inv.rounding || 0),
        totalamountpayable: parseFloat(inv.totalamountpayable || 0),
        // Use customerName from backend if available, otherwise fallback
        customerName: inv.customerName || inv.customerid,
        // Ensure boolean type for is_consolidated
        is_consolidated: Boolean(inv.is_consolidated || false),
        // Parse consolidated_invoices if it's JSON string (backend returns JSON object)
        consolidated_invoices: inv.consolidated_invoices, // Assuming backend sends parsed JSON array or null
        products: [], // Assuming products are not returned in the list endpoint
      })
    );

    return {
      data: mappedData,
      total: response.pagination.total,
      totalPages: response.pagination.totalPages,
    };
  } catch (error) {
    console.error("Error fetching invoices:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch invoices";
    toast.error(errorMessage);
    throw new Error(errorMessage); // Re-throw
  }
};

// UPDATE Invoice
export const updateInvoice = async (
  invoiceData: ExtendedInvoiceData
): Promise<ExtendedInvoiceData> => {
  try {
    if (!invoiceData.id) {
      throw new Error("Cannot update invoice: missing ID");
    }

    // Prepare data for backend
    const dataToSubmit = {
      // Include only fields the backend needs for update
      id: invoiceData.id, // ID is used in WHERE clause, not SET clause
      salespersonid: invoiceData.salespersonid,
      customerid: invoiceData.customerid,
      createddate: invoiceData.createddate,
      paymenttype: invoiceData.paymenttype,
      total_excluding_tax: Number(invoiceData.total_excluding_tax || 0),
      tax_amount: Number(invoiceData.tax_amount || 0),
      rounding: Number(invoiceData.rounding || 0),
      totalamountpayable: Number(invoiceData.totalamountpayable || 0),
      invoice_status: invoiceData.invoice_status,
      // Send products without frontend-specific fields
      products: (invoiceData.products || [])
        .filter((p) => !p.istotal)
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
            issubtotal: issubtotal || false,
            price: Number(rest.price || 0),
            quantity: Number(rest.quantity || 0),
            freeProduct: Number(rest.freeProduct || 0),
            returnProduct: Number(rest.returnProduct || 0),
            tax: Number(rest.tax || 0),
            total: String(rest.total || "0.00"),
          })
        ),
      // Explicitly DO NOT send e-invoice fields - they are updated via e-invoice endpoints
    };

    const response = await api.post("/api/invoices/update", dataToSubmit); // Use the correct update endpoint

    if (!response || !response.invoice) {
      throw new Error("Invalid response received after updating invoice.");
    }

    // Map response back to frontend state shape
    const savedInvoice = response.invoice;
    return {
      ...invoiceData, // Start with current state
      ...savedInvoice, // Overwrite with updated fields from backend
      // Ensure correct types and add UIDs for products
      products: ensureProductsHaveUid(
        savedInvoice.products || invoiceData.products
      ), // Use original if not returned
      customerName:
        savedInvoice.customerName ||
        invoiceData.customerName ||
        savedInvoice.customerid,
    };
  } catch (error) {
    console.error("Error updating invoice:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update invoice";
    toast.error(errorMessage);
    throw new Error(errorMessage); // Re-throw
  }
};

// CANCEL Invoice (formerly delete) - Now returns the updated invoice data
export const cancelInvoice = async (
  id: string
): Promise<ExtendedInvoiceData> => {
  try {
    // Backend DELETE /:id now handles the cancellation logic (updating status)
    const response = await api.delete(`/api/invoices/${id}`);

    if (!response || !response.invoice) {
      throw new Error("Invalid response received after cancelling invoice.");
    }
    // The response *is* the updated (cancelled) invoice record
    const cancelledInvoice = response.invoice;

    return {
      ...cancelledInvoice,
      // Ensure correct types and add UIDs for products from the *cancelled* record if available
      // If backend doesn't return products on cancel, we might need to fetch them separately or use existing state
      products: ensureProductsHaveUid(cancelledInvoice.products || []), // Assuming products might be returned
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

// Check Duplicate Invoice Number (No changes needed if endpoint is same)
export const checkDuplicateInvoiceNo = async (
  invoiceNo: string
): Promise<boolean> => {
  try {
    if (!invoiceNo) return false; // Don't check empty string
    const response = await api.get(
      `/api/invoices/check-duplicate?invoiceNo=${invoiceNo}`
    );
    return response?.isDuplicate || false;
  } catch (error) {
    console.error("Error checking duplicate invoice number:", error);
    // Don't necessarily throw, maybe return false and let backend handle final check
    return false;
  }
};
