// src/utils/invoice/PDF/PrintPDFOverlay.tsx
import { useEffect, useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import InvoicePDF from "./InvoicePDF";
import { InvoiceData } from "../../../types/types";
import toast from "react-hot-toast";
import { generatePDFFilename } from "./generatePDFFilename";
import LoadingSpinner from "../../../components/LoadingSpinner";

const PrintPDFOverlay = ({
  invoices,
  onComplete,
  customerNames = {},
}: {
  invoices: InvoiceData[];
  onComplete: () => void;
  customerNames: Record<string, string>;
}) => {
  const [isPrinting, setIsPrinting] = useState(true);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isLoadingDialogVisible, setIsLoadingDialogVisible] = useState(true);
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

  const cleanup = (fullCleanup = false) => {
    if (fullCleanup) {
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
      setIsPrinting(false);
      onComplete();
    }
    setIsGenerating(false);
    setIsLoadingDialogVisible(false);
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
              printFrame.contentWindow?.print();
              cleanup(); // Hide loading dialog only
            }, 500);

            const onFocus = () => {
              window.removeEventListener("focus", onFocus);
              clearTimeout(fallbackTimeout);
              cleanup(true); // Full cleanup
            };
            window.addEventListener("focus", onFocus);

            const fallbackTimeout = setTimeout(() => {
              window.removeEventListener("focus", onFocus);
              cleanup(true); // Full cleanup after 60 seconds
            }, 60000);
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
  }, [invoices, isPrinting, onComplete]);

  return isLoadingDialogVisible ? (
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
  ) : null;
};
export default PrintPDFOverlay;
