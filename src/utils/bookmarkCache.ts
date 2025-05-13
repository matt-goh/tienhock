// src/utils/bookmarkCache.ts
const BOOKMARKS_CACHE_KEY = "user_bookmarks_cache";
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface BookmarkCache {
  userId: string;
  bookmarks: Array<{ id: number; name: string }>;
  timestamp: number;
}

export const getBookmarksFromCache = (userId: string) => {
  try {
    const cachedData = localStorage.getItem(BOOKMARKS_CACHE_KEY);
    if (!cachedData) return null;

    const cache: BookmarkCache = JSON.parse(cachedData);

    // Return null if cache is for a different user or expired
    if (
      cache.userId !== userId ||
      Date.now() - cache.timestamp > CACHE_EXPIRY
    ) {
      return null;
    }

    return cache.bookmarks;
  } catch (error) {
    console.error("Error reading bookmarks cache:", error);
    return null;
  }
};

export const saveBookmarksToCache = (
  userId: string,
  bookmarks: Array<{ id: number; name: string }>
) => {
  try {
    const cache: BookmarkCache = {
      userId,
      bookmarks,
      timestamp: Date.now(),
    };

    localStorage.setItem(BOOKMARKS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error saving bookmarks to cache:", error);
  }
};

export const invalidateBookmarksCache = () => {
  localStorage.removeItem(BOOKMARKS_CACHE_KEY);
};
