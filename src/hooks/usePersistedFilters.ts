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

// Single date selection (day-granularity pickers) that survives navigation.
export function usePersistedDate(
  key: string,
  getDefault: () => Date
): [Date, React.Dispatch<React.SetStateAction<Date>>] {
  return usePersistedFilters<Date>(key, getDefault, (cached) =>
    reviveDate(cached)
  );
}

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

// Reads an integer query param from the current URL, or null when it is absent
// or out of range.
const readUrlNumber = (
  param: string,
  min: number,
  max: number
): number | null => {
  const raw = new URLSearchParams(window.location.search).get(param);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
};

const isNumberInRange = (
  value: unknown,
  min: number,
  max: number
): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

// Persisted numeric filter (the year / month pickers on the payroll add-on
// lists). Unlike `usePersistedNumber`, a query param on the current URL wins on
// mount, so a deep link from a payroll details page still opens the month it
// names instead of the last month the user browsed.
export function usePersistedUrlNumber(
  key: string,
  param: string,
  min: number,
  max: number,
  getDefault: () => number
): [number, React.Dispatch<React.SetStateAction<number>>] {
  return usePersistedFilters<number>(
    key,
    () => readUrlNumber(param, min, max) ?? getDefault(),
    (cached) =>
      readUrlNumber(param, min, max) ??
      (isNumberInRange(cached, min, max) ? cached : null)
  );
}

// Persisted numeric filter with no URL involvement.
export function usePersistedNumber(
  key: string,
  min: number,
  max: number,
  getDefault: () => number
): [number, React.Dispatch<React.SetStateAction<number>>] {
  return usePersistedFilters<number>(key, getDefault, (cached) =>
    isNumberInRange(cached, min, max) ? cached : null
  );
}

// Persisted search box where `?search=` on the current URL wins on mount — the
// payroll details pages deep-link into the add-on lists pre-filtered to one
// employee.
//
// A term that arrived in the URL applies to THAT VISIT ONLY and is deliberately
// never written to storage. A search term silently hides rows, so an old deep
// link must not be able to leave a stale employee name filtering the page on
// the next plain visit. As soon as the user edits the box the value differs from
// the seeded term and persists as normal (including clearing it to ""), and a
// visit with no `?search=` restores whatever the user last typed.
export function usePersistedUrlSearch(
  key: string
): [string, React.Dispatch<React.SetStateAction<string>>] {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  // Read the param once, at mount. These pages rewrite their own query string
  // as the user changes month, so re-reading it later proves nothing.
  const [seededTerm] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("search")?.trim() ?? null
  );

  const [term, setTerm] = useState<string>(() => {
    if (seededTerm !== null) return seededTerm;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed === "string") return parsed;
      }
    } catch (e) {
      console.error(`Error loading cached filters for ${key}:`, e);
    }
    return "";
  });

  // Comparing against the seeded term (rather than skipping the first write via
  // a ref) keeps this idempotent, so React StrictMode's double-invoked effects
  // can't slip the seeded term into storage.
  useEffect(() => {
    if (seededTerm !== null && term === seededTerm) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(term));
    } catch (e) {
      console.error(`Error caching filters for ${storageKey}:`, e);
    }
  }, [storageKey, term, seededTerm]);

  return [term, setTerm];
}

// Persisted search box with no URL involvement.
export function usePersistedSearch(
  key: string
): [string, React.Dispatch<React.SetStateAction<string>>] {
  return usePersistedFilters<string>(
    key,
    () => "",
    (cached) => (typeof cached === "string" ? cached : null)
  );
}

export default usePersistedFilters;
