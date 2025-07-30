// src/utils/payroll/PayslipManager.ts
import { pdf, Document } from "@react-pdf/renderer";
import PaySlipPDF from "./PaySlipPDF";
import { EmployeePayroll } from "../../types/types";
import { MidMonthPayroll } from "./midMonthPayrollUtils";
import toast from "react-hot-toast";
import React from "react";
import {
  getEmployeePayrollDetails,
  getEmployeePayrollDetailsBatch,
} from "./payrollUtils";

// Types
export interface StaffDetails {
  name: string;
  icNo: string;
  jobName: string;
  section: string;
}

export interface PrintOptions {
  companyName?: string;
  midMonthPayroll?: MidMonthPayroll | null;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
  onError?: (error: Error) => void;
  timeout?: number; // Default timeout before considering print complete
}

export interface DownloadOptions {
  companyName?: string;
  fileName?: string;
  midMonthPayroll?: MidMonthPayroll | null;
  onBeforeDownload?: () => void;
  onAfterDownload?: () => void;
  onError?: (error: Error) => void;
}

// Common PDF generation for both printing and downloading
const generatePayslipPDF = async (
  payroll: EmployeePayroll,
  staffDetails?: StaffDetails,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  midMonthPayroll?: MidMonthPayroll | null
): Promise<Blob> => {
  // Create React elements with createElement instead of JSX
  const paySlipElement = React.createElement(PaySlipPDF, {
    payroll,
    companyName,
    staffDetails,
    midMonthPayroll,
  });

  const documentElement = React.createElement(Document, {}, paySlipElement);

  return await pdf(documentElement).toBlob();
};

const generateBatchPayslipPDF = async (
  payrolls: EmployeePayroll[],
  staffDetailsMap?: Record<string, StaffDetails>,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  midMonthPayrollsMap?: Record<string, MidMonthPayroll | null>
): Promise<Blob> => {
  // Map payrolls to React elements
  const paySlipElements = payrolls.map((payroll, index) =>
    React.createElement(PaySlipPDF, {
      key: index,
      payroll,
      companyName,
      staffDetails: staffDetailsMap?.[payroll.employee_id],
      midMonthPayroll: midMonthPayrollsMap?.[payroll.employee_id],
    })
  );

  const documentElement = React.createElement(Document, {}, ...paySlipElements);

  return await pdf(documentElement).toBlob();
};

// Core functionality for downloading
export const downloadPayslip = async (
  payroll: EmployeePayroll,
  staffDetails?: StaffDetails,
  options?: DownloadOptions
): Promise<void> => {
  const {
    companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
    fileName,
    midMonthPayroll,
    onBeforeDownload,
    onAfterDownload,
    onError,
  } = options || {};

  try {
    if (onBeforeDownload) onBeforeDownload();

    const blob = await generatePayslipPDF(
      payroll,
      staffDetails,
      companyName,
      midMonthPayroll
    );
    const defaultFileName = `PaySlip-${payroll.employee_id}-${payroll.year}-${payroll.month}.pdf`;
    const finalFileName = fileName || defaultFileName;

    // Create download link
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = finalFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the object URL
    setTimeout(() => URL.revokeObjectURL(link.href), 100);

    if (onAfterDownload) onAfterDownload();
  } catch (error) {
    console.error("Error downloading PDF:", error);
    const errorObj =
      error instanceof Error
        ? error
        : new Error("Unknown error during download");
    toast.error(`Failed to download: ${errorObj.message}`);
    if (onError) onError(errorObj);
  }
};

export const downloadBatchPayslips = async (
  payrolls: EmployeePayroll[],
  staffDetailsMap?: Record<string, StaffDetails>,
  options?: DownloadOptions & {
    midMonthPayrollsMap?: Record<string, MidMonthPayroll | null>;
  }
): Promise<void> => {
  const {
    companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
    fileName,
    midMonthPayrollsMap,
    onBeforeDownload,
    onAfterDownload,
    onError,
  } = options || {};

  if (payrolls.length === 0) {
    toast.error("No payslips selected for download");
    if (onError) onError(new Error("No payslips selected"));
    return;
  }

  try {
    if (onBeforeDownload) onBeforeDownload();

    // Fetch complete payroll data for the batch
    const payrollIdsToFetch = payrolls
      .map((p) => p.id)
      .filter((id) => id !== undefined) as number[];

    let completePayrolls = [...payrolls];

    if (payrollIdsToFetch.length > 0) {
      try {
        const fetchedPayrolls = await getEmployeePayrollDetailsBatch(
          payrollIdsToFetch
        );

        if (
          fetchedPayrolls &&
          Array.isArray(fetchedPayrolls) &&
          fetchedPayrolls.length > 0
        ) {
          completePayrolls = payrolls.map((payroll) => {
            const completePayroll = fetchedPayrolls.find(
              (p) => p.id === payroll.id
            );
            return completePayroll || payroll;
          });
        }
      } catch (error) {
        console.warn("Error fetching batch payroll data:", error);
        // Continue with what we have
      }
    }

    const blob = await generateBatchPayslipPDF(
      completePayrolls,
      staffDetailsMap,
      companyName,
      midMonthPayrollsMap
    );

    // Get month/year info from the first payroll
    const month = payrolls[0]?.month || new Date().getMonth() + 1;
    const year = payrolls[0]?.year || new Date().getFullYear();
    const defaultFileName = `PaySlips-Batch-${year}-${month}.pdf`;
    const finalFileName = fileName || defaultFileName;

    // Create download link
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = finalFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the object URL
    setTimeout(() => URL.revokeObjectURL(link.href), 100);

    toast.success(
      `${payrolls.length} payslip${
        payrolls.length > 1 ? "s" : ""
      } downloaded successfully`
    );
    if (onAfterDownload) onAfterDownload();
  } catch (error) {
    console.error("Error downloading batch PDFs:", error);
    const errorObj =
      error instanceof Error
        ? error
        : new Error("Unknown error during batch download");
    toast.error(`Failed to download: ${errorObj.message}`);
    if (onError) onError(errorObj);
  }
};

// Core functionality for printing
export const printPayslip = async (
  payroll: EmployeePayroll,
  staffDetails?: StaffDetails,
  options?: PrintOptions
): Promise<void> => {
  const {
    companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
    midMonthPayroll,
    onBeforePrint,
    onAfterPrint,
    onError,
    timeout = 60000,
  } = options || {};

  // Print resources tracking
  let printFrame: HTMLIFrameElement | null = null;
  let pdfUrl: string | null = null;
  let hasPrinted = false;

  try {
    if (onBeforePrint) onBeforePrint();

    // Fetch detailed payroll data if we have an ID
    let completePayroll = payroll;
    if (payroll.id) {
      try {
        completePayroll = await getEmployeePayrollDetails(payroll.id);
      } catch (error) {
        console.warn("Error fetching complete payroll data:", error);
        // Continue with what we have
      }
    }

    const blob = await generatePayslipPDF(
      completePayroll,
      staffDetails,
      companyName,
      midMonthPayroll
    );
    pdfUrl = URL.createObjectURL(blob);

    printFrame = document.createElement("iframe");
    printFrame.style.display = "none";
    document.body.appendChild(printFrame);

    printFrame.onload = () => {
      if (!hasPrinted && printFrame?.contentWindow) {
        hasPrinted = true;
        // Use a slight delay to ensure content is fully loaded
        setTimeout(() => {
          printFrame?.contentWindow?.print();
        }, 500);
        
        // Note: Auto cleanup removed - print dialog will stay open until user closes it
        if (onAfterPrint) onAfterPrint();
      }
    };

    printFrame.src = pdfUrl;
  } catch (error) {
    console.error("Error printing PDF:", error);
    const errorObj =
      error instanceof Error ? error : new Error("Unknown error during print");
    toast.error(`Failed to print: ${errorObj.message}`);
    if (onError) onError(errorObj);
    // Manual cleanup on error
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    if (printFrame && printFrame.parentNode) {
      document.body.removeChild(printFrame);
    }
  }
};

export const printBatchPayslips = async (
  payrolls: EmployeePayroll[],
  staffDetailsMap?: Record<string, StaffDetails>,
  options?: PrintOptions & {
    midMonthPayrollsMap?: Record<string, MidMonthPayroll | null>;
  }
): Promise<void> => {
  const {
    companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
    midMonthPayrollsMap,
    onBeforePrint,
    onAfterPrint,
    onError,
    timeout = 60000,
  } = options || {};

  if (payrolls.length === 0) {
    toast.error("No payslips selected for printing");
    if (onError) onError(new Error("No payslips selected"));
    return;
  }

  // Print resources tracking
  let printFrame: HTMLIFrameElement | null = null;
  let pdfUrl: string | null = null;
  let hasPrinted = false;

  try {
    if (onBeforePrint) onBeforePrint();

    // Fetch complete payroll data for the batch
    const payrollIdsToFetch = payrolls
      .map((p) => p.id)
      .filter((id) => id !== undefined) as number[];

    let completePayrolls = [...payrolls];

    if (payrollIdsToFetch.length > 0) {
      try {
        const fetchedPayrolls = await getEmployeePayrollDetailsBatch(
          payrollIdsToFetch
        );

        if (
          fetchedPayrolls &&
          Array.isArray(fetchedPayrolls) &&
          fetchedPayrolls.length > 0
        ) {
          completePayrolls = payrolls.map((payroll) => {
            const completePayroll = fetchedPayrolls.find(
              (p) => p.id === payroll.id
            );
            return completePayroll || payroll;
          });
        }
      } catch (error) {
        console.warn("Error fetching batch payroll data:", error);
        // Continue with what we have
      }
    }

    const blob = await generateBatchPayslipPDF(
      completePayrolls,
      staffDetailsMap,
      companyName,
      midMonthPayrollsMap
    );
    pdfUrl = URL.createObjectURL(blob);

    printFrame = document.createElement("iframe");
    printFrame.style.display = "none";
    document.body.appendChild(printFrame);

    printFrame.onload = () => {
      if (!hasPrinted && printFrame?.contentWindow) {
        hasPrinted = true;
        // Use a slight delay to ensure content is fully loaded
        setTimeout(() => {
          printFrame?.contentWindow?.print();
        }, 500);

        // Note: Auto cleanup removed - print dialog will stay open until user closes it
        if (onAfterPrint) onAfterPrint();
      }
    };

    printFrame.src = pdfUrl;
  } catch (error) {
    console.error("Error printing batch PDFs:", error);
    const errorObj =
      error instanceof Error
        ? error
        : new Error("Unknown error during batch print");
    toast.error(`Failed to print: ${errorObj.message}`);
    if (onError) onError(errorObj);
    // Manual cleanup on error
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    if (printFrame && printFrame.parentNode) {
      document.body.removeChild(printFrame);
    }
  }
};

// Helper to get staff details from cache
export const getStaffDetailsFromCache = (
  employeeId: string,
  jobTypeId: string,
  section: string,
  staffs: any[],
  jobs: any[]
): StaffDetails => {
  const employeeStaff = staffs.find((staff) => staff.id === employeeId);
  const jobInfo = jobs.find((job) => job.id === jobTypeId);

  return {
    name: employeeStaff?.name || "",
    icNo: employeeStaff?.icNo || "",
    jobName: jobInfo?.name || jobTypeId,
    section: section || "",
  };
};

// Helper to create staff details map
export const createStaffDetailsMap = (
  payrolls: EmployeePayroll[],
  staffs: any[],
  jobs: any[]
): Record<string, StaffDetails> => {
  const staffDetailsMap: Record<string, StaffDetails> = {};

  payrolls.forEach((payroll) => {
    staffDetailsMap[payroll.employee_id] = getStaffDetailsFromCache(
      payroll.employee_id,
      payroll.job_type,
      payroll.section,
      staffs,
      jobs
    );
  });

  return staffDetailsMap;
};

// Helper to create mid-month payrolls map
export const createMidMonthPayrollsMap = (
  midMonthPayrolls: MidMonthPayroll[],
  employeeIds: string[]
): Record<string, MidMonthPayroll | null> => {
  const midMonthPayrollsMap: Record<string, MidMonthPayroll | null> = {};

  // Initialize all employee IDs with null
  employeeIds.forEach((id) => {
    midMonthPayrollsMap[id] = null;
  });

  // Add existing mid-month payrolls to the map
  midMonthPayrolls.forEach((payroll) => {
    midMonthPayrollsMap[payroll.employee_id] = payroll;
  });

  return midMonthPayrollsMap;
};
