// src/components/Catalogue/LocationModal.tsx
import React, { useState, useEffect, useMemo, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Tab,
  TabGroup,
  TabList,
  TabPanels,
  TabPanel,
} from "@headlessui/react";
import {
  IconX,
  IconPlus,
  IconTrash,
  IconSearch,
  IconBriefcase,
  IconUsers,
  IconCheck,
  IconUserMinus,
} from "@tabler/icons-react";
import { Location } from "../../utils/catalogue/useLocationMappingsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { api } from "../../routes/utils/api";
import Button from "../Button";

interface JobMapping {
  job_id: string;
  job_name: string;
}

interface EmployeeMapping {
  employee_id: string;
  employee_name: string;
}

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (location: Location) => Promise<void>;
  onComplete?: () => void;
  initialData: Location | null;
  existingLocations: Location[];
  initialJobMappings?: JobMapping[];
  initialEmployeeMappings?: EmployeeMapping[];
}

const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onComplete,
  initialData,
  existingLocations,
  initialJobMappings = [],
  initialEmployeeMappings = [],
}) => {
  const [formData, setFormData] = useState<Location>({ id: "", name: "" });
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [originalJobs, setOriginalJobs] = useState<Set<string>>(new Set());
  const [jobSearch, setJobSearch] = useState("");
  const [availableJobSearch, setAvailableJobSearch] = useState("");

  // Employee mapping state
  const [allEmployees, setAllEmployees] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(
    new Set()
  );
  const [originalEmployees, setOriginalEmployees] = useState<Set<string>>(
    new Set()
  );
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [availableEmployeeSearch, setAvailableEmployeeSearch] = useState("");

  // Exclusions state
  interface Exclusion {
    id: number;
    employee_id: string;
    employee_name: string;
    job_id: string;
    job_name: string;
    reason: string | null;
    created_at: string;
  }
  interface ExclusionCandidate {
    employee_id: string;
    employee_name: string;
    job_id: string;
    job_name: string;
    is_excluded: boolean;
  }
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [exclusionCandidates, setExclusionCandidates] = useState<
    ExclusionCandidate[]
  >([]);
  const [exclusionSearch, setExclusionSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [isAddingExclusion, setIsAddingExclusion] = useState(false);

  const { jobs } = useJobsCache();
  const { staffs } = useStaffsCache();

  const isEditing = !!initialData;

  // Convert staffs to the format needed for the modal
  useEffect(() => {
    if (isOpen && staffs.length > 0) {
      setAllEmployees(
        staffs.map((s) => ({
          id: s.id,
          name: s.name,
        }))
      );
    }
  }, [isOpen, staffs]);

  // Fetch exclusions when editing a location
  const fetchExclusions = async () => {
    if (!initialData) {
      setExclusions([]);
      setExclusionCandidates([]);
      return;
    }

    try {
      const [exclusionsRes, candidatesRes] = await Promise.all([
        api.get(`/api/locations/${initialData.id}/exclusions`),
        api.get(`/api/locations/${initialData.id}/exclusion-candidates`),
      ]);
      setExclusions(exclusionsRes);
      setExclusionCandidates(candidatesRes);
    } catch (err) {
      console.error("Error fetching exclusions:", err);
    }
  };

  useEffect(() => {
    if (isOpen && initialData) {
      fetchExclusions();
    }
  }, [isOpen, initialData]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          id: initialData.id,
          name: initialData.name,
          originalId: initialData.id,
        });
        // Use the job mappings passed from parent
        const jobIds = initialJobMappings.map(j => j.job_id);
        const mappedJobs = new Set<string>(jobIds);
        setSelectedJobs(mappedJobs);
        setOriginalJobs(new Set<string>(mappedJobs));
        // Use the employee mappings passed from parent
        const employeeIds = initialEmployeeMappings.map(e => e.employee_id);
        const mappedEmployees = new Set<string>(employeeIds);
        setSelectedEmployees(mappedEmployees);
        setOriginalEmployees(new Set<string>(mappedEmployees));
      } else {
        setFormData({ id: "", name: "" });
        setSelectedJobs(new Set());
        setOriginalJobs(new Set());
        setSelectedEmployees(new Set());
        setOriginalEmployees(new Set());
      }
      setError("");
      setJobSearch("");
      setAvailableJobSearch("");
      setEmployeeSearch("");
      setAvailableEmployeeSearch("");
    }
  }, [isOpen, initialData, initialJobMappings, initialEmployeeMappings]);

  // Mapped jobs (sorted alphabetically)
  const mappedJobs = useMemo(() => {
    const mapped = jobs.filter((job) => selectedJobs.has(job.id));
    if (!jobSearch) return mapped.sort((a, b) => a.name.localeCompare(b.name));
    const search = jobSearch.toLowerCase();
    return mapped
      .filter(
        (job) =>
          job.id.toLowerCase().includes(search) ||
          job.name.toLowerCase().includes(search)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs, selectedJobs, jobSearch]);

  // Available jobs (not mapped, sorted alphabetically)
  const availableJobs = useMemo(() => {
    const available = jobs.filter((job) => !selectedJobs.has(job.id));
    if (!availableJobSearch)
      return available.sort((a, b) => a.name.localeCompare(b.name));
    const search = availableJobSearch.toLowerCase();
    return available
      .filter(
        (job) =>
          job.id.toLowerCase().includes(search) ||
          job.name.toLowerCase().includes(search)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs, selectedJobs, availableJobSearch]);

  // Mapped employees (sorted alphabetically)
  const mappedEmployees = useMemo(() => {
    const mapped = allEmployees.filter((emp) => selectedEmployees.has(emp.id));
    if (!employeeSearch)
      return mapped.sort((a, b) => a.name.localeCompare(b.name));
    const search = employeeSearch.toLowerCase();
    return mapped
      .filter(
        (emp) =>
          emp.id.toLowerCase().includes(search) ||
          emp.name.toLowerCase().includes(search)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees, selectedEmployees, employeeSearch]);

  // Available employees (not mapped, sorted alphabetically)
  const availableEmployees = useMemo(() => {
    const available = allEmployees.filter(
      (emp) => !selectedEmployees.has(emp.id)
    );
    if (!availableEmployeeSearch)
      return available.sort((a, b) => a.name.localeCompare(b.name));
    const search = availableEmployeeSearch.toLowerCase();
    return available
      .filter(
        (emp) =>
          emp.id.toLowerCase().includes(search) ||
          emp.name.toLowerCase().includes(search)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees, selectedEmployees, availableEmployeeSearch]);

  // Filtered exclusions (by search)
  const filteredExclusions = useMemo(() => {
    if (!exclusionSearch)
      return exclusions.sort((a, b) =>
        a.employee_name.localeCompare(b.employee_name)
      );
    const search = exclusionSearch.toLowerCase();
    return exclusions
      .filter(
        (ex) =>
          ex.employee_name.toLowerCase().includes(search) ||
          ex.job_name.toLowerCase().includes(search)
      )
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  }, [exclusions, exclusionSearch]);

  // Available exclusion candidates (employees with jobs mapped to this location, not already excluded)
  const availableCandidates = useMemo(() => {
    const candidates = exclusionCandidates.filter((c) => !c.is_excluded);
    if (!candidateSearch)
      return candidates.sort((a, b) =>
        a.employee_name.localeCompare(b.employee_name)
      );
    const search = candidateSearch.toLowerCase();
    return candidates
      .filter(
        (c) =>
          c.employee_name.toLowerCase().includes(search) ||
          c.job_name.toLowerCase().includes(search)
      )
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  }, [exclusionCandidates, candidateSearch]);

  // Check for changes
  const hasChanges = useMemo(() => {
    if (selectedJobs.size !== originalJobs.size) return true;
    for (const id of selectedJobs) {
      if (!originalJobs.has(id)) return true;
    }
    if (selectedEmployees.size !== originalEmployees.size) return true;
    for (const id of selectedEmployees) {
      if (!originalEmployees.has(id)) return true;
    }
    return false;
  }, [selectedJobs, originalJobs, selectedEmployees, originalEmployees]);

  // Changes summary
  const changesSummary = useMemo(() => {
    const jobsToAdd = Array.from(selectedJobs).filter(
      (id) => !originalJobs.has(id)
    ).length;
    const jobsToRemove = Array.from(originalJobs).filter(
      (id) => !selectedJobs.has(id)
    ).length;
    const employeesToAdd = Array.from(selectedEmployees).filter(
      (id) => !originalEmployees.has(id)
    ).length;
    const employeesToRemove = Array.from(originalEmployees).filter(
      (id) => !selectedEmployees.has(id)
    ).length;
    return {
      toAdd: jobsToAdd + employeesToAdd,
      toRemove: jobsToRemove + employeesToRemove,
    };
  }, [selectedJobs, originalJobs, selectedEmployees, originalEmployees]);

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

  const handleAddEmployee = (empId: string) => {
    setSelectedEmployees((prev) => new Set([...prev, empId]));
  };

  const handleRemoveEmployee = (empId: string) => {
    setSelectedEmployees((prev) => {
      const newSet = new Set(prev);
      newSet.delete(empId);
      return newSet;
    });
  };

  const handleAddExclusion = async (employeeId: string, jobId: string) => {
    if (!initialData) return;
    setIsAddingExclusion(true);
    try {
      await api.post(`/api/locations/${initialData.id}/exclusions`, {
        employee_id: employeeId,
        job_id: jobId,
      });
      await fetchExclusions();
    } catch (err: any) {
      console.error("Error adding exclusion:", err);
      setError(err.message || "Failed to add exclusion");
    } finally {
      setIsAddingExclusion(false);
    }
  };

  const handleRemoveExclusion = async (exclusionId: number) => {
    if (!initialData) return;
    try {
      await api.delete(
        `/api/locations/${initialData.id}/exclusions/${exclusionId}`
      );
      await fetchExclusions();
    } catch (err: any) {
      console.error("Error removing exclusion:", err);
      setError(err.message || "Failed to remove exclusion");
    }
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

      // Save employee mappings
      const employeesToAdd = Array.from(selectedEmployees).filter(
        (id) => !originalEmployees.has(id)
      );
      const employeesToRemove = Array.from(originalEmployees).filter(
        (id) => !selectedEmployees.has(id)
      );

      if (employeesToAdd.length > 0 || employeesToRemove.length > 0) {
        await api.put("/api/staffs/batch-location-update", {
          locationCode: locationId,
          addEmployees: employeesToAdd,
          removeEmployees: employeesToRemove,
        });
      }

      // Don't refresh here - let onComplete handle all refreshes after modal closes
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
    setAvailableJobSearch("");
    setSelectedEmployees(new Set());
    setOriginalEmployees(new Set());
    setEmployeeSearch("");
    setAvailableEmployeeSearch("");
    setExclusions([]);
    setExclusionCandidates([]);
    setExclusionSearch("");
    setCandidateSearch("");
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
                          setFormData((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder="e.g., New Department"
                        className="w-full px-3 py-2 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  {/* Tabs for Jobs and Employees */}
                  <TabGroup>
                    <TabList className="flex space-x-1 rounded-lg bg-default-100 dark:bg-gray-700 p-1 mb-4">
                      <Tab
                        className={({ selected }) =>
                          `flex-1 rounded-md py-2 text-sm font-medium leading-5 transition-colors flex items-center justify-center gap-2 ${
                            selected
                              ? "bg-white dark:bg-gray-600 text-sky-700 dark:text-sky-400 shadow"
                              : "text-default-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-600/50"
                          }`
                        }
                      >
                        <IconBriefcase size={16} />
                        Jobs ({selectedJobs.size})
                      </Tab>
                      <Tab
                        className={({ selected }) =>
                          `flex-1 rounded-md py-2 text-sm font-medium leading-5 transition-colors flex items-center justify-center gap-2 ${
                            selected
                              ? "bg-white dark:bg-gray-600 text-emerald-700 dark:text-emerald-400 shadow"
                              : "text-default-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-600/50"
                          }`
                        }
                      >
                        <IconUsers size={16} />
                        Employees ({selectedEmployees.size})
                      </Tab>
                      {isEditing && (
                        <Tab
                          className={({ selected }) =>
                            `px-3 rounded-md py-2 text-sm font-medium leading-5 transition-colors flex items-center justify-center gap-1 ${
                              selected
                                ? "bg-white dark:bg-gray-600 text-amber-700 dark:text-amber-400 shadow"
                                : "text-default-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-600/50"
                            }`
                          }
                          title="Exclusions"
                        >
                          <IconUserMinus size={18} />
                          {exclusions.length > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center text-xs bg-amber-500 text-white rounded-full">
                              {exclusions.length}
                            </span>
                          )}
                        </Tab>
                      )}
                    </TabList>

                    <TabPanels>
                      {/* Jobs Tab */}
                      <TabPanel>
                        <div className="grid grid-cols-2 gap-4">
                          {/* Left Panel - Mapped Jobs */}
                          <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                            <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                              <div className="flex items-center gap-2 text-sm font-medium text-default-700 dark:text-gray-200">
                                <IconBriefcase size={16} />
                                Mapped Jobs ({selectedJobs.size})
                              </div>
                              <div className="relative mt-2">
                                <IconSearch
                                  size={16}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                                />
                                <input
                                  type="text"
                                  placeholder="Search mapped jobs..."
                                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                                  value={jobSearch}
                                  onChange={(e) => setJobSearch(e.target.value)}
                                  disabled={isSaving}
                                />
                              </div>
                            </div>

                            <div className="max-h-[280px] overflow-y-auto">
                              {mappedJobs.length === 0 ? (
                                <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                                  <IconBriefcase
                                    size={32}
                                    className="mx-auto mb-2 text-default-300 dark:text-gray-500"
                                  />
                                  {jobSearch
                                    ? "No jobs found"
                                    : "No jobs mapped yet"}
                                </div>
                              ) : (
                                <ul className="divide-y divide-default-100 dark:divide-gray-600">
                                  {mappedJobs.map((job) => {
                                    const isNew = !originalJobs.has(job.id);
                                    return (
                                      <li
                                        key={job.id}
                                        className={`px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                                          isNew
                                            ? "bg-sky-50/50 dark:bg-sky-900/20"
                                            : ""
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
                                  {availableJobs.length} available
                                </span>
                              </div>
                              <div className="relative mt-2">
                                <IconSearch
                                  size={16}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                                />
                                <input
                                  type="text"
                                  placeholder="Search available jobs..."
                                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                                  value={availableJobSearch}
                                  onChange={(e) =>
                                    setAvailableJobSearch(e.target.value)
                                  }
                                  disabled={isSaving}
                                />
                              </div>
                            </div>

                            <div className="max-h-[280px] overflow-y-auto">
                              {availableJobs.length === 0 ? (
                                <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                                  <IconCheck
                                    size={32}
                                    className="mx-auto mb-2 text-emerald-400"
                                  />
                                  {availableJobSearch
                                    ? "No jobs found"
                                    : "All jobs already mapped"}
                                </div>
                              ) : (
                                <ul className="divide-y divide-default-100 dark:divide-gray-600">
                                  {availableJobs.map((job) => (
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
                      </TabPanel>

                      {/* Employees Tab */}
                      <TabPanel>
                        <div className="grid grid-cols-2 gap-4">
                          {/* Left Panel - Mapped Employees */}
                          <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                            <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                              <div className="flex items-center gap-2 text-sm font-medium text-default-700 dark:text-gray-200">
                                <IconUsers size={16} />
                                Mapped Employees ({selectedEmployees.size})
                              </div>
                              <div className="relative mt-2">
                                <IconSearch
                                  size={16}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                                />
                                <input
                                  type="text"
                                  placeholder="Search mapped employees..."
                                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                                  value={employeeSearch}
                                  onChange={(e) =>
                                    setEmployeeSearch(e.target.value)
                                  }
                                  disabled={isSaving}
                                />
                              </div>
                            </div>

                            <div className="max-h-[280px] overflow-y-auto">
                              {mappedEmployees.length === 0 ? (
                                <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                                  <IconUsers
                                    size={32}
                                    className="mx-auto mb-2 text-default-300 dark:text-gray-500"
                                  />
                                  {employeeSearch
                                    ? "No employees found"
                                    : "No employees mapped yet"}
                                </div>
                              ) : (
                                <ul className="divide-y divide-default-100 dark:divide-gray-600">
                                  {mappedEmployees.map((emp) => {
                                    const isNew = !originalEmployees.has(emp.id);
                                    return (
                                      <li
                                        key={emp.id}
                                        className={`px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                                          isNew
                                            ? "bg-emerald-50/50 dark:bg-emerald-900/20"
                                            : ""
                                        }`}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm text-default-800 dark:text-gray-100 flex items-center gap-2">
                                            {emp.name}
                                            {isNew && (
                                              <span className="text-xs px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded">
                                                New
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-xs text-default-500 dark:text-gray-400">
                                            {emp.id}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveEmployee(emp.id)
                                          }
                                          disabled={isSaving}
                                          className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
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

                          {/* Right Panel - Available Employees */}
                          <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                            <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium text-default-700 dark:text-gray-200">
                                  Add Employee
                                </div>
                                <span className="text-xs text-default-500 dark:text-gray-400">
                                  {availableEmployees.length} available
                                </span>
                              </div>
                              <div className="relative mt-2">
                                <IconSearch
                                  size={16}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                                />
                                <input
                                  type="text"
                                  placeholder="Search available employees..."
                                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                                  value={availableEmployeeSearch}
                                  onChange={(e) =>
                                    setAvailableEmployeeSearch(e.target.value)
                                  }
                                  disabled={isSaving}
                                />
                              </div>
                            </div>

                            <div className="max-h-[280px] overflow-y-auto">
                              {availableEmployees.length === 0 ? (
                                <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                                  <IconCheck
                                    size={32}
                                    className="mx-auto mb-2 text-emerald-400"
                                  />
                                  {availableEmployeeSearch
                                    ? "No employees found"
                                    : "All employees already mapped"}
                                </div>
                              ) : (
                                <ul className="divide-y divide-default-100 dark:divide-gray-600">
                                  {availableEmployees.map((emp) => (
                                    <li
                                      key={emp.id}
                                      className="px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-default-800 dark:text-gray-100">
                                          {emp.name}
                                        </div>
                                        <div className="text-xs text-default-500 dark:text-gray-400">
                                          {emp.id}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleAddEmployee(emp.id)}
                                        disabled={isSaving}
                                        className="p-1.5 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded disabled:opacity-50"
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
                      </TabPanel>

                      {/* Exclusions Tab */}
                      {isEditing && (
                        <TabPanel>
                          <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <p className="text-sm text-amber-700 dark:text-amber-300">
                              Exclusions prevent employees from appearing in
                              this location's salary report for specific jobs.
                              This is useful when an employee has a job mapped
                              to multiple locations but should only appear in
                              one.
                            </p>
                          </div>
                          <div className="grid grid-cols-5 gap-4">
                            {/* Left Panel - Current Exclusions */}
                            <div className="col-span-3 border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                              <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                                <div className="flex items-center gap-2 text-sm font-medium text-default-700 dark:text-gray-200">
                                  <IconUserMinus size={16} />
                                  Current Exclusions ({exclusions.length})
                                </div>
                                <div className="relative mt-2">
                                  <IconSearch
                                    size={16}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Search exclusions..."
                                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                                    value={exclusionSearch}
                                    onChange={(e) =>
                                      setExclusionSearch(e.target.value)
                                    }
                                    disabled={isSaving}
                                  />
                                </div>
                              </div>

                              <div className="max-h-[280px] overflow-y-auto">
                                {filteredExclusions.length === 0 ? (
                                  <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                                    <IconUserMinus
                                      size={32}
                                      className="mx-auto mb-2 text-default-300 dark:text-gray-500"
                                    />
                                    {exclusionSearch
                                      ? "No exclusions found"
                                      : "No exclusions set"}
                                  </div>
                                ) : (
                                  <ul className="divide-y divide-default-100 dark:divide-gray-600">
                                    {filteredExclusions.map((ex) => (
                                      <li
                                        key={ex.id}
                                        className="px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm text-default-800 dark:text-gray-100">
                                            {ex.employee_name}
                                          </div>
                                          <div className="text-xs text-amber-600 dark:text-amber-400">
                                            Excluded from: {ex.job_name}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveExclusion(ex.id)
                                          }
                                          disabled={isSaving}
                                          className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                                          title="Remove exclusion"
                                        >
                                          <IconTrash size={16} />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>

                            {/* Right Panel - Add Exclusion */}
                            <div className="col-span-2 border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                              <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-medium text-default-700 dark:text-gray-200">
                                    Add Exclusion
                                  </div>
                                  <span className="text-xs text-default-500 dark:text-gray-400">
                                    {availableCandidates.length} available
                                  </span>
                                </div>
                                <div className="relative mt-2">
                                  <IconSearch
                                    size={16}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Search employees/jobs..."
                                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                                    value={candidateSearch}
                                    onChange={(e) =>
                                      setCandidateSearch(e.target.value)
                                    }
                                    disabled={isSaving || isAddingExclusion}
                                  />
                                </div>
                              </div>

                              <div className="max-h-[280px] overflow-y-auto">
                                {availableCandidates.length === 0 ? (
                                  <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                                    <IconCheck
                                      size={32}
                                      className="mx-auto mb-2 text-emerald-400"
                                    />
                                    {candidateSearch
                                      ? "No matches found"
                                      : "No employees to exclude"}
                                    <p className="text-xs mt-1 text-default-400 dark:text-gray-500">
                                      Only employees with jobs mapped to this
                                      location can be excluded
                                    </p>
                                  </div>
                                ) : (
                                  <ul className="divide-y divide-default-100 dark:divide-gray-600">
                                    {availableCandidates.map((c, idx) => (
                                      <li
                                        key={`${c.employee_id}-${c.job_id}-${idx}`}
                                        className="px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm text-default-800 dark:text-gray-100">
                                            {c.employee_name}
                                          </div>
                                          <div className="text-xs text-default-500 dark:text-gray-400">
                                            Job: {c.job_name}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleAddExclusion(
                                              c.employee_id,
                                              c.job_id
                                            )
                                          }
                                          disabled={
                                            isSaving || isAddingExclusion
                                          }
                                          className="p-1.5 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded disabled:opacity-50"
                                          title="Add exclusion"
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
                        </TabPanel>
                      )}
                    </TabPanels>
                  </TabGroup>

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
                    <div className="text-sm text-default-500 dark:text-gray-400">
                      {hasChanges ? (
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                            Jobs: {selectedJobs.size}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Employees: {selectedEmployees.size}
                          </span>
                          <span className="text-amber-600 dark:text-amber-400">
                            ({changesSummary.toAdd > 0 && `+${changesSummary.toAdd}`}
                            {changesSummary.toAdd > 0 &&
                              changesSummary.toRemove > 0 &&
                              ", "}
                            {changesSummary.toRemove > 0 &&
                              `-${changesSummary.toRemove}`}{" "}
                            changes)
                          </span>
                        </div>
                      ) : isEditing ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <IconCheck size={14} /> No changes
                        </span>
                      ) : (
                        <span>Map jobs and employees to this location</span>
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
