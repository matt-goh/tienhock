import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconGripVertical, IconX } from "@tabler/icons-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import Button from "../Button";
import { api } from "../../routes/utils/api";
import { refreshProductsCache } from "../../utils/invoice/useProductsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { DEFAULT_WORKER_ORDERS } from "../../config/workerOrderDefaults";
import {
  ProductionWorkerOrderResponse,
  ProductionWorkerOrderScope,
} from "../../types/types";

interface OrderableProduct {
  id: string;
  description: string;
  type: string;
  is_active?: boolean;
  sort_order?: number | null;
}

interface OrderableWorker {
  id: string;
  name: string;
}

interface ProductOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: OrderableProduct[];
}

const ORDERABLE_TYPES = ["MEE", "BH", "BUNDLE", "OTH", "JP"] as const;
type OrderableType = (typeof ORDERABLE_TYPES)[number];

const TYPE_LABELS: Record<OrderableType, string> = {
  MEE: "Mee",
  BH: "Bihun",
  BUNDLE: "Bundle",
  OTH: "Lain-lain",
  JP: "Jelly Polly",
};

// TH packing worker scopes shown as extra tabs. The list mirrors what the
// Production Entry grids render: active staff holding the scope's job id,
// sorted by the saved worker order (same worker-order API + localStorage
// cache the grids use), so saving here stays in sync with the entry pages.
// JP_PRODUCTION is intentionally excluded (separate JP staff catalogue).
const WORKER_TABS: {
  scope: ProductionWorkerOrderScope;
  jobId: string;
  label: string;
}[] = [
  { scope: "MEE_PACKING", jobId: "MEE_PACKING", label: "Mee" },
  { scope: "BH_PACKING", jobId: "BH_PACKING", label: "Bihun" },
];

type TabKey = `product:${OrderableType}` | `worker:${string}`;

const WORKER_ORDER_API_BASE = "/api/production-entries";
const WORKER_ORDER_CACHE_KEY_PREFIX = "production-worker-order";

const cacheWorkerOrder = (
  scope: ProductionWorkerOrderScope,
  workerIds: string[]
): void => {
  try {
    if (workerIds.length === 0) return;
    localStorage.setItem(
      `${WORKER_ORDER_CACHE_KEY_PREFIX}:${scope}`,
      JSON.stringify({ timestamp: Date.now(), worker_ids: workerIds })
    );
  } catch {
    // Ignore localStorage quota/access errors; the API remains the source of truth.
  }
};

// Shared per-type product display order, plus the shared Mee/Bihun packing
// worker order. The list shows every item of the selected tab in its current
// display order; dragging a row and saving persists exactly the shown order
// (products.sort_order / production_worker_orders) for all users.
const ProductOrderModal: React.FC<ProductOrderModalProps> = ({
  isOpen,
  onClose,
  products,
}) => {
  const { staffs } = useStaffsCache();
  const [selectedTab, setSelectedTab] = useState<TabKey>("product:MEE");
  const [orderedProducts, setOrderedProducts] = useState<OrderableProduct[]>(
    []
  );
  const [orderedWorkers, setOrderedWorkers] = useState<OrderableWorker[]>([]);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState<boolean>(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const isWorkerTab: boolean = selectedTab.startsWith("worker:");
  const selectedType: OrderableType = isWorkerTab
    ? "MEE"
    : (selectedTab.slice("product:".length) as OrderableType);
  const selectedWorkerTab = WORKER_TABS.find(
    (tab) => `worker:${tab.scope}` === selectedTab
  );

  const productsByType = useMemo(() => {
    const grouped = new Map<OrderableType, OrderableProduct[]>();
    ORDERABLE_TYPES.forEach((type) => grouped.set(type, []));
    products.forEach((product) => {
      if (ORDERABLE_TYPES.includes(product.type as OrderableType)) {
        grouped.get(product.type as OrderableType)?.push(product);
      }
    });
    return grouped;
  }, [products]);

  // Reset the working list whenever the modal opens or the tab changes.
  useEffect(() => {
    if (!isOpen) return;
    setDraggedIndex(null);
    setDragOverIndex(null);

    if (!selectedWorkerTab) {
      setOrderedWorkers([]);
      setIsLoadingWorkers(false);
      setOrderedProducts(productsByType.get(selectedType) || []);
      return;
    }

    const scope: ProductionWorkerOrderScope = selectedWorkerTab.scope;
    const jobId: string = selectedWorkerTab.jobId;
    let isCurrent: boolean = true;
    setIsLoadingWorkers(true);

    const buildWorkerList = (workerOrderIds: string[]): OrderableWorker[] => {
      const orderIndex = new Map<string, number>(
        workerOrderIds.map((workerId, index) => [workerId, index])
      );
      return staffs
        .filter((staff) => staff.job.includes(jobId))
        .map((staff) => ({ id: staff.id, name: staff.name }))
        .map((worker, naturalIndex) => ({ worker, naturalIndex }))
        .sort((first, second) => {
          const firstOrder = orderIndex.get(first.worker.id);
          const secondOrder = orderIndex.get(second.worker.id);
          if (firstOrder !== undefined && secondOrder !== undefined) {
            return firstOrder - secondOrder;
          }
          if (firstOrder !== undefined) return -1;
          if (secondOrder !== undefined) return 1;
          return first.naturalIndex - second.naturalIndex;
        })
        .map(({ worker }) => worker);
    };

    api
      .get(
        `${WORKER_ORDER_API_BASE}/worker-order?scope=${encodeURIComponent(
          scope
        )}`
      )
      .then((response: ProductionWorkerOrderResponse) => {
        if (!isCurrent) return;
        // Saved DB order wins; fall back to the baked-in default order when
        // the scope has no saved order (same resolution as the entry grids).
        const workerOrderIds: string[] =
          response.worker_ids && response.worker_ids.length > 0
            ? response.worker_ids
            : DEFAULT_WORKER_ORDERS[scope] || [];
        setOrderedWorkers(buildWorkerList(workerOrderIds));
      })
      .catch((error) => {
        console.error("Error fetching worker order:", error);
        if (!isCurrent) return;
        setOrderedWorkers(buildWorkerList(DEFAULT_WORKER_ORDERS[scope] || []));
      })
      .finally(() => {
        if (isCurrent) setIsLoadingWorkers(false);
      });

    return (): void => {
      isCurrent = false;
    };
  }, [isOpen, selectedTab, selectedType, selectedWorkerTab, productsByType, staffs]);

  const handleDrop = (targetIndex: number): void => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    if (isWorkerTab) {
      setOrderedWorkers((current) => {
        const next = [...current];
        const [moved] = next.splice(draggedIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
    } else {
      setOrderedProducts((current) => {
        const next = [...current];
        const [moved] = next.splice(draggedIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
    }
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      if (selectedWorkerTab) {
        const workerIds: string[] = orderedWorkers.map((worker) => worker.id);
        await api.put(`${WORKER_ORDER_API_BASE}/worker-order`, {
          scope: selectedWorkerTab.scope,
          worker_ids: workerIds,
        });
        // Keep the entry grids' localStorage cache in sync so open entry
        // pages pick up the new order on next load without an extra GET.
        cacheWorkerOrder(selectedWorkerTab.scope, workerIds);
        toast.success(
          `Susunan pekerja ${selectedWorkerTab.label} disimpan`
        );
      } else {
        await api.put("/api/products/order", {
          type: selectedType,
          product_ids: orderedProducts.map((product) => product.id),
        });
        await refreshProductsCache();
        toast.success(`Susunan produk ${TYPE_LABELS[selectedType]} disimpan`);
      }
      onClose();
    } catch (error) {
      console.error("Error saving order:", error);
      toast.error(
        isWorkerTab
          ? "Gagal menyimpan susunan pekerja"
          : "Gagal menyimpan susunan produk"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const rowCount: number = isWorkerTab
    ? orderedWorkers.length
    : orderedProducts.length;
  const isSaveDisabled: boolean =
    isSaving || rowCount === 0 || (isWorkerTab && isLoadingWorkers);

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" onClose={onClose}>
        <div className="min-h-screen px-4 text-center">
          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
          </TransitionChild>

          <span
            className="inline-block h-screen align-middle"
            aria-hidden="true"
          >
            &#8203;
          </span>

          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="inline-block w-full max-w-lg p-6 my-8 text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl">
              <div className="flex items-center justify-between mb-1">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  Susun Semula Produk & Pekerja
                </DialogTitle>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-default-400 dark:text-gray-400 hover:text-default-600 dark:hover:text-gray-200"
                >
                  <IconX size={20} />
                </button>
              </div>
              <p className="mb-4 text-sm text-default-500 dark:text-gray-400">
                Seret untuk menetapkan susunan paparan. Susunan ini dikongsi di
                semua halaman produk dan pengeluaran untuk setiap pengguna.
              </p>

              <div className="mb-4 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-14 text-xs font-semibold uppercase tracking-wide text-default-400 dark:text-gray-500">
                    Produk
                  </span>
                  {ORDERABLE_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedTab(`product:${type}`)}
                      className={clsx(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        selectedTab === `product:${type}`
                          ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-300"
                          : "border-default-300 text-default-600 hover:bg-default-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      )}
                    >
                      {TYPE_LABELS[type]} (
                      {productsByType.get(type)?.length || 0})
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-14 text-xs font-semibold uppercase tracking-wide text-default-400 dark:text-gray-500">
                    Pekerja
                  </span>
                  {WORKER_TABS.map((tab) => (
                    <button
                      key={tab.scope}
                      type="button"
                      onClick={() => setSelectedTab(`worker:${tab.scope}`)}
                      className={clsx(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        selectedTab === `worker:${tab.scope}`
                          ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-300"
                          : "border-default-300 text-default-600 hover:bg-default-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-lg border border-default-200 dark:border-gray-700">
                {isWorkerTab && isLoadingWorkers ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                  </div>
                ) : rowCount === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-default-400 dark:text-gray-500">
                    {isWorkerTab
                      ? "Tiada pekerja untuk kategori ini."
                      : "Tiada produk untuk jenis ini."}
                  </p>
                ) : isWorkerTab ? (
                  orderedWorkers.map((worker, index) => (
                    <div
                      key={worker.id}
                      draggable
                      onDragStart={(event: React.DragEvent<HTMLDivElement>) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDraggedIndex(index);
                      }}
                      onDragOver={(event: React.DragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        if (dragOverIndex !== index) setDragOverIndex(index);
                      }}
                      onDrop={(event: React.DragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        handleDrop(index);
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      className={clsx(
                        "flex cursor-grab items-center gap-3 border-b border-default-100 bg-white px-3 py-2 last:border-b-0 dark:border-gray-700 dark:bg-gray-800",
                        draggedIndex === index && "opacity-40",
                        dragOverIndex === index &&
                          draggedIndex !== null &&
                          draggedIndex !== index &&
                          "border-t-2 border-t-sky-500"
                      )}
                    >
                      <IconGripVertical
                        size={16}
                        className="flex-shrink-0 text-default-300 dark:text-gray-500"
                      />
                      <span className="w-6 text-right text-xs tabular-nums text-default-400 dark:text-gray-500">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-default-900 dark:text-gray-100">
                          {worker.name}
                        </span>
                        <span className="block truncate text-xs text-default-500 dark:text-gray-400">
                          {worker.id}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  orderedProducts.map((product, index) => (
                    <div
                      key={product.id}
                      draggable
                      onDragStart={(event: React.DragEvent<HTMLDivElement>) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDraggedIndex(index);
                      }}
                      onDragOver={(event: React.DragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        if (dragOverIndex !== index) setDragOverIndex(index);
                      }}
                      onDrop={(event: React.DragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        handleDrop(index);
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      className={clsx(
                        "flex cursor-grab items-center gap-3 border-b border-default-100 bg-white px-3 py-2 last:border-b-0 dark:border-gray-700 dark:bg-gray-800",
                        draggedIndex === index && "opacity-40",
                        dragOverIndex === index &&
                          draggedIndex !== null &&
                          draggedIndex !== index &&
                          "border-t-2 border-t-sky-500"
                      )}
                    >
                      <IconGripVertical
                        size={16}
                        className="flex-shrink-0 text-default-300 dark:text-gray-500"
                      />
                      <span className="w-6 text-right text-xs tabular-nums text-default-400 dark:text-gray-500">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-default-900 dark:text-gray-100">
                          {product.id}
                          {product.is_active === false && (
                            <span className="ml-2 rounded bg-default-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-default-500 dark:bg-gray-700 dark:text-gray-400">
                              Tidak Aktif
                            </span>
                          )}
                        </span>
                        {product.description && (
                          <span className="block truncate text-xs text-default-500 dark:text-gray-400">
                            {product.description}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} disabled={isSaving}>
                  Batal
                </Button>
                <Button
                  color="sky"
                  onClick={handleSave}
                  disabled={isSaveDisabled}
                >
                  {isSaving ? "Menyimpan..." : "Simpan Susunan"}
                </Button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ProductOrderModal;
