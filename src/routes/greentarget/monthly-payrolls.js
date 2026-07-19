// src/routes/greentarget/monthly-payrolls.js
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

// Helper function to format date to YYYY-MM-DD string
const formatDateToYMD = (date) => {
  if (!date) return null;
  if (typeof date === "string") {
    return date.split("T")[0].split(" ")[0];
  }
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return null;
};

export default function (pool) {
  const router = Router();

  // Get all monthly payrolls
  router.get("/", async (req, res) => {
    const { year, month, include_employee_payrolls } = req.query;
    try {
      let query = `SELECT * FROM greentarget.monthly_payrolls`;
      const values = [];
      const whereClauses = [];
      let paramCount = 1;

      if (year) {
        whereClauses.push(`year = $${paramCount++}`);
        values.push(parseInt(year));
      }
      if (month) {
        whereClauses.push(`month = $${paramCount++}`);
        values.push(parseInt(month));
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }

      query += ` ORDER BY year DESC, month DESC`;

      const result = await pool.query(query, values);

      // If including employee payrolls, fetch and attach them
      if (include_employee_payrolls === "true") {
        const payrollsWithEmployees = await Promise.all(
          result.rows.map(async (payroll) => {
            const employeePayrollsQuery = `
              SELECT ep.*, s.name as employee_name
              FROM greentarget.employee_payrolls ep
              LEFT JOIN public.staffs s ON ep.employee_id = s.id
              WHERE ep.monthly_payroll_id = $1
            `;
            const employeePayrollsResult = await pool.query(
              employeePayrollsQuery,
              [payroll.id]
            );
            return {
              ...payroll,
              employee_payrolls: employeePayrollsResult.rows,
            };
          })
        );
        return res.json(payrollsWithEmployees);
      }

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching GT monthly payrolls:", error);
      res.status(500).json({
        message: "Error fetching GT monthly payrolls",
        error: error.message,
      });
    }
  });

  // Get eligible employees for a payroll (based on work logs and driver trips)
  router.get("/:id/eligible-employees", async (req, res) => {
    const { id } = req.params;

    try {
      // Get payroll details
      const payrollResult = await pool.query(
        "SELECT year, month FROM greentarget.monthly_payrolls WHERE id = $1",
        [id]
      );

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      const { year, month } = payrollResult.rows[0];

      // Get GT payroll employees
      const gtEmployeesQuery = `
        SELECT pe.employee_id, pe.job_type
        FROM greentarget.payroll_employees pe
        WHERE pe.is_active = true
      `;
      const gtEmployeesResult = await pool.query(gtEmployeesQuery);

      // Group by job type
      const jobEmployeeMap = {};
      gtEmployeesResult.rows.forEach((row) => {
        if (!jobEmployeeMap[row.job_type]) {
          jobEmployeeMap[row.job_type] = [];
        }
        jobEmployeeMap[row.job_type].push(row.employee_id);
      });

      res.json({
        month,
        year,
        eligibleJobs: Object.keys(jobEmployeeMap),
        jobEmployeeMap,
      });
    } catch (error) {
      console.error("Error fetching eligible employees:", error);
      res.status(500).json({
        message: "Error fetching eligible employees",
        error: error.message,
      });
    }
  });

  // Get specific monthly payroll by ID
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const payrollQuery = `
        SELECT * FROM greentarget.monthly_payrolls WHERE id = $1
      `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      // Get employee payrolls
      const employeePayrollsQuery = `
        SELECT ep.*, s.name as employee_name
        FROM greentarget.employee_payrolls ep
        LEFT JOIN public.staffs s ON ep.employee_id = s.id
        WHERE ep.monthly_payroll_id = $1
      `;
      const employeePayrollsResult = await pool.query(employeePayrollsQuery, [id]);

      // Attach per-employee items + deductions so batch payslip printing has the
      // full data (mirrors Tien Hock's monthly GET).
      const epIds = employeePayrollsResult.rows.map((ep) => ep.id);
      let itemsByEp = {};
      let deductionsByEp = {};
      let midMonthByEmployee = {};
      if (epIds.length > 0) {
        const [itemsResult, deductionsResult, midMonthResult] = await Promise.all([
          pool.query(
            `SELECT pi.id, pi.employee_payroll_id, pi.pay_code_id, pi.description,
                    pi.rate, pi.rate_unit, pi.quantity, pi.amount, pi.is_manual,
                    pi.job_type, pi.work_log_type, pc.pay_type
             FROM greentarget.payroll_items pi
             LEFT JOIN public.pay_codes pc ON pi.pay_code_id = pc.id
             WHERE pi.employee_payroll_id = ANY($1)
             ORDER BY pi.id`,
            [epIds]
          ),
          pool.query(
            `SELECT pd.id, pd.employee_payroll_id, pd.deduction_type,
                    CAST(pd.employee_amount AS NUMERIC(10,2)) as employee_amount,
                    CAST(pd.employer_amount AS NUMERIC(10,2)) as employer_amount,
                    CAST(pd.wage_amount AS NUMERIC(10,2)) as wage_amount,
                    pd.rate_info
             FROM greentarget.payroll_deductions pd
             WHERE pd.employee_payroll_id = ANY($1)
             ORDER BY pd.deduction_type`,
            [epIds]
          ),
          pool.query(
            `SELECT employee_id, SUM(amount) AS amount
             FROM greentarget.mid_month_payrolls
             WHERE year = $1 AND month = $2
               AND LOWER(COALESCE(status, '')) <> 'cancelled'
             GROUP BY employee_id`,
            [payrollResult.rows[0].year, payrollResult.rows[0].month]
          ),
        ]);
        for (const item of itemsResult.rows) {
          (itemsByEp[item.employee_payroll_id] ||= []).push({
            ...item,
            rate: parseFloat(item.rate),
            quantity: parseFloat(item.quantity),
            amount: parseFloat(item.amount),
            is_manual: !!item.is_manual,
          });
        }
        for (const d of deductionsResult.rows) {
          (deductionsByEp[d.employee_payroll_id] ||= []).push({
            ...d,
            employee_amount: parseFloat(d.employee_amount),
            employer_amount: parseFloat(d.employer_amount),
            wage_amount: parseFloat(d.wage_amount),
          });
        }
        for (const midMonth of midMonthResult.rows) {
          midMonthByEmployee[midMonth.employee_id] = parseFloat(midMonth.amount);
        }
      }

      const employeePayrolls = employeePayrollsResult.rows.map((ep) => {
        const netPay = parseFloat(ep.net_pay);
        const jumlah = netPay - (midMonthByEmployee[ep.employee_id] || 0);
        const setelahDigenapkan = Math.ceil(jumlah);
        const digenapkan = Math.round((setelahDigenapkan - jumlah) * 100) / 100;

        return {
          ...ep,
          gross_pay: parseFloat(ep.gross_pay),
          net_pay: netPay,
          digenapkan,
          setelah_digenapkan: setelahDigenapkan,
          items: itemsByEp[ep.id] || [],
          deductions: deductionsByEp[ep.id] || [],
        };
      });

      res.json({
        ...payrollResult.rows[0],
        employeePayrolls,
      });
    } catch (error) {
      console.error("Error fetching GT monthly payroll details:", error);
      res.status(500).json({
        message: "Error fetching GT monthly payroll details",
        error: error.message,
      });
    }
  });

  // Create a new monthly payroll
  router.post("/", async (req, res) => {
    const { year, month, created_by } = req.body;

    if (!year || !month) {
      return res.status(400).json({ message: "Year and month are required" });
    }

    try {
      // Check if already exists
      const existingCheck = await pool.query(
        "SELECT id FROM greentarget.monthly_payrolls WHERE year = $1 AND month = $2",
        [year, month]
      );

      if (existingCheck.rows.length > 0) {
        return res.status(400).json({
          message: "Payroll for this month already exists",
          payroll: existingCheck.rows[0],
        });
      }

      const insertQuery = `
        INSERT INTO greentarget.monthly_payrolls (year, month, created_by)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const insertResult = await pool.query(insertQuery, [
        year,
        month,
        created_by || null,
      ]);

      res.status(201).json({
        message: "Monthly payroll created successfully",
        payroll: insertResult.rows[0],
      });
    } catch (error) {
      console.error("Error creating GT monthly payroll:", error);
      res.status(500).json({
        message: "Error creating GT monthly payroll",
        error: error.message,
      });
    }
  });

  // Process all selected employees
  router.post("/:id/process-all", async (req, res) => {
    const { id } = req.params;
    const { selected_employees = [] } = req.body;

    if (!selected_employees.length) {
      return res.status(400).json({ message: "No employees selected for processing" });
    }

    // 1. Get payroll details
    let year, month;
    try {
      const payrollResult = await pool.query(
        "SELECT year, month FROM greentarget.monthly_payrolls WHERE id = $1",
        [id]
      );
      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }
      ({ year, month } = payrollResult.rows[0]);
    } catch (error) {
      console.error("Error checking GT payroll status:", error);
      return res.status(500).json({
        success: false,
        message: "Error processing payroll",
        error: error.message,
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 2. Fetch all required data in parallel
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

      const [
        monthlyLogsResult,
        manualItemsResult,
        staffsResult,
        jobPayCodesResult,
        contributionRates,
        midMonthResult,
        commissionRecordsResult,
        othersRecordsResult,
        habukLinesResult,
        leaveRecordsResult,
      ] = await Promise.all([
        // Monthly work logs for OFFICE workers (from GT schema)
        client.query(`
          SELECT mwl.id, mwl.log_month, mwl.log_year, mwle.employee_id, mwle.job_id,
            mwle.total_hours, mwle.overtime_hours, mwle.worked_days,
            json_agg(json_build_object(
              'pay_code_id', mwla.pay_code_id,
              'description', pc.description,
              'pay_type', pc.pay_type,
              'rate_unit', pc.rate_unit,
              'ot_rate_mode', pc.ot_rate_mode,
              'rate_used', mwla.rate_used,
              'hours_applied', mwla.hours_applied,
              'calculated_amount', mwla.calculated_amount
            )) as activities
          FROM greentarget.monthly_work_logs mwl
          JOIN greentarget.monthly_work_log_entries mwle ON mwl.id = mwle.monthly_log_id
          LEFT JOIN greentarget.monthly_work_log_activities mwla ON mwla.monthly_entry_id = mwle.id
          LEFT JOIN public.pay_codes pc ON mwla.pay_code_id = pc.id
          WHERE mwl.log_month = $1 AND mwl.log_year = $2 AND mwl.status = 'Submitted'
          GROUP BY mwl.id, mwl.log_month, mwl.log_year, mwle.employee_id, mwle.job_id,
            mwle.total_hours, mwle.overtime_hours, mwle.worked_days
        `, [month, year]),

        // Existing manual items must remain part of gross/net/statutory totals
        // when a processed payroll is run again. The rows themselves are kept
        // in place and are not reinserted below.
        client.query(`
          SELECT ep.employee_id, pi.pay_code_id, pi.description, pi.rate,
                 pi.rate_unit, pi.quantity, pi.amount, pc.pay_type
          FROM greentarget.employee_payrolls ep
          JOIN greentarget.payroll_items pi ON pi.employee_payroll_id = ep.id
          LEFT JOIN public.pay_codes pc ON pc.id = pi.pay_code_id
          WHERE ep.monthly_payroll_id = $1 AND pi.is_manual = true
        `, [id]),

        // Staff data
        client.query(`
          SELECT id, name, birthdate, nationality, marital_status,
            spouse_employment_status, number_of_children,
            epf_age_override, epf_nationality_override,
            socso_age_override, sip_age_override, ot_pay_basis
          FROM public.staffs
        `),

        // Job pay codes for OFFICE and DRIVER
        client.query(`
          SELECT jpc.job_id, jpc.pay_code_id, jpc.is_default,
            jpc.override_rate_biasa, jpc.override_rate_ahad, jpc.override_rate_umum,
            pc.description, pc.pay_type, pc.rate_unit,
            CAST(pc.rate_biasa AS NUMERIC(10,2)) as rate_biasa,
            CAST(pc.rate_ahad AS NUMERIC(10,2)) as rate_ahad,
            CAST(pc.rate_umum AS NUMERIC(10,2)) as rate_umum
          FROM public.job_pay_codes jpc
          JOIN public.pay_codes pc ON jpc.pay_code_id = pc.id
          WHERE jpc.job_id IN ('OFFICE', 'DRIVER') AND pc.is_active = true
        `),

        // Contribution rates
        fetchActiveContributionRates(client),

        // Mid-month advances for this month (deducted before rounding)
        client.query(`
          SELECT employee_id, amount
          FROM greentarget.mid_month_payrolls
          WHERE year = $1 AND month = $2
            AND LOWER(COALESCE(status, '')) <> 'cancelled'
        `, [year, month]),

        // GT Bonus / Others (Advance) records for the month (commission_records)
        client.query(`
          SELECT employee_id, amount, description, is_advance
          FROM greentarget.commission_records
          WHERE DATE(commission_date) >= $1 AND DATE(commission_date) <= $2
        `, [startDate, endDate]),

        // GT Others (Kerja Luar OT) records for the month
        client.query(`
          SELECT orec.employee_id, orec.pay_code_id, orec.description,
                 orec.rate, orec.rate_unit, orec.quantity, orec.amount,
                 pc.pay_type
          FROM greentarget.others_records orec
          LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
          WHERE DATE(orec.record_date) >= $1 AND DATE(orec.record_date) <= $2
        `, [startDate, endDate]),

        // GT Daily Lori Habuk saved trip lines for the month (DRIVER pay source)
        client.query(`
          SELECT l.employee_id, to_char(l.log_date, 'YYYY-MM-DD') AS log_date,
                 ln.pay_code_id, ln.quantity, ln.rate_used,
                 ln.amount, ln.source_type, ln.rental_id, ln.description,
                 pc.pay_type, pc.rate_unit
          FROM greentarget.daily_lori_habuk_logs l
          JOIN greentarget.daily_lori_habuk_lines ln ON ln.log_id = l.id
          LEFT JOIN pay_codes pc ON ln.pay_code_id = pc.id
          WHERE l.log_date >= $1 AND l.log_date <= $2 AND l.status = 'Submitted'
        `, [startDate, endDate]),

        // GT approved leave for the month (GT leave ledger). amount_paid adds to
        // gross (and EPF base); DRIVER trip pay on a leave day is excluded.
        client.query(`
          SELECT employee_id, to_char(leave_date, 'YYYY-MM-DD') AS leave_date,
                 leave_type, CAST(amount_paid AS NUMERIC(10,2)) AS amount_paid
          FROM greentarget.leave_records
          WHERE leave_date >= $1 AND leave_date <= $2 AND status = 'approved'
        `, [startDate, endDate]),
      ]);

      // Build lookup maps
      const staffsMap = new Map(staffsResult.rows.map((s) => [s.id, s]));
      const { epfRates, socsoRates, sipRates, incomeTaxRates } = contributionRates;
      const midMonthMap = new Map(
        midMonthResult.rows.map((r) => [r.employee_id, parseFloat(r.amount)])
      );

      // Preserve existing manual items in reprocessing calculations. Non-manual
      // source rows are rebuilt below, while these database rows stay untouched.
      const manualItemsByEmployee = {};
      manualItemsResult.rows.forEach((item) => {
        if (!manualItemsByEmployee[item.employee_id]) {
          manualItemsByEmployee[item.employee_id] = [];
        }
        manualItemsByEmployee[item.employee_id].push({
          ...item,
          rate: parseFloat(item.rate),
          quantity: parseFloat(item.quantity),
          amount: parseFloat(item.amount),
          is_manual: true,
        });
      });

      // GT earning add-ons grouped by employee (Bonus/Advance + Kerja Luar OT)
      const commissionsByEmployee = {};
      commissionRecordsResult.rows.forEach((r) => {
        if (!commissionsByEmployee[r.employee_id]) {
          commissionsByEmployee[r.employee_id] = [];
        }
        commissionsByEmployee[r.employee_id].push(r);
      });
      const othersByEmployee = {};
      othersRecordsResult.rows.forEach((r) => {
        if (!othersByEmployee[r.employee_id]) {
          othersByEmployee[r.employee_id] = [];
        }
        othersByEmployee[r.employee_id].push(r);
      });

      // GT Daily Lori Habuk saved trip lines grouped by driver (DRIVER pay source)
      const habukLinesByDriver = {};
      habukLinesResult.rows.forEach((r) => {
        if (!habukLinesByDriver[r.employee_id]) {
          habukLinesByDriver[r.employee_id] = [];
        }
        habukLinesByDriver[r.employee_id].push(r);
      });

      // GT approved leave grouped by employee (amount_paid adds to gross)
      const leaveByEmployee = {};
      leaveRecordsResult.rows.forEach((r) => {
        if (!leaveByEmployee[r.employee_id]) {
          leaveByEmployee[r.employee_id] = [];
        }
        leaveByEmployee[r.employee_id].push(r);
      });

      // Build job pay codes map
      const jobPayCodesMap = {};
      jobPayCodesResult.rows.forEach((row) => {
        if (!jobPayCodesMap[row.job_id]) {
          jobPayCodesMap[row.job_id] = [];
        }
        jobPayCodesMap[row.job_id].push(row);
      });

      // July 2026+ OT salary formula state (see src/routes/payroll/otFormula.js)
      const otFormulaActive = isOTFormulaEffective(year, month);

      // Process work logs into items per employee. Also collect the per-entry
      // Worked Days input (actual_days divisor for monthly-logged staff).
      const workLogsByEmployee = {};
      const monthlyWorkedDaysByEmployee = new Map();
      monthlyLogsResult.rows.forEach((log) => {
        const key = log.employee_id;
        if (!workLogsByEmployee[key]) {
          workLogsByEmployee[key] = { items: [] };
        }
        if (log.worked_days != null) {
          const days = parseFloat(log.worked_days);
          if (Number.isFinite(days)) {
            monthlyWorkedDaysByEmployee.set(
              key,
              Math.max(monthlyWorkedDaysByEmployee.get(key) || 0, days)
            );
          }
        }
        (log.activities || []).filter((a) => a.pay_code_id).forEach((activity) => {
          const qty =
            activity.rate_unit === "Hour"
              ? parseFloat(activity.hours_applied) || 0
              : 1;
          workLogsByEmployee[key].items.push({
            pay_code_id: activity.pay_code_id,
            description: activity.description || "",
            pay_type: activity.pay_type || "Tambahan",
            rate: parseFloat(activity.rate_used) || 0,
            rate_unit: activity.rate_unit || "Fixed",
            quantity: qty,
            amount: parseFloat(activity.calculated_amount) || 0,
            work_log_id: log.id,
            work_log_type: "monthly",
            ot_rate_mode: activity.ot_rate_mode || null,
          });
        });
      });

      // 3. Process each selected employee
      const processedPayrolls = [];
      const errors = [];

      for (const { employeeId, jobType } of selected_employees) {
        try {
          const staff = staffsMap.get(employeeId);
          if (!staff) {
            errors.push({ employeeId, error: "Staff not found" });
            continue;
          }

          const combinedItems = [];

          if (jobType === "OFFICE") {
            // Get work log items for OFFICE workers
            const workData = workLogsByEmployee[employeeId];
            if (workData && workData.items) {
              workData.items.forEach((item) => {
                combinedItems.push({
                  ...item,
                  job_type: "OFFICE",
                  source_employee_id: employeeId,
                  is_manual: false,
                  amount: Math.round(item.amount * 100) / 100,
                });
              });
            }
          } else if (jobType === "DRIVER") {
            // DRIVER trip pay now comes from the saved Daily Lori Habuk log for
            // the month (Phase 3). Rentals only prefill that daily entry; they no
            // longer feed processing directly. A driver with no submitted daily
            // log earns base salary only (see the base-salary block below).
            const habukLines = habukLinesByDriver[employeeId] || [];
            for (const line of habukLines) {
              combinedItems.push({
                pay_code_id: line.pay_code_id,
                description: line.description || line.pay_code_id,
                pay_type: line.pay_type || "Tambahan",
                rate: parseFloat(line.rate_used) || 0,
                rate_unit: line.rate_unit || "Trip",
                quantity: parseFloat(line.quantity) || 0,
                amount: Math.round(parseFloat(line.amount) * 100) / 100,
                job_type: "DRIVER",
                source_employee_id: employeeId,
                source_date: line.log_date || null,
                is_manual: false,
                rental_id: line.rental_id || null,
                work_log_type: "daily_habuk",
              });
            }

            // Also check for base salary pay code for drivers
            const driverPayCodes = jobPayCodesMap["DRIVER"] || [];
            const baseSalaryCode = driverPayCodes.find(
              (pc) => pc.pay_type === "Base" && pc.rate_unit === "Month"
            );
            if (baseSalaryCode) {
              const rate = baseSalaryCode.override_rate_biasa || baseSalaryCode.rate_biasa || 0;
              if (rate > 0) {
                combinedItems.push({
                  pay_code_id: baseSalaryCode.pay_code_id,
                  description: baseSalaryCode.description,
                  pay_type: "Base",
                  rate: rate,
                  rate_unit: "Month",
                  quantity: 1,
                  amount: rate,
                  job_type: "DRIVER",
                  source_employee_id: employeeId,
                  is_manual: false,
                });
              }
            }
          }

          // Manual items survive reprocessing and must participate in the same
          // gross/statutory/net calculation as newly rebuilt source items.
          for (const manualItem of manualItemsByEmployee[employeeId] || []) {
            combinedItems.push(manualItem);
          }

          // Earning add-ons: Bonus / Others (Advance) (commission_records) and
          // Others (Kerja Luar OT) (others_records). All raise gross (and the
          // EPF base via Tambahan/Base typing, mirroring Tien Hock). Only
          // commission records flagged is_advance are deducted from net.
          let commissionAdvanceTotal = 0;
          for (const cr of commissionsByEmployee[employeeId] || []) {
            const amt = Math.round(parseFloat(cr.amount) * 100) / 100;
            combinedItems.push({
              pay_code_id: null,
              description: cr.description || (cr.is_advance ? "Advance" : "Bonus"),
              pay_type: "Tambahan",
              rate: amt,
              rate_unit: "Fixed",
              quantity: 1,
              amount: amt,
              job_type: jobType,
              source_employee_id: employeeId,
              is_manual: false,
              work_log_type: cr.is_advance ? "advance" : "bonus",
            });
            if (cr.is_advance) commissionAdvanceTotal += amt;
          }
          for (const orec of othersByEmployee[employeeId] || []) {
            const amt = Math.round(parseFloat(orec.amount) * 100) / 100;
            combinedItems.push({
              pay_code_id: orec.pay_code_id || null,
              description: orec.description || "Others",
              pay_type: orec.pay_type || "Tambahan",
              rate: parseFloat(orec.rate),
              rate_unit: orec.rate_unit,
              quantity: parseFloat(orec.quantity),
              amount: amt,
              job_type: jobType,
              source_employee_id: employeeId,
              is_manual: false,
              work_log_type: "others",
            });
          }

          // Leave (GT ledger): amount_paid adds to gross + EPF base; a DRIVER's
          // trip pay on a leave day is excluded (the day is paid via leave),
          // mirroring TH/JP.
          const empLeaveRecords = leaveByEmployee[employeeId] || [];
          const leaveGrossCents = empLeaveRecords.reduce(
            (sum, r) => sum + Math.round(parseFloat(r.amount_paid) * 100),
            0
          );
          const leaveDateSet = new Set(
            empLeaveRecords.map((r) => `${r.employee_id}|${r.leave_date}`)
          );
          const isLeaveDayItem = (item) =>
            item.job_type === "DRIVER" &&
            item.source_date &&
            leaveDateSet.has(`${item.source_employee_id}|${item.source_date}`);
          const payableItems = combinedItems.filter((item) => !isLeaveDayItem(item));

          // July 2026+ OT salary formula: derive this month's OT rates from
          // earned non-OT wages and reprice formula-scope OT items BEFORE
          // gross/EPF/net (docs/PAYROLL_OT_CALCULATION_BREAKDOWN.md). GT OFFICE
          // has a single OT bucket, so formula OT is priced at the 1.5 Biasa
          // rate. Bonus rows are excluded from the numerator; Advance rows
          // (earned pay taken early) are included. Manual and 'fixed'-mode OT
          // items keep their keyed values.
          let otCalculationSnapshot = null;
          if (otFormulaActive) {
            const formulaOTItems = combinedItems.filter(
              (item) =>
                isFormulaOTItem(item, null) &&
                item.ot_rate_mode !== "fixed" &&
                // Kerja Luar OT records are user-keyed: their keyed rate wins
                // (decision 16); they stay classified as OT (excluded from the
                // numerator/EPF) but are never repriced.
                item.work_log_type !== "others" &&
                (parseFloat(item.quantity) || 0) > 0
            );
            if (formulaOTItems.length > 0) {
              // Paid leave is EXCLUDED from the numerator — HR prices leave
              // FROM the derived daily rate (HR model "RAMBU").
              const numeratorBreakdownCents = {
                work_items: payableItems.reduce(
                  (sum, item) =>
                    (item.pay_type || "Tambahan") !== "Overtime" &&
                    item.work_log_type !== "bonus"
                      ? sum + Math.round(item.amount * 100)
                      : sum,
                  0
                ),
              };
              const numeratorCents = Object.values(
                numeratorBreakdownCents
              ).reduce((a, b) => a + b, 0);

              // Derive the divisor sources FIRST; the basis then resolves as:
              // explicit staff override > actual days (habuk attendance dates
              // or a Worked Days input) > monthly-logged default (÷26).
              // Attendance dates: submitted Daily Lori Habuk logs (DRIVER),
              // excluding leave days; monthly-logged staff use the Worked
              // Days input on the monthly work log or default to ÷26.
              const habukDates = new Set(
                (habukLinesByDriver[employeeId] || [])
                  .map((line) => line.log_date)
                  .filter(
                    (d) => d && !leaveDateSet.has(`${employeeId}|${d}`)
                  )
              );
              const monthlyInput =
                monthlyWorkedDaysByEmployee.get(employeeId) ?? null;
              let workedDays = null;
              let workedDaysSource = null;
              if (habukDates.size > 0 && monthlyInput != null) {
                workedDays = Math.max(habukDates.size, monthlyInput);
                workedDaysSource = "attendance+monthly_input";
              } else if (monthlyInput != null) {
                workedDays = monthlyInput;
                workedDaysSource = "monthly_input";
              } else if (habukDates.size > 0) {
                workedDays = habukDates.size;
                workedDaysSource = "attendance";
              }
              const payBasis = resolveOTPayBasis(staff.ot_pay_basis, {
                hasWorkedDaySource: workedDays != null,
                isMonthlyLogged: Boolean(workLogsByEmployee[employeeId]),
              });

              const otRates = computeOTRates({
                payBasis,
                numeratorCents,
                workedDays,
              });
              if (!otRates.ok) {
                // Decision 15: block this employee with an actionable error.
                errors.push({
                  employeeId,
                  employeeName: staff.name,
                  error: `Kiraan kadar OT disekat: ${otRates.errors.join(" ")}`,
                });
                continue;
              }

              formulaOTItems.forEach((item) => {
                const rate =
                  otRateCentsForDayType(otRates.rateCents, "Biasa") / 100;
                item.rate = rate;
                item.amount =
                  Math.round(rate * (parseFloat(item.quantity) || 0) * 100) /
                  100;
              });

              otCalculationSnapshot = buildOTSnapshot({
                payBasis,
                numeratorCents,
                numeratorBreakdownCents,
                excludedLeaveCents: leaveGrossCents,
                excludedBonusCents: payableItems.reduce(
                  (sum, item) =>
                    item.work_log_type === "bonus"
                      ? sum + Math.round(item.amount * 100)
                      : sum,
                  0
                ),
                excludedOtCents: payableItems.reduce(
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

          // Calculate gross pay in integer cents to avoid float drift
          const grossPayCents =
            leaveGrossCents +
            payableItems.reduce(
              (sum, item) => sum + Math.round(item.amount * 100),
              0
            );
          const grossPay = grossPayCents / 100;

          // Group items by pay type for EPF calculation (EPF base excludes Overtime)
          const groupedItems = { Base: [], Tambahan: [], Overtime: [] };
          payableItems.forEach((item) => {
            const type = item.pay_type || "Tambahan";
            if (!groupedItems[type]) groupedItems[type] = [];
            groupedItems[type].push(item);
          });

          const epfGrossPayCents =
            leaveGrossCents +
            groupedItems.Base.reduce((s, i) => s + Math.round(i.amount * 100), 0) +
            groupedItems.Tambahan.reduce((s, i) => s + Math.round(i.amount * 100), 0);
          const epfGrossPay = epfGrossPayCents / 100;

          const deductions = calculateGTStatutoryDeductions({
            staff,
            grossPay,
            epfGrossPay,
            year,
            month,
            epfRates,
            socsoRates,
            sipRates,
            incomeTaxRates,
          });

          // Calculate net pay
          const totalEmployeeDeductions = deductions.reduce(
            (sum, d) => sum + d.employee_amount,
            0
          );
          // Commission/Bonus advances are deducted from net (Bonus and Kerja
          // Luar OT raise net; only is_advance commission records reduce it).
          const netPay =
            Math.round(
              (grossPay - totalEmployeeDeductions - commissionAdvanceTotal) * 100
            ) / 100;

          // Mid-month advance + rounding (digenapkan), mirroring Tien Hock payroll
          const midMonthAmount = midMonthMap.get(employeeId) || 0;
          const jumlah = netPay - midMonthAmount;
          const setelahDigenapkan = Math.ceil(jumlah);
          const digenapkan = setelahDigenapkan - jumlah;

          // 4. Save to database
          const existingPayroll = await client.query(
            `SELECT id FROM greentarget.employee_payrolls
             WHERE monthly_payroll_id = $1 AND employee_id = $2`,
            [id, employeeId]
          );

          let employeePayrollId;

          if (existingPayroll.rows.length > 0) {
            employeePayrollId = existingPayroll.rows[0].id;
            // Update existing
            await client.query(
              `UPDATE greentarget.employee_payrolls
               SET gross_pay = $1, net_pay = $2, digenapkan = $3, setelah_digenapkan = $4,
                   job_type = $5, section = $6, ot_calculation = $7
               WHERE id = $8`,
              [
                grossPay.toFixed(2),
                netPay.toFixed(2),
                digenapkan.toFixed(2),
                setelahDigenapkan.toFixed(2),
                jobType,
                jobType,
                otCalculationSnapshot
                  ? JSON.stringify(otCalculationSnapshot)
                  : null,
                employeePayrollId,
              ]
            );
            // Delete existing items and deductions
            await client.query(
              "DELETE FROM greentarget.payroll_items WHERE employee_payroll_id = $1 AND is_manual = false",
              [employeePayrollId]
            );
            await client.query(
              "DELETE FROM greentarget.payroll_deductions WHERE employee_payroll_id = $1",
              [employeePayrollId]
            );
          } else {
            // Create new
            const insertResult = await client.query(
              `INSERT INTO greentarget.employee_payrolls
               (monthly_payroll_id, employee_id, job_type, section, gross_pay, net_pay,
                digenapkan, setelah_digenapkan, ot_calculation)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
              [
                id,
                employeeId,
                jobType,
                jobType,
                grossPay.toFixed(2),
                netPay.toFixed(2),
                digenapkan.toFixed(2),
                setelahDigenapkan.toFixed(2),
                otCalculationSnapshot
                  ? JSON.stringify(otCalculationSnapshot)
                  : null,
              ]
            );
            employeePayrollId = insertResult.rows[0].id;
          }

          // Insert payroll items (leave-day driver items already excluded)
          const nonManualItems = payableItems.filter((item) => !item.is_manual);
          for (const item of nonManualItems) {
            await client.query(
              `INSERT INTO greentarget.payroll_items
               (employee_payroll_id, pay_code_id, description, rate, rate_unit, quantity, amount, is_manual, job_type, source_employee_id, work_log_id, work_log_type)
               VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11)`,
              [
                employeePayrollId,
                item.pay_code_id,
                item.description || "",
                item.rate,
                item.rate_unit,
                item.quantity,
                item.amount,
                item.job_type || null,
                item.source_employee_id || null,
                item.work_log_id || null,
                item.work_log_type || null,
              ]
            );
          }

          // Insert deductions
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

          processedPayrolls.push({
            employeeId,
            employeeName: staff.name,
            grossPay: Math.round(grossPay * 100) / 100,
            netPay: Math.round(netPay * 100) / 100,
          });
        } catch (error) {
          console.error("Error processing employee:", employeeId, error);
          errors.push({ employeeId, error: error.message });
          if (error.code) {
            throw error;
          }
        }
      }

      // Prune payrolls for employees no longer selected (e.g. removed from the
      // GT employee list), so they don't linger after re-processing
      const selectedEmployeeIds = selected_employees.map((s) => s.employeeId);
      const orphanResult = await client.query(
        `SELECT id FROM greentarget.employee_payrolls
         WHERE monthly_payroll_id = $1 AND NOT (employee_id = ANY($2))`,
        [id, selectedEmployeeIds]
      );
      if (orphanResult.rows.length > 0) {
        const orphanIds = orphanResult.rows.map((r) => r.id);
        await client.query(
          "DELETE FROM greentarget.payroll_items WHERE employee_payroll_id = ANY($1)",
          [orphanIds]
        );
        await client.query(
          "DELETE FROM greentarget.payroll_deductions WHERE employee_payroll_id = ANY($1)",
          [orphanIds]
        );
        await client.query(
          "DELETE FROM greentarget.employee_payrolls WHERE id = ANY($1)",
          [orphanIds]
        );
      }

      // Update timestamp
      const serverTimestamp = new Date().toISOString();
      await client.query(
        "UPDATE greentarget.monthly_payrolls SET updated_at = $1 WHERE id = $2",
        [serverTimestamp, id]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        processed_count: processedPayrolls.length,
        errors,
        updated_at: serverTimestamp,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error in GT payroll processing:", error);
      res.status(500).json({
        success: false,
        message: "Error processing payroll",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Delete monthly payroll
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const checkResult = await pool.query(
        "SELECT id FROM greentarget.monthly_payrolls WHERE id = $1",
        [id]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      // Delete (cascade will handle child records)
      const result = await pool.query(
        "DELETE FROM greentarget.monthly_payrolls WHERE id = $1 RETURNING *",
        [id]
      );

      res.json({
        message: "Monthly payroll deleted successfully",
        payroll: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting GT monthly payroll:", error);
      res.status(500).json({
        message: "Error deleting monthly payroll",
        error: error.message,
      });
    }
  });

  return router;
}
