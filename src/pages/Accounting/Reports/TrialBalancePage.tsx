// src/pages/Accounting/Reports/TrialBalancePage.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  IconPrinter,
  IconRefresh,
  IconFilter,
  IconSearch,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import Checkbox from "../../../components/Checkbox";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ReportSourceGuide from "../../../components/Accounting/ReportSourceGuide";
import Pagination from "../../../components/Invoice/Pagination";
import { api } from "../../../routes/utils/api";
import { generateTrialBalancePDF } from "../../../utils/accounting/TrialBalancePDF";
import toast from "react-hot-toast";

interface TrialBalanceAccount {
  code: string;
  description: string;
  ledger_type: string;
  fs_note: string | null;
  note_name: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface TrialBalanceTotals {
  debit: number;
  credit: number;
  difference: number;
  is_balanced: boolean;
}

interface TrialBalancePagination {
  total: number;
  limit: number | null;
  offset: number;
}

interface TrialBalanceData {
  period: {
    year: number;
    month: number;
    start_date: string;
    end_date: string;
  };
  accounts: TrialBalanceAccount[];
  pagination: TrialBalancePagination;
  totals: TrialBalanceTotals;
  invoice_based?: {
    note_22_trade_receivables: number;
    note_7_revenue: number;
  };
}

const PAGE_SIZE = 100;

const LEDGER_TYPE_LABELS: Record<string, string> = {
  BK: "Bank",
  CS: "Closing Stock",
  GL: "General Ledger",
  OS: "Opening Stock",
  TC: "Trade Creditor",
  TD: "Trade Debtor",
};

const TrialBalancePage: React.FC = () => {
  const [trialBalance, setTrialBalance] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [selectedLedgerType, setSelectedLedgerType] = useState<string>("");
  const [exporting, setExporting] = useState<boolean>(false);
  const [hideZeroBalance, setHideZeroBalance] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Debounce the search input; new search always restarts from page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filters (except pagination) as query params, shared by the list fetch and PDF export
  const buildFilterParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (selectedLedgerType) params.set("ledger_type", selectedLedgerType);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (hideZeroBalance) params.set("hide_zero", "true");
    return params;
  }, [selectedLedgerType, debouncedSearch, hideZeroBalance]);

  const fetchTrialBalance = useCallback(async (): Promise<void> => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    const params = buildFilterParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((currentPage - 1) * PAGE_SIZE));

    try {
      setLoading(true);
      setError(null);

      const response = await api.get(
        `/api/financial-reports/trial-balance/${year}/${month}?${params.toString()}`
      );
      setTrialBalance(response);
    } catch (err) {
      setError("Failed to fetch trial balance. Please try again later.");
      console.error("Error fetching trial balance:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, buildFilterParams, currentPage]);

  useEffect(() => {
    fetchTrialBalance();
  }, [fetchTrialBalance]);

  const handleMonthChange = (newMonth: Date): void => {
    setSelectedMonth(newMonth);
    setCurrentPage(1);
  };

  const handleLedgerTypeChange = (value: string): void => {
    setSelectedLedgerType(value);
    setCurrentPage(1);
  };

  const handleHideZeroChange = (checked: boolean): void => {
    setHideZeroBalance(checked);
    setCurrentPage(1);
  };

  const handlePrintPDF = async (): Promise<void> => {
    if (!trialBalance) return;

    setExporting(true);
    try {
      // PDF always prints the full filtered set, not just the current page
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth() + 1;
      const fullData: TrialBalanceData = await api.get(
        `/api/financial-reports/trial-balance/${year}/${month}?${buildFilterParams().toString()}`
      );
      await generateTrialBalancePDF(fullData, fullData.accounts);
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
    }).format(amount);
  };

  // Search/hide-zero/pagination are applied server-side
  const accounts = trialBalance?.accounts || [];
  const totalFiltered = trialBalance?.pagination?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  const getMonthName = (date: Date): string => {
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  };

  if (loading && !trialBalance) {
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
          Trial Balance
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          View account balances for the selected period
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Month Navigator */}
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
          />

          {/* Filters and Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search code or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 w-64 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Ledger Type Filter */}
            <div className="relative">
              <IconFilter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={selectedLedgerType}
                onChange={(e) => handleLedgerTypeChange(e.target.value)}
                className="pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
              >
                <option value="">All Ledger Types</option>
                {Object.entries(LEDGER_TYPE_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label} ({code})
                  </option>
                ))}
              </select>
            </div>

            {/* Hide Zero Balance Toggle */}
            <Checkbox
              checked={hideZeroBalance}
              onChange={handleHideZeroChange}
              label="Hide zero"
              size={18}
              className="flex-shrink-0"
            />

            {/* Source Guide */}
            <ReportSourceGuide report="trial_balance" />

            {/* Refresh Button */}
            <Button
              onClick={fetchTrialBalance}
              variant="outline"
              disabled={loading}
              additionalClasses="flex-shrink-0"
            >
              <span className="flex items-center justify-center whitespace-nowrap">
                <IconRefresh className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </span>
            </Button>

            {/* Print PDF Button */}
            <Button
              onClick={handlePrintPDF}
              variant="filled"
              color="sky"
              disabled={exporting || !trialBalance || totalFiltered === 0}
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
      {trialBalance && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            trialBalance.totals.is_balanced
              ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {trialBalance.totals.is_balanced ? (
                <>
                  <IconCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-800 dark:text-green-200">
                    Trial Balance is Balanced
                  </span>
                </>
              ) : (
                <>
                  <IconX className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <span className="font-medium text-red-800 dark:text-red-200">
                    Trial Balance is NOT Balanced (Difference: RM {formatCurrency(trialBalance.totals.difference)})
                  </span>
                </>
              )}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              For period {trialBalance.period.start_date} to {trialBalance.period.end_date}
            </div>
          </div>
        </div>
      )}

      {/* Trial Balance Table */}
      {trialBalance && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-32">
                    Account Code
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                    Description
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 w-20">
                    Type
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 w-20">
                    Note
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 w-36">
                    Debit (RM)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 w-36">
                    Credit (RM)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No accounts found matching the criteria
                    </td>
                  </tr>
                ) : (
                  accounts.map((account) => (
                    <tr
                      key={account.code}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        {account.code}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {account.description}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                          {account.ledger_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                        {account.fs_note || "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                        {account.debit > 0 ? formatCurrency(account.debit) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                        {account.credit > 0 ? formatCurrency(account.credit) : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* Totals Footer */}
              <tfoot className="bg-gray-100 dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-600">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-bold text-gray-900 dark:text-white text-right">
                    TOTALS:
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">
                    {formatCurrency(trialBalance.totals.debit)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">
                    {formatCurrency(trialBalance.totals.credit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary Footer with pagination */}
          <div className="px-4 pb-3 bg-gray-50 dark:bg-gray-900">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsCount={accounts.length}
              totalItems={totalFiltered}
              pageSize={PAGE_SIZE}
            />
            <div className="text-right text-xs text-gray-500 dark:text-gray-400 mt-2">
              Period: January - {getMonthName(selectedMonth)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialBalancePage;
