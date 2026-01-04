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

      // Check staffs assigned to this location (location is stored as text or JSONB)
      const staffsResult = await pool.query(
        `SELECT id, name FROM staffs WHERE location::text = $1 OR location::text = '"' || $1 || '"'`,
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

          // Update staffs (location is stored as text or JSONB)
          await client.query(
            "UPDATE staffs SET location = $1 WHERE location::text = $2 OR location::text = '\"' || $2 || '\"'",
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
    // Handle both { locations: [...] } format (from api.delete) and direct array
    const locationIds = req.body.locations || req.body;

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

        // Check staffs (location is stored as text or JSONB)
        const staffsResult = await pool.query(
          `SELECT id, name FROM staffs WHERE location::text = $1 OR location::text = '"' || $1 || '"'`,
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

  // Get all employees with their location mappings
  router.get("/employee-mappings", async (req, res) => {
    try {
      const query = `
        SELECT
          s.id as employee_id,
          s.name as employee_name,
          loc.value as location_code
        FROM staffs s,
          LATERAL jsonb_array_elements_text(COALESCE(s.location, '[]'::jsonb)) AS loc(value)
        WHERE s.location IS NOT NULL
          AND jsonb_array_length(s.location) > 0
          AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
        ORDER BY s.name
      `;
      const result = await pool.query(query);

      // Group by location for summary
      const locationSummary = {};
      result.rows.forEach((row) => {
        if (row.location_code) {
          if (!locationSummary[row.location_code]) {
            locationSummary[row.location_code] = {
              location_code: row.location_code,
              employees: [],
            };
          }
          locationSummary[row.location_code].employees.push({
            employee_id: row.employee_id,
            employee_name: row.employee_name,
          });
        }
      });

      res.json({
        employeeMappings: result.rows,
        locationSummary: Object.values(locationSummary),
      });
    } catch (error) {
      console.error("Error fetching employee mappings:", error);
      res
        .status(500)
        .json({ message: "Error fetching employee mappings", error: error.message });
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

  // ==================== EXCLUSIONS ENDPOINTS ====================

  // Get exclusions for a specific location
  router.get("/:id/exclusions", async (req, res) => {
    const { id } = req.params;

    try {
      const query = `
        SELECT
          ex.id,
          ex.employee_id,
          s.name as employee_name,
          ex.job_id,
          j.name as job_name,
          ex.reason,
          ex.created_at,
          ex.created_by
        FROM employee_job_location_exclusions ex
        JOIN staffs s ON ex.employee_id = s.id
        JOIN jobs j ON ex.job_id = j.id
        WHERE ex.location_code = $1
        ORDER BY s.name, j.name
      `;
      const result = await pool.query(query, [id]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching exclusions:", error);
      res
        .status(500)
        .json({ message: "Error fetching exclusions", error: error.message });
    }
  });

  // Get employees eligible for exclusion at a location
  // (employees who have jobs mapped to this location)
  router.get("/:id/exclusion-candidates", async (req, res) => {
    const { id } = req.params;

    try {
      // Get employees who have jobs that are mapped to this location
      const query = `
        SELECT DISTINCT
          s.id as employee_id,
          s.name as employee_name,
          j.id as job_id,
          j.name as job_name,
          CASE WHEN ex.id IS NOT NULL THEN true ELSE false END as is_excluded
        FROM staffs s
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.job, '[]'::jsonb)) AS emp_job(value)
        JOIN jobs j ON j.id = emp_job.value
        JOIN job_location_mappings jlm ON jlm.job_id = j.id AND jlm.is_active = true
        LEFT JOIN employee_job_location_exclusions ex
          ON ex.employee_id = s.id
          AND ex.job_id = j.id
          AND ex.location_code = $1
        WHERE jlm.location_code = $1
          AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
        ORDER BY s.name, j.name
      `;
      const result = await pool.query(query, [id]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching exclusion candidates:", error);
      res
        .status(500)
        .json({ message: "Error fetching exclusion candidates", error: error.message });
    }
  });

  // Add an exclusion
  router.post("/:id/exclusions", async (req, res) => {
    const { id } = req.params;
    const { employee_id, job_id, reason, created_by } = req.body;

    if (!employee_id || !job_id) {
      return res
        .status(400)
        .json({ message: "employee_id and job_id are required" });
    }

    try {
      const query = `
        INSERT INTO employee_job_location_exclusions
          (employee_id, job_id, location_code, reason, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const result = await pool.query(query, [
        employee_id,
        job_id,
        id,
        reason || null,
        created_by || null,
      ]);

      res.status(201).json({
        message: "Exclusion added successfully",
        exclusion: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505") {
        return res
          .status(400)
          .json({ message: "This exclusion already exists" });
      }
      if (error.code === "23503") {
        return res
          .status(400)
          .json({ message: "Invalid employee_id, job_id, or location_code" });
      }
      console.error("Error adding exclusion:", error);
      res
        .status(500)
        .json({ message: "Error adding exclusion", error: error.message });
    }
  });

  // Remove an exclusion
  router.delete("/:id/exclusions/:exclusionId", async (req, res) => {
    const { id, exclusionId } = req.params;

    try {
      const query = `
        DELETE FROM employee_job_location_exclusions
        WHERE id = $1 AND location_code = $2
        RETURNING *
      `;
      const result = await pool.query(query, [exclusionId, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Exclusion not found" });
      }

      res.json({
        message: "Exclusion removed successfully",
        exclusion: result.rows[0],
      });
    } catch (error) {
      console.error("Error removing exclusion:", error);
      res
        .status(500)
        .json({ message: "Error removing exclusion", error: error.message });
    }
  });

  return router;
}
