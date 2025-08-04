// src/pages/JellyPolly/SalesBySalesmanPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../routes/utils/api";
import { FormCombobox } from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import { IconSortAscending, IconSortDescending } from "@tabler/icons-react";
import DateRangePicker from "../../components/DateRangePicker";
import StyledListbox from "../../components/StyledListbox";
import toast from "react-hot-toast";
import {
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import Button from "../../components/Button";

interface SalesmanSalesData {
  id: string;
  name: string;
  totalSales: number;
  totalQuantity: number;
  totalInvoices: number;
  averageInvoiceValue: number;
  topProduct: string;
  topProductSales: number;
}

interface MonthOption {
  id: number;
  name: string;
}

interface MonthlySalesmanData {
  month: string;
  [key: string]: string | number; // For salesman names and their sales values
}

const SalesBySalesmanPage: React.FC = () => {
  const [salesmanSalesData, setSalesmanSalesData] = useState<SalesmanSalesData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof SalesmanSalesData;
    direction: "asc" | "desc";
  }>({ key: "totalSales", direction: "desc" });

  // Date range state - default to last 30 days
  const [dateRange, setDateRange] = useState<{
    start: Date;
    end: Date;
  }>(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  });

  // Chart data states
  const [monthlySalesmanData, setMonthlySalesmanData] = useState<MonthlySalesmanData[]>([]);
  const [showChart, setShowChart] = useState(false);

  // Month selector state
  const currentMonthIndex = useMemo(() => new Date().getMonth(), []);
  const monthOptions: MonthOption[] = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        name: new Date(0, i).toLocaleString("en", { month: "long" }),
      })),
    []
  );
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    monthOptions[currentMonthIndex]
  );

  // Cache hooks
  const { salesmen, isLoading: salesmenLoading } = useSalesmanCache();

  // Fetch sales data
  const fetchSalesData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("startDate", dateRange.start.getTime().toString());
      params.append("endDate", dateRange.end.getTime().toString());
      
      if (selectedCustomer) {
        params.append("customer", selectedCustomer);
      }

      // Use JellyPolly-specific API endpoint
      const response = await api.get(`/api/jellypolly/sales/salesmen?${params.toString()}`);
      setSalesmanSalesData(response.data || []);
      setMonthlySalesmanData(response.monthlySalesmanData || []);
    } catch (error) {
      console.error("Error fetching salesman sales data:", error);
      toast.error("Failed to fetch salesman sales data");
      setSalesmanSalesData([]);
      setMonthlySalesmanData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchSalesData();
  }, [dateRange, selectedCustomer]);

  // Month change handler
  const handleMonthChange = (month: MonthOption) => {
    setSelectedMonth(month);
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth();
    
    const targetYear = month.id > currentMonthIndex ? currentYear - 1 : currentYear;
    
    const startDate = new Date(targetYear, month.id, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetYear, month.id + 1, 0);
    endDate.setHours(23, 59, 59, 999);
    
    setDateRange({ start: startDate, end: endDate });
  };

  // Sorting functionality
  const handleSort = (key: keyof SalesmanSalesData) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedData = useMemo(() => {
    const sortableItems = [...salesmanSalesData];
    sortableItems.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortConfig.direction === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      const numA = Number(aValue) || 0;
      const numB = Number(bValue) || 0;
      return sortConfig.direction === "asc" ? numA - numB : numB - numA;
    });
    return sortableItems;
  }, [salesmanSalesData, sortConfig]);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const SortHeader: React.FC<{
    label: string;
    sortKey: keyof SalesmanSalesData;
  }> = ({ label, sortKey }) => (
    <th
      className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortConfig.key === sortKey &&
          (sortConfig.direction === "asc" ? (
            <IconSortAscending size={16} />
          ) : (
            <IconSortDescending size={16} />
          ))}
      </div>
    </th>
  );

  // Chart colors
  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

  if (salesmenLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
            </label>
            <DateRangePicker
              dateRange={dateRange}
              onDateChange={setDateRange}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Month
            </label>
            <StyledListbox
              value={selectedMonth.id}
              onChange={(value) => {
                const month = monthOptions.find(m => m.id === value);
                if (month) handleMonthChange(month);
              }}
              options={monthOptions.map(m => ({ id: m.id, name: m.name }))}
              placeholder="Select Month"
            />
          </div>

          <div className="col-span-1"></div>

          <div className="flex gap-2">
            <Button
              onClick={fetchSalesData}
              variant="filled"
              color="sky"
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : "Refresh"}
            </Button>
            <Button
              onClick={() => setShowChart(!showChart)}
              variant="outline"
              color="default"
            >
              {showChart ? "Hide Charts" : "Show Charts"}
            </Button>
          </div>
        </div>
      </div>

      {/* Charts */}
      {showChart && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Salesman Performance Bar Chart */}
          {sortedData.length > 0 && (
            <div className="bg-white p-4 rounded-lg border shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Sales Performance by Salesman</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sortedData.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="totalSales" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly Trend Chart */}
          {monthlySalesmanData.length > 0 && (
            <div className="bg-white p-4 rounded-lg border shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Monthly Sales Trend by Salesman</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlySalesmanData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  {Object.keys(monthlySalesmanData[0] || {})
                    .filter(key => key !== 'month')
                    .slice(0, 5) // Limit to top 5 salesmen for readability
                    .map((key, index) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Sales Data Table */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Salesman Sales Performance</h3>
          <p className="text-sm text-gray-600 mt-1">
            Total salesmen: {sortedData.length} | Total sales: {formatCurrency(
              sortedData.reduce((sum, item) => sum + item.totalSales, 0)
            )}
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <LoadingSpinner />
          </div>
        ) : sortedData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No sales data found for the selected period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader label="Salesman ID" sortKey="id" />
                  <SortHeader label="Name" sortKey="name" />
                  <SortHeader label="Total Sales" sortKey="totalSales" />
                  <SortHeader label="Total Quantity" sortKey="totalQuantity" />
                  <SortHeader label="Total Invoices" sortKey="totalInvoices" />
                  <SortHeader label="Average Invoice" sortKey="averageInvoiceValue" />
                  <SortHeader label="Top Product" sortKey="topProduct" />
                  <SortHeader label="Top Product Sales" sortKey="topProductSales" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedData.map((item, index) => (
                  <tr
                    key={item.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {item.id}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(item.totalSales)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {item.totalQuantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {item.totalInvoices.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatCurrency(item.averageInvoiceValue)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {item.topProduct}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatCurrency(item.topProductSales)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesBySalesmanPage;