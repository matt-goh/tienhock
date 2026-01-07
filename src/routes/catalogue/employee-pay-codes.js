// src/routes/catalogue/employee-pay-codes.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all pay codes and employee-pay code mappings
  router.get("/all-mappings", async (req, res) => {
    try {
      // Get all pay codes
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

      // Get all employee-pay code mappings WITH FULL DETAILS
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
          epc.employee_id,
          epc.pay_code_id,
          epc.is_default AS is_default_setting,
          CAST(epc.override_rate_biasa AS NUMERIC(10, 2)) AS override_rate_biasa,
          CAST(epc.override_rate_ahad AS NUMERIC(10, 2)) AS override_rate_ahad,
          CAST(epc.override_rate_umum AS NUMERIC(10, 2)) AS override_rate_umum
        FROM employee_pay_codes epc
        JOIN pay_codes pc ON epc.pay_code_id = pc.id
        ORDER BY epc.employee_id, pc.id
      `;
      const mappingResult = await pool.query(mappingQuery);

      // Process the detailed mappings into employee-based structure
      const detailedMappings = {};

      mappingResult.rows.forEach((row) => {
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

        if (!detailedMappings[row.employee_id]) {
          detailedMappings[row.employee_id] = [];
        }
        detailedMappings[row.employee_id].push(parsedRow);
      });

      res.json({
        detailedMappings: detailedMappings,
        payCodes: allPayCodes,
      });
    } catch (error) {
      console.error("Error fetching employee pay code mapping data:", error);
      res.status(500).json({
        message: "Error fetching employee pay code mapping data",
        error: error.message,
      });
    }
  });

  // Get pay codes for a specific employee
  router.get("/employee/:employeeId", async (req, res) => {
    const { employeeId } = req.params;
    if (!employeeId) {
      return res.status(400).json({ message: "Employee ID is required" });
    }
    try {
      const query = `
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
          epc.employee_id,
          epc.pay_code_id,
          epc.is_default AS is_default_setting,
          CAST(epc.override_rate_biasa AS NUMERIC(10, 2)) AS override_rate_biasa,
          CAST(epc.override_rate_ahad AS NUMERIC(10, 2)) AS override_rate_ahad,
          CAST(epc.override_rate_umum AS NUMERIC(10, 2)) AS override_rate_umum
        FROM employee_pay_codes epc
        JOIN pay_codes pc ON epc.pay_code_id = pc.id
        WHERE epc.employee_id = $1
        ORDER BY pc.id
      `;
      const result = await pool.query(query, [employeeId]);

      // Parse numeric values
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
      console.error("Error fetching employee pay code details:", error);
      res.status(500).json({
        message: "Error fetching employee pay code details",
        error: error.message,
      });
    }
  });

  // Batch insert multiple employee-pay code associations
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
        const { employee_id, pay_code_id } = entry;
        if (!employee_id || !pay_code_id) {
          return res.status(400).json({
            message: "All entries must have employee_id and pay_code_id",
            invalid_entry: entry,
          });
        }
      }

      const results = [];
      const errors = [];
      let successCount = 0;
      const affectedEmployees = new Set();
      const affectedPayCodes = new Set();

      await pool.query("BEGIN");

      for (const entry of associations) {
        const { employee_id, pay_code_id, is_default = true } = entry;

        try {
          // Check if the association already exists
          const checkQuery =
            "SELECT 1 FROM employee_pay_codes WHERE employee_id = $1 AND pay_code_id = $2";
          const checkResult = await pool.query(checkQuery, [
            employee_id,
            pay_code_id,
          ]);

          if (checkResult.rows.length > 0) {
            errors.push({
              employee_id,
              pay_code_id,
              message: "Association already exists",
            });
            continue;
          }

          // Insert with default NULL overrides
          const insertQuery = `
            INSERT INTO employee_pay_codes (employee_id, pay_code_id, is_default, override_rate_biasa, override_rate_ahad, override_rate_umum)
            VALUES ($1, $2, $3, NULL, NULL, NULL)
            RETURNING *
          `;
          const result = await pool.query(insertQuery, [
            employee_id,
            pay_code_id,
            is_default,
          ]);
          results.push(result.rows[0]);
          successCount++;

          affectedEmployees.add(employee_id);
          affectedPayCodes.add(pay_code_id);
        } catch (error) {
          errors.push({
            employee_id,
            pay_code_id,
            message:
              error.code === "23503"
                ? "Invalid employee_id or pay_code_id"
                : error.message,
          });
        }
      }

      if (successCount > 0) {
        // Update timestamps for all affected employees
        for (const employeeId of affectedEmployees) {
          const updateStaffQuery = `
            UPDATE staffs
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `;
          await pool.query(updateStaffQuery, [employeeId]);
        }

        // Update pay code timestamps
        if (affectedPayCodes.size > 0) {
          const updatePayCodeQuery = `
            UPDATE pay_codes
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ANY($1::text[])
          `;
          await pool.query(updatePayCodeQuery, [Array.from(affectedPayCodes)]);
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

  // Batch delete multiple employee-pay code associations
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
        const { employee_id, pay_code_id } = item;
        if (!employee_id || !pay_code_id) {
          return res.status(400).json({
            message: "All items must have employee_id and pay_code_id",
            invalid_item: item,
          });
        }
      }

      await pool.query("BEGIN");

      const results = [];
      const errors = [];
      let successCount = 0;
      const affectedEmployees = new Set();
      const affectedPayCodes = new Set();

      for (const item of items) {
        const { employee_id, pay_code_id } = item;

        try {
          const query = `
            DELETE FROM employee_pay_codes
            WHERE employee_id = $1 AND pay_code_id = $2
            RETURNING employee_id, pay_code_id
          `;
          const result = await pool.query(query, [employee_id, pay_code_id]);

          if (result.rows.length > 0) {
            results.push(result.rows[0]);
            successCount++;
            affectedEmployees.add(employee_id);
            affectedPayCodes.add(pay_code_id);
          } else {
            errors.push({
              employee_id,
              pay_code_id,
              message: "Association not found",
            });
          }
        } catch (error) {
          errors.push({
            employee_id,
            pay_code_id,
            message: error.message,
          });
        }
      }

      if (successCount > 0) {
        // Update timestamps for all affected employees
        for (const employeeId of affectedEmployees) {
          const updateStaffQuery = `
            UPDATE staffs
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `;
          await pool.query(updateStaffQuery, [employeeId]);
        }

        // Update pay code timestamps
        if (affectedPayCodes.size > 0) {
          const updatePayCodeQuery = `
            UPDATE pay_codes
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ANY($1::text[])
          `;
          await pool.query(updatePayCodeQuery, [Array.from(affectedPayCodes)]);
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

  // Add a pay code association to an employee
  router.post("/", async (req, res) => {
    const { employee_id, pay_code_id, is_default = false } = req.body;

    if (!employee_id || !pay_code_id) {
      return res
        .status(400)
        .json({ message: "employee_id and pay_code_id are required" });
    }

    try {
      // Begin transaction
      await pool.query("BEGIN");

      // Check if the association already exists
      const checkQuery =
        "SELECT 1 FROM employee_pay_codes WHERE employee_id = $1 AND pay_code_id = $2";
      const checkResult = await pool.query(checkQuery, [
        employee_id,
        pay_code_id,
      ]);
      if (checkResult.rows.length > 0) {
        await pool.query("ROLLBACK");
        return res.status(409).json({
          message: "This pay code is already assigned to the employee",
        });
      }

      // Insert with default NULL overrides
      const insertQuery = `
        INSERT INTO employee_pay_codes (employee_id, pay_code_id, is_default, override_rate_biasa, override_rate_ahad, override_rate_umum)
        VALUES ($1, $2, $3, NULL, NULL, NULL)
        RETURNING *
      `;
      const result = await pool.query(insertQuery, [
        employee_id,
        pay_code_id,
        is_default,
      ]);

      // Update the staff's updated_at timestamp
      const updateStaffQuery = `
        UPDATE staffs 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `;
      await pool.query(updateStaffQuery, [employee_id]);

      // Update pay code's updated_at timestamp
      const updatePayCodeQuery = `
        UPDATE pay_codes 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `;
      await pool.query(updatePayCodeQuery, [pay_code_id]);

      // Commit transaction
      await pool.query("COMMIT");

      res.status(201).json({
        message: "Pay code assigned to employee successfully",
        employeePayCode: result.rows[0],
      });
    } catch (error) {
      console.error("Error assigning pay code to employee:", error);
      if (error.code === "23503") {
        return res
          .status(404)
          .json({ message: "Invalid employee_id or pay_code_id provided" });
      }
      res.status(500).json({
        message: "Error assigning pay code to employee",
        error: error.message,
      });
    }
  });

  // Update override rates for a specific employee-pay code association
  router.put("/:employeeId/:payCodeId", async (req, res) => {
    const { employeeId, payCodeId } = req.params;
    const {
      override_rate_biasa,
      override_rate_ahad,
      override_rate_umum,
      is_default,
    } = req.body;

    if (!employeeId || !payCodeId) {
      return res.status(400).json({
        message: "Employee ID and Pay Code ID are required in URL",
      });
    }

    const fieldsToUpdate = [];
    const values = [];
    let valueIndex = 1;

    const addUpdateField = (fieldName, value) => {
      if (value !== undefined) {
        const parsedValue =
          value === null || value === "" ? null : parseFloat(value);
        if (parsedValue !== null && (isNaN(parsedValue) || parsedValue < 0)) {
          throw new Error(
            `Invalid value provided for ${fieldName}. Must be null or a non-negative number.`
          );
        }
        fieldsToUpdate.push(`${fieldName} = $${valueIndex++}`);
        values.push(parsedValue);
      }
    };

    const addBooleanField = (fieldName, value) => {
      if (value !== undefined) {
        fieldsToUpdate.push(`${fieldName} = $${valueIndex++}`);
        values.push(!!value);
      }
    };

    try {
      addUpdateField("override_rate_biasa", override_rate_biasa);
      addUpdateField("override_rate_ahad", override_rate_ahad);
      addUpdateField("override_rate_umum", override_rate_umum);
      addBooleanField("is_default", is_default);
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }

    if (fieldsToUpdate.length === 0) {
      return res
        .status(400)
        .json({ message: "No update fields provided in the request body" });
    }

    values.push(employeeId);
    values.push(payCodeId);

    try {
      // Begin transaction
      await pool.query("BEGIN");

      const query = `
      UPDATE employee_pay_codes
      SET ${fieldsToUpdate.join(", ")}
      WHERE employee_id = $${valueIndex++} AND pay_code_id = $${valueIndex++}
      RETURNING *
    `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res
          .status(404)
          .json({ message: "Employee-PayCode association not found" });
      }

      // Update the staff's updated_at timestamp
      const updateStaffQuery = `
    UPDATE staffs 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = $1
  `;
      await pool.query(updateStaffQuery, [employeeId]);

      // Update pay code's updated_at timestamp
      const updatePayCodeQuery = `
        UPDATE pay_codes 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `;
      await pool.query(updatePayCodeQuery, [payCodeId]);

      // Commit transaction
      await pool.query("COMMIT");

      res.json({
        message: "Settings updated successfully",
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error updating employee-pay code settings:", error);
      res.status(500).json({
        message: "Error updating employee-pay code settings",
        error: error.message,
      });
    }
  });

  // Batch update is_default for multiple employee-pay code associations
  // Supports two modes:
  // 1. By employee: { employee_id, pay_code_ids, is_default } - update multiple pay codes for one employee
  // 2. By pay code: { pay_code_id, employee_ids, is_default } - update multiple employees for one pay code
  router.put("/batch-default", async (req, res) => {
    const { employee_id, pay_code_ids, pay_code_id, employee_ids, is_default } = req.body;

    if (typeof is_default !== "boolean") {
      return res.status(400).json({ message: "is_default must be a boolean value" });
    }

    // Mode 1: By employee (employee_id + pay_code_ids)
    const isByEmployee = employee_id && Array.isArray(pay_code_ids) && pay_code_ids.length > 0;
    // Mode 2: By pay code (pay_code_id + employee_ids)
    const isByPayCode = pay_code_id && Array.isArray(employee_ids) && employee_ids.length > 0;

    if (!isByEmployee && !isByPayCode) {
      return res.status(400).json({
        message: "Must provide either (employee_id + pay_code_ids) or (pay_code_id + employee_ids)",
      });
    }

    try {
      await pool.query("BEGIN");

      let result;
      let affectedEmployeeIds = [];
      let affectedPayCodeIds = [];

      if (isByEmployee) {
        // Mode 1: Update multiple pay codes for one employee
        const updateQuery = `
          UPDATE employee_pay_codes
          SET is_default = $1
          WHERE employee_id = $2 AND pay_code_id = ANY($3::text[])
          RETURNING pay_code_id
        `;
        result = await pool.query(updateQuery, [is_default, employee_id, pay_code_ids]);
        affectedEmployeeIds = [employee_id];
        affectedPayCodeIds = pay_code_ids;
      } else {
        // Mode 2: Update multiple employees for one pay code
        const updateQuery = `
          UPDATE employee_pay_codes
          SET is_default = $1
          WHERE pay_code_id = $2 AND employee_id = ANY($3::text[])
          RETURNING employee_id
        `;
        result = await pool.query(updateQuery, [is_default, pay_code_id, employee_ids]);
        affectedEmployeeIds = employee_ids;
        affectedPayCodeIds = [pay_code_id];
      }

      // Update the staff's updated_at timestamps
      if (affectedEmployeeIds.length > 0) {
        const updateStaffQuery = `
          UPDATE staffs
          SET updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::text[])
        `;
        await pool.query(updateStaffQuery, [affectedEmployeeIds]);
      }

      // Update pay codes' updated_at timestamps
      if (affectedPayCodeIds.length > 0) {
        const updatePayCodesQuery = `
          UPDATE pay_codes
          SET updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::text[])
        `;
        await pool.query(updatePayCodesQuery, [affectedPayCodeIds]);
      }

      await pool.query("COMMIT");

      res.json({
        message: `Successfully updated ${result.rowCount} association(s)`,
        updated_count: result.rowCount,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error in batch default update:", error);
      res.status(500).json({
        message: "Error processing batch default update",
        error: error.message,
      });
    }
  });

  // Remove a pay code association from an employee
  router.delete("/:employeeId/:payCodeId", async (req, res) => {
    const { employeeId, payCodeId } = req.params;

    if (!employeeId || !payCodeId) {
      return res
        .status(400)
        .json({ message: "Employee ID and Pay Code ID are required in URL" });
    }

    try {
      // Begin transaction
      await pool.query("BEGIN");

      const query = `
      DELETE FROM employee_pay_codes
      WHERE employee_id = $1 AND pay_code_id = $2
      RETURNING employee_id, pay_code_id
    `;

      const result = await pool.query(query, [employeeId, payCodeId]);

      if (result.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res
          .status(404)
          .json({ message: "Employee-PayCode association not found" });
      }

      // Update the staff's updated_at timestamp
      const updateStaffQuery = `
      UPDATE staffs 
      SET updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;
      await pool.query(updateStaffQuery, [employeeId]);

      // Update pay code's updated_at timestamp
      const updatePayCodeQuery = `
        UPDATE pay_codes 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `;
      await pool.query(updatePayCodeQuery, [payCodeId]);

      // Commit transaction
      await pool.query("COMMIT");

      res.status(200).json({
        message: "Pay code removed from employee successfully",
        removed: result.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error removing pay code from employee:", error);
      res.status(500).json({
        message: "Error removing pay code from employee",
        error: error.message,
      });
    }
  });

  return router;
}
