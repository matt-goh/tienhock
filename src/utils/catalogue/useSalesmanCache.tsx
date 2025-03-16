import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { Employee } from "../../types/types";

interface CachedSalesmen {
  data: Employee[];
  timestamp: number;
}

const CACHE_KEY = "salesmen_cache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const SALESMEN_UPDATED_EVENT = "salesmen-updated";

// Create a global function to trigger cache refresh
export const refreshSalesmenCache = async () => {
  try {
    // Remove the current cache
    localStorage.removeItem(CACHE_KEY);
    
    // Fetch new data
    const data = await api.get("/api/staffs?salesmenOnly=true");
    
    // Store in cache
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    
    // Dispatch event to notify subscribers
    window.dispatchEvent(new CustomEvent(SALESMEN_UPDATED_EVENT, { detail: data }));
  } catch (error) {
    console.error("Error refreshing salesmen cache:", error);
  }
};

// Expose this to make it globally available
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.refreshSalesmenCache = refreshSalesmenCache;
}

export const useSalesmanCache = () => {
  const [salesmen, setSalesmen] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSalesmen = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // Skip cache if force refresh is requested
      if (!forceRefresh) {
        // Check cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const { data, timestamp }: CachedSalesmen = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setSalesmen(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      // If cache is missing, expired, or force refresh is requested, fetch fresh data
      const data = await api.get("/api/staffs?salesmenOnly=true");

      // Update cache
      const cacheData: CachedSalesmen = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setSalesmen(data);
      setError(null);
      return data;
    } catch (error) {
      console.error("Error fetching salesmen:", error);
      const err = error instanceof Error ? error : new Error("Failed to fetch salesmen");
      setError(err);
      if (!forceRefresh) { // Only show toast for initial loads, not background refreshes
        toast.error("Error fetching salesmen");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchSalesmen();
  }, []);

  // Listen for salesmen updates
  useEffect(() => {
    const handleSalesmenUpdated = (event: CustomEvent) => {
      // If event contains data, use it directly
      if (event.detail) {
        setSalesmen(event.detail);
      } else {
        // Otherwise refresh from cache or API
        fetchSalesmen(true);
      }
    };

    window.addEventListener(SALESMEN_UPDATED_EVENT, handleSalesmenUpdated as EventListener);

    return () => {
      window.removeEventListener(SALESMEN_UPDATED_EVENT, handleSalesmenUpdated as EventListener);
    };
  }, []);

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  const refreshSalesmen = async () => {
    return fetchSalesmen(true);
  };

  return {
    salesmen,
    isLoading,
    error,
    invalidateCache,
    refreshSalesmen,
  };
};