// src/components/MonthNavigator.tsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsRight,
} from "@tabler/icons-react";
import clsx from "clsx";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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
  /** Dropdown placement relative to the month button (default: bottom-center) */
  pickerPlacement?: "bottom-center" | "bottom-right" | "bottom-left-button";
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
  pickerPlacement = "bottom-center",
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

  // Dropdown month picker state
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedMonth.getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);
  const navigatorRowRef = useRef<HTMLDivElement>(null);
  const [pickerLeftOffset, setPickerLeftOffset] = useState<number>(0);

  // Reset the viewed year to the selected month's year whenever the picker opens
  useEffect(() => {
    if (isPickerOpen) {
      setViewYear(selectedMonth.getFullYear());
    }
  }, [isPickerOpen, selectedMonth]);

  useLayoutEffect(() => {
    if (
      !isPickerOpen ||
      pickerPlacement !== "bottom-left-button" ||
      !navigatorRowRef.current ||
      !pickerRef.current
    ) {
      setPickerLeftOffset(0);
      return;
    }

    const navigatorRowRect: DOMRect = navigatorRowRef.current.getBoundingClientRect();
    const pickerAnchorRect: DOMRect = pickerRef.current.getBoundingClientRect();

    setPickerLeftOffset(navigatorRowRect.left - pickerAnchorRect.left);
  }, [isPickerOpen, pickerPlacement, selectedMonth, size, showGoToCurrentButton]);

  // Close the picker when clicking outside or pressing Escape
  useEffect(() => {
    if (!isPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPickerOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPickerOpen]);

  // Toggle the dropdown month picker
  const handleMonthDisplayClick = () => {
    setIsPickerOpen((prev) => !prev);
  };

  // Determine if a given year/month is disabled in the picker
  const now = new Date();
  const isMonthOptionDisabled = (year: number, month: number): boolean => {
    if (
      !allowFutureMonths &&
      (year > now.getFullYear() ||
        (year === now.getFullYear() && month > now.getMonth()))
    ) {
      return true;
    }
    if (
      minDate &&
      (year < minDate.getFullYear() ||
        (year === minDate.getFullYear() && month < minDate.getMonth()))
    ) {
      return true;
    }
    return false;
  };

  // Select a month from the dropdown
  const handleSelectMonth = (year: number, month: number) => {
    if (isMonthOptionDisabled(year, month)) return;
    // Check beforeChange callback if provided
    if (beforeChange && !beforeChange()) {
      return;
    }
    onChange(new Date(year, month, 1));
    setIsPickerOpen(false);
  };

  // Year navigation within the dropdown
  const isPrevYearDisabled = minDate
    ? viewYear <= minDate.getFullYear()
    : false;
  const isNextYearDisabled = !allowFutureMonths
    ? viewYear >= now.getFullYear()
    : false;

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
  const pickerPlacementClasses = clsx(
    pickerPlacement === "bottom-center" && "left-1/2 -translate-x-1/2",
    (pickerPlacement === "bottom-right" ||
      pickerPlacement === "bottom-left-button") &&
      "left-0"
  );
  const pickerPlacementStyle: React.CSSProperties | undefined =
    pickerPlacement === "bottom-left-button"
      ? { transform: `translateX(${pickerLeftOffset}px)` }
      : undefined;

  // Determine if next button should be disabled
  const isNextDisabled = !allowFutureMonths && isCurrentMonth;

  return (
    <div className={clsx("space-y-2", className)}>
      {label && (
        <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
          {label}
        </label>
      )}
      <div ref={navigatorRowRef} className="flex items-center gap-2">
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

        {/* Month Display - Click to open a dropdown to pick any (previous) month */}
        <div className="relative flex-1" ref={pickerRef}>
          <button
            type="button"
            onClick={handleMonthDisplayClick}
            className={clsx(
              displayClasses,
              "w-full bg-default-50 dark:bg-gray-900/50 hover:bg-sky-50 dark:hover:bg-sky-900/30 hover:border-sky-300 dark:hover:border-sky-700 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer"
            )}
            title="Click to select a month"
            aria-label="Select a month"
            aria-haspopup="true"
            aria-expanded={isPickerOpen}
          >
            {displayFormatter(selectedMonth)}
          </button>

          {isPickerOpen && (
            <div
              className={clsx(
                "absolute z-50 mt-2 rounded-lg border border-default-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-3",
                pickerPlacementClasses,
                size === "sm" ? "w-56" : "w-64"
              )}
              style={pickerPlacementStyle}
            >
              {/* Year navigation */}
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y - 1)}
                  disabled={isPrevYearDisabled}
                  className={clsx(
                    "p-1 rounded-md transition-colors",
                    isPrevYearDisabled
                      ? "cursor-not-allowed text-default-300 dark:text-gray-600"
                      : "text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
                  )}
                  aria-label="Previous year"
                >
                  <IconChevronLeft size={18} />
                </button>
                <span className="text-sm font-semibold text-default-900 dark:text-gray-100">
                  {viewYear}
                </span>
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y + 1)}
                  disabled={isNextYearDisabled}
                  className={clsx(
                    "p-1 rounded-md transition-colors",
                    isNextYearDisabled
                      ? "cursor-not-allowed text-default-300 dark:text-gray-600"
                      : "text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
                  )}
                  aria-label="Next year"
                >
                  <IconChevronRight size={18} />
                </button>
              </div>

              {/* Month grid */}
              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_LABELS.map((monthLabel, monthIndex) => {
                  const disabled = isMonthOptionDisabled(viewYear, monthIndex);
                  const isSelected =
                    selectedMonth.getFullYear() === viewYear &&
                    selectedMonth.getMonth() === monthIndex;
                  return (
                    <button
                      key={monthLabel}
                      type="button"
                      onClick={() => handleSelectMonth(viewYear, monthIndex)}
                      disabled={disabled}
                      className={clsx(
                        "py-1.5 text-sm rounded-md transition-colors",
                        disabled
                          ? "cursor-not-allowed text-default-300 dark:text-gray-600"
                          : isSelected
                          ? "bg-sky-500 text-white hover:bg-sky-600"
                          : "text-default-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-sky-900/30"
                      )}
                    >
                      {monthLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

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
