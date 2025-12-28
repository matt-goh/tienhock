// src/pages/Sales/SalesBySalesmanPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import DateRangePicker from "../../components/DateRangePicker";
import MonthNavigator from "../../components/MonthNavigator";
import DateNavigator from "../../components/DateNavigator";
import toast from "react-hot-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import Button from "../../components/Button";
import { FormCombobox } from "../../components/FormComponents";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";

// Define interfaces
interface SalesmanData {
  id: string;
  name?: string;
  totalSales: number;
  totalQuantity: number;
  salesCount: number; // Total number of bills (invoices + cash bills)
  invoiceCount: number; // Number of invoices
  cashCount: number; // Number of cash bills
}

interface DateRange {
  start: Date;
  end: Date;
}

interface SalesTrendData {
  month: string;
  [key: string]: string | number; // For salesmen IDs and their sales values
}

const SalesBySalesmanPage: React.FC = () => {
  // Initialize dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // State hooks - Month selection uses Date object for MonthNavigator
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    return new Date(currentYear, currentMonth, 1);
  });
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    // Create start date (1st of the selected month)
    const startDate = new Date(currentYear, currentMonth, 1);
    startDate.setHours(0, 0, 0, 0);

    // Create end date (last day of the selected month)
    const endDate = new Date(currentYear, currentMonth + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    return { start: startDate, end: endDate };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [salesmanData, setSalesmanData] = useState<SalesmanData[]>([]);
  const [salesTrendData, setSalesTrendData] = useState<SalesTrendData[]>([]);
  const [isGeneratingChart, setIsGeneratingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof SalesmanData;
    direction: "asc" | "desc";
  }>({
    key: "totalSales",
    direction: "desc",
  });
  const [salesmen, setSalesmen] = useState<string[]>(["All Salesmen"]);
  const { salesmen: salesmenData, isLoading: salesmenLoading } =
    useSalesmanCache();
  const [selectedChartSalesmen, setSelectedChartSalesmen] = useState<string[]>(
    []
  );
  const [salesmanQuery, setSalesmanQuery] = useState("");
  const [maxChartSalesmen] = useState(5); // Limit to prevent chart legend overcrowding

  useEffect(() => {
    // Dispatch month selection event when it changes
    if (selectedMonth) {
      window.dispatchEvent(
        new CustomEvent("monthSelectionChanged", {
          detail: { month: selectedMonth.getMonth(), year: selectedMonth.getFullYear() },
        })
      );
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (salesmenData.length > 0) {
      const salesmenIds = salesmenData.map((employee) => employee.id);
      setSalesmen(["All Salesmen", ...salesmenIds]);
    }
  }, [salesmenData]);

  useEffect(() => {
    if (salesmen.length > 0) {
      // Filter out "All Salesmen" and apply maximum limit
      const allSalesmenIds = salesmen
        .filter((id) => id !== "All Salesmen")
        .slice(0, maxChartSalesmen);

      setSelectedChartSalesmen(allSalesmenIds);
    }
  }, [salesmen, maxChartSalesmen]);

  // Handle month selection change from MonthNavigator
  const handleMonthChange = (newDate: Date) => {
    setSelectedMonth(newDate);

    // Create start date (1st of the selected month)
    const startDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);

    // Create end date (last day of the selected month)
    const endDate = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    // Update date range
    setDateRange({ start: startDate, end: endDate });
  };

  // Handle date selection change from DateNavigator
  const handleDateChange = (newDate: Date) => {
    // Create start date (beginning of the selected day)
    const startDate = new Date(newDate);
    startDate.setHours(0, 0, 0, 0);

    // Create end date (end of the selected day)
    const endDate = new Date(newDate);
    endDate.setHours(23, 59, 59, 999);

    // Update date range
    setDateRange({ start: startDate, end: endDate });
  };

  // Fetch yearly trend data for the sales trend chart
  const fetchYearlyTrendData = async () => {
    setIsGeneratingChart(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1); // Last 12 months

      const startTimestamp = startDate.getTime().toString();
      const endTimestamp = endDate.getTime().toString();

      // Use the new dedicated trends endpoint
      const url = `/api/invoices/sales/trends?type=salesmen&startDate=${startTimestamp}&endDate=${endTimestamp}&ids=${selectedChartSalesmen.join(
        ","
      )}`;

      const chartData = await api.get(url);

      if (!Array.isArray(chartData)) {
        throw new Error("Invalid response format");
      }

      // Check if we received any data
      if (chartData.length === 0) {
        toast.error("No data found for the selected salesmen in the past year");
        setSalesTrendData([]);
        return;
      }

      setSalesTrendData(chartData);
      toast.success("Sales trend data generated successfully");
    } catch (error) {
      console.error("Error fetching yearly trend data:", error);
      toast.error("Failed to generate sales trend data");
    } finally {
      setIsGeneratingChart(false);
    }
  };

  // Fetch sales data for the selected date range
  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Format dates as timestamps for the API
        const startTimestamp = dateRange.start.getTime().toString();
        const endTimestamp = dateRange.end.getTime().toString();

        // Use the new dedicated endpoint
        const data = await api.get(
          `/api/invoices/sales/salesmen?startDate=${startTimestamp}&endDate=${endTimestamp}`
        );

        if (Array.isArray(data)) {
          setSalesmanData(data);
        } else {
          throw new Error("Invalid response format");
        }
      } catch (error) {
        console.error("Error fetching sales data:", error);
        setError("Failed to load sales data. Please try again.");
        toast.error("Failed to load sales data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSalesData();
  }, [dateRange]);

  useEffect(() => {
    // Clear chart data if it exists when selection changes
    if (salesTrendData.length > 0) {
      setSalesTrendData([]);
    }
  }, [selectedChartSalesmen]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let data = [...salesmanData];

    // Apply sorting
    data.sort((a, b) => {
      const valueA = a[sortConfig.key] ?? 0;
      const valueB = b[sortConfig.key] ?? 0;

      if (valueA < valueB) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (valueA > valueB) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    return data;
  }, [salesmanData, sortConfig]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    let totalSales = 0;
    let totalBills = 0;
    let totalInvoices = 0;
    let totalCashBills = 0;

    salesmanData.forEach((salesman) => {
      totalSales += salesman.totalSales;
      totalBills += salesman.salesCount;
      totalInvoices += salesman.invoiceCount || 0;
      totalCashBills += salesman.cashCount || 0;
    });

    return {
      totalSales,
      totalBills,
      totalInvoices,
      totalCashBills,
      averageSalePerBill: totalBills > 0 ? totalSales / totalBills : 0,
    };
  }, [salesmanData]);

  // Get top performing salesmen
  const topSalesmen = useMemo(() => {
    const sortedSalesmen = [...salesmanData].sort(
      (a, b) => b.totalSales - a.totalSales
    );
    return sortedSalesmen.slice(0, 5); // Top 5 salesmen
  }, [salesmanData]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Handle sort change
  const handleSort = (key: keyof SalesmanData) => {
    setSortConfig({
      key,
      direction:
        sortConfig.key === key && sortConfig.direction === "asc"
          ? "desc"
          : "asc",
    });
  };

  // Generate random colors for charts
  const generateRandomColor = () => {
    return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
  };

  const generateSalesmanColors = () => {
    const colorMap: { [key: string]: string } = {};

    // Base colors for first few salesmen
    const baseColors = [
      "#4299e1", // Blue
      "#48bb78", // Green
      "#ed8936", // Orange
      "#9f7aea", // Purple
      "#f56565", // Red
    ];

    // Assign colors to the selected salesmen first
    selectedChartSalesmen.forEach((salesmanId, index) => {
      if (index < baseColors.length) {
        colorMap[salesmanId] = baseColors[index];
      } else {
        colorMap[salesmanId] = generateRandomColor();
      }
    });

    return colorMap;
  };

  const salesmanColors = useMemo(generateSalesmanColors, [salesmanData]);

  if (error) {
    return (
      <div className="w-full p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pt-0 mt-4 space-y-6">
      {/* Summary section */}
      <div className="bg-white rounded-lg border shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Summary</h2>

            {/* Date Range Picker */}
            <DateRangePicker
              dateRange={dateRange}
              onDateChange={(newDateRange) => {
                setDateRange(newDateRange);
              }}
            />

            {/* Month Selection */}
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
            />

            {/* Date Navigation */}
            <DateNavigator
              selectedDate={dateRange.start}
              onChange={handleDateChange}
              showGoToTodayButton={false}
            />
          </div>
          <div className="text-lg text-right font-bold text-default-700">
            Total Sales: {formatCurrency(summary.totalSales)}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-default-100/75 rounded-lg p-4 border-l-4 border-sky-500">
            <div className="text-sm text-default-500 font-medium">
              Total Sales
            </div>
            <div className="text-xl font-bold mt-1">
              {formatCurrency(summary.totalSales)}
            </div>
          </div>
          <div className="bg-default-100/75 rounded-lg p-4 border-l-4 border-green-500">
            <div className="text-sm text-default-500 font-medium">
              Total Bills
            </div>
            <div className="text-xl font-bold mt-1">
              {summary.totalBills.toLocaleString()}
            </div>
          </div>
          <div className="bg-default-100/75 rounded-lg p-4 border-l-4 border-amber-500">
            <div className="text-sm text-default-500 font-medium">
              Total Invoices
            </div>
            <div className="text-xl font-bold mt-1">
              {summary.totalInvoices.toLocaleString()}
            </div>
          </div>
          <div className="bg-default-100/75 rounded-lg p-4 border-l-4 border-indigo-500">
            <div className="text-sm text-default-500 font-medium">
              Total Cash Bills
            </div>
            <div className="text-xl font-bold mt-1">
              {summary.totalCashBills.toLocaleString()}
            </div>
          </div>
          <div className="bg-default-100/75 rounded-lg p-4 border-l-4 border-teal-500">
            <div className="text-sm text-default-500 font-medium">
              Average Sale per Bill
            </div>
            <div className="text-xl font-bold mt-1">
              {formatCurrency(summary.averageSalePerBill)}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="w-full h-64 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Detailed salesman sales table */}
          <div className="bg-white rounded-lg border shadow p-4">
            <h2 className="text-lg font-semibold mb-4">
              Salesman Performance Details
            </h2>
            {filteredAndSortedData.length > 0 ? (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-default-200">
                  <thead className="bg-default-100 sticky top-0">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("id")}
                      >
                        <div className="flex items-center">
                          Salesman ID
                          {sortConfig.key === "id" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("cashCount")}
                      >
                        <div className="flex items-center justify-end">
                          Cash Bills
                          {sortConfig.key === "cashCount" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("invoiceCount")}
                      >
                        <div className="flex items-center justify-end">
                          Invoices
                          {sortConfig.key === "invoiceCount" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("totalQuantity")}
                      >
                        <div className="flex items-center justify-end">
                          Total Quantity
                          {sortConfig.key === "totalQuantity" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("totalSales")}
                      >
                        <div className="flex items-center justify-end">
                          Total Sales
                          {sortConfig.key === "totalSales" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-default-200">
                    {filteredAndSortedData.map((salesman) => (
                      <tr key={salesman.id} className="hover:bg-default-100/75">
                        <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-default-900">
                          {salesman.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-right text-default-700">
                          {(salesman.cashCount || 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-right text-default-700">
                          {(salesman.invoiceCount || 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-right text-default-700">
                          {salesman.totalQuantity.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-right font-medium">
                          {formatCurrency(salesman.totalSales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-default-100 sticky bottom-0">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-3 text-right text-base font-medium"
                      >
                        Total:
                      </td>
                      <td className="px-6 py-3 text-right text-base font-bold">
                        {formatCurrency(summary.totalSales)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="border border-dashed border-default-300 rounded p-4 text-center text-default-500">
                No data to display. Please select a different month or check if
                sales data exists.
              </div>
            )}
          </div>

          {/* Dashboard content */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Salesmen Chart */}
            <div className="bg-white rounded-lg border shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                Top Performing Salesmen
              </h2>
              {topSalesmen.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topSalesmen}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <XAxis type="number" />
                      <YAxis
                        type="category"
                        dataKey="id"
                        width={80}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                      <Legend />
                      <Bar
                        dataKey="totalSales"
                        name="Sales"
                        fill="#4299e1"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center border border-dashed border-default-300 rounded">
                  No data available
                </div>
              )}
            </div>

            {/* Average Sale per Bill */}
            <div className="bg-white rounded-lg border shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                Average Sale per Bill
              </h2>
              {salesmanData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={salesmanData.map((s) => ({
                        id: s.id,
                        averageSale:
                          s.salesCount > 0 ? s.totalSales / s.salesCount : 0,
                      }))}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="id" />
                      <YAxis
                        tickFormatter={(value) =>
                          new Intl.NumberFormat("en", {
                            notation: "compact",
                            compactDisplay: "short",
                          }).format(Number(value))
                        }
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                      <Legend />
                      <Bar
                        dataKey="averageSale"
                        name="Average Sale"
                        fill="#48bb78" // Green to differentiate from the other chart
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center border border-dashed border-default-300 rounded">
                  No data available
                </div>
              )}
            </div>
          </div>

          {/* Sales Trend Chart */}
          <div className="bg-white rounded-lg border shadow p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                Salesmen's Sales Trends Over Time
              </h2>
              <div className="flex items-center gap-3">
                <FormCombobox
                  name="chartSalesmen"
                  label=""
                  value={selectedChartSalesmen}
                  onChange={(values) => {
                    // Ensure values is always treated as an array and filter out nulls
                    const valueArray = (
                      Array.isArray(values) ? values : [values].filter(Boolean)
                    ).filter((value): value is string => value !== null);
                    // Limit selection to prevent chart overcrowding
                    if (valueArray.length <= maxChartSalesmen) {
                      setSelectedChartSalesmen(valueArray);
                    } else if (valueArray.length > maxChartSalesmen) {
                      toast.error(
                        `Maximum ${maxChartSalesmen} salesmen can be selected for the chart`
                      );
                      // Keep the first max number of selections
                      setSelectedChartSalesmen(
                        valueArray.slice(0, maxChartSalesmen)
                      );
                    }
                  }}
                  options={salesmen
                    .filter((id) => id !== "All Salesmen")
                    .map((id) => ({ id, name: id }))}
                  query={salesmanQuery}
                  setQuery={setSalesmanQuery}
                />
                <Button
                  onClick={fetchYearlyTrendData}
                  disabled={
                    isGeneratingChart ||
                    salesTrendData.length > 0 ||
                    selectedChartSalesmen.length === 0
                  }
                  color="sky"
                >
                  {isGeneratingChart
                    ? "Generating..."
                    : salesTrendData.length > 0
                    ? "Generated"
                    : "Generate Chart"}
                </Button>
              </div>
            </div>
            {isGeneratingChart ? (
              <div className="w-full h-80 flex items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : salesTrendData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={salesTrendData}
                    margin={{ top: 10, right: 40, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      textAnchor="middle"
                      height={80}
                      tickMargin={15}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        new Intl.NumberFormat("en", {
                          notation: "compact",
                          compactDisplay: "short",
                        }).format(Number(value))
                      }
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      itemSorter={(item) =>
                        item.value ? -Number(item.value) : 0
                      }
                    />
                    <Legend wrapperStyle={{ bottom: 20 }} />
                    {/* Only show lines for salesmen who have data */}
                    {selectedChartSalesmen.map((salesmanId) => (
                      <Line
                        key={salesmanId}
                        type="monotone"
                        dataKey={salesmanId}
                        name={salesmanId}
                        stroke={
                          salesmanColors[salesmanId] || generateRandomColor()
                        }
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center border border-dashed border-default-300 rounded text-default-500">
                Generate to view sales trends for the past 12 months
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SalesBySalesmanPage;
