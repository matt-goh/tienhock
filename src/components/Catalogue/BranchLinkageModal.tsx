// src/components/Catalogue/BranchLinkageModal.tsx
import React, { useState, useEffect, Fragment } from "react";
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
} from "../../utils/catalogue/useCustomerCache";
import { CustomerCombobox } from "../Invoice/CustomerCombobox";
import { FormInput } from "../FormComponents";
import { IconPlus, IconTrash, IconCheck } from "@tabler/icons-react";
import { CustomerList } from "../../types/types";
import { MultiCustomerCombobox } from "../Invoice/MultiCustomerCombobox";

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

const BranchLinkageModal: React.FC<BranchLinkageModalProps> = ({
  isOpen,
  onClose,
  initialCustomerId,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerGroups, setCustomerGroups] = useState<BranchGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<BranchGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomerId || ""
  );
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");

  const { customers } = useCustomersCache();
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const [customerPage, setCustomerPage] = useState(1);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerList[]>(
    []
  );
  const [paginatedCustomers, setPaginatedCustomers] = useState<CustomerList[]>(
    []
  );
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  const ITEMS_PER_PAGE = 30;
  const [addBranchQuery, setAddBranchQuery] = useState("");
  const [additionalBranchQuery, setAdditionalBranchQuery] = useState("");

  const [availableBranchPage, setAvailableBranchPage] = useState(1);
  const [filteredAvailableBranches, setFilteredAvailableBranches] = useState<
    CustomerList[]
  >([]);
  const [paginatedAvailableBranches, setPaginatedAvailableBranches] = useState<
    CustomerList[]
  >([]);
  const [hasMoreAvailableBranches, setHasMoreAvailableBranches] =
    useState(false);

  // Filter out customers already in the active group
  const availableCustomers = customers.filter(
    (customer) =>
      !activeGroup?.branches.some(
        (branch) => branch.customer_id === customer.id
      ) && customer.id !== selectedCustomerId
  );

  useEffect(() => {
    if (initialCustomerId) {
      setSelectedCustomerId(initialCustomerId);
    }
  }, [initialCustomerId]);

  useEffect(() => {
    if (isOpen && selectedCustomerId) {
      fetchBranchGroups();
    } else if (isOpen) {
      // Reset states when modal opens without customer selected
      setLoading(false);
      setCustomerGroups([]);
      setActiveGroup(null);
      setNewGroupName("");
    }
  }, [isOpen, selectedCustomerId]);

  // Filter customers when search query changes
  useEffect(() => {
    const filtered = customerSearchQuery
      ? customers.filter(
          (customer) =>
            customer.name
              .toLowerCase()
              .includes(customerSearchQuery.toLowerCase()) ||
            customer.id
              .toLowerCase()
              .includes(customerSearchQuery.toLowerCase()) ||
            (customer.phone_number &&
              customer.phone_number
                .toLowerCase()
                .includes(customerSearchQuery.toLowerCase()))
        )
      : [...customers];

    setFilteredCustomers(filtered);
    setCustomerPage(1); // Reset to first page on new search

    // Calculate initial page
    const firstPageItems = filtered.slice(0, ITEMS_PER_PAGE);
    setPaginatedCustomers(firstPageItems);
    setHasMoreCustomers(filtered.length > ITEMS_PER_PAGE);
  }, [customerSearchQuery, customers]);

  // Update pagination when page changes
  useEffect(() => {
    const items = filteredCustomers.slice(0, customerPage * ITEMS_PER_PAGE);
    setPaginatedCustomers(items);
    setHasMoreCustomers(
      filteredCustomers.length > customerPage * ITEMS_PER_PAGE
    );
  }, [filteredCustomers, customerPage]);

  // Filter available branches when search query changes
  useEffect(() => {
    if (!activeGroup) return;

    const filtered = addBranchQuery
      ? availableCustomers.filter(
          (customer) =>
            customer.name
              .toLowerCase()
              .includes(addBranchQuery.toLowerCase()) ||
            customer.id.toLowerCase().includes(addBranchQuery.toLowerCase()) ||
            (customer.phone_number &&
              customer.phone_number
                .toLowerCase()
                .includes(addBranchQuery.toLowerCase()))
        )
      : [...availableCustomers];

    setFilteredAvailableBranches(filtered);
    setAvailableBranchPage(1); // Reset to first page

    // Calculate initial page
    const firstPageItems = filtered.slice(0, ITEMS_PER_PAGE);
    setPaginatedAvailableBranches(firstPageItems);
    setHasMoreAvailableBranches(filtered.length > ITEMS_PER_PAGE);
  }, [addBranchQuery, availableCustomers, activeGroup]);

  // Update pagination for available branches
  useEffect(() => {
    const items = filteredAvailableBranches.slice(
      0,
      availableBranchPage * ITEMS_PER_PAGE
    );
    setPaginatedAvailableBranches(items);
    setHasMoreAvailableBranches(
      filteredAvailableBranches.length > availableBranchPage * ITEMS_PER_PAGE
    );
  }, [filteredAvailableBranches, availableBranchPage]);

  // Create a filtered available customers list for the create new group form
  const [newGroupAvailableCustomers, setNewGroupAvailableCustomers] = useState<
    CustomerList[]
  >([]);
  const [newGroupPage, setNewGroupPage] = useState(1);
  const [hasMoreNewGroupCustomers, setHasMoreNewGroupCustomers] =
    useState(false);

  useEffect(() => {
    if (!selectedCustomerId) return;

    const customerList = customers.filter((c) => c.id !== selectedCustomerId);
    const filtered = additionalBranchQuery
      ? customerList.filter(
          (customer) =>
            customer.name
              .toLowerCase()
              .includes(additionalBranchQuery.toLowerCase()) ||
            customer.id
              .toLowerCase()
              .includes(additionalBranchQuery.toLowerCase()) ||
            (customer.phone_number &&
              customer.phone_number
                .toLowerCase()
                .includes(additionalBranchQuery.toLowerCase()))
        )
      : customerList;

    const paged = filtered.slice(0, newGroupPage * ITEMS_PER_PAGE);
    setNewGroupAvailableCustomers(paged);
    setHasMoreNewGroupCustomers(filtered.length > paged.length);
  }, [additionalBranchQuery, customers, selectedCustomerId, newGroupPage]);

  const loadMoreCustomers = () => {
    if (hasMoreCustomers) {
      setCustomerPage((prev) => prev + 1);
    }
  };

  const loadMoreAvailableBranches = () => {
    if (hasMoreAvailableBranches) {
      setAvailableBranchPage((prev) => prev + 1);
    }
  };

  const loadMoreNewGroupCustomers = () => {
    if (hasMoreNewGroupCustomers) {
      setNewGroupPage((prev) => prev + 1);
    }
  };

  const fetchBranchGroups = async () => {
    if (!selectedCustomerId) return;

    setLoading(true);
    try {
      // API call to fetch branch groups for the current customer
      const response = await api.get(
        `/api/customer-branches/${selectedCustomerId}`
      );
      setCustomerGroups(response.groups || []);

      // Set active group if current customer is part of any group
      const customerGroup = response.groups?.find(
        (group: { branches: { customer_id: string }[] }) =>
          group.branches.some(
            (branch: { customer_id: string }) =>
              branch.customer_id === selectedCustomerId
          )
      );

      if (customerGroup) {
        setActiveGroup(customerGroup);
      } else {
        setActiveGroup(null);
        // If no groups, pre-fill new group name with customer name + Branches
        if (selectedCustomer) {
          setNewGroupName(`${selectedCustomer.name} Branches`);
        }
      }
    } catch (error) {
      console.error("Error fetching branch groups:", error);
      toast.error("Failed to load branch information");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !selectedCustomerId) {
      toast.error("Please enter a group name and select a customer");
      return;
    }

    setSaving(true);
    try {
      // Include the selected customer as main branch in new group
      const branches = [
        { customer_id: selectedCustomerId, is_main_branch: true },
      ];

      // Include any selected customers as regular branches
      selectedCustomerIds.forEach((id) => {
        if (id !== selectedCustomerId) {
          branches.push({ customer_id: id, is_main_branch: false });
        }
      });

      await api.post("/api/customer-branches", {
        group_name: newGroupName,
        branches,
      });

      toast.success("Branch group created successfully");
      fetchBranchGroups(); // Refresh data
      setIsAddingNew(false);
      setNewGroupName("");
      setSelectedCustomerIds([]);
    } catch (error) {
      console.error("Error creating branch group:", error);
      toast.error("Failed to create branch group");
    } finally {
      setSaving(false);
    }
  };

  const handleAddToBranch = async () => {
    if (!activeGroup || selectedCustomerIds.length === 0) return;

    setSaving(true);
    try {
      await api.post(
        `/api/customer-branches/${activeGroup.id}/add`,
        {
          customer_ids: selectedCustomerIds,
        }
      );

      toast.success("Branches added successfully");
      fetchBranchGroups(); // Refresh data
      setSelectedCustomerIds([]);
    } catch (error) {
      console.error("Error adding branches:", error);
      toast.error("Failed to add branches");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveBranch = async (branchCustomerId: string) => {
    if (!activeGroup) return;

    setSaving(true);
    try {
      await api.delete(
        `/api/customer-branches/${activeGroup.id}/remove/${branchCustomerId}`
      );
      toast.success("Branch removed successfully");
      fetchBranchGroups(); // Refresh data
    } catch (error) {
      console.error("Error removing branch:", error);
      toast.error("Failed to remove branch");
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
      toast.success("Main branch updated successfully");
      fetchBranchGroups(); // Refresh data
    } catch (error) {
      console.error("Error setting main branch:", error);
      toast.error("Failed to update main branch");
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!activeGroup || !selectedCustomerId) return;

    setSaving(true);
    try {
      await api.delete(
        `/api/customer-branches/${activeGroup.id}/remove/${selectedCustomerId}`
      );
      toast.success("Left branch group successfully");
      fetchBranchGroups(); // Refresh data
    } catch (error) {
      console.error("Error leaving group:", error);
      toast.error("Failed to leave branch group");
    } finally {
      setSaving(false);
    }
  };

  return (
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
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-5xl transform rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Branch Pricing Management
                </DialogTitle>

                <div className="mt-4">
                  <p className="text-sm text-gray-500 mb-4">
                    Link multiple customer branches to share pricing. Any price
                    change in one branch will update pricing for all linked
                    branches.
                  </p>

                  {/* Customer selection */}
                  <div className="mb-6">
                    <CustomerCombobox
                      name="customer-select"
                      label="Select a Customer"
                      value={
                        selectedCustomer
                          ? {
                              id: selectedCustomer.id,
                              name: selectedCustomer.name,
                            }
                          : null
                      }
                      onChange={(option) => {
                        if (option) {
                          setSelectedCustomerId(option.id);
                        } else {
                          setSelectedCustomerId("");
                        }
                      }}
                      options={paginatedCustomers.map((customer) => ({
                        id: customer.id,
                        name: customer.name,
                      }))}
                      query={customerSearchQuery}
                      setQuery={setCustomerSearchQuery}
                      onLoadMore={loadMoreCustomers}
                      hasMore={hasMoreCustomers}
                      isLoading={false}
                      disabled={saving}
                    />
                  </div>

                  {loading ? (
                    <div className="py-8 flex justify-center">
                      <LoadingSpinner />
                    </div>
                  ) : !selectedCustomerId ? (
                    <div className="text-center py-6 border rounded-lg bg-gray-50">
                      <p className="text-gray-500">
                        Please select a customer to manage branch pricing
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Show current group or option to create new group */}
                      {activeGroup ? (
                        <div className="border rounded-lg p-4 mb-6">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="font-medium text-lg">
                              {activeGroup.group_name}
                            </h4>
                            <Button
                              variant="outline"
                              color="rose"
                              size="sm"
                              onClick={handleLeaveGroup}
                              disabled={saving}
                            >
                              Leave Group
                            </Button>
                          </div>

                          <div className="mb-6">
                            <h5 className="font-medium mb-2">
                              Linked Branches
                            </h5>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Customer ID
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Name
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Main Branch
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Actions
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {activeGroup.branches.map((branch) => (
                                    <tr key={branch.customer_id}>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                        {branch.customer_id}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                        {branch.customer_name}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-center">
                                        {branch.is_main_branch ? (
                                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            <IconCheck
                                              size={12}
                                              className="mr-1"
                                            />
                                            Main
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
                                          >
                                            Set as Main
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
                                              handleRemoveBranch(
                                                branch.customer_id
                                              )
                                            }
                                            disabled={saving}
                                            className="text-xs py-1"
                                          >
                                            Remove
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Add more branches */}
                          <div className="mt-4">
                            <h5 className="font-medium mb-2">
                              Add More Branches
                            </h5>
                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <MultiCustomerCombobox
                                  name="add-branches"
                                  label="Select Customers"
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
                                  onLoadMore={loadMoreAvailableBranches}
                                  hasMore={hasMoreAvailableBranches}
                                  isLoading={false}
                                  disabled={saving}
                                />
                              </div>
                              <Button
                                variant="filled"
                                color="sky"
                                icon={IconPlus}
                                onClick={handleAddToBranch}
                                disabled={
                                  saving || selectedCustomerIds.length === 0
                                }
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="border rounded-lg p-4 mb-6">
                          {isAddingNew ? (
                            <div>
                              <h4 className="font-medium mb-3">
                                Create New Branch Group
                              </h4>
                              <div className="space-y-4">
                                <FormInput
                                  name="group-name"
                                  label="Group Name"
                                  value={newGroupName}
                                  onChange={(e) =>
                                    setNewGroupName(e.target.value)
                                  }
                                  disabled={saving}
                                  required
                                  placeholder="Enter branch group name"
                                />

                                <div>
                                  <MultiCustomerCombobox
                                    name="branch-customers"
                                    label="Select Additional Branches"
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
                                    onLoadMore={loadMoreNewGroupCustomers}
                                    hasMore={hasMoreNewGroupCustomers}
                                    isLoading={false}
                                    disabled={saving}
                                    placeholder="Select customers to add as branches"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">
                                    Current customer ({selectedCustomer?.name},{" "}
                                    {selectedCustomer?.id}) will be added as the
                                    main branch
                                  </p>
                                </div>

                                <div className="flex justify-end space-x-2 pt-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => setIsAddingNew(false)}
                                    disabled={saving}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="filled"
                                    color="sky"
                                    onClick={handleCreateGroup}
                                    disabled={saving || !newGroupName.trim()}
                                  >
                                    {saving ? "Creating..." : "Create Group"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-6">
                              <p className="text-gray-500 mb-4">
                                This customer is not part of any branch group
                                yet
                              </p>
                              <Button
                                variant="filled"
                                color="sky"
                                onClick={() => setIsAddingNew(true)}
                                disabled={saving}
                              >
                                Create Branch Group
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <Button variant="outline" onClick={onClose} disabled={saving}>
                    Close
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default BranchLinkageModal;
