// src/routes/catalogue/job-location-mappings.js
import { Router } from "express";

// Location code to name mapping
const LOCATION_MAP = {
  "01": "DIRECTOR'S REMUNERATION",
  "02": "OFFICE",
  "03": "SALESMAN",
  "04": "IKUT LORI",
  "05": "PENGANGKUTAN HABUK",
  "06": "JAGA BOILER",
  "07": "MESIN & SANGKUT MEE",
  "08": "PACKING MEE",
  "09": "MESIN BIHUN",
  "10": "SANGKUT BIHUN",
  "11": "PACKING BIHUN",
  "12": "PEKEBUN",
  "13": "TUKANG SAPU",
  "14": "KILANG KERJA LUAR",
  "15": "OTHER SABARINA",
  "16": "COMM-MESIN MEE",
  "17": "COMM-MESIN BIHUN",
  "18": "COMM-KILANG",
  "19": "COMM-LORI",
  "20": "COMM-BOILER",
  "21": "COMM-FORKLIFT/CASE",
  "22": "KILANG HABUK",
  "23": "CUTI TAHUNAN",
  "24": "SPECIAL OT",
};

export default function (pool) {
  const router = Router();

  // GET / - Get all job-location mappings with job names
  router.get("/", async (req, res) => {
    try {
      const query = `
        SELECT
          jlm.id,
          jlm.job_id,
          j.name as job_name,
          jlm.location_code,
          jlm.is_active,
          jlm.created_at,
          jlm.updated_at
        FROM job_location_mappings jlm
        LEFT JOIN jobs j ON jlm.job_id = j.id
        ORDER BY jlm.location_code, jlm.job_id
      `;
      const result = await pool.query(query);

      // Add location names to the response
      const mappings = result.rows.map((row) => ({
        ...row,
        location_name: LOCATION_MAP[row.location_code] || row.location_code,
      }));

      // Create byJob lookup
      const byJob = {};
      mappings.forEach((m) => {
        byJob[m.job_id] = m.location_code;
      });

      // Create byLocation lookup
      const byLocation = {};
      mappings.forEach((m) => {
        if (!byLocation[m.location_code]) {
          byLocation[m.location_code] = [];
        }
        byLocation[m.location_code].push(m.job_id);
      });

      res.json({
        mappings,
        byJob,
        byLocation,
        locationMap: LOCATION_MAP,
      });
    } catch (error) {
      console.error("Error fetching job location mappings:", error);
      res.status(500).json({
        message: "Error fetching job location mappings",
        error: error.message,
      });
    }
  });

  // GET /unmapped - Get all jobs without location mappings
  router.get("/unmapped", async (req, res) => {
    try {
      const query = `
        SELECT j.id, j.name
        FROM jobs j
        LEFT JOIN job_location_mappings jlm ON j.id = jlm.job_id
        WHERE jlm.job_id IS NULL
        ORDER BY j.name
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching unmapped jobs:", error);
      res.status(500).json({
        message: "Error fetching unmapped jobs",
        error: error.message,
      });
    }
  });

  // GET /:jobId - Get location for a specific job
  router.get("/:jobId", async (req, res) => {
    const { jobId } = req.params;

    try {
      const query = `
        SELECT
          jlm.id,
          jlm.job_id,
          j.name as job_name,
          jlm.location_code,
          jlm.is_active,
          jlm.created_at,
          jlm.updated_at
        FROM job_location_mappings jlm
        LEFT JOIN jobs j ON jlm.job_id = j.id
        WHERE jlm.job_id = $1
      `;
      const result = await pool.query(query, [jobId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Job location mapping not found" });
      }

      const mapping = {
        ...result.rows[0],
        location_name: LOCATION_MAP[result.rows[0].location_code] || result.rows[0].location_code,
      };

      res.json(mapping);
    } catch (error) {
      console.error("Error fetching job location mapping:", error);
      res.status(500).json({
        message: "Error fetching job location mapping",
        error: error.message,
      });
    }
  });

  // POST / - Create new job-location mapping
  router.post("/", async (req, res) => {
    const { job_id, location_code, is_active = true } = req.body;

    if (!job_id || !location_code) {
      return res.status(400).json({
        message: "job_id and location_code are required",
      });
    }

    // Validate location code
    if (!LOCATION_MAP[location_code]) {
      return res.status(400).json({
        message: `Invalid location_code. Must be one of: ${Object.keys(LOCATION_MAP).join(", ")}`,
      });
    }

    try {
      await pool.query("BEGIN");

      // Check if job exists
      const jobCheck = await pool.query("SELECT 1 FROM jobs WHERE id = $1", [job_id]);
      if (jobCheck.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Job not found" });
      }

      // Check if mapping already exists
      const existingCheck = await pool.query(
        "SELECT 1 FROM job_location_mappings WHERE job_id = $1",
        [job_id]
      );
      if (existingCheck.rows.length > 0) {
        await pool.query("ROLLBACK");
        return res.status(409).json({
          message: "This job already has a location mapping. Use PUT to update.",
        });
      }

      const insertQuery = `
        INSERT INTO job_location_mappings (job_id, location_code, is_active)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const result = await pool.query(insertQuery, [job_id, location_code, is_active]);

      await pool.query("COMMIT");

      const mapping = {
        ...result.rows[0],
        location_name: LOCATION_MAP[location_code],
      };

      res.status(201).json({
        message: "Job location mapping created successfully",
        mapping,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error creating job location mapping:", error);
      res.status(500).json({
        message: "Error creating job location mapping",
        error: error.message,
      });
    }
  });

  // PUT /:jobId - Update location for a job
  router.put("/:jobId", async (req, res) => {
    const { jobId } = req.params;
    const { location_code, is_active } = req.body;

    if (!location_code && is_active === undefined) {
      return res.status(400).json({
        message: "At least one of location_code or is_active must be provided",
      });
    }

    // Validate location code if provided
    if (location_code && !LOCATION_MAP[location_code]) {
      return res.status(400).json({
        message: `Invalid location_code. Must be one of: ${Object.keys(LOCATION_MAP).join(", ")}`,
      });
    }

    try {
      await pool.query("BEGIN");

      // Check if mapping exists
      const existingCheck = await pool.query(
        "SELECT * FROM job_location_mappings WHERE job_id = $1",
        [jobId]
      );

      if (existingCheck.rows.length === 0) {
        // If no mapping exists and we have a location_code, create one
        if (location_code) {
          const insertQuery = `
            INSERT INTO job_location_mappings (job_id, location_code, is_active)
            VALUES ($1, $2, $3)
            RETURNING *
          `;
          const result = await pool.query(insertQuery, [
            jobId,
            location_code,
            is_active !== undefined ? is_active : true,
          ]);

          await pool.query("COMMIT");

          return res.status(201).json({
            message: "Job location mapping created successfully",
            mapping: {
              ...result.rows[0],
              location_name: LOCATION_MAP[location_code],
            },
          });
        } else {
          await pool.query("ROLLBACK");
          return res.status(404).json({ message: "Job location mapping not found" });
        }
      }

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (location_code) {
        updates.push(`location_code = $${paramIndex++}`);
        values.push(location_code);
      }

      if (is_active !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(is_active);
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(jobId);

      const updateQuery = `
        UPDATE job_location_mappings
        SET ${updates.join(", ")}
        WHERE job_id = $${paramIndex}
        RETURNING *
      `;

      const result = await pool.query(updateQuery, values);

      await pool.query("COMMIT");

      const mapping = {
        ...result.rows[0],
        location_name: LOCATION_MAP[result.rows[0].location_code],
      };

      res.json({
        message: "Job location mapping updated successfully",
        mapping,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error updating job location mapping:", error);
      res.status(500).json({
        message: "Error updating job location mapping",
        error: error.message,
      });
    }
  });

  // DELETE /:jobId - Remove location mapping for a job
  router.delete("/:jobId", async (req, res) => {
    const { jobId } = req.params;

    try {
      await pool.query("BEGIN");

      const deleteQuery = `
        DELETE FROM job_location_mappings
        WHERE job_id = $1
        RETURNING *
      `;
      const result = await pool.query(deleteQuery, [jobId]);

      if (result.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Job location mapping not found" });
      }

      await pool.query("COMMIT");

      res.json({
        message: "Job location mapping deleted successfully",
        deleted: result.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error deleting job location mapping:", error);
      res.status(500).json({
        message: "Error deleting job location mapping",
        error: error.message,
      });
    }
  });

  // POST /batch - Batch create/update mappings
  router.post("/batch", async (req, res) => {
    const { mappings } = req.body;

    if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({
        message: "An array of mappings is required",
      });
    }

    // Validate all entries
    for (const entry of mappings) {
      const { job_id, location_code } = entry;
      if (!job_id || !location_code) {
        return res.status(400).json({
          message: "All entries must have job_id and location_code",
          invalid_entry: entry,
        });
      }
      if (!LOCATION_MAP[location_code]) {
        return res.status(400).json({
          message: `Invalid location_code: ${location_code}`,
          invalid_entry: entry,
        });
      }
    }

    try {
      await pool.query("BEGIN");

      const results = [];
      const errors = [];

      for (const entry of mappings) {
        const { job_id, location_code, is_active = true } = entry;

        try {
          // Upsert - insert or update if exists
          const upsertQuery = `
            INSERT INTO job_location_mappings (job_id, location_code, is_active)
            VALUES ($1, $2, $3)
            ON CONFLICT (job_id)
            DO UPDATE SET
              location_code = EXCLUDED.location_code,
              is_active = EXCLUDED.is_active,
              updated_at = CURRENT_TIMESTAMP
            RETURNING *
          `;
          const result = await pool.query(upsertQuery, [job_id, location_code, is_active]);
          results.push({
            ...result.rows[0],
            location_name: LOCATION_MAP[location_code],
          });
        } catch (error) {
          errors.push({
            job_id,
            location_code,
            message: error.code === "23503" ? "Invalid job_id" : error.message,
          });
        }
      }

      if (results.length > 0) {
        await pool.query("COMMIT");
        res.status(200).json({
          message: `Successfully processed ${results.length} of ${mappings.length} mappings`,
          mappings: results,
          errors: errors.length > 0 ? errors : undefined,
        });
      } else {
        await pool.query("ROLLBACK");
        res.status(400).json({
          message: "Failed to process any mappings",
          errors,
        });
      }
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error in batch mapping:", error);
      res.status(500).json({
        message: "Error processing batch mapping",
        error: error.message,
      });
    }
  });

  return router;
}
