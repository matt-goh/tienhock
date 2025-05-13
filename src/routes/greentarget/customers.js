// src/routes/greentarget/customers.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Update the GET query (around line 14-30)
  router.get("/", async (req, res) => {
    try {
      // Modified query to include active rental information and new e-Invoice fields
      const query = `
      SELECT 
        c.customer_id, 
        c.name, 
        c.phone_number, 
        c.last_activity_date,
        c.tin_number,
        c.id_type,
        c.id_number,
        c.email,
        c.state,
        c.additional_info,
        EXISTS (
          SELECT 1 FROM greentarget.rentals r 
          WHERE r.customer_id = c.customer_id AND r.date_picked IS NULL
        ) as has_active_rental
      FROM greentarget.customers c
      ORDER BY c.name
    `;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target customers:", error);
      res.status(500).json({
        message: "Error fetching Green Target customers",
        error: error.message,
      });
    }
  });

  // Update the POST route (around line 40-70)
  router.post("/", async (req, res) => {
    const {
      name,
      phone_number,
      tin_number,
      id_type,
      id_number,
      email,
      state,
      additional_info,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Customer name is required" });
    }

    try {
      const query = `
      INSERT INTO greentarget.customers (
        name, 
        phone_number, 
        tin_number, 
        id_type, 
        id_number, 
        email, 
        state,
        additional_info
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
      const result = await pool.query(query, [
        name,
        phone_number,
        tin_number || null,
        id_type || null,
        id_number || null,
        email || null,
        state || "12",
        additional_info || null, // Add this line
      ]);

      res.status(201).json({
        message: "Customer created successfully",
        customer: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating Green Target customer:", error);
      res.status(500).json({
        message: "Error creating customer",
        error: error.message,
      });
    }
  });

  // Update the PUT route (around line 100-130)
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      name,
      phone_number,
      tin_number,
      id_type,
      id_number,
      email,
      state,
      additional_info,
    } = req.body;

    try {
      const query = `
      UPDATE greentarget.customers
      SET 
        name = $1, 
        phone_number = $2,
        tin_number = $3,
        id_type = $4,
        id_number = $5,
        email = $6,
        state = $7,
        additional_info = $8,
        last_activity_date = CURRENT_DATE
      WHERE customer_id = $9
      RETURNING *
    `;
      const result = await pool.query(query, [
        name,
        phone_number,
        tin_number || null,
        id_type || null,
        id_number || null,
        email || null,
        state || "12",
        additional_info || null,
        id,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      res.json({
        message: "Customer updated successfully",
        customer: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating Green Target customer:", error);
      res.status(500).json({
        message: "Error updating customer",
        error: error.message,
      });
    }
  });

  // Get customer by ID
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = `
        SELECT c.*,
          (SELECT json_agg(l.*) FROM greentarget.locations l WHERE l.customer_id = c.customer_id) as locations,
        EXISTS (
          SELECT 1 FROM greentarget.rentals r 
          WHERE r.customer_id = c.customer_id AND r.date_picked IS NULL
        ) as has_active_rental
        FROM greentarget.customers c
        WHERE c.customer_id = $1
      `;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching Green Target customer:", error);
      res.status(500).json({
        message: "Error fetching customer",
        error: error.message,
      });
    }
  });

  // Delete a customer (soft delete by setting status to inactive)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // First check if customer has active rentals
      const activeRentalsCheck = await client.query(
        "SELECT COUNT(*) FROM greentarget.rentals WHERE customer_id = $1 AND date_picked IS NULL",
        [id]
      );

      if (parseInt(activeRentalsCheck.rows[0].count) > 0) {
        return res.status(400).json({
          message: "Cannot delete customer: they have active rentals",
        });
      }

      // Delete locations associated with this customer
      await client.query(
        "DELETE FROM greentarget.locations WHERE customer_id = $1",
        [id]
      );

      // Delete the customer
      const query =
        "DELETE FROM greentarget.customers WHERE customer_id = $1 RETURNING *";
      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Customer not found" });
      }

      await client.query("COMMIT");
      res.json({
        message: "Customer deleted successfully",
        customer: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting customer:", error);

      // Check for foreign key constraint violation
      if (error.code === "23503") {
        return res.status(400).json({
          message:
            "Cannot delete customer: they have related records in other tables",
        });
      }

      res.status(500).json({
        message: "Error deleting customer",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
