// src/hooks/useStaffFormOptions.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../routes/utils/api";

interface FormOptions {
  nationalities: SelectOption[];
  races: SelectOption[];
  agama: SelectOption[];
  locations: SelectOption[];
  banks: SelectOption[];
}

interface SelectOption {
  id: string;
  name: string;
}

interface CacheData {
  options: FormOptions;
  timestamp: number;
}

export const useStaffFormOptions = () => {
  const [options, setOptions] = useState<FormOptions>({
    nationalities: [],
    races: [],
    agama: [],
    locations: [],
    banks: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const CACHE_KEY = "staffFormOptionsData";
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day in milliseconds

  const fetchOptions = useCallback(async (force = false) => {
    // Try to load from cache first
    if (!force) {
      try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsedData = JSON.parse(cachedData) as CacheData;
          const now = Date.now();

          if (now - parsedData.timestamp < CACHE_DURATION) {
            setOptions(parsedData.options);
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
      const response = await api.get("/api/staff-options");

      if (response) {
        setOptions(response);

        // Cache the data
        try {
          const cacheData: CacheData = {
            options: response,
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
      console.error("Error fetching staff form options:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on initial render
  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  return {
    options,
    loading,
    error,
    refreshOptions: () => fetchOptions(true),
  };
};
