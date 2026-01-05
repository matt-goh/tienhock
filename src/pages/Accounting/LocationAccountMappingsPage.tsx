// src/pages/Accounting/LocationAccountMappingsPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  IconSearch,
  IconCheck,
  IconPlus,
  IconPencil,
  IconTrash,
  IconX,
  IconChevronDown,
  IconHelp,
} from "@tabler/icons-react";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  ComboboxButton,
} from "@headlessui/react";

interface LocationAccountMapping {
  id: number;
  location_id: string;
  location_name: string;
  mapping_type: string;
  account_code: string;
  account_description?: string;
  voucher_type: "JVDR" | "JVSL";
  is_active: boolean;
}

interface AccountCode {
  code: string;
  description: string;
  ledger_type: string;
  is_active: boolean;
}

interface Location {
  id: string;
  name: string;
}

// Mapping types grouped by category
const EXPENSE_MAPPING_TYPES = [
  { id: "salary", name: "Salary", short: "SAL" },
  { id: "overtime", name: "Overtime", short: "OT" },
  { id: "bonus", name: "Bonus", short: "BNS" },
  { id: "commission", name: "Commission", short: "COM" },
  { id: "rounding", name: "Rounding", short: "RND" },
  { id: "cuti_tahunan", name: "Cuti Tahunan", short: "CT" },
  { id: "special_ot", name: "Special OT", short: "SOT" },
];

const CONTRIBUTION_MAPPING_TYPES = [
  { id: "epf_employer", name: "EPF (Employer)", short: "EPF" },
  { id: "socso_employer", name: "SOCSO (Employer)", short: "SOCSO" },
  { id: "sip_employer", name: "SIP (Employer)", short: "SIP" },
];

const ACCRUAL_MAPPING_TYPES = [
  { id: "accrual_salary", name: "Accrual - Salary", short: "AC-SAL" },
  { id: "accrual_epf", name: "Accrual - EPF", short: "AC-EPF" },
  { id: "accrual_socso", name: "Accrual - SOCSO", short: "AC-SC" },
  { id: "accrual_sip", name: "Accrual - SIP", short: "AC-SIP" },
  { id: "accrual_pcb", name: "Accrual - PCB", short: "AC-PCB" },
];

const ALL_MAPPING_TYPES = [
  ...EXPENSE_MAPPING_TYPES,
  ...CONTRIBUTION_MAPPING_TYPES,
  ...ACCRUAL_MAPPING_TYPES,
];

const LocationAccountMappingsPage: React.FC = () => {
  const [mappings, setMappings] = useState<LocationAccountMapping[]>([]);
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"JVDR" | "JVSL">("JVSL");

  // Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState<LocationAccountMapping | null>(null);
  const [formData, setFormData] = useState({
    location_id: "",
    location_name: "",
    mapping_type: "",
    account_code: "",
    voucher_type: "JVSL" as "JVDR" | "JVSL",
  });
  const [accountSearch, setAccountSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [mappingToDelete, setMappingToDelete] = useState<LocationAccountMapping | null>(null);

  // Help dialog state
  const [showHelpDialog, setShowHelpDialog] = useState(false);

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
      // Only fetch GL (General Ledger) accounts, exclude TD (Trade Debtors)
      const response = await api.get("/api/account-codes?flat=true&is_active=true&ledger_type=GL");
      setAccountCodes(response as AccountCode[]);
    } catch (error) {
      console.error("Error fetching account codes:", error);
    }
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const response = await api.get("/api/locations");
      setLocations(response as Location[]);
    } catch (error) {
      console.error("Error fetching locations:", error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchMappings(), fetchAccountCodes(), fetchLocations()]);
      setLoading(false);
    };
    loadData();
  }, [fetchMappings, fetchAccountCodes, fetchLocations]);

  // Build mappings matrix: location -> mapping_type -> mapping
  const mappingsMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, LocationAccountMapping | undefined>> = {};

    mappings
      .filter((m) => m.voucher_type === activeTab && m.is_active)
      .forEach((m) => {
        if (!matrix[m.location_id]) {
          matrix[m.location_id] = {};
        }
        matrix[m.location_id][m.mapping_type] = m;
      });

    return matrix;
  }, [mappings, activeTab]);

  // Get locations to display based on active tab
  const displayLocations = useMemo(() => {
    if (activeTab === "JVDR") {
      // For JVDR, only show location 01 (Director)
      return [{ id: "01", name: "DIRECTOR'S REMUNERATION" }];
    } else {
      // For JVSL, show location 00 (accruals) and all other locations except 01
      const locs: Location[] = [{ id: "00", name: "ACCRUALS" }];
      locations
        .filter((l) => l.id !== "01" && l.id !== "05" && l.id !== "12" && l.id !== "15") // Exclude director and deleted locations
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((l) => locs.push(l));
      return locs;
    }
  }, [activeTab, locations]);

  // Filter locations by search
  const filteredLocations = useMemo(() => {
    if (!searchTerm) return displayLocations;
    const lower = searchTerm.toLowerCase();
    return displayLocations.filter(
      (l) => l.id.includes(lower) || l.name.toLowerCase().includes(lower)
    );
  }, [displayLocations, searchTerm]);

  // Get mapping types to display based on location
  const getMappingTypesForLocation = (locationId: string): typeof ALL_MAPPING_TYPES => {
    if (activeTab === "JVDR") {
      // JVDR shows all types for director
      return ALL_MAPPING_TYPES;
    } else {
      // JVSL: location 00 only shows accruals, others show expense + contribution
      if (locationId === "00") {
        return ACCRUAL_MAPPING_TYPES;
      }
      return [...EXPENSE_MAPPING_TYPES, ...CONTRIBUTION_MAPPING_TYPES];
    }
  };

  // Filtered account codes for combobox
  const filteredAccountCodes = useMemo(() => {
    if (!accountSearch) return accountCodes.slice(0, 50);
    const lower = accountSearch.toLowerCase();
    return accountCodes
      .filter(
        (ac) =>
          ac.code.toLowerCase().includes(lower) ||
          ac.description.toLowerCase().includes(lower)
      )
      .slice(0, 50);
  }, [accountCodes, accountSearch]);

  // Handlers
  const handleCellClick = (locationId: string, locationName: string, mappingType: string, existingMapping?: LocationAccountMapping) => {
    if (existingMapping) {
      setEditingMapping(existingMapping);
      setFormData({
        location_id: existingMapping.location_id,
        location_name: existingMapping.location_name,
        mapping_type: existingMapping.mapping_type,
        account_code: existingMapping.account_code,
        voucher_type: existingMapping.voucher_type,
      });
    } else {
      setEditingMapping(null);
      setFormData({
        location_id: locationId,
        location_name: locationName,
        mapping_type: mappingType,
        account_code: "",
        voucher_type: activeTab,
      });
    }
    setAccountSearch("");
    setShowEditModal(true);
  };

  const handleDeleteClick = (mapping: LocationAccountMapping) => {
    setMappingToDelete(mapping);
    setShowDeleteDialog(true);
  };

  const handleSave = async () => {
    if (!formData.account_code) {
      toast.error("Please select an account code");
      return;
    }

    setIsSaving(true);
    try {
      if (editingMapping) {
        await api.put(`/api/journal-vouchers/mappings/${editingMapping.id}`, {
          account_code: formData.account_code,
          is_active: true,
        });
        toast.success("Mapping updated successfully");
      } else {
        await api.post("/api/journal-vouchers/mappings", {
          ...formData,
          is_active: true,
        });
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

  const getMappingTypeName = (typeId: string): string => {
    const found = ALL_MAPPING_TYPES.find((t) => t.id === typeId);
    return found ? found.name : typeId;
  };

  if (loading) {
    return (
      <div className="flex justify-center my-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="mb-4 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Location Account Mappings
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
            Manage account code mappings for JVDR/JVSL voucher generation
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-default-200 dark:border-gray-700">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("JVSL")}
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "JVSL"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-default-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
            }`}
          >
            JVSL - Staff Salary
          </button>
          <button
            onClick={() => setActiveTab("JVDR")}
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "JVDR"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-default-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
            }`}
          >
            JVDR - Director's Remuneration
          </button>
        </div>
      </div>

      {/* Search + Legend + Help */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative max-w-md">
            <IconSearch
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400 dark:text-gray-500"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search location..."
              className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-default-600 dark:text-gray-400">
            <span>{filteredLocations.length} location(s)</span>
            <span className="text-default-300 dark:text-gray-600">|</span>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-green-100 dark:bg-green-900/30"></span>
              <span>Mapped</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-3 h-3 rounded border border-dashed border-default-300 dark:border-gray-600">
                <IconPlus size={8} className="text-default-400" />
              </span>
              <span>Not mapped</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-default-100 dark:bg-gray-900/30"></span>
              <span>N/A</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowHelpDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-default-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-default-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Help - Learn about account mappings"
        >
          <IconHelp size={18} />
          <span>Help</span>
        </button>
      </div>

      {/* Matrix Grid */}
      <div className="overflow-x-auto rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <table className="min-w-full">
          <thead className="bg-default-50 dark:bg-gray-900/50">
            <tr>
              <th className="sticky left-0 z-10 bg-default-50 dark:bg-gray-900/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 border-r border-default-200 dark:border-gray-700 min-w-[180px]">
                Location
              </th>
              {activeTab === "JVSL" ? (
                <>
                  {/* Expense columns */}
                  <th
                    colSpan={EXPENSE_MAPPING_TYPES.length}
                    className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-b border-default-200 dark:border-gray-700"
                  >
                    Expense (Debit)
                  </th>
                  {/* Contribution columns */}
                  <th
                    colSpan={CONTRIBUTION_MAPPING_TYPES.length}
                    className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-b border-default-200 dark:border-gray-700"
                  >
                    Contributions (Debit)
                  </th>
                </>
              ) : (
                <>
                  {/* All columns for JVDR */}
                  <th
                    colSpan={EXPENSE_MAPPING_TYPES.length + CONTRIBUTION_MAPPING_TYPES.length}
                    className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-b border-default-200 dark:border-gray-700"
                  >
                    Debit
                  </th>
                  <th
                    colSpan={ACCRUAL_MAPPING_TYPES.length}
                    className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-default-200 dark:border-gray-700"
                  >
                    Credit (Accruals)
                  </th>
                </>
              )}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-default-50 dark:bg-gray-900/50 px-4 py-2 text-left text-xs font-medium text-default-600 dark:text-gray-300 border-r border-default-200 dark:border-gray-700">
                ID - Name
              </th>
              {(activeTab === "JVSL"
                ? [...EXPENSE_MAPPING_TYPES, ...CONTRIBUTION_MAPPING_TYPES]
                : ALL_MAPPING_TYPES
              ).map((mt) => (
                <th
                  key={mt.id}
                  className="px-2 py-2 text-center text-xs font-medium text-default-600 dark:text-gray-300 min-w-[80px]"
                  title={mt.name}
                >
                  {mt.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-default-200 dark:divide-gray-700">
            {filteredLocations.map((loc) => {
              const mappingTypes = getMappingTypesForLocation(loc.id);
              const isAccrualRow = loc.id === "00";

              return (
                <tr
                  key={loc.id}
                  className={`hover:bg-default-50 dark:hover:bg-gray-700/50 ${
                    isAccrualRow ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                  }`}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-4 py-2 text-sm border-r border-default-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sky-700 dark:text-sky-400 font-medium">
                        {loc.id}
                      </span>
                      <span className="text-default-700 dark:text-gray-200 truncate max-w-[120px]" title={loc.name}>
                        {loc.name}
                      </span>
                    </div>
                  </td>
                  {(activeTab === "JVSL"
                    ? [...EXPENSE_MAPPING_TYPES, ...CONTRIBUTION_MAPPING_TYPES]
                    : ALL_MAPPING_TYPES
                  ).map((mt) => {
                    const mapping = mappingsMatrix[loc.id]?.[mt.id];
                    const isApplicable = mappingTypes.some((t) => t.id === mt.id);

                    if (!isApplicable) {
                      return (
                        <td
                          key={mt.id}
                          className="px-2 py-2 text-center text-xs bg-default-100 dark:bg-gray-900/30"
                        >
                          <span className="text-default-300 dark:text-gray-600">-</span>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={mt.id}
                        className="px-2 py-2 text-center text-xs"
                      >
                        {mapping ? (
                          <div className="group relative">
                            <button
                              onClick={() => handleCellClick(loc.id, loc.name, mt.id, mapping)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors font-mono text-xs"
                              title={`${mapping.account_code}${mapping.account_description ? ` - ${mapping.account_description}` : ""}`}
                            >
                              {mapping.account_code}
                              <IconPencil size={12} className="opacity-0 group-hover:opacity-100" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(mapping);
                              }}
                              className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete mapping"
                            >
                              <IconX size={10} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleCellClick(loc.id, loc.name, mt.id)}
                            className="inline-flex items-center justify-center w-8 h-6 rounded border border-dashed border-default-300 dark:border-gray-600 text-default-400 dark:text-gray-500 hover:border-sky-400 hover:text-sky-500 dark:hover:border-sky-500 dark:hover:text-sky-400 transition-colors"
                            title={`Add ${mt.name} mapping`}
                          >
                            <IconPlus size={14} />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filteredLocations.length === 0 && (
              <tr>
                <td
                  colSpan={20}
                  className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400"
                >
                  No locations found matching "{searchTerm}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>


      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/30" onClick={() => setShowEditModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100 mb-4">
                {editingMapping ? "Edit Mapping" : "Add Mapping"}
              </h2>

              <div className="space-y-4">
                {/* Location Info */}
                <div className="p-3 rounded-lg bg-default-50 dark:bg-gray-900/50">
                  <div className="text-xs text-default-500 dark:text-gray-400 mb-1">Location</div>
                  <div className="font-medium text-default-800 dark:text-gray-200">
                    <span className="font-mono text-sky-600 dark:text-sky-400">{formData.location_id}</span>
                    {" - "}
                    {formData.location_name}
                  </div>
                </div>

                {/* Mapping Type Info */}
                <div className="p-3 rounded-lg bg-default-50 dark:bg-gray-900/50">
                  <div className="text-xs text-default-500 dark:text-gray-400 mb-1">Mapping Type</div>
                  <div className="font-medium text-default-800 dark:text-gray-200">
                    {getMappingTypeName(formData.mapping_type)}
                  </div>
                </div>

                {/* Account Code Selection */}
                <div>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                    Account Code
                  </label>
                  <Combobox
                    value={formData.account_code}
                    onChange={(value: string) => setFormData((prev) => ({ ...prev, account_code: value || "" }))}
                  >
                    <div className="relative">
                      <ComboboxInput
                        className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 pr-10 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        displayValue={(code: string) => {
                          if (!code) return "";
                          const account = accountCodes.find((ac) => ac.code === code);
                          return account ? `${account.code} - ${account.description}` : code;
                        }}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        placeholder="Search account code..."
                      />
                      <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <IconChevronDown size={18} className="text-default-400" />
                      </ComboboxButton>
                      <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        {filteredAccountCodes.length === 0 ? (
                          <div className="px-4 py-2 text-default-500 dark:text-gray-400">
                            No accounts found
                          </div>
                        ) : (
                          filteredAccountCodes.map((ac) => (
                            <ComboboxOption
                              key={ac.code}
                              value={ac.code}
                              className={({ active }) =>
                                `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                  active
                                    ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
                                    : "text-gray-900 dark:text-gray-100"
                                }`
                              }
                            >
                              {({ selected }) => (
                                <>
                                  <span className={`block truncate ${selected ? "font-medium" : ""}`}>
                                    <span className="font-mono">{ac.code}</span>
                                    <span className="text-default-500 dark:text-gray-400 ml-2">
                                      {ac.description}
                                    </span>
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                                      <IconCheck size={16} />
                                    </span>
                                  )}
                                </>
                              )}
                            </ComboboxOption>
                          ))
                        )}
                        {filteredAccountCodes.length >= 50 && (
                          <div className="px-4 py-2 text-xs text-default-500 dark:text-gray-400 border-t border-default-200 dark:border-gray-700">
                            Showing first 50 results. Type to narrow down.
                          </div>
                        )}
                      </ComboboxOptions>
                    </div>
                  </Combobox>
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
                  disabled={isSaving || !formData.account_code}
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
        message={`Are you sure you want to delete this mapping for ${mappingToDelete?.location_name} (${getMappingTypeName(mappingToDelete?.mapping_type || "")})? This action cannot be undone.`}
        variant="danger"
      />

      {/* Help Dialog */}
      {showHelpDialog && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/30" onClick={() => setShowHelpDialog(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100 flex items-center gap-2">
                  <IconHelp size={22} className="text-sky-500" />
                  Location Account Mappings Guide
                </h2>
                <button
                  onClick={() => setShowHelpDialog(false)}
                  className="p-1 text-default-400 hover:text-default-600 dark:hover:text-gray-200 rounded"
                >
                  <IconX size={20} />
                </button>
              </div>

              <div className="space-y-4 text-sm text-default-700 dark:text-gray-300">
                {/* What is this */}
                <div>
                  <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">What are Location Account Mappings?</h3>
                  <p>
                    This page manages the GL (General Ledger) account codes used when generating payroll journal vouchers.
                    Each location in the payroll system needs to be mapped to specific account codes so the voucher generator
                    knows which accounts to debit/credit for salary expenses and statutory contributions.
                  </p>
                </div>

                {/* Voucher Types */}
                <div>
                  <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">Voucher Types</h3>
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                      <span className="font-medium text-purple-700 dark:text-purple-300">JVDR - Director's Remuneration</span>
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                        Journal voucher for director salary, contributions, and accruals. Only uses Location 01.
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                      <span className="font-medium text-sky-700 dark:text-sky-300">JVSL - Staff Salary</span>
                      <p className="text-xs text-sky-600 dark:text-sky-400 mt-0.5">
                        Journal voucher for all staff salaries and contributions. Uses Locations 02-24 for expenses
                        and Location 00 for accruals (credit side).
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mapping Types */}
                <div>
                  <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">Mapping Types</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium text-green-700 dark:text-green-400 mb-1.5 uppercase">Expense (Debit)</div>
                      <ul className="space-y-0.5 text-xs">
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">SAL</span> - Base salary</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">OT</span> - Overtime pay</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">BNS</span> - Bonus payments</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">COM</span> - Sales commission</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">RND</span> - Rounding adjustment</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">CT</span> - Cuti Tahunan payout</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">SOT</span> - Special overtime</li>
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1.5 uppercase">Contributions (Debit)</div>
                      <ul className="space-y-0.5 text-xs">
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">EPF</span> - Employer's EPF contribution</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">SOCSO</span> - Employer's SOCSO contribution</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">SIP</span> - Employer's SIP contribution</li>
                      </ul>
                      <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5 mt-3 uppercase">Accruals (Credit)</div>
                      <ul className="space-y-0.5 text-xs">
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">AC-SAL</span> - Accrued salary payable</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">AC-EPF</span> - Accrued EPF payable</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">AC-SC</span> - Accrued SOCSO payable</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">AC-SIP</span> - Accrued SIP payable</li>
                        <li><span className="font-mono bg-default-100 dark:bg-gray-700 px-1 rounded">AC-PCB</span> - Accrued PCB payable</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* How to use */}
                <div>
                  <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">How to Use the Matrix Grid</h3>
                  <ul className="space-y-1.5">
                    <li className="flex items-start gap-2">
                      <span className="inline-block w-3 h-3 mt-0.5 rounded bg-green-100 dark:bg-green-900/30 shrink-0"></span>
                      <span><strong>Mapped:</strong> Account code is assigned. Click to edit or hover to see delete button.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-3 h-3 mt-0.5 rounded border border-dashed border-default-300 dark:border-gray-600 shrink-0">
                        <IconPlus size={8} className="text-default-400" />
                      </span>
                      <span><strong>Not mapped:</strong> Click the + button to add a new mapping.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="inline-block w-3 h-3 mt-0.5 rounded bg-default-100 dark:bg-gray-900/30 shrink-0"></span>
                      <span><strong>N/A:</strong> Not applicable for this location (e.g., accruals don't apply to regular locations).</span>
                    </li>
                  </ul>
                </div>

                {/* Important Notes */}
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-1.5">Important Notes</h3>
                  <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
                    <li>All expense and contribution mappings must be set for voucher generation to work.</li>
                    <li>Only GL (General Ledger) account codes can be selected.</li>
                    <li>Location 00 is used for JVSL credit entries (accruals).</li>
                    <li>Locations 16-24 are for special payroll items (commissions, bonus, cuti tahunan, special OT).</li>
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  type="button"
                  variant="filled"
                  color="sky"
                  onClick={() => setShowHelpDialog(false)}
                >
                  Got it
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationAccountMappingsPage;
