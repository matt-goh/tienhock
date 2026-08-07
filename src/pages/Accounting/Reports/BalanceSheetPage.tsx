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
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import { usePersistedMonth } from "../../../hooks/usePersistedFilters";

interface LineItem {
  note: string | null;
  name: string;
  amount: number;
}

const formatLineItemLabel = (item: LineItem, t: TFunction): string =>
  item.note
    ? t("{{name}} (Note {{note}})", { name: item.name, note: item.note })
    : item.name;

const formatGTLineItemLabel = (item: GTStatementItem, t: TFunction): string => {
  if (item.note)
    return t("{{name}} (Note {{note}})", { name: item.name, note: item.note });
  if (item.note_marker)
    return t("{{name}} ({{marker}})", {
      name: item.name,
      marker: item.note_marker,
    });
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
  const { t } = useTranslation("accounting");
  const isGT = company === "greentarget";
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [gtData, setGtData] = useState<GTBalanceSheetData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  // The selected month persists per company so returning to the report reopens
  // the period the user was reading.
  const [selectedMonth, setSelectedMonth] = usePersistedMonth(
    isGT ? "gtBalanceSheetMonth" : "balanceSheetMonth"
  );

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
      setError(t("Failed to fetch balance sheet. Please try again later."));
      console.error("Error fetching balance sheet:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, isGT, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The statement is long; restore the reading position on return.
  useScrollRestoration(
    isGT ? "gt-balance-sheet" : "balance-sheet",
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
        await generateGTBalanceSheetPDF(gtData);
      } catch (err) {
        console.error("Error printing PDF:", err);
        toast.error(t("Failed to generate PDF"));
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
      toast.error(t("Failed to generate PDF"));
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
            {t(figure.label)}
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
        <span className="text-gray-900 dark:text-white">{t(figure.label)}</span>
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
      <div className="mb-2 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            size="sm"
            pickerPlacement="bottom-left-button"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {!isGT && <ReportSourceGuide report="balance_sheet" />}

          <Button
            size="sm"
            variant="outline"
            icon={IconRefresh}
            iconSize={16}
            onClick={fetchData}
            disabled={loading}
            title={t("Refresh")}
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
            {exporting ? t("Preparing...") : t("Print")}
          </Button>
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
          className={`mb-2 p-2 rounded-lg border ${
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
                  {t("Balance Sheet is Balanced (Assets = Liabilities + Equity)")}
                </span>
              </>
            ) : (
              <>
                <IconX className="h-5 w-5 text-red-600 dark:text-red-400" />
                <span className="font-medium text-red-800 dark:text-red-200">
                  {t("Balance Sheet is NOT Balanced (Difference: RM {{amount}})", {
                    amount: formatCurrency(
                      Math.abs(
                        data.totals.total_assets -
                          data.totals.total_liabilities_equity
                      )
                    ),
                  })}
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
                  {t("Balance Sheet is Balanced (Net Assets = Financed By)")}
                </span>
              </>
            ) : (
              <>
                <IconX className="h-5 w-5 text-red-600 dark:text-red-400" />
                <span className="font-medium text-red-800 dark:text-red-200">
                  {t("Balance Sheet is NOT Balanced (Difference: RM {{amount}})", {
                    amount: formatCurrency(
                      Math.abs(
                        gtData.subtotals.net_assets -
                          gtData.subtotals.financed_by
                      )
                    ),
                  })}
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
              {t("STATEMENT OF FINANCIAL POSITION")}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              {t("For the period {{start}} to {{end}}", {
                start: data.period.start_date,
                end: data.period.as_of_date,
              })}
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* ASSETS */}
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wide border-b-2 border-gray-300 dark:border-gray-600 pb-2">
                {t("ASSETS")}
              </h3>

              {/* Non-Current Assets */}
              {data.assets.non_current.items.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    {t("Non-Current Assets")}
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.assets.non_current.items.map((item) => (
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item, t)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">
                      {t("Total Non-Current Assets")}
                    </span>
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
                    {t("Current Assets")}
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.assets.current.items.map((item) => (
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item, t)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">
                      {t("Total Current Assets")}
                    </span>
                    <span className="text-gray-900 dark:text-white">
                      {formatCurrency(data.assets.current.total)}
                    </span>
                  </div>
                </div>
              )}

              {/* Total Assets */}
              <div className="flex justify-between text-base font-bold mt-4 pt-3 border-t-2 border-gray-300 dark:border-gray-600">
                <span className="text-gray-900 dark:text-white">
                  {t("TOTAL ASSETS")}
                </span>
                <span className="text-gray-900 dark:text-white">
                  RM {formatCurrency(data.assets.total)}
                </span>
              </div>
            </div>

            {/* LIABILITIES & EQUITY */}
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wide border-b-2 border-gray-300 dark:border-gray-600 pb-2">
                {t("LIABILITIES & EQUITY")}
              </h3>

              {/* Non-Current Liabilities */}
              {data.liabilities.non_current.items.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    {t("Non-Current Liabilities")}
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.liabilities.non_current.items.map((item) => (
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item, t)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">
                      {t("Total Non-Current Liabilities")}
                    </span>
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
                    {t("Current Liabilities")}
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.liabilities.current.items.map((item) => (
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item, t)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">
                      {t("Total Current Liabilities")}
                    </span>
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
                    {t("Equity")}
                  </h4>
                  <div className="space-y-1 pl-4">
                    {data.equity.items.map((item) => (
                      <div
                        key={`${item.note ?? "no-note"}-${item.name}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatLineItemLabel(item, t)}
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                    <span className="text-gray-800 dark:text-gray-200">
                      {t("Total Equity")}
                    </span>
                    <span className="text-gray-900 dark:text-white">
                      {formatCurrency(data.equity.total)}
                    </span>
                  </div>
                </div>
              )}

              {/* Total Liabilities & Equity */}
              <div className="flex justify-between text-base font-bold mt-4 pt-3 border-t-2 border-gray-300 dark:border-gray-600">
                <span className="text-gray-900 dark:text-white">
                  {t("TOTAL LIABILITIES & EQUITY")}
                </span>
                <span className="text-gray-900 dark:text-white">
                  RM {formatCurrency(data.totals.total_liabilities_equity)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              {t("Period:")} {t("January")} - {getMonthName(selectedMonth)}
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
              {t("BALANCE SHEET")}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              {t("As at {{date}}", { date: gtData.period.as_of_date })}
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
                            {formatGTLineItemLabel(item, t)}
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
              {t("Period:")} {t("January")} - {getMonthName(selectedMonth)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BalanceSheetPage;
