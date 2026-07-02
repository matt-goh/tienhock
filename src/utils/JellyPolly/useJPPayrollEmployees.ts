// src/utils/JellyPolly/useJPPayrollEmployees.ts
// JP staff → page/job assignments hook (jellypolly.payroll_employees).
// Mirrors useGTPayrollEmployees, but JP has multiple job types and an employee
// may hold several of them.
import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../../routes/utils/api";

export type JPJobType =
  | "OFFICE"
  | "MAINTENANCE"
  | "SALESMAN"
  | "SALESMAN_IKUT"
  | "ICE_POLLY"
  | "JELLY_CUP"
  | "PLASTIC"
  | "PRODUCTION";

export interface JPPayrollEmployee {
  id: number;
  employee_id: string;
  job_type: JPJobType;
  date_added: string;
  is_active: boolean;
  notes: string | null;
  employee_name: string;
  ic_no: string | null;
  staff_job: string[] | null;
  head_staff_id: string | null;
  date_resigned: string | null;
}

export const useJPPayrollEmployees = () => {
  const [employees, setEmployees] = useState<JPPayrollEmployee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEmployees = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response: JPPayrollEmployee[] = await api.get(
        "/jellypolly/api/payroll-employees"
      );
      setEmployees(response);
      setError(null);
    } catch (err: unknown) {
      console.error("Error fetching JP payroll employees:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  const addEmployee = useCallback(
    async (
      employeeId: string,
      jobType: JPJobType,
      notes?: string
    ): Promise<boolean> => {
      try {
        await api.post("/jellypolly/api/payroll-employees", {
          employee_id: employeeId,
          job_type: jobType,
          notes,
        });
        await fetchEmployees();
        return true;
      } catch (err: unknown) {
        console.error("Error adding employee to JP payroll:", err);
        throw err;
      }
    },
    [fetchEmployees]
  );

  const removeEmployee = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        await api.delete(`/jellypolly/api/payroll-employees/${id}`);
        await fetchEmployees();
        return true;
      } catch (err: unknown) {
        console.error("Error removing employee from JP payroll:", err);
        throw err;
      }
    },
    [fetchEmployees]
  );

  // Assignments grouped by job type, e.g. employeesByJobType["OFFICE"]
  const employeesByJobType = useMemo((): Record<string, JPPayrollEmployee[]> => {
    const grouped: Record<string, JPPayrollEmployee[]> = {};
    for (const employee of employees) {
      if (!grouped[employee.job_type]) grouped[employee.job_type] = [];
      grouped[employee.job_type].push(employee);
    }
    return grouped;
  }, [employees]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  return {
    employees,
    employeesByJobType,
    loading,
    error,
    refreshEmployees: fetchEmployees,
    addEmployee,
    removeEmployee,
  };
};
