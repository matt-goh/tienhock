// src/components/Payroll/MonthDayMultiPicker.tsx
import React, { Fragment, useMemo } from "react";
import { Popover, PopoverButton, PopoverPanel, Transition } from "@headlessui/react";
import { IconCalendarMonth, IconChevronDown } from "@tabler/icons-react";
import { format } from "date-fns";

interface MonthDayMultiPickerProps {
  year: number;
  month: number;
  selectedDates: string[];
  onChange: (dates: string[]) => void;
  disabled?: boolean;
  allowMulti?: boolean;
  triggerClassName?: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const buildIsoDate = (year: number, month: number, day: number): string => {
  const mm = month.toString().padStart(2, "0");
  const dd = day.toString().padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

const formatMonthLabel = (year: number, month: number): string => {
  const d = new Date(year, month - 1, 1);
  return format(d, "MMMM yyyy");
};

const formatDateChip = (iso: string): string => {
  const [, , d] = iso.split("-");
  return parseInt(d, 10).toString();
};

const MonthDayMultiPicker: React.FC<MonthDayMultiPickerProps> = ({
  year,
  month,
  selectedDates,
  onChange,
  disabled = false,
  allowMulti = true,
  triggerClassName = "",
}) => {
  const daysInMonth = useMemo(
    () => new Date(year, month, 0).getDate(),
    [year, month],
  );
  const leadingBlanks = useMemo(
    () => new Date(year, month - 1, 1).getDay(),
    [year, month],
  );

  const monthSelected = useMemo(() => {
    const prefix = `${year}-${month.toString().padStart(2, "0")}-`;
    return selectedDates.filter((d) => d.startsWith(prefix)).sort();
  }, [selectedDates, year, month]);

  const toggleDay = (day: number): void => {
    const iso = buildIsoDate(year, month, day);
    const isCurrentlySelected = monthSelected.includes(iso);
    if (!allowMulti) {
      onChange([iso]);
      return;
    }
    if (isCurrentlySelected) {
      onChange(monthSelected.filter((d) => d !== iso));
    } else {
      onChange([...monthSelected, iso].sort());
    }
  };

  const handleClear = (): void => onChange([]);
  const handleSelectAll = (): void => {
    const all: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) all.push(buildIsoDate(year, month, d));
    onChange(all);
  };

  const triggerLabel = useMemo(() => {
    if (monthSelected.length === 0) return "Select dates";
    const monthName = formatMonthLabel(year, month).split(" ")[0];
    if (monthSelected.length === 1) {
      return `${monthName} ${formatDateChip(monthSelected[0])}`;
    }
    return `${monthSelected.length} dates: ${monthSelected.map(formatDateChip).join(", ")}`;
  }, [monthSelected, year, month]);

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <PopoverButton
            disabled={disabled}
            className={`inline-flex w-full items-center justify-between gap-2 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-2 text-left text-sm text-default-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 ${triggerClassName}`}
          >
            <span className="inline-flex items-center gap-2 truncate">
              <IconCalendarMonth size={16} className="text-default-400 dark:text-gray-500 flex-shrink-0" />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <IconChevronDown size={16} className="text-default-400 dark:text-gray-500 flex-shrink-0" />
          </PopoverButton>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-150"
            enterFrom="opacity-0 translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
          >
            <PopoverPanel
              anchor={{ to: "bottom start", gap: 4 }}
              className="z-50 w-72 rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg ring-1 ring-black/5 dark:ring-gray-700 focus:outline-none"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-default-800 dark:text-gray-100">
                  {formatMonthLabel(year, month)}
                </div>
                <div className="text-xs text-default-500 dark:text-gray-400">
                  {monthSelected.length} selected
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-default-400 dark:text-gray-500 mb-1">
                {WEEKDAYS.map((wd) => (
                  <div key={wd}>{wd}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: leadingBlanks }, (_, i) => (
                  <div key={`blank-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const iso = buildIsoDate(year, month, day);
                  const isSelected = monthSelected.includes(iso);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`h-8 w-full rounded-md text-sm transition-colors duration-100 ${
                        isSelected
                          ? "bg-sky-500 text-white hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500"
                          : "text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {allowMulti && (
                <div className="mt-3 flex items-center justify-between border-t border-default-200 dark:border-gray-700 pt-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => close()}
                    className="rounded-md bg-default-100 dark:bg-gray-700 px-3 py-1 font-medium text-default-700 dark:text-gray-200 hover:bg-default-200 dark:hover:bg-gray-600"
                  >
                    Done
                  </button>
                </div>
              )}
            </PopoverPanel>
          </Transition>
        </>
      )}
    </Popover>
  );
};

export default MonthDayMultiPicker;
