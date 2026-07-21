// src/pages/Accounting/Reports/AccountLedgerPage.tsx
// Generic account ledger (item 1B-2): the bank-statement view parametrised for ANY
// account code. Pick any account (expense, supplier, director, prepayment…) + month;
// see opening balance, every posted journal line that touches it, a running balance
// and closing totals. Answers "where did this figure come from" for any code.
//
// Launch state is a "Recent ledgers" quick-access list (localStorage) instead of a
// blank picker; the selected account + period deep-link via the URL, journal
// references link to their journal entry page, and the scroll position is restored
// when returning from a journal.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  IconPrinter,
  IconRefresh,
  IconAnchor,
  IconHistory,
  IconX,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import TimeNavigator, { TimeRange } from "../../../components/TimeNavigator";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import AccountCodeCombobox from "../../../components/Accounting/AccountCodeCombobox";
import OpeningBalanceModal from "../../../components/Accounting/OpeningBalanceModal";
import { api } from "../../../routes/utils/api";
import { sessionService } from "../../../services/SessionService";
import { useAccountCodesCache } from "../../../utils/accounting/useAccountingCache";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import {
  generateAccountLedgerPDF,
  AccountLedgerData,
  AccountLedgerTransaction,
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

// Recently opened ledgers (quick access on launch). Most recent first.
type RecentLedgerEntry = { code: string; openedAt: number };
const RECENT_LEDGERS_STORAGE_KEY: string = "account-ledger-recent";
const RECENT_LEDGERS_MAX: number = 12;

const readRecentLedgers = (): RecentLedgerEntry[] => {
  try {
    const stored: string | null = localStorage.getItem(
      RECENT_LEDGERS_STORAGE_KEY
    );
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentLedgerEntry =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as RecentLedgerEntry).code === "string" &&
        typeof (entry as RecentLedgerEntry).openedAt === "number"
    );
  } catch {
    return [];
  }
};

const saveRecentLedgers = (entries: RecentLedgerEntry[]): void => {
  try {
    localStorage.setItem(RECENT_LEDGERS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures so the page remains usable.
  }
};

// Per-account posted-transaction counts, used to rank the "browse all accounts"
// grid by most-used first. Cached like the account codes cache (1 hour) since
// it's a single aggregate query that rarely needs to be fresh-to-the-second.
const USAGE_COUNTS_STORAGE_KEY: string = "account-ledger-usage-counts-cache";
const USAGE_COUNTS_CACHE_DURATION_MS: number = 60 * 60 * 1000;

type UsageCountsCache = { data: Record<string, number>; timestamp: number };

const readCachedUsageCounts = (): Record<string, number> | null => {
  try {
    const stored: string | null = localStorage.getItem(
      USAGE_COUNTS_STORAGE_KEY
    );
    if (!stored) return null;
    const { data, timestamp }: UsageCountsCache = JSON.parse(stored);
    if (Date.now() - timestamp > USAGE_COUNTS_CACHE_DURATION_MS) return null;
    return data;
  } catch {
    return null;
  }
};

const saveCachedUsageCounts = (data: Record<string, number>): void => {
  try {
    const cache: UsageCountsCache = { data, timestamp: Date.now() };
    localStorage.setItem(USAGE_COUNTS_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage failures so the page remains usable.
  }
};

// Last accessed period, remembered per logged-in user so every return to the
// page reopens the month they last looked at (unless a deep-link overrides it).
const LAST_RANGE_STORAGE_KEY_PREFIX: string = "account-ledger-last-range";

const getLastRangeStorageKey = (): string => {
  const staffId: string = sessionService.getStoredSession()?.staffId || "anon";
  return `${LAST_RANGE_STORAGE_KEY_PREFIX}:${staffId}`;
};

const readLastRange = (): { start: string; end: string } | null => {
  try {
    const stored: string | null = localStorage.getItem(getLastRangeStorageKey());
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { start: unknown }).start === "string" &&
      typeof (parsed as { end: unknown }).end === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test((parsed as { start: string }).start) &&
      /^\d{4}-\d{2}-\d{2}$/.test((parsed as { end: string }).end)
    ) {
      return parsed as { start: string; end: string };
    }
    return null;
  } catch {
    return null;
  }
};

const saveLastRange = (start: string, end: string): void => {
  try {
    localStorage.setItem(
      getLastRangeStorageKey(),
      JSON.stringify({ start, end })
    );
  } catch {
    // Ignore storage failures so the page remains usable.
  }
};

const AccountLedgerPage: React.FC = () => {
  const navigate = useNavigate();
  const { accountCodes, isLoading: accountsLoading } = useAccountCodesCache();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-linkable: /accounting/reports/account-ledger?account=MGT&start=2026-06-01&end=2026-06-30
  const [selectedAccount, setSelectedAccount] = useState<string>(
    () => searchParams.get("account") || ""
  );
  const [statement, setStatement] = useState<AccountLedgerData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [recentLedgers, setRecentLedgers] =
    useState<RecentLedgerEntry[]>(readRecentLedgers);
  // Mini in-ledger search: filters the loaded transactions client-side.
  const [txSearch, setTxSearch] = useState<string>("");
  // Browse-all-accounts pagination shown in the launch (no ledger selected) state.
  const [browsePage, setBrowsePage] = useState<number>(1);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>(
    () => readCachedUsageCounts() || {}
  );

  useEffect(() => {
    const cached = readCachedUsageCounts();
    if (cached) return;
    api
      .get("/api/bank-statement/usage-counts")
      .then((counts: Record<string, number>) => {
        setUsageCounts(counts);
        saveCachedUsageCounts(counts);
      })
      .catch((err) => {
        console.error("Error fetching account usage counts:", err);
      });
  }, []);

  const toLocalIso = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const parseIso = (s: string | null): Date | null => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  // Month / arbitrary range / year selection (defaults to the current month)
  const [range, setRange] = useState<{ start: Date | null; end: Date | null }>(() => {
    const urlStart = parseIso(searchParams.get("start"));
    const urlEnd = parseIso(searchParams.get("end"));
    if (urlStart && urlEnd) return { start: urlStart, end: urlEnd };
    const saved = readLastRange();
    if (saved) {
      const savedStart = parseIso(saved.start);
      const savedEnd = parseIso(saved.end);
      if (savedStart && savedEnd) return { start: savedStart, end: savedEnd };
    }
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  });

  const [showOpeningModal, setShowOpeningModal] = useState<boolean>(false);
  const [currentAnchor, setCurrentAnchor] = useState<{
    as_of_date: string;
    amount: number;
    notes?: string | null;
  } | null>(null);

  const syncUrl = (code: string, r: { start: Date | null; end: Date | null }): void => {
    const params: Record<string, string> = {};
    if (code) params.account = code;
    if (r.start && r.end) {
      params.start = toLocalIso(r.start);
      params.end = toLocalIso(r.end);
    }
    setSearchParams(params, { replace: true });
  };

  const handleAccountChange = (code: string): void => {
    setSelectedAccount(code);
    setTxSearch("");
    if (!code) setBrowsePage(1);
    syncUrl(code, range);
  };

  const handleRangeChange = (next: TimeRange): void => {
    setRange(next);
    syncUrl(selectedAccount, next);
  };

  // Remember the last accessed period per user so a plain return to the page
  // (no deep-link params) reopens the same month.
  useEffect(() => {
    if (range.start && range.end) {
      saveLastRange(toLocalIso(range.start), toLocalIso(range.end));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start?.getTime(), range.end?.getTime()]);

  // Float a successfully opened ledger to the top of the quick-access list.
  const recordRecentLedger = useCallback((code: string): void => {
    setRecentLedgers((prev: RecentLedgerEntry[]) => {
      const next: RecentLedgerEntry[] = [
        { code, openedAt: Date.now() },
        ...prev.filter((entry) => entry.code !== code),
      ].slice(0, RECENT_LEDGERS_MAX);
      saveRecentLedgers(next);
      return next;
    });
  }, []);

  const handleRemoveRecent = (code: string): void => {
    setRecentLedgers((prev: RecentLedgerEntry[]) => {
      const next: RecentLedgerEntry[] = prev.filter(
        (entry) => entry.code !== code
      );
      saveRecentLedgers(next);
      return next;
    });
  };

  const fetchStatement = useCallback(async (): Promise<void> => {
    if (!selectedAccount || !range.start || !range.end) {
      setStatement(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(
        `/api/bank-statement/${selectedAccount}/range/${toLocalIso(range.start)}/${toLocalIso(range.end)}`
      );
      setStatement(response);
      recordRecentLedger(selectedAccount);
    } catch (err) {
      setError("Failed to fetch account ledger. Please try again later.");
      console.error("Error fetching account ledger:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, range.start?.getTime(), range.end?.getTime()]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  // Preserve scroll position when returning from a journal entry page. Keyed by
  // account + period so switching ledgers doesn't restore a stale position.
  const scrollKey = useMemo((): string => {
    const start = range.start ? toLocalIso(range.start) : "";
    const end = range.end ? toLocalIso(range.end) : "";
    return `account-ledger:${selectedAccount}:${start}:${end}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, range.start?.getTime(), range.end?.getTime()]);
  useScrollRestoration(scrollKey, !loading && !!statement);

  const selectedAccountDescription = useMemo(
    () => accountCodes.find((a) => a.code === selectedAccount)?.description,
    [accountCodes, selectedAccount]
  );

  const accountDescriptionByCode = useMemo(() => {
    const map: Record<string, string> = {};
    accountCodes.forEach((account) => {
      map[account.code] = account.description;
    });
    return map;
  }, [accountCodes]);

  // Paginated "browse all accounts" grid shown in the launch state, so a user
  // who doesn't remember a code can still page through every ledger. Ranked by
  // most-used first (posted transaction count), falling back to sort_order/code
  // for accounts with equal (including zero) usage.
  const BROWSE_PAGE_SIZE = 24;
  const browsableAccounts = useMemo(
    () =>
      [...accountCodes]
        .filter((a) => a.is_active)
        .sort((a, b) => {
          const usageDiff = (usageCounts[b.code] || 0) - (usageCounts[a.code] || 0);
          if (usageDiff !== 0) return usageDiff;
          return a.sort_order - b.sort_order || a.code.localeCompare(b.code);
        }),
    [accountCodes, usageCounts]
  );
  const browseTotalPages = Math.max(
    1,
    Math.ceil(browsableAccounts.length / BROWSE_PAGE_SIZE)
  );
  const browsePageClamped = Math.min(browsePage, browseTotalPages);
  const browsedAccounts = browsableAccounts.slice(
    (browsePageClamped - 1) * BROWSE_PAGE_SIZE,
    browsePageClamped * BROWSE_PAGE_SIZE
  );

  const filteredTransactions = useMemo((): AccountLedgerTransaction[] => {
    if (!statement) return [];
    const query: string = txSearch.trim().toLowerCase();
    if (!query) return statement.transactions;
    return statement.transactions.filter((t) =>
      [
        t.reference_no,
        t.particulars,
        t.cheque_no || "",
        formatDate(t.entry_date),
        t.debit > 0 ? formatCurrency(t.debit) : "",
        t.credit > 0 ? formatCurrency(t.credit) : "",
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [statement, txSearch]);

  const hasActiveSearch: boolean = txSearch.trim().length > 0;

  // Dr/Cr sums of only the rows shown by the mini search (period totals stay in
  // the table footer; running balances stay period-true on every row).
  const shownTotals = useMemo(
    () =>
      filteredTransactions.reduce(
        (acc, t) => ({ debit: acc.debit + t.debit, credit: acc.credit + t.credit }),
        { debit: 0, credit: 0 }
      ),
    [filteredTransactions]
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

  const handleOpenJournal = (journalEntryId: number): void => {
    navigate(`/accounting/journal-entries/${journalEntryId}`);
  };

  return (
    <div className="w-full space-y-3">
      {/* Header: account + period on the left, search + actions on the right */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Account selector: any active account code, searchable */}
          <AccountCodeCombobox
            value={selectedAccount}
            onChange={handleAccountChange}
            disabled={accountsLoading}
            placeholder="Search account code or name..."
            className="w-[28rem] max-w-full"
            hierarchical
          />

          {selectedAccount && (
            <Button
              variant="outline"
              icon={IconX}
              iconSize={16}
              onClick={() => handleAccountChange("")}
              title="Close ledger and show recent ledgers"
              additionalClasses="h-[34px] w-[34px] !p-0 flex-shrink-0"
            />
          )}

          {/* Period: calendar month, arbitrary range, or whole year */}
          <TimeNavigator
            range={range}
            onChange={handleRangeChange}
            size="sm"
            modes={["month", "range", "year"]}
            presets={[
              {
                key: "thisMonth",
                label: "This month",
                getRange: () => {
                  const now = new Date();
                  return {
                    start: new Date(now.getFullYear(), now.getMonth(), 1),
                    end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
                  };
                },
              },
              {
                key: "thisYear",
                label: "This year",
                getRange: () => {
                  const now = new Date();
                  return {
                    start: new Date(now.getFullYear(), 0, 1),
                    end: new Date(now.getFullYear(), 11, 31),
                  };
                },
              },
            ]}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedAccount && statement && (
            <div className="relative">
              <input
                type="text"
                placeholder="Search transactions..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="px-3 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 w-[180px] placeholder-gray-400 dark:placeholder-gray-500"
              />
              {txSearch && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300 transition-colors"
                  onClick={() => setTxSearch("")}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          )}
          {selectedAccount && (
            <>
              <Button
                size="sm"
                variant="outline"
                icon={IconAnchor}
                iconSize={16}
                onClick={handleOpenOpeningModal}
                disabled={accountsLoading}
                title="Set opening balance"
              />
              <Button
                size="sm"
                variant="outline"
                icon={IconRefresh}
                iconSize={16}
                onClick={fetchStatement}
                disabled={loading}
                title="Refresh"
                additionalClasses={loading ? "[&_svg]:animate-spin" : ""}
              />
            </>
          )}
          <Button
            size="sm"
            variant="filled"
            color="sky"
            icon={IconPrinter}
            iconSize={16}
            onClick={handlePrintPDF}
            disabled={exporting || !statement}
          >
            {exporting ? "Preparing..." : "Print"}
          </Button>
        </div>
      </div>

      {/* Compact summary strip */}
      {statement && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm px-0.5">
          <span className="font-medium text-default-700 dark:text-gray-200">
            <Link
              to={`/accounting/account-codes/${encodeURIComponent(statement.account.code)}`}
              className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors"
              title={`Open account code ${statement.account.code}`}
            >
              {statement.account.code}
            </Link>
            <span className="ml-1.5 font-normal text-default-500 dark:text-gray-400">
              {statement.account.description}
            </span>
          </span>
          <span className="text-default-300 dark:text-gray-600">•</span>
          <span
            className="text-default-600 dark:text-gray-300"
            title={
              statement.opening_source?.type === "anchored"
                ? `Anchored as of ${formatDate(statement.opening_source.as_of_date)}`
                : "Derived from prior postings"
            }
          >
            Opening{" "}
            <span className="font-semibold text-default-700 dark:text-gray-200">
              {formatBalance(statement.opening_balance)}
            </span>
            {statement.opening_source?.type === "anchored" && (
              <IconAnchor
                size={13}
                className="inline-block ml-1 -mt-0.5 text-sky-500 dark:text-sky-400"
              />
            )}
          </span>
          <span className="text-default-300 dark:text-gray-600">•</span>
          <span className="text-default-600 dark:text-gray-300">
            Dr {formatCurrency(statement.totals.debit)} / Cr{" "}
            {formatCurrency(statement.totals.credit)}
          </span>
          <span className="text-default-300 dark:text-gray-600">•</span>
          <span className="text-default-600 dark:text-gray-300">
            Closing{" "}
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
              {formatBalance(statement.closing_balance)}
            </span>
          </span>
          <span className="text-default-300 dark:text-gray-600">•</span>
          <span className="text-default-500 dark:text-gray-400">
            {statement.totals.count} transactions
          </span>
          {(statement.unapplied_overpayment ?? 0) > 0.005 && (
            <>
              <span className="text-default-300 dark:text-gray-600">•</span>
              <span
                className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"
                title="Non-posting: overpaid amount held in CUST_DEP (Customer Deposits). Not part of this ledger's lines or balances."
              >
                Overpayment held: RM{" "}
                {formatCurrency(statement.unapplied_overpayment ?? 0)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Launch state: recent ledgers quick access, then a paginated browse-all grid */}
      {!selectedAccount && (
        <>
          {recentLedgers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-3">
              <IconHistory size={16} className="text-default-400 dark:text-gray-500" />
              <h2 className="text-sm font-semibold text-default-700 dark:text-gray-200">
                Recent ledgers
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {recentLedgers.map((entry) => (
                <div
                  key={entry.code}
                  onClick={() => handleAccountChange(entry.code)}
                  className="group flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-default-200 dark:border-gray-700 hover:border-sky-400 dark:hover:border-sky-600 hover:bg-sky-50/50 dark:hover:bg-sky-900/20 cursor-pointer transition-colors"
                  title={`Open ${entry.code} ledger`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold font-mono text-default-800 dark:text-gray-100 truncate">
                      {entry.code}
                    </div>
                    <div className="text-xs text-default-500 dark:text-gray-400 truncate">
                      {accountDescriptionByCode[entry.code] || " "}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-default-400 dark:text-gray-500 whitespace-nowrap">
                      {formatDistanceToNow(new Date(entry.openedAt), {
                        addSuffix: true,
                      })}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveRecent(entry.code);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-default-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
                      title="Remove from recent"
                    >
                      <IconX size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Browse all accounts: paginated cards for quick selection without typing */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-default-700 dark:text-gray-200">
                All accounts
              </h2>
              {browsableAccounts.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setBrowsePage((p) => Math.max(1, p - 1))}
                    disabled={browsePageClamped <= 1}
                    className="p-1 rounded text-default-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-default-500 dark:disabled:hover:text-gray-400 transition-colors"
                    title="Previous page"
                  >
                    <IconChevronLeft size={16} />
                  </button>
                  <span className="text-xs text-default-500 dark:text-gray-400 whitespace-nowrap">
                    Page {browsePageClamped} of {browseTotalPages}
                  </span>
                  <button
                    onClick={() =>
                      setBrowsePage((p) => Math.min(browseTotalPages, p + 1))
                    }
                    disabled={browsePageClamped >= browseTotalPages}
                    className="p-1 rounded text-default-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-default-500 dark:disabled:hover:text-gray-400 transition-colors"
                    title="Next page"
                  >
                    <IconChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>

            {accountsLoading ? (
              <div className="flex items-center justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : browsableAccounts.length === 0 ? (
              <p className="text-sm text-default-500 dark:text-gray-400 text-center py-6">
                No active accounts found
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {browsedAccounts.map((account) => (
                  <div
                    key={account.code}
                    onClick={() => handleAccountChange(account.code)}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-default-200 dark:border-gray-700 hover:border-sky-400 dark:hover:border-sky-600 hover:bg-sky-50/50 dark:hover:bg-sky-900/20 cursor-pointer transition-colors"
                    title={`Open ${account.code} ledger`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold font-mono text-default-800 dark:text-gray-100 truncate">
                        {account.code}
                      </div>
                      <div className="text-xs text-default-500 dark:text-gray-400 truncate">
                        {account.description}
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                      {account.ledger_type && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-default-400 dark:text-gray-500">
                          {account.ledger_type}
                        </span>
                      )}
                      {!!usageCounts[account.code] && (
                        <span
                          className="text-[10px] text-sky-600 dark:text-sky-400"
                          title="Posted transactions"
                        >
                          {usageCounts[account.code]}×
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {loading && !statement && selectedAccount && (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      )}

      {/* Ledger Table */}
      {statement && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300 w-28">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300 w-36">
                    Journal
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300">
                    Particulars
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300 w-28">
                    Cheque
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300 w-32">
                    Debit (RM)
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300 w-32">
                    Credit (RM)
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300 w-40">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {/* Opening balance row (hidden while the mini search filters rows) */}
                {!hasActiveSearch && (
                  <tr className="bg-gray-50/70 dark:bg-gray-900/40">
                    <td colSpan={4} className="px-4 py-2.5 font-medium text-gray-700 dark:text-gray-300">
                      Balance Brought Forward
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                      {statement.opening_balance > 0
                        ? formatCurrency(statement.opening_balance)
                        : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                      {statement.opening_balance < 0
                        ? formatCurrency(Math.abs(statement.opening_balance))
                        : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                      {formatBalance(statement.opening_balance)}
                    </td>
                  </tr>
                )}

                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      {hasActiveSearch
                        ? "No transactions match your search"
                        : "No transactions in this period"}
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((t) => (
                    <tr
                      key={t.line_id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatDate(t.entry_date)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenJournal(t.journal_entry_id)}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:underline"
                          title="Open journal entry"
                        >
                          {t.reference_no}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                        {t.particulars}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {t.cheque_no || "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                        {t.debit > 0 ? formatCurrency(t.debit) : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                        {t.credit > 0 ? formatCurrency(t.credit) : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-900 dark:text-white whitespace-nowrap">
                        {formatBalance(t.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-gray-100 dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-600 sticky bottom-0">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 font-bold text-gray-900 dark:text-white text-right">
                    PERIOD TOTALS:
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white">
                    {formatCurrency(statement.totals.debit)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white">
                    {formatCurrency(statement.totals.credit)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white whitespace-nowrap">
                    {formatBalance(statement.closing_balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary Footer */}
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
              <span>
                {hasActiveSearch
                  ? `Showing ${filteredTransactions.length} of ${statement.totals.count} transactions · Dr ${formatCurrency(
                      shownTotals.debit
                    )} / Cr ${formatCurrency(shownTotals.credit)}`
                  : `${statement.totals.count} transactions`}
              </span>
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
