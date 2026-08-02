// src/components/Catalogue/CustomerCreditSection.tsx
// Credit limit / credit used inputs plus the usage bar for a single customer.
// Extracted from CustomerFormPage so the read-only CustomerDetailsPage can host
// the same editable block. Purely controlled - the host owns the values and the
// saving.
import React from "react";

interface CustomerCreditSectionProps {
  creditLimit: number;
  creditUsed: number;
  onCreditLimitChange: (value: number) => void;
  onCreditUsedChange: (value: number) => void;
  disabled?: boolean;
}

const getProgressBarColor = (used: number, limit: number): string => {
  if (limit <= 0) return "bg-gray-400"; // Unlimited or zero limit
  const percentage = (used / limit) * 100;
  if (percentage >= 90) return "bg-rose-500";
  if (percentage >= 70) return "bg-amber-500";
  return "bg-emerald-500";
};

const inputClassName =
  "w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-md shadow-sm text-sm bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-default-100 dark:disabled:bg-gray-800";

const CustomerCreditSection: React.FC<CustomerCreditSectionProps> = ({
  creditLimit,
  creditUsed,
  onCreditLimitChange,
  onCreditUsedChange,
  disabled = false,
}) => {
  // Shared behaviour for both money inputs: accept partial typing (text input,
  // max 2 decimals) and clamp to a non-negative number on blur.
  const handleAmountChange = (
    value: string,
    onChange: (value: number) => void
  ): void => {
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      onChange(value === "" ? 0 : parseFloat(value) || 0);
    }
  };

  const handleAmountBlur = (
    value: string,
    onChange: (value: number) => void
  ): void => {
    const numericValue = parseFloat(value);
    onChange(isNaN(numericValue) ? 0 : Math.max(0, numericValue));
  };

  // The API can hand numeric columns back as strings, so coerce before any
  // arithmetic / toFixed on them.
  const limit = Number(creditLimit) || 0;
  const used = Number(creditUsed) || 0;
  const usagePercent = Math.min(100, (used / (limit || 1)) * 100);

  return (
    <div className="p-4 border border-default-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        {/* Credit Limit */}
        <div>
          <label
            htmlFor="credit_limit"
            className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1"
          >
            Credit Limit (RM)
          </label>
          <input
            id="credit_limit"
            type="text"
            name="credit_limit"
            value={creditLimit?.toString() ?? "0"}
            onChange={(e) =>
              handleAmountChange(e.target.value, onCreditLimitChange)
            }
            onBlur={(e) => handleAmountBlur(e.target.value, onCreditLimitChange)}
            placeholder="0.00"
            className={inputClassName}
            disabled={disabled}
          />
        </div>
        {/* Credit Used */}
        <div>
          <label
            htmlFor="credit_used"
            className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1"
          >
            Credit Used (RM)
          </label>
          <input
            id="credit_used"
            type="text"
            name="credit_used"
            value={creditUsed?.toString() ?? "0"}
            onChange={(e) =>
              handleAmountChange(e.target.value, onCreditUsedChange)
            }
            onBlur={(e) => handleAmountBlur(e.target.value, onCreditUsedChange)}
            placeholder="0.00"
            className={inputClassName}
            disabled={disabled}
          />
        </div>
        {/* Available Credit */}
        <div>
          <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
            Available Credit
          </label>
          <div className="px-3 py-2 border border-default-200 dark:border-gray-600 rounded-md bg-default-100 dark:bg-gray-700 h-[42px] flex items-center">
            <span className="font-medium text-default-700 dark:text-gray-200">
              {limit === 0
                ? "Unlimited"
                : `RM ${Math.max(0, limit - used).toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Usage bar (only meaningful with a limit set) */}
      {limit > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-default-600 dark:text-gray-400 mb-1">
            <span>Usage</span>
            <span>
              {used.toFixed(2)} / {limit.toFixed(2)} RM (
              {usagePercent.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full bg-default-200 dark:bg-gray-700 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${getProgressBarColor(
                used,
                limit
              )} transition-all duration-300 ease-out`}
              style={{ width: `${usagePercent}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerCreditSection;
