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
import { InvoiceFilters } from "../../types/types";
import Button from "../Button";

interface FilterTags {
  customers: string[];
  onRemove: (selectedIds: string[]) => void;
  cachedOptions: Array<{ id: string; name: string }>;
}

const CustomerFilterTags: React.FC<FilterTags> = ({
  customers,
  onRemove,
  cachedOptions,
}) => (
  <div className="px-2.5 py-1">
    <div className="flex flex-wrap gap-2">
      {customers.map((customer) => (
        <span
          key={customer}
          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-800 cursor-pointer"
          onClick={() =>
            onRemove(
              customers
                .filter((c) => c !== customer)
                .map(
                  (c) => cachedOptions.find((option) => option.name === c)?.id
                )
                .filter((id): id is string => id !== undefined)
            )
          }
        >
          {customer}
          <button className="ml-1 text-sky-600 hover:text-sky-800">
            <IconX size={14} />
          </button>
        </span>
      ))}
    </div>
  </div>
);

type InvoiceFilterMenuProps = {
  onFilterChange: (filters: InvoiceFilters) => void;
  currentFilters: InvoiceFilters;
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [cachedSalesmanOptions, setCachedSalesmanOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [cachedCustomerOptions, setCachedCustomerOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);

  useEffect(() => {
    const uniqueSalesmen = Array.from(new Set(salesmanOptions)).map(
      (salesman, index) => ({
        id: index.toString(),
        name: salesman,
      })
    );
    setCachedSalesmanOptions(uniqueSalesmen);
  }, [salesmanOptions]);

  useEffect(() => {
    const uniqueCustomers = Array.from(new Set(customerOptions)).map(
      (customer, index) => ({
        id: index.toString(),
        name: customer,
      })
    );
    setCachedCustomerOptions(uniqueCustomers);
  }, [customerOptions]);

  const handleFilterChange = (key: keyof InvoiceFilters, value: any) => {
    onFilterChange({ ...currentFilters, [key]: value });
  };

  const clearAllFilters = () => {
    const clearedFilters: InvoiceFilters = {
      dateRange: currentFilters.dateRange,
      salespersonId: null,
      applySalespersonFilter: true,
      customerId: null,
      applyCustomerFilter: true,
      paymentType: null,
      applyPaymentTypeFilter: true,
    };
    onFilterChange(clearedFilters);
  };

  const handleSalesmanSelection = (selectedIds: string[]) => {
    const selectedSalesmen = selectedIds
      .map((id) => cachedSalesmanOptions.find((s) => s.id === id)?.name)
      .filter((name): name is string => name !== undefined);
    handleFilterChange("salespersonId", selectedSalesmen);
  };

  const handleCustomerSelection = (selectedIds: string[]) => {
    const selectedCustomers = selectedIds
      .map((id) => cachedCustomerOptions.find((c) => c.id === id)?.name)
      .filter((name): name is string => name !== undefined);
    handleFilterChange("customerId", selectedCustomers);
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
        <div className="absolute space-y-1 mt-1 py-1 right-0 w-64 text-default-700 text-sm font-medium rounded-md bg-white shadow-lg focus:outline-none z-10">
          {/* Salesman Filter */}
          <div className="px-1">
            <Combobox
              multiple
              value={
                currentFilters.salespersonId
                  ?.map(
                    (salesman) =>
                      cachedSalesmanOptions.find((opt) => opt.name === salesman)
                        ?.id
                  )
                  .filter((id): id is string => id !== undefined) ?? []
              }
              onChange={handleSalesmanSelection}
              disabled={!currentFilters.applySalespersonFilter}
            >
              {({ open }) => (
                <div className="relative">
                  <div
                    className={`flex px-2.5 py-2.5 items-center justify-between rounded-md ${
                      !currentFilters.applySalespersonFilter
                        ? ""
                        : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                    }`}
                  >
                    <ComboboxButton
                      className={`w-full text-left text-default-900 focus:outline-none ${
                        !currentFilters.applySalespersonFilter
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFilterChange(
                          "applySalespersonFilter",
                          !currentFilters.applySalespersonFilter
                        );
                      }}
                    >
                      {currentFilters.applySalespersonFilter ? (
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
                    show={open && currentFilters.applySalespersonFilter}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <ComboboxOptions className="absolute z-10 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
                      {cachedSalesmanOptions.map((option) => (
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
                      ))}
                    </ComboboxOptions>
                  </Transition>
                </div>
              )}
            </Combobox>
          </div>

          {currentFilters.salespersonId &&
            currentFilters.salespersonId.length > 0 && (
              <div className="px-2.5 py-1">
                <div className="flex flex-wrap gap-2">
                  {currentFilters.salespersonId.map((salesman) => (
                    <span
                      key={salesman}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-800 cursor-pointer"
                      onClick={() => {
                        const newSelection =
                          currentFilters.salespersonId
                            ?.filter((s) => s !== salesman)
                            .map(
                              (s) =>
                                cachedSalesmanOptions.find(
                                  (option) => option.name === s
                                )?.id
                            )
                            .filter((id): id is string => id !== undefined) ??
                          [];
                        handleSalesmanSelection(newSelection);
                      }}
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
                currentFilters.customerId
                  ?.map(
                    (customer) =>
                      cachedCustomerOptions.find((opt) => opt.name === customer)
                        ?.id
                  )
                  .filter((id): id is string => id !== undefined) ?? []
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFilterChange(
                          "applyCustomerFilter",
                          !currentFilters.applyCustomerFilter
                        );
                      }}
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
                      {cachedCustomerOptions.map((option) => (
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
                      ))}
                    </ComboboxOptions>
                  </Transition>
                </div>
              )}
            </Combobox>
          </div>

          {currentFilters.customerId &&
            currentFilters.customerId.length > 0 && (
              <CustomerFilterTags
                customers={currentFilters.customerId}
                onRemove={handleCustomerSelection}
                cachedOptions={cachedCustomerOptions}
              />
            )}

          {/* Payment Type Filter */}
          <div className="px-1">
            <Listbox
              value={currentFilters.paymentType}
              onChange={(value) => handleFilterChange("paymentType", value)}
              disabled={!currentFilters.applyPaymentTypeFilter}
            >
              {({ open }) => (
                <div className="relative">
                  <div
                    className={`flex px-2.5 py-2.5 items-center justify-between rounded-md ${
                      !currentFilters.applyPaymentTypeFilter
                        ? ""
                        : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                    }`}
                  >
                    <ListboxButton
                      className={`w-full text-left text-default-900 focus:outline-none ${
                        !currentFilters.applyPaymentTypeFilter
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      } flex items-center`}
                    >
                      <span className="block truncate">
                        {currentFilters.paymentType === "Cash"
                          ? "Cash"
                          : currentFilters.paymentType === "Invoice"
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFilterChange(
                          "applyPaymentTypeFilter",
                          !currentFilters.applyPaymentTypeFilter
                        );
                      }}
                    >
                      {currentFilters.applyPaymentTypeFilter ? (
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
                    show={open && currentFilters.applyPaymentTypeFilter}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <ListboxOptions className="absolute z-10 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
                      {[
                        { id: "Cash", name: "Cash" },
                        { id: "Invoice", name: "Invoice" },
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
