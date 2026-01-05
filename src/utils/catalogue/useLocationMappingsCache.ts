// src/utils/catalogue/useLocationMappingsCache.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../../routes/utils/api";

// ==================== TYPES ====================

export interface Location {
  id: string;
  name: string;
  originalId?: string;
}

export interface JobLocationMapping {
  job_id: string;
  job_name: string;
  section: string;
  location_code: string;
  location_name: string;
  is_active: boolean;
}

export interface EmployeeLocationMapping {
  employee_id: string;
  employee_name: string;
  location_code: string;
}

export interface LocationAccountMapping {
  id: number;
  location_id: string;
  location_name: string;
  mapping_type: string;
  account_code: string;
  account_description?: string;
  voucher_type: "JVDR" | "JVSL";
  is_active: boolean;
}

export interface JobLocationSummary {
  location_code: string;
  location_name: string;
  jobs: Array<{ job_id: string; job_name: string; section: string }>;
}

export interface EmployeeLocationSummary {
  location_code: string;
  employees: Array<{ employee_id: string; employee_name: string }>;
}

interface CacheData {
  locations: Location[];
  jobMappings: {
    mappings: JobLocationMapping[];
    byJob: Record<string, string>;
    byLocation: Record<string, JobLocationSummary>;
  };
  employeeMappings: {
    mappings: EmployeeLocationMapping[];
    byEmployee: Record<string, string[]>;
    byLocation: Record<string, EmployeeLocationSummary>;
  };
  accountMappings: {
    mappings: LocationAccountMapping[];
    byVoucherType: {
      JVDR: LocationAccountMapping[];
      JVSL: LocationAccountMapping[];
    };
  };
  timestamp: number;
}

// ==================== CONSTANTS ====================

const CACHE_KEY = "locationMappingsCache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day in milliseconds
const LOCATION_MAPPINGS_UPDATED_EVENT = "location-mappings-updated";

// ==================== GLOBAL REFRESH FUNCTION ====================

export const refreshLocationMappingsCache = async () => {
  try {
    localStorage.removeItem(CACHE_KEY);
    window.dispatchEvent(
      new CustomEvent(LOCATION_MAPPINGS_UPDATED_EVENT, { detail: { type: "full" } })
    );
  } catch (error) {
    console.error("Error refreshing location mappings cache:", error);
  }
};

// Expose globally
if (typeof window !== "undefined") {
  // @ts-expect-error - Adding to window object
  window.refreshLocationMappingsCache = refreshLocationMappingsCache;
}

// ==================== HOOK ====================

export const useLocationMappingsCache = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [jobMappings, setJobMappings] = useState<CacheData["jobMappings"]>({
    mappings: [],
    byJob: {},
    byLocation: {},
  });
  const [employeeMappings, setEmployeeMappings] = useState<CacheData["employeeMappings"]>({
    mappings: [],
    byEmployee: {},
    byLocation: {},
  });
  const [accountMappings, setAccountMappings] = useState<CacheData["accountMappings"]>({
    mappings: [],
    byVoucherType: { JVDR: [], JVSL: [] },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              setLocations(parsedData.locations);
              setJobMappings(parsedData.jobMappings);
              setEmployeeMappings(parsedData.employeeMappings);
              setAccountMappings(parsedData.accountMappings);
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
        // Fetch all data in parallel
        const [locationsRes, jobMappingsRes, employeeMappingsRes, accountMappingsRes] =
          await Promise.all([
            api.get("/api/locations"),
            api.get("/api/locations/job-mappings"),
            api.get("/api/locations/employee-mappings"),
            api.get("/api/journal-vouchers/mappings"),
          ]);

        // Process locations
        const locationsData: Location[] = locationsRes || [];

        // Process job mappings
        const jobMappingsData: JobLocationMapping[] = jobMappingsRes?.jobMappings || [];
        const jobLocationSummary: JobLocationSummary[] = jobMappingsRes?.locationSummary || [];

        const byJob: Record<string, string> = {};
        jobMappingsData.forEach((m: JobLocationMapping) => {
          if (m.location_code) {
            byJob[m.job_id] = m.location_code;
          }
        });

        const byLocationJob: Record<string, JobLocationSummary> = {};
        jobLocationSummary.forEach((summary: JobLocationSummary) => {
          byLocationJob[summary.location_code] = summary;
        });

        // Process employee mappings
        const employeeMappingsData: EmployeeLocationMapping[] =
          employeeMappingsRes?.employeeMappings || [];
        const employeeLocationSummary: EmployeeLocationSummary[] =
          employeeMappingsRes?.locationSummary || [];

        const byEmployee: Record<string, string[]> = {};
        employeeMappingsData.forEach((m: EmployeeLocationMapping) => {
          if (!byEmployee[m.employee_id]) {
            byEmployee[m.employee_id] = [];
          }
          byEmployee[m.employee_id].push(m.location_code);
        });

        const byLocationEmployee: Record<string, EmployeeLocationSummary> = {};
        employeeLocationSummary.forEach((summary: EmployeeLocationSummary) => {
          byLocationEmployee[summary.location_code] = summary;
        });

        // Process account mappings
        const accountMappingsData: LocationAccountMapping[] = accountMappingsRes || [];
        const byVoucherType = {
          JVDR: accountMappingsData.filter((m) => m.voucher_type === "JVDR"),
          JVSL: accountMappingsData.filter((m) => m.voucher_type === "JVSL"),
        };

        // Set state
        setLocations(locationsData);
        setJobMappings({
          mappings: jobMappingsData,
          byJob,
          byLocation: byLocationJob,
        });
        setEmployeeMappings({
          mappings: employeeMappingsData,
          byEmployee,
          byLocation: byLocationEmployee,
        });
        setAccountMappings({
          mappings: accountMappingsData,
          byVoucherType,
        });

        // Cache the data
        try {
          const cacheData: CacheData = {
            locations: locationsData,
            jobMappings: {
              mappings: jobMappingsData,
              byJob,
              byLocation: byLocationJob,
            },
            employeeMappings: {
              mappings: employeeMappingsData,
              byEmployee,
              byLocation: byLocationEmployee,
            },
            accountMappings: {
              mappings: accountMappingsData,
              byVoucherType,
            },
            timestamp: Date.now(),
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (err) {
          console.error("Error saving to localStorage:", err);
        }

        setError(null);
      } catch (err: unknown) {
        console.error("Error fetching location mappings:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch location mappings"
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

  // Listen for cache update events
  useEffect(() => {
    const handleCacheUpdate = () => {
      fetchData(true);
    };

    window.addEventListener(LOCATION_MAPPINGS_UPDATED_EVENT, handleCacheUpdate);

    return () => {
      window.removeEventListener(LOCATION_MAPPINGS_UPDATED_EVENT, handleCacheUpdate);
    };
  }, [fetchData]);

  // ==================== HELPER FUNCTIONS ====================

  const getLocationName = useCallback(
    (locationId: string): string => {
      const location = locations.find((l) => l.id === locationId);
      return location?.name || locationId;
    },
    [locations]
  );

  const getLocationForJob = useCallback(
    (jobId: string): string => {
      return jobMappings.byJob[jobId] || "02"; // Default to "02" if not found
    },
    [jobMappings.byJob]
  );

  const getJobsForLocation = useCallback(
    (locationCode: string): JobLocationSummary["jobs"] => {
      return jobMappings.byLocation[locationCode]?.jobs || [];
    },
    [jobMappings.byLocation]
  );

  const getEmployeesForLocation = useCallback(
    (locationCode: string): EmployeeLocationSummary["employees"] => {
      return employeeMappings.byLocation[locationCode]?.employees || [];
    },
    [employeeMappings.byLocation]
  );

  const getAccountMappingsForVoucherType = useCallback(
    (voucherType: "JVDR" | "JVSL"): LocationAccountMapping[] => {
      return accountMappings.byVoucherType[voucherType] || [];
    },
    [accountMappings.byVoucherType]
  );

  // ==================== CACHE INVALIDATION ====================

  const invalidateJobMappings = useCallback(() => {
    clearCache();
    window.dispatchEvent(
      new CustomEvent(LOCATION_MAPPINGS_UPDATED_EVENT, { detail: { type: "job" } })
    );
  }, [clearCache]);

  const invalidateEmployeeMappings = useCallback(() => {
    clearCache();
    window.dispatchEvent(
      new CustomEvent(LOCATION_MAPPINGS_UPDATED_EVENT, { detail: { type: "employee" } })
    );
  }, [clearCache]);

  const invalidateAccountMappings = useCallback(() => {
    clearCache();
    window.dispatchEvent(
      new CustomEvent(LOCATION_MAPPINGS_UPDATED_EVENT, { detail: { type: "account" } })
    );
  }, [clearCache]);

  const refreshData = useCallback(() => fetchData(true), [fetchData]);

  return {
    // Data
    locations,
    jobMappings,
    employeeMappings,
    accountMappings,
    loading,
    error,

    // Helper functions
    getLocationName,
    getLocationForJob,
    getJobsForLocation,
    getEmployeesForLocation,
    getAccountMappingsForVoucherType,

    // Cache management
    refreshData,
    clearCache,
    invalidateJobMappings,
    invalidateEmployeeMappings,
    invalidateAccountMappings,
  };
};
