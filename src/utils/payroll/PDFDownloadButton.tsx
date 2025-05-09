// src/utils/payroll/PDFDownloadButton.tsx
import React, { useState } from "react";
import Button from "../../components/Button";
import { IconDownload } from "@tabler/icons-react";
import {
  downloadSinglePaySlip,
  downloadBatchPaySlips,
} from "./generatePaySlipPDF";
import { EmployeePayroll } from "../../types/types";
import toast from "react-hot-toast";
import { getEmployeePayrollDetailsBatch } from "./payrollUtils";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";

// Define interfaces
interface SinglePDFButtonProps {
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
}

interface BatchPDFButtonProps {
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
  onComplete?: () => void;
  title?: string;
}

/**
 * Button component for downloading a single payslip as PDF
 */
export const SinglePaySlipPDFButton: React.FC<SinglePDFButtonProps> = ({
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
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

  // Generate default filename if none provided
  const defaultFileName = `PaySlip-${payroll.employee_id}-${payroll.year}-${payroll.month}.pdf`;
  const finalFileName = fileName || defaultFileName;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Find staff details
      const employeeStaff = staffs.find(
        (staff) => staff.id === payroll.employee_id
      );
      const jobInfo = jobs.find((job) => job.id === payroll.job_type);

      const staffDetails = {
        name: employeeStaff?.name || payroll.employee_name || "",
        icNo: employeeStaff?.icNo || "",
        jobName: jobInfo?.name || payroll.job_type,
        section: payroll.section,
      };

      await downloadSinglePaySlip(payroll, companyName, staffDetails);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error(
        "Failed to download PDF: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    } finally {
      setIsDownloading(false);
    }
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
 * Button component for downloading multiple payslips as a single PDF
 */
export const BatchPaySlipPDFButton: React.FC<BatchPDFButtonProps> = ({
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
  title = "Download Payslips",
  onComplete,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

  // Generate default batch filename if none provided
  const month = payrolls[0]?.month || new Date().getMonth() + 1;
  const year = payrolls[0]?.year || new Date().getFullYear();
  const defaultFileName = `PaySlips-Batch-${year}-${month}.pdf`;
  const finalFileName = fileName || defaultFileName;

  // Set default button text based on number of payrolls
  const defaultButtonText =
    payrolls.length === 1 ? "Download PDF" : `Download ${payrolls.length} PDFs`;

  const finalButtonText = buttonText || defaultButtonText;

  const handleDownload = async () => {
    if (payrolls.length === 0) {
      toast.error("No payslips selected for download");
      return;
    }

    // Get payroll IDs for valid payrolls
    const payrollIds = payrolls
      .filter((payroll) => payroll && payroll.id)
      .map((payroll) => payroll.id as number);

    if (payrollIds.length === 0) {
      toast.error("No valid payslips to download");
      return;
    }

    setIsDownloading(true);
    try {
      // Fetch detailed payroll data for all selected payrolls
      const detailedPayrolls = await getEmployeePayrollDetailsBatch(payrollIds);

      if (detailedPayrolls.length === 0) {
        toast.error("Failed to fetch payroll details");
        return;
      }

      // Create a map of employee details
      const staffDetailsMap: Record<
        string,
        {
          name: string;
          icNo: string;
          jobName: string;
          section: string;
        }
      > = {};

      detailedPayrolls.forEach((payroll) => {
        const employeeStaff = staffs.find(
          (staff) => staff.id === payroll.employee_id
        );
        const jobInfo = jobs.find((job) => job.id === payroll.job_type);

        staffDetailsMap[payroll.employee_id] = {
          name: employeeStaff?.name || payroll.employee_name || "",
          icNo: employeeStaff?.icNo || "",
          jobName: jobInfo?.name || payroll.job_type,
          section: payroll.section,
        };
      });

      // Download the batch of payslips with detailed data
      await downloadBatchPaySlips(
        detailedPayrolls,
        companyName,
        staffDetailsMap
      );

      toast.success(
        `${detailedPayrolls.length} payslip${
          detailedPayrolls.length > 1 ? "s" : ""
        } downloaded successfully`
      );

      if (onComplete) onComplete();
    } catch (error) {
      console.error("Error downloading batch PDF:", error);
      toast.error(
        "Failed to download PDFs: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    } finally {
      setIsDownloading(false);
    }
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
      title={title}
    >
      {isDownloading ? "Preparing..." : finalButtonText}
    </Button>
  );
};
