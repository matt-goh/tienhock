// src/utils/catalogue/useJobLocationMappings.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../../routes/utils/api";

export interface JobLocationMapping {
  id: number;
  job_id: string;
  job_name: string;
  location_code: string;
  location_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocationMap {
  [key: string]: string;
}

interface CacheData {
  mappings: JobLocationMapping[];
  byJob: Record<string, string>;
  byLocation: Record<string, string[]>;
  locationMap: LocationMap;
  timestamp: number;
}

interface UseJobLocationMappingsReturn {
  mappings: JobLocationMapping[];
  byJob: Record<string, string>;
  byLocation: Record<string, string[]>;
  locationMap: LocationMap;
  loading: boolean;
  error: string | null;
  refreshData: (force?: boolean) => Promise<void>;
  clearCache: () => void;
  getLocationForJob: (jobId: string) => string;
  getLocationName: (locationCode: string) => string;
}

export const useJobLocationMappings = (): UseJobLocationMappingsReturn => {
  const [mappings, setMappings] = useState<JobLocationMapping[]>([]);
  const [byJob, setByJob] = useState<Record<string, string>>({});
  const [byLocation, setByLocation] = useState<Record<string, string[]>>({});
  const [locationMap, setLocationMap] = useState<LocationMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const CACHE_KEY = "jobLocationMappingsData";
  const CACHE_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (err) {
      console.error("Error clearing cache:", err);
    }
  }, []);

  const fetchData = useCallback(
    async (force = false) => {
      // If forcing refresh, clear cache first
      if (force) {
        clearCache();
      } else {
        // Try to load from cache
        try {
          const cachedData = localStorage.getItem(CACHE_KEY);
          if (cachedData) {
            const parsedData = JSON.parse(cachedData) as CacheData;
            const now = Date.now();

            if (now - parsedData.timestamp < CACHE_DURATION) {
              setMappings(parsedData.mappings);
              setByJob(parsedData.byJob);
              setByLocation(parsedData.byLocation);
              setLocationMap(parsedData.locationMap);
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
        const response = await api.get("/api/job-location-mappings");

        if (response && response.mappings) {
          setMappings(response.mappings);
          setByJob(response.byJob || {});
          setByLocation(response.byLocation || {});
          setLocationMap(response.locationMap || {});

          // Cache the data
          try {
            const cacheData: CacheData = {
              mappings: response.mappings,
              byJob: response.byJob || {},
              byLocation: response.byLocation || {},
              locationMap: response.locationMap || {},
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
      } catch (err: unknown) {
        console.error("Error fetching job location mappings:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch job location mappings"
        );
      } finally {
        setLoading(false);
      }
    },
    [clearCache]
  );

  // Load data on initial render
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Helper function to get location for a job (defaults to "02" if not found)
  const getLocationForJob = useCallback(
    (jobId: string): string => {
      return byJob[jobId] || "02";
    },
    [byJob]
  );

  // Helper function to get location name
  const getLocationName = useCallback(
    (locationCode: string): string => {
      return locationMap[locationCode] || locationCode;
    },
    [locationMap]
  );

  return {
    mappings,
    byJob,
    byLocation,
    locationMap,
    loading,
    error,
    refreshData: (force = true) => fetchData(force),
    clearCache,
    getLocationForJob,
    getLocationName,
  };
};
