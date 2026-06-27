// src/components/Payroll/EmployeePayrollTableRow.tsx
import React, { useState } from "react";
import clsx from "clsx";
import { IconPrinter, IconLoader2, IconRefresh } from "@tabler/icons-react";
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
  onProcess: (employeePayroll: EmployeePayroll) => void;
  // True while any payroll processing is running (disables the per-row button).
  isProcessingDisabled: boolean;
  // True while this specific row is being processed (shows the inline spinner).
  isProcessingThis: boolean;
  midMonthPayroll?: MidMonthPayroll | null;
  formatCurrency: (amount: number) => string;
}

const EmployeePayrollTableRow: React.FC<EmployeePayrollTableRowProps> = ({
  employeePayroll,
  isSelected,
  onSelect,
  onViewDetails,
  onProcess,
  isProcessingDisabled,
  isProcessingThis,
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

  const handleProcess = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProcessingDisabled) return;
    onProcess(employeePayroll);
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
          "group cursor-pointer border-b border-default-100 dark:border-gray-700 transition-colors",
          isSelected ? "bg-sky-50 dark:bg-sky-900/30" : "hover:bg-default-50 dark:hover:bg-gray-700"
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
          <div
            className="truncate font-medium text-default-700 dark:text-gray-200"
            title={employeePayroll.employee_name || "Unknown"}
          >
            {employeePayroll.employee_name || "Unknown"}
          </div>
        </td>

        {/* Employee ID */}
        <td className="px-3 py-2 text-default-500 dark:text-gray-400 text-sm">
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
        <td className="px-3 py-2 text-default-600 dark:text-gray-300 text-sm">
          {employeePayroll.section || "-"}
        </td>

        {/* Gross Pay */}
        <td className="px-3 py-2 text-right font-medium text-default-700 dark:text-gray-200">
          {formatCurrency(parseFloat(employeePayroll.gross_pay.toString()))}
        </td>

        {/* Net Pay (Take Home — includes rounding) */}
        <td className="px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
          {formatCurrency(
            employeePayroll.setelah_digenapkan != null
              ? parseFloat(employeePayroll.setelah_digenapkan.toString())
              : parseFloat(employeePayroll.net_pay.toString())
          )}
        </td>

        {/* Actions */}
        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
          <div
            className={clsx(
              "flex items-center justify-center gap-1 transition-opacity",
              isProcessingThis ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            {/* Process this employee */}
            <button
              onClick={handleProcess}
              disabled={isProcessingDisabled}
              className={clsx(
                "flex items-center justify-center p-1.5 rounded-lg border border-sky-100 dark:border-sky-800 transition-colors",
                isProcessingDisabled
                  ? "text-default-400 dark:text-gray-500 cursor-wait"
                  : "hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-600 dark:text-sky-400"
              )}
              title="Process this employee"
            >
              <IconRefresh
                size={16}
                className={isProcessingThis ? "animate-spin" : ""}
              />
            </button>
            {/* Print Payslip */}
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className={clsx(
                "flex items-center justify-center p-1.5 rounded-lg border border-sky-100 dark:border-sky-800 transition-colors",
                isPrinting
                  ? "text-default-400 dark:text-gray-500 cursor-wait"
                  : "hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-600 dark:text-sky-400"
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
