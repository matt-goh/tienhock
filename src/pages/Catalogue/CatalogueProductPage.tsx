import React, { useState, useEffect, useCallback } from "react";
import _ from "lodash";
import Table from "../../components/Table/Table";
import { ColumnConfig } from "../../types/types";
import toast from "react-hot-toast";
import { API_BASE_URL } from "../../configs/config";

interface Product {
  originalId: string;
  id: string;
  description: string;
  price_per_unit: number;
  type: string;
  tax: string;
  [key: string]: any;
}

const CatalogueProductPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [editedProducts, setEditedProducts] = useState<Product[]>([]);
  const [originalProducts, setOriginalProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

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
    return { ...col, type: "string" };
  });

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/products`);
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      setProducts(
        data.map((product: Product) => ({ ...product, originalId: product.id }))
      );
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to fetch products. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (isEditing) {
      setEditedProducts([...products]);
      setOriginalProducts([...products]);
    }
  }, [isEditing, products]);

  const handleDataChange = useCallback((updatedData: Product[]) => {
    setTimeout(() => setEditedProducts(updatedData), 0);
  }, []);

  const handleDeleteProducts = useCallback(
    async (selectedIndices: number[]) => {
      const productsToDelete = selectedIndices.map((index) => products[index]);
      const productIdsToDelete = productsToDelete.map((product) => product.id);

      try {
        const response = await fetch(`${API_BASE_URL}/api/products`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: productIdsToDelete }),
        });

        if (!response.ok) {
          throw new Error("Failed to delete products on the server");
        }

        setProducts((prevProducts) =>
          prevProducts.filter(
            (product) => !productIdsToDelete.includes(product.id)
          )
        );

        toast.success("Selected products deleted successfully");
        setIsEditing(false);
      } catch (error) {
        console.error("Error deleting selected products:", error);
        toast.error("Failed to delete products. Please try again.");
      }
    },
    [products]
  );

  const handleSave = useCallback(async () => {
    try {
      // Check for empty product IDs
      const emptyProductId = editedProducts.find(
        (product) => !product.id.trim()
      );
      if (emptyProductId) {
        toast.error("Product ID cannot be empty");
        return;
      }

      // Check for duplicate product IDs
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

      const productsToUpdate = editedProducts.map((product) => ({
        ...product,
        newId: product.id !== product.originalId ? product.id : undefined,
        id: product.originalId,
      }));

      const response = await fetch(`${API_BASE_URL}/api/products/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: productsToUpdate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "An error occurred while saving products"
        );
      }

      const result = await response.json();
      setProducts(
        result.products.map((product: Product) => ({
          ...product,
          originalId: product.id,
        }))
      );
      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error updating products:", error);
      toast.error((error as Error).message);
    }
  }, [editedProducts, originalProducts]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedProducts([]);
  }, []);

  const handleToggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  if (loading) {
    return <p className="mt-4 text-center">Loading...</p>;
  }

  return (
    <div className="relative">
      <div className="flex flex-col items-center justify-center w-auto">
        <div className="relative w-full text-center text-lg text-default-700 font-medium mb-6">
          Product Catalogue
        </div>
        <div className="relative justify-center">
          <Table
            initialData={isEditing ? editedProducts : products}
            columns={isEditing ? editableColumns : columns}
            onShowDeleteButton={() => {}}
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

export default CatalogueProductPage;
