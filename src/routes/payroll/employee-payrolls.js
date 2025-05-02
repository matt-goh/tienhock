// src/routes/payroll/employee-payrolls.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get employee payroll details with items
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      // Get employee payroll details
      const payrollQuery = `
        SELECT ep.*, mp.year, mp.month, mp.status as payroll_status, s.name as employee_name
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        LEFT JOIN staffs s ON ep.employee_id = s.id
        WHERE ep.id = $1
      `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Employee payroll not found" });
      }

      // Get payroll items
      const itemsQuery = `
        SELECT id, pay_code_id, description, rate, rate_unit, quantity, amount, is_manual
        FROM payroll_items
        WHERE employee_payroll_id = $1
        ORDER BY id
      `;
      const itemsResult = await pool.query(itemsQuery, [id]);

      // Format response
      const response = {
        ...payrollResult.rows[0],
        items: itemsResult.rows.map((item) => ({
          ...item,
          rate: parseFloat(item.rate),
          quantity: parseFloat(item.quantity),
          amount: parseFloat(item.amount),
          is_manual: !!item.is_manual,
        })),
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching employee payroll details:", error);
      res.status(500).json({
        message: "Error fetching employee payroll details",
        error: error.message,
      });
    }
  });

  // Create or update an employee payroll
  router.post("/", async (req, res) => {
    const {
      monthly_payroll_id,
      employee_id,
      job_type,
      section,
      gross_pay,
      net_pay,
      end_month_payment,
      status = "Processing",
      items = [],
    } = req.body;

    // Validate required fields
    if (!monthly_payroll_id || !employee_id || !job_type || !section) {
      return res.status(400).json({
        message:
          "monthly_payroll_id, employee_id, job_type, and section are required",
      });
    }

    try {
      await pool.query("BEGIN");

      // Check if employee payroll exists
      const checkQuery = `
        SELECT id FROM employee_payrolls 
        WHERE monthly_payroll_id = $1 AND employee_id = $2 AND job_type = $3
      `;
      const checkResult = await pool.query(checkQuery, [
        monthly_payroll_id,
        employee_id,
        job_type,
      ]);

      let employeePayrollId;

      if (checkResult.rows.length > 0) {
        // Update existing employee payroll
        employeePayrollId = checkResult.rows[0].id;

        const updateQuery = `
          UPDATE employee_payrolls
          SET job_type = $1, section = $2, gross_pay = $3, net_pay = $4, 
              end_month_payment = $5, status = $6
          WHERE id = $7
          RETURNING *
        `;

        await pool.query(updateQuery, [
          job_type,
          section,
          gross_pay || 0,
          net_pay || 0,
          end_month_payment || 0,
          status,
          employeePayrollId,
        ]);

        // Delete existing items to replace with new ones
        await pool.query(
          "DELETE FROM payroll_items WHERE employee_payroll_id = $1",
          [employeePayrollId]
        );
      } else {
        // Create a new employee payroll
        const insertQuery = `
          INSERT INTO employee_payrolls (
            monthly_payroll_id, employee_id, job_type, section,
            gross_pay, net_pay, end_month_payment, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `;

        const insertResult = await pool.query(insertQuery, [
          monthly_payroll_id,
          employee_id,
          job_type,
          section,
          gross_pay || 0,
          net_pay || 0,
          end_month_payment || 0,
          status,
        ]);

        employeePayrollId = insertResult.rows[0].id;
      }

      // Insert new payroll items
      if (items.length > 0) {
        const itemValues = items
          .map((item) => {
            return `(
            ${employeePayrollId},
            '${item.pay_code_id}',
            '${item.description.replace(/'/g, "''")}',
            ${item.rate},
            '${item.rate_unit}',
            ${item.quantity},
            ${item.amount},
            ${item.is_manual || false}
          )`;
          })
          .join(", ");

        const itemsQuery = `
          INSERT INTO payroll_items (
            employee_payroll_id, pay_code_id, description, 
            rate, rate_unit, quantity, amount, is_manual
          )
          VALUES ${itemValues}
          RETURNING id
        `;

        await pool.query(itemsQuery);
      }

      await pool.query("COMMIT");

      res.status(201).json({
        message: "Employee payroll created/updated successfully",
        employee_payroll_id: employeePayrollId,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error creating/updating employee payroll:", error);
      res.status(500).json({
        message: "Error creating/updating employee payroll",
        error: error.message,
      });
    }
  });

  // Add a manual payroll item
  router.post("/:id/items", async (req, res) => {
    const { id } = req.params;
    const {
      pay_code_id,
      description,
      rate,
      rate_unit,
      quantity,
      amount = null, // Optional, will be calculated if not provided
    } = req.body;

    // Validate required fields
    if (
      !pay_code_id ||
      !description ||
      rate === undefined ||
      !rate_unit ||
      quantity === undefined
    ) {
      return res.status(400).json({
        message:
          "pay_code_id, description, rate, rate_unit, and quantity are required",
      });
    }

    try {
      // Verify employee payroll exists and monthly payroll is not finalized
      const checkQuery = `
        SELECT ep.id, mp.status as payroll_status
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        WHERE ep.id = $1
      `;
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Employee payroll not found" });
      }

      if (checkResult.rows[0].payroll_status === "Finalized") {
        return res.status(400).json({
          message: "Cannot add items to a finalized payroll",
        });
      }

      // Calculate amount if not provided
      let finalAmount = amount;
      if (finalAmount === null) {
        // Simple calculation based on rate and quantity
        finalAmount = rate * quantity;
      }

      // Insert the new item
      const insertQuery = `
        INSERT INTO payroll_items (
          employee_payroll_id, pay_code_id, description,
          rate, rate_unit, quantity, amount, is_manual
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        RETURNING *
      `;

      const insertResult = await pool.query(insertQuery, [
        id,
        pay_code_id,
        description,
        rate,
        rate_unit,
        quantity,
        finalAmount,
      ]);

      // Update the employee payroll totals
      await pool.query(
        `
        UPDATE employee_payrolls
        SET gross_pay = (
          SELECT COALESCE(SUM(amount), 0)
          FROM payroll_items
          WHERE employee_payroll_id = $1
        ),
        net_pay = (
          SELECT COALESCE(SUM(amount), 0)
          FROM payroll_items
          WHERE employee_payroll_id = $1
        )
        WHERE id = $1
      `,
        [id]
      );

      res.status(201).json({
        message: "Manual payroll item added successfully",
        item: {
          ...insertResult.rows[0],
          rate: parseFloat(insertResult.rows[0].rate),
          quantity: parseFloat(insertResult.rows[0].quantity),
          amount: parseFloat(insertResult.rows[0].amount),
        },
      });
    } catch (error) {
      console.error("Error adding manual payroll item:", error);
      res.status(500).json({
        message: "Error adding manual payroll item",
        error: error.message,
      });
    }
  });

  // Delete a payroll item
  router.delete("/items/:itemId", async (req, res) => {
    const { itemId } = req.params;

    try {
      // Check if item exists and if the payroll is not finalized
      const checkQuery = `
        SELECT pi.id, mp.status as payroll_status, pi.employee_payroll_id
        FROM payroll_items pi
        JOIN employee_payrolls ep ON pi.employee_payroll_id = ep.id
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        WHERE pi.id = $1
      `;
      const checkResult = await pool.query(checkQuery, [itemId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Payroll item not found" });
      }

      if (checkResult.rows[0].payroll_status === "Finalized") {
        return res.status(400).json({
          message: "Cannot delete items from a finalized payroll",
        });
      }

      const employeePayrollId = checkResult.rows[0].employee_payroll_id;

      // Delete the item
      await pool.query("DELETE FROM payroll_items WHERE id = $1", [itemId]);

      // Update the employee payroll totals
      await pool.query(
        `
        UPDATE employee_payrolls
        SET gross_pay = (
          SELECT COALESCE(SUM(amount), 0)
          FROM payroll_items
          WHERE employee_payroll_id = $1
        ),
        net_pay = (
          SELECT COALESCE(SUM(amount), 0)
          FROM payroll_items
          WHERE employee_payroll_id = $1
        )
        WHERE id = $1
      `,
        [employeePayrollId]
      );

      res.json({
        message: "Payroll item deleted successfully",
        employee_payroll_id: employeePayrollId,
      });
    } catch (error) {
      console.error("Error deleting payroll item:", error);
      res.status(500).json({
        message: "Error deleting payroll item",
        error: error.message,
      });
    }
  });

  return router;
}
