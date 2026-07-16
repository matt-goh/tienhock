// src/routes/accounting/account-codes.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // ==================== ACCOUNT CODES ====================

  // GET / - Get all account codes with optional filters
  router.get("/", async (req, res) => {
    try {
      const { search, ledger_type, is_active, parent_code, flat, page, limit } =
        req.query;
      const shouldPaginate = flat === "true" && (page !== undefined || limit !== undefined);
      const pageNumber = Math.max(parseInt(page || "1", 10) || 1, 1);
      const pageLimit = Math.min(
        Math.max(parseInt(limit || "100", 10) || 100, 1),
        500
      );
      const offset = (pageNumber - 1) * pageLimit;

      const whereClauses = ["1=1"];
      const params = [];
      let paramIndex = 1;

      // Apply filters
      if (search) {
        whereClauses.push(
          `(code ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`
        );
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (ledger_type) {
        whereClauses.push(`ledger_type = $${paramIndex}`);
        params.push(ledger_type);
        paramIndex++;
      }

      if (is_active !== undefined && is_active !== "") {
        whereClauses.push(`is_active = $${paramIndex}`);
        params.push(is_active === "true" || is_active === true);
        paramIndex++;
      }

      if (parent_code) {
        if (parent_code === "null" || parent_code === "root") {
          whereClauses.push("parent_code IS NULL");
        } else {
          whereClauses.push(`parent_code = $${paramIndex}`);
          params.push(parent_code);
          paramIndex++;
        }
      }

      const whereSql = whereClauses.join(" AND ");
      let query = `
        SELECT
          id, code, description, ledger_type, parent_code,
          level, sort_order, is_active, is_system, notes, fs_note,
          created_at, updated_at
        FROM account_codes
        WHERE ${whereSql}
      `;

      query += ` ORDER BY ledger_type NULLS LAST, level, sort_order, code`;

      let total = null;
      if (shouldPaginate) {
        const countQuery = `
          SELECT COUNT(*) as total
          FROM account_codes
          WHERE ${whereSql}
        `;
        const countResult = await pool.query(countQuery, params);
        total = parseInt(countResult.rows[0].total, 10);

        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(pageLimit, offset);
      }

      const result = await pool.query(query, params);

      // If flat=true, return flat list; otherwise build tree structure
      if (flat === "true") {
        if (shouldPaginate) {
          res.json({
            data: result.rows,
            pagination: {
              page: pageNumber,
              limit: pageLimit,
              total,
              totalPages: Math.max(1, Math.ceil(total / pageLimit)),
            },
          });
        } else {
          res.json(result.rows);
        }
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
        SELECT code, description, ledger_type, parent_code, is_active, fs_note
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
               level, sort_order, is_active, is_system, fs_note
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

  // GET /:code/overview - Legacy-style annual activity for one account branch.
  // The selected code and every descendant are rolled up recursively. Direct
  // children are returned separately, with each child's own full branch total.
  router.get("/:code/overview", async (req, res) => {
    const { code } = req.params;
    const now = new Date();
    const yearValue = req.query.year || String(now.getFullYear());
    const monthValue = req.query.month || String(now.getMonth() + 1);
    const year = /^\d{4}$/.test(yearValue) ? Number(yearValue) : Number.NaN;
    const month = /^\d{1,2}$/.test(monthValue)
      ? Number(monthValue)
      : Number.NaN;

    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return res.status(400).json({
        message: "Invalid year. Must be between 1900 and 2100.",
      });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({
        message: "Invalid month. Must be between 1 and 12.",
      });
    }

    const yearStart = `${year}-01-01`;
    const nextYearStart = `${year + 1}-01-01`;

    try {
      const [accountResult, childrenResult, activityResult] = await Promise.all([
        pool.query(
          `SELECT
             ac.id, ac.code, ac.description, ac.ledger_type, ac.parent_code,
             ac.level, ac.sort_order, ac.is_active, ac.is_system, ac.notes,
             ac.fs_note, ac.created_at, ac.updated_at,
             lt.name AS ledger_type_name,
             fsn.name AS fs_note_name
           FROM account_codes ac
           LEFT JOIN ledger_types lt ON lt.code = ac.ledger_type
           LEFT JOIN financial_statement_notes fsn ON fsn.code = ac.fs_note
           WHERE ac.code = $1`,
          [code]
        ),
        pool.query(
          `SELECT
             id, code, description, ledger_type, parent_code, level,
             sort_order, is_active, is_system, notes, fs_note,
             created_at, updated_at
           FROM account_codes
           WHERE parent_code = $1
           ORDER BY sort_order, code`,
          [code]
        ),
        pool.query(
          `WITH RECURSIVE account_tree AS (
             SELECT
               ac.code,
               ac.parent_code,
               0::integer AS depth,
               NULL::varchar AS branch_code,
               ARRAY[ac.code::text] AS path
             FROM account_codes ac
             WHERE ac.code = $1

             UNION ALL

             SELECT
               child.code,
               child.parent_code,
               parent.depth + 1,
               CASE
                 WHEN parent.depth = 0 THEN child.code
                 ELSE parent.branch_code
               END AS branch_code,
               parent.path || child.code::text
             FROM account_codes child
             JOIN account_tree parent ON child.parent_code = parent.code
             WHERE NOT child.code::text = ANY(parent.path)
           ),
           latest_anchors AS (
             SELECT DISTINCT ON (aob.account_code)
               aob.account_code,
               aob.as_of_date,
               aob.amount
             FROM account_opening_balances aob
             JOIN account_tree tree ON tree.code = aob.account_code
             WHERE aob.as_of_date <= $2::date
             ORDER BY aob.account_code, aob.as_of_date DESC
           ),
           prior_movements AS (
             SELECT
               jel.account_code,
               je.entry_date,
               COALESCE(jel.debit_amount, 0) -
                 COALESCE(jel.credit_amount, 0) AS net
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
             JOIN account_tree tree ON tree.code = jel.account_code
             WHERE je.status = 'posted'
               AND je.entry_date < $2::date
           ),
           opening_by_account AS (
             SELECT
               tree.code,
               tree.branch_code,
               COALESCE(anchor.amount, 0) +
                 COALESCE(
                   SUM(movement.net) FILTER (
                     WHERE anchor.as_of_date IS NULL
                        OR movement.entry_date >= anchor.as_of_date
                   ),
                   0
                 ) AS amount
             FROM account_tree tree
             LEFT JOIN latest_anchors anchor
               ON anchor.account_code = tree.code
             LEFT JOIN prior_movements movement
               ON movement.account_code = tree.code
             GROUP BY
               tree.code,
               tree.branch_code,
               anchor.as_of_date,
               anchor.amount
           ),
           monthly_by_account AS (
             SELECT
               tree.code,
               tree.branch_code,
               EXTRACT(MONTH FROM je.entry_date)::integer AS month,
               COALESCE(SUM(jel.debit_amount), 0) AS debit,
               COALESCE(SUM(jel.credit_amount), 0) AS credit
             FROM account_tree tree
             JOIN journal_entry_lines jel ON jel.account_code = tree.code
             JOIN journal_entries je ON je.id = jel.journal_entry_id
             WHERE je.status = 'posted'
               AND je.entry_date >= $2::date
               AND je.entry_date < $3::date
             GROUP BY
               tree.code,
               tree.branch_code,
               EXTRACT(MONTH FROM je.entry_date)
           )
           SELECT
             'opening' AS row_type,
             code,
             branch_code,
             NULL::integer AS month,
             0::numeric AS debit,
             0::numeric AS credit,
             amount AS net
           FROM opening_by_account

           UNION ALL

           SELECT
             'month' AS row_type,
             code,
             branch_code,
             month,
             debit,
             credit,
             debit - credit AS net
           FROM monthly_by_account
           ORDER BY row_type, code, month`,
          [code, yearStart, nextYearStart]
        ),
      ]);

      if (accountResult.rows.length === 0) {
        return res.status(404).json({ message: "Account code not found" });
      }

      const createMonths = () =>
        Array.from({ length: 12 }, (_unused, index) => ({
          month: index + 1,
          debit: 0,
          credit: 0,
          net: 0,
        }));
      const overall = { opening: 0, months: createMonths() };
      const directAccount = { opening: 0, months: createMonths() };
      const branches = new Map(
        childrenResult.rows.map((child) => [
          child.code,
          { opening: 0, months: createMonths() },
        ])
      );

      activityResult.rows.forEach((row) => {
        const net = parseFloat(row.net) || 0;
        const branch = row.branch_code ? branches.get(row.branch_code) : null;

        if (row.row_type === "opening") {
          overall.opening += net;
          if (branch) branch.opening += net;
          else directAccount.opening += net;
          return;
        }

        const monthIndex = parseInt(row.month, 10) - 1;
        if (monthIndex < 0 || monthIndex > 11) return;
        const debit = parseFloat(row.debit) || 0;
        const credit = parseFloat(row.credit) || 0;
        overall.months[monthIndex].debit += debit;
        overall.months[monthIndex].credit += credit;
        overall.months[monthIndex].net += net;

        const target = branch || directAccount;
        target.months[monthIndex].debit += debit;
        target.months[monthIndex].credit += credit;
        target.months[monthIndex].net += net;
      });

      const summarize = (activity) => {
        const balanceBroughtForward =
          activity.opening +
          activity.months
            .slice(0, month - 1)
            .reduce((sum, item) => sum + item.net, 0);
        const currentMonthMovement = activity.months[month - 1].net;
        return {
          opening_balance: activity.opening,
          balance_brought_forward: balanceBroughtForward,
          current_month_movement: currentMonthMovement,
          accumulative_balance:
            balanceBroughtForward + currentMonthMovement,
        };
      };

      const children = childrenResult.rows.map((child) => ({
        ...child,
        ...summarize(
          branches.get(child.code) || { opening: 0, months: createMonths() }
        ),
      }));

      res.json({
        account: accountResult.rows[0],
        period: {
          year,
          opening_month: 1,
          current_month: month,
        },
        subtree_account_count: activityResult.rows.filter(
          (row) => row.row_type === "opening"
        ).length,
        months: overall.months,
        totals: summarize(overall),
        direct_account: summarize(directAccount),
        children,
      });
    } catch (error) {
      console.error("Error fetching account code overview:", error);
      res.status(500).json({
        message: "Error fetching account code overview",
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
          level, sort_order, is_active, is_system, notes, fs_note,
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
      fs_note,
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

      if (fs_note) {
        const fsNoteQuery =
          "SELECT 1 FROM financial_statement_notes WHERE code = $1";
        const fsNoteResult = await client.query(fsNoteQuery, [fs_note]);
        if (fsNoteResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Financial statement note '${fs_note}' does not exist`,
          });
        }
      }

      const insertQuery = `
        INSERT INTO account_codes (
          code, description, ledger_type, parent_code,
          level, sort_order, is_active, fs_note, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        fs_note || null,
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
      fs_note,
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
        "SELECT is_system, level, fs_note FROM account_codes WHERE code = $1";
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

      if (fs_note) {
        const fsNoteQuery =
          "SELECT 1 FROM financial_statement_notes WHERE code = $1";
        const fsNoteResult = await client.query(fsNoteQuery, [fs_note]);
        if (fsNoteResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Financial statement note '${fs_note}' does not exist`,
          });
        }
      }

      const nextFsNote =
        fs_note === undefined ? checkResult.rows[0].fs_note : fs_note || null;

      const updateQuery = `
        UPDATE account_codes
        SET
          description = $1,
          ledger_type = $2,
          parent_code = $3,
          level = $4,
          sort_order = $5,
          is_active = $6,
          fs_note = $7,
          notes = $8,
          updated_by = $9,
          updated_at = CURRENT_TIMESTAMP
        WHERE code = $10
        RETURNING *
      `;

      const values = [
        description.trim(),
        ledger_type || null,
        parent_code || null,
        newLevel,
        sort_order || 0,
        is_active !== false,
        nextFsNote,
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

  // PATCH /:code/fs-note - Update only the financial statement note
  router.patch("/:code/fs-note", async (req, res) => {
    const { code } = req.params;
    const { fs_note } = req.body;

    try {
      // Validate fs_note if provided (must be null or exist in financial_statement_notes)
      if (fs_note !== null && fs_note !== undefined && fs_note !== "") {
        const noteCheck = await pool.query(
          "SELECT 1 FROM financial_statement_notes WHERE code = $1",
          [fs_note]
        );
        if (noteCheck.rows.length === 0) {
          return res.status(400).json({
            message: `Financial statement note '${fs_note}' does not exist`,
          });
        }
      }

      const updateQuery = `
        UPDATE account_codes
        SET fs_note = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
        WHERE code = $3
        RETURNING code, description, fs_note
      `;

      const result = await pool.query(updateQuery, [
        fs_note || null,
        req.staffId || null,
        code,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: `Account code '${code}' not found`,
        });
      }

      res.json({
        message: "Financial statement note updated",
        accountCode: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating fs_note:", error);
      res.status(500).json({
        message: "Error updating financial statement note",
        error: error.message,
      });
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

      // Check if account is used in location_account_mappings (for payroll voucher generation)
      const mappingsQuery =
        "SELECT location_id, location_name, mapping_type FROM location_account_mappings WHERE account_code = $1 AND is_active = true";
      const mappingsResult = await client.query(mappingsQuery, [code]);

      if (mappingsResult.rows.length > 0) {
        const mappings = mappingsResult.rows;
        const locationList = [...new Set(mappings.map(m => `${m.location_id} (${m.location_name})`))].join(", ");
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Cannot delete account that is linked to payroll voucher mappings. This account is used in location(s): ${locationList}. Remove the mapping first or deactivate the account instead.`,
          linkedMappings: mappings,
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
