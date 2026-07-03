// src/routes/jellypolly/incentives.js
// Jelly Polly Bonus / Others (Advance) records on jellypolly.commission_records.
// JP has no locations: the Bonus vs Advance split is carried by is_advance
//   Bonus            -> is_advance = false
//   Others (Advance) -> is_advance = true
// Saving/updating/deleting auto-reprocesses the affected employee's JP payroll.
import { Router } from "express";
import { reprocessJPEmployeesSafe } from "./jpPayrollProcessor.js";

const yearMonthOf = (value) => {
  if (value instanceof Date) {
    return { year: value.getFullYear(), month: value.getMonth() + 1 };
  }
  const [year, month] = String(value).split("T")[0].split("-");
  return { year: parseInt(year), month: parseInt(month) };
};

export default function (pool) {
  const router = Router();

  /**
   * GET /jellypolly/api/incentives
   * List JP commission/bonus records with date filtering.
   * Optional ?is_advance=true|false narrows to Advance vs Bonus.
   */
  router.get("/", async (req, res) => {
    const { start_date, end_date, employee_id, is_advance } = req.query;

    try {
      let query = `
        SELECT cr.*, s.name as employee_name
        FROM jellypolly.commission_records cr
        JOIN jellypolly.staffs s ON cr.employee_id = s.id
        WHERE 1=1
      `;
      const values = [];
      let paramCount = 1;

      if (is_advance === "true" || is_advance === "false") {
        query += ` AND cr.is_advance = $${paramCount}`;
        values.push(is_advance === "true");
        paramCount++;
      }
      if (start_date) {
        query += ` AND DATE(cr.commission_date) >= $${paramCount}`;
        values.push(start_date);
        paramCount++;
      }
      if (end_date) {
        query += ` AND DATE(cr.commission_date) <= $${paramCount}`;
        values.push(end_date);
        paramCount++;
      }
      if (employee_id) {
        query += ` AND cr.employee_id = $${paramCount}`;
        values.push(employee_id);
        paramCount++;
      }

      query += " ORDER BY cr.commission_date DESC, cr.id DESC";

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching JP incentive records:", error);
      res.status(500).json({
        message: "Error fetching incentive records",
        error: error.message,
      });
    }
  });

  /**
   * POST /jellypolly/api/incentives
   * Create a new JP commission/bonus record.
   */
  router.post("/", async (req, res) => {
    const { employee_id, commission_date, amount, description, created_by, is_advance } =
      req.body;
    try {
      const query = `
        INSERT INTO jellypolly.commission_records (
          employee_id, commission_date, amount, description, created_by, is_advance
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;
      const result = await pool.query(query, [
        employee_id,
        commission_date,
        amount,
        description,
        created_by,
        is_advance === true,
      ]);

      const { year, month } = yearMonthOf(commission_date);
      await reprocessJPEmployeesSafe(pool, {
        year,
        month,
        employeeIds: [employee_id],
      });

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating JP incentive record:", error);
      res.status(500).json({
        message: "Error creating incentive record",
        error: error.message,
      });
    }
  });

  /**
   * PUT /jellypolly/api/incentives/:id
   * Update an existing JP commission/bonus record.
   */
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { amount, description, commission_date, is_advance } = req.body;
    try {
      const previous = await pool.query(
        "SELECT employee_id, commission_date FROM jellypolly.commission_records WHERE id = $1",
        [id]
      );
      const query = `
        UPDATE jellypolly.commission_records
        SET amount = $1, description = $2, commission_date = $3, is_advance = $4,
            updated_at = now()
        WHERE id = $5
        RETURNING *;
      `;
      const result = await pool.query(query, [
        amount,
        description,
        commission_date,
        is_advance === true,
        id,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Incentive record not found." });
      }

      const updated = result.rows[0];
      const { year, month } = yearMonthOf(updated.commission_date);
      await reprocessJPEmployeesSafe(pool, {
        year,
        month,
        employeeIds: [updated.employee_id],
      });
      // If the record was moved across months, reprocess the old month too
      if (previous.rows.length > 0) {
        const old = yearMonthOf(previous.rows[0].commission_date);
        if (old.year !== year || old.month !== month) {
          await reprocessJPEmployeesSafe(pool, {
            year: old.year,
            month: old.month,
            employeeIds: [previous.rows[0].employee_id],
          });
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating JP incentive record:", error);
      res.status(500).json({
        message: "Error updating incentive record",
        error: error.message,
      });
    }
  });

  /**
   * DELETE /jellypolly/api/incentives/:id
   */
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "DELETE FROM jellypolly.commission_records WHERE id = $1 RETURNING *",
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Incentive record not found." });
      }

      const deleted = result.rows[0];
      const { year, month } = yearMonthOf(deleted.commission_date);
      await reprocessJPEmployeesSafe(pool, {
        year,
        month,
        employeeIds: [deleted.employee_id],
      });

      res.status(200).json({ message: "Incentive record deleted." });
    } catch (error) {
      console.error("Error deleting JP incentive record:", error);
      res.status(500).json({
        message: "Error deleting incentive record",
        error: error.message,
      });
    }
  });

  return router;
}
