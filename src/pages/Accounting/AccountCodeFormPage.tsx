// src/pages/Accounting/AccountCodeFormPage.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { AccountCode } from "../../types/types";
import {
  useAccountCodesCache,
  useLedgerTypesCache,
  refreshAccountCodesCache,
} from "../../utils/accounting/useAccountingCache";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import {
  FormInput,
  FormListbox,
  SelectOption,
} from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import AccountCodeCombobox from "../../components/Accounting/AccountCodeCombobox";
import Checkbox from "../../components/Checkbox";
import {
  IconChevronRight,
  IconFile,
  IconFolder,
  IconLock,
} from "@tabler/icons-react";
import clsx from "clsx";

interface AccountCodeFormData {
  code: string;
  description: string;
  ledger_type: string;
  parent_code: string;
  sort_order: number;
  is_active: boolean;
  notes: string;
}

const FORM_INPUT_SURFACE_CLASSNAME: string =
  "dark:[&_input]:!bg-gray-900/50 [&_input]:shadow-none";
const FORM_LISTBOX_SURFACE_CLASSNAME: string =
  "dark:[&>div>button]:!bg-gray-900/50 [&>div>button]:shadow-none";
const FIELD_SURFACE_CLASSNAME: string =
  "dark:!bg-gray-900/50 !shadow-none";

const AccountCodeFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const isEditMode = !!code;

  // Cached reference data
  const { ledgerTypes: allLedgerTypes, isLoading: ledgerTypesLoading } = useLedgerTypesCache();
  const { accountCodes: allAccountCodes, isLoading: accountCodesLoading } = useAccountCodesCache();

  // Filter to only active items for selection
  const ledgerTypes = useMemo(
    () => allLedgerTypes.filter((lt) => lt.is_active),
    [allLedgerTypes]
  );
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

  // Additional state for edit mode
  const [childAccounts, setChildAccounts] = useState<AccountCode[]>([]);
  const [isSystem, setIsSystem] = useState(false);

  // Initial form data reference for change detection
  const initialFormDataRef = useRef<AccountCodeFormData | null>(null);

  // UI state
  const [pageLoading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [pendingNavigationPath, setPendingNavigationPath] = useState<string | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combined loading state (page + cache)
  const loading = pageLoading || ledgerTypesLoading || accountCodesLoading;

  // Fetch account data for editing
  const fetchAccountData = useCallback(async (): Promise<void> => {
    if (!code) return;

    setLoading(true);
    setError(null);

    try {
      const [accountData, fetchedChildAccounts]: [AccountCode, AccountCode[]] =
        await Promise.all([
          api.get<AccountCode>(`/api/account-codes/${code}`),
          api.get<AccountCode[]>(`/api/account-codes/children/${code}`),
        ]);

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
      setChildAccounts(fetchedChildAccounts);
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
      if (isEditMode) {
        await fetchAccountData();
      } else {
        // For new account, set initial ref to current form state
        initialFormDataRef.current = { ...formData };
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, fetchAccountData]);

  // Form change detection
  useEffect(() => {
    if (!initialFormDataRef.current) return;

    const hasChanges =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanges);
  }, [formData]);

  const hasChildAccounts: boolean = childAccounts.length > 0;

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

  const requestNavigation = (path: string): void => {
    if (isFormChanged) {
      setPendingNavigationPath(path);
    } else {
      navigate(path);
    }
  };

  const handleBackClick = (): void => {
    requestNavigation("/accounting/account-codes");
  };

  const handleConfirmNavigation = (): void => {
    const targetPath: string | null = pendingNavigationPath;
    setPendingNavigationPath(null);
    if (targetPath) navigate(targetPath);
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

      // Refresh cache to reflect changes
      refreshAccountCodesCache();
      navigate("/accounting/account-codes");
    } catch (err: unknown) {
      console.error("Error saving account code:", err);
      const errorMessage = err instanceof Error ? err.message : `Failed to ${isEditMode ? "update" : "create"} account code`;
      toast.error(errorMessage);
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
    if (hasChildAccounts) {
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
      // Refresh cache to reflect deletion
      refreshAccountCodesCache();
      navigate("/accounting/account-codes");
    } catch (err: unknown) {
      console.error("Error deleting account:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to delete account code";
      toast.error(errorMessage);
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

  // An account cannot be moved beneath one of its own descendants.
  const unavailableParentCodes: Set<string> = useMemo(() => {
    const currentCode: string = formData.code.trim().toUpperCase();
    if (!currentCode) return new Set<string>();

    const childCodesByParent: Map<string, string[]> = new Map<string, string[]>();
    allAccountCodes.forEach((account: AccountCode): void => {
      if (!account.parent_code) return;
      const childCodes: string[] = childCodesByParent.get(account.parent_code) || [];
      childCodes.push(account.code);
      childCodesByParent.set(account.parent_code, childCodes);
    });

    const unavailableCodes: Set<string> = new Set<string>([currentCode]);
    const pendingCodes: string[] = [currentCode];
    while (pendingCodes.length > 0) {
      const parentCode: string | undefined = pendingCodes.pop();
      if (!parentCode) continue;

      const childCodes: string[] = childCodesByParent.get(parentCode) || [];
      childCodes.forEach((childCode: string): void => {
        if (!unavailableCodes.has(childCode)) {
          unavailableCodes.add(childCode);
          pendingCodes.push(childCode);
        }
      });
    }

    return unavailableCodes;
  }, [allAccountCodes, formData.code]);

  const canSelectParentAccount = useCallback(
    (account: AccountCode): boolean => !unavailableParentCodes.has(account.code),
    [unavailableParentCodes]
  );

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
        <div className="mt-4 p-4 border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBackClick} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <IconFolder size={24} className="text-amber-500 dark:text-amber-400" />
            <div>
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                {isEditMode ? "Edit Account Code" : "Add New Account Code"}
              </h1>
              <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                {isEditMode
                  ? `Menyunting akaun ${formData.code}`
                  : "Cipta akaun baharu dalam carta akaun"}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="relative">
          {isSaving && (
            <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-b-lg">
              <div className="flex items-center space-x-3 bg-white dark:bg-gray-800 px-6 py-4 rounded-lg shadow-lg border border-default-200 dark:border-gray-700">
                <LoadingSpinner hideText />
                <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                  Saving account code...
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="p-6 space-y-6">
              {/* Basic Info Section */}
              <div className="space-y-4">
                <h3 className="text-base font-medium text-default-700 dark:text-gray-300 border-b border-default-200 dark:border-gray-700 pb-2">
                  Basic Information
                </h3>

                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {/* Account Code */}
                  <div className={FORM_INPUT_SURFACE_CLASSNAME}>
                    <FormInput
                      name="code"
                      label="Account Code"
                      value={formData.code}
                      onChange={handleInputChange}
                      placeholder="e.g., 1000, SALES-001"
                      required
                      disabled={isEditMode || isSaving} // Code cannot be changed in edit mode
                    />
                  </div>

                  {/* Description */}
                  <div className={FORM_INPUT_SURFACE_CLASSNAME}>
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
                    className={FORM_LISTBOX_SURFACE_CLASSNAME}
                  />

                  {/* Parent Account */}
                  <div>
                    <AccountCodeCombobox
                      label="Parent Account"
                      value={formData.parent_code}
                      onChange={(value: string): void =>
                        handleListboxChange("parent_code", value)
                      }
                      disabled={isSaving}
                      placeholder="Search parent account..."
                      filter={canSelectParentAccount}
                      hierarchical
                      allowEmpty
                      emptyLabel="No parent (Top level)"
                      className="[&_input]:shadow-none dark:[&_input]:!bg-gray-900/50"
                    />
                    <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                      Akaun peringkat teratas dipaparkan dahulu. Kembangkan folder untuk melihat
                      akaun anak di bawahnya.
                    </p>
                  </div>
                </div>
              </div>

              {/* Additional Settings Section */}
              <div className="space-y-4">
                <h3 className="text-base font-medium text-default-700 dark:text-gray-300 border-b border-default-200 dark:border-gray-700 pb-2">
                  Additional Settings
                </h3>

                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {/* Sort Order */}
                  <div className={FORM_INPUT_SURFACE_CLASSNAME}>
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
                  </div>

                  {/* Active Status */}
                  <div className="rounded-lg border border-default-200 bg-default-50/60 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                      Account Status
                    </p>
                    <Checkbox
                      checked={formData.is_active}
                      onChange={(checked: boolean): void =>
                        setFormData(
                          (previousData: AccountCodeFormData): AccountCodeFormData => ({
                            ...previousData,
                            is_active: checked,
                          })
                        )
                      }
                      disabled={isSaving || isSystem}
                      label="Active Account"
                      size={18}
                      checkedColor="text-sky-600 dark:text-sky-400"
                      ariaLabel="Active account"
                    />
                    <p className="mt-1 pl-7 text-xs text-default-500 dark:text-gray-400">
                      {isSystem
                        ? "Akaun sistem mesti kekal aktif."
                        : "Akaun tidak aktif kekal dalam rekod sedia ada tetapi tidak boleh dipilih untuk catatan baharu."}
                    </p>
                  </div>
                </div>

                {/* System Account Indicator */}
                {isSystem && (
                  <div className="flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 dark:border-purple-800/60 dark:bg-purple-900/20">
                    <IconLock
                      size={18}
                      className="mt-0.5 flex-shrink-0 text-purple-600 dark:text-purple-400"
                    />
                    <div>
                      <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                        System Account
                      </p>
                      <p className="mt-0.5 text-xs text-purple-700 dark:text-purple-300">
                        Akaun ini dilindungi dan tidak boleh dinyahaktifkan atau dipadam.
                      </p>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2"
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
                    placeholder="Catatan pilihan tentang akaun ini..."
                    className={clsx(
                      "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 bg-white text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed",
                      FIELD_SURFACE_CLASSNAME
                    )}
                  />
                </div>
              </div>

              {/* Child Accounts */}
              {isEditMode && (
                <div className="overflow-hidden rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-default-200 bg-default-50/70 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                        <IconFolder size={19} />
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-default-800 dark:text-gray-100">
                          Direct Child Accounts
                        </h4>
                        <p className="truncate text-xs text-default-500 dark:text-gray-400">
                          Akaun yang menggunakan {formData.code} sebagai akaun induk
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-default-200 px-2.5 py-1 text-xs font-medium text-default-700 dark:bg-gray-700 dark:text-gray-200">
                      {childAccounts.length} {childAccounts.length === 1 ? "account" : "accounts"}
                    </span>
                  </div>

                  {childAccounts.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <IconFile
                        size={28}
                        className="mx-auto text-default-300 dark:text-gray-600"
                      />
                      <p className="mt-2 text-sm font-medium text-default-600 dark:text-gray-300">
                        Tiada akaun anak
                      </p>
                      <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                        Akaun yang memilih {formData.code} sebagai akaun induk akan dipaparkan di
                        sini.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-80 divide-y divide-default-100 overflow-y-auto dark:divide-gray-700">
                      {childAccounts.map((childAccount: AccountCode) => (
                        <button
                          key={childAccount.code}
                          type="button"
                          onClick={(): void =>
                            requestNavigation(
                              `/accounting/account-codes/${childAccount.code}`
                            )
                          }
                          disabled={isSaving}
                          className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-sky-900/20"
                        >
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-default-100 text-default-500 group-hover:bg-sky-100 group-hover:text-sky-600 dark:bg-gray-700 dark:text-gray-400 dark:group-hover:bg-sky-900/40 dark:group-hover:text-sky-400">
                            <IconFile size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-sky-700 dark:text-sky-400">
                                {childAccount.code}
                              </span>
                              {childAccount.ledger_type && (
                                <span className="rounded bg-default-100 px-1.5 py-0.5 text-[10px] font-medium text-default-600 dark:bg-gray-700 dark:text-gray-300">
                                  {childAccount.ledger_type}
                                </span>
                              )}
                              <span
                                className={clsx(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  childAccount.is_active
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                    : "bg-default-200 text-default-600 dark:bg-gray-700 dark:text-gray-400"
                                )}
                              >
                                {childAccount.is_active ? "Active" : "Inactive"}
                              </span>
                            </span>
                            <span
                              className="mt-0.5 block truncate text-xs text-default-600 dark:text-gray-400"
                              title={childAccount.description}
                            >
                              {childAccount.description}
                            </span>
                          </span>
                          <IconChevronRight
                            size={17}
                            className="flex-shrink-0 text-default-300 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-500 dark:text-gray-600 dark:group-hover:text-sky-400"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="p-6 flex justify-end items-center space-x-3 border-t border-default-200 dark:border-gray-700">
              {isEditMode && !isSystem && (
                <Button
                  type="button"
                  color="rose"
                  variant="outline"
                  onClick={handleDeleteClick}
                  disabled={isSaving || hasChildAccounts}
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
        message={`Adakah anda pasti mahu memadam akaun "${formData.code}"? Tindakan ini tidak boleh dibatalkan.`}
        confirmButtonText="Delete"
      />

      <ConfirmationDialog
        isOpen={pendingNavigationPath !== null}
        onClose={() => setPendingNavigationPath(null)}
        onConfirm={handleConfirmNavigation}
        title="Discard Changes"
        message="Anda mempunyai perubahan yang belum disimpan. Adakah anda pasti mahu meninggalkan akaun ini? Semua perubahan akan hilang."
        confirmButtonText="Discard"
      />
    </div>
  );
};

export default AccountCodeFormPage;
