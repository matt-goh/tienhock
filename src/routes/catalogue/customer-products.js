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
    const { customerId, products } = req.body;

    if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "No products provided" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // First delete any existing products for this customer
      await client.query(
        "DELETE FROM customer_products WHERE customer_id = $1",
        [customerId]
      );

      // Then insert the new products
      for (const product of products) {
        await client.query(
          "INSERT INTO customer_products (customer_id, product_id, custom_price, is_available) VALUES ($1, $2, $3, $4)",
          [
            customerId,
            product.productId,
            product.customPrice,
            product.isAvailable,
          ]
        );
      }

      await client.query("COMMIT");
      res.status(200).json({
        message: "Products updated successfully",
        count: products.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating customer products:", error);
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
