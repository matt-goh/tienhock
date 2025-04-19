// src/routes/jobs.js
import { Router } from "express";

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
      const query = "SELECT * FROM jobs";
      const result = await pool.query(query);

      const jobs = result.rows.map((job) => ({
        ...job,
        section: job.section ? job.section.split(", ") : [],
      }));

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

  // Delete job and its details
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      await pool.query("BEGIN");

      // Delete associated records in the jobs_job_details table
      await pool.query("DELETE FROM jobs_job_details WHERE job_id = $1", [id]);

      // Delete the job
      const deleteJobQuery = "DELETE FROM jobs WHERE id = $1";
      await pool.query(deleteJobQuery, [id]);

      await pool.query("COMMIT");
      res
        .status(200)
        .json({ message: "Job and associated details deleted successfully" });
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

      res.json({ message: "Job updated successfully", job: result.rows[0] });
    } catch (error) {
      console.error("Error updating job:", error);
      res
        .status(500)
        .json({ message: "Error updating job", error: error.message });
    }
  });

  // Get all job details for a specific job
  router.get("/:jobId/details", async (req, res) => {
    const { jobId } = req.params;

    try {
      const query = `
        SELECT jd.* 
        FROM job_details jd
        JOIN jobs_job_details jjd ON jd.id = jjd.job_detail_id
        WHERE jjd.job_id = $1
      `;
      const result = await pool.query(query, [jobId]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching job details for job:", error);
      res
        .status(500)
        .json({ message: "Error fetching job details", error: error.message });
    }
  });

  // Get job details count
  router.get("/:jobId/details/count", async (req, res) => {
    const { jobId } = req.params;

    try {
      const query = `
        SELECT COUNT(*) 
        FROM jobs_job_details
        WHERE job_id = $1
      `;
      const result = await pool.query(query, [jobId]);
      res.json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
      console.error("Error counting job details:", error);
      res
        .status(500)
        .json({ message: "Error counting job details", error: error.message });
    }
  });

  return router;
}
