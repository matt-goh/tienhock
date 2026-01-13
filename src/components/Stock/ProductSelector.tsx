// src/components/Stock/ProductSelector.tsx
import React, { useState, useMemo, useCallback } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import {
  IconChevronDown,
  IconCheck,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconX,
} from "@tabler/icons-react";
import clsx from "clsx";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { StockProduct } from "../../types/types";
import { isHiddenSpecialItem } from "../../config/specialItems";

const FAVORITES_STORAGE_KEY = "stock-product-favorites";

interface ProductSelectorProps {
  value: string | null;
  onChange: (productId: string | null) => void;
  productTypes?: ("BH" | "MEE" | "JP" | "OTH" | "BUNDLE")[];
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
  BUNDLE: StockProduct[];
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

  // Favorites state - initialized from localStorage
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Toggle favorite and persist to localStorage
  const toggleFavorite = useCallback(
    (e: React.MouseEvent, productId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setFavorites((prev) => {
        const newFavorites = new Set(prev);
        if (newFavorites.has(productId)) {
          newFavorites.delete(productId);
        } else {
          newFavorites.add(productId);
        }
        localStorage.setItem(
          FAVORITES_STORAGE_KEY,
          JSON.stringify([...newFavorites])
        );
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent("favorites-changed"));
        return newFavorites;
      });
    },
    []
  );

  // Filter and group products by type (excluding hidden special items)
  const groupedProducts = useMemo(() => {
    const filtered = products.filter(
      (product) =>
        productTypes.includes(product.type as "BH" | "MEE" | "JP" | "OTH" | "BUNDLE") &&
        !isHiddenSpecialItem(product.id)
    );

    const grouped: GroupedProducts = {
      BH: [],
      MEE: [],
      JP: [],
      OTH: [],
      BUNDLE: [],
    };

    filtered.forEach((product) => {
      const type = product.type as keyof GroupedProducts;
      if (grouped[type]) {
        grouped[type].push(product as StockProduct);
      }
    });

    return grouped;
  }, [products, productTypes]);

  // Get favorite products (excluding hidden special items)
  const favoriteProducts = useMemo(() => {
    return products.filter(
      (product) =>
        favorites.has(product.id) &&
        productTypes.includes(product.type as "BH" | "MEE" | "JP" | "OTH" | "BUNDLE") &&
        !isHiddenSpecialItem(product.id)
    ) as StockProduct[];
  }, [products, favorites, productTypes]);

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!query) return groupedProducts;

    const lowerQuery = query.toLowerCase();
    const filtered: GroupedProducts = {
      BH: [],
      MEE: [],
      JP: [],
      OTH: [],
      BUNDLE: [],
    };

    Object.entries(groupedProducts).forEach(([type, prods]) => {
      filtered[type as keyof GroupedProducts] = prods.filter(
        (product: { id: string; description: string }) =>
          product.id.toLowerCase().includes(lowerQuery) ||
          product.description?.toLowerCase().includes(lowerQuery)
      );
    });

    return filtered;
  }, [groupedProducts, query]);

  // Filter favorite products based on search query
  const filteredFavorites = useMemo(() => {
    if (!query) return favoriteProducts;

    const lowerQuery = query.toLowerCase();
    return favoriteProducts.filter(
      (product) =>
        product.id.toLowerCase().includes(lowerQuery) ||
        product.description?.toLowerCase().includes(lowerQuery)
    );
  }, [favoriteProducts, query]);

  // Get selected product
  const selectedProduct = useMemo(() => {
    if (!value) return null;
    return products.find((p) => p.id === value) || null;
  }, [value, products]);

  // Check if there are any results
  const hasResults = useMemo(() => {
    return (
      filteredFavorites.length > 0 ||
      Object.values(filteredProducts).some((group) => group.length > 0)
    );
  }, [filteredProducts, filteredFavorites]);

  // Category labels
  const categoryLabels: Record<string, string> = {
    BH: "Bihun Products",
    MEE: "Mee Products",
    JP: "JellyPolly Products",
    OTH: "Other Products",
    BUNDLE: "Bundle Products",
  };

  // Category colors
  const categoryColors: Record<string, string> = {
    BH: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-gray-900",
    MEE: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-gray-900",
    JP: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-gray-900",
    OTH: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-gray-900",
    BUNDLE: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-gray-900",
  };

  return (
    <div className={label ? "space-y-2" : ""}>
      {label && (
        <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <Combobox
        value={value}
        onChange={(newValue) => onChange(newValue)}
        disabled={disabled || isLoading}
      >
        <div className="relative">
          <ComboboxButton as="div" className={clsx("relative w-full", value ? "" : "cursor-pointer")}>
            <ComboboxInput
              className={clsx(
                "w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-10 pr-10",
                "text-sm leading-5 text-default-900 dark:text-gray-100 cursor-pointer",
                "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500",
                "disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
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
              <IconSearch className="h-4 w-4 text-default-400 dark:text-gray-400" />
            </div>
            {value ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-default-400 dark:text-gray-400 hover:text-default-600 dark:hover:text-gray-200 z-10"
              >
                <IconX className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : (
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <IconChevronDown
                  className="h-5 w-5 text-default-400 dark:text-gray-400"
                  aria-hidden="true"
                />
              </div>
            )}
          </ComboboxButton>

          <ComboboxOptions
            className={clsx(
              "absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg",
              "bg-white dark:bg-gray-800 pb-1 text-sm shadow-lg ring-1 ring-black/5 dark:ring-gray-600",
              "focus:outline-none"
            )}
          >
            {!hasResults && query !== "" ? (
              <div className="relative cursor-default select-none px-4 py-2 text-default-500 dark:text-gray-400">
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
                        active ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100" : "text-default-500 dark:text-gray-400"
                      )
                    }
                  >
                    <span className="block truncate italic">
                      Clear selection
                    </span>
                  </ComboboxOption>
                )}

                {/* Favorites category */}
                {showCategories && filteredFavorites.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-gray-900">
                      Favorites ({filteredFavorites.length})
                    </div>
                    {filteredFavorites.map((product) => (
                      <ComboboxOption
                        key={`fav-${product.id}`}
                        value={product.id}
                        className={({ active }) =>
                          clsx(
                            "relative cursor-pointer select-none py-2 pl-10 pr-10",
                            active
                              ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                              : "text-default-900 dark:text-gray-100"
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
                                    active ? "text-sky-700 dark:text-sky-300" : "text-default-500 dark:text-gray-400"
                                  )}
                                >
                                  {product.description}
                                </span>
                              )}
                            </div>
                            {selected && (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                                <IconCheck className="h-4 w-4" aria-hidden="true" />
                              </span>
                            )}
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(e, product.id);
                              }}
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                            >
                              <IconStarFilled className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </ComboboxOption>
                    ))}
                  </div>
                )}

                {/* Grouped products */}
                {showCategories
                  ? productTypes.map((type) => {
                      const prods = filteredProducts[type];
                      if (prods.length === 0) return null;

                      return (
                        <div key={type}>
                          {/* Category header */}
                          <div
                            className={clsx(
                              "sticky top-0 z-10 px-4 py-2 text-xs font-semibold uppercase tracking-wider",
                              categoryColors[type] || "text-default-500 dark:text-gray-400 bg-default-50 dark:bg-gray-900"
                            )}
                          >
                            {categoryLabels[type]} ({prods.length})
                          </div>

                          {/* Products in category */}
                          {prods.map((product) => (
                            <ComboboxOption
                              key={product.id}
                              value={product.id}
                              className={({ active }) =>
                                clsx(
                                  "relative cursor-pointer select-none py-2 pl-10 pr-10",
                                  active
                                    ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                    : "text-default-900 dark:text-gray-100"
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
                                            ? "text-sky-700 dark:text-sky-300"
                                            : "text-default-500 dark:text-gray-400"
                                        )}
                                      >
                                        {product.description}
                                      </span>
                                    )}
                                  </div>
                                  {selected && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                                      <IconCheck className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleFavorite(e, product.id);
                                    }}
                                    className={clsx(
                                      "absolute inset-y-0 right-0 flex items-center pr-3",
                                      favorites.has(product.id)
                                        ? "text-amber-500 hover:text-amber-600"
                                        : "text-default-300 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400"
                                    )}
                                  >
                                    {favorites.has(product.id) ? (
                                      <IconStarFilled className="h-4 w-4" />
                                    ) : (
                                      <IconStar className="h-4 w-4" />
                                    )}
                                  </button>
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
                              "relative cursor-pointer select-none py-2 pl-10 pr-10",
                              active
                                ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                : "text-default-900 dark:text-gray-100"
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
                                        ? "text-sky-700 dark:text-sky-300"
                                        : "text-default-500 dark:text-gray-400"
                                    )}
                                  >
                                    {product.description}
                                  </span>
                                )}
                              </div>
                              {selected && (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                                  <IconCheck className="h-4 w-4" aria-hidden="true" />
                                </span>
                              )}
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleFavorite(e, product.id);
                                }}
                                className={clsx(
                                  "absolute inset-y-0 right-0 flex items-center pr-3",
                                  favorites.has(product.id)
                                    ? "text-amber-500 hover:text-amber-600"
                                    : "text-default-300 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400"
                                )}
                              >
                                {favorites.has(product.id) ? (
                                  <IconStarFilled className="h-4 w-4" />
                                ) : (
                                  <IconStar className="h-4 w-4" />
                                )}
                              </button>
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
