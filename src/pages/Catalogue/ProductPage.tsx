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
import { IconPlus, IconEdit, IconTrash } from "@tabler/icons-react";
import { FormListbox } from "../../components/FormComponents";
import { useCustomersCache } from "../../utils/catalogue/useCustomerCache";
import CustomersUsingProductTooltip from "../../components/Catalogue/CustomersUsingProductTooltip";

interface Product {
  id: string;
  description: string;
  price_per_unit: number;
  type: string;
  tax: string;
}

const ProductPage: React.FC = () => {
  const {
    products: cachedProductsData,
    isLoading: cacheLoading,
    error: cacheError,
  } = useProductsCache("all");

  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
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

  const confirmDelete = useCallback(async () => {
    if (!productToDelete) return;

    try {
      await api.delete("/api/products", [productToDelete.id]);
      await refreshProductsCache();
      toast.success("Product deleted successfully");
      setDeleteConfirmOpen(false);
      setProductToDelete(null);
    } catch (error: any) {
      console.error("Error deleting product:", error);

      // Check for foreign key constraint violation
      const errorMessage = error?.error || error?.message || "";
      if (
        errorMessage.includes("foreign key constraint") ||
        errorMessage.includes("customer_products_product_id_fkey")
      ) {
        toast.error(
          `Cannot delete "${productToDelete.description}" because it is associated with customer records. Please remove all customer associations first.`,
          { duration: 6000 }
        );
      } else {
        toast.error("Failed to delete product. Please try again.");
      }
    }
  }, [productToDelete]);

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
    <div className="relative mb-4 w-full mx-6">
      <div className="flex flex-col items-center justify-center w-full">
        <div className="relative w-full text-center text-lg text-default-700 font-medium mb-2">
          Product Catalogue
        </div>

        <div className="w-full mb-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
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

        <div className="w-full border border-default-200 rounded-lg overflow-hidden">
          {/* Sticky Header */}
          <div className="bg-gray-50 border-b border-gray-200">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[35%]">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[12%]">
                    Price/Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%]">
                    Tax
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[20%]">
                    Actions
                  </th>
                </tr>
              </thead>
            </table>
          </div>

          {/* Scrollable Body */}
          <div className="max-h-[72vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProducts.map((product: Product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 w-[15%]">
                      <div className="flex items-center">
                        {product.id}
                        <CustomersUsingProductTooltip
                          productId={product.id}
                          customersMap={productToCustomersMap}
                          className="ml-1"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 w-[35%]">
                      <div className="truncate" title={product.description}>
                        {product.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 w-[12%]">
                      {product.price_per_unit.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 w-[10%]">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          product.type === "MEE"
                            ? "bg-blue-100 text-blue-800"
                            : product.type === "BH"
                            ? "bg-green-100 text-green-800"
                            : product.type === "JP"
                            ? "bg-amber-100 text-amber-800"
                            : product.type === "OTH"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {product.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 w-[8%]">
                      {product.tax}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center w-[20%]">
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
                        <Button
                          onClick={() => handleDeleteProduct(product)}
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
              <div className="text-center py-8 text-gray-500">
                {typeFilter === "all"
                  ? 'No products found. Click "Add Product" to create your first product.'
                  : `No products found for type "${typeFilter}". Try changing the filter or add a new product.`}
              </div>
            )}
          </div>
        </div>
        <div className="text-sm text-gray-500 mt-2 ml-auto text-right">
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
        title="Delete Product"
        message={
          <>
            <p>
              Are you sure you want to delete the product "
              {productToDelete?.description}"?
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Note: Products that are associated with customers cannot be
              deleted. You will need to remove all customer associations first.
            </p>
          </>
        }
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default ProductPage;
