// src/routes/greentarget/driver-trips.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get driver trips for a specific year/month
  router.get("/", async (req, res) => {
    const { year, month, driver_id } = req.query;

    try {
      let query = `
        SELECT
          dt.*,
          s.name as driver_name
        FROM greentarget.driver_trips dt
        LEFT JOIN public.staffs s ON dt.driver_id = s.id
        WHERE 1=1
      `;
      const values = [];
      let paramCount = 1;

      if (year) {
        query += ` AND dt.year = $${paramCount++}`;
        values.push(parseInt(year));
      }
      if (month) {
        query += ` AND dt.month = $${paramCount++}`;
        values.push(parseInt(month));
      }
      if (driver_id) {
        query += ` AND dt.driver_id = $${paramCount++}`;
        values.push(driver_id);
      }

      query += ` ORDER BY s.name, dt.year DESC, dt.month DESC`;

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching driver trips:", error);
      res.status(500).json({
        message: "Error fetching driver trips",
        error: error.message,
      });
    }
  });

  // Auto-calculate trips from rentals
  router.get("/auto-calculate", async (req, res) => {
    const { year, month, driver_id } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        message: "year and month are required",
      });
    }

    try {
      // Calculate first and last day of the month
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay}`;

      // Query completed rentals (those with date_picked)
      let query = `
        SELECT
          r.driver,
          s.name as driver_name,
          COUNT(*) as trip_count,
          array_agg(r.rental_id ORDER BY r.date_placed) as rental_ids
        FROM greentarget.rentals r
        LEFT JOIN public.staffs s ON r.driver = s.id
        WHERE r.date_picked IS NOT NULL
          AND r.date_placed >= $1
          AND r.date_placed <= $2
      `;
      const values = [startDate, endDate];
      let paramCount = 3;

      if (driver_id) {
        query += ` AND r.driver = $${paramCount++}`;
        values.push(driver_id);
      }

      query += ` GROUP BY r.driver, s.name ORDER BY s.name`;

      const result = await pool.query(query, values);

      res.json({
        year: parseInt(year),
        month: parseInt(month),
        drivers: result.rows.map((row) => ({
          driver_id: row.driver,
          driver_name: row.driver_name,
          trip_count: parseInt(row.trip_count),
          rental_ids: row.rental_ids,
        })),
      });
    } catch (error) {
      console.error("Error auto-calculating driver trips:", error);
      res.status(500).json({
        message: "Error auto-calculating driver trips",
        error: error.message,
      });
    }
  });

  // Get rental details for a driver in a specific month
  router.get("/rentals", async (req, res) => {
    const { year, month, driver_id } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        message: "year and month are required",
      });
    }

    try {
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay}`;

      let query = `
        SELECT
          r.rental_id,
          r.date_placed,
          r.date_picked,
          r.driver,
          r.customer_id,
          c.name as customer_name,
          r.location_id,
          l.address as location_address,
          r.dumpster_id,
          d.name as dumpster_name
        FROM greentarget.rentals r
        LEFT JOIN greentarget.customers c ON r.customer_id = c.customer_id
        LEFT JOIN greentarget.locations l ON r.location_id = l.location_id
        LEFT JOIN greentarget.dumpsters d ON r.dumpster_id = d.id
        WHERE r.date_placed >= $1 AND r.date_placed <= $2
      `;
      const values = [startDate, endDate];
      let paramCount = 3;

      if (driver_id) {
        query += ` AND r.driver = $${paramCount++}`;
        values.push(driver_id);
      }

      query += ` ORDER BY r.date_placed DESC`;

      const result = await pool.query(query, values);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching rental details:", error);
      res.status(500).json({
        message: "Error fetching rental details",
        error: error.message,
      });
    }
  });

  // Save or update driver trips
  router.post("/", async (req, res) => {
    const { driver_id, year, month, trip_count, completed_rental_ids, auto_calculated, notes } = req.body;

    if (!driver_id || !year || !month) {
      return res.status(400).json({
        message: "driver_id, year, and month are required",
      });
    }

    try {
      // Check if record exists
      const existingCheck = await pool.query(
        `SELECT id FROM greentarget.driver_trips
         WHERE driver_id = $1 AND year = $2 AND month = $3`,
        [driver_id, year, month]
      );

      let result;
      if (existingCheck.rows.length > 0) {
        // Update existing
        result = await pool.query(
          `UPDATE greentarget.driver_trips
           SET trip_count = $1, completed_rental_ids = $2, auto_calculated = $3,
               notes = $4, updated_at = CURRENT_TIMESTAMP
           WHERE driver_id = $5 AND year = $6 AND month = $7
           RETURNING *`,
          [
            trip_count || 0,
            completed_rental_ids || [],
            auto_calculated !== false,
            notes || null,
            driver_id,
            year,
            month,
          ]
        );
        res.json({
          message: "Driver trips updated successfully",
          trip: result.rows[0],
        });
      } else {
        // Insert new
        result = await pool.query(
          `INSERT INTO greentarget.driver_trips
           (driver_id, year, month, trip_count, completed_rental_ids, auto_calculated, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            driver_id,
            year,
            month,
            trip_count || 0,
            completed_rental_ids || [],
            auto_calculated !== false,
            notes || null,
          ]
        );
        res.status(201).json({
          message: "Driver trips created successfully",
          trip: result.rows[0],
        });
      }
    } catch (error) {
      console.error("Error saving driver trips:", error);
      res.status(500).json({
        message: "Error saving driver trips",
        error: error.message,
      });
    }
  });

  // Bulk save driver trips (for auto-calculation of all drivers)
  router.post("/bulk", async (req, res) => {
    const { year, month, drivers } = req.body;

    if (!year || !month || !drivers || !Array.isArray(drivers)) {
      return res.status(400).json({
        message: "year, month, and drivers array are required",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const results = [];

      for (const driver of drivers) {
        const { driver_id, trip_count, completed_rental_ids } = driver;

        // Check if record exists
        const existingCheck = await client.query(
          `SELECT id FROM greentarget.driver_trips
           WHERE driver_id = $1 AND year = $2 AND month = $3`,
          [driver_id, year, month]
        );

        let result;
        if (existingCheck.rows.length > 0) {
          result = await client.query(
            `UPDATE greentarget.driver_trips
             SET trip_count = $1, completed_rental_ids = $2, auto_calculated = true,
                 updated_at = CURRENT_TIMESTAMP
             WHERE driver_id = $3 AND year = $4 AND month = $5
             RETURNING *`,
            [trip_count || 0, completed_rental_ids || [], driver_id, year, month]
          );
        } else {
          result = await client.query(
            `INSERT INTO greentarget.driver_trips
             (driver_id, year, month, trip_count, completed_rental_ids, auto_calculated)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING *`,
            [driver_id, year, month, trip_count || 0, completed_rental_ids || []]
          );
        }
        results.push(result.rows[0]);
      }

      await client.query("COMMIT");

      res.json({
        message: "Driver trips saved successfully",
        count: results.length,
        trips: results,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error bulk saving driver trips:", error);
      res.status(500).json({
        message: "Error bulk saving driver trips",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Delete driver trip record
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `DELETE FROM greentarget.driver_trips WHERE id = $1 RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Driver trip record not found" });
      }

      res.json({
        message: "Driver trip record deleted successfully",
        trip: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting driver trip:", error);
      res.status(500).json({
        message: "Error deleting driver trip",
        error: error.message,
      });
    }
  });

  return router;
}
