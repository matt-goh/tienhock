import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface ActivityItem {
  payCodeId: string;
  description: string;
  payType: string;
  rateUnit: string;
  rate: number;
  unitsProduced?: number;
  calculatedAmount: number;
}

interface ActivitiesTooltipProps {
  activities: ActivityItem[];
  employeeName?: string;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}

const ActivitiesTooltip: React.FC<ActivitiesTooltipProps> = ({
  activities,
  employeeName,
  className = "",
  disabled,
  onClick,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isVisible && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Position directly above the button, aligned to button's right edge
      setPosition({
        top: rect.top - 10,
        left: rect.right, // Set to button's right edge
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
    }, 100); // Short delay before showing
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

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={disabled ? undefined : onClick}
        className={`text-sky-600 hover:text-sky-900 disabled:text-default-300 disabled:cursor-not-allowed ${className}`}
        type="button"
        disabled={disabled}
      >
        {activities.length > 0 && (
          <span className="mr-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-100 text-sky-600 text-xs">
            {activities.length}
          </span>
        )}
        Manage Activities
      </button>

      {isVisible &&
        activities.length > 0 &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-4 w-96 transform -translate-y-full opacity-0 transition-opacity duration-200 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              maxHeight: "400px",
              opacity: isVisible ? 1 : 0,
              transform: `translate(-100%, -100%)`,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* --- Sticky Header --- */}
            <div className="flex-shrink-0">
              <div className="text-sm font-medium text-default-700 mb-1 flex justify-between items-center">
                <span className="text-base">Applied Activities</span>
                <span className="text-xs text-default-500">
                  ({activities.length} total)
                </span>
              </div>
              {employeeName && (
                <div className="text-sm text-default-600 mb-2">
                  Employee: <span className="font-medium">{employeeName}</span>
                </div>
              )}
              {/* Separator line */}
              <div className="border-t border-default-200"></div>
            </div>

            {/* --- Scrollable Content --- */}
            <div className="flex-grow overflow-y-auto py-3 space-y-3 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {activities.map((activity, index) => (
                <div
                  key={index}
                  className="flex justify-between items-start text-sm"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div
                      className="font-medium text-default-800 truncate"
                      title={activity.description}
                    >
                      {activity.description}
                    </div>
                    <div className="flex gap-2 text-default-500 text-xs mt-0.5">
                      <span>{activity.payType}</span>
                      <span>•</span>
                      <span>{activity.rateUnit}</span>
                      {/* Add rate display */}
                      {activity.rateUnit !== "Day" && (
                        <>
                          <span>•</span>
                          <span>
                            @ RM{activity.rate.toFixed(2)}/{activity.rateUnit}
                          </span>
                        </>
                      )}
                      {activity.rateUnit === "Day" && (
                        <>
                          <span>•</span>
                          <span>@ RM{activity.rate.toFixed(2)}/Day</span>
                        </>
                      )}
                      {activity.unitsProduced !== undefined && (
                        <>
                          <span>•</span>
                          <span>{activity.unitsProduced} units</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="font-medium text-default-900 whitespace-nowrap">
                    RM{activity.calculatedAmount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* --- Sticky Footer --- */}
            <div className="flex-shrink-0">
              <div className="border-t border-default-200 pt-3 flex justify-between items-center">
                <span className="font-medium text-default-800">Total</span>
                <span className="font-semibold text-default-900 text-base">
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
