import React, { useState, useEffect } from "react";
import { api } from "../../routes/utils/api";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { CustomProduct } from "../../types/types"; // Ensure Product is imported if not already
import Button from "../Button";
import {
  IconPlus,
  IconSquare,
  IconSquareCheckFilled,
  IconTrash,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import LoadingSpinner from "../LoadingSpinner";
import { FormListbox, SelectOption } from "../FormComponents"; // Use FormListbox for selection
import clsx from "clsx";

interface CustomerProductsTabProps {
  customerId: string;
  isNewCustomer: boolean;
  temporaryProducts?: CustomProduct[];
  onTemporaryProductsChange?: (products: CustomProduct[]) => void;
}

// Helper function to format currency (adjust as needed)
const formatCurrency = (value: number | string | null | undefined): string => {
  const num = Number(value);
  if (value === null || value === undefined || isNaN(num)) {
    return ""; // Return empty string for invalid inputs in the input field
  }
  // Avoid formatting to currency string for input value, just ensure 2 decimal places
  return num.toFixed(2);
};

const CustomerProductsTab: React.FC<CustomerProductsTabProps> = ({
  customerId,
  isNewCustomer,
  temporaryProducts,
  onTemporaryProductsChange,
}) => {
  const [customerProducts, setCustomerProducts] = useState<CustomProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { products } = useProductsCache(); // Full product list

  // Initialize state from temporaryProducts or fetch
  useEffect(() => {
    if (isNewCustomer && temporaryProducts) {
      // Use temporary products if creating a new customer and they exist
      setCustomerProducts(
        temporaryProducts.map((p) => ({
          ...p,
          uid: p.uid || crypto.randomUUID(),
        }))
      ); // Ensure UID
      setIsLoading(false); // Assume data is ready
    } else if (!isNewCustomer && customerId) {
      // Fetch if editing an existing customer
      fetchCustomerProducts();
    } else {
      // Reset or handle other cases (e.g., no customerId yet)
      setCustomerProducts([]);
      setIsLoading(false); // Not fetching in this case
    }
  }, [customerId, isNewCustomer]); // Rerun when customerId or isNewCustomer changes

  // Sync incoming temporaryProducts if they change externally *after* initial load
  useEffect(() => {
    // Only sync if temporaryProducts actually exists and differs from current state
    // Avoid syncing if we just fetched data for an existing customer
    if (
      temporaryProducts &&
      JSON.stringify(temporaryProducts) !== JSON.stringify(customerProducts) &&
      (isNewCustomer || customerProducts.length === 0)
    ) {
      setCustomerProducts(
        temporaryProducts.map((p) => ({
          ...p,
          uid: p.uid || crypto.randomUUID(),
        }))
      );
    }
  }, [temporaryProducts]); // Watch external prop

  const fetchCustomerProducts = async () => {
    if (!customerId || isNewCustomer) return; // Don't fetch if new or no ID

    setIsLoading(true);
    try {
      const data = await api.get(`/api/customer-products/${customerId}`);
      const enrichedData = (Array.isArray(data) ? data : []).map((cp: any) => {
        const productInfo = products.find((p) => p.id === cp.product_id);
        return {
          ...cp,
          uid: crypto.randomUUID(), // Assign UID on fetch
          description:
            productInfo?.description || cp.description || "Unknown Product",
          // custom_price should come from API, fallback to product price if needed?
          custom_price: cp.custom_price ?? productInfo?.price_per_unit ?? 0,
          is_available: cp.is_available !== undefined ? cp.is_available : true, // Default to true if not specified
        };
      });
      setCustomerProducts(enrichedData);
      // Notify parent *only after* fetching for existing customer
      if (onTemporaryProductsChange) {
        onTemporaryProductsChange(enrichedData);
      }
    } catch (error) {
      console.error("Error fetching customer products:", error);
      toast.error("Failed to load customer products");
      setCustomerProducts([]); // Reset on error
    } finally {
      setIsLoading(false);
    }
  };

  // --- NEW Handlers for Table Changes ---

  const updateProductsState = (newProducts: CustomProduct[]) => {
    setCustomerProducts(newProducts);
    if (onTemporaryProductsChange) {
      onTemporaryProductsChange(newProducts);
    }
  };

  // Handle changing the selected product for a row
  const handleProductChange = (
    uid: string | undefined,
    newProductId: string
  ) => {
    const productInfo = products.find((p) => p.id === newProductId);
    if (!productInfo) return; // Should not happen with Listbox

    // Check if this product ID is already used in another row
    const isAlreadyAdded = customerProducts.some(
      (p) => p.product_id === newProductId && p.uid !== uid
    );
    if (isAlreadyAdded) {
      toast.error(`${productInfo.description} has already been added.`);
      return; // Prevent adding duplicates
    }

    const updated = customerProducts.map((p) => {
      if (p.uid === uid) {
        return {
          ...p,
          product_id: productInfo.id,
          description: productInfo.description || "",
          // Reset custom_price to the product's default price when product changes
          custom_price: productInfo.price_per_unit ?? 0,
        };
      }
      return p;
    });
    updateProductsState(updated);
  };

  // Handle changing the custom price
  const handlePriceChange = (
    uid: string | undefined,
    newPrice: number | string
  ) => {
    const priceValue =
      typeof newPrice === "string" ? parseFloat(newPrice) : newPrice;
    // Allow 0 price, but handle NaN
    if (isNaN(priceValue) || priceValue < 0) {
      // Optionally show a toast or just don't update if invalid
      // For now, let's prevent negative prices silently by setting to 0
      // Or, maybe better, revert to previous valid price? Let's update but clamp >= 0
      const clampedPrice = Math.max(0, priceValue);
      if (isNaN(clampedPrice)) return; // Do nothing if still NaN after clamp
      newPrice = clampedPrice;
    }

    const updated = customerProducts.map(
      (p) => (p.uid === uid ? { ...p, custom_price: Number(newPrice) } : p) // Store as number
    );
    updateProductsState(updated);
  };

  // Handle toggling availability
  const handleAvailabilityChange = (
    uid: string | undefined,
    isAvailable: boolean
  ) => {
    const updated = customerProducts.map((p) =>
      p.uid === uid ? { ...p, is_available: isAvailable } : p
    );
    updateProductsState(updated);
  };

  // Handle deleting a product row
  const handleDeleteRow = (uid: string) => {
    const updated = customerProducts.filter((p) => p.uid !== uid);
    updateProductsState(updated);
    toast.success("Product removed");
  };

  // Handle adding a new product row
  const handleAddProduct = () => {
    const existingProductIds = new Set(
      customerProducts.map((cp) => cp.product_id)
    );
    const availableProducts = products.filter(
      (p) => !existingProductIds.has(p.id)
    );

    if (availableProducts.length === 0) {
      toast.error("All available products have already been added.");
      return;
    }

    // Add the *first available* product by default
    const newProduct = availableProducts[0];
    const newRow: CustomProduct = {
      uid: crypto.randomUUID(), // Generate unique ID
      customer_id: customerId || "temp", // Use actual ID or temp marker
      product_id: newProduct.id,
      description: newProduct.description || "",
      custom_price: newProduct.price_per_unit ?? 0,
      is_available: true, // Default to available
    };

    updateProductsState([...customerProducts, newRow]);
  };

  // --- Prepare options for Listbox ---
  const productOptions: SelectOption[] = products.map((p) => ({
    id: p.id,
    name: p.description || `Product ID: ${p.id}`, // Fallback name
  }));

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="">
      {/* Header and Add Button */}
      <div className="flex w-full items-center justify-between mt-5 mb-4">
        <h1 className="text-xl h-full font-semibold text-default-900 items-center">
          Custom Pricing & Availability
        </h1>
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

      {customerProducts.length === 0 && !isLoading ? (
        <div className="text-center py-8 border border-dashed border-default-200 rounded-lg mt-4">
          <p className="text-default-500 mb-4">
            No custom product settings found for this customer.
          </p>
          {/* Keep Add button accessible even when empty */}
          {/* <Button onClick={handleAddProduct} icon={IconPlus} variant="outline">Add First Product</Button> */}
        </div>
      ) : (
        <div
          className="overflow-x-auto overflow-y-visible"
          style={{ position: "relative" }}
        >
          <table className="min-w-full divide-y divide-default-200 border border-default-200 rounded-lg">
            <thead className="bg-default-100">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider w-[250px]"
                >
                  Product
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                >
                  Description
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider w-[180px]"
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
                  className="px-4 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider w-[100px]"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-default-200">
              {customerProducts.map((product) => (
                <tr key={product.uid}>
                  {/* Product Selection (Listbox) */}
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="w-full" style={{ position: "relative" }}>
                      {" "}
                      {/* Ensure listbox takes width */}
                      <FormListbox
                        name={`product_select_${product.uid}`}
                        label="" // No label needed inline
                        value={product.product_id}
                        onChange={(newProductId) =>
                          handleProductChange(product.uid, newProductId)
                        }
                        options={productOptions} // Full list of products
                        placeholder="Select Product"
                        className="relative z-10"
                      />
                    </div>
                  </td>
                  {/* Description (Readonly based on selection) */}
                  <td className="px-4 py-2 text-sm text-default-700">
                    {products.find((p) => p.id === product.product_id)
                      ?.description ||
                      product.description ||
                      "N/A"}
                  </td>
                  {/* Custom Price (Input) */}
                  <td className="px-4 py-2 whitespace-nowrap">
                    <input
                      type="number"
                      value={formatCurrency(product.custom_price)} // Format for display, handle potential null/undefined
                      onChange={(e) =>
                        handlePriceChange(product.uid, e.target.value)
                      } // Pass raw value
                      onBlur={(e) => {
                        // Reformat on blur to ensure 2 decimals if needed
                        const value = parseFloat(e.target.value);
                        if (!isNaN(value)) {
                          handlePriceChange(product.uid, value.toFixed(2));
                        } else if (e.target.value === "") {
                          // Handle empty input - maybe set to 0 or previous value? Let's set to 0.
                          handlePriceChange(product.uid, 0);
                        }
                      }}
                      step="0.01"
                      min="0"
                      className={clsx(
                        "w-full px-2 py-1 border border-default-300 rounded-md shadow-sm text-sm",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      )}
                      placeholder="Enter price"
                    />
                  </td>
                  {/* Is Available (Checkbox) */}
                  <td className="px-4 py-2 whitespace-nowrap text-center">
                    <button
                      type="button"
                      onClick={() =>
                        handleAvailabilityChange(
                          product.uid,
                          !product.is_available
                        )
                      }
                      className="focus:outline-none"
                      aria-checked={product.is_available}
                      role="checkbox"
                    >
                      {product.is_available ? (
                        <IconSquareCheckFilled
                          width={18}
                          height={18}
                          className="text-blue-600"
                        />
                      ) : (
                        <IconSquare
                          width={18}
                          height={18}
                          stroke={2}
                          className="text-default-400"
                        />
                      )}
                    </button>
                  </td>
                  {/* Action (Delete Button) */}
                  <td className="px-4 py-2 whitespace-nowrap text-center">
                    <Button
                      onClick={() =>
                        product.uid
                          ? handleDeleteRow(product.uid)
                          : toast.error("Cannot delete: Missing product ID")
                      }
                      variant="outline"
                      color="rose"
                      size="sm"
                      icon={IconTrash}
                      aria-label="Delete product"
                    >
                      Remove
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
