// src/pages/Accounting/Reports/IncomeStatementPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { IconDownload, IconRefresh } from "@tabler/icons-react";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import { generateIncomeStatementPDF } from "../../../utils/accounting/IncomeStatementPDF";
import toast from "react-hot-toast";

interface LineItem {
  note: string;
  name: string;
  amount: number;
}

interface IncomeStatementData {
  period: {
    year: number;
    month: number;
    start_date: string;
    end_date: string;
  };
  revenue: {
    items: LineItem[];
    total: number;
  };
  cost_of_goods_sold: {
    items: LineItem[];
    total: number;
  };
  gross_profit: number;
  expenses: {
    items: LineItem[];
    total: number;
  };
  net_profit: number;
}

const IncomeStatementPage: React.FC = () => {
  const [data, setData] = useState<IncomeStatementData | null>(null);
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
      const response = await api.get(`/api/financial-reports/income-statement/${year}/${month}`);
      setData(response);
    } catch (err) {
      setError("Failed to fetch income statement. Please try again later.");
      console.error("Error fetching income statement:", err);
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
      await generateIncomeStatementPDF(data);
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
          Income Statement
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Profit and Loss for the selected period
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
              variant="filled"
              color="sky"
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

      {/* Income Statement */}
      {data && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Title Header */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">
              INCOME STATEMENT
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              For the period {data.period.start_date} to {data.period.end_date}
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Revenue Section */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wide">
                Revenue
              </h3>
              <div className="space-y-1">
                {data.revenue.items.map((item) => (
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
              <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-white">Total Revenue</span>
                <span className="font-mono text-gray-900 dark:text-white">
                  {formatCurrency(data.revenue.total)}
                </span>
              </div>
            </div>

            {/* COGS Section */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wide">
                Less: Cost of Goods Sold
              </h3>
              <div className="space-y-1 pl-4">
                {data.cost_of_goods_sold.items.map((item) => (
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
              <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-white">Total Cost of Goods Sold</span>
                <span className="font-mono text-gray-900 dark:text-white">
                  ({formatCurrency(data.cost_of_goods_sold.total)})
                </span>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="flex justify-between items-center text-base font-bold py-3 border-y-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 -mx-6 px-6">
              <div>
                <span className="text-gray-900 dark:text-white">GROSS PROFIT</span>
                {data.revenue.total > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({((data.gross_profit / data.revenue.total) * 100).toFixed(1)}% margin)
                  </span>
                )}
              </div>
              <span className={`font-mono ${data.gross_profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {data.gross_profit >= 0 ? "" : "("}
                {formatCurrency(data.gross_profit)}
                {data.gross_profit >= 0 ? "" : ")"}
              </span>
            </div>

            {/* Expenses Section */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wide">
                Less: Operating Expenses
              </h3>
              <div className="space-y-1 pl-4">
                {data.expenses.items.map((item) => (
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
              <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-white">Total Operating Expenses</span>
                <span className="font-mono text-gray-900 dark:text-white">
                  ({formatCurrency(data.expenses.total)})
                </span>
              </div>
            </div>

            {/* Net Profit */}
            <div className="flex justify-between items-center text-lg font-bold py-4 border-y-2 border-gray-400 dark:border-gray-500 bg-blue-50 dark:bg-blue-900/30 -mx-6 px-6">
              <div>
                <span className="text-gray-900 dark:text-white">NET PROFIT / (LOSS)</span>
                {data.revenue.total > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({((data.net_profit / data.revenue.total) * 100).toFixed(1)}% margin)
                  </span>
                )}
              </div>
              <span className={`font-mono ${data.net_profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {data.net_profit >= 0 ? "" : "("}
                RM {formatCurrency(data.net_profit)}
                {data.net_profit >= 0 ? "" : ")"}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Period: January - {getMonthName(selectedMonth)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomeStatementPage;
