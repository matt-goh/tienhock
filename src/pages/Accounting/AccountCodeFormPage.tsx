// src/pages/Accounting/AccountCodeFormPage.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { AccountCode, LedgerType } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import {
  FormInput,
  FormListbox,
  SelectOption,
} from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { IconFolder } from "@tabler/icons-react";

interface AccountCodeFormData {
  code: string;
  description: string;
  ledger_type: string;
  parent_code: string;
  sort_order: number;
  is_active: boolean;
  notes: string;
}

const AccountCodeFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const isEditMode = !!code;

  // Form state
  const [formData, setFormData] = useState<AccountCodeFormData>({
    code: "",
    description: "",
    ledger_type: "",
    parent_code: "",
    sort_order: 0,
    is_active: true,
    notes: "",
  });

  // Reference data
  const [ledgerTypes, setLedgerTypes] = useState<LedgerType[]>([]);
  const [parentAccounts, setParentAccounts] = useState<AccountCode[]>([]);
  const [childrenCount, setChildrenCount] = useState(0);
  const [isSystem, setIsSystem] = useState(false);

  // Initial form data reference for change detection
  const initialFormDataRef = useRef<AccountCodeFormData | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch reference data
  const fetchReferenceData = useCallback(async () => {
    try {
      const [ledgerTypesRes, accountsRes] = await Promise.all([
        api.get("/api/ledger-types?is_active=true"),
        api.get("/api/account-codes?flat=true&is_active=true"),
      ]);

      setLedgerTypes(ledgerTypesRes as LedgerType[]);
      setParentAccounts(accountsRes as AccountCode[]);
    } catch (err: any) {
      console.error("Error fetching reference data:", err);
      toast.error("Failed to load reference data");
    }
  }, []);

  // Fetch account data for editing
  const fetchAccountData = useCallback(async () => {
    if (!code) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/account-codes/${code}`);
      const accountData = response as AccountCode & { children_count?: number };

      const fetchedFormData: AccountCodeFormData = {
        code: accountData.code,
        description: accountData.description,
        ledger_type: accountData.ledger_type || "",
        parent_code: accountData.parent_code || "",
        sort_order: accountData.sort_order || 0,
        is_active: accountData.is_active,
        notes: accountData.notes || "",
      };

      setFormData(fetchedFormData);
      initialFormDataRef.current = { ...fetchedFormData };
      setChildrenCount(accountData.children_count || 0);
      setIsSystem(accountData.is_system);
    } catch (err: any) {
      console.error("Error fetching account data:", err);
      setError(
        `Failed to load account code: ${err?.message || "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [code]);

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchReferenceData();

      if (isEditMode) {
        await fetchAccountData();
      } else {
        // For new account, set initial ref to current form state
        initialFormDataRef.current = { ...formData };
        setLoading(false);
      }
    };

    loadData();
  }, [isEditMode, fetchReferenceData, fetchAccountData]);

  // Form change detection
  useEffect(() => {
    if (!initialFormDataRef.current) return;

    const hasChanges =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanges);
  }, [formData]);

  // Handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? parseInt(value) || 0 : value,
    }));
  };

  const handleListboxChange = (
    name: keyof AccountCodeFormData,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/accounting/account-codes");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/accounting/account-codes");
  };

  // Form validation
  const validateForm = (): boolean => {
    if (!formData.code.trim()) {
      toast.error("Account code is required");
      return false;
    }

    if (!formData.description.trim()) {
      toast.error("Description is required");
      return false;
    }

    // Validate code format (alphanumeric and special chars)
    const codePattern = /^[A-Za-z0-9\-_.]+$/;
    if (!codePattern.test(formData.code.trim())) {
      toast.error(
        "Account code can only contain letters, numbers, hyphens, underscores, and periods"
      );
      return false;
    }

    // Prevent circular reference
    if (formData.parent_code === formData.code) {
      toast.error("An account cannot be its own parent");
      return false;
    }

    return true;
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      const payload = {
        code: formData.code.toUpperCase().trim(),
        description: formData.description.trim(),
        ledger_type: formData.ledger_type || null,
        parent_code: formData.parent_code || null,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        notes: formData.notes.trim() || null,
      };

      if (isEditMode) {
        await api.put(`/api/account-codes/${code}`, payload);
        toast.success("Account code updated successfully");
      } else {
        await api.post("/api/account-codes", payload);
        toast.success("Account code created successfully");
      }

      navigate("/accounting/account-codes");
    } catch (err: any) {
      console.error("Error saving account code:", err);
      toast.error(
        err?.message || `Failed to ${isEditMode ? "update" : "create"} account code`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Delete handler
  const handleDeleteClick = () => {
    if (isSystem) {
      toast.error("Cannot delete system account code");
      return;
    }
    if (childrenCount > 0) {
      toast.error(
        "Cannot delete account with child accounts. Delete or reassign children first."
      );
      return;
    }
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!code) return;

    setIsSaving(true);
    try {
      await api.delete(`/api/account-codes/${code}`);
      toast.success("Account code deleted successfully");
      setShowDeleteDialog(false);
      navigate("/accounting/account-codes");
    } catch (err: any) {
      console.error("Error deleting account:", err);
      toast.error(err?.message || "Failed to delete account code");
    } finally {
      setIsSaving(false);
    }
  };

  // Build select options
  const ledgerTypeOptions: SelectOption[] = [
    { id: "", name: "None" },
    ...ledgerTypes.map((lt) => ({
      id: lt.code,
      name: `${lt.code} - ${lt.name}`,
    })),
  ];

  const parentAccountOptions: SelectOption[] = [
    { id: "", name: "None (Top Level)" },
    ...parentAccounts
      .filter((a) => a.code !== formData.code) // Exclude self
      .map((a) => ({
        id: a.code,
        name: `${a.code} - ${a.description}`,
      })),
  ];

  // Render
  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <BackButton onClick={() => navigate("/accounting/account-codes")} />
        <div className="mt-4 p-4 border border-red-300 bg-red-50 text-red-700 rounded">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pb-4">
      <BackButton onClick={handleBackClick} className="mt-3 mb-2" />

      <div className="bg-white rounded-lg shadow-sm border border-default-200">
        {/* Header */}
        <div className="p-6 border-b border-default-200">
          <div className="flex items-center gap-3">
            <IconFolder size={24} className="text-amber-500" />
            <div>
              <h1 className="text-xl font-semibold text-default-900">
                {isEditMode ? "Edit Account Code" : "Add New Account Code"}
              </h1>
              <p className="mt-1 text-sm text-default-500">
                {isEditMode
                  ? `Editing account ${formData.code}`
                  : "Create a new account in the chart of accounts"}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="relative">
          {isSaving && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-b-lg">
              <div className="flex items-center space-x-3 bg-white px-6 py-4 rounded-lg shadow-lg border border-default-200">
                <LoadingSpinner hideText />
                <span className="text-sm font-medium text-default-700">
                  Saving account code...
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="p-6 space-y-6">
              {/* Basic Info Section */}
              <div className="space-y-4">
                <h3 className="text-base font-medium text-default-700 border-b border-default-200 pb-2">
                  Basic Information
                </h3>

                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {/* Account Code */}
                  <FormInput
                    name="code"
                    label="Account Code"
                    value={formData.code}
                    onChange={handleInputChange}
                    placeholder="e.g., 1000, SALES-001"
                    required
                    disabled={isEditMode || isSaving} // Code cannot be changed in edit mode
                  />

                  {/* Description */}
                  <FormInput
                    name="description"
                    label="Description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="e.g., Cash and Bank"
                    required
                    disabled={isSaving}
                  />
                </div>

                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {/* Ledger Type */}
                  <FormListbox
                    name="ledger_type"
                    label="Ledger Type"
                    value={formData.ledger_type}
                    onChange={(value) =>
                      handleListboxChange("ledger_type", value)
                    }
                    options={ledgerTypeOptions}
                    disabled={isSaving}
                    placeholder="Select ledger type..."
                  />

                  {/* Parent Account */}
                  <FormListbox
                    name="parent_code"
                    label="Parent Account"
                    value={formData.parent_code}
                    onChange={(value) =>
                      handleListboxChange("parent_code", value)
                    }
                    options={parentAccountOptions}
                    disabled={isSaving}
                    placeholder="Select parent account..."
                  />
                </div>
              </div>

              {/* Additional Settings Section */}
              <div className="space-y-4">
                <h3 className="text-base font-medium text-default-700 border-b border-default-200 pb-2">
                  Additional Settings
                </h3>

                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                  {/* Sort Order */}
                  <FormInput
                    name="sort_order"
                    label="Sort Order"
                    value={formData.sort_order}
                    onChange={handleInputChange}
                    type="number"
                    min={0}
                    placeholder="0"
                    disabled={isSaving}
                  />

                  {/* Active Status */}
                  <div className="flex items-center pt-8">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleCheckboxChange}
                        disabled={isSaving || isSystem}
                        className="w-4 h-4 rounded border-default-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-sm text-default-700">
                        Active Account
                      </span>
                    </label>
                  </div>

                  {/* System Account Indicator */}
                  {isSystem && (
                    <div className="flex items-center pt-8">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        System Account
                      </span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-default-700 mb-2"
                  >
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    disabled={isSaving}
                    placeholder="Optional notes about this account..."
                    className="block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Info Section for Edit Mode */}
              {isEditMode && (
                <div className="p-4 bg-default-50 rounded-lg border border-default-200">
                  <h4 className="text-sm font-medium text-default-700 mb-2">
                    Account Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-default-500">Child Accounts: </span>
                      <span className="font-medium text-default-700">
                        {childrenCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-default-500">System Account: </span>
                      <span className="font-medium text-default-700">
                        {isSystem ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="p-6 flex justify-end items-center space-x-3 border-t border-default-200">
              {isEditMode && !isSystem && (
                <Button
                  type="button"
                  color="rose"
                  variant="outline"
                  onClick={handleDeleteClick}
                  disabled={isSaving || childrenCount > 0}
                >
                  Delete Account
                </Button>
              )}
              <Button
                type="submit"
                variant="filled"
                color="sky"
                disabled={isSaving || !isFormChanged}
                size="lg"
              >
                {isSaving
                  ? "Saving..."
                  : isEditMode
                  ? "Update Account"
                  : "Create Account"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Account Code"
        message={`Are you sure you want to delete account "${formData.code}"? This action cannot be undone.`}
        confirmButtonText="Delete"
      />

      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="You have unsaved changes. Are you sure you want to go back? All changes will be lost."
        confirmButtonText="Discard"
      />
    </div>
  );
};

export default AccountCodeFormPage;
