// src/utils/greenTarget/PDF/AdjustmentDocs/GTAdjustmentDocPDFHandler.tsx
import React, { useState } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import Button from "../../../../components/Button";
import GTAdjustmentDocPDF from "./GTAdjustmentDocPDF";
import { generateGTAdjustmentDocPDFFilename } from "./generateGTAdjustmentDocPDFFilename";
import {
  GTAdjustmentDocFull,
  prepareGTAdjustmentDocPDFData,
} from "../../../../services/gt-adjustment-doc-pdf.service";
import { generateQRDataUrl } from "../../../invoice/einvoice/generateQRCode";
import toast from "react-hot-toast";

/**
 * Builds the multi-page <Document> React element for the given GT
 * adjustment docs. Each doc becomes its own <Page>. Valid e-invoices get a
 * QR code.
 */
export const buildGTAdjustmentDocPDFDocument = async (
  docs: GTAdjustmentDocFull[]
): Promise<React.ReactElement> => {
  const prepared = await Promise.all(
    docs.map(async (doc) => {
      const data = await prepareGTAdjustmentDocPDFData(doc);
      let qrCodeData: string | null = null;
      if (
        doc.einvoice_status === "valid" &&
        doc.uuid &&
        doc.long_id
      ) {
        try {
          qrCodeData = await generateQRDataUrl(doc.uuid, doc.long_id);
        } catch (err) {
          console.warn(`QR generation failed for ${doc.id}:`, err);
        }
      }
      return { doc, data, qrCodeData };
    })
  );

  return (
    <Document
      title={generateGTAdjustmentDocPDFFilename(docs).replace(".pdf", "")}
    >
      {prepared.map(({ doc, data, qrCodeData }) => (
        <GTAdjustmentDocPDF key={doc.id} data={data} qrCodeData={qrCodeData} />
      ))}
    </Document>
  );
};

export const generateGTAdjustmentDocPDFBlob = async (
  docs: GTAdjustmentDocFull[]
): Promise<Blob> => {
  const document = await buildGTAdjustmentDocPDFDocument(docs);
  return pdf(document).toBlob();
};

interface GTAdjustmentDocPDFHandlerProps {
  docs: GTAdjustmentDocFull[];
  disabled?: boolean;
  onComplete?: () => void;
}

const GTAdjustmentDocPDFHandler: React.FC<GTAdjustmentDocPDFHandlerProps> = ({
  docs,
  disabled,
  onComplete,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    if (isGenerating || disabled) return;
    setIsGenerating(true);
    const isBatch = docs.length > 1;
    const toastId = toast.loading(
      isBatch
        ? `Generating PDF for ${docs.length} documents...`
        : "Generating PDF..."
    );

    try {
      const pdfBlob = await generateGTAdjustmentDocPDFBlob(docs);
      const pdfUrl = URL.createObjectURL(pdfBlob);

      const filename = generateGTAdjustmentDocPDFFilename(docs);

      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(pdfUrl);
      toast.success("PDF downloaded successfully", { id: toastId });
      if (onComplete) onComplete();
    } catch (error) {
      console.error("Error generating GT adjustment doc PDF:", error);
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

  const buttonLabel = isGenerating
    ? "Generating..."
    : docs.length > 1
    ? `Download ${docs.length} PDFs`
    : "Download";

  if (!docs || docs.length === 0) return null;

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

export default GTAdjustmentDocPDFHandler;
