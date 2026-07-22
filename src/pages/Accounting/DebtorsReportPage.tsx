// src/pages/Accounting/DebtorsReportPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconDownload,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsDown,
  IconChevronsUp,
  IconAlertCircle,
  IconUser,
  IconListDetails,
  IconBuildingStore,
  IconRefresh,
  IconPhone,
  IconFileText,
  IconReceipt,
  IconCheck,
} from "@tabler/icons-react";
import MonthNavigator from "../../components/MonthNavigator";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import { generateDebtorsReportPDF } from "../../utils/accounting/DebtorsReportPDF";
import { generateCustomerStatementPDF } from "../../utils/accounting/CustomerStatementPDF";
import { generateGeneralStatementPDF } from "../../utils/accounting/GeneralStatementPDF";
import {
  type CompanyInfo,
  TIENHOCK_INFO,
} from "../../utils/invoice/einvoice/companyInfo";
import toast from "react-hot-toast";
import { AdjustmentDocTypeBadge } from "../../components/AdjustmentDocs/AdjustmentDocBadge";
import type { AdjustmentDocType } from "../../types/types";
import { formatAdjustmentDocDisplayId } from "../../utils/adjustments/formatDocId";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";

interface Payment {
  payment_id: number;
  payment_method: string;
  payment_reference: string | null;
  date: string;
  amount: number;
}

interface DebtorAdjustmentDocument {
  id: string;
  display_id: string | null;
  type: AdjustmentDocType;
  date: string;
  debit_amount: number;
  credit_amount: number;
  reason: string | null;
}

interface Invoice {
  invoice_id: string;
  invoice_number: string;
  date: string;
  amount: number;
  payments: Payment[];
  adjustmentDocs?: DebtorAdjustmentDocument[];
  balance: number;
}

interface Customer {
  customer_id: string;
  customer_name: string;
  phone_number?: string;
  address?: string;
  city?: string;
  state?: string;
  invoices: Invoice[];
  total_amount: number;
  total_paid: number;
  total_balance: number;
  credit_limit: number;
  credit_balance: number;
  // Non-posting display extra (TH only): unapplied receipt overpayment held
  // in CUST_DEP; 0/undefined when the customer has none or the backend
  // doesn't track overpayments (e.g. Jelly Polly).
  unapplied_overpayment?: number;
}

interface Salesman {
  salesman_id: string;
  salesman_name: string;
  customers: Customer[];
  total_balance: number;
}

interface DebtorsData {
  salesmen: Salesman[];
  grand_total_amount: number;
  grand_total_paid: number;
  grand_total_balance: number;
  report_date: string | number;
}

interface DebtorsTotals {
  totalAmount: number;
  totalPaid: number;
  totalBalance: number;
}

// Row shape of the general-statement endpoint (also used by GeneralStatementPDF).
interface CustomerListRow {
  account_no: string;
  particular: string;
  bal_bf: number;
  current_invoices: number;
  payment: number;
  total_due: number;
}

interface CustomerListTotals {
  bal_bf: number;
  current_invoices: number;
  payment: number;
  total_due: number;
}

interface CustomerListData {
  statement_date: string;
  statement_month: number;
  statement_year: number;
  customers: CustomerListRow[];
  totals: CustomerListTotals;
  total_customers: number;
  page: number;
}

type DebtorsViewMode = "customer" | "salesman";

export interface DebtorsReportPageConfig {
  debtorsEndpoint: string;
  statementEndpoint: (
    customerId: string,
    month: number,
    year: number
  ) => string;
  generalStatementEndpoint: (month: number, year: number) => string;
  customerDetailsPath: (customerId: string) => string;
  customerInvoicesPath: (customerId: string) => string;
  invoiceDetailsPath: (invoiceId: string) => string;
  adjustmentDocDetailsPath?: (adjustmentDocId: string) => string;
  companyName: string;
  statementCompanyInfo?: CompanyInfo;
  statementCompanyName?: string;
  monthPickerPlacement?: "bottom-center" | "bottom-right" | "bottom-left-button";
}

interface DebtorsReportPageProps {
  config?: DebtorsReportPageConfig;
}

const DEFAULT_DEBTORS_REPORT_CONFIG: DebtorsReportPageConfig = {
  debtorsEndpoint: "/api/debtors",
  statementEndpoint: (customerId: string, month: number, year: number): string =>
    `/api/debtors/statement/${customerId}?month=${month}&year=${year}`,
  generalStatementEndpoint: (month: number, year: number): string =>
    `/api/debtors/general-statement?month=${month}&year=${year}`,
  customerDetailsPath: (customerId: string): string =>
    `/catalogue/customer/${customerId}`,
  customerInvoicesPath: (customerId: string): string =>
    `/sales/invoice?customerId=${customerId}`,
  invoiceDetailsPath: (invoiceId: string): string =>
    `/sales/invoice/${invoiceId}`,
  adjustmentDocDetailsPath: (adjustmentDocId: string): string =>
    `/sales/adjustment-docs/${adjustmentDocId}`,
  companyName: TIENHOCK_INFO.name,
  statementCompanyInfo: TIENHOCK_INFO,
  statementCompanyName: "TIEN HOCK FOOD INDUSTRIES SDN BHD (953309-T)",
  monthPickerPlacement: "bottom-left-button",
};

const appendMonthYearParams = (
  endpoint: string,
  month: number,
  year: number
): string => {
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}month=${month}&year=${year}`;
};

// Keyed by the endpoint so each company's report keeps its own last-viewed month.
const selectedMonthStorageKey = (debtorsEndpoint: string): string =>
  `debtorsReport.selectedMonth:${debtorsEndpoint}`;

const readStoredSelectedMonth = (debtorsEndpoint: string): Date | null => {
  if (typeof window === "undefined") return null;

  try {
    const stored: string | null = window.localStorage.getItem(
      selectedMonthStorageKey(debtorsEndpoint)
    );
    const match: RegExpExecArray | null = stored
      ? /^(\d{4})-(\d{2})$/.exec(stored)
      : null;
    if (!match) return null;

    const yearValue: number = Number.parseInt(match[1], 10);
    const monthIndex: number = Number.parseInt(match[2], 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) return null;

    return new Date(yearValue, monthIndex, 1);
  } catch (_error: unknown) {
    return null;
  }
};

const storeSelectedMonth = (debtorsEndpoint: string, date: Date): void => {
  if (typeof window === "undefined") return;

  try {
    const value = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
    window.localStorage.setItem(selectedMonthStorageKey(debtorsEndpoint), value);
  } catch (_error: unknown) {
    // Month preservation is best-effort when browser storage is unavailable.
  }
};

// Keyed by the endpoint so each company's report keeps its own last-used view.
const viewModeStorageKey = (debtorsEndpoint: string): string =>
  `debtorsReport.viewMode:${debtorsEndpoint}`;

const readStoredViewMode = (debtorsEndpoint: string): DebtorsViewMode => {
  if (typeof window === "undefined") return "customer";

  try {
    const stored: string | null = window.localStorage.getItem(
      viewModeStorageKey(debtorsEndpoint)
    );
    return stored === "salesman" ? "salesman" : "customer";
  } catch (_error: unknown) {
    return "customer";
  }
};

const storeViewMode = (
  debtorsEndpoint: string,
  mode: DebtorsViewMode
): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(viewModeStorageKey(debtorsEndpoint), mode);
  } catch (_error: unknown) {
    // View preservation is best-effort when browser storage is unavailable.
  }
};

// Search term and zero-balance filter are likewise preserved per company so
// they survive navigating away and back.
const searchTermStorageKey = (debtorsEndpoint: string): string =>
  `debtorsReport.searchTerm:${debtorsEndpoint}`;

const readStoredSearchTerm = (debtorsEndpoint: string): string => {
  if (typeof window === "undefined") return "";

  try {
    return (
      window.localStorage.getItem(searchTermStorageKey(debtorsEndpoint)) ?? ""
    );
  } catch (_error: unknown) {
    return "";
  }
};

const storeSearchTerm = (debtorsEndpoint: string, value: string): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(searchTermStorageKey(debtorsEndpoint), value);
  } catch (_error: unknown) {
    // Best-effort when browser storage is unavailable.
  }
};

const hideZeroBalancesStorageKey = (debtorsEndpoint: string): string =>
  `debtorsReport.hideZeroBalances:${debtorsEndpoint}`;

const readStoredHideZeroBalances = (debtorsEndpoint: string): boolean => {
  if (typeof window === "undefined") return true;

  try {
    const stored: string | null = window.localStorage.getItem(
      hideZeroBalancesStorageKey(debtorsEndpoint)
    );
    // Zero balances are hidden by default until the user toggles them on.
    return stored === null ? true : stored === "1";
  } catch (_error: unknown) {
    return true;
  }
};

const storeHideZeroBalances = (
  debtorsEndpoint: string,
  hide: boolean
): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      hideZeroBalancesStorageKey(debtorsEndpoint),
      hide ? "1" : "0"
    );
  } catch (_error: unknown) {
    // Best-effort when browser storage is unavailable.
  }
};

// By Customer view pagination: fixed 100 rows per page, current page kept per
// company so it survives navigating away and back.
const CUSTOMER_PAGE_LIMIT = 100;

const customerPageStorageKey = (debtorsEndpoint: string): string =>
  `debtorsReport.customerPage:${debtorsEndpoint}`;

const readStoredCustomerPage = (debtorsEndpoint: string): number => {
  if (typeof window === "undefined") return 1;

  try {
    const stored: string | null = window.localStorage.getItem(
      customerPageStorageKey(debtorsEndpoint)
    );
    const page: number = stored ? Number.parseInt(stored, 10) : 1;
    return Number.isFinite(page) && page > 0 ? page : 1;
  } catch (_error: unknown) {
    return 1;
  }
};

const storeCustomerPage = (debtorsEndpoint: string, page: number): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      customerPageStorageKey(debtorsEndpoint),
      String(page)
    );
  } catch (_error: unknown) {
    // Best-effort when browser storage is unavailable.
  }
};

// Salesman-view accordion expand/collapse state is likewise preserved per
// company so it survives navigating away and back.
const expandedSalesmenStorageKey = (debtorsEndpoint: string): string =>
  `debtorsReport.expandedSalesmen:${debtorsEndpoint}`;

const expandedCustomersStorageKey = (debtorsEndpoint: string): string =>
  `debtorsReport.expandedCustomers:${debtorsEndpoint}`;

// null = nothing stored yet (first visit); an array (even empty) is the
// user's own accordion state.
const readStoredExpandedSet = (storageKey: string): string[] | null => {
  if (typeof window === "undefined") return null;

  try {
    const stored: string | null = window.localStorage.getItem(storageKey);
    if (stored === null) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id: unknown): id is string => typeof id === "string");
  } catch (_error: unknown) {
    return null;
  }
};

const storeExpandedSet = (storageKey: string, expanded: Set<string>): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...expanded]));
  } catch (_error: unknown) {
    // Best-effort when browser storage is unavailable.
  }
};

const calculateCustomerTotals = (customers: Customer[]): DebtorsTotals => {
  return customers.reduce<DebtorsTotals>(
    (totals: DebtorsTotals, customer: Customer): DebtorsTotals => ({
      totalAmount: totals.totalAmount + customer.total_amount,
      totalPaid: totals.totalPaid + customer.total_paid,
      totalBalance: totals.totalBalance + customer.total_balance,
    }),
    { totalAmount: 0, totalPaid: 0, totalBalance: 0 }
  );
};

const calculateSalesmenTotals = (salesmen: Salesman[]): DebtorsTotals => {
  return salesmen.reduce<DebtorsTotals>(
    (totals: DebtorsTotals, salesman: Salesman): DebtorsTotals => {
      const salesmanTotals = calculateCustomerTotals(salesman.customers);
      return {
        totalAmount: totals.totalAmount + salesmanTotals.totalAmount,
        totalPaid: totals.totalPaid + salesmanTotals.totalPaid,
        totalBalance: totals.totalBalance + salesmanTotals.totalBalance,
      };
    },
    { totalAmount: 0, totalPaid: 0, totalBalance: 0 }
  );
};

const getAdjustmentBalanceEffect = (
  adjustment: DebtorAdjustmentDocument
): number => {
  return (
    Number(adjustment.debit_amount || 0) -
    Number(adjustment.credit_amount || 0)
  );
};

const DebtorsReportPage: React.FC<DebtorsReportPageProps> = ({
  config = DEFAULT_DEBTORS_REPORT_CONFIG,
}) => {
  const navigate = useNavigate();
  const adjustmentDocDetailsPath = config.adjustmentDocDetailsPath;
  const showsAdjustmentDocs: boolean = Boolean(adjustmentDocDetailsPath);
  const [debtorsData, setDebtorsData] = useState<DebtorsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>(() =>
    readStoredSearchTerm(config.debtorsEndpoint)
  );
  // null = first visit: the fetch keeps its legacy expand-all-salesmen
  // default; a stored array (even empty) is the user's own accordion state.
  const [initialStoredSalesmen] = useState<string[] | null>(() =>
    readStoredExpandedSet(expandedSalesmenStorageKey(config.debtorsEndpoint))
  );
  const [expandedSalesmen, setExpandedSalesmen] = useState<Set<string>>(
    () => new Set(initialStoredSalesmen ?? [])
  );
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    () =>
      new Set(
        readStoredExpandedSet(
          expandedCustomersStorageKey(config.debtorsEndpoint)
        ) ?? []
      )
  );

  // By Customer (default, an interactive Trade Debtor List over every
  // customer incl. zero balances) vs the salesman-grouped outstanding view.
  const [viewMode, setViewMode] = useState<DebtorsViewMode>(() =>
    readStoredViewMode(config.debtorsEndpoint)
  );
  const [customerListData, setCustomerListData] =
    useState<CustomerListData | null>(null);
  // Starts true when the customer view is the initial view so the first
  // render shows the spinner instead of a one-frame error flash.
  const [customerListLoading, setCustomerListLoading] = useState<boolean>(
    () => readStoredViewMode(config.debtorsEndpoint) === "customer"
  );
  const [customerListError, setCustomerListError] = useState<string | null>(
    null
  );
  const [hideZeroBalances, setHideZeroBalances] = useState<boolean>(() =>
    readStoredHideZeroBalances(config.debtorsEndpoint)
  );
  const [customerPage, setCustomerPage] = useState<number>(() =>
    readStoredCustomerPage(config.debtorsEndpoint)
  );
  // Search only applies when the input loses focus (or Enter is pressed), so
  // typing does not fire the (ledger-heavy) customer-list fetch per keystroke.
  const [appliedSearch, setAppliedSearch] = useState<string>(searchTerm);

  const handleSearchChange = (value: string): void => {
    setSearchTerm(value);
    storeSearchTerm(config.debtorsEndpoint, value);
  };

  const commitSearch = (): void => {
    if (searchTerm === appliedSearch) return;
    setAppliedSearch(searchTerm);
    setCustomerPage(1);
    storeCustomerPage(config.debtorsEndpoint, 1);
  };

  const handleClearSearch = (): void => {
    handleSearchChange("");
    if (appliedSearch !== "") {
      setAppliedSearch("");
      setCustomerPage(1);
      storeCustomerPage(config.debtorsEndpoint, 1);
    }
  };

  const handleHideZeroBalancesToggle = (): void => {
    setHideZeroBalances((prev: boolean): boolean => {
      const next: boolean = !prev;
      storeHideZeroBalances(config.debtorsEndpoint, next);
      return next;
    });
    setCustomerPage(1);
    storeCustomerPage(config.debtorsEndpoint, 1);
  };

  const handleCustomerPageChange = (page: number): void => {
    setCustomerPage(page);
    storeCustomerPage(config.debtorsEndpoint, page);
  };

  // Month selection state, restored from the last month this report was viewed
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const storedMonth: Date | null = readStoredSelectedMonth(
      config.debtorsEndpoint
    );
    if (storedMonth) return storedMonth;

    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [allTimeMode, setAllTimeMode] = useState(false);

  // Centralized data fetching function with manual URL construction
  const fetchDebtors = useCallback(
    async (params?: { month: number; year: number }): Promise<void> => {
      let url = config.debtorsEndpoint;
      if (params && params.month && params.year) {
        url = appendMonthYearParams(url, params.month, params.year);
      }

      try {
        setLoading(true);
        setError(null);

        // Make the API call with the constructed URL string
        const response = await api.get(url);
        const data = response;

        const processedData: DebtorsData = {
          ...data,
          report_date: formatDateFromTimestamp(data.report_date),
          salesmen: data.salesmen.map((salesman: Salesman) => ({
            ...salesman,
            customers: salesman.customers.map((customer: Customer) => ({
              ...customer,
              invoices: customer.invoices.map((invoice: Invoice) => ({
                ...invoice,
                date: formatDate(invoice.date),
                payments: invoice.payments.map((payment: Payment) => ({
                  ...payment,
                  date: formatDateFromTimestamp(payment.date),
                })),
                adjustmentDocs: (invoice.adjustmentDocs ?? []).map(
                  (
                    adjustment: DebtorAdjustmentDocument
                  ): DebtorAdjustmentDocument => ({
                    ...adjustment,
                    date: formatDate(adjustment.date),
                  })
                ),
              })),
            })),
          })),
        };

        setDebtorsData(processedData);

        // First visit only: default to every salesman expanded. Once the
        // user has their own stored accordion state it is left untouched.
        if (initialStoredSalesmen === null) {
          const salesmenIds = data.salesmen.map(
            (s: Salesman) => s.salesman_id
          );
          setExpandedSalesmen(new Set(salesmenIds));
        }
      } catch (err) {
        setError("Failed to fetch debtors data. Please try again later.");
        console.error("Error fetching debtors:", err);
      } finally {
        setLoading(false);
      }
    },
    [config.debtorsEndpoint, initialStoredSalesmen]
  );

  // Customer-view fetch: the general-statement endpoint with includeZero=1 so
  // every customer appears, server-side searched/filtered and paginated.
  const fetchCustomerList = useCallback(
    async (params: {
      month: number;
      year: number;
      page: number;
      search: string;
      hideZero: boolean;
    }): Promise<void> => {
      try {
        setCustomerListLoading(true);
        setCustomerListError(null);

        const url =
          `${config.generalStatementEndpoint(params.month, params.year)}` +
          `&includeZero=1&page=${params.page}&limit=${CUSTOMER_PAGE_LIMIT}` +
          `&search=${encodeURIComponent(params.search)}` +
          (params.hideZero ? "&hideZero=1" : "");
        const data = await api.get(url);
        setCustomerListData(data);
      } catch (err) {
        setCustomerListError(
          "Failed to fetch customer list. Please try again later."
        );
        console.error("Error fetching customer list:", err);
      } finally {
        setCustomerListLoading(false);
      }
    },
    [config.generalStatementEndpoint]
  );

  // Fetch the active view's dataset for the selected month
  useEffect(() => {
    if (viewMode === "customer") {
      fetchCustomerList({
        month: selectedMonth.getMonth() + 1,
        year: selectedMonth.getFullYear(),
        page: customerPage,
        search: appliedSearch,
        hideZero: hideZeroBalances,
      });
      return;
    }
    if (allTimeMode) {
      fetchDebtors();
    } else {
      fetchDebtors({
        month: selectedMonth.getMonth() + 1,
        year: selectedMonth.getFullYear(),
      });
    }
  }, [
    fetchDebtors,
    fetchCustomerList,
    selectedMonth,
    allTimeMode,
    viewMode,
    customerPage,
    appliedSearch,
    hideZeroBalances,
  ]);

  // Preserve the salesman-view accordion state across navigations, keyed per
  // company like the other report settings above.
  useEffect(() => {
    storeExpandedSet(
      expandedSalesmenStorageKey(config.debtorsEndpoint),
      expandedSalesmen
    );
  }, [expandedSalesmen, config.debtorsEndpoint]);

  useEffect(() => {
    storeExpandedSet(
      expandedCustomersStorageKey(config.debtorsEndpoint),
      expandedCustomers
    );
  }, [expandedCustomers, config.debtorsEndpoint]);

  // Preserve the scroll position across navigations (same pattern as the
  // Journal Entry list page), keyed per company. Ready once the active view
  // has its data rendered.
  useScrollRestoration(
    `debtors-report:${config.debtorsEndpoint}`,
    viewMode === "customer"
      ? !customerListLoading && customerListData !== null
      : !loading && debtorsData !== null
  );

  // Switch between the By Customer and By Salesman views
  const handleViewModeChange = useCallback(
    (mode: DebtorsViewMode): void => {
      if (mode === viewMode) return;
      if (mode === "customer") {
        // All Time has no meaning for the month-as-at customer list.
        setAllTimeMode(false);
        // The effect refetches on the viewMode change; show the spinner
        // immediately so stale/no data never flashes the error block.
        setCustomerListLoading(true);
      }
      setViewMode(mode);
      storeViewMode(config.debtorsEndpoint, mode);
    },
    [viewMode, config.debtorsEndpoint]
  );

  // Handle month selection change from MonthNavigator
  const handleMonthChange = useCallback(
    (newDate: Date) => {
      setAllTimeMode(false);
      setSelectedMonth(newDate);
      storeSelectedMonth(config.debtorsEndpoint, newDate);
    },
    [config.debtorsEndpoint]
  );

  // Toggle all time mode
  const handleAllTimeToggle = useCallback(() => {
    setAllTimeMode((prev) => !prev);
  }, []);

  const handleRefresh = () => {
    if (viewMode === "customer") {
      fetchCustomerList({
        month: selectedMonth.getMonth() + 1,
        year: selectedMonth.getFullYear(),
        page: customerPage,
        search: appliedSearch,
        hideZero: hideZeroBalances,
      });
      return;
    }
    if (allTimeMode) {
      fetchDebtors();
    } else {
      fetchDebtors({
        month: selectedMonth.getMonth() + 1,
        year: selectedMonth.getFullYear(),
      });
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    if (/^\d+$/.test(dateString)) {
      const date = new Date(parseInt(dateString, 10));
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatDateFromTimestamp = (timestamp: string | number): string => {
    if (!timestamp) return "N/A";
    const date = new Date(
      typeof timestamp === "number" ? timestamp * 1000 : timestamp
    );
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatBalanceEffect = (amount: number): string => {
    if (Math.abs(amount) < 0.005) return "-";
    return `${amount > 0 ? "+" : "-"} RM ${formatCurrency(Math.abs(amount))}`;
  };

  const toggleSalesman = (salesmanId: string): void => {
    setExpandedSalesmen((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(salesmanId)) {
        newSet.delete(salesmanId);
      } else {
        newSet.add(salesmanId);
      }
      return newSet;
    });
  };

  const getCustomerIdsForSalesmen = (salesmen: Salesman[]): string[] => {
    return salesmen.flatMap((salesman: Salesman): string[] =>
      salesman.customers.map((customer: Customer): string => customer.customer_id)
    );
  };

  const isSalesmanFullyExpanded = (salesman: Salesman): boolean => {
    return (
      expandedSalesmen.has(salesman.salesman_id) &&
      salesman.customers.every((customer: Customer): boolean =>
        expandedCustomers.has(customer.customer_id)
      )
    );
  };

  const toggleSalesmanAndCustomers = (salesman: Salesman): void => {
    const customerIds = salesman.customers.map(
      (customer: Customer): string => customer.customer_id
    );
    const isFullyExpanded = isSalesmanFullyExpanded(salesman);

    setExpandedSalesmen((prev: Set<string>): Set<string> => {
      const newSet = new Set(prev);
      if (isFullyExpanded) {
        newSet.delete(salesman.salesman_id);
      } else {
        newSet.add(salesman.salesman_id);
      }
      return newSet;
    });

    setExpandedCustomers((prev: Set<string>): Set<string> => {
      const newSet = new Set(prev);
      customerIds.forEach((customerId: string): void => {
        if (isFullyExpanded) {
          newSet.delete(customerId);
        } else {
          newSet.add(customerId);
        }
      });
      return newSet;
    });
  };

  const toggleAllDebtors = (salesmen: Salesman[]): void => {
    const visibleSalesmanIds = salesmen.map(
      (salesman: Salesman): string => salesman.salesman_id
    );
    const visibleCustomerIds = getCustomerIdsForSalesmen(salesmen);
    const allVisibleExpanded =
      visibleSalesmanIds.every((salesmanId: string): boolean =>
        expandedSalesmen.has(salesmanId)
      ) &&
      visibleCustomerIds.every((customerId: string): boolean =>
        expandedCustomers.has(customerId)
      );

    setExpandedSalesmen((prev: Set<string>): Set<string> => {
      const newSet = new Set(prev);
      visibleSalesmanIds.forEach((salesmanId: string): void => {
        if (allVisibleExpanded) {
          newSet.delete(salesmanId);
        } else {
          newSet.add(salesmanId);
        }
      });
      return newSet;
    });

    setExpandedCustomers((prev: Set<string>): Set<string> => {
      const newSet = new Set(prev);
      visibleCustomerIds.forEach((customerId: string): void => {
        if (allVisibleExpanded) {
          newSet.delete(customerId);
        } else {
          newSet.add(customerId);
        }
      });
      return newSet;
    });
  };

  const toggleCustomer = (customerId: string): void => {
    setExpandedCustomers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
      }
      return newSet;
    });
  };

  const handleCustomerClick = (customerId: string): void => {
    navigate(config.customerInvoicesPath(customerId));
  };

  const handlePrint = async (): Promise<void> => {
    if (!filteredData) return;
    try {
      const loadingToast = toast.loading("Generating PDF...");
      const filterName = allTimeMode
        ? undefined
        : selectedMonth.toLocaleDateString("en", {
            month: "long",
            year: "numeric",
          });
      await generateDebtorsReportPDF(filteredData, "print", {
        filterMonthName: filterName,
        companyName: config.companyName,
      });
      toast.dismiss(loadingToast);
      toast.success("Print dialog opened");
    } catch (error) {
      console.error("Error printing report:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const handlePrintStatement = async (customerId: string): Promise<void> => {
    if (allTimeMode) {
      toast.error("Please select a specific month to print statement");
      return;
    }

    try {
      const loadingToast = toast.loading("Generating statement...");
      const month = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();

      const statementData = await api.get(
        config.statementEndpoint(customerId, month, year)
      );

      await generateCustomerStatementPDF(statementData, "print", {
        companyInfo: config.statementCompanyInfo,
        companyName: config.statementCompanyName,
      });
      toast.dismiss(loadingToast);
      toast.success("Statement generated");
    } catch (error) {
      console.error("Error generating customer statement:", error);
      toast.error("Failed to generate statement");
    }
  };

  const handlePrintGeneralStatement = async (): Promise<void> => {
    if (allTimeMode) {
      toast.error("Please select a specific month to print general statement");
      return;
    }

    try {
      const loadingToast = toast.loading("Generating trade debtor list...");
      const month = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();

      const statementData = await api.get(
        config.generalStatementEndpoint(month, year)
      );

      await generateGeneralStatementPDF(statementData, "print", {
        companyName: config.statementCompanyName || config.companyName,
      });
      toast.dismiss(loadingToast);
      toast.success("Trade debtor list generated");
    } catch (error) {
      console.error("Error generating general statement:", error);
      toast.error("Failed to generate trade debtor list");
    }
  };

  const filterData = (data: DebtorsData): DebtorsData => {
    if (!searchTerm) return data;
    const filtered: DebtorsData = {
      ...data,
      salesmen: data.salesmen
        .map((salesman: Salesman): Salesman => {
          const customers = salesman.customers.filter(
            (customer) =>
              customer.customer_name
                .toLowerCase()
                .includes(searchTerm.toLowerCase()) ||
              customer.customer_id
                .toLowerCase()
                .includes(searchTerm.toLowerCase())
          );
          const totals = calculateCustomerTotals(customers);
          return {
            ...salesman,
            customers,
            total_balance: totals.totalBalance,
          };
        })
        .filter((salesman: Salesman): boolean => salesman.customers.length > 0),
    };
    const totals = calculateSalesmenTotals(filtered.salesmen);
    filtered.grand_total_amount = totals.totalAmount;
    filtered.grand_total_paid = totals.totalPaid;
    filtered.grand_total_balance = totals.totalBalance;
    return filtered;
  };

  const isCustomerView: boolean = viewMode === "customer";
  const activeLoading: boolean = isCustomerView
    ? customerListLoading
    : loading;
  const activeError: string | null = isCustomerView
    ? customerListError
    : error;
  const activeDataMissing: boolean = isCustomerView
    ? !customerListData
    : !debtorsData;

  if (activeLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (activeError || activeDataMissing) {
    return (
      <div className="text-center py-12 border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
        <IconAlertCircle size={48} className="text-rose-500 dark:text-rose-400 mb-4 mx-auto" />
        <h3 className="text-lg font-medium text-default-800 dark:text-gray-100 mb-2">
          Error Loading Report
        </h3>
        <p className="text-default-500 dark:text-gray-400 mb-6">{activeError}</p>
        <Button onClick={handleRefresh} icon={IconRefresh} variant="outline">
          Refresh
        </Button>
      </div>
    );
  }

  const filteredData: DebtorsData | null =
    !isCustomerView && debtorsData ? filterData(debtorsData) : null;

  // Customer-view rows arrive already searched, zero-filtered and paginated
  // by the server (100 per page).
  const customerRows: CustomerListRow[] = customerListData?.customers ?? [];
  const customerTotalCount: number =
    customerListData?.total_customers ?? customerRows.length;
  const customerTotalPages: number = Math.max(
    1,
    Math.ceil(customerTotalCount / CUSTOMER_PAGE_LIMIT)
  );
  const customerCurrentPage: number = Math.min(
    customerListData?.page ?? customerPage,
    customerTotalPages
  );

  // Header stats follow the active view.
  const statsTotal: number = isCustomerView
    ? customerListData?.totals.current_invoices ?? 0
    : filteredData?.grand_total_amount ?? 0;
  const statsPaid: number = isCustomerView
    ? customerListData?.totals.payment ?? 0
    : filteredData?.grand_total_paid ?? 0;
  const statsOutstanding: number = isCustomerView
    ? customerListData?.totals.total_due ?? 0
    : filteredData?.grand_total_balance ?? 0;
  const statementEndDateLabel: string = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
    0
  ).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const allDebtorsExpanded =
    !isCustomerView &&
    filteredData !== null &&
    filteredData.salesmen.length > 0 &&
    filteredData.salesmen.every(
      (salesman: Salesman): boolean => isSalesmanFullyExpanded(salesman)
    );

  return (
    <div className="space-y-3">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:flex-wrap justify-between items-start lg:items-center gap-2 mb-3">
        {/* Left side: View Toggle + Month Navigator + Stats */}
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 md:gap-3">
          {/* View Toggle */}
          <div className="flex items-center rounded-full border border-default-300 dark:border-gray-600 overflow-hidden text-sm font-medium self-start">
            <button
              type="button"
              onClick={() => handleViewModeChange("customer")}
              className={`px-3 py-1 transition-colors whitespace-nowrap ${
                isCustomerView
                  ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                  : "bg-default-50 dark:bg-gray-700 text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-600"
              }`}
            >
              Customer
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("salesman")}
              className={`px-3 py-1 transition-colors whitespace-nowrap ${
                !isCustomerView
                  ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                  : "bg-default-50 dark:bg-gray-700 text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-600"
              }`}
            >
              Salesman
            </button>
          </div>

          <div className="flex items-center gap-2">
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
              size="sm"
              pickerPlacement={
                config.monthPickerPlacement ??
                DEFAULT_DEBTORS_REPORT_CONFIG.monthPickerPlacement
              }
            />
          </div>

          {/* Compact Stats */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <IconReceipt size={16} className="text-sky-600 dark:text-sky-400" />
              <span className="font-semibold text-default-700 dark:text-gray-200">
                RM {formatCurrency(statsTotal)}
              </span>
              <span className="text-default-400 dark:text-gray-400">total</span>
            </div>
            <span className="text-default-300 dark:text-gray-600">•</span>
            <div className="flex items-center gap-1.5">
              <IconCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                RM {formatCurrency(statsPaid)}
              </span>
              <span className="text-default-400 dark:text-gray-400">paid</span>
            </div>
            <span className="text-default-300 dark:text-gray-600">•</span>
            <div className="flex items-center gap-1.5">
              <IconAlertCircle size={16} className="text-rose-600 dark:text-rose-400" />
              <span className="font-semibold text-rose-700 dark:text-rose-300">
                RM {formatCurrency(statsOutstanding)}
              </span>
              <span className="text-default-400 dark:text-gray-400">outstanding</span>
            </div>
            {!isCustomerView && (
              <>
                <span className="text-default-300 dark:text-gray-600">|</span>
                {/* All Time Toggle */}
                <button
                  onClick={handleAllTimeToggle}
                  className={`px-3 py-1 rounded-full border text-sm font-medium transition-colors whitespace-nowrap ${
                    allTimeMode
                      ? "bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300"
                      : "bg-default-50 dark:bg-gray-700 border-default-300 dark:border-gray-600 text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-600"
                  }`}
                >
                  All Time
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right side: Search + Actions */}
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <div className="relative">
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onBlur={commitSearch}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              autoFocus
              className="px-3 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 w-[154px] placeholder-gray-400 dark:placeholder-gray-500"
            />
            {searchTerm && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300 transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClearSearch}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {!isCustomerView && filteredData && (
            <Button
              onClick={() => toggleAllDebtors(filteredData.salesmen)}
              variant="outline"
              size="sm"
              icon={allDebtorsExpanded ? IconChevronsUp : IconChevronsDown}
            >
            </Button>
          )}
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            icon={IconRefresh}
          >
          </Button>
          {!isCustomerView && (
            <Button
              onClick={handlePrint}
              size="sm"
              icon={IconDownload}
              disabled={loading}
            >
              Report
            </Button>
          )}
          <Button
            onClick={handlePrintGeneralStatement}
            size="sm"
            variant="outline"
            icon={IconReceipt}
            disabled={activeLoading || allTimeMode}
            title={allTimeMode ? "Select a specific month to print debtor list" : "Print debtor list for all customers"}
          >
            Debtor List
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
        {isCustomerView ? (
          customerRows.length === 0 ? (
            <div className="text-center py-8">
              <IconUser size={48} className="text-default-400 dark:text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-default-800 dark:text-gray-100 mb-2">
                No Results Found
              </h3>
              <p className="text-default-500 dark:text-gray-400">
                {searchTerm
                  ? "No customers match your search criteria."
                  : hideZeroBalances
                  ? "No customers with an outstanding balance for the selected period."
                  : "No customers available for the selected period."}
              </p>
            </div>
          ) : (
            <div>
              {/* List header: count + zero-balance filter */}
              <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2.5 border-b border-default-200 dark:border-gray-700">
                <p className="text-sm text-default-500 dark:text-gray-400">
                  {customerTotalCount} customer
                  {customerTotalCount !== 1 ? "s" : ""} • as at{" "}
                  {customerListData?.statement_date}
                </p>
                <button
                  type="button"
                  onClick={handleHideZeroBalancesToggle}
                  className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors whitespace-nowrap ${
                    hideZeroBalances
                      ? "bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300"
                      : "bg-default-50 dark:bg-gray-700 border-default-300 dark:border-gray-600 text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-600"
                  }`}
                >
                  {hideZeroBalances
                    ? "Zero balances hidden"
                    : "Hide zero balances"}
                </button>
              </div>

              {/* Customer table */}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-default-100 dark:bg-gray-900/50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                        Account No
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                        Customer
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                        Bal B/F
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                        Current
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                        Payment
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                        Total Due
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                    {customerRows.map((row: CustomerListRow) => {
                      const isZeroBalance: boolean =
                        Math.abs(row.total_due) <= 0.005;
                      return (
                        <tr
                          key={row.account_no}
                          className={`hover:bg-default-50 dark:hover:bg-gray-700 ${
                            isZeroBalance
                              ? "text-default-400 dark:text-gray-500"
                              : "text-default-800 dark:text-gray-100"
                          }`}
                        >
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {row.account_no}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`font-medium hover:text-sky-600 dark:hover:text-sky-400 hover:underline cursor-pointer ${
                                isZeroBalance
                                  ? "text-default-500 dark:text-gray-400"
                                  : ""
                              }`}
                              title={row.particular}
                              onClick={() =>
                                navigate(
                                  config.customerDetailsPath(row.account_no)
                                )
                              }
                            >
                              {row.particular}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            RM {formatCurrency(row.bal_bf)}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            RM {formatCurrency(row.current_invoices)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right whitespace-nowrap ${
                              isZeroBalance
                                ? ""
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            RM {formatCurrency(row.payment)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                              isZeroBalance
                                ? ""
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            RM {formatCurrency(row.total_due)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                icon={IconFileText}
                                title={`Print statement as at ${statementEndDateLabel}`}
                                onClick={() =>
                                  handlePrintStatement(row.account_no)
                                }
                              >
                                Statement
                              </Button>
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleCustomerClick(row.account_no)
                                }
                              >
                                Invoices
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination bar */}
              {customerTotalPages > 1 && (
                <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2.5 border-t border-default-200 dark:border-gray-700">
                  <p className="text-sm text-default-500 dark:text-gray-400">
                    Page {customerCurrentPage} of {customerTotalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={IconChevronLeft}
                      disabled={customerCurrentPage <= 1}
                      onClick={() =>
                        handleCustomerPageChange(customerCurrentPage - 1)
                      }
                    >
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={IconChevronRight}
                      disabled={customerCurrentPage >= customerTotalPages}
                      onClick={() =>
                        handleCustomerPageChange(customerCurrentPage + 1)
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}

              {/* Totals footer */}
              <div className="p-4 bg-default-50 dark:bg-gray-900/40">
                <div className="rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-4">
                  <div className="flex justify-between py-1 text-sm text-default-600 dark:text-gray-300">
                    <span>Total Bal B/F</span>
                    <span className="font-semibold text-default-900 dark:text-gray-100">
                      RM {formatCurrency(customerListData?.totals.bal_bf ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-sm text-default-600 dark:text-gray-300">
                    <span>Total Current</span>
                    <span className="font-semibold text-default-900 dark:text-gray-100">
                      RM{" "}
                      {formatCurrency(
                        customerListData?.totals.current_invoices ?? 0
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-sm text-default-600 dark:text-gray-300">
                    <span>Total Payment</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      RM {formatCurrency(customerListData?.totals.payment ?? 0)}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-default-200 dark:border-gray-700 pt-3 text-base font-bold text-default-900 dark:text-gray-100">
                    <span>Total Outstanding Balance</span>
                    <span className="text-rose-600 dark:text-rose-400">
                      RM{" "}
                      {formatCurrency(customerListData?.totals.total_due ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        ) : !filteredData || filteredData.salesmen.length === 0 ? (
          <div className="text-center py-8">
            <IconUser size={48} className="text-default-400 dark:text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-default-800 dark:text-gray-100 mb-2">
              No Results Found
            </h3>
            <p className="text-default-500 dark:text-gray-400">
              {searchTerm
                ? "No customers match your search criteria."
                : "No debtors data available for the selected period."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-default-200 dark:divide-gray-700">
            {filteredData.salesmen.map((salesman) => (
              <div
                key={salesman.salesman_id}
                className={`p-4 ${
                  expandedSalesmen.has(salesman.salesman_id) ? "pb-6" : ""
                }`}
              >
                {/* Salesman Header */}
                <div
                  className="flex items-center justify-between cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700 -m-4 px-4 py-3 rounded-lg transition-colors"
                  onClick={() => toggleSalesman(salesman.salesman_id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedSalesmen.has(salesman.salesman_id) ? (
                      <IconChevronDown size={20} className="text-default-500 dark:text-gray-400" />
                    ) : (
                      <IconChevronRight size={20} className="text-default-500 dark:text-gray-400" />
                    )}
                    <IconUser size={20} className="text-sky-600 dark:text-sky-400" />
                    <div>
                      <h3 className="text-lg font-semibold text-default-800 dark:text-gray-100">
                        {salesman.salesman_name}
                      </h3>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-default-500 dark:text-gray-400">
                        <span>
                          {salesman.customers.length} customer
                          {salesman.customers.length !== 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:border-sky-700 dark:hover:bg-sky-900/50 dark:hover:text-sky-200"
                          title={
                            isSalesmanFullyExpanded(salesman)
                              ? "Collapse salesman details"
                              : "Expand all customer details for this salesman"
                          }
                          aria-label={
                            isSalesmanFullyExpanded(salesman)
                              ? "Collapse salesman details"
                              : "Expand all customer details for this salesman"
                          }
                          onClick={(
                            e: React.MouseEvent<HTMLButtonElement>
                          ): void => {
                            e.stopPropagation();
                            toggleSalesmanAndCustomers(salesman);
                          }}
                        >
                          <IconListDetails size={14} />
                          <span>
                            {isSalesmanFullyExpanded(salesman)
                              ? "Collapse details"
                              : "Expand details"}
                          </span>
                        </button>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-default-500 dark:text-gray-400">Outstanding</p>
                    <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                      RM {formatCurrency(salesman.total_balance)}
                    </p>
                  </div>
                </div>

                {/* Customers */}
                {expandedSalesmen.has(salesman.salesman_id) && (
                  <div className="mt-5 mb-2 ml-8 space-y-3">
                    {salesman.customers.map((customer) => (
                      <div
                        key={customer.customer_id}
                        className="border border-default-200 dark:border-gray-700 rounded-lg"
                      >
                        {/* Customer Header */}
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => toggleCustomer(customer.customer_id)}
                        >
                          <div className="flex items-center gap-8">
                            <div className="flex items-center gap-3">
                              {expandedCustomers.has(customer.customer_id) ? (
                                <IconChevronDown
                                  size={16}
                                  className="text-default-500 dark:text-gray-400"
                                />
                              ) : (
                                <IconChevronRight
                                  size={16}
                                  className="text-default-500 dark:text-gray-400"
                                />
                              )}
                              <IconBuildingStore
                                size={16}
                                className="text-sky-600 dark:text-sky-400"
                              />
                              <div>
                                <span
                                  className="font-medium text-default-800 dark:text-gray-100 hover:text-sky-600 dark:hover:text-sky-400 hover:underline cursor-pointer"
                                  title={
                                    customer.customer_name ||
                                    customer.customer_id
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(config.customerDetailsPath(customer.customer_id));
                                  }}
                                >
                                  {customer.customer_name ||
                                    customer.customer_id}
                                </span>
                                <p className="text-sm text-default-500 dark:text-gray-400">
                                  ID: {customer.customer_id} •{" "}
                                  {customer.invoices.length} invoice
                                  {customer.invoices.length !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </div>
                            {customer.phone_number && (
                              <div className="flex items-center gap-2 text-default-600 dark:text-gray-400">
                                <IconPhone
                                  size={16}
                                  className="text-default-500 dark:text-gray-400"
                                />
                                <span className="font-medium">
                                  {customer.phone_number}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-default-500 dark:text-gray-400">Balance</p>
                              <p className="font-semibold text-rose-600 dark:text-rose-400">
                                RM {formatCurrency(customer.total_balance)}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              icon={IconFileText}
                              disabled={allTimeMode}
                              title={
                                allTimeMode
                                  ? "Select a specific month to print statement"
                                  : `Print statement as at ${statementEndDateLabel}`
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintStatement(customer.customer_id);
                              }}
                            >
                              Statement
                            </Button>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCustomerClick(customer.customer_id);
                              }}
                            >
                              Invoices
                            </Button>
                          </div>
                        </div>

                        {/* Customer Details */}
                        {expandedCustomers.has(customer.customer_id) && (
                          <div className="border-t border-default-200 dark:border-gray-700 p-3">
                            {/* Customer Summary */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                              <div>
                                <p className="text-xs text-default-500 dark:text-gray-400 uppercase">
                                  Total Amount
                                </p>
                                <p className="font-medium text-default-800 dark:text-gray-100">
                                  RM {formatCurrency(customer.total_amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-default-500 dark:text-gray-400 uppercase">
                                  Total Paid
                                </p>
                                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                                  RM {formatCurrency(customer.total_paid)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-default-500 dark:text-gray-400 uppercase">
                                  Credit Limit
                                </p>
                                <p className="font-medium text-default-800 dark:text-gray-100">
                                  RM {formatCurrency(customer.credit_limit)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-default-500 dark:text-gray-400 uppercase">
                                  Credit Balance
                                </p>
                                <p className="font-medium text-default-800 dark:text-gray-100">
                                  RM {formatCurrency(customer.credit_balance)}
                                </p>
                              </div>
                              {(customer.unapplied_overpayment ?? 0) > 0.005 && (
                                <div
                                  title="Overpaid amount held in customer deposits (CUST_DEP). Not offset against the outstanding balance."
                                >
                                  <p className="text-xs text-amber-600 dark:text-amber-400 uppercase">
                                    Overpayment Held
                                  </p>
                                  <p className="font-medium text-amber-700 dark:text-amber-300">
                                    RM{" "}
                                    {formatCurrency(
                                      customer.unapplied_overpayment ?? 0
                                    )}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Invoices Table */}
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="bg-default-100 dark:bg-gray-900/50">
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      #
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      {showsAdjustmentDocs
                                        ? "Invoice / Document No."
                                        : "Invoice No."}
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Date
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Amount
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Payment Method
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Reference
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Payment Date
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Paid Amount
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Balance
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                                  {customer.invoices.map((invoice, index) => (
                                    <React.Fragment key={invoice.invoice_id}>
                                      {invoice.payments.length === 0 ? (
                                        <tr
                                          className="hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer text-default-800 dark:text-gray-100"
                                          onClick={() => {
                                            navigate(
                                              config.invoiceDetailsPath(
                                                invoice.invoice_id
                                              ),
                                              {
                                                state: {
                                                  showPaymentForm: true,
                                                },
                                              }
                                            );
                                          }}
                                        >
                                          <td className="px-3 py-2">
                                            {index + 1}
                                          </td>
                                          <td className="px-3 py-2 font-medium">
                                            {invoice.invoice_number}
                                          </td>
                                          <td className="px-3 py-2">
                                            {invoice.date}
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            RM {formatCurrency(invoice.amount)}
                                          </td>
                                          <td className="px-3 py-2 text-default-400 dark:text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-default-400 dark:text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-default-400 dark:text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-right text-default-400 dark:text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-right font-medium text-rose-600 dark:text-rose-400">
                                            RM {formatCurrency(invoice.balance)}
                                          </td>
                                        </tr>
                                      ) : (
                                        invoice.payments.map(
                                          (payment, paymentIndex) => (
                                            <tr
                                              key={`${invoice.invoice_id}-${payment.payment_id}`}
                                              className={`hover:bg-default-50 dark:hover:bg-gray-700 text-default-800 dark:text-gray-100 ${
                                                invoice.balance !== 0
                                                  ? "cursor-pointer"
                                                  : ""
                                              }`}
                                              onClick={() => {
                                                if (invoice.balance !== 0) {
                                                  navigate(
                                                    config.invoiceDetailsPath(
                                                      invoice.invoice_id
                                                    ),
                                                    {
                                                      state: {
                                                        showPaymentForm: true,
                                                      },
                                                    }
                                                  );
                                                }
                                              }}
                                            >
                                              {paymentIndex === 0 && (
                                                <>
                                                  <td
                                                    className="px-3 py-2"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {index + 1}
                                                  </td>
                                                  <td
                                                    className="px-3 py-2 font-medium"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {invoice.invoice_number}
                                                  </td>
                                                  <td
                                                    className="px-3 py-2"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {invoice.date}
                                                  </td>
                                                  <td
                                                    className="px-3 py-2 text-right"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    RM{" "}
                                                    {formatCurrency(
                                                      invoice.amount
                                                    )}
                                                  </td>
                                                </>
                                              )}
                                              <td className="px-3 py-2">
                                                {payment.payment_method
                                                  ? payment.payment_method
                                                      .charAt(0)
                                                      .toUpperCase() +
                                                    payment.payment_method.slice(
                                                      1
                                                    )
                                                  : "-"}
                                              </td>
                                              <td className="px-3 py-2">
                                                {payment.payment_reference ||
                                                  "-"}
                                              </td>
                                              <td className="px-3 py-2">
                                                {payment.date}
                                              </td>
                                              <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                                                RM{" "}
                                                {formatCurrency(payment.amount)}
                                              </td>
                                              {paymentIndex === 0 && (
                                                <td
                                                  className="px-3 py-2 text-right font-medium text-rose-600 dark:text-rose-400"
                                                  rowSpan={
                                                    invoice.payments.length
                                                  }
                                                >
                                                  RM{" "}
                                                  {formatCurrency(
                                                    invoice.balance
                                                  )}
                                                </td>
                                              )}
                                            </tr>
                                          )
                                        )
                                      )}
                                      {showsAdjustmentDocs &&
                                        (invoice.adjustmentDocs ?? []).map(
                                          (
                                            adjustment: DebtorAdjustmentDocument
                                          ) => {
                                            const balanceEffect: number =
                                              getAdjustmentBalanceEffect(
                                                adjustment
                                              );
                                            const isDebitEffect: boolean =
                                              balanceEffect > 0;

                                            return (
                                              <tr
                                                key={`${invoice.invoice_id}-${adjustment.id}`}
                                                className="bg-sky-50/50 dark:bg-sky-950/20 text-default-800 dark:text-gray-100 hover:bg-sky-100/60 dark:hover:bg-sky-900/30"
                                              >
                                                <td className="px-3 py-2 text-default-400 dark:text-gray-500">
                                                  -
                                                </td>
                                                <td className="px-3 py-2">
                                                  <div className="flex items-center gap-2 whitespace-nowrap">
                                                    <AdjustmentDocTypeBadge
                                                      type={adjustment.type}
                                                    />
                                                    {adjustmentDocDetailsPath ? (
                                                      <button
                                                        type="button"
                                                        className="rounded-sm font-medium hover:text-sky-600 dark:hover:text-sky-400 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500"
                                                        onClick={() =>
                                                          navigate(
                                                            adjustmentDocDetailsPath(
                                                              adjustment.id
                                                            )
                                                          )
                                                        }
                                                      >
                                                        {formatAdjustmentDocDisplayId(
                                                          adjustment
                                                        )}
                                                      </button>
                                                    ) : (
                                                      <span className="font-medium">
                                                        {formatAdjustmentDocDisplayId(
                                                          adjustment
                                                        )}
                                                      </span>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                  {adjustment.date}
                                                </td>
                                                <td className="px-3 py-2 text-right text-default-400 dark:text-gray-500">
                                                  -
                                                </td>
                                                <td className="px-3 py-2 text-sky-700 dark:text-sky-300">
                                                  Adjustment
                                                </td>
                                                <td
                                                  className="px-3 py-2 max-w-xs truncate"
                                                  title={
                                                    adjustment.reason ||
                                                    undefined
                                                  }
                                                >
                                                  <span
                                                    className={`mr-2 font-medium ${
                                                      isDebitEffect
                                                        ? "text-rose-600 dark:text-rose-400"
                                                        : "text-emerald-600 dark:text-emerald-400"
                                                    }`}
                                                    title="Effect on outstanding balance"
                                                  >
                                                    {formatBalanceEffect(
                                                      balanceEffect
                                                    )}
                                                  </span>
                                                  {adjustment.reason || "-"}
                                                </td>
                                                <td className="px-3 py-2 text-default-400 dark:text-gray-500">
                                                  -
                                                </td>
                                                <td className="px-3 py-2 text-right text-default-400 dark:text-gray-500">
                                                  -
                                                </td>
                                                <td className="px-3 py-2 text-right text-default-400 dark:text-gray-500">
                                                  -
                                                </td>
                                              </tr>
                                            );
                                          }
                                        )}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900/50 font-semibold text-default-800 dark:text-gray-100">
                                    <td className="px-3 py-2" colSpan={3}>
                                      Subtotal for {customer.customer_id}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      RM {formatCurrency(customer.total_amount)}
                                    </td>
                                    <td className="px-3 py-2" colSpan={3}></td>
                                    <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                                      RM {formatCurrency(customer.total_paid)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-rose-600 dark:text-rose-400">
                                      RM {formatCurrency(customer.total_balance)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="p-4 bg-default-50 dark:bg-gray-900/40">
              <div className="rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-4">
                <div className="flex justify-between py-1 text-sm text-default-600 dark:text-gray-300">
                  <span>Total Invoice Amount</span>
                  <span className="font-semibold text-default-900 dark:text-gray-100">
                    RM {formatCurrency(filteredData.grand_total_amount)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-sm text-default-600 dark:text-gray-300">
                  <span>Total Amount Paid</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    RM {formatCurrency(filteredData.grand_total_paid)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between border-t border-default-200 dark:border-gray-700 pt-3 text-base font-bold text-default-900 dark:text-gray-100">
                  <span>Total Outstanding Balance</span>
                  <span className="text-rose-600 dark:text-rose-400">
                    RM {formatCurrency(filteredData.grand_total_balance)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebtorsReportPage;
