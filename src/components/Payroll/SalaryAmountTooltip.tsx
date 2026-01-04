// src/components/Payroll/SalaryAmountTooltip.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { IconExternalLink } from "@tabler/icons-react";

interface BreakdownItem {
  description: string;
  amount: number;
  date?: string;
  source?: string;
  link?: string;
}

interface SalaryAmountTooltipProps {
  amount: number;
  breakdown?: BreakdownItem[];
  label?: string;
  className?: string;
  formatCurrency?: (value: number) => string;
}

interface TooltipPosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
}

const SalaryAmountTooltip: React.FC<SalaryAmountTooltipProps> = ({
  amount,
  breakdown = [],
  label,
  className = "",
  formatCurrency = (v) => v.toFixed(2),
}) => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({
    top: 0,
    left: 0,
    placement: "top",
  });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle delayed hide for easier hovering
  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 150); // 150ms delay before hiding
  }, []);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Handle link click
  const handleLinkClick = useCallback((link: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(link);
  }, [navigate]);

  // Calculate tooltip position based on trigger element
  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipHeight = tooltipRef.current.offsetHeight;
      const tooltipWidth = tooltipRef.current.offsetWidth;

      const spaceAbove = triggerRect.top;
      const spaceBelow = window.innerHeight - triggerRect.bottom;

      // Determine vertical placement
      const placement: "top" | "bottom" =
        spaceAbove < tooltipHeight + 10 && spaceBelow > spaceAbove
          ? "bottom"
          : "top";

      // Calculate position
      let top: number;
      if (placement === "bottom") {
        top = triggerRect.bottom + 6;
      } else {
        top = triggerRect.top - tooltipHeight - 6;
      }

      // Center horizontally relative to trigger, but keep within viewport
      let left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;

      // Ensure tooltip stays within viewport horizontally
      const padding = 8;
      if (left < padding) {
        left = padding;
      } else if (left + tooltipWidth > window.innerWidth - padding) {
        left = window.innerWidth - tooltipWidth - padding;
      }

      setTooltipPos({ top, left, placement });
    }
  }, [isVisible]);

  // Don't show tooltip if no breakdown data
  if (!breakdown || breakdown.length === 0) {
    return <span className={className}>{formatCurrency(amount)}</span>;
  }

  return (
    <span
      ref={triggerRef}
      className={`relative inline-block cursor-help border-b border-dashed border-default-400 dark:border-gray-500 ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {formatCurrency(amount)}

      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999]"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            minWidth: "240px",
            maxWidth: "320px",
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg shadow-lg p-4">
            {/* Label */}
            {label && (
              <div className="font-medium text-gray-300 dark:text-gray-200 mb-2.5 pb-2 border-b border-gray-700 dark:border-gray-600">
                {label}
              </div>
            )}

            {/* Breakdown list */}
            <div className="max-h-52 overflow-y-auto space-y-1.5">
              {breakdown.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    {item.link ? (
                      <button
                        onClick={(e) => handleLinkClick(item.link!, e)}
                        className="text-sky-400 hover:text-sky-300 hover:underline text-left flex items-center gap-1 transition-colors w-full"
                      >
                        <span className="truncate">{item.description}</span>
                        <IconExternalLink size={12} className="flex-shrink-0" />
                      </button>
                    ) : (
                      <span className="text-gray-200 truncate block">
                        {item.description}
                      </span>
                    )}
                    {item.date && (
                      <span className="text-gray-400 text-xs">
                        {item.date}
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-medium whitespace-nowrap ${
                      item.amount >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {item.amount >= 0 ? "+" : ""}
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="mt-2.5 pt-2 border-t border-gray-700 dark:border-gray-600 flex justify-between font-medium">
              <span className="text-gray-300">Total</span>
              <span className="text-white">{formatCurrency(amount)}</span>
            </div>

            {/* Arrow */}
            <div
              className={`absolute left-1/2 transform -translate-x-1/2 w-2.5 h-2.5 bg-gray-900 dark:bg-gray-700 rotate-45 ${
                tooltipPos.placement === "bottom" ? "-top-1" : "-bottom-1"
              }`}
            />
          </div>
        </div>
      )}
    </span>
  );
};

export default SalaryAmountTooltip;
