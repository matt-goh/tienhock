// src/routes/accounting/account-codes.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // ==================== ACCOUNT CODES ====================

  // GET / - Get all account codes with optional filters
  router.get("/", async (req, res) => {
    try {
      const { search, ledger_type, is_active, parent_code, flat } = req.query;

      let query = `
        SELECT
          id, code, description, ledger_type, parent_code,
          level, sort_order, is_active, is_system, notes,
          created_at, updated_at
        FROM account_codes
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      // Apply filters
      if (search) {
        query += ` AND (code ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (ledger_type) {
        query += ` AND ledger_type = $${paramIndex}`;
        params.push(ledger_type);
        paramIndex++;
      }

      if (is_active !== undefined && is_active !== "") {
        query += ` AND is_active = $${paramIndex}`;
        params.push(is_active === "true" || is_active === true);
        paramIndex++;
      }

      if (parent_code) {
        if (parent_code === "null" || parent_code === "root") {
          query += ` AND parent_code IS NULL`;
        } else {
          query += ` AND parent_code = $${paramIndex}`;
          params.push(parent_code);
          paramIndex++;
        }
      }

      query += ` ORDER BY ledger_type NULLS LAST, level, sort_order, code`;

      const result = await pool.query(query, params);

      // If flat=true, return flat list; otherwise build tree structure
      if (flat === "true") {
        res.json(result.rows);
      } else {
        // Build tree structure
        const tree = buildAccountTree(result.rows);
        res.json(tree);
      }
    } catch (error) {
      console.error("Error fetching account codes:", error);
      res.status(500).json({
        message: "Error fetching account codes",
        error: error.message,
      });
    }
  });

  // GET /hierarchy - Get account codes with full hierarchy path
  router.get("/hierarchy", async (req, res) => {
    try {
      const query = `
        SELECT * FROM account_codes_hierarchy
        WHERE is_active = true
        ORDER BY path_array
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching account hierarchy:", error);
      res.status(500).json({
        message: "Error fetching account hierarchy",
        error: error.message,
      });
    }
  });

  // GET /search - Search account codes for autocomplete
  router.get("/search", async (req, res) => {
    try {
      const { q, limit = 20 } = req.query;

      if (!q || q.length < 1) {
        return res.json([]);
      }

      const query = `
        SELECT code, description, ledger_type, parent_code, is_active
        FROM account_codes
        WHERE is_active = true
          AND (code ILIKE $1 OR description ILIKE $1)
        ORDER BY
          CASE WHEN code ILIKE $2 THEN 0 ELSE 1 END,
          code
        LIMIT $3
      `;

      const result = await pool.query(query, [
        `%${q}%`,
        `${q}%`,
        parseInt(limit),
      ]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error searching account codes:", error);
      res.status(500).json({
        message: "Error searching account codes",
        error: error.message,
      });
    }
  });

  // GET /children/:parentCode - Get direct children of an account
  router.get("/children/:parentCode", async (req, res) => {
    try {
      const { parentCode } = req.params;

      const query = `
        SELECT id, code, description, ledger_type, parent_code,
               level, sort_order, is_active, is_system
        FROM account_codes
        WHERE parent_code = $1
        ORDER BY sort_order, code
      `;

      const result = await pool.query(query, [parentCode]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching child accounts:", error);
      res.status(500).json({
        message: "Error fetching child accounts",
        error: error.message,
      });
    }
  });

  // GET /:code - Get single account code by code
  router.get("/:code", async (req, res) => {
    try {
      const { code } = req.params;

      const query = `
        SELECT
          id, code, description, ledger_type, parent_code,
          level, sort_order, is_active, is_system, notes,
          created_at, updated_at, created_by, updated_by
        FROM account_codes
        WHERE code = $1
      `;

      const result = await pool.query(query, [code]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Account code not found" });
      }

      // Also get children count
      const childrenQuery = `
        SELECT COUNT(*) as children_count
        FROM account_codes
        WHERE parent_code = $1
      `;
      const childrenResult = await pool.query(childrenQuery, [code]);

      res.json({
        ...result.rows[0],
        children_count: parseInt(childrenResult.rows[0].children_count),
      });
    } catch (error) {
      console.error("Error fetching account code:", error);
      res.status(500).json({
        message: "Error fetching account code",
        error: error.message,
      });
    }
  });

  // POST / - Create new account code
  router.post("/", async (req, res) => {
    const {
      code,
      description,
      ledger_type,
      parent_code,
      level,
      sort_order,
      is_active,
      notes,
    } = req.body;

    // Validation
    if (!code || !description) {
      return res.status(400).json({
        message: "Code and description are required",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if code already exists
      const checkQuery = "SELECT 1 FROM account_codes WHERE code = $1";
      const checkResult = await client.query(checkQuery, [code]);
      if (checkResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Account code '${code}' already exists`,
        });
      }

      // If parent_code is provided, validate it exists and calculate level
      let calculatedLevel = level || 1;
      if (parent_code) {
        const parentQuery =
          "SELECT level FROM account_codes WHERE code = $1";
        const parentResult = await client.query(parentQuery, [parent_code]);
        if (parentResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Parent account '${parent_code}' does not exist`,
          });
        }
        calculatedLevel = parentResult.rows[0].level + 1;
      }

      // If ledger_type is provided, validate it exists
      if (ledger_type) {
        const ltQuery = "SELECT 1 FROM ledger_types WHERE code = $1";
        const ltResult = await client.query(ltQuery, [ledger_type]);
        if (ltResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Ledger type '${ledger_type}' does not exist`,
          });
        }
      }

      const insertQuery = `
        INSERT INTO account_codes (
          code, description, ledger_type, parent_code,
          level, sort_order, is_active, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        code.toUpperCase().trim(),
        description.trim(),
        ledger_type || null,
        parent_code || null,
        calculatedLevel,
        sort_order || 0,
        is_active !== false,
        notes || null,
        req.staffId || null,
      ];

      const result = await client.query(insertQuery, values);
      await client.query("COMMIT");

      res.status(201).json({
        message: "Account code created successfully",
        accountCode: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating account code:", error);
      res.status(500).json({
        message: "Error creating account code",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // PUT /:code - Update account code
  router.put("/:code", async (req, res) => {
    const { code } = req.params;
    const {
      description,
      ledger_type,
      parent_code,
      sort_order,
      is_active,
      notes,
    } = req.body;

    if (!description) {
      return res.status(400).json({
        message: "Description is required",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if account exists
      const checkQuery =
        "SELECT is_system, level FROM account_codes WHERE code = $1";
      const checkResult = await client.query(checkQuery, [code]);
      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: `Account code '${code}' not found`,
        });
      }

      // Calculate level if parent changed
      let newLevel = checkResult.rows[0].level;
      if (parent_code !== undefined) {
        if (parent_code === null || parent_code === "") {
          newLevel = 1;
        } else {
          // Prevent circular reference
          if (parent_code === code) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: "Account cannot be its own parent",
            });
          }

          const parentQuery =
            "SELECT level FROM account_codes WHERE code = $1";
          const parentResult = await client.query(parentQuery, [parent_code]);
          if (parentResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: `Parent account '${parent_code}' does not exist`,
            });
          }
          newLevel = parentResult.rows[0].level + 1;
        }
      }

      // Validate ledger_type if provided
      if (ledger_type) {
        const ltQuery = "SELECT 1 FROM ledger_types WHERE code = $1";
        const ltResult = await client.query(ltQuery, [ledger_type]);
        if (ltResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Ledger type '${ledger_type}' does not exist`,
          });
        }
      }

      const updateQuery = `
        UPDATE account_codes
        SET
          description = $1,
          ledger_type = $2,
          parent_code = $3,
          level = $4,
          sort_order = $5,
          is_active = $6,
          notes = $7,
          updated_by = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE code = $9
        RETURNING *
      `;

      const values = [
        description.trim(),
        ledger_type || null,
        parent_code || null,
        newLevel,
        sort_order || 0,
        is_active !== false,
        notes || null,
        req.staffId || null,
        code,
      ];

      const result = await client.query(updateQuery, values);
      await client.query("COMMIT");

      res.json({
        message: "Account code updated successfully",
        accountCode: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating account code:", error);
      res.status(500).json({
        message: "Error updating account code",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // DELETE /:code - Delete account code
  router.delete("/:code", async (req, res) => {
    const { code } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if account exists and is not system
      const checkQuery =
        "SELECT is_system FROM account_codes WHERE code = $1";
      const checkResult = await client.query(checkQuery, [code]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: `Account code '${code}' not found`,
        });
      }

      if (checkResult.rows[0].is_system) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete system account code",
        });
      }

      // Check if account has children
      const childrenQuery =
        "SELECT COUNT(*) as count FROM account_codes WHERE parent_code = $1";
      const childrenResult = await client.query(childrenQuery, [code]);

      if (parseInt(childrenResult.rows[0].count) > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete account with child accounts. Delete children first or reassign them.",
        });
      }

      // Check if account is used in journal entries
      const journalQuery =
        "SELECT COUNT(*) as count FROM journal_entry_lines WHERE account_code = $1";
      const journalResult = await client.query(journalQuery, [code]);

      if (parseInt(journalResult.rows[0].count) > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete account that has been used in journal entries. Consider deactivating instead.",
        });
      }

      // Delete the account
      const deleteQuery =
        "DELETE FROM account_codes WHERE code = $1 RETURNING code";
      const result = await client.query(deleteQuery, [code]);

      await client.query("COMMIT");

      res.json({
        message: "Account code deleted successfully",
        code: result.rows[0].code,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting account code:", error);
      res.status(500).json({
        message: "Error deleting account code",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // POST /import - Bulk import account codes from CSV data
  router.post("/import", async (req, res) => {
    const { accounts } = req.body;

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({
        message: "Accounts array is required",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const results = {
        created: 0,
        updated: 0,
        errors: [],
      };

      for (const account of accounts) {
        try {
          const { code, description, tl, main_acc } = account;

          if (!code || !description) {
            results.errors.push({
              code: code || "unknown",
              error: "Code and description are required",
            });
            continue;
          }

          // Check if account exists
          const checkQuery = "SELECT 1 FROM account_codes WHERE code = $1";
          const checkResult = await client.query(checkQuery, [code]);

          // Calculate level
          let level = 1;
          if (main_acc) {
            const parentQuery =
              "SELECT level FROM account_codes WHERE code = $1";
            const parentResult = await client.query(parentQuery, [main_acc]);
            if (parentResult.rows.length > 0) {
              level = parentResult.rows[0].level + 1;
            }
          }

          if (checkResult.rows.length > 0) {
            // Update existing
            const updateQuery = `
              UPDATE account_codes
              SET description = $1, ledger_type = $2, parent_code = $3, level = $4
              WHERE code = $5
            `;
            await client.query(updateQuery, [
              description,
              tl || null,
              main_acc || null,
              level,
              code,
            ]);
            results.updated++;
          } else {
            // Insert new
            const insertQuery = `
              INSERT INTO account_codes (code, description, ledger_type, parent_code, level)
              VALUES ($1, $2, $3, $4, $5)
            `;
            await client.query(insertQuery, [
              code,
              description,
              tl || null,
              main_acc || null,
              level,
            ]);
            results.created++;
          }
        } catch (err) {
          results.errors.push({
            code: account.code || "unknown",
            error: err.message,
          });
        }
      }

      await client.query("COMMIT");

      res.json({
        message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`,
        results,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error importing account codes:", error);
      res.status(500).json({
        message: "Error importing account codes",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}

// Helper function to build tree structure from flat list
function buildAccountTree(accounts) {
  const map = new Map();
  const roots = [];

  // First pass: create map of all accounts
  accounts.forEach((account) => {
    map.set(account.code, { ...account, children: [] });
  });

  // Second pass: build tree structure
  accounts.forEach((account) => {
    const node = map.get(account.code);
    if (account.parent_code && map.has(account.parent_code)) {
      map.get(account.parent_code).children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}
