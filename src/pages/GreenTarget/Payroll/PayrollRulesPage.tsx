// src/pages/GreenTarget/Payroll/PayrollRulesPage.tsx
import React, { useState, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from "@headlessui/react";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import toast from "react-hot-toast";
import { greenTargetApi } from "../../../routes/greentarget/api";
import {
  IconMapPin,
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
  IconChevronDown,
  IconRuler,
  IconPackage,
  IconSearch,
} from "@tabler/icons-react";
import clsx from "clsx";

interface PickupDestination {
  id: number;
  code: string;
  name: string;
  is_default: boolean;
  sort_order: number;
  is_active: boolean;
}

interface PayrollRule {
  id: number;
  rule_type: "PLACEMENT" | "PICKUP";
  condition_field: string;
  condition_operator: string;
  condition_value: string;
  secondary_condition_field: string | null;
  secondary_condition_operator: string | null;
  secondary_condition_value: string | null;
  pay_code_id: string;
  pay_code_description?: string;
  priority: number;
  is_active: boolean;
  description: string | null;
}

interface AddonPaycode {
  id: number;
  pay_code_id: string;
  display_name: string;
  default_amount: number;
  is_variable_amount: boolean;
  sort_order: number;
  pay_code_description?: string;
}

interface PayCode {
  id: string;
  description: string;
  rate_biasa: number;
}

interface PayrollSettings {
  [key: string]: {
    value: string;
    description: string;
  };
}

type TabType = "rules" | "settings";

const PayrollRulesPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("rules");
  const [isLoading, setIsLoading] = useState(true);

  // Data states
  const [destinations, setDestinations] = useState<PickupDestination[]>([]);
  const [rules, setRules] = useState<PayrollRule[]>([]);
  const [addonPaycodes, setAddonPaycodes] = useState<AddonPaycode[]>([]);
  const [payCodes, setPayCodes] = useState<PayCode[]>([]);
  const [settings, setSettings] = useState<PayrollSettings>({});
  const [editedSettings, setEditedSettings] = useState<PayrollSettings>({});
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);

  // Modal states
  const [isDestinationModalOpen, setIsDestinationModalOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [isAddonModalOpen, setIsAddonModalOpen] = useState(false);
  const [editingDestination, setEditingDestination] =
    useState<PickupDestination | null>(null);
  const [editingRule, setEditingRule] = useState<PayrollRule | null>(null);
  const [editingAddon, setEditingAddon] = useState<AddonPaycode | null>(null);

  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "destination" | "rule" | "addon";
    item: PickupDestination | PayrollRule | AddonPaycode;
  } | null>(null);

  // Form states
  const [destinationForm, setDestinationForm] = useState({
    code: "",
    name: "",
    is_default: false,
    sort_order: 0,
  });

  const [ruleForm, setRuleForm] = useState({
    rule_type: "PLACEMENT" as "PLACEMENT" | "PICKUP",
    condition_field: "invoice_amount",
    condition_operator: "<=",
    condition_value: "",
    secondary_condition_field: "",
    secondary_condition_operator: "",
    secondary_condition_value: "",
    pay_code_id: "",
    priority: 0,
    description: "",
  });

  const [addonForm, setAddonForm] = useState({
    pay_code_id: "",
    display_name: "",
    default_amount: 0,
    is_variable_amount: false,
    sort_order: 0,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [destinationsRes, rulesRes, addonsRes, payCodesRes, settingsRes] =
        await Promise.all([
          greenTargetApi.getPickupDestinations(),
          greenTargetApi.getPayrollRules(),
          greenTargetApi.getAddonPaycodes(),
          greenTargetApi.request(
            "GET",
            "/greentarget/api/payroll-rules/pay-codes"
          ),
          greenTargetApi.getPayrollSettings(),
        ]);

      setDestinations(destinationsRes || []);
      setRules(rulesRes || []);
      setAddonPaycodes(addonsRes || []);
      setPayCodes(payCodesRes || []);
      setSettings(settingsRes || {});
      setEditedSettings(settingsRes || {});
      setHasUnsavedSettings(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load settings data");
    } finally {
      setIsLoading(false);
    }
  };

  // Destination handlers
  const openDestinationModal = (destination?: PickupDestination) => {
    if (destination) {
      setEditingDestination(destination);
      setDestinationForm({
        code: destination.code,
        name: destination.name,
        is_default: destination.is_default,
        sort_order: destination.sort_order,
      });
    } else {
      setEditingDestination(null);
      setDestinationForm({
        code: "",
        name: "",
        is_default: false,
        sort_order: destinations.length,
      });
    }
    setIsDestinationModalOpen(true);
  };

  const handleSaveDestination = async () => {
    if (!destinationForm.code || !destinationForm.name) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      if (editingDestination) {
        await greenTargetApi.updatePickupDestination(
          editingDestination.id,
          destinationForm
        );
        toast.success("Destination updated");
      } else {
        await greenTargetApi.createPickupDestination(destinationForm);
        toast.success("Destination created");
      }
      setIsDestinationModalOpen(false);
      fetchAllData();
    } catch (error) {
      console.error("Error saving destination:", error);
      toast.error("Failed to save destination");
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteConfirm = (
    type: "destination" | "rule" | "addon",
    item: PickupDestination | PayrollRule | AddonPaycode
  ) => {
    setDeleteTarget({ type, item });
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === "destination") {
        await greenTargetApi.deletePickupDestination(
          (deleteTarget.item as PickupDestination).id
        );
        toast.success("Destination deleted");
      } else if (deleteTarget.type === "rule") {
        await greenTargetApi.deletePayrollRule(
          (deleteTarget.item as PayrollRule).id
        );
        toast.success("Rule deleted");
      } else if (deleteTarget.type === "addon") {
        await greenTargetApi.request(
          "DELETE",
          `/greentarget/api/payroll-rules/addon-paycodes/${
            (deleteTarget.item as AddonPaycode).id
          }`
        );
        toast.success("Addon paycode deleted");
      }
      fetchAllData();
    } catch (error: unknown) {
      console.error("Error deleting:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete";
      toast.error(errorMessage);
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    }
  };

  const getDeleteMessage = () => {
    if (!deleteTarget) return "";
    if (deleteTarget.type === "destination") {
      return `Delete destination "${
        (deleteTarget.item as PickupDestination).name
      }"?`;
    } else if (deleteTarget.type === "rule") {
      const rule = deleteTarget.item as PayrollRule;
      return `Delete rule "${rule.description || rule.pay_code_id}"?`;
    } else {
      return `Delete addon paycode "${
        (deleteTarget.item as AddonPaycode).display_name
      }"?`;
    }
  };

  // Rule handlers
  const openRuleModal = (rule?: PayrollRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        rule_type: rule.rule_type,
        condition_field: rule.condition_field,
        condition_operator: rule.condition_operator,
        condition_value: rule.condition_value,
        secondary_condition_field: rule.secondary_condition_field || "",
        secondary_condition_operator: rule.secondary_condition_operator || "",
        secondary_condition_value: rule.secondary_condition_value || "",
        pay_code_id: rule.pay_code_id,
        priority: rule.priority,
        description: rule.description || "",
      });
    } else {
      setEditingRule(null);
      setRuleForm({
        rule_type: "PLACEMENT",
        condition_field: "invoice_amount",
        condition_operator: "<=",
        condition_value: "",
        secondary_condition_field: "",
        secondary_condition_operator: "",
        secondary_condition_value: "",
        pay_code_id: "",
        priority: rules.length * 10,
        description: "",
      });
    }
    setIsRuleModalOpen(true);
  };

  const handleSaveRule = async () => {
    if (!ruleForm.condition_value) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate numeric values for invoice_amount conditions
    if (
      ruleForm.condition_field === "invoice_amount" &&
      isNaN(parseFloat(ruleForm.condition_value))
    ) {
      toast.error("Condition value must be a number for invoice_amount");
      return;
    }
    if (
      ruleForm.secondary_condition_field === "invoice_amount" &&
      ruleForm.secondary_condition_value &&
      isNaN(parseFloat(ruleForm.secondary_condition_value))
    ) {
      toast.error(
        "Secondary condition value must be a number for invoice_amount"
      );
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...ruleForm,
        secondary_condition_field:
          ruleForm.secondary_condition_field || undefined,
        secondary_condition_operator:
          ruleForm.secondary_condition_operator || undefined,
        secondary_condition_value:
          ruleForm.secondary_condition_value || undefined,
      };

      if (editingRule) {
        await greenTargetApi.updatePayrollRule(editingRule.id, payload);
        toast.success("Rule updated");
      } else {
        await greenTargetApi.createPayrollRule(payload);
        toast.success("Rule created");
      }
      setIsRuleModalOpen(false);
      fetchAllData();
    } catch (error) {
      console.error("Error saving rule:", error);
      toast.error("Failed to save rule");
    } finally {
      setIsSaving(false);
    }
  };

  // Addon handlers
  const openAddonModal = (addon?: AddonPaycode) => {
    if (addon) {
      setEditingAddon(addon);
      setAddonForm({
        pay_code_id: addon.pay_code_id,
        display_name: addon.display_name,
        default_amount: addon.default_amount,
        is_variable_amount: addon.is_variable_amount,
        sort_order: addon.sort_order,
      });
    } else {
      setEditingAddon(null);
      setAddonForm({
        pay_code_id: "",
        display_name: "",
        default_amount: 0,
        is_variable_amount: false,
        sort_order: addonPaycodes.length,
      });
    }
    setIsAddonModalOpen(true);
  };

  const handleSaveAddon = async () => {
    if (!addonForm.display_name) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      if (editingAddon) {
        await greenTargetApi.request(
          "PUT",
          `/greentarget/api/payroll-rules/addon-paycodes/${editingAddon.id}`,
          addonForm
        );
        toast.success("Addon paycode updated");
      } else {
        await greenTargetApi.request(
          "POST",
          "/greentarget/api/payroll-rules/addon-paycodes",
          addonForm
        );
        toast.success("Addon paycode created");
      }
      setIsAddonModalOpen(false);
      fetchAllData();
    } catch (error) {
      console.error("Error saving addon:", error);
      toast.error("Failed to save addon paycode");
    } finally {
      setIsSaving(false);
    }
  };

  // Settings handlers
  const handleLocalSettingChange = (key: string, value: string) => {
    setEditedSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
    setHasUnsavedSettings(true);
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // Save each modified setting
      const savePromises = Object.entries(editedSettings).map(([key, setting]) => {
        if (settings[key]?.value !== setting.value) {
          return greenTargetApi.updatePayrollSetting(key, setting.value);
        }
        return Promise.resolve();
      });
      await Promise.all(savePromises);

      setSettings(editedSettings);
      setHasUnsavedSettings(false);
      toast.success("Settings saved");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  // Format rule condition for display
  const formatRuleCondition = (rule: PayrollRule) => {
    let condition = `${rule.condition_field} ${rule.condition_operator} ${rule.condition_value}`;
    if (rule.secondary_condition_field) {
      condition += ` AND ${rule.secondary_condition_field} ${rule.secondary_condition_operator} ${rule.secondary_condition_value}`;
    }
    return condition;
  };

  // Filter rules by type
  const placementRules = rules.filter((r) => r.rule_type === "PLACEMENT");
  const pickupRules = rules.filter((r) => r.rule_type === "PICKUP");

  // Filtered data based on search term
  const filteredPlacementRules = placementRules.filter(
    (r) =>
      (r.pay_code_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredPickupRules = pickupRules.filter(
    (r) =>
      (r.pay_code_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredAddonPaycodes = addonPaycodes.filter(
    (a) =>
      (a.pay_code_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.display_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Header Row */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
        {/* Left side: Back button, Title, Stats */}
        <div className="flex items-center gap-3">
          <BackButton onClick={() => navigate("/greentarget/payroll")} />
          <span className="text-default-300 dark:text-gray-600">|</span>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Payroll Settings
          </h1>
          <span className="text-default-300 dark:text-gray-600">|</span>
          {/* Stats */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <IconMapPin
                size={15}
                className="text-amber-600 dark:text-amber-400"
              />
              <span className="font-medium text-default-700 dark:text-gray-200">
                {destinations.length}
              </span>
              <span className="text-default-400 dark:text-gray-400">dest</span>
            </div>
            <span className="text-default-300 dark:text-gray-600">•</span>
            <div className="flex items-center gap-1.5">
              <IconRuler size={15} className="text-sky-600 dark:text-sky-400" />
              <span className="font-medium text-default-700 dark:text-gray-200">
                {rules.length}
              </span>
              <span className="text-default-400 dark:text-gray-400">rules</span>
            </div>
            <span className="text-default-300 dark:text-gray-600">•</span>
            <div className="flex items-center gap-1.5">
              <IconPackage
                size={15}
                className="text-emerald-600 dark:text-emerald-400"
              />
              <span className="font-medium text-default-700 dark:text-gray-200">
                {addonPaycodes.length}
              </span>
              <span className="text-default-400 dark:text-gray-400">
                addons
              </span>
            </div>
          </div>
        </div>

        {/* Right side: Search, Pill filters */}
        <div className="flex items-center gap-2">
          {/* Compact Search Input */}
          {activeTab === "rules" && (
            <>
              <div className="relative">
                <IconSearch
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
                />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 pr-7 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 dark:focus:ring-amber-400 focus:border-amber-500 dark:focus:border-amber-400 w-32 placeholder-gray-400 dark:placeholder-gray-500"
                />
                {searchTerm && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300 transition-colors"
                    onClick={() => setSearchTerm("")}
                    title="Clear search"
                  >
                    <IconX size={12} />
                  </button>
                )}
              </div>
              <span className="text-default-300 dark:text-gray-600">|</span>
            </>
          )}

          {/* Pill Button Filters */}
          <div className="flex items-center bg-default-100 dark:bg-gray-800 rounded-full p-0.5">
            <button
              onClick={() => setActiveTab("rules")}
              className={clsx(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                activeTab === "rules"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-default-600 dark:text-gray-400 hover:text-default-800 dark:hover:text-gray-200"
              )}
            >
              Rules & Addons
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={clsx(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                activeTab === "settings"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-default-600 dark:text-gray-400 hover:text-default-800 dark:hover:text-gray-200"
              )}
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Rules & Addons Tab */}
      {activeTab === "rules" && (
        <div className="space-y-3">
          {/* PLACEMENT Rules */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-4 py-2 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/50 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                  PLACEMENT Rules
                </span>
                <span className="text-xs text-default-400 dark:text-gray-500 ml-2">
                  Based on invoice amount
                </span>
              </div>
              <button
                onClick={() => {
                  setRuleForm((prev) => ({ ...prev, rule_type: "PLACEMENT", condition_field: "invoice_amount" }));
                  openRuleModal();
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
              >
                <IconPlus size={14} />
                Add Rule
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-default-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                    Description
                  </th>
                  <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                    Condition
                  </th>
                  <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                    Pay Code
                  </th>
                  <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-20">
                    Priority
                  </th>
                  <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPlacementRules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="border-b border-default-100 dark:border-gray-700"
                  >
                    <td className="px-4 py-2 text-default-800 dark:text-gray-200">
                      {rule.description || "-"}
                    </td>
                    <td className="px-4 py-2">
                      <code className="text-xs bg-default-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        {formatRuleCondition(rule)}
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      {rule.pay_code_id ? (
                        <>
                          <span className="font-mono font-medium text-sky-600 dark:text-sky-400 text-xs">
                            {rule.pay_code_id}
                          </span>
                          {rule.pay_code_description && (
                            <span className="text-default-500 dark:text-gray-400 text-xs ml-1">
                              ({rule.pay_code_description})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-xs italic">
                          Not assigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center text-default-600 dark:text-gray-400">
                      {rule.priority}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openRuleModal(rule)}
                          className="p-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
                          title="Edit"
                        >
                          <IconEdit size={16} />
                        </button>
                        <button
                          onClick={() => openDeleteConfirm("rule", rule)}
                          className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                          title="Delete"
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPlacementRules.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-default-500 dark:text-gray-400 text-sm"
                    >
                      {searchTerm
                        ? "No PLACEMENT rules matching search"
                        : "No PLACEMENT rules configured"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PICKUP Rules */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-4 py-2 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/50 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                  PICKUP Rules
                </span>
                <span className="text-xs text-default-400 dark:text-gray-500 ml-2">
                  Based on destination & amount
                </span>
              </div>
              <button
                onClick={() => {
                  setRuleForm((prev) => ({ ...prev, rule_type: "PICKUP", condition_field: "destination" }));
                  openRuleModal();
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
              >
                <IconPlus size={14} />
                Add Rule
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-default-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                    Description
                  </th>
                  <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                    Condition
                  </th>
                  <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                    Pay Code
                  </th>
                  <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-20">
                    Priority
                  </th>
                  <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPickupRules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="border-b border-default-100 dark:border-gray-700"
                  >
                    <td className="px-4 py-2 text-default-800 dark:text-gray-200">
                      {rule.description || "-"}
                    </td>
                    <td className="px-4 py-2">
                      <code className="text-xs bg-default-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        {formatRuleCondition(rule)}
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      {rule.pay_code_id ? (
                        <>
                          <span className="font-mono font-medium text-sky-600 dark:text-sky-400 text-xs">
                            {rule.pay_code_id}
                          </span>
                          {rule.pay_code_description && (
                            <span className="text-default-500 dark:text-gray-400 text-xs ml-1">
                              ({rule.pay_code_description})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-xs italic">
                          Not assigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center text-default-600 dark:text-gray-400">
                      {rule.priority}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openRuleModal(rule)}
                          className="p-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
                          title="Edit"
                        >
                          <IconEdit size={16} />
                        </button>
                        <button
                          onClick={() => openDeleteConfirm("rule", rule)}
                          className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                          title="Delete"
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPickupRules.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-default-500 dark:text-gray-400 text-sm"
                    >
                      {searchTerm
                        ? "No PICKUP rules matching search"
                        : "No PICKUP rules configured"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Addon Paycodes Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-4 py-2 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/50 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                  Addon Paycodes
                </span>
                <span className="text-xs text-default-400 dark:text-gray-500 ml-2">
                  Manual add-ons for rentals
                </span>
              </div>
              <button
                onClick={() => openAddonModal()}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
              >
                <IconPlus size={14} />
                Add Addon
              </button>
            </div>
          <table className="w-full text-sm">
            <thead className="bg-default-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                  Pay Code
                </th>
                <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                  Display Name
                </th>
                <th className="px-4 py-2 text-right text-default-600 dark:text-gray-300 font-medium text-xs w-28">
                  Amount
                </th>
                <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-24">
                  Type
                </th>
                <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-20">
                  Order
                </th>
                <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAddonPaycodes.map((addon) => (
                <tr
                  key={addon.id}
                  className="border-b border-default-100 dark:border-gray-700"
                >
                  <td className="px-4 py-2">
                    {addon.pay_code_id ? (
                      <>
                        <span className="font-mono font-medium text-sky-600 dark:text-sky-400 text-xs">
                          {addon.pay_code_id}
                        </span>
                        {addon.pay_code_description && (
                          <span className="text-default-500 dark:text-gray-400 text-xs ml-1">
                            ({addon.pay_code_description})
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 text-xs italic">
                        Not assigned
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-default-800 dark:text-gray-200">
                    {addon.display_name}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-default-800 dark:text-gray-200 text-xs">
                    RM {(Number(addon.default_amount) || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {addon.is_variable_amount ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs">
                        Variable
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-400 rounded text-xs">
                        Fixed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center text-default-600 dark:text-gray-400">
                    {addon.sort_order}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openAddonModal(addon)}
                        className="p-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
                        title="Edit"
                      >
                        <IconEdit size={16} />
                      </button>
                      <button
                        onClick={() => openDeleteConfirm("addon", addon)}
                        className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                        title="Delete"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAddonPaycodes.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-default-500 dark:text-gray-400 text-sm"
                  >
                    {searchTerm
                      ? "No addon paycodes matching search"
                      : "No addon paycodes configured"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="space-y-3">
          {/* Payroll Settings Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="p-4 space-y-3">
            {/* Default Invoice Amount */}
            <div className="flex items-center justify-between p-3 bg-default-50 dark:bg-gray-900/50 rounded-lg border border-default-100 dark:border-gray-700">
              <div>
                <h4 className="text-sm font-medium text-default-800 dark:text-gray-200">
                  Default Invoice Amount
                </h4>
                <p className="text-xs text-default-500 dark:text-gray-400">
                  Used when a rental has no invoice linked
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-default-600 dark:text-gray-400">
                  RM
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editedSettings.default_invoice_amount?.value || "200"}
                  onChange={(e) =>
                    handleLocalSettingChange(
                      "default_invoice_amount",
                      e.target.value
                    )
                  }
                  className="w-20 px-2 py-1.5 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200 text-right text-sm"
                />
              </div>
            </div>

            {/* Display other settings if they exist */}
            {Object.entries(editedSettings)
              .filter(([key]) => key !== "default_invoice_amount")
              .map(([key, setting]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 bg-default-50 dark:bg-gray-900/50 rounded-lg border border-default-100 dark:border-gray-700"
                >
                  <div>
                    <h4 className="text-sm font-medium text-default-800 dark:text-gray-200">
                      {key
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                    </h4>
                    {setting.description && (
                      <p className="text-xs text-default-500 dark:text-gray-400">
                        {setting.description}
                      </p>
                    )}
                  </div>
                  <div>
                    <input
                      type="text"
                      value={setting.value}
                      onChange={(e) => handleLocalSettingChange(key, e.target.value)}
                      className="w-28 px-2 py-1.5 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200 text-sm"
                    />
                  </div>
                </div>
              ))}

            {Object.keys(settings).length === 0 && (
              <div className="text-center py-6 text-default-500 dark:text-gray-400 text-sm">
                No settings configured. Settings will appear here once added.
              </div>
            )}

            {/* Save Button */}
            {Object.keys(editedSettings).length > 0 && (
              <div className="flex justify-end pt-3 border-t border-default-200 dark:border-gray-700">
                <button
                  onClick={handleSaveSettings}
                  disabled={!hasUnsavedSettings || isSaving}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    hasUnsavedSettings
                      ? "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                      : "bg-default-200 dark:bg-gray-700 text-default-400 dark:text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {isSaving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Pickup Destinations Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-4 py-2 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/50 flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                Pickup Destinations
              </span>
              <span className="text-xs text-default-400 dark:text-gray-500 ml-2">
                Available pickup locations
              </span>
            </div>
            <button
              onClick={() => openDestinationModal()}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
            >
              <IconPlus size={14} />
              Add Destination
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-default-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                  Code
                </th>
                <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium text-xs">
                  Name
                </th>
                <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-20">
                  Order
                </th>
                <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-20">
                  Default
                </th>
                <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium text-xs w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {destinations.map((dest) => (
                <tr
                  key={dest.id}
                  className="border-b border-default-100 dark:border-gray-700"
                >
                  <td className="px-4 py-2">
                    <span className="font-mono font-medium text-amber-600 dark:text-amber-400 text-xs">
                      {dest.code}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-default-800 dark:text-gray-200">
                    {dest.name}
                  </td>
                  <td className="px-4 py-2 text-center text-default-600 dark:text-gray-400">
                    {dest.sort_order}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {dest.is_default && (
                      <IconCheck
                        size={16}
                        className="inline text-emerald-500"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openDestinationModal(dest)}
                        className="p-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
                        title="Edit"
                      >
                        <IconEdit size={16} />
                      </button>
                      <button
                        onClick={() => openDeleteConfirm("destination", dest)}
                        className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                        title="Delete"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {destinations.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-default-500 dark:text-gray-400 text-sm"
                  >
                    No pickup destinations configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* Destination Modal */}
      <Transition appear show={isDestinationModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsDestinationModalOpen(false)}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30 dark:bg-black/50" />
          </TransitionChild>

          <div className="fixed inset-0">
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
                <DialogPanel className="w-full max-w-md transform rounded-lg bg-white dark:bg-gray-800 shadow-xl transition-all">
                  <div className="flex items-center justify-between border-b border-default-200 dark:border-gray-700 px-6 py-4">
                    <DialogTitle className="text-lg font-semibold text-default-900 dark:text-gray-100">
                      {editingDestination
                        ? "Edit Destination"
                        : "Add Destination"}
                    </DialogTitle>
                    <button
                      onClick={() => setIsDestinationModalOpen(false)}
                      className="text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                    >
                      <IconX size={20} />
                    </button>
                  </div>

                  <div className="p-6 space-y-3">
                    <div>
                      <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                        Code *
                      </label>
                      <input
                        type="text"
                        value={destinationForm.code}
                        onChange={(e) =>
                          setDestinationForm((prev) => ({
                            ...prev,
                            code: e.target.value.toUpperCase(),
                          }))
                        }
                        className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200"
                        placeholder="e.g., TH, MD"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={destinationForm.name}
                        onChange={(e) =>
                          setDestinationForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200"
                        placeholder="e.g., Tien Hock"
                      />
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                          Sort Order
                        </label>
                        <input
                          type="number"
                          value={destinationForm.sort_order}
                          onChange={(e) =>
                            setDestinationForm((prev) => ({
                              ...prev,
                              sort_order: parseInt(e.target.value) || 0,
                            }))
                          }
                          className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200"
                        />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={destinationForm.is_default}
                            onChange={(e) =>
                              setDestinationForm((prev) => ({
                                ...prev,
                                is_default: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 rounded border-default-300 dark:border-gray-600"
                          />
                          <span className="text-sm text-default-600 dark:text-gray-300">
                            Default
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-default-200 dark:border-gray-700">
                    <Button
                      variant="outline"
                      onClick={() => setIsDestinationModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="filled"
                      color="amber"
                      onClick={handleSaveDestination}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Rule Modal */}
      <Transition appear show={isRuleModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsRuleModalOpen(false)}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30 dark:bg-black/50" />
          </TransitionChild>

          <div className="fixed inset-0">
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
                <DialogPanel className="w-full max-w-lg transform rounded-lg bg-white dark:bg-gray-800 shadow-xl transition-all">
                  <div className="flex items-center justify-between border-b border-default-200 dark:border-gray-700 px-6 py-4">
                    <DialogTitle className="text-lg font-semibold text-default-900 dark:text-gray-100">
                      {editingRule ? "Edit Rule" : "Add Rule"}
                    </DialogTitle>
                    <button
                      onClick={() => setIsRuleModalOpen(false)}
                      className="text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                    >
                      <IconX size={20} />
                    </button>
                  </div>

                  <div className="p-6 space-y-3">
                    <div>
                      <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                        Rule Type
                      </label>
                      <Listbox
                        value={ruleForm.rule_type}
                        onChange={(value: "PLACEMENT" | "PICKUP") => {
                          setRuleForm((prev) => ({
                            ...prev,
                            rule_type: value,
                            condition_field:
                              value === "PLACEMENT"
                                ? "invoice_amount"
                                : "destination",
                          }));
                        }}
                      >
                        <div className="relative">
                          <ListboxButton className="relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500 sm:text-sm">
                            <span className="block truncate text-default-800 dark:text-gray-200">
                              {ruleForm.rule_type}
                            </span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                              <IconChevronDown
                                size={20}
                                className="text-gray-400"
                              />
                            </span>
                          </ListboxButton>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <ListboxOptions className="absolute z-10 mt-1 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                              <ListboxOption
                                value="PLACEMENT"
                                className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900 dark:text-gray-100 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                              >
                                {({ selected }) => (
                                  <>
                                    <span
                                      className={clsx(
                                        "block truncate",
                                        selected ? "font-medium" : "font-normal"
                                      )}
                                    >
                                      PLACEMENT
                                    </span>
                                    {selected && (
                                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
                                        <IconCheck size={20} />
                                      </span>
                                    )}
                                  </>
                                )}
                              </ListboxOption>
                              <ListboxOption
                                value="PICKUP"
                                className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900 dark:text-gray-100 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                              >
                                {({ selected }) => (
                                  <>
                                    <span
                                      className={clsx(
                                        "block truncate",
                                        selected ? "font-medium" : "font-normal"
                                      )}
                                    >
                                      PICKUP
                                    </span>
                                    {selected && (
                                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
                                        <IconCheck size={20} />
                                      </span>
                                    )}
                                  </>
                                )}
                              </ListboxOption>
                            </ListboxOptions>
                          </Transition>
                        </div>
                      </Listbox>
                    </div>

                    <div>
                      <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={ruleForm.description}
                        onChange={(e) =>
                          setRuleForm((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200"
                        placeholder="e.g., Invoice <= RM180"
                      />
                    </div>

                    {/* Primary Condition */}
                    <div className="p-3 bg-default-50 dark:bg-gray-900/50 rounded-lg space-y-3">
                      <p className="text-sm font-medium text-default-700 dark:text-gray-200">
                        Primary Condition
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Listbox
                            value={ruleForm.condition_field}
                            onChange={(value: string) =>
                              setRuleForm((prev) => ({
                                ...prev,
                                condition_field: value,
                              }))
                            }
                          >
                            <div className="relative">
                              <ListboxButton className="relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-8 text-left text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
                                <span className="block truncate text-default-800 dark:text-gray-200">
                                  {ruleForm.condition_field}
                                </span>
                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                  <IconChevronDown
                                    size={16}
                                    className="text-gray-400"
                                  />
                                </span>
                              </ListboxButton>
                              <ListboxOptions className="absolute z-10 mt-1 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                {["invoice_amount", "destination"].map(
                                  (field) => (
                                    <ListboxOption
                                      key={field}
                                      value={field}
                                      className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900 dark:text-gray-100 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                                    >
                                      {({ selected }) => (
                                        <>
                                          <span
                                            className={clsx(
                                              "block truncate",
                                              selected
                                                ? "font-medium"
                                                : "font-normal"
                                            )}
                                          >
                                            {field}
                                          </span>
                                          {selected && (
                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
                                              <IconCheck size={16} />
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </ListboxOption>
                                  )
                                )}
                              </ListboxOptions>
                            </div>
                          </Listbox>
                        </div>
                        <div>
                          <Listbox
                            value={ruleForm.condition_operator}
                            onChange={(value: string) =>
                              setRuleForm((prev) => ({
                                ...prev,
                                condition_operator: value,
                              }))
                            }
                          >
                            <div className="relative">
                              <ListboxButton className="relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-8 text-left text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
                                <span className="block truncate text-default-800 dark:text-gray-200">
                                  {ruleForm.condition_operator}
                                </span>
                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                  <IconChevronDown
                                    size={16}
                                    className="text-gray-400"
                                  />
                                </span>
                              </ListboxButton>
                              <ListboxOptions className="absolute z-10 mt-1 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                {[
                                  { value: "=", label: "=" },
                                  { value: "<=", label: "<=" },
                                  { value: ">", label: ">" },
                                  { value: "<", label: "<" },
                                  { value: ">=", label: ">=" },
                                ].map((op) => (
                                  <ListboxOption
                                    key={op.value}
                                    value={op.value}
                                    className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900 dark:text-gray-100 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                                  >
                                    {({ selected }) => (
                                      <>
                                        <span
                                          className={clsx(
                                            "block truncate",
                                            selected
                                              ? "font-medium"
                                              : "font-normal"
                                          )}
                                        >
                                          {op.label}
                                        </span>
                                        {selected && (
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
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
                        <div>
                          <input
                            type="text"
                            value={ruleForm.condition_value}
                            onChange={(e) =>
                              setRuleForm((prev) => ({
                                ...prev,
                                condition_value: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200 text-sm"
                            placeholder={
                              ruleForm.condition_field === "destination"
                                ? "TH"
                                : "180"
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* Secondary Condition (for PICKUP rules) */}
                    {ruleForm.rule_type === "PICKUP" && (
                      <div className="p-3 bg-default-50 dark:bg-gray-900/50 rounded-lg space-y-3">
                        <p className="text-sm font-medium text-default-700 dark:text-gray-200">
                          Secondary Condition (optional)
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Listbox
                              value={ruleForm.secondary_condition_field}
                              onChange={(value: string) =>
                                setRuleForm((prev) => ({
                                  ...prev,
                                  secondary_condition_field: value,
                                }))
                              }
                            >
                              <div className="relative">
                                <ListboxButton className="relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-8 text-left text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
                                  <span className="block truncate text-default-800 dark:text-gray-200">
                                    {ruleForm.secondary_condition_field ||
                                      "None"}
                                  </span>
                                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                    <IconChevronDown
                                      size={16}
                                      className="text-gray-400"
                                    />
                                  </span>
                                </ListboxButton>
                                <ListboxOptions className="absolute z-10 mt-1 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                  {[
                                    { value: "", label: "None" },
                                    {
                                      value: "invoice_amount",
                                      label: "invoice_amount",
                                    },
                                  ].map((field) => (
                                    <ListboxOption
                                      key={field.value}
                                      value={field.value}
                                      className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900 dark:text-gray-100 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                                    >
                                      {({ selected }) => (
                                        <>
                                          <span
                                            className={clsx(
                                              "block truncate",
                                              selected
                                                ? "font-medium"
                                                : "font-normal"
                                            )}
                                          >
                                            {field.label}
                                          </span>
                                          {selected && (
                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
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
                          <div>
                            <Listbox
                              value={ruleForm.secondary_condition_operator}
                              onChange={(value: string) =>
                                setRuleForm((prev) => ({
                                  ...prev,
                                  secondary_condition_operator: value,
                                }))
                              }
                              disabled={!ruleForm.secondary_condition_field}
                            >
                              <div className="relative">
                                <ListboxButton
                                  className={clsx(
                                    "relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-8 text-left text-sm focus:outline-none focus:ring-1 focus:ring-amber-500",
                                    !ruleForm.secondary_condition_field &&
                                      "opacity-50 cursor-not-allowed"
                                  )}
                                  disabled={!ruleForm.secondary_condition_field}
                                >
                                  <span className="block truncate text-default-800 dark:text-gray-200">
                                    {ruleForm.secondary_condition_operator}
                                  </span>
                                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                    <IconChevronDown
                                      size={16}
                                      className="text-gray-400"
                                    />
                                  </span>
                                </ListboxButton>
                                <ListboxOptions className="absolute z-10 mt-1 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                  {[
                                    { value: "=", label: "=" },
                                    { value: "<=", label: "<=" },
                                    { value: ">", label: ">" },
                                  ].map((op) => (
                                    <ListboxOption
                                      key={op.value}
                                      value={op.value}
                                      className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900 dark:text-gray-100 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                                    >
                                      {({ selected }) => (
                                        <>
                                          <span
                                            className={clsx(
                                              "block truncate",
                                              selected
                                                ? "font-medium"
                                                : "font-normal"
                                            )}
                                          >
                                            {op.label}
                                          </span>
                                          {selected && (
                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
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
                          <div>
                            <input
                              type="text"
                              value={ruleForm.secondary_condition_value}
                              onChange={(e) =>
                                setRuleForm((prev) => ({
                                  ...prev,
                                  secondary_condition_value: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              placeholder="200"
                              disabled={!ruleForm.secondary_condition_field}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Pay Code Selection */}
                    <div>
                      <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                        Pay Code
                      </label>
                      <Listbox
                        value={ruleForm.pay_code_id}
                        onChange={(value) =>
                          setRuleForm((prev) => ({
                            ...prev,
                            pay_code_id: value,
                          }))
                        }
                      >
                        <div className="relative">
                          <ListboxButton className="relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500 sm:text-sm">
                            <span
                              className={clsx(
                                "block truncate",
                                ruleForm.pay_code_id
                                  ? "text-default-800 dark:text-gray-200"
                                  : "text-amber-600 dark:text-amber-400 italic"
                              )}
                            >
                              {ruleForm.pay_code_id
                                ? `${ruleForm.pay_code_id} - ${
                                    payCodes.find(
                                      (p) => p.id === ruleForm.pay_code_id
                                    )?.description || ""
                                  }`
                                : "Not assigned"}
                            </span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                              <IconChevronDown
                                size={20}
                                className="text-gray-400"
                              />
                            </span>
                          </ListboxButton>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                              <ListboxOption
                                value=""
                                className="relative cursor-default select-none py-2 pl-3 pr-10 text-amber-600 dark:text-amber-400 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                              >
                                {({ selected }) => (
                                  <>
                                    <span
                                      className={clsx(
                                        "block truncate italic",
                                        selected ? "font-medium" : "font-normal"
                                      )}
                                    >
                                      Not assigned
                                    </span>
                                    {selected && (
                                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
                                        <IconCheck size={20} />
                                      </span>
                                    )}
                                  </>
                                )}
                              </ListboxOption>
                              {payCodes
                                .filter((p) => p.id.startsWith("TRIP"))
                                .map((paycode) => (
                                  <ListboxOption
                                    key={paycode.id}
                                    value={paycode.id}
                                    className="relative cursor-default select-none py-2 pl-3 pr-10 text-gray-900 dark:text-gray-100 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                                  >
                                    {({ selected }) => (
                                      <>
                                        <span
                                          className={clsx(
                                            "block truncate",
                                            selected
                                              ? "font-medium"
                                              : "font-normal"
                                          )}
                                        >
                                          {paycode.id} - {paycode.description}
                                        </span>
                                        <span className="text-xs text-default-500 dark:text-gray-400">
                                          RM{" "}
                                          {(
                                            Number(paycode.rate_biasa) || 0
                                          ).toFixed(2)}
                                        </span>
                                        {selected && (
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
                                            <IconCheck size={20} />
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
                    </div>

                    <div>
                      <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                        Priority (higher = checked first)
                      </label>
                      <input
                        type="number"
                        value={ruleForm.priority}
                        onChange={(e) =>
                          setRuleForm((prev) => ({
                            ...prev,
                            priority: parseInt(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-default-200 dark:border-gray-700">
                    <Button
                      variant="outline"
                      onClick={() => setIsRuleModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="filled"
                      color="amber"
                      onClick={handleSaveRule}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Addon Modal */}
      <Transition appear show={isAddonModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsAddonModalOpen(false)}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30 dark:bg-black/50" />
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
                <DialogPanel className="w-full max-w-md transform rounded-lg bg-white dark:bg-gray-800 shadow-xl transition-all">
                  <div className="flex items-center justify-between border-b border-default-200 dark:border-gray-700 px-6 py-4">
                    <DialogTitle className="text-lg font-semibold text-default-900 dark:text-gray-100">
                      {editingAddon
                        ? "Edit Addon Paycode"
                        : "Add Addon Paycode"}
                    </DialogTitle>
                    <button
                      onClick={() => setIsAddonModalOpen(false)}
                      className="text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                    >
                      <IconX size={20} />
                    </button>
                  </div>

                  <div className="p-6 space-y-3">
                    <div>
                      <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                        Pay Code
                      </label>
                      <Listbox
                        value={addonForm.pay_code_id}
                        onChange={(value) => {
                          const paycode = payCodes.find((p) => p.id === value);
                          setAddonForm((prev) => ({
                            ...prev,
                            pay_code_id: value,
                            default_amount: value
                              ? Number(paycode?.rate_biasa) ||
                                prev.default_amount
                              : prev.default_amount,
                          }));
                        }}
                      >
                        <div className="relative">
                          <ListboxButton className="relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500 sm:text-sm">
                            <span
                              className={clsx(
                                "block truncate",
                                addonForm.pay_code_id
                                  ? "text-default-800 dark:text-gray-200"
                                  : "text-amber-600 dark:text-amber-400 italic"
                              )}
                            >
                              {addonForm.pay_code_id
                                ? `${addonForm.pay_code_id} - ${
                                    payCodes.find(
                                      (p) => p.id === addonForm.pay_code_id
                                    )?.description || ""
                                  }`
                                : "Not assigned"}
                            </span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                              <IconChevronDown
                                size={20}
                                className="text-gray-400"
                              />
                            </span>
                          </ListboxButton>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                              <ListboxOption
                                value=""
                                className="relative cursor-default select-none py-2 pl-3 pr-10 text-amber-600 dark:text-amber-400 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                              >
                                {({ selected }) => (
                                  <>
                                    <span
                                      className={clsx(
                                        "block truncate italic",
                                        selected ? "font-medium" : "font-normal"
                                      )}
                                    >
                                      Not assigned
                                    </span>
                                    {selected && (
                                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
                                        <IconCheck size={20} />
                                      </span>
                                    )}
                                  </>
                                )}
                              </ListboxOption>
                              {payCodes
                                .filter((p) => p.id.startsWith("TRIP"))
                                .map((paycode) => (
                                  <ListboxOption
                                    key={paycode.id}
                                    value={paycode.id}
                                    className="relative cursor-default select-none py-2 pl-3 pr-10 text-gray-900 dark:text-gray-100 data-[focus]:bg-amber-100 dark:data-[focus]:bg-amber-900/50 data-[focus]:text-amber-900 dark:data-[focus]:text-amber-100"
                                  >
                                    {({ selected }) => (
                                      <>
                                        <span
                                          className={clsx(
                                            "block truncate",
                                            selected
                                              ? "font-medium"
                                              : "font-normal"
                                          )}
                                        >
                                          {paycode.id} - {paycode.description}
                                        </span>
                                        {selected && (
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
                                            <IconCheck size={20} />
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
                    </div>

                    <div>
                      <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                        Display Name *
                      </label>
                      <input
                        type="text"
                        value={addonForm.display_name}
                        onChange={(e) =>
                          setAddonForm((prev) => ({
                            ...prev,
                            display_name: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200"
                        placeholder="e.g., Hantar Barang"
                      />
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                          Default Amount (RM)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={addonForm.default_amount}
                          onChange={(e) =>
                            setAddonForm((prev) => ({
                              ...prev,
                              default_amount: parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                          Sort Order
                        </label>
                        <input
                          type="number"
                          value={addonForm.sort_order}
                          onChange={(e) =>
                            setAddonForm((prev) => ({
                              ...prev,
                              sort_order: parseInt(e.target.value) || 0,
                            }))
                          }
                          className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="is_variable_amount"
                        checked={addonForm.is_variable_amount}
                        onChange={(e) =>
                          setAddonForm((prev) => ({
                            ...prev,
                            is_variable_amount: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded border-default-300 dark:border-gray-600"
                      />
                      <label
                        htmlFor="is_variable_amount"
                        className="text-sm text-default-600 dark:text-gray-300 cursor-pointer"
                      >
                        Variable amount (user can change)
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-default-200 dark:border-gray-700">
                    <Button
                      variant="outline"
                      onClick={() => setIsAddonModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="filled"
                      color="amber"
                      onClick={handleSaveAddon}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Confirm Delete"
        message={getDeleteMessage()}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default PayrollRulesPage;
