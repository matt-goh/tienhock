import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { PayCode, PayType, RateUnit } from "../../types/types";
import { FormInput, FormListbox } from "../FormComponents";
import Button from "../Button";

interface PayCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payCode: PayCode) => Promise<void>;
  initialData?: PayCode | null;
}

const defaultPayCode: PayCode = {
  id: "",
  code: "",
  description: "",
  pay_type: "Base",
  rate_unit: "Hour",
  rate_biasa: 0,
  rate_ahad: 0,
  rate_umum: 0,
  is_active: true,
  requires_units_input: false,
};

const PayCodeModal: React.FC<PayCodeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData = null,
}) => {
  const [formData, setFormData] = useState<PayCode>(defaultPayCode);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditMode = !!initialData;

  // Options for select fields
  const payTypeOptions = [
    { id: "Base", name: "Base" },
    { id: "Tambahan", name: "Tambahan" },
    { id: "Overtime", name: "Overtime" },
  ];

  const rateUnitOptions = [
    { id: "Hour", name: "Hour" },
    { id: "Day", name: "Day" },
    { id: "Bag", name: "Bag" },
    { id: "Fixed", name: "Fixed" },
    { id: "Percent", name: "Percent" },
  ];

  // Initialize form data
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        setFormData(defaultPayCode);
      }
      setError(null);
      setIsSaving(false);
    }
  }, [isOpen, initialData]);

  // Handle input changes
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    // Handle different input types
    if (type === "checkbox" && e.target instanceof HTMLInputElement) {
      const { checked } = e.target; // Access checked property safely
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
      }));
    } else if (
      name === "rate_biasa" ||
      name === "rate_ahad" ||
      name === "rate_umum"
    ) {
      // Handle numeric inputs
      const numValue = value === "" ? 0 : parseFloat(value);
      setFormData((prev) => ({
        ...prev,
        [name]: isNaN(numValue) ? 0 : numValue,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Handle listbox changes
  const handleListboxChange = (name: keyof PayCode) => (value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // If changing rate_unit to Percent, ensure sensible defaults for rates
    if (name === "rate_unit" && value === "Percent") {
      setFormData((prev) => ({
        ...prev,
        rate_biasa: prev.rate_biasa > 100 ? 100 : prev.rate_biasa,
        rate_ahad: prev.rate_ahad > 100 ? 100 : prev.rate_ahad,
        rate_umum: prev.rate_umum > 100 ? 100 : prev.rate_umum,
      }));
    }
  };

  // Handle checkbox changes
  const handleCheckboxChange =
    (name: keyof PayCode) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [name]: e.target.checked,
      }));
    };

  // Validate the form
  const validateForm = (): boolean => {
    if (!formData.code.trim()) {
      setError("Code cannot be empty");
      return false;
    }

    if (!formData.description.trim()) {
      setError("Description cannot be empty");
      return false;
    }

    // Validate rates are not negative
    if (
      formData.rate_biasa < 0 ||
      formData.rate_ahad < 0 ||
      formData.rate_umum < 0
    ) {
      setError("Rates cannot be negative");
      return false;
    }

    // Percentages should not be greater than 100
    if (formData.rate_unit === "Percent") {
      if (
        formData.rate_biasa > 100 ||
        formData.rate_ahad > 100 ||
        formData.rate_umum > 100
      ) {
        setError("Percentage rates cannot exceed 100%");
        return false;
      }
    }

    setError(null);
    return true;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // If this is a new pay code, generate an ID if not provided
      if (!isEditMode && !formData.id) {
        setFormData((prev) => ({
          ...prev,
          id: prev.code.replace(/\s+/g, "_").toUpperCase(),
        }));
      }

      await onSave(formData);
      // Modal will be closed by parent component after successful save
    } catch (error: any) {
      console.error("Error saving pay code:", error);
      setError(error.message || "Failed to save pay code");
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
              <DialogPanel className="w-full max-w-md transform rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold leading-6 text-gray-900"
                >
                  {isEditMode ? "Edit Pay Code" : "Add New Pay Code"}
                </DialogTitle>
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  {/* Code */}
                  <FormInput
                    label="Code"
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    required
                    disabled={isSaving || isEditMode}
                    placeholder="e.g., MEE_BIASA"
                  />

                  {/* Description */}
                  <FormInput
                    label="Description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    required
                    disabled={isSaving}
                    placeholder="e.g., Basic Pay for Mee Section"
                  />

                  {/* Pay Type */}
                  <FormListbox
                    label="Pay Type"
                    name="pay_type"
                    value={formData.pay_type}
                    onChange={handleListboxChange("pay_type")}
                    options={payTypeOptions}
                    required
                    disabled={isSaving}
                  />

                  {/* Rate Unit */}
                  <FormListbox
                    label="Rate Unit"
                    name="rate_unit"
                    value={formData.rate_unit}
                    onChange={handleListboxChange("rate_unit")}
                    options={rateUnitOptions}
                    required
                    disabled={isSaving}
                  />

                  {/* Rates */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <FormInput
                      label="Normal Rate"
                      name="rate_biasa"
                      value={formData.rate_biasa.toString()}
                      onChange={handleChange}
                      type="number"
                      step="0.01"
                      min="0"
                      max={formData.rate_unit === "Percent" ? 100 : undefined}
                      required
                      disabled={isSaving}
                    />

                    <FormInput
                      label="Sunday Rate"
                      name="rate_ahad"
                      value={formData.rate_ahad.toString()}
                      onChange={handleChange}
                      type="number"
                      step="0.01"
                      min="0"
                      max={formData.rate_unit === "Percent" ? 100 : undefined}
                      required
                      disabled={isSaving}
                    />

                    <FormInput
                      label="Holiday Rate"
                      name="rate_umum"
                      value={formData.rate_umum.toString()}
                      onChange={handleChange}
                      type="number"
                      step="0.01"
                      min="0"
                      max={formData.rate_unit === "Percent" ? 100 : undefined}
                      required
                      disabled={isSaving}
                    />
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="is_active"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleCheckboxChange("is_active")}
                        className="h-4 w-4 rounded border-default-300 focus:ring-sky-500"
                      />
                      <label
                        htmlFor="is_active"
                        className="text-sm font-medium text-default-700"
                      >
                        Active
                      </label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="requires_units_input"
                        name="requires_units_input"
                        checked={formData.requires_units_input}
                        onChange={handleCheckboxChange("requires_units_input")}
                        className="h-4 w-4 rounded border-default-300 focus:ring-sky-500"
                      />
                      <label
                        htmlFor="requires_units_input"
                        className="text-sm font-medium text-default-700"
                      >
                        Requires Units Input
                      </label>
                    </div>
                  </div>

                  {/* Error message */}
                  {error && (
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  )}

                  {/* Action buttons */}
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
                      {isSaving ? "Saving..." : "Save"}
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

export default PayCodeModal;
