// src/routes/catalogue/customer-branches.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get branch groups for a customer
  router.get("/:customerId", async (req, res) => {
    const { customerId } = req.params;

    try {
      // Get all branch groups this customer belongs to
      const query = `
        WITH customer_groups AS (
          SELECT
            cbg.id,
            cbg.group_name,
            cbm.customer_id,
            cbm.is_main_branch
          FROM customer_branch_groups cbg
          JOIN customer_branch_mappings cbm ON cbg.id = cbm.group_id
          WHERE EXISTS (
            SELECT 1 FROM customer_branch_mappings
            WHERE group_id = cbg.id AND customer_id = $1
          )
        )
        SELECT
          cg.id,
          cg.group_name,
          json_agg(
            json_build_object(
              'customer_id', cg.customer_id,
              'customer_name', c.name,
              'is_main_branch', cg.is_main_branch
            )
          ) AS branches
        FROM customer_groups cg
        JOIN customers c ON cg.customer_id = c.id
        GROUP BY cg.id, cg.group_name;
      `;

      const result = await pool.query(query, [customerId]);

      res.json({
        customer_id: customerId,
        groups: result.rows,
      });
    } catch (error) {
      console.error("Error fetching branch groups:", error);
      res.status(500).json({
        message: "Error fetching branch groups",
        error: error.message,
      });
    }
  });

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

  return router;
}
