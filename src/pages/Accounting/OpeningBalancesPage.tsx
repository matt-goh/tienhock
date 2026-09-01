// src/pages/Accounting/OpeningBalancesPage.tsx
// Bulk opening-balance sheet: every GL account's anchor for ONE as-of date on a
// single screen, laid out like the auditor's "Opening balances as at ..."
// schedule (code / particulars / Debit RM / Credit RM, grouped by financial
// statement note, Dr and Cr totalled at the bottom). Parametrised by company so
// the same screen serves Tien Hock (public schema) and Green Target
// (greentarget schema, swapped base path + scoped localStorage).
//
// Replaces the one-account-at-a-time OpeningBalanceModal flow: type into the
// Debit or Credit cell of any row, then save every change in one transaction.
// Clearing both cells of an anchored account removes that anchor on save.
import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  IconSearch,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFilter,
  IconX,
  IconDeviceFloppy,
  IconAlertTriangle,
  IconLock,
  IconPencil,
  IconPlus,
} from "@tabler/icons-react";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { format } from "date-fns";
import Button from "../../components/Button";
import Checkbox from "../../components/Checkbox";
import LoadingSpinner from "../../components/LoadingSpinner";
import TimeNavigator from "../../components/TimeNavigator";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import {
  generateOpeningBalancesPDF,
  type OpeningBalancesPDFSection,
} from "../../utils/accounting/OpeningBalancesPDF";
import { GREENTARGET_INFO } from "../../utils/invoice/einvoice/companyInfo";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

export type OpeningBalancesCompany = "tienhock" | "greentarget";

interface OpeningBalancesPageProps {
  company?: OpeningBalancesCompany;
}

interface OpeningBalanceAccount {
  code: string;
  description: string;
  ledger_type: string;
  parent_code: string | null;
  sort_order: number;
  is_active: boolean;
  fs_note: string | null;
  note_name: string | null;
  note_category: string | null;
  note_report_section: string | null;
  note_sort_order: number | null;
  amount: number | null;
  notes: string | null;
  updated_at: string | null;
  other_anchor_count: number;
  opening_balance_write_allowed?: boolean;
}

interface OpeningBalancesResponse {
  as_of_date: string;
  accounts: OpeningBalanceAccount[];
  shown_totals: { debit: number; credit: number; count: number };
  date_totals: {
    count: number;
    debit: number;
    credit: number;
    difference: number;
  };
  available_dates: { as_of_date: string; count: number }[];
  editability?: {
    allowed: boolean;
    reason_code: string | null;
    open_date: string | null;
  };
}

interface AccountCodeFormNavigationState {
  returnToOpeningBalances: {
    company: OpeningBalancesCompany;
    asOfDate: string;
  };
  prefill?: {
    fsNote?: string;
    code?: string;
  };
}

interface OpeningBalancesNavigationState {
  openingBalanceAccount?: {
    company: OpeningBalancesCompany;
    asOfDate: string;
    code: string;
  };
}

// One row's editable state. Debit/Credit are kept as raw strings so a
// half-typed value ("1234.") never round-trips through a number.
interface DraftRow {
  debit: string;
  credit: string;
  notes: string;
}

type RowFilter = "anchored" | "all" | "unanchored";

const FILTER_OPTIONS: { value: RowFilter; label: string }[] = [
  { value: "anchored", label: "With opening balance" },
  { value: "all", label: "All accounts" },
  { value: "unanchored", label: "Without opening balance" },
];

const STORAGE_KEY = "openingBalancesFilters";

// The folded note sections are preserved under their own key rather than inside
// the filter blob, so the two can never invalidate each other. An empty array
// (everything expanded) is a real state, so a missing key is the only default.
const COLLAPSED_SECTIONS_STORAGE_KEY = "openingBalances.collapsedSections";

const getCompanyStorageKey = (
  baseKey: string,
  company: OpeningBalancesCompany
): string => (company === "tienhock" ? baseKey : `${baseKey}:${company}`);

const readStoredCollapsedSections = (
  company: OpeningBalancesCompany
): string[] => {
  if (typeof window === "undefined") return [];

  try {
    const stored: string | null = window.localStorage.getItem(
      getCompanyStorageKey(COLLAPSED_SECTIONS_STORAGE_KEY, company)
    );
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key: unknown): key is string => typeof key === "string");
  } catch (_error: unknown) {
    return [];
  }
};

const storeCollapsedSections = (
  collapsed: Set<string>,
  company: OpeningBalancesCompany
): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getCompanyStorageKey(COLLAPSED_SECTIONS_STORAGE_KEY, company),
      JSON.stringify([...collapsed])
    );
  } catch (_error: unknown) {
    // Best-effort when browser storage is unavailable.
  }
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

// 'yyyy-MM-dd' -> local Date (never new Date(string), which parses as UTC)
const parseLocalDate = (s: string): Date | null => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const formatDisplayDate = (iso: string): string => {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
};

// Signed anchor amount (DR-positive) -> the two visible cells.
const toDraft = (account: OpeningBalanceAccount): DraftRow => {
  if (account.amount === null) {
    return { debit: "", credit: "", notes: account.notes || "" };
  }
  // A 0.00 anchor is meaningful (an explicit zero fence), so it shows in Debit
  // rather than reading as "no anchor".
  if (account.amount < 0) {
    return {
      debit: "",
      credit: Math.abs(account.amount).toFixed(2),
      notes: account.notes || "",
    };
  }
  return {
    debit: account.amount.toFixed(2),
    credit: "",
    notes: account.notes || "",
  };
};

// The two cells -> the signed amount to persist. null = no anchor (delete).
const draftToAmount = (draft: DraftRow): number | null => {
  const debit = draft.debit.trim();
  const credit = draft.credit.trim();
  if (debit !== "") return Number(debit);
  if (credit !== "") return -Number(credit);
  return null;
};

const isDraftValid = (draft: DraftRow): boolean => {
  const debit = draft.debit.trim();
  const credit = draft.credit.trim();
  if (debit !== "" && (isNaN(Number(debit)) || Number(debit) < 0)) return false;
  if (credit !== "" && (isNaN(Number(credit)) || Number(credit) < 0))
    return false;
  return true;
};

const draftsEqual = (a: DraftRow, b: DraftRow): boolean => {
  const amountA = isDraftValid(a) ? draftToAmount(a) : NaN;
  const amountB = isDraftValid(b) ? draftToAmount(b) : NaN;
  const sameAmount =
    amountA === null && amountB === null
      ? true
      : amountA !== null && amountB !== null
        ? Math.abs(amountA - amountB) < 0.005
        : false;
  return sameAmount && (a.notes || "") === (b.notes || "");
};

// Accounts sharing one effective financial-statement note print together, the
// way the auditor's schedule groups "Non-current assets", "Trade receivables"...
interface NoteSection {
  key: string;
  note: string | null;
  name: string;
  reportSection: string | null;
  accounts: OpeningBalanceAccount[];
}

const inputClasses: string =
  "w-full h-8 px-2 rounded border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 text-right text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors";

// Each header cell sticks on its own and carries its own background, so the
// rows scrolling underneath never show through.
const headerCellClasses: string =
  "sticky z-20 bg-gray-50 dark:bg-gray-900 px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700";

const footerCellClasses: string =
  "sticky bottom-0 z-20 bg-gray-100 dark:bg-gray-900 px-3 py-2.5 font-bold text-gray-900 dark:text-white border-t-2 border-gray-300 dark:border-gray-600";

interface BalanceRowProps {
  account: OpeningBalanceAccount;
  draft: DraftRow;
  showNotes: boolean;
  isDirty: boolean;
  disabled: boolean;
  clearDisabled: boolean;
  editDisabled: boolean;
  showSetBalanceHint: boolean;
  showManagedElsewhereHint: boolean;
  shouldFocus: boolean;
  onChange: (code: string, next: DraftRow) => void;
  onEditAccount: (code: string) => void;
  onFocusComplete: (code: string) => void;
}

// Memoised so typing in one cell doesn't re-render the whole sheet (the "all
// accounts" view is a few thousand rows).
const BalanceRow: React.FC<BalanceRowProps> = React.memo(
  ({
    account,
    draft,
    showNotes,
    isDirty,
    disabled,
    clearDisabled,
    editDisabled,
    showSetBalanceHint,
    showManagedElsewhereHint,
    shouldFocus,
    onChange,
    onEditAccount,
    onFocusComplete,
  }) => {
    const { t } = useTranslation("accounting");
    const rowRef = useRef<HTMLTableRowElement | null>(null);
    const debitInputRef = useRef<HTMLInputElement | null>(null);
    const invalid: boolean = !isDraftValid(draft);
    const willDelete: boolean =
      account.amount !== null &&
      draft.debit.trim() === "" &&
      draft.credit.trim() === "";

    useEffect(() => {
      if (!shouldFocus) return;
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!disabled) debitInputRef.current?.focus();
      onFocusComplete(account.code);
    }, [account.code, disabled, onFocusComplete, shouldFocus]);

    return (
      <tr
        ref={rowRef}
        className={clsx(
          "hover:bg-gray-50 dark:hover:bg-gray-700/50",
          willDelete && "bg-rose-50/60 dark:bg-rose-900/20",
          !willDelete && isDirty && "bg-amber-50/60 dark:bg-amber-900/20",
          shouldFocus && "bg-sky-50 dark:bg-sky-900/20"
        )}
      >
        <td className="px-3 py-1 font-mono text-xs text-default-800 dark:text-gray-200 whitespace-nowrap">
          <button
            type="button"
            disabled={editDisabled}
            onClick={() => onEditAccount(account.code)}
            title={t("Edit Account Code")}
            className="cursor-pointer text-left transition-colors hover:text-sky-600 hover:underline focus-visible:text-sky-600 focus-visible:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50 dark:hover:text-sky-400 dark:focus-visible:text-sky-400"
          >
            {account.code}
          </button>
          {!account.is_active && (
            <span className="ml-1.5 text-[10px] uppercase text-rose-500 dark:text-rose-400">
              {t("inactive")}
            </span>
          )}
        </td>
        <td className="px-3 py-1 text-default-700 dark:text-gray-300">
          <button
            type="button"
            disabled={editDisabled}
            onClick={() => onEditAccount(account.code)}
            title={t("Edit Account Code")}
            className="cursor-pointer text-left transition-colors hover:text-sky-600 hover:underline focus-visible:text-sky-600 focus-visible:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50 dark:hover:text-sky-400 dark:focus-visible:text-sky-400"
          >
            {account.description}
          </button>
          {showSetBalanceHint && (
            <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
              {t("Set opening balance")}
            </span>
          )}
          {showManagedElsewhereHint && (
            <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {t("Opening balance is managed elsewhere")}
            </span>
          )}
          {account.other_anchor_count > 0 && (
            <span
              className="ml-1.5 text-[10px] text-sky-600 dark:text-sky-400"
              title={t("{{count}} anchor(s) on other dates", {
                count: account.other_anchor_count,
              })}
            >
              +{account.other_anchor_count}
            </span>
          )}
        </td>
        <td className="px-2 py-1 w-36">
          <input
            ref={debitInputRef}
            type="text"
            inputMode="decimal"
            value={draft.debit}
            disabled={disabled}
            placeholder="-"
            onChange={(e) =>
              onChange(account.code, {
                ...draft,
                debit: e.target.value,
                credit: e.target.value.trim() !== "" ? "" : draft.credit,
              })
            }
            className={clsx(
              inputClasses,
              invalid && "border-rose-400 dark:border-rose-500"
            )}
          />
        </td>
        <td className="px-2 py-1 w-36">
          <input
            type="text"
            inputMode="decimal"
            value={draft.credit}
            disabled={disabled}
            placeholder="-"
            onChange={(e) =>
              onChange(account.code, {
                ...draft,
                credit: e.target.value,
                debit: e.target.value.trim() !== "" ? "" : draft.debit,
              })
            }
            className={clsx(
              inputClasses,
              invalid && "border-rose-400 dark:border-rose-500"
            )}
          />
        </td>
        {showNotes && (
          <td className="px-2 py-1 w-64">
            <input
              type="text"
              value={draft.notes}
              disabled={disabled}
              placeholder={t("Notes")}
              onChange={(e) =>
                onChange(account.code, { ...draft, notes: e.target.value })
              }
              className={clsx(inputClasses, "text-left")}
            />
          </td>
        )}
        <td className="px-2 py-1 w-20 text-center">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={editDisabled}
              onClick={() => onEditAccount(account.code)}
              title={t("Edit Account Code")}
              aria-label={t("Edit Account Code")}
              className="text-default-400 transition-colors hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:text-sky-400"
            >
              <IconPencil size={14} />
            </button>
            {(draft.debit.trim() !== "" ||
              draft.credit.trim() !== "" ||
              draft.notes !== "") && (
              <button
                type="button"
                disabled={clearDisabled}
                onClick={() =>
                  onChange(account.code, {
                    debit: "",
                    credit: "",
                    notes: "",
                  })
                }
                title={t(
                  "Clear this row (removes the opening balance on save)"
                )}
                className="text-default-400 dark:text-gray-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
              >
                <IconX size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }
);
BalanceRow.displayName = "BalanceRow";

const OpeningBalancesPage: React.FC<OpeningBalancesPageProps> = ({
  company = "tienhock",
}: OpeningBalancesPageProps) => {
  const { t } = useTranslation("accounting");
  const navigate = useNavigate();
  const location = useLocation();
  const openingBalancesApiPath: string =
    company === "greentarget"
      ? "/greentarget/api/opening-balances"
      : "/api/opening-balances";
  const accountCodesPagePath: string =
    company === "greentarget"
      ? "/greentarget/accounting/account-codes"
      : "/accounting/account-codes";
  const [data, setData] = useState<OpeningBalancesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [showDiscardDialog, setShowDiscardDialog] = useState<boolean>(false);
  // Note sections the user has folded away, restored from the last visit. Keyed
  // by section key, so a reload that returns a different set of notes simply
  // leaves stale keys unused.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(readStoredCollapsedSections(company))
  );
  // The sticky header is a variable height (filters wrap on narrow screens), so
  // the table head has to be offset by whatever it currently measures.
  const [pageHeaderHeight, setPageHeaderHeight] = useState<number>(0);
  const pageHeaderRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fetchRequestIdRef = useRef<number>(0);

  useEffect(() => {
    const headerElement: HTMLDivElement | null = pageHeaderRef.current;
    if (!headerElement) return;

    const updateHeaderHeight = (): void => {
      setPageHeaderHeight(headerElement.getBoundingClientRect().height);
    };

    updateHeaderHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeaderHeight);
      return (): void => window.removeEventListener("resize", updateHeaderHeight);
    }

    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    resizeObserver.observe(headerElement);
    return (): void => resizeObserver.disconnect();
  }, []);

  const cached = useMemo(() => {
    try {
      const raw = localStorage.getItem(
        getCompanyStorageKey(STORAGE_KEY, company)
      );
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [company]);

  const [asOfDate, setAsOfDate] = useState<string>(
    () =>
      (typeof cached?.asOfDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(cached.asOfDate) &&
        cached.asOfDate) ||
      `${new Date().getFullYear()}-01-01`
  );
  const [rowFilter, setRowFilter] = useState<RowFilter>(
    () => (cached?.rowFilter as RowFilter) || "anchored"
  );
  const [searchTerm, setSearchTerm] = useState<string>(
    () => cached?.searchTerm || ""
  );
  const [debouncedSearch, setDebouncedSearch] = useState<string>(
    () => cached?.searchTerm || ""
  );
  const [includeInactive, setIncludeInactive] = useState<boolean>(
    () => cached?.includeInactive === true
  );
  const [showNotes, setShowNotes] = useState<boolean>(
    () => cached?.showNotes === true
  );
  const [lookupAllAccounts, setLookupAllAccounts] = useState<boolean>(false);
  const [focusAccountCode, setFocusAccountCode] = useState<string | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const requestKey: string = JSON.stringify([
    asOfDate,
    lookupAllAccounts ? "all" : rowFilter,
    debouncedSearch,
    includeInactive,
  ]);

  // Account creation/editing returns here with a one-shot account code. Search
  // the complete chart so a newly created account is visible before it has an
  // opening balance, then focus its Debit field once the row has loaded.
  useEffect(() => {
    const navigationState: OpeningBalancesNavigationState | null =
      location.state && typeof location.state === "object"
        ? (location.state as OpeningBalancesNavigationState)
        : null;
    const returnedAccount = navigationState?.openingBalanceAccount;
    if (
      !returnedAccount ||
      returnedAccount.company !== company ||
      !/^\d{4}-\d{2}-\d{2}$/.test(returnedAccount.asOfDate) ||
      !returnedAccount.code.trim()
    ) {
      return;
    }

    const normalizedCode: string = returnedAccount.code.trim().toUpperCase();
    fetchRequestIdRef.current += 1;
    setLoading(true);
    setData(null);
    setDrafts({});
    setLoadedRequestKey(null);
    setAsOfDate(returnedAccount.asOfDate);
    setSearchTerm(normalizedCode);
    setDebouncedSearch(normalizedCode);
    setIncludeInactive(true);
    setLookupAllAccounts(true);
    setFocusAccountCode(normalizedCode);
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    });
  }, [
    company,
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(
        getCompanyStorageKey(STORAGE_KEY, company),
        JSON.stringify({
          asOfDate,
          rowFilter,
          searchTerm,
          includeInactive,
          showNotes,
        })
      );
    } catch {
      // Ignore storage failures so the page stays usable.
    }
  }, [asOfDate, rowFilter, searchTerm, includeInactive, showNotes, company]);

  // Preserve the collapsed note sections across navigations.
  useEffect(() => {
    storeCollapsedSections(collapsedSections, company);
  }, [collapsedSections, company]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const originals = useMemo((): Record<string, DraftRow> => {
    const map: Record<string, DraftRow> = {};
    (data?.accounts || []).forEach((account) => {
      map[account.code] = toDraft(account);
    });
    return map;
  }, [data]);

  const dirtyCodes = useMemo((): string[] => {
    return Object.keys(drafts).filter((code) => {
      const original = originals[code];
      if (!original) return false;
      return !draftsEqual(drafts[code], original);
    });
  }, [drafts, originals]);

  const dirtyCodeSet = useMemo(
    (): Set<string> => new Set(dirtyCodes),
    [dirtyCodes]
  );
  const hasUnsavedChanges: boolean = dirtyCodes.length > 0;
  const invalidCount: number = useMemo(
    () => Object.values(drafts).filter((d) => !isDraftValid(d)).length,
    [drafts]
  );
  const searchRequestIsSettled: boolean = searchTerm === debouncedSearch;
  const isCurrentRequestLoaded: boolean =
    searchRequestIsSettled &&
    !loading &&
    !!data &&
    loadedRequestKey === requestKey;
  const isWriteLocked: boolean =
    isCurrentRequestLoaded && data?.editability?.allowed === false;
  const hasExactAccountCodeMatch: boolean = useMemo(
    (): boolean =>
      !!debouncedSearch.trim() &&
      (data?.accounts || []).some(
        (account: OpeningBalanceAccount): boolean =>
          account.code.toUpperCase() === debouncedSearch.trim().toUpperCase()
      ),
    [data, debouncedSearch]
  );
  const shouldOfferCreateAccount: boolean =
    lookupAllAccounts &&
    searchRequestIsSettled &&
    !loading &&
    !!data &&
    loadedRequestKey === requestKey &&
    !hasExactAccountCodeMatch;

  // Warn on tab close / reload while edits are pending.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const fetchBalances = useCallback(async (): Promise<void> => {
    const requestId: number = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;
    const params = new URLSearchParams();
    params.set("as_of_date", asOfDate);
    params.set("filter", lookupAllAccounts ? "all" : rowFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (includeInactive) params.set("include_inactive", "true");

    try {
      setLoading(true);
      setError(null);
      const response = await api.get<OpeningBalancesResponse>(
        `${openingBalancesApiPath}?${params.toString()}`
      );
      if (fetchRequestIdRef.current !== requestId) return;
      setData(response);
      setLoadedRequestKey(requestKey);
      const nextDrafts: Record<string, DraftRow> = {};
      response.accounts.forEach((account) => {
        nextDrafts[account.code] = toDraft(account);
      });
      setDrafts(nextDrafts);
    } catch (err) {
      if (fetchRequestIdRef.current !== requestId) return;
      console.error("Error fetching opening balances:", err);
      setLoadedRequestKey(null);
      setError(t("Failed to fetch opening balances. Please try again later."));
    } finally {
      if (fetchRequestIdRef.current === requestId) setLoading(false);
    }
  }, [
    asOfDate,
    rowFilter,
    debouncedSearch,
    includeInactive,
    lookupAllAccounts,
    openingBalancesApiPath,
    requestKey,
    t,
  ]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  useScrollRestoration(
    company === "tienhock" ? "opening-balances" : `opening-balances:${company}`,
    isCurrentRequestLoaded
  );

  const handleDraftChange = useCallback(
    (code: string, next: DraftRow): void => {
      setDrafts((prev) => ({ ...prev, [code]: next }));
    },
    []
  );

  const handleFocusComplete = useCallback((code: string): void => {
    setFocusAccountCode((currentCode: string | null): string | null =>
      currentCode?.toUpperCase() === code.toUpperCase() ? null : currentCode
    );
  }, []);

  const handleSearchAllAccounts = (): void => {
    if (hasUnsavedChanges) {
      toast.error(t("Save or discard your changes first"));
      return;
    }
    const search: string = searchTerm.trim();
    if (!search) {
      searchInputRef.current?.focus();
      toast.error(t("Enter a code or description first"));
      return;
    }
    if (
      !lookupAllAccounts ||
      !includeInactive ||
      debouncedSearch !== search
    ) {
      setLoading(true);
    }
    setSearchTerm(search);
    setDebouncedSearch(search);
    setIncludeInactive(true);
    setLookupAllAccounts(true);
  };

  const handleCreateAccount = (
    fsNote: string | null = null,
    useSearchAsCode: boolean = false
  ): void => {
    if (hasUnsavedChanges) {
      toast.error(t("Save or discard your changes first"));
      return;
    }

    const trimmedSearch: string = searchTerm.trim();
    const allowedCodePattern: RegExp =
      company === "greentarget"
        ? /^[A-Za-z0-9 ._-]+$/
        : /^[A-Za-z0-9._-]+$/;
    const suggestedCode: string =
      useSearchAsCode &&
      trimmedSearch.length > 0 &&
      allowedCodePattern.test(trimmedSearch)
        ? trimmedSearch.toUpperCase()
        : "";
    const navigationState: AccountCodeFormNavigationState = {
      returnToOpeningBalances: { company, asOfDate },
      ...(fsNote || suggestedCode
        ? {
            prefill: {
              ...(fsNote ? { fsNote } : {}),
              ...(suggestedCode ? { code: suggestedCode } : {}),
            },
          }
        : {}),
    };

    navigate(`${accountCodesPagePath}/new`, { state: navigationState });
  };

  const handleEditAccount = useCallback(
    (code: string): void => {
      if (hasUnsavedChanges) {
        toast.error(t("Save or discard your changes first"));
        return;
      }
      const navigationState: AccountCodeFormNavigationState = {
        returnToOpeningBalances: { company, asOfDate },
      };
      navigate(`${accountCodesPagePath}/${encodeURIComponent(code)}`, {
        state: navigationState,
      });
    },
    [
      accountCodesPagePath,
      asOfDate,
      company,
      hasUnsavedChanges,
      navigate,
      t,
    ]
  );

  const handleDateChange = (start: Date): void => {
    const next: string = format(start, "yyyy-MM-dd");
    if (next === asOfDate) return;
    if (hasUnsavedChanges) {
      toast.error(t("Save or discard your changes before switching date"));
      return;
    }
    setLookupAllAccounts(false);
    setFocusAccountCode(null);
    setAsOfDate(next);
  };

  const handleDiscard = (): void => {
    setDrafts(originals);
    setShowDiscardDialog(false);
  };

  const handleRefresh = (): void => {
    if (hasUnsavedChanges) {
      toast.error(t("Save or discard your changes first"));
      return;
    }
    void fetchBalances();
  };

  const handleSave = async (): Promise<void> => {
    if (!hasUnsavedChanges || !isCurrentRequestLoaded) return;
    if (isWriteLocked) {
      toast.error(
        t("Opening balances for this date are locked and cannot be changed")
      );
      return;
    }
    if (invalidCount > 0) {
      toast.error(t("Fix the highlighted amounts before saving"));
      return;
    }
    setSaving(true);
    try {
      const entries = dirtyCodes.map((code) => ({
        account_code: code,
        amount: draftToAmount(drafts[code]),
        notes: drafts[code].notes.trim() || null,
      }));
      const result = await api.put<{ saved: number; deleted: number }>(
        `${openingBalancesApiPath}/bulk`,
        { as_of_date: asOfDate, entries }
      );
      const parts: string[] = [];
      if (result.saved) {
        parts.push(t("{{count}} saved", { count: result.saved }));
      }
      if (result.deleted) {
        parts.push(t("{{count}} removed", { count: result.deleted }));
      }
      toast.success(
        parts.length
          ? t("Opening balances updated ({{details}})", {
              details: parts.join(", "),
            })
          : t("Opening balances updated")
      );
      await fetchBalances();
    } catch (err: any) {
      console.error("Error saving opening balances:", err);
      toast.error(err?.message || t("Failed to save opening balances"));
    } finally {
      setSaving(false);
    }
  };

  // Group the rows into the note sections used by the printed schedule.
  const sections = useMemo((): NoteSection[] => {
    const map = new Map<string, NoteSection>();
    (data?.accounts || []).forEach((account) => {
      const key: string = account.fs_note || "__none__";
      if (!map.has(key)) {
        map.set(key, {
          key,
          note: account.fs_note,
          name: account.note_name || "Unclassified",
          reportSection: account.note_report_section,
          accounts: [],
        });
      }
      map.get(key)!.accounts.push(account);
    });
    return Array.from(map.values());
  }, [data]);

  useEffect(() => {
    if (!focusAccountCode || !data) return;
    const focusedAccount: OpeningBalanceAccount | undefined =
      data.accounts.find(
        (account: OpeningBalanceAccount): boolean =>
          account.code.toUpperCase() === focusAccountCode.toUpperCase()
      );
    if (!focusedAccount) return;

    const sectionKey: string = focusedAccount.fs_note || "__none__";
    setCollapsedSections((previousSections: Set<string>): Set<string> => {
      if (!previousSections.has(sectionKey)) return previousSections;
      const nextSections = new Set(previousSections);
      nextSections.delete(sectionKey);
      return nextSections;
    });
  }, [data, focusAccountCode]);

  // Section subtotals follow the DRAFT values so the sheet stays arithmetically
  // honest while editing.
  const sectionTotals = useMemo((): Record<
    string,
    { debit: number; credit: number }
  > => {
    const totals: Record<string, { debit: number; credit: number }> = {};
    sections.forEach((section) => {
      const sum = { debit: 0, credit: 0 };
      section.accounts.forEach((account) => {
        const draft: DraftRow | undefined = drafts[account.code];
        if (!draft || !isDraftValid(draft)) return;
        const amount: number | null = draftToAmount(draft);
        if (amount === null) return;
        if (amount >= 0) sum.debit += amount;
        else sum.credit += Math.abs(amount);
      });
      totals[section.key] = sum;
    });
    return totals;
  }, [sections, drafts]);

  const draftTotals = useMemo(() => {
    return Object.values(sectionTotals).reduce(
      (acc, t) => ({ debit: acc.debit + t.debit, credit: acc.credit + t.credit }),
      { debit: 0, credit: 0 }
    );
  }, [sectionTotals]);

  // Pending and invalid rows stay countable while a section is collapsed, so
  // folding a section can never hide work that still blocks the save.
  const sectionRowCounts = useMemo((): Record<
    string,
    { dirty: number; invalid: number }
  > => {
    const counts: Record<string, { dirty: number; invalid: number }> = {};
    sections.forEach((section) => {
      const count = { dirty: 0, invalid: 0 };
      section.accounts.forEach((account) => {
        if (dirtyCodeSet.has(account.code)) count.dirty += 1;
        const draft: DraftRow | undefined = drafts[account.code];
        if (draft && !isDraftValid(draft)) count.invalid += 1;
      });
      counts[section.key] = count;
    });
    return counts;
  }, [sections, drafts, dirtyCodeSet]);

  const allSectionsCollapsed: boolean =
    sections.length > 0 &&
    sections.every((section) => collapsedSections.has(section.key));

  const toggleSection = useCallback((key: string): void => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleToggleAllSections = (): void => {
    setCollapsedSections(
      allSectionsCollapsed
        ? new Set()
        : new Set(sections.map((section) => section.key))
    );
  };

  const handlePrintPDF = async (): Promise<void> => {
    if (!data || !isCurrentRequestLoaded) return;
    if (hasUnsavedChanges) {
      toast.error(t("Save your changes before printing"));
      return;
    }
    setExporting(true);
    try {
      const pdfSections: OpeningBalancesPDFSection[] = sections.map(
        (section) => ({
          note: section.note,
          name: section.name,
          rows: section.accounts
            .filter((account) => account.amount !== null)
            .map((account) => ({
              code: account.code,
              description: account.description,
              amount: account.amount as number,
            })),
        })
      );
      await generateOpeningBalancesPDF({
        asOfDate,
        sections: pdfSections.filter((section) => section.rows.length > 0),
        companyName:
          company === "greentarget" ? GREENTARGET_INFO.name : undefined,
      });
    } catch (err) {
      console.error("Error printing opening balances PDF:", err);
      toast.error(t("Failed to generate PDF"));
    } finally {
      setExporting(false);
    }
  };

  const dateTotals = isCurrentRequestLoaded ? data?.date_totals : undefined;
  const isBalanced: boolean =
    !!dateTotals && Math.abs(dateTotals.difference) < 0.005;
  const colSpan: number = showNotes ? 6 : 5;

  return (
    <div className="w-full">
      {/* Sticky band: the filters, actions and the balance status stay visible
          while the (long) account sheet scrolls underneath. */}
      <div
        ref={pageHeaderRef}
        className="sticky top-0 z-30 -mx-4 -mt-3 mb-3 space-y-2 border-b border-default-200 bg-white/95 px-4 pb-2 pt-3 backdrop-blur dark:border-gray-700 dark:bg-gray-950/95"
      >
      {/* Header: date + filters on the left, actions on the right */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TimeNavigator
            range={{
              start: parseLocalDate(asOfDate),
              end: parseLocalDate(asOfDate),
            }}
            onChange={({ start }) => handleDateChange(start)}
            modes={["day"]}
            presets={false}
            showArrows={false}
            allowFuture
            size="sm"
            placeholder={t("As of date")}
            pickerPlacement="bottom-left"
          />

          {/* Existing anchor dates as one-click chips */}
          {(isCurrentRequestLoaded ? data?.available_dates || [] : []).map(
            (entry) => (
              <button
                key={entry.as_of_date}
                type="button"
                onClick={() =>
                  handleDateChange(parseLocalDate(entry.as_of_date)!)
                }
                className={clsx(
                  "px-2 py-1 rounded-full text-xs border transition-colors",
                  entry.as_of_date === asOfDate
                    ? "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-600 dark:bg-sky-900/30 dark:text-sky-300"
                    : "border-default-200 text-default-600 hover:border-sky-300 dark:border-gray-700 dark:text-gray-400"
                )}
                title={t("{{count}} opening balances on this date", {
                  count: entry.count,
                })}
              >
                {formatDisplayDate(entry.as_of_date)} ({entry.count})
              </button>
            )
          )}

          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            {/* Searching reloads the sheet, so it is locked while edits are
                pending rather than silently discarding them. */}
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("Search code or description...")}
              value={searchTerm}
              disabled={hasUnsavedChanges}
              title={
                hasUnsavedChanges
                  ? t("Save or discard your changes before searching")
                  : undefined
              }
              onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                const nextSearch: string = e.target.value;
                setSearchTerm(nextSearch);
                if (!nextSearch.trim()) {
                  setLookupAllAccounts(false);
                  setFocusAccountCode(null);
                }
              }}
              className="pl-8 pr-8 py-1.5 w-56 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {searchTerm && (
              <button
                type="button"
                disabled={hasUnsavedChanges}
                onClick={(): void => {
                  setSearchTerm("");
                  setDebouncedSearch("");
                  setLookupAllAccounts(false);
                  setFocusAccountCode(null);
                }}
                title={t("Clear search")}
                aria-label={t("Clear search")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-gray-200"
              >
                <IconX size={14} />
              </button>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            variant={lookupAllAccounts ? "filled" : "outline"}
            color="sky"
            onClick={handleSearchAllAccounts}
            disabled={hasUnsavedChanges}
            title={
              hasUnsavedChanges
                ? t("Save or discard your changes before searching")
                : t("Code not listed?")
            }
          >
            {t("Code not listed?")}
          </Button>

          {shouldOfferCreateAccount && (data?.accounts.length || 0) > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              color="sky"
              icon={IconPlus}
              iconSize={15}
              onClick={() => handleCreateAccount(null, true)}
            >
              {t("Add account code")}
            </Button>
          )}

          <Listbox
            value={rowFilter}
            onChange={(value: RowFilter) => {
              if (hasUnsavedChanges) {
                toast.error(t("Save or discard your changes before filtering"));
                return;
              }
              setLookupAllAccounts(false);
              setFocusAccountCode(null);
              setRowFilter(value);
            }}
          >
            <div className="relative">
              <ListboxButton className="relative w-56 cursor-pointer rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 pl-8 pr-8 text-left text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <IconFilter className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <span className="block truncate">
                  {t(
                    FILTER_OPTIONS.find((o) => o.value === rowFilter)?.label ??
                      "All accounts"
                  )}
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <IconChevronDown className="h-4 w-4 text-gray-400" />
                </span>
              </ListboxButton>
              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <ListboxOptions className="absolute z-20 mt-1 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-700 focus:outline-none">
                  {FILTER_OPTIONS.map((option) => (
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
                            className={clsx(
                              "block truncate",
                              selected ? "font-medium" : "font-normal"
                            )}
                          >
                            {t(option.label)}
                          </span>
                          {selected && (
                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                              <IconCheck className="h-4 w-4" />
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

          <Checkbox
            checked={includeInactive}
            onChange={(checked) => {
              if (hasUnsavedChanges) {
                toast.error(t("Save or discard your changes first"));
                return;
              }
              setIncludeInactive(checked);
            }}
            label={t("Inactive")}
            size={18}
            className="flex-shrink-0"
          />
          <Checkbox
            checked={showNotes}
            onChange={setShowNotes}
            label={t("Notes")}
            size={18}
            className="flex-shrink-0"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasUnsavedChanges && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDiscardDialog(true)}
              disabled={saving}
            >
              {t("Discard")}
            </Button>
          )}
          <Button
            size="sm"
            variant="filled"
            color="sky"
            icon={IconDeviceFloppy}
            iconSize={16}
            onClick={handleSave}
            disabled={
              saving ||
              !hasUnsavedChanges ||
              !isCurrentRequestLoaded ||
              isWriteLocked
            }
          >
            {saving
              ? t("Saving...")
              : hasUnsavedChanges
                ? t(
                    dirtyCodes.length === 1
                      ? "Save {{count}} change"
                      : "Save {{count}} changes",
                    { count: dirtyCodes.length }
                  )
                : t("Saved")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={allSectionsCollapsed ? IconChevronRight : IconChevronDown}
            iconSize={16}
            onClick={handleToggleAllSections}
            disabled={!isCurrentRequestLoaded || sections.length === 0}
          >
            {allSectionsCollapsed ? t("Expand all") : t("Collapse all")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={IconRefresh}
            iconSize={16}
            onClick={handleRefresh}
            disabled={loading || saving}
            title={
              hasUnsavedChanges
                ? t("Save or discard your changes first")
                : t("Refresh")
            }
            additionalClasses={loading ? "[&_svg]:animate-spin" : ""}
          />
          <Button
            size="sm"
            variant="outline"
            icon={IconPrinter}
            iconSize={16}
            onClick={handlePrintPDF}
            disabled={exporting || !isCurrentRequestLoaded}
          >
            {exporting ? t("Preparing...") : t("Print")}
          </Button>
        </div>
      </div>

      {/* Balance status for the whole date (not just the filtered rows) */}
      {dateTotals && (
        <div
          className={clsx(
            "px-4 py-2.5 rounded-lg border flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm",
            isBalanced
              ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
              : "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800"
          )}
        >
          <div className="flex items-center gap-2">
            {isBalanced ? (
              <IconCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <IconAlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            )}
            <span
              className={clsx(
                "font-medium",
                isBalanced
                  ? "text-green-800 dark:text-green-200"
                  : "text-amber-800 dark:text-amber-200"
              )}
            >
              {isBalanced
                ? t("Opening balances are balanced")
                : t("Out of balance by RM {{amount}}", {
                    amount: formatCurrency(Math.abs(dateTotals.difference)),
                  })}
            </span>
            <span className="text-default-600 dark:text-gray-300">
              {"\u00b7"}{" "}
              {t("{{count}} accounts as at {{date}}", {
                count: dateTotals.count,
                date: formatDisplayDate(asOfDate),
              })}
            </span>
          </div>
          <div className="text-default-600 dark:text-gray-300">
            {t("Dr {{debit}} / Cr {{credit}}", {
              debit: formatCurrency(dateTotals.debit),
              credit: formatCurrency(dateTotals.credit),
            })}
          </div>
        </div>
      )}
      </div>

      {isWriteLocked && data?.editability?.open_date && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <IconLock className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            {t(
              "Green Target opening balances before {{date}} are locked. Choose {{date}} or a later date to add, change, or remove a balance.",
              { date: formatDisplayDate(data.editability.open_date) }
            )}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {!isCurrentRequestLoaded ? (
        !error ? (
          <div className="flex items-center justify-center h-96">
            <LoadingSpinner />
          </div>
        ) : null
      ) : (
        // No overflow wrapper anywhere above the table: an `overflow` ancestor
        // becomes the sticky containing block, which would pin the column
        // header inside the card instead of under the page header.
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div>
            <table className="w-full text-sm">
              {/* Sticky lives on the cells, not the thead/tr — the row wrappers
                  are not reliably stickable. Offset by the page header's height
                  so the columns stack directly beneath it. */}
              <thead>
                <tr>
                  <th
                    style={{ top: pageHeaderHeight }}
                    className={clsx(headerCellClasses, "text-left w-32 rounded-tl-lg")}
                  >
                    {t("Code")}
                  </th>
                  <th
                    style={{ top: pageHeaderHeight }}
                    className={clsx(headerCellClasses, "text-left")}
                  >
                    {t("Particulars")}
                  </th>
                  <th
                    style={{ top: pageHeaderHeight }}
                    className={clsx(headerCellClasses, "text-right w-36")}
                  >
                    {t("Debit (RM)")}
                  </th>
                  <th
                    style={{ top: pageHeaderHeight }}
                    className={clsx(headerCellClasses, "text-right w-36")}
                  >
                    {t("Credit (RM)")}
                  </th>
                  {showNotes && (
                    <th
                      style={{ top: pageHeaderHeight }}
                      className={clsx(headerCellClasses, "text-left w-64")}
                    >
                      {t("Notes")}
                    </th>
                  )}
                  <th
                    style={{ top: pageHeaderHeight }}
                    className={clsx(
                      headerCellClasses,
                      "w-20 text-center rounded-tr-lg"
                    )}
                  >
                    {t("Actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sections.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      {lookupAllAccounts ? (
                        <div className="flex flex-col items-center gap-3">
                          <span>{t("No accounts found")}</span>
                          {shouldOfferCreateAccount && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              color="sky"
                              icon={IconPlus}
                              iconSize={15}
                              onClick={() => handleCreateAccount(null, true)}
                            >
                              {t("Add account code")}
                            </Button>
                          )}
                        </div>
                      ) : (
                        t("No accounts match the current filters")
                      )}
                    </td>
                  </tr>
                ) : (
                  sections.map((section) => {
                    const isCollapsed: boolean = collapsedSections.has(
                      section.key
                    );
                    const counts: { dirty: number; invalid: number } =
                      sectionRowCounts[section.key] || { dirty: 0, invalid: 0 };

                    return (
                    <Fragment key={section.key}>
                      <tr
                        tabIndex={0}
                        aria-expanded={!isCollapsed}
                        title={
                          isCollapsed
                            ? t("Show {{name}}", { name: section.name })
                            : t("Hide {{name}}", { name: section.name })
                        }
                        onClick={() => toggleSection(section.key)}
                        onKeyDown={(
                          e: React.KeyboardEvent<HTMLTableRowElement>
                        ) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSection(section.key);
                          }
                        }}
                        className="bg-gray-100/80 dark:bg-gray-900/60 cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-900"
                      >
                        <td
                          colSpan={2}
                          className="px-3 py-1.5 font-semibold text-default-800 dark:text-gray-100"
                        >
                          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            {isCollapsed ? (
                              <IconChevronRight
                                size={14}
                                className="text-default-500 dark:text-gray-400"
                              />
                            ) : (
                              <IconChevronDown
                                size={14}
                                className="text-default-500 dark:text-gray-400"
                              />
                            )}
                            {section.name}
                            {section.note && (
                              <span className="font-normal text-xs text-default-500 dark:text-gray-400">
                                {t("Note {{note}}", { note: section.note })}
                              </span>
                            )}
                            <span className="font-normal text-xs text-default-400 dark:text-gray-500">
                              ({section.accounts.length})
                            </span>
                            {section.note && (
                              <button
                                type="button"
                                onClick={(
                                  event: React.MouseEvent<HTMLButtonElement>
                                ): void => {
                                  event.stopPropagation();
                                  handleCreateAccount(section.note);
                                }}
                                onKeyDown={(
                                  event: React.KeyboardEvent<HTMLButtonElement>
                                ): void => event.stopPropagation()}
                                title={t("Add account code under {{name}}", {
                                  name: section.name,
                                })}
                                aria-label={t(
                                  "Add account code under {{name}}",
                                  { name: section.name }
                                )}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-300 bg-white text-sky-600 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-700 dark:bg-gray-800 dark:text-sky-400 dark:hover:bg-sky-900/30"
                                disabled={saving || !isCurrentRequestLoaded}
                              >
                                <IconPlus size={13} />
                              </button>
                            )}
                            {counts.dirty > 0 && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {t("{{count}} unsaved", {
                                  count: counts.dirty,
                                })}
                              </span>
                            )}
                            {counts.invalid > 0 && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                {t("{{count}} invalid", {
                                  count: counts.invalid,
                                })}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-default-700 dark:text-gray-200">
                          {sectionTotals[section.key]?.debit
                            ? formatCurrency(sectionTotals[section.key].debit)
                            : ""}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-default-700 dark:text-gray-200">
                          {sectionTotals[section.key]?.credit
                            ? formatCurrency(sectionTotals[section.key].credit)
                            : ""}
                        </td>
                        {showNotes && <td />}
                        <td />
                      </tr>
                      {!isCollapsed &&
                        section.accounts.map((account) => (
                          <BalanceRow
                            key={account.code}
                            account={account}
                            draft={
                              drafts[account.code] || {
                                debit: "",
                                credit: "",
                                notes: "",
                              }
                            }
                            showNotes={showNotes}
                            isDirty={dirtyCodeSet.has(account.code)}
                            disabled={
                              saving ||
                              !isCurrentRequestLoaded ||
                              isWriteLocked ||
                              account.opening_balance_write_allowed === false
                            }
                            clearDisabled={
                              saving || !isCurrentRequestLoaded || isWriteLocked
                            }
                            editDisabled={saving || !isCurrentRequestLoaded}
                            showSetBalanceHint={
                              lookupAllAccounts &&
                              account.amount === null &&
                              account.opening_balance_write_allowed !== false &&
                              !isWriteLocked
                            }
                            showManagedElsewhereHint={
                              account.opening_balance_write_allowed === false
                            }
                            shouldFocus={
                              focusAccountCode?.toUpperCase() ===
                              account.code.toUpperCase()
                            }
                            onChange={handleDraftChange}
                            onEditAccount={handleEditAccount}
                            onFocusComplete={handleFocusComplete}
                          />
                        ))}
                    </Fragment>
                    );
                  })
                )}
              </tbody>
              {/* Same rule as the header: sticky on the cells, not the tfoot */}
              <tfoot>
                <tr>
                  <td
                    colSpan={2}
                    className={clsx(footerCellClasses, "text-right")}
                  >
                    {t("TOTALS (shown rows):")}
                  </td>
                  <td className={clsx(footerCellClasses, "text-right")}>
                    {formatCurrency(draftTotals.debit)}
                  </td>
                  <td className={clsx(footerCellClasses, "text-right")}>
                    {formatCurrency(draftTotals.credit)}
                  </td>
                  {showNotes && <td className={footerCellClasses} />}
                  <td className={footerCellClasses} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 rounded-b-lg flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span>
              {t("{{count}} accounts shown", {
                count: data?.accounts.length || 0,
              })}{" "}
              {"\u00b7"}{" "}
              {t("{{count}} with an opening balance", {
                count: data?.shown_totals.count || 0,
              })}
              {invalidCount > 0 && (
                <span className="ml-2 text-rose-600 dark:text-rose-400">
                  {t(
                    invalidCount === 1
                      ? "{{count}} invalid amount"
                      : "{{count}} invalid amounts",
                    { count: invalidCount }
                  )}
                </span>
              )}
            </span>
            <span>
              {t(
                "Clearing both cells removes that account's opening balance when you save."
              )}
            </span>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDiscardDialog}
        onClose={() => setShowDiscardDialog(false)}
        onConfirm={handleDiscard}
        title={t("Discard changes")}
        message={t(
          dirtyCodes.length === 1
            ? "Discard {{count}} unsaved change?"
            : "Discard {{count}} unsaved changes?",
          { count: dirtyCodes.length }
        )}
        confirmButtonText={t("Discard")}
        variant="danger"
      />
    </div>
  );
};

export default OpeningBalancesPage;
