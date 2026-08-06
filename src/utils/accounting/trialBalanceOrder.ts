// src/utils/accounting/trialBalanceOrder.ts
//
// Trial Balance ordering shared by the Trial Balance page and its PDF export.
//
// Two modes:
// - "custom"   – the user's own order over every active chart account code.
//   When no custom order has been saved yet, the report keeps each company's
//   natural default order (Tien Hock: alphabetical code with Trade Debtors
//   last; Green Target: account_codes.sort_order, which is the printed line
//   number).
// - "standard" – a fixed accounting-practice order that is intentionally
//   locked in code (not editable in the UI): balance-sheet accounts first
//   (assets, liabilities, equity), then income-statement accounts (revenues,
//   expenses), ascending by account code inside each group. To change the
//   standard order, edit STANDARD_CATEGORY_ORDER below.
import type { AccountCode } from "../../types/types";

export type TrialBalanceCompany = "tienhock" | "greentarget";
export type TrialBalanceOrderMode = "custom" | "standard";

export interface TrialBalanceOrderPreference {
  mode: TrialBalanceOrderMode;
  /** Custom order over all orderable chart codes; empty = natural default. */
  codes: string[];
}

export interface FinancialStatementNoteLike {
  code: string;
  category: string;
  report_section?: string;
}

/** Minimal row shape needed to re-order trial balance accounts. */
export interface TrialBalanceOrderableRow {
  code: string;
  ledger_type: string | null;
  fs_note?: string | null;
  sort_order?: number | null;
}

/**
 * Ledger types whose many child accounts never need individual ordering
 * (customer debtors, stock variants, creditor sub-ledgers). In the order
 * modal they are shown as one draggable group with a member count; members
 * keep their natural order inside the group.
 */
export const GROUPED_LEDGER_TYPES: readonly string[] = ["TD", "CS", "OS", "TC"];

export interface TrialBalanceOrderAccountItem {
  kind: "account";
  code: string;
}

export interface TrialBalanceOrderGroupItem {
  kind: "group";
  ledgerType: string;
}

export type TrialBalanceOrderItem =
  | TrialBalanceOrderAccountItem
  | TrialBalanceOrderGroupItem;

export interface TrialBalanceStandardSection {
  /** fs-note category: asset / liability / equity / drawings / revenue / cogs / expense / unclassified. */
  category: string;
  items: TrialBalanceOrderItem[];
}

export const DEFAULT_TRIAL_BALANCE_ORDER_PREFERENCE: TrialBalanceOrderPreference =
  Object.freeze({
    mode: "custom",
    codes: [],
  });

const ORDER_STORAGE_KEYS: Record<TrialBalanceCompany, string> = {
  tienhock: "trialBalanceOrder",
  greentarget: "gtTrialBalanceOrder",
};

export const loadTrialBalanceOrderPreference = (
  company: TrialBalanceCompany
): TrialBalanceOrderPreference => {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEYS[company]);
    if (!raw) return { ...DEFAULT_TRIAL_BALANCE_ORDER_PREFERENCE };
    const parsed = JSON.parse(raw) as Partial<TrialBalanceOrderPreference>;
    return {
      mode: parsed.mode === "standard" ? "standard" : "custom",
      codes: Array.isArray(parsed.codes)
        ? parsed.codes.filter((code): code is string => typeof code === "string")
        : [],
    };
  } catch (error) {
    console.error("Error loading trial balance order preference:", error);
    return { ...DEFAULT_TRIAL_BALANCE_ORDER_PREFERENCE };
  }
};

export const saveTrialBalanceOrderPreference = (
  company: TrialBalanceCompany,
  preference: TrialBalanceOrderPreference
): void => {
  try {
    localStorage.setItem(ORDER_STORAGE_KEYS[company], JSON.stringify(preference));
  } catch (error) {
    console.error("Error saving trial balance order preference:", error);
  }
};

const byCodeAsc = (first: string, second: string): number =>
  first.localeCompare(second, undefined, { numeric: true });

/**
 * Each company's untouched "current setup" order. Tien Hock prints one
 * alphabetical sequence with the grouped Trade Debtors row last; Green Target
 * prints by account_codes.sort_order (the legacy Trial Balance line number).
 */
export const compareTrialBalanceNatural =
  <T extends TrialBalanceOrderableRow>(company: TrialBalanceCompany) =>
  (first: T, second: T): number => {
    if (company === "greentarget") {
      const firstSort = first.sort_order ?? Number.MAX_SAFE_INTEGER;
      const secondSort = second.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (firstSort !== secondSort) return firstSort - secondSort;
      return byCodeAsc(first.code, second.code);
    }
    const firstIsTd = first.ledger_type === "TD" ? 1 : 0;
    const secondIsTd = second.ledger_type === "TD" ? 1 : 0;
    if (firstIsTd !== secondIsTd) return firstIsTd - secondIsTd;
    return byCodeAsc(first.code, second.code);
  };

/**
 * The locked standard order. Account groups follow standard accounting
 * practice: balance-sheet accounts first (assets, liabilities, equity),
 * then income-statement accounts (revenues, then expenses/COGS), each group
 * ascending by account code. "drawings" is kept for charts that use it.
 * To adjust the standard order, edit this array in code.
 */
const STANDARD_CATEGORY_ORDER: readonly string[] = [
  "asset",
  "liability",
  "equity",
  "drawings",
  "revenue",
  "cogs",
  "expense",
];

const getCategoryRank = (category: string | undefined): number => {
  if (!category) return STANDARD_CATEGORY_ORDER.length;
  const index = STANDARD_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? STANDARD_CATEGORY_ORDER.length : index;
};

// Locked per-company category overrides for accounts whose stored fs_note
// intentionally points at the printed APPX note rather than the statement
// category (see docs/GT/GT_ACCOUNTING_HANDOVER.md — the APPX→statement-note
// overrides). Keyed by account code; only adjust these in code.
const STANDARD_ORDER_CATEGORY_OVERRIDES: Readonly<
  Record<TrialBalanceCompany, Readonly<Record<string, string>>>
> = Object.freeze({
  tienhock: Object.freeze({}),
  greentarget: Object.freeze({
    "INPUT.TAX": "asset",
    FC_TL: "expense",
    FC_HP: "expense",
  }),
});

const resolveStandardCategory = (
  accountCode: string,
  fsNote: string | null | undefined,
  company: TrialBalanceCompany,
  notesByCode: ReadonlyMap<string, FinancialStatementNoteLike>
): string | undefined => {
  const override = STANDARD_ORDER_CATEGORY_OVERRIDES[company][accountCode];
  if (override) return override;
  return notesByCode.get(fsNote ?? "")?.category;
};

export const compareTrialBalanceStandard =
  <T extends TrialBalanceOrderableRow>(
    notesByCode: ReadonlyMap<string, FinancialStatementNoteLike>,
    company: TrialBalanceCompany
  ) =>
  (first: T, second: T): number => {
    const firstRank = getCategoryRank(
      resolveStandardCategory(first.code, first.fs_note, company, notesByCode)
    );
    const secondRank = getCategoryRank(
      resolveStandardCategory(second.code, second.fs_note, company, notesByCode)
    );
    if (firstRank !== secondRank) return firstRank - secondRank;
    return byCodeAsc(first.code, second.code);
  };

export const sortTrialBalanceAccounts = <T extends TrialBalanceOrderableRow>(
  accounts: T[],
  preference: TrialBalanceOrderPreference,
  company: TrialBalanceCompany,
  notesByCode: ReadonlyMap<string, FinancialStatementNoteLike> = new Map()
): T[] => {
  if (preference.mode === "standard") {
    return [...accounts].sort(compareTrialBalanceStandard(notesByCode, company));
  }

  const naturalComparator = compareTrialBalanceNatural(company);
  if (preference.codes.length === 0) {
    return [...accounts].sort(naturalComparator);
  }

  // Saved codes win; accounts added since the order was saved (or absent from
  // it for any reason) go to the end in the company's natural order.
  const orderIndex = new Map<string, number>(
    preference.codes.map((code, index) => [code, index])
  );
  return [...accounts].sort((first, second) => {
    const firstIndex = orderIndex.get(first.code);
    const secondIndex = orderIndex.get(second.code);
    if (firstIndex !== undefined && secondIndex !== undefined) {
      return firstIndex - secondIndex;
    }
    if (firstIndex !== undefined) return -1;
    if (secondIndex !== undefined) return 1;
    return naturalComparator(first, second);
  });
};

export const buildNotesByCode = (
  fsNotes: FinancialStatementNoteLike[]
): Map<string, FinancialStatementNoteLike> =>
  new Map(fsNotes.map((note) => [note.code, note]));

const isOrderableAccount = (account: AccountCode): boolean =>
  account.is_active !== false;

export const isGroupedLedgerType = (ledgerType: string | null): boolean =>
  ledgerType !== null && GROUPED_LEDGER_TYPES.includes(ledgerType);

export const getGroupMemberCodes = (
  accountCodes: AccountCode[],
  ledgerType: string,
  company: TrialBalanceCompany
): string[] => {
  return accountCodes
    .filter(
      (account) =>
        account.is_active !== false && account.ledger_type === ledgerType
    )
    .sort(compareTrialBalanceNatural(company))
    .map((account) => account.code);
};

const getGroupLedgerTypesWithMembers = (
  accountCodes: AccountCode[]
): string[] =>
  GROUPED_LEDGER_TYPES.filter((ledgerType) =>
    accountCodes.some(
      (account) =>
        account.is_active !== false && account.ledger_type === ledgerType
    )
  );

const buildGroupLookups = (
  accountCodes: AccountCode[],
  company: TrialBalanceCompany
): {
  groupLedgerTypes: string[];
  groupMembers: Map<string, string[]>;
  memberToGroup: Map<string, string>;
} => {
  const groupLedgerTypes = getGroupLedgerTypesWithMembers(accountCodes);
  const groupMembers = new Map<string, string[]>();
  const memberToGroup = new Map<string, string>();
  for (const ledgerType of groupLedgerTypes) {
    const members = getGroupMemberCodes(accountCodes, ledgerType, company);
    groupMembers.set(ledgerType, members);
    members.forEach((code) => memberToGroup.set(code, ledgerType));
  }
  return { groupLedgerTypes, groupMembers, memberToGroup };
};

/**
 * Where a group sits in a sorted code sequence. Trade Debtors is the special
 * case: the report collapses all TD children into the single `DEBTOR` control
 * row, so the group must anchor at `DEBTOR`'s position — not at its first
 * customer child (codes like "-1" or "1378 MARKETING" sort before every other
 * account and would otherwise put the group at the very top of the standard
 * view while the printed report still starts with AD_* / ABB etc.).
 */
const getGroupAnchorIndex = (
  ledgerType: string,
  members: string[],
  codeIndex: ReadonlyMap<string, number>,
  preferDebtorAnchor: boolean
): number => {
  const anchorCode = getGroupAnchorCode(
    ledgerType,
    members,
    codeIndex,
    preferDebtorAnchor
  );
  if (anchorCode === null) return Number.MAX_SAFE_INTEGER;
  return codeIndex.get(anchorCode) ?? Number.MAX_SAFE_INTEGER;
};

const getGroupAnchorCode = (
  ledgerType: string,
  members: string[],
  codeIndex: ReadonlyMap<string, number>,
  preferDebtorAnchor: boolean
): string | null => {
  if (preferDebtorAnchor && ledgerType === "TD") {
    const debtorIndex = codeIndex.get("DEBTOR");
    if (debtorIndex !== undefined && members.includes("DEBTOR")) {
      return "DEBTOR";
    }
  }
  let anchorCode: string | null = null;
  let anchor = Number.MAX_SAFE_INTEGER;
  for (const code of members) {
    const index = codeIndex.get(code);
    if (index !== undefined && index < anchor) {
      anchor = index;
      anchorCode = code;
    }
  }
  return anchorCode;
};

/**
 * The working list for the order modal in Manual mode. Grouped ledger types
 * (TD/CS/OS/TC) collapse into one item placed at the first saved member's
 * position; every other account stays an individual item. Codes that were
 * added since the last save are appended in natural order.
 */
export const buildCustomOrderItems = (
  accountCodes: AccountCode[],
  preference: TrialBalanceOrderPreference,
  company: TrialBalanceCompany
): TrialBalanceOrderItem[] => {
  const orderableCodes = accountCodes.filter(isOrderableAccount);
  const orderableSet = new Set(orderableCodes.map((account) => account.code));
  const savedCodes = [
    ...new Set(preference.codes.filter((code) => orderableSet.has(code))),
  ];
  const savedSet = new Set(savedCodes);
  // With no saved order yet, the working list starts from the company's
  // natural order (the current report order), so groups sit where their first
  // member naturally belongs instead of being dumped at the end.
  const baseCodes: string[] =
    savedCodes.length > 0
      ? savedCodes
      : orderableCodes
          .slice()
          .sort(compareTrialBalanceNatural(company))
          .map((account) => account.code);
  const baseIndex = new Map(baseCodes.map((code, index) => [code, index]));
  const { groupLedgerTypes, groupMembers, memberToGroup } = buildGroupLookups(
    accountCodes,
    company
  );

  // Each group anchors at its first member's position in the base sequence.
  const groupAnchorIndex = new Map<string, number>();
  for (const ledgerType of groupLedgerTypes) {
    groupAnchorIndex.set(
      ledgerType,
      getGroupAnchorIndex(
        ledgerType,
        groupMembers.get(ledgerType) ?? [],
        baseIndex,
        false
      )
    );
  }

  const emittedGroups = new Set<string>();
  const items: TrialBalanceOrderItem[] = [];
  baseCodes.forEach((code, index) => {
    const groupLedgerType = memberToGroup.get(code);
    if (groupLedgerType) {
      if (
        !emittedGroups.has(groupLedgerType) &&
        groupAnchorIndex.get(groupLedgerType) === index
      ) {
        emittedGroups.add(groupLedgerType);
        items.push({ kind: "group", ledgerType: groupLedgerType });
      }
      return;
    }
    items.push({ kind: "account", code });
  });

  // New non-group accounts (only relevant once an order has been saved),
  // then any group that had no saved members.
  if (savedCodes.length > 0) {
    orderableCodes
      .filter(
        (account) =>
          !savedSet.has(account.code) && !memberToGroup.has(account.code)
      )
      .sort(compareTrialBalanceNatural(company))
      .forEach((account) => items.push({ kind: "account", code: account.code }));
  }
  for (const ledgerType of groupLedgerTypes) {
    if (!emittedGroups.has(ledgerType)) {
      emittedGroups.add(ledgerType);
      items.push({ kind: "group", ledgerType });
    }
  }

  return items;
};

/**
 * The read-only Standard mode list, with the same large groups collapsed into
 * single rows. Each group sits at the standard position of its first member;
 * the exact per-account standard sequence is still what the report prints.
 */
export const buildStandardOrderSections = (
  accountCodes: AccountCode[],
  fsNotes: FinancialStatementNoteLike[],
  company: TrialBalanceCompany
): TrialBalanceStandardSection[] => {
  const standardCodes = buildStandardOrderCodes(accountCodes, fsNotes, company);
  const standardIndex = new Map(
    standardCodes.map((code, index) => [code, index])
  );
  const codesByCode = new Map(
    accountCodes.map((account) => [account.code, account])
  );
  const notesByCode = buildNotesByCode(fsNotes);
  const { groupLedgerTypes, groupMembers, memberToGroup } = buildGroupLookups(
    accountCodes,
    company
  );

  const groupAnchorIndex = new Map<string, number>();
  for (const ledgerType of groupLedgerTypes) {
    groupAnchorIndex.set(
      ledgerType,
      getGroupAnchorIndex(
        ledgerType,
        groupMembers.get(ledgerType) ?? [],
        standardIndex,
        true
      )
    );
  }

  const emittedGroups = new Set<string>();
  const sections: TrialBalanceStandardSection[] = [];
  const pushItem = (item: TrialBalanceOrderItem): void => {
    const anchorCode =
      item.kind === "account"
        ? item.code
        : getGroupAnchorCode(
            item.ledgerType,
            groupMembers.get(item.ledgerType) ?? [],
            standardIndex,
            true
          );
    const effectiveFsNote =
      anchorCode === null
        ? null
        : resolveEffectiveFsNote(anchorCode, codesByCode);
    const category =
      resolveStandardCategory(
        anchorCode ?? "",
        effectiveFsNote,
        company,
        notesByCode
      ) ?? "unclassified";
    const lastSection = sections[sections.length - 1];
    if (lastSection && lastSection.category === category) {
      lastSection.items.push(item);
    } else {
      sections.push({ category, items: [item] });
    }
  };

  standardCodes.forEach((code, index) => {
    const groupLedgerType = memberToGroup.get(code);
    if (groupLedgerType) {
      if (
        !emittedGroups.has(groupLedgerType) &&
        groupAnchorIndex.get(groupLedgerType) === index
      ) {
        emittedGroups.add(groupLedgerType);
        pushItem({ kind: "group", ledgerType: groupLedgerType });
      }
      return;
    }
    pushItem({ kind: "account", code });
  });
  return sections;
};

/**
 * Expand modal items back into the flat per-code order used by the report
 * sorter and by localStorage (group members expand in natural order at the
 * group's position).
 */
export const expandOrderItemsToCodes = (
  items: TrialBalanceOrderItem[],
  accountCodes: AccountCode[],
  company: TrialBalanceCompany
): string[] => {
  const codes: string[] = [];
  const seen = new Set<string>();
  const pushCode = (code: string): void => {
    if (seen.has(code)) return;
    seen.add(code);
    codes.push(code);
  };
  for (const item of items) {
    if (item.kind === "account") {
      pushCode(item.code);
    } else {
      getGroupMemberCodes(accountCodes, item.ledgerType, company).forEach(
        pushCode
      );
    }
  }
  return codes;
};

/**
 * Save a FILTERED working list back into the full saved order without losing
 * the accounts that are hidden by the month filter. The previous full order
 * (or the natural full order when nothing was saved yet) is scanned slot by
 * slot: visible items are replaced by the new visible sequence in order, while
 * hidden accounts/groups keep their slots. This keeps group blocks contiguous
 * and leaves next month's accounts exactly where the user put them.
 */
export const mergeFilteredOrderToFullCodes = (
  visibleItems: TrialBalanceOrderItem[],
  previousCodes: string[],
  accountCodes: AccountCode[],
  company: TrialBalanceCompany
): string[] => {
  const baseItems = buildCustomOrderItems(
    accountCodes,
    { mode: "custom", codes: previousCodes },
    company
  );
  const visibleAccounts: string[] = [];
  const visibleGroups: string[] = [];
  for (const item of visibleItems) {
    if (item.kind === "account") visibleAccounts.push(item.code);
    else visibleGroups.push(item.ledgerType);
  }
  const visibleAccountSet = new Set(visibleAccounts);
  const visibleGroupSet = new Set(visibleGroups);

  const mergedItems: TrialBalanceOrderItem[] = [];
  let accountIndex = 0;
  let groupIndex = 0;
  for (const item of baseItems) {
    if (item.kind === "account") {
      if (
        visibleAccountSet.has(item.code) &&
        accountIndex < visibleAccounts.length
      ) {
        mergedItems.push({ kind: "account", code: visibleAccounts[accountIndex] });
        accountIndex += 1;
      } else {
        mergedItems.push(item);
      }
    } else if (
      visibleGroupSet.has(item.ledgerType) &&
      groupIndex < visibleGroups.length
    ) {
      mergedItems.push({ kind: "group", ledgerType: visibleGroups[groupIndex] });
      groupIndex += 1;
    } else {
      mergedItems.push(item);
    }
  }
  for (; accountIndex < visibleAccounts.length; accountIndex += 1) {
    mergedItems.push({ kind: "account", code: visibleAccounts[accountIndex] });
  }
  for (; groupIndex < visibleGroups.length; groupIndex += 1) {
    mergedItems.push({ kind: "group", ledgerType: visibleGroups[groupIndex] });
  }
  return expandOrderItemsToCodes(mergedItems, accountCodes, company);
};

/**
 * Standard order for the modal's read-only view. Accounts whose direct
 * fs_note is null fall back to the nearest ancestor with a note, matching the
 * backend's effective-fs-note resolution.
 */
export const buildStandardOrderCodes = (
  accountCodes: AccountCode[],
  fsNotes: FinancialStatementNoteLike[],
  company: TrialBalanceCompany
): string[] => {
  const orderableCodes = accountCodes.filter(isOrderableAccount);
  const codesByCode = new Map(
    orderableCodes.map((account) => [account.code, account])
  );
  const notesByCode = buildNotesByCode(fsNotes);

  return orderableCodes
    .map((account) => ({
      code: account.code,
      effectiveFsNote: resolveEffectiveFsNote(account.code, codesByCode),
    }))
    .sort((first, second) => {
      const firstRank = getCategoryRank(
        resolveStandardCategory(
          first.code,
          first.effectiveFsNote,
          company,
          notesByCode
        )
      );
      const secondRank = getCategoryRank(
        resolveStandardCategory(
          second.code,
          second.effectiveFsNote,
          company,
          notesByCode
        )
      );
      if (firstRank !== secondRank) return firstRank - secondRank;
      return byCodeAsc(first.code, second.code);
    })
    .map(({ code }) => code);
};

const resolveEffectiveFsNote = (
  code: string,
  codesByCode: ReadonlyMap<string, AccountCode>
): string | null => {
  const visited = new Set<string>();
  let current = codesByCode.get(code);
  while (current) {
    if (visited.has(current.code)) return null;
    visited.add(current.code);
    if (current.fs_note) return current.fs_note;
    if (!current.parent_code) return null;
    current = codesByCode.get(current.parent_code);
  }
  return null;
};
