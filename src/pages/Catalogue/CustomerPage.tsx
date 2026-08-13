import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Customer } from "../../types/types";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconCheck,
  IconChevronDown,
  IconBuildingStore,
  IconRefresh,
  IconBuildingSkyscraper,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import CustomerCard from "../../components/Catalogue/CustomerCard";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  EnhancedCustomerList,
  refreshCustomersCache,
  useCustomersCache,
} from "../../utils/catalogue/useCustomerCache";
import { refreshAccountCodesCache } from "../../utils/accounting/useAccountingCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import BranchLinkageModal from "../../components/Catalogue/BranchLinkageModal";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import { usePersistedFilters } from "../../hooks/usePersistedFilters";

const ITEMS_PER_PAGE = 20;
const FILTERS_STORAGE_KEY = "customerList";
const SCROLL_RESTORATION_KEY = "customer-list";

// Branch filter sentinels. Anything else is a literal branch group name.
const ALL_BRANCHES = "All Branches";
const IN_BRANCH_GROUP = "In a Branch Group";
const NO_BRANCH_GROUP = "No Branch Group";

interface CustomerListFilters {
  selectedSalesman: string;
  selectedBranchGroup: string;
  page: number;
}

const getDefaultFilters = (): CustomerListFilters => ({
  selectedSalesman: "All Salesmen",
  selectedBranchGroup: ALL_BRANCHES,
  page: 1,
});

const reviveFilters = (cached: any): CustomerListFilters => ({
  selectedSalesman:
    typeof cached?.selectedSalesman === "string"
      ? cached.selectedSalesman
      : "All Salesmen",
  selectedBranchGroup:
    typeof cached?.selectedBranchGroup === "string"
      ? cached.selectedBranchGroup
      : ALL_BRANCHES,
  page: typeof cached?.page === "number" && cached.page >= 1 ? cached.page : 1,
});

const CustomerPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("catalogue");
  const { customers, isLoading, error } = useCustomersCache();
  const [searchTerm, setSearchTerm] = useState(() => {
    // Retrieve saved search term from sessionStorage
    return sessionStorage.getItem("customerSearchTerm") || "";
  });
  // Salesman filter and page persist so returning from a customer form lands
  // on the same slice of the list.
  const [filters, setFilters] = usePersistedFilters<CustomerListFilters>(
    FILTERS_STORAGE_KEY,
    getDefaultFilters,
    reviveFilters
  );
  const currentPage: number = filters.page;
  const selectedSalesman: string = filters.selectedSalesman;
  const selectedBranchGroup: string = filters.selectedBranchGroup;
  const setCurrentPage = (page: number): void =>
    setFilters((prev) => ({ ...prev, page }));
  const setSelectedSalesman = (salesman: string): void =>
    setFilters((prev) => ({ ...prev, selectedSalesman: salesman }));
  const setSelectedBranchGroup = (group: string): void =>
    setFilters((prev) => ({ ...prev, selectedBranchGroup: group }));
  const [salesmen, setSalesmen] = useState<string[]>(["All Salesmen"]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(
    null
  );
  const { salesmen: salesmenData } = useSalesmanCache();
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  // Set when the modal is opened from a card so it lands on that group.
  const [branchModalCustomerId, setBranchModalCustomerId] = useState<
    string | undefined
  >(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const branchGroupNames = useMemo(() => {
    const names = new Set<string>();
    customers.forEach((customer) => {
      if (customer.branchInfo?.isInBranchGroup && customer.branchInfo.groupName) {
        names.add(customer.branchInfo.groupName);
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const branchFilterOptions = useMemo(
    () => [ALL_BRANCHES, IN_BRANCH_GROUP, NO_BRANCH_GROUP, ...branchGroupNames],
    [branchGroupNames]
  );

  const openBranchModal = (customerId?: string): void => {
    setBranchModalCustomerId(customerId);
    setIsBranchModalOpen(true);
  };

  // A persisted filter can point at a group that has since been deleted or
  // renamed, which would silently show an empty list.
  useEffect(() => {
    if (customers.length === 0) return;
    if (!branchFilterOptions.includes(selectedBranchGroup)) {
      setSelectedBranchGroup(ALL_BRANCHES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers.length, branchFilterOptions, selectedBranchGroup]);

  // Focus the search box once the page has finished loading (the input isn't
  // mounted yet while the loading spinner is shown).
  useEffect(() => {
    if (!isLoading) searchInputRef.current?.focus();
  }, [isLoading]);

  useEffect(() => {
    sessionStorage.setItem("customerSearchTerm", searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (salesmenData.length > 0) {
      const salesmenIds = salesmenData.map((employee) => employee.id);
      setSalesmen(["All Salesmen", ...salesmenIds]);
    }
  }, [salesmenData]);

  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (customerToDelete) {
      try {
        await api.delete(`/api/customers/${customerToDelete.id}`);

        // Refresh the cache after deletion
        await Promise.all([refreshCustomersCache(), refreshAccountCodesCache()]);

        setIsDeleteDialogOpen(false);
        setCustomerToDelete(null);
        toast.success(t("Customer deleted successfully"));
      } catch (err) {
        console.error("Error deleting customer:", err);
        toast.error(t("Failed to delete customer. Please try again."));
      }
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const searchFields = [
        customer.name,
        customer.id,
        customer.id_number,
        customer.phone_number,
        customer.branchInfo?.groupName,
      ].map((field) => field?.toLowerCase() || "");

      const matchesSearch = searchFields.some((field) =>
        field.includes(searchTerm.toLowerCase())
      );

      const matchesSalesman =
        selectedSalesman === "All Salesmen" ||
        customer.salesman === selectedSalesman;

      const isGrouped = Boolean(customer.branchInfo?.isInBranchGroup);
      const matchesBranchGroup =
        selectedBranchGroup === ALL_BRANCHES ||
        (selectedBranchGroup === IN_BRANCH_GROUP && isGrouped) ||
        (selectedBranchGroup === NO_BRANCH_GROUP && !isGrouped) ||
        customer.branchInfo?.groupName === selectedBranchGroup;

      return matchesSearch && matchesSalesman && matchesBranchGroup;
    });
  }, [customers, searchTerm, selectedSalesman, selectedBranchGroup]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCustomers, currentPage]);

  // Reset to page 1 when a filter actually changes. The ref-guard skips the
  // initial mount so the page number restored from the cache survives.
  const filterSignature: string = `${searchTerm}|${selectedSalesman}|${selectedBranchGroup}`;
  const prevFilterSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      prevFilterSignatureRef.current !== null &&
      prevFilterSignatureRef.current !== filterSignature
    ) {
      setCurrentPage(1);
    }
    prevFilterSignatureRef.current = filterSignature;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature]);

  // Restore the previous scroll position when returning from a customer form.
  useScrollRestoration(SCROLL_RESTORATION_KEY, !isLoading);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const renderFilterListbox = (
    value: string,
    onChange: (next: string) => void,
    options: string[],
    widthClass: string = "w-48"
  ) => (
    <div className="flex items-center">
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <ListboxButton
            className={`${widthClass} rounded-full border border-default-300 dark:border-gray-600 bg-white dark:bg-transparent text-default-900 dark:text-gray-100 py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500 dark:focus:border-gray-500`}
          >
            <span className="block truncate pl-2">{displayFilterValue(value)}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <IconChevronDown
                className="h-5 w-5 text-default-400 dark:text-gray-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 w-max min-w-full max-w-[22rem] right-0 p-1 mt-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
            {options.map((option) => (
              <ListboxOption
                key={option}
                className={({ active }) =>
                  `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                    active
                      ? "bg-default-100 dark:bg-gray-900/50 text-default-900 dark:text-gray-100"
                      : "text-default-900 dark:text-gray-100"
                  }`
                }
                value={option}
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? "font-medium" : "font-normal"
                      }`}
                    >
                      {displayFilterValue(option)}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600 dark:text-gray-300">
                        <IconCheck className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );

  const displayFilterValue = (value: string): string =>
    value === "All Salesmen" ||
    value === ALL_BRANCHES ||
    value === IN_BRANCH_GROUP ||
    value === NO_BRANCH_GROUP
      ? t(value)
      : value;

  const renderPaginationButtons = () => {
    const buttons = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        buttons.push(
          <button
            key={i}
            onClick={() => handlePageChange(i)}
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
              i === currentPage
                ? "border border-default-200 dark:border-gray-600 font-semibold"
                : "font-medium"
            }`}
          >
            {i}
          </button>
        );
      }
    } else {
      // Add first page
      buttons.push(
        <button
          key={1}
          onClick={() => handlePageChange(1)}
          className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
            1 === currentPage
              ? "border border-default-200 dark:border-gray-600 font-semibold"
              : "font-medium"
          }`}
        >
          1
        </button>
      );

      // Add ellipsis if needed
      if (currentPage > 3) {
        buttons.push(
          <div key="ellipsis1" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Add pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        buttons.push(
          <button
            key={i}
            onClick={() => handlePageChange(i)}
            className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
              i === currentPage
                ? "border border-default-200 dark:border-gray-600 font-semibold"
                : "font-medium"
            }`}
          >
            {i}
          </button>
        );
      }

      // Add ellipsis if needed
      if (currentPage < totalPages - 2) {
        buttons.push(
          <div key="ellipsis2" className="flex items-center">
            <span className="px-2">...</span>
          </div>
        );
      }

      // Add last page
      buttons.push(
        <button
          key={totalPages}
          onClick={() => handlePageChange(totalPages)}
          className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
            totalPages === currentPage
              ? "border border-default-200 dark:border-gray-600 font-semibold"
              : "font-medium"
          }`}
        >
          {totalPages}
        </button>
      );
    }

    return buttons;
  };

  if (isLoading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>{t("Error: {{message}}", { message: error.message })}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="flex items-center text-2xl text-default-700 dark:text-gray-200 font-bold gap-2.5">
            <IconBuildingStore
              size={28}
              stroke={2.5}
              className="text-default-700 dark:text-gray-200"
            />
            {t("Customers ({{total}})", {
              total: filteredCustomers.length,
            })}
          </h1>
        </div>
        <div className="flex space-x-3">
          <div className="relative">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400 dark:text-gray-400"
              size={22}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("search", { ns: "common" })}
              className="w-full pl-11 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-transparent text-default-900 dark:text-gray-100 focus:border-default-500 dark:focus:border-gray-500 rounded-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300"
                onClick={() => setSearchTerm("")}
                title={t("Clear search")}
              >
                ×
              </button>
            )}
          </div>
          {renderFilterListbox(
            selectedSalesman,
            setSelectedSalesman,
            salesmen
          )}
          {renderFilterListbox(
            selectedBranchGroup,
            setSelectedBranchGroup,
            branchFilterOptions,
            "w-44"
          )}
          <Button
            onClick={async () => {
              try {
                await refreshCustomersCache();
                toast.success(t("Refreshed customer list"));
              } catch (error) {
                toast.error(t("Failed to refresh customers"));
              }
            }}
            variant="outline"
            title={t("Refresh Customers")}
            icon={IconRefresh}
          >
            {t("Refresh")}
          </Button>
          <Button
            onClick={() => openBranchModal()}
            variant="outline"
            icon={IconBuildingSkyscraper}
            title={t("Manage branch groups")}
          >
            {branchGroupNames.length > 0
              ? t("Branches ({{total}})", { total: branchGroupNames.length })
              : t("Branches")}
          </Button>
          <Button
            onClick={() => navigate("/catalogue/customer/new")}
            icon={IconPlus}
            color="sky"
          >
            {t("Add Customer")}
          </Button>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-default-500 dark:text-gray-400">
            {t("No customers found.")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedCustomers.map((customer: EnhancedCustomerList) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              onDeleteClick={handleDeleteClick}
              branchInfo={customer.branchInfo}
              onManageBranchesClick={(c) => openBranchModal(c.id)}
            />
          ))}
        </div>
      )}

      {filteredCustomers.length > 0 && (
        <div className="mt-6 flex justify-between items-center text-default-700 dark:text-gray-200">
          <button
            className="pl-2.5 pr-4 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background dark:bg-gray-800 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <IconChevronLeft className="w-5 h-5 mr-2" /> {t("Previous")}
          </button>
          <div className="flex space-x-2">{renderPaginationButtons()}</div>
          <button
            className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background dark:bg-gray-800 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            {t("Next")} <IconChevronRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}

      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title={t("Delete Customer")}
        message={t(
          "Are you sure you want to permanently delete {{name}}? Associated custom pricing and Jelly Polly debtor openings will also be removed. This action cannot be undone.",
          { name: customerToDelete?.name }
        )}
        confirmButtonText={t("delete", { ns: "common" })}
      />
      <BranchLinkageModal
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
        initialCustomerId={branchModalCustomerId}
      />
    </div>
  );
};

export default CustomerPage;
