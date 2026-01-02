// src/components/Payroll/PayrollUnifiedTable.tsx
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

interface JobGroup {
  jobType: string;
  employees: EmployeePayroll[];
}

interface PayrollUnifiedTableProps {
  jobGroups: JobGroup[];
  expandedJobs: Record<string, boolean>;
  onToggleExpand: (jobType: string) => void;
  isJobGroupSelected: (jobType: string) => boolean;
  onSelectGroup: (jobType: string, isSelected: boolean) => void;
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

const PayrollUnifiedTable: React.FC<PayrollUnifiedTableProps> = ({
  jobGroups,
  expandedJobs,
  onToggleExpand,
  isJobGroupSelected,
  onSelectGroup,
  selectedEmployeePayrolls,
  onSelectEmployee,
  onViewDetails,
  payrollStatus,
  midMonthPayrollsMap,
  formatCurrency,
}) => {
  return (
    <div className="border border-default-200 dark:border-gray-700 rounded-lg shadow-sm">
      <div className="max-h-[calc(100vh-150px)] overflow-y-auto">
        <table className="min-w-full table-fixed">
          <thead className="bg-default-100 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-10">
              {/* Checkbox column */}
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
              Name
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-default-500 uppercase w-28">
              ID
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-default-500 uppercase w-24">
              Section
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-28">
              Gross
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-28">
              Net
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-default-500 uppercase w-24">
              Status
            </th>
            <th className="px-3 py-2.5 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-20">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800">
          {jobGroups.map(({ jobType, employees }) => {
            const isGrouped = jobType.startsWith("Grouped: ");
            const displayJobType = isGrouped
              ? jobType.replace("Grouped: ", "")
              : jobType;
            const isExpanded = !!expandedJobs[jobType];
            const isSelected = isJobGroupSelected(jobType);

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
              <React.Fragment key={jobType}>
                {/* Job Group Header Row */}
                <tr
                  className={clsx(
                    "group cursor-pointer transition-colors border-t border-default-200 dark:border-gray-700",
                    isExpanded
                      ? "bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50"
                      : "bg-default-50 dark:bg-gray-800/50 hover:bg-default-100 dark:hover:bg-gray-700"
                  )}
                  onClick={() => onToggleExpand(jobType)}
                >
                  {/* Checkbox */}
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center h-full">
                      <Checkbox
                        checked={isSelected}
                        onChange={(checked) => onSelectGroup(jobType, checked)}
                        size={18}
                        ariaLabel={`Select all ${displayJobType} employees`}
                      />
                    </div>
                  </td>

                  {/* Job Type Name */}
                  <td colSpan={3} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={clsx(
                          "w-1 h-5 rounded-full",
                          isGrouped ? "bg-emerald-500" : "bg-sky-500"
                        )}
                      />
                      <IconBriefcase
                        size={16}
                        className={clsx(
                          isGrouped ? "text-emerald-600" : "text-sky-600"
                        )}
                      />
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
                  </td>

                  {/* Gross Total */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-sm font-medium text-default-700 dark:text-gray-200">
                      {formatCurrency(groupGrossPay)}
                    </span>
                  </td>

                  {/* Net Total */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(groupNetPay)}
                    </span>
                  </td>

                  {/* Empty status column */}
                  <td className="px-3 py-2"></td>

                  {/* Expand/Collapse */}
                  <td className="px-3 py-2 text-center">
                    <div
                      className={clsx(
                        "inline-flex p-1 rounded-full transition-all opacity-0 group-hover:opacity-100",
                        isExpanded
                          ? "bg-sky-200 dark:bg-sky-800 text-sky-700 dark:text-sky-300"
                          : "bg-default-200 dark:bg-gray-700 text-default-500 dark:text-gray-400"
                      )}
                    >
                      {isExpanded ? (
                        <IconChevronUp size={14} />
                      ) : (
                        <IconChevronDown size={14} />
                      )}
                    </div>
                  </td>
                </tr>

                {/* Employee Rows */}
                {isExpanded &&
                  employees.map((employeePayroll) => (
                    <EmployeePayrollTableRow
                      key={employeePayroll.id}
                      employeePayroll={employeePayroll}
                      isSelected={
                        !!selectedEmployeePayrolls[`${employeePayroll.id}`]
                      }
                      onSelect={onSelectEmployee}
                      onViewDetails={onViewDetails}
                      payrollStatus={payrollStatus}
                      midMonthPayroll={
                        midMonthPayrollsMap[employeePayroll.employee_id]
                      }
                      formatCurrency={formatCurrency}
                    />
                  ))}
              </React.Fragment>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PayrollUnifiedTable;
