// src/utils/invoice/PDF/InvoiceSoloPDFHandler.tsx
import React, { useState } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { ExtendedInvoiceData } from "../../../types/types";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import Button from "../../../components/Button";
import InvoicePDF from "./InvoicePDF";
import InvoiceSoloPDF from "../einvoice/InvoiceSoloPDF";
import EInvoicePDF from "../einvoice/EInvoicePDF";
import toast from "react-hot-toast";
import { generatePDFFilename } from "./generatePDFFilename";
import { preparePDFDataFromInvoice } from "../../../services/einvoice-pdf.service";
import { generateQRDataUrl } from "../einvoice/generateQRCode";

interface InvoiceSoloPDFHandlerProps {
  invoices: ExtendedInvoiceData[];
  disabled?: boolean;
  customerNames: Record<string, string>;
  onComplete?: () => void;
}

const InvoiceSoloPDFHandler: React.FC<InvoiceSoloPDFHandlerProps> = ({
  invoices,
  disabled,
  customerNames = {},
  onComplete,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    if (isGenerating || disabled) return;

    setIsGenerating(true);
    const isSingleInvoice = invoices.length === 1;
    const toastId = toast.loading(
      isSingleInvoice
        ? "Generating PDF..."
        : `Generating PDFs for ${invoices.length} invoices...`
    );

    try {
      const isJellyPolly = window.location.pathname.includes("/jellypolly");
      const companyContext = isJellyPolly ? "jellypolly" : "tienhock";

      let pdfComponent;

      if (isSingleInvoice) {
        const invoice = invoices[0];
        const eInvoiceData = await preparePDFDataFromInvoice(
          invoice,
          companyContext
        );

        // Check if invoice has valid e-invoice status
        if (invoice.einvoice_status === "valid" && invoice.uuid) {
          // Use full EInvoicePDF with QR code for valid e-invoices
          const qrCodeData = invoice.uuid && invoice.long_id 
            ? await generateQRDataUrl(invoice.uuid, invoice.long_id)
            : "";

          pdfComponent = (
            <Document
              title={generatePDFFilename(invoices, companyContext).replace(".pdf", "")}
            >
              <EInvoicePDF
                data={eInvoiceData}
                qrCodeData={qrCodeData}
                companyContext={companyContext}
              />
            </Document>
          );
        } else {
          // Use InvoiceSoloPDF for non-e-invoice or invalid e-invoices
          pdfComponent = (
            <Document
              title={generatePDFFilename(invoices, companyContext).replace(".pdf", "")}
            >
              <InvoiceSoloPDF
                data={eInvoiceData}
                companyContext={companyContext}
              />
            </Document>
          );
        }
      } else {
        // Use regular InvoicePDF for multiple invoices
        pdfComponent = (
          <Document
            title={generatePDFFilename(invoices, companyContext).replace(".pdf", "")}
          >
            <InvoicePDF
              invoices={invoices}
              customerNames={customerNames}
              companyContext={companyContext}
            />
          </Document>
        );
      }

      // Generate PDF blob
      const pdfBlob = await pdf(pdfComponent).toBlob();
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Create and trigger download
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = generatePDFFilename(invoices, companyContext);
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

export default InvoiceSoloPDFHandler;