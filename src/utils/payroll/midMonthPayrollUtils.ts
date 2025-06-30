// src/utils/payroll/midMonthPayrollUtils.ts
import { api } from "../../routes/utils/api";

export interface MidMonthPayroll {
  id: number;
  employee_id: string;
  employee_name: string;
  year: number;
  month: number;
  amount: number;
  payment_method: "Cash" | "Bank" | "Cheque";
  status: "Pending" | "Paid" | "Cancelled";
  created_at: string;
  updated_at: string;
  paid_at?: string;
  notes?: string;
  default_payment_method?: string;
}

export interface MidMonthPayrollsResponse {
  payrolls: MidMonthPayroll[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateMidMonthPayrollData {
  employee_id: string;
  year: number;
  month: number;
  amount: number;
  payment_method: "Cash" | "Bank" | "Cheque";
  status?: "Pending" | "Paid" | "Cancelled";
  notes?: string;
}

export interface UpdateMidMonthPayrollData {
  amount?: number;
  payment_method?: "Cash" | "Bank" | "Cheque";
  status?: "Pending" | "Paid" | "Cancelled";
  notes?: string;
}

/**
 * Fetch all mid-month payrolls with filtering
 */
export const getMidMonthPayrolls = async (
  filters: {
    year?: number;
    month?: number;
    employee_id?: string;
    status?: string;
    payment_method?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<MidMonthPayrollsResponse> => {
  try {
    const queryParams = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const response = await api.get(
      `/api/mid-month-payrolls?${queryParams.toString()}`
    );
    return response;
  } catch (error) {
    console.error("Error fetching mid-month payrolls:", error);
    throw error;
  }
};

/**
 * Get specific mid-month payroll by ID
 */
export const getMidMonthPayrollById = async (
  id: number
): Promise<MidMonthPayroll> => {
  try {
    const response = await api.get(`/api/mid-month-payrolls/${id}`);
    return response;
  } catch (error) {
    console.error("Error fetching mid-month payroll:", error);
    throw error;
  }
};

/**
 * Create new mid-month payroll
 */
export const createMidMonthPayroll = async (
  data: CreateMidMonthPayrollData
): Promise<{ message: string; payroll: MidMonthPayroll }> => {
  try {
    const response = await api.post("/api/mid-month-payrolls", data);
    return response;
  } catch (error) {
    console.error("Error creating mid-month payroll:", error);
    throw error;
  }
};

/**
 * Update existing mid-month payroll
 */
export const updateMidMonthPayroll = async (
  id: number,
  data: UpdateMidMonthPayrollData
): Promise<{ message: string; payroll: MidMonthPayroll }> => {
  try {
    const response = await api.put(`/api/mid-month-payrolls/${id}`, data);
    return response;
  } catch (error) {
    console.error("Error updating mid-month payroll:", error);
    throw error;
  }
};

/**
 * Update payment status only
 */
export const updateMidMonthPayrollStatus = async (
  id: number,
  status: "Pending" | "Paid" | "Cancelled"
): Promise<{ message: string; payroll: MidMonthPayroll }> => {
  try {
    const response = await api.put(`/api/mid-month-payrolls/${id}/status`, {
      status,
    });
    return response;
  } catch (error) {
    console.error("Error updating payment status:", error);
    throw error;
  }
};

/**
 * Delete mid-month payroll
 */
export const deleteMidMonthPayroll = async (
  id: number
): Promise<{ message: string; deleted_payroll: MidMonthPayroll }> => {
  try {
    const response = await api.delete(`/api/mid-month-payrolls/${id}`);
    return response;
  } catch (error) {
    console.error("Error deleting mid-month payroll:", error);
    throw error;
  }
};

/**
 * Get mid-month payroll by employee and date
 */
export const getMidMonthPayrollByEmployee = async (
  employeeId: string,
  year: number,
  month: number
): Promise<MidMonthPayroll | null> => {
  try {
    const response = await api.get(
      `/api/mid-month-payrolls/employee/${employeeId}/${year}/${month}`
    );
    return response;
  } catch (error: any) {
    // Handle 404 (not found) gracefully - this is expected when no mid-month payroll exists
    if (error?.response?.status === 404 || error?.status === 404) {
      return null;
    }

    // For other errors, still throw them as they indicate real problems
    console.error("Error fetching mid-month payroll by employee:", error);
    throw error;
  }
};

/**
 * Get month name from month number
 */
export const getMonthName = (month: number): string => {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months[month - 1] || "Unknown";
};

/**
 * Fetch mid-month payrolls for multiple employees in a specific month/year
 */
export const getBatchMidMonthPayrolls = async (
  employeeIds: string[],
  year: number,
  month: number
): Promise<MidMonthPayroll[]> => {
  if (employeeIds.length === 0) return [];

  try {
    // First try to get existing payrolls with efficient single request
    const queryParams = new URLSearchParams();
    queryParams.append("year", year.toString());
    queryParams.append("month", month.toString());
    queryParams.append("limit", employeeIds.length.toString());

    // Execute the query first without employee_id filter to get all for the month
    const response = await api.get(
      `/api/mid-month-payrolls?${queryParams.toString()}`
    );

    // Filter locally to match the requested employee IDs
    if (response && response.payrolls && Array.isArray(response.payrolls)) {
      return response.payrolls.filter((payroll: { employee_id: string }) =>
        employeeIds.includes(payroll.employee_id)
      );
    }

    return [];
  } catch (error) {
    console.error("Error fetching batch mid-month payrolls:", error);
    return []; // Return empty array instead of throwing to avoid breaking batch processing
  }
};
