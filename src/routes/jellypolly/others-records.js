// src/routes/jellypolly/others-records.js
// Jelly Polly "Others (Kerja Luar OT)" records on jellypolly.others_records.
// Mirrors src/routes/payroll/others-records.js (same link_id / report_column
// multi-date logic), scoped to the jellypolly schema. Saves auto-reprocess the
// affected employee's JP payroll for every touched month.
import { Router } from "express";
import crypto from "crypto";
import { reprocessJPEmployeesSafe } from "./jpPayrollProcessor.js";

// pg returns `date` columns as JS Date objects at local-time midnight. Using
// .toISOString() to extract yyyy-MM-dd would shift the date by one day when the
// server TZ is not UTC (this codebase runs Asia/Kuala_Lumpur, UTC+8).
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

  // Reprocess the employee's payroll for every distinct month in `dates`
  const reprocessForDates = async (employeeId, dates) => {
    const months = new Set(
      dates
        .map((d) => dateRowToYmd(d))
        .filter(Boolean)
        .map((ymd) => ymd.slice(0, 7))
    );
    for (const ym of months) {
      const [year, month] = ym.split("-");
      await reprocessJPEmployeesSafe(pool, {
        year: parseInt(year),
        month: parseInt(month),
        employeeIds: [employeeId],
      });
    }
  };

  /**
   * GET /jellypolly/api/others-records
   * List records with year/month/employee filtering, or a single linked group.
   */
  router.get("/", async (req, res) => {
    const { year, month, start_date, end_date, employee_id, link_id } =
      req.query;

    try {
      let query = `
        SELECT orec.*, s.name as employee_name,
               pc.description as pay_code_description
        FROM jellypolly.others_records orec
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
      console.error("Error fetching JP others records:", error);
      res.status(500).json({
        message: "Error fetching others records",
        error: error.message,
      });
    }
  });

  /**
   * POST /jellypolly/api/others-records
   * Create one or more records. record_dates length >= 2 -> shared link_id.
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
      report_column,
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
        INSERT INTO jellypolly.others_records (
          employee_id, record_date, pay_code_id, description,
          rate, rate_unit, quantity, amount, created_by, link_id, report_column
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
          report_column || null,
        ]);
        inserted.push(r.rows[0]);
      }

      await client.query("COMMIT");

      await reprocessForDates(employee_id, dates);

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
      console.error("Error creating JP others record:", error);
      res.status(500).json({
        message: "Error creating others record",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  /**
   * PUT /jellypolly/api/others-records/:id
   * Standalone: single-row update. Linked: propagate shared fields to all
   * siblings and (optionally) diff the date set via record_dates.
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
      report_column,
    } = req.body;

    const client = await pool.connect();
    try {
      const existing = await client.query(
        "SELECT * FROM jellypolly.others_records WHERE id = $1",
        [id],
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: "Others record not found." });
      }
      const row = existing.rows[0];

      // Standalone record: original single-row update behaviour.
      if (!row.link_id) {
        const result = await client.query(
          `UPDATE jellypolly.others_records
             SET record_date = $1,
                 pay_code_id = $2,
                 description = $3,
                 rate = $4,
                 rate_unit = $5,
                 quantity = $6,
                 amount = $7,
                 report_column = $8,
                 updated_at = now()
           WHERE id = $9
           RETURNING *`,
          [
            record_date,
            pay_code_id || null,
            description,
            rate,
            rate_unit,
            quantity,
            amount,
            report_column || null,
            id,
          ],
        );
        await reprocessForDates(row.employee_id, [row.record_date, record_date]);
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

      // Capture all sibling dates BEFORE the diff so removed months reprocess too
      const preSiblingDates = await client.query(
        "SELECT record_date FROM jellypolly.others_records WHERE link_id = $1",
        [row.link_id],
      );

      await client.query("BEGIN");

      await client.query(
        `UPDATE jellypolly.others_records
           SET pay_code_id = $1,
               description = $2,
               rate = $3,
               rate_unit = $4,
               quantity = $5,
               amount = $6,
               report_column = $7,
               updated_at = now()
         WHERE link_id = $8`,
        [
          pay_code_id || null,
          description,
          rate,
          rate_unit,
          quantity,
          amount,
          report_column || null,
          row.link_id,
        ],
      );

      if (newDates) {
        const siblings = await client.query(
          "SELECT id, record_date FROM jellypolly.others_records WHERE link_id = $1",
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
            "DELETE FROM jellypolly.others_records WHERE id = ANY($1::int[])",
            [toDeleteIds],
          );
        }
        if (toInsertDates.length > 0) {
          const insertQuery = `
            INSERT INTO jellypolly.others_records (
              employee_id, record_date, pay_code_id, description,
              rate, rate_unit, quantity, amount, created_by, link_id, report_column
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
              report_column || null,
            ]);
          }
        }
      }

      await client.query("COMMIT");

      // Old sibling dates + new date set may span several months
      await reprocessForDates(row.employee_id, [
        ...preSiblingDates.rows.map((r) => r.record_date),
        ...(newDates || []),
      ]);

      const finalRows = await client.query(
        `SELECT orec.*, s.name as employee_name,
                pc.description as pay_code_description
           FROM jellypolly.others_records orec
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
      console.error("Error updating JP others record:", error);
      res.status(500).json({
        message: "Error updating others record",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /jellypolly/api/others-records/:id
   * If the row has a link_id, deletes the entire linked group atomically.
   */
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const existing = await client.query(
        "SELECT id, link_id, employee_id FROM jellypolly.others_records WHERE id = $1",
        [id],
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: "Others record not found." });
      }
      const row = existing.rows[0];

      let result;
      if (row.link_id) {
        result = await client.query(
          "DELETE FROM jellypolly.others_records WHERE link_id = $1 RETURNING id, record_date",
          [row.link_id],
        );
      } else {
        result = await client.query(
          "DELETE FROM jellypolly.others_records WHERE id = $1 RETURNING id, record_date",
          [id],
        );
      }

      await reprocessForDates(
        row.employee_id,
        result.rows.map((r) => r.record_date),
      );

      res.status(200).json({
        message: "Others record deleted.",
        deleted_count: result.rowCount,
      });
    } catch (error) {
      console.error("Error deleting JP others record:", error);
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
