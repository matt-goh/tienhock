// src/pages/Stock/StockMovementPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import ProductSelector from "../../components/Stock/ProductSelector";
import StockMovementTable from "../../components/Stock/StockMovementTable";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import {
  StockMovement,
  StockMovementResponse,
  StockProduct,
} from "../../types/types";
import {
  IconCalendar,
  IconPackage,
  IconEdit,
  IconCheck,
  IconX,
  IconStarFilled,
} from "@tabler/icons-react";
import MonthNavigator from "../../components/MonthNavigator";
import clsx from "clsx";

const FAVORITES_STORAGE_KEY = "stock-product-favorites";

// Stock system start date - initial balance represents stock as of this date
const STOCK_SYSTEM_START_DATE = new Date(2026, 0, 1); // January 1, 2026
const STOCK_SYSTEM_START_DATE_STRING = "2026-01-01";

type ViewType = "month" | "rolling" | "custom";

const StockMovementPage: React.FC = () => {
  // State
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [viewType, setViewType] = useState<ViewType>("month");
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // Data state
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [openingBalance, setOpeningBalance] = useState<number>(0); // Calculated B/F
  const [initialBalance, setInitialBalance] = useState<number>(0); // Admin-set migration balance
  const [monthlyTotals, setMonthlyTotals] = useState<
    StockMovementResponse["monthly_totals"] | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);

  // Opening balance edit state
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [editBalanceValue, setEditBalanceValue] = useState<string>("");
  const [isSavingBalance, setIsSavingBalance] = useState(false);

  // Get products cache for favorites
  const { products } = useProductsCache("all");

  // Get favorites from localStorage
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Listen for favorites changes
  useEffect(() => {
    const handleFavoritesChange = () => {
      try {
        const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
        setFavorites(stored ? new Set(JSON.parse(stored)) : new Set());
      } catch {
        // Ignore parse errors
      }
    };

    window.addEventListener("favorites-changed", handleFavoritesChange);
    return () =>
      window.removeEventListener("favorites-changed", handleFavoritesChange);
  }, []);

  // Get favorite products (only BH and MEE types)
  const favoriteProducts = useMemo(() => {
    return products.filter(
      (product) =>
        favorites.has(product.id) &&
        (product.type === "BH" || product.type === "MEE")
    ) as StockProduct[];
  }, [products, favorites]);

  // Format date to YYYY-MM-DD in local timezone (not UTC)
  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Calculate date range based on view type
  const dateRange = useMemo(() => {
    if (viewType === "month") {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth();
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);
      return {
        start: formatDateLocal(startDate),
        end: formatDateLocal(endDate),
      };
    } else if (viewType === "rolling") {
      const today = new Date();
      const thirtyOneDaysAgo = new Date(today);
      thirtyOneDaysAgo.setDate(today.getDate() - 30);
      return {
        start: formatDateLocal(thirtyOneDaysAgo),
        end: formatDateLocal(today),
      };
    } else {
      return {
        start: customStartDate,
        end: customEndDate,
      };
    }
  }, [viewType, selectedMonth, customStartDate, customEndDate]);

  // Fetch stock movements
  const fetchMovements = useCallback(async () => {
    if (!selectedProductId || !dateRange.start || !dateRange.end) {
      setMovements([]);
      setMonthlyTotals(null);
      return;
    }

    setIsLoading(true);
    try {
      const response: StockMovementResponse = await api.get(
        `/api/stock/movements?product_id=${selectedProductId}&start_date=${dateRange.start}&end_date=${dateRange.end}&view_type=${viewType}`
      );

      setMovements(response.movements || []);
      setOpeningBalance(response.opening_balance || 0);
      setInitialBalance(response.initial_balance || 0);
      setMonthlyTotals(response.monthly_totals || null);
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      toast.error("Failed to load stock movements");
      setMovements([]);
      setMonthlyTotals(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProductId, dateRange.start, dateRange.end, viewType]);

  // Fetch movements when dependencies change
  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);


  // Handle initial balance edit
  const handleEditBalance = () => {
    setEditBalanceValue(initialBalance.toString());
    setIsEditingBalance(true);
  };

  const handleCancelEditBalance = () => {
    setIsEditingBalance(false);
    setEditBalanceValue("");
  };

  const handleSaveBalance = async () => {
    if (!selectedProductId) return;

    const newBalance = parseInt(editBalanceValue, 10);
    if (isNaN(newBalance) || newBalance < 0) {
      toast.error("Please enter a valid positive number");
      return;
    }

    setIsSavingBalance(true);
    try {
      await api.post("/api/stock/opening-balance", {
        product_id: selectedProductId,
        balance: newBalance,
      });

      toast.success("Initial balance updated");
      setInitialBalance(newBalance);
      setIsEditingBalance(false);
      // Refresh movements to recalculate B/F with new initial balance
      fetchMovements();
    } catch (error) {
      console.error("Error saving opening balance:", error);
      toast.error("Failed to save opening balance");
    } finally {
      setIsSavingBalance(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-default-900 dark:text-gray-100">Stock Movement</h1>
        <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
          View daily stock movements and balances
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Product Selector */}
          <div>
            <ProductSelector
              label="Product"
              value={selectedProductId}
              onChange={setSelectedProductId}
              productTypes={["BH", "MEE"]}
              showCategories={true}
              required
            />
            {/* Quick access favorite pills */}
            {favoriteProducts.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <IconStarFilled size={12} className="text-amber-500" />
                {favoriteProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      selectedProductId === product.id
                        ? "bg-sky-500 text-white"
                        : "bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-300 hover:bg-default-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {product.id}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Type Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
              <div className="flex items-center gap-2">
                <IconCalendar size={16} />
                View Type
              </div>
            </label>
            <div className="flex gap-2">
              {[
                { value: "month", label: "Month" },
                { value: "rolling", label: "Last 31 Days" },
                { value: "custom", label: "Custom" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setViewType(option.value as ViewType)}
                  className={clsx(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    viewType === option.value
                      ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                      : "border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-600"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Navigator / Range */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
              Date Range
            </label>
            {viewType === "month" ? (
              <MonthNavigator
                selectedMonth={selectedMonth}
                onChange={setSelectedMonth}
                showGoToCurrentButton={false}
                fixedHeight={false}
                minDate={STOCK_SYSTEM_START_DATE}
              />
            ) : viewType === "rolling" ? (
              <div className="rounded-lg border border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900/50 px-4 py-2 text-center text-sm text-default-600 dark:text-gray-300">
                Last 31 days ({dateRange.start} to {dateRange.end})
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  min={STOCK_SYSTEM_START_DATE_STRING}
                  max={customEndDate || new Date().toISOString().split("T")[0]}
                  className="flex-1 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <span className="text-default-400 dark:text-gray-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  min={customStartDate || STOCK_SYSTEM_START_DATE_STRING}
                  max={new Date().toISOString().split("T")[0]}
                  className="flex-1 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Section - Shows when data is available */}
      {selectedProductId && monthlyTotals && movements.length > 0 && (
        <div className="group rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            {/* Left side - Main summary with | separators */}
            <div className="flex flex-wrap items-center gap-3">
              {/* B/F (Brought Forward) */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/50">
                  <IconPackage className="text-sky-600 dark:text-sky-400" size={20} />
                </div>
                <div>
                  <p className="text-sm text-default-500 dark:text-gray-400">
                    Brought Forward from{" "}
                    {new Date(
                      selectedMonth.getFullYear(),
                      selectedMonth.getMonth() - 1,
                      1
                    ).toLocaleDateString("en-MY", { month: "short" })}
                  </p>
                  <p className="text-2xl font-bold text-default-900 dark:text-gray-100">
                    {openingBalance.toLocaleString()}{" "}
                    <span className="text-base font-normal text-default-500 dark:text-gray-400">
                      bags
                    </span>
                  </p>
                </div>
              </div>

              <span className="text-default-200 dark:text-gray-600 text-xl">|</span>

              {/* Stock In Group */}
              <div className="flex items-center gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 px-3 py-1.5">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs text-green-500 dark:text-green-400">Production</p>
                    <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-300">
                      {monthlyTotals.production.toLocaleString()}
                    </p>
                  </div>
                  <div className="h-6 w-px bg-green-200 dark:bg-green-700" />
                  <div>
                    <p className="text-xs text-green-500 dark:text-green-400">Returns</p>
                    <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-300">
                      {monthlyTotals.returns.toLocaleString()}
                    </p>
                  </div>
                  <div className="h-6 w-px bg-green-200 dark:bg-green-700" />
                  <div>
                    <p className="text-xs text-green-500 dark:text-green-400">Adj+</p>
                    <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-300">
                      {monthlyTotals.adj_in.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <span className="text-default-200 dark:text-gray-600 text-xl">|</span>

              {/* Stock Out Group */}
              <div className="flex items-center gap-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 px-3 py-1.5">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs text-rose-500 dark:text-rose-400">Sold</p>
                    <p className="text-lg font-bold tabular-nums text-rose-700 dark:text-rose-300">
                      {monthlyTotals.sold_out.toLocaleString()}
                    </p>
                  </div>
                  <div className="h-6 w-px bg-rose-200 dark:bg-rose-700" />
                  <div>
                    <p className="text-xs text-rose-500 dark:text-rose-400">FOC</p>
                    <p className="text-lg font-bold tabular-nums text-rose-700 dark:text-rose-300">
                      {monthlyTotals.foc.toLocaleString()}
                    </p>
                  </div>
                  <div className="h-6 w-px bg-rose-200 dark:bg-rose-700" />
                  <div>
                    <p className="text-xs text-rose-500 dark:text-rose-400">Adj-</p>
                    <p className="text-lg font-bold tabular-nums text-rose-700 dark:text-rose-300">
                      {monthlyTotals.adj_out.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <span className="text-default-200 dark:text-gray-600 text-xl">|</span>

              {/* Net Change */}
              <div
                className={clsx(
                  "rounded-lg border px-3 py-1.5",
                  monthlyTotals.production +
                    monthlyTotals.returns +
                    monthlyTotals.adj_in -
                    monthlyTotals.sold_out -
                    monthlyTotals.foc -
                    monthlyTotals.adj_out >=
                    0
                    ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30"
                    : "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30"
                )}
              >
                <p
                  className={clsx(
                    "text-xs",
                    monthlyTotals.production +
                      monthlyTotals.returns +
                      monthlyTotals.adj_in -
                      monthlyTotals.sold_out -
                      monthlyTotals.foc -
                      monthlyTotals.adj_out >=
                      0
                      ? "text-green-500 dark:text-green-400"
                      : "text-rose-500 dark:text-rose-400"
                  )}
                >
                  Net Change
                </p>
                <p
                  className={clsx(
                    "text-lg font-bold tabular-nums",
                    monthlyTotals.production +
                      monthlyTotals.returns +
                      monthlyTotals.adj_in -
                      monthlyTotals.sold_out -
                      monthlyTotals.foc -
                      monthlyTotals.adj_out >=
                      0
                      ? "text-green-700 dark:text-green-300"
                      : "text-rose-700 dark:text-rose-300"
                  )}
                >
                  {monthlyTotals.production +
                    monthlyTotals.returns +
                    monthlyTotals.adj_in -
                    monthlyTotals.sold_out -
                    monthlyTotals.foc -
                    monthlyTotals.adj_out >=
                  0
                    ? "+"
                    : ""}
                  {(
                    monthlyTotals.production +
                    monthlyTotals.returns +
                    monthlyTotals.adj_in -
                    monthlyTotals.sold_out -
                    monthlyTotals.foc -
                    monthlyTotals.adj_out
                  ).toLocaleString()}
                </p>
              </div>

              <span className="text-default-200 dark:text-gray-600 text-xl">|</span>

              {/* Closing Balance */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/50">
                  <IconPackage className="text-sky-600 dark:text-sky-400" size={20} />
                </div>
                <div>
                  <p className="text-sm text-default-500 dark:text-gray-400">
                    Carry Forward to{" "}
                    {new Date(
                      selectedMonth.getFullYear(),
                      selectedMonth.getMonth() + 1,
                      1
                    ).toLocaleDateString("en-MY", { month: "short" })}
                  </p>
                  <p className="text-2xl font-bold text-default-900 dark:text-gray-100">
                    {movements[movements.length - 1]?.cf.toLocaleString()}{" "}
                    <span className="text-base font-normal text-default-500 dark:text-gray-400">
                      bags
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Divider - only visible on hover */}
            <div className="h-12 w-px bg-default-200 dark:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity ml-3" />

            {/* Right side - Initial Balance (editable for migration) - only visible on hover */}
            {viewType === "month" && (
              <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div>
                  <p className="text-xs text-default-400 dark:text-gray-500 text-right">
                    Initial Balance
                  </p>
                  <div className="flex justify-end items-center gap-2">
                    {isEditingBalance ? (
                      <>
                        <input
                          type="number"
                          value={editBalanceValue}
                          onChange={(e) => setEditBalanceValue(e.target.value)}
                          min="0"
                          className="w-24 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 px-2 py-1 text-sm font-bold text-right focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveBalance}
                          disabled={isSavingBalance}
                          className="rounded-lg bg-green-500 p-1 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
                        >
                          <IconCheck size={16} />
                        </button>
                        <button
                          onClick={handleCancelEditBalance}
                          disabled={isSavingBalance}
                          className="rounded-lg bg-default-200 dark:bg-gray-700 p-1 text-default-600 dark:text-gray-300 hover:bg-default-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                        >
                          <IconX size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-bold tabular-nums text-default-800 dark:text-gray-100">
                          {initialBalance.toLocaleString()}
                        </p>
                        <button
                          onClick={handleEditBalance}
                          className="rounded-lg p-1 text-default-400 hover:bg-default-100 dark:hover:bg-gray-700 hover:text-default-600 dark:text-gray-500 dark:hover:text-gray-300 transition-all"
                        >
                          <IconEdit size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stock Movement Table */}
      {!selectedProductId ? (
        <div className="rounded-lg border border-dashed border-default-300 dark:border-gray-600 p-12 text-center">
          <IconPackage className="mx-auto h-12 w-12 text-default-300 dark:text-gray-600" />
          <p className="mt-4 text-default-500 dark:text-gray-400">
            Please select a product to view stock movements
          </p>
        </div>
      ) : viewType === "custom" && (!customStartDate || !customEndDate) ? (
        <div className="rounded-lg border border-dashed border-default-300 dark:border-gray-600 p-12 text-center">
          <IconCalendar className="mx-auto h-12 w-12 text-default-300 dark:text-gray-600" />
          <p className="mt-4 text-default-500 dark:text-gray-400">
            Please select a date range to view stock movements
          </p>
        </div>
      ) : (
        <StockMovementTable
          movements={movements}
          monthlyTotals={monthlyTotals || undefined}
          isLoading={isLoading}
        />
      )}

    </div>
  );
};

export default StockMovementPage;
