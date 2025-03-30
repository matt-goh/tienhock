// hooks/useCustomerData.ts (structure)
import { useState, useEffect, useCallback, useMemo } from "react";
import { Customer } from "../types/types"; // Adjust path
import { api } from "../routes/utils/api"; // Adjust path
import { debounce } from "lodash";
import toast from "react-hot-toast";

export const useCustomerData = (initialCustomerId?: string) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [totalCustomerPages, setTotalCustomerPages] = useState(1);
  const [isFetchingCustomers, setIsFetchingCustomers] = useState(false);

  // Fetch Logic
  const fetchCustomers = useCallback(
    async (search: string, page: number, append: boolean = false) => {
      setIsFetchingCustomers(true);
      try {
        // TODO: Adjust API endpoint and params as needed
        const params = new URLSearchParams({
          search: search,
          page: page.toString(),
          limit: "20", // Or your desired page size
          // Add other params like salesman if needed
        });
        const data = await api.get(
          `/api/customers/combobox?${params.toString()}`
        ); // Example endpoint

        setCustomers((prev) =>
          append && page > 1 ? [...prev, ...data.customers] : data.customers
        );
        setTotalCustomerPages(data.totalPages);
      } catch (error) {
        console.error("Error fetching customers:", error);
        toast.error("Failed to fetch customers.");
      } finally {
        setIsFetchingCustomers(false);
      }
    },
    []
  );

  // Debounced fetch for searching
  const debouncedFetchCustomers = useMemo(
    () =>
      debounce((search: string) => {
        setCustomerPage(1); // Reset page on new search
        fetchCustomers(search, 1, false);
      }, 300),
    [fetchCustomers]
  );

  // Effect for search query changes
  useEffect(() => {
    debouncedFetchCustomers(customerQuery);
    // Cleanup debounce on unmount
    return () => debouncedFetchCustomers.cancel();
  }, [customerQuery, debouncedFetchCustomers]);

  // Effect to fetch initial customer if ID provided
  useEffect(() => {
    if (initialCustomerId && customers.length > 0 && !selectedCustomer) {
      const initialCust = customers.find(
        (c) => c.id?.toString() === initialCustomerId
      );
      if (initialCust) {
        setSelectedCustomer(initialCust);
      } else {
        // Optional: Fetch the specific customer if not in the initial list
        // fetchSpecificCustomer(initialCustomerId);
      }
    }
  }, [initialCustomerId, customers, selectedCustomer]);

  // Load More Handler
  const loadMoreCustomers = useCallback(() => {
    if (customerPage < totalCustomerPages && !isFetchingCustomers) {
      const nextPage = customerPage + 1;
      setCustomerPage(nextPage);
      fetchCustomers(customerQuery, nextPage, true); // Append results
    }
  }, [
    customerPage,
    totalCustomerPages,
    isFetchingCustomers,
    customerQuery,
    fetchCustomers,
  ]);

  return {
    customers,
    selectedCustomer,
    setSelectedCustomer, // Allow parent to set it directly if needed
    customerQuery,
    setCustomerQuery,
    loadMoreCustomers,
    hasMoreCustomers: customerPage < totalCustomerPages,
    isFetchingCustomers,
  };
};
