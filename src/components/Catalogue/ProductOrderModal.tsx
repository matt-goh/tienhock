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

interface OrderableProduct {
  id: string;
  description: string;
  type: string;
  is_active?: boolean;
  sort_order?: number | null;
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
  OTH: "Other",
  JP: "Jelly Polly",
};

// Shared per-type product display order. The list shows every product of the
// selected type in its current display order; dragging a row and saving
// persists exactly the shown order (products.sort_order) for all users.
const ProductOrderModal: React.FC<ProductOrderModalProps> = ({
  isOpen,
  onClose,
  products,
}) => {
  const [selectedType, setSelectedType] = useState<OrderableType>("MEE");
  const [orderedProducts, setOrderedProducts] = useState<OrderableProduct[]>(
    []
  );
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

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

  // Reset the working list whenever the modal opens or the type changes.
  useEffect(() => {
    if (!isOpen) return;
    setOrderedProducts(productsByType.get(selectedType) || []);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [isOpen, selectedType, productsByType]);

  const handleDrop = (targetIndex: number): void => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    setOrderedProducts((current) => {
      const next = [...current];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await api.put("/api/products/order", {
        type: selectedType,
        product_ids: orderedProducts.map((product) => product.id),
      });
      await refreshProductsCache();
      toast.success(`${TYPE_LABELS[selectedType]} product order saved`);
      onClose();
    } catch (error) {
      console.error("Error saving product order:", error);
      toast.error("Failed to save product order");
    } finally {
      setIsSaving(false);
    }
  };

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
                  Reorder Products
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
                Drag products to set their display order. This order is shared
                across all product and production pages for every user.
              </p>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {ORDERABLE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={clsx(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                      selectedType === type
                        ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-300"
                        : "border-default-300 text-default-600 hover:bg-default-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    )}
                  >
                    {TYPE_LABELS[type]} (
                    {productsByType.get(type)?.length || 0})
                  </button>
                ))}
              </div>

              <div className="max-h-80 overflow-y-auto rounded-lg border border-default-200 dark:border-gray-700">
                {orderedProducts.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-default-400 dark:text-gray-500">
                    No products for this type.
                  </p>
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
                              Inactive
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
                  Cancel
                </Button>
                <Button
                  color="sky"
                  onClick={handleSave}
                  disabled={isSaving || orderedProducts.length === 0}
                >
                  {isSaving ? "Saving..." : "Save Order"}
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
