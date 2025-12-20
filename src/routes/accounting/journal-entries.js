// src/routes/accounting/journal-entries.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // ==================== JOURNAL ENTRY TYPES ====================

  // GET /types - Get all journal entry types
  router.get("/types", async (req, res) => {
    try {
      const query = `
        SELECT code, name, description, is_active
        FROM journal_entry_types
        WHERE is_active = true
        ORDER BY code
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching journal entry types:", error);
      res.status(500).json({
        message: "Error fetching journal entry types",
        error: error.message,
      });
    }
  });

  // ==================== JOURNAL ENTRIES ====================

  // GET / - Get all journal entries with filters
  router.get("/", async (req, res) => {
    try {
      const {
        start_date,
        end_date,
        entry_type,
        status,
        search,
        limit = 50,
        offset = 0,
      } = req.query;

      let query = `
        SELECT
          je.id, je.reference_no, je.entry_type, je.entry_date,
          je.description, je.total_debit, je.total_credit, je.status,
          je.created_at, je.updated_at, je.posted_at,
          jet.name as entry_type_name
        FROM journal_entries je
        LEFT JOIN journal_entry_types jet ON je.entry_type = jet.code
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (start_date) {
        query += ` AND je.entry_date >= $${paramIndex}`;
        params.push(start_date);
        paramIndex++;
      }

      if (end_date) {
        query += ` AND je.entry_date <= $${paramIndex}`;
        params.push(end_date);
        paramIndex++;
      }

      if (entry_type) {
        query += ` AND je.entry_type = $${paramIndex}`;
        params.push(entry_type);
        paramIndex++;
      }

      if (status) {
        query += ` AND je.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (search) {
        query += ` AND (je.reference_no ILIKE $${paramIndex} OR je.description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Get total count
      const countQuery = query.replace(
        /SELECT[\s\S]*?FROM/,
        "SELECT COUNT(*) as total FROM"
      );
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Add ordering and pagination
      query += ` ORDER BY je.entry_date DESC, je.reference_no DESC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, params);

      res.json({
        entries: result.rows,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (error) {
      console.error("Error fetching journal entries:", error);
      res.status(500).json({
        message: "Error fetching journal entries",
        error: error.message,
      });
    }
  });

  // GET /next-reference/:type - Get next reference number for entry type
  router.get("/next-reference/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();

      // Get the prefix based on entry type
      const prefixMap = {
        B: "PBE", // Payment Bank Entry
        C: "PCE", // Payment Cash Entry
        I: "INV", // Invoice
        S: "SLE", // Sales Entry
        J: "JNL", // Journal
        R: "REC", // Receipt
        DR: "DRN", // Debit Note
        CR: "CRN", // Credit Note
        O: "OPB", // Opening Balance
      };

      const prefix = prefixMap[type] || "JNL";
      const pattern = `${prefix}%/${String(currentMonth).padStart(2, "0")}`;

      const query = `
        SELECT reference_no
        FROM journal_entries
        WHERE reference_no LIKE $1
        ORDER BY reference_no DESC
        LIMIT 1
      `;

      const result = await pool.query(query, [pattern]);

      let nextNumber = 1;
      if (result.rows.length > 0) {
        // Extract number from reference like "PBE001/06"
        const lastRef = result.rows[0].reference_no;
        const match = lastRef.match(/^[A-Z]+(\d+)\//);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const nextReference = `${prefix}${String(nextNumber).padStart(3, "0")}/${String(currentMonth).padStart(2, "0")}`;

      res.json({ reference_no: nextReference });
    } catch (error) {
      console.error("Error generating next reference:", error);
      res.status(500).json({
        message: "Error generating next reference",
        error: error.message,
      });
    }
  });

  // GET /:id - Get single journal entry with lines
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      // Get entry header
      const entryQuery = `
        SELECT
          je.id, je.reference_no, je.entry_type, je.entry_date,
          je.description, je.total_debit, je.total_credit, je.status,
          je.created_at, je.updated_at, je.posted_at,
          je.created_by, je.updated_by, je.posted_by,
          jet.name as entry_type_name
        FROM journal_entries je
        LEFT JOIN journal_entry_types jet ON je.entry_type = jet.code
        WHERE je.id = $1
      `;
      const entryResult = await pool.query(entryQuery, [id]);

      if (entryResult.rows.length === 0) {
        return res.status(404).json({ message: "Journal entry not found" });
      }

      // Get entry lines
      const linesQuery = `
        SELECT
          jel.id, jel.line_number, jel.account_code, jel.debit_amount,
          jel.credit_amount, jel.reference, jel.particulars,
          ac.description as account_description
        FROM journal_entry_lines jel
        LEFT JOIN account_codes ac ON jel.account_code = ac.code
        WHERE jel.journal_entry_id = $1
        ORDER BY jel.line_number
      `;
      const linesResult = await pool.query(linesQuery, [id]);

      res.json({
        ...entryResult.rows[0],
        lines: linesResult.rows,
      });
    } catch (error) {
      console.error("Error fetching journal entry:", error);
      res.status(500).json({
        message: "Error fetching journal entry",
        error: error.message,
      });
    }
  });

  // POST / - Create new journal entry
  router.post("/", async (req, res) => {
    const { reference_no, entry_type, entry_date, description, lines } =
      req.body;

    // Validation
    if (!reference_no || !entry_type || !entry_date) {
      return res.status(400).json({
        message: "Reference number, entry type, and date are required",
      });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        message: "At least one line item is required",
      });
    }

    // Calculate totals
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += parseFloat(line.debit_amount) || 0;
      totalCredit += parseFloat(line.credit_amount) || 0;
    }

    // Validate debits = credits (with small tolerance for rounding)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({
        message: `Total debits (${totalDebit.toFixed(2)}) must equal total credits (${totalCredit.toFixed(2)})`,
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if reference already exists
      const checkQuery =
        "SELECT 1 FROM journal_entries WHERE reference_no = $1";
      const checkResult = await client.query(checkQuery, [reference_no]);
      if (checkResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Reference number '${reference_no}' already exists`,
        });
      }

      // Validate all account codes exist
      for (const line of lines) {
        const acQuery = "SELECT 1 FROM account_codes WHERE code = $1";
        const acResult = await client.query(acQuery, [line.account_code]);
        if (acResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Account code '${line.account_code}' does not exist`,
          });
        }
      }

      // Insert entry header
      const insertEntryQuery = `
        INSERT INTO journal_entries (
          reference_no, entry_type, entry_date, description,
          total_debit, total_credit, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)
        RETURNING id
      `;

      const entryResult = await client.query(insertEntryQuery, [
        reference_no,
        entry_type,
        entry_date,
        description || null,
        totalDebit,
        totalCredit,
        req.staffId || null,
      ]);

      const entryId = entryResult.rows[0].id;

      // Insert lines
      const insertLineQuery = `
        INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_code,
          debit_amount, credit_amount, reference, particulars
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      for (const line of lines) {
        await client.query(insertLineQuery, [
          entryId,
          line.line_number,
          line.account_code,
          parseFloat(line.debit_amount) || 0,
          parseFloat(line.credit_amount) || 0,
          line.reference || null,
          line.particulars || null,
        ]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Journal entry created successfully",
        entry: { id: entryId, reference_no },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating journal entry:", error);
      res.status(500).json({
        message: "Error creating journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // PUT /:id - Update journal entry
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { reference_no, entry_type, entry_date, description, lines } =
      req.body;

    if (!reference_no || !entry_type || !entry_date) {
      return res.status(400).json({
        message: "Reference number, entry type, and date are required",
      });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        message: "At least one line item is required",
      });
    }

    // Calculate totals
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += parseFloat(line.debit_amount) || 0;
      totalCredit += parseFloat(line.credit_amount) || 0;
    }

    // Validate debits = credits
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({
        message: `Total debits (${totalDebit.toFixed(2)}) must equal total credits (${totalCredit.toFixed(2)})`,
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if entry exists and is editable
      const checkQuery =
        "SELECT status FROM journal_entries WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      if (checkResult.rows[0].status === "posted") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot edit a posted journal entry",
        });
      }

      // Check if reference_no is unique (excluding current entry)
      const refCheckQuery =
        "SELECT 1 FROM journal_entries WHERE reference_no = $1 AND id != $2";
      const refCheckResult = await client.query(refCheckQuery, [
        reference_no,
        id,
      ]);
      if (refCheckResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Reference number '${reference_no}' already exists`,
        });
      }

      // Validate all account codes exist
      for (const line of lines) {
        const acQuery = "SELECT 1 FROM account_codes WHERE code = $1";
        const acResult = await client.query(acQuery, [line.account_code]);
        if (acResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Account code '${line.account_code}' does not exist`,
          });
        }
      }

      // Update entry header
      const updateEntryQuery = `
        UPDATE journal_entries
        SET reference_no = $1, entry_type = $2, entry_date = $3,
            description = $4, total_debit = $5, total_credit = $6,
            updated_by = $7, updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
      `;

      await client.query(updateEntryQuery, [
        reference_no,
        entry_type,
        entry_date,
        description || null,
        totalDebit,
        totalCredit,
        req.staffId || null,
        id,
      ]);

      // Delete existing lines and re-insert
      await client.query(
        "DELETE FROM journal_entry_lines WHERE journal_entry_id = $1",
        [id]
      );

      const insertLineQuery = `
        INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_code,
          debit_amount, credit_amount, reference, particulars
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      for (const line of lines) {
        await client.query(insertLineQuery, [
          id,
          line.line_number,
          line.account_code,
          parseFloat(line.debit_amount) || 0,
          parseFloat(line.credit_amount) || 0,
          line.reference || null,
          line.particulars || null,
        ]);
      }

      await client.query("COMMIT");

      res.json({
        message: "Journal entry updated successfully",
        entry: { id: parseInt(id), reference_no },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating journal entry:", error);
      res.status(500).json({
        message: "Error updating journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // POST /:id/post - Post a journal entry
  router.post("/:id/post", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if entry exists and is draft
      const checkQuery =
        "SELECT status, total_debit, total_credit FROM journal_entries WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      if (checkResult.rows[0].status !== "draft") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Cannot post entry with status '${checkResult.rows[0].status}'`,
        });
      }

      // Verify debits equal credits
      const { total_debit, total_credit } = checkResult.rows[0];
      if (Math.abs(parseFloat(total_debit) - parseFloat(total_credit)) > 0.01) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Total debits must equal total credits to post",
        });
      }

      // Update status to posted
      const updateQuery = `
        UPDATE journal_entries
        SET status = 'posted', posted_at = CURRENT_TIMESTAMP, posted_by = $1
        WHERE id = $2
      `;

      await client.query(updateQuery, [req.staffId || null, id]);

      await client.query("COMMIT");

      res.json({ message: "Journal entry posted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error posting journal entry:", error);
      res.status(500).json({
        message: "Error posting journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // POST /:id/cancel - Cancel a journal entry
  router.post("/:id/cancel", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const checkQuery = "SELECT status FROM journal_entries WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      if (checkResult.rows[0].status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Entry is already cancelled",
        });
      }

      const updateQuery = `
        UPDATE journal_entries
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP, updated_by = $1
        WHERE id = $2
      `;

      await client.query(updateQuery, [req.staffId || null, id]);

      await client.query("COMMIT");

      res.json({ message: "Journal entry cancelled successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling journal entry:", error);
      res.status(500).json({
        message: "Error cancelling journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // DELETE /:id - Delete a draft journal entry
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const checkQuery = "SELECT status FROM journal_entries WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      if (checkResult.rows[0].status !== "draft") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Only draft entries can be deleted",
        });
      }

      // Lines will be deleted by CASCADE
      await client.query("DELETE FROM journal_entries WHERE id = $1", [id]);

      await client.query("COMMIT");

      res.json({ message: "Journal entry deleted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting journal entry:", error);
      res.status(500).json({
        message: "Error deleting journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
