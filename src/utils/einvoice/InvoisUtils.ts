import toast from "react-hot-toast";
import {
  InvoiceData,
  InvoiceFilterOptions,
  OrderDetail,
} from "../../types/types";
import { api } from "../../routes/utils/api";

let invoices: InvoiceData[] = [];

export const getInvoices = () => invoices;

export const setInvoices = (newInvoices: InvoiceData[]) => {
  invoices = newInvoices;
};

export const updateInvoice = (updatedInvoice: InvoiceData) => {
  invoices = invoices.map((invoice) =>
    invoice.id === updatedInvoice.id ? updatedInvoice : invoice
  );
  // Dispatch an event to notify that invoices have been updated
  window.dispatchEvent(new CustomEvent("invoicesUpdated"));
};

export const fetchDbInvoices = async (
  filters: InvoiceFilterOptions
): Promise<InvoiceData[]> => {
  try {
    const queryParams = new URLSearchParams();

    if (filters.dateRangeFilter?.start) {
      queryParams.append(
        "startDate",
        filters.dateRangeFilter.start.toISOString().split("T")[0]
      );
    }
    if (filters.dateRangeFilter?.end) {
      queryParams.append(
        "endDate",
        filters.dateRangeFilter.end.toISOString().split("T")[0]
      );
    }

    if (
      filters.applySalesmanFilter &&
      filters.salesmanFilter &&
      filters.salesmanFilter.length > 0
    ) {
      queryParams.append("salesmen", filters.salesmanFilter.join(","));
    }
    if (
      filters.applyCustomerFilter &&
      filters.customerFilter &&
      filters.customerFilter.length > 0
    ) {
      queryParams.append("customers", filters.customerFilter.join(","));
    }
    if (filters.applyInvoiceTypeFilter && filters.invoiceTypeFilter) {
      queryParams.append("invoiceType", filters.invoiceTypeFilter);
    }

    const data = await api.get(`/api/invoices/db/?${queryParams.toString()}`);

    if (Array.isArray(data)) {
      return data;
    } else {
      throw new Error("Received data is not an array");
    }
  } catch (error) {
    console.error("Error fetching invoices:", error);
    throw error;
  }
};

export const fetchInvoices = async () => {
  try {
    const data = await api.get("/api/invoices");

    if (Array.isArray(data)) {
      setInvoices(data);
      return data;
    } else {
      throw new Error("Received data is not an array");
    }
  } catch (error) {
    console.error("Error fetching invoices:", error);
    throw error;
  }
};

export const deleteInvoice = async (id: string) => {
  try {
    // Try to delete from the database
    try {
      await api.delete(`/api/invoices/db/${id}`);
      invoices = invoices.filter((invoice) => invoice.id !== id);
      return true;
    } catch {
      // If not found in database, try to delete from server memory
      await api.delete(`/api/invoices/${id}`);
      invoices = invoices.filter((invoice) => invoice.id !== id);
      return true;
    }
  } catch (error) {
    console.error("Error deleting invoice:", error);
    throw error;
  }
};

const checkDuplicateInvoiceNo = async (invoiceNo: string): Promise<boolean> => {
  try {
    const data = await api.get(
      `/api/invoices/check-duplicate?invoiceNo=${invoiceNo}`
    );
    return data.isDuplicate;
  } catch (error) {
    console.error("Error checking for duplicate invoice number:", error);
    throw error;
  }
};

export const saveInvoice = async (
  invoice: InvoiceData,
  saveToDb: boolean = true
): Promise<InvoiceData> => {
  try {
    const normalizedOrderDetails = invoice.orderDetails.map((detail) => {
      if (detail.isless || detail.istax) {
        return {
          invoiceid: detail.invoiceid,
          code: detail.code,
          productname: detail.productname,
          qty: Number(detail.qty),
          price: Number(detail.price),
          total: detail.total.toString(),
          isfoc: false,
          isreturned: false,
          istotal: false,
          issubtotal: false,
          isless: detail.isless || false,
          istax: detail.istax || false,
        };
      }
      return detail;
    });

    const filteredOrderDetails = normalizedOrderDetails.filter(
      (detail) => !detail.istotal
    );

    const invoiceToSave = {
      ...invoice,
      orderDetails: filteredOrderDetails,
    };

    const savedInvoice: InvoiceData = await api.post(
      `/api/invoices/submit?saveToDb=${saveToDb}`,
      invoiceToSave
    );

    savedInvoice.orderDetails = addCalculatedTotalRows(
      savedInvoice.orderDetails
    );

    if (!saveToDb) {
      const index = invoices.findIndex((inv) => inv.id === savedInvoice.id);
      if (index !== -1) {
        invoices[index] = savedInvoice;
      } else {
        invoices.push(savedInvoice);
      }
    }

    return savedInvoice;
  } catch (error) {
    console.error("Error saving invoice:", error);
    throw error;
  }
};

export const createInvoice = async (
  invoiceData: InvoiceData
): Promise<InvoiceData> => {
  try {
    const isDuplicate = await checkDuplicateInvoiceNo(invoiceData.invoiceno);
    if (isDuplicate) {
      toast.error(
        "Duplicate invoice number. Please use a unique invoice number."
      );
      throw new Error("Duplicate invoice number");
    }

    const filteredOrderDetails = invoiceData.orderDetails.filter(
      (detail) => !detail.istotal
    );

    const invoiceToCreate = {
      ...invoiceData,
      orderDetails: filteredOrderDetails,
    };

    const createdInvoice: InvoiceData = await api.post(
      "/api/invoices/submit?saveToDb=true",
      invoiceToCreate
    );

    createdInvoice.orderDetails = addCalculatedTotalRows(
      createdInvoice.orderDetails
    );

    return createdInvoice;
  } catch (error) {
    console.error("Error creating invoice:", error);
    throw error;
  }
};

function addCalculatedTotalRows(orderDetails: OrderDetail[]): OrderDetail[] {
  let subtotal = 0;
  let focTotal = 0;
  let returnedTotal = 0;
  const detailsWithTotals = [...orderDetails];

  // Calculate totals, considering tax and less rows
  orderDetails.forEach((detail) => {
    if (detail.isless) {
      subtotal -= parseFloat(detail.total) || 0;
    } else if (detail.istax) {
      subtotal += parseFloat(detail.total) || 0;
    } else if (!detail.isfoc && !detail.isreturned) {
      subtotal += parseFloat(detail.total) || 0;
    } else if (detail.isfoc) {
      focTotal += parseFloat(detail.total) || 0;
    } else if (detail.isreturned) {
      returnedTotal += parseFloat(detail.total) || 0;
    }
  });

  // Sort the details to maintain proper order
  detailsWithTotals.sort((a, b) => {
    const getOrderValue = (item: OrderDetail) => {
      if (item.istotal) return 6;
      if (item.issubtotal) return 5;
      if (item.isless) return 4;
      if (item.istax) return 3;
      if (item.isfoc) return 2;
      if (item.isreturned) return 1;
      return 0;
    };
    return getOrderValue(a) - getOrderValue(b);
  });

  // Add subtotal row
  detailsWithTotals.push({
    code: "SUBTOTAL",
    productname: "Subtotal",
    qty: 0,
    price: 0,
    total: subtotal.toFixed(2),
    issubtotal: true,
  });

  // Add FOC total row if applicable
  if (focTotal > 0) {
    detailsWithTotals.push({
      code: "FOC-TOTAL",
      productname: "FOC Total",
      qty: 0,
      price: 0,
      total: focTotal.toFixed(2),
      isfoc: true,
      istotal: true,
    });
  }

  // Add Returned total row if applicable
  if (returnedTotal > 0) {
    detailsWithTotals.push({
      code: "RETURNED-TOTAL",
      productname: "Returned Total",
      qty: 0,
      price: 0,
      total: returnedTotal.toFixed(2),
      isreturned: true,
      istotal: true,
    });
  }

  // Add grand total row
  detailsWithTotals.push({
    code: "GRAND-TOTAL",
    productname: "Total",
    qty: 0,
    price: 0,
    total: (subtotal - returnedTotal).toFixed(2),
    istotal: true,
  });

  return detailsWithTotals;
}
