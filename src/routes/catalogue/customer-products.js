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

  // Add a product to a customer's list
  router.post("/", async (req, res) => {
    try {
      const { customerId, productId, customPrice, isAvailable } = req.body;

      const query = `
        INSERT INTO customer_products (customer_id, product_id, custom_price, is_available)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const result = await pool.query(query, [
        customerId,
        productId,
        customPrice,
        isAvailable,
      ]);
      res.status(201).json({
        message: "Custom product added successfully",
        customerProduct: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(400).json({
          message: "This product already exists for this customer",
        });
      }

      console.error("Error adding custom product:", error);
      res.status(500).json({
        message: "Error adding custom product",
        error: error.message,
      });
    }
  });

  // Update a customer's product
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { customPrice, isAvailable } = req.body;

      const query = `
        UPDATE customer_products
        SET custom_price = $1, is_available = $2
        WHERE id = $3
        RETURNING *
      `;

      const result = await pool.query(query, [customPrice, isAvailable, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Custom product not found" });
      }

      res.json({
        message: "Custom product updated successfully",
        customerProduct: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating custom product:", error);
      res.status(500).json({
        message: "Error updating custom product",
        error: error.message,
      });
    }
  });

  // Delete a customer's product
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const query = "DELETE FROM customer_products WHERE id = $1 RETURNING *";
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Custom product not found" });
      }

      res.json({
        message: "Custom product deleted successfully",
        customerProduct: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting custom product:", error);
      res.status(500).json({
        message: "Error deleting custom product",
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
