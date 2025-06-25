// src/components/Catalogue/CustomerProductsTab.tsx
import React, { useMemo, useState } from "react";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { CustomProduct } from "../../types/types";
import Button from "../Button";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import toast from "react-hot-toast";
import { FormListbox } from "../FormComponents";
import clsx from "clsx";
import Checkbox from "../Checkbox";

interface CustomerProductsTabProps {
  products: CustomProduct[]; // Receive products directly
  onProductsChange: (updatedProducts: CustomProduct[]) => void; // Handler for changes
  disabled?: boolean; // Optional disabled state for inputs/buttons
}

const CustomerProductsTab: React.FC<CustomerProductsTabProps> = ({
  products: customerProducts, // Rename prop internally for clarity
  onProductsChange,
  disabled = false, // Default to not disabled
}) => {
  const { products: allProducts } = useProductsCache("all"); // Full product list from cache

  // Memoize product options for performance
  const productOptions = useMemo(() => {
    return allProducts.map((p) => ({
      id: p.id,
      name: p.description || `Product ID: ${p.id}`,
    }));
  }, [allProducts]);

  // Memoize descriptions map for quick lookup
  const productDescriptions = useMemo(() => {
    return allProducts.reduce((acc, p) => {
      acc[p.id] = p.description || "N/A";
      return acc;
    }, {} as Record<string, string>);
  }, [allProducts]);

  // --- Event Handlers ---

  const handleProductChange = (
    uid: string | undefined,
    newProductId: string
  ) => {
    if (!uid) return; // Should have UID
    const productInfo = allProducts.find((p) => p.id === newProductId);
    if (!productInfo) return;

    const isAlreadyAdded = customerProducts.some(
      (p) => p.product_id === newProductId && p.uid !== uid
    );
    if (isAlreadyAdded) {
      toast.error(`${productInfo.description} has already been added.`);
      return;
    }

    const updated = customerProducts.map((p) => {
      if (p.uid === uid) {
        return {
          ...p,
          product_id: productInfo.id,
          description: productInfo.description || "", // Update description locally too
          // Reset price to default when product changes
          custom_price: productInfo.price_per_unit ?? 0,
          // You might want to reset is_available too, or keep its state
          // is_available: true,
        };
      }
      return p;
    });
    onProductsChange(updated); // Pass the entire updated array up
  };

  const handlePriceChange = (uid: string | undefined, newPriceStr: string) => {
    if (!uid) return;

    // Allow empty string, numbers with optional decimal places (up to 2)
    if (newPriceStr !== "" && !/^\d*\.?\d{0,2}$/.test(newPriceStr)) {
      return; // Invalid format - ignore the input
    }

    // Store the string value temporarily to allow intermediate states like "12."
    const updated = customerProducts.map((p) =>
      p.uid === uid
        ? {
            ...p,
            custom_price: newPriceStr, // Store as string during editing
          }
        : p
    );
    onProductsChange(updated);
  };

  const handlePriceBlur = (
    uid: string | undefined,
    currentPriceStr: string
  ) => {
    if (!uid) return;

    // On blur, finalize the value to a number
    const priceValue = parseFloat(currentPriceStr) || 0;
    const clampedPrice = Math.max(0, priceValue); // Ensure non-negative

    const updated = customerProducts.map(
      (p) => (p.uid === uid ? { ...p, custom_price: clampedPrice } : p) // Store as number
    );

    onProductsChange(updated);
  };

  const handleAvailabilityChange = (
    uid: string | undefined,
    isAvailable: boolean
  ) => {
    if (!uid) return;
    const updated = customerProducts.map((p) =>
      p.uid === uid ? { ...p, is_available: isAvailable } : p
    );
    onProductsChange(updated);
  };

  const handleDeleteRow = (uid: string | undefined) => {
    if (!uid) return;
    const updated = customerProducts.filter((p) => p.uid !== uid);
    onProductsChange(updated);
    toast.success("Product custom price removed");
  };

  const handleAddProduct = () => {
    const existingProductIds = new Set(
      customerProducts.map((cp) => cp.product_id).filter(Boolean) // Filter out any potentially empty IDs during add
    );
    const availableProducts = allProducts.filter(
      (p) => !existingProductIds.has(p.id)
    );

    if (availableProducts.length === 0) {
      toast.error("All available products have already been added.");
      return;
    }

    const newProduct = availableProducts[0];
    const newRow: CustomProduct = {
      uid: crypto.randomUUID(),
      customer_id: "", // Parent component handles customer_id logic
      product_id: newProduct.id,
      description: newProduct.description || "",
      custom_price: newProduct.price_per_unit ?? 0, // Default to standard price
      is_available: true, // Default to available
    };

    onProductsChange([...customerProducts, newRow]); // Pass the new array up
  };

  return (
    <div className="">
      {/* Header and Add Button */}
      <div className="flex w-full items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-default-900">
          Custom Pricing & Availability
        </h3>
        <Button
          onClick={handleAddProduct}
          icon={IconPlus}
          iconSize={16}
          iconStroke={2.5}
          variant="outline"
          color="primary"
          type="button"
          disabled={disabled}
        >
          Add Custom Price
        </Button>
      </div>

      {customerProducts.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-default-200 rounded-lg bg-default-50">
          <p className="text-default-500">No custom product price added.</p>
        </div>
      ) : (
        <div className="border border-default-200 rounded-lg">
          <table className="min-w-full divide-y divide-default-200">
            <thead className="bg-default-100">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider w-[120px]"
                >
                  Product
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider flex-1"
                >
                  Description
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider w-[160px]"
                >
                  Custom Price (RM)
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider w-[100px]"
                >
                  Available
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider w-[110px]"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-default-200">
              {customerProducts.map((product) => (
                <tr key={product.uid} className="hover:bg-default-50">
                  {/* Product Selection */}
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-default-700">
                    {product.product_id || "N/A"}
                  </td>
                  {/* Description */}
                  <td className="px-4 py-2 whitespace-nowrap align-top">
                    <FormListbox
                      name={`product_select_${product.uid}`}
                      label=""
                      value={product.product_id} // Should have a value if added correctly
                      onChange={(newProductId) =>
                        handleProductChange(product.uid, newProductId)
                      }
                      options={productOptions}
                      placeholder="Select..."
                      disabled={disabled}
                    />
                  </td>
                  {/* Custom Price */}
                  <td className="px-4 py-2 whitespace-nowrap align-top">
                    <input
                      type="text" // Use text for flexible input (like allowing "12.")
                      // Use the state value directly (can be string or number)
                      value={product.custom_price?.toString() ?? ""}
                      onChange={(e) =>
                        handlePriceChange(product.uid, e.target.value)
                      }
                      onBlur={(e) =>
                        handlePriceBlur(product.uid, e.target.value)
                      } // Finalize on blur
                      className={clsx(
                        "w-full px-2 py-1.5 border border-default-300 rounded-md shadow-sm text-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500",
                        "disabled:bg-default-100 disabled:cursor-not-allowed"
                      )}
                      placeholder="0.00"
                      disabled={disabled}
                      aria-label={`Custom price for ${
                        productDescriptions[product.product_id] ||
                        product.product_id
                      }`}
                    />
                  </td>
                  {/* Is Available */}
                  <td className="px-4 py-2 whitespace-nowrap text-center align-center">
                    <Checkbox
                      checked={product.is_available}
                      onChange={(checked) =>
                        handleAvailabilityChange(product.uid, checked)
                      }
                      disabled={disabled}
                      ariaLabel={`Toggle availability for ${
                        productDescriptions[product.product_id] ||
                        product.product_id
                      }`}
                      role="switch"
                      buttonClassName="p-1.5 rounded-full"
                    />
                  </td>
                  {/* Action */}
                  <td className="px-4 py-2 whitespace-nowrap text-center align-middle">
                    <Button
                      onClick={() => handleDeleteRow(product.uid)}
                      variant="outline"
                      color="rose"
                      size="sm"
                      icon={IconTrash}
                      aria-label={`Remove ${
                        productDescriptions[product.product_id] ||
                        product.product_id
                      } custom price`}
                      disabled={disabled}
                      className="px-2 py-1"
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CustomerProductsTab;
