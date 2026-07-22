// src/utils/JellyPolly/useJPJobPayCodeMappings.ts — JP pay-code mapping caches
import { useState, useEffect, useCallback } from "react";
import { api } from "../../routes/utils/api";
import { PayCode, JobPayCodeDetails, ProductPayCodeDetails } from "../../types/types";

type DetailedJobPayCodeMap = Record<string, JobPayCodeDetails[]>;
type ProductPayCodeMap = Record<string, ProductPayCodeDetails[]>;

export interface EmployeePayCodeDetails
  extends Omit<PayCode, "rate_biasa" | "rate_ahad" | "rate_umum"> {
  job_id: string;
  employee_id?: string;
  pay_code_id: string;
  is_default_setting: boolean;
  rate_biasa: number;
  rate_ahad: number;
  rate_umum: number;
  override_rate_biasa: number | null;
  override_rate_ahad: number | null;
  override_rate_umum: number | null;
  source: string;
}

interface CacheData {
  detailedMappings: DetailedJobPayCodeMap;
  employeeMappings: Record<string, EmployeePayCodeDetails[]>;
  productMappings: ProductPayCodeMap;
  payCodes: PayCode[];
  timestamp: number;
}

const CACHE_KEY = "jpPayCodeData";
const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour in milliseconds

// Module-level memory cache + shared in-flight request so multiple mounted
// consumers (and React StrictMode's double effect in dev) share one fetch
// instead of each firing their own set of API calls.
let memoryCache: CacheData | null = null;
let pendingRequest: Promise<CacheData> | null = null;

const getFreshCachedData = (): CacheData | null => {
  const now: number = Date.now();

  if (memoryCache && now - memoryCache.timestamp < CACHE_DURATION) {
    return memoryCache;
  }

  try {
    const cachedData: string | null = localStorage.getItem(CACHE_KEY);
    if (!cachedData) return null;

    const parsedData: CacheData = JSON.parse(cachedData) as CacheData;
    if (now - parsedData.timestamp < CACHE_DURATION) {
      memoryCache = parsedData;
      return parsedData;
    }
  } catch (err) {
    console.error("Error reading from localStorage:", err);
  }

  return null;
};

const saveCache = (cacheData: CacheData): void => {
  memoryCache = cacheData;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (err) {
    console.error("Error saving to localStorage:", err);
  }
};

const fetchFromApi = async (): Promise<CacheData> => {
  // Fetch job mappings
  const response = await api.get("/jellypolly/api/job-pay-codes/all-mappings");

  // Fetch employee mappings
  const employeeResponse = await api.get(
    "/jellypolly/api/employee-pay-codes/all-mappings"
  );

  // Fetch product mappings
  const productResponse = await api.get(
    "/jellypolly/api/product-pay-codes/all-mappings"
  );

  if (!response || !response.payCodes || !response.detailedMappings) {
    throw new Error("Invalid response format from API");
  }

  const cacheData: CacheData = {
    detailedMappings: response.detailedMappings,
    employeeMappings: employeeResponse.detailedMappings || {},
    productMappings: productResponse.detailedMappings || {},
    payCodes: response.payCodes,
    timestamp: Date.now(),
  };
  saveCache(cacheData);
  return cacheData;
};

const getDataRequest = (force: boolean): Promise<CacheData> => {
  if (!force && pendingRequest) {
    return pendingRequest;
  }

  const request: Promise<CacheData> = fetchFromApi();
  pendingRequest = request;
  request.then(
    (): void => {
      if (pendingRequest === request) {
        pendingRequest = null;
      }
    },
    (): void => {
      if (pendingRequest === request) {
        pendingRequest = null;
      }
    }
  );

  return request;
};

export const useJPJobPayCodeMappings = () => {
  const [detailedMappings, setDetailedMappings] =
    useState<DetailedJobPayCodeMap>({});
  const [employeeMappings, setEmployeeMappings] = useState<
    Record<string, EmployeePayCodeDetails[]>
  >({});
  const [productMappings, setProductMappings] = useState<ProductPayCodeMap>({});
  const [payCodes, setPayCodes] = useState<PayCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearCache = useCallback(() => {
    memoryCache = null;
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (err) {
      console.error("Error clearing cache:", err);
    }
  }, []);

  const applyCacheData = useCallback((cacheData: CacheData): void => {
    setDetailedMappings(cacheData.detailedMappings);
    setPayCodes(cacheData.payCodes);
    setEmployeeMappings(cacheData.employeeMappings || {});
    setProductMappings(cacheData.productMappings || {});
  }, []);

  const fetchData = useCallback(
    async (force = false) => {
      // If forcing refresh, clear cache first
      if (force) {
        clearCache();
      } else {
        const cachedData: CacheData | null = getFreshCachedData();
        if (cachedData) {
          applyCacheData(cachedData);
          setLoading(false);
          setError(null);
          return;
        }
      }

      setLoading(true);
      try {
        const cacheData: CacheData = await getDataRequest(force);
        applyCacheData(cacheData);
        setError(null);
      } catch (err: any) {
        console.error("Error fetching pay code data:", err);
        setError(err.message || "Failed to fetch pay code data");
      } finally {
        setLoading(false);
      }
    },
    [applyCacheData, clearCache]
  );

  // Load data on initial render
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    detailedMappings,
    employeeMappings,
    productMappings,
    payCodes,
    loading,
    error,
    refreshData: () => fetchData(true),
    clearCache,
  };
};
