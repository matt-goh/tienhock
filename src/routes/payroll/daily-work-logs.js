// src/routes/payroll/daily-work-logs.js
import { Router } from "express";

// Helper function to get overtime threshold based on day of week
// Saturday (day 6) has 5-hour threshold, other days have 8-hour threshold
function getOvertimeThreshold(logDate) {
  if (!logDate) return 8;
  const date = new Date(logDate);
  const dayOfWeek = date.getDay();
  // Saturday = 6, use 5-hour threshold; other days use 8-hour threshold
  return dayOfWeek === 6 ? 5 : 8;
}

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
      FROM daily_work_logs dwl
      LEFT JOIN daily_work_log_entries dwle ON dwl.id = dwle.work_log_id
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

      // Get total count for pagination
      const countQuery = `
      SELECT COUNT(DISTINCT dwl.id) as total
      FROM daily_work_logs dwl
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
      console.error("Error fetching daily work logs:", error);
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
      // Get main work log
      const workLogQuery = `
      SELECT dwl.*
      FROM daily_work_logs dwl
      WHERE dwl.id = $1
    `;
      const workLogResult = await pool.query(workLogQuery, [id]);

      if (workLogResult.rows.length === 0) {
        return res.status(404).json({ message: "Work log not found" });
      }

      // Get leave records for this work log
      const leaveRecordsQuery = `
      SELECT 
        lr.*,
        CAST(lr.amount_paid AS NUMERIC(10, 2)) as amount_paid,
        s.name as employee_name
      FROM leave_records lr
      LEFT JOIN staffs s ON lr.employee_id = s.id
      WHERE lr.work_log_id = $1
      ORDER BY s.name
    `;
      const leaveRecordsResult = await pool.query(leaveRecordsQuery, [id]);

      // Get employee entries with job information
      const entriesQuery = `
      SELECT 
        dwle.*,
        CAST(dwle.total_hours AS NUMERIC(10, 2)) as total_hours,
        s.name as employee_name,
        j.name as job_name,
        fs.name as following_salesman_name
      FROM daily_work_log_entries dwle
      LEFT JOIN staffs s ON dwle.employee_id = s.id
      LEFT JOIN jobs j ON dwle.job_id = j.id
      LEFT JOIN staffs fs ON dwle.following_salesman_id = fs.id
      WHERE dwle.work_log_id = $1
    `;
      const entriesResult = await pool.query(entriesQuery, [id]);

      // Get activities for each entry
      const entriesWithActivities = await Promise.all(
        entriesResult.rows.map(async (entry) => {
          const activitiesQuery = `
          SELECT 
            dwla.*,
            CAST(dwla.hours_applied AS NUMERIC(10, 2)) as hours_applied,
            CAST(dwla.units_produced AS NUMERIC(10, 2)) as units_produced,
            CAST(dwla.rate_used AS NUMERIC(10, 2)) as rate_used,
            CAST(dwla.calculated_amount AS NUMERIC(10, 2)) as calculated_amount,
            pc.description,
            pc.pay_type,
            pc.rate_unit
          FROM daily_work_log_activities dwla
          LEFT JOIN pay_codes pc ON dwla.pay_code_id = pc.id
          WHERE dwla.log_entry_id = $1
        `;
          const activitiesResult = await pool.query(activitiesQuery, [
            entry.id,
          ]);

          return {
            ...entry,
            total_hours: parseFloat(entry.total_hours),
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

      // Create a set of employee IDs who have leave records
      const leaveEmployeeIds = new Set(leaveRecordsResult.rows.map(record => record.employee_id));

      // Separate regular entries from leave entries by checking if employee has a leave record
      const regularEntries = entriesWithActivities.filter(entry => !leaveEmployeeIds.has(entry.employee_id));
      const leaveEntries = entriesWithActivities.filter(entry => leaveEmployeeIds.has(entry.employee_id));

      // Merge leave activities back into leave records
      const leaveRecordsWithActivities = leaveRecordsResult.rows.map((record) => {
        const leaveEntry = leaveEntries.find(entry => entry.employee_id === record.employee_id);
        return {
          ...record,
          amount_paid: parseFloat(record.amount_paid),
          activities: leaveEntry ? leaveEntry.activities : [],
        };
      });

      res.json({
        ...workLogResult.rows[0],
        employeeEntries: regularEntries,
        leaveRecords: leaveRecordsWithActivities,
      });
    } catch (error) {
      console.error("Error fetching work log details:", error);
      res.status(500).json({
        message: "Error fetching work log details",
        error: error.message,
      });
    }
  });

  // Update existing work log status
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
      leaveEntries, // New field for leave data
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

      // Check if the work log exists and is not processed
      const checkQuery = `
      SELECT status FROM daily_work_logs WHERE id = $1
    `;
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Work log not found" });
      }

      if (checkResult.rows[0].status === "Processed") {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot edit processed work log",
        });
      }

      // Update main work log
      const updateQuery = `
        UPDATE daily_work_logs
        SET log_date = $1, shift = $2, day_type = $3, section = $4, 
            context_data = $5, status = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
      `;

      await pool.query(updateQuery, [
        logDate,
        shift,
        dayType,
        section,
        contextData || {},
        status,
        id,
      ]);

      // Clear out old leave records and work entries associated with this work log
      await pool.query("DELETE FROM leave_records WHERE work_log_id = $1", [
        id,
      ]);
      await pool.query(
        "DELETE FROM daily_work_log_entries WHERE work_log_id = $1",
        [id]
      );

      // Insert updated employee entries and activities
      if (employeeEntries && employeeEntries.length > 0) {
        for (const entry of employeeEntries) {
          const { employeeId, jobType, hours, activities } = entry;

          // Insert employee entry
          const entryQuery = `
          INSERT INTO daily_work_log_entries (
            work_log_id, employee_id, job_id, total_hours,
            following_salesman_id, muat_mee_bags, muat_bihun_bags, location_type, is_doubled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `;

          const entryResult = await pool.query(entryQuery, [
            id,
            employeeId,
            jobType,
            hours,
            entry.followingSalesmanId || null,
            entry.muatMeeBags || 0,
            entry.muatBihunBags || 0,
            entry.locationType || "Local",
            entry.isDoubled || false,
          ]);

          const entryId = entryResult.rows[0].id;

          // Insert activities for this employee entry
          if (activities && activities.length > 0) {
            // Get overtime threshold based on day (Saturday = 5 hours, others = 8 hours)
            const overtimeThreshold = getOvertimeThreshold(logDate);

            for (const activity of activities) {
              if (activity.isSelected) {
                let hoursApplied = null;
                if (activity.rateUnit === "Hour") {
                  if (activity.payType === "Overtime") {
                    hoursApplied = Math.max(0, hours - overtimeThreshold);
                  } else {
                    hoursApplied = hours;
                  }
                }

                const activityQuery = `
                INSERT INTO daily_work_log_activities (
                  log_entry_id, pay_code_id, hours_applied,
                  units_produced, rate_used, calculated_amount,
                  is_manually_added, foc_units
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `;

                await pool.query(activityQuery, [
                  entryId,
                  activity.payCodeId,
                  hoursApplied,
                  activity.unitsProduced
                    ? parseFloat(activity.unitsProduced)
                    : null,
                  parseFloat(activity.rate),
                  parseFloat(activity.calculatedAmount),
                  false,
                  activity.unitsFOC ? parseFloat(activity.unitsFOC) : null,
                ]);
              }
            }
          }
        }
      }

      // Insert updated leave records if any
      if (
        leaveEntries &&
        Array.isArray(leaveEntries) &&
        leaveEntries.length > 0
      ) {
        for (const leave of leaveEntries) {
          const { employeeId, leaveType, amount_paid, activities } = leave;

          // Get employee's primary job for the leave entry
          const employeeJobQuery = `
            SELECT job FROM staffs WHERE id = $1
          `;
          const employeeJobResult = await pool.query(employeeJobQuery, [employeeId]);
          const employeeJobs = employeeJobResult.rows[0]?.job || [];
          const primaryJob = employeeJobs.length > 0 ? employeeJobs[0] : null;

          if (!primaryJob) {
            throw new Error(`Employee ${employeeId} has no job assigned`);
          }

          // Insert leave record
          const leaveQuery = `
            INSERT INTO leave_records (
              employee_id, leave_date, leave_type, work_log_id, days_taken, status, amount_paid
            ) VALUES ($1, $2, $3, $4, $5, 'approved', $6)
          `;
          await pool.query(leaveQuery, [
            employeeId,
            logDate,
            leaveType,
            id, // Use the existing work log ID from params
            1.0,
            amount_paid || 0,
          ]);

          // Create a leave entry in daily_work_log_entries for activities
          const leaveEntryQuery = `
            INSERT INTO daily_work_log_entries (
              work_log_id, employee_id, job_id, total_hours
            ) VALUES ($1, $2, $3, $4)
            RETURNING id
          `;
          const leaveEntryResult = await pool.query(leaveEntryQuery, [
            id,
            employeeId,
            primaryJob, // Use employee's primary job
            8, // Standard 8 hours for leave
          ]);

          const leaveEntryId = leaveEntryResult.rows[0].id;

          // Insert leave activities
          if (activities && activities.length > 0) {
            for (const activity of activities) {
              if (activity.isSelected) {
                const activityQuery = `
                  INSERT INTO daily_work_log_activities (
                    log_entry_id, pay_code_id, hours_applied,
                    units_produced, rate_used, calculated_amount,
                    is_manually_added, foc_units
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `;

                await pool.query(activityQuery, [
                  leaveEntryId,
                  activity.payCodeId,
                  activity.hoursApplied,
                  activity.unitsProduced || null,
                  parseFloat(activity.rate),
                  parseFloat(activity.calculatedAmount),
                  false,
                  activity.unitsFOC ? parseFloat(activity.unitsFOC) : null,
                ]);
              }
            }
          }
        }
      }

      await pool.query("COMMIT");

      res.json({
        message: "Work log updated successfully",
        workLogId: id,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error updating daily work log:", error);
      res.status(500).json({
        message: "Error updating daily work log",
        error: error.message,
      });
    }
  });

  // Delete work log (only if not processed)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      await pool.query("BEGIN");

      // Check if the work log is processed
      const checkQuery = `
      SELECT status FROM daily_work_logs WHERE id = $1
    `;
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Work log not found" });
      }

      if (checkResult.rows[0].status === "Processed") {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete processed work log",
        });
      }

      // Delete leave records first (foreign key constraint)
      await pool.query("DELETE FROM leave_records WHERE work_log_id = $1", [id]);

      // Delete daily work log activities
      await pool.query(`
        DELETE FROM daily_work_log_activities 
        WHERE log_entry_id IN (
          SELECT id FROM daily_work_log_entries WHERE work_log_id = $1
        )
      `, [id]);

      // Delete daily work log entries
      await pool.query("DELETE FROM daily_work_log_entries WHERE work_log_id = $1", [id]);

      // Finally delete the work log
      const deleteQuery = `
      DELETE FROM daily_work_logs
      WHERE id = $1
      RETURNING id
    `;

      await pool.query(deleteQuery, [id]);
      await pool.query("COMMIT");

      res.json({ message: "Work log deleted successfully" });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error deleting work log:", error);
      res.status(500).json({
        message: "Error deleting work log",
        error: error.message,
      });
    }
  });

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
      leaveEntries, // New field for leave data
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

      // Insert main work log
      const workLogQuery = `
        INSERT INTO daily_work_logs (
          log_date, shift, day_type, section, context_data, status
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;

      const workLogResult = await pool.query(workLogQuery, [
        logDate,
        shift,
        dayType,
        section,
        contextData || {},
        status,
      ]);

      const workLogId = workLogResult.rows[0].id;

      // Insert employee entries and activities for working employees
      if (employeeEntries && employeeEntries.length > 0) {
        for (const entry of employeeEntries) {
          const { employeeId, jobType, hours, activities } = entry;

          // Insert employee entry
          const entryQuery = `
          INSERT INTO daily_work_log_entries (
            work_log_id, employee_id, job_id, total_hours,
            following_salesman_id, muat_mee_bags, muat_bihun_bags, location_type, is_doubled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `;

          const entryResult = await pool.query(entryQuery, [
            workLogId,
            employeeId,
            jobType,
            hours,
            entry.followingSalesmanId || null,
            entry.muatMeeBags || 0,
            entry.muatBihunBags || 0,
            entry.locationType || "Local",
            entry.isDoubled || false,
          ]);

          const entryId = entryResult.rows[0].id;

          // Insert activities for this employee entry
          if (activities && activities.length > 0) {
            // Get overtime threshold based on day (Saturday = 5 hours, others = 8 hours)
            const overtimeThreshold = getOvertimeThreshold(logDate);

            for (const activity of activities) {
              if (activity.isSelected) {
                let hoursApplied = null;
                if (activity.rateUnit === "Hour") {
                  if (activity.payType === "Overtime") {
                    hoursApplied = Math.max(0, hours - overtimeThreshold);
                  } else {
                    hoursApplied = hours;
                  }
                }

                const activityQuery = `
                INSERT INTO daily_work_log_activities (
                  log_entry_id, pay_code_id, hours_applied,
                  units_produced, rate_used, calculated_amount,
                  is_manually_added, foc_units
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `;

                await pool.query(activityQuery, [
                  entryId,
                  activity.payCodeId,
                  hoursApplied,
                  activity.unitsProduced
                    ? parseFloat(activity.unitsProduced)
                    : null,
                  parseFloat(activity.rate),
                  parseFloat(activity.calculatedAmount),
                  false,
                  activity.unitsFOC ? parseFloat(activity.unitsFOC) : null,
                ]);
              }
            }
          }
        }
      }

      // Insert leave records if any
      if (
        leaveEntries &&
        Array.isArray(leaveEntries) &&
        leaveEntries.length > 0
      ) {
        for (const leave of leaveEntries) {
          const { employeeId, leaveType, amount_paid, activities } = leave;

          // Get employee's primary job for the leave entry
          const employeeJobQuery = `
            SELECT job FROM staffs WHERE id = $1
          `;
          const employeeJobResult = await pool.query(employeeJobQuery, [employeeId]);
          const employeeJobs = employeeJobResult.rows[0]?.job || [];
          const primaryJob = employeeJobs.length > 0 ? employeeJobs[0] : null;

          if (!primaryJob) {
            throw new Error(`Employee ${employeeId} has no job assigned`);
          }

          // Insert leave record
          const leaveQuery = `
            INSERT INTO leave_records (
              employee_id, leave_date, leave_type, work_log_id, days_taken, status, amount_paid
            ) VALUES ($1, $2, $3, $4, $5, 'approved', $6)
          `;
          await pool.query(leaveQuery, [
            employeeId,
            logDate,
            leaveType,
            workLogId,
            1.0, // Assuming full day leave for now
            amount_paid || 0,
          ]);

          // Create a leave entry in daily_work_log_entries for activities
          const leaveEntryQuery = `
            INSERT INTO daily_work_log_entries (
              work_log_id, employee_id, job_id, total_hours
            ) VALUES ($1, $2, $3, $4)
            RETURNING id
          `;
          const leaveEntryResult = await pool.query(leaveEntryQuery, [
            workLogId,
            employeeId,
            primaryJob, // Use employee's primary job
            8, // Standard 8 hours for leave
          ]);

          const leaveEntryId = leaveEntryResult.rows[0].id;

          // Insert leave activities
          if (activities && activities.length > 0) {
            for (const activity of activities) {
              if (activity.isSelected) {
                const activityQuery = `
                  INSERT INTO daily_work_log_activities (
                    log_entry_id, pay_code_id, hours_applied,
                    units_produced, rate_used, calculated_amount,
                    is_manually_added, foc_units
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `;

                await pool.query(activityQuery, [
                  leaveEntryId,
                  activity.payCodeId,
                  activity.hoursApplied,
                  activity.unitsProduced || null,
                  parseFloat(activity.rate),
                  parseFloat(activity.calculatedAmount),
                  false,
                  activity.unitsFOC ? parseFloat(activity.unitsFOC) : null,
                ]);
              }
            }
          }
        }
      }

      await pool.query("COMMIT");

      res.status(201).json({
        message: `Work log submitted successfully`,
        workLogId,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error creating daily work log:", error);
      res.status(500).json({
        message: "Error creating daily work log",
        error: error.message,
      });
    }
  });

  return router;
}
