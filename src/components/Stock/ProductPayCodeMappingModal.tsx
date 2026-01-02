// src/components/Stock/ProductPayCodeMappingModal.tsx
import React, { useState, useEffect, Fragment, useMemo } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import Checkbox from "../Checkbox";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../LoadingSpinner";
import { IconSearch, IconPackage, IconX, IconCheck, IconPlus, IconMinus } from "@tabler/icons-react";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";
import { useProductsCache } from "../../utils/invoice/useProductsCache";

interface Product {
  id: string;
  description: string;
  type: "MEE" | "BH";
}

interface PayCodeOption {
  id: string;
  description: string;
  pay_type: string;
  rate_unit: string;
  rate_biasa: number;
  rate_ahad: number;
  rate_umum: number;
}

interface ProductPayCodeMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMappingComplete?: () => void;
}

const ProductPayCodeMappingModal: React.FC<ProductPayCodeMappingModalProps> = ({
  isOpen,
  onClose,
  onMappingComplete,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedPayCodeIds, setSelectedPayCodeIds] = useState<Set<string>>(
    new Set()
  );
  const [originalPayCodeIds, setOriginalPayCodeIds] = useState<Set<string>>(
    new Set()
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [payCodeSearch, setPayCodeSearch] = useState("");

  // Get products from cache (only MEE and BH types for packing)
  const { products: cachedProducts, isLoading } = useProductsCache(["MEE", "BH"]);

  // Map cached products to the Product interface (type assertion for MEE/BH)
  const products: Product[] = useMemo(() => {
    return cachedProducts.map((p) => ({
      id: p.id,
      description: p.description,
      type: p.type as "MEE" | "BH",
    }));
  }, [cachedProducts]);

  // Get job pay code mappings for filtering
  const { detailedMappings, productMappings, refreshData } =
    useJobPayCodeMappings();

  // Get available pay codes for the selected product type
  const availablePayCodes = useMemo((): PayCodeOption[] => {
    if (!selectedProduct) return [];

    // Get pay codes from MEE_PACKING or BH_PACKING job based on product type
    const jobId =
      selectedProduct.type === "MEE" ? "MEE_PACKING" : "BH_PACKING";
    const jobPayCodes = detailedMappings[jobId] || [];

    // Filter to only show pay codes with Bag rate unit (piece rate codes)
    return jobPayCodes
      .filter((pc) => pc.rate_unit === "Bag")
      .map((pc) => ({
        id: pc.id,
        description: pc.description,
        pay_type: pc.pay_type,
        rate_unit: pc.rate_unit,
        rate_biasa: pc.rate_biasa,
        rate_ahad: pc.rate_ahad,
        rate_umum: pc.rate_umum,
      }));
  }, [selectedProduct, detailedMappings]);

  // Filter and sort pay codes - saved ones at top
  const filteredPayCodes = useMemo(() => {
    let codes = availablePayCodes;

    // Apply search filter
    if (payCodeSearch) {
      const search = payCodeSearch.toLowerCase();
      codes = codes.filter(
        (pc) =>
          pc.id.toLowerCase().includes(search) ||
          pc.description.toLowerCase().includes(search)
      );
    }

    // Sort: saved first, then others alphabetically
    return codes.sort((a, b) => {
      const aIsSaved = originalPayCodeIds.has(a.id);
      const bIsSaved = originalPayCodeIds.has(b.id);

      if (aIsSaved && !bIsSaved) return -1;
      if (!aIsSaved && bIsSaved) return 1;
      return a.id.localeCompare(b.id);
    });
  }, [availablePayCodes, payCodeSearch, originalPayCodeIds]);

  // Count saved pay codes for separator
  const savedPayCodesCount = useMemo(() => {
    return filteredPayCodes.filter(pc => originalPayCodeIds.has(pc.id)).length;
  }, [filteredPayCodes, originalPayCodeIds]);

  // Load current mappings when product is selected
  useEffect(() => {
    // Only run when modal is open and a product is selected
    if (!isOpen || !selectedProduct) return;

    const currentMappings = productMappings[selectedProduct.id] || [];
    const payCodeIds = new Set(currentMappings.map((m) => m.pay_code_id));

    // Only update if the pay code IDs actually changed to prevent infinite loops
    const currentIds = Array.from(payCodeIds).sort().join(',');
    const existingIds = Array.from(originalPayCodeIds).sort().join(',');

    if (currentIds !== existingIds) {
      setSelectedPayCodeIds(payCodeIds);
      setOriginalPayCodeIds(new Set(payCodeIds));
    }
  }, [isOpen, selectedProduct, productMappings]);

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const search = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.id.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search)
    );
  }, [products, productSearch]);

  // Get mapping count for a product
  const getMappingCount = (productId: string): number => {
    return (productMappings[productId] || []).length;
  };

  const handleTogglePayCode = (payCodeId: string) => {
    setSelectedPayCodeIds((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(payCodeId)) {
        newSelection.delete(payCodeId);
      } else {
        newSelection.add(payCodeId);
      }
      return newSelection;
    });
  };

  const handleSaveProduct = async () => {
    if (!selectedProduct) return;

    setIsProcessing(true);

    try {
      // Find which pay codes to add and which to remove
      const payCodeIdsToAdd = Array.from(selectedPayCodeIds).filter(
        (id) => !originalPayCodeIds.has(id)
      );
      const payCodeIdsToRemove = Array.from(originalPayCodeIds).filter(
        (id) => !selectedPayCodeIds.has(id)
      );

      const promises = [];

      // Handle additions
      if (payCodeIdsToAdd.length > 0) {
        const associations = payCodeIdsToAdd.map((pay_code_id) => ({
          product_id: selectedProduct.id,
          pay_code_id,
        }));
        promises.push(
          api.post("/api/product-pay-codes/batch", { associations })
        );
      }

      // Handle removals
      if (payCodeIdsToRemove.length > 0) {
        const items = payCodeIdsToRemove.map((pay_code_id) => ({
          product_id: selectedProduct.id,
          pay_code_id,
        }));
        promises.push(api.post("/api/product-pay-codes/batch-delete", { items }));
      }

      await Promise.all(promises);

      // Refresh data
      await refreshData();

      toast.success(
        `Updated pay codes for "${selectedProduct.id}" (${payCodeIdsToAdd.length} added, ${payCodeIdsToRemove.length} removed)`
      );

      // Update original to match current selection
      setOriginalPayCodeIds(new Set(selectedPayCodeIds));

      if (onMappingComplete) {
        onMappingComplete();
      }
    } catch (error) {
      console.error("Error updating product pay codes:", error);
      toast.error("Failed to update pay codes");
    } finally {
      setIsProcessing(false);
    }
  };

  const hasChanges = useMemo(() => {
    if (selectedPayCodeIds.size !== originalPayCodeIds.size) return true;
    for (const id of selectedPayCodeIds) {
      if (!originalPayCodeIds.has(id)) return true;
    }
    return false;
  }, [selectedPayCodeIds, originalPayCodeIds]);

  // Get status of a pay code: 'saved' | 'new' | 'removing' | 'none'
  const getPayCodeStatus = (payCodeId: string): 'saved' | 'new' | 'removing' | 'none' => {
    const isSelected = selectedPayCodeIds.has(payCodeId);
    const wasOriginal = originalPayCodeIds.has(payCodeId);

    if (wasOriginal && isSelected) return 'saved';
    if (!wasOriginal && isSelected) return 'new';
    if (wasOriginal && !isSelected) return 'removing';
    return 'none';
  };

  // Count changes
  const changesSummary = useMemo(() => {
    const toAdd = Array.from(selectedPayCodeIds).filter(id => !originalPayCodeIds.has(id)).length;
    const toRemove = Array.from(originalPayCodeIds).filter(id => !selectedPayCodeIds.has(id)).length;
    return { toAdd, toRemove };
  }, [selectedPayCodeIds, originalPayCodeIds]);

  const handleClose = () => {
    setSelectedProduct(null);
    setSelectedPayCodeIds(new Set());
    setOriginalPayCodeIds(new Set());
    setProductSearch("");
    setPayCodeSearch("");
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => !isProcessing && handleClose()}
      >
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-4">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                  >
                    Product Pay Code Mappings
                  </DialogTitle>
                  <button
                    onClick={handleClose}
                    className="text-default-400 hover:text-default-600"
                    disabled={isProcessing}
                  >
                    <IconX size={20} />
                  </button>
                </div>

                <p className="text-sm text-default-500 mb-4">
                  Map products to pay codes for production entry payroll
                  calculations.
                </p>

                {isLoading ? (
                  <div className="flex justify-center items-center py-20">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left Panel - Products */}
                    <div className="border border-default-200 rounded-lg overflow-hidden">
                      <div className="bg-default-50 px-3 py-2 border-b border-default-200">
                        <div className="flex items-center gap-2 text-sm font-medium text-default-700">
                          <IconPackage size={16} />
                          Products
                        </div>
                        <div className="relative mt-2">
                          <IconSearch
                            size={16}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400"
                          />
                          <input
                            type="text"
                            placeholder="Search products..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="max-h-[400px] overflow-y-auto">
                        {filteredProducts.length === 0 ? (
                          <div className="py-4 text-center text-sm text-default-500">
                            No products found
                          </div>
                        ) : (
                          <ul className="divide-y divide-default-100">
                            {filteredProducts.map((product) => {
                              const mappingCount = getMappingCount(product.id);
                              const isSelected =
                                selectedProduct?.id === product.id;
                              return (
                                <li
                                  key={product.id}
                                  className={`px-3 py-2 cursor-pointer transition-colors ${
                                    isSelected
                                      ? "bg-sky-50 shadow-[inset_3px_0_0_0_#0ea5e9]"
                                      : "hover:bg-default-50"
                                  }`}
                                  onClick={() => setSelectedProduct(product)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-sm text-default-800">
                                        {product.id}
                                      </div>
                                      <div className="text-xs text-default-500 truncate max-w-[200px]">
                                        {product.description}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`px-1.5 py-0.5 text-xs rounded ${
                                          product.type === "MEE"
                                            ? "bg-green-100 text-green-700"
                                            : "bg-blue-100 text-blue-700"
                                        }`}
                                      >
                                        {product.type}
                                      </span>
                                      {mappingCount > 0 && (
                                        <span className="text-xs bg-default-100 text-default-600 px-1.5 py-0.5 rounded">
                                          {mappingCount}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Right Panel - Pay Codes */}
                    <div className="border border-default-200 rounded-lg overflow-hidden">
                      <div className="bg-default-50 px-3 py-2 border-b border-default-200">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-default-700">
                            {selectedProduct
                              ? `Pay Codes for ${selectedProduct.id}`
                              : "Select a product"}
                          </div>
                          {selectedProduct && (
                            <span className="text-xs text-default-500">
                              {selectedPayCodeIds.size} selected
                            </span>
                          )}
                        </div>
                        {selectedProduct && (
                          <div className="relative mt-2">
                            <IconSearch
                              size={16}
                              className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400"
                            />
                            <input
                              type="text"
                              placeholder="Search pay codes..."
                              className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                              value={payCodeSearch}
                              onChange={(e) => setPayCodeSearch(e.target.value)}
                            />
                          </div>
                        )}
                      </div>

                      <div className="max-h-[400px] overflow-y-auto">
                        {!selectedProduct ? (
                          <div className="py-10 text-center text-sm text-default-500">
                            <IconPackage
                              size={32}
                              className="mx-auto mb-2 text-default-300"
                            />
                            Select a product to manage its pay codes
                          </div>
                        ) : filteredPayCodes.length === 0 ? (
                          <div className="py-4 text-center text-sm text-default-500">
                            No pay codes available for this product type
                          </div>
                        ) : (
                          <ul className="divide-y divide-default-100">
                            {/* Header for saved section */}
                            {savedPayCodesCount > 0 && (
                              <li className="px-3 py-1.5 bg-green-50 text-xs text-green-700 font-medium">
                                Mapped Pay Codes ({savedPayCodesCount})
                              </li>
                            )}
                            {filteredPayCodes.map((payCode, index) => {
                              const status = getPayCodeStatus(payCode.id);
                              const statusStyles = {
                                saved: 'bg-green-50 border-l-2 border-green-400',
                                new: 'bg-sky-50 border-l-2 border-sky-400',
                                removing: 'bg-red-50 border-l-2 border-red-300 opacity-60',
                                none: '',
                              };
                              const showSeparator = savedPayCodesCount > 0 && index === savedPayCodesCount;

                              return (
                                <React.Fragment key={payCode.id}>
                                  {showSeparator && (
                                    <li className="px-3 py-1.5 bg-default-100 text-xs text-default-500 font-medium border-t border-default-200">
                                      Available Pay Codes ({filteredPayCodes.length - savedPayCodesCount})
                                    </li>
                                  )}
                                  <li
                                    className={`px-3 py-2 hover:bg-default-100 cursor-pointer transition-colors select-none ${statusStyles[status]}`}
                                    onClick={() => handleTogglePayCode(payCode.id)}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                          checked={selectedPayCodeIds.has(payCode.id)}
                                          onChange={() => handleTogglePayCode(payCode.id)}
                                          size={18}
                                          checkedColor="text-sky-600"
                                          uncheckedColor="text-default-400"
                                        />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className={`font-medium text-sm ${status === 'removing' ? 'line-through text-default-400' : 'text-default-800'}`}>
                                          {payCode.id}
                                        </div>
                                        <div className="text-xs text-default-500 truncate">
                                          {payCode.description}
                                        </div>
                                        <div className="text-xs text-default-400 mt-0.5">
                                          RM{payCode.rate_biasa.toFixed(2)}/bag
                                        </div>
                                      </div>
                                      {status !== 'none' && (
                                        <span className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full whitespace-nowrap ${
                                          status === 'saved' ? 'bg-green-100 text-green-700' :
                                          status === 'new' ? 'bg-sky-100 text-sky-700' :
                                          'bg-red-100 text-red-600'
                                        }`}>
                                          {status === 'saved' && <><IconCheck size={12} /> Saved</>}
                                          {status === 'new' && <><IconPlus size={12} /> New</>}
                                          {status === 'removing' && <><IconMinus size={12} /> Remove</>}
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                </React.Fragment>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-6 flex justify-between items-center">
                  <div className="text-sm">
                    {hasChanges && selectedProduct ? (
                      <div className="flex items-center gap-3">
                        <span className="text-amber-600 font-medium">
                          Pending changes for {selectedProduct.id}:
                        </span>
                        {changesSummary.toAdd > 0 && (
                          <span className="flex items-center gap-1 text-sky-600">
                            <IconPlus size={14} /> {changesSummary.toAdd} to add
                          </span>
                        )}
                        {changesSummary.toRemove > 0 && (
                          <span className="flex items-center gap-1 text-red-500">
                            <IconMinus size={14} /> {changesSummary.toRemove} to remove
                          </span>
                        )}
                      </div>
                    ) : selectedProduct ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <IconCheck size={14} /> All changes saved
                      </span>
                    ) : (
                      <span className="text-default-400">Select a product to manage mappings</span>
                    )}
                  </div>
                  <div className="flex space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={isProcessing}
                    >
                      Close
                    </Button>
                    {selectedProduct && (
                      <Button
                        type="button"
                        color="sky"
                        variant="filled"
                        onClick={handleSaveProduct}
                        disabled={isProcessing || !hasChanges}
                      >
                        {isProcessing ? "Saving..." : "Save Changes"}
                      </Button>
                    )}
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ProductPayCodeMappingModal;
