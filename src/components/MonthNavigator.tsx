// src/components/MonthNavigator.tsx
import React, { useMemo } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsRight,
} from "@tabler/icons-react";
import clsx from "clsx";

interface MonthNavigatorProps {
  /** The currently selected month */
  selectedMonth: Date;
  /** Callback when month changes */
  onChange: (date: Date) => void;
  /** Optional className for the container */
  className?: string;
  /** Whether to show the "go to current month" button (default: true) */
  showGoToCurrentButton?: boolean;
  /** Custom format function for displaying the month (default: "Month Year") */
  formatDisplay?: (date: Date) => string;
  /** Whether to allow navigating to future months (default: false) */
  allowFutureMonths?: boolean;
  /** Optional label to show above the navigator */
  label?: string;
  /** Size variant for the component */
  size?: "sm" | "md";
  /** Optional callback before month changes. Return false to cancel navigation. */
  beforeChange?: () => boolean;
  /** Optional date range to determine if full month is selected */
  dateRange?: { start: Date; end: Date };
  /** Whether to use fixed height (default: true) */
  fixedHeight?: boolean;
  /** Optional minimum navigable date (prevents navigation before this month) */
  minDate?: Date;
}

const MonthNavigator: React.FC<MonthNavigatorProps> = ({
  selectedMonth,
  onChange,
  className,
  showGoToCurrentButton = false,
  formatDisplay,
  allowFutureMonths = false,
  label,
  size = "md",
  beforeChange,
  dateRange,
  fixedHeight = true,
  minDate,
}) => {
  // Check if current month is the current calendar month
  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      selectedMonth.getFullYear() === now.getFullYear() &&
      selectedMonth.getMonth() === now.getMonth()
    );
  }, [selectedMonth]);

  // Check if selected month is at the minimum date
  const isAtMinDate = useMemo(() => {
    if (!minDate) return false;
    return (
      selectedMonth.getFullYear() === minDate.getFullYear() &&
      selectedMonth.getMonth() === minDate.getMonth()
    );
  }, [selectedMonth, minDate]);

  // Check if the full month is selected (dateRange covers entire month)
  const isFullMonthSelected = useMemo(() => {
    if (!dateRange) return true; // If no dateRange provided, assume full month

    const monthStart = new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth(),
      1
    );
    monthStart.setHours(0, 0, 0, 0);

    const monthEnd = new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth() + 1,
      0
    );
    monthEnd.setHours(23, 59, 59, 999);

    // Check if dateRange start is the first day of the month
    const startMatches =
      dateRange.start.getFullYear() === monthStart.getFullYear() &&
      dateRange.start.getMonth() === monthStart.getMonth() &&
      dateRange.start.getDate() === monthStart.getDate();

    // Check if dateRange end is the last day of the month
    const endMatches =
      dateRange.end.getFullYear() === monthEnd.getFullYear() &&
      dateRange.end.getMonth() === monthEnd.getMonth() &&
      dateRange.end.getDate() === monthEnd.getDate();

    return startMatches && endMatches;
  }, [dateRange, selectedMonth]);

  // Default format function
  const defaultFormatDisplay = (date: Date): string => {
    return date.toLocaleDateString("en-MY", {
      month: "long",
      year: "numeric",
    });
  };

  const displayFormatter = formatDisplay || defaultFormatDisplay;

  // Navigate months
  const navigateMonth = (direction: "prev" | "next") => {
    // Check beforeChange callback if provided
    if (beforeChange && !beforeChange()) {
      return;
    }
    const newDate = new Date(selectedMonth);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    onChange(newDate);
  };

  // Go to current month
  const goToCurrentMonth = () => {
    // Check beforeChange callback if provided
    if (beforeChange && !beforeChange()) {
      return;
    }
    onChange(new Date());
  };

  // Handle month display click - prioritizes selecting full month, then navigating to current month
  const handleMonthDisplayClick = () => {
    // Check beforeChange callback if provided
    if (beforeChange && !beforeChange()) {
      return;
    }

    // If not full month selected, select the full month first
    if (!isFullMonthSelected) {
      const fullMonth = new Date(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth(),
        1
      );
      onChange(fullMonth);
    } else if (!isCurrentMonth) {
      // If full month is selected but not current month, go to current month
      onChange(new Date());
    }
  };

  // Size-based classes
  const buttonClasses = clsx(
    "rounded-lg border border-default-300 dark:border-gray-600 transition-colors flex items-center justify-center",
    size === "sm" ? "p-1.5" : "p-2",
    fixedHeight && (size === "sm" ? "h-[34px]" : "h-[40px]")
  );

  const iconSize = size === "sm" ? 16 : 20;

  const displayClasses = clsx(
    "flex-1 rounded-lg border border-default-300 dark:border-gray-600 text-center font-medium text-default-900 dark:text-gray-100 transition-colors whitespace-nowrap flex items-center justify-center",
    size === "sm" ? "px-3 text-xs" : "px-4 text-sm",
    fixedHeight ? (size === "sm" ? "h-[34px]" : "h-[40px]") : (size === "sm" ? "py-1.5" : "py-2")
  );

  // Determine if next button should be disabled
  const isNextDisabled = !allowFutureMonths && isCurrentMonth;

  return (
    <div className={clsx("space-y-2", className)}>
      {label && (
        <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        {/* Previous Month Button */}
        <button
          onClick={() => navigateMonth("prev")}
          disabled={isAtMinDate}
          className={clsx(
            buttonClasses,
            isAtMinDate
              ? "cursor-not-allowed text-default-300 dark:text-gray-600"
              : "text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
          )}
          title="Previous month"
          aria-label="Previous month"
        >
          <IconChevronLeft size={iconSize} />
        </button>

        {/* Month Display - Clickable when full month is not selected OR not on current month */}
        {isFullMonthSelected && isCurrentMonth ? (
          <div className={clsx(displayClasses, "bg-default-50 dark:bg-gray-900/50")}>
            {displayFormatter(selectedMonth)}
          </div>
        ) : (
          <button
            onClick={handleMonthDisplayClick}
            className={clsx(
              displayClasses,
              "bg-default-50 dark:bg-gray-900/50 hover:bg-sky-50 dark:hover:bg-sky-900/30 hover:border-sky-300 dark:hover:border-sky-700 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer"
            )}
            title={
              !isFullMonthSelected
                ? "Click to select full month"
                : "Click to go to current month"
            }
            aria-label={
              !isFullMonthSelected ? "Select full month" : "Go to current month"
            }
          >
            {displayFormatter(selectedMonth)}
          </button>
        )}

        {/* Next Month Button */}
        <button
          onClick={() => navigateMonth("next")}
          disabled={isNextDisabled}
          className={clsx(
            buttonClasses,
            isNextDisabled
              ? "cursor-not-allowed text-default-300 dark:text-gray-600"
              : "text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
          )}
          title="Next month"
          aria-label="Next month"
        >
          <IconChevronRight size={iconSize} />
        </button>

        {/* Go to Current Month Button (optional) */}
        {showGoToCurrentButton && (
          <button
            onClick={goToCurrentMonth}
            disabled={isCurrentMonth}
            title="Go to current month"
            aria-label="Go to current month"
            className={clsx(
              buttonClasses,
              isCurrentMonth
                ? "cursor-not-allowed text-default-300 dark:text-gray-600"
                : "text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
            )}
          >
            <IconChevronsRight size={iconSize} />
          </button>
        )}
      </div>
    </div>
  );
};

export default MonthNavigator;
