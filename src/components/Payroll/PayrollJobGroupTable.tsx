// src/components/Payroll/PayrollJobGroupTable.tsx
import React from "react";
import clsx from "clsx";
import {
  IconBriefcase,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import Checkbox from "../Checkbox";
import { EmployeePayroll } from "../../types/types";
import { MidMonthPayroll } from "../../utils/payroll/midMonthPayrollUtils";
import EmployeePayrollTableRow from "./EmployeePayrollTableRow";

interface PayrollJobGroupTableProps {
  jobType: string;
  employees: EmployeePayroll[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  isGroupSelected: boolean;
  onSelectGroup: (isSelected: boolean) => void;
  selectedEmployeePayrolls: Record<string, boolean>;
  onSelectEmployee: (
    id: number,
    isSelected: boolean,
    event: React.MouseEvent
  ) => void;
  onViewDetails: (id: number | undefined) => void;
  payrollStatus: string;
  midMonthPayrollsMap: Record<string, MidMonthPayroll | null>;
  formatCurrency: (amount: number) => string;
}

const PayrollJobGroupTable: React.FC<PayrollJobGroupTableProps> = ({
  jobType,
  employees,
  isExpanded,
  onToggleExpand,
  isGroupSelected,
  onSelectGroup,
  selectedEmployeePayrolls,
  onSelectEmployee,
  onViewDetails,
  payrollStatus,
  midMonthPayrollsMap,
  formatCurrency,
}) => {
  const isGrouped = jobType.startsWith("Grouped: ");
  const displayJobType = isGrouped
    ? jobType.replace("Grouped: ", "")
    : jobType;

  // Calculate group totals
  const groupGrossPay = employees.reduce(
    (sum, emp) => sum + parseFloat(emp.gross_pay.toString()),
    0
  );
  const groupNetPay = employees.reduce(
    (sum, emp) => sum + parseFloat(emp.net_pay.toString()),
    0
  );

  return (
    <div
      className={clsx(
        "rounded-lg overflow-hidden border transition-shadow duration-200",
        isExpanded
          ? "shadow-md border-default-200 dark:border-gray-700"
          : "shadow-sm border-default-200 dark:border-gray-700 hover:shadow"
      )}
    >
      {/* Group Header */}
      <div
        className={clsx(
          "flex items-center cursor-pointer transition-colors duration-150",
          isExpanded
            ? "bg-gradient-to-r from-sky-50 dark:from-sky-900/30 to-white dark:to-gray-800"
            : "bg-white dark:bg-gray-800 hover:bg-default-50 dark:hover:bg-gray-700"
        )}
        onClick={onToggleExpand}
      >
        {/* Left accent bar */}
        <div
          className={clsx(
            "w-1 self-stretch flex-shrink-0",
            isGrouped ? "bg-emerald-500" : "bg-sky-500"
          )}
        />

        <div className="flex-1 flex items-center justify-between px-4 py-2">
          {/* Left side: Checkbox + Job info */}
          <div className="flex items-center gap-3">
            {/* Group Checkbox */}
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isGroupSelected}
                onChange={(checked) => onSelectGroup(checked)}
                size={18}
                ariaLabel={`Select all ${displayJobType} employees`}
              />
            </div>

            {/* Job Type Icon & Name */}
            <IconBriefcase
              size={18}
              className={clsx(
                isGrouped ? "text-emerald-600" : "text-sky-600"
              )}
            />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-default-800 dark:text-gray-100">
                {displayJobType}
              </span>
              {isGrouped && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                  Combined
                </span>
              )}
              <span className="text-sm text-default-500 dark:text-gray-400">
                ({employees.length}{" "}
                {employees.length === 1 ? "employee" : "employees"})
              </span>
            </div>
          </div>

          {/* Right side: Totals + Chevron */}
          <div className="flex items-center gap-4">
            {/* Pay Totals */}
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <div className="text-right">
                <span className="text-default-400 dark:text-gray-500 mr-1">Gross:</span>
                <span className="font-medium text-default-700 dark:text-gray-200">
                  {formatCurrency(groupGrossPay)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-default-400 dark:text-gray-500 mr-1">Net:</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(groupNetPay)}
                </span>
              </div>
            </div>

            {/* Chevron */}
            <div
              className={clsx(
                "p-1 rounded-full transition-colors",
                isExpanded
                  ? "bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400"
                  : "bg-default-100 dark:bg-gray-700 text-default-500 dark:text-gray-400"
              )}
            >
              {isExpanded ? (
                <IconChevronUp size={16} />
              ) : (
                <IconChevronDown size={16} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table Content */}
      {isExpanded && (
        <div className="border-t border-default-100 dark:border-gray-700">
          <table className="min-w-full">
            <thead className="bg-default-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-10">
                  {/* Checkbox column */}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase w-28">
                  ID
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase w-24">
                  Section
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-28">
                  Gross
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-28">
                  Net
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase w-24">
                  Status
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {employees.map((employeePayroll) => (
                <EmployeePayrollTableRow
                  key={employeePayroll.id}
                  employeePayroll={employeePayroll}
                  isSelected={!!selectedEmployeePayrolls[`${employeePayroll.id}`]}
                  onSelect={onSelectEmployee}
                  onViewDetails={onViewDetails}
                  payrollStatus={payrollStatus}
                  midMonthPayroll={midMonthPayrollsMap[employeePayroll.employee_id]}
                  formatCurrency={formatCurrency}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PayrollJobGroupTable;
