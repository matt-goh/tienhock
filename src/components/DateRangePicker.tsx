// src/components/DateRangePicker.tsx
import React, { useRef, useState } from "react";

interface DateRange {
  start: Date;
  end: Date;
}

interface DateRangePickerProps {
  dateRange: DateRange;
  onDateChange: (newDateRange: DateRange) => void;
  className?: string;
  inputClassName?: string;
  startInputWidth?: string;
  endInputWidth?: string;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  dateRange,
  onDateChange,
  className = "",
  inputClassName = "px-2 py-2 rounded-full bg-transparent outline-none",
  startInputWidth = "flex-1",
  endInputWidth = "flex-1",
}) => {
  const [isDateRangeFocused, setIsDateRangeFocused] = useState(false);
  const endDateInputRef = useRef<HTMLInputElement>(null);

  // Format date for input field
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Get date range info for validation
  const getDateRangeInfo = (start: Date, end: Date) => {
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
    const rangeDuration = end.getTime() - start.getTime();
    return {
      isWithinMonth: rangeDuration <= oneMonthMs,
      isValidDirection: rangeDuration > 0,
      rangeDuration,
    };
  };

  // Adjust date range to maintain constraints
  const adjustDateRange = (
    newDate: Date,
    type: "start" | "end",
    currentRange: DateRange
  ): DateRange => {
    const oneMonthMs = 31 * 24 * 60 * 60 * 1000;

    // Check if the new range would exceed one month
    const rangeInfo = getDateRangeInfo(
      type === "start" ? newDate : currentRange.start,
      type === "end" ? newDate : currentRange.end
    );

    if (!rangeInfo.isValidDirection) {
      // If dates are in wrong order, adjust the other date
      return type === "start"
        ? {
            start: newDate,
            end: new Date(newDate.getTime() + 24 * 60 * 60 * 1000),
          }
        : {
            start: new Date(newDate.getTime() - 24 * 60 * 60 * 1000),
            end: newDate,
          };
    }

    if (!rangeInfo.isWithinMonth) {
      // If range exceeds one month, adjust the other date
      return type === "start"
        ? { start: newDate, end: new Date(newDate.getTime() + oneMonthMs) }
        : { start: new Date(newDate.getTime() - oneMonthMs), end: newDate };
    }

    // If range is valid, return new date with existing other date
    return {
      start: type === "start" ? newDate : currentRange.start,
      end: type === "end" ? newDate : currentRange.end,
    };
  };

  const handleDateChange = (type: "start" | "end", value: string) => {
    if (!value) return;

    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return;

    const newDate = new Date(year, month - 1, day);
    if (isNaN(newDate.getTime())) return;

    // Set time based on start or end
    if (type === "end") {
      newDate.setHours(23, 59, 59, 999); // End of the day
    } else {
      newDate.setHours(0, 0, 0, 0); // Start of the day
    }

    const adjustedRange = adjustDateRange(newDate, type, dateRange);
    onDateChange(adjustedRange);

    // Auto-focus AND open the date picker for the end date input
    if (type === "start" && endDateInputRef.current) {
      setTimeout(() => {
        if (endDateInputRef.current) {
          endDateInputRef.current.focus();
          // Try the standard method first
          if (typeof endDateInputRef.current.showPicker === "function") {
            endDateInputRef.current.showPicker();
          } else {
            // Fallback - simulate a click to open the picker in older browsers
            endDateInputRef.current.click();
          }
        }
      }, 0);
    }
  };

  return (
    <div
      className={`flex items-center bg-white border ${
        isDateRangeFocused ? "border-default-500" : "border-default-300"
      } rounded-full px-4 ${className}`}
    >
      <div className="flex items-center gap-3 flex-1">
        <input
          type="date"
          value={formatDateForInput(dateRange.start)}
          onChange={(e) => handleDateChange("start", e.target.value)}
          onFocus={() => setIsDateRangeFocused(true)}
          onBlur={() => setIsDateRangeFocused(false)}
          className={`${startInputWidth} ${inputClassName}`}
        />
        <span className="text-default-400">to</span>
        <input
          ref={endDateInputRef}
          type="date"
          value={formatDateForInput(dateRange.end)}
          onChange={(e) => handleDateChange("end", e.target.value)}
          onFocus={() => setIsDateRangeFocused(true)}
          onBlur={() => setIsDateRangeFocused(false)}
          className={`${endInputWidth} ${inputClassName}`}
        />
      </div>
    </div>
  );
};

export default DateRangePicker;
