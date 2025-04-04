// src/utils/invoice/useProductsCache.tsx
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

interface CachedProducts {
  data: Array<{
    id: string;
    description: string;
    price_per_unit: number;
    type: string;
  }>;
  timestamp: number;
}

const CACHE_KEY = "products_cache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const PRODUCTS_UPDATED_EVENT = "products-updated";

// Create a global function to trigger cache refresh
export const refreshProductsCache = async () => {
  try {
    // Remove the current cache
    localStorage.removeItem(CACHE_KEY);

    // Fetch new data
    const data = await api.get("/api/products");

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

// Expose this to make it globally available
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshProductsCache = refreshProductsCache;
}

export const useProductsCache = () => {
  const [products, setProducts] = useState<
    Array<{
      id: string;
      description: string;
      price_per_unit: number;
      type: string;
    }>
  >([]);
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
            setProducts(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      // If cache is missing, expired, or force refresh is requested, fetch fresh data
      const data = await api.get("/api/products");

      // Update cache
      const cacheData: CachedProducts = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setProducts(data);
      setError(null);
      return data;
    } catch (error) {
      console.error("Error fetching products:", error);
      const err =
        error instanceof Error ? error : new Error("Failed to fetch products");
      setError(err);
      toast.error("Error fetching products");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchProducts();
  }, []);

  // Listen for product updates
  useEffect(() => {
    const handleProductsUpdated = (event: CustomEvent) => {
      // If event contains data, use it directly
      if (event.detail) {
        setProducts(event.detail);
      } else {
        // Otherwise refresh from cache or API
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
  }, []);

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  const refreshProducts = async () => {
    return fetchProducts(true);
  };

  return {
    products,
    isLoading,
    error,
    invalidateCache,
    refreshProducts,
  };
};
