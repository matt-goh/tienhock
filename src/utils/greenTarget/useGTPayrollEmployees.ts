// src/utils/greenTarget/useGTPayrollEmployees.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../../routes/utils/api";

export interface GTPayrollEmployee {
  id: number;
  employee_id: string;
  job_type: "OFFICE" | "DRIVER";
  date_added: string;
  is_active: boolean;
  notes: string | null;
  employee_name: string;
  ic_no: string | null;
  staff_job: string[] | null;
}

export const useGTPayrollEmployees = () => {
  const [employees, setEmployees] = useState<GTPayrollEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/greentarget/api/payroll-employees");
      setEmployees(response);
      setError(null);
    } catch (err: unknown) {
      console.error("Error fetching GT payroll employees:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  const addEmployee = useCallback(
    async (
      employeeId: string,
      jobType: "OFFICE" | "DRIVER",
      notes?: string
    ): Promise<boolean> => {
      try {
        await api.post("/greentarget/api/payroll-employees", {
          employee_id: employeeId,
          job_type: jobType,
          notes,
        });
        await fetchEmployees(); // Refresh list
        return true;
      } catch (err: unknown) {
        console.error("Error adding employee to GT payroll:", err);
        throw err;
      }
    },
    [fetchEmployees]
  );

  const removeEmployee = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        await api.delete(`/greentarget/api/payroll-employees/${id}`);
        await fetchEmployees(); // Refresh list
        return true;
      } catch (err: unknown) {
        console.error("Error removing employee from GT payroll:", err);
        throw err;
      }
    },
    [fetchEmployees]
  );

  // Load data on initial render
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Group employees by job type
  const officeEmployees = employees.filter((e) => e.job_type === "OFFICE");
  const driverEmployees = employees.filter((e) => e.job_type === "DRIVER");

  return {
    employees,
    officeEmployees,
    driverEmployees,
    loading,
    error,
    refreshEmployees: fetchEmployees,
    addEmployee,
    removeEmployee,
  };
};
