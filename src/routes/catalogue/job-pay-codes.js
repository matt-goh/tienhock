// src/routes/catalogue/job-pay-codes.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get pay codes for a specific job
  router.get("/job/:jobId", async (req, res) => {
    const { jobId } = req.params;
    try {
      const query = `
        SELECT jpc.*, pc.code, pc.description, pc.pay_type, pc.rate_unit, 
               pc.rate_biasa, pc.rate_ahad, pc.rate_umum, pc.is_active, pc.requires_units_input
        FROM job_pay_codes jpc
        JOIN pay_codes pc ON jpc.pay_code_id = pc.id
        WHERE jpc.job_id = $1
      `;
      const result = await pool.query(query, [jobId]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching job pay codes:", error);
      res.status(500).json({
        message: "Error fetching job pay codes",
        error: error.message,
      });
    }
  });

  // Get jobs for a specific pay code
  router.get("/paycode/:payCodeId", async (req, res) => {
    const { payCodeId } = req.params;
    try {
      const query = `
        SELECT jpc.*, j.name as job_name
        FROM job_pay_codes jpc
        JOIN jobs j ON jpc.job_id = j.id
        WHERE jpc.pay_code_id = $1
      `;
      const result = await pool.query(query, [payCodeId]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching jobs for pay code:", error);
      res.status(500).json({
        message: "Error fetching jobs for pay code",
        error: error.message,
      });
    }
  });

  // Add pay code to job
  router.post("/", async (req, res) => {
    const { job_id, pay_code_id, is_default = false } = req.body;

    try {
      // Check if the association already exists
      const checkQuery =
        "SELECT * FROM job_pay_codes WHERE job_id = $1 AND pay_code_id = $2";
      const checkResult = await pool.query(checkQuery, [job_id, pay_code_id]);

      if (checkResult.rows.length > 0) {
        return res.status(400).json({
          message: "This pay code is already assigned to the job",
        });
      }

      const query = `
        INSERT INTO job_pay_codes (job_id, pay_code_id, is_default)
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const result = await pool.query(query, [job_id, pay_code_id, is_default]);
      res.status(201).json({
        message: "Pay code assigned to job successfully",
        jobPayCode: result.rows[0],
      });
    } catch (error) {
      console.error("Error assigning pay code to job:", error);
      res.status(500).json({
        message: "Error assigning pay code to job",
        error: error.message,
      });
    }
  });

  // Remove pay code from job
  router.delete("/:jobId/:payCodeId", async (req, res) => {
    const { jobId, payCodeId } = req.params;

    try {
      const query = `
        DELETE FROM job_pay_codes 
        WHERE job_id = $1 AND pay_code_id = $2
        RETURNING *
      `;

      const result = await pool.query(query, [jobId, payCodeId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Association not found" });
      }

      res.json({
        message: "Pay code removed from job successfully",
        removed: result.rows[0],
      });
    } catch (error) {
      console.error("Error removing pay code from job:", error);
      res.status(500).json({
        message: "Error removing pay code from job",
        error: error.message,
      });
    }
  });

  return router;
}
