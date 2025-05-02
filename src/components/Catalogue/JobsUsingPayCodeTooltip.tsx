// src/components/Catalogue/JobsUsingPayCodeTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

interface JobsUsingPayCodeTooltipProps {
  payCodeId: string;
  jobsMap: Record<string, string[]>; // Map of payCodeId -> jobIds
  jobsList: { id: string; name: string }[]; // List of jobs with name for display
  className?: string;
  disableNavigation?: boolean;
}

const JobsUsingPayCodeTooltip: React.FC<JobsUsingPayCodeTooltipProps> = ({
  payCodeId,
  jobsMap,
  jobsList,
  className = "",
  disableNavigation = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Get jobs that use this pay code
  const jobsUsingPayCode = jobsMap[payCodeId] || [];

  // Find job names for display
  const jobDetails = jobsUsingPayCode.map((jobId) => {
    const job = jobsList.find((j) => j.id === jobId);
    return {
      id: jobId,
      name: job?.name || jobId, // Fallback to ID if name not found
    };
  });

  useEffect(() => {
    if (isVisible && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + rect.height / 2, // Center vertically
        left: rect.right + 5, // Simply use left position of the icon
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
    }, 0); // Short delay before showing
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100); // Longer delay before hiding
  };

  // Hide tooltip completely if no jobs use this pay code
  if (jobsUsingPayCode.length === 0) return null;

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`text-default-400 hover:text-default-600 cursor-help inline-flex ${className}`}
      >
        <IconInfoCircle size={16} />
      </span>

      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-4 w-80 transform opacity-0 transition-opacity duration-200"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              maxHeight: "280px",
              overflowY: "auto",
              opacity: isVisible ? 1 : 0,
              transform: `translate(0%, -50%)`,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="text-sm font-medium text-default-700 mb-2 flex justify-between items-center">
              <span
                className="truncate"
                title={`Jobs Using Pay Code: ${payCodeId}`}
              >
                Jobs Using Pay Code: {payCodeId}
              </span>
              <span
                className="text-xs text-default-500 truncate"
                title={`Total Jobs: ${jobsUsingPayCode.length}`}
              >
                ({jobsUsingPayCode.length} jobs)
              </span>
            </div>

            <div className="border-t border-default-200 pt-2 space-y-1">
              {jobDetails.map((job) => (
                <div
                  key={job.id}
                  className={`py-1 px-2 bg-default-50 rounded border border-default-200 ${
                    !disableNavigation
                      ? "cursor-pointer hover:bg-default-100"
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
                  <span className="text-xs text-default-500">{job.id}</span>
                </div>
              ))}

              {jobsUsingPayCode.length === 0 && (
                <div className="text-center text-sm text-default-500 py-2">
                  Not used in any jobs
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default JobsUsingPayCodeTooltip;
