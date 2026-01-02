// src/components/DateNavigator.tsx
import React, { useMemo } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsRight,
} from "@tabler/icons-react";
import clsx from "clsx";

interface DateNavigatorProps {
  /** The currently selected date */
  selectedDate: Date;
  /** Callback when date changes */
  onChange: (date: Date) => void;
  /** Optional className for the container */
  className?: string;
  /** Whether to show the "go to today" button (default: true) */
  showGoToTodayButton?: boolean;
  /** Custom format function for displaying the date (default: "dd MMM yyyy") */
  formatDisplay?: (date: Date) => string;
  /** Whether to allow navigating to future dates (default: true) */
  allowFutureDates?: boolean;
  /** Optional label to show above the navigator */
  label?: string;
  /** Size variant for the component */
  size?: "sm" | "md";
  /** Optional callback before date changes. Return false to cancel navigation. */
  beforeChange?: () => boolean;
}

const DateNavigator: React.FC<DateNavigatorProps> = ({
  selectedDate,
  onChange,
  className,
  showGoToTodayButton = true,
  formatDisplay,
  allowFutureDates = false,
  label,
  size = "md",
  beforeChange,
}) => {
  // Check if current date is today
  const isToday = useMemo(() => {
    const now = new Date();
    return (
      selectedDate.getFullYear() === now.getFullYear() &&
      selectedDate.getMonth() === now.getMonth() &&
      selectedDate.getDate() === now.getDate()
    );
  }, [selectedDate]);

  // Default format function
  const defaultFormatDisplay = (date: Date): string => {
    return date.toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const displayFormatter = formatDisplay || defaultFormatDisplay;

  // Navigate days
  const navigateDay = (direction: "prev" | "next") => {
    // Check beforeChange callback if provided
    if (beforeChange && !beforeChange()) {
      return;
    }
    const newDate = new Date(selectedDate);
    if (direction === "prev") {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    onChange(newDate);
  };

  // Go to today
  const goToToday = () => {
    // Check beforeChange callback if provided
    if (beforeChange && !beforeChange()) {
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    onChange(today);
  };

  // Size-based classes
  const buttonClasses = clsx(
    "rounded-lg border border-default-300 dark:border-gray-600 transition-colors flex items-center justify-center",
    size === "sm" ? "p-1.5 h-[34px]" : "p-2 h-[40px]"
  );

  const iconSize = size === "sm" ? 16 : 20;

  const displayClasses = clsx(
    "flex-1 rounded-lg border border-default-300 dark:border-gray-600 text-center font-medium text-default-900 dark:text-gray-100 transition-colors whitespace-nowrap flex items-center justify-center",
    size === "sm" ? "px-3 h-[34px] text-xs" : "px-4 h-[40px] text-sm"
  );

  // Determine if next button should be disabled
  const isNextDisabled = !allowFutureDates && isToday;

  return (
    <div className={clsx("space-y-2", className)}>
      {label && (
        <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        {/* Previous Day Button */}
        <button
          onClick={() => navigateDay("prev")}
          className={clsx(buttonClasses, "text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700")}
          title="Previous day"
          aria-label="Previous day"
        >
          <IconChevronLeft size={iconSize} />
        </button>

        {/* Date Display - Clickable when not today */}
        {isToday ? (
          <div className={clsx(displayClasses, "bg-default-50 dark:bg-gray-900/50")}>
            {displayFormatter(selectedDate)}
          </div>
        ) : (
          <button
            onClick={goToToday}
            className={clsx(
              displayClasses,
              "bg-default-50 dark:bg-gray-900/50 hover:bg-sky-50 dark:hover:bg-sky-900/30 hover:border-sky-300 dark:hover:border-sky-700 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer"
            )}
            title="Click to go to today"
            aria-label="Go to today"
          >
            {displayFormatter(selectedDate)}
          </button>
        )}

        {/* Next Day Button */}
        <button
          onClick={() => navigateDay("next")}
          disabled={isNextDisabled}
          className={clsx(
            buttonClasses,
            isNextDisabled
              ? "cursor-not-allowed text-default-300 dark:text-gray-600"
              : "text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
          )}
          title="Next day"
          aria-label="Next day"
        >
          <IconChevronRight size={iconSize} />
        </button>

        {/* Go to Today Button (optional) */}
        {showGoToTodayButton && (
          <button
            onClick={goToToday}
            disabled={isToday}
            title="Go to today"
            aria-label="Go to today"
            className={clsx(
              buttonClasses,
              isToday
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

export default DateNavigator;
