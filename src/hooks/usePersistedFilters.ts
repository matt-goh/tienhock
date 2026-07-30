// src/hooks/usePersistedFilters.ts
import { useEffect, useState } from "react";

const STORAGE_PREFIX = "filters:";

// Filter state that survives navigation. The value is written to localStorage
// on every change and restored on mount, so returning to a list page (e.g.
// after opening a record) keeps the month, search term and pill selections the
// user had set.
//
// `revive` receives the parsed JSON and must return the filter object,
// rebuilding anything JSON cannot represent (Date fields, Sets). Return null
// to discard a stale/invalid cached value and fall back to `getDefaults`.
export function usePersistedFilters<T>(
  key: string,
  getDefaults: () => T,
  revive?: (cached: any) => T | null
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  const [filters, setFilters] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        const restored: T | null = revive ? revive(parsed) : (parsed as T);
        if (restored !== null && restored !== undefined) return restored;
      }
    } catch (e) {
      console.error(`Error loading cached filters for ${key}:`, e);
    }
    return getDefaults();
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(filters));
    } catch (e) {
      console.error(`Error caching filters for ${storageKey}:`, e);
    }
  }, [storageKey, filters]);

  return [filters, setFilters];
}

// Rebuilds a Date from a cached ISO string, returning null when the cached
// value is missing or unparseable so the caller can fall back to its default.
export const reviveDate = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Month selection (normalised to the 1st of the month at local midnight) that
// survives navigation — the single filter on most of the monthly accounting and
// payroll reports.
export function usePersistedMonth(
  key: string
): [Date, React.Dispatch<React.SetStateAction<Date>>] {
  return usePersistedFilters<Date>(
    key,
    () => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1);
    },
    (cached) => {
      const date = reviveDate(cached);
      return date ? new Date(date.getFullYear(), date.getMonth(), 1) : null;
    }
  );
}

export default usePersistedFilters;
