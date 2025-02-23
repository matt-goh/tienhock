import toast from "react-hot-toast";
import {
  ExtendedInvoiceData,
  InvoiceData,
  InvoiceFilters,
  ProductItem,
} from "../../types/types";
import { api } from "../../routes/utils/api";

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

    // Ensure products array exists and filter out total/subtotal rows
    const productsToSave = (invoiceData.products || [])
      .filter((product) => !product.istotal && !product.issubtotal)
      .map((product: ProductItem) => ({
        code: product.code || "",
        quantity: product.quantity || 0,
        price: product.price || 0,
        freeProduct: product.freeProduct || 0,
        returnProduct: product.returnProduct || 0,
        tax: product.tax || 0,
        discount: product.discount || 0,
        description: product.description || "",
      }));

    const dataToSubmit = {
      id: invoiceData.id,
      salespersonid: invoiceData.salespersonid,
      customerid: invoiceData.customerid,
      customername: invoiceData.customername || invoiceData.customerName,
      createddate: invoiceData.createddate,
      paymenttype: invoiceData.paymenttype || "INVOICE",
      totalmee: Number(invoiceData.totalmee || 0),
      totalbihun: Number(invoiceData.totalbihun || 0),
      totalnontaxable: Number(invoiceData.totalnontaxable || 0),
      totaltaxable: Number(invoiceData.totaltaxable || 0),
      totaladjustment: Number(invoiceData.totaladjustment || 0),
      products: productsToSave,
    };

    const response = await api.post("/api/invoices/submit", dataToSubmit);

    // Ensure we return a properly structured ExtendedInvoiceData
    return {
      ...response.invoice,
      products: response.invoice.products || [],
      customerName:
        response.invoice.customername || response.invoice.customerid,
    };
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

export const getInvoices = async (
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

export const updateInvoice = async (
  invoice: ExtendedInvoiceData
): Promise<ExtendedInvoiceData> => {
  try {
    if (!invoice.id) {
      throw new Error("Cannot update invoice: missing ID");
    }

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

    // Remove special rows before saving
    const productsToSave = normalizedProducts.filter(
      (product) => !product.istotal && !product.issubtotal
    );

    const invoiceToSave = {
      ...invoice,
      originalId: invoice.originalId, // Include the original ID if we're changing invoice numbers
      products: productsToSave,
    };

    // Send to update endpoint
    const savedInvoice = await api.post("/api/invoices/update", invoiceToSave);

    return savedInvoice;
  } catch (error) {
    console.error("Error updating invoice:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred while updating the invoice";
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
