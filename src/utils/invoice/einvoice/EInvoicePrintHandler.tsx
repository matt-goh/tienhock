// src/utils/invoice/einvoice/EInvoicePrintHandler.tsx
import React, { useState } from "react";
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
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingDialogVisible, setIsLoadingDialogVisible] = useState(false);

  const cleanup = (
    resourceFrame: HTMLIFrameElement | null,
    pdfUrl: string | null
  ) => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    if (resourceFrame && resourceFrame.parentNode) {
      document.body.removeChild(resourceFrame);
    }
    setIsPrinting(false);
    setIsGenerating(false);
    setIsLoadingDialogVisible(false);

    if (onComplete) {
      onComplete();
    }
  };

  const handlePrint = async () => {
    if (isGenerating || isPrinting) return;

    const isBatch = invoices && invoices.length > 0;
    const toastId = toast.loading(
      `Preparing ${isBatch ? "e-invoices" : "e-invoice"} for printing...`
    );
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

            const isJellyPolly =
              window.location.pathname.includes("/jellypolly");

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
              printFrame.contentWindow?.print();
              setIsGenerating(false);
              setIsLoadingDialogVisible(false);
              toast.success("Print dialog opened", { id: toastId });

              // Set a cleanup function when focus returns to window (print dialog closed)
              const onFocus = () => {
                window.removeEventListener("focus", onFocus);
                cleanup(printFrame, pdfUrl);
              };
              window.addEventListener("focus", onFocus);

              // Fallback cleanup after 60 seconds in case focus event doesn't fire
              setTimeout(() => {
                window.removeEventListener("focus", onFocus);
                cleanup(printFrame, pdfUrl);
              }, 60000);
            }, 500);
          }
        };

        printFrame.src = pdfUrl;
      } else if (einvoice) {
        // Handle single einvoice logic
        const isConsolidated =
          einvoice.is_consolidated ||
          einvoice.internal_id.startsWith("TH_CON-");
        const qrDataUrl = await generateQRDataUrl(
          einvoice.uuid,
          einvoice.long_id
        );
        const pdfData = await preparePDFData(einvoice);
        const pdfComponent = (
          <Document title={`TH_einvoice-${einvoice.internal_id}`}>
            <EInvoicePDF
              data={pdfData}
              qrCodeData={qrDataUrl}
              isConsolidated={isConsolidated}
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
              printFrame.contentWindow?.print();
              setIsGenerating(false);
              setIsLoadingDialogVisible(false);
              toast.success("Print dialog opened", { id: toastId });

              const onFocus = () => {
                window.removeEventListener("focus", onFocus);
                cleanup(printFrame, pdfUrl);
              };
              window.addEventListener("focus", onFocus);

              setTimeout(() => {
                window.removeEventListener("focus", onFocus);
                cleanup(printFrame, pdfUrl);
              }, 60000);
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
        }`,
        { id: toastId }
      );
      setIsPrinting(false);
      setIsGenerating(false);
      setIsLoadingDialogVisible(false);
    }
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
          <div className="relative bg-white rounded-xl shadow-2xl p-6 min-w-[300px] transform scale-110">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-gray-100 border-t-sky-500 rounded-full animate-spin" />
              <p className="text-base font-medium text-default-900">
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
                className="mt-1 text-sm text-center text-sky-600 hover:underline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EInvoicePrintHandler;
