import React, {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IconBuildingSkyscraper,
  IconBuildingStore,
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

interface CustomerBranchMember {
  id: string;
  name: string;
  isMainBranch: boolean;
  assignedSalesman: string | null;
  phoneNumber: string | null;
  city: string | null;
  state: string | null;
}

interface CustomerBranchGroup {
  id: number;
  name: string;
  members: CustomerBranchMember[];
}

interface CustomerSalesResponse {
  customers: CustomerSalesData[];
  branchGroups: CustomerBranchGroup[];
}

interface CustomerBranchSalesData extends CustomerSalesData {
  isMainBranch: boolean;
}

interface CustomerSalesEntity extends CustomerSalesData {
  entityKey: string;
  kind: "branchGroup" | "customer";
  branchGroupId: number | null;
  members: CustomerBranchSalesData[];
  allMemberIds: string[];
  mappedMemberCount: number;
  activeMemberCount: number;
  isFilteredGroup: boolean;
  chartLabel: string;
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
const CUSTOMER_TABLE_COLUMNS: CustomerTableColumn[] = [
  { key: "name", label: "Customer" },
  { key: "cashCount", label: "Cash Bills", align: "right" },
  { key: "invoiceCount", label: "Invoices", align: "right" },
  { key: "salesCount", label: "Total Bills", align: "right" },
  { key: "totalQuantity", label: "Total Quantity", align: "right" },
  { key: "lastSaleDate", label: "Last Sale", align: "right" },
  { key: "totalSales", label: "Total Sales", align: "right" },
];
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

const getCustomerSearchText = (customer: CustomerSalesData): string =>
  [
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

const createEmptyBranchSales = (
  member: CustomerBranchMember
): CustomerBranchSalesData => ({
  id: member.id,
  name: member.name || member.id,
  assignedSalesman: member.assignedSalesman,
  phoneNumber: member.phoneNumber,
  city: member.city,
  state: member.state,
  totalSales: 0,
  totalQuantity: 0,
  totalFoc: 0,
  totalReturns: 0,
  salesCount: 0,
  invoiceCount: 0,
  cashCount: 0,
  lastSaleDate: null,
  salesmen: [],
  products: [],
  isMainBranch: member.isMainBranch,
});

const aggregateCustomerSales = (
  id: string,
  name: string,
  customers: CustomerSalesData[]
): CustomerSalesData => {
  const products = new Map<string, CustomerProductData>();
  const salesmen = new Set<string>();
  let totalSales = 0;
  let totalQuantity = 0;
  let totalFoc = 0;
  let totalReturns = 0;
  let salesCount = 0;
  let invoiceCount = 0;
  let cashCount = 0;
  let lastSaleDate: string | null = null;

  customers.forEach((customer: CustomerSalesData): void => {
    totalSales += customer.totalSales;
    totalQuantity += customer.totalQuantity;
    totalFoc += customer.totalFoc;
    totalReturns += customer.totalReturns;
    salesCount += customer.salesCount;
    invoiceCount += customer.invoiceCount;
    cashCount += customer.cashCount;
    customer.salesmen.forEach((salesman: string): void => {
      salesmen.add(salesman);
    });

    if (
      customer.lastSaleDate &&
      (!lastSaleDate ||
        Number(customer.lastSaleDate) > Number(lastSaleDate))
    ) {
      lastSaleDate = customer.lastSaleDate;
    }

    customer.products.forEach((product: CustomerProductData): void => {
      const existingProduct: CustomerProductData | undefined = products.get(
        product.id
      );
      if (existingProduct) {
        existingProduct.quantity += product.quantity;
        existingProduct.totalSales += product.totalSales;
        existingProduct.foc += product.foc;
        existingProduct.returns += product.returns;
        return;
      }

      products.set(product.id, { ...product });
    });
  });

  return {
    id,
    name,
    assignedSalesman: null,
    phoneNumber: null,
    city: null,
    state: null,
    totalSales,
    totalQuantity,
    totalFoc,
    totalReturns,
    salesCount,
    invoiceCount,
    cashCount,
    lastSaleDate,
    salesmen: Array.from(salesmen).sort(),
    products: Array.from(products.values()).sort(
      (firstProduct: CustomerProductData, secondProduct: CustomerProductData) =>
        secondProduct.totalSales - firstProduct.totalSales
    ),
  };
};

const createBranchGroupEntity = (
  group: CustomerBranchGroup,
  members: CustomerBranchSalesData[],
  allMemberIds: string[] = group.members.map(
    (member: CustomerBranchMember): string => member.id
  ),
  mappedMemberCount: number = group.members.length,
  isFilteredGroup: boolean = false
): CustomerSalesEntity => {
  const aggregate: CustomerSalesData = aggregateCustomerSales(
    `branch-group-${group.id}`,
    group.name,
    members
  );

  return {
    ...aggregate,
    entityKey: `branch-group:${group.id}`,
    kind: "branchGroup",
    branchGroupId: group.id,
    members,
    allMemberIds,
    mappedMemberCount,
    activeMemberCount: members.filter(
      (member: CustomerBranchSalesData): boolean => member.salesCount > 0
    ).length,
    isFilteredGroup,
    chartLabel: `${group.name} (${mappedMemberCount})`,
  };
};

const createStandaloneCustomerEntity = (
  customer: CustomerSalesData
): CustomerSalesEntity => ({
  ...customer,
  entityKey: `customer:${customer.id}`,
  kind: "customer",
  branchGroupId: null,
  members: [{ ...customer, isMainBranch: false }],
  allMemberIds: [customer.id],
  mappedMemberCount: 1,
  activeMemberCount: customer.salesCount > 0 ? 1 : 0,
  isFilteredGroup: false,
  chartLabel: customer.name,
});

interface CustomerProductBreakdownProps {
  customer: CustomerSalesData;
}

const CustomerProductBreakdown: React.FC<CustomerProductBreakdownProps> = ({
  customer,
}) => {
  const { t } = useTranslation("sales");

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-default-800 dark:text-gray-100">
        {t("Products bought by {{name}}", { name: customer.name })}
      </h4>
      {customer.products.length > 0 ? (
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
                (product: CustomerProductData): React.ReactElement => (
                  <tr key={product.id}>
                    <td className="px-3 py-2 font-medium">{product.id}</td>
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
      ) : (
        <div className="rounded-lg border border-dashed border-default-300 p-4 text-center text-sm text-default-500 dark:border-gray-600 dark:text-gray-400">
          {t("No product sales in this period.")}
        </div>
      )}
    </div>
  );
};

interface BranchGroupBreakdownProps {
  entity: CustomerSalesEntity;
  expandedCustomerIds: Set<string>;
  onToggleCustomerProducts: (customerId: string) => void;
}

const BranchGroupBreakdown: React.FC<BranchGroupBreakdownProps> = ({
  entity,
  expandedCustomerIds,
  onToggleCustomerProducts,
}) => {
  const { t } = useTranslation("sales");

  return (
    <div>
      <div className="mb-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-default-800 dark:text-gray-100">
          <IconBuildingStore
            size={17}
            className="text-indigo-500 dark:text-indigo-300"
            aria-hidden="true"
          />
          {t("Branches in {{name}}", { name: entity.name })}
        </h4>
        <p className="mt-0.5 text-xs text-default-500 dark:text-gray-400">
          {entity.isFilteredGroup
            ? t(
                "Showing {{shown}} of {{total}} branches matching your search",
                {
                  shown: entity.members.length,
                  total: entity.mappedMemberCount,
                }
              )
            : t("{{active}} of {{total}} branches had sales in this period", {
                active: entity.activeMemberCount,
                total: entity.mappedMemberCount,
              })}
        </p>
      </div>

      <div className="max-h-[480px] overflow-auto rounded-lg border border-indigo-100 bg-white dark:border-indigo-900/60 dark:bg-gray-800">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-indigo-100/80 text-default-600 dark:bg-indigo-900/50 dark:text-gray-300">
            <tr>
              <th className="w-10 px-2 py-2" aria-hidden="true" />
              {CUSTOMER_TABLE_COLUMNS.map(
                (column: CustomerTableColumn): React.ReactElement => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-3 py-2 font-medium ${
                      column.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {t(column.label)}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-100 dark:divide-indigo-900/50">
            {entity.members.map(
              (branch: CustomerBranchSalesData): React.ReactElement => {
                const canExpand: boolean = branch.products.length > 0;
                const isExpanded: boolean =
                  canExpand && expandedCustomerIds.has(branch.id);
                const productRowId: string = `branch-products-${encodeURIComponent(
                  branch.id
                )}`;
                const salesmen: string = getCustomerSalesmen(branch);
                const location: string = getCustomerLocation(branch);
                const averageSale: number =
                  branch.salesCount > 0
                    ? branch.totalSales / branch.salesCount
                    : 0;

                return (
                  <Fragment key={branch.id}>
                    <tr
                      tabIndex={canExpand ? 0 : undefined}
                      aria-expanded={canExpand ? isExpanded : undefined}
                      aria-controls={canExpand ? productRowId : undefined}
                      title={
                        canExpand
                          ? t(
                              isExpanded
                                ? "Collapse products for {{name}}"
                                : "Expand products for {{name}}",
                              { name: branch.name }
                            )
                          : undefined
                      }
                      onClick={(): void => {
                        if (canExpand) onToggleCustomerProducts(branch.id);
                      }}
                      onKeyDown={(
                        event: React.KeyboardEvent<HTMLTableRowElement>
                      ): void => {
                        if (
                          !canExpand ||
                          (event.key !== "Enter" && event.key !== " ")
                        ) {
                          return;
                        }
                        event.preventDefault();
                        onToggleCustomerProducts(branch.id);
                      }}
                      className={
                        canExpand
                          ? "cursor-pointer hover:bg-indigo-50 focus-visible:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-indigo-950/30 dark:focus-visible:bg-sky-950/30"
                          : "bg-default-50/50 text-default-500 dark:bg-gray-900/20 dark:text-gray-400"
                      }
                    >
                      <td className="px-2 py-2 text-center">
                        {canExpand && (
                          <span
                            className="inline-flex p-1 text-default-500 dark:text-gray-400"
                            aria-hidden="true"
                          >
                            {isExpanded ? (
                              <IconChevronDown size={16} />
                            ) : (
                              <IconChevronRight size={16} />
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5 font-medium text-default-900 dark:text-gray-100">
                          {branch.isMainBranch ? (
                            <IconBuildingSkyscraper
                              size={16}
                              className="text-indigo-500 dark:text-indigo-300"
                              aria-hidden="true"
                            />
                          ) : (
                            <IconBuildingStore
                              size={16}
                              className="text-indigo-400 dark:text-indigo-300"
                              aria-hidden="true"
                            />
                          )}
                          <span>{branch.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              branch.isMainBranch
                                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200"
                                : "bg-default-100 text-default-600 dark:bg-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {t(branch.isMainBranch ? "Main branch" : "Branch")}
                          </span>
                          {branch.salesCount === 0 && (
                            <span className="rounded-full bg-default-100 px-2 py-0.5 text-[10px] font-medium text-default-500 dark:bg-gray-700 dark:text-gray-400">
                              {t("No sales in period")}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-default-500 dark:text-gray-400">
                          {branch.id}
                          {salesmen && (
                            <>
                              <span aria-hidden="true"> · </span>
                              {salesmen}
                            </>
                          )}
                        </div>
                        {(location || branch.phoneNumber) && (
                          <div className="text-xs text-default-400 dark:text-gray-500">
                            {[location, branch.phoneNumber]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {branch.cashCount.toLocaleString("en-MY")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {branch.invoiceCount.toLocaleString("en-MY")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div>{branch.salesCount.toLocaleString("en-MY")}</div>
                        {branch.salesCount > 0 && (
                          <div className="text-xs text-default-400 dark:text-gray-500">
                            {t("Average / Bill")}: {formatCurrency(averageSale)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatNumber(branch.totalQuantity)}
                        {(branch.totalFoc > 0 || branch.totalReturns > 0) && (
                          <div className="text-xs text-default-400 dark:text-gray-500">
                            {t("FOC {{total}}", {
                              total: formatNumber(branch.totalFoc),
                            })}
                            {" · "}
                            {t("RTN {{total}}", {
                              total: formatNumber(branch.totalReturns),
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {branch.lastSaleDate
                          ? new Intl.DateTimeFormat("en-MY", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }).format(new Date(Number(branch.lastSaleDate)))
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatCurrency(branch.totalSales)}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr
                        id={productRowId}
                        className="bg-sky-50/50 dark:bg-sky-950/20"
                      >
                        <td colSpan={8} className="px-5 py-4">
                          <CustomerProductBreakdown customer={branch} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const [branchGroups, setBranchGroups] = useState<CustomerBranchGroup[]>([]);
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
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [selectedChartEntities, setSelectedChartEntities] = useState<
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

        const responseData: CustomerSalesResponse | null = Array.isArray(
          response
        )
          ? {
              customers: response as CustomerSalesData[],
              branchGroups: [],
            }
          : response &&
              typeof response === "object" &&
              Array.isArray(
                (response as Partial<CustomerSalesResponse>).customers
              ) &&
              Array.isArray(
                (response as Partial<CustomerSalesResponse>).branchGroups
              )
            ? (response as CustomerSalesResponse)
            : null;

        if (!responseData) {
          throw new Error("Invalid response format");
        }

        if (!isCancelled) {
          setCustomerData(responseData.customers);
          setBranchGroups(responseData.branchGroups);
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

  const customerEntities = useMemo<CustomerSalesEntity[]>(() => {
    const salesByCustomerId = new Map<string, CustomerSalesData>(
      customerData.map(
        (customer: CustomerSalesData): [string, CustomerSalesData] => [
          customer.id,
          customer,
        ]
      )
    );
    const claimedMemberIds = new Set<string>();
    const groupedSalesIds = new Set<string>();
    const entities: CustomerSalesEntity[] = [];

    [...branchGroups]
      .sort(
        (firstGroup: CustomerBranchGroup, secondGroup: CustomerBranchGroup) =>
          firstGroup.id - secondGroup.id
      )
      .forEach((group: CustomerBranchGroup): void => {
        const members: CustomerBranchSalesData[] = group.members
          .filter((member: CustomerBranchMember): boolean => {
            if (claimedMemberIds.has(member.id)) return false;
            claimedMemberIds.add(member.id);
            return true;
          })
          .map((member: CustomerBranchMember): CustomerBranchSalesData => {
            const sales: CustomerSalesData | undefined = salesByCustomerId.get(
              member.id
            );
            if (!sales) return createEmptyBranchSales(member);

            groupedSalesIds.add(member.id);
            return {
              ...sales,
              isMainBranch: member.isMainBranch,
            };
          })
          .sort(
            (
              firstMember: CustomerBranchSalesData,
              secondMember: CustomerBranchSalesData
            ): number => {
              if (firstMember.isMainBranch !== secondMember.isMainBranch) {
                return firstMember.isMainBranch ? -1 : 1;
              }
              if (firstMember.totalSales !== secondMember.totalSales) {
                return secondMember.totalSales - firstMember.totalSales;
              }
              return (
                firstMember.name.localeCompare(secondMember.name) ||
                firstMember.id.localeCompare(secondMember.id)
              );
            }
          );

        if (
          !members.some(
            (member: CustomerBranchSalesData): boolean => member.salesCount > 0
          )
        ) {
          return;
        }

        entities.push(createBranchGroupEntity(group, members));
      });

    customerData.forEach((customer: CustomerSalesData): void => {
      if (!groupedSalesIds.has(customer.id)) {
        entities.push(createStandaloneCustomerEntity(customer));
      }
    });

    return entities.sort(
      (firstEntity: CustomerSalesEntity, secondEntity: CustomerSalesEntity) =>
        secondEntity.totalSales - firstEntity.totalSales
    );
  }, [branchGroups, customerData]);

  useEffect((): void => {
    const availableKeys: string[] = customerEntities.map(
      (entity: CustomerSalesEntity): string => entity.entityKey
    );

    if (initializedChartScopeRef.current !== scope) {
      initializedChartScopeRef.current = scope;
      setSelectedChartEntities(availableKeys.slice(0, MAX_CHART_CUSTOMERS));
      setTrendData([]);
      return;
    }

    setSelectedChartEntities((currentSelection: string[]): string[] => {
      const survivingKeys: string[] = currentSelection.filter(
        (entityKey: string): boolean => availableKeys.includes(entityKey)
      );
      if (survivingKeys.length > 0 || availableKeys.length === 0) {
        return survivingKeys.slice(0, MAX_CHART_CUSTOMERS);
      }
      return availableKeys.slice(0, MAX_CHART_CUSTOMERS);
    });
    setTrendData([]);
  }, [customerEntities, scope]);

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

  const toggleGroupBranches = (entityKey: string): void => {
    setExpandedGroupKeys((currentKeys: Set<string>): Set<string> => {
      const nextKeys = new Set<string>(currentKeys);
      if (nextKeys.has(entityKey)) {
        nextKeys.delete(entityKey);
      } else {
        nextKeys.add(entityKey);
      }
      return nextKeys;
    });
  };

  const filteredAndSortedEntities = useMemo<CustomerSalesEntity[]>(() => {
    const normalizedQuery: string = searchQuery.trim().toLowerCase();
    const filteredEntities: CustomerSalesEntity[] = normalizedQuery
      ? customerEntities
          .map(
            (
              entity: CustomerSalesEntity
            ): CustomerSalesEntity | null => {
              if (entity.kind === "customer") {
                return getCustomerSearchText(entity).includes(normalizedQuery)
                  ? entity
                  : null;
              }

              if (entity.name.toLowerCase().includes(normalizedQuery)) {
                return entity;
              }

              const matchingMembers: CustomerBranchSalesData[] =
                entity.members.filter(
                  (member: CustomerBranchSalesData): boolean =>
                    getCustomerSearchText(member).includes(normalizedQuery)
                );
              if (matchingMembers.length === 0) return null;

              const filteredGroup: CustomerBranchGroup = {
                id: entity.branchGroupId as number,
                name: entity.name,
                members: [],
              };
              return createBranchGroupEntity(
                filteredGroup,
                matchingMembers,
                entity.allMemberIds,
                entity.mappedMemberCount,
                true
              );
            }
          )
          .filter(
            (
              entity: CustomerSalesEntity | null
            ): entity is CustomerSalesEntity => entity !== null
          )
      : [...customerEntities];

    return filteredEntities.sort(
      (firstEntity: CustomerSalesEntity, secondEntity: CustomerSalesEntity) => {
        const firstValue: string | number = getCustomerSortValue(
          firstEntity,
          sortConfig.key
        );
        const secondValue: string | number = getCustomerSortValue(
          secondEntity,
          sortConfig.key
        );
        const comparison: number =
          typeof firstValue === "number" && typeof secondValue === "number"
            ? firstValue - secondValue
            : String(firstValue).localeCompare(String(secondValue));
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }
    );
  }, [customerEntities, searchQuery, sortConfig]);

  const summary = useMemo(() => {
    const totalSales: number = filteredAndSortedEntities.reduce(
      (sum: number, entity: CustomerSalesEntity): number =>
        sum + entity.totalSales,
      0
    );
    const totalBills: number = filteredAndSortedEntities.reduce(
      (sum: number, entity: CustomerSalesEntity): number =>
        sum + entity.salesCount,
      0
    );
    const totalQuantity: number = filteredAndSortedEntities.reduce(
      (sum: number, entity: CustomerSalesEntity): number =>
        sum + entity.totalQuantity,
      0
    );
    const activeLocations: number = filteredAndSortedEntities.reduce(
      (sum: number, entity: CustomerSalesEntity): number =>
        sum + entity.activeMemberCount,
      0
    );

    return {
      totalSales,
      totalBills,
      totalQuantity,
      activeLocations,
      branchGroupCount: filteredAndSortedEntities.filter(
        (entity: CustomerSalesEntity): boolean =>
          entity.kind === "branchGroup"
      ).length,
      standaloneCount: filteredAndSortedEntities.filter(
        (entity: CustomerSalesEntity): boolean => entity.kind === "customer"
      ).length,
      averageSalePerLocation:
        activeLocations > 0 ? totalSales / activeLocations : 0,
    };
  }, [filteredAndSortedEntities]);

  const topCustomers = useMemo<CustomerSalesEntity[]>(
    () =>
      [...filteredAndSortedEntities]
        .sort(
          (firstEntity: CustomerSalesEntity, secondEntity: CustomerSalesEntity) =>
            secondEntity.totalSales - firstEntity.totalSales
        )
        .slice(0, 10),
    [filteredAndSortedEntities]
  );

  const topCustomersByQuantity = useMemo<CustomerSalesEntity[]>(
    () =>
      [...filteredAndSortedEntities]
        .sort(
          (firstEntity: CustomerSalesEntity, secondEntity: CustomerSalesEntity) =>
            secondEntity.totalQuantity - firstEntity.totalQuantity
        )
        .slice(0, 10),
    [filteredAndSortedEntities]
  );

  const chartCustomerOptions = useMemo(
    () =>
      customerEntities.map((entity: CustomerSalesEntity) => ({
        id: entity.entityKey,
        name:
          entity.kind === "branchGroup"
            ? t("{{name}} ({{total}} branches)", {
                name: entity.name,
                total: entity.mappedMemberCount,
              })
            : `${entity.name} (${entity.id})`,
      })),
    [customerEntities, t]
  );

  const customerColors = useMemo<Record<string, string>>(() => {
    const colors: Record<string, string> = {};
    selectedChartEntities.forEach((entityKey: string, index: number): void => {
      colors[entityKey] =
        CUSTOMER_CHART_COLORS[index % CUSTOMER_CHART_COLORS.length];
    });
    return colors;
  }, [selectedChartEntities]);

  const fetchCustomerTrendData = async (): Promise<void> => {
    if (selectedChartEntities.length === 0) return;
    setIsGeneratingChart(true);

    try {
      const selectedEntities: CustomerSalesEntity[] = selectedChartEntities
        .map(
          (entityKey: string): CustomerSalesEntity | undefined =>
            customerEntities.find(
              (entity: CustomerSalesEntity): boolean =>
                entity.entityKey === entityKey
            )
        )
        .filter(
          (
            entity: CustomerSalesEntity | undefined
          ): entity is CustomerSalesEntity => entity !== undefined
        );
      const memberIds: string[] = Array.from(
        new Set<string>(
          selectedEntities.flatMap(
            (entity: CustomerSalesEntity): string[] => entity.allMemberIds
          )
        )
      );
      if (memberIds.length === 0) return;

      const { startTimestamp, endTimestamp } = getTrendDateTimestamps();
      const ids: string = encodeURIComponent(memberIds.join(","));
      const response: unknown = await api.get(
        `/api/invoices/sales/trends?type=customers&startDate=${startTimestamp}&endDate=${endTimestamp}&ids=${ids}&scope=${scope}`
      );

      if (!Array.isArray(response)) {
        throw new Error("Invalid response format");
      }

      const typedResponse: CustomerTrendData[] = response as CustomerTrendData[];
      const rolledUpResponse: CustomerTrendData[] = typedResponse.map(
        (monthData: CustomerTrendData): CustomerTrendData => {
          const dataPoint: CustomerTrendData = { month: monthData.month };
          selectedEntities.forEach((entity: CustomerSalesEntity): void => {
            dataPoint[entity.entityKey] = entity.allMemberIds.reduce(
              (sum: number, memberId: string): number =>
                sum + Number(monthData[memberId] || 0),
              0
            );
          });
          return dataPoint;
        }
      );
      const hasSales: boolean = rolledUpResponse.some(
        (monthData: CustomerTrendData): boolean =>
          selectedEntities.some(
            (entity: CustomerSalesEntity): boolean =>
              Number(monthData[entity.entityKey] || 0) !== 0
          )
      );

      if (!hasSales) {
        setTrendData([]);
        toast.error(
          t(
            "No data found for the selected customers or branch groups in the past year"
          )
        );
        return;
      }

      setTrendData(rolledUpResponse);
      toast.success(t("Customer trend data generated successfully"));
    } catch (trendError: unknown) {
      console.error("Error fetching customer trend data:", trendError);
      toast.error(t("Failed to generate customer trend data"));
    } finally {
      setIsGeneratingChart(false);
    }
  };

  const summaryCards: SummaryCardData[] = [
    {
      label: t("Total Sales"),
      value: formatCurrency(summary.totalSales),
      colorClass: "bg-sky-500 dark:bg-sky-400",
    },
    {
      label: t("Active Customer Locations"),
      value: summary.activeLocations.toLocaleString("en-MY"),
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
      label: t("Average Sale per Location"),
      value: formatCurrency(summary.averageSalePerLocation),
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
                  {t(
                    "{{groups}} branch groups, {{standalone}} standalone customers, {{locations}} active locations",
                    {
                      groups: summary.branchGroupCount,
                      standalone: summary.standaloneCount,
                      locations: summary.activeLocations,
                    }
                  )}
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

            {filteredAndSortedEntities.length > 0 ? (
              <div className="max-h-[700px] overflow-auto">
                <table className="min-w-[1080px] w-full divide-y divide-default-200 dark:divide-gray-600">
                  <thead className="sticky top-0 z-10 bg-default-50 dark:bg-gray-700">
                    <tr>
                      <th className="w-10 px-2 py-2" aria-hidden="true" />
                      {CUSTOMER_TABLE_COLUMNS.map(
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
                    {filteredAndSortedEntities.map(
                      (customer: CustomerSalesEntity): React.ReactElement => {
                        const isBranchGroup: boolean =
                          customer.kind === "branchGroup";
                        const isExpanded: boolean = isBranchGroup
                          ? expandedGroupKeys.has(customer.entityKey)
                          : expandedCustomerIds.has(customer.id);
                        const detailRowId: string = `customer-details-${encodeURIComponent(
                          customer.entityKey
                        )}`;
                        const salesmen: string = isBranchGroup
                          ? ""
                          : getCustomerSalesmen(customer);
                        const location: string = isBranchGroup
                          ? ""
                          : getCustomerLocation(customer);
                        const averageSale: number =
                          customer.salesCount > 0
                            ? customer.totalSales / customer.salesCount
                            : 0;

                        return (
                          <Fragment key={customer.entityKey}>
                            <tr
                              tabIndex={0}
                              aria-expanded={isExpanded}
                              aria-controls={detailRowId}
                              title={t(
                                isBranchGroup
                                  ? isExpanded
                                    ? "Collapse branches for {{name}}"
                                    : "Expand branches for {{name}}"
                                  : isExpanded
                                    ? "Collapse products for {{name}}"
                                    : "Expand products for {{name}}",
                                { name: customer.name }
                              )}
                              onClick={(): void => {
                                if (isBranchGroup) {
                                  toggleGroupBranches(customer.entityKey);
                                } else {
                                  toggleCustomerProducts(customer.id);
                                }
                              }}
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
                                if (isBranchGroup) {
                                  toggleGroupBranches(customer.entityKey);
                                } else {
                                  toggleCustomerProducts(customer.id);
                                }
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
                                {isBranchGroup ? (
                                  <>
                                    <div className="flex flex-wrap items-center gap-2 font-medium text-default-900 dark:text-gray-100">
                                      <IconBuildingSkyscraper
                                        size={17}
                                        className="text-indigo-500 dark:text-indigo-300"
                                        aria-hidden="true"
                                      />
                                      <span>{customer.name}</span>
                                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">
                                        {t("Branch group")}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 text-xs text-default-500 dark:text-gray-400">
                                      {t(
                                        "{{active}} active of {{total}} branches",
                                        {
                                          active: customer.activeMemberCount,
                                          total: customer.mappedMemberCount,
                                        }
                                      )}
                                    </div>
                                    {customer.isFilteredGroup && (
                                      <div className="mt-0.5 text-xs font-medium text-sky-600 dark:text-sky-300">
                                        {t("Matched branches only")}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="font-medium text-default-900 dark:text-gray-100">
                                      {customer.name}
                                    </div>
                                    <div className="text-xs text-default-500 dark:text-gray-400">
                                      {customer.id}
                                      {salesmen && (
                                        <>
                                          <span aria-hidden="true"> · </span>
                                          {salesmen}
                                        </>
                                      )}
                                    </div>
                                    {(location || customer.phoneNumber) && (
                                      <div className="text-xs text-default-400 dark:text-gray-500">
                                        {[location, customer.phoneNumber]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </div>
                                    )}
                                  </>
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
                                {customer.salesCount > 0 && (
                                  <div className="text-xs text-default-400 dark:text-gray-500">
                                    {t("Average / Bill")}: {formatCurrency(averageSale)}
                                  </div>
                                )}
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
                                id={detailRowId}
                                className={
                                  isBranchGroup
                                    ? "bg-indigo-50/60 dark:bg-indigo-950/20"
                                    : "bg-sky-50/50 dark:bg-sky-950/20"
                                }
                              >
                                <td colSpan={8} className="px-6 py-4">
                                  {isBranchGroup ? (
                                    <BranchGroupBreakdown
                                      entity={customer}
                                      expandedCustomerIds={expandedCustomerIds}
                                      onToggleCustomerProducts={
                                        toggleCustomerProducts
                                      }
                                    />
                                  ) : (
                                    <CustomerProductBreakdown
                                      customer={customer}
                                    />
                                  )}
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
                {t("Top Customers and Branch Groups by Sales")}
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
                          dataKey="chartLabel"
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
                {t("Top Customers and Branch Groups by Quantity")}
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
                          dataKey="chartLabel"
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
                    value={selectedChartEntities}
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
                            "Maximum {{total}} customers or branch groups can be selected for the chart",
                            { total: MAX_CHART_CUSTOMERS }
                          )
                        );
                      }
                      setSelectedChartEntities(
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
                    isGeneratingChart || selectedChartEntities.length === 0
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
                    {selectedChartEntities.map(
                      (entityKey: string): React.ReactElement => {
                        const entity: CustomerSalesEntity | undefined =
                          customerEntities.find(
                            (candidate: CustomerSalesEntity): boolean =>
                              candidate.entityKey === entityKey
                          );
                        return (
                          <Line
                            key={entityKey}
                            type="monotone"
                            dataKey={entityKey}
                            name={entity?.name || entityKey}
                            stroke={customerColors[entityKey]}
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
                  "Generate to view customer and branch-group sales trends for the past 12 months"
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
