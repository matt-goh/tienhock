import React, { useState } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { InvoiceGT } from "../../../types/types";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import Button from "../../../components/Button";
import GTInvoicePDF from "./GTInvoicePDF"; // Import the Green Target PDF component
import toast from "react-hot-toast";
import { generateGTPDFFilename } from "./generateGTPDFFilename";

interface GTPDFDownloadHandlerProps {
  invoices: InvoiceGT[]; // Expecting an array of detailed InvoiceGT objects
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  onComplete?: () => void;
}

const GTPDFDownloadHandler: React.FC<GTPDFDownloadHandlerProps> = ({
  invoices,
  disabled,
  size = "sm",
  onComplete,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    if (isGenerating || disabled || !invoices || invoices.length === 0) return;

    setIsGenerating(true);
    const isBatchDownload = invoices.length > 1;
    const toastId = toast.loading(
      isBatchDownload
        ? `Generating PDFs for ${invoices.length} invoices...`
        : "Generating PDF..."
    );

    try {
      const pdfPages = invoices.map((invoice) => (
        <GTInvoicePDF key={invoice.invoice_id} invoice={invoice} />
      ));

      const pdfComponent = (
        <Document title={generateGTPDFFilename(invoices).replace(".pdf", "")}>
          {pdfPages}
        </Document>
      );

      // Generate PDF blob
      const pdfBlob = await pdf(pdfComponent).toBlob();
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Create and trigger download
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = generateGTPDFFilename(invoices); // Use GT specific filename
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
    ? `Download (${invoices.length})`
    : "Download";

  return (
    <Button
      onClick={handleDownload}
      disabled={disabled || isGenerating}
      icon={isGenerating ? IconFileDownload : IconDownload}
      iconSize={16}
      iconStroke={2}
      variant="outline"
      size={size}
      data-gt-pdf-download="true" // Unique data attribute for targeting
    >
      {buttonLabel}
    </Button>
  );
};

export default GTPDFDownloadHandler;
