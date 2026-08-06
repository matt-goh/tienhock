// src/pages/Accounting/Reports/TrialBalancePage.tsx
import React, {
  Fragment,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import {
  IconPrinter,
  IconRefresh,
  IconFilter,
  IconSearch,
  IconCheck,
  IconChevronDown,
  IconX,
} from "@tabler/icons-react";
import clsx from "clsx";
import MonthNavigator from "../../../components/MonthNavigator";
import Button from "../../../components/Button";
import Checkbox from "../../../components/Checkbox";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ReportSourceGuide from "../../../components/Accounting/ReportSourceGuide";
import Pagination from "../../../components/Invoice/Pagination";
import { api } from "../../../routes/utils/api";
import { generateTrialBalancePDF } from "../../../utils/accounting/TrialBalancePDF";
import { GREENTARGET_INFO } from "../../../utils/invoice/einvoice/companyInfo";
import toast from "react-hot-toast";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";

// Green Target keeps its own cache so browsing the GT trial balance never
// overwrites the Tien Hock view's saved filters (and vice versa).
const FILTERS_STORAGE_KEYS = {
  tienhock: "trialBalanceFilters",
  greentarget: "gtTrialBalanceFilters",
} as const;

const SCROLL_RESTORATION_KEYS = {
  tienhock: "trial-balance",
  greentarget: "gt-trial-balance",
} as const;

interface CachedTrialBalanceFilters {
  month: Date;
  searchTerm: string;
  selectedLedgerType: string;
  hideZeroBalance: boolean;
  page: number;
}

// Restores the month, search, ledger-type, zero-balance toggle and page so
// returning from an account ledger lands on the same view.
const loadCachedFilters = (storageKey: string): CachedTrialBalanceFilters => {
  const now = new Date();
  const fallback: CachedTrialBalanceFilters = {
    month: new Date(now.getFullYear(), now.getMonth(), 1),
    searchTerm: "",
    selectedLedgerType: "",
    hideZeroBalance: true,
    page: 1,
  };

  try {
    const cached = localStorage.getItem(storageKey);
    if (!cached) return fallback;
    const parsed = JSON.parse(cached);
    const month = typeof parsed.month === "string" ? new Date(parsed.month) : null;
    return {
      month:
        month && !Number.isNaN(month.getTime())
          ? new Date(month.getFullYear(), month.getMonth(), 1)
          : fallback.month,
      searchTerm:
        typeof parsed.searchTerm === "string" ? parsed.searchTerm : "",
      selectedLedgerType:
        typeof parsed.selectedLedgerType === "string"
          ? parsed.selectedLedgerType
          : "",
      hideZeroBalance: parsed.hideZeroBalance !== false,
      page:
        typeof parsed.page === "number" && parsed.page >= 1 ? parsed.page : 1,
    };
  } catch (e) {
    console.error("Error loading cached trial balance filters:", e);
    return fallback;
  }
};

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

const ledgerTypeOptions: { value: string; label: string }[] = [
  { value: "", label: "All Ledger Types" },
  ...Object.entries(LEDGER_TYPE_LABELS).map(([code, label]) => ({
    value: code,
    label: `${label} (${code})`,
  })),
];

export interface TrialBalancePageProps {
  company?: "tienhock" | "greentarget";
}

const TrialBalancePage: React.FC<TrialBalancePageProps> = ({
  company = "tienhock",
}: TrialBalancePageProps) => {
  const isGreenTarget: boolean = company === "greentarget";
  const reportsBasePath: string = isGreenTarget
    ? "/greentarget/api/financial-reports"
    : "/api/financial-reports";
  const filtersStorageKey: string = FILTERS_STORAGE_KEYS[company];
  const [trialBalance, setTrialBalance] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>(
    () => loadCachedFilters(filtersStorageKey).searchTerm
  );
  const [debouncedSearch, setDebouncedSearch] = useState<string>(
    () => loadCachedFilters(filtersStorageKey).searchTerm
  );
  const [selectedLedgerType, setSelectedLedgerType] = useState<string>(
    () => loadCachedFilters(filtersStorageKey).selectedLedgerType
  );
  const [exporting, setExporting] = useState<boolean>(false);
  const [hideZeroBalance, setHideZeroBalance] = useState<boolean>(
    () => loadCachedFilters(filtersStorageKey).hideZeroBalance
  );
  const [currentPage, setCurrentPage] = useState<number>(
    () => loadCachedFilters(filtersStorageKey).page
  );

  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<Date>(
    () => loadCachedFilters(filtersStorageKey).month
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        filtersStorageKey,
        JSON.stringify({
          month: selectedMonth.toISOString(),
          searchTerm,
          selectedLedgerType,
          hideZeroBalance,
          page: currentPage,
        })
      );
    } catch (e) {
      console.error("Error caching trial balance filters:", e);
    }
  }, [
    filtersStorageKey,
    selectedMonth,
    searchTerm,
    selectedLedgerType,
    hideZeroBalance,
    currentPage,
  ]);

  // Debounce the search input; a changed search always restarts from page 1.
  // The ref-guard skips the initial mount so the restored page survives.
  const searchSeenRef = useRef<boolean>(false);
  useEffect(() => {
    const isInitialRun: boolean = !searchSeenRef.current;
    searchSeenRef.current = true;
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      if (!isInitialRun) setCurrentPage(1);
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
        `${reportsBasePath}/trial-balance/${year}/${month}?${params.toString()}`
      );
      setTrialBalance(response);
    } catch (err) {
      setError("Failed to fetch trial balance. Please try again later.");
      console.error("Error fetching trial balance:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, buildFilterParams, currentPage, reportsBasePath]);

  useEffect(() => {
    fetchTrialBalance();
  }, [fetchTrialBalance]);

  // Restore the previous scroll position when returning from an account ledger.
  useScrollRestoration(
    SCROLL_RESTORATION_KEYS[company],
    !loading && !!trialBalance
  );

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
        `${reportsBasePath}/trial-balance/${year}/${month}?${buildFilterParams().toString()}`
      );
      await generateTrialBalancePDF(
        fullData,
        fullData.accounts,
        isGreenTarget
          ? {
              companyName: GREENTARGET_INFO.name,
              logoSrc: "/greentarget-logo.png",
            }
          : undefined
      );
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
      {/* Header: period + filters on the left, actions on the right */}
      <div className="mb-2 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            size="sm"
          />

          {/* Search */}
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search code or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-56 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Ledger Type Filter */}
          <Listbox value={selectedLedgerType} onChange={handleLedgerTypeChange}>
            <div className="relative">
              <ListboxButton className="relative w-48 cursor-pointer rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 pl-8 pr-8 text-left text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <IconFilter className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <span className="block truncate">
                  {selectedLedgerType
                    ? `${LEDGER_TYPE_LABELS[selectedLedgerType]} (${selectedLedgerType})`
                    : "All Ledger Types"}
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <IconChevronDown
                    className="h-4 w-4 text-gray-400"
                    aria-hidden="true"
                  />
                </span>
              </ListboxButton>
              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <ListboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-700 focus:outline-none">
                  {ledgerTypeOptions.map((option) => (
                    <ListboxOption
                      key={option.value}
                      value={option.value}
                      className={({ active }) =>
                        clsx(
                          "relative cursor-pointer select-none py-1.5 pl-3 pr-9",
                          active
                            ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200"
                            : "text-gray-900 dark:text-gray-100"
                        )
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span
                            className={`block truncate ${
                              selected ? "font-medium" : "font-normal"
                            }`}
                          >
                            {option.label}
                          </span>
                          {selected && (
                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                              <IconCheck className="h-4 w-4" aria-hidden="true" />
                            </span>
                          )}
                        </>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Transition>
            </div>
          </Listbox>

          {/* Hide Zero Balance Toggle */}
          <Checkbox
            checked={hideZeroBalance}
            onChange={handleHideZeroChange}
            label="Hide zero"
            size={18}
            className="flex-shrink-0"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Source Guide (TH-specific) */}
          {!isGreenTarget && <ReportSourceGuide report="trial_balance" />}

          <Button
            size="sm"
            variant="outline"
            icon={IconRefresh}
            iconSize={16}
            onClick={fetchTrialBalance}
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
            disabled={exporting || !trialBalance || totalFiltered === 0}
          >
            {exporting ? "Preparing..." : "Print"}
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Balance Status Banner */}
      {trialBalance && (
        <div
          className={`mb-2 p-2 rounded-lg border ${
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
              <tfoot className="sticky bottom-0 z-10 bg-gray-100 dark:bg-gray-900">
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-3 font-bold text-gray-900 dark:text-white text-right border-t-2 border-gray-300 dark:border-gray-600"
                  >
                    TOTALS:
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white border-t-2 border-gray-300 dark:border-gray-600">
                    {formatCurrency(trialBalance.totals.debit)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white border-t-2 border-gray-300 dark:border-gray-600">
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
