// src/hooks/useStaffsCache.ts
import { useState, useEffect, useCallback, useMemo } from "react";
import { Employee } from "../../types/types";
import { api } from "../../routes/utils/api";

interface CacheData {
  allStaffs: Employee[];
  timestamp: number;
}

export const useStaffsCache = () => {
  const [allStaffs, setAllStaffs] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const CACHE_KEY = "allStaffsData";
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

  // Filter active staff members (no resignation date)
  const staffs = useMemo(() => {
    return allStaffs.filter((staff) => !staff.dateResigned);
  }, [allStaffs]);

  const fetchStaffs = useCallback(async (force = false) => {
    // Try to load from cache first
    if (!force) {
      try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsedData = JSON.parse(cachedData) as CacheData;
          const now = Date.now();

          if (now - parsedData.timestamp < CACHE_DURATION) {
            setAllStaffs(parsedData.allStaffs);
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
      // Fetch all staff (API now returns all by default)
      const response = await api.get("/api/staffs");

      if (response) {
        // Ensure job and location arrays are always arrays and new fields have defaults
        const normalizedStaffs = response.map((staff: Employee) => ({
          ...staff,
          job: Array.isArray(staff.job) ? staff.job : [],
          location: Array.isArray(staff.location) ? staff.location : [],
          department: staff.department || "",
          kwspNumber: staff.kwspNumber || "",
        }));

        setAllStaffs(normalizedStaffs);

        // Cache the data
        try {
          const cacheData: CacheData = {
            allStaffs: normalizedStaffs,
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
      console.error("Error fetching staffs data:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on initial render
  useEffect(() => {
    fetchStaffs();
  }, [fetchStaffs]);

  return {
    staffs, // Active staff only
    allStaffs, // All staff including resigned
    loading,
    error,
    refreshStaffs: () => fetchStaffs(true),
  };
};
