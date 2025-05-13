// src/pages/Catalogue/PayCodePage.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconChevronLeft,
  IconChevronRight,
  IconLink,
  IconUser,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import toast from "react-hot-toast";
import { useLocation } from "react-router-dom";

import { api } from "../../routes/utils/api";
import { PayCode, Employee } from "../../types/types"; // Type updated to exclude 'code'
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import PayCodeModal from "../../components/Catalogue/PayCodeModal"; // Imports the updated modal
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import AssociatePayCodesWithJobsModal from "../../components/Catalogue/AssociatePayCodesWithJobsModal";
import AssociatePayCodesWithEmployeesModal from "../../components/Catalogue/AssociatePayCodesWithEmployeesModal";
import JobsAndEmployeesUsingPayCodeTooltip from "../../components/Catalogue/JobsAndEmployeesUsingPayCodeTooltip";

const PayCodePage: React.FC = () => {
  const location = useLocation();
  // State
  const [filteredCodes, setFilteredCodes] = useState<PayCode[]>([]);
  const [selectedType, setSelectedType] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJob, setSelectedJob] = useState<string>("All");

  // Hooks for data and caching
  const {
    detailedMappings,
    employeeMappings,
    payCodes,
    loading: loadingPayCodesData,
    refreshData: refreshPayCodeMappings,
  } = useJobPayCodeMappings();
  const { jobs, loading: loadingJobs } = useJobsCache();
  const { staffs: allEmployees, loading: loadingEmployees } = useStaffsCache();
  const [codeToAssociate, setCodeToAssociate] = useState<PayCode | null>(null);
  const [payCodeToAssociateWithEmployees, setPayCodeToAssociateWithEmployees] =
    useState<PayCode | null>(null);

  const loading = loadingPayCodesData || loadingJobs;

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [codeToEdit, setCodeToEdit] = useState<PayCode | null>(null); // Holds PayCode object (without 'code')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState<PayCode | null>(null); // Holds PayCode object (without 'code')
  const [showAssociateModal, setShowAssociateModal] = useState(false);
  const [showAssociateEmployeesModal, setShowAssociateEmployeesModal] =
    useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);

  // Pay type options
  const payTypeOptions: string[] = ["All", "Base", "Tambahan", "Overtime"]; // Add more if needed

  // Refs for pagination reset logic
  const selectedTypeRef = useRef(selectedType);
  const selectedJobRef = useRef(selectedJob);
  const searchTermRef = useRef(searchTerm);

  // --- Filtering Logic (Search ID and Description) ---
  useEffect(() => {
    if (loading) return;
    let filtered = [...payCodes];
    if (selectedType !== "All")
      filtered = filtered.filter((pc) => pc.pay_type === selectedType);
    if (selectedJob !== "All") {
      const payCodeIds = (detailedMappings[selectedJob] || []).map((d) => d.id);
      filtered =
        payCodeIds.length > 0
          ? filtered.filter((pc) => payCodeIds.includes(pc.id))
          : [];
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (pc) =>
          (pc.id?.toLowerCase() || "").includes(term) ||
          (pc.description?.toLowerCase() || "").includes(term)
      );
    }
    setFilteredCodes(filtered);

    // Reset page logic (using refs)
    if (
      selectedType !== selectedTypeRef.current ||
      selectedJob !== selectedJobRef.current ||
      (searchTerm === "" && searchTermRef.current !== "")
    ) {
      setCurrentPage(1);
    }
    selectedTypeRef.current = selectedType;
    selectedJobRef.current = selectedJob;
    searchTermRef.current = searchTerm;
  }, [
    payCodes,
    selectedType,
    selectedJob,
    searchTerm,
    detailedMappings,
    loading,
  ]);

  // Initialization effect to set search from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idParam = params.get("desc");
    if (idParam) {
      setSearchTerm(idParam);
    }
  }, [location.search]);

  // --- Derived State ---
  const payCodeToJobsMap = useMemo(() => {
    // Create reverse mapping: payCodeId -> jobIds[]
    const reverseMap: Record<string, string[]> = {};

    // Go through each job in the detailed mappings
    Object.entries(detailedMappings).forEach(([jobId, payCodeDetails]) => {
      // For each pay code used by this job
      payCodeDetails.forEach((detail) => {
        const payCodeId = detail.id;
        if (!reverseMap[payCodeId]) {
          reverseMap[payCodeId] = [];
        }
        reverseMap[payCodeId].push(jobId);
      });
    });

    return reverseMap;
  }, [detailedMappings]);

  const payCodeToEmployeesMap = useMemo(() => {
    // Create reverse mapping: payCodeId -> employeeIds[]
    const reverseMap: Record<string, string[]> = {};

    // Go through each employee in the employee mappings
    Object.entries(employeeMappings).forEach(([employeeId, payCodeDetails]) => {
      // For each pay code used by this employee
      payCodeDetails.forEach((detail) => {
        const payCodeId = detail.id;
        if (!reverseMap[payCodeId]) {
          reverseMap[payCodeId] = [];
        }
        reverseMap[payCodeId].push(employeeId);
      });
    });

    return reverseMap;
  }, [employeeMappings]);

  const paginatedCodes = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCodes.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCodes, currentPage, itemsPerPage]);
  const totalPages = useMemo(
    () => Math.ceil(filteredCodes.length / itemsPerPage),
    [filteredCodes.length, itemsPerPage]
  );

  // --- Helper Functions ---
  const getAssociatedJobIds = (payCodeId: string): string[] => {
    return Object.entries(detailedMappings)
      .filter(([_jobId, details]) =>
        details.some((detail) => detail.id === payCodeId)
      )
      .map(([jobId]) => jobId);
  };

  const getAssociatedEmployeeIds = (payCodeId: string): string[] => {
    const associatedEmployees: string[] = [];
    Object.entries(employeeMappings).forEach(([employeeId, payCodeDetails]) => {
      if (payCodeDetails.some((detail) => detail.id === payCodeId)) {
        associatedEmployees.push(employeeId);
      }
    });
    return associatedEmployees;
  };

  // --- Handlers ---
  const handleAddClick = () => {
    setCodeToEdit(null);
    setShowAddModal(true);
  };

  const handleEditClick = (pc: PayCode) => {
    setCodeToEdit(pc);
    setShowAddModal(true);
  };

  const handleAssociateWithJobs = (pc: PayCode) => {
    setCodeToAssociate(pc);
    setShowAssociateModal(true);
  };

  const handleAssociateWithEmployees = (payCode: PayCode) => {
    setPayCodeToAssociateWithEmployees(payCode);
    setShowAssociateEmployeesModal(true);
  };

  const handleSavePayCode = async (payCodeData: PayCode) => {
    if (!payCodeData.id) {
      toast.error("ID Missing");
      throw new Error("ID Missing");
    }
    try {
      if (codeToEdit) {
        // Use codeToEdit state to know if it's an update
        await api.put(`/api/pay-codes/${payCodeData.id}`, payCodeData);
        toast.success("Pay code updated successfully");
      } else {
        await api.post("/api/pay-codes", payCodeData);
        toast.success("Pay code created successfully");
      }
      setShowAddModal(false);
      setCodeToEdit(null);
      await refreshPayCodeMappings(); // Refresh cache (includes payCodes list)
    } catch (error: any) {
      console.error("Error saving pay code:", error);
      throw new Error(error.message || "Failed to save."); // Re-throw for modal error display
    }
  };

  const handleDeleteClick = (pc: PayCode) => {
    if (!pc || !pc.id) {
      toast.error("Invalid pay code data.");
      return;
    }
    const isInUse = Object.values(detailedMappings).some((details) =>
      details.some((d) => d.id === pc.id)
    );
    const displayName = pc.description || pc.id;
    if (isInUse) {
      toast.error(
        `Cannot delete: Pay code "${displayName}" is used in job assignments.`
      );
      return;
    }
    setCodeToDelete(pc);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!codeToDelete || !codeToDelete.id) {
      toast.error("Invalid ID for deletion.");
      setShowDeleteDialog(false);
      setCodeToDelete(null);
      return;
    }
    try {
      await api.delete(`/api/pay-codes/${codeToDelete.id}`);
      toast.success("Pay code deleted successfully");
      setShowDeleteDialog(false);
      setCodeToDelete(null);
      await refreshPayCodeMappings(); // Refresh cache
    } catch (error: any) {
      console.error("Error deleting pay code:", error);
      toast.error(
        error?.response?.data?.message || error.message || "Failed to delete."
      );
      setShowDeleteDialog(false);
      setCodeToDelete(null);
    }
  };

  // --- Render Functions (Filters, Pagination) ---
  const renderJobFilter = () => (
    <div className="flex items-center space-x-2">
      <span className="font-semibold text-sm text-default-700">Job:</span>
      <Listbox value={selectedJob} onChange={setSelectedJob}>
        <div className="relative">
          <ListboxButton className="relative w-48 cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm">
            <span className="block truncate">
              {selectedJob === "All"
                ? "All Jobs"
                : jobs.find((j: { id: string }) => j.id === selectedJob)
                    ?.name || selectedJob}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown size={20} className="text-gray-400" />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            <ListboxOption
              value="All"
              className={({ active }) =>
                `relative cursor-default select-none py-2 pl-10 pr-4 ${
                  active ? "bg-sky-100 text-sky-900" : "text-gray-900"
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
                    All Jobs
                  </span>
                  {selected && (
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                      <IconCheck size={20} />
                    </span>
                  )}
                </>
              )}
            </ListboxOption>
            {loadingJobs ? (
              <div className="py-2 px-4 text-gray-500 italic text-sm">
                Loading jobs...
              </div>
            ) : (
              jobs.map(
                (job: {
                  id: unknown;
                  name:
                    | string
                    | number
                    | boolean
                    | React.ReactElement<
                        any,
                        string | React.JSXElementConstructor<any>
                      >
                    | Iterable<React.ReactNode>
                    | React.ReactPortal
                    | null
                    | undefined;
                }) => (
                  <ListboxOption
                    key={String(job.id)} // Ensure key is a string
                    className={({ active }) =>
                      `relative cursor-default select-none py-2 pl-10 pr-4 ${
                        active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                      }`
                    }
                    value={job.id}
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
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                            <IconCheck size={20} />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                )
              )
            )}
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );

  const renderPayTypeFilter = () => (
    <div className="flex items-center space-x-2">
      <span className="font-semibold text-sm text-default-700">Type:</span>
      <Listbox value={selectedType} onChange={setSelectedType}>
        <div className="relative">
          <ListboxButton className="relative w-40 cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm">
            <span className="block truncate">{selectedType}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown size={20} className="text-gray-400" />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {payTypeOptions.map((type) => (
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
                    {selected && (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                        <IconCheck size={20} />
                      </span>
                    )}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );

  const Pagination = () => {
    const handleNextPage = () => {
      if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
    };
    const handlePrevPage = () => {
      if (currentPage > 1) setCurrentPage((prev) => prev - 1);
    };
    const handlePageChange = (page: number) => setCurrentPage(page);
    const pageNumbers: number[] = [];
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage === totalPages && endPage - 4 > 0)
      startPage = Math.max(1, endPage - 4);
    for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);

    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between py-3 border-t border-default-200 mt-4">
        <div>
          <p className="text-sm text-default-600">
            Showing{" "}
            <span className="font-medium">
              {(currentPage - 1) * itemsPerPage + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {Math.min(currentPage * itemsPerPage, filteredCodes.length)}
            </span>{" "}
            of <span className="font-medium">{filteredCodes.length}</span>{" "}
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
              className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-default-300 bg-white text-sm font-medium ${
                currentPage === 1
                  ? "text-default-300 cursor-not-allowed"
                  : "text-default-500 hover:bg-default-50"
              }`}
            >
              <IconChevronLeft size={18} />
            </button>
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
            {pageNumbers.map((num) => (
              <button
                key={num}
                onClick={() => handlePageChange(num)}
                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                  currentPage === num
                    ? "z-10 bg-sky-50 border-sky-500 text-sky-600"
                    : "bg-white border-default-300 text-default-700 hover:bg-default-50"
                }`}
              >
                {num}
              </button>
            ))}
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
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-default-300 bg-white text-sm font-medium ${
                currentPage === totalPages
                  ? "text-default-300 cursor-not-allowed"
                  : "text-default-500 hover:bg-default-50"
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
    <div className="relative w-full px-4 md:mx-6 -mt-8">
      {/* Header */}
      <div className="mb-4 flex flex-col items-center justify-between gap-4 md:flex-row">
        <h1 className="text-xl font-semibold text-default-800">Pay Code</h1>
        <div className="flex w-full flex-col items-center justify-end gap-4 md:w-auto md:flex-row">
          {renderPayTypeFilter()}
          {renderJobFilter()}
          {/* Search Input - Updated placeholder */}
          <div className="relative w-full md:w-64">
            <IconSearch
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search ID or description..." // Updated placeholder
              className="w-full rounded-full border border-default-300 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 hover:text-default-700"
                onClick={() => setSearchTerm("")}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <Button
            onClick={handleAddClick}
            color="sky"
            variant="filled"
            icon={IconPlus}
            iconPosition="left"
            size="md"
            className="w-full md:w-auto"
          >
            Add Pay Code
          </Button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex justify-center my-20">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Table - Removed Code Column, Added ID Column */}
          <div className="overflow-x-auto rounded-lg border border-default-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 max-w-sm">
                    Description
                  </th>
                  {selectedType === "All" && (
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                      Type
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 min-w-[110px]">
                    Biasa Rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 min-w-[110px]">
                    Ahad Rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 min-w-[110px]">
                    Umum Rate
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Active
                  </th>
                  <th className="w-28 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200 bg-white">
                {paginatedCodes.length > 0 ? (
                  paginatedCodes.map(
                    (
                      pc // Use pc for pay code item
                    ) => (
                      <tr
                        key={pc.id}
                        className="hover:bg-default-50 cursor-pointer"
                        onClick={() => handleEditClick(pc)}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-500 flex items-center">
                          {pc.id}
                          <JobsAndEmployeesUsingPayCodeTooltip
                            payCodeId={pc.id}
                            jobsMap={payCodeToJobsMap}
                            jobsList={jobs}
                            employeesMap={payCodeToEmployeesMap}
                            employeesList={allEmployees.map((e) => ({
                              id: e.id,
                              name: e.name,
                            }))}
                            className="ml-1"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-default-700 max-w-sm truncate">
                          {pc.description}
                        </td>
                        {selectedType === "All" && (
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                            {pc.pay_type}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                          {pc.rate_unit}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700 min-w-[110px]">
                          {Number(pc.rate_biasa || 0).toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700 min-w-[110px]">
                          {Number(pc.rate_ahad || 0).toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700 min-w-[110px]">
                          {Number(pc.rate_umum || 0).toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-default-700">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              pc.is_active
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {pc.is_active ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center text-sm">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(pc);
                              }}
                              className="text-sky-600 hover:text-sky-800"
                              title="Edit"
                            >
                              <IconPencil size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAssociateWithJobs(pc);
                              }}
                              className="text-amber-600 hover:text-amber-800"
                              title="Link to Jobs"
                            >
                              <IconLink size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAssociateWithEmployees(pc);
                              }}
                              className="text-emerald-600 hover:text-emerald-800"
                              title="Link to Employees"
                            >
                              <IconUser size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(pc);
                              }}
                              className="text-rose-600 hover:text-rose-800"
                              title="Delete"
                            >
                              <IconTrash size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )
                ) : (
                  // Adjusted colspan
                  <tr>
                    <td
                      colSpan={selectedType === "All" ? 8 : 7}
                      className="px-6 py-10 text-center text-sm text-default-500"
                    >
                      {filteredCodes.length === 0 &&
                      searchTerm === "" &&
                      selectedType === "All" &&
                      selectedJob === "All"
                        ? "No pay codes found. Create one."
                        : "No pay codes match filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <Pagination />
        </>
      )}

      {/* Modals & Dialogs */}
      <PayCodeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSavePayCode}
        initialData={codeToEdit}
        existingPayCodes={payCodes} // Pass full list for ID check
      />
      {/* Associate with Jobs Modal */}
      <AssociatePayCodesWithJobsModal
        isOpen={showAssociateModal}
        onClose={() => setShowAssociateModal(false)}
        payCode={codeToAssociate}
        availableJobs={jobs}
        currentJobIds={
          codeToAssociate ? getAssociatedJobIds(codeToAssociate.id) : []
        }
        onAssociationComplete={refreshPayCodeMappings}
      />
      {/* Associate with Employees Modal */}
      <AssociatePayCodesWithEmployeesModal
        isOpen={showAssociateEmployeesModal}
        onClose={() => setShowAssociateEmployeesModal(false)}
        payCode={payCodeToAssociateWithEmployees}
        availableEmployees={allEmployees}
        currentEmployeeIds={
          payCodeToAssociateWithEmployees
            ? getAssociatedEmployeeIds(payCodeToAssociateWithEmployees.id)
            : []
        }
        onAssociationComplete={refreshPayCodeMappings}
      />
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Pay Code"
        // Updated message to use ID or description
        message={`Delete pay code "${
          codeToDelete?.description || codeToDelete?.id || "N/A"
        }"? This cannot be undone.`}
        variant="danger"
      />
    </div>
  );
};

export default PayCodePage;
