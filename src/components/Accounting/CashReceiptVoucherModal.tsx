// src/components/Accounting/CashReceiptVoucherModal.tsx
import React, { useState, useEffect, useRef, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { pdf } from "@react-pdf/renderer";
import {
  IconX,
  IconPrinter,
  IconDownload,
  IconFileText,
} from "@tabler/icons-react";
import Button from "../Button";
import LoadingSpinner from "../LoadingSpinner";
import { CashReceiptVoucherData } from "../../types/types";
import {
  CashReceiptVoucherDocument,
  downloadCashReceiptVoucherPDF,
} from "../../utils/accounting/CashReceiptVoucherPDF";
import toast from "react-hot-toast";

interface CashReceiptVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucherData: CashReceiptVoucherData | null;
}

const CashReceiptVoucherModal: React.FC<CashReceiptVoucherModalProps> = ({
  isOpen,
  onClose,
  voucherData,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  // Generate PDF URL when modal opens with data
  useEffect(() => {
    if (isOpen && voucherData) {
      generatePdfUrl();
    }

    return () => {
      // Cleanup PDF URL when modal closes
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
    };
  }, [isOpen, voucherData]);

  const generatePdfUrl = async () => {
    if (!voucherData) return;

    setIsGenerating(true);
    try {
      const blob = await pdf(
        <CashReceiptVoucherDocument data={voucherData} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate voucher preview");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = async () => {
    if (!pdfUrl) return;

    setIsPrinting(true);
    try {
      // Create hidden iframe for printing
      const printFrame = document.createElement("iframe");
      printFrame.style.display = "none";
      document.body.appendChild(printFrame);
      printFrameRef.current = printFrame;

      printFrame.onload = () => {
        if (printFrame.contentWindow) {
          setTimeout(() => {
            printFrame.contentWindow?.print();
            setIsPrinting(false);
          }, 500);

          // Cleanup after print dialog closes
          const onFocus = () => {
            window.removeEventListener("focus", onFocus);
            if (printFrame.parentNode) {
              document.body.removeChild(printFrame);
            }
            printFrameRef.current = null;
          };
          window.addEventListener("focus", onFocus);

          // Fallback cleanup after 60 seconds
          setTimeout(() => {
            window.removeEventListener("focus", onFocus);
            if (printFrame.parentNode) {
              document.body.removeChild(printFrame);
            }
            printFrameRef.current = null;
          }, 60000);
        }
      };

      printFrame.src = pdfUrl;
    } catch (error) {
      console.error("Error printing:", error);
      toast.error("Failed to print voucher");
      setIsPrinting(false);
    }
  };

  const handleDownload = async () => {
    if (!voucherData) return;

    setIsDownloading(true);
    try {
      await downloadCashReceiptVoucherPDF(voucherData);
      toast.success("Voucher downloaded successfully");
    } catch (error) {
      console.error("Error downloading:", error);
      toast.error("Failed to download voucher");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    // Cleanup print frame if exists
    if (printFrameRef.current && printFrameRef.current.parentNode) {
      document.body.removeChild(printFrameRef.current);
      printFrameRef.current = null;
    }
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </TransitionChild>

        {/* Modal Content */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-xl bg-white dark:bg-gray-800 shadow-2xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-default-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-sky-50 dark:bg-sky-900/30 rounded-lg">
                      <IconFileText
                        size={20}
                        className="text-sky-600 dark:text-sky-400"
                      />
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-semibold text-default-900 dark:text-gray-100">
                        Cash Receipt Voucher
                      </DialogTitle>
                      {voucherData && (
                        <p className="text-sm text-default-500 dark:text-gray-400">
                          {voucherData.voucher_number} | {voucherData.customer_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-lg text-default-500 hover:text-default-700 hover:bg-default-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <IconX size={20} />
                  </button>
                </div>

                {/* PDF Preview */}
                <div className="relative bg-default-100 dark:bg-gray-900">
                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center h-[600px]">
                      <LoadingSpinner size="md" />
                      <p className="mt-3 text-sm text-default-500 dark:text-gray-400">
                        Generating voucher preview...
                      </p>
                    </div>
                  ) : pdfUrl ? (
                    <iframe
                      src={pdfUrl}
                      className="w-full h-[600px] border-0"
                      title="Cash Receipt Voucher Preview"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[600px]">
                      <IconFileText
                        size={48}
                        className="text-default-300 dark:text-gray-600"
                      />
                      <p className="mt-3 text-sm text-default-500 dark:text-gray-400">
                        No voucher data available
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer with Actions */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/50">
                  <div className="text-sm text-default-500 dark:text-gray-400">
                    {voucherData && (
                      <>
                        Amount: <span className="font-semibold text-default-900 dark:text-gray-100">
                          RM {voucherData.amount.toLocaleString("en-MY", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleClose}
                      variant="outline"
                      color="default"
                    >
                      Close
                    </Button>
                    <Button
                      onClick={handlePrint}
                      variant="outline"
                      color="sky"
                      icon={IconPrinter}
                      iconPosition="left"
                      disabled={!pdfUrl || isPrinting}
                    >
                      {isPrinting ? "Printing..." : "Print"}
                    </Button>
                    <Button
                      onClick={handleDownload}
                      variant="filled"
                      color="sky"
                      icon={IconDownload}
                      iconPosition="left"
                      disabled={!voucherData || isDownloading}
                    >
                      {isDownloading ? "Downloading..." : "Download PDF"}
                    </Button>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default CashReceiptVoucherModal;
