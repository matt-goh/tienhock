// src/routes/jellypolly/daily-plastic.js
// JP Daily Machine Plastic entry API. Presents a per-staff pay-code-line
// workflow while storing payroll items in the existing JP daily work-log tables.
import { Router } from "express";
import { reprocessJPEmployeesSafe } from "./jpPayrollProcessor.js";

const SECTION = "PLASTIC";
const JOB_ID = "JP_PLASTIC";
const DEFAULT_SHIFT = 1;
const VALID_LEAVE_TYPES = new Set([
  "cuti_umum",
  "cuti_sakit",
  "cuti_tahunan",
  "cuti_rawatan",
]);

const isValidYmd = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const yearMonthOf = (dateString) => {
  const [year, month] = dateString.split("-").map((part) => parseInt(part, 10));
  return { year, month };
};

const round2 = (value) => Math.round(value * 100) / 100;

const parseNonNegativeNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

// Leave amounts may legitimately be 0, so this returns null (invalid) instead
// of coercing, unlike parseNonNegativeNumber above.
const parseLeaveAmount = (value) => {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
};

const getDayType = async (client, dateString) => {
  const holidayResult = await client.query(
    `SELECT 1
     FROM public.holiday_calendar
     WHERE holiday_date = $1 AND is_active = true
     LIMIT 1`,
    [dateString]
  );
  if (holidayResult.rows.length > 0) return "Umum";

  const [year, month, day] = dateString
    .split("-")
    .map((part) => parseInt(part, 10));
  return new Date(year, month - 1, day).getDay() === 0 ? "Ahad" : "Biasa";
};

const getPlasticWorkLogIds = async (client, dateString) => {
  const result = await client.query(
    `SELECT id
     FROM jellypolly.daily_work_logs
     WHERE log_date = $1 AND section = $2
     ORDER BY shift, id`,
    [dateString, SECTION]
  );
  return result.rows.map((row) => row.id);
};

const cleanupEmptyPlasticLogs = async (client, dateString) => {
  await client.query(
    `DELETE FROM jellypolly.daily_work_logs dwl
     WHERE dwl.log_date = $1
       AND dwl.section = $2
       AND NOT EXISTS (
         SELECT 1
         FROM jellypolly.daily_work_log_entries dwle
         WHERE dwle.work_log_id = dwl.id
       )`,
    [dateString, SECTION]
  );
};

const deleteEmployeePlasticEntries = async (client, dateString, employeeId) => {
  const workLogIds = await getPlasticWorkLogIds(client, dateString);
  if (workLogIds.length === 0) return 0;

  const deleteResult = await client.query(
    `DELETE FROM jellypolly.daily_work_log_entries
     WHERE work_log_id = ANY($1::int[])
       AND employee_id = $2
     RETURNING id`,
    [workLogIds, employeeId]
  );
  await cleanupEmptyPlasticLogs(client, dateString);
  return deleteResult.rowCount;
};

const ensurePlasticWorkLog = async (client, dateString, dayType, status) => {
  const existingResult = await client.query(
    `SELECT id
     FROM jellypolly.daily_work_logs
     WHERE log_date = $1
       AND section = $2
       AND shift = $3
     ORDER BY id
     LIMIT 1`,
    [dateString, SECTION, DEFAULT_SHIFT]
  );

  if (existingResult.rows.length > 0) {
    const workLogId = existingResult.rows[0].id;
    await client.query(
      `UPDATE jellypolly.daily_work_logs
       SET day_type = $1,
           status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [dayType, status || "Submitted", workLogId]
    );
    return workLogId;
  }

  const insertedResult = await client.query(
    `INSERT INTO jellypolly.daily_work_logs (
       log_date, shift, day_type, section, context_data, status
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [dateString, DEFAULT_SHIFT, dayType, SECTION, {}, status || "Submitted"]
  );
  return insertedResult.rows[0].id;
};

const assertPlasticStaff = async (client, employeeId) => {
  const staffResult = await client.query(
    `SELECT id
     FROM jellypolly.staffs
     WHERE id = $1
       AND date_resigned IS NULL
       AND job::jsonb ? $2`,
    [employeeId, JOB_ID]
  );
  return staffResult.rows.length > 0;
};

const getAllowedPayCodeIds = async (client, employeeId) => {
  const result = await client.query(
    `SELECT pay_code_id
     FROM jellypolly.job_pay_codes
     WHERE job_id = $1
     UNION
     SELECT pay_code_id
     FROM jellypolly.employee_pay_codes
     WHERE employee_id = $2`,
    [JOB_ID, employeeId]
  );
  return new Set(result.rows.map((row) => row.pay_code_id));
};

export default function (pool) {
  const router = Router();

  router.get("/", async (req, res) => {
    const { date } = req.query;
    if (!isValidYmd(date)) {
      return res
        .status(400)
        .json({ message: "A valid ?date=YYYY-MM-DD is required" });
    }

    try {
      const [staffResult, savedResult] = await Promise.all([
        pool.query(
          `SELECT id AS employee_id, COALESCE(name, id) AS employee_name
           FROM jellypolly.staffs
           WHERE date_resigned IS NULL
             AND job::jsonb ? $1
           ORDER BY COALESCE(name, id), id`,
          [JOB_ID]
        ),
        pool.query(
          `SELECT dwl.id AS work_log_id,
                  dwl.status,
                  dwl.shift,
                  dwle.id AS entry_id,
                  dwle.employee_id,
                  dwla.id AS line_id,
                  dwla.pay_code_id,
                  dwla.units_produced,
                  dwla.hours_applied,
                  dwla.rate_used,
                  dwla.calculated_amount,
                  pc.description AS pay_code_description,
                  pc.rate_unit AS pay_code_rate_unit
           FROM jellypolly.daily_work_logs dwl
           JOIN jellypolly.daily_work_log_entries dwle
             ON dwle.work_log_id = dwl.id
           LEFT JOIN jellypolly.daily_work_log_activities dwla
             ON dwla.log_entry_id = dwle.id
           LEFT JOIN jellypolly.pay_codes pc
             ON pc.id = dwla.pay_code_id
           WHERE dwl.log_date = $1
             AND dwl.section = $2
           ORDER BY dwle.employee_id, dwl.shift, dwle.id, dwla.id`,
          [date, SECTION]
        ),
      ]);

      const savedByEmployee = {};
      for (const row of savedResult.rows) {
        if (!savedByEmployee[row.employee_id]) {
          savedByEmployee[row.employee_id] = {
            saved: true,
            status: row.status,
            lines: [],
          };
        }

        if (row.line_id) {
          const quantity =
            row.units_produced != null
              ? parseFloat(row.units_produced)
              : row.hours_applied != null
              ? parseFloat(row.hours_applied)
              : 1;
          savedByEmployee[row.employee_id].lines.push({
            id: row.line_id,
            pay_code_id: row.pay_code_id,
            description: row.pay_code_description || row.pay_code_id,
            quantity: Number.isFinite(quantity) ? quantity : 0,
            rate_used: parseFloat(row.rate_used) || 0,
            amount: parseFloat(row.calculated_amount) || 0,
            rate_unit: row.pay_code_rate_unit || "Fixed",
          });
        }
      }

      const entries = staffResult.rows.map((staff) => {
        const saved = savedByEmployee[staff.employee_id];
        return {
          employee_id: staff.employee_id,
          employee_name: staff.employee_name,
          saved: !!saved,
          status: saved?.status || null,
          lines: saved?.lines || [],
        };
      });

      res.json({ date, entries });
    } catch (error) {
      console.error("Error fetching JP daily plastic:", error);
      res.status(500).json({
        message: "Error fetching daily plastic",
        error: error.message,
      });
    }
  });

  router.post("/", async (req, res) => {
    const { date, employee_id, status, lines } = req.body;
    if (!isValidYmd(date) || !employee_id) {
      return res.status(400).json({
        message: "date (YYYY-MM-DD) and employee_id are required",
      });
    }
    if (!Array.isArray(lines)) {
      return res.status(400).json({ message: "lines must be an array" });
    }

    const validLines = lines
      .filter((line) => line && line.pay_code_id)
      .map((line) => {
        const quantity = parseNonNegativeNumber(line.quantity);
        const rate = parseNonNegativeNumber(line.rate_used);
        return {
          pay_code_id: String(line.pay_code_id),
          quantity,
          rate_used: rate,
          amount: round2(quantity * rate),
        };
      });

    if (validLines.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one pay-code line is required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const isPlasticStaff = await assertPlasticStaff(client, employee_id);
      if (!isPlasticStaff) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "Employee is not assigned to JP Plastic" });
      }

      const allowedPayCodeIds = await getAllowedPayCodeIds(client, employee_id);
      const invalidPayCode = validLines.find(
        (line) => !allowedPayCodeIds.has(line.pay_code_id)
      );
      if (invalidPayCode) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `${invalidPayCode.pay_code_id} is not mapped to this plastic job or employee`,
        });
      }

      const dayType = await getDayType(client, date);
      await deleteEmployeePlasticEntries(client, date, employee_id);
      const workLogId = await ensurePlasticWorkLog(
        client,
        date,
        dayType,
        status || "Submitted"
      );

      const entryResult = await client.query(
        `INSERT INTO jellypolly.daily_work_log_entries (
           work_log_id, employee_id, job_id, total_hours,
           following_salesman_id, muat_mee_bags, muat_bihun_bags,
           location_type, is_doubled, force_ot_hours
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          workLogId,
          employee_id,
          JOB_ID,
          0,
          null,
          0,
          0,
          "Local",
          false,
          0,
        ]
      );
      const entryId = entryResult.rows[0].id;

      for (const line of validLines) {
        await client.query(
          `INSERT INTO jellypolly.daily_work_log_activities (
             log_entry_id, pay_code_id, hours_applied, units_produced,
             rate_used, calculated_amount, is_manually_added, foc_units
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            entryId,
            line.pay_code_id,
            null,
            line.quantity,
            line.rate_used,
            line.amount,
            false,
            null,
          ]
        );
      }

      await client.query("COMMIT");

      const { year, month } = yearMonthOf(date);
      await reprocessJPEmployeesSafe(pool, {
        year,
        month,
        employeeIds: [employee_id],
      });

      res.status(201).json({
        message: "Daily plastic saved",
        workLogId,
        entryId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving JP daily plastic:", error);
      res.status(500).json({
        message: "Error saving daily plastic",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  router.delete("/", async (req, res) => {
    const { date, employee_id } = req.query;
    if (!isValidYmd(date) || !employee_id) {
      return res.status(400).json({
        message: "date (YYYY-MM-DD) and employee_id are required",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const deletedCount = await deleteEmployeePlasticEntries(
        client,
        date,
        employee_id
      );
      await client.query("COMMIT");

      if (deletedCount === 0) {
        return res.status(404).json({ message: "No daily plastic log found" });
      }

      const { year, month } = yearMonthOf(date);
      await reprocessJPEmployeesSafe(pool, {
        year,
        month,
        employeeIds: [employee_id],
      });

      res.json({ message: "Daily plastic cleared" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error clearing JP daily plastic:", error);
      res.status(500).json({
        message: "Error clearing daily plastic",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  /**
   * GET /jellypolly/api/daily-plastic/leave?date=YYYY-MM-DD
   * The day's leave records for JP Plastic staff (JP leave ledger).
   */
  router.get("/leave", async (req, res) => {
    const { date } = req.query;
    if (!isValidYmd(date)) {
      return res
        .status(400)
        .json({ message: "A valid ?date=YYYY-MM-DD is required" });
    }

    try {
      const result = await pool.query(
        `SELECT lr.id,
                lr.employee_id,
                to_char(lr.leave_date, 'YYYY-MM-DD') AS leave_date,
                lr.leave_type,
                CAST(lr.amount_paid AS NUMERIC(10, 2)) AS amount_paid,
                COALESCE(s.name, lr.employee_id) AS employee_name
         FROM jellypolly.leave_records lr
         JOIN jellypolly.staffs s ON s.id = lr.employee_id
         WHERE lr.leave_date = $1
           AND lr.status = 'approved'
           AND s.date_resigned IS NULL
           AND s.job::jsonb ? $2
         ORDER BY s.name, lr.id`,
        [date, JOB_ID]
      );

      res.json(
        result.rows.map((row) => ({
          ...row,
          amount_paid: parseFloat(row.amount_paid) || 0,
        }))
      );
    } catch (error) {
      console.error("Error fetching JP daily plastic leave:", error);
      res.status(500).json({
        message: "Error fetching leave records",
        error: error.message,
      });
    }
  });

  /**
   * POST /jellypolly/api/daily-plastic/leave
   * Batch save the plastic leave section for one date. Rows are written with a
   * NULL work_log_id so clearing a staff's plastic entry never cascades their
   * leave away; the JP payroll processor pays amount_paid into gross and
   * excludes that day's work items.
   * Body: { date, leaveEntries: [{employeeId, leaveType, amount_paid}],
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

    if (!isValidYmd(date)) {
      return res
        .status(400)
        .json({ message: "A valid date (YYYY-MM-DD) is required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Employees to re-run payroll for: everyone this request touches.
      const affectedEmployeeIds = new Set();

      const collectEmployeeIds = async (leaveIds) => {
        if (leaveIds.length === 0) return;
        const result = await client.query(
          "SELECT employee_id FROM jellypolly.leave_records WHERE id = ANY($1::int[])",
          [leaveIds]
        );
        for (const row of result.rows) affectedEmployeeIds.add(row.employee_id);
      };

      if (Array.isArray(deletedLeaveIds) && deletedLeaveIds.length > 0) {
        const ids = deletedLeaveIds.map((id) => parseInt(id, 10));
        if (ids.some((id) => !Number.isInteger(id))) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Invalid leave id" });
        }
        await collectEmployeeIds(ids);
        await client.query(
          "DELETE FROM jellypolly.leave_records WHERE id = ANY($1::int[])",
          [ids]
        );
      }

      if (Array.isArray(leaveEntries) && leaveEntries.length > 0) {
        for (const leave of leaveEntries) {
          const employeeId = String(leave.employee_id || leave.employeeId || "");
          const leaveType = leave.leave_type || leave.leaveType;
          const leaveAmount = parseLeaveAmount(leave.amount_paid);

          if (!employeeId || !VALID_LEAVE_TYPES.has(leaveType)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: `Invalid leave entry for ${employeeId || "unknown employee"}`,
            });
          }
          if (leaveAmount === null) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: `Leave amount for ${employeeId} must be a non-negative number`,
            });
          }

          const isPlasticStaff = await assertPlasticStaff(client, employeeId);
          if (!isPlasticStaff) {
            await client.query("ROLLBACK");
            return res
              .status(400)
              .json({ message: `${employeeId} is not assigned to JP Plastic` });
          }

          // One leave record per person per day: the ledger is shared with the
          // other JP entry pages, so skip anyone already recorded that day.
          const existingLeave = await client.query(
            `SELECT id FROM jellypolly.leave_records
             WHERE employee_id = $1 AND leave_date = $2`,
            [employeeId, date]
          );
          if (existingLeave.rows.length > 0) continue;

          await client.query(
            `INSERT INTO jellypolly.leave_records (
              employee_id, leave_date, leave_type, work_log_id, days_taken,
              amount_paid, status, created_by
            ) VALUES ($1, $2, $3, NULL, 1.0, $4, 'approved', $5)`,
            [employeeId, date, leaveType, leaveAmount, created_by || null]
          );
          affectedEmployeeIds.add(employeeId);
        }
      }

      if (Array.isArray(updatedLeaveEntries) && updatedLeaveEntries.length > 0) {
        for (const leave of updatedLeaveEntries) {
          const leaveId = parseInt(leave.id, 10);
          const leaveAmount = parseLeaveAmount(leave.amount_paid);

          if (!Number.isInteger(leaveId) || leaveAmount === null) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: "Leave amount must be a non-negative number",
            });
          }

          await collectEmployeeIds([leaveId]);
          await client.query(
            `UPDATE jellypolly.leave_records
             SET amount_paid = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [leaveAmount, leaveId]
          );
        }
      }

      await client.query("COMMIT");

      if (affectedEmployeeIds.size > 0) {
        const { year, month } = yearMonthOf(date);
        await reprocessJPEmployeesSafe(pool, {
          year,
          month,
          employeeIds: Array.from(affectedEmployeeIds),
        });
      }

      res.json({ message: "Plastic leave saved" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving JP daily plastic leave:", error);
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
