// src/utils/invoice/PDF/PDFDownloadHandler.tsx
import React, { useState } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { InvoiceData } from "../../../types/types";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import Button from "../../../components/Button";
import InvoicePDF from "./InvoicePDF";
import toast from "react-hot-toast";
import { generatePDFFilename } from "./generatePDFFilename";

interface PDFDownloadHandlerProps {
  invoices: InvoiceData[];
  disabled?: boolean;
  customerNames: Record<string, string>;
  onComplete?: () => void;
}

const PDFDownloadHandler: React.FC<PDFDownloadHandlerProps> = ({
  invoices,
  disabled,
  customerNames = {},
  onComplete,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    if (isGenerating || disabled) return;

    setIsGenerating(true);
    const isBatchDownload = invoices.length > 1;
    const toastId = toast.loading(
      isBatchDownload
        ? `Generating PDFs for ${invoices.length} invoices...`
        : "Generating PDF..."
    );

    try {
      // First render the PDF component
      const isJellyPolly = window.location.pathname.includes("/jellypolly");

      const pdfComponent = (
        <Document title={generatePDFFilename(invoices).replace(".pdf", "")}>
          <InvoicePDF
            invoices={invoices}
            customerNames={customerNames}
            companyContext={isJellyPolly ? "jellypolly" : "tienhock"}
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
      if (onComplete) onComplete();
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

  // Determine button label based on invoice count
  const buttonLabel = isGenerating
    ? "Generating..."
    : invoices.length > 1
    ? `Download ${invoices.length} PDFs`
    : "Download";

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
      data-pdf-download="true"
    >
      {buttonLabel}
    </Button>
  );
};

export default PDFDownloadHandler;
