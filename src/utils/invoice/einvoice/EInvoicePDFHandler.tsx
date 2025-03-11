// src/utils/invoice/einvoice/EInvoicePDFHandler.tsx
import React, { useState } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import Button from "../../../components/Button";
import toast from "react-hot-toast";
import { preparePDFData } from "../../../services/einvoice-pdf.service";
import { generateQRDataUrl } from "./generateQRCode";
import EInvoicePDF from "./EInvoicePDF";

interface PDFDownloadHandlerProps {
  einvoice: any; // We'll type this properly once we have the exact type
  disabled?: boolean;
}

const EInvoicePDFHandler: React.FC<PDFDownloadHandlerProps> = ({
  einvoice,
  disabled,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    const toastId = toast.loading("Generating e-invoice PDF...");

    try {
      // Check if this is a consolidated invoice
      const isConsolidated =
        einvoice.is_consolidated || einvoice.internal_id.startsWith("CON-");

      // Generate QR code first
      const qrDataUrl = await generateQRDataUrl(
        einvoice.uuid,
        einvoice.long_id
      );

      // Prepare the data
      const pdfData = await preparePDFData(einvoice);

      // Create PDF
      const pdfComponent = (
        <Document title={`einvoice-${einvoice.internal_id}`}>
          <EInvoicePDF
            data={pdfData}
            qrCodeData={qrDataUrl}
            isConsolidated={isConsolidated}
          />
        </Document>
      );

      // Generate PDF blob
      const pdfBlob = await pdf(pdfComponent).toBlob();
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Create and trigger download
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = `einvoice-${einvoice.internal_id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup
      URL.revokeObjectURL(pdfUrl);
      toast.success("E-invoice PDF downloaded successfully", { id: toastId });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error(
        `Failed to generate e-invoice PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { id: toastId }
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={disabled || isGenerating}
      icon={isGenerating ? IconFileDownload : IconDownload}
      iconSize={16}
      iconStroke={2}
      variant="outline"
      size="sm"
    >
      {isGenerating ? "Generating..." : "Download"}
    </Button>
  );
};

export default EInvoicePDFHandler;
