// src/components/Payroll/PayslipButtons.tsx
import React, { useState } from "react";
import { IconDownload, IconPrinter } from "@tabler/icons-react";
import { EmployeePayroll } from "../../types/types";
import {
  downloadPayslip,
  downloadBatchPayslips,
  printPayslip,
  printBatchPayslips,
  StaffDetails,
  createStaffDetailsMap,
} from "../../utils/payroll/PayslipManager";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
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
  onComplete?: () => void;
}

/**
 * Button component for downloading a single payslip
 */
export const DownloadPayslipButton: React.FC<PayslipButtonProps> = ({
  payroll,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  fileName,
  buttonText = "Download PDF",
  disabled = false,
  icon = true,
  className = "",
  variant = "outline",
  color = "sky",
  size = "md",
  staffDetails,
  onComplete,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

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
      fileName,
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
      {isDownloading ? "Preparing..." : buttonText}
    </Button>
  );
};

/**
 * Button component for downloading multiple payslips
 */
export const DownloadBatchPayslipsButton: React.FC<BatchPayslipButtonProps> = ({
  payrolls,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  fileName,
  buttonText,
  disabled = false,
  icon = true,
  className = "",
  variant = "outline",
  color = "sky",
  size = "md",
  staffDetailsMap,
  onComplete,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

  // Generate default batch filename if none provided
  const month = payrolls[0]?.month || new Date().getMonth() + 1;
  const year = payrolls[0]?.year || new Date().getFullYear();

  // Set default button text based on number of payrolls
  const defaultButtonText =
    payrolls.length === 1 ? "Download PDF" : `Download ${payrolls.length} PDFs`;

  const finalButtonText = buttonText || defaultButtonText;

  const handleDownload = async () => {
    // If staff details map wasn't provided, create one from cache
    const details =
      staffDetailsMap || createStaffDetailsMap(payrolls, staffs, jobs);

    setIsDownloading(true);

    await downloadBatchPayslips(payrolls, details, {
      companyName,
      fileName,
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
      {isDownloading ? "Preparing..." : finalButtonText}
    </Button>
  );
};

/**
 * Button component for printing a single payslip
 */
export const PrintPayslipButton: React.FC<PayslipButtonProps> = ({
  payroll,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  buttonText = "Print Payslip",
  disabled = false,
  icon = true,
  className = "",
  variant = "outline",
  color = "sky",
  size = "md",
  staffDetails,
  onComplete,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

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
        {isPrinting ? "Printing..." : buttonText}
      </Button>

      {showOverlay && (
        <LoadingOverlay
          message="Preparing payslip for printing..."
          processingMessage="Opening print dialog..."
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
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  buttonText,
  disabled = false,
  icon = true,
  className = "",
  variant = "outline",
  color = "sky",
  size = "md",
  staffDetailsMap,
  onComplete,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

  // Set default button text based on number of payrolls
  const defaultButtonText =
    payrolls.length === 1
      ? "Print Payslip"
      : `Print ${payrolls.length} Payslips`;

  const finalButtonText = buttonText || defaultButtonText;

  const handlePrint = async () => {
    // If staff details map wasn't provided, create one from cache
    const details =
      staffDetailsMap || createStaffDetailsMap(payrolls, staffs, jobs);

    setIsPrinting(true);
    setShowOverlay(true);

    await printBatchPayslips(payrolls, details, {
      companyName,
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
        {isPrinting ? "Printing..." : finalButtonText}
      </Button>

      {showOverlay && (
        <LoadingOverlay
          message={`Preparing ${payrolls.length} payslip${
            payrolls.length !== 1 ? "s" : ""
          } for printing...`}
          processingMessage="Opening print dialog..."
          onClose={() => setShowOverlay(false)}
        />
      )}
    </>
  );
};
