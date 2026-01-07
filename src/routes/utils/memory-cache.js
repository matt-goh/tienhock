// src/routes/utils/memory-cache.js
// Simple in-memory cache with TTL support for API responses

class MemoryCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get cached value if not expired
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if expired/missing
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Store value with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, value, ttlMs) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    });
  }

  /**
   * Remove specific cache entry
   * @param {string} key - Cache key to remove
   */
  invalidate(key) {
    this.cache.delete(key);
  }

  /**
   * Remove all entries matching a pattern (prefix match)
   * @param {string} prefix - Key prefix to match
   */
  invalidatePrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  stats() {
    let valid = 0;
    let expired = 0;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      if (now > entry.expiry) {
        expired++;
      } else {
        valid++;
      }
    }

    return { valid, expired, total: this.cache.size };
  }
}

// Singleton instance
const cache = new MemoryCache();

// Default TTL values (in milliseconds)
export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000,      // 5 minutes
  MEDIUM: 30 * 60 * 1000,    // 30 minutes
  LONG: 60 * 60 * 1000,      // 1 hour
  VERY_LONG: 12 * 60 * 60 * 1000, // 12 hours
};

// Cache key prefixes for organization
export const CACHE_KEYS = {
  STAFFS: 'staffs',
  PRODUCTS: 'products',
  CUSTOMERS: 'customers',
  PAY_CODES: 'pay_codes',
  JOBS: 'jobs',
  LOCATIONS: 'locations',
  JOB_CATEGORIES: 'job_categories',
};

export default cache;
