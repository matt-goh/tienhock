import React, { useEffect, useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import InvoisPDF from "./InvoisPDF";
import { InvoiceData } from "../../types/types";
import toast from "react-hot-toast";
import { generatePDFFilename } from "./generatePDFFilename";
import LoadingSpinner from "../../components/LoadingSpinner";

const PrintPDFOverlay = ({
  invoices,
  onComplete,
}: {
  invoices: InvoiceData[];
  onComplete: () => void;
}) => {
  const [isPrinting, setIsPrinting] = useState(true);
  const [isGenerating, setIsGenerating] = useState(true);
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

  useEffect(() => {
    const cleanup = () => {
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
      setIsGenerating(false);
      onComplete();
    };

    const generateAndPrint = async () => {
      if (hasPrintedRef.current) return;

      try {
        // Create a temporary div to mount the PDF renderer
        const container = document.createElement("div");
        container.style.position = "absolute";
        container.style.left = "-9999px";
        document.body.appendChild(container);
        resourcesRef.current.container = container;

        // First render the PDF to ensure it's properly initialized
        const pdfComponent = (
          <Document title={generatePDFFilename(invoices).replace(".pdf", "")}>
            <InvoisPDF invoices={invoices} />
          </Document>
        );

        // Generate PDF blob
        const pdfBlob = await pdf(pdfComponent).toBlob();
        const pdfUrl = URL.createObjectURL(pdfBlob);
        resourcesRef.current.pdfUrl = pdfUrl;
        setIsGenerating(false);

        // Create hidden iframe for printing
        const printFrame = document.createElement("iframe");
        printFrame.style.display = "none";
        document.body.appendChild(printFrame);
        resourcesRef.current.printFrame = printFrame;

        // Set up print handlers
        printFrame.onload = () => {
          if (!hasPrintedRef.current && printFrame?.contentWindow) {
            hasPrintedRef.current = true;

            // Add print event listener for cleanup
            printFrame.contentWindow.onafterprint = () => {
              cleanup();
              printFrame?.contentWindow?.close();
            };

            // Trigger print dialog
            printFrame.contentWindow.print();
          }
        };

        // Load the PDF in the iframe
        printFrame.src = pdfUrl;
      } catch (error) {
        console.error("Error generating PDF:", error);
        toast.error("Error preparing document for print. Please try again.");
        cleanup();
      }
    };

    if (isPrinting) {
      generateAndPrint();
    }

    return cleanup;
  }, [invoices, isPrinting, onComplete]);

  return isPrinting ? (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl p-6 min-w-[300px] transform scale-110">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner size="sm" hideText />

          {/* Text */}
          <p className="text-base font-medium text-default-900">
            {isGenerating
              ? "Preparing document for printing..."
              : "Opening print dialog..."}
          </p>
          <p className="text-sm text-default-500">Please wait a moment</p>
        </div>
      </div>
    </div>
  ) : null;
};

export default PrintPDFOverlay;
