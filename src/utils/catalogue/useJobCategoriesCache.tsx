import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { JobCategory } from "../../types/types";

interface CachedJobCategories {
  data: JobCategory[];
  timestamp: number;
}

const CACHE_KEY = "job_categories_cache";
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds
const JOB_CATEGORIES_UPDATED_EVENT = "job-categories-updated";

// Create a global function to trigger cache refresh
export const refreshJobCategoriesCache = async () => {
  try {
    // Remove the current cache
    localStorage.removeItem(CACHE_KEY);

    // Fetch new data
    const data = await api.get("/api/job-categories");

    // Store in cache
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    // Dispatch event to notify subscribers
    window.dispatchEvent(
      new CustomEvent(JOB_CATEGORIES_UPDATED_EVENT, { detail: data })
    );
  } catch (error) {
    console.error("Error refreshing job categories cache:", error);
  }
};

// Expose this to make it globally available
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshJobCategoriesCache = refreshJobCategoriesCache;
}

export const useJobCategoriesCache = () => {
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchJobCategories = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // Skip cache if force refresh is requested
      if (!forceRefresh) {
        // Check cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const { data, timestamp }: CachedJobCategories =
            JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setJobCategories(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      // If cache is missing, expired, or force refresh is requested, fetch fresh data
      const data = await api.get("/api/job-categories");

      // Update cache
      const cacheData: CachedJobCategories = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setJobCategories(data);
      setError(null);
      return data;
    } catch (error) {
      console.error("Error fetching job categories:", error);
      const err =
        error instanceof Error
          ? error
          : new Error("Failed to fetch job categories");
      setError(err);
      if (!forceRefresh) {
        // Only show toast for initial loads, not background refreshes
        toast.error("Error fetching job categories");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchJobCategories();
  }, []);

  // Listen for job category updates
  useEffect(() => {
    const handleJobCategoriesUpdated = (event: CustomEvent) => {
      // If event contains data, use it directly
      if (event.detail) {
        setJobCategories(event.detail);
      } else {
        // Otherwise refresh from cache or API
        fetchJobCategories(true);
      }
    };

    window.addEventListener(
      JOB_CATEGORIES_UPDATED_EVENT,
      handleJobCategoriesUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        JOB_CATEGORIES_UPDATED_EVENT,
        handleJobCategoriesUpdated as EventListener
      );
    };
  }, []);

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  const refreshJobCategories = async () => {
    return fetchJobCategories(true);
  };

  return {
    jobCategories,
    isLoading,
    error,
    invalidateCache,
    refreshJobCategories,
  };
};
