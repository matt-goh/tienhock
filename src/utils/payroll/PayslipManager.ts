// src/utils/payroll/PayslipManager.ts
import { EmployeePayroll } from "../../types/types";
import { MidMonthPayroll } from "./midMonthPayrollUtils";
import toast from "react-hot-toast";
import {
  getEmployeePayrollDetails,
  getEmployeePayrollDetailsBatch,
} from "./payrollUtils";
import {
  getPaySlipPDFBlob,
  getBatchPaySlipPDFBlob,
  PayslipPrintMode,
} from "./PaySlipPDFMake";
import { printPdfFrameWithFallback } from "../pdfPrintFallback";

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
  // Which slip(s) to print. Print flows default to "individual" (per-job
  // breakdowns) since that's what HR prints most of the time.
  mode?: PayslipPrintMode;
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
  midMonthPayroll?: MidMonthPayroll | null,
  mode: PayslipPrintMode = "both"
): Promise<Blob> => {
  return await getPaySlipPDFBlob({
    payroll,
    companyName,
    staffDetails,
    midMonthPayroll,
    mode,
  });
};

const generateBatchPayslipPDF = async (
  payrolls: EmployeePayroll[],
  staffDetailsMap?: Record<string, StaffDetails>,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  midMonthPayrollsMap?: Record<string, MidMonthPayroll | null>,
  mode: PayslipPrintMode = "both"
): Promise<Blob> => {
  return await getBatchPaySlipPDFBlob(
    payrolls,
    staffDetailsMap,
    companyName,
    midMonthPayrollsMap,
    mode
  );
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

    // The /batch call already returns each payroll's mid-month payroll, so build
    // the map from that instead of requiring a separate fetch. Any caller-
    // supplied map is kept as a fallback for payrolls that weren't re-fetched.
    const effectiveMidMonthMap = buildMidMonthMapFromPayrolls(
      completePayrolls,
      midMonthPayrollsMap
    );

    const blob = await generateBatchPayslipPDF(
      completePayrolls,
      staffDetailsMap,
      companyName,
      effectiveMidMonthMap
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

// Tell the user what was actually sent to print. Only fires for multi-job
// (grouped) payrolls — that's where combined vs per-job differs; single-job
// staff have one slip and the print dialog itself is feedback enough.
const notifyPrintMode = (
  payroll: EmployeePayroll,
  mode: PayslipPrintMode
): void => {
  const isGrouped = !!payroll.job_type && payroll.job_type.includes(", ");
  if (!isGrouped) return;

  const jobCount = payroll.job_type.split(", ").length;
  const siblingIds = Object.keys(payroll.employee_job_mapping || {});
  const idList = siblingIds.length > 0 ? ` (${siblingIds.join(", ")})` : "";

  if (mode === "combined") {
    toast.success("Printing combined slip only");
  } else if (mode === "both") {
    toast.success(`Printing combined slip + ${jobCount} per-job slips`);
  } else {
    toast.success(`Printing ${jobCount} per-job slips${idList}`);
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
    mode = "individual",
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
      midMonthPayroll,
      mode
    );
    notifyPrintMode(completePayroll, mode);
    pdfUrl = URL.createObjectURL(blob);

    printFrame = document.createElement("iframe");
    printFrame.style.display = "none";
    document.body.appendChild(printFrame);

    printFrame.onload = () => {
      if (!hasPrinted && printFrame?.contentWindow) {
        hasPrinted = true;
        // Use a slight delay to ensure content is fully loaded
        setTimeout(() => {
          if (printFrame && pdfUrl) {
            printPdfFrameWithFallback(printFrame, pdfUrl);
          }
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
    mode = "individual",
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

    // The /batch call already returns each payroll's mid-month payroll, so build
    // the map from that instead of requiring a separate fetch. Any caller-
    // supplied map is kept as a fallback for payrolls that weren't re-fetched.
    const effectiveMidMonthMap = buildMidMonthMapFromPayrolls(
      completePayrolls,
      midMonthPayrollsMap
    );

    const blob = await generateBatchPayslipPDF(
      completePayrolls,
      staffDetailsMap,
      companyName,
      effectiveMidMonthMap,
      mode
    );

    // Mode feedback, only when the batch contains multi-job staff (for everyone
    // else combined vs per-job makes no difference).
    const groupedCount = completePayrolls.filter(
      (p) => !!p.job_type && p.job_type.includes(", ")
    ).length;
    if (groupedCount > 0) {
      const employeeWord = groupedCount === 1 ? "employee" : "employees";
      if (mode === "combined") {
        toast.success(
          `Printing ${completePayrolls.length} payslips (combined slips only)`
        );
      } else if (mode === "both") {
        toast.success(
          `Printing ${completePayrolls.length} payslips (combined + per-job slips)`
        );
      } else {
        toast.success(
          `Printing ${completePayrolls.length} payslips — per-job slips for ${groupedCount} multi-job ${employeeWord}`
        );
      }
    }
    pdfUrl = URL.createObjectURL(blob);

    printFrame = document.createElement("iframe");
    printFrame.style.display = "none";
    document.body.appendChild(printFrame);

    printFrame.onload = () => {
      if (!hasPrinted && printFrame?.contentWindow) {
        hasPrinted = true;
        // Use a slight delay to ensure content is fully loaded
        setTimeout(() => {
          if (printFrame && pdfUrl) {
            printPdfFrameWithFallback(printFrame, pdfUrl);
          }
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

// Helper to build the mid-month map from payrolls already fetched via the
// /batch endpoint (which embeds each payroll's mid_month_payroll). This lets
// the print/download flows avoid a separate mid-month API call. A caller-
// supplied fallback map covers any payroll that wasn't re-fetched.
export const buildMidMonthMapFromPayrolls = (
  payrolls: EmployeePayroll[],
  fallbackMap?: Record<string, MidMonthPayroll | null>
): Record<string, MidMonthPayroll | null> => {
  const map: Record<string, MidMonthPayroll | null> = { ...(fallbackMap || {}) };
  payrolls.forEach((payroll) => {
    if (payroll.mid_month_payroll) {
      map[payroll.employee_id] = payroll.mid_month_payroll;
    }
  });
  return map;
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
