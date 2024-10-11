import { InvoiceData } from "../../types/types";

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

export const fetchInvoices = async () => {
  try {
    const response = await fetch("http://localhost:5000/api/invoices");
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
    const response = await fetch(`http://localhost:5000/api/invoices/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    // Remove the invoice from the local storage
    invoices = invoices.filter((invoice) => invoice.id !== id);
    return true;
  } catch (error) {
    console.error("Error deleting invoice:", error);
    throw error;
  }
};

export const saveInvoice = async (
  invoice: InvoiceData
): Promise<InvoiceData> => {
  try {
    const url = invoice.id
      ? `http://localhost:5000/api/invoices/${invoice.id}`
      : "http://localhost:5000/api/invoices";

    const method = invoice.id ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
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

    // Update the local cache
    const invoices = getInvoices();
    const index = invoices.findIndex((inv) => inv.id === savedInvoice.id);
    if (index !== -1) {
      invoices[index] = savedInvoice;
    } else {
      invoices.push(savedInvoice);
    }
    localStorage.setItem("invoices", JSON.stringify(invoices));

    return savedInvoice;
  } catch (error) {
    console.error("Error saving invoice:", error);
    throw error;
  }
};
