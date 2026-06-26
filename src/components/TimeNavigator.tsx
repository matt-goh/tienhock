// src/components/TimeNavigator.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconCalendar,
  IconSelector,
} from "@tabler/icons-react";
import clsx from "clsx";

// --- Public types ---
export type TimeMode = "day" | "month" | "range" | "year";

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface TimePreset {
  /** Stable identifier */
  key: string;
  /** Label shown on the chip and (when matched) on the trigger */
  label: string;
  /** Resolves the concrete range when picked */
  getRange: () => TimeRange;
}

interface TimeNavigatorProps {
  /** The currently applied range (start/end may be null when nothing is selected) */
  range: { start: Date | null; end: Date | null };
  /** Called with the new range whenever the user picks/steps a selection */
  onChange: (range: TimeRange, meta: { mode: TimeMode }) => void;
  /** Which granularity tabs are available (default: day/month/range). Order is preserved. */
  modes?: TimeMode[];
  /** Quick presets: `true`/omitted = sensible defaults, `false` = none, or a custom list */
  presets?: TimePreset[] | boolean;
  /** Allow selecting/stepping into the future (default: false) */
  allowFuture?: boolean;
  /** Earliest navigable date */
  minDate?: Date;
  /** Size variant */
  size?: "sm" | "md";
  /** Show the prev/next stepping arrows (default: true) */
  showArrows?: boolean;
  /** Text shown on the trigger when no range is selected */
  placeholder?: string;
  className?: string;
}

// --- Date helpers (all local-timezone safe; never round-trip through toISOString) ---
const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const startOfMonth = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfYear = (d: Date): Date => new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
const endOfYear = (d: Date): Date =>
  new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
// Monday-first weekday headers (Asia/Kuala_Lumpur convention)
const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const buildDefaultPresets = (): TimePreset[] => [
  {
    key: "today",
    label: "Today",
    getRange: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }),
  },
  {
    key: "yesterday",
    label: "Yesterday",
    getRange: () => {
      const d = addDays(new Date(), -1);
      return { start: startOfDay(d), end: endOfDay(d) };
    },
  },
  {
    key: "last7",
    label: "Last 7 days",
    getRange: () => ({
      start: startOfDay(addDays(new Date(), -6)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last30",
    label: "Last 30 days",
    getRange: () => ({
      start: startOfDay(addDays(new Date(), -29)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "thisMonth",
    label: "This month",
    getRange: () => ({
      start: startOfMonth(new Date()),
      end: endOfMonth(new Date()),
    }),
  },
  {
    key: "thisYear",
    label: "This year",
    getRange: () => ({
      start: new Date(new Date().getFullYear(), 0, 1, 0, 0, 0, 0),
      end: endOfDay(new Date()),
    }),
  },
];

// Classify the current range into the granularity it most closely represents.
const classifyMode = (start: Date | null, end: Date | null): TimeMode => {
  if (!start || !end) return "range";
  if (isSameDay(start, end)) return "day";
  if (
    start.getMonth() === 0 &&
    start.getDate() === 1 &&
    end.getMonth() === 11 &&
    end.getDate() === 31 &&
    start.getFullYear() === end.getFullYear()
  ) {
    return "year";
  }
  if (
    start.getDate() === 1 &&
    isSameDay(start, startOfMonth(start)) &&
    isSameDay(end, endOfMonth(start))
  ) {
    return "month";
  }
  return "range";
};

const fmtDay = (d: Date): string =>
  d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
const fmtMonth = (d: Date): string =>
  d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
const fmtYear = (d: Date): string => String(d.getFullYear());
const fmtRange = (s: Date, e: Date): string => {
  const sameYear = s.getFullYear() === e.getFullYear();
  const startStr = s.toLocaleDateString(
    "en-MY",
    sameYear
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" }
  );
  const endStr = e.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
};

// --- Calendar grid (day + range selection) ---
interface CalendarGridProps {
  viewDate: Date;
  onViewChange: (d: Date) => void;
  selectionMode: "day" | "range";
  selectedStart: Date | null;
  selectedEnd: Date | null;
  pendingStart: Date | null;
  hoverDate: Date | null;
  onHover: (d: Date | null) => void;
  onPick: (d: Date) => void;
  allowFuture: boolean;
  minDate?: Date;
}

const CalendarGrid: React.FC<CalendarGridProps> = ({
  viewDate,
  onViewChange,
  selectionMode,
  selectedStart,
  selectedEnd,
  pendingStart,
  hoverDate,
  onHover,
  onPick,
  allowFuture,
  minDate,
}) => {
  const today = startOfDay(new Date());

  const cells = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    // Monday-first offset
    const leadCount = (first.getDay() + 6) % 7;
    const gridStart = addDays(first, -leadCount);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewDate]);

  const isDisabled = (d: Date): boolean => {
    if (!allowFuture && startOfDay(d).getTime() > today.getTime()) return true;
    if (minDate && startOfDay(d).getTime() < startOfDay(minDate).getTime())
      return true;
    return false;
  };

  // Effective range to highlight: while mid-range-selection, preview against hover.
  const rangeStart = pendingStart ?? selectedStart;
  const rangeEnd = pendingStart ? hoverDate : selectedEnd;

  const inRange = (d: Date): boolean => {
    if (selectionMode !== "range" || !rangeStart || !rangeEnd) return false;
    const t = startOfDay(d).getTime();
    const lo = Math.min(startOfDay(rangeStart).getTime(), startOfDay(rangeEnd).getTime());
    const hi = Math.max(startOfDay(rangeStart).getTime(), startOfDay(rangeEnd).getTime());
    return t >= lo && t <= hi;
  };

  const isEndpoint = (d: Date): boolean => {
    if (selectionMode === "day")
      return selectedStart ? isSameDay(d, selectedStart) : false;
    if (rangeStart && isSameDay(d, rangeStart)) return true;
    if (rangeEnd && isSameDay(d, rangeEnd)) return true;
    return false;
  };

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onViewChange(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
          className="p-1 rounded-md text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Previous month"
        >
          <IconChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-default-900 dark:text-gray-100">
          {fmtMonth(viewDate)}
        </span>
        <button
          type="button"
          onClick={() => onViewChange(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
          className="p-1 rounded-md text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Next month"
        >
          <IconChevronRight size={18} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((w) => (
          <div
            key={w}
            className="text-center text-[11px] font-medium text-default-400 dark:text-gray-500 py-1"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => onHover(null)}>
        {cells.map((d) => {
          const outside = d.getMonth() !== viewDate.getMonth();
          const disabled = isDisabled(d);
          const endpoint = isEndpoint(d);
          const within = inRange(d) && !endpoint;
          const isCurrentDay = isSameDay(d, today);
          return (
            <button
              key={d.getTime()}
              type="button"
              disabled={disabled}
              onMouseEnter={() => onHover(d)}
              onClick={() => onPick(d)}
              className={clsx(
                "h-8 text-sm flex items-center justify-center transition-colors relative",
                within
                  ? "bg-sky-100 dark:bg-sky-900/40 rounded-none"
                  : "rounded-md",
                disabled
                  ? "cursor-not-allowed text-default-300 dark:text-gray-600"
                  : endpoint
                  ? "bg-sky-500 text-white font-semibold hover:bg-sky-600"
                  : clsx(
                      outside
                        ? "text-default-300 dark:text-gray-600"
                        : "text-default-700 dark:text-gray-200",
                      "hover:bg-sky-50 dark:hover:bg-sky-900/30"
                    ),
                !endpoint && isCurrentDay && !disabled &&
                  "font-semibold text-sky-600 dark:text-sky-400"
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// --- Month grid (month selection) ---
interface MonthGridProps {
  viewYear: number;
  onViewYearChange: (y: number) => void;
  selected: Date | null;
  onPick: (year: number, month: number) => void;
  allowFuture: boolean;
  minDate?: Date;
}

const MonthGrid: React.FC<MonthGridProps> = ({
  viewYear,
  onViewYearChange,
  selected,
  onPick,
  allowFuture,
  minDate,
}) => {
  const now = new Date();
  const isMonthDisabled = (year: number, month: number): boolean => {
    if (
      !allowFuture &&
      (year > now.getFullYear() ||
        (year === now.getFullYear() && month > now.getMonth()))
    )
      return true;
    if (
      minDate &&
      (year < minDate.getFullYear() ||
        (year === minDate.getFullYear() && month < minDate.getMonth()))
    )
      return true;
    return false;
  };

  const prevYearDisabled = minDate ? viewYear <= minDate.getFullYear() : false;
  const nextYearDisabled = !allowFuture ? viewYear >= now.getFullYear() : false;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onViewYearChange(viewYear - 1)}
          disabled={prevYearDisabled}
          className={clsx(
            "p-1 rounded-md transition-colors",
            prevYearDisabled
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
          onClick={() => onViewYearChange(viewYear + 1)}
          disabled={nextYearDisabled}
          className={clsx(
            "p-1 rounded-md transition-colors",
            nextYearDisabled
              ? "cursor-not-allowed text-default-300 dark:text-gray-600"
              : "text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
          )}
          aria-label="Next year"
        >
          <IconChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTH_LABELS.map((label, monthIndex) => {
          const disabled = isMonthDisabled(viewYear, monthIndex);
          const isSelected =
            selected != null &&
            selected.getFullYear() === viewYear &&
            selected.getMonth() === monthIndex;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onPick(viewYear, monthIndex)}
              disabled={disabled}
              className={clsx(
                "py-2 text-sm rounded-md transition-colors",
                disabled
                  ? "cursor-not-allowed text-default-300 dark:text-gray-600"
                  : isSelected
                  ? "bg-sky-500 text-white hover:bg-sky-600"
                  : "text-default-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-sky-900/30"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// --- Year grid (year selection) ---
interface YearGridProps {
  /** First year shown in the 12-year window */
  viewStartYear: number;
  onViewChange: (startYear: number) => void;
  selected: number | null;
  onPick: (year: number) => void;
  allowFuture: boolean;
  minDate?: Date;
}

const YEAR_WINDOW = 12;

const YearGrid: React.FC<YearGridProps> = ({
  viewStartYear,
  onViewChange,
  selected,
  onPick,
  allowFuture,
  minDate,
}) => {
  const now = new Date();
  const years = Array.from({ length: YEAR_WINDOW }, (_, i) => viewStartYear + i);

  const isYearDisabled = (year: number): boolean => {
    if (!allowFuture && year > now.getFullYear()) return true;
    if (minDate && year < minDate.getFullYear()) return true;
    return false;
  };

  const prevDisabled = minDate
    ? viewStartYear <= minDate.getFullYear()
    : false;
  const nextDisabled = !allowFuture
    ? viewStartYear + YEAR_WINDOW - 1 >= now.getFullYear()
    : false;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onViewChange(viewStartYear - YEAR_WINDOW)}
          disabled={prevDisabled}
          className={clsx(
            "p-1 rounded-md transition-colors",
            prevDisabled
              ? "cursor-not-allowed text-default-300 dark:text-gray-600"
              : "text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
          )}
          aria-label="Previous years"
        >
          <IconChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-default-900 dark:text-gray-100">
          {viewStartYear} – {viewStartYear + YEAR_WINDOW - 1}
        </span>
        <button
          type="button"
          onClick={() => onViewChange(viewStartYear + YEAR_WINDOW)}
          disabled={nextDisabled}
          className={clsx(
            "p-1 rounded-md transition-colors",
            nextDisabled
              ? "cursor-not-allowed text-default-300 dark:text-gray-600"
              : "text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-700"
          )}
          aria-label="Next years"
        >
          <IconChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {years.map((year) => {
          const disabled = isYearDisabled(year);
          const isSelected = selected === year;
          return (
            <button
              key={year}
              type="button"
              onClick={() => onPick(year)}
              disabled={disabled}
              className={clsx(
                "py-2 text-sm rounded-md transition-colors",
                disabled
                  ? "cursor-not-allowed text-default-300 dark:text-gray-600"
                  : isSelected
                  ? "bg-sky-500 text-white hover:bg-sky-600"
                  : "text-default-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-sky-900/30"
              )}
            >
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// --- Main component ---
const TimeNavigator: React.FC<TimeNavigatorProps> = ({
  range,
  onChange,
  modes = ["day", "month", "range"],
  presets,
  allowFuture = false,
  minDate,
  size = "md",
  showArrows = true,
  placeholder = "All dates",
  className,
}) => {
  const availableModes = useMemo(
    () =>
      (["day", "month", "range", "year"] as TimeMode[]).filter((m) =>
        modes.includes(m)
      ),
    [modes]
  );

  const resolvedPresets = useMemo<TimePreset[]>(() => {
    if (presets === false) return [];
    if (presets === undefined || presets === true) return buildDefaultPresets();
    return presets;
  }, [presets]);

  const hasRange = !!(range.start && range.end);
  // The granularity the currently-applied range represents (drives label + arrows).
  const displayMode = useMemo(
    () => classifyMode(range.start, range.end),
    [range.start, range.end]
  );

  const [isOpen, setIsOpen] = useState(false);
  // The tab the user is currently viewing inside the popover.
  const [activeMode, setActiveMode] = useState<TimeMode>(
    availableModes.includes(displayMode) ? displayMode : availableModes[0] ?? "range"
  );
  const [viewDate, setViewDate] = useState<Date>(range.start ?? new Date());
  const [viewYear, setViewYear] = useState<number>(
    (range.start ?? new Date()).getFullYear()
  );
  // First year of the 12-year window shown in the year grid.
  const [yearViewStart, setYearViewStart] = useState<number>(() => {
    const y = (range.start ?? new Date()).getFullYear();
    return y - (((y % YEAR_WINDOW) + YEAR_WINDOW) % YEAR_WINDOW);
  });
  const [pendingStart, setPendingStart] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync popover view to the applied range each time it opens.
  useEffect(() => {
    if (isOpen) {
      const anchor = range.start ?? new Date();
      setActiveMode(
        availableModes.includes(displayMode)
          ? displayMode
          : availableModes[0] ?? "range"
      );
      setViewDate(anchor);
      setViewYear(anchor.getFullYear());
      setYearViewStart(
        anchor.getFullYear() -
          (((anchor.getFullYear() % YEAR_WINDOW) + YEAR_WINDOW) % YEAR_WINDOW)
      );
      setPendingStart(null);
      setHoverDate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  const emit = (start: Date, end: Date, mode: TimeMode) => {
    onChange({ start, end }, { mode });
  };

  // --- Preset matching for the trigger label ---
  const activePreset = useMemo(() => {
    if (!range.start || !range.end) return null;
    return (
      resolvedPresets.find((p) => {
        const r = p.getRange();
        return isSameDay(r.start, range.start!) && isSameDay(r.end, range.end!);
      }) ?? null
    );
  }, [range.start, range.end, resolvedPresets]);

  const triggerLabel = useMemo(() => {
    if (!hasRange) return placeholder;
    if (activePreset) return activePreset.label;
    if (displayMode === "day") return fmtDay(range.start!);
    if (displayMode === "month") return fmtMonth(range.start!);
    if (displayMode === "year") return fmtYear(range.start!);
    return fmtRange(range.start!, range.end!);
  }, [hasRange, activePreset, displayMode, range.start, range.end, placeholder]);

  // --- Arrow stepping (operates on the applied range's granularity) ---
  const today = startOfDay(new Date());
  const canStepNext = useMemo(() => {
    if (!hasRange) return false;
    if (allowFuture) return true;
    if (displayMode === "day") return startOfDay(range.start!).getTime() < today.getTime();
    if (displayMode === "month")
      return startOfMonth(range.start!).getTime() < startOfMonth(today).getTime();
    if (displayMode === "year")
      return range.start!.getFullYear() < today.getFullYear();
    return endOfDay(range.end!).getTime() < endOfDay(today).getTime();
  }, [hasRange, allowFuture, displayMode, range.start, range.end, today]);

  const canStepPrev = useMemo(() => {
    if (!hasRange) return false;
    if (!minDate) return true;
    return startOfDay(range.start!).getTime() > startOfDay(minDate).getTime();
  }, [hasRange, minDate, range.start]);

  const step = (dir: "prev" | "next") => {
    if (!range.start || !range.end) return;
    const sign = dir === "prev" ? -1 : 1;
    if (displayMode === "day") {
      const d = addDays(range.start, sign);
      emit(startOfDay(d), endOfDay(d), "day");
    } else if (displayMode === "month") {
      const d = new Date(range.start.getFullYear(), range.start.getMonth() + sign, 1);
      emit(startOfMonth(d), endOfMonth(d), "month");
    } else if (displayMode === "year") {
      const d = new Date(range.start.getFullYear() + sign, 0, 1);
      emit(startOfYear(d), endOfYear(d), "year");
    } else {
      const len =
        Math.round(
          (startOfDay(range.end).getTime() - startOfDay(range.start).getTime()) /
            86400000
        ) + 1;
      let s = addDays(range.start, sign * len);
      let e = addDays(range.end, sign * len);
      // Clamp a forward step so the window never extends past today (unless
      // future navigation is explicitly allowed). Window length is preserved.
      if (!allowFuture && dir === "next") {
        const todayEnd = endOfDay(new Date());
        if (endOfDay(e).getTime() > todayEnd.getTime()) {
          e = new Date(todayEnd);
          s = addDays(startOfDay(e), -(len - 1));
        }
      }
      emit(startOfDay(s), endOfDay(e), "range");
    }
  };

  // --- Selection handlers inside the popover ---
  const handlePresetClick = (preset: TimePreset) => {
    const r = preset.getRange();
    emit(r.start, r.end, classifyMode(r.start, r.end));
    setIsOpen(false);
  };

  const handleDayPick = (d: Date) => {
    emit(startOfDay(d), endOfDay(d), "day");
    setIsOpen(false);
  };

  const handleMonthPick = (year: number, month: number) => {
    const anchor = new Date(year, month, 1);
    emit(startOfMonth(anchor), endOfMonth(anchor), "month");
    setIsOpen(false);
  };

  const handleYearPick = (year: number) => {
    const anchor = new Date(year, 0, 1);
    emit(startOfYear(anchor), endOfYear(anchor), "year");
    setIsOpen(false);
  };

  const handleRangePick = (d: Date) => {
    if (!pendingStart) {
      setPendingStart(startOfDay(d));
      setHoverDate(startOfDay(d));
      return;
    }
    // Second click completes the range (auto-order start/end).
    const a = pendingStart;
    const b = startOfDay(d);
    const start = a.getTime() <= b.getTime() ? a : b;
    const end = a.getTime() <= b.getTime() ? b : a;
    emit(startOfDay(start), endOfDay(end), "range");
    setPendingStart(null);
    setIsOpen(false);
  };

  // --- Size-based classes ---
  const heightClass = size === "sm" ? "h-[34px]" : "h-[40px]";
  const textClass = size === "sm" ? "text-xs" : "text-sm";
  const iconSize = size === "sm" ? 16 : 18;

  const stepButtonClass = clsx(
    "rounded-lg border border-default-300 dark:border-gray-600 flex items-center justify-center transition-colors flex-shrink-0",
    size === "sm" ? "w-[34px]" : "w-[40px]",
    heightClass
  );

  return (
    <div
      ref={containerRef}
      className={clsx("relative inline-flex items-center gap-1", className)}
    >
      {showArrows && (
        <button
          type="button"
          onClick={() => step("prev")}
          disabled={!canStepPrev}
          className={clsx(
            stepButtonClass,
            canStepPrev
              ? "text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
              : "cursor-not-allowed text-default-300 dark:text-gray-600"
          )}
          aria-label="Previous"
          title="Previous"
        >
          <IconChevronLeft size={iconSize} />
        </button>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={clsx(
          "inline-flex items-center gap-2 rounded-lg border bg-default-50 dark:bg-gray-900/50 font-medium text-default-900 dark:text-gray-100 transition-colors",
          size === "sm" ? "px-2.5" : "px-3",
          heightClass,
          textClass,
          isOpen
            ? "border-sky-500 ring-1 ring-sky-500"
            : "border-default-300 dark:border-gray-600 hover:border-default-400 dark:hover:border-gray-500"
        )}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Change time range"
      >
        <IconCalendar
          size={iconSize}
          className="text-default-400 dark:text-gray-500 flex-shrink-0"
        />
        <span className="whitespace-nowrap">{triggerLabel}</span>
        <IconSelector
          size={iconSize}
          className="text-default-400 dark:text-gray-500 flex-shrink-0"
        />
      </button>

      {showArrows && (
        <button
          type="button"
          onClick={() => step("next")}
          disabled={!canStepNext}
          className={clsx(
            stepButtonClass,
            canStepNext
              ? "text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
              : "cursor-not-allowed text-default-300 dark:text-gray-600"
          )}
          aria-label="Next"
          title="Next"
        >
          <IconChevronRight size={iconSize} />
        </button>
      )}

      {/* Popover */}
      {isOpen && (
        <div
          className="absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 w-[300px] rounded-xl border border-default-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl p-3 animate-fadeIn"
          role="dialog"
        >
          {/* Granularity tabs */}
          {availableModes.length > 1 && (
            <div className="flex items-center gap-1 p-0.5 mb-3 rounded-lg bg-default-100 dark:bg-gray-900/60">
              {availableModes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setActiveMode(m);
                    setPendingStart(null);
                    setHoverDate(null);
                  }}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                    activeMode === m
                      ? "bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-400 shadow-sm"
                      : "text-default-500 dark:text-gray-400 hover:text-default-800 dark:hover:text-gray-200"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Presets */}
          {resolvedPresets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {resolvedPresets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePresetClick(p)}
                  className={clsx(
                    "px-2.5 py-1 text-xs rounded-full border transition-colors",
                    activePreset?.key === p.key
                      ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
                      : "border-default-200 dark:border-gray-600 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Body */}
          {activeMode === "year" ? (
            <YearGrid
              viewStartYear={yearViewStart}
              onViewChange={setYearViewStart}
              selected={displayMode === "year" ? range.start!.getFullYear() : null}
              onPick={handleYearPick}
              allowFuture={allowFuture}
              minDate={minDate}
            />
          ) : activeMode === "month" ? (
            <MonthGrid
              viewYear={viewYear}
              onViewYearChange={setViewYear}
              selected={displayMode === "month" ? range.start : null}
              onPick={handleMonthPick}
              allowFuture={allowFuture}
              minDate={minDate}
            />
          ) : (
            <CalendarGrid
              viewDate={viewDate}
              onViewChange={setViewDate}
              selectionMode={activeMode === "range" ? "range" : "day"}
              selectedStart={range.start}
              selectedEnd={range.end}
              pendingStart={activeMode === "range" ? pendingStart : null}
              hoverDate={hoverDate}
              onHover={setHoverDate}
              onPick={activeMode === "range" ? handleRangePick : handleDayPick}
              allowFuture={allowFuture}
              minDate={minDate}
            />
          )}

          {activeMode === "range" && (
            <p className="mt-2 text-[11px] text-default-400 dark:text-gray-500 text-center">
              {pendingStart
                ? "Select the end date"
                : "Select the start date"}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TimeNavigator;
