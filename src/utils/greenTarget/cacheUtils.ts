interface CacheItem<T> {
  data: T;
  expiry: number;
}

export const CACHE_KEYS = {
  CUSTOMERS: "greentarget_customers",
};

export const CACHE_EXPIRY = {
  CUSTOMERS: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
};

export const getCachedData = <T>(cacheKey: string): T | null => {
  try {
    const cachedItem = localStorage.getItem(cacheKey);
    if (!cachedItem) return null;

    const item: CacheItem<T> = JSON.parse(cachedItem);

    // Check if cache is expired
    if (item.expiry < Date.now()) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return item.data;
  } catch (error) {
    console.error(`Error retrieving cached data for ${cacheKey}:`, error);
    return null;
  }
};

export const setCachedData = <T>(
  cacheKey: string,
  data: T,
  expiryMs: number
): void => {
  try {
    const item: CacheItem<T> = {
      data,
      expiry: Date.now() + expiryMs,
    };

    localStorage.setItem(cacheKey, JSON.stringify(item));
  } catch (error) {
    console.error(`Error setting cached data for ${cacheKey}:`, error);
  }
};

export const invalidateCache = (cacheKey: string): void => {
  try {
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.error(`Error invalidating cache for ${cacheKey}:`, error);
  }
};
