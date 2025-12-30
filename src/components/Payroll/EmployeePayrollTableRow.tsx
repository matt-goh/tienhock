// src/components/Payroll/EmployeePayrollTableRow.tsx
import React, { useState } from "react";
import clsx from "clsx";
import {
  IconPrinter,
  IconLock,
  IconLoader2,
} from "@tabler/icons-react";
import Checkbox from "../Checkbox";
import { EmployeePayroll } from "../../types/types";
import { MidMonthPayroll } from "../../utils/payroll/midMonthPayrollUtils";
import { printPayslip } from "../../utils/payroll/PayslipManager";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import LoadingOverlay from "./LoadingOverlay";

interface EmployeePayrollTableRowProps {
  employeePayroll: EmployeePayroll;
  isSelected: boolean;
  onSelect: (id: number, isSelected: boolean, event: React.MouseEvent) => void;
  onViewDetails: (id: number | undefined) => void;
  payrollStatus: string;
  midMonthPayroll?: MidMonthPayroll | null;
  formatCurrency: (amount: number) => string;
}

const EmployeePayrollTableRow: React.FC<EmployeePayrollTableRowProps> = ({
  employeePayroll,
  isSelected,
  onSelect,
  onViewDetails,
  payrollStatus,
  midMonthPayroll,
  formatCurrency,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

  const getStaffDetails = () => ({
    name: employeePayroll.employee_name || "",
    icNo: staffs.find((s) => s.id === employeePayroll.employee_id)?.icNo || "",
    jobName:
      jobs.find((j) => j.id === employeePayroll.job_type)?.name ||
      employeePayroll.job_type,
    section: employeePayroll.section || "",
  });

  const handleRowClick = () => {
    onViewDetails(employeePayroll.id);
  };

  const handleCheckboxChange = (checked: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (employeePayroll.id) {
      onSelect(employeePayroll.id, checked, e);
    }
  };

  const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPrinting(true);
    setShowPrintOverlay(true);

    const details = getStaffDetails();

    await printPayslip(employeePayroll, details, {
      companyName: "TIEN HOCK FOOD INDUSTRIES S/B",
      midMonthPayroll,
      onBeforePrint: () => {
        setShowPrintOverlay(true);
      },
      onAfterPrint: () => {
        setIsPrinting(false);
        setShowPrintOverlay(false);
      },
      onError: () => {
        setIsPrinting(false);
        setShowPrintOverlay(false);
      },
    });
  };

  return (
    <>
      <tr
        className={clsx(
          "group cursor-pointer border-b border-default-100 transition-colors",
          isSelected ? "bg-sky-50" : "hover:bg-default-50"
        )}
        onClick={handleRowClick}
      >
        {/* Checkbox */}
        <td
          className="px-3 py-2 w-10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center h-full">
            <Checkbox
              checked={isSelected}
              onChange={(checked) =>
                handleCheckboxChange(
                  checked,
                  new MouseEvent("click") as unknown as React.MouseEvent
                )
              }
              size={18}
              ariaLabel={`Select ${employeePayroll.employee_name || "employee"}`}
            />
          </div>
        </td>

        {/* Employee Name */}
        <td className="px-3 py-2">
          <span className="font-medium text-default-800">
            {employeePayroll.employee_name || "Unknown"}
          </span>
        </td>

        {/* Employee ID */}
        <td className="px-3 py-2 text-default-500 text-sm">
          {employeePayroll.employee_job_mapping &&
          Object.keys(employeePayroll.employee_job_mapping).length > 1 ? (
            <div className="flex flex-col gap-0.5">
              {Object.keys(employeePayroll.employee_job_mapping).map((id) => (
                <span key={id}>{id}</span>
              ))}
            </div>
          ) : (
            employeePayroll.employee_id
          )}
        </td>

        {/* Section */}
        <td className="px-3 py-2 text-default-600 text-sm">
          {employeePayroll.section || "-"}
        </td>

        {/* Gross Pay */}
        <td className="px-3 py-2 text-right text-default-700">
          {formatCurrency(parseFloat(employeePayroll.gross_pay.toString()))}
        </td>

        {/* Net Pay */}
        <td className="px-3 py-2 text-right font-medium text-emerald-600">
          {formatCurrency(parseFloat(employeePayroll.net_pay.toString()))}
        </td>

        {/* Status Badge */}
        <td className="px-3 py-2">
          <span
            className={clsx(
              "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
              payrollStatus === "Finalized"
                ? "bg-amber-100 text-amber-700"
                : "bg-sky-100 text-sky-700"
            )}
          >
            {payrollStatus === "Finalized" && (
              <IconLock size={10} className="mr-0.5" />
            )}
            {payrollStatus}
          </span>
        </td>

        {/* Actions */}
        <td
          className="p-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Print Button */}
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className={clsx(
                "w-full h-full flex items-center justify-center py-2 px-3 transition-colors rounded-lg",
                isPrinting
                  ? "text-default-400 cursor-wait"
                  : "hover:bg-sky-100 text-sky-600"
              )}
              title="Print Payslip"
            >
              {isPrinting ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconPrinter size={16} />
              )}
            </button>
          </div>
        </td>
      </tr>

      {/* Print Overlay */}
      {showPrintOverlay && (
        <LoadingOverlay
          message="Preparing payslip for printing..."
          processingMessage="Opening print dialog..."
          onClose={() => setShowPrintOverlay(false)}
        />
      )}
    </>
  );
};

export default EmployeePayrollTableRow;
