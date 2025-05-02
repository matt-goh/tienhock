// src/components/Payroll/FinalizePayrollDialog.tsx
import React, { Fragment, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import {
  IconAlertTriangle,
  IconLock,
} from "@tabler/icons-react";

interface FinalizePayrollDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  payrollMonth: string;
  payrollYear: number;
  employeeCount: number;
  totalGrossPay: number;
}

const FinalizePayrollDialog: React.FC<FinalizePayrollDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  payrollMonth,
  payrollYear,
  employeeCount,
  totalGrossPay,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const expectedConfirmText = "FINALIZE";

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleConfirm = async () => {
    if (confirmText !== expectedConfirmText) return;

    setIsProcessing(true);
    try {
      await onConfirm();
      // The caller will handle closing the dialog and showing success message
    } catch (error) {
      console.error("Error finalizing payroll:", error);
      setIsProcessing(false);
    }
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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <div className="flex items-center gap-3 text-amber-600 mb-4">
                  <IconAlertTriangle size={24} />
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6"
                  >
                    Finalize Payroll
                  </DialogTitle>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-medium text-default-700 mb-2">
                    Payroll Summary
                  </h4>
                  <div className="bg-default-50 border border-default-200 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-default-500">Period</p>
                        <p className="font-medium text-default-800">
                          {payrollMonth} {payrollYear}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-default-500">Employees</p>
                        <p className="font-medium text-default-800">
                          {employeeCount}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-default-500">
                          Total Gross Pay
                        </p>
                        <p className="font-medium text-default-800">
                          {formatCurrency(totalGrossPay)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-default-700 mb-2">
                    Type "{expectedConfirmText}" to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) =>
                      setConfirmText(e.target.value.toUpperCase())
                    }
                    className="w-full p-2 border border-default-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    placeholder={expectedConfirmText}
                    autoComplete="off"
                    disabled={isProcessing}
                  />
                </div>

                <div className="flex flex-col md:flex-row justify-end gap-3 md:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={isProcessing}
                    className="order-2 md:order-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="filled"
                    color="amber"
                    onClick={handleConfirm}
                    disabled={
                      confirmText !== expectedConfirmText || isProcessing
                    }
                    className="order-1 md:order-2"
                    icon={isProcessing ? undefined : IconLock}
                  >
                    {isProcessing ? (
                      <span className="flex items-center">
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Finalizing...
                      </span>
                    ) : (
                      "Finalize Payroll"
                    )}
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default FinalizePayrollDialog;
