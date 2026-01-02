// src/components/Payroll/ContextLinkedBadge.tsx
import React, { useState, useRef } from "react";
import { IconLink } from "@tabler/icons-react";
import { createPortal } from "react-dom";

interface ContextLinkedBadgeProps {
  contextFieldLabel: string;
  contextValue?: number;
  className?: string;
}

const ContextLinkedBadge: React.FC<ContextLinkedBadgeProps> = ({
  contextFieldLabel,
  contextValue,
  className = "",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const badgeRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
      });
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 100);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  return (
    <>
      <span
        ref={badgeRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300 cursor-help ${className}`}
      >
        <IconLink size={12} className="mr-1" />
        Linked
      </span>

      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 shadow-lg rounded-lg p-3 w-auto transform -translate-x-1/2 -translate-y-full opacity-0 transition-opacity duration-200"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              opacity: isVisible ? 1 : 0,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
              Context-Linked Pay Code
            </div>
            <div className="text-sm text-default-600 dark:text-gray-300">
              This pay code is automatically calculated based on{" "}
              <span className="font-medium">{contextFieldLabel}</span>
              {contextValue !== undefined && (
                <span className="block mt-1">
                  Current value:{" "}
                  <span className="font-medium">{contextValue}</span>
                </span>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default ContextLinkedBadge;
