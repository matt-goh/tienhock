// src/utils/invoice/useProductsCache.tsx - UPDATED
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

// Define cache keys for different product types
const CACHE_KEYS = {
  ALL: "products_cache_all",
  JP: "products_cache_jp",
  DEFAULT: "products_cache_default", // BH and MEE
};

interface CachedProducts {
  data: Array<{
    id: string;
    description: string;
    price_per_unit: number;
    type: string;
  }>;
  timestamp: number;
}

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const PRODUCTS_UPDATED_EVENT = "products-updated";

// Create global functions to refresh specific product caches
export const refreshProductsCache = async (type?: "all" | "jp" | "default") => {
  try {
    const cacheKeys = type
      ? [getCacheKeyForType(type)]
      : Object.values(CACHE_KEYS);

    // For each cache type we need to refresh
    for (const cacheKey of cacheKeys) {
      // Remove the current cache
      localStorage.removeItem(cacheKey);

      // Fetch new data based on the cache type
      let queryParam = "";
      if (cacheKey === CACHE_KEYS.ALL) queryParam = "?all";
      else if (cacheKey === CACHE_KEYS.JP) queryParam = "?JP";

      const data = await api.get(`/api/products${queryParam}`);

      // Store in cache
      const cacheData = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));

      // Dispatch event to notify subscribers with cache type info
      window.dispatchEvent(
        new CustomEvent(PRODUCTS_UPDATED_EVENT, {
          detail: { data, type: getCacheTypeFromKey(cacheKey) },
        })
      );
    }
  } catch (error) {
    console.error("Error refreshing products cache:", error);
  }
};

// Helper to get cache key from type
const getCacheKeyForType = (type: "all" | "jp" | "default"): string => {
  switch (type) {
    case "all":
      return CACHE_KEYS.ALL;
    case "jp":
      return CACHE_KEYS.JP;
    case "default":
    default:
      return CACHE_KEYS.DEFAULT;
  }
};

// Helper to get type from cache key
const getCacheTypeFromKey = (cacheKey: string): "all" | "jp" | "default" => {
  switch (cacheKey) {
    case CACHE_KEYS.ALL:
      return "all";
    case CACHE_KEYS.JP:
      return "jp";
    case CACHE_KEYS.DEFAULT:
    default:
      return "default";
  }
};

// Expose this to make it globally available
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshProductsCache = refreshProductsCache;
}

export const useProductsCache = (
  type: "all" | "jp" | "default" = "default"
) => {
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
  const cacheKey = getCacheKeyForType(type);

  const fetchProducts = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // Skip cache if force refresh is requested
      if (!forceRefresh) {
        // Check cache first
        const cachedData = localStorage.getItem(cacheKey);
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
      let queryParam = "";
      if (type === "all") queryParam = "?all";
      else if (type === "jp") queryParam = "?JP";

      const data = await api.get(`/api/products${queryParam}`);

      // Update cache
      const cacheData: CachedProducts = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));

      setProducts(data);
      setError(null);
      return data;
    } catch (error) {
      console.error(`Error fetching ${type} products:`, error);
      const err =
        error instanceof Error
          ? error
          : new Error(`Failed to fetch ${type} products`);
      setError(err);
      toast.error(`Error fetching ${type} products`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchProducts();
  }, [type]); // Re-fetch when type changes

  // Listen for product updates
  useEffect(() => {
    const handleProductsUpdated = (event: CustomEvent) => {
      // Check if the event is for our product type
      if (event.detail && (!event.detail.type || event.detail.type === type)) {
        if (event.detail.data) {
          setProducts(event.detail.data);
        } else {
          // Otherwise refresh from cache or API
          fetchProducts(true);
        }
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
  }, [type]);

  const invalidateCache = () => {
    localStorage.removeItem(cacheKey);
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
