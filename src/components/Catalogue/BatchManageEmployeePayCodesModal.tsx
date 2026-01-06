// src/components/Catalogue/BatchManageEmployeePayCodesModal.tsx
import React, { useState, useEffect, useMemo, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconX,
  IconPlus,
  IconTrash,
  IconSearch,
  IconCode,
  IconCheck,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { PayCode, Employee } from "../../types/types";
import { EmployeePayCodeDetails } from "../../utils/catalogue/useJobPayCodeMappings";
import { api } from "../../routes/utils/api";
import Button from "../Button";
import toast from "react-hot-toast";

interface BatchManageEmployeePayCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  availablePayCodes: PayCode[];
  currentPayCodeDetails: EmployeePayCodeDetails[];
  onAssociationComplete: () => Promise<void>;
}

const BatchManageEmployeePayCodesModal: React.FC<BatchManageEmployeePayCodesModalProps> = ({
  isOpen,
  onClose,
  employee,
  availablePayCodes,
  currentPayCodeDetails,
  onAssociationComplete,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Pay code selection state
  const [selectedPayCodes, setSelectedPayCodes] = useState<Set<string>>(new Set());
  const [originalPayCodes, setOriginalPayCodes] = useState<Set<string>>(new Set());

  // Default state
  const [defaultPayCodes, setDefaultPayCodes] = useState<Set<string>>(new Set());
  const [originalDefaults, setOriginalDefaults] = useState<Set<string>>(new Set());

  // Search state
  const [assignedSearch, setAssignedSearch] = useState("");
  const [availableSearch, setAvailableSearch] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && currentPayCodeDetails) {
      const currentIds = new Set(currentPayCodeDetails.map((pc) => pc.id));
      setSelectedPayCodes(currentIds);
      setOriginalPayCodes(new Set(currentIds));

      const currentDefaults = new Set(
        currentPayCodeDetails.filter((pc) => pc.is_default_setting).map((pc) => pc.id)
      );
      setDefaultPayCodes(currentDefaults);
      setOriginalDefaults(new Set(currentDefaults));

      setError("");
      setAssignedSearch("");
      setAvailableSearch("");
    }
  }, [isOpen, currentPayCodeDetails]);

  // Assigned pay codes (sorted alphabetically)
  const assignedPayCodes = useMemo(() => {
    const assigned = availablePayCodes.filter((pc) => selectedPayCodes.has(pc.id));
    if (!assignedSearch) return assigned.sort((a, b) => a.description.localeCompare(b.description));
    const search = assignedSearch.toLowerCase();
    return assigned
      .filter(
        (pc) =>
          pc.id.toLowerCase().includes(search) ||
          pc.description.toLowerCase().includes(search)
      )
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [availablePayCodes, selectedPayCodes, assignedSearch]);

  // Available pay codes (not assigned, sorted alphabetically)
  const unassignedPayCodes = useMemo(() => {
    const available = availablePayCodes.filter((pc) => !selectedPayCodes.has(pc.id));
    if (!availableSearch) return available.sort((a, b) => a.description.localeCompare(b.description));
    const search = availableSearch.toLowerCase();
    return available
      .filter(
        (pc) =>
          pc.id.toLowerCase().includes(search) ||
          pc.description.toLowerCase().includes(search)
      )
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [availablePayCodes, selectedPayCodes, availableSearch]);

  // Check for changes
  const hasChanges = useMemo(() => {
    if (selectedPayCodes.size !== originalPayCodes.size) return true;
    for (const id of selectedPayCodes) {
      if (!originalPayCodes.has(id)) return true;
    }
    if (defaultPayCodes.size !== originalDefaults.size) return true;
    for (const id of defaultPayCodes) {
      if (!originalDefaults.has(id)) return true;
    }
    for (const id of originalDefaults) {
      if (!defaultPayCodes.has(id)) return true;
    }
    return false;
  }, [selectedPayCodes, originalPayCodes, defaultPayCodes, originalDefaults]);

  // Changes summary
  const changesSummary = useMemo(() => {
    const toAdd = Array.from(selectedPayCodes).filter((id) => !originalPayCodes.has(id)).length;
    const toRemove = Array.from(originalPayCodes).filter((id) => !selectedPayCodes.has(id)).length;
    const defaultsChanged =
      Array.from(defaultPayCodes).filter((id) => !originalDefaults.has(id)).length +
      Array.from(originalDefaults).filter((id) => !defaultPayCodes.has(id)).length;
    return { toAdd, toRemove, defaultsChanged };
  }, [selectedPayCodes, originalPayCodes, defaultPayCodes, originalDefaults]);

  const handleAddPayCode = (payCodeId: string) => {
    setSelectedPayCodes((prev) => new Set([...prev, payCodeId]));
  };

  const handleRemovePayCode = (payCodeId: string) => {
    setSelectedPayCodes((prev) => {
      const newSet = new Set(prev);
      newSet.delete(payCodeId);
      return newSet;
    });
    // Also remove from defaults if it was set
    setDefaultPayCodes((prev) => {
      const newSet = new Set(prev);
      newSet.delete(payCodeId);
      return newSet;
    });
  };

  const handleToggleDefault = (payCodeId: string) => {
    setDefaultPayCodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(payCodeId)) {
        newSet.delete(payCodeId);
      } else {
        newSet.add(payCodeId);
      }
      return newSet;
    });
  };

  const handleSubmit = async () => {
    if (!employee) return;
    setError("");
    setIsSaving(true);

    try {
      const promises: Promise<any>[] = [];

      // Calculate what needs to be added/removed
      const paycodesToAdd = Array.from(selectedPayCodes).filter((id) => !originalPayCodes.has(id));
      const paycodesToRemove = Array.from(originalPayCodes).filter((id) => !selectedPayCodes.has(id));

      // Handle additions
      for (const payCodeId of paycodesToAdd) {
        promises.push(
          api.post("/api/employee-pay-codes", {
            employee_id: employee.id,
            pay_code_id: payCodeId,
            is_default: defaultPayCodes.has(payCodeId),
          })
        );
      }

      // Handle removals
      for (const payCodeId of paycodesToRemove) {
        promises.push(
          api.delete(`/api/employee-pay-codes/${employee.id}/${payCodeId}`)
        );
      }

      // Handle default changes (only for existing pay codes that weren't added/removed)
      const existingPayCodes = Array.from(selectedPayCodes).filter(
        (id) => originalPayCodes.has(id) && !paycodesToRemove.includes(id)
      );

      const defaultsToSet = existingPayCodes.filter(
        (id) => defaultPayCodes.has(id) && !originalDefaults.has(id)
      );
      const defaultsToClear = existingPayCodes.filter(
        (id) => !defaultPayCodes.has(id) && originalDefaults.has(id)
      );

      if (defaultsToSet.length > 0) {
        promises.push(
          api.put("/api/employee-pay-codes/batch-default", {
            employee_id: employee.id,
            pay_code_ids: defaultsToSet,
            is_default: true,
          })
        );
      }

      if (defaultsToClear.length > 0) {
        promises.push(
          api.put("/api/employee-pay-codes/batch-default", {
            employee_id: employee.id,
            pay_code_ids: defaultsToClear,
            is_default: false,
          })
        );
      }

      // Wait for all operations
      await Promise.all(promises);

      await onAssociationComplete();
      toast.success("Pay codes updated successfully");
      handleClose();
    } catch (err: any) {
      console.error("Error saving pay code changes:", err);
      setError(err.message || "Failed to save changes");
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    setSelectedPayCodes(new Set());
    setOriginalPayCodes(new Set());
    setDefaultPayCodes(new Set());
    setOriginalDefaults(new Set());
    setAssignedSearch("");
    setAvailableSearch("");
    setError("");
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => !isSaving && handleClose()}
      >
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-black/50 dark:bg-black/70"
            aria-hidden="true"
          />
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
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                  >
                    Manage Pay Codes for "{employee?.name || ""}"
                  </DialogTitle>
                  <button
                    onClick={handleClose}
                    className="text-default-400 hover:text-default-600 dark:text-gray-400 dark:hover:text-gray-200"
                    disabled={isSaving}
                  >
                    <IconX size={20} />
                  </button>
                </div>

                {/* Two Column Layout */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Left Panel - Assigned Pay Codes */}
                  <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                    <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                      <div className="flex items-center gap-2 text-sm font-medium text-default-700 dark:text-gray-200">
                        <IconCode size={16} />
                        Assigned Pay Codes ({selectedPayCodes.size})
                      </div>
                      <div className="relative mt-2">
                        <IconSearch
                          size={16}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                        />
                        <input
                          type="text"
                          placeholder="Search assigned..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                          value={assignedSearch}
                          onChange={(e) => setAssignedSearch(e.target.value)}
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto">
                      {assignedPayCodes.length === 0 ? (
                        <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                          <IconCode
                            size={32}
                            className="mx-auto mb-2 text-default-300 dark:text-gray-500"
                          />
                          {assignedSearch ? "No pay codes found" : "No pay codes assigned yet"}
                        </div>
                      ) : (
                        <ul className="divide-y divide-default-100 dark:divide-gray-600">
                          {assignedPayCodes.map((pc) => {
                            const isNew = !originalPayCodes.has(pc.id);
                            const isDefault = defaultPayCodes.has(pc.id);
                            return (
                              <li
                                key={pc.id}
                                className={`px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                                  isNew ? "bg-sky-50/50 dark:bg-sky-900/20" : ""
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm text-default-800 dark:text-gray-100 flex items-center gap-2">
                                    {pc.description}
                                    {isNew && (
                                      <span className="text-xs px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded">
                                        New
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-default-500 dark:text-gray-400 flex items-center gap-2">
                                    <span>{pc.id}</span>
                                    <span className="px-1.5 py-0.5 bg-default-100 dark:bg-gray-600 rounded">
                                      {pc.pay_type}
                                    </span>
                                    <span className="px-1.5 py-0.5 bg-default-100 dark:bg-gray-600 rounded">
                                      {pc.rate_unit}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDefault(pc.id)}
                                    disabled={isSaving}
                                    className={`p-1.5 rounded disabled:opacity-50 transition-colors ${
                                      isDefault
                                        ? "text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                                        : "text-default-300 hover:text-amber-400 dark:text-gray-500 dark:hover:text-amber-400"
                                    }`}
                                    title={isDefault ? "Remove default" : "Set as default"}
                                  >
                                    {isDefault ? <IconStarFilled size={18} /> : <IconStar size={18} />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePayCode(pc.id)}
                                    disabled={isSaving}
                                    className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                                    title="Remove pay code"
                                  >
                                    <IconTrash size={16} />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Right Panel - Available Pay Codes */}
                  <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                    <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-default-700 dark:text-gray-200">
                          Add Pay Code
                        </div>
                        <span className="text-xs text-default-500 dark:text-gray-400">
                          {unassignedPayCodes.length} available
                        </span>
                      </div>
                      <div className="relative mt-2">
                        <IconSearch
                          size={16}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                        />
                        <input
                          type="text"
                          placeholder="Search available..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                          value={availableSearch}
                          onChange={(e) => setAvailableSearch(e.target.value)}
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto">
                      {unassignedPayCodes.length === 0 ? (
                        <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                          <IconCheck
                            size={32}
                            className="mx-auto mb-2 text-emerald-400"
                          />
                          {availableSearch ? "No pay codes found" : "All pay codes assigned"}
                        </div>
                      ) : (
                        <ul className="divide-y divide-default-100 dark:divide-gray-600">
                          {unassignedPayCodes.map((pc) => (
                            <li
                              key={pc.id}
                              className="px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-default-800 dark:text-gray-100">
                                  {pc.description}
                                </div>
                                <div className="text-xs text-default-500 dark:text-gray-400 flex items-center gap-2">
                                  <span>{pc.id}</span>
                                  <span className="px-1.5 py-0.5 bg-default-100 dark:bg-gray-600 rounded">
                                    {pc.pay_type}
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-default-100 dark:bg-gray-600 rounded">
                                    {pc.rate_unit}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddPayCode(pc.id)}
                                disabled={isSaving}
                                className="p-1.5 text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded disabled:opacity-50"
                                title="Add pay code"
                              >
                                <IconPlus size={18} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                    <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-6 flex justify-between items-center">
                  <div className="text-sm text-default-500 dark:text-gray-400">
                    {hasChanges ? (
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                          Assigned: {selectedPayCodes.size}
                        </span>
                        <span className="text-amber-600 dark:text-amber-400">
                          ({changesSummary.toAdd > 0 && `+${changesSummary.toAdd}`}
                          {changesSummary.toAdd > 0 && changesSummary.toRemove > 0 && ", "}
                          {changesSummary.toRemove > 0 && `-${changesSummary.toRemove}`}
                          {(changesSummary.toAdd > 0 || changesSummary.toRemove > 0) &&
                            changesSummary.defaultsChanged > 0 &&
                            ", "}
                          {changesSummary.defaultsChanged > 0 &&
                            `${changesSummary.defaultsChanged} default${changesSummary.defaultsChanged > 1 ? "s" : ""} changed`})
                        </span>
                      </div>
                    ) : (
                      <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                        <IconCheck size={14} /> No changes
                      </span>
                    )}
                  </div>
                  <div className="flex space-x-3">
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
                      onClick={handleSubmit}
                      disabled={isSaving || !hasChanges}
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
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

export default BatchManageEmployeePayCodesModal;
