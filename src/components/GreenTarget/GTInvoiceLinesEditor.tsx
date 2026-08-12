// src/components/GreenTarget/GTInvoiceLinesEditor.tsx
//
// Editable Green Target invoice line items (description / qty / unit price;
// the amount is computed). Patterned on the GT adjustment-docs line editor in
// GTAdjustmentDocsFormPage.tsx, minus the product/tax/subtotal columns. Raw
// English labels, matching the GT invoice module's existing convention.
import React from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import Button from "../Button";
import { multiplyMoney, sumMoneyBy } from "../../utils/moneyUtils";
import type { GreenTargetInvoiceLineInput } from "../../types/greenTargetTypes";

// Draft shape while editing: the uid only keys the React rows and is stripped
// when the lines are submitted.
export interface GTInvoiceLineDraft extends GreenTargetInvoiceLineInput {
  uid: string;
}

export const createGTInvoiceLineDraft = (
  patch: Partial<GreenTargetInvoiceLineInput> = {}
): GTInvoiceLineDraft => ({
  uid: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unit_price: 0,
  ...patch,
});

export const gtInvoiceLineAmount = (line: GreenTargetInvoiceLineInput): number =>
  multiplyMoney(Number(line.unit_price) || 0, Number(line.quantity) || 0);

export const gtInvoiceLinesTotal = (lines: GreenTargetInvoiceLineInput[]): number =>
  sumMoneyBy(lines, gtInvoiceLineAmount);

interface GTInvoiceLinesEditorProps {
  lines: GTInvoiceLineDraft[];
  onChange: (lines: GTInvoiceLineDraft[]) => void;
  disabled?: boolean;
}

const GTInvoiceLinesEditor: React.FC<GTInvoiceLinesEditorProps> = ({
  lines,
  onChange,
  disabled = false,
}) => {
  const updateLine = (
    uid: string,
    patch: Partial<GreenTargetInvoiceLineInput>
  ): void => {
    onChange(
      lines.map((line: GTInvoiceLineDraft): GTInvoiceLineDraft =>
        line.uid === uid ? { ...line, ...patch } : line
      )
    );
  };

  const addLine = (): void => {
    onChange([...lines, createGTInvoiceLineDraft()]);
  };

  const removeLine = (uid: string): void => {
    if (lines.length <= 1) return;
    onChange(lines.filter((line: GTInvoiceLineDraft): boolean => line.uid !== uid));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100">
          Line Items
        </h2>
        <Button
          type="button"
          onClick={addLine}
          icon={IconPlus}
          variant="outline"
          size="sm"
          disabled={disabled}
        >
          Add Line
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700 border border-default-200 dark:border-gray-700 rounded-lg">
          <thead className="bg-default-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                Description
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase w-24">
                Qty
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase w-28">
                Unit Price
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase w-28">
                Amount
              </th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
            {lines.map((line: GTInvoiceLineDraft) => (
              <tr key={line.uid}>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                      updateLine(line.uid, { description: e.target.value })
                    }
                    className="w-full px-2 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded text-sm"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={line.quantity}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                      updateLine(line.uid, { quantity: Number(e.target.value) })
                    }
                    className="w-full px-2 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded text-sm text-right"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_price}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                      updateLine(line.uid, { unit_price: Number(e.target.value) })
                    }
                    className="w-full px-2 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded text-sm text-right"
                    disabled={disabled}
                  />
                </td>
                <td className="px-3 py-1 text-right text-sm font-medium text-default-900 dark:text-gray-100">
                  {gtInvoiceLineAmount(line).toFixed(2)}
                </td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={(): void => removeLine(line.uid)}
                    disabled={disabled || lines.length <= 1}
                    className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove line"
                  >
                    <IconTrash size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-default-50 dark:bg-gray-900/50">
              <td
                colSpan={3}
                className="px-3 py-2 text-right text-sm font-medium text-default-700 dark:text-gray-300"
              >
                Total
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-default-900 dark:text-gray-100">
                {gtInvoiceLinesTotal(lines).toFixed(2)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default GTInvoiceLinesEditor;
