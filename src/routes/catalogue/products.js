// src/routes/catalogue/products.js
import { Router } from "express";
import cache, { CACHE_TTL, CACHE_KEYS } from "../utils/memory-cache.js";

/** Client error thrown while validating the /with-paycode-setup payload. */
class SetupValidationError extends Error {}

export default function (pool) {
  const router = Router();

  const PRODUCT_TYPES = new Set(["MEE", "BH", "RAMEN", "BUNDLE", "JP", "OTH"]);
  const PAY_CODE_SCOPES = {
    tienhock: {
      payCodes: "public.pay_codes",
      productPayCodes: "public.product_pay_codes",
      jobPayCodes: "public.job_pay_codes",
      employeePayCodes: "public.employee_pay_codes",
      payRateSchedules: "public.pay_rate_schedules",
      salesmanJobs: ["SALESMAN"],
    },
    jellypolly: {
      payCodes: "jellypolly.pay_codes",
      productPayCodes: "jellypolly.product_pay_codes",
      jobPayCodes: "jellypolly.job_pay_codes",
      employeePayCodes: "jellypolly.employee_pay_codes",
      payRateSchedules: "jellypolly.pay_rate_schedules",
      salesmanJobs: ["JP_SALESMAN", "JP_SALESMAN_IKUT"],
    },
  };
  const PAY_CODE_ROLES = new Set(["packing", "salesman", "ikut"]);
  const PAY_TYPES = new Set(["Base", "Tambahan", "Overtime"]);
  const RATE_UNITS = new Set([
    "Hour",
    "Bill",
    "Day",
    "Bag",
    "Ctn",
    "Trip",
    "Fixed",
    "Percent",
    "Tray",
    "Kg",
    "Karung",
    "Bundle",
    "PKT",
    "PCS",
  ]);
  const PRODUCTION_RATE_UNITS = new Set([
    "Bag",
    "Ctn",
    "Bundle",
    "PKT",
    "PCS",
    "Kg",
    "Karung",
  ]);
  const REPORT_COLUMNS = new Set(["GAJI", "OT", "BONUS", "CIO", "CUTI"]);
  const getScopeConfig = (scope) => PAY_CODE_SCOPES[scope] || null;

  const normalizeReportColumn = (value) => {
    if (value === undefined || value === null || value === "") return null;
    if (!REPORT_COLUMNS.has(value)) {
      throw new SetupValidationError(
        `Invalid report_column '${value}'. Must be GAJI, OT, BONUS, CIO, CUTI or empty`
      );
    }
    return value;
  };

  const normalizeRate = (value, fieldName) => {
    if (value === null) return null;
    if (value === undefined || value === "") return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new SetupValidationError(
        `${fieldName} must be a number greater than or equal to 0, or null`
      );
    }
    return parsed;
  };

  const normalizePayCodePayload = (payload, expectedId) => {
    if (!payload || typeof payload !== "object") {
      throw new SetupValidationError("pay_code is required");
    }
    const id = typeof payload.id === "string" ? payload.id.trim() : expectedId;
    const description =
      typeof payload.description === "string" ? payload.description.trim() : "";
    const payType = payload.pay_type;
    const rateUnit = payload.rate_unit;
    if (!id || id !== expectedId) {
      throw new SetupValidationError("Pay code ID is immutable and must match pay_code_id");
    }
    if (!description || !PAY_TYPES.has(payType) || !RATE_UNITS.has(rateUnit)) {
      throw new SetupValidationError(
        "Pay code description, pay_type and a supported rate_unit are required"
      );
    }
    return {
      id,
      description,
      pay_type: payType,
      rate_unit: rateUnit,
      rate_biasa: normalizeRate(payload.rate_biasa, "rate_biasa"),
      rate_ahad: normalizeRate(payload.rate_ahad, "rate_ahad"),
      rate_umum: normalizeRate(payload.rate_umum, "rate_umum"),
      is_active: payload.is_active === undefined ? true : !!payload.is_active,
      requires_units_input:
        payload.requires_units_input === undefined
          ? false
          : !!payload.requires_units_input,
      report_column: normalizeReportColumn(payload.report_column),
    };
  };

  const parsePayCodeRow = (row) => ({
    ...row,
    rate_biasa: Number(row.rate_biasa ?? 0),
    rate_ahad: Number(row.rate_ahad ?? 0),
    rate_umum: Number(row.rate_umum ?? 0),
    usage: {
      product_links: Number(row.usage?.product_links || 0),
      job_links: Number(row.usage?.job_links || 0),
      employee_links: Number(row.usage?.employee_links || 0),
      rate_schedules: Number(row.usage?.rate_schedules || 0),
      historical_records: Number(row.usage?.historical_records || 0),
    },
  });

  const invalidatePayCodeManagerCaches = () => {
    cache.invalidatePrefix(CACHE_KEYS.PRODUCTS);
    cache.invalidate(CACHE_KEYS.PAY_CODES);
    cache.invalidate(`jp:${CACHE_KEYS.PAY_CODES}`);
    cache.invalidate(CACHE_KEYS.JOBS);
    cache.invalidate(`jp:${CACHE_KEYS.JOBS}`);
  };

  const validatePackingCompatibility = (productType, rateUnit) => {
    if (!PRODUCTION_RATE_UNITS.has(rateUnit)) {
      throw new SetupValidationError("Packing pay codes must use a production rate unit");
    }
    if ((productType === "RAMEN") !== (rateUnit === "PKT")) {
      throw new SetupValidationError(
        "Product and packing pay code units are incompatible; RAMEN must use PKT and only RAMEN may use PKT"
      );
    }
  };

  const validateProductTypeAgainstPackingLinks = async (db, productId, productType) => {
    if (!PRODUCT_TYPES.has(productType)) {
      throw new SetupValidationError("Unsupported product type");
    }
    const result = await db.query(
      `SELECT pc.rate_unit
         FROM public.product_pay_codes ppc
         JOIN public.pay_codes pc ON pc.id = ppc.pay_code_id
        WHERE ppc.product_id = $1
       UNION ALL
       SELECT pc.rate_unit
         FROM jellypolly.product_pay_codes ppc
         JOIN jellypolly.pay_codes pc ON pc.id = ppc.pay_code_id
        WHERE ppc.product_id = $1`,
      [productId]
    );
    result.rows.forEach((row) => validatePackingCompatibility(productType, row.rate_unit));
  };

  const getProductPayCodeLinks = async (db, productId) => {
    const productResult = await db.query(
      `SELECT id, description, price_per_unit, type, tax, is_active, sort_order
         FROM public.products
        WHERE id = $1`,
      [productId]
    );
    if (productResult.rows.length === 0) return null;

    const publicResult = await db.query(
      `SELECT pc.*,
              COALESCE((
                SELECT array_agg(jpc.job_id ORDER BY jpc.job_id)
                  FROM public.job_pay_codes jpc
                 WHERE jpc.pay_code_id = pc.id
              ), ARRAY[]::varchar[]) AS job_ids,
              EXISTS (
                SELECT 1 FROM public.product_pay_codes ppc
                 WHERE ppc.product_id = $1 AND ppc.pay_code_id = pc.id
              ) AS packing_role,
              (
                pc.id = $1 AND EXISTS (
                  SELECT 1 FROM public.job_pay_codes jpc
                   WHERE jpc.pay_code_id = pc.id AND jpc.job_id = 'SALESMAN'
                )
              ) AS salesman_role,
              EXISTS (
                SELECT 1 FROM public.product_salesman_ikut_pay_codes ps
                 WHERE ps.product_id = $1 AND ps.pay_code_id = pc.id
              ) AS ikut_role,
              json_build_object(
                'product_links',
                  (SELECT COUNT(*) FROM public.product_pay_codes ppc WHERE ppc.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM public.product_salesman_ikut_pay_codes ps WHERE ps.pay_code_id = pc.id),
                'job_links',
                  (SELECT COUNT(*) FROM public.job_pay_codes jpc WHERE jpc.pay_code_id = pc.id),
                'employee_links',
                  (SELECT COUNT(*) FROM public.employee_pay_codes epc WHERE epc.pay_code_id = pc.id),
                'rate_schedules',
                  (SELECT COUNT(*) FROM public.pay_rate_schedules prs WHERE prs.pay_code_id = pc.id),
                'historical_records',
                  (SELECT COUNT(*) FROM public.payroll_items pi WHERE pi.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM public.daily_work_log_activities d WHERE d.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM public.monthly_work_log_activities m WHERE m.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM public.others_records o WHERE o.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM greentarget.payroll_items pi WHERE pi.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM greentarget.daily_lori_habuk_lines d WHERE d.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM greentarget.monthly_work_log_activities m WHERE m.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM greentarget.others_records o WHERE o.pay_code_id = pc.id)
              ) AS usage
         FROM public.pay_codes pc
        WHERE EXISTS (
                SELECT 1 FROM public.product_pay_codes ppc
                 WHERE ppc.product_id = $1 AND ppc.pay_code_id = pc.id
              )
           OR (
                pc.id = $1 AND EXISTS (
                  SELECT 1 FROM public.job_pay_codes jpc
                   WHERE jpc.pay_code_id = pc.id AND jpc.job_id = 'SALESMAN'
                )
              )
           OR EXISTS (
                SELECT 1 FROM public.product_salesman_ikut_pay_codes ps
                 WHERE ps.product_id = $1 AND ps.pay_code_id = pc.id
              )
        ORDER BY pc.id`,
      [productId]
    );

    const jellyPollyResult = await db.query(
      `SELECT pc.*,
              COALESCE((
                SELECT array_agg(jpc.job_id ORDER BY jpc.job_id)
                  FROM jellypolly.job_pay_codes jpc
                 WHERE jpc.pay_code_id = pc.id
              ), ARRAY[]::varchar[]) AS job_ids,
              EXISTS (
                SELECT 1 FROM jellypolly.product_pay_codes ppc
                 WHERE ppc.product_id = $1 AND ppc.pay_code_id = pc.id
              ) AS packing_role,
              (
                pc.id = $1 AND EXISTS (
                  SELECT 1 FROM jellypolly.job_pay_codes jpc
                   WHERE jpc.pay_code_id = pc.id
                     AND jpc.job_id IN ('JP_SALESMAN', 'JP_SALESMAN_IKUT')
                )
              ) AS salesman_role,
              false AS ikut_role,
              json_build_object(
                'product_links',
                  (SELECT COUNT(*) FROM jellypolly.product_pay_codes ppc WHERE ppc.pay_code_id = pc.id),
                'job_links',
                  (SELECT COUNT(*) FROM jellypolly.job_pay_codes jpc WHERE jpc.pay_code_id = pc.id),
                'employee_links',
                  (SELECT COUNT(*) FROM jellypolly.employee_pay_codes epc WHERE epc.pay_code_id = pc.id),
                'rate_schedules',
                  (SELECT COUNT(*) FROM jellypolly.pay_rate_schedules prs WHERE prs.pay_code_id = pc.id),
                'historical_records',
                  (SELECT COUNT(*) FROM jellypolly.payroll_items pi WHERE pi.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM jellypolly.daily_work_log_activities d WHERE d.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM jellypolly.monthly_work_log_activities m WHERE m.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM jellypolly.others_records o WHERE o.pay_code_id = pc.id) +
                  (SELECT COUNT(*) FROM jellypolly.production_entries pe WHERE pe.pay_code_id = pc.id)
              ) AS usage
         FROM jellypolly.pay_codes pc
        WHERE EXISTS (
                SELECT 1 FROM jellypolly.product_pay_codes ppc
                 WHERE ppc.product_id = $1 AND ppc.pay_code_id = pc.id
              )
           OR (
                pc.id = $1 AND EXISTS (
                  SELECT 1 FROM jellypolly.job_pay_codes jpc
                   WHERE jpc.pay_code_id = pc.id
                     AND jpc.job_id IN ('JP_SALESMAN', 'JP_SALESMAN_IKUT')
                )
              )
        ORDER BY pc.id`,
      [productId]
    );

    const toResponsePayCode = (scope, row) => {
      const roles = [];
      if (row.packing_role) roles.push("packing");
      if (row.salesman_role) roles.push("salesman");
      if (row.ikut_role) roles.push("ikut");
      const payCode = { ...row };
      delete payCode.packing_role;
      delete payCode.salesman_role;
      delete payCode.ikut_role;
      return parsePayCodeRow({ ...payCode, scope, roles });
    };

    const product = productResult.rows[0];
    return {
      product: {
        ...product,
        price_per_unit:
          product.price_per_unit === null ? null : Number(product.price_per_unit),
      },
      pay_codes: [
        ...publicResult.rows.map((row) => toResponsePayCode("tienhock", row)),
        ...jellyPollyResult.rows.map((row) =>
          toResponsePayCode("jellypolly", row)
        ),
      ],
    };
  };

  // Get products based on params
  router.get("/", async (req, res) => {
    try {
      // Check for specific type filters and includeInactive flag
      const { type, all, includeInactive } = req.query;
      const cacheKey = `${CACHE_KEYS.PRODUCTS}:${all !== undefined ? 'all' : type || 'default'}:${includeInactive === 'true' ? 'all' : 'active'}`;

      // Check cache first
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      let query;
      let whereClause = "";

      // Build WHERE clause for is_active filtering
      const activeFilter = includeInactive === 'true' ? '' : 'is_active = true';

      if (all !== undefined) {
        // Return all products with all columns /api/products?all
        whereClause = activeFilter ? `WHERE ${activeFilter}` : '';
        query = `SELECT * FROM products ${whereClause}`;
      } else if (type) {
        // Filter by specific type(s) /api/products?type=JP or /api/products?type=MEE,BH
        const types = type
          .split(",")
          .map((t) => `'${t.trim()}'`)
          .join(",");
        const typeFilter = `type IN (${types})`;
        whereClause = activeFilter
          ? `WHERE ${typeFilter} AND ${activeFilter}`
          : `WHERE ${typeFilter}`;
        query = `SELECT id, description, price_per_unit, type, is_active, sort_order FROM products ${whereClause}`;
      } else {
        // Keep the default response compatible with salesman app versions that
        // do not yet support the RAMEN product type. RAMEN remains available
        // through ?all and explicit filters such as ?type=RAMEN.
        const typeFilter = "type IN ('BH', 'MEE', 'JP')";
        whereClause = activeFilter
          ? `WHERE ${typeFilter} AND ${activeFilter}`
          : `WHERE ${typeFilter}`;
        query = `SELECT id, description, price_per_unit, type, is_active, sort_order FROM products ${whereClause}`;
      }

      const result = await pool.query(query);

      // Convert money-related fields to numbers
      const productsWithNumberValues = result.rows.map((product) => ({
        ...product,
        price_per_unit:
          product.price_per_unit !== null
            ? Number(product.price_per_unit)
            : null,
      }));

      // Custom sort order: "1-", "2-", "WE-", "S-", "MEQ-"
      const prefixOrder = ["1-", "2-", "WE-", "S-", "MEQ-"];
      const getPrefixIndex = (id) => {
        const prefix = prefixOrder.find((p) => id.startsWith(p));
        return prefix ? prefixOrder.indexOf(prefix) : 999;
      };

      // Rank each product type by where it first appears in the legacy
      // prefix/alphabetical order. Same-type products are then kept
      // contiguous so the explicit per-type order (products.sort_order) can
      // apply within a type, while the legacy cross-type order is preserved.
      const typeRank = new Map();
      [...productsWithNumberValues]
        .sort((a, b) => {
          const aIndex = getPrefixIndex(a.id);
          const bIndex = getPrefixIndex(b.id);
          if (aIndex !== bIndex) return aIndex - bIndex;
          return a.id.localeCompare(b.id);
        })
        .forEach((product) => {
          if (!typeRank.has(product.type)) {
            typeRank.set(product.type, typeRank.size);
          }
        });

      const sortedProducts = productsWithNumberValues.sort((a, b) => {
        const typeDiff = typeRank.get(a.type) - typeRank.get(b.type);
        if (typeDiff !== 0) return typeDiff;

        // Explicit per-type display order (managed via PUT /api/products/order):
        // ordered products first (by sort_order), unordered ones after.
        const aHasOrder = a.sort_order !== null && a.sort_order !== undefined;
        const bHasOrder = b.sort_order !== null && b.sort_order !== undefined;
        if (aHasOrder || bHasOrder) {
          if (!aHasOrder) return 1;
          if (!bHasOrder) return -1;
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        }

        const aIndex = getPrefixIndex(a.id);
        const bIndex = getPrefixIndex(b.id);
        if (aIndex !== bIndex) return aIndex - bIndex;

        // If same prefix or both don't match any prefix, sort alphabetically
        return a.id.localeCompare(b.id);
      });

      // Cache the result
      cache.set(cacheKey, sortedProducts, CACHE_TTL.LONG);

      res.status(200).json(sortedProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
      res
        .status(500)
        .json({ message: "Error fetching products", error: error.message });
    }
  });

  // Create a new product
  router.post("/", async (req, res) => {
    const { id, description, price_per_unit, type, tax, is_active } = req.body;

    try {
      const query = `
        INSERT INTO products (id, description, price_per_unit, type, tax, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [id, description, price_per_unit, type, tax, is_active ?? true];

      const result = await pool.query(query, values);

      // Invalidate cache
      cache.invalidatePrefix(CACHE_KEYS.PRODUCTS);

      res.status(201).json({
        message: "Product created successfully",
        product: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505") {
        // unique_violation error code
        return res
          .status(400)
          .json({ message: "A product with this ID already exists" });
      }
      console.error("Error creating product:", error);
      res
        .status(500)
        .json({ message: "Error creating product", error: error.message });
    }
  });

  // Delete products (batch delete)
  router.delete("/", async (req, res) => {
    const { products: productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "Invalid product IDs provided" });
    }

    try {
      const linkedProductResult = await pool.query(
        `SELECT p.id
           FROM public.products p
          WHERE p.id = ANY($1::varchar[])
            AND (
              EXISTS (
                SELECT 1 FROM public.product_pay_codes ppc
                 WHERE ppc.product_id = p.id
              )
              OR EXISTS (
                SELECT 1 FROM jellypolly.product_pay_codes ppc
                 WHERE ppc.product_id = p.id
              )
              OR EXISTS (
                SELECT 1 FROM public.product_salesman_ikut_pay_codes ps
                 WHERE ps.product_id = p.id
              )
              OR EXISTS (
                SELECT 1 FROM public.job_pay_codes jpc
                 WHERE jpc.pay_code_id = p.id AND jpc.job_id = 'SALESMAN'
              )
              OR EXISTS (
                SELECT 1 FROM jellypolly.job_pay_codes jpc
                 WHERE jpc.pay_code_id = p.id
                   AND jpc.job_id IN ('JP_SALESMAN', 'JP_SALESMAN_IKUT')
              )
            )
          ORDER BY p.id`,
        [productIds]
      );
      if (linkedProductResult.rows.length > 0) {
        return res.status(400).json({
          message:
            "Unlink all pay codes from the product before permanently deleting it",
          product_ids: linkedProductResult.rows.map((row) => row.id),
        });
      }

      const query = "DELETE FROM products WHERE id = ANY($1) RETURNING id";
      const result = await pool.query(query, [productIds]);

      // Invalidate cache
      cache.invalidatePrefix(CACHE_KEYS.PRODUCTS);

      const deletedIds = result.rows.map((row) => row.id);
      res.status(200).json({
        message: "Products deleted successfully",
        deletedProductIds: deletedIds,
      });
    } catch (error) {
      console.error("Error deleting products:", error);
      res
        .status(500)
        .json({ message: "Error deleting products", error: error.message });
    }
  });

  // Batch update/insert products
  router.post("/batch", async (req, res) => {
    const { products } = req.body;

    if (!Array.isArray(products)) {
      return res
        .status(400)
        .json({ message: "Invalid input: products must be an array" });
    }
    const renamedProduct = products.find(
      (product) => product.newId && product.newId !== product.id
    );
    if (renamedProduct) {
      return res.status(400).json({
        message:
          "Product IDs are immutable because payroll and stock mappings depend on them",
      });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const processedProducts = [];

        for (const product of products) {
          const { id, description, price_per_unit, type, tax, is_active } =
            product;

          await validateProductTypeAgainstPackingLinks(client, id, type);

          const upsertQuery = `
            INSERT INTO products (id, description, price_per_unit, type, tax, is_active)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE
            SET description = EXCLUDED.description,
                price_per_unit = EXCLUDED.price_per_unit,
                type = EXCLUDED.type,
                tax = EXCLUDED.tax,
                is_active = EXCLUDED.is_active
            RETURNING *
          `;
          const upsertValues = [
            id,
            description,
            price_per_unit,
            type,
            tax,
            is_active ?? true,
          ];
          const result = await client.query(upsertQuery, upsertValues);
          processedProducts.push(result.rows[0]);
        }

        await client.query("COMMIT");

        // Invalidate cache
        cache.invalidatePrefix(CACHE_KEYS.PRODUCTS);

        res.json({
          message: "Products processed successfully",
          products: processedProducts,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof SetupValidationError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error processing products:", error);
      res
        .status(500)
        .json({ message: "Error processing products", error: error.message });
    }
  });

  // POST /with-paycode-setup - Create a product and, in the same transaction,
  // its optional pay codes and mappings. Used by the Add Product modal's
  // "Automatically create pay codes and mappings" section so a new production
  // product (RAMEN, MEE, BH, BUNDLE or JP) is fully wired up in one atomic
  // call instead of manual Pay Code + Mappings + job-association steps.
  //
  // Body:
  // {
  //   product: { id, description, price_per_unit, type, tax, is_active },
  //   paycodes: [
  //     { role: 'packing' | 'salesman' | 'ikut', id, description, pay_type,
  //       rate_unit, rate_biasa, rate_ahad, rate_umum }
  //   ],
  //   scope: 'tienhock' | 'jellypolly'   // default 'tienhock'
  // }
  //
  // role 'packing' -> product_pay_codes (packer payroll);
  // role 'salesman' -> SALESMAN job (JP: JP_SALESMAN + JP_SALESMAN_IKUT),
  //   with the pay code ID forced to equal the product ID (daily-log
  //   same-id matching convention);
  // role 'ikut' -> SALESMAN_IKUT job + product_salesman_ikut_pay_codes
  //   (Tien Hock only).
  router.post("/with-paycode-setup", async (req, res) => {
    const SETUP_ROLES = new Set(["packing", "salesman", "ikut"]);
    const PRODUCTION_RATE_UNITS = new Set([
      "Bag",
      "Ctn",
      "Bundle",
      "PKT",
      "PCS",
      "Kg",
      "Karung",
    ]);
    const UNITS_REQUIRING_INPUT = new Set([
      "Percent",
      "Trip",
      "Day",
      "Bag",
      "Ctn",
      "PKT",
      "PCS",
      "Kg",
      "Karung",
      "Bundle",
      "Fixed",
      "Tray",
    ]);
    const PACKING_UNIT_BY_TYPE = {
      MEE: "Bag",
      BH: "Bag",
      RAMEN: "PKT",
      BUNDLE: "Bundle",
      JP: "Ctn",
    };

    const { product, paycodes = [], scope = "tienhock" } = req.body;

    if (scope !== "tienhock" && scope !== "jellypolly") {
      return res.status(400).json({
        message: "scope must be 'tienhock' or 'jellypolly'",
      });
    }
    if (!product || typeof product !== "object") {
      return res.status(400).json({ message: "product is required" });
    }
    const {
      id,
      description,
      price_per_unit,
      type,
      tax = "None",
      is_active,
    } = product;
    if (
      typeof id !== "string" ||
      id.trim() === "" ||
      typeof description !== "string" ||
      description.trim() === "" ||
      typeof type !== "string" ||
      type.trim() === ""
    ) {
      return res.status(400).json({
        message: "Product id, description and type are required",
      });
    }
    const price = Number(price_per_unit);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: "Product price must be a number greater than or equal to 0",
      });
    }
    if (!Array.isArray(paycodes)) {
      return res.status(400).json({ message: "paycodes must be an array" });
    }

    // ----- Pre-validation (fail fast before touching the database) ---------
    let normalizedPaycodes;
    try {
      const seenIds = new Set();
      normalizedPaycodes = paycodes.map((entry) => {
        if (!entry || typeof entry !== "object") {
          throw new SetupValidationError(
            "Each pay code entry must be an object"
          );
        }
        const { role, id: payCodeId, pay_type, rate_unit } = entry;
        if (!SETUP_ROLES.has(role)) {
          throw new SetupValidationError(
            `Unknown pay code role '${role}'; expected packing, salesman or ikut`
          );
        }
        if (
          typeof payCodeId !== "string" ||
          payCodeId.trim() === "" ||
          typeof pay_type !== "string" ||
          pay_type.trim() === "" ||
          typeof rate_unit !== "string" ||
          rate_unit.trim() === ""
        ) {
          throw new SetupValidationError(
            `Pay code id, pay_type and rate_unit are required (${role})`
          );
        }
        if (seenIds.has(payCodeId)) {
          throw new SetupValidationError(
            `Pay code ID '${payCodeId}' is used more than once in the setup`
          );
        }
        seenIds.add(payCodeId);

        const parseRate = (value) => {
          if (value === undefined || value === null || value === "") return 0;
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed < 0) {
            throw new SetupValidationError(
              `Pay code rates must be numbers greater than or equal to 0 (${payCodeId})`
            );
          }
          return parsed;
        };
        // The Add Product auto-setup contract requires the user to set the
        // normal rate for every pay code (Sunday/holiday stay optional and
        // inherit it). Enforce it here too so a direct API call cannot create
        // a silently unpaid pay code.
        if (
          entry.rate_biasa === undefined ||
          entry.rate_biasa === null ||
          entry.rate_biasa === ""
        ) {
          throw new SetupValidationError(
            `Normal rate is required for pay code '${payCodeId}'`
          );
        }
        const rateBiasa = parseRate(entry.rate_biasa);
        const rateAhad = parseRate(entry.rate_ahad);
        const rateUmum = parseRate(entry.rate_umum);

        // Mirrors the Pay Code modal: blank Sunday/holiday rates inherit the
        // normal rate when it is non-zero.
        const finalRateAhad =
          rateAhad === 0 && rateBiasa > 0 ? rateBiasa : rateAhad;
        const finalRateUmum =
          rateUmum === 0 && rateBiasa > 0 ? rateBiasa : rateUmum;

        const packingUnit = PACKING_UNIT_BY_TYPE[type];

        if (role === "packing") {
          if (!packingUnit) {
            throw new SetupValidationError(
              `Packing pay codes are not supported for product type '${type}'`
            );
          }
          // Same compatibility rule as /api/product-pay-codes/batch: RAMEN
          // products map only to PKT and PKT codes map only to RAMEN.
          if ((type === "RAMEN") !== (rate_unit === "PKT")) {
            throw new SetupValidationError(
              "Product and packing pay code units are incompatible; " +
                "RAMEN must use PKT and only RAMEN may use PKT"
            );
          }
          if (!PRODUCTION_RATE_UNITS.has(rate_unit)) {
            throw new SetupValidationError(
              `Packing pay code '${payCodeId}' must use a production rate unit`
            );
          }
        } else if (role === "salesman") {
          if (!["MEE", "BH", "RAMEN", "JP"].includes(type)) {
            throw new SetupValidationError(
              `Salesman commission pay codes are not supported for product type '${type}'`
            );
          }
          if (payCodeId !== id) {
            throw new SetupValidationError(
              "Salesman commission pay code ID must equal the product ID"
            );
          }
          if (!PRODUCTION_RATE_UNITS.has(rate_unit)) {
            throw new SetupValidationError(
              `Salesman commission pay code '${payCodeId}' must use a production rate unit`
            );
          }
        } else {
          if (scope !== "tienhock") {
            throw new SetupValidationError(
              "Ikut Lori pay codes are only supported for Tien Hock"
            );
          }
          if (!["MEE", "BH", "RAMEN"].includes(type)) {
            throw new SetupValidationError(
              `Ikut Lori pay codes are not supported for product type '${type}'`
            );
          }
          if (!PRODUCTION_RATE_UNITS.has(rate_unit)) {
            throw new SetupValidationError(
              `Ikut Lori pay code '${payCodeId}' must use a production rate unit`
            );
          }
        }

        return {
          role,
          id: payCodeId,
          description:
            typeof entry.description === "string" && entry.description.trim()
              ? entry.description.trim()
              : description,
          pay_type,
          rate_unit,
          rate_biasa: rateBiasa,
          rate_ahad: finalRateAhad,
          rate_umum: finalRateUmum,
          requires_units_input: UNITS_REQUIRING_INPUT.has(rate_unit),
        };
      });
    } catch (error) {
      if (error instanceof SetupValidationError) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }

    const payCodeTable =
      scope === "jellypolly" ? "jellypolly.pay_codes" : "public.pay_codes";
    const productPayCodeTable =
      scope === "jellypolly"
        ? "jellypolly.product_pay_codes"
        : "public.product_pay_codes";
    const jobPayCodeTable =
      scope === "jellypolly"
        ? "jellypolly.job_pay_codes"
        : "public.job_pay_codes";
    const salesmanJobs =
      scope === "jellypolly"
        ? ["JP_SALESMAN", "JP_SALESMAN_IKUT"]
        : ["SALESMAN"];

    try {
      const productExists = await pool.query(
        "SELECT 1 FROM public.products WHERE id = $1",
        [id]
      );
      if (productExists.rows.length > 0) {
        return res.status(400).json({
          message: "A product with this ID already exists",
        });
      }

      if (normalizedPaycodes.length > 0) {
        const payCodeIds = normalizedPaycodes.map((entry) => entry.id);
        const existingPayCodes = await pool.query(
          `SELECT id FROM ${payCodeTable} WHERE id = ANY($1)`,
          [payCodeIds]
        );
        if (existingPayCodes.rows.length > 0) {
          return res.status(409).json({
            message:
              "A pay code with ID " +
              existingPayCodes.rows.map((row) => `'${row.id}'`).join(", ") +
              " already exists",
          });
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const productResult = await client.query(
          `INSERT INTO public.products
             (id, description, price_per_unit, type, tax, is_active)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, description, price_per_unit, type, tax, is_active`,
          [id, description, price, type, tax, is_active === undefined ? true : !!is_active]
        );

        const createdPaycodes = [];
        for (const entry of normalizedPaycodes) {
          await client.query(
            `INSERT INTO ${payCodeTable}
               (id, description, pay_type, rate_unit,
                rate_biasa, rate_ahad, rate_umum,
                is_active, requires_units_input, report_column)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NULL)`,
            [
              entry.id,
              entry.description,
              entry.pay_type,
              entry.rate_unit,
              entry.rate_biasa,
              entry.rate_ahad,
              entry.rate_umum,
              entry.requires_units_input,
            ]
          );
          createdPaycodes.push({ role: entry.role, id: entry.id });
        }

        const mappingSummary = { packing: [], salesman: [], ikut: [] };

        for (const entry of normalizedPaycodes) {
          if (entry.role === "packing") {
            await client.query(
              `INSERT INTO ${productPayCodeTable} (product_id, pay_code_id)
               VALUES ($1, $2)`,
              [id, entry.id]
            );
            mappingSummary.packing.push(entry.id);
          } else if (entry.role === "salesman") {
            for (const jobId of salesmanJobs) {
              await client.query(
                `INSERT INTO ${jobPayCodeTable}
                   (job_id, pay_code_id, is_default,
                    override_rate_biasa, override_rate_ahad, override_rate_umum)
                 VALUES ($1, $2, false, NULL, NULL, NULL)`,
                [jobId, entry.id]
              );
            }
            mappingSummary.salesman.push(entry.id);
          } else {
            await client.query(
              `INSERT INTO public.job_pay_codes
                 (job_id, pay_code_id, is_default,
                  override_rate_biasa, override_rate_ahad, override_rate_umum)
               VALUES ('SALESMAN_IKUT', $1, false, NULL, NULL, NULL)`,
              [entry.id]
            );
            await client.query(
              `INSERT INTO public.product_salesman_ikut_pay_codes
                 (product_id, pay_code_id)
               VALUES ($1, $2)`,
              [id, entry.id]
            );
            mappingSummary.ikut.push(entry.id);
          }
        }

        if (createdPaycodes.length > 0) {
          await client.query(
            `UPDATE ${payCodeTable}
                SET updated_at = CURRENT_TIMESTAMP
              WHERE id = ANY($1)`,
            [createdPaycodes.map((entry) => entry.id)]
          );
        }

        await client.query("COMMIT");

        // Invalidate server-side caches so the new product/pay codes appear
        // immediately. Client-side pay-code caches are cleared by the page.
        cache.invalidatePrefix(CACHE_KEYS.PRODUCTS);
        cache.invalidate(CACHE_KEYS.PAY_CODES);
        cache.invalidate(CACHE_KEYS.JOBS);

        return res.status(201).json({
          message:
            createdPaycodes.length > 0
              ? "Product and pay codes created successfully"
              : "Product created successfully",
          product: productResult.rows[0],
          paycodes: createdPaycodes,
          mappings: mappingSummary,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof SetupValidationError) {
        return res.status(400).json({ message: error.message });
      }
      if (error && error.code === "23505") {
        // Race with a concurrent create that passed the pre-checks.
        return res.status(409).json({
          message: "A product or pay code with this ID already exists",
        });
      }
      console.error("Error creating product with pay codes:", error);
      res.status(500).json({
        message: "Error creating product with pay codes",
        error: error.message,
      });
    }
  });

  // Lightweight central product/pay-code view. This returns linked rows from
  // both payroll catalogues, including incomplete links, but deliberately does
  // not load every unlinked pay code; the add flow has a separate lazy route.
  router.get("/:productId/paycode-links", async (req, res) => {
    try {
      const response = await getProductPayCodeLinks(pool, req.params.productId);
      if (!response) {
        return res.status(404).json({ message: "Product not found" });
      }
      return res.json(response);
    } catch (error) {
      console.error("Error fetching product pay-code links:", error);
      return res.status(500).json({
        message: "Error fetching product pay-code links",
        error: error.message,
      });
    }
  });

  // The full catalogue is intentionally separate from the lightweight linked
  // view. The manager calls this only after the user opens the add/link panel,
  // and only for the selected payroll scope.
  router.get("/:productId/paycode-candidates", async (req, res) => {
    const { productId } = req.params;
    const { scope } = req.query;
    const scopeConfig = getScopeConfig(scope);
    if (!scopeConfig) {
      return res.status(400).json({ message: "Invalid scope" });
    }

    try {
      const productResult = await pool.query(
        "SELECT 1 FROM public.products WHERE id = $1",
        [productId]
      );
      if (productResult.rows.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      const payCodeResult = await pool.query(
        `SELECT * FROM ${scopeConfig.payCodes} ORDER BY id`
      );
      return res.json({
        scope,
        pay_codes: payCodeResult.rows.map((row) =>
          parsePayCodeRow({
            ...row,
            scope,
            roles: [],
            job_ids: [],
          })
        ),
      });
    } catch (error) {
      console.error("Error fetching product pay-code candidates:", error);
      return res.status(500).json({
        message: "Error fetching product pay-code candidates",
        error: error.message,
      });
    }
  });

  router.post("/:productId/paycode-links", async (req, res) => {
    const { productId } = req.params;
    const { scope, role, pay_code_id: payCodeId, pay_code: payCodePayload } =
      req.body || {};
    const scopeConfig = getScopeConfig(scope);
    if (!scopeConfig || !PAY_CODE_ROLES.has(role)) {
      return res.status(400).json({ message: "Invalid scope or role" });
    }
    if (typeof payCodeId !== "string" || payCodeId.trim() === "") {
      return res.status(400).json({ message: "pay_code_id is required" });
    }
    const normalizedPayCodeId = payCodeId.trim();
    let normalizedPayCode = null;
    try {
      if (payCodePayload !== undefined) {
        normalizedPayCode = normalizePayCodePayload(
          payCodePayload,
          normalizedPayCodeId
        );
      }
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const productResult = await client.query(
        `SELECT id, type FROM public.products WHERE id = $1 FOR UPDATE`,
        [productId]
      );
      if (productResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Product not found" });
      }
      const productType = productResult.rows[0].type;

      let payCode;
      if (normalizedPayCode) {
        const existingResult = await client.query(
          `SELECT 1 FROM ${scopeConfig.payCodes} WHERE id = $1`,
          [normalizedPayCodeId]
        );
        if (existingResult.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message: `A pay code with ID '${normalizedPayCodeId}' already exists in ${scope}`,
          });
        }
        const createdResult = await client.query(
          `INSERT INTO ${scopeConfig.payCodes}
             (id, description, pay_type, rate_unit, rate_biasa, rate_ahad,
              rate_umum, is_active, requires_units_input, report_column)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            normalizedPayCode.id,
            normalizedPayCode.description,
            normalizedPayCode.pay_type,
            normalizedPayCode.rate_unit,
            normalizedPayCode.rate_biasa,
            normalizedPayCode.rate_ahad,
            normalizedPayCode.rate_umum,
            normalizedPayCode.is_active,
            normalizedPayCode.requires_units_input,
            normalizedPayCode.report_column,
          ]
        );
        payCode = createdResult.rows[0];
      } else {
        const existingResult = await client.query(
          `SELECT * FROM ${scopeConfig.payCodes} WHERE id = $1 FOR UPDATE`,
          [normalizedPayCodeId]
        );
        if (existingResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({
            message: `Pay code '${normalizedPayCodeId}' was not found in ${scope}`,
          });
        }
        payCode = existingResult.rows[0];
      }

      if (role === "packing") {
        validatePackingCompatibility(productType, payCode.rate_unit);
        await client.query(
          `INSERT INTO ${scopeConfig.productPayCodes} (product_id, pay_code_id)
           VALUES ($1, $2)
           ON CONFLICT (product_id, pay_code_id) DO NOTHING`,
          [productId, normalizedPayCodeId]
        );
      } else if (role === "salesman") {
        if (!["MEE", "BH", "RAMEN", "JP"].includes(productType)) {
          throw new SetupValidationError(
            `Salesman pay codes are not supported for product type '${productType}'`
          );
        }
        if (normalizedPayCodeId !== productId) {
          throw new SetupValidationError(
            "Salesman pay code ID must equal the product ID"
          );
        }
        if (!PRODUCTION_RATE_UNITS.has(payCode.rate_unit)) {
          throw new SetupValidationError(
            "Salesman pay codes must use a production rate unit"
          );
        }
        for (const jobId of scopeConfig.salesmanJobs) {
          await client.query(
            `INSERT INTO ${scopeConfig.jobPayCodes}
               (job_id, pay_code_id, is_default,
                override_rate_biasa, override_rate_ahad, override_rate_umum)
             VALUES ($1, $2, false, NULL, NULL, NULL)
             ON CONFLICT (job_id, pay_code_id) DO NOTHING`,
            [jobId, normalizedPayCodeId]
          );
        }
      } else {
        if (scope !== "tienhock") {
          throw new SetupValidationError(
            "Ikut Lori pay codes are only supported in the Tien Hock scope"
          );
        }
        if (!["MEE", "BH", "RAMEN"].includes(productType)) {
          throw new SetupValidationError(
            `Ikut Lori pay codes are not supported for product type '${productType}'`
          );
        }
        if (!PRODUCTION_RATE_UNITS.has(payCode.rate_unit)) {
          throw new SetupValidationError(
            "Ikut Lori pay codes must use a production rate unit"
          );
        }
        await client.query(
          `INSERT INTO public.job_pay_codes
             (job_id, pay_code_id, is_default,
              override_rate_biasa, override_rate_ahad, override_rate_umum)
           VALUES ('SALESMAN_IKUT', $1, false, NULL, NULL, NULL)
           ON CONFLICT (job_id, pay_code_id) DO NOTHING`,
          [normalizedPayCodeId]
        );
        await client.query(
          `INSERT INTO public.product_salesman_ikut_pay_codes
             (product_id, pay_code_id)
           VALUES ($1, $2)
           ON CONFLICT (product_id) DO UPDATE
             SET pay_code_id = EXCLUDED.pay_code_id`,
          [productId, normalizedPayCodeId]
        );
      }

      await client.query("COMMIT");
      invalidatePayCodeManagerCaches();
      return res.status(normalizedPayCode ? 201 : 200).json({
        message: "Product pay-code link saved",
        product_id: productId,
        scope,
        role,
        pay_code_id: normalizedPayCodeId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof SetupValidationError) {
        return res.status(400).json({ message: error.message });
      }
      if (error && error.code === "23503") {
        return res.status(400).json({
          message: "A required product, pay code or canonical job is missing",
        });
      }
      if (error && error.code === "23505") {
        return res.status(409).json({ message: "The pay-code link already exists" });
      }
      console.error("Error saving product pay-code link:", error);
      return res.status(500).json({
        message: "Error saving product pay-code link",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  router.put("/:productId/paycode-links/:scope/:payCodeId", async (req, res) => {
    const { productId, scope, payCodeId } = req.params;
    const scopeConfig = getScopeConfig(scope);
    if (!scopeConfig) {
      return res.status(400).json({ message: "Invalid scope" });
    }
    let payCode;
    try {
      payCode = normalizePayCodePayload(req.body, payCodeId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const productResult = await client.query(
        `SELECT 1 FROM public.products WHERE id = $1 FOR SHARE`,
        [productId]
      );
      if (productResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Product not found" });
      }
      const existingResult = await client.query(
        `SELECT 1 FROM ${scopeConfig.payCodes} WHERE id = $1 FOR UPDATE`,
        [payCodeId]
      );
      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Pay code not found" });
      }

      const linkedProductsResult = await client.query(
        `SELECT p.id, p.type
           FROM ${scopeConfig.productPayCodes} ppc
           JOIN public.products p ON p.id = ppc.product_id
          WHERE ppc.pay_code_id = $1
          FOR SHARE OF p`,
        [payCodeId]
      );
      linkedProductsResult.rows.forEach((product) =>
        validatePackingCompatibility(product.type, payCode.rate_unit)
      );

      const updateResult = await client.query(
        `UPDATE ${scopeConfig.payCodes}
            SET description = $1,
                pay_type = $2,
                rate_unit = $3,
                rate_biasa = $4,
                rate_ahad = $5,
                rate_umum = $6,
                is_active = $7,
                requires_units_input = $8,
                report_column = $9,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $10
          RETURNING *`,
        [
          payCode.description,
          payCode.pay_type,
          payCode.rate_unit,
          payCode.rate_biasa,
          payCode.rate_ahad,
          payCode.rate_umum,
          payCode.is_active,
          payCode.requires_units_input,
          payCode.report_column,
          payCodeId,
        ]
      );
      await client.query("COMMIT");
      invalidatePayCodeManagerCaches();
      return res.json({
        message: "Pay code updated successfully",
        pay_code: {
          ...updateResult.rows[0],
          scope,
          rate_biasa:
            updateResult.rows[0].rate_biasa === null
              ? null
              : Number(updateResult.rows[0].rate_biasa),
          rate_ahad:
            updateResult.rows[0].rate_ahad === null
              ? null
              : Number(updateResult.rows[0].rate_ahad),
          rate_umum:
            updateResult.rows[0].rate_umum === null
              ? null
              : Number(updateResult.rows[0].rate_umum),
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof SetupValidationError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error updating linked pay code:", error);
      return res.status(500).json({
        message: "Error updating linked pay code",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  router.delete(
    "/:productId/paycode-links/:scope/:role/:payCodeId",
    async (req, res) => {
      const { productId, scope, role, payCodeId } = req.params;
      const scopeConfig = getScopeConfig(scope);
      if (!scopeConfig || !PAY_CODE_ROLES.has(role)) {
        return res.status(400).json({ message: "Invalid scope or role" });
      }
      if (role === "ikut" && scope !== "tienhock") {
        return res.status(400).json({
          message: "Ikut Lori pay codes are only supported in the Tien Hock scope",
        });
      }
      if (role === "salesman" && payCodeId !== productId) {
        return res.status(400).json({
          message: "Salesman pay code ID must equal the product ID",
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const productResult = await client.query(
          `SELECT 1 FROM public.products WHERE id = $1 FOR UPDATE`,
          [productId]
        );
        if (productResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Product not found" });
        }

        if (role === "packing") {
          await client.query(
            `DELETE FROM ${scopeConfig.productPayCodes}
              WHERE product_id = $1 AND pay_code_id = $2`,
            [productId, payCodeId]
          );
        } else if (role === "salesman") {
          await client.query(
            `DELETE FROM ${scopeConfig.jobPayCodes}
              WHERE pay_code_id = $1 AND job_id = ANY($2::varchar[])`,
            [payCodeId, scopeConfig.salesmanJobs]
          );
        } else {
          await client.query(
            `DELETE FROM public.product_salesman_ikut_pay_codes
              WHERE product_id = $1 AND pay_code_id = $2`,
            [productId, payCodeId]
          );
        }

        await client.query("COMMIT");
        invalidatePayCodeManagerCaches();
        return res.json({
          message: "Product pay-code role unlinked",
          product_id: productId,
          scope,
          role,
          pay_code_id: payCodeId,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error unlinking product pay-code role:", error);
        return res.status(500).json({
          message: "Error unlinking product pay-code role",
          error: error.message,
        });
      } finally {
        client.release();
      }
    }
  );

  // Save the display order of products within a type (must be before /:id)
  router.put("/order", async (req, res) => {
    const VALID_ORDER_TYPES = new Set([
      "BH",
      "MEE",
      "RAMEN",
      "JP",
      "OTH",
      "BUNDLE",
    ]);
    const { type, product_ids } = req.body;

    if (typeof type !== "string" || !VALID_ORDER_TYPES.has(type)) {
      return res.status(400).json({
        message: "type must be one of BH, MEE, RAMEN, JP, OTH, BUNDLE",
      });
    }

    if (!Array.isArray(product_ids)) {
      return res.status(400).json({ message: "product_ids array is required" });
    }

    try {
      const seen = new Set();
      const normalizedIds = product_ids
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => id.trim())
        .filter((id) => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Products of this type that are not listed lose their explicit order
        // and fall back to the default prefix/alphabetical order (after the
        // ordered ones).
        await client.query(
          "UPDATE products SET sort_order = NULL WHERE type = $1",
          [type]
        );

        for (const [index, productId] of normalizedIds.entries()) {
          await client.query(
            "UPDATE products SET sort_order = $1 WHERE id = $2 AND type = $3",
            [index, productId, type]
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      // Invalidate cache
      cache.invalidatePrefix(CACHE_KEYS.PRODUCTS);

      res.json({
        message: "Product order saved",
        type,
        product_ids: normalizedIds,
      });
    } catch (error) {
      console.error("Error saving product order:", error);
      res
        .status(500)
        .json({ message: "Error saving product order", error: error.message });
    }
  });

  // Update a single product
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { description, price_per_unit, type, tax, is_active } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query(
        "SELECT 1 FROM products WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Product not found" });
      }
      await validateProductTypeAgainstPackingLinks(client, id, type);
      const query = `
        UPDATE products
        SET description = $1, price_per_unit = $2, type = $3, tax = $4, is_active = $5
        WHERE id = $6
        RETURNING *
      `;

      const values = [description, price_per_unit, type, tax, is_active, id];

      const result = await client.query(query, values);
      await client.query("COMMIT");

      // Invalidate cache
      cache.invalidatePrefix(CACHE_KEYS.PRODUCTS);

      res.json({
        message: "Product updated successfully",
        product: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof SetupValidationError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error updating product:", error);
      res
        .status(500)
        .json({ message: "Error updating product", error: error.message });
    } finally {
      client.release();
    }
  });

  // Get a single product
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = "SELECT * FROM products WHERE id = $1";
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching product:", error);
      res
        .status(500)
        .json({ message: "Error fetching product", error: error.message });
    }
  });

  return router;
}
