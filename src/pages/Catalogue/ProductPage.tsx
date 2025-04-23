import React, { useState, useEffect, useCallback } from "react";
import _ from "lodash";
import Table from "../../components/Table/Table";
import { ColumnConfig } from "../../types/types";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  refreshProductsCache,
  useProductsCache,
} from "../../utils/invoice/useProductsCache";

interface Product {
  originalId: string;
  id: string;
  description: string;
  price_per_unit: number;
  type: string;
  tax: string;
  [key: string]: any;
}

const ProductPage: React.FC = () => {
  const {
    products: cachedProductsData,
    isLoading: cacheLoading,
    error: cacheError,
  } = useProductsCache("all"); // Use the cache hook

  const [products, setProducts] = useState<Product[]>([]);
  const [editedProducts, setEditedProducts] = useState<Product[]>([]);
  const [originalProducts, setOriginalProducts] = useState<Product[]>([]);
  // Removed local loading state, using cacheLoading now
  const [isEditing, setIsEditing] = useState(false);

  // Effect to update local products state when cache data changes
  useEffect(() => {
    if (cachedProductsData) {
      // Map cached data to include originalId for editing purposes
      setProducts(
        cachedProductsData.map((product: any) => ({
          ...product,
          originalId: product.id,
        }))
      );
    }
  }, [cachedProductsData]);

  // Effect to handle cache errors
  useEffect(() => {
    if (cacheError) {
      console.error("Error fetching products from cache:", cacheError);
      toast.error("Failed to load products. Please try refreshing.");
    }
  }, [cacheError]);

  const columns: ColumnConfig[] = [
    { id: "id", header: "ID", type: "readonly", width: 150 },
    { id: "description", header: "Description", type: "readonly", width: 350 },
    {
      id: "price_per_unit",
      header: "Price/Unit",
      type: "readonly",
      width: 150,
    },
    { id: "type", header: "Type", type: "readonly", width: 100 },
    { id: "tax", header: "Tax", type: "readonly", width: 100 },
  ];

  const editableColumns: ColumnConfig[] = columns.map((col) => {
    if (col.id === "price_per_unit") {
      return { ...col, type: "rate" };
    }
    if (col.id === "tax") {
      return { ...col, type: "listbox", options: ["None", "SR", "ZRL"] };
    }
    // Allow editing ID, description, type as string
    if (["id", "description", "type"].includes(col.id)) {
      return { ...col, type: "string" };
    }
    // Keep tax as listbox, price as rate
    return col; // Keep others readonly implicitly if not matched
  });

  // Removed fetchProducts and its useEffect, cache handles fetching

  // Effect to sync edited/original state when editing starts or products change
  useEffect(() => {
    if (isEditing) {
      // Use the current local products state derived from the cache
      setEditedProducts([...products]);
      setOriginalProducts([...products]);
    }
  }, [isEditing, products]); // Depend on local products state

  const handleDataChange = useCallback((updatedData: Product[]) => {
    // Use setTimeout to defer state update slightly, can help with performance
    setTimeout(() => setEditedProducts(updatedData), 0);
  }, []);

  const handleDeleteProducts = useCallback(
    async (selectedIndices: number[]) => {
      // Use the current local products state to identify items to delete
      const productsToDelete = selectedIndices.map((index) => products[index]);
      const productIdsToDelete = productsToDelete.map((product) => product.id);

      if (productIdsToDelete.length === 0) {
        toast("No products selected for deletion.");
        return;
      }

      try {
        await api.delete("/api/products", productIdsToDelete);

        // Refresh products cache after deletion instead of setting local state directly
        await refreshProductsCache(); // This will trigger the cache hook to refetch

        toast.success("Selected products deleted successfully");
        setIsEditing(false); // Exit editing mode after successful deletion
      } catch (error) {
        console.error("Error deleting selected products:", error);
        toast.error("Failed to delete products. Please try again.");
      }
    },
    [products] // Depend on local products state
  );

  const handleSave = useCallback(async () => {
    try {
      // Validate product IDs
      const emptyProductId = editedProducts.find(
        (product) => !product.id?.trim() // Add optional chaining for safety
      );
      if (emptyProductId) {
        toast.error("Product ID cannot be empty");
        return;
      }

      const productIds = new Set();
      const duplicateProductId = editedProducts.find((product) => {
        if (productIds.has(product.id)) {
          return true;
        }
        productIds.add(product.id);
        return false;
      });

      if (duplicateProductId) {
        toast.error(`Duplicate Product ID: ${duplicateProductId.id}`);
        return;
      }

      // Check for changes
      const productsChanged = !_.isEqual(
        editedProducts.map((product) => _.omit(product, ["originalId"])),
        originalProducts.map((product) => _.omit(product, ["originalId"]))
      );

      if (!productsChanged) {
        toast("No changes detected");
        setIsEditing(false);
        return;
      }

      // Prepare data for batch update, mapping originalId back to id for the API
      const productsToUpdate = editedProducts.map((product) => ({
        ..._.omit(product, ["originalId"]), // Send clean product data
        newId: product.id !== product.originalId ? product.id : undefined, // Send newId only if ID changed
        id: product.originalId, // Use originalId as the key for update/creation
      }));

      await api.post("/api/products/batch", {
        products: productsToUpdate,
      });

      // After successfully saving, refresh the products cache instead of setting local state
      await refreshProductsCache(); // This triggers the cache hook to refetch

      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error updating products:", error);
      // Attempt to provide a more specific error message if available
      const message =
        (error as any)?.response?.data?.message ||
        (error as Error).message ||
        "An unknown error occurred";
      toast.error(`Failed to save changes: ${message}`);
    }
  }, [editedProducts, originalProducts]); // Depend on edit states

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedProducts([]); // Clear edits
    setOriginalProducts([]); // Clear original snapshot
  }, []);

  const handleToggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev);
    if (isEditing) {
      // If toggling off editing, clear the edit states
      setEditedProducts([]);
      setOriginalProducts([]);
    }
    // When toggling on, the useEffect [isEditing, products] will populate the states
  }, [isEditing]); // Depend on isEditing state

  // Use cacheLoading state for the loading spinner
  if (cacheLoading && products.length === 0) {
    // Show spinner only on initial load
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex flex-col items-center justify-center w-auto">
        <div className="relative w-full text-center text-lg text-default-700 font-medium mb-6">
          Product Catalogue
        </div>
        <div className="relative justify-center">
          <Table
            // Use local products state (derived from cache) when not editing
            // Use editedProducts state when editing
            initialData={isEditing ? editedProducts : products}
            columns={isEditing ? editableColumns : columns}
            onShowDeleteButton={() => {}} // Placeholder or implement if needed
            onDelete={handleDeleteProducts}
            onChange={handleDataChange}
            isEditing={isEditing}
            onToggleEditing={handleToggleEditing}
            onSave={handleSave}
            onCancel={handleCancel}
            tableKey="product-catalogue"
          />
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
