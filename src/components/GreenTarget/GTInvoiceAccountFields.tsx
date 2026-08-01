import React, {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconPlus, IconX } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../Button";
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

const identityLabel = (
  identity: GreenTargetDebtorSubledgerIdentity
): string =>
  `${identity.code} - ${identity.description} (posts to ${identity.control_account_code})`;

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

const GTInvoiceAccountFields: React.FC<GTInvoiceAccountFieldsProps> = ({
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
}) => {
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

  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [newCode, setNewCode] = useState<string>("");
  const [newDescription, setNewDescription] = useState<string>("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  useEffect((): void => {
    if (!debtorAccountCode && customerDefaultCode) {
      onDebtorChange(customerDefaultCode);
    }
  }, [customerDefaultCode, debtorAccountCode, onDebtorChange]);

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
        console.error("Failed to load selected GT debtor identity:", selectedError);
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
      !options.some((option: SelectOption): boolean => option.id === debtorAccountCode)
    ) {
      options.unshift({
        id: debtorAccountCode,
        name: `${debtorAccountCode} - selected identity`,
      });
    }
    return options;
  }, [debtorAccountCode, identities]);

  const openCreateIdentity = (): void => {
    setNewCode("");
    setNewDescription(customerName?.trim() || "");
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const closeCreateIdentity = (): void => {
    if (!isCreating) setIsCreateOpen(false);
  };

  const createIdentity = async (): Promise<void> => {
    const code = newCode.trim();
    const description = newDescription.trim();
    if (!code || !description) {
      setCreateError("Code and description are required.");
      return;
    }
    if (!dateIssued) {
      setCreateError("Select the invoice date before creating an identity.");
      return;
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
      onDebtorChange(identity.code);
      setDebtorQuery("");
      setIsCreateOpen(false);
      toast.success(`CD/SD identity ${identity.code} created`);
    } catch (creationError: unknown) {
      const message = errorMessage(creationError);
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const selectedControlAccount = selectedIdentity?.control_account_code || null;
  const selectionUnavailable =
    selectedIdentityUnavailable ||
    (selectedIdentity !== null && !selectedIdentity.is_selectable);

  const body: React.ReactNode = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <FormCombobox
          name="debtor_account_code"
          label="Trade Debtor Identity"
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
              ? "Searching debtor identities..."
              : "Search debtor code or customer name..."
          }
          disabled={disabled || debtorDisabled || customerDefaultLoading}
          required
          mode="single"
          maxVisibleOptions={DEBTOR_SEARCH_LIMIT}
        />
        <Button
          type="button"
          variant="outline"
          color="sky"
          size="sm"
          icon={IconPlus}
          iconSize={15}
          onClick={openCreateIdentity}
          disabled={
            disabled || debtorDisabled || customerDefaultLoading || !customerId || !dateIssued
          }
          className="mb-0.5 whitespace-nowrap"
        >
          Create CD/SD Identity
        </Button>
      </div>

      <div className="min-h-5 text-xs">
        {customerDefaultLoading ? (
          <span className="text-default-500 dark:text-gray-400">
            Loading the customer's default identity...
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
              ? `${debtorAccountCode} is not selectable for the invoice date.`
              : selectedControlAccount
              ? `${debtorAccountCode} posts to ${selectedControlAccount} in the general ledger.`
              : `Resolving where ${debtorAccountCode} posts in the general ledger...`}
          </span>
        ) : (
          <span className="text-amber-700 dark:text-amber-300">
            Select or create the customer identity that must appear in the
            Trade Debtors sub-schedule.
          </span>
        )}
        {searchFailed && (
          <span className="ml-2 text-rose-700 dark:text-rose-300">
            Identity search could not be loaded.
          </span>
        )}
      </div>

      <GTRevenueSplitEditor
        totalAmount={invoiceTotal}
        splits={revenueSplits}
        onChange={onRevenueSplitsChange}
        disabled={disabled || revenueDisabled}
      />
    </div>
  );

  return (
    <>
      {variant === "plain" ? (
        body
      ) : (
        <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-default-800 dark:text-gray-100">
              Accounting
            </h2>
            <p className="text-xs text-default-500 dark:text-gray-400">
              Choose the Trade Debtors identity and allocate the invoice total
              to its revenue journal lines.
            </p>
          </div>
          {body}
        </div>
      )}

      <Transition appear show={isCreateOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[70]" onClose={closeCreateIdentity}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel
                  className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
                  onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>): void => {
                    if (
                      event.key === "Enter" &&
                      !isCreating &&
                      newCode.trim() &&
                      newDescription.trim()
                    ) {
                      event.preventDefault();
                      void createIdentity();
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <DialogTitle className="text-base font-semibold text-default-900 dark:text-gray-100">
                        Create CD/SD Identity
                      </DialogTitle>
                      <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                        This name will appear in the Trade Debtors sub-schedule
                        and will post to the CD_SD control account.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeCreateIdentity}
                      disabled={isCreating}
                      aria-label="Close create identity dialog"
                      className="rounded-lg p-1 text-default-400 hover:bg-default-100 hover:text-default-700 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    >
                      <IconX size={18} />
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label
                        htmlFor="gt-new-debtor-code"
                        className="block text-sm font-medium text-default-700 dark:text-gray-200"
                      >
                        Identity Code <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="gt-new-debtor-code"
                        type="text"
                        value={newCode}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                          setNewCode(event.target.value.toUpperCase())
                        }
                        maxLength={50}
                        disabled={isCreating}
                        placeholder="e.g. CD-NEWCUSTOMER"
                        className="mt-1 block w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="gt-new-debtor-description"
                        className="block text-sm font-medium text-default-700 dark:text-gray-200"
                      >
                        Customer / Identity Name{" "}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="gt-new-debtor-description"
                        type="text"
                        value={newDescription}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                          setNewDescription(event.target.value)
                        }
                        maxLength={255}
                        disabled={isCreating}
                        className="mt-1 block w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>

                    <div className="rounded-lg bg-default-50 px-3 py-2 text-xs dark:bg-gray-900/40">
                      <span className="text-default-500 dark:text-gray-400">
                        Effective from
                      </span>
                      <span className="ml-2 font-medium text-default-800 dark:text-gray-100">
                        {dateIssued || "Select the invoice date first"}
                      </span>
                    </div>

                    {createError && (
                      <p className="text-sm text-rose-700 dark:text-rose-300">
                        {createError}
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={closeCreateIdentity}
                      disabled={isCreating}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="filled"
                      color="sky"
                      size="sm"
                      onClick={(): void => {
                        void createIdentity();
                      }}
                      disabled={isCreating || !newCode.trim() || !newDescription.trim()}
                    >
                      {isCreating ? "Creating..." : "Create and Select"}
                    </Button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

export default GTInvoiceAccountFields;
