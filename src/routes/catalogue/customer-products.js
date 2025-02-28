// src/routes/catalogue/customer-products.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all custom products for a specific customer
  router.get("/:customerId", async (req, res) => {
    try {
      const { customerId } = req.params;

      const query = `
        SELECT 
          cp.id,
          cp.customer_id,
          cp.product_id,
          cp.custom_price,
          cp.is_available,
          p.description
        FROM customer_products cp
        JOIN products p ON cp.product_id = p.id
        WHERE cp.customer_id = $1
      `;

      const result = await pool.query(query, [customerId]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching custom products:", error);
      res.status(500).json({
        message: "Error fetching custom products",
        error: error.message,
      });
    }
  });

  // Batch add/update customer products
  router.post("/batch", async (req, res) => {
    const { customerId, products, deletedProductIds = [] } = req.body;

    if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Process deletions first if any
      if (deletedProductIds.length > 0) {
        const deleteQuery = `
          DELETE FROM customer_products 
          WHERE customer_id = $1 AND product_id = ANY($2)
        `;
        await client.query(deleteQuery, [customerId, deletedProductIds]);
      }

      // Process upserts
      if (products && products.length > 0) {
        // Existing upsert logic...
      }

      await client.query("COMMIT");
      res.status(200).json({
        message: "Customer products updated successfully",
        deletedCount: deletedProductIds.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error in batch operation:", error);
      res.status(500).json({
        message: "Error updating customer products",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
