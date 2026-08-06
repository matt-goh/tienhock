// src/utils/invoice/einvoice/EInvoicePrintHandler.tsx
import React, { useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { IconPrinter } from "@tabler/icons-react";
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
import PaperSizePicker from "../../../components/PaperSizePicker";
import { usePaperSizePreference } from "../../pdf/paperSize";
import { printPdfFrameWithFallback } from "../../pdfPrintFallback";
import { useTranslation } from "react-i18next";

interface PrintHandlerProps {
  einvoice?: any; // Single einvoice in original format
  invoices?: ExtendedInvoiceData[]; // Multiple invoices in ExtendedInvoiceData format
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  onComplete?: () => void;
}

const EInvoicePrintHandler: React.FC<PrintHandlerProps> = ({
  einvoice,
  invoices,
  disabled,
  size = "sm",
  onComplete,
}) => {
  const { t } = useTranslation("common");
  const [paperSize, setPaperSize] = usePaperSizePreference();
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingDialogVisible, setIsLoadingDialogVisible] = useState(false);
  const [showPostPrint, setShowPostPrint] = useState(false);
  const resourcesRef = useRef<{
    printFrame: HTMLIFrameElement | null;
    pdfUrl: string | null;
  }>({
    printFrame: null,
    pdfUrl: null,
  });

  const releaseResources = () => {
    if (resourcesRef.current.pdfUrl) {
      URL.revokeObjectURL(resourcesRef.current.pdfUrl);
    }
    if (
      resourcesRef.current.printFrame &&
      resourcesRef.current.printFrame.parentNode
    ) {
      document.body.removeChild(resourcesRef.current.printFrame);
    }
    resourcesRef.current = { printFrame: null, pdfUrl: null };
  };

  // Full close: release the iframe/blob and notify the parent (replaces the
  // old focus-return auto-close, which would shut the post-print panel).
  const closeAfterPrint = () => {
    releaseResources();
    setIsPrinting(false);
    setIsGenerating(false);
    setIsLoadingDialogVisible(false);
    setShowPostPrint(false);

    if (onComplete) {
      onComplete();
    }
  };

  // Called once the print dialog has opened: keep a post-print panel (paper
  // size + Print Again + Close) instead of closing silently.
  const showPostPrintPanel = (
    printFrame: HTMLIFrameElement,
    pdfUrl: string
  ) => {
    resourcesRef.current = { printFrame, pdfUrl };
    setIsGenerating(false);
    setIsLoadingDialogVisible(false);
    setIsPrinting(false);
    setShowPostPrint(true);
  };

  const handlePrint = async () => {
    if (isGenerating || isPrinting) return;

    const isBatch = invoices && invoices.length > 0;
    const isJellyPolly = window.location.pathname.includes("/jellypolly");
    setIsGenerating(true);
    setIsLoadingDialogVisible(true);
    setIsPrinting(true);

    try {
      if (isBatch) {
        // For each invoice, manually fetch order details to ensure we have them
        const processedInvoices = [];

        for (const invoice of invoices) {
          try {
            // Fetch complete invoice details including products
            const fullInvoiceData = await api.get(
              `/api/invoices/${invoice.id}`
            );

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
        const preparedData = await prepareBatchPDFData(
          processedInvoices,
          isJellyPolly ? "jellypolly" : "tienhock"
        );
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
                paperSize={paperSize}
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

        // Create PDF blob and print it
        const pdfBlob = await pdf(pdfComponent).toBlob();
        const pdfUrl = URL.createObjectURL(pdfBlob);

        // Create print frame
        const printFrame = document.createElement("iframe");
        printFrame.style.display = "none";
        document.body.appendChild(printFrame);

        printFrame.onload = () => {
          if (printFrame?.contentWindow) {
            // Use a slight delay to ensure content is fully loaded
            setTimeout(() => {
              printPdfFrameWithFallback(printFrame, pdfUrl, {
                logLabel: "e-invoice PDF",
              });
              toast.success("Print dialog opened");
              showPostPrintPanel(printFrame, pdfUrl);
            }, 500);
          }
        };

        printFrame.src = pdfUrl;
      } else if (einvoice) {
        // Handle single einvoice logic
        const isConsolidated =
          einvoice.is_consolidated
        const qrDataUrl = await generateQRDataUrl(
          einvoice.uuid,
          einvoice.long_id
        );
        const pdfData = await preparePDFData(
          einvoice,
          isJellyPolly ? "jellypolly" : "tienhock"
        );
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
              paperSize={paperSize}
            />
          </Document>
        );

        const pdfBlob = await pdf(pdfComponent).toBlob();
        const pdfUrl = URL.createObjectURL(pdfBlob);

        // Print logic
        const printFrame = document.createElement("iframe");
        printFrame.style.display = "none";
        document.body.appendChild(printFrame);

        printFrame.onload = () => {
          if (printFrame?.contentWindow) {
            setTimeout(() => {
              printPdfFrameWithFallback(printFrame, pdfUrl, {
                logLabel: "e-invoice PDF",
              });
              toast.success("Print dialog opened");
              showPostPrintPanel(printFrame, pdfUrl);
            }, 500);
          }
        };

        printFrame.src = pdfUrl;
      } else {
        throw new Error("No invoice data provided");
      }
    } catch (error) {
      console.error("Error printing PDF:", error);
      toast.error(
        `Failed to print e-invoice: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setIsPrinting(false);
      setIsGenerating(false);
      setIsLoadingDialogVisible(false);
    }
  };

  // Regenerate at the currently selected paper size and print again.
  const handlePrintAgain = () => {
    releaseResources();
    setShowPostPrint(false);
    handlePrint();
  };

  return (
    <>
      <Button
        onClick={handlePrint}
        disabled={disabled || isGenerating || isPrinting}
        icon={IconPrinter}
        iconSize={16}
        iconStroke={2}
        variant="outline"
        size={size}
        data-einvoice-print="true"
      >
        Print
      </Button>

      {isLoadingDialogVisible && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 min-w-[300px] transform scale-110">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-gray-100 dark:border-gray-700 border-t-sky-500 dark:border-t-sky-400 rounded-full animate-spin" />
              <p className="text-base font-medium text-default-900 dark:text-gray-100">
                {isGenerating
                  ? "Preparing document for printing..."
                  : "Opening print dialog..."}
              </p>
              <button
                onClick={() => {
                  setIsLoadingDialogVisible(false);
                  setIsPrinting(false);
                  setIsGenerating(false);
                }}
                className="mt-1 text-sm text-center text-sky-600 dark:text-sky-400 hover:underline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPostPrint && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 min-w-[300px]">
            <div className="flex flex-col items-center gap-3">
              <p className="text-base font-medium text-default-900 dark:text-gray-100">
                {t("Paper Size")}
              </p>
              <PaperSizePicker
                value={paperSize}
                onChange={setPaperSize}
                compact
              />
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handlePrintAgain}
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 transition-colors duration-150"
                >
                  {t("Print Again")}
                </button>
                <button
                  onClick={closeAfterPrint}
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors duration-150"
                >
                  {t("close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EInvoicePrintHandler;
