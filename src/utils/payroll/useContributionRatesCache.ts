// src/utils/payroll/useContributionRatesCache.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { EPFRate, SOCSORRate, SIPRate, IncomeTaxRate } from "../../types/types";

export interface ContributionRatesData {
  epfRates: EPFRate[];
  socsoRates: SOCSORRate[];
  sipRates: SIPRate[];
  incomeTaxRates: IncomeTaxRate[];
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
    const [epfData, socsoData, sipData, incomeTaxData] = await Promise.all([
      api.get("/api/contribution-rates/epf"),
      api.get("/api/contribution-rates/socso"),
      api.get("/api/contribution-rates/sip"),
      api.get("/api/contribution-rates/income-tax"),
    ]);

    // Store in cache
    const cacheData: ContributionRatesData = {
      epfRates: epfData,
      socsoRates: socsoData,
      sipRates: sipData,
      incomeTaxRates: incomeTaxData,
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
  const [incomeTaxRates, setIncomeTaxRates] = useState<IncomeTaxRate[]>([]);
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
            incomeTaxRates,
            timestamp,
          }: ContributionRatesData = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setEpfRates(epfRates);
            setSocsoRates(socsoRates);
            setSipRates(sipRates);
            setIncomeTaxRates(incomeTaxRates || []); // Handle backward compatibility
            setIsLoading(false);
            setError(null);
            return { epfRates, socsoRates, sipRates, incomeTaxRates };
          }
        }
      }

      // Fetch fresh data if cache is missing, expired, or force refresh
      const [epfData, socsoData, sipData, incomeTaxData] = await Promise.all([
        api.get("/api/contribution-rates/epf"),
        api.get("/api/contribution-rates/socso"),
        api.get("/api/contribution-rates/sip"),
        api.get("/api/contribution-rates/income-tax"),
      ]);

      // Update cache
      const cacheData: ContributionRatesData = {
        epfRates: epfData,
        socsoRates: socsoData,
        sipRates: sipData,
        incomeTaxRates: incomeTaxData,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setEpfRates(epfData);
      setSocsoRates(socsoData);
      setSipRates(sipData);
      setIncomeTaxRates(incomeTaxData);
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
        const { epfRates, socsoRates, sipRates, incomeTaxRates } = event.detail;
        setEpfRates(epfRates);
        setSocsoRates(socsoRates);
        setSipRates(sipRates);
        setIncomeTaxRates(incomeTaxRates || []);
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
    incomeTaxRates,
    isLoading,
    error,
    invalidateCache,
    refreshRates,
  };
};
