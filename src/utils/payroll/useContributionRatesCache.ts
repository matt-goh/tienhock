// src/utils/payroll/useContributionRatesCache.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { EPFRate, SOCSORRate, SIPRate } from "../../types/types";

export interface ContributionRatesData {
  epfRates: EPFRate[];
  socsoRates: SOCSORRate[];
  sipRates: SIPRate[];
  timestamp: number;
}

const CACHE_KEY = "contribution_rates_cache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const RATES_UPDATED_EVENT = "contribution-rates-updated";

// Global function to trigger cache refresh
export const refreshContributionRatesCache = async () => {
  try {
    localStorage.removeItem(CACHE_KEY);

    // Fetch fresh data
    const [epfData, socsoData, sipData] = await Promise.all([
      api.get("/api/contribution-rates/epf"),
      api.get("/api/contribution-rates/socso"),
      api.get("/api/contribution-rates/sip"),
    ]);

    // Store in cache
    const cacheData: ContributionRatesData = {
      epfRates: epfData,
      socsoRates: socsoData,
      sipRates: sipData,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    // Dispatch event to notify subscribers
    window.dispatchEvent(
      new CustomEvent(RATES_UPDATED_EVENT, { detail: cacheData })
    );
  } catch (error) {
    console.error("Error refreshing contribution rates cache:", error);
  }
};

// Expose globally
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshContributionRatesCache = refreshContributionRatesCache;
}

export const useContributionRatesCache = () => {
  const [epfRates, setEpfRates] = useState<EPFRate[]>([]);
  const [socsoRates, setSocsoRates] = useState<SOCSORRate[]>([]);
  const [sipRates, setSipRates] = useState<SIPRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchContributionRates = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // Skip cache if force refresh is requested
      if (!forceRefresh) {
        // Check cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const {
            epfRates,
            socsoRates,
            sipRates,
            timestamp,
          }: ContributionRatesData = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setEpfRates(epfRates);
            setSocsoRates(socsoRates);
            setSipRates(sipRates);
            setIsLoading(false);
            setError(null);
            return { epfRates, socsoRates, sipRates };
          }
        }
      }

      // Fetch fresh data if cache is missing, expired, or force refresh
      const [epfData, socsoData, sipData] = await Promise.all([
        api.get("/api/contribution-rates/epf"),
        api.get("/api/contribution-rates/socso"),
        api.get("/api/contribution-rates/sip"),
      ]);

      // Update cache
      const cacheData: ContributionRatesData = {
        epfRates: epfData,
        socsoRates: socsoData,
        sipRates: sipData,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setEpfRates(epfData);
      setSocsoRates(socsoData);
      setSipRates(sipData);
      setError(null);

      return cacheData;
    } catch (error) {
      console.error("Error fetching contribution rates:", error);
      const err =
        error instanceof Error
          ? error
          : new Error("Failed to fetch contribution rates");
      setError(err);
      if (!forceRefresh) {
        toast.error("Error fetching contribution rates");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchContributionRates();
  }, [fetchContributionRates]);

  // Listen for contribution rates updates
  useEffect(() => {
    const handleRatesUpdated = (event: CustomEvent) => {
      if (event.detail) {
        const { epfRates, socsoRates, sipRates } = event.detail;
        setEpfRates(epfRates);
        setSocsoRates(socsoRates);
        setSipRates(sipRates);
      } else {
        fetchContributionRates(true);
      }
    };

    window.addEventListener(
      RATES_UPDATED_EVENT,
      handleRatesUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        RATES_UPDATED_EVENT,
        handleRatesUpdated as EventListener
      );
    };
  }, [fetchContributionRates]);

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  const refreshRates = async () => {
    return fetchContributionRates(true);
  };

  return {
    epfRates,
    socsoRates,
    sipRates,
    isLoading,
    error,
    invalidateCache,
    refreshRates,
  };
};
