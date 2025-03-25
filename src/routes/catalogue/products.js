// src/routes/products.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get products based on params
  router.get("/", async (req, res) => {
    try {
      // Check if we should return all products or filter by type
      const showAll = req.query.all !== undefined;
      const showJP = req.query.JP !== undefined;

      let query;
      if (showAll) {
        // Return all products with all columns /api/products?all
        query = "SELECT * FROM products";
      } else if (showJP) {
        // Return only JP type products (excluding tax) /api/products?JP
        query =
          "SELECT id, description, price_per_unit, type FROM products WHERE type = 'JP'";
      } else {
        // Default: Return only BH and MEE type products (excluding tax)
        query =
          "SELECT id, description, price_per_unit, type FROM products WHERE type IN ('BH', 'MEE')";
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
      res.status(200).json(productsWithNumberValues); // Explicitly use 200 OK
    } catch (error) {
      console.error("Error fetching products:", error);
      res
        .status(500)
        .json({ message: "Error fetching products", error: error.message });
    }
  });

  // Create a new product
  router.post("/", async (req, res) => {
    const { id, description, price_per_unit, type, tax } = req.body;

    try {
      const query = `
        INSERT INTO products (id, description, price_per_unit, type, tax)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const values = [id, description, price_per_unit, type, tax];

      const result = await pool.query(query, values);
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
          const { id, newId, description, price_per_unit, type, tax } = product;

          if (newId && newId !== id) {
            // This is an existing product with an ID change
            const upsertQuery = `
              INSERT INTO products (id, description, price_per_unit, type, tax)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (id) DO UPDATE
              SET description = EXCLUDED.description,
                  price_per_unit = EXCLUDED.price_per_unit,
                  type = EXCLUDED.type,
                  tax = EXCLUDED.tax
              RETURNING *
            `;
            const upsertValues = [
              newId,
              description,
              price_per_unit,
              type,
              tax,
            ];
            const upsertResult = await client.query(upsertQuery, upsertValues);

            // Delete the old product
            await client.query("DELETE FROM products WHERE id = $1", [id]);

            processedProducts.push(upsertResult.rows[0]);
          } else {
            // This is an existing product without ID change or a new product
            const upsertQuery = `
              INSERT INTO products (id, description, price_per_unit, type, tax)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (id) DO UPDATE
              SET description = EXCLUDED.description,
                  price_per_unit = EXCLUDED.price_per_unit,
                  type = EXCLUDED.type,
                  tax = EXCLUDED.tax
              RETURNING *
            `;
            const upsertValues = [id, description, price_per_unit, type, tax];
            const result = await client.query(upsertQuery, upsertValues);
            processedProducts.push(result.rows[0]);
          }
        }

        await client.query("COMMIT");
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

  // Update a single product
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { description, price_per_unit, type, tax } = req.body;

    try {
      const query = `
        UPDATE products
        SET description = $1, price_per_unit = $2, type = $3, tax = $4
        WHERE id = $5
        RETURNING *
      `;

      const values = [description, price_per_unit, type, tax, id];

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

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
