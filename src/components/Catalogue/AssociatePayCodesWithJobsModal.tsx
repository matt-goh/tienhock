// src/components/Catalogue/AssociatePayCodesWithJobsModal.tsx
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
  IconBriefcase,
  IconCheck,
} from "@tabler/icons-react";
import Button from "../Button";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { PayCode, Job } from "../../types/types";

interface AssociatePayCodesWithJobsModalProps {
  isOpen: boolean;
  onClose: () => void;
  payCode: PayCode | null;
  availableJobs: Job[];
  currentJobIds: string[];
  onAssociationComplete: () => Promise<void>;
}

const AssociatePayCodesWithJobsModal: React.FC<
  AssociatePayCodesWithJobsModalProps
> = ({
  isOpen,
  onClose,
  payCode,
  availableJobs,
  currentJobIds,
  onAssociationComplete,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Job selection state
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [originalJobs, setOriginalJobs] = useState<Set<string>>(new Set());

  // Search state
  const [assignedSearch, setAssignedSearch] = useState("");
  const [availableSearch, setAvailableSearch] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && currentJobIds) {
      const currentIds = new Set(currentJobIds);
      setSelectedJobs(currentIds);
      setOriginalJobs(new Set(currentIds));
      setError("");
      setAssignedSearch("");
      setAvailableSearch("");
    }
  }, [isOpen, currentJobIds]);

  // Assigned jobs (sorted alphabetically)
  const assignedJobs = useMemo(() => {
    const assigned = availableJobs.filter((job) => selectedJobs.has(job.id));
    if (!assignedSearch) return assigned.sort((a, b) => a.name.localeCompare(b.name));
    const search = assignedSearch.toLowerCase();
    return assigned
      .filter(
        (job) =>
          job.id.toLowerCase().includes(search) ||
          job.name.toLowerCase().includes(search)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [availableJobs, selectedJobs, assignedSearch]);

  // Available jobs (not assigned, sorted alphabetically)
  const unassignedJobs = useMemo(() => {
    const available = availableJobs.filter((job) => !selectedJobs.has(job.id));
    if (!availableSearch) return available.sort((a, b) => a.name.localeCompare(b.name));
    const search = availableSearch.toLowerCase();
    return available
      .filter(
        (job) =>
          job.id.toLowerCase().includes(search) ||
          job.name.toLowerCase().includes(search)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [availableJobs, selectedJobs, availableSearch]);

  // Check for changes
  const hasChanges = useMemo(() => {
    if (selectedJobs.size !== originalJobs.size) return true;
    for (const id of selectedJobs) {
      if (!originalJobs.has(id)) return true;
    }
    return false;
  }, [selectedJobs, originalJobs]);

  // Changes summary
  const changesSummary = useMemo(() => {
    const toAdd = Array.from(selectedJobs).filter((id) => !originalJobs.has(id)).length;
    const toRemove = Array.from(originalJobs).filter((id) => !selectedJobs.has(id)).length;
    return { toAdd, toRemove };
  }, [selectedJobs, originalJobs]);

  const handleAddJob = (jobId: string) => {
    setSelectedJobs((prev) => new Set([...prev, jobId]));
  };

  const handleRemoveJob = (jobId: string) => {
    setSelectedJobs((prev) => {
      const newSet = new Set(prev);
      newSet.delete(jobId);
      return newSet;
    });
  };

  const handleSubmit = async () => {
    if (!payCode) return;
    setError("");
    setIsSaving(true);

    try {
      // Find which jobs to add and which to remove
      const jobsToAdd = Array.from(selectedJobs).filter(
        (id) => !originalJobs.has(id)
      );
      const jobsToRemove = Array.from(originalJobs).filter(
        (id) => !selectedJobs.has(id)
      );

      // Use batch endpoints instead of individual calls
      const promises = [];

      // Handle additions with batch endpoint
      if (jobsToAdd.length > 0) {
        const associations = jobsToAdd.map((jobId) => ({
          job_id: jobId,
          pay_code_id: payCode.id,
          is_default: false,
        }));

        promises.push(api.post("/api/job-pay-codes/batch", { associations }));
      }

      // Handle removals with batch endpoint
      if (jobsToRemove.length > 0) {
        const items = jobsToRemove.map((jobId) => ({
          job_id: jobId,
          pay_code_id: payCode.id,
        }));

        promises.push(api.post("/api/job-pay-codes/batch-delete", { items }));
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
        `Pay code "${payCode.description}" updated - Added: ${jobsToAdd.length}, Removed: ${jobsToRemove.length} job(s)`
      );

      handleClose();
    } catch (err: any) {
      console.error("Error updating job associations:", err);
      setError(err.message || "Failed to update job associations");
      toast.error("Failed to update job associations");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    setSelectedJobs(new Set());
    setOriginalJobs(new Set());
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
                    Manage Jobs for "{payCode?.description || ""}"
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
                      {/* Left Panel - Assigned Jobs */}
                      <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                        <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                          <div className="flex items-center gap-2 text-sm font-medium text-default-700 dark:text-gray-200">
                            <IconBriefcase size={16} />
                            Assigned Jobs ({selectedJobs.size})
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
                          {assignedJobs.length === 0 ? (
                            <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                              <IconBriefcase
                                size={32}
                                className="mx-auto mb-2 text-default-300 dark:text-gray-500"
                              />
                              {assignedSearch ? "No jobs found" : "No jobs assigned yet"}
                            </div>
                          ) : (
                            <ul className="divide-y divide-default-100 dark:divide-gray-600">
                              {assignedJobs.map((job) => {
                                const isNew = !originalJobs.has(job.id);
                                return (
                                  <li
                                    key={job.id}
                                    className={`px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                                      isNew ? "bg-sky-50/50 dark:bg-sky-900/20" : ""
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm text-default-800 dark:text-gray-100 flex items-center gap-2">
                                        {job.name}
                                        {isNew && (
                                          <span className="text-xs px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded">
                                            New
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-default-500 dark:text-gray-400">
                                        {job.id}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveJob(job.id)}
                                      disabled={isSaving}
                                      className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                                      title="Remove job"
                                    >
                                      <IconTrash size={16} />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </div>

                      {/* Right Panel - Available Jobs */}
                      <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                        <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-default-700 dark:text-gray-200">
                              Add Job
                            </div>
                            <span className="text-xs text-default-500 dark:text-gray-400">
                              {unassignedJobs.length} available
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
                          {unassignedJobs.length === 0 ? (
                            <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                              <IconCheck
                                size={32}
                                className="mx-auto mb-2 text-emerald-400"
                              />
                              {availableSearch ? "No jobs found" : "All jobs assigned"}
                            </div>
                          ) : (
                            <ul className="divide-y divide-default-100 dark:divide-gray-600">
                              {unassignedJobs.map((job) => (
                                <li
                                  key={job.id}
                                  className="px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm text-default-800 dark:text-gray-100">
                                      {job.name}
                                    </div>
                                    <div className="text-xs text-default-500 dark:text-gray-400">
                                      {job.id}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddJob(job.id)}
                                    disabled={isSaving}
                                    className="p-1.5 text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded disabled:opacity-50"
                                    title="Add job"
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
                              Assigned: {selectedJobs.size}
                            </span>
                            <span className="text-amber-600 dark:text-amber-400">
                              ({changesSummary.toAdd > 0 && `+${changesSummary.toAdd}`}
                              {changesSummary.toAdd > 0 && changesSummary.toRemove > 0 && ", "}
                              {changesSummary.toRemove > 0 && `-${changesSummary.toRemove}`})
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

export default AssociatePayCodesWithJobsModal;
