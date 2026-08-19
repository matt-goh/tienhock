// src/components/Accounting/TrialBalanceOrderModal.tsx
//
// Wide/tall modal for controlling the Trial Balance account order. Two modes:
// Manual Order (drag & drop or up/down arrows over every active chart account
// code) and Standard Order (a locked accounting-practice order maintained in
// src/utils/accounting/trialBalanceOrder.ts — not editable here).
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconChevronDown,
  IconChevronUp,
  IconFolder,
  IconGripVertical,
  IconLock,
  IconX,
} from "@tabler/icons-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import Button from "../Button";
import Checkbox from "../Checkbox";
import type { AccountCode } from "../../types/types";
import {
  buildCustomOrderItems,
  buildStandardOrderSections,
  expandOrderItemsToCodes,
  getGroupMemberCodes,
  GROUPED_LEDGER_TYPES,
  mergeFilteredOrderToFullCodes,
  type FinancialStatementNoteLike,
  type TrialBalanceCompany,
  type TrialBalanceOrderItem,
  type TrialBalanceOrderMode,
  type TrialBalanceOrderPreference,
} from "../../utils/accounting/trialBalanceOrder";

interface TrialBalanceOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: TrialBalanceCompany;
  accountCodes: AccountCode[];
  accountCodesLoading: boolean;
  fsNotes: FinancialStatementNoteLike[];
  preference: TrialBalanceOrderPreference;
  onPreferenceChange: (preference: TrialBalanceOrderPreference) => void;
  onlyShowMonthAccounts: boolean;
  onOnlyShowMonthAccountsChange: (checked: boolean) => void;
  monthAccountCodes: Set<string>;
}

interface GroupTooltipAnchor {
  ledgerType: string;
  top: number;
  left: number;
}

const GROUP_TOOLTIP_WIDTH = 320;
const GROUP_TOOLTIP_PREVIEW_COUNT = 20;

const TrialBalanceOrderModal: React.FC<TrialBalanceOrderModalProps> = ({
  isOpen,
  onClose,
  company,
  accountCodes,
  accountCodesLoading,
  fsNotes,
  preference,
  onPreferenceChange,
  onlyShowMonthAccounts,
  onOnlyShowMonthAccountsChange,
  monthAccountCodes,
}) => {
  const { t } = useTranslation("accounting");
  const [workingItems, setWorkingItems] = useState<TrialBalanceOrderItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<GroupTooltipAnchor | null>(
    null
  );
  const [collapsedStandardCategories, setCollapsedStandardCategories] =
    useState<Set<string>>(new Set());
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStandardMode: boolean = preference.mode === "standard";

  useEffect(
    () => (): void => {
      if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    },
    []
  );

  // Month filter: only keep chart accounts that appear in the selected
  // month's Trial Balance. Falls back to the full chart while the month data
  // is still loading (empty code set).
  const modalAccountCodes: AccountCode[] = useMemo(() => {
    if (!onlyShowMonthAccounts || monthAccountCodes.size === 0) {
      return accountCodes;
    }
    return accountCodes.filter((account) => monthAccountCodes.has(account.code));
  }, [accountCodes, onlyShowMonthAccounts, monthAccountCodes]);

  // Rebuild the working manual order whenever the modal opens or the chart
  // arrives, keeping saved positions and appending new codes naturally.
  useEffect(() => {
    if (!isOpen) return;
    setDraggedIndex(null);
    setDragOverIndex(null);
    setCollapsedStandardCategories(new Set());
    setWorkingItems(buildCustomOrderItems(modalAccountCodes, preference, company));
  }, [isOpen, modalAccountCodes, preference.codes, company]); // eslint-disable-line react-hooks/exhaustive-deps

  const standardSections = useMemo(
    () => buildStandardOrderSections(modalAccountCodes, fsNotes, company),
    [modalAccountCodes, fsNotes, company]
  );
  const standardItems: TrialBalanceOrderItem[] = useMemo(
    () => standardSections.flatMap((section) => section.items),
    [standardSections]
  );

  const codeToAccount: Map<string, AccountCode> = useMemo(
    () => new Map(accountCodes.map((account) => [account.code, account])),
    [accountCodes]
  );

  const groupMemberCodes: Map<string, string[]> = useMemo(() => {
    const members = new Map<string, string[]>();
    for (const ledgerType of GROUPED_LEDGER_TYPES) {
      members.set(
        ledgerType,
        getGroupMemberCodes(modalAccountCodes, ledgerType, company)
      );
    }
    return members;
  }, [modalAccountCodes, company]);

  const displayedItems: TrialBalanceOrderItem[] = isStandardMode
    ? standardItems
    : workingItems;
  const hoveredGroupMembers: string[] = hoveredGroup
    ? groupMemberCodes.get(hoveredGroup.ledgerType) ?? []
    : [];
  const hoveredGroupPreview: string[] = hoveredGroupMembers.slice(
    0,
    GROUP_TOOLTIP_PREVIEW_COUNT
  );

  const handleModeChange = (mode: TrialBalanceOrderMode): void => {
    onPreferenceChange({ ...preference, mode });
  };

  const moveItem = (index: number, direction: -1 | 1): void => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= workingItems.length) return;
    setWorkingItems((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleDrop = (targetIndex: number): void => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    setWorkingItems((current) => {
      const next = [...current];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSave = (): void => {
    const codes = onlyShowMonthAccounts
      ? mergeFilteredOrderToFullCodes(
          workingItems,
          preference.codes,
          accountCodes,
          company
        )
      : expandOrderItemsToCodes(workingItems, accountCodes, company);
    onPreferenceChange({
      ...preference,
      mode: "custom",
      codes,
    });
    onClose();
  };

  const getGroupLabel = (ledgerType: string): string => {
    const labelKeys: Record<string, string> = {
      TD: "Trade Debtors",
      CS: "Closing Stock",
      OS: "Opening Stock",
      TC: "Trade Creditors",
    };
    return t(labelKeys[ledgerType] ?? ledgerType);
  };

  const STANDARD_CATEGORY_LABEL_KEYS: Record<string, string> = {
    asset: "Assets",
    liability: "Liabilities",
    equity: "Equity",
    drawings: "Drawings",
    revenue: "Revenues",
    cogs: "Cost of Goods Sold",
    expense: "Expenses",
    unclassified: "Unclassified",
  };

  const getStandardCategoryLabel = (category: string): string =>
    t(STANDARD_CATEGORY_LABEL_KEYS[category] ?? category);

  const toggleStandardCategory = (category: string): void => {
    setCollapsedStandardCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const cancelHoverClose = (): void => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };

  const scheduleHoverClose = (): void => {
    cancelHoverClose();
    hoverCloseTimerRef.current = setTimeout(() => setHoveredGroup(null), 150);
  };

  const handleGroupMouseEnter = (
    event: React.MouseEvent<HTMLDivElement>,
    ledgerType: string
  ): void => {
    cancelHoverClose();
    const rect = event.currentTarget.getBoundingClientRect();
    let left = rect.right + 8;
    if (left + GROUP_TOOLTIP_WIDTH > window.innerWidth - 8) {
      left = Math.max(8, rect.left - GROUP_TOOLTIP_WIDTH - 8);
    }
    const top = Math.min(rect.top, Math.max(8, window.innerHeight - 380));
    setHoveredGroup({ ledgerType, top, left });
  };

  const renderItemRow = (
    item: TrialBalanceOrderItem,
    index: number
  ): React.ReactElement => {
    if (item.kind === "group") {
      const groupCount = groupMemberCodes.get(item.ledgerType)?.length ?? 0;
      return (
        <div
          key={`group:${item.ledgerType}`}
          draggable={!isStandardMode}
          onMouseEnter={(event) =>
            handleGroupMouseEnter(event, item.ledgerType)
          }
          onMouseLeave={scheduleHoverClose}
          onDragStart={(event: React.DragEvent<HTMLDivElement>): void => {
            if (isStandardMode) return;
            event.dataTransfer.effectAllowed = "move";
            setDraggedIndex(index);
            setHoveredGroup(null);
          }}
          onDragOver={(event: React.DragEvent<HTMLDivElement>): void => {
            if (isStandardMode) return;
            event.preventDefault();
            if (dragOverIndex !== index) setDragOverIndex(index);
          }}
          onDrop={(event: React.DragEvent<HTMLDivElement>): void => {
            if (isStandardMode) return;
            event.preventDefault();
            handleDrop(index);
          }}
          onDragEnd={(): void => {
            setDraggedIndex(null);
            setDragOverIndex(null);
            setHoveredGroup(null);
          }}
          className={clsx(
            "flex items-center gap-2 border-b border-default-100 bg-sky-50/60 px-2 py-1.5 last:border-b-0 dark:border-gray-700 dark:bg-sky-900/10",
            isStandardMode ? "cursor-default" : "cursor-grab",
            draggedIndex === index && "opacity-40",
            dragOverIndex === index &&
              draggedIndex !== null &&
              draggedIndex !== index &&
              "border-t-2 border-t-sky-500"
          )}
        >
          {!isStandardMode && (
            <IconGripVertical
              size={15}
              className="flex-shrink-0 text-default-300 dark:text-gray-500"
            />
          )}
          <span className="w-7 flex-shrink-0 text-right text-xs tabular-nums text-default-400 dark:text-gray-500">
            {index + 1}
          </span>
          <IconFolder
            size={15}
            className="flex-shrink-0 text-sky-600 dark:text-sky-400"
          />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-default-900 dark:text-gray-100">
            {getGroupLabel(item.ledgerType)}
          </span>
          <span className="flex-shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
            {t("Group")}
          </span>
          <span className="flex-shrink-0 rounded bg-default-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-default-600 dark:bg-gray-700 dark:text-gray-300">
            {groupCount.toLocaleString()}
          </span>
          {!isStandardMode && (
            <div className="flex flex-shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                title={t("Move up")}
                className="rounded p-1 text-default-500 hover:bg-default-100 hover:text-default-800 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <IconChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, 1)}
                disabled={index === displayedItems.length - 1}
                title={t("Move down")}
                className="rounded p-1 text-default-500 hover:bg-default-100 hover:text-default-800 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <IconChevronDown size={14} />
              </button>
            </div>
          )}
        </div>
      );
    }

    const account = codeToAccount.get(item.code);
    return (
      <div
        key={item.code}
        draggable={!isStandardMode}
        onDragStart={(event: React.DragEvent<HTMLDivElement>): void => {
          if (isStandardMode) return;
          event.dataTransfer.effectAllowed = "move";
          setDraggedIndex(index);
        }}
        onDragOver={(event: React.DragEvent<HTMLDivElement>): void => {
          if (isStandardMode) return;
          event.preventDefault();
          if (dragOverIndex !== index) setDragOverIndex(index);
        }}
        onDrop={(event: React.DragEvent<HTMLDivElement>): void => {
          if (isStandardMode) return;
          event.preventDefault();
          handleDrop(index);
        }}
        onDragEnd={(): void => {
          setDraggedIndex(null);
          setDragOverIndex(null);
        }}
        className={clsx(
          "flex items-center gap-2 border-b border-default-100 bg-white px-2 py-1 last:border-b-0 dark:border-gray-700 dark:bg-gray-800",
          isStandardMode ? "cursor-default" : "cursor-grab",
          draggedIndex === index && "opacity-40",
          dragOverIndex === index &&
            draggedIndex !== null &&
            draggedIndex !== index &&
            "border-t-2 border-t-sky-500"
        )}
      >
        {!isStandardMode && (
          <IconGripVertical
            size={15}
            className="flex-shrink-0 text-default-300 dark:text-gray-500"
          />
        )}
        <span className="w-7 flex-shrink-0 text-right text-xs tabular-nums text-default-400 dark:text-gray-500">
          {index + 1}
        </span>
        <span className="w-32 flex-shrink-0 truncate font-mono text-xs font-medium text-default-900 dark:text-gray-100">
          {item.code}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-default-600 dark:text-gray-300">
          {account?.description || item.code}
        </span>
        {!isStandardMode && (
          <div className="flex flex-shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => moveItem(index, -1)}
              disabled={index === 0}
              title={t("Move up")}
              className="rounded p-1 text-default-500 hover:bg-default-100 hover:text-default-800 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <IconChevronUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => moveItem(index, 1)}
              disabled={index === displayedItems.length - 1}
              title={t("Move down")}
              className="rounded p-1 text-default-500 hover:bg-default-100 hover:text-default-800 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <IconChevronDown size={14} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderStandardList = (): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let rowIndex = 0;
    standardSections.forEach((section) => {
      const isCollapsed = collapsedStandardCategories.has(section.category);
      nodes.push(
        <button
          key={`section:${section.category}`}
          type="button"
          onClick={() => toggleStandardCategory(section.category)}
          className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-default-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          <IconChevronDown
            size={14}
            className={clsx(
              "flex-shrink-0 text-default-400 transition-transform dark:text-gray-500",
              isCollapsed && "-rotate-90"
            )}
          />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-default-700 dark:text-gray-200">
            {getStandardCategoryLabel(section.category)}
          </span>
          <span className="flex-shrink-0 rounded bg-default-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-default-600 dark:bg-gray-700 dark:text-gray-300">
            {section.items.length}
          </span>
        </button>
      );
      if (!isCollapsed) {
        section.items.forEach((item) => {
          nodes.push(renderItemRow(item, rowIndex));
          rowIndex += 1;
        });
      }
    });
    return nodes;
  };

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" onClose={onClose}>
        <TransitionChild
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="flex w-full max-w-5xl max-h-[90vh] flex-col transform rounded-2xl bg-white dark:bg-gray-800 p-5 text-left shadow-xl transition-all">
              <div className="flex items-center justify-between mb-2">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  {t("Trial Balance Order")}
                </DialogTitle>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-default-400 dark:text-gray-400 hover:text-default-600 dark:hover:text-gray-200"
                >
                  <IconX size={20} />
                </button>
              </div>

              {/* Mode selection (also available from the toolbar hover menu) */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => handleModeChange("custom")}
                    className={clsx(
                      "px-3 py-1.5 transition-colors",
                      !isStandardMode
                        ? "bg-sky-500 text-white"
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                    )}
                  >
                    {t("Manual Order")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange("standard")}
                    className={clsx(
                      "flex items-center gap-1 px-3 py-1.5 transition-colors",
                      isStandardMode
                        ? "bg-sky-500 text-white"
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                    )}
                  >
                    <IconLock size={14} />
                    {t("Standard Order")}
                  </button>
                </div>
                <span className="text-xs text-default-500 dark:text-gray-400">
                  {t("Items")}: {displayedItems.length}
                </span>
              </div>

              <div className="mb-2">
                <Checkbox
                  checked={onlyShowMonthAccounts}
                  onChange={onOnlyShowMonthAccountsChange}
                  label={t(
                    "Only show accounts in the selected month's Trial Balance"
                  )}
                  size={16}
                />
              </div>

              <p className="mb-3 text-sm text-default-500 dark:text-gray-400">
                {isStandardMode
                  ? t(
                      "Standard order is fixed by the system and follows the chart of accounts sequence."
                    )
                  : t("Drag rows or use the arrows to set the order.")}
              </p>

              <div
                className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-default-200 dark:border-gray-700"
                onScroll={() => setHoveredGroup(null)}
              >
                {accountCodesLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                  </div>
                ) : displayedItems.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-default-400 dark:text-gray-500">
                    {t("No account codes found.")}
                  </p>
                ) : isStandardMode ? (
                  renderStandardList()
                ) : (
                  displayedItems.map((item, index) => renderItemRow(item, index))
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  {t("Cancel")}
                </Button>
                <Button
                  color="sky"
                  onClick={handleSave}
                  disabled={
                    isStandardMode ||
                    accountCodesLoading ||
                    displayedItems.length === 0
                  }
                >
                  {t("Save")}
                </Button>
              </div>
            </DialogPanel>
          </TransitionChild>
          </div>
        </div>

        {hoveredGroup && (
          <div
            className="fixed z-[60] w-80 overflow-hidden rounded-lg border border-default-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
            style={{ top: hoveredGroup.top, left: hoveredGroup.left }}
            onMouseEnter={cancelHoverClose}
            onMouseLeave={scheduleHoverClose}
          >
            <div className="flex items-center justify-between gap-2 border-b border-default-200 px-3 py-2 dark:border-gray-700">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-default-900 dark:text-gray-100">
                {getGroupLabel(hoveredGroup.ledgerType)}
              </span>
              <span className="flex-shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                {hoveredGroupMembers.length.toLocaleString()}
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto px-3 py-1.5">
              {hoveredGroupPreview.map((code) => {
                const account = codeToAccount.get(code);
                return (
                  <div
                    key={code}
                    className="flex items-center gap-2 py-0.5"
                  >
                    <span className="w-28 flex-shrink-0 truncate font-mono text-[11px] text-default-800 dark:text-gray-200">
                      {code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-default-500 dark:text-gray-400">
                      {account?.description || ""}
                    </span>
                  </div>
                );
              })}
              {hoveredGroupMembers.length > GROUP_TOOLTIP_PREVIEW_COUNT && (
                <div className="py-0.5 text-center text-[11px] font-semibold tracking-widest text-default-400 dark:text-gray-500">
                  ...
                </div>
              )}
            </div>
            {hoveredGroupMembers.length > GROUP_TOOLTIP_PREVIEW_COUNT && (
              <div className="border-t border-default-200 px-3 py-1.5 text-[10px] text-default-400 dark:border-gray-700 dark:text-gray-500">
                {t("First {{shown}} of {{total}}", {
                  shown: GROUP_TOOLTIP_PREVIEW_COUNT,
                  total: hoveredGroupMembers.length.toLocaleString(),
                })}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </Transition>
  );
};

export default TrialBalanceOrderModal;
