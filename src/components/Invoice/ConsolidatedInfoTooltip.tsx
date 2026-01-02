// src/components/Invoice/ConsolidatedInfoTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

interface ConsolidatedInfoTooltipProps {
  invoices: string[];
  className?: string;
  disableNavigation?: boolean; // New prop
}

const ConsolidatedInfoTooltip: React.FC<ConsolidatedInfoTooltipProps> = ({
  invoices,
  className = "",
  disableNavigation = false, // Default to false to maintain existing behavior
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isVisible && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
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
    }, 500); // Longer delay before hiding
  };

  if (!invoices || invoices.length === 0) return null;

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`text-default-400 dark:text-gray-500 hover:text-default-600 dark:text-gray-300 cursor-help inline-flex ${className}`}
      >
        <IconInfoCircle size={16} />
      </span>

      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 shadow-lg rounded-lg p-4 w-96 transform -translate-x-1/2 -translate-y-full opacity-0 transition-opacity duration-200"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              maxHeight: "400px",
              overflowY: "auto",
              opacity: isVisible ? 1 : 0,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2 flex justify-between items-center">
              <span>Consolidated Invoices</span>
              <span className="text-xs text-default-500 dark:text-gray-400">
                ({invoices.length} invoices)
              </span>
            </div>

            <div className="border-t border-default-200 dark:border-gray-700 pt-2 grid grid-cols-4 gap-1">
              {invoices.map((invoice, index) => (
                <div
                  key={index}
                  className={`text-center text-xs py-1 px-2 bg-default-50 dark:bg-gray-800 rounded border border-default-200 ${
                    !disableNavigation
                      ? "cursor-pointer hover:bg-default-100"
                      : ""
                  } transition-colors duration-200`}
                  title={`Invoice #${invoice}`}
                  onClick={() => {
                    if (!disableNavigation) {
                      navigate(`${invoice}`);
                    }
                  }}
                >
                  {invoice}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default ConsolidatedInfoTooltip;
