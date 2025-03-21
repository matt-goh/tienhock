// src/routes/greentarget/locations.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all locations (optionally filtered by customer_id)
  router.get("/", async (req, res) => {
    const { customer_id } = req.query;
    
    try {
      let query = `
        SELECT l.*, c.name as customer_name
        FROM greentarget.locations l
        JOIN greentarget.customers c ON l.customer_id = c.customer_id
      `;
      
      const queryParams = [];
      
      if (customer_id) {
        query += " WHERE l.customer_id = $1";
        queryParams.push(customer_id);
      }
      
      query += " ORDER BY c.name, l.address";
      
      const result = await pool.query(query, queryParams);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target locations:", error);
      res.status(500).json({
        message: "Error fetching locations",
        error: error.message,
      });
    }
  });

  // Create a new location
  router.post("/", async (req, res) => {
    const { customer_id, address } = req.body;

    if (!customer_id || !address) {
      return res.status(400).json({ message: "Customer ID and address are required" });
    }

    try {
      // First, ensure the customer exists and update last_activity_date
      const customerQuery = `
        UPDATE greentarget.customers
        SET last_activity_date = CURRENT_DATE
        WHERE customer_id = $1
        RETURNING *
      `;
      const customerResult = await pool.query(customerQuery, [customer_id]);
      
      if (customerResult.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Then create the location
      const locationQuery = `
        INSERT INTO greentarget.locations (customer_id, address)
        VALUES ($1, $2)
        RETURNING *
      `;
      const locationResult = await pool.query(locationQuery, [customer_id, address]);
      
      res.status(201).json({
        message: "Location created successfully",
        location: locationResult.rows[0],
      });
    } catch (error) {
      console.error("Error creating Green Target location:", error);
      res.status(500).json({
        message: "Error creating location",
        error: error.message,
      });
    }
  });

  // Update a location
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { address } = req.body;

    try {
      const query = `
        UPDATE greentarget.locations
        SET address = $1
        WHERE location_id = $2
        RETURNING *
      `;
      const result = await pool.query(query, [address, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Location not found" });
      }

      res.json({
        message: "Location updated successfully",
        location: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating Green Target location:", error);
      res.status(500).json({
        message: "Error updating location",
        error: error.message,
      });
    }
  });

  // Delete a location
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = "DELETE FROM greentarget.locations WHERE location_id = $1 RETURNING *";
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Location not found" });
      }

      res.json({
        message: "Location deleted successfully",
        location: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting Green Target location:", error);
      res.status(500).json({
        message: "Error deleting location",
        error: error.message,
      });
    }
  });

  return router;
}