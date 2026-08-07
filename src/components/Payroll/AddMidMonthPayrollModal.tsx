// src/components/Payroll/AddMidMonthPayrollModal.tsx
import React, { useState, Fragment, useMemo } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { FormCombobox, FormInput } from "../FormComponents";
import PillSelect, { PillSelectOption } from "../PillSelect";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import {
  createMidMonthPayroll,
  CreateMidMonthPayrollData,
  getMonthName,
} from "../../utils/payroll/midMonthPayrollUtils";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

type MidMonthPaymentMethod = "Cash" | "Bank" | "Cheque";

const PAYMENT_METHOD_OPTIONS: ReadonlyArray<
  PillSelectOption<MidMonthPaymentMethod>
> = [
  { value: "Cash", label: "Cash" },
  { value: "Bank", label: "Bank" },
  { value: "Cheque", label: "Cheque" },
];

interface AddMidMonthPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentYear: number;
  currentMonth: number;
}

const AddMidMonthPayrollModal: React.FC<AddMidMonthPayrollModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentYear,
  currentMonth,
}) => {
  const { t } = useTranslation("payroll");
  const defaultAmount = 500; // Default amount for new payroll
  const paymentMethodOptions = PAYMENT_METHOD_OPTIONS.map((opt) => ({
    ...opt,
    label: t(opt.label),
  }));
  const { staffs } = useStaffsCache();
  const [employeeId, setEmployeeId] = useState<string>("");
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [paymentMethod, setPaymentMethod] =
    useState<MidMonthPaymentMethod>("Cash");
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Employee options for combobox
  const employeeOptions = useMemo(
    () =>
      staffs.map((staff) => ({
        id: staff.id,
        name: `${staff.id} — ${staff.name}`,
        phone_number: staff.telephoneNo,
        job: Array.isArray(staff.job) ? staff.job.join(", ") : "",
      })),
    [staffs]
  );

  const handleEmployeeChange = (selectedId: string) => {
    setEmployeeId(selectedId);

    // Set default payment method from staff preference
    if (selectedId) {
      const employee = staffs.find((s) => s.id === selectedId);
      if (employee?.paymentPreference) {
        const preference = employee.paymentPreference.toLowerCase();
        if (preference.includes("bank")) setPaymentMethod("Bank");
        else if (preference.includes("cheque")) setPaymentMethod("Cheque");
        else setPaymentMethod("Cash");
      } else {
        setPaymentMethod("Cash");
      }
    }
  };

  const handleSubmit = async () => {
    if (!employeeId) {
      toast.error(t("Please select an employee"));
      return;
    }

    if (amount <= 0) {
      toast.error(t("Amount must be greater than 0"));
      return;
    }

    setIsCreating(true);
    try {
      const data: CreateMidMonthPayrollData = {
        employee_id: employeeId,
        year: currentYear,
        month: currentMonth,
        amount: amount,
        payment_method: paymentMethod,
      };

      await createMidMonthPayroll(data);
      toast.success(t("Successfully created mid-month payroll"));
      resetForm();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error creating payroll:", error);
      if (error.response?.status === 409) {
        toast.error(
          t("This employee already has a mid-month payroll for this month")
        );
      } else {
        toast.error(t("Failed to create payroll. Please try again."));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setEmployeeId("");
    setAmount(defaultAmount);
    setPaymentMethod("Cash");
    setSearchQuery("");
  };

  const handleClose = () => {
    if (!isCreating) {
      resetForm();
      onClose();
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-md transform rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100 mb-4"
                >
                  {t("Add Mid-month Payroll - {{month}} {{year}}", {
                    month: t(getMonthName(currentMonth)),
                    year: currentYear,
                  })}
                </DialogTitle>

                <div className="space-y-4">
                  {/* Employee Selection */}
                  <div>
                    <FormCombobox
                      name="employee"
                      label={t("Select Employee")}
                      value={employeeId}
                      onChange={(value) =>
                        handleEmployeeChange(value as string)
                      }
                      options={employeeOptions}
                      query={searchQuery}
                      setQuery={setSearchQuery}
                      placeholder={t("Search for employee...")}
                      mode="single"
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <FormInput
                      name="amount"
                      label={t("Amount (RM)")}
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      min={0}
                      step={1}
                      required
                    />
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
                      {t("Payment Method")}
                    </label>
                    <PillSelect<MidMonthPaymentMethod>
                      value={paymentMethod}
                      onChange={(value: MidMonthPaymentMethod) =>
                        setPaymentMethod(value)
                      }
                      options={paymentMethodOptions}
                      ariaLabel={t("Payment method")}
                      size="md"
                    />
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="flex justify-end space-x-3 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isCreating}
                  >
                    {t("Cancel")}
                  </Button>
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    onClick={handleSubmit}
                    disabled={isCreating || !employeeId || amount <= 0}
                  >
                    {isCreating ? t("Creating...") : t("Create Payroll")}
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

export default AddMidMonthPayrollModal;
