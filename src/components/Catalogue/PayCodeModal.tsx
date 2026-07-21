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
import PayRateScheduleManager from "./PayRateScheduleManager";

interface PayCodeModalProps {
  // API base for the rate-timeline endpoints (JP passes /jellypolly/api)
  apiBase?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payCode: PayCode) => Promise<void>; // Parameter is the full PayCode (without code)
  initialData?: PayCode | null; // PayCode object (without code)
  existingPayCodes: PayCode[]; // Still needed for ID duplicate check
}

type PayCodeRateField = "rate_biasa" | "rate_ahad" | "rate_umum";
type PayCodeListboxField = "pay_type" | "rate_unit" | "report_column";
type PayCodeFormData = Omit<
  PayCode,
  "code" | "rate_biasa" | "rate_ahad" | "rate_umum"
> & {
  rate_biasa: string;
  rate_ahad: string;
  rate_umum: string;
};

const RATE_FIELDS: PayCodeRateField[] = [
  "rate_biasa",
  "rate_ahad",
  "rate_umum",
];
const RATE_UNITS_REQUIRING_UNITS_INPUT: RateUnit[] = [
  "Percent",
  "Trip",
  "Day",
  "Bag",
  "Ctn",
  "Kg",
  "Karung",
  "Bundle",
  "Fixed",
  "Tray",
];

const isRateField = (name: string): name is PayCodeRateField =>
  RATE_FIELDS.includes(name as PayCodeRateField);

const toRateInputValue = (value: number | string | null | undefined): string => {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue.toString() : "0";
};

const parseRateInput = (value: string): number =>
  value.trim() === "" ? 0 : parseFloat(value);

const getTimelineBaseRate = (value: string): number => {
  const parsedValue = parseRateInput(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

// Default state without 'code'
const defaultPayCode: PayCodeFormData = {
  // Use Omit if PayCode type still has 'code' temporarily
  id: "",
  description: "",
  pay_type: "Base",
  rate_unit: "Hour",
  rate_biasa: "0",
  rate_ahad: "0",
  rate_umum: "0",
  is_active: true,
  requires_units_input: false,
  report_column: null,
};

const PayCodeModal: React.FC<PayCodeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  existingPayCodes,
  apiBase = "/api",
}) => {
  // State type should match the structure without 'code'
  const [formData, setFormData] = useState<PayCodeFormData>(defaultPayCode);
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
    { id: "Ctn", name: "Ctn (Carton)" },
    { id: "Kg", name: "Kilogram" },
    { id: "Karung", name: "Karung" },
    { id: "Bundle", name: "Bundle" },
    { id: "Trip", name: "Trip" },
    { id: "Tray", name: "Tray" },
    { id: "Percent", name: "Percent" },
    { id: "Fixed", name: "Fixed" },
  ];

  // Salary Report column override (priority below the per-entry Others override).
  // "" = automatic bucketing rule. Labels mirror the Add/Edit Others modals.
  const reportColumnOptions = [
    { id: "", name: "Automatic (by rule)" },
    { id: "GAJI", name: "GAJI" },
    { id: "OT", name: "OT" },
    { id: "BONUS", name: "BONUS" },
    { id: "CIO", name: "C/I/O" },
    { id: "CUTI", name: "CUTI" },
  ];

  // Initialize form data
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // If initialData somehow still has 'code', remove it
        const { code, ...restData } = initialData as any; // Cast temporarily if needed
        setFormData({
          ...restData, // Use data without code
          rate_biasa: toRateInputValue(restData.rate_biasa),
          rate_ahad: toRateInputValue(restData.rate_ahad),
          rate_umum: toRateInputValue(restData.rate_umum),
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
  ): void => {
    const { name, value, type } = e.target;

    if (type === "checkbox" && e.target instanceof HTMLInputElement) {
      const target = e.target as HTMLInputElement;
      setFormData((prev) => ({ ...prev, [name]: target.checked }));
    } else if (isRateField(name)) {
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
    (name: PayCodeListboxField): ((value: string) => void) =>
    (value: string): void => {
      if (name === "rate_unit") {
        const rateUnit = value as RateUnit;
        setFormData((prev) => ({
          ...prev,
          rate_unit: rateUnit,
          requires_units_input:
            RATE_UNITS_REQUIRING_UNITS_INPUT.includes(rateUnit),
        }));
      } else if (name === "pay_type") {
        setFormData((prev) => ({
          ...prev,
          pay_type: value as PayType,
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          report_column: value || null,
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
    const rateBiasaNum = parseRateInput(formData.rate_biasa);
    const rateAhadNum = parseRateInput(formData.rate_ahad);
    const rateUmumNum = parseRateInput(formData.rate_umum);

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
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    // Parse rate values
    const rateBiasa = parseRateInput(formData.rate_biasa);
    const rateAhad = parseRateInput(formData.rate_ahad);
    const rateUmum = parseRateInput(formData.rate_umum);

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
      // Empty string from the listbox means "automatic" -> store as null
      report_column: formData.report_column || null,
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
              <DialogPanel className="w-full max-w-2xl transform rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
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

                  {/* Salary Report Column Override Listbox */}
                  <FormListbox
                    label="Salary Report Column"
                    name="report_column"
                    value={formData.report_column ?? ""}
                    onChange={handleListboxChange("report_column")}
                    options={reportColumnOptions}
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
                      // Disable for production-based units (auto-managed)
                      disabled={
                        isSaving ||
                          formData.rate_unit === "Percent" ||
                          formData.rate_unit === "Bag" ||
                          formData.rate_unit === "Ctn" ||
                          formData.rate_unit === "Kg" ||
                        formData.rate_unit === "Karung" ||
                        formData.rate_unit === "Bundle" ||
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
                        : formData.rate_unit === "Ctn"
                        ? "Requires Units Input (Required for Carton)"
                        : formData.rate_unit === "Kg"
                        ? "Requires Units Input (Required for Kilogram)"
                        : formData.rate_unit === "Karung"
                        ? "Requires Units Input (Required for Karung)"
                        : formData.rate_unit === "Bundle"
                        ? "Requires Units Input (Required for Bundle)"
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

                  {/* Effective-dated rate changes (existing pay codes only) */}
                  {isEditMode && formData.id && (
                    <PayRateScheduleManager
                      apiBase={apiBase}
                      scope="pay_code"
                      payCodeId={formData.id}
                      baseRates={{
                        biasa: getTimelineBaseRate(formData.rate_biasa),
                        ahad: getTimelineBaseRate(formData.rate_ahad),
                        umum: getTimelineBaseRate(formData.rate_umum),
                      }}
                    />
                  )}

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
