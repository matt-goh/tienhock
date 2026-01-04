// src/routes/payroll/incentives.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  /**
   * GET /api/incentives
   * List incentives (commissions, bonuses, etc.) with date filtering.
   */
  router.get("/", async (req, res) => {
    const { start_date, end_date, employee_id } = req.query;

    try {
      let query = `
        SELECT cr.*, s.name as employee_name, l.name as location_name
        FROM commission_records cr
        JOIN staffs s ON cr.employee_id = s.id
        LEFT JOIN locations l ON cr.location_code = l.id
        WHERE 1=1
      `;
      const values = [];
      let paramCount = 1;

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

      query += " ORDER BY cr.commission_date DESC, cr.location_code";

      const result = await pool.query(query, values);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching incentive records:", error);
      res.status(500).json({
        message: "Error fetching incentive records",
        error: error.message,
      });
    }
  });

  /**
   * POST /api/incentives
   * Create a new incentive record.
   */
  router.post("/", async (req, res) => {
    const { employee_id, commission_date, amount, description, created_by, location_code } =
      req.body;
    try {
      const query = `
        INSERT INTO commission_records (
          employee_id, commission_date, amount, description, created_by, location_code
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;
      const result = await pool.query(query, [
        employee_id,
        commission_date,
        amount,
        description,
        created_by,
        location_code || null, // NULL for bonus entries, location code for commission entries
      ]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating incentive record:", error);
      res.status(500).json({
        message: "Error creating incentive record",
        error: error.message,
      });
    }
  });

  /**
   * PUT /api/incentives/:id
   * Update an existing incentive record.
   */
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { amount, description, commission_date, location_code } = req.body;
    try {
      const query = `
        UPDATE commission_records
        SET amount = $1, description = $2, commission_date = $3, location_code = $4
        WHERE id = $5
        RETURNING *;
      `;
      const result = await pool.query(query, [
        amount,
        description,
        commission_date,
        location_code || null, // NULL for bonus entries
        id,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Incentive record not found." });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating incentive record:", error);
      res.status(500).json({
        message: "Error updating incentive record",
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/incentives/:id
   * Deletes an incentive record.
   */
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "DELETE FROM commission_records WHERE id = $1 RETURNING *",
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Incentive record not found." });
      }
      res.status(200).json({ message: "Incentive record deleted." });
    } catch (error) {
      console.error("Error deleting incentive record:", error);
      res.status(500).json({
        message: "Error deleting incentive record",
        error: error.message,
      });
    }
  });

  return router;
}
