// src/components/Catalogue/JobsUsingPayCodeTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { IconInfoCircle, IconBriefcase, IconUser } from "@tabler/icons-react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

interface JobsAndEmployeesUsingPayCodeTooltipProps {
  payCodeId: string;
  jobsMap: Record<string, string[]>; // payCodeId -> jobIds
  jobsList: { id: string; name: string }[];
  employeesMap: Record<string, string[]>; // payCodeId -> employeeIds
  employeesList: { id: string; name: string }[];
  className?: string;
  disableNavigation?: boolean;
}

const JobsAndEmployeesUsingPayCodeTooltip: React.FC<
  JobsAndEmployeesUsingPayCodeTooltipProps
> = ({
  payCodeId,
  jobsMap,
  jobsList,
  employeesMap,
  employeesList,
  className = "",
  disableNavigation = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Get jobs and employees that use this pay code
  const jobsUsingPayCode = jobsMap[payCodeId] || [];
  const employeesUsingPayCode = employeesMap[payCodeId] || [];

  // Find job names for display
  const jobDetails = jobsUsingPayCode.map((jobId) => {
    const job = jobsList.find((j) => j.id === jobId);
    return {
      id: jobId,
      name: job?.name || jobId,
    };
  });

  // Find employee names for display
  const employeeDetails = employeesUsingPayCode.map((employeeId) => {
    const employee = employeesList.find((e) => e.id === employeeId);
    return {
      id: employeeId,
      name: employee?.name || employeeId,
    };
  });

  const totalCount = jobsUsingPayCode.length + employeesUsingPayCode.length;

  useEffect(() => {
    if (isVisible && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 5,
      });
    }
  }, [isVisible]);

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
    }, 100);
  };

  // Hide tooltip completely if no jobs or employees use this pay code
  if (totalCount === 0) return null;

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`text-default-400 hover:text-default-600 cursor-help inline-flex items-center ${className}`}
      >
        <IconInfoCircle size={16} />
        {totalCount > 0 && (
          <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-100 text-sky-700 text-xs">
            {totalCount}
          </span>
        )}
      </span>

      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-4 w-96 transform opacity-0 transition-opacity duration-200"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              maxHeight: "400px",
              opacity: isVisible ? 1 : 0,
              transform: `translate(0%, -50%)`,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="text-sm font-medium text-default-700 mb-2 flex justify-between items-center">
              <span className="truncate" title={`Pay Code Usage: ${payCodeId}`}>
                Pay Code Usage: {payCodeId}
              </span>
              <span
                className="text-xs text-default-500 truncate"
                title={`Total: ${totalCount}`}
              >
                ({totalCount} total)
              </span>
            </div>

            <div className="border-t border-default-200 pt-2 space-y-4">
              {/* Jobs Section */}
              {jobDetails.length > 0 && (
                <div>
                  <div className="flex items-center mb-2">
                    <IconBriefcase size={16} className="text-amber-600 mr-2" />
                    <span className="text-sm font-medium text-default-700">
                      Jobs ({jobDetails.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {jobDetails.map((job) => (
                      <div
                        key={job.id}
                        className={`py-1 px-2 bg-amber-50 rounded border border-amber-200 ${
                          !disableNavigation
                            ? "cursor-pointer hover:bg-amber-100"
                            : ""
                        } transition-colors duration-200 flex justify-between items-center`}
                        title={`View job details: ${job.name}`}
                        onClick={() => {
                          if (!disableNavigation) {
                            navigate(`/catalogue/job?id=${job.id}`);
                          }
                        }}
                      >
                        <span className="font-medium text-sm">{job.name}</span>
                        <span className="text-xs text-default-500">
                          {job.id}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Employees Section */}
              {employeeDetails.length > 0 && (
                <div>
                  <div className="flex items-center mb-2">
                    <IconUser size={16} className="text-sky-600 mr-2" />
                    <span className="text-sm font-medium text-default-700">
                      Employees ({employeeDetails.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {employeeDetails.map((employee) => (
                      <div
                        key={employee.id}
                        className={`py-1 px-2 bg-sky-50 rounded border border-sky-200 ${
                          !disableNavigation
                            ? "cursor-pointer hover:bg-sky-100"
                            : ""
                        } transition-colors duration-200 flex justify-between items-center`}
                        title={`View employee details: ${employee.name}`}
                        onClick={() => {
                          if (!disableNavigation) {
                            navigate(`/catalogue/staff/${employee.id}`);
                          }
                        }}
                      >
                        <span className="font-medium text-sm">
                          {employee.name}
                        </span>
                        <span className="text-xs text-default-500">
                          {employee.id}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {totalCount === 0 && (
                <div className="text-center text-sm text-default-500 py-2">
                  Not used by any jobs or employees
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default JobsAndEmployeesUsingPayCodeTooltip;
