// src/components/Payroll/EmployeePayrollCard.tsx
import React, { useState } from "react";
import clsx from "clsx";
import {
  IconBriefcase,
  IconMapPin,
  IconDownload,
  IconPrinter,
  IconLock,
  IconLoader2,
} from "@tabler/icons-react";
import Checkbox from "../Checkbox";
import { EmployeePayroll } from "../../types/types";
import { MidMonthPayroll } from "../../utils/payroll/midMonthPayrollUtils";
import {
  downloadPayslip,
  printPayslip,
} from "../../utils/payroll/PayslipManager";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import LoadingOverlay from "./LoadingOverlay";

interface EmployeePayrollCardProps {
  employeePayroll: EmployeePayroll;
  isSelected: boolean;
  onSelect: (id: number, isSelected: boolean, event: React.MouseEvent) => void;
  onViewDetails: (id: number) => void;
  payrollStatus: string;
  midMonthPayroll?: MidMonthPayroll | null;
}

const EmployeePayrollCard: React.FC<EmployeePayrollCardProps> = ({
  employeePayroll,
  isSelected,
  onSelect,
  onViewDetails,
  payrollStatus,
  midMonthPayroll,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

  const isGroupedPayroll = employeePayroll.job_type?.includes(", ");

  const formatCurrency = (amount: number | string): string => {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(numAmount);
  };

  const formatJobType = (jobType: string): string => {
    if (jobType.startsWith("Grouped: ")) {
      return jobType.replace("Grouped: ", "");
    }
    return jobType;
  };

  const getStaffDetails = () => ({
    name: employeePayroll.employee_name || "",
    icNo: staffs.find((s) => s.id === employeePayroll.employee_id)?.icNo || "",
    jobName:
      jobs.find((j) => j.id === employeePayroll.job_type)?.name ||
      employeePayroll.job_type,
    section: employeePayroll.section || "",
  });

  const handleCardClick = () => {
    if (employeePayroll.id) {
      onViewDetails(employeePayroll.id);
    }
  };

  const handleHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (employeePayroll.id) {
      onSelect(employeePayroll.id, !isSelected, e);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDownloading(true);

    const details = getStaffDetails();

    await downloadPayslip(employeePayroll, details, {
      companyName: "TIEN HOCK FOOD INDUSTRIES S/B",
      midMonthPayroll,
      onAfterDownload: () => {
        setIsDownloading(false);
      },
      onError: () => {
        setIsDownloading(false);
      },
    });
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
      <div
        className={clsx(
          "relative border rounded-lg overflow-hidden bg-white transition-all duration-200",
          isSelected
            ? "shadow-md ring-2 ring-sky-500 ring-offset-1 border-sky-200"
            : "shadow-sm hover:shadow border-default-200",
          "cursor-pointer"
        )}
        onClick={handleCardClick}
      >
        {/* Header - Clickable for selection */}
        <div
          className={clsx(
            "flex justify-between items-center px-4 py-2 border-b cursor-pointer",
            isSelected
              ? "bg-sky-50 border-sky-100"
              : "bg-default-50 border-default-100 hover:bg-default-100"
          )}
          onClick={handleHeaderClick}
        >
          {/* Left: Name (ID) */}
          <div className="flex-1 min-w-0 mr-3">
            <span className="font-semibold text-default-800 truncate block text-sm">
              {employeePayroll.employee_name || "Unknown"}{" "}
              <span className="font-normal text-default-500">
                ({employeePayroll.employee_id})
              </span>
            </span>
          </div>

          {/* Right: Checkbox */}
          <div onClick={handleCheckboxClick}>
            <Checkbox
              checked={isSelected}
              onChange={(checked) => {
                if (employeePayroll.id) {
                  onSelect(
                    employeePayroll.id,
                    checked,
                    new MouseEvent("click") as unknown as React.MouseEvent
                  );
                }
              }}
              size={20}
              aria-label={`Select ${employeePayroll.employee_name || "employee"}`}
            />
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-2">
          {/* Job Type Row */}
          <div className="flex items-center text-sm">
            <IconBriefcase
              size={16}
              className="text-default-400 mr-2 flex-shrink-0"
            />
            <span className="text-default-700 truncate">
              {formatJobType(employeePayroll.job_type)}
            </span>
            {isGroupedPayroll && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">
                Grouped
              </span>
            )}
          </div>

          {/* Section Row */}
          <div className="flex items-center text-sm">
            <IconMapPin
              size={16}
              className="text-default-400 mr-2 flex-shrink-0"
            />
            <span className="text-default-600">{employeePayroll.section}</span>
          </div>

          {/* Pay Summary Row */}
          <div className="flex justify-between items-end pt-2 border-t border-default-100">
            <div>
              <p className="text-xs text-default-500">Gross</p>
              <p className="font-semibold text-default-800 text-sm">
                {formatCurrency(employeePayroll.gross_pay)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-default-500">Net</p>
              <p className="font-semibold text-emerald-600 text-sm">
                {formatCurrency(employeePayroll.net_pay)}
              </p>
            </div>
          </div>
        </div>

        {/* Footer - Quick Actions */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-default-100 bg-default-50">
          {/* Status Badge */}
          <span
            className={clsx(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
              payrollStatus === "Finalized"
                ? "bg-amber-100 text-amber-700"
                : "bg-sky-100 text-sky-700"
            )}
          >
            {payrollStatus === "Finalized" && (
              <IconLock size={12} className="mr-1" />
            )}
            {payrollStatus}
          </span>

          {/* Quick Action Buttons */}
          <div className="flex items-center space-x-1">
            {/* Download Button */}
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className={clsx(
                "p-1.5 rounded transition-colors",
                isDownloading
                  ? "text-default-400 cursor-wait"
                  : "hover:bg-sky-100 text-sky-600"
              )}
              title="Download Payslip"
            >
              {isDownloading ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconDownload size={16} />
              )}
            </button>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className={clsx(
                "p-1.5 rounded transition-colors",
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
        </div>
      </div>

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

export default EmployeePayrollCard;
