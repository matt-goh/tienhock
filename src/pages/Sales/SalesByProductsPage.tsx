// src/pages/Sales/SalesByProductsPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../routes/utils/api";
import { FormListbox } from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  IconFilter,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import Button from "../../components/Button";
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
  AreaChart,
  Area,
} from "recharts";
import { useProductsCache } from "../../utils/invoice/useProductsCache";

interface ProductSalesData {
  id: string;
  description: string;
  type: string; // The actual product type (MEE, BH, JP)
  quantity: number;
  totalSales: number;
}

interface CategorySummary {
  name: string;
  value: number;
  color: string;
}

interface MonthlyTypeData {
  month: string;
  [key: string]: string | number; // For product types and their sales values
}

const SalesByProductsPage: React.FC = () => {
  // Month and year selection
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    const currentDate = new Date();
    return currentDate.getMonth();
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const currentDate = new Date();
    return currentDate.getFullYear();
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

  // Generate month options
  const monthOptions = useMemo(() => {
    return [
      { id: "0", name: "January" },
      { id: "1", name: "February" },
      { id: "2", name: "March" },
      { id: "3", name: "April" },
      { id: "4", name: "May" },
      { id: "5", name: "June" },
      { id: "6", name: "July" },
      { id: "7", name: "August" },
      { id: "8", name: "September" },
      { id: "9", name: "October" },
      { id: "10", name: "November" },
      { id: "11", name: "December" },
    ];
  }, []);

  // Handle month selection change
  const handleMonthChange = (value: string) => {
    const monthIndex = monthOptions.findIndex(
      (option) => option.name === value
    );
    if (monthIndex === -1) return;

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // If selected month is ahead of current month, show previous year
    if (monthIndex > currentMonth) {
      setSelectedYear(currentYear - 1);
    } else {
      setSelectedYear(currentYear);
    }

    setSelectedMonth(monthIndex);
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

          if (productMap.has(productId)) {
            const existingProduct = productMap.get(productId)!;
            existingProduct.quantity += quantity;
            existingProduct.totalSales += total;
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

  // Fetch sales data for the selected month
  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Calculate date range for the selected month
        const startDate = new Date(selectedYear, selectedMonth, 1);
        const endDate = new Date(selectedYear, selectedMonth + 1, 0);
        endDate.setHours(23, 59, 59, 999);

        // Format dates as timestamps for the API
        const startTimestamp = startDate.getTime().toString();
        const endTimestamp = endDate.getTime().toString();

        // Fetch invoices for the selected month
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
  }, [selectedMonth, selectedYear, products]);

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

  // Show loading when either products or sales data is loading
  if (isProductsLoading || isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

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
    <div className="w-full p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Sales by Products</h1>

      {/* Product Mix Analysis Chart */}
      <div className="bg-white rounded-lg border shadow p-4 pb-0 mb-4">
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
                tickFormatter={(value) =>
                  new Intl.NumberFormat("en", {
                    notation: "compact",
                    compactDisplay: "short",
                  }).format(value)
                }
              />
              <Tooltip
                formatter={(value: any) => formatCurrency(Number(value))}
                itemSorter={(item) => -Number(item.value)}
              />
              <Legend
                wrapperStyle={{ bottom: 20 }}
              />
              {Object.keys(categoryColors).map((type) => (
                <Line
                  key={type}
                  type="monotone"
                  dataKey={type}
                  stroke={categoryColors[type]}
                  strokeWidth={2}
                  activeDot={{ r: 8 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary section */}
      <div className="bg-white rounded-lg border shadow p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Monthly Summary</h2>
            <div className="w-40">
              <FormListbox
                name="month"
                label=""
                value={monthOptions[selectedMonth]?.name || "January"}
                onChange={handleMonthChange}
                options={monthOptions}
              />
            </div>
            <div className="text-sm text-default-500 font-medium">
              Year: {selectedYear}
            </div>
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

      {/* Dashboard content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Category Performance</h2>
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
          <h2 className="text-lg font-semibold mb-4">Top Selling Products</h2>
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
                      const product = topProducts.find((p) => p.id === label);
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

      {/* Detailed product sales table */}
      <div className="bg-white rounded-lg border shadow p-4">
        <h2 className="text-lg font-semibold mb-4">Product Sales Details</h2>
        {filteredAndSortedData.length > 0 ? (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            {" "}
            {/* Added fixed height and vertical scroll */}
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50 sticky top-0">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                    className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                    className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900">
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
                    colSpan={4}
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
    </div>
  );
};

export default SalesByProductsPage;
