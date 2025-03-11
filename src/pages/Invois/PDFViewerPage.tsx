import React, { useState, useEffect } from "react";
import { InvoiceData } from "../../types/types";
import InvoicePDF from "../../utils/invoice/PDF/InvoicePDF";
import { PDFViewer, Document } from "@react-pdf/renderer";
import { generatePDFFilename } from "../../utils/invoice/PDF/generatePDFFilename";

const PDFViewerPage: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      // Try to get the data from sessionStorage
      const storedData = sessionStorage.getItem("PDF_DATA");
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        if (Array.isArray(parsedData)) {
          setInvoices(parsedData);
          setIsLoading(false);
          return;
        }
      }

      // If no data in sessionStorage, show error
      setIsLoading(false);
      console.error("No invoice data found");
    } catch (error) {
      console.error("Error loading PDF data:", error);
      setIsLoading(false);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-lg">Loading PDF viewer...</div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-lg">No invoice data found</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <PDFViewer style={{ width: "100%", height: "100%" }}>
        <Document title={generatePDFFilename(invoices).replace(".pdf", "")}>
          <InvoicePDF invoices={invoices} />
        </Document>
      </PDFViewer>
    </div>
  );
};

export default PDFViewerPage;
