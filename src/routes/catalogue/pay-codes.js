// src/routes/catalogue/pay-codes.js
import { Router } from "express";
import cache, { CACHE_TTL, CACHE_KEYS } from "../utils/memory-cache.js";

export default function (pool) {
  const router = Router();

  // GET / - Remove 'code' from SELECT
  router.get("/", async (req, res) => {
    try {
      const cacheKey = CACHE_KEYS.PAY_CODES;

      // Check cache first
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Select all columns EXCEPT code
      const query = `
        SELECT
          id, description, pay_type, rate_unit,
          CAST(rate_biasa AS NUMERIC(10, 2)) as rate_biasa,
          CAST(rate_ahad AS NUMERIC(10, 2)) as rate_ahad,
          CAST(rate_umum AS NUMERIC(10, 2)) as rate_umum,
          is_active, requires_units_input, created_at, updated_at
        FROM pay_codes ORDER BY updated_at DESC, created_at DESC`; // Order by latest modified/created
      const result = await pool.query(query);
      // Parse numeric values
      const payCodes = result.rows.map((pc) => ({
        ...pc,
        rate_biasa: pc.rate_biasa === null ? null : parseFloat(pc.rate_biasa),
        rate_ahad: pc.rate_ahad === null ? null : parseFloat(pc.rate_ahad),
        rate_umum: pc.rate_umum === null ? null : parseFloat(pc.rate_umum),
      }));

      // Cache the result (12 hours since pay codes rarely change)
      cache.set(cacheKey, payCodes, CACHE_TTL.VERY_LONG);

      res.json(payCodes);
    } catch (error) {
      console.error("Error fetching pay codes:", error);
      res
        .status(500)
        .json({ message: "Error fetching pay codes", error: error.message });
    }
  });

  // GET /:id - Remove 'code' from SELECT
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    if (!id)
      return res.status(400).json({ message: "Pay code ID is required" });
    try {
      // Select all columns EXCEPT code
      const query = `
        SELECT
          id, description, pay_type, rate_unit,
          CAST(rate_biasa AS NUMERIC(10, 2)) as rate_biasa,
          CAST(rate_ahad AS NUMERIC(10, 2)) as rate_ahad,
          CAST(rate_umum AS NUMERIC(10, 2)) as rate_umum,
          is_active, requires_units_input, created_at, updated_at
        FROM pay_codes WHERE id = $1`;
      const result = await pool.query(query, [id]);
      if (result.rows.length === 0)
        return res.status(404).json({ message: "Pay code not found" });

      // Parse numeric values
      const payCode = {
        ...result.rows[0],
        rate_biasa:
          result.rows[0].rate_biasa === null
            ? null
            : parseFloat(result.rows[0].rate_biasa),
        rate_ahad:
          result.rows[0].rate_ahad === null
            ? null
            : parseFloat(result.rows[0].rate_ahad),
        rate_umum:
          result.rows[0].rate_umum === null
            ? null
            : parseFloat(result.rows[0].rate_umum),
      };

      res.json(payCode);
    } catch (error) {
      console.error("Error fetching pay code:", error);
      res
        .status(500)
        .json({ message: "Error fetching pay code", error: error.message });
    }
  });

  // POST
  router.post("/", async (req, res) => {
    const {
      id,
      description,
      pay_type,
      rate_unit,
      rate_biasa,
      rate_ahad,
      rate_umum,
      is_active,
      requires_units_input,
    } = req.body;

    // ID is now the main identifier besides description
    if (!id || !description || !pay_type || !rate_unit) {
      return res
        .status(400)
        .json({
          message:
            "Missing required fields (id, description, pay_type, rate_unit)",
        });
    }

    try {
      // Check if ID already exists
      const checkIdQuery = "SELECT 1 FROM pay_codes WHERE id = $1";
      const checkIdResult = await pool.query(checkIdQuery, [id]);
      if (checkIdResult.rows.length > 0) {
        return res
          .status(409)
          .json({ message: `A pay code with ID '${id}' already exists` });
      }

      const query = `
        INSERT INTO pay_codes (
          id, description, pay_type, rate_unit,
          rate_biasa, rate_ahad, rate_umum,
          is_active, requires_units_input
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) -- Adjusted parameter count
        RETURNING *
      `;
      const values = [
        id,
        description,
        pay_type,
        rate_unit,
        rate_biasa === null ? null : parseFloat(rate_biasa) || 0,
        rate_ahad === null ? null : parseFloat(rate_ahad) || 0,
        rate_umum === null ? null : parseFloat(rate_umum) || 0,
        is_active === undefined ? true : !!is_active,
        requires_units_input === undefined ? false : !!requires_units_input,
      ];

      const result = await pool.query(query, values);

      // Invalidate cache
      cache.invalidate(CACHE_KEYS.PAY_CODES);

      // Parse numeric values in returned object
      const newPayCode = {
        ...result.rows[0],
        rate_biasa:
          result.rows[0].rate_biasa === null
            ? null
            : parseFloat(result.rows[0].rate_biasa),
        rate_ahad:
          result.rows[0].rate_ahad === null
            ? null
            : parseFloat(result.rows[0].rate_ahad),
        rate_umum:
          result.rows[0].rate_umum === null
            ? null
            : parseFloat(result.rows[0].rate_umum),
      };
      res
        .status(201)
        .json({
          message: "Pay code created successfully",
          payCode: newPayCode,
        });
    } catch (error) {
      console.error("Error creating pay code:", error);
      res
        .status(500)
        .json({ message: "Error creating pay code", error: error.message });
    }
  });

  // PUT /:id - Remove 'code' from update and validation
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      description,
      pay_type,
      rate_unit, // Removed 'code'
      rate_biasa,
      rate_ahad,
      rate_umum,
      is_active,
      requires_units_input,
    } = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ message: "Pay code ID is required in the URL" });
    }
    if (!description || !pay_type || !rate_unit) {
      // Code removed from validation
      return res
        .status(400)
        .json({
          message: "Missing required fields (description, pay_type, rate_unit)",
        });
    }

    try {
      // 1. Check existence
      const checkExistQuery = "SELECT 1 FROM pay_codes WHERE id = $1";
      const checkExistResult = await pool.query(checkExistQuery, [id]);
      if (checkExistResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: `Pay code with ID '${id}' not found` });
      }

      // 2. Optional: Check duplicate description if needed
      // const checkDescQuery = "SELECT id FROM pay_codes WHERE description = $1 AND id != $2";
      // const checkDescResult = await pool.query(checkDescQuery, [description, id]);
      // if (checkDescResult.rows.length > 0) {
      //     return res.status(409).json({ message: `Another pay code uses description '${description}'.` });
      // }

      // 3. Update (excluding code)
      const query = `
        UPDATE pay_codes
        SET
          description = $1,
          pay_type = $2,
          rate_unit = $3,
          rate_biasa = $4,
          rate_ahad = $5,
          rate_umum = $6,
          is_active = $7,
          requires_units_input = $8
        WHERE id = $9 -- Adjusted parameter count
        RETURNING *
      `;
      const values = [
        description,
        pay_type,
        rate_unit,
        rate_biasa === null ? null : parseFloat(rate_biasa) || 0,
        rate_ahad === null ? null : parseFloat(rate_ahad) || 0,
        rate_umum === null ? null : parseFloat(rate_umum) || 0,
        is_active === undefined ? true : !!is_active,
        requires_units_input === undefined ? false : !!requires_units_input,
        id,
      ];

      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        console.error(`Pay code ${id} found initially but failed to update.`);
        return res.status(500).json({ message: "Update failed unexpectedly." });
      }

      // Invalidate cache
      cache.invalidate(CACHE_KEYS.PAY_CODES);

      // Parse numeric values in returned object
      const updatedPayCode = {
        ...result.rows[0],
        rate_biasa:
          result.rows[0].rate_biasa === null
            ? null
            : parseFloat(result.rows[0].rate_biasa),
        rate_ahad:
          result.rows[0].rate_ahad === null
            ? null
            : parseFloat(result.rows[0].rate_ahad),
        rate_umum:
          result.rows[0].rate_umum === null
            ? null
            : parseFloat(result.rows[0].rate_umum),
      };
      res.json({
        message: "Pay code updated successfully",
        payCode: updatedPayCode,
      });
    } catch (error) {
      console.error("Error updating pay code:", error);
      res
        .status(500)
        .json({ message: "Error updating pay code", error: error.message });
    }
  });

  // DELETE /:id - No changes needed here, but constraint check still valid
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    if (!id)
      return res.status(400).json({ message: "Pay code ID is required" });
    try {
      // Check if used in job assignments
      const checkQuery =
        "SELECT 1 FROM job_pay_codes WHERE pay_code_id = $1 LIMIT 1";
      const checkResult = await pool.query(checkQuery, [id]);
      if (checkResult.rows.length > 0) {
        return res
          .status(400)
          .json({
            error: true,
            message: "Cannot delete: Pay code is used in job assignments",
          });
      }

      // Proceed with deletion
      const query = "DELETE FROM pay_codes WHERE id = $1 RETURNING id"; // Only need ID back
      const result = await pool.query(query, [id]);
      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ error: true, message: "Pay code not found" });
      }

      // Invalidate cache
      cache.invalidate(CACHE_KEYS.PAY_CODES);

      res.json({
        error: false,
        message: "Pay code deleted successfully",
        payCode: { id: result.rows[0].id },
      });
    } catch (error) {
      console.error("Error deleting pay code:", error);
      res
        .status(500)
        .json({
          error: true,
          message: "Error deleting pay code",
          details: error.message,
        });
    }
  });

  return router;
}
