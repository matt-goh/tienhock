// src/utils/invoice/useProductsCache.tsx
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

interface Product {
  id: string;
  description: string;
  price_per_unit: number;
  type: string;
}

interface CachedProducts {
  data: Product[];
  timestamp: number;
}

const CACHE_KEY = "products_cache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const PRODUCTS_UPDATED_EVENT = "products-updated";

// Create a global function to refresh products cache
export const refreshProductsCache = async () => {
  try {
    // Remove the current cache
    localStorage.removeItem(CACHE_KEY);

    // Fetch all products
    const data = await api.get("/api/products?all");

    // Store in cache
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    // Dispatch event to notify subscribers
    window.dispatchEvent(
      new CustomEvent(PRODUCTS_UPDATED_EVENT, { detail: data })
    );
  } catch (error) {
    console.error("Error refreshing products cache:", error);
  }
};

// Clean up old cache keys
export const cleanupOldCaches = () => {
  const oldKeys = [
    "products_cache_all",
    "products_cache_jp",
    "products_cache_default",
  ];
  oldKeys.forEach((key) => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      console.log(`Cleaned up old cache key: ${key}`);
    }
  });
};

// Expose this to make it globally available
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshProductsCache = refreshProductsCache;
}

// Client-side filtering function
const filterProducts = (
  products: Product[],
  filterType: string | string[]
): Product[] => {
  // Handle array of types
  if (Array.isArray(filterType)) {
    return products.filter((product) => filterType.includes(product.type));
  }

  // Handle comma-separated string
  if (typeof filterType === "string" && filterType.includes(",")) {
    const types = filterType.split(",").map((t) => t.trim().toUpperCase());
    return products.filter((product) => types.includes(product.type));
  }

  // Handle single type
  switch (filterType) {
    case "all":
      return products;
    case "jp":
      return products.filter((product) => product.type === "JP");
    case "oth":
      return products.filter((product) => product.type === "OTH");
    case "mee":
      return products.filter((product) => product.type === "MEE");
    case "bh":
      return products.filter((product) => product.type === "BH");
    case "default":
    default:
      return products.filter((product) => ["MEE", "BH", "OTH"].includes(product.type));
  }
};

export const useProductsCache = (
  type:
    | "all"
    | "jp"
    | "oth"
    | "mee"
    | "bh"
    | "default"
    | string
    | string[] = "default"
) => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProducts = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // Skip cache if force refresh is requested
      if (!forceRefresh) {
        // Check cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const { data, timestamp }: CachedProducts = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setAllProducts(data);
            setProducts(filterProducts(data, type));
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      // If cache is missing, expired, or force refresh is requested, fetch fresh data
      const data = await api.get("/api/products?all");

      // Update cache
      const cacheData: CachedProducts = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setAllProducts(data);
      setProducts(filterProducts(data, type));
      setError(null);
      return data;
    } catch (error) {
      console.error(`Error fetching products:`, error);
      const err =
        error instanceof Error ? error : new Error(`Failed to fetch products`);
      setError(err);
      toast.error(`Error fetching products`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchProducts();
  }, []); // Only run on mount

  // Serialize type for stable dependency (arrays create new references each render)
  const typeKey = Array.isArray(type) ? type.join(',') : type;

  // Update filtered products when type changes
  useEffect(() => {
    if (allProducts.length > 0) {
      setProducts(filterProducts(allProducts, type));
    }
  }, [typeKey, allProducts]);

  // Listen for product updates
  useEffect(() => {
    const handleProductsUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setAllProducts(event.detail);
        setProducts(filterProducts(event.detail, type));
      } else {
        fetchProducts(true);
      }
    };

    window.addEventListener(
      PRODUCTS_UPDATED_EVENT,
      handleProductsUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        PRODUCTS_UPDATED_EVENT,
        handleProductsUpdated as EventListener
      );
    };
  }, [typeKey]);

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  const refreshProducts = async () => {
    return fetchProducts(true);
  };

  return {
    products,
    allProducts, // Expose all products for components that need them
    isLoading,
    error,
    invalidateCache,
    refreshProducts,
  };
};
