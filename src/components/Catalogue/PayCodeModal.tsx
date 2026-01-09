import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { PayCode, PayType, RateUnit } from "../../types/types"; // PayCode type updated
import { FormInput, FormListbox } from "../FormComponents"; // Ensure correct import path
import Button from "../Button";
import Checkbox from "../Checkbox";

interface PayCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payCode: PayCode) => Promise<void>; // Parameter is the full PayCode (without code)
  initialData?: PayCode | null; // PayCode object (without code)
  existingPayCodes: PayCode[]; // Still needed for ID duplicate check
}

// Default state without 'code'
const defaultPayCode: Omit<PayCode, "code"> = {
  // Use Omit if PayCode type still has 'code' temporarily
  id: "",
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
  existingPayCodes,
}) => {
  // State type should match the structure without 'code'
  const [formData, setFormData] =
    useState<Omit<PayCode, "code">>(defaultPayCode);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditMode = !!initialData;

  // Options for select fields
  const payTypeOptions = [
    { id: "Base", name: "Base" },
    { id: "Tambahan", name: "Tambahan" },
    { id: "Overtime", name: "Overtime" },
    // Add other PayType options if needed
  ];

  const rateUnitOptions = [
    { id: "Hour", name: "Hour" },
    { id: "Bill", name: "Bill" },
    { id: "Day", name: "Day" },
    { id: "Bag", name: "Bag" },
    { id: "Trip", name: "Trip" },
    { id: "Tray", name: "Tray" },
    { id: "Percent", name: "Percent" },
    { id: "Fixed", name: "Fixed" },
  ];

  // Initialize form data
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // If initialData somehow still has 'code', remove it
        const { code, ...restData } = initialData as any; // Cast temporarily if needed
        setFormData({
          ...restData, // Use data without code
          // Ensure rates are numbers for state consistency (though input is text)
          rate_biasa: Number(restData.rate_biasa || 0),
          rate_ahad: Number(restData.rate_ahad || 0),
          rate_umum: Number(restData.rate_umum || 0),
        });
      } else {
        setFormData(defaultPayCode); // Use default without code
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

    if (type === "checkbox" && e.target instanceof HTMLInputElement) {
      const target = e.target as HTMLInputElement;
      setFormData((prev) => ({ ...prev, [name]: target.checked }));
    } else if (
      name === "rate_biasa" ||
      name === "rate_ahad" ||
      name === "rate_umum"
    ) {
      // Allow empty string, numbers, and single decimal point for rate inputs
      if (value === "" || /^\d*\.?\d*$/.test(value)) {
        // For percentage rate unit, validate it doesn't exceed 100
        if (formData.rate_unit === "Percent" && value !== "") {
          const numValue = parseFloat(value);
          if (!isNaN(numValue) && numValue > 100) {
            // Don't update if it exceeds 100
            return;
          }
        }
        setFormData((prev) => ({ ...prev, [name]: value }));
      }
    } else if (name === "id") {
      // Remove problematic characters as the user types
      const sanitizedValue = value
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[%#&?$^()*!@/\\]/g, "");

      setFormData((prev) => ({
        ...prev,
        [name]: sanitizedValue,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Handle listbox changes
  const handleListboxChange =
    (name: keyof Omit<PayCode, "code">) => (value: string) => {
      if (
        name === "rate_unit" &&
        ["Percent", "Trip", "Day", "Bag", "Fixed", "Tray"].includes(value)
      ) {
        // When rate unit is Percent, Trip, Day, Bag, or Fixed, automatically set requires_units_input to true
        setFormData((prev) => ({
          ...prev,
          [name]: value as RateUnit,
          requires_units_input: true,
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          [name]: value as PayType | RateUnit,
          // Reset requires_units_input to false for Hour and Fixed
          ...(name === "rate_unit" ? { requires_units_input: false } : {}),
        }));
      }
    };

  // Validate the form
  const validateForm = (): boolean => {
    setError(null); // Clear previous errors

    const currentId = formData.id.trim();
    const currentDesc = formData.description.trim();

    if (!currentId) {
      // ID is always required now
      setError("ID cannot be empty");
      return false;
    }
    if (!currentDesc) {
      setError("Description cannot be empty");
      return false;
    }

    // --- Duplicate ID Check ---
    // Check only on create mode
    if (!isEditMode) {
      if (existingPayCodes.some((pc) => pc.id === currentId)) {
        setError(`Pay code ID '${currentId}' already exists.`);
        return false;
      }
    }
    // No duplicate code check

    // --- Rate Validation ---
    // Use optional chaining and nullish coalescing for safety when accessing formData values
    const rateBiasaStr = formData.rate_biasa?.toString() ?? "";
    const rateAhadStr = formData.rate_ahad?.toString() ?? "";
    const rateUmumStr = formData.rate_umum?.toString() ?? "";

    const rateBiasaNum = rateBiasaStr === "" ? 0 : parseFloat(rateBiasaStr); // Treat empty as 0 for validation
    const rateAhadNum = rateAhadStr === "" ? 0 : parseFloat(rateAhadStr);
    const rateUmumNum = rateUmumStr === "" ? 0 : parseFloat(rateUmumStr);

    if (isNaN(rateBiasaNum) || isNaN(rateAhadNum) || isNaN(rateUmumNum)) {
      setError("Rates must be valid numbers or empty.");
      return false;
    }

    if (rateBiasaNum < 0 || rateAhadNum < 0 || rateUmumNum < 0) {
      setError("Rates cannot be negative");
      return false;
    }

    // Percentage validation when rate_unit is "Percent"
    if (formData.rate_unit === "Percent") {
      if (rateBiasaNum > 100 || rateAhadNum > 100 || rateUmumNum > 100) {
        setError("Percentage rates cannot exceed 100%");
        return false;
      }
    }

    return true;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    // Prepare data for saving (ensure rates are numbers or null)
    const rateBiasaStr = formData.rate_biasa?.toString() ?? "";
    const rateAhadStr = formData.rate_ahad?.toString() ?? "";
    const rateUmumStr = formData.rate_umum?.toString() ?? "";

    // Parse rate values
    const rateBiasa = rateBiasaStr === "" ? 0 : parseFloat(rateBiasaStr);
    const rateAhad = rateAhadStr === "" ? 0 : parseFloat(rateAhadStr);
    const rateUmum = rateUmumStr === "" ? 0 : parseFloat(rateUmumStr);

    // Auto-fill Sunday and holiday rates if they're zero and normal rate is non-zero
    const finalRateAhad =
      rateAhad === 0 && rateBiasa > 0 ? rateBiasa : rateAhad;
    const finalRateUmum =
      rateUmum === 0 && rateBiasa > 0 ? rateBiasa : rateUmum;

    const dataToSave: PayCode = {
      ...formData,
      id: formData.id.trim(), // Ensure trimmed ID
      // Use auto-filled rates where appropriate
      rate_biasa: rateBiasa,
      rate_ahad: finalRateAhad,
      rate_umum: finalRateUmum,
    } as PayCode; // Assert type if Omit was used for state

    try {
      await onSave(dataToSave); // Pass the processed data
      // Parent (PayCodePage) will close the modal on success
    } catch (error: any) {
      console.error("Error saving pay code:", error);
      // Display error message from the API or a generic one
      setError(
        error.message || "Failed to save pay code. Check console for details."
      );
      setIsSaving(false); // Ensure button is re-enabled on error
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => !isSaving && onClose()}
      >
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
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-md transform rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold leading-6 text-default-800 dark:text-gray-100"
                >
                  {isEditMode ? "Edit Pay Code" : "Add New Pay Code"}
                </DialogTitle>
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  {/* ID Input */}
                  <FormInput
                    label="ID"
                    name="id"
                    value={formData.id}
                    onChange={handleChange}
                    required
                    disabled={isSaving || isEditMode} // Disable ID editing after creation
                    placeholder="e.g., MEE_BASIC_PAY (Unique)"
                  />

                  {/* REMOVED Code Input */}

                  {/* Description Input */}
                  <FormInput
                    label="Description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    required
                    disabled={isSaving}
                    placeholder="e.g., Basic Pay for Mee Section"
                  />

                  {/* Pay Type Listbox */}
                  <FormListbox
                    label="Pay Type"
                    name="pay_type"
                    // Ensure value matches one of the option IDs
                    value={
                      payTypeOptions.find((opt) => opt.id === formData.pay_type)
                        ? formData.pay_type
                        : payTypeOptions[0].id
                    }
                    onChange={handleListboxChange("pay_type")}
                    options={payTypeOptions}
                    required
                    disabled={isSaving}
                  />

                  {/* Rate Unit Listbox */}
                  <FormListbox
                    label="Rate Unit"
                    name="rate_unit"
                    // Ensure value matches one of the option IDs
                    value={
                      rateUnitOptions.find(
                        (opt) => opt.id === formData.rate_unit
                      )
                        ? formData.rate_unit
                        : rateUnitOptions[0].id
                    }
                    onChange={handleListboxChange("rate_unit")}
                    options={rateUnitOptions}
                    required
                    disabled={isSaving}
                  />

                  {/* Rate Inputs */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <FormInput
                      label={
                        formData.rate_unit === "Fixed"
                          ? "Normal Amount"
                          : `Normal Rate${
                              formData.rate_unit === "Percent" ? " (%)" : ""
                            }`
                      }
                      name="rate_biasa"
                      value={formData.rate_biasa?.toString() ?? ""}
                      onChange={handleChange}
                      type="text"
                      required={false}
                      disabled={isSaving}
                      placeholder={
                        formData.rate_unit === "Percent" ? "0-100" : "0.00"
                      }
                      max={formData.rate_unit === "Percent" ? 100 : undefined}
                    />
                    <FormInput
                      label={
                        formData.rate_unit === "Fixed"
                          ? "Sunday Amount"
                          : `Sunday Rate${
                              formData.rate_unit === "Percent" ? " (%)" : ""
                            }`
                      }
                      name="rate_ahad"
                      value={formData.rate_ahad?.toString() ?? ""}
                      onChange={handleChange}
                      type="text"
                      required={false}
                      disabled={isSaving}
                      placeholder={
                        formData.rate_unit === "Percent" ? "0-100" : "0.00"
                      }
                      max={formData.rate_unit === "Percent" ? 100 : undefined}
                    />
                    <FormInput
                      label={
                        formData.rate_unit === "Fixed"
                          ? "Holiday Amount"
                          : `Holiday Rate${
                              formData.rate_unit === "Percent" ? " (%)" : ""
                            }`
                      }
                      name="rate_umum"
                      value={formData.rate_umum?.toString() ?? ""}
                      onChange={handleChange}
                      type="text"
                      required={false}
                      disabled={isSaving}
                      placeholder={
                        formData.rate_unit === "Percent" ? "0-100" : "0.00"
                      }
                      max={formData.rate_unit === "Percent" ? 100 : undefined}
                    />
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                      checked={
                        formData.rate_unit === "Hour"
                        ? false
                        : !!formData.requires_units_input
                      }
                      onChange={() => {}}
                      size={20}
                      checkedColor="text-sky-600"
                      uncheckedColor="text-default-400"
                      // Disable for Percent, Bag, Day, Trip, Hour, and Fixed (auto-managed)
                      disabled={
                        isSaving ||
                        formData.rate_unit === "Percent" ||
                        formData.rate_unit === "Bag" ||
                        formData.rate_unit === "Hour" ||
                        formData.rate_unit === "Fixed" ||
                        formData.rate_unit === "Day" ||
                        formData.rate_unit === "Trip"
                      }
                      labelPosition="right"
                      label={
                        formData.rate_unit === "Percent"
                        ? "Requires Units Input (Required for Percentage)"
                        : formData.rate_unit === "Bag"
                        ? "Requires Units Input (Required for Bag)"
                        : formData.rate_unit === "Day"
                        ? "Requires Units Input (Required for Day)"
                        : formData.rate_unit === "Trip"
                        ? "Requires Units Input (Required for Trip)"
                        : formData.rate_unit === "Hour"
                        ? "Requires Units Input (Not Applicable for Hour)"
                        : formData.rate_unit === "Fixed"
                        ? "Requires Units Input (Units = Direct Amount)"
                        : "Requires Units Input"
                      }
                      />
                    </div>
                  </div>

                  {/* Error message */}
                  {error && (
                    <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
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
