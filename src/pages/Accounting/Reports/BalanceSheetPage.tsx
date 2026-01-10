// src/pages/Accounting/Reports/BalanceSheetPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { IconDownload, IconRefresh, IconCheck, IconX } from "@tabler/icons-react";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import { generateBalanceSheetPDF } from "../../../utils/accounting/BalanceSheetPDF";
import toast from "react-hot-toast";

interface LineItem {
  note: string;
  name: string;
  amount: number;
}

interface BalanceSheetData {
  period: {
    year: number;
    month: number;
    as_of_date: string;
  };
  assets: {
    current: {
      items: LineItem[];
      total: number;
    };
    non_current: {
      items: LineItem[];
      total: number;
    };
    total: number;
  };
  liabilities: {
    current: {
      items: LineItem[];
      total: number;
    };
    non_current: {
      items: LineItem[];
      total: number;
    };
    total: number;
  };
  equity: {
    items: LineItem[];
    total: number;
  };
  totals: {
    total_assets: number;
    total_liabilities_equity: number;
    is_balanced: boolean;
  };
}

const BalanceSheetPage: React.FC = () => {
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const fetchData = useCallback(async (): Promise<void> => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/api/financial-reports/balance-sheet/${year}/${month}`);
      setData(response);
    } catch (err) {
      setError("Failed to fetch balance sheet. Please try again later.");
      console.error("Error fetching balance sheet:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleMonthChange = (newMonth: Date): void => {
    setSelectedMonth(newMonth);
  };

  const handleExportPDF = async (): Promise<void> => {
    if (!data) return;

    setExporting(true);
    try {
      await generateBalanceSheetPDF(data);
      toast.success("PDF exported successfully");
    } catch (err) {
      console.error("Error exporting PDF:", err);
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
  };

  const getMonthName = (date: Date): string => {
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Balance Sheet
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Statement of Financial Position as of the selected period
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
          />

          <div className="flex items-center gap-3">
            <Button onClick={fetchData} variant="outline" disabled={loading}>
              <IconRefresh className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Button
              onClick={handleExportPDF}
              variant="primary"
              disabled={exporting || !data}
            >
              <IconDownload className="h-4 w-4 mr-2" />
              {exporting ? "Exporting..." : "Export PDF"}
            </Button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Balance Status Banner */}
      {data && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            data.totals.is_balanced
              ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {data.totals.is_balanced ? (
              <>
                <IconCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  Balance Sheet is Balanced (Assets = Liabilities + Equity)
                </span>
              </>
            ) : (
              <>
                <IconX className="h-5 w-5 text-red-600 dark:text-red-400" />
                <span className="font-medium text-red-800 dark:text-red-200">
                  Balance Sheet is NOT Balanced (Difference: RM {formatCurrency(Math.abs(data.totals.total_assets - data.totals.total_liabilities_equity))})
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Balance Sheet */}
      {data && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Title Header */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">
              STATEMENT OF FINANCIAL POSITION
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              As at {data.period.as_of_date}
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* ASSETS */}
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wide border-b-2 border-gray-300 dark:border-gray-600 pb-2">
                ASSETS
              </h3>

              {/* Non-Current Assets */}
              {data.assets.non_current.items.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    Non-Current Assets
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.assets.non_current.items.map((item) => (
                      <div key={item.note} className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">
                          {item.name} (Note {item.note})
                        </span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Non-Current Assets</span>
                    <span className="font-mono text-gray-900 dark:text-white">
                      {formatCurrency(data.assets.non_current.total)}
                    </span>
                  </div>
                </div>
              )}

              {/* Current Assets */}
              {data.assets.current.items.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    Current Assets
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.assets.current.items.map((item) => (
                      <div key={item.note} className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">
                          {item.name} (Note {item.note})
                        </span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Current Assets</span>
                    <span className="font-mono text-gray-900 dark:text-white">
                      {formatCurrency(data.assets.current.total)}
                    </span>
                  </div>
                </div>
              )}

              {/* Total Assets */}
              <div className="flex justify-between text-base font-bold mt-4 pt-3 border-t-2 border-gray-300 dark:border-gray-600">
                <span className="text-gray-900 dark:text-white">TOTAL ASSETS</span>
                <span className="font-mono text-gray-900 dark:text-white">
                  RM {formatCurrency(data.assets.total)}
                </span>
              </div>
            </div>

            {/* LIABILITIES & EQUITY */}
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wide border-b-2 border-gray-300 dark:border-gray-600 pb-2">
                LIABILITIES & EQUITY
              </h3>

              {/* Non-Current Liabilities */}
              {data.liabilities.non_current.items.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    Non-Current Liabilities
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.liabilities.non_current.items.map((item) => (
                      <div key={item.note} className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">
                          {item.name} (Note {item.note})
                        </span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Non-Current Liabilities</span>
                    <span className="font-mono text-gray-900 dark:text-white">
                      {formatCurrency(data.liabilities.non_current.total)}
                    </span>
                  </div>
                </div>
              )}

              {/* Current Liabilities */}
              {data.liabilities.current.items.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    Current Liabilities
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.liabilities.current.items.map((item) => (
                      <div key={item.note} className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">
                          {item.name} (Note {item.note})
                        </span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Current Liabilities</span>
                    <span className="font-mono text-gray-900 dark:text-white">
                      {formatCurrency(data.liabilities.current.total)}
                    </span>
                  </div>
                </div>
              )}

              {/* Equity */}
              {data.equity.items.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    Equity
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.equity.items.map((item) => (
                      <div key={item.note} className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">
                          {item.name} (Note {item.note})
                        </span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Equity</span>
                    <span className="font-mono text-gray-900 dark:text-white">
                      {formatCurrency(data.equity.total)}
                    </span>
                  </div>
                </div>
              )}

              {/* Total Liabilities & Equity */}
              <div className="flex justify-between text-base font-bold mt-4 pt-3 border-t-2 border-gray-300 dark:border-gray-600">
                <span className="text-gray-900 dark:text-white">TOTAL LIABILITIES & EQUITY</span>
                <span className="font-mono text-gray-900 dark:text-white">
                  RM {formatCurrency(data.totals.total_liabilities_equity)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Period: {getMonthName(selectedMonth)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BalanceSheetPage;
