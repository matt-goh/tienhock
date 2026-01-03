// src/routes/greentarget/payroll-employees.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all GT payroll employees
  router.get("/", async (req, res) => {
    try {
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
          s.job as staff_job
        FROM greentarget.payroll_employees pe
        LEFT JOIN public.staffs s ON pe.employee_id = s.id
        WHERE pe.is_active = true
        ORDER BY pe.job_type, s.name
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching GT payroll employees:", error);
      res.status(500).json({
        message: "Error fetching GT payroll employees",
        error: error.message,
      });
    }
  });

  // Add employee to GT payroll
  router.post("/", async (req, res) => {
    const { employee_id, job_type, notes } = req.body;

    if (!employee_id || !job_type) {
      return res.status(400).json({
        message: "employee_id and job_type are required",
      });
    }

    if (!["OFFICE", "DRIVER"].includes(job_type)) {
      return res.status(400).json({
        message: "job_type must be OFFICE or DRIVER",
      });
    }

    try {
      // Check if already exists
      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.payroll_employees
         WHERE employee_id = $1 AND job_type = $2`,
        [employee_id, job_type]
      );

      if (existingCheck.rows.length > 0) {
        // Reactivate if inactive
        const updateResult = await pool.query(
          `UPDATE greentarget.payroll_employees
           SET is_active = true, notes = COALESCE($1, notes), date_added = CURRENT_TIMESTAMP
           WHERE employee_id = $2 AND job_type = $3
           RETURNING *`,
          [notes, employee_id, job_type]
        );
        return res.json({
          message: "Employee reactivated in GT payroll",
          employee: updateResult.rows[0],
        });
      }

      const insertQuery = `
        INSERT INTO greentarget.payroll_employees (employee_id, job_type, notes)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const result = await pool.query(insertQuery, [employee_id, job_type, notes || null]);

      res.status(201).json({
        message: "Employee added to GT payroll",
        employee: result.rows[0],
      });
    } catch (error) {
      console.error("Error adding employee to GT payroll:", error);
      res.status(500).json({
        message: "Error adding employee to GT payroll",
        error: error.message,
      });
    }
  });

  // Remove employee from GT payroll (soft delete)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = `
        UPDATE greentarget.payroll_employees
        SET is_active = false
        WHERE id = $1
        RETURNING *
      `;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Payroll employee not found" });
      }

      res.json({
        message: "Employee removed from GT payroll",
        employee: result.rows[0],
      });
    } catch (error) {
      console.error("Error removing employee from GT payroll:", error);
      res.status(500).json({
        message: "Error removing employee from GT payroll",
        error: error.message,
      });
    }
  });

  // Hard delete employee from GT payroll
  router.delete("/:id/permanent", async (req, res) => {
    const { id } = req.params;

    try {
      const query = `
        DELETE FROM greentarget.payroll_employees
        WHERE id = $1
        RETURNING *
      `;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Payroll employee not found" });
      }

      res.json({
        message: "Employee permanently removed from GT payroll",
        employee: result.rows[0],
      });
    } catch (error) {
      console.error("Error permanently removing employee from GT payroll:", error);
      res.status(500).json({
        message: "Error permanently removing employee from GT payroll",
        error: error.message,
      });
    }
  });

  return router;
}
