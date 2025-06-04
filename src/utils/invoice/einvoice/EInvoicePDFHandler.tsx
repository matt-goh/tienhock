// src/utils/invoice/einvoice/EInvoicePDFHandler.tsx
import React, { useState } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import Button from "../../../components/Button";
import toast from "react-hot-toast";
import {
  preparePDFData,
  prepareBatchPDFData,
} from "../../../services/einvoice-pdf.service";
import { generateQRDataUrl } from "./generateQRCode";
import EInvoicePDF from "./EInvoicePDF";
import { ExtendedInvoiceData } from "../../../types/types";
import { api } from "../../../routes/utils/api";

interface PDFDownloadHandlerProps {
  einvoice?: any; // Single einvoice in original format
  invoices?: ExtendedInvoiceData[]; // Multiple invoices in ExtendedInvoiceData format
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

const EInvoicePDFHandler: React.FC<PDFDownloadHandlerProps> = ({
  einvoice,
  invoices,
  disabled,
  size = "sm",
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    if (isGenerating) return;

    const isJellyPolly = window.location.pathname.includes("/jellypolly");

    const isBatch = invoices && invoices.length > 0;
    const toastId = toast.loading(
      `Generating ${isBatch ? "e-invoices" : "e-invoice"} PDF...`
    );
    setIsGenerating(true);

    try {
      if (isBatch) {
        // For each invoice, manually fetch order details to ensure we have them
        const processedInvoices = [];

        for (const invoice of invoices) {
          try {
            // Fetch complete invoice details including products
            const endpoint = isJellyPolly
              ? `/jellypolly/api/invoices/${invoice.id}`
              : `/api/invoices/${invoice.id}`;
            const fullInvoiceData = await api.get(endpoint);

            if (fullInvoiceData) {
              processedInvoices.push({
                ...invoice,
                products: fullInvoiceData.products || [],
              });
            }
          } catch (error) {
            console.error(
              `Failed to fetch details for invoice ${invoice.id}:`,
              error
            );
            processedInvoices.push(invoice); // Use original if fetch fails
          }
        }

        // Now process with complete data
        const preparedData = await prepareBatchPDFData(processedInvoices);
        if (preparedData.length === 0) {
          throw new Error("No valid invoices could be processed");
        }

        // Create PDF pages
        const pdfPages = [];
        for (const { pdfData, invoice } of preparedData) {
          try {
            // Generate QR code only for valid e-invoices
            const qrDataUrl =
              invoice.uuid && invoice.long_id
                ? await generateQRDataUrl(invoice.uuid, invoice.long_id)
                : null;

            const isConsolidated: boolean =
              Boolean(invoice.is_consolidated) ||
              (invoice.id ? invoice.id.startsWith("CON-") : false);

            pdfPages.push(
              <EInvoicePDF
                key={invoice.id}
                data={pdfData}
                qrCodeData={qrDataUrl || ""}
                isConsolidated={isConsolidated}
                companyContext={isJellyPolly ? "jellypolly" : "tienhock"}
              />
            );
          } catch (innerError) {
            console.error(
              `Error creating PDF page for invoice ${invoice.id}:`,
              innerError
            );
            // Continue with other invoices
          }
        }

        // Generate combined PDF
        const pdfComponent = <Document title="e-invoices">{pdfPages}</Document>;

        // Download logic
        const pdfBlob = await pdf(pdfComponent).toBlob();
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement("a");
        link.href = pdfUrl;

        const filename =
          preparedData.length === 1
            ? `${isJellyPolly ? "JP" : "TH"}_einvoice-${
                preparedData[0].invoice.id
              }.pdf`
            : `${isJellyPolly ? "JP" : "TH"}_einvoices-batch-${new Date()
                .toISOString()
                .slice(0, 10)}.pdf`;

        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pdfUrl);
        toast.success(
          `${preparedData.length} e-invoice${
            preparedData.length > 1 ? "s" : ""
          } PDF downloaded successfully`,
          { id: toastId }
        );
      } else if (einvoice) {
        // Handle single einvoice (original logic)
        const isConsolidated = einvoice.is_consolidated;
        const qrDataUrl = await generateQRDataUrl(
          einvoice.uuid,
          einvoice.long_id
        );
        const pdfData = await preparePDFData(einvoice);
        const pdfComponent = (
          <Document
            title={`${isJellyPolly ? "JP" : "TH"}_einvoice-${
              einvoice.internal_id
            }`}
          >
            <EInvoicePDF
              data={pdfData}
              qrCodeData={qrDataUrl}
              isConsolidated={isConsolidated}
              companyContext={isJellyPolly ? "jellypolly" : "tienhock"}
            />
          </Document>
        );
        const pdfBlob = await pdf(pdfComponent).toBlob();
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement("a");
        link.href = pdfUrl;
        link.download = `${isJellyPolly ? "JP" : "TH"}_einvoice-${
          einvoice.internal_id
        }.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pdfUrl);
        toast.success("E-invoice PDF downloaded successfully", { id: toastId });
      } else {
        throw new Error("No invoice data provided");
      }
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
      size={size}
      data-einvoice-download="true"
      color="sky"
    >
      {isGenerating ? "Generating..." : "Download e-invoice"}
    </Button>
  );
};

export default EInvoicePDFHandler;
