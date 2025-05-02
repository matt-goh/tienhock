// src/routes/payroll/monthly-payrolls.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all monthly payrolls
  router.get("/", async (req, res) => {
    try {
      const query = `
        SELECT * FROM monthly_payrolls
        ORDER BY year DESC, month DESC
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching monthly payrolls:", error);
      res.status(500).json({
        message: "Error fetching monthly payrolls",
        error: error.message,
      });
    }
  });

  // Add this new endpoint to monthly-payrolls.js
  router.get("/:id/eligible-employees", async (req, res) => {
    const { id } = req.params;

    try {
      // Get payroll details to verify year and month
      const payrollQuery = `
      SELECT year, month FROM monthly_payrolls
      WHERE id = $1
    `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      const { year, month } = payrollResult.rows[0];

      // Get all work logs for this month and year
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // Last day of month

      // Query work logs and extract unique employee-job combinations
      const eligibleEmployeesQuery = `
      SELECT DISTINCT dwle.employee_id, dwle.job_id
      FROM daily_work_logs dwl
      JOIN daily_work_log_entries dwle ON dwl.id = dwle.work_log_id
      WHERE dwl.log_date BETWEEN $1 AND $2
      AND dwl.status = 'Submitted'
    `;

      const eligibleEmployeesResult = await pool.query(eligibleEmployeesQuery, [
        startDate,
        endDate,
      ]);

      // Group employees by job type
      const jobEmployeeMap = {};
      eligibleEmployeesResult.rows.forEach((row) => {
        if (!jobEmployeeMap[row.job_id]) {
          jobEmployeeMap[row.job_id] = [];
        }
        jobEmployeeMap[row.job_id].push(row.employee_id);
      });

      res.json({
        month,
        year,
        eligibleJobs: Object.keys(jobEmployeeMap),
        jobEmployeeMap,
      });
    } catch (error) {
      console.error("Error fetching eligible employees:", error);
      res.status(500).json({
        message: "Error fetching eligible employees",
        error: error.message,
      });
    }
  });

  // Get specific monthly payroll by ID
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      // Get payroll details
      const payrollQuery = `
        SELECT * FROM monthly_payrolls
        WHERE id = $1
      `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      // Get employee payrolls for this monthly payroll
      const employeePayrollsQuery = `
        SELECT ep.*, s.name as employee_name
        FROM employee_payrolls ep
        LEFT JOIN staffs s ON ep.employee_id = s.id
        WHERE ep.monthly_payroll_id = $1
      `;
      const employeePayrollsResult = await pool.query(employeePayrollsQuery, [
        id,
      ]);

      res.json({
        ...payrollResult.rows[0],
        employeePayrolls: employeePayrollsResult.rows,
      });
    } catch (error) {
      console.error("Error fetching monthly payroll details:", error);
      res.status(500).json({
        message: "Error fetching monthly payroll details",
        error: error.message,
      });
    }
  });

  // Create a new monthly payroll
  router.post("/", async (req, res) => {
    const { year, month, created_by } = req.body;

    if (!year || !month) {
      return res.status(400).json({ message: "Year and month are required" });
    }

    try {
      // Create new monthly payroll
      const insertQuery = `
        INSERT INTO monthly_payrolls (year, month, status, created_by)
        VALUES ($1, $2, 'Processing', $3)
        RETURNING *
      `;
      const insertResult = await pool.query(insertQuery, [
        year,
        month,
        created_by || null,
      ]);

      res.status(201).json({
        message: "Monthly payroll created successfully",
        payroll: insertResult.rows[0],
      });
    } catch (error) {
      console.error("Error creating monthly payroll:", error);
      res.status(500).json({
        message: "Error creating monthly payroll",
        error: error.message,
      });
    }
  });

  // Process a monthly payroll
  router.post("/:id/process", async (req, res) => {
    const { id } = req.params;

    try {
      // Get payroll details to verify year and month
      const payrollQuery = `
        SELECT year, month FROM monthly_payrolls
        WHERE id = $1
      `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      const { year, month } = payrollResult.rows[0];

      // Get all work logs for this month and year
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // Last day of month

      const workLogsQuery = `
        SELECT dwl.*, json_agg(
          json_build_object(
            'employee_id', dwle.employee_id,
            'job_id', dwle.job_id,
            'total_hours', dwle.total_hours,
            'activities', (
              SELECT json_agg(
                json_build_object(
                  'pay_code_id', dwla.pay_code_id,
                  'description', pc.description,
                  'pay_type', pc.pay_type,
                  'rate_unit', pc.rate_unit,
                  'rate_used', dwla.rate_used,
                  'hours_applied', dwla.hours_applied,
                  'units_produced', dwla.units_produced,
                  'calculated_amount', dwla.calculated_amount
                )
              )
              FROM daily_work_log_activities dwla
              JOIN pay_codes pc ON dwla.pay_code_id = pc.id
              WHERE dwla.log_entry_id = dwle.id
            )
          )
        ) as employee_entries
        FROM daily_work_logs dwl
        JOIN daily_work_log_entries dwle ON dwl.id = dwle.work_log_id
        WHERE dwl.log_date BETWEEN $1 AND $2
        AND dwl.status = 'Submitted'
        GROUP BY dwl.id
        ORDER BY dwl.log_date
      `;

      const workLogsResult = await pool.query(workLogsQuery, [
        startDate,
        endDate,
      ]);

      // Return the work logs for now
      // The actual processing will be implemented later
      res.json({
        message: "Processing initiated",
        month,
        year,
        work_logs_count: workLogsResult.rows.length,
        work_logs: workLogsResult.rows,
      });
    } catch (error) {
      console.error("Error processing monthly payroll:", error);
      res.status(500).json({
        message: "Error processing monthly payroll",
        error: error.message,
      });
    }
  });

  // Update payroll status
  router.put("/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["Processing", "Completed", "Finalized"].includes(status)) {
      return res.status(400).json({
        message: "Valid status is required (Processing, Completed, Finalized)",
      });
    }

    try {
      const query = `
        UPDATE monthly_payrolls
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await pool.query(query, [status, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      res.json({
        message: "Payroll status updated successfully",
        payroll: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating payroll status:", error);
      res.status(500).json({
        message: "Error updating payroll status",
        error: error.message,
      });
    }
  });

  return router;
}
