import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { Customer, CustomProduct } from "../../types/types";

interface CachedCustomers {
  data: EnhancedCustomerList[];
  timestamp: number;
}

export interface EnhancedCustomerList extends Customer {
  customProducts?: CustomProduct[];
  branchInfo?: {
    isInBranchGroup: boolean;
    isMainBranch: boolean;
    groupName?: string;
    groupId?: number;
    branches?: { id: string; name: string; isMain: boolean }[];
  };
}

const CACHE_KEY = "customers_cache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CUSTOMERS_UPDATED_EVENT = "customers-updated";

// Create a global function to trigger cache refresh
export const refreshCustomersCache = async () => {
  try {
    // Remove the current cache
    localStorage.removeItem(CACHE_KEY);

    // Fetch new data
    const data = await api.get("/api/customers");

    // Store in cache
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    // Dispatch event to notify subscribers
    window.dispatchEvent(
      new CustomEvent(CUSTOMERS_UPDATED_EVENT, { detail: data })
    );
  } catch (error) {
    console.error("Error refreshing customers cache:", error);
  }
};

// Expose this to make it globally available
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshCustomersCache = refreshCustomersCache;
}

export const useCustomersCache = () => {
  const [customers, setCustomers] = useState<EnhancedCustomerList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCustomers = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // Skip cache if force refresh is requested
      if (!forceRefresh) {
        // Check cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const { data, timestamp }: CachedCustomers = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setCustomers(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      // If cache is missing, expired, or force refresh is requested, fetch fresh data
      const data = await api.get("/api/customers");

      // Update cache
      const cacheData: CachedCustomers = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setCustomers(data);
      setError(null);
      return data;
    } catch (error) {
      console.error("Error fetching customers:", error);
      const err =
        error instanceof Error ? error : new Error("Failed to fetch customers");
      setError(err);
      if (!forceRefresh) {
        // Only show toast for initial loads, not background refreshes
        toast.error("Error fetching customers");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Listen for customer updates
  useEffect(() => {
    const handleCustomersUpdated = (event: CustomEvent) => {
      // If event contains data, use it directly
      if (event.detail) {
        setCustomers(event.detail);
      } else {
        // Otherwise refresh from cache or API
        fetchCustomers(true);
      }
    };

    window.addEventListener(
      CUSTOMERS_UPDATED_EVENT,
      handleCustomersUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        CUSTOMERS_UPDATED_EVENT,
        handleCustomersUpdated as EventListener
      );
    };
  }, []);

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  const refreshCustomers = async () => {
    return fetchCustomers(true);
  };

  return {
    customers,
    isLoading,
    error,
    invalidateCache,
    refreshCustomers,
  };
};
