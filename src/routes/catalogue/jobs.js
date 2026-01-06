// src/routes/jobs.js
import { Router } from "express";
import cache, { CACHE_TTL, CACHE_KEYS } from "../utils/memory-cache.js";

export default function (pool) {
  const router = Router();

  // Helper functions
  async function checkDuplicateJobName(name, id = null) {
    const query = id
      ? "SELECT * FROM jobs WHERE name = $1 AND id != $2"
      : "SELECT * FROM jobs WHERE name = $1";
    const values = id ? [name, id] : [name];
    const result = await pool.query(query, values);
    return result.rows.length > 0;
  }

  async function checkDuplicateJobId(id) {
    const query = "SELECT * FROM jobs WHERE id = $1";
    const result = await pool.query(query, [id]);
    return result.rows.length > 0;
  }

  // Get all jobs
  router.get("/", async (req, res) => {
    try {
      const cacheKey = CACHE_KEYS.JOBS;

      // Check cache first
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const query = "SELECT * FROM jobs";
      const result = await pool.query(query);

      const jobs = result.rows.map((job) => ({
        ...job,
        section: job.section ? job.section.split(", ") : [],
      }));

      // Cache the result
      cache.set(cacheKey, jobs, CACHE_TTL.VERY_LONG);

      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res
        .status(500)
        .json({ message: "Error fetching jobs", error: error.message });
    }
  });

  // Create new job
  router.post("/", async (req, res) => {
    const { id, name, section } = req.body;

    try {
      const isDuplicateName = await checkDuplicateJobName(name);
      if (isDuplicateName) {
        return res
          .status(400)
          .json({ message: "A job with this name already exists" });
      }

      const isDuplicateId = await checkDuplicateJobId(id);
      if (isDuplicateId) {
        return res
          .status(400)
          .json({ message: "A job with this ID already exists" });
      }

      const query = `
        INSERT INTO jobs (id, name, section)
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const values = [
        id,
        name,
        Array.isArray(section) ? section.join(", ") : section,
      ];

      const result = await pool.query(query, values);

      // Invalidate cache
      cache.invalidate(CACHE_KEYS.JOBS);

      res
        .status(201)
        .json({ message: "Job created successfully", job: result.rows[0] });
    } catch (error) {
      console.error("Error inserting job:", error);
      res
        .status(500)
        .json({ message: "Error creating job", error: error.message });
    }
  });

  // Get dependencies for a specific job
  router.get("/:id/dependencies", async (req, res) => {
    const { id } = req.params;

    try {
      // Check job_pay_codes
      const payCodesResult = await pool.query(
        `SELECT jpc.id, jpc.pay_code_id, pc.description
         FROM job_pay_codes jpc
         LEFT JOIN pay_codes pc ON pc.id = jpc.pay_code_id
         WHERE jpc.job_id = $1`,
        [id]
      );

      // Check job_location_mappings
      const locationMappingsResult = await pool.query(
        `SELECT jlm.id, jlm.location_code, l.name as location_name
         FROM job_location_mappings jlm
         LEFT JOIN locations l ON l.id = jlm.location_code
         WHERE jlm.job_id = $1 AND jlm.is_active = true`,
        [id]
      );

      // Check staffs assigned to this job (job is JSONB array)
      const staffsResult = await pool.query(
        `SELECT id, name FROM staffs WHERE job ? $1`,
        [id]
      );
      const staffs = staffsResult.rows;

      // Check jobs_job_details
      const jobDetailsResult = await pool.query(
        `SELECT jjd.job_detail_id, jd.description
         FROM jobs_job_details jjd
         LEFT JOIN job_details jd ON jd.id = jjd.job_detail_id
         WHERE jjd.job_id = $1`,
        [id]
      );

      // Check daily_work_log_entries
      const dailyWorkLogsResult = await pool.query(
        `SELECT COUNT(*) as count FROM daily_work_log_entries WHERE job_id = $1`,
        [id]
      );

      // Check monthly_work_log_entries
      const monthlyWorkLogsResult = await pool.query(
        `SELECT COUNT(*) as count FROM monthly_work_log_entries WHERE job_id = $1`,
        [id]
      );

      const payCodes = payCodesResult.rows;
      const locationMappings = locationMappingsResult.rows;
      const jobDetails = jobDetailsResult.rows;
      const dailyWorkLogCount = parseInt(dailyWorkLogsResult.rows[0].count);
      const monthlyWorkLogCount = parseInt(monthlyWorkLogsResult.rows[0].count);

      const hasDependencies =
        payCodes.length > 0 ||
        locationMappings.length > 0 ||
        staffs.length > 0 ||
        jobDetails.length > 0 ||
        dailyWorkLogCount > 0 ||
        monthlyWorkLogCount > 0;

      res.json({
        hasDependencies,
        payCodes,
        locationMappings,
        staffs,
        jobDetails,
        dailyWorkLogCount,
        monthlyWorkLogCount,
      });
    } catch (error) {
      console.error("Error checking job dependencies:", error);
      res.status(500).json({
        message: "Error checking dependencies",
        error: error.message,
      });
    }
  });

  // Delete job and its details
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      await pool.query("BEGIN");

      // Delete the job
      const deleteJobQuery = "DELETE FROM jobs WHERE id = $1";
      await pool.query(deleteJobQuery, [id]);

      await pool.query("COMMIT");

      // Invalidate cache
      cache.invalidate(CACHE_KEYS.JOBS);

      res
        .status(200)
        .json({ message: "Job deleted successfully" });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error deleting job:", error);
      res
        .status(500)
        .json({ message: "Error deleting job", error: error.message });
    }
  });

  // Update job
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { name } = req.body; // Only allow name to be updated, remove section and newId

    try {
      // Check if the job exists
      const existingJobQuery = "SELECT * FROM jobs WHERE id = $1";
      const existingJobResult = await pool.query(existingJobQuery, [id]);

      if (existingJobResult.rows.length === 0) {
        return res.status(404).json({ message: "Job not found" });
      }

      const existingJob = existingJobResult.rows[0];

      // Only check for duplicate name if the name is being changed
      if (name !== existingJob.name) {
        const isDuplicateName = await checkDuplicateJobName(name, id);
        if (isDuplicateName) {
          return res
            .status(400)
            .json({ message: "A job with this name already exists" });
        }
      }

      // Update job name only (not id or section)
      const query = `
      UPDATE jobs
      SET name = $1
      WHERE id = $2
      RETURNING *
    `;
      const values = [name, id];

      const result = await pool.query(query, values);

      // Invalidate cache
      cache.invalidate(CACHE_KEYS.JOBS);

      res.json({ message: "Job updated successfully", job: result.rows[0] });
    } catch (error) {
      console.error("Error updating job:", error);
      res
        .status(500)
        .json({ message: "Error updating job", error: error.message });
    }
  });

  // Get job pay codes count
  router.get("/:jobId/details/count", async (req, res) => {
    const { jobId } = req.params;

    try {
      const query = `
      SELECT COUNT(*) 
      FROM job_pay_codes
      WHERE job_id = $1
    `;
      const result = await pool.query(query, [jobId]);
      res.json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
      console.error("Error counting job pay codes:", error);
      res
        .status(500)
        .json({
          message: "Error counting job pay codes",
          error: error.message,
        });
    }
  });

  return router;
}
