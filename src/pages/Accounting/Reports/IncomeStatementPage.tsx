// src/pages/Accounting/Reports/IncomeStatementPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { IconPrinter, IconRefresh } from "@tabler/icons-react";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ReportSourceGuide from "../../../components/Accounting/ReportSourceGuide";
import { api } from "../../../routes/utils/api";
import { generateIncomeStatementPDF } from "../../../utils/accounting/IncomeStatementPDF";
import {
  generateGTIncomeStatementPDF,
  GTIncomeStatementData,
  GTIncomeStatementSubtotals,
  GTStatementItem,
} from "../../../utils/accounting/GTIncomeStatementPDF";
import toast from "react-hot-toast";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import { usePersistedMonth } from "../../../hooks/usePersistedFilters";

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

interface IncomeStatementPageProps {
  company?: "tienhock" | "greentarget";
}

/**
 * Figures printed BETWEEN Green Target blocks, in printed order (transcribed
 * from GT_INCOME_STATEMENT.pdf). "rule" is the legacy bare rule-line amount;
 * "major"/"final" are the labelled bands.
 */
interface GTISAfterBlockFigure {
  label: string | null;
  ref: keyof GTIncomeStatementSubtotals;
  style: "rule" | "major" | "final";
}

const GT_IS_AFTER_BLOCK: Partial<Record<string, GTISAfterBlockFigure[]>> = {
  direct_costs: [
    { label: "GROSS (LOSS)/ PROFIT", ref: "gross_profit", style: "major" },
  ],
  other_operating_income: [
    { label: null, ref: "after_other_income", style: "rule" },
  ],
  administrative_expenses: [
    { label: "OPERATING PROFIT", ref: "operating_profit", style: "major" },
  ],
  finance_costs: [
    {
      label: "PROFIT BEFORE TAXATION",
      ref: "profit_before_taxation",
      style: "major",
    },
  ],
  tax: [
    {
      label: "PROFIT FOR THE FINANCIAL YEAR",
      ref: "profit_for_the_financial_year",
      style: "final",
    },
  ],
};

const formatGTLineItemLabel = (item: GTStatementItem): string => {
  if (item.note) return `${item.name} (Note ${item.note})`;
  if (item.note_marker) return `${item.name} (${item.note_marker})`;
  return item.name;
};

const IncomeStatementPage: React.FC<IncomeStatementPageProps> = ({
  company = "tienhock",
}) => {
  const isGT = company === "greentarget";
  const [data, setData] = useState<IncomeStatementData | null>(null);
  const [gtData, setGtData] = useState<GTIncomeStatementData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  // The selected month persists per company so returning to the report reopens
  // the period the user was reading.
  const [selectedMonth, setSelectedMonth] = usePersistedMonth(
    isGT ? "gtIncomeStatementMonth" : "incomeStatementMonth"
  );

  const fetchData = useCallback(async (): Promise<void> => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    try {
      setLoading(true);
      setError(null);
      const response = await api.get(
        isGT
          ? `/greentarget/api/financial-reports/income-statement/${year}/${month}`
          : `/api/financial-reports/income-statement/${year}/${month}`
      );
      if (isGT) {
        setGtData(response);
      } else {
        setData(response);
      }
    } catch (err) {
      setError("Failed to fetch income statement. Please try again later.");
      console.error("Error fetching income statement:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, isGT]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The statement is long; restore the reading position on return.
  useScrollRestoration(
    isGT ? "gt-income-statement" : "income-statement",
    !loading && (!!data || !!gtData)
  );

  const handleMonthChange = (newMonth: Date): void => {
    setSelectedMonth(newMonth);
  };

  const handlePrintPDF = async (): Promise<void> => {
    if (isGT) {
      if (!gtData) return;
      setExporting(true);
      try {
        await generateGTIncomeStatementPDF(gtData);
      } catch (err) {
        console.error("Error printing PDF:", err);
        toast.error("Failed to generate PDF");
      } finally {
        setExporting(false);
      }
      return;
    }

    if (!data) return;

    setExporting(true);
    try {
      await generateIncomeStatementPDF(data);
    } catch (err) {
      console.error("Error printing PDF:", err);
      toast.error("Failed to generate PDF");
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

  const formatGTCurrency = (amount: number): string => {
    const formatted = new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
    return amount < 0 ? `(${formatted})` : formatted;
  };

  const getMonthName = (date: Date): string => {
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  };

  const renderGTAfterBlockFigure = (
    figure: GTISAfterBlockFigure
  ): React.ReactNode => {
    if (!gtData) return null;
    const amount = gtData.subtotals[figure.ref];

    if (figure.style === "rule") {
      return (
        <div
          key={figure.ref}
          className="flex justify-end text-sm font-bold pt-2 border-t-2 border-gray-300 dark:border-gray-600"
        >
          <span className="text-gray-900 dark:text-white">
            {formatGTCurrency(amount)}
          </span>
        </div>
      );
    }

    if (figure.style === "final") {
      return (
        <div
          key={figure.ref}
          className="flex justify-between items-center text-lg font-bold py-4 border-y-2 border-gray-400 dark:border-gray-500 bg-blue-50 dark:bg-blue-900/30 -mx-6 px-6"
        >
          <span className="text-gray-900 dark:text-white">{figure.label}</span>
          <span
            className={`${
              amount >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            RM {formatGTCurrency(amount)}
          </span>
        </div>
      );
    }

    return (
      <div
        key={figure.ref}
        className="flex justify-between items-center text-base font-bold py-3 border-y-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 -mx-6 px-6"
      >
        <span className="text-gray-900 dark:text-white">{figure.label}</span>
        <span
          className={`${
            amount >= 0
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {formatGTCurrency(amount)}
        </span>
      </div>
    );
  };

  if (loading && !data && !gtData) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header: period on the left, actions on the right */}
      <div className="mb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            size="sm"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {!isGT && <ReportSourceGuide report="income_statement" />}

          <Button
            size="sm"
            variant="outline"
            icon={IconRefresh}
            iconSize={16}
            onClick={fetchData}
            disabled={loading}
            title="Refresh"
            additionalClasses={loading ? "[&_svg]:animate-spin" : ""}
          />
          <Button
            size="sm"
            variant="filled"
            color="sky"
            icon={IconPrinter}
            iconSize={16}
            onClick={handlePrintPDF}
            disabled={exporting || (isGT ? !gtData : !data)}
          >
            {exporting ? "Preparing..." : "Print"}
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Income Statement */}
      {!isGT && data && (
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
                    <span className="text-gray-900 dark:text-white">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-white">Total Revenue</span>
                <span className="text-gray-900 dark:text-white">
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
                    <span className="text-gray-900 dark:text-white">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-white">Total Cost of Goods Sold</span>
                <span className="text-gray-900 dark:text-white">
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
              <span className={`${data.gross_profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
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
                    <span className="text-gray-900 dark:text-white">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-white">Total Operating Expenses</span>
                <span className="text-gray-900 dark:text-white">
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
              <span className={`${data.net_profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
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

      {/* Green Target Income Statement (block-keyed printed layout) */}
      {isGT && gtData && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Title Header */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">
              INCOME STATEMENT
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              For the period {gtData.period.start_date} to{" "}
              {gtData.period.end_date}
              {gtData.period.basis === "year_to_date" ? " (Year to date)" : ""}
            </p>
          </div>

          <div className="p-6 space-y-6">
            {gtData.blocks.map((block) => {
              const isLessBlock = block.headings.some((heading) =>
                heading.toUpperCase().startsWith("LESS")
              );
              return (
                <React.Fragment key={block.block}>
                  <div>
                    {block.headings.map((heading) => (
                      <h3
                        key={heading}
                        className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wide"
                      >
                        {heading}
                      </h3>
                    ))}
                    <div className={`space-y-1 ${isLessBlock ? "pl-4" : ""}`}>
                      {block.items.map((item) => (
                        <div
                          key={`${
                            item.note ?? item.note_marker ?? "no-note"
                          }-${item.name}`}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-gray-700 dark:text-gray-300">
                            {formatGTLineItemLabel(item)}
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {formatGTCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {block.subtotal_ref && (
                      <div className="flex justify-end text-sm font-bold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-gray-900 dark:text-white">
                          {formatGTCurrency(block.total)}
                        </span>
                      </div>
                    )}
                  </div>
                  {(GT_IS_AFTER_BLOCK[block.block] ?? []).map((figure) =>
                    renderGTAfterBlockFigure(figure)
                  )}
                </React.Fragment>
              );
            })}
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
