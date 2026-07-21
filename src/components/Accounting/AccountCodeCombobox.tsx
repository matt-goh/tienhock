import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconPlus,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { useAccountCodesCache } from "../../utils/accounting/useAccountingCache";
import { AccountCode } from "../../types/types";

interface AccountCodeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  filter?: (account: AccountCode) => boolean;
  className?: string;
  hierarchical?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  onAddAccount?: (query: string) => void;
  favouriteCodes?: ReadonlySet<string>;
  pendingFavouriteCodes?: ReadonlySet<string>;
  onToggleFavourite?: (accountCode: string) => void;
}

interface AccountHierarchyRow {
  account: AccountCode;
  depth: number;
  hasChildren: boolean;
  childCount: number;
  selectable: boolean;
}

const ACCOUNT_LOAD_INCREMENT: number = 50;
const TREE_INDENT_PX: number = 20;

const sortAccounts = (left: AccountCode, right: AccountCode): number => {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }
  return left.code.localeCompare(right.code);
};

const AccountCodeCombobox: React.FC<AccountCodeComboboxProps> = ({
  value,
  onChange,
  label,
  required,
  disabled = false,
  placeholder = "Search account...",
  filter,
  className,
  hierarchical = false,
  allowEmpty = false,
  emptyLabel = "No account",
  onAddAccount,
  favouriteCodes,
  pendingFavouriteCodes,
  onToggleFavourite,
}: AccountCodeComboboxProps) => {
  const { accountCodes: allAccountCodes } = useAccountCodesCache();
  const [query, setQuery] = useState<string>("");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loadedCount, setLoadedCount] = useState<number>(ACCOUNT_LOAD_INCREMENT);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [activeOptionCode, setActiveOptionCode] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const keyboardNavScrollRef = useRef<boolean>(false);
  const inputId: string = useId();
  const listboxId: string = `${inputId}-listbox`;

  const selectableAccounts: AccountCode[] = useMemo(() => {
    const activeAccounts: AccountCode[] = allAccountCodes.filter(
      (account: AccountCode): boolean => account.is_active
    );
    return filter ? activeAccounts.filter(filter) : activeAccounts;
  }, [allAccountCodes, filter]);

  const allAccountMap: Map<string, AccountCode> = useMemo(() => {
    return new Map<string, AccountCode>(
      allAccountCodes.map(
        (account: AccountCode): [string, AccountCode] => [account.code, account]
      )
    );
  }, [allAccountCodes]);

  const selectableCodes: Set<string> = useMemo(() => {
    return new Set<string>(
      selectableAccounts.map((account: AccountCode): string => account.code)
    );
  }, [selectableAccounts]);

  const hierarchyAccounts: AccountCode[] = useMemo(() => {
    if (!hierarchical) return selectableAccounts;

    const includedCodes: Set<string> = new Set<string>(selectableCodes);
    if (value && allAccountMap.has(value)) {
      includedCodes.add(value);
    }

    const startingCodes: string[] = Array.from(includedCodes);
    startingCodes.forEach((startingCode: string): void => {
      let currentAccount: AccountCode | undefined = allAccountMap.get(startingCode);
      const visitedCodes: Set<string> = new Set<string>();

      while (
        currentAccount?.parent_code &&
        !visitedCodes.has(currentAccount.parent_code)
      ) {
        const parentCode: string = currentAccount.parent_code;
        const parentAccount: AccountCode | undefined = allAccountMap.get(parentCode);
        if (!parentAccount) break;

        visitedCodes.add(parentCode);
        includedCodes.add(parentCode);
        currentAccount = parentAccount;
      }
    });

    return allAccountCodes.filter((account: AccountCode): boolean =>
      includedCodes.has(account.code)
    );
  }, [
    allAccountCodes,
    allAccountMap,
    hierarchical,
    selectableAccounts,
    selectableCodes,
    value,
  ]);

  const hierarchyAccountMap: Map<string, AccountCode> = useMemo(() => {
    return new Map<string, AccountCode>(
      hierarchyAccounts.map(
        (account: AccountCode): [string, AccountCode] => [account.code, account]
      )
    );
  }, [hierarchyAccounts]);

  const childrenByParent: Map<string, AccountCode[]> = useMemo(() => {
    const childrenMap: Map<string, AccountCode[]> = new Map<string, AccountCode[]>();

    hierarchyAccounts.forEach((account: AccountCode): void => {
      if (
        !account.parent_code ||
        account.parent_code === account.code ||
        !hierarchyAccountMap.has(account.parent_code)
      ) {
        return;
      }

      const siblings: AccountCode[] = childrenMap.get(account.parent_code) || [];
      siblings.push(account);
      childrenMap.set(account.parent_code, siblings);
    });

    childrenMap.forEach((children: AccountCode[]): void => {
      children.sort(sortAccounts);
    });

    return childrenMap;
  }, [hierarchyAccountMap, hierarchyAccounts]);

  const hierarchyRoots: AccountCode[] = useMemo(() => {
    const sortedAccounts: AccountCode[] = [...hierarchyAccounts].sort(sortAccounts);
    const roots: AccountCode[] = sortedAccounts.filter(
      (account: AccountCode): boolean =>
        !account.parent_code ||
        account.parent_code === account.code ||
        !hierarchyAccountMap.has(account.parent_code)
    );
    const reachableCodes: Set<string> = new Set<string>();

    const markReachable = (rootAccount: AccountCode): void => {
      const pendingAccounts: AccountCode[] = [rootAccount];
      while (pendingAccounts.length > 0) {
        const currentAccount: AccountCode | undefined = pendingAccounts.pop();
        if (!currentAccount || reachableCodes.has(currentAccount.code)) continue;

        reachableCodes.add(currentAccount.code);
        const children: AccountCode[] = childrenByParent.get(currentAccount.code) || [];
        pendingAccounts.push(...children);
      }
    };

    roots.forEach(markReachable);

    // Keep malformed cyclic groups visible as a root instead of dropping them.
    sortedAccounts.forEach((account: AccountCode): void => {
      if (!reachableCodes.has(account.code)) {
        roots.push(account);
        markReachable(account);
      }
    });

    return roots;
  }, [childrenByParent, hierarchyAccountMap, hierarchyAccounts]);

  const normalizedQuery: string = query.trim().toLowerCase();

  const matchingHierarchyCodes: Set<string> | null = useMemo(() => {
    if (!normalizedQuery) return null;

    return new Set<string>(
      hierarchyAccounts
        .filter(
          (account: AccountCode): boolean =>
            account.code.toLowerCase().includes(normalizedQuery) ||
            account.description.toLowerCase().includes(normalizedQuery)
        )
        .map((account: AccountCode): string => account.code)
    );
  }, [hierarchyAccounts, normalizedQuery]);

  const searchVisibleCodes: Set<string> | null = useMemo(() => {
    if (!matchingHierarchyCodes) return null;

    const visibleCodes: Set<string> = new Set<string>(matchingHierarchyCodes);
    matchingHierarchyCodes.forEach((matchingCode: string): void => {
      let currentAccount: AccountCode | undefined = hierarchyAccountMap.get(matchingCode);
      const visitedCodes: Set<string> = new Set<string>();

      while (
        currentAccount?.parent_code &&
        !visitedCodes.has(currentAccount.parent_code)
      ) {
        const parentCode: string = currentAccount.parent_code;
        const parentAccount: AccountCode | undefined = hierarchyAccountMap.get(parentCode);
        if (!parentAccount) break;

        visitedCodes.add(parentCode);
        visibleCodes.add(parentCode);
        currentAccount = parentAccount;
      }
    });

    return visibleCodes;
  }, [hierarchyAccountMap, matchingHierarchyCodes]);

  const visibleRows: AccountHierarchyRow[] = useMemo(() => {
    if (!hierarchical) {
      return selectableAccounts
        .filter(
          (account: AccountCode): boolean =>
            !normalizedQuery ||
            account.code.toLowerCase().includes(normalizedQuery) ||
            account.description.toLowerCase().includes(normalizedQuery)
        )
        .map(
          (account: AccountCode): AccountHierarchyRow => ({
            account,
            depth: 0,
            hasChildren: false,
            childCount: 0,
            selectable: true,
          })
        );
    }

    const rows: AccountHierarchyRow[] = [];
    const renderedCodes: Set<string> = new Set<string>();

    const appendAccount = (account: AccountCode, depth: number): void => {
      if (
        renderedCodes.has(account.code) ||
        (searchVisibleCodes && !searchVisibleCodes.has(account.code))
      ) {
        return;
      }

      renderedCodes.add(account.code);
      const allChildren: AccountCode[] = childrenByParent.get(account.code) || [];
      const visibleChildren: AccountCode[] = searchVisibleCodes
        ? allChildren.filter((child: AccountCode): boolean =>
            searchVisibleCodes.has(child.code)
          )
        : allChildren;
      const hasChildren: boolean = visibleChildren.length > 0;

      rows.push({
        account,
        depth,
        hasChildren,
        childCount: allChildren.length,
        selectable: selectableCodes.has(account.code),
      });

      if (hasChildren && (searchVisibleCodes || expandedCodes.has(account.code))) {
        visibleChildren.forEach((child: AccountCode): void => {
          appendAccount(child, depth + 1);
        });
      }
    };

    hierarchyRoots.forEach((rootAccount: AccountCode): void => {
      appendAccount(rootAccount, 0);
    });

    return rows;
  }, [
    childrenByParent,
    expandedCodes,
    hierarchical,
    hierarchyRoots,
    normalizedQuery,
    searchVisibleCodes,
    selectableAccounts,
    selectableCodes,
  ]);

  const favouritesEnabled: boolean = Boolean(favouriteCodes && onToggleFavourite);

  // Favourited accounts pinned to the top of the dropdown (matches the query
  // too, so searching keeps relevant favourites visible first).
  const favouriteRows: AccountHierarchyRow[] = useMemo(() => {
    if (!favouritesEnabled || !favouriteCodes || favouriteCodes.size === 0) {
      return [];
    }

    const sourceAccounts: AccountCode[] = hierarchical
      ? hierarchyAccounts
      : selectableAccounts;

    return sourceAccounts
      .filter(
        (account: AccountCode): boolean =>
          favouriteCodes.has(account.code) &&
          (!normalizedQuery ||
            account.code.toLowerCase().includes(normalizedQuery) ||
            account.description.toLowerCase().includes(normalizedQuery))
      )
      .sort(sortAccounts)
      .map(
        (account: AccountCode): AccountHierarchyRow => ({
          account,
          depth: 0,
          hasChildren: false,
          childCount: 0,
          selectable: selectableCodes.has(account.code),
        })
      );
  }, [
    favouritesEnabled,
    favouriteCodes,
    hierarchical,
    hierarchyAccounts,
    selectableAccounts,
    normalizedQuery,
    selectableCodes,
  ]);

  const mainRows: AccountHierarchyRow[] = useMemo(() => {
    // Hierarchical mode keeps favourites inside the tree as well (same as the
    // Account Codes page); flat mode drops them to avoid duplicates.
    if (hierarchical || favouriteRows.length === 0 || !favouriteCodes) {
      return visibleRows;
    }
    return visibleRows.filter(
      (row: AccountHierarchyRow): boolean => !favouriteCodes.has(row.account.code)
    );
  }, [favouriteCodes, favouriteRows, hierarchical, visibleRows]);

  const combinedRows: AccountHierarchyRow[] = useMemo(
    () => [...favouriteRows, ...mainRows],
    [favouriteRows, mainRows]
  );

  const displayedRows: AccountHierarchyRow[] = useMemo(() => {
    return combinedRows.slice(0, loadedCount);
  }, [loadedCount, combinedRows]);
  const hasMore: boolean = displayedRows.length < combinedRows.length;
  const remaining: number = combinedRows.length - displayedRows.length;
  const keyboardOptionCodes: string[] = useMemo(() => {
    const accountCodes: string[] = displayedRows
      .filter((row: AccountHierarchyRow): boolean => row.selectable)
      .map((row: AccountHierarchyRow): string => row.account.code);
    return allowEmpty ? ["", ...accountCodes] : accountCodes;
  }, [allowEmpty, displayedRows]);
  const selectedAccount: AccountCode | undefined = hierarchical
    ? allAccountMap.get(value)
    : selectableAccounts.find((account: AccountCode): boolean => account.code === value);
  const displayValue: string = selectedAccount
    ? `${selectedAccount.code} - ${selectedAccount.description}${
        selectedAccount.is_active ? "" : " (Inactive)"
      }`
    : value && hierarchical
      ? value
      : allowEmpty && !value
        ? emptyLabel
        : "";
  const getOptionId = (code: string): string => {
    const optionKey: string = code ? encodeURIComponent(code) : "empty";
    return `${listboxId}-option-${optionKey}`;
  };
  const activeOptionId: string | undefined =
    activeOptionCode !== null ? getOptionId(activeOptionCode) : undefined;

  useEffect((): void => {
    setLoadedCount(ACCOUNT_LOAD_INCREMENT);
  }, [query]);

  useEffect((): void => {
    if (!isOpen) {
      setActiveOptionCode(null);
      return;
    }

    setActiveOptionCode((previousCode: string | null): string | null => {
      if (keyboardOptionCodes.length === 0) return null;

      if (normalizedQuery) {
        const isDirectSearchMatch = (optionCode: string): boolean =>
          optionCode !== "" &&
          (!hierarchical || Boolean(matchingHierarchyCodes?.has(optionCode)));

        if (
          previousCode !== null &&
          keyboardOptionCodes.includes(previousCode) &&
          isDirectSearchMatch(previousCode)
        ) {
          return previousCode;
        }

        const firstMatchingRow: AccountHierarchyRow | undefined = displayedRows.find(
          (row: AccountHierarchyRow): boolean =>
            row.selectable && isDirectSearchMatch(row.account.code)
        );
        return firstMatchingRow?.account.code ?? null;
      }

      if (previousCode !== null && keyboardOptionCodes.includes(previousCode)) {
        return previousCode;
      }
      if (keyboardOptionCodes.includes(value)) return value;
      return keyboardOptionCodes[0];
    });
  }, [
    displayedRows,
    hierarchical,
    isOpen,
    keyboardOptionCodes,
    matchingHierarchyCodes,
    normalizedQuery,
    value,
  ]);

  useEffect((): void => {
    if (!isOpen || !activeOptionId) return;
    // Only scroll for keyboard navigation — hover-driven active changes point
    // at a row that is already visible (and for favourites would scroll away
    // from the pinned row to the tree row).
    if (!keyboardNavScrollRef.current) return;
    keyboardNavScrollRef.current = false;
    document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId, isOpen]);

  useEffect((): void => {
    if (!isOpen) return;
    // Always open scrolled to the top, where favourites are pinned.
    keyboardNavScrollRef.current = false;
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [isOpen]);

  useEffect((): void | (() => void) => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent): void => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return (): void => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect((): void => {
    if (!hierarchical || !value) return;

    const ancestorCodes: string[] = [];
    const visitedCodes: Set<string> = new Set<string>();
    let currentAccount: AccountCode | undefined = hierarchyAccountMap.get(value);

    while (
      currentAccount?.parent_code &&
      !visitedCodes.has(currentAccount.parent_code)
    ) {
      const parentCode: string = currentAccount.parent_code;
      const parentAccount: AccountCode | undefined = hierarchyAccountMap.get(parentCode);
      if (!parentAccount) break;

      visitedCodes.add(parentCode);
      ancestorCodes.push(parentCode);
      currentAccount = parentAccount;
    }

    if (ancestorCodes.length === 0) return;

    setExpandedCodes((previousCodes: Set<string>): Set<string> => {
      const nextCodes: Set<string> = new Set<string>(previousCodes);
      let changed: boolean = false;
      ancestorCodes.forEach((ancestorCode: string): void => {
        if (!nextCodes.has(ancestorCode)) {
          nextCodes.add(ancestorCode);
          changed = true;
        }
      });
      return changed ? nextCodes : previousCodes;
    });
  }, [hierarchical, hierarchyAccountMap, value]);

  const handleSelect = (code: string): void => {
    onChange(code);
    setIsOpen(false);
    setQuery("");
  };

  const moveActiveOption = (direction: 1 | -1): void => {
    if (keyboardOptionCodes.length === 0) return;
    keyboardNavScrollRef.current = true;

    setActiveOptionCode((previousCode: string | null): string => {
      const currentIndex: number =
        previousCode === null ? -1 : keyboardOptionCodes.indexOf(previousCode);
      const fallbackIndex: number = direction === 1 ? 0 : keyboardOptionCodes.length - 1;
      if (currentIndex === -1) return keyboardOptionCodes[fallbackIndex];

      const nextIndex: number =
        (currentIndex + direction + keyboardOptionCodes.length) %
        keyboardOptionCodes.length;
      return keyboardOptionCodes[nextIndex];
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Tab") {
      setIsOpen(false);
      setQuery("");
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setQuery("");
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      keyboardNavScrollRef.current = true;
      if (!isOpen) {
        setIsOpen(true);
        const initialIndex: number = event.key === "ArrowDown"
          ? 0
          : keyboardOptionCodes.length - 1;
        setActiveOptionCode(keyboardOptionCodes[initialIndex] ?? null);
      } else {
        moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      if (activeOptionCode !== null) handleSelect(activeOptionCode);
      return;
    }

    if (
      hierarchical &&
      !normalizedQuery &&
      activeOptionCode &&
      (event.key === "ArrowRight" || event.key === "ArrowLeft")
    ) {
      const activeRow: AccountHierarchyRow | undefined = visibleRows.find(
        (row: AccountHierarchyRow): boolean => row.account.code === activeOptionCode
      );
      if (!activeRow?.hasChildren) return;

      event.preventDefault();
      const shouldExpand: boolean = event.key === "ArrowRight";
      setExpandedCodes((previousCodes: Set<string>): Set<string> => {
        const nextCodes: Set<string> = new Set<string>(previousCodes);
        if (shouldExpand) {
          nextCodes.add(activeOptionCode);
        } else {
          nextCodes.delete(activeOptionCode);
        }
        return nextCodes;
      });
    }
  };

  const handleToggleOpen = (): void => {
    if (disabled) return;
    if (isOpen) {
      setIsOpen(false);
      setQuery("");
    } else {
      setIsOpen(true);
      inputRef.current?.focus();
    }
  };

  const handleAddAccount = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    const trimmedQuery: string = query.trim();
    setIsOpen(false);
    setQuery("");
    onAddAccount?.(trimmedQuery);
  };

  const handleToggleExpand = (
    event: React.MouseEvent<HTMLElement>,
    code: string
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    setExpandedCodes((previousCodes: Set<string>): Set<string> => {
      const nextCodes: Set<string> = new Set<string>(previousCodes);
      if (nextCodes.has(code)) {
        nextCodes.delete(code);
      } else {
        nextCodes.add(code);
      }
      return nextCodes;
    });
  };

  const handleExpandAll = (): void => {
    const expandableCodes: Set<string> = new Set<string>();
    childrenByParent.forEach(
      (children: AccountCode[], parentCode: string): void => {
        if (children.length > 0) expandableCodes.add(parentCode);
      }
    );
    setExpandedCodes(expandableCodes);
  };

  const handleCollapseAll = (): void => {
    setExpandedCodes(new Set<string>());
  };

  const inputClassName: string =
    "w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-default-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400";

  return (
    <div ref={containerRef} className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-200"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <div className="flex">
          <div className="relative flex-1">
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-haspopup={hierarchical ? "tree" : "listbox"}
              aria-activedescendant={isOpen ? activeOptionId : undefined}
              aria-autocomplete="list"
              value={isOpen ? query : displayValue}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
                setQuery(event.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={(): void => {
                if (!disabled) setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              className={`${inputClassName} pr-8`}
            />
            <button
              type="button"
              onClick={handleToggleOpen}
              disabled={disabled}
              aria-label={isOpen ? "Close account options" : "Open account options"}
              className="absolute inset-y-0 right-0 flex items-center pr-2 text-default-400 hover:text-default-600 disabled:cursor-not-allowed dark:text-gray-500 dark:hover:text-gray-300"
            >
              <IconChevronDown size={16} />
            </button>
          </div>
          {onAddAccount && (
            <button
              type="button"
              onClick={handleAddAccount}
              disabled={disabled}
              title="Add account code"
              aria-label="Add account code"
              className="flex items-center pl-1 pr-2 text-default-400 hover:text-sky-600 disabled:cursor-not-allowed dark:text-gray-500 dark:hover:text-sky-400"
            >
              <IconPlus size={16} />
            </button>
          )}
        </div>
        {isOpen && !disabled && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-default-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {hierarchical && (
              <div className="flex items-center justify-between gap-3 border-b border-default-200 px-3 py-2 text-xs dark:border-gray-700">
                <span className="font-medium text-default-600 dark:text-gray-300">
                  {normalizedQuery
                    ? "Padanan dipaparkan bersama laluan akaun induk"
                    : "Account hierarchy"}
                </span>
                {!normalizedQuery && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExpandAll}
                      className="text-sky-700 hover:underline dark:text-sky-400"
                    >
                      Expand all
                    </button>
                    <span
                      className="text-default-300 dark:text-gray-600"
                      aria-hidden="true"
                    >
                      |
                    </span>
                    <button
                      type="button"
                      onClick={handleCollapseAll}
                      className="text-sky-700 hover:underline dark:text-sky-400"
                    >
                      Collapse all
                    </button>
                  </div>
                )}
              </div>
            )}

            <div
              id={listboxId}
              role={hierarchical ? "tree" : "listbox"}
            >
              {allowEmpty && (
                <div
                  id={getOptionId("")}
                  role={hierarchical ? "treeitem" : "option"}
                  aria-level={hierarchical ? 1 : undefined}
                  aria-selected={!value}
                  onMouseEnter={(): void => setActiveOptionCode("")}
                  onClick={(): void => handleSelect("")}
                  className={`flex cursor-pointer items-center justify-between gap-2 border-b border-default-100 px-3 py-2 text-sm hover:bg-sky-50 dark:border-gray-700 dark:hover:bg-sky-900/50 ${
                    !value
                      ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
                      : activeOptionCode === ""
                        ? "bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200"
                      : "text-default-700 dark:text-gray-200"
                  }`}
                >
                  <span className="font-medium">{emptyLabel}</span>
                  {!value && (
                    <IconCheck
                      size={16}
                      className="flex-shrink-0 text-sky-600 dark:text-sky-400"
                    />
                  )}
                </div>
              )}

              <div
                ref={scrollContainerRef}
                role="presentation"
                className="max-h-72 overflow-auto py-1"
              >
                {displayedRows.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-default-500 dark:text-gray-400">
                    No accounts found
                  </div>
                ) : (
                  displayedRows.map((row: AccountHierarchyRow, rowIndex: number) => {
                  const { account, depth, hasChildren, childCount, selectable } = row;
                  const isFavouriteShortcut: boolean =
                    favouritesEnabled && rowIndex < favouriteRows.length;
                  const isFavourite: boolean =
                    favouriteCodes?.has(account.code) ?? false;
                  const isFavouritePending: boolean =
                    pendingFavouriteCodes?.has(account.code) ?? false;
                  const isExpanded: boolean =
                    hasChildren &&
                    (searchVisibleCodes !== null || expandedCodes.has(account.code));
                  const isSelected: boolean = account.code === value;
                  const isActive: boolean = account.code === activeOptionCode;
                  const rowStyle: React.CSSProperties = {
                    paddingLeft: `${12 + (hierarchical ? depth * TREE_INDENT_PX : 0)}px`,
                  };

                  return (
                    <div
                      key={
                        isFavouriteShortcut
                          ? `favourite:${account.code}`
                          : account.code
                      }
                      id={
                        isFavouriteShortcut
                          ? `${getOptionId(account.code)}-favourite`
                          : getOptionId(account.code)
                      }
                      role={hierarchical ? "treeitem" : "option"}
                      aria-level={hierarchical ? depth + 1 : undefined}
                      aria-expanded={
                        hierarchical && hasChildren ? isExpanded : undefined
                      }
                      aria-selected={isSelected}
                      aria-disabled={!selectable}
                      onMouseEnter={(): void => {
                        if (selectable) setActiveOptionCode(account.code);
                      }}
                      onClick={(): void => {
                        if (selectable) handleSelect(account.code);
                      }}
                      style={rowStyle}
                      className={`flex items-center gap-2 py-2 pr-3 text-sm ${
                        selectable
                          ? "cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/50"
                          : "cursor-default bg-default-50/60 text-default-400 dark:bg-gray-900/30 dark:text-gray-500"
                      } ${
                        isFavouriteShortcut
                          ? "bg-amber-50/70 dark:bg-amber-950/20"
                          : ""
                      } ${
                        isSelected
                          ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
                          : isActive
                            ? "bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200"
                          : selectable
                            ? "text-default-900 dark:text-gray-100"
                            : ""
                      }`}
                    >
                      {hierarchical && (
                        <>
                          {hasChildren ? (
                            normalizedQuery ? (
                              <span
                                className="flex h-6 w-6 flex-shrink-0 items-center justify-center"
                                aria-hidden="true"
                              >
                                <IconChevronDown size={15} />
                              </span>
                            ) : (
                              <span
                                onClick={(
                                  event: React.MouseEvent<HTMLSpanElement>
                                ): void => handleToggleExpand(event, account.code)}
                                title={`${isExpanded ? "Collapse" : "Expand"} ${account.code}`}
                                aria-hidden="true"
                                className="flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center rounded hover:bg-default-200 dark:hover:bg-gray-600"
                              >
                                {isExpanded ? (
                                  <IconChevronDown size={15} />
                                ) : (
                                  <IconChevronRight size={15} />
                                )}
                              </span>
                            )
                          ) : (
                            <span className="h-6 w-6 flex-shrink-0" aria-hidden="true" />
                          )}

                          {hasChildren ? (
                            isExpanded ? (
                              <IconFolderOpen
                                size={17}
                                className="flex-shrink-0 text-amber-500 dark:text-amber-400"
                              />
                            ) : (
                              <IconFolder
                                size={17}
                                className="flex-shrink-0 text-amber-500 dark:text-amber-400"
                              />
                            )
                          ) : (
                            <IconFile
                              size={17}
                              className="flex-shrink-0 text-default-400 dark:text-gray-500"
                            />
                          )}
                        </>
                      )}

                      <span className="min-w-0 flex-1 truncate">
                        <span
                          className={`font-mono ${
                            hierarchical
                              ? hasChildren
                                ? "font-semibold"
                                : "font-medium"
                              : ""
                          }`}
                        >
                          {account.code}
                        </span>
                        <span className="ml-2 text-default-600 dark:text-gray-400">
                          {account.description}
                        </span>
                      </span>

                      {hierarchical && hasChildren && (
                        <span className="flex-shrink-0 whitespace-nowrap text-xs text-default-400 dark:text-gray-500">
                          {childCount} {childCount === 1 ? "child" : "children"}
                        </span>
                      )}
                      {hierarchical && !account.is_active && (
                        <span className="flex-shrink-0 rounded bg-default-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-default-500 dark:bg-gray-700 dark:text-gray-400">
                          Inactive
                        </span>
                      )}
                      {favouritesEnabled && (
                        <button
                          type="button"
                          onClick={(
                            event: React.MouseEvent<HTMLButtonElement>
                          ): void => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (isFavouritePending) return;
                            onToggleFavourite?.(account.code);
                          }}
                          disabled={isFavouritePending}
                          aria-pressed={isFavourite}
                          aria-label={
                            isFavourite
                              ? `Remove ${account.code} from favourites`
                              : `Add ${account.code} to favourites`
                          }
                          title={
                            isFavourite
                              ? "Remove from favourites"
                              : "Add to favourites"
                          }
                          className="flex-shrink-0 text-default-300 transition-colors hover:text-amber-500 disabled:cursor-wait disabled:opacity-50 dark:text-gray-500 dark:hover:text-amber-400"
                        >
                          {isFavourite ? (
                            <IconStarFilled
                              size={15}
                              className="text-amber-500 dark:text-amber-400"
                            />
                          ) : (
                            <IconStar size={15} />
                          )}
                        </button>
                      )}
                      {isSelected && (
                        <IconCheck
                          size={16}
                          className="flex-shrink-0 text-sky-600 dark:text-sky-400"
                        />
                      )}
                    </div>
                  );
                  })
                )}

                {hasMore && (
                  <div className="border-t border-gray-200 p-2 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                        event.preventDefault();
                        event.stopPropagation();
                        setLoadedCount(
                          (previousCount: number): number =>
                            previousCount + ACCOUNT_LOAD_INCREMENT
                        );
                      }}
                      className="flex w-full items-center justify-center rounded-md bg-sky-50 px-4 py-1.5 text-center text-sm font-medium text-sky-600 transition-colors duration-200 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50"
                    >
                      <IconChevronDown size={16} className="mr-1.5" />
                      <span>Load more ({remaining} remaining)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountCodeCombobox;
