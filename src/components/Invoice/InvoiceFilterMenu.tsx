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
import { InvoiceFilters } from "../../types/types"; // Adjust path if needed
import Button from "../Button"; // Adjust path if needed

interface FilterTagsProps {
  items: string[];
  onRemove: (itemIdToRemove: string) => void; // Changed to remove single item
  label: string; // e.g., "Salesman", "Customer"
}

// Generic Tag Component for displaying selected items
const SelectedFilterTags: React.FC<FilterTagsProps> = ({
  items,
  onRemove,
  label,
}) => (
  <div className="px-2.5 pt-1 pb-1">
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={`${label}-${item}`}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 cursor-default" // cursor-default as click handled by button
        >
          {item}
          <button
            type="button"
            className="ml-1 p-0.5 text-sky-600 hover:text-sky-800 rounded-full hover:bg-sky-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            onClick={(e) => {
              e.stopPropagation(); // Prevent menu closing if needed
              onRemove(item);
            }}
            aria-label={`Remove ${item}`}
          >
            <IconX size={12} stroke={2.5} />
          </button>
        </span>
      ))}
    </div>
  </div>
);

type InvoiceFilterMenuProps = {
  onFilterChange: (filters: InvoiceFilters) => void; // Changed to accept full InvoiceFilters
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

  const invoiceStatusOptions = [
    { id: "paid", name: "Paid" },
    { id: "Unpaid", name: "Unpaid" },
    { id: "cancelled", name: "Cancelled" },
    { id: "overdue", name: "Overdue" },
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

  // Function to remove single status tags
  const removePendingInvoiceStatus = (statusToRemove: string) => {
    const currentSelection = pendingFilters.invoiceStatus ?? [];
    handlePendingFilterChange(
      "invoiceStatus",
      currentSelection.filter((status) => status !== statusToRemove)
    );
  };

  const removePendingEInvoiceStatus = (statusToRemove: string) => {
    const currentSelection = pendingFilters.eInvoiceStatus ?? [];
    handlePendingFilterChange(
      "eInvoiceStatus",
      currentSelection.filter((status) => status !== statusToRemove)
    );
  };

  // --- Function to clear PENDING filters ---
  const clearPendingFilters = () => {
    const clearedPending: InvoiceFilters = {
      // Reset to initial/default state, keep date range from *original* filters
      dateRange: currentFilters.dateRange, // Preserve date range from applied filters
      salespersonId: null,
      paymentType: null,
      invoiceStatus: ["paid", "Unpaid", "overdue"], // Default invoice status
      eInvoiceStatus: [], // Default e-invoice status
    };
    setPendingFilters(clearedPending);
  };

  // --- Function to APPLY pending filters ---
  const applyFilters = () => {
    onFilterChange(pendingFilters); // Send the complete pending state
    setIsOpen(false); // Close the menu
  };

  // --- Function to CANCEL changes ---
  const cancelFilters = () => {
    setIsOpen(false); // Just close the menu, pending changes are discarded implicitly
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
        className="relative w-full md:w-auto"
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
            <div className="relative bg-white rounded-lg max-w-2xl w-full mx-4 p-6 shadow-xl">
              <div className="flex justify-between items-center mb-5">
                <DialogTitle
                  as="h3"
                  className="text-xl font-semibold text-default-800"
                >
                  Filter Invoices
                </DialogTitle>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-full hover:bg-default-100 text-default-500 hover:text-default-700 transition-colors"
                >
                  <IconX size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Salesman Filter */}
                <div>
                  <label className="block text-sm font-medium mb-1">
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
                          <ComboboxButton className="w-full text-left py-2 pl-3 pr-4 border border-default-300 rounded-lg flex items-center justify-between">
                            <span className="block truncate">
                              {pendingFilters.salespersonId &&
                              pendingFilters.salespersonId.length > 0
                                ? `${pendingFilters.salespersonId.length} selected`
                                : "Select salesman"}
                            </span>
                            <IconChevronDown
                              className="text-default-400 ml-2"
                              size={18}
                            />
                          </ComboboxButton>

                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-sm">
                              {cachedSalesmanOptions.length === 0 ? (
                                <div className="relative cursor-default select-none py-2 px-4 text-default-500">
                                  No salesmen found
                                </div>
                              ) : (
                                cachedSalesmanOptions.map((option) => (
                                  <ComboboxOption
                                    key={option.id}
                                    className={({ active }) =>
                                      `relative cursor-pointer select-none py-2 pl-3 pr-9 ${
                                        active
                                          ? "bg-sky-100 text-sky-900"
                                          : "text-default-900"
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
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-sky-600">
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
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800"
                          >
                            {name}
                            <button
                              type="button"
                              className="ml-1 p-0.5 text-sky-600 hover:text-sky-800 rounded-full hover:bg-sky-200 focus:outline-none"
                              onClick={() => removePendingSalesman(name)}
                            >
                              <IconX size={12} stroke={2.5} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                </div>

                {/* Payment Type Filter */}
                <div>
                  <label className="block text-sm font-medium mb-1">
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
                        <ListboxButton className="w-full text-left py-2 pl-3 pr-4 border border-default-300 rounded-lg flex items-center justify-between">
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
                          <ListboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-sm">
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
                                      ? "bg-sky-100 text-sky-900"
                                      : "text-default-900"
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
                  <label className="block text-sm font-medium">
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
                              className={`${"text-default-300"} transition-colors`}
                              size={20}
                            />
                          )}
                        </div>
                        <span className={`ml-2`}>{status.name}</span>
                      </label>
                    ))}
                  </div>
                  {/* E-Invoice Status Filter */}
                  <div>
                    <label className="block text-sm font-medium">
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
                          <span className={`ml-2`}>{status.name}</span>
                        </label>
                      ))}
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
