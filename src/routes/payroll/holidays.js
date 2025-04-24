// src/routes/payroll/holidays.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all holidays for a specific year
  router.get("/", async (req, res) => {
    const { year } = req.query;

    try {
      let query = `
        SELECT 
          id, 
          holiday_date, 
          description, 
          is_active
        FROM holiday_calendar
        WHERE is_active = true
      `;
      const values = [];

      if (year) {
        query += " AND EXTRACT(YEAR FROM holiday_date) = $1";
        values.push(year);
      }

      query += " ORDER BY holiday_date";

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      res.status(500).json({
        message: "Error fetching holidays",
        error: error.message,
      });
    }
  });

  // Create a new holiday
  router.post("/", async (req, res) => {
    const { holiday_date, description } = req.body;

    if (!holiday_date) {
      return res.status(400).json({ message: "Holiday date is required" });
    }

    try {
      // Check if holiday already exists
      const checkQuery = `
      SELECT 1 FROM holiday_calendar 
      WHERE holiday_date = $1
    `;
      const checkResult = await pool.query(checkQuery, [holiday_date]);

      if (checkResult.rows.length > 0) {
        return res.status(409).json({
          message: "A holiday already exists for this date",
        });
      }

      const query = `
      INSERT INTO holiday_calendar (holiday_date, description, is_active, created_at, updated_at)
      VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;

      const result = await pool.query(query, [
        holiday_date,
        description || null,
      ]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({
        message: "Error creating holiday",
        error: error.message,
      });
    }
  });

  // Update a holiday
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { holiday_date, description } = req.body;

    if (!holiday_date) {
      return res.status(400).json({ message: "Holiday date is required" });
    }

    try {
      // Check if changing to a date that already exists
      const checkQuery = `
        SELECT 1 FROM holiday_calendar 
        WHERE holiday_date = $1 AND id != $2
      `;
      const checkResult = await pool.query(checkQuery, [holiday_date, id]);

      if (checkResult.rows.length > 0) {
        return res.status(409).json({
          message: "A holiday already exists for this date",
        });
      }

      const query = `
        UPDATE holiday_calendar
        SET holiday_date = $1, description = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;

      const result = await pool.query(query, [
        holiday_date,
        description || null,
        id,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Holiday not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating holiday:", error);
      res.status(500).json({
        message: "Error updating holiday",
        error: error.message,
      });
    }
  });

  // Delete a holiday
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = `
        DELETE FROM holiday_calendar
        WHERE id = $1
        RETURNING id
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Holiday not found" });
      }

      res.json({ message: "Holiday deleted successfully" });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      res.status(500).json({
        message: "Error deleting holiday",
        error: error.message,
      });
    }
  });

  return router;
}
