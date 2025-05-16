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
import StyledListbox from "../StyledListbox";
import {
  updateMidMonthPayroll,
  MidMonthPayroll,
} from "../../utils/payroll/midMonthPayrollUtils";
import toast from "react-hot-toast";

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
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<
    "Cash" | "Bank" | "Cheque"
  >("Cash");
  const [isUpdating, setIsUpdating] = useState(false);

  const paymentMethodOptions = [
    { id: "Cash", name: "Cash" },
    { id: "Bank", name: "Bank" },
    { id: "Cheque", name: "Cheque" },
  ];

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
      toast.error("Amount must be greater than 0");
      return;
    }

    setIsUpdating(true);
    try {
      await updateMidMonthPayroll(payroll.id, {
        amount,
        payment_method: paymentMethod,
      });

      toast.success("Mid-month payroll updated successfully");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error updating payroll:", error);
      toast.error("Failed to update payroll");
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
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 mb-4"
                >
                  Edit Mid-month Payroll
                </DialogTitle>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Employee Info (Read-only) */}
                  <div className="bg-default-50 rounded-lg p-4 border">
                    <div className="text-sm text-default-600 mb-1">
                      Employee
                    </div>
                    <div className="font-medium text-default-900">
                      {payroll.employee_name} ({payroll.employee_id})
                    </div>
                  </div>

                  {/* Amount Input */}
                  <FormInput
                    name="amount"
                    label="Amount (RM)"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    min={0}
                    step={1}
                    required
                    disabled={isUpdating}
                  />

                  {/* Payment Method */}
                  <div>
                    <label className="block text-sm font-medium text-default-700 mb-1">
                      Payment Method
                    </label>
                    <StyledListbox
                      value={paymentMethod}
                      onChange={(value) =>
                        setPaymentMethod(value as "Cash" | "Bank" | "Cheque")
                      }
                      options={paymentMethodOptions}
                      className="w-full"
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
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      color="sky"
                      variant="filled"
                      disabled={isUpdating}
                    >
                      {isUpdating ? "Updating..." : "Update"}
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
