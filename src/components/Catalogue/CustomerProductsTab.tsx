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

  const handleSaveChanges = async () => {
    if (!customerId) {
      toast.error("Please save the customer details first");
      return;
    }

    try {
      await api.post("/api/customer-products/batch", {
        customerId,
        products: customerProducts.map((cp) => ({
          uid: crypto.randomUUID(),
          productId: cp.product_id,
          customPrice: cp.custom_price,
          isAvailable: cp.is_available,
        })),
      });

      toast.success("Customer products updated successfully");
      fetchCustomerProducts();
    } catch (error) {
      console.error("Error saving customer products:", error);
      toast.error("Failed to save customer products");
    }
  };

  const handleTableChange = (updatedItems: CustomProduct[]) => {
    setTimeout(() => {
      const processedProducts = updatedItems.map((item) => {
        // If this is a new row (no uid), initialize it properly
        if (!item.uid) {
          const productInfo =
            products.find((p) => p.id === item.product_id) ||
            products.find((p) => p.description === item.description);

          if (productInfo) {
            return {
              ...item,
              uid: crypto.randomUUID(),
              product_id: productInfo.id,
              description: productInfo.description,
              custom_price: item.custom_price || 0,
              is_available:
                item.is_available !== undefined ? item.is_available : true,
              customer_id: customerId || "temp",
            };
          }

          // If no matching product found, create with defaults
          return {
            ...item,
            uid: crypto.randomUUID(),
            custom_price: item.custom_price || 0,
            is_available:
              item.is_available !== undefined ? item.is_available : true,
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
      width: 800,
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
      width: 200,
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

      {customerProducts.length === 0 ? (
        <div className="text-center py-8 text-default-500">
          No custom products added for this customer yet.
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
