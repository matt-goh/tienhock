// src/routes/payroll/daily-work-logs.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Create a new daily work log
  router.post("/", async (req, res) => {
    const {
      logDate,
      shift,
      dayType,
      jobId,
      foremanId,
      contextData,
      status,
      employeeEntries,
    } = req.body;

    // Validation
    if (!logDate || !shift || !dayType || !jobId) {
      return res.status(400).json({
        message:
          "Missing required fields: logDate, shift, dayType, and jobId are required",
      });
    }

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
          log_date, shift, job_id, foreman_id, day_type, 
          context_data, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;

      const workLogResult = await pool.query(workLogQuery, [
        logDate,
        shift,
        jobId,
        foremanId || null,
        dayType,
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
            work_log_id, employee_id, total_hours
          ) VALUES ($1, $2, $3)
          RETURNING id
        `;

        const entryResult = await pool.query(entryQuery, [
          workLogId,
          employeeId,
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
                activity.unitsProduced || null,
                activity.rate,
                activity.calculatedAmount,
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
