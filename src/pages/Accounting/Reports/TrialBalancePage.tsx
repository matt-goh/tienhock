// src/pages/Accounting/Reports/TrialBalancePage.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  IconDownload,
  IconRefresh,
  IconFilter,
  IconSearch,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
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

interface TrialBalanceData {
  period: {
    year: number;
    month: number;
    end_date: string;
  };
  accounts: TrialBalanceAccount[];
  totals: TrialBalanceTotals;
}

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
  const [selectedLedgerType, setSelectedLedgerType] = useState<string>("");
  const [exporting, setExporting] = useState<boolean>(false);
  const [hideZeroBalance, setHideZeroBalance] = useState<boolean>(true);

  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const fetchTrialBalance = useCallback(async (): Promise<void> => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    let url = `/api/financial-reports/trial-balance/${year}/${month}`;
    if (selectedLedgerType) {
      url += `?ledger_type=${selectedLedgerType}`;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await api.get(url);
      setTrialBalance(response);
    } catch (err) {
      setError("Failed to fetch trial balance. Please try again later.");
      console.error("Error fetching trial balance:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedLedgerType]);

  useEffect(() => {
    fetchTrialBalance();
  }, [fetchTrialBalance]);

  const handleMonthChange = (newMonth: Date): void => {
    setSelectedMonth(newMonth);
  };

  const handleExportPDF = async (): Promise<void> => {
    if (!trialBalance) return;

    setExporting(true);
    try {
      await generateTrialBalancePDF(trialBalance, filteredAccounts);
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
    }).format(amount);
  };

  const filteredAccounts = trialBalance?.accounts.filter((account) => {
    // Hide zero balance accounts if toggle is on
    if (hideZeroBalance && account.debit === 0 && account.credit === 0) {
      return false;
    }
    // Search filter
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      account.code.toLowerCase().includes(search) ||
      account.description.toLowerCase().includes(search) ||
      (account.fs_note && account.fs_note.toLowerCase().includes(search))
    );
  }) || [];

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
    <div className="p-6 max-w-7xl mx-auto">
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
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search code or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 w-64 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Ledger Type Filter */}
            <div className="relative">
              <IconFilter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={selectedLedgerType}
                onChange={(e) => setSelectedLedgerType(e.target.value)}
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
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hideZeroBalance}
                onChange={(e) => setHideZeroBalance(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
              />
              <span>Hide zero</span>
            </label>

            {/* Refresh Button */}
            <Button
              onClick={fetchTrialBalance}
              variant="outline"
              disabled={loading}
            >
              <IconRefresh className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            {/* Export PDF Button */}
            <Button
              onClick={handleExportPDF}
              variant="primary"
              disabled={exporting || !trialBalance || filteredAccounts.length === 0}
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
              As of {trialBalance.period.end_date}
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
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No accounts found matching the criteria
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((account) => (
                    <tr
                      key={account.code}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-4 py-3 font-mono text-gray-900 dark:text-white">
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
                      <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-white">
                        {account.debit > 0 ? formatCurrency(account.debit) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-white">
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
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-900 dark:text-white">
                    {formatCurrency(trialBalance.totals.debit)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-900 dark:text-white">
                    {formatCurrency(trialBalance.totals.credit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary Footer */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>
                Showing {filteredAccounts.length} of {trialBalance.accounts.length} accounts
              </span>
              <span>
                Period: {getMonthName(selectedMonth)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialBalancePage;
