// src/pages/Sales/SalesByProductsPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../routes/utils/api";
import { FormListbox } from "../../components/FormComponents";
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
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { useProductsCache } from "../../utils/invoice/useProductsCache";

interface ProductSalesData {
  id: string;
  description: string;
  type: string; // The actual product type (MEE, BH, JP)
  quantity: number;
  totalSales: number;
  foc: number;
  returns: number;
}

interface CategorySummary {
  name: string;
  value: number;
  color: string;
}

interface MonthOption {
  id: number;
  name: string;
}

interface MonthlyTypeData {
  month: string;
  [key: string]: string | number; // For product types and their sales values
}

interface DateRange {
  start: Date;
  end: Date;
}

const today = new Date();
today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const currentDate = new Date();
const currentMonth = currentDate.getMonth();
const currentYear = currentDate.getFullYear();

const SalesByProductsPage: React.FC = () => {
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

  // Month and year selection
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(() => {
    return monthOptions[currentMonth];
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const currentDate = new Date();
    return currentDate.getFullYear();
  });
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
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
  const [salesData, setSalesData] = useState<ProductSalesData[]>([]);
  const [yearlyTrendData, setYearlyTrendData] = useState<MonthlyTypeData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof ProductSalesData;
    direction: "asc" | "desc";
  }>({
    key: "totalSales",
    direction: "desc",
  });

  // Get products from cache
  const {
    products,
    isLoading: isProductsLoading,
    error: productsError,
  } = useProductsCache();

  // Dynamic category colors based on product types
  const categoryColors = useMemo(() => {
    // Base colors for known types
    const baseColors: Record<string, string> = {
      BH: "#4299e1", // Blue
      MEE: "#48bb78", // Green
      JP: "#ed8936", // Orange
      OTHER: "#a0aec0", // Gray
    };

    // Add colors for any other types found in the data
    const typeSet = new Set<string>();
    salesData.forEach((product) => {
      if (product.type) typeSet.add(product.type);
    });

    // Generate colors for types not in baseColors
    const result: Record<string, string> = { ...baseColors };
    Array.from(typeSet).forEach((type) => {
      if (!result[type]) {
        // Generate a random color if not already defined
        const randomColor = `#${Math.floor(Math.random() * 16777215).toString(
          16
        )}`;
        result[type] = randomColor;
      }
    });

    return result;
  }, [salesData]);

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

  // Get product type from product ID using cache
  const getProductType = (productId: string): string => {
    const product = products.find((p) => p.id === productId);
    return product?.type || "OTHER";
  };

  // Get product description from product ID using cache
  const getProductDescription = (productId: string): string => {
    const product = products.find((p) => p.id === productId);
    return product?.description || productId;
  };

  // Process invoice data to get product sales
  const processInvoiceData = (invoices: any[]) => {
    const productMap = new Map<string, ProductSalesData>();

    invoices.forEach((invoice) => {
      if (Array.isArray(invoice.products)) {
        invoice.products.forEach((product: any) => {
          // Skip subtotal or total rows
          if (product.issubtotal || product.istotal) return;

          const productId = product.code;
          if (!productId) return;

          const quantity = Number(product.quantity) || 0;
          const price = Number(product.price) || 0;
          const total = quantity * price;
          const foc = Number(product.freeProduct) || 0; // Get FOC quantity
          const returns = Number(product.returnProduct) || 0; // Get Returns quantity

          if (productMap.has(productId)) {
            const existingProduct = productMap.get(productId)!;
            existingProduct.quantity += quantity;
            existingProduct.totalSales += total;
            existingProduct.foc += foc; // Add FOC
            existingProduct.returns += returns; // Add Returns
          } else {
            // Get product type from cache
            const type = getProductType(productId);
            const description = getProductDescription(productId);

            productMap.set(productId, {
              id: productId,
              description,
              type,
              quantity,
              totalSales: total,
              foc, // Initialize FOC
              returns, // Initialize Returns
            });
          }
        });
      }
    });

    return Array.from(productMap.values());
  };

  // Fetch yearly trend data for the product mix chart
  const fetchYearlyTrendData = async () => {
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

      // Group sales by month and product type
      const monthlyData = new Map<string, Record<string, number>>();
      const allTypes = new Set<string>();

      invoices.forEach((invoice) => {
        const invoiceDate = new Date(Number(invoice.createddate));
        const monthYear = `${invoiceDate.getFullYear()}-${String(
          invoiceDate.getMonth() + 1
        ).padStart(2, "0")}`;

        if (!monthlyData.has(monthYear)) {
          monthlyData.set(monthYear, {});
        }

        if (Array.isArray(invoice.products)) {
          invoice.products.forEach(
            (product: {
              issubtotal: any;
              istotal: any;
              code: string;
              quantity: any;
              price: any;
            }) => {
              if (product.issubtotal || product.istotal) return;

              const productType = getProductType(product.code);
              allTypes.add(productType);

              const quantity = Number(product.quantity) || 0;
              const price = Number(product.price) || 0;
              const total = quantity * price;

              const monthData = monthlyData.get(monthYear)!;
              monthData[productType] = (monthData[productType] || 0) + total;
            }
          );
        }
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

        // Create data point with month label and all product types
        const dataPoint: MonthlyTypeData = {
          month: `${monthNames[parseInt(month) - 1]} ${year}`,
        };

        // Add values for each product type
        Array.from(allTypes).forEach((type) => {
          dataPoint[type] = monthData[type] || 0;
        });

        // Add total
        dataPoint.total = Object.values(monthData).reduce(
          (sum, value) => sum + value,
          0
        );

        return dataPoint;
      });

      setYearlyTrendData(chartData);
    } catch (error) {
      console.error("Error fetching yearly trend data:", error);
      // Don't show error toast for this - just log it
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
          setSalesData(processedData);
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

    // Only fetch if products are loaded
    if (products.length > 0) {
      fetchSalesData();
    }
  }, [dateRange, products]); // Changed from [selectedMonth, selectedYear, products]

  // Fetch yearly trend data on initial load
  useEffect(() => {
    if (products.length > 0) {
      fetchYearlyTrendData();
    }
  }, [products]);

  // No longer need product type filters

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let data = [...salesData];

    // Apply sorting
    data.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    return data;
  }, [salesData, sortConfig]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const categorySummary: { [key: string]: number } = {};
    let totalSales = 0;

    salesData.forEach((product) => {
      const category = product.type;
      if (!categorySummary[category]) {
        categorySummary[category] = 0;
      }
      categorySummary[category] += product.totalSales;
      totalSales += product.totalSales;
    });

    // Format for pie chart
    const pieData: CategorySummary[] = Object.keys(categorySummary).map(
      (category) => ({
        name: category,
        value: categorySummary[category],
        color: categoryColors[category] || "#a0aec0",
      })
    );

    return {
      categorySummary,
      totalSales,
      pieData,
    };
  }, [salesData, categoryColors]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Get top selling products
  const topProducts = useMemo(() => {
    const sortedProducts = [...salesData].sort(
      (a, b) => b.totalSales - a.totalSales
    );
    return sortedProducts.slice(0, 5); // Top 5 products
  }, [salesData]);

  // Handle sort change
  const handleSort = (key: keyof ProductSalesData) => {
    setSortConfig({
      key,
      direction:
        sortConfig.key === key && sortConfig.direction === "asc"
          ? "desc"
          : "asc",
    });
  };

  // Show error from either source
  if (productsError || error) {
    return (
      <div className="w-full p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700">
          {typeof productsError === "object" && productsError instanceof Error
            ? productsError.message
            : productsError || error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold mb-6">Sales by Products</h1>

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.keys(summary.categorySummary).map((category) => (
            <div
              key={category}
              className="bg-default-50 rounded-lg p-4 border-l-4"
              style={{ borderColor: categoryColors[category] || "#a0aec0" }}
            >
              <div className="text-sm text-default-500 font-medium">
                {category}
              </div>
              <div className="text-xl font-bold mt-1">
                {formatCurrency(summary.categorySummary[category])}
              </div>
              <div className="text-sm text-default-500 mt-1">
                {(
                  (summary.categorySummary[category] / summary.totalSales) *
                  100
                ).toFixed(1)}
                % of total
              </div>
            </div>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="w-full h-64 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700">
          {error}
        </div>
      ) : (
        <>
          {/* Detailed product sales table */}
          <div className="bg-white rounded-lg border shadow p-4">
            <h2 className="text-lg font-semibold mb-4">
              Product Sales Details
            </h2>
            {filteredAndSortedData.length > 0 ? (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                {" "}
                {/* Added fixed height and vertical scroll */}
                <table className="min-w-full divide-y divide-default-200">
                  <thead className="bg-default-50 sticky top-0">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-sm font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("id")}
                      >
                        <div className="flex items-center">
                          Product ID
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
                        className="px-6 py-3 text-left text-sm font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("description")}
                      >
                        <div className="flex items-center">
                          Description
                          {sortConfig.key === "description" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-sm font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("type")}
                      >
                        <div className="flex items-center">
                          Type
                          {sortConfig.key === "type" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-sm font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("foc")}
                      >
                        <div className="flex items-center justify-end">
                          FOC
                          {sortConfig.key === "foc" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-sm font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("returns")}
                      >
                        <div className="flex items-center justify-end">
                          Returns
                          {sortConfig.key === "returns" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("quantity")}
                      >
                        <div className="flex items-center justify-end">
                          Quantity
                          {sortConfig.key === "quantity" &&
                            (sortConfig.direction === "asc" ? (
                              <IconSortAscending size={16} className="ml-1" />
                            ) : (
                              <IconSortDescending size={16} className="ml-1" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                    {filteredAndSortedData.map((product) => (
                      <tr key={product.id} className="hover:bg-default-50">
                        <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-default-900">
                          {product.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-default-700">
                          {product.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-default-700">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${
                                categoryColors[product.type] || "#a0aec0"
                              }20`,
                              color: categoryColors[product.type] || "#a0aec0",
                            }}
                          >
                            {product.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-default-700">
                          {product.foc.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-default-700">
                          {product.returns.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-default-700">
                          {product.quantity.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                          {formatCurrency(product.totalSales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-default-50 sticky bottom-0">
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-3 text-right text-sm font-medium"
                      >
                        Total:
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-bold">
                        {formatCurrency(
                          filteredAndSortedData.reduce(
                            (sum, product) => sum + product.totalSales,
                            0
                          )
                        )}
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
            <div className="bg-white rounded-lg border shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                Category Performance
              </h2>
              {summary.pieData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summary.pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name}: ${(percent * 100).toFixed(1)}%`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {summary.pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center border border-dashed border-default-300 rounded">
                  No data available
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                Top Selling Products
              </h2>
              {topProducts.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topProducts}
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
                        labelFormatter={(label) => {
                          const product = topProducts.find(
                            (p) => p.id === label
                          );
                          return product
                            ? `${product.id}: ${product.description}`
                            : label;
                        }}
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
          </div>

          {/* Product Mix Analysis Chart */}
          <div className="bg-white rounded-lg border shadow p-4 pb-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={yearlyTrendData}
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
                    tickFormatter={(value: string | number | bigint) =>
                      new Intl.NumberFormat("en", {
                        notation: "compact",
                        compactDisplay: "short",
                      }).format(Number(value))
                    }
                  />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value))}
                    itemSorter={(item) =>
                      item.value ? -Number(item.value) : 0
                    }
                  />
                  <Legend wrapperStyle={{ bottom: 20 }} />
                  {Object.keys(categoryColors).map((type) => (
                    <Line
                      key={type}
                      type="monotone"
                      dataKey={type}
                      stroke={categoryColors[type]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SalesByProductsPage;
