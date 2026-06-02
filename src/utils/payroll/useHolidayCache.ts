// src/utils/payroll/useHolidayCache.ts
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";

interface Holiday {
  id: number;
  holiday_date: string;
  description: string;
  is_active: boolean;
  is_cuti_umum: boolean;
}

interface CachedHolidays {
  data: Holiday[];
  timestamp: number;
}

const CACHE_KEY = "holidays_cache_v3";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const HOLIDAYS_UPDATED_EVENT = "holidays-updated";

const toLocalDateString = (value: string): string => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
};

// Create a global function to trigger cache refresh
export const refreshHolidaysCache = async () => {
  try {
    // Remove the current cache
    localStorage.removeItem(CACHE_KEY);

    // Fetch new data
    const data = await api.get("/api/holidays");

    // Store in cache
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    // Dispatch event to notify subscribers
    window.dispatchEvent(
      new CustomEvent(HOLIDAYS_UPDATED_EVENT, { detail: data })
    );
  } catch (error) {
    console.error("Error refreshing holidays cache:", error);
  }
};

// Expose this to make it globally available
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshHolidaysCache = refreshHolidaysCache;
}

export const useHolidayCache = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchHolidays = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // Skip cache if force refresh is requested
      if (!forceRefresh) {
        // Check cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const { data, timestamp }: CachedHolidays = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setHolidays(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      // If cache is missing, expired, or force refresh is requested, fetch fresh data
      const data = await api.get("/api/holidays");

      // Update cache
      const cacheData: CachedHolidays = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setHolidays(data);
      setError(null);
      return data;
    } catch (error) {
      console.error("Error fetching holidays:", error);
      const err =
        error instanceof Error ? error : new Error("Failed to fetch holidays");
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  // Listen for holiday updates
  useEffect(() => {
    const handleHolidaysUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setHolidays(event.detail);
      } else {
        fetchHolidays(true);
      }
    };

    window.addEventListener(
      HOLIDAYS_UPDATED_EVENT,
      handleHolidaysUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        HOLIDAYS_UPDATED_EVENT,
        handleHolidaysUpdated as EventListener
      );
    };
  }, [fetchHolidays]);

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
    refreshHolidaysCache();
  };

  const refreshHolidays = async () => {
    return fetchHolidays(true);
  };

  // Helper function to check if a date is a holiday
  const isHoliday = useCallback(
    (date: Date): boolean => {
      const dateStr = format(date, "yyyy-MM-dd");
      return holidays.some((holiday) => {
        const holidayDate = toLocalDateString(holiday.holiday_date);
        return holidayDate === dateStr && holiday.is_active;
      });
    },
    [holidays]
  );

  // Helper function to get holiday description for a date
  const getHolidayDescription = useCallback(
    (date: Date): string | null => {
      const dateStr = format(date, "yyyy-MM-dd");
      const holiday = holidays.find((holiday) => {
        const holidayDate = toLocalDateString(holiday.holiday_date);
        return holidayDate === dateStr && holiday.is_active;
      });
      return holiday ? holiday.description : null;
    },
    [holidays]
  );

  return {
    holidays,
    isLoading,
    error,
    invalidateCache,
    refreshHolidays,
    isHoliday,
    getHolidayDescription,
  };
};
