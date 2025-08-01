// src/routes/payroll/pinjam-records.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all pinjam records with filtering
  router.get("/", async (req, res) => {
    const {
      year,
      month,
      employee_id,
      pinjam_type,
      page = 1,
      limit = 100,
    } = req.query;

    try {
      let query = `
        SELECT p.*, s.name as employee_name
        FROM pinjam_records p
        LEFT JOIN staffs s ON p.employee_id = s.id
        WHERE 1=1
      `;

      const values = [];
      let paramCount = 1;

      if (year) {
        query += ` AND p.year = $${paramCount}`;
        values.push(parseInt(year));
        paramCount++;
      }

      if (month) {
        query += ` AND p.month = $${paramCount}`;
        values.push(parseInt(month));
        paramCount++;
      }

      if (employee_id) {
        if (Array.isArray(employee_id)) {
          if (employee_id.length > 0) {
            const placeholders = employee_id.map(
              (_, idx) => `$${paramCount + idx}`
            );
            query += ` AND p.employee_id IN (${placeholders.join(", ")})`;
            values.push(...employee_id);
            paramCount += employee_id.length;
          }
        } else {
          query += ` AND p.employee_id = $${paramCount}`;
          values.push(employee_id);
          paramCount++;
        }
      }

      if (pinjam_type) {
        query += ` AND p.pinjam_type = $${paramCount}`;
        values.push(pinjam_type);
        paramCount++;
      }

      query += ` ORDER BY p.year DESC, p.month DESC, p.employee_id, p.pinjam_type, p.description`;

      // Apply pagination
      const offset = (page - 1) * limit;
      const paginatedQuery = `${query} LIMIT $${paramCount} OFFSET $${
        paramCount + 1
      }`;
      
      const [countResult, dataResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) as total FROM (${query}) as subquery`,
          values
        ),
        pool.query(paginatedQuery, [...values, parseInt(limit), offset]),
      ]);

      res.json({
        records: dataResult.rows.map(row => ({
          ...row,
          amount: parseFloat(row.amount)
        })),
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      });
    } catch (error) {
      console.error("Error fetching pinjam records:", error);
      res.status(500).json({
        message: "Error fetching pinjam records",
        error: error.message,
      });
    }
  });

  // Get consolidated pinjam dashboard data (all data needed for PinjamListPage)
  router.get("/dashboard", async (req, res) => {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        message: "Year and month are required"
      });
    }

    try {
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);

      // Execute all queries in parallel for maximum efficiency
      const [
        pinjamRecordsResult,
        pinjamSummaryResult,
        midMonthPayrollsResult,
        monthlyPayrollsResult
      ] = await Promise.all([
        // 1. Pinjam Records
        pool.query(`
          SELECT p.*, s.name as employee_name
          FROM pinjam_records p
          LEFT JOIN staffs s ON p.employee_id = s.id
          WHERE p.year = $1 AND p.month = $2
          ORDER BY p.year DESC, p.month DESC, p.employee_id, p.pinjam_type, p.description
          LIMIT 1000
        `, [yearInt, monthInt]),

        // 2. Pinjam Summary
        pool.query(`
          SELECT 
            p.employee_id,
            s.name as employee_name,
            p.pinjam_type,
            SUM(p.amount) as total_amount,
            COUNT(*) as record_count,
            STRING_AGG(p.description || ': ' || p.amount::text, ', ' ORDER BY p.description) as details
          FROM pinjam_records p
          LEFT JOIN staffs s ON p.employee_id = s.id
          WHERE p.year = $1 AND p.month = $2
          GROUP BY p.employee_id, s.name, p.pinjam_type
          ORDER BY s.name, p.pinjam_type
        `, [yearInt, monthInt]),

        // 3. Mid-Month Payrolls
        pool.query(`
          SELECT p.*, s.name as employee_name
          FROM mid_month_payrolls p
          LEFT JOIN staffs s ON p.employee_id = s.id
          WHERE p.year = $1 AND p.month = $2
          ORDER BY p.year DESC, p.month DESC, p.employee_id
          LIMIT 1000
        `, [yearInt, monthInt]),

        // 4. Monthly Payrolls with Employee Payrolls
        pool.query(`
          SELECT mp.*, ep.employee_id, s.name as employee_name, ep.net_pay
          FROM monthly_payrolls mp
          LEFT JOIN employee_payrolls ep ON mp.id = ep.monthly_payroll_id
          LEFT JOIN staffs s ON ep.employee_id = s.id
          WHERE mp.year = $1 AND mp.month = $2
          ORDER BY mp.year DESC, mp.month DESC
        `, [yearInt, monthInt])
      ]);

      // Process pinjam summary data
      const pinjamSummary = {};
      pinjamSummaryResult.rows.forEach(row => {
        if (!pinjamSummary[row.employee_id]) {
          pinjamSummary[row.employee_id] = {
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            mid_month: { total_amount: 0, details: [], record_count: 0 },
            monthly: { total_amount: 0, details: [], record_count: 0 }
          };
        }

        const type = row.pinjam_type === 'mid_month' ? 'mid_month' : 'monthly';
        pinjamSummary[row.employee_id][type] = {
          total_amount: parseFloat(row.total_amount),
          details: row.details ? row.details.split(', ') : [],
          record_count: parseInt(row.record_count)
        };
      });

      // Process employee payrolls data
      const employeePayrolls = [];
      monthlyPayrollsResult.rows.forEach(row => {
        if (row.employee_id) {
          employeePayrolls.push({
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            net_pay: parseFloat(row.net_pay || 0)
          });
        }
      });

      // Format response
      res.json({
        pinjamRecords: pinjamRecordsResult.rows.map(row => ({
          ...row,
          amount: parseFloat(row.amount)
        })),
        pinjamSummary: Object.values(pinjamSummary),
        midMonthPayrolls: midMonthPayrollsResult.rows,
        employeePayrolls: employeePayrolls,
        meta: {
          year: yearInt,
          month: monthInt,
          recordCounts: {
            pinjamRecords: pinjamRecordsResult.rows.length,
            pinjamSummary: Object.keys(pinjamSummary).length,
            midMonthPayrolls: midMonthPayrollsResult.rows.length,
            employeePayrolls: employeePayrolls.length
          }
        }
      });
    } catch (error) {
      console.error("Error fetching pinjam dashboard data:", error);
      res.status(500).json({
        message: "Error fetching pinjam dashboard data",
        error: error.message,
      });
    }
  });

  // Get pinjam records summary by employee for a specific month
  router.get("/summary", async (req, res) => {
    const { year, month, employee_ids } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        message: "Year and month are required"
      });
    }

    try {
      let query = `
        SELECT 
          p.employee_id,
          s.name as employee_name,
          p.pinjam_type,
          SUM(p.amount) as total_amount,
          COUNT(*) as record_count,
          STRING_AGG(p.description || ': ' || p.amount::text, ', ' ORDER BY p.description) as details
        FROM pinjam_records p
        LEFT JOIN staffs s ON p.employee_id = s.id
        WHERE p.year = $1 AND p.month = $2
      `;

      const values = [parseInt(year), parseInt(month)];
      let paramCount = 3;

      if (employee_ids) {
        const employeeIdArray = Array.isArray(employee_ids) ? employee_ids : [employee_ids];
        if (employeeIdArray.length > 0) {
          const placeholders = employeeIdArray.map(
            (_, idx) => `$${paramCount + idx}`
          );
          query += ` AND p.employee_id IN (${placeholders.join(", ")})`;
          values.push(...employeeIdArray);
          paramCount += employeeIdArray.length;
        }
      }

      query += `
        GROUP BY p.employee_id, s.name, p.pinjam_type
        ORDER BY s.name, p.pinjam_type
      `;

      const result = await pool.query(query, values);

      // Group by employee
      const summary = {};
      result.rows.forEach(row => {
        if (!summary[row.employee_id]) {
          summary[row.employee_id] = {
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            mid_month: { total_amount: 0, details: [], record_count: 0 },
            monthly: { total_amount: 0, details: [], record_count: 0 }
          };
        }

        const type = row.pinjam_type === 'mid_month' ? 'mid_month' : 'monthly';
        summary[row.employee_id][type] = {
          total_amount: parseFloat(row.total_amount),
          details: row.details.split(', '),
          record_count: parseInt(row.record_count)
        };
      });

      res.json(Object.values(summary));
    } catch (error) {
      console.error("Error fetching pinjam summary:", error);
      res.status(500).json({
        message: "Error fetching pinjam summary",
        error: error.message,
      });
    }
  });

  // Get specific pinjam record
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = `
        SELECT 
          pr.*,
          s.name as employee_name
        FROM pinjam_records pr
        LEFT JOIN staffs s ON pr.employee_id = s.id
        WHERE pr.id = $1
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Pinjam record not found" });
      }

      res.json({
        ...result.rows[0],
        amount: parseFloat(result.rows[0].amount),
      });
    } catch (error) {
      console.error("Error fetching pinjam record:", error);
      res.status(500).json({
        message: "Error fetching pinjam record",
        error: error.message,
      });
    }
  });

  // Create new pinjam record
  router.post("/", async (req, res) => {
    const {
      employee_id,
      year,
      month,
      amount,
      description,
      pinjam_type,
      created_by,
    } = req.body;

    // Validate required fields
    if (
      !employee_id ||
      !year ||
      !month ||
      amount === undefined ||
      !description ||
      !pinjam_type
    ) {
      return res.status(400).json({
        message:
          "employee_id, year, month, amount, description, and pinjam_type are required",
      });
    }

    // Validate pinjam_type
    if (!['mid_month', 'monthly'].includes(pinjam_type)) {
      return res.status(400).json({
        message: "pinjam_type must be either 'mid_month' or 'monthly'",
      });
    }

    try {
      // Create new pinjam record
      const insertQuery = `
        INSERT INTO pinjam_records (
          employee_id, year, month, amount, description, pinjam_type, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const insertResult = await pool.query(insertQuery, [
        employee_id,
        year,
        month,
        amount,
        description,
        pinjam_type,
        created_by || null,
      ]);

      // Get employee name for response
      const employeeQuery = `
        SELECT name FROM staffs WHERE id = $1
      `;
      const employeeResult = await pool.query(employeeQuery, [employee_id]);

      res.status(201).json({
        message: "Pinjam record created successfully",
        record: {
          ...insertResult.rows[0],
          amount: parseFloat(insertResult.rows[0].amount),
          employee_name: employeeResult.rows[0]?.name || null,
        },
      });
    } catch (error) {
      console.error("Error creating pinjam record:", error);
      
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({
          message: "A pinjam record with this employee, date, description, and type already exists",
        });
      }
      
      res.status(500).json({
        message: "Error creating pinjam record",
        error: error.message,
      });
    }
  });

  // Create multiple pinjam records (batch)
  router.post("/batch", async (req, res) => {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        message: "Records array is required and must not be empty",
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const insertedRecords = [];
      const errors = [];

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const {
          employee_id,
          year,
          month,
          amount,
          description,
          pinjam_type,
          created_by,
        } = record;

        // Validate required fields
        if (
          !employee_id ||
          !year ||
          !month ||
          amount === undefined ||
          !description ||
          !pinjam_type
        ) {
          errors.push({
            index: i,
            error: "Missing required fields",
            record
          });
          continue;
        }

        // Validate pinjam_type
        if (!['mid_month', 'monthly'].includes(pinjam_type)) {
          errors.push({
            index: i,
            error: "Invalid pinjam_type",
            record
          });
          continue;
        }

        try {
          // First, try to check if a record with same key exists
          const checkQuery = `
            SELECT id, amount FROM pinjam_records 
            WHERE employee_id = $1 AND year = $2 AND month = $3 
              AND description = $4 AND pinjam_type = $5
          `;
          
          const existingResult = await client.query(checkQuery, [
            employee_id,
            year,
            month,
            description,
            pinjam_type
          ]);

          if (existingResult.rows.length > 0) {
            // Record exists, update by adding amounts
            const existingRecord = existingResult.rows[0];
            const newAmount = parseFloat(existingRecord.amount) + parseFloat(amount);
            
            const updateQuery = `
              UPDATE pinjam_records 
              SET amount = $1, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
              RETURNING *
            `;
            
            const updateResult = await client.query(updateQuery, [newAmount, existingRecord.id]);
            
            insertedRecords.push({
              ...updateResult.rows[0],
              amount: parseFloat(updateResult.rows[0].amount),
              _action: 'updated'
            });
          } else {
            // Record doesn't exist, insert new
            const insertQuery = `
              INSERT INTO pinjam_records (
                employee_id, year, month, amount, description, pinjam_type, created_by
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING *
            `;

            const insertResult = await client.query(insertQuery, [
              employee_id,
              year,
              month,
              amount,
              description,
              pinjam_type,
              created_by || null,
            ]);

            insertedRecords.push({
              ...insertResult.rows[0],
              amount: parseFloat(insertResult.rows[0].amount),
              _action: 'created'
            });
          }
        } catch (insertError) {
          errors.push({
            index: i,
            error: insertError.message,
            record
          });
        }
      }

      if (errors.length > 0 && insertedRecords.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: "Failed to create any pinjam records",
          errors
        });
      }

      await client.query('COMMIT');

      const createdCount = insertedRecords.filter(r => r._action === 'created').length;
      const updatedCount = insertedRecords.filter(r => r._action === 'updated').length;
      
      let message = '';
      if (createdCount > 0 && updatedCount > 0) {
        message = `Successfully created ${createdCount} and updated ${updatedCount} pinjam record(s)`;
      } else if (createdCount > 0) {
        message = `Successfully created ${createdCount} pinjam record(s)`;
      } else if (updatedCount > 0) {
        message = `Successfully updated ${updatedCount} pinjam record(s) by adding amounts`;
      } else {
        message = `Processed ${insertedRecords.length} pinjam record(s)`;
      }

      res.status(201).json({
        message,
        inserted: insertedRecords.map(record => {
          const { _action, ...recordData } = record;
          return recordData;
        }),
        created: createdCount,
        updated: updatedCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error creating batch pinjam records:", error);
      res.status(500).json({
        message: "Error creating batch pinjam records",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Update existing pinjam record
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { amount, description, pinjam_type } = req.body;

    try {
      // Check if record exists
      const checkQuery = `
        SELECT * FROM pinjam_records WHERE id = $1
      `;
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Pinjam record not found" });
      }

      // Build dynamic update query
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      if (amount !== undefined) {
        updateFields.push(`amount = $${paramCount}`);
        values.push(amount);
        paramCount++;
      }

      if (description !== undefined) {
        updateFields.push(`description = $${paramCount}`);
        values.push(description);
        paramCount++;
      }

      if (pinjam_type !== undefined) {
        if (!['mid_month', 'monthly'].includes(pinjam_type)) {
          return res.status(400).json({
            message: "pinjam_type must be either 'mid_month' or 'monthly'",
          });
        }
        updateFields.push(`pinjam_type = $${paramCount}`);
        values.push(pinjam_type);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      values.push(id);
      const updateQuery = `
        UPDATE pinjam_records
        SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const updateResult = await pool.query(updateQuery, values);

      // Get employee name for response
      const employeeQuery = `
        SELECT name FROM staffs WHERE id = $1
      `;
      const employeeResult = await pool.query(employeeQuery, [
        updateResult.rows[0].employee_id,
      ]);

      res.json({
        message: "Pinjam record updated successfully",
        record: {
          ...updateResult.rows[0],
          amount: parseFloat(updateResult.rows[0].amount),
          employee_name: employeeResult.rows[0]?.name || null,
        },
      });
    } catch (error) {
      console.error("Error updating pinjam record:", error);
      
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({
          message: "A pinjam record with this employee, date, description, and type already exists",
        });
      }
      
      res.status(500).json({
        message: "Error updating pinjam record",
        error: error.message,
      });
    }
  });

  // Delete pinjam record
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const deleteQuery = `
        DELETE FROM pinjam_records
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(deleteQuery, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Pinjam record not found" });
      }

      res.json({
        message: "Pinjam record deleted successfully",
        deleted_record: {
          ...result.rows[0],
          amount: parseFloat(result.rows[0].amount),
        },
      });
    } catch (error) {
      console.error("Error deleting pinjam record:", error);
      res.status(500).json({
        message: "Error deleting pinjam record",
        error: error.message,
      });
    }
  });

  return router;
}