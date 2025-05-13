import { InvoiceGT } from "../../../types/types";

export const generateGTPDFFilename = (invoices: InvoiceGT[]): string => {
  if (!invoices || invoices.length === 0) {
    return "no-greentarget-invoices.pdf";
  }

  // For single invoice, use invoice number
  if (invoices.length === 1) {
    const invoice = invoices[0];
    const cleanInvoiceNumber = invoice.invoice_number.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    ); // Replace slashes etc.
    return `GT_Invoice_${cleanInvoiceNumber}.pdf`;
  }

  // Sort invoices by date_issued
  const sortedInvoices = [...invoices].sort((a, b) => {
    const dateA = a.date_issued ? new Date(a.date_issued) : new Date(0);
    const dateB = b.date_issued ? new Date(b.date_issued) : new Date(0);
    return dateA.getTime() - dateB.getTime();
  });

  const firstDate = sortedInvoices[0].date_issued
    ? new Date(sortedInvoices[0].date_issued)
    : null;
  const lastDate = sortedInvoices[sortedInvoices.length - 1].date_issued
    ? new Date(sortedInvoices[sortedInvoices.length - 1].date_issued)
    : null;

  // Format dates for filename (YYYYMMDD)
  const formatDate = (date: Date | null) => {
    if (!date) return "nodate";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  };

  const startDate = formatDate(firstDate);
  const endDate = formatDate(lastDate);

  // If it's a single day or dates are missing/invalid
  if (startDate === endDate || startDate === "nodate" || endDate === "nodate") {
    return `GT_Invoices_${startDate}.pdf`;
  }

  return `GT_Invoices_${startDate}_to_${endDate}.pdf`;
};
