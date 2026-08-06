import { useEffect, useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import GTInvoicePDF from "./GTInvoicePDF"; // Use GT PDF component
import { InvoiceGT } from "../../../types/types";
import toast from "react-hot-toast";
import LoadingSpinner from "../../../components/LoadingSpinner";
import PaperSizePicker from "../../../components/PaperSizePicker";
import { usePaperSizePreference } from "../../pdf/paperSize";
import { generateGTPDFFilename } from "./generateGTPDFFilename";
import { generateQRDataUrl } from "../../invoice/einvoice/generateQRCode";
import {
  printPdfFrameWithFallback,
  type PrintPdfFrameResult,
} from "../../pdfPrintFallback";
import { useTranslation } from "react-i18next";

const GTPrintPDFOverlay = ({
  invoices,
  onComplete,
}: {
  invoices: InvoiceGT[]; // Expecting detailed InvoiceGT objects
  onComplete: () => void;
}) => {
  const { t } = useTranslation("common");
  const [paperSize, setPaperSize] = usePaperSizePreference();
  const [isPrinting, setIsPrinting] = useState(true);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isLoadingDialogVisible, setIsLoadingDialogVisible] = useState(true);
  const [showPostPrint, setShowPostPrint] = useState(false);
  const [printRun, setPrintRun] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hasPrintedRef = useRef(false);
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

  const cleanup = (fullCleanup = false) => {
    if (fullCleanup) {
      releaseResources();
      setIsPrinting(false);
      setShowPostPrint(false);
      onComplete();
    }
    setIsGenerating(false);
    setIsLoadingDialogVisible(false);
  };

  // Regenerate at the currently selected paper size and print again.
  const handlePrintAgain = () => {
    releaseResources();
    hasPrintedRef.current = false;
    setError(null);
    setShowPostPrint(false);
    setIsGenerating(true);
    setIsLoadingDialogVisible(true);
    setPrintRun((run) => run + 1);
  };

  useEffect(() => {
    const generateAndPrint = async () => {
      if (hasPrintedRef.current || !invoices || invoices.length === 0) return;

      try {
        // Generate QR codes for invoices with valid UUIDs and long IDs
        const pdfPages = await Promise.all(
          invoices.map(async (invoice) => {
            let qrCodeData = null;
            if (
              invoice.uuid &&
              invoice.long_id &&
              invoice.einvoice_status === "valid"
            ) {
              try {
                qrCodeData = await generateQRDataUrl(
                  invoice.uuid,
                  invoice.long_id
                );
              } catch (error) {
                console.error(
                  `Error generating QR code for invoice ${invoice.invoice_number}:`,
                  error
                );
              }
            }
            return (
              <GTInvoicePDF
                key={invoice.invoice_id}
                invoice={invoice}
                qrCodeData={qrCodeData}
                paperSize={paperSize}
              />
            );
          })
        );

        const pdfComponent = (
          <Document title={generateGTPDFFilename(invoices).replace(".pdf", "")}>
            {pdfPages}
          </Document>
        );

        const pdfBlob = await pdf(pdfComponent).toBlob();
        const pdfUrl = URL.createObjectURL(pdfBlob);
        resourcesRef.current.pdfUrl = pdfUrl;
        setIsGenerating(false); // PDF blob generated

        const printFrame = document.createElement("iframe");
        printFrame.style.position = "absolute";
        printFrame.style.width = "0";
        printFrame.style.height = "0";
        printFrame.style.border = "0";
        printFrame.style.left = "-9999px"; // Hide the iframe
        document.body.appendChild(printFrame);
        resourcesRef.current.printFrame = printFrame;

        printFrame.onload = () => {
          if (!hasPrintedRef.current && printFrame?.contentWindow) {
            hasPrintedRef.current = true;
            // Small delay for content rendering in iframe
            setTimeout(() => {
              const printResult: PrintPdfFrameResult = printPdfFrameWithFallback(
                printFrame,
                pdfUrl,
                {
                  focusBeforePrint: true,
                  logLabel: "Green Target invoice PDF",
                }
              );
              if (printResult.opened) {
                // Keep the dialog open as a post-print panel (paper size +
                // Print Again + Close) instead of closing silently.
                setIsGenerating(false);
                setIsLoadingDialogVisible(false);
                setShowPostPrint(true);
              } else {
                setError("Could not open print dialog.");
                cleanup(true); // Full cleanup on error
              }
            }, 500);
          }
        };

        printFrame.onerror = (e) => {
          console.error("Iframe loading error:", e);
          setError("Failed to load document for printing.");
          cleanup(true);
        };

        printFrame.src = pdfUrl;
      } catch (error) {
        console.error("Error generating PDF for print:", error);
        setError(error instanceof Error ? error.message : "Unknown error");
        toast.error("Error preparing document for print. Please try again.");
        cleanup(true); // Full cleanup on error
      }
    };

    if (isPrinting) {
      generateAndPrint();
    }

    // Cleanup on unmount
    return () => {
      if (resourcesRef.current.printFrame || resourcesRef.current.pdfUrl) {
        cleanup(true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, isPrinting, printRun]); // Removed onComplete from dependencies to avoid loop

  if (isLoadingDialogVisible) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-[100]">
        {/* Ensure high z-index */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 min-w-[240px] transform scale-100">
          {/* Use scale-100 */}
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner size="sm" hideText />
            <p className="text-base font-medium text-default-900 dark:text-gray-100">
              {isGenerating ? "Preparing document..." : "Opening print dialog..."}
            </p>
            {error && (
              <p className="text-sm text-rose-600 dark:text-rose-400 mt-2 text-center">{error}</p>
            )}
            <button
              onClick={() => {
                cleanup(true);
              }}
              className="mt-1 text-sm text-center text-sky-600 dark:text-sky-400 hover:underline"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showPostPrint) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-[100]">
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
                onClick={() => {
                  cleanup(true);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors duration-150"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
export default GTPrintPDFOverlay;
