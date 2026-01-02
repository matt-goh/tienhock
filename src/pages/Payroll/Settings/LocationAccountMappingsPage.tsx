// src/pages/Payroll/Settings/LocationAccountMappingsPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconSearch,
  IconCheck,
  IconLink,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";

// Settings navigation tabs
const SettingsTabs: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { name: "Job Location Mappings", path: "/payroll/settings/job-location-mappings" },
    { name: "Location Account Mappings", path: "/payroll/settings/location-account-mappings" },
  ];

  return (
    <div className="border-b border-default-200 dark:border-gray-700 mb-4">
      <nav className="flex space-x-6" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                isActive
                  ? "border-sky-500 text-sky-600 dark:text-sky-400"
                  : "border-transparent text-default-500 hover:text-default-700 hover:border-default-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600"
              }`}
            >
              {tab.name}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

interface LocationAccountMapping {
  id: number;
  location_id: string;
  location_name: string;
  mapping_type: string;
  account_code: string;
  account_description?: string;
  voucher_type: "JVDR" | "JVSL";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AccountCode {
  code: string;
  description: string;
  is_active: boolean;
}

const MAPPING_TYPES = [
  { id: "salary", name: "Salary" },
  { id: "epf_employer", name: "EPF (Employer)" },
  { id: "socso_employer", name: "SOCSO (Employer)" },
  { id: "sip_employer", name: "SIP (Employer)" },
  { id: "accrual_salary", name: "Accrual - Salary" },
  { id: "accrual_epf", name: "Accrual - EPF" },
  { id: "accrual_socso", name: "Accrual - SOCSO" },
  { id: "accrual_sip", name: "Accrual - SIP" },
  { id: "accrual_pcb", name: "Accrual - PCB" },
];

const VOUCHER_TYPES = [
  { id: "JVDR", name: "JVDR (Director's Remuneration)" },
  { id: "JVSL", name: "JVSL (Staff Salary)" },
];

const LocationAccountMappingsPage: React.FC = () => {
  const [mappings, setMappings] = useState<LocationAccountMapping[]>([]);
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVoucherType, setFilterVoucherType] = useState<string>("All");

  // Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState<LocationAccountMapping | null>(null);
  const [formData, setFormData] = useState({
    location_id: "",
    location_name: "",
    mapping_type: "",
    account_code: "",
    voucher_type: "JVSL" as "JVDR" | "JVSL",
    is_active: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [mappingToDelete, setMappingToDelete] = useState<LocationAccountMapping | null>(null);

  // Fetch data
  const fetchMappings = useCallback(async () => {
    try {
      const response = await api.get("/api/journal-vouchers/mappings");
      setMappings(response as LocationAccountMapping[]);
    } catch (error) {
      console.error("Error fetching mappings:", error);
      toast.error("Failed to load mappings");
    }
  }, []);

  const fetchAccountCodes = useCallback(async () => {
    try {
      const response = await api.get("/api/account-codes?flat=true&is_active=true");
      setAccountCodes(response as AccountCode[]);
    } catch (error) {
      console.error("Error fetching account codes:", error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchMappings(), fetchAccountCodes()]);
      setLoading(false);
    };
    loadData();
  }, [fetchMappings, fetchAccountCodes]);

  // Filter mappings
  const filteredMappings = mappings.filter((m) => {
    const matchesSearch =
      !searchTerm ||
      m.location_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.location_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.account_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.account_description || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesVoucherType =
      filterVoucherType === "All" || m.voucher_type === filterVoucherType;

    return matchesSearch && matchesVoucherType;
  });

  // Group mappings by voucher type and location
  const groupedMappings = filteredMappings.reduce((acc, mapping) => {
    const key = `${mapping.voucher_type}_${mapping.location_id}`;
    if (!acc[key]) {
      acc[key] = {
        voucher_type: mapping.voucher_type,
        location_id: mapping.location_id,
        location_name: mapping.location_name,
        mappings: [],
      };
    }
    acc[key].mappings.push(mapping);
    return acc;
  }, {} as Record<string, { voucher_type: string; location_id: string; location_name: string; mappings: LocationAccountMapping[] }>);

  // Handlers
  const handleAddClick = () => {
    setEditingMapping(null);
    setFormData({
      location_id: "",
      location_name: "",
      mapping_type: "",
      account_code: "",
      voucher_type: "JVSL",
      is_active: true,
    });
    setShowEditModal(true);
  };

  const handleEditClick = (mapping: LocationAccountMapping) => {
    setEditingMapping(mapping);
    setFormData({
      location_id: mapping.location_id,
      location_name: mapping.location_name,
      mapping_type: mapping.mapping_type,
      account_code: mapping.account_code,
      voucher_type: mapping.voucher_type,
      is_active: mapping.is_active,
    });
    setShowEditModal(true);
  };

  const handleDeleteClick = (mapping: LocationAccountMapping) => {
    setMappingToDelete(mapping);
    setShowDeleteDialog(true);
  };

  const handleSave = async () => {
    if (!formData.location_id || !formData.location_name || !formData.mapping_type || !formData.account_code) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      if (editingMapping) {
        await api.put(`/api/journal-vouchers/mappings/${editingMapping.id}`, {
          location_name: formData.location_name,
          account_code: formData.account_code,
          is_active: formData.is_active,
        });
        toast.success("Mapping updated successfully");
      } else {
        await api.post("/api/journal-vouchers/mappings", formData);
        toast.success("Mapping created successfully");
      }
      setShowEditModal(false);
      fetchMappings();
    } catch (error: unknown) {
      console.error("Error saving mapping:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save mapping";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!mappingToDelete) return;

    try {
      await api.delete(`/api/journal-vouchers/mappings/${mappingToDelete.id}`);
      toast.success("Mapping deleted successfully");
      setShowDeleteDialog(false);
      setMappingToDelete(null);
      fetchMappings();
    } catch (error: unknown) {
      console.error("Error deleting mapping:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete mapping";
      toast.error(errorMessage);
    }
  };

  const getMappingTypeName = (type: string): string => {
    const found = MAPPING_TYPES.find((t) => t.id === type);
    return found ? found.name : type;
  };

  if (loading) {
    return (
      <div className="flex justify-center my-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Settings Navigation Tabs */}
      <SettingsTabs />

      {/* Header */}
      <div className="mb-4 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Location Account Mappings
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
            Manage account code mappings for payroll voucher generation (JVDR/JVSL)
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
          Add Mapping
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <IconSearch
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400 dark:text-gray-500"
            stroke={1.5}
          />
          <input
            type="text"
            placeholder="Search location or account..."
            className="w-full rounded-lg border border-default-300 dark:border-gray-600 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Voucher Type Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-default-600 dark:text-gray-300">Voucher:</span>
          <Listbox value={filterVoucherType} onChange={setFilterVoucherType}>
            <div className="relative w-44">
              <ListboxButton className="relative w-full cursor-pointer rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500">
                <span className="block truncate">
                  {filterVoucherType === "All" ? "All Vouchers" : filterVoucherType}
                </span>
              </ListboxButton>
              <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <ListboxOption
                  value="All"
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                      active ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200" : "text-gray-900 dark:text-gray-100"
                    }`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? "font-medium" : ""}`}>
                        All Vouchers
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                          <IconCheck size={16} />
                        </span>
                      )}
                    </>
                  )}
                </ListboxOption>
                {VOUCHER_TYPES.map((vt) => (
                  <ListboxOption
                    key={vt.id}
                    value={vt.id}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                        active ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200" : "text-gray-900 dark:text-gray-100"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={`block truncate ${selected ? "font-medium" : ""}`}>
                          {vt.id}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                            <IconCheck size={16} />
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
      </div>

      {/* Stats */}
      <div className="mb-4 flex items-center gap-4 text-sm text-default-600 dark:text-gray-300">
        <span>
          Total: <span className="font-medium text-default-900 dark:text-gray-100">{mappings.length}</span> mappings
        </span>
        <span>
          Showing: <span className="font-medium text-default-900 dark:text-gray-100">{filteredMappings.length}</span>
        </span>
      </div>

      {/* Content */}
      <div className="overflow-x-auto rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
          <thead className="bg-default-100 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Location
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Voucher
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Mapping Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Account Code
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-24">
                Status
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {filteredMappings.length > 0 ? (
              filteredMappings.map((mapping) => (
                <tr key={mapping.id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sky-700 dark:text-sky-400 font-medium">
                        {mapping.location_id}
                      </span>
                      <span className="text-default-600 dark:text-gray-300">{mapping.location_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        mapping.voucher_type === "JVDR"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                      }`}
                    >
                      {mapping.voucher_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-default-700 dark:text-gray-200">
                    {getMappingTypeName(mapping.mapping_type)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <IconLink size={14} className="text-default-400 dark:text-gray-500" />
                      <span className="font-mono text-default-700 dark:text-gray-200">{mapping.account_code}</span>
                      {mapping.account_description && (
                        <span className="text-default-500 dark:text-gray-400 text-xs">
                          ({mapping.account_description})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        mapping.is_active
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      }`}
                    >
                      {mapping.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => handleEditClick(mapping)}
                        className="text-sky-600 dark:text-sky-400 hover:text-sky-800"
                        title="Edit"
                      >
                        <IconPencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(mapping)}
                        className="text-rose-600 hover:text-rose-800"
                        title="Delete"
                      >
                        <IconTrash size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400">
                  No mappings found. {searchTerm || filterVoucherType !== "All" ? "Try adjusting your filters." : "Create one to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit/Add Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/30" onClick={() => setShowEditModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6">
              <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100 mb-4">
                {editingMapping ? "Edit Mapping" : "Add New Mapping"}
              </h2>

              <div className="space-y-4">
                {/* Location ID */}
                <div>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                    Location ID
                  </label>
                  <input
                    type="text"
                    value={formData.location_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, location_id: e.target.value }))}
                    disabled={!!editingMapping}
                    className="w-full rounded-lg border border-default-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-default-100 dark:bg-gray-800"
                    placeholder="e.g., 01, 02"
                  />
                </div>

                {/* Location Name */}
                <div>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                    Location Name
                  </label>
                  <input
                    type="text"
                    value={formData.location_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, location_name: e.target.value }))}
                    className="w-full rounded-lg border border-default-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="e.g., OFFICE, DIRECTOR'S REMUNERATION"
                  />
                </div>

                {/* Voucher Type */}
                <div>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                    Voucher Type
                  </label>
                  <select
                    value={formData.voucher_type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, voucher_type: e.target.value as "JVDR" | "JVSL" }))}
                    disabled={!!editingMapping}
                    className="w-full rounded-lg border border-default-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-default-100 dark:bg-gray-800"
                  >
                    {VOUCHER_TYPES.map((vt) => (
                      <option key={vt.id} value={vt.id}>
                        {vt.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mapping Type */}
                <div>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                    Mapping Type
                  </label>
                  <select
                    value={formData.mapping_type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, mapping_type: e.target.value }))}
                    disabled={!!editingMapping}
                    className="w-full rounded-lg border border-default-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-default-100 dark:bg-gray-800"
                  >
                    <option value="">Select mapping type...</option>
                    {MAPPING_TYPES.map((mt) => (
                      <option key={mt.id} value={mt.id}>
                        {mt.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Account Code */}
                <div>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                    Account Code
                  </label>
                  <select
                    value={formData.account_code}
                    onChange={(e) => setFormData((prev) => ({ ...prev, account_code: e.target.value }))}
                    className="w-full rounded-lg border border-default-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">Select account code...</option>
                    {accountCodes.map((ac) => (
                      <option key={ac.code} value={ac.code}>
                        {ac.code} - {ac.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Active Status */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded border-default-300 dark:border-gray-600 text-sky-600 dark:text-sky-400 focus:ring-sky-500"
                  />
                  <label htmlFor="is_active" className="text-sm text-default-700 dark:text-gray-200">
                    Active
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  color="default"
                  onClick={() => setShowEditModal(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="filled"
                  color="sky"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : editingMapping ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Mapping"
        message={`Are you sure you want to delete this mapping for ${mappingToDelete?.location_name} (${mappingToDelete?.mapping_type})? This action cannot be undone.`}
        variant="danger"
      />
    </div>
  );
};

export default LocationAccountMappingsPage;
