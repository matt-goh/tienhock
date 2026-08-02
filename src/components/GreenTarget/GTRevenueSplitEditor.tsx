import React, { useEffect, useId, useMemo, useRef } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import Button from "../Button";
import PillSelect, { PillSelectOption } from "../PillSelect";
import { toCents, toDollars } from "../../utils/moneyUtils";
import type {
  GreenTargetRevenueAccountCode,
  GreenTargetRevenueSplit,
  GreenTargetRevenueSplitAccountCode,
} from "../../types/greenTargetTypes";

const REVENUE_ACCOUNTS: ReadonlyArray<{
  code: GreenTargetRevenueAccountCode;
  label: string;
}> = [
  { code: "TGA", label: "TGA - Sewa tong A / hasil sewa am" },
  { code: "TGB", label: "TGB - Hasil sewa tong B" },
  { code: "WS_OTH", label: "WS_OTH - Jualan lain" },
];

const REVENUE_ACCOUNT_LABELS: Record<
  GreenTargetRevenueSplitAccountCode,
  string
> = {
  TGA: "TGA - Sewa tong A / hasil sewa am",
  TGB: "TGB - Hasil sewa tong B",
  WS_OTH: "WS_OTH - Jualan lain",
  WS_OTH4: "WS_OTH4 - Jualan lain (rekod lama)",
};

const safeCents = (amount: number): number =>
  Number.isFinite(amount) ? toCents(amount) : 0;

const normaliseAmount = (amount: number): number =>
  toDollars(Math.max(0, safeCents(amount)));

const formatCents = (cents: number): string => {
  const prefix = cents < 0 ? "-RM" : "RM";
  return `${prefix} ${toDollars(Math.abs(cents)).toFixed(2)}`;
};

const renumberSplits = (
  splits: ReadonlyArray<GreenTargetRevenueSplit>
): GreenTargetRevenueSplit[] =>
  splits.map(
    (
      split: GreenTargetRevenueSplit,
      index: number
    ): GreenTargetRevenueSplit => ({
      ...split,
      line_number: index + 1,
      amount: normaliseAmount(split.amount),
    })
  );

export interface GTRevenueSplitEditorProps {
  totalAmount: number;
  splits: ReadonlyArray<GreenTargetRevenueSplit>;
  onChange: (splits: GreenTargetRevenueSplit[]) => void;
  disabled?: boolean;
  className?: string;
  allowedAccounts?: ReadonlyArray<GreenTargetRevenueAccountCode>;
  displayOnlyAccounts?: ReadonlyArray<GreenTargetRevenueSplitAccountCode>;
  totalLabel?: string;
}

/**
 * Controlled editor for the ordered revenue side of a Green Target invoice
 * journal. Duplicate account rows are valid and remain separate.
 */
const GTRevenueSplitEditor: React.FC<GTRevenueSplitEditorProps> = ({
  totalAmount,
  splits,
  onChange,
  disabled = false,
  className = "",
  allowedAccounts,
  displayOnlyAccounts = [],
  totalLabel = "Jumlah invois",
}) => {
  const editorId: string = useId();
  const selectableRevenueAccounts: ReadonlyArray<{
    code: GreenTargetRevenueAccountCode;
    label: string;
  }> = useMemo(() => {
    if (allowedAccounts === undefined) return REVENUE_ACCOUNTS;
    const allowedAccountSet: Set<GreenTargetRevenueAccountCode> = new Set(
      allowedAccounts
    );
    return REVENUE_ACCOUNTS.filter(
      (account: {
        code: GreenTargetRevenueAccountCode;
        label: string;
      }): boolean => allowedAccountSet.has(account.code)
    );
  }, [allowedAccounts]);
  const displayOnlyAccountSet: Set<GreenTargetRevenueSplitAccountCode> =
    useMemo(
      (): Set<GreenTargetRevenueSplitAccountCode> =>
        new Set(displayOnlyAccounts),
      [displayOnlyAccounts]
    );
  const selectableAccountSet: Set<GreenTargetRevenueAccountCode> = useMemo(
    (): Set<GreenTargetRevenueAccountCode> =>
      new Set(
        selectableRevenueAccounts.map(
          (account: {
            code: GreenTargetRevenueAccountCode;
            label: string;
          }): GreenTargetRevenueAccountCode => account.code
        )
      ),
    [selectableRevenueAccounts]
  );
  const defaultSelectableAccount: GreenTargetRevenueAccountCode | null =
    selectableRevenueAccounts[0]?.code || null;
  const totalCents: number = Math.max(0, safeCents(totalAmount));
  const allocatedCents: number = useMemo(
    (): number =>
      splits.reduce(
        (sum: number, split: GreenTargetRevenueSplit): number =>
          sum + safeCents(split.amount),
        0
      ),
    [splits]
  );
  const remainingCents: number = totalCents - allocatedCents;
  const hasEmptyAmount: boolean = splits.some(
    (split: GreenTargetRevenueSplit): boolean => safeCents(split.amount) <= 0
  );
  const isBalanced: boolean =
    splits.length > 0 && !hasEmptyAmount && remainingCents === 0;

  // Once a user adds or edits allocation rows, total changes must never
  // silently redistribute their work. Remounting the editor resets this mode,
  // which is appropriate when a caller loads a different invoice/form.
  const hasManualAllocation = useRef<boolean>(splits.length > 1);

  useEffect((): void => {
    if (splits.length > 1) {
      hasManualAllocation.current = true;
    }
  }, [splits.length]);

  useEffect((): void => {
    if (disabled) return;

    if (splits.length === 0) {
      if (!defaultSelectableAccount) return;
      onChange([
        {
          line_number: 1,
          account_code: defaultSelectableAccount,
          amount: toDollars(totalCents),
        },
      ]);
      return;
    }

    if (
      splits.length === 1 &&
      !hasManualAllocation.current &&
      safeCents(splits[0].amount) !== totalCents
    ) {
      onChange([
        {
          ...splits[0],
          line_number: 1,
          amount: toDollars(totalCents),
        },
      ]);
    }
  }, [defaultSelectableAccount, disabled, onChange, splits, totalCents]);

  const emitSplits = (
    nextSplits: ReadonlyArray<GreenTargetRevenueSplit>
  ): void => {
    onChange(renumberSplits(nextSplits));
  };

  const updateAccount = (
    index: number,
    accountCode: GreenTargetRevenueAccountCode
  ): void => {
    emitSplits(
      splits.map(
        (
          split: GreenTargetRevenueSplit,
          splitIndex: number
        ): GreenTargetRevenueSplit =>
          splitIndex === index
            ? { ...split, account_code: accountCode }
            : split
      )
    );
  };

  const updateAmount = (index: number, amount: number): void => {
    hasManualAllocation.current = true;
    emitSplits(
      splits.map(
        (
          split: GreenTargetRevenueSplit,
          splitIndex: number
        ): GreenTargetRevenueSplit =>
          splitIndex === index
            ? { ...split, amount: normaliseAmount(amount) }
            : split
      )
    );
  };

  const addSplit = (): void => {
    if (!defaultSelectableAccount) return;
    hasManualAllocation.current = true;
    emitSplits([
      ...splits,
      {
        line_number: splits.length + 1,
        account_code: defaultSelectableAccount,
        amount: 0,
      },
    ]);
  };

  const removeSplit = (index: number): void => {
    if (splits.length <= 1) return;
    hasManualAllocation.current = true;
    emitSplits(
      splits.filter(
        (_split: GreenTargetRevenueSplit, splitIndex: number): boolean =>
          splitIndex !== index
      )
    );
  };

  const balanceClasses: string = isBalanced
    ? "text-emerald-700 dark:text-emerald-300"
    : remainingCents < 0
    ? "text-rose-700 dark:text-rose-300"
    : "text-amber-700 dark:text-amber-300";

  return (
    <div
      className={`rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-default-800 dark:text-gray-100">
            Agihan hasil
          </p>
          <p className="text-xs text-default-500 dark:text-gray-400">
            Tambah baris berasingan apabila satu invois melibatkan lebih
            daripada satu akaun hasil.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          color="sky"
          icon={IconPlus}
          iconSize={15}
          onClick={addSplit}
          disabled={disabled || !defaultSelectableAccount}
        >
          Tambah baris
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {splits.map(
          (split: GreenTargetRevenueSplit, index: number): React.ReactNode => {
            const isDisplayOnlyAccount: boolean =
              displayOnlyAccountSet.has(split.account_code) ||
              split.account_code === "WS_OTH4";
            const hasSelectableCurrentAccount: boolean =
              split.account_code !== "WS_OTH4" &&
              selectableAccountSet.has(split.account_code);
            return (
              <div
                key={`${split.line_number}-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.6fr)_2rem] items-end gap-2"
              >
                <div className="space-y-1">
                  <span className="block text-xs font-medium text-default-600 dark:text-gray-300">
                    Akaun {index + 1}
                  </span>
                  <PillSelect<GreenTargetRevenueSplitAccountCode>
                    value={split.account_code}
                    onChange={(accountCode): void =>
                      updateAccount(
                        index,
                        accountCode as GreenTargetRevenueAccountCode
                      )
                    }
                    options={[
                      // An inherited account that can no longer be chosen (e.g.
                      // WS_OTH4) stays visible as a selected, unselectable pill.
                      ...(hasSelectableCurrentAccount
                        ? []
                        : [
                            {
                              value: split.account_code,
                              label: split.account_code,
                              title: REVENUE_ACCOUNT_LABELS[split.account_code],
                              disabled: true,
                            },
                          ]),
                      ...selectableRevenueAccounts.map(
                        (account: {
                          code: GreenTargetRevenueAccountCode;
                          label: string;
                        }): PillSelectOption<GreenTargetRevenueSplitAccountCode> => ({
                          value: account.code,
                          label: account.code,
                          title: account.label,
                        })
                      ),
                    ]}
                    disabled={disabled || isDisplayOnlyAccount}
                    ariaLabel={`Akaun hasil bagi baris ${index + 1}`}
                    size="md"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={`${editorId}-amount-${index}`}
                    className="block text-xs font-medium text-default-600 dark:text-gray-300"
                  >
                    Amaun
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-default-500 dark:text-gray-400">
                      RM
                    </span>
                    <input
                      id={`${editorId}-amount-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={safeCents(split.amount) === 0 ? "" : split.amount}
                      onChange={(
                        event: React.ChangeEvent<HTMLInputElement>
                      ): void =>
                        updateAmount(
                          index,
                          event.target.value === ""
                            ? 0
                            : Number(event.target.value)
                        )
                      }
                      disabled={disabled}
                      className="block w-full rounded-lg border border-default-300 bg-white py-2 pl-9 pr-2.5 text-right text-sm tabular-nums text-default-800 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(): void => removeSplit(index)}
                  disabled={disabled || splits.length <= 1}
                  aria-label={`Buang baris hasil ${index + 1}`}
                  title={
                    splits.length <= 1
                      ? "Sekurang-kurangnya satu baris hasil diperlukan"
                      : "Buang baris hasil"
                  }
                  className="inline-flex h-9 w-8 items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-500 dark:hover:bg-rose-900/20 dark:hover:text-rose-300"
                >
                  <IconTrash size={16} />
                </button>
              </div>
            );
          }
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-default-50 px-3 py-2 text-xs dark:bg-gray-900/40">
        <div>
          <span className="block text-default-500 dark:text-gray-400">
            Telah diagih
          </span>
          <span className="font-medium tabular-nums text-default-800 dark:text-gray-100">
            {formatCents(allocatedCents)}
          </span>
        </div>
        <div>
          <span className="block text-default-500 dark:text-gray-400">
            {totalLabel}
          </span>
          <span className="font-medium tabular-nums text-default-800 dark:text-gray-100">
            {formatCents(totalCents)}
          </span>
        </div>
        <div>
          <span className="block text-default-500 dark:text-gray-400">
            Baki
          </span>
          <span className={`font-semibold tabular-nums ${balanceClasses}`}>
            {formatCents(remainingCents)}
          </span>
        </div>
      </div>

      {!isBalanced && (
        <p className={`mt-2 text-xs ${balanceClasses}`} role="status">
          {hasEmptyAmount
            ? "Masukkan amaun melebihi RM 0.00 bagi setiap baris hasil."
            : remainingCents < 0
            ? "Agihan hasil melebihi jumlah yang perlu diagih."
            : "Agihkan baki jumlah tersebut sebelum menyimpan."}
        </p>
      )}
    </div>
  );
};

export default GTRevenueSplitEditor;
