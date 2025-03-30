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
    <div className="mt-4 flex justify-end">
      {/* Use grid for precise alignment */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 w-full max-w-xs text-sm">
        {/* Subtotal Row */}
        <span className="text-gray-600 text-right">Subtotal:</span>
        <span className="font-medium text-gray-800 text-right">
          RM {formatCurrency(subtotal)}
        </span>

        {/* Tax Row */}
        <span className="text-gray-600 text-right">Total Tax:</span>
        <span className="font-medium text-gray-800 text-right">
          RM {formatCurrency(taxTotal)}
        </span>

        {/* Rounding Row */}
        <label
          htmlFor="rounding-input"
          className="text-gray-600 text-right self-center"
        >
          Rounding:
        </label>
        <div className="flex items-center justify-end">
          {" "}
          {/* Align input to right */}
          <span className="mr-1 text-gray-800 font-medium">RM</span>
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
            className="w-[75px] px-2 py-0.5 border border-transparent hover:border-default-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded bg-transparent text-right font-medium text-gray-800"
            disabled={readOnly}
          />
        </div>

        {/* Divider */}
        <div className="col-span-2 border-t border-gray-300 mt-1 mb-1"></div>

        {/* Grand Total Row */}
        <span className="font-semibold text-base text-gray-900 text-right">
          Total Payable:
        </span>
        <span className="font-semibold text-base text-gray-900 text-right">
          RM {formatCurrency(grandTotal)}
        </span>
      </div>
    </div>
  );
};

export default InvoiceTotals;
