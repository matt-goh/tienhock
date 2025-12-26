// src/routes/accounting/ledger-types.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET / - Get all ledger types
  router.get("/", async (req, res) => {
    try {
      const { is_active } = req.query;

      let query = `
        SELECT code, name, description, is_system, is_active, created_at, updated_at
        FROM ledger_types
        WHERE 1=1
      `;
      const params = [];

      if (is_active !== undefined && is_active !== "") {
        query += ` AND is_active = $1`;
        params.push(is_active === "true" || is_active === true);
      }

      query += ` ORDER BY code`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching ledger types:", error);
      res.status(500).json({
        message: "Error fetching ledger types",
        error: error.message,
      });
    }
  });

  // GET /:code - Get single ledger type
  router.get("/:code", async (req, res) => {
    try {
      const { code } = req.params;

      const query = `
        SELECT code, name, description, is_system, is_active, created_at, updated_at
        FROM ledger_types
        WHERE code = $1
      `;

      const result = await pool.query(query, [code]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Ledger type not found" });
      }

      // Also get count of accounts using this type
      const countQuery = `
        SELECT COUNT(*) as account_count
        FROM account_codes
        WHERE ledger_type = $1
      `;
      const countResult = await pool.query(countQuery, [code]);

      res.json({
        ...result.rows[0],
        account_count: parseInt(countResult.rows[0].account_count),
      });
    } catch (error) {
      console.error("Error fetching ledger type:", error);
      res.status(500).json({
        message: "Error fetching ledger type",
        error: error.message,
      });
    }
  });

  // POST / - Create new ledger type
  router.post("/", async (req, res) => {
    const { code, name, description, is_active } = req.body;

    // Validation
    if (!code || !name) {
      return res.status(400).json({
        message: "Code and name are required",
      });
    }

    try {
      // Check if code already exists
      const checkQuery = "SELECT 1 FROM ledger_types WHERE code = $1";
      const checkResult = await pool.query(checkQuery, [code.toUpperCase()]);

      if (checkResult.rows.length > 0) {
        return res.status(409).json({
          message: `Ledger type '${code}' already exists`,
        });
      }

      const insertQuery = `
        INSERT INTO ledger_types (code, name, description, is_system, is_active)
        VALUES ($1, $2, $3, FALSE, $4)
        RETURNING *
      `;

      const values = [
        code.toUpperCase().trim(),
        name.trim(),
        description || null,
        is_active !== false,
      ];

      const result = await pool.query(insertQuery, values);

      res.status(201).json({
        message: "Ledger type created successfully",
        ledgerType: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating ledger type:", error);
      res.status(500).json({
        message: "Error creating ledger type",
        error: error.message,
      });
    }
  });

  // PUT /:code - Update ledger type
  router.put("/:code", async (req, res) => {
    const { code } = req.params;
    const { name, description, is_active } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Name is required",
      });
    }

    try {
      // Check if ledger type exists
      const checkQuery =
        "SELECT is_system FROM ledger_types WHERE code = $1";
      const checkResult = await pool.query(checkQuery, [code]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          message: `Ledger type '${code}' not found`,
        });
      }

      // System ledger types can only have name/description updated, not deactivated
      const isSystem = checkResult.rows[0].is_system;

      const updateQuery = `
        UPDATE ledger_types
        SET
          name = $1,
          description = $2,
          is_active = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE code = $4
        RETURNING *
      `;

      const values = [
        name.trim(),
        description || null,
        isSystem ? true : is_active !== false, // System types stay active
        code,
      ];

      const result = await pool.query(updateQuery, values);

      res.json({
        message: "Ledger type updated successfully",
        ledgerType: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating ledger type:", error);
      res.status(500).json({
        message: "Error updating ledger type",
        error: error.message,
      });
    }
  });

  // DELETE /:code - Delete ledger type
  router.delete("/:code", async (req, res) => {
    const { code } = req.params;

    try {
      // Check if ledger type exists and is not system
      const checkQuery =
        "SELECT is_system FROM ledger_types WHERE code = $1";
      const checkResult = await pool.query(checkQuery, [code]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          message: `Ledger type '${code}' not found`,
        });
      }

      if (checkResult.rows[0].is_system) {
        return res.status(400).json({
          message: "Cannot delete system ledger type",
        });
      }

      // Check if ledger type is used by any account
      const usageQuery =
        "SELECT COUNT(*) as count FROM account_codes WHERE ledger_type = $1";
      const usageResult = await pool.query(usageQuery, [code]);

      if (parseInt(usageResult.rows[0].count) > 0) {
        return res.status(400).json({
          message: `Cannot delete ledger type that is used by ${usageResult.rows[0].count} account(s). Reassign or delete those accounts first.`,
        });
      }

      // Delete the ledger type
      const deleteQuery =
        "DELETE FROM ledger_types WHERE code = $1 RETURNING code";
      const result = await pool.query(deleteQuery, [code]);

      res.json({
        message: "Ledger type deleted successfully",
        code: result.rows[0].code,
      });
    } catch (error) {
      console.error("Error deleting ledger type:", error);
      res.status(500).json({
        message: "Error deleting ledger type",
        error: error.message,
      });
    }
  });

  return router;
}
