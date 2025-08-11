// src/routes/payroll/employee-payrolls.js
import { Router } from "express";

// Moved to top-level to be reusable
const saveDeductions = async (pool, employeePayrollId, deductions) => {
  if (!deductions || deductions.length === 0) {
    // If no deductions, just ensure none exist in the DB for this payroll
    await pool.query(
      "DELETE FROM payroll_deductions WHERE employee_payroll_id = $1",
      [employeePayrollId]
    );
    return;
  }

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

/**
 * Recalculates and updates an employee's entire payroll (gross pay, deductions, net pay)
 * based on their current payroll items. This function contains all necessary business logic
 * ported from the client-side services to ensure server-side data integrity.
 * @param {any} pool - The database connection pool.
 * @param {number} employeePayrollId - The ID of the employee payroll to recalculate.
 */
const recalculateAndUpdatePayroll = async (pool, employeePayrollId) => {
  await pool.query("BEGIN");
  try {
    // 1. FETCH ALL NECESSARY DATA
    // Get employee_id from the payroll
    const payrollDetails = await pool.query(
      "SELECT employee_id FROM employee_payrolls WHERE id = $1",
      [employeePayrollId]
    );
    if (payrollDetails.rows.length === 0)
      throw new Error("Employee payroll not found");
    const { employee_id } = payrollDetails.rows[0];

    // Get employee's info (birthdate, nationality, marital status, spouse employment status, number of children)
    const employeeInfoRes = await pool.query(
      "SELECT birthdate, nationality, marital_status, spouse_employment_status, number_of_children FROM staffs WHERE id = $1",
      [employee_id]
    );
    if (employeeInfoRes.rows.length === 0)
      throw new Error(`Employee ${employee_id} not found`);
    const employeeInfo = employeeInfoRes.rows[0];

    // Get all current payroll items
    const itemsRes = await pool.query(
      `
      SELECT pi.*, pc.pay_type
      FROM payroll_items pi
      LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
      WHERE pi.employee_payroll_id = $1
    `,
      [employeePayrollId]
    );
    const payrollItems = itemsRes.rows.map((item) => ({
      ...item,
      amount: parseFloat(item.amount),
    }));

    // Get employee payroll details to fetch year and month for leave records
    const payrollInfoRes = await pool.query(
      `
      SELECT ep.employee_id, mp.year, mp.month
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      WHERE ep.id = $1
    `,
      [employeePayrollId]
    );
    
    if (payrollInfoRes.rows.length === 0) {
      throw new Error("Employee payroll not found");
    }
    
    const { year, month } = payrollInfoRes.rows[0];

    // Get leave records for this employee for the specific month/year
    const leaveRecordsRes = await pool.query(
      `
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
      ORDER BY leave_date ASC
    `,
      [employee_id, year, month]
    );
    
    const leaveRecords = leaveRecordsRes.rows.map((record) => ({
      ...record,
      days_taken: parseFloat(record.days_taken),
      amount_paid: parseFloat(record.amount_paid || 0),
    }));

    // Get commission records for this employee for the specific month/year
    const commissionRecordsRes = await pool.query(
      `
      SELECT amount, description
      FROM commission_records
      WHERE employee_id = $1
        AND DATE(commission_date) >= $2
        AND DATE(commission_date) <= $3
      ORDER BY commission_date DESC
    `,
      [
        employee_id,
        `${year}-${month.toString().padStart(2, "0")}-01`,
        `${year}-${month.toString().padStart(2, "0")}-${new Date(year, month, 0).getDate().toString().padStart(2, "0")}`
      ]
    );
    
    const commissionRecords = commissionRecordsRes.rows.map((record) => ({
      ...record,
      amount: parseFloat(record.amount || 0),
    }));

    // Get all active contribution rates
    const [epfRatesRes, socsoRatesRes, sipRatesRes, incomeTaxRatesRes] =
      await Promise.all([
        pool.query("SELECT * FROM epf_rates WHERE is_active = true"),
        pool.query(
          "SELECT * FROM socso_rates WHERE is_active = true ORDER BY wage_from"
        ),
        pool.query(
          "SELECT * FROM sip_rates WHERE is_active = true ORDER BY wage_from"
        ),
        pool.query(
          "SELECT * FROM income_tax_rates WHERE is_active = true ORDER BY wage_from"
        ), // Add this
      ]);
    const epfRates = epfRatesRes.rows;
    const socsoRates = socsoRatesRes.rows;
    const sipRates = sipRatesRes.rows;
    const incomeTaxRates = incomeTaxRatesRes.rows;

    // 2. PERFORM CALCULATIONS (Server-side implementation of client logic)

    // --- Calculation Helpers ---
    const getEmployeeType = (nationality, age) => {
      const isLocal = (nationality || "").toLowerCase() === "malaysian";
      if (isLocal && age < 60) return "local_under_60";
      if (isLocal && age >= 60) return "local_over_60";
      if (!isLocal && age < 60) return "foreign_under_60";
      return "foreign_over_60";
    };

    const findEPFRate = (rates, type, wage) => {
      const applicable = rates.filter((r) => r.employee_type === type);
      if (!applicable.length) return null;
      if (type.startsWith("local_")) {
        const over = applicable.find((r) => r.wage_threshold === null);
        const under = applicable.find((r) => r.wage_threshold !== null);
        return under && wage <= parseFloat(under.wage_threshold)
          ? under
          : over || null;
      }
      return applicable[0];
    };

    const findRateByWage = (rates, wage) =>
      rates.find(
        (r) => wage >= parseFloat(r.wage_from) && wage <= parseFloat(r.wage_to)
      ) || null;

    const getEPFWageCeiling = (wageAmount) => {
      if (wageAmount <= 10) return 0;
      if (wageAmount <= 20) return 20;
      if (wageAmount <= 5000) return Math.ceil(wageAmount / 20) * 20;
      return 5000 + Math.ceil((wageAmount - 5000) / 100) * 100;
    };

    // --- Main Calculation Logic ---
    const workGrossPay = payrollItems.reduce((sum, item) => sum + item.amount, 0);
    const leaveGrossPay = leaveRecords.reduce((sum, record) => sum + record.amount_paid, 0);
    const commissionGrossPay = commissionRecords.reduce((sum, record) => sum + record.amount, 0);
    const grossPay = workGrossPay + leaveGrossPay + commissionGrossPay;

    const groupedItems = payrollItems.reduce(
      (acc, item) => {
        const type = item.pay_type || "Tambahan"; // Default to Tambahan
        if (!acc[type]) acc[type] = [];
        acc[type].push(item);
        return acc;
      },
      { Base: [], Tambahan: [], Overtime: [] }
    );

    const epfGrossPay =
      (groupedItems.Base?.reduce((s, i) => s + i.amount, 0) || 0) +
      (groupedItems.Tambahan?.reduce((s, i) => s + i.amount, 0) || 0) +
      leaveGrossPay +
      commissionGrossPay;

    const age = Math.floor(
      (Date.now() - new Date(employeeInfo.birthdate).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000)
    );
    const employeeType = getEmployeeType(
      employeeInfo.nationality || "Malaysian",
      age
    );

    const deductions = [];

    // Calculate EPF
    const epfRate = findEPFRate(epfRates, employeeType, epfGrossPay);
    if (epfRate) {
      const wageCeiling = getEPFWageCeiling(epfGrossPay);
      if (wageCeiling > 0) {
        const employeeContribution = Math.ceil(
          (wageCeiling * parseFloat(epfRate.employee_rate_percentage)) / 100
        );
        const employerContribution =
          epfRate.employer_rate_percentage !== null
            ? Math.ceil(
                (wageCeiling * parseFloat(epfRate.employer_rate_percentage)) /
                  100
              )
            : parseFloat(epfRate.employer_fixed_amount);

        deductions.push({
          deduction_type: "epf",
          employee_amount: employeeContribution || 0,
          employer_amount: employerContribution || 0,
          wage_amount: epfGrossPay,
          rate_info: {
            rate_id: epfRate.id,
            employee_rate: `${epfRate.employee_rate_percentage}%`,
            employer_rate: epfRate.employer_rate_percentage
              ? `${epfRate.employer_rate_percentage}%`
              : `RM${epfRate.employer_fixed_amount}`,
            age_group: employeeType,
            wage_ceiling_used: wageCeiling,
          },
        });
      }
    }

    // Calculate SOCSO
    const socsoRate = findRateByWage(socsoRates, grossPay);
    if (socsoRate) {
      const isOver60 = age >= 60;
      const employee_amount = isOver60
        ? 0
        : parseFloat(socsoRate.employee_rate);
      const employer_amount = isOver60
        ? parseFloat(socsoRate.employer_rate_over_60)
        : parseFloat(socsoRate.employer_rate);

      deductions.push({
        deduction_type: "socso",
        employee_amount: employee_amount || 0,
        employer_amount: employer_amount || 0,
        wage_amount: grossPay,
        rate_info: {
          rate_id: socsoRate.id,
          employee_rate: isOver60 ? "RM0.00" : `RM${socsoRate.employee_rate}`,
          employer_rate: isOver60
            ? `RM${socsoRate.employer_rate_over_60}`
            : `RM${socsoRate.employer_rate}`,
          age_group: isOver60 ? "60_and_above" : "under_60",
        },
      });
    }

    // Calculate SIP
    if (age < 60) {
      const sipRate = findRateByWage(sipRates, grossPay);
      if (sipRate) {
        deductions.push({
          deduction_type: "sip",
          employee_amount: parseFloat(sipRate.employee_rate) || 0,
          employer_amount: parseFloat(sipRate.employer_rate) || 0,
          wage_amount: grossPay,
          rate_info: {
            rate_id: sipRate.id,
            employee_rate: `RM${sipRate.employee_rate}`,
            employer_rate: `RM${sipRate.employer_rate}`,
            age_group: "under_60",
          },
        });
      }
    }

    // Calculate Income Tax
    const incomeTaxRate = incomeTaxRates.find(
      (rate) =>
        grossPay >= parseFloat(rate.wage_from) &&
        grossPay <= parseFloat(rate.wage_to)
    );

    if (incomeTaxRate) {
      const maritalStatus = employeeInfo.maritalStatus || "Single";
      const spouseEmploymentStatus =
        employeeInfo.spouseEmploymentStatus || null;
      const numberOfChildren = employeeInfo.numberOfChildren || 0;

      // Determine applicable rate
      let applicableRate = parseFloat(incomeTaxRate.base_rate);

      // Single employees use base rate
      if (maritalStatus === "Single") {
        applicableRate = parseFloat(incomeTaxRate.base_rate);
      } else if (maritalStatus === "Married") {
        // Married employees use K rates based on number of children and spouse status
        const childrenKey = Math.min(numberOfChildren, 10);

        if (spouseEmploymentStatus === "Unemployed") {
          const unemployedKey = `unemployed_spouse_k${childrenKey}`;
          applicableRate =
            parseFloat(incomeTaxRate[unemployedKey]) || applicableRate;
        } else if (spouseEmploymentStatus === "Employed") {
          const employedKey = `employed_spouse_k${childrenKey}`;
          applicableRate =
            parseFloat(incomeTaxRate[employedKey]) || applicableRate;
        }
        // If spouse employment status is not specified for married employees,
        // fallback to base rate (though this should ideally not happen)
      }

      // Build tax category string
      let taxCategory = maritalStatus;
      if (maritalStatus === "Married") {
        const childrenCount = Math.min(numberOfChildren, 10);
        taxCategory += `-K${childrenCount}`;
        if (spouseEmploymentStatus) {
          taxCategory += `-${spouseEmploymentStatus}`;
        }
      }

      if (applicableRate > 0) {
        deductions.push({
          deduction_type: "income_tax",
          employee_amount: applicableRate,
          employer_amount: 0,
          wage_amount: grossPay,
          rate_info: {
            rate_id: incomeTaxRate.id,
            employee_rate: `RM${applicableRate}`,
            employer_rate: "RM0.00",
            tax_category: taxCategory,
          },
        });
      }
    }

    // 3. UPDATE DATABASE
    const totalEmployeeDeductions = deductions.reduce(
      (sum, d) => sum + d.employee_amount,
      0
    );
    // Commission amounts are deducted as advance payments
    const totalCommissionDeductions = commissionGrossPay;
    const netPay = grossPay - totalEmployeeDeductions - totalCommissionDeductions;

    // Update gross pay and net pay
    await pool.query(
      `UPDATE employee_payrolls SET gross_pay = $1, net_pay = $2 WHERE id = $3`,
      [grossPay.toFixed(2), netPay.toFixed(2), employeePayrollId]
    );

    // Save the newly calculated deductions
    await saveDeductions(pool, employeePayrollId, deductions);

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    // Re-throw the error to be caught by the route handler's catch block
    console.error("Error during payroll recalculation:", error);
    throw error;
  }
};

export default function (pool) {
  const router = Router();

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

      // Get all leave records for these payrolls in a single query
      const leaveRecordsQuery = `
      SELECT 
        ep.id as employee_payroll_id,
        to_char(lr.leave_date, 'YYYY-MM-DD') as date,
        lr.leave_type,
        lr.days_taken,
        lr.amount_paid
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      JOIN leave_records lr ON ep.employee_id = lr.employee_id
      WHERE ep.id = ANY($1)
        AND EXTRACT(YEAR FROM lr.leave_date) = mp.year
        AND EXTRACT(MONTH FROM lr.leave_date) = mp.month
        AND lr.status = 'approved'
      ORDER BY ep.id, lr.leave_date ASC
    `;
      const leaveRecordsResult = await pool.query(leaveRecordsQuery, [payrollIds]);

      // Group leave records by employee_payroll_id
      const leaveRecordsByPayrollId = leaveRecordsResult.rows.reduce(
        (acc, record) => {
          if (!acc[record.employee_payroll_id]) {
            acc[record.employee_payroll_id] = [];
          }
          acc[record.employee_payroll_id].push({
            date: record.date,
            leave_type: record.leave_type,
            days_taken: parseFloat(record.days_taken),
            amount_paid: parseFloat(record.amount_paid || 0),
          });
          return acc;
        },
        {}
      );

      // Get all mid-month payrolls for these payrolls in a single query
      const midMonthQuery = `
      SELECT 
        ep.id as employee_payroll_id,
        mmp.*,
        s.name as employee_name
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      JOIN mid_month_payrolls mmp ON ep.employee_id = mmp.employee_id AND mp.year = mmp.year AND mp.month = mmp.month
      LEFT JOIN staffs s ON mmp.employee_id = s.id
      WHERE ep.id = ANY($1)
      ORDER BY ep.id
    `;
      const midMonthResult = await pool.query(midMonthQuery, [payrollIds]);

      // Group mid-month payrolls by employee_payroll_id
      const midMonthByPayrollId = midMonthResult.rows.reduce(
        (acc, record) => {
          acc[record.employee_payroll_id] = {
            ...record,
            amount: parseFloat(record.amount)
          };
          delete acc[record.employee_payroll_id].employee_payroll_id;
          return acc;
        },
        {}
      );

      // Get all commission records for these payrolls in a single query
      const commissionsQuery = `
      SELECT 
        ep.id as employee_payroll_id,
        cr.*,
        s.name as employee_name
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      JOIN commission_records cr ON ep.employee_id = cr.employee_id
      JOIN staffs s ON cr.employee_id = s.id
      WHERE ep.id = ANY($1)
        AND EXTRACT(YEAR FROM cr.commission_date) = mp.year
        AND EXTRACT(MONTH FROM cr.commission_date) = mp.month
      ORDER BY ep.id, cr.commission_date DESC
    `;
      const commissionsResult = await pool.query(commissionsQuery, [payrollIds]);

      // Group commission records by employee_payroll_id
      const commissionsByPayrollId = commissionsResult.rows.reduce(
        (acc, record) => {
          if (!acc[record.employee_payroll_id]) {
            acc[record.employee_payroll_id] = [];
          }
          const commissionRecord = { ...record };
          delete commissionRecord.employee_payroll_id;
          acc[record.employee_payroll_id].push({
            ...commissionRecord,
            amount: parseFloat(commissionRecord.amount)
          });
          return acc;
        },
        {}
      );

      // Merge payrolls with their items, deductions, leave records, mid-month payrolls, and commission records
      const response = payrollsResult.rows.map((payroll) => ({
        ...payroll,
        items: itemsByPayrollId[payroll.id] || [],
        deductions: deductionsByPayrollId[payroll.id] || [],
        leave_records: leaveRecordsByPayrollId[payroll.id] || [],
        mid_month_payroll: midMonthByPayrollId[payroll.id] || null,
        commission_records: commissionsByPayrollId[payroll.id] || [],
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

  // Get comprehensive employee payroll details with all related data
  router.get("/:id/comprehensive", async (req, res) => {
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

      const payrollData = payrollResult.rows[0];

      // Check if this is a grouped payroll (job_type contains comma)
      const isGroupedPayroll = payrollData.job_type && payrollData.job_type.includes(", ");

      // Get all data in parallel for efficiency
      const [itemsResult, deductionsResult, leaveRecordsResult, midMonthResult, commissionsResult] = await Promise.all([
        // Get payroll items
        pool.query(`
          SELECT pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit, 
                pi.quantity, pi.amount, pi.is_manual, pc.pay_type
          FROM payroll_items pi
          LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pi.employee_payroll_id = $1
          ORDER BY pi.id
        `, [id]),

        // Get payroll deductions
        pool.query(`
          SELECT pd.*, 
                 CAST(pd.employee_amount AS NUMERIC(10, 2)) as employee_amount,
                 CAST(pd.employer_amount AS NUMERIC(10, 2)) as employer_amount,
                 CAST(pd.wage_amount AS NUMERIC(10, 2)) as wage_amount
          FROM payroll_deductions pd
          WHERE pd.employee_payroll_id = $1
          ORDER BY pd.deduction_type
        `, [id]),

        // Get leave records for this employee for the specific month/year
        pool.query(`
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
          ORDER BY leave_date ASC
        `, [payrollData.employee_id, payrollData.year, payrollData.month]),

        // Get mid-month payroll data
        pool.query(`
          SELECT 
            mmp.*,
            s.name as employee_name
          FROM mid_month_payrolls mmp
          LEFT JOIN staffs s ON mmp.employee_id = s.id
          WHERE mmp.employee_id = $1 AND mmp.year = $2 AND mmp.month = $3
        `, [payrollData.employee_id, payrollData.year, payrollData.month]),

        // Get commission records for the specific month/year
        // For grouped payrolls, get commissions for all employees with same name
        isGroupedPayroll 
          ? pool.query(`
              SELECT cr.*, s.name as employee_name
              FROM commission_records cr
              JOIN staffs s ON cr.employee_id = s.id
              WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
                AND DATE(cr.commission_date) >= $2
                AND DATE(cr.commission_date) <= $3
              ORDER BY cr.commission_date DESC
            `, [
              payrollData.employee_id,
              `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
              `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`
            ])
          : pool.query(`
              SELECT cr.*, s.name as employee_name
              FROM commission_records cr
              JOIN staffs s ON cr.employee_id = s.id
              WHERE cr.employee_id = $1
                AND DATE(cr.commission_date) >= $2
                AND DATE(cr.commission_date) <= $3
              ORDER BY cr.commission_date DESC
            `, [
              payrollData.employee_id,
              `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
              `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`
            ])
      ]);

      // Format comprehensive response
      const response = {
        ...payrollData,
        gross_pay: parseFloat(payrollData.gross_pay),
        net_pay: parseFloat(payrollData.net_pay),
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
        leave_records: leaveRecordsResult.rows.map((record) => ({
          ...record,
          days_taken: parseFloat(record.days_taken),
          amount_paid: parseFloat(record.amount_paid || 0),
        })),
        mid_month_payroll: midMonthResult.rows.length > 0 ? {
          ...midMonthResult.rows[0],
          amount: parseFloat(midMonthResult.rows[0].amount)
        } : null,
        commission_records: commissionsResult.rows.map((record) => ({
          ...record,
          amount: parseFloat(record.amount)
        }))
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching comprehensive employee payroll details:", error);
      res.status(500).json({
        message: "Error fetching comprehensive employee payroll details",
        error: error.message,
      });
    }
  });

  // Get employee payroll details with items (now includes comprehensive data)
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

      const payrollData = payrollResult.rows[0];

      // Check if this is a grouped payroll (job_type contains comma)
      const isGroupedPayroll = payrollData.job_type && payrollData.job_type.includes(", ");

      // Get all data in parallel for efficiency
      const [itemsResult, deductionsResult, leaveRecordsResult, midMonthResult, commissionsResult] = await Promise.all([
        // Get payroll items
        pool.query(`
          SELECT pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit, 
                pi.quantity, pi.amount, pi.is_manual, pc.pay_type
          FROM payroll_items pi
          LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pi.employee_payroll_id = $1
          ORDER BY pi.id
        `, [id]),

        // Get payroll deductions
        pool.query(`
          SELECT pd.*, 
                 CAST(pd.employee_amount AS NUMERIC(10, 2)) as employee_amount,
                 CAST(pd.employer_amount AS NUMERIC(10, 2)) as employer_amount,
                 CAST(pd.wage_amount AS NUMERIC(10, 2)) as wage_amount
          FROM payroll_deductions pd
          WHERE pd.employee_payroll_id = $1
          ORDER BY pd.deduction_type
        `, [id]),

        // Get leave records for this employee for the specific month/year
        pool.query(`
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
          ORDER BY leave_date ASC
        `, [payrollData.employee_id, payrollData.year, payrollData.month]),

        // Get mid-month payroll data
        pool.query(`
          SELECT 
            mmp.*,
            s.name as employee_name
          FROM mid_month_payrolls mmp
          LEFT JOIN staffs s ON mmp.employee_id = s.id
          WHERE mmp.employee_id = $1 AND mmp.year = $2 AND mmp.month = $3
        `, [payrollData.employee_id, payrollData.year, payrollData.month]),

        // Get commission records for the specific month/year
        // For grouped payrolls, get commissions for all employees with same name
        isGroupedPayroll 
          ? pool.query(`
              SELECT cr.*, s.name as employee_name
              FROM commission_records cr
              JOIN staffs s ON cr.employee_id = s.id
              WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
                AND DATE(cr.commission_date) >= $2
                AND DATE(cr.commission_date) <= $3
              ORDER BY cr.commission_date DESC
            `, [
              payrollData.employee_id,
              `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
              `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`
            ])
          : pool.query(`
              SELECT cr.*, s.name as employee_name
              FROM commission_records cr
              JOIN staffs s ON cr.employee_id = s.id
              WHERE cr.employee_id = $1
                AND DATE(cr.commission_date) >= $2
                AND DATE(cr.commission_date) <= $3
              ORDER BY cr.commission_date DESC
            `, [
              payrollData.employee_id,
              `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
              `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`
            ])
      ]);

      // Format comprehensive response
      const response = {
        ...payrollData,
        gross_pay: parseFloat(payrollData.gross_pay),
        net_pay: parseFloat(payrollData.net_pay),
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
        leave_records: leaveRecordsResult.rows.map((record) => ({
          ...record,
          days_taken: parseFloat(record.days_taken),
          amount_paid: parseFloat(record.amount_paid || 0),
        })),
        mid_month_payroll: midMonthResult.rows.length > 0 ? {
          ...midMonthResult.rows[0],
          amount: parseFloat(midMonthResult.rows[0].amount)
        } : null,
        commission_records: commissionsResult.rows.map((record) => ({
          ...record,
          amount: parseFloat(record.amount)
        }))
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

  // Batch create or update multiple employee payrolls
  router.post("/batch", async (req, res) => {
    const {
      monthly_payroll_id,
      employee_payrolls = []
    } = req.body;

    // Validate required fields
    if (!monthly_payroll_id || !Array.isArray(employee_payrolls) || employee_payrolls.length === 0) {
      return res.status(400).json({
        message: "monthly_payroll_id and employee_payrolls array are required",
      });
    }

    // Validate each employee payroll
    for (const payroll of employee_payrolls) {
      if (!payroll.employee_id || !payroll.job_type || !payroll.section) {
        return res.status(400).json({
          message: "Each employee payroll must have employee_id, job_type, and section",
        });
      }
    }

    const client = await pool.connect();
    const results = [];
    const errors = [];

    try {
      await client.query("BEGIN");

      // Process each employee payroll
      for (let i = 0; i < employee_payrolls.length; i++) {
        const payroll = employee_payrolls[i];
        const {
          employee_id,
          job_type,
          section,
          gross_pay,
          net_pay,
          status = "Processing",
          items = [],
          deductions = [],
        } = payroll;

        try {
          // Check if employee payroll exists
          const checkQuery = `
            SELECT id FROM employee_payrolls 
            WHERE monthly_payroll_id = $1 AND employee_id = $2 AND job_type = $3
          `;
          const checkResult = await client.query(checkQuery, [
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

            await client.query(updateQuery, [
              job_type,
              section,
              gross_pay || 0,
              net_pay || 0,
              status,
              employeePayrollId,
            ]);

            // Delete existing items to replace with new ones
            await client.query(
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

            const insertResult = await client.query(insertQuery, [
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

            await client.query(itemsQuery);
          }

          // Save deductions if provided
          if (deductions && deductions.length > 0) {
            await saveDeductions(client, employeePayrollId, deductions);
          }

          results.push({
            employee_id,
            job_type,
            employee_payroll_id: employeePayrollId,
            status: "success"
          });

        } catch (error) {
          console.error(`Error processing employee ${employee_id}:`, error);
          errors.push({
            employee_id,
            job_type,
            error: error.message,
            status: "error"
          });
        }
      }

      await client.query("COMMIT");

      // Send response immediately to unblock frontend
      res.status(201).json({
        message: `Batch processing completed: ${results.length} successful, ${errors.length} errors`,
        results,
        errors,
        summary: {
          total: employee_payrolls.length,
          successful: results.length,
          errors: errors.length
        }
      });

      // Run recalculation asynchronously after response is sent
      if (results.length > 0) {
        setImmediate(async () => {
          console.log(`Starting async recalculation for ${results.length} payrolls...`);
          const recalculationPromises = results.map(async (result) => {
            try {
              await recalculateAndUpdatePayroll(pool, result.employee_payroll_id);
            } catch (error) {
              console.error(`Error recalculating payroll for employee ${result.employee_id}:`, error);
              // Don't fail the entire batch for recalculation errors
            }
          });

          await Promise.all(recalculationPromises);
          console.log(`Async recalculation completed for ${results.length} payrolls`);
        });
      }

    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error in batch processing employee payrolls:", error);
      res.status(500).json({
        message: "Error in batch processing employee payrolls",
        error: error.message,
      });
    } finally {
      client.release();
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

      // Recalculate the payroll to ensure leave records are included in totals
      // This is done after commit to avoid nested transactions
      await recalculateAndUpdatePayroll(pool, employeePayrollId);

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

      // Recalculate totals and deductions
      await recalculateAndUpdatePayroll(pool, id);

      res.status(201).json({
        message: "Manual payroll item added successfully and payroll updated.",
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

      // Recalculate totals and deductions
      await recalculateAndUpdatePayroll(pool, employeePayrollId);

      res.json({
        message: "Payroll item deleted successfully and payroll updated.",
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

  // Clear all employee payrolls for a specific monthly payroll (used when reprocessing with grouped payrolls)
  router.delete("/monthly/:monthlyPayrollId", async (req, res) => {
    const { monthlyPayrollId } = req.params;

    const client = await pool.connect();
    
    try {
      await client.query("BEGIN");

      // Get all employee payroll IDs for this monthly payroll
      const employeePayrollsResult = await client.query(
        "SELECT id FROM employee_payrolls WHERE monthly_payroll_id = $1",
        [monthlyPayrollId]
      );

      const employeePayrollIds = employeePayrollsResult.rows.map(row => row.id);

      if (employeePayrollIds.length > 0) {
        // Delete related data in correct order (foreign key dependencies)
        
        // Delete payroll deductions
        await client.query(
          "DELETE FROM payroll_deductions WHERE employee_payroll_id = ANY($1)",
          [employeePayrollIds]
        );

        // Delete payroll items
        await client.query(
          "DELETE FROM payroll_items WHERE employee_payroll_id = ANY($1)",
          [employeePayrollIds]
        );

        // Delete employee payrolls
        const deleteResult = await client.query(
          "DELETE FROM employee_payrolls WHERE monthly_payroll_id = $1",
          [monthlyPayrollId]
        );

        await client.query("COMMIT");

        res.json({
          message: "Employee payrolls cleared successfully",
          deleted_count: deleteResult.rowCount,
          cleared_employee_payrolls: employeePayrollIds.length
        });
      } else {
        await client.query("COMMIT");
        res.json({
          message: "No employee payrolls found for this monthly payroll",
          deleted_count: 0,
          cleared_employee_payrolls: 0
        });
      }

    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error clearing employee payrolls:", error);
      res.status(500).json({
        message: "Error clearing employee payrolls",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
