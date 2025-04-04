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
};

const InvoiceFilterMenu: React.FC<InvoiceFilterMenuProps> = ({
  onFilterChange,
  currentFilters,
  salesmanOptions,
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
    { id: "active", name: "Active" },
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
      applySalespersonFilter: true,
      paymentType: null,
      applyPaymentTypeFilter: true,
      invoiceStatus: [],
      applyInvoiceStatusFilter: true,
      eInvoiceStatus: [],
      applyEInvoiceStatusFilter: true,
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
    <div className="relative inline-block text-left ml-2" ref={menuRef}>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        icon={IconFilter}
        variant="outline"
      >
        Filter
      </Button>
      {isOpen && (
        // Add overflow-y-auto and max-height for scrollability if menu gets long
        <div className="absolute mt-1 py-1 right-0 w-72 text-default-700 text-sm font-medium rounded-md bg-white shadow-lg focus:outline-none z-30 border border-default-200 flex flex-col max-h-[80vh]">
          <div className="flex-grow space-y-1 px-1 pb-2">
            {" "}
            {/* Scrollable content area */}
            {/* --- Salesman Filter --- */}
            {/* Read/Write from/to pendingFilters */}
            <div className="">
              {" "}
              {/* Removed px-1 */}
              <Combobox
                multiple
                value={getSelectedSalesmanIds()}
                onChange={handleSalesmanSelection} // Updates pendingFilters via ID->Name mapping
                disabled={!pendingFilters.applySalespersonFilter}
              >
                {({ open }) => (
                  <div className="relative">
                    {/* Header section */}
                    <div
                      className={`flex px-2.5 py-2 items-center justify-between rounded-md ${
                        !pendingFilters.applySalespersonFilter
                          ? ""
                          : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                      }`}
                    >
                      <ComboboxButton
                        className={`w-full text-left text-default-900 focus:outline-none ${
                          !pendingFilters.applySalespersonFilter
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        } flex items-center`}
                        disabled={!pendingFilters.applySalespersonFilter} // Disable button explicitly
                      >
                        <span className="block truncate">
                          Sales by salesman
                        </span>
                        <IconChevronDown
                          stroke={2}
                          size={18}
                          className={`ml-2 text-default-500 transition-transform ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </ComboboxButton>
                      {/* Apply Filter Checkbox */}
                      <button
                        type="button"
                        className="flex items-center ml-2 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePendingFilterChange(
                            "applySalespersonFilter",
                            !pendingFilters.applySalespersonFilter
                          );
                        }}
                      >
                        {pendingFilters.applySalespersonFilter ? (
                          <IconSquareCheckFilled
                            width={18}
                            height={18}
                            className="text-blue-600"
                          />
                        ) : (
                          <IconSquare
                            width={18}
                            height={18}
                            stroke={2}
                            className="text-default-400"
                          />
                        )}
                      </button>
                    </div>
                    {/* Options Dropdown */}
                    <Transition
                      show={open && pendingFilters.applySalespersonFilter}
                      as={Fragment}
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100"
                      leaveTo="opacity-0"
                    >
                      <ComboboxOptions className="absolute z-20 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                        {/* Search input can be added here if needed */}
                        {cachedSalesmanOptions.map((option) => (
                          <ComboboxOption
                            key={option.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 rounded-md ${
                                active ? "bg-default-100" : "text-default-900"
                              }`
                            }
                            value={option.id}
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  {option.name}
                                </span>
                                {selected ? (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
                                    <IconCheck stroke={2.5} size={20} />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </ComboboxOption>
                        ))}
                        {cachedSalesmanOptions.length === 0 && (
                          <div className="relative cursor-default select-none py-2 px-4 text-default-500">
                            No salesmen found
                          </div>
                        )}
                      </ComboboxOptions>
                    </Transition>
                  </div>
                )}
              </Combobox>
              {/* Display Selected Salesman Tags */}
              {pendingFilters.salespersonId &&
                pendingFilters.salespersonId.length > 0 && (
                  <SelectedFilterTags
                    items={pendingFilters.salespersonId}
                    onRemove={removePendingSalesman}
                    label="Salesman"
                  />
                )}
            </div>
            {/* --- Payment Type Filter --- */}
            {/* Read/Write from/to pendingFilters */}
            <div className="">
              {" "}
              {/* Removed px-1 */}
              <Listbox
                value={pendingFilters.paymentType}
                // Use handlePendingFilterChange directly for single select
                onChange={(value) =>
                  handlePendingFilterChange("paymentType", value)
                }
                disabled={!pendingFilters.applyPaymentTypeFilter}
              >
                {({ open }) => (
                  <div className="relative">
                    {/* Header section */}
                    <div
                      className={`flex px-2.5 py-2 items-center justify-between rounded-md ${
                        !pendingFilters.applyPaymentTypeFilter
                          ? ""
                          : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                      }`}
                    >
                      <ListboxButton
                        className={`w-full text-left text-default-900 focus:outline-none ${
                          !pendingFilters.applyPaymentTypeFilter
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        } flex items-center`}
                        disabled={!pendingFilters.applyPaymentTypeFilter} // Disable button explicitly
                      >
                        <span className="block truncate">
                          {/* Display selected value from PENDING state */}
                          {pendingFilters.paymentType === "Cash"
                            ? "Cash Sales"
                            : pendingFilters.paymentType === "Invoice"
                            ? "Invoice Sales"
                            : "Sales by type"}
                        </span>
                        <IconChevronDown
                          stroke={2}
                          size={18}
                          className={`ml-2 text-default-500 transition-transform ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </ListboxButton>
                      {/* Apply Filter Checkbox */}
                      <button
                        type="button"
                        className="flex items-center ml-2 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePendingFilterChange(
                            "applyPaymentTypeFilter",
                            !pendingFilters.applyPaymentTypeFilter
                          );
                        }}
                      >
                        {pendingFilters.applyPaymentTypeFilter ? (
                          <IconSquareCheckFilled
                            width={18}
                            height={18}
                            className="text-blue-600"
                          />
                        ) : (
                          <IconSquare
                            width={18}
                            height={18}
                            stroke={2}
                            className="text-default-400"
                          />
                        )}
                      </button>
                    </div>
                    {/* Options Dropdown */}
                    <Transition
                      show={open && pendingFilters.applyPaymentTypeFilter}
                      as={Fragment}
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100"
                      leaveTo="opacity-0"
                    >
                      <ListboxOptions className="absolute z-20 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                        {[
                          { id: null, name: "All Types" }, // Option to clear selection
                          { id: "Cash", name: "Cash Sales" },
                          { id: "Invoice", name: "Invoice Sales" },
                        ].map((option) => (
                          <ListboxOption
                            key={option.id ?? "all"}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 rounded-md ${
                                active ? "bg-default-100" : "text-default-900"
                              }`
                            }
                            value={option.id} // Value is 'Cash', 'Invoice', or null
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  {option.name}
                                </span>
                                {selected &&
                                pendingFilters.paymentType !== null ? ( // Show check only if not 'All Types' is selected
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
                                    <IconCheck stroke={2.5} size={20} />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </ListboxOption>
                        ))}
                      </ListboxOptions>
                    </Transition>
                  </div>
                )}
              </Listbox>
            </div>
            {/* --- Invoice Status Filter --- */}
            {/* Read/Write from/to pendingFilters */}
            <div className="">
              {" "}
              {/* Removed px-1 */}
              <Combobox
                multiple
                value={pendingFilters.invoiceStatus ?? []} // Directly use the string array
                onChange={(
                  value: string[] // Updates pending state directly
                ) => handlePendingFilterChange("invoiceStatus", value)}
                disabled={!pendingFilters.applyInvoiceStatusFilter}
              >
                {({ open }) => (
                  <div className="relative">
                    {/* Header section */}
                    <div
                      className={`flex px-2.5 py-2 items-center justify-between rounded-md ${
                        !pendingFilters.applyInvoiceStatusFilter
                          ? ""
                          : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                      }`}
                    >
                      <ComboboxButton
                        className={`w-full text-left text-default-900 focus:outline-none ${
                          !pendingFilters.applyInvoiceStatusFilter
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        } flex items-center`}
                        disabled={!pendingFilters.applyInvoiceStatusFilter} // Disable button explicitly
                      >
                        <span className="block truncate">Invoice Status</span>
                        <IconChevronDown
                          stroke={2}
                          size={18}
                          className={`ml-2 text-default-500 transition-transform ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </ComboboxButton>
                      {/* Apply Filter Checkbox */}
                      <button
                        type="button"
                        className="flex items-center ml-2 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePendingFilterChange(
                            "applyInvoiceStatusFilter",
                            !pendingFilters.applyInvoiceStatusFilter
                          );
                        }}
                      >
                        {pendingFilters.applyInvoiceStatusFilter ? (
                          <IconSquareCheckFilled
                            width={18}
                            height={18}
                            className="text-blue-600"
                          />
                        ) : (
                          <IconSquare
                            width={18}
                            height={18}
                            stroke={2}
                            className="text-default-400"
                          />
                        )}
                      </button>
                    </div>
                    {/* Options Dropdown */}
                    <Transition
                      show={open && pendingFilters.applyInvoiceStatusFilter}
                      as={Fragment}
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100"
                      leaveTo="opacity-0"
                    >
                      <ComboboxOptions className="absolute z-20 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                        {invoiceStatusOptions.map((option) => (
                          <ComboboxOption
                            key={option.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 rounded-md ${
                                active ? "bg-default-100" : "text-default-900"
                              }`
                            }
                            value={option.id} // Value is the string like 'active'
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  {option.name}
                                </span>
                                {selected ? (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
                                    <IconCheck stroke={2.5} size={20} />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </ComboboxOption>
                        ))}
                      </ComboboxOptions>
                    </Transition>
                  </div>
                )}
              </Combobox>
              {/* Display Selected Invoice Status Tags */}
              {pendingFilters.invoiceStatus &&
                pendingFilters.invoiceStatus.length > 0 && (
                  <SelectedFilterTags
                    items={pendingFilters.invoiceStatus}
                    onRemove={removePendingInvoiceStatus}
                    label="Inv Status"
                  />
                )}
            </div>
            {/* --- E-Invoice Status Filter --- */}
            {/* Read/Write from/to pendingFilters */}
            <div className="">
              {" "}
              {/* Removed px-1 */}
              <Combobox
                multiple
                value={pendingFilters.eInvoiceStatus ?? []} // Directly use the string array
                onChange={(
                  value: string[] // Updates pending state directly
                ) => handlePendingFilterChange("eInvoiceStatus", value)}
                disabled={!pendingFilters.applyEInvoiceStatusFilter}
              >
                {({ open }) => (
                  <div className="relative">
                    {/* Header section */}
                    <div
                      className={`flex px-2.5 py-2 items-center justify-between rounded-md ${
                        !pendingFilters.applyEInvoiceStatusFilter
                          ? ""
                          : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                      }`}
                    >
                      <ComboboxButton
                        className={`w-full text-left text-default-900 focus:outline-none ${
                          !pendingFilters.applyEInvoiceStatusFilter
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        } flex items-center`}
                        disabled={!pendingFilters.applyEInvoiceStatusFilter} // Disable button explicitly
                      >
                        <span className="block truncate">E-Invoice Status</span>
                        <IconChevronDown
                          stroke={2}
                          size={18}
                          className={`ml-2 text-default-500 transition-transform ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </ComboboxButton>
                      {/* Apply Filter Checkbox */}
                      <button
                        type="button"
                        className="flex items-center ml-2 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePendingFilterChange(
                            "applyEInvoiceStatusFilter",
                            !pendingFilters.applyEInvoiceStatusFilter
                          );
                        }}
                      >
                        {pendingFilters.applyEInvoiceStatusFilter ? (
                          <IconSquareCheckFilled
                            width={18}
                            height={18}
                            className="text-blue-600"
                          />
                        ) : (
                          <IconSquare
                            width={18}
                            height={18}
                            stroke={2}
                            className="text-default-400"
                          />
                        )}
                      </button>
                    </div>
                    {/* Options Dropdown */}
                    <Transition
                      show={open && pendingFilters.applyEInvoiceStatusFilter}
                      as={Fragment}
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100"
                      leaveTo="opacity-0"
                    >
                      <ComboboxOptions className="absolute z-20 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                        {eInvoiceStatusOptions.map((option) => (
                          <ComboboxOption
                            key={option.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 rounded-md ${
                                active ? "bg-default-100" : "text-default-900"
                              }`
                            }
                            value={option.id} // Value is the string like 'valid' or 'null'
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  {option.name}
                                </span>
                                {selected ? (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
                                    <IconCheck stroke={2.5} size={20} />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </ComboboxOption>
                        ))}
                      </ComboboxOptions>
                    </Transition>
                  </div>
                )}
              </Combobox>
              {/* Display Selected E-Invoice Status Tags */}
              {pendingFilters.eInvoiceStatus &&
                pendingFilters.eInvoiceStatus.length > 0 && (
                  <SelectedFilterTags
                    items={pendingFilters.eInvoiceStatus.map((s) =>
                      s === "null" ? "Not Submitted" : s
                    )} // Map 'null' for display
                    onRemove={(itemNameToRemove) => {
                      // Map display name back to actual value ('null') if needed
                      const actualValueToRemove =
                        itemNameToRemove === "Not Submitted"
                          ? "null"
                          : itemNameToRemove;
                      removePendingEInvoiceStatus(actualValueToRemove);
                    }}
                    label="eInv Status"
                  />
                )}
            </div>
            {/* --- Clear Selections Button (acts on pending state) --- */}
            <div className="">
              {" "}
              {/* Removed px-1 */}
              <button
                type="button"
                onClick={clearPendingFilters}
                className="w-full flex justify-between items-center px-2.5 py-2 text-left text-default-900 rounded-lg hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
              >
                <span>Clear Selections</span>
                <IconTrash size={18} className="text-default-500" />
              </button>
            </div>
          </div>{" "}
          {/* End Scrollable Content Area */}
          {/* --- Action Buttons Footer --- */}
          <div className="flex-shrink-0 flex justify-end gap-2 px-3 py-2 border-t border-default-200 bg-default-50 rounded-b-md">
            <Button variant="outline" onClick={cancelFilters} size="sm">
              Cancel
            </Button>
            <Button
              variant="filled"
              color="sky"
              onClick={applyFilters}
              size="sm"
            >
              Apply Filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceFilterMenu;
