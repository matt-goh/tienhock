// src/components/Catalogue/JobDetailModal.tsx
import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import toast from "react-hot-toast";
import { JobDetail, SelectOption } from "../../types/types";
import { FormInput, FormListbox } from "../FormComponents";
import Button from "../Button";

interface JobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (detail: JobDetail) => Promise<void>; // Parent handles API call & state update
  initialData?: JobDetail | null;
  jobId: string; // Needed to associate the detail
}

const jobDetailTypes: SelectOption[] = [
  { id: "Gaji", name: "Gaji" },
  { id: "Tambahan", name: "Tambahan" },
  { id: "Overtime", name: "Overtime" },
];

const JobDetailModal: React.FC<JobDetailModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  jobId, // Make sure this is passed correctly by the parent
}) => {
  const [formData, setFormData] = useState<
    Omit<JobDetail, "amount"> & { amount: string }
  >({
    id: "",
    description: "",
    amount: "0.00", // Store as string for input handling
    remark: "",
    type: "Gaji", // Default type
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!initialData;

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          ...initialData,
          amount: initialData.amount.toFixed(2), // Format amount for input
        });
      } else {
        // Reset for add mode, potentially generate a default ID
        setFormData({
          id: `JD${Date.now()}`, // Consider a more robust temporary ID or leave blank for backend gen
          description: "",
          amount: "0.00",
          remark: "",
          type: "Gaji",
        });
      }
      setError(null);
      setIsSaving(false);
    }
  }, [isOpen, initialData]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "amount") {
      // Allow only numbers and one decimal point
      const cleanedValue = value.replace(/[^0-9.]/g, "");
      const parts = cleanedValue.split(".");
      if (parts.length > 2) {
        // Prevent multiple decimal points
        return;
      }
      if (parts[1] && parts[1].length > 2) {
        // Limit to 2 decimal places
        return;
      }
      setFormData((prev) => ({ ...prev, [name]: cleanedValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleBlurAmount = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const parsedValue = parseFloat(value);
    if (!isNaN(parsedValue)) {
      setFormData((prev) => ({ ...prev, amount: parsedValue.toFixed(2) }));
    } else {
      setFormData((prev) => ({ ...prev, amount: "0.00" })); // Reset if invalid
    }
  };

  const handleListboxChange =
    (fieldName: keyof JobDetail) => (value: string) => {
      setFormData((prev) => ({
        ...prev,
        [fieldName]: value,
      }));
    };

  const validateForm = (): boolean => {
    if (!formData.id.trim()) {
      setError("Job Detail ID cannot be empty.");
      return false;
    }
    const parsedAmount = parseFloat(formData.amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError("Amount must be a valid non-negative number.");
      return false;
    }
    if (!formData.type) {
      setError("Type must be selected.");
      return false;
    }
    // Add other validation if needed (e.g., description required?)
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const finalAmount = parseFloat(formData.amount);
    if (isNaN(finalAmount)) {
      setError("Invalid amount entered.");
      setIsSaving(false);
      return;
    }

    try {
      // Include jobId when saving
      const detailToSave: JobDetail = {
        ...formData,
        amount: finalAmount, // Convert back to number
      };
      await onSave(detailToSave);
      // onClose(); // Close handled externally
    } catch (saveError: any) {
      console.error("Error saving job detail:", saveError);
      setError(saveError.message || "Failed to save job detail.");
      toast.error(saveError.message || "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
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

        {/* Modal Content */}
        <div className="fixed inset-0 overflow-y-auto">
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
              <DialogPanel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold leading-6 text-gray-900"
                >
                  {isEditMode ? "Edit Job Detail" : "Add New Job Detail"}
                </DialogTitle>
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <FormInput
                    label="Detail ID"
                    name="id"
                    value={formData.id}
                    onChange={handleChange}
                    required
                    disabled={isSaving} // Allow ID edit for new, maybe disable for existing?
                    placeholder="Unique Detail ID"
                  />
                  <FormInput
                    label="Description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    disabled={isSaving}
                    placeholder="e.g., Basic Salary Component"
                  />
                  <FormInput
                    label="Amount"
                    name="amount"
                    type="text" // Use text to manage formatting state
                    value={formData.amount}
                    onChange={handleChange}
                    onBlur={handleBlurAmount}
                    required
                    disabled={isSaving}
                    placeholder="e.g., 1500.00"
                  />
                  <FormInput
                    label="Remark"
                    name="remark"
                    value={formData.remark}
                    onChange={handleChange}
                    disabled={isSaving}
                    placeholder="Optional notes"
                  />
                  <FormListbox
                    label="Type"
                    name="type"
                    value={formData.type}
                    onChange={handleListboxChange("type")}
                    options={jobDetailTypes}
                    required
                    disabled={isSaving}
                  />

                  {error && (
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  )}

                  <div className="mt-6 flex justify-end space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      color="sky"
                      variant="filled"
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save Detail"}
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

export default JobDetailModal;
