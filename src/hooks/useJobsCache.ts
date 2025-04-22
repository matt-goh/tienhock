// src/hooks/useJobsCache.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../routes/utils/api";
import { Job } from "../types/types";

interface CacheData {
  jobs: Job[];
  timestamp: number;
}

export const useJobsCache = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const CACHE_KEY = "jobsData";
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

  const fetchJobs = useCallback(async (force = false) => {
    // Try to load from cache first
    if (!force) {
      try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsedData = JSON.parse(cachedData) as CacheData;
          const now = Date.now();

          if (now - parsedData.timestamp < CACHE_DURATION) {
            setJobs(parsedData.jobs);
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
      const response = await api.get("/api/jobs");

      if (response) {
        // Convert job section to array if it's a string
        const normalizedJobs = response.map((job: Job) => ({
          ...job,
          section: Array.isArray(job.section)
            ? job.section
            : job.section
            ? String(job.section).split(", ")
            : [],
        }));

        setJobs(normalizedJobs);

        // Cache the data
        try {
          const cacheData: CacheData = {
            jobs: normalizedJobs,
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
      console.error("Error fetching jobs data:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on initial render
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return {
    jobs,
    loading,
    error,
    refreshJobs: () => fetchJobs(true),
  };
};
