// src/hooks/useStaffFormOptions.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../routes/utils/api";

interface FormOptions {
  nationalities: SelectOption[];
  races: SelectOption[];
  agama: SelectOption[];
  locations: SelectOption[];
  banks: SelectOption[];
  sections?: SelectOption[];
  departments: SelectOption[];
}

interface SelectOption {
  id: string;
  name: string;
}

interface CacheData {
  options: Partial<FormOptions>;
  timestamp: number;
  version?: number;
}

const CACHE_VERSION: number = 2;
const CACHE_KEY: string = "staffFormOptionsData";
const CACHE_DURATION: number = 24 * 60 * 60 * 1000; // 1 day in milliseconds

const normalizeOptions = (data: Partial<FormOptions>): FormOptions => ({
  nationalities: data.nationalities || [],
  races: data.races || [],
  agama: data.agama || [],
  locations: data.locations || [],
  banks: data.banks || [],
  sections: data.sections || [],
  departments: data.departments || [],
});

export const useStaffFormOptions = () => {
  const [options, setOptions] = useState<FormOptions>({
    nationalities: [],
    races: [],
    agama: [],
    locations: [],
    banks: [],
    sections: [],
    departments: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOptions = useCallback(async (force = false) => {
    // Try to load from cache first
    if (!force) {
      try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsedData = JSON.parse(cachedData) as CacheData;
          const now = Date.now();

          if (
            parsedData.version === CACHE_VERSION &&
            now - parsedData.timestamp < CACHE_DURATION
          ) {
            setOptions(normalizeOptions(parsedData.options));
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
        const normalizedOptions = normalizeOptions(response);
        setOptions(normalizedOptions);

        // Cache the data
        try {
          const cacheData: CacheData = {
            options: normalizedOptions,
            timestamp: Date.now(),
            version: CACHE_VERSION,
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
