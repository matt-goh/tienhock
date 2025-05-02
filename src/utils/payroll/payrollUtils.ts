// src/utils/payroll/payrollUtils.ts
import { api } from "../../routes/utils/api";
import {
  PayrollCalculationService,
  PayrollItem,
  WorkLog,
  EmployeePayroll,
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
 * @param status New status (Processing, Completed, Finalized)
 * @returns Updated payroll data
 */
export const updateMonthlyPayrollStatus = async (
  id: number,
  status: "Processing" | "Completed" | "Finalized"
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
 * @returns Calculated employee payroll
 */
export const calculateEmployeePayroll = (
  workLogs: WorkLog[],
  employeeId: string,
  jobType: string,
  section: string,
  month: number,
  year: number
): EmployeePayroll => {
  return PayrollCalculationService.processEmployeePayroll(
    workLogs,
    employeeId,
    jobType,
    section,
    month,
    year
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
  employeePayroll: EmployeePayroll
) => {
  try {
    // Transform the employeePayroll object to match API expectations
    const payload = {
      monthly_payroll_id: monthlyPayrollId,
      employee_id: employeePayroll.employeeId,
      job_type: employeePayroll.jobType,
      section: employeePayroll.section,
      gross_pay: employeePayroll.grossPay,
      net_pay: employeePayroll.netPay,
      end_month_payment: employeePayroll.endMonthPayment,
      items: employeePayroll.payrollItems.map((item) => ({
        pay_code_id: item.payCodeId,
        description: item.description,
        rate: item.rate,
        rate_unit: item.rateUnit,
        quantity: item.quantity,
        amount: item.amount,
        is_manual: item.isManual,
      })),
    };

    const response = await api.post("/api/employee-payrolls", payload);
    return response;
  } catch (error) {
    console.error("Error saving employee payroll:", error);
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
  item: Omit<PayrollItem, "amount" | "isManual">
) => {
  try {
    // Calculate the amount using our calculation service
    const amount = PayrollCalculationService.calculateAmount(
      item.rate,
      item.quantity,
      item.rateUnit
    );

    const payload = {
      pay_code_id: item.payCodeId,
      description: item.description,
      rate: item.rate,
      rate_unit: item.rateUnit,
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
