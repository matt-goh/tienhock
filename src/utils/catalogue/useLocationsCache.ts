// src/utils/catalogue/useLocationsCache.ts
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

export interface Location {
  id: string;
  name: string;
  originalId?: string;
}

interface CachedLocations {
  data: Location[];
  timestamp: number;
}

const CACHE_KEY = "locations_cache";
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds
const LOCATIONS_UPDATED_EVENT = "locations-updated";

// Create a global function to trigger cache refresh
export const refreshLocationsCache = async () => {
  try {
    // Remove the current cache
    localStorage.removeItem(CACHE_KEY);

    // Fetch new data
    const data = await api.get("/api/locations");

    // Store in cache
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    // Dispatch event to notify subscribers
    window.dispatchEvent(
      new CustomEvent(LOCATIONS_UPDATED_EVENT, { detail: data })
    );
  } catch (error) {
    console.error("Error refreshing locations cache:", error);
  }
};

// Expose this to make it globally available
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshLocationsCache = refreshLocationsCache;
}

export const useLocationsCache = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLocations = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // Skip cache if force refresh is requested
      if (!forceRefresh) {
        // Check cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const { data, timestamp }: CachedLocations = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setLocations(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      // If cache is missing, expired, or force refresh is requested, fetch fresh data
      const data = await api.get("/api/locations");

      // Update cache
      const cacheData: CachedLocations = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setLocations(data);
      setError(null);
      return data;
    } catch (error) {
      console.error("Error fetching locations:", error);
      const err =
        error instanceof Error
          ? error
          : new Error("Failed to fetch locations");
      setError(err);
      if (!forceRefresh) {
        toast.error("Error fetching locations");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchLocations();
  }, []);

  // Listen for location updates
  useEffect(() => {
    const handleLocationsUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setLocations(event.detail);
      } else {
        fetchLocations(true);
      }
    };

    window.addEventListener(
      LOCATIONS_UPDATED_EVENT,
      handleLocationsUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        LOCATIONS_UPDATED_EVENT,
        handleLocationsUpdated as EventListener
      );
    };
  }, []);

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  const refreshLocations = async () => {
    return fetchLocations(true);
  };

  return {
    locations,
    isLoading,
    error,
    invalidateCache,
    refreshLocations,
  };
};
