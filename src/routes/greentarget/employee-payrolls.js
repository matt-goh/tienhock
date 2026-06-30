// src/routes/greentarget/employee-payrolls.js
import { Router } from "express";
import {
  calculateGTStatutoryDeductions,
  fetchActiveContributionRates,
} from "./gtStatutoryCalc.js";

export default function (pool) {
  const router = Router();

  // Recalculates gross pay, statutory deductions, net pay and rounding for a
  // GT employee payroll after its items change (same math as process-all).
  const recalculateGTPayroll = async (employeePayrollId) => {
    const payrollResult = await pool.query(
      `SELECT ep.id, ep.employee_id, mp.year, mp.month
       FROM greentarget.employee_payrolls ep
       JOIN greentarget.monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
       WHERE ep.id = $1`,
      [employeePayrollId]
    );
    if (payrollResult.rows.length === 0) {
      throw new Error("Employee payroll not found");
    }
    const { employee_id, year, month } = payrollResult.rows[0];

    const [staffResult, itemsResult, rates, midMonthResult] = await Promise.all([
      pool.query(
        `SELECT id, name, birthdate, nationality, marital_status,
                spouse_employment_status, number_of_children,
                epf_age_override, epf_nationality_override,
                socso_age_override, sip_age_override
         FROM public.staffs WHERE id = $1`,
        [employee_id]
      ),
      pool.query(
        `SELECT pi.amount, pi.work_log_type, pc.pay_type
         FROM greentarget.payroll_items pi
         LEFT JOIN public.pay_codes pc ON pi.pay_code_id = pc.id
         WHERE pi.employee_payroll_id = $1`,
        [employeePayrollId]
      ),
      fetchActiveContributionRates(pool),
      pool.query(
        `SELECT amount FROM greentarget.mid_month_payrolls
         WHERE employee_id = $1 AND year = $2 AND month = $3`,
        [employee_id, year, month]
      ),
    ]);

    if (staffResult.rows.length === 0) {
      throw new Error("Staff not found for employee payroll");
    }
    const staff = staffResult.rows[0];

    // Integer cents to avoid float drift; EPF base excludes Overtime items
    let grossPayCents = 0;
    let epfGrossPayCents = 0;
    let commissionAdvanceCents = 0;
    itemsResult.rows.forEach((item) => {
      const cents = Math.round(parseFloat(item.amount) * 100);
      grossPayCents += cents;
      if ((item.pay_type || "Tambahan") !== "Overtime") {
        epfGrossPayCents += cents;
      }
      // Bonus/Advance/Kerja Luar OT add-ons were stored as items; only the
      // is_advance commission rows (work_log_type='advance') reduce net pay.
      if (item.work_log_type === "advance") {
        commissionAdvanceCents += cents;
      }
    });
    const grossPay = grossPayCents / 100;
    const epfGrossPay = epfGrossPayCents / 100;
    const commissionAdvanceTotal = commissionAdvanceCents / 100;

    const deductions = calculateGTStatutoryDeductions({
      staff,
      grossPay,
      epfGrossPay,
      year,
      month,
      ...rates,
    });

    const totalEmployeeDeductions = deductions.reduce(
      (sum, d) => sum + d.employee_amount,
      0
    );
    const netPay =
      Math.round(
        (grossPay - totalEmployeeDeductions - commissionAdvanceTotal) * 100
      ) / 100;

    // Mid-month advance + rounding (digenapkan), mirroring process-all
    const midMonthAmount = parseFloat(midMonthResult.rows[0]?.amount || 0);
    const jumlah = netPay - midMonthAmount;
    const setelahDigenapkan = Math.ceil(jumlah);
    const digenapkan = setelahDigenapkan - jumlah;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE greentarget.employee_payrolls
         SET gross_pay = $1, net_pay = $2, digenapkan = $3, setelah_digenapkan = $4
         WHERE id = $5`,
        [
          grossPay.toFixed(2),
          netPay.toFixed(2),
          digenapkan.toFixed(2),
          setelahDigenapkan.toFixed(2),
          employeePayrollId,
        ]
      );
      await client.query(
        "DELETE FROM greentarget.payroll_deductions WHERE employee_payroll_id = $1",
        [employeePayrollId]
      );
      for (const deduction of deductions) {
        await client.query(
          `INSERT INTO greentarget.payroll_deductions
           (employee_payroll_id, deduction_type, employee_amount, employer_amount, wage_amount, rate_info)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            employeePayrollId,
            deduction.deduction_type,
            deduction.employee_amount,
            deduction.employer_amount,
            deduction.wage_amount,
            JSON.stringify(deduction.rate_info),
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  // Get multiple employee payroll details (batch).
  // Registered before /:id so "batch" isn't captured as an id.
  router.get("/batch", async (req, res) => {
    const { ids } = req.query;

    if (!ids) {
      return res.status(400).json({ message: "Employee payroll IDs are required" });
    }

    try {
      const payrollIds = ids.split(",").map((id) => parseInt(id));

      // Query all payrolls
      const payrollsResult = await pool.query(`
        SELECT ep.*, mp.year, mp.month,
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
        digenapkan: parseFloat(payroll.digenapkan || 0),
        setelah_digenapkan:
          payroll.setelah_digenapkan != null
            ? parseFloat(payroll.setelah_digenapkan)
            : null,
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

  // Get employee payroll details with items and deductions
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      // Get employee payroll details
      const payrollQuery = `
        SELECT ep.*, mp.year, mp.month,
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
      const [itemsResult, deductionsResult, pinjamResult, midMonthResult] =
        await Promise.all([
          // Get payroll items
          pool.query(`
            SELECT pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit,
                  pi.quantity, pi.amount, pi.is_manual, pi.job_type,
                  pi.work_log_type, pc.pay_type
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

          // Get pinjam records for this employee/month
          pool.query(`
            SELECT id, employee_id, year, month, amount, description, pinjam_type
            FROM greentarget.pinjam_records
            WHERE employee_id = $1 AND year = $2 AND month = $3
            ORDER BY pinjam_type, description
          `, [payrollData.employee_id, payrollData.year, payrollData.month]),

          // Get mid-month advance for this employee/month
          pool.query(`
            SELECT id, employee_id, year, month, amount, payment_method, status
            FROM greentarget.mid_month_payrolls
            WHERE employee_id = $1 AND year = $2 AND month = $3
          `, [payrollData.employee_id, payrollData.year, payrollData.month]),
        ]);

      // Parse items
      const items = itemsResult.rows.map((item) => ({
        ...item,
        rate: parseFloat(item.rate),
        quantity: parseFloat(item.quantity),
        amount: parseFloat(item.amount),
        is_manual: !!item.is_manual,
      }));

      const midMonthRow = midMonthResult.rows[0] || null;

      // Format response
      const response = {
        ...payrollData,
        gross_pay: parseFloat(payrollData.gross_pay),
        net_pay: parseFloat(payrollData.net_pay),
        digenapkan: parseFloat(payrollData.digenapkan || 0),
        setelah_digenapkan:
          payrollData.setelah_digenapkan != null
            ? parseFloat(payrollData.setelah_digenapkan)
            : null,
        items,
        deductions: deductionsResult.rows.map((deduction) => ({
          ...deduction,
          employee_amount: parseFloat(deduction.employee_amount),
          employer_amount: parseFloat(deduction.employer_amount),
          wage_amount: parseFloat(deduction.wage_amount),
          rate_info: deduction.rate_info || {},
        })),
        pinjam_records: pinjamResult.rows.map((record) => ({
          ...record,
          amount: parseFloat(record.amount),
        })),
        mid_month_payroll: midMonthRow
          ? { ...midMonthRow, amount: parseFloat(midMonthRow.amount) }
          : null,
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
      // Verify payroll exists
      const checkResult = await pool.query(`
        SELECT ep.id
        FROM greentarget.employee_payrolls ep
        WHERE ep.id = $1
      `, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Employee payroll not found" });
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

      // Recalculate gross pay, statutory deductions, net pay and rounding
      await recalculateGTPayroll(id);

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
      // Check if item exists
      const checkResult = await pool.query(`
        SELECT pi.id, pi.employee_payroll_id
        FROM greentarget.payroll_items pi
        WHERE pi.id = $1
      `, [itemId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Payroll item not found" });
      }

      const employeePayrollId = checkResult.rows[0].employee_payroll_id;

      // Delete the item
      await pool.query("DELETE FROM greentarget.payroll_items WHERE id = $1", [itemId]);

      // Recalculate gross pay, statutory deductions, net pay and rounding
      await recalculateGTPayroll(employeePayrollId);

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
