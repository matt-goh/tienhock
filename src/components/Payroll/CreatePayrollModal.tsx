// src/components/Payroll/CreatePayrollModal.tsx
import React, { useState, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { FormListbox } from "../FormComponents";

interface CreatePayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePayroll: (year: number, month: number) => void;
}

const CreatePayrollModal: React.FC<CreatePayrollModalProps> = ({
  isOpen,
  onClose,
  onCreatePayroll,
}) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // JavaScript months are 0-indexed

  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number>(currentMonth);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate year options (current year and 2 previous years)
  const yearOptions = Array.from({ length: 3 }, (_, i) => ({
    id: currentYear - i,
    name: (currentYear - i).toString(),
  }));

  // Generate month options
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: new Date(2000, i, 1).toLocaleString("default", { month: "long" }),
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onCreatePayroll(year, month);
    } finally {
      setIsSubmitting(false);
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
              <DialogPanel className="w-full max-w-md transform rounded-2xl bg-white p-6 shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Create Monthly Payroll
                </DialogTitle>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <p className="text-sm text-gray-500">
                    Select the year and month for the new payroll.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <FormListbox
                      name="year"
                      label="Year"
                      value={year.toString()}
                      onChange={(value) => setYear(Number(value))}
                      options={yearOptions}
                      required
                    />

                    <FormListbox
                      name="month"
                      label="Month"
                      value={month.toString()}
                      onChange={(value) => setMonth(Number(value))}
                      options={monthOptions}
                      required
                    />
                  </div>

                  <div className="mt-8 flex justify-end space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      color="sky"
                      variant="filled"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Creating..." : "Create Payroll"}
                    </Button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default CreatePayrollModal;
