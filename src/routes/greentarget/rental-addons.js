// src/routes/greentarget/rental-addons.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET all addons for a specific rental
  router.get("/rentals/:rental_id/addons", async (req, res) => {
    try {
      const { rental_id } = req.params;

      // Verify rental exists
      const rentalCheck = await pool.query(
        `SELECT rental_id FROM greentarget.rentals WHERE rental_id = $1`,
        [rental_id]
      );

      if (rentalCheck.rows.length === 0) {
        return res.status(404).json({ error: "Rental not found" });
      }

      const result = await pool.query(
        `SELECT
          ra.id,
          ra.rental_id,
          ra.pay_code_id,
          ra.quantity,
          ra.amount,
          ra.notes,
          ra.created_at,
          ra.created_by,
          pc.description as pay_code_description,
          ap.display_name
        FROM greentarget.rental_addons ra
        JOIN pay_codes pc ON ra.pay_code_id = pc.id
        LEFT JOIN greentarget.addon_paycodes ap ON ra.pay_code_id = ap.pay_code_id
        WHERE ra.rental_id = $1
        ORDER BY ra.created_at ASC`,
        [rental_id]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching rental addons:", error);
      res.status(500).json({ error: "Failed to fetch rental addons" });
    }
  });

  // POST add a new addon to a rental
  router.post("/rentals/:rental_id/addons", async (req, res) => {
    try {
      const { rental_id } = req.params;
      const { pay_code_id, quantity = 1, amount, notes, created_by } = req.body;

      // Validate required fields
      if (!pay_code_id) {
        return res.status(400).json({ error: "pay_code_id is required" });
      }

      // Verify rental exists
      const rentalCheck = await pool.query(
        `SELECT rental_id FROM greentarget.rentals WHERE rental_id = $1`,
        [rental_id]
      );

      if (rentalCheck.rows.length === 0) {
        return res.status(404).json({ error: "Rental not found" });
      }

      // Validate pay_code exists
      const payCodeCheck = await pool.query(
        `SELECT id, rate_biasa FROM pay_codes WHERE id = $1`,
        [pay_code_id]
      );

      if (payCodeCheck.rows.length === 0) {
        return res.status(400).json({ error: "Invalid pay_code_id" });
      }

      // If amount not provided, get it from addon_paycodes or pay_codes
      let finalAmount = amount;
      if (finalAmount === undefined || finalAmount === null) {
        const addonConfig = await pool.query(
          `SELECT default_amount FROM greentarget.addon_paycodes WHERE pay_code_id = $1`,
          [pay_code_id]
        );

        if (addonConfig.rows.length > 0) {
          finalAmount = parseFloat(addonConfig.rows[0].default_amount);
        } else {
          finalAmount = parseFloat(payCodeCheck.rows[0].rate_biasa);
        }
      }

      const result = await pool.query(
        `INSERT INTO greentarget.rental_addons (rental_id, pay_code_id, quantity, amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [rental_id, pay_code_id, quantity, finalAmount, notes || null, created_by || null]
      );

      // Get full addon info with pay_code details
      const addonResult = await pool.query(
        `SELECT
          ra.id,
          ra.rental_id,
          ra.pay_code_id,
          ra.quantity,
          ra.amount,
          ra.notes,
          ra.created_at,
          ra.created_by,
          pc.description as pay_code_description,
          ap.display_name
        FROM greentarget.rental_addons ra
        JOIN pay_codes pc ON ra.pay_code_id = pc.id
        LEFT JOIN greentarget.addon_paycodes ap ON ra.pay_code_id = ap.pay_code_id
        WHERE ra.id = $1`,
        [result.rows[0].id]
      );

      res.status(201).json(addonResult.rows[0]);
    } catch (error) {
      console.error("Error adding rental addon:", error);
      res.status(500).json({ error: "Failed to add rental addon" });
    }
  });

  // PUT update a rental addon
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { quantity, amount, notes } = req.body;

      // Check if addon exists
      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.rental_addons WHERE id = $1`,
        [id]
      );

      if (existingCheck.rows.length === 0) {
        return res.status(404).json({ error: "Rental addon not found" });
      }

      const result = await pool.query(
        `UPDATE greentarget.rental_addons
         SET quantity = COALESCE($1, quantity),
             amount = COALESCE($2, amount),
             notes = COALESCE($3, notes)
         WHERE id = $4
         RETURNING *`,
        [quantity, amount, notes, id]
      );

      // Get full addon info with pay_code details
      const addonResult = await pool.query(
        `SELECT
          ra.id,
          ra.rental_id,
          ra.pay_code_id,
          ra.quantity,
          ra.amount,
          ra.notes,
          ra.created_at,
          ra.created_by,
          pc.description as pay_code_description,
          ap.display_name
        FROM greentarget.rental_addons ra
        JOIN pay_codes pc ON ra.pay_code_id = pc.id
        LEFT JOIN greentarget.addon_paycodes ap ON ra.pay_code_id = ap.pay_code_id
        WHERE ra.id = $1`,
        [id]
      );

      res.json(addonResult.rows[0]);
    } catch (error) {
      console.error("Error updating rental addon:", error);
      res.status(500).json({ error: "Failed to update rental addon" });
    }
  });

  // DELETE a rental addon
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.rental_addons WHERE id = $1`,
        [id]
      );

      if (existingCheck.rows.length === 0) {
        return res.status(404).json({ error: "Rental addon not found" });
      }

      await pool.query(`DELETE FROM greentarget.rental_addons WHERE id = $1`, [id]);
      res.json({ message: "Rental addon deleted successfully" });
    } catch (error) {
      console.error("Error deleting rental addon:", error);
      res.status(500).json({ error: "Failed to delete rental addon" });
    }
  });

  // GET addons for multiple rentals (batch query)
  router.post("/batch", async (req, res) => {
    try {
      const { rental_ids } = req.body;

      if (!rental_ids || !Array.isArray(rental_ids) || rental_ids.length === 0) {
        return res.status(400).json({ error: "rental_ids array is required" });
      }

      const result = await pool.query(
        `SELECT
          ra.id,
          ra.rental_id,
          ra.pay_code_id,
          ra.quantity,
          ra.amount,
          ra.notes,
          ra.created_at,
          pc.description as pay_code_description,
          ap.display_name
        FROM greentarget.rental_addons ra
        JOIN pay_codes pc ON ra.pay_code_id = pc.id
        LEFT JOIN greentarget.addon_paycodes ap ON ra.pay_code_id = ap.pay_code_id
        WHERE ra.rental_id = ANY($1)
        ORDER BY ra.rental_id, ra.created_at ASC`,
        [rental_ids]
      );

      // Group by rental_id
      const addonsByRental = {};
      rental_ids.forEach(id => {
        addonsByRental[id] = [];
      });
      result.rows.forEach(addon => {
        if (addonsByRental[addon.rental_id]) {
          addonsByRental[addon.rental_id].push(addon);
        }
      });

      res.json(addonsByRental);
    } catch (error) {
      console.error("Error fetching batch rental addons:", error);
      res.status(500).json({ error: "Failed to fetch rental addons" });
    }
  });

  return router;
};
