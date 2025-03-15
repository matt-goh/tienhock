// src/pages/Sales/SalesBySalesmanPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  IconSortAscending,
  IconSortDescending,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";
import DateRangePicker from "../../components/DateRangePicker";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
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

interface MonthOption {
  id: number;
  name: string;
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

  // Month options
  const monthOptions = useMemo(() => {
    return [
      { id: 0, name: "January" },
      { id: 1, name: "February" },
      { id: 2, name: "March" },
      { id: 3, name: "April" },
      { id: 4, name: "May" },
      { id: 5, name: "June" },
      { id: 6, name: "July" },
      { id: 7, name: "August" },
      { id: 8, name: "September" },
      { id: 9, name: "October" },
      { id: 10, name: "November" },
      { id: 11, name: "December" },
    ];
  }, []);

  // State hooks
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(() => {
    return monthOptions[currentMonth];
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => currentYear);
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

  // Handle month selection change
  const handleMonthChange = (month: MonthOption) => {
    setSelectedMonth(month);

    // If selected month is ahead of current month, use previous year
    const year = month.id > currentMonth ? currentYear - 1 : currentYear;
    setSelectedYear(year);

    // Create start date (1st of the selected month)
    const startDate = new Date(year, month.id, 1);
    startDate.setHours(0, 0, 0, 0);

    // Create end date (last day of the selected month)
    const endDate = new Date(year, month.id + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    // Update date range
    setDateRange({ start: startDate, end: endDate });
  };

  // Process invoice data to get salesman sales
  const processInvoiceData = (invoices: any[]) => {
    const salesmanMap = new Map<string, SalesmanData>();

    invoices.forEach((invoice) => {
      const salesmanId = invoice.salespersonid;
      if (!salesmanId) return;

      // Calculate total sales and quantity for this invoice (excluding taxes and rounding)
      let invoiceTotal = 0;
      let totalQuantity = 0;

      if (Array.isArray(invoice.products)) {
        invoice.products.forEach((product: any) => {
          // Skip subtotal or total rows
          if (product.issubtotal || product.istotal) return;

          const quantity = Number(product.quantity) || 0;
          const price = Number(product.price) || 0;

          // Calculate product total (same as in SalesByProductsPage)
          invoiceTotal += quantity * price;
          totalQuantity += quantity;
        });
      }

      const isCashBill = invoice.paymenttype === "CASH";

      if (salesmanMap.has(salesmanId)) {
        const existingSalesman = salesmanMap.get(salesmanId)!;
        existingSalesman.totalSales += invoiceTotal;
        existingSalesman.totalQuantity += totalQuantity;
        existingSalesman.salesCount += 1;

        // Increment the appropriate counter based on invoice type
        if (isCashBill) {
          existingSalesman.cashCount = (existingSalesman.cashCount || 0) + 1;
        } else {
          existingSalesman.invoiceCount =
            (existingSalesman.invoiceCount || 0) + 1;
        }
      } else {
        salesmanMap.set(salesmanId, {
          id: salesmanId,
          totalSales: invoiceTotal,
          totalQuantity: totalQuantity,
          salesCount: 1,
          cashCount: isCashBill ? 1 : 0,
          invoiceCount: isCashBill ? 0 : 1,
        });
      }
    });

    return Array.from(salesmanMap.values());
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

      const invoices = await api.get(
        `/api/invoices?startDate=${startTimestamp}&endDate=${endTimestamp}`
      );

      if (!Array.isArray(invoices)) {
        throw new Error("Invalid response format");
      }

      // Group sales by month and salesman
      const monthlyData = new Map<string, Record<string, number>>();
      const allSalesmen = new Set<string>();

      invoices.forEach((invoice) => {
        const invoiceDate = new Date(Number(invoice.createddate));
        const monthYear = `${invoiceDate.getFullYear()}-${String(
          invoiceDate.getMonth() + 1
        ).padStart(2, "0")}`;

        if (!monthlyData.has(monthYear)) {
          monthlyData.set(monthYear, {});
        }

        const salesmanId = invoice.salespersonid;
        if (!salesmanId) return;

        allSalesmen.add(salesmanId);

        // Calculate total for the invoice (product quantity * price)
        let invoiceTotal = 0;
        if (Array.isArray(invoice.products)) {
          invoice.products.forEach((product: any) => {
            // Skip subtotal or total rows
            if (product.issubtotal || product.istotal) return;
            const quantity = Number(product.quantity) || 0;
            const price = Number(product.price) || 0;
            invoiceTotal += quantity * price;
          });
        }

        const monthData = monthlyData.get(monthYear)!;
        monthData[salesmanId] = (monthData[salesmanId] || 0) + invoiceTotal;
      });

      // Convert to array format for chart
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const sortedMonths = Array.from(monthlyData.keys()).sort();

      const chartData = sortedMonths.map((monthYear) => {
        const [year, month] = monthYear.split("-");
        const monthData = monthlyData.get(monthYear)!;

        // Create data point with month label and all salesmen
        const dataPoint: SalesTrendData = {
          month: `${monthNames[parseInt(month) - 1]} ${year}`,
        };

        // Add values for each salesman
        Array.from(allSalesmen).forEach((salesmanId) => {
          dataPoint[salesmanId] = monthData[salesmanId] || 0;
        });

        return dataPoint;
      });

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

        // Fetch invoices for the selected date range
        const invoices = await api.get(
          `/api/invoices?startDate=${startTimestamp}&endDate=${endTimestamp}`
        );

        if (Array.isArray(invoices)) {
          const processedData = processInvoiceData(invoices);
          setSalesmanData(processedData);
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
  const generateSalesmanColors = () => {
    const colorMap: Record<string, string> = {};

    // Base colors for first few salesmen
    const baseColors = [
      "#4299e1", // Blue
      "#48bb78", // Green
      "#ed8936", // Orange
      "#9f7aea", // Purple
      "#f56565", // Red
    ];

    salesmanData.forEach((salesman, index) => {
      if (index < baseColors.length) {
        colorMap[salesman.id] = baseColors[index];
      } else {
        // Generate a random color for additional salesmen
        const randomColor = `#${Math.floor(Math.random() * 16777215).toString(
          16
        )}`;
        colorMap[salesman.id] = randomColor;
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
    <div className="w-full p-6 max-w-[88rem] mx-auto space-y-6">
      <h1 className="text-2xl font-bold mb-6">Sales by Salesman</h1>

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
            <div className="w-40">
              <Listbox value={selectedMonth} onChange={handleMonthChange}>
                <div className="relative">
                  <ListboxButton className="w-full rounded-full border border-default-300 bg-white py-[9px] pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
                    <span className="block truncate pl-2">
                      {selectedMonth.name}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <IconChevronDown
                        className="h-5 w-5 text-default-400"
                        aria-hidden="true"
                      />
                    </span>
                  </ListboxButton>
                  <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                    {monthOptions.map((month) => (
                      <ListboxOption
                        key={month.id}
                        className={({ active }) =>
                          `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                            active
                              ? "bg-default-100 text-default-900"
                              : "text-default-900"
                          }`
                        }
                        value={month}
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              {month.name}
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                <IconCheck
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
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

            <div className="text-default-500 font-medium">{selectedYear}</div>
          </div>
          <div className="text-lg font-bold text-default-700">
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
              <h2 className="text-lg font-semibold">Sales Trends Over Time</h2>
              <Button
                onClick={fetchYearlyTrendData}
                disabled={isGeneratingChart || salesTrendData.length > 0}
                color="sky"
              >
                {isGeneratingChart
                  ? "Generating..."
                  : salesTrendData.length > 0
                  ? "Generated"
                  : "Generate Chart"}
              </Button>
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
                    {salesmanData.map((salesman) => (
                      <Line
                        key={salesman.id}
                        type="monotone"
                        dataKey={salesman.id}
                        name={salesman.id}
                        stroke={salesmanColors[salesman.id]}
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
                Generate to view salesmen's sales trends for the past 12 months
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SalesBySalesmanPage;
