// src/components/Catalogue/AssociateWithJobsModal.tsx
import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import Checkbox from "../Checkbox";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../LoadingSpinner";
import { PayCode, Job } from "../../types/types";

interface AssociateWithJobsModalProps {
  isOpen: boolean;
  onClose: () => void;
  payCode: PayCode | null;
  availableJobs: Job[];
  currentJobIds: string[];
  onAssociationComplete: () => Promise<void>;
}

const AssociateWithJobsModal: React.FC<AssociateWithJobsModalProps> = ({
  isOpen,
  onClose,
  payCode,
  availableJobs,
  currentJobIds,
  onAssociationComplete,
}) => {
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize selections when modal opens
  useEffect(() => {
    if (isOpen && currentJobIds) {
      setSelectedJobIds(new Set(currentJobIds));
    }
  }, [isOpen, currentJobIds]);

  // Filter jobs based on search query
  const filteredJobs = searchQuery
    ? availableJobs.filter(
        (job) =>
          job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableJobs;

  const handleToggleJob = (jobId: string) => {
    setSelectedJobIds((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(jobId)) {
        newSelection.delete(jobId);
      } else {
        newSelection.add(jobId);
      }
      return newSelection;
    });
  };

  const handleSave = async () => {
    if (!payCode) return;

    setIsProcessing(true);

    try {
      // Find which jobs to add and which to remove
      const jobsToAdd = Array.from(selectedJobIds).filter(
        (id) => !currentJobIds.includes(id)
      );
      const jobsToRemove = currentJobIds.filter(
        (id) => !selectedJobIds.has(id)
      );

      // Handle additions
      const addPromises = jobsToAdd.map((jobId) =>
        api.post("/api/job-pay-codes", {
          job_id: jobId,
          pay_code_id: payCode.id,
          is_default: false, // Set the appropriate default value
        })
      );

      // Handle removals
      const removePromises = jobsToRemove.map((jobId) =>
        api.delete(`/api/job-pay-codes/${jobId}/${payCode.id}`)
      );

      await Promise.all([...addPromises, ...removePromises]);

      await onAssociationComplete();
      toast.success(
        `Pay code "${payCode.description}" updated for ${
          jobsToAdd.length + jobsToRemove.length
        } job(s)`
      );

      onClose();
    } catch (error) {
      console.error("Error updating job associations:", error);
      toast.error("Failed to update job associations");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => !isProcessing && onClose()}
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
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Associate Pay Code with Jobs
                </DialogTitle>

                {payCode ? (
                  <>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Select jobs to associate with pay code:{" "}
                        <span className="font-medium">
                          {payCode.description}
                        </span>
                      </p>
                    </div>

                    <div className="mt-4">
                      <div className="mb-4">
                        <input
                          type="text"
                          placeholder="Search jobs..."
                          className="w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>

                      <div className="max-h-60 overflow-y-auto border border-default-200 rounded-lg">
                        {isProcessing ? (
                          <div className="flex justify-center items-center py-10">
                            <LoadingSpinner size="sm" hideText />
                          </div>
                        ) : filteredJobs.length === 0 ? (
                          <div className="py-4 px-3 text-center text-sm text-default-500">
                            No jobs found
                          </div>
                        ) : (
                          <ul className="divide-y divide-default-200">
                            {filteredJobs.map((job) => (
                              <li
                                key={job.id}
                                className="px-3 py-2 hover:bg-default-50 cursor-pointer"
                                onClick={() => handleToggleJob(job.id)}
                              >
                                <Checkbox
                                  checked={selectedJobIds.has(job.id)}
                                  onChange={() => {}}
                                  label={
                                    <div>
                                      <div className="font-medium text-default-800">
                                        {job.name}
                                      </div>
                                      <div className="text-xs text-default-500">
                                        {job.id}
                                      </div>
                                    </div>
                                  }
                                  size={20}
                                  checkedColor="text-sky-600"
                                  uncheckedColor="text-default-400"
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isProcessing}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        color="sky"
                        variant="filled"
                        onClick={handleSave}
                        disabled={isProcessing}
                      >
                        {isProcessing ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-default-500">
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

export default AssociateWithJobsModal;
