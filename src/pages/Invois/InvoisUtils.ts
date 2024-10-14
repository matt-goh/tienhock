import toast from "react-hot-toast";
import { InvoiceData } from "../../types/types";
import { API_BASE_URL } from "../../config";

let invoices: InvoiceData[] = [];

export const getInvoices = () => invoices;

export const setInvoices = (newInvoices: InvoiceData[]) => {
  invoices = newInvoices;
};

export const updateInvoice = (updatedInvoice: InvoiceData) => {
  invoices = invoices.map((invoice) =>
    invoice.id === updatedInvoice.id ? updatedInvoice : invoice
  );
};

export const fetchDbInvoices = async (): Promise<InvoiceData[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/db/invoices`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
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
    const response = await fetch(`${API_BASE_URL}/api/invoices`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
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
    // First, try to delete from the database
    const dbResponse = await fetch(
      `${API_BASE_URL}/api/db/invoices/${id}`,
      {
        method: "DELETE",
      }
    );

    if (dbResponse.ok) {
      // If successful, remove from local storage as well
      invoices = invoices.filter((invoice) => invoice.id !== id);
      return true;
    }

    // If not found in database, try to delete from server memory
    const memoryResponse = await fetch(
      `${API_BASE_URL}/api/invoices/${id}`,
      {
        method: "DELETE",
      }
    );

    if (!memoryResponse.ok) {
      throw new Error(`HTTP error! status: ${memoryResponse.status}`);
    }

    // Remove the invoice from the local storage
    invoices = invoices.filter((invoice) => invoice.id !== id);
    return true;
  } catch (error) {
    console.error("Error deleting invoice:", error);
    throw error;
  }
};

const checkDuplicateInvoiceNo = async (invoiceNo: string): Promise<boolean> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/invoices/check-duplicate?invoiceNo=${invoiceNo}`
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
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
    // Check for duplicate invoice number
    const isDuplicate = await checkDuplicateInvoiceNo(invoice.invoiceno);
    if (isDuplicate) {
      toast.error(
        "Duplicate invoice number. Please use a unique invoice number."
      );
      throw new Error("Duplicate invoice number");
    }

    const url = `${API_BASE_URL}/api/invoices/submit?saveToDb=${saveToDb}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoice),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${
          errorData.message || "Unknown error"
        }`
      );
    }

    const savedInvoice: InvoiceData = await response.json();

    // Update the local cache if saving to memory
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
    // Check for duplicate invoice number
    const isDuplicate = await checkDuplicateInvoiceNo(invoiceData.invoiceno);
    if (isDuplicate) {
      toast.error(
        "Duplicate invoice number. Please use a unique invoice number."
      );
      throw new Error("Duplicate invoice number");
    }

    const response = await fetch(
      `${API_BASE_URL}/api/invoices/submit?saveToDb=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invoiceData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to create invoice");
    }

    const createdInvoice: InvoiceData = await response.json();

    return createdInvoice;
  } catch (error) {
    console.error("Error creating invoice:", error);
    throw error;
  }
};
