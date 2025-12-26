// src/utils/accounting/useAccountingCache.ts
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { AccountCode, LedgerType, JournalEntryTypeInfo } from "../../types/types";

// Cache configuration
const CACHE_KEYS = {
  ACCOUNT_CODES: "accounting_account_codes_cache",
  LEDGER_TYPES: "accounting_ledger_types_cache",
  JOURNAL_ENTRY_TYPES: "accounting_journal_entry_types_cache",
};

const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour in milliseconds

// Event names for cache updates
const ACCOUNT_CODES_UPDATED_EVENT = "account-codes-updated";
const LEDGER_TYPES_UPDATED_EVENT = "ledger-types-updated";
const JOURNAL_ENTRY_TYPES_UPDATED_EVENT = "journal-entry-types-updated";

// Cache item interface
interface CacheItem<T> {
  data: T;
  timestamp: number;
}

// ==================== Account Codes Cache ====================

interface AccountCodesCache {
  data: AccountCode[];
  timestamp: number;
}

/**
 * Refresh account codes cache globally
 */
export const refreshAccountCodesCache = async (): Promise<AccountCode[]> => {
  try {
    localStorage.removeItem(CACHE_KEYS.ACCOUNT_CODES);

    const data = await api.get("/api/account-codes?flat=true") as AccountCode[];

    const cacheData: AccountCodesCache = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.ACCOUNT_CODES, JSON.stringify(cacheData));

    window.dispatchEvent(
      new CustomEvent(ACCOUNT_CODES_UPDATED_EVENT, { detail: data })
    );

    return data;
  } catch (error) {
    console.error("Error refreshing account codes cache:", error);
    throw error;
  }
};

/**
 * Invalidate account codes cache
 */
export const invalidateAccountCodesCache = (): void => {
  localStorage.removeItem(CACHE_KEYS.ACCOUNT_CODES);
  window.dispatchEvent(new CustomEvent(ACCOUNT_CODES_UPDATED_EVENT));
};

/**
 * Hook for account codes with caching
 */
export const useAccountCodesCache = () => {
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAccountCodes = useCallback(async (forceRefresh = false): Promise<AccountCode[]> => {
    setIsLoading(true);
    try {
      if (!forceRefresh) {
        const cachedData = localStorage.getItem(CACHE_KEYS.ACCOUNT_CODES);
        if (cachedData) {
          const { data, timestamp }: AccountCodesCache = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setAccountCodes(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      const data = await api.get("/api/account-codes?flat=true") as AccountCode[];

      const cacheData: AccountCodesCache = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEYS.ACCOUNT_CODES, JSON.stringify(cacheData));

      setAccountCodes(data);
      setError(null);
      return data;
    } catch (err) {
      console.error("Error fetching account codes:", err);
      const error = err instanceof Error ? err : new Error("Failed to fetch account codes");
      setError(error);
      if (!forceRefresh) {
        toast.error("Error fetching account codes");
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccountCodes();
  }, [fetchAccountCodes]);

  useEffect(() => {
    const handleAccountCodesUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setAccountCodes(event.detail);
      } else {
        fetchAccountCodes(true);
      }
    };

    window.addEventListener(
      ACCOUNT_CODES_UPDATED_EVENT,
      handleAccountCodesUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        ACCOUNT_CODES_UPDATED_EVENT,
        handleAccountCodesUpdated as EventListener
      );
    };
  }, [fetchAccountCodes]);

  return {
    accountCodes,
    isLoading,
    error,
    refreshAccountCodes: () => fetchAccountCodes(true),
    invalidateCache: invalidateAccountCodesCache,
  };
};

// ==================== Ledger Types Cache ====================

interface LedgerTypesCache {
  data: LedgerType[];
  timestamp: number;
}

/**
 * Refresh ledger types cache globally
 */
export const refreshLedgerTypesCache = async (): Promise<LedgerType[]> => {
  try {
    localStorage.removeItem(CACHE_KEYS.LEDGER_TYPES);

    const data = await api.get("/api/ledger-types") as LedgerType[];

    const cacheData: LedgerTypesCache = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.LEDGER_TYPES, JSON.stringify(cacheData));

    window.dispatchEvent(
      new CustomEvent(LEDGER_TYPES_UPDATED_EVENT, { detail: data })
    );

    return data;
  } catch (error) {
    console.error("Error refreshing ledger types cache:", error);
    throw error;
  }
};

/**
 * Invalidate ledger types cache
 */
export const invalidateLedgerTypesCache = (): void => {
  localStorage.removeItem(CACHE_KEYS.LEDGER_TYPES);
  window.dispatchEvent(new CustomEvent(LEDGER_TYPES_UPDATED_EVENT));
};

/**
 * Hook for ledger types with caching
 */
export const useLedgerTypesCache = () => {
  const [ledgerTypes, setLedgerTypes] = useState<LedgerType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLedgerTypes = useCallback(async (forceRefresh = false): Promise<LedgerType[]> => {
    setIsLoading(true);
    try {
      if (!forceRefresh) {
        const cachedData = localStorage.getItem(CACHE_KEYS.LEDGER_TYPES);
        if (cachedData) {
          const { data, timestamp }: LedgerTypesCache = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setLedgerTypes(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      const data = await api.get("/api/ledger-types") as LedgerType[];

      const cacheData: LedgerTypesCache = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEYS.LEDGER_TYPES, JSON.stringify(cacheData));

      setLedgerTypes(data);
      setError(null);
      return data;
    } catch (err) {
      console.error("Error fetching ledger types:", err);
      const error = err instanceof Error ? err : new Error("Failed to fetch ledger types");
      setError(error);
      if (!forceRefresh) {
        toast.error("Error fetching ledger types");
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLedgerTypes();
  }, [fetchLedgerTypes]);

  useEffect(() => {
    const handleLedgerTypesUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setLedgerTypes(event.detail);
      } else {
        fetchLedgerTypes(true);
      }
    };

    window.addEventListener(
      LEDGER_TYPES_UPDATED_EVENT,
      handleLedgerTypesUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        LEDGER_TYPES_UPDATED_EVENT,
        handleLedgerTypesUpdated as EventListener
      );
    };
  }, [fetchLedgerTypes]);

  return {
    ledgerTypes,
    isLoading,
    error,
    refreshLedgerTypes: () => fetchLedgerTypes(true),
    invalidateCache: invalidateLedgerTypesCache,
  };
};

// ==================== Journal Entry Types Cache ====================

interface JournalEntryTypesCache {
  data: JournalEntryTypeInfo[];
  timestamp: number;
}

/**
 * Refresh journal entry types cache globally
 */
export const refreshJournalEntryTypesCache = async (): Promise<JournalEntryTypeInfo[]> => {
  try {
    localStorage.removeItem(CACHE_KEYS.JOURNAL_ENTRY_TYPES);

    const data = await api.get("/api/journal-entries/types") as JournalEntryTypeInfo[];

    const cacheData: JournalEntryTypesCache = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.JOURNAL_ENTRY_TYPES, JSON.stringify(cacheData));

    window.dispatchEvent(
      new CustomEvent(JOURNAL_ENTRY_TYPES_UPDATED_EVENT, { detail: data })
    );

    return data;
  } catch (error) {
    console.error("Error refreshing journal entry types cache:", error);
    throw error;
  }
};

/**
 * Invalidate journal entry types cache
 */
export const invalidateJournalEntryTypesCache = (): void => {
  localStorage.removeItem(CACHE_KEYS.JOURNAL_ENTRY_TYPES);
  window.dispatchEvent(new CustomEvent(JOURNAL_ENTRY_TYPES_UPDATED_EVENT));
};

/**
 * Hook for journal entry types with caching
 */
export const useJournalEntryTypesCache = () => {
  const [entryTypes, setEntryTypes] = useState<JournalEntryTypeInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEntryTypes = useCallback(async (forceRefresh = false): Promise<JournalEntryTypeInfo[]> => {
    setIsLoading(true);
    try {
      if (!forceRefresh) {
        const cachedData = localStorage.getItem(CACHE_KEYS.JOURNAL_ENTRY_TYPES);
        if (cachedData) {
          const { data, timestamp }: JournalEntryTypesCache = JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setEntryTypes(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      const data = await api.get("/api/journal-entries/types") as JournalEntryTypeInfo[];

      const cacheData: JournalEntryTypesCache = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEYS.JOURNAL_ENTRY_TYPES, JSON.stringify(cacheData));

      setEntryTypes(data);
      setError(null);
      return data;
    } catch (err) {
      console.error("Error fetching journal entry types:", err);
      const error = err instanceof Error ? err : new Error("Failed to fetch journal entry types");
      setError(error);
      if (!forceRefresh) {
        toast.error("Error fetching journal entry types");
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntryTypes();
  }, [fetchEntryTypes]);

  useEffect(() => {
    const handleEntryTypesUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setEntryTypes(event.detail);
      } else {
        fetchEntryTypes(true);
      }
    };

    window.addEventListener(
      JOURNAL_ENTRY_TYPES_UPDATED_EVENT,
      handleEntryTypesUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        JOURNAL_ENTRY_TYPES_UPDATED_EVENT,
        handleEntryTypesUpdated as EventListener
      );
    };
  }, [fetchEntryTypes]);

  return {
    entryTypes,
    isLoading,
    error,
    refreshEntryTypes: () => fetchEntryTypes(true),
    invalidateCache: invalidateJournalEntryTypesCache,
  };
};

// ==================== Combined Hook ====================

/**
 * Combined hook for all accounting cache data
 * Use this when you need multiple types of accounting data
 */
export const useAccountingCache = () => {
  const accountCodesCache = useAccountCodesCache();
  const ledgerTypesCache = useLedgerTypesCache();
  const entryTypesCache = useJournalEntryTypesCache();

  const isLoading = accountCodesCache.isLoading || ledgerTypesCache.isLoading || entryTypesCache.isLoading;

  const refreshAll = async () => {
    await Promise.all([
      accountCodesCache.refreshAccountCodes(),
      ledgerTypesCache.refreshLedgerTypes(),
      entryTypesCache.refreshEntryTypes(),
    ]);
  };

  const invalidateAll = () => {
    accountCodesCache.invalidateCache();
    ledgerTypesCache.invalidateCache();
    entryTypesCache.invalidateCache();
  };

  return {
    accountCodes: accountCodesCache.accountCodes,
    ledgerTypes: ledgerTypesCache.ledgerTypes,
    entryTypes: entryTypesCache.entryTypes,
    isLoading,
    accountCodesLoading: accountCodesCache.isLoading,
    ledgerTypesLoading: ledgerTypesCache.isLoading,
    entryTypesLoading: entryTypesCache.isLoading,
    refreshAccountCodes: accountCodesCache.refreshAccountCodes,
    refreshLedgerTypes: ledgerTypesCache.refreshLedgerTypes,
    refreshEntryTypes: entryTypesCache.refreshEntryTypes,
    refreshAll,
    invalidateAll,
  };
};

// Expose global refresh functions for use outside React components
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshAccountCodesCache = refreshAccountCodesCache;
  // @ts-ignore
  window.refreshLedgerTypesCache = refreshLedgerTypesCache;
  // @ts-ignore
  window.refreshJournalEntryTypesCache = refreshJournalEntryTypesCache;
}