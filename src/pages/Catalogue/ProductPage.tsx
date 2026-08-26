import React, { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { useTranslation, Trans } from "react-i18next";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import ProductModal, {
  PaycodeSetupPayload,
} from "../../components/Catalogue/ProductModal";
import ProductOrderModal from "../../components/Catalogue/ProductOrderModal";
import ProductPayCodeManager from "../../components/Catalogue/ProductPayCodeManager";
import {
  refreshProductsCache,
  useProductsCache,
} from "../../utils/invoice/useProductsCache";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
  IconRefresh,
  IconArrowsSort,
  IconLink,
} from "@tabler/icons-react";
import { FormListbox } from "../../components/FormComponents";
import { useCustomersCache } from "../../utils/catalogue/useCustomerCache";
import CustomersUsingProductTooltip from "../../components/Catalogue/CustomersUsingProductTooltip";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import { usePersistedFilters } from "../../hooks/usePersistedFilters";
import { invalidateJobPayCodeMappingsCache } from "../../utils/catalogue/useJobPayCodeMappings";
import { invalidateJPJobPayCodeMappingsCache } from "../../utils/JellyPolly/useJPJobPayCodeMappings";
import { invalidateSalesmanIkutPayCodesCache } from "../../utils/catalogue/useSalesmanIkutPayCodes";

interface Product {
  id: string;
  description: string;
  price_per_unit: number;
  type: string;
  tax: string;
  is_active: boolean;
}

const ProductPage: React.FC = () => {
  const { t } = useTranslation("catalogue");
  const {
    products: cachedProductsData,
    isLoading: cacheLoading,
    error: cacheError,
  } = useProductsCache("all", { includeInactive: true });

  const [products, setProducts] = useState<Product[]>([]);
  const [isRefreshingCache, setIsRefreshingCache] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [payCodeProduct, setPayCodeProduct] = useState<Product | null>(null);
  const [isPayCodeManagerOpen, setIsPayCodeManagerOpen] =
    useState<boolean>(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [reactivateConfirmOpen, setReactivateConfirmOpen] = useState<boolean>(false);
  const [productToReactivate, setProductToReactivate] = useState<Product | null>(null);
  const [hardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState<boolean>(false);
  const [productToHardDelete, setProductToHardDelete] = useState<Product | null>(null);
  // The product-type filter persists so returning to the page keeps the same
  // slice of the catalogue.
  const [typeFilter, setTypeFilter] = usePersistedFilters<string>(
    "productListTypeFilter",
    () => "all",
    (cached) => (typeof cached === "string" ? cached : null)
  );
  const {
    customers,
    isLoading: isCustomersLoading,
    error: customersError,
  } = useCustomersCache();

  const filteredProducts = React.useMemo(() => {
    if (typeFilter === "all") {
      return products;
    }
    return products.filter((product: Product) => product.type === typeFilter);
  }, [products, typeFilter]);

  const productToCustomersMap = useMemo(() => {
    // Create reverse mapping: productId -> customer info[]
    const reverseMap: Record<
      string,
      Array<{
        customer_id: string;
        customer_name: string;
        custom_price: number;
        is_available: boolean;
      }>
    > = {};

    // Go through each customer and their custom products
    customers.forEach((customer) => {
      if (customer.customProducts && customer.customProducts.length > 0) {
        customer.customProducts.forEach((customProduct) => {
          const productId = customProduct.product_id;
          if (!reverseMap[productId]) {
            reverseMap[productId] = [];
          }
          reverseMap[productId].push({
            customer_id: customer.id,
            customer_name: customer.name,
            custom_price: Number(customProduct.custom_price),
            is_available: customProduct.is_available,
          });
        });
      }
    });

    return reverseMap;
  }, [customers]);

  useEffect(() => {
    if (cachedProductsData) {
      setProducts(cachedProductsData as Product[]);
    }
  }, [cachedProductsData]);

  useEffect(() => {
    if (cacheError) {
      console.error("Error fetching products from cache:", cacheError);
      toast.error(t("Failed to load products. Please try refreshing."));
    }
  }, [cacheError]);

  // The catalogue is a single long table; restore the scroll position on return.
  useScrollRestoration("product-list", !cacheLoading && products.length > 0);

  const handleCreateProduct = useCallback(() => {
    setModalMode("create");
    setSelectedProduct(null);
    setIsModalOpen(true);
  }, []);

  const handleEditProduct = useCallback((product: Product) => {
    setModalMode("edit");
    setSelectedProduct(product);
    setIsModalOpen(true);
  }, []);

  const handleManagePayCodes = useCallback((product: Product): void => {
    setIsModalOpen(false);
    setSelectedProduct(null);
    setPayCodeProduct(product);
    setIsPayCodeManagerOpen(true);
  }, []);

  const handleClosePayCodeManager = useCallback((): void => {
    setIsPayCodeManagerOpen(false);
    setPayCodeProduct(null);
  }, []);

  const handleDeleteProduct = useCallback((product: Product) => {
    setProductToDelete(product);
    setDeleteConfirmOpen(true);
  }, []);

  const handleReactivateProduct = useCallback((product: Product) => {
    setProductToReactivate(product);
    setReactivateConfirmOpen(true);
  }, []);

  const handleHardDeleteProduct = useCallback((product: Product) => {
    setProductToHardDelete(product);
    setHardDeleteConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!productToDelete) return;

    try {
      // Soft delete by setting is_active to false
      await api.put(`/api/products/${productToDelete.id}`, {
        ...productToDelete,
        is_active: false,
      });
      await refreshProductsCache();
      toast.success(t("Product deactivated successfully"));
      setDeleteConfirmOpen(false);
      setProductToDelete(null);
    } catch (error: any) {
      console.error("Error deactivating product:", error);
      toast.error(t("Failed to deactivate product. Please try again."));
    }
  }, [productToDelete]);

  const confirmReactivate = useCallback(async () => {
    if (!productToReactivate) return;

    try {
      await api.put(`/api/products/${productToReactivate.id}`, {
        ...productToReactivate,
        is_active: true,
      });
      await refreshProductsCache();
      toast.success(t("Product reactivated successfully"));
      setReactivateConfirmOpen(false);
      setProductToReactivate(null);
    } catch (error: any) {
      console.error("Error reactivating product:", error);
      toast.error(t("Failed to reactivate product. Please try again."));
    }
  }, [productToReactivate]);

  const confirmHardDelete = useCallback(async () => {
    if (!productToHardDelete) return;

    try {
      // api.delete wraps payload as { products: payload }, so just pass the array
      await api.delete("/api/products", [productToHardDelete.id]);
      await refreshProductsCache();
      toast.success(t("Product permanently deleted"));
      setHardDeleteConfirmOpen(false);
      setProductToHardDelete(null);
    } catch (error: any) {
      console.error("Error deleting product:", error);
      // Check for foreign key constraint error
      const errorMessage =
        error?.data?.message || error?.data?.error || error?.message || "";
      if (
        errorMessage.includes(
          "Unlink all pay codes from the product before permanently deleting it"
        )
      ) {
        toast.error(
          t(
            "Unlink all pay codes from this product before permanently deleting it."
          ),
          { duration: 5000 }
        );
      } else if (
        errorMessage.includes("foreign key constraint") ||
        errorMessage.includes("customer_products")
      ) {
        toast.error(
          t(
            "Cannot delete this product - it is assigned to one or more customers. Remove customer assignments first or deactivate instead."
          ),
          { duration: 5000 }
        );
      } else {
        toast.error(t("Failed to delete product. Please try again."));
      }
    }
  }, [productToHardDelete]);

  const handleSaveProduct = useCallback(
    async (productData: Product, paycodeSetup?: PaycodeSetupPayload[]) => {
      try {
        if (modalMode === "create") {
          // Check if product ID already exists
          const existingProduct = products.find(
            (p: Product) => p.id === productData.id
          );
          if (existingProduct) {
            toast.error(t("Product ID already exists"));
            return;
          }

          if (paycodeSetup && paycodeSetup.length > 0) {
            // One atomic call creates the product, its pay codes and the
            // product/job mappings (or nothing at all).
            await api.post("/api/products/with-paycode-setup", {
              product: productData,
              paycodes: paycodeSetup,
              scope: productData.type === "JP" ? "jellypolly" : "tienhock",
            });
            // The pay-code/mapping hooks cache in localStorage for up to an
            // hour; drop the caches so the Pay Codes, Mappings and daily-log
            // pages pick up the new codes on their next mount.
            invalidateJobPayCodeMappingsCache();
            invalidateJPJobPayCodeMappingsCache();
            invalidateSalesmanIkutPayCodesCache();
          } else {
            await api.post("/api/products/batch", {
              products: [productData],
            });
          }
          toast.success(t("Product created successfully"));
        } else {
          // For edit mode
          const updateData = {
            ...productData,
            id: selectedProduct?.id, // Use original ID for the update key
            newId:
              productData.id !== selectedProduct?.id
                ? productData.id
                : undefined,
          };

          await api.post("/api/products/batch", {
            products: [updateData],
          });
          toast.success(t("Product updated successfully"));
        }

        await refreshProductsCache();
        setIsModalOpen(false);
      } catch (error) {
        console.error("Error saving product:", error);
        const message =
          (error as any)?.message || t("An unknown error occurred");
        toast.error(t("Failed to save product: {{message}}", { message }));
        throw error; // Re-throw to let modal handle the error state
      }
    },
    [modalMode, selectedProduct, products]
  );

  // Manually re-fetch the shared product cache (localStorage + the
  // products-updated event) so the list reflects changes made elsewhere.
  const handleRefreshCache = async () => {
    if (isRefreshingCache) return;
    setIsRefreshingCache(true);
    try {
      await refreshProductsCache();
      toast.success(t("Product cache refreshed"));
    } catch (error) {
      console.error("Error refreshing product cache:", error);
      toast.error(t("Failed to refresh product cache"));
    } finally {
      setIsRefreshingCache(false);
    }
  };

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  }, []);

  const handleCloseDeleteConfirm = useCallback(() => {
    setDeleteConfirmOpen(false);
    setProductToDelete(null);
  }, []);

  if ((cacheLoading && products.length === 0) || isCustomersLoading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (cacheError || customersError) {
    return (
      <div className="w-full p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700">
          {typeof cacheError === "object" && cacheError instanceof Error
            ? cacheError.message
            : cacheError ||
              (typeof customersError === "object" &&
              customersError instanceof Error
                ? customersError.message
                : customersError)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center w-full">
        <div className="mb-4 flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <h1 className="text-lg text-default-700 dark:text-gray-200 font-medium">
              {t("Product Catalogue")}
            </h1>
            <div className="w-full sm:w-48">
              <FormListbox
                name="typeFilter"
                value={typeFilter}
                onChange={(value: string) => setTypeFilter(value)}
                options={[
                  { id: "all", name: t("All Types") },
                  { id: "MEE", name: "MEE" },
                  { id: "BH", name: "BH" },
                  { id: "RAMEN", name: "RAMEN" },
                  { id: "BUNDLE", name: "BUNDLE" },
                  { id: "JP", name: "JP" },
                  { id: "OTH", name: "OTH" },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleRefreshCache}
              icon={IconRefresh}
              variant="outline"
              disabled={isRefreshingCache}
              title={t("Refresh product cache")}
              className={isRefreshingCache ? "[&_svg]:animate-spin" : ""}
            >
              {t("Refresh")}
            </Button>
            <Button
              onClick={() => setIsOrderModalOpen(true)}
              icon={IconArrowsSort}
              variant="outline"
            >
              {t("Reorder")}
            </Button>
            <Button onClick={handleCreateProduct} icon={IconPlus} color="sky">
              {t("Add Product")}
            </Button>
          </div>
        </div>

        <div className="w-full rounded-lg border border-default-200 dark:border-gray-700">
          {/* Single table with sticky header so column widths match the body */}
            <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 w-[11%] border-b border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {t("ID")}
                  </th>
                  <th className="sticky top-0 z-10 w-[20%] border-b border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {t("description", { ns: "common" })}
                  </th>
                  <th className="sticky top-0 z-10 w-[9%] border-b border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {t("Price/Unit")}
                  </th>
                  <th className="sticky top-0 z-10 w-[8%] border-b border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {t("type", { ns: "common" })}
                  </th>
                  <th className="sticky top-0 z-10 w-[10%] border-b border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {t("status", { ns: "common" })}
                  </th>
                  <th className="sticky top-0 z-10 w-[42%] border-b border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {t("actions", { ns: "common" })}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredProducts.map((product: Product) => (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="w-[11%] px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div className="flex items-center">
                        {product.id}
                        <CustomersUsingProductTooltip
                          productId={product.id}
                          customersMap={productToCustomersMap}
                          className="ml-1"
                        />
                      </div>
                    </td>
                    <td className="w-[20%] px-4 py-4 text-sm text-gray-900 dark:text-gray-100">
                      <div className="truncate" title={product.description}>
                        {product.description}
                      </div>
                    </td>
                    <td className="w-[9%] px-4 py-4 text-sm text-gray-900 dark:text-gray-100">
                      {product.price_per_unit.toFixed(2)}
                    </td>
                    <td className="w-[8%] px-4 py-4 text-sm text-gray-900 dark:text-gray-100">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          product.type === "MEE"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            : product.type === "BH"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : product.type === "JP"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                            : product.type === "OTH"
                            ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                            : product.type === "BUNDLE"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                            : product.type === "RAMEN"
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                        }`}
                      >
                        {product.type}
                      </span>
                    </td>
                    <td className="w-[10%] px-4 py-4 text-sm text-gray-900 dark:text-gray-100">
                      {product.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full dark:bg-green-900/30 dark:text-green-300">
                          <IconCheck className="w-3 h-3 mr-0.5" />
                          {t("active", { ns: "common" })}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-full dark:bg-gray-700 dark:text-gray-400">
                          <IconX className="w-3 h-3 mr-0.5" />
                          {t("inactive", { ns: "common" })}
                        </span>
                      )}
                    </td>
                    <td className="w-[42%] px-4 py-4 text-center text-sm font-medium">
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button
                          onClick={() => handleEditProduct(product)}
                          icon={IconEdit}
                          size="sm"
                          variant="outline"
                          color="sky"
                        >
                          {t("Edit")}
                        </Button>
                        <Button
                          onClick={() => handleManagePayCodes(product)}
                          icon={IconLink}
                          size="sm"
                          variant="outline"
                          color="purple"
                          title={t("Manage pay codes for {{product}}", {
                            product: product.id,
                          })}
                        >
                          {t("Pay Codes")}
                        </Button>
                        {product.is_active ? (
                          <Button
                            onClick={() => handleDeleteProduct(product)}
                            icon={IconX}
                            size="sm"
                            variant="outline"
                            color="amber"
                          >
                            {t("Deactivate")}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleReactivateProduct(product)}
                            icon={IconRefresh}
                            size="sm"
                            variant="outline"
                            color="green"
                          >
                            {t("Reactivate")}
                          </Button>
                        )}
                        <Button
                          onClick={() => handleHardDeleteProduct(product)}
                          icon={IconTrash}
                          size="sm"
                          variant="outline"
                          color="rose"
                        >
                          {t("delete", { ns: "common" })}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredProducts.length === 0 && !cacheLoading && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {typeFilter === "all"
                  ? t(
                      "No products found. Click \"Add Product\" to create your first product."
                    )
                  : t(
                      "No products found for type \"{{type}}\". Try changing the filter or add a new product.",
                      { type: typeFilter }
                    )}
              </div>
            )}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 ml-auto text-right">
          {t("Showing {{shown}} of {{total}} products", {
            shown: filteredProducts.length,
            total: products.length,
          })}
        </div>
      </div>

      <ProductModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveProduct}
        product={selectedProduct}
        mode={modalMode}
        onManagePayCodes={handleManagePayCodes}
      />

      {payCodeProduct && (
        <ProductPayCodeManager
          isOpen={isPayCodeManagerOpen}
          onClose={handleClosePayCodeManager}
          product={payCodeProduct}
        />
      )}

      <ProductOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        products={products}
      />

      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        onClose={handleCloseDeleteConfirm}
        onConfirm={confirmDelete}
        title={t("Deactivate Product")}
        message={
          <>
            <p>
              {t("Are you sure you want to deactivate the product \"{{name}}\"?", {
                name: productToDelete?.description,
              })}
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t(
                "This product will be hidden but not permanently deleted. You can reactivate it later if needed."
              )}
            </p>
          </>
        }
        confirmButtonText={t("Deactivate")}
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={reactivateConfirmOpen}
        onClose={() => {
          setReactivateConfirmOpen(false);
          setProductToReactivate(null);
        }}
        onConfirm={confirmReactivate}
        title={t("Reactivate Product")}
        message={t(
          "Are you sure you want to reactivate \"{{name}}\"? This product will be visible and available for use again.",
          { name: productToReactivate?.description }
        )}
        confirmButtonText={t("Reactivate")}
        variant="success"
      />

      <ConfirmationDialog
        isOpen={hardDeleteConfirmOpen}
        onClose={() => {
          setHardDeleteConfirmOpen(false);
          setProductToHardDelete(null);
        }}
        onConfirm={confirmHardDelete}
        title={t("Permanently Delete Product")}
        message={
          <>
            <p>
              <Trans
                i18nKey={"Are you sure you want to <strong>permanently delete</strong> the product \"{{name}}\"?"}
                ns="catalogue"
                values={{ name: productToHardDelete?.description }}
                components={{ strong: <strong /> }}
              />
            </p>
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400 font-medium">
              {t(
                "This action cannot be undone. The product will be removed from the database."
              )}
            </p>
          </>
        }
        confirmButtonText={t("Delete Permanently")}
        variant="danger"
      />
    </div>
  );
};

export default ProductPage;
