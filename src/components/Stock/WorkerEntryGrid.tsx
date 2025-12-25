// src/components/Stock/WorkerEntryGrid.tsx
import React, { useMemo } from "react";
import clsx from "clsx";
import { ProductionWorker } from "../../types/types";

interface WorkerEntryGridProps {
  workers: ProductionWorker[];
  entries: Record<string, number>; // workerId -> bags_packed
  onEntryChange: (workerId: string, value: number) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

const WorkerEntryGrid: React.FC<WorkerEntryGridProps> = ({
  workers,
  entries,
  onEntryChange,
  disabled = false,
  isLoading = false,
}) => {
  // Calculate total bags
  const totalBags = useMemo(() => {
    return Object.values(entries).reduce((sum, bags) => sum + (bags || 0), 0);
  }, [entries]);

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

    // Parse as integer, ignore invalid input
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      onEntryChange(workerId, numValue);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentIndex: number
  ) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      const nextIndex = currentIndex + 1;
      if (nextIndex < workers.length) {
        const nextInput = document.getElementById(
          `worker-input-${workers[nextIndex].id}`
        );
        nextInput?.focus();
        (nextInput as HTMLInputElement)?.select();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        const prevInput = document.getElementById(
          `worker-input-${workers[prevIndex].id}`
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
          <span className="text-sm text-default-500">Loading workers...</span>
        </div>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-default-300 p-8 text-center">
        <p className="text-default-500">
          No workers found for the selected product type.
        </p>
        <p className="mt-1 text-sm text-default-400">
          Please select a product first or ensure workers are assigned to the
          correct packing job.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-default-200">
      {/* Header */}
      <div className="grid grid-cols-[1fr_120px] bg-default-100 px-4 py-3 text-sm font-medium text-default-600">
        <div>Worker Name</div>
        <div className="text-center">Bags Packed</div>
      </div>

      {/* Worker rows */}
      <div className="divide-y divide-default-100">
        {workers.map((worker, index) => (
          <div
            key={worker.id}
            className={clsx(
              "grid grid-cols-[1fr_120px] items-center px-4 py-2",
              "hover:bg-default-50 transition-colors",
              index % 2 === 0 ? "bg-white" : "bg-default-50/50"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-default-200 text-xs font-medium text-default-600">
                {index + 1}
              </span>
              <div className="flex flex-col">
                <span className="font-medium text-default-900">
                  {worker.name}
                </span>
                <span className="text-xs text-default-500">{worker.id}</span>
              </div>
            </div>
            <div className="flex justify-center">
              <input
                id={`worker-input-${worker.id}`}
                type="number"
                min="0"
                value={entries[worker.id] || ""}
                onChange={(e) => handleInputChange(worker.id, e)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onFocus={(e) => e.target.select()}
                disabled={disabled}
                placeholder="0"
                className={clsx(
                  "w-20 rounded-lg border border-default-300 px-3 py-1.5 text-center text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500",
                  "disabled:bg-gray-100 disabled:cursor-not-allowed",
                  entries[worker.id] && entries[worker.id] > 0
                    ? "bg-sky-50 border-sky-300"
                    : "bg-white"
                )}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Total row */}
      <div className="grid grid-cols-[1fr_120px] items-center border-t-2 border-default-200 bg-default-100 px-4 py-3">
        <div className="font-semibold text-default-900">TOTAL</div>
        <div className="flex justify-center">
          <span
            className={clsx(
              "inline-flex min-w-[80px] items-center justify-center rounded-lg px-4 py-1.5 text-sm font-bold",
              totalBags > 0
                ? "bg-sky-500 text-white"
                : "bg-default-200 text-default-600"
            )}
          >
            {totalBags.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default WorkerEntryGrid;
