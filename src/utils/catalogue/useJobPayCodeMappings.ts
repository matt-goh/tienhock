// In src/utils/catalogue/useJobPayCodeMappings.ts
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

export const useJobPayCodeMappings = () => {
  const [detailedMappings, setDetailedMappings] =
    useState<DetailedJobPayCodeMap>({});
  const [employeeMappings, setEmployeeMappings] = useState<
    Record<string, EmployeePayCodeDetails[]>
  >({});
  const [productMappings, setProductMappings] = useState<ProductPayCodeMap>({});
  const [payCodes, setPayCodes] = useState<PayCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const CACHE_KEY = "payCodeData";
  const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour in milliseconds

  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (err) {
      console.error("Error clearing cache:", err);
    }
  }, []);

  const fetchData = useCallback(async (force = false) => {
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
            setDetailedMappings(parsedData.detailedMappings);
            setPayCodes(parsedData.payCodes);
            setEmployeeMappings(parsedData.employeeMappings || {});
            setProductMappings(parsedData.productMappings || {});
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
      // Fetch job mappings
      const response = await api.get("/api/job-pay-codes/all-mappings");

      // Fetch employee mappings
      const employeeResponse = await api.get(
        "/api/employee-pay-codes/all-mappings"
      );

      // Fetch product mappings
      const productResponse = await api.get(
        "/api/product-pay-codes/all-mappings"
      );

      if (response && response.payCodes && response.detailedMappings) {
        setPayCodes(response.payCodes);
        setDetailedMappings(response.detailedMappings);
        setEmployeeMappings(employeeResponse.detailedMappings || {});
        setProductMappings(productResponse.detailedMappings || {});

        // Cache the data
        try {
          const cacheData: CacheData = {
            detailedMappings: response.detailedMappings,
            employeeMappings: employeeResponse.detailedMappings || {},
            productMappings: productResponse.detailedMappings || {},
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
  }, [clearCache]);

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
