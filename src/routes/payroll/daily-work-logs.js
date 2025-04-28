// src/routes/payroll/daily-work-logs.js
import { Router } from "express";

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

      // Get employee entries with job information
      const entriesQuery = `
      SELECT 
        dwle.*,
        CAST(dwle.total_hours AS NUMERIC(10, 2)) as total_hours,
        s.name as employee_name,
        j.name as job_name
      FROM daily_work_log_entries dwle
      LEFT JOIN staffs s ON dwle.employee_id = s.id
      LEFT JOIN jobs j ON dwle.job_id = j.id
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
              rate_used: parseFloat(activity.rate_used),
              calculated_amount: parseFloat(activity.calculated_amount),
            })),
          };
        })
      );

      res.json({
        ...workLogResult.rows[0],
        employeeEntries: entriesWithActivities,
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

      // Delete existing entries (cascade will delete activities)
      await pool.query(
        "DELETE FROM daily_work_log_entries WHERE work_log_id = $1",
        [id]
      );

      // Insert updated employee entries and activities
      for (const entry of employeeEntries) {
        const { employeeId, jobType, hours, activities } = entry;

        // Insert employee entry
        const entryQuery = `
          INSERT INTO daily_work_log_entries (
            work_log_id, employee_id, job_id, total_hours
          ) VALUES ($1, $2, $3, $4)
          RETURNING id
        `;

        const entryResult = await pool.query(entryQuery, [
          id,
          employeeId,
          jobType,
          hours,
        ]);

        const entryId = entryResult.rows[0].id;

        // Insert activities for this employee entry
        if (activities && activities.length > 0) {
          for (const activity of activities) {
            if (activity.isSelected) {
              let hoursApplied = null;

              if (activity.rateUnit === "Hour") {
                // For overtime activities, only apply to hours beyond 8
                if (activity.payType === "Overtime") {
                  hoursApplied = Math.max(0, hours - 8);
                } else {
                  hoursApplied = hours;
                }
              }

              const activityQuery = `
                INSERT INTO daily_work_log_activities (
                  log_entry_id, pay_code_id, hours_applied, 
                  units_produced, rate_used, calculated_amount,
                  is_manually_added
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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
              ]);
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
      // Check if the work log is processed
      const checkQuery = `
      SELECT status FROM daily_work_logs WHERE id = $1
    `;
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Work log not found" });
      }

      if (checkResult.rows[0].status === "Processed") {
        return res.status(400).json({
          message: "Cannot delete processed work log",
        });
      }

      // Delete the work log (cascade will delete related entries)
      const deleteQuery = `
      DELETE FROM daily_work_logs
      WHERE id = $1
      RETURNING id
    `;

      await pool.query(deleteQuery, [id]);
      res.json({ message: "Work log deleted successfully" });
    } catch (error) {
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
    } = req.body;

    if (!employeeEntries || employeeEntries.length === 0) {
      return res.status(400).json({
        message: "At least one employee entry is required",
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

      // Insert employee entries and activities
      for (const entry of employeeEntries) {
        const { employeeId, jobType, hours, activities } = entry;

        // Insert employee entry
        const entryQuery = `
          INSERT INTO daily_work_log_entries (
            work_log_id, employee_id, job_id, total_hours
          ) VALUES ($1, $2, $3, $4)
          RETURNING id
        `;

        const entryResult = await pool.query(entryQuery, [
          workLogId,
          employeeId,
          jobType,
          hours,
        ]);

        const entryId = entryResult.rows[0].id;

        // Insert activities for this employee entry
        if (activities && activities.length > 0) {
          for (const activity of activities) {
            if (activity.isSelected) {
              // Determine hours_applied based on the rate unit and activity type
              let hoursApplied = null;

              // Only set hours_applied for Hour-based activities
              if (activity.rateUnit === "Hour") {
                // For overtime activities, only apply to hours beyond 8
                if (activity.payType === "Overtime") {
                  hoursApplied = Math.max(0, hours - 8);
                } else {
                  hoursApplied = hours;
                }
              }

              // Trust the calculated amount from the frontend
              const activityQuery = `
                INSERT INTO daily_work_log_activities (
                  log_entry_id, pay_code_id, hours_applied, 
                  units_produced, rate_used, calculated_amount,
                  is_manually_added
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              `;

              await pool.query(activityQuery, [
                entryId,
                activity.payCodeId,
                hoursApplied,
                activity.unitsProduced
                  ? parseFloat(activity.unitsProduced)
                  : null,
                parseFloat(activity.rate),
                parseFloat(activity.calculatedAmount), // Use frontend calculation
                false,
              ]);
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
