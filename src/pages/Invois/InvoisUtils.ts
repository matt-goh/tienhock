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

export const deleteInvoice = (id: string) => {
  // Remove the invoice from the local storage
  const invoices = getInvoices().filter(invoice => invoice.id !== id);
  localStorage.setItem('invoices', JSON.stringify(invoices));
};