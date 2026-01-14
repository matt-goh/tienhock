// src/components/Stock/WorkerEntryGrid.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  IconSearch,
  IconX,
  IconPackage,
  IconRefresh,
  IconDeviceFloppy,
} from "@tabler/icons-react";
import { ProductionWorker } from "../../types/types";
import Button from "../Button";

interface WorkerEntryGridProps {
  workers: ProductionWorker[];
  entries: Record<string, number>; // workerId -> bags_packed (or kg for decimal)
  onEntryChange: (workerId: string, value: number) => void;
  disabled?: boolean;
  isLoading?: boolean;
  // Action props
  onSave?: () => void;
  onReset?: () => void;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
  // Extended props for special items
  inputStep?: number; // 1 for integer, 0.01 for decimal (default: 1)
  unitLabel?: string; // "bags", "kg", "pcs", "sack" (default: "bags")
  defaultValue?: number; // Pre-fill inputs with this value
  // External search control (optional - if not provided, shows internal search)
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  // Hide footer (for components that have their own footer)
  hideFooter?: boolean;
}

const WorkerEntryGrid: React.FC<WorkerEntryGridProps> = ({
  workers,
  entries,
  onEntryChange,
  disabled = false,
  isLoading = false,
  onSave,
  onReset,
  hasUnsavedChanges = false,
  isSaving = false,
  inputStep = 1,
  unitLabel = "bags",
  defaultValue,
  searchQuery: externalSearchQuery,
  onSearchChange,
  hideFooter = false,
}) => {
  // Use internal state only if no external control is provided
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = onSearchChange || setInternalSearchQuery;
  const useExternalSearch = externalSearchQuery !== undefined;

  const [isInputFocused, setIsInputFocused] = useState(false);

  // Ref to store the frozen sort order while editing
  const frozenSortOrderRef = useRef<string[]>([]);

  // Calculate total bags
  const totalBags = useMemo(() => {
    return Object.values(entries).reduce((sum, bags) => sum + (bags || 0), 0);
  }, [entries]);

  // Calculate number of working workers (workers with bags > 0)
  const workingWorkersCount = useMemo(() => {
    return Object.values(entries).filter((bags) => bags > 0).length;
  }, [entries]);

  // Filter workers by search (always applied)
  const filteredWorkers = useMemo(() => {
    return workers.filter(
      (worker) =>
        worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        worker.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [workers, searchQuery]);

  // Sort workers by bags packed (always calculated)
  const sortedWorkers = useMemo(() => {
    return [...filteredWorkers].sort((a, b) => {
      const bagsA = entries[a.id] || 0;
      const bagsB = entries[b.id] || 0;
      return bagsB - bagsA;
    });
  }, [filteredWorkers, entries]);

  // Update frozen order when not focused
  useEffect(() => {
    if (!isInputFocused) {
      frozenSortOrderRef.current = sortedWorkers.map((w) => w.id);
    }
  }, [isInputFocused, sortedWorkers]);

  // Use frozen order while editing, live sort otherwise
  const filteredAndSortedWorkers = useMemo(() => {
    if (isInputFocused && frozenSortOrderRef.current.length > 0) {
      // Use frozen order - reorder filtered workers according to frozen order
      const orderMap = new Map(
        frozenSortOrderRef.current.map((id, idx) => [id, idx])
      );
      return [...filteredWorkers].sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? Infinity;
        const orderB = orderMap.get(b.id) ?? Infinity;
        return orderA - orderB;
      });
    }
    return sortedWorkers;
  }, [isInputFocused, filteredWorkers, sortedWorkers]);

  // Check if we're using decimal mode
  const isDecimalMode = inputStep < 1;

  // Handle input change with validation
  const handleInputChange = (
    workerId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;

    // Allow empty value (will be treated as 0)
    if (value === "") {
      onEntryChange(workerId, 0);
      return;
    }

    // Parse based on inputStep - float for decimals, integer for whole numbers
    const numValue = isDecimalMode
      ? parseFloat(value)
      : parseInt(value, 10);

    if (!isNaN(numValue) && numValue >= 0) {
      onEntryChange(workerId, numValue);
    }
  };

  // Format value for display (handle decimals)
  const formatValue = (value: number): string => {
    if (value === 0) return "";
    if (isDecimalMode) {
      // Show up to 2 decimal places, trim trailing zeros
      return value.toFixed(2).replace(/\.?0+$/, "");
    }
    return value.toString();
  };

  // Get display value - use default if no entry exists
  const getDisplayValue = (workerId: string): string => {
    const entryValue = entries[workerId];
    if (entryValue !== undefined && entryValue !== 0) {
      return formatValue(entryValue);
    }
    if (defaultValue !== undefined && defaultValue > 0) {
      return formatValue(defaultValue);
    }
    return "";
  };

  // Handle keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentIndex: number
  ) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      const nextIndex = currentIndex + 1;
      if (nextIndex < filteredAndSortedWorkers.length) {
        const nextInput = document.getElementById(
          `worker-input-${filteredAndSortedWorkers[nextIndex].id}`
        );
        nextInput?.focus();
        (nextInput as HTMLInputElement)?.select();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        const prevInput = document.getElementById(
          `worker-input-${filteredAndSortedWorkers[prevIndex].id}`
        );
        prevInput?.focus();
        (prevInput as HTMLInputElement)?.select();
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
          <span className="text-sm text-default-500 dark:text-gray-400">Loading workers...</span>
        </div>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-default-300 dark:border-gray-600 p-8 text-center">
        <p className="text-default-500 dark:text-gray-400">
          No workers found for the selected product type.
        </p>
        <p className="mt-1 text-sm text-default-400 dark:text-gray-500">
          Please select a product first or ensure workers are assigned to the
          correct packing job.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      {/* Worker rows - 3 column grid */}
      <div className="p-4 bg-white dark:bg-gray-800">
        {filteredAndSortedWorkers.length === 0 ? (
          <div className="py-8 text-center text-default-500 dark:text-gray-400">
            No workers found matching "{searchQuery}"
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filteredAndSortedWorkers.map((worker, index) => (
              <div
                key={worker.id}
                className={clsx(
                  "flex items-center justify-between rounded-lg border px-3 py-2",
                  "hover:bg-default-50 dark:hover:bg-gray-700 transition-colors",
                  entries[worker.id] && entries[worker.id] > 0
                    ? "border-sky-300 dark:border-sky-600 bg-sky-50/50 dark:bg-sky-900/30"
                    : "border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                )}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className="w-5 text-sm tabular-nums text-default-400 dark:text-gray-500 text-right flex-shrink-0">
                    {index + 1}
                  </span>
                  <Link
                    to={`/catalogue/staff/${worker.id}`}
                    className="flex flex-col min-w-0 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span
                      className="font-medium text-default-900 dark:text-gray-100 text-sm truncate hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
                      title={worker.name}
                    >
                      {worker.name}
                    </span>
                    <span
                      className="text-xs text-default-400 dark:text-gray-500 truncate w-fit hover:underline"
                      title={worker.id}
                    >
                      {worker.id}
                    </span>
                  </Link>
                </div>
                <input
                  id={`worker-input-${worker.id}`}
                  type="number"
                  min="0"
                  step={inputStep}
                  value={getDisplayValue(worker.id)}
                  onChange={(e) => handleInputChange(worker.id, e)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onFocus={(e) => {
                    setIsInputFocused(true);
                    e.target.select();
                  }}
                  onBlur={() => setIsInputFocused(false)}
                  disabled={disabled}
                  placeholder="0"
                  className={clsx(
                    "w-24 rounded-lg border border-default-300 dark:border-gray-600 pl-6 px-2 py-1.5 text-center text-sm flex-shrink-0 text-default-900 dark:text-gray-100",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500",
                    "disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed",
                    entries[worker.id] && entries[worker.id] > 0
                      ? "bg-white dark:bg-gray-700 border-sky-400 dark:border-sky-500"
                      : "bg-white dark:bg-gray-700"
                  )}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Total row with actions */}
      {!hideFooter && (
        <div className="flex items-center justify-between border-t border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <IconPackage className="text-green-600 dark:text-green-400" size={20} />
            </div>
            <div>
              <div className="font-semibold text-default-900 dark:text-gray-100">
                Total {unitLabel === "kg" ? "Weight" : unitLabel === "sack" ? "Sacks" : "Packed"}
              </div>
              <div className="text-xs text-default-500 dark:text-gray-400">
                {new Date().toLocaleDateString("en-MY", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>
            <div className="ml-4 pl-6 border-l border-default-300 dark:border-gray-600">
              <p className="text-2xl font-bold text-default-900 dark:text-gray-100">
                {isDecimalMode ? totalBags.toFixed(2) : totalBags.toLocaleString()}{" "}
                <span className="text-base font-normal text-default-500 dark:text-gray-400">
                  {unitLabel}
                </span>
              </p>
            </div>
            <div className="ml-4 pl-6 border-l border-default-300 dark:border-gray-600">
              <p className="text-2xl font-bold text-default-900 dark:text-gray-100">
                {workingWorkersCount}{" "}
                <span className="text-base font-normal text-default-500 dark:text-gray-400">
                  perkerja
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {onSave && onReset && (
              <div className="flex gap-3">
                <Button
                  onClick={onReset}
                  disabled={!hasUnsavedChanges || isSaving}
                  color="default"
                  icon={IconRefresh}
                >
                  Reset
                </Button>
                <Button
                  onClick={onSave}
                  disabled={!hasUnsavedChanges || isSaving}
                  color="sky"
                  icon={IconDeviceFloppy}
                >
                  {isSaving ? "Saving..." : "Save Production"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkerEntryGrid;
