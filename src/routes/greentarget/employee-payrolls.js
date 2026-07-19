// src/routes/greentarget/employee-payrolls.js
import { Router } from "express";
import {
  calculateGTStatutoryDeductions,
  fetchActiveContributionRates,
} from "./gtStatutoryCalc.js";
import {
  isOTFormulaEffective,
  isFormulaOTItem,
  computeOTRates,
  otRateCentsForDayType,
  buildOTSnapshot,
  resolveOTPayBasis,
} from "../payroll/otFormula.js";

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
        `SELECT pi.id, pi.amount, pi.rate, pi.rate_unit, pi.quantity,
                pi.is_manual, pi.work_log_type, pc.pay_type, pc.ot_rate_mode
         FROM greentarget.payroll_items pi
         LEFT JOIN public.pay_codes pc ON pi.pay_code_id = pc.id
         WHERE pi.employee_payroll_id = $1`,
        [employeePayrollId]
      ),
      fetchActiveContributionRates(pool),
      pool.query(
        `SELECT amount FROM greentarget.mid_month_payrolls
         WHERE employee_id = $1 AND year = $2 AND month = $3
           AND LOWER(COALESCE(status, '')) <> 'cancelled'`,
        [employee_id, year, month]
      ),
    ]);

    if (staffResult.rows.length === 0) {
      throw new Error("Staff not found for employee payroll");
    }
    const staff = staffResult.rows[0];

    const payrollItems = itemsResult.rows.map((item) => ({
      ...item,
      rate: parseFloat(item.rate),
      quantity: parseFloat(item.quantity),
      amount: parseFloat(item.amount),
    }));

    // July 2026+ OT salary formula: re-derive the month's OT rates from the
    // stored non-OT earnings and reprice formula-scope OT items before totals
    // (mirrors GT process-all; see src/routes/payroll/otFormula.js).
    let otCalculationSnapshot = null;
    if (isOTFormulaEffective(year, month)) {
      const formulaOTItems = payrollItems.filter(
        (item) =>
          isFormulaOTItem(item, null) &&
          item.ot_rate_mode !== "fixed" &&
          // Kerja Luar OT rows are user-keyed and never repriced (decision 16)
          item.work_log_type !== "others" &&
          (item.quantity || 0) > 0
      );
      if (formulaOTItems.length > 0) {
        const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
        const monthEnd = `${year}-${String(month).padStart(2, "0")}-${new Date(
          year,
          month,
          0
        ).getDate()}`;
        const [basisResult, leaveResult, habukResult, workedDaysInputResult] =
          await Promise.all([
            pool.query("SELECT ot_pay_basis FROM public.staffs WHERE id = $1", [
              employee_id,
            ]),
            pool.query(
              `SELECT COALESCE(SUM(amount_paid), 0) AS total
               FROM greentarget.leave_records
               WHERE employee_id = $1 AND status = 'approved'
                 AND leave_date >= $2 AND leave_date <= $3`,
              [employee_id, monthStart, monthEnd]
            ),
            pool.query(
              `SELECT COUNT(DISTINCT l.log_date) AS days
               FROM greentarget.daily_lori_habuk_logs l
               WHERE l.employee_id = $1 AND l.status = 'Submitted'
                 AND l.log_date >= $2 AND l.log_date <= $3
                 AND NOT EXISTS (
                   SELECT 1 FROM greentarget.leave_records lr
                   WHERE lr.employee_id = l.employee_id
                     AND lr.leave_date = l.log_date AND lr.status = 'approved'
                 )`,
              [employee_id, monthStart, monthEnd]
            ),
            pool.query(
              `SELECT MAX(mwle.worked_days) AS worked_days,
                      COUNT(*) AS entry_count
               FROM greentarget.monthly_work_logs mwl
               JOIN greentarget.monthly_work_log_entries mwle
                 ON mwl.id = mwle.monthly_log_id
               WHERE mwle.employee_id = $1
                 AND mwl.log_month = $2 AND mwl.log_year = $3
                 AND mwl.status = 'Submitted'`,
              [employee_id, month, year]
            ),
          ]);
        // Paid leave is EXCLUDED from the numerator — HR prices leave FROM the
        // derived daily rate (HR model "RAMBU").
        const numeratorBreakdownCents = {
          work_items: payrollItems.reduce(
            (sum, item) =>
              (item.pay_type || "Tambahan") !== "Overtime" &&
              item.work_log_type !== "bonus"
                ? sum + Math.round(item.amount * 100)
                : sum,
            0
          ),
        };
        const numeratorCents = Object.values(numeratorBreakdownCents).reduce(
          (a, b) => a + b,
          0
        );

        // Derive the divisor sources FIRST; the basis then resolves as:
        // explicit staff override > actual days (habuk attendance or a
        // Worked Days input) > monthly-logged default (÷26).
        let workedDays = null;
        let workedDaysSource = null;
        const attendanceDays = parseInt(habukResult.rows[0]?.days, 10) || 0;
        const monthlyInput = workedDaysInputResult.rows[0]?.worked_days
          ? parseFloat(workedDaysInputResult.rows[0].worked_days)
          : null;
        const isMonthlyLogged =
          (parseInt(workedDaysInputResult.rows[0]?.entry_count, 10) || 0) > 0;
        if (attendanceDays > 0 && monthlyInput != null) {
          workedDays = Math.max(attendanceDays, monthlyInput);
          workedDaysSource = "attendance+monthly_input";
        } else if (monthlyInput != null) {
          workedDays = monthlyInput;
          workedDaysSource = "monthly_input";
        } else if (attendanceDays > 0) {
          workedDays = attendanceDays;
          workedDaysSource = "attendance";
        }

        const payBasis = resolveOTPayBasis(basisResult.rows[0]?.ot_pay_basis, {
          hasWorkedDaySource: workedDays != null,
          isMonthlyLogged,
        });
        const otRates = computeOTRates({ payBasis, numeratorCents, workedDays });
        if (!otRates.ok) {
          // Decision 15: never fall back silently — surface the block.
          throw new Error(
            `Kiraan kadar OT disekat: ${otRates.errors.join(" ")}`
          );
        }

        for (const item of formulaOTItems) {
          const newRate =
            otRateCentsForDayType(otRates.rateCents, "Biasa") / 100;
          const newAmount =
            Math.round(newRate * (item.quantity || 0) * 100) / 100;
          if (newRate !== item.rate || newAmount !== item.amount) {
            await pool.query(
              "UPDATE greentarget.payroll_items SET rate = $1, amount = $2 WHERE id = $3",
              [newRate, newAmount, item.id]
            );
            item.rate = newRate;
            item.amount = newAmount;
          }
        }

        otCalculationSnapshot = buildOTSnapshot({
          payBasis,
          numeratorCents,
          numeratorBreakdownCents,
          excludedLeaveCents: Math.round(
            parseFloat(leaveResult.rows[0]?.total || 0) * 100
          ),
          excludedBonusCents: payrollItems.reduce(
            (sum, item) =>
              item.work_log_type === "bonus"
                ? sum + Math.round(item.amount * 100)
                : sum,
            0
          ),
          excludedOtCents: payrollItems.reduce(
            (sum, item) =>
              (item.pay_type || "Tambahan") === "Overtime"
                ? sum + Math.round(item.amount * 100)
                : sum,
            0
          ),
          rates: otRates,
          workedDaysSource,
        });
      }
    }

    // Integer cents to avoid float drift; EPF base excludes Overtime items
    let grossPayCents = 0;
    let epfGrossPayCents = 0;
    let commissionAdvanceCents = 0;
    payrollItems.forEach((item) => {
      const cents = Math.round(item.amount * 100);
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
         SET gross_pay = $1, net_pay = $2, digenapkan = $3, setelah_digenapkan = $4,
             ot_calculation = $5
         WHERE id = $6`,
        [
          grossPay.toFixed(2),
          netPay.toFixed(2),
          digenapkan.toFixed(2),
          setelahDigenapkan.toFixed(2),
          otCalculationSnapshot ? JSON.stringify(otCalculationSnapshot) : null,
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

      // Derive rounding against the current active advance amount rather than
      // trusting a value stored before an advance may have been cancelled.
      const midMonthResult = await pool.query(`
        SELECT ep.id AS employee_payroll_id,
               COALESCE(SUM(mmp.amount), 0) AS amount
        FROM greentarget.employee_payrolls ep
        JOIN greentarget.monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
        LEFT JOIN greentarget.mid_month_payrolls mmp
          ON mmp.employee_id = ep.employee_id
         AND mmp.year = mp.year
         AND mmp.month = mp.month
         AND LOWER(COALESCE(mmp.status, '')) <> 'cancelled'
        WHERE ep.id = ANY($1)
        GROUP BY ep.id
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

      const midMonthByPayrollId = midMonthResult.rows.reduce((acc, row) => {
        acc[row.employee_payroll_id] = parseFloat(row.amount);
        return acc;
      }, {});

      // Merge data
      const response = payrollsResult.rows.map((payroll) => {
        const netPay = parseFloat(payroll.net_pay);
        const jumlah = netPay - (midMonthByPayrollId[payroll.id] || 0);
        const setelahDigenapkan = Math.ceil(jumlah);
        const digenapkan = Math.round((setelahDigenapkan - jumlah) * 100) / 100;

        return {
          ...payroll,
          gross_pay: parseFloat(payroll.gross_pay),
          net_pay: netPay,
          digenapkan,
          setelah_digenapkan: setelahDigenapkan,
          items: itemsByPayrollId[payroll.id] || [],
          deductions: deductionsByPayrollId[payroll.id] || [],
        };
      });

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
      const [itemsResult, deductionsResult, pinjamResult, midMonthResult, leaveResult] =
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
              AND LOWER(COALESCE(status, '')) <> 'cancelled'
          `, [payrollData.employee_id, payrollData.year, payrollData.month]),

          // Get approved leave for this employee/month (folded into gross by the
          // processor; shown on the payslip)
          pool.query(`
            SELECT id, employee_id, to_char(leave_date, 'YYYY-MM-DD') AS leave_date,
                   leave_type, days_taken,
                   CAST(amount_paid AS NUMERIC(10, 2)) AS amount_paid, status
            FROM greentarget.leave_records
            WHERE employee_id = $1
              AND EXTRACT(YEAR FROM leave_date) = $2
              AND EXTRACT(MONTH FROM leave_date) = $3
              AND status = 'approved'
            ORDER BY leave_date
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
      const netPay = parseFloat(payrollData.net_pay);
      const midMonthAmount = midMonthRow ? parseFloat(midMonthRow.amount) : 0;
      const jumlah = netPay - midMonthAmount;
      const setelahDigenapkan = Math.ceil(jumlah);
      const digenapkan = Math.round((setelahDigenapkan - jumlah) * 100) / 100;

      // Format response
      const response = {
        ...payrollData,
        gross_pay: parseFloat(payrollData.gross_pay),
        net_pay: netPay,
        digenapkan,
        setelah_digenapkan: setelahDigenapkan,
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
        leave_records: leaveResult.rows.map((record) => ({
          ...record,
          days_taken: parseFloat(record.days_taken),
          amount_paid: parseFloat(record.amount_paid),
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
