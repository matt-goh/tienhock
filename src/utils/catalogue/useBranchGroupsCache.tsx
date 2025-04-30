// src/utils/catalogue/useBranchGroupsCache.tsx
import { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

interface BranchMember {
  customer_id: string;
  customer_name: string;
  is_main_branch: boolean;
}

export interface BranchGroup {
  id: number;
  group_name: string;
  branches: BranchMember[];
}

interface CachedBranchGroups {
  data: BranchGroup[];
  timestamp: number;
}

const CACHE_KEY = "branch_groups_cache";
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const BRANCH_GROUPS_UPDATED_EVENT = "branch-groups-updated";

// Create a global function to trigger cache refresh
export const refreshBranchGroupsCache = async () => {
  try {
    // Remove the current cache
    localStorage.removeItem(CACHE_KEY);

    // Fetch new data
    const response = await api.get("/api/customer-branches/all");
    const data = response.groups || [];

    // Store in cache
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    // Dispatch event to notify subscribers
    window.dispatchEvent(
      new CustomEvent(BRANCH_GROUPS_UPDATED_EVENT, { detail: data })
    );
  } catch (error) {
    console.error("Error refreshing branch groups cache:", error);
  }
};

// Expose this to make it globally available
if (typeof window !== "undefined") {
  // @ts-ignore
  window.refreshBranchGroupsCache = refreshBranchGroupsCache;
}

export const useBranchGroupsCache = () => {
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Create a customer-to-group lookup map
  const customerBranchMap = useMemo(() => {
    const map: Record<
      string,
      {
        groupId: number;
        groupName: string;
        isMainBranch: boolean;
      }
    > = {};

    branchGroups.forEach((group) => {
      group.branches.forEach((branch) => {
        map[branch.customer_id] = {
          groupId: group.id,
          groupName: group.group_name,
          isMainBranch: branch.is_main_branch,
        };
      });
    });

    return map;
  }, [branchGroups]);

  const fetchBranchGroups = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // Skip cache if force refresh is requested
      if (!forceRefresh) {
        // Check cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const { data, timestamp }: CachedBranchGroups =
            JSON.parse(cachedData);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setBranchGroups(data);
            setIsLoading(false);
            setError(null);
            return data;
          }
        }
      }

      // If cache is missing, expired, or force refresh is requested, fetch fresh data
      const response = await api.get("/api/customer-branches/all");
      const data = response.groups || [];

      // Update cache
      const cacheData: CachedBranchGroups = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setBranchGroups(data);
      setError(null);
      return data;
    } catch (error) {
      console.error("Error fetching branch groups:", error);
      const err =
        error instanceof Error
          ? error
          : new Error("Failed to fetch branch groups");
      setError(err);
      if (!forceRefresh) {
        // Only show toast for initial loads, not background refreshes
        toast.error("Error fetching branch group data");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchBranchGroups();
  }, []);

  // Listen for branch group updates
  useEffect(() => {
    const handleBranchGroupsUpdated = (event: CustomEvent) => {
      // If event contains data, use it directly
      if (event.detail) {
        setBranchGroups(event.detail);
      } else {
        // Otherwise refresh from cache or API
        fetchBranchGroups(true);
      }
    };

    window.addEventListener(
      BRANCH_GROUPS_UPDATED_EVENT,
      handleBranchGroupsUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        BRANCH_GROUPS_UPDATED_EVENT,
        handleBranchGroupsUpdated as EventListener
      );
    };
  }, []);

  // Helper to get branch info for a specific customer
  const getCustomerBranchInfo = (customerId: string) => {
    if (!customerId) return null;

    // Check if customer is in any branch group
    const branchInfo = customerBranchMap[customerId];
    if (!branchInfo) return null;

    // Find the group this customer belongs to
    const group = branchGroups.find((g) => g.id === branchInfo.groupId);
    if (!group) return null;

    return {
      isInBranchGroup: true,
      isMainBranch: branchInfo.isMainBranch,
      groupName: group.group_name,
      groupId: group.id,
      branches: group.branches.map((b) => ({
        id: b.customer_id,
        name: b.customer_name,
        isMain: b.is_main_branch,
      })),
    };
  };

  const invalidateCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  const refreshBranchGroups = async () => {
    return fetchBranchGroups(true);
  };

  return {
    branchGroups,
    customerBranchMap,
    getCustomerBranchInfo,
    isLoading,
    error,
    invalidateCache,
    refreshBranchGroups,
  };
};
