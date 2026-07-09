// src/utils/payroll/PayslipManager.ts
import { EmployeePayroll } from "../../types/types";
import { MidMonthPayroll } from "./midMonthPayrollUtils";
import toast from "react-hot-toast";
import {
  getEmployeePayrollDetails,
  getEmployeePayrollDetailsBatch,
} from "./payrollUtils";
import { api } from "../../routes/utils/api";
import { buildJPPayslipPayroll } from "../JellyPolly/buildJPPayslipPayroll";
import {
  getPaySlipPDFBlob,
  getBatchPaySlipPDFBlob,
  PayslipPrintMode,
} from "./PaySlipPDFMake";
import { printPdfFrameWithFallback } from "../pdfPrintFallback";

export type PayslipCompany = "tienhock" | "jellypolly";

// Types
export interface StaffDetails {
  name: string;
  icNo: string;
  jobName: string;
  section: string;
}

export interface PrintOptions {
  companyName?: string;
  company?: PayslipCompany;
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
  company?: PayslipCompany;
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

const toNumber = (value: number | string | null | undefined): number => {
  const amount: number = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizeJPMidMonthPayroll = (
  payroll: any
): MidMonthPayroll | null => {
  const midMonthPayroll = payroll.mid_month_payroll;
  if (!midMonthPayroll) return null;

  return {
    id: Number(midMonthPayroll.id),
    employee_id: midMonthPayroll.employee_id || payroll.employee_id,
    employee_name: midMonthPayroll.employee_name || payroll.employee_name || "",
    year: Number(midMonthPayroll.year ?? payroll.year),
    month: Number(midMonthPayroll.month ?? payroll.month),
    amount: toNumber(midMonthPayroll.amount),
    payment_method: midMonthPayroll.payment_method || "Cash",
    status: midMonthPayroll.status || "Pending",
    created_at: midMonthPayroll.created_at || "",
    updated_at: midMonthPayroll.updated_at || "",
    paid_at: midMonthPayroll.paid_at,
    notes: midMonthPayroll.notes,
  };
};

const normalizeJPLeaveRecords = (leaveRecords: any[] | undefined): any[] => {
  return (leaveRecords || []).map((record: any) => ({
    ...record,
    date: record.date || record.leave_date,
    amount_paid: toNumber(record.amount_paid),
  }));
};

const normalizeJPPayrollForPayslip = (rawPayroll: any): EmployeePayroll => {
  const normalizedInput = {
    ...rawPayroll,
    gross_pay: toNumber(rawPayroll.gross_pay),
    net_pay: toNumber(rawPayroll.net_pay),
    digenapkan:
      rawPayroll.digenapkan != null ? toNumber(rawPayroll.digenapkan) : undefined,
    setelah_digenapkan:
      rawPayroll.setelah_digenapkan != null
        ? toNumber(rawPayroll.setelah_digenapkan)
        : null,
    year: rawPayroll.year != null ? Number(rawPayroll.year) : undefined,
    month: rawPayroll.month != null ? Number(rawPayroll.month) : undefined,
    items: rawPayroll.items || [],
    deductions: rawPayroll.deductions || [],
    leave_records: normalizeJPLeaveRecords(rawPayroll.leave_records),
  };
  const { pdfPayroll, commissionAdvanceTotal } =
    buildJPPayslipPayroll(normalizedInput);

  return {
    ...pdfPayroll,
    id: rawPayroll.id,
    monthly_payroll_id: rawPayroll.monthly_payroll_id,
    created_at: rawPayroll.created_at,
    updated_at: rawPayroll.updated_at,
    print_job_types: rawPayroll.print_job_types,
    mid_month_payroll: normalizeJPMidMonthPayroll(rawPayroll),
    mid_month_payrolls_by_employee:
      rawPayroll.mid_month_payrolls_by_employee || {},
    commission_advance: commissionAdvanceTotal,
  };
};

const fetchCompanyEmployeePayrollDetails = async (
  payrollId: number,
  company: PayslipCompany
): Promise<EmployeePayroll> => {
  if (company === "jellypolly") {
    const response = await api.get(`/jellypolly/api/employee-payrolls/${payrollId}`);
    return normalizeJPPayrollForPayslip(response);
  }

  return getEmployeePayrollDetails(payrollId);
};

const fetchCompanyEmployeePayrollDetailsBatch = async (
  payrollIds: number[],
  company: PayslipCompany
): Promise<EmployeePayroll[]> => {
  if (payrollIds.length === 0) return [];

  if (company === "jellypolly") {
    const ids: string = payrollIds.join(",");
    const response = await api.get(
      `/jellypolly/api/employee-payrolls/batch?ids=${encodeURIComponent(ids)}`
    );
    return Array.isArray(response)
      ? response.map((payroll: any): EmployeePayroll =>
          normalizeJPPayrollForPayslip(payroll)
        )
      : [];
  }

  return getEmployeePayrollDetailsBatch(payrollIds);
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
    company = "tienhock",
    fileName,
    midMonthPayroll,
    onBeforeDownload,
    onAfterDownload,
    onError,
  } = options || {};

  try {
    if (onBeforeDownload) onBeforeDownload();

    let completePayroll = payroll;
    if (payroll.id) {
      try {
        completePayroll = await fetchCompanyEmployeePayrollDetails(
          payroll.id,
          company
        );
      } catch (error) {
        console.warn("Error fetching complete payroll data:", error);
      }
    }

    const effectiveMidMonthPayroll =
      midMonthPayroll ?? completePayroll.mid_month_payroll;

    const blob = await generatePayslipPDF(
      completePayroll,
      staffDetails,
      companyName,
      effectiveMidMonthPayroll
    );
    const defaultFileName = `PaySlip-${completePayroll.employee_id}-${completePayroll.year}-${completePayroll.month}.pdf`;
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
    company = "tienhock",
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
        const fetchedPayrolls = await fetchCompanyEmployeePayrollDetailsBatch(
          payrollIdsToFetch,
          company
        );

        if (
          fetchedPayrolls &&
          Array.isArray(fetchedPayrolls) &&
          fetchedPayrolls.length > 0
        ) {
          completePayrolls = payrolls.map((payroll: EmployeePayroll) => {
            const completePayroll: EmployeePayroll | undefined =
              fetchedPayrolls.find(
                (p: EmployeePayroll): boolean => p.id === payroll.id
              );
            return completePayroll
              ? {
                  ...completePayroll,
                  print_job_types: payroll.print_job_types,
                }
              : payroll;
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
// (grouped) payrolls - that's where combined vs per-job differs; single-job
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
    company = "tienhock",
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
        completePayroll = await fetchCompanyEmployeePayrollDetails(
          payroll.id,
          company
        );
      } catch (error) {
        console.warn("Error fetching complete payroll data:", error);
        // Continue with what we have
      }
    }

    const effectiveMidMonthPayroll =
      midMonthPayroll ?? completePayroll.mid_month_payroll;

    const blob = await generatePayslipPDF(
      completePayroll,
      staffDetails,
      companyName,
      effectiveMidMonthPayroll,
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
    company = "tienhock",
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
        const fetchedPayrolls = await fetchCompanyEmployeePayrollDetailsBatch(
          payrollIdsToFetch,
          company
        );

        if (
          fetchedPayrolls &&
          Array.isArray(fetchedPayrolls) &&
          fetchedPayrolls.length > 0
        ) {
          completePayrolls = payrolls.map((payroll: EmployeePayroll) => {
            const completePayroll: EmployeePayroll | undefined =
              fetchedPayrolls.find(
                (p: EmployeePayroll): boolean => p.id === payroll.id
              );
            return completePayroll
              ? {
                  ...completePayroll,
                  print_job_types: payroll.print_job_types,
                }
              : payroll;
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
          `Printing ${completePayrolls.length} payslips - per-job slips for ${groupedCount} multi-job ${employeeWord}`
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
