// src/routes/payroll/monthly-work-logs.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get monthly work logs with filtering
  router.get("/", async (req, res) => {
    const {
      month,
      year,
      section,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    try {
      let query = `
        SELECT
          mwl.*,
          COUNT(DISTINCT mwle.employee_id) as total_workers,
          CAST(COALESCE(SUM(mwle.total_hours), 0) AS NUMERIC(10, 2)) as total_hours,
          CAST(COALESCE(SUM(mwle.overtime_hours), 0) AS NUMERIC(10, 2)) as total_overtime_hours
        FROM monthly_work_logs mwl
        LEFT JOIN monthly_work_log_entries mwle ON mwl.id = mwle.monthly_log_id
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

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(DISTINCT mwl.id) as total
        FROM monthly_work_logs mwl
        WHERE 1=1 ${query.split("WHERE 1=1")[1].split("GROUP BY")[0]}
      `;

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, values),
        pool.query(query, values),
      ]);

      // Apply pagination
      const offset = (page - 1) * limit;
      const paginatedLogs = dataResult.rows
        .slice(offset, offset + parseInt(limit))
        .map((log) => ({
          ...log,
          total_hours: parseFloat(log.total_hours),
          total_overtime_hours: parseFloat(log.total_overtime_hours),
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
      console.error("Error fetching monthly work logs:", error);
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
      // Get main monthly work log
      const workLogQuery = `
        SELECT mwl.*
        FROM monthly_work_logs mwl
        WHERE mwl.id = $1
      `;
      const workLogResult = await pool.query(workLogQuery, [id]);

      if (workLogResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly work log not found" });
      }

      const workLog = workLogResult.rows[0];

      // Get employee entries with job information
      const entriesQuery = `
        SELECT
          mwle.*,
          CAST(mwle.total_hours AS NUMERIC(10, 2)) as total_hours,
          CAST(mwle.overtime_hours AS NUMERIC(10, 2)) as overtime_hours,
          s.name as employee_name,
          j.name as job_name
        FROM monthly_work_log_entries mwle
        LEFT JOIN staffs s ON mwle.employee_id = s.id
        LEFT JOIN jobs j ON mwle.job_id = j.id
        WHERE mwle.monthly_log_id = $1
      `;
      const entriesResult = await pool.query(entriesQuery, [id]);

      // Get activities for each entry
      const entriesWithActivities = await Promise.all(
        entriesResult.rows.map(async (entry) => {
          const activitiesQuery = `
            SELECT
              mwla.*,
              CAST(mwla.hours_applied AS NUMERIC(10, 2)) as hours_applied,
              CAST(mwla.units_produced AS NUMERIC(10, 2)) as units_produced,
              CAST(mwla.rate_used AS NUMERIC(10, 2)) as rate_used,
              CAST(mwla.calculated_amount AS NUMERIC(10, 2)) as calculated_amount,
              pc.description,
              pc.pay_type,
              pc.rate_unit
            FROM monthly_work_log_activities mwla
            LEFT JOIN pay_codes pc ON mwla.pay_code_id = pc.id
            WHERE mwla.monthly_entry_id = $1
          `;
          const activitiesResult = await pool.query(activitiesQuery, [entry.id]);

          return {
            ...entry,
            total_hours: parseFloat(entry.total_hours),
            overtime_hours: parseFloat(entry.overtime_hours),
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

      // Get leave records for this month and section's employees
      // Include employees whose job includes this section (not just those with work entries)
      const leaveQuery = `
        SELECT
          lr.*,
          CAST(lr.amount_paid AS NUMERIC(10, 2)) as amount_paid,
          s.name as employee_name
        FROM leave_records lr
        LEFT JOIN staffs s ON lr.employee_id = s.id
        WHERE EXTRACT(MONTH FROM lr.leave_date) = $1
          AND EXTRACT(YEAR FROM lr.leave_date) = $2
          AND s.job::jsonb ? $3
        ORDER BY lr.leave_date, s.name
      `;
      const leaveResult = await pool.query(leaveQuery, [
        workLog.log_month,
        workLog.log_year,
        workLog.section,
      ]);

      res.json({
        ...workLog,
        employeeEntries: entriesWithActivities,
        leaveRecords: leaveResult.rows.map((record) => ({
          ...record,
          amount_paid: parseFloat(record.amount_paid),
        })),
      });
    } catch (error) {
      console.error("Error fetching monthly work log details:", error);
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
    } = req.body;

    if (!employeeEntries || employeeEntries.length === 0) {
      return res.status(400).json({
        message: "At least one employee entry is required",
      });
    }

    try {
      await pool.query("BEGIN");

      // Check for duplicate (same month/year/section)
      const duplicateCheck = `
        SELECT id FROM monthly_work_logs
        WHERE log_month = $1 AND log_year = $2 AND section = $3
      `;
      const duplicateResult = await pool.query(duplicateCheck, [
        logMonth,
        logYear,
        section,
      ]);

      if (duplicateResult.rows.length > 0) {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: `A monthly log for ${section} in ${logMonth}/${logYear} already exists`,
          existingId: duplicateResult.rows[0].id,
        });
      }

      // Insert main monthly work log
      const workLogQuery = `
        INSERT INTO monthly_work_logs (
          log_month, log_year, section, context_data, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;

      const workLogResult = await pool.query(workLogQuery, [
        logMonth,
        logYear,
        section,
        contextData || {},
        status || "Submitted",
      ]);

      const workLogId = workLogResult.rows[0].id;

      // Insert employee entries and activities
      for (const entry of employeeEntries) {
        const { employeeId, jobType, totalHours, overtimeHours, activities } = entry;

        // Insert employee entry
        const entryQuery = `
          INSERT INTO monthly_work_log_entries (
            monthly_log_id, employee_id, job_id, total_hours, overtime_hours
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `;

        const entryResult = await pool.query(entryQuery, [
          workLogId,
          employeeId,
          jobType,
          totalHours,
          overtimeHours || 0,
        ]);

        const entryId = entryResult.rows[0].id;

        // Insert activities for this employee entry
        if (activities && activities.length > 0) {
          for (const activity of activities) {
            if (activity.isSelected) {
              const activityQuery = `
                INSERT INTO monthly_work_log_activities (
                  monthly_entry_id, pay_code_id, hours_applied,
                  units_produced, rate_used, calculated_amount, is_manually_added
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              `;

              await pool.query(activityQuery, [
                entryId,
                activity.payCodeId,
                activity.hoursApplied || null,
                activity.unitsProduced || null,
                parseFloat(activity.rate),
                parseFloat(activity.calculatedAmount),
                activity.isManuallyAdded || false,
              ]);
            }
          }
        }
      }

      // Insert leave records if any
      if (leaveEntries && Array.isArray(leaveEntries) && leaveEntries.length > 0) {
        for (const leave of leaveEntries) {
          const { employeeId, leaveDate, leaveType, amount_paid, activities } = leave;

          // Check if leave record already exists for this date/employee
          const existingLeave = await pool.query(
            `SELECT id FROM leave_records WHERE employee_id = $1 AND leave_date = $2`,
            [employeeId, leaveDate]
          );

          if (existingLeave.rows.length === 0) {
            // Insert new leave record (not linked to monthly_log, but to individual date)
            const leaveQuery = `
              INSERT INTO leave_records (
                employee_id, leave_date, leave_type, days_taken, status, amount_paid
              ) VALUES ($1, $2, $3, $4, 'approved', $5)
            `;
            await pool.query(leaveQuery, [
              employeeId,
              leaveDate,
              leaveType,
              1.0,
              amount_paid || 0,
            ]);
          }
        }
      }

      await pool.query("COMMIT");

      res.status(201).json({
        message: "Monthly work log created successfully",
        workLogId,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error creating monthly work log:", error);
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
      deletedLeaveIds,
    } = req.body;

    if (!employeeEntries || employeeEntries.length === 0) {
      return res.status(400).json({
        message: "At least one employee entry is required",
      });
    }

    try {
      await pool.query("BEGIN");

      // Check if the work log exists and is not processed
      const checkQuery = `
        SELECT status FROM monthly_work_logs WHERE id = $1
      `;
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Monthly work log not found" });
      }

      if (checkResult.rows[0].status === "Processed") {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot edit processed monthly work log",
        });
      }

      // Update main monthly work log
      const updateQuery = `
        UPDATE monthly_work_logs
        SET log_month = $1, log_year = $2, section = $3,
            context_data = $4, status = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `;

      await pool.query(updateQuery, [
        logMonth,
        logYear,
        section,
        contextData || {},
        status,
        id,
      ]);

      // Delete old entries (cascade will handle activities)
      await pool.query(
        "DELETE FROM monthly_work_log_entries WHERE monthly_log_id = $1",
        [id]
      );

      // Insert updated employee entries and activities
      for (const entry of employeeEntries) {
        const { employeeId, jobType, totalHours, overtimeHours, activities } = entry;

        const entryQuery = `
          INSERT INTO monthly_work_log_entries (
            monthly_log_id, employee_id, job_id, total_hours, overtime_hours
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `;

        const entryResult = await pool.query(entryQuery, [
          id,
          employeeId,
          jobType,
          totalHours,
          overtimeHours || 0,
        ]);

        const entryId = entryResult.rows[0].id;

        if (activities && activities.length > 0) {
          for (const activity of activities) {
            if (activity.isSelected) {
              const activityQuery = `
                INSERT INTO monthly_work_log_activities (
                  monthly_entry_id, pay_code_id, hours_applied,
                  units_produced, rate_used, calculated_amount, is_manually_added
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              `;

              await pool.query(activityQuery, [
                entryId,
                activity.payCodeId,
                activity.hoursApplied || null,
                activity.unitsProduced || null,
                parseFloat(activity.rate),
                parseFloat(activity.calculatedAmount),
                activity.isManuallyAdded || false,
              ]);
            }
          }
        }
      }

      // Delete specified leave records
      if (deletedLeaveIds && Array.isArray(deletedLeaveIds) && deletedLeaveIds.length > 0) {
        for (const leaveId of deletedLeaveIds) {
          await pool.query("DELETE FROM leave_records WHERE id = $1", [leaveId]);
        }
      }

      // Handle leave entries - only insert new ones
      if (leaveEntries && Array.isArray(leaveEntries) && leaveEntries.length > 0) {
        for (const leave of leaveEntries) {
          if (leave.isNew) {
            const { employeeId, leaveDate, leaveType, amount_paid } = leave;

            // Check if leave record already exists
            const existingLeave = await pool.query(
              `SELECT id FROM leave_records WHERE employee_id = $1 AND leave_date = $2`,
              [employeeId, leaveDate]
            );

            if (existingLeave.rows.length === 0) {
              const leaveQuery = `
                INSERT INTO leave_records (
                  employee_id, leave_date, leave_type, days_taken, status, amount_paid
                ) VALUES ($1, $2, $3, $4, 'approved', $5)
              `;
              await pool.query(leaveQuery, [
                employeeId,
                leaveDate,
                leaveType,
                1.0,
                amount_paid || 0,
              ]);
            }
          }
        }
      }

      await pool.query("COMMIT");

      res.json({
        message: "Monthly work log updated successfully",
        workLogId: id,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error updating monthly work log:", error);
      res.status(500).json({
        message: "Error updating monthly work log",
        error: error.message,
      });
    }
  });

  // Delete monthly work log (only if not processed)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      await pool.query("BEGIN");

      // Check if the work log is processed
      const checkQuery = `
        SELECT status FROM monthly_work_logs WHERE id = $1
      `;
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Monthly work log not found" });
      }

      if (checkResult.rows[0].status === "Processed") {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete processed monthly work log",
        });
      }

      // Delete the monthly work log (cascade will handle entries and activities)
      await pool.query("DELETE FROM monthly_work_logs WHERE id = $1", [id]);

      await pool.query("COMMIT");

      res.json({ message: "Monthly work log deleted successfully" });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error deleting monthly work log:", error);
      res.status(500).json({
        message: "Error deleting monthly work log",
        error: error.message,
      });
    }
  });

  // Get leave records for a specific month (for displaying in the monthly form)
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
        FROM leave_records lr
        LEFT JOIN staffs s ON lr.employee_id = s.id
        WHERE EXTRACT(MONTH FROM lr.leave_date) = $1
          AND EXTRACT(YEAR FROM lr.leave_date) = $2
      `;

      const values = [parseInt(month), parseInt(year)];

      // If section is provided, filter by employees whose job includes this section
      if (section) {
        query += ` AND s.job::jsonb ? $3`;
        values.push(section);
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
      console.error("Error fetching leave records:", error);
      res.status(500).json({
        message: "Error fetching leave records",
        error: error.message,
      });
    }
  });

  return router;
}
