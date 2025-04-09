import { useEffect, useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import GTInvoicePDF from "./GTInvoicePDF"; // Use GT PDF component
import { InvoiceGT } from "../../../types/types";
import toast from "react-hot-toast";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { generateGTPDFFilename } from "./generateGTPDFFilename";
import { generateQRDataUrl } from "../../invoice/einvoice/generateQRCode";

const GTPrintPDFOverlay = ({
  invoices,
  onComplete,
}: {
  invoices: InvoiceGT[]; // Expecting detailed InvoiceGT objects
  onComplete: () => void;
}) => {
  const [isPrinting, setIsPrinting] = useState(true);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isLoadingDialogVisible, setIsLoadingDialogVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasPrintedRef = useRef(false);
  const resourcesRef = useRef<{
    printFrame: HTMLIFrameElement | null;
    pdfUrl: string | null;
  }>({
    printFrame: null,
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
      resourcesRef.current = { printFrame: null, pdfUrl: null };
      setIsPrinting(false);
      onComplete();
    }
    setIsGenerating(false);
    setIsLoadingDialogVisible(false);
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
              try {
                printFrame.contentWindow?.focus(); // Focus is important for print dialog
                printFrame.contentWindow?.print();
                cleanup(); // Hide loading dialog, wait for user interaction
              } catch (printError) {
                console.error("Print dialog error:", printError);
                setError("Could not open print dialog.");
                cleanup(true); // Full cleanup on error
              }
            }, 500);

            // Fallback cleanup mechanism
            const onFocus = () => {
              window.removeEventListener("focus", onFocus);
              clearTimeout(fallbackTimeout);
              cleanup(true); // Full cleanup after user interaction
            };
            window.addEventListener("focus", onFocus);

            const fallbackTimeout = setTimeout(() => {
              console.warn("Print dialog focus timeout, cleaning up.");
              window.removeEventListener("focus", onFocus);
              cleanup(true); // Full cleanup after timeout
            }, 60000); // 60 seconds timeout
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
  }, [invoices, isPrinting]); // Removed onComplete from dependencies to avoid loop

  return isLoadingDialogVisible ? (
    <div className="fixed inset-0 flex items-center justify-center z-[100]">
      {/* Ensure high z-index */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 min-w-[240px] transform scale-100">
        {/* Use scale-100 */}
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner size="sm" hideText />
          <p className="text-base font-medium text-default-900">
            {isGenerating ? "Preparing document..." : "Opening print dialog..."}
          </p>
          {error && (
            <p className="text-sm text-rose-600 mt-2 text-center">{error}</p>
          )}
          <button
            onClick={() => {
              cleanup(true);
            }}
            className="mt-2 text-sm text-center text-sky-600 hover:underline"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  ) : null;
};
export default GTPrintPDFOverlay;
