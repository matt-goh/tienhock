// src/components/Payroll/EditCommissionModal.tsx
import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { FormInput } from "../FormComponents";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

interface Commission {
  id: number;
  employee_id: string;
  employee_name: string;
  commission_date: string;
  amount: number;
  description: string;
  created_by: string;
  created_at: string;
}

interface EditCommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  commission: Commission | null;
}

const EditCommissionModal: React.FC<EditCommissionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  commission,
}) => {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [commissionDate, setCommissionDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (commission) {
      setAmount(commission.amount.toString());
      setDescription(commission.description);
      setCommissionDate(commission.commission_date.split("T")[0]);
    }
  }, [commission]);

  const handleSave = async () => {
    if (!commission) return;

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    if (!description.trim()) {
      toast.error("Please enter a description.");
      return;
    }

    setIsSaving(true);

    try {
      await api.put(`/api/commissions/${commission.id}`, {
        amount: parseFloat(amount),
        description: description.trim(),
        commission_date: commissionDate,
      });

      toast.success("Commission updated successfully!");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Failed to update commission:", error);
      toast.error(
        error.response?.data?.message || "Failed to update commission."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  if (!commission) return null;

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
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </TransitionChild>

        <div className="fixed inset-0">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-0 text-left align-middle shadow-xl transition-all">
                <div className="px-6 py-4 border-b border-default-200">
                  <DialogTitle
                    as="h3"
                    className="text-xl font-semibold text-default-800"
                  >
                    Edit Commission
                  </DialogTitle>
                  <p className="text-sm text-default-600 mt-1">
                    Employee: {commission.employee_name} (
                    {commission.employee_id})
                  </p>
                </div>

                <div className="px-6 py-4">
                  <div className="space-y-4">
                    <FormInput
                      name="commissionDate"
                      label="Commission Date"
                      type="date"
                      value={commissionDate}
                      onChange={(e) => setCommissionDate(e.target.value)}
                      required
                    />

                    <FormInput
                      name="amount"
                      label="Amount (RM)"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      step="1"
                      required
                    />

                    <FormInput
                      name="description"
                      label="Description"
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g., Commission, bonus work"
                      required
                    />
                  </div>

                  <div className="flex justify-end space-x-3 mt-6 border-t border-default-200 pt-6">
                    <Button
                      variant="outline"
                      onClick={handleClose}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      color="sky"
                      onClick={handleSave}
                      disabled={isSaving}
                      icon={IconDeviceFloppy}
                    >
                      {isSaving ? "Updating..." : "Update Commission"}
                    </Button>
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

export default EditCommissionModal;
