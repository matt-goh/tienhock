import toast from "react-hot-toast";
import {
  ExtendedInvoiceData,
  InvoiceData,
  InvoiceFilters,
} from "../../types/types";
import { api } from "../../routes/utils/api";
import { formatDateForAPI } from "./dateUtils";

let invoices: ExtendedInvoiceData[] = [];

export const updateInvoice = (updatedInvoice: ExtendedInvoiceData) => {
  invoices = invoices.map((invoice) =>
    invoice.id === updatedInvoice.id ? updatedInvoice : invoice
  );
  // Dispatch an event to notify that invoices have been updated
  window.dispatchEvent(new CustomEvent("invoicesUpdated"));
};

export const fetchDbInvoices = async (
  filters: InvoiceFilters
): Promise<InvoiceData[]> => {
  try {
    const queryParams = new URLSearchParams();

    // Convert dates using the existing formatDateForAPI utility
    if (filters.dateRange.start) {
      const startDate = new Date(filters.dateRange.start);
      startDate.setHours(0, 0, 0, 0);
      queryParams.append("startDate", startDate.getTime().toString());
    }

    if (filters.dateRange.end) {
      const endDate = new Date(filters.dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      queryParams.append("endDate", endDate.getTime().toString());
    }

    // Add salesman filter
    if (filters.applySalespersonFilter && filters.salespersonId) {
      queryParams.append("salesman", filters.salespersonId.join(","));
    }

    // Add customer filter
    if (filters.applyCustomerFilter && filters.customerId) {
      queryParams.append("customer", filters.customerId.join(","));
    }

    // Add payment type filter
    if (filters.applyPaymentTypeFilter && filters.paymentType) {
      queryParams.append("paymenttype", filters.paymentType.toUpperCase());
    }

    const response = await api.get(`/api/invoices?${queryParams.toString()}`);

    if (!response || !Array.isArray(response)) {
      console.error("Invalid response format:", response);
      throw new Error("Invalid response format from server");
    }

    return response;
  } catch (error) {
    console.error("Error fetching invoices:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred while fetching invoices";

    toast.error(errorMessage);
    throw new Error(errorMessage);
  }
};

export const saveInvoice = async (
  invoice: ExtendedInvoiceData,
  saveToDb: boolean = true
): Promise<ExtendedInvoiceData> => {
  try {
    // Normalize products data
    const normalizedProducts = invoice.products.map((product) => ({
      code: product.code,
      quantity: product.quantity || 0,
      price: product.price || 0,
      freeProduct: product.freeProduct || 0,
      returnProduct: product.returnProduct || 0,
      tax: product.tax || 0,
      discount: product.discount || 0,
      description: product.description || "",
      issubtotal: product.issubtotal || false,
      istotal: product.istotal || false,
    }));

    // Remove total rows before saving
    const productsToSave = normalizedProducts.filter(
      (product) => !product.istotal
    );

    const invoiceToSave = {
      ...invoice,
      products: productsToSave,
    };

    const savedInvoice = await api.post(
      `/api/invoices/submit?saveToDb=${saveToDb}`,
      invoiceToSave
    );

    if (!saveToDb) {
      const index = invoices.findIndex(
        (inv) => inv.id === savedInvoice.billNumber
      );
      if (index !== -1) {
        invoices[index] = savedInvoice;
      } else {
        invoices.push(savedInvoice);
      }
    }

    return savedInvoice;
  } catch (error) {
    console.error("Error saving invoice:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred while saving the invoice";
    toast.error(errorMessage);
    throw new Error(errorMessage);
  }
};

export const createInvoice = async (
  invoiceData: ExtendedInvoiceData
): Promise<ExtendedInvoiceData> => {
  try {
    const isDuplicate = await checkDuplicateInvoiceNo(
      invoiceData.id.toString()
    );
    if (isDuplicate) {
      toast.error(
        "Duplicate invoice number. Please use a unique invoice number."
      );
      throw new Error("Duplicate invoice number");
    }

    // Filter out total rows before saving
    const productsToSave = invoiceData.products.filter(
      (product) => !product.istotal
    );

    const invoiceToCreate = {
      ...invoiceData,
      products: productsToSave,
    };

    const createdInvoice = await api.post(
      "/api/invoices/submit?saveToDb=true",
      invoiceToCreate
    );

    return createdInvoice;
  } catch (error) {
    console.error("Error creating invoice:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred while creating the invoice";
    toast.error(errorMessage);
    throw new Error(errorMessage);
  }
};

export const deleteInvoice = async (id: string): Promise<boolean> => {
  try {
    await api.delete(`/api/invoices/db/${id}`);
    return true;
  } catch (error) {
    console.error("Error deleting invoice:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred while deleting the invoice";

    toast.error(errorMessage);
    throw new Error(errorMessage);
  }
};

export const checkDuplicateInvoiceNo = async (
  invoiceNo: string
): Promise<boolean> => {
  try {
    const response = await api.get(
      `/api/invoices/check-duplicate?invoiceNo=${invoiceNo}`
    );

    // Handle both possible response formats
    if (response && typeof response === "object") {
      if ("isDuplicate" in response) {
        return response.isDuplicate;
      } else if (
        "message" in response &&
        response.message === "Invoice number is required"
      ) {
        toast.error("Invoice number is required");
        return true; // Prevent creation if no invoice number
      }
    }

    // If response format is unexpected, log it for debugging
    console.error("Unexpected response format:", response);
    throw new Error("Invalid response format from server");
  } catch (error) {
    console.error("Error checking for duplicate invoice number:", error);

    // Only show toast for network/server errors
    if (
      error instanceof Error &&
      error.message !== "Invalid response format from server"
    ) {
      toast.error(
        "Failed to check for duplicate invoice number. Please try again."
      );
    }

    // Re-throw the error to be handled by the caller
    throw error;
  }
};
