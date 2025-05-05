// src/components/Catalogue/EditEmployeePayCodeRatesModal.tsx
import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconRotateClockwise, IconLinkOff } from "@tabler/icons-react";
import toast from "react-hot-toast";

import Button from "../Button";
import { EmployeePayCodeDetails } from "../../utils/catalogue/useJobPayCodeMappings";
import { api } from "../../routes/utils/api";
import Checkbox from "../Checkbox";

interface EditRatesState {
  biasa: string;
  ahad: string;
  umum: string;
  is_default: boolean;
}

interface EditEmployeePayCodeRatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  payCodeDetail: EmployeePayCodeDetails | null;
  onRatesSaved: () => void;
}

const EditEmployeePayCodeRatesModal: React.FC<
  EditEmployeePayCodeRatesModalProps
> = ({ isOpen, onClose, employeeId, payCodeDetail, onRatesSaved }) => {
  const [editRates, setEditRates] = useState<EditRatesState>({
    biasa: "",
    ahad: "",
    umum: "",
    is_default: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);

  // Initialize form when modal opens or data changes
  useEffect(() => {
    if (isOpen && payCodeDetail) {
      setEditRates({
        biasa: payCodeDetail.override_rate_biasa?.toString() ?? "",
        ahad: payCodeDetail.override_rate_ahad?.toString() ?? "",
        umum: payCodeDetail.override_rate_umum?.toString() ?? "",
        is_default: payCodeDetail.is_default_setting || false,
      });
      setError(null);
      setIsSaving(false);
      setShowUnlinkConfirm(false);
    }
  }, [isOpen, payCodeDetail]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
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

  const handleResetRate = (rateType: keyof EditRatesState) => {
    setEditRates((prev) => ({
      ...prev,
      [rateType]: "",
    }));
    setError(null);
  };

  const handleUnlink = async () => {
    if (!payCodeDetail || !employeeId) return;

    try {
      await api.delete(
        `/api/employee-pay-codes/${employeeId}/${payCodeDetail.id}`
      );
      toast.success("Pay code unlinked successfully");
      onRatesSaved();
      onClose();
    } catch (err: any) {
      console.error("Error unlinking employee pay code:", err);
      setError(err?.response?.data?.message || "Failed to unlink pay code");
      toast.error(err?.response?.data?.message || "Failed to unlink pay code");
    }
  };

  const handleSave = async () => {
    if (!payCodeDetail || isSaving) return;

    setIsSaving(true);
    setError(null);

    const newBiasa =
      editRates.biasa.trim() === ""
        ? null
        : parseFloat(editRates.biasa) || null;
    const newAhad =
      editRates.ahad.trim() === "" ? null : parseFloat(editRates.ahad) || null;
    const newUmum =
      editRates.umum.trim() === "" ? null : parseFloat(editRates.umum) || null;

    if (
      (newBiasa !== null && newBiasa < 0) ||
      (newAhad !== null && newAhad < 0) ||
      (newUmum !== null && newUmum < 0)
    ) {
      setError("Invalid rate value. Rates cannot be negative numbers.");
      setIsSaving(false);
      return;
    }

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
      await api.put(
        `/api/employee-pay-codes/${employeeId}/${payCodeDetail.id}`,
        payload
      );
      toast.success("Pay code settings updated successfully");
      onRatesSaved();
      onClose();
    } catch (err: any) {
      console.error("Error updating employee pay code settings:", err);
      setError(err?.response?.data?.message || "Failed to update settings");
      toast.error(err?.response?.data?.message || "Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

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
        disabled={isSaving || editRates[name] === ""}
      >
        <IconRotateClockwise size={18} />
      </button>
    </div>
  );

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild as={Fragment}>
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild as={Fragment}>
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

                    {/* Unlink button section */}
                    <div className="h-8 flex items-center">
                      {!showUnlinkConfirm ? (
                        <button
                          type="button"
                          className="inline-flex items-center font-medium text-sm text-red-600 hover:text-red-800 hover:underline"
                          onClick={() => setShowUnlinkConfirm(true)}
                          disabled={isSaving}
                        >
                          <IconLinkOff size={16} className="mr-1" />
                          Unlink Pay Code
                        </button>
                      ) : (
                        <div className="inline-flex items-center space-x-2">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-full"
                            onClick={handleUnlink}
                            disabled={isSaving}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs font-medium text-default-600 bg-default-100 hover:bg-default-200 rounded-full"
                            onClick={() => setShowUnlinkConfirm(false)}
                            disabled={isSaving}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  )}
                </div>

                <div className="flex justify-end space-x-3">
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

export default EditEmployeePayCodeRatesModal;
