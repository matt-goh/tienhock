import React, { useState, useEffect } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { InvoiceData } from "../../../types/types";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import Button from "../../../components/Button";
import InvoicePDF from "./InvoicePDF";
import toast from "react-hot-toast";
import { generatePDFFilename } from "./generatePDFFilename";
import { api } from "../../../routes/utils/api";

interface PDFDownloadHandlerProps {
  invoices: InvoiceData[];
  disabled?: boolean;
  customerNames: Record<string, string>;
}

const PDFDownloadHandler: React.FC<PDFDownloadHandlerProps> = ({
  invoices,
  disabled,
  customerNames = {},
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    const toastId = toast.loading("Generating PDF...");

    try {
      // First render the PDF component
      const pdfComponent = (
        <Document title={generatePDFFilename(invoices).replace(".pdf", "")}>
          <InvoicePDF
            invoices={invoices}
            customerNames={customerNames} // Use the passed-in customerNames directly
          />
        </Document>
      );

      // Generate PDF blob
      const pdfBlob = await pdf(pdfComponent).toBlob();
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Create and trigger download
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = generatePDFFilename(invoices);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup
      URL.revokeObjectURL(pdfUrl);
      toast.success("PDF downloaded successfully", { id: toastId });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error(
        `Failed to generate PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { id: toastId }
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (!invoices || invoices.length === 0) {
    return null;
  }

  return (
    <Button
      onClick={handleDownload}
      disabled={disabled || isGenerating}
      icon={isGenerating ? IconFileDownload : IconDownload}
      iconSize={16}
      iconStroke={2}
      variant="outline"
    >
      {isGenerating ? "Generating..." : "Download"}
    </Button>
  );
};

export default PDFDownloadHandler;
