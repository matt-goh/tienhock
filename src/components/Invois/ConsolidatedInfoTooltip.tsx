// src/components/Invois/ConsolidatedInfoTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { IconInfoCircle } from "@tabler/icons-react";

interface ConsolidatedInfoTooltipProps {
  invoices: number[] | string[];
}

const ConsolidatedInfoTooltip: React.FC<ConsolidatedInfoTooltipProps> = ({
  invoices,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    }, 300); // Longer delay before hiding
  };

  if (!invoices || invoices.length === 0) return null;

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="text-default-400 hover:text-default-600 cursor-help ml-2"
      >
        <IconInfoCircle size={16} />
      </span>

      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-4 w-96 transform -translate-x-1/2 -translate-y-full"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              maxHeight: "280px",
              overflowY: "auto",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="text-sm font-medium text-default-700 mb-2 flex justify-between items-center">
              <span>Consolidated Invoices</span>
              <span className="text-xs text-default-500">
                ({invoices.length} invoices)
              </span>
            </div>

            <div className="border-t border-default-200 pt-2 grid grid-cols-5 gap-1">
              {invoices.map((invoice, index) => (
                <div
                  key={index}
                  className="text-center text-xs py-1 px-2 bg-default-50 rounded border border-default-200"
                  title={`Invoice #${invoice}`}
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
