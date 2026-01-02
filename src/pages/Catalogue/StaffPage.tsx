import React, { useState, useEffect, useMemo } from "react";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconBriefcase,
  IconPhone,
  IconId,
  IconUsers,
} from "@tabler/icons-react";
import { Employee, FilterOptions } from "../../types/types";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import StaffFilterMenu from "../../components/Catalogue/StaffFilterMenu";
import Button from "../../components/Button";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";

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

  const handleClick = () => {
    navigate(`/catalogue/staff/${employee.id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(employee);
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
        <div className="flex justify-between items-center">
          <h3
            className="font-semibold text-default-800 dark:text-gray-100 truncate pr-6"
            title={employee.name}
          >
            {employee.name}
          </h3>
          <div className="absolute top-3 right-3">
            {isCardHovered && (
              <button
                onClick={handleDeleteClick}
                className="p-1.5 rounded-lg bg-white dark:bg-gray-800 hover:bg-rose-50 text-default-500 dark:text-gray-400 hover:text-rose-600 transition-colors duration-150 shadow-sm"
                title="Delete employee"
              >
                <IconTrash size={16} stroke={1.5} />
              </button>
            )}
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
                  +{employee.job.length - 2} more
                </button>
              )}
              {expandedJobs && (
                <button
                  onClick={handleMoreJobsClick}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-default-100 dark:bg-gray-800 text-default-700 dark:text-gray-200 hover:bg-default-200 transition-colors"
                >
                  Show less
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
          Resigned: {new Date(employee.dateResigned).toLocaleDateString()}
        </div>
      )}
    </div>
  );
};

const StaffPage = () => {
  const {
    allStaffs: employees,
    loading,
    error,
    refreshStaffs,
  } = useStaffsCache();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(
    null
  );
  const [filters, setFilters] = useState<FilterOptions>({
    showResigned: false,
    jobFilter: null,
    applyJobFilter: true,
  });
  const navigate = useNavigate();

  const ITEMS_PER_PAGE = 12;

  const handleConfirmDelete = async () => {
    if (employeeToDelete) {
      try {
        await api.delete(`/api/staffs/${employeeToDelete.id}`);
        setIsDeleteDialogOpen(false);
        setEmployeeToDelete(null);
        toast.success("Employee deleted successfully");

        // Refresh the cache instead of updating local state
        await refreshStaffs();
      } catch (err) {
        console.error("Error deleting employee:", err);
        toast.error("Failed to delete employee. Please try again.");
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters]);

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
    return <div>Error: {error.message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="flex items-center text-2xl text-default-700 dark:text-gray-200 font-bold gap-2.5">
          <IconBriefcase size={28} stroke={2.5} className="text-default-700 dark:text-gray-200" />
          Staff Directory ({filteredEmployees.length})
        </h1>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => navigate("/catalogue/staff/records")}
            icon={IconUsers}
            variant="outline"
          >
            Records
          </Button>
          <div className="relative flex items-center sm:max-w-xs">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search name, ID or phone..."
              className="w-full pl-10 pr-10 py-2.5 border border-default-300 dark:border-gray-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-full text-sm dark:bg-transparent dark:text-gray-100"
              value={searchTerm}
              onChange={handleSearchChange}
            />
            {searchTerm && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
                onClick={() => setSearchTerm("")}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <StaffFilterMenu
              onFilterChange={handleFilterChange}
              currentFilters={filters}
              jobOptions={employees.map((emp) => emp.job).flat()}
            />
            <Button
              onClick={() => navigate("/catalogue/staff/new")}
              icon={IconPlus}
              color="sky"
            >
              Add Staff
            </Button>
          </div>
        </div>
      </div>

      {filteredEmployees.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
          <IconBriefcase size={48} className="mx-auto text-default-300 mb-4" />
          <h3 className="text-lg font-medium text-default-800 dark:text-gray-100 mb-1">
            No staff members found
          </h3>
          <p className="text-default-500 dark:text-gray-400 max-w-md mx-auto">
            {searchTerm ||
            filters.showResigned ||
            (filters.applyJobFilter &&
              filters.jobFilter &&
              filters.jobFilter.length > 0)
              ? "Try adjusting your search or filter criteria"
              : "Get started by adding your first staff member"}
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
                Add Staff Member
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
                <IconChevronLeft className="w-4 h-4 mr-1" /> Previous
              </button>
              <div className="hidden md:flex space-x-1">
                {renderPaginationButtons()}
              </div>
              <div className="md:hidden text-sm text-default-600 dark:text-gray-300">
                Page {currentPage} of {totalPages}
              </div>
              <button
                className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 hover:bg-default-50 dark:hover:bg-gray-700 active:bg-default-100 dark:active:bg-gray-600"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next <IconChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Staff Member"
        message={`Are you sure you want to remove ${employeeToDelete?.name} from the staff directory? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default StaffPage;
