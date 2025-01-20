// src/routes/taxes.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Create a new tax entry
  router.post("/", async (req, res) => {
    const { name, rate } = req.body;

    try {
      const query = `
        INSERT INTO taxes (name, rate)
        VALUES ($1, $2)
        RETURNING *
      `;

      const values = [name, rate];

      const result = await pool.query(query, values);
      res.status(201).json({
        message: "Tax entry created successfully",
        tax: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505") {
        // unique_violation error code
        return res
          .status(400)
          .json({ message: "A tax entry with this name already exists" });
      }
      console.error("Error creating tax entry:", error);
      res
        .status(500)
        .json({ message: "Error creating tax entry", error: error.message });
    }
  });

  // Get all tax entries
  router.get("/", async (req, res) => {
    try {
      const query = "SELECT * FROM taxes";
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching tax entries:", error);
      res
        .status(500)
        .json({ message: "Error fetching tax entries", error: error.message });
    }
  });

  // Update a tax entry
  router.put("/:name", async (req, res) => {
    const { name } = req.params;
    const { rate } = req.body;

    try {
      const query = `
        UPDATE taxes
        SET rate = $1
        WHERE name = $2
        RETURNING *
      `;

      const values = [rate, name];

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Tax entry not found" });
      }

      res.json({
        message: "Tax entry updated successfully",
        tax: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating tax entry:", error);
      res
        .status(500)
        .json({ message: "Error updating tax entry", error: error.message });
    }
  });

  // Delete tax entries (batch delete)
  router.delete("/", async (req, res) => {
    // Get the array from 'taxes' property instead of 'taxIds'
    const taxIds = req.body.taxes;

    // Input validation
    if (!Array.isArray(taxIds) || taxIds.length === 0) {
      return res.status(400).json({
        message: "Invalid input: tax names array must be non-empty",
        deletedTaxNames: [],
      });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Log the query and values
        const deleteTaxesQuery = `
          DELETE FROM taxes 
          WHERE name = ANY($1::text[]) 
          RETURNING name
        `;

        const result = await client.query(deleteTaxesQuery, [taxIds]);
        await client.query("COMMIT");

        const deletedNames = result.rows.map((row) => row.name);

        res.status(200).json({
          message:
            deletedNames.length > 0
              ? `Successfully deleted ${deletedNames.length} tax entries`
              : "No matching tax entries found to delete",
          deletedTaxNames: deletedNames,
        });
      } catch (error) {
        console.error("Database error:", error);
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error deleting taxes:", error);
      res.status(500).json({
        message: "Error deleting taxes",
        error: error.message,
        deletedTaxNames: [],
      });
    }
  });

  // Batch update/insert tax entries
  router.post("/batch", async (req, res) => {
    const { taxes } = req.body;

    if (!Array.isArray(taxes)) {
      return res
        .status(400)
        .json({ message: "Invalid input: taxes must be an array" });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const processedTaxes = [];

        for (const tax of taxes) {
          const { name, rate } = tax;

          const upsertQuery = `
            INSERT INTO taxes (name, rate)
            VALUES ($1, $2)
            ON CONFLICT (name) DO UPDATE
            SET rate = EXCLUDED.rate
            RETURNING *
          `;
          const upsertValues = [name, rate];
          const result = await client.query(upsertQuery, upsertValues);
          processedTaxes.push(result.rows[0]);
        }

        await client.query("COMMIT");
        res.json({
          message: "Tax entries processed successfully",
          taxes: processedTaxes,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error processing tax entries:", error);
      res.status(500).json({
        message: "Error processing tax entries",
        error: error.message,
      });
    }
  });

  return router;
}
