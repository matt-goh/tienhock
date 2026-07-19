// src/components/Payroll/PayrollProcessingErrorsDialog.tsx
// Shown after payroll processing when some employees were skipped (e.g. the
// July 2026+ OT salary-formula blocks). Lists each blocked employee with the
// reason and a quick link to their staff form, where OT Pay Basis is set.
// Mirrors MissingIncomeTaxRatesDialog; shared by TH, GT and JP payroll pages
// (JP passes its own staffFormBasePath).
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
import type { PayrollProcessingError } from "../../utils/payroll/payrollUtils";

interface PayrollProcessingErrorsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  errors: PayrollProcessingError[];
  // Base path of the staff edit form ("/catalogue/staff" for TH/GT staff,
  // "/jellypolly/catalogue/staff" for JP staff).
  staffFormBasePath?: string;
}

const PayrollProcessingErrorsDialog: React.FC<
  PayrollProcessingErrorsDialogProps
> = ({ isOpen, onClose, errors, staffFormBasePath = "/catalogue/staff" }) => {
  const navigate = useNavigate();

  const handleOpenStaffForm = (employeeId: string) => {
    onClose();
    navigate(`${staffFormBasePath}/${employeeId}/edit`);
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
              <DialogPanel className="w-full max-w-2xl transform rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <IconAlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <DialogTitle
                      as="h3"
                      className="text-lg font-semibold leading-6 text-default-900 dark:text-gray-100"
                    >
                      Sebilangan Pekerja Tidak Diproses
                    </DialogTitle>
                    <p className="mt-2 text-sm text-default-600 dark:text-gray-300">
                      Pekerja di bawah dilangkau dan gaji mereka tidak diubah.
                      Betulkan setiap satu, kemudian proses semula: pekerja
                      bergaji bulan perlu <b>OT Pay Basis</b> ditetapkan kepada{" "}
                      <b>Monthly salary (÷ 26)</b> pada borang pekerja; pekerja
                      bergaji jam/hari yang direkod pada log bulanan sahaja
                      perlu diisi <b>Worked Days</b> pada log kerja bulanan
                      tersebut.
                    </p>
                  </div>
                </div>

                <div className="mt-4 max-h-80 overflow-y-auto">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-900/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                          Pekerja
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                          Sebab
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                          Tindakan
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {errors.map((err) => (
                        <tr
                          key={err.employeeId}
                          className="hover:bg-default-50 dark:hover:bg-gray-700"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-default-900 dark:text-gray-100 whitespace-nowrap align-top">
                            {err.employeeName || err.employeeId}
                          </td>
                          <td className="px-4 py-3 text-xs text-default-600 dark:text-gray-300 align-top">
                            {err.error}
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              icon={IconExternalLink}
                              onClick={() => handleOpenStaffForm(err.employeeId)}
                            >
                              Borang Pekerja
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Tutup
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

export default PayrollProcessingErrorsDialog;
