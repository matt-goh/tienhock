// src/routes/jellypolly/payroll-employees.js
// Jelly Polly staff → page/job assignments (jellypolly.payroll_employees).
// Mirrors greentarget/payroll-employees.js, but an employee may hold multiple
// JP job types (unique employee_id + job_type).
import { Router } from "express";

const JP_JOB_TYPES = [
  "OFFICE",
  "MAINTENANCE",
  "SALESMAN",
  "SALESMAN_IKUT",
  "ICE_POLLY",
  "JELLY_CUP",
  "PLASTIC",
  "PRODUCTION",
];

export default function (pool) {
  const router = Router();

  // Get all active JP payroll employees (optionally filtered by job_type)
  router.get("/", async (req, res) => {
    const { job_type } = req.query;
    try {
      const params = [];
      let whereJobType = "";
      if (job_type) {
        params.push(job_type);
        whereJobType = `AND pe.job_type = $${params.length}`;
      }

      const query = `
        SELECT
          pe.id,
          pe.employee_id,
          pe.job_type,
          pe.date_added,
          pe.is_active,
          pe.notes,
          s.name as employee_name,
          s.ic_no,
          s.job as staff_job,
          s.head_staff_id,
          s.date_resigned
        FROM jellypolly.payroll_employees pe
        LEFT JOIN jellypolly.staffs s ON pe.employee_id = s.id
        WHERE pe.is_active = true ${whereJobType}
        ORDER BY pe.job_type, s.name, pe.employee_id
      `;
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching JP payroll employees:", error);
      res.status(500).json({
        message: "Error fetching JP payroll employees",
        error: error.message,
      });
    }
  });

  // Add employee to a JP job type (reactivates a soft-deleted row if present)
  router.post("/", async (req, res) => {
    const { employee_id, job_type, notes } = req.body;

    if (!employee_id || !job_type) {
      return res.status(400).json({
        message: "employee_id and job_type are required",
      });
    }

    if (!JP_JOB_TYPES.includes(job_type)) {
      return res.status(400).json({
        message: `job_type must be one of: ${JP_JOB_TYPES.join(", ")}`,
      });
    }

    try {
      const existingCheck = await pool.query(
        `SELECT id, is_active FROM jellypolly.payroll_employees
         WHERE employee_id = $1 AND job_type = $2`,
        [employee_id, job_type]
      );

      if (existingCheck.rows.length > 0) {
        if (existingCheck.rows[0].is_active) {
          return res.status(409).json({
            message: "Employee is already assigned to this job type",
          });
        }
        const updateResult = await pool.query(
          `UPDATE jellypolly.payroll_employees
           SET is_active = true, notes = COALESCE($1, notes), date_added = CURRENT_TIMESTAMP
           WHERE employee_id = $2 AND job_type = $3
           RETURNING *`,
          [notes, employee_id, job_type]
        );
        return res.json({
          message: "Employee reactivated in JP payroll",
          employee: updateResult.rows[0],
        });
      }

      const result = await pool.query(
        `INSERT INTO jellypolly.payroll_employees (employee_id, job_type, notes)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [employee_id, job_type, notes || null]
      );

      res.status(201).json({
        message: "Employee added to JP payroll",
        employee: result.rows[0],
      });
    } catch (error) {
      console.error("Error adding employee to JP payroll:", error);
      res.status(500).json({
        message: "Error adding employee to JP payroll",
        error: error.message,
      });
    }
  });

  // Remove an assignment (soft delete)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `UPDATE jellypolly.payroll_employees
         SET is_active = false
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "JP payroll assignment not found" });
      }

      res.json({
        message: "Employee removed from JP payroll",
        employee: result.rows[0],
      });
    } catch (error) {
      console.error("Error removing employee from JP payroll:", error);
      res.status(500).json({
        message: "Error removing employee from JP payroll",
        error: error.message,
      });
    }
  });

  return router;
}
