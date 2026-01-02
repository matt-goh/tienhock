// src/components/Invoice/InvoiceTotals.tsx
import React, { ChangeEvent } from "react";

interface InvoiceTotalsProps {
  subtotal: number;
  taxTotal: number;
  rounding: number;
  grandTotal: number;
  onRoundingChange: (value: number) => void;
  readOnly?: boolean;
}

const formatCurrency = (amount: number): string => {
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const InvoiceTotals: React.FC<InvoiceTotalsProps> = ({
  subtotal,
  taxTotal,
  rounding,
  grandTotal,
  onRoundingChange,
  readOnly = false,
}) => {
  const handleRoundingInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const parsedValue = value === "" ? 0 : parseFloat(value);
    if (value === "-" || !isNaN(parsedValue)) {
      onRoundingChange(isNaN(parsedValue) ? 0 : parsedValue);
    }
  };
  const displayRounding = rounding.toFixed(2);

  return (
    <div className="flex justify-end">
      {/* Use grid for precise alignment */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 w-full max-w-xs text-sm">
        {/* Subtotal Row */}
        <label className="text-gray-600 dark:text-gray-400 text-right self-center">
          Subtotal:
        </label>
        <div className="flex items-center justify-end">
          <span className="mr-2 text-gray-800 dark:text-gray-200 font-medium">RM</span>
          <div className="w-[75px] py-0.5 pr-4 text-right font-medium text-gray-800 dark:text-gray-200">
            {formatCurrency(subtotal)}
          </div>
        </div>

        {/* Tax Row */}
        <label className="text-gray-600 dark:text-gray-400 text-right self-center">
          Total Tax:
        </label>
        <div className="flex items-center justify-end">
          <span className="mr-2 text-gray-800 dark:text-gray-200 font-medium">RM</span>
          <div className="w-[75px] py-0.5 pr-4 text-right font-medium text-gray-800 dark:text-gray-200">
            {formatCurrency(taxTotal)}
          </div>
        </div>

        {/* Rounding Row */}
        <label
          htmlFor="rounding-input"
          className="text-gray-600 dark:text-gray-400 text-right self-center"
        >
          Rounding:
        </label>
        <div className="flex items-center justify-end">
          <span className="mr-2 text-gray-800 dark:text-gray-200 font-medium">RM</span>
          <input
            id="rounding-input"
            type="number"
            step="0.01"
            value={displayRounding}
            onChange={handleRoundingInputChange}
            onBlur={(e) => {
              const finalValue = parseFloat(e.target.value) || 0;
              onRoundingChange(finalValue);
            }}
            className={`w-[75px] py-0.5 border border-transparent bg-transparent text-right font-medium text-gray-800 dark:text-gray-200 ${
              !readOnly
                ? "hover:border-default-300 dark:hover:border-gray-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded"
                : ""
            }`}
            disabled={readOnly}
          />
        </div>

        {/* Divider */}
        <div className="col-span-2 border-t border-gray-300 dark:border-gray-600 mt-1 mb-1"></div>

        {/* Grand Total Row */}
        <label className="font-semibold text-base text-gray-900 dark:text-gray-100 text-right self-center">
          Total Payable:
        </label>
        <div className="flex items-center justify-end">
          <span className="mr-2 font-semibold text-base text-gray-900 dark:text-gray-100">RM</span>
          <div className="w-[75px] py-0.5 pr-4 text-right font-semibold text-base text-gray-900 dark:text-gray-100">
            {formatCurrency(grandTotal)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceTotals;
