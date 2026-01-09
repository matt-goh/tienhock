// src/utils/payroll/calculateActivityAmount.ts
import {
  multiplyMoney,
  calculatePercentage,
  roundMoney,
} from "./moneyUtils";

// Helper function to get overtime threshold based on day of week
// Saturday (day 6) has 5-hour threshold, other days have 8-hour threshold
function getOvertimeThreshold(logDate?: string): number {
  if (!logDate) return 8;
  const date = new Date(logDate);
  const dayOfWeek = date.getDay();
  // Saturday = 6, use 5-hour threshold; other days use 8-hour threshold
  return dayOfWeek === 6 ? 5 : 8;
}

export function calculateActivityAmount(
  activity: any,
  hours: number = 0,
  contextData: Record<string, any> = {},
  locationType?: "Local" | "Outstation",
  logDate?: string
): number {
  if (!activity.isSelected) return 0;

  let calculatedAmount = 0;
  // Remove the incorrect check for "Commission" pay type

  switch (activity.rateUnit) {
    case "Hour":
    case "Bill":
      // For overtime pay codes, use hoursApplied if provided (for monthly entries)
      // Otherwise calculate overtime as hours beyond threshold (for daily entries)
      // Saturday threshold: 5 hours, Other days: 8 hours
      if (activity.payType === "Overtime") {
        if (activity.hoursApplied !== undefined && activity.hoursApplied !== null) {
          // Monthly entry: use the explicitly provided overtime hours
          calculatedAmount = multiplyMoney(activity.rate, activity.hoursApplied);
        } else {
          // Daily entry: calculate overtime based on day-specific threshold
          const overtimeThreshold = getOvertimeThreshold(logDate);
          const overtimeHours = Math.max(0, hours - overtimeThreshold);
          calculatedAmount = multiplyMoney(activity.rate, overtimeHours);
        }
      } else {
        // Non-OT pay codes
        if (activity.hoursApplied !== undefined && activity.hoursApplied !== null) {
          // Monthly entry: use the explicitly provided hours directly
          calculatedAmount = multiplyMoney(activity.rate, activity.hoursApplied);
        } else {
          // Daily entry: use only regular hours (exclude OT hours)
          // Saturday threshold: 5 hours, Other days: 8 hours
          const overtimeThreshold = getOvertimeThreshold(logDate);
          const regularHours = Math.min(hours, overtimeThreshold);
          calculatedAmount = multiplyMoney(activity.rate, regularHours);
        }
      }
      break;

    case "Day":
    case "Bag":
    case "Trip":
    case "Tray":
      // Calculate based on units produced + FOC
      if (
        activity.unitsProduced !== null &&
        activity.unitsProduced !== undefined
      ) {
        const totalUnits = activity.unitsProduced + (activity.unitsFOC || 0);
        calculatedAmount = multiplyMoney(activity.rate, totalUnits);
      } else if (activity.unitsFOC && activity.unitsFOC > 0) {
        // Only FOC, no regular units
        calculatedAmount = multiplyMoney(activity.rate, activity.unitsFOC);
      } else {
        calculatedAmount = 0;
      }
      break;

    case "Percent":
      // For percentage-based rates, calculate based on units produced
      if (
        activity.unitsProduced !== null &&
        activity.unitsProduced !== undefined
      ) {
        calculatedAmount = calculatePercentage(activity.unitsProduced, activity.rate);
      } else {
        calculatedAmount = 0;
      }
      break;

    case "Fixed":
      // For fixed rates, use unitsProduced as direct amount if provided, otherwise use rate
      if (activity.unitsProduced !== null && activity.unitsProduced !== undefined && activity.unitsProduced > 0) {
        calculatedAmount = activity.unitsProduced;
      } else {
        calculatedAmount = activity.rate || 0;
      }
      break;

    default:
      calculatedAmount = 0;
  }

  return roundMoney(calculatedAmount);
}

// Update the calculateActivitiesAmounts function too
export function calculateActivitiesAmounts(
  activities: any[],
  hours: number = 0,
  contextData: Record<string, any> = {},
  locationType?: "Local" | "Outstation",
  logDate?: string
): any[] {
  return activities.map((activity) => {
    const calculatedAmount = calculateActivityAmount(
      activity,
      hours,
      contextData,
      locationType,
      logDate
    );

    // Auto-deselect zero amount activities unless they are context-linked or special types
    // Don't auto-deselect already selected items
    const shouldAutoDeselect =
      calculatedAmount === 0 &&
      !activity.isContextLinked &&
      !activity.isSelected &&
      activity.rateUnit !== "Bag" &&
      activity.rateUnit !== "Trip" &&
      activity.rateUnit !== "Day" &&
      activity.rateUnit !== "Tray";

    return {
      ...activity,
      calculatedAmount,
      isSelected: shouldAutoDeselect ? false : activity.isSelected,
    };
  });
}
