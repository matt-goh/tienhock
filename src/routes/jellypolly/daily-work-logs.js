// src/routes/jellypolly/daily-work-logs.js
// Jelly Polly daily work logs (Salesman, Ice-Polly, Jelly Cup, Plastic).
// Port of the TH payroll/daily-work-logs.js onto the jellypolly schema.
// Leave is 1:1 with TH: rows go into the SHARED public.leave_records (one
// leave ledger per person keeps balances correct across companies) but are
// linked back via leave_records.jp_work_log_id (ON DELETE CASCADE), mirroring
// TH's work_log_id behaviour. Saving/updating/deleting a log auto-reprocesses
// the affected employees' JP payroll.
import { Router } from "express";
import {
  reprocessJPEmployeesSafe,
  JP_JOB_ID_TO_TYPE,
} from "./jpPayrollProcessor.js";

// jellypolly.payroll_employees job_type -> public.jobs id
const JP_TYPE_TO_JOB_ID = Object.fromEntries(
  Object.entries(JP_JOB_ID_TO_TYPE).map(([jobId, jobType]) => [jobType, jobId])
);

// Overtime threshold by day of week: Saturday = 5 hours, other days = 8 hours
// (same rule as TH daily logs).
function getOvertimeThreshold(logDate) {
  if (!logDate) return 8;
  const date = new Date(logDate);
  return date.getDay() === 6 ? 5 : 8;
}

const yearMonthOf = (logDate) => {
  // pg returns date columns as Date objects; API payloads send yyyy-MM-dd strings
  if (logDate instanceof Date) {
    return { year: logDate.getFullYear(), month: logDate.getMonth() + 1 };
  }
  const dateString = String(logDate).split("T")[0];
  const [year, month] = dateString.split("-");
  return { year: parseInt(year), month: parseInt(month) };
};

export default function (pool) {
  const router = Router();

  // Get daily work logs with filtering
  router.get("/", async (req, res) => {
    const {
      startDate,
      endDate,
      shift,
      status,
      section,
      page = 1,
      limit = 20,
    } = req.query;

    try {
      let query = `
      SELECT
        dwl.*,
        COUNT(DISTINCT dwle.employee_id) as total_workers,
        CAST(COALESCE(SUM(dwle.total_hours), 0) AS NUMERIC(10, 2)) as total_hours
      FROM jellypolly.daily_work_logs dwl
      LEFT JOIN jellypolly.daily_work_log_entries dwle ON dwl.id = dwle.work_log_id
      WHERE 1=1
    `;

      const values = [];
      let paramCount = 1;

      if (startDate) {
        query += ` AND dwl.log_date >= $${paramCount}`;
        values.push(startDate);
        paramCount++;
      }

      if (endDate) {
        query += ` AND dwl.log_date <= $${paramCount}`;
        values.push(endDate);
        paramCount++;
      }

      if (shift) {
        query += ` AND dwl.shift = $${paramCount}`;
        values.push(parseInt(shift));
        paramCount++;
      }

      if (status) {
        query += ` AND dwl.status = $${paramCount}`;
        values.push(status);
        paramCount++;
      }

      if (section) {
        query += ` AND dwl.section = $${paramCount}`;
        values.push(section);
        paramCount++;
      }

      query += `
      GROUP BY dwl.id
      ORDER BY dwl.log_date DESC, dwl.shift
    `;

      const countQuery = `
      SELECT COUNT(DISTINCT dwl.id) as total
      FROM jellypolly.daily_work_logs dwl
      WHERE 1=1 ${query.split("WHERE 1=1")[1].split("GROUP BY")[0]}
    `;

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, values),
        pool.query(query, values),
      ]);

      const offset = (page - 1) * limit;
      const paginatedLogs = dataResult.rows
        .slice(offset, offset + parseInt(limit))
        .map((log) => ({
          ...log,
          total_hours: parseFloat(log.total_hours),
          total_workers: parseInt(log.total_workers),
        }));

      res.json({
        logs: paginatedLogs,
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      });
    } catch (error) {
      console.error("Error fetching JP daily work logs:", error);
      res.status(500).json({
        message: "Error fetching daily work logs",
        error: error.message,
      });
    }
  });

  // Get a single work log by ID with all details
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const workLogResult = await pool.query(
        "SELECT dwl.* FROM jellypolly.daily_work_logs dwl WHERE dwl.id = $1",
        [id]
      );

      if (workLogResult.rows.length === 0) {
        return res.status(404).json({ message: "Work log not found" });
      }

      // Leave records linked to this JP work log (shared public.leave_records)
      const leaveRecordsResult = await pool.query(
        `SELECT
          lr.*,
          CAST(lr.amount_paid AS NUMERIC(10, 2)) as amount_paid,
          s.name as employee_name
        FROM jellypolly.leave_records lr
        LEFT JOIN jellypolly.staffs s ON lr.employee_id = s.id
        WHERE lr.work_log_id = $1
        ORDER BY s.name`,
        [id]
      );

      const entriesResult = await pool.query(
        `SELECT
          dwle.*,
          CAST(dwle.total_hours AS NUMERIC(10, 2)) as total_hours,
          CAST(COALESCE(dwle.force_ot_hours, 0) AS NUMERIC(4, 2)) as force_ot_hours,
          s.name as employee_name,
          j.name as job_name,
          fs.name as following_salesman_name
        FROM jellypolly.daily_work_log_entries dwle
        LEFT JOIN jellypolly.staffs s ON dwle.employee_id = s.id
        LEFT JOIN jellypolly.jobs j ON dwle.job_id = j.id
        LEFT JOIN jellypolly.staffs fs ON dwle.following_salesman_id = fs.id
        WHERE dwle.work_log_id = $1`,
        [id]
      );

      const entriesWithActivities = await Promise.all(
        entriesResult.rows.map(async (entry) => {
          const activitiesResult = await pool.query(
            `SELECT
              dwla.*,
              CAST(dwla.hours_applied AS NUMERIC(10, 2)) as hours_applied,
              CAST(dwla.units_produced AS NUMERIC(10, 2)) as units_produced,
              CAST(dwla.rate_used AS NUMERIC(10, 2)) as rate_used,
              CAST(dwla.calculated_amount AS NUMERIC(10, 2)) as calculated_amount,
              pc.description,
              pc.pay_type,
              pc.rate_unit
            FROM jellypolly.daily_work_log_activities dwla
            LEFT JOIN jellypolly.pay_codes pc ON dwla.pay_code_id = pc.id
            WHERE dwla.log_entry_id = $1`,
            [entry.id]
          );

          return {
            ...entry,
            total_hours: parseFloat(entry.total_hours),
            force_ot_hours: parseFloat(entry.force_ot_hours || 0),
            activities: activitiesResult.rows.map((activity) => ({
              ...activity,
              hours_applied: activity.hours_applied
                ? parseFloat(activity.hours_applied)
                : null,
              units_produced: activity.units_produced
                ? parseFloat(activity.units_produced)
                : null,
              foc_units: activity.foc_units
                ? parseFloat(activity.foc_units)
                : null,
              rate_used: parseFloat(activity.rate_used),
              calculated_amount: parseFloat(activity.calculated_amount),
            })),
          };
        })
      );

      // Separate regular entries from leave entries (mirrors TH: employees
      // with a leave record for this log get their activities merged into the
      // leave record instead of appearing as work entries)
      const leaveEmployeeIds = new Set(
        leaveRecordsResult.rows.map((record) => record.employee_id)
      );
      const regularEntries = entriesWithActivities.filter(
        (entry) => !leaveEmployeeIds.has(entry.employee_id)
      );
      const leaveEntries = entriesWithActivities.filter((entry) =>
        leaveEmployeeIds.has(entry.employee_id)
      );

      const leaveRecordsWithActivities = leaveRecordsResult.rows.map(
        (record) => {
          const leaveEntry = leaveEntries.find(
            (entry) => entry.employee_id === record.employee_id
          );
          return {
            ...record,
            amount_paid: parseFloat(record.amount_paid),
            activities: leaveEntry ? leaveEntry.activities : [],
          };
        }
      );

      res.json({
        ...workLogResult.rows[0],
        employeeEntries: regularEntries,
        leaveRecords: leaveRecordsWithActivities,
      });
    } catch (error) {
      console.error("Error fetching JP work log details:", error);
      res.status(500).json({
        message: "Error fetching work log details",
        error: error.message,
      });
    }
  });

  // Shared insert of one employee entry + activities
  const insertEntryWithActivities = async (workLogId, logDate, entry) => {
    const { employeeId, jobType, hours, activities } = entry;

    const entryResult = await pool.query(
      `INSERT INTO jellypolly.daily_work_log_entries (
        work_log_id, employee_id, job_id, total_hours,
        following_salesman_id, muat_mee_bags, muat_bihun_bags, location_type,
        is_doubled, force_ot_hours
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        workLogId,
        employeeId,
        jobType,
        hours,
        entry.followingSalesmanId || null,
        entry.muatMeeBags || 0,
        entry.muatBihunBags || 0,
        entry.locationType || "Local",
        entry.isDoubled || false,
        entry.forceOTHours || 0,
      ]
    );

    const entryId = entryResult.rows[0].id;

    if (activities && activities.length > 0) {
      const overtimeThreshold = getOvertimeThreshold(logDate);

      for (const activity of activities) {
        if (activity.isSelected) {
          let hoursApplied = null;
          if (activity.rateUnit === "Hour") {
            if (activity.payType === "Overtime") {
              // Natural OT = hours beyond the day's threshold (mirrors
              // calculateActivityAmount.ts so hours_applied matches
              // calculated_amount).
              hoursApplied = Math.max(0, hours - overtimeThreshold);
            } else {
              hoursApplied = Math.min(hours, overtimeThreshold);
            }
          }

          await pool.query(
            `INSERT INTO jellypolly.daily_work_log_activities (
              log_entry_id, pay_code_id, hours_applied,
              units_produced, rate_used, calculated_amount,
              is_manually_added, foc_units
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              entryId,
              activity.payCodeId,
              hoursApplied,
              activity.unitsProduced ? parseFloat(activity.unitsProduced) : null,
              parseFloat(activity.rate),
              parseFloat(activity.calculatedAmount),
              false,
              activity.unitsFOC ? parseFloat(activity.unitsFOC) : null,
            ]
          );
        }
      }
    }
  };

  // Insert one leave entry: a SHARED public.leave_records row (linked via
  // jp_work_log_id so deleting the JP log cascades it away) plus a jellypolly
  // work-log entry holding the leave activities. The activities are stored for
  // display; the processor pays leave via amount_paid and excludes leave-day
  // work items from gross, mirroring TH.
  const insertLeaveEntry = async (workLogId, logDate, leave) => {
    const { employeeId, leaveType, amount_paid, activities } = leave;

    // Resolve the employee's JP job id (assignment first, staffs.job fallback)
    const assignmentResult = await pool.query(
      `SELECT job_type FROM jellypolly.payroll_employees
       WHERE employee_id = $1 AND is_active = true
       ORDER BY id LIMIT 1`,
      [employeeId]
    );
    let jobId = assignmentResult.rows[0]
      ? JP_TYPE_TO_JOB_ID[assignmentResult.rows[0].job_type]
      : null;
    if (!jobId) {
      const staffResult = await pool.query(
        "SELECT job FROM jellypolly.staffs WHERE id = $1",
        [employeeId]
      );
      const jobs = staffResult.rows[0]?.job || [];
      jobId = jobs.find((j) => JP_JOB_ID_TO_TYPE[j]) || jobs[0] || null;
    }
    if (!jobId) {
      throw new Error(`Employee ${employeeId} has no JP job assignment`);
    }

    await pool.query(
      `INSERT INTO jellypolly.leave_records (
        employee_id, leave_date, leave_type, work_log_id, days_taken, status, amount_paid
      ) VALUES ($1, $2, $3, $4, $5, 'approved', $6)`,
      [employeeId, logDate, leaveType, workLogId, 1.0, amount_paid || 0]
    );

    const leaveEntryResult = await pool.query(
      `INSERT INTO jellypolly.daily_work_log_entries (
        work_log_id, employee_id, job_id, total_hours
      ) VALUES ($1, $2, $3, $4)
      RETURNING id`,
      [workLogId, employeeId, jobId, 8]
    );
    const leaveEntryId = leaveEntryResult.rows[0].id;

    if (activities && activities.length > 0) {
      for (const activity of activities) {
        if (activity.isSelected) {
          await pool.query(
            `INSERT INTO jellypolly.daily_work_log_activities (
              log_entry_id, pay_code_id, hours_applied,
              units_produced, rate_used, calculated_amount,
              is_manually_added, foc_units
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              leaveEntryId,
              activity.payCodeId,
              activity.hoursApplied,
              activity.unitsProduced || null,
              parseFloat(activity.rate),
              parseFloat(activity.calculatedAmount),
              false,
              activity.unitsFOC ? parseFloat(activity.unitsFOC) : null,
            ]
          );
        }
      }
    }
  };

  // Create a new daily work log
  router.post("/", async (req, res) => {
    const {
      logDate,
      shift,
      dayType,
      section,
      contextData,
      status,
      employeeEntries,
      leaveEntries,
    } = req.body;

    if (
      (!employeeEntries || employeeEntries.length === 0) &&
      (!leaveEntries || leaveEntries.length === 0)
    ) {
      return res.status(400).json({
        message: "At least one employee entry or leave entry is required",
      });
    }

    try {
      await pool.query("BEGIN");

      const workLogResult = await pool.query(
        `INSERT INTO jellypolly.daily_work_logs (
          log_date, shift, day_type, section, context_data, status
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [logDate, shift, dayType, section, contextData || {}, status]
      );

      const workLogId = workLogResult.rows[0].id;

      for (const entry of employeeEntries || []) {
        await insertEntryWithActivities(workLogId, logDate, entry);
      }

      for (const leave of leaveEntries || []) {
        await insertLeaveEntry(workLogId, logDate, leave);
      }

      await pool.query("COMMIT");

      const { year, month } = yearMonthOf(logDate);
      await reprocessJPEmployeesSafe(pool, {
        year,
        month,
        employeeIds: [
          ...(employeeEntries || []).map((e) => e.employeeId),
          ...(leaveEntries || []).map((l) => l.employeeId),
        ],
      });

      res.status(201).json({
        message: "Work log submitted successfully",
        workLogId,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error creating JP daily work log:", error);
      res.status(500).json({
        message: "Error creating daily work log",
        error: error.message,
      });
    }
  });

  // Update existing work log
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      logDate,
      shift,
      dayType,
      section,
      contextData,
      status,
      employeeEntries,
      leaveEntries,
    } = req.body;

    if (
      (!employeeEntries || employeeEntries.length === 0) &&
      (!leaveEntries || leaveEntries.length === 0)
    ) {
      return res.status(400).json({
        message: "At least one employee entry or leave entry is required",
      });
    }

    try {
      await pool.query("BEGIN");

      const checkResult = await pool.query(
        "SELECT status, log_date FROM jellypolly.daily_work_logs WHERE id = $1",
        [id]
      );

      if (checkResult.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Work log not found" });
      }

      const previousEntries = await pool.query(
        "SELECT DISTINCT employee_id FROM jellypolly.daily_work_log_entries WHERE work_log_id = $1",
        [id]
      );
      const previousDate = checkResult.rows[0].log_date;

      await pool.query(
        `UPDATE jellypolly.daily_work_logs
         SET log_date = $1, shift = $2, day_type = $3, section = $4,
             context_data = $5, status = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [logDate, shift, dayType, section, contextData || {}, status, id]
      );

      // Clear old leave records and work entries (mirrors TH)
      await pool.query(
        "DELETE FROM jellypolly.leave_records WHERE work_log_id = $1",
        [id]
      );
      await pool.query(
        "DELETE FROM jellypolly.daily_work_log_entries WHERE work_log_id = $1",
        [id]
      );

      for (const entry of employeeEntries || []) {
        await insertEntryWithActivities(id, logDate, entry);
      }

      for (const leave of leaveEntries || []) {
        await insertLeaveEntry(id, logDate, leave);
      }

      await pool.query("COMMIT");

      const affectedIds = [
        ...new Set([
          ...previousEntries.rows.map((r) => r.employee_id),
          ...(employeeEntries || []).map((e) => e.employeeId),
          ...(leaveEntries || []).map((l) => l.employeeId),
        ]),
      ];
      const { year, month } = yearMonthOf(logDate);
      await reprocessJPEmployeesSafe(pool, { year, month, employeeIds: affectedIds });
      // If the log moved across months, reprocess the old month too
      if (previousDate) {
        const previous = yearMonthOf(previousDate);
        if (previous.year !== year || previous.month !== month) {
          await reprocessJPEmployeesSafe(pool, {
            year: previous.year,
            month: previous.month,
            employeeIds: affectedIds,
          });
        }
      }

      res.json({
        message: "Work log updated successfully",
        workLogId: id,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error updating JP daily work log:", error);
      res.status(500).json({
        message: "Error updating daily work log",
        error: error.message,
      });
    }
  });

  // Delete work log
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      await pool.query("BEGIN");

      const checkResult = await pool.query(
        "SELECT status, log_date FROM jellypolly.daily_work_logs WHERE id = $1",
        [id]
      );

      if (checkResult.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Work log not found" });
      }

      const logDate = checkResult.rows[0].log_date;
      const affectedEntries = await pool.query(
        "SELECT DISTINCT employee_id FROM jellypolly.daily_work_log_entries WHERE work_log_id = $1",
        [id]
      );

      // Cascade handles entries + activities
      await pool.query("DELETE FROM jellypolly.daily_work_logs WHERE id = $1", [id]);

      await pool.query("COMMIT");

      const { year, month } = yearMonthOf(logDate);
      await reprocessJPEmployeesSafe(pool, {
        year,
        month,
        employeeIds: affectedEntries.rows.map((r) => r.employee_id),
      });

      res.json({ message: "Work log deleted successfully" });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error deleting JP work log:", error);
      res.status(500).json({
        message: "Error deleting work log",
        error: error.message,
      });
    }
  });

  return router;
}
