// src/routes/accounting/materials.js
import { Router } from "express";

export default function (pool) {
  const router = Router();
  const validStockBuckets = new Set(["mee", "bihun", "shared"]);

  function toNumber(value) {
    return parseFloat(value) || 0;
  }

  function getPeriodStart(year, month) {
    return `${year}-${String(month).padStart(2, "0")}-01`;
  }

  function getNextPeriod(year, month) {
    if (month === 12) {
      return { year: year + 1, month: 1 };
    }
    return { year, month: month + 1 };
  }

  function stockKey(row) {
    return `${row.material_id}_${row.variant_id || ""}_${row.custom_description || ""}`;
  }

  function accumulateRows(rows, quantityField, valueField) {
    const map = new Map();

    rows.forEach((row) => {
      const key = stockKey(row);
      const current = map.get(key) || {
        quantity: 0,
        value: 0,
      };

      current.quantity += toNumber(row[quantityField]);
      current.value += toNumber(row[valueField]);
      map.set(key, current);
    });

    return map;
  }

  // ==================== MATERIALS CRUD ====================

  // GET / - Get all materials with optional filters
  router.get("/", async (req, res) => {
    try {
      const { search, category, is_active, applies_to } = req.query;

      let query = `
        SELECT
          id, code, name, category,
          default_unit_cost, applies_to, sort_order,
          is_active, created_at, updated_at
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

  // GET /stock/entries - Get manual stock adjustments for a period
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
          mse.product_line, mse.variant_id, mse.custom_name, mse.custom_description,
          mse.adjustment_quantity, mse.unit_cost, mse.adjustment_value,
          mse.notes, mse.created_at, mse.updated_at,
          m.code as material_code, m.name as material_name,
          m.category as material_category, m.default_unit_cost
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

  // GET /stock/opening - Get derived opening balances before a period
  router.get("/stock/opening", async (req, res) => {
    try {
      const { year, month, product_line } = req.query;

      if (!year || !month || !product_line) {
        return res.status(400).json({
          message: "Year, month, and product_line are required",
        });
      }

      const currentYear = parseInt(year);
      const currentMonth = parseInt(month);
      const periodStart = getPeriodStart(currentYear, currentMonth);

      const purchasesResult = await pool.query(
        `
          SELECT
            pil.material_id, pil.variant_id, NULL::text as custom_description,
            SUM(pil.quantity) as opening_quantity,
            SUM(pil.amount) as opening_value
          FROM purchase_invoice_lines pil
          JOIN purchase_invoices pi ON pi.id = pil.purchase_invoice_id
          WHERE pi.invoice_date < $1
            AND pil.stock_bucket = $2
            AND pil.quantity IS NOT NULL
          GROUP BY pil.material_id, pil.variant_id
        `,
        [periodStart, product_line]
      );

      const adjustmentsResult = await pool.query(
        `
          SELECT
            material_id, variant_id, custom_description,
            SUM(adjustment_quantity) as opening_quantity,
            SUM(adjustment_value) as opening_value
          FROM material_stock_entries
          WHERE product_line = $1
            AND (year < $2 OR (year = $2 AND month < $3))
          GROUP BY material_id, variant_id, custom_description
        `,
        [product_line, currentYear, currentMonth]
      );

      res.json({
        period: { year: currentYear, month: currentMonth },
        opening_balances: [...purchasesResult.rows, ...adjustmentsResult.rows],
      });
    } catch (error) {
      console.error("Error fetching opening balances:", error);
      res.status(500).json({
        message: "Error fetching opening balances",
        error: error.message,
      });
    }
  });

  // GET /stock/with-opening - Get derived material stock for a period
  router.get("/stock/with-opening", async (req, res) => {
    try {
      const { year, month, product_line } = req.query;

      if (!year || !month || !product_line) {
        return res.status(400).json({
          message: "Year, month, and product_line are required",
        });
      }

      if (!validStockBuckets.has(product_line)) {
        return res.status(400).json({
          message: "product_line must be one of: mee, bihun, shared",
        });
      }

      const currentYear = parseInt(year);
      const currentMonth = parseInt(month);
      const nextPeriod = getNextPeriod(currentYear, currentMonth);
      const periodStart = getPeriodStart(currentYear, currentMonth);
      const nextPeriodStart = getPeriodStart(nextPeriod.year, nextPeriod.month);

      const materialsQuery = `
        SELECT
          m.id, m.code, m.name, m.category,
          m.default_unit_cost, m.applies_to, m.sort_order
        FROM materials m
        WHERE m.is_active = true
          AND (
            ($1 = 'shared' AND m.applies_to = 'both')
            OR ($1 != 'shared' AND (m.applies_to = $1 OR m.applies_to = 'both'))
          )
        ORDER BY m.sort_order, m.category, m.name
      `;
      const materials = await pool.query(materialsQuery, [product_line]);
      const materialIds = materials.rows.map((m) => m.id);

      const variantsResult = materialIds.length > 0
        ? await pool.query(
            `
              SELECT id, material_id, variant_name, default_unit_cost, sort_order
              FROM material_variants
              WHERE material_id = ANY($1) AND is_active = true
              ORDER BY material_id, sort_order, variant_name
            `,
            [materialIds]
          )
        : { rows: [] };

      const variantsByMaterial = new Map();
      variantsResult.rows.forEach((variant) => {
        if (!variantsByMaterial.has(variant.material_id)) {
          variantsByMaterial.set(variant.material_id, []);
        }
        variantsByMaterial.get(variant.material_id).push(variant);
      });

      const openingPurchases = await pool.query(
        `
          SELECT
            pil.material_id, pil.variant_id, NULL::text as custom_description,
            SUM(pil.quantity) as quantity,
            SUM(pil.amount) as value
          FROM purchase_invoice_lines pil
          JOIN purchase_invoices pi ON pi.id = pil.purchase_invoice_id
          WHERE pi.invoice_date < $1
            AND pil.stock_bucket = $2
            AND pil.quantity IS NOT NULL
          GROUP BY pil.material_id, pil.variant_id
        `,
        [periodStart, product_line]
      );

      const currentPurchases = await pool.query(
        `
          SELECT
            pil.material_id, pil.variant_id, NULL::text as custom_description,
            SUM(pil.quantity) as quantity,
            SUM(pil.amount) as value
          FROM purchase_invoice_lines pil
          JOIN purchase_invoices pi ON pi.id = pil.purchase_invoice_id
          WHERE pi.invoice_date >= $1
            AND pi.invoice_date < $2
            AND pil.stock_bucket = $3
            AND pil.quantity IS NOT NULL
          GROUP BY pil.material_id, pil.variant_id
        `,
        [periodStart, nextPeriodStart, product_line]
      );

      const openingAdjustments = await pool.query(
        `
          SELECT
            material_id, variant_id, custom_description,
            SUM(adjustment_quantity) as quantity,
            SUM(adjustment_value) as value
          FROM material_stock_entries
          WHERE product_line = $1
            AND (year < $2 OR (year = $2 AND month < $3))
          GROUP BY material_id, variant_id, custom_description
        `,
        [product_line, currentYear, currentMonth]
      );

      const currentAdjustments = await pool.query(
        `
          SELECT id, material_id, variant_id, custom_name, custom_description,
                 adjustment_quantity, unit_cost, adjustment_value, notes
          FROM material_stock_entries
          WHERE year = $1 AND month = $2 AND product_line = $3
        `,
        [currentYear, currentMonth, product_line]
      );

      const openingPurchaseMap = accumulateRows(openingPurchases.rows, "quantity", "value");
      const currentPurchaseMap = accumulateRows(currentPurchases.rows, "quantity", "value");
      const openingAdjustmentMap = accumulateRows(openingAdjustments.rows, "quantity", "value");
      const currentAdjustmentMap = new Map();
      currentAdjustments.rows.forEach((row) => {
        currentAdjustmentMap.set(stockKey(row), row);
      });

      const buildStockRow = (material, variant = null, customDescription = null) => {
        const rowKey = `${material.id}_${variant?.id || ""}_${customDescription || ""}`;
        const openingPurchase = openingPurchaseMap.get(rowKey) || { quantity: 0, value: 0 };
        const openingAdjustment = openingAdjustmentMap.get(rowKey) || { quantity: 0, value: 0 };
        const currentPurchase = currentPurchaseMap.get(rowKey) || { quantity: 0, value: 0 };
        const currentAdjustment = currentAdjustmentMap.get(rowKey);
        const adjustmentQuantity = toNumber(currentAdjustment?.adjustment_quantity);
        const adjustmentValue = toNumber(currentAdjustment?.adjustment_value);
        const purchaseQuantity = currentPurchase.quantity;
        const purchaseValue = currentPurchase.value;
        const openingQuantity = openingPurchase.quantity + openingAdjustment.quantity;
        const openingValue = openingPurchase.value + openingAdjustment.value;
        const closingQuantity = openingQuantity + purchaseQuantity + adjustmentQuantity;
        const closingValue = openingValue + purchaseValue + adjustmentValue;
        const purchaseUnitCost = purchaseQuantity !== 0 ? purchaseValue / purchaseQuantity : 0;
        const unitCost =
          toNumber(currentAdjustment?.unit_cost) ||
          purchaseUnitCost ||
          toNumber(variant?.default_unit_cost) ||
          toNumber(material.default_unit_cost);

        return {
          entry_id: currentAdjustment?.id || null,
          variant_id: variant?.id || null,
          variant_name: variant?.variant_name || customDescription,
          is_new_variant: false,
          opening_quantity: openingQuantity,
          opening_value: openingValue,
          purchase_quantity: purchaseQuantity,
          purchase_value: purchaseValue,
          adjustment_quantity: adjustmentQuantity,
          adjustment_value: adjustmentValue,
          closing_quantity: closingQuantity,
          closing_value: closingValue,
          quantity: adjustmentQuantity,
          value: closingValue,
          unit_cost: unitCost,
          notes: currentAdjustment?.notes || null,
          custom_description: customDescription,
        };
      };

      const data = materials.rows.map((material) => {
        const variants = variantsByMaterial.get(material.id) || [];
        const hasRegisteredVariants = variants.length > 0;
        const variantRows = [];

        variants.forEach((variant) => {
          variantRows.push(buildStockRow(material, variant));
        });

        const defaultRow = buildStockRow(material);
        const hasDefaultActivity =
          defaultRow.opening_quantity !== 0 ||
          defaultRow.purchase_quantity !== 0 ||
          defaultRow.adjustment_quantity !== 0 ||
          defaultRow.closing_quantity !== 0;

        if (hasRegisteredVariants && hasDefaultActivity) {
          variantRows.unshift({
            ...defaultRow,
            variant_name: "Default",
          });
        }

        currentAdjustments.rows
          .filter((row) => row.material_id === material.id && !row.variant_id && row.custom_description)
          .forEach((row) => {
            const exists = variantRows.some(
              (variantRow) => variantRow.custom_description === row.custom_description
            );
            if (!exists) {
              variantRows.push(buildStockRow(material, null, row.custom_description));
            }
          });

        const hasVariants = hasRegisteredVariants || variantRows.length > 0;
        const baseStock = hasVariants ? null : defaultRow;

        return {
          ...material,
          default_unit_cost: toNumber(material.default_unit_cost),
          has_variants: hasVariants,
          variants: hasVariants ? variantRows : [],
          opening_quantity: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.opening_quantity, 0)
            : baseStock.opening_quantity,
          opening_value: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.opening_value, 0)
            : baseStock.opening_value,
          purchase_quantity: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.purchase_quantity, 0)
            : baseStock.purchase_quantity,
          purchase_value: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.purchase_value, 0)
            : baseStock.purchase_value,
          adjustment_quantity: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.adjustment_quantity, 0)
            : baseStock.adjustment_quantity,
          adjustment_value: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.adjustment_value, 0)
            : baseStock.adjustment_value,
          closing_quantity: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.closing_quantity, 0)
            : baseStock.closing_quantity,
          closing_value: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.closing_value, 0)
            : baseStock.closing_value,
          quantity: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.adjustment_quantity, 0)
            : baseStock.adjustment_quantity,
          value: hasVariants
            ? variantRows.reduce((sum, row) => sum + row.closing_value, 0)
            : baseStock.closing_value,
          custom_name: hasVariants ? null : (currentAdjustmentMap.get(`${material.id}__`)?.custom_name || null),
          custom_description: hasVariants ? null : null,
          entry_id: hasVariants ? null : baseStock.entry_id,
          unit_cost: hasVariants ? 0 : baseStock.unit_cost,
          notes: hasVariants ? null : baseStock.notes,
        };
      });

      res.json({
        year: currentYear,
        month: currentMonth,
        product_line,
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

  // POST /stock/batch - Batch upsert manual stock adjustments for a month
  router.post("/stock/batch", async (req, res) => {
    const { year, month, product_line, entries } = req.body;

    if (!year || !month || !product_line || !entries) {
      return res.status(400).json({
        message: "Year, month, product_line, and entries are required",
      });
    }

    if (!validStockBuckets.has(product_line)) {
      return res.status(400).json({
        message: "product_line must be one of: mee, bihun, shared",
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
      const registeredVariants = [];

      for (const entry of entries) {
        const {
          material_id,
          variant_id,
          adjustment_quantity,
          quantity,
          unit_cost,
          custom_name,
          custom_description,
          notes,
          register_variant,
        } = entry;

        if (!material_id) continue;

        const adjustmentQty = toNumber(adjustment_quantity ?? quantity);
        const cost = toNumber(unit_cost);
        const adjustmentValue = adjustmentQty * cost;

        let finalVariantId = variant_id || null;
        let finalCustomDescription = custom_description?.trim() || null;

        if (register_variant && finalCustomDescription && !finalVariantId) {
          const existingVariant = await client.query(
            "SELECT id FROM material_variants WHERE material_id = $1 AND variant_name = $2",
            [material_id, finalCustomDescription]
          );

          if (existingVariant.rows.length > 0) {
            finalVariantId = existingVariant.rows[0].id;
            finalCustomDescription = null;
          } else {
            const newVariant = await client.query(
              `INSERT INTO material_variants (material_id, variant_name, default_unit_cost)
               VALUES ($1, $2, $3) RETURNING id, variant_name`,
              [material_id, finalCustomDescription, cost]
            );
            finalVariantId = newVariant.rows[0].id;
            registeredVariants.push(newVariant.rows[0]);
            finalCustomDescription = null;
          }
        }

        const conflictKey = finalVariantId ? String(finalVariantId) : (finalCustomDescription || "default");
        const shouldDelete = adjustmentQty === 0 && !custom_name && !finalCustomDescription;

        if (shouldDelete) {
          const deleteResult = await client.query(
            `
              DELETE FROM material_stock_entries
              WHERE year = $1 AND month = $2 AND material_id = $3 AND product_line = $4
                AND COALESCE(variant_id::text, custom_description, 'default') = $5
            `,
            [parseInt(year), parseInt(month), material_id, product_line, conflictKey]
          );
          if (deleteResult.rowCount > 0) deletedCount++;
        } else {
          await client.query(
            `
              INSERT INTO material_stock_entries (
                year, month, material_id, product_line, variant_id,
                custom_name, custom_description,
                adjustment_quantity, unit_cost, adjustment_value,
                notes, created_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              ON CONFLICT (year, month, material_id, product_line, COALESCE(variant_id::text, custom_description, 'default'))
              DO UPDATE SET
                custom_name = EXCLUDED.custom_name,
                custom_description = EXCLUDED.custom_description,
                adjustment_quantity = EXCLUDED.adjustment_quantity,
                unit_cost = EXCLUDED.unit_cost,
                adjustment_value = EXCLUDED.adjustment_value,
                notes = EXCLUDED.notes,
                updated_at = CURRENT_TIMESTAMP
              RETURNING id
            `,
            [
              parseInt(year),
              parseInt(month),
              material_id,
              product_line,
              finalVariantId,
              custom_name?.trim() || null,
              finalCustomDescription,
              adjustmentQty,
              cost,
              adjustmentValue,
              notes?.trim() || null,
              req.staffId || null,
            ]
          );
          upsertedCount++;
        }
      }

      await client.query("COMMIT");

      res.json({
        message: "Stock adjustments saved successfully",
        upserted: upsertedCount,
        deleted: deletedCount,
        registered_variants: registeredVariants,
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

  // GET /stock/summary - Get current adjustment totals by category for a period
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
          SUM(mse.adjustment_value) as total_value,
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

  // GET /stock/history/:materialId - Get manual adjustment history for a material
  router.get("/stock/history/:materialId", async (req, res) => {
    try {
      const { materialId } = req.params;
      const { product_line, limit = 12 } = req.query;

      let query = `
        SELECT
          mse.id, mse.year, mse.month, mse.product_line,
          mse.variant_id, mse.adjustment_quantity, mse.unit_cost,
          mse.adjustment_value, mse.notes, mse.created_at
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

  // ==================== MATERIAL VARIANTS CRUD ====================

  // POST /batch/variants - Get variants for multiple materials (batch request)
  router.post("/batch/variants", async (req, res) => {
    try {
      const { material_ids, is_active } = req.body;

      if (!material_ids || !Array.isArray(material_ids) || material_ids.length === 0) {
        return res.status(400).json({
          message: "material_ids array is required",
        });
      }

      let query = `
        SELECT id, material_id, variant_name, default_unit_cost,
               sort_order, is_active, created_at, updated_at
        FROM material_variants
        WHERE material_id = ANY($1)
      `;
      const params = [material_ids];

      if (is_active !== undefined && is_active !== "") {
        query += ` AND is_active = $2`;
        params.push(is_active === "true" || is_active === true);
      }

      query += ` ORDER BY material_id, sort_order, variant_name`;

      const result = await pool.query(query, params);

      // Group variants by material_id
      const variantsByMaterial = {};
      material_ids.forEach(id => {
        variantsByMaterial[id] = [];
      });

      result.rows.forEach(variant => {
        if (variantsByMaterial[variant.material_id]) {
          variantsByMaterial[variant.material_id].push(variant);
        }
      });

      res.json(variantsByMaterial);
    } catch (error) {
      console.error("Error fetching material variants (batch):", error);
      res.status(500).json({
        message: "Error fetching material variants",
        error: error.message,
      });
    }
  });

  // GET /:id/variants - Get all variants for a material
  router.get("/:id/variants", async (req, res) => {
    try {
      const { id } = req.params;
      const { is_active } = req.query;

      let query = `
        SELECT id, material_id, variant_name, default_unit_cost,
               sort_order, is_active, created_at, updated_at
        FROM material_variants
        WHERE material_id = $1
      `;
      const params = [id];

      if (is_active !== undefined && is_active !== "") {
        query += ` AND is_active = $2`;
        params.push(is_active === "true" || is_active === true);
      }

      query += ` ORDER BY sort_order, variant_name`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching material variants:", error);
      res.status(500).json({
        message: "Error fetching material variants",
        error: error.message,
      });
    }
  });

  // POST /:id/variants - Create a new variant for a material
  router.post("/:id/variants", async (req, res) => {
    const { id } = req.params;
    const { variant_name, default_unit_cost, sort_order, is_active } = req.body;

    if (!variant_name) {
      return res.status(400).json({
        message: "Variant name is required",
      });
    }

    try {
      // Check if material exists
      const checkMaterial = await pool.query("SELECT id FROM materials WHERE id = $1", [id]);
      if (checkMaterial.rows.length === 0) {
        return res.status(404).json({ message: "Material not found" });
      }

      // Check for duplicate variant name
      const checkDup = await pool.query(
        "SELECT id FROM material_variants WHERE material_id = $1 AND variant_name = $2",
        [id, variant_name.trim()]
      );
      if (checkDup.rows.length > 0) {
        return res.status(409).json({
          message: `Variant '${variant_name}' already exists for this material`,
        });
      }

      const insertQuery = `
        INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const result = await pool.query(insertQuery, [
        id,
        variant_name.trim(),
        default_unit_cost || 0,
        sort_order || 0,
        is_active !== false,
      ]);

      res.status(201).json({
        message: "Variant created successfully",
        variant: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating variant:", error);
      res.status(500).json({
        message: "Error creating variant",
        error: error.message,
      });
    }
  });

  // PUT /variants/:variantId - Update a variant
  router.put("/variants/:variantId", async (req, res) => {
    const { variantId } = req.params;
    const { variant_name, default_unit_cost, sort_order, is_active } = req.body;

    if (!variant_name) {
      return res.status(400).json({
        message: "Variant name is required",
      });
    }

    try {
      // Check if variant exists
      const checkVariant = await pool.query(
        "SELECT id, material_id FROM material_variants WHERE id = $1",
        [variantId]
      );
      if (checkVariant.rows.length === 0) {
        return res.status(404).json({ message: "Variant not found" });
      }

      const materialId = checkVariant.rows[0].material_id;

      // Check for duplicate variant name (excluding current variant)
      const checkDup = await pool.query(
        "SELECT id FROM material_variants WHERE material_id = $1 AND variant_name = $2 AND id != $3",
        [materialId, variant_name.trim(), variantId]
      );
      if (checkDup.rows.length > 0) {
        return res.status(409).json({
          message: `Variant '${variant_name}' already exists for this material`,
        });
      }

      const updateQuery = `
        UPDATE material_variants
        SET variant_name = $1,
            default_unit_cost = $2,
            sort_order = $3,
            is_active = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `;

      const result = await pool.query(updateQuery, [
        variant_name.trim(),
        default_unit_cost || 0,
        sort_order || 0,
        is_active !== false,
        variantId,
      ]);

      res.json({
        message: "Variant updated successfully",
        variant: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating variant:", error);
      res.status(500).json({
        message: "Error updating variant",
        error: error.message,
      });
    }
  });

  // DELETE /variants/:variantId - Delete a variant (soft delete by default)
  router.delete("/variants/:variantId", async (req, res) => {
    const { variantId } = req.params;
    const { hard } = req.query;
    const isHardDelete = hard === "true";

    try {
      // Check if variant exists
      const checkVariant = await pool.query(
        "SELECT id, variant_name, is_active FROM material_variants WHERE id = $1",
        [variantId]
      );
      if (checkVariant.rows.length === 0) {
        return res.status(404).json({ message: "Variant not found" });
      }

      if (isHardDelete && checkVariant.rows[0].is_active) {
        return res.status(400).json({
          message: "Deactivate this variant before deleting it permanently.",
        });
      }

      if (isHardDelete) {
        const purchaseLineQuery = "SELECT COUNT(*) as count FROM purchase_invoice_lines WHERE variant_id = $1";
        const purchaseLineResult = await pool.query(purchaseLineQuery, [variantId]);
        const purchaseLineCount = parseInt(purchaseLineResult.rows[0].count, 10);

        if (purchaseLineCount > 0) {
          return res.status(400).json({
            message: "Cannot permanently delete variant because it is used in purchase invoices.",
          });
        }

        // Hard delete variant and its manual stock rows. Purchase invoice lines remain protected.
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const stockDeleteResult = await client.query(
            "DELETE FROM material_stock_entries WHERE variant_id = $1",
            [variantId]
          );
          const deleteQuery = "DELETE FROM material_variants WHERE id = $1 RETURNING id, variant_name";
          const result = await client.query(deleteQuery, [variantId]);
          await client.query("COMMIT");

          res.json({
            message: "Variant deleted permanently",
            variant: result.rows[0],
            deleted_stock_entries: stockDeleteResult.rowCount,
          });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      } else {
        // Soft delete
        const updateQuery = `
          UPDATE material_variants
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, variant_name, is_active
        `;
        const result = await pool.query(updateQuery, [variantId]);
        res.json({
          message: "Variant deactivated successfully",
          variant: result.rows[0],
        });
      }
    } catch (error) {
      console.error("Error deleting variant:", error);
      res.status(500).json({
        message: "Error deleting variant",
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
          id, code, name, category,
          default_unit_cost, applies_to, sort_order,
          is_active, created_at, updated_at, created_by
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
      default_unit_cost,
      applies_to,
      sort_order,
    } = req.body;

    if (!code || !name || !category) {
      return res.status(400).json({
        message: "Code, name, and category are required",
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
          code, name, category,
          default_unit_cost, applies_to, sort_order, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        code.toUpperCase().trim(),
        name.trim(),
        category,
        default_unit_cost || 0,
        applies_to || "both",
        sort_order || 0,
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
      default_unit_cost,
      applies_to,
      sort_order,
      is_active,
    } = req.body;

    if (!name || !category) {
      return res.status(400).json({
        message: "Name and category are required",
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
          default_unit_cost = $4,
          applies_to = $5,
          sort_order = $6,
          is_active = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *
      `;

      const values = [
        code ? code.toUpperCase().trim() : null,
        name.trim(),
        category,
        default_unit_cost || 0,
        applies_to || "both",
        sort_order || 0,
        is_active !== false,
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
    const isHardDelete = hard === "true";

    try {
      // Check if material exists
      const checkQuery = "SELECT id, code, is_active FROM materials WHERE id = $1";
      const checkResult = await pool.query(checkQuery, [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          message: "Material not found",
        });
      }

      if (isHardDelete && checkResult.rows[0].is_active) {
        return res.status(400).json({
          message: "Deactivate this material before deleting it permanently.",
        });
      }

      if (isHardDelete) {
        const purchaseLineQuery = `
          SELECT COUNT(*) as count
          FROM purchase_invoice_lines
          WHERE material_id = $1
             OR variant_id IN (
               SELECT id FROM material_variants WHERE material_id = $1
             )
        `;
        const purchaseLineResult = await pool.query(purchaseLineQuery, [id]);
        const purchaseLineCount = parseInt(purchaseLineResult.rows[0].count, 10);

        if (purchaseLineCount > 0) {
          return res.status(400).json({
            message: "Cannot permanently delete material because it is used in purchase invoices.",
          });
        }

        // Hard delete material, variants, and manual stock rows. Purchase invoice lines remain protected.
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const stockDeleteResult = await client.query(
            "DELETE FROM material_stock_entries WHERE material_id = $1",
            [id]
          );
          const variantDeleteResult = await client.query(
            "DELETE FROM material_variants WHERE material_id = $1",
            [id]
          );
          const deleteQuery = "DELETE FROM materials WHERE id = $1 RETURNING id, code";
          const result = await client.query(deleteQuery, [id]);
          await client.query("COMMIT");

          res.json({
            message: "Material deleted permanently",
            material: result.rows[0],
            deleted_stock_entries: stockDeleteResult.rowCount,
            deleted_variants: variantDeleteResult.rowCount,
          });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
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
