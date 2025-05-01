import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconRotateClockwise } from "@tabler/icons-react";
import toast from "react-hot-toast";

import Button from "../Button";
import { JobPayCodeDetails } from "../../types/types";
import { api } from "../../routes/utils/api";
import Checkbox from "../Checkbox";

interface EditRatesState {
  biasa: string; // Use string for input control
  ahad: string;
  umum: string;
  is_default: boolean;
}

interface EditPayCodeRatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  payCodeDetail: JobPayCodeDetails | null;
  onRatesSaved: () => void; // Callback after successful save to refresh parent
}

const EditPayCodeRatesModal: React.FC<EditPayCodeRatesModalProps> = ({
  isOpen,
  onClose,
  jobId,
  payCodeDetail,
  onRatesSaved,
}) => {
  const [editRates, setEditRates] = useState<EditRatesState>({
    biasa: "",
    ahad: "",
    umum: "",
    is_default: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when modal opens or data changes
  useEffect(() => {
    if (isOpen && payCodeDetail) {
      setEditRates({
        biasa: payCodeDetail.override_rate_biasa?.toString() ?? "",
        ahad: payCodeDetail.override_rate_ahad?.toString() ?? "",
        umum: payCodeDetail.override_rate_umum?.toString() ?? "",
        is_default: payCodeDetail.is_default_setting || false,
      });
      setError(null); // Clear previous errors
      setIsSaving(false);
    }
  }, [isOpen, payCodeDetail]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    // Allow empty string, numbers, and single decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setEditRates((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleDefaultChange = (isChecked: boolean) => {
    setEditRates((prev) => ({
      ...prev,
      is_default: isChecked,
    }));
  };

  // Reset specific rate override input to empty string (meaning use default)
  const handleResetRate = (rateType: keyof EditRatesState) => {
    setEditRates((prev) => ({
      ...prev,
      [rateType]: "", // Empty string signifies clearing the override
    }));
    setError(null);
  };

  const handleSave = async () => {
    if (!payCodeDetail || isSaving) return;

    setIsSaving(true);
    setError(null);

    // Convert edited strings to numbers or null
    const newBiasa =
      editRates.biasa.trim() === ""
        ? null
        : parseFloat(editRates.biasa) || null;
    const newAhad =
      editRates.ahad.trim() === "" ? null : parseFloat(editRates.ahad) || null;
    const newUmum =
      editRates.umum.trim() === "" ? null : parseFloat(editRates.umum) || null;

    // Basic validation
    if (
      (newBiasa !== null && newBiasa < 0) ||
      (newAhad !== null && newAhad < 0) ||
      (newUmum !== null && newUmum < 0)
    ) {
      setError("Invalid rate value. Rates cannot be negative numbers.");
      setIsSaving(false);
      return;
    }

    // Determine which fields actually changed compared to existing values
    const payload: Record<string, number | null | boolean> = {};
    let changed = false;

    if (newBiasa !== payCodeDetail.override_rate_biasa) {
      payload.override_rate_biasa = newBiasa;
      changed = true;
    }
    if (newAhad !== payCodeDetail.override_rate_ahad) {
      payload.override_rate_ahad = newAhad;
      changed = true;
    }
    if (newUmum !== payCodeDetail.override_rate_umum) {
      payload.override_rate_umum = newUmum;
      changed = true;
    }
    // Add is_default to payload if changed
    if (editRates.is_default !== payCodeDetail.is_default_setting) {
      payload.is_default = editRates.is_default;
      changed = true;
    }

    if (!changed) {
      toast.success("No changes detected.");
      onClose();
      setIsSaving(false);
      return;
    }

    try {
      await api.put(`/api/job-pay-codes/${jobId}/${payCodeDetail.id}`, payload);
      toast.success("Pay code settings updated successfully");
      onRatesSaved(); // Trigger refresh in parent
      onClose();
    } catch (err: any) {
      console.error("Error updating pay code settings:", err);
      setError(err?.response?.data?.message || "Failed to update settings");
      toast.error(err?.response?.data?.message || "Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

  // Close modal handling
  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  const renderRateInput = (
    label: string,
    name: "biasa" | "ahad" | "umum",
    defaultValue: number | undefined | null
  ) => (
    <div className="flex items-end space-x-2">
      <div className="flex-1">
        <label
          htmlFor={name}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
        <input
          type="text"
          inputMode="decimal"
          id={name}
          name={name}
          value={editRates[name]}
          onChange={handleInputChange}
          className="mt-1 w-full rounded border border-default-300 p-1.5 text-right text-sm focus:border-sky-500 focus:ring-sky-500 disabled:bg-gray-100"
          disabled={isSaving}
          placeholder={`Default: ${(defaultValue ?? 0).toFixed(2)}`}
        />
      </div>
      <button
        type="button"
        onClick={() => handleResetRate(name)}
        className="mb-1 p-1 text-gray-500 hover:text-sky-600 disabled:text-gray-300"
        title={`Reset ${label} to Default`}
        disabled={isSaving || editRates[name] === ""} // Disable if already empty
      >
        <IconRotateClockwise size={18} />
      </button>
    </div>
  );

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild as={Fragment} /* Backdrop */>
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild as={Fragment} /* Panel */>
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold leading-6 text-gray-900"
                >
                  Edit Rates for {payCodeDetail?.id}
                </DialogTitle>
                <p className="mt-1 text-sm text-gray-600">
                  {payCodeDetail?.description}
                </p>

                <div className="mt-6 space-y-4">
                  {/* Display Default Rates for reference maybe? Or just in placeholder */}
                  {payCodeDetail && (
                    <>
                      {renderRateInput(
                        "Normal Rate Override (Biasa)",
                        "biasa",
                        payCodeDetail.rate_biasa
                      )}
                      {renderRateInput(
                        "Sunday Rate Override (Ahad)",
                        "ahad",
                        payCodeDetail.rate_ahad
                      )}
                      {renderRateInput(
                        "Holiday Rate Override (Umum)",
                        "umum",
                        payCodeDetail.rate_umum
                      )}
                    </>
                  )}

                  <div className="mt-4 border-t pt-4 border-gray-100">
                    <Checkbox
                      checked={editRates.is_default}
                      onChange={handleDefaultChange}
                      label={
                        <span>
                          <span className="font-medium">Default</span>
                          <span className="text-xs text-gray-500 ml-2">
                            (Auto-select this pay code when creating new
                            entries)
                          </span>
                        </span>
                      }
                      size={18}
                      checkedColor="text-sky-600"
                      uncheckedColor="text-gray-400"
                      disabled={isSaving}
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  )}
                </div>

                <div className="mt-8 flex justify-end space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
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

export default EditPayCodeRatesModal;
