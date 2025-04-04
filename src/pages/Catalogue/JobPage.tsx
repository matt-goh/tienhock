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
import { IconCheck, IconChevronDown, IconTrash } from "@tabler/icons-react";
import _ from "lodash";
import Table from "../../components/Table/Table";
import { ColumnConfig, Job, JobDetail } from "../../types/types";
import NewJobModal from "../../components/Catalogue/NewJobModal";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";

type JobSelection = Job | null;

const JobPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobSelection>(null);
  const [editedJob, setEditedJob] = useState<Job | null>(null);
  const [jobType, setJobType] = useState<string>("Gaji");
  const [allJobDetails, setAllJobDetails] = useState<JobDetail[]>([]);
  const [jobDetails, setJobDetails] = useState<JobDetail[]>([]);
  const [filteredJobDetails, setFilteredJobDetails] = useState<JobDetail[]>([]);
  const [originalJobState, setOriginalJobState] = useState<{
    job: Job | null;
    jobDetails: JobDetail[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [hoveredJob, setHoveredJob] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [query, setQuery] = useState("");

  const jobDetailColumns: ColumnConfig[] = useMemo(() => {
    const baseColumns: ColumnConfig[] = [
      {
        id: "id",
        header: "ID",
        type: isEditing ? "string" : "readonly",
        width: 250,
      },
      {
        id: "description",
        header: "Description",
        type: isEditing ? "string" : "readonly",
        width: 400,
      },
      {
        id: "amount",
        header: "Amount",
        type: isEditing ? "float" : "readonly",
        width: 100,
      },
      {
        id: "remark",
        header: "Remark",
        type: isEditing ? "string" : "readonly",
        width: 150,
      },
    ];

    if (jobType === "All" || isEditing) {
      baseColumns.push({
        id: "type",
        header: "Type",
        type: isEditing ? "listbox" : "readonly",
        width: 100,
        options: ["Gaji", "Tambahan", "Overtime"],
      });
    }

    return baseColumns;
  }, [isEditing, jobType]);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get("/api/jobs");
      setJobs(data);
      if (data.length > 0 && !selectedJob) {
        setSelectedJob(data[0]);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
      toast.error("Failed to fetch jobs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedJob]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const fetchJobDetails = useCallback(async (jobId: string) => {
    try {
      setLoading(true);
      const data = await api.get(`/api/jobs/${jobId}/details`);
      setAllJobDetails(data);
      setFilteredJobDetails(data);
    } catch (error) {
      console.error("Error fetching job details:", error);
      toast.error("Failed to fetch job details. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedJob) {
      fetchJobDetails(selectedJob.id);
      setEditedJob(selectedJob);
    } else {
      setAllJobDetails([]);
      setFilteredJobDetails([]);
      setEditedJob(null);
    }
  }, [selectedJob, fetchJobDetails]);

  useEffect(() => {
    if (jobType === "All") {
      setFilteredJobDetails(allJobDetails);
    } else {
      setFilteredJobDetails(
        allJobDetails.filter((detail) => detail.type === jobType)
      );
    }
  }, [jobType, allJobDetails]);

  const handleJobAdded = useCallback(async (newJob: Omit<Job, "id">) => {
    try {
      const data = await api.post("/api/jobs", newJob);

      setJobs((prevJobs) => [...prevJobs, data.job]);
      setSelectedJob(data.job);
      setShowNewJobModal(false);
      toast.success("Job added successfully");
    } catch (error) {
      console.error("Error adding job:", error);
      toast.error(
        (error as Error).message || "Failed to add job. Please try again."
      );
    }
  }, []);

  // HJS
  const handleJobSelection = useCallback((selection: Job | null) => {
    if (selection === null) {
      // Do nothing when the input is cleared
      return;
    } else if (selection === undefined) {
      // This represents the "Add Job" option
      setShowNewJobModal(true);
    } else {
      setSelectedJob(selection);
      setShowNewJobModal(false);
    }
  }, []);

  const handleNewJobModalClose = useCallback(() => {
    setShowNewJobModal(false);
  }, []);

  const handleDeleteJob = useCallback(async (job: Job, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const { count } = await api.get(`/api/jobs/${job.id}/details/count`);

      if (count > 0) {
        toast.error(
          `Cannot delete job. There are still ${count} job detail(s) associated with this job. Please delete all associated job details first.`
        );
      } else {
        setJobToDelete(job);
        setShowDeleteDialog(true);
      }
    } catch (error) {
      console.error("Error checking associated job details:", error);
      toast.error("An error occurred while checking associated job details.");
    }
  }, []);

  const confirmDeleteJob = useCallback(async () => {
    if (!jobToDelete) return;

    try {
      await api.delete(`/api/jobs/${jobToDelete.id}`);

      setJobs((jobs) => jobs.filter((job) => job.id !== jobToDelete.id));
      if (selectedJob && selectedJob.id === jobToDelete.id) {
        setSelectedJob(null);
      }
      setShowDeleteDialog(false);
      setJobToDelete(null);
      toast.success("Job deleted successfully");
    } catch (error) {
      console.error("Error deleting job:", error);
      toast.error("An error occurred while deleting the job.");
    }
  }, [jobToDelete, selectedJob]);

  const isRowFromDatabase = useCallback(
    (jobDetail: JobDetail) => {
      // Check if jobDetail and its ID exist and match the original data
      return !!(
        jobDetail?.id &&
        originalJobState?.jobDetails.some(
          (original) => original.id === jobDetail.id
        )
      );
    },
    [originalJobState?.jobDetails]
  );

  const handleOptionClick = (e: React.MouseEvent, job: Job) => {
    if (!(e.target as HTMLElement).closest(".delete-button")) {
      handleJobSelection(job);
    }
  };

  const filteredJobs =
    query === ""
      ? jobs
      : jobs.filter((job) =>
          job.name.toLowerCase().includes(query.toLowerCase())
        );

  const handleJobTypeChange = (value: string) => {
    setJobType(value);
  };

  const renderJobTypeListbox = () => (
    <>
      <span className="font-semibold mr-2">Type:</span>
      <Listbox value={jobType} onChange={handleJobTypeChange}>
        <div className="relative">
          <ListboxButton className="w-40 rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
            <span className="block truncate">{jobType}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <IconChevronDown
                className="h-5 w-5 text-default-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
            {["All", "Gaji", "Tambahan", "Overtime"].map((type) => (
              <ListboxOption
                key={type}
                className={({ active }) =>
                  `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                    active
                      ? "bg-default-100 text-default-900"
                      : "text-default-900"
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
                    {selected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                        <IconCheck className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </>
  );

  // TE
  const toggleEditing = useCallback(() => {
    setIsEditing((prev) => {
      if (!prev) {
        // Entering edit mode
        setOriginalJobState({
          job: editedJob ? _.cloneDeep(editedJob) : null,
          jobDetails: _.cloneDeep(allJobDetails),
        });
      }
      return !prev;
    });
  }, [editedJob, allJobDetails]);

  const handleCancel = useCallback(() => {
    if (originalJobState) {
      setEditedJob(originalJobState.job);
      setAllJobDetails(originalJobState.jobDetails);
      setFilteredJobDetails(
        jobType === "All"
          ? originalJobState.jobDetails
          : originalJobState.jobDetails.filter(
              (detail) => detail.type === jobType
            )
      );
    }
    setIsEditing(false);
  }, [originalJobState, jobType]);

  // HS
  const handleSave = useCallback(async () => {
    if (!editedJob) return;

    // Validation checks for job ID
    if (!editedJob.id.trim()) {
      toast.error("Job ID cannot be empty");
      return;
    }

    const isDuplicateJobId = jobs.some(
      (job) => job.id === editedJob.id && job.id !== selectedJob?.id
    );
    if (isDuplicateJobId) {
      toast.error("A job with this ID already exists");
      return;
    }

    // Check for any row that has content but no ID
    const invalidRows = allJobDetails.some((detail) => {
      // A row has content if it has a description, non-zero amount, or remark
      const hasContent =
        (detail.description && detail.description.trim() !== "") ||
        (detail.amount !== undefined &&
          detail.amount !== null &&
          detail.amount !== 0) ||
        (detail.remark && detail.remark.trim() !== "");

      // If the row has content, it must have an ID
      if (hasContent && (!detail.id || detail.id.trim() === "")) {
        return true;
      }

      return false;
    });

    if (invalidRows) {
      toast.error("Please enter an ID for all rows that contain data");
      return;
    }

    // Filter out completely empty rows
    const rowsToSave = allJobDetails.filter((detail) => {
      const hasContent =
        (detail.description && detail.description.trim() !== "") ||
        (detail.amount !== undefined &&
          detail.amount !== null &&
          detail.amount !== 0) ||
        (detail.remark && detail.remark.trim() !== "") ||
        (detail.id && detail.id.trim() !== "");

      return hasContent;
    });

    try {
      // Update job
      const updatedJob = await api.put(`/api/jobs/${selectedJob?.id}`, {
        name: editedJob.name,
        section: editedJob.section,
        newId: editedJob.id !== selectedJob?.id ? editedJob.id : undefined,
      });

      // Send only non-empty rows
      const result = await api.post("/api/job-details/batch", {
        jobId: updatedJob.job.id,
        jobDetails: rowsToSave.map((jobDetail) => ({
          ...jobDetail,
          newId:
            jobDetail.id !==
            originalJobState?.jobDetails.find((d) => d.id === jobDetail.id)?.id
              ? jobDetail.id
              : undefined,
        })),
      });

      // Update state with server response
      setAllJobDetails(result.jobDetails);
      setFilteredJobDetails(
        jobType === "All"
          ? result.jobDetails
          : result.jobDetails.filter((detail: any) => detail.type === jobType)
      );

      setSelectedJob(updatedJob.job);
      setJobs((jobs) =>
        jobs.map((job) => (job.id === selectedJob?.id ? updatedJob.job : job))
      );
      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error in handleSave:", error);
      toast.error((error as Error).message);
    }
  }, [
    editedJob,
    selectedJob,
    allJobDetails,
    originalJobState?.jobDetails,
    jobType,
    jobs,
  ]);

  // HJPC
  const handleJobPropertyChange = useCallback(
    (property: keyof Job, value: string) => {
      if (editedJob) {
        setEditedJob(
          (prev) =>
            ({
              ...prev!,
              [property]: value,
              newId: property === "id" ? value : prev!.id,
            } as Job)
        );
      }
    },
    [editedJob]
  );

  // HDC
  const handleDataChange = useCallback(
    async (updatedData: JobDetail[]) => {
      await Promise.resolve();

      // Don't generate IDs for empty rows
      const processedData = updatedData.map((detail) => {
        // Check if it's an empty or default row
        const isEmptyOrDefault =
          (!detail.id || detail.id.trim() === "") &&
          (!detail.description || detail.description.trim() === "") &&
          (detail.amount === undefined ||
            detail.amount === null ||
            detail.amount === 0) &&
          (!detail.remark || detail.remark.trim() === "");

        // Return the row as-is without generating an ID if it's empty/default
        if (isEmptyOrDefault) {
          return detail;
        }

        // Only generate ID if the row has content but no ID
        if (!detail.id || detail.id.trim() === "") {
          return {
            ...detail,
            id: `JD${Date.now()}${Math.floor(Math.random() * 1000)
              .toString()
              .padStart(3, "0")}`,
          };
        }

        return detail;
      });

      if (jobType !== "All") {
        const otherTypeDetails = allJobDetails.filter(
          (detail) => detail.type !== jobType
        );
        const mergedData = [...otherTypeDetails, ...processedData];

        setAllJobDetails(mergedData);
        setFilteredJobDetails(processedData);
      } else {
        setAllJobDetails(processedData);
        setFilteredJobDetails(processedData);
      }
    },
    [jobType, allJobDetails]
  );

  const handleDeleteJobDetails = useCallback(
    async (selectedIndices: number[]) => {
      if (!selectedJob) {
        return Promise.resolve();
      }

      // Sort indices in descending order to avoid index shifting issues
      const sortedIndices = selectedIndices.sort((a, b) => b - a);
      const jobDetailsToDeleteFromDB: string[] = [];
      let updatedJobDetails = [...filteredJobDetails];

      // Collect IDs and remove rows
      for (const index of sortedIndices) {
        const jobDetail = updatedJobDetails[index];
        if (!jobDetail) {
          console.warn(`No job detail found at index ${index}`);
          continue;
        }

        // Only add to deletion list if it's a valid database ID
        if (isRowFromDatabase(jobDetail) && jobDetail.id) {
          jobDetailsToDeleteFromDB.push(jobDetail.id);
        }
        updatedJobDetails.splice(index, 1);
      }

      try {
        if (jobDetailsToDeleteFromDB.length > 0) {

          // Send the IDs directly as an array
          await api.delete("/api/job-details", jobDetailsToDeleteFromDB);
          toast.success("Selected job details deleted successfully");
        } else {
          toast.success("Selected rows removed");
        }

        // Update both filtered and all job details
        if (jobType !== "All") {
          const otherTypeDetails = allJobDetails.filter(
            (detail) => detail.type !== jobType
          );
          setAllJobDetails([...otherTypeDetails, ...updatedJobDetails]);
        } else {
          setAllJobDetails(updatedJobDetails);
        }
        setFilteredJobDetails(updatedJobDetails);
        setIsEditing(false);

        return Promise.resolve();
      } catch (error) {
        console.error("Error deleting job details:", error);
        toast.error("Failed to delete job details. Please try again.");

        // Refresh job details from the server in case of error
        await fetchJobDetails(selectedJob.id);
        return Promise.reject(error);
      }
    },
    [
      selectedJob,
      jobType,
      allJobDetails,
      filteredJobDetails,
      isRowFromDatabase,
      fetchJobDetails,
    ]
  );

  return (
    <div className={`relative`}>
      <div className="flex flex-col items-start">
        <div
          className={`w-full text-lg text-center font-medium text-default-700 mb-4`}
        >
          Job Catalogue
        </div>
        <div className={`w-full flex justify-start items-center mb-4`}>
          <div className={`${selectedJob ? "w-54 mr-4" : "w-full max-w-xs"}`}>
            {!isEditing ? (
              <Field>
                <Combobox value={selectedJob} onChange={handleJobSelection}>
                  <div className="relative">
                    <ComboboxInput
                      className="w-full cursor-input rounded-lg border border-default-300 bg-white py-2 pl-4 pr-10 text-left focus:outline-none focus:border-default-500"
                      displayValue={(job: Job | null) => job?.name || ""}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Select a job"
                    />
                    <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                      <IconChevronDown
                        className="h-5 w-5 text-default-400"
                        aria-hidden="true"
                      />
                    </ComboboxButton>
                    <ComboboxOptions className="absolute z-20 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                      <ComboboxOption
                        className={({ active }) =>
                          `relative cursor-pointer select-none rounded py-2 pl-4 pr-12 text-base text-left ${
                            active
                              ? "bg-default-100 text-default-900"
                              : "text-default-900"
                          }`
                        }
                        value={undefined}
                      >
                        + Add Job
                      </ComboboxOption>
                      {jobs.length !== 0 && (
                        <div className="border-t border-default-150 w-full my-1"></div>
                      )}
                      {filteredJobs.length === 0 && query !== "" ? (
                        <div className="relative cursor-default select-none py-2 px-4 text-default-700">
                          No jobs found.
                        </div>
                      ) : (
                        filteredJobs.map((job) => (
                          <div
                            key={job.id}
                            className="relative"
                            onClick={(e) => handleOptionClick(e, job)}
                            onMouseEnter={() => setHoveredJob(job.id)}
                            onMouseLeave={() => setHoveredJob(null)}
                          >
                            <ComboboxOption
                              value={job}
                              className={({ active }) =>
                                `cursor-pointer select-none rounded text-left py-2 pl-4 pr-12 ${
                                  active
                                    ? "bg-default-100 text-default-900"
                                    : "text-default-900"
                                }`
                              }
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
                                  <span className="absolute inset-y-0 right-0 flex items-center mr-3 my-2">
                                    <div className="relative w-6 h-6 flex items-center justify-center">
                                      {selected && (
                                        <IconCheck
                                          className="text-default-600"
                                          stroke={2}
                                          size={22}
                                        />
                                      )}
                                    </div>
                                  </span>
                                </>
                              )}
                            </ComboboxOption>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-2 my-2 z-10">
                              <div className="relative w-8 h-8 flex items-center justify-center">
                                {hoveredJob === job.id && (
                                  <button
                                    onClick={(e) => handleDeleteJob(job, e)}
                                    className="delete-button absolute inset-0 flex items-center justify-center rounded-lg bg-default-100 hover:bg-default-100 active:bg-default-200 focus:outline-none"
                                  >
                                    <IconTrash
                                      className="text-default-700 active:text-default-800"
                                      stroke={1.5}
                                      size={20}
                                    />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </ComboboxOptions>
                  </div>
                </Combobox>
              </Field>
            ) : (
              <>
                <span className="font-semibold">Job name:</span>{" "}
                <input
                  type="text"
                  value={editedJob?.name || ""}
                  onChange={(e) =>
                    handleJobPropertyChange("name", e.target.value)
                  }
                  className="w-48 rounded-lg border border-default-300 bg-white py-2 px-2 text-left focus:outline-none focus:border-default-500"
                />
              </>
            )}
          </div>
          {selectedJob && (
            <div className="flex items-center">
              <div>
                <span className="font-semibold">ID:</span>{" "}
                {isEditing ? (
                  <input
                    type="text"
                    value={editedJob?.id || ""}
                    onChange={(e) =>
                      handleJobPropertyChange("id", e.target.value)
                    }
                    className="w-36 rounded-lg border border-default-300 bg-white py-2 px-2 text-left focus:outline-none focus:border-default-500 mr-4"
                  />
                ) : (
                  <span className="mr-4">{selectedJob.id}</span>
                )}
              </div>
              <div>
                <span className="font-semibold">Section:</span>{" "}
                {isEditing ? (
                  <input
                    type="text"
                    value={editedJob?.section || ""}
                    onChange={(e) =>
                      handleJobPropertyChange("section", e.target.value)
                    }
                    className="w-24 rounded-lg border border-default-300 bg-white py-2 px-2 text-left focus:outline-none focus:border-default-500 mr-4"
                  />
                ) : (
                  <span className="mr-4">{selectedJob.section}</span>
                )}
              </div>
              {isEditing ? (
                <></>
              ) : (
                <div className="flex items-center">
                  {renderJobTypeListbox()}
                </div>
              )}
            </div>
          )}
        </div>
        <NewJobModal
          isOpen={showNewJobModal}
          onClose={handleNewJobModalClose}
          onJobAdded={handleJobAdded}
        />
        <ConfirmationDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onConfirm={confirmDeleteJob}
          title="Delete Job"
          message="Are you sure you want to delete this job? This action cannot be undone."
        />
        {loading ? (
          <div className="mt-40 w-full flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : selectedJob ? (
          <div className="w-full">
            <div className="relative">
              <Table
                initialData={filteredJobDetails}
                columns={jobDetailColumns}
                onShowDeleteButton={() => {}}
                onDelete={handleDeleteJobDetails}
                onChange={handleDataChange}
                isEditing={isEditing}
                onToggleEditing={toggleEditing}
                onSave={handleSave}
                onCancel={handleCancel}
                tableKey="catalogueJob"
              />
              {filteredJobDetails.length === 0 && (
                <p className="mt-4 text-center text-default-700 w-full">
                  No details found.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default JobPage;
