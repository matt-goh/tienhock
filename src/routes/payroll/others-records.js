// src/routes/payroll/others-records.js
import { Router } from "express";
import crypto from "crypto";

// pg returns `date` columns as JS Date objects constructed at midnight in the
// Node process's local timezone. Using .toISOString() to extract yyyy-MM-dd
// would shift the date by one day when the server TZ is not UTC (this codebase
// runs in Asia/Kuala_Lumpur, UTC+8). Extract via local-time fields instead.
const dateRowToYmd = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = (value.getMonth() + 1).toString().padStart(2, "0");
  const d = value.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function (pool) {
  const router = Router();

  /**
   * GET /api/others-records
   * List "Others (Kerja Luar OT)" records with year/month/employee filtering.
   * Also supports filtering by link_id to fetch a single linked group.
   */
  router.get("/", async (req, res) => {
    const { year, month, start_date, end_date, employee_id, link_id } =
      req.query;

    try {
      let query = `
        SELECT orec.*, s.name as employee_name,
               pc.description as pay_code_description
        FROM others_records orec
        JOIN staffs s ON orec.employee_id = s.id
        LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
        WHERE 1=1
      `;
      const values = [];
      let paramCount = 1;

      if (link_id) {
        query += ` AND orec.link_id = $${paramCount}`;
        values.push(link_id);
        paramCount++;
      } else if (year && month) {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const startDate = `${y}-${m.toString().padStart(2, "0")}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${m.toString().padStart(2, "0")}-${lastDay
          .toString()
          .padStart(2, "0")}`;
        query += ` AND DATE(orec.record_date) >= $${paramCount}`;
        values.push(startDate);
        paramCount++;
        query += ` AND DATE(orec.record_date) <= $${paramCount}`;
        values.push(endDate);
        paramCount++;
      } else {
        if (start_date) {
          query += ` AND DATE(orec.record_date) >= $${paramCount}`;
          values.push(start_date);
          paramCount++;
        }
        if (end_date) {
          query += ` AND DATE(orec.record_date) <= $${paramCount}`;
          values.push(end_date);
          paramCount++;
        }
      }

      if (employee_id) {
        query += ` AND orec.employee_id = $${paramCount}`;
        values.push(employee_id);
        paramCount++;
      }

      query += " ORDER BY orec.record_date DESC, orec.id DESC";

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching others records:", error);
      res.status(500).json({
        message: "Error fetching others records",
        error: error.message,
      });
    }
  });

  /**
   * POST /api/others-records
   * Create one or more Others (Kerja Luar OT) records.
   *
   * Single-record shape:
   *   { employee_id, record_date, pay_code_id?, description, rate, rate_unit,
   *     quantity, amount, created_by? }
   *
   * Batch shape (multi-date linked entry):
   *   { employee_id, record_dates: ["yyyy-mm-dd", ...], pay_code_id?, description,
   *     rate, rate_unit, quantity, amount, created_by? }
   *
   * When `record_dates` has length >= 2, all inserted rows share a generated
   * `link_id`. With length === 1 the single row has `link_id = NULL` (preserves
   * pre-multi-date behaviour).
   */
  router.post("/", async (req, res) => {
    const {
      employee_id,
      record_date,
      record_dates,
      pay_code_id,
      description,
      rate,
      rate_unit,
      quantity,
      amount,
      created_by,
    } = req.body;

    const dates = Array.isArray(record_dates)
      ? record_dates.filter((d) => typeof d === "string" && d.length > 0)
      : record_date
      ? [record_date]
      : [];

    if (
      !employee_id ||
      dates.length === 0 ||
      !description ||
      rate == null ||
      !rate_unit ||
      quantity == null ||
      amount == null
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const linkId = dates.length >= 2 ? crypto.randomUUID() : null;
      const insertQuery = `
        INSERT INTO others_records (
          employee_id, record_date, pay_code_id, description,
          rate, rate_unit, quantity, amount, created_by, link_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `;
      const inserted = [];
      for (const d of dates) {
        const r = await client.query(insertQuery, [
          employee_id,
          d,
          pay_code_id || null,
          description,
          rate,
          rate_unit,
          quantity,
          amount,
          created_by || null,
          linkId,
        ]);
        inserted.push(r.rows[0]);
      }

      await client.query("COMMIT");

      if (inserted.length === 1) {
        res.status(201).json(inserted[0]);
      } else {
        res.status(201).json({
          link_id: linkId,
          inserted_count: inserted.length,
          rows: inserted,
        });
      }
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating others record:", error);
      res.status(500).json({
        message: "Error creating others record",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  /**
   * PUT /api/others-records/:id
   * Update an existing Others record.
   *
   * If the target row has a NULL link_id: behaves as a single-row update
   * (record_date, pay_code_id, description, rate, rate_unit, quantity, amount).
   *
   * If the target row has a link_id: edits propagate to all siblings.
   *   - Shared fields (pay_code_id, description, rate, rate_unit, quantity,
   *     amount) are UPDATEd on every sibling.
   *   - When the body includes `record_dates: string[]`, the linked group's date
   *     set is diffed against the new set: kept dates keep their row id, removed
   *     dates are DELETEd, added dates are INSERTed with the same link_id.
   *   - Reject when the final set would be empty.
   */
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      record_date,
      record_dates,
      pay_code_id,
      description,
      rate,
      rate_unit,
      quantity,
      amount,
    } = req.body;

    const client = await pool.connect();
    try {
      const existing = await client.query(
        "SELECT * FROM others_records WHERE id = $1",
        [id],
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: "Others record not found." });
      }
      const row = existing.rows[0];

      // Standalone record: original single-row update behaviour.
      if (!row.link_id) {
        const result = await client.query(
          `UPDATE others_records
             SET record_date = $1,
                 pay_code_id = $2,
                 description = $3,
                 rate = $4,
                 rate_unit = $5,
                 quantity = $6,
                 amount = $7,
                 updated_at = now()
           WHERE id = $8
           RETURNING *`,
          [
            record_date,
            pay_code_id || null,
            description,
            rate,
            rate_unit,
            quantity,
            amount,
            id,
          ],
        );
        return res.json(result.rows[0]);
      }

      // Linked record: propagate shared fields to all siblings and (optionally)
      // diff the date set.
      const newDates = Array.isArray(record_dates)
        ? record_dates.filter((d) => typeof d === "string" && d.length > 0)
        : null;

      if (newDates && newDates.length === 0) {
        return res.status(400).json({
          message: "Linked entry must keep at least one date.",
        });
      }

      await client.query("BEGIN");

      // Propagate shared fields to all siblings.
      await client.query(
        `UPDATE others_records
           SET pay_code_id = $1,
               description = $2,
               rate = $3,
               rate_unit = $4,
               quantity = $5,
               amount = $6,
               updated_at = now()
         WHERE link_id = $7`,
        [
          pay_code_id || null,
          description,
          rate,
          rate_unit,
          quantity,
          amount,
          row.link_id,
        ],
      );

      if (newDates) {
        const siblings = await client.query(
          "SELECT id, record_date FROM others_records WHERE link_id = $1",
          [row.link_id],
        );
        const existingByDate = new Map();
        for (const s of siblings.rows) {
          existingByDate.set(dateRowToYmd(s.record_date), s.id);
        }
        const desired = new Set(newDates);
        const toDeleteIds = [];
        for (const [d, sid] of existingByDate.entries()) {
          if (!desired.has(d)) toDeleteIds.push(sid);
        }
        const toInsertDates = newDates.filter((d) => !existingByDate.has(d));

        if (toDeleteIds.length > 0) {
          await client.query(
            "DELETE FROM others_records WHERE id = ANY($1::int[])",
            [toDeleteIds],
          );
        }
        if (toInsertDates.length > 0) {
          const insertQuery = `
            INSERT INTO others_records (
              employee_id, record_date, pay_code_id, description,
              rate, rate_unit, quantity, amount, created_by, link_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `;
          for (const d of toInsertDates) {
            await client.query(insertQuery, [
              row.employee_id,
              d,
              pay_code_id || null,
              description,
              rate,
              rate_unit,
              quantity,
              amount,
              row.created_by,
              row.link_id,
            ]);
          }
        }
      }

      await client.query("COMMIT");

      const finalRows = await client.query(
        `SELECT orec.*, s.name as employee_name,
                pc.description as pay_code_description
           FROM others_records orec
           JOIN staffs s ON orec.employee_id = s.id
           LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
          WHERE orec.link_id = $1
          ORDER BY orec.record_date ASC, orec.id ASC`,
        [row.link_id],
      );
      res.json({
        link_id: row.link_id,
        rows: finalRows.rows,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error updating others record:", error);
      res.status(500).json({
        message: "Error updating others record",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /api/others-records/:id
   * If the row has a link_id, deletes the entire linked group atomically.
   * Returns { deleted_count }.
   */
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const existing = await client.query(
        "SELECT id, link_id FROM others_records WHERE id = $1",
        [id],
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: "Others record not found." });
      }
      const row = existing.rows[0];

      let result;
      if (row.link_id) {
        result = await client.query(
          "DELETE FROM others_records WHERE link_id = $1 RETURNING id",
          [row.link_id],
        );
      } else {
        result = await client.query(
          "DELETE FROM others_records WHERE id = $1 RETURNING id",
          [id],
        );
      }
      res.status(200).json({
        message: "Others record deleted.",
        deleted_count: result.rowCount,
      });
    } catch (error) {
      console.error("Error deleting others record:", error);
      res.status(500).json({
        message: "Error deleting others record",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
