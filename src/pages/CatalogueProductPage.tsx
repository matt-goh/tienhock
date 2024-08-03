import React, { useState, useEffect, useCallback } from "react";
import _ from "lodash";
import Table from "../components/Table";
import { ColumnConfig, Product } from "../types/types";
import toast from "react-hot-toast";

interface EditedProduct extends Omit<Product, 'job_id'> {
  job_name: string;
}

const CatalogueProductPage: React.FC = () => {
  const [products, setProducts] = useState<EditedProduct[]>([]);
  const [editedProducts, setEditedProducts] = useState<EditedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const productColumns: ColumnConfig[] = [
    { id: "id", header: "ID", type: "readonly", width: 50 },
    { id: "name", header: "Name", type: "readonly" },
    { id: "amount", header: "Amount", type: "readonly", width: 100 },
    { id: "job_name", header: "Job", type: "readonly", width: 200 },
    { id: "remark", header: "Remark", type: "readonly", width: 300 },
  ];

  const editableProductColumns: ColumnConfig[] = productColumns.map((col) => ({
    ...col,
    type:
      col.id === "amount"
        ? "float"
        : col.id === "id" || col.id === "job_name"
        ? "readonly"
        : "string",
  }));

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:5000/api/products");
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      setProducts(data);
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
    }
  }, [isEditing, products]);

  const handleDataChange = useCallback((updatedData: EditedProduct[]) => {
    setEditedProducts(updatedData);
  }, []);

  const handleDeleteProducts = useCallback(
    async (selectedIndices: number[]) => {
      const productsToDelete = selectedIndices.map((index) => products[index]);
      const productIdsToDelete = productsToDelete.map((product) => product.id);

      try {
        const response = await fetch(`http://localhost:5000/api/products`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: productIdsToDelete }),
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
      const response = await fetch("http://localhost:5000/api/products/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: editedProducts,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "An error occurred while saving products"
        );
      }

      const result = await response.json();
      setProducts(result.products);
      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error updating products:", error);
      toast.error((error as Error).message);
    }
  }, [editedProducts]);

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
    <div className={`relative py-[60px]`}>
      <div className="flex flex-col items-center justify-center w-auto">
        <div className={`relative text-lg font-medium text-gray-700 mb-6`}>
          Product Catalogue
        </div>
        <div className="relative">
          <Table
            initialData={isEditing ? editedProducts : products}
            columns={isEditing ? editableProductColumns : productColumns}
            onShowDeleteButton={() => {}}
            onDelete={handleDeleteProducts}
            onChange={handleDataChange}
            isEditing={isEditing}
            onToggleEditing={handleToggleEditing}
            onSave={handleSave}
            onCancel={handleCancel}
            tableKey="catalogueProduct"
          />
        </div>
      </div>
    </div>
  );
};

export default CatalogueProductPage;