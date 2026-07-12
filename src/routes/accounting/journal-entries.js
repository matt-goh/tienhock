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
          je.cheque_no, je.created_at, je.updated_at, je.posted_at,
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
        // Supports a single value or a comma-separated list (multi-toggle pills)
        const types = String(entry_type)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (types.length > 0) {
          query += ` AND je.entry_type = ANY($${paramIndex})`;
          params.push(types);
          paramIndex++;
        }
      }

      if (status) {
        // Supports a single value or a comma-separated list (multi-toggle pills)
        const statuses = String(status)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (statuses.length > 0) {
          query += ` AND je.status = ANY($${paramIndex})`;
          params.push(statuses);
          paramIndex++;
        }
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

  // GET /next-cheque-no - Get next sequential cheque number (for Cash Payment / C entries)
  // Cheque numbers are a continuous physical cheque-book sequence (e.g. PBB350779 -> PBB350780),
  // independent of month/reference. Returns the seed PBB350779 when none exist yet.
  router.get("/next-cheque-no", async (req, res) => {
    const SEED_CHEQUE_NO = "PBB350779";
    try {
      const result = await pool.query(
        "SELECT cheque_no FROM journal_entries WHERE cheque_no IS NOT NULL AND cheque_no <> ''"
      );

      let best = null; // { prefix, num, width }
      for (const row of result.rows) {
        const match = String(row.cheque_no).match(/^(.*?)(\d+)$/);
        if (!match) continue;
        const prefix = match[1];
        const num = parseInt(match[2], 10);
        const width = match[2].length;
        if (!best || num > best.num) {
          best = { prefix, num, width };
        }
      }

      let nextChequeNo;
      if (!best) {
        nextChequeNo = SEED_CHEQUE_NO;
      } else {
        const nextNum = best.num + 1;
        nextChequeNo = `${best.prefix}${String(nextNum).padStart(best.width, "0")}`;
      }

      res.json({ cheque_no: nextChequeNo });
    } catch (error) {
      console.error("Error generating next cheque number:", error);
      res.status(500).json({
        message: "Error generating next cheque number",
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
          je.cheque_no, je.created_at, je.updated_at, je.posted_at,
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

  // GET /:id/receipt-voucher - Get receipt voucher data for REC journal entries
  router.get("/:id/receipt-voucher", async (req, res) => {
    try {
      const { id } = req.params;

      // First, get the journal entry and verify it's a REC type
      const entryQuery = `
        SELECT
          je.id, je.reference_no, je.entry_type, je.entry_date,
          je.description, je.status, je.created_at, je.created_by,
          je.display_reference, je.source_type, je.source_id
        FROM journal_entries je
        WHERE je.id = $1
      `;
      const entryResult = await pool.query(entryQuery, [id]);

      if (entryResult.rows.length === 0) {
        return res.status(404).json({ message: "Journal entry not found" });
      }

      const entry = entryResult.rows[0];

      // Only allow REC type entries
      if (entry.entry_type !== "REC") {
        return res.status(400).json({
          message: "Receipt voucher is only available for REC (Receipt) journal entries",
        });
      }

      // Check if entry is cancelled
      if (entry.status === "cancelled") {
        return res.status(400).json({
          message: "Cannot generate voucher for cancelled journal entry",
        });
      }

      // Journal lines with account descriptions (shared by both paths)
      const linesResult = await pool.query(
        `SELECT
            jel.account_code,
            COALESCE(ac.description, jel.account_code) as account_description,
            jel.debit_amount,
            jel.credit_amount
          FROM journal_entry_lines jel
          LEFT JOIN account_codes ac ON jel.account_code = ac.code
          WHERE jel.journal_entry_id = $1
          ORDER BY jel.line_number`,
        [id]
      );
      const lines = linesResult.rows.map((line) => ({
        account_code: line.account_code,
        account_description: line.account_description,
        debit_amount: parseFloat(line.debit_amount) || 0,
        credit_amount: parseFloat(line.credit_amount) || 0,
      }));

      // ----- Receipt-owned journal (header + allocations model) -----
      if (entry.source_type === "receipt") {
        const receiptResult = await pool.query(
          `SELECT r.*, ac.description AS debit_account_description
             FROM receipts r
             LEFT JOIN account_codes ac ON ac.code = r.debit_account
            WHERE r.id = $1::int`,
          [entry.source_id]
        );
        if (receiptResult.rows.length === 0) {
          return res.status(404).json({ message: "Receipt not found for this journal entry" });
        }
        const receipt = receiptResult.rows[0];

        const allocResult = await pool.query(
          `SELECT ra.line_number, ra.allocation_type, ra.invoice_id, ra.customer_id,
                  ra.target_account, ra.external_reference, ra.amount,
                  ra.legacy_payment_id,
                  COALESCE(c.name, ra.customer_id) AS customer_name
             FROM receipt_allocations ra
             LEFT JOIN customers c ON c.id = ra.customer_id
            WHERE ra.receipt_id = $1
            ORDER BY ra.line_number`,
          [receipt.id]
        );

        const customers = [
          ...new Set(allocResult.rows.map((a) => a.customer_name).filter(Boolean)),
        ];
        const invoiceIds = allocResult.rows
          .filter((a) => a.invoice_id)
          .map((a) => a.invoice_id);
        const isUndepositedCash = ["CH_REV1", "CH_REV2"].includes(receipt.debit_account);

        return res.json({
          voucher_number: entry.display_reference || receipt.display_reference || entry.reference_no,
          voucher_date: receipt.posting_date || receipt.received_date,
          payment_id: allocResult.rows.find((a) => a.legacy_payment_id)?.legacy_payment_id || null,
          amount: parseFloat(receipt.total_amount),
          payment_method: receipt.payment_method,
          payment_reference: receipt.display_reference || null,
          cheque_reference: receipt.cheque_reference || null,
          bank_account: receipt.debit_account,
          bank_account_description: receipt.debit_account_description || receipt.debit_account,
          is_undeposited_cash: isUndepositedCash,
          customer_name: customers.join(", ") || "Unknown Customer",
          invoice_id: invoiceIds.join("/"),
          journal_entry_id: parseInt(id),
          description: receipt.description || entry.description,
          allocations: allocResult.rows.map((a) => ({
            allocation_type: a.allocation_type,
            invoice_id: a.invoice_id,
            customer_name: a.customer_name,
            external_reference: a.external_reference,
            amount: parseFloat(a.amount),
          })),
          lines,
          created_at: receipt.created_at,
          created_by: receipt.created_by,
        });
      }

      // ----- Legacy payment-owned REC journal -----
      const paymentQuery = `
        SELECT
          p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
          p.payment_method, p.payment_reference, p.bank_account,
          p.created_at,
          c.name as customer_name,
          ac.description as bank_account_description
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        LEFT JOIN customers c ON i.customerid = c.id
        LEFT JOIN account_codes ac ON p.bank_account = ac.code
        WHERE p.journal_entry_id = $1
      `;
      const paymentResult = await pool.query(paymentQuery, [id]);

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({
          message: "No payment found linked to this journal entry",
        });
      }

      const payment = paymentResult.rows[0];

      // Construct the voucher data
      const voucherData = {
        voucher_number: entry.display_reference || entry.reference_no,
        voucher_date: payment.payment_date,
        payment_id: payment.payment_id,
        amount: parseFloat(payment.amount_paid),
        payment_method: payment.payment_method,
        payment_reference: payment.payment_reference || null,
        cheque_reference: null,
        bank_account: payment.bank_account,
        bank_account_description: payment.bank_account_description || payment.bank_account,
        is_undeposited_cash: payment.bank_account === "CASH",
        customer_name: payment.customer_name || "Unknown Customer",
        invoice_id: payment.invoice_id,
        journal_entry_id: parseInt(id),
        description: entry.description,
        lines,
        created_at: payment.created_at,
        created_by: null,
      };

      res.json(voucherData);
    } catch (error) {
      console.error("Error fetching receipt voucher data:", error);
      res.status(500).json({
        message: "Error fetching receipt voucher data",
        error: error.message,
      });
    }
  });

  // POST / - Create new journal entry
  router.post("/", async (req, res) => {
    const { reference_no, entry_type, entry_date, description, cheque_no, lines } =
      req.body;

    // Cheque number only applies to Cash Payment (C) entries
    const normalizedChequeNo =
      entry_type === "C" && cheque_no && String(cheque_no).trim()
        ? String(cheque_no).trim()
        : null;

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

      // Insert entry header. Manual entries are live ("Active") immediately — the UI
      // has no draft/post step, and reports only read posted entries.
      const insertEntryQuery = `
        INSERT INTO journal_entries (
          reference_no, entry_type, entry_date, description,
          total_debit, total_credit, status, cheque_no, created_by,
          posted_at, posted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'posted', $7, $8, CURRENT_TIMESTAMP, $8)
        RETURNING id
      `;

      const entryResult = await client.query(insertEntryQuery, [
        reference_no,
        entry_type,
        entry_date,
        description || null,
        totalDebit,
        totalCredit,
        normalizedChequeNo,
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
    const { reference_no, entry_type, entry_date, description, cheque_no, lines } =
      req.body;

    // Cheque number only applies to Cash Payment (C) entries
    const normalizedChequeNo =
      entry_type === "C" && cheque_no && String(cheque_no).trim()
        ? String(cheque_no).trim()
        : null;

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
        "SELECT status, entry_type, description FROM journal_entries WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      const existing = checkResult.rows[0];
      if (existing.status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot edit a cancelled journal entry",
        });
      }

      // Manually-keyed entries stay editable while active. System-generated journals
      // (receipts, purchases, payroll vouchers/payments…) are owned by their source
      // record — correct those by cancelling/regenerating from the source screen.
      const SYSTEM_ENTRY_TYPES = ["REC", "PUR", "GP", "PAY", "CN", "JVDR", "JVSL", "S"];
      const isSystemGenerated =
        SYSTEM_ENTRY_TYPES.includes(existing.entry_type) ||
        (existing.entry_type === "B" &&
          String(existing.description || "").startsWith("PRP:"));
      if (isSystemGenerated) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "This journal was generated by the system and cannot be edited directly. Cancel or regenerate it from its source screen instead.",
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
            cheque_no = $7, updated_by = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
      `;

      await client.query(updateEntryQuery, [
        reference_no,
        entry_type,
        entry_date,
        description || null,
        totalDebit,
        totalCredit,
        normalizedChequeNo,
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

  // DELETE /:id - Delete a journal entry (except posted)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const checkQuery = "SELECT status, entry_type, reference_no FROM journal_entries WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      const { status, entry_type, reference_no } = checkResult.rows[0];

      // Special handling for auto-generated receipt (REC) entries
      if (entry_type === "REC" && status === "posted") {
        // Check if this is linked to a payment
        const paymentQuery = `
          SELECT payment_id, invoice_id, payment_date, amount_paid
          FROM payments
          WHERE journal_entry_id = $1
        `;
        const paymentResult = await client.query(paymentQuery, [id]);

        if (paymentResult.rows.length > 0) {
          const payment = paymentResult.rows[0];
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: "Cannot delete auto-generated receipt journal",
            detail: `This journal entry (${reference_no}) was auto-generated from a customer payment. To remove it, cancel the originating payment instead.`,
            payment_id: payment.payment_id,
            invoice_id: payment.invoice_id,
            suggestion: "Go to the invoice and cancel the payment to cancel this journal entry",
          });
        }
      }

      // General check for posted entries
      if (status === "posted") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete posted entries",
          detail: "Posted journal entries cannot be deleted. Use the Cancel option instead to maintain audit trail.",
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
