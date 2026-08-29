// src/pages/Sales/SalesByProductsPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../routes/utils/api";
import { FormCombobox } from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import { IconSortAscending, IconSortDescending } from "@tabler/icons-react";
import TimeNavigator from "../../components/TimeNavigator";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
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
import type { PieLabelRenderProps } from "recharts";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import Button from "../../components/Button";
import SalesSummarySelectionTooltip from "../../components/Sales/SalesSummarySelectionTooltip";
import HoverTooltip from "../../components/HoverTooltip";
import { SalesSummaryScope } from "../../utils/sales/SalesSummaryPDF";
import { useTheme } from "../../contexts/ThemeContext";
import {
  reviveDate,
  usePersistedFilters,
  usePersistedMonth,
} from "../../hooks/usePersistedFilters";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";

interface ProductSalesData {
  id: string;
  description: string;
  type: string;
  quantity: number;
  totalSales: number;
  foc: number;
  returns: number;
}

interface SalesmanProductSales {
  salesmanId: string;
  totalSales: number;
  totalQuantity: number;
  products: ProductSalesData[];
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

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  BH: "#4299e1",
  MEE: "#48bb78",
  RAMEN: "#e11d48",
  JP: "#ed8936",
  OTH: "#9f7aea",
  OTHER: "#a0aec0",
};

const PRODUCT_TYPE_DISPLAY_ORDER: Record<string, number> = {
  MEE: 0,
  BH: 1,
  RAMEN: 2,
  OTH: 3,
  JP: 4,
};

// Top five products by sales value in the latest 12-month reporting period.
const DEFAULT_PRODUCT_MIX_PRODUCTS: Record<SalesSummaryScope, readonly string[]> = {
  tienhock: ["2-BCM3", "2-BH", "1-MNL", "2-BNL(5)", "1-2UDG"],
  jp: ["S-25ML", "MEQ-60ML", "MEQ-25ML", "S-60ML", "AQ-60ML"],
};

const getStableTypeColor = (type: string): string => {
  if (PRODUCT_TYPE_COLORS[type]) return PRODUCT_TYPE_COLORS[type];

  const hash = type.split("").reduce((value: number, character: string) => {
    return (value * 31 + character.charCodeAt(0)) >>> 0;
  }, 0);
  const fallbackColors = [
    "#0f766e",
    "#b45309",
    "#7e22ce",
    "#0369a1",
    "#be123c",
    "#4d7c0f",
  ];
  return fallbackColors[hash % fallbackColors.length];
};

interface DateRange {
  start: Date;
  end: Date;
}

interface SalesByProductsPageProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  scope?: SalesSummaryScope;
}

const SalesByProductsPage: React.FC<SalesByProductsPageProps> = ({
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
  const chartTooltipItemStyle: React.CSSProperties = {
    color: isDarkMode ? "#e5e7eb" : "#374151",
  };
  const renderPieLabel = (
    labelProps: PieLabelRenderProps
  ): React.ReactElement | null => {
    const { name, percent, quantity, x, y, textAnchor } = labelProps;
    if ((percent ?? 0) <= 0.05) return null;

    return (
      <text
        x={x}
        y={y}
        textAnchor={textAnchor as "start" | "middle" | "end"}
        fill={chartTextColor}
        stroke="none"
        dominantBaseline="middle"
      >
        {`${name.substring(0, 10)}${name.length > 10 ? ".." : ""} (${Number(
          quantity || 0
        ).toLocaleString()})`}
      </text>
    );
  };
  const isJp = scope === "jp";
  // Month derived from the time selection; drives the monthSelectionChanged event.
  const [selectedMonth, setSelectedMonth] = usePersistedMonth(
    `salesByProductsMonth:${scope}`
  );
  const [isGeneratingChart, setIsGeneratingChart] = useState(false);
  const [dateRange, setDateRange] = usePersistedFilters<DateRange>(
    `salesByProductsRange:${scope}`,
    () => {
      // Create start date (today)
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      // Create end date (today)
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      return { start: startDate, end: endDate };
    },
    (cached) => {
      const start = reviveDate(cached?.start);
      const end = reviveDate(cached?.end);
      return start && end ? { start, end } : null;
    }
  );
  const [isLoading, setIsLoading] = useState(false);
  const [salesData, setSalesData] = useState<ProductSalesData[]>([]);
  const [salesmanProductsData, setSalesmanProductsData] = useState<SalesmanProductSales[]>([]);
  const [isLoadingSalesmanData, setIsLoadingSalesmanData] = useState(false);
  const [yearlyTrendData, setYearlyTrendData] = useState<MonthlyTypeData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof ProductSalesData;
    direction: "asc" | "desc";
  }>({
    key: "type",
    direction: "asc",
  });
  const {
    products,
    isLoading: isProductsLoading,
    error: productsError,
  } = useProductsCache("all");
  const [selectedChartProducts, setSelectedChartProducts] = useState<string[]>(
    []
  );
  const [productQuery, setProductQuery] = useState("");
  const [maxChartProducts] = useState(5); // Limit to prevent chart legend overcrowding

  useScrollRestoration(
    `sales-by-products:${scope}`,
    !isLoading && salesData.length > 0
  );

  // Dynamic category colors based on product types
  const categoryColors = useMemo(() => {
    const typeSet = new Set<string>();
    salesData.forEach((product) => {
      if (product.type) typeSet.add(product.type);
    });

    const result: Record<string, string> = { ...PRODUCT_TYPE_COLORS };
    Array.from(typeSet).forEach((type) => {
      if (!result[type]) {
        result[type] = getStableTypeColor(type);
      }
    });

    return result;
  }, [salesData]);

  // Unified Time Navigator change handler. Handles day, month, and custom-range
  // selections from the single TimeNavigator control.
  const handleTimeNavigatorChange = (range: { start: Date; end: Date }) => {
    setSelectedMonth(range.start);
    setDateRange({ start: range.start, end: range.end });
  };

  const productOptions = useMemo(() => {
    const options = isJp
      ? [{ id: "JP", name: "All Jelly Polly Products" }]
      : [
          { id: "MEE", name: "Mee Products" },
          { id: "BH", name: "Bihun Products" },
          { id: "RAMEN", name: "Ramen Products" },
          { id: "OTH", name: "Other Products" },
        ];
    const optionIds = new Set(options.map((option) => option.id));

    // Add individual products from cache
    products.forEach((product) => {
      // A product can share an identifier with its type (notably OTH). In that
      // case the existing option represents the whole type and must stay unique.
      if (optionIds.has(product.id)) return;
      options.push({
        id: product.id,
        name: product.description || product.id,
      });
      optionIds.add(product.id);
    });

    return options;
  }, [products, isJp]);

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

  // Clear chart data when product selection changes
  useEffect(() => {
    if (yearlyTrendData.length > 0) {
      setYearlyTrendData([]);
    }
  }, [selectedChartProducts]);


  // Initialize selected products when product options are available
  useEffect(() => {
    if (productOptions.length > 0) {
      const availableProductIds = new Set(
        productOptions.map((option) => option.id)
      );
      const initialSelection = DEFAULT_PRODUCT_MIX_PRODUCTS[scope]
        .filter((productId) => availableProductIds.has(productId))
        .slice(0, maxChartProducts);

      setSelectedChartProducts(initialSelection);
    }
  }, [productOptions, maxChartProducts, scope]);

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

  // Fetch yearly trend data for the product mix chart
  const fetchYearlyTrendData = async () => {
    setIsGeneratingChart(true);
    try {
      const endDate = new Date();
      const startDate = new Date(
        endDate.getFullYear(),
        endDate.getMonth() - 11,
        1,
        0,
        0,
        0,
        0
      );

      const startTimestamp = startDate.getTime().toString();
      const endTimestamp = endDate.getTime().toString();

      // Use new trends endpoint with product type
      const url = `/api/invoices/sales/trends?type=products&startDate=${startTimestamp}&endDate=${endTimestamp}&ids=${selectedChartProducts.join(
        ","
      )}&scope=${scope}`;

      const chartData = await api.get(url);

      if (!Array.isArray(chartData)) {
        throw new Error("Invalid response format");
      }

      const typedChartData = chartData as MonthlyTypeData[];
      const hasSelectedSales = typedChartData.some((monthData) =>
        selectedChartProducts.some(
          (productId) => Number(monthData[productId] || 0) !== 0
        )
      );

      if (!hasSelectedSales) {
        toast.error(
          t("No data found for the selected products in the past year")
        );
        setYearlyTrendData([]);
        return;
      }

      setYearlyTrendData(typedChartData);
      toast.success(t("Product trend data generated successfully"));
    } catch (error) {
      console.error("Error fetching yearly trend data:", error);
      toast.error(t("Failed to generate product trend data"));
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

        // Use the dedicated endpoint
        const url = `/api/invoices/sales/products?startDate=${startTimestamp}&endDate=${endTimestamp}&scope=${scope}`;

        const data = await api.get(url);

        if (Array.isArray(data)) {
          setSalesData(data);
        } else {
          throw new Error("Invalid response format");
        }
      } catch (error) {
        console.error("Error fetching sales data:", error);
        setError(t("Failed to load sales data. Please try again."));
        toast.error(t("Failed to load sales data"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchSalesData();
  }, [dateRange, scope, t]);

  // Fetch products-by-salesman data for individual salesman tables
  useEffect(() => {
    const fetchSalesmanProductsData = async () => {
      setIsLoadingSalesmanData(true);

      try {
        const startTimestamp = dateRange.start.getTime().toString();
        const endTimestamp = dateRange.end.getTime().toString();

        const url = `/api/invoices/sales/products-by-salesman?startDate=${startTimestamp}&endDate=${endTimestamp}&scope=${scope}`;

        const data = await api.get(url);

        if (Array.isArray(data)) {
          setSalesmanProductsData(data);
        } else {
          throw new Error("Invalid response format");
        }
      } catch (error) {
        console.error("Error fetching salesman products data:", error);
      } finally {
        setIsLoadingSalesmanData(false);
      }
    };

    fetchSalesmanProductsData();
  }, [dateRange, scope]);

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
    const ramenProducts: ProductSalesData[] = [];
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
      } else if (product.type === "RAMEN") {
        ramenProducts.push(product);
      } else if (product.type === "JP") {
        if (isJp) othProducts.push(product);
        // In tienhock scope, JP products are excluded
      } else if (product.type === "OTH") {
        othProducts.push(product);
      }
    });

    // Sort products by sales for each type
    bhProducts.sort((a, b) => b.totalSales - a.totalSales);
    meeProducts.sort((a, b) => b.totalSales - a.totalSales);
    ramenProducts.sort((a, b) => b.totalSales - a.totalSales);
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
        quantity: product.quantity, // Add quantity for inline display
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
          quantity: products
            .slice(limit)
            .reduce((sum, p) => sum + p.quantity, 0),
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
    const ramenTotal = ramenProducts.reduce((sum, p) => sum + p.totalSales, 0);
    const othTotal = othProducts.reduce((sum, p) => sum + p.totalSales, 0); // Now includes both OTH and JP products
    const ramenQuantity = ramenProducts.reduce(
      (sum, product) => sum + product.quantity,
      0
    );
    const totalQuantity: number = salesData.reduce(
      (sum: number, product: ProductSalesData): number =>
        sum + product.quantity,
      0
    );

    return {
      categorySummary,
      totalSales,
      pieData,
      bhPieData: createPieData(bhProducts, categoryColors["BH"] || "#4299e1"),
      meePieData: createPieData(
        meeProducts,
        categoryColors["MEE"] || "#48bb78"
      ),
      ramenPieData: createPieData(
        ramenProducts,
        categoryColors["RAMEN"] || "#e11d48"
      ),
      othPieData: createPieData(
        othProducts,
        categoryColors[isJp ? "JP" : "OTH"] || (isJp ? "#ed8936" : "#9f7aea")
      ),
      bhTotal,
      meeTotal,
      ramenTotal,
      othTotal,
      ramenQuantity,
      totalQuantity,
    };
  }, [salesData, categoryColors, isJp]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const formatQuantity = (quantity: number): string =>
    t("{{total}} units", { total: quantity.toLocaleString() });

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
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-lg p-4 text-rose-700 dark:text-rose-300">
          {productsError ? String(productsError) : error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            {/* Tab Buttons */}
            <div className="flex rounded-lg bg-default-100 dark:bg-gray-700 p-0.5">
              <button
                onClick={() => onTabChange(0)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 0
                    ? "bg-white dark:bg-gray-600 text-default-900 dark:text-gray-100 shadow-sm"
                    : "text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-100"
                }`}
              >
                {t("Products")}
              </button>
              <button
                onClick={() => onTabChange(1)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 1
                    ? "bg-white dark:bg-gray-600 text-default-900 dark:text-gray-100 shadow-sm"
                    : "text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-100"
                }`}
              >
                {t("Salesman")}
              </button>
              {scope === "tienhock" && (
                <button
                  onClick={() => onTabChange(2)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 2
                      ? "bg-white dark:bg-gray-600 text-default-900 dark:text-gray-100 shadow-sm"
                      : "text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-100"
                  }`}
                >
                  {t("Customer")}
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Time Navigator */}
            <TimeNavigator
              range={dateRange}
              onChange={handleTimeNavigatorChange}
            />

            {/* Separator */}
            <div className="h-5 w-px bg-default-300 dark:bg-gray-600" />

            {/* Generate PDF Summary Button */}
            <SalesSummarySelectionTooltip activeTab={activeTab} scope={scope} />
          </div>
        </div>
        {/* Quick Stats Row */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isJp ? "lg:grid-cols-2" : "lg:grid-cols-5"} gap-3`}>
          {/* Total Sales */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow overflow-hidden">
            <div className="px-4 py-2 bg-default-100 dark:bg-gray-700 border-b dark:border-gray-600 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold truncate">
                {t("Total")}
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                {t("All Products")}
              </span>
            </div>
            <div className="px-4 py-3">
              <div className="text-xl font-bold text-sky-600 dark:text-sky-400">
                {formatQuantity(summary.totalQuantity)}
              </div>
              <div className="mt-1 text-sm font-bold">{formatCurrency(summary.totalSales)}</div>
            </div>
          </div>
          {isJp ? (
            /* JP Products */
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow overflow-hidden">
              <div className="px-4 py-2 bg-default-100 dark:bg-gray-700 border-b dark:border-gray-600 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold truncate">
                  {t("Jelly Polly Products")}
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                  JP
                </span>
              </div>
              <div className="px-4 py-3">
                <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                  {t("{{total}} units", {
                    total: salesData
                      .filter((p) => p.type === "JP")
                      .reduce((sum, p) => sum + p.quantity, 0)
                      .toLocaleString(),
                  })}
                </div>
                <div className="mt-1 text-sm font-bold">{formatCurrency(summary.othTotal)}</div>
              </div>
            </div>
          ) : (
            <>
              {/* BH Products */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow overflow-hidden">
                <div className="px-4 py-2 bg-default-100 dark:bg-gray-700 border-b dark:border-gray-600 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold truncate">
                    {t("BH Products")}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    BH
                  </span>
                </div>
                <div className="px-4 py-3">
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {t("{{total}} units", {
                      total: salesData
                        .filter((p) => p.type === "BH")
                        .reduce((sum, p) => sum + p.quantity, 0)
                        .toLocaleString(),
                    })}
                  </div>
                  <div className="mt-1 text-sm font-bold">{formatCurrency(summary.bhTotal)}</div>
                </div>
              </div>
              {/* MEE Products */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow overflow-hidden">
                <div className="px-4 py-2 bg-default-100 dark:bg-gray-700 border-b dark:border-gray-600 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold truncate">
                    {t("MEE Products")}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    MEE
                  </span>
                </div>
                <div className="px-4 py-3">
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">
                    {t("{{total}} units", {
                      total: salesData
                        .filter((p) => p.type === "MEE")
                        .reduce((sum, p) => sum + p.quantity, 0)
                        .toLocaleString(),
                    })}
                  </div>
                  <div className="mt-1 text-sm font-bold">{formatCurrency(summary.meeTotal)}</div>
                </div>
              </div>
              {/* RAMEN Products */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow overflow-hidden">
                <div className="px-4 py-2 bg-default-100 dark:bg-gray-700 border-b dark:border-gray-600 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold truncate">
                    {t("Ramen Products")}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                    RAMEN
                  </span>
                </div>
                <div className="px-4 py-3">
                  <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
                    {formatQuantity(summary.ramenQuantity)}
                  </div>
                  <div className="mt-1 text-sm font-bold">
                    {formatCurrency(summary.ramenTotal)}
                  </div>
                </div>
              </div>
              {/* OTH Products */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow overflow-hidden">
                <div className="px-4 py-2 bg-default-100 dark:bg-gray-700 border-b dark:border-gray-600 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold truncate">
                    {t("Other Products")}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    OTH
                  </span>
                </div>
                <div className="px-4 py-3">
                  <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                    {t("{{total}} units", {
                      total: salesData
                        .filter((p) => p.type === "OTH")
                        .reduce((sum, p) => sum + p.quantity, 0)
                        .toLocaleString(),
                    })}
                  </div>
                  <div className="mt-1 text-sm font-bold">{formatCurrency(summary.othTotal)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {isLoading ? (
        <div className="w-full h-64 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-lg p-4 text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : (
        <>
          {/* Individual Salesman Tables */}
          {isLoadingSalesmanData ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : salesmanProductsData.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {salesmanProductsData.map((salesman) => {
                // Calculate FOC and RTN totals
                const focProducts = salesman.products.filter(p => p.foc > 0);
                const rtnProducts = salesman.products.filter(p => p.returns > 0);
                const totalFoc = focProducts.reduce((sum, p) => sum + p.foc, 0);
                const totalRtn = rtnProducts.reduce((sum, p) => sum + p.returns, 0);
                const quantityByType: Record<string, number> =
                  salesman.products.reduce(
                    (
                      totals: Record<string, number>,
                      product: ProductSalesData
                    ): Record<string, number> => {
                      const productType: string = product.type || "OTH";
                      totals[productType] =
                        (totals[productType] || 0) + product.quantity;
                      return totals;
                    },
                    {}
                  );
                const quantityBreakdown: [string, number][] = Object.entries(
                  quantityByType
                )
                  .filter((entry: [string, number]): boolean => entry[1] !== 0)
                  .sort(
                    (
                      firstEntry: [string, number],
                      secondEntry: [string, number]
                    ): number => {
                      const orderDifference: number =
                        (PRODUCT_TYPE_DISPLAY_ORDER[firstEntry[0]] ??
                          Number.MAX_SAFE_INTEGER) -
                        (PRODUCT_TYPE_DISPLAY_ORDER[secondEntry[0]] ??
                          Number.MAX_SAFE_INTEGER);
                      return (
                        orderDifference ||
                        firstEntry[0].localeCompare(secondEntry[0])
                      );
                    }
                  );

                // Build tooltip text for FOC/RTN breakdown
                const focTooltip = focProducts
                  .map(
                    (product) =>
                      `${product.id} · ${product.description}: ${formatQuantity(
                        product.foc
                      )}`
                  )
                  .join("\n");
                const rtnTooltip = rtnProducts
                  .map(
                    (product) =>
                      `${product.id} · ${product.description}: ${formatQuantity(
                        product.returns
                      )}`
                  )
                  .join("\n");

                return (
                  <div
                    key={salesman.salesmanId}
                    className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow overflow-hidden"
                  >
                    {/* Salesman Header */}
                    <div className="px-4 py-2 bg-default-100 dark:bg-gray-700 border-b dark:border-gray-600 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                      <h3 className="text-base font-semibold">{salesman.salesmanId}</h3>
                      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
                        {totalFoc > 0 && (
                          <HoverTooltip content={focTooltip}>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 cursor-default">
                              {t("FOC {{total}}", {
                                total: formatQuantity(totalFoc),
                              })}
                            </span>
                          </HoverTooltip>
                        )}
                        {totalRtn > 0 && (
                          <HoverTooltip content={rtnTooltip}>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 cursor-default">
                              {t("RTN {{total}}", {
                                total: formatQuantity(totalRtn),
                              })}
                            </span>
                          </HoverTooltip>
                        )}
                        {salesman.totalQuantity > 0 && (
                          <span className="text-sky-600 dark:text-sky-400 font-bold">
                            {t("Total:")} {formatQuantity(salesman.totalQuantity)}
                          </span>
                        )}
                        {quantityBreakdown.map(
                          ([productType, quantity]: [string, number]) => (
                            <span
                              key={productType}
                              className="font-bold"
                              style={{
                                color:
                                  categoryColors[productType] ||
                                  PRODUCT_TYPE_COLORS.OTHER,
                              }}
                            >
                              {productType}: {formatQuantity(quantity)}
                            </span>
                          )
                        )}
                        {salesman.totalQuantity > 0 && (
                          <span className="text-default-400 dark:text-gray-500">·</span>
                        )}
                        <span className="font-bold">{formatCurrency(salesman.totalSales)}</span>
                      </div>
                    </div>
                    {/* Products Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200 dark:divide-gray-600">
                        <thead className="bg-default-50 dark:bg-gray-700/30">
                          <tr>
                            <th className="px-4 py-2 text-left text-sm font-medium text-default-500 dark:text-gray-400">
                              {t("Product ID")}
                            </th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-default-500 dark:text-gray-400">
                              {t("description", { ns: "common" })}
                            </th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-default-500 dark:text-gray-400">
                              {t("type", { ns: "common" })}
                            </th>
                            <th className="px-4 py-2 text-right text-sm font-medium text-default-500 dark:text-gray-400">
                              {t("Qty")}
                            </th>
                            <th className="px-4 py-2 text-right text-sm font-medium text-default-500 dark:text-gray-400">
                              {t("Sales")}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-default-100 dark:divide-gray-600">
                          {[...salesman.products].sort((a, b) => a.type.localeCompare(b.type)).map((product) => (
                            <tr key={product.id} className="hover:bg-default-100 dark:hover:bg-gray-600/50">
                              <td className="px-4 py-2 text-sm font-medium">{product.id}</td>
                              <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-300 truncate max-w-[200px]" title={product.description}>
                                {product.description}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                  style={{
                                    backgroundColor: `${categoryColors[product.type] || "#a0aec0"}20`,
                                    color: categoryColors[product.type] || "#a0aec0",
                                  }}
                                >
                                  {product.type}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-right">
                                {formatQuantity(product.quantity)}
                              </td>
                              <td className="px-4 py-2 text-sm text-right font-medium">{formatCurrency(product.totalSales)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-default-300 dark:border-gray-600 rounded p-4 text-center text-default-500 dark:text-gray-400">
              {t("No salesman data available for this period.")}
            </div>
          )}

          {/* All Salesmen - Product Sales Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow overflow-hidden">
            <div className="px-4 py-2 bg-default-100 dark:bg-gray-700 border-b dark:border-gray-600 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <h3 className="text-base font-semibold">
                {t("All Products Summary")}
              </h3>
              <div className="flex flex-wrap items-center justify-end gap-2 text-sm font-bold">
                <span className="text-default-400 dark:text-gray-500 font-normal">
                  {t("({{total}} products)", {
                    total: filteredAndSortedData.length,
                  })}
                </span>
                <span className="text-sky-600 dark:text-sky-400">
                  {formatQuantity(summary.totalQuantity)}
                </span>
                <span className="text-default-400 dark:text-gray-500">·</span>
                <span>{formatCurrency(summary.totalSales)}</span>
              </div>
            </div>
            {filteredAndSortedData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                  <thead className="bg-default-100 dark:bg-gray-800">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-2 text-left text-base font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("id")}
                      >
                        <div className="flex items-center">
                          {t("Product ID")}
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
                        className="px-4 py-2 text-left text-base font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("description")}
                      >
                        <div className="flex items-center">
                          {t("description", { ns: "common" })}
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
                        className="px-4 py-2 text-left text-base font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("type")}
                      >
                        <div className="flex items-center">
                          {t("type", { ns: "common" })}
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
                        className="px-4 py-2 text-right text-base font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("foc")}
                      >
                        <div className="flex items-center justify-end">
                          {t("FOC")}
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
                        className="px-4 py-2 text-right text-base font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("returns")}
                      >
                        <div className="flex items-center justify-end">
                          {t("Returns")}
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
                        className="px-4 py-2 text-right text-base font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("quantity")}
                      >
                        <div className="flex items-center justify-end">
                          {t("Quantity")}
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
                        className="px-4 py-2 text-right text-base font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort("totalSales")}
                      >
                        <div className="flex items-center justify-end">
                          {t("Total Sales")}
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
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                    {filteredAndSortedData.map((product) => (
                      <tr key={product.id} className="hover:bg-default-100 dark:hover:bg-gray-700">
                        <td className="px-4 py-2 whitespace-nowrap text-base font-medium text-default-900 dark:text-gray-100">
                          {product.id}
                        </td>
                        <td
                          className="px-4 py-2 whitespace-nowrap text-base text-default-700 dark:text-gray-200 truncate max-w-xs"
                          title={product.description}
                        >
                          {product.description}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-base text-default-700 dark:text-gray-200">
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
                        <td className="px-4 py-2 whitespace-nowrap text-base text-right text-default-700 dark:text-gray-200">
                          {formatQuantity(product.foc)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-base text-right text-default-700 dark:text-gray-200">
                          {formatQuantity(product.returns)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-base text-right text-default-700 dark:text-gray-200">
                          {formatQuantity(product.quantity)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-base text-right font-medium">
                          {formatCurrency(product.totalSales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-default-100 dark:bg-gray-800">
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-2 text-right text-base font-medium"
                      >
                        {t("Total:")}
                      </td>
                      <td className="px-4 py-2 text-right text-base font-bold">
                        {formatQuantity(summary.totalQuantity)}
                      </td>
                      <td className="px-4 py-2 text-right text-base font-bold">
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
              <div className="border border-dashed border-default-300 dark:border-gray-600 rounded p-4 text-center text-default-500 dark:text-gray-400">
                {t(
                  "No data to display. Please select a different month or check if sales data exists."
                )}
              </div>
            )}
          </div>

          {/* Dashboard content - category doughnut charts without legends */}
          <div
            className={`grid gap-6 ${
              isJp ? "grid-cols-1" : "grid-cols-2 2xl:grid-cols-4"
            }`}
          >
            {/* BH Products Doughnut Chart */}
            {!isJp && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                {t("Bihun Products Distribution")}
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
                          label={renderPieLabel}
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
                          contentStyle={chartTooltipStyle}
                          itemStyle={chartTooltipItemStyle}
                          labelStyle={chartTooltipLabelStyle}
                          formatter={(value, _name, props) => [
                            t("{{amount}} · {{quantity}} units", {
                              amount: formatCurrency(Number(value)),
                              quantity:
                                props.payload.quantity?.toLocaleString() || 0,
                            }),
                            props.payload.description
                          ]}
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
                    <div>
                      {t("{{total}} units", {
                        total: salesData
                          .filter((p) => p.type === "BH")
                          .reduce((sum, p) => sum + p.quantity, 0)
                          .toLocaleString(),
                      })}
                    </div>
                    <div className="text-sm opacity-80">
                      {t("Total: {{amount}}", {
                        amount: formatCurrency(summary.bhTotal),
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center border border-dashed border-default-300 dark:border-gray-600 rounded">
                  {t("No Bihun products data available")}
                </div>
              )}
            </div>
            )}

            {/* MEE Products Doughnut Chart */}
            {!isJp && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                {t("Mee Products Distribution")}
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
                          label={renderPieLabel}
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
                          contentStyle={chartTooltipStyle}
                          itemStyle={chartTooltipItemStyle}
                          labelStyle={chartTooltipLabelStyle}
                          formatter={(value, _name, props) => [
                            t("{{amount}} · {{quantity}} units", {
                              amount: formatCurrency(Number(value)),
                              quantity:
                                props.payload.quantity?.toLocaleString() || 0,
                            }),
                            props.payload.description
                          ]}
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
                    <div>
                      {t("{{total}} units", {
                        total: salesData
                          .filter((p) => p.type === "MEE")
                          .reduce((sum, p) => sum + p.quantity, 0)
                          .toLocaleString(),
                      })}
                    </div>
                    <div className="text-sm opacity-80">
                      {t("Total: {{amount}}", {
                        amount: formatCurrency(summary.meeTotal),
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center border border-dashed border-default-300 dark:border-gray-600 rounded">
                  {t("No Mee products data available")}
                </div>
              )}
            </div>
            )}

            {/* RAMEN Products Doughnut Chart */}
            {!isJp && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                {t("Ramen Products Distribution")}
              </h2>
              {summary.ramenPieData && summary.ramenPieData.length > 0 ? (
                <>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={summary.ramenPieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={renderPieLabel}
                          outerRadius={100}
                          innerRadius={50}
                          fill="#8884d8"
                          dataKey="value"
                          paddingAngle={2}
                        >
                          {summary.ramenPieData.map((entry) => (
                            <Cell key={entry.id} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          itemStyle={chartTooltipItemStyle}
                          labelStyle={chartTooltipLabelStyle}
                          formatter={(value, _name, props) => [
                            t("{{amount}} · {{quantity}} units", {
                              amount: formatCurrency(Number(value)),
                              quantity:
                                props.payload.quantity?.toLocaleString() || 0,
                            }),
                            props.payload.description,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    className="text-center mt-2 py-2 rounded-lg"
                    style={{
                      backgroundColor: `${categoryColors["RAMEN"]}15`,
                      color: categoryColors["RAMEN"] || "#e11d48",
                      fontWeight: 600,
                    }}
                  >
                    <div>
                      {formatQuantity(summary.ramenQuantity)}
                    </div>
                    <div className="text-sm opacity-80">
                      {t("Total: {{amount}}", {
                        amount: formatCurrency(summary.ramenTotal),
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center border border-dashed border-default-300 dark:border-gray-600 rounded">
                  {t("No Ramen products data available")}
                </div>
              )}
            </div>
            )}

            {/* OTH / JP Products Doughnut Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow p-4">
              <h2 className="text-lg font-semibold mb-4">
                {t(
                  isJp
                    ? "Jelly Polly Products Distribution"
                    : "Other Products Distribution"
                )}
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
                          label={renderPieLabel}
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
                          contentStyle={chartTooltipStyle}
                          itemStyle={chartTooltipItemStyle}
                          labelStyle={chartTooltipLabelStyle}
                          formatter={(value, _name, props) => [
                            t("{{amount}} · {{quantity}} units", {
                              amount: formatCurrency(Number(value)),
                              quantity:
                                props.payload.quantity?.toLocaleString() || 0,
                            }),
                            props.payload.description
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    className="text-center mt-2 py-2 rounded-lg"
                    style={{
                      backgroundColor: `${categoryColors[isJp ? "JP" : "OTH"]}15`,
                      color: categoryColors[isJp ? "JP" : "OTH"] || (isJp ? "#ed8936" : "#9f7aea"),
                      fontWeight: 600,
                    }}
                  >
                    <div>
                      {t("{{total}} units", {
                        total: salesData
                          .filter((p) =>
                            isJp ? p.type === "JP" : p.type === "OTH"
                          )
                          .reduce((sum, p) => sum + p.quantity, 0)
                          .toLocaleString(),
                      })}
                    </div>
                    <div className="text-sm opacity-80">
                      {t("Total: {{amount}}", {
                        amount: formatCurrency(summary.othTotal),
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center border border-dashed border-default-300 dark:border-gray-600 rounded">
                  {t(
                    isJp
                      ? "No Jelly Polly products data available"
                      : "No Other products data available"
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Product Mix Analysis Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow p-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
              <h2 className="text-lg font-semibold">
                {t("Product Mix Analysis")}
              </h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="w-full sm:w-96">
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
                          t(
                            "Maximum {{total}} products can be selected for the chart",
                            { total: maxChartProducts }
                          )
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
                    options={productOptions.map((option) => ({
                      ...option,
                      name: ["MEE", "BH", "RAMEN", "OTH", "JP"].includes(option.id)
                        ? t(option.name)
                        : option.name,
                    }))}
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
                    ? t("Generating...")
                    : yearlyTrendData.length > 0
                      ? t("Generated")
                      : t("Generate Chart")}
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
                    <CartesianGrid
                      stroke={chartGridColor}
                      strokeDasharray="3 3"
                      strokeOpacity={isDarkMode ? 0.55 : 0.75}
                    />
                    <XAxis
                      dataKey="month"
                      textAnchor="middle"
                      height={80}
                      tickMargin={15}
                      tick={{ fill: chartTextColor, fontSize: 12 }}
                      axisLine={{ stroke: chartGridColor }}
                      tickLine={{ stroke: chartGridColor }}
                    />
                    <YAxis
                      tick={{ fill: chartTextColor, fontSize: 12 }}
                      axisLine={{ stroke: chartGridColor }}
                      tickLine={{ stroke: chartGridColor }}
                      tickFormatter={(value: string | number | bigint) =>
                        new Intl.NumberFormat("en", {
                          notation: "compact",
                          compactDisplay: "short",
                        }).format(Number(value))
                      }
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      itemStyle={chartTooltipItemStyle}
                      labelStyle={chartTooltipLabelStyle}
                      cursor={{
                        fill: isDarkMode
                          ? "rgba(148, 163, 184, 0.12)"
                          : "rgba(15, 23, 42, 0.06)",
                      }}
                      formatter={(value: any) => formatCurrency(Number(value))}
                      itemSorter={(item) =>
                        item.value ? -Number(item.value) : 0
                      }
                    />
                    <Legend
                      wrapperStyle={{ bottom: 20, color: chartTextColor }}
                    />
                    {yearlyTrendData.length > 0 &&
                      selectedChartProducts.map((key) => {
                          // Get display name for the line
                          const displayName =
                            key === "MEE"
                              ? t("All Mee Products")
                              : key === "BH"
                                ? t("All Bihun Products")
                              : key === "RAMEN"
                                ? t("All Ramen Products")
                              : key === "JP"
                                ? t("All JellyPolly Products")
                              : key === "OTH"
                                ? t("All Other Products")
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
              <div className="h-80 flex flex-col items-center justify-center border border-dashed border-default-300 dark:border-gray-600 rounded text-default-500 dark:text-gray-400">
                {selectedChartProducts.length === 0
                  ? t(
                      "Generate Chart to view product mix trends for the past 12 months"
                    )
                  : t(
                      "No data available for selected products. Try selecting different products or a different time period."
                    )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SalesByProductsPage;
