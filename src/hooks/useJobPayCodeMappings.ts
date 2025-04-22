// src/hooks/useJobPayCodeMappings.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../routes/utils/api";
import { PayCode } from "../types/types";

type JobPayCodeMap = Record<string, string[]>; // Map job ID to array of pay code IDs

interface CacheData {
  mappings: JobPayCodeMap;
  payCodes: PayCode[];
  timestamp: number;
}

export const useJobPayCodeMappings = () => {
  const [mappings, setMappings] = useState<JobPayCodeMap>({});
  const [payCodes, setPayCodes] = useState<PayCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const CACHE_KEY = "payCodeData";
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

  const fetchData = useCallback(async (force = false) => {
    // Try to load from cache first
    if (!force) {
      try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsedData = JSON.parse(cachedData) as CacheData;
          const now = Date.now();

          if (now - parsedData.timestamp < CACHE_DURATION) {
            setMappings(parsedData.mappings);
            setPayCodes(parsedData.payCodes);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Error reading from localStorage:", err);
      }
    }

    setLoading(true);
    try {
      // Make a single API call
      const response = await api.get("/api/job-pay-codes/all-mappings");

      if (response && response.payCodes && response.mappings) {
        setPayCodes(response.payCodes);
        setMappings(response.mappings);

        // Cache the data
        try {
          const cacheData: CacheData = {
            mappings: response.mappings,
            payCodes: response.payCodes,
            timestamp: Date.now(),
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (err) {
          console.error("Error saving to localStorage:", err);
        }
      } else {
        throw new Error("Invalid response format from API");
      }

      setError(null);
    } catch (err: any) {
      console.error("Error fetching pay code data:", err);
      setError(err.message || "Failed to fetch pay code data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on initial render
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    mappings,
    payCodes,
    loading,
    error,
    refreshData: () => fetchData(true),
  };
};
