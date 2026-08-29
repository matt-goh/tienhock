import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconPencil,
  IconBriefcase,
  IconPhone,
  IconId,
  IconUsers,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { Employee, FilterOptions } from "../../types/types";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import Button from "../../components/Button";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import { usePersistedFilters } from "../../hooks/usePersistedFilters";
import PillSelect, { PillSelectOption } from "../../components/PillSelect";

const FILTERS_STORAGE_KEY = "staffList";
const SCROLL_RESTORATION_KEY = "staff-list";

type StaffStatusFilter = "active" | "all";

// Search, the filter-menu selections and the page all persist so returning
// from a staff form lands on the same slice of the list.
interface StaffListCache {
  searchTerm: string;
  filters: FilterOptions;
  page: number;
}

const getDefaultStaffListCache = (): StaffListCache => ({
  searchTerm: "",
  filters: { showResigned: false, jobFilter: null, applyJobFilter: true },
  page: 1,
});

const reviveStaffListCache = (cached: any): StaffListCache => {
  const defaults = getDefaultStaffListCache();
  return {
    searchTerm: typeof cached?.searchTerm === "string" ? cached.searchTerm : "",
    filters:
      cached?.filters && typeof cached.filters === "object"
        ? (cached.filters as FilterOptions)
        : defaults.filters,
    page: typeof cached?.page === "number" && cached.page >= 1 ? cached.page : 1,
  };
};

const EmployeeCard = ({
  employee,
  onDeleteClick,
}: {
  employee: Employee;
  onDeleteClick: (employee: Employee) => void;
}) => {
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation("catalogue");

  const handleClick = () => {
    navigate(`/catalogue/staff/${employee.id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(employee);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/catalogue/staff/${employee.id}/edit`);
  };

  const handleMoreJobsClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card navigation
    setExpandedJobs(!expandedJobs);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${
        isCardHovered ? "border-sky-200 dark:border-sky-500 shadow-md" : "border-default-200 dark:border-gray-700"
      } transition-all duration-200 cursor-pointer bg-white dark:bg-gray-800`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Card Header */}
      <div
        className={`px-4 py-3 border-b ${
          isCardHovered
            ? "bg-sky-50 dark:bg-sky-900/30 border-sky-100 dark:border-sky-800"
            : "bg-default-50 dark:bg-gray-900/50 border-default-100 dark:border-gray-700"
        } transition-colors duration-200`}
      >
        <div className="flex justify-between items-center gap-2">
          <h3
            className="font-semibold text-default-800 dark:text-gray-100 truncate flex-1 min-w-0"
            title={employee.name}
          >
            {employee.name}
          </h3>
          <div
            className={`flex items-center gap-1.5 flex-shrink-0 transition-opacity duration-150 ${
              isCardHovered ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <button
              onClick={handleEditClick}
              className="p-1.5 rounded-lg bg-white dark:bg-gray-800 hover:bg-sky-50 dark:hover:bg-sky-900/50 text-default-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-150 shadow-sm"
              title={t("Edit employee")}
            >
              <IconPencil size={16} stroke={1.5} />
            </button>
            <button
              onClick={handleDeleteClick}
              className="p-1.5 rounded-lg bg-white dark:bg-gray-800 hover:bg-rose-50 text-default-500 dark:text-gray-400 hover:text-rose-600 transition-colors duration-150 shadow-sm"
              title={t("Delete employee")}
            >
              <IconTrash size={16} stroke={1.5} />
            </button>
          </div>
        </div>
        <div className="text-sm text-default-500 dark:text-gray-400 mt-0.5 flex items-center">
          <span className="truncate">{employee.id}</span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        {/* Jobs Section */}
        <div className="flex items-start">
          <IconBriefcase
            size={16}
            className="text-default-400 mt-0.5 flex-shrink-0 mr-2"
          />
          <div className="text-sm text-default-700 dark:text-gray-200 flex-1">
            <div className="flex flex-wrap gap-1.5">
              {(expandedJobs ? employee.job : employee.job.slice(0, 2)).map(
                (job, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                  >
                    {job}
                  </span>
                )
              )}
              {!expandedJobs && employee.job.length > 2 && (
                <button
                  onClick={handleMoreJobsClick}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-default-100 dark:bg-gray-800 text-default-700 dark:text-gray-200 hover:bg-default-200 transition-colors"
                >
                  {t("+{{total}} more", {
                    total: employee.job.length - 2,
                  })}
                </button>
              )}
              {expandedJobs && (
                <button
                  onClick={handleMoreJobsClick}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-default-100 dark:bg-gray-800 text-default-700 dark:text-gray-200 hover:bg-default-200 transition-colors"
                >
                  {t("Show less")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* IC Number */}
        <div className="flex items-center">
          <IconId size={16} className="text-default-400 flex-shrink-0 mr-2" />
          <div className="text-sm text-default-700 dark:text-gray-200 flex-1 truncate">
            {employee.icNo || "-"}
          </div>
        </div>

        {/* Phone Number */}
        <div className="flex items-center">
          <IconPhone
            size={16}
            className="text-default-400 flex-shrink-0 mr-2"
          />
          <div className="text-sm text-default-700 dark:text-gray-200 flex-1 truncate">
            {employee.telephoneNo || "-"}
          </div>
        </div>
      </div>

      {/* Card Footer - Status indication like resignation */}
      {employee.dateResigned && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-t border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium">
          {t("Resigned: {{date}}", {
            date: new Date(employee.dateResigned).toLocaleDateString(),
          })}
        </div>
      )}
    </div>
  );
};

const StaffPage = () => {
  const { t } = useTranslation("catalogue");
  const {
    allStaffs: employees,
    loading,
    error,
    refreshStaffs,
  } = useStaffsCache();
  const [listCache, setListCache] = usePersistedFilters<StaffListCache>(
    FILTERS_STORAGE_KEY,
    getDefaultStaffListCache,
    reviveStaffListCache
  );
  const { searchTerm, filters, page: currentPage } = listCache;
  const setSearchTerm = (value: string): void =>
    setListCache((prev) => ({ ...prev, searchTerm: value }));
  const setFilters = (value: FilterOptions): void =>
    setListCache((prev) => ({ ...prev, filters: value }));
  const setCurrentPage = (value: number): void =>
    setListCache((prev) => ({ ...prev, page: value }));
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(
    null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const statusPillOptions: ReadonlyArray<
    PillSelectOption<StaffStatusFilter>
  > = useMemo(
    () => [
      { value: "active", label: t("Active") },
      { value: "all", label: t("All") },
    ],
    [t]
  );

  const jobPillOptions: ReadonlyArray<PillSelectOption<string>> = useMemo(
    () =>
      Array.from(
        new Set(
          employees.flatMap((employee: Employee): string[] => employee.job)
        )
      ).map(
        (job: string): PillSelectOption<string> => ({ value: job, label: job })
      ),
    [employees]
  );

  const selectedJobFilters: ReadonlyArray<string> =
    filters.applyJobFilter === false ? [] : filters.jobFilter ?? [];

  // Focus the search box once the page has finished loading (the input isn't
  // mounted yet while the loading spinner is shown).
  useEffect(() => {
    if (!loading) searchInputRef.current?.focus();
  }, [loading]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshStaffs();
      toast.success(t("Staff list refreshed"));
    } catch (err) {
      toast.error(t("Failed to refresh staff list"));
    } finally {
      setIsRefreshing(false);
    }
  };

  const ITEMS_PER_PAGE = 12;

  const handleConfirmDelete = async () => {
    if (employeeToDelete) {
      try {
        await api.delete(`/api/staffs/${employeeToDelete.id}`);
        setIsDeleteDialogOpen(false);
        setEmployeeToDelete(null);
        toast.success(t("Employee deleted successfully"));

        // Refresh the cache instead of updating local state
        await refreshStaffs();
      } catch (err) {
        console.error("Error deleting employee:", err);
        toast.error(t("Failed to delete employee. Please try again."));
      }
    }
  };

  const handleDeleteClick = (employee: Employee) => {
    setEmployeeToDelete(employee);
    setIsDeleteDialogOpen(true);
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (employee.icNo &&
          employee.icNo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (employee.telephoneNo &&
          employee.telephoneNo
            .toLowerCase()
            .includes(searchTerm.toLowerCase()));

      const matchesResignedFilter = filters.showResigned
        ? true // If showResigned is true, include all employees regardless of resignation date
        : employee.dateResigned === null ||
          employee.dateResigned === "" ||
          !employee.dateResigned;

      const matchesJobFilter =
        !filters.applyJobFilter ||
        !filters.jobFilter ||
        filters.jobFilter.length === 0 ||
        employee.job.some((job: string) => filters.jobFilter?.includes(job));

      return (
        matchesSearch &&
        matchesResignedFilter &&
        matchesJobFilter
      );
    });
  }, [employees, searchTerm, filters]);

  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE);

  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEmployees.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredEmployees, currentPage]);

  // Reset to page 1 when a filter actually changes. The ref-guard skips the
  // initial mount so the page number restored from the cache survives.
  const filterSignature: string = JSON.stringify([searchTerm, filters]);
  const prevFilterSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      prevFilterSignatureRef.current !== null &&
      prevFilterSignatureRef.current !== filterSignature
    ) {
      setCurrentPage(1);
    }
    prevFilterSignatureRef.current = filterSignature;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature]);

  // Restore the previous scroll position when returning from a staff form.
  useScrollRestoration(SCROLL_RESTORATION_KEY, !loading);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleFilterChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const renderPaginationButtons = () => {
    const buttons = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        buttons.push(
          <button
            key={i}
            onClick={() => handlePageChange(i)}
            className={`inline-flex items-center justify-center rounded-full text-sm text-default-700 dark:text-gray-200 transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
              i === currentPage
                ? "border border-default-200 dark:border-gray-600 font-semibold bg-default-50 dark:bg-gray-800"
                : "font-medium"
            }`}
          >
            {i}
          </button>
        );
      }
    } else {
      buttons.push(
        <button
          key={1}
          onClick={() => handlePageChange(1)}
          className={`inline-flex items-center justify-center rounded-full text-sm text-default-700 dark:text-gray-200 transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
            1 === currentPage
              ? "border border-default-200 dark:border-gray-600 font-semibold bg-default-50 dark:bg-gray-800"
              : "font-medium"
          }`}
        >
          1
        </button>
      );

      if (currentPage > 3) {
        buttons.push(
          <div key="ellipsis1" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        buttons.push(
          <button
            key={i}
            onClick={() => handlePageChange(i)}
            className={`inline-flex items-center justify-center rounded-full text-sm text-default-700 dark:text-gray-200 transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
              i === currentPage
                ? "border border-default-200 dark:border-gray-600 font-semibold bg-default-50 dark:bg-gray-800"
                : "font-medium"
            }`}
          >
            {i}
          </button>
        );
      }

      if (currentPage < totalPages - 2) {
        buttons.push(
          <div key="ellipsis2" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      buttons.push(
        <button
          key={totalPages}
          onClick={() => handlePageChange(totalPages)}
          className={`inline-flex items-center justify-center rounded-full text-sm text-default-700 dark:text-gray-200 transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
            totalPages === currentPage
              ? "border border-default-200 dark:border-gray-600 font-semibold bg-default-50 dark:bg-gray-800"
              : "font-medium"
          }`}
        >
          {totalPages}
        </button>
      );
    }

    return buttons;
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>{t("Error: {{message}}", { message: error.message })}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-4 -mt-2.5 px-4 pt-2.5 pb-3 border-b border-default-200 dark:border-gray-700 bg-white/95 dark:bg-gray-950/95 backdrop-blur flex flex-wrap items-center gap-x-2 gap-y-3">
        <div className="order-1 flex items-center flex-shrink-0">
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            {t("Staff Directory ({{total}})", {
              total: filteredEmployees.length,
            })}
          </h1>
        </div>

        <div className="order-3 w-full md:order-2 md:w-auto md:ml-auto min-w-0">
          <div className="relative flex-1 min-w-0 md:w-64 md:flex-none">
            <IconSearch
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400"
              stroke={1.5}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("Search name, ID or phone...")}
              className="w-full h-[40px] rounded-lg border border-default-300 dark:border-gray-600 pl-9 pr-8 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-900/50 text-default-800 dark:text-gray-100"
              value={searchTerm}
              onChange={handleSearchChange}
            />
            {searchTerm && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                onClick={() => setSearchTerm("")}
                title={t("Clear search")}
              >
                <IconX size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="order-4 w-full flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="mr-0.5 text-xs font-medium text-default-500 dark:text-gray-400">
            {t("Status")}
          </span>
          <PillSelect<StaffStatusFilter>
            value={filters.showResigned ? "all" : "active"}
            onChange={(value: StaffStatusFilter): void =>
              handleFilterChange({ ...filters, showResigned: value === "all" })
            }
            options={statusPillOptions}
            className="!contents"
            ariaLabel={t("Status")}
          />

          <span className="h-5 w-px bg-default-300 dark:bg-gray-600 mx-1" />

          <span className="mr-0.5 text-xs font-medium text-default-500 dark:text-gray-400">
            {t("Jobs")}
          </span>
          <PillSelect<string>
            selectionMode="multiple"
            value={selectedJobFilters}
            onChange={(jobs: string[]): void =>
              handleFilterChange({
                ...filters,
                applyJobFilter: true,
                jobFilter: jobs.length > 0 ? jobs : null,
              })
            }
            options={jobPillOptions}
            emptyOption={{ label: t("All Jobs") }}
            showSelectOnly
            className="!contents"
            ariaLabel={t("Filter by job(s)")}
          />
        </div>

        <div className="order-2 ml-auto md:order-3 md:ml-0 flex items-center gap-2 flex-shrink-0">
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            icon={IconRefresh}
            variant="outline"
            title={t("Refresh staff list")}
            className={isRefreshing ? "[&_svg]:animate-spin" : ""}
          >
            {t("Refresh")}
          </Button>
          <Button
            onClick={() => navigate("/catalogue/staff/records")}
            icon={IconUsers}
            variant="outline"
          >
            {t("Records")}
          </Button>
          <Button
            onClick={() => navigate("/catalogue/staff/new")}
            icon={IconPlus}
            color="sky"
          >
            {t("Add Staff")}
          </Button>
        </div>
      </div>

      {filteredEmployees.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
          <IconBriefcase size={48} className="mx-auto text-default-300 mb-4" />
          <h3 className="text-lg font-medium text-default-800 dark:text-gray-100 mb-1">
            {t("No staff members found")}
          </h3>
          <p className="text-default-500 dark:text-gray-400 max-w-md mx-auto">
            {searchTerm ||
            filters.showResigned ||
            (filters.applyJobFilter &&
              filters.jobFilter &&
              filters.jobFilter.length > 0)
              ? t("Try adjusting your search or filter criteria")
              : t("Get started by adding your first staff member")}
          </p>
          {!searchTerm &&
            !(
              filters.showResigned ||
              (filters.applyJobFilter &&
                filters.jobFilter &&
                filters.jobFilter.length > 0)
            ) && (
              <Button
                onClick={() => navigate("/catalogue/staff/new")}
                icon={IconPlus}
                variant="outline"
                className="mt-4"
              >
                {t("Add Staff Member")}
              </Button>
            )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
            {paginatedEmployees.map((employee) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                onDeleteClick={handleDeleteClick}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-between items-center">
              <button
                className="pl-2.5 pr-4 py-2 inline-flex items-center justify-center rounded-full font-medium text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 hover:bg-default-50 dark:hover:bg-gray-700 active:bg-default-100 dark:active:bg-gray-600"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <IconChevronLeft className="w-4 h-4 mr-1" /> {t("Previous")}
              </button>
              <div className="hidden md:flex space-x-1">
                {renderPaginationButtons()}
              </div>
              <div className="md:hidden text-sm text-default-600 dark:text-gray-300">
                {t("Page {{current}} of {{total}}", {
                  current: currentPage,
                  total: totalPages,
                })}
              </div>
              <button
                className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 hover:bg-default-50 dark:hover:bg-gray-700 active:bg-default-100 dark:active:bg-gray-600"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                {t("Next")} <IconChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title={t("Delete Staff Member")}
        message={t(
          "Are you sure you want to remove {{name}} from the staff directory? This action cannot be undone.",
          { name: employeeToDelete?.name }
        )}
        confirmButtonText={t("delete", { ns: "common" })}
        variant="danger"
      />
    </div>
  );
};

export default StaffPage;
