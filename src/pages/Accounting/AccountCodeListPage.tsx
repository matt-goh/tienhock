// src/pages/Accounting/AccountCodeListPage.tsx
import React, { useState, useMemo, useEffect } from "react";
import {
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconCheck,
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconX,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { api } from "../../routes/utils/api";
import { AccountCode, LedgerType } from "../../types/types";
import {
  useAccountCodesCache,
  useLedgerTypesCache,
} from "../../utils/accounting/useAccountingCache";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import Checkbox from "../../components/Checkbox";
import ListboxSelect, {
  ListboxSelectOption,
} from "../../components/ListboxSelect";
import useAccountCodeFavourites from "../../hooks/useAccountCodeFavourites";

// Financial statement note interface
interface FinancialStatementNote {
  code: string;
  name: string;
  category: string;
  report_section: string;
}

// Tree node interface for display
interface AccountTreeNode extends AccountCode {
  children: AccountTreeNode[];
  isExpanded?: boolean;
}

interface VisibleTreeRow {
  node: AccountTreeNode;
  depth: number;
}

interface TreeDisplayRow extends VisibleTreeRow {
  isFavouriteShortcut: boolean;
}

type PaginationPageItem = number | "ellipsis";

const ACCOUNT_CODES_PAGE_SIZE = 100;

interface FsNoteListboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ListboxSelectOption[];
  ariaLabel: string;
}

const FsNoteListbox: React.FC<FsNoteListboxProps> = ({
  value,
  onChange,
  options,
  ariaLabel,
}) => {
  const selectedOption: ListboxSelectOption | undefined = options.find(
    (option: ListboxSelectOption): boolean => option.value === value
  );

  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton
        aria-label={ariaLabel}
        className="relative w-full cursor-pointer rounded-md border border-default-200 bg-white py-1 pl-2 pr-8 text-left text-xs text-default-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
      >
        <span className="block truncate">{selectedOption?.label || "-"}</span>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <IconChevronDown
            size={15}
            className="text-default-400 dark:text-gray-500"
          />
        </span>
      </ListboxButton>
      <ListboxOptions
        anchor={{ to: "bottom end", gap: 4 }}
        transition
        className="z-[100] max-h-60 w-80 max-w-[calc(100vw-2rem)] origin-top overflow-auto rounded-md bg-white py-1 text-xs shadow-lg ring-1 ring-black/5 transition duration-100 ease-in focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 dark:bg-gray-800 dark:ring-gray-700"
      >
        {options.map((option: ListboxSelectOption) => (
          <ListboxOption
            key={option.value}
            value={option.value}
            className="relative cursor-pointer select-none py-2 pl-3 pr-9 text-default-900 data-[focus]:bg-sky-100 data-[focus]:text-sky-900 dark:text-gray-100 dark:data-[focus]:bg-sky-900/40 dark:data-[focus]:text-sky-200"
          >
            {({ selected }: { selected: boolean }): React.ReactElement => (
              <>
                <span className={selected ? "font-medium" : "font-normal"}>
                  {option.label}
                </span>
                {selected && (
                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                    <IconCheck size={15} />
                  </span>
                )}
              </>
            )}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
};

const AccountCodeListPage: React.FC = () => {
  const navigate = useNavigate();

  // Cached data
  const {
    accountCodes: flatAccounts,
    isLoading: accountCodesLoading,
    refreshAccountCodes,
  } = useAccountCodesCache();
  const { ledgerTypes, isLoading: ledgerTypesLoading } = useLedgerTypesCache();
  const {
    favouriteCodes,
    pendingCodes: pendingFavouriteCodes,
    isLoading: favouritesLoading,
    toggleFavourite,
  } = useAccountCodeFavourites();

  // Financial statement notes state
  const [fsNotes, setFsNotes] = useState<FinancialStatementNote[]>([]);
  const [fsNotesLoading, setFsNotesLoading] = useState(true);

  // Fetch financial statement notes
  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const response = await api.get("/api/financial-reports/notes");
        setFsNotes(response || []);
      } catch (error) {
        console.error("Error fetching financial statement notes:", error);
      } finally {
        setFsNotesLoading(false);
      }
    };
    fetchNotes();
  }, []);

  // Derived loading state
  const loading =
    accountCodesLoading ||
    ledgerTypesLoading ||
    fsNotesLoading ||
    favouritesLoading;

  // Local state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLedgerType, setSelectedLedgerType] = useState<string>("All");
  const [showInactive, setShowInactive] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<AccountCode | null>(
    null
  );

  // Build tree structure from flat list (memoized)
  const accountCodes = useMemo(() => {
    const map = new Map<string, AccountTreeNode>();
    const roots: AccountTreeNode[] = [];

    // First pass: create nodes
    flatAccounts.forEach((account) => {
      map.set(account.code, { ...account, children: [] });
    });

    // Second pass: build relationships
    flatAccounts.forEach((account) => {
      const node = map.get(account.code)!;
      if (account.parent_code && map.has(account.parent_code)) {
        map.get(account.parent_code)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort children
    const sortNodes = (nodes: AccountTreeNode[]): AccountTreeNode[] => {
      return nodes
        .sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.code.localeCompare(b.code);
        })
        .map((node) => ({
          ...node,
          children: sortNodes(node.children),
        }));
    };

    return sortNodes(roots);
  }, [flatAccounts]);

  const parentCodes = useMemo((): Set<string> => {
    const codes: Set<string> = new Set<string>();
    flatAccounts.forEach((account: AccountCode): void => {
      if (account.parent_code) codes.add(account.parent_code);
    });
    return codes;
  }, [flatAccounts]);

  const ledgerTypeOptions = useMemo((): ListboxSelectOption[] => {
    return [
      { value: "All", label: "All Types" },
      ...ledgerTypes.map((ledgerType: LedgerType): ListboxSelectOption => ({
        value: ledgerType.code,
        label: `${ledgerType.code} - ${ledgerType.name}`,
      })),
    ];
  }, [ledgerTypes]);

  const fsNoteOptions = useMemo((): ListboxSelectOption[] => {
    return [
      { value: "", label: "-" },
      ...fsNotes.map((note: FinancialStatementNote): ListboxSelectOption => ({
        value: note.code,
        label: `${note.code} - ${note.name}`,
      })),
    ];
  }, [fsNotes]);

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    let filtered = flatAccounts;

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.code.toLowerCase().includes(term) ||
          a.description.toLowerCase().includes(term)
      );
    }

    // Filter by ledger type
    if (selectedLedgerType !== "All") {
      filtered = filtered.filter((a) => a.ledger_type === selectedLedgerType);
    }

    // Filter by active status
    if (!showInactive) {
      filtered = filtered.filter((a) => a.is_active);
    }

    filtered = filtered.filter(
      (account: AccountCode): boolean =>
        parentCodes.has(account.code) ||
        !account.parent_code ||
        favouriteCodes.has(account.code)
    );

    return filtered;
  }, [
    flatAccounts,
    searchTerm,
    selectedLedgerType,
    showInactive,
    parentCodes,
    favouriteCodes,
  ]);

  // Filter tree for display
  const filteredTree = useMemo(() => {
    // When filtering, show flat list or filtered tree
    const filteredCodes = new Set(filteredAccounts.map((a) => a.code));

    const filterTree = (nodes: AccountTreeNode[]): AccountTreeNode[] => {
      return nodes
        .filter((node) => {
          // Include if matches filter or has matching children
          const matchesFilter = filteredCodes.has(node.code);
          const hasMatchingChildren = node.children.some(
            (child) =>
              filteredCodes.has(child.code) ||
              filterTree([child]).length > 0
          );
          return matchesFilter || hasMatchingChildren;
        })
        .map((node) => ({
          ...node,
          children: filterTree(node.children),
        }));
    };

    return filterTree(accountCodes);
  }, [accountCodes, filteredAccounts]);

  const revealFilteredBranches: boolean = searchTerm.length > 0;

  const orderedFilteredAccounts = useMemo((): AccountCode[] => {
    const favourites: AccountCode[] = [];
    const remainingAccounts: AccountCode[] = [];

    filteredAccounts.forEach((account: AccountCode): void => {
      if (favouriteCodes.has(account.code)) favourites.push(account);
      else remainingAccounts.push(account);
    });

    return [...favourites, ...remainingAccounts];
  }, [filteredAccounts, favouriteCodes]);

  // Open the permanent parent-account view by default, while still allowing the
  // user to collapse individual branches afterwards.
  useEffect((): void => {
    const codesToExpand: Set<string> = new Set<string>();
    const collectFilteredParents = (nodes: AccountTreeNode[]): void => {
      nodes.forEach((node: AccountTreeNode): void => {
        if (node.children.length > 0) {
          codesToExpand.add(node.code);
          collectFilteredParents(node.children);
        }
      });
    };

    collectFilteredParents(filteredTree);

    if (codesToExpand.size === 0) return;
    setExpandedNodes((previousCodes: Set<string>): Set<string> => {
      const nextCodes: Set<string> = new Set<string>(previousCodes);
      codesToExpand.forEach((code: string): void => {
        nextCodes.add(code);
      });
      return nextCodes.size === previousCodes.size ? previousCodes : nextCodes;
    });
  }, [filteredTree]);

  const visibleTreeRows = useMemo((): VisibleTreeRow[] => {
    const rows: VisibleTreeRow[] = [];

    const appendVisibleRows = (
      nodes: AccountTreeNode[],
      depth: number
    ): void => {
      nodes.forEach((node: AccountTreeNode) => {
        rows.push({ node, depth });

        if (
          node.children.length > 0 &&
          (expandedNodes.has(node.code) || revealFilteredBranches)
        ) {
          appendVisibleRows(node.children, depth + 1);
        }
      });
    };

    appendVisibleRows(filteredTree, 0);
    return rows;
  }, [filteredTree, expandedNodes, revealFilteredBranches]);

  const treeDisplayRows = useMemo((): TreeDisplayRow[] => {
    const favouriteRows: TreeDisplayRow[] = orderedFilteredAccounts
      .filter((account: AccountCode): boolean =>
        favouriteCodes.has(account.code)
      )
      .map(
        (account: AccountCode): TreeDisplayRow => ({
          node: { ...account, children: [] },
          depth: 0,
          isFavouriteShortcut: true,
        })
      );
    const hierarchyRows: TreeDisplayRow[] = visibleTreeRows.map(
      (row: VisibleTreeRow): TreeDisplayRow => ({
        ...row,
        isFavouriteShortcut: false,
      })
    );
    return [...favouriteRows, ...hierarchyRows];
  }, [orderedFilteredAccounts, visibleTreeRows, favouriteCodes]);

  const totalDisplayItems: number =
    viewMode === "tree"
      ? treeDisplayRows.length
      : orderedFilteredAccounts.length;
  const totalPages: number = Math.max(
    1,
    Math.ceil(totalDisplayItems / ACCOUNT_CODES_PAGE_SIZE)
  );
  const effectiveCurrentPage: number = Math.min(currentPage, totalPages);
  const pageStartIndex: number =
    (effectiveCurrentPage - 1) * ACCOUNT_CODES_PAGE_SIZE;
  const pageEndIndex: number = Math.min(
    pageStartIndex + ACCOUNT_CODES_PAGE_SIZE,
    totalDisplayItems
  );
  const pageStartDisplay: number =
    totalDisplayItems > 0 ? pageStartIndex + 1 : 0;

  const paginatedTreeRows = useMemo((): TreeDisplayRow[] => {
    return treeDisplayRows.slice(pageStartIndex, pageEndIndex);
  }, [treeDisplayRows, pageStartIndex, pageEndIndex]);

  const paginatedFlatAccounts = useMemo((): AccountCode[] => {
    return orderedFilteredAccounts.slice(pageStartIndex, pageEndIndex);
  }, [orderedFilteredAccounts, pageStartIndex, pageEndIndex]);

  const paginationPageItems = useMemo((): PaginationPageItem[] => {
    const maxVisiblePages: number = 5;
    const pageItems: PaginationPageItem[] = [];

    if (totalPages <= maxVisiblePages) {
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        pageItems.push(pageNumber);
      }
      return pageItems;
    }

    pageItems.push(1);

    const middleStart: number = Math.max(2, effectiveCurrentPage - 1);
    const middleEnd: number = Math.min(
      totalPages - 1,
      effectiveCurrentPage + 1
    );

    if (middleStart > 2) {
      pageItems.push("ellipsis");
    }

    for (let pageNumber = middleStart; pageNumber <= middleEnd; pageNumber++) {
      pageItems.push(pageNumber);
    }

    if (middleEnd < totalPages - 1) {
      pageItems.push("ellipsis");
    }

    pageItems.push(totalPages);
    return pageItems;
  }, [effectiveCurrentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedLedgerType, showInactive, viewMode]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handlePageChange = (page: number): void => {
    const nextPage: number = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(nextPage);
  };

  const handleFavouriteToggle = (
    accountCode: string,
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.stopPropagation();
    if (pendingFavouriteCodes.has(accountCode)) return;
    setCurrentPage(1);
    void toggleFavourite(accountCode);
  };

  // Toggle node expansion
  const toggleExpand = (code: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(code)) {
        newSet.delete(code);
      } else {
        newSet.add(code);
      }
      return newSet;
    });
  };

  // Expand all nodes
  const expandAll = () => {
    const allCodes = flatAccounts
      .filter((a) => {
        // Only expand nodes that have children
        return flatAccounts.some((child) => child.parent_code === a.code);
      })
      .map((a) => a.code);
    setExpandedNodes(new Set(allCodes));
  };

  // Collapse all nodes
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Handlers
  const handleAddClick = () => {
    navigate("/accounting/account-codes/new");
  };

  const handleEditClick = (account: AccountCode) => {
    navigate(`/accounting/account-codes/${account.code}`);
  };

  const handleDeleteClick = (account: AccountCode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (account.is_system) {
      toast.error("Cannot delete system account");
      return;
    }
    setAccountToDelete(account);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!accountToDelete) return;

    try {
      await api.delete(`/api/account-codes/${accountToDelete.code}`);
      toast.success("Account code deleted successfully");
      setShowDeleteDialog(false);
      setAccountToDelete(null);
      // Refresh the cache to reflect the deletion
      refreshAccountCodes();
    } catch (error: unknown) {
      console.error("Error deleting account:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete account code";
      toast.error(errorMessage);
    }
  };

  // Handle fs_note update
  const handleFsNoteChange = async (
    accountCode: string,
    newFsNote: string | null
  ): Promise<void> => {
    try {
      await api.patch(`/api/account-codes/${accountCode}/fs-note`, {
        fs_note: newFsNote,
      });
      toast.success("Note updated");
      refreshAccountCodes();
    } catch (error) {
      console.error("Error updating fs_note:", error);
      toast.error("Failed to update note");
    }
  };

  // Render tree row
  const renderTreeRow = (
    node: AccountTreeNode,
    depth: number,
    isFavouriteShortcut: boolean = false
  ): React.ReactNode => {
    const hasVisibleChildren: boolean =
      !isFavouriteShortcut && node.children.length > 0;
    const isParentAccount: boolean = parentCodes.has(node.code);
    const isExpanded: boolean = expandedNodes.has(node.code);
    const isVisuallyExpanded: boolean =
      hasVisibleChildren && (isExpanded || revealFilteredBranches);
    const paddingLeft: number = depth * 24 + 8;

    return (
      <tr
        key={
          isFavouriteShortcut
            ? `favourite-shortcut:${node.code}`
            : `hierarchy:${node.code}`
        }
        className={`cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700 ${
          isFavouriteShortcut
            ? "bg-amber-50/70 dark:bg-amber-950/20"
            : ""
        } ${!node.is_active ? "opacity-50" : ""}`}
        onClick={() => handleEditClick(node)}
      >
        <td
          className="px-2 py-2 text-sm"
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          <div className="flex items-center">
            {hasVisibleChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.code);
                }}
                disabled={revealFilteredBranches}
                className="mr-1 rounded p-1 hover:bg-default-200 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-gray-600 dark:disabled:hover:bg-transparent"
                title={
                  revealFilteredBranches
                    ? "Search result branches are expanded automatically"
                    : isExpanded
                    ? "Collapse account"
                    : "Expand account"
                }
              >
                {isVisuallyExpanded ? (
                  <IconChevronDown size={16} />
                ) : (
                  <IconChevronRight size={16} />
                )}
              </button>
            ) : (
              <span className="w-7" />
            )}
            {isParentAccount ? (
              isVisuallyExpanded ? (
                <IconFolderOpen
                  size={18}
                  className="text-amber-500 dark:text-amber-400 mr-2 flex-shrink-0"
                />
              ) : (
                <IconFolder
                  size={18}
                  className="text-amber-500 dark:text-amber-400 mr-2 flex-shrink-0"
                />
              )
            ) : (
              <IconFile
                size={18}
                className="text-default-400 dark:text-gray-400 mr-2 flex-shrink-0"
              />
            )}
            <span className="text-sky-700 dark:text-sky-400 font-medium">
              {node.code}
            </span>
            {isFavouriteShortcut && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                Favourite
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
          {node.description}
        </td>
        <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
          {node.ledger_type ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200">
              {node.ledger_type}
            </span>
          ) : (
            "-"
          )}
        </td>
        <td className="px-4 py-2 text-sm" onClick={(e) => e.stopPropagation()}>
          <FsNoteListbox
            value={node.fs_note || ""}
            onChange={(value: string): void => {
              void handleFsNoteChange(node.code, value || null);
            }}
            options={fsNoteOptions}
            ariaLabel={`FS Note for ${node.code}`}
          />
        </td>
        <td className="px-4 py-2 text-center text-sm">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              node.is_active
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            }`}
          >
            {node.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-4 py-2 text-center text-sm">
          <div className="flex items-center justify-center space-x-2">
            <button
              type="button"
              onClick={(event: React.MouseEvent<HTMLButtonElement>): void =>
                handleFavouriteToggle(node.code, event)
              }
              disabled={pendingFavouriteCodes.has(node.code)}
              aria-pressed={favouriteCodes.has(node.code)}
              aria-label={
                favouriteCodes.has(node.code)
                  ? `Remove ${node.code} from favourites`
                  : `Add ${node.code} to favourites`
              }
              className="text-default-300 transition-colors hover:text-amber-500 disabled:cursor-wait disabled:opacity-50 dark:text-gray-500 dark:hover:text-amber-400"
              title={
                favouriteCodes.has(node.code)
                  ? "Remove from favourites"
                  : "Add to favourites"
              }
            >
              {favouriteCodes.has(node.code) ? (
                <IconStarFilled
                  size={18}
                  className="text-amber-500 dark:text-amber-400"
                />
              ) : (
                <IconStar size={18} />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditClick(node);
              }}
              className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
              title="Edit"
            >
              <IconPencil size={18} />
            </button>
            {!node.is_system && (
              <button
                onClick={(e) => handleDeleteClick(node, e)}
                className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"
                title="Delete"
              >
                <IconTrash size={18} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // Render flat row
  const renderFlatRow = (account: AccountCode): React.ReactNode => {
    return (
      <tr
        key={account.code}
        className={`hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer ${
          !account.is_active ? "opacity-50" : ""
        }`}
        onClick={() => handleEditClick(account)}
      >
        <td className="px-4 py-2 text-sm">
          <span className="text-sky-700 dark:text-sky-400 font-medium">
            {account.code}
          </span>
        </td>
        <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
          {account.description}
        </td>
        <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
          {account.ledger_type ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200">
              {account.ledger_type}
            </span>
          ) : (
            "-"
          )}
        </td>
        <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300">
          {account.parent_code || "-"}
        </td>
        <td className="px-4 py-2 text-sm" onClick={(e) => e.stopPropagation()}>
          <FsNoteListbox
            value={account.fs_note || ""}
            onChange={(value: string): void => {
              void handleFsNoteChange(account.code, value || null);
            }}
            options={fsNoteOptions}
            ariaLabel={`FS Note for ${account.code}`}
          />
        </td>
        <td className="px-4 py-2 text-center text-sm">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              account.is_active
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            }`}
          >
            {account.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-4 py-2 text-center text-sm">
          <div className="flex items-center justify-center space-x-2">
            <button
              type="button"
              onClick={(event: React.MouseEvent<HTMLButtonElement>): void =>
                handleFavouriteToggle(account.code, event)
              }
              disabled={pendingFavouriteCodes.has(account.code)}
              aria-pressed={favouriteCodes.has(account.code)}
              aria-label={
                favouriteCodes.has(account.code)
                  ? `Remove ${account.code} from favourites`
                  : `Add ${account.code} to favourites`
              }
              className="text-default-300 transition-colors hover:text-amber-500 disabled:cursor-wait disabled:opacity-50 dark:text-gray-500 dark:hover:text-amber-400"
              title={
                favouriteCodes.has(account.code)
                  ? "Remove from favourites"
                  : "Add to favourites"
              }
            >
              {favouriteCodes.has(account.code) ? (
                <IconStarFilled
                  size={18}
                  className="text-amber-500 dark:text-amber-400"
                />
              ) : (
                <IconStar size={18} />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditClick(account);
              }}
              className="text-sky-600 hover:text-sky-800"
              title="Edit"
            >
              <IconPencil size={18} />
            </button>
            {!account.is_system && (
              <button
                onClick={(e) => handleDeleteClick(account, e)}
                className="text-rose-600 hover:text-rose-800"
                title="Delete"
              >
                <IconTrash size={18} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      {/* Compact toolbar: one row on wide screens, responsive below that. */}
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap 2xl:gap-x-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-default-700 dark:text-gray-200">
              Type:
            </span>
            <ListboxSelect
              value={selectedLedgerType}
              onChange={setSelectedLedgerType}
              options={ledgerTypeOptions}
              className="w-32 2xl:w-40"
              buttonClassName="!rounded-md !py-1.5 !text-sm !shadow-none"
              ariaLabel="Filter by ledger type"
            />
          </div>

          <Checkbox
            checked={showInactive}
            onChange={setShowInactive}
            label={
              <>
                <span className="2xl:hidden">Inactive</span>
                <span className="hidden 2xl:inline">Show Inactive</span>
              </>
            }
            size={18}
            checkedColor="text-sky-600 dark:text-sky-400"
            className="whitespace-nowrap"
            ariaLabel="Show inactive accounts"
          />

          {/* View Mode Toggle */}
          <div className="flex items-center space-x-1 rounded-lg bg-default-100 p-1 dark:bg-gray-800">
            <button
              type="button"
              onClick={(): void => setViewMode("tree")}
              className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                viewMode === "tree"
                  ? "bg-white text-default-900 shadow dark:bg-gray-700 dark:text-gray-100"
                  : "text-default-600 hover:text-default-900 dark:text-gray-300 dark:hover:text-gray-100"
              }`}
            >
              Tree
            </button>
            <button
              type="button"
              onClick={(): void => setViewMode("flat")}
              className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                viewMode === "flat"
                  ? "bg-white text-default-900 shadow dark:bg-gray-700 dark:text-gray-100"
                  : "text-default-600 hover:text-default-900 dark:text-gray-300 dark:hover:text-gray-100"
              }`}
            >
              Flat
            </button>
          </div>

          {/* Expand/Collapse controls follow the tree view selector. */}
          {viewMode === "tree" && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={expandAll}
                disabled={revealFilteredBranches}
                className="rounded p-1.5 text-default-600 hover:bg-default-100 hover:text-default-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                title={
                  revealFilteredBranches
                    ? "Search result branches are expanded automatically"
                    : "Expand All"
                }
                aria-label="Expand all accounts"
              >
                <IconFolderOpen size={19} />
              </button>
              <button
                type="button"
                onClick={collapseAll}
                disabled={revealFilteredBranches}
                className="rounded p-1.5 text-default-600 hover:bg-default-100 hover:text-default-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                title={
                  revealFilteredBranches
                    ? "Search result branches are expanded automatically"
                    : "Collapse All"
                }
                aria-label="Collapse all accounts"
              >
                <IconFolder size={19} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
            <span>
              Total:{" "}
              <span className="font-medium text-default-900 dark:text-gray-100">
                {flatAccounts.length}
              </span>
              <span className="hidden 2xl:inline"> accounts</span>
            </span>
            <span className="text-default-300 dark:text-gray-600">|</span>
            <span>
              <span className="2xl:hidden">Shown: </span>
              <span className="hidden 2xl:inline">Showing: </span>
              <span className="font-medium text-default-900 dark:text-gray-100">
                {filteredAccounts.length}
              </span>
            </span>
          </div>
        </div>

        <div className="flex w-full flex-shrink-0 items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none xl:w-36 2xl:w-56">
            <IconSearch
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search code or description..."
              className="w-full rounded-full border border-default-300 bg-white py-1.5 pl-9 pr-8 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
              value={searchTerm}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                setSearchTerm(event.target.value)
              }
            />
            {searchTerm && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[0px] text-default-400 hover:text-default-700 dark:text-gray-400 dark:hover:text-gray-200"
                onClick={(): void => setSearchTerm("")}
                title="Clear search"
                aria-label="Clear search"
              >
                <IconX size={15} />
              </button>
            )}
          </div>

          <Button
            onClick={handleAddClick}
            color="sky"
            variant="filled"
            icon={IconPlus}
            iconPosition="left"
            size="sm"
            className="whitespace-nowrap"
          >
            <span className="2xl:hidden">Add</span>
            <span className="hidden 2xl:inline">Add Account</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center my-20">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-100 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 min-w-[200px]">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-28">
                    Type
                  </th>
                  {viewMode === "flat" && (
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-32">
                      Parent
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-40">
                    FS Note
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-24">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {viewMode === "tree" ? (
                  paginatedTreeRows.length > 0 ? (
                    paginatedTreeRows.map(
                      ({ node, depth, isFavouriteShortcut }: TreeDisplayRow) =>
                        renderTreeRow(node, depth, isFavouriteShortcut)
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                      >
                        No account codes found.{" "}
                        {searchTerm ||
                        selectedLedgerType !== "All" ||
                        !showInactive
                          ? "Try adjusting your filters."
                          : "Create one to get started."}
                      </td>
                    </tr>
                  )
                ) : paginatedFlatAccounts.length > 0 ? (
                  paginatedFlatAccounts.map((account) => renderFlatRow(account))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                    >
                      No account codes found.{" "}
                      {searchTerm ||
                      selectedLedgerType !== "All" ||
                      !showInactive
                        ? "Try adjusting your filters."
                        : "Create one to get started."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalDisplayItems > 0 && (
            <div className="flex flex-col items-start justify-between gap-3 text-sm text-default-600 dark:text-gray-400 md:flex-row md:items-center">
              <p>
                Showing{" "}
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {pageStartDisplay}
                </span>{" "}
                to{" "}
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {pageEndIndex}
                </span>{" "}
                of{" "}
                <span className="font-medium text-default-900 dark:text-gray-100">
                  {totalDisplayItems}
                </span>{" "}
                {viewMode === "tree" ? "visible rows" : "accounts"}
              </p>

              {totalPages > 1 && (
                <nav
                  className="flex items-center gap-1"
                  aria-label="Account code pagination"
                >
                  <button
                    onClick={() => handlePageChange(effectiveCurrentPage - 1)}
                    disabled={effectiveCurrentPage === 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-default-300 bg-white text-default-700 transition-colors hover:bg-default-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    title="Previous page"
                    aria-label="Previous page"
                  >
                    <IconChevronLeft size={18} />
                  </button>

                  {paginationPageItems.map((pageItem, index) =>
                    pageItem === "ellipsis" ? (
                      <span
                        key={`${pageItem}-${index}`}
                        className="inline-flex h-9 w-9 items-center justify-center text-default-500 dark:text-gray-500"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={pageItem}
                        onClick={() => handlePageChange(pageItem)}
                        className={`inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-full px-3 text-sm font-medium transition-colors ${
                          pageItem === effectiveCurrentPage
                            ? "bg-sky-600 text-white"
                            : "border border-default-300 bg-white text-default-700 hover:bg-default-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        }`}
                        aria-current={
                          pageItem === effectiveCurrentPage ? "page" : undefined
                        }
                      >
                        {pageItem}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => handlePageChange(effectiveCurrentPage + 1)}
                    disabled={effectiveCurrentPage === totalPages}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-default-300 bg-white text-default-700 transition-colors hover:bg-default-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    title="Next page"
                    aria-label="Next page"
                  >
                    <IconChevronRight size={18} />
                  </button>
                </nav>
              )}
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Account Code"
        message={`Are you sure you want to delete account "${accountToDelete?.code}"? This action cannot be undone.`}
        variant="danger"
      />
    </div>
  );
};

export default AccountCodeListPage;
