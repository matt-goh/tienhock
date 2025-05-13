// src/components/Payroll/HolidayFormModal.tsx
import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { FormInput } from "../FormComponents";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { refreshHolidaysCache } from "../../utils/payroll/useHolidayCache";

interface Holiday {
  id: number;
  holiday_date: string;
  description: string;
  is_active: boolean;
}

interface HolidayFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  holiday?: Holiday | null;
  existingHolidays: Holiday[];
  onSave: () => void;
}

const HolidayFormModal: React.FC<HolidayFormModalProps> = ({
  isOpen,
  onClose,
  holiday,
  existingHolidays,
  onSave,
}) => {
  const [formData, setFormData] = useState({
    holiday_date: "",
    description: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!holiday;

  useEffect(() => {
    if (isOpen) {
      if (holiday) {
        // When editing, format the date correctly for the date input
        const date = new Date(holiday.holiday_date);
        setFormData({
          holiday_date: date.toISOString().split("T")[0],
          description: holiday.description || "",
        });
      } else {
        // When adding, set today's date as default
        setFormData({
          holiday_date: new Date().toISOString().split("T")[0],
          description: "",
        });
      }
      setError(null);
    }
  }, [isOpen, holiday]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check for duplicate dates
    const isDuplicate = existingHolidays.some((existing) => {
      // If in edit mode, don't compare with the current holiday being edited
      if (isEditMode && existing.id === holiday?.id) {
        return false;
      }

      // Compare the dates
      const existingDate = new Date(existing.holiday_date)
        .toISOString()
        .split("T")[0];
      return existingDate === formData.holiday_date;
    });

    if (isDuplicate) {
      setError("A holiday already exists for this date");
      return;
    }

    setIsSaving(true);

    try {
      if (isEditMode) {
        await api.put(`/api/holidays/${holiday?.id}`, formData);
        toast.success("Holiday updated successfully");
      } else {
        await api.post("/api/holidays", formData);
        toast.success("Holiday added successfully");
      }

      // Refresh the cache after successful save
      await refreshHolidaysCache();

      onSave();
      onClose();
    } catch (error: any) {
      console.error("Error saving holiday:", error);

      // Handle specific error responses
      if (error.response?.status === 409) {
        setError("A holiday already exists for this date");
      } else {
        setError(error.response?.data?.message || "Failed to save holiday");
      }

      toast.error(error.response?.data?.message || "Failed to save holiday");
    } finally {
      setIsSaving(false);
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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  {isEditMode ? "Edit Holiday" : "Add Holiday"}
                </DialogTitle>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <FormInput
                    label="Holiday Date"
                    name="holiday_date"
                    type="date"
                    value={formData.holiday_date}
                    onChange={(e) =>
                      setFormData({ ...formData, holiday_date: e.target.value })
                    }
                    required
                  />

                  <FormInput
                    label="Description"
                    name="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="e.g., Chinese New Year, Hari Raya, Deepavali"
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
                      {isSaving ? "Saving..." : isEditMode ? "Update" : "Add"}
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

export default HolidayFormModal;
