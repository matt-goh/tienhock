// src/hooks/useCustomerNames.ts
import { useState, useEffect, useRef } from "react";
import { api } from "../../routes/utils/api";

const CACHE_KEY = "customers_cache"; // Reuse cache key

export const useCustomerNames = (
  customerIds: (string | undefined | null)[]
) => {
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  // Use a ref to track fetched IDs to avoid redundant fetches within the same hook instance
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const uniqueIds = Array.from(
      new Set(customerIds.filter((id): id is string => !!id))
    );

    // Determine which IDs are actually new and need fetching
    const idsToFetch = uniqueIds.filter(
      (id) => !fetchedIdsRef.current.has(id) && !customerNames[id]
    );

    if (idsToFetch.length === 0) {
      return; // All needed names are already fetched or requested
    }

    const fetchNames = async (ids: string[]) => {
      setIsLoading(true);
      let namesFromApi: Record<string, string> = {};
      let namesFromCache: Record<string, string> = {};
      let stillNeedApiFetch: string[] = [...ids];

      // --- Check Local Storage Cache ---
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        try {
          const { data: cachedCustomers } = JSON.parse(cachedData);
          if (Array.isArray(cachedCustomers)) {
            cachedCustomers.forEach((customer) => {
              if (ids.includes(customer.id)) {
                namesFromCache[customer.id] = customer.name;
                // Mark as fetched via cache
                fetchedIdsRef.current.add(customer.id);
                // Remove from API fetch list
                stillNeedApiFetch = stillNeedApiFetch.filter(
                  (fetchId) => fetchId !== customer.id
                );
              }
            });
          }
        } catch (e) {
          console.error("Failed to parse customer cache", e);
        }
      }
      // Update state with cached names immediately
      if (Object.keys(namesFromCache).length > 0) {
        setCustomerNames((prev) => ({ ...prev, ...namesFromCache }));
      }

      // --- Fetch remaining names from API ---
      if (stillNeedApiFetch.length > 0) {
        try {
          namesFromApi = await api.post("/api/customers/names", {
            customerIds: stillNeedApiFetch,
          });
          // Mark fetched IDs
          stillNeedApiFetch.forEach((id) => fetchedIdsRef.current.add(id));
          // Update state with API results
          setCustomerNames((prev) => ({ ...prev, ...namesFromApi }));
        } catch (error) {
          console.error("Error fetching customer names from API:", error);
          // Handle fallback: use ID as name for failed fetches
          const fallback = stillNeedApiFetch.reduce(
            (acc, id) => ({ ...acc, [id]: id }),
            {}
          );
          setCustomerNames((prev) => ({ ...prev, ...fallback }));
          // Mark failed IDs as "fetched" to prevent retrying immediately
          stillNeedApiFetch.forEach((id) => fetchedIdsRef.current.add(id));
        }
      }

      setIsLoading(false);
    };

    fetchNames(idsToFetch);
  }, [customerIds]); // Re-run when the list of IDs changes

  return { customerNames, isLoading };
};
