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

export const saveInvoice = async (invoice: InvoiceData) => {
  try {
    const response = await fetch(
      `http://localhost:5000/api/invoices/${invoice.id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invoice),
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    // Update the invoice in the local storage
    updateInvoice(invoice);
    return true;
  } catch (error) {
    console.error("Error saving invoice:", error);
    throw error;
  }
};
