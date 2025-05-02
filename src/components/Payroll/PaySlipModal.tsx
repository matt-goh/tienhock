// src/components/Payroll/PaySlipModal.tsx (updated)
import React, { Fragment, useRef } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { IconPrinter } from "@tabler/icons-react";
import PaySlipPreview from "./PaySlipPreview";
import { SinglePaySlipPDFButton } from "../../utils/payroll/PDFDownloadButton";
import { EmployeePayroll } from "../../types/types";

interface PayrollItem {
  id: number;
  pay_code_id: string;
  description: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  amount: number;
  is_manual: boolean;
}

interface PaySlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  payroll: EmployeePayroll;
}

const PaySlipModal: React.FC<PaySlipModalProps> = ({
  isOpen,
  onClose,
  payroll,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    // Create a new window for printing
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups for this website");
      return;
    }

    // Get the pay slip HTML
    const paySlipHtml = printRef.current?.innerHTML;
    if (!paySlipHtml) return;

    // Add print-specific CSS
    const printCss = `
      <style>
        @media print {
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 8px;
            text-align: left;
          }
          th {
            border-bottom: 1px solid #ddd;
          }
          .page-break {
            page-break-after: always;
          }
        }
      </style>
    `;

    // Write to the new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pay Slip - ${payroll.employee_name}</title>
          ${printCss}
        </head>
        <body>
          ${paySlipHtml}
        </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for content to load before printing
    printWindow.onload = function () {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  };

  const getMonthName = (month: number | undefined) => {
    if (!month) return "Unknown Month";
    return new Date(2000, month - 1, 1).toLocaleString("default", {
      month: "long",
    });
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
                <div className="p-6 bg-default-50 border-b border-default-200 flex justify-between items-center">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Pay Slip: {payroll.employee_name} -{" "}
                    {getMonthName(payroll.month)} {payroll.year}
                  </DialogTitle>

                  <div className="flex space-x-2">
                    <Button
                      onClick={handlePrint}
                      icon={IconPrinter}
                      variant="outline"
                      size="sm"
                    >
                      Print
                    </Button>
                    <SinglePaySlipPDFButton
                      payroll={payroll}
                      buttonText="Download PDF"
                      size="sm"
                      variant="outline"
                    />
                    <Button onClick={onClose} variant="outline" size="sm">
                      Close
                    </Button>
                  </div>
                </div>

                <div className="max-h-[80vh] overflow-y-auto p-6">
                  <div ref={printRef}>
                    <PaySlipPreview payroll={payroll} />
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

export default PaySlipModal;
