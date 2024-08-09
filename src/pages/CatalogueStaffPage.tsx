import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

type Employee = {
  id: string;
  name: string;
  job: string[];
  location: string[];
  icNo: string;
  telephoneNo: string;
};

const EmployeeCard = ({ employee }: { employee: Employee }) => {
  const [displayLocations, setDisplayLocations] = useState<string[]>([]);
  const [remainingCount, setRemainingCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calculateDisplayLocations = () => {
      if (containerRef.current) {
        const container = containerRef.current;
        const containerWidth = container.offsetWidth;
        let currentWidth = 0;
        const locations = [];
        let remaining = 0;

        for (let i = 0; i < employee.location.length; i++) {
          const location = employee.location[i];
          const tempSpan = document.createElement("span");
          tempSpan.style.visibility = "hidden";
          tempSpan.style.position = "absolute";
          tempSpan.className = "text-xs font-medium px-2.5 py-0.5 rounded";
          tempSpan.textContent = location;
          document.body.appendChild(tempSpan);
          const spanWidth = tempSpan.offsetWidth;
          document.body.removeChild(tempSpan);

          if (
            currentWidth + spanWidth + (locations.length > 0 ? 8 : 0) >
            containerWidth
          ) {
            remaining = employee.location.length - i;
            break;
          }

          locations.push(location);
          currentWidth += spanWidth + (locations.length > 0 ? 8 : 0);
        }

        setDisplayLocations(locations);
        setRemainingCount(remaining);
      }
    };

    calculateDisplayLocations();
    window.addEventListener("resize", calculateDisplayLocations);
    return () =>
      window.removeEventListener("resize", calculateDisplayLocations);
  }, [employee.location]);

  return (
    <div
      className="hover:bg-gray-100 active:bg-gray-200 border text-left rounded-lg p-4 transition-all duration-200 cursor-pointer"
      onClick={() => {}}
    >
      <div className="mb-2">
        <h3 className="font-semibold">{employee.name}</h3>
        <p className="text-sm text-gray-500">{employee.job.join(", ")}</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-2" ref={containerRef}>
        {displayLocations.map((location, index) => (
          <span
            key={index}
            className={`text-xs font-medium px-2.5 py-0.5 rounded bg-sky-100 text-sky-800`}
          >
            {location}
          </span>
        ))}
        {remainingCount > 0 && (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-gray-100 text-gray-800">
            +{remainingCount}
          </span>
        )}
      </div>
      <p className="text-sm">IC: {employee.icNo}</p>
      <p className="text-sm">Phone no: {employee.telephoneNo}</p>
    </div>
  );
};

const CatalogueStaffPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
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

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [employees, searchTerm]);

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
    <div className="relative w-full mx-24">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl text-gray-700 font-bold">
          Staffs ({filteredEmployees.length})
        </h1>
        <div className="flex">
          <button
            className="flex items-center px-4 py-2 font-medium text-gray-700 border rounded-full hover:bg-gray-100 hover:text-gray-800 active:text-gray-900 active:bg-gray-200 transition-colors duration-200"
            onClick={() => navigate("/catalogue/staff/new")}
          >
            <IconPlus stroke={2} size={18} className="mr-2" />
            Add New
          </button>
        </div>
      </div>

      <div className="flex mb-6">
        <div className="relative flex-grow mr-4">
          <IconSearch
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={22}
          />
          <input
            type="text"
            placeholder="Search"
            className="w-full pl-11 pr-4 py-2 border focus:border-gray-500 rounded-full"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        <button className="px-4 py-2 border rounded-full text-gray-600 hover:bg-gray-100">
          Filters
        </button>
      </div>

      {filteredEmployees.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">
            No employees found matching your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedEmployees.map((employee) => (
            <EmployeeCard key={employee.id} employee={employee} />
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
    </div>
  );
};

export default CatalogueStaffPage;
