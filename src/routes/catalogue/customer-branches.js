// src/routes/catalogue/customer-branches.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Create a new branch group
  router.post("/", async (req, res) => {
    const { group_name, branches } = req.body;

    if (
      !group_name ||
      !branches ||
      !Array.isArray(branches) ||
      branches.length === 0
    ) {
      return res.status(400).json({
        message: "Group name and at least one branch are required",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Create the group
      const createGroupQuery = `
        INSERT INTO customer_branch_groups (group_name)
        VALUES ($1)
        RETURNING id
      `;

      const groupResult = await client.query(createGroupQuery, [group_name]);
      const groupId = groupResult.rows[0].id;

      // Add branches to the group
      for (const branch of branches) {
        const { customer_id, is_main_branch } = branch;

        const addBranchQuery = `
          INSERT INTO customer_branch_mappings (group_id, customer_id, is_main_branch)
          VALUES ($1, $2, $3)
        `;

        await client.query(addBranchQuery, [
          groupId,
          customer_id,
          is_main_branch === true,
        ]);
      }

      // After creating the branch group and setting up mappings:
      // Find the main branch
      const mainBranch = branches.find((b) => b.is_main_branch);
      if (mainBranch) {
        // Get e-Invoice information from main branch
        const mainBranchQuery = `
    SELECT tin_number, id_number, id_type
    FROM customers
    WHERE id = $1
  `;
        const mainBranchResult = await client.query(mainBranchQuery, [
          mainBranch.customer_id,
        ]);

        if (mainBranchResult.rows.length > 0) {
          const { tin_number, id_number, id_type } = mainBranchResult.rows[0];

          // Apply to all other branches in the group
          const updateQuery = `
      UPDATE customers
      SET tin_number = $1, id_number = $2, id_type = $3
      WHERE id = $4
    `;

          for (const branch of branches) {
            if (branch.customer_id !== mainBranch.customer_id) {
              await client.query(updateQuery, [
                tin_number,
                id_number,
                id_type,
                branch.customer_id,
              ]);
            }
          }
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Branch group created successfully",
        group_id: groupId,
        group_name,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating branch group:", error);
      res.status(500).json({
        message: "Error creating branch group",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Add customers to a branch group
  router.post("/:groupId/add", async (req, res) => {
    const { groupId } = req.params;
    const { customer_ids } = req.body;

    if (
      !customer_ids ||
      !Array.isArray(customer_ids) ||
      customer_ids.length === 0
    ) {
      return res.status(400).json({
        message: "At least one customer ID is required",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if group exists
      const checkGroupQuery = `SELECT 1 FROM customer_branch_groups WHERE id = $1`;
      const groupResult = await client.query(checkGroupQuery, [groupId]);

      if (groupResult.rows.length === 0) {
        throw new Error(`Branch group with ID ${groupId} not found`);
      }

      // Find the main branch for this group to get e-Invoice info
      const mainBranchQuery = `
      SELECT c.tin_number, c.id_number, c.id_type, cbm.customer_id
      FROM customer_branch_mappings cbm
      JOIN customers c ON cbm.customer_id = c.id
      WHERE cbm.group_id = $1 AND cbm.is_main_branch = true
    `;

      const mainBranchResult = await client.query(mainBranchQuery, [groupId]);

      let tin_number = null;
      let id_number = null;
      let id_type = null;

      if (mainBranchResult.rows.length > 0) {
        tin_number = mainBranchResult.rows[0].tin_number;
        id_number = mainBranchResult.rows[0].id_number;
        id_type = mainBranchResult.rows[0].id_type;
      }

      // Add each customer to the group
      for (const customerId of customer_ids) {
        // Check if mapping already exists
        const checkMappingQuery = `
        SELECT 1 FROM customer_branch_mappings
        WHERE group_id = $1 AND customer_id = $2
      `;

        const mappingResult = await client.query(checkMappingQuery, [
          groupId,
          customerId,
        ]);

        if (mappingResult.rows.length === 0) {
          const addMappingQuery = `
          INSERT INTO customer_branch_mappings (group_id, customer_id, is_main_branch)
          VALUES ($1, $2, false)
        `;

          await client.query(addMappingQuery, [groupId, customerId]);

          // Update e-Invoice info if available
          if (tin_number !== null || id_number !== null || id_type !== null) {
            const updateQuery = `
            UPDATE customers
            SET tin_number = $1, id_number = $2, id_type = $3
            WHERE id = $4
          `;

            await client.query(updateQuery, [
              tin_number,
              id_number,
              id_type,
              customerId,
            ]);
          }
        }
      }

      // Sync custom products from main branch to all new branches
      if (mainBranchResult.rows.length > 0) {
        const mainBranchId = mainBranchResult.rows[0].customer_id;

        // Get all custom products from main branch
        const productsQuery = `
        SELECT product_id, custom_price, is_available 
        FROM customer_products
        WHERE customer_id = $1
      `;

        const productsResult = await client.query(productsQuery, [
          mainBranchId,
        ]);

        if (productsResult.rows.length > 0) {
          // For each new customer, copy all custom products
          for (const customerId of customer_ids) {
            for (const product of productsResult.rows) {
              const upsertQuery = `
              INSERT INTO customer_products (customer_id, product_id, custom_price, is_available)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (customer_id, product_id) 
              DO UPDATE SET
                custom_price = EXCLUDED.custom_price,
                is_available = EXCLUDED.is_available
            `;

              await client.query(upsertQuery, [
                customerId,
                product.product_id,
                product.custom_price,
                product.is_available,
              ]);
            }
          }
        }
      }

      await client.query("COMMIT");

      res.json({
        message: "Customers added to branch group successfully",
        group_id: groupId,
        added_customer_count: customer_ids.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error adding customers to branch group:", error);
      res.status(500).json({
        message: "Error adding customers to branch group",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Set a customer as the main branch
  router.put("/:groupId/main/:customerId", async (req, res) => {
    const { groupId, customerId } = req.params;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if the mapping exists
      const checkMappingQuery = `
        SELECT 1 FROM customer_branch_mappings
        WHERE group_id = $1 AND customer_id = $2
      `;

      const mappingResult = await client.query(checkMappingQuery, [
        groupId,
        customerId,
      ]);

      if (mappingResult.rows.length === 0) {
        throw new Error(
          `Customer ${customerId} is not part of branch group ${groupId}`
        );
      }

      // Set all branches to not be main
      const resetMainQuery = `
        UPDATE customer_branch_mappings
        SET is_main_branch = false
        WHERE group_id = $1
      `;

      await client.query(resetMainQuery, [groupId]);

      // Set this customer as main branch
      const setMainQuery = `
        UPDATE customer_branch_mappings
        SET is_main_branch = true
        WHERE group_id = $1 AND customer_id = $2
      `;

      await client.query(setMainQuery, [groupId, customerId]);

      await client.query("COMMIT");

      res.json({
        message: "Main branch updated successfully",
        group_id: groupId,
        main_branch_customer_id: customerId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error setting main branch:", error);
      res.status(500).json({
        message: "Error setting main branch",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Remove a customer from a branch group
  router.delete("/:groupId/remove/:customerId", async (req, res) => {
    const { groupId, customerId } = req.params;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if the customer is the main branch
      const checkMainQuery = `
        SELECT is_main_branch FROM customer_branch_mappings
        WHERE group_id = $1 AND customer_id = $2
      `;

      const mainResult = await client.query(checkMainQuery, [
        groupId,
        customerId,
      ]);

      if (mainResult.rows.length === 0) {
        throw new Error(
          `Customer ${customerId} is not part of branch group ${groupId}`
        );
      }

      const isMainBranch = mainResult.rows[0].is_main_branch;

      // Count remaining branches
      const countQuery = `
        SELECT COUNT(*) FROM customer_branch_mappings
        WHERE group_id = $1
      `;

      const countResult = await client.query(countQuery, [groupId]);
      const totalBranches = parseInt(countResult.rows[0].count);

      if (isMainBranch && totalBranches > 1) {
        // If removing the main branch, assign a new one
        const newMainQuery = `
          UPDATE customer_branch_mappings
          SET is_main_branch = true
          WHERE group_id = $1 AND customer_id != $2
          LIMIT 1
        `;

        await client.query(newMainQuery, [groupId, customerId]);
      }

      // Remove the customer from the group
      const removeQuery = `
        DELETE FROM customer_branch_mappings
        WHERE group_id = $1 AND customer_id = $2
      `;

      await client.query(removeQuery, [groupId, customerId]);

      // If this was the last branch, delete the group
      if (totalBranches <= 1) {
        const deleteGroupQuery = `
          DELETE FROM customer_branch_groups
          WHERE id = $1
        `;

        await client.query(deleteGroupQuery, [groupId]);
      }

      await client.query("COMMIT");

      res.json({
        message: "Customer removed from branch group successfully",
        group_id: groupId,
        customer_id: customerId,
        group_deleted: totalBranches <= 1,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error removing customer from branch group:", error);
      res.status(500).json({
        message: "Error removing customer from branch group",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Delete an entire branch group with cascade
  router.delete("/:groupId", async (req, res) => {
    const { groupId } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // First check if the group exists
      const checkGroupQuery = `SELECT 1 FROM customer_branch_groups WHERE id = $1`;
      const groupResult = await client.query(checkGroupQuery, [groupId]);

      if (groupResult.rows.length === 0) {
        throw new Error(`Branch group with ID ${groupId} not found`);
      }

      // Delete all mappings for this group
      const deleteMapQuery = `DELETE FROM customer_branch_mappings WHERE group_id = $1`;
      await client.query(deleteMapQuery, [groupId]);

      // Delete the group itself
      const deleteGroupQuery = `DELETE FROM customer_branch_groups WHERE id = $1`;
      await client.query(deleteGroupQuery, [groupId]);

      await client.query("COMMIT");

      res.json({
        message: "Branch group deleted successfully",
        group_id: groupId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting branch group:", error);
      res.status(500).json({
        message: "Error deleting branch group",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
