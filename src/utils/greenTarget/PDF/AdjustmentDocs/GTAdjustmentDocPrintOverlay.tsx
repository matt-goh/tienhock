// src/utils/greenTarget/PDF/AdjustmentDocs/GTAdjustmentDocPrintOverlay.tsx
import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import { GTAdjustmentDocFull } from "../../../../services/gt-adjustment-doc-pdf.service";
import { generateGTAdjustmentDocPDFBlob } from "./GTAdjustmentDocPDFHandler";
import { printPdfFrameWithFallback } from "../../../pdfPrintFallback";

const GTAdjustmentDocPrintOverlay = ({
  docs,
  onComplete,
}: {
  docs: GTAdjustmentDocFull[];
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
      if (hasPrintedRef.current || !docs || docs.length === 0) return;

      try {
        const pdfBlob = await generateGTAdjustmentDocPDFBlob(docs);
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
            setTimeout(() => {
              printPdfFrameWithFallback(printFrame, pdfUrl, {
                logLabel: "Green Target adjustment document PDF",
              });
              cleanup();
            }, 500);

            const onFocus = () => {
              window.removeEventListener("focus", onFocus);
              clearTimeout(fallbackTimeout);
              cleanup(true);
            };
            window.addEventListener("focus", onFocus);

            const fallbackTimeout = setTimeout(() => {
              window.removeEventListener("focus", onFocus);
              cleanup(true);
            }, 60000);
          }
        };

        printFrame.onerror = (e) => {
          console.error("Iframe loading error:", e);
          setError("Failed to load document for printing.");
          cleanup(true);
        };

        printFrame.src = pdfUrl;
      } catch (err) {
        console.error("Error generating PDF for print:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        toast.error("Error preparing document for print. Please try again.");
        cleanup(true);
      }
    };

    if (isPrinting) {
      generateAndPrint();
    }

    return () => {
      if (resourcesRef.current.printFrame || resourcesRef.current.pdfUrl) {
        cleanup(true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, isPrinting]);

  return isLoadingDialogVisible ? (
    <div className="fixed inset-0 flex items-center justify-center z-[100]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 min-w-[240px]">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner size="sm" hideText />
          <p className="text-base font-medium text-default-900 dark:text-gray-100">
            {isGenerating ? "Preparing document..." : "Opening print dialog..."}
          </p>
          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400 mt-2 text-center">
              {error}
            </p>
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
  ) : null;
};

export default GTAdjustmentDocPrintOverlay;
