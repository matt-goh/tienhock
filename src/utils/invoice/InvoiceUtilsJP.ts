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

    // Only filter out the total row, keep subtotals
    const productsToSave = (invoiceData.products || [])
      .filter((product) => !product.istotal)
      .map((product: ProductItem) => ({
        code: product.code || "",
        quantity: product.quantity || 0,
        price: product.price || 0,
        freeProduct: product.freeProduct || 0,
        returnProduct: product.returnProduct || 0,
        tax: product.tax || 0,
        description: product.description || "",
        issubtotal: product.issubtotal || false,
        total: product.total || "0",
      }));

    const dataToSubmit = {
      id: invoiceData.id,
      salespersonid: invoiceData.salespersonid,
      customerid: invoiceData.customerid,
      customername: invoiceData.customername || invoiceData.customerName,
      createddate: invoiceData.createddate,
      paymenttype: invoiceData.paymenttype || "INVOICE",
      amount: Number(invoiceData.amount || 0),
      rounding: Number(invoiceData.rounding || 0),
      totalamountpayable: Number(invoiceData.totalamountpayable || 0),
      products: productsToSave,
    };

    const response = await api.post("/jellypolly/api/invoices/submit", dataToSubmit);

    // Ensure we're getting the correct properties from response
    const savedInvoice = response.invoice || response;
    return {
      ...savedInvoice,
      products: (savedInvoice.products || []).map((product: ProductItem) => ({
        ...product,
        uid: crypto.randomUUID(),
      })),
      customerName: savedInvoice.customername || savedInvoice.customerid,
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

    const response = await api.get(`/jellypolly/api/invoices?${queryParams.toString()}`);

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

    // Keep subtotal rows but filter out total row
    const productsToSave = invoice.products
      .filter((product) => !product.istotal)
      .map((product) => ({
        code: product.code,
        quantity: product.quantity || 0,
        price: product.price || 0,
        freeProduct: product.freeProduct || 0,
        returnProduct: product.returnProduct || 0,
        tax: product.tax || 0,
        description: product.description || "",
        issubtotal: product.issubtotal || false,
        total: product.total || "0",
      }));

    const invoiceToSave = {
      ...invoice,
      originalId: invoice.originalId,
      amount: Number(invoice.amount || 0),
      rounding: Number(invoice.rounding || 0),
      totalamountpayable: Number(invoice.totalamountpayable || 0),
      products: productsToSave,
    };

    const response = await api.post("/jellypolly/api/invoices/update", invoiceToSave);

    const savedInvoice = response.invoice || response;

    return {
      ...savedInvoice,
      products: (savedInvoice.products || invoice.products).map(
        (product: ProductItem) => ({
          ...product,
          uid: crypto.randomUUID(),
        })
      ),
      customerName: savedInvoice.customerid || "",
    };
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
    await api.delete(`/jellypolly/api/invoices/${id}`);
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
      `/jellypolly/api/invoices/check-duplicate?invoiceNo=${invoiceNo}`
    );

    if (response && typeof response === "object") {
      if ("isDuplicate" in response) {
        return response.isDuplicate;
      } else if (
        "message" in response &&
        response.message === "Invoice number is required"
      ) {
        toast.error("Invoice number is required");
        return true;
      }
    }

    console.error("Unexpected response format:", response);
    throw new Error("Invalid response format from server");
  } catch (error) {
    console.error("Error checking for duplicate invoice number:", error);
    if (
      error instanceof Error &&
      error.message !== "Invalid response format from server"
    ) {
      toast.error(
        "Failed to check for duplicate invoice number. Please try again."
      );
    }
    throw error;
  }
};
