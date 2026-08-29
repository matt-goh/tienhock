import React, {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconX,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import LoadingSpinner from "../../components/LoadingSpinner";
import TimeNavigator from "../../components/TimeNavigator";
import Button from "../../components/Button";
import { FormCombobox } from "../../components/FormComponents";
import SalesSummarySelectionTooltip from "../../components/Sales/SalesSummarySelectionTooltip";
import { api } from "../../routes/utils/api";
import { SalesSummaryScope } from "../../utils/sales/SalesSummaryPDF";
import {
  reviveDate,
  usePersistedFilters,
  usePersistedMonth,
} from "../../hooks/usePersistedFilters";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import { useTheme } from "../../contexts/ThemeContext";

interface CustomerProductData {
  id: string;
  description: string;
  type: string;
  quantity: number;
  totalSales: number;
  foc: number;
  returns: number;
}

interface CustomerSalesData {
  id: string;
  name: string;
  assignedSalesman: string | null;
  phoneNumber: string | null;
  city: string | null;
  state: string | null;
  totalSales: number;
  totalQuantity: number;
  totalFoc: number;
  totalReturns: number;
  salesCount: number;
  invoiceCount: number;
  cashCount: number;
  lastSaleDate: string | null;
  salesmen: string[];
  products: CustomerProductData[];
}

interface DateRange {
  start: Date;
  end: Date;
}

interface CustomerTrendData {
  month: string;
  [key: string]: string | number;
}

type CustomerSortKey =
  | "name"
  | "id"
  | "salesCount"
  | "invoiceCount"
  | "cashCount"
  | "totalQuantity"
  | "totalSales"
  | "lastSaleDate";

interface CustomerSortConfig {
  key: CustomerSortKey;
  direction: "asc" | "desc";
}

interface CustomerTableColumn {
  key: CustomerSortKey;
  label: string;
  align?: "left" | "right";
}

interface SummaryCardData {
  label: string;
  value: string;
  colorClass: string;
}

interface SalesByCustomerPageProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  scope?: SalesSummaryScope;
}

const MAX_CHART_CUSTOMERS = 5;
const CUSTOMER_CHART_COLORS = [
  "#0284c7",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#dc2626",
];

const getTrendDateTimestamps = (): {
  startTimestamp: string;
  endTimestamp: string;
} => {
  const endDate: Date = new Date();
  const startDate: Date = new Date(
    endDate.getFullYear(),
    endDate.getMonth() - 11,
    1,
    0,
    0,
    0,
    0
  );

  return {
    startTimestamp: startDate.getTime().toString(),
    endTimestamp: endDate.getTime().toString(),
  };
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value);

const truncateChartLabel = (value: unknown, maxLength: number): string => {
  const label: string = String(value ?? "");
  return label.length > maxLength
    ? `${label.slice(0, maxLength - 1)}…`
    : label;
};

const getLastSaleTimestamp = (customer: CustomerSalesData): number =>
  customer.lastSaleDate ? Number(customer.lastSaleDate) || 0 : 0;

const getCustomerSortValue = (
  customer: CustomerSalesData,
  key: CustomerSortKey
): string | number => {
  if (key === "lastSaleDate") return getLastSaleTimestamp(customer);
  return customer[key];
};

const getCustomerLocation = (customer: CustomerSalesData): string =>
  [customer.city, customer.state]
    .filter((value: string | null): value is string => Boolean(value))
    .join(", ");

const getCustomerSalesmen = (customer: CustomerSalesData): string => {
  if (customer.salesmen.length > 0) return customer.salesmen.join(", ");
  return customer.assignedSalesman || "";
};

const SalesByCustomerPage: React.FC<SalesByCustomerPageProps> = ({
  activeTab,
  onTabChange,
  scope = "tienhock",
}) => {
  const { t } = useTranslation("sales");
  const { isDarkMode } = useTheme();
  const chartTextColor: string = isDarkMode ? "#e5e7eb" : "#4b5563";
  const chartGridColor: string = isDarkMode ? "#64748b" : "#d1d5db";
  const chartTooltipStyle: React.CSSProperties = {
    backgroundColor: isDarkMode ? "#111827" : "#ffffff",
    border: `1px solid ${isDarkMode ? "#4b5563" : "#d1d5db"}`,
    borderRadius: "0.5rem",
    color: isDarkMode ? "#f9fafb" : "#111827",
    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.18)",
  };
  const chartTooltipLabelStyle: React.CSSProperties = {
    color: isDarkMode ? "#f9fafb" : "#111827",
    fontWeight: 600,
  };
  const [selectedMonth, setSelectedMonth] = usePersistedMonth(
    `salesByCustomerMonth:${scope}`
  );
  const [dateRange, setDateRange] = usePersistedFilters<DateRange>(
    `salesByCustomerRange:${scope}`,
    (): DateRange => {
      const startDate: Date = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate: Date = new Date();
      endDate.setHours(23, 59, 59, 999);
      return { start: startDate, end: endDate };
    },
    (cached: unknown): DateRange | null => {
      const cachedRange = cached as {
        start?: unknown;
        end?: unknown;
      } | null;
      const start: Date | null = reviveDate(cachedRange?.start);
      const end: Date | null = reviveDate(cachedRange?.end);
      return start && end ? { start, end } : null;
    }
  );
  const [customerData, setCustomerData] = useState<CustomerSalesData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<CustomerSortConfig>({
    key: "totalSales",
    direction: "desc",
  });
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [selectedChartCustomers, setSelectedChartCustomers] = useState<
    string[]
  >([]);
  const [chartCustomerQuery, setChartCustomerQuery] = useState<string>("");
  const [trendData, setTrendData] = useState<CustomerTrendData[]>([]);
  const [isGeneratingChart, setIsGeneratingChart] = useState<boolean>(false);
  const initializedChartScopeRef = useRef<string | null>(null);

  useScrollRestoration(
    `sales-by-customer:${scope}`,
    !isLoading && customerData.length > 0
  );

  useEffect((): void => {
    if (!selectedMonth) return;
    window.dispatchEvent(
      new CustomEvent("monthSelectionChanged", {
        detail: {
          month: selectedMonth.getMonth(),
          year: selectedMonth.getFullYear(),
        },
      })
    );
  }, [selectedMonth]);

  useEffect(() => {
    let isCancelled = false;

    const fetchCustomerSales = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const startTimestamp: string = dateRange.start.getTime().toString();
        const endTimestamp: string = dateRange.end.getTime().toString();
        const response: unknown = await api.get(
          `/api/invoices/sales/customers?startDate=${startTimestamp}&endDate=${endTimestamp}&scope=${scope}`
        );

        if (!Array.isArray(response)) {
          throw new Error("Invalid response format");
        }

        if (!isCancelled) {
          setCustomerData(response as CustomerSalesData[]);
        }
      } catch (fetchError: unknown) {
        if (isCancelled) return;
        console.error("Error fetching customer sales data:", fetchError);
        setError(t("Failed to load sales data. Please try again."));
        toast.error(t("Failed to load sales data"));
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void fetchCustomerSales();
    return (): void => {
      isCancelled = true;
    };
  }, [dateRange, scope, t]);

  useEffect((): void => {
    const availableIds: string[] = customerData.map(
      (customer: CustomerSalesData): string => customer.id
    );

    if (initializedChartScopeRef.current !== scope) {
      initializedChartScopeRef.current = scope;
      setSelectedChartCustomers(availableIds.slice(0, MAX_CHART_CUSTOMERS));
      setTrendData([]);
      return;
    }

    setSelectedChartCustomers((currentSelection: string[]): string[] => {
      const survivingIds: string[] = currentSelection.filter(
        (customerId: string): boolean => availableIds.includes(customerId)
      );
      if (survivingIds.length > 0 || availableIds.length === 0) {
        return survivingIds.slice(0, MAX_CHART_CUSTOMERS);
      }
      return availableIds.slice(0, MAX_CHART_CUSTOMERS);
    });
    setTrendData([]);
  }, [customerData, scope]);

  const handleTimeNavigatorChange = (range: {
    start: Date;
    end: Date;
  }): void => {
    setSelectedMonth(range.start);
    setDateRange({ start: range.start, end: range.end });
  };

  const handleSort = (key: CustomerSortKey): void => {
    setSortConfig((currentConfig: CustomerSortConfig): CustomerSortConfig => ({
      key,
      direction:
        currentConfig.key === key && currentConfig.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const toggleCustomerProducts = (customerId: string): void => {
    setExpandedCustomerIds((currentIds: Set<string>): Set<string> => {
      const nextIds = new Set<string>(currentIds);
      if (nextIds.has(customerId)) {
        nextIds.delete(customerId);
      } else {
        nextIds.add(customerId);
      }
      return nextIds;
    });
  };

  const filteredAndSortedCustomers = useMemo<CustomerSalesData[]>(() => {
    const normalizedQuery: string = searchQuery.trim().toLowerCase();
    const filteredCustomers: CustomerSalesData[] = normalizedQuery
      ? customerData.filter((customer: CustomerSalesData): boolean => {
          const searchableText: string = [
            customer.id,
            customer.name,
            customer.assignedSalesman,
            customer.phoneNumber,
            customer.city,
            customer.state,
            ...customer.salesmen,
          ]
            .filter((value: string | null): value is string => Boolean(value))
            .join(" ")
            .toLowerCase();
          return searchableText.includes(normalizedQuery);
        })
      : [...customerData];

    return filteredCustomers.sort(
      (firstCustomer: CustomerSalesData, secondCustomer: CustomerSalesData) => {
        const firstValue: string | number = getCustomerSortValue(
          firstCustomer,
          sortConfig.key
        );
        const secondValue: string | number = getCustomerSortValue(
          secondCustomer,
          sortConfig.key
        );
        const comparison: number =
          typeof firstValue === "number" && typeof secondValue === "number"
            ? firstValue - secondValue
            : String(firstValue).localeCompare(String(secondValue));
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }
    );
  }, [customerData, searchQuery, sortConfig]);

  const summary = useMemo(() => {
    const totalSales: number = filteredAndSortedCustomers.reduce(
      (sum: number, customer: CustomerSalesData): number =>
        sum + customer.totalSales,
      0
    );
    const totalBills: number = filteredAndSortedCustomers.reduce(
      (sum: number, customer: CustomerSalesData): number =>
        sum + customer.salesCount,
      0
    );
    const totalQuantity: number = filteredAndSortedCustomers.reduce(
      (sum: number, customer: CustomerSalesData): number =>
        sum + customer.totalQuantity,
      0
    );

    return {
      totalSales,
      totalBills,
      totalQuantity,
      activeCustomers: filteredAndSortedCustomers.length,
      averageSalePerCustomer:
        filteredAndSortedCustomers.length > 0
          ? totalSales / filteredAndSortedCustomers.length
          : 0,
    };
  }, [filteredAndSortedCustomers]);

  const topCustomers = useMemo<CustomerSalesData[]>(
    () =>
      [...filteredAndSortedCustomers]
        .sort(
          (firstCustomer: CustomerSalesData, secondCustomer: CustomerSalesData) =>
            secondCustomer.totalSales - firstCustomer.totalSales
        )
        .slice(0, 10),
    [filteredAndSortedCustomers]
  );

  const topCustomersByQuantity = useMemo<CustomerSalesData[]>(
    () =>
      [...filteredAndSortedCustomers]
        .sort(
          (firstCustomer: CustomerSalesData, secondCustomer: CustomerSalesData) =>
            secondCustomer.totalQuantity - firstCustomer.totalQuantity
        )
        .slice(0, 10),
    [filteredAndSortedCustomers]
  );

  const chartCustomerOptions = useMemo(
    () =>
      customerData.map((customer: CustomerSalesData) => ({
        id: customer.id,
        name: `${customer.name} (${customer.id})`,
      })),
    [customerData]
  );

  const customerColors = useMemo<Record<string, string>>(() => {
    const colors: Record<string, string> = {};
    selectedChartCustomers.forEach((customerId: string, index: number): void => {
      colors[customerId] =
        CUSTOMER_CHART_COLORS[index % CUSTOMER_CHART_COLORS.length];
    });
    return colors;
  }, [selectedChartCustomers]);

  const fetchCustomerTrendData = async (): Promise<void> => {
    if (selectedChartCustomers.length === 0) return;
    setIsGeneratingChart(true);

    try {
      const { startTimestamp, endTimestamp } = getTrendDateTimestamps();
      const ids: string = encodeURIComponent(selectedChartCustomers.join(","));
      const response: unknown = await api.get(
        `/api/invoices/sales/trends?type=customers&startDate=${startTimestamp}&endDate=${endTimestamp}&ids=${ids}&scope=${scope}`
      );

      if (!Array.isArray(response)) {
        throw new Error("Invalid response format");
      }

      const typedResponse: CustomerTrendData[] =
        response as CustomerTrendData[];
      const hasSales: boolean = typedResponse.some(
        (monthData: CustomerTrendData): boolean =>
          selectedChartCustomers.some(
            (customerId: string): boolean =>
              Number(monthData[customerId] || 0) !== 0
          )
      );

      if (!hasSales) {
        setTrendData([]);
        toast.error(
          t("No data found for the selected customers in the past year")
        );
        return;
      }

      setTrendData(typedResponse);
      toast.success(t("Customer trend data generated successfully"));
    } catch (trendError: unknown) {
      console.error("Error fetching customer trend data:", trendError);
      toast.error(t("Failed to generate customer trend data"));
    } finally {
      setIsGeneratingChart(false);
    }
  };

  const tableColumns: CustomerTableColumn[] = [
    { key: "name", label: "Customer" },
    { key: "cashCount", label: "Cash Bills", align: "right" },
    { key: "invoiceCount", label: "Invoices", align: "right" },
    { key: "salesCount", label: "Total Bills", align: "right" },
    { key: "totalQuantity", label: "Total Quantity", align: "right" },
    { key: "lastSaleDate", label: "Last Sale", align: "right" },
    { key: "totalSales", label: "Total Sales", align: "right" },
  ];

  const summaryCards: SummaryCardData[] = [
    {
      label: t("Total Sales"),
      value: formatCurrency(summary.totalSales),
      colorClass: "bg-sky-500 dark:bg-sky-400",
    },
    {
      label: t("Active Customers"),
      value: summary.activeCustomers.toLocaleString("en-MY"),
      colorClass: "bg-emerald-500 dark:bg-emerald-400",
    },
    {
      label: t("Total Bills"),
      value: summary.totalBills.toLocaleString("en-MY"),
      colorClass: "bg-amber-500 dark:bg-amber-400",
    },
    {
      label: t("Total Quantity"),
      value: formatNumber(summary.totalQuantity),
      colorClass: "bg-indigo-500 dark:bg-indigo-400",
    },
    {
      label: t("Average Sale per Customer"),
      value: formatCurrency(summary.averageSalePerCustomer),
      colorClass: "bg-teal-500 dark:bg-teal-400",
    },
  ];

  if (error) {
    return (
      <div className="w-full p-6">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-800/50 dark:bg-rose-900/20 dark:text-rose-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-lg bg-default-100 p-0.5 dark:bg-gray-700">
            {["Products", "Salesman", "Customer"].map(
              (label: string, tabIndex: number): React.ReactElement => (
                <button
                  key={label}
                  type="button"
                  onClick={(): void => onTabChange(tabIndex)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === tabIndex
                      ? "bg-white text-default-900 shadow-sm dark:bg-gray-600 dark:text-gray-100"
                      : "text-default-600 hover:text-default-900 dark:text-gray-400 dark:hover:text-gray-100"
                  }`}
                >
                  {t(label)}
                </button>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <TimeNavigator
              range={dateRange}
              onChange={handleTimeNavigatorChange}
            />
            <div className="h-5 w-px bg-default-300 dark:bg-gray-600" />
            <SalesSummarySelectionTooltip activeTab={activeTab} scope={scope} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map(
            (card: SummaryCardData): React.ReactElement => (
              <div
                key={card.label}
                className="overflow-hidden rounded-lg border bg-white shadow dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-center justify-between gap-2 border-b bg-default-100 px-4 py-2 dark:border-gray-600 dark:bg-gray-700">
                  <h3 className="min-w-0 truncate text-sm font-semibold">
                    {card.label}
                  </h3>
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${card.colorClass}`}
                    aria-hidden="true"
                  />
                </div>
                <div className="px-4 py-3 text-xl font-bold">{card.value}</div>
              </div>
            )
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 w-full items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-white shadow dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b bg-default-100 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">
                  {t("Customer Sales Details")}
                </h3>
                <p className="text-xs text-default-500 dark:text-gray-400">
                  {t("{{total}} customers", {
                    total: filteredAndSortedCustomers.length,
                  })}
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <IconSearch
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400"
                  stroke={1.5}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                    setSearchQuery(event.target.value)
                  }
                  placeholder={t("Search customers")}
                  className="h-9 w-full rounded-lg border border-default-300 bg-white pl-9 pr-8 text-sm text-default-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={(): void => setSearchQuery("")}
                    title={t("Clear search")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                  >
                    <IconX size={16} />
                  </button>
                )}
              </div>
            </div>

            {filteredAndSortedCustomers.length > 0 ? (
              <div className="max-h-[600px] overflow-auto">
                <table className="min-w-[1080px] w-full divide-y divide-default-200 dark:divide-gray-600">
                  <thead className="sticky top-0 z-10 bg-default-50 dark:bg-gray-700">
                    <tr>
                      <th className="w-10 px-2 py-2" aria-hidden="true" />
                      {tableColumns.map(
                        (column: CustomerTableColumn): React.ReactElement => (
                          <th
                            key={column.key}
                            scope="col"
                            onClick={(): void => handleSort(column.key)}
                            className={`cursor-pointer px-4 py-2 text-sm font-medium text-default-500 dark:text-gray-300 ${
                              column.align === "right"
                                ? "text-right"
                                : "text-left"
                            }`}
                          >
                            <div
                              className={`flex items-center gap-1 ${
                                column.align === "right"
                                  ? "justify-end"
                                  : "justify-start"
                              }`}
                            >
                              {t(column.label)}
                              {sortConfig.key === column.key &&
                                (sortConfig.direction === "asc" ? (
                                  <IconSortAscending size={16} />
                                ) : (
                                  <IconSortDescending size={16} />
                                ))}
                            </div>
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default-100 dark:divide-gray-600">
                    {filteredAndSortedCustomers.map(
                      (customer: CustomerSalesData): React.ReactElement => {
                        const isExpanded: boolean = expandedCustomerIds.has(
                          customer.id
                        );
                        const productRowId: string = `customer-products-${encodeURIComponent(
                          customer.id
                        )}`;
                        const salesmen: string = getCustomerSalesmen(customer);
                        const location: string = getCustomerLocation(customer);
                        const averageSale: number =
                          customer.salesCount > 0
                            ? customer.totalSales / customer.salesCount
                            : 0;

                        return (
                          <Fragment key={customer.id}>
                            <tr
                              tabIndex={0}
                              aria-expanded={isExpanded}
                              aria-controls={productRowId}
                              title={t(
                                isExpanded
                                  ? "Collapse products for {{name}}"
                                  : "Expand products for {{name}}",
                                { name: customer.name }
                              )}
                              onClick={(): void =>
                                toggleCustomerProducts(customer.id)
                              }
                              onKeyDown={(
                                event: React.KeyboardEvent<HTMLTableRowElement>
                              ): void => {
                                if (
                                  event.key !== "Enter" &&
                                  event.key !== " "
                                ) {
                                  return;
                                }
                                event.preventDefault();
                                toggleCustomerProducts(customer.id);
                              }}
                              className="cursor-pointer hover:bg-default-50 focus-visible:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-gray-700/50 dark:focus-visible:bg-sky-950/30"
                            >
                              <td className="px-2 py-2 text-center">
                                <span
                                  className="inline-flex p-1 text-default-500 dark:text-gray-400"
                                  aria-hidden="true"
                                >
                                  {isExpanded ? (
                                    <IconChevronDown size={17} />
                                  ) : (
                                    <IconChevronRight size={17} />
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <div className="font-medium text-default-900 dark:text-gray-100">
                                  {customer.name}
                                </div>
                                <div className="text-xs text-default-500 dark:text-gray-400">
                                  {customer.id}
                                  {salesmen ? ` · ${salesmen}` : ""}
                                </div>
                                {(location || customer.phoneNumber) && (
                                  <div className="text-xs text-default-400 dark:text-gray-500">
                                    {[location, customer.phoneNumber]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right text-sm">
                                {customer.cashCount.toLocaleString("en-MY")}
                              </td>
                              <td className="px-4 py-2 text-right text-sm">
                                {customer.invoiceCount.toLocaleString("en-MY")}
                              </td>
                              <td className="px-4 py-2 text-right text-sm">
                                <div>{customer.salesCount.toLocaleString("en-MY")}</div>
                                <div className="text-xs text-default-400 dark:text-gray-500">
                                  {t("Average / Bill")}: {formatCurrency(averageSale)}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right text-sm">
                                {formatNumber(customer.totalQuantity)}
                                {(customer.totalFoc > 0 ||
                                  customer.totalReturns > 0) && (
                                  <div className="text-xs text-default-400 dark:text-gray-500">
                                    {t("FOC {{total}}", {
                                      total: formatNumber(customer.totalFoc),
                                    })}
                                    {" · "}
                                    {t("RTN {{total}}", {
                                      total: formatNumber(customer.totalReturns),
                                    })}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right text-sm">
                                {customer.lastSaleDate
                                  ? new Intl.DateTimeFormat("en-MY", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    }).format(
                                      new Date(Number(customer.lastSaleDate))
                                    )
                                  : t("—")}
                              </td>
                              <td className="px-4 py-2 text-right text-sm font-semibold">
                                {formatCurrency(customer.totalSales)}
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr
                                id={productRowId}
                                className="bg-sky-50/50 dark:bg-sky-950/20"
                              >
                                <td colSpan={8} className="px-6 py-4">
                                  <h4 className="mb-2 text-sm font-semibold text-default-800 dark:text-gray-100">
                                    {t("Products bought by {{name}}", {
                                      name: customer.name,
                                    })}
                                  </h4>
                                  <div className="overflow-x-auto rounded-lg border border-sky-100 dark:border-sky-900/60">
                                    <table className="min-w-full text-sm">
                                      <thead className="bg-sky-100/70 text-default-600 dark:bg-sky-900/40 dark:text-gray-300">
                                        <tr>
                                          <th className="px-3 py-2 text-left font-medium">
                                            {t("Product ID")}
                                          </th>
                                          <th className="px-3 py-2 text-left font-medium">
                                            {t("Products")}
                                          </th>
                                          <th className="px-3 py-2 text-right font-medium">
                                            {t("Qty")}
                                          </th>
                                          <th className="px-3 py-2 text-right font-medium">
                                            {t("FOC")}
                                          </th>
                                          <th className="px-3 py-2 text-right font-medium">
                                            {t("Returns")}
                                          </th>
                                          <th className="px-3 py-2 text-right font-medium">
                                            {t("Total Sales")}
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-sky-100 bg-white dark:divide-sky-900/50 dark:bg-gray-800">
                                        {customer.products.map(
                                          (
                                            product: CustomerProductData
                                          ): React.ReactElement => (
                                            <tr key={product.id}>
                                              <td className="px-3 py-2 font-medium">
                                                {product.id}
                                              </td>
                                              <td className="px-3 py-2 text-default-600 dark:text-gray-300">
                                                {product.description}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                {formatNumber(product.quantity)}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                {formatNumber(product.foc)}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                {formatNumber(product.returns)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-medium">
                                                {formatCurrency(product.totalSales)}
                                              </td>
                                            </tr>
                                          )
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      }
                    )}
                  </tbody>
                  <tfoot className="sticky bottom-0 border-t bg-default-100 dark:border-gray-600 dark:bg-gray-700">
                    <tr>
                      <td colSpan={7} className="px-4 py-2 text-right text-sm font-medium">
                        {t("Total:")}
                      </td>
                      <td className="px-4 py-2 text-right text-sm font-bold">
                        {formatCurrency(summary.totalSales)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="m-4 rounded border border-dashed border-default-300 p-6 text-center text-default-500 dark:border-gray-600 dark:text-gray-400">
                {t("No customer sales data available for this period.")}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-4 text-lg font-semibold">
                {t("Top Customers by Sales")}
              </h2>
              {topCustomers.length > 0 ? (
                <div className="overflow-x-auto">
                  <div className="h-[460px] min-w-[780px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topCustomers}
                        layout="vertical"
                        margin={{ top: 10, right: 40, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid
                          stroke={chartGridColor}
                          strokeDasharray="3 3"
                          strokeOpacity={isDarkMode ? 0.55 : 0.75}
                        />
                        <XAxis
                          type="number"
                          tick={{ fill: chartTextColor, fontSize: 12 }}
                          axisLine={{ stroke: chartGridColor }}
                          tickLine={{ stroke: chartGridColor }}
                          tickFormatter={(value: unknown): string =>
                            new Intl.NumberFormat("en", {
                              notation: "compact",
                              compactDisplay: "short",
                            }).format(Number(value))
                          }
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={260}
                          interval={0}
                          tickMargin={8}
                          tick={{ fill: chartTextColor, fontSize: 12 }}
                          axisLine={{ stroke: chartGridColor }}
                          tickLine={{ stroke: chartGridColor }}
                          tickFormatter={(value: unknown): string =>
                            truncateChartLabel(value, 38)
                          }
                        />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          cursor={{
                            fill: isDarkMode
                              ? "rgba(148, 163, 184, 0.12)"
                              : "rgba(15, 23, 42, 0.06)",
                          }}
                          formatter={(value: unknown): string =>
                            formatCurrency(Number(value))
                          }
                        />
                        <Bar
                          dataKey="totalSales"
                          name={t("Sales")}
                          fill="#0284c7"
                          barSize={24}
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="flex h-[460px] items-center justify-center rounded border border-dashed border-default-300 text-default-500 dark:border-gray-600 dark:text-gray-400">
                  {t("No data available")}
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-4 text-lg font-semibold">
                {t("Top Customers by Quantity")}
              </h2>
              {topCustomersByQuantity.length > 0 ? (
                <div className="overflow-x-auto">
                  <div className="h-[420px] min-w-[900px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topCustomersByQuantity}
                        margin={{ top: 10, right: 30, left: 10, bottom: 90 }}
                      >
                        <CartesianGrid
                          stroke={chartGridColor}
                          strokeDasharray="3 3"
                          strokeOpacity={isDarkMode ? 0.55 : 0.75}
                        />
                        <XAxis
                          dataKey="name"
                          angle={-28}
                          textAnchor="end"
                          interval={0}
                          height={105}
                          tickMargin={10}
                          tick={{ fill: chartTextColor, fontSize: 11 }}
                          axisLine={{ stroke: chartGridColor }}
                          tickLine={{ stroke: chartGridColor }}
                          tickFormatter={(value: unknown): string =>
                            truncateChartLabel(value, 30)
                          }
                        />
                        <YAxis
                          tick={{ fill: chartTextColor, fontSize: 12 }}
                          axisLine={{ stroke: chartGridColor }}
                          tickLine={{ stroke: chartGridColor }}
                        />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
                          cursor={{
                            fill: isDarkMode
                              ? "rgba(148, 163, 184, 0.12)"
                              : "rgba(15, 23, 42, 0.06)",
                          }}
                          formatter={(value: unknown): string =>
                            formatNumber(Number(value))
                          }
                        />
                        <Bar
                          dataKey="totalQuantity"
                          name={t("Quantity")}
                          fill="#059669"
                          barSize={36}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="flex h-[420px] items-center justify-center rounded border border-dashed border-default-300 text-default-500 dark:border-gray-600 dark:text-gray-400">
                  {t("No data available")}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">
                {t("Customer Sales Trends Over Time")}
              </h2>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="w-full sm:w-96">
                  <FormCombobox
                    name="chartCustomers"
                    label=""
                    value={selectedChartCustomers}
                    onChange={(values: string | string[] | null): void => {
                      const valueArray: string[] = (
                        Array.isArray(values)
                          ? values
                          : values
                            ? [values]
                            : []
                      ).filter((value: string): boolean => Boolean(value));

                      if (valueArray.length > MAX_CHART_CUSTOMERS) {
                        toast.error(
                          t(
                            "Maximum {{total}} customers can be selected for the chart",
                            { total: MAX_CHART_CUSTOMERS }
                          )
                        );
                      }
                      setSelectedChartCustomers(
                        valueArray.slice(0, MAX_CHART_CUSTOMERS)
                      );
                      setTrendData([]);
                    }}
                    options={chartCustomerOptions}
                    query={chartCustomerQuery}
                    setQuery={setChartCustomerQuery}
                    maxVisibleOptions={100}
                  />
                </div>
                <Button
                  type="button"
                  color="sky"
                  onClick={(): void => {
                    void fetchCustomerTrendData();
                  }}
                  disabled={
                    isGeneratingChart || selectedChartCustomers.length === 0
                  }
                >
                  {isGeneratingChart ? t("Generating...") : t("Generate Chart")}
                </Button>
              </div>
            </div>

            {isGeneratingChart ? (
              <div className="flex h-80 items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : trendData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trendData}
                    margin={{ top: 10, right: 35, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke={chartGridColor}
                      strokeDasharray="3 3"
                      strokeOpacity={isDarkMode ? 0.55 : 0.75}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: chartTextColor, fontSize: 12 }}
                      axisLine={{ stroke: chartGridColor }}
                      tickLine={{ stroke: chartGridColor }}
                    />
                    <YAxis
                      tick={{ fill: chartTextColor, fontSize: 12 }}
                      axisLine={{ stroke: chartGridColor }}
                      tickLine={{ stroke: chartGridColor }}
                      tickFormatter={(value: unknown): string =>
                        new Intl.NumberFormat("en", {
                          notation: "compact",
                          compactDisplay: "short",
                        }).format(Number(value))
                      }
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={chartTooltipLabelStyle}
                      formatter={(value: unknown): string =>
                        formatCurrency(Number(value))
                      }
                    />
                    <Legend wrapperStyle={{ color: chartTextColor }} />
                    {selectedChartCustomers.map(
                      (customerId: string): React.ReactElement => {
                        const customer: CustomerSalesData | undefined =
                          customerData.find(
                            (candidate: CustomerSalesData): boolean =>
                              candidate.id === customerId
                          );
                        return (
                          <Line
                            key={customerId}
                            type="monotone"
                            dataKey={customerId}
                            name={customer?.name || customerId}
                            stroke={customerColors[customerId]}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        );
                      }
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-80 items-center justify-center rounded border border-dashed border-default-300 px-4 text-center text-default-500 dark:border-gray-600 dark:text-gray-400">
                {t(
                  "Generate to view customer sales trends for the past 12 months"
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SalesByCustomerPage;
