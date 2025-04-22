// src/pages/Catalogue/JobPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  Field,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  IconCheck,
  IconChevronDown,
  IconTrash,
  IconPlus,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import toast from "react-hot-toast";

import { api } from "../../routes/utils/api";
import { Job, JobDetail, PayCode } from "../../types/types";
import LoadingSpinner from "../../components/LoadingSpinner";
import NewJobModal from "../../components/Catalogue/NewJobModal";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import Button from "../../components/Button";
import { useJobsCache } from "../../hooks/useJobsCache";
import { useJobPayCodeMappings } from "../../hooks/useJobPayCodeMappings";

type JobSelection = Job | null;

const JobPage: React.FC = () => {
  // --- State ---
  const {
    jobs,
    loading: loadingJobs,
    error: jobsError,
    refreshJobs,
  } = useJobsCache();
  const [selectedJob, setSelectedJob] = useState<JobSelection>(null);
  const [allJobDetails, setAllJobDetails] = useState<JobDetail[]>([]);
  const [jobType, setJobType] = useState<string>("All");
  const [query, setQuery] = useState(""); // For job combobox filtering
  const {
    mappings: jobPayCodeMap,
    payCodes: availablePayCodes,
    loading: loadingPayCodeMappings,
    refreshData: refreshPayCodeMappings,
  } = useJobPayCodeMappings();
  const [jobPayCodes, setJobPayCodes] = useState<PayCode[]>([]);
  const [loadingPayCodes, setLoadingPayCodes] = useState(false);
  const [showAddPayCodeModal, setShowAddPayCodeModal] = useState(false);
  const [selectedPayCode, setSelectedPayCode] = useState<PayCode | null>(null);

  // --- Modal/Dialog States ---
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [showDeleteJobDialog, setShowDeleteJobDialog] = useState(false);
  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(50); // 50 items per page as requested

  // --- Data Fetching ---
  const fetchJobPayCodes = useCallback(
    async (jobId: string) => {
      if (!jobId) {
        setJobPayCodes([]);
        return;
      }
      setLoadingPayCodes(true);
      try {
        // Check if data exists in cache
        if (
          jobPayCodeMap &&
          jobPayCodeMap[jobId] &&
          availablePayCodes.length > 0
        ) {
          const payCodeIds = jobPayCodeMap[jobId];
          const matchingPayCodes = availablePayCodes.filter((pc) =>
            payCodeIds.includes(pc.id)
          );

          if (matchingPayCodes.length > 0) {
            setJobPayCodes(matchingPayCodes);
            setLoadingPayCodes(false);
            return;
          }
        }

        // Fallback to API call if not in cache
        const data = await api.get(`/api/job-pay-codes/job/${jobId}`);
        setJobPayCodes(data);
      } catch (error) {
        console.error("Error fetching job pay codes:", error);
        toast.error("Failed to fetch pay codes for this job.");
        setJobPayCodes([]);
      } finally {
        setLoadingPayCodes(false);
      }
    },
    [jobPayCodeMap, availablePayCodes]
  );

  // Update the useEffect that handles job selection
  useEffect(() => {
    if (selectedJob) {
      fetchJobPayCodes(selectedJob.id);
    } else {
      setAllJobDetails([]);
      setJobPayCodes([]);
    }
  }, [selectedJob, fetchJobPayCodes]);

  // Create a function to add a pay code to a job
  const handleAddPayCodeToJob = async (payCodeId: string) => {
    if (!selectedJob) return;

    try {
      await api.post("/api/job-pay-codes", {
        job_id: selectedJob.id,
        pay_code_id: payCodeId,
        is_default: true,
      });

      toast.success("Pay code added to job successfully");
      await refreshPayCodeMappings();
      fetchJobPayCodes(selectedJob.id);
    } catch (error) {
      console.error("Error adding pay code to job:", error);
      toast.error("Failed to add pay code to job");
    }
  };

  // Create a function to remove a pay code from a job
  const handleRemovePayCodeFromJob = async (payCodeId: string) => {
    if (!selectedJob) return;

    try {
      await api.delete(`/api/job-pay-codes/${selectedJob.id}/${payCodeId}`);
      toast.success("Pay code removed from job successfully");
      await refreshPayCodeMappings();
      fetchJobPayCodes(selectedJob.id);
    } catch (error) {
      console.error("Error removing pay code from job:", error);
      toast.error("Failed to remove pay code from job");
    }
  };

  // --- Derived State ---
  const filteredJobs = useMemo(
    () =>
      query === ""
        ? jobs
        : jobs.filter((job) =>
            job.name.toLowerCase().includes(query.toLowerCase())
          ),
    [jobs, query]
  );

  const filteredJobDetails = useMemo(() => {
    if (jobType === "All") {
      return allJobDetails;
    }
    return allJobDetails.filter((detail) => detail.type === jobType);
  }, [jobType, allJobDetails]);

  // Calculate paginated job details
  const paginatedJobDetails = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredJobDetails.slice(startIndex, endIndex);
  }, [filteredJobDetails, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = useMemo(
    () => Math.ceil(filteredJobDetails.length / itemsPerPage),
    [filteredJobDetails, itemsPerPage]
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedJob, jobType]);

  // --- Job Handlers ---
  const handleJobSelection = useCallback(
    (selection: Job | null | undefined) => {
      if (selection === undefined) {
        setShowAddJobModal(true);
      } else {
        setSelectedJob(selection);
        setQuery("");
      }
    },
    []
  );

  const handleAddJobClickInList = () => {
    setShowAddJobModal(true);
  };

  const handleJobAdded = useCallback(
    async (newJobData: Omit<Job, "newId">) => {
      try {
        const jobToSend = {
          ...newJobData,
          section: Array.isArray(newJobData.section)
            ? newJobData.section.join(", ")
            : newJobData.section,
        };
        const response = await api.post("/api/jobs", jobToSend);

        if (response.message && !response.job) {
          throw new Error(response.message);
        }

        toast.success("Job added successfully");
        setShowAddJobModal(false);
        await refreshJobs(); // Use the hook's refresh function

        // Find and select the new job after refresh
        const foundJob = jobs.find((j) => j.id === newJobData.id);
        if (foundJob) {
          setSelectedJob(foundJob);
        }
      } catch (error: any) {
        console.error("Error adding job:", error);
        toast.error(error.message || "Failed to add job. Please try again.");
        throw new Error(
          error.message || "Failed to add job. Please try again."
        );
      }
    },
    [refreshJobs, jobs]
  );

  // --- Delete Handler for the dedicated button ---
  const handleDeleteSelectedJobClick = useCallback(
    async () => {
      if (!selectedJob) {
        toast.error("No job selected to delete.");
        return;
      }
      try {
        // Check if job details exist
        const response = await api.get(
          `/api/jobs/${selectedJob.id}/details/count`
        );
        const { count } = response as { count: number };

        if (count > 0) {
          toast.error(
            `Cannot delete job "${selectedJob.name}". It has ${count} associated detail(s). Please delete them first.`
          );
        } else {
          // No need for jobToDelete state, show dialog for selectedJob
          setShowDeleteJobDialog(true);
        }
      } catch (error) {
        console.error("Error checking job details count:", error);
        toast.error("Could not check for associated job details.");
      }
    },
    [selectedJob] // Depends only on the currently selected job
  );

  const confirmDeleteJob = useCallback(async () => {
    if (!selectedJob) return;
    try {
      await api.delete(`/api/jobs/${selectedJob.id}`);
      toast.success(`Job "${selectedJob.name}" deleted successfully`);
      setShowDeleteJobDialog(false);

      // Clear selection FIRST
      setSelectedJob(null);

      // THEN refresh caches
      await refreshJobs();
      await refreshPayCodeMappings();
    } catch (error) {
      console.error("Error deleting job:", error);
      toast.error("Failed to delete job. Please try again.");
      setShowDeleteJobDialog(false);
    }
  }, [selectedJob, refreshJobs, refreshPayCodeMappings]);

  // Pagination component
  const Pagination = () => {
    // Page navigation handlers
    const handleNextPage = () => {
      if (currentPage < totalPages) {
        setCurrentPage((prev) => prev + 1);
      }
    };

    const handlePrevPage = () => {
      if (currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      }
    };

    const handlePageChange = (page: number) => {
      setCurrentPage(page);
    };

    // Calculate page numbers to show
    const pageNumbers: number[] = [];
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    // Adjust if we're near the end
    if (endPage === totalPages && endPage - 4 > 0) {
      startPage = Math.max(1, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return (
      <div className="flex items-center justify-between py-3 border-t border-default-200">
        <div>
          <p className="text-sm text-default-600">
            Showing{" "}
            <span className="font-medium">
              {(currentPage - 1) * itemsPerPage + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {Math.min(currentPage * itemsPerPage, filteredJobDetails.length)}
            </span>{" "}
            of <span className="font-medium">{filteredJobDetails.length}</span>{" "}
            results
          </p>
        </div>

        <div>
          <nav
            className="inline-flex rounded-md shadow-sm -space-x-px"
            aria-label="Pagination"
          >
            {/* Previous button */}
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-default-300 bg-white text-sm font-medium 
              ${
                currentPage === 1
                  ? "text-default-300 cursor-not-allowed"
                  : "text-default-500 hover:bg-default-50"
              }`}
            >
              <span className="sr-only">Previous</span>
              <IconChevronLeft size={18} aria-hidden="true" />
            </button>

            {/* First page + ellipsis */}
            {startPage > 1 && (
              <>
                <button
                  onClick={() => handlePageChange(1)}
                  className="relative inline-flex items-center px-4 py-2 border border-default-300 bg-white text-sm font-medium text-default-700 hover:bg-default-50"
                >
                  1
                </button>
                {startPage > 2 && (
                  <span className="relative inline-flex items-center px-2 py-2 border border-default-300 bg-white text-sm font-medium text-default-500">
                    ...
                  </span>
                )}
              </>
            )}

            {/* Page numbers */}
            {pageNumbers.map((number) => (
              <button
                key={number}
                onClick={() => handlePageChange(number)}
                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium
                ${
                  currentPage === number
                    ? "z-10 bg-sky-50 border-sky-500 text-sky-600"
                    : "bg-white border-default-300 text-default-700 hover:bg-default-50"
                }`}
              >
                {number}
              </button>
            ))}

            {/* Last page + ellipsis */}
            {endPage < totalPages && (
              <>
                {endPage < totalPages - 1 && (
                  <span className="relative inline-flex items-center px-2 py-2 border border-default-300 bg-white text-sm font-medium text-default-500">
                    ...
                  </span>
                )}
                <button
                  onClick={() => handlePageChange(totalPages)}
                  className="relative inline-flex items-center px-4 py-2 border border-default-300 bg-white text-sm font-medium text-default-700 hover:bg-default-50"
                >
                  {totalPages}
                </button>
              </>
            )}

            {/* Next button */}
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-default-300 bg-white text-sm font-medium
              ${
                currentPage === totalPages
                  ? "text-default-300 cursor-not-allowed"
                  : "text-default-500 hover:bg-default-50"
              }`}
            >
              <span className="sr-only">Next</span>
              <IconChevronRight size={18} aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>
    );
  };

  // --- Main Render ---
  return (
    <div
      className={`relative ${selectedJob ? "w-full" : ""} mx-4 mb-2 md:mx-6`}
    >
      <h1 className="mb-6 text-center text-xl font-semibold text-default-800">
        Job Catalogue & Details
      </h1>
      {/* Job Selection and Info Area */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4 rounded-lg border border-default-200 bg-white p-4 shadow-sm">
        {/* Job Combobox */}
        <div className="md:flex-shrink-0">
          <label className="block text-sm font-medium text-default-700 mb-1">
            Select Job
          </label>
          <Field className="w-64">
            <Combobox value={selectedJob} onChange={handleJobSelection}>
              <div className="relative">
                <ComboboxInput
                  className="w-full cursor-default rounded-lg border border-default-300 bg-white py-1.5 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                  displayValue={(job: Job | null) => job?.name || ""}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Select or search..."
                  autoComplete="off"
                />
                <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <IconChevronDown
                    size={20}
                    className="text-gray-400"
                    aria-hidden="true"
                  />
                </ComboboxButton>
              </div>
              <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-64 overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                {/* Add Job Option */}
                <ComboboxOption
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                      active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                    }`
                  }
                  value={undefined}
                >
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                    <IconPlus size={18} />
                  </span>
                  Add New Job
                </ComboboxOption>

                {/* Separator */}
                {(filteredJobs.length > 0 || loadingJobs) && (
                  <hr className="my-1" />
                )}

                {/* Job List */}
                {loadingJobs ? (
                  <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                    Loading jobs...
                  </div>
                ) : filteredJobs.length === 0 && query !== "" ? (
                  <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                    No jobs found.
                  </div>
                ) : (
                  filteredJobs.map((job) => (
                    <ComboboxOption
                      key={job.id}
                      className={({ active }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                          active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                        }`
                      }
                      value={job}
                    >
                      {({ selected, active }) => (
                        <>
                          {/* Checkmark */}
                          {selected && (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                              <IconCheck size={20} aria-hidden="true" />
                            </span>
                          )}
                          {/* Job Name */}
                          <span
                            className={`block truncate ${
                              selected ? "font-medium" : "font-normal"
                            }`}
                          >
                            {job.name}
                          </span>
                        </>
                      )}
                    </ComboboxOption>
                  ))
                )}
              </ComboboxOptions>
            </Combobox>
          </Field>
        </div>

        {/* Selected Job Info */}
        {selectedJob && (
          <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex flex-wrap gap-4 flex-1">
              <div className="rounded-lg bg-default-50 px-4 py-2 border border-default-200">
                <p className="text-xs uppercase text-default-500 font-medium">
                  ID
                </p>
                <p className="text-default-800 font-semibold">
                  {selectedJob.id}
                </p>
              </div>

              <div className="rounded-lg bg-default-50 px-4 py-2 border border-default-200">
                <p className="text-xs uppercase text-default-500 font-medium">
                  Section
                </p>
                <p className="text-default-800 font-semibold">
                  {Array.isArray(selectedJob.section)
                    ? selectedJob.section.join(", ")
                    : selectedJob.section}
                </p>
              </div>

              <div className="rounded-lg bg-default-50 px-4 py-2 border border-default-200">
                <p className="text-xs uppercase text-default-500 font-medium">
                  Name
                </p>
                <p className="text-default-800 font-semibold">
                  {selectedJob.name}
                </p>
              </div>
            </div>

            {/* Action Buttons for Selected Job */}
            <div className="md:ml-auto mt-3 md:mt-0">
              <Button
                onClick={handleDeleteSelectedJobClick}
                variant="outline"
                color="rose"
                size="sm"
                icon={IconTrash}
                aria-label="Delete Selected Job"
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
      {selectedJob && (
        <div className="mt-6 rounded-lg border border-default-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col items-center justify-between gap-4 md:flex-row">
            <h2 className="text-lg font-semibold text-default-800">
              Pay Codes for "{selectedJob.name}"
            </h2>
            <div className="flex w-full items-center justify-end gap-4 md:w-auto">
              <Button
                onClick={() => {
                  setShowAddPayCodeModal(true);

                  // Filter available pay codes to exclude ones already assigned to the job
                  if (selectedJob && jobPayCodeMap[selectedJob.id]) {
                    const assignedPayCodeIds = jobPayCodeMap[selectedJob.id];
                    const filteredPayCodes = availablePayCodes.filter(
                      (payCode) => !assignedPayCodeIds.includes(payCode.id)
                    );
                    // If there's only one unassigned pay code, select it automatically
                    if (filteredPayCodes.length === 1) {
                      setSelectedPayCode(filteredPayCodes[0]);
                    } else {
                      setSelectedPayCode(null); // Reset selection
                    }
                  }
                }}
                color="sky"
                variant="filled"
                icon={IconPlus}
                size="md"
                disabled={!selectedJob}
              >
                Add Pay Code
              </Button>
            </div>
          </div>

          {/* Pay Codes List/Table */}
          {loadingPayCodes ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200">
                <thead className="bg-default-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Unit
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                      Biasa Rate
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                      Ahad Rate
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                      Umum Rate
                    </th>
                    <th className="w-28 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-200 bg-white">
                  {jobPayCodes.length > 0 ? (
                    jobPayCodes.map((payCode) => (
                      <tr key={payCode.id} className="hover:bg-default-50">
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                          {payCode.code}
                        </td>
                        <td className="px-4 py-3 text-sm text-default-700 max-w-xs truncate">
                          {payCode.description}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                          {payCode.pay_type}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                          {payCode.rate_unit}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700">
                          {typeof payCode.rate_biasa === "number"
                            ? payCode.rate_biasa.toFixed(2)
                            : "0.00"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700">
                          {typeof payCode.rate_ahad === "number"
                            ? payCode.rate_ahad.toFixed(2)
                            : "0.00"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700">
                          {typeof payCode.rate_umum === "number"
                            ? payCode.rate_umum.toFixed(2)
                            : "0.00"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center text-sm">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() =>
                                handleRemovePayCodeFromJob(payCode.id)
                              }
                              className="text-rose-600 hover:text-rose-800"
                              title="Remove Pay Code"
                            >
                              <IconTrash size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-10 text-center text-sm text-default-500"
                      >
                        No pay codes assigned to this job.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Placeholder */}
      {!selectedJob && !loadingJobs && (
        <div className="mt-10 text-center text-default-500">
          Select a job from the list above or{" "}
          <button
            onClick={handleAddJobClickInList}
            className="text-sky-600 hover:underline"
          >
            add a new job
          </button>{" "}
          to view details.
        </div>
      )}
      {/* Modals and Dialogs */}
      <NewJobModal
        isOpen={showAddJobModal}
        onClose={() => setShowAddJobModal(false)}
        onJobAdded={handleJobAdded}
      />
      <ConfirmationDialog
        isOpen={showDeleteJobDialog}
        onClose={() => setShowDeleteJobDialog(false)}
        // Use selectedJob in the message now
        onConfirm={confirmDeleteJob}
        title="Delete Job"
        message={`Are you sure you want to delete the job "${
          selectedJob?.name ?? "N/A"
        }"? This action cannot be undone.`}
        variant="danger"
      />
      <Dialog
        open={showAddPayCodeModal}
        onClose={() => setShowAddPayCodeModal(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
            <DialogTitle
              as="h3"
              className="text-lg font-medium leading-6 text-gray-900"
            >
              Add Pay Code to Job
            </DialogTitle>
            <div className="mt-4">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Select Pay Code
                </label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  onChange={(e) => {
                    const selected = availablePayCodes.find(
                      (pc) => pc.id === e.target.value
                    );
                    setSelectedPayCode(selected || null);
                  }}
                  value={selectedPayCode?.id || ""}
                >
                  <option value="">Select a pay code</option>
                  {availablePayCodes.map((pc) => (
                    <option key={pc.id} value={pc.id}>
                      {pc.code} - {pc.description}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddPayCodeModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  color="sky"
                  variant="filled"
                  disabled={!selectedPayCode}
                  onClick={() => {
                    if (selectedPayCode) {
                      handleAddPayCodeToJob(selectedPayCode.id);
                      setShowAddPayCodeModal(false);
                      setSelectedPayCode(null);
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
      {/* Pagination - only show if we have more than one page */}
      {filteredJobDetails.length > itemsPerPage && <Pagination />}
    </div>
  );
};

export default JobPage;
