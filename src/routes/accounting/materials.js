// src/routes/accounting/materials.js
import { Router } from "express";

export default function (pool) {
  const router = Router();
  const validStockBuckets = new Set(["mee", "bihun", "shared"]);
  const stockKilangProductTypes = new Map([
    ["mee", "MEE"],
    ["bihun", "BH"],
  ]);

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

  /**
   * Sum posted journal purchase amounts (debit - credit) for accounts mapped
   * to material stock records via material_account_mappings.
   * Returns rows shaped like the purchase_invoice_lines aggregates:
   * { material_id, variant_id, custom_description: null, quantity: 0, value }.
   * Journal lines carry no quantity, so these contribute value only.
   */
  async function getJournalPurchaseRows(productLine, { before, from, to }) {
    const conditions = ["je.status = 'posted'", "mam.is_active = true", "mam.product_line = $1"];
    const params = [productLine];

    if (before) {
      params.push(before);
      conditions.push(`je.entry_date < $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`je.entry_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`je.entry_date < $${params.length}`);
    }

    const result = await pool.query(
      `
        SELECT
          mam.material_id, mam.variant_id, NULL::text as custom_description,
          0 as quantity,
          SUM(jel.debit_amount - jel.credit_amount) as value
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        JOIN material_account_mappings mam ON mam.account_code = jel.account_code
        WHERE ${conditions.join(" AND ")}
        GROUP BY mam.material_id, mam.variant_id
      `,
      params
    );
    return result.rows;
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

  // ==================== ACCOUNT MAPPINGS ====================
  // Maps journal account codes (PUR/PM children like PU_BBER, PM_BPMS) to
  // material stock records so journal-keyed purchases feed the Material Stock page.
  // NOTE: These routes MUST be defined BEFORE /:id to prevent route conflicts

  // GET /account-mappings - Candidate purchase accounts with their current mappings
  router.get("/account-mappings", async (req, res) => {
    try {
      const query = `
        WITH RECURSIVE purchase_accounts AS (
          SELECT code, description FROM account_codes WHERE code IN ('PUR', 'PM')
          UNION ALL
          SELECT ac.code, ac.description
          FROM account_codes ac
          JOIN purchase_accounts pa ON ac.parent_code = pa.code
        ),
        candidates AS (
          SELECT code, description FROM purchase_accounts
          UNION
          SELECT ac.code, ac.description
          FROM account_codes ac
          WHERE ac.ledger_type = 'GL'
            AND ac.code IN (
              SELECT DISTINCT jel.account_code
              FROM journal_entry_lines jel
              JOIN journal_entries je ON je.id = jel.journal_entry_id
              WHERE je.entry_type = 'PUR' AND je.status = 'posted'
                AND jel.debit_amount > 0
            )
          UNION
          SELECT ac.code, ac.description
          FROM account_codes ac
          JOIN material_account_mappings mam ON mam.account_code = ac.code
        )
        SELECT
          c.code, c.description,
          mam.id as mapping_id, mam.material_id, mam.variant_id,
          mam.product_line, mam.is_active,
          m.code as material_code, m.name as material_name, m.applies_to,
          mv.variant_name,
          COALESCE(act.total_amount, 0) as total_amount,
          COALESCE(act.line_count, 0) as line_count,
          act.last_entry_date
        FROM candidates c
        LEFT JOIN material_account_mappings mam ON mam.account_code = c.code
        LEFT JOIN materials m ON m.id = mam.material_id
        LEFT JOIN material_variants mv ON mv.id = mam.variant_id
        LEFT JOIN LATERAL (
          SELECT
            SUM(jel.debit_amount - jel.credit_amount) as total_amount,
            COUNT(*) as line_count,
            MAX(je.entry_date) as last_entry_date
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_code = c.code AND je.status = 'posted'
        ) act ON true
        ORDER BY c.code
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching material account mappings:", error);
      res.status(500).json({
        message: "Error fetching material account mappings",
        error: error.message,
      });
    }
  });

  // POST /account-mappings/batch - Upsert/delete account-to-material mappings
  router.post("/account-mappings/batch", async (req, res) => {
    const { mappings } = req.body;

    if (!Array.isArray(mappings)) {
      return res.status(400).json({ message: "mappings must be an array" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let upserted = 0;
      let deleted = 0;

      for (const mapping of mappings) {
        const accountCode = mapping.account_code?.trim();
        if (!accountCode) continue;

        const materialId = mapping.material_id
          ? parseInt(mapping.material_id)
          : null;

        // No material selected = remove the mapping for this account
        if (!materialId) {
          const deleteResult = await client.query(
            "DELETE FROM material_account_mappings WHERE account_code = $1",
            [accountCode]
          );
          if (deleteResult.rowCount > 0) deleted++;
          continue;
        }

        const variantId = mapping.variant_id ? parseInt(mapping.variant_id) : null;
        const productLine = mapping.product_line;

        if (!validStockBuckets.has(productLine)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Stock bucket for '${accountCode}' must be one of: mee, bihun, shared`,
          });
        }

        const matResult = await client.query(
          "SELECT id, name, applies_to FROM materials WHERE id = $1",
          [materialId]
        );
        if (matResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Material '${materialId}' for account '${accountCode}' does not exist`,
          });
        }

        const appliesTo = matResult.rows[0].applies_to;
        const bucketCompatible =
          productLine === "shared"
            ? appliesTo === "both"
            : appliesTo === productLine || appliesTo === "both";
        if (!bucketCompatible) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Material '${matResult.rows[0].name}' cannot be assigned to stock bucket '${productLine}'`,
          });
        }

        if (variantId) {
          const variantResult = await client.query(
            "SELECT id FROM material_variants WHERE id = $1 AND material_id = $2",
            [variantId, materialId]
          );
          if (variantResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: `Variant '${variantId}' does not belong to material '${materialId}'`,
            });
          }
        }

        await client.query(
          `
            INSERT INTO material_account_mappings (
              account_code, material_id, variant_id, product_line, is_active, created_by
            ) VALUES ($1, $2, $3, $4, true, $5)
            ON CONFLICT (account_code)
            DO UPDATE SET
              material_id = EXCLUDED.material_id,
              variant_id = EXCLUDED.variant_id,
              product_line = EXCLUDED.product_line,
              is_active = true,
              updated_at = CURRENT_TIMESTAMP
          `,
          [accountCode, materialId, variantId, productLine, req.staffId || null]
        );
        upserted++;
      }

      await client.query("COMMIT");
      res.json({
        message: "Account mappings saved successfully",
        upserted,
        deleted,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving material account mappings:", error);
      res.status(500).json({
        message: "Error saving material account mappings",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // ==================== STOCK ENTRIES ====================
  // NOTE: These routes MUST be defined BEFORE /:id to prevent route conflicts

  // GET /stock-kilang - Get isolated monthly finished-goods costing entries.
  // These records intentionally do not read from or write to operational product stock.
  router.get("/stock-kilang", async (req, res) => {
    try {
      const { year, month, product_line } = req.query;
      const yearNumber = Number(year);
      const monthNumber = Number(month);

      if (
        !Number.isInteger(yearNumber) ||
        !Number.isInteger(monthNumber) ||
        monthNumber < 1 ||
        monthNumber > 12 ||
        !stockKilangProductTypes.has(product_line)
      ) {
        return res.status(400).json({
          message: "Valid year, month, and product_line (mee or bihun) are required",
        });
      }

      const result = await pool.query(
        `
          SELECT product_id, quantity, unit_cost, stock_value
          FROM material_stock_kilang_entries
          WHERE year = $1 AND month = $2 AND product_line = $3
          ORDER BY product_id
        `,
        [yearNumber, monthNumber, product_line]
      );

      res.json({
        year: yearNumber,
        month: monthNumber,
        product_line,
        entries: result.rows,
      });
    } catch (error) {
      console.error("Error fetching Stock Kilang costing entries:", error);
      res.status(500).json({
        message: "Error fetching Stock Kilang costing entries",
        error: error.message,
      });
    }
  });

  // PUT /stock-kilang/product - Save one monthly finished-goods costing row.
  router.put("/stock-kilang/product", async (req, res) => {
    try {
      const { year, month, product_line, product_id, quantity, unit_cost } = req.body;
      const yearNumber = Number(year);
      const monthNumber = Number(month);
      const quantityNumber = Number(quantity);
      const unitCostNumber = Number(unit_cost);
      const expectedProductType = stockKilangProductTypes.get(product_line);

      if (
        !Number.isInteger(yearNumber) ||
        !Number.isInteger(monthNumber) ||
        monthNumber < 1 ||
        monthNumber > 12 ||
        !expectedProductType ||
        !product_id ||
        !Number.isFinite(quantityNumber) ||
        !Number.isFinite(unitCostNumber) ||
        unitCostNumber < 0
      ) {
        return res.status(400).json({
          message:
            "Valid year, month, product_line, product_id, quantity, and unit_cost are required",
        });
      }

      const productResult = await pool.query(
        "SELECT id, type, price_per_unit FROM products WHERE id = $1",
        [product_id]
      );
      const product = productResult.rows[0];

      if (!product || product.type !== expectedProductType) {
        return res.status(400).json({
          message: `Product must be a ${expectedProductType} product`,
        });
      }

      // A zero-quantity row is only cleared when its unit cost is back at the
      // product default; a non-default price is a deliberate override we keep.
      const defaultCostCents = Math.round(Number(product.price_per_unit) * 100);
      const unitCostCents = Math.round(unitCostNumber * 100);

      if (quantityNumber === 0 && unitCostCents === defaultCostCents) {
        await pool.query(
          `
            DELETE FROM material_stock_kilang_entries
            WHERE year = $1 AND month = $2 AND product_line = $3 AND product_id = $4
          `,
          [yearNumber, monthNumber, product_line, product_id]
        );

        return res.json({
          message: "Stock Kilang costing entry cleared",
          entry: null,
        });
      }

      const stockValue = quantityNumber * unitCostNumber;
      const result = await pool.query(
        `
          INSERT INTO material_stock_kilang_entries (
            year, month, product_line, product_id, quantity,
            unit_cost, stock_value, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          ON CONFLICT (year, month, product_line, product_id)
          DO UPDATE SET
            quantity = EXCLUDED.quantity,
            unit_cost = EXCLUDED.unit_cost,
            stock_value = EXCLUDED.stock_value,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = EXCLUDED.updated_by
          RETURNING product_id, quantity, unit_cost, stock_value
        `,
        [
          yearNumber,
          monthNumber,
          product_line,
          product_id,
          quantityNumber,
          unitCostNumber,
          stockValue,
          req.staffId || null,
        ]
      );

      res.json({
        message: "Stock Kilang costing entry saved",
        entry: result.rows[0],
      });
    } catch (error) {
      console.error("Error saving Stock Kilang costing entry:", error);
      res.status(500).json({
        message: "Error saving Stock Kilang costing entry",
        error: error.message,
      });
    }
  });

  // POST /stock-kilang/batch - Replace all rows for one month/product line.
  router.post("/stock-kilang/batch", async (req, res) => {
    const client = await pool.connect();

    try {
      const { year, month, product_line, entries } = req.body;
      const yearNumber = Number(year);
      const monthNumber = Number(month);
      const expectedProductType = stockKilangProductTypes.get(product_line);

      if (
        !Number.isInteger(yearNumber) ||
        !Number.isInteger(monthNumber) ||
        monthNumber < 1 ||
        monthNumber > 12 ||
        !expectedProductType ||
        !Array.isArray(entries)
      ) {
        return res.status(400).json({
          message: "Valid year, month, product_line, and entries array are required",
        });
      }

      const normalizedEntries = entries.map((entry) => ({
        product_id: entry.product_id,
        quantity: Number(entry.quantity),
        unit_cost: Number(entry.unit_cost),
      }));

      if (
        normalizedEntries.some(
          (entry) =>
            !entry.product_id ||
            !Number.isFinite(entry.quantity) ||
            !Number.isFinite(entry.unit_cost) ||
            entry.unit_cost < 0
        )
      ) {
        return res.status(400).json({
          message: "Every Stock Kilang entry must have a valid product, quantity, and unit cost",
        });
      }

      const productIds = [...new Set(normalizedEntries.map((entry) => entry.product_id))];
      const productsResult = productIds.length
        ? await client.query(
            "SELECT id, type, price_per_unit FROM products WHERE id = ANY($1::varchar[])",
            [productIds]
          )
        : { rows: [] };
      const productTypes = new Map(
        productsResult.rows.map((product) => [product.id, product.type])
      );
      const productDefaultCostCents = new Map(
        productsResult.rows.map((product) => [
          product.id,
          Math.round(Number(product.price_per_unit) * 100),
        ])
      );

      if (
        normalizedEntries.some(
          (entry) => productTypes.get(entry.product_id) !== expectedProductType
        )
      ) {
        return res.status(400).json({
          message: `Every product must be a ${expectedProductType} product`,
        });
      }

      await client.query("BEGIN");
      await client.query(
        `
          DELETE FROM material_stock_kilang_entries
          WHERE year = $1 AND month = $2 AND product_line = $3
            AND product_id IN (
              SELECT id FROM products WHERE type = $4 AND is_active = true
            )
        `,
        [yearNumber, monthNumber, product_line, expectedProductType]
      );

      let savedCount = 0;
      for (const entry of normalizedEntries) {
        // Keep a zero-quantity row only when it carries a non-default price
        // override; a default-priced empty row has nothing worth storing.
        const unitCostCents = Math.round(entry.unit_cost * 100);
        const defaultCostCents = productDefaultCostCents.get(entry.product_id);
        if (entry.quantity === 0 && unitCostCents === defaultCostCents) continue;

        await client.query(
          `
            INSERT INTO material_stock_kilang_entries (
              year, month, product_line, product_id, quantity,
              unit_cost, stock_value, created_by, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          `,
          [
            yearNumber,
            monthNumber,
            product_line,
            entry.product_id,
            entry.quantity,
            entry.unit_cost,
            entry.quantity * entry.unit_cost,
            req.staffId || null,
          ]
        );
        savedCount += 1;
      }

      await client.query("COMMIT");
      res.json({
        message: "Stock Kilang costing entries saved",
        saved: savedCount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving Stock Kilang costing entries:", error);
      res.status(500).json({
        message: "Error saving Stock Kilang costing entries",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

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

      const journalPurchaseRows = (
        await getJournalPurchaseRows(product_line, { before: periodStart })
      ).map((row) => ({
        ...row,
        opening_quantity: 0,
        opening_value: row.value,
      }));

      res.json({
        period: { year: currentYear, month: currentMonth },
        opening_balances: [
          ...purchasesResult.rows,
          ...adjustmentsResult.rows,
          ...journalPurchaseRows,
        ],
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

      const openingJournalPurchases = await getJournalPurchaseRows(product_line, {
        before: periodStart,
      });

      const currentJournalPurchases = await getJournalPurchaseRows(product_line, {
        from: periodStart,
        to: nextPeriodStart,
      });

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

      const openingPurchaseMap = accumulateRows(
        [...openingPurchases.rows, ...openingJournalPurchases],
        "quantity",
        "value"
      );
      const currentPurchaseMap = accumulateRows(
        [...currentPurchases.rows, ...currentJournalPurchases],
        "quantity",
        "value"
      );
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
          sort_order: variant?.sort_order ?? null,
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
            "SELECT id, variant_name, sort_order FROM material_variants WHERE material_id = $1 AND variant_name = $2",
            [material_id, finalCustomDescription]
          );

          if (existingVariant.rows.length > 0) {
            finalVariantId = existingVariant.rows[0].id;
            registeredVariants.push(existingVariant.rows[0]);
            finalCustomDescription = null;
          } else {
            const nextSortOrder = await client.query(
              "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM material_variants WHERE material_id = $1",
              [material_id]
            );
            const newVariant = await client.query(
              `INSERT INTO material_variants (material_id, variant_name, default_unit_cost, sort_order)
               VALUES ($1, $2, $3, $4) RETURNING id, variant_name, sort_order`,
              [
                material_id,
                finalCustomDescription,
                cost,
                nextSortOrder.rows[0].next_sort_order,
              ]
            );
            finalVariantId = newVariant.rows[0].id;
            registeredVariants.push(newVariant.rows[0]);
            finalCustomDescription = null;
          }
        }

        const conflictKey = finalVariantId ? String(finalVariantId) : (finalCustomDescription || "default");
        const shouldDelete = adjustmentQty === 0 && !custom_name && !notes?.trim();

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

  // PUT /order - Persist material display order within one category
  router.put("/order", async (req, res) => {
    const { category, material_ids } = req.body;
    const validCategories = ["ingredient", "raw_material", "packing_material"];

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        message: `category must be one of: ${validCategories.join(", ")}`,
      });
    }

    if (!Array.isArray(material_ids)) {
      return res.status(400).json({
        message: "material_ids array is required",
      });
    }

    const seen = new Set();
    const normalizedMaterialIds = material_ids
      .map((materialId) => parseInt(materialId, 10))
      .filter((materialId) => Number.isInteger(materialId) && materialId > 0)
      .filter((materialId) => {
        if (seen.has(materialId)) return false;
        seen.add(materialId);
        return true;
      });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const [index, materialId] of normalizedMaterialIds.entries()) {
        await client.query(
          `UPDATE materials
           SET sort_order = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND category = $3 AND is_active = true`,
          [index + 1, materialId, category]
        );
      }

      await client.query("COMMIT");
      res.json({
        message: "Material order saved",
        category,
        material_ids: normalizedMaterialIds,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving material order:", error);
      res.status(500).json({
        message: "Error saving material order",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

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

  // PUT /:id/variants/order - Persist registered variant order for a material
  router.put("/:id/variants/order", async (req, res) => {
    const { id } = req.params;
    const { variant_ids } = req.body;

    if (!Array.isArray(variant_ids)) {
      return res.status(400).json({
        message: "variant_ids array is required",
      });
    }

    const seen = new Set();
    const normalizedVariantIds = variant_ids
      .map((variantId) => parseInt(variantId, 10))
      .filter((variantId) => Number.isInteger(variantId) && variantId > 0)
      .filter((variantId) => {
        if (seen.has(variantId)) return false;
        seen.add(variantId);
        return true;
      });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const [index, variantId] of normalizedVariantIds.entries()) {
        await client.query(
          `UPDATE material_variants
           SET sort_order = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND material_id = $3 AND is_active = true`,
          [index + 1, variantId, id]
        );
      }

      await client.query("COMMIT");
      res.json({
        message: "Variant order saved",
        material_id: parseInt(id, 10),
        variant_ids: normalizedVariantIds,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving variant order:", error);
      res.status(500).json({
        message: "Error saving variant order",
        error: error.message,
      });
    } finally {
      client.release();
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

    try {
      // Check if variant exists
      const checkVariant = await pool.query(
        "SELECT id, material_id, variant_name, default_unit_cost, sort_order, is_active FROM material_variants WHERE id = $1",
        [variantId]
      );
      if (checkVariant.rows.length === 0) {
        return res.status(404).json({ message: "Variant not found" });
      }

      const existingVariant = checkVariant.rows[0];
      const materialId = existingVariant.material_id;
      const nextVariantName =
        typeof variant_name === "string"
          ? variant_name.trim()
          : existingVariant.variant_name;

      if (!nextVariantName) {
        return res.status(400).json({
          message: "Variant name is required",
        });
      }

      // Check for duplicate variant name (excluding current variant)
      const checkDup = await pool.query(
        "SELECT id FROM material_variants WHERE material_id = $1 AND variant_name = $2 AND id != $3",
        [materialId, nextVariantName, variantId]
      );
      if (checkDup.rows.length > 0) {
        return res.status(409).json({
          message: `Variant '${nextVariantName}' already exists for this material`,
        });
      }

      const nextDefaultUnitCost =
        default_unit_cost === undefined
          ? existingVariant.default_unit_cost
          : default_unit_cost || 0;
      const nextSortOrder =
        sort_order === undefined ? existingVariant.sort_order : sort_order || 0;
      const nextIsActive =
        is_active === undefined ? existingVariant.is_active : is_active !== false;

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
        nextVariantName,
        nextDefaultUnitCost,
        nextSortOrder,
        nextIsActive,
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
