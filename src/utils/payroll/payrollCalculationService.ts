// src/utils/payroll/payrollCalculationService.ts
import {
  RateUnit,
  PayType,
  EmployeePayroll,
  PayrollItem,
  EPFRate,
  SOCSORRate,
  SIPRate,
  IncomeTaxRate,
  PayrollDeduction,
} from "../../types/types";
import {
  getEmployeeType,
  findEPFRate,
  findSOCSORRate,
  findSIPRate,
  calculateEPF,
  calculateSOCSO,
  calculateSIP,
  getEPFWageCeiling,
  findIncomeTaxRate,
  calculateIncomeTax,
} from "./contributionCalculations";
import { groupItemsByType } from "./payrollUtils";

export interface WorkLogActivity {
  pay_code_id: string;
  description: string;
  pay_type: PayType;
  rate_unit: RateUnit;
  rate_used: number;
  hours_applied: number | null;
  units_produced: number | null;
  calculated_amount: number;
  source?: "job" | "employee";
}

export interface WorkLogEntry {
  employee_id: string;
  job_id: string;
  total_hours: number;
  activities: WorkLogActivity[];
}

export interface LeaveRecord {
  date: string;
  leave_type: string;
  days_taken: number;
  amount_paid: number;
}

export interface WorkLog {
  id: number;
  log_date: string;
  shift: number;
  day_type: "Biasa" | "Ahad" | "Umum";
  section: string;
  employee_entries: WorkLogEntry[];
}

export class PayrollCalculationService {
  /**
   * Aggregates daily work logs into monthly payroll items
   * @param workLogs Array of work logs for the month
   * @param employeeId Employee ID to filter for
   * @param jobType Job type to filter for
   * @param month Month (1-12)
   * @param year Year
   * @returns Array of aggregated payroll items
   */
  static aggregateWorkLogs(
    workLogs: WorkLog[],
    employeeId: string,
    jobType: string,
    month: number,
    year: number
  ): PayrollItem[] {
    // Filter logs for the specified month and year
    const targetLogs = workLogs.filter((log) => {
      const logDate = new Date(log.log_date);
      return logDate.getMonth() + 1 === month && logDate.getFullYear() === year;
    });

    // Group by pay code and aggregate quantities and amounts
    const aggregatedItems: Record<string, PayrollItem> = {};

    // Process each work log
    targetLogs.forEach((log) => {
      // Skip logs with missing employeeEntries
      if (!log.employee_entries || !Array.isArray(log.employee_entries)) {
        return;
      }

      // Find entries for this employee and job type
      const employeeEntries =
        log.employee_entries?.filter(
          (entry) =>
            entry.employee_id === employeeId && entry.job_id === jobType
        ) || [];

      employeeEntries.forEach((entry) => {
        // Process each activity in the entry
        entry.activities.forEach((activity) => {
          const pay_code_id = activity.pay_code_id;

          // Determine quantity based on rate unit
          let quantity = 0;
          if (
            activity.rate_unit === "Hour" &&
            activity.hours_applied !== null
          ) {
            quantity = activity.hours_applied;
          } else if (
            (activity.rate_unit === "Bag" ||
              activity.rate_unit === "Trip" ||
              activity.rate_unit === "Day" ||
              activity.rate_unit === "Percent") &&
            activity.units_produced !== null
          ) {
            quantity = activity.units_produced;
          } else if (activity.rate_unit === "Fixed") {
            quantity = 1; // Fixed rates are always quantity 1
          }

          // Initialize or update aggregated item
          if (!aggregatedItems[pay_code_id]) {
            aggregatedItems[pay_code_id] = {
              pay_code_id,
              description: activity.description,
              pay_type: activity.pay_type,
              rate: activity.rate_used,
              rate_unit: activity.rate_unit,
              quantity: 0,
              amount: 0,
              is_manual: false,
            };
          }

          // Add to existing quantity and amount
          aggregatedItems[pay_code_id].quantity += quantity;
          aggregatedItems[pay_code_id].amount += activity.calculated_amount;
        });
      });
    });

    // Convert to array and return
    return Object.values(aggregatedItems);
  }

  /**
   * Calculates amount based on rate, quantity, rate unit and day type
   * @param rate The rate amount
   * @param quantity The quantity (hours, bags, etc.)
   * @param rate_unit The rate unit (Hour, Day, Bag, Fixed, Percent)
   * @param dayType The day type (Biasa, Ahad, Umum)
   * @returns The calculated amount
   */
  static calculateAmount(
    rate: number,
    quantity: number,
    rate_unit: RateUnit,
    dayType: "Biasa" | "Ahad" | "Umum" = "Biasa"
  ): number {
    let amount = 0;

    // Basic calculation based on rate unit
    switch (rate_unit) {
      case "Hour":
      case "Day":
      case "Bag":
      case "Trip":
        amount = rate * quantity;
        break;
      case "Percent":
        amount = (rate * quantity) / 100;
        break;
      case "Fixed":
        amount = rate; // Fixed rate is just the rate amount
        break;
      default:
        amount = 0;
    }

    // Round to 2 decimal places for money values
    return Number(amount.toFixed(2));
  }

  /**
   * Processes a single employee's monthly payroll
   * @param workLogs Array of work logs for the month
   * @param employee_id Employee ID
   * @param job_type Job type
   * @param section Section
   * @param month Month (1-12)
   * @param year Year
   * @param leaveRecords Array of leave records for the month (optional)
   * @returns Processed employee payroll
   */
  static processEmployeePayroll(
    workLogs: WorkLog[],
    employee_id: string,
    job_type: string,
    section: string,
    month: number,
    year: number,
    leaveRecords?: LeaveRecord[]
  ): EmployeePayroll {
    // Aggregate work logs to get payroll items
    const payrollItem = this.aggregateWorkLogs(
      workLogs,
      employee_id,
      job_type,
      month,
      year
    );

    // Calculate totals including leave records
    const { gross_pay, net_pay } = this.calculatePayrollTotals(payrollItem, leaveRecords);

    return {
      employee_id,
      job_type,
      section,
      gross_pay,
      net_pay,
      items: payrollItem,
    };
  }

  /**
   * Calculates total gross and net pay from payroll items and leave records
   * @param items Array of payroll items
   * @param leaveRecords Array of leave records (optional)
   * @returns Object with grossPay and netPay
   */
  static calculatePayrollTotals(items: PayrollItem[], leaveRecords?: LeaveRecord[]): {
    gross_pay: number;
    net_pay: number;
  } {
    // Sum all amounts to get gross pay from work items
    const workGrossPay = items.reduce((sum, item) => sum + item.amount, 0);
    
    // Sum all leave amounts
    const leaveGrossPay = leaveRecords 
      ? leaveRecords.reduce((sum, record) => sum + record.amount_paid, 0) 
      : 0;
    
    // Total gross pay includes both work and leave
    const grossPay = workGrossPay + leaveGrossPay;

    // For now, net pay equals gross pay
    // This can be extended to handle deductions
    const netPay = grossPay;

    return {
      gross_pay: Number(grossPay.toFixed(2)),
      net_pay: Number(netPay.toFixed(2)),
    };
  }

  /**
   * Adds a manual payroll item
   * @param items Existing payroll items
   * @param newItem New manual item to add
   * @returns Updated array of payroll items
   */
  static addManualPayrollItem(
    items: PayrollItem[],
    newItem: Omit<PayrollItem, "amount" | "is_manual"> & {
      rate_unit: RateUnit;
      pay_type: PayType;
    }
  ): PayrollItem[] {
    // Calculate amount for the new item
    const amount = this.calculateAmount(
      newItem.rate,
      newItem.quantity,
      newItem.rate_unit
    );

    // Create new item with calculated amount and manual flag
    const completeItem: PayrollItem = {
      ...newItem,
      amount,
      is_manual: true,
    };

    // Return new array with added item
    return [...items, completeItem];
  }

  /**
   * Calculate EPF, SOCSO, and SIP deductions for an employee
   * @param payrollItems Array of payroll items to calculate separate totals
   * @param employeeId Employee ID for age/nationality lookup
   * @param staffs Array of staff data (from cache)
   * @param epfRates Array of EPF rates
   * @param socsoRates Array of SOCSO rates
   * @param sipRates Array of SIP rates
   * @param incomeTaxRates Array of Income Tax rates (optional, default is empty)
   * @param leaveRecords Array of leave records for additional gross pay calculation (optional)
   * @returns Array of calculated deductions
   */
  static calculateContributions(
    payrollItems: PayrollItem[],
    employeeId: string,
    staffs: any[],
    epfRates: EPFRate[],
    socsoRates: SOCSORRate[],
    sipRates: SIPRate[],
    incomeTaxRates: IncomeTaxRate[] = [],
    leaveRecords?: LeaveRecord[]
  ): PayrollDeduction[] {
    const deductions: PayrollDeduction[] = [];

    // Find employee in staff cache
    const employee = staffs.find((s) => s.id === employeeId);
    if (!employee) {
      console.warn(`Employee ${employeeId} not found in staff cache`);
      return deductions;
    }

    // Calculate age
    const birthDate = new Date(employee.birthdate);
    const age = Math.floor(
      (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );

    // Get nationality
    const nationality = employee.nationality || "Malaysian";

    // Group payroll items by type
    const groupedItems = groupItemsByType(payrollItems);

    // Calculate leave amounts
    const leaveGrossPay = leaveRecords 
      ? leaveRecords.reduce((sum, record) => sum + record.amount_paid, 0) 
      : 0;

    // Calculate EPF gross pay (excludes Overtime but includes leave)
    const epfGrossPay =
      groupedItems.Base.reduce((sum, item) => sum + item.amount, 0) +
      groupedItems.Tambahan.reduce((sum, item) => sum + item.amount, 0) +
      leaveGrossPay;

    // Calculate total gross pay (includes all pay types and leave for SOCSO and SIP)
    const totalGrossPay = payrollItems.reduce(
      (sum, item) => sum + item.amount,
      0
    ) + leaveGrossPay;

    // Determine employee type for EPF
    const employeeType = getEmployeeType(nationality, age);

    // 1. Calculate EPF (using EPF gross pay without overtime)
    const epfRate = findEPFRate(epfRates, employeeType, epfGrossPay);
    if (epfRate) {
      const epfContribution = calculateEPF(epfRate, epfGrossPay);

      // Get the wage ceiling for display purposes
      const wageCeiling = getEPFWageCeiling(epfGrossPay);

      deductions.push({
        deduction_type: "epf",
        employee_amount: epfContribution.employee,
        employer_amount: epfContribution.employer,
        wage_amount: epfGrossPay, // Show the amount used for EPF calculation
        rate_info: {
          rate_id: epfRate.id,
          employee_rate: `${epfRate.employee_rate_percentage}%`,
          employer_rate: epfRate.employer_rate_percentage
            ? `${epfRate.employer_rate_percentage}%`
            : `RM${epfRate.employer_fixed_amount}`,
          age_group: employeeType,
          // Add wage ceiling info for transparency
          wage_ceiling_used: wageCeiling,
        },
      });
    }

    // 2. Calculate SOCSO (using total gross pay including overtime)
    const socsoRate = findSOCSORRate(socsoRates, totalGrossPay);
    if (socsoRate) {
      const socsoContribution = calculateSOCSO(
        socsoRate,
        totalGrossPay,
        age >= 60
      );
      deductions.push({
        deduction_type: "socso",
        employee_amount: socsoContribution.employee,
        employer_amount: socsoContribution.employer,
        wage_amount: totalGrossPay,
        rate_info: {
          rate_id: socsoRate.id,
          employee_rate: age >= 60 ? "RM0.00" : `RM${socsoRate.employee_rate}`,
          employer_rate:
            age >= 60
              ? `RM${socsoRate.employer_rate_over_60}`
              : `RM${socsoRate.employer_rate}`,
          age_group: age >= 60 ? "60_and_above" : "under_60",
        },
      });
    }

    // 3. Calculate SIP (using total gross pay including overtime, only for employees under 60)
    if (age < 60) {
      const sipRate = findSIPRate(sipRates, totalGrossPay);
      if (sipRate) {
        const sipContribution = calculateSIP(sipRate, totalGrossPay, age);
        deductions.push({
          deduction_type: "sip",
          employee_amount: sipContribution.employee,
          employer_amount: sipContribution.employer,
          wage_amount: totalGrossPay,
          rate_info: {
            rate_id: sipRate.id,
            employee_rate: `RM${sipRate.employee_rate}`,
            employer_rate: `RM${sipRate.employer_rate}`,
            age_group: "under_60",
          },
        });
      }
    }

    // 4. Calculate Income Tax (using total gross pay)
    const incomeTaxRate = findIncomeTaxRate(incomeTaxRates, totalGrossPay);
    if (incomeTaxRate) {
      // Get employee's income tax information
      const maritalStatus = employee.maritalStatus || "Single";
      const spouseEmploymentStatus = employee.spouseEmploymentStatus || null;
      const numberOfChildren = employee.numberOfChildren || 0;

      const incomeTaxContribution = calculateIncomeTax(
        incomeTaxRate,
        totalGrossPay,
        maritalStatus,
        spouseEmploymentStatus,
        numberOfChildren
      );

      if (incomeTaxContribution.employee > 0) {
        deductions.push({
          deduction_type: "income_tax",
          employee_amount: incomeTaxContribution.employee,
          employer_amount: 0,
          wage_amount: totalGrossPay,
          rate_info: {
            rate_id: incomeTaxRate.id,
            employee_rate: `RM${incomeTaxContribution.employee}`,
            employer_rate: "RM0.00",
            tax_category: incomeTaxContribution.taxCategory,
          },
        });
      }
    }

    return deductions;
  }

  /**
   * Enhanced employee payroll processing that includes deductions
   * @param workLogs Array of work logs for the month
   * @param employee_id Employee ID
   * @param job_type Job type
   * @param section Section
   * @param month Month (1-12)
   * @param year Year
   * @param staffs Array of staff data
   * @param epfRates Array of EPF rates
   * @param socsoRates Array of SOCSO rates
   * @param sipRates Array of SIP rates
   * @param incomeTaxRates Array of Income Tax rates (optional, default is empty)
   * @param leaveRecords Array of leave records for the month (optional)
   * @returns Processed employee payroll with deductions
   */
  static processEmployeePayrollWithDeductions(
    workLogs: WorkLog[],
    employee_id: string,
    job_type: string,
    section: string,
    month: number,
    year: number,
    staffs: any[],
    epfRates: EPFRate[],
    socsoRates: SOCSORRate[],
    sipRates: SIPRate[],
    incomeTaxRates: IncomeTaxRate[] = [],
    leaveRecords?: LeaveRecord[]
  ): EmployeePayroll & { deductions: PayrollDeduction[] } {
    // First calculate the basic payroll (including leave records)
    const basePayroll = this.processEmployeePayroll(
      workLogs,
      employee_id,
      job_type,
      section,
      month,
      year,
      leaveRecords
    );

    // Calculate deductions based on gross pay (which now includes leave amounts)
    const deductions = this.calculateContributions(
      basePayroll.items,
      employee_id,
      staffs,
      epfRates,
      socsoRates,
      sipRates,
      incomeTaxRates,
      leaveRecords
    );

    // Calculate total employee deductions
    const totalEmployeeDeductions = deductions.reduce(
      (sum, deduction) => sum + deduction.employee_amount,
      0
    );

    // Update net pay by subtracting deductions
    const net_pay = basePayroll.gross_pay - totalEmployeeDeductions;

    return {
      ...basePayroll,
      net_pay: Number(net_pay.toFixed(2)),
      deductions,
    };
  }
}
