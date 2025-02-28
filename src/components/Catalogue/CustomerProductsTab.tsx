// src/components/Catalogue/CustomerProductsTab.tsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../routes/utils/api";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import TableEditableCell from "../Table/TableEditableCell";
import TableEditing from "../Table/TableEditing";
import { ColumnConfig, CustomProduct } from "../../types/types";
import Button from "../Button";
import { IconPlus } from "@tabler/icons-react";
import toast from "react-hot-toast";
import LoadingSpinner from "../LoadingSpinner";

interface CustomerProductsTabProps {
  customerId: string;
  isNewCustomer: boolean;
  temporaryProducts?: CustomProduct[];
  onTemporaryProductsChange?: (products: CustomProduct[]) => void;
}

const CustomerProductsTab: React.FC<CustomerProductsTabProps> = ({
  customerId,
  isNewCustomer,
  temporaryProducts,
  onTemporaryProductsChange,
}) => {
  const [customerProducts, setCustomerProducts] = useState<CustomProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { products } = useProductsCache();

  // Load customer products when customerId changes
  useEffect(() => {
    if (customerId && !isNewCustomer) {
      fetchCustomerProducts();
    } else if (temporaryProducts) {
      setCustomerProducts(temporaryProducts);
    }
  }, [customerId, isNewCustomer, temporaryProducts]);

  const fetchCustomerProducts = async () => {
    if (!customerId) return;

    setIsLoading(true);
    try {
      const data = await api.get(`/api/customer-products/${customerId}`);

      // Enrich with more product data if needed
      const enrichedData = data.map(
        (cp: { product_id: string; description: any }) => {
          const productInfo = products.find((p) => p.id === cp.product_id);
          return {
            ...cp,
            uid: crypto.randomUUID(),
            description: productInfo?.description || cp.description || "",
          };
        }
      );
      setCustomerProducts(enrichedData);
    } catch (error) {
      console.error("Error fetching customer products:", error);
      toast.error("Failed to load customer products");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProduct = () => {
    // Get available products (those not already in the customer's list)
    const existingProductIds = new Set(
      customerProducts.map((cp) => cp.product_id)
    );
    const availableProducts = products.filter(
      (p) => !existingProductIds.has(p.id)
    );

    if (availableProducts.length === 0) {
      toast.error("All products have already been added for this customer");
      return;
    }

    // Add the first available product
    const newProduct = availableProducts[0];
    const updatedProducts = [
      ...customerProducts,
      {
        uid: crypto.randomUUID(),
        customer_id: customerId || "temp",
        product_id: newProduct.id,
        description: newProduct.description,
        custom_price: newProduct.price_per_unit || 0,
        is_available: true,
      },
    ];

    setCustomerProducts(updatedProducts);

    // Notify parent component about the change
    if (isNewCustomer && onTemporaryProductsChange) {
      onTemporaryProductsChange(updatedProducts);
    }
  };

  useEffect(() => {
    console.log(customerProducts);
  }, [customerProducts]);

  const handleTableChange = (updatedItems: CustomProduct[]) => {
    setTimeout(() => {
      // Check if a new row was added (will have empty product_id)
      const newRowIndex = updatedItems.findIndex((item) => !item.product_id);

      if (newRowIndex !== -1) {
        // Get available products that aren't already in the list
        const existingProductIds = new Set(
          updatedItems.filter((cp) => cp.product_id).map((cp) => cp.product_id)
        );
        const availableProducts = products.filter(
          (p) => !existingProductIds.has(p.id)
        );

        if (availableProducts.length === 0) {
          toast.error("All products have already been added for this customer");
          // Remove the empty row and return early
          const filteredItems = updatedItems.filter((item) => item.product_id);
          setCustomerProducts(filteredItems);
          if (isNewCustomer && onTemporaryProductsChange) {
            onTemporaryProductsChange(filteredItems);
          }
          return;
        }

        // Use the first available product for the new row
        const newProduct = availableProducts[0];
        updatedItems[newRowIndex] = {
          ...updatedItems[newRowIndex],
          uid: crypto.randomUUID(),
          product_id: newProduct.id,
          description: newProduct.description,
          custom_price: newProduct.price_per_unit || 0,
          is_available: true,
          customer_id: customerId || "temp",
        };
      }

      const processedProducts = updatedItems.map((item) => {
        // Handle other properties and existing rows
        if (!item.uid) {
          return {
            ...item,
            uid: crypto.randomUUID(),
            customer_id: customerId || "temp",
          };
        }
        return item;
      });

      setCustomerProducts(processedProducts);

      // Notify parent if the callback exists
      if (isNewCustomer && onTemporaryProductsChange) {
        onTemporaryProductsChange(processedProducts);
      }
    }, 0);
  };

  // Define table columns
  const columns: ColumnConfig[] = [
    {
      id: "product_id",
      header: "Product Code",
      type: "readonly",
      width: 250,
    },
    {
      id: "description",
      header: "Description",
      type: "combobox",
      width: 700,
      options: products.map((p) => p.description || ""),
      cell: (info: {
        getValue: () => any;
        row: { original: CustomProduct };
      }) => (
        <TableEditableCell
          value={info.getValue() ?? ""}
          onChange={(newDescription) => {
            const matchingProduct = products.find(
              (p) => p.description === newDescription
            );
            if (matchingProduct) {
              // Create a new array with the updated product
              const updatedProducts = customerProducts.map((product) => {
                if (product.product_id === info.row.original.product_id) {
                  return {
                    ...product,
                    product_id: matchingProduct.id,
                    description: matchingProduct.description,
                    price_per_unit: matchingProduct.price_per_unit || 0,
                    custom_price: product.custom_price || 0,
                  };
                }
                return product;
              });
              handleTableChange(updatedProducts);
            }
          }}
          type="combobox"
          editable={true}
          focus={false}
          onKeyDown={() => {}}
          isSorting={false}
          previousCellValue={info.getValue()}
          options={products.map((p) => p.description || "")}
        />
      ),
    },
    {
      id: "custom_price",
      header: "Custom Price",
      type: "float",
      width: 400,
    },
    {
      id: "is_available",
      header: "Available",
      type: "checkbox",
      width: 80,
    },
    {
      id: "action",
      header: "",
      type: "action",
      width: 80,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="">
      {customerProducts.length > 0 && (
        <div className="flex justify-end items-center mb-6">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleAddProduct}
              icon={IconPlus}
              iconSize={16}
              iconStroke={2}
              variant="outline"
              type="button"
            >
              Add Product
            </Button>
          </div>
        </div>
      )}

      {customerProducts.length === 0 ? (
        <div className="flex flex-col items-center py-8">
          <div className="text-center mb-4 text-default-500">
            No custom products added for this customer yet.
          </div>
          <Button
            onClick={handleAddProduct}
            icon={IconPlus}
            iconSize={16}
            iconStroke={2}
            variant="outline"
            type="button"
          >
            Add Product
          </Button>
        </div>
      ) : (
        <TableEditing
          initialData={customerProducts}
          columns={columns}
          onChange={handleTableChange}
          tableKey="customerProducts"
        />
      )}
    </div>
  );
};

export default CustomerProductsTab;
