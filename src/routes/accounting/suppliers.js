// src/routes/accounting/suppliers.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET / - Get all suppliers with filters
  router.get("/", async (req, res) => {
    try {
      const { search, is_active, limit = 100, offset = 0 } = req.query;

      let query = `
        SELECT
          id, code, name, contact_person, phone, email,
          is_active, created_at, updated_at
        FROM suppliers
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      // Filter by active status
      if (is_active !== undefined) {
        query += ` AND is_active = $${paramIndex}`;
        params.push(is_active === "true");
        paramIndex++;
      }

      // Search by code or name
      if (search) {
        query += ` AND (code ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`;
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
      query += ` ORDER BY name ASC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, params);

      res.json({
        suppliers: result.rows,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      res.status(500).json({
        message: "Error fetching suppliers",
        error: error.message,
      });
    }
  });

  // GET /dropdown - Get suppliers for dropdown (active only, minimal fields)
  router.get("/dropdown", async (req, res) => {
    try {
      const query = `
        SELECT id, code, name
        FROM suppliers
        WHERE is_active = true
        ORDER BY name ASC
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching suppliers dropdown:", error);
      res.status(500).json({
        message: "Error fetching suppliers dropdown",
        error: error.message,
      });
    }
  });

  // GET /:id - Get single supplier with purchase invoice summary
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const supplierQuery = `
        SELECT
          id, code, name, contact_person, phone, email,
          is_active, created_at, updated_at
        FROM suppliers
        WHERE id = $1
      `;
      const supplierResult = await pool.query(supplierQuery, [id]);

      if (supplierResult.rows.length === 0) {
        return res.status(404).json({ message: "Supplier not found" });
      }

      // Get summary of purchase invoices for this supplier
      const summaryQuery = `
        SELECT
          COUNT(*) as total_invoices,
          COALESCE(SUM(total_amount), 0) as total_purchased,
          COALESCE(SUM(amount_paid), 0) as total_paid,
          COALESCE(SUM(total_amount - amount_paid), 0) as outstanding_balance,
          COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as unpaid_count,
          COUNT(CASE WHEN payment_status = 'partial' THEN 1 END) as partial_count,
          COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count
        FROM purchase_invoices
        WHERE supplier_id = $1
      `;
      const summaryResult = await pool.query(summaryQuery, [id]);

      res.json({
        ...supplierResult.rows[0],
        summary: summaryResult.rows[0],
      });
    } catch (error) {
      console.error("Error fetching supplier:", error);
      res.status(500).json({
        message: "Error fetching supplier",
        error: error.message,
      });
    }
  });

  // POST / - Create new supplier
  router.post("/", async (req, res) => {
    const { code, name, contact_person, phone, email } = req.body;

    // Validation
    if (!code || !name) {
      return res.status(400).json({
        message: "Supplier code and name are required",
      });
    }

    try {
      // Check if code already exists
      const checkQuery = "SELECT 1 FROM suppliers WHERE code = $1";
      const checkResult = await pool.query(checkQuery, [code.toUpperCase()]);
      if (checkResult.rows.length > 0) {
        return res.status(409).json({
          message: `Supplier code '${code}' already exists`,
        });
      }

      const insertQuery = `
        INSERT INTO suppliers (code, name, contact_person, phone, email)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, code, name
      `;

      const result = await pool.query(insertQuery, [
        code.toUpperCase(),
        name.trim(),
        contact_person?.trim() || null,
        phone?.trim() || null,
        email?.trim() || null,
      ]);

      res.status(201).json({
        message: "Supplier created successfully",
        supplier: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating supplier:", error);
      res.status(500).json({
        message: "Error creating supplier",
        error: error.message,
      });
    }
  });

  // PUT /:id - Update supplier
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { code, name, contact_person, phone, email, is_active } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        message: "Supplier code and name are required",
      });
    }

    try {
      // Check if supplier exists
      const checkQuery = "SELECT 1 FROM suppliers WHERE id = $1";
      const checkResult = await pool.query(checkQuery, [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Supplier not found" });
      }

      // Check if code is unique (excluding current supplier)
      const codeCheckQuery =
        "SELECT 1 FROM suppliers WHERE code = $1 AND id != $2";
      const codeCheckResult = await pool.query(codeCheckQuery, [
        code.toUpperCase(),
        id,
      ]);
      if (codeCheckResult.rows.length > 0) {
        return res.status(409).json({
          message: `Supplier code '${code}' already exists`,
        });
      }

      const updateQuery = `
        UPDATE suppliers
        SET code = $1, name = $2, contact_person = $3, phone = $4,
            email = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING id, code, name
      `;

      const result = await pool.query(updateQuery, [
        code.toUpperCase(),
        name.trim(),
        contact_person?.trim() || null,
        phone?.trim() || null,
        email?.trim() || null,
        is_active !== undefined ? is_active : true,
        id,
      ]);

      res.json({
        message: "Supplier updated successfully",
        supplier: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating supplier:", error);
      res.status(500).json({
        message: "Error updating supplier",
        error: error.message,
      });
    }
  });

  // DELETE /:id - Soft delete supplier (set is_active = false)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      // Check if supplier exists
      const checkQuery = "SELECT name FROM suppliers WHERE id = $1";
      const checkResult = await pool.query(checkQuery, [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Supplier not found" });
      }

      // Check if supplier has any unpaid invoices
      const invoiceCheckQuery = `
        SELECT COUNT(*) as count
        FROM purchase_invoices
        WHERE supplier_id = $1 AND payment_status != 'paid'
      `;
      const invoiceCheckResult = await pool.query(invoiceCheckQuery, [id]);
      const unpaidCount = parseInt(invoiceCheckResult.rows[0].count);

      if (unpaidCount > 0) {
        return res.status(400).json({
          message: `Cannot deactivate supplier with ${unpaidCount} unpaid invoice(s)`,
          unpaid_count: unpaidCount,
        });
      }

      // Soft delete by setting is_active = false
      const updateQuery = `
        UPDATE suppliers
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
      await pool.query(updateQuery, [id]);

      res.json({
        message: `Supplier '${checkResult.rows[0].name}' deactivated successfully`,
      });
    } catch (error) {
      console.error("Error deactivating supplier:", error);
      res.status(500).json({
        message: "Error deactivating supplier",
        error: error.message,
      });
    }
  });

  // POST /:id/reactivate - Reactivate a deactivated supplier
  router.post("/:id/reactivate", async (req, res) => {
    const { id } = req.params;

    try {
      const checkQuery = "SELECT name, is_active FROM suppliers WHERE id = $1";
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Supplier not found" });
      }

      if (checkResult.rows[0].is_active) {
        return res.status(400).json({ message: "Supplier is already active" });
      }

      const updateQuery = `
        UPDATE suppliers
        SET is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
      await pool.query(updateQuery, [id]);

      res.json({
        message: `Supplier '${checkResult.rows[0].name}' reactivated successfully`,
      });
    } catch (error) {
      console.error("Error reactivating supplier:", error);
      res.status(500).json({
        message: "Error reactivating supplier",
        error: error.message,
      });
    }
  });

  return router;
}
