import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  IconAlertTriangle,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";
import Checkbox from "../Checkbox";
import { FormCombobox, SelectOption } from "../FormComponents";
import { api } from "../../routes/utils/api";
import type {
  GreenTargetDebtorSubledgerIdentity,
  GreenTargetRevenueAccountCode,
  GreenTargetRevenueSplit,
} from "../../types/greenTargetTypes";
import GTRevenueSplitEditor from "./GTRevenueSplitEditor";

export const GT_REVENUE_ACCOUNTS = ["TGA", "TGB", "WS_OTH"] as const;
export type GTRevenueAccountCode = GreenTargetRevenueAccountCode;
export const GT_DEFAULT_REVENUE_ACCOUNT: GTRevenueAccountCode = "TGA";

const DEBTOR_SUBLEDGER_ENDPOINT =
  "/greentarget/api/account-codes/debtor-subledger";
const DEBTOR_AVAILABILITY_ENDPOINT = `${DEBTOR_SUBLEDGER_ENDPOINT}/availability`;
const DEBTOR_SEARCH_LIMIT = 50;
const IDENTITY_CODE_PREFIX = "CD-";
const MAX_IDENTITY_CODE_LENGTH = 50;

/**
 * The keyed convention for a new counter customer is `CD-` plus the first word
 * of its name (CD-MS, CD-DCH, CD-ENRICH, CD-ZEXIE). It is only a starting
 * point: the field stays editable and the code is checked for a collision
 * before the invoice is saved.
 */
export const deriveGTIdentityCode = (
  customerName: string | null | undefined
): string => {
  const words = String(customerName || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word: string): boolean => word.length > 0);
  if (words.length === 0) return "";
  const stem = words[0].length > 1 ? words[0] : words.join("");
  return `${IDENTITY_CODE_PREFIX}${stem}`.slice(0, MAX_IDENTITY_CODE_LENGTH);
};

const errorMessage = (error: unknown): string => {
  if (!error || typeof error !== "object") return "Unknown error";
  const candidate = error as {
    message?: string;
    data?: { message?: string; error?: string };
    response?: { data?: { message?: string; error?: string } };
  };
  return (
    candidate.response?.data?.message ||
    candidate.response?.data?.error ||
    candidate.data?.message ||
    candidate.data?.error ||
    candidate.message ||
    "Unknown error"
  );
};

const mergeIdentities = (
  rows: ReadonlyArray<GreenTargetDebtorSubledgerIdentity>
): GreenTargetDebtorSubledgerIdentity[] => {
  const byCode = new Map<string, GreenTargetDebtorSubledgerIdentity>();
  rows.forEach((row: GreenTargetDebtorSubledgerIdentity): void => {
    if (!byCode.has(row.code)) byCode.set(row.code, row);
  });
  return Array.from(byCode.values());
};

interface DebtorCodeAvailabilityResponse {
  code: string;
  available: boolean;
  reason?: "taken" | "invalid";
  message?: string;
  taken_by?: string;
  source?: "identity" | "account";
}

/**
 * `unknown` means the check itself could not run. It never blocks the save --
 * the POST is the real guard, so a check outage must not stop invoicing.
 */
type CodeAvailability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; takenBy: string; source: "identity" | "account" }
  | { state: "invalid"; message: string }
  | { state: "unknown" };

const readAvailability = (
  response: DebtorCodeAvailabilityResponse
): CodeAvailability => {
  if (response.available) return { state: "available" };
  if (response.reason === "invalid") {
    return {
      state: "invalid",
      message: response.message || "This identity code is invalid.",
    };
  }
  return {
    state: "taken",
    takenBy: response.taken_by || "the existing identity",
    source: response.source === "account" ? "account" : "identity",
  };
};

const takenMessage = (
  code: string,
  availability: Extract<CodeAvailability, { state: "taken" }>,
  t: (key: string, options?: Record<string, unknown>) => string
): string =>
  availability.source === "account"
    ? t(
        "{{code}} is already used by {{takenBy}} (existing account code). Please change the code before saving.",
        { code, takenBy: availability.takenBy }
      )
    : t("{{code}} is already used by {{takenBy}}. Please change the code before saving.", {
        code,
        takenBy: availability.takenBy,
      });

/**
 * Imperative surface the invoice screens use at save time. A staged identity is
 * written only when the user actually submits the invoice, so abandoning the
 * form never leaves an unused name in the Trade Debtors sub-schedule.
 */
export interface GTInvoiceAccountFieldsHandle {
  /**
   * Creates the staged CD/SD identity when one is pending and resolves to the
   * debtor code the invoice must be saved with. Rejects with a user-facing
   * message when the identity cannot be resolved or created.
   */
  ensureDebtorIdentity: () => Promise<string>;
}

interface GTInvoiceAccountFieldsProps {
  customerId: number | null;
  customerName?: string | null;
  customerDefaultCode: string | null;
  debtorAccountCode: string;
  onDebtorChange: (accountCode: string) => void;
  dateIssued: string;
  invoiceTotal: number;
  revenueSplits: ReadonlyArray<GreenTargetRevenueSplit>;
  onRevenueSplitsChange: (splits: GreenTargetRevenueSplit[]) => void;
  disabled?: boolean;
  debtorDisabled?: boolean;
  revenueDisabled?: boolean;
  customerDefaultLoading?: boolean;
  variant?: "panel" | "plain";
}

const GTInvoiceAccountFields = forwardRef<
  GTInvoiceAccountFieldsHandle,
  GTInvoiceAccountFieldsProps
>(function GTInvoiceAccountFields(
  {
    customerId,
    customerName = null,
    customerDefaultCode,
    debtorAccountCode,
    onDebtorChange,
    dateIssued,
    invoiceTotal,
    revenueSplits,
    onRevenueSplitsChange,
    disabled = false,
    debtorDisabled = false,
    revenueDisabled = false,
    customerDefaultLoading = false,
    variant = "panel",
  }: GTInvoiceAccountFieldsProps,
  ref: React.ForwardedRef<GTInvoiceAccountFieldsHandle>
) {
  const { t } = useTranslation("greentarget");
  const [debtorQuery, setDebtorQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<
    GreenTargetDebtorSubledgerIdentity[]
  >([]);
  const [selectedIdentity, setSelectedIdentity] =
    useState<GreenTargetDebtorSubledgerIdentity | null>(null);
  const [selectedIdentityUnavailable, setSelectedIdentityUnavailable] =
    useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchFailed, setSearchFailed] = useState<boolean>(false);

  // A new identity is staged in the form and only written on save.
  const [isCreatingNewIdentity, setIsCreatingNewIdentity] =
    useState<boolean>(false);
  const [newCode, setNewCode] = useState<string>("");
  const [newDescription, setNewDescription] = useState<string>("");
  const [codeAvailability, setCodeAvailability] = useState<CodeAvailability>({
    state: "idle",
  });
  // Bumped to force a re-check of an unchanged code after a rejected save.
  const [availabilityNonce, setAvailabilityNonce] = useState<number>(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  const identityLocked: boolean =
    disabled || debtorDisabled || customerDefaultLoading;

  useEffect((): void => {
    if (!debtorAccountCode && customerDefaultCode) {
      onDebtorChange(customerDefaultCode);
    }
  }, [customerDefaultCode, debtorAccountCode, onDebtorChange]);

  // Decide once per customer whether this invoice needs a new identity. A
  // customer that already has a saved default never gets the creation form.
  const initialisedKeyRef = useRef<string | null>(null);
  useEffect((): void => {
    if (customerDefaultLoading) return;
    const key = `${customerId ?? ""}|${customerDefaultCode ?? ""}`;
    if (initialisedKeyRef.current === key) return;
    initialisedKeyRef.current = key;

    const hasIdentity: boolean =
      Boolean(String(customerDefaultCode || "").trim()) ||
      Boolean(String(debtorAccountCode || "").trim());
    setIsCreatingNewIdentity(
      Boolean(customerId) && !hasIdentity && !debtorDisabled
    );
    setNewCode(deriveGTIdentityCode(customerName));
    setNewDescription(String(customerName || "").trim());
    setCreateError(null);
  }, [
    customerDefaultCode,
    customerDefaultLoading,
    customerId,
    customerName,
    debtorAccountCode,
    debtorDisabled,
  ]);

  // A resolved identity always wins over a staged one: an invoice being edited
  // can load its saved debtor code after its customer id, and the customer's
  // default arrives asynchronously.
  useEffect((): void => {
    if (String(debtorAccountCode || "").trim()) setIsCreatingNewIdentity(false);
  }, [debtorAccountCode]);

  useEffect((): (() => void) => {
    let isCurrent = true;
    const timer = window.setTimeout((): void => {
      const loadIdentities = async (): Promise<void> => {
        setIsSearching(true);
        setSearchFailed(false);
        try {
          const params = new URLSearchParams({
            search: debtorQuery.trim(),
            limit: String(DEBTOR_SEARCH_LIMIT),
          });
          if (dateIssued) params.set("as_of", dateIssued);
          const rows = await api.get<GreenTargetDebtorSubledgerIdentity[]>(
            `${DEBTOR_SUBLEDGER_ENDPOINT}?${params.toString()}`
          );
          if (isCurrent) setSearchResults(rows);
        } catch (searchError: unknown) {
          console.error("Failed to search GT debtor identities:", searchError);
          if (isCurrent) {
            setSearchResults([]);
            setSearchFailed(true);
          }
        } finally {
          if (isCurrent) setIsSearching(false);
        }
      };
      void loadIdentities();
    }, debtorQuery ? 250 : 0);

    return (): void => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [dateIssued, debtorQuery]);

  useEffect((): (() => void) => {
    let isCurrent = true;
    if (!debtorAccountCode) {
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
        const params = new URLSearchParams({
          search: debtorAccountCode,
          limit: String(DEBTOR_SEARCH_LIMIT),
        });
        if (dateIssued) params.set("as_of", dateIssued);
        const rows = await api.get<GreenTargetDebtorSubledgerIdentity[]>(
          `${DEBTOR_SUBLEDGER_ENDPOINT}?${params.toString()}`
        );
        if (!isCurrent) return;
        const exactIdentity =
          rows.find(
            (row: GreenTargetDebtorSubledgerIdentity): boolean =>
              row.code === debtorAccountCode
          ) || null;
        setSelectedIdentity(exactIdentity);
        setSelectedIdentityUnavailable(exactIdentity === null);
      } catch (selectedError: unknown) {
        console.error(
          "Failed to load selected GT debtor identity:",
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
  }, [dateIssued, debtorAccountCode]);

  // Collision check on the staged code, answered by the exact-match endpoint
  // that applies the same rules the POST enforces. Results are cached per code
  // and only fetched after the user stops typing, so editing a code costs one
  // request and re-typing a code already seen costs none.
  const availabilityCacheRef = useRef<Map<string, CodeAvailability>>(new Map());
  useEffect((): (() => void) => {
    const code = newCode.trim().toUpperCase();
    if (!isCreatingNewIdentity || !code) {
      setCodeAvailability({ state: "idle" });
      return (): void => undefined;
    }

    const cached = availabilityCacheRef.current.get(code);
    if (cached) {
      setCodeAvailability(cached);
      return (): void => undefined;
    }

    let isCurrent = true;
    setCodeAvailability({ state: "checking" });
    const timer = window.setTimeout((): void => {
      const checkCode = async (): Promise<void> => {
        try {
          const params = new URLSearchParams({ code });
          const response = await api.get<DebtorCodeAvailabilityResponse>(
            `${DEBTOR_AVAILABILITY_ENDPOINT}?${params.toString()}`
          );
          const availability = readAvailability(response);
          availabilityCacheRef.current.set(code, availability);
          if (isCurrent) setCodeAvailability(availability);
        } catch (checkError: unknown) {
          console.error("Failed to check GT identity code:", checkError);
          if (isCurrent) setCodeAvailability({ state: "unknown" });
        }
      };
      void checkCode();
    }, 350);

    return (): void => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [availabilityNonce, isCreatingNewIdentity, newCode]);

  const identities: GreenTargetDebtorSubledgerIdentity[] = useMemo(
    (): GreenTargetDebtorSubledgerIdentity[] =>
      mergeIdentities([
        ...(selectedIdentity ? [selectedIdentity] : []),
        ...searchResults.filter(
          (identity: GreenTargetDebtorSubledgerIdentity): boolean =>
            identity.is_selectable
        ),
      ]),
    [searchResults, selectedIdentity]
  );

  const identityOptions: SelectOption[] = useMemo((): SelectOption[] => {
    const options = identities.map(
      (identity: GreenTargetDebtorSubledgerIdentity): SelectOption => ({
        id: identity.code,
        name: t(
          "{{code}} - {{description}} (maps to {{account}})",
          {
            code: identity.code,
            description: identity.description,
            account: identity.control_account_code,
          }
        ),
      })
    );
    if (
      debtorAccountCode &&
      !options.some(
        (option: SelectOption): boolean => option.id === debtorAccountCode
      )
    ) {
      options.unshift({
        id: debtorAccountCode,
        name: t("{{code}} - selected identity", {
          code: debtorAccountCode,
        }),
      });
    }
    return options;
  }, [debtorAccountCode, identities, t]);

  const toggleCreateIdentity = (checked: boolean): void => {
    setIsCreatingNewIdentity(checked);
    setCreateError(null);
    if (checked) {
      onDebtorChange("");
      if (!newCode.trim()) setNewCode(deriveGTIdentityCode(customerName));
      if (!newDescription.trim()) {
        setNewDescription(String(customerName || "").trim());
      }
    }
  };

  const ensureDebtorIdentity = useCallback(async (): Promise<string> => {
    if (!isCreatingNewIdentity) {
      const existingCode = String(debtorAccountCode || "").trim();
      if (!existingCode) {
        throw new Error(
          t(
            "Select a debtor identity for this invoice, or tick Create new CD/SD identity."
          )
        );
      }
      return existingCode;
    }

    const code = newCode.trim().toUpperCase();
    const description = newDescription.trim();
    if (!code || !description) {
      const message = t("Identity code and name are required.");
      setCreateError(message);
      throw new Error(message);
    }
    if (!dateIssued) {
      const message = t("Select the invoice date before creating the identity.");
      setCreateError(message);
      throw new Error(message);
    }
    // A known clash is refused here so the save never spends a round trip on a
    // code the user was already told is unusable. `checking`/`unknown` fall
    // through: the POST is transactional and reports the duplicate itself.
    if (codeAvailability.state === "taken") {
      const message = takenMessage(code, codeAvailability, t);
      setCreateError(message);
      throw new Error(message);
    }
    if (codeAvailability.state === "invalid") {
      setCreateError(codeAvailability.message);
      throw new Error(codeAvailability.message);
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const response = await api.post<{
        debtorAccount: GreenTargetDebtorSubledgerIdentity;
      }>(DEBTOR_SUBLEDGER_ENDPOINT, {
        code,
        description,
        effective_from: dateIssued,
      });
      const identity = response.debtorAccount;
      availabilityCacheRef.current.set(identity.code.toUpperCase(), {
        state: "taken",
        takenBy: identity.description,
        source: "identity",
      });
      setSelectedIdentity(identity);
      setSelectedIdentityUnavailable(false);
      setSearchResults((current: GreenTargetDebtorSubledgerIdentity[]) =>
        mergeIdentities([identity, ...current])
      );
      setIsCreatingNewIdentity(false);
      onDebtorChange(identity.code);
      return identity.code;
    } catch (creationError: unknown) {
      const message = errorMessage(creationError);
      setCreateError(message);
      // The server saw something the cached check did not (a code taken since,
      // or a rule the preview cannot model). Drop the stale answer and re-check
      // so the field shows the reason next to the input, not only in a toast.
      availabilityCacheRef.current.delete(code);
      setAvailabilityNonce((current: number): number => current + 1);
      throw new Error(message);
    } finally {
      setIsCreating(false);
    }
  }, [
    codeAvailability,
    dateIssued,
    debtorAccountCode,
    isCreatingNewIdentity,
    newCode,
    newDescription,
    onDebtorChange,
    t,
  ]);

  useImperativeHandle(
    ref,
    (): GTInvoiceAccountFieldsHandle => ({ ensureDebtorIdentity }),
    [ensureDebtorIdentity]
  );

  const selectedControlAccount = selectedIdentity?.control_account_code || null;
  const selectionUnavailable =
    selectedIdentityUnavailable ||
    (selectedIdentity !== null && !selectedIdentity.is_selectable);

  const previewCode: string = newCode.trim().toUpperCase();
  const codeRejected: boolean =
    codeAvailability.state === "taken" || codeAvailability.state === "invalid";

  const codeStatus: React.ReactNode = ((): React.ReactNode => {
    switch (codeAvailability.state) {
      case "checking":
        return (
          <span className="inline-flex items-center gap-1.5 text-default-500 dark:text-gray-400">
            <IconLoader2 size={14} className="animate-spin" />
            {t("Checking whether {{code}} is already used...", {
              code: previewCode,
            })}
          </span>
        );
      case "taken":
        return (
          <span className="inline-flex items-start gap-1.5 text-rose-700 dark:text-rose-300">
            <IconAlertTriangle size={14} className="mt-px shrink-0" />
            {takenMessage(previewCode, codeAvailability, t)}
          </span>
        );
      case "invalid":
        return (
          <span className="inline-flex items-start gap-1.5 text-rose-700 dark:text-rose-300">
            <IconAlertTriangle size={14} className="mt-px shrink-0" />
            {codeAvailability.message}
          </span>
        );
      case "available":
        return (
          <span className="inline-flex items-start gap-1.5 text-emerald-700 dark:text-emerald-300">
            <IconCheck size={14} className="mt-px shrink-0" />
            {t(
              "{{code}} is not used yet. This identity will be created on save, effective {{date}}, and posted to CD_SD in the general ledger.",
              {
                code: previewCode,
                date: dateIssued || t("invoice date"),
              }
            )}
          </span>
        );
      case "unknown":
        return (
          <span className="inline-flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
            <IconAlertTriangle size={14} className="mt-px shrink-0" />
            {t(
              "{{code}} could not be checked right now. The system will check again on save.",
              { code: previewCode }
            )}
          </span>
        );
      default:
        return (
          <span className="text-default-600 dark:text-gray-300">
            {t(
              "This identity will be created on save, effective {{date}}, and posted to CD_SD in the general ledger.",
              { date: dateIssued || t("invoice date") }
            )}
          </span>
        );
    }
  })();

  const body: React.ReactNode = (
    <div className="space-y-1.5">
      <div>
        <span className="block text-sm font-medium text-default-700 dark:text-gray-200">
          {t("Debtor Identity")} <span className="text-rose-500">*</span>
        </span>
        <Checkbox
          checked={isCreatingNewIdentity}
          onChange={toggleCreateIdentity}
          disabled={identityLocked || isCreating || !customerId}
          size={18}
          className="mt-2"
          label={t("Create a new CD/SD identity for this customer")}
        />
      </div>

      {isCreatingNewIdentity ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <div>
              <label
                htmlFor="gt-new-debtor-code"
                className="block text-xs font-medium text-default-600 dark:text-gray-300"
              >
                {t("Identity Code")}
              </label>
              <input
                id="gt-new-debtor-code"
                type="text"
                value={newCode}
                onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                  setNewCode(event.target.value.toUpperCase())
                }
                maxLength={MAX_IDENTITY_CODE_LENGTH}
                disabled={identityLocked || isCreating}
                placeholder="cth. CD-PELANGGANBAHARU"
                aria-invalid={codeRejected}
                aria-describedby="gt-new-debtor-code-status"
                className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-default-900 focus:outline-none focus:ring-1 disabled:opacity-60 dark:bg-gray-900/50 dark:text-gray-100 ${
                  codeRejected
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500 dark:border-rose-700"
                    : "border-default-300 focus:border-sky-500 focus:ring-sky-500 dark:border-gray-600"
                }`}
              />
            </div>
            <div>
              <label
                htmlFor="gt-new-debtor-description"
                className="block text-xs font-medium text-default-600 dark:text-gray-300"
              >
                {t("Name in the debtor schedule (Trade Debtors)")}
              </label>
              <input
                id="gt-new-debtor-description"
                type="text"
                value={newDescription}
                onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                  setNewDescription(event.target.value)
                }
                maxLength={255}
                disabled={identityLocked || isCreating}
                className="mt-1 block w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
              />
            </div>
          </div>

          <div
            id="gt-new-debtor-code-status"
            aria-live="polite"
            className="min-h-5 text-xs"
          >
            {codeStatus}
          </div>

          {createError && !codeRejected && (
            <p className="text-sm text-rose-700 dark:text-rose-300">
              {createError}
            </p>
          )}
        </div>
      ) : (
        <div>
          <FormCombobox
            name="debtor_account_code"
            label=""
            value={debtorAccountCode || undefined}
            onChange={(selected: string | string[] | null): void => {
              onDebtorChange(typeof selected === "string" ? selected : "");
              setDebtorQuery("");
            }}
            options={identityOptions}
            query={debtorQuery}
            setQuery={setDebtorQuery}
            placeholder={
              isSearching
                ? t("Searching for debtor identities...")
                : t("Search debtor code or customer name...")
            }
            disabled={identityLocked}
            mode="single"
            maxVisibleOptions={DEBTOR_SEARCH_LIMIT}
          />

          <div className="mt-2 min-h-5 text-xs">
            {customerDefaultLoading ? (
              <span className="text-default-500 dark:text-gray-400">
                {t("Loading the customer's default identity...")}
              </span>
            ) : debtorAccountCode ? (
              <span
                className={
                  selectionUnavailable
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-default-600 dark:text-gray-300"
                }
              >
                {selectionUnavailable
                  ? t("{{code}} cannot be selected for this invoice date.", {
                      code: debtorAccountCode,
                    })
                  : selectedControlAccount
                  ? t(
                      "{{code}} posts to {{account}} in the general ledger.",
                      {
                        code: debtorAccountCode,
                        account: selectedControlAccount,
                      }
                    )
                  : t(
                      "Determining where {{code}} posts in the general ledger...",
                      { code: debtorAccountCode }
                    )}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                {t(
                  "Select the customer identity to show in the debtor schedule (Trade Debtors)."
                )}
              </span>
            )}
            {searchFailed && (
              <span className="ml-2 text-rose-700 dark:text-rose-300">
                {t("The identity search could not be loaded.")}
              </span>
            )}
          </div>
        </div>
      )}

      <GTRevenueSplitEditor
        totalAmount={invoiceTotal}
        splits={revenueSplits}
        onChange={onRevenueSplitsChange}
        disabled={disabled || revenueDisabled}
      />
    </div>
  );

  if (variant === "plain") return <>{body}</>;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-default-800 dark:text-gray-100">
          {t("Accounting")}
        </h2>
        <p className="text-xs text-default-500 dark:text-gray-400">
          {t(
            "Select the debtor identity and allocate the invoice total across its revenue journal lines."
          )}
        </p>
      </div>
      {body}
    </div>
  );
});

export default GTInvoiceAccountFields;
