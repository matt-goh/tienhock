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
} from "@tabler/icons-react";
import toast from "react-hot-toast";

import { api } from "../../routes/utils/api";
import { Job, JobDetail } from "../../types/types"; // Assuming SelectOption is defined here or imported elsewhere
import LoadingSpinner from "../../components/LoadingSpinner";
import NewJobModal from "../../components/Catalogue/NewJobModal"; // Add Job
import EditJobModal from "../../components/Catalogue/EditJobModal"; // Edit Job Info
import JobDetailModal from "../../components/Catalogue/JobDetailModal"; // Add/Edit Job Detail
import ConfirmationDialog from "../../components/ConfirmationDialog";
import Button from "../../components/Button";

type JobSelection = Job | null;

const JobPage: React.FC = () => {
  // --- State ---
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobSelection>(null);
  const [allJobDetails, setAllJobDetails] = useState<JobDetail[]>([]);
  const [jobType, setJobType] = useState<string>("All"); // Default to 'All'
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [query, setQuery] = useState(""); // For job combobox filtering
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null); // For delete icon hover

  // Modal/Dialog States
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [showEditJobModal, setShowEditJobModal] = useState(false);
  const [showAddDetailModal, setShowAddDetailModal] = useState(false);
  const [showEditDetailModal, setShowEditDetailModal] = useState(false);
  const [detailToEdit, setDetailToEdit] = useState<JobDetail | null>(null);
  const [showDeleteJobDialog, setShowDeleteJobDialog] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [showDeleteDetailDialog, setShowDeleteDetailDialog] = useState(false);
  const [detailToDelete, setDetailToDelete] = useState<JobDetail | null>(null);

  // --- Data Fetching ---
  const fetchJobs = useCallback(async (selectFirst = false) => {
    setLoadingJobs(true);
    try {
      const response = await api.get("/api/jobs");
      const data = response as Job[]; // Assert the type here
      // Ensure 'section' is always an array
      const normalizedJobs = data.map((job) => ({
        ...job,
        section: Array.isArray(job.section)
          ? job.section
          : job.section
          ? [job.section] // Convert string to array if it exists
          : [], // Default to empty array if null/undefined
      }));
      setJobs(normalizedJobs);
      if (selectFirst && normalizedJobs.length > 0) {
        setSelectedJob(normalizedJobs[0]); // Select the first job after adding
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
      toast.error("Failed to fetch jobs. Please try again.");
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const fetchJobDetails = useCallback(async (jobId: string) => {
    if (!jobId) {
      setAllJobDetails([]);
      return;
    }
    setLoadingDetails(true);
    try {
      // Assume api.get returns data that needs type assertion
      const data = (await api.get(`/api/jobs/${jobId}/details`)) as JobDetail[];
      setAllJobDetails(data);
    } catch (error) {
      console.error("Error fetching job details:", error);
      toast.error("Failed to fetch job details. Please try again.");
      setAllJobDetails([]); // Clear details on error
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Fetch details when selectedJob changes
  useEffect(() => {
    if (selectedJob) {
      fetchJobDetails(selectedJob.id);
    } else {
      setAllJobDetails([]); // Clear details if no job is selected
    }
  }, [selectedJob, fetchJobDetails]);

  // --- Derived State ---
  // Filter jobs for Combobox
  const filteredJobs = useMemo(
    () =>
      query === ""
        ? jobs
        : jobs.filter((job) =>
            job.name.toLowerCase().includes(query.toLowerCase())
          ),
    [jobs, query]
  );

  // Filter details based on selected jobType
  const filteredJobDetails = useMemo(() => {
    if (jobType === "All") {
      return allJobDetails;
    }
    return allJobDetails.filter((detail) => detail.type === jobType);
  }, [jobType, allJobDetails]);

  // --- Job Handlers ---
  const handleJobSelection = useCallback(
    (selection: Job | null | undefined) => {
      // Undefined means "+ Add Job" was clicked
      if (selection === undefined) {
        setShowAddJobModal(true);
      } else {
        // Null or a Job object
        setSelectedJob(selection);
        // Clear query when a job is selected or deselected
        setQuery("");
      }
    },
    [] // No dependencies, relies only on setShowAddJobModal and setSelectedJob
  );

  const handleAddJobClickInList = () => {
    setShowAddJobModal(true);
  };

  const handleOptionClick = (e: React.MouseEvent, job: Job) => {
    // Prevent selection if delete button is clicked
    if (!(e.target as HTMLElement).closest(".delete-button")) {
      handleJobSelection(job);
    }
  };

  const handleJobAdded = useCallback(
    // Updated to expect ID from modal, matching NewJobModal's onJobAdded prop type
    async (newJobData: Omit<Job, "id" | "newId"> & { id: string }) => {
      try {
        // Backend might expect sections as a string (adjust if backend handles array)
        const jobToSend = {
          ...newJobData,
          section: Array.isArray(newJobData.section)
            ? newJobData.section.join(", ")
            : newJobData.section,
        };
        await api.post("/api/jobs", jobToSend);

        toast.success("Job added successfully");
        setShowAddJobModal(false);
        await fetchJobs(true); // Refetch jobs and select the new one (or first)
      } catch (error: any) {
        console.error("Error adding job:", error);
        // Re-throw error for the modal to catch and display
        throw new Error(
          error.message || "Failed to add job. Please try again."
        );
      }
    },
    [fetchJobs]
  );

  const handleEditJobClick = () => {
    if (selectedJob) {
      setShowEditJobModal(true);
    }
  };

  const handleJobUpdated = useCallback(
    async (updatedJobData: Job & { newId?: string }) => {
      if (!selectedJob) return;

      try {
        // Backend might expect sections as a string (adjust if backend handles array)
        const jobToSend = {
          ...updatedJobData,
          section: Array.isArray(updatedJobData.section)
            ? updatedJobData.section.join(", ")
            : updatedJobData.section,
        };
        // Use PUT request, backend handles ID change via newId
        const result = await api.put(`/api/jobs/${selectedJob.id}`, jobToSend);
        const returnedJob = result.job as Job; // Type assertion

        toast.success("Job updated successfully");
        setShowEditJobModal(false);
        await fetchJobs(); // Refetch jobs
        // Update the selected job state with the potentially new ID/data
        // Ensure sections are array in the updated state
        setSelectedJob({
          ...returnedJob,
          section: Array.isArray(returnedJob.section)
            ? returnedJob.section
            : returnedJob.section
            ? [returnedJob.section]
            : [],
        });
        // Refetch details only if ID changed
        if (returnedJob.id !== selectedJob.id) {
          await fetchJobDetails(returnedJob.id);
        }
      } catch (error: any) {
        console.error("Error updating job:", error);
        throw new Error(
          error.message || "Failed to update job. Please try again."
        );
      }
    },
    [selectedJob, fetchJobs, fetchJobDetails]
  );

  const handleDeleteJobClick = useCallback(
    async (job: Job, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent job selection
      try {
        // Check if job details exist
        const response = await api.get(`/api/jobs/${job.id}/details/count`);
        const { count } = response as { count: number }; // Type assertion

        if (count > 0) {
          toast.error(
            `Cannot delete job "${job.name}". It has ${count} associated detail(s). Please delete them first.`
          );
        } else {
          setJobToDelete(job);
          setShowDeleteJobDialog(true);
        }
      } catch (error) {
        console.error("Error checking job details count:", error);
        toast.error("Could not check for associated job details.");
      }
    },
    [] // No dependencies
  );

  const confirmDeleteJob = useCallback(async () => {
    if (!jobToDelete) return;
    try {
      await api.delete(`/api/jobs/${jobToDelete.id}`);
      toast.success(`Job "${jobToDelete.name}" deleted successfully`);
      setShowDeleteJobDialog(false);
      setJobToDelete(null);
      await fetchJobs(); // Refetch jobs
      // If the deleted job was selected, clear selection
      if (selectedJob && selectedJob.id === jobToDelete.id) {
        setSelectedJob(null);
      }
    } catch (error) {
      console.error("Error deleting job:", error);
      toast.error("Failed to delete job. Please try again.");
    }
  }, [jobToDelete, selectedJob, fetchJobs]);

  // --- Job Detail Handlers ---
  const handleAddDetailClick = () => {
    if (!selectedJob) return; // Should not happen if button is disabled correctly
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
        // Ensure amount is a number before sending
        const detailToSend = {
          ...detailData,
          amount: Number(detailData.amount) || 0, // Convert to number, default to 0 if NaN
        };

        // Use the batch endpoint for adding/updating single detail
        // Backend handles upsert logic based on ID
        await api.post("/api/job-details/batch", {
          jobId: selectedJob.id,
          jobDetails: [detailToSend], // Send as an array
        });

        toast.success(
          `Job detail ${detailToEdit ? "updated" : "added"} successfully`
        );
        setShowAddDetailModal(false);
        setShowEditDetailModal(false);
        setDetailToEdit(null);
        await fetchJobDetails(selectedJob.id); // Refetch details for the current job
      } catch (error: any) {
        console.error("Error saving job detail:", error);
        throw new Error(
          error.message || "Failed to save job detail. Please try again."
        );
      }
    },
    [selectedJob, fetchJobDetails, detailToEdit] // Include detailToEdit to differentiate add/edit toast message context
  );

  const handleDeleteDetailClick = (detail: JobDetail) => {
    setDetailToDelete(detail);
    setShowDeleteDetailDialog(true);
  };

  const confirmDeleteDetail = useCallback(async () => {
    if (!detailToDelete || !selectedJob) return;
    try {
      // Backend expects array of IDs in 'jobDetailIds' key
      await api.delete("/api/job-details", {
        jobDetailIds: [detailToDelete.id],
      });

      toast.success("Job detail deleted successfully");
      setShowDeleteDetailDialog(false);
      setDetailToDelete(null);
      await fetchJobDetails(selectedJob.id); // Refetch details
    } catch (error) {
      console.error("Error deleting job detail:", error);
      toast.error("Failed to delete job detail. Please try again.");
    }
  }, [detailToDelete, selectedJob, fetchJobDetails]);

  // --- Render Job Type Listbox ---
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

  // --- Main Render ---
  return (
    <div className="relative p-4 md:p-6">
      <h1 className="mb-6 text-center text-xl font-semibold text-default-800">
        Job Catalogue & Details
      </h1>

      {/* Job Selection and Info Area */}
      <div className="mb-6 flex flex-wrap items-start gap-4 rounded-lg border border-default-200 bg-white p-4 shadow-sm">
        {/* Job Combobox */}
        <div className="flex-shrink-0">
          <label className="block text-sm font-medium text-default-700 mb-1">
            Select Job
          </label>
          <Field className="w-64">
            <Combobox
              value={selectedJob}
              onChange={handleJobSelection}
            >
              <div className="relative">
                <ComboboxInput
                  className="w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
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
                  value={undefined} // Special value for Add Job
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
                        `relative cursor-pointer select-none py-2 pl-10 pr-10 group ${
                          // Extra pr for delete icon space, added group
                          active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                        }`
                      }
                      value={job}
                      onMouseEnter={() => setHoveredJobId(job.id)}
                      onMouseLeave={() => setHoveredJobId(null)}
                      onClick={(e) => handleOptionClick(e, job)} // Use custom click handler
                    >
                      {({ selected }) => (
                        <>
                          <span
                            className={`block truncate ${
                              selected ? "font-medium" : "font-normal"
                            }`}
                          >
                            {job.name}
                          </span>
                          {selected ? (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                              <IconCheck size={20} aria-hidden="true" />
                            </span>
                          ) : null}
                          {/* Delete Button */}
                          <button
                            onClick={(e) => handleDeleteJobClick(job, e)}
                            className={`delete-button absolute inset-y-0 right-0 my-auto mr-2 flex h-7 w-7 items-center justify-center rounded-md text-rose-500 hover:bg-rose-100 hover:text-rose-700 ${
                              hoveredJobId === job.id
                                ? "opacity-100" // Always show if hovered directly
                                : "opacity-0 group-hover:opacity-100" // Show on parent hover
                            } transition-opacity duration-150 z-10`} // Ensure button is clickable
                            title={`Delete job ${job.name}`}
                          >
                            <IconTrash size={18} />
                          </button>
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
          <div className="flex flex-grow items-start space-x-4 pt-7">
            <div className="space-y-1">
              <p className="text-sm text-default-600">
                <span className="font-semibold">ID:</span> {selectedJob.id}
              </p>
              <p className="text-sm text-default-600">
                <span className="font-semibold">Section:</span>{" "}
                {
                  Array.isArray(selectedJob.section)
                    ? selectedJob.section.join(", ")
                    : selectedJob.section /* Should be array now, but fallback */
                }
              </p>
            </div>
            <Button
              onClick={handleEditJobClick}
              variant="outline"
              size="sm"
              icon={IconPencil}
              additionalClasses="self-center"
            >
              Edit Info
            </Button>
          </div>
        )}
      </div>

      {/* Job Details Area */}
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
                disabled={!selectedJob} // Disable if no job selected
              >
                Add Detail
              </Button>
            </div>
          </div>

          {/* Details List/Table */}
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
                    {/* Show Type column only if 'All' is selected */}
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
                  {filteredJobDetails.length > 0 ? (
                    filteredJobDetails.map((detail) => (
                      <tr key={detail.id} className="hover:bg-default-50">
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                          {detail.id}
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-default-700 max-w-xs truncate"
                          title={detail.description}
                        >
                          {detail.description}
                        </td>
                        {/* FIXED TD FOR AMOUNT */}
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
                            return "0.00"; // Default for null/undefined/other
                          })()}
                        </td>
                        {/* END FIXED TD */}
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
                              onClick={() => handleEditDetailClick(detail)}
                              className="text-sky-600 hover:text-sky-800"
                              title="Edit Detail"
                            >
                              <IconPencil size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteDetailClick(detail)}
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
                        colSpan={jobType === "All" ? 6 : 5} // Adjust colspan
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

      {/* Placeholder if no job is selected */}
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
      {selectedJob && ( // Only render EditJobModal if a job is selected
        <EditJobModal
          isOpen={showEditJobModal}
          onClose={() => setShowEditJobModal(false)}
          onSave={handleJobUpdated}
          initialData={selectedJob}
        />
      )}
      {selectedJob && ( // Only render Detail modals if a job is selected
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
        onConfirm={confirmDeleteJob}
        title="Delete Job"
        message={`Are you sure you want to delete the job "${
          jobToDelete?.name ?? "N/A" // Handle potential null case briefly
        }"? This action cannot be undone.`}
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={showDeleteDetailDialog}
        onClose={() => setShowDeleteDetailDialog(false)}
        onConfirm={confirmDeleteDetail}
        title="Delete Job Detail"
        message={`Are you sure you want to delete the detail "${
          detailToDelete?.description || detailToDelete?.id || "N/A" // Handle potential null case briefly
        }"? This action cannot be undone.`}
        variant="danger"
      />
    </div>
  );
};

export default JobPage;
