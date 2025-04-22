// src/routes/catalogue/pay-codes.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all pay codes
  router.get("/", async (req, res) => {
    try {
      const query = "SELECT * FROM pay_codes ORDER BY code";
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching pay codes:", error);
      res.status(500).json({
        message: "Error fetching pay codes",
        error: error.message,
      });
    }
  });

  // Get a specific pay code
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const query = "SELECT * FROM pay_codes WHERE id = $1";
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Pay code not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching pay code:", error);
      res.status(500).json({
        message: "Error fetching pay code",
        error: error.message,
      });
    }
  });

  // Create a new pay code
  router.post("/", async (req, res) => {
    const {
      id,
      code,
      description,
      pay_type,
      rate_unit,
      rate_biasa,
      rate_ahad,
      rate_umum,
      is_active,
      requires_units_input,
    } = req.body;

    try {
      // Check if code already exists
      const checkQuery = "SELECT * FROM pay_codes WHERE code = $1";
      const checkResult = await pool.query(checkQuery, [code]);

      if (checkResult.rows.length > 0) {
        return res
          .status(400)
          .json({ message: "A pay code with this code already exists" });
      }

      const query = `
        INSERT INTO pay_codes (
          id, code, description, pay_type, rate_unit, 
          rate_biasa, rate_ahad, rate_umum, 
          is_active, requires_units_input
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        id,
        code,
        description,
        pay_type,
        rate_unit,
        rate_biasa,
        rate_ahad,
        rate_umum,
        is_active,
        requires_units_input,
      ];

      const result = await pool.query(query, values);
      res.status(201).json({
        message: "Pay code created successfully",
        payCode: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating pay code:", error);
      res.status(500).json({
        message: "Error creating pay code",
        error: error.message,
      });
    }
  });

  // Update a pay code
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      code,
      description,
      pay_type,
      rate_unit,
      rate_biasa,
      rate_ahad,
      rate_umum,
      is_active,
      requires_units_input,
    } = req.body;

    try {
      // Check if the pay code exists
      const checkQuery = "SELECT * FROM pay_codes WHERE id = $1";
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Pay code not found" });
      }

      const query = `
        UPDATE pay_codes
        SET 
          code = $1,
          description = $2, 
          pay_type = $3, 
          rate_unit = $4, 
          rate_biasa = $5, 
          rate_ahad = $6, 
          rate_umum = $7, 
          is_active = $8, 
          requires_units_input = $9
        WHERE id = $10
        RETURNING *
      `;

      const values = [
        code,
        description,
        pay_type,
        rate_unit,
        rate_biasa,
        rate_ahad,
        rate_umum,
        is_active,
        requires_units_input,
        id,
      ];

      const result = await pool.query(query, values);
      res.json({
        message: "Pay code updated successfully",
        payCode: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating pay code:", error);
      res.status(500).json({
        message: "Error updating pay code",
        error: error.message,
      });
    }
  });

  // Delete a pay code
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      // First check if this pay code is used in job_pay_codes
      const checkQuery =
        "SELECT * FROM job_pay_codes WHERE pay_code_id = $1 LIMIT 1";
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length > 0) {
        return res.status(400).json({
          message:
            "Cannot delete this pay code because it is used in job assignments",
        });
      }

      const query = "DELETE FROM pay_codes WHERE id = $1 RETURNING *";
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Pay code not found" });
      }

      res.json({
        message: "Pay code deleted successfully",
        payCode: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting pay code:", error);
      res.status(500).json({
        message: "Error deleting pay code",
        error: error.message,
      });
    }
  });

  return router;
}
