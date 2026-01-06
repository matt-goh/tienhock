// src/pages/Catalogue/JobPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  Field,
} from "@headlessui/react";
import {
  IconCheck,
  IconChevronDown,
  IconTrash,
  IconPlus,
  IconChevronLeft,
  IconChevronRight,
  IconPencil,
  IconSearch,
  IconSettings2,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../routes/utils/api";
import { Job, JobPayCodeDetails } from "../../types/types";
import LoadingSpinner from "../../components/LoadingSpinner";
import NewJobModal from "../../components/Catalogue/NewJobModal";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import Button from "../../components/Button";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import NewPayCodeModal from "../../components/Catalogue/NewPayCodeModal";
import EditPayCodeRatesModal from "../../components/Catalogue/EditPayCodeRatesModal";
import AssociateEmployeesWithJobModal from "../../components/Catalogue/AssociateEmployeesWithJobModal";
import BatchManageJobPayCodesModal from "../../components/Catalogue/BatchManageJobPayCodesModal";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useNavigate } from "react-router-dom";

type JobSelection = Job | null;

interface JobDependencyInfo {
  hasDependencies: boolean;
  payCodes: Array<{ id: number; pay_code_id: string; description: string }>;
  locationMappings: Array<{ id: number; location_code: string; location_name: string }>;
  staffs: Array<{ id: string; name: string }>;
  jobDetails: Array<{ job_detail_id: string; description: string }>;
  dailyWorkLogCount: number;
  monthlyWorkLogCount: number;
}

// --- Job Card Component ---
interface JobCardProps {
  job: Job;
  onClick: (job: Job) => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, onClick }) => {
  const sectionDisplay = Array.isArray(job.section)
    ? job.section.join(", ")
    : job.section || "N/A";

  return (
    <button
      onClick={() => onClick(job)}
      className="block w-full p-4 border border-default-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md hover:border-sky-300 dark:hover:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 text-left bg-white dark:bg-gray-800 h-full min-h-[120px]" // Added min-h
    >
      <h3
        className="text-base font-semibold text-default-800 dark:text-gray-100 truncate mb-1"
        title={job.name}
      >
        {job.name}
      </h3>
      <p className="text-xs text-default-500 dark:text-gray-400 uppercase mb-2">ID: {job.id}</p>
      <p
        className="text-sm text-default-600 dark:text-gray-300 line-clamp-2"
        title={sectionDisplay}
      >
        <span className="font-medium">Section:</span> {sectionDisplay}
      </p>
    </button>
  );
};

// --- Main JobPage Component ---
const JobPage: React.FC = () => {
  // --- State ---
  const location = useLocation();
  const navigate = useNavigate();
  const { jobs, loading: loadingJobs, refreshJobs } = useJobsCache();
  const { staffs, loading: loadingStaffs, refreshStaffs } = useStaffsCache();
  const [selectedJob, setSelectedJob] = useState<JobSelection>(null);
  const [query, setQuery] = useState(""); // For job combobox filtering
  const {
    detailedMappings,
    payCodes: availablePayCodes, // Contains default PayCode info
    loading: loadingPayCodeMappings,
    refreshData: refreshPayCodeMappings,
  } = useJobPayCodeMappings();
  const [jobPayCodesDetails, setJobPayCodesDetails] = useState<
    JobPayCodeDetails[]
  >([]);
  const [payCodeSearch, setPayCodeSearch] = useState("");

  // --- Modal States ---
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [showDeleteJobDialog, setShowDeleteJobDialog] = useState(false);
  const [showRemovePayCodeDialog, setShowRemovePayCodeDialog] = useState(false);
  const [jobDependencyInfo, setJobDependencyInfo] = useState<JobDependencyInfo | null>(null);
  const [isCheckingDependencies, setIsCheckingDependencies] = useState(false);
  const [payCodeToRemove, setPayCodeToRemove] =
    useState<JobPayCodeDetails | null>(null); // Store the detail object
  const [showAddPayCodeModal, setShowAddPayCodeModal] = useState(false); // For NewPayCodeModal
  const [showEditRatesModal, setShowEditRatesModal] = useState(false); // For EditPayCodeRatesModal
  const [payCodeDetailToEdit, setPayCodeDetailToEdit] =
    useState<JobPayCodeDetails | null>(null); // Data for edit modal
  const [showAssociateEmployeesModal, setShowAssociateEmployeesModal] =
    useState(false); // For AssociateEmployeesWithJobModal
  const [showBatchManageModal, setShowBatchManageModal] = useState(false); // For BatchManageJobPayCodesModal

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(100); // Can increase this now

  // --- Data Fetching ---
  useEffect(() => {
    if (selectedJob && !loadingPayCodeMappings) {
      const jobPayCodes = detailedMappings[selectedJob.id] || [];
      setJobPayCodesDetails(jobPayCodes);
      setPayCodeSearch(""); // Add this line
    } else {
      setJobPayCodesDetails([]);
      setPayCodeSearch(""); // Add this line
    }
  }, [selectedJob, detailedMappings, loadingPayCodeMappings]);

  // Handle pre-selection from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const jobId = params.get("id");
    const payCodeId = params.get("paycode");

    if (jobId && !loadingJobs && jobs.length > 0) {
      const jobToSelect = jobs.find((job) => job.id === jobId);
      if (jobToSelect && (!selectedJob || selectedJob.id !== jobId)) {
        setSelectedJob(jobToSelect);
      }
    } else if (!jobId && selectedJob) {
      // If there's no jobId in URL but we have a selected job, clear it
      setSelectedJob(null);
    }

    // Set pay code search if parameter exists
    if (payCodeId) {
      setPayCodeSearch(payCodeId);
    }
    // Dependency on jobs.length ensures this runs after jobs are loaded
  }, [location.search, jobs, loadingJobs]);

  // --- Add/Remove Pay Codes ---
  const handleAddPayCodeToJob = async (payCodeId: string) => {
    if (!selectedJob) throw new Error("No job selected"); // Modal should prevent this but safety check

    try {
      await api.post("/api/job-pay-codes", {
        job_id: selectedJob.id,
        pay_code_id: payCodeId,
        is_default: true, // Or determine this differently
      });
      toast.success("Pay code added to job successfully");
      await refreshPayCodeMappings(); // Refresh the general map
    } catch (error: any) {
      console.error("Error adding pay code to job:", error);
      const message =
        error?.response?.data?.message || "Failed to add pay code to job";
      toast.error(message);
      throw new Error(message); // Re-throw for modal error handling if needed
    }
  };

  const handleRemovePayCodeFromJob = async (payCodeId: string) => {
    if (!selectedJob) return;
    try {
      await api.delete(`/api/job-pay-codes/${selectedJob.id}/${payCodeId}`);
      toast.success("Pay code removed from job successfully");
      await refreshPayCodeMappings();
    } catch (error) {
      console.error("Error removing pay code from job:", error);
      toast.error("Failed to remove pay code from job");
    }
  };

  // --- Edit Rates Modal Trigger ---
  const handleEditRatesClick = (detail: JobPayCodeDetails) => {
    setPayCodeDetailToEdit(detail);
    setShowEditRatesModal(true);
  };

  // --- Callback after saving rates ---
  const handleRatesSaved = () => {
    // Refresh the pay code mappings cache
    refreshPayCodeMappings();
  };

  // --- Other Handlers (Job Add/Delete, Confirmations) ---
  const handleJobSelection = useCallback(
    (selection: Job | null | undefined) => {
      if (selection === undefined) {
        setShowAddJobModal(true); // Trigger add job modal from combobox
      } else {
        setSelectedJob(selection);
        setQuery("");
        setCurrentPage(1); // Reset pagination on job change

        // Update URL with selected job ID
        if (selection) {
          navigate(`/catalogue/job?id=${selection.id}`, { replace: true });
        } else {
          navigate(`/catalogue/job`, { replace: true });
        }
      }
    },
    [navigate] // Add navigate to dependencies
  );

  // Handler for clicking the "Add New Job" card/button
  const handleAddJobClickInList = () => {
    setShowAddJobModal(true);
  };

  // Handler for clicking a job card
  const handleJobCardClick = (job: Job) => {
    setSelectedJob(job);
    setCurrentPage(1); // Reset pagination when selecting from card

    // Update URL with selected job ID
    navigate(`/catalogue/job?id=${job.id}`, { replace: true });
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
        const createdJob = response.job;
        if (!createdJob || !createdJob.id)
          throw new Error(response.message || "Failed to add job");

        toast.success("Job added successfully");
        setShowAddJobModal(false);
        await refreshJobs();
        await refreshPayCodeMappings();
        // Select the newly added job
        setSelectedJob({
          ...createdJob,
          section: Array.isArray(createdJob.section)
            ? createdJob.section
            : (createdJob.section || "").split(", ").filter((s: string) => s),
        });
      } catch (error: any) {
        console.error("Error adding job:", error);
        toast.error(error.message || "Failed to add job");
      }
    },
    [refreshJobs, refreshPayCodeMappings]
  );

  const handleDeleteSelectedJobClick = useCallback(async () => {
    if (!selectedJob) return;

    setIsCheckingDependencies(true);
    setJobDependencyInfo(null);

    try {
      const response = await api.get(`/api/jobs/${selectedJob.id}/dependencies`);
      setJobDependencyInfo(response);
    } catch (err) {
      console.error("Error checking dependencies:", err);
      setJobDependencyInfo({
        hasDependencies: false,
        payCodes: [],
        locationMappings: [],
        staffs: [],
        jobDetails: [],
        dailyWorkLogCount: 0,
        monthlyWorkLogCount: 0,
      });
    } finally {
      setIsCheckingDependencies(false);
      setShowDeleteJobDialog(true);
    }
  }, [selectedJob]);

  const handleConfirmRemovePayCode = useCallback(async () => {
    if (!payCodeToRemove || !selectedJob) return;
    await handleRemovePayCodeFromJob(payCodeToRemove.id); // Use id from the stored detail object
    setShowRemovePayCodeDialog(false);
    setPayCodeToRemove(null);
  }, [payCodeToRemove, selectedJob, handleRemovePayCodeFromJob]); // Removed redundant handleRemovePayCodeFromJob from deps

  const confirmDeleteJob = useCallback(async () => {
    if (!selectedJob) return;

    if (jobDependencyInfo?.hasDependencies) {
      toast.error("Cannot delete job with dependencies");
      setShowDeleteJobDialog(false);
      setJobDependencyInfo(null);
      return;
    }

    try {
      await api.delete(`/api/jobs/${selectedJob.id}`);
      toast.success(`Job "${selectedJob.name}" deleted successfully`);
      setShowDeleteJobDialog(false);
      setSelectedJob(null); // Go back to card view
      setJobDependencyInfo(null);

      // Clear the job ID from URL
      navigate(`/catalogue/job`, { replace: true });

      await refreshJobs();
      await refreshPayCodeMappings(); // Ensure mappings are cleared too
    } catch (error) {
      console.error("Error deleting job:", error);
      toast.error("Failed to delete job");
      setShowDeleteJobDialog(false);
    }
  }, [selectedJob, jobDependencyInfo, refreshJobs, refreshPayCodeMappings, navigate]);

  // --- Derived State ---
  const filteredJobs = useMemo(
    () =>
      query === ""
        ? jobs // Use all jobs from cache for combobox filtering
        : jobs.filter((job) =>
            job.name.toLowerCase().includes(query.toLowerCase())
          ),
    [jobs, query]
  );

  const associatedStaff = useMemo(() => {
    if (!selectedJob || !staffs || loadingStaffs) return [];

    return staffs.filter(
      (staff) => Array.isArray(staff.job) && staff.job.includes(selectedJob.id)
    );
  }, [selectedJob, staffs, loadingStaffs]);

  const totalPayCodePages = useMemo(() => {
    // Filter by search term first
    let filtered = jobPayCodesDetails;

    if (payCodeSearch) {
      const searchTerm = payCodeSearch.toLowerCase();
      filtered = filtered.filter(
        (detail) =>
          detail.id.toLowerCase().includes(searchTerm) ||
          detail.description.toLowerCase().includes(searchTerm)
      );
    }

    return Math.ceil(filtered.length / itemsPerPage);
  }, [jobPayCodesDetails, itemsPerPage, payCodeSearch]);

  const paginatedPayCodes = useMemo(() => {
    // First filter by search term
    let filtered = jobPayCodesDetails;

    if (payCodeSearch) {
      const searchTerm = payCodeSearch.toLowerCase();
      filtered = filtered.filter(
        (detail) =>
          detail.id.toLowerCase().includes(searchTerm) ||
          detail.description.toLowerCase().includes(searchTerm)
      );
    }

    // Then apply pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  }, [jobPayCodesDetails, currentPage, itemsPerPage, payCodeSearch]);

  const availablePayCodesToAdd = useMemo(() => {
    if (!selectedJob) return [];
    const assignedIds = new Set(jobPayCodesDetails.map((d) => d.id));
    return availablePayCodes.filter((pc) => !assignedIds.has(pc.id));
  }, [selectedJob, jobPayCodesDetails, availablePayCodes]);

  // --- Helper Function ---
  const getDisplayRate = useCallback(
    (detail: JobPayCodeDetails, type: "biasa" | "ahad" | "umum"): number => {
      const overrideRate = detail[`override_rate_${type}`];
      const defaultRate = detail[`rate_${type}`];
      // Ensure null overrides don't default to 0 if default is also null/undefined
      return overrideRate !== null && typeof overrideRate === "number"
        ? overrideRate
        : defaultRate ?? 0; // Default to 0 if both are null/undefined
    },
    []
  );

  // --- Pagination Component ---
  const Pagination = () => {
    const handleNextPage = () => {
      if (currentPage < totalPayCodePages) setCurrentPage((prev) => prev + 1);
    };
    const handlePrevPage = () => {
      if (currentPage > 1) setCurrentPage((prev) => prev - 1);
    };
    const handlePageChange = (page: number) => setCurrentPage(page);
    const pageNumbers: number[] = [];
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPayCodePages, startPage + 4);
    if (endPage === totalPayCodePages && endPage - 4 > 0)
      startPage = Math.max(1, endPage - 4);
    for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);
    if (totalPayCodePages <= 1) return null;
    return (
      <div className="flex items-center justify-between py-3 border-t border-default-200 dark:border-gray-700 mt-4">
        <div>
          <p className="text-sm text-default-600 dark:text-gray-300">
            Showing{" "}
            <span className="font-medium">
              {(currentPage - 1) * itemsPerPage + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {Math.min(currentPage * itemsPerPage, jobPayCodesDetails.length)}
            </span>{" "}
            of <span className="font-medium">{jobPayCodesDetails.length}</span>{" "}
            results
          </p>
        </div>
        <div>
          <nav
            className="inline-flex rounded-md shadow-sm -space-x-px"
            aria-label="Pagination"
          >
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium ${
                currentPage === 1
                  ? "text-default-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-default-500 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
              }`}
            >
              <IconChevronLeft size={18} />
            </button>
            {startPage > 1 && (
              <>
                <button
                  onClick={() => handlePageChange(1)}
                  className="relative inline-flex items-center px-4 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-default-700 dark:text-gray-200 hover:bg-default-50 dark:hover:bg-gray-700"
                >
                  1
                </button>
                {startPage > 2 && (
                  <span className="relative inline-flex items-center px-2 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-default-500 dark:text-gray-400">
                    ...
                  </span>
                )}
              </>
            )}
            {pageNumbers.map((num) => (
              <button
                key={num}
                onClick={() => handlePageChange(num)}
                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                  currentPage === num
                    ? "z-10 bg-sky-50 dark:bg-sky-900/40 border-sky-500 dark:border-sky-600 text-sky-600 dark:text-sky-300"
                    : "bg-white dark:bg-gray-800 border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:bg-default-50 dark:hover:bg-gray-700"
                }`}
              >
                {num}
              </button>
            ))}
            {endPage < totalPayCodePages && (
              <>
                {endPage < totalPayCodePages - 1 && (
                  <span className="relative inline-flex items-center px-2 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-default-500 dark:text-gray-400">
                    ...
                  </span>
                )}
                <button
                  onClick={() => handlePageChange(totalPayCodePages)}
                  className="relative inline-flex items-center px-4 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-default-700 dark:text-gray-200 hover:bg-default-50 dark:hover:bg-gray-700"
                >
                  {totalPayCodePages}
                </button>
              </>
            )}
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPayCodePages}
              className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium ${
                currentPage === totalPayCodePages
                  ? "text-default-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-default-500 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
              }`}
            >
              <IconChevronRight size={18} />
            </button>
          </nav>
        </div>
      </div>
    );
  };

  // --- Main Render ---
  return (
    <div className="space-y-4">
      {/* --- Header: Only show centered when no job selected --- */}
      {!selectedJob && (
        <h1 className="text-center text-xl font-semibold text-default-800 dark:text-gray-100">
          Job & Pay Codes
        </h1>
      )}

      {/* --- Conditional Rendering: Show Cards or Detail View --- */}
      {!selectedJob && !loadingJobs && (
        <>
          {/* --- Job Card Grid --- */}
          <div className="mb-6 text-center">
            <h2 className="text-lg font-medium text-default-500 dark:text-gray-400 mb-4 -mt-2">
              Select a Job to Manage Pay Codes
            </h2>
          </div>
          <div className="max-h-[calc(100vh-180px)] overflow-y-auto pb-4 pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-2">
              {/* Add New Job Card */}
              <button
                onClick={handleAddJobClickInList}
                className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-sky-400 dark:border-sky-500 rounded-lg text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors duration-150 h-full min-h-[120px]" // Added min-h
                aria-label="Add New Job"
              >
                <IconPlus size={32} className="mb-2" />
                <span className="text-sm font-medium">Add New Job</span>
              </button>
              {/* Job Cards */}
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} onClick={handleJobCardClick} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* --- Loading State --- */}
      {loadingJobs && !selectedJob && (
        <div className="flex justify-center items-center h-40">
          <LoadingSpinner />
          <span className="ml-3 text-default-600 dark:text-gray-300">Loading jobs...</span>
        </div>
      )}

      {/* --- Detail View (Job Selected) --- */}
      {selectedJob && (
        <>
          {/* --- Job Selection Combobox and Info (Only shows after selection) --- */}
          <div className="mb-4 flex flex-col md:flex-row md:items-center gap-4 rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
            <div className="md:flex-shrink-0">
              {/* Existing Job Combobox */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleJobSelection(null)}
                  className="flex items-center gap-1 text-default-600 dark:text-gray-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors pb-1.5"
                  title="Back to job list"
                >
                  <IconChevronLeft size={20} />
                  <span className="text-sm font-medium">Back</span>
                </button>
                <span className="text-default-300 dark:text-gray-600 pb-1.5">|</span>
                <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100 pb-1.5">
                  Job & Pay Codes
                </h1>
                <span className="text-default-300 dark:text-gray-600 pb-1.5">|</span>
                <div>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                    Select Job
                  </label>
                  <Field className="w-64">
                  <Combobox value={selectedJob} onChange={handleJobSelection}>
                  <div className="relative">
                    <ComboboxInput
                      className="w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-1.5 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm dark:text-gray-100"
                      displayValue={(job: Job | null) => job?.name || ""}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Select or search..."
                      autoComplete="off"
                    />
                    <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                      <IconChevronDown size={20} className="text-gray-400" />
                    </ComboboxButton>
                  </div>
                  {/* Make options appear above other elements */}
                  <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-64 overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                    <ComboboxOption
                      className={({ active }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                          active ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200" : "text-gray-900 dark:text-gray-100"
                        }`
                      }
                      value={undefined} // Triggers Add New Job
                    >
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                        <IconPlus size={18} />
                      </span>
                      Add New Job
                    </ComboboxOption>
                    {(filteredJobs.length > 0 || loadingJobs) && (
                      <hr className="my-1 border-default-200 dark:border-gray-600" />
                    )}
                    {loadingJobs && (
                      <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-200">
                        Loading jobs...
                      </div>
                    )}
                    {!loadingJobs &&
                      filteredJobs.length === 0 &&
                      query !== "" && (
                        <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-200">
                          No jobs found.
                        </div>
                      )}
                    {!loadingJobs &&
                      filteredJobs.map((job) => (
                        <ComboboxOption
                          key={job.id}
                          className={({ active }) =>
                            `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                              active
                                ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
                                : "text-gray-900 dark:text-gray-100"
                            }`
                          }
                          value={job}
                        >
                          {(
                            { selected: isSelected } // Renamed `selected` to avoid conflict
                          ) => (
                            <>
                              <span
                                className={`block truncate ${
                                  isSelected ? "font-medium" : "font-normal"
                                }`}
                              >
                                {job.name}
                              </span>
                              {isSelected && (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                                  <IconCheck size={20} />
                                </span>
                              )}
                            </>
                          )}
                        </ComboboxOption>
                      ))}
                  </ComboboxOptions>
                </Combobox>
              </Field>
                </div>
              </div>
            </div>

            {/* Selected Job Info & Delete Button */}
            <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex flex-wrap gap-4 flex-1">
                <div className="rounded-lg bg-default-50 dark:bg-gray-900/50 px-4 py-2 border border-default-200 dark:border-gray-700">
                  <p className="text-xs uppercase text-default-500 dark:text-gray-400 font-medium">
                    ID
                  </p>
                  <p className="text-default-800 dark:text-gray-100 font-semibold">
                    {selectedJob.id}
                  </p>
                </div>
                <div className="rounded-lg bg-default-50 dark:bg-gray-900/50 px-4 py-2 border border-default-200 dark:border-gray-700">
                  <p className="text-xs uppercase text-default-500 dark:text-gray-400 font-medium">
                    Section
                  </p>
                  <p
                    className="text-default-800 dark:text-gray-100 font-semibold max-w-xs truncate"
                    title={
                      Array.isArray(selectedJob.section)
                        ? selectedJob.section.join(", ")
                        : selectedJob.section || "N/A"
                    }
                  >
                    {Array.isArray(selectedJob.section)
                      ? selectedJob.section.join(", ")
                      : selectedJob.section || "N/A"}
                  </p>
                </div>
                <div className="rounded-lg bg-default-50 dark:bg-gray-900/50 px-4 py-2 border border-default-200 dark:border-gray-700">
                  <p className="text-xs uppercase text-default-500 dark:text-gray-400 font-medium">
                    Name
                  </p>
                  <p className="text-default-800 dark:text-gray-100 font-semibold">
                    {selectedJob.name}
                  </p>
                </div>
              </div>
              <div className="md:ml-auto mt-3 md:mt-0">
                <Button
                  onClick={handleDeleteSelectedJobClick}
                  variant="outline"
                  color="rose"
                  size="sm"
                  icon={IconTrash}
                >
                  Delete Job
                </Button>
              </div>
            </div>
          </div>

          {/* --- Staff Section --- */}
          {selectedJob && (
            <div className="mb-4 rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-default-700 dark:text-gray-200">
                  Staff Associated with this Job:
                </h3>
                <Button
                  onClick={() => setShowAssociateEmployeesModal(true)}
                  color="sky"
                  variant="outline"
                  size="sm"
                  icon={IconPencil}
                >
                  Manage Staff
                </Button>
              </div>
              {loadingStaffs ? (
                <div className="flex items-center justify-center py-2">
                  <LoadingSpinner size="sm" />
                </div>
              ) : associatedStaff.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {associatedStaff.map((staff) => (
                    <Link
                      key={staff.id}
                      to={`/catalogue/staff/${staff.id}`}
                      className="inline-flex items-center rounded-full bg-sky-100 dark:bg-sky-900/40 px-3 py-1 text-sm font-medium text-sky-800 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/60 transition-colors"
                    >
                      {staff.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-default-500 dark:text-gray-400">
                  No staff associated with this job
                </p>
              )}
            </div>
          )}

          {/* --- Pay Codes Section (Only shows after selection) --- */}
          <div className="rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
            {/* Header + Add Button + Search */}
            <div className="mb-4 flex flex-col items-center justify-between gap-4 md:flex-row">
              <h2 className="text-lg font-semibold text-default-800 dark:text-gray-100">
                Pay Codes for "{selectedJob.name}"
              </h2>
              <div className="flex items-center gap-3">
                {/* Search Input */}
                <div className="relative">
                  <IconSearch
                    className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400"
                    stroke={1.5}
                  />
                  <input
                    type="text"
                    placeholder="Search pay codes..."
                    className="w-64 rounded-full border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    value={payCodeSearch}
                    onChange={(e) => {
                      setPayCodeSearch(e.target.value);
                      setCurrentPage(1); // Reset to first page when searching
                    }}
                  />
                  {payCodeSearch && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
                      onClick={() => setPayCodeSearch("")}
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Batch Manage Button */}
                <Button
                  onClick={() => setShowBatchManageModal(true)}
                  color="sky"
                  variant="outline"
                  icon={IconSettings2}
                  size="md"
                  disabled={!selectedJob}
                >
                  Batch Manage
                </Button>

                {/* Add Pay Code Button */}
                <Button
                  onClick={() => setShowAddPayCodeModal(true)}
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

            {/* Table */}
            {loadingPayCodeMappings ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                  <thead className="bg-default-100 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                        Unit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                        Biasa Rate
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                        Ahad Rate
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                        Umum Rate
                      </th>
                      <th className="w-28 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {paginatedPayCodes.length > 0 ? (
                      paginatedPayCodes.map((detail) => {
                        const displayBiasa = getDisplayRate(detail, "biasa");
                        const displayAhad = getDisplayRate(detail, "ahad");
                        const displayUmum = getDisplayRate(detail, "umum");
                        return (
                          <tr
                            key={detail.id} // Assuming detail.id is the pay code id
                            className="hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer"
                            onClick={() => handleEditRatesClick(detail)}
                          >
                            {/* Static Columns */}
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700 dark:text-gray-200">
                              {detail.id}
                            </td>
                            <td
                              className="px-4 py-3 text-sm text-default-700 dark:text-gray-200 max-w-xs truncate"
                              title={detail.description}
                            >
                              <Link
                                to={`/catalogue/pay-codes?desc=${detail.pay_code_id}`}
                                className="hover:text-sky-600 dark:text-sky-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {detail.description}
                              </Link>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700 dark:text-gray-200">
                              {detail.pay_type}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700 dark:text-gray-200">
                              {detail.rate_unit}
                            </td>
                            {/* Read-only Rate Columns */}
                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700 dark:text-gray-200">
                              <span>{displayBiasa.toFixed(2)}</span>
                              {detail.override_rate_biasa !== null && (
                                <span
                                  className="ml-1 text-xs text-sky-600 dark:text-sky-400"
                                  title="Override"
                                >
                                  (O)
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700 dark:text-gray-200">
                              <span>{displayAhad.toFixed(2)}</span>
                              {detail.override_rate_ahad !== null && (
                                <span
                                  className="ml-1 text-xs text-sky-600 dark:text-sky-400"
                                  title="Override"
                                >
                                  (O)
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700 dark:text-gray-200">
                              <span>{displayUmum.toFixed(2)}</span>
                              {detail.override_rate_umum !== null && (
                                <span
                                  className="ml-1 text-xs text-sky-600 dark:text-sky-400"
                                  title="Override"
                                >
                                  (O)
                                </span>
                              )}
                            </td>
                            {/* Action Buttons */}
                            <td className="whitespace-nowrap px-4 py-3 text-center text-sm">
                              <div className="flex items-center justify-center space-x-2">
                                {/* Edit button inside the clickable row */}
                                <button
                                  className="text-sky-600 dark:text-sky-400 hover:text-sky-800"
                                  title="Edit Rates"
                                  // onClick is handled by the <tr> now
                                >
                                  <IconPencil size={18} />
                                </button>
                                {/* Remove button needs stopPropagation */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent row click
                                    setPayCodeToRemove(detail);
                                    setShowRemovePayCodeDialog(true);
                                  }}
                                  className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"
                                  title="Remove Pay Code"
                                >
                                  <IconTrash size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                        >
                          No pay codes assigned to this job.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {/* Pagination */}
            <Pagination />
          </div>
        </>
      )}

      {/* --- Modals --- */}
      <NewJobModal
        isOpen={showAddJobModal}
        onClose={() => setShowAddJobModal(false)}
        onJobAdded={handleJobAdded}
      />
      <NewPayCodeModal
        isOpen={showAddPayCodeModal}
        onClose={() => setShowAddPayCodeModal(false)}
        job={selectedJob} // Pass the currently selected job
        availablePayCodesToAdd={availablePayCodesToAdd}
        onPayCodeAdded={handleAddPayCodeToJob}
      />
      <EditPayCodeRatesModal
        isOpen={showEditRatesModal}
        onClose={() => setShowEditRatesModal(false)}
        jobId={selectedJob?.id ?? ""} // Pass selected job ID
        jobName={selectedJob?.name}
        payCodeDetail={payCodeDetailToEdit} // Pass the detail for editing
        onRatesSaved={handleRatesSaved} // Pass callback to refresh data
      />
      <AssociateEmployeesWithJobModal
        isOpen={showAssociateEmployeesModal}
        onClose={() => setShowAssociateEmployeesModal(false)}
        job={selectedJob}
        availableEmployees={staffs}
        currentEmployeeIds={associatedStaff.map((s) => s.id)}
        onAssociationComplete={async () => {
          await refreshStaffs(); // Refresh staffs cache to reflect the changes
        }}
      />
      <BatchManageJobPayCodesModal
        isOpen={showBatchManageModal}
        onClose={() => setShowBatchManageModal(false)}
        job={selectedJob}
        allPayCodes={availablePayCodes}
        currentPayCodeDetails={jobPayCodesDetails}
        onComplete={async () => {
          await refreshPayCodeMappings();
        }}
      />

      {/* --- Dialogs --- */}
      <ConfirmationDialog
        isOpen={showDeleteJobDialog}
        onClose={() => {
          setShowDeleteJobDialog(false);
          setJobDependencyInfo(null);
        }}
        onConfirm={
          jobDependencyInfo?.hasDependencies
            ? () => {
                setShowDeleteJobDialog(false);
                setJobDependencyInfo(null);
              }
            : confirmDeleteJob
        }
        title={jobDependencyInfo?.hasDependencies ? "Cannot Delete Job" : "Delete Job"}
        message={
          isCheckingDependencies ? (
            <div className="flex items-center gap-2">
              <LoadingSpinner />
              <span>Checking dependencies...</span>
            </div>
          ) : jobDependencyInfo?.hasDependencies ? (
            <div className="space-y-2">
              <p className="text-rose-600 dark:text-rose-400 font-medium text-sm">
                This job has dependencies:
              </p>
              {jobDependencyInfo.payCodes.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    Pay Codes ({jobDependencyInfo.payCodes.length}):
                  </span>{" "}
                  <span className="text-default-600 dark:text-gray-400">
                    {jobDependencyInfo.payCodes.slice(0, 3).map(pc => pc.pay_code_id).join(", ")}
                    {jobDependencyInfo.payCodes.length > 3 && ` +${jobDependencyInfo.payCodes.length - 3} more`}
                  </span>
                </div>
              )}
              {jobDependencyInfo.locationMappings.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    Location Mappings ({jobDependencyInfo.locationMappings.length}):
                  </span>{" "}
                  <span className="text-default-600 dark:text-gray-400">
                    {jobDependencyInfo.locationMappings.slice(0, 3).map(lm => lm.location_name || lm.location_code).join(", ")}
                    {jobDependencyInfo.locationMappings.length > 3 && ` +${jobDependencyInfo.locationMappings.length - 3} more`}
                  </span>
                </div>
              )}
              {jobDependencyInfo.staffs.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    Staff ({jobDependencyInfo.staffs.length}):
                  </span>{" "}
                  <span className="text-default-600 dark:text-gray-400">
                    {jobDependencyInfo.staffs.slice(0, 3).map(s => s.name).join(", ")}
                    {jobDependencyInfo.staffs.length > 3 && ` +${jobDependencyInfo.staffs.length - 3} more`}
                  </span>
                </div>
              )}
              {jobDependencyInfo.jobDetails.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    Job Details ({jobDependencyInfo.jobDetails.length}):
                  </span>{" "}
                  <span className="text-default-600 dark:text-gray-400">
                    {jobDependencyInfo.jobDetails.slice(0, 3).map(jd => jd.description || jd.job_detail_id).join(", ")}
                    {jobDependencyInfo.jobDetails.length > 3 && ` +${jobDependencyInfo.jobDetails.length - 3} more`}
                  </span>
                </div>
              )}
              {(jobDependencyInfo.dailyWorkLogCount > 0 || jobDependencyInfo.monthlyWorkLogCount > 0) && (
                <div className="text-sm">
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    Work Logs:
                  </span>{" "}
                  <span className="text-default-600 dark:text-gray-400">
                    {jobDependencyInfo.dailyWorkLogCount > 0 && `${jobDependencyInfo.dailyWorkLogCount} daily`}
                    {jobDependencyInfo.dailyWorkLogCount > 0 && jobDependencyInfo.monthlyWorkLogCount > 0 && ", "}
                    {jobDependencyInfo.monthlyWorkLogCount > 0 && `${jobDependencyInfo.monthlyWorkLogCount} monthly`}
                  </span>
                </div>
              )}
              <p className="text-xs text-default-500 dark:text-gray-400 mt-1">
                Remove dependencies before deleting.
              </p>
            </div>
          ) : (
            `Are you sure you want to delete the job "${selectedJob?.name ?? ""}"? This action cannot be undone.`
          )
        }
        confirmButtonText={jobDependencyInfo?.hasDependencies ? "OK" : "Delete"}
        variant={jobDependencyInfo?.hasDependencies ? "default" : "danger"}
        hideCancelButton={jobDependencyInfo?.hasDependencies}
      />
      <ConfirmationDialog
        isOpen={showRemovePayCodeDialog}
        onClose={() => setShowRemovePayCodeDialog(false)}
        onConfirm={handleConfirmRemovePayCode}
        title="Remove Pay Code"
        message={`Are you sure you want to remove pay code "${
          payCodeToRemove?.id || ""
        }" (${
          payCodeToRemove?.description || ""
        }) from this job? Any specific rate overrides for this job will be lost.`}
        variant="danger"
      />
    </div>
  );
};

export default JobPage;
