// src/components/Stock/WorkerPayCodeEntryGrid.tsx
// Jelly Polly production entry grid. Unlike the shared WorkerEntryGrid (one
// input per worker), this renders one input COLUMN per mapped pay code of the
// selected product, so a worker's daily quantity is entered separately for each
// pay code and flows into that specific code during payroll. Rows are
// drag-and-drop reorderable (same shared worker-order persistence as
// WorkerEntryGrid). JP-only — the TH grid is left untouched.
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import {
  IconPackage,
  IconRefresh,
  IconDeviceFloppy,
  IconGripVertical,
} from "@tabler/icons-react";
import {
  ProductionWorker,
  ProductionWorkerOrderRequest,
  ProductionWorkerOrderResponse,
  ProductionWorkerOrderScope,
} from "../../types/types";
import Button from "../Button";

// One input column: a mapped pay code for the selected product.
export interface EntryPayCodeColumn {
  pay_code_id: string;
  description: string;
  rate_unit: string;
  rate_biasa: number;
}

// workerId -> (payCodeId -> quantity)
export type PayCodeEntries = Record<string, Record<string, number>>;

const sortWorkersWithOrder = (
  workers: ProductionWorker[],
  workerOrderIds: string[]
): ProductionWorker[] => {
  if (workerOrderIds.length === 0) return workers;

  const orderIndex = new Map<string, number>(
    workerOrderIds.map(
      (workerId: string, index: number): [string, number] => [workerId, index]
    )
  );
  const naturalIndex = new Map<string, number>(
    workers.map(
      (worker: ProductionWorker, index: number): [string, number] => [
        worker.id,
        index,
      ]
    )
  );

  return [...workers].sort(
    (firstWorker: ProductionWorker, secondWorker: ProductionWorker): number => {
      const firstOrder: number | undefined = orderIndex.get(firstWorker.id);
      const secondOrder: number | undefined = orderIndex.get(secondWorker.id);

      if (firstOrder !== undefined && secondOrder !== undefined) {
        return firstOrder - secondOrder;
      }
      if (firstOrder !== undefined) return -1;
      if (secondOrder !== undefined) return 1;

      return (
        (naturalIndex.get(firstWorker.id) ?? 0) -
        (naturalIndex.get(secondWorker.id) ?? 0)
      );
    }
  );
};

const moveWorkerId = (
  workerIds: string[],
  activeWorkerId: string,
  targetWorkerId: string
): string[] => {
  const fromIndex: number = workerIds.indexOf(activeWorkerId);
  const toIndex: number = workerIds.indexOf(targetWorkerId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return workerIds;
  }

  const nextWorkerIds: string[] = [...workerIds];
  const [movedWorkerId] = nextWorkerIds.splice(fromIndex, 1);
  nextWorkerIds.splice(toIndex, 0, movedWorkerId);
  return nextWorkerIds;
};

const areWorkerIdsEqual = (
  firstWorkerIds: string[],
  secondWorkerIds: string[]
): boolean =>
  firstWorkerIds.length === secondWorkerIds.length &&
  firstWorkerIds.every(
    (workerId: string, index: number): boolean =>
      workerId === secondWorkerIds[index]
  );

const WORKER_ORDER_CACHE_KEY_PREFIX = "production-worker-order";
const WORKER_ORDER_CACHE_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

interface CachedWorkerOrder {
  timestamp: number;
  worker_ids: string[];
}

const getWorkerOrderCacheKey = (scope: ProductionWorkerOrderScope): string =>
  `${WORKER_ORDER_CACHE_KEY_PREFIX}:${scope}`;

const getCachedWorkerOrder = (
  scope: ProductionWorkerOrderScope
): string[] | null => {
  try {
    const storedCache: string | null = localStorage.getItem(
      getWorkerOrderCacheKey(scope)
    );
    if (!storedCache) return null;

    const parsedCache: CachedWorkerOrder = JSON.parse(
      storedCache
    ) as CachedWorkerOrder;
    const isFresh: boolean =
      Date.now() - parsedCache.timestamp < WORKER_ORDER_CACHE_DURATION_MS;
    const hasSavedOrder: boolean =
      Array.isArray(parsedCache.worker_ids) && parsedCache.worker_ids.length > 0;

    if (!isFresh || !hasSavedOrder) {
      localStorage.removeItem(getWorkerOrderCacheKey(scope));
      return null;
    }

    return parsedCache.worker_ids;
  } catch {
    localStorage.removeItem(getWorkerOrderCacheKey(scope));
    return null;
  }
};

const cacheWorkerOrder = (
  scope: ProductionWorkerOrderScope,
  workerIds: string[]
): void => {
  try {
    if (workerIds.length === 0) {
      localStorage.removeItem(getWorkerOrderCacheKey(scope));
      return;
    }
    const cacheData: CachedWorkerOrder = {
      timestamp: Date.now(),
      worker_ids: workerIds,
    };
    localStorage.setItem(
      getWorkerOrderCacheKey(scope),
      JSON.stringify(cacheData)
    );
  } catch {
    // Ignore localStorage quota/access errors; the API remains the source of truth.
  }
};

const invalidateWorkerOrderCache = (
  scope: ProductionWorkerOrderScope
): void => {
  try {
    localStorage.removeItem(getWorkerOrderCacheKey(scope));
  } catch {
    // Ignore localStorage access errors.
  }
};

interface DragState {
  workerId: string;
  pointerId: number;
  previousOrderIds: string[];
  currentOrderIds: string[];
  offsetX: number;
  offsetY: number;
  initialLeft: number;
  initialTop: number;
  lastTargetWorkerId: string | null;
}

interface DragOverlayState {
  worker: ProductionWorker;
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface WorkerPayCodeEntryGridProps {
  workers: ProductionWorker[];
  payCodeColumns: EntryPayCodeColumn[];
  entries: PayCodeEntries;
  onEntryChange: (workerId: string, payCodeId: string, value: number) => void;
  disabled?: boolean;
  onSave?: () => void;
  onReset?: () => void;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
  workerOrderScope?: ProductionWorkerOrderScope;
  workerOrderApiBase?: string;
  workerOrderRefreshKey?: number;
}

const WorkerPayCodeEntryGrid: React.FC<WorkerPayCodeEntryGridProps> = ({
  workers,
  payCodeColumns,
  entries,
  onEntryChange,
  disabled = false,
  onSave,
  onReset,
  hasUnsavedChanges = false,
  isSaving = false,
  workerOrderScope,
  workerOrderApiBase = "/jellypolly/api/production-entries",
  workerOrderRefreshKey = 0,
}) => {
  const [workerOrderIds, setWorkerOrderIds] = useState<string[]>([]);
  const [isLoadingWorkerOrder, setIsLoadingWorkerOrder] = useState(false);
  const [draggedWorkerId, setDraggedWorkerId] = useState<string | null>(null);
  const [dragOverlay, setDragOverlay] = useState<DragOverlayState | null>(null);
  const workerOrderIdsRef = useRef<string[]>([]);
  const workerOrderRequestRef = useRef<{
    scope?: ProductionWorkerOrderScope;
    refreshKey: number;
  } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragOverlayRef = useRef<HTMLDivElement | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragPointRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const applyWorkerOrderIds = useCallback(
    (nextWorkerOrderIds: string[]): void => {
      workerOrderIdsRef.current = nextWorkerOrderIds;
      setWorkerOrderIds(nextWorkerOrderIds);
    },
    []
  );

  useEffect(() => {
    let isCurrent = true;
    const previousWorkerOrderRequest = workerOrderRequestRef.current;
    const isManualRefresh: boolean = Boolean(
      workerOrderScope &&
        previousWorkerOrderRequest?.scope === workerOrderScope &&
        previousWorkerOrderRequest.refreshKey !== workerOrderRefreshKey
    );

    workerOrderRequestRef.current = {
      scope: workerOrderScope,
      refreshKey: workerOrderRefreshKey,
    };

    const fetchWorkerOrder = async (): Promise<void> => {
      if (!workerOrderScope) {
        setIsLoadingWorkerOrder(false);
        applyWorkerOrderIds([]);
        return;
      }

      const cachedWorkerOrderIds: string[] | null = isManualRefresh
        ? null
        : getCachedWorkerOrder(workerOrderScope);

      if (isManualRefresh) {
        invalidateWorkerOrderCache(workerOrderScope);
      }

      if (cachedWorkerOrderIds) {
        applyWorkerOrderIds(cachedWorkerOrderIds);
        setIsLoadingWorkerOrder(false);
        return;
      }

      setIsLoadingWorkerOrder(true);

      try {
        const response: ProductionWorkerOrderResponse = await api.get(
          `${workerOrderApiBase}/worker-order?scope=${encodeURIComponent(
            workerOrderScope
          )}`
        );

        if (isCurrent) {
          applyWorkerOrderIds(response.worker_ids);
          cacheWorkerOrder(workerOrderScope, response.worker_ids);
        }
      } catch (error) {
        console.error("Error fetching worker order:", error);
        if (isCurrent && !cachedWorkerOrderIds) {
          applyWorkerOrderIds([]);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingWorkerOrder(false);
        }
      }
    };

    fetchWorkerOrder();

    return (): void => {
      isCurrent = false;
    };
  }, [
    applyWorkerOrderIds,
    workerOrderApiBase,
    workerOrderRefreshKey,
    workerOrderScope,
  ]);

  useEffect(() => {
    return (): void => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  const getValue = useCallback(
    (workerId: string, payCodeId: string): number =>
      entries[workerId]?.[payCodeId] || 0,
    [entries]
  );

  const workerTotal = useCallback(
    (workerId: string): number =>
      payCodeColumns.reduce(
        (sum, column) => sum + getValue(workerId, column.pay_code_id),
        0
      ),
    [payCodeColumns, getValue]
  );

  const totalBags = useMemo((): number => {
    return workers.reduce(
      (sum, worker) => sum + workerTotal(worker.id),
      0
    );
  }, [workers, workerTotal]);

  const workingWorkersCount = useMemo((): number => {
    return workers.filter((worker) => workerTotal(worker.id) > 0).length;
  }, [workers, workerTotal]);

  const orderedWorkers = useMemo((): ProductionWorker[] => {
    return sortWorkersWithOrder(workers, workerOrderIds);
  }, [workers, workerOrderIds]);

  const canReorderWorkers: boolean = Boolean(workerOrderScope) && !disabled;

  const handleInputChange = (
    workerId: string,
    payCodeId: string,
    rawValue: string
  ): void => {
    if (rawValue === "") {
      onEntryChange(workerId, payCodeId, 0);
      return;
    }
    const numValue: number = parseFloat(rawValue);
    if (!isNaN(numValue) && numValue >= 0) {
      onEntryChange(workerId, payCodeId, numValue);
    }
  };

  const formatValue = (value: number): string => {
    if (value === 0) return "";
    return value.toFixed(2).replace(/\.?0+$/, "");
  };

  const scheduleDragMove = useCallback(
    (pointerId: number, clientX: number, clientY: number): void => {
      pendingDragPointRef.current = { pointerId, clientX, clientY };

      if (dragFrameRef.current !== null) return;

      dragFrameRef.current = window.requestAnimationFrame((): void => {
        const dragPoint = pendingDragPointRef.current;
        const dragState: DragState | null = dragStateRef.current;
        dragFrameRef.current = null;

        if (
          !dragPoint ||
          !dragState ||
          dragPoint.pointerId !== dragState.pointerId
        ) {
          return;
        }

        if (dragOverlayRef.current) {
          const nextX: number =
            dragPoint.clientX - dragState.offsetX - dragState.initialLeft;
          const nextY: number =
            dragPoint.clientY - dragState.offsetY - dragState.initialTop;
          dragOverlayRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
        }

        const targetElement: Element | null = document.elementFromPoint(
          dragPoint.clientX,
          dragPoint.clientY
        );
        const targetRow = targetElement?.closest("[data-worker-row-id]") as
          | HTMLElement
          | null;
        const targetWorkerId: string | undefined = targetRow?.dataset.workerRowId;

        if (!targetWorkerId || targetWorkerId === dragState.workerId) {
          dragState.lastTargetWorkerId = null;
          return;
        }
        if (targetWorkerId === dragState.lastTargetWorkerId) return;

        dragState.lastTargetWorkerId = targetWorkerId;
      });
    },
    []
  );

  const clearDragOverlayFrame = useCallback((): void => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragPointRef.current = null;
  }, []);

  const handleDragHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, workerId: string): void => {
      if (!canReorderWorkers || event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      const currentOrderIds: string[] = orderedWorkers.map(
        (worker: ProductionWorker): string => worker.id
      );
      const draggedWorker: ProductionWorker | undefined = orderedWorkers.find(
        (worker: ProductionWorker): boolean => worker.id === workerId
      );
      const draggedIndex: number = orderedWorkers.findIndex(
        (worker: ProductionWorker): boolean => worker.id === workerId
      );
      const rowElement = event.currentTarget.closest(
        "[data-worker-row-id]"
      ) as HTMLElement | null;

      if (!draggedWorker || !rowElement) return;

      const rowRect: DOMRect = rowElement.getBoundingClientRect();

      applyWorkerOrderIds(currentOrderIds);
      dragStateRef.current = {
        workerId,
        pointerId: event.pointerId,
        previousOrderIds: currentOrderIds,
        currentOrderIds,
        offsetX: event.clientX - rowRect.left,
        offsetY: event.clientY - rowRect.top,
        initialLeft: rowRect.left,
        initialTop: rowRect.top,
        lastTargetWorkerId: null,
      };
      setDraggedWorkerId(workerId);
      setDragOverlay({
        worker: draggedWorker,
        index: draggedIndex,
        left: rowRect.left,
        top: rowRect.top,
        width: rowRect.width,
        height: rowRect.height,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [applyWorkerOrderIds, canReorderWorkers, orderedWorkers]
  );

  const handleDragHandlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      const dragState: DragState | null = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      event.preventDefault();
      scheduleDragMove(event.pointerId, event.clientX, event.clientY);
    },
    [scheduleDragMove]
  );

  const handleDragHandlePointerUp = useCallback(
    async (event: React.PointerEvent<HTMLButtonElement>): Promise<void> => {
      const dragState: DragState | null = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      dragStateRef.current = null;
      setDraggedWorkerId(null);
      setDragOverlay(null);
      clearDragOverlayFrame();

      if (!workerOrderScope) return;

      const nextWorkerOrderIds: string[] = dragState.lastTargetWorkerId
        ? moveWorkerId(
            dragState.currentOrderIds,
            dragState.workerId,
            dragState.lastTargetWorkerId
          )
        : dragState.currentOrderIds;

      applyWorkerOrderIds(nextWorkerOrderIds);

      if (areWorkerIdsEqual(nextWorkerOrderIds, dragState.previousOrderIds)) {
        return;
      }

      try {
        const payload: ProductionWorkerOrderRequest = {
          scope: workerOrderScope,
          worker_ids: nextWorkerOrderIds,
        };
        await api.put(`${workerOrderApiBase}/worker-order`, payload);
        cacheWorkerOrder(workerOrderScope, nextWorkerOrderIds);
      } catch (error) {
        console.error("Error saving worker order:", error);
        invalidateWorkerOrderCache(workerOrderScope);
        applyWorkerOrderIds(dragState.previousOrderIds);
        toast.error("Failed to save worker order");
      }
    },
    [applyWorkerOrderIds, clearDragOverlayFrame, workerOrderApiBase, workerOrderScope]
  );

  const handleDragHandlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      const dragState: DragState | null = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      dragStateRef.current = null;
      setDraggedWorkerId(null);
      setDragOverlay(null);
      clearDragOverlayFrame();
      applyWorkerOrderIds(dragState.previousOrderIds);
    },
    [applyWorkerOrderIds, clearDragOverlayFrame]
  );

  // Enter / arrow keys move focus vertically within the same pay-code column.
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    payCodeId: string
  ): void => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      const next = orderedWorkers[rowIndex + 1];
      if (next) {
        const el = document.getElementById(
          `jp-input-${next.id}-${payCodeId}`
        ) as HTMLInputElement | null;
        el?.focus();
        el?.select();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = orderedWorkers[rowIndex - 1];
      if (prev) {
        const el = document.getElementById(
          `jp-input-${prev.id}-${payCodeId}`
        ) as HTMLInputElement | null;
        el?.focus();
        el?.select();
      }
    }
  };

  // Grid columns: handle | # | worker | one per pay code | row total
  const gridTemplateColumns = `2.25rem 2.5rem minmax(11rem, 1fr) ${payCodeColumns
    .map(() => "8rem")
    .join(" ")} 5.5rem`;

  if (isLoadingWorkerOrder) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
          <span className="text-sm text-default-500 dark:text-gray-400">
            Loading worker order...
          </span>
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
          Ensure workers are assigned to the JP_PACKING job.
        </p>
      </div>
    );
  }

  if (payCodeColumns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/20 p-8 text-center">
        <p className="text-amber-700 dark:text-amber-300 font-medium">
          No pay codes mapped to this product.
        </p>
        <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
          Use the Mappings button to map at least one pay code before entering
          production.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Header */}
          <div
            className="grid items-stretch border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-700/50 text-sm font-medium text-default-600 dark:text-gray-300"
            style={{ gridTemplateColumns }}
          >
            <div className="px-2 py-2" />
            <div className="px-1 py-2 text-right">#</div>
            <div className="px-2 py-2">Worker</div>
            {payCodeColumns.map((column) => (
              <div
                key={column.pay_code_id}
                className="px-2 py-2 text-center border-l border-default-200 dark:border-gray-700"
                title={column.description}
              >
                <div className="font-semibold text-default-800 dark:text-gray-100 truncate">
                  {column.pay_code_id}
                </div>
                <div className="text-xs font-normal text-default-400 dark:text-gray-500 truncate">
                  RM{column.rate_biasa.toFixed(2)}/{column.rate_unit.toLowerCase()}
                </div>
              </div>
            ))}
            <div className="px-2 py-2 text-center border-l border-default-200 dark:border-gray-700">
              Total
            </div>
          </div>

          {/* Rows */}
          {orderedWorkers.map((worker: ProductionWorker, index: number) => {
            const rowTotal = workerTotal(worker.id);
            return (
              <div
                key={worker.id}
                data-worker-row-id={worker.id}
                className={clsx(
                  "grid items-center border-b border-default-100 dark:border-gray-700/60 transition-colors",
                  "hover:bg-default-50 dark:hover:bg-gray-700/40",
                  draggedWorkerId === worker.id &&
                    "opacity-25 ring-1 ring-dashed ring-sky-300 dark:ring-sky-600",
                  rowTotal > 0 && "bg-sky-50/40 dark:bg-sky-900/20"
                )}
                style={{ gridTemplateColumns }}
              >
                <button
                  type="button"
                  aria-label={`Move ${worker.name}`}
                  title="Drag to reorder worker"
                  disabled={!canReorderWorkers}
                  onPointerDown={(event) =>
                    handleDragHandlePointerDown(event, worker.id)
                  }
                  onPointerMove={handleDragHandlePointerMove}
                  onPointerUp={handleDragHandlePointerUp}
                  onPointerCancel={handleDragHandlePointerCancel}
                  className={clsx(
                    "mx-auto flex h-7 w-5 items-center justify-center rounded text-default-400 dark:text-gray-500",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500",
                    canReorderWorkers
                      ? "cursor-grab touch-none hover:bg-default-100 hover:text-default-600 active:cursor-grabbing dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      : "cursor-not-allowed opacity-40"
                  )}
                >
                  <IconGripVertical size={16} />
                </button>
                <span className="px-1 text-base tabular-nums text-default-400 dark:text-gray-500 text-right">
                  {index + 1}
                </span>
                <Link
                  to={`/catalogue/staff/${worker.id}`}
                  className="flex flex-col min-w-0 px-2 py-1.5 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span
                    className="font-medium text-default-900 dark:text-gray-100 text-base truncate hover:underline"
                    title={worker.name}
                  >
                    {worker.name}
                  </span>
                  <span
                    className="text-sm text-default-400 dark:text-gray-500 truncate w-fit hover:underline"
                    title={worker.id}
                  >
                    {worker.id}
                  </span>
                </Link>
                {payCodeColumns.map((column) => {
                  const value = getValue(worker.id, column.pay_code_id);
                  return (
                    <div
                      key={column.pay_code_id}
                      className="px-2 py-1.5 border-l border-default-100 dark:border-gray-700/60"
                    >
                      <input
                        id={`jp-input-${worker.id}-${column.pay_code_id}`}
                        type="number"
                        min="0"
                        step={1}
                        value={value === 0 ? "" : formatValue(value)}
                        onChange={(e) =>
                          handleInputChange(
                            worker.id,
                            column.pay_code_id,
                            e.target.value
                          )
                        }
                        onKeyDown={(e) =>
                          handleKeyDown(e, index, column.pay_code_id)
                        }
                        onFocus={(e) => e.target.select()}
                        disabled={disabled}
                        placeholder="0"
                        className={clsx(
                          "w-full rounded-lg border px-2 py-2 text-center text-base text-default-900 dark:text-gray-100",
                          "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500",
                          "disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed",
                          value > 0
                            ? "bg-white dark:bg-gray-700 border-sky-400 dark:border-sky-500"
                            : "bg-white dark:bg-gray-700 border-default-300 dark:border-gray-600"
                        )}
                      />
                    </div>
                  );
                })}
                <div className="px-2 py-2 text-center text-base font-semibold tabular-nums text-default-700 dark:text-gray-200 border-l border-default-100 dark:border-gray-700/60">
                  {rowTotal > 0 ? formatValue(rowTotal) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dragOverlay && (
        <div
          ref={dragOverlayRef}
          className={clsx(
            "fixed z-[1000] flex items-center gap-2 rounded-lg border px-3 py-2",
            "pointer-events-none shadow-2xl ring-2 ring-sky-300 will-change-transform dark:ring-sky-600",
            "bg-white dark:bg-gray-800 border-default-200 dark:border-gray-700"
          )}
          style={{
            left: dragOverlay.left,
            top: dragOverlay.top,
            width: dragOverlay.width,
            height: dragOverlay.height,
            transform: "translate3d(0, 0, 0)",
          }}
        >
          <div className="flex h-7 w-5 items-center justify-center rounded bg-default-100 text-default-600 dark:bg-gray-700 dark:text-gray-300">
            <IconGripVertical size={16} />
          </div>
          <span className="w-5 text-base tabular-nums text-default-400 dark:text-gray-500 text-right">
            {dragOverlay.index + 1}
          </span>
          <div className="flex flex-col min-w-0">
            <span
              className="font-medium text-default-900 dark:text-gray-100 text-base truncate"
              title={dragOverlay.worker.name}
            >
              {dragOverlay.worker.name}
            </span>
            <span className="text-sm text-default-400 dark:text-gray-500 truncate w-fit">
              {dragOverlay.worker.id}
            </span>
          </div>
          <div className="ml-auto text-base font-semibold tabular-nums text-default-700 dark:text-gray-200">
            {workerTotal(dragOverlay.worker.id) > 0
              ? formatValue(workerTotal(dragOverlay.worker.id))
              : "—"}
          </div>
        </div>
      )}

      {/* Footer: totals + actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
            <IconPackage
              className="text-green-600 dark:text-green-400"
              size={20}
            />
          </div>
          <div className="ml-2 pl-4 border-l border-default-300 dark:border-gray-600">
            <p className="text-2xl font-bold text-default-900 dark:text-gray-100">
              {totalBags.toLocaleString()}{" "}
              <span className="text-base font-normal text-default-500 dark:text-gray-400">
                ctn
              </span>
            </p>
          </div>
          <div className="ml-2 pl-4 border-l border-default-300 dark:border-gray-600">
            <p className="text-2xl font-bold text-default-900 dark:text-gray-100">
              {workingWorkersCount}{" "}
              <span className="text-base font-normal text-default-500 dark:text-gray-400">
                perkerja
              </span>
            </p>
          </div>
        </div>

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
  );
};

export default WorkerPayCodeEntryGrid;
