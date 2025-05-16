// src/routes/payroll/mid-month-payrolls.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all mid-month payrolls with filtering
  router.get("/", async (req, res) => {
    const {
      year,
      month,
      employee_id,
      status,
      payment_method,
      page = 1,
      limit = 50,
    } = req.query;

    try {
      let query = `
        SELECT 
          mmp.*,
          s.name as employee_name,
          s.payment_preference as default_payment_method
        FROM mid_month_payrolls mmp
        LEFT JOIN staffs s ON mmp.employee_id = s.id
        WHERE 1=1
      `;

      const values = [];
      let paramCount = 1;

      if (year) {
        query += ` AND mmp.year = $${paramCount}`;
        values.push(parseInt(year));
        paramCount++;
      }

      if (month) {
        query += ` AND mmp.month = $${paramCount}`;
        values.push(parseInt(month));
        paramCount++;
      }

      if (employee_id) {
        query += ` AND mmp.employee_id = $${paramCount}`;
        values.push(employee_id);
        paramCount++;
      }

      if (status) {
        query += ` AND mmp.status = $${paramCount}`;
        values.push(status);
        paramCount++;
      }

      if (payment_method) {
        query += ` AND mmp.payment_method = $${paramCount}`;
        values.push(payment_method);
        paramCount++;
      }

      query += `
        ORDER BY mmp.year DESC, mmp.month DESC, s.name ASC
      `;

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM mid_month_payrolls mmp
        WHERE 1=1 ${query.split("WHERE 1=1")[1].split("ORDER BY")[0]}
      `;

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, values),
        pool.query(query, values),
      ]);

      // Apply pagination
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const paginatedPayrolls = dataResult.rows
        .slice(offset, offset + parseInt(limit))
        .map((payroll) => ({
          ...payroll,
          amount: parseFloat(payroll.amount),
        }));

      res.json({
        payrolls: paginatedPayrolls,
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / parseInt(limit)),
      });
    } catch (error) {
      console.error("Error fetching mid-month payrolls:", error);
      res.status(500).json({
        message: "Error fetching mid-month payrolls",
        error: error.message,
      });
    }
  });

  // Get specific mid-month payroll
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const query = `
        SELECT 
          mmp.*,
          s.name as employee_name,
          s.payment_preference as default_payment_method
        FROM mid_month_payrolls mmp
        LEFT JOIN staffs s ON mmp.employee_id = s.id
        WHERE mmp.id = $1
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Mid-month payroll not found" });
      }

      res.json({
        ...result.rows[0],
        amount: parseFloat(result.rows[0].amount),
      });
    } catch (error) {
      console.error("Error fetching mid-month payroll:", error);
      res.status(500).json({
        message: "Error fetching mid-month payroll",
        error: error.message,
      });
    }
  });

  // Create new mid-month payroll
  router.post("/", async (req, res) => {
    const {
      employee_id,
      year,
      month,
      amount,
      payment_method,
      status = "Pending",
      notes,
      created_by,
    } = req.body;

    // Validate required fields
    if (
      !employee_id ||
      !year ||
      !month ||
      amount === undefined ||
      !payment_method
    ) {
      return res.status(400).json({
        message:
          "employee_id, year, month, amount, and payment_method are required",
      });
    }

    try {
      // Check if mid-month payroll already exists for this employee/month
      const existingQuery = `
        SELECT id FROM mid_month_payrolls
        WHERE employee_id = $1 AND year = $2 AND month = $3
      `;
      const existingResult = await pool.query(existingQuery, [
        employee_id,
        year,
        month,
      ]);

      if (existingResult.rows.length > 0) {
        return res.status(409).json({
          message:
            "Mid-month payroll already exists for this employee and month",
          existing_id: existingResult.rows[0].id,
        });
      }

      // Create new mid-month payroll
      const insertQuery = `
        INSERT INTO mid_month_payrolls (
          employee_id, year, month, amount, payment_method, status, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const insertResult = await pool.query(insertQuery, [
        employee_id,
        year,
        month,
        amount,
        payment_method,
        status,
        notes || null,
        created_by || null,
      ]);

      // Get employee name for response
      const employeeQuery = `
        SELECT name, payment_preference FROM staffs WHERE id = $1
      `;
      const employeeResult = await pool.query(employeeQuery, [employee_id]);

      res.status(201).json({
        message: "Mid-month payroll created successfully",
        payroll: {
          ...insertResult.rows[0],
          amount: parseFloat(insertResult.rows[0].amount),
          employee_name: employeeResult.rows[0]?.name || null,
          default_payment_method:
            employeeResult.rows[0]?.payment_preference || null,
        },
      });
    } catch (error) {
      console.error("Error creating mid-month payroll:", error);
      res.status(500).json({
        message: "Error creating mid-month payroll",
        error: error.message,
      });
    }
  });

  // Update existing mid-month payroll
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { amount, payment_method, status, notes, paid_at } = req.body;

    try {
      // Check if payroll exists
      const checkQuery = `
        SELECT * FROM mid_month_payrolls WHERE id = $1
      `;
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Mid-month payroll not found" });
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

      if (payment_method !== undefined) {
        updateFields.push(`payment_method = $${paramCount}`);
        values.push(payment_method);
        paramCount++;
      }

      if (status !== undefined) {
        updateFields.push(`status = $${paramCount}`);
        values.push(status);
        paramCount++;

        // If status is being set to 'Paid', set paid_at timestamp
        if (status === "Paid" && !paid_at) {
          updateFields.push(`paid_at = CURRENT_TIMESTAMP`);
        }
      }

      if (paid_at !== undefined) {
        updateFields.push(`paid_at = $${paramCount}`);
        values.push(paid_at);
        paramCount++;
      }

      if (notes !== undefined) {
        updateFields.push(`notes = $${paramCount}`);
        values.push(notes);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      values.push(id);
      const updateQuery = `
        UPDATE mid_month_payrolls
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
        message: "Mid-month payroll updated successfully",
        payroll: {
          ...updateResult.rows[0],
          amount: parseFloat(updateResult.rows[0].amount),
          employee_name: employeeResult.rows[0]?.name || null,
        },
      });
    } catch (error) {
      console.error("Error updating mid-month payroll:", error);
      res.status(500).json({
        message: "Error updating mid-month payroll",
        error: error.message,
      });
    }
  });

  // Update payment status only
  router.put("/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["Pending", "Paid", "Cancelled"].includes(status)) {
      return res.status(400).json({
        message: "Valid status is required (Pending, Paid, Cancelled)",
      });
    }

    try {
      const updateFields = ["status = $1"];
      const values = [status];

      // If marking as paid, set paid_at timestamp
      if (status === "Paid") {
        updateFields.push("paid_at = CURRENT_TIMESTAMP");
      } else if (status === "Cancelled" || status === "Pending") {
        updateFields.push("paid_at = NULL");
      }

      const query = `
        UPDATE mid_month_payrolls
        SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await pool.query(query, [status, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Mid-month payroll not found" });
      }

      res.json({
        message: "Payment status updated successfully",
        payroll: {
          ...result.rows[0],
          amount: parseFloat(result.rows[0].amount),
        },
      });
    } catch (error) {
      console.error("Error updating payment status:", error);
      res.status(500).json({
        message: "Error updating payment status",
        error: error.message,
      });
    }
  });

  // Delete mid-month payroll
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const deleteQuery = `
        DELETE FROM mid_month_payrolls
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(deleteQuery, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Mid-month payroll not found" });
      }

      res.json({
        message: "Mid-month payroll deleted successfully",
        deleted_payroll: {
          ...result.rows[0],
          amount: parseFloat(result.rows[0].amount),
        },
      });
    } catch (error) {
      console.error("Error deleting mid-month payroll:", error);
      res.status(500).json({
        message: "Error deleting mid-month payroll",
        error: error.message,
      });
    }
  });

  // Get mid-month payroll by employee and date
  router.get("/employee/:employee_id/:year/:month", async (req, res) => {
    const { employee_id, year, month } = req.params;

    try {
      const query = `
        SELECT 
          mmp.*,
          s.name as employee_name
        FROM mid_month_payrolls mmp
        LEFT JOIN staffs s ON mmp.employee_id = s.id
        WHERE mmp.employee_id = $1 AND mmp.year = $2 AND mmp.month = $3
      `;

      const result = await pool.query(query, [employee_id, year, month]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No mid-month payroll found for this employee and date",
        });
      }

      res.json({
        ...result.rows[0],
        amount: parseFloat(result.rows[0].amount),
      });
    } catch (error) {
      console.error("Error fetching mid-month payroll by employee:", error);
      res.status(500).json({
        message: "Error fetching mid-month payroll",
        error: error.message,
      });
    }
  });

  return router;
}
