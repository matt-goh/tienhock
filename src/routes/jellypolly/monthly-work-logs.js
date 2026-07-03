// src/routes/jellypolly/monthly-work-logs.js
// Jelly Polly Office/Maintenance monthly entry. Port of the TH
// payroll/monthly-work-logs.js onto the jellypolly schema. Leave is 1:1 with
// TH and shares public.leave_records (one ledger per person keeps balances
// correct across companies); monthly-page leave rows have no work-log link,
// exactly like TH's monthly leave. Saving/updating/deleting a log
// auto-reprocesses the affected employees' JP payroll.
import { Router } from "express";
import { reprocessJPEmployeesSafe } from "./jpPayrollProcessor.js";

export default function (pool) {
  const router = Router();

  const parseLeaveAmount = (amount) => {
    const parsedAmount = Number(amount || 0);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return null;
    }
    return Math.round(parsedAmount * 100) / 100;
  };

  // Staff ids assigned to a JP section/job type (leave lists are scoped to the
  // page's assigned staff, mirroring TH's staffs.job section filter)
  const getSectionEmployeeIds = async (section) => {
    const sectionKey = Array.isArray(section) ? section[0] : section;
    if (!sectionKey) return [];
    const result = await pool.query(
      `SELECT employee_id FROM jellypolly.payroll_employees
       WHERE job_type = $1 AND is_active = true`,
      [sectionKey]
    );
    return result.rows.map((r) => r.employee_id);
  };

  const getMonthlyEntryHours = (entry) => ({
    totalHours: Number(entry.totalHours) || 0,
    overtimeHours: Number(entry.overtimeHours) || 0,
    ahadHours: Number(entry.ahadHours) || 0,
    ahadOvertimeHours: Number(entry.ahadOvertimeHours) || 0,
    umumHours: Number(entry.umumHours) || 0,
    umumOvertimeHours: Number(entry.umumOvertimeHours) || 0,
  });

  const hasSelectedActivityAmount = (entry) =>
    Array.isArray(entry.activities) &&
    entry.activities.some(
      (activity) =>
        activity &&
        activity.isSelected !== false &&
        Number(activity.calculatedAmount || 0) > 0
    );

  const getMonthlyEntryHoursError = (entry) => {
    const hours = getMonthlyEntryHours(entry);
    const hourValues = Object.values(hours);

    if (hourValues.some((value) => value < 0)) {
      return "Monthly log hours cannot be negative";
    }

    if (
      hourValues.reduce((sum, value) => sum + value, 0) <= 0 &&
      !hasSelectedActivityAmount(entry)
    ) {
      return "At least one monthly log hour value or paid activity is required";
    }

    return null;
  };

  // Get monthly work logs with filtering
  router.get("/", async (req, res) => {
    const { month, year, section, status, page = 1, limit = 20 } = req.query;

    try {
      let query = `
        SELECT
          mwl.*,
          COUNT(DISTINCT mwle.employee_id) as total_workers,
          CAST(COALESCE(SUM(mwle.total_hours), 0) AS NUMERIC(10, 2)) as total_hours,
          CAST(COALESCE(SUM(mwle.overtime_hours), 0) AS NUMERIC(10, 2)) as total_overtime_hours,
          CAST(COALESCE(SUM(mwle.ahad_hours), 0) AS NUMERIC(10, 2)) as total_ahad_hours,
          CAST(COALESCE(SUM(mwle.ahad_overtime_hours), 0) AS NUMERIC(10, 2)) as total_ahad_overtime_hours,
          CAST(COALESCE(SUM(mwle.umum_hours), 0) AS NUMERIC(10, 2)) as total_umum_hours,
          CAST(COALESCE(SUM(mwle.umum_overtime_hours), 0) AS NUMERIC(10, 2)) as total_umum_overtime_hours
        FROM jellypolly.monthly_work_logs mwl
        LEFT JOIN jellypolly.monthly_work_log_entries mwle ON mwl.id = mwle.monthly_log_id
        WHERE 1=1
      `;

      const values = [];
      let paramCount = 1;

      if (month) {
        query += ` AND mwl.log_month = $${paramCount}`;
        values.push(parseInt(month));
        paramCount++;
      }

      if (year) {
        query += ` AND mwl.log_year = $${paramCount}`;
        values.push(parseInt(year));
        paramCount++;
      }

      if (section) {
        query += ` AND mwl.section = $${paramCount}`;
        values.push(section);
        paramCount++;
      }

      if (status) {
        query += ` AND mwl.status = $${paramCount}`;
        values.push(status);
        paramCount++;
      }

      query += `
        GROUP BY mwl.id
        ORDER BY mwl.log_year DESC, mwl.log_month DESC
      `;

      const countQuery = `
        SELECT COUNT(DISTINCT mwl.id) as total
        FROM jellypolly.monthly_work_logs mwl
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
          total_overtime_hours: parseFloat(log.total_overtime_hours),
          total_ahad_hours: parseFloat(log.total_ahad_hours),
          total_ahad_overtime_hours: parseFloat(log.total_ahad_overtime_hours),
          total_umum_hours: parseFloat(log.total_umum_hours),
          total_umum_overtime_hours: parseFloat(log.total_umum_overtime_hours),
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
      console.error("Error fetching JP monthly work logs:", error);
      res.status(500).json({
        message: "Error fetching monthly work logs",
        error: error.message,
      });
    }
  });

  // Get a single monthly work log by ID with all details
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const workLogResult = await pool.query(
        "SELECT mwl.* FROM jellypolly.monthly_work_logs mwl WHERE mwl.id = $1",
        [id]
      );

      if (workLogResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly work log not found" });
      }

      const workLog = workLogResult.rows[0];

      const entriesResult = await pool.query(
        `SELECT
          mwle.*,
          CAST(mwle.total_hours AS NUMERIC(10, 2)) as total_hours,
          CAST(mwle.overtime_hours AS NUMERIC(10, 2)) as overtime_hours,
          CAST(mwle.ahad_hours AS NUMERIC(10, 2)) as ahad_hours,
          CAST(mwle.ahad_overtime_hours AS NUMERIC(10, 2)) as ahad_overtime_hours,
          CAST(mwle.umum_hours AS NUMERIC(10, 2)) as umum_hours,
          CAST(mwle.umum_overtime_hours AS NUMERIC(10, 2)) as umum_overtime_hours,
          s.name as employee_name,
          j.name as job_name
        FROM jellypolly.monthly_work_log_entries mwle
        LEFT JOIN jellypolly.staffs s ON mwle.employee_id = s.id
        LEFT JOIN jellypolly.jobs j ON mwle.job_id = j.id
        WHERE mwle.monthly_log_id = $1`,
        [id]
      );

      const entriesWithActivities = await Promise.all(
        entriesResult.rows.map(async (entry) => {
          const activitiesResult = await pool.query(
            `SELECT
              mwla.*,
              CAST(mwla.hours_applied AS NUMERIC(10, 2)) as hours_applied,
              CAST(mwla.units_produced AS NUMERIC(10, 2)) as units_produced,
              CAST(mwla.rate_used AS NUMERIC(10, 2)) as rate_used,
              CAST(mwla.calculated_amount AS NUMERIC(10, 2)) as calculated_amount,
              COALESCE(mwla.description, pc.description) as description,
              pc.pay_type,
              pc.rate_unit
            FROM jellypolly.monthly_work_log_activities mwla
            LEFT JOIN jellypolly.pay_codes pc ON mwla.pay_code_id = pc.id
            WHERE mwla.monthly_entry_id = $1`,
            [entry.id]
          );

          return {
            ...entry,
            total_hours: parseFloat(entry.total_hours),
            overtime_hours: parseFloat(entry.overtime_hours),
            ahad_hours: parseFloat(entry.ahad_hours || 0),
            ahad_overtime_hours: parseFloat(entry.ahad_overtime_hours || 0),
            umum_hours: parseFloat(entry.umum_hours || 0),
            umum_overtime_hours: parseFloat(entry.umum_overtime_hours || 0),
            activities: activitiesResult.rows.map((activity) => ({
              ...activity,
              hours_applied: activity.hours_applied
                ? parseFloat(activity.hours_applied)
                : null,
              units_produced: activity.units_produced
                ? parseFloat(activity.units_produced)
                : null,
              rate_used: parseFloat(activity.rate_used),
              calculated_amount: parseFloat(activity.calculated_amount),
            })),
          };
        })
      );

      // Leave records for this month scoped to the section's assigned staff
      const sectionEmployeeIds = await getSectionEmployeeIds(workLog.section);
      let leaveRecords = [];
      if (sectionEmployeeIds.length > 0) {
        const leaveResult = await pool.query(
          `SELECT
            lr.*,
            CAST(lr.amount_paid AS NUMERIC(10, 2)) as amount_paid,
            s.name as employee_name
          FROM jellypolly.leave_records lr
          LEFT JOIN jellypolly.staffs s ON lr.employee_id = s.id
          WHERE EXTRACT(MONTH FROM lr.leave_date) = $1
            AND EXTRACT(YEAR FROM lr.leave_date) = $2
            AND lr.employee_id = ANY($3)
          ORDER BY lr.leave_date, s.name`,
          [workLog.log_month, workLog.log_year, sectionEmployeeIds]
        );
        leaveRecords = leaveResult.rows.map((record) => ({
          ...record,
          amount_paid: parseFloat(record.amount_paid),
        }));
      }

      res.json({
        ...workLog,
        employeeEntries: entriesWithActivities,
        leaveRecords,
      });
    } catch (error) {
      console.error("Error fetching JP monthly work log details:", error);
      res.status(500).json({
        message: "Error fetching monthly work log details",
        error: error.message,
      });
    }
  });

  // Create a new monthly work log
  router.post("/", async (req, res) => {
    const {
      logMonth,
      logYear,
      section,
      contextData,
      status,
      employeeEntries,
      leaveEntries,
      updatedLeaveEntries,
    } = req.body;

    if (!employeeEntries || employeeEntries.length === 0) {
      return res.status(400).json({
        message: "At least one employee entry is required",
      });
    }

    const invalidHoursEntry = employeeEntries.find((entry) =>
      getMonthlyEntryHoursError(entry)
    );
    if (invalidHoursEntry) {
      return res.status(400).json({
        message: getMonthlyEntryHoursError(invalidHoursEntry),
      });
    }

    try {
      await pool.query("BEGIN");

      const duplicateResult = await pool.query(
        `SELECT id FROM jellypolly.monthly_work_logs
         WHERE log_month = $1 AND log_year = $2 AND section = $3`,
        [logMonth, logYear, section]
      );

      if (duplicateResult.rows.length > 0) {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: `A monthly log for ${section} in ${logMonth}/${logYear} already exists`,
          existingId: duplicateResult.rows[0].id,
        });
      }

      const workLogResult = await pool.query(
        `INSERT INTO jellypolly.monthly_work_logs (
          log_month, log_year, section, context_data, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [logMonth, logYear, section, contextData || {}, status || "Submitted"]
      );

      const workLogId = workLogResult.rows[0].id;

      for (const entry of employeeEntries) {
        const { employeeId, jobType, activities } = entry;
        const {
          totalHours,
          overtimeHours,
          ahadHours,
          ahadOvertimeHours,
          umumHours,
          umumOvertimeHours,
        } = getMonthlyEntryHours(entry);

        const entryResult = await pool.query(
          `INSERT INTO jellypolly.monthly_work_log_entries (
            monthly_log_id, employee_id, job_id, total_hours, overtime_hours,
            ahad_hours, ahad_overtime_hours, umum_hours, umum_overtime_hours
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            workLogId,
            employeeId,
            jobType,
            totalHours,
            overtimeHours || 0,
            ahadHours || 0,
            ahadOvertimeHours || 0,
            umumHours || 0,
            umumOvertimeHours || 0,
          ]
        );

        const entryId = entryResult.rows[0].id;

        if (activities && activities.length > 0) {
          for (const activity of activities) {
            if (activity.isSelected) {
              await pool.query(
                `INSERT INTO jellypolly.monthly_work_log_activities (
                  monthly_entry_id, pay_code_id, description, hours_applied,
                  units_produced, rate_used, calculated_amount, is_manually_added
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  entryId,
                  activity.payCodeId,
                  activity.description || null,
                  activity.hoursApplied || null,
                  activity.unitsProduced || null,
                  parseFloat(activity.rate),
                  parseFloat(activity.calculatedAmount),
                  activity.isManuallyAdded || false,
                ]
              );
            }
          }
        }
      }

      // Insert new leave records (shared public.leave_records, no work-log
      // link — same as TH monthly leave)
      if (leaveEntries && Array.isArray(leaveEntries) && leaveEntries.length > 0) {
        for (const leave of leaveEntries) {
          const { employeeId, leaveDate, leaveType, amount_paid } = leave;
          const leaveAmount = parseLeaveAmount(amount_paid);

          if (leaveAmount === null) {
            await pool.query("ROLLBACK");
            return res.status(400).json({
              message: "Leave amount must be a non-negative number",
            });
          }

          const existingLeave = await pool.query(
            `SELECT id FROM jellypolly.leave_records WHERE employee_id = $1 AND leave_date = $2`,
            [employeeId, leaveDate]
          );

          if (existingLeave.rows.length === 0) {
            await pool.query(
              `INSERT INTO jellypolly.leave_records (
                employee_id, leave_date, leave_type, days_taken, status, amount_paid
              ) VALUES ($1, $2, $3, $4, 'approved', $5)`,
              [employeeId, leaveDate, leaveType, 1.0, leaveAmount]
            );
          }
        }
      }

      // Update existing saved leave amounts if any
      if (
        updatedLeaveEntries &&
        Array.isArray(updatedLeaveEntries) &&
        updatedLeaveEntries.length > 0
      ) {
        for (const leave of updatedLeaveEntries) {
          const { id: leaveId, amount_paid } = leave;
          const leaveAmount = parseLeaveAmount(amount_paid);

          if (!leaveId || leaveAmount === null) {
            await pool.query("ROLLBACK");
            return res.status(400).json({
              message: "Leave amount must be a non-negative number",
            });
          }

          await pool.query(
            "UPDATE jellypolly.leave_records SET amount_paid = $1 WHERE id = $2",
            [leaveAmount, leaveId]
          );
        }
      }

      await pool.query("COMMIT");

      // Auto-reprocess the affected employees' JP payroll for this month
      await reprocessJPEmployeesSafe(pool, {
        year: parseInt(logYear),
        month: parseInt(logMonth),
        employeeIds: [
          ...employeeEntries.map((e) => e.employeeId),
          ...(leaveEntries || []).map((l) => l.employeeId),
          ...(updatedLeaveEntries || [])
            .map((l) => l.employeeId)
            .filter(Boolean),
        ],
      });

      res.status(201).json({
        message: "Monthly work log created successfully",
        workLogId,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error creating JP monthly work log:", error);
      res.status(500).json({
        message: "Error creating monthly work log",
        error: error.message,
      });
    }
  });

  // Update existing monthly work log
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      logMonth,
      logYear,
      section,
      contextData,
      status,
      employeeEntries,
      leaveEntries,
      updatedLeaveEntries,
      deletedLeaveIds,
    } = req.body;

    if (!employeeEntries || employeeEntries.length === 0) {
      return res.status(400).json({
        message: "At least one employee entry is required",
      });
    }

    const invalidHoursEntry = employeeEntries.find((entry) =>
      getMonthlyEntryHoursError(entry)
    );
    if (invalidHoursEntry) {
      return res.status(400).json({
        message: getMonthlyEntryHoursError(invalidHoursEntry),
      });
    }

    try {
      await pool.query("BEGIN");

      const checkResult = await pool.query(
        "SELECT status FROM jellypolly.monthly_work_logs WHERE id = $1",
        [id]
      );

      if (checkResult.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Monthly work log not found" });
      }

      // Previously entered employees also need reprocessing if they are removed
      const previousEntries = await pool.query(
        "SELECT DISTINCT employee_id FROM jellypolly.monthly_work_log_entries WHERE monthly_log_id = $1",
        [id]
      );

      await pool.query(
        `UPDATE jellypolly.monthly_work_logs
         SET log_month = $1, log_year = $2, section = $3,
             context_data = $4, status = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [logMonth, logYear, section, contextData || {}, status, id]
      );

      await pool.query(
        "DELETE FROM jellypolly.monthly_work_log_entries WHERE monthly_log_id = $1",
        [id]
      );

      for (const entry of employeeEntries) {
        const { employeeId, jobType, activities } = entry;
        const {
          totalHours,
          overtimeHours,
          ahadHours,
          ahadOvertimeHours,
          umumHours,
          umumOvertimeHours,
        } = getMonthlyEntryHours(entry);

        const entryResult = await pool.query(
          `INSERT INTO jellypolly.monthly_work_log_entries (
            monthly_log_id, employee_id, job_id, total_hours, overtime_hours,
            ahad_hours, ahad_overtime_hours, umum_hours, umum_overtime_hours
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            id,
            employeeId,
            jobType,
            totalHours,
            overtimeHours || 0,
            ahadHours || 0,
            ahadOvertimeHours || 0,
            umumHours || 0,
            umumOvertimeHours || 0,
          ]
        );

        const entryId = entryResult.rows[0].id;

        if (activities && activities.length > 0) {
          for (const activity of activities) {
            if (activity.isSelected) {
              await pool.query(
                `INSERT INTO jellypolly.monthly_work_log_activities (
                  monthly_entry_id, pay_code_id, description, hours_applied,
                  units_produced, rate_used, calculated_amount, is_manually_added
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  entryId,
                  activity.payCodeId,
                  activity.description || null,
                  activity.hoursApplied || null,
                  activity.unitsProduced || null,
                  parseFloat(activity.rate),
                  parseFloat(activity.calculatedAmount),
                  activity.isManuallyAdded || false,
                ]
              );
            }
          }
        }
      }

      // Delete specified leave records
      const deletedLeaveEmployeeIds = [];
      if (
        deletedLeaveIds &&
        Array.isArray(deletedLeaveIds) &&
        deletedLeaveIds.length > 0
      ) {
        for (const leaveId of deletedLeaveIds) {
          const deleted = await pool.query(
            "DELETE FROM jellypolly.leave_records WHERE id = $1 RETURNING employee_id",
            [leaveId]
          );
          if (deleted.rows[0]) {
            deletedLeaveEmployeeIds.push(deleted.rows[0].employee_id);
          }
        }
      }

      // Insert new leave records (isNew only, same as TH)
      if (leaveEntries && Array.isArray(leaveEntries) && leaveEntries.length > 0) {
        for (const leave of leaveEntries) {
          if (leave.isNew) {
            const { employeeId, leaveDate, leaveType, amount_paid } = leave;
            const leaveAmount = parseLeaveAmount(amount_paid);

            if (leaveAmount === null) {
              await pool.query("ROLLBACK");
              return res.status(400).json({
                message: "Leave amount must be a non-negative number",
              });
            }

            const existingLeave = await pool.query(
              `SELECT id FROM jellypolly.leave_records WHERE employee_id = $1 AND leave_date = $2`,
              [employeeId, leaveDate]
            );

            if (existingLeave.rows.length === 0) {
              await pool.query(
                `INSERT INTO jellypolly.leave_records (
                  employee_id, leave_date, leave_type, days_taken, status, amount_paid
                ) VALUES ($1, $2, $3, $4, 'approved', $5)`,
                [employeeId, leaveDate, leaveType, 1.0, leaveAmount]
              );
            }
          }
        }
      }

      // Update existing saved leave amounts if any
      if (
        updatedLeaveEntries &&
        Array.isArray(updatedLeaveEntries) &&
        updatedLeaveEntries.length > 0
      ) {
        for (const leave of updatedLeaveEntries) {
          const { id: leaveId, amount_paid } = leave;
          const leaveAmount = parseLeaveAmount(amount_paid);

          if (!leaveId || leaveAmount === null) {
            await pool.query("ROLLBACK");
            return res.status(400).json({
              message: "Leave amount must be a non-negative number",
            });
          }

          await pool.query(
            "UPDATE jellypolly.leave_records SET amount_paid = $1 WHERE id = $2",
            [leaveAmount, leaveId]
          );
        }
      }

      await pool.query("COMMIT");

      const affectedIds = [
        ...new Set([
          ...previousEntries.rows.map((r) => r.employee_id),
          ...employeeEntries.map((e) => e.employeeId),
          ...(leaveEntries || []).map((l) => l.employeeId).filter(Boolean),
          ...(updatedLeaveEntries || [])
            .map((l) => l.employeeId)
            .filter(Boolean),
          ...deletedLeaveEmployeeIds,
        ]),
      ];
      await reprocessJPEmployeesSafe(pool, {
        year: parseInt(logYear),
        month: parseInt(logMonth),
        employeeIds: affectedIds,
      });

      res.json({
        message: "Monthly work log updated successfully",
        workLogId: id,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error updating JP monthly work log:", error);
      res.status(500).json({
        message: "Error updating monthly work log",
        error: error.message,
      });
    }
  });

  // Delete monthly work log
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      await pool.query("BEGIN");

      const checkResult = await pool.query(
        "SELECT log_month, log_year FROM jellypolly.monthly_work_logs WHERE id = $1",
        [id]
      );

      if (checkResult.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Monthly work log not found" });
      }

      const { log_month, log_year } = checkResult.rows[0];

      const affectedEntries = await pool.query(
        "SELECT DISTINCT employee_id FROM jellypolly.monthly_work_log_entries WHERE monthly_log_id = $1",
        [id]
      );

      await pool.query("DELETE FROM jellypolly.monthly_work_logs WHERE id = $1", [
        id,
      ]);

      await pool.query("COMMIT");

      await reprocessJPEmployeesSafe(pool, {
        year: log_year,
        month: log_month,
        employeeIds: affectedEntries.rows.map((r) => r.employee_id),
      });

      res.json({ message: "Monthly work log deleted successfully" });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error deleting JP monthly work log:", error);
      res.status(500).json({
        message: "Error deleting monthly work log",
        error: error.message,
      });
    }
  });

  // Leave records for a month, scoped to the JP section's assigned staff
  // (mirrors TH's /leave/:year/:month, but filtered by JP assignments instead
  // of staffs.job)
  router.get("/leave/:year/:month", async (req, res) => {
    const { year, month } = req.params;
    const { section } = req.query;

    try {
      let query = `
        SELECT
          lr.*,
          CAST(lr.amount_paid AS NUMERIC(10, 2)) as amount_paid,
          s.name as employee_name,
          s.job as employee_jobs
        FROM jellypolly.leave_records lr
        LEFT JOIN jellypolly.staffs s ON lr.employee_id = s.id
        WHERE EXTRACT(MONTH FROM lr.leave_date) = $1
          AND EXTRACT(YEAR FROM lr.leave_date) = $2
      `;
      const values = [parseInt(month), parseInt(year)];

      if (section) {
        const sectionEmployeeIds = await getSectionEmployeeIds(section);
        if (sectionEmployeeIds.length === 0) {
          return res.json([]);
        }
        query += ` AND lr.employee_id = ANY($3)`;
        values.push(sectionEmployeeIds);
      }

      query += ` ORDER BY lr.leave_date, s.name`;

      const result = await pool.query(query, values);

      res.json(
        result.rows.map((record) => ({
          ...record,
          amount_paid: parseFloat(record.amount_paid),
        }))
      );
    } catch (error) {
      console.error("Error fetching JP leave records:", error);
      res.status(500).json({
        message: "Error fetching leave records",
        error: error.message,
      });
    }
  });

  return router;
}
