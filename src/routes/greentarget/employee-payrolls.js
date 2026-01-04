// src/routes/greentarget/employee-payrolls.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get employee payroll details with items and deductions
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      // Get employee payroll details
      const payrollQuery = `
        SELECT ep.*, mp.year, mp.month, mp.status as payroll_status,
               s.name as employee_name, s.ic_no, s.bank_account_number,
               s.epf_no, s.socso_no, s.income_tax_no
        FROM greentarget.employee_payrolls ep
        JOIN greentarget.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        LEFT JOIN public.staffs s ON ep.employee_id = s.id
        WHERE ep.id = $1
      `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Employee payroll not found" });
      }

      const payrollData = payrollResult.rows[0];

      // Get all data in parallel for efficiency
      const [itemsResult, deductionsResult] = await Promise.all([
        // Get payroll items
        pool.query(`
          SELECT pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit,
                pi.quantity, pi.amount, pi.is_manual, pi.job_type,
                pc.pay_type
          FROM greentarget.payroll_items pi
          LEFT JOIN public.pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pi.employee_payroll_id = $1
          ORDER BY pi.id
        `, [id]),

        // Get payroll deductions
        pool.query(`
          SELECT pd.*,
                 CAST(pd.employee_amount AS NUMERIC(10, 2)) as employee_amount,
                 CAST(pd.employer_amount AS NUMERIC(10, 2)) as employer_amount,
                 CAST(pd.wage_amount AS NUMERIC(10, 2)) as wage_amount
          FROM greentarget.payroll_deductions pd
          WHERE pd.employee_payroll_id = $1
          ORDER BY pd.deduction_type
        `, [id]),
      ]);

      // Parse items
      const items = itemsResult.rows.map((item) => ({
        ...item,
        rate: parseFloat(item.rate),
        quantity: parseFloat(item.quantity),
        amount: parseFloat(item.amount),
        is_manual: !!item.is_manual,
      }));

      // Format response
      const response = {
        ...payrollData,
        gross_pay: parseFloat(payrollData.gross_pay),
        net_pay: parseFloat(payrollData.net_pay),
        items,
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
      console.error("Error fetching GT employee payroll details:", error);
      res.status(500).json({
        message: "Error fetching GT employee payroll details",
        error: error.message,
      });
    }
  });

  // Get multiple employee payroll details (batch)
  router.get("/batch", async (req, res) => {
    const { ids } = req.query;

    if (!ids) {
      return res.status(400).json({ message: "Employee payroll IDs are required" });
    }

    try {
      const payrollIds = ids.split(",").map((id) => parseInt(id));

      // Query all payrolls
      const payrollsResult = await pool.query(`
        SELECT ep.*, mp.year, mp.month, mp.status as payroll_status,
               s.name as employee_name, s.ic_no
        FROM greentarget.employee_payrolls ep
        JOIN greentarget.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        LEFT JOIN public.staffs s ON ep.employee_id = s.id
        WHERE ep.id = ANY($1)
      `, [payrollIds]);

      // Get all items
      const itemsResult = await pool.query(`
        SELECT pi.employee_payroll_id, pi.id, pi.pay_code_id, pi.description,
               pi.rate, pi.rate_unit, pi.quantity, pi.amount, pi.is_manual,
               pc.pay_type
        FROM greentarget.payroll_items pi
        LEFT JOIN public.pay_codes pc ON pi.pay_code_id = pc.id
        WHERE pi.employee_payroll_id = ANY($1)
        ORDER BY pi.id
      `, [payrollIds]);

      // Get all deductions
      const deductionsResult = await pool.query(`
        SELECT pd.employee_payroll_id, pd.deduction_type, pd.employee_amount,
               pd.employer_amount, pd.wage_amount, pd.rate_info
        FROM greentarget.payroll_deductions pd
        WHERE pd.employee_payroll_id = ANY($1)
        ORDER BY pd.employee_payroll_id, pd.deduction_type
      `, [payrollIds]);

      // Group items by payroll id
      const itemsByPayrollId = itemsResult.rows.reduce((acc, item) => {
        if (!acc[item.employee_payroll_id]) acc[item.employee_payroll_id] = [];
        acc[item.employee_payroll_id].push({
          ...item,
          rate: parseFloat(item.rate),
          quantity: parseFloat(item.quantity),
          amount: parseFloat(item.amount),
          is_manual: !!item.is_manual,
        });
        return acc;
      }, {});

      // Group deductions by payroll id
      const deductionsByPayrollId = deductionsResult.rows.reduce((acc, d) => {
        if (!acc[d.employee_payroll_id]) acc[d.employee_payroll_id] = [];
        acc[d.employee_payroll_id].push({
          ...d,
          employee_amount: parseFloat(d.employee_amount),
          employer_amount: parseFloat(d.employer_amount),
          wage_amount: parseFloat(d.wage_amount),
        });
        return acc;
      }, {});

      // Merge data
      const response = payrollsResult.rows.map((payroll) => ({
        ...payroll,
        gross_pay: parseFloat(payroll.gross_pay),
        net_pay: parseFloat(payroll.net_pay),
        items: itemsByPayrollId[payroll.id] || [],
        deductions: deductionsByPayrollId[payroll.id] || [],
      }));

      res.json(response);
    } catch (error) {
      console.error("Error fetching batch GT employee payrolls:", error);
      res.status(500).json({
        message: "Error fetching batch GT employee payrolls",
        error: error.message,
      });
    }
  });

  // Add a manual payroll item
  router.post("/:id/items", async (req, res) => {
    const { id } = req.params;
    const { pay_code_id, description, rate, rate_unit, quantity, amount } = req.body;

    if (!pay_code_id || !description || rate === undefined || !rate_unit || quantity === undefined) {
      return res.status(400).json({
        message: "pay_code_id, description, rate, rate_unit, and quantity are required",
      });
    }

    try {
      // Verify payroll exists and is not finalized
      const checkResult = await pool.query(`
        SELECT ep.id, mp.status as payroll_status
        FROM greentarget.employee_payrolls ep
        JOIN greentarget.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        WHERE ep.id = $1
      `, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Employee payroll not found" });
      }

      if (checkResult.rows[0].payroll_status === "Finalized") {
        return res.status(400).json({ message: "Cannot add items to a finalized payroll" });
      }

      const parsedRate = parseFloat(rate);
      const parsedQuantity = parseFloat(quantity);
      const finalAmount = amount !== undefined ? parseFloat(amount) : parsedRate * parsedQuantity;

      // Insert the item
      const insertResult = await pool.query(`
        INSERT INTO greentarget.payroll_items (
          employee_payroll_id, pay_code_id, description,
          rate, rate_unit, quantity, amount, is_manual
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        RETURNING *
      `, [id, pay_code_id, description, parsedRate, rate_unit, parsedQuantity, finalAmount]);

      // Update gross pay and net pay
      const totalsResult = await pool.query(`
        SELECT
          COALESCE(SUM(amount), 0) as total_items
        FROM greentarget.payroll_items
        WHERE employee_payroll_id = $1
      `, [id]);

      const grossPay = parseFloat(totalsResult.rows[0].total_items);

      // Get deductions
      const deductionsResult = await pool.query(`
        SELECT COALESCE(SUM(employee_amount), 0) as total_deductions
        FROM greentarget.payroll_deductions
        WHERE employee_payroll_id = $1
      `, [id]);

      const totalDeductions = parseFloat(deductionsResult.rows[0].total_deductions);
      const netPay = grossPay - totalDeductions;

      await pool.query(`
        UPDATE greentarget.employee_payrolls
        SET gross_pay = $1, net_pay = $2
        WHERE id = $3
      `, [grossPay.toFixed(2), netPay.toFixed(2), id]);

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
      // Check if item exists and get payroll info
      const checkResult = await pool.query(`
        SELECT pi.id, pi.employee_payroll_id, mp.status as payroll_status
        FROM greentarget.payroll_items pi
        JOIN greentarget.employee_payrolls ep ON pi.employee_payroll_id = ep.id
        JOIN greentarget.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        WHERE pi.id = $1
      `, [itemId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Payroll item not found" });
      }

      if (checkResult.rows[0].payroll_status === "Finalized") {
        return res.status(400).json({ message: "Cannot delete items from a finalized payroll" });
      }

      const employeePayrollId = checkResult.rows[0].employee_payroll_id;

      // Delete the item
      await pool.query("DELETE FROM greentarget.payroll_items WHERE id = $1", [itemId]);

      // Update totals
      const totalsResult = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total_items
        FROM greentarget.payroll_items
        WHERE employee_payroll_id = $1
      `, [employeePayrollId]);

      const grossPay = parseFloat(totalsResult.rows[0].total_items);

      const deductionsResult = await pool.query(`
        SELECT COALESCE(SUM(employee_amount), 0) as total_deductions
        FROM greentarget.payroll_deductions
        WHERE employee_payroll_id = $1
      `, [employeePayrollId]);

      const totalDeductions = parseFloat(deductionsResult.rows[0].total_deductions);
      const netPay = grossPay - totalDeductions;

      await pool.query(`
        UPDATE greentarget.employee_payrolls
        SET gross_pay = $1, net_pay = $2
        WHERE id = $3
      `, [grossPay.toFixed(2), netPay.toFixed(2), employeePayrollId]);

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
