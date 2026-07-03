// src/utils/JellyPolly/useJPJobsCache.ts — JP jobs catalogue cache (jellypolly.jobs)
import { useState, useEffect, useCallback } from "react";
import { Job } from "../../types/types";
import { api } from "../../routes/utils/api";

interface CacheData {
  jobs: Job[];
  timestamp: number;
}

const CACHE_KEY = "jpJobsData";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day in milliseconds

let memoryCache: CacheData | null = null;
let pendingJobsRequest: Promise<Job[]> | null = null;

const normalizeJobs = (jobs: Job[]): Job[] => {
  return jobs.map((job: Job): Job => ({
    ...job,
    section: Array.isArray(job.section)
      ? job.section
      : job.section
      ? String(job.section).split(", ")
      : [],
  }));
};

const getFreshCachedJobs = (): Job[] | null => {
  const now: number = Date.now();

  if (memoryCache && now - memoryCache.timestamp < CACHE_DURATION) {
    return memoryCache.jobs;
  }

  try {
    const cachedData: string | null = localStorage.getItem(CACHE_KEY);
    if (!cachedData) return null;

    const parsedData: CacheData = JSON.parse(cachedData) as CacheData;
    if (now - parsedData.timestamp < CACHE_DURATION) {
      memoryCache = parsedData;
      return parsedData.jobs;
    }
  } catch (err: unknown) {
    console.error("Error reading from localStorage:", err);
  }

  return null;
};

const saveJobsCache = (jobs: Job[]): void => {
  const cacheData: CacheData = {
    jobs,
    timestamp: Date.now(),
  };

  memoryCache = cacheData;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (err: unknown) {
    console.error("Error saving to localStorage:", err);
  }
};

const fetchJobsFromApi = async (): Promise<Job[]> => {
  const response: Job[] = (await api.get("/jellypolly/api/jobs")) as Job[];

  if (!Array.isArray(response)) {
    throw new Error("Invalid response format from API");
  }

  const normalizedJobs: Job[] = normalizeJobs(response);
  saveJobsCache(normalizedJobs);
  return normalizedJobs;
};

const getJobsRequest = (force: boolean): Promise<Job[]> => {
  if (!force && pendingJobsRequest) {
    return pendingJobsRequest;
  }

  const request: Promise<Job[]> = fetchJobsFromApi();
  pendingJobsRequest = request;
  request.then(
    (): void => {
      if (pendingJobsRequest === request) {
        pendingJobsRequest = null;
      }
    },
    (): void => {
      if (pendingJobsRequest === request) {
        pendingJobsRequest = null;
      }
    }
  );

  return request;
};

export const useJPJobsCache = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchJobs = useCallback(async (force: boolean = false): Promise<void> => {
    if (!force) {
      const cachedJobs: Job[] | null = getFreshCachedJobs();
      if (cachedJobs) {
        setJobs(cachedJobs);
        setLoading(false);
        setError(null);
        return;
      }
    }

    setLoading(true);
    try {
      const normalizedJobs: Job[] = await getJobsRequest(force);
      setJobs(normalizedJobs);
      setError(null);
    } catch (err: unknown) {
      console.error("Error fetching jobs data:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch jobs data"));
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
