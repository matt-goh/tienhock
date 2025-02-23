import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

interface CachedProducts {
  data: Array<{ id: string; description: string }>;
  timestamp: number;
}

const CACHE_KEY = "products_cache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const useProductsCache = () => {
  const [products, setProducts] = useState<
    Array<{ id: string; description: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        // Check cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const { data, timestamp }: CachedProducts = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setProducts(data);
            setIsLoading(false);
            return;
          }
        }

        // If cache is missing or expired, fetch fresh data
        const data = await api.get("/api/products/combobox");

        // Update cache
        const cacheData: CachedProducts = {
          data,
          timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

        setProducts(data);
      } catch (error) {
        console.error("Error fetching products:", error);
        setError(
          error instanceof Error ? error : new Error("Failed to fetch products")
        );
        toast.error("Error fetching products");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  const refreshProducts = async () => {
    setIsLoading(true);
    try {
      const data = await api.get("/api/products/combobox");
      const cacheData: CachedProducts = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      setProducts(data);
    } catch (error) {
      console.error("Error refreshing products:", error);
      setError(
        error instanceof Error ? error : new Error("Failed to refresh products")
      );
      toast.error("Error refreshing products");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    products,
    isLoading,
    error,
    invalidateCache,
    refreshProducts,
  };
};
