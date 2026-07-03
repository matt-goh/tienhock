// src/utils/JellyPolly/useJPStaffsCache.ts — JP staff catalogue cache (jellypolly.staffs)
import { useState, useEffect, useCallback, useMemo } from "react";
import { Employee } from "../../types/types";
import { api } from "../../routes/utils/api";

interface CacheData {
  allStaffs: Employee[];
  timestamp: number;
}

const CACHE_KEY = "jpAllStaffsData";
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

let memoryCache: CacheData | null = null;
let pendingStaffsRequest: Promise<Employee[]> | null = null;

const normalizeStaffs = (staffs: Employee[]): Employee[] => {
  return staffs.map((staff: Employee): Employee => ({
    ...staff,
    job: Array.isArray(staff.job) ? staff.job : [],
    location: Array.isArray(staff.location) ? staff.location : [],
    department: staff.department || "",
    kwspNumber: staff.kwspNumber || "",
  }));
};

const getFreshCachedStaffs = (): Employee[] | null => {
  const now: number = Date.now();

  if (memoryCache && now - memoryCache.timestamp < CACHE_DURATION) {
    return memoryCache.allStaffs;
  }

  try {
    const cachedData: string | null = localStorage.getItem(CACHE_KEY);
    if (!cachedData) return null;

    const parsedData: CacheData = JSON.parse(cachedData) as CacheData;
    if (now - parsedData.timestamp < CACHE_DURATION) {
      memoryCache = parsedData;
      return parsedData.allStaffs;
    }
  } catch (err: unknown) {
    console.error("Error reading from localStorage:", err);
  }

  return null;
};

const saveStaffsCache = (allStaffs: Employee[]): void => {
  const cacheData: CacheData = {
    allStaffs,
    timestamp: Date.now(),
  };

  memoryCache = cacheData;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (err: unknown) {
    console.error("Error saving to localStorage:", err);
  }
};

const fetchStaffsFromApi = async (): Promise<Employee[]> => {
  const response: Employee[] = (await api.get("/jellypolly/api/staffs")) as Employee[];

  if (!Array.isArray(response)) {
    throw new Error("Invalid response format from API");
  }

  const normalizedStaffs: Employee[] = normalizeStaffs(response);
  saveStaffsCache(normalizedStaffs);
  return normalizedStaffs;
};

const getStaffsRequest = (force: boolean): Promise<Employee[]> => {
  if (!force && pendingStaffsRequest) {
    return pendingStaffsRequest;
  }

  const request: Promise<Employee[]> = fetchStaffsFromApi();
  pendingStaffsRequest = request;
  request.then(
    (): void => {
      if (pendingStaffsRequest === request) {
        pendingStaffsRequest = null;
      }
    },
    (): void => {
      if (pendingStaffsRequest === request) {
        pendingStaffsRequest = null;
      }
    }
  );

  return request;
};

export const useJPStaffsCache = () => {
  const [allStaffs, setAllStaffs] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filter active staff members (no resignation date)
  const staffs = useMemo(() => {
    return allStaffs.filter((staff) => !staff.dateResigned);
  }, [allStaffs]);

  const fetchStaffs = useCallback(async (force: boolean = false): Promise<void> => {
    if (!force) {
      const cachedStaffs: Employee[] | null = getFreshCachedStaffs();
      if (cachedStaffs) {
        setAllStaffs(cachedStaffs);
        setLoading(false);
        setError(null);
        return;
      }
    }

    setLoading(true);
    try {
      const normalizedStaffs: Employee[] = await getStaffsRequest(force);
      setAllStaffs(normalizedStaffs);
      setError(null);
    } catch (err: unknown) {
      console.error("Error fetching staffs data:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch staffs data"));
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
