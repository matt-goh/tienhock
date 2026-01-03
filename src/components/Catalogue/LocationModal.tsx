// src/components/Catalogue/LocationModal.tsx
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
  IconCheck,
  IconPlus,
  IconMinus,
  IconSearch,
  IconBriefcase,
} from "@tabler/icons-react";
import { Location } from "../../utils/catalogue/useLocationsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useJobLocationMappings } from "../../utils/catalogue/useJobLocationMappings";
import { api } from "../../routes/utils/api";
import Button from "../Button";
import Checkbox from "../Checkbox";

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (location: Location) => Promise<void>;
  onComplete?: () => void;
  initialData: Location | null;
  existingLocations: Location[];
}

const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onComplete,
  initialData,
  existingLocations,
}) => {
  const [formData, setFormData] = useState<Location>({ id: "", name: "" });
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [originalJobs, setOriginalJobs] = useState<Set<string>>(new Set());
  const [jobSearch, setJobSearch] = useState("");

  const { jobs } = useJobsCache();
  const { byLocation, refreshData: refreshMappings } = useJobLocationMappings();

  const isEditing = !!initialData;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          id: initialData.id,
          name: initialData.name,
          originalId: initialData.id,
        });
        const mappedJobs = new Set(byLocation[initialData.id] || []);
        setSelectedJobs(mappedJobs);
        setOriginalJobs(new Set(mappedJobs));
      } else {
        setFormData({ id: "", name: "" });
        setSelectedJobs(new Set());
        setOriginalJobs(new Set());
      }
      setError("");
      setJobSearch("");
    }
  }, [isOpen, initialData, byLocation]);

  // Sort jobs: saved first, then alphabetically
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aIsSaved = originalJobs.has(a.id);
      const bIsSaved = originalJobs.has(b.id);
      if (aIsSaved && !bIsSaved) return -1;
      if (!aIsSaved && bIsSaved) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [jobs, originalJobs]);

  // Filter jobs based on search
  const filteredJobs = useMemo(() => {
    if (!jobSearch) return sortedJobs;
    const search = jobSearch.toLowerCase();
    return sortedJobs.filter(
      (job) =>
        job.id.toLowerCase().includes(search) ||
        job.name.toLowerCase().includes(search)
    );
  }, [sortedJobs, jobSearch]);

  // Count saved jobs for separator
  const savedJobsCount = useMemo(() => {
    return filteredJobs.filter((job) => originalJobs.has(job.id)).length;
  }, [filteredJobs, originalJobs]);

  // Get job status
  const getJobStatus = (
    jobId: string
  ): "saved" | "new" | "removing" | "none" => {
    const isSelected = selectedJobs.has(jobId);
    const wasOriginal = originalJobs.has(jobId);
    if (wasOriginal && isSelected) return "saved";
    if (!wasOriginal && isSelected) return "new";
    if (wasOriginal && !isSelected) return "removing";
    return "none";
  };

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
    const toAdd = Array.from(selectedJobs).filter(
      (id) => !originalJobs.has(id)
    ).length;
    const toRemove = Array.from(originalJobs).filter(
      (id) => !selectedJobs.has(id)
    ).length;
    return { toAdd, toRemove };
  }, [selectedJobs, originalJobs]);

  const handleToggleJob = (jobId: string) => {
    setSelectedJobs((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(jobId)) {
        newSelection.delete(jobId);
      } else {
        newSelection.add(jobId);
      }
      return newSelection;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.id.trim()) {
      setError("Location ID is required");
      return;
    }
    if (!formData.name.trim()) {
      setError("Location name is required");
      return;
    }

    // Check for duplicate ID
    const isDuplicate = existingLocations.some(
      (loc) => loc.id === formData.id.trim() && loc.id !== initialData?.id
    );
    if (isDuplicate) {
      setError(`Location ID "${formData.id}" already exists`);
      return;
    }

    const locationId = formData.id.trim();
    setIsSaving(true);

    try {
      // Save location
      await onSave({
        ...formData,
        id: locationId,
        name: formData.name.trim(),
      });

      // Save job mappings
      const jobsToAdd = Array.from(selectedJobs).filter(
        (id) => !originalJobs.has(id)
      );
      const jobsToRemove = Array.from(originalJobs).filter(
        (id) => !selectedJobs.has(id)
      );

      // Remove mappings
      for (const jobId of jobsToRemove) {
        await api.delete(`/api/job-location-mappings/${jobId}`);
      }

      // Add mappings
      if (jobsToAdd.length > 0) {
        await api.post("/api/job-location-mappings/batch", {
          mappings: jobsToAdd.map((jobId) => ({
            job_id: jobId,
            location_code: locationId,
          })),
        });
      }

      await refreshMappings(true);
      onComplete?.();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to save location");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    setFormData({ id: "", name: "" });
    setSelectedJobs(new Set());
    setOriginalJobs(new Set());
    setJobSearch("");
    setError("");
    onClose();
  };

  const statusStyles = {
    saved: "bg-green-50 dark:bg-green-900/20 border-l-2 border-green-400",
    new: "bg-sky-50 dark:bg-sky-900/20 border-l-2 border-sky-400",
    removing:
      "bg-red-50 dark:bg-red-900/20 border-l-2 border-red-300 opacity-60",
    none: "",
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
              <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                  >
                    {isEditing ? "Edit Location" : "Add New Location"}
                  </DialogTitle>
                  <button
                    onClick={handleClose}
                    className="text-default-400 hover:text-default-600 dark:text-gray-400 dark:hover:text-gray-200"
                    disabled={isSaving}
                  >
                    <IconX size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit}>
                  {/* Location Details */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                        Location ID
                      </label>
                      <input
                        type="text"
                        value={formData.id}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, id: e.target.value }))
                        }
                        placeholder="e.g., 25"
                        className="w-full px-3 py-2 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        disabled={isSaving}
                      />
                      <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                        Two-digit code (e.g., 01, 02)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                        Location Name
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="e.g., New Department"
                        className="w-full px-3 py-2 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  {/* Job Mappings Panel */}
                  <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-default-50 dark:bg-gray-800/50 px-3 py-2 border-b border-default-200 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-default-700 dark:text-gray-200">
                          <IconBriefcase size={16} />
                          Mapped Jobs
                        </div>
                        <span className="text-xs text-default-500 dark:text-gray-400">
                          {selectedJobs.size} selected
                        </span>
                      </div>
                      <div className="relative mt-2">
                        <IconSearch
                          size={16}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                        />
                        <input
                          type="text"
                          placeholder="Search jobs..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                          value={jobSearch}
                          onChange={(e) => setJobSearch(e.target.value)}
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="max-h-[280px] overflow-y-auto">
                      {filteredJobs.length === 0 ? (
                        <div className="py-8 text-center text-sm text-default-500 dark:text-gray-400">
                          No jobs found
                        </div>
                      ) : (
                        <ul className="divide-y divide-default-100 dark:divide-gray-700/50">
                          {/* Mapped jobs header */}
                          {savedJobsCount > 0 && (
                            <li className="px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-xs text-green-700 dark:text-green-400 font-medium">
                              Currently Mapped ({savedJobsCount})
                            </li>
                          )}
                          {filteredJobs.map((job, index) => {
                            const status = getJobStatus(job.id);
                            const showSeparator =
                              savedJobsCount > 0 && index === savedJobsCount;

                            return (
                              <Fragment key={job.id}>
                                {showSeparator && (
                                  <li className="px-3 py-1.5 bg-default-100 dark:bg-gray-700/50 text-xs text-default-500 dark:text-gray-400 font-medium border-t border-default-200 dark:border-gray-600">
                                    Available Jobs (
                                    {filteredJobs.length - savedJobsCount})
                                  </li>
                                )}
                                <li
                                  className={`px-3 py-2 hover:bg-default-100 dark:hover:bg-gray-700/30 cursor-pointer transition-colors select-none ${statusStyles[status]}`}
                                  onClick={() => handleToggleJob(job.id)}
                                >
                                  <div className="flex items-center gap-3">
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <Checkbox
                                        checked={selectedJobs.has(job.id)}
                                        onChange={() => handleToggleJob(job.id)}
                                        size={18}
                                        checkedColor="text-sky-600 dark:text-sky-400"
                                        uncheckedColor="text-default-400 dark:text-gray-500"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div
                                        className={`font-medium text-sm ${
                                          status === "removing"
                                            ? "line-through text-default-400 dark:text-gray-500"
                                            : "text-default-800 dark:text-gray-200"
                                        }`}
                                      >
                                        {job.name}
                                      </div>
                                      <div className="text-xs text-default-500 dark:text-gray-400">
                                        ID: {job.id}
                                      </div>
                                    </div>
                                    {status !== "none" && (
                                      <span
                                        className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full whitespace-nowrap ${
                                          status === "saved"
                                            ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                                            : status === "new"
                                            ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400"
                                            : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                                        }`}
                                      >
                                        {status === "saved" && (
                                          <>
                                            <IconCheck size={12} /> Mapped
                                          </>
                                        )}
                                        {status === "new" && (
                                          <>
                                            <IconPlus size={12} /> New
                                          </>
                                        )}
                                        {status === "removing" && (
                                          <>
                                            <IconMinus size={12} /> Remove
                                          </>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </li>
                              </Fragment>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                      <p className="text-sm text-rose-600 dark:text-rose-400">
                        {error}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-6 flex justify-between items-center">
                    <div className="text-sm">
                      {hasChanges ? (
                        <div className="flex items-center gap-3">
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Pending:
                          </span>
                          {changesSummary.toAdd > 0 && (
                            <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                              <IconPlus size={14} /> {changesSummary.toAdd} to
                              add
                            </span>
                          )}
                          {changesSummary.toRemove > 0 && (
                            <span className="flex items-center gap-1 text-red-500 dark:text-red-400">
                              <IconMinus size={14} /> {changesSummary.toRemove}{" "}
                              to remove
                            </span>
                          )}
                        </div>
                      ) : isEditing ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <IconCheck size={14} /> No changes
                        </span>
                      ) : (
                        <span className="text-default-400 dark:text-gray-500">
                          Select jobs to map to this location
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
                        type="submit"
                        color="sky"
                        variant="filled"
                        disabled={isSaving}
                      >
                        {isSaving
                          ? "Saving..."
                          : isEditing
                          ? "Save Changes"
                          : "Create Location"}
                      </Button>
                    </div>
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

export default LocationModal;
