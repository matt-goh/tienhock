// src/routes/payroll/employee-payrolls.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  const saveDeductions = async (pool, employeePayrollId, deductions) => {
    if (!deductions || deductions.length === 0) return;

    // First, delete existing deductions for this payroll
    await pool.query(
      "DELETE FROM payroll_deductions WHERE employee_payroll_id = $1",
      [employeePayrollId]
    );

    // Insert new deductions
    for (const deduction of deductions) {
      const insertQuery = `
      INSERT INTO payroll_deductions (
        employee_payroll_id, deduction_type, employee_amount, employer_amount,
        wage_amount, rate_info
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

      await pool.query(insertQuery, [
        employeePayrollId,
        deduction.deduction_type,
        deduction.employee_amount,
        deduction.employer_amount,
        deduction.wage_amount,
        JSON.stringify(deduction.rate_info),
      ]);
    }
  };

  // Get multiple employee payroll details with items
  router.get("/batch", async (req, res) => {
    const { ids } = req.query;

    if (!ids) {
      return res
        .status(400)
        .json({ message: "Employee payroll IDs are required" });
    }

    try {
      // Convert comma-separated string to array of numbers
      const payrollIds = ids.split(",").map((id) => parseInt(id));

      // Query all payrolls in a single database call
      const query = `
      SELECT ep.*, mp.year, mp.month, mp.status as payroll_status, s.name as employee_name
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      LEFT JOIN staffs s ON ep.employee_id = s.id
      WHERE ep.id = ANY($1)
    `;

      const payrollsResult = await pool.query(query, [payrollIds]);

      // Get all items for these payrolls in a single query (more efficient)
      const itemsQuery = `
      SELECT pi.employee_payroll_id, pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit, 
            pi.quantity, pi.amount, pi.is_manual, pc.pay_type
      FROM payroll_items pi
      LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
      WHERE pi.employee_payroll_id = ANY($1)
      ORDER BY pi.id
    `;

      const itemsResult = await pool.query(itemsQuery, [payrollIds]);

      // Group items by employee_payroll_id
      const itemsByPayrollId = itemsResult.rows.reduce((acc, item) => {
        if (!acc[item.employee_payroll_id]) {
          acc[item.employee_payroll_id] = [];
        }
        acc[item.employee_payroll_id].push({
          ...item,
          id: parseInt(item.id),
          rate: parseFloat(item.rate),
          quantity: parseFloat(item.quantity),
          amount: parseFloat(item.amount),
          is_manual: !!item.is_manual,
        });
        delete item.employee_payroll_id;
        return acc;
      }, {});

      // Get all deductions for these payrolls in a single query
      const deductionsQuery = `
      SELECT pd.employee_payroll_id, pd.deduction_type, pd.employee_amount, 
             pd.employer_amount, pd.wage_amount, pd.rate_info
      FROM payroll_deductions pd
      WHERE pd.employee_payroll_id = ANY($1)
      ORDER BY pd.employee_payroll_id, pd.deduction_type
    `;
      const deductionsResult = await pool.query(deductionsQuery, [payrollIds]);

      // Group deductions by employee_payroll_id
      const deductionsByPayrollId = deductionsResult.rows.reduce(
        (acc, deduction) => {
          if (!acc[deduction.employee_payroll_id]) {
            acc[deduction.employee_payroll_id] = [];
          }
          acc[deduction.employee_payroll_id].push({
            ...deduction,
            employee_amount: parseFloat(deduction.employee_amount),
            employer_amount: parseFloat(deduction.employer_amount),
            wage_amount: parseFloat(deduction.wage_amount),
          });
          return acc;
        },
        {}
      );

      // Merge payrolls with their items and deductions
      const response = payrollsResult.rows.map((payroll) => ({
        ...payroll,
        items: itemsByPayrollId[payroll.id] || [],
        deductions: deductionsByPayrollId[payroll.id] || [],
        gross_pay: parseFloat(payroll.gross_pay),
        net_pay: parseFloat(payroll.net_pay),
      }));

      res.json(response);
    } catch (error) {
      console.error("Error fetching batch employee payroll details:", error);
      res.status(500).json({
        message: "Error fetching batch employee payroll details",
        error: error.message,
      });
    }
  });

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
        SELECT pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit, 
              pi.quantity, pi.amount, pi.is_manual, pc.pay_type
        FROM payroll_items pi
        LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
        WHERE pi.employee_payroll_id = $1
        ORDER BY pi.id
      `;
      const itemsResult = await pool.query(itemsQuery, [id]);

      // Get payroll deductions
      const deductionsQuery = `
      SELECT pd.*, 
             CAST(pd.employee_amount AS NUMERIC(10, 2)) as employee_amount,
             CAST(pd.employer_amount AS NUMERIC(10, 2)) as employer_amount,
             CAST(pd.wage_amount AS NUMERIC(10, 2)) as wage_amount
      FROM payroll_deductions pd
      WHERE pd.employee_payroll_id = $1
      ORDER BY pd.deduction_type
    `;
      const deductionsResult = await pool.query(deductionsQuery, [id]);

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
        deductions: deductionsResult.rows.map((deduction) => ({
          ...deduction,
          employee_amount: parseFloat(deduction.employee_amount),
          employer_amount: parseFloat(deduction.employer_amount),
          wage_amount: parseFloat(deduction.wage_amount),
          rate_info: deduction.rate_info || {},
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
      status = "Processing",
      items = [],
      deductions = [],
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
          SET job_type = $1, section = $2, gross_pay = $3, net_pay = $4, status = $5
          WHERE id = $6
          RETURNING *
        `;

        await pool.query(updateQuery, [
          job_type,
          section,
          gross_pay || 0,
          net_pay || 0,
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
            gross_pay, net_pay, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `;

        const insertResult = await pool.query(insertQuery, [
          monthly_payroll_id,
          employee_id,
          job_type,
          section,
          gross_pay || 0,
          net_pay || 0,
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

      // Save deductions if provided
      if (deductions && deductions.length > 0) {
        await saveDeductions(pool, employeePayrollId, deductions);
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
