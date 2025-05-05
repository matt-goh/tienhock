// In src/utils/catalogue/useJobPayCodeMappings.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../../routes/utils/api";
import { PayCode, JobPayCodeDetails } from "../../types/types";

type DetailedJobPayCodeMap = Record<string, JobPayCodeDetails[]>;

export interface EmployeePayCodeDetails
  extends Omit<PayCode, "rate_biasa" | "rate_ahad" | "rate_umum"> {
  employee_id: string;
  pay_code_id: string;
  is_default_setting: boolean;
  rate_biasa: number;
  rate_ahad: number;
  rate_umum: number;
  override_rate_biasa: number | null;
  override_rate_ahad: number | null;
  override_rate_umum: number | null;
}

interface CacheData {
  detailedMappings: DetailedJobPayCodeMap;
  employeeMappings: Record<string, EmployeePayCodeDetails[]>;
  payCodes: PayCode[];
  timestamp: number;
}

export const useJobPayCodeMappings = () => {
  const [detailedMappings, setDetailedMappings] =
    useState<DetailedJobPayCodeMap>({});
  const [employeeMappings, setEmployeeMappings] = useState<
    Record<string, EmployeePayCodeDetails[]>
  >({});
  const [payCodes, setPayCodes] = useState<PayCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const CACHE_KEY = "payCodeData";
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  const fetchData = useCallback(async (force = false) => {
    // Try to load from cache first
    if (!force) {
      try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsedData = JSON.parse(cachedData) as CacheData;
          const now = Date.now();

          if (now - parsedData.timestamp < CACHE_DURATION) {
            setDetailedMappings(parsedData.detailedMappings);
            setPayCodes(parsedData.payCodes);
            setEmployeeMappings(parsedData.employeeMappings || {});
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

      if (response && response.payCodes && response.detailedMappings) {
        setPayCodes(response.payCodes);
        setDetailedMappings(response.detailedMappings);
        setEmployeeMappings(employeeResponse.detailedMappings || {});

        // Cache the data
        try {
          const cacheData: CacheData = {
            detailedMappings: response.detailedMappings,
            employeeMappings: employeeResponse.detailedMappings || {},
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
    detailedMappings,
    employeeMappings,
    payCodes,
    loading,
    error,
    refreshData: () => fetchData(true),
  };
};
