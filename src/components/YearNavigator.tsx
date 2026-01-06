// src/components/YearNavigator.tsx
import React, { useMemo } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsRight,
} from "@tabler/icons-react";
import clsx from "clsx";

interface YearNavigatorProps {
  /** The currently selected year */
  selectedYear: number;
  /** Callback when year changes */
  onChange: (year: number) => void;
  /** Optional className for the container */
  className?: string;
  /** Whether to show the "go to current year" button (default: true) */
  showGoToCurrentButton?: boolean;
  /** Whether to allow navigating to future years (default: false) */
  allowFutureYears?: boolean;
  /** Optional label to show above the navigator */
  label?: string;
  /** Size variant for the component */
  size?: "sm" | "md";
  /** Optional callback before year changes. Return false to cancel navigation. */
  beforeChange?: () => boolean;
}

const YearNavigator: React.FC<YearNavigatorProps> = ({
  selectedYear,
  onChange,
  className,
  showGoToCurrentButton = true,
  allowFutureYears = false,
  label,
  size = "md",
  beforeChange,
}) => {
  const currentYear = new Date().getFullYear();

  // Check if selected year is the current calendar year
  const isCurrentYear = useMemo(() => {
    return selectedYear === currentYear;
  }, [selectedYear, currentYear]);

  // Navigate years
  const navigateYear = (direction: "prev" | "next") => {
    // Check beforeChange callback if provided
    if (beforeChange && !beforeChange()) {
      return;
    }
    if (direction === "prev") {
      onChange(selectedYear - 1);
    } else {
      onChange(selectedYear + 1);
    }
  };

  // Go to current year
  const goToCurrentYear = () => {
    // Check beforeChange callback if provided
    if (beforeChange && !beforeChange()) {
      return;
    }
    onChange(currentYear);
  };

  // Size-based classes
  const buttonClasses = clsx(
    "rounded-lg border border-default-300 dark:border-gray-600 transition-colors",
    size === "sm" ? "p-1.5 h-[34px]" : "p-2 h-[40px]"
  );

  const iconSize = size === "sm" ? 16 : 20;

  const displayClasses = clsx(
    "flex-1 rounded-lg border border-default-300 dark:border-gray-600 text-center font-medium text-default-900 dark:text-gray-100 transition-colors whitespace-nowrap",
    size === "sm" ? "px-3 py-1.5 h-[34px] text-xs" : "px-4 py-2 h-[40px] text-sm"
  );

  // Determine if next button should be disabled
  const isNextDisabled = !allowFutureYears && isCurrentYear;

  return (
    <div className={clsx("space-y-2", className)}>
      {label && (
        <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        {/* Previous Year Button */}
        <button
          onClick={() => navigateYear("prev")}
          className={clsx(buttonClasses, "text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700")}
          title="Previous year"
          aria-label="Previous year"
        >
          <IconChevronLeft size={iconSize} />
        </button>

        {/* Year Display - Clickable when not current year */}
        {isCurrentYear ? (
          <div className={clsx(displayClasses, "bg-default-50 dark:bg-gray-900/50")}>
            {selectedYear}
          </div>
        ) : (
          <button
            onClick={goToCurrentYear}
            className={clsx(
              displayClasses,
              "bg-default-50 dark:bg-gray-900/50 hover:bg-sky-50 dark:hover:bg-sky-900 hover:border-sky-300 dark:hover:border-sky-600 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer"
            )}
            title="Click to go to current year"
            aria-label="Go to current year"
          >
            {selectedYear}
          </button>
        )}

        {/* Next Year Button */}
        <button
          onClick={() => navigateYear("next")}
          disabled={isNextDisabled}
          className={clsx(
            buttonClasses,
            isNextDisabled
              ? "cursor-not-allowed text-default-300 dark:text-gray-600"
              : "text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
          )}
          title="Next year"
          aria-label="Next year"
        >
          <IconChevronRight size={iconSize} />
        </button>

        {/* Go to Current Year Button (optional) */}
        {showGoToCurrentButton && (
          <button
            onClick={goToCurrentYear}
            disabled={isCurrentYear}
            title="Go to current year"
            aria-label="Go to current year"
            className={clsx(
              buttonClasses,
              isCurrentYear
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

export default YearNavigator;
