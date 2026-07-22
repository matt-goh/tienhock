// src/components/Stock/WorkerEntryGrid.tsx
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
import { DEFAULT_WORKER_ORDERS } from "../../config/workerOrderDefaults";
import Button from "../Button";

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

const getWorkerOrderCacheKey = (
  scope: ProductionWorkerOrderScope
): string => `${WORKER_ORDER_CACHE_KEY_PREFIX}:${scope}`;

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

    localStorage.setItem(getWorkerOrderCacheKey(scope), JSON.stringify(cacheData));
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
  // Shared worker order persistence
  workerOrderScope?: ProductionWorkerOrderScope;
  // Pre-fetched worker order (e.g. from the bundled page-context call). When
  // defined, the grid uses it instead of issuing its own GET; manual refresh
  // (workerOrderRefreshKey) still re-fetches from the API.
  initialWorkerOrderIds?: string[];
  // API base for worker-order persistence (JP passes /jellypolly/api/production-entries)
  workerOrderApiBase?: string;
  workerOrderRefreshKey?: number;
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
  workerOrderScope,
  initialWorkerOrderIds,
  workerOrderApiBase = "/api/production-entries",
  workerOrderRefreshKey = 0,
}) => {
  // Use internal state only if no external control is provided
  const [internalSearchQuery] = useState("");
  const searchQuery =
    externalSearchQuery !== undefined
      ? externalSearchQuery
      : internalSearchQuery;
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

      if (isManualRefresh) {
        invalidateWorkerOrderCache(workerOrderScope);
      }

      // Pre-fetched order from the parent's bundled call wins over the cache
      // and skips this grid's own GET; manual refresh always re-fetches.
      if (!isManualRefresh && initialWorkerOrderIds !== undefined) {
        applyWorkerOrderIds(initialWorkerOrderIds);
        cacheWorkerOrder(workerOrderScope, initialWorkerOrderIds);
        setIsLoadingWorkerOrder(false);
        return;
      }

      const cachedWorkerOrderIds: string[] | null =
        isManualRefresh ? null : getCachedWorkerOrder(workerOrderScope);

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
          // Saved DB order wins; fall back to the baked-in default order
          // when the scope has no saved order.
          const effectiveWorkerIds: string[] =
            response.worker_ids.length > 0
              ? response.worker_ids
              : DEFAULT_WORKER_ORDERS[workerOrderScope] || [];
          applyWorkerOrderIds(effectiveWorkerIds);
          cacheWorkerOrder(workerOrderScope, effectiveWorkerIds);
        }
      } catch (error) {
        console.error("Error fetching worker order:", error);
        if (isCurrent) {
          if (!cachedWorkerOrderIds) {
            applyWorkerOrderIds(
              DEFAULT_WORKER_ORDERS[workerOrderScope] || []
            );
          }
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
    initialWorkerOrderIds,
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

  // Calculate total bags
  const totalBags = useMemo((): number => {
    return Object.values(entries).reduce(
      (sum: number, bags: number): number => sum + (Number(bags) || 0),
      0
    );
  }, [entries]);

  // Calculate number of working workers (workers with bags > 0)
  const workingWorkersCount = useMemo((): number => {
    return Object.values(entries).filter((bags: number): boolean => bags > 0)
      .length;
  }, [entries]);

  const orderedWorkers = useMemo((): ProductionWorker[] => {
    return sortWorkersWithOrder(workers, workerOrderIds);
  }, [workers, workerOrderIds]);

  const isSearchActive: boolean = searchQuery.trim().length > 0;
  const canReorderWorkers: boolean =
    Boolean(workerOrderScope) && !disabled && !isSearchActive;

  // Filter workers by search after applying saved order
  const filteredWorkers = useMemo((): ProductionWorker[] => {
    const normalizedSearchQuery: string = searchQuery.toLowerCase();
    return orderedWorkers.filter(
      (worker: ProductionWorker): boolean =>
        worker.name.toLowerCase().includes(normalizedSearchQuery) ||
        worker.id.toLowerCase().includes(normalizedSearchQuery)
    );
  }, [orderedWorkers, searchQuery]);

  // Check if we're using decimal mode
  const isDecimalMode: boolean = inputStep < 1;

  // Handle input change with validation
  const handleInputChange = (
    workerId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const value: string = e.target.value;

    // Allow empty value (will be treated as 0)
    if (value === "") {
      onEntryChange(workerId, 0);
      return;
    }

    // Parse based on inputStep - float for decimals, integer for whole numbers
    const numValue: number = isDecimalMode
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
    const entryValue: number | undefined = entries[workerId];
    if (entryValue !== undefined && entryValue !== 0) {
      return formatValue(entryValue);
    }
    if (defaultValue !== undefined && defaultValue > 0) {
      return formatValue(defaultValue);
    }
    return "";
  };

  const scheduleDragMove = useCallback(
    (pointerId: number, clientX: number, clientY: number): void => {
      pendingDragPointRef.current = { pointerId, clientX, clientY };

      if (dragFrameRef.current !== null) return;

      dragFrameRef.current = window.requestAnimationFrame((): void => {
        const dragPoint = pendingDragPointRef.current;
        const dragState: DragState | null = dragStateRef.current;
        dragFrameRef.current = null;

        if (!dragPoint || !dragState || dragPoint.pointerId !== dragState.pointerId) {
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
        const targetCard = targetElement?.closest("[data-worker-card-id]") as
          | HTMLElement
          | null;
        const targetWorkerId: string | undefined =
          targetCard?.dataset.workerCardId;

        if (!targetWorkerId) {
          dragState.lastTargetWorkerId = null;
          return;
        }

        if (targetWorkerId === dragState.workerId) {
          dragState.lastTargetWorkerId = null;
          return;
        }

        if (targetWorkerId === dragState.lastTargetWorkerId) {
          return;
        }

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
    (
      event: React.PointerEvent<HTMLButtonElement>,
      workerId: string
    ): void => {
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
      const cardElement = event.currentTarget.closest(
        "[data-worker-card-id]"
      ) as HTMLElement | null;

      if (!draggedWorker || !cardElement) return;

      const cardRect: DOMRect = cardElement.getBoundingClientRect();

      applyWorkerOrderIds(currentOrderIds);
      dragStateRef.current = {
        workerId,
        pointerId: event.pointerId,
        previousOrderIds: currentOrderIds,
        currentOrderIds,
        offsetX: event.clientX - cardRect.left,
        offsetY: event.clientY - cardRect.top,
        initialLeft: cardRect.left,
        initialTop: cardRect.top,
        lastTargetWorkerId: null,
      };
      setDraggedWorkerId(workerId);
      setDragOverlay({
        worker: draggedWorker,
        index: draggedIndex,
        left: cardRect.left,
        top: cardRect.top,
        width: cardRect.width,
        height: cardRect.height,
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
    [applyWorkerOrderIds, clearDragOverlayFrame, workerOrderScope]
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

  // Handle keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentIndex: number
  ): void => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      const nextIndex: number = currentIndex + 1;
      if (nextIndex < filteredWorkers.length) {
        const nextInput: HTMLElement | null = document.getElementById(
          `worker-input-${filteredWorkers[nextIndex].id}`
        );
        nextInput?.focus();
        (nextInput as HTMLInputElement)?.select();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex: number = currentIndex - 1;
      if (prevIndex >= 0) {
        const prevInput: HTMLElement | null = document.getElementById(
          `worker-input-${filteredWorkers[prevIndex].id}`
        );
        prevInput?.focus();
        (prevInput as HTMLInputElement)?.select();
      }
    }
  };

  if (isLoading || isLoadingWorkerOrder) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
          <span className="text-sm text-default-500 dark:text-gray-400">
            {isLoading ? "Loading workers..." : "Loading worker order..."}
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
        {filteredWorkers.length === 0 ? (
          <div className="py-8 text-center text-default-500 dark:text-gray-400">
            No workers found matching "{searchQuery}"
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filteredWorkers.map((worker: ProductionWorker, index: number) => (
              <div
                key={worker.id}
                data-worker-card-id={worker.id}
                className={clsx(
                  "flex items-center justify-between rounded-lg border px-3 py-2",
                  "hover:bg-default-50 dark:hover:bg-gray-700 transition-all duration-200 ease-out",
                  draggedWorkerId === worker.id &&
                    "opacity-25 ring-1 ring-dashed ring-sky-300 dark:ring-sky-600",
                  entries[worker.id] && entries[worker.id] > 0
                    ? "border-sky-300 dark:border-sky-600 bg-sky-50/50 dark:bg-sky-900/30"
                    : "border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <button
                    type="button"
                    aria-label={`Move ${worker.name}`}
                    title={
                      isSearchActive
                        ? "Clear search to reorder workers"
                        : "Drag to reorder worker"
                    }
                    disabled={!canReorderWorkers}
                    onPointerDown={(event) =>
                      handleDragHandlePointerDown(event, worker.id)
                    }
                    onPointerMove={handleDragHandlePointerMove}
                    onPointerUp={handleDragHandlePointerUp}
                    onPointerCancel={handleDragHandlePointerCancel}
                    className={clsx(
                      "flex h-7 w-4 flex-shrink-0 items-center justify-center rounded text-default-400 dark:text-gray-500",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500",
                      canReorderWorkers
                        ? "cursor-grab touch-none hover:bg-default-100 hover:text-default-600 active:cursor-grabbing dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        : "cursor-not-allowed opacity-40"
                    )}
                  >
                    <IconGripVertical size={14} />
                  </button>
                  <span className="mr-1 w-5 text-sm tabular-nums text-default-400 dark:text-gray-500 text-right flex-shrink-0">
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
                  onFocus={(e) => e.target.select()}
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

      {dragOverlay && (
        <div
          ref={dragOverlayRef}
          className={clsx(
            "fixed z-[1000] flex items-center justify-between rounded-lg border px-3 py-2",
            "pointer-events-none shadow-2xl ring-2 ring-sky-300 will-change-transform dark:ring-sky-600",
            entries[dragOverlay.worker.id] &&
              entries[dragOverlay.worker.id] > 0
              ? "border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-900"
              : "border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          )}
          style={{
            left: dragOverlay.left,
            top: dragOverlay.top,
            width: dragOverlay.width,
            height: dragOverlay.height,
            transform: "translate3d(0, 0, 0)",
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div className="flex h-7 w-4 flex-shrink-0 items-center justify-center rounded bg-default-100 text-default-600 dark:bg-gray-700 dark:text-gray-300">
              <IconGripVertical size={14} />
            </div>
            <span className="mr-1 w-5 text-sm tabular-nums text-default-400 dark:text-gray-500 text-right flex-shrink-0">
              {dragOverlay.index + 1}
            </span>
            <div className="flex flex-col min-w-0">
              <span
                className="font-medium text-default-900 dark:text-gray-100 text-sm truncate"
                title={dragOverlay.worker.name}
              >
                {dragOverlay.worker.name}
              </span>
              <span
                className="text-xs text-default-400 dark:text-gray-500 truncate w-fit"
                title={dragOverlay.worker.id}
              >
                {dragOverlay.worker.id}
              </span>
            </div>
          </div>
          <div
            className={clsx(
              "w-24 rounded-lg border px-2 py-1.5 text-center text-sm flex-shrink-0 text-default-900 dark:text-gray-100",
              entries[dragOverlay.worker.id] &&
                entries[dragOverlay.worker.id] > 0
                ? "bg-white dark:bg-gray-700 border-sky-400 dark:border-sky-500"
                : "bg-white dark:bg-gray-700 border-default-300 dark:border-gray-600"
            )}
          >
            {getDisplayValue(dragOverlay.worker.id) || "0"}
          </div>
        </div>
      )}

      {/* Total row with actions */}
      {!hideFooter && (
        <div className="flex items-center justify-between border-t border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <IconPackage
                className="text-green-600 dark:text-green-400"
                size={20}
              />
            </div>
            <div>
              <div className="font-semibold text-default-900 dark:text-gray-100">
                Total{" "}
                {unitLabel === "kg"
                  ? "Weight"
                  : unitLabel === "sack"
                  ? "Sacks"
                  : unitLabel === "bundle"
                  ? "Bundles"
                  : "Packed"}
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
                {isDecimalMode
                  ? totalBags.toFixed(2)
                  : totalBags.toLocaleString()}{" "}
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
