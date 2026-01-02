// src/pages/Catalogue/JobCategoryPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
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

import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useJobCategoriesCache } from "../../utils/catalogue/useJobCategoriesCache";
import { JobCategory, SelectOption } from "../../types/types";
import JobCategoryModal from "../../components/Catalogue/JobCategoryModal"; // Import the modal
import ConfirmationDialog from "../../components/ConfirmationDialog"; // Import confirmation dialog
import Button from "../../components/Button"; // Import Button component

const JobCategoryPage: React.FC = () => {
  // Cached data and state
  const { jobCategories, isLoading, error, refreshJobCategories } =
    useJobCategoriesCache(); // Use refreshJobCategories for refresh
  const [sections, setSections] = useState<SelectOption[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("All Section");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Modal and Dialog States
  const [showModal, setShowModal] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<JobCategory | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<JobCategory | null>(
    null
  );
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(50);

  // Fetch available sections for filtering
  const fetchSections = useCallback(async () => {
    try {
      const data = await api.get("/api/sections");
      // Ensure 'All Section' is always first and present
      // Note: 'data' might be typed as 'any' here. Consider adding a type assertion
      // if needed, e.g., const typedData = data as { id: string; name: string }[];
      const fetchedSections = (data as { id: string; name: string }[]).map(
        (s) => ({ id: s.name, name: s.name })
      );
      const allSectionOption = { id: "All Section", name: "All Section" };
      const uniqueSections = [
        allSectionOption,
        ...fetchedSections.filter((s) => s.name !== "All Section"),
      ];
      setSections(uniqueSections);
    } catch (error) {
      console.error("Error fetching sections:", error);
      toast.error("Failed to fetch sections. Please try again.");
    }
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  // Derived State: Filtered Job Categories
  const filteredJobCategories = useMemo(() => {
    let filtered = jobCategories || []; // Use cached data

    if (selectedSection !== "All Section") {
      filtered = filtered.filter(
        (category) => category.section === selectedSection
      );
    }

    if (searchTerm) {
      const lowercasedSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (category) =>
          category.id.toLowerCase().includes(lowercasedSearch) ||
          category.category.toLowerCase().includes(lowercasedSearch)
      );
    }

    // Optional: Sort data if needed (e.g., by ID)
    return filtered.sort((a, b) => a.id.localeCompare(b.id));
  }, [jobCategories, selectedSection, searchTerm]);

  // Calculate paginated job categories
  const paginatedJobCategories = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredJobCategories.slice(startIndex, endIndex);
  }, [filteredJobCategories, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = useMemo(
    () => Math.ceil(filteredJobCategories.length / itemsPerPage),
    [filteredJobCategories, itemsPerPage]
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSection, searchTerm]);

  // --- Modal Handlers ---
  const handleAddClick = () => {
    setCategoryToEdit(null); // Ensure edit mode is off
    setShowModal(true);
  };

  const handleEditClick = (category: JobCategory) => {
    setCategoryToEdit(category);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setCategoryToEdit(null); // Clear edit state on close
  };

  // --- Save Handler (Called from Modal) ---
  const handleSaveCategory = useCallback(
    async (categoryData: JobCategory) => {
      const isEditing = !!categoryData.originalId;
      const categoryId = categoryData.originalId || categoryData.id;

      try {
        let response;

        if (isEditing) {
          // For editing
          response = await api.put(
            `/api/job-categories/${categoryId}`,
            categoryData
          );
        } else {
          // For adding new
          response = await api.post("/api/job-categories", categoryData);
        }

        // Check if the response contains an error message
        if (response.message && !response.jobCategory) {
          // This indicates an error from the API (like duplicate ID)
          throw new Error(response.message);
        }

        toast.success(
          isEditing
            ? "Job category updated successfully"
            : "Job category added successfully"
        );
        handleModalClose();
        refreshJobCategories();
      } catch (error: any) {
        console.error("Error saving job category:", error);
        // Re-throw the error so the modal can display it
        throw new Error(
          error.message || "Failed to save job category. Please try again."
        );
      }
    },
    [refreshJobCategories]
  );

  // --- Delete Handlers ---
  const handleDeleteClick = (category: JobCategory) => {
    setCategoryToDelete(category);
    setShowDeleteDialog(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteDialog(false);
    setCategoryToDelete(null);
  };

  const handleConfirmDelete = useCallback(async () => {
    if (!categoryToDelete) return;

    try {
      // Use DELETE /api/job-categories with expected body format
      await api.delete("/api/job-categories", {
        jobCategoryIds: [categoryToDelete.id],
      }); // Adjust payload based on backend ('job-categories' vs 'jobCategoryIds')

      toast.success("Job category deleted successfully");
      setShowDeleteDialog(false);
      setCategoryToDelete(null);
      // refreshJobCategoriesCache(); // Use SWR's mutate
      refreshJobCategories(); // Trigger cache revalidation
    } catch (error) {
      console.error("Error deleting job category:", error);
      toast.error("Failed to delete job category. Please try again.");
      // Keep dialog open on error? Or close? For now, keep it open.
    }
  }, [categoryToDelete, refreshJobCategories]); // Depend on refreshJobCategories

  // --- Search Handler ---
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // --- Render Section Listbox ---
  const renderSectionListbox = () => (
    <div className="flex items-center space-x-2">
      <span className="font-semibold text-sm text-default-700 dark:text-gray-200">Section:</span>
      <Listbox value={selectedSection} onChange={setSelectedSection}>
        <div className="relative">
          <ListboxButton className="relative w-48 cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm text-default-900 dark:text-gray-100">
            <span className="block truncate">{selectedSection}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                size={20}
                className="text-gray-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {sections.map((section) => (
              <ListboxOption
                key={section.id}
                className={({ active }) =>
                  `relative cursor-default select-none py-2 pl-10 pr-4 ${
                    active ? "bg-sky-100 dark:bg-sky-900 text-sky-900 dark:text-sky-100" : "text-gray-900 dark:text-gray-100"
                  }`
                }
                value={section.name} // Value is the name string
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? "font-medium" : "font-normal"
                      }`}
                    >
                      {section.name}
                    </span>
                    {selected ? (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
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

  // --- Loading and Error States ---
  if (isLoading) {
    return (
      <div className="mt-40 flex w-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-20 flex w-full items-center justify-center text-red-600">
        Error loading job categories: {error.message}
      </div>
    );
  }

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
      <div className="flex items-center justify-between pt-3 border-t border-default-200 dark:border-gray-700">
        <div>
          <p className="text-sm text-default-600 dark:text-gray-400">
            Showing{" "}
            <span className="font-medium">
              {(currentPage - 1) * itemsPerPage + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {Math.min(
                currentPage * itemsPerPage,
                filteredJobCategories.length
              )}
            </span>{" "}
            of{" "}
            <span className="font-medium">{filteredJobCategories.length}</span>{" "}
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
              className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium
              ${
                currentPage === 1
                  ? "text-default-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-default-500 dark:text-gray-400 hover:bg-default-50 dark:hover:bg-gray-700"
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

            {/* Page numbers */}
            {pageNumbers.map((number) => (
              <button
                key={number}
                onClick={() => handlePageChange(number)}
                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium
                ${
                  currentPage === number
                    ? "z-10 bg-sky-50 dark:bg-sky-900 border-sky-500 text-sky-600 dark:text-sky-300"
                    : "bg-white dark:bg-gray-800 border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:bg-default-50 dark:hover:bg-gray-700"
                }`}
              >
                {number}
              </button>
            ))}

            {/* Last page + ellipsis */}
            {endPage < totalPages && (
              <>
                {endPage < totalPages - 1 && (
                  <span className="relative inline-flex items-center px-2 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-default-500 dark:text-gray-400">
                    ...
                  </span>
                )}
                <button
                  onClick={() => handlePageChange(totalPages)}
                  className="relative inline-flex items-center px-4 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-default-700 dark:text-gray-200 hover:bg-default-50 dark:hover:bg-gray-700"
                >
                  {totalPages}
                </button>
              </>
            )}

            {/* Next button */}
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium
              ${
                currentPage === totalPages
                  ? "text-default-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-default-500 dark:text-gray-400 hover:bg-default-50 dark:hover:bg-gray-700"
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
    <div className="space-y-4">
      {/* Header Area */}
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          Job Category Catalogue
        </h1>
        <div className="flex w-full flex-col items-center justify-end gap-4 md:w-auto md:flex-row">
          {renderSectionListbox()}
          <div className="relative w-full md:w-64">
            <IconSearch
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search ID or Category..."
              className="w-full rounded-full border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-default-400 dark:placeholder:text-gray-400"
              value={searchTerm}
              onChange={handleSearchChange}
            />
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
            Add Category
          </Button>
        </div>
      </div>

      {/* Content Area - Table/List */}
      <div className="overflow-x-auto rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
          <thead className="bg-default-100 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Category
              </th>
              {/* Conditionally show section if 'All Section' is selected */}
              {selectedSection === "All Section" && (
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                  Section
                </th>
              )}
              <th className="w-10 px-2 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Gaji
              </th>
              <th className="w-10 px-2 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Ikut
              </th>
              <th className="w-10 px-2 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                JV
              </th>
              <th className="w-28 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {paginatedJobCategories.length > 0 ? (
              paginatedJobCategories.map((category) => (
                <tr
                  key={category.id}
                  className="hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={() => handleEditClick(category)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700 dark:text-gray-200">
                    {category.id}
                  </td>
                  <td className="px-4 py-3 text-sm text-default-700 dark:text-gray-200">
                    {category.category}
                  </td>
                  {selectedSection === "All Section" && (
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-default-700 dark:text-gray-200">
                      {category.section}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-2 py-3 text-center text-sm text-default-700 dark:text-gray-200">
                    {category.gaji}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-center text-sm text-default-700 dark:text-gray-200">
                    {category.ikut}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-center text-sm text-default-700 dark:text-gray-200">
                    {category.jv}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center text-sm">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent row click
                          handleEditClick(category);
                        }}
                        className="text-sky-600 dark:text-sky-400 hover:text-sky-800dark:hover:text-sky-300"
                        title="Edit"
                      >
                        <IconPencil size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(category);
                        }}
                        className="text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300"
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
                  colSpan={selectedSection === "All Section" ? 7 : 6} // Adjust colspan based on section visibility
                  className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                >
                  No job categories found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals and Dialogs */}
      <JobCategoryModal
        isOpen={showModal}
        onClose={handleModalClose}
        onSave={handleSaveCategory}
        initialData={categoryToEdit}
      />

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Delete Job Category"
        message={`Are you sure you want to delete the category "${categoryToDelete?.category}" (ID: ${categoryToDelete?.id})? This action cannot be undone.`}
        variant="danger"
      />
      {/* Pagination - only show if we have more than one page */}
      {filteredJobCategories.length > itemsPerPage && <Pagination />}
    </div>
  );
};

export default JobCategoryPage;
