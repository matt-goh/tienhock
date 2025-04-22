// src/routes/catalogue/job-pay-codes.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all job-pay code mappings and all pay codes for cache initialization
  router.get("/all-mappings", async (req, res) => {
    try {
      // First get all pay codes
      // Ensure rates are parsed as numbers or null appropriately if DB driver returns strings
      const payCodeQuery = `
        SELECT
          id, code, description, pay_type, rate_unit,
          CAST(rate_biasa AS NUMERIC(10, 2)) as rate_biasa,
          CAST(rate_ahad AS NUMERIC(10, 2)) as rate_ahad,
          CAST(rate_umum AS NUMERIC(10, 2)) as rate_umum,
          is_active, requires_units_input
        FROM pay_codes ORDER BY code
      `;
      const payCodeResult = await pool.query(payCodeQuery);
      // Ensure nulls are preserved if casting fails or original is null (DB driver might handle this)
      const allPayCodes = payCodeResult.rows.map((pc) => ({
        ...pc,
        rate_biasa: pc.rate_biasa === null ? null : parseFloat(pc.rate_biasa),
        rate_ahad: pc.rate_ahad === null ? null : parseFloat(pc.rate_ahad),
        rate_umum: pc.rate_umum === null ? null : parseFloat(pc.rate_umum),
      }));

      // Then get all job-pay code mappings (just IDs for the map)
      const mappingQuery = `
        SELECT jpc.job_id, jpc.pay_code_id
        FROM job_pay_codes jpc
      `;
      const mappingResult = await pool.query(mappingQuery);

      // Create a map of job IDs to pay code IDs
      const mappings = {};
      mappingResult.rows.forEach((row) => {
        if (!mappings[row.job_id]) {
          mappings[row.job_id] = [];
        }
        mappings[row.job_id].push(row.pay_code_id);
      });

      // Return both datasets
      res.json({
        mappings: mappings,
        payCodes: allPayCodes, // Return parsed pay codes
      });
    } catch (error) {
      console.error("Error fetching pay code mapping data:", error);
      res.status(500).json({
        message: "Error fetching pay code mapping data",
        error: error.message,
      });
    }
  });

  // Get detailed pay codes (including overrides) for a specific job
  router.get("/job/:jobId", async (req, res) => {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ message: "Job ID is required" });
    }
    try {
      // Join pay_codes and job_pay_codes to get defaults and overrides
      const query = `
        SELECT
          pc.id, -- Use pay_code ID as the primary identifier
          pc.code,
          pc.description,
          pc.pay_type,
          pc.rate_unit,
          CAST(pc.rate_biasa AS NUMERIC(10, 2)) AS rate_biasa, -- Default rate
          CAST(pc.rate_ahad AS NUMERIC(10, 2)) AS rate_ahad,   -- Default rate
          CAST(pc.rate_umum AS NUMERIC(10, 2)) AS rate_umum,   -- Default rate
          pc.is_active,
          pc.requires_units_input,
          jpc.job_id,
          jpc.pay_code_id, -- Can be useful for reference
          jpc.is_default AS is_default_setting,
          CAST(jpc.override_rate_biasa AS NUMERIC(10, 2)) AS override_rate_biasa,
          CAST(jpc.override_rate_ahad AS NUMERIC(10, 2)) AS override_rate_ahad,
          CAST(jpc.override_rate_umum AS NUMERIC(10, 2)) AS override_rate_umum
        FROM job_pay_codes jpc
        JOIN pay_codes pc ON jpc.pay_code_id = pc.id
        WHERE jpc.job_id = $1
        ORDER BY pc.code -- Consistent ordering
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

  // Add a pay code association to a job (without setting overrides initially)
  router.post("/", async (req, res) => {
    const { job_id, pay_code_id, is_default = false } = req.body;

    if (!job_id || !pay_code_id) {
      return res
        .status(400)
        .json({ message: "job_id and pay_code_id are required" });
    }

    try {
      // Check if the association already exists
      const checkQuery =
        "SELECT 1 FROM job_pay_codes WHERE job_id = $1 AND pay_code_id = $2";
      const checkResult = await pool.query(checkQuery, [job_id, pay_code_id]);
      if (checkResult.rows.length > 0) {
        return res
          .status(409)
          .json({ message: "This pay code is already assigned to the job" }); // 409 Conflict
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
      res
        .status(201)
        .json({
          message: "Pay code assigned to job successfully",
          jobPayCode: result.rows[0],
        });
    } catch (error) {
      console.error("Error assigning pay code to job:", error);
      // Check for specific DB errors like foreign key violations
      if (error.code === "23503") {
        // PostgreSQL foreign key violation code
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

  // Update override rates for a specific job-pay code association
  router.put("/:jobId/:payCodeId", async (req, res) => {
    const { jobId, payCodeId } = req.params;
    // Extract potential override fields from the request body
    const { override_rate_biasa, override_rate_ahad, override_rate_umum } =
      req.body;

    if (!jobId || !payCodeId) {
      return res
        .status(400)
        .json({ message: "Job ID and Pay Code ID are required in URL" });
    }

    const fieldsToUpdate = [];
    const values = [];
    let valueIndex = 1; // Parameter index for the SQL query

    // Helper to validate and add fields
    const addUpdateField = (fieldName, value) => {
      if (value !== undefined) {
        // Check if the key exists in the body
        // Allow null to clear the override, otherwise validate it's a non-negative number
        const parsedValue =
          value === null || value === "" ? null : parseFloat(value);
        if (parsedValue !== null && (isNaN(parsedValue) || parsedValue < 0)) {
          // Return an error immediately if validation fails for this field
          throw new Error(
            `Invalid value provided for ${fieldName}. Must be null or a non-negative number.`
          );
        }
        fieldsToUpdate.push(`${fieldName} = $${valueIndex++}`);
        values.push(parsedValue); // Add null or the parsed number to values array
      }
    };

    try {
      // Validate and add each field present in the request body
      addUpdateField("override_rate_biasa", override_rate_biasa);
      addUpdateField("override_rate_ahad", override_rate_ahad);
      addUpdateField("override_rate_umum", override_rate_umum);

      // Add more fields here if needed (e.g., is_default_setting)
      // if (req.body.is_default_setting !== undefined) {
      //     fieldsToUpdate.push(`is_default = $${valueIndex++}`);
      //     values.push(!!req.body.is_default_setting); // Ensure boolean
      // }
    } catch (validationError) {
      // Catch validation errors from addUpdateField
      return res.status(400).json({ message: validationError.message });
    }

    if (fieldsToUpdate.length === 0) {
      // Nothing to update, maybe return 200 OK or 304 Not Modified? Or 400 Bad Request?
      // Let's return 400 for now, indicating nothing was provided to update.
      return res
        .status(400)
        .json({ message: "No update fields provided in the request body" });
    }

    // Add the WHERE clause parameters
    values.push(jobId);
    values.push(payCodeId);

    try {
      const query = `
        UPDATE job_pay_codes
        SET ${fieldsToUpdate.join(", ")}
        WHERE job_id = $${valueIndex++} AND pay_code_id = $${valueIndex++}
        RETURNING *
      `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "Job-PayCode association not found" });
      }

      // Return the updated record (ensure numbers are numbers)
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
      };

      res.json({
        message: "Override rates updated successfully",
        updated: updatedRecord,
      });
    } catch (error) {
      console.error("Error updating override rates:", error);
      res
        .status(500)
        .json({
          message: "Error updating override rates",
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
      const query = `
        DELETE FROM job_pay_codes
        WHERE job_id = $1 AND pay_code_id = $2
        RETURNING *
      `;

      const result = await pool.query(query, [jobId, payCodeId]);

      if (result.rows.length === 0) {
        // It wasn't found, which might be okay depending on idempotency requirements
        // Let's return 404 for clarity that it didn't exist to be deleted
        return res
          .status(404)
          .json({ message: "Job-PayCode association not found" });
      }

      res.status(200).json({
        // 200 OK or 204 No Content are appropriate here
        message: "Pay code removed from job successfully",
        removed: result.rows[0], // Optionally return the deleted record
      });
    } catch (error) {
      console.error("Error removing pay code from job:", error);
      res.status(500).json({
        message: "Error removing pay code from job",
        error: error.message,
      });
    }
  });

  // Note: Endpoint GET /paycode/:payCodeId (Get jobs for a specific pay code)
  // was present in original context but not modified here as per request.
  // If needed, it should also be reviewed.

  return router;
}
