// src/pages/Sales/SalesByProductsPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../routes/utils/api";
import { FormListbox } from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  IconFilter,
  IconSortAscending,
  IconSortDescending,
  IconRefresh,
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
  const [error, setError] = useState<string | null>(null);
  const [productTypeFilter, setProductTypeFilter] = useState<string | null>(
    null
  );
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
    refreshProducts,
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
  const handleMonthChange = (newMonth: string) => {
    const monthIndex = parseInt(newMonth, 10);
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

  // Get available product types from sales data
  const availableProductTypes = useMemo(() => {
    const types = new Set<string>();
    salesData.forEach((product) => {
      if (product.type) types.add(product.type);
    });
    return Array.from(types).sort();
  }, [salesData]);

  // Generate product type filter options
  const productTypeOptions = useMemo(() => {
    const options = [{ id: "All Types", name: "All Types" }];

    availableProductTypes.forEach((type) => {
      options.push({ id: type, name: type });
    });

    return options;
  }, [availableProductTypes]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let data = [...salesData];

    // Apply product type filter
    if (productTypeFilter) {
      data = data.filter((product) => product.type === productTypeFilter);
    }

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
  }, [salesData, productTypeFilter, sortConfig]);

  // Handle product refresh
  const handleRefreshProducts = async () => {
    try {
      await refreshProducts();
      toast.success("Product data refreshed successfully");
    } catch (error) {
      toast.error("Failed to refresh product data");
    }
  };

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

      {/* Filter section */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-48">
            <FormListbox
              name="month"
              label="Select Month"
              value={monthOptions[selectedMonth].name}
              onChange={handleMonthChange}
              options={monthOptions}
            />
          </div>
          <div className="text-sm text-default-500 font-medium">
            Year: {selectedYear}
          </div>
          <div className="ml-auto flex items-center gap-4">
            <FormListbox
              name="productType"
              label="Filter by Type"
              value={productTypeFilter || "All Types"}
              onChange={(value) =>
                setProductTypeFilter(value === "All Types" ? null : value)
              }
              options={productTypeOptions}
            />
            <Button
              onClick={handleRefreshProducts}
              icon={IconRefresh}
              iconSize={16}
              iconStroke={2}
              variant="outline"
              size="sm"
            >
              Refresh Products
            </Button>
          </div>
        </div>
      </div>

      {/* Summary section */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Monthly Summary</h2>
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
        <div className="bg-white rounded-lg shadow p-4">
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

        <div className="bg-white rounded-lg shadow p-4">
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
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-4">Product Sales Details</h2>
        {filteredAndSortedData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50">
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
              <tfoot className="bg-default-50">
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
