// src/routes/greentarget/monthly-work-logs.js
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
        FROM greentarget.monthly_work_logs mwl
        LEFT JOIN greentarget.monthly_work_log_entries mwle ON mwl.id = mwle.monthly_log_id
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
        FROM greentarget.monthly_work_logs mwl
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
      console.error("Error fetching GT monthly work logs:", error);
      res.status(500).json({
        message: "Error fetching GT monthly work logs",
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
        FROM greentarget.monthly_work_logs mwl
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
        FROM greentarget.monthly_work_log_entries mwle
        LEFT JOIN public.staffs s ON mwle.employee_id = s.id
        LEFT JOIN public.jobs j ON mwle.job_id = j.id
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
              CAST(mwla.rate_used AS NUMERIC(10, 2)) as rate_used,
              CAST(mwla.calculated_amount AS NUMERIC(10, 2)) as calculated_amount,
              pc.description,
              pc.pay_type,
              pc.rate_unit
            FROM greentarget.monthly_work_log_activities mwla
            LEFT JOIN public.pay_codes pc ON mwla.pay_code_id = pc.id
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
              rate_used: parseFloat(activity.rate_used),
              calculated_amount: parseFloat(activity.calculated_amount),
            })),
          };
        })
      );

      res.json({
        ...workLog,
        employeeEntries: entriesWithActivities,
      });
    } catch (error) {
      console.error("Error fetching GT monthly work log details:", error);
      res.status(500).json({
        message: "Error fetching GT monthly work log details",
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
    } = req.body;

    if (!employeeEntries || employeeEntries.length === 0) {
      return res.status(400).json({
        message: "At least one employee entry is required",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check for duplicate (same month/year/section)
      const duplicateCheck = `
        SELECT id FROM greentarget.monthly_work_logs
        WHERE log_month = $1 AND log_year = $2 AND section = $3
      `;
      const duplicateResult = await client.query(duplicateCheck, [
        logMonth,
        logYear,
        section,
      ]);

      if (duplicateResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `A monthly log for ${section} in ${logMonth}/${logYear} already exists`,
          existingId: duplicateResult.rows[0].id,
        });
      }

      // Insert main monthly work log
      const workLogQuery = `
        INSERT INTO greentarget.monthly_work_logs (
          log_month, log_year, section, context_data, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;

      const workLogResult = await client.query(workLogQuery, [
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
          INSERT INTO greentarget.monthly_work_log_entries (
            monthly_log_id, employee_id, job_id, total_hours, overtime_hours
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `;

        const entryResult = await client.query(entryQuery, [
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
                INSERT INTO greentarget.monthly_work_log_activities (
                  monthly_entry_id, pay_code_id, hours_applied,
                  rate_used, calculated_amount, is_manually_added
                ) VALUES ($1, $2, $3, $4, $5, $6)
              `;

              await client.query(activityQuery, [
                entryId,
                activity.payCodeId,
                activity.hoursApplied || null,
                parseFloat(activity.rate),
                parseFloat(activity.calculatedAmount),
                activity.isManuallyAdded || false,
              ]);
            }
          }
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Monthly work log created successfully",
        workLogId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating GT monthly work log:", error);
      res.status(500).json({
        message: "Error creating GT monthly work log",
        error: error.message,
      });
    } finally {
      client.release();
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
    } = req.body;

    if (!employeeEntries || employeeEntries.length === 0) {
      return res.status(400).json({
        message: "At least one employee entry is required",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if the work log exists and is not processed
      const checkQuery = `
        SELECT status FROM greentarget.monthly_work_logs WHERE id = $1
      `;
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Monthly work log not found" });
      }

      if (checkResult.rows[0].status === "Processed") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot edit processed monthly work log",
        });
      }

      // Update main monthly work log
      const updateQuery = `
        UPDATE greentarget.monthly_work_logs
        SET log_month = $1, log_year = $2, section = $3,
            context_data = $4, status = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `;

      await client.query(updateQuery, [
        logMonth,
        logYear,
        section,
        contextData || {},
        status,
        id,
      ]);

      // Delete old entries (cascade will handle activities)
      await client.query(
        "DELETE FROM greentarget.monthly_work_log_entries WHERE monthly_log_id = $1",
        [id]
      );

      // Insert updated employee entries and activities
      for (const entry of employeeEntries) {
        const { employeeId, jobType, totalHours, overtimeHours, activities } = entry;

        const entryQuery = `
          INSERT INTO greentarget.monthly_work_log_entries (
            monthly_log_id, employee_id, job_id, total_hours, overtime_hours
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `;

        const entryResult = await client.query(entryQuery, [
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
                INSERT INTO greentarget.monthly_work_log_activities (
                  monthly_entry_id, pay_code_id, hours_applied,
                  rate_used, calculated_amount, is_manually_added
                ) VALUES ($1, $2, $3, $4, $5, $6)
              `;

              await client.query(activityQuery, [
                entryId,
                activity.payCodeId,
                activity.hoursApplied || null,
                parseFloat(activity.rate),
                parseFloat(activity.calculatedAmount),
                activity.isManuallyAdded || false,
              ]);
            }
          }
        }
      }

      await client.query("COMMIT");

      res.json({
        message: "Monthly work log updated successfully",
        workLogId: id,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating GT monthly work log:", error);
      res.status(500).json({
        message: "Error updating GT monthly work log",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Delete monthly work log (only if not processed)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if the work log is processed
      const checkQuery = `
        SELECT status FROM greentarget.monthly_work_logs WHERE id = $1
      `;
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Monthly work log not found" });
      }

      if (checkResult.rows[0].status === "Processed") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete processed monthly work log",
        });
      }

      // Delete the monthly work log (cascade will handle entries and activities)
      await client.query("DELETE FROM greentarget.monthly_work_logs WHERE id = $1", [id]);

      await client.query("COMMIT");

      res.json({ message: "Monthly work log deleted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting GT monthly work log:", error);
      res.status(500).json({
        message: "Error deleting GT monthly work log",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
