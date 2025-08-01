// src/routes/payroll/leave-management.js
import { Router } from "express";

// --- Helper Functions for Leave Calculation ---

/**
 * Calculates years of service from the join date to now.
 * @param {Date} dateJoined - The date the employee joined.
 * @returns {number} The total years of service.
 */
const calculateYearsOfService = (dateJoined) => {
  if (!dateJoined) return 0;
  const now = new Date();
  const joinDate = new Date(dateJoined);
  let years = now.getFullYear() - joinDate.getFullYear();
  const monthDiff = now.getMonth() - joinDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getDate() < joinDate.getDate())
  ) {
    years--;
  }
  return years;
};

/**
 * Calculates leave allocation based on years of service.
 * These values are based on standard Malaysian labor law.
 * @param {number} yearsOfService - The employee's years of service.
 * @returns {{cuti_tahunan_total: number, cuti_sakit_total: number}}
 */
const calculateLeaveAllocation = (yearsOfService) => {
  let cuti_tahunan_total;
  let cuti_sakit_total;

  if (yearsOfService < 2) {
    cuti_tahunan_total = 8;
    cuti_sakit_total = 14;
  } else if (yearsOfService < 5) {
    cuti_tahunan_total = 12;
    cuti_sakit_total = 18;
  } else {
    cuti_tahunan_total = 16;
    cuti_sakit_total = 22;
  }

  return { cuti_tahunan_total, cuti_sakit_total };
};

export default function (pool) {
  const router = Router();

  /**
   * GET /api/leave-management/balances/batch?employeeIds=EMP1,EMP2&year=2024
   * Gets or creates leave balances for multiple employees for a given year.
   */
  router.get("/balances/batch", async (req, res) => {
    const { employeeIds, year } = req.query;

    if (!employeeIds || !year) {
      return res.status(400).json({ 
        message: "employeeIds and year query parameters are required" 
      });
    }

    try {
      const employeeIdList = employeeIds.split(',').filter(id => id.trim());
      if (employeeIdList.length === 0) {
        return res.status(400).json({ 
          message: "At least one employee ID is required" 
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const result = {};

        // Process each employee
        for (const employeeId of employeeIdList) {
          let balanceResult = await client.query(
            `SELECT * FROM employee_leave_balances WHERE employee_id = $1 AND year = $2`,
            [employeeId, parseInt(year)]
          );

          if (balanceResult.rows.length === 0) {
            // If no balance record exists, create one
            const staffResult = await client.query(
              `SELECT date_joined FROM staffs WHERE id = $1`,
              [employeeId]
            );

            if (staffResult.rows.length === 0) {
              // Skip employees that don't exist
              continue;
            }

            const yearsOfService = calculateYearsOfService(
              staffResult.rows[0].date_joined
            );
            const { cuti_tahunan_total, cuti_sakit_total } =
              calculateLeaveAllocation(yearsOfService);

            const insertQuery = `
              INSERT INTO employee_leave_balances (employee_id, year, cuti_tahunan_total, cuti_sakit_total)
              VALUES ($1, $2, $3, $4)
              RETURNING *;
            `;
            balanceResult = await client.query(insertQuery, [
              employeeId,
              parseInt(year),
              cuti_tahunan_total,
              cuti_sakit_total,
            ]);
          }

          // Get the sum of taken leave days for the year
          const takenLeaveQuery = `
              SELECT leave_type, SUM(days_taken) as total_taken
              FROM leave_records
              WHERE employee_id = $1 AND EXTRACT(YEAR FROM leave_date) = $2 AND status = 'approved'
              GROUP BY leave_type;
          `;
          const takenLeaveResult = await client.query(takenLeaveQuery, [
            employeeId,
            parseInt(year),
          ]);

          const takenLeave = takenLeaveResult.rows.reduce((acc, row) => {
            acc[row.leave_type] = parseFloat(row.total_taken);
            return acc;
          }, {});

          result[employeeId] = {
            balance: balanceResult.rows[0],
            taken: takenLeave,
          };
        }

        await client.query("COMMIT");
        res.json(result);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error fetching batch leave balances:", error);
      res.status(500).json({
        message: "Error fetching batch leave balances",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/leave-management/balances/:employeeId/:year
   * Gets or creates leave balances for an employee for a given year.
   */
  router.get("/balances/:employeeId/:year", async (req, res) => {
    const { employeeId, year } = req.params;

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        let balanceResult = await client.query(
          `SELECT * FROM employee_leave_balances WHERE employee_id = $1 AND year = $2`,
          [employeeId, parseInt(year)]
        );

        if (balanceResult.rows.length === 0) {
          // If no balance record exists, create one
          const staffResult = await client.query(
            `SELECT date_joined FROM staffs WHERE id = $1`,
            [employeeId]
          );

          if (staffResult.rows.length === 0) {
            return res.status(404).json({ message: "Employee not found." });
          }

          const yearsOfService = calculateYearsOfService(
            staffResult.rows[0].date_joined
          );
          const { cuti_tahunan_total, cuti_sakit_total } =
            calculateLeaveAllocation(yearsOfService);

          const insertQuery = `
            INSERT INTO employee_leave_balances (employee_id, year, cuti_tahunan_total, cuti_sakit_total)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
          `;
          balanceResult = await client.query(insertQuery, [
            employeeId,
            parseInt(year),
            cuti_tahunan_total,
            cuti_sakit_total,
          ]);
        }

        // Now, get the sum of taken leave days for the year
        const takenLeaveQuery = `
            SELECT leave_type, SUM(days_taken) as total_taken
            FROM leave_records
            WHERE employee_id = $1 AND EXTRACT(YEAR FROM leave_date) = $2 AND status = 'approved'
            GROUP BY leave_type;
        `;
        const takenLeaveResult = await client.query(takenLeaveQuery, [
          employeeId,
          parseInt(year),
        ]);

        const takenLeave = takenLeaveResult.rows.reduce((acc, row) => {
          acc[row.leave_type] = parseFloat(row.total_taken);
          return acc;
        }, {});

        await client.query("COMMIT");
        res.json({
          balance: balanceResult.rows[0],
          taken: takenLeave,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error fetching leave balances:", error);
      res.status(500).json({
        message: "Error fetching leave balances",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/leave-management/records/:employeeId
   * Gets all leave records for an employee for a given year.
   */
  router.get("/records/:employeeId/:year", async (req, res) => {
    const { employeeId, year } = req.params;
    try {
      const query = `
        SELECT * FROM leave_records 
        WHERE employee_id = $1 AND EXTRACT(YEAR FROM leave_date) = $2
        ORDER BY leave_date DESC
      `;
      const result = await pool.query(query, [employeeId, parseInt(year)]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching leave records:", error);
      res.status(500).json({
        message: "Error fetching leave records",
        error: error.message,
      });
    }
  });

  /**
   * POST /api/leave-management/records
   * Creates a new leave record.
   */
  router.post("/records", async (req, res) => {
    const {
      employee_id,
      leave_date,
      leave_type,
      work_log_id,
      days_taken,
      amount_paid,
      status,
      notes,
      created_by,
    } = req.body;

    try {
      const query = `
        INSERT INTO leave_records (
          employee_id, leave_date, leave_type, work_log_id, days_taken, 
          amount_paid, status, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      const result = await pool.query(query, [
        employee_id,
        leave_date,
        leave_type,
        work_log_id,
        days_taken,
        amount_paid,
        status,
        notes,
        created_by,
      ]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating leave record:", error);
      res.status(500).json({
        message: "Error creating leave record",
        error: error.message,
      });
    }
  });

  /**
   * PUT /api/leave-management/records/:id
   * Updates an existing leave record.
   */
  router.put("/records/:id", async (req, res) => {
    const { id } = req.params;
    const {
      leave_date,
      leave_type,
      days_taken,
      amount_paid,
      status,
      notes,
    } = req.body;

    try {
      const query = `
        UPDATE leave_records
        SET leave_date = $1, leave_type = $2, days_taken = $3, amount_paid = $4,
            status = $5, notes = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING *;
      `;
      const result = await pool.query(query, [
        leave_date,
        leave_type,
        days_taken,
        amount_paid,
        status,
        notes,
        id,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Leave record not found." });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating leave record:", error);
      res.status(500).json({
        message: "Error updating leave record",
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/leave-management/records/:id
   * Deletes a leave record.
   */
  router.delete("/records/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "DELETE FROM leave_records WHERE id = $1 RETURNING *",
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Leave record not found." });
      }
      res.status(200).json({ message: "Leave record deleted successfully." });
    } catch (error) {
      console.error("Error deleting leave record:", error);
      res.status(500).json({
        message: "Error deleting leave record",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/leave-management/summary/:employeeId/:year/:month
   * Get monthly leave summary for an employee.
   */
  router.get("/summary/:employeeId/:year/:month", async (req, res) => {
    const { employeeId, year, month } = req.params;
    try {
      const query = `
        SELECT 
          to_char(leave_date, 'YYYY-MM-DD') as date,
          leave_type,
          days_taken,
          amount_paid
        FROM leave_records
        WHERE employee_id = $1 
          AND EXTRACT(YEAR FROM leave_date) = $2
          AND EXTRACT(MONTH FROM leave_date) = $3
          AND status = 'approved'
        ORDER BY leave_date ASC;
      `;
      const result = await pool.query(query, [
        employeeId,
        parseInt(year),
        parseInt(month),
      ]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching monthly leave summary:", error);
      res.status(500).json({
        message: "Error fetching monthly leave summary",
        error: error.message,
      });
    }
  });

  return router;
}