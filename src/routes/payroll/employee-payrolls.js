// src/routes/payroll/employee-payrolls.js
import { Router } from "express";
import { resolveContributionContext } from "./contributionOverrides.js";

const SOCSO_SKBBK_EFFECTIVE_YEAR = 2026;
const SOCSO_SKBBK_EFFECTIVE_MONTH = 6;

const isSOCSOSKBBKEffective = (year, month) => {
  const payrollYear = Number(year);
  const payrollMonth = Number(month);
  return (
    payrollYear > SOCSO_SKBBK_EFFECTIVE_YEAR ||
    (payrollYear === SOCSO_SKBBK_EFFECTIVE_YEAR &&
      payrollMonth >= SOCSO_SKBBK_EFFECTIVE_MONTH)
  );
};

// Normalize a date value (string or Date) to a local YYYY-MM-DD string.
// Never via toISOString — the server runs in Asia/Kuala_Lumpur (UTC+8) and that
// would roll the date back a day.
const toLocalYMD = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return value.split("T")[0].split(" ")[0];
  }
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
};

// Backend mirror of filterOutLeaveDayItems (src/utils/payroll/payrollUtils.ts):
// daily work-log items dated on a leave day pay nothing as work — the day is paid
// via the Cuti block instead — so they must be excluded from gross pay exactly as
// the payslip already excludes them from display. Without this, unit-based codes
// (Bag/Tray/Bundle) that get quantity 1 on a leave day carry a real amount and
// inflate the stored/recalculated gross above the sum the payslip shows.
// Only work_log_type === "daily" items are affected; monthly/production items are
// always kept, matching the frontend filter.
// Leave-day exclusion is scoped per employee_id (key = `${employee_id}|${ymd}`),
// not just by date. A person with several job ids (e.g. ROSMINA = MEE,
// ROSMINA_SB = Sangkut) who takes leave under one id must not have their OTHER
// jobs' daily work dropped — only the work belonging to the leave's own id is
// replaced by the Cuti payment. Single-job workers are unaffected (their leave
// id equals their work items' source_employee_id).
const removeLeaveDayWorkItems = (items, leaveKeySet) => {
  if (!Array.isArray(items) || items.length === 0) return items || [];
  if (!leaveKeySet || leaveKeySet.size === 0) return items;
  return items.filter((item) => {
    if (item.work_log_type !== "daily" || !item.source_date) return true;
    const ymd = toLocalYMD(item.source_date);
    if (ymd === null) return true;
    return !leaveKeySet.has(`${item.source_employee_id ?? ""}|${ymd}`);
  });
};

const buildLeaveDateSet = (leaveRecords) =>
  new Set(
    (leaveRecords || [])
      .map((record) => {
        const ymd = toLocalYMD(record.date);
        return ymd ? `${record.employee_id ?? ""}|${ymd}` : null;
      })
      .filter(Boolean),
  );

// Moved to top-level to be reusable
const saveDeductions = async (pool, employeePayrollId, deductions) => {
  if (!deductions || deductions.length === 0) {
    // If no deductions, just ensure none exist in the DB for this payroll
    await pool.query(
      "DELETE FROM payroll_deductions WHERE employee_payroll_id = $1",
      [employeePayrollId],
    );
    return;
  }

  // First, delete existing deductions for this payroll
  await pool.query(
    "DELETE FROM payroll_deductions WHERE employee_payroll_id = $1",
    [employeePayrollId],
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
      [employeePayrollId],
    );
    if (payrollDetails.rows.length === 0)
      throw new Error("Employee payroll not found");
    const { employee_id } = payrollDetails.rows[0];

    // Get employee's info (birthdate, nationality, marital status, spouse employment status, number of children)
    const employeeInfoRes = await pool.query(
      "SELECT birthdate, nationality, marital_status, spouse_employment_status, number_of_children, epf_age_override, epf_nationality_override, socso_age_override, sip_age_override FROM staffs WHERE id = $1",
      [employee_id],
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
      [employeePayrollId],
    );
    const payrollItems = itemsRes.rows.map((item) => ({
      ...item,
      rate: parseFloat(item.rate),
      quantity: parseFloat(item.quantity),
      foc_units: parseFloat(item.foc_units || 0),
      amount: parseFloat(item.amount),
    }));

    // Get employee payroll details to fetch year and month for leave records
    const payrollInfoRes = await pool.query(
      `
      SELECT ep.employee_id, ep.job_type, s.name as employee_name, mp.year, mp.month
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      JOIN staffs s ON s.id = ep.employee_id
      WHERE ep.id = $1
    `,
      [employeePayrollId],
    );

    if (payrollInfoRes.rows.length === 0) {
      throw new Error("Employee payroll not found");
    }

    const { year, month, employee_name, job_type } = payrollInfoRes.rows[0];

    // Get leave records for this employee for the specific month/year
    const leaveRecordsRes = await pool.query(
      `
      SELECT
        to_char(leave_date, 'YYYY-MM-DD') as date,
        employee_id,
        leave_type,
        days_taken,
        amount_paid
      FROM leave_records
      WHERE employee_id IN (
        SELECT id FROM staffs WHERE name = $1
      )
        AND EXTRACT(YEAR FROM leave_date) = $2
        AND EXTRACT(MONTH FROM leave_date) = $3
        AND status = 'approved'
      ORDER BY leave_date ASC
    `,
      [employee_name, year, month],
    );

    const leaveRecords = leaveRecordsRes.rows.map((record) => ({
      ...record,
      days_taken: parseFloat(record.days_taken),
      amount_paid: parseFloat(record.amount_paid || 0),
    }));

    // Exclude daily work items dated on a leave day — they pay nothing as work
    // (the day is paid via leave) and would otherwise inflate gross, mirroring
    // the payslip display. Used for gross + EPF base below.
    const leaveDateSet = buildLeaveDateSet(leaveRecords);
    const workItems = removeLeaveDayWorkItems(payrollItems, leaveDateSet);

    // Get commission records for this employee for the specific month/year
    const commissionRecordsRes = await pool.query(
      `
      SELECT amount, description, is_advance
      FROM commission_records
      WHERE employee_id IN (SELECT id FROM staffs WHERE name = $1)
        AND DATE(commission_date) >= $2
        AND DATE(commission_date) <= $3
      ORDER BY commission_date DESC
    `,
      [
        employee_name,
        `${year}-${month.toString().padStart(2, "0")}-01`,
        `${year}-${month.toString().padStart(2, "0")}-${new Date(year, month, 0).getDate().toString().padStart(2, "0")}`,
      ],
    );

    const commissionRecords = commissionRecordsRes.rows.map((record) => ({
      ...record,
      amount: parseFloat(record.amount || 0),
    }));

    // Get others (Kerja Luar OT) records for this employee for the specific month/year
    const othersRecordsRes = await pool.query(
      `
      SELECT orec.amount, orec.description, pc.pay_type
      FROM others_records orec
      LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
      WHERE orec.employee_id IN (SELECT id FROM staffs WHERE name = $1)
        AND DATE(orec.record_date) >= $2
        AND DATE(orec.record_date) <= $3
      ORDER BY orec.record_date DESC
    `,
      [
        employee_name,
        `${year}-${month.toString().padStart(2, "0")}-01`,
        `${year}-${month.toString().padStart(2, "0")}-${new Date(year, month, 0).getDate().toString().padStart(2, "0")}`,
      ],
    );

    const othersRecords = othersRecordsRes.rows.map((record) => ({
      ...record,
      amount: parseFloat(record.amount || 0),
    }));
    // Overtime "Others" count towards gross but are excluded from the EPF base.
    const othersOvertimeGrossPay = othersRecords.reduce(
      (sum, record) =>
        (record.pay_type || "").toLowerCase() === "overtime"
          ? sum + record.amount
          : sum,
      0,
    );

    // Get all active contribution rates
    const [epfRatesRes, socsoRatesRes, sipRatesRes, incomeTaxRatesRes] =
      await Promise.all([
        pool.query("SELECT * FROM epf_rates WHERE is_active = true"),
        pool.query(
          "SELECT * FROM socso_rates WHERE is_active = true ORDER BY wage_from",
        ),
        pool.query(
          "SELECT * FROM sip_rates WHERE is_active = true ORDER BY wage_from",
        ),
        pool.query(
          "SELECT * FROM income_tax_rates WHERE is_active = true ORDER BY wage_from",
        ), // Add this
      ]);
    const epfRates = epfRatesRes.rows;
    const socsoRates = socsoRatesRes.rows;
    const sipRates = sipRatesRes.rows;
    const incomeTaxRates = incomeTaxRatesRes.rows;

    // 2. PERFORM CALCULATIONS (Server-side implementation of client logic)

    // --- Calculation Helpers ---
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
        (r) => wage >= parseFloat(r.wage_from) && wage <= parseFloat(r.wage_to),
      ) || null;

    const findIncomeTaxRateByWage = (rates, wage) => {
      const lookupWage = Math.ceil(wage);
      return (
        rates.find(
          (r) =>
            lookupWage >= parseFloat(r.wage_from) &&
            lookupWage <= parseFloat(r.wage_to),
        ) || null
      );
    };

    const getEPFWageCeiling = (wageAmount) => {
      if (wageAmount <= 10) return 0;
      if (wageAmount <= 20) return 20;
      if (wageAmount <= 5000) return Math.ceil(wageAmount / 20) * 20;
      return 5000 + Math.ceil((wageAmount - 5000) / 100) * 100;
    };

    // --- Main Calculation Logic ---
    // Calculate gross pay using CONSOLIDATED approach (matches frontend display)
    // This groups items by pay_code+rate+rate_unit, sums quantities, then calculates once
    const consolidateItems = (items) => {
      // Defensive: Validate and clean input
      if (!items || !Array.isArray(items) || items.length === 0) {
        return 0;
      }

      const groups = new Map();
      items.forEach((item) => {
        // Defensive: Validate numeric fields
        const rate = parseFloat(item.rate);
        const quantity = parseFloat(item.quantity);
        const focUnits = parseFloat(item.foc_units || 0);
        const amount = parseFloat(item.amount);

        // Defensive: Skip invalid items
        if (
          isNaN(rate) ||
          isNaN(quantity) ||
          isNaN(focUnits) ||
          isNaN(amount)
        ) {
          console.error("Invalid numeric values in payroll item:", item);
          return; // Skip this item
        }

        const key = `${item.pay_code_id}_${rate}_${item.rate_unit}`;
        if (groups.has(key)) {
          const group = groups.get(key);
          group.totalQuantity += quantity; // Now guaranteed to be number
          group.totalFocUnits += focUnits; // Now guaranteed to be number
          group.originalAmountSum += amount; // Now guaranteed to be number
        } else {
          groups.set(key, {
            rate: rate,
            rate_unit: item.rate_unit,
            totalQuantity: quantity,
            totalFocUnits: focUnits,
            originalAmountSum: amount,
          });
        }
      });
      let totalCents = 0;
      groups.forEach((group) => {
        if (group.rate_unit === "Percent" || group.rate_unit === "Fixed") {
          totalCents += Math.round(group.originalAmountSum * 100);
        } else {
          const roundedRate = Math.round(group.rate * 100) / 100;
          const totalUnits = group.totalQuantity + group.totalFocUnits;
          totalCents += Math.round(roundedRate * totalUnits * 100);
        }
      });
      return totalCents;
    };

    const workGrossPayCents = consolidateItems(workItems);
    const workGrossPay = workGrossPayCents / 100;
    const leaveGrossPayCents = leaveRecords.reduce(
      (sum, record) => sum + Math.round(record.amount_paid * 100),
      0,
    );
    const leaveGrossPay = leaveGrossPayCents / 100;
    const commissionGrossPayCents = commissionRecords.reduce(
      (sum, record) => sum + Math.round(record.amount * 100),
      0,
    );
    const commissionGrossPay = commissionGrossPayCents / 100;
    const commissionAdvanceCents = commissionRecords.reduce(
      (sum, record) =>
        record.is_advance === false
          ? sum
          : sum + Math.round(record.amount * 100),
      0,
    );
    const commissionAdvancePay = commissionAdvanceCents / 100;
    const othersGrossPayCents = othersRecords.reduce(
      (sum, record) => sum + Math.round(record.amount * 100),
      0,
    );
    const othersGrossPay = othersGrossPayCents / 100;
    const grossPay =
      Math.round(
        (workGrossPay + leaveGrossPay + commissionGrossPay + othersGrossPay) *
          100,
      ) / 100;

    const groupedItems = workItems.reduce(
      (acc, item) => {
        const type = item.pay_type || "Tambahan"; // Default to Tambahan
        if (!acc[type]) acc[type] = [];
        acc[type].push(item);
        return acc;
      },
      { Base: [], Tambahan: [], Overtime: [] },
    );

    // Calculate EPF gross pay using CONSOLIDATED approach. Excludes all overtime:
    // Overtime work items aren't in Base/Tambahan, and overtime "Others" are
    // removed via othersOvertimeGrossPay (OT is not part of the EPF wage base).
    const epfGrossPayCents =
      consolidateItems(groupedItems.Base || []) +
      consolidateItems(groupedItems.Tambahan || []) +
      Math.round(leaveGrossPay * 100) +
      Math.round(commissionGrossPay * 100) +
      Math.round((othersGrossPay - othersOvertimeGrossPay) * 100);
    const epfGrossPay = epfGrossPayCents / 100;

    const age = Math.floor(
      (Date.now() - new Date(employeeInfo.birthdate).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000),
    );
    const contributionCtx = resolveContributionContext(employeeInfo, age);

    const deductions = [];

    // Calculate EPF
    const epfRate = contributionCtx.epf.eligible
      ? findEPFRate(epfRates, contributionCtx.epf.employeeType, epfGrossPay)
      : null;
    if (epfRate) {
      const wageCeiling = getEPFWageCeiling(epfGrossPay);
      if (wageCeiling > 0) {
        const employeeContribution = Math.ceil(
          (wageCeiling * parseFloat(epfRate.employee_rate_percentage)) / 100,
        );
        const employerContribution =
          epfRate.employer_rate_percentage !== null
            ? Math.ceil(
                (wageCeiling * parseFloat(epfRate.employer_rate_percentage)) /
                  100,
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
            age_group: contributionCtx.epf.employeeType,
            wage_ceiling_used: wageCeiling,
          },
        });
      }
    }

    // Calculate SOCSO. SKBBK applies from June 2026 payrolls onward.
    const socsoRate = contributionCtx.socso.eligible
      ? findRateByWage(socsoRates, grossPay)
      : null;
    if (socsoRate) {
      const isOver60 = contributionCtx.socso.isOver60;
      const shouldApplySKBBK = isSOCSOSKBBKEffective(year, month);
      const skbbk =
        shouldApplySKBBK
          ? Math.round(parseFloat(socsoRate.employee_rate_skbbk || 0) * 100) /
            100
          : 0;
      const keilatan = isOver60
        ? 0
        : Math.round(parseFloat(socsoRate.employee_rate || 0) * 100) / 100;
      const employee_amount = Math.round((keilatan + skbbk) * 100) / 100;
      const employer_amount = isOver60
        ? Math.round(parseFloat(socsoRate.employer_rate_over_60 || 0) * 100) /
          100
        : Math.round(parseFloat(socsoRate.employer_rate || 0) * 100) / 100;

      deductions.push({
        deduction_type: "socso",
        employee_amount,
        employer_amount,
        wage_amount: grossPay,
        rate_info: {
          rate_id: socsoRate.id,
          employee_rate: `RM${employee_amount.toFixed(2)}`,
          employer_rate: `RM${employer_amount.toFixed(2)}`,
          age_group: isOver60 ? "60_and_above" : "under_60",
          keilatan_amount: keilatan,
          skbbk_amount: skbbk,
        },
      });
    }

    // Calculate SIP (only for Malaysian citizens under 60)
    if (
      contributionCtx.sip.eligible &&
      contributionCtx.sip.under60 &&
      contributionCtx.isMalaysian
    ) {
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
    const incomeTaxRate = findIncomeTaxRateByWage(incomeTaxRates, grossPay);

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
      0,
    );
    // Only advance commission/bonus records are deducted as advance payments.
    // Others (Kerja Luar OT) is treated as a regular earning — included in gross/EPF only, NOT deducted from net.
    const totalCommissionDeductions = commissionAdvancePay;
    const netPay =
      grossPay - totalEmployeeDeductions - totalCommissionDeductions;

    // Get mid-month payroll for rounding calculation. Grouped payrolls (job_type
    // has a comma) sum every sibling id's advance by name so the final rounding
    // subtracts all advances paid to the person; single-job payrolls use just
    // this employee's advance — matching payroll processing and the read endpoints.
    const isGroupedRecalc = (job_type || "").includes(", ");
    const midMonthRes = await pool.query(
      isGroupedRecalc
        ? `SELECT COALESCE(SUM(amount), 0) as amount FROM mid_month_payrolls
           WHERE employee_id IN (SELECT id FROM staffs WHERE name = $1)
             AND year = $2 AND month = $3`
        : `SELECT COALESCE(amount, 0) as amount FROM mid_month_payrolls
           WHERE employee_id = $1 AND year = $2 AND month = $3`,
      [isGroupedRecalc ? employee_name : employee_id, year, month],
    );
    const midMonthAmount = parseFloat(midMonthRes.rows[0]?.amount || 0);

    // Calculate rounding (digenapkan) - round UP to nearest whole ringgit
    const jumlah = netPay - midMonthAmount;
    const setelahDigenapkan = Math.ceil(jumlah);
    const digenapkan = setelahDigenapkan - jumlah;

    // Update gross pay, net pay, and rounding columns
    await pool.query(
      `UPDATE employee_payrolls SET gross_pay = $1, net_pay = $2, digenapkan = $3, setelah_digenapkan = $4 WHERE id = $5`,
      [
        grossPay.toFixed(2),
        netPay.toFixed(2),
        digenapkan.toFixed(2),
        setelahDigenapkan.toFixed(2),
        employeePayrollId,
      ],
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

export { recalculateAndUpdatePayroll, removeLeaveDayWorkItems, buildLeaveDateSet };

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
      SELECT ep.*, mp.year, mp.month, mp.status as payroll_status, s.name as employee_name,
             s.head_staff_id as head_employee_id
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      LEFT JOIN staffs s ON ep.employee_id = s.id
      WHERE ep.id = ANY($1)
    `;

      const payrollsResult = await pool.query(query, [payrollIds]);

      // Get all items for these payrolls in a single query (more efficient)
      const itemsQuery = `
      SELECT pi.employee_payroll_id, pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit,
            pi.quantity, pi.amount, pi.is_manual, pi.job_type, pi.source_employee_id,
            pi.source_date, pi.work_log_id, pi.work_log_type, pi.foc_units,
            pc.pay_type
      FROM payroll_items pi
      LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
      WHERE pi.employee_payroll_id = ANY($1)
      ORDER BY pi.source_date ASC NULLS LAST, pi.id
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
          foc_units: parseFloat(item.foc_units || 0),
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
        {},
      );

      // Get all leave records for these payrolls in a single query
      const leaveRecordsQuery = `
      SELECT
        ep.id as employee_payroll_id,
        to_char(lr.leave_date, 'YYYY-MM-DD') as date,
        lr.employee_id,
        lr.leave_type,
        lr.days_taken,
        lr.amount_paid,
        h.description as holiday_description
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      JOIN staffs emp_staff ON ep.employee_id = emp_staff.id
      JOIN leave_records lr ON lr.employee_id IN (
        SELECT s2.id FROM staffs s2 WHERE s2.name = emp_staff.name
      )
      LEFT JOIN holiday_calendar h
        ON lr.leave_type = 'cuti_umum'
        AND h.holiday_date = lr.leave_date
        AND h.is_active = true
      WHERE ep.id = ANY($1)
        AND EXTRACT(YEAR FROM lr.leave_date) = mp.year
        AND EXTRACT(MONTH FROM lr.leave_date) = mp.month
        AND lr.status = 'approved'
      ORDER BY ep.id, lr.leave_date ASC
    `;
      const leaveRecordsResult = await pool.query(leaveRecordsQuery, [
        payrollIds,
      ]);

      // Group leave records by employee_payroll_id
      const leaveRecordsByPayrollId = leaveRecordsResult.rows.reduce(
        (acc, record) => {
          if (!acc[record.employee_payroll_id]) {
            acc[record.employee_payroll_id] = [];
          }
          acc[record.employee_payroll_id].push({
            date: record.date,
            employee_id: record.employee_id,
            leave_type: record.leave_type,
            days_taken: parseFloat(record.days_taken),
            amount_paid: parseFloat(record.amount_paid || 0),
            holiday_description: record.holiday_description || null,
          });
          return acc;
        },
        {},
      );

      // Get all mid-month payrolls for these payrolls in a single query.
      // For grouped payrolls match by employee name so every sibling's advance
      // is gathered (mirrors the commission handling).
      const midMonthQuery = `
      SELECT
        ep.id as employee_payroll_id,
        mmp.*,
        s.name as employee_name
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      JOIN staffs emp_staff ON ep.employee_id = emp_staff.id
      JOIN mid_month_payrolls mmp ON (
        CASE
          WHEN ep.job_type LIKE '%,%' THEN mmp.employee_id IN (
            SELECT s2.id FROM staffs s2 WHERE s2.name = emp_staff.name
          )
          ELSE mmp.employee_id = ep.employee_id
        END
      ) AND mp.year = mmp.year AND mp.month = mmp.month
      LEFT JOIN staffs s ON mmp.employee_id = s.id
      WHERE ep.id = ANY($1)
      ORDER BY ep.id
    `;
      const midMonthResult = await pool.query(midMonthQuery, [payrollIds]);

      // Group mid-month payrolls by employee_payroll_id, accumulating the total
      // advance and a per-sibling map (used by the individual breakdown slips).
      const midMonthByPayrollId = midMonthResult.rows.reduce((acc, record) => {
        const pid = record.employee_payroll_id;
        const amount = parseFloat(record.amount);
        if (!acc[pid]) {
          acc[pid] = { total: 0, byEmployee: {}, rows: [] };
        }
        acc[pid].total += amount;
        acc[pid].byEmployee[record.employee_id] = amount;
        const cleanRecord = { ...record, amount };
        delete cleanRecord.employee_payroll_id;
        acc[pid].rows.push(cleanRecord);
        return acc;
      }, {});

      // Get all commission records for these payrolls in a single query
      // Handle grouped payrolls by getting commissions for all employees with the same name
      const commissionsQuery = `
      SELECT 
        ep.id as employee_payroll_id,
        cr.*,
        s.name as employee_name
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      JOIN staffs emp_staff ON ep.employee_id = emp_staff.id
      JOIN commission_records cr ON (
        CASE 
          WHEN ep.job_type LIKE '%,%' THEN cr.employee_id IN (
            SELECT s2.id FROM staffs s2 WHERE s2.name = emp_staff.name
          )
          ELSE cr.employee_id = ep.employee_id
        END
      )
      JOIN staffs s ON cr.employee_id = s.id
      WHERE ep.id = ANY($1)
        AND EXTRACT(YEAR FROM cr.commission_date) = mp.year
        AND EXTRACT(MONTH FROM cr.commission_date) = mp.month
      ORDER BY ep.id, cr.commission_date DESC
    `;
      const commissionsResult = await pool.query(commissionsQuery, [
        payrollIds,
      ]);

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
            amount: parseFloat(commissionRecord.amount),
          });
          return acc;
        },
        {},
      );

      // Get all others (Kerja Luar OT) records for these payrolls in a single query
      // Mirrors commission handling: for grouped payrolls match by employee name.
      const othersQuery = `
      SELECT
        ep.id as employee_payroll_id,
        orec.*,
        s.name as employee_name,
        pc.description as pay_code_description,
        pc.pay_type as pay_code_pay_type
      FROM employee_payrolls ep
      JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
      JOIN staffs emp_staff ON ep.employee_id = emp_staff.id
      JOIN others_records orec ON (
        CASE
          WHEN ep.job_type LIKE '%,%' THEN orec.employee_id IN (
            SELECT s2.id FROM staffs s2 WHERE s2.name = emp_staff.name
          )
          ELSE orec.employee_id = ep.employee_id
        END
      )
      JOIN staffs s ON orec.employee_id = s.id
      LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
      WHERE ep.id = ANY($1)
        AND EXTRACT(YEAR FROM orec.record_date) = mp.year
        AND EXTRACT(MONTH FROM orec.record_date) = mp.month
      ORDER BY ep.id, orec.record_date DESC
    `;
      const othersResult = await pool.query(othersQuery, [payrollIds]);

      const othersByPayrollId = othersResult.rows.reduce((acc, record) => {
        if (!acc[record.employee_payroll_id]) {
          acc[record.employee_payroll_id] = [];
        }
        const othersRecord = { ...record };
        delete othersRecord.employee_payroll_id;
        acc[record.employee_payroll_id].push({
          ...othersRecord,
          amount: parseFloat(othersRecord.amount),
          rate: parseFloat(othersRecord.rate),
          quantity: parseFloat(othersRecord.quantity),
        });
        return acc;
      }, {});

      // Per-job section names so each individual breakdown shows its own Bahagian
      // (instead of the combined payroll's primary-job section).
      const splitJobTypes = (jobType) =>
        (jobType || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const allJobTypes = [
        ...new Set(payrollsResult.rows.flatMap((p) => splitJobTypes(p.job_type))),
      ];
      const jobSectionsResult = allJobTypes.length
        ? await pool.query(
            `SELECT j.id, COALESCE(s.name, j.section) AS section
             FROM jobs j
             LEFT JOIN sections s ON j.section = s.id OR j.section = s.name
             WHERE j.id = ANY($1)`,
            [allJobTypes],
          )
        : { rows: [] };
      const jobSectionsMap = jobSectionsResult.rows.reduce((acc, r) => {
        acc[r.id] = r.section;
        return acc;
      }, {});

      // Recalculate gross_pay/net_pay with the CONSOLIDATED approach so the batch
      // print/download flows produce the exact same figures as the single (/:id)
      // and /comprehensive endpoints. net_pay here is gross - statutory only;
      // commission advances are shown as a separate advance deduction on the
      // payslip, so they must NOT be pre-subtracted from net_pay (the raw stored
      // net_pay already excludes them, which would double-count on the slip).
      const consolidateItemsAPI = (itemsList) => {
        const groups = new Map();
        itemsList.forEach((item) => {
          const key = `${item.pay_code_id}_${item.rate}_${item.rate_unit}`;
          if (groups.has(key)) {
            const group = groups.get(key);
            group.totalQuantity += item.quantity;
            group.totalFocUnits += item.foc_units || 0;
            group.originalAmountSum += item.amount;
          } else {
            groups.set(key, {
              rate: item.rate,
              rate_unit: item.rate_unit,
              totalQuantity: item.quantity,
              totalFocUnits: item.foc_units || 0,
              originalAmountSum: item.amount,
            });
          }
        });
        let totalCents = 0;
        groups.forEach((group) => {
          if (group.rate_unit === "Percent" || group.rate_unit === "Fixed") {
            totalCents += Math.round(group.originalAmountSum * 100);
          } else {
            const roundedRate = Math.round(group.rate * 100) / 100;
            const totalUnits = group.totalQuantity + group.totalFocUnits;
            totalCents += Math.round(roundedRate * totalUnits * 100);
          }
        });
        return totalCents;
      };

      // Merge payrolls with their items, deductions, leave records, mid-month payrolls, commission, and others records
      const response = payrollsResult.rows.map((payroll) => {
        const midMonth = midMonthByPayrollId[payroll.id];
        const primaryMidMonth = midMonth
          ? midMonth.rows.find((r) => r.employee_id === payroll.employee_id) ||
            midMonth.rows[0]
          : null;

        const payrollItems = itemsByPayrollId[payroll.id] || [];
        const payrollLeave = leaveRecordsByPayrollId[payroll.id] || [];
        const payrollCommissions = commissionsByPayrollId[payroll.id] || [];
        const payrollOthers = othersByPayrollId[payroll.id] || [];
        const payrollDeductions = deductionsByPayrollId[payroll.id] || [];

        const workGrossPayCents = consolidateItemsAPI(
          removeLeaveDayWorkItems(payrollItems, buildLeaveDateSet(payrollLeave)),
        );
        const leaveGrossPayCents = payrollLeave.reduce(
          (sum, r) => sum + Math.round(r.amount_paid * 100),
          0,
        );
        const commissionGrossPayCents = payrollCommissions.reduce(
          (sum, r) => sum + Math.round(r.amount * 100),
          0,
        );
        const othersGrossPayCents = payrollOthers.reduce(
          (sum, r) => sum + Math.round(r.amount * 100),
          0,
        );
        const recalculatedGrossPay =
          (workGrossPayCents +
            leaveGrossPayCents +
            commissionGrossPayCents +
            othersGrossPayCents) /
          100;
        const totalDeductions = payrollDeductions.reduce(
          (sum, d) => sum + parseFloat(d.employee_amount || 0),
          0,
        );
        const recalculatedNetPay =
          Math.round((recalculatedGrossPay - totalDeductions) * 100) / 100;

        return {
          ...payroll,
          items: payrollItems,
          deductions: payrollDeductions,
          leave_records: payrollLeave,
          job_sections: splitJobTypes(payroll.job_type).reduce((acc, jt) => {
            if (jobSectionsMap[jt]) acc[jt] = jobSectionsMap[jt];
            return acc;
          }, {}),
          mid_month_payroll: primaryMidMonth
            ? { ...primaryMidMonth, amount: midMonth.total }
            : null,
          mid_month_payrolls_by_employee: midMonth ? midMonth.byEmployee : {},
          commission_records: payrollCommissions,
          others_records: payrollOthers,
          gross_pay: recalculatedGrossPay,
          net_pay: recalculatedNetPay,
        };
      });

      res.json(response);
    } catch (error) {
      console.error("Error fetching batch employee payroll details:", error);
      res.status(500).json({
        message: "Error fetching batch employee payroll details",
        error: error.message,
      });
    }
  });

  // Get manual items totals for a monthly payroll (used during reprocessing)
  router.get("/monthly/:monthlyPayrollId/manual-items", async (req, res) => {
    const { monthlyPayrollId } = req.params;

    try {
      // Get all employee payrolls with their manual items for this monthly payroll
      const query = `
        SELECT ep.employee_id, SUM(pi.amount) as manual_items_total
        FROM employee_payrolls ep
        JOIN payroll_items pi ON ep.id = pi.employee_payroll_id
        WHERE ep.monthly_payroll_id = $1 AND pi.is_manual = true
        GROUP BY ep.employee_id
      `;
      const result = await pool.query(query, [monthlyPayrollId]);

      // Return as a map of employee_id -> manual_items_total
      const manualItemsMap = {};
      result.rows.forEach((row) => {
        manualItemsMap[row.employee_id] = parseFloat(row.manual_items_total);
      });

      res.json({ manual_items: manualItemsMap });
    } catch (error) {
      console.error("Error fetching manual items for monthly payroll:", error);
      res.status(500).json({
        message: "Error fetching manual items",
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
        SELECT ep.*, mp.year, mp.month, mp.status as payroll_status, s.name as employee_name,
               s.head_staff_id as head_employee_id
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
      const isGroupedPayroll =
        payrollData.job_type && payrollData.job_type.includes(", ");

      // Get all data in parallel for efficiency
      const [
        itemsResult,
        deductionsResult,
        leaveRecordsResult,
        midMonthResult,
        commissionsResult,
        othersResult,
        pinjamResult,
      ] = await Promise.all([
        // Get payroll items (including job_type, source_employee_id and source tracking for traceability)
        pool.query(
          `
          SELECT pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit,
                pi.quantity, pi.amount, pi.is_manual, pi.job_type, pi.source_employee_id,
                pi.source_date, pi.work_log_id, pi.work_log_type, pi.foc_units,
                pc.pay_type
          FROM payroll_items pi
          LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pi.employee_payroll_id = $1
          ORDER BY pi.source_date ASC NULLS LAST, pi.id
        `,
          [id],
        ),

        // Get payroll deductions
        pool.query(
          `
          SELECT pd.*,
                 CAST(pd.employee_amount AS NUMERIC(10, 2)) as employee_amount,
                 CAST(pd.employer_amount AS NUMERIC(10, 2)) as employer_amount,
                 CAST(pd.wage_amount AS NUMERIC(10, 2)) as wage_amount
          FROM payroll_deductions pd
          WHERE pd.employee_payroll_id = $1
          ORDER BY pd.deduction_type
        `,
          [id],
        ),

        // Get leave records for this employee for the specific month/year
        pool.query(
          `
          SELECT
            to_char(lr.leave_date, 'YYYY-MM-DD') as date,
            lr.employee_id,
            lr.leave_type,
            lr.days_taken,
            lr.amount_paid,
            COALESCE(lr.work_log_id, inferred_mwl.id) as work_log_id,
            CASE
              WHEN dwl.id IS NOT NULL THEN 'daily'
              WHEN linked_mwl.id IS NOT NULL OR inferred_mwl.id IS NOT NULL THEN 'monthly'
              WHEN lr.notes IN ('PACKING_CUTI:MEE_PACKING', 'PACKING_CUTI:BH_PACKING') THEN 'packing_cuti'
              ELSE NULL
            END as work_log_type,
            COALESCE(
              dwl.section,
              linked_mwl.section,
              inferred_mwl.section,
              CASE
                WHEN lr.notes = 'PACKING_CUTI:MEE_PACKING' THEN 'MEE_PACKING'
                WHEN lr.notes = 'PACKING_CUTI:BH_PACKING' THEN 'BH_PACKING'
                ELSE NULL
              END
            ) as work_log_section,
            lr.notes,
            h.description as holiday_description
          FROM leave_records lr
          JOIN staffs s ON s.id = lr.employee_id
          LEFT JOIN daily_work_logs dwl
            ON dwl.id = lr.work_log_id
            AND dwl.log_date = lr.leave_date
          LEFT JOIN monthly_work_logs linked_mwl
            ON linked_mwl.id = lr.work_log_id
            AND linked_mwl.log_year = EXTRACT(YEAR FROM lr.leave_date)
            AND linked_mwl.log_month = EXTRACT(MONTH FROM lr.leave_date)
          LEFT JOIN monthly_work_logs inferred_mwl
            ON lr.work_log_id IS NULL
            AND inferred_mwl.log_year = EXTRACT(YEAR FROM lr.leave_date)
            AND inferred_mwl.log_month = EXTRACT(MONTH FROM lr.leave_date)
            AND inferred_mwl.section = CASE
              WHEN COALESCE(s.job::jsonb, '[]'::jsonb) ? 'MAINTEN' THEN 'MAINTENANCE'
              WHEN COALESCE(s.job::jsonb, '[]'::jsonb) ? 'OFFICE' THEN 'OFFICE'
              WHEN COALESCE(s.job::jsonb, '[]'::jsonb) ? 'SAPU' THEN 'SAPU'
              ELSE NULL
            END
          LEFT JOIN holiday_calendar h
            ON lr.leave_type = 'cuti_umum'
            AND h.holiday_date = lr.leave_date
            AND h.is_active = true
          WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
            AND EXTRACT(YEAR FROM lr.leave_date) = $2
            AND EXTRACT(MONTH FROM lr.leave_date) = $3
            AND lr.status = 'approved'
          ORDER BY lr.leave_date ASC
        `,
          [payrollData.employee_id, payrollData.year, payrollData.month],
        ),

        // Get mid-month payroll data. For grouped payrolls each sibling id can
        // have its own advance (all paid to the same person), so match by name
        // to gather every sibling's advance — mirroring the commission handling.
        isGroupedPayroll
          ? pool.query(
              `
          SELECT
            mmp.*,
            s.name as employee_name
          FROM mid_month_payrolls mmp
          LEFT JOIN staffs s ON mmp.employee_id = s.id
          WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
            AND mmp.year = $2 AND mmp.month = $3
        `,
              [payrollData.employee_id, payrollData.year, payrollData.month],
            )
          : pool.query(
              `
          SELECT
            mmp.*,
            s.name as employee_name
          FROM mid_month_payrolls mmp
          LEFT JOIN staffs s ON mmp.employee_id = s.id
          WHERE mmp.employee_id = $1 AND mmp.year = $2 AND mmp.month = $3
        `,
              [payrollData.employee_id, payrollData.year, payrollData.month],
            ),

        // Get commission records for the specific month/year
        // For grouped payrolls, get commissions for all employees with same name
        isGroupedPayroll
          ? pool.query(
              `
              SELECT cr.*, s.name as employee_name
              FROM commission_records cr
              JOIN staffs s ON cr.employee_id = s.id
              WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
                AND DATE(cr.commission_date) >= $2
                AND DATE(cr.commission_date) <= $3
              ORDER BY cr.commission_date DESC
            `,
              [
                payrollData.employee_id,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`,
              ],
            )
          : pool.query(
              `
              SELECT cr.*, s.name as employee_name
              FROM commission_records cr
              JOIN staffs s ON cr.employee_id = s.id
              WHERE cr.employee_id = $1
                AND DATE(cr.commission_date) >= $2
                AND DATE(cr.commission_date) <= $3
              ORDER BY cr.commission_date DESC
            `,
              [
                payrollData.employee_id,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`,
              ],
            ),

        // Get others (Kerja Luar OT) records for the specific month/year
        // Mirrors commission handling: grouped payrolls match by employee name.
        isGroupedPayroll
          ? pool.query(
              `
              SELECT orec.*, s.name as employee_name,
                     pc.description as pay_code_description,
                     pc.pay_type as pay_code_pay_type
              FROM others_records orec
              JOIN staffs s ON orec.employee_id = s.id
              LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
              WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
                AND DATE(orec.record_date) >= $2
                AND DATE(orec.record_date) <= $3
              ORDER BY orec.record_date DESC
            `,
              [
                payrollData.employee_id,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`,
              ],
            )
          : pool.query(
              `
              SELECT orec.*, s.name as employee_name,
                     pc.description as pay_code_description,
                     pc.pay_type as pay_code_pay_type
              FROM others_records orec
              JOIN staffs s ON orec.employee_id = s.id
              LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
              WHERE orec.employee_id = $1
                AND DATE(orec.record_date) >= $2
                AND DATE(orec.record_date) <= $3
              ORDER BY orec.record_date DESC
            `,
              [
                payrollData.employee_id,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`,
              ],
            ),

        // Get pinjam records for this employee for the specific month/year.
        pool.query(
          `
          SELECT p.*, s.name as employee_name
          FROM pinjam_records p
          LEFT JOIN staffs s ON p.employee_id = s.id
          WHERE p.employee_id = $1 AND p.year = $2 AND p.month = $3
          ORDER BY p.year DESC, p.month DESC, p.employee_id, p.pinjam_type, p.description
        `,
          [payrollData.employee_id, payrollData.year, payrollData.month],
        ),
      ]);

      // Parse items
      const items = itemsResult.rows.map((item) => ({
        ...item,
        rate: parseFloat(item.rate),
        quantity: parseFloat(item.quantity),
        foc_units: parseFloat(item.foc_units || 0),
        amount: parseFloat(item.amount),
        is_manual: !!item.is_manual,
      }));

      // Parse leave, commission, and others records
      const leaveRecords = leaveRecordsResult.rows.map((record) => ({
        ...record,
        days_taken: parseFloat(record.days_taken),
        amount_paid: parseFloat(record.amount_paid || 0),
      }));
      const commissionRecords = commissionsResult.rows.map((record) => ({
        ...record,
        amount: parseFloat(record.amount),
      }));
      const othersRecords = othersResult.rows.map((record) => ({
        ...record,
        amount: parseFloat(record.amount),
        rate: parseFloat(record.rate),
        quantity: parseFloat(record.quantity),
      }));
      const pinjamRecords = pinjamResult.rows.map((record) => ({
        ...record,
        amount: parseFloat(record.amount),
      }));

      // Recalculate gross_pay using CONSOLIDATED approach (matches frontend display)
      const consolidateItemsAPI = (itemsList) => {
        const groups = new Map();
        itemsList.forEach((item) => {
          const key = `${item.pay_code_id}_${item.rate}_${item.rate_unit}`;
          if (groups.has(key)) {
            const group = groups.get(key);
            group.totalQuantity += item.quantity;
            group.totalFocUnits += item.foc_units || 0;
            group.originalAmountSum += item.amount;
          } else {
            groups.set(key, {
              rate: item.rate,
              rate_unit: item.rate_unit,
              totalQuantity: item.quantity,
              totalFocUnits: item.foc_units || 0,
              originalAmountSum: item.amount,
            });
          }
        });
        let totalCents = 0;
        groups.forEach((group) => {
          if (group.rate_unit === "Percent" || group.rate_unit === "Fixed") {
            totalCents += Math.round(group.originalAmountSum * 100);
          } else {
            const roundedRate = Math.round(group.rate * 100) / 100;
            const totalUnits = group.totalQuantity + group.totalFocUnits;
            totalCents += Math.round(roundedRate * totalUnits * 100);
          }
        });
        return totalCents;
      };

      // Exclude leave-day daily items so the recalculated gross matches the
      // payslip display (which already filters them via filterOutLeaveDayItems).
      const workGrossPayCents = consolidateItemsAPI(
        removeLeaveDayWorkItems(items, buildLeaveDateSet(leaveRecords)),
      );
      const leaveGrossPayCents = leaveRecords.reduce(
        (sum, r) => sum + Math.round(r.amount_paid * 100),
        0,
      );
      const commissionGrossPayCents = commissionRecords.reduce(
        (sum, r) => sum + Math.round(r.amount * 100),
        0,
      );
      const othersGrossPayCents = othersRecords.reduce(
        (sum, r) => sum + Math.round(r.amount * 100),
        0,
      );
      const recalculatedGrossPay =
        (workGrossPayCents +
          leaveGrossPayCents +
          commissionGrossPayCents +
          othersGrossPayCents) /
        100;

      // Recalculate net_pay based on recalculated gross_pay
      const totalDeductions = deductionsResult.rows.reduce(
        (sum, d) => sum + parseFloat(d.employee_amount || 0),
        0,
      );
      const recalculatedNetPay =
        Math.round((recalculatedGrossPay - totalDeductions) * 100) / 100;

      // Aggregate sibling mid-month advances: the combined `mid_month_payroll`
      // carries the SUM (for the main slip), while `mid_month_payrolls_by_employee`
      // keeps each sibling's own amount (for the individual breakdown slips).
      const midMonthRows = midMonthResult.rows.map((row) => ({
        ...row,
        amount: parseFloat(row.amount),
      }));
      const midMonthTotal = midMonthRows.reduce((sum, r) => sum + r.amount, 0);
      const midMonthByEmployee = midMonthRows.reduce((acc, r) => {
        acc[r.employee_id] = r.amount;
        return acc;
      }, {});
      const primaryMidMonth =
        midMonthRows.find((r) => r.employee_id === payrollData.employee_id) ||
        midMonthRows[0] ||
        null;

      // Per-job section names (e.g. {MEE_PACKING: "Mee", BIHUN_SANGKUT: "Bihun"})
      // so each individual breakdown slip shows its own job's Bahagian instead of
      // the combined payroll's (primary job's) section.
      const jobTypeList = (payrollData.job_type || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const jobSectionsResult = jobTypeList.length
        ? await pool.query(
            `SELECT j.id, COALESCE(s.name, j.section) AS section
             FROM jobs j
             LEFT JOIN sections s ON j.section = s.id OR j.section = s.name
             WHERE j.id = ANY($1)`,
            [jobTypeList],
          )
        : { rows: [] };
      const jobSections = jobSectionsResult.rows.reduce((acc, r) => {
        acc[r.id] = r.section;
        return acc;
      }, {});

      // Format comprehensive response
      const response = {
        ...payrollData,
        gross_pay: recalculatedGrossPay,
        net_pay: recalculatedNetPay,
        items,
        deductions: deductionsResult.rows.map((deduction) => ({
          ...deduction,
          employee_amount: parseFloat(deduction.employee_amount),
          employer_amount: parseFloat(deduction.employer_amount),
          wage_amount: parseFloat(deduction.wage_amount),
          rate_info: deduction.rate_info || {},
        })),
        leave_records: leaveRecords,
        job_sections: jobSections,
        mid_month_payroll: primaryMidMonth
          ? { ...primaryMidMonth, amount: midMonthTotal }
          : null,
        mid_month_payrolls_by_employee: midMonthByEmployee,
        commission_records: commissionRecords,
        others_records: othersRecords,
        pinjam_records: pinjamRecords,
      };

      res.json(response);
    } catch (error) {
      console.error(
        "Error fetching comprehensive employee payroll details:",
        error,
      );
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
        SELECT ep.*, mp.year, mp.month, mp.status as payroll_status, s.name as employee_name,
               s.head_staff_id as head_employee_id
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
      const isGroupedPayroll =
        payrollData.job_type && payrollData.job_type.includes(", ");

      // Get all data in parallel for efficiency
      const [
        itemsResult,
        deductionsResult,
        leaveRecordsResult,
        midMonthResult,
        commissionsResult,
        othersResult,
      ] = await Promise.all([
        // Get payroll items (including job_type, source_employee_id and source tracking for traceability)
        pool.query(
          `
          SELECT pi.id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit,
                pi.quantity, pi.amount, pi.is_manual, pi.job_type, pi.source_employee_id,
                pi.source_date, pi.work_log_id, pi.work_log_type, pi.foc_units,
                pc.pay_type
          FROM payroll_items pi
          LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pi.employee_payroll_id = $1
          ORDER BY pi.source_date ASC NULLS LAST, pi.id
        `,
          [id],
        ),

        // Get payroll deductions
        pool.query(
          `
          SELECT pd.*,
                 CAST(pd.employee_amount AS NUMERIC(10, 2)) as employee_amount,
                 CAST(pd.employer_amount AS NUMERIC(10, 2)) as employer_amount,
                 CAST(pd.wage_amount AS NUMERIC(10, 2)) as wage_amount
          FROM payroll_deductions pd
          WHERE pd.employee_payroll_id = $1
          ORDER BY pd.deduction_type
        `,
          [id],
        ),

        // Get leave records for this employee for the specific month/year
        pool.query(
          `
          SELECT
            to_char(lr.leave_date, 'YYYY-MM-DD') as date,
            lr.employee_id,
            lr.leave_type,
            lr.days_taken,
            lr.amount_paid,
            COALESCE(lr.work_log_id, inferred_mwl.id) as work_log_id,
            CASE
              WHEN dwl.id IS NOT NULL THEN 'daily'
              WHEN linked_mwl.id IS NOT NULL OR inferred_mwl.id IS NOT NULL THEN 'monthly'
              WHEN lr.notes IN ('PACKING_CUTI:MEE_PACKING', 'PACKING_CUTI:BH_PACKING') THEN 'packing_cuti'
              ELSE NULL
            END as work_log_type,
            COALESCE(
              dwl.section,
              linked_mwl.section,
              inferred_mwl.section,
              CASE
                WHEN lr.notes = 'PACKING_CUTI:MEE_PACKING' THEN 'MEE_PACKING'
                WHEN lr.notes = 'PACKING_CUTI:BH_PACKING' THEN 'BH_PACKING'
                ELSE NULL
              END
            ) as work_log_section,
            lr.notes,
            h.description as holiday_description
          FROM leave_records lr
          JOIN staffs s ON s.id = lr.employee_id
          LEFT JOIN daily_work_logs dwl
            ON dwl.id = lr.work_log_id
            AND dwl.log_date = lr.leave_date
          LEFT JOIN monthly_work_logs linked_mwl
            ON linked_mwl.id = lr.work_log_id
            AND linked_mwl.log_year = EXTRACT(YEAR FROM lr.leave_date)
            AND linked_mwl.log_month = EXTRACT(MONTH FROM lr.leave_date)
          LEFT JOIN monthly_work_logs inferred_mwl
            ON lr.work_log_id IS NULL
            AND inferred_mwl.log_year = EXTRACT(YEAR FROM lr.leave_date)
            AND inferred_mwl.log_month = EXTRACT(MONTH FROM lr.leave_date)
            AND inferred_mwl.section = CASE
              WHEN COALESCE(s.job::jsonb, '[]'::jsonb) ? 'MAINTEN' THEN 'MAINTENANCE'
              WHEN COALESCE(s.job::jsonb, '[]'::jsonb) ? 'OFFICE' THEN 'OFFICE'
              WHEN COALESCE(s.job::jsonb, '[]'::jsonb) ? 'SAPU' THEN 'SAPU'
              ELSE NULL
            END
          LEFT JOIN holiday_calendar h
            ON lr.leave_type = 'cuti_umum'
            AND h.holiday_date = lr.leave_date
            AND h.is_active = true
          WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
            AND EXTRACT(YEAR FROM lr.leave_date) = $2
            AND EXTRACT(MONTH FROM lr.leave_date) = $3
            AND lr.status = 'approved'
          ORDER BY lr.leave_date ASC
        `,
          [payrollData.employee_id, payrollData.year, payrollData.month],
        ),

        // Get mid-month payroll data. For grouped payrolls each sibling id can
        // have its own advance (all paid to the same person), so match by name
        // to gather every sibling's advance — mirroring the commission handling.
        isGroupedPayroll
          ? pool.query(
              `
          SELECT
            mmp.*,
            s.name as employee_name
          FROM mid_month_payrolls mmp
          LEFT JOIN staffs s ON mmp.employee_id = s.id
          WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
            AND mmp.year = $2 AND mmp.month = $3
        `,
              [payrollData.employee_id, payrollData.year, payrollData.month],
            )
          : pool.query(
              `
          SELECT
            mmp.*,
            s.name as employee_name
          FROM mid_month_payrolls mmp
          LEFT JOIN staffs s ON mmp.employee_id = s.id
          WHERE mmp.employee_id = $1 AND mmp.year = $2 AND mmp.month = $3
        `,
              [payrollData.employee_id, payrollData.year, payrollData.month],
            ),

        // Get commission records for the specific month/year
        // For grouped payrolls, get commissions for all employees with same name
        isGroupedPayroll
          ? pool.query(
              `
              SELECT cr.*, s.name as employee_name
              FROM commission_records cr
              JOIN staffs s ON cr.employee_id = s.id
              WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
                AND DATE(cr.commission_date) >= $2
                AND DATE(cr.commission_date) <= $3
              ORDER BY cr.commission_date DESC
            `,
              [
                payrollData.employee_id,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`,
              ],
            )
          : pool.query(
              `
              SELECT cr.*, s.name as employee_name
              FROM commission_records cr
              JOIN staffs s ON cr.employee_id = s.id
              WHERE cr.employee_id = $1
                AND DATE(cr.commission_date) >= $2
                AND DATE(cr.commission_date) <= $3
              ORDER BY cr.commission_date DESC
            `,
              [
                payrollData.employee_id,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`,
              ],
            ),

        // Get others (Kerja Luar OT) records for the specific month/year
        isGroupedPayroll
          ? pool.query(
              `
              SELECT orec.*, s.name as employee_name,
                     pc.description as pay_code_description,
                     pc.pay_type as pay_code_pay_type
              FROM others_records orec
              JOIN staffs s ON orec.employee_id = s.id
              LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
              WHERE s.name = (SELECT name FROM staffs WHERE id = $1)
                AND DATE(orec.record_date) >= $2
                AND DATE(orec.record_date) <= $3
              ORDER BY orec.record_date DESC
            `,
              [
                payrollData.employee_id,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`,
              ],
            )
          : pool.query(
              `
              SELECT orec.*, s.name as employee_name,
                     pc.description as pay_code_description,
                     pc.pay_type as pay_code_pay_type
              FROM others_records orec
              JOIN staffs s ON orec.employee_id = s.id
              LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
              WHERE orec.employee_id = $1
                AND DATE(orec.record_date) >= $2
                AND DATE(orec.record_date) <= $3
              ORDER BY orec.record_date DESC
            `,
              [
                payrollData.employee_id,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-01`,
                `${payrollData.year}-${payrollData.month.toString().padStart(2, "0")}-${new Date(payrollData.year, payrollData.month, 0).getDate().toString().padStart(2, "0")}`,
              ],
            ),
      ]);

      // Parse items
      const items = itemsResult.rows.map((item) => ({
        ...item,
        rate: parseFloat(item.rate),
        quantity: parseFloat(item.quantity),
        foc_units: parseFloat(item.foc_units || 0),
        amount: parseFloat(item.amount),
        is_manual: !!item.is_manual,
      }));

      // Parse leave, commission, and others records
      const leaveRecords = leaveRecordsResult.rows.map((record) => ({
        ...record,
        days_taken: parseFloat(record.days_taken),
        amount_paid: parseFloat(record.amount_paid || 0),
      }));
      const commissionRecords = commissionsResult.rows.map((record) => ({
        ...record,
        amount: parseFloat(record.amount),
      }));
      const othersRecords = othersResult.rows.map((record) => ({
        ...record,
        amount: parseFloat(record.amount),
        rate: parseFloat(record.rate),
        quantity: parseFloat(record.quantity),
      }));

      // Recalculate gross_pay using CONSOLIDATED approach (matches frontend display)
      const consolidateItemsAPI = (itemsList) => {
        const groups = new Map();
        itemsList.forEach((item) => {
          const key = `${item.pay_code_id}_${item.rate}_${item.rate_unit}`;
          if (groups.has(key)) {
            const group = groups.get(key);
            group.totalQuantity += item.quantity;
            group.totalFocUnits += item.foc_units || 0;
            group.originalAmountSum += item.amount;
          } else {
            groups.set(key, {
              rate: item.rate,
              rate_unit: item.rate_unit,
              totalQuantity: item.quantity,
              totalFocUnits: item.foc_units || 0,
              originalAmountSum: item.amount,
            });
          }
        });
        let totalCents = 0;
        groups.forEach((group) => {
          if (group.rate_unit === "Percent" || group.rate_unit === "Fixed") {
            totalCents += Math.round(group.originalAmountSum * 100);
          } else {
            const roundedRate = Math.round(group.rate * 100) / 100;
            const totalUnits = group.totalQuantity + group.totalFocUnits;
            totalCents += Math.round(roundedRate * totalUnits * 100);
          }
        });
        return totalCents;
      };

      // Exclude leave-day daily items so the recalculated gross matches the
      // payslip display (which already filters them via filterOutLeaveDayItems).
      const workGrossPayCents = consolidateItemsAPI(
        removeLeaveDayWorkItems(items, buildLeaveDateSet(leaveRecords)),
      );
      const leaveGrossPayCents = leaveRecords.reduce(
        (sum, r) => sum + Math.round(r.amount_paid * 100),
        0,
      );
      const commissionGrossPayCents = commissionRecords.reduce(
        (sum, r) => sum + Math.round(r.amount * 100),
        0,
      );
      const othersGrossPayCents = othersRecords.reduce(
        (sum, r) => sum + Math.round(r.amount * 100),
        0,
      );
      const recalculatedGrossPay =
        (workGrossPayCents +
          leaveGrossPayCents +
          commissionGrossPayCents +
          othersGrossPayCents) /
        100;

      // Recalculate net_pay based on recalculated gross_pay
      const totalDeductions = deductionsResult.rows.reduce(
        (sum, d) => sum + parseFloat(d.employee_amount || 0),
        0,
      );
      const recalculatedNetPay =
        Math.round((recalculatedGrossPay - totalDeductions) * 100) / 100;

      // Aggregate sibling mid-month advances (see comprehensive endpoint): the
      // combined `mid_month_payroll` carries the SUM, while
      // `mid_month_payrolls_by_employee` keeps each sibling's own amount.
      const midMonthRows = midMonthResult.rows.map((row) => ({
        ...row,
        amount: parseFloat(row.amount),
      }));
      const midMonthTotal = midMonthRows.reduce((sum, r) => sum + r.amount, 0);
      const midMonthByEmployee = midMonthRows.reduce((acc, r) => {
        acc[r.employee_id] = r.amount;
        return acc;
      }, {});
      const primaryMidMonth =
        midMonthRows.find((r) => r.employee_id === payrollData.employee_id) ||
        midMonthRows[0] ||
        null;

      // Per-job section names (e.g. {MEE_PACKING: "Mee", BIHUN_SANGKUT: "Bihun"})
      // so each individual breakdown slip shows its own job's Bahagian instead of
      // the combined payroll's (primary job's) section.
      const jobTypeList = (payrollData.job_type || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const jobSectionsResult = jobTypeList.length
        ? await pool.query(
            `SELECT j.id, COALESCE(s.name, j.section) AS section
             FROM jobs j
             LEFT JOIN sections s ON j.section = s.id OR j.section = s.name
             WHERE j.id = ANY($1)`,
            [jobTypeList],
          )
        : { rows: [] };
      const jobSections = jobSectionsResult.rows.reduce((acc, r) => {
        acc[r.id] = r.section;
        return acc;
      }, {});

      // Format comprehensive response
      const response = {
        ...payrollData,
        gross_pay: recalculatedGrossPay,
        net_pay: recalculatedNetPay,
        items,
        deductions: deductionsResult.rows.map((deduction) => ({
          ...deduction,
          employee_amount: parseFloat(deduction.employee_amount),
          employer_amount: parseFloat(deduction.employer_amount),
          wage_amount: parseFloat(deduction.wage_amount),
          rate_info: deduction.rate_info || {},
        })),
        leave_records: leaveRecords,
        job_sections: jobSections,
        mid_month_payroll: primaryMidMonth
          ? { ...primaryMidMonth, amount: midMonthTotal }
          : null,
        mid_month_payrolls_by_employee: midMonthByEmployee,
        commission_records: commissionRecords,
        others_records: othersRecords,
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
    const { monthly_payroll_id, employee_payrolls = [] } = req.body;

    // Validate required fields
    if (
      !monthly_payroll_id ||
      !Array.isArray(employee_payrolls) ||
      employee_payrolls.length === 0
    ) {
      return res.status(400).json({
        message: "monthly_payroll_id and employee_payrolls array are required",
      });
    }

    // Validate each employee payroll
    for (const payroll of employee_payrolls) {
      if (!payroll.employee_id || !payroll.job_type || !payroll.section) {
        return res.status(400).json({
          message:
            "Each employee payroll must have employee_id, job_type, and section",
        });
      }
    }

    const client = await pool.connect();
    const results = [];
    const errors = [];

    try {
      await client.query("BEGIN");

      // Fetch year and month from monthly_payroll for digenapkan calculation
      const monthlyPayrollResult = await client.query(
        `SELECT year, month FROM monthly_payrolls WHERE id = $1`,
        [monthly_payroll_id],
      );
      const { year: payrollYear, month: payrollMonth } =
        monthlyPayrollResult.rows[0] || {};

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
          // Fetch mid_month_payroll amount for digenapkan calculation. Grouped
          // payrolls (job_type has a comma) sum every sibling id's advance by
          // name; single-job payrolls use just this employee's advance.
          const isGroupedSave = (job_type || "").includes(", ");
          const midMonthResult = await client.query(
            isGroupedSave
              ? `SELECT COALESCE(SUM(amount), 0) as amount FROM mid_month_payrolls
                 WHERE employee_id IN (
                   SELECT id FROM staffs WHERE name = (SELECT name FROM staffs WHERE id = $1)
                 ) AND year = $2 AND month = $3`
              : `SELECT COALESCE(amount, 0) as amount FROM mid_month_payrolls
                 WHERE employee_id = $1 AND year = $2 AND month = $3`,
            [employee_id, payrollYear, payrollMonth],
          );
          const midMonthAmount = parseFloat(
            midMonthResult.rows[0]?.amount || 0,
          );

          // Calculate digenapkan (round UP to nearest whole ringgit)
          const jumlah = (net_pay || 0) - midMonthAmount;
          const setelahDigenapkan = Math.ceil(jumlah);
          const digenapkan = setelahDigenapkan - jumlah;

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
              SET job_type = $1, section = $2, gross_pay = $3, net_pay = $4, status = $5,
                  digenapkan = $6, setelah_digenapkan = $7
              WHERE id = $8
              RETURNING *
            `;

            await client.query(updateQuery, [
              job_type,
              section,
              gross_pay || 0,
              net_pay || 0,
              status,
              digenapkan.toFixed(2),
              setelahDigenapkan.toFixed(2),
              employeePayrollId,
            ]);

            // Delete existing non-manual items to replace with new ones (preserve manually added items)
            await client.query(
              "DELETE FROM payroll_items WHERE employee_payroll_id = $1 AND is_manual = false",
              [employeePayrollId],
            );
          } else {
            // Create a new employee payroll
            const insertQuery = `
              INSERT INTO employee_payrolls (
                monthly_payroll_id, employee_id, job_type, section,
                gross_pay, net_pay, status, digenapkan, setelah_digenapkan
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
              digenapkan.toFixed(2),
              setelahDigenapkan.toFixed(2),
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
            status: "success",
          });
        } catch (error) {
          console.error(`Error processing employee ${employee_id}:`, error);
          errors.push({
            employee_id,
            job_type,
            error: error.message,
            status: "error",
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
          errors: errors.length,
        },
      });

      // Run recalculation asynchronously after response is sent
      if (results.length > 0) {
        setImmediate(async () => {
          console.log(
            `Starting async recalculation for ${results.length} payrolls...`,
          );
          const recalculationPromises = results.map(async (result) => {
            try {
              await recalculateAndUpdatePayroll(
                pool,
                result.employee_payroll_id,
              );
            } catch (error) {
              console.error(
                `Error recalculating payroll for employee ${result.employee_id}:`,
                error,
              );
              // Don't fail the entire batch for recalculation errors
            }
          });

          await Promise.all(recalculationPromises);
          console.log(
            `Async recalculation completed for ${results.length} payrolls`,
          );
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

      // Fetch year and month from monthly_payroll for digenapkan calculation
      const monthlyPayrollResult = await pool.query(
        `SELECT year, month FROM monthly_payrolls WHERE id = $1`,
        [monthly_payroll_id],
      );
      const { year: payrollYear, month: payrollMonth } =
        monthlyPayrollResult.rows[0] || {};

      // Fetch mid_month_payroll amount for digenapkan calculation. Grouped
      // payrolls (job_type has a comma) sum every sibling id's advance by name.
      const isGroupedSave = (job_type || "").includes(", ");
      const midMonthResult = await pool.query(
        isGroupedSave
          ? `SELECT COALESCE(SUM(amount), 0) as amount FROM mid_month_payrolls
             WHERE employee_id IN (
               SELECT id FROM staffs WHERE name = (SELECT name FROM staffs WHERE id = $1)
             ) AND year = $2 AND month = $3`
          : `SELECT COALESCE(amount, 0) as amount FROM mid_month_payrolls
             WHERE employee_id = $1 AND year = $2 AND month = $3`,
        [employee_id, payrollYear, payrollMonth],
      );
      const midMonthAmount = parseFloat(midMonthResult.rows[0]?.amount || 0);

      // Calculate digenapkan (round UP to nearest whole ringgit)
      const jumlah = (net_pay || 0) - midMonthAmount;
      const setelahDigenapkan = Math.ceil(jumlah);
      const digenapkan = setelahDigenapkan - jumlah;

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
          SET job_type = $1, section = $2, gross_pay = $3, net_pay = $4, status = $5,
              digenapkan = $6, setelah_digenapkan = $7
          WHERE id = $8
          RETURNING *
        `;

        await pool.query(updateQuery, [
          job_type,
          section,
          gross_pay || 0,
          net_pay || 0,
          status,
          digenapkan.toFixed(2),
          setelahDigenapkan.toFixed(2),
          employeePayrollId,
        ]);

        // Delete existing non-manual items to replace with new ones (preserve manually added items)
        await pool.query(
          "DELETE FROM payroll_items WHERE employee_payroll_id = $1 AND is_manual = false",
          [employeePayrollId],
        );
      } else {
        // Create a new employee payroll
        const insertQuery = `
          INSERT INTO employee_payrolls (
            monthly_payroll_id, employee_id, job_type, section,
            gross_pay, net_pay, status, digenapkan, setelah_digenapkan
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
          digenapkan.toFixed(2),
          setelahDigenapkan.toFixed(2),
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

    // Parse and validate numeric values
    const parsedRate = parseFloat(rate);
    const parsedQuantity = parseFloat(quantity);
    const parsedAmount = amount !== null ? parseFloat(amount) : null;

    if (isNaN(parsedRate) || parsedRate < 0) {
      return res.status(400).json({
        message: "Invalid rate: must be a positive number",
      });
    }

    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({
        message: "Invalid quantity: must be a positive number",
      });
    }

    if (parsedAmount !== null && isNaN(parsedAmount)) {
      return res.status(400).json({
        message: "Invalid amount: must be a number",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify employee payroll exists and monthly payroll is not finalized
      const checkQuery = `
        SELECT ep.id, mp.status as payroll_status
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        WHERE ep.id = $1
      `;
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Employee payroll not found" });
      }

      if (checkResult.rows[0].payroll_status === "Finalized") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot add items to a finalized payroll",
        });
      }

      // Calculate amount if not provided
      let finalAmount = parsedAmount;
      if (finalAmount === null) {
        // Simple calculation based on rate and quantity
        finalAmount = parsedRate * parsedQuantity;
      }

      // Validate final amount
      if (isNaN(finalAmount)) {
        await client.query("ROLLBACK");
        return res.status(500).json({
          message: "Calculation error: resulting amount is invalid",
        });
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

      const insertResult = await client.query(insertQuery, [
        id,
        pay_code_id,
        description,
        parsedRate,
        rate_unit,
        parsedQuantity,
        finalAmount,
      ]);

      await client.query("COMMIT");

      // Recalculate totals and deductions (uses its own transaction)
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
      await client.query("ROLLBACK");
      console.error("Error adding manual payroll item:", error);
      res.status(500).json({
        message: "Error adding manual payroll item",
        error: error.message,
      });
    } finally {
      client.release();
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
  // Preserves employee payrolls that have manual items, only deletes non-manual items from those
  router.delete("/monthly/:monthlyPayrollId", async (req, res) => {
    const { monthlyPayrollId } = req.params;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get all employee payroll IDs for this monthly payroll
      const employeePayrollsResult = await client.query(
        "SELECT id FROM employee_payrolls WHERE monthly_payroll_id = $1",
        [monthlyPayrollId],
      );

      const employeePayrollIds = employeePayrollsResult.rows.map(
        (row) => row.id,
      );

      if (employeePayrollIds.length > 0) {
        // Find employee payrolls that have manual items (these should be preserved)
        const payrollsWithManualItemsResult = await client.query(
          `SELECT DISTINCT employee_payroll_id FROM payroll_items
           WHERE employee_payroll_id = ANY($1) AND is_manual = true`,
          [employeePayrollIds],
        );
        const payrollsWithManualItems = new Set(
          payrollsWithManualItemsResult.rows.map(
            (row) => row.employee_payroll_id,
          ),
        );

        // Separate payrolls into those to preserve (have manual items) and those to delete completely
        const payrollsToPreserve = employeePayrollIds.filter((id) =>
          payrollsWithManualItems.has(id),
        );
        const payrollsToDelete = employeePayrollIds.filter(
          (id) => !payrollsWithManualItems.has(id),
        );

        // For payrolls to preserve: only delete non-manual items and deductions
        if (payrollsToPreserve.length > 0) {
          await client.query(
            "DELETE FROM payroll_deductions WHERE employee_payroll_id = ANY($1)",
            [payrollsToPreserve],
          );
          await client.query(
            "DELETE FROM payroll_items WHERE employee_payroll_id = ANY($1) AND is_manual = false",
            [payrollsToPreserve],
          );
        }

        // For payrolls to delete: remove everything
        let deletedCount = 0;
        if (payrollsToDelete.length > 0) {
          await client.query(
            "DELETE FROM payroll_deductions WHERE employee_payroll_id = ANY($1)",
            [payrollsToDelete],
          );
          await client.query(
            "DELETE FROM payroll_items WHERE employee_payroll_id = ANY($1)",
            [payrollsToDelete],
          );
          const deleteResult = await client.query(
            "DELETE FROM employee_payrolls WHERE id = ANY($1)",
            [payrollsToDelete],
          );
          deletedCount = deleteResult.rowCount;
        }

        await client.query("COMMIT");

        res.json({
          message: "Employee payrolls cleared successfully",
          deleted_count: deletedCount,
          preserved_count: payrollsToPreserve.length,
          cleared_employee_payrolls: employeePayrollIds.length,
        });
      } else {
        await client.query("COMMIT");
        res.json({
          message: "No employee payrolls found for this monthly payroll",
          deleted_count: 0,
          preserved_count: 0,
          cleared_employee_payrolls: 0,
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
