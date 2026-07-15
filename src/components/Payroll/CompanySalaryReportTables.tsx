// src/components/Payroll/CompanySalaryReportTables.tsx
// Bank / Pinjam / Cuti tables shared by the Jelly Polly and Green Target salary
// reports. Tien Hock renders its own copies inline in SalaryReportPage.tsx; these
// mirror that markup for the two companies whose report pages are otherwise twins.
import React, { useMemo, useRef, useState } from "react";
import { IconChevronRight, IconFileText } from "@tabler/icons-react";
import Button from "../Button";
import {
  aggregatePinjamContributorsByType,
  PinjamReportData,
} from "../../utils/payroll/PinjamReportPDF";
import { BankReportData } from "../../utils/payroll/BankReportPDF";

export type CutiLeaveType =
  | "cuti_sakit"
  | "cuti_tahunan"
  | "cuti_umum"
  | "cuti_rawatan";

export interface CutiMonthValue {
  days: number;
  amount: number;
}

export interface CutiBatchEmployee {
  employee: { id: string; name: string };
  leaveBalance?: {
    cuti_umum_total?: number;
    cuti_tahunan_total?: number;
    cuti_sakit_total?: number;
    cuti_rawatan_total?: number;
  };
  monthlySummary?: Record<number, Record<CutiLeaveType, CutiMonthValue>>;
}

const CUTI_TYPES: { key: CutiLeaveType; label: string }[] = [
  { key: "cuti_sakit", label: "Cuti Sakit" },
  { key: "cuti_tahunan", label: "Cuti Tahunan" },
  { key: "cuti_umum", label: "Cuti Umum" },
  { key: "cuti_rawatan", label: "Cuti Rawatan" },
];

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(Number(amount) || 0);

const headClass =
  "px-2 py-2 text-left text-sm font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider";
const rowClass = (index: number): string =>
  index % 2 === 0
    ? "bg-white dark:bg-gray-800"
    : "bg-default-25 dark:bg-gray-750";

// Bank tab: who gets paid what this month, with the account to pay it into.
export const BankReportTable: React.FC<{ data: BankReportData[] }> = ({
  data,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <thead className="bg-default-50 dark:bg-gray-900/50 border-b border-default-200 dark:border-gray-700 sticky top-0 z-10">
        <tr>
          <th className={headClass}>NO.</th>
          <th className={headClass}>STAFF NAME</th>
          <th className={headClass}>IC NO.</th>
          <th className={headClass}>BANK ACCOUNT NUMBER</th>
          <th className={`${headClass} text-right`}>TOTAL</th>
          <th className={`${headClass} text-center`}>PAYMENT</th>
        </tr>
      </thead>
      <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
        {data.map((item, index) => (
          <tr key={`${item.no}-${item.staff_name}`} className={rowClass(index)}>
            <td className="px-2 py-2 text-sm text-default-900 dark:text-gray-100">
              {item.no}
            </td>
            <td className="px-2 py-2 text-sm text-default-900 dark:text-gray-100 font-medium">
              {item.staff_name}
            </td>
            <td className="px-2 py-2 text-sm text-default-600 dark:text-gray-300">
              {item.icNo}
            </td>
            <td className="px-2 py-2 text-sm text-default-600 dark:text-gray-300">
              {item.bankAccountNumber}
            </td>
            <td className="px-2 py-2 text-sm text-default-900 dark:text-gray-100 font-medium text-right">
              {formatCurrency(item.total)}
            </td>
            <td className="px-2 py-2 text-sm text-center">
              <PaymentBadge preference={item.payment_preference} />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="sticky bottom-0 z-10">
        <tr>
          <td
            colSpan={4}
            className="px-2 py-2 text-sm font-bold text-default-700 dark:text-gray-200 text-right bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600"
          >
            TOTAL
          </td>
          <td className="px-2 py-2 text-sm font-bold text-default-900 dark:text-gray-100 text-right bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
            {formatCurrency(
              data.reduce((sum, item) => sum + (Number(item.total) || 0), 0)
            )}
          </td>
          <td className="bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600" />
        </tr>
      </tfoot>
    </table>
  </div>
);

const PaymentBadge: React.FC<{ preference: string | null | undefined }> = ({
  preference,
}) => (
  <span
    className={`inline-flex px-2 py-1 text-sm font-semibold rounded-full ${
      preference === "Bank"
        ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
    }`}
  >
    {preference || "—"}
  </span>
);

// Pinjam tab: gaji/genap less this month's deductions, with each pinjam shown
// as a chip on the staff row (matches the printed Pinjam Report).
export const PinjamReportTable: React.FC<{ data: PinjamReportData[] }> = ({
  data,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <thead className="bg-default-50 dark:bg-gray-900/50 border-b border-default-200 dark:border-gray-700 sticky top-0 z-10">
        <tr>
          <th className={headClass}>NO.</th>
          <th className={headClass}>STAFF/ID</th>
          <th className={`${headClass} text-right`}>GAJI/GENAP</th>
          <th className={`${headClass} text-right`}>TOTAL PINJAM</th>
          <th className={`${headClass} text-right`}>TOTAL</th>
          <th className={`${headClass} text-center`}>PAYMENT</th>
        </tr>
      </thead>
      <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
        {data.map((item, index) => (
          <tr key={item.staff_id} className={rowClass(index)}>
            <td className="px-2 py-1 text-sm text-default-900 dark:text-gray-100">
              {item.no}
            </td>
            <td className="px-2 py-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-sm text-default-900 dark:text-gray-100 font-medium">
                  {item.staff_id} - {item.staff_name}
                </span>
                {item.pinjam_details?.map((detail, dIndex) => (
                  <span
                    key={dIndex}
                    className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs dark:border-teal-700/50 dark:bg-teal-900/30"
                  >
                    <span className="text-default-600 dark:text-gray-200">
                      {detail.description}
                    </span>
                    <span className="font-semibold tabular-nums text-teal-600 dark:text-teal-300">
                      {formatCurrency(detail.amount)}
                    </span>
                  </span>
                ))}
              </div>
            </td>
            <td className="px-2 py-1 text-sm text-default-600 dark:text-gray-300 text-right">
              {formatCurrency(item.gaji_genap)}
            </td>
            <td className="px-2 py-1 text-sm text-default-600 dark:text-gray-300 text-right">
              {formatCurrency(item.total_pinjam)}
            </td>
            <td className="px-2 py-1 text-sm text-default-900 dark:text-gray-100 font-medium text-right">
              {formatCurrency(item.final_total)}
            </td>
            <td className="px-2 py-1 text-sm text-center">
              <PaymentBadge preference={item.payment_preference} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Grand total per pinjam type, each expandable to reveal the staff who
// contributed to it.
export const PinjamBreakdownCard: React.FC<{ data: PinjamReportData[] }> = ({
  data,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const byType = useMemo(
    () => aggregatePinjamContributorsByType(data ?? []),
    [data]
  );

  if (byType.length === 0) return null;

  const allKeys = byType.map((type) => type.description.toUpperCase());
  const allExpanded = allKeys.every((key) => expanded.has(key));

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="mb-2 mt-1 rounded-lg border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-700/50 dark:bg-teal-900/20">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-default-700 dark:text-gray-100">
          Pinjam Breakdown
        </h3>
        <button
          type="button"
          onClick={() => setExpanded(allExpanded ? new Set() : new Set(allKeys))}
          className="text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-300 dark:hover:text-teal-200"
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="divide-y divide-teal-200/70 dark:divide-teal-700/30">
        {byType.map((type) => {
          const key = type.description.toUpperCase();
          const isExpanded = expanded.has(key);
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => toggle(key)}
                className="flex w-full items-center justify-between gap-2 py-1.5 text-left"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <IconChevronRight
                    size={15}
                    className={`shrink-0 text-teal-500 transition-transform dark:text-teal-300 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                  <span
                    className="truncate text-sm text-default-700 dark:text-gray-100"
                    title={type.description}
                  >
                    {type.description}
                  </span>
                  <span className="shrink-0 text-xs text-default-400 dark:text-gray-400">
                    ({type.contributors.length})
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-teal-600 dark:text-teal-300">
                  {formatCurrency(type.total)}
                </span>
              </button>
              {isExpanded && (
                <div className="grid grid-cols-1 gap-x-6 gap-y-1 pb-2 pl-6 sm:grid-cols-2 lg:grid-cols-3">
                  {type.contributors.map((c, index) => (
                    <div
                      key={`${c.staff_name}-${index}`}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-default-600 dark:text-gray-300">
                        {c.staff_name}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-default-700 dark:text-gray-200">
                        {formatCurrency(c.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Pinjam tab action: prints/downloads the separate "Pinjam Breakdown" document
// (Pinjam by Type + contributors). Mirrors the Tien Hock Breakdown button.
export const PinjamBreakdownButton: React.FC<{
  disabled: boolean;
  onGenerate: (action: "download" | "print") => void;
}> = ({ disabled, onGenerate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  };
  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 300);
  };

  const itemClass =
    "w-full px-3 py-2 text-left text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Button
        onClick={() => onGenerate("print")}
        icon={IconFileText}
        color="teal"
        variant="outline"
        disabled={disabled}
        size="sm"
      >
        Breakdown
      </Button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-default-200 dark:border-gray-700 py-1 min-w-[140px]">
            <button
              onClick={() => {
                setIsOpen(false);
                onGenerate("print");
              }}
              disabled={disabled}
              className={itemClass}
            >
              Print
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                onGenerate("download");
              }}
              disabled={disabled}
              className={itemClass}
            >
              Download PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Cuti tab: days-taken/entitlement + amount per leave type. `month` scopes the
// table to a single month; pass null for the whole year.
export const CutiReportTable: React.FC<{
  employees: CutiBatchEmployee[];
  month: number | null;
}> = ({ employees, month }) => {
  const rows = useMemo(() => {
    const months =
      month === null ? Array.from({ length: 12 }, (_, i) => i + 1) : [month];

    return employees.map((emp) => {
      const totals: Record<CutiLeaveType, CutiMonthValue> = {
        cuti_sakit: { days: 0, amount: 0 },
        cuti_tahunan: { days: 0, amount: 0 },
        cuti_umum: { days: 0, amount: 0 },
        cuti_rawatan: { days: 0, amount: 0 },
      };

      months.forEach((m) => {
        const monthData = emp.monthlySummary?.[m];
        if (!monthData) return;
        CUTI_TYPES.forEach(({ key }) => {
          const v = monthData[key] || { days: 0, amount: 0 };
          totals[key].days += Number(v.days || 0);
          totals[key].amount += Number(v.amount || 0);
        });
      });

      const entitlement: Record<CutiLeaveType, number> = {
        cuti_sakit: Number(emp.leaveBalance?.cuti_sakit_total || 0),
        cuti_tahunan: Number(emp.leaveBalance?.cuti_tahunan_total || 0),
        cuti_umum: Number(emp.leaveBalance?.cuti_umum_total || 0),
        cuti_rawatan: Number(emp.leaveBalance?.cuti_rawatan_total || 0),
      };

      return { employee: emp.employee, totals, entitlement };
    });
  }, [employees, month]);

  const grandTotals = useMemo(() => {
    const acc: Record<CutiLeaveType, number> = {
      cuti_sakit: 0,
      cuti_tahunan: 0,
      cuti_umum: 0,
      cuti_rawatan: 0,
    };
    rows.forEach((row) => {
      CUTI_TYPES.forEach(({ key }) => {
        acc[key] += row.totals[key].amount;
      });
    });
    return acc;
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="overflow-auto mb-2 max-h-[75vh] border border-default-200 dark:border-gray-700 rounded-lg">
      <table className="w-full">
        <thead className="sticky top-0 z-20 bg-default-50 dark:bg-gray-900">
          <tr>
            <th
              rowSpan={2}
              className="px-2 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 align-middle"
              title="Bilangan"
            >
              BIL
            </th>
            <th
              rowSpan={2}
              className="px-2 py-2 text-left text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700 align-middle"
              title="Nama Pekerja"
            >
              NAMA PEKERJA
            </th>
            {CUTI_TYPES.map(({ key, label }) => (
              <th
                key={key}
                colSpan={2}
                className="px-1 py-2 text-center text-xs font-semibold text-default-600 dark:text-gray-300 uppercase tracking-wider border-l border-b border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900"
                title={label}
              >
                {label}
              </th>
            ))}
          </tr>
          <tr>
            {CUTI_TYPES.map(({ key }) => (
              <React.Fragment key={key}>
                <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-l border-b border-default-300 dark:border-gray-600">
                  HARI
                </th>
                <th className="px-1 py-2 text-center text-xs font-semibold text-default-400 uppercase bg-default-50 dark:bg-gray-900 border-b border-default-200 dark:border-gray-700">
                  AMAUN
                </th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
          {rows.map((row, index) => (
            <tr key={row.employee.id} className={rowClass(index)}>
              <td className="px-2 py-2 text-xs text-default-900 dark:text-gray-100 text-center">
                {index + 1}
              </td>
              <td className="px-2 py-2 text-xs text-default-600 dark:text-gray-300 text-left max-w-[160px]">
                <span
                  className="block truncate"
                  title={`${row.employee.id.toUpperCase()} - ${row.employee.name.toUpperCase()}`}
                >
                  {row.employee.id.toUpperCase()} -{" "}
                  {row.employee.name.toUpperCase()}
                </span>
              </td>
              {CUTI_TYPES.map(({ key }) => (
                <React.Fragment key={key}>
                  <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center border-l border-default-300 dark:border-gray-600">
                    {row.totals[key].days}/{row.entitlement[key]}
                  </td>
                  <td className="px-1 py-2 text-xs text-default-600 dark:text-gray-300 text-center">
                    {formatCurrency(row.totals[key].amount)}
                  </td>
                </React.Fragment>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 z-20">
          <tr>
            <td
              colSpan={2}
              className="px-2 py-2 text-xs font-bold text-default-700 dark:text-gray-200 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600"
            >
              GRAND TOTAL:{" "}
              {formatCurrency(
                CUTI_TYPES.reduce((sum, { key }) => sum + grandTotals[key], 0)
              )}
            </td>
            {CUTI_TYPES.map(({ key }) => (
              <React.Fragment key={key}>
                <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center border-l border-t-2 border-default-300 dark:border-gray-600 bg-default-100 dark:bg-gray-800" />
                <td className="px-1 py-2 text-xs font-bold text-default-900 dark:text-gray-100 text-center bg-default-100 dark:bg-gray-800 border-t-2 border-default-300 dark:border-gray-600">
                  {formatCurrency(grandTotals[key])}
                </td>
              </React.Fragment>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
