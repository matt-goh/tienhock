// src/utils/adjustments/PDF/AdjustmentDocPDFHandler.tsx
import React, { useState } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { AdjustmentDocument } from "../../../types/types";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import Button from "../../../components/Button";
import AdjustmentDocPDF from "./AdjustmentDocPDF";
import toast from "react-hot-toast";
import { generateAdjustmentDocPDFFilename } from "./generateAdjustmentDocPDFFilename";
import { prepareAdjustmentDocPDFData } from "../../../services/adjustment-doc-pdf.service";
import { generateQRDataUrl } from "../../invoice/einvoice/generateQRCode";

type CompanyContext = "tienhock" | "jellypolly";

const detectCompanyContext = (): CompanyContext =>
  typeof window !== "undefined" &&
  window.location.pathname.includes("/jellypolly")
    ? "jellypolly"
    : "tienhock";

/**
 * Builds the multi-page <Document> React element for the given adjustment
 * docs. Each doc becomes a separate <Page>. Valid e-invoices get a QR code.
 * Exported so the print overlay and the list-page batch handler can render
 * the same output without duplicating the async prep.
 */
export const buildAdjustmentDocPDFDocument = async (
  docs: AdjustmentDocument[],
  companyContext: CompanyContext
): Promise<React.ReactElement> => {
  const prepared = await Promise.all(
    docs.map(async (doc) => {
      const data = await prepareAdjustmentDocPDFData(doc, companyContext);
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
      title={generateAdjustmentDocPDFFilename(docs, companyContext).replace(
        ".pdf",
        ""
      )}
    >
      {prepared.map(({ doc, data, qrCodeData }) => (
        <AdjustmentDocPDF
          key={doc.id}
          data={data}
          qrCodeData={qrCodeData}
          companyContext={companyContext}
        />
      ))}
    </Document>
  );
};

/**
 * Convenience: build the document and convert to a Blob, ready to download
 * or load into a print iframe.
 */
export const generateAdjustmentDocPDFBlob = async (
  docs: AdjustmentDocument[],
  companyContext: CompanyContext
): Promise<Blob> => {
  const document = await buildAdjustmentDocPDFDocument(docs, companyContext);
  return pdf(document).toBlob();
};

interface AdjustmentDocPDFHandlerProps {
  docs: AdjustmentDocument[];
  disabled?: boolean;
  onComplete?: () => void;
}

const AdjustmentDocPDFHandler: React.FC<AdjustmentDocPDFHandlerProps> = ({
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
      const companyContext = detectCompanyContext();
      const pdfBlob = await generateAdjustmentDocPDFBlob(docs, companyContext);
      const pdfUrl = URL.createObjectURL(pdfBlob);

      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = generateAdjustmentDocPDFFilename(docs, companyContext);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(pdfUrl);
      toast.success("PDF downloaded successfully", { id: toastId });
      if (onComplete) onComplete();
    } catch (error) {
      console.error("Error generating adjustment doc PDF:", error);
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

export default AdjustmentDocPDFHandler;
