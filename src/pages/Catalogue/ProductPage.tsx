import React, { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import ProductModal from "../../components/Catalogue/ProductModal";
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
} from "@tabler/icons-react";
import { FormListbox } from "../../components/FormComponents";
import { useCustomersCache } from "../../utils/catalogue/useCustomerCache";
import CustomersUsingProductTooltip from "../../components/Catalogue/CustomersUsingProductTooltip";

interface Product {
  id: string;
  description: string;
  price_per_unit: number;
  type: string;
  tax: string;
  is_active: boolean;
}

const ProductPage: React.FC = () => {
  const {
    products: cachedProductsData,
    isLoading: cacheLoading,
    error: cacheError,
  } = useProductsCache("all", { includeInactive: true });

  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [reactivateConfirmOpen, setReactivateConfirmOpen] = useState<boolean>(false);
  const [productToReactivate, setProductToReactivate] = useState<Product | null>(null);
  const [hardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState<boolean>(false);
  const [productToHardDelete, setProductToHardDelete] = useState<Product | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
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
      toast.error("Failed to load products. Please try refreshing.");
    }
  }, [cacheError]);

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
      toast.success("Product deactivated successfully");
      setDeleteConfirmOpen(false);
      setProductToDelete(null);
    } catch (error: any) {
      console.error("Error deactivating product:", error);
      toast.error("Failed to deactivate product. Please try again.");
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
      toast.success("Product reactivated successfully");
      setReactivateConfirmOpen(false);
      setProductToReactivate(null);
    } catch (error: any) {
      console.error("Error reactivating product:", error);
      toast.error("Failed to reactivate product. Please try again.");
    }
  }, [productToReactivate]);

  const confirmHardDelete = useCallback(async () => {
    if (!productToHardDelete) return;

    try {
      // api.delete wraps payload as { products: payload }, so just pass the array
      await api.delete("/api/products", [productToHardDelete.id]);
      await refreshProductsCache();
      toast.success("Product permanently deleted");
      setHardDeleteConfirmOpen(false);
      setProductToHardDelete(null);
    } catch (error: any) {
      console.error("Error deleting product:", error);
      // Check for foreign key constraint error
      const errorMessage = error?.data?.error || error?.message || "";
      if (errorMessage.includes("foreign key constraint") || errorMessage.includes("customer_products")) {
        toast.error(
          "Cannot delete this product - it is assigned to one or more customers. Remove customer assignments first or deactivate instead.",
          { duration: 5000 }
        );
      } else {
        toast.error("Failed to delete product. Please try again.");
      }
    }
  }, [productToHardDelete]);

  const handleSaveProduct = useCallback(
    async (productData: Product) => {
      try {
        if (modalMode === "create") {
          // Check if product ID already exists
          const existingProduct = products.find(
            (p: Product) => p.id === productData.id
          );
          if (existingProduct) {
            toast.error("Product ID already exists");
            return;
          }

          await api.post("/api/products/batch", {
            products: [productData],
          });
          toast.success("Product created successfully");
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
          toast.success("Product updated successfully");
        }

        await refreshProductsCache();
        setIsModalOpen(false);
      } catch (error) {
        console.error("Error saving product:", error);
        const message = (error as any)?.message || "An unknown error occurred";
        toast.error(`Failed to save product: ${message}`);
        throw error; // Re-throw to let modal handle the error state
      }
    },
    [modalMode, selectedProduct, products]
  );

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
        <div className="w-full mb-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg text-default-700 dark:text-gray-200 font-medium">
              Product Catalogue
            </h1>
            <div className="w-48">
              <FormListbox
                name="typeFilter"
                value={typeFilter}
                onChange={(value: string) => setTypeFilter(value)}
                options={[
                  { id: "all", name: "All Types" },
                  { id: "MEE", name: "MEE" },
                  { id: "BH", name: "BH" },
                  { id: "JP", name: "JP" },
                  { id: "OTH", name: "OTH" },
                ]}
              />
            </div>
          </div>

          <Button onClick={handleCreateProduct} icon={IconPlus} color="sky">
            Add Product
          </Button>
        </div>

        <div className="w-full border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {/* Sticky Header */}
          <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[12%]">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[32%]">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[10%]">
                    Price/Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[10%]">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[8%]">
                    Tax
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[10%]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[18%]">
                    Actions
                  </th>
                </tr>
              </thead>
            </table>
          </div>

          {/* Scrollable Body */}
          <div className="max-h-[76vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredProducts.map((product: Product) => (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 w-[12%]">
                      <div className="flex items-center">
                        {product.id}
                        <CustomersUsingProductTooltip
                          productId={product.id}
                          customersMap={productToCustomersMap}
                          className="ml-1"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 w-[32%]">
                      <div className="truncate" title={product.description}>
                        {product.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 w-[10%]">
                      {product.price_per_unit.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 w-[10%]">
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
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                        }`}
                      >
                        {product.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 w-[8%]">
                      {product.tax}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 w-[10%]">
                      {product.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full dark:bg-green-900/30 dark:text-green-300">
                          <IconCheck className="w-3 h-3 mr-0.5" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-full dark:bg-gray-700 dark:text-gray-400">
                          <IconX className="w-3 h-3 mr-0.5" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center w-[18%]">
                      <div className="flex justify-center space-x-2">
                        <Button
                          onClick={() => handleEditProduct(product)}
                          icon={IconEdit}
                          size="sm"
                          variant="outline"
                          color="sky"
                        >
                          Edit
                        </Button>
                        {product.is_active ? (
                          <Button
                            onClick={() => handleDeleteProduct(product)}
                            icon={IconX}
                            size="sm"
                            variant="outline"
                            color="amber"
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleReactivateProduct(product)}
                            icon={IconRefresh}
                            size="sm"
                            variant="outline"
                            color="green"
                          >
                            Reactivate
                          </Button>
                        )}
                        <Button
                          onClick={() => handleHardDeleteProduct(product)}
                          icon={IconTrash}
                          size="sm"
                          variant="outline"
                          color="rose"
                        >
                          Delete
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
                  ? 'No products found. Click "Add Product" to create your first product.'
                  : `No products found for type "${typeFilter}". Try changing the filter or add a new product.`}
              </div>
            )}
          </div>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 ml-auto text-right">
          Showing {filteredProducts.length} of {products.length} products
        </div>
      </div>

      <ProductModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveProduct}
        product={selectedProduct}
        mode={modalMode}
      />

      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        onClose={handleCloseDeleteConfirm}
        onConfirm={confirmDelete}
        title="Deactivate Product"
        message={
          <>
            <p>
              Are you sure you want to deactivate the product "
              {productToDelete?.description}"?
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              This product will be hidden but not permanently deleted. You can
              reactivate it later if needed.
            </p>
          </>
        }
        confirmButtonText="Deactivate"
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={reactivateConfirmOpen}
        onClose={() => {
          setReactivateConfirmOpen(false);
          setProductToReactivate(null);
        }}
        onConfirm={confirmReactivate}
        title="Reactivate Product"
        message={`Are you sure you want to reactivate "${productToReactivate?.description}"? This product will be visible and available for use again.`}
        confirmButtonText="Reactivate"
        variant="success"
      />

      <ConfirmationDialog
        isOpen={hardDeleteConfirmOpen}
        onClose={() => {
          setHardDeleteConfirmOpen(false);
          setProductToHardDelete(null);
        }}
        onConfirm={confirmHardDelete}
        title="Permanently Delete Product"
        message={
          <>
            <p>
              Are you sure you want to <strong>permanently delete</strong> the product "
              {productToHardDelete?.description}"?
            </p>
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400 font-medium">
              This action cannot be undone. The product will be removed from the database.
            </p>
          </>
        }
        confirmButtonText="Delete Permanently"
        variant="danger"
      />
    </div>
  );
};

export default ProductPage;
