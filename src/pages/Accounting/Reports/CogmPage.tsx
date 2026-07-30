// src/pages/Accounting/Reports/CogmPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { IconPrinter, IconRefresh } from "@tabler/icons-react";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ReportSourceGuide from "../../../components/Accounting/ReportSourceGuide";
import { api } from "../../../routes/utils/api";
import { generateCogmPDF } from "../../../utils/accounting/CogmPDF";
import toast from "react-hot-toast";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import { usePersistedMonth } from "../../../hooks/usePersistedFilters";

interface LineItem {
  note: string;
  name: string;
  amount: number;
}

interface CogmData {
  period: {
    year: number;
    month: number;
    start_date: string;
    end_date: string;
  };
  raw_materials: {
    items: LineItem[];
    total: number;
  };
  packing_materials: {
    items: LineItem[];
    total: number;
  };
  labor_costs: {
    items: LineItem[];
    total: number;
  };
  other_costs: {
    items: LineItem[];
    total: number;
  };
  total_cogm: number;
}

const CogmPage: React.FC = () => {
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
      setError("Failed to fetch COGM report. Please try again later.");
      console.error("Error fetching COGM:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

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
          <ReportSourceGuide report="cogm" />

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
            disabled={exporting || !data}
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

      {/* COGM Report */}
      {data && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Title Header */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">
              COST OF GOODS MANUFACTURED
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              For the period {data.period.start_date} to {data.period.end_date}
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Raw Materials Section */}
            {data.raw_materials.items.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wide">
                  Raw Materials
                </h3>
                <div className="space-y-1 pl-4">
                  {data.raw_materials.items.map((item) => (
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
                <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                  <span className="text-gray-800 dark:text-gray-200">Total Raw Materials</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatCurrency(data.raw_materials.total)}
                  </span>
                </div>
              </div>
            )}

            {/* Packing Materials Section */}
            {data.packing_materials.items.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wide">
                  Packing Materials
                </h3>
                <div className="space-y-1 pl-4">
                  {data.packing_materials.items.map((item) => (
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
                <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                  <span className="text-gray-800 dark:text-gray-200">Total Packing Materials</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatCurrency(data.packing_materials.total)}
                  </span>
                </div>
              </div>
            )}

            {/* Labor Costs Section */}
            {data.labor_costs.items.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wide">
                  Direct Labor
                </h3>
                <div className="space-y-1 pl-4">
                  {data.labor_costs.items.map((item) => (
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
                <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                  <span className="text-gray-800 dark:text-gray-200">Total Direct Labor</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatCurrency(data.labor_costs.total)}
                  </span>
                </div>
              </div>
            )}

            {/* Other Costs Section */}
            {data.other_costs.items.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wide">
                  Other Manufacturing Costs
                </h3>
                <div className="space-y-1 pl-4">
                  {data.other_costs.items.map((item) => (
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
                <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 pl-4">
                  <span className="text-gray-800 dark:text-gray-200">Total Other Costs</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatCurrency(data.other_costs.total)}
                  </span>
                </div>
              </div>
            )}

            {/* Total COGM */}
            <div className="flex justify-between text-lg font-bold py-4 border-y-2 border-gray-400 dark:border-gray-500 bg-amber-50 dark:bg-amber-900/30 -mx-6 px-6">
              <span className="text-gray-900 dark:text-white">COST OF GOODS MANUFACTURED</span>
              <span className="text-amber-700 dark:text-amber-400">
                RM {formatCurrency(data.total_cogm)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Period: {selectedMonth.toLocaleString("default", { month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CogmPage;
