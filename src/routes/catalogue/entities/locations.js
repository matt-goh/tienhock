// src/routes/catalogue/entities/locations.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Create a new location
  router.post("/", async (req, res) => {
    const { id, name } = req.body;

    try {
      const query = `
        INSERT INTO locations (id, name)
        VALUES ($1, $2)
        RETURNING *
      `;

      const values = [id, name];

      const result = await pool.query(query, values);
      res.status(201).json({
        message: "Location created successfully",
        location: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505") {
        return res
          .status(400)
          .json({ message: "A location with this ID already exists" });
      }
      console.error("Error inserting location:", error);
      res
        .status(500)
        .json({ message: "Error creating location", error: error.message });
    }
  });

  // Get all locations
  router.get("/", async (req, res) => {
    try {
      const query = `SELECT * FROM locations ORDER BY id`;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res
        .status(500)
        .json({ message: "Error fetching locations", error: error.message });
    }
  });

  // Get dependencies for a specific location
  router.get("/:id/dependencies", async (req, res) => {
    const { id } = req.params;

    try {
      // Check job_location_mappings
      const jobMappingsResult = await pool.query(
        `SELECT jlm.id, jlm.job_id, j.name as job_name
         FROM job_location_mappings jlm
         LEFT JOIN jobs j ON j.id = jlm.job_id
         WHERE jlm.location_code = $1 AND jlm.is_active = true`,
        [id]
      );

      // Check location_account_mappings
      const accountMappingsResult = await pool.query(
        `SELECT id, location_name, mapping_type, account_code, voucher_type
         FROM location_account_mappings
         WHERE location_id = $1 AND is_active = true`,
        [id]
      );

      // Check staffs assigned to this location
      const staffsResult = await pool.query(
        `SELECT id, name FROM staffs WHERE location = $1`,
        [id]
      );

      const jobs = jobMappingsResult.rows;
      const accounts = accountMappingsResult.rows;
      const staffs = staffsResult.rows;

      const hasDependencies =
        jobs.length > 0 || accounts.length > 0 || staffs.length > 0;

      res.json({
        hasDependencies,
        jobs,
        accounts,
        staffs,
      });
    } catch (error) {
      console.error("Error checking location dependencies:", error);
      res.status(500).json({
        message: "Error checking dependencies",
        error: error.message,
      });
    }
  });

  // Update a location
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { name, newId } = req.body;

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        if (newId && newId !== id) {
          // ID is being changed - need to update all references
          // Check if new ID already exists
          const existingCheck = await client.query(
            "SELECT id FROM locations WHERE id = $1",
            [newId]
          );
          if (existingCheck.rows.length > 0) {
            await client.query("ROLLBACK");
            return res
              .status(400)
              .json({ message: `Location ID "${newId}" already exists` });
          }

          // Insert new record
          await client.query(
            "INSERT INTO locations (id, name) VALUES ($1, $2)",
            [newId, name]
          );

          // Update job_location_mappings
          await client.query(
            "UPDATE job_location_mappings SET location_code = $1 WHERE location_code = $2",
            [newId, id]
          );

          // Update location_account_mappings
          await client.query(
            "UPDATE location_account_mappings SET location_id = $1 WHERE location_id = $2",
            [newId, id]
          );

          // Update staffs
          await client.query(
            "UPDATE staffs SET location = $1 WHERE location = $2",
            [newId, id]
          );

          // Delete old record
          await client.query("DELETE FROM locations WHERE id = $1", [id]);

          await client.query("COMMIT");
          res.json({
            message: "Location updated successfully",
            location: { id: newId, name },
          });
        } else {
          // Just updating name
          const result = await client.query(
            "UPDATE locations SET name = $1 WHERE id = $2 RETURNING *",
            [name, id]
          );

          if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Location not found" });
          }

          await client.query("COMMIT");
          res.json({
            message: "Location updated successfully",
            location: result.rows[0],
          });
        }
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error updating location:", error);
      res
        .status(500)
        .json({ message: "Error updating location", error: error.message });
    }
  });

  // Delete locations (with dependency check)
  router.delete("/", async (req, res) => {
    const locationIds = req.body;

    if (!Array.isArray(locationIds) || locationIds.length === 0) {
      return res.status(400).json({ message: "No location IDs provided" });
    }

    try {
      // Check dependencies for all locations
      const dependencyChecks = [];

      for (const id of locationIds) {
        // Check job_location_mappings
        const jobMappingsResult = await pool.query(
          `SELECT jlm.job_id, j.name as job_name
           FROM job_location_mappings jlm
           LEFT JOIN jobs j ON j.id = jlm.job_id
           WHERE jlm.location_code = $1 AND jlm.is_active = true`,
          [id]
        );

        // Check location_account_mappings
        const accountMappingsResult = await pool.query(
          `SELECT id FROM location_account_mappings
           WHERE location_id = $1 AND is_active = true`,
          [id]
        );

        // Check staffs
        const staffsResult = await pool.query(
          `SELECT id, name FROM staffs WHERE location = $1`,
          [id]
        );

        if (
          jobMappingsResult.rows.length > 0 ||
          accountMappingsResult.rows.length > 0 ||
          staffsResult.rows.length > 0
        ) {
          dependencyChecks.push({
            locationId: id,
            jobs: jobMappingsResult.rows,
            accounts: accountMappingsResult.rows.length,
            staffs: staffsResult.rows,
          });
        }
      }

      if (dependencyChecks.length > 0) {
        return res.status(409).json({
          message: "Cannot delete locations with dependencies",
          dependencies: dependencyChecks,
        });
      }

      // No dependencies, proceed with delete
      const deleteQuery = `DELETE FROM locations WHERE id = ANY($1::text[]) RETURNING id`;
      const result = await pool.query(deleteQuery, [locationIds]);

      const deletedIds = result.rows.map((row) => row.id);
      res.status(200).json({
        message: "Locations deleted successfully",
        deletedLocations: deletedIds,
      });
    } catch (error) {
      console.error("Error deleting locations:", error);
      res
        .status(500)
        .json({ message: "Error deleting locations", error: error.message });
    }
  });

  // Get all jobs with their location mappings
  router.get("/job-mappings", async (req, res) => {
    try {
      const query = `
        SELECT
          j.id as job_id,
          j.name as job_name,
          j.section,
          jlm.location_code,
          l.name as location_name,
          jlm.is_active
        FROM jobs j
        LEFT JOIN job_location_mappings jlm ON j.id = jlm.job_id AND jlm.is_active = true
        LEFT JOIN locations l ON jlm.location_code = l.id
        ORDER BY j.section, j.name
      `;
      const result = await pool.query(query);

      // Group by location for summary
      const locationSummary = {};
      result.rows.forEach((row) => {
        if (row.location_code) {
          if (!locationSummary[row.location_code]) {
            locationSummary[row.location_code] = {
              location_code: row.location_code,
              location_name: row.location_name,
              jobs: [],
            };
          }
          locationSummary[row.location_code].jobs.push({
            job_id: row.job_id,
            job_name: row.job_name,
            section: row.section,
          });
        }
      });

      res.json({
        jobMappings: result.rows,
        locationSummary: Object.values(locationSummary),
      });
    } catch (error) {
      console.error("Error fetching job mappings:", error);
      res
        .status(500)
        .json({ message: "Error fetching job mappings", error: error.message });
    }
  });

  return router;
}
