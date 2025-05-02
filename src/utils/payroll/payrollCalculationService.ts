// src/utils/payroll/payrollCalculationService.ts
import {
  RateUnit,
  PayType,
  EmployeePayroll,
  PayrollItem,
} from "../../types/types";

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
   * @returns Processed employee payroll
   */
  static processEmployeePayroll(
    workLogs: WorkLog[],
    employee_id: string,
    job_type: string,
    section: string,
    month: number,
    year: number
  ): EmployeePayroll {
    // Aggregate work logs to get payroll items
    const payrollItem = this.aggregateWorkLogs(
      workLogs,
      employee_id,
      job_type,
      month,
      year
    );

    // Calculate totals
    const { gross_pay, net_pay } = this.calculatePayrollTotals(payrollItem);

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
   * Calculates total gross and net pay from payroll items
   * @param items Array of payroll items
   * @returns Object with grossPay and netPay
   */
  static calculatePayrollTotals(items: PayrollItem[]): {
    gross_pay: number;
    net_pay: number;
  } {
    // Sum all amounts to get gross pay
    const grossPay = items.reduce((sum, item) => sum + item.amount, 0);

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
    newItem: Omit<PayrollItem, "amount" | "is_manual"> & { rate_unit: RateUnit }
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
}
