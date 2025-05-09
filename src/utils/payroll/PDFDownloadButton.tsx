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

  // Generate default filename if none provided
  const defaultFileName = `PaySlip-${payroll.employee_id}-${payroll.year}-${payroll.month}.pdf`;
  const finalFileName = fileName || defaultFileName;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadSinglePaySlip(payroll, companyName);
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

    setIsDownloading(true);
    try {
      // Get all payroll IDs that need complete data (those without items)
      const payrollIdsToFetch = payrolls
        .filter((p) => !p.items || p.items.length === 0)
        .map((p) => p.id)
        .filter((id) => id !== undefined) as number[];

      let completePayrolls = [...payrolls];

      // Only fetch if there are payrolls needing complete data
      if (payrollIdsToFetch.length > 0) {
        // Use the new batch function to get complete data in one API call
        const fetchedPayrolls = await getEmployeePayrollDetailsBatch(
          payrollIdsToFetch
        );

        // Replace incomplete payrolls with complete ones
        completePayrolls = payrolls.map((payroll) => {
          if (!payroll.items || payroll.items.length === 0) {
            const completePayroll = fetchedPayrolls.find(
              (p) => p.id === payroll.id
            );
            return completePayroll || payroll;
          }
          return payroll;
        });
      }

      // Now generate the PDFs with complete data
      await downloadBatchPaySlips(completePayrolls, companyName);

      toast.success(
        `${completePayrolls.length} payslip${
          completePayrolls.length > 1 ? "s" : ""
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
