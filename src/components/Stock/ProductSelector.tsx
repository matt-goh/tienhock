// src/components/Stock/ProductSelector.tsx
import React, { useState, useMemo } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { IconChevronDown, IconCheck, IconSearch } from "@tabler/icons-react";
import clsx from "clsx";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { StockProduct } from "../../types/types";

interface ProductSelectorProps {
  value: string | null;
  onChange: (productId: string | null) => void;
  productTypes?: ("BH" | "MEE" | "JP" | "OTH")[];
  placeholder?: string;
  showCategories?: boolean;
  disabled?: boolean;
  label?: string;
  required?: boolean;
}

interface GroupedProducts {
  BH: StockProduct[];
  MEE: StockProduct[];
  JP: StockProduct[];
  OTH: StockProduct[];
}

const ProductSelector: React.FC<ProductSelectorProps> = ({
  value,
  onChange,
  productTypes = ["BH", "MEE"],
  placeholder = "Select a product...",
  showCategories = true,
  disabled = false,
  label,
  required = false,
}) => {
  const [query, setQuery] = useState("");
  const { products, isLoading } = useProductsCache("all");

  // Filter and group products by type
  const groupedProducts = useMemo(() => {
    const filtered = products.filter((product) =>
      productTypes.includes(product.type as "BH" | "MEE" | "JP" | "OTH")
    );

    const grouped: GroupedProducts = {
      BH: [],
      MEE: [],
      JP: [],
      OTH: [],
    };

    filtered.forEach((product) => {
      const type = product.type as keyof GroupedProducts;
      if (grouped[type]) {
        grouped[type].push(product as StockProduct);
      }
    });

    return grouped;
  }, [products, productTypes]);

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!query) return groupedProducts;

    const lowerQuery = query.toLowerCase();
    const filtered: GroupedProducts = {
      BH: [],
      MEE: [],
      JP: [],
      OTH: [],
    };

    Object.entries(groupedProducts).forEach(([type, prods]) => {
      filtered[type as keyof GroupedProducts] = prods.filter(
        (product: { id: string; description: string; }) =>
          product.id.toLowerCase().includes(lowerQuery) ||
          product.description?.toLowerCase().includes(lowerQuery)
      );
    });

    return filtered;
  }, [groupedProducts, query]);

  // Get selected product
  const selectedProduct = useMemo(() => {
    if (!value) return null;
    return products.find((p) => p.id === value) || null;
  }, [value, products]);

  // Check if there are any results
  const hasResults = useMemo(() => {
    return Object.values(filteredProducts).some((group) => group.length > 0);
  }, [filteredProducts]);

  // Category labels
  const categoryLabels: Record<string, string> = {
    BH: "Bihun Products",
    MEE: "Mee Products",
    JP: "JellyPolly Products",
    OTH: "Other Products",
  };

  // Category colors
  const categoryColors: Record<string, string> = {
    BH: "text-blue-600 bg-blue-50",
    MEE: "text-green-600 bg-green-50",
    JP: "text-orange-600 bg-orange-50",
    OTH: "text-purple-600 bg-purple-50",
  };

  return (
    <div className={label ? "space-y-2" : ""}>
      {label && (
        <label className="block text-sm font-medium text-default-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <Combobox
        value={value}
        onChange={(newValue) => onChange(newValue)}
        disabled={disabled || isLoading}
      >
        <div className="relative">
          <div className="relative w-full">
            <ComboboxInput
              className={clsx(
                "w-full rounded-lg border border-default-300 bg-white py-2 pl-10 pr-10",
                "text-sm leading-5 text-default-900",
                "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500",
                "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
              )}
              displayValue={() =>
                selectedProduct
                  ? `${selectedProduct.id} - ${selectedProduct.description || ""}`
                  : ""
              }
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isLoading ? "Loading products..." : placeholder}
            />
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <IconSearch className="h-4 w-4 text-default-400" />
            </div>
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                className="h-5 w-5 text-default-400"
                aria-hidden="true"
              />
            </ComboboxButton>
          </div>

          <ComboboxOptions
            className={clsx(
              "absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg",
              "bg-white py-1 text-sm shadow-lg ring-1 ring-black/5",
              "focus:outline-none"
            )}
          >
            {!hasResults && query !== "" ? (
              <div className="relative cursor-default select-none px-4 py-2 text-default-500">
                No products found.
              </div>
            ) : (
              <>
                {/* Clear selection option */}
                {value && (
                  <ComboboxOption
                    value={null}
                    className={({ active }) =>
                      clsx(
                        "relative cursor-pointer select-none py-2 pl-10 pr-4",
                        active ? "bg-sky-100 text-sky-900" : "text-default-500"
                      )
                    }
                  >
                    <span className="block truncate italic">
                      Clear selection
                    </span>
                  </ComboboxOption>
                )}

                {/* Grouped products */}
                {showCategories
                  ? productTypes.map((type) => {
                      const products = filteredProducts[type];
                      if (products.length === 0) return null;

                      return (
                        <div key={type}>
                          {/* Category header */}
                          <div
                            className={clsx(
                              "sticky top-0 z-10 px-4 py-2 text-xs font-semibold uppercase tracking-wider",
                              categoryColors[type] || "text-default-500 bg-default-50"
                            )}
                          >
                            {categoryLabels[type]} ({products.length})
                          </div>

                          {/* Products in category */}
                          {products.map((product) => (
                            <ComboboxOption
                              key={product.id}
                              value={product.id}
                              className={({ active }) =>
                                clsx(
                                  "relative cursor-pointer select-none py-2 pl-10 pr-4",
                                  active
                                    ? "bg-sky-100 text-sky-900"
                                    : "text-default-900"
                                )
                              }
                            >
                              {({ selected, active }) => (
                                <>
                                  <div className="flex flex-col">
                                    <span
                                      className={clsx(
                                        "block truncate font-medium",
                                        selected && "font-semibold"
                                      )}
                                    >
                                      {product.id}
                                    </span>
                                    {product.description && (
                                      <span
                                        className={clsx(
                                          "block truncate text-xs",
                                          active
                                            ? "text-sky-700"
                                            : "text-default-500"
                                        )}
                                      >
                                        {product.description}
                                      </span>
                                    )}
                                  </div>
                                  {selected && (
                                    <span
                                      className={clsx(
                                        "absolute inset-y-0 left-0 flex items-center pl-3",
                                        active ? "text-sky-600" : "text-sky-600"
                                      )}
                                    >
                                      <IconCheck
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                    </span>
                                  )}
                                </>
                              )}
                            </ComboboxOption>
                          ))}
                        </div>
                      );
                    })
                  : // Flat list without categories
                    Object.values(filteredProducts)
                      .flat()
                      .map((product) => (
                        <ComboboxOption
                          key={product.id}
                          value={product.id}
                          className={({ active }) =>
                            clsx(
                              "relative cursor-pointer select-none py-2 pl-10 pr-4",
                              active
                                ? "bg-sky-100 text-sky-900"
                                : "text-default-900"
                            )
                          }
                        >
                          {({ selected, active }) => (
                            <>
                              <div className="flex flex-col">
                                <span
                                  className={clsx(
                                    "block truncate font-medium",
                                    selected && "font-semibold"
                                  )}
                                >
                                  {product.id}
                                </span>
                                {product.description && (
                                  <span
                                    className={clsx(
                                      "block truncate text-xs",
                                      active
                                        ? "text-sky-700"
                                        : "text-default-500"
                                    )}
                                  >
                                    {product.description}
                                  </span>
                                )}
                              </div>
                              {selected && (
                                <span
                                  className={clsx(
                                    "absolute inset-y-0 left-0 flex items-center pl-3",
                                    active ? "text-sky-600" : "text-sky-600"
                                  )}
                                >
                                  <IconCheck
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ComboboxOption>
                      ))}
              </>
            )}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
};

export default ProductSelector;
