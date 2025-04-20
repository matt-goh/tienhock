// src/pages/Catalogue/JobPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  Field,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  IconCheck,
  IconChevronDown,
  IconTrash,
  IconPencil,
  IconPlus,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import toast from "react-hot-toast";

import { api } from "../../routes/utils/api";
import { Job, JobDetail } from "../../types/types";
import LoadingSpinner from "../../components/LoadingSpinner";
import NewJobModal from "../../components/Catalogue/NewJobModal";
import JobDetailModal from "../../components/Catalogue/JobDetailModal";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import Button from "../../components/Button";

type JobSelection = Job | null;

const JobPage: React.FC = () => {
  // --- State ---
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobSelection>(null);
  const [allJobDetails, setAllJobDetails] = useState<JobDetail[]>([]);
  const [jobType, setJobType] = useState<string>("All");
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [query, setQuery] = useState(""); // For job combobox filtering
  // No longer need hoveredJobId for delete button in list
  // const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);

  // --- Modal/Dialog States ---
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [showAddDetailModal, setShowAddDetailModal] = useState(false);
  const [showEditDetailModal, setShowEditDetailModal] = useState(false);
  const [detailToEdit, setDetailToEdit] = useState<JobDetail | null>(null);
  const [showDeleteJobDialog, setShowDeleteJobDialog] = useState(false);
  // No longer need jobToDelete state, will use selectedJob directly
  // const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [showDeleteDetailDialog, setShowDeleteDetailDialog] = useState(false);
  const [detailToDelete, setDetailToDelete] = useState<JobDetail | null>(null);
  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(50); // 50 items per page as requested

  // --- Data Fetching ---
  const fetchJobs = useCallback(
    async (selectFirst = false) => {
      setLoadingJobs(true);
      try {
        const response = await api.get("/api/jobs");
        const data = response as Job[];
        const normalizedJobs = data.map((job) => ({
          ...job,
          section: Array.isArray(job.section)
            ? job.section
            : job.section
            ? [job.section]
            : [],
        }));
        setJobs(normalizedJobs);
        if (selectFirst && normalizedJobs.length > 0) {
          setSelectedJob(normalizedJobs[0]);
        } else if (!selectFirst && selectedJob) {
          // Reselect the current job after refetch to ensure data consistency
          const refreshedSelectedJob = normalizedJobs.find(
            (j) => j.id === selectedJob.id
          );
          setSelectedJob(refreshedSelectedJob || null);
        }
      } catch (error) {
        console.error("Error fetching jobs:", error);
        toast.error("Failed to fetch jobs. Please try again.");
      } finally {
        setLoadingJobs(false);
      }
    },
    [selectedJob]
  ); // Add selectedJob dependency for re-selection logic

  const fetchJobDetails = useCallback(async (jobId: string) => {
    if (!jobId) {
      setAllJobDetails([]);
      return;
    }
    setLoadingDetails(true);
    try {
      const data = (await api.get(`/api/jobs/${jobId}/details`)) as JobDetail[];
      setAllJobDetails(data);
    } catch (error) {
      console.error("Error fetching job details:", error);
      toast.error("Failed to fetch job details. Please try again.");
      setAllJobDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  useEffect(() => {
    if (selectedJob) {
      fetchJobDetails(selectedJob.id);
    } else {
      setAllJobDetails([]);
    }
  }, [selectedJob, fetchJobDetails]);

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
        await api.post("/api/jobs", jobToSend);

        toast.success("Job added successfully");
        setShowAddJobModal(false);
        await fetchJobs(true); // Refetch jobs and select the new one
      } catch (error: any) {
        console.error("Error adding job:", error);
        throw new Error(
          error.message || "Failed to add job. Please try again."
        );
      }
    },
    [fetchJobs]
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
    if (!selectedJob) return; // Use selectedJob now
    try {
      await api.delete(`/api/jobs/${selectedJob.id}`); // Use selectedJob.id
      toast.success(`Job "${selectedJob.name}" deleted successfully`);
      setShowDeleteJobDialog(false);
      // Clear selection FIRST
      setSelectedJob(null);
      // THEN refetch jobs
      await fetchJobs();
    } catch (error) {
      console.error("Error deleting job:", error);
      toast.error("Failed to delete job. Please try again.");
      // Close dialog even on error? Or let user retry? Closing for now.
      setShowDeleteJobDialog(false);
    }
  }, [selectedJob, fetchJobs]); // Depends on selectedJob

  // --- Job Detail Handlers (remain largely the same) ---
  const handleAddDetailClick = () => {
    if (!selectedJob) return;
    setDetailToEdit(null);
    setShowAddDetailModal(true);
  };

  const handleEditDetailClick = (detail: JobDetail) => {
    setDetailToEdit(detail);
    setShowEditDetailModal(true);
  };

  const handleSaveDetail = useCallback(
    async (detailData: JobDetail) => {
      if (!selectedJob) return;
      try {
        const detailToSend = {
          ...detailData,
          amount: Number(detailData.amount) || 0,
        };

        // Create a copy of all job details
        const updatedDetails = [...allJobDetails];

        // Find the index of the detail being edited (if it exists)
        const existingIndex = updatedDetails.findIndex(
          (d) => d.id === detailToSend.id
        );

        if (existingIndex >= 0) {
          // Update existing detail
          updatedDetails[existingIndex] = detailToSend;
        } else {
          // Add new detail
          updatedDetails.push(detailToSend);
        }

        // Send ALL details, not just the one being edited
        await api.post("/api/job-details/batch", {
          jobId: selectedJob.id,
          jobDetails: updatedDetails,
        });

        toast.success(
          `Job detail ${detailToEdit ? "updated" : "added"} successfully`
        );
        setShowAddDetailModal(false);
        setShowEditDetailModal(false);
        setDetailToEdit(null);
        await fetchJobDetails(selectedJob.id);
      } catch (error: any) {
        console.error("Error saving job detail:", error);
        throw new Error(
          error.message || "Failed to save job detail. Please try again."
        );
      }
    },
    [selectedJob, fetchJobDetails, detailToEdit, allJobDetails] // Added allJobDetails dependency
  );

  const handleDeleteDetailClick = (detail: JobDetail) => {
    setDetailToDelete(detail);
    setShowDeleteDetailDialog(true);
  };

  const confirmDeleteDetail = useCallback(async () => {
    if (!detailToDelete || !selectedJob) return;
    try {
      await api.delete("/api/job-details", {
        jobDetailIds: [detailToDelete.id],
      });
      toast.success("Job detail deleted successfully");
      setShowDeleteDetailDialog(false);
      setDetailToDelete(null);
      await fetchJobDetails(selectedJob.id);
    } catch (error) {
      console.error("Error deleting job detail:", error);
      toast.error("Failed to delete job detail. Please try again.");
    }
  }, [detailToDelete, selectedJob, fetchJobDetails]);

  // --- Render Job Type Listbox (remains the same) ---
  const renderJobTypeListbox = () => (
    <div className="flex items-center space-x-2">
      <span className="font-semibold text-sm text-default-700">Type:</span>
      <Listbox value={jobType} onChange={setJobType}>
        <div className="relative">
          <ListboxButton className="relative w-40 cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm">
            <span className="block truncate">{jobType}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                size={20}
                className="text-gray-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {["All", "Gaji", "Tambahan", "Overtime"].map((type) => (
              <ListboxOption
                key={type}
                className={({ active }) =>
                  `relative cursor-default select-none py-2 pl-10 pr-4 ${
                    active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                  }`
                }
                value={type}
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? "font-medium" : "font-normal"
                      }`}
                    >
                      {type}
                    </span>
                    {selected ? (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                        <IconCheck size={20} aria-hidden="true" />
                      </span>
                    ) : null}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );

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
    <div className="relative w-full mx-4 md:mx-6">
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
            <Combobox
              value={selectedJob}
              onChange={handleJobSelection}
              nullable
            >
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
      {/* End Job Selection and Info Area */}
      {selectedJob && (
        <div className="mt-6 rounded-lg border border-default-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col items-center justify-between gap-4 md:flex-row">
            <h2 className="text-lg font-semibold text-default-800">
              Job Details for "{selectedJob.name}"
            </h2>
            <div className="flex w-full items-center justify-end gap-4 md:w-auto">
              {renderJobTypeListbox()}
              <Button
                onClick={handleAddDetailClick}
                color="sky"
                variant="filled"
                icon={IconPlus}
                size="md"
                disabled={!selectedJob}
              >
                Add Detail
              </Button>
            </div>
          </div>

          {/* Details List/Table (remains the same, includes amount fix) */}
          {loadingDetails ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200">
                <thead className="bg-default-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Description
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                      Amount
                    </th>
                    {jobType === "All" && (
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                        Type
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Remark
                    </th>
                    <th className="w-28 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-200 bg-white">
                  {paginatedJobDetails.length > 0 ? (
                    paginatedJobDetails.map((detail) => (
                      <tr
                        key={detail.id}
                        className="hover:bg-default-50 cursor-pointer"
                        onClick={() => handleEditDetailClick(detail)}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                          {detail.id}
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-default-700 max-w-xs truncate"
                          title={detail.description}
                        >
                          {detail.description}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700">
                          {(() => {
                            const amountValue = detail.amount;
                            if (typeof amountValue === "number") {
                              return amountValue.toFixed(2);
                            } else if (typeof amountValue === "string") {
                              const parsedAmount = parseFloat(amountValue);
                              return isNaN(parsedAmount)
                                ? "0.00"
                                : parsedAmount.toFixed(2);
                            }
                            return "0.00";
                          })()}
                        </td>
                        {jobType === "All" && (
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                            {detail.type}
                          </td>
                        )}
                        <td
                          className="px-4 py-3 text-sm text-default-700 max-w-xs truncate"
                          title={detail.remark}
                        >
                          {detail.remark}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center text-sm">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                handleEditDetailClick(detail);
                              }}
                              className="text-sky-600 hover:text-sky-800"
                              title="Edit Detail"
                            >
                              <IconPencil size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDetailClick(detail);
                              }}
                              className="text-rose-600 hover:text-rose-800"
                              title="Delete Detail"
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
                        colSpan={jobType === "All" ? 6 : 5}
                        className="px-6 py-10 text-center text-sm text-default-500"
                      >
                        {allJobDetails.length === 0
                          ? "No details found for this job."
                          : "No details match the selected type."}
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
      {selectedJob && (
        <>
          <JobDetailModal
            isOpen={showAddDetailModal}
            onClose={() => setShowAddDetailModal(false)}
            onSave={handleSaveDetail}
            jobId={selectedJob.id}
          />
          <JobDetailModal
            isOpen={showEditDetailModal}
            onClose={() => setShowEditDetailModal(false)}
            onSave={handleSaveDetail}
            initialData={detailToEdit}
            jobId={selectedJob.id}
          />
        </>
      )}
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
      <ConfirmationDialog
        isOpen={showDeleteDetailDialog}
        onClose={() => setShowDeleteDetailDialog(false)}
        onConfirm={confirmDeleteDetail}
        title="Delete Job Detail"
        message={`Are you sure you want to delete the detail "${
          detailToDelete?.description || detailToDelete?.id || "N/A"
        }"? This action cannot be undone.`}
        variant="danger"
      />
      {/* Pagination - only show if we have more than one page */}
      {filteredJobDetails.length > itemsPerPage && <Pagination />}
    </div>
  );
};

export default JobPage;
