// src/components/Payroll/MissingIncomeTaxRatesDialog.tsx
import React, { Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";
import Button from "../Button";
import { useNavigate } from "react-router-dom";

export interface MissingIncomeTaxEmployee {
  employeeId: string;
  employeeName: string;
  grossPay: number;
}

interface MissingIncomeTaxRatesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  employees: MissingIncomeTaxEmployee[];
}

const MissingIncomeTaxRatesDialog: React.FC<MissingIncomeTaxRatesDialogProps> = ({
  isOpen,
  onClose,
  employees,
}) => {
  const navigate = useNavigate();

  const handleNavigateToRates = () => {
    onClose();
    // Navigate to Contribution Rates page with Income Tax tab selected (index 3)
    navigate("/catalogue/contribution-rates?tab=3");
  };

  const formatCurrency = (amount: number) => {
    return `RM ${amount.toLocaleString("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
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
              <DialogPanel className="w-full max-w-lg transform rounded-2xl bg-white p-6 shadow-xl transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                      <IconAlertTriangle className="h-6 w-6 text-amber-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <DialogTitle
                      as="h3"
                      className="text-lg font-semibold leading-6 text-default-900"
                    >
                      Missing Income Tax Rates
                    </DialogTitle>
                    <p className="mt-2 text-sm text-default-600">
                      The following employees have gross pay above RM 3,000 but no
                      income tax rate is recorded for their salary range. Please
                      add the appropriate income tax rates to ensure accurate
                      deductions.
                    </p>
                  </div>
                </div>

                <div className="mt-4 max-h-64 overflow-y-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-default-500 uppercase">
                          Employee
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-default-500 uppercase">
                          Gross Pay
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {employees.map((emp) => (
                        <tr key={emp.employeeId} className="hover:bg-default-50">
                          <td className="px-4 py-3 text-sm text-default-900">
                            {emp.employeeName}
                          </td>
                          <td className="px-4 py-3 text-sm text-default-900 text-right font-medium">
                            {formatCurrency(emp.grossPay)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    icon={IconExternalLink}
                    onClick={handleNavigateToRates}
                  >
                    Add Income Tax Rates
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

export default MissingIncomeTaxRatesDialog;
