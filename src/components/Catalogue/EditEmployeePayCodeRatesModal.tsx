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
import PayRateScheduleManager from "./PayRateScheduleManager";

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

  const renderRateField = (
    label: string,
    name: "biasa" | "ahad" | "umum",
    defaultValue: number | undefined | null
  ) => {
    const overridden = editRates[name] !== "";
    return (
      <div>
        <label
          htmlFor={name}
          className="block text-xs font-medium text-default-500 dark:text-gray-400"
        >
          {label}
        </label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            RM
          </span>
          <input
            type="text"
            inputMode="decimal"
            id={name}
            name={name}
            value={editRates[name]}
            onChange={handleInputChange}
            placeholder={(defaultValue ?? 0).toFixed(2)}
            disabled={isSaving}
            className={`w-full rounded-lg border ${
              overridden
                ? "border-sky-400 dark:border-sky-500"
                : "border-default-300 dark:border-gray-600"
            } bg-white dark:bg-gray-700 py-1.5 pl-9 pr-7 text-right text-sm text-gray-900 dark:text-gray-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:bg-gray-100 dark:disabled:bg-gray-800`}
          />
          {overridden && (
            <button
              type="button"
              onClick={() => handleResetRate(name)}
              title={`Reset ${label} to default`}
              disabled={isSaving}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-sky-600 dark:hover:text-sky-400"
            >
              <IconRotateClockwise size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild as={Fragment}>
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild as={Fragment}>
              <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold leading-6 text-default-800 dark:text-gray-100"
                >
                  Edit Rates for {payCodeDetail?.id}
                </DialogTitle>
                <p className="mt-1 text-sm text-default-600 dark:text-gray-300">
                  {payCodeDetail?.description}
                </p>

                <div className="mt-6 space-y-4">
                  {payCodeDetail && (
                    <>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-default-700 dark:text-gray-200">
                            Rate overrides
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Blank = use the default rate
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-3">
                          {renderRateField(
                            "Biasa (Normal)",
                            "biasa",
                            payCodeDetail.rate_biasa
                          )}
                          {renderRateField(
                            "Ahad (Sunday)",
                            "ahad",
                            payCodeDetail.rate_ahad
                          )}
                          {renderRateField(
                            "Umum (Holiday)",
                            "umum",
                            payCodeDetail.rate_umum
                          )}
                        </div>
                      </div>
                      <PayRateScheduleManager
                        scope="employee"
                        payCodeId={payCodeDetail.id}
                        employeeId={employeeId}
                        baseRates={{
                          biasa:
                            payCodeDetail.override_rate_biasa ??
                            payCodeDetail.rate_biasa,
                          ahad:
                            payCodeDetail.override_rate_ahad ??
                            payCodeDetail.rate_ahad,
                          umum:
                            payCodeDetail.override_rate_umum ??
                            payCodeDetail.rate_umum,
                        }}
                      />
                    </>
                  )}
                  {/* Default checkbox + unlink button (all pay types) */}
                  {payCodeDetail && (
                    <div className="mt-4 border-t pt-4 border-gray-100 dark:border-gray-700">
                      <Checkbox
                        checked={editRates.is_default}
                        onChange={handleDefaultChange}
                        label={
                          <span>
                            <span className="font-medium text-default-700 dark:text-gray-200">Default</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
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
                              className="px-2 py-1 text-xs font-medium text-default-600 dark:text-gray-300 bg-default-100 dark:bg-gray-700 hover:bg-default-200 dark:hover:bg-gray-600 rounded-full"
                              onClick={() => setShowUnlinkConfirm(false)}
                              disabled={isSaving}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {error && (
                    <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
                  )}
                </div>

                <div className="flex justify-end space-x-3 mt-1">
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
