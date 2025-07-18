// src/utils/payroll/leaveCalculationService.ts

export interface LeaveAllocation {
  cutiUmum: number;
  cutiTahunan: number;
  cutiSakit: number;
}

/**
 * Calculates years of service from the join date to now.
 * @param {string | Date} dateJoined - The date the employee joined.
 * @returns {number} The total years of service.
 */
export const calculateYearsOfService = (dateJoined: string | Date): number => {
  if (!dateJoined) return 0;
  const now = new Date();
  const joinDate = new Date(dateJoined);
  if (isNaN(joinDate.getTime())) return 0;

  let years = now.getFullYear() - joinDate.getFullYear();
  const monthDiff = now.getMonth() - joinDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getDate() < joinDate.getDate())
  ) {
    years--;
  }
  return Math.max(0, years);
};

/**
 * Calculates leave allocation based on years of service.
 * These values are based on standard Malaysian labor law.
 * @param {string | Date} dateJoined - The date the employee joined.
 * @returns {LeaveAllocation} An object with total leave days for each type.
 */
export const calculateLeaveAllocation = (
  dateJoined: string | Date
): LeaveAllocation => {
  const yearsOfService = calculateYearsOfService(dateJoined);

  let cutiTahunan: number;
  let cutiSakit: number;

  if (yearsOfService < 2) {
    cutiTahunan = 8;
    cutiSakit = 14;
  } else if (yearsOfService < 5) {
    cutiTahunan = 12;
    cutiSakit = 18;
  } else {
    cutiTahunan = 16;
    cutiSakit = 22;
  }

  return {
    cutiUmum: 14, // Fixed for all employees
    cutiTahunan,
    cutiSakit,
  };
};

// NOTE: getLeaveBalance will be implemented once the API is fully consumed.
// It will involve fetching total allocation and subtracting taken leave from `leave_records`.
