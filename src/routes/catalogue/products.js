// src/routes/catalogue/products.js
import { Router } from "express";
import cache, { CACHE_TTL, CACHE_KEYS } from "../utils/memory-cache.js";

export default function (pool) {
  const router = Router();

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
        // Default: Return only BH, MEE, JP type products (excluding tax)
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

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const processedProducts = [];

        for (const product of products) {
          const { id, newId, description, price_per_unit, type, tax, is_active } = product;

          if (newId && newId !== id) {
            // This is an existing product with an ID change
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
              newId,
              description,
              price_per_unit,
              type,
              tax,
              is_active ?? true,
            ];
            const upsertResult = await client.query(upsertQuery, upsertValues);

            // Delete the old product
            await client.query("DELETE FROM products WHERE id = $1", [id]);

            processedProducts.push(upsertResult.rows[0]);
          } else {
            // This is an existing product without ID change or a new product
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
            const upsertValues = [id, description, price_per_unit, type, tax, is_active ?? true];
            const result = await client.query(upsertQuery, upsertValues);
            processedProducts.push(result.rows[0]);
          }
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
      console.error("Error processing products:", error);
      res
        .status(500)
        .json({ message: "Error processing products", error: error.message });
    }
  });

  // Save the display order of products within a type (must be before /:id)
  router.put("/order", async (req, res) => {
    const VALID_ORDER_TYPES = new Set(["BH", "MEE", "JP", "OTH", "BUNDLE"]);
    const { type, product_ids } = req.body;

    if (typeof type !== "string" || !VALID_ORDER_TYPES.has(type)) {
      return res.status(400).json({
        message: "type must be one of BH, MEE, JP, OTH, BUNDLE",
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

    try {
      const query = `
        UPDATE products
        SET description = $1, price_per_unit = $2, type = $3, tax = $4, is_active = $5
        WHERE id = $6
        RETURNING *
      `;

      const values = [description, price_per_unit, type, tax, is_active, id];

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Invalidate cache
      cache.invalidatePrefix(CACHE_KEYS.PRODUCTS);

      res.json({
        message: "Product updated successfully",
        product: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating product:", error);
      res
        .status(500)
        .json({ message: "Error updating product", error: error.message });
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
