// src/hooks/useBookmarks.ts
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { useCompany } from "../contexts/CompanyContext";
import { api } from "../routes/utils/api";
import {
  getBookmarksFromCache,
  saveBookmarksToCache,
} from "../utils/bookmarkCache";
import {
  SidebarItem,
  PopoverOption,
  getCompanyRoutes,
} from "../pages/pagesRoute";

export interface Bookmark {
  id: number;
  name: string;
}

export const useBookmarks = () => {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkedItems, setBookmarkedItems] = useState<Set<string>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(false);

  // Get company-specific navigation data
  const navData = getCompanyRoutes(activeCompany);

  // Check if bookmarks should be shown (only for Tien Hock and authenticated users)
  const shouldShowBookmarks = !!user && activeCompany.id === "tienhock";

  // Find a nav item by name (recursive search)
  const findNavItem = useCallback(
    (
      items: SidebarItem[],
      name: string
    ): (SidebarItem & { popoverOptions?: PopoverOption[] }) | null => {
      for (const item of items) {
        if (item.name === name) {
          return item;
        }
        if (item.subItems) {
          const found = findNavItem(item.subItems, name);
          if (found) return found;

          const popoverSubItem = item.subItems.find(
            (subItem) => subItem.showInPopover && subItem.name === name
          );
          if (popoverSubItem) return popoverSubItem;
        }
        if (item.popoverOptions) {
          const found = item.popoverOptions.find(
            (option) => option.name === name
          );
          if (found) return { name: found.name, path: found.path };
        }
      }
      return null;
    },
    []
  );

  // Get popover options for an item
  const getPopoverOptionsForItem = useCallback(
    (item: SidebarItem): PopoverOption[] => {
      const options: PopoverOption[] = [...(item.popoverOptions || [])];

      if (item.subItems) {
        item.subItems.forEach((subItem) => {
          if (subItem.showInPopover && subItem.path) {
            options.push({
              name: subItem.name,
              path: subItem.path,
            });
          }
        });
      }

      return options;
    },
    []
  );

  // Fetch bookmarks from cache or API
  useEffect(() => {
    const fetchBookmarks = async () => {
      if (!user?.id || !shouldShowBookmarks) {
        setBookmarks([]);
        setBookmarkedItems(new Set());
        return;
      }

      setIsLoading(true);
      try {
        // Try to get bookmarks from cache first
        const cachedBookmarks = getBookmarksFromCache(user.id);

        if (cachedBookmarks) {
          setBookmarks(cachedBookmarks);
          setBookmarkedItems(
            new Set(cachedBookmarks.map((bookmark) => bookmark.name))
          );
          setIsLoading(false);
          return;
        }

        // If no cache or expired, fetch from server
        const data = await api.get(`/api/bookmarks/${user.id}`);
        setBookmarks(data);
        setBookmarkedItems(
          new Set(data.map((bookmark: Bookmark) => bookmark.name))
        );

        // Save to cache
        saveBookmarksToCache(user.id, data);
      } catch (error) {
        console.error("Error fetching bookmarks:", error);
        setBookmarks([]);
        setBookmarkedItems(new Set());
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookmarks();
  }, [user?.id, shouldShowBookmarks]);

  // Handle bookmark add/remove
  const handleBookmarkUpdate = useCallback(
    async (name: string, isBookmarked: boolean) => {
      if (!user?.id) return;

      if (isBookmarked) {
        const itemData = findNavItem(navData, name);
        if (!itemData) return;

        // Optimistic update with a temporary id; replaced with the DB id below
        const tempId = Date.now();
        const tempBookmark = { id: tempId, name };
        setBookmarkedItems((prev) => {
          const newSet = new Set(prev);
          newSet.add(name);
          return newSet;
        });
        setBookmarks((prev) => [...prev, tempBookmark]);

        try {
          const saved: Bookmark = await api.post("/api/bookmarks", {
            staffId: user.id,
            name,
          });

          setBookmarks((prev) =>
            prev.map((b) => (b.id === tempId ? { id: saved.id, name } : b))
          );

          const cached = getBookmarksFromCache(user.id) || [];
          saveBookmarksToCache(user.id, [
            ...cached.filter((b) => b.name !== name),
            { id: saved.id, name },
          ]);
        } catch (error) {
          // Revert
          setBookmarkedItems((prev) => {
            const newSet = new Set(prev);
            newSet.delete(name);
            return newSet;
          });
          setBookmarks((prev) => prev.filter((b) => b.id !== tempId));
          console.error("Error adding bookmark:", error);
          toast.error("Failed to add bookmark");
        }
      } else {
        // Snapshot for revert
        const previousBookmarks = bookmarks;
        const updatedBookmarks = bookmarks.filter((b) => b.name !== name);

        setBookmarkedItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(name);
          return newSet;
        });
        setBookmarks(updatedBookmarks);

        try {
          await api.delete(
            `/api/bookmarks/${encodeURIComponent(user.id)}/${encodeURIComponent(name)}`
          );
          saveBookmarksToCache(user.id, updatedBookmarks);
        } catch (error) {
          // Revert
          setBookmarkedItems((prev) => {
            const newSet = new Set(prev);
            newSet.add(name);
            return newSet;
          });
          setBookmarks(previousBookmarks);
          console.error("Error removing bookmark:", error);
          toast.error("Failed to remove bookmark");
        }
      }
    },
    [user?.id, bookmarks, navData, findNavItem]
  );

  // Get bookmark data with nav item info
  const getBookmarkWithItemData = useCallback(
    (bookmark: Bookmark) => {
      const itemData = findNavItem(navData, bookmark.name);
      return itemData ? { ...bookmark, itemData } : null;
    },
    [navData, findNavItem]
  );

  return {
    bookmarks,
    bookmarkedItems,
    isLoading,
    shouldShowBookmarks,
    handleBookmarkUpdate,
    findNavItem,
    getPopoverOptionsForItem,
    getBookmarkWithItemData,
    navData,
  };
};

export default useBookmarks;
