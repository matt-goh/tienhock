// src/utils/invoice/PDF/InvoiceSoloPrintOverlay.tsx
import React, { useEffect, useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { ExtendedInvoiceData } from "../../../types/types";
import InvoicePDF from "./InvoicePDF";
import InvoiceSoloPDF from "../einvoice/InvoiceSoloPDF";
import EInvoicePDF from "../einvoice/EInvoicePDF";
import LoadingSpinner from "../../../components/LoadingSpinner";
import toast from "react-hot-toast";
import { generatePDFFilename } from "./generatePDFFilename";
import { preparePDFDataFromInvoice } from "../../../services/einvoice-pdf.service";
import { generateQRDataUrl } from "../einvoice/generateQRCode";

interface InvoiceSoloPrintOverlayProps {
  invoices: ExtendedInvoiceData[];
  customerNames?: Record<string, string>;
  onComplete: () => void;
}

const InvoiceSoloPrintOverlay: React.FC<InvoiceSoloPrintOverlayProps> = ({
  invoices,
  customerNames = {},
  onComplete,
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
        const companyContext = isJellyPolly ? "jellypolly" : "tienhock";
        const isSingleInvoice = invoices.length === 1;

        let pdfComponent;

        if (isSingleInvoice) {
          const invoice = invoices[0];
          
          // Check if invoice has valid e-invoice status
          if (invoice.einvoice_status === "valid" && invoice.uuid) {
            // Use full EInvoicePDF with QR code for valid e-invoices
            const eInvoiceData = await preparePDFDataFromInvoice(
              invoice,
              companyContext
            );

            // Generate QR code data URL
            const qrCodeData = invoice.uuid && invoice.long_id 
              ? await generateQRDataUrl(invoice.uuid, invoice.long_id)
              : "";

            pdfComponent = (
              <Document
                title={generatePDFFilename([invoice], companyContext).replace(".pdf", "")}
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
            const eInvoiceData = await preparePDFDataFromInvoice(
              invoice,
              companyContext
            );

            pdfComponent = (
              <Document
                title={generatePDFFilename([invoice], companyContext).replace(".pdf", "")}
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
  }, [invoices, isPrinting, onComplete, customerNames]);

  return isLoadingDialogVisible ? (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-2xl p-6 border border-default-200">
        <div className="flex items-center space-x-4">
          <LoadingSpinner hideText/>
          <div>
            <p className="text-default-800 font-medium">
              {isGenerating ? "Generating PDF..." : "Opening print dialog..."}
            </p>
            <p className="text-default-600 text-sm mt-1">
              {isGenerating
                ? "Please wait while we prepare your document"
                : "The print dialog should open shortly"}
            </p>
          </div>
        </div>
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  ) : null;
};

export default InvoiceSoloPrintOverlay;