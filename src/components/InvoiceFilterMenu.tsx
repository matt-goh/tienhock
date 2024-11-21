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
import { InvoiceFilterOptions } from "../types/types";
import Button from "./Button";
import CustomerFilterTags from "./CustomerFilterTags";

type InvoiceType = "C" | "I" | null;

type InvoiceFilterMenuProps = {
  onFilterChange: (filters: InvoiceFilterOptions) => void;
  currentFilters: InvoiceFilterOptions;
  salesmanOptions: string[];
  customerOptions: string[];
  today: Date | null;
  tomorrow: Date | null;
};

const InvoiceFilterMenu: React.FC<InvoiceFilterMenuProps> = ({
  onFilterChange,
  currentFilters,
  salesmanOptions,
  customerOptions,
  today,
  tomorrow,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [cachedSalesmanOptions, setCachedSalesmanOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [cachedCustomerOptions, setCachedCustomerOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Store initial options in a ref to compare against
  const initialOptionsRef = useRef({
    salesmen: new Set<string>(),
    customers: new Set<string>(),
  });

  // Cache options only when there are truly new options
  useEffect(() => {
    const newSalesmenSet = new Set(salesmanOptions);
    const newCustomersSet = new Set(customerOptions);

    // Check if we have new base options (not just filtered ones)
    const salesmenChanged = salesmanOptions.some(
      (s) => !initialOptionsRef.current.salesmen.has(s)
    );
    const customersChanged = customerOptions.some(
      (c) => !initialOptionsRef.current.customers.has(c)
    );

    if (salesmenChanged || initialOptionsRef.current.salesmen.size === 0) {
      const uniqueSalesmen = Array.from(newSalesmenSet).map(
        (salesman, index) => ({
          id: index.toString(),
          name: salesman,
        })
      );
      setCachedSalesmanOptions(uniqueSalesmen);
      initialOptionsRef.current.salesmen = newSalesmenSet;
    }

    if (customersChanged || initialOptionsRef.current.customers.size === 0) {
      const uniqueCustomers = Array.from(newCustomersSet).map(
        (customer, index) => ({
          id: index.toString(),
          name: customer,
        })
      );
      setCachedCustomerOptions(uniqueCustomers);
      initialOptionsRef.current.customers = newCustomersSet;
    }
  }, [salesmanOptions, customerOptions]);

  const handleFilterChange = (key: keyof InvoiceFilterOptions, value: any) => {
    onFilterChange({ ...currentFilters, [key]: value });
  };

  const clearAllFilters = () => {
    const clearedFilters: InvoiceFilterOptions = {
      salesmanFilter: null,
      applySalesmanFilter: true,
      customerFilter: null,
      applyCustomerFilter: true,
      dateRangeFilter: { start: today, end: tomorrow },
      applyDateRangeFilter: true, // Always true now
      invoiceTypeFilter: null,
      applyInvoiceTypeFilter: true,
      applyProductFilter: false,
    };
    onFilterChange(clearedFilters);
  };

  const handleSalesmanSelection = (selectedSalesmanIds: string[]) => {
    const selectedSalesmen = selectedSalesmanIds
      .map(
        (id) =>
          cachedSalesmanOptions.find((salesman) => salesman.id === id)?.name
      )
      .filter((salesman): salesman is string => salesman !== undefined);
    handleFilterChange("salesmanFilter", selectedSalesmen);
  };

  const handleCustomerSelection = (selectedCustomerIds: string[]) => {
    const selectedCustomers = selectedCustomerIds
      .map((id) => {
        const found = cachedCustomerOptions.find((option) => option.id === id);
        return found?.name;
      })
      .filter((customer): customer is string => customer !== undefined);

    handleFilterChange("customerFilter", selectedCustomers);
  };

  const formatDateForInput = (date: Date | null): string => {
    if (!date) return "";
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const handleDateChange = (type: "start" | "end", value: string) => {
    if (!value) {
      handleFilterChange("dateRangeFilter", {
        ...currentFilters.dateRangeFilter,
        [type]: null,
      });
      return;
    }
    const [year, month, day] = value.split("-").map(Number);
    const newDate = new Date(year, month - 1, day);
    const newDateRange = {
      ...currentFilters.dateRangeFilter,
      [type]: newDate,
    };
    handleFilterChange("dateRangeFilter", newDateRange);
  };

  const handleInvoiceTypeSelection = (selectedType: InvoiceType) => {
    handleFilterChange("invoiceTypeFilter", selectedType);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
        <div className="absolute space-y-1 py-1 right-0 w-64 text-default-700 text-sm font-medium rounded-md bg-white shadow-lg focus:outline-none z-10">
          {/* Date Range Filter - Always visible and active */}
          <div className="px-1">
            <div className="px-2.5 py-2 space-y-2">
              <div>
                <label htmlFor="start-date" className="block mb-1">
                  Start Date:
                </label>
                <input
                  type="date"
                  id="start-date"
                  value={formatDateForInput(
                    currentFilters.dateRangeFilter?.start ?? null
                  )}
                  onChange={(e) => handleDateChange("start", e.target.value)}
                  className="w-full p-1 border rounded"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block mb-1">
                  End Date:
                </label>
                <input
                  type="date"
                  id="end-date"
                  value={formatDateForInput(
                    currentFilters.dateRangeFilter?.end ?? null
                  )}
                  onChange={(e) => handleDateChange("end", e.target.value)}
                  className="w-full p-1 border rounded"
                />
              </div>
            </div>
          </div>
          {/* Sales by Product Filter */}
          <div className="px-1">
            <div
              className="flex px-2.5 py-2.5 items-center justify-between rounded-md hover:bg-default-100 active:bg-default-200 transition-colors duration-200 cursor-pointer"
              onClick={() =>
                handleFilterChange(
                  "applyProductFilter",
                  !currentFilters.applyProductFilter
                )
              }
            >
              <span className="block truncate">Sales by product</span>
              <button className="flex items-center ml-2">
                {currentFilters.applyProductFilter ? (
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
          </div>

          {/* Salesman Filter */}
          <div className="px-1">
            <Combobox
              multiple
              value={
                currentFilters.salesmanFilter?.map(
                  (salesman) =>
                    cachedSalesmanOptions.find(
                      (option) => option.name === salesman
                    )?.id
                ) ?? []
              }
              onChange={handleSalesmanSelection}
              disabled={!currentFilters.applySalesmanFilter}
            >
              {({ open }) => (
                <div className="relative">
                  <div
                    className={`flex px-2.5 py-2.5 items-center justify-between rounded-md ${
                      !currentFilters.applySalesmanFilter
                        ? ""
                        : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                    }`}
                  >
                    <ComboboxButton
                      className={`w-full text-left text-default-900 focus:outline-none ${
                        !currentFilters.applySalesmanFilter
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      } flex items-center`}
                    >
                      <span className="block truncate">Sales by salesman</span>
                      <IconChevronDown
                        stroke={2}
                        size={18}
                        className="ml-2 text-default-500"
                      />
                    </ComboboxButton>
                    <button
                      className="flex items-center ml-2"
                      onClick={() =>
                        handleFilterChange(
                          "applySalesmanFilter",
                          !currentFilters.applySalesmanFilter
                        )
                      }
                    >
                      {currentFilters.applySalesmanFilter ? (
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
                  <Transition
                    show={open && currentFilters.applySalesmanFilter}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <ComboboxOptions className="absolute z-10 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
                      {cachedSalesmanOptions.length === 0 ? (
                        <div className="relative cursor-default select-none py-2 px-4 text-default-700">
                          No salesmen found.
                        </div>
                      ) : (
                        cachedSalesmanOptions.map((option) => (
                          <ComboboxOption
                            key={option.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 ${
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
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck stroke={2} size={22} />
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
              )}
            </Combobox>
          </div>
          {currentFilters.salesmanFilter &&
            currentFilters.salesmanFilter.length > 0 && (
              <div className="px-2.5 py-1">
                <div className="flex flex-wrap gap-2">
                  {currentFilters.salesmanFilter.map((salesman) => (
                    <span
                      key={salesman}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-800 cursor-pointer"
                      onClick={() =>
                        handleSalesmanSelection(
                          currentFilters.salesmanFilter
                            ?.filter((s) => s !== salesman)
                            .map(
                              (s) =>
                                cachedSalesmanOptions.find(
                                  (option) => option.name === s
                                )?.id
                            )
                            .filter((id): id is string => id !== undefined) ??
                            []
                        )
                      }
                    >
                      {salesman}
                      <button className="ml-1 text-sky-600 hover:text-sky-800">
                        <IconX size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

          {/* Customer Filter */}
          <div className="px-1">
            <Combobox
              multiple
              value={
                currentFilters.customerFilter?.map(
                  (customer) =>
                    cachedCustomerOptions.find(
                      (option) => option.name === customer
                    )?.id
                ) ?? []
              }
              onChange={handleCustomerSelection}
              disabled={!currentFilters.applyCustomerFilter}
            >
              {({ open }) => (
                <div className="relative">
                  <div
                    className={`flex px-2.5 py-2.5 items-center justify-between rounded-md ${
                      !currentFilters.applyCustomerFilter
                        ? ""
                        : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                    }`}
                  >
                    <ComboboxButton
                      className={`w-full text-left text-default-900 focus:outline-none ${
                        !currentFilters.applyCustomerFilter
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      } flex items-center`}
                    >
                      <span className="block truncate">Sales by customer</span>
                      <IconChevronDown
                        stroke={2}
                        size={18}
                        className="ml-2 text-default-500"
                      />
                    </ComboboxButton>
                    <button
                      className="flex items-center ml-2"
                      onClick={() =>
                        handleFilterChange(
                          "applyCustomerFilter",
                          !currentFilters.applyCustomerFilter
                        )
                      }
                    >
                      {currentFilters.applyCustomerFilter ? (
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
                  <Transition
                    show={open && currentFilters.applyCustomerFilter}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <ComboboxOptions className="absolute z-10 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
                      {cachedCustomerOptions.length === 0 ? (
                        <div className="relative cursor-default select-none py-2 px-4 text-default-700">
                          No customers found.
                        </div>
                      ) : (
                        cachedCustomerOptions.map((option) => (
                          <ComboboxOption
                            key={option.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 ${
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
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck stroke={2} size={22} />
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
              )}
            </Combobox>
          </div>
          {currentFilters.customerFilter &&
            currentFilters.customerFilter.length > 0 && (
              <CustomerFilterTags
                customers={currentFilters.customerFilter}
                onRemove={handleCustomerSelection}
                cachedCustomerOptions={cachedCustomerOptions}
              />
            )}
          {/* Invoice Type Filter */}
          <div className="px-1">
            <Listbox
              value={currentFilters.invoiceTypeFilter}
              onChange={handleInvoiceTypeSelection}
              disabled={!currentFilters.applyInvoiceTypeFilter}
            >
              {({ open }) => (
                <div className="relative">
                  <div
                    className={`flex px-2.5 py-2.5 items-center justify-between rounded-md ${
                      !currentFilters.applyInvoiceTypeFilter
                        ? ""
                        : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                    }`}
                  >
                    <ListboxButton
                      className={`w-full text-left text-default-900 focus:outline-none ${
                        !currentFilters.applyInvoiceTypeFilter
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      } flex items-center`}
                    >
                      <span className="block truncate">
                        {currentFilters.invoiceTypeFilter === "C"
                          ? "Cash"
                          : currentFilters.invoiceTypeFilter === "I"
                          ? "Invoice"
                          : "Sales by type"}
                      </span>
                      <IconChevronDown
                        stroke={2}
                        size={18}
                        className="ml-2 text-default-500"
                      />
                    </ListboxButton>
                    <button
                      className="flex items-center ml-2"
                      onClick={() =>
                        handleFilterChange(
                          "applyInvoiceTypeFilter",
                          !currentFilters.applyInvoiceTypeFilter
                        )
                      }
                    >
                      {currentFilters.applyInvoiceTypeFilter ? (
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
                  <Transition
                    show={open && currentFilters.applyInvoiceTypeFilter}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <ListboxOptions className="absolute z-10 w-full mt-11 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
                      {[
                        { id: "C", name: "Cash" },
                        { id: "I", name: "Invoice" },
                      ].map((option) => (
                        <ListboxOption
                          key={option.id}
                          className={({ active }) =>
                            `relative cursor-pointer select-none py-2 px-4 ${
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
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                  <IconCheck stroke={2} size={22} />
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
          {/* Clear Filters Button */}
          <div className="px-1">
            <button
              onClick={clearAllFilters}
              className="w-full flex justify-between items-center px-2.5 py-2.5 text-left text-default-900 rounded-lg hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
            >
              <span>Clear All Filters</span>
              <IconTrash size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceFilterMenu;
