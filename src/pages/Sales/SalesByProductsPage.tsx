// src/pages/Sales/SalesByProductsPage.tsx
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
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import Button from "../../components/Button";

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
  const [isGeneratingChart, setIsGeneratingChart] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    // Create start date (today)
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    // Create end date (today)
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    return { start: startDate, end: endDate };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [salesData, setSalesData] = useState<ProductSalesData[]>([]);
  const [selectedSalesman, setSelectedSalesman] =
    useState<string>("All Salesmen");
  const [salesmen, setSalesmen] = useState<string[]>(["All Salesmen"]);
  const [yearlyTrendData, setYearlyTrendData] = useState<MonthlyTypeData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof ProductSalesData;
    direction: "asc" | "desc";
  }>({
    key: "totalSales",
    direction: "desc",
  });
  const {
    products,
    isLoading: isProductsLoading,
    error: productsError,
  } = useProductsCache("all");
  const { salesmen: salesmenData, isLoading: salesmenLoading } =
    useSalesmanCache();
  const [selectedChartProducts, setSelectedChartProducts] = useState<string[]>(
    []
  );
  const [productQuery, setProductQuery] = useState("");
  const [maxChartProducts] = useState(5); // Limit to prevent chart legend overcrowding

  // Dynamic category colors based on product types
  const categoryColors = useMemo(() => {
    // Base colors for known types
    const baseColors: Record<string, string> = {
      BH: "#4299e1", // Blue
      MEE: "#48bb78", // Green
      JP: "#ed8936", // Orange
      OTH: "#9f7aea", // Purple
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
  const handleMonthChange = (monthId: string | number) => {
    const month = monthOptions.find((m) => m.id === Number(monthId));
    if (!month) return;

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

  const productOptions = useMemo(() => {
    const options = [
      { id: "MEE", name: "Mee Products" },
      { id: "BH", name: "Bihun Products" },
      { id: "OTH", name: "Other Products" },
    ];

    // Add individual products from cache
    products.forEach((product) => {
      options.push({
        id: product.id,
        name: product.description || product.id,
      });
    });

    return options;
  }, [products]);

  useEffect(() => {
    // Dispatch month selection event when it changes
    if (selectedMonth && selectedYear) {
      window.dispatchEvent(
        new CustomEvent("monthSelectionChanged", {
          detail: { month: selectedMonth.id, year: selectedYear },
        })
      );
    }
  }, [selectedMonth, selectedYear]);

  // Clear chart data when product selection changes
  useEffect(() => {
    if (yearlyTrendData.length > 0) {
      setYearlyTrendData([]);
    }
  }, [selectedChartProducts]);

  useEffect(() => {
    if (salesmenData.length > 0) {
      const salesmenIds = salesmenData.map((employee) => employee.id);
      setSalesmen(["All Salesmen", ...salesmenIds]);
    }
  }, [salesmenData]);

  // Initialize selected products when product options are available
  useEffect(() => {
    if (productOptions.length > 0) {
      // Take the first few products up to the maximum limit
      // Start with categories (MEE, BH, OTH) if available
      const categoryOptions = productOptions
        .filter((option) => ["MEE", "BH", "OTH"].includes(option.id))
        .map((option) => option.id);

      // Take up to the limit
      const initialSelection = categoryOptions.slice(0, maxChartProducts);

      // If we still have room, add some individual products
      if (initialSelection.length < maxChartProducts) {
        const individualProducts = productOptions
          .filter((option) => !["MEE", "BH", "OTH"].includes(option.id))
          .slice(0, maxChartProducts - initialSelection.length)
          .map((option) => option.id);

        initialSelection.push(...individualProducts);
      }

      setSelectedChartProducts(initialSelection);
    }
  }, [productOptions, maxChartProducts]);

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

  const getProductColor = (key: string): string => {
    // If it's a category, use its color
    if (categoryColors[key]) {
      return categoryColors[key];
    }

    // For individual products, derive color from their product type
    const productType = getProductType(key);
    const baseColor = categoryColors[productType] || "#a0aec0";

    // Create a consistent variation based on product ID
    const hash = key
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const shade = -40 + (hash % 60); // Generate a shade between -40% (darker) and +20% (lighter)

    return adjustColorBrightness(baseColor, shade);
  };

  // Helper function to adjust color brightness with limits
  const adjustColorBrightness = (hex: string, percent: number): string => {
    // Limit the brightness adjustment to ensure colors aren't too light
    percent = Math.min(20, Math.max(-40, percent)); // Limit between -40% (darker) and +20% (slightly lighter)

    // Convert hex to RGB
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    // Adjust brightness
    r = Math.floor((r * (100 + percent)) / 100);
    g = Math.floor((g * (100 + percent)) / 100);
    b = Math.floor((b * (100 + percent)) / 100);

    // Ensure values are in valid range
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));

    // Convert back to hex
    return `#${r.toString(16).padStart(2, "0")}${g
      .toString(16)
      .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };

  // Get top products for summary cards
  const topProductSummary = useMemo(() => {
    // Define product type order for sorting
    const typeOrder: Record<string, number> = {
      MEE: 1,
      BH: 2,
      JP: 3,
      OTH: 4,
      OTHER: 5,
    };

    // Sort by product type first, then by sales amount within each type
    const sortedProducts = [...salesData].sort((a, b) => {
      const typeOrderA = typeOrder[a.type] || 999;
      const typeOrderB = typeOrder[b.type] || 999;

      // First sort by type order
      if (typeOrderA !== typeOrderB) {
        return typeOrderA - typeOrderB;
      }

      // Then sort by sales amount (descending) within the same type
      return b.totalSales - a.totalSales;
    });

    // Return all products (remove the slice limit)
    return sortedProducts;
  }, [salesData]);

  // Fetch yearly trend data for the product mix chart
  const fetchYearlyTrendData = async () => {
    setIsGeneratingChart(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1); // Last 12 months

      const startTimestamp = startDate.getTime().toString();
      const endTimestamp = endDate.getTime().toString();

      // Use new trends endpoint with product type
      const url = `/api/invoices/sales/trends?type=products&startDate=${startTimestamp}&endDate=${endTimestamp}&ids=${selectedChartProducts.join(
        ","
      )}`;

      const chartData = await api.get(url);

      if (!Array.isArray(chartData)) {
        throw new Error("Invalid response format");
      }

      // Check if we received any data
      if (chartData.length === 0) {
        toast.error("No data found for the selected products in the past year");
        setYearlyTrendData([]);
        return;
      }

      setYearlyTrendData(chartData);
      toast.success("Product trend data generated successfully");
    } catch (error) {
      console.error("Error fetching yearly trend data:", error);
      toast.error("Failed to generate product trend data");
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
        let url = `/api/invoices/sales/products?startDate=${startTimestamp}&endDate=${endTimestamp}`;

        // Add salesman filter if not "All Salesmen"
        if (selectedSalesman !== "All Salesmen") {
          url += `&salesman=${selectedSalesman}`;
        }

        const data = await api.get(url);

        if (Array.isArray(data)) {
          setSalesData(data);
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
  }, [dateRange, selectedSalesman]);

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

  // Function to generate color shades
  const generateShades = (baseColor: string, count: number): string[] => {
    // Convert hex to HSL to make it easier to adjust lightness
    const hexToHSL = (hex: string): { h: number; s: number; l: number } => {
      // Remove the # if present
      hex = hex.replace(/^#/, "");

      // Parse the hex values
      let r = parseInt(hex.substring(0, 2), 16) / 255;
      let g = parseInt(hex.substring(2, 4), 16) / 255;
      let b = parseInt(hex.substring(4, 6), 16) / 255;

      // Find the max and min values to calculate lightness
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0,
        s = 0,
        l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
          case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / d + 2;
            break;
          case b:
            h = (r - g) / d + 4;
            break;
        }

        h /= 6;
      }

      return { h: h * 360, s: s * 100, l: l * 100 };
    };

    // Convert HSL to hex
    const hslToHex = (h: number, s: number, l: number): string => {
      h /= 360;
      s /= 100;
      l /= 100;

      let r, g, b;

      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p: number, q: number, t: number): number => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }

      const toHex = (x: number): string => {
        const hex = Math.round(x * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      };

      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    // Get the HSL values from the base color
    const hsl = hexToHSL(baseColor);

    // Generate different shades by adjusting the lightness
    const shades = [];

    // Start with darker shades and move to lighter
    const minLightness = 25; // Darker
    const maxLightness = 75; // Lighter
    const lightnessRange = maxLightness - minLightness;
    const step = count > 1 ? lightnessRange / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const lightness = maxLightness - i * step;
      shades.push(hslToHex(hsl.h, hsl.s, lightness));
    }

    return shades;
  };

  // Summary of individual products:
  const summary = useMemo(() => {
    const categorySummary: { [key: string]: number } = {};
    let totalSales = 0;

    // Separate product data by type
    const bhProducts: ProductSalesData[] = [];
    const meeProducts: ProductSalesData[] = [];
    const othProducts: ProductSalesData[] = [];

    salesData.forEach((product) => {
      const category = product.type;

      // Build category summary
      if (!categorySummary[category]) {
        categorySummary[category] = 0;
      }
      categorySummary[category] += product.totalSales;
      totalSales += product.totalSales;

      // Separate products by type
      if (product.type === "BH") {
        bhProducts.push(product);
      } else if (product.type === "MEE") {
        meeProducts.push(product);
      } else if (product.type === "OTH") {
        othProducts.push(product);
      }
    });

    // Sort products by sales for each type
    bhProducts.sort((a, b) => b.totalSales - a.totalSales);
    meeProducts.sort((a, b) => b.totalSales - a.totalSales);
    othProducts.sort((a, b) => b.totalSales - a.totalSales);

    // Create pie data for each type with shaded colors
    const createPieData = (
      products: ProductSalesData[],
      baseColor: string,
      limit: number = 8
    ) => {
      // Take top N products
      const topProducts = products.slice(0, limit);

      // Generate shades for the products
      const shades = generateShades(baseColor, topProducts.length);

      // Create pie data entries with the shaded colors
      const pieData = topProducts.map((product, index) => ({
        name: product.id, // Show product code in labels
        description: product.description || product.id, // Keep description for tooltips
        value: product.totalSales,
        color: shades[index],
        id: product.id, // Add id to ensure consistency
      }));

      // Add others if needed
      if (products.length > limit) {
        pieData.push({
          name: "Others",
          description: "Other Products",
          value: products
            .slice(limit)
            .reduce((sum, p) => sum + p.totalSales, 0),
          color: "#a0aec0",
          id: "others",
        });
      }

      return pieData;
    };

    // Format for category pie chart (keeping for compatibility)
    const pieData: CategorySummary[] = Object.keys(categorySummary).map(
      (category) => ({
        name: category,
        value: categorySummary[category],
        color: categoryColors[category] || "#a0aec0",
      })
    );

    const bhTotal = bhProducts.reduce((sum, p) => sum + p.totalSales, 0);
    const meeTotal = meeProducts.reduce((sum, p) => sum + p.totalSales, 0);
    const othTotal = othProducts.reduce((sum, p) => sum + p.totalSales, 0);

    return {
      categorySummary,
      totalSales,
      pieData,
      bhPieData: createPieData(bhProducts, categoryColors["BH"] || "#4299e1"),
      meePieData: createPieData(
        meeProducts,
        categoryColors["MEE"] || "#48bb78"
      ),
      othPieData: createPieData(
        othProducts,
        categoryColors["OTH"] || "#9f7aea"
      ),
      bhTotal,
      meeTotal,
      othTotal,
    };
  }, [salesData, categoryColors]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

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
    <div className="w-full pt-0 max-w-[90rem] mt-4 mx-auto space-y-6">
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
              <StyledListbox
                value={selectedMonth.id}
                onChange={handleMonthChange}
                options={monthOptions}
              />
            </div>

            {/* Salesman Selection */}
            <div className="w-40">
              <StyledListbox
                value={selectedSalesman}
                onChange={(value) => setSelectedSalesman(value.toString())}
                options={salesmen.map((salesman) => ({
                  id: salesman,
                  name: salesman,
                }))}
              />
            </div>
          </div>
          <div className="text-lg text-right font-bold text-default-700">
            Total Sales: {formatCurrency(summary.totalSales)}
          </div>
        </div>
        {/* Product cards */}
        <div className="max-h-96 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-2">
            {topProductSummary.map((product) => (
              <div
                key={product.id}
                className="bg-default-100/75 rounded-lg p-3 border-l-4 overflow-hidden flex-shrink-0"
                style={{
                  borderColor: categoryColors[product.type] || "#a0aec0",
                }}
              >
                <div
                  className="text-base text-default-500 font-medium truncate"
                  title={`${
                    product.description
                  } • ${product.quantity.toLocaleString()} units`}
                >
                  {product.description || product.id}
                  {" • "}
                  {product.quantity.toLocaleString()} units
                </div>
                <div className="text-lg font-bold mt-1">
                  {formatCurrency(product.totalSales)}
                </div>
                <div className="text-sm text-default-500 font-medium mt-1"></div>
              </div>
            ))}
          </div>
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
                {/* Added fixed height and vertical scroll */}
                <table className="min-w-full divide-y divide-default-200">
                  <thead className="bg-default-100 sticky top-0">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                        className="px-6 py-3 text-left text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                        className="px-6 py-3 text-left text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                        className="px-6 py-3 text-right text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                        className="px-6 py-3 text-right text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                        className="px-6 py-3 text-right text-base font-medium text-default-500 uppercase tracking-wider cursor-pointer"
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
                    {filteredAndSortedData.map((product) => (
                      <tr key={product.id} className="hover:bg-default-100/75">
                        <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-default-900">
                          {product.id}
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-base text-default-700 truncate max-w-xs"
                          title={product.description}
                        >
                          {product.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-default-700">
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
                        <td className="px-6 py-4 whitespace-nowrap text-base text-right text-default-700">
                          {product.foc.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-right text-default-700">
                          {product.returns.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-right text-default-700">
                          {product.quantity.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-right font-medium">
                          {formatCurrency(product.totalSales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-default-100 sticky bottom-0">
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-3 text-right text-base font-medium"
                      >
                        Total:
                      </td>
                      <td className="px-6 py-3 text-right text-base font-bold">
                        {filteredAndSortedData
                          .reduce((sum, product) => sum + product.quantity, 0)
                          .toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-right text-base font-bold">
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

          {/* Dashboard content - Three separate doughnut charts without legends */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* BH Products Doughnut Chart */}
            <div className="bg-white rounded-lg border shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                Bihun Products Distribution
              </h2>
              {summary.bhPieData && summary.bhPieData.length > 0 ? (
                <>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={summary.bhPieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) =>
                            percent > 0.05
                              ? `${name.substring(0, 12)}${
                                  name.length > 12 ? "..." : ""
                                }: ${(percent * 100).toFixed(1)}%`
                              : ""
                          }
                          outerRadius={100}
                          innerRadius={50}
                          fill="#8884d8"
                          dataKey="value"
                          paddingAngle={2}
                        >
                          {summary.bhPieData.map((entry) => (
                            <Cell key={entry.id} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name, props) => [formatCurrency(Number(value)), props.payload.description]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    className="text-center mt-2 py-2 rounded-lg"
                    style={{
                      backgroundColor: `${categoryColors["BH"]}15`,
                      color: categoryColors["BH"] || "#4299e1",
                      fontWeight: 600,
                    }}
                  >
                    Total: {formatCurrency(summary.bhTotal)}
                  </div>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center border border-dashed border-default-300 rounded">
                  No Bihun products data available
                </div>
              )}
            </div>

            {/* MEE Products Doughnut Chart */}
            <div className="bg-white rounded-lg border shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                Mee Products Distribution
              </h2>
              {summary.meePieData && summary.meePieData.length > 0 ? (
                <>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={summary.meePieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) =>
                            percent > 0.05
                              ? `${name.substring(0, 12)}${
                                  name.length > 12 ? "..." : ""
                                }: ${(percent * 100).toFixed(1)}%`
                              : ""
                          }
                          outerRadius={100}
                          innerRadius={50}
                          fill="#8884d8"
                          dataKey="value"
                          paddingAngle={2}
                        >
                          {summary.meePieData.map((entry) => (
                            <Cell key={entry.id} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name, props) => [formatCurrency(Number(value)), props.payload.description]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    className="text-center mt-2 py-2 rounded-lg"
                    style={{
                      backgroundColor: `${categoryColors["MEE"]}15`,
                      color: categoryColors["MEE"] || "#48bb78",
                      fontWeight: 600,
                    }}
                  >
                    Total: {formatCurrency(summary.meeTotal)}
                  </div>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center border border-dashed border-default-300 rounded">
                  No Mee products data available
                </div>
              )}
            </div>

            {/* OTH Products Doughnut Chart */}
            <div className="bg-white rounded-lg border shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                Other Products Distribution
              </h2>
              {summary.othPieData && summary.othPieData.length > 0 ? (
                <>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={summary.othPieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) =>
                            percent > 0.05
                              ? `${name.substring(0, 12)}${
                                  name.length > 12 ? "..." : ""
                                }: ${(percent * 100).toFixed(1)}%`
                              : ""
                          }
                          outerRadius={100}
                          innerRadius={50}
                          fill="#8884d8"
                          dataKey="value"
                          paddingAngle={2}
                        >
                          {summary.othPieData.map((entry) => (
                            <Cell key={entry.id} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name, props) => [formatCurrency(Number(value)), props.payload.description]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    className="text-center mt-2 py-2 rounded-lg"
                    style={{
                      backgroundColor: `${categoryColors["OTH"]}15`,
                      color: categoryColors["OTH"] || "#9f7aea",
                      fontWeight: 600,
                    }}
                  >
                    Total: {formatCurrency(summary.othTotal)}
                  </div>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center border border-dashed border-default-300 rounded">
                  No Other products data available
                </div>
              )}
            </div>
          </div>

          {/* Product Mix Analysis Chart */}
          <div className="bg-white rounded-lg border shadow p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Product Mix Analysis</h2>
              <div className="flex items-center gap-3">
                <div className="w-96">
                  <FormCombobox
                    name="chartProducts"
                    label=""
                    value={selectedChartProducts}
                    onChange={(values) => {
                      // Handle null case
                      if (!values) {
                        setSelectedChartProducts([]);
                        return;
                      }

                      // Limit selection to prevent chart overcrowding
                      if (values.length <= maxChartProducts) {
                        setSelectedChartProducts(
                          Array.isArray(values)
                            ? values
                            : values
                            ? [values]
                            : []
                        );
                      } else {
                        toast.error(
                          `Maximum ${maxChartProducts} products can be selected for the chart`
                        );
                        // Keep the first max number of selections
                        setSelectedChartProducts(
                          Array.isArray(values)
                            ? values.slice(0, maxChartProducts)
                            : values
                            ? [values]
                            : []
                        );
                      }
                    }}
                    options={productOptions}
                    query={productQuery}
                    setQuery={setProductQuery}
                  />
                </div>
                <Button
                  onClick={fetchYearlyTrendData}
                  disabled={
                    isGeneratingChart ||
                    yearlyTrendData.length > 0 ||
                    selectedChartProducts.length === 0
                  }
                  color="sky"
                >
                  {isGeneratingChart
                    ? "Generating..."
                    : yearlyTrendData.length > 0
                    ? "Generated"
                    : "Generate Chart"}
                </Button>
              </div>
            </div>
            {isGeneratingChart ? (
              <div className="w-full h-80 flex items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : yearlyTrendData.length > 0 ? (
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
                    {yearlyTrendData.length > 0 &&
                      Object.keys(yearlyTrendData[0])
                        .filter((key) => key !== "month")
                        .map((key) => {
                          // Get display name for the line
                          const displayName =
                            key === "MEE"
                              ? "All Mee Products"
                              : key === "BH"
                              ? "All Bihun Products"
                              : key === "OTH"
                              ? "All Other Products"
                              : products.find((p) => p.id === key)
                                  ?.description || key;

                          return (
                            <Line
                              key={key}
                              type="monotone"
                              dataKey={key}
                              name={displayName}
                              stroke={getProductColor(key)}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                            />
                          );
                        })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center border border-dashed border-default-300 rounded text-default-500">
                {selectedChartProducts.length === 0
                  ? "Generate Chart to view product mix trends for the past 12 months"
                  : "No data available for selected products. Try selecting different products or a different time period."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SalesByProductsPage;
