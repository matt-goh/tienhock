// src/utils/payroll/payrollCalculationService.ts
import { RateUnit, PayType } from "../../types/types";

// Define interfaces for our service
export interface PayrollItem {
  payCodeId: string;
  description: string;
  rate: number;
  rateUnit: RateUnit;
  quantity: number;
  amount: number;
  isManual: boolean;
}

export interface WorkLogActivity {
  pay_code_id: string;
  description: string;
  pay_type: PayType;
  rate_unit: RateUnit;
  rate_used: number;
  hours_applied: number | null;
  units_produced: number | null;
  calculated_amount: number;
}

export interface WorkLogEntry {
  employee_id: string;
  job_id: string;
  total_hours: number;
  activities: WorkLogActivity[];
}

export interface WorkLog {
  id: number;
  log_date: string;
  shift: number;
  day_type: "Biasa" | "Ahad" | "Umum";
  section: string;
  employeeEntries: WorkLogEntry[];
}

export interface EmployeePayroll {
  employeeId: string;
  jobType: string;
  section: string;
  grossPay: number;
  netPay: number;
  endMonthPayment: number;
  payrollItems: PayrollItem[];
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
      // Find entries for this employee and job type
      const employeeEntries = log.employeeEntries.filter(
        (entry) => entry.employee_id === employeeId && entry.job_id === jobType
      );

      employeeEntries.forEach((entry) => {
        // Process each activity in the entry
        entry.activities.forEach((activity) => {
          const payCodeId = activity.pay_code_id;

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
          if (!aggregatedItems[payCodeId]) {
            aggregatedItems[payCodeId] = {
              payCodeId,
              description: activity.description,
              rate: activity.rate_used,
              rateUnit: activity.rate_unit,
              quantity: 0,
              amount: 0,
              isManual: false,
            };
          }

          // Add to existing quantity and amount
          aggregatedItems[payCodeId].quantity += quantity;
          aggregatedItems[payCodeId].amount += activity.calculated_amount;
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
   * @param rateUnit The rate unit (Hour, Day, Bag, Fixed, Percent)
   * @param dayType The day type (Biasa, Ahad, Umum)
   * @returns The calculated amount
   */
  static calculateAmount(
    rate: number,
    quantity: number,
    rateUnit: RateUnit,
    dayType: "Biasa" | "Ahad" | "Umum" = "Biasa"
  ): number {
    let amount = 0;

    // Basic calculation based on rate unit
    switch (rateUnit) {
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
   * @param employeeId Employee ID
   * @param jobType Job type
   * @param section Section
   * @param month Month (1-12)
   * @param year Year
   * @returns Processed employee payroll
   */
  static processEmployeePayroll(
    workLogs: WorkLog[],
    employeeId: string,
    jobType: string,
    section: string,
    month: number,
    year: number
  ): EmployeePayroll {
    // Aggregate work logs to get payroll items
    const payrollItems = this.aggregateWorkLogs(
      workLogs,
      employeeId,
      jobType,
      month,
      year
    );

    // Calculate totals
    const { grossPay, netPay } = this.calculatePayrollTotals(payrollItems);

    // Default to half of net pay for end month payment
    // This could be adjusted based on business rules
    const endMonthPayment = Number((netPay / 2).toFixed(2));

    return {
      employeeId,
      jobType,
      section,
      grossPay,
      netPay,
      endMonthPayment,
      payrollItems,
    };
  }

  /**
   * Calculates total gross and net pay from payroll items
   * @param items Array of payroll items
   * @returns Object with grossPay and netPay
   */
  static calculatePayrollTotals(items: PayrollItem[]): {
    grossPay: number;
    netPay: number;
  } {
    // Sum all amounts to get gross pay
    const grossPay = items.reduce((sum, item) => sum + item.amount, 0);

    // For now, net pay equals gross pay
    // This can be extended to handle deductions
    const netPay = grossPay;

    return {
      grossPay: Number(grossPay.toFixed(2)),
      netPay: Number(netPay.toFixed(2)),
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
    newItem: Omit<PayrollItem, "amount" | "isManual">
  ): PayrollItem[] {
    // Calculate amount for the new item
    const amount = this.calculateAmount(
      newItem.rate,
      newItem.quantity,
      newItem.rateUnit
    );

    // Create new item with calculated amount and manual flag
    const completeItem: PayrollItem = {
      ...newItem,
      amount,
      isManual: true,
    };

    // Return new array with added item
    return [...items, completeItem];
  }
}
