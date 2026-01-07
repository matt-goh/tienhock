// src/components/Catalogue/AssociatePayCodesWithEmployeesModal.tsx
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
  IconUsers,
  IconCheck,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import Button from "../Button";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { PayCode, Employee } from "../../types/types";

interface EmployeeDetail {
  id: string;
  is_default: boolean;
}

interface AssociatePayCodesWithEmployeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  payCode: PayCode | null;
  availableEmployees: Employee[];
  currentEmployeeDetails: EmployeeDetail[];
  onAssociationComplete: () => Promise<void>;
}

const AssociatePayCodesWithEmployeesModal: React.FC<
  AssociatePayCodesWithEmployeesModalProps
> = ({
  isOpen,
  onClose,
  payCode,
  availableEmployees,
  currentEmployeeDetails,
  onAssociationComplete,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Employee selection state
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [originalEmployees, setOriginalEmployees] = useState<Set<string>>(new Set());

  // Default state
  const [defaultEmployees, setDefaultEmployees] = useState<Set<string>>(new Set());
  const [originalDefaults, setOriginalDefaults] = useState<Set<string>>(new Set());

  // Search state
  const [assignedSearch, setAssignedSearch] = useState("");
  const [availableSearch, setAvailableSearch] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && currentEmployeeDetails) {
      const currentIds = new Set(currentEmployeeDetails.map((e) => e.id));
      setSelectedEmployees(currentIds);
      setOriginalEmployees(new Set(currentIds));

      const currentDefaults = new Set(
        currentEmployeeDetails.filter((e) => e.is_default).map((e) => e.id)
      );
      setDefaultEmployees(currentDefaults);
      setOriginalDefaults(new Set(currentDefaults));

      setError("");
      setAssignedSearch("");
      setAvailableSearch("");
    }
  }, [isOpen, currentEmployeeDetails]);

  // Get active employees only
  const activeEmployees = useMemo(() => {
    return availableEmployees.filter((emp) => !emp.dateResigned);
  }, [availableEmployees]);

  // Assigned employees (sorted alphabetically)
  const assignedEmployees = useMemo(() => {
    const assigned = activeEmployees.filter((emp) => selectedEmployees.has(emp.id));
    if (!assignedSearch) return assigned.sort((a, b) => a.name.localeCompare(b.name));
    const search = assignedSearch.toLowerCase();
    return assigned
      .filter(
        (emp) =>
          emp.id.toLowerCase().includes(search) ||
          emp.name.toLowerCase().includes(search) ||
          emp.job.some((j) => j.toLowerCase().includes(search))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeEmployees, selectedEmployees, assignedSearch]);

  // Available employees (not assigned, sorted alphabetically)
  const unassignedEmployees = useMemo(() => {
    const available = activeEmployees.filter((emp) => !selectedEmployees.has(emp.id));
    if (!availableSearch) return available.sort((a, b) => a.name.localeCompare(b.name));
    const search = availableSearch.toLowerCase();
    return available
      .filter(
        (emp) =>
          emp.id.toLowerCase().includes(search) ||
          emp.name.toLowerCase().includes(search) ||
          emp.job.some((j) => j.toLowerCase().includes(search))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeEmployees, selectedEmployees, availableSearch]);

  // Check for changes
  const hasChanges = useMemo(() => {
    if (selectedEmployees.size !== originalEmployees.size) return true;
    for (const id of selectedEmployees) {
      if (!originalEmployees.has(id)) return true;
    }
    if (defaultEmployees.size !== originalDefaults.size) return true;
    for (const id of defaultEmployees) {
      if (!originalDefaults.has(id)) return true;
    }
    for (const id of originalDefaults) {
      if (!defaultEmployees.has(id)) return true;
    }
    return false;
  }, [selectedEmployees, originalEmployees, defaultEmployees, originalDefaults]);

  // Changes summary
  const changesSummary = useMemo(() => {
    const toAdd = Array.from(selectedEmployees).filter((id) => !originalEmployees.has(id)).length;
    const toRemove = Array.from(originalEmployees).filter((id) => !selectedEmployees.has(id)).length;
    const defaultsChanged =
      Array.from(defaultEmployees).filter((id) => !originalDefaults.has(id)).length +
      Array.from(originalDefaults).filter((id) => !defaultEmployees.has(id)).length;
    return { toAdd, toRemove, defaultsChanged };
  }, [selectedEmployees, originalEmployees, defaultEmployees, originalDefaults]);

  const handleAddEmployee = (employeeId: string) => {
    setSelectedEmployees((prev) => new Set([...prev, employeeId]));
    // New employees default to is_default: true
    setDefaultEmployees((prev) => new Set([...prev, employeeId]));
  };

  const handleRemoveEmployee = (employeeId: string) => {
    setSelectedEmployees((prev) => {
      const newSet = new Set(prev);
      newSet.delete(employeeId);
      return newSet;
    });
    // Also remove from defaults if it was set
    setDefaultEmployees((prev) => {
      const newSet = new Set(prev);
      newSet.delete(employeeId);
      return newSet;
    });
  };

  const handleToggleDefault = (employeeId: string) => {
    setDefaultEmployees((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
  };

  const handleSubmit = async () => {
    if (!payCode) return;
    setError("");
    setIsSaving(true);

    try {
      const promises: Promise<any>[] = [];

      // Calculate what needs to be added/removed
      const employeesToAdd = Array.from(selectedEmployees).filter((id) => !originalEmployees.has(id));
      const employeesToRemove = Array.from(originalEmployees).filter((id) => !selectedEmployees.has(id));

      // Handle additions with batch API
      if (employeesToAdd.length > 0) {
        const associations = employeesToAdd.map((employeeId) => ({
          employee_id: employeeId,
          pay_code_id: payCode.id,
          is_default: defaultEmployees.has(employeeId),
        }));
        promises.push(api.post("/api/employee-pay-codes/batch", { associations }));
      }

      // Handle removals with batch API
      if (employeesToRemove.length > 0) {
        const items = employeesToRemove.map((employeeId) => ({
          employee_id: employeeId,
          pay_code_id: payCode.id,
        }));
        promises.push(api.post("/api/employee-pay-codes/batch-delete", { items }));
      }

      // Handle default changes (only for existing employees that weren't added/removed)
      // Note: If an ID is in both selectedEmployees and originalEmployees, it wasn't removed
      const existingEmployees = Array.from(selectedEmployees).filter(
        (id) => originalEmployees.has(id)
      );

      const defaultsToSet = existingEmployees.filter(
        (id) => defaultEmployees.has(id) && !originalDefaults.has(id)
      );
      const defaultsToClear = existingEmployees.filter(
        (id) => !defaultEmployees.has(id) && originalDefaults.has(id)
      );

      if (defaultsToSet.length > 0) {
        promises.push(
          api.put("/api/employee-pay-codes/batch-default", {
            pay_code_id: payCode.id,
            employee_ids: defaultsToSet,
            is_default: true,
          })
        );
      }

      if (defaultsToClear.length > 0) {
        promises.push(
          api.put("/api/employee-pay-codes/batch-default", {
            pay_code_id: payCode.id,
            employee_ids: defaultsToClear,
            is_default: false,
          })
        );
      }

      // Wait for all operations using allSettled to handle partial failures gracefully
      const results = await Promise.allSettled(promises);

      // Analyze results
      const failed = results.filter((r) => r.status === "rejected");
      const succeeded = results.filter((r) => r.status === "fulfilled");

      // Check if all failures are just "not found" errors (stale cache issue)
      const realFailures = failed.filter((r) => {
        const errorData = (r as PromiseRejectedResult).reason?.data;
        // If all errors in the response are "not found", it's not a real failure
        if (errorData?.errors?.every((e: { message: string }) => e.message === "Association not found")) {
          console.warn("Some associations were already removed (stale cache):", errorData.errors);
          return false;
        }
        return true;
      });

      // Check fulfilled results for partial errors
      const partialErrors = succeeded
        .map((r) => (r as PromiseFulfilledResult<any>).value)
        .filter((result) => result.errors && result.errors.length > 0);
      if (partialErrors.length > 0) {
        console.warn("Some associations had partial errors:", partialErrors);
      }

      // If there are real failures, throw an error
      if (realFailures.length > 0) {
        const firstError = (realFailures[0] as PromiseRejectedResult).reason;
        throw firstError;
      }

      await onAssociationComplete();
      toast.success(
        `Pay code "${payCode.description}" updated - Added: ${employeesToAdd.length}, Removed: ${employeesToRemove.length} employee(s)`
      );
      handleClose();
    } catch (err: any) {
      console.error("Error saving employee changes:", err);
      setError(err.message || "Failed to save changes");
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    setSelectedEmployees(new Set());
    setOriginalEmployees(new Set());
    setDefaultEmployees(new Set());
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
                    Manage Employees for "{payCode?.description || ""}"
                  </DialogTitle>
                  <button
                    onClick={handleClose}
                    className="text-default-400 hover:text-default-600 dark:text-gray-400 dark:hover:text-gray-200"
                    disabled={isSaving}
                  >
                    <IconX size={20} />
                  </button>
                </div>

                {payCode ? (
                  <>
                    {/* Two Column Layout */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Left Panel - Assigned Employees */}
                      <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                        <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                          <div className="flex items-center gap-2 text-sm font-medium text-default-700 dark:text-gray-200">
                            <IconUsers size={16} />
                            Assigned Employees ({selectedEmployees.size})
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
                          {assignedEmployees.length === 0 ? (
                            <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                              <IconUsers
                                size={32}
                                className="mx-auto mb-2 text-default-300 dark:text-gray-500"
                              />
                              {assignedSearch ? "No employees found" : "No employees assigned yet"}
                            </div>
                          ) : (
                            <ul className="divide-y divide-default-100 dark:divide-gray-600">
                              {assignedEmployees.map((emp) => {
                                const isNew = !originalEmployees.has(emp.id);
                                const isDefault = defaultEmployees.has(emp.id);
                                return (
                                  <li
                                    key={emp.id}
                                    className={`px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                                      isNew ? "bg-sky-50/50 dark:bg-sky-900/20" : ""
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm text-default-800 dark:text-gray-100 flex items-center gap-2">
                                        {emp.name}
                                        {isNew && (
                                          <span className="text-xs px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded">
                                            New
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-default-500 dark:text-gray-400">
                                        {emp.id} - {emp.job.join(", ")}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleDefault(emp.id)}
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
                                        onClick={() => handleRemoveEmployee(emp.id)}
                                        disabled={isSaving}
                                        className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                                        title="Remove employee"
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

                      {/* Right Panel - Available Employees */}
                      <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                        <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-default-700 dark:text-gray-200">
                              Add Employee
                            </div>
                            <span className="text-xs text-default-500 dark:text-gray-400">
                              {unassignedEmployees.length} available
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
                          {unassignedEmployees.length === 0 ? (
                            <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                              <IconCheck
                                size={32}
                                className="mx-auto mb-2 text-emerald-400"
                              />
                              {availableSearch ? "No employees found" : "All employees assigned"}
                            </div>
                          ) : (
                            <ul className="divide-y divide-default-100 dark:divide-gray-600">
                              {unassignedEmployees.map((emp) => (
                                <li
                                  key={emp.id}
                                  className="px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm text-default-800 dark:text-gray-100">
                                      {emp.name}
                                    </div>
                                    <div className="text-xs text-default-500 dark:text-gray-400">
                                      {emp.id} - {emp.job.join(", ")}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddEmployee(emp.id)}
                                    disabled={isSaving}
                                    className="p-1.5 text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded disabled:opacity-50"
                                    title="Add employee"
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
                              Assigned: {selectedEmployees.size}
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
                  </>
                ) : (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-default-500 dark:text-gray-400">
                      No pay code selected
                    </p>
                  </div>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AssociatePayCodesWithEmployeesModal;
