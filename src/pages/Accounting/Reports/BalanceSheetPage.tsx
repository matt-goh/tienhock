// src/pages/Accounting/Reports/BalanceSheetPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { IconPrinter, IconRefresh, IconCheck, IconX } from "@tabler/icons-react";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ReportSourceGuide from "../../../components/Accounting/ReportSourceGuide";
import { api } from "../../../routes/utils/api";
import { generateBalanceSheetPDF } from "../../../utils/accounting/BalanceSheetPDF";
import {
  generateGTBalanceSheetPDF,
  GTBalanceSheetData,
  GTBalanceSheetSubtotals,
} from "../../../utils/accounting/GTBalanceSheetPDF";
import { GTStatementItem } from "../../../utils/accounting/GTIncomeStatementPDF";
import toast from "react-hot-toast";

interface LineItem {
  note: string | null;
  name: string;
  amount: number;
}

const formatLineItemLabel = (item: LineItem): string =>
  item.note ? `${item.name} (Note ${item.note})` : item.name;

const formatGTLineItemLabel = (item: GTStatementItem): string => {
  if (item.note) return `${item.name} (Note ${item.note})`;
  if (item.note_marker) return `${item.name} (${item.note_marker})`;
  return item.name;
};

interface BalanceSheetData {
  period: {
    year: number;
    month: number;
    start_date: string;
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

interface BalanceSheetPageProps {
  company?: "tienhock" | "greentarget";
}

/**
 * Figures printed BETWEEN Green Target blocks, in printed order (transcribed
 * from GT_BALANCE_SHEET.pdf). NET ASSETS closes the asset side; the
 * financed-by total closes the statement.
 */
interface GTBSAfterBlockFigure {
  label: string;
  ref: keyof GTBalanceSheetSubtotals;
  style: "subtotal" | "major";
}

const GT_BS_AFTER_BLOCK: Partial<Record<string, GTBSAfterBlockFigure[]>> = {
  current_liabilities: [
    {
      label: "NET CURRENT ASSETS/(LIABILITIES)",
      ref: "net_current_assets",
      style: "subtotal",
    },
    { label: "NET ASSETS", ref: "net_assets", style: "major" },
  ],
  long_term_liabilities: [
    { label: "TOTAL FINANCED BY", ref: "financed_by", style: "major" },
  ],
};

const BalanceSheetPage: React.FC<BalanceSheetPageProps> = ({
  company = "tienhock",
}) => {
  const isGT = company === "greentarget";
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [gtData, setGtData] = useState<GTBalanceSheetData | null>(null);
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
      const response = await api.get(
        isGT
          ? `/greentarget/api/financial-reports/balance-sheet/${year}/${month}`
          : `/api/financial-reports/balance-sheet/${year}/${month}`
      );
      if (isGT) {
        setGtData(response);
      } else {
        setData(response);
      }
    } catch (err) {
      setError("Failed to fetch balance sheet. Please try again later.");
      console.error("Error fetching balance sheet:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, isGT]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleMonthChange = (newMonth: Date): void => {
    setSelectedMonth(newMonth);
  };

  const handlePrintPDF = async (): Promise<void> => {
    if (isGT) {
      if (!gtData) return;
      setExporting(true);
      try {
        await generateGTBalanceSheetPDF(gtData);
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
      await generateBalanceSheetPDF(data);
    } catch (err) {
      console.error("Error printing PDF:", err);
      toast.error("Failed to generate PDF");
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (amount: number): string => {
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
    figure: GTBSAfterBlockFigure
  ): React.ReactNode => {
    if (!gtData) return null;
    const amount = gtData.subtotals[figure.ref];

    if (figure.style === "subtotal") {
      return (
        <div
          key={figure.ref}
          className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700"
        >
          <span className="text-gray-800 dark:text-gray-200">
            {figure.label}
          </span>
          <span className="text-gray-900 dark:text-white">
            {formatCurrency(amount)}
          </span>
        </div>
      );
    }

    return (
      <div
        key={figure.ref}
        className="flex justify-between text-base font-bold mt-4 pt-3 border-t-2 border-gray-300 dark:border-gray-600"
      >
        <span className="text-gray-900 dark:text-white">{figure.label}</span>
        <span className="text-gray-900 dark:text-white">
          RM {formatCurrency(amount)}
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

          <div className="flex flex-wrap items-center gap-3">
            {!isGT && <ReportSourceGuide report="balance_sheet" />}

            <Button
              onClick={fetchData}
              variant="outline"
              disabled={loading}
              additionalClasses="flex-shrink-0"
            >
              <span className="flex items-center justify-center whitespace-nowrap">
                <IconRefresh className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </span>
            </Button>

            <Button
              onClick={handlePrintPDF}
              variant="filled"
              color="sky"
              disabled={exporting || (isGT ? !gtData : !data)}
              additionalClasses="flex-shrink-0"
            >
              <span className="flex items-center justify-center whitespace-nowrap">
                <IconPrinter className="h-4 w-4 mr-2" />
                {exporting ? "Preparing..." : "Print PDF"}
              </span>
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
      {!isGT && data && (
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

      {/* Green Target Balance Status Banner (Net Assets = Financed By) */}
      {isGT && gtData && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            gtData.is_balanced
              ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {gtData.is_balanced ? (
              <>
                <IconCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  Balance Sheet is Balanced (Net Assets = Financed By)
                </span>
              </>
            ) : (
              <>
                <IconX className="h-5 w-5 text-red-600 dark:text-red-400" />
                <span className="font-medium text-red-800 dark:text-red-200">
                  Balance Sheet is NOT Balanced (Difference: RM {formatCurrency(Math.abs(gtData.subtotals.net_assets - gtData.subtotals.financed_by))})
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Balance Sheet */}
      {!isGT && data && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Title Header */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">
              STATEMENT OF FINANCIAL POSITION
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              For the period {data.period.start_date} to {data.period.as_of_date}
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
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Non-Current Assets</span>
                    <span className="text-gray-900 dark:text-white">
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
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Current Assets</span>
                    <span className="text-gray-900 dark:text-white">
                      {formatCurrency(data.assets.current.total)}
                    </span>
                  </div>
                </div>
              )}

              {/* Total Assets */}
              <div className="flex justify-between text-base font-bold mt-4 pt-3 border-t-2 border-gray-300 dark:border-gray-600">
                <span className="text-gray-900 dark:text-white">TOTAL ASSETS</span>
                <span className="text-gray-900 dark:text-white">
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
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Non-Current Liabilities</span>
                    <span className="text-gray-900 dark:text-white">
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
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Current Liabilities</span>
                    <span className="text-gray-900 dark:text-white">
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
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">Total Equity</span>
                    <span className="text-gray-900 dark:text-white">
                      {formatCurrency(data.equity.total)}
                    </span>
                  </div>
                </div>
              )}

              {/* Total Liabilities & Equity */}
              <div className="flex justify-between text-base font-bold mt-4 pt-3 border-t-2 border-gray-300 dark:border-gray-600">
                <span className="text-gray-900 dark:text-white">TOTAL LIABILITIES & EQUITY</span>
                <span className="text-gray-900 dark:text-white">
                  RM {formatCurrency(data.totals.total_liabilities_equity)}
                </span>
              </div>
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

      {/* Green Target Balance Sheet (block-keyed printed layout) */}
      {isGT && gtData && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Title Header */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">
              BALANCE SHEET
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              As at {gtData.period.as_of_date}
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
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {block.subtotal_ref && (
                      <div className="flex justify-end text-sm font-bold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(block.total)}
                        </span>
                      </div>
                    )}
                  </div>
                  {(GT_BS_AFTER_BLOCK[block.block] ?? []).map((figure) =>
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

export default BalanceSheetPage;
