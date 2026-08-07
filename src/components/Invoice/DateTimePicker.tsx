// src/components/Invoice/DateTimePicker.tsx
// Invoice date/time picker: the date half reuses TimeNavigator (same calendar
// UX as every other date field) and the time half is a compact hour/minute
// selector that replaces the old vanilla `type="time"` / `datetime-local`
// inputs.
import React, { useEffect, useRef, useState } from "react";
import { IconClock, IconSelector } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import TimeNavigator, { TimeRange } from "../TimeNavigator";

const pad2 = (value: number): string => String(value).padStart(2, "0");

export const formatTimeValue = (date: Date | null): string =>
  date
    ? `${pad2(date.getHours() % 12 || 12)}:${pad2(date.getMinutes())} ${
        date.getHours() < 12 ? "AM" : "PM"
      }`
    : "--:--";

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

interface TimeSelectorProps {
  value: Date | null;
  onChange: (value: Date) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  triggerClassName?: string;
}

export const TimeSelector: React.FC<TimeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  size = "md",
  className,
  triggerClassName,
}) => {
  const { t } = useTranslation("common");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const currentHour = value ? value.getHours() : 0;
  const currentMinute = value ? value.getMinutes() : 0;
  const currentHour12 = currentHour % 12 || 12;
  const isPM = currentHour >= 12;

  const apply = (
    hour12: number,
    minute: number,
    pm: boolean,
    close: boolean
  ): void => {
    const base = value ? new Date(value) : new Date();
    const hour24 = pm ? (hour12 % 12) + 12 : hour12 % 12;
    base.setHours(hour24, minute, 0, 0);
    onChange(base);
    if (close) setIsOpen(false);
  };

  const heightClass = size === "sm" ? "h-[34px]" : "h-[40px]";
  const textClass = size === "sm" ? "text-xs" : "text-sm";
  const iconSize = size === "sm" ? 16 : 18;

  return (
    <div
      ref={containerRef}
      className={clsx("relative inline-flex items-center", className)}
    >
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((open) => !open)}
        disabled={disabled}
        className={clsx(
          "inline-flex items-center gap-2 rounded-lg border bg-default-50 dark:bg-gray-900/50 font-medium text-default-900 dark:text-gray-100 transition-colors",
          size === "sm" ? "px-2.5" : "px-3",
          heightClass,
          textClass,
          disabled
            ? "cursor-not-allowed border-default-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            : isOpen
              ? "border-sky-500 ring-1 ring-sky-500"
              : "border-default-300 dark:border-gray-600 hover:border-default-400 dark:hover:border-gray-500",
          triggerClassName
        )}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title={t("Change time")}
      >
        <IconClock
          size={iconSize}
          className="text-default-400 dark:text-gray-500 flex-shrink-0"
        />
        <span className="min-w-0 truncate tabular-nums">
          {formatTimeValue(value)}
        </span>
        <IconSelector
          size={iconSize}
          className="text-default-400 dark:text-gray-500 flex-shrink-0"
        />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 z-50 mt-2 w-[250px] rounded-xl border border-default-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl p-3 animate-fadeIn"
          role="dialog"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-default-400 dark:text-gray-500">
                {t("Hour")}
              </p>
              <div className="grid max-h-44 grid-cols-4 gap-1 overflow-y-auto pr-1">
                {HOURS_12.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => apply(hour, currentMinute, isPM, false)}
                    className={clsx(
                      "h-8 rounded-md text-xs font-medium tabular-nums transition-colors",
                      hour === currentHour12
                        ? "bg-sky-500 text-white"
                        : "text-default-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-sky-900/30"
                    )}
                  >
                    {pad2(hour)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-default-400 dark:text-gray-500">
                {t("Minute")}
              </p>
              <div className="grid max-h-44 grid-cols-4 gap-1 overflow-y-auto pr-1">
                {MINUTES.map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    onClick={() =>
                      apply(currentHour12, minute, isPM, true)
                    }
                    className={clsx(
                      "h-8 rounded-md text-xs font-medium tabular-nums transition-colors",
                      minute === currentMinute
                        ? "bg-sky-500 text-white"
                        : "text-default-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-sky-900/30"
                    )}
                  >
                    {pad2(minute)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => apply(currentHour12, currentMinute, false, false)}
              className={clsx(
                "h-8 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors",
                !isPM
                  ? "bg-sky-500 text-white"
                  : "text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
              )}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => apply(currentHour12, currentMinute, true, false)}
              className={clsx(
                "h-8 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors",
                isPM
                  ? "bg-sky-500 text-white"
                  : "text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
              )}
            >
              PM
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface DateTimePickerProps {
  value: Date | null;
  onChange: (value: Date) => void;
  disabled?: boolean;
  allowFuture?: boolean;
  minDate?: Date;
  size?: "sm" | "md";
  dateClassName?: string;
  timeClassName?: string;
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  disabled = false,
  allowFuture = false,
  minDate,
  size = "md",
  dateClassName,
  timeClassName,
}) => {
  const handleDatePick = (range: TimeRange): void => {
    const next = new Date(range.start);
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), value.getSeconds(), 0);
    }
    onChange(next);
  };

  const handleTimeChange = (timeValue: Date): void => {
    const base = value ? new Date(value) : new Date();
    base.setHours(
      timeValue.getHours(),
      timeValue.getMinutes(),
      timeValue.getSeconds(),
      0
    );
    onChange(base);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TimeNavigator
        range={{ start: value, end: value }}
        onChange={handleDatePick}
        modes={["day"]}
        presets={false}
        showArrows={false}
        allowFuture={allowFuture}
        minDate={minDate}
        size={size}
        disabled={disabled}
        className={dateClassName}
      />
      <TimeSelector
        value={value}
        onChange={handleTimeChange}
        disabled={disabled}
        size={size}
        className={timeClassName}
      />
    </div>
  );
};

export default DateTimePicker;
