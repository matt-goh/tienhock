// src/pages/Accounting/AccountCodeListPage.tsx
import React, { useState, useMemo } from "react";
import {
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconChevronRight,
  IconChevronDown,
  IconCheck,
  IconFolder,
  IconFolderOpen,
  IconFile,
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
import { AccountCode } from "../../types/types";
import {
  useAccountCodesCache,
  useLedgerTypesCache,
} from "../../utils/accounting/useAccountingCache";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";

// Tree node interface for display
interface AccountTreeNode extends AccountCode {
  children: AccountTreeNode[];
  isExpanded?: boolean;
}

const AccountCodeListPage: React.FC = () => {
  const navigate = useNavigate();

  // Cached data
  const {
    accountCodes: flatAccounts,
    isLoading: accountCodesLoading,
    refreshAccountCodes,
  } = useAccountCodesCache();
  const { ledgerTypes, isLoading: ledgerTypesLoading } = useLedgerTypesCache();

  // Derived loading state
  const loading = accountCodesLoading || ledgerTypesLoading;

  // Local state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLedgerType, setSelectedLedgerType] = useState<string>("All");
  const [showInactive, setShowInactive] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");

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

    return filtered;
  }, [flatAccounts, searchTerm, selectedLedgerType, showInactive]);

  // Filter tree for display
  const filteredTree = useMemo(() => {
    if (!searchTerm && selectedLedgerType === "All" && showInactive) {
      return accountCodes;
    }

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
  }, [accountCodes, filteredAccounts, searchTerm, selectedLedgerType, showInactive]);

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

  // Get ledger type name
  const getLedgerTypeName = (code: string | null): string => {
    if (!code) return "-";
    const lt = ledgerTypes.find((t) => t.code === code);
    return lt ? `${lt.code} (${lt.name})` : code;
  };

  // Render tree node
  const renderTreeNode = (
    node: AccountTreeNode,
    depth: number = 0
  ): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.code);
    const paddingLeft = depth * 24 + 8;

    return (
      <React.Fragment key={node.code}>
        <tr
          className={`hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer ${
            !node.is_active ? "opacity-50" : ""
          }`}
          onClick={() => handleEditClick(node)}
        >
          <td
            className="px-2 py-2 text-sm"
            style={{ paddingLeft: `${paddingLeft}px` }}
          >
            <div className="flex items-center">
              {hasChildren ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(node.code);
                  }}
                  className="p-1 hover:bg-default-200 dark:hover:bg-gray-600 rounded mr-1"
                >
                  {isExpanded ? (
                    <IconChevronDown size={16} />
                  ) : (
                    <IconChevronRight size={16} />
                  )}
                </button>
              ) : (
                <span className="w-7" />
              )}
              {hasChildren ? (
                isExpanded ? (
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
                  className="text-default-400 dark:text-gray-500 dark:text-gray-400 mr-2 flex-shrink-0"
                />
              )}
              <span className="font-mono text-sky-700 dark:text-sky-400 font-medium">
                {node.code}
              </span>
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
        {hasChildren && isExpanded && (
          <>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </>
        )}
      </React.Fragment>
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
          <span className="font-mono text-sky-700 dark:text-sky-400 font-medium">
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
        <td className="px-4 py-2 text-sm text-default-600 dark:text-gray-300 font-mono">
          {account.parent_code || "-"}
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
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-4 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Chart of Accounts
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
            Manage account codes and hierarchy
          </p>
        </div>
        <Button
          onClick={handleAddClick}
          color="sky"
          variant="filled"
          icon={IconPlus}
          iconPosition="left"
          size="md"
        >
          Add Account
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {/* Ledger Type Filter */}
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-sm text-default-700 dark:text-gray-200">Type:</span>
            <Listbox
              value={selectedLedgerType}
              onChange={setSelectedLedgerType}
            >
              <div className="relative">
                <ListboxButton className="relative w-40 cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm dark:bg-gray-700 dark:text-gray-100">
                  <span className="block truncate text-gray-900 dark:text-gray-100">
                    {selectedLedgerType === "All"
                      ? "All Types"
                      : selectedLedgerType}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <IconChevronDown size={20} className="text-gray-400 dark:text-gray-500 dark:text-gray-400" />
                  </span>
                </ListboxButton>
                <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                  <ListboxOption
                    value="All"
                    className={({ active }) =>
                      `relative cursor-default select-none py-2 pl-10 pr-4 ${
                        active ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-300" : "text-gray-900 dark:text-gray-100"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          All Types
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                            <IconCheck size={20} />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                  {ledgerTypes.map((lt) => (
                    <ListboxOption
                      key={lt.code}
                      value={lt.code}
                      className={({ active }) =>
                        `relative cursor-default select-none py-2 pl-10 pr-4 ${
                          active ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-300" : "text-gray-900 dark:text-gray-100"
                        }`
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span
                            className={`block truncate ${
                              selected ? "font-medium" : "font-normal"
                            }`}
                          >
                            {lt.code} - {lt.name}
                          </span>
                          {selected && (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                              <IconCheck size={20} />
                            </span>
                          )}
                        </>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </div>
            </Listbox>
          </div>

          {/* Show Inactive Toggle */}
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-default-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="text-sm text-default-700 dark:text-gray-200">Show Inactive</span>
          </label>

          {/* View Mode Toggle */}
          <div className="flex items-center space-x-1 bg-default-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode("tree")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === "tree"
                  ? "bg-white dark:bg-gray-700 shadow text-default-900 dark:text-gray-100"
                  : "text-default-600 dark:text-gray-300 hover:text-default-900 dark:hover:text-gray-100"
              }`}
            >
              Tree
            </button>
            <button
              onClick={() => setViewMode("flat")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === "flat"
                  ? "bg-white dark:bg-gray-700 shadow text-default-900 dark:text-gray-100"
                  : "text-default-600 dark:text-gray-300 hover:text-default-900 dark:hover:text-gray-100"
              }`}
            >
              Flat
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-full md:w-64">
            <IconSearch
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search code or description..."
              className="w-full rounded-full border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300"
                onClick={() => setSearchTerm("")}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Expand/Collapse buttons for tree view */}
          {viewMode === "tree" && (
            <div className="flex items-center gap-1">
              <button
                onClick={expandAll}
                className="p-2 text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-100 hover:bg-default-100 dark:hover:bg-gray-700 rounded"
                title="Expand All"
              >
                <IconFolderOpen size={20} />
              </button>
              <button
                onClick={collapseAll}
                className="p-2 text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-100 hover:bg-default-100 dark:hover:bg-gray-700 rounded"
                title="Collapse All"
              >
                <IconFolder size={20} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4 flex items-center gap-4 text-sm text-default-600 dark:text-gray-400">
        <span>
          Total:{" "}
          <span className="font-medium text-default-900 dark:text-gray-100">
            {flatAccounts.length}
          </span>{" "}
          accounts
        </span>
        {searchTerm || selectedLedgerType !== "All" || !showInactive ? (
          <span>
            Showing:{" "}
            <span className="font-medium text-default-900 dark:text-gray-100">
              {filteredAccounts.length}
            </span>
          </span>
        ) : null}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center my-20">
          <LoadingSpinner />
        </div>
      ) : (
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
                filteredTree.length > 0 ? (
                  filteredTree.map((node) => renderTreeNode(node, 0))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                    >
                      No account codes found.{" "}
                      {searchTerm || selectedLedgerType !== "All"
                        ? "Try adjusting your filters."
                        : "Create one to get started."}
                    </td>
                  </tr>
                )
              ) : filteredAccounts.length > 0 ? (
                filteredAccounts.map((account) => renderFlatRow(account))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                  >
                    No account codes found.{" "}
                    {searchTerm || selectedLedgerType !== "All"
                      ? "Try adjusting your filters."
                      : "Create one to get started."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
