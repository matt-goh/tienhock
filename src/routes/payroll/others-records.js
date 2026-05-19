// src/routes/payroll/others-records.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  /**
   * GET /api/others-records
   * List "Others (Kerja Luar OT)" records with year/month/employee filtering.
   */
  router.get("/", async (req, res) => {
    const { year, month, start_date, end_date, employee_id } = req.query;

    try {
      let query = `
        SELECT orec.*, s.name as employee_name,
               pc.description as pay_code_description
        FROM others_records orec
        JOIN staffs s ON orec.employee_id = s.id
        LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
        WHERE 1=1
      `;
      const values = [];
      let paramCount = 1;

      if (year && month) {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const startDate = `${y}-${m.toString().padStart(2, "0")}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${m.toString().padStart(2, "0")}-${lastDay
          .toString()
          .padStart(2, "0")}`;
        query += ` AND DATE(orec.record_date) >= $${paramCount}`;
        values.push(startDate);
        paramCount++;
        query += ` AND DATE(orec.record_date) <= $${paramCount}`;
        values.push(endDate);
        paramCount++;
      } else {
        if (start_date) {
          query += ` AND DATE(orec.record_date) >= $${paramCount}`;
          values.push(start_date);
          paramCount++;
        }
        if (end_date) {
          query += ` AND DATE(orec.record_date) <= $${paramCount}`;
          values.push(end_date);
          paramCount++;
        }
      }

      if (employee_id) {
        query += ` AND orec.employee_id = $${paramCount}`;
        values.push(employee_id);
        paramCount++;
      }

      query += " ORDER BY orec.record_date DESC, orec.id DESC";

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching others records:", error);
      res.status(500).json({
        message: "Error fetching others records",
        error: error.message,
      });
    }
  });

  /**
   * POST /api/others-records
   * Create a new Others (Kerja Luar OT) record.
   */
  router.post("/", async (req, res) => {
    const {
      employee_id,
      record_date,
      pay_code_id,
      description,
      rate,
      rate_unit,
      quantity,
      amount,
      created_by,
    } = req.body;

    if (
      !employee_id ||
      !record_date ||
      !description ||
      rate == null ||
      !rate_unit ||
      quantity == null ||
      amount == null
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    try {
      const query = `
        INSERT INTO others_records (
          employee_id, record_date, pay_code_id, description,
          rate, rate_unit, quantity, amount, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      const result = await pool.query(query, [
        employee_id,
        record_date,
        pay_code_id || null,
        description,
        rate,
        rate_unit,
        quantity,
        amount,
        created_by || null,
      ]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating others record:", error);
      res.status(500).json({
        message: "Error creating others record",
        error: error.message,
      });
    }
  });

  /**
   * PUT /api/others-records/:id
   * Update an existing Others (Kerja Luar OT) record.
   */
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      record_date,
      pay_code_id,
      description,
      rate,
      rate_unit,
      quantity,
      amount,
    } = req.body;

    try {
      const query = `
        UPDATE others_records
        SET record_date = $1,
            pay_code_id = $2,
            description = $3,
            rate = $4,
            rate_unit = $5,
            quantity = $6,
            amount = $7,
            updated_at = now()
        WHERE id = $8
        RETURNING *;
      `;
      const result = await pool.query(query, [
        record_date,
        pay_code_id || null,
        description,
        rate,
        rate_unit,
        quantity,
        amount,
        id,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Others record not found." });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating others record:", error);
      res.status(500).json({
        message: "Error updating others record",
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/others-records/:id
   */
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "DELETE FROM others_records WHERE id = $1 RETURNING *",
        [id],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Others record not found." });
      }
      res.status(200).json({ message: "Others record deleted." });
    } catch (error) {
      console.error("Error deleting others record:", error);
      res.status(500).json({
        message: "Error deleting others record",
        error: error.message,
      });
    }
  });

  return router;
}
