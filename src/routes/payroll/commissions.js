// src/routes/payroll/commissions.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  /**
   * GET /api/commissions
   * List commissions with date filtering.
   */
  router.get("/", async (req, res) => {
    const { start_date, end_date, employee_id } = req.query;
    try {
      let query = `
        SELECT cr.*, s.name as employee_name
        FROM commission_records cr
        JOIN staffs s ON cr.employee_id = s.id
        WHERE 1=1
      `;
      const values = [];
      let paramCount = 1;

      if (start_date) {
        query += ` AND cr.commission_date >= $${paramCount}`;
        values.push(start_date);
        paramCount++;
      }
      if (end_date) {
        query += ` AND cr.commission_date <= $${paramCount}`;
        values.push(end_date);
        paramCount++;
      }
      if (employee_id) {
        query += ` AND cr.employee_id = $${paramCount}`;
        values.push(employee_id);
        paramCount++;
      }

      query += " ORDER BY cr.commission_date DESC";

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching commission records:", error);
      res.status(500).json({
        message: "Error fetching commission records",
        error: error.message,
      });
    }
  });

  /**
   * POST /api/commissions
   * Create a new commission record.
   */
  router.post("/", async (req, res) => {
    const { employee_id, commission_date, amount, description, created_by } =
      req.body;
    try {
      const query = `
        INSERT INTO commission_records (
          employee_id, commission_date, amount, description, created_by
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      const result = await pool.query(query, [
        employee_id,
        commission_date,
        amount,
        description,
        created_by,
      ]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating commission record:", error);
      res.status(500).json({
        message: "Error creating commission record",
        error: error.message,
      });
    }
  });

  /**
   * PUT /api/commissions/:id
   * Update an existing commission record.
   */
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { amount, description, commission_date } = req.body;
    try {
      const query = `
        UPDATE commission_records
        SET amount = $1, description = $2, commission_date = $3
        WHERE id = $4
        RETURNING *;
      `;
      const result = await pool.query(query, [
        amount,
        description,
        commission_date,
        id,
      ]);
      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "Commission record not found." });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating commission record:", error);
      res.status(500).json({
        message: "Error updating commission record",
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/commissions/:id
   * Deletes a commission record.
   */
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "DELETE FROM commission_records WHERE id = $1 RETURNING *",
        [id]
      );
      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "Commission record not found." });
      }
      res.status(200).json({ message: "Commission record deleted." });
    } catch (error) {
      console.error("Error deleting commission record:", error);
      res.status(500).json({
        message: "Error deleting commission record",
        error: error.message,
      });
    }
  });

  return router;
}
