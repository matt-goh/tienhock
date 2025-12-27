// src/components/Payroll/MissingEPFNumberDialog.tsx
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

export interface MissingEPFEmployee {
  employee_id: number;
  name: string;
  nationality: string;
  emp_share: number;
  em_share: number;
}

interface MissingEPFNumberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  employees: MissingEPFEmployee[];
}

const MissingEPFNumberDialog: React.FC<MissingEPFNumberDialogProps> = ({
  isOpen,
  onClose,
  employees,
}) => {
  const navigate = useNavigate();

  const handleNavigateToStaff = (employeeId: number) => {
    onClose();
    navigate(`/catalogue/staff/${employeeId}`);
  };

  const formatCurrency = (amount: number): string => {
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
                      No. Ahli KWSP Tiada
                    </DialogTitle>
                    <p className="mt-2 text-sm text-default-600">
                      Pekerja berikut mempunyai caruman KWSP tetapi tidak
                      termasuk dalam eksport E-Caruman kerana mereka tidak
                      mempunyai nombor ahli KWSP yang direkodkan. Sila kemaskini
                      profil kakitangan mereka dengan nombor KWSP yang betul.
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
                          Contribution
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-default-500 uppercase">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {employees.map((emp) => (
                        <tr key={emp.employee_id} className="hover:bg-default-50">
                          <td className="px-4 py-3 text-sm text-default-900">
                            <div>{emp.name}</div>
                            <div className="text-xs text-default-500">
                              {emp.nationality || "Unknown nationality"}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-default-900 text-right font-medium">
                            {formatCurrency(emp.emp_share + emp.em_share)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleNavigateToStaff(emp.employee_id)}
                              className="text-sky-600 hover:text-sky-800 text-sm font-medium inline-flex items-center gap-1"
                            >
                              Edit
                              <IconExternalLink size={14} />
                            </button>
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
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default MissingEPFNumberDialog;
