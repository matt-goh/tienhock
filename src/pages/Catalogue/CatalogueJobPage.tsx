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
import NewJobModal from "../../components/NewJobModal";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import toast from "react-hot-toast";
import { API_BASE_URL } from "../../configs/config";

type JobSelection = Job | null;

const CatalogueJobPage: React.FC = () => {
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
      const response = await fetch(`${API_BASE_URL}/api/jobs`);
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const data = await response.json();
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
      const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/details`);
      if (!response.ok) throw new Error("Failed to fetch job details");
      const data = await response.json();
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
      const response = await fetch(`${API_BASE_URL}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newJob),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message);
      }

      const data = await response.json();
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
      const response = await fetch(
        `${API_BASE_URL}/api/jobs/${job.id}/details/count`
      );
      if (!response.ok)
        throw new Error("Failed to check associated job details");
      const { count } = await response.json();

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
      const response = await fetch(
        `${API_BASE_URL}/api/jobs/${jobToDelete.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to delete job");

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

  const isRowFromDatabase = useCallback((jobDetail: JobDetail) => {
    return (
      jobDetail.id !== undefined &&
      jobDetail.id !== null &&
      !jobDetail.id.startsWith("new_")
    );
  }, []);

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
          <ListboxOptions className="absolute z-10 w-full p-1 mt-11 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
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

    // Check for empty job ID
    if (!editedJob.id.trim()) {
      toast.error("Job ID cannot be empty");
      return;
    }

    // Check for duplicate job ID
    const isDuplicateJobId = jobs.some(
      (job) => job.id === editedJob.id && job.id !== selectedJob?.id
    );
    if (isDuplicateJobId) {
      toast.error("A job with this ID already exists");
      return;
    }

    // Check for empty product IDs
    const emptyDetailId = allJobDetails.find((details) => !details.id.trim());
    if (emptyDetailId) {
      toast.error("Detail ID cannot be empty");
      return;
    }

    // Check for duplicate product IDs
    const detailIds = new Set();
    const duplicateDetailId = allJobDetails.find((details) => {
      if (detailIds.has(details.id)) {
        return true;
      }
      detailIds.add(details.id);
      return false;
    });

    if (duplicateDetailId) {
      toast.error(`Duplicate product ID: ${duplicateDetailId.id}`);
      return;
    }

    // Check for changes in the job
    const jobChanged = ["id", "name", "section"].some(
      (key) =>
        selectedJob &&
        editedJob[key as keyof Job] !== selectedJob[key as keyof Job]
    );

    // Check for changes in job details
    const detailsChanged = !_.isEqual(
      allJobDetails.map((detail) => _.omit(detail, ["newId"])),
      originalJobState?.jobDetails.map((detail) => _.omit(detail, ["newId"]))
    );

    // Detect if there are any changes
    const hasChanges = jobChanged || detailsChanged;

    if (!hasChanges) {
      toast("No changes detected");
      setIsEditing(false);
      return;
    }

    try {
      // Update job
      const jobResponse = await fetch(
        `${API_BASE_URL}/api/jobs/${selectedJob?.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editedJob.name,
            section: editedJob.section,
            newId: editedJob.id !== selectedJob?.id ? editedJob.id : undefined,
          }),
        }
      );

      if (!jobResponse.ok) {
        const errorData = await jobResponse.json();
        throw new Error(errorData.message);
      }

      const updatedJob = await jobResponse.json();

      // Send all job details to the server
      const jobDetailsResponse = await fetch(
        `${API_BASE_URL}/api/job-details/batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: updatedJob.job.id,
            jobDetails: allJobDetails.map((jobDetail) => ({
              ...jobDetail,
              newId:
                jobDetail.id !==
                originalJobState?.jobDetails.find((d) => d.id === jobDetail.id)
                  ?.id
                  ? jobDetail.id
                  : undefined,
            })),
          }),
        }
      );

      if (!jobDetailsResponse.ok) {
        const errorData = await jobDetailsResponse.json();
        throw new Error(
          `Failed to update/insert job details: ${errorData.message}`
        );
      }

      const result = await jobDetailsResponse.json();

      // Update local state with the result from the server
      setAllJobDetails(result.jobDetails);
      setFilteredJobDetails(
        jobType === "All"
          ? result.jobDetails
          : result.jobDetails.filter(
              (detail: { type: string }) => detail.type === jobType
            )
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
    (updatedData: JobDetail[]) => {
      const updatedAllJobDetails = allJobDetails.map((detail) => {
        const updatedDetail = updatedData.find((d) => d.id === detail.id);
        return updatedDetail || detail;
      });

      setAllJobDetails(updatedAllJobDetails);
      setFilteredJobDetails(updatedData);
    },
    [allJobDetails]
  );

  const handleDeleteJobDetails = useCallback(
    async (selectedIndices: number[]) => {
      if (!selectedJob) {
        return;
      }

      const sortedIndices = selectedIndices.sort((a, b) => b - a);
      const jobDetailsToDeleteFromDB: string[] = [];
      let updatedJobDetails = [...jobDetails];

      for (const index of sortedIndices) {
        const jobDetail = updatedJobDetails[index];
        if (isRowFromDatabase(jobDetail)) {
          jobDetailsToDeleteFromDB.push(jobDetail.id);
        }
        updatedJobDetails.splice(index, 1);
      }

      // Update local state immediately
      setJobDetails(updatedJobDetails);

      if (jobDetailsToDeleteFromDB.length > 0) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/job-details`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobDetailIds: jobDetailsToDeleteFromDB }),
          });

          if (!response.ok) {
            throw new Error("Failed to delete job details on the server");
          }

          toast.success("Selected job details deleted successfully");
          setIsEditing(false);
        } catch (error) {
          console.error("Error deleting selected job details:", error);
          toast.error(
            "Failed to delete some job details from the server. Please try again."
          );
          // Refresh job details from the server in case of error
          await fetchJobDetails(selectedJob.id);
          return;
        }
      } else {
        toast.success("Selected rows removed");
      }

      // Ensure the Table component is updated with the new data
      handleDataChange(updatedJobDetails);
    },
    [
      selectedJob,
      jobDetails,
      isRowFromDatabase,
      fetchJobDetails,
      handleDataChange,
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
          <p className="mt-4 text-center">Loading...</p>
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

export default CatalogueJobPage;
