// src/components/Catalogue/BranchLinkageModal.tsx
import React, { useState, useEffect, Fragment, useMemo } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../LoadingSpinner";
import toast from "react-hot-toast";
import {
  useCustomersCache,
  refreshCustomersCache,
  EnhancedCustomerList,
} from "../../utils/catalogue/useCustomerCache";
import { CustomerCombobox } from "../Invoice/CustomerCombobox";
import { FormInput } from "../FormComponents";
import { MultiCustomerCombobox } from "../Invoice/MultiCustomerCombobox";
import ConfirmationDialog from "../ConfirmationDialog";
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconSearch,
  IconAlertTriangle,
  IconBuildingSkyscraper,
} from "@tabler/icons-react";
import { useTranslation, Trans } from "react-i18next";

interface BranchGroup {
  id: number;
  group_name: string;
  branches: BranchMember[];
}

interface BranchMember {
  customer_id: string;
  customer_name: string;
  is_main_branch: boolean;
}

interface BranchLinkageModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCustomerId?: string; // Made optional
}

const ITEMS_PER_PAGE = 30;
// A group table longer than this gets its own search box.
const BRANCH_SEARCH_THRESHOLD = 8;

const matchesQuery = (
  customer: { id: string; name: string; phone_number?: string | null },
  query: string
): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    customer.name.toLowerCase().includes(q) ||
    customer.id.toLowerCase().includes(q) ||
    Boolean(customer.phone_number?.toLowerCase().includes(q))
  );
};

const BranchLinkageModal: React.FC<BranchLinkageModalProps> = ({
  isOpen,
  onClose,
  initialCustomerId,
}) => {
  const { t } = useTranslation("catalogue");
  const { customers, isLoading: fetchingCustomers } = useCustomersCache();

  const [saving, setSaving] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomerId || ""
  );
  // The group being edited is tracked by id only; the group itself is always
  // derived from the customer cache so it can never show stale membership.
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [branchTableQuery, setBranchTableQuery] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [addBranchQuery, setAddBranchQuery] = useState("");
  const [additionalBranchQuery, setAdditionalBranchQuery] = useState("");

  const [customerPage, setCustomerPage] = useState(1);
  const [availableBranchPage, setAvailableBranchPage] = useState(1);
  const [newGroupPage, setNewGroupPage] = useState(1);

  const [isDeleteGroupDialogOpen, setIsDeleteGroupDialogOpen] = useState(false);
  const [isAddConfirmOpen, setIsAddConfirmOpen] = useState(false);
  const [isCreateConfirmOpen, setIsCreateConfirmOpen] = useState(false);
  const [branchToRemove, setBranchToRemove] = useState<BranchMember | null>(
    null
  );

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Every branch group, derived from the customer cache. Recomputing from the
  // cache is what keeps the UI correct after add/remove/create/set-main.
  const branchGroups = useMemo<BranchGroup[]>(() => {
    const groupsMap: { [key: number]: BranchGroup } = {};

    customers.forEach((customer) => {
      const info = customer.branchInfo;
      if (!info?.isInBranchGroup || !info.groupId) return;
      if (groupsMap[info.groupId]) return;

      groupsMap[info.groupId] = {
        id: info.groupId,
        group_name: info.groupName || `Group ${info.groupId}`,
        branches: [],
      };
    });

    customers.forEach((customer) => {
      const info = customer.branchInfo;
      if (!info?.isInBranchGroup || !info.groupId) return;
      groupsMap[info.groupId]?.branches.push({
        customer_id: customer.id,
        customer_name: customer.name,
        is_main_branch: info.isMainBranch || false,
      });
    });

    // Main branch first, then alphabetical - a 50+ branch group is unreadable
    // otherwise.
    Object.values(groupsMap).forEach((group) => {
      group.branches.sort((a, b) => {
        if (a.is_main_branch !== b.is_main_branch) {
          return a.is_main_branch ? -1 : 1;
        }
        return a.customer_name.localeCompare(b.customer_name);
      });
    });

    return Object.values(groupsMap).sort((a, b) =>
      a.group_name.localeCompare(b.group_name)
    );
  }, [customers]);

  const activeGroup = useMemo(
    () => branchGroups.find((group) => group.id === activeGroupId) || null,
    [branchGroups, activeGroupId]
  );

  const mainBranchCustomer = useMemo<EnhancedCustomerList | null>(() => {
    const main = activeGroup?.branches.find((b) => b.is_main_branch);
    if (!main) return null;
    return customers.find((c) => c.id === main.customer_id) || null;
  }, [activeGroup, customers]);

  // Customers already in a group can't be added to another one, so they are
  // filtered out of the pickers rather than rejected after the fact.
  const availableCustomers = useMemo(
    () =>
      customers.filter(
        (customer) =>
          !customer.branchInfo?.isInBranchGroup &&
          customer.id !== selectedCustomerId
      ),
    [customers, selectedCustomerId]
  );

  // Reset transient state on each open so a stale multi-select can never be
  // applied to the wrong group.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedCustomerId(initialCustomerId || "");
    setSelectedCustomerIds([]);
    setIsAddingNew(false);
    setGroupSearchQuery("");
    setBranchTableQuery("");
    setCustomerSearchQuery("");
    setAddBranchQuery("");
    setAdditionalBranchQuery("");
  }, [isOpen, initialCustomerId]);

  // Keep the active group in step with the selected customer.
  useEffect(() => {
    if (!selectedCustomerId) {
      setActiveGroupId(null);
      return;
    }
    const info = customers.find((c) => c.id === selectedCustomerId)?.branchInfo;
    setActiveGroupId(info?.isInBranchGroup ? info.groupId ?? null : null);
  }, [selectedCustomerId, customers]);

  // Switching customers abandons any half-finished selection.
  useEffect(() => {
    setSelectedCustomerIds([]);
    setIsAddingNew(false);
    setBranchTableQuery("");
    setAddBranchQuery("");
    setAdditionalBranchQuery("");
  }, [selectedCustomerId]);

  const filteredGroups = useMemo(() => {
    const q = groupSearchQuery.trim().toLowerCase();
    if (!q) return branchGroups;
    return branchGroups.filter(
      (group) =>
        group.group_name.toLowerCase().includes(q) ||
        group.branches.some(
          (b) =>
            b.customer_name.toLowerCase().includes(q) ||
            b.customer_id.toLowerCase().includes(q)
        )
    );
  }, [branchGroups, groupSearchQuery]);

  const visibleBranches = useMemo(() => {
    if (!activeGroup) return [];
    const q = branchTableQuery.trim().toLowerCase();
    if (!q) return activeGroup.branches;
    return activeGroup.branches.filter(
      (b) =>
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_id.toLowerCase().includes(q)
    );
  }, [activeGroup, branchTableQuery]);

  // --- Combobox paging -----------------------------------------------------
  const filteredCustomers = useMemo(
    () => customers.filter((c) => matchesQuery(c, customerSearchQuery)),
    [customers, customerSearchQuery]
  );
  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice(0, customerPage * ITEMS_PER_PAGE),
    [filteredCustomers, customerPage]
  );
  const hasMoreCustomers = filteredCustomers.length > paginatedCustomers.length;

  const filteredAvailableBranches = useMemo(
    () => availableCustomers.filter((c) => matchesQuery(c, addBranchQuery)),
    [availableCustomers, addBranchQuery]
  );
  const paginatedAvailableBranches = useMemo(
    () =>
      filteredAvailableBranches.slice(0, availableBranchPage * ITEMS_PER_PAGE),
    [filteredAvailableBranches, availableBranchPage]
  );
  const hasMoreAvailableBranches =
    filteredAvailableBranches.length > paginatedAvailableBranches.length;

  const filteredNewGroupCustomers = useMemo(
    () =>
      availableCustomers.filter((c) => matchesQuery(c, additionalBranchQuery)),
    [availableCustomers, additionalBranchQuery]
  );
  const newGroupAvailableCustomers = useMemo(
    () => filteredNewGroupCustomers.slice(0, newGroupPage * ITEMS_PER_PAGE),
    [filteredNewGroupCustomers, newGroupPage]
  );
  const hasMoreNewGroupCustomers =
    filteredNewGroupCustomers.length > newGroupAvailableCustomers.length;

  useEffect(() => setCustomerPage(1), [customerSearchQuery]);
  useEffect(() => setAvailableBranchPage(1), [addBranchQuery]);
  useEffect(() => setNewGroupPage(1), [additionalBranchQuery]);

  // --- Impact of linking ---------------------------------------------------
  // Linking overwrites the added customer's e-Invoice details and custom
  // prices with the main branch's. Spell out exactly who loses what.
  const buildLinkImpact = (
    ids: string[],
    reference: EnhancedCustomerList | null | undefined
  ) => {
    const overwritten: string[] = [];
    const repriced: string[] = [];

    ids.forEach((id) => {
      const customer = customers.find((c) => c.id === id);
      if (!customer) return;

      const fields = [
        "tin_number",
        "id_number",
        "id_type",
        "phone_number",
      ] as const;
      const differs = fields.some((field) => {
        const value = customer[field];
        return Boolean(value) && value !== reference?.[field];
      });

      if (differs) overwritten.push(`${customer.name} (${customer.id})`);
      // Custom prices are only copied down when the main branch has some, and
      // only customers with their own prices actually lose anything.
      if (
        (reference?.customProducts?.length ?? 0) > 0 &&
        (customer.customProducts?.length ?? 0) > 0
      ) {
        repriced.push(`${customer.name} (${customer.id})`);
      }
    });

    return { overwritten, repriced };
  };

  const addImpact = useMemo(
    () => buildLinkImpact(selectedCustomerIds, mainBranchCustomer),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCustomerIds, customers, mainBranchCustomer]
  );

  const createImpact = useMemo(
    () => buildLinkImpact(selectedCustomerIds, selectedCustomer),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCustomerIds, customers, selectedCustomer]
  );

  const renderLinkImpact = (
    impact: { overwritten: string[]; repriced: string[] },
    mainName: string,
    count: number
  ) => (
    <div className="space-y-3">
      <p>
        <Trans
          i18nKey={
            count === 1
              ? "{{total}} customer will be linked to <strong>{{name}}</strong>."
              : "{{total}} customers will be linked to <strong>{{name}}</strong>."
          }
          ns="catalogue"
          values={{ total: count, name: mainName }}
          components={{
            strong: (
              <strong className="font-medium text-default-700 dark:text-gray-200" />
            ),
          }}
        />
      </p>
      {impact.overwritten.length === 0 && impact.repriced.length === 0 ? (
        <p>
          {t(
            "Their pricing and e-Invoice information will be kept in sync from now on."
          )}
        </p>
      ) : (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
          <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
            <IconAlertTriangle size={16} className="flex-shrink-0" />
            {t("This overwrites existing information and cannot be undone")}
          </p>
          {impact.overwritten.length > 0 && (
            <p className="text-amber-800 dark:text-amber-300">
              {t(
                "e-Invoice details and phone number will be replaced for: {{list}}",
                { list: impact.overwritten.join(", ") }
              )}
            </p>
          )}
          {impact.repriced.length > 0 && (
            <p className="text-amber-800 dark:text-amber-300">
              {t("Existing custom product prices will be replaced for: {{list}}", {
                list: impact.repriced.join(", "),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );

  // --- Actions -------------------------------------------------------------
  const selectBranchGroup = (group: BranchGroup) => {
    setActiveGroupId(group.id);
    const mainBranch = group.branches.find((branch) => branch.is_main_branch);
    if (mainBranch) {
      setSelectedCustomerId(mainBranch.customer_id);
    }
  };

  const startCreateGroup = () => {
    setNewGroupName(
      selectedCustomer ? `${selectedCustomer.name} Branches` : ""
    );
    setSelectedCustomerIds([]);
    setIsAddingNew(true);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !selectedCustomerId) {
      toast.error(t("Please enter a group name and select a customer"));
      return;
    }

    setSaving(true);
    try {
      const branches = [
        { customer_id: selectedCustomerId, is_main_branch: true },
      ];

      selectedCustomerIds.forEach((id) => {
        if (id !== selectedCustomerId) {
          branches.push({ customer_id: id, is_main_branch: false });
        }
      });

      await api.post("/api/customer-branches", {
        group_name: newGroupName.trim(),
        branches,
      });

      toast.success(t("Branch group created successfully"));
      // The active group is picked up from the refreshed cache.
      await refreshCustomersCache();
      setIsCreateConfirmOpen(false);
      setIsAddingNew(false);
      setNewGroupName("");
      setSelectedCustomerIds([]);
    } catch (error: any) {
      console.error("Error creating branch group:", error);
      toast.error(error?.message || t("Failed to create branch group"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddToBranch = async () => {
    if (!activeGroup || selectedCustomerIds.length === 0) return;

    setSaving(true);
    try {
      await api.post(`/api/customer-branches/${activeGroup.id}/add`, {
        customer_ids: selectedCustomerIds,
      });

      toast.success(
        selectedCustomerIds.length === 1
          ? t("Branch added successfully")
          : t("{{total}} branches added successfully", {
              total: selectedCustomerIds.length,
            })
      );
      await refreshCustomersCache();
      setIsAddConfirmOpen(false);
      setSelectedCustomerIds([]);
    } catch (error: any) {
      console.error("Error adding branches:", error);
      toast.error(error?.message || t("Failed to add branches"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveBranch = async () => {
    if (!activeGroup || !branchToRemove) return;

    setSaving(true);
    try {
      await api.delete(
        `/api/customer-branches/${activeGroup.id}/remove/${branchToRemove.customer_id}`
      );
      toast.success(t("Branch removed successfully"));
      await refreshCustomersCache();
      setBranchToRemove(null);
    } catch (error: any) {
      console.error("Error removing branch:", error);
      toast.error(error?.message || t("Failed to remove branch"));
    } finally {
      setSaving(false);
    }
  };

  const handleSetMainBranch = async (branchCustomerId: string) => {
    if (!activeGroup) return;

    setSaving(true);
    try {
      await api.put(
        `/api/customer-branches/${activeGroup.id}/main/${branchCustomerId}`
      );
      toast.success(t("Main branch updated successfully"));
      await refreshCustomersCache();
    } catch (error: any) {
      console.error("Error setting main branch:", error);
      toast.error(error?.message || t("Failed to update main branch"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!activeGroup) return;

    setSaving(true);
    try {
      await api.delete(`/api/customer-branches/${activeGroup.id}`);
      toast.success(t("Branch group deleted successfully"));
      await refreshCustomersCache();
      setIsDeleteGroupDialogOpen(false);
    } catch (error: any) {
      console.error("Error deleting branch group:", error);
      toast.error(error?.message || t("Failed to delete branch group"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div
              className="fixed inset-0 bg-black/50 dark:bg-black/70"
              aria-hidden="true"
            />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="flex w-full max-w-5xl max-h-[90vh] flex-col transform rounded-2xl bg-white dark:bg-gray-800 text-left align-middle shadow-xl transition-all">
                  {/* Header stays put while the body scrolls */}
                  <div className="flex-shrink-0 border-b border-default-200 dark:border-gray-700 px-6 pt-6 pb-4">
                    <DialogTitle
                      as="h3"
                      className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                    >
                      {t("Branch Management")}
                    </DialogTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
                      {t(
                        "Link multiple customer branches to share pricing and e-Invoice information. Any price change in one branch will update pricing for all linked branches. All branches will also share the same e-Invoice information."
                      )}
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    {/* List of All Branch Groups */}
                    <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h4 className="font-medium dark:text-gray-100">
                          {t("All Branch Groups")}{" "}
                          {!fetchingCustomers && branchGroups.length > 0 && (
                            <span className="text-default-500 dark:text-gray-400 font-normal">
                              ({branchGroups.length})
                            </span>
                          )}
                        </h4>
                        {branchGroups.length > 0 && (
                          <div className="relative">
                            <IconSearch
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                              size={16}
                            />
                            <input
                              type="text"
                              value={groupSearchQuery}
                              onChange={(e) =>
                                setGroupSearchQuery(e.target.value)
                              }
                              placeholder={t("Search groups or customers")}
                              className="w-64 pl-9 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-600 bg-white dark:bg-transparent text-default-900 dark:text-gray-100 focus:border-default-500 dark:focus:border-gray-500 rounded-full"
                            />
                          </div>
                        )}
                      </div>

                      {fetchingCustomers ? (
                        <div className="flex justify-center py-4">
                          <LoadingSpinner size="sm" />
                        </div>
                      ) : branchGroups.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-3">
                          {t("No branch groups found")}
                        </p>
                      ) : filteredGroups.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-3">
                          {t('No groups match "{{query}}"', {
                            query: groupSearchQuery,
                          })}
                        </p>
                      ) : (
                        <div className="max-h-52 overflow-y-auto -mx-1 px-1">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredGroups.map((group) => (
                              <button
                                key={group.id}
                                type="button"
                                aria-pressed={activeGroup?.id === group.id}
                                className={`text-left border rounded-lg p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                                  activeGroup?.id === group.id
                                    ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                                    : "border-default-200 dark:border-gray-700"
                                }`}
                                onClick={() => selectBranchGroup(group)}
                              >
                                <h5 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {group.group_name}
                                </h5>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {t(
                                    group.branches.length === 1
                                      ? "{{total}} branch"
                                      : "{{total}} branches",
                                    { total: group.branches.length }
                                  )}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Customer selection */}
                    <div className="mb-6">
                      <CustomerCombobox
                        name="customer-select"
                        label={t("Select a Customer")}
                        value={
                          selectedCustomer
                            ? {
                                id: selectedCustomer.id,
                                name: selectedCustomer.name,
                              }
                            : null
                        }
                        onChange={(option) => {
                          setSelectedCustomerId(option ? option.id : "");
                        }}
                        options={paginatedCustomers.map((customer) => ({
                          id: customer.id,
                          name: customer.name,
                        }))}
                        query={customerSearchQuery}
                        setQuery={setCustomerSearchQuery}
                        onLoadMore={() => setCustomerPage((p) => p + 1)}
                        hasMore={hasMoreCustomers}
                        isLoading={false}
                        disabled={saving}
                      />
                    </div>

                    {!selectedCustomerId ? (
                      <div className="text-center py-6 border border-default-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                        <p className="text-gray-500 dark:text-gray-400">
                          {t(
                            "Select a branch group above, or pick a customer to manage their branches"
                          )}
                        </p>
                      </div>
                    ) : activeGroup ? (
                      <div className="border border-default-200 dark:border-gray-700 rounded-lg p-4 mb-2">
                        <div className="flex justify-between items-center mb-4 gap-3">
                          <h4 className="font-medium text-lg dark:text-gray-100 truncate">
                            {activeGroup.group_name}
                          </h4>
                          <Button
                            variant="outline"
                            color="rose"
                            size="sm"
                            onClick={() => setIsDeleteGroupDialogOpen(true)}
                            disabled={saving}
                          >
                            {t("Delete Group")}
                          </Button>
                        </div>

                        <div className="mb-6">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <h5 className="font-medium dark:text-gray-200">
                              {t("Linked Branches")}{" "}
                              <span className="text-default-500 dark:text-gray-400 font-normal">
                                ({activeGroup.branches.length})
                              </span>
                            </h5>
                            {activeGroup.branches.length >
                              BRANCH_SEARCH_THRESHOLD && (
                              <div className="relative">
                                <IconSearch
                                  className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                                  size={16}
                                />
                                <input
                                  type="text"
                                  value={branchTableQuery}
                                  onChange={(e) =>
                                    setBranchTableQuery(e.target.value)
                                  }
                                  placeholder={t("Search branches")}
                                  className="w-56 pl-9 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-600 bg-white dark:bg-transparent text-default-900 dark:text-gray-100 focus:border-default-500 dark:focus:border-gray-500 rounded-full"
                                />
                              </div>
                            )}
                          </div>

                          <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div className="max-h-80 overflow-y-auto">
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      {t("Customer ID")}
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      {t("Name")}
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      {t("Main Branch")}
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      {t("Actions")}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                  {visibleBranches.length === 0 ? (
                                    <tr>
                                      <td
                                        colSpan={4}
                                        className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                                      >
                                        {t('No branches match "{{query}}"', {
                                          query: branchTableQuery,
                                        })}
                                      </td>
                                    </tr>
                                  ) : (
                                    visibleBranches.map((branch) => (
                                      <tr
                                        key={branch.customer_id}
                                        className={
                                          branch.customer_id ===
                                          selectedCustomerId
                                            ? "bg-sky-50/60 dark:bg-sky-900/10"
                                            : undefined
                                        }
                                      >
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                          {branch.customer_id}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                          {branch.customer_name}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center">
                                          {branch.is_main_branch ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                              <IconCheck
                                                size={12}
                                                className="mr-1"
                                              />
                                              {t("Main")}
                                            </span>
                                          ) : (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() =>
                                                handleSetMainBranch(
                                                  branch.customer_id
                                                )
                                              }
                                              disabled={saving}
                                              className="text-xs py-1"
                                              title={t(
                                                "Make this the source of shared e-Invoice details"
                                              )}
                                            >
                                              {t("Set as Main")}
                                            </Button>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                                          {!branch.is_main_branch && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              color="rose"
                                              icon={IconTrash}
                                              onClick={() =>
                                                setBranchToRemove(branch)
                                              }
                                              disabled={saving}
                                              className="text-xs py-1"
                                            >
                                              {t("Remove")}
                                            </Button>
                                          )}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {mainBranchCustomer && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-default-500 dark:text-gray-400">
                              <IconBuildingSkyscraper
                                size={14}
                                className="flex-shrink-0"
                              />
                              {t(
                                "Shared pricing and e-Invoice details come from {{name}}.",
                                { name: mainBranchCustomer.name }
                              )}
                            </p>
                          )}
                        </div>

                        {/* Add more branches */}
                        <div className="mt-2">
                          <h5 className="font-medium mb-2 dark:text-gray-200">
                            {t("Add More Branches")}
                          </h5>
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <MultiCustomerCombobox
                                name="add-branches"
                                label={t("Select Customers")}
                                value={selectedCustomerIds}
                                onChange={setSelectedCustomerIds}
                                options={paginatedAvailableBranches.map(
                                  (customer) => ({
                                    id: customer.id,
                                    name: customer.name,
                                  })
                                )}
                                query={addBranchQuery}
                                setQuery={setAddBranchQuery}
                                onLoadMore={() =>
                                  setAvailableBranchPage((p) => p + 1)
                                }
                                hasMore={hasMoreAvailableBranches}
                                isLoading={false}
                                disabled={saving}
                              />
                            </div>
                            <Button
                              variant="filled"
                              color="sky"
                              icon={IconPlus}
                              onClick={() => setIsAddConfirmOpen(true)}
                              disabled={
                                saving || selectedCustomerIds.length === 0
                              }
                            >
                              {t("Add")}
                            </Button>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {t(
                              "Customers already in another branch group are not listed."
                            )}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-default-200 dark:border-gray-700 rounded-lg p-4 mb-2">
                        {isAddingNew ? (
                          <div>
                            <h4 className="font-medium mb-3 dark:text-gray-100">
                              {t("Create New Branch Group")}
                            </h4>
                            <div className="space-y-3">
                              <FormInput
                                name="group-name"
                                label={t("Group Name")}
                                value={newGroupName}
                                onChange={(e) =>
                                  setNewGroupName(e.target.value)
                                }
                                disabled={saving}
                                required
                                placeholder={t("Enter branch group name")}
                              />

                              <div>
                                <MultiCustomerCombobox
                                  name="branch-customers"
                                  label={t("Select Additional Branches")}
                                  value={selectedCustomerIds}
                                  onChange={setSelectedCustomerIds}
                                  options={newGroupAvailableCustomers.map(
                                    (customer) => ({
                                      id: customer.id,
                                      name: customer.name,
                                    })
                                  )}
                                  query={additionalBranchQuery}
                                  setQuery={setAdditionalBranchQuery}
                                  onLoadMore={() =>
                                    setNewGroupPage((p) => p + 1)
                                  }
                                  hasMore={hasMoreNewGroupCustomers}
                                  isLoading={false}
                                  disabled={saving}
                                  placeholder={t(
                                    "Select customers to add as branches"
                                  )}
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {t(
                                    "{{name}} ({{id}}) will be the main branch, and its pricing and e-Invoice details will be shared with every branch added.",
                                    {
                                      name: selectedCustomer?.name,
                                      id: selectedCustomer?.id,
                                    }
                                  )}
                                </p>
                              </div>

                              <div className="flex justify-end space-x-2 pt-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setIsAddingNew(false)}
                                  disabled={saving}
                                >
                                  {t("Cancel")}
                                </Button>
                                <Button
                                  variant="filled"
                                  color="sky"
                                  onClick={() => {
                                    if (selectedCustomerIds.length === 0) {
                                      handleCreateGroup();
                                    } else {
                                      setIsCreateConfirmOpen(true);
                                    }
                                  }}
                                  disabled={saving || !newGroupName.trim()}
                                >
                                  {saving ? t("Creating...") : t("Create Group")}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6">
                            <p className="text-gray-500 dark:text-gray-400 mb-4">
                              {t(
                                "This customer is not part of any branch group yet"
                              )}
                            </p>
                            <Button
                              variant="filled"
                              color="sky"
                              onClick={startCreateGroup}
                              disabled={saving}
                            >
                              {t("Create Branch Group")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer stays put while the body scrolls */}
                  <div className="flex-shrink-0 border-t border-default-200 dark:border-gray-700 px-6 py-4 flex justify-end">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      disabled={saving}
                    >
                      {t("Close")}
                    </Button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      <ConfirmationDialog
        isOpen={isAddConfirmOpen}
        onClose={() => setIsAddConfirmOpen(false)}
        onConfirm={handleAddToBranch}
        title={t("Link branches to this group")}
        message={renderLinkImpact(
          addImpact,
          mainBranchCustomer?.name || t("the main branch"),
          selectedCustomerIds.length
        )}
        confirmButtonText={saving ? t("Linking...") : t("Link Branches")}
        variant="default"
        isConfirming={saving}
      />

      <ConfirmationDialog
        isOpen={isCreateConfirmOpen}
        onClose={() => setIsCreateConfirmOpen(false)}
        onConfirm={handleCreateGroup}
        title={t("Create branch group")}
        message={renderLinkImpact(
          createImpact,
          selectedCustomer?.name || t("the main branch"),
          selectedCustomerIds.length
        )}
        confirmButtonText={saving ? t("Creating...") : t("Create Group")}
        variant="default"
        isConfirming={saving}
      />

      <ConfirmationDialog
        isOpen={Boolean(branchToRemove)}
        onClose={() => setBranchToRemove(null)}
        onConfirm={handleRemoveBranch}
        title={t("Remove Branch")}
        message={
          <div className="space-y-3">
            <p>
              <Trans
                i18nKey="Remove <strong>{{name}}</strong> from {{group}}? It will stop sharing pricing and e-Invoice information with the other branches."
                ns="catalogue"
                values={{
                  name: branchToRemove?.customer_name,
                  group: activeGroup?.group_name,
                }}
                components={{
                  strong: (
                    <strong className="font-medium text-default-700 dark:text-gray-200" />
                  ),
                }}
              />
            </p>
            <p>
              {t(
                "The pricing and e-Invoice details it already received from the main branch stay on the customer - removing it does not restore its previous values."
              )}
            </p>
            {activeGroup?.branches.length === 2 && (
              <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
                <IconAlertTriangle
                  size={16}
                  className="flex-shrink-0 mt-0.5"
                />
                {t("Only the main branch will be left in this group.")}
              </p>
            )}
          </div>
        }
        confirmButtonText={saving ? t("Removing...") : t("Remove Branch")}
        isConfirming={saving}
      />

      <ConfirmationDialog
        isOpen={isDeleteGroupDialogOpen}
        onClose={() => setIsDeleteGroupDialogOpen(false)}
        onConfirm={handleDeleteGroup}
        title={t("Delete Branch Group")}
        message={t(
          'Are you sure you want to delete the branch group "{{group}}"? This unlinks all {{total}} branches, which will no longer share pricing or e-Invoice information. Their current prices and details are kept.',
          {
            group: activeGroup?.group_name,
            total: activeGroup?.branches.length,
          }
        )}
        confirmButtonText={saving ? t("Deleting...") : t("Delete Group")}
        isConfirming={saving}
      />
    </>
  );
};

export default BranchLinkageModal;
