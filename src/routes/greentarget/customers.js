// src/routes/greentarget/customers.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all customers
  router.get("/", async (req, res) => {
    try {
      const query = `
        SELECT 
          customer_id, 
          name, 
          phone_number, 
          last_activity_date, 
          status
        FROM greentarget.customers 
        ORDER BY name
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

  // Create a new customer
  router.post("/", async (req, res) => {
    const { name, phone_number } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Customer name is required" });
    }

    try {
      const query = `
        INSERT INTO greentarget.customers (name, phone_number)
        VALUES ($1, $2)
        RETURNING *
      `;
      const result = await pool.query(query, [name, phone_number]);
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

  // Get customer by ID
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = `
        SELECT c.*,
          (SELECT json_agg(l.*) FROM greentarget.locations l WHERE l.customer_id = c.customer_id) as locations
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

  // Update a customer
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { name, phone_number, status } = req.body;

    try {
      const query = `
        UPDATE greentarget.customers
        SET 
          name = $1, 
          phone_number = $2,
          status = $3,
          last_activity_date = CURRENT_DATE
        WHERE customer_id = $4
        RETURNING *
      `;
      const result = await pool.query(query, [name, phone_number, status, id]);

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

  // Delete a customer (soft delete by setting status to inactive)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = `
        UPDATE greentarget.customers
        SET status = 'inactive'
        WHERE customer_id = $1
        RETURNING *
      `;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      res.json({
        message: "Customer deactivated successfully",
        customer: result.rows[0],
      });
    } catch (error) {
      console.error("Error deactivating Green Target customer:", error);
      res.status(500).json({
        message: "Error deactivating customer",
        error: error.message,
      });
    }
  });

  return router;
}