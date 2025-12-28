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
}

const MonthNavigator: React.FC<MonthNavigatorProps> = ({
  selectedMonth,
  onChange,
  className,
  showGoToCurrentButton = true,
  formatDisplay,
  allowFutureMonths = false,
  label,
  size = "md",
  beforeChange,
}) => {
  // Check if current month is the current calendar month
  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      selectedMonth.getFullYear() === now.getFullYear() &&
      selectedMonth.getMonth() === now.getMonth()
    );
  }, [selectedMonth]);

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

  // Size-based classes
  const buttonClasses = clsx(
    "rounded-lg border border-default-300 transition-colors",
    size === "sm" ? "p-1.5" : "p-2"
  );

  const iconSize = size === "sm" ? 16 : 20;

  const displayClasses = clsx(
    "flex-1 rounded-lg border border-default-300 text-center font-medium text-default-900 transition-colors whitespace-nowrap",
    size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
  );

  // Determine if next button should be disabled
  const isNextDisabled = !allowFutureMonths && isCurrentMonth;

  return (
    <div className={clsx("space-y-2", className)}>
      {label && (
        <label className="block text-sm font-medium text-default-700">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        {/* Previous Month Button */}
        <button
          onClick={() => navigateMonth("prev")}
          className={clsx(buttonClasses, "text-default-600 hover:bg-default-50")}
          title="Previous month"
          aria-label="Previous month"
        >
          <IconChevronLeft size={iconSize} />
        </button>

        {/* Month Display - Clickable when not on current month */}
        {isCurrentMonth ? (
          <div className={clsx(displayClasses, "bg-default-50")}>
            {displayFormatter(selectedMonth)}
          </div>
        ) : (
          <button
            onClick={goToCurrentMonth}
            className={clsx(
              displayClasses,
              "bg-default-50 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700 cursor-pointer"
            )}
            title="Click to go to current month"
            aria-label="Go to current month"
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
              ? "cursor-not-allowed text-default-300"
              : "text-default-600 hover:bg-default-50"
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
                ? "cursor-not-allowed text-default-300"
                : "text-default-600 hover:bg-default-50"
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
