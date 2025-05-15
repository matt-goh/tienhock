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

  const employee = (wageAmount * epfRate.employee_rate_percentage) / 100;

  let employer = 0;
  if (epfRate.employer_rate_percentage !== null) {
    employer = (wageAmount * epfRate.employer_rate_percentage) / 100;
  } else if (epfRate.employer_fixed_amount !== null) {
    employer = epfRate.employer_fixed_amount;
  }

  return {
    employee: Math.round(employee * 100) / 100,
    employer: Math.round(employer * 100) / 100,
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
