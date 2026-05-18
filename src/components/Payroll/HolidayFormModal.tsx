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
import Checkbox from "../Checkbox";

interface Holiday {
  id: number;
  holiday_date: string;
  description: string;
  is_active: boolean;
  is_cuti_umum: boolean;
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
    end_date: "",
    description: "",
    is_cuti_umum: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!holiday;

  const formatLocalDate = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const parseLocalDate = (dateValue: string): Date => {
    const [year, month, day] = dateValue.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const normalizeHolidayDate = (dateValue: string): string => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }

    return formatLocalDate(new Date(dateValue));
  };

  const getDateRange = (startDate: string, endDate: string): string[] => {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate || startDate);
    const dates: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      dates.push(formatLocalDate(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  useEffect(() => {
    if (isOpen) {
      if (holiday) {
        setFormData({
          holiday_date: holiday.holiday_date,
          end_date: "",
          description: holiday.description || "",
          is_cuti_umum: holiday.is_cuti_umum ?? true,
        });
      } else {
        const today: Date = new Date();
        const localDate: string = formatLocalDate(today);
        setFormData({
          holiday_date: localDate,
          end_date: "",
          description: "",
          is_cuti_umum: true,
        });
      }
      setError(null);
    }
  }, [isOpen, holiday]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      !isEditMode &&
      formData.end_date &&
      parseLocalDate(formData.end_date) < parseLocalDate(formData.holiday_date)
    ) {
      setError("End date cannot be before start date");
      return;
    }

    const holidayDates: string[] = isEditMode
      ? [formData.holiday_date]
      : getDateRange(formData.holiday_date, formData.end_date);

    const duplicateDate: string | undefined = holidayDates.find((date) => {
      return existingHolidays.some((existing) => {
        if (isEditMode && existing.id === holiday?.id) {
          return false;
        }

        return normalizeHolidayDate(existing.holiday_date) === date;
      });
    });

    if (duplicateDate) {
      setError(`A holiday already exists for ${duplicateDate}`);
      return;
    }

    setIsSaving(true);

    try {
      if (isEditMode) {
        await api.put(`/api/holidays/${holiday?.id}`, {
          holiday_date: formData.holiday_date,
          description: formData.description,
          is_cuti_umum: formData.is_cuti_umum,
        });
        toast.success("Holiday updated successfully");
      } else if (holidayDates.length === 1) {
        await api.post("/api/holidays", {
          holiday_date: holidayDates[0],
          description: formData.description,
          is_cuti_umum: formData.is_cuti_umum,
        });
        toast.success("Holiday added successfully");
      } else {
        await api.post("/api/holidays/batch", {
          holidays: holidayDates.map((holidayDate: string) => ({
            holiday_date: holidayDate,
            description: formData.description,
            is_cuti_umum: formData.is_cuti_umum,
          })),
          overwrite: false,
        });
        toast.success(`${holidayDates.length} holiday days added successfully`);
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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  {isEditMode ? "Edit Holiday" : "Add Holiday"}
                </DialogTitle>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <FormInput
                    label={isEditMode ? "Holiday Date" : "Start Date"}
                    name="holiday_date"
                    type="date"
                    value={formData.holiday_date}
                    onChange={(e) =>
                      setFormData({ ...formData, holiday_date: e.target.value })
                    }
                    required
                  />

                  {!isEditMode && (
                    <FormInput
                      label="End Date"
                      name="end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) =>
                        setFormData({ ...formData, end_date: e.target.value })
                      }
                    />
                  )}

                  <FormInput
                    label="Description"
                    name="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="e.g., Chinese New Year, Hari Raya, Deepavali"
                  />

                  <Checkbox
                    checked={formData.is_cuti_umum}
                    onChange={(checked: boolean) =>
                      setFormData({ ...formData, is_cuti_umum: checked })
                    }
                    label="Cuti Umum"
                    checkedColor="text-sky-600"
                    uncheckedColor="text-gray-400"
                  />

                  {error && (
                    <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
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
