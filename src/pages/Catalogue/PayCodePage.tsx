// src/pages/Catalogue/PayCodePage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import toast from "react-hot-toast";

import { api } from "../../routes/utils/api";
import { PayCode, Job } from "../../types/types";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import PayCodeModal from "../../components/Catalogue/PayCodeModal";
import { useJobPayCodeMappings } from "../../hooks/useJobPayCodeMappings";

const PayCodePage: React.FC = () => {
  // State
  const [filteredCodes, setFilteredCodes] = useState<PayCode[]>([]);
  const [selectedType, setSelectedType] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>("All");

  const {
    mappings: jobPayCodeMap,
    payCodes,
    loading: loadingData,
    refreshData,
  } = useJobPayCodeMappings();

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [codeToEdit, setCodeToEdit] = useState<PayCode | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState<PayCode | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // The pay type options
  const payTypeOptions: string[] = ["All", "Base", "Tambahan", "Overtime"];

  const renderJobFilter = () => (
    <div className="flex items-center space-x-2">
      <span className="font-semibold text-sm text-default-700">Job:</span>
      <Listbox value={selectedJob} onChange={setSelectedJob}>
        <div className="relative">
          <ListboxButton className="relative w-48 cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm">
            <span className="block truncate">
              {selectedJob === "All"
                ? "All Jobs"
                : jobs.find((j) => j.id === selectedJob)?.name || selectedJob}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                size={20}
                className="text-gray-400"
                aria-hidden="true"
              />
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
                  {selected ? (
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                      <IconCheck size={20} aria-hidden="true" />
                    </span>
                  ) : null}
                </>
              )}
            </ListboxOption>
            {jobs.map((job) => (
              <ListboxOption
                key={job.id}
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

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.get("/api/jobs");
      setJobs(data);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      setJobs([]);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Filter pay codes based on type, job and search term
  useEffect(() => {
    // Don't filter if we're still loading or have no data
    if (loadingData) return;

    let filtered = [...payCodes];

    // Filter by type if not "All"
    if (selectedType !== "All") {
      filtered = filtered.filter((code) => code.pay_type === selectedType);
    }

    // Filter by job if not "All"
    if (selectedJob !== "All") {
      const payCodeIds = jobPayCodeMap[selectedJob] || [];
      if (payCodeIds.length > 0) {
        filtered = filtered.filter((code) => payCodeIds.includes(code.id));
      } else {
        filtered = [];
      }
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (code) =>
          (code.code?.toLowerCase() || "").includes(term) ||
          (code.description?.toLowerCase() || "").includes(term)
      );
    }

    setFilteredCodes(filtered);
    setCurrentPage(1);
  }, [
    payCodes,
    selectedType,
    selectedJob,
    searchTerm,
    jobPayCodeMap,
    loadingData,
  ]);

  // Calculate paginated data
  const paginatedCodes = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCodes.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCodes, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = useMemo(
    () => Math.ceil(filteredCodes.length / itemsPerPage),
    [filteredCodes.length, itemsPerPage]
  );

  // Handle add/edit
  const handleAddClick = () => {
    setCodeToEdit(null);
    setShowAddModal(true);
  };

  const handleEditClick = (code: PayCode) => {
    setCodeToEdit(code);
    setShowAddModal(true);
  };

  // Handle save pay code
  const handleSavePayCode = async (payCodeData: PayCode) => {
    try {
      if (codeToEdit) {
        await api.put(`/api/pay-codes/${payCodeData.id}`, payCodeData);
        toast.success("Pay code updated successfully");
      } else {
        await api.post("/api/pay-codes", payCodeData);
        toast.success("Pay code created successfully");
      }

      setShowAddModal(false);
      refreshData(); // Use refreshData to refresh both payCodes and mappings
    } catch (error: any) {
      console.error("Error saving pay code:", error);
      throw new Error(error.message || "Failed to save pay code");
    }
  };

  // Handle delete
  const handleDeleteClick = async (code: PayCode) => {
    // Check if pay code is in use
    const isInUse = Object.values(jobPayCodeMap).some((payCodeIds) =>
      payCodeIds.includes(code.id)
    );

    if (isInUse) {
      toast.error(
        `Cannot delete: Pay code "${code.code}" is used in job assignments`
      );
      return;
    }

    setCodeToDelete(code);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!codeToDelete) return;

    try {
      const response = await api.delete(`/api/pay-codes/${codeToDelete.id}`);

      // Check if response contains an error message (API might return 200 with error content)
      if (
        response &&
        response.message &&
        response.message.includes("Cannot delete")
      ) {
        throw new Error(response.message);
      }

      toast.success("Pay code deleted successfully");
      setShowDeleteDialog(false);
      refreshData();
    } catch (error: any) {
      console.error("Error deleting pay code:", error);

      // Extract error message from different possible sources
      let errorMessage = "Failed to delete pay code";

      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === "object" && error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      if (errorMessage.includes("used in job assignments")) {
        toast.error(`Cannot delete: This pay code is used in job assignments`);
      } else {
        toast.error(errorMessage);
      }

      setShowDeleteDialog(false);
    }
  };

  // Render pay type filter
  const renderPayTypeFilter = () => (
    <div className="flex items-center space-x-2">
      <span className="font-semibold text-sm text-default-700">Type:</span>
      <Listbox value={selectedType} onChange={setSelectedType}>
        <div className="relative">
          <ListboxButton className="relative w-40 cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm">
            <span className="block truncate">{selectedType}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                size={20}
                className="text-gray-400"
                aria-hidden="true"
              />
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

  return (
    <div className="relative w-full mx-4 md:mx-6">
      {/* Header area */}
      <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
        <h1 className="text-xl font-semibold text-default-800">
          Pay Code Catalogue
        </h1>
        <div className="flex w-full flex-col items-center justify-end gap-4 md:w-auto md:flex-row">
          {/* Filter by type */}
          {renderPayTypeFilter()}

          {/* Filter by job */}
          {renderJobFilter()}

          {/* Search */}
          <div className="relative w-full md:w-64">
            <IconSearch
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search code or description..."
              className="w-full rounded-full border border-default-300 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Add button */}
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
      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-default-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-default-200">
          <thead className="bg-default-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                Code
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
              paginatedCodes.map((code) => (
                <tr
                  key={code.id}
                  className="hover:bg-default-50 cursor-pointer"
                  onClick={() => handleEditClick(code)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                    {code.code}
                  </td>
                  <td className="px-4 py-3 text-sm text-default-700 max-w-sm truncate">
                    {code.description}
                  </td>
                  {selectedType === "All" && (
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                      {code.pay_type}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700">
                    {code.rate_unit}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700 min-w-[110px]">
                    {typeof code.rate_biasa === "number"
                      ? code.rate_biasa.toFixed(2)
                      : Number(code.rate_biasa || 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700 min-w-[110px]">
                    {typeof code.rate_ahad === "number"
                      ? code.rate_ahad.toFixed(2)
                      : Number(code.rate_ahad || 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-default-700 min-w-[110px]">
                    {typeof code.rate_umum === "number"
                      ? code.rate_umum.toFixed(2)
                      : Number(code.rate_umum || 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-default-700">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        code.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {code.is_active ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center text-sm">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(code);
                        }}
                        className="text-sky-600 hover:text-sky-800"
                        title="Edit"
                      >
                        <IconPencil size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(code);
                        }}
                        className="text-rose-600 hover:text-rose-800"
                        title="Delete"
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
                  colSpan={selectedType === "All" ? 9 : 8}
                  className="px-6 py-10 text-center text-sm text-default-500"
                >
                  {filteredCodes.length === 0 &&
                  searchTerm === "" &&
                  selectedType === "All"
                    ? "No pay codes found. Create one to get started."
                    : "No pay codes match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {filteredCodes.length > itemsPerPage && (
        <div className="mt-4 flex justify-between items-center">
          <div>
            <p className="text-sm text-default-700">
              Showing{" "}
              {Math.min(
                filteredCodes.length,
                (currentPage - 1) * itemsPerPage + 1
              )}{" "}
              to {Math.min(filteredCodes.length, currentPage * itemsPerPage)} of{" "}
              {filteredCodes.length} results
            </p>
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              variant="outline"
              size="sm"
              icon={IconChevronLeft}
            >
              Previous
            </Button>
            {/* Page numbers would go here */}
            <Button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              variant="outline"
              size="sm"
              iconPosition="right"
              icon={IconChevronRight}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {/* Modals */}
      <PayCodeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSavePayCode}
        initialData={codeToEdit}
      />
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Pay Code"
        message={`Are you sure you want to delete the pay code "${codeToDelete?.code}"? This action cannot be undone.`}
        variant="danger"
      />
    </div>
  );
};

export default PayCodePage;
