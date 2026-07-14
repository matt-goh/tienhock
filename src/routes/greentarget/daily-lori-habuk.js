// src/routes/greentarget/daily-lori-habuk.js
// Green Target Daily Lori Habuk driver entry (Phase 3).
// Records DRIVER trip pay per day. GET returns, per active DRIVER employee, the
// saved daily log lines if present, else rentals-derived prefill suggestions.
// Monthly processing reads the saved lines (not live rentals).
import { Router } from "express";
import {
  buildPrefillLinesForDriverDate,
  dateRowToYmd,
} from "./driverTripRules.js";

const VALID_LEAVE_TYPES = new Set([
  "cuti_umum",
  "cuti_sakit",
  "cuti_tahunan",
  "cuti_rawatan",
]);

const parseLeaveAmount = (amount) => {
  const parsedAmount = Number(amount || 0);
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
    return null;
  }
  return Math.round(parsedAmount * 100) / 100;
};

export default function (pool) {
  const router = Router();

  /**
   * GET /greentarget/api/daily-lori-habuk?date=YYYY-MM-DD
   * Returns one entry per active DRIVER employee:
   *   { employee_id, employee_name, saved, status, lines: [...] }
   */
  router.get("/", async (req, res) => {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res
        .status(400)
        .json({ message: "A valid ?date=YYYY-MM-DD is required" });
    }

    try {
      const [
        driversResult,
        savedLogsResult,
        rulesResult,
        settingsResult,
        payCodesResult,
        rentalsResult,
      ] = await Promise.all([
        // Active DRIVER employees
        pool.query(
          `SELECT pe.employee_id, s.name AS employee_name
           FROM greentarget.payroll_employees pe
           JOIN public.staffs s ON pe.employee_id = s.id
           WHERE pe.job_type = 'DRIVER' AND pe.is_active = true
           ORDER BY s.name`
        ),
        // Saved logs + lines for this date
        pool.query(
          `SELECT l.id AS log_id, l.employee_id, l.status,
                  ln.id AS line_id, ln.pay_code_id, ln.quantity, ln.rate_used,
                  ln.amount, ln.source_type, ln.rental_id, ln.description,
                  ln.is_manual, pc.description AS pay_code_description,
                  pc.rate_unit AS pay_code_rate_unit
           FROM greentarget.daily_lori_habuk_logs l
           LEFT JOIN greentarget.daily_lori_habuk_lines ln ON ln.log_id = l.id
           LEFT JOIN public.pay_codes pc ON ln.pay_code_id = pc.id
           WHERE l.log_date = $1
           ORDER BY l.employee_id, ln.id`,
          [date]
        ),
        // Payroll rules
        pool.query(
          `SELECT * FROM greentarget.payroll_rules
           WHERE is_active = true ORDER BY rule_type, priority DESC`
        ),
        // Settings (default invoice amount)
        pool.query(
          `SELECT setting_key, setting_value FROM greentarget.payroll_settings`
        ),
        // Active pay codes
        pool.query(
          `SELECT id, description, rate_biasa, pay_type, rate_unit
           FROM pay_codes WHERE is_active = true`
        ),
        // Rentals placed or picked on this date, with invoice amount
        pool.query(
          `SELECT r.rental_id, r.driver, r.pickup_destination,
                  r.date_placed, r.date_picked,
                  (SELECT SUM(i.amount_before_tax)
                   FROM greentarget.invoice_rentals ir
                   JOIN greentarget.invoices i ON ir.invoice_id = i.invoice_id
                   WHERE ir.rental_id = r.rental_id AND i.status != 'cancelled'
                  ) AS invoice_amount
           FROM greentarget.rentals r
           WHERE r.date_placed = $1 OR r.date_picked = $1`,
          [date]
        ),
      ]);

      // Build pay code map
      const allPayCodesMap = {};
      payCodesResult.rows.forEach((pc) => {
        allPayCodesMap[pc.id] = pc;
      });

      // Settings
      const settingsMap = {};
      settingsResult.rows.forEach((s) => {
        settingsMap[s.setting_key] = s.setting_value;
      });
      const defaultInvoiceAmount =
        parseFloat(settingsMap.default_invoice_amount) || 200;

      const placementRules = rulesResult.rows.filter(
        (r) => r.rule_type === "PLACEMENT"
      );
      const pickupRules = rulesResult.rows.filter(
        (r) => r.rule_type === "PICKUP"
      );

      // Rentals grouped by driver
      const rentalsByDriver = {};
      const rentalIds = [];
      rentalsResult.rows.forEach((r) => {
        if (!rentalsByDriver[r.driver]) rentalsByDriver[r.driver] = [];
        rentalsByDriver[r.driver].push(r);
        rentalIds.push(r.rental_id);
      });

      // Addons for the matched rentals
      const addonsByRental = {};
      if (rentalIds.length > 0) {
        const addonsResult = await pool.query(
          `SELECT ra.*, pc.description AS pay_code_description, ap.display_name
           FROM greentarget.rental_addons ra
           JOIN pay_codes pc ON ra.pay_code_id = pc.id
           LEFT JOIN greentarget.addon_paycodes ap ON ra.pay_code_id = ap.pay_code_id
           WHERE ra.rental_id = ANY($1)`,
          [rentalIds]
        );
        addonsResult.rows.forEach((a) => {
          if (!addonsByRental[a.rental_id]) addonsByRental[a.rental_id] = [];
          addonsByRental[a.rental_id].push(a);
        });
      }

      // Saved lines grouped by employee
      const savedByEmployee = {};
      savedLogsResult.rows.forEach((row) => {
        if (!savedByEmployee[row.employee_id]) {
          savedByEmployee[row.employee_id] = {
            log_id: row.log_id,
            status: row.status,
            lines: [],
          };
        }
        if (row.line_id) {
          savedByEmployee[row.employee_id].lines.push({
            id: row.line_id,
            pay_code_id: row.pay_code_id,
            description: row.description || row.pay_code_description || "",
            pay_code_description: row.pay_code_description,
            quantity: parseFloat(row.quantity),
            rate_used: parseFloat(row.rate_used),
            amount: parseFloat(row.amount),
            rate_unit: row.pay_code_rate_unit || "Trip",
            source_type: row.source_type,
            rental_id: row.rental_id,
            is_manual: row.is_manual,
          });
        }
      });

      const ctx = {
        placementRules,
        pickupRules,
        addonsByRental,
        allPayCodesMap,
        defaultInvoiceAmount,
      };

      const entries = driversResult.rows.map((driver) => {
        const saved = savedByEmployee[driver.employee_id];
        if (saved) {
          return {
            employee_id: driver.employee_id,
            employee_name: driver.employee_name,
            saved: true,
            status: saved.status,
            lines: saved.lines,
          };
        }
        // Prefill from rentals. greentarget.rentals.driver stores the staff
        // NAME, not the staff id — match on employee_name.
        const driverRentals = rentalsByDriver[driver.employee_name] || [];
        const prefill = buildPrefillLinesForDriverDate(
          date,
          driverRentals,
          ctx
        ).map((l) => ({
          pay_code_id: l.pay_code_id,
          description: l.description,
          pay_code_description: allPayCodesMap[l.pay_code_id]?.description,
          quantity: l.quantity,
          rate_used: l.rate_used,
          amount: l.amount,
          rate_unit: l.rate_unit,
          source_type: l.source_type,
          rental_id: l.rental_id,
          is_manual: false,
        }));
        return {
          employee_id: driver.employee_id,
          employee_name: driver.employee_name,
          saved: false,
          status: null,
          lines: prefill,
        };
      });

      res.json({ date, entries });
    } catch (error) {
      console.error("Error fetching daily lori habuk:", error);
      res.status(500).json({
        message: "Error fetching daily lori habuk",
        error: error.message,
      });
    }
  });

  /**
   * POST /greentarget/api/daily-lori-habuk
   * Upsert one driver-day (full replace of lines).
   * Body: { date, employee_id, status?, created_by?, lines: [...] }
   */
  router.post("/", async (req, res) => {
    const { date, employee_id, status, created_by, lines } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !employee_id) {
      return res
        .status(400)
        .json({ message: "date (YYYY-MM-DD) and employee_id are required" });
    }
    if (!Array.isArray(lines)) {
      return res.status(400).json({ message: "lines must be an array" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Upsert log header
      const logResult = await client.query(
        `INSERT INTO greentarget.daily_lori_habuk_logs
           (log_date, employee_id, status, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (log_date, employee_id) DO UPDATE
           SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [date, employee_id, status || "Submitted", created_by || null]
      );
      const logId = logResult.rows[0].id;

      // Replace lines
      await client.query(
        "DELETE FROM greentarget.daily_lori_habuk_lines WHERE log_id = $1",
        [logId]
      );

      for (const line of lines) {
        if (!line.pay_code_id) continue;
        await client.query(
          `INSERT INTO greentarget.daily_lori_habuk_lines
             (log_id, pay_code_id, quantity, rate_used, amount,
              source_type, rental_id, description, is_manual)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            logId,
            line.pay_code_id,
            parseFloat(line.quantity) || 0,
            parseFloat(line.rate_used) || 0,
            parseFloat(line.amount) || 0,
            line.source_type || "MANUAL",
            line.rental_id || null,
            line.description || null,
            line.is_manual ?? (line.source_type === "MANUAL"),
          ]
        );
      }

      await client.query("COMMIT");
      res.status(201).json({ message: "Daily lori habuk saved", logId });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving daily lori habuk:", error);
      res.status(500).json({
        message: "Error saving daily lori habuk",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /greentarget/api/daily-lori-habuk?date=YYYY-MM-DD&employee_id=...
   * Clears a driver-day log (cascade removes lines).
   */
  router.delete("/", async (req, res) => {
    const { date, employee_id } = req.query;
    if (!date || !employee_id) {
      return res
        .status(400)
        .json({ message: "date and employee_id are required" });
    }
    try {
      const result = await pool.query(
        `DELETE FROM greentarget.daily_lori_habuk_logs
         WHERE log_date = $1 AND employee_id = $2 RETURNING id`,
        [date, employee_id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "No daily log to delete" });
      }
      res.json({ message: "Daily lori habuk deleted" });
    } catch (error) {
      console.error("Error deleting daily lori habuk:", error);
      res.status(500).json({
        message: "Error deleting daily lori habuk",
        error: error.message,
      });
    }
  });

  /**
   * GET /greentarget/api/daily-lori-habuk/leave?date=YYYY-MM-DD
   * Returns the day's leave records for DRIVER staff (GT leave ledger).
   */
  router.get("/leave", async (req, res) => {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res
        .status(400)
        .json({ message: "A valid ?date=YYYY-MM-DD is required" });
    }
    try {
      const result = await pool.query(
        `SELECT lr.*, CAST(lr.amount_paid AS NUMERIC(10, 2)) as amount_paid,
                s.name as employee_name, s.job as employee_jobs
         FROM greentarget.leave_records lr
         LEFT JOIN public.staffs s ON lr.employee_id = s.id
         WHERE lr.leave_date = $1
           AND lr.employee_id IN (
             SELECT employee_id FROM greentarget.payroll_employees WHERE job_type = 'DRIVER'
           )
         ORDER BY s.name`,
        [date]
      );
      res.json(
        result.rows.map((record) => ({
          ...record,
          amount_paid: parseFloat(record.amount_paid),
        }))
      );
    } catch (error) {
      console.error("Error fetching daily lori habuk leave:", error);
      res.status(500).json({
        message: "Error fetching leave records",
        error: error.message,
      });
    }
  });

  /**
   * POST /greentarget/api/daily-lori-habuk/leave
   * Batch save the DRIVER leave section for one date (GT leave ledger; no
   * work-log link). Mirrors the office monthly save semantics.
   * Body: { date, leaveEntries: [{employeeId, leaveType, amount_paid, isNew}],
   *         updatedLeaveEntries: [{id, amount_paid}], deletedLeaveIds: [id], created_by }
   */
  router.post("/leave", async (req, res) => {
    const {
      date,
      leaveEntries = [],
      updatedLeaveEntries = [],
      deletedLeaveIds = [],
      created_by,
    } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res
        .status(400)
        .json({ message: "A valid date (YYYY-MM-DD) is required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Delete removed leave records
      if (Array.isArray(deletedLeaveIds) && deletedLeaveIds.length > 0) {
        for (const leaveId of deletedLeaveIds) {
          await client.query(
            "DELETE FROM greentarget.leave_records WHERE id = $1",
            [leaveId]
          );
        }
      }

      // Insert new leave records
      if (Array.isArray(leaveEntries) && leaveEntries.length > 0) {
        for (const leave of leaveEntries) {
          if (leave.isNew === false) continue;
          const { employeeId, leaveType, amount_paid } = leave;
          const leaveAmount = parseLeaveAmount(amount_paid);

          if (!employeeId || !VALID_LEAVE_TYPES.has(leaveType) || leaveAmount === null) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: `Invalid leave entry for ${employeeId || "unknown employee"}`,
            });
          }

          const existingLeave = await client.query(
            `SELECT id FROM greentarget.leave_records WHERE employee_id = $1 AND leave_date = $2`,
            [employeeId, date]
          );

          if (existingLeave.rows.length === 0) {
            await client.query(
              `INSERT INTO greentarget.leave_records (
                employee_id, leave_date, leave_type, days_taken, status, amount_paid, created_by
              ) VALUES ($1, $2, $3, $4, 'approved', $5, $6)`,
              [employeeId, date, leaveType, 1.0, leaveAmount, created_by || null]
            );
          }
        }
      }

      // Update existing saved leave amounts
      if (Array.isArray(updatedLeaveEntries) && updatedLeaveEntries.length > 0) {
        for (const leave of updatedLeaveEntries) {
          const { id: leaveId, amount_paid } = leave;
          const leaveAmount = parseLeaveAmount(amount_paid);

          if (!leaveId || leaveAmount === null) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: "Leave amount must be a non-negative number",
            });
          }

          await client.query(
            "UPDATE greentarget.leave_records SET amount_paid = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
            [leaveAmount, leaveId]
          );
        }
      }

      await client.query("COMMIT");
      res.json({ message: "Driver leave saved successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving daily lori habuk leave:", error);
      res.status(500).json({
        message: "Error saving leave records",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
