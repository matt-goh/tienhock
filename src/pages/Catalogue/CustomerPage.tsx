import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Customer } from "../../types/types";
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconRefresh,
  IconBuildingSkyscraper,
  IconCurrencyDollar,
  IconChartBar,
  IconX,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import CustomerCard from "../../components/Catalogue/CustomerCard";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  EnhancedCustomerList,
  refreshCustomersCache,
  useCustomersCache,
} from "../../utils/catalogue/useCustomerCache";
import { refreshAccountCodesCache } from "../../utils/accounting/useAccountingCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import BranchLinkageModal from "../../components/Catalogue/BranchLinkageModal";
import CustomPricingManagerModal from "../../components/Catalogue/CustomPricingManagerModal";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import { usePersistedFilters } from "../../hooks/usePersistedFilters";
import PillSelect, { PillSelectOption } from "../../components/PillSelect";

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
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
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

  const salesmanPillOptions: ReadonlyArray<PillSelectOption<string>> = useMemo(
    () =>
      salesmen.map(
        (salesman: string): PillSelectOption<string> => ({
          value: salesman,
          label: salesman === "All Salesmen" ? t(salesman) : salesman,
        })
      ),
    [salesmen, t]
  );

  const branchGroupPillOptions: ReadonlyArray<PillSelectOption<string>> =
    useMemo(
      () =>
        branchFilterOptions.map(
          (branchGroup: string): PillSelectOption<string> => ({
            value: branchGroup,
            label:
              branchGroup === ALL_BRANCHES ||
              branchGroup === IN_BRANCH_GROUP ||
              branchGroup === NO_BRANCH_GROUP
                ? t(branchGroup)
                : branchGroup,
          })
        ),
      [branchFilterOptions, t]
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
      <div className="sticky top-0 z-30 -mx-4 -mt-2.5 px-4 pt-2.5 pb-3 border-b border-default-200 dark:border-gray-700 bg-white/95 dark:bg-gray-950/95 backdrop-blur flex flex-wrap items-center gap-x-2 gap-y-3">
        <div className="order-1 flex items-center flex-shrink-0">
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            {t("Customers ({{total}})", { total: filteredCustomers.length })}
          </h1>
        </div>

        <div className="order-3 w-full md:order-2 md:w-auto md:ml-auto min-w-0">
          <div className="relative flex-1 min-w-0 md:w-64 md:flex-none">
            <IconSearch
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400"
              stroke={1.5}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("search", { ns: "common" })}
              className="w-full h-[40px] rounded-lg border border-default-300 dark:border-gray-600 pl-9 pr-8 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-900/50 text-default-800 dark:text-gray-100"
              value={searchTerm}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                setSearchTerm(event.target.value)
              }
            />
            {searchTerm && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                onClick={() => setSearchTerm("")}
                title={t("Clear search")}
              >
                <IconX size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="order-4 w-full flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="mr-0.5 text-xs font-medium text-default-500 dark:text-gray-400">
            {t("Salesman")}
          </span>
          <PillSelect<string>
            value={selectedSalesman}
            onChange={setSelectedSalesman}
            options={salesmanPillOptions}
            className="!contents"
            ariaLabel={t("Salesman")}
          />

          <span className="h-5 w-px bg-default-300 dark:bg-gray-600 mx-1" />

          <span className="mr-0.5 text-xs font-medium text-default-500 dark:text-gray-400">
            {t("Branches")}
          </span>
          <PillSelect<string>
            value={selectedBranchGroup}
            onChange={setSelectedBranchGroup}
            options={branchGroupPillOptions}
            className="!contents"
            ariaLabel={t("Branches")}
          />
        </div>

        <div className="order-2 ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 md:order-3 md:ml-0">
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
            onClick={(): void => setIsPricingModalOpen(true)}
            variant="outline"
            icon={IconCurrencyDollar}
            title={t("Manage all customer custom prices")}
          >
            {t("Custom Prices")}
          </Button>
          <Button
            onClick={() => navigate("/sales/summary/customer")}
            variant="outline"
            icon={IconChartBar}
          >
            {t("Sales by Customer")}
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
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
          }}
        >
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
      {isPricingModalOpen && (
        <CustomPricingManagerModal
          isOpen={isPricingModalOpen}
          onClose={(): void => setIsPricingModalOpen(false)}
        />
      )}
    </div>
  );
};

export default CustomerPage;
