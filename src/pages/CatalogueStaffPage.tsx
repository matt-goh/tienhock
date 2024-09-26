import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import DeleteDialog from "../components/DeleteDialog";
import StaffFilterMenu from "../components/StaffFilterMenu";
import { Employee, FilterOptions } from "../types/types";
import Button from "../components/Button";

const EmployeeCard = ({
  employee,
  onDeleteClick,
}: {
  employee: Employee;
  onDeleteClick: (employee: Employee) => void;
}) => {
  const [displayJobs, setDisplayJobs] = useState<string[]>([]);
  const [remainingJobCount, setRemainingJobCount] = useState(0);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [isTrashHovered, setIsTrashHovered] = useState(false);
  const jobContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const calculateDisplay = (
      items: string[],
      containerRef: React.RefObject<HTMLDivElement>,
      setDisplayItems: React.Dispatch<React.SetStateAction<string[]>>,
      setRemainingCount: React.Dispatch<React.SetStateAction<number>>
    ) => {
      if (containerRef.current) {
        const container = containerRef.current;
        const containerWidth = container.offsetWidth;
        let currentWidth = 0;
        const displayItems = [];
        let remaining = 0;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const tempSpan = document.createElement("span");
          tempSpan.style.visibility = "hidden";
          tempSpan.style.position = "absolute";
          tempSpan.className = "text-xs font-medium";
          tempSpan.textContent = item + (i < items.length - 1 ? ", " : "");
          document.body.appendChild(tempSpan);
          const spanWidth = tempSpan.offsetWidth;
          document.body.removeChild(tempSpan);

          if (currentWidth + spanWidth > containerWidth) {
            remaining = items.length - i;
            break;
          }

          displayItems.push(item);
          currentWidth += spanWidth;
        }

        // Check if we need to compress the last visible item
        if (remaining > 0) {
          const lastItem = displayItems.pop();
          if (lastItem) {
            remaining++;
          }
        }

        setDisplayItems(displayItems);
        setRemainingCount(remaining);
      }
    };
    calculateDisplay(
      employee.job,
      jobContainerRef,
      setDisplayJobs,
      setRemainingJobCount
    );

    window.addEventListener("resize", () => {
      calculateDisplay(
        employee.job,
        jobContainerRef,
        setDisplayJobs,
        setRemainingJobCount
      );
    });

    return () => {
      window.removeEventListener("resize", () => {
        calculateDisplay(
          employee.job,
          jobContainerRef,
          setDisplayJobs,
          setRemainingJobCount
        );
      });
    };
  }, [employee.location, employee.job]);

  const handleClick = () => {
    navigate(`/catalogue/staff/${employee.id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(employee);
  };

  return (
    <div
      className={`relative border text-left rounded-lg p-4 transition-all duration-200 cursor-pointer ${
        isCardHovered && !isTrashHovered ? "bg-gray-100" : ""
      }`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      <div className="mb-2">
        <h3 className="font-semibold">{employee.name}</h3>
        <div className="text-sm text-gray-500">{employee.id}</div>
      </div>
      <div className="flex flex-wrap gap-2 mb-2" ref={jobContainerRef}>
        {displayJobs.map((location, index) => (
          <span
            key={index}
            className="text-xs font-medium px-2.5 py-0.5 rounded bg-sky-100 text-sky-800"
          >
            {location}
          </span>
        ))}
        {remainingJobCount > 0 && (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-gray-100 text-gray-800">
            +{remainingJobCount}
          </span>
        )}
      </div>
      <p className="text-sm">IC: {employee.icNo}</p>
      <p className="text-sm">
        Phone no: {employee.telephoneNo ? employee.telephoneNo : "-"}
      </p>
      <div className="absolute inset-y-0 top-2 right-2">
        <div className="relative w-8 h-8">
          {isCardHovered && (
            <button
              onClick={handleDeleteClick}
              onMouseEnter={() => setIsTrashHovered(true)}
              onMouseLeave={() => setIsTrashHovered(false)}
              className="delete-button flex items-center justify-center absolute inset-0 rounded-lg transition-colors duration-200 bg-gray-100 active:bg-gray-200 focus:outline-none"
            >
              <IconTrash
                className="text-gray-700 active:text-gray-800"
                stroke={1.5}
                size={18}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const CatalogueStaffPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(
    null
  );
  const [filters, setFilters] = useState<FilterOptions>({
    showResigned: false,
    jobFilter: null,
    applyJobFilter: false,
    locationFilter: null,
    applyLocationFilter: false,
  });
  const navigate = useNavigate();

  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:5000/api/staffs");
      if (!response.ok) {
        throw new Error("Failed to fetch employees");
      }
      const data = await response.json();
      setEmployees(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch employees. Please try again later.");
      console.error("Error fetching employees:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (employeeToDelete) {
      try {
        const response = await fetch(
          `http://localhost:5000/api/staffs/${employeeToDelete.id}`,
          {
            method: "DELETE",
          }
        );
        if (!response.ok) {
          throw new Error("Failed to delete employee");
        }
        setEmployees(employees.filter((emp) => emp.id !== employeeToDelete.id));
        setIsDeleteDialogOpen(false);
        setEmployeeToDelete(null);
        toast.success("Employee deleted successfully");
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

  const locationOptions = useMemo(() => {
    return Array.from(new Set(employees.map((emp) => String(emp.location))));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesResignedFilter = filters.showResigned
        ? true
        : employee.dateResigned === null;

      const matchesJobFilter =
        !filters.applyJobFilter ||
        !filters.jobFilter ||
        filters.jobFilter.length === 0 ||
        employee.job.some((job) => filters.jobFilter?.includes(job));

      const matchesLocationFilter =
        !filters.applyLocationFilter ||
        !filters.locationFilter ||
        filters.locationFilter.length === 0 ||
        (Array.isArray(employee.location)
          ? employee.location.some((loc) =>
              filters.locationFilter?.includes(loc)
            )
          : filters.locationFilter?.includes(employee.location));

      return (
        matchesSearch &&
        matchesResignedFilter &&
        matchesJobFilter &&
        matchesLocationFilter
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
  }, [searchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleFilterChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
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
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-gray-100 active:bg-gray-200 ${
              i === currentPage
                ? "border border-gray-200 font-semibold"
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
          className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-gray-100 active:bg-gray-200 ${
            1 === currentPage
              ? "border border-gray-200 font-semibold"
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
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-gray-100 active:bg-gray-200 ${
              i === currentPage
                ? "border border-gray-200 font-semibold"
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
          className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-gray-100 active:bg-gray-200 ${
            totalPages === currentPage
              ? "border border-gray-200 font-semibold"
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
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="relative w-full mx-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="relative text-2xl text-gray-700 font-bold">
          Staffs ({filteredEmployees.length})
        </h1>
        <div className="flex">
          <div className="relative mx-3">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={22}
            />
            <input
              type="text"
              placeholder="Search"
              className="w-full pl-11 py-2 border focus:border-gray-500 rounded-full"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          <StaffFilterMenu
            onFilterChange={handleFilterChange}
            currentFilters={filters}
            jobOptions={employees.map((emp) => emp.job).flat()}
            locationOptions={employees.map((emp) => emp.location).flat()}
          />
          <Button
            onClick={() => navigate("/catalogue/staff/new")}
            icon={IconPlus}
            variant="outline"
          >
            Add Staff
          </Button>
        </div>
      </div>

      {filteredEmployees.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No employees found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedEmployees.map((employee) => (
            <EmployeeCard
              key={employee.id}
              employee={employee}
              onDeleteClick={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {filteredEmployees.length > 0 && (
        <div className="mt-6 flex justify-between items-center text-gray-700">
          <button
            className="pl-2.5 pr-4 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-gray-100 active:bg-gray-200 hover:bg-accent hover:text-accent-foreground"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <IconChevronLeft className="w-5 h-5 mr-2" /> Previous
          </button>
          <div className="flex space-x-2">{renderPaginationButtons()}</div>
          <button
            className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-gray-100 active:bg-gray-200 hover:bg-accent hover:text-accent-foreground"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next <IconChevronRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}
      <DeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Staff"
        message={`Are you sure you want to remove ${employeeToDelete?.name} from the staff list? This action cannot be undone.`}
        confirmButtonText="Delete"
      />
    </div>
  );
};

export default CatalogueStaffPage;
