// src/routes/catalogue/job-pay-codes.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  router.get("/all-mappings", async (req, res) => {
    try {
      // Get all pay codes (excluding 'code')
      const payCodeQuery = `
      SELECT
        id, description, pay_type, rate_unit,
        CAST(rate_biasa AS NUMERIC(10, 2)) as rate_biasa,
        CAST(rate_ahad AS NUMERIC(10, 2)) as rate_ahad,
        CAST(rate_umum AS NUMERIC(10, 2)) as rate_umum,
        is_active, requires_units_input, created_at, updated_at
      FROM pay_codes ORDER BY updated_at DESC, created_at DESC
    `;
      const payCodeResult = await pool.query(payCodeQuery);
      const allPayCodes = payCodeResult.rows.map((pc) => ({
        ...pc,
        rate_biasa: pc.rate_biasa === null ? null : parseFloat(pc.rate_biasa),
        rate_ahad: pc.rate_ahad === null ? null : parseFloat(pc.rate_ahad),
        rate_umum: pc.rate_umum === null ? null : parseFloat(pc.rate_umum),
      }));

      // Get all job-pay code mappings WITH FULL DETAILS
      const mappingQuery = `
        SELECT
          pc.id,
          pc.description,
          pc.pay_type,
          pc.rate_unit,
          CAST(pc.rate_biasa AS NUMERIC(10, 2)) AS rate_biasa,
          CAST(pc.rate_ahad AS NUMERIC(10, 2)) AS rate_ahad,
          CAST(pc.rate_umum AS NUMERIC(10, 2)) AS rate_umum,
          pc.is_active,
          pc.requires_units_input,
          jpc.job_id,
          jpc.pay_code_id,
          jpc.is_default AS is_default_setting,
          CAST(jpc.override_rate_biasa AS NUMERIC(10, 2)) AS override_rate_biasa,
          CAST(jpc.override_rate_ahad AS NUMERIC(10, 2)) AS override_rate_ahad,
          CAST(jpc.override_rate_umum AS NUMERIC(10, 2)) AS override_rate_umum
        FROM job_pay_codes jpc
        JOIN pay_codes pc ON jpc.pay_code_id = pc.id
        ORDER BY jpc.job_id, pc.id
      `;
      const mappingResult = await pool.query(mappingQuery);

      // Process the detailed mappings into job-based structure
      const detailedMappings = {};

      mappingResult.rows.forEach((row) => {
        // Parse numeric values
        const parsedRow = {
          ...row,
          rate_biasa:
            row.rate_biasa === null ? null : parseFloat(row.rate_biasa),
          rate_ahad: row.rate_ahad === null ? null : parseFloat(row.rate_ahad),
          rate_umum: row.rate_umum === null ? null : parseFloat(row.rate_umum),
          override_rate_biasa:
            row.override_rate_biasa === null
              ? null
              : parseFloat(row.override_rate_biasa),
          override_rate_ahad:
            row.override_rate_ahad === null
              ? null
              : parseFloat(row.override_rate_ahad),
          override_rate_umum:
            row.override_rate_umum === null
              ? null
              : parseFloat(row.override_rate_umum),
        };

        // Create detailed mappings
        if (!detailedMappings[row.job_id]) {
          detailedMappings[row.job_id] = [];
        }
        detailedMappings[row.job_id].push(parsedRow);
      });

      res.json({
        detailedMappings: detailedMappings,
        payCodes: allPayCodes,
      });
    } catch (error) {
      console.error("Error fetching pay code mapping data:", error);
      res.status(500).json({
        message: "Error fetching pay code mapping data",
        error: error.message,
      });
    }
  });

  // Get detailed pay codes (excluding 'code', including overrides) for a specific job
  router.get("/job/:jobId", async (req, res) => {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ message: "Job ID is required" });
    }
    try {
      // Join pay_codes and job_pay_codes to get defaults and overrides (exclude pc.code)
      const query = `
        SELECT
          pc.id, -- Use pay_code ID as the primary identifier
          pc.description,
          pc.pay_type,
          pc.rate_unit,
          CAST(pc.rate_biasa AS NUMERIC(10, 2)) AS rate_biasa, -- Default rate
          CAST(pc.rate_ahad AS NUMERIC(10, 2)) AS rate_ahad,   -- Default rate
          CAST(pc.rate_umum AS NUMERIC(10, 2)) AS rate_umum,   -- Default rate
          pc.is_active,
          pc.requires_units_input,
          jpc.job_id,
          jpc.pay_code_id, -- Can be useful for reference, same as pc.id
          jpc.is_default AS is_default_setting,
          CAST(jpc.override_rate_biasa AS NUMERIC(10, 2)) AS override_rate_biasa,
          CAST(jpc.override_rate_ahad AS NUMERIC(10, 2)) AS override_rate_ahad,
          CAST(jpc.override_rate_umum AS NUMERIC(10, 2)) AS override_rate_umum
        FROM job_pay_codes jpc
        JOIN pay_codes pc ON jpc.pay_code_id = pc.id
        WHERE jpc.job_id = $1
        ORDER BY pc.id -- Consistent ordering (or description)
      `;
      const result = await pool.query(query, [jobId]);

      // Ensure correct types are returned (parseFloat handles potential strings)
      const details = result.rows.map((row) => ({
        ...row,
        rate_biasa: row.rate_biasa === null ? null : parseFloat(row.rate_biasa),
        rate_ahad: row.rate_ahad === null ? null : parseFloat(row.rate_ahad),
        rate_umum: row.rate_umum === null ? null : parseFloat(row.rate_umum),
        override_rate_biasa:
          row.override_rate_biasa === null
            ? null
            : parseFloat(row.override_rate_biasa),
        override_rate_ahad:
          row.override_rate_ahad === null
            ? null
            : parseFloat(row.override_rate_ahad),
        override_rate_umum:
          row.override_rate_umum === null
            ? null
            : parseFloat(row.override_rate_umum),
      }));

      res.json(details);
    } catch (error) {
      console.error("Error fetching job pay code details:", error);
      res.status(500).json({
        message: "Error fetching job pay code details",
        error: error.message,
      });
    }
  });

  // Add a pay code association to a job
  router.post("/", async (req, res) => {
    const { job_id, pay_code_id, is_default = false } = req.body;

    if (!job_id || !pay_code_id) {
      return res
        .status(400)
        .json({ message: "job_id and pay_code_id are required" });
    }

    try {
      // Begin transaction
      await pool.query("BEGIN");

      // Check if the association already exists
      const checkQuery =
        "SELECT 1 FROM job_pay_codes WHERE job_id = $1 AND pay_code_id = $2";
      const checkResult = await pool.query(checkQuery, [job_id, pay_code_id]);
      if (checkResult.rows.length > 0) {
        await pool.query("ROLLBACK");
        return res.status(409).json({
          message: "This pay code is already assigned to the job",
        });
      }

      // Insert with default NULL overrides
      const insertQuery = `
      INSERT INTO job_pay_codes (job_id, pay_code_id, is_default, override_rate_biasa, override_rate_ahad, override_rate_umum)
      VALUES ($1, $2, $3, NULL, NULL, NULL)
      RETURNING *
    `;
      const result = await pool.query(insertQuery, [
        job_id,
        pay_code_id,
        is_default,
      ]);

      // Update the updated_at timestamp for all staff with this job
      const updateStaffQuery = `
      UPDATE staffs 
      SET updated_at = CURRENT_TIMESTAMP 
      WHERE job::jsonb ? $1
    `;
      await pool.query(updateStaffQuery, [job_id]);

      // Commit transaction
      await pool.query("COMMIT");

      res.status(201).json({
        message: "Pay code assigned to job successfully",
        jobPayCode: result.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error assigning pay code to job:", error);
      if (error.code === "23503") {
        return res
          .status(404)
          .json({ message: "Invalid job_id or pay_code_id provided" });
      }
      res.status(500).json({
        message: "Error assigning pay code to job",
        error: error.message,
      });
    }
  });

  // Batch insert multiple pay code associations to jobs
  router.post("/batch", async (req, res) => {
    const { associations } = req.body;

    if (
      !associations ||
      !Array.isArray(associations) ||
      associations.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "An array of associations is required" });
    }

    try {
      // Validate all entries first
      for (const entry of associations) {
        const { job_id, pay_code_id } = entry;
        if (!job_id || !pay_code_id) {
          return res.status(400).json({
            message: "All entries must have job_id and pay_code_id",
            invalid_entry: entry,
          });
        }
      }

      const results = [];
      const errors = [];
      let successCount = 0;
      const affectedJobs = new Set(); // Track affected jobs for timestamp updates

      // Use a transaction for atomicity
      await pool.query("BEGIN");

      for (const entry of associations) {
        const { job_id, pay_code_id, is_default = false } = entry;

        try {
          // Check if the association already exists
          const checkQuery =
            "SELECT 1 FROM job_pay_codes WHERE job_id = $1 AND pay_code_id = $2";
          const checkResult = await pool.query(checkQuery, [
            job_id,
            pay_code_id,
          ]);

          if (checkResult.rows.length > 0) {
            errors.push({
              job_id,
              pay_code_id,
              message: "Association already exists",
            });
            continue; // Skip this one and continue with the next
          }

          // Insert with default NULL overrides
          const insertQuery = `
          INSERT INTO job_pay_codes (job_id, pay_code_id, is_default, override_rate_biasa, override_rate_ahad, override_rate_umum)
          VALUES ($1, $2, $3, NULL, NULL, NULL)
          RETURNING *
        `;
          const result = await pool.query(insertQuery, [
            job_id,
            pay_code_id,
            is_default,
          ]);
          results.push(result.rows[0]);
          successCount++;

          // Add to list of affected jobs
          affectedJobs.add(job_id);
        } catch (error) {
          // Handle individual entry errors
          errors.push({
            job_id,
            pay_code_id,
            message:
              error.code === "23503"
                ? "Invalid job_id or pay_code_id"
                : error.message,
          });
        }
      }

      if (successCount > 0) {
        // Update timestamps for all affected jobs' staff
        for (const jobId of affectedJobs) {
          // Update the updated_at timestamp for all staff with this job
          const updateStaffQuery = `
          UPDATE staffs 
          SET updated_at = CURRENT_TIMESTAMP 
          WHERE job::jsonb ? $1
        `;
          await pool.query(updateStaffQuery, [jobId]);
        }

        // Update pay code timestamps for all affected pay codes
        const uniquePayCodeIds = [...new Set(associations.map(a => a.pay_code_id))];
        if (uniquePayCodeIds.length > 0) {
          const updatePayCodeQuery = `
            UPDATE pay_codes 
            SET updated_at = CURRENT_TIMESTAMP 
            WHERE id = ANY($1)
          `;
          await pool.query(updatePayCodeQuery, [uniquePayCodeIds]);
        }

        await pool.query("COMMIT");
        return res.status(201).json({
          message: `Successfully added ${successCount} of ${associations.length} associations`,
          added: results,
          errors: errors.length > 0 ? errors : undefined,
        });
      } else {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: "Failed to add any associations",
          errors,
        });
      }
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error in batch association:", error);
      res.status(500).json({
        message: "Error processing batch association",
        error: error.message,
      });
    }
  });

  // Update override rates for a specific job-pay code association
  router.put("/:jobId/:payCodeId", async (req, res) => {
    const { jobId, payCodeId } = req.params;
    const {
      override_rate_biasa,
      override_rate_ahad,
      override_rate_umum,
      is_default,
    } = req.body;

    if (!jobId || !payCodeId) {
      return res.status(400).json({
        message: "Job ID and Pay Code ID are required in URL",
      });
    }

    const fieldsToUpdate = [];
    const values = [];
    let valueIndex = 1;

    // Helper functions - existing code remains unchanged
    const addUpdateField = (fieldName, value) => {
      if (value !== undefined) {
        // Check if the key exists in the body
        const parsedValue =
          value === null || value === "" ? null : parseFloat(value);
        if (parsedValue !== null && (isNaN(parsedValue) || parsedValue < 0)) {
          throw new Error(
            `Invalid value provided for ${fieldName}. Must be null or a non-negative number.`
          );
        }
        fieldsToUpdate.push(`${fieldName} = $${valueIndex++}`);
        values.push(parsedValue); // Add null or the parsed number to values array
      }
    };

    // Helper to add boolean fields
    const addBooleanField = (fieldName, value) => {
      if (value !== undefined) {
        fieldsToUpdate.push(`${fieldName} = $${valueIndex++}`);
        values.push(!!value); // Convert to boolean
      }
    };

    try {
      // Begin transaction
      await pool.query("BEGIN");

      // Validation logic (unchanged)
      addUpdateField("override_rate_biasa", override_rate_biasa);
      addUpdateField("override_rate_ahad", override_rate_ahad);
      addUpdateField("override_rate_umum", override_rate_umum);
      addBooleanField("is_default", is_default);

      if (fieldsToUpdate.length === 0) {
        await pool.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "No update fields provided in the request body" });
      }

      values.push(jobId);
      values.push(payCodeId);

      const query = `
      UPDATE job_pay_codes
      SET ${fieldsToUpdate.join(", ")}
      WHERE job_id = $${valueIndex++} AND pay_code_id = $${valueIndex++}
      RETURNING *
    `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res
          .status(404)
          .json({ message: "Job-PayCode association not found" });
      }

      // Update the updated_at timestamp for all staff with this job
      const updateStaffQuery = `
      UPDATE staffs 
      SET updated_at = CURRENT_TIMESTAMP 
      WHERE job::jsonb ? $1
    `;
      await pool.query(updateStaffQuery, [jobId]);

      // Commit transaction
      await pool.query("COMMIT");

      // Format response data
      const updatedRecord = {
        ...result.rows[0],
        override_rate_biasa:
          result.rows[0].override_rate_biasa === null
            ? null
            : parseFloat(result.rows[0].override_rate_biasa),
        override_rate_ahad:
          result.rows[0].override_rate_ahad === null
            ? null
            : parseFloat(result.rows[0].override_rate_ahad),
        override_rate_umum:
          result.rows[0].override_rate_umum === null
            ? null
            : parseFloat(result.rows[0].override_rate_umum),
        is_default: !!result.rows[0].is_default,
      };

      res.json({
        message: "Settings updated successfully",
        updated: updatedRecord,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error updating job-pay code settings:", error);
      res.status(500).json({
        message: "Error updating job-pay code settings",
        error: error.message,
      });
    }
  });

  // Remove a pay code association from a job
  router.delete("/:jobId/:payCodeId", async (req, res) => {
    const { jobId, payCodeId } = req.params;

    if (!jobId || !payCodeId) {
      return res
        .status(400)
        .json({ message: "Job ID and Pay Code ID are required in URL" });
    }

    try {
      // Begin transaction
      await pool.query("BEGIN");

      const query = `
      DELETE FROM job_pay_codes
      WHERE job_id = $1 AND pay_code_id = $2
      RETURNING job_id, pay_code_id
    `;

      const result = await pool.query(query, [jobId, payCodeId]);

      if (result.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res
          .status(404)
          .json({ message: "Job-PayCode association not found" });
      }

      // Update the updated_at timestamp for all staff with this job
      const updateStaffQuery = `
      UPDATE staffs 
      SET updated_at = CURRENT_TIMESTAMP 
      WHERE job::jsonb ? $1
    `;
      await pool.query(updateStaffQuery, [jobId]);

      // Commit transaction
      await pool.query("COMMIT");

      res.status(200).json({
        message: "Pay code removed from job successfully",
        removed: result.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error removing pay code from job:", error);
      res.status(500).json({
        message: "Error removing pay code from job",
        error: error.message,
      });
    }
  });

  // Batch delete multiple pay code associations
  router.post("/batch-delete", async (req, res) => {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: "An array of items to delete is required" });
    }

    try {
      // Validate all entries first
      for (const item of items) {
        const { job_id, pay_code_id } = item;
        if (!job_id || !pay_code_id) {
          return res.status(400).json({
            message: "All items must have job_id and pay_code_id",
            invalid_item: item,
          });
        }
      }

      await pool.query("BEGIN");

      const results = [];
      const errors = [];
      let successCount = 0;
      const affectedJobs = new Set(); // Track affected jobs for timestamp updates

      for (const item of items) {
        const { job_id, pay_code_id } = item;

        try {
          const query = `
          DELETE FROM job_pay_codes
          WHERE job_id = $1 AND pay_code_id = $2
          RETURNING job_id, pay_code_id
        `;
          const result = await pool.query(query, [job_id, pay_code_id]);

          if (result.rows.length > 0) {
            results.push(result.rows[0]);
            successCount++;
            affectedJobs.add(job_id);
          } else {
            errors.push({
              job_id,
              pay_code_id,
              message: "Association not found",
            });
          }
        } catch (error) {
          errors.push({
            job_id,
            pay_code_id,
            message: error.message,
          });
        }
      }

      if (successCount > 0) {
        // Update timestamps for all affected jobs' staff
        for (const jobId of affectedJobs) {
          // Update the updated_at timestamp for all staff with this job
          const updateStaffQuery = `
          UPDATE staffs 
          SET updated_at = CURRENT_TIMESTAMP 
          WHERE job::jsonb ? $1
        `;
          await pool.query(updateStaffQuery, [jobId]);
        }

        // Update pay code timestamps for all affected pay codes
        const uniquePayCodeIds = [...new Set(items.map(i => i.pay_code_id))];
        if (uniquePayCodeIds.length > 0) {
          const updatePayCodeQuery = `
            UPDATE pay_codes 
            SET updated_at = CURRENT_TIMESTAMP 
            WHERE id = ANY($1)
          `;
          await pool.query(updatePayCodeQuery, [uniquePayCodeIds]);
        }

        await pool.query("COMMIT");
        return res.status(200).json({
          message: `Successfully removed ${successCount} of ${items.length} associations`,
          removed: results,
          errors: errors.length > 0 ? errors : undefined,
        });
      } else {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: "Failed to remove any associations",
          errors,
        });
      }
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error in batch deletion:", error);
      res.status(500).json({
        message: "Error processing batch deletion",
        error: error.message,
      });
    }
  });

  return router;
}
