// src/routes/stock/production-entries.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET /api/production-entries - List entries with filters
  router.get("/", async (req, res) => {
    try {
      const { date, product_id, worker_id, start_date, end_date } = req.query;

      let query = `
        SELECT
          pe.id,
          pe.entry_date,
          pe.product_id,
          pe.worker_id,
          pe.bags_packed,
          pe.created_at,
          pe.updated_at,
          pe.created_by,
          s.name as worker_name,
          p.description as product_description,
          p.type as product_type
        FROM production_entries pe
        LEFT JOIN staffs s ON pe.worker_id = s.id
        LEFT JOIN products p ON pe.product_id = p.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (date) {
        query += ` AND pe.entry_date = $${paramCount++}`;
        params.push(date);
      }

      if (start_date && end_date) {
        query += ` AND pe.entry_date BETWEEN $${paramCount++} AND $${paramCount++}`;
        params.push(start_date, end_date);
      }

      if (product_id) {
        query += ` AND pe.product_id = $${paramCount++}`;
        params.push(product_id);
      }

      if (worker_id) {
        query += ` AND pe.worker_id = $${paramCount++}`;
        params.push(worker_id);
      }

      query += ` ORDER BY pe.entry_date DESC, s.name ASC`;

      const result = await pool.query(query, params);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching production entries:", error);
      res.status(500).json({
        message: "Error fetching production entries",
        error: error.message,
      });
    }
  });

  // GET /api/production-entries/workers - Get workers by product type (MEE_PACKING/BH_PACKING)
  router.get("/workers", async (req, res) => {
    try {
      const { product_type } = req.query;

      if (!product_type) {
        return res.status(400).json({
          message: "product_type parameter is required (MEE or BH)",
        });
      }

      // Map product type to job type
      const jobFilter =
        product_type.toUpperCase() === "MEE" ? "MEE_PACKING" : "BH_PACKING";

      const query = `
        SELECT
          id,
          name,
          job
        FROM staffs
        WHERE job::jsonb ? $1
          AND (date_resigned IS NULL OR date_resigned > CURRENT_DATE)
        ORDER BY name ASC
      `;

      const result = await pool.query(query, [jobFilter]);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching workers:", error);
      res.status(500).json({
        message: "Error fetching workers",
        error: error.message,
      });
    }
  });

  // GET /api/production-entries/daily-summary - Get production totals for a date and product
  router.get("/daily-summary", async (req, res) => {
    try {
      const { date, product_id } = req.query;

      if (!date || !product_id) {
        return res.status(400).json({
          message: "date and product_id parameters are required",
        });
      }

      const query = `
        SELECT
          pe.entry_date,
          pe.product_id,
          p.description as product_description,
          p.type as product_type,
          SUM(pe.bags_packed) as total_bags,
          COUNT(pe.worker_id) as worker_count
        FROM production_entries pe
        LEFT JOIN products p ON pe.product_id = p.id
        WHERE pe.entry_date = $1 AND pe.product_id = $2
        GROUP BY pe.entry_date, pe.product_id, p.description, p.type
      `;

      const result = await pool.query(query, [date, product_id]);

      if (result.rows.length === 0) {
        return res.json({
          entry_date: date,
          product_id: product_id,
          total_bags: 0,
          worker_count: 0,
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching daily summary:", error);
      res.status(500).json({
        message: "Error fetching daily summary",
        error: error.message,
      });
    }
  });

  // GET /api/production-entries/date-range-summary - Get production totals for date range by product
  router.get("/date-range-summary", async (req, res) => {
    try {
      const { start_date, end_date, product_id } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          message: "start_date and end_date parameters are required",
        });
      }

      let query = `
        SELECT
          pe.entry_date,
          pe.product_id,
          p.description as product_description,
          SUM(pe.bags_packed) as total_bags
        FROM production_entries pe
        LEFT JOIN products p ON pe.product_id = p.id
        WHERE pe.entry_date BETWEEN $1 AND $2
      `;

      const params = [start_date, end_date];

      if (product_id) {
        query += ` AND pe.product_id = $3`;
        params.push(product_id);
      }

      query += `
        GROUP BY pe.entry_date, pe.product_id, p.description
        ORDER BY pe.entry_date ASC
      `;

      const result = await pool.query(query, params);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching date range summary:", error);
      res.status(500).json({
        message: "Error fetching date range summary",
        error: error.message,
      });
    }
  });

  // POST /api/production-entries - Create single entry
  router.post("/", async (req, res) => {
    try {
      const { entry_date, product_id, worker_id, bags_packed, created_by } =
        req.body;

      if (!entry_date || !product_id || !worker_id) {
        return res.status(400).json({
          message: "entry_date, product_id, and worker_id are required",
        });
      }

      const query = `
        INSERT INTO production_entries (entry_date, product_id, worker_id, bags_packed, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (entry_date, product_id, worker_id)
        DO UPDATE SET
          bags_packed = EXCLUDED.bags_packed,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await pool.query(query, [
        entry_date,
        product_id,
        worker_id,
        bags_packed || 0,
        created_by || null,
      ]);

      res.status(201).json({
        message: "Production entry saved successfully",
        entry: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating production entry:", error);
      res.status(500).json({
        message: "Error creating production entry",
        error: error.message,
      });
    }
  });

  // POST /api/production-entries/batch - Batch upsert entries (for daily entry form)
  router.post("/batch", async (req, res) => {
    try {
      const { date, product_id, entries, created_by } = req.body;

      if (!date || !product_id || !Array.isArray(entries)) {
        return res.status(400).json({
          message: "date, product_id, and entries array are required",
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const savedEntries = [];
        let totalBags = 0;

        for (const entry of entries) {
          const { worker_id, bags_packed } = entry;

          if (!worker_id) continue;

          // Skip entries with 0 bags - optionally delete them
          if (!bags_packed || bags_packed === 0) {
            // Delete existing entry if bags is 0
            await client.query(
              `DELETE FROM production_entries
               WHERE entry_date = $1 AND product_id = $2 AND worker_id = $3`,
              [date, product_id, worker_id]
            );
            continue;
          }

          const query = `
            INSERT INTO production_entries (entry_date, product_id, worker_id, bags_packed, created_by)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (entry_date, product_id, worker_id)
            DO UPDATE SET
              bags_packed = EXCLUDED.bags_packed,
              updated_at = CURRENT_TIMESTAMP
            RETURNING *
          `;

          const result = await client.query(query, [
            date,
            product_id,
            worker_id,
            bags_packed,
            created_by || null,
          ]);

          savedEntries.push(result.rows[0]);
          totalBags += bags_packed;
        }

        await client.query("COMMIT");

        res.json({
          message: "Production entries saved successfully",
          entries: savedEntries,
          total_bags: totalBags,
          entry_count: savedEntries.length,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error batch saving production entries:", error);
      res.status(500).json({
        message: "Error saving production entries",
        error: error.message,
      });
    }
  });

  // PUT /api/production-entries/:id - Update single entry
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { bags_packed } = req.body;

      if (bags_packed === undefined) {
        return res.status(400).json({
          message: "bags_packed is required",
        });
      }

      const query = `
        UPDATE production_entries
        SET bags_packed = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await pool.query(query, [bags_packed, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Production entry not found",
        });
      }

      res.json({
        message: "Production entry updated successfully",
        entry: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating production entry:", error);
      res.status(500).json({
        message: "Error updating production entry",
        error: error.message,
      });
    }
  });

  // DELETE /api/production-entries/:id - Delete single entry
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const query = `DELETE FROM production_entries WHERE id = $1 RETURNING *`;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Production entry not found",
        });
      }

      res.json({
        message: "Production entry deleted successfully",
        entry: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting production entry:", error);
      res.status(500).json({
        message: "Error deleting production entry",
        error: error.message,
      });
    }
  });

  return router;
}
