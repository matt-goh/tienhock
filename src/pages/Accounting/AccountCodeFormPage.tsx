// src/pages/Accounting/AccountCodeFormPage.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { AccountCode, LedgerType } from "../../types/types";
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
import ListboxSelect, {
  type ListboxSelectOption,
} from "../../components/ListboxSelect";
import {
  IconCalendar,
  IconChartBar,
  IconChevronRight,
  IconFile,
  IconFolder,
  IconHierarchy,
  IconLock,
} from "@tabler/icons-react";
import clsx from "clsx";

interface AccountCodeFormData {
  code: string;
  description: string;
  ledger_type: string;
  parent_code: string;
  fs_note: string;
  sort_order: number;
  is_active: boolean;
  notes: string;
}

interface FinancialStatementNote {
  code: string;
  name: string;
}

interface AccountOverviewMonth {
  month: number;
  debit: number;
  credit: number;
  net: number;
}

interface AccountOverviewTotals {
  opening_balance: number;
  balance_brought_forward: number;
  current_month_movement: number;
  accumulative_balance: number;
}

type AccountOverviewChild = AccountCode & AccountOverviewTotals;

interface AccountHierarchyItem {
  code: string;
  description: string;
  parent_code: string | null;
}

type ChildAccountDisplay = AccountCode & Partial<AccountOverviewTotals>;

type PendingNavigation =
  | { type: "path"; path: string }
  | { type: "back" };

interface AccountCodeOverview {
  period: {
    year: number;
    opening_month: number;
    current_month: number;
  };
  months: AccountOverviewMonth[];
  totals: AccountOverviewTotals;
  direct_account: AccountOverviewTotals;
  children: AccountOverviewChild[];
}

const MONTH_NAMES: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));

const formatSignedBalance = (amount: number): string => {
  if (Math.abs(amount) < 0.005) return "0.00";
  return `${formatCurrency(amount)} ${amount > 0 ? "DR" : "CR"}`;
};

const FORM_INPUT_SURFACE_CLASSNAME: string =
  "dark:[&_input]:!bg-gray-900/50 [&_input]:shadow-none";
const FORM_LISTBOX_SURFACE_CLASSNAME: string =
  "dark:[&>div>button]:!bg-gray-900/50 [&>div>button]:shadow-none";
const FIELD_SURFACE_CLASSNAME: string =
  "dark:!bg-gray-900/50 !shadow-none";

const createEmptyFormData = (): AccountCodeFormData => ({
  code: "",
  description: "",
  ledger_type: "",
  parent_code: "",
  fs_note: "",
  sort_order: 0,
  is_active: true,
  notes: "",
});

const AccountCodeFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const isEditMode = !!code;

  // Cached reference data
  const { ledgerTypes: allLedgerTypes, isLoading: ledgerTypesLoading } = useLedgerTypesCache();
  const { accountCodes: allAccountCodes, isLoading: accountCodesLoading } = useAccountCodesCache();

  // Filter to only active items for selection
  const ledgerTypes = useMemo(
    (): LedgerType[] =>
      allLedgerTypes.filter(
        (ledgerType: LedgerType): boolean => ledgerType.is_active
      ),
    [allLedgerTypes]
  );
  // Form state
  const [formData, setFormData] = useState<AccountCodeFormData>(
    createEmptyFormData
  );

  // Additional state for edit mode
  const [childAccounts, setChildAccounts] = useState<AccountCode[]>([]);
  const [isSystem, setIsSystem] = useState(false);
  const [fsNotes, setFsNotes] = useState<FinancialStatementNote[]>([]);
  const [fsNotesLoading, setFsNotesLoading] = useState<boolean>(true);
  const [overviewYear, setOverviewYear] = useState<number>((): number =>
    new Date().getFullYear()
  );
  const [overviewMonth, setOverviewMonth] = useState<number>((): number =>
    new Date().getMonth() + 1
  );
  const [overview, setOverview] = useState<AccountCodeOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState<boolean>(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewRefreshKey, setOverviewRefreshKey] = useState<number>(0);
  const accountRequestIdRef = useRef<number>(0);
  const overviewRequestIdRef = useRef<number>(0);

  // Initial form data reference for change detection
  const initialFormDataRef = useRef<AccountCodeFormData | null>(null);

  // UI state
  const [pageLoading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combined loading state (page + cache)
  const loading =
    pageLoading ||
    ledgerTypesLoading ||
    accountCodesLoading ||
    fsNotesLoading;

  useEffect(() => {
    const fetchFinancialStatementNotes = async (): Promise<void> => {
      try {
        const response = await api.get<FinancialStatementNote[]>(
          "/api/financial-reports/notes"
        );
        setFsNotes(response || []);
      } catch (fetchError: unknown) {
        console.error(
          "Error fetching financial statement notes:",
          fetchError
        );
        setFsNotes([]);
      } finally {
        setFsNotesLoading(false);
      }
    };

    void fetchFinancialStatementNotes();
  }, []);

  // Fetch account data for editing
  const fetchAccountData = useCallback(async (): Promise<void> => {
    if (!code) return;

    const requestId: number = accountRequestIdRef.current + 1;
    accountRequestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const [accountData, fetchedChildAccounts]: [AccountCode, AccountCode[]] =
        await Promise.all([
          api.get<AccountCode>(
            `/api/account-codes/${encodeURIComponent(code)}`
          ),
          api.get<AccountCode[]>(
            `/api/account-codes/children/${encodeURIComponent(code)}`
          ),
        ]);

      if (accountRequestIdRef.current !== requestId) return;

      const fetchedFormData: AccountCodeFormData = {
        code: accountData.code,
        description: accountData.description,
        ledger_type: accountData.ledger_type || "",
        parent_code: accountData.parent_code || "",
        fs_note: accountData.fs_note || "",
        sort_order: accountData.sort_order || 0,
        is_active: accountData.is_active,
        notes: accountData.notes || "",
      };

      setFormData(fetchedFormData);
      initialFormDataRef.current = { ...fetchedFormData };
      setChildAccounts(fetchedChildAccounts);
      setIsSystem(accountData.is_system);
    } catch (fetchError: unknown) {
      if (accountRequestIdRef.current !== requestId) return;
      console.error("Error fetching account data:", fetchError);
      setError(
        `Failed to load account code: ${
          fetchError instanceof Error ? fetchError.message : "Unknown error"
        }`
      );
    } finally {
      if (accountRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [code]);

  // Initial data loading
  useEffect(() => {
    if (isEditMode) {
      void fetchAccountData();
      return (): void => {
        accountRequestIdRef.current += 1;
      };
    }

    accountRequestIdRef.current += 1;
    const emptyFormData: AccountCodeFormData = createEmptyFormData();
    setFormData(emptyFormData);
    initialFormDataRef.current = { ...emptyFormData };
    setChildAccounts([]);
    setIsSystem(false);
    setError(null);
    setIsFormChanged(false);
    setLoading(false);
    return undefined;
  }, [isEditMode, fetchAccountData]);

  useEffect(() => {
    if (!code || pageLoading) {
      setOverview(null);
      setOverviewLoading(false);
      setOverviewError(null);
      return;
    }

    const requestId: number = overviewRequestIdRef.current + 1;
    overviewRequestIdRef.current = requestId;
    setOverview(null);
    setOverviewLoading(true);
    setOverviewError(null);

    const fetchOverview = async (): Promise<void> => {
      try {
        const response = await api.get<AccountCodeOverview>(
          `/api/account-codes/${encodeURIComponent(
            code
          )}/overview?year=${overviewYear}&month=${overviewMonth}`
        );
        if (overviewRequestIdRef.current !== requestId) return;
        setOverview(response);
      } catch (fetchError: unknown) {
        if (overviewRequestIdRef.current !== requestId) return;
        console.error("Error fetching account overview:", fetchError);
        setOverview(null);
        setOverviewError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load account activity"
        );
      } finally {
        if (overviewRequestIdRef.current === requestId) {
          setOverviewLoading(false);
        }
      }
    };

    void fetchOverview();
    return (): void => {
      if (overviewRequestIdRef.current === requestId) {
        overviewRequestIdRef.current += 1;
      }
    };
  }, [
    code,
    overviewMonth,
    overviewRefreshKey,
    overviewYear,
    pageLoading,
  ]);

  // Form change detection
  useEffect(() => {
    if (!initialFormDataRef.current) return;

    const hasChanges =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanges);
  }, [formData]);

  const hasChildAccounts: boolean = childAccounts.length > 0;

  // Handlers
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const { name, value, type } = e.target;
    setFormData((previousData: AccountCodeFormData): AccountCodeFormData => ({
      ...previousData,
      [name]: type === "number" ? parseInt(value) || 0 : value,
    }));
  };

  const handleListboxChange = (
    name: keyof AccountCodeFormData,
    value: string
  ): void => {
    setFormData((previousData: AccountCodeFormData): AccountCodeFormData => ({
      ...previousData,
      [name]: value,
    }));
  };

  const requestNavigation = (path: string): void => {
    if (isFormChanged) {
      setPendingNavigation({ type: "path", path });
    } else {
      navigate(path);
    }
  };

  const navigateBack = (): void => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/accounting/account-codes");
  };

  const handleBackClick = (): void => {
    if (isFormChanged) {
      setPendingNavigation({ type: "back" });
      return;
    }

    navigateBack();
  };

  const handleConfirmNavigation = (): void => {
    const targetNavigation: PendingNavigation | null = pendingNavigation;
    setPendingNavigation(null);
    if (!targetNavigation) return;

    if (targetNavigation.type === "back") {
      navigateBack();
      return;
    }

    navigate(targetNavigation.path);
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
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      const payload = {
        code: formData.code.toUpperCase().trim(),
        description: formData.description.trim(),
        ledger_type: formData.ledger_type || null,
        parent_code: formData.parent_code || null,
        fs_note: formData.fs_note || null,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        notes: formData.notes.trim() || null,
      };
      const submittedAccountCode: string = payload.code;

      if (isEditMode) {
        await api.put(
          `/api/account-codes/${encodeURIComponent(code || submittedAccountCode)}`,
          payload
        );
      } else {
        await api.post("/api/account-codes", payload);
      }

      toast.success(
        `Account code ${isEditMode ? "updated" : "created"} successfully`
      );

      // Refresh cache to reflect changes
      await refreshAccountCodesCache().catch((refreshError: unknown): void => {
        console.error("Error refreshing account codes cache:", refreshError);
      });
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
  const handleDeleteClick = (): void => {
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

  const handleConfirmDelete = async (): Promise<void> => {
    if (!code) return;

    setIsSaving(true);
    try {
      await api.delete(`/api/account-codes/${code}`);
      toast.success("Account code deleted successfully");
      setShowDeleteDialog(false);
      // Refresh cache to reflect deletion
      await refreshAccountCodesCache().catch((refreshError: unknown): void => {
        console.error("Error refreshing account codes cache:", refreshError);
      });
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
    ...ledgerTypes.map(
      (ledgerType: LedgerType): SelectOption => ({
        id: ledgerType.code,
        name: `${ledgerType.code} - ${ledgerType.name}`,
      })
    ),
  ];

  const fsNoteOptions: SelectOption[] = [
    { id: "", name: "None" },
    ...fsNotes.map((note: FinancialStatementNote): SelectOption => ({
      id: note.code,
      name: `${note.code} - ${note.name}`,
    })),
  ];

  const monthOptions: ListboxSelectOption[] = MONTH_NAMES.map(
    (monthName: string, index: number): ListboxSelectOption => ({
      value: String(index + 1),
      label: monthName,
    })
  );

  const yearOptions: ListboxSelectOption[] = useMemo(() => {
    const currentYear: number = new Date().getFullYear();
    const years: number[] = Array.from(
      { length: currentYear - 1999 },
      (_unused: unknown, index: number): number => 2000 + index
    ).reverse();
    return years.map((year: number): ListboxSelectOption => ({
      value: String(year),
      label: String(year),
    }));
  }, []);

  const hierarchyPath = useMemo((): AccountHierarchyItem[] => {
    const accountsByCode: Map<string, AccountCode> = new Map<
      string,
      AccountCode
    >(
      allAccountCodes.map(
        (account: AccountCode): [string, AccountCode] => [account.code, account]
      )
    );
    const ancestors: AccountHierarchyItem[] = [];
    const visitedCodes: Set<string> = new Set<string>();
    let parentCode: string | null = formData.parent_code || null;

    while (parentCode && !visitedCodes.has(parentCode)) {
      visitedCodes.add(parentCode);
      const parentAccount: AccountCode | undefined = accountsByCode.get(parentCode);
      if (!parentAccount) break;
      ancestors.unshift({
        code: parentAccount.code,
        description: parentAccount.description,
        parent_code: parentAccount.parent_code,
      });
      parentCode = parentAccount.parent_code;
    }

    const currentCode: string = formData.code.trim().toUpperCase();
    if (currentCode) {
      ancestors.push({
        code: currentCode,
        description: formData.description.trim() || "New account",
        parent_code: formData.parent_code || null,
      });
    }
    return ancestors;
  }, [allAccountCodes, formData.code, formData.description, formData.parent_code]);

  const controlAccount: AccountHierarchyItem | null = hierarchyPath[0] || null;
  const currentHierarchyAccount: AccountHierarchyItem | null =
    hierarchyPath[hierarchyPath.length - 1] || null;
  const directParentAccount: AccountHierarchyItem | null =
    hierarchyPath.length > 1
      ? hierarchyPath[hierarchyPath.length - 2]
      : null;
  const isControlAccountView: boolean =
    !!currentHierarchyAccount &&
    currentHierarchyAccount.code === controlAccount?.code;
  const displayedChildAccounts: ChildAccountDisplay[] = useMemo(() => {
    if (overview) return overview.children;
    return childAccounts;
  }, [childAccounts, overview]);

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
        <BackButton fallbackPath="/accounting/account-codes" />
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
            <BackButton
              fallbackPath="/accounting/account-codes"
              onClick={isFormChanged ? handleBackClick : undefined}
            />
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
              {hierarchyPath.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-900/70 dark:bg-sky-950/20">
                  <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
                        <IconHierarchy size={19} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-default-800 dark:text-gray-100">
                          Account Hierarchy
                        </p>
                        <p className="text-xs text-default-500 dark:text-gray-400">
                          Control A/C ialah kod utama; akaun terakhir ialah rekod yang sedang dibuka.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-default-500 dark:text-gray-400">
                      <span>
                        Control A/C:{" "}
                        <strong className="font-mono font-semibold text-default-800 dark:text-gray-100">
                          {controlAccount?.code || "-"}
                        </strong>
                      </span>
                      <span>
                        Current ACC No:{" "}
                        <strong className="font-mono font-semibold text-default-800 dark:text-gray-100">
                          {currentHierarchyAccount?.code || "-"}
                        </strong>
                      </span>
                      <span>
                        Immediate Parent:{" "}
                        <strong className="font-mono font-semibold text-default-800 dark:text-gray-100">
                          {directParentAccount?.code || "None"}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-stretch gap-2 border-t border-sky-100 bg-white/70 px-4 py-3 dark:border-sky-900/50 dark:bg-gray-900/20">
                    {hierarchyPath.map(
                      (
                        hierarchyAccount: AccountHierarchyItem,
                        index: number
                      ): React.ReactNode => {
                        const isCurrentAccount: boolean =
                          index === hierarchyPath.length - 1;
                        const roleLabel: string =
                          index === 0
                            ? "Control / Main A/C"
                            : isCurrentAccount
                            ? hasChildAccounts
                              ? "Parent / ACC No."
                              : "Sub-Ledger A/C"
                            : "ACC No. / Code Bapa";
                        return (
                          <React.Fragment key={hierarchyAccount.code}>
                            {index > 0 && (
                              <IconChevronRight
                                size={16}
                                className="self-center text-default-300 dark:text-gray-600"
                              />
                            )}
                            <button
                              type="button"
                              onClick={(): void => {
                                if (!isCurrentAccount) {
                                  requestNavigation(
                                    `/accounting/account-codes/${encodeURIComponent(
                                      hierarchyAccount.code
                                    )}`
                                  );
                                }
                              }}
                              disabled={isCurrentAccount || isSaving}
                              className={clsx(
                                "min-w-0 rounded-lg border px-3 py-2 text-left transition-colors",
                                isCurrentAccount
                                  ? "cursor-default border-sky-300 bg-sky-100/80 dark:border-sky-800 dark:bg-sky-900/30"
                                  : "border-default-200 bg-white hover:border-sky-300 hover:bg-sky-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-sky-800 dark:hover:bg-sky-900/20"
                              )}
                            >
                              <span className="block text-[10px] font-semibold uppercase tracking-wide text-default-400 dark:text-gray-500">
                                {roleLabel}
                              </span>
                              <span className="mt-0.5 block font-mono text-sm font-semibold text-sky-700 dark:text-sky-400">
                                {hierarchyAccount.code}
                              </span>
                              <span
                                className="block max-w-48 truncate text-xs text-default-600 dark:text-gray-300"
                                title={hierarchyAccount.description}
                              >
                                {hierarchyAccount.description}
                              </span>
                            </button>
                          </React.Fragment>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              {/* Basic Info Section */}
              <div className="space-y-4">
                <h3 className="text-base font-medium text-default-700 dark:text-gray-300 border-b border-default-200 dark:border-gray-700 pb-2">
                  Account Details
                </h3>

                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {/* Account Code */}
                  <div className={FORM_INPUT_SURFACE_CLASSNAME}>
                    <FormInput
                      name="code"
                      label="Account No. / Code"
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
                      label="Particular / Description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="e.g., Cash and Bank"
                      required
                      disabled={isSaving}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
                  {/* Ledger Type */}
                  <FormListbox
                    name="ledger_type"
                    label="Title / Ledger Type"
                    value={formData.ledger_type}
                    onChange={(value: string): void =>
                      handleListboxChange("ledger_type", value)
                    }
                    options={ledgerTypeOptions}
                    disabled={isSaving}
                    placeholder="Select ledger type..."
                    className={FORM_LISTBOX_SURFACE_CLASSNAME}
                  />

                  <FormListbox
                    name="fs_note"
                    label="FS Note / Report Code"
                    value={formData.fs_note}
                    onChange={(value: string): void =>
                      handleListboxChange("fs_note", value)
                    }
                    options={fsNoteOptions}
                    disabled={isSaving}
                    placeholder="Select report code..."
                    className={FORM_LISTBOX_SURFACE_CLASSNAME}
                  />

                  {/* Parent Account */}
                  <div>
                    <AccountCodeCombobox
                      label="Immediate Parent Account"
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
                  Settings & Notes
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
                    onChange={(
                      event: React.ChangeEvent<HTMLTextAreaElement>
                    ): void =>
                      setFormData(
                        (
                          previousData: AccountCodeFormData
                        ): AccountCodeFormData => ({
                          ...previousData,
                          notes: event.target.value,
                        })
                      )
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

              <div className="rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-col gap-3 rounded-t-lg border-b border-default-200 bg-default-50/70 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <IconChartBar size={19} />
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-default-800 dark:text-gray-100">
                        Account Activity
                      </h4>
                      <p className="text-xs text-default-500 dark:text-gray-400">
                        Jumlah akaun ini termasuk semua akaun anak di bawahnya.
                      </p>
                    </div>
                  </div>

                  {isEditMode && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="rounded-md border border-default-200 bg-white px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-default-400 dark:text-gray-500">
                          Opening Month
                        </span>
                        <span className="flex items-center gap-1.5 text-sm font-medium text-default-700 dark:text-gray-200">
                          <IconCalendar size={14} />{" "}
                          {MONTH_NAMES[(overview?.period.opening_month || 1) - 1]}{" "}
                          {overviewYear}
                        </span>
                      </div>
                      <div>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-default-400 dark:text-gray-500">
                          Year
                        </span>
                        <ListboxSelect
                          value={String(overviewYear)}
                          onChange={(value: string): void => {
                            setOverview(null);
                            setOverviewYear(Number(value));
                          }}
                          options={yearOptions}
                          className="w-24"
                          buttonClassName="!rounded-md !py-1.5 !text-xs !shadow-none"
                          ariaLabel="Account activity year"
                        />
                      </div>
                      <div>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-default-400 dark:text-gray-500">
                          Current Month
                        </span>
                        <ListboxSelect
                          value={String(overviewMonth)}
                          onChange={(value: string): void => {
                            setOverview(null);
                            setOverviewMonth(Number(value));
                          }}
                          options={monthOptions}
                          className="w-36"
                          buttonClassName="!rounded-md !py-1.5 !text-xs !shadow-none"
                          ariaLabel="Account activity current month"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {!isEditMode ? (
                  <div className="px-4 py-8 text-center">
                    <IconChartBar
                      size={28}
                      className="mx-auto text-default-300 dark:text-gray-600"
                    />
                    <p className="mt-2 text-sm font-medium text-default-600 dark:text-gray-300">
                      Activity is available after this account is created
                    </p>
                    <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                      Monthly amounts and child balances are calculated from posted journals.
                    </p>
                  </div>
                ) : overviewLoading ? (
                  <div className="flex items-center justify-center gap-3 px-4 py-12 text-sm text-default-500 dark:text-gray-400">
                    <LoadingSpinner hideText />
                    Loading account activity...
                  </div>
                ) : overviewError ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                      Account activity could not be loaded
                    </p>
                    <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                      {overviewError}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(): void =>
                        setOverviewRefreshKey((value: number): number => value + 1)
                      }
                      className="mt-3"
                    >
                      Retry
                    </Button>
                  </div>
                ) : overview ? (
                  <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                      {[
                        {
                          label: "Opening Balance",
                          value: overview.totals.opening_balance,
                          tone: "text-default-800 dark:text-gray-100",
                        },
                        {
                          label: `Balance B/F (${
                            overviewMonth > 1
                              ? MONTH_NAMES[overviewMonth - 2]
                              : "Opening"
                          })`,
                          value: overview.totals.balance_brought_forward,
                          tone: "text-amber-700 dark:text-amber-300",
                        },
                        {
                          label: `${MONTH_NAMES[overviewMonth - 1]} Movement`,
                          value: overview.totals.current_month_movement,
                          tone: "text-sky-700 dark:text-sky-300",
                        },
                        {
                          label: "Accumulative",
                          value: overview.totals.accumulative_balance,
                          tone: "text-emerald-700 dark:text-emerald-300",
                        },
                      ].map(
                        (summary: {
                          label: string;
                          value: number;
                          tone: string;
                        }): React.ReactNode => (
                          <div
                            key={summary.label}
                            className="rounded-lg border border-default-200 bg-default-50/50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/30"
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-default-400 dark:text-gray-500">
                              {summary.label}
                            </p>
                            <p className={clsx("mt-1 text-sm font-semibold", summary.tone)}>
                              {formatSignedBalance(summary.value)}
                            </p>
                          </div>
                        )
                      )}
                    </div>

                    <div className="overflow-hidden rounded-lg border border-default-200 dark:border-gray-700">
                      <div className="grid grid-cols-2 gap-px bg-default-200 dark:bg-gray-700 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                        {overview.months.map(
                          (month: AccountOverviewMonth): React.ReactNode => {
                            const isCurrentMonth: boolean =
                              month.month === overviewMonth;
                            return (
                              <div
                                key={month.month}
                                className={clsx(
                                  "bg-white px-3 py-2.5 dark:bg-gray-800",
                                  isCurrentMonth &&
                                    "bg-sky-50 ring-1 ring-inset ring-sky-300 dark:bg-sky-900/20 dark:ring-sky-800"
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={clsx(
                                      "text-xs font-medium",
                                      isCurrentMonth
                                        ? "text-sky-700 dark:text-sky-300"
                                        : "text-default-500 dark:text-gray-400"
                                    )}
                                  >
                                    {MONTH_NAMES[month.month - 1]}
                                  </span>
                                  {isCurrentMonth && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                                  )}
                                </div>
                                <p className="mt-1 text-sm font-semibold text-default-800 dark:text-gray-100">
                                  {formatSignedBalance(month.net)}
                                </p>
                                {(month.debit !== 0 || month.credit !== 0) && (
                                  <p className="mt-0.5 text-[10px] text-default-400 dark:text-gray-500">
                                    Dr {formatCurrency(month.debit)} · Cr{" "}
                                    {formatCurrency(month.credit)}
                                  </p>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>

                    {hasChildAccounts &&
                      (Math.abs(overview.direct_account.opening_balance) >= 0.005 ||
                        Math.abs(
                          overview.direct_account.current_month_movement
                        ) >= 0.005 ||
                        Math.abs(
                          overview.direct_account.accumulative_balance
                        ) >= 0.005) && (
                      <p className="text-xs text-default-500 dark:text-gray-400">
                        Amount posted directly to {formData.code}: current month{" "}
                        <span className="font-medium text-default-700 dark:text-gray-200">
                          {formatSignedBalance(
                            overview.direct_account.current_month_movement
                          )}
                        </span>
                        , accumulative{" "}
                        <span className="font-medium text-default-700 dark:text-gray-200">
                          {formatSignedBalance(
                            overview.direct_account.accumulative_balance
                          )}
                        </span>
                        .
                      </p>
                    )}
                  </div>
                ) : null}
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
                          {isControlAccountView
                            ? "Parent / ACC Accounts"
                            : "Sub-Ledger / Child Accounts"}
                        </h4>
                        <p className="text-xs text-default-500 dark:text-gray-400">
                          Semua kod anak terus dan amaun bagi {MONTH_NAMES[overviewMonth - 1]}{" "}
                          {overviewYear}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-default-200 px-2.5 py-1 text-xs font-medium text-default-700 dark:bg-gray-700 dark:text-gray-200">
                      {displayedChildAccounts.length}{" "}
                      {displayedChildAccounts.length === 1 ? "account" : "accounts"}
                    </span>
                  </div>

                  {displayedChildAccounts.length === 0 ? (
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
                    <div className="max-h-96 overflow-auto">
                      <table className="min-w-full divide-y divide-default-200 text-sm dark:divide-gray-700">
                        <thead className="sticky top-0 z-10 bg-default-50 dark:bg-gray-800">
                          <tr className="text-[10px] font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                            <th className="px-4 py-2 text-left">
                              {isControlAccountView
                                ? "ACC No. / Code Bapa"
                                : "Sub-Ledger ACC / Code Anak"}
                            </th>
                            <th className="min-w-48 px-4 py-2 text-left">Particular</th>
                            <th className="whitespace-nowrap px-4 py-2 text-right">
                              Balance B/F
                            </th>
                            <th className="whitespace-nowrap px-4 py-2 text-right">
                              {MONTH_NAMES[overviewMonth - 1]} Amount
                            </th>
                            <th className="whitespace-nowrap px-4 py-2 text-right">
                              Accumulative
                            </th>
                            <th className="px-4 py-2 text-center">Status</th>
                            <th className="w-10 px-2 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                          {displayedChildAccounts.map(
                            (
                              childAccount: ChildAccountDisplay
                            ): React.ReactNode => {
                              const openChildAccount = (): void => {
                                if (isSaving) return;
                                requestNavigation(
                                  `/accounting/account-codes/${encodeURIComponent(
                                    childAccount.code
                                  )}`
                                );
                              };
                              return (
                                <tr
                                  key={childAccount.code}
                                  className={clsx(
                                    "group transition-colors hover:bg-sky-50 dark:hover:bg-sky-900/20",
                                    isSaving && "opacity-60"
                                  )}
                                >
                                  <td className="whitespace-nowrap px-4 py-2.5">
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={(
                                        event: React.MouseEvent<HTMLButtonElement>
                                      ): void => {
                                        event.stopPropagation();
                                        openChildAccount();
                                      }}
                                      className="flex items-center gap-2 rounded text-left focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed dark:focus:ring-offset-gray-800"
                                      aria-label={`Open account ${childAccount.code}`}
                                    >
                                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-default-100 text-default-500 group-hover:bg-sky-100 group-hover:text-sky-600 dark:bg-gray-700 dark:text-gray-400 dark:group-hover:bg-sky-900/40 dark:group-hover:text-sky-400">
                                        <IconFile size={15} />
                                      </span>
                                      <span>
                                        <span className="block font-mono font-semibold text-sky-700 dark:text-sky-400">
                                          {childAccount.code}
                                        </span>
                                        {childAccount.ledger_type && (
                                          <span className="text-[10px] text-default-400 dark:text-gray-500">
                                            {childAccount.ledger_type}
                                          </span>
                                        )}
                                      </span>
                                    </button>
                                  </td>
                                  <td
                                    className="max-w-80 px-4 py-2.5 text-default-700 dark:text-gray-200"
                                    title={childAccount.description}
                                  >
                                    <span className="line-clamp-2">
                                      {childAccount.description}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-sm font-medium text-default-700 dark:text-gray-200">
                                    {childAccount.balance_brought_forward === undefined
                                      ? "—"
                                      : formatSignedBalance(
                                          childAccount.balance_brought_forward
                                        )}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-sm font-medium text-sky-700 dark:text-sky-300">
                                    {childAccount.current_month_movement === undefined
                                      ? "—"
                                      : formatSignedBalance(
                                          childAccount.current_month_movement
                                        )}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                    {childAccount.accumulative_balance === undefined
                                      ? "—"
                                      : formatSignedBalance(
                                          childAccount.accumulative_balance
                                        )}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span
                                      className={clsx(
                                        "rounded-full px-2 py-0.5 text-xs font-medium",
                                        childAccount.is_active
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                          : "bg-default-200 text-default-600 dark:bg-gray-700 dark:text-gray-400"
                                      )}
                                    >
                                      {childAccount.is_active ? "Active" : "Inactive"}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2.5 text-center">
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={(): void => openChildAccount()}
                                      className="inline-flex h-8 w-8 items-center justify-center text-default-300 transition-colors hover:text-sky-600 focus:outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-600 dark:hover:text-sky-400"
                                      aria-label={`Open child account ${childAccount.code}`}
                                      title="Open child account"
                                    >
                                      <IconChevronRight
                                        size={17}
                                        aria-hidden="true"
                                        className="transition-transform group-hover:translate-x-0.5"
                                      />
                                    </button>
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                      <p className="border-t border-default-100 px-4 py-2 text-xs text-default-500 dark:border-gray-700 dark:text-gray-400">
                        Setiap amaun termasuk aktiviti semua akaun di bawah kod anak tersebut.
                      </p>
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
        onClose={(): void => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Account Code"
        message={`Adakah anda pasti mahu memadam akaun "${formData.code}"? Tindakan ini tidak boleh dibatalkan.`}
        confirmButtonText="Delete"
      />

      <ConfirmationDialog
        isOpen={pendingNavigation !== null}
        onClose={(): void => setPendingNavigation(null)}
        onConfirm={handleConfirmNavigation}
        title="Discard Changes"
        message="Anda mempunyai perubahan yang belum disimpan. Adakah anda pasti mahu meninggalkan akaun ini? Semua perubahan akan hilang."
        confirmButtonText="Discard"
      />
    </div>
  );
};

export default AccountCodeFormPage;
