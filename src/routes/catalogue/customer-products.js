// src/routes/catalogue/customer-products.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all customer-product relationships (for mobile app)
  router.get("/all", async (req, res) => {
    try {
      // Optional customer filter
      const customerId = req.query.customerId;

      // Build the query with optional customer filter
      let queryParams = [];
      let whereClause = "";

      if (customerId) {
        whereClause = "WHERE customer_id = $1";
        queryParams.push(customerId);
      }

      // Simple query for customer product relationships
      const query = `
      SELECT 
        customer_id,
        product_id,
        custom_price,
        is_available
      FROM customer_products
      ${whereClause}
      ORDER BY customer_id, product_id
    `;

      const result = await pool.query(query, queryParams);

      // Convert custom_price to a number
      const customerProductsWithNumberValues = result.rows.map((cp) => ({
        ...cp,
        custom_price: cp.custom_price !== null ? Number(cp.custom_price) : null,
      }));

      // Return just the data array
      res.json(customerProductsWithNumberValues);
    } catch (error) {
      console.error("Error fetching customer products:", error);
      res.status(500).json({
        message: "Error fetching customer products data",
        error: error.message,
      });
    }
  });

  // Get all custom products for a specific customer
  router.get("/:customerId", async (req, res) => {
    try {
      const { customerId } = req.params;

      // First check if customer exists and get customer details
      const customerCheck = await pool.query(
        "SELECT id, tin_number, id_number FROM customers WHERE id = $1",
        [customerId]
      );

      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          // Not Found instead of continuing with empty results
          message: "Customer not found",
          customerId,
        });
      }

      const customerDetails = customerCheck.rows[0];

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

      // Return both customer details and products
      res.status(200).json({
        customer: {
          id: customerDetails.id,
          tin_number: customerDetails.tin_number,
          id_number: customerDetails.id_number,
        },
        products: result.rows,
      });
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
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    // Add this check to verify the customer exists before proceeding
    try {
      const customerCheck = await pool.query(
        "SELECT id FROM customers WHERE id = $1",
        [customerId]
      );

      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `Customer with ID '${customerId}' not found`,
        });
      }
    } catch (checkError) {
      console.error("Error checking customer existence:", checkError);
      return res.status(500).json({
        success: false,
        message: "Error verifying customer",
        error: checkError.message,
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Process deletions if any
      if (deletedProductIds && deletedProductIds.length > 0) {
        console.log(
          `Deleting ${deletedProductIds.length} products for customer ${customerId}`
        );
        const deleteQuery = `
          DELETE FROM customer_products 
          WHERE customer_id = $1 AND product_id = ANY($2)
        `;
        await client.query(deleteQuery, [customerId, deletedProductIds]);
      }

      // Process upserts
      if (products && products.length > 0) {
        console.log(
          `Upserting ${products.length} products for customer ${customerId}`
        );

        for (const product of products) {
          const { productId, customPrice, isAvailable } = product;

          if (!productId) {
            console.warn("Skipping product with no ID");
            continue;
          }

          const upsertQuery = `
            INSERT INTO customer_products 
              (customer_id, product_id, custom_price, is_available) 
            VALUES 
              ($1, $2, $3, $4)
            ON CONFLICT (customer_id, product_id) 
            DO UPDATE SET
              custom_price = EXCLUDED.custom_price,
              is_available = EXCLUDED.is_available
          `;

          await client.query(upsertQuery, [
            customerId,
            productId,
            customPrice || 0,
            isAvailable === undefined ? true : isAvailable,
          ]);
        }
      }

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Customer products updated successfully",
        updatedCount: products?.length || 0,
        deletedCount: deletedProductIds?.length || 0,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error in batch operation:", error);
      res.status(500).json({
        success: false,
        message: "Error updating customer products",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
