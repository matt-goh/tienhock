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
import { FormCombobox, FormInput, FormListbox } from "../FormComponents";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import {
  createMidMonthPayroll,
  CreateMidMonthPayrollData,
  getMonthName,
} from "../../utils/payroll/midMonthPayrollUtils";
import toast from "react-hot-toast";

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
  const defaultAmount = 500; // Default amount for new payroll
  const { staffs } = useStaffsCache();
  const [employeeId, setEmployeeId] = useState<string>("");
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [paymentMethod, setPaymentMethod] = useState<
    "Cash" | "Bank" | "Cheque"
  >("Cash");
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const paymentMethodOptions = [
    { id: "Cash", name: "Cash" },
    { id: "Bank", name: "Bank" },
    { id: "Cheque", name: "Cheque" },
  ];

  // Employee options for combobox
  const employeeOptions = useMemo(
    () =>
      staffs.map((staff) => ({
        id: staff.id,
        name: staff.name,
        phone_number: staff.telephoneNo,
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
      toast.error("Please select an employee");
      return;
    }

    if (amount <= 0) {
      toast.error("Amount must be greater than 0");
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
      toast.success("Successfully created mid-month payroll");
      resetForm();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error creating payroll:", error);
      if (error.response?.status === 409) {
        toast.error(
          "This employee already has a mid-month payroll for this month"
        );
      } else {
        toast.error("Failed to create payroll. Please try again.");
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
                  Add Mid-month Payroll - {getMonthName(currentMonth)}{" "}
                  {currentYear}
                </DialogTitle>

                <div className="space-y-4">
                  {/* Employee Selection */}
                  <div>
                    <FormCombobox
                      name="employee"
                      label="Select Employee"
                      value={employeeId}
                      onChange={(value) =>
                        handleEmployeeChange(value as string)
                      }
                      options={employeeOptions}
                      query={searchQuery}
                      setQuery={setSearchQuery}
                      placeholder="Search for employee..."
                      mode="single"
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <FormInput
                      name="amount"
                      label="Amount (RM)"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      min={0}
                      step={1}
                      required
                    />
                  </div>

                  {/* Payment Method */}
                  <div>
                    <FormListbox
                      name="paymentMethod"
                      label="Payment Method"
                      value={paymentMethod}
                      onChange={(value) =>
                        setPaymentMethod(value as "Cash" | "Bank" | "Cheque")
                      }
                      options={paymentMethodOptions}
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
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    onClick={handleSubmit}
                    disabled={isCreating || !employeeId || amount <= 0}
                  >
                    {isCreating ? "Creating..." : "Create Payroll"}
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
