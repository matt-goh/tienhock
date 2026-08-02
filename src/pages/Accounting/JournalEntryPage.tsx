// src/pages/Accounting/JournalEntryPage.tsx
import React, {
  Fragment,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { format } from "date-fns";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import {
  AccountCode,
  ChequeDuplicate,
  JournalEntry,
  JournalEntryType,
  JournalEntryTypeInfo,
  JournalEntryLineInput,
  LedgerType,
} from "../../types/types";
import {
  useAccountCodesCache,
  useJournalEntryTypesCache,
  useLedgerTypesCache,
  refreshAccountCodesCache,
} from "../../utils/accounting/useAccountingCache";
import BackButton from "../../components/BackButton";
import { useSmartBack } from "../../hooks/useSmartBack";
import Button from "../../components/Button";
import AccountCodeCombobox from "../../components/Accounting/AccountCodeCombobox";
import ChequeReuseWarning from "../../components/Accounting/ChequeReuseWarning";
import useAccountCodeFavourites from "../../hooks/useAccountCodeFavourites";
import {
  FormCombobox,
  FormInput,
  FormListbox,
  SelectOption,
} from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import TimeNavigator, { type TimeRange } from "../../components/TimeNavigator";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconPlus,
  IconTrash,
  IconDeviceFloppy,
  IconFileText,
  IconCheck,
} from "@tabler/icons-react";
import type {
  GreenTargetDebtorSubledgerIdentity,
} from "../../types/greenTargetTypes";

interface JournalLineFormData {
  id?: number;
  line_number: number;
  account_code: string;
  reference: string;
  cheque_reference: string;
  debtor_subledger_code: string;
  debtor_subledger_description: string;
  particulars: string;
  debit_amount: string;
  credit_amount: string;
}

interface JournalEntryFormData {
  reference_no: string;
  entry_type: JournalEntryType;
  entry_date: string;
  description: string;
  cheque_no: string;
  lines: JournalLineFormData[];
}

const LAST_ENTRY_TYPE_KEY = "journalEntryLastType";
const GT_LAST_ENTRY_TYPE_KEY = "gtJournalEntryLastType";
const LEGACY_IMPORT_ENTRY_TYPE: JournalEntryType = "IMP";
// Entry types that expose the Cheque No field. Cash Payment (C) pre-fills the
// next sequential cheque number; Bank Payment (B) pre-fills the static "PBE".
const CHEQUE_NO_ENTRY_TYPES: JournalEntryType[] = ["C", "B"];
const BANK_PAYMENT_CHEQUE_PREFILL = "PBE";
const HEADER_FIELD_CLASSNAME: string =
  "h-[38px] w-full px-3 text-sm border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:cursor-not-allowed";
const HEADER_LISTBOX_CLASSNAME: string =
  "[&>div>button]:h-[38px] [&>div>button]:bg-white dark:[&>div>button]:bg-gray-900/50 [&>div>button]:shadow-none";
const HEADER_TIME_NAVIGATOR_TRIGGER_CLASSNAME: string =
  "w-full !h-[38px] justify-between !bg-white dark:!bg-gray-900/50 !font-normal disabled:!bg-gray-50 dark:disabled:!bg-gray-800";
const ACCOUNT_CODE_PATTERN: RegExp = /^[A-Za-z0-9\-_.]+$/;
const GT_DEBTOR_SUBLEDGER_ENDPOINT: string =
  "/greentarget/api/account-codes/debtor-subledger";
const GT_DEBTOR_SEARCH_LIMIT: number = 50;

// Load the last journal type the user selected (shared cache with the list page session)
const loadLastEntryType = (
  storageKey: string = LAST_ENTRY_TYPE_KEY,
  fallback: JournalEntryType = "J"
): JournalEntryType => {
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached && cached !== LEGACY_IMPORT_ENTRY_TYPE) {
      return cached as JournalEntryType;
    }
  } catch (e) {
    console.error("Error loading last entry type:", e);
  }
  return fallback;
};

const emptyLine = (lineNumber: number): JournalLineFormData => ({
  line_number: lineNumber,
  account_code: "",
  reference: "",
  cheque_reference: "",
  debtor_subledger_code: "",
  debtor_subledger_description: "",
  particulars: "",
  debit_amount: "",
  credit_amount: "",
});

const getGTDebtorIdentityLabel = (
  identity: GreenTargetDebtorSubledgerIdentity
): string =>
  `${identity.code} - ${identity.description} (posts to ${identity.control_account_code})`;

const mergeGTDebtorIdentities = (
  rows: ReadonlyArray<GreenTargetDebtorSubledgerIdentity>
): GreenTargetDebtorSubledgerIdentity[] => {
  const identitiesByCode = new Map<
    string,
    GreenTargetDebtorSubledgerIdentity
  >();
  rows.forEach((identity: GreenTargetDebtorSubledgerIdentity): void => {
    if (!identitiesByCode.has(identity.code)) {
      identitiesByCode.set(identity.code, identity);
    }
  });
  return Array.from(identitiesByCode.values());
};

interface GTJournalDebtorIdentitySelectorProps {
  lineNumber: number;
  value: string;
  description: string;
  entryDate: string;
  disabled: boolean;
  onChange: (code: string, description: string) => void;
}

const GTJournalDebtorIdentitySelector: React.FC<
  GTJournalDebtorIdentitySelectorProps
> = ({
  lineNumber,
  value,
  description,
  entryDate,
  disabled,
  onChange,
}) => {
  const [query, setQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<
    GreenTargetDebtorSubledgerIdentity[]
  >([]);
  const [selectedIdentity, setSelectedIdentity] =
    useState<GreenTargetDebtorSubledgerIdentity | null>(null);
  const [selectedIdentityUnavailable, setSelectedIdentityUnavailable] =
    useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchFailed, setSearchFailed] = useState<boolean>(false);

  useEffect((): (() => void) => {
    let isCurrent: boolean = true;
    const timer: number = window.setTimeout(
      (): void => {
        const loadIdentities = async (): Promise<void> => {
          setIsSearching(true);
          setSearchFailed(false);
          try {
            const params: URLSearchParams = new URLSearchParams({
              search: query.trim(),
              limit: String(GT_DEBTOR_SEARCH_LIMIT),
            });
            if (entryDate) params.set("as_of", entryDate);
            const rows: GreenTargetDebtorSubledgerIdentity[] =
              await api.get<GreenTargetDebtorSubledgerIdentity[]>(
                `${GT_DEBTOR_SUBLEDGER_ENDPOINT}?${params.toString()}`
              );
            if (isCurrent) setSearchResults(rows);
          } catch (searchError: unknown) {
            console.error(
              "Failed to search Green Target debtor identities:",
              searchError
            );
            if (isCurrent) {
              setSearchResults([]);
              setSearchFailed(true);
            }
          } finally {
            if (isCurrent) setIsSearching(false);
          }
        };
        void loadIdentities();
      },
      query ? 250 : 0
    );

    return (): void => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [entryDate, query]);

  useEffect((): (() => void) => {
    let isCurrent: boolean = true;
    if (!value) {
      setSelectedIdentity(null);
      setSelectedIdentityUnavailable(false);
      return (): void => {
        isCurrent = false;
      };
    }

    setSelectedIdentity(null);
    setSelectedIdentityUnavailable(false);
    const loadSelectedIdentity = async (): Promise<void> => {
      try {
        const params: URLSearchParams = new URLSearchParams({
          search: value,
          limit: String(GT_DEBTOR_SEARCH_LIMIT),
        });
        if (entryDate) params.set("as_of", entryDate);
        const rows: GreenTargetDebtorSubledgerIdentity[] =
          await api.get<GreenTargetDebtorSubledgerIdentity[]>(
            `${GT_DEBTOR_SUBLEDGER_ENDPOINT}?${params.toString()}`
          );
        if (!isCurrent) return;
        const exactIdentity: GreenTargetDebtorSubledgerIdentity | null =
          rows.find(
            (identity: GreenTargetDebtorSubledgerIdentity): boolean =>
              identity.code === value
          ) || null;
        setSelectedIdentity(exactIdentity);
        setSelectedIdentityUnavailable(exactIdentity === null);
      } catch (selectedError: unknown) {
        console.error(
          "Failed to load selected Green Target debtor identity:",
          selectedError
        );
        if (isCurrent) {
          setSelectedIdentity(null);
          setSelectedIdentityUnavailable(false);
        }
      }
    };
    void loadSelectedIdentity();

    return (): void => {
      isCurrent = false;
    };
  }, [entryDate, value]);

  const identities: GreenTargetDebtorSubledgerIdentity[] = useMemo(
    (): GreenTargetDebtorSubledgerIdentity[] =>
      mergeGTDebtorIdentities([
        ...(selectedIdentity ? [selectedIdentity] : []),
        ...searchResults.filter(
          (identity: GreenTargetDebtorSubledgerIdentity): boolean =>
            identity.is_selectable
        ),
      ]),
    [searchResults, selectedIdentity]
  );

  const options: SelectOption[] = useMemo((): SelectOption[] => {
    const availableOptions: SelectOption[] = identities.map(
      (identity: GreenTargetDebtorSubledgerIdentity): SelectOption => ({
        id: identity.code,
        name: getGTDebtorIdentityLabel(identity),
      })
    );
    if (
      value &&
      !availableOptions.some(
        (option: SelectOption): boolean => option.id === value
      )
    ) {
      availableOptions.unshift({
        id: value,
        name: `${value} - ${description || "selected identity"} (posts to CD_SD)`,
      });
    }
    return availableOptions;
  }, [description, identities, value]);

  return (
    <div className="mt-1.5 space-y-1">
      <FormCombobox
        name={`debtor_subledger_code_${lineNumber}`}
        label="Trade Debtor Identity"
        value={value || undefined}
        onChange={(selected: string | string[] | null): void => {
          const selectedCode: string =
            typeof selected === "string" ? selected : "";
          const identity: GreenTargetDebtorSubledgerIdentity | undefined =
            identities.find(
              (candidate: GreenTargetDebtorSubledgerIdentity): boolean =>
                candidate.code === selectedCode
            );
          onChange(
            selectedCode,
            identity?.description ||
              (selectedCode === value ? description : "")
          );
          setQuery("");
        }}
        options={options}
        query={query}
        setQuery={setQuery}
        mode="single"
        required
        disabled={disabled}
        maxVisibleOptions={GT_DEBTOR_SEARCH_LIMIT}
        placeholder={
          isSearching
            ? "Searching debtor identities..."
            : "Search debtor code or customer name..."
        }
      />
      <p className="px-1 text-[11px] leading-4 text-default-500 dark:text-gray-400">
        Required for the Trade Debtors sub-schedule. The general ledger line
        remains posted to CD_SD.
      </p>
      {selectedIdentityUnavailable && (
        <p className="px-1 text-[11px] leading-4 text-rose-700 dark:text-rose-300">
          {value} is not selectable for this journal date. Choose another
          identity before saving.
        </p>
      )}
      {searchFailed && (
        <p className="px-1 text-[11px] leading-4 text-rose-700 dark:text-rose-300">
          Debtor identity search could not be loaded.
        </p>
      )}
    </div>
  );
};

const parseLocalDateString = (dateString: string): Date | null => {
  const match: RegExpMatchArray | null = dateString.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );
  if (!match) return null;

  const year: number = Number(match[1]);
  const month: number = Number(match[2]);
  const day: number = Number(match[3]);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
};

interface QuickAddAccountCodeFormData {
  code: string;
  description: string;
  ledger_type: string;
  parent_code: string;
  sort_order: number;
  notes: string;
}

interface QuickAddAccountCodeResponse {
  message: string;
  accountCode: AccountCode;
}

interface QuickAddAccountCodeModalProps {
  isOpen: boolean;
  initialQuery: string;
  existingAccountCodes: AccountCode[];
  ledgerTypes: LedgerType[];
  ledgerTypesLoading: boolean;
  onClose: () => void;
  onCreated: (accountCode: AccountCode) => void;
}

interface ApiErrorLike extends Error {
  status?: number;
}

const getInitialQuickAddAccountData = (
  initialQuery: string
): QuickAddAccountCodeFormData => {
  const trimmedQuery: string = initialQuery.trim();
  const shouldPrefillCode: boolean =
    trimmedQuery.length > 0 && ACCOUNT_CODE_PATTERN.test(trimmedQuery);

  return {
    code: shouldPrefillCode ? trimmedQuery.toUpperCase() : "",
    description: shouldPrefillCode ? "" : trimmedQuery,
    ledger_type: "",
    parent_code: "",
    sort_order: 0,
    notes: "",
  };
};

const QuickAddAccountCodeModal: React.FC<QuickAddAccountCodeModalProps> = ({
  isOpen,
  initialQuery,
  existingAccountCodes,
  ledgerTypes,
  ledgerTypesLoading,
  onClose,
  onCreated,
}: QuickAddAccountCodeModalProps) => {
  const [formData, setFormData] = useState<QuickAddAccountCodeFormData>(
    getInitialQuickAddAccountData(initialQuery)
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect((): void => {
    if (!isOpen) return;

    setFormData(getInitialQuickAddAccountData(initialQuery));
    setError(null);
  }, [initialQuery, isOpen]);

  const ledgerTypeOptions: SelectOption[] = useMemo(
    (): SelectOption[] => [
      { id: "", name: "None" },
      ...ledgerTypes.map(
        (ledgerType: LedgerType): SelectOption => ({
          id: ledgerType.code,
          name: `${ledgerType.code} - ${ledgerType.name}`,
        })
      ),
    ],
    [ledgerTypes]
  );

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const { name, value } = e.target;

    if (name === "sort_order") {
      setFormData(
        (prev: QuickAddAccountCodeFormData): QuickAddAccountCodeFormData => ({
          ...prev,
          sort_order: parseInt(value, 10) || 0,
        })
      );
      return;
    }

    if (name === "code" || name === "description") {
      setFormData(
        (prev: QuickAddAccountCodeFormData): QuickAddAccountCodeFormData => ({
          ...prev,
          [name]: value,
        })
      );
    }
  };

  const handleNotesChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ): void => {
    setFormData(
      (prev: QuickAddAccountCodeFormData): QuickAddAccountCodeFormData => ({
        ...prev,
        notes: e.target.value,
      })
    );
  };

  const handleLedgerTypeChange = (value: string): void => {
    setFormData(
      (prev: QuickAddAccountCodeFormData): QuickAddAccountCodeFormData => ({
        ...prev,
        ledger_type: value,
      })
    );
  };

  const handleParentAccountChange = (value: string): void => {
    setFormData(
      (prev: QuickAddAccountCodeFormData): QuickAddAccountCodeFormData => ({
        ...prev,
        parent_code: value,
      })
    );
  };

  const validateForm = (): string | null => {
    const normalizedCode: string = formData.code.trim().toUpperCase();
    const trimmedDescription: string = formData.description.trim();
    const normalizedParentCode: string = formData.parent_code
      .trim()
      .toUpperCase();

    if (!normalizedCode) {
      return "Account code is required";
    }

    if (!trimmedDescription) {
      return "Description is required";
    }

    if (!ACCOUNT_CODE_PATTERN.test(normalizedCode)) {
      return "Account code can only contain letters, numbers, hyphens, underscores, and periods";
    }

    if (normalizedParentCode && normalizedParentCode === normalizedCode) {
      return "An account cannot be its own parent";
    }

    const duplicateAccount: boolean = existingAccountCodes.some(
      (accountCode: AccountCode): boolean =>
        accountCode.code.toUpperCase() === normalizedCode
    );

    if (duplicateAccount) {
      return `Account code "${normalizedCode}" already exists`;
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    const validationError: string | null = validateForm();
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      return;
    }

    const normalizedCode: string = formData.code.trim().toUpperCase();

    setIsSaving(true);

    try {
      const response = await api.post<QuickAddAccountCodeResponse>(
        "/api/account-codes",
        {
          code: normalizedCode,
          description: formData.description.trim(),
          ledger_type: formData.ledger_type || null,
          parent_code: formData.parent_code || null,
          sort_order: formData.sort_order,
          is_active: true,
          notes: formData.notes.trim() || null,
        }
      );

      const createdAccountCode: AccountCode = response.accountCode;

      try {
        await refreshAccountCodesCache();
      } catch (cacheError: unknown) {
        console.error("Error refreshing account codes cache:", cacheError);
        toast.error("Account code created, but the account list could not refresh");
      }

      toast.success("Account code created successfully");
      onCreated(createdAccountCode);
      onClose();
    } catch (err: unknown) {
      console.error("Error creating account code:", err);
      const apiError: ApiErrorLike | null =
        err instanceof Error ? (err as ApiErrorLike) : null;
      const errorMessage: string =
        apiError?.status === 409
          ? `Account code "${normalizedCode}" already exists`
          : apiError?.message || "Failed to create account code";

      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = (): void => {
    if (isSaving) return;
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-3xl transform overflow-visible rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold text-default-900 dark:text-gray-100"
                >
                  Add Account Code
                </DialogTitle>

                <form onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormInput
                      name="code"
                      label="Account Code"
                      value={formData.code}
                      onChange={handleInputChange}
                      placeholder="e.g., SALES-001"
                      required
                      disabled={isSaving}
                    />

                    <FormInput
                      name="description"
                      label="Description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="e.g., Sales Account"
                      required
                      disabled={isSaving}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormListbox
                      name="ledger_type"
                      label="Ledger Type"
                      value={formData.ledger_type}
                      onChange={handleLedgerTypeChange}
                      options={ledgerTypeOptions}
                      disabled={isSaving || ledgerTypesLoading}
                      placeholder={ledgerTypesLoading ? "Loading..." : "Select ledger type..."}
                    />

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
                        Parent Account
                      </label>
                      <AccountCodeCombobox
                        value={formData.parent_code}
                        onChange={handleParentAccountChange}
                        disabled={isSaving}
                        placeholder="Search parent account..."
                        hierarchical
                        allowEmpty
                        emptyLabel="None (Top Level)"
                        filter={(account: AccountCode): boolean =>
                          account.code.toUpperCase() !==
                          formData.code.trim().toUpperCase()
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

                  <div className="space-y-2">
                    <label
                      htmlFor="quick-add-account-notes"
                      className="block text-sm font-medium text-default-700 dark:text-gray-200"
                    >
                      Notes
                    </label>
                    <textarea
                      id="quick-add-account-notes"
                      name="notes"
                      rows={3}
                      value={formData.notes}
                      onChange={handleNotesChange}
                      disabled={isSaving}
                      placeholder="Optional notes about this account..."
                      className="block w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 border-t border-default-200 pt-5 dark:border-gray-700">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      color="sky"
                      variant="filled"
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Create Account"}
                    </Button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

interface JournalEntryPageProps {
  // Green Target reuses this form over its own journal routes; it fetches GT
  // types/accounts directly (the TH caches are left firing, unused) and has
  // no inline account quick-add/favourites and no journal delete.
  company?: "tienhock" | "greentarget";
}

const JournalEntryPage: React.FC<JournalEntryPageProps> = ({
  company = "tienhock",
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();

  // Check if we're in edit mode (route ends with /edit) or create mode (/new)
  const isEditMode = !!id && location.pathname.includes("/edit");
  const isCreateMode = location.pathname.endsWith("/new");

  const isGreenTarget: boolean = company === "greentarget";
  const apiBase: string = isGreenTarget ? "/greentarget/api" : "/api";
  const journalEntriesPath: string = isGreenTarget
    ? "/greentarget/accounting/journal-entries"
    : "/accounting/journal-entries";
  const goBack = useSmartBack(journalEntriesPath);
  const lastEntryTypeKey: string = isGreenTarget
    ? GT_LAST_ENTRY_TYPE_KEY
    : LAST_ENTRY_TYPE_KEY;
  const defaultEntryType: JournalEntryType = isGreenTarget ? "JV" : "J";

  // Cached reference data (Tien Hock). On Green Target these hooks still fire
  // but their values are overridden by the GT lists fetched below.
  const { entryTypes: thEntryTypes, isLoading: thEntryTypesLoading } = useJournalEntryTypesCache();
  const { accountCodes: cachedAccountCodes, isLoading: thAccountCodesLoading } = useAccountCodesCache();
  const {
    favouriteCodes,
    pendingCodes: pendingFavouriteCodes,
    toggleFavourite,
  } = useAccountCodeFavourites();
  const { ledgerTypes: allLedgerTypes, isLoading: ledgerTypesLoading } = useLedgerTypesCache();
  const [optimisticAccountCodes, setOptimisticAccountCodes] = useState<AccountCode[]>([]);

  // Green Target reference data, fetched from the GT routes (no GT caches).
  const [gtEntryTypes, setGtEntryTypes] = useState<JournalEntryTypeInfo[]>([]);
  const [gtAccountCodes, setGtAccountCodes] = useState<AccountCode[]>([]);
  const [gtReferenceLoading, setGtReferenceLoading] =
    useState<boolean>(isGreenTarget);

  useEffect(() => {
    if (!isGreenTarget) return;

    let cancelled = false;
    const loadGreenTargetReference = async () => {
      setGtReferenceLoading(true);
      try {
        const [typesResponse, accountsResponse] = await Promise.all([
          api.get(`${apiBase}/journal-entries/types`),
          api.get(`${apiBase}/account-codes?flat=true`),
        ]);
        if (cancelled) return;
        setGtEntryTypes(typesResponse as JournalEntryTypeInfo[]);
        setGtAccountCodes(accountsResponse as AccountCode[]);
      } catch (err: unknown) {
        console.error("Error fetching Green Target reference data:", err);
        if (!cancelled) {
          toast.error("Failed to load Green Target accounts and journal types");
        }
      } finally {
        if (!cancelled) setGtReferenceLoading(false);
      }
    };

    loadGreenTargetReference();
    return () => {
      cancelled = true;
    };
  }, [isGreenTarget, apiBase]);

  const entryTypes: JournalEntryTypeInfo[] = isGreenTarget
    ? gtEntryTypes
    : thEntryTypes;
  const entryTypesLoading: boolean = isGreenTarget
    ? gtReferenceLoading
    : thEntryTypesLoading;
  const accountCodesLoading: boolean = isGreenTarget
    ? gtReferenceLoading
    : thAccountCodesLoading;
  const baseAccountCodes: AccountCode[] = isGreenTarget
    ? gtAccountCodes
    : cachedAccountCodes;

  const allAccountCodes = useMemo((): AccountCode[] => {
    if (optimisticAccountCodes.length === 0) return baseAccountCodes;

    const cachedCodes: Set<string> = new Set(
      baseAccountCodes.map((accountCode: AccountCode): string =>
        accountCode.code.toUpperCase()
      )
    );

    return [
      ...optimisticAccountCodes.filter(
        (accountCode: AccountCode): boolean =>
          !cachedCodes.has(accountCode.code.toUpperCase())
      ),
      ...baseAccountCodes,
    ];
  }, [baseAccountCodes, optimisticAccountCodes]);

  const ledgerTypes = useMemo(
    () => allLedgerTypes.filter((lt: LedgerType) => lt.is_active),
    [allLedgerTypes]
  );

  // Form state - new entries default to the last journal type used
  const [formData, setFormData] = useState<JournalEntryFormData>({
    reference_no: "",
    entry_type: isCreateMode
      ? loadLastEntryType(lastEntryTypeKey, defaultEntryType)
      : defaultEntryType,
    entry_date: format(new Date(), "yyyy-MM-dd"),
    description: "",
    cheque_no: "",
    lines: [emptyLine(1), emptyLine(2)],
  });

  // Header cheque number machinery is Tien Hock-only; Green Target keeps
  // cheque/transaction references per line, so its form never shows the field
  // or calls the TH cheque endpoints even for C/B entries.
  const showChequeNo: boolean =
    !isGreenTarget && CHEQUE_NO_ENTRY_TYPES.includes(formData.entry_type);

  // Entry status for edit mode
  const [entryStatus, setEntryStatus] = useState<string>("active");

  // Initial form data for change detection
  const initialFormDataRef = useRef<JournalEntryFormData | null>(null);

  // UI state
  const [pageLoading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [quickAddTargetLineIndex, setQuickAddTargetLineIndex] = useState<number | null>(null);
  const [quickAddInitialQuery, setQuickAddInitialQuery] = useState<string>("");
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Combined loading state (page + cache)
  const loading = pageLoading || entryTypesLoading || accountCodesLoading;

  const entryDate = useMemo<Date | null>(
    () => parseLocalDateString(formData.entry_date),
    [formData.entry_date]
  );

  const entryDateRange = useMemo<{ start: Date | null; end: Date | null }>(
    () => ({
      start: entryDate,
      end: entryDate,
    }),
    [entryDate]
  );

  const handleEntryDateChange = useCallback((range: TimeRange): void => {
    setFormData((prev: JournalEntryFormData): JournalEntryFormData => ({
      ...prev,
      entry_date: format(range.start, "yyyy-MM-dd"),
    }));
  }, []);

  // Calculate totals
  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of formData.lines) {
      totalDebit += parseFloat(line.debit_amount) || 0;
      totalCredit += parseFloat(line.credit_amount) || 0;
    }
    return { totalDebit, totalCredit };
  }, [formData.lines]);

  // Check if balanced
  const isBalanced = Math.abs(totals.totalDebit - totals.totalCredit) <= 0.01;
  const difference = Math.abs(totals.totalDebit - totals.totalCredit);

  // Fetch next reference number
  const fetchNextReference = useCallback(
    async (entryType: JournalEntryType) => {
      try {
        const response = await api.get(
          `${apiBase}/journal-entries/next-reference/${entryType}`
        );
        const data = response as { reference_no: string };
        setFormData((prev) => ({ ...prev, reference_no: data.reference_no }));
      } catch (err: unknown) {
        console.error("Error fetching next reference:", err);
      }
    },
    [apiBase]
  );

  // Fetch next sequential cheque number (Cash Payment / C entries only)
  const fetchNextChequeNo = useCallback(async () => {
    try {
      const response = await api.get("/api/journal-entries/next-cheque-no");
      const data = response as { cheque_no: string };
      setFormData((prev) => ({ ...prev, cheque_no: data.cheque_no }));
    } catch (err: unknown) {
      console.error("Error fetching next cheque number:", err);
    }
  }, []);

  // Warn while the cheque number is being keyed when it is already issued on
  // another Cash/Bank Payment entry - the legacy programme's
  // "CHEQUE … ALREADY ISSUED ON …" message. Warning only, never blocks saving.
  const [chequeDuplicates, setChequeDuplicates] = useState<ChequeDuplicate[]>(
    []
  );

  useEffect(() => {
    const chequeNo: string = formData.cheque_no.trim();
    if (!showChequeNo || !chequeNo) {
      setChequeDuplicates([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ cheque_no: chequeNo });
        if (id) params.append("exclude_id", id);
        const response = await api.get(
          `/api/journal-entries/cheque-usage?${params.toString()}`
        );
        if (!cancelled) {
          setChequeDuplicates(
            (response as { duplicates: ChequeDuplicate[] }).duplicates
          );
        }
      } catch (err: unknown) {
        console.error("Error checking cheque usage:", err);
        if (!cancelled) setChequeDuplicates([]);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.cheque_no, formData.entry_type, id]);

  // Fetch entry data for editing
  const fetchEntryData = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`${apiBase}/journal-entries/${id}`);
      const entry = response as JournalEntry;

      const lines: JournalLineFormData[] = (entry.lines || []).map((line) => ({
        id: line.id,
        line_number: line.line_number,
        account_code: line.account_code,
        // Edit the STORED reference, not the resolved display value
        reference: line.internal_reference || line.reference || "",
        cheque_reference: line.cheque_reference || "",
        debtor_subledger_code: line.debtor_subledger_code || "",
        debtor_subledger_description:
          line.debtor_subledger_description || "",
        particulars: line.particulars || "",
        debit_amount: line.debit_amount > 0 ? line.debit_amount.toString() : "",
        credit_amount:
          line.credit_amount > 0 ? line.credit_amount.toString() : "",
      }));

      // Ensure at least 2 lines
      while (lines.length < 2) {
        lines.push(emptyLine(lines.length + 1));
      }

      const fetchedFormData: JournalEntryFormData = {
        // Edit the STORED internal reference_no, not the resolved display
        // reference (display_reference, e.g. a receipt's keyed T130726)
        reference_no: entry.internal_reference_no || entry.reference_no,
        entry_type: entry.entry_type,
        // Serialized date columns are UTC midnight-shifted; format in local TZ
        // so the date doesn't slip back a day on every edit
        entry_date: format(new Date(entry.entry_date), "yyyy-MM-dd"),
        description: entry.description || "",
        cheque_no: entry.cheque_no || "",
        lines,
      };

      setFormData(fetchedFormData);
      initialFormDataRef.current = JSON.parse(JSON.stringify(fetchedFormData));
      setEntryStatus(entry.status);
    } catch (err: unknown) {
      console.error("Error fetching entry data:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load journal entry: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [id, apiBase]);

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      if (isEditMode) {
        await fetchEntryData();
      } else {
        // Create mode - fetch next reference
        if (isCreateMode) {
          await fetchNextReference(formData.entry_type);
          // Cached last type may already use a cheque number - pre-fill it too
          if (!isGreenTarget && formData.entry_type === "C") {
            await fetchNextChequeNo();
          } else if (!isGreenTarget && formData.entry_type === "B") {
            setFormData((prev) => ({
              ...prev,
              cheque_no: BANK_PAYMENT_CHEQUE_PREFILL,
            }));
          }
        }
        initialFormDataRef.current = JSON.parse(JSON.stringify(formData));
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, isCreateMode, fetchEntryData]);

  // Form change detection
  useEffect(() => {
    if (!initialFormDataRef.current) return;

    const hasChanges =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanges);
  }, [formData]);

  // Handle entry type change
  const handleEntryTypeChange = async (value: string) => {
    const newType = value as JournalEntryType;
    // Remember the last selected type for the next new entry
    try {
      localStorage.setItem(lastEntryTypeKey, newType);
    } catch (e) {
      console.error("Error caching last entry type:", e);
    }
    // Preserve/prefill the cheque number per type; clear it for other types
    setFormData((prev) => ({
      ...prev,
      entry_type: newType,
      cheque_no: isGreenTarget
        ? ""
        : newType === "C"
          ? prev.cheque_no
          : newType === "B"
            ? BANK_PAYMENT_CHEQUE_PREFILL
            : "",
    }));

    // Only fetch new reference if creating new entry
    if (isCreateMode) {
      await fetchNextReference(newType);
      // Pre-fill the next sequential cheque number for Cash Payment entries
      if (!isGreenTarget && newType === "C") {
        await fetchNextChequeNo();
      }
    }
  };

  // Handle line changes
  const handleLineChange = (
    index: number,
    field: keyof JournalLineFormData,
    value: string
  ) => {
    setFormData((prev) => {
      const newLines: JournalLineFormData[] = [...prev.lines];
      const previousLine: JournalLineFormData = newLines[index];
      newLines[index] = { ...previousLine, [field]: value };

      // A debtor tag belongs to one specific GL control account. Keep tags
      // returned on untouched named-debtor lines, but never carry one across
      // an account change where it would describe a different posting.
      if (field === "account_code" && value !== previousLine.account_code) {
        newLines[index].debtor_subledger_code = "";
        newLines[index].debtor_subledger_description = "";
      }

      // Auto-clear opposite amount field
      if (field === "debit_amount" && value && parseFloat(value) > 0) {
        newLines[index].credit_amount = "";
      } else if (field === "credit_amount" && value && parseFloat(value) > 0) {
        newLines[index].debit_amount = "";
      }

      return { ...prev, lines: newLines };
    });
  };

  const handleDebtorSubledgerChange = (
    index: number,
    code: string,
    description: string
  ): void => {
    setFormData((prev: JournalEntryFormData): JournalEntryFormData => {
      if (!prev.lines[index]) return prev;
      const newLines: JournalLineFormData[] = [...prev.lines];
      newLines[index] = {
        ...newLines[index],
        debtor_subledger_code: code,
        debtor_subledger_description: description,
      };
      return { ...prev, lines: newLines };
    });
  };

  const handleOpenQuickAddAccount = (
    lineIndex: number,
    query: string
  ): void => {
    setQuickAddTargetLineIndex(lineIndex);
    setQuickAddInitialQuery(query);
  };

  const handleCloseQuickAddAccount = (): void => {
    setQuickAddTargetLineIndex(null);
    setQuickAddInitialQuery("");
  };

  const handleQuickAddAccountCreated = (accountCode: AccountCode): void => {
    setOptimisticAccountCodes(
      (prev: AccountCode[]): AccountCode[] => [
        accountCode,
        ...prev.filter(
          (existing: AccountCode): boolean =>
            existing.code.toUpperCase() !== accountCode.code.toUpperCase()
        ),
      ]
    );

    setFormData((prev: JournalEntryFormData): JournalEntryFormData => {
      if (
        quickAddTargetLineIndex === null ||
        !prev.lines[quickAddTargetLineIndex]
      ) {
        return prev;
      }

      const newLines: JournalLineFormData[] = [...prev.lines];
      newLines[quickAddTargetLineIndex] = {
        ...newLines[quickAddTargetLineIndex],
        account_code: accountCode.code,
        debtor_subledger_code: "",
        debtor_subledger_description: "",
      };

      return { ...prev, lines: newLines };
    });
  };

  // Add new line
  const addLine = () => {
    setFormData((prev) => ({
      ...prev,
      lines: [...prev.lines, emptyLine(prev.lines.length + 1)],
    }));
  };

  // Remove line
  const removeLine = (index: number) => {
    if (formData.lines.length <= 2) {
      toast.error("At least 2 lines are required");
      return;
    }

    setFormData((prev) => {
      const newLines = prev.lines.filter((_, i) => i !== index);
      // Renumber lines
      return {
        ...prev,
        lines: newLines.map((line, i) => ({ ...line, line_number: i + 1 })),
      };
    });
  };

  // Navigation
  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      goBack();
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    goBack();
  };

  // Validation
  const validateForm = (): boolean => {
    if (!formData.reference_no.trim()) {
      toast.error("Reference number is required");
      return false;
    }

    if (!formData.entry_date) {
      toast.error("Entry date is required");
      return false;
    }

    // Filter lines with data
    const filledLines = formData.lines.filter(
      (line) =>
        line.account_code ||
        parseFloat(line.debit_amount) > 0 ||
        parseFloat(line.credit_amount) > 0
    );

    if (filledLines.length < 2) {
      toast.error("At least 2 line items are required");
      return false;
    }

    // Validate each filled line has account code
    for (const line of filledLines) {
      if (!line.account_code) {
        toast.error("Each line item must have an account code");
        return false;
      }
      if (
        isGreenTarget &&
        line.account_code === "CD_SD" &&
        !line.debtor_subledger_code.trim()
      ) {
        toast.error(
          `Select a Trade Debtor identity for CD_SD line ${line.line_number}`
        );
        return false;
      }
      if (
        (parseFloat(line.debit_amount) || 0) === 0 &&
        (parseFloat(line.credit_amount) || 0) === 0
      ) {
        toast.error("Each line item must have either a debit or credit amount");
        return false;
      }
    }

    // Validate totals match
    if (!isBalanced) {
      toast.error(
        `Total debits (${totals.totalDebit.toFixed(
          2
        )}) must equal total credits (${totals.totalCredit.toFixed(2)})`
      );
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
      // Filter and prepare lines
      const lines: JournalEntryLineInput[] = formData.lines
        .filter(
          (line) =>
            line.account_code &&
            (parseFloat(line.debit_amount) > 0 ||
              parseFloat(line.credit_amount) > 0)
        )
        .map((line, index): JournalEntryLineInput => ({
          line_number: index + 1,
          account_code: line.account_code,
          debit_amount: parseFloat(line.debit_amount) || 0,
          credit_amount: parseFloat(line.credit_amount) || 0,
          reference: line.reference || undefined,
          cheque_reference: isGreenTarget
            ? line.cheque_reference || undefined
            : undefined,
          ...(isGreenTarget && line.debtor_subledger_code.trim()
            ? {
                debtor_subledger_code:
                  line.debtor_subledger_code.trim(),
              }
            : {}),
          particulars: line.particulars || undefined,
        }));

      const payload = {
        reference_no: formData.reference_no.trim(),
        entry_type: formData.entry_type,
        entry_date: formData.entry_date,
        description: formData.description.trim() || undefined,
        cheque_no: showChequeNo
          ? formData.cheque_no.trim() || undefined
          : undefined,
        lines,
      };

      let entryId: string | number | undefined = id;

      if (isEditMode) {
        await api.put(`${apiBase}/journal-entries/${id}`, payload);
        toast.success("Journal entry updated successfully");
      } else {
        const response = (await api.post(
          `${apiBase}/journal-entries`,
          payload
        )) as { entry?: { id: number } };
        entryId = response?.entry?.id;
        toast.success("Journal entry created successfully");
      }

      // After an edit, return to where the user came from (normally the entry's
      // own details page). After a create, show the entry just created.
      if (isEditMode) {
        goBack();
      } else if (entryId) {
        navigate(`${journalEntriesPath}/${entryId}`, { replace: true });
      } else {
        goBack();
      }
    } catch (err: unknown) {
      console.error("Error saving journal entry:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error(
        errorMessage ||
          `Failed to ${isEditMode ? "update" : "create"} journal entry`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Delete entry
  const handleConfirmDelete = async () => {
    if (!id) return;

    setIsSaving(true);
    try {
      await api.delete(`${apiBase}/journal-entries/${id}`);
      toast.success("Journal entry deleted successfully");
      setShowDeleteDialog(false);
      navigate(journalEntriesPath);
    } catch (err: unknown) {
      console.error("Error deleting journal entry:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error(errorMessage || "Failed to delete journal entry");
    } finally {
      setIsSaving(false);
    }
  };

  // Build options
  const entryTypeOptions: SelectOption[] = entryTypes
    .filter((entryType): boolean => entryType.code !== LEGACY_IMPORT_ENTRY_TYPE)
    .map((entryType): SelectOption => ({
      id: entryType.code,
      name: `${entryType.code} - ${entryType.name}`,
    }));

  // Format amount for display
  const formatAmount = (value: string): string => {
    const num = parseFloat(value);
    return isNaN(num) || num === 0 ? "" : num.toFixed(2);
  };

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
      <div className="space-y-3">
        <BackButton fallbackPath={journalEntriesPath} />
        <div className="p-4 border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton onClick={handleBackClick} />
              <div className="h-8 w-px bg-default-300 dark:bg-gray-600"></div>
              <div className="p-2 bg-sky-50 dark:bg-sky-900/30 rounded-lg">
                <IconFileText size={24} className="text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                  {isEditMode ? "Edit Journal Entry" : "New Journal Entry"}
                </h1>
                <p className="mt-0.5 text-sm text-default-500 dark:text-gray-400">
                  {isEditMode
                    ? `Editing ${formData.reference_no}`
                    : "Create a new journal entry"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isFormChanged && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  Unsaved changes
                </span>
              )}
              {isEditMode && (
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    entryStatus === "cancelled"
                      ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                      : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                  }`}
                >
                  {entryStatus === "cancelled" ? "Cancelled" : "Active"}
                </span>
              )}
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
                  Saving journal entry...
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Entry Header - Horizontal Row */}
            <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700 bg-default-50/50 dark:bg-gray-900/30">
              <div
                className={`grid grid-cols-4 gap-4 ${
                  showChequeNo
                    ? "lg:grid-cols-5"
                    : ""
                }`}
              >
                {/* Reference Number */}
                <div>
                  <label className="block text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Reference No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.reference_no}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        reference_no: e.target.value,
                      }))
                    }
                    placeholder="e.g., PBE001/06"
                    disabled={isSaving}
                    className={`${HEADER_FIELD_CLASSNAME} placeholder:text-gray-400 dark:placeholder:text-gray-500`}
                  />
                </div>

                {/* Entry Type */}
                <div>
                  <label className="block text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <FormListbox
                    name="entry_type"
                    value={formData.entry_type}
                    onChange={handleEntryTypeChange}
                    options={entryTypeOptions}
                    disabled={isSaving}
                    className={HEADER_LISTBOX_CLASSNAME}
                  />
                </div>

                {/* Entry Date */}
                <div>
                  <label className="block text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <TimeNavigator
                    range={entryDateRange}
                    onChange={handleEntryDateChange}
                    modes={["day"]}
                    presets={false}
                    showArrows={false}
                    allowFuture
                    placeholder="Pick a date"
                    disabled={isSaving}
                    className="w-full"
                    triggerClassName={HEADER_TIME_NAVIGATOR_TRIGGER_CLASSNAME}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Optional description"
                    disabled={isSaving}
                    className={`${HEADER_FIELD_CLASSNAME} placeholder:text-gray-400 dark:placeholder:text-gray-500`}
                  />
                </div>

                {/* Cheque Number - Cash Payment (C) / Bank Payment (B) entries */}
                {showChequeNo && (
                  <div>
                    <label className="block text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      Cheque No
                    </label>
                    <input
                      type="text"
                      value={formData.cheque_no}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          cheque_no: e.target.value,
                        }))
                      }
                      placeholder="e.g., PBB350779"
                      disabled={isSaving}
                      className={`${HEADER_FIELD_CLASSNAME} placeholder:text-gray-400 dark:placeholder:text-gray-500 ${
                        chequeDuplicates.length > 0
                          ? "!border-amber-400 dark:!border-amber-600"
                          : ""
                      }`}
                    />
                  </div>
                )}
              </div>

              <ChequeReuseWarning
                chequeNo={formData.cheque_no.trim()}
                duplicates={chequeDuplicates}
                className="mt-3"
              />
            </div>

            {/* Spreadsheet-Style Line Items Table */}
            <div className="p-6">
              <div className="overflow-visible rounded-lg border border-default-200 dark:border-gray-700">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-default-100 dark:bg-gray-900/50">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-12">
                        #
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-[30rem]">
                        Account
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-24">
                        {isGreenTarget ? "Chq No" : "Reference"}
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-32">
                        Debit ($)
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-32">
                        Credit ($)
                      </th>
                      <th className="px-3 py-2.5 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default-100 dark:divide-gray-800 bg-white dark:bg-gray-800">
                    {formData.lines.map((line, index) => (
                      <tr
                        key={index}
                        className="group hover:bg-default-50/50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        {/* Line Number */}
                        <td className="px-3 py-1 text-sm text-default-500 dark:text-gray-400">
                          {String(line.line_number).padStart(2, "0")}
                        </td>

                        {/* Account Code */}
                        <td className="px-1 py-1">
                          <div>
                            <AccountCodeCombobox
                              value={line.account_code}
                              accounts={allAccountCodes}
                              company={company}
                              onChange={(value: string) =>
                                handleLineChange(index, "account_code", value)
                              }
                              onAddAccount={
                                isGreenTarget
                                  ? undefined
                                  : (query: string) =>
                                      handleOpenQuickAddAccount(index, query)
                              }
                              disabled={isSaving}
                              hierarchical
                              favouriteCodes={
                                isGreenTarget ? undefined : favouriteCodes
                              }
                              pendingFavouriteCodes={
                                isGreenTarget
                                  ? undefined
                                  : pendingFavouriteCodes
                              }
                              onToggleFavourite={
                                isGreenTarget ? undefined : toggleFavourite
                              }
                            />
                            {isGreenTarget &&
                              line.account_code === "CD_SD" && (
                                <GTJournalDebtorIdentitySelector
                                  lineNumber={line.line_number}
                                  value={line.debtor_subledger_code}
                                  description={
                                    line.debtor_subledger_description
                                  }
                                  entryDate={formData.entry_date}
                                  disabled={isSaving}
                                  onChange={(
                                    code: string,
                                    description: string
                                  ): void =>
                                    handleDebtorSubledgerChange(
                                      index,
                                      code,
                                      description
                                    )
                                  }
                                />
                              )}
                          </div>
                        </td>

                        {/* General line reference / GT cheque reference */}
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={
                              isGreenTarget
                                ? line.cheque_reference
                                : line.reference
                            }
                            onChange={(e) =>
                              handleLineChange(
                                index,
                                isGreenTarget
                                  ? "cheque_reference"
                                  : "reference",
                                e.target.value
                              )
                            }
                            onFocus={() => setFocusedCell({ row: index, col: "reference" })}
                            onBlur={() => setFocusedCell(null)}
                            disabled={isSaving}
                            placeholder="Chq No"
                            className={`w-full px-2 py-1.5 text-sm bg-transparent border-0 rounded placeholder:text-gray-400 dark:placeholder:text-gray-500 text-default-900 dark:text-gray-100 disabled:cursor-not-allowed ${
                              focusedCell?.row === index && focusedCell?.col === "reference"
                                ? "ring-1 ring-sky-500 bg-white dark:bg-gray-700"
                                : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                            }`}
                          />
                        </td>

                        {/* Particulars */}
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={line.particulars}
                            onChange={(e) =>
                              handleLineChange(index, "particulars", e.target.value)
                            }
                            onFocus={() => setFocusedCell({ row: index, col: "particulars" })}
                            onBlur={() => setFocusedCell(null)}
                            disabled={isSaving}
                            placeholder="Description"
                            className={`w-full px-2 py-1.5 text-sm bg-transparent border-0 rounded placeholder:text-gray-400 dark:placeholder:text-gray-500 text-default-900 dark:text-gray-100 disabled:cursor-not-allowed ${
                              focusedCell?.row === index && focusedCell?.col === "particulars"
                                ? "ring-1 ring-sky-500 bg-white dark:bg-gray-700"
                                : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                            }`}
                          />
                        </td>

                        {/* Debit Amount */}
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.debit_amount}
                            onChange={(e) =>
                              handleLineChange(index, "debit_amount", e.target.value)
                            }
                            onFocus={() => setFocusedCell({ row: index, col: "debit" })}
                            onBlur={(e) => {
                              setFocusedCell(null);
                              handleLineChange(index, "debit_amount", formatAmount(e.target.value));
                            }}
                            disabled={isSaving}
                            placeholder="0.00"
                            className={`w-full px-2 py-1.5 text-sm text-right bg-transparent border-0 rounded placeholder:text-gray-400 dark:placeholder:text-gray-500 text-default-900 dark:text-gray-100 disabled:cursor-not-allowed ${
                              focusedCell?.row === index && focusedCell?.col === "debit"
                                ? "ring-1 ring-sky-500 bg-white dark:bg-gray-700"
                                : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                            }`}
                          />
                        </td>

                        {/* Credit Amount */}
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.credit_amount}
                            onChange={(e) =>
                              handleLineChange(index, "credit_amount", e.target.value)
                            }
                            onFocus={() => setFocusedCell({ row: index, col: "credit" })}
                            onBlur={(e) => {
                              setFocusedCell(null);
                              handleLineChange(index, "credit_amount", formatAmount(e.target.value));
                            }}
                            disabled={isSaving}
                            placeholder="0.00"
                            className={`w-full px-2 py-1.5 text-sm text-right bg-transparent border-0 rounded placeholder:text-gray-400 dark:placeholder:text-gray-500 text-default-900 dark:text-gray-100 disabled:cursor-not-allowed ${
                              focusedCell?.row === index && focusedCell?.col === "credit"
                                ? "ring-1 ring-sky-500 bg-white dark:bg-gray-700"
                                : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                            }`}
                          />
                        </td>

                        {/* Delete Button */}
                        <td className="px-1 py-1 text-center">
                          {formData.lines.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeLine(index)}
                              disabled={isSaving}
                              className="opacity-0 group-hover:opacity-100 text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-opacity p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20"
                              title="Remove line"
                            >
                              <IconTrash size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-default-100 dark:bg-gray-900/50">
                      <td colSpan={4} className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={addLine}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <IconPlus size={16} />
                          Add Line
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-sm font-semibold text-default-900 dark:text-gray-100">
                          {totals.totalDebit.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-sm font-semibold text-default-900 dark:text-gray-100">
                          {totals.totalCredit.toFixed(2)}
                        </span>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Balance Indicator */}
              <div className="mt-4 flex items-center justify-end gap-4">
                <div
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                    isBalanced
                      ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                  }`}
                >
                  {isBalanced ? (
                    <>
                      <IconCheck size={18} />
                      <span>Balanced</span>
                    </>
                  ) : (
                    <>
                      <span>Out of Balance: </span>
                      <span className="font-bold">{difference.toFixed(2)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="px-6 py-4 flex justify-between items-center border-t border-default-200 dark:border-gray-700 bg-default-50/50 dark:bg-gray-900/30">
              <div>
                {isEditMode &&
                  entryStatus !== "cancelled" &&
                  formData.entry_type !== LEGACY_IMPORT_ENTRY_TYPE &&
                  !isGreenTarget && (
                    <Button
                      type="button"
                      color="rose"
                      variant="outline"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isSaving}
                      icon={IconTrash}
                      iconPosition="left"
                    >
                      Delete
                    </Button>
                  )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="filled"
                  color="sky"
                  icon={IconDeviceFloppy}
                  iconPosition="left"
                  disabled={isSaving || !isFormChanged || !isBalanced}
                >
                  {isEditMode ? "Update" : "Save"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Dialogs */}
      {/* Quick-add creates Tien Hock account codes only. Green Target account
          codes are maintained from Accounting -> Chart of Accounts. */}
      {!isGreenTarget && (
        <QuickAddAccountCodeModal
          isOpen={quickAddTargetLineIndex !== null}
          initialQuery={quickAddInitialQuery}
          existingAccountCodes={allAccountCodes}
          ledgerTypes={ledgerTypes}
          ledgerTypesLoading={ledgerTypesLoading}
          onClose={handleCloseQuickAddAccount}
          onCreated={handleQuickAddAccountCreated}
        />
      )}

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Journal Entry"
        message={`Are you sure you want to delete entry "${formData.reference_no}"? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
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

export default JournalEntryPage;
