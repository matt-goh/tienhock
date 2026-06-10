// src/routes/greentarget/gtStatutoryCalc.js
// Shared statutory deduction calculation for Green Target payroll.
// Logic mirrors the Tien Hock payroll (src/routes/payroll/employee-payrolls.js)
// and is used by both process-all and manual item add/delete recalculation.
import { resolveContributionContext } from "../payroll/contributionOverrides.js";

const SOCSO_SKBBK_EFFECTIVE_YEAR = 2026;
const SOCSO_SKBBK_EFFECTIVE_MONTH = 6;

export const isSOCSOSKBBKEffective = (year, month) => {
  const payrollYear = Number(year);
  const payrollMonth = Number(month);
  return (
    payrollYear > SOCSO_SKBBK_EFFECTIVE_YEAR ||
    (payrollYear === SOCSO_SKBBK_EFFECTIVE_YEAR &&
      payrollMonth >= SOCSO_SKBBK_EFFECTIVE_MONTH)
  );
};

export const findEPFRate = (rates, type, wage) => {
  const applicable = rates.filter((r) => r.employee_type === type);
  if (!applicable.length) return null;
  if (type.startsWith("local_")) {
    const over = applicable.find((r) => r.wage_threshold === null);
    const under = applicable.find((r) => r.wage_threshold !== null);
    return under && wage <= parseFloat(under.wage_threshold) ? under : over || null;
  }
  return applicable[0];
};

export const findRateByWage = (rates, wage) =>
  rates.find(
    (r) => wage >= parseFloat(r.wage_from) && wage <= parseFloat(r.wage_to)
  ) || null;

export const findIncomeTaxRateByWage = (rates, wage) => {
  const lookupWage = Math.ceil(wage);
  return (
    rates.find(
      (r) =>
        lookupWage >= parseFloat(r.wage_from) &&
        lookupWage <= parseFloat(r.wage_to)
    ) || null
  );
};

export const getEPFWageCeiling = (wageAmount) => {
  if (wageAmount <= 10) return 0;
  if (wageAmount <= 20) return 20;
  if (wageAmount <= 5000) return Math.ceil(wageAmount / 20) * 20;
  return 5000 + Math.ceil((wageAmount - 5000) / 100) * 100;
};

/**
 * Fetches the four active statutory rate tables.
 * Accepts a pool or a checked-out client.
 */
export const fetchActiveContributionRates = async (queryable) => {
  const [epfRatesResult, socsoRatesResult, sipRatesResult, incomeTaxRatesResult] =
    await Promise.all([
      queryable.query("SELECT * FROM public.epf_rates WHERE is_active = true"),
      queryable.query(
        "SELECT * FROM public.socso_rates WHERE is_active = true ORDER BY wage_from"
      ),
      queryable.query(
        "SELECT * FROM public.sip_rates WHERE is_active = true ORDER BY wage_from"
      ),
      queryable.query(
        "SELECT * FROM public.income_tax_rates WHERE is_active = true ORDER BY wage_from"
      ),
    ]);
  return {
    epfRates: epfRatesResult.rows,
    socsoRates: socsoRatesResult.rows,
    sipRates: sipRatesResult.rows,
    incomeTaxRates: incomeTaxRatesResult.rows,
  };
};

/**
 * Calculates EPF / SOCSO / SIP / income tax deductions for one GT employee.
 * Returns the deductions array ready for greentarget.payroll_deductions.
 */
export const calculateGTStatutoryDeductions = ({
  staff,
  grossPay,
  epfGrossPay,
  year,
  month,
  epfRates,
  socsoRates,
  sipRates,
  incomeTaxRates,
}) => {
  const age = Math.floor(
    (Date.now() - new Date(staff.birthdate).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000)
  );
  const contributionCtx = resolveContributionContext(staff, age);

  const deductions = [];

  // EPF
  const epfRate = contributionCtx.epf.eligible
    ? findEPFRate(epfRates, contributionCtx.epf.employeeType, epfGrossPay)
    : null;
  if (epfRate) {
    const wageCeiling = getEPFWageCeiling(epfGrossPay);
    if (wageCeiling > 0) {
      const employeeContribution = Math.ceil(
        (wageCeiling * parseFloat(epfRate.employee_rate_percentage)) / 100
      );
      const employerContribution =
        epfRate.employer_rate_percentage !== null
          ? Math.ceil(
              (wageCeiling * parseFloat(epfRate.employer_rate_percentage)) / 100
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

  // SOCSO. SKBBK applies from June 2026 payrolls onward.
  const socsoRate = contributionCtx.socso.eligible
    ? findRateByWage(socsoRates, grossPay)
    : null;
  if (socsoRate) {
    const isOver60 = contributionCtx.socso.isOver60;
    const shouldApplySKBBK = isSOCSOSKBBKEffective(year, month);
    const skbbk =
      shouldApplySKBBK
        ? Math.round(parseFloat(socsoRate.employee_rate_skbbk || 0) * 100) / 100
        : 0;
    const keilatan = isOver60
      ? 0
      : Math.round(parseFloat(socsoRate.employee_rate || 0) * 100) / 100;
    const employee_amount = Math.round((keilatan + skbbk) * 100) / 100;
    const employer_amount = isOver60
      ? Math.round(parseFloat(socsoRate.employer_rate_over_60 || 0) * 100) / 100
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

  // SIP (Malaysian only, under 60)
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

  // Income Tax
  const incomeTaxRate = findIncomeTaxRateByWage(incomeTaxRates, grossPay);
  if (incomeTaxRate) {
    const maritalStatus = staff.marital_status || "Single";
    const spouseEmploymentStatus = staff.spouse_employment_status || null;
    const numberOfChildren = staff.number_of_children || 0;
    let applicableRate = parseFloat(incomeTaxRate.base_rate);

    if (maritalStatus === "Married") {
      const childrenKey = Math.min(numberOfChildren, 10);
      if (spouseEmploymentStatus === "Unemployed") {
        applicableRate =
          parseFloat(incomeTaxRate[`unemployed_spouse_k${childrenKey}`]) ||
          applicableRate;
      } else if (spouseEmploymentStatus === "Employed") {
        applicableRate =
          parseFloat(incomeTaxRate[`employed_spouse_k${childrenKey}`]) ||
          applicableRate;
      }
    }

    if (applicableRate > 0) {
      let taxCategory = maritalStatus;
      if (maritalStatus === "Married") {
        taxCategory += `-K${Math.min(numberOfChildren, 10)}`;
        if (spouseEmploymentStatus) taxCategory += `-${spouseEmploymentStatus}`;
      }
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

  return deductions;
};
