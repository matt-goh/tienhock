import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
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

const identityLabel = (
  identity: GreenTargetDebtorSubledgerIdentity
): string =>
  `${identity.code} - ${identity.description} (masuk ke ${identity.control_account_code})`;

const errorMessage = (error: unknown): string => {
  if (!error || typeof error !== "object") return "Ralat tidak diketahui";
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
    "Ralat tidak diketahui"
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

type CodeAvailability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; takenBy: string };

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

  // Advisory collision check on the prefilled code. The server still rejects a
  // duplicate, but the user should see it before pressing save.
  useEffect((): (() => void) => {
    const code = newCode.trim().toUpperCase();
    if (!isCreatingNewIdentity || !code) {
      setCodeAvailability({ state: "idle" });
      return (): void => undefined;
    }

    let isCurrent = true;
    setCodeAvailability({ state: "checking" });
    const timer = window.setTimeout((): void => {
      const checkCode = async (): Promise<void> => {
        try {
          const params = new URLSearchParams({ search: code, limit: "20" });
          const rows = await api.get<GreenTargetDebtorSubledgerIdentity[]>(
            `${DEBTOR_SUBLEDGER_ENDPOINT}?${params.toString()}`
          );
          if (!isCurrent) return;
          const clash =
            rows.find(
              (row: GreenTargetDebtorSubledgerIdentity): boolean =>
                row.code.toUpperCase() === code
            ) || null;
          setCodeAvailability(
            clash
              ? { state: "taken", takenBy: clash.description }
              : { state: "available" }
          );
        } catch (checkError: unknown) {
          console.error("Failed to check GT identity code:", checkError);
          if (isCurrent) setCodeAvailability({ state: "idle" });
        }
      };
      void checkCode();
    }, 300);

    return (): void => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [isCreatingNewIdentity, newCode]);

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
        name: identityLabel(identity),
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
        name: `${debtorAccountCode} - identiti dipilih`,
      });
    }
    return options;
  }, [debtorAccountCode, identities]);

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
          "Pilih identiti penghutang untuk invois ini, atau tandakan Cipta identiti CD/SD baharu."
        );
      }
      return existingCode;
    }

    const code = newCode.trim().toUpperCase();
    const description = newDescription.trim();
    if (!code || !description) {
      const message = "Kod dan nama identiti diperlukan.";
      setCreateError(message);
      throw new Error(message);
    }
    if (!dateIssued) {
      const message = "Pilih tarikh invois sebelum mencipta identiti.";
      setCreateError(message);
      throw new Error(message);
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
      throw new Error(message);
    } finally {
      setIsCreating(false);
    }
  }, [
    dateIssued,
    debtorAccountCode,
    isCreatingNewIdentity,
    newCode,
    newDescription,
    onDebtorChange,
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

  const body: React.ReactNode = (
    <div className="space-y-4">
      <div>
        <span className="block text-sm font-medium text-default-700 dark:text-gray-200">
          Identiti Penghutang <span className="text-rose-500">*</span>
        </span>
        <Checkbox
          checked={isCreatingNewIdentity}
          onChange={toggleCreateIdentity}
          disabled={identityLocked || isCreating || !customerId}
          size={18}
          className="mt-2"
          label="Cipta identiti CD/SD baharu untuk pelanggan ini"
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
                Kod Identiti
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
                className="mt-1 block w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
              />
            </div>
            <div>
              <label
                htmlFor="gt-new-debtor-description"
                className="block text-xs font-medium text-default-600 dark:text-gray-300"
              >
                Nama dalam jadual penghutang (Trade Debtors)
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

          <div className="min-h-5 text-xs">
            {codeAvailability.state === "taken" ? (
              <span className="text-rose-700 dark:text-rose-300">
                {previewCode} sudah digunakan oleh {codeAvailability.takenBy}.
                Sila ubah kod sebelum menyimpan.
              </span>
            ) : (
              <span className="text-default-600 dark:text-gray-300">
                {previewCode || "Identiti ini"} akan dicipta semasa menyimpan,
                berkuat kuasa {dateIssued || "tarikh invois"}, dan masuk ke
                CD_SD dalam lejar am.
                {codeAvailability.state === "available" && " Kod ini kosong."}
              </span>
            )}
          </div>

          {createError && (
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
                ? "Mencari identiti penghutang..."
                : "Cari kod penghutang atau nama pelanggan..."
            }
            disabled={identityLocked}
            mode="single"
            maxVisibleOptions={DEBTOR_SEARCH_LIMIT}
          />

          <div className="min-h-5 text-xs">
            {customerDefaultLoading ? (
              <span className="text-default-500 dark:text-gray-400">
                Memuatkan identiti lalai pelanggan...
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
                  ? `${debtorAccountCode} tidak boleh dipilih untuk tarikh invois ini.`
                  : selectedControlAccount
                  ? `${debtorAccountCode} masuk ke ${selectedControlAccount} dalam lejar am.`
                  : `Menentukan ke mana ${debtorAccountCode} masuk dalam lejar am...`}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                Pilih identiti pelanggan yang perlu dipaparkan dalam jadual
                penghutang (Trade Debtors).
              </span>
            )}
            {searchFailed && (
              <span className="ml-2 text-rose-700 dark:text-rose-300">
                Carian identiti tidak dapat dimuatkan.
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
          Perakaunan
        </h2>
        <p className="text-xs text-default-500 dark:text-gray-400">
          Pilih identiti penghutang dan agihkan jumlah invois kepada baris
          jurnal hasilnya.
        </p>
      </div>
      {body}
    </div>
  );
});

export default GTInvoiceAccountFields;
