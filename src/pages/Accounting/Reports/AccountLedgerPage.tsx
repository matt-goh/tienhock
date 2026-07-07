// src/pages/Accounting/Reports/AccountLedgerPage.tsx
// Generic account ledger (item 1B-2): the bank-statement view parametrised for ANY
// account code. Pick any account (expense, supplier, director, prepayment…) + month;
// see opening balance, every posted journal line that touches it, a running balance
// and closing totals. Answers "where did this figure come from" for any code.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { IconPrinter, IconRefresh, IconAnchor, IconSearch } from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import AccountCodeCombobox from "../../../components/Accounting/AccountCodeCombobox";
import OpeningBalanceModal from "../../../components/Accounting/OpeningBalanceModal";
import { api } from "../../../routes/utils/api";
import { useAccountCodesCache } from "../../../utils/accounting/useAccountingCache";
import {
  generateAccountLedgerPDF,
  AccountLedgerData,
} from "../../../utils/accounting/AccountLedgerPDFMake";
import toast from "react-hot-toast";

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

// Positive balance = DR, negative = CR (debit-normal running convention; expenses
// and assets read DR, liabilities/income read CR)
const formatBalance = (amount: number): string =>
  `${formatCurrency(Math.abs(amount))} ${amount >= 0 ? "DR" : "CR"}`;

// yyyy-MM-dd -> dd/MM/yyyy without a Date round-trip (avoids TZ shift)
const formatDate = (iso: string): string => {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
};

const AccountLedgerPage: React.FC = () => {
  const { accountCodes, isLoading: accountsLoading } = useAccountCodesCache();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-linkable: /accounting/reports/account-ledger?account=MGT
  const [selectedAccount, setSelectedAccount] = useState<string>(
    () => searchParams.get("account") || ""
  );
  const [statement, setStatement] = useState<AccountLedgerData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [showOpeningModal, setShowOpeningModal] = useState<boolean>(false);
  const [currentAnchor, setCurrentAnchor] = useState<{
    as_of_date: string;
    amount: number;
    notes?: string | null;
  } | null>(null);

  const handleAccountChange = (code: string): void => {
    setSelectedAccount(code);
    setSearchParams(code ? { account: code } : {}, { replace: true });
  };

  const fetchStatement = useCallback(async (): Promise<void> => {
    if (!selectedAccount) {
      setStatement(null);
      return;
    }
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;

    try {
      setLoading(true);
      setError(null);
      const response = await api.get(
        `/api/bank-statement/${selectedAccount}/${year}/${month}`
      );
      setStatement(response);
    } catch (err) {
      setError("Failed to fetch account ledger. Please try again later.");
      console.error("Error fetching account ledger:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, selectedMonth]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  const selectedAccountDescription = useMemo(
    () => accountCodes.find((a) => a.code === selectedAccount)?.description,
    [accountCodes, selectedAccount]
  );

  const handleOpenOpeningModal = async (): Promise<void> => {
    try {
      const res = await api.get(`/api/opening-balances/${selectedAccount}`);
      setCurrentAnchor(res?.opening_balance || null);
    } catch (err) {
      console.error("Error fetching opening balance:", err);
      setCurrentAnchor(null);
    }
    setShowOpeningModal(true);
  };

  const handlePrintPDF = async (): Promise<void> => {
    if (!statement) return;
    setExporting(true);
    try {
      await generateAccountLedgerPDF(statement, { title: "Account Ledger" });
    } catch (err) {
      console.error("Error printing PDF:", err);
      toast.error("Failed to generate PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Account Ledger
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Transaction history of any account code, from posted journal entries —
          e.g. an expenditure code, supplier, or director account
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Account selector: any active account code, searchable */}
            <AccountCodeCombobox
              value={selectedAccount}
              onChange={handleAccountChange}
              disabled={accountsLoading}
              placeholder="Search account code or name..."
              className="w-80"
            />

            {/* Month Navigator */}
            <MonthNavigator selectedMonth={selectedMonth} onChange={setSelectedMonth} />

            {/* Set opening balance */}
            <Button
              onClick={handleOpenOpeningModal}
              variant="outline"
              disabled={accountsLoading || !selectedAccount}
              additionalClasses="flex-shrink-0"
            >
              <span className="flex items-center justify-center whitespace-nowrap">
                <IconAnchor className="h-4 w-4 mr-2" />
                Set opening balance
              </span>
            </Button>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={fetchStatement}
              variant="outline"
              disabled={loading || !selectedAccount}
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
              disabled={exporting || !statement}
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

      {/* Empty state: no account picked yet */}
      {!selectedAccount && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-10 text-center">
          <IconSearch className="h-8 w-8 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            Pick an account to view its ledger
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Search by code or name — e.g. MGT (Menggatal), MBRMF (boiler), CL_WSF
          </p>
        </div>
      )}

      {loading && !statement && selectedAccount && (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      )}

      {/* Summary banner */}
      {statement && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Opening Balance
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
              {formatBalance(statement.opening_balance)}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {statement.opening_source?.type === "anchored"
                ? `Anchored as of ${formatDate(statement.opening_source.as_of_date)}`
                : "Derived from prior postings"}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Movement (Dr / Cr)
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
              {formatCurrency(statement.totals.debit)} / {formatCurrency(statement.totals.credit)}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Closing Balance
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
              {formatBalance(statement.closing_balance)}
            </div>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      {statement && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-28">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-36">
                    Journal
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                    Particulars
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-28">
                    Cheque
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 w-32">
                    Debit (RM)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 w-32">
                    Credit (RM)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 w-40">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {/* Opening balance row */}
                <tr className="bg-gray-50/70 dark:bg-gray-900/40">
                  <td colSpan={6} className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                    Balance Brought Forward
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                    {formatBalance(statement.opening_balance)}
                  </td>
                </tr>

                {statement.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No transactions in this period
                    </td>
                  </tr>
                ) : (
                  statement.transactions.map((t) => (
                    <tr
                      key={t.line_id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatDate(t.entry_date)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {t.reference_no}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                        {t.particulars}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {t.cheque_no || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">
                        {t.debit > 0 ? formatCurrency(t.debit) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">
                        {t.credit > 0 ? formatCurrency(t.credit) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white whitespace-nowrap">
                        {formatBalance(t.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-gray-100 dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-600 sticky bottom-0">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-bold text-gray-900 dark:text-white text-right">
                    TOTALS:
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">
                    {formatCurrency(statement.totals.debit)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">
                    {formatCurrency(statement.totals.credit)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white whitespace-nowrap">
                    {formatBalance(statement.closing_balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary Footer */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>{statement.totals.count} transactions</span>
              <span>
                {statement.account.code} · {statement.period.start_date} to {statement.period.end_date}
              </span>
            </div>
          </div>
        </div>
      )}

      <OpeningBalanceModal
        isOpen={showOpeningModal}
        onClose={() => setShowOpeningModal(false)}
        accountCode={selectedAccount}
        accountDescription={selectedAccountDescription}
        current={currentAnchor}
        onSaved={fetchStatement}
      />
    </div>
  );
};

export default AccountLedgerPage;
