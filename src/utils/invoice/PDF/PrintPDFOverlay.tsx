// src/utils/invoice/PDF/PrintPDFOverlay.tsx
import { useEffect, useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import InvoicePDF from "./InvoicePDF";
import { InvoiceData } from "../../../types/types";
import toast from "react-hot-toast";
import { generatePDFFilename } from "./generatePDFFilename";
import LoadingSpinner from "../../../components/LoadingSpinner";
import PaperSizePicker from "../../../components/PaperSizePicker";
import { usePaperSizePreference } from "../../pdf/paperSize";
import { printPdfFrameWithFallback } from "../../pdfPrintFallback";
import { useTranslation } from "react-i18next";

const PrintPDFOverlay = ({
  invoices,
  onComplete,
  customerNames = {},
}: {
  invoices: InvoiceData[];
  onComplete: () => void;
  customerNames: Record<string, string>;
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
    container: HTMLDivElement | null;
    pdfUrl: string | null;
  }>({
    printFrame: null,
    container: null,
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
    if (
      resourcesRef.current.container &&
      resourcesRef.current.container.parentNode
    ) {
      document.body.removeChild(resourcesRef.current.container);
    }
    resourcesRef.current = {
      printFrame: null,
      container: null,
      pdfUrl: null,
    };
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
      if (hasPrintedRef.current) return;

      try {
        const container = document.createElement("div");
        container.style.position = "absolute";
        container.style.left = "-9999px";
        document.body.appendChild(container);
        resourcesRef.current.container = container;

        const isJellyPolly = window.location.pathname.includes("/jellypolly");

        const pdfComponent = (
          <Document
            title={generatePDFFilename(
              invoices,
              isJellyPolly ? "jellypolly" : "tienhock"
            ).replace(".pdf", "")}
          >
            <InvoicePDF
              invoices={invoices}
              customerNames={customerNames}
              companyContext={isJellyPolly ? "jellypolly" : "tienhock"}
              paperSize={paperSize}
            />
          </Document>
        );

        const pdfBlob = await pdf(pdfComponent).toBlob();
        const pdfUrl = URL.createObjectURL(pdfBlob);
        resourcesRef.current.pdfUrl = pdfUrl;
        setIsGenerating(false);

        const printFrame = document.createElement("iframe");
        printFrame.style.display = "none";
        document.body.appendChild(printFrame);
        resourcesRef.current.printFrame = printFrame;

        printFrame.onload = () => {
          if (!hasPrintedRef.current && printFrame?.contentWindow) {
            hasPrintedRef.current = true;
            // Use a slight delay to ensure content is fully loaded
            setTimeout(() => {
              printPdfFrameWithFallback(printFrame, pdfUrl, {
                logLabel: "invoice PDF",
              });
              // Keep the dialog open as a post-print panel (paper size +
              // Print Again + Close) instead of closing silently.
              setIsGenerating(false);
              setIsLoadingDialogVisible(false);
              setShowPostPrint(true);
            }, 500);
          }
        };

        printFrame.src = pdfUrl;
      } catch (error) {
        console.error("Error generating PDF:", error);
        setError(error instanceof Error ? error.message : "Unknown error");
        toast.error("Error preparing document for print. Please try again.");
        cleanup(true);
      }
    };

    if (isPrinting) {
      generateAndPrint();
    }

    return () => {
      if (
        resourcesRef.current.printFrame ||
        resourcesRef.current.container ||
        resourcesRef.current.pdfUrl
      ) {
        cleanup(true);
      }
    };
  }, [invoices, isPrinting, onComplete, printRun]);

  if (isLoadingDialogVisible) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 min-w-[300px] transform scale-110">
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner size="sm" hideText />
            <p className="text-base font-medium text-default-900 dark:text-gray-100">
              {isGenerating
                ? "Preparing document for printing..."
                : "Opening print dialog..."}
            </p>
            <p className="text-sm text-default-500 dark:text-gray-400">Please wait a moment</p>
            {error && (
              <p className="text-sm text-rose-600 dark:text-rose-400 mt-2 text-center">{error}</p>
            )}
            <button
              onClick={() => {
                cleanup(true);
              }}
              className="mt-2 text-sm text-center text-sky-600 dark:text-sky-400 hover:underline"
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
export default PrintPDFOverlay;
