// src/components/Invoice/InvoiceFilterMenu.tsx
import React, { useState, useRef, useEffect, Fragment } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxOption,
  ComboboxOptions,
  Transition,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  DialogTitle,
  Dialog,
} from "@headlessui/react";
import {
  IconFilter,
  IconSquareCheckFilled,
  IconSquare,
  IconChevronDown,
  IconCheck,
  IconX,
  IconTrash,
} from "@tabler/icons-react";
import { InvoiceFilters } from "../../types/types";
import Button from "../Button";
import { CustomerCombobox } from "./CustomerCombobox";
import { useCustomersCache } from "../../utils/catalogue/useCustomerCache";

type InvoiceFilterMenuProps = {
  onFilterChange: (filters: InvoiceFilters) => void;
  currentFilters: InvoiceFilters;
  salesmanOptions: Array<{ id: string; name: string }>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  activeFilterCount?: number;
  hasViewedFilters?: boolean;
};

const InvoiceFilterMenu: React.FC<InvoiceFilterMenuProps> = ({
  onFilterChange,
  currentFilters,
  salesmanOptions,
  onMouseEnter,
  onMouseLeave,
  activeFilterCount,
  hasViewedFilters,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // --- State for pending filter changes ---
  const [pendingFilters, setPendingFilters] =
    useState<InvoiceFilters>(currentFilters);

  // --- Cached Options (no change needed here) ---
  const [cachedSalesmanOptions, setCachedSalesmanOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const { customers, isLoading: isLoadingCustomers } = useCustomersCache();
  const [customerQuery, setCustomerQuery] = useState("");
  const [displayedCustomers, setDisplayedCustomers] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [customerPage, setCustomerPage] = useState(1);
  const CUSTOMERS_PER_PAGE = 50;

  const invoiceStatusOptions = [
    { id: "paid", name: "Paid" },
    { id: "Unpaid", name: "Unpaid" },
    { id: "cancelled", name: "Cancelled" },
    { id: "Overdue", name: "Overdue" },
  ];

  const eInvoiceStatusOptions = [
    { id: "valid", name: "Valid" },
    { id: "pending", name: "Pending" },
    { id: "invalid", name: "Invalid" },
    { id: "cancelled", name: "Cancelled" },
    { id: "null", name: "Not Submitted" },
  ];

  // --- Effects to cache options (no change needed) ---
  useEffect(() => {
    const uniqueSalesmen = salesmanOptions.filter(
      (salesman, index, self) =>
        index === self.findIndex((s) => s.id === salesman.id)
    );
    setCachedSalesmanOptions(uniqueSalesmen);
  }, [salesmanOptions]);

  useEffect(() => {
    const filtered = customerQuery
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
            c.id.toLowerCase().includes(customerQuery.toLowerCase())
        )
      : customers;

    const startIndex = 0;
    const endIndex = customerPage * CUSTOMERS_PER_PAGE;
    setDisplayedCustomers(
      filtered.slice(startIndex, endIndex).map((c) => ({
        id: c.id,
        name: c.name,
      }))
    );
  }, [customers, customerQuery, customerPage]);

  // --- Effect to reset pendingFilters when menu opens or external filters change ---
  useEffect(() => {
    if (isOpen) {
      // When menu opens, reset pending state to match currently applied filters
      setPendingFilters(currentFilters);
    }
  }, [isOpen, currentFilters]);

  // --- Handler to update PENDING filters ---
  const handlePendingFilterChange = (key: keyof InvoiceFilters, value: any) => {
    setPendingFilters((prev) => ({ ...prev, [key]: value }));
  };

  // --- Specific handlers using the pending state ---
  const handleSalesmanSelection = (selectedIds: string[]) => {
    // Map IDs back to names for storage in pendingFilters state
    const selectedNames = selectedIds
      .map((id) => cachedSalesmanOptions.find((s) => s.id === id)?.name)
      .filter((name): name is string => name !== undefined);
    handlePendingFilterChange("salespersonId", selectedNames);
  };

  // Function to remove a single tag (updates pending state)
  const removePendingSalesman = (salesmanNameToRemove: string) => {
    const currentSelection = pendingFilters.salespersonId ?? [];
    handlePendingFilterChange(
      "salespersonId",
      currentSelection.filter((name) => name !== salesmanNameToRemove)
    );
  };

  // --- Function to clear PENDING filters ---
  const clearPendingFilters = () => {
    const clearedPending: InvoiceFilters = {
      // Reset to initial/default state, keep date range from *original* filters
      dateRange: currentFilters.dateRange, // Preserve date range from applied filters
      salespersonId: null,
      customerId: null,
      paymentType: null,
      invoiceStatus: ["paid", "Unpaid", "Overdue", "cancelled"], // Default invoice status
      eInvoiceStatus: [], // Default e-invoice status
      consolidation: "all",
    };
    setPendingFilters(clearedPending);
  };

  // --- Function to APPLY pending filters ---
  const applyFilters = () => {
    onFilterChange(pendingFilters); // Send the complete pending state
    setIsOpen(false); // Close the menu
  };

  // --- Effect for closing menu on outside click (no change needed) ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Don't apply changes, just close
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // --- Helper to get selected IDs for Combobox value prop ---
  const getSelectedSalesmanIds = () => {
    return (
      pendingFilters.salespersonId
        ?.map(
          (name) => cachedSalesmanOptions.find((opt) => opt.name === name)?.id
        )
        .filter((id): id is string => id !== undefined) ?? []
    );
  };

  // --- Render ---
  return (
    <div className="relative inline-block text-left w-full md:w-auto">
      <Button
        onClick={() => setIsOpen(true)} // Changed to just set open, not toggle
        icon={IconFilter}
        variant="outline"
        className="relative w-full md:w-auto rounded-lg h-10"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        Filter
      </Button>
      {(activeFilterCount ?? 0) > 0 && !hasViewedFilters && (
        <span className="absolute -top-1 -right-1 bg-sky-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
          {activeFilterCount}
        </span>
      )}

      {/* Modal Dialog */}
      <Dialog
        as="div"
        className="fixed inset-0 overflow-y-auto z-50"
        open={isOpen}
        onClose={() => setIsOpen(false)}
      >
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm"
          aria-hidden="true"
        />
        <div className="flex items-center justify-center min-h-screen relative">
          <Transition
            show={isOpen}
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="relative bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full mx-4 p-6 shadow-xl">
              <div className="flex justify-between items-center mb-5">
                <DialogTitle
                  as="h3"
                  className="text-xl font-semibold text-default-800 dark:text-gray-100"
                >
                  Filter Invoices
                </DialogTitle>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-full hover:bg-default-100 dark:hover:bg-gray-700 text-default-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200 transition-colors"
                >
                  <IconX size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Salesman Filter */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-200">
                    Salesperson
                  </label>
                  <Combobox
                    multiple
                    value={getSelectedSalesmanIds()}
                    onChange={handleSalesmanSelection}
                  >
                    <div className="relative">
                      <div className="flex items-center">
                        <div className="relative w-full">
                          <ComboboxButton className="w-full text-left py-2 pl-3 pr-4 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg flex items-center justify-between">
                            <span className="block truncate">
                              {pendingFilters.salespersonId &&
                              pendingFilters.salespersonId.length > 0
                                ? `${pendingFilters.salespersonId.length} selected`
                                : "Select salesman"}
                            </span>
                            <IconChevronDown
                              className="text-default-400 dark:text-gray-500 ml-2"
                              size={18}
                            />
                          </ComboboxButton>

                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-700 focus:outline-none text-sm">
                              {cachedSalesmanOptions.length === 0 ? (
                                <div className="relative cursor-default select-none py-2 px-4 text-default-500 dark:text-gray-400">
                                  No salesmen found
                                </div>
                              ) : (
                                cachedSalesmanOptions.map((option) => (
                                  <ComboboxOption
                                    key={option.id}
                                    className={({ active }) =>
                                      `relative cursor-pointer select-none py-2 pl-3 pr-9 ${
                                        active
                                          ? "bg-sky-100 dark:bg-sky-900 text-sky-900 dark:text-sky-100"
                                          : "text-default-900 dark:text-gray-100"
                                      }`
                                    }
                                    value={option.id}
                                  >
                                    {({ selected, active }) => (
                                      <>
                                        <span
                                          className={`block truncate ${
                                            selected
                                              ? "font-medium"
                                              : "font-normal"
                                          }`}
                                        >
                                          {option.name}
                                        </span>
                                        {selected ? (
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-sky-600 dark:text-sky-400">
                                            <IconCheck size={18} stroke={2.5} />
                                          </span>
                                        ) : null}
                                      </>
                                    )}
                                  </ComboboxOption>
                                ))
                              )}
                            </ComboboxOptions>
                          </Transition>
                        </div>
                      </div>
                    </div>
                  </Combobox>

                  {/* Display selected salespeople */}
                  {pendingFilters.salespersonId &&
                    pendingFilters.salespersonId.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {pendingFilters.salespersonId.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300"
                          >
                            {name}
                            <button
                              type="button"
                              className="ml-1 p-0.5 text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-200 rounded-full hover:bg-sky-200 dark:hover:bg-sky-800 focus:outline-none"
                              onClick={() => removePendingSalesman(name)}
                            >
                              <IconX size={12} stroke={2.5} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                </div>

                {/* Customer Filter */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-200">
                    Customer
                  </label>
                  <CustomerCombobox
                    name="customer"
                    label=""
                    value={
                      pendingFilters.customerId
                        ? {
                            id: pendingFilters.customerId,
                            name:
                              customers.find(
                                (c) => c.id === pendingFilters.customerId
                              )?.name || pendingFilters.customerId,
                          }
                        : null
                    }
                    onChange={(selected) =>
                      handlePendingFilterChange(
                        "customerId",
                        selected?.id || null
                      )
                    }
                    options={displayedCustomers}
                    query={customerQuery}
                    setQuery={setCustomerQuery}
                    onLoadMore={() => setCustomerPage((prev) => prev + 1)}
                    hasMore={displayedCustomers.length < customers.length}
                    isLoading={isLoadingCustomers}
                    placeholder="Search or select customer..."
                  />
                </div>

                {/* Payment Type Filter */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-200">
                    Payment Type
                  </label>
                  <div className="flex items-center">
                    <Listbox
                      value={pendingFilters.paymentType}
                      onChange={(value) =>
                        handlePendingFilterChange("paymentType", value)
                      }
                    >
                      <div className="relative w-full">
                        <ListboxButton className="w-full text-left py-2 pl-3 pr-4 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg flex items-center justify-between">
                          <span className="block truncate">
                            {pendingFilters.paymentType === "Cash"
                              ? "Cash Sales"
                              : pendingFilters.paymentType === "Invoice"
                              ? "Invoice Sales"
                              : "All Types"}
                          </span>
                          <IconChevronDown
                            className="text-default-400 ml-2"
                            size={18}
                          />
                        </ListboxButton>

                        <Transition
                          as={Fragment}
                          leave="transition ease-in duration-100"
                          leaveFrom="opacity-100"
                          leaveTo="opacity-0"
                        >
                          <ListboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-700 focus:outline-none text-sm">
                            {[
                              { id: null, name: "All Types" },
                              { id: "Cash", name: "Cash Sales" },
                              { id: "Invoice", name: "Invoice Sales" },
                            ].map((option) => (
                              <ListboxOption
                                key={option.id ?? "all"}
                                className={({ active }) =>
                                  `relative cursor-pointer select-none py-2 pl-3 pr-9 ${
                                    active
                                      ? "bg-sky-100 dark:bg-sky-900 text-sky-900 dark:text-sky-100"
                                      : "text-default-900 dark:text-gray-100"
                                  }`
                                }
                                value={option.id}
                              >
                                {({ selected, active }) => (
                                  <>
                                    <span
                                      className={`block truncate ${
                                        selected ? "font-medium" : "font-normal"
                                      }`}
                                    >
                                      {option.name}
                                    </span>
                                    {selected ? (
                                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-sky-600">
                                        <IconCheck size={18} stroke={2.5} />
                                      </span>
                                    ) : null}
                                  </>
                                )}
                              </ListboxOption>
                            ))}
                          </ListboxOptions>
                        </Transition>
                      </div>
                    </Listbox>
                  </div>
                </div>

                {/* Invoice Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Invoice Status
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {invoiceStatusOptions.map((status) => (
                      <label
                        key={status.id}
                        className="inline-flex items-center group cursor-pointer py-2"
                      >
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={
                              pendingFilters.invoiceStatus?.includes(
                                status.id
                              ) || false
                            }
                            onChange={(e) => {
                              const updatedStatuses = e.target.checked
                                ? [
                                    ...(pendingFilters.invoiceStatus || []),
                                    status.id,
                                  ]
                                : (pendingFilters.invoiceStatus || []).filter(
                                    (s) => s !== status.id
                                  );
                              handlePendingFilterChange(
                                "invoiceStatus",
                                updatedStatuses
                              );
                            }}
                          />
                          {pendingFilters.invoiceStatus?.includes(status.id) ? (
                            <IconSquareCheckFilled
                              className="text-sky-500"
                              size={20}
                            />
                          ) : (
                            <IconSquare
                              className="text-default-300 dark:text-gray-600 transition-colors"
                              size={20}
                            />
                          )}
                        </div>
                        <span className="ml-2 text-gray-700 dark:text-gray-300">{status.name}</span>
                      </label>
                    ))}
                  </div>
                  {/* E-Invoice Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      E-Invoice Status
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {eInvoiceStatusOptions.map((status) => (
                        <label
                          key={status.id}
                          className="inline-flex items-center group cursor-pointer py-2"
                        >
                          <div className="relative flex items-center">
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={
                                pendingFilters.eInvoiceStatus?.includes(
                                  status.id
                                ) || false
                              }
                              onChange={(e) => {
                                const updatedStatuses = e.target.checked
                                  ? [
                                      ...(pendingFilters.eInvoiceStatus || []),
                                      status.id,
                                    ]
                                  : (
                                      pendingFilters.eInvoiceStatus || []
                                    ).filter((s) => s !== status.id);
                                handlePendingFilterChange(
                                  "eInvoiceStatus",
                                  updatedStatuses
                                );
                              }}
                            />
                            {pendingFilters.eInvoiceStatus?.includes(
                              status.id
                            ) ? (
                              <IconSquareCheckFilled
                                className="text-sky-500"
                                size={20}
                              />
                            ) : (
                              <IconSquare
                                className={`text-default-300
                            transition-colors`}
                                size={20}
                              />
                            )}
                          </div>
                          <span className="ml-2 text-gray-700 dark:text-gray-300">{status.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Consolidation Filter */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-200">
                      Consolidation Status
                    </label>
                    <div className="flex flex-col space-y-3 md:flex-row md:space-y-0 md:space-x-6">
                      <label className="inline-flex items-center cursor-pointer">
                        <div className="relative flex items-center">
                          <input
                            type="radio"
                            name="consolidation"
                            className="sr-only"
                            checked={pendingFilters.consolidation === "all"}
                            onChange={() =>
                              handlePendingFilterChange("consolidation", "all")
                            }
                          />
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center mr-2.5 ${
                              pendingFilters.consolidation === "all"
                                ? "border-sky-500 bg-white dark:bg-gray-700"
                                : "border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                            }`}
                          >
                            {pendingFilters.consolidation === "all" && (
                              <div className="w-2.5 h-2.5 rounded-full bg-sky-500"></div>
                            )}
                          </div>
                        </div>
                        <span className="text-default-700 dark:text-gray-300">All</span>
                      </label>
                      <label className="inline-flex items-center cursor-pointer">
                        <div className="relative flex items-center">
                          <input
                            type="radio"
                            name="consolidation"
                            className="sr-only"
                            checked={
                              pendingFilters.consolidation === "individual"
                            }
                            onChange={() =>
                              handlePendingFilterChange(
                                "consolidation",
                                "individual"
                              )
                            }
                          />
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center mr-2.5 ${
                              pendingFilters.consolidation === "individual"
                                ? "border-sky-500 bg-white dark:bg-gray-700"
                                : "border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                            }`}
                          >
                            {pendingFilters.consolidation === "individual" && (
                              <div className="w-2.5 h-2.5 rounded-full bg-sky-500"></div>
                            )}
                          </div>
                        </div>
                        <span className="text-default-700 dark:text-gray-300">Individual</span>
                      </label>
                      <label className="inline-flex items-center cursor-pointer">
                        <div className="relative flex items-center">
                          <input
                            type="radio"
                            name="consolidation"
                            className="sr-only"
                            checked={
                              pendingFilters.consolidation === "consolidated"
                            }
                            onChange={() =>
                              handlePendingFilterChange(
                                "consolidation",
                                "consolidated"
                              )
                            }
                          />
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center mr-2.5 ${
                              pendingFilters.consolidation === "consolidated"
                                ? "border-sky-500 bg-white dark:bg-gray-700"
                                : "border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                            }`}
                          >
                            {pendingFilters.consolidation ===
                              "consolidated" && (
                              <div className="w-2.5 h-2.5 rounded-full bg-sky-500"></div>
                            )}
                          </div>
                        </div>
                        <span className="text-default-700 dark:text-gray-300">Consolidated</span>
                      </label>
                    </div>
                  </div>

                  <div className="mt-8 flex justify-between">
                    <Button
                      onClick={clearPendingFilters}
                      variant="outline"
                      icon={IconTrash}
                      color="default"
                    >
                      Clear Filters
                    </Button>
                    <Button
                      onClick={applyFilters}
                      variant="filled"
                      color="sky"
                      icon={IconFilter}
                    >
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </Dialog>
    </div>
  );
};

export default InvoiceFilterMenu;
