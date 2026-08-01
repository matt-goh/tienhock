// src/components/GreenTarget/GTInvoiceAccountFields.tsx
//
// The accounting block shared by every Green Target invoice-creation screen
// (the full invoice form and the rental quick-create modal), so both screens
// store the same two account snapshots and the `S` journal posts identically
// from either entry point: DR the receivable / CR the revenue, no tax line.
//
// It follows the LEGACY split, measured from the Jan-Jun import:
//   * A customer with NO named trade-debtor account is a sundry / counter
//     customer and posts straight to the CD_SD control. All 1,011 imported
//     `#/#` counter invoices did exactly this, and not one of the 746 CD_SD
//     children carries a Jan-Jun journal line - those names lived in a
//     separate trade-debtors listing, outside the ledger.
//   * Only a named credit customer (the ~11 accounts used by the `I#/#`
//     family) posts to its own account.
// So there is nothing to key and nothing to create: the field is informational
// unless the user deliberately assigns a named account. No account is ever
// auto-created, and no customer name is ever auto-matched (handover R6).
//
// Revenue is a one-click pill row defaulting to TGA.
import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { IconPencil } from "@tabler/icons-react";
import { FormCombobox, SelectOption } from "../FormComponents";
import { api } from "../../routes/utils/api";

/** The only revenue accounts a NEW Green Target invoice may use. */
export const GT_REVENUE_ACCOUNTS = ["TGA", "TGB", "WS_OTH"] as const;

export type GTRevenueAccountCode = (typeof GT_REVENUE_ACCOUNTS)[number];

/**
 * Measured on the frozen import: TGA is credited by 928 revenue-crediting
 * legacy journals, TGB by 106 and WS_OTH by 61 (legacy-only WS_OTH4 by 6, and
 * it is never offered). A static constant, not a runtime query - the import
 * cannot change, and deriving it from live invoices would feed this default
 * back into itself.
 */
export const GT_DEFAULT_REVENUE_ACCOUNT: GTRevenueAccountCode = "TGA";

export const GT_REVENUE_ACCOUNT_LABELS: Record<
  GTRevenueAccountCode,
  { title: string; description: string }
> = {
  TGA: { title: "TGA", description: "Tong A / general rental income" },
  TGB: { title: "TGB", description: "Tong B rental income" },
  WS_OTH: { title: "WS_OTH", description: "Other sales" },
};

/** The Green Target sundry-debtor control: the legacy counter-sale receivable. */
export const GT_SUNDRY_DEBTOR_ACCOUNT = "CD_SD";

const DEBTOR_ACCOUNTS_ENDPOINT =
  "/greentarget/api/account-codes?flat=true&ledger_type=TD&is_active=true";
const DEBTOR_OPTIONS_PAGE_SIZE = 50;

export interface GTDebtorAccount {
  code: string;
  description: string;
  ledger_type: string | null;
  parent_code: string | null;
  sort_order: number;
  is_active: boolean;
}

/**
 * Load Green Target's active trade-debtor LEAF accounts once, for the rare
 * case where the user deliberately assigns a named account. The CD_SD control
 * and the top-level DEBTOR control are excluded: CD_SD is offered as its own
 * explicit "sundry" choice rather than as a list entry.
 */
export const useGTDebtorAccounts = (): {
  accounts: GTDebtorAccount[];
  options: SelectOption[];
  loading: boolean;
} => {
  const [accounts, setAccounts] = useState<GTDebtorAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect((): (() => void) => {
    let isCurrentRequest = true;

    const fetchAccounts = async (): Promise<void> => {
      try {
        const rows = await api.get<GTDebtorAccount[]>(DEBTOR_ACCOUNTS_ENDPOINT);
        if (!isCurrentRequest) return;
        setAccounts(
          rows.filter(
            (account: GTDebtorAccount): boolean =>
              account.code !== GT_SUNDRY_DEBTOR_ACCOUNT &&
              account.parent_code !== null
          )
        );
      } catch (fetchError: unknown) {
        console.error("Failed to load GT debtor accounts:", fetchError);
        if (isCurrentRequest) {
          toast.error("Failed to load trade debtor accounts");
        }
      } finally {
        if (isCurrentRequest) setLoading(false);
      }
    };

    void fetchAccounts();
    return (): void => {
      isCurrentRequest = false;
    };
  }, []);

  const options: SelectOption[] = useMemo(
    (): SelectOption[] =>
      accounts.map(
        (account: GTDebtorAccount): SelectOption => ({
          id: account.code,
          name: `${account.code} - ${account.description}`,
        })
      ),
    [accounts]
  );

  return { accounts, options, loading };
};

interface GTInvoiceAccountFieldsProps {
  /** The selected customer, or null while none is chosen. */
  customerId: number | null;
  /** The customer's saved named account, or null when they are sundry. */
  customerDefaultCode: string | null;
  /** "" or "CD_SD" both mean sundry: the server posts to CD_SD. */
  debtorAccountCode: string;
  revenueAccountCode: GTRevenueAccountCode | "";
  onDebtorChange: (accountCode: string) => void;
  onRevenueChange: (accountCode: GTRevenueAccountCode) => void;
  disabled?: boolean;
  /**
   * True while the caller is still fetching `customerDefaultCode`. Stops the
   * field flashing "Sundry" before the answer lands.
   */
  customerDefaultLoading?: boolean;
  /** "panel" for the full form, "plain" inside the rental quick-create modal. */
  variant?: "panel" | "plain";
}

const GTInvoiceAccountFields: React.FC<GTInvoiceAccountFieldsProps> = ({
  customerId,
  customerDefaultCode,
  debtorAccountCode,
  revenueAccountCode,
  onDebtorChange,
  onRevenueChange,
  disabled = false,
  customerDefaultLoading = false,
  variant = "panel",
}) => {
  const { accounts, options, loading } = useGTDebtorAccounts();
  const [debtorQuery, setDebtorQuery] = useState<string>("");
  const [showPicker, setShowPicker] = useState<boolean>(false);

  const isSundry: boolean =
    !debtorAccountCode || debtorAccountCode === GT_SUNDRY_DEBTOR_ACCOUNT;
  const selectedAccount: GTDebtorAccount | undefined = accounts.find(
    (account: GTDebtorAccount): boolean => account.code === debtorAccountCode
  );

  const debtorSummary: React.ReactNode = (
    <div className="space-y-1">
      <p className="block text-sm font-medium text-default-700 dark:text-gray-200">
        Trade Debtor Account
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium text-default-900 dark:text-gray-100">
          {isSundry ? GT_SUNDRY_DEBTOR_ACCOUNT : debtorAccountCode}
        </span>
        <span className="text-sm text-default-500 dark:text-gray-400">
          {isSundry
            ? "Sundry / counter customer"
            : selectedAccount?.description || ""}
        </span>
        <button
          type="button"
          onClick={(): void => setShowPicker(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700 disabled:opacity-60 dark:text-sky-400 dark:hover:text-sky-300"
        >
          <IconPencil size={14} />
          {isSundry ? "Assign a named account" : "Change"}
        </button>
      </div>
      <p className="text-xs text-default-500 dark:text-gray-400">
        {isSundry
          ? "Posts to CD_SD, the same as every counter sale in the legacy ledger. Nothing to key."
          : customerDefaultCode === debtorAccountCode
          ? "Customer's named account, applied automatically."
          : "Named account chosen for this invoice only."}
      </p>
    </div>
  );

  const debtorPicker: React.ReactNode = (
    <div className="space-y-2">
      <FormCombobox
        name="debtor_account_code"
        label="Trade Debtor Account"
        value={debtorAccountCode || undefined}
        onChange={(selectedId: string | string[] | null): void => {
          onDebtorChange(typeof selectedId === "string" ? selectedId : "");
          setDebtorQuery("");
          setShowPicker(false);
        }}
        options={options}
        query={debtorQuery}
        setQuery={setDebtorQuery}
        placeholder={
          loading ? "Loading debtor accounts..." : "Search debtor code or name..."
        }
        disabled={disabled || loading}
        mode="single"
        maxVisibleOptions={DEBTOR_OPTIONS_PAGE_SIZE}
      />
      <button
        type="button"
        onClick={(): void => {
          onDebtorChange("");
          setDebtorQuery("");
          setShowPicker(false);
        }}
        className="text-xs font-medium text-default-500 hover:text-default-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Cancel - keep this a sundry counter sale (CD_SD)
      </button>
    </div>
  );

  const debtorField: React.ReactNode = !customerId ? (
    <p className="text-xs text-default-500 dark:text-gray-400">
      Select a customer to resolve the trade debtor account.
    </p>
  ) : customerDefaultLoading ? (
    <p className="text-xs text-default-500 dark:text-gray-400">
      Resolving the trade debtor account...
    </p>
  ) : showPicker ? (
    debtorPicker
  ) : (
    debtorSummary
  );

  const body: React.ReactNode = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>{debtorField}</div>
      <div className="space-y-2">
        <p className="block text-sm font-medium text-default-700 dark:text-gray-200">
          Revenue Account <span className="text-red-500">*</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {GT_REVENUE_ACCOUNTS.map((account: GTRevenueAccountCode) => {
            const active: boolean = revenueAccountCode === account;
            return (
              <button
                key={account}
                type="button"
                onClick={(): void => onRevenueChange(account)}
                disabled={disabled}
                aria-pressed={active}
                title={GT_REVENUE_ACCOUNT_LABELS[account].description}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors select-none whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? "border-sky-500 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                    : "border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700"
                }`}
              >
                <span className="font-semibold">
                  {GT_REVENUE_ACCOUNT_LABELS[account].title}
                </span>
                <span
                  className={
                    active
                      ? "text-sky-600/80 dark:text-sky-300/80"
                      : "text-default-500 dark:text-gray-400"
                  }
                >
                  {GT_REVENUE_ACCOUNT_LABELS[account].description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (variant === "plain") {
    return <div className="space-y-3">{body}</div>;
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-default-800 dark:text-gray-100">
          Accounting
        </h2>
        <p className="text-xs text-default-500 dark:text-gray-400">
          These selections create the invoice journal automatically: debit the
          trade debtor, credit the revenue account.
        </p>
      </div>
      {body}
    </div>
  );
};

export default GTInvoiceAccountFields;
