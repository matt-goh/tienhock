// src/pages/Accounting/OpeningBalancesPage.tsx
// Bulk opening-balance sheet: every GL account's anchor for ONE as-of date on a
// single screen, laid out like the auditor's "Opening balances as at ..."
// schedule (code / particulars / Debit RM / Credit RM, grouped by financial
// statement note, Dr and Cr totalled at the bottom).
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
} from "@tabler/icons-react";
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
import toast from "react-hot-toast";

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

const readStoredCollapsedSections = (): string[] => {
  if (typeof window === "undefined") return [];

  try {
    const stored: string | null = window.localStorage.getItem(
      COLLAPSED_SECTIONS_STORAGE_KEY
    );
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key: unknown): key is string => typeof key === "string");
  } catch (_error: unknown) {
    return [];
  }
};

const storeCollapsedSections = (collapsed: Set<string>): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      COLLAPSED_SECTIONS_STORAGE_KEY,
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
  onChange: (code: string, next: DraftRow) => void;
}

// Memoised so typing in one cell doesn't re-render the whole sheet (the "all
// accounts" view is a few thousand rows).
const BalanceRow: React.FC<BalanceRowProps> = React.memo(
  ({ account, draft, showNotes, isDirty, disabled, onChange }) => {
    const invalid: boolean = !isDraftValid(draft);
    const willDelete: boolean =
      account.amount !== null &&
      draft.debit.trim() === "" &&
      draft.credit.trim() === "";

    return (
      <tr
        className={clsx(
          "hover:bg-gray-50 dark:hover:bg-gray-700/50",
          willDelete && "bg-rose-50/60 dark:bg-rose-900/20",
          !willDelete && isDirty && "bg-amber-50/60 dark:bg-amber-900/20"
        )}
      >
        <td className="px-3 py-1 font-mono text-xs text-default-800 dark:text-gray-200 whitespace-nowrap">
          {account.code}
          {!account.is_active && (
            <span className="ml-1.5 text-[10px] uppercase text-rose-500 dark:text-rose-400">
              inactive
            </span>
          )}
        </td>
        <td className="px-3 py-1 text-default-700 dark:text-gray-300">
          {account.description}
          {account.other_anchor_count > 0 && (
            <span
              className="ml-1.5 text-[10px] text-sky-600 dark:text-sky-400"
              title={`${account.other_anchor_count} anchor(s) on other dates`}
            >
              +{account.other_anchor_count}
            </span>
          )}
        </td>
        <td className="px-2 py-1 w-36">
          <input
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
              placeholder="Notes"
              onChange={(e) =>
                onChange(account.code, { ...draft, notes: e.target.value })
              }
              className={clsx(inputClasses, "text-left")}
            />
          </td>
        )}
        <td className="px-2 py-1 w-10 text-center">
          {(draft.debit.trim() !== "" ||
            draft.credit.trim() !== "" ||
            draft.notes !== "") && (
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(account.code, { debit: "", credit: "", notes: "" })
              }
              title="Clear this row (removes the opening balance on save)"
              className="text-default-400 dark:text-gray-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
            >
              <IconX size={14} />
            </button>
          )}
        </td>
      </tr>
    );
  }
);
BalanceRow.displayName = "BalanceRow";

const OpeningBalancesPage: React.FC = () => {
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
    () => new Set(readStoredCollapsedSections())
  );
  // The sticky header is a variable height (filters wrap on narrow screens), so
  // the table head has to be offset by whatever it currently measures.
  const [pageHeaderHeight, setPageHeaderHeight] = useState<number>(0);
  const pageHeaderRef = useRef<HTMLDivElement | null>(null);

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
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

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

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
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
  }, [asOfDate, rowFilter, searchTerm, includeInactive, showNotes]);

  // Preserve the collapsed note sections across navigations.
  useEffect(() => {
    storeCollapsedSections(collapsedSections);
  }, [collapsedSections]);

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
    const params = new URLSearchParams();
    params.set("as_of_date", asOfDate);
    params.set("filter", rowFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (includeInactive) params.set("include_inactive", "true");

    try {
      setLoading(true);
      setError(null);
      const response = await api.get<OpeningBalancesResponse>(
        `/api/opening-balances?${params.toString()}`
      );
      setData(response);
      const nextDrafts: Record<string, DraftRow> = {};
      response.accounts.forEach((account) => {
        nextDrafts[account.code] = toDraft(account);
      });
      setDrafts(nextDrafts);
    } catch (err) {
      console.error("Error fetching opening balances:", err);
      setError("Failed to fetch opening balances. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [asOfDate, rowFilter, debouncedSearch, includeInactive]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  useScrollRestoration("opening-balances", !loading && !!data);

  const handleDraftChange = useCallback(
    (code: string, next: DraftRow): void => {
      setDrafts((prev) => ({ ...prev, [code]: next }));
    },
    []
  );

  const handleDateChange = (start: Date): void => {
    const next: string = format(start, "yyyy-MM-dd");
    if (next === asOfDate) return;
    if (hasUnsavedChanges) {
      toast.error("Save or discard your changes before switching date");
      return;
    }
    setAsOfDate(next);
  };

  const handleDiscard = (): void => {
    setDrafts(originals);
    setShowDiscardDialog(false);
  };

  const handleSave = async (): Promise<void> => {
    if (!hasUnsavedChanges) return;
    if (invalidCount > 0) {
      toast.error("Fix the highlighted amounts before saving");
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
        "/api/opening-balances/bulk",
        { as_of_date: asOfDate, entries }
      );
      const parts: string[] = [];
      if (result.saved) parts.push(`${result.saved} saved`);
      if (result.deleted) parts.push(`${result.deleted} removed`);
      toast.success(
        `Opening balances updated${parts.length ? ` (${parts.join(", ")})` : ""}`
      );
      await fetchBalances();
    } catch (err: any) {
      console.error("Error saving opening balances:", err);
      toast.error(err?.message || "Failed to save opening balances");
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
    if (!data) return;
    if (hasUnsavedChanges) {
      toast.error("Save your changes before printing");
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
      });
    } catch (err) {
      console.error("Error printing opening balances PDF:", err);
      toast.error("Failed to generate PDF");
    } finally {
      setExporting(false);
    }
  };

  const dateTotals = data?.date_totals;
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
            placeholder="As of date"
            pickerPlacement="bottom-left"
          />

          {/* Existing anchor dates as one-click chips */}
          {(data?.available_dates || []).map((entry) => (
            <button
              key={entry.as_of_date}
              type="button"
              onClick={() => handleDateChange(parseLocalDate(entry.as_of_date)!)}
              className={clsx(
                "px-2 py-1 rounded-full text-xs border transition-colors",
                entry.as_of_date === asOfDate
                  ? "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-600 dark:bg-sky-900/30 dark:text-sky-300"
                  : "border-default-200 text-default-600 hover:border-sky-300 dark:border-gray-700 dark:text-gray-400"
              )}
              title={`${entry.count} opening balances on this date`}
            >
              {formatDisplayDate(entry.as_of_date)} ({entry.count})
            </button>
          ))}

          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            {/* Searching reloads the sheet, so it is locked while edits are
                pending rather than silently discarding them. */}
            <input
              type="text"
              placeholder="Search code or description..."
              value={searchTerm}
              disabled={hasUnsavedChanges}
              title={
                hasUnsavedChanges
                  ? "Save or discard your changes before searching"
                  : undefined
              }
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-56 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <Listbox
            value={rowFilter}
            onChange={(value: RowFilter) => {
              if (hasUnsavedChanges) {
                toast.error("Save or discard your changes before filtering");
                return;
              }
              setRowFilter(value);
            }}
          >
            <div className="relative">
              <ListboxButton className="relative w-56 cursor-pointer rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 pl-8 pr-8 text-left text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <IconFilter className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <span className="block truncate">
                  {FILTER_OPTIONS.find((o) => o.value === rowFilter)?.label}
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
                            {option.label}
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
                toast.error("Save or discard your changes first");
                return;
              }
              setIncludeInactive(checked);
            }}
            label="Inactive"
            size={18}
            className="flex-shrink-0"
          />
          <Checkbox
            checked={showNotes}
            onChange={setShowNotes}
            label="Notes"
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
              Discard
            </Button>
          )}
          <Button
            size="sm"
            variant="filled"
            color="sky"
            icon={IconDeviceFloppy}
            iconSize={16}
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
          >
            {saving
              ? "Saving..."
              : hasUnsavedChanges
                ? `Save ${dirtyCodes.length} change${
                    dirtyCodes.length === 1 ? "" : "s"
                  }`
                : "Saved"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={allSectionsCollapsed ? IconChevronRight : IconChevronDown}
            iconSize={16}
            onClick={handleToggleAllSections}
            disabled={sections.length === 0}
          >
            {allSectionsCollapsed ? "Expand all" : "Collapse all"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={IconRefresh}
            iconSize={16}
            onClick={fetchBalances}
            disabled={loading || saving}
            title="Refresh"
            additionalClasses={loading ? "[&_svg]:animate-spin" : ""}
          />
          <Button
            size="sm"
            variant="outline"
            icon={IconPrinter}
            iconSize={16}
            onClick={handlePrintPDF}
            disabled={exporting || !data}
          >
            {exporting ? "Preparing..." : "Print"}
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
                ? "Opening balances are balanced"
                : `Out of balance by RM ${formatCurrency(
                    Math.abs(dateTotals.difference)
                  )}`}
            </span>
            <span className="text-default-600 dark:text-gray-300">
              · {dateTotals.count} accounts as at {formatDisplayDate(asOfDate)}
            </span>
          </div>
          <div className="text-default-600 dark:text-gray-300">
            Dr {formatCurrency(dateTotals.debit)} / Cr{" "}
            {formatCurrency(dateTotals.credit)}
          </div>
        </div>
      )}
      </div>

      {error && (
        <div className="mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner />
        </div>
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
                    Code
                  </th>
                  <th
                    style={{ top: pageHeaderHeight }}
                    className={clsx(headerCellClasses, "text-left")}
                  >
                    Particulars
                  </th>
                  <th
                    style={{ top: pageHeaderHeight }}
                    className={clsx(headerCellClasses, "text-right w-36")}
                  >
                    Debit (RM)
                  </th>
                  <th
                    style={{ top: pageHeaderHeight }}
                    className={clsx(headerCellClasses, "text-right w-36")}
                  >
                    Credit (RM)
                  </th>
                  {showNotes && (
                    <th
                      style={{ top: pageHeaderHeight }}
                      className={clsx(headerCellClasses, "text-left w-64")}
                    >
                      Notes
                    </th>
                  )}
                  <th
                    style={{ top: pageHeaderHeight }}
                    className={clsx(headerCellClasses, "w-10 rounded-tr-lg")}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sections.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      No accounts match the current filters
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
                            ? `Show ${section.name}`
                            : `Hide ${section.name}`
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
                                Note {section.note}
                              </span>
                            )}
                            <span className="font-normal text-xs text-default-400 dark:text-gray-500">
                              ({section.accounts.length})
                            </span>
                            {counts.dirty > 0 && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {counts.dirty} unsaved
                              </span>
                            )}
                            {counts.invalid > 0 && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                {counts.invalid} invalid
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
                            disabled={saving}
                            onChange={handleDraftChange}
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
                    TOTALS (shown rows):
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
              {data?.accounts.length || 0} accounts shown ·{" "}
              {data?.shown_totals.count || 0} with an opening balance
              {invalidCount > 0 && (
                <span className="ml-2 text-rose-600 dark:text-rose-400">
                  {invalidCount} invalid amount{invalidCount === 1 ? "" : "s"}
                </span>
              )}
            </span>
            <span>
              Clearing both cells removes that account's opening balance when you
              save.
            </span>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDiscardDialog}
        onClose={() => setShowDiscardDialog(false)}
        onConfirm={handleDiscard}
        title="Discard changes"
        message={`Discard ${dirtyCodes.length} unsaved change${
          dirtyCodes.length === 1 ? "" : "s"
        }?`}
        confirmButtonText="Discard"
        variant="danger"
      />
    </div>
  );
};

export default OpeningBalancesPage;
