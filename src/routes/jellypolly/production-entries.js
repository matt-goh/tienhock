// src/routes/jellypolly/production-entries.js
// Jelly Polly production entries. Port of stock/production-entries.js onto the
// JP catalogue: entries + worker orders live in the jellypolly schema, workers
// come from the JP PRODUCTION assignments, and machine-broken status stays in
// the shared public.production_machine_status (product-keyed; JP products are
// disjoint). Every save reprocesses the affected workers' JP payroll.
import { Router } from "express";
import { reprocessJPEmployeesSafe } from "./jpPayrollProcessor.js";

const STOCK_ONLY_WORKER_ID = "__STOCK_ONLY__";
// JP has no stock-only production products
const STOCK_ONLY_PRODUCT_IDS = new Set();
const WORKER_ORDER_SCOPES = new Set(["JP_PRODUCTION"]);

const ensureWorkerOrderTable = async () => {
  // jellypolly.production_worker_orders is created by the JP migration
};

const validateWorkerOrderScope = (scope) =>
  typeof scope === "string" && WORKER_ORDER_SCOPES.has(scope);

const normalizeWorkerIds = (workerIds) => {
  const seen = new Set();

  return workerIds
    .filter((workerId) => typeof workerId === "string" && workerId.trim())
    .map((workerId) => workerId.trim())
    .filter((workerId) => {
      if (seen.has(workerId)) return false;
      seen.add(workerId);
      return true;
    });
};

// A worker with approved JP leave on the date cannot also have production pay
const getPackingCutiConflicts = async (client, date, productId, workerIds) => {
  const activeWorkerIds = workerIds.filter(Boolean);
  if (activeWorkerIds.length === 0) return [];

  const conflictResult = await client.query(
    `
      SELECT DISTINCT lr.employee_id
      FROM jellypolly.leave_records lr
      WHERE lr.leave_date = $1
        AND lr.employee_id = ANY($2::text[])
        AND lr.status = 'approved'
    `,
    [date, activeWorkerIds],
  );

  return conflictResult.rows.map((row) => row.employee_id);
};

export default function (pool) {
  const router = Router();

  // Production feeds the JP payroll — reprocess the worker's month on change
  const reprocessIfJPProduct = async (productId, entryDate, workerId) => {
    if (!workerId) return;
    const date =
      entryDate instanceof Date
        ? { year: entryDate.getFullYear(), month: entryDate.getMonth() + 1 }
        : (() => {
            const [y, m] = String(entryDate).split("-");
            return { year: parseInt(y), month: parseInt(m) };
          })();
    await reprocessJPEmployeesSafe(pool, {
      year: date.year,
      month: date.month,
      employeeIds: [workerId],
    });
  };

  // ========== MACHINE STATUS ROUTES (must be before /:id routes) ==========

  // GET /api/production-entries/machine-broken - Get machine broken status for a date/product
  router.get("/machine-broken", async (req, res) => {
    try {
      const { date, product_id } = req.query;

      if (!date || !product_id) {
        return res.status(400).json({
          message: "date and product_id are required",
        });
      }

      const result = await pool.query(
        `SELECT machine_broken, notes, updated_at
         FROM production_machine_status
         WHERE entry_date = $1 AND product_id = $2`,
        [date, product_id]
      );

      // Return false if no record exists (default is machine working)
      if (result.rows.length === 0) {
        return res.json({ machine_broken: false, notes: null });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching machine status:", error);
      res.status(500).json({
        message: "Error fetching machine status",
        error: error.message,
      });
    }
  });

  // PUT /api/production-entries/machine-broken - Toggle machine broken status
  router.put("/machine-broken", async (req, res) => {
    try {
      const { date, product_id, machine_broken, notes, created_by } = req.body;

      if (!date || !product_id || machine_broken === undefined) {
        return res.status(400).json({
          message: "date, product_id, and machine_broken are required",
        });
      }

      const result = await pool.query(
        `INSERT INTO production_machine_status (entry_date, product_id, machine_broken, notes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (entry_date, product_id)
         DO UPDATE SET
           machine_broken = EXCLUDED.machine_broken,
           notes = EXCLUDED.notes,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [date, product_id, machine_broken, notes || null, created_by || null]
      );

      res.json({
        message: "Machine status updated",
        status: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating machine status:", error);
      res.status(500).json({
        message: "Error updating machine status",
        error: error.message,
      });
    }
  });

  // ========== END MACHINE STATUS ROUTES ==========

  // GET /api/production-entries/worker-order - Get saved worker order by packing scope
  router.get("/worker-order", async (req, res) => {
    try {
      const { scope } = req.query;

      if (!validateWorkerOrderScope(scope)) {
        return res.status(400).json({
          message: "scope must be JP_PRODUCTION",
        });
      }

      await ensureWorkerOrderTable(pool);

      const result = await pool.query(
        `SELECT worker_id
         FROM jellypolly.production_worker_orders
         WHERE scope = $1
         ORDER BY sort_order ASC, worker_id ASC`,
        [scope]
      );

      res.json({
        scope,
        worker_ids: result.rows.map((row) => row.worker_id),
      });
    } catch (error) {
      console.error("Error fetching worker order:", error);
      res.status(500).json({
        message: "Error fetching worker order",
        error: error.message,
      });
    }
  });

  // PUT /api/production-entries/worker-order - Save worker order by packing scope
  router.put("/worker-order", async (req, res) => {
    try {
      const { scope, worker_ids } = req.body;

      if (!validateWorkerOrderScope(scope)) {
        return res.status(400).json({
          message: "scope must be JP_PRODUCTION",
        });
      }

      if (!Array.isArray(worker_ids)) {
        return res.status(400).json({
          message: "worker_ids array is required",
        });
      }

      const normalizedWorkerIds = normalizeWorkerIds(worker_ids);
      const updatedBy = req.session?.staff?.id || req.session?.staff_id || null;

      await ensureWorkerOrderTable(pool);

      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM jellypolly.production_worker_orders WHERE scope = $1",
          [scope]
        );

        for (const [index, workerId] of normalizedWorkerIds.entries()) {
          await client.query(
            `INSERT INTO jellypolly.production_worker_orders (scope, worker_id, sort_order, updated_by)
             VALUES ($1, $2, $3, $4)`,
            [scope, workerId, index, updatedBy]
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      res.json({
        message: "Worker order saved",
        scope,
        worker_ids: normalizedWorkerIds,
      });
    } catch (error) {
      console.error("Error saving worker order:", error);
      res.status(500).json({
        message: "Error saving worker order",
        error: error.message,
      });
    }
  });

  // GET /api/production-entries - List entries with filters
  router.get("/", async (req, res) => {
    try {
      const {
        date,
        product_id,
        worker_id,
        start_date,
        end_date,
        include_machine_status,
      } = req.query;
      const includeMachineStatus = include_machine_status === "true";

      let query = `
        SELECT
          pe.id,
          TO_CHAR(pe.entry_date, 'YYYY-MM-DD') as entry_date,
          pe.product_id,
          pe.worker_id,
          pe.pay_code_id,
          pe.bags_packed,
          pe.created_at,
          pe.updated_at,
          pe.created_by,
          s.name as worker_name,
          p.description as product_description,
          p.type as product_type
          ${includeMachineStatus ? ", COALESCE(pms.machine_broken, false) as machine_broken" : ""}
        FROM jellypolly.production_entries pe
        LEFT JOIN jellypolly.staffs s ON pe.worker_id = s.id
        LEFT JOIN products p ON pe.product_id = p.id
        ${includeMachineStatus ? "LEFT JOIN production_machine_status pms ON pms.entry_date = pe.entry_date AND pms.product_id = pe.product_id" : ""}
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

  // GET /jellypolly/api/production-entries/workers - JP production staff
  router.get("/workers", async (req, res) => {
    try {
      // JP production workers = staff holding the JP_PACKING job (staffs.job)
      const result = await pool.query(
        `SELECT s.id, s.name, s.job
         FROM jellypolly.staffs s
         WHERE s.job ? 'JP_PACKING'
           AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
         ORDER BY s.name ASC`
      );

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
        FROM jellypolly.production_entries pe
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
        FROM jellypolly.production_entries pe
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
      const { entry_date, product_id, worker_id, pay_code_id, bags_packed, created_by } =
        req.body;

      if (!entry_date || !product_id || !worker_id || !pay_code_id) {
        return res.status(400).json({
          message:
            "entry_date, product_id, worker_id, and pay_code_id are required",
        });
      }

      if (Number(bags_packed) > 0) {
        const conflictEmployeeIds = await getPackingCutiConflicts(
          pool,
          entry_date,
          product_id,
          [worker_id],
        );

        if (conflictEmployeeIds.length > 0) {
          const conflictError = new Error(
            `Cannot save production because ${conflictEmployeeIds.join(
              ", ",
            )} already has cuti recorded for this date`,
          );
          conflictError.status = 400;
          throw conflictError;
        }
      }

      const query = `
        INSERT INTO jellypolly.production_entries (entry_date, product_id, worker_id, pay_code_id, bags_packed, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (entry_date, product_id, worker_id, pay_code_id)
        DO UPDATE SET
          bags_packed = EXCLUDED.bags_packed,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await pool.query(query, [
        entry_date,
        product_id,
        worker_id,
        pay_code_id,
        bags_packed || 0,
        created_by || null,
      ]);

      res.status(201).json({
        message: "Production entry saved successfully",
        entry: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating production entry:", error);
      res.status(error.status || 500).json({
        message: error.status ? error.message : "Error creating production entry",
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

      const hasStockOnlyEntry = entries.some(
        (entry) => entry.worker_id === STOCK_ONLY_WORKER_ID
      );

      if (hasStockOnlyEntry && !STOCK_ONLY_PRODUCT_IDS.has(product_id)) {
        return res.status(400).json({
          message: "Stock-only production entries are only allowed for OTH stock products",
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const savedEntries = [];
        let totalBags = 0;

        if (hasStockOnlyEntry) {
          const stockOnlyEntry = entries.find(
            (entry) => entry.worker_id === STOCK_ONLY_WORKER_ID
          );
          const stockOnlyQuantity = Number(stockOnlyEntry?.bags_packed) || 0;

          await client.query(
            `DELETE FROM jellypolly.production_entries
             WHERE entry_date = $1 AND product_id = $2`,
            [date, product_id]
          );

          if (stockOnlyQuantity > 0) {
            const result = await client.query(
              `
              INSERT INTO jellypolly.production_entries (entry_date, product_id, worker_id, bags_packed, created_by)
              VALUES ($1, $2, NULL, $3, $4)
              RETURNING *
            `,
              [date, product_id, stockOnlyQuantity, created_by || null]
            );

            savedEntries.push(result.rows[0]);
            totalBags = stockOnlyQuantity;
          }

          await client.query("COMMIT");

          return res.json({
            message: "Production entries saved successfully",
            entries: savedEntries,
            total_bags: totalBags,
            entry_count: savedEntries.length,
          });
        }

        const positiveWorkerIds = [
          ...new Set(
            entries
              .filter((entry) => Number(entry.bags_packed) > 0)
              .map((entry) => entry.worker_id)
          ),
        ];
        const conflictEmployeeIds = await getPackingCutiConflicts(
          client,
          date,
          product_id,
          positiveWorkerIds,
        );

        if (conflictEmployeeIds.length > 0) {
          const conflictError = new Error(
            `Cannot save production because ${conflictEmployeeIds.join(
              ", ",
            )} already has cuti recorded for this date`,
          );
          conflictError.status = 400;
          throw conflictError;
        }

        // Each entry is one quantity for one worker's one mapped pay code.
        // Clear any legacy rows for the touched workers that predate the
        // per-pay-code model (pay_code_id IS NULL) so they don't linger and
        // double-count stock alongside the new keyed rows.
        const touchedWorkerIds = [
          ...new Set(entries.map((entry) => entry.worker_id).filter(Boolean)),
        ];
        if (touchedWorkerIds.length > 0) {
          await client.query(
            `DELETE FROM jellypolly.production_entries
             WHERE entry_date = $1 AND product_id = $2
               AND worker_id = ANY($3::text[]) AND pay_code_id IS NULL`,
            [date, product_id, touchedWorkerIds]
          );
        }

        for (const entry of entries) {
          const { worker_id, pay_code_id, bags_packed } = entry;

          if (!worker_id || !pay_code_id) continue;

          // Skip entries with 0 bags - delete any existing row for that
          // (worker, pay code) so cleared inputs are removed.
          if (!bags_packed || Number(bags_packed) === 0) {
            await client.query(
              `DELETE FROM jellypolly.production_entries
               WHERE entry_date = $1 AND product_id = $2
                 AND worker_id = $3 AND pay_code_id = $4`,
              [date, product_id, worker_id, pay_code_id]
            );
            continue;
          }

          const query = `
            INSERT INTO jellypolly.production_entries (entry_date, product_id, worker_id, pay_code_id, bags_packed, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (entry_date, product_id, worker_id, pay_code_id)
            DO UPDATE SET
              bags_packed = EXCLUDED.bags_packed,
              updated_at = CURRENT_TIMESTAMP
            RETURNING *
          `;

          const result = await client.query(query, [
            date,
            product_id,
            worker_id,
            pay_code_id,
            bags_packed,
            created_by || null,
          ]);

          savedEntries.push(result.rows[0]);
          totalBags += Number(bags_packed);
        }

        await client.query("COMMIT");

        // JP products feed the Jelly Polly payroll (bags × product pay code);
        // reprocess the affected workers' JP payroll for that month
        const productTypeResult = await pool.query(
          "SELECT type FROM products WHERE id = $1",
          [product_id]
        );
        if (productTypeResult.rows[0]?.type === "JP") {
          const [yearStr, monthStr] = String(date).split("-");
          const workerIds = entries
            .map((entry) => entry.worker_id)
            .filter(
              (workerId) => workerId && workerId !== STOCK_ONLY_WORKER_ID
            );
          if (workerIds.length > 0) {
            await reprocessJPEmployeesSafe(pool, {
              year: parseInt(yearStr),
              month: parseInt(monthStr),
              employeeIds: workerIds,
            });
          }
        }

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
      res.status(error.status || 500).json({
        message: error.status ? error.message : "Error saving production entries",
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

      if (Number(bags_packed) > 0) {
        const currentEntryResult = await pool.query(
          `
            SELECT entry_date, product_id, worker_id
            FROM jellypolly.production_entries
            WHERE id = $1
          `,
          [id],
        );

        if (currentEntryResult.rows.length === 0) {
          return res.status(404).json({
            message: "Production entry not found",
          });
        }

        const currentEntry = currentEntryResult.rows[0];
        const conflictEmployeeIds = await getPackingCutiConflicts(
          pool,
          currentEntry.entry_date,
          currentEntry.product_id,
          [currentEntry.worker_id],
        );

        if (conflictEmployeeIds.length > 0) {
          return res.status(400).json({
            message: `Cannot save production because ${conflictEmployeeIds.join(
              ", ",
            )} already has cuti recorded for this date`,
          });
        }
      }

      const query = `
        UPDATE jellypolly.production_entries
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

      await reprocessIfJPProduct(
        result.rows[0].product_id,
        result.rows[0].entry_date,
        result.rows[0].worker_id
      );

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

      const query = `DELETE FROM jellypolly.production_entries WHERE id = $1 RETURNING *`;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Production entry not found",
        });
      }

      await reprocessIfJPProduct(
        result.rows[0].product_id,
        result.rows[0].entry_date,
        result.rows[0].worker_id
      );

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
