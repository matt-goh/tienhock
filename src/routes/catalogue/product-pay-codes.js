// src/routes/catalogue/product-pay-codes.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET /all-mappings - Get all MEE/BH products and their pay code mappings
  router.get("/all-mappings", async (req, res) => {
    try {
      // Get all MEE and BH products
      const productsQuery = `
        SELECT id, description, type
        FROM products
        WHERE type IN ('MEE', 'BH')
        ORDER BY type, id
      `;
      const productsResult = await pool.query(productsQuery);
      const products = productsResult.rows;

      // Get all product-pay code mappings with pay code details
      const mappingQuery = `
        SELECT
          ppc.product_id,
          ppc.pay_code_id,
          pc.id,
          pc.description,
          pc.pay_type,
          pc.rate_unit,
          CAST(pc.rate_biasa AS NUMERIC(10, 2)) AS rate_biasa,
          CAST(pc.rate_ahad AS NUMERIC(10, 2)) AS rate_ahad,
          CAST(pc.rate_umum AS NUMERIC(10, 2)) AS rate_umum,
          pc.is_active,
          pc.requires_units_input
        FROM product_pay_codes ppc
        JOIN pay_codes pc ON ppc.pay_code_id = pc.id
        ORDER BY ppc.product_id, pc.id
      `;
      const mappingResult = await pool.query(mappingQuery);

      // Process mappings into product-based structure
      const detailedMappings = {};

      mappingResult.rows.forEach((row) => {
        const parsedRow = {
          id: row.id,
          pay_code_id: row.pay_code_id,
          description: row.description,
          pay_type: row.pay_type,
          rate_unit: row.rate_unit,
          rate_biasa: row.rate_biasa === null ? null : parseFloat(row.rate_biasa),
          rate_ahad: row.rate_ahad === null ? null : parseFloat(row.rate_ahad),
          rate_umum: row.rate_umum === null ? null : parseFloat(row.rate_umum),
          is_active: row.is_active,
          requires_units_input: row.requires_units_input,
        };

        if (!detailedMappings[row.product_id]) {
          detailedMappings[row.product_id] = [];
        }
        detailedMappings[row.product_id].push(parsedRow);
      });

      res.json({
        products,
        detailedMappings,
      });
    } catch (error) {
      console.error("Error fetching product pay code mappings:", error);
      res.status(500).json({
        message: "Error fetching product pay code mappings",
        error: error.message,
      });
    }
  });

  // GET /:productId - Get pay codes for a specific product
  router.get("/:productId", async (req, res) => {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    try {
      const query = `
        SELECT
          ppc.product_id,
          ppc.pay_code_id,
          pc.id,
          pc.description,
          pc.pay_type,
          pc.rate_unit,
          CAST(pc.rate_biasa AS NUMERIC(10, 2)) AS rate_biasa,
          CAST(pc.rate_ahad AS NUMERIC(10, 2)) AS rate_ahad,
          CAST(pc.rate_umum AS NUMERIC(10, 2)) AS rate_umum,
          pc.is_active,
          pc.requires_units_input
        FROM product_pay_codes ppc
        JOIN pay_codes pc ON ppc.pay_code_id = pc.id
        WHERE ppc.product_id = $1
        ORDER BY pc.id
      `;
      const result = await pool.query(query, [productId]);

      const details = result.rows.map((row) => ({
        id: row.id,
        pay_code_id: row.pay_code_id,
        description: row.description,
        pay_type: row.pay_type,
        rate_unit: row.rate_unit,
        rate_biasa: row.rate_biasa === null ? null : parseFloat(row.rate_biasa),
        rate_ahad: row.rate_ahad === null ? null : parseFloat(row.rate_ahad),
        rate_umum: row.rate_umum === null ? null : parseFloat(row.rate_umum),
        is_active: row.is_active,
        requires_units_input: row.requires_units_input,
      }));

      res.json(details);
    } catch (error) {
      console.error("Error fetching product pay codes:", error);
      res.status(500).json({
        message: "Error fetching product pay codes",
        error: error.message,
      });
    }
  });

  // POST /batch - Add multiple product-paycode associations
  router.post("/batch", async (req, res) => {
    const { associations } = req.body;

    if (!associations || !Array.isArray(associations) || associations.length === 0) {
      return res.status(400).json({
        message: "An array of associations is required",
      });
    }

    try {
      // Validate all entries first
      for (const entry of associations) {
        const { product_id, pay_code_id } = entry;
        if (!product_id || !pay_code_id) {
          return res.status(400).json({
            message: "All entries must have product_id and pay_code_id",
            invalid_entry: entry,
          });
        }
      }

      const results = [];
      const errors = [];
      let successCount = 0;

      await pool.query("BEGIN");

      for (const entry of associations) {
        const { product_id, pay_code_id } = entry;

        try {
          // Check if the association already exists
          const checkQuery =
            "SELECT 1 FROM product_pay_codes WHERE product_id = $1 AND pay_code_id = $2";
          const checkResult = await pool.query(checkQuery, [product_id, pay_code_id]);

          if (checkResult.rows.length > 0) {
            errors.push({
              product_id,
              pay_code_id,
              message: "Association already exists",
            });
            continue;
          }

          // Insert the association
          const insertQuery = `
            INSERT INTO product_pay_codes (product_id, pay_code_id)
            VALUES ($1, $2)
            RETURNING *
          `;
          const result = await pool.query(insertQuery, [product_id, pay_code_id]);
          results.push(result.rows[0]);
          successCount++;
        } catch (error) {
          errors.push({
            product_id,
            pay_code_id,
            message: error.code === "23503"
              ? "Invalid product_id or pay_code_id"
              : error.message,
          });
        }
      }

      if (successCount > 0) {
        // Update pay code timestamps for affected pay codes
        const uniquePayCodeIds = [...new Set(associations.map((a) => a.pay_code_id))];
        if (uniquePayCodeIds.length > 0) {
          const updatePayCodeQuery = `
            UPDATE pay_codes
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ANY($1)
          `;
          await pool.query(updatePayCodeQuery, [uniquePayCodeIds]);
        }

        await pool.query("COMMIT");
        return res.status(201).json({
          message: `Successfully added ${successCount} of ${associations.length} associations`,
          added: results,
          errors: errors.length > 0 ? errors : undefined,
        });
      } else {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: "Failed to add any associations",
          errors,
        });
      }
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error in batch association:", error);
      res.status(500).json({
        message: "Error processing batch association",
        error: error.message,
      });
    }
  });

  // POST /batch-delete - Remove multiple product-paycode associations
  router.post("/batch-delete", async (req, res) => {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "An array of items to delete is required",
      });
    }

    try {
      // Validate all entries first
      for (const item of items) {
        const { product_id, pay_code_id } = item;
        if (!product_id || !pay_code_id) {
          return res.status(400).json({
            message: "All items must have product_id and pay_code_id",
            invalid_item: item,
          });
        }
      }

      await pool.query("BEGIN");

      const results = [];
      const errors = [];
      let successCount = 0;

      for (const item of items) {
        const { product_id, pay_code_id } = item;

        try {
          const query = `
            DELETE FROM product_pay_codes
            WHERE product_id = $1 AND pay_code_id = $2
            RETURNING product_id, pay_code_id
          `;
          const result = await pool.query(query, [product_id, pay_code_id]);

          if (result.rows.length > 0) {
            results.push(result.rows[0]);
            successCount++;
          } else {
            errors.push({
              product_id,
              pay_code_id,
              message: "Association not found",
            });
          }
        } catch (error) {
          errors.push({
            product_id,
            pay_code_id,
            message: error.message,
          });
        }
      }

      if (successCount > 0) {
        // Update pay code timestamps for affected pay codes
        const uniquePayCodeIds = [...new Set(items.map((i) => i.pay_code_id))];
        if (uniquePayCodeIds.length > 0) {
          const updatePayCodeQuery = `
            UPDATE pay_codes
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ANY($1)
          `;
          await pool.query(updatePayCodeQuery, [uniquePayCodeIds]);
        }

        await pool.query("COMMIT");
        return res.json({
          message: `Successfully deleted ${successCount} of ${items.length} associations`,
          deleted: results,
          errors: errors.length > 0 ? errors : undefined,
        });
      } else {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: "Failed to delete any associations",
          errors,
        });
      }
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error in batch delete:", error);
      res.status(500).json({
        message: "Error processing batch delete",
        error: error.message,
      });
    }
  });

  return router;
}
