// src/utils/payroll/PayslipButtons.tsx
import React, { useState } from "react";
import { IconDownload, IconPrinter } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { EmployeePayroll } from "../../types/types";
import { MidMonthPayroll } from "./midMonthPayrollUtils";
import {
  downloadPayslip,
  downloadBatchPayslips,
  printPayslip,
  printBatchPayslips,
  StaffDetails,
  createStaffDetailsMap,
} from "../../utils/payroll/PayslipManager";
import { PayslipPrintMode } from "../../utils/payroll/PaySlipPDFMake";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useJPStaffsCache } from "../../utils/JellyPolly/useJPStaffsCache";
import { useJPJobsCache } from "../../utils/JellyPolly/useJPJobsCache";
import Button from "../../components/Button";
import LoadingOverlay from "../../components/Payroll/LoadingOverlay";

// Types for buttons
export interface PayslipButtonProps {
  payroll: EmployeePayroll;
  companyName?: string;
  fileName?: string;
  buttonText?: string;
  disabled?: boolean;
  icon?: boolean;
  className?: string;
  variant?: "default" | "outline" | "boldOutline" | "filled";
  color?: string;
  size?: "sm" | "md" | "lg";
  staffDetails?: StaffDetails;
  midMonthPayroll?: MidMonthPayroll | null;
  // Which slip(s) to print; defaults to the print flow's "individual" breakdown.
  mode?: PayslipPrintMode;
  // Catalogue source for fallback staff/job details (JP has its own catalogue)
  company?: "tienhock" | "jellypolly";
  onComplete?: () => void;
}

export interface BatchPayslipButtonProps {
  payrolls: EmployeePayroll[];
  companyName?: string;
  fileName?: string;
  buttonText?: string;
  disabled?: boolean;
  icon?: boolean;
  className?: string;
  variant?: "default" | "outline" | "boldOutline" | "filled";
  color?: string;
  size?: "sm" | "md" | "lg";
  staffDetailsMap?: Record<string, StaffDetails>;
  midMonthPayrollsMap?: Record<string, MidMonthPayroll | null>;
  // Catalogue source for fallback staff/job details (JP has its own catalogue)
  company?: "tienhock" | "jellypolly";
  onComplete?: () => void;
}

/**
 * Button component for downloading a single payslip
 */
export const DownloadPayslipButton: React.FC<PayslipButtonProps> = ({
  payroll,
  companyName = "TIEN HOCK FOOD INDUSTRIES SDN BHD",
  fileName,
  buttonText,
  disabled = false,
  icon = true,
  className = "",
  variant = "outline",
  color = "sky",
  size = "md",
  staffDetails,
  midMonthPayroll,
  company = "tienhock",
  onComplete,
}) => {
  const { t } = useTranslation("payroll");
  const [isDownloading, setIsDownloading] = useState(false);
  const { staffs: thStaffs } = useStaffsCache();
  const { staffs: jpStaffs } = useJPStaffsCache();
  const staffs = company === "jellypolly" ? jpStaffs : thStaffs;
  const { jobs: thJobs } = useJobsCache();
  const { jobs: jpJobs } = useJPJobsCache();
  const jobs = company === "jellypolly" ? jpJobs : thJobs;

  const handleDownload = async () => {
    // If staff details weren't provided, try to get them from cache
    const details = staffDetails || {
      name: payroll.employee_name || "",
      icNo: staffs.find((s) => s.id === payroll.employee_id)?.icNo || "",
      jobName:
        jobs.find((j) => j.id === payroll.job_type)?.name || payroll.job_type,
      section: payroll.section || "",
    };

    setIsDownloading(true);

    await downloadPayslip(payroll, details, {
      companyName,
      company,
      fileName,
      midMonthPayroll,
      onAfterDownload: () => {
        setIsDownloading(false);
        if (onComplete) onComplete();
      },
      onError: () => {
        setIsDownloading(false);
      },
    });
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={disabled || isDownloading}
      icon={icon ? IconDownload : undefined}
      className={className}
      variant={variant}
      color={color}
      size={size}
    >
      {isDownloading ? t("Preparing...") : buttonText ?? t("Download PDF")}
    </Button>
  );
};

/**
 * Button component for downloading multiple payslips
 */
export const DownloadBatchPayslipsButton: React.FC<BatchPayslipButtonProps> = ({
  payrolls,
  companyName = "TIEN HOCK FOOD INDUSTRIES SDN BHD",
  fileName,
  buttonText,
  disabled = false,
  icon = true,
  className = "",
  variant = "outline",
  color = "sky",
  size = "md",
  staffDetailsMap,
  midMonthPayrollsMap,
  company = "tienhock",
  onComplete,
}) => {
  const { t } = useTranslation("payroll");
  const [isDownloading, setIsDownloading] = useState(false);
  const { staffs: thStaffs } = useStaffsCache();
  const { staffs: jpStaffs } = useJPStaffsCache();
  const staffs = company === "jellypolly" ? jpStaffs : thStaffs;
  const { jobs: thJobs } = useJobsCache();
  const { jobs: jpJobs } = useJPJobsCache();
  const jobs = company === "jellypolly" ? jpJobs : thJobs;

  // Generate default batch filename if none provided
  const month = payrolls[0]?.month || new Date().getMonth() + 1;
  const year = payrolls[0]?.year || new Date().getFullYear();

  // Set default button text based on number of payrolls
  const defaultButtonText =
    payrolls.length === 1
      ? t("Download PDF")
      : t("Download {{count}} PDFs", { count: payrolls.length });

  const finalButtonText = buttonText || defaultButtonText;

  const handleDownload = async () => {
    // If staff details map wasn't provided, create one from cache
    const details =
      staffDetailsMap || createStaffDetailsMap(payrolls, staffs, jobs);

    setIsDownloading(true);

    await downloadBatchPayslips(payrolls, details, {
      companyName,
      company,
      fileName,
      midMonthPayrollsMap,
      onAfterDownload: () => {
        setIsDownloading(false);
        if (onComplete) onComplete();
      },
      onError: () => {
        setIsDownloading(false);
      },
    });
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={disabled || isDownloading || payrolls.length === 0}
      icon={icon ? IconDownload : undefined}
      className={className}
      variant={variant}
      color={color}
      size={size}
    >
      {isDownloading ? t("Preparing...") : finalButtonText}
    </Button>
  );
};

/**
 * Button component for printing a single payslip
 */
export const PrintPayslipButton: React.FC<PayslipButtonProps> = ({
  payroll,
  companyName = "TIEN HOCK FOOD INDUSTRIES SDN BHD",
  buttonText,
  disabled = false,
  icon = true,
  className = "",
  variant = "outline",
  color = "sky",
  size = "md",
  staffDetails,
  midMonthPayroll,
  mode,
  company = "tienhock",
  onComplete,
}) => {
  const { t } = useTranslation("payroll");
  const [isPrinting, setIsPrinting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const { staffs: thStaffs } = useStaffsCache();
  const { staffs: jpStaffs } = useJPStaffsCache();
  const staffs = company === "jellypolly" ? jpStaffs : thStaffs;
  const { jobs: thJobs } = useJobsCache();
  const { jobs: jpJobs } = useJPJobsCache();
  const jobs = company === "jellypolly" ? jpJobs : thJobs;

  const handlePrint = async () => {
    // If staff details weren't provided, try to get them from cache
    const details = staffDetails || {
      name: payroll.employee_name || "",
      icNo: staffs.find((s) => s.id === payroll.employee_id)?.icNo || "",
      jobName:
        jobs.find((j) => j.id === payroll.job_type)?.name || payroll.job_type,
      section: payroll.section || "",
    };

    setIsPrinting(true);
    setShowOverlay(true);

    await printPayslip(payroll, details, {
      companyName,
      company,
      midMonthPayroll,
      mode,
      onBeforePrint: () => {
        setShowOverlay(true);
      },
      onAfterPrint: () => {
        setIsPrinting(false);
        setShowOverlay(false);
        if (onComplete) onComplete();
      },
      onError: () => {
        setIsPrinting(false);
        setShowOverlay(false);
      },
    });
  };

  return (
    <>
      <Button
        onClick={handlePrint}
        disabled={disabled || isPrinting}
        icon={icon ? IconPrinter : undefined}
        className={className}
        variant={variant}
        color={color}
        size={size}
      >
        {isPrinting ? t("Printing...") : buttonText ?? t("Print Payslip")}
      </Button>

      {showOverlay && (
        <LoadingOverlay
          message={t("Preparing payslip for printing...")}
          processingMessage={t("Opening print dialog...")}
          onClose={() => setShowOverlay(false)}
        />
      )}
    </>
  );
};

/**
 * Button component for printing multiple payslips
 */
export const PrintBatchPayslipsButton: React.FC<BatchPayslipButtonProps> = ({
  payrolls,
  companyName = "TIEN HOCK FOOD INDUSTRIES SDN BHD",
  buttonText,
  disabled = false,
  icon = true,
  className = "",
  variant = "outline",
  color = "sky",
  size = "md",
  staffDetailsMap,
  midMonthPayrollsMap,
  company = "tienhock",
  onComplete,
}) => {
  const { t } = useTranslation("payroll");
  const [isPrinting, setIsPrinting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const { staffs: thStaffs } = useStaffsCache();
  const { staffs: jpStaffs } = useJPStaffsCache();
  const staffs = company === "jellypolly" ? jpStaffs : thStaffs;
  const { jobs: thJobs } = useJobsCache();
  const { jobs: jpJobs } = useJPJobsCache();
  const jobs = company === "jellypolly" ? jpJobs : thJobs;

  // Set default button text based on number of payrolls
  const defaultButtonText =
    payrolls.length === 1
      ? t("Print Payslip")
      : t("Print {{count}} Payslips", { count: payrolls.length });

  const finalButtonText = buttonText || defaultButtonText;

  const handlePrint = async () => {
    // If staff details map wasn't provided, create one from cache
    const details =
      staffDetailsMap || createStaffDetailsMap(payrolls, staffs, jobs);

    setIsPrinting(true);
    setShowOverlay(true);

    await printBatchPayslips(payrolls, details, {
      companyName,
      company,
      midMonthPayrollsMap,
      onBeforePrint: () => {
        setShowOverlay(true);
      },
      onAfterPrint: () => {
        setIsPrinting(false);
        setShowOverlay(false);
        if (onComplete) onComplete();
      },
      onError: () => {
        setIsPrinting(false);
        setShowOverlay(false);
      },
    });
  };

  return (
    <>
      <Button
        onClick={handlePrint}
        disabled={disabled || isPrinting || payrolls.length === 0}
        icon={icon ? IconPrinter : undefined}
        className={className}
        variant={variant}
        color={color}
        size={size}
      >
        {isPrinting ? t("Printing...") : finalButtonText}
      </Button>

      {showOverlay && (
        <LoadingOverlay
          message={t(
            payrolls.length === 1
              ? "Preparing {{count}} payslip for printing..."
              : "Preparing {{count}} payslips for printing...",
            { count: payrolls.length }
          )}
          processingMessage={t("Opening print dialog...")}
          onClose={() => setShowOverlay(false)}
        />
      )}
    </>
  );
};
