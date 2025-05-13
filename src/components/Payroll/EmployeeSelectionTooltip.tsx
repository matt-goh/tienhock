// src/components/Payroll/EmployeeSelectionTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Checkbox from "../Checkbox";
import { Employee } from "../../types/types";
import { IconUsers, IconCheck, IconBriefcase } from "@tabler/icons-react";

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
        top: rect.top + rect.height / 2, // Center vertically
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
        onClick={() => setIsVisible(true)}
        className={`text-sky-600 hover:text-sky-900 hover:bg-sky-50 py-1 rounded-md transition-colors duration-150 disabled:text-default-300 disabled:cursor-not-allowed flex items-center ${className}`}
        type="button"
        disabled={disabled}
      >
        <IconUsers size={18} className="mr-1.5" />
        <span className="mr-1.5 font-medium">Select</span>
        <span className="inline-flex items-center justify-center rounded-full bg-sky-100 text-sky-700 px-2 py-0.5 text-xs font-medium">
          {selectedCount}/{employees.length}
        </span>
      </button>

      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-0 w-80 opacity-0 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              opacity: isVisible ? 1 : 0,
              transform: `translate(-100%, -50%)`,
              maxHeight: "80vh",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 border-b border-default-200 px-3 py-2 bg-default-50 rounded-t-lg cursor-pointer"
              onClick={handleSelectAllClick}
              title={allSelected ? "Deselect All" : "Select All"}
            >
              <div className="flex justify-between items-center">
                <div className="text-base font-medium text-default-800 flex items-center">
                  <IconBriefcase
                    size={16}
                    className="mr-1.5 mt-0.5 text-default-500"
                  />
                  {jobName}
                </div>
                <div className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full text-xs font-medium">
                  {selectedCount}/{employees.length}
                </div>
              </div>
              <div className="flex items-center mt-1 text-sm text-sky-600 hover:text-sky-800 rounded">
                <Checkbox
                  checked={allSelected}
                  onChange={handleSelectAllClick}
                  size={16}
                  className="mr-1.5"
                  checkedColor="text-sky-700"
                />
                {allSelected ? "Deselect All" : "Select All"}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-grow overflow-y-auto py-1 max-h-64">
              {employees.length === 0 ? (
                <div className="text-center text-default-500 py-4">
                  No employees found for this job
                </div>
              ) : (
                <div className="px-1 space-y-1">
                  {employees.map((employee) => (
                    <div
                      key={employee.id}
                      className="flex items-center px-2 py-2 hover:bg-default-50 rounded-lg cursor-pointer transition-colors duration-150"
                      onClick={() =>
                        onEmployeeSelectionChange(
                          employee.id,
                          !selectedEmployees[employee.id]
                        )
                      }
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-default-700 truncate">
                          {employee.name}
                        </div>
                        <div className="text-xs text-default-500">
                          ID: {employee.id}
                        </div>
                      </div>
                      <Checkbox
                        checked={!!selectedEmployees[employee.id]}
                        onChange={() =>
                          onEmployeeSelectionChange(
                            employee.id,
                            !selectedEmployees[employee.id]
                          )
                        }
                        size={16}
                        className="mr-2.5"
                        checkedColor="text-sky-600"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default EmployeeSelectionTooltip;
