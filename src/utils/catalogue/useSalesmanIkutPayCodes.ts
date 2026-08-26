// src/utils/catalogue/useSalesmanIkutPayCodes.ts
//
// Tien Hock product -> Ikut Lori (DME/DWE) pay-code mapping used by the
// salesman daily-log pages. The mapping is data-driven from
// /api/product-salesman-ikut-pay-codes (no per-product code edits).

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../../routes/utils/api";

interface SalesmanIkutPayCodeRow {
  product_id: string;
  pay_code_id: string;
  description: string;
  rate_unit: string;
}

interface CacheData {
  productToIkutPayCode: Record<string, string>;
  timestamp: number;
}

const CACHE_KEY = "salesmanIkutPayCodes";
const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour

// Module-level memory cache + shared in-flight request so multiple mounted
// consumers (and React StrictMode's double effect in dev) share one fetch.
let memoryCache: CacheData | null = null;
let pendingRequest: Promise<Record<string, string>> | null = null;

export const invalidateSalesmanIkutPayCodesCache = (): void => {
  memoryCache = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (err) {
    console.error("Error clearing Ikut Lori mapping cache:", err);
  }
};

const getFreshCache = (): CacheData | null => {
  const now = Date.now();
  if (memoryCache && now - memoryCache.timestamp < CACHE_DURATION) {
    return memoryCache;
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheData;
    if (now - parsed.timestamp < CACHE_DURATION) {
      memoryCache = parsed;
      return parsed;
    }
  } catch (err) {
    console.error("Error reading Ikut Lori mapping cache:", err);
  }
  return null;
};

const saveCache = (map: Record<string, string>): void => {
  const data: CacheData = {
    productToIkutPayCode: map,
    timestamp: Date.now(),
  };
  memoryCache = data;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Error saving Ikut Lori mapping cache:", err);
  }
};

const fetchFromApi = async (): Promise<Record<string, string>> => {
  const rows = await api.get<SalesmanIkutPayCodeRow[]>(
    "/api/product-salesman-ikut-pay-codes"
  );
  const map: Record<string, string> = {};
  rows.forEach((row) => {
    map[row.product_id] = row.pay_code_id;
  });
  saveCache(map);
  return map;
};

const getDataRequest = (): Promise<Record<string, string>> => {
  if (pendingRequest) {
    return pendingRequest;
  }
  const request = fetchFromApi();
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

export const useSalesmanIkutPayCodes = () => {
  const [productToIkutPayCode, setProductToIkutPayCode] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyMap = useCallback((map: Record<string, string>): void => {
    setProductToIkutPayCode(map);
    setError(null);
  }, []);

  const fetchData = useCallback(async (force = false): Promise<void> => {
    if (!force) {
      const cached = getFreshCache();
      if (cached) {
        applyMap(cached.productToIkutPayCode);
        setIsLoading(false);
        return;
      }
    }
    setIsLoading(true);
    try {
      const map = await getDataRequest();
      applyMap(map);
    } catch (fetchError) {
      console.error("Error fetching Ikut Lori pay-code mappings:", fetchError);
      // Fall back to any previously cached copy so a transient API failure
      // does not silently break Ikut Lori auto-fill.
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CacheData;
          memoryCache = parsed;
          applyMap(parsed.productToIkutPayCode);
        }
      } catch (cacheError) {
        console.error("Error reading Ikut Lori mapping fallback:", cacheError);
      }
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to fetch Ikut Lori pay-code mappings"
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyMap]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Stable identity so daily-log effects depending on this array do not
  // re-run on every render.
  const ikutPayCodeIds = useMemo(
    () => Object.values(productToIkutPayCode),
    [productToIkutPayCode]
  );

  return {
    productToIkutPayCode,
    // Multiple products may share one Ikut code (e.g. 2-APPLE/2-BH ->
    // DME-300G), so Object.values naturally de-duplicates.
    ikutPayCodeIds,
    isLoading,
    error,
    refreshData: (): Promise<void> => {
      invalidateSalesmanIkutPayCodesCache();
      return fetchData(true);
    },
  };
};
