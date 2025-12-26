// src/components/Stock/StockMovementTable.tsx
import React from "react";
import clsx from "clsx";
import { StockMovement } from "../../types/types";

interface StockMovementTableProps {
  movements: StockMovement[];
  monthlyTotals?: {
    production: number;
    adj_in: number;
    returns: number;
    sold_out: number;
    adj_out: number;
    foc: number;
  };
  isLoading?: boolean;
}

const StockMovementTable: React.FC<StockMovementTableProps> = ({
  movements,
  monthlyTotals,
  isLoading = false,
}) => {
  // Column headers configuration
  const columns = [
    { key: "day", label: "Day", align: "center" as const, width: "w-20" },
    { key: "bf", label: "B/F", align: "right" as const, width: "w-20", color: "text-default-600" },
    { key: "production", label: "PRODUCTION", align: "right" as const, width: "w-24", color: "text-green-600" },
    { key: "returns", label: "RETURN", align: "right" as const, width: "w-20", color: "text-green-600" },
    { key: "adj_in", label: "ADJ+", align: "right" as const, width: "w-20", color: "text-green-600" },
    { key: "sold_out", label: "SOLD", align: "right" as const, width: "w-24", color: "text-rose-600" },
    { key: "foc", label: "FOC", align: "right" as const, width: "w-20", color: "text-rose-600" },
    { key: "adj_out", label: "ADJ-", align: "right" as const, width: "w-20", color: "text-rose-600" },
    { key: "cf", label: "C/F", align: "right" as const, width: "w-20", color: "text-default-900 font-semibold" },
  ];

  // Format number with thousand separators
  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null) return "-";
    return num.toLocaleString();
  };

  // Format date for row
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-sky-500 border-t-transparent"></div>
          <span className="text-sm text-default-500">Loading stock data...</span>
        </div>
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-default-300 p-12 text-center">
        <p className="text-default-500">No stock movement data available.</p>
        <p className="mt-1 text-sm text-default-400">
          Select a product and date range to view stock movements.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-default-200 bg-white">
      <table className="w-full border-collapse">
        {/* Header */}
        <thead>
          <tr className="bg-default-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  "border-b border-default-200 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-default-600",
                  col.width,
                  col.align === "right" ? "text-right" : "text-center"
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y divide-default-100">
          {movements.map((row, index) => (
            <tr
              key={row.date}
              className={clsx(
                "transition-colors hover:bg-sky-50",
                index % 2 === 0 ? "bg-white" : "bg-default-50/50"
              )}
            >
              {/* Day */}
              <td className="border-r border-default-100 px-3 py-2 text-center font-medium text-default-700">
                {formatDate(row.date)}
              </td>

              {/* B/F */}
              <td className="px-3 py-2 text-right tabular-nums text-default-600">
                {formatNumber(row.bf)}
              </td>

              {/* Production */}
              <td className={clsx(
                "px-3 py-2 text-right tabular-nums",
                row.production > 0 ? "text-green-600 font-medium" : "text-default-400"
              )}>
                {row.production > 0 ? formatNumber(row.production) : "-"}
              </td>

              {/* Returns */}
              <td className={clsx(
                "px-3 py-2 text-right tabular-nums",
                row.returns > 0 ? "text-green-600" : "text-default-400"
              )}>
                {row.returns > 0 ? formatNumber(row.returns) : "-"}
              </td>

              {/* ADJ+ */}
              <td className={clsx(
                "px-3 py-2 text-right tabular-nums",
                row.adj_in > 0 ? "text-green-600" : "text-default-400"
              )}>
                {row.adj_in > 0 ? formatNumber(row.adj_in) : "-"}
              </td>

              {/* Sold/Out */}
              <td className={clsx(
                "px-3 py-2 text-right tabular-nums",
                row.sold_out > 0 ? "text-rose-600 font-medium" : "text-default-400"
              )}>
                {row.sold_out > 0 ? formatNumber(row.sold_out) : "-"}
              </td>

              {/* FOC */}
              <td className={clsx(
                "px-3 py-2 text-right tabular-nums",
                row.foc > 0 ? "text-rose-600" : "text-default-400"
              )}>
                {row.foc > 0 ? formatNumber(row.foc) : "-"}
              </td>

              {/* ADJ- */}
              <td className={clsx(
                "px-3 py-2 text-right tabular-nums",
                row.adj_out > 0 ? "text-rose-600" : "text-default-400"
              )}>
                {row.adj_out > 0 ? formatNumber(row.adj_out) : "-"}
              </td>

              {/* C/F */}
              <td className="border-l border-default-200 bg-default-50 px-3 py-2 text-right tabular-nums font-semibold text-default-900">
                {formatNumber(row.cf)}
              </td>
            </tr>
          ))}
        </tbody>

        {/* Footer with totals */}
        {monthlyTotals && (
          <tfoot>
            <tr className="bg-default-50">
              <td className="w-20 border-t-2 border-default-300 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-default-600">
                Totals
              </td>
              <td className="w-20 border-t-2 border-default-300 px-3 py-2 text-right text-default-300">
                —
              </td>
              <td className="w-24 border-t-2 border-default-300 px-3 py-2 text-right tabular-nums font-semibold text-green-700">
                {formatNumber(monthlyTotals.production)}
              </td>
              <td className="w-20 border-t-2 border-default-300 px-3 py-2 text-right tabular-nums font-semibold text-green-700">
                {formatNumber(monthlyTotals.returns)}
              </td>
              <td className="w-20 border-t-2 border-default-300 px-3 py-2 text-right tabular-nums font-semibold text-green-700">
                {formatNumber(monthlyTotals.adj_in)}
              </td>
              <td className="w-24 border-t-2 border-default-300 px-3 py-2 text-right tabular-nums font-semibold text-rose-700">
                {formatNumber(monthlyTotals.sold_out)}
              </td>
              <td className="w-20 border-t-2 border-default-300 px-3 py-2 text-right tabular-nums font-semibold text-rose-700">
                {formatNumber(monthlyTotals.foc)}
              </td>
              <td className="w-20 border-t-2 border-default-300 px-3 py-2 text-right tabular-nums font-semibold text-rose-700">
                {formatNumber(monthlyTotals.adj_out)}
              </td>
              <td className="w-20 border-l border-t-2 border-default-300 bg-sky-50 px-3 py-2 text-right tabular-nums font-bold text-sky-700">
                {formatNumber(movements[movements.length - 1]?.cf)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

export default StockMovementTable;
