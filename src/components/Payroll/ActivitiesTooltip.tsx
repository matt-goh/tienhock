// src/components/Payroll/ActivitiesTooltip.tsx
import { IconLink } from "@tabler/icons-react";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ActivityItem } from "./ManageActivitiesModal";
import SafeLink from "../SafeLink";

interface ActivitiesTooltipProps {
  activities: ActivityItem[];
  employeeName?: string;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  hasUnsavedChanges?: boolean;
  onNavigateAttempt?: (to: string) => void;
  logDate?: string; // Log date for displaying correct OT threshold (5 for Saturday, 8 for others)
  showBelow?: boolean; // Show tooltip below button instead of above (for top rows)
  isDoubled?: boolean; // Whether x2 doubling is active for SALESMAN_IKUT
}

// Paycodes that are doubled when x2 is active for SALESMAN_IKUT
const DOUBLED_PAYCODES = ["BILL", "ELAUN_MT", "ELAUN_MO", "IKUT", "4-COMM_MUAT_MEE", "5-COMM_MUAT_BH"];

const ActivitiesTooltip: React.FC<ActivitiesTooltipProps> = ({
  activities,
  employeeName,
  className = "",
  disabled,
  onClick,
  hasUnsavedChanges = false,
  onNavigateAttempt = () => {},
  logDate,
  showBelow = false,
  isDoubled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isVisible && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      if (showBelow) {
        // Position directly below the button, aligned to button's right edge
        setPosition({
          top: rect.bottom + 10,
          left: rect.right,
        });
      } else {
        // Position directly above the button, aligned to button's right edge
        setPosition({
          top: rect.top - 10,
          left: rect.right,
        });
      }
    }
  }, [isVisible, showBelow]);

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

  // Calculate total amount
  const totalAmount = activities.reduce(
    (sum, activity) => sum + activity.calculatedAmount,
    0
  );

  // Sort activities: doubled paycodes first when x2 is active
  const sortedActivities = isDoubled
    ? [...activities].sort((a, b) => {
        const aIsDoubled = DOUBLED_PAYCODES.includes(a.payCodeId);
        const bIsDoubled = DOUBLED_PAYCODES.includes(b.payCodeId);
        if (aIsDoubled && !bIsDoubled) return -1;
        if (!aIsDoubled && bIsDoubled) return 1;
        return 0;
      })
    : activities;

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled && onClick) {
            onClick();
          }
        }}
        className={`text-sky-600 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 disabled:text-default-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed ${className}`}
        type="button"
        disabled={disabled}
      >
        {activities.length > 0 && (
          <span className="mr-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300 text-xs">
            {activities.length}
          </span>
        )}
        Manage Activities
      </button>

      {isVisible &&
        activities.length > 0 &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 shadow-lg rounded-lg p-4 w-96 transform -translate-y-full opacity-0 transition-opacity duration-200 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              maxHeight: "400px",
              opacity: isVisible ? 1 : 0,
              transform: showBelow ? `translate(-100%, 0)` : `translate(-100%, -100%)`,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => e.stopPropagation()}
          >
            {/* --- Sticky Header --- */}
            <div className="flex-shrink-0">
              <div className="text-sm font-medium text-default-700 dark:text-gray-200 mb-1 flex justify-between items-center">
                <span className="text-base">Applied Activities</span>
                <span className="text-xs text-default-500 dark:text-gray-400">
                  ({activities.length} total)
                </span>
              </div>
              {employeeName && (
                <div className="text-sm text-default-600 dark:text-gray-300 mb-2">
                  Employee: <span className="font-medium">{employeeName}</span>
                </div>
              )}
              {/* Separator line */}
              <div className="border-t border-default-200 dark:border-gray-700"></div>
            </div>

            {/* --- Scrollable Content --- */}
            <div className="flex-grow overflow-y-auto py-3 space-y-3 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {sortedActivities.map((activity, index) => (
                <div
                  key={index}
                  className="flex justify-between items-start text-sm"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div
                      className="font-medium text-default-800 dark:text-gray-100 flex items-center"
                      title={`${activity.description} (${activity.payCodeId})`}
                    >
                      <SafeLink
                        to={`/catalogue/pay-codes?desc=${activity.payCodeId}`}
                        hasUnsavedChanges={hasUnsavedChanges}
                        onNavigateAttempt={onNavigateAttempt}
                        className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline truncate w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {activity.description}
                      </SafeLink>
                      {isDoubled && DOUBLED_PAYCODES.includes(activity.payCodeId) && (
                        <span className="ml-1 flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                          x2
                        </span>
                      )}
                      {activity.payType === "Overtime" && (
                        <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                          (OT)
                        </span>
                      )}
                      {activity.isContextLinked && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                          <IconLink size={10} className="mr-0.5" />
                          Linked
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 text-default-500 dark:text-gray-400 text-xs mt-0.5">
                      <span>{activity.payType}</span>
                      <span>•</span>
                      <span>{activity.rateUnit}</span>
                      {activity.rateUnit !== "Percent" &&
                        activity.rateUnit !== "Fixed" &&
                        activity.rateUnit !== "Trip" &&
                        activity.rateUnit !== "Day" && (
                          <>
                            <span>•</span>
                            <span
                              className="truncate"
                              title={`RM${activity.rate.toFixed(2)}/${
                                activity.rateUnit
                              }`}
                            >
                              @ RM{activity.rate.toFixed(2)}/{activity.rateUnit}
                            </span>
                          </>
                        )}
                      {activity.rateUnit === "Percent" && (
                        <>
                          <span>•</span>
                          <span className="truncate">@ {activity.rate}%</span>
                        </>
                      )}
                      {/* For Fixed: only show base rate if no units provided */}
                      {activity.rateUnit === "Fixed" &&
                        !(activity.unitsProduced !== null && activity.unitsProduced !== undefined && activity.unitsProduced > 0) && (
                        <>
                          <span>•</span>
                          <span className="truncate">
                            @ RM{activity.rate.toFixed(2)}
                          </span>
                        </>
                      )}
                      {(activity.rateUnit === "Trip" ||
                        activity.rateUnit === "Day") && (
                        <>
                          <span>•</span>
                          <span className="truncate">
                            @ RM{activity.rate.toFixed(2)}
                          </span>
                        </>
                      )}
                      {/* Show units produced for non-Hour units or when explicitly available */}
                      {activity.unitsProduced !== null &&
                        activity.unitsProduced !== undefined &&
                        activity.unitsProduced > 0 &&
                        activity.rateUnit !== "Hour" &&
                        activity.rateUnit !== "Bill" && (
                          <span className="text-default-500 dark:text-gray-400">
                            • {activity.rateUnit === "Fixed"
                              ? `RM${activity.unitsProduced.toFixed(2)}`
                              : `${activity.unitsProduced} ${activity.rateUnit === "Percent" ? "Units" : activity.rateUnit}`}
                          </span>
                        )}
                      {/* Show FOC units when available */}
                      {activity.unitsFOC !== null &&
                        activity.unitsFOC !== undefined &&
                        activity.unitsFOC > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            • {activity.unitsFOC} FOC
                          </span>
                        )}
                      {activity.payType === "Overtime" &&
                        (activity.rateUnit === "Hour" || activity.rateUnit === "Bill") && (
                          <span
                            className="text-amber-600 dark:text-amber-400 truncate"
                            title={`(Hours > ${logDate && new Date(logDate).getDay() === 6 ? 5 : 8})`}
                          >
                            (Hours {">"} {logDate && new Date(logDate).getDay() === 6 ? 5 : 8})
                          </span>
                        )}
                    </div>
                  </div>
                  <div className="font-medium text-default-900 dark:text-gray-100 whitespace-nowrap">
                    RM{activity.calculatedAmount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* --- Sticky Footer --- */}
            <div className="flex-shrink-0">
              <div className="border-t border-default-200 dark:border-gray-700 pt-3 flex justify-between items-center">
                <span className="font-medium text-default-800 dark:text-gray-100">Total</span>
                <span className="font-semibold text-default-900 dark:text-gray-100 text-base">
                  RM{totalAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default ActivitiesTooltip;
