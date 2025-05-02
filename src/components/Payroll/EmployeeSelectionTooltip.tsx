// src/components/Payroll/EmployeeSelectionTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Checkbox from "../Checkbox";
import { Employee } from "../../types/types";

interface EmployeeSelectionTooltipProps {
  jobName: string;
  employees: Employee[];
  selectedEmployees: Record<string, boolean>;
  onEmployeeSelectionChange: (employeeId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  className?: string;
  disabled?: boolean;
}

const EmployeeSelectionTooltip: React.FC<EmployeeSelectionTooltipProps> = ({
  jobName,
  employees,
  selectedEmployees,
  onEmployeeSelectionChange,
  onSelectAll,
  className = "",
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate if all employees are selected
  const allSelected =
    employees.length > 0 && employees.every((emp) => selectedEmployees[emp.id]);

  // Calculate selected count
  const selectedCount = employees.filter(
    (emp) => selectedEmployees[emp.id]
  ).length;

  useEffect(() => {
    if (isVisible && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + rect.height / 2,
        left: rect.left - 10, // Position to the left
      });
    }
  }, [isVisible]);

  // Clean up timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 0);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100); // Longer delay before hiding
  };

  const handleSelectAllClick = () => {
    onSelectAll(!allSelected);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`text-sky-600 hover:text-sky-900 disabled:text-default-300 disabled:cursor-not-allowed flex items-center ${className}`}
        type="button"
        disabled={disabled}
      >
        <span className="mr-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 text-sky-600 text-xs">
          {selectedCount}
        </span>
        <span>Configure Employees</span>
      </button>

      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-4 w-80 transform -translate-y-1/2 opacity-0 transition-opacity duration-200 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              opacity: isVisible ? 1 : 0,
              transform: `translate(-100%, -50%)`,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Header */}
            <div className="flex-shrink-0 border-b border-default-200 pb-2 mb-2">
              <div className="flex justify-between items-center">
                <div className="text-base font-medium text-default-800">
                  {jobName}
                </div>
                <div className="text-xs text-default-500">
                  {selectedCount} of {employees.length} selected
                </div>
              </div>
              <div
                className="flex items-center mt-1 text-sm text-sky-600 cursor-pointer"
                onClick={handleSelectAllClick}
              >
                <Checkbox
                  checked={allSelected}
                  onChange={() => {}}
                  size={16}
                  className="mr-1"
                />
                Select All Employees
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-grow overflow-y-auto py-1 space-y-2 max-h-64 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {employees.length === 0 ? (
                <div className="text-center text-default-500 py-2">
                  No employees found for this job
                </div>
              ) : (
                employees.map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center px-1 py-1.5 hover:bg-default-50 rounded cursor-pointer"
                    onClick={() =>
                      onEmployeeSelectionChange(
                        employee.id,
                        !selectedEmployees[employee.id]
                      )
                    }
                  >
                    <Checkbox
                      checked={!!selectedEmployees[employee.id]}
                      onChange={() => {}}
                      size={16}
                      className="mr-2"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-default-800 truncate">
                        {employee.name}
                      </div>
                      <div className="text-xs text-default-500">
                        {employee.id}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default EmployeeSelectionTooltip;
