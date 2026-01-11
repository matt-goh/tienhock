// src/routes/greentarget/pickup-destinations.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET all pickup destinations (active by default)
  router.get("/", async (req, res) => {
    try {
      const { include_inactive } = req.query;

      let query = `
        SELECT id, code, name, is_default, sort_order, is_active, created_at, updated_at
        FROM greentarget.pickup_destinations
      `;

      if (include_inactive !== 'true') {
        query += ` WHERE is_active = true`;
      }

      query += ` ORDER BY sort_order ASC, name ASC`;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching pickup destinations:", error);
      res.status(500).json({ error: "Failed to fetch pickup destinations" });
    }
  });

  // GET single pickup destination by ID
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `SELECT id, code, name, is_default, sort_order, is_active, created_at, updated_at
         FROM greentarget.pickup_destinations
         WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Pickup destination not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching pickup destination:", error);
      res.status(500).json({ error: "Failed to fetch pickup destination" });
    }
  });

  // POST create new pickup destination
  router.post("/", async (req, res) => {
    try {
      const { code, name, is_default = false, sort_order = 0 } = req.body;

      if (!code || !name) {
        return res.status(400).json({ error: "Code and name are required" });
      }

      // Check if code already exists
      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.pickup_destinations WHERE code = $1`,
        [code.toUpperCase()]
      );

      if (existingCheck.rows.length > 0) {
        return res.status(409).json({ error: "A destination with this code already exists" });
      }

      // If setting as default, clear other defaults first
      if (is_default) {
        await pool.query(
          `UPDATE greentarget.pickup_destinations SET is_default = false WHERE is_default = true`
        );
      }

      const result = await pool.query(
        `INSERT INTO greentarget.pickup_destinations (code, name, is_default, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id, code, name, is_default, sort_order, is_active, created_at, updated_at`,
        [code.toUpperCase(), name, is_default, sort_order]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating pickup destination:", error);
      res.status(500).json({ error: "Failed to create pickup destination" });
    }
  });

  // PUT update pickup destination
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { code, name, is_default, sort_order, is_active } = req.body;

      // Check if destination exists
      const existingCheck = await pool.query(
        `SELECT id, code FROM greentarget.pickup_destinations WHERE id = $1`,
        [id]
      );

      if (existingCheck.rows.length === 0) {
        return res.status(404).json({ error: "Pickup destination not found" });
      }

      // If changing code, check if new code already exists
      if (code && code.toUpperCase() !== existingCheck.rows[0].code) {
        const codeCheck = await pool.query(
          `SELECT id FROM greentarget.pickup_destinations WHERE code = $1 AND id != $2`,
          [code.toUpperCase(), id]
        );

        if (codeCheck.rows.length > 0) {
          return res.status(409).json({ error: "A destination with this code already exists" });
        }
      }

      // If setting as default, clear other defaults first
      if (is_default === true) {
        await pool.query(
          `UPDATE greentarget.pickup_destinations SET is_default = false WHERE is_default = true AND id != $1`,
          [id]
        );
      }

      const result = await pool.query(
        `UPDATE greentarget.pickup_destinations
         SET code = COALESCE($1, code),
             name = COALESCE($2, name),
             is_default = COALESCE($3, is_default),
             sort_order = COALESCE($4, sort_order),
             is_active = COALESCE($5, is_active)
         WHERE id = $6
         RETURNING id, code, name, is_default, sort_order, is_active, created_at, updated_at`,
        [code ? code.toUpperCase() : null, name, is_default, sort_order, is_active, id]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating pickup destination:", error);
      res.status(500).json({ error: "Failed to update pickup destination" });
    }
  });

  // DELETE pickup destination (soft delete - set is_active to false)
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { permanent } = req.query;

      // Check if destination exists
      const existingCheck = await pool.query(
        `SELECT id, code FROM greentarget.pickup_destinations WHERE id = $1`,
        [id]
      );

      if (existingCheck.rows.length === 0) {
        return res.status(404).json({ error: "Pickup destination not found" });
      }

      // Check if destination is used in any rentals
      const usageCheck = await pool.query(
        `SELECT COUNT(*) as count FROM greentarget.rentals WHERE pickup_destination = $1`,
        [existingCheck.rows[0].code]
      );

      if (permanent === 'true') {
        if (parseInt(usageCheck.rows[0].count) > 0) {
          return res.status(400).json({
            error: "Cannot permanently delete: destination is used in rentals",
            usage_count: parseInt(usageCheck.rows[0].count)
          });
        }

        await pool.query(`DELETE FROM greentarget.pickup_destinations WHERE id = $1`, [id]);
        res.json({ message: "Pickup destination permanently deleted" });
      } else {
        // Soft delete
        await pool.query(
          `UPDATE greentarget.pickup_destinations SET is_active = false WHERE id = $1`,
          [id]
        );
        res.json({
          message: "Pickup destination deactivated",
          usage_count: parseInt(usageCheck.rows[0].count)
        });
      }
    } catch (error) {
      console.error("Error deleting pickup destination:", error);
      res.status(500).json({ error: "Failed to delete pickup destination" });
    }
  });

  return router;
};
