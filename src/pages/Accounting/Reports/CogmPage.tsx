// src/pages/Accounting/Reports/CogmPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { IconPrinter, IconRefresh } from "@tabler/icons-react";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ReportSourceGuide from "../../../components/Accounting/ReportSourceGuide";
import { api } from "../../../routes/utils/api";
import { generateCogmPDF } from "../../../utils/accounting/CogmPDF";
import {
  type CogmData,
  type CogmLayoutRow,
  formatCogmAmount,
  getCogmLayoutRows,
} from "../../../utils/accounting/cogmLayout";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import { usePersistedMonth } from "../../../hooks/usePersistedFilters";

const CogmPage: React.FC = () => {
  const { t } = useTranslation("accounting");
  const [data, setData] = useState<CogmData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  // The selected month persists so returning to the report reopens the period
  // the user was reading.
  const [selectedMonth, setSelectedMonth] = usePersistedMonth("cogmMonth");

  const fetchData = useCallback(async (): Promise<void> => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/api/financial-reports/cogm/${year}/${month}`);
      setData(response);
    } catch (err) {
      setError(t("Failed to fetch COGM report. Please try again later."));
      console.error("Error fetching COGM:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The statement is long; restore the reading position on return.
  useScrollRestoration("cogm", !loading && !!data);

  const handleMonthChange = (newMonth: Date): void => {
    setSelectedMonth(newMonth);
  };

  const handlePrintPDF = async (): Promise<void> => {
    if (!data) return;

    setExporting(true);
    try {
      await generateCogmPDF(data);
    } catch (err) {
      console.error("Error printing PDF:", err);
      toast.error(t("Failed to generate PDF"));
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data) {
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
          <ReportSourceGuide report="cogm" />

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
            disabled={exporting || !data}
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

      {/* COGM Report */}
      {data && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Title Header */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">
              {t("COST OF GOODS MANUFACTURED")}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              {t("For the period {{start}} to {{end}}", {
                start: data.period.start_date,
                end: data.period.end_date,
              })}
            </p>
          </div>

          <div className="overflow-x-auto p-4 sm:p-6">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 uppercase">
                  <th scope="col" className="pb-2 text-left font-medium">{t("Particular")}</th>
                  <th scope="col" className="w-20 px-3 pb-2 text-center font-medium">{t("Note")}</th>
                  <th scope="col" className="w-40 pb-2 text-right font-medium">{t("Amount (RM)")}</th>
                </tr>
              </thead>
              <tbody>
                {getCogmLayoutRows(data).map((row: CogmLayoutRow): React.ReactNode => {
                  if (row.kind === "heading") {
                    return (
                      <tr key={row.key}>
                        <th colSpan={3} scope="row" className="pt-6 pb-3 text-left font-bold text-gray-900 dark:text-white uppercase">
                          {t(row.label)}
                        </th>
                      </tr>
                    );
                  }
                  if (row.kind === "subtotal") {
                    return (
                      <tr key={row.key}>
                        <td colSpan={2} />
                        <td className="border-t border-gray-400 dark:border-gray-500 py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                          {formatCogmAmount(row.amount)}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={row.key}>
                      <td className={`${row.spaceBefore ? "pt-8" : "pt-1"} pb-1 text-gray-700 dark:text-gray-300`}>
                        {row.translateLabel ? t(row.label) : row.label}
                      </td>
                      <td className={`${row.spaceBefore ? "pt-8" : "pt-1"} px-3 pb-1 text-center text-gray-600 dark:text-gray-400`}>
                        {row.note}
                      </td>
                      <td className={`${row.spaceBefore ? "pt-8" : "pt-1"} pb-1 text-right tabular-nums text-gray-900 dark:text-white`}>
                        {formatCogmAmount(row.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold text-gray-900 dark:text-white">
                  <th colSpan={2} scope="row" className="pt-3 pr-4 text-left">{t("COST OF GOODS MANUFACTURED")}</th>
                  <td className="border-t border-b-4 border-double border-gray-600 dark:border-gray-300 py-3 text-right tabular-nums">
                    {formatCogmAmount(data.total_cogm)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              {t("Period: {{month}}", {
                month: selectedMonth.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                }),
              })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CogmPage;
