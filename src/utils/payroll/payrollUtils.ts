// src/utils/payroll/payrollUtils.ts
import { format } from "date-fns";
import { api } from "../../routes/utils/api";
import {
  EmployeePayroll,
  PayrollDeduction,
  PayrollItem,
  PinjamRecord,
  RateUnit,
} from "../../types/types";
import {
  multiplyMoney,
  calculatePercentage,
  roundMoney,
} from "./moneyUtils";

/**
 * Calculates a payroll item amount from rate × quantity, applying each rate
 * unit's own rule (Percent = quantity% of rate; Fixed = the direct amount when
 * quantity > 1, otherwise the rate). Used to preview manual / Others item amounts.
 */
export const calculateAmount = (
  rate: number,
  quantity: number,
  rate_unit: RateUnit
): number => {
  let amount = 0;
  switch (rate_unit) {
    case "Hour":
    case "Bill":
    case "Day":
    case "Bag":
    case "Ctn":
    case "Kg":
    case "Karung":
    case "Bundle":
    case "Trip":
    case "Tray":
      amount = multiplyMoney(rate, quantity);
      break;
    case "Percent":
      amount = calculatePercentage(quantity, rate);
      break;
    case "Fixed":
      // quantity > 1 means a direct amount was provided; otherwise use the rate
      amount = quantity > 1 ? quantity : rate;
      break;
    default:
      amount = 0;
  }
  return roundMoney(amount);
};

/**
 * Creates a new monthly payroll
 * @param year Year
 * @param month Month (1-12)
 * @returns Created payroll data
 */
export const createMonthlyPayroll = async (year: number, month: number) => {
  try {
    const response = await api.post("/api/monthly-payrolls", {
      year,
      month,
    });
    return response;
  } catch (error) {
    console.error("Error creating monthly payroll:", error);
    throw error;
  }
};

/**
 * Fetches all monthly payrolls
 * @returns List of monthly payrolls
 */
export const getMonthlyPayrolls = async () => {
  try {
    const response = await api.get("/api/monthly-payrolls");
    return response;
  } catch (error) {
    console.error("Error fetching monthly payrolls:", error);
    throw error;
  }
};

/**
 * Fetches a specific monthly payroll with employee payrolls
 * @param id Monthly payroll ID
 * @returns Monthly payroll data with employee payrolls
 */
export const getMonthlyPayrollDetails = async (id: number) => {
  try {
    const response = await api.get(`/api/monthly-payrolls/${id}`);
    return response;
  } catch (error) {
    console.error("Error fetching monthly payroll details:", error);
    throw error;
  }
};

/**
 * Fetches a monthly payroll by year and month
 * @param year Year
 * @param month Month (1-12)
 * @returns Monthly payroll data with employee payrolls, or null if not found
 */
export const getMonthlyPayrollByYearMonth = async (
  year: number,
  month: number
) => {
  try {
    const response = await api.get(
      `/api/monthly-payrolls?year=${year}&month=${month}&include_employee_payrolls=true`
    );
    // Response is an array, return the first match or null
    if (Array.isArray(response) && response.length > 0) {
      const payroll = response[0];
      // Normalize property name from snake_case to camelCase
      return {
        ...payroll,
        employeePayrolls: payroll.employee_payrolls || [],
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching monthly payroll by year/month:", error);
    throw error;
  }
};

/**
 * Starts processing a monthly payroll
 * @param id Monthly payroll ID
 * @returns Processing result with work logs data
 */
export const processMonthlyPayroll = async (id: number) => {
  try {
    const response = await api.post(`/api/monthly-payrolls/${id}/process`);
    return response;
  } catch (error) {
    console.error("Error processing monthly payroll:", error);
    throw error;
  }
};

export interface PayrollProcessEmployeeSelection {
  employeeId: string;
  jobType: string;
}

export interface ProcessMonthlyPayrollsOptions {
  selected_employees: PayrollProcessEmployeeSelection[];
  prune_unselected?: boolean;
}

/**
 * Processes selected employee/job combinations for a monthly payroll.
 * prune_unselected keeps the existing full-payroll orphan cleanup behaviour
 * unless callers explicitly disable it for selective reprocessing.
 */
export const processMonthlyPayrolls = async (
  id: number,
  options: ProcessMonthlyPayrollsOptions
) => {
  try {
    const response = await api.post(
      `/api/monthly-payrolls/${id}/process-all`,
      options
    );
    return response;
  } catch (error) {
    console.error("Error processing selected monthly payrolls:", error);
    throw error;
  }
};

/**
 * Fetches eligible employees for a monthly payroll
 * @param id Monthly payroll ID
 * @returns API response with eligible employees
 */
export const getEligibleEmployees = async (id: number) => {
  try {
    const response = await api.get(
      `/api/monthly-payrolls/${id}/eligible-employees`
    );
    return response;
  } catch (error) {
    console.error("Error fetching eligible employees:", error);
    throw error;
  }
};

/**
 * Fetches detailed employee payroll data for multiple payrolls in a single batch
 * @param payrollIds Array of employee payroll IDs to fetch
 * @returns Promise with array of complete employee payroll data
 */
export const getEmployeePayrollDetailsBatch = async (
  payrollIds: number[]
): Promise<EmployeePayroll[]> => {
  if (!payrollIds.length) return [];

  try {
    // Create a comma-separated list of IDs
    const idList = payrollIds.join(",");
    // Make a single API call with all IDs as query parameter
    const response = await api.get(
      `/api/employee-payrolls/batch?ids=${idList}`
    );
    return response;
  } catch (error) {
    console.error("Error fetching batch employee payrolls:", error);
    throw error;
  }
};

/**
 * Fetches comprehensive employee payroll with all related data (items, deductions, leave records, mid-month payroll, commissions)
 * @param id Employee payroll ID
 * @returns Comprehensive employee payroll data
 */
export const getEmployeePayrollComprehensive = async (id: number) => {
  try {
    const response = await api.get(`/api/employee-payrolls/${id}/comprehensive`);
    return response;
  } catch (error) {
    console.error("Error fetching comprehensive employee payroll details:", error);
    throw error;
  }
};

/**
 * Fetches pinjam records for a single employee in a specific month
 * @param employeeId Staff/employee ID
 * @param year Year
 * @param month Month (1-12)
 * @returns Array of pinjam records (amounts already parsed by the backend)
 */
export const getEmployeePinjamRecords = async (
  employeeId: string,
  year: number,
  month: number,
): Promise<PinjamRecord[]> => {
  try {
    const response = await api.get(
      `/api/pinjam-records?year=${year}&month=${month}&employee_id=${encodeURIComponent(
        employeeId,
      )}`,
    );
    return response.records || [];
  } catch (error) {
    console.error("Error fetching employee pinjam records:", error);
    throw error;
  }
};

/**
 * Fetches detailed employee payroll with items
 * @param id Employee payroll ID
 * @returns Employee payroll with items
 */
export const getEmployeePayrollDetails = async (id: number) => {
  try {
    const response = await api.get(`/api/employee-payrolls/${id}`);
    return response;
  } catch (error) {
    console.error("Error fetching employee payroll details:", error);
    throw error;
  }
};

/**
 * Adds a manual item to an employee payroll
 * @param employeePayrollId Employee payroll ID
 * @param item Payroll item data
 * @param apiBasePath API base path (Green Target uses /greentarget/api/employee-payrolls)
 * @returns API response
 */
export const addManualPayrollItem = async (
  employeePayrollId: number,
  item: Omit<PayrollItem, "amount" | "is_manual">,
  apiBasePath: string = "/api/employee-payrolls"
) => {
  try {
    // Calculate the amount using our calculation service
    const amount = calculateAmount(
      item.rate,
      item.quantity,
      item.rate_unit as RateUnit
    );

    const payload = {
      pay_code_id: item.pay_code_id,
      description: item.description,
      rate: item.rate,
      rate_unit: item.rate_unit,
      quantity: item.quantity,
      amount: amount,
    };

    const response = await api.post(
      `${apiBasePath}/${employeePayrollId}/items`,
      payload
    );
    return response;
  } catch (error) {
    console.error("Error adding manual payroll item:", error);
    throw error;
  }
};

/**
 * Saves an employee payroll to the server
 * @param monthlyPayrollId Monthly payroll ID
 * @param employeePayroll Employee payroll data
 * @returns API response
 */
export const saveEmployeePayroll = async (
  monthlyPayrollId: number,
  employeePayroll: EmployeePayroll
) => {
  try {
    const response = await api.post("/api/employee-payrolls", {
      monthly_payroll_id: monthlyPayrollId,
      employee_id: employeePayroll.employee_id,
      job_type: employeePayroll.job_type,
      section: employeePayroll.section,
      gross_pay: employeePayroll.gross_pay,
      net_pay: employeePayroll.net_pay,
      items: employeePayroll.items,
      deductions: employeePayroll.deductions,
    });
    return response;
  } catch (error) {
    console.error("Error saving employee payroll:", error);
    throw error;
  }
};

/**
 * Saves multiple employee payrolls to the server in a single batch request
 * @param monthlyPayrollId Monthly payroll ID
 * @param employeePayrolls Array of employee payroll data
 * @returns API response
 */
export const saveEmployeePayrollsBatch = async (
  monthlyPayrollId: number,
  employeePayrolls: EmployeePayroll[]
) => {
  try {
    const response = await api.post("/api/employee-payrolls/batch", {
      monthly_payroll_id: monthlyPayrollId,
      employee_payrolls: employeePayrolls.map(payroll => ({
        employee_id: payroll.employee_id,
        job_type: payroll.job_type,
        section: payroll.section,
        gross_pay: payroll.gross_pay,
        net_pay: payroll.net_pay,
        items: payroll.items,
        deductions: payroll.deductions,
        grouped_employee_ids: (payroll as any).grouped_employee_ids || null,
      }))
    });
    return response;
  } catch (error) {
    console.error("Error saving employee payrolls batch:", error);
    throw error;
  }
};

/**
 * Deletes a payroll item
 * @param itemId Payroll item ID
 * @returns API response
 */
export const deletePayrollItem = async (itemId: number) => {
  try {
    const response = await api.delete(`/api/employee-payrolls/items/${itemId}`);
    return response;
  } catch (error) {
    console.error("Error deleting payroll item:", error);
    throw error;
  }
};

/**
 * Consolidated payroll item after grouping identical items together
 */
export interface ConsolidatedPayrollItem {
  pay_code_id: string;
  description: string;
  pay_type: string;
  rate: number;
  rate_unit: string;
  total_quantity: number;
  total_foc_units: number;
  total_amount: number;
  item_count: number; // How many items were consolidated
  is_manual: boolean;
  job_type?: string;
}

/**
 * Consolidates payroll items by grouping identical items together
 * Groups by: job_type + pay_code_id + rate + rate_unit
 * @param items Array of payroll items
 * @returns Array of consolidated items with totals
 */
export const consolidatePayrollItems = (items: PayrollItem[]): ConsolidatedPayrollItem[] => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  // Create a map to group items by their unique key
  const groupMap = new Map<string, ConsolidatedPayrollItem>();

  items.forEach((item) => {
    // Keep combined-payroll jobs separate even when they share the same pay code.
    const jobTypeKey: string = item.job_type || "";
    const key: string = `${jobTypeKey}_${item.pay_code_id}_${item.rate}_${item.rate_unit}`;
    const focUnits = (item as any).foc_units ? parseFloat((item as any).foc_units) : 0;

    if (groupMap.has(key)) {
      // Add to existing group
      const existing = groupMap.get(key)!;
      existing.total_quantity += item.quantity;
      existing.total_foc_units += focUnits;
      existing.total_amount += item.amount;
      existing.item_count += 1;
      // Keep is_manual as true if any item is manual
      if (item.is_manual) {
        existing.is_manual = true;
      }
    } else {
      // Create new group
      groupMap.set(key, {
        pay_code_id: item.pay_code_id,
        description: item.description,
        pay_type: item.pay_type,
        rate: item.rate,
        rate_unit: item.rate_unit,
        total_quantity: item.quantity,
        total_foc_units: focUnits,
        total_amount: item.amount,
        item_count: 1,
        is_manual: item.is_manual,
        job_type: item.job_type,
      });
    }
  });

  // Recalculate amounts from rate × (quantity + foc) for display consistency
  // This ensures consolidated amounts match rate × (total_quantity + total_foc_units) exactly
  groupMap.forEach((item) => {
    // Skip Percent and Fixed rate units - they have special calculation logic
    if (item.rate_unit !== 'Percent' && item.rate_unit !== 'Fixed') {
      const totalUnits = item.total_quantity + (item.total_foc_units || 0);
      item.total_amount = Math.round(item.rate * totalUnits * 100) / 100;
    }
  });

  // Convert map to array and sort by pay_type, then description
  return Array.from(groupMap.values()).sort((a, b) => {
    // First sort by pay_type
    if (a.pay_type !== b.pay_type) {
      const typeOrder = { Base: 0, Tambahan: 1, Overtime: 2 };
      return (typeOrder[a.pay_type as keyof typeof typeOrder] || 3) -
             (typeOrder[b.pay_type as keyof typeof typeOrder] || 3);
    }
    // Then sort by description
    return a.description.localeCompare(b.description);
  });
};

/**
 * Removes daily work-log items that fall on a leave day from a payroll item list.
 *
 * On a leave day the employee did not actually work, but the daily-log leave flow
 * historically still recorded that day's regular activities (with 0 hours and a
 * leftover amount). Those rows pay nothing — gross is rate × quantity and the
 * quantity is 0 — while the real leave payment is shown separately in the Cuti
 * section from `leave_records`. Listing them under base pay is therefore misleading
 * (and can surface a stale rate from before a mid-month rate change), so they are
 * filtered out before consolidation/display. Matching is by `source_date` against
 * the leave dates; only daily items carry a `source_date`, so monthly items are
 * always kept.
 *
 * @param items Array of payroll items
 * @param leaveRecords Leave records for this payslip (each with a `date` field, YYYY-MM-DD)
 * @returns Items with leave-day daily items removed
 */
export const filterOutLeaveDayItems = (
  items: PayrollItem[],
  leaveRecords?: Array<{
    date?: string | null;
    employee_id?: string | null;
  }> | null,
): PayrollItem[] => {
  if (!items || items.length === 0) return items ?? [];
  if (!leaveRecords || leaveRecords.length === 0) return items;

  const toYMD = (value: string | null | undefined): string | null => {
    if (!value) return null;
    // A bare YYYY-MM-DD (e.g. leave dates from to_char, or date-only source_date)
    // is used as-is to avoid any timezone round-trip. Full timestamps are
    // normalised in local time (Asia/Kuala_Lumpur) — never via toISOString.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    try {
      return format(new Date(value), "yyyy-MM-dd");
    } catch {
      return null;
    }
  };

  // Scope by employee_id (key = `${employee_id}|${ymd}`) so leave only drops the
  // leave owner's own daily work — a multi-job worker's other jobs that day are
  // kept. Single-job workers are unaffected (leave id === item source id).
  const leaveKeys = new Set<string>();
  leaveRecords.forEach((record) => {
    const ymd = toYMD(record?.date);
    if (ymd) leaveKeys.add(`${record?.employee_id ?? ""}|${ymd}`);
  });
  if (leaveKeys.size === 0) return items;

  return items.filter((item) => {
    if (item.work_log_type !== "daily" || !item.source_date) return true;
    const ymd = toYMD(item.source_date);
    if (ymd === null) return true;
    return !leaveKeys.has(
      `${(item as { source_employee_id?: string | null }).source_employee_id ?? ""}|${ymd}`,
    );
  });
};

/**
 * Groups consolidated payroll items by pay type (Base, Tambahan, Overtime)
 * @param items Array of consolidated payroll items
 * @returns Object with items grouped by pay type
 */
export const groupConsolidatedItemsByType = (items: ConsolidatedPayrollItem[]) => {
  const grouped: Record<string, ConsolidatedPayrollItem[]> = {
    Base: [],
    Tambahan: [],
    Overtime: [],
  };

  if (!items || !Array.isArray(items)) {
    return grouped;
  }

  items.forEach((item) => {
    if (item.pay_type === "Overtime") {
      grouped["Overtime"].push(item);
    } else if (item.pay_type === "Tambahan") {
      grouped["Tambahan"].push(item);
    } else {
      grouped["Base"].push(item);
    }
  });

  return grouped;
};

/**
 * Groups payroll items by pay type (Base, Tambahan, Overtime)
 * @param items Array of payroll items
 * @returns Object with items grouped by pay type
 */
export const groupItemsByType = (items: PayrollItem[]) => {
  const grouped: Record<string, PayrollItem[]> = {
    Base: [],
    Tambahan: [],
    Overtime: [],
  };

  // Check to handle undefined items
  if (!items || !Array.isArray(items)) {
    return grouped;
  }

  items.forEach((item) => {
    // Use the pay_type returned from the backend
    if (item.pay_type === "Overtime") {
      grouped["Overtime"].push(item);
    } else if (item.pay_type === "Tambahan") {
      grouped["Tambahan"].push(item);
    } else if (item.pay_type === "Base") {
      grouped["Base"].push(item);
    } else {
      // Fallback for items without pay_type (using previous logic)
      if (
        item.description.toLowerCase().includes("overtime") ||
        item.description.toLowerCase().includes("ot")
      ) {
        grouped["Overtime"].push(item);
      } else if (
        item.is_manual ||
        item.description.toLowerCase().includes("tambahan")
      ) {
        grouped["Tambahan"].push(item);
      } else {
        grouped["Base"].push(item);
      }
    }
  });
  return grouped;
};

/**
 * Gets the full month name from a month number (1-12)
 * @param month Month number (1-12)
 * @returns Full month name
 */
export const getMonthName = (month: number | undefined) => {
  if (month === undefined) return "Unknown Month";
  return new Date(2000, month - 1, 1).toLocaleString("default", {
    month: "long",
  });
};
