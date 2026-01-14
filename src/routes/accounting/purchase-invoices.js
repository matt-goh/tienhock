// src/routes/accounting/purchase-invoices.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // ==================== HELPER FUNCTIONS ====================

  /**
   * Generate next reference number for purchase journal entry
   * Format: PUR001/MM where MM is current month
   */
  async function generatePurchaseReference(client) {
    const currentMonth = new Date().getMonth() + 1;
    const pattern = `PUR%/${String(currentMonth).padStart(2, "0")}`;

    const query = `
      SELECT reference_no
      FROM journal_entries
      WHERE reference_no LIKE $1
      ORDER BY reference_no DESC
      LIMIT 1
    `;

    const result = await client.query(query, [pattern]);

    let nextNumber = 1;
    if (result.rows.length > 0) {
      const lastRef = result.rows[0].reference_no;
      const match = lastRef.match(/^PUR(\d+)\//);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    return `PUR${String(nextNumber).padStart(3, "0")}/${String(currentMonth).padStart(2, "0")}`;
  }

  /**
   * Get account code for material category from mapping table
   */
  async function getAccountCodeForCategory(client, category) {
    const query = `
      SELECT purchase_account_code
      FROM material_purchase_account_mappings
      WHERE material_category = $1 AND is_active = true
    `;
    const result = await client.query(query, [category]);

    if (result.rows.length > 0) {
      return result.rows[0].purchase_account_code;
    }

    // Default fallback to PUR if no mapping found
    return "PUR";
  }

  /**
   * Create journal entry for a material purchase invoice
   * Debits purchase accounts (based on material category), credits Trade Payables (TP)
   */
  async function createPurchaseJournalEntry(client, invoice, lines, staffId) {
    const referenceNo = await generatePurchaseReference(client);
    const supplierQuery = "SELECT name FROM suppliers WHERE id = $1";
    const supplierResult = await client.query(supplierQuery, [invoice.supplier_id]);
    const supplierName = supplierResult.rows[0]?.name || "Unknown Supplier";

    const totalAmount = lines.reduce((sum, line) => sum + parseFloat(line.amount), 0);

    // Insert journal entry header
    const insertEntryQuery = `
      INSERT INTO journal_entries (
        reference_no, entry_type, entry_date, description,
        total_debit, total_credit, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'posted', $7)
      RETURNING id
    `;

    const entryResult = await client.query(insertEntryQuery, [
      referenceNo,
      "PUR",
      invoice.invoice_date,
      `Material purchase from ${supplierName} - Inv#${invoice.invoice_number}`,
      totalAmount,
      totalAmount,
      staffId || null,
    ]);

    const journalEntryId = entryResult.rows[0].id;

    // Insert journal lines
    const insertLineQuery = `
      INSERT INTO journal_entry_lines (
        journal_entry_id, line_number, account_code,
        debit_amount, credit_amount, reference, particulars
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    let lineNumber = 1;

    // Group lines by category to aggregate journal entries
    const categoryTotals = {};
    for (const line of lines) {
      const accountCode = await getAccountCodeForCategory(client, line.material_category);
      if (!categoryTotals[accountCode]) {
        categoryTotals[accountCode] = { total: 0, materials: [] };
      }
      categoryTotals[accountCode].total += parseFloat(line.amount);
      categoryTotals[accountCode].materials.push(line.material_name);
    }

    // Debit lines (purchase accounts by category)
    for (const [accountCode, data] of Object.entries(categoryTotals)) {
      await client.query(insertLineQuery, [
        journalEntryId,
        lineNumber,
        accountCode,
        data.total,
        0,
        invoice.invoice_number,
        data.materials.join(", "),
      ]);
      lineNumber++;
    }

    // Credit line (Trade Payables)
    await client.query(insertLineQuery, [
      journalEntryId,
      lineNumber,
      "TP", // Trade Payables account
      0,
      totalAmount,
      invoice.invoice_number,
      `Payable to ${supplierName}`,
    ]);

    return journalEntryId;
  }

  // ==================== ROUTES ====================

  // GET /materials - Get materials for dropdown (active only, including variants)
  router.get("/materials", async (req, res) => {
    try {
      // Get base materials
      const materialsQuery = `
        SELECT id, code, name, category, default_unit_cost
        FROM materials
        WHERE is_active = true
        ORDER BY category, sort_order, name
      `;
      const materialsResult = await pool.query(materialsQuery);

      // Get variants for materials that have them
      const variantsQuery = `
        SELECT mv.id as variant_id, mv.material_id, mv.variant_name, mv.default_unit_cost,
               m.code as material_code, m.name as material_name, m.category
        FROM material_variants mv
        JOIN materials m ON mv.material_id = m.id
        WHERE mv.is_active = true AND m.is_active = true
        ORDER BY m.category, m.sort_order, m.name, mv.sort_order, mv.variant_name
      `;
      const variantsResult = await pool.query(variantsQuery);

      // Build response: all base materials + individual variants
      const result = [];

      // Add all base materials
      for (const material of materialsResult.rows) {
        result.push({
          id: material.id,
          code: material.code,
          name: material.name,
          category: material.category,
          default_unit_cost: material.default_unit_cost,
          is_variant: false,
        });
      }

      // Add variants as separate items (with indented name to show hierarchy)
      for (const variant of variantsResult.rows) {
        result.push({
          id: `${variant.material_id}-${variant.variant_id}`, // Composite ID for variants
          material_id: variant.material_id,
          variant_id: variant.variant_id,
          code: variant.material_code,
          name: `${variant.material_name} - ${variant.variant_name}`,
          category: variant.category,
          default_unit_cost: variant.default_unit_cost,
          is_variant: true,
          variant_name: variant.variant_name,
        });
      }

      // Sort by category, then name
      result.sort((a, b) => {
        if (a.category !== b.category) {
          const order = ['ingredient', 'raw_material', 'packing_material'];
          return order.indexOf(a.category) - order.indexOf(b.category);
        }
        return a.name.localeCompare(b.name);
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching materials for dropdown:", error);
      res.status(500).json({
        message: "Error fetching materials",
        error: error.message,
      });
    }
  });

  // GET / - Get all purchase invoices with filters
  router.get("/", async (req, res) => {
    try {
      const {
        supplier_id,
        start_date,
        end_date,
        payment_status,
        search,
        limit = 50,
        offset = 0,
      } = req.query;

      let query = `
        SELECT
          pi.id, pi.supplier_id, pi.invoice_number, pi.invoice_date,
          pi.total_amount, pi.payment_status, pi.amount_paid,
          pi.journal_entry_id, pi.notes, pi.created_at,
          s.code as supplier_code, s.name as supplier_name,
          je.reference_no as journal_reference
        FROM purchase_invoices pi
        LEFT JOIN suppliers s ON pi.supplier_id = s.id
        LEFT JOIN journal_entries je ON pi.journal_entry_id = je.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (supplier_id) {
        query += ` AND pi.supplier_id = $${paramIndex}`;
        params.push(parseInt(supplier_id));
        paramIndex++;
      }

      if (start_date) {
        query += ` AND pi.invoice_date >= $${paramIndex}`;
        params.push(start_date);
        paramIndex++;
      }

      if (end_date) {
        query += ` AND pi.invoice_date <= $${paramIndex}`;
        params.push(end_date);
        paramIndex++;
      }

      if (payment_status) {
        query += ` AND pi.payment_status = $${paramIndex}`;
        params.push(payment_status);
        paramIndex++;
      }

      if (search) {
        query += ` AND (pi.invoice_number ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex} OR s.code ILIKE $${paramIndex})`;
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
      query += ` ORDER BY pi.invoice_date DESC, pi.id DESC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, params);

      res.json({
        invoices: result.rows,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (error) {
      console.error("Error fetching purchase invoices:", error);
      res.status(500).json({
        message: "Error fetching purchase invoices",
        error: error.message,
      });
    }
  });

  // GET /:id - Get single purchase invoice with lines
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      // Get invoice header
      const invoiceQuery = `
        SELECT
          pi.id, pi.supplier_id, pi.invoice_number, pi.invoice_date,
          pi.total_amount, pi.payment_status, pi.amount_paid,
          pi.journal_entry_id, pi.notes, pi.created_at, pi.updated_at,
          s.code as supplier_code, s.name as supplier_name,
          je.reference_no as journal_reference
        FROM purchase_invoices pi
        LEFT JOIN suppliers s ON pi.supplier_id = s.id
        LEFT JOIN journal_entries je ON pi.journal_entry_id = je.id
        WHERE pi.id = $1
      `;
      const invoiceResult = await pool.query(invoiceQuery, [id]);

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ message: "Purchase invoice not found" });
      }

      // Get invoice lines with material info
      const linesQuery = `
        SELECT
          pil.id, pil.line_number, pil.material_id,
          pil.quantity, pil.unit_cost, pil.amount, pil.notes,
          m.code as material_code, m.name as material_name, m.category as material_category
        FROM purchase_invoice_lines pil
        LEFT JOIN materials m ON pil.material_id = m.id
        WHERE pil.purchase_invoice_id = $1
        ORDER BY pil.line_number
      `;
      const linesResult = await pool.query(linesQuery, [id]);

      res.json({
        ...invoiceResult.rows[0],
        lines: linesResult.rows,
      });
    } catch (error) {
      console.error("Error fetching purchase invoice:", error);
      res.status(500).json({
        message: "Error fetching purchase invoice",
        error: error.message,
      });
    }
  });

  // POST / - Create new purchase invoice with auto-journal
  router.post("/", async (req, res) => {
    const { supplier_id, invoice_number, invoice_date, notes, lines } = req.body;

    // Validation
    if (!supplier_id || !invoice_number || !invoice_date) {
      return res.status(400).json({
        message: "Supplier, invoice number, and date are required",
      });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        message: "At least one line item is required",
      });
    }

    // Calculate total
    const totalAmount = lines.reduce(
      (sum, line) => sum + (parseFloat(line.amount) || 0),
      0
    );

    if (totalAmount <= 0) {
      return res.status(400).json({
        message: "Total amount must be greater than zero",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if invoice number already exists for this supplier
      const checkQuery = `
        SELECT 1 FROM purchase_invoices
        WHERE supplier_id = $1 AND invoice_number = $2
      `;
      const checkResult = await client.query(checkQuery, [supplier_id, invoice_number]);
      if (checkResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Invoice number '${invoice_number}' already exists for this supplier`,
        });
      }

      // Validate and fetch all materials
      const enrichedLines = [];
      for (const line of lines) {
        const matQuery = `
          SELECT id, code, name, category
          FROM materials
          WHERE id = $1
        `;
        const matResult = await client.query(matQuery, [line.material_id]);
        if (matResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Material with ID '${line.material_id}' does not exist`,
          });
        }
        enrichedLines.push({
          ...line,
          material_code: matResult.rows[0].code,
          material_name: matResult.rows[0].name,
          material_category: matResult.rows[0].category,
        });
      }

      // Create the journal entry first
      const invoiceData = { supplier_id, invoice_number, invoice_date };
      const journalEntryId = await createPurchaseJournalEntry(
        client,
        invoiceData,
        enrichedLines,
        req.staffId
      );

      // Insert purchase invoice
      const insertInvoiceQuery = `
        INSERT INTO purchase_invoices (
          supplier_id, invoice_number, invoice_date, total_amount,
          payment_status, amount_paid, journal_entry_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, 'unpaid', 0, $5, $6, $7)
        RETURNING id
      `;

      const invoiceResult = await client.query(insertInvoiceQuery, [
        supplier_id,
        invoice_number.trim(),
        invoice_date,
        totalAmount,
        journalEntryId,
        notes?.trim() || null,
        req.staffId || null,
      ]);

      const invoiceId = invoiceResult.rows[0].id;

      // Insert invoice lines
      const insertLineQuery = `
        INSERT INTO purchase_invoice_lines (
          purchase_invoice_id, line_number, material_id,
          quantity, unit_cost, amount, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        await client.query(insertLineQuery, [
          invoiceId,
          line.line_number || i + 1,
          line.material_id,
          line.quantity || null,
          line.unit_cost || null,
          parseFloat(line.amount),
          line.notes?.trim() || null,
        ]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Material purchase created successfully",
        invoice: {
          id: invoiceId,
          invoice_number,
          journal_entry_id: journalEntryId,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating material purchase:", error);
      res.status(500).json({
        message: "Error creating material purchase",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // PUT /:id - Update purchase invoice (only if not paid)
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { invoice_number, invoice_date, notes, lines } = req.body;

    if (!invoice_number || !invoice_date) {
      return res.status(400).json({
        message: "Invoice number and date are required",
      });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        message: "At least one line item is required",
      });
    }

    const totalAmount = lines.reduce(
      (sum, line) => sum + (parseFloat(line.amount) || 0),
      0
    );

    if (totalAmount <= 0) {
      return res.status(400).json({
        message: "Total amount must be greater than zero",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if invoice exists and get current state
      const checkQuery = `
        SELECT pi.*, s.name as supplier_name
        FROM purchase_invoices pi
        LEFT JOIN suppliers s ON pi.supplier_id = s.id
        WHERE pi.id = $1
      `;
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Purchase invoice not found" });
      }

      const invoice = checkResult.rows[0];

      // Don't allow editing paid invoices
      if (invoice.payment_status === "paid") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot edit a fully paid invoice",
        });
      }

      // Check if invoice_number is unique for this supplier (excluding current)
      const uniqueCheckQuery = `
        SELECT 1 FROM purchase_invoices
        WHERE supplier_id = $1 AND invoice_number = $2 AND id != $3
      `;
      const uniqueCheckResult = await client.query(uniqueCheckQuery, [
        invoice.supplier_id,
        invoice_number,
        id,
      ]);
      if (uniqueCheckResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Invoice number '${invoice_number}' already exists for this supplier`,
        });
      }

      // Validate and fetch all materials
      const enrichedLines = [];
      for (const line of lines) {
        const matQuery = `
          SELECT id, code, name, category
          FROM materials
          WHERE id = $1
        `;
        const matResult = await client.query(matQuery, [line.material_id]);
        if (matResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Material with ID '${line.material_id}' does not exist`,
          });
        }
        enrichedLines.push({
          ...line,
          material_code: matResult.rows[0].code,
          material_name: matResult.rows[0].name,
          material_category: matResult.rows[0].category,
        });
      }

      // Update the journal entry
      if (invoice.journal_entry_id) {
        // Delete existing journal lines
        await client.query(
          "DELETE FROM journal_entry_lines WHERE journal_entry_id = $1",
          [invoice.journal_entry_id]
        );

        // Update journal entry header
        await client.query(
          `UPDATE journal_entries
           SET entry_date = $1, description = $2, total_debit = $3, total_credit = $4,
               updated_at = CURRENT_TIMESTAMP, updated_by = $5
           WHERE id = $6`,
          [
            invoice_date,
            `Material purchase from ${invoice.supplier_name} - Inv#${invoice_number}`,
            totalAmount,
            totalAmount,
            req.staffId || null,
            invoice.journal_entry_id,
          ]
        );

        // Group lines by category for journal entries
        const categoryTotals = {};
        for (const line of enrichedLines) {
          const accountCode = await getAccountCodeForCategory(client, line.material_category);
          if (!categoryTotals[accountCode]) {
            categoryTotals[accountCode] = { total: 0, materials: [] };
          }
          categoryTotals[accountCode].total += parseFloat(line.amount);
          categoryTotals[accountCode].materials.push(line.material_name);
        }

        // Insert new journal lines
        const insertLineQuery = `
          INSERT INTO journal_entry_lines (
            journal_entry_id, line_number, account_code,
            debit_amount, credit_amount, reference, particulars
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        let lineNumber = 1;
        for (const [accountCode, data] of Object.entries(categoryTotals)) {
          await client.query(insertLineQuery, [
            invoice.journal_entry_id,
            lineNumber,
            accountCode,
            data.total,
            0,
            invoice_number,
            data.materials.join(", "),
          ]);
          lineNumber++;
        }

        // Credit line (Trade Payables)
        await client.query(insertLineQuery, [
          invoice.journal_entry_id,
          lineNumber,
          "TP",
          0,
          totalAmount,
          invoice_number,
          `Payable to ${invoice.supplier_name}`,
        ]);
      }

      // Update purchase invoice
      await client.query(
        `UPDATE purchase_invoices
         SET invoice_number = $1, invoice_date = $2, total_amount = $3,
             notes = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [invoice_number.trim(), invoice_date, totalAmount, notes?.trim() || null, id]
      );

      // Delete old lines and insert new ones
      await client.query(
        "DELETE FROM purchase_invoice_lines WHERE purchase_invoice_id = $1",
        [id]
      );

      const insertPurchaseLineQuery = `
        INSERT INTO purchase_invoice_lines (
          purchase_invoice_id, line_number, material_id,
          quantity, unit_cost, amount, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        await client.query(insertPurchaseLineQuery, [
          id,
          line.line_number || i + 1,
          line.material_id,
          line.quantity || null,
          line.unit_cost || null,
          parseFloat(line.amount),
          line.notes?.trim() || null,
        ]);
      }

      await client.query("COMMIT");

      res.json({
        message: "Material purchase updated successfully",
        invoice: { id: parseInt(id), invoice_number },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating material purchase:", error);
      res.status(500).json({
        message: "Error updating material purchase",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // DELETE /:id - Delete purchase invoice (only if unpaid)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if invoice exists and its status
      const checkQuery = `
        SELECT payment_status, journal_entry_id, invoice_number
        FROM purchase_invoices
        WHERE id = $1
      `;
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Purchase invoice not found" });
      }

      const { payment_status, journal_entry_id, invoice_number } = checkResult.rows[0];

      // Only allow deleting unpaid invoices
      if (payment_status !== "unpaid") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Cannot delete invoice with status '${payment_status}'. Only unpaid invoices can be deleted.`,
        });
      }

      // Cancel the journal entry instead of deleting (maintain audit trail)
      if (journal_entry_id) {
        await client.query(
          `UPDATE journal_entries
           SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP, updated_by = $1
           WHERE id = $2`,
          [req.staffId || null, journal_entry_id]
        );
      }

      // Delete invoice (lines will cascade)
      await client.query("DELETE FROM purchase_invoices WHERE id = $1", [id]);

      await client.query("COMMIT");

      res.json({
        message: `Material purchase '${invoice_number}' deleted successfully`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting material purchase:", error);
      res.status(500).json({
        message: "Error deleting material purchase",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
