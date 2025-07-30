// src/utils/payroll/payrollUtils.ts
import { api } from "../../routes/utils/api";
import {
  EmployeePayroll,
  PayrollDeduction,
  PayrollItem,
  RateUnit,
} from "../../types/types";
import {
  PayrollCalculationService,
  WorkLog,
} from "./payrollCalculationService";

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

/**
 * Updates a monthly payroll status
 * @param id Monthly payroll ID
 * @param status New status (Processing, Finalized)
 * @returns Updated payroll data
 */
export const updateMonthlyPayrollStatus = async (
  id: number,
  status: "Processing" | "Finalized"
) => {
  try {
    const response = await api.put(`/api/monthly-payrolls/${id}/status`, {
      status,
    });
    return response;
  } catch (error) {
    console.error("Error updating monthly payroll status:", error);
    throw error;
  }
};

/**
 * Calculates an employee's payroll based on work logs
 * This runs on the client side using our calculation service
 * @param workLogs Array of work logs
 * @param employeeId Employee ID
 * @param jobType Job type
 * @param section Section
 * @param month Month (1-12)
 * @param year Year
 * @param leaveRecords Array of leave records for the month (optional)
 * @returns Calculated employee payroll
 */
export const calculateEmployeePayroll = (
  workLogs: WorkLog[],
  employeeId: string,
  jobType: string,
  section: string,
  month: number,
  year: number,
  leaveRecords?: { date: string; leave_type: string; days_taken: number; amount_paid: number }[]
): EmployeePayroll => {
  return PayrollCalculationService.processEmployeePayroll(
    workLogs,
    employeeId,
    jobType,
    section,
    month,
    year,
    leaveRecords
  );
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
 * Saves an employee payroll to the database
 * @param monthlyPayrollId Monthly payroll ID
 * @param employeePayroll Employee payroll data
 * @returns API response
 */
export const saveEmployeePayroll = async (
  monthlyPayrollId: number,
  employeePayroll: EmployeePayroll & { deductions?: PayrollDeduction[] }
) => {
  try {
    // Transform the employeePayroll object to match API expectations
    const payload = {
      monthly_payroll_id: monthlyPayrollId,
      employee_id: employeePayroll.employee_id,
      job_type: employeePayroll.job_type,
      section: employeePayroll.section,
      gross_pay: employeePayroll.gross_pay,
      net_pay: employeePayroll.net_pay,
      items: employeePayroll.items.map((item) => ({
        pay_code_id: item.pay_code_id,
        description: item.description,
        rate: item.rate,
        rate_unit: item.rate_unit,
        quantity: item.quantity,
        amount: item.amount,
        is_manual: item.is_manual,
      })),
      deductions: employeePayroll.deductions || [],
    };

    const response = await api.post("/api/employee-payrolls", payload);
    return response;
  } catch (error) {
    console.error("Error saving employee payroll:", error);
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
 * @returns API response
 */
export const addManualPayrollItem = async (
  employeePayrollId: number,
  item: Omit<PayrollItem, "amount" | "is_manual">
) => {
  try {
    // Calculate the amount using our calculation service
    const amount = PayrollCalculationService.calculateAmount(
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
      `/api/employee-payrolls/${employeePayrollId}/items`,
      payload
    );
    return response;
  } catch (error) {
    console.error("Error adding manual payroll item:", error);
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

// Add these to src/utils/payroll/payrollUtils.ts

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