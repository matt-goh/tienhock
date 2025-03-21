// src/routes/greentarget/dumpsters.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all dumpsters (with optional status filter)
  router.get("/", async (req, res) => {
    const { status } = req.query;
    
    try {
      let query = "SELECT * FROM greentarget.dumpsters";
      const queryParams = [];
      
      if (status) {
        query += " WHERE status = $1";
        queryParams.push(status);
      }
      
      query += " ORDER BY tong_no";
      
      const result = await pool.query(query, queryParams);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target dumpsters:", error);
      res.status(500).json({
        message: "Error fetching dumpsters",
        error: error.message,
      });
    }
  });

  // Create a new dumpster
  router.post("/", async (req, res) => {
    const { tong_no, status = "available" } = req.body;

    if (!tong_no) {
      return res.status(400).json({ message: "Dumpster number (tong_no) is required" });
    }

    try {
      const query = `
        INSERT INTO greentarget.dumpsters (tong_no, status)
        VALUES ($1, $2)
        RETURNING *
      `;
      const result = await pool.query(query, [tong_no, status]);
      
      res.status(201).json({
        message: "Dumpster created successfully",
        dumpster: result.rows[0],
      });
    } catch (error) {
      if (error.code === '23505') { // unique violation
        return res.status(400).json({ message: "A dumpster with this number already exists" });
      }
      
      console.error("Error creating Green Target dumpster:", error);
      res.status(500).json({
        message: "Error creating dumpster",
        error: error.message,
      });
    }
  });

  // Update a dumpster
  router.put("/:tong_no", async (req, res) => {
    const { tong_no } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    try {
      const query = `
        UPDATE greentarget.dumpsters
        SET status = $1
        WHERE tong_no = $2
        RETURNING *
      `;
      const result = await pool.query(query, [status, tong_no]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Dumpster not found" });
      }

      res.json({
        message: "Dumpster updated successfully",
        dumpster: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating Green Target dumpster:", error);
      res.status(500).json({
        message: "Error updating dumpster",
        error: error.message,
      });
    }
  });

  // Delete a dumpster
  router.delete("/:tong_no", async (req, res) => {
    const { tong_no } = req.params;

    try {
      // First check if the dumpster is in use in any rentals
      const rentalCheck = await pool.query(
        "SELECT COUNT(*) FROM greentarget.rentals WHERE tong_no = $1",
        [tong_no]
      );
      
      if (parseInt(rentalCheck.rows[0].count) > 0) {
        return res.status(400).json({ 
          message: "Cannot delete dumpster: it is being used in one or more rentals" 
        });
      }
      
      const query = "DELETE FROM greentarget.dumpsters WHERE tong_no = $1 RETURNING *";
      const result = await pool.query(query, [tong_no]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Dumpster not found" });
      }

      res.json({
        message: "Dumpster deleted successfully",
        dumpster: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting Green Target dumpster:", error);
      res.status(500).json({
        message: "Error deleting dumpster",
        error: error.message,
      });
    }
  });

  return router;
}