// src/components/Payroll/EditMidMonthPayrollModal.tsx
import React, { useState, Fragment, useEffect } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { FormInput } from "../FormComponents";
import PillSelect, { PillSelectOption } from "../PillSelect";
import {
  updateMidMonthPayroll,
  MidMonthPayroll,
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

interface EditMidMonthPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payroll: MidMonthPayroll | null;
}

const EditMidMonthPayrollModal: React.FC<EditMidMonthPayrollModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  payroll,
}) => {
  const { t } = useTranslation("payroll");
  const [amount, setAmount] = useState<number>(0);
  const paymentMethodOptions = PAYMENT_METHOD_OPTIONS.map((opt) => ({
    ...opt,
    label: t(opt.label),
  }));
  const [paymentMethod, setPaymentMethod] =
    useState<MidMonthPaymentMethod>("Cash");
  const [isUpdating, setIsUpdating] = useState(false);

  // Reset form when payroll changes
  useEffect(() => {
    if (payroll) {
      setAmount(payroll.amount);
      setPaymentMethod(payroll.payment_method);
    }
  }, [payroll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!payroll) return;

    if (amount <= 0) {
      toast.error(t("Amount must be greater than 0"));
      return;
    }

    setIsUpdating(true);
    try {
      await updateMidMonthPayroll(payroll.id, {
        amount,
        payment_method: paymentMethod,
      });

      toast.success(t("Mid-month payroll updated successfully"));
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error updating payroll:", error);
      toast.error(t("Failed to update payroll"));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClose = () => {
    if (!isUpdating) {
      onClose();
    }
  };

  if (!payroll) return null;

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
              <DialogPanel className="w-full max-w-md transform rounded-2xl border border-transparent bg-white p-6 shadow-xl transition-all dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100 mb-4"
                >
                  {t("Edit Mid-month Payroll")}
                </DialogTitle>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Employee Info (Read-only) */}
                  <div className="rounded-lg border border-default-200 bg-default-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                    <div className="mb-1 text-sm text-default-600 dark:text-gray-400">
                      {t("Employee")}
                    </div>
                    <div className="font-medium text-default-900 dark:text-gray-100">
                      {payroll.employee_name} ({payroll.employee_id})
                    </div>
                  </div>

                  {/* Amount Input */}
                  <FormInput
                    name="amount"
                    label={t("Amount (RM)")}
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    min={0}
                    step={1}
                    required
                    disabled={isUpdating}
                  />

                  {/* Payment Method */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
                      {t("Select payment method")}
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

                  {/* Modal Actions */}
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={isUpdating}
                    >
                      {t("Cancel")}
                    </Button>
                    <Button
                      type="submit"
                      color="sky"
                      variant="filled"
                      disabled={isUpdating}
                    >
                      {isUpdating ? t("Updating...") : t("Update")}
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

export default EditMidMonthPayrollModal;
