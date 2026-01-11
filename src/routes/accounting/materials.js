// src/routes/accounting/materials.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // ==================== MATERIALS CRUD ====================

  // GET / - Get all materials with optional filters
  router.get("/", async (req, res) => {
    try {
      const { search, category, is_active, applies_to } = req.query;

      let query = `
        SELECT
          id, code, name, category, unit, unit_size,
          default_unit_cost, applies_to, sort_order,
          is_active, notes, created_at, updated_at
        FROM materials
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (search) {
        query += ` AND (code ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (is_active !== undefined && is_active !== "") {
        query += ` AND is_active = $${paramIndex}`;
        params.push(is_active === "true" || is_active === true);
        paramIndex++;
      }

      if (applies_to && applies_to !== "all") {
        query += ` AND (applies_to = $${paramIndex} OR applies_to = 'both')`;
        params.push(applies_to);
        paramIndex++;
      }

      query += ` ORDER BY sort_order, category, name`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching materials:", error);
      res.status(500).json({
        message: "Error fetching materials",
        error: error.message,
      });
    }
  });

  // GET /categories - Get distinct categories
  router.get("/categories", async (req, res) => {
    try {
      const query = `
        SELECT DISTINCT category, COUNT(*) as count
        FROM materials
        WHERE is_active = true
        GROUP BY category
        ORDER BY category
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching material categories:", error);
      res.status(500).json({
        message: "Error fetching material categories",
        error: error.message,
      });
    }
  });

  // ==================== STOCK ENTRIES ====================
  // NOTE: These routes MUST be defined BEFORE /:id to prevent route conflicts

  // GET /stock/entries - Get stock entries for a period
  router.get("/stock/entries", async (req, res) => {
    try {
      const { year, month, product_line } = req.query;

      if (!year || !month) {
        return res.status(400).json({
          message: "Year and month are required",
        });
      }

      let query = `
        SELECT
          mse.id, mse.year, mse.month, mse.material_id,
          mse.product_line, mse.quantity, mse.unit_cost,
          mse.total_value, mse.notes, mse.created_at, mse.updated_at,
          m.code as material_code, m.name as material_name,
          m.category as material_category, m.unit as material_unit,
          m.unit_size as material_unit_size, m.default_unit_cost
        FROM material_stock_entries mse
        JOIN materials m ON mse.material_id = m.id
        WHERE mse.year = $1 AND mse.month = $2
      `;
      const params = [parseInt(year), parseInt(month)];
      let paramIndex = 3;

      if (product_line) {
        query += ` AND mse.product_line = $${paramIndex}`;
        params.push(product_line);
        paramIndex++;
      }

      query += ` ORDER BY m.sort_order, m.category, m.name`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching stock entries:", error);
      res.status(500).json({
        message: "Error fetching stock entries",
        error: error.message,
      });
    }
  });

  // GET /stock/opening - Get opening balances (previous month's closing)
  router.get("/stock/opening", async (req, res) => {
    try {
      const { year, month, product_line } = req.query;

      if (!year || !month) {
        return res.status(400).json({
          message: "Year and month are required",
        });
      }

      // Calculate previous month
      let prevYear = parseInt(year);
      let prevMonth = parseInt(month) - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }

      // Get previous month's closing stock as this month's opening
      let query = `
        SELECT
          mse.material_id, mse.product_line,
          mse.quantity as opening_quantity,
          mse.unit_cost as opening_unit_cost,
          mse.total_value as opening_value,
          m.code as material_code, m.name as material_name,
          m.category as material_category, m.unit as material_unit
        FROM material_stock_entries mse
        JOIN materials m ON mse.material_id = m.id
        WHERE mse.year = $1 AND mse.month = $2
      `;
      const params = [prevYear, prevMonth];
      let paramIndex = 3;

      if (product_line) {
        query += ` AND mse.product_line = $${paramIndex}`;
        params.push(product_line);
        paramIndex++;
      }

      query += ` ORDER BY m.sort_order, m.category, m.name`;

      const result = await pool.query(query, params);
      res.json({
        period: { year: prevYear, month: prevMonth },
        opening_balances: result.rows,
      });
    } catch (error) {
      console.error("Error fetching opening balances:", error);
      res.status(500).json({
        message: "Error fetching opening balances",
        error: error.message,
      });
    }
  });

  // GET /stock/with-opening - Get all materials with their closing stock and opening balance for a period
  router.get("/stock/with-opening", async (req, res) => {
    try {
      const { year, month, product_line } = req.query;

      if (!year || !month || !product_line) {
        return res.status(400).json({
          message: "Year, month, and product_line are required",
        });
      }

      // Calculate previous month
      let prevYear = parseInt(year);
      let prevMonth = parseInt(month) - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }

      // Get all active materials that apply to this product line
      const materialsQuery = `
        SELECT
          m.id, m.code, m.name, m.category, m.unit, m.unit_size,
          m.default_unit_cost, m.applies_to, m.sort_order
        FROM materials m
        WHERE m.is_active = true
          AND (m.applies_to = $1 OR m.applies_to = 'both')
        ORDER BY m.sort_order, m.category, m.name
      `;
      const materials = await pool.query(materialsQuery, [product_line]);

      // Get previous month's closing (this month's opening)
      const openingQuery = `
        SELECT material_id, quantity, unit_cost, total_value
        FROM material_stock_entries
        WHERE year = $1 AND month = $2 AND product_line = $3
      `;
      const openingResult = await pool.query(openingQuery, [prevYear, prevMonth, product_line]);
      const openingMap = new Map(openingResult.rows.map(r => [r.material_id, r]));

      // Get current month's closing
      const closingQuery = `
        SELECT id, material_id, quantity, unit_cost, total_value, notes
        FROM material_stock_entries
        WHERE year = $1 AND month = $2 AND product_line = $3
      `;
      const closingResult = await pool.query(closingQuery, [parseInt(year), parseInt(month), product_line]);
      const closingMap = new Map(closingResult.rows.map(r => [r.material_id, r]));

      // Combine data
      const data = materials.rows.map(m => {
        const opening = openingMap.get(m.id);
        const closing = closingMap.get(m.id);

        return {
          ...m,
          opening_quantity: opening?.quantity || 0,
          opening_unit_cost: opening?.unit_cost || m.default_unit_cost,
          opening_value: opening?.total_value || 0,
          closing_id: closing?.id || null,
          closing_quantity: closing?.quantity || 0,
          closing_unit_cost: closing?.unit_cost || m.default_unit_cost,
          closing_value: closing?.total_value || 0,
          closing_notes: closing?.notes || null,
        };
      });

      res.json({
        year: parseInt(year),
        month: parseInt(month),
        product_line,
        opening_period: { year: prevYear, month: prevMonth },
        materials: data,
      });
    } catch (error) {
      console.error("Error fetching stock with opening:", error);
      res.status(500).json({
        message: "Error fetching stock data",
        error: error.message,
      });
    }
  });

  // POST /stock/batch - Batch upsert stock entries for a month
  router.post("/stock/batch", async (req, res) => {
    const { year, month, product_line, entries } = req.body;

    if (!year || !month || !product_line || !entries) {
      return res.status(400).json({
        message: "Year, month, product_line, and entries are required",
      });
    }

    if (!Array.isArray(entries)) {
      return res.status(400).json({
        message: "Entries must be an array",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let upsertedCount = 0;
      let deletedCount = 0;

      for (const entry of entries) {
        const { material_id, quantity, unit_cost, notes } = entry;

        if (!material_id) continue;

        const qty = parseFloat(quantity) || 0;
        const cost = parseFloat(unit_cost) || 0;
        const totalValue = qty * cost;

        if (qty === 0 && cost === 0) {
          // Delete entry if quantity and cost are both 0
          const deleteQuery = `
            DELETE FROM material_stock_entries
            WHERE year = $1 AND month = $2 AND material_id = $3 AND product_line = $4
          `;
          const deleteResult = await client.query(deleteQuery, [
            parseInt(year),
            parseInt(month),
            material_id,
            product_line,
          ]);
          if (deleteResult.rowCount > 0) deletedCount++;
        } else {
          // Upsert entry
          const upsertQuery = `
            INSERT INTO material_stock_entries (
              year, month, material_id, product_line,
              quantity, unit_cost, total_value, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (year, month, material_id, product_line)
            DO UPDATE SET
              quantity = EXCLUDED.quantity,
              unit_cost = EXCLUDED.unit_cost,
              total_value = EXCLUDED.total_value,
              notes = EXCLUDED.notes,
              updated_at = CURRENT_TIMESTAMP
            RETURNING id
          `;

          await client.query(upsertQuery, [
            parseInt(year),
            parseInt(month),
            material_id,
            product_line,
            qty,
            cost,
            totalValue,
            notes?.trim() || null,
            req.staffId || null,
          ]);
          upsertedCount++;
        }
      }

      await client.query("COMMIT");

      res.json({
        message: `Stock entries saved successfully`,
        upserted: upsertedCount,
        deleted: deletedCount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving stock entries:", error);
      res.status(500).json({
        message: "Error saving stock entries",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // GET /stock/summary - Get summary totals by category for a period
  router.get("/stock/summary", async (req, res) => {
    try {
      const { year, month, product_line } = req.query;

      if (!year || !month) {
        return res.status(400).json({
          message: "Year and month are required",
        });
      }

      let query = `
        SELECT
          m.category,
          mse.product_line,
          SUM(mse.total_value) as total_value,
          COUNT(*) as entry_count
        FROM material_stock_entries mse
        JOIN materials m ON mse.material_id = m.id
        WHERE mse.year = $1 AND mse.month = $2
      `;
      const params = [parseInt(year), parseInt(month)];
      let paramIndex = 3;

      if (product_line) {
        query += ` AND mse.product_line = $${paramIndex}`;
        params.push(product_line);
        paramIndex++;
      }

      query += ` GROUP BY m.category, mse.product_line ORDER BY m.category`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching stock summary:", error);
      res.status(500).json({
        message: "Error fetching stock summary",
        error: error.message,
      });
    }
  });

  // GET /stock/history/:materialId - Get stock entry history for a material
  router.get("/stock/history/:materialId", async (req, res) => {
    try {
      const { materialId } = req.params;
      const { product_line, limit = 12 } = req.query;

      let query = `
        SELECT
          mse.id, mse.year, mse.month, mse.product_line,
          mse.quantity, mse.unit_cost, mse.total_value,
          mse.notes, mse.created_at
        FROM material_stock_entries mse
        WHERE mse.material_id = $1
      `;
      const params = [materialId];
      let paramIndex = 2;

      if (product_line) {
        query += ` AND mse.product_line = $${paramIndex}`;
        params.push(product_line);
        paramIndex++;
      }

      query += ` ORDER BY mse.year DESC, mse.month DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit));

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching stock history:", error);
      res.status(500).json({
        message: "Error fetching stock history",
        error: error.message,
      });
    }
  });

  // ==================== MATERIALS CRUD (continued) ====================
  // NOTE: Parameterized routes MUST come AFTER specific routes

  // GET /:id - Get single material by ID
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const query = `
        SELECT
          id, code, name, category, unit, unit_size,
          default_unit_cost, applies_to, sort_order,
          is_active, notes, created_at, updated_at, created_by
        FROM materials
        WHERE id = $1
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Material not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching material:", error);
      res.status(500).json({
        message: "Error fetching material",
        error: error.message,
      });
    }
  });

  // POST / - Create new material
  router.post("/", async (req, res) => {
    const {
      code,
      name,
      category,
      unit,
      unit_size,
      default_unit_cost,
      applies_to,
      sort_order,
      notes,
    } = req.body;

    if (!code || !name || !category || !unit) {
      return res.status(400).json({
        message: "Code, name, category, and unit are required",
      });
    }

    const validCategories = ["ingredient", "raw_material", "packing_material"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        message: `Category must be one of: ${validCategories.join(", ")}`,
      });
    }

    const validAppliesTo = ["mee", "bihun", "both"];
    if (applies_to && !validAppliesTo.includes(applies_to)) {
      return res.status(400).json({
        message: `applies_to must be one of: ${validAppliesTo.join(", ")}`,
      });
    }

    try {
      // Check if code already exists
      const checkQuery = "SELECT 1 FROM materials WHERE code = $1";
      const checkResult = await pool.query(checkQuery, [code.toUpperCase().trim()]);
      if (checkResult.rows.length > 0) {
        return res.status(409).json({
          message: `Material code '${code}' already exists`,
        });
      }

      const insertQuery = `
        INSERT INTO materials (
          code, name, category, unit, unit_size,
          default_unit_cost, applies_to, sort_order, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        code.toUpperCase().trim(),
        name.trim(),
        category,
        unit.trim(),
        unit_size?.trim() || null,
        default_unit_cost || 0,
        applies_to || "both",
        sort_order || 0,
        notes?.trim() || null,
        req.staffId || null,
      ];

      const result = await pool.query(insertQuery, values);

      res.status(201).json({
        message: "Material created successfully",
        material: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating material:", error);
      res.status(500).json({
        message: "Error creating material",
        error: error.message,
      });
    }
  });

  // PUT /:id - Update material
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      code,
      name,
      category,
      unit,
      unit_size,
      default_unit_cost,
      applies_to,
      sort_order,
      is_active,
      notes,
    } = req.body;

    if (!name || !category || !unit) {
      return res.status(400).json({
        message: "Name, category, and unit are required",
      });
    }

    try {
      // Check if material exists
      const checkQuery = "SELECT id, code FROM materials WHERE id = $1";
      const checkResult = await pool.query(checkQuery, [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          message: "Material not found",
        });
      }

      // If code is being changed, check for duplicates
      if (code && code.toUpperCase().trim() !== checkResult.rows[0].code) {
        const dupQuery = "SELECT 1 FROM materials WHERE code = $1 AND id != $2";
        const dupResult = await pool.query(dupQuery, [code.toUpperCase().trim(), id]);
        if (dupResult.rows.length > 0) {
          return res.status(409).json({
            message: `Material code '${code}' already exists`,
          });
        }
      }

      const updateQuery = `
        UPDATE materials
        SET
          code = COALESCE($1, code),
          name = $2,
          category = $3,
          unit = $4,
          unit_size = $5,
          default_unit_cost = $6,
          applies_to = $7,
          sort_order = $8,
          is_active = $9,
          notes = $10,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
        RETURNING *
      `;

      const values = [
        code ? code.toUpperCase().trim() : null,
        name.trim(),
        category,
        unit.trim(),
        unit_size?.trim() || null,
        default_unit_cost || 0,
        applies_to || "both",
        sort_order || 0,
        is_active !== false,
        notes?.trim() || null,
        id,
      ];

      const result = await pool.query(updateQuery, values);

      res.json({
        message: "Material updated successfully",
        material: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating material:", error);
      res.status(500).json({
        message: "Error updating material",
        error: error.message,
      });
    }
  });

  // DELETE /:id - Soft delete material (set is_active = false)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const { hard } = req.query;

    try {
      // Check if material exists
      const checkQuery = "SELECT id, code FROM materials WHERE id = $1";
      const checkResult = await pool.query(checkQuery, [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          message: "Material not found",
        });
      }

      // Check if material has stock entries
      const stockQuery = "SELECT COUNT(*) as count FROM material_stock_entries WHERE material_id = $1";
      const stockResult = await pool.query(stockQuery, [id]);

      if (parseInt(stockResult.rows[0].count) > 0 && hard === "true") {
        return res.status(400).json({
          message: "Cannot hard delete material with stock entries. Use soft delete (deactivate) instead.",
        });
      }

      if (hard === "true") {
        // Hard delete (only if no stock entries)
        const deleteQuery = "DELETE FROM materials WHERE id = $1 RETURNING id, code";
        const result = await pool.query(deleteQuery, [id]);
        res.json({
          message: "Material deleted permanently",
          material: result.rows[0],
        });
      } else {
        // Soft delete
        const updateQuery = `
          UPDATE materials
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, code, is_active
        `;
        const result = await pool.query(updateQuery, [id]);
        res.json({
          message: "Material deactivated successfully",
          material: result.rows[0],
        });
      }
    } catch (error) {
      console.error("Error deleting material:", error);
      res.status(500).json({
        message: "Error deleting material",
        error: error.message,
      });
    }
  });

  return router;
}
