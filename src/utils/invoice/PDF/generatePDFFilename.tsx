import { InvoiceData } from "../../../types/types";

export const generatePDFFilename = (invoices: InvoiceData[]): string => {
  if (!invoices || invoices.length === 0) {
    return "no-invoices.pdf";
  }

  // For single invoice, use invoice number
  if (invoices.length === 1) {
    const invoice = invoices[0];
    return `invoice_${invoice.type}${invoice.invoiceno}.pdf`;
  }

  // Sort invoices by date
  const sortedInvoices = [...invoices].sort((a, b) => {
    const dateA = parseDateString(a.date);
    const dateB = parseDateString(b.date);
    return dateA.getTime() - dateB.getTime();
  });

  const firstDate = parseDateString(sortedInvoices[0].date);
  const lastDate = parseDateString(
    sortedInvoices[sortedInvoices.length - 1].date
  );

  // Format dates for filename
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  };

  const startDate = formatDate(firstDate);
  const endDate = formatDate(lastDate);

  // If it's a single day
  if (startDate === endDate) {
    return `invoices_${startDate}.pdf`;
  }

  return `invoices_${startDate}_to_${endDate}.pdf`;
};

// Helper function to parse date strings in DD/MM/YYYY format
const parseDateString = (dateStr: string): Date => {
  const [day, month, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
};
