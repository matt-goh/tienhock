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

      // First apply changes directly to the original customer
      // Process deletions if any
      if (deletedProductIds && deletedProductIds.length > 0) {
        const deleteQuery = `
        DELETE FROM customer_products 
        WHERE customer_id = $1 AND product_id = ANY($2)
      `;
        await client.query(deleteQuery, [customerId, deletedProductIds]);
      }

      // Apply products to the original customer
      if (products && products.length > 0) {
        for (const product of products) {
          const { productId, customPrice, isAvailable } = product;

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

      // Now propagate changes to branch customers
      // Find any branch groups this customer belongs to (WITHOUT excluding the current customer)
      const branchQuery = `
      SELECT cbg.id AS group_id, cm.customer_id
      FROM customer_branch_mappings cm
      JOIN customer_branch_groups cbg ON cm.group_id = cbg.id
      WHERE EXISTS (
        SELECT 1 FROM customer_branch_mappings 
        WHERE group_id = cbg.id AND customer_id = $1
      )
      AND cm.customer_id != $1  -- Only propagate to OTHER customers, not the originating one
    `;

      const branchResult = await client.query(branchQuery, [customerId]);

      if (branchResult.rows.length > 0) {
        // Map of customers by group ID
        const branchCustomersByGroup = branchResult.rows.reduce((acc, row) => {
          if (!acc[row.group_id]) {
            acc[row.group_id] = [];
          }
          acc[row.group_id].push(row.customer_id);
          return acc;
        }, {});

        // For each product updated, apply to all branch customers
        if (products && products.length > 0) {
          for (const product of products) {
            const { productId, customPrice, isAvailable } = product;

            // For each group
            for (const [groupId, branchCustomers] of Object.entries(
              branchCustomersByGroup
            )) {
              // For each customer in the group
              for (const branchCustomerId of branchCustomers) {
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
                  branchCustomerId,
                  productId,
                  customPrice || 0,
                  isAvailable === undefined ? true : isAvailable,
                ]);
              }
            }
          }
        }

        // Also propagate deletions if any
        if (deletedProductIds && deletedProductIds.length > 0) {
          for (const [groupId, branchCustomers] of Object.entries(
            branchCustomersByGroup
          )) {
            for (const branchCustomerId of branchCustomers) {
              const deleteQuery = `
              DELETE FROM customer_products 
              WHERE customer_id = $1 AND product_id = ANY($2)
            `;
              await client.query(deleteQuery, [
                branchCustomerId,
                deletedProductIds,
              ]);
            }
          }
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
