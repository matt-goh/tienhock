// src/pages/Accounting/Reports/BankStatementPage.tsx
// Bank statement from journal (item 1B-1): a running-ledger view of a single
// bank/cash account. Pick an account + month; see opening balance, every posted
// journal line that touches the account, a running balance, and closing totals.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { IconPrinter, IconRefresh, IconAnchor } from "@tabler/icons-react";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ListboxSelect from "../../../components/ListboxSelect";
import OpeningBalanceModal from "../../../components/Accounting/OpeningBalanceModal";
import { api } from "../../../routes/utils/api";
import { useAccountCodesCache } from "../../../utils/accounting/useAccountingCache";
import {
  generateAccountLedgerPDF,
  AccountLedgerData,
} from "../../../utils/accounting/AccountLedgerPDFMake";
import toast from "react-hot-toast";

const DEFAULT_ACCOUNT = "BANK_PBB";

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

// Bank asset: positive balance = DR, negative = CR (legacy convention)
const formatBalance = (amount: number): string =>
  `${formatCurrency(Math.abs(amount))} ${amount >= 0 ? "DR" : "CR"}`;

// yyyy-MM-dd -> dd/MM/yyyy without a Date round-trip (avoids TZ shift)
const formatDate = (iso: string): string => {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
};

const BankStatementPage: React.FC = () => {
  const { accountCodes, isLoading: accountsLoading } = useAccountCodesCache();

  const [selectedAccount, setSelectedAccount] = useState<string>(DEFAULT_ACCOUNT);
  const [statement, setStatement] = useState<AccountLedgerData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
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

  // Bank/cash accounts only (BK ledger type, plus CASH in hand)
  const bankAccounts = useMemo(
    () =>
      accountCodes
        .filter((a) => a.is_active && (a.ledger_type === "BK" || a.code === "CASH"))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accountCodes]
  );

  const fetchStatement = useCallback(async (): Promise<void> => {
    if (!selectedAccount) return;
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
      setError("Failed to fetch bank statement. Please try again later.");
      console.error("Error fetching bank statement:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, selectedMonth]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  const selectedAccountDescription = useMemo(
    () => bankAccounts.find((a) => a.code === selectedAccount)?.description,
    [bankAccounts, selectedAccount]
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
      await generateAccountLedgerPDF(statement);
    } catch (err) {
      console.error("Error printing PDF:", err);
      toast.error("Failed to generate PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading && !statement) {
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
          Bank Statement
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Running ledger of a bank or cash account, from posted journal entries
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Account selector */}
            <ListboxSelect
              value={selectedAccount}
              onChange={setSelectedAccount}
              disabled={accountsLoading}
              className="w-64"
              options={
                bankAccounts.length === 0
                  ? [{ value: DEFAULT_ACCOUNT, label: DEFAULT_ACCOUNT }]
                  : bankAccounts.map((a) => ({
                      value: a.code,
                      label: `${a.code} - ${a.description}`,
                    }))
              }
            />

            {/* Month Navigator */}
            <MonthNavigator selectedMonth={selectedMonth} onChange={setSelectedMonth} />

            {/* Set opening balance */}
            <Button
              onClick={handleOpenOpeningModal}
              variant="outline"
              disabled={accountsLoading}
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

      {/* Statement Table */}
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

export default BankStatementPage;
