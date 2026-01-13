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
          m.category as material_category
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

  // GET /stock/with-opening - Get all materials with their stock data for a period
  // REDESIGNED: Returns opening (from prev month), purchases, consumption, closing
  // VARIANT SUPPORT: Materials with variants return multiple rows, one per variant
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
          m.id, m.code, m.name, m.category,
          m.default_unit_cost, m.applies_to, m.sort_order
        FROM materials m
        WHERE m.is_active = true
          AND (m.applies_to = $1 OR m.applies_to = 'both')
        ORDER BY m.sort_order, m.category, m.name
      `;
      const materials = await pool.query(materialsQuery, [product_line]);

      // Get all active variants for these materials
      const variantsQuery = `
        SELECT id, material_id, variant_name, default_unit_cost, sort_order
        FROM material_variants
        WHERE material_id = ANY($1) AND is_active = true
        ORDER BY material_id, sort_order, variant_name
      `;
      const materialIds = materials.rows.map(m => m.id);
      const variantsResult = await pool.query(variantsQuery, [materialIds]);

      // Group variants by material_id
      const variantsByMaterial = new Map();
      variantsResult.rows.forEach(v => {
        if (!variantsByMaterial.has(v.material_id)) {
          variantsByMaterial.set(v.material_id, []);
        }
        variantsByMaterial.get(v.material_id).push(v);
      });

      // Get previous month's closing_quantity (this month's opening)
      // Now keyed by (material_id, variant_id, custom_description)
      const openingQuery = `
        SELECT material_id, variant_id, custom_description, closing_quantity, unit_cost
        FROM material_stock_entries
        WHERE year = $1 AND month = $2 AND product_line = $3
      `;
      const openingResult = await pool.query(openingQuery, [prevYear, prevMonth, product_line]);

      // Create opening map keyed by "materialId_variantId_customDesc"
      const openingMap = new Map();
      openingResult.rows.forEach(r => {
        const key = `${r.material_id}_${r.variant_id || ''}_${r.custom_description || ''}`;
        openingMap.set(key, r);
      });

      // Get current month's entries (if exist)
      const currentQuery = `
        SELECT id, material_id, variant_id, custom_name, custom_description,
               opening_quantity, purchases_quantity, consumption_quantity, closing_quantity,
               unit_cost, opening_value, purchases_value, closing_value, notes
        FROM material_stock_entries
        WHERE year = $1 AND month = $2 AND product_line = $3
      `;
      const currentResult = await pool.query(currentQuery, [parseInt(year), parseInt(month), product_line]);

      // Create current map keyed by "materialId_variantId_customDesc"
      const currentMap = new Map();
      currentResult.rows.forEach(r => {
        const key = `${r.material_id}_${r.variant_id || ''}_${r.custom_description || ''}`;
        currentMap.set(key, r);
      });

      // Combine data - now handling variants
      const data = materials.rows.map(m => {
        const variants = variantsByMaterial.get(m.id) || [];
        const hasVariants = variants.length > 0;

        // Build variant rows (from registered variants + ad-hoc from current entries)
        const variantRows = [];

        if (hasVariants) {
          // Add registered variants
          variants.forEach(v => {
            const key = `${m.id}_${v.id}_`;
            const prevEntry = openingMap.get(key);
            const current = currentMap.get(key);

            const openingQty = parseFloat(prevEntry?.closing_quantity) || 0;
            const unitCost = parseFloat(current?.unit_cost) || parseFloat(v.default_unit_cost) || parseFloat(m.default_unit_cost) || 0;
            const openingValue = openingQty * unitCost;
            const purchasesQty = parseFloat(current?.purchases_quantity) || 0;
            const consumptionQty = parseFloat(current?.consumption_quantity) || 0;
            const closingQty = openingQty + purchasesQty - consumptionQty;

            variantRows.push({
              entry_id: current?.id || null,
              variant_id: v.id,
              variant_name: v.variant_name,
              is_new_variant: false,
              opening_quantity: openingQty,
              opening_value: openingValue,
              purchases_quantity: purchasesQty,
              purchases_value: purchasesQty * unitCost,
              consumption_quantity: consumptionQty,
              closing_quantity: closingQty,
              closing_value: closingQty * unitCost,
              unit_cost: unitCost,
              notes: current?.notes || null,
            });
          });

          // Add any ad-hoc entries (variant_id=NULL but custom_description exists)
          currentResult.rows
            .filter(r => r.material_id === m.id && !r.variant_id && r.custom_description)
            .forEach(current => {
              const key = `${m.id}__${current.custom_description}`;
              const prevEntry = openingMap.get(key);

              const openingQty = parseFloat(prevEntry?.closing_quantity) || 0;
              const unitCost = parseFloat(current.unit_cost) || parseFloat(m.default_unit_cost) || 0;
              const purchasesQty = parseFloat(current.purchases_quantity) || 0;
              const consumptionQty = parseFloat(current.consumption_quantity) || 0;
              const closingQty = openingQty + purchasesQty - consumptionQty;

              variantRows.push({
                entry_id: current.id,
                variant_id: null,
                variant_name: current.custom_description,
                is_new_variant: false, // It's saved but not registered
                opening_quantity: openingQty,
                opening_value: openingQty * unitCost,
                purchases_quantity: purchasesQty,
                purchases_value: purchasesQty * unitCost,
                consumption_quantity: consumptionQty,
                closing_quantity: closingQty,
                closing_value: closingQty * unitCost,
                unit_cost: unitCost,
                notes: current.notes || null,
              });
            });

          // Also check previous month for ad-hoc entries that don't have current entries
          openingResult.rows
            .filter(r => r.material_id === m.id && !r.variant_id && r.custom_description)
            .forEach(prevEntry => {
              // Check if we already have this entry
              const alreadyExists = variantRows.some(
                vr => !vr.variant_id && vr.variant_name === prevEntry.custom_description
              );
              if (!alreadyExists) {
                const openingQty = parseFloat(prevEntry.closing_quantity) || 0;
                const unitCost = parseFloat(prevEntry.unit_cost) || parseFloat(m.default_unit_cost) || 0;

                variantRows.push({
                  entry_id: null,
                  variant_id: null,
                  variant_name: prevEntry.custom_description,
                  is_new_variant: false,
                  opening_quantity: openingQty,
                  opening_value: openingQty * unitCost,
                  purchases_quantity: 0,
                  purchases_value: 0,
                  consumption_quantity: 0,
                  closing_quantity: openingQty,
                  closing_value: openingQty * unitCost,
                  unit_cost: unitCost,
                  notes: null,
                });
              }
            });
        }

        // For materials without variants OR as default single entry
        // Get the "default" entry (variant_id=NULL, custom_description=NULL)
        const defaultKey = `${m.id}__`;
        const prevEntry = openingMap.get(defaultKey);
        const current = currentMap.get(defaultKey);

        const openingQty = parseFloat(prevEntry?.closing_quantity) || 0;
        const unitCost = parseFloat(current?.unit_cost) || parseFloat(m.default_unit_cost) || 0;
        const openingValue = openingQty * unitCost;
        const purchasesQty = parseFloat(current?.purchases_quantity) || 0;
        const consumptionQty = parseFloat(current?.consumption_quantity) || 0;
        const closingQty = openingQty + purchasesQty - consumptionQty;
        const purchasesValue = purchasesQty * unitCost;
        const closingValue = closingQty * unitCost;

        return {
          ...m,
          default_unit_cost: parseFloat(m.default_unit_cost) || 0,
          // Indicates if this material has registered variants
          has_variants: hasVariants,
          // Variant rows (only populated if has_variants)
          variants: hasVariants ? variantRows : [],
          // Default entry data (for materials without variants OR as subtotal header)
          opening_quantity: hasVariants ? variantRows.reduce((sum, v) => sum + v.opening_quantity, 0) : openingQty,
          opening_value: hasVariants ? variantRows.reduce((sum, v) => sum + v.opening_value, 0) : openingValue,
          purchases_quantity: hasVariants ? variantRows.reduce((sum, v) => sum + v.purchases_quantity, 0) : purchasesQty,
          purchases_value: hasVariants ? variantRows.reduce((sum, v) => sum + v.purchases_value, 0) : purchasesValue,
          consumption_quantity: hasVariants ? variantRows.reduce((sum, v) => sum + v.consumption_quantity, 0) : consumptionQty,
          closing_quantity: hasVariants ? variantRows.reduce((sum, v) => sum + v.closing_quantity, 0) : closingQty,
          closing_value: hasVariants ? variantRows.reduce((sum, v) => sum + v.closing_value, 0) : closingValue,
          // Per-entry customization (only for non-variant materials)
          custom_name: hasVariants ? null : (current?.custom_name || null),
          custom_description: hasVariants ? null : (current?.custom_description || null),
          // Entry metadata
          closing_id: hasVariants ? null : (current?.id || null),
          unit_cost: hasVariants ? 0 : unitCost,
          closing_notes: hasVariants ? null : (current?.notes || null),
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
  // VARIANT SUPPORT: Now handles variant_id and register_variant flag
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

      // Calculate previous month for opening quantities
      let prevYear = parseInt(year);
      let prevMonth = parseInt(month) - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }

      // Get previous month's closing quantities (keyed by material_id_variantId_customDesc)
      const openingQuery = `
        SELECT material_id, variant_id, custom_description, closing_quantity
        FROM material_stock_entries
        WHERE year = $1 AND month = $2 AND product_line = $3
      `;
      const openingResult = await client.query(openingQuery, [prevYear, prevMonth, product_line]);
      const openingMap = new Map();
      openingResult.rows.forEach(r => {
        const key = `${r.material_id}_${r.variant_id || ''}_${r.custom_description || ''}`;
        openingMap.set(key, parseFloat(r.closing_quantity) || 0);
      });

      let upsertedCount = 0;
      let deletedCount = 0;
      let registeredVariants = [];

      for (const entry of entries) {
        const {
          material_id,
          variant_id,
          purchases_quantity,
          consumption_quantity,
          unit_cost,
          custom_name,
          custom_description,
          notes,
          register_variant
        } = entry;

        if (!material_id) continue;

        const purchasesQty = parseFloat(purchases_quantity) || 0;
        const consumptionQty = parseFloat(consumption_quantity) || 0;
        const cost = parseFloat(unit_cost) || 0;

        // Determine the variant identifier
        let finalVariantId = variant_id || null;
        let finalCustomDescription = custom_description?.trim() || null;

        // If register_variant is true and we have a custom_description, create a new variant
        if (register_variant && finalCustomDescription && !finalVariantId) {
          // Check if variant already exists
          const existingVariant = await client.query(
            "SELECT id FROM material_variants WHERE material_id = $1 AND variant_name = $2",
            [material_id, finalCustomDescription]
          );

          if (existingVariant.rows.length > 0) {
            finalVariantId = existingVariant.rows[0].id;
            finalCustomDescription = null; // Use the registered variant instead
          } else {
            // Create new variant
            const newVariant = await client.query(
              `INSERT INTO material_variants (material_id, variant_name, default_unit_cost)
               VALUES ($1, $2, $3) RETURNING id, variant_name`,
              [material_id, finalCustomDescription, cost]
            );
            finalVariantId = newVariant.rows[0].id;
            registeredVariants.push(newVariant.rows[0]);
            finalCustomDescription = null; // Now it's a registered variant
          }
        }

        // Build the key for opening lookup
        const openingKey = `${material_id}_${finalVariantId || ''}_${finalCustomDescription || ''}`;
        const openingQty = openingMap.get(openingKey) || 0;

        // Calculate values
        const openingValue = openingQty * cost;
        const purchasesValue = purchasesQty * cost;
        const closingQty = openingQty + purchasesQty - consumptionQty;
        const closingValue = closingQty * cost;

        // Check if we should delete (all values empty/zero and no opening)
        const shouldDelete = purchasesQty === 0 && consumptionQty === 0 && cost === 0 &&
                             openingQty === 0 && !custom_name && !finalCustomDescription;

        if (shouldDelete) {
          // Delete entry if all values are zero/empty
          const deleteQuery = `
            DELETE FROM material_stock_entries
            WHERE year = $1 AND month = $2 AND material_id = $3 AND product_line = $4
              AND COALESCE(variant_id::text, custom_description, 'default') = $5
          `;
          const conflictKey = finalVariantId ? String(finalVariantId) : (finalCustomDescription || 'default');
          const deleteResult = await client.query(deleteQuery, [
            parseInt(year),
            parseInt(month),
            material_id,
            product_line,
            conflictKey,
          ]);
          if (deleteResult.rowCount > 0) deletedCount++;
        } else {
          // Upsert entry with variant support
          // The unique constraint is: (year, month, material_id, product_line, COALESCE(variant_id::text, custom_description, 'default'))
          const upsertQuery = `
            INSERT INTO material_stock_entries (
              year, month, material_id, product_line, variant_id,
              custom_name, custom_description,
              opening_quantity, purchases_quantity, consumption_quantity,
              unit_cost, opening_value, purchases_value, closing_value,
              notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (year, month, material_id, product_line, COALESCE(variant_id::text, custom_description, 'default'))
            DO UPDATE SET
              custom_name = EXCLUDED.custom_name,
              custom_description = EXCLUDED.custom_description,
              opening_quantity = EXCLUDED.opening_quantity,
              purchases_quantity = EXCLUDED.purchases_quantity,
              consumption_quantity = EXCLUDED.consumption_quantity,
              unit_cost = EXCLUDED.unit_cost,
              opening_value = EXCLUDED.opening_value,
              purchases_value = EXCLUDED.purchases_value,
              closing_value = EXCLUDED.closing_value,
              notes = EXCLUDED.notes,
              updated_at = CURRENT_TIMESTAMP
            RETURNING id
          `;

          await client.query(upsertQuery, [
            parseInt(year),
            parseInt(month),
            material_id,
            product_line,
            finalVariantId,
            custom_name?.trim() || null,
            finalCustomDescription,
            openingQty,
            purchasesQty,
            consumptionQty,
            cost,
            openingValue,
            purchasesValue,
            closingValue,
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

    try {
      // Check if variant exists
      const checkVariant = await pool.query(
        "SELECT id, variant_name FROM material_variants WHERE id = $1",
        [variantId]
      );
      if (checkVariant.rows.length === 0) {
        return res.status(404).json({ message: "Variant not found" });
      }

      // Check if variant has stock entries
      const stockQuery = "SELECT COUNT(*) as count FROM material_stock_entries WHERE variant_id = $1";
      const stockResult = await pool.query(stockQuery, [variantId]);

      if (parseInt(stockResult.rows[0].count) > 0 && hard === "true") {
        return res.status(400).json({
          message: "Cannot hard delete variant with stock entries. Use soft delete (deactivate) instead.",
        });
      }

      if (hard === "true") {
        // Hard delete (only if no stock entries)
        const deleteQuery = "DELETE FROM material_variants WHERE id = $1 RETURNING id, variant_name";
        const result = await pool.query(deleteQuery, [variantId]);
        res.json({
          message: "Variant deleted permanently",
          variant: result.rows[0],
        });
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
