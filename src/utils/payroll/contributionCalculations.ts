// src/utils/payroll/contributionCalculations.ts
import { EPFRate, SOCSORRate, SIPRate } from "../../types/types";

// Helper to determine employee type based on nationality and age
export const getEmployeeType = (nationality: string, age: number): string => {
  const isLocal = nationality.toLowerCase() === "malaysian";
  const isUnder60 = age < 60; // Changed from 55 to 60

  if (isLocal && isUnder60) return "local_under_60";
  if (isLocal && !isUnder60) return "local_over_60";
  if (!isLocal && isUnder60) return "foreign_under_60";
  return "foreign_over_60";
};

// Helper to find the applicable EPF rate
export const findEPFRate = (
  epfRates: EPFRate[],
  employeeType: string,
  wageAmount: number
): EPFRate | null => {
  const applicableRates = epfRates.filter(
    (rate) => rate.employee_type === employeeType
  );

  if (applicableRates.length === 0) return null;

  // For local employees, check wage threshold
  if (employeeType.startsWith("local_")) {
    // Find the appropriate rate based on wage threshold
    const overThresholdRate = applicableRates.find(
      (rate) => rate.wage_threshold === null
    );
    const underThresholdRate = applicableRates.find(
      (rate) => rate.wage_threshold !== null
    );

    if (
      underThresholdRate &&
      wageAmount <= underThresholdRate.wage_threshold!
    ) {
      return underThresholdRate;
    }
    return overThresholdRate || null;
  }

  // For foreign employees, return the first (and likely only) matching rate
  return applicableRates[0];
};

/**
 * Get the EPF wage ceiling based on salary range
 * @param wageAmount The actual wage amount
 * @returns The ceiling amount to use for EPF calculation
 */
export const getEPFWageCeiling = (wageAmount: number): number => {
  // No EPF deduction for wages <= 10
  if (wageAmount <= 10) {
    return 0;
  }

  // For wages from 10.01 to 5000, use interval of 20
  if (wageAmount <= 5000) {
    // For wages between 10.01 and 20.00, return 20
    if (wageAmount <= 20) {
      return 20;
    }

    // For wages above 20, find the appropriate ceiling
    // The ranges are: 20.01-40, 40.01-60, 60.01-80, etc.
    const rangeNumber = Math.ceil(wageAmount / 20);
    return rangeNumber * 20;
  }

  // For wages above 5000, use interval of 100
  const baseAmount = 5000;
  const excessAmount = wageAmount - baseAmount;
  const rangeNumber = Math.ceil(excessAmount / 100);
  return baseAmount + rangeNumber * 100;
};

// Helper to find the applicable SOCSO rate
export const findSOCSORRate = (
  socsoRates: SOCSORRate[],
  wageAmount: number
): SOCSORRate | null => {
  return (
    socsoRates.find(
      (rate) => wageAmount >= rate.wage_from && wageAmount <= rate.wage_to
    ) || null
  );
};

// Helper to find the applicable SIP rate
export const findSIPRate = (
  sipRates: SIPRate[],
  wageAmount: number
): SIPRate | null => {
  return (
    sipRates.find(
      (rate) => wageAmount >= rate.wage_from && wageAmount <= rate.wage_to
    ) || null
  );
};

// Calculate EPF contribution
export const calculateEPF = (
  epfRate: EPFRate,
  wageAmount: number
): { employee: number; employer: number } => {
  if (!epfRate) return { employee: 0, employer: 0 };

  // Get the wage ceiling based on the range
  const wageCeiling = getEPFWageCeiling(wageAmount);

  // If wage ceiling is 0 (wages <= 10), no EPF deduction
  if (wageCeiling === 0) {
    return { employee: 0, employer: 0 };
  }

  // Calculate employee contribution using the wage ceiling
  const employee = (wageCeiling * epfRate.employee_rate_percentage) / 100;

  // Calculate employer contribution
  let employer = 0;
  if (epfRate.employer_rate_percentage !== null) {
    employer = (wageCeiling * epfRate.employer_rate_percentage) / 100;
  } else if (epfRate.employer_fixed_amount !== null) {
    employer = epfRate.employer_fixed_amount;
  }

  // Apply Math.ceil() to the results
  return {
    employee: Math.ceil(employee),
    employer: Math.ceil(employer),
  };
};

// Calculate SOCSO contribution
export const calculateSOCSO = (
  socsoRate: SOCSORRate,
  wageAmount: number,
  isOver60: boolean = false
): { employee: number; employer: number } => {
  if (!socsoRate) return { employee: 0, employer: 0 };

  // For employees 60 and above: employee pays 0, employer uses special rate
  if (isOver60) {
    return {
      employee: 0, // Employees >= 60 pay nothing for SOCSO
      employer: Math.round(socsoRate.employer_rate_over_60 * 100) / 100,
    };
  }

  // For employees under 60: both pay their respective rates
  return {
    employee: Math.round(socsoRate.employee_rate * 100) / 100,
    employer: Math.round(socsoRate.employer_rate * 100) / 100,
  };
};

// Calculate SIP contribution
export const calculateSIP = (
  sipRate: SIPRate,
  wageAmount: number,
  age: number // Added age parameter
): { employee: number; employer: number } => {
  // Employees 60 and above are not eligible for SIP
  if (!sipRate || age >= 60) return { employee: 0, employer: 0 };

  return {
    employee: Math.round(sipRate.employee_rate * 100) / 100,
    employer: Math.round(sipRate.employer_rate * 100) / 100,
  };
};
