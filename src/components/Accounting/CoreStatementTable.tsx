import React from "react";
import { useTranslation } from "react-i18next";
import { formatStatementAmount, type StatementLayoutRow } from "../../utils/accounting/coreStatementLayout";

interface CoreStatementTableProps {
  rows: StatementLayoutRow[];
}

const CoreStatementTable: React.FC<CoreStatementTableProps> = ({ rows }) => {
  const { t } = useTranslation("accounting");
  return (
    <div className="overflow-x-auto p-4 sm:p-6">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 uppercase">
            <th scope="col" className="pb-2 text-left font-medium">{t("Particular")}</th>
            <th scope="col" className="w-20 px-3 pb-2 text-center font-medium">{t("Note")}</th>
            <th scope="col" className="w-40 pb-2 text-right font-medium">{t("Amount (RM)")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: StatementLayoutRow): React.ReactNode => {
            if (row.kind === "heading") {
              return (
                <tr key={row.key}>
                  <th colSpan={3} scope="row" className="pt-6 pb-2 text-left font-bold text-gray-900 dark:text-white">
                    {t(row.label)}
                  </th>
                </tr>
              );
            }
            if (row.kind === "total") {
              return (
                <tr key={row.key} className="font-semibold text-gray-900 dark:text-white">
                  <th colSpan={2} scope="row" className="py-2 pr-4 text-left">{row.label ? t(row.label) : null}</th>
                  <td className={`border-t border-gray-500 dark:border-gray-400 py-2 text-right tabular-nums ${row.doubleRule ? "border-b-4 border-double" : ""}`}>
                    {formatStatementAmount(row.amount)}
                  </td>
                </tr>
              );
            }
            const padding: string = row.spaceBefore ? "pt-6 pb-1" : "py-1";
            return (
              <tr key={row.key}>
                <td className={`${padding} pr-2 text-gray-700 dark:text-gray-300`}>{row.translateLabel ? t(row.label) : row.label}</td>
                <td className={`${padding} px-3 text-center text-gray-600 dark:text-gray-400`}>{row.note}</td>
                <td className={`${padding} text-right tabular-nums text-gray-900 dark:text-white`}>{formatStatementAmount(row.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CoreStatementTable;
