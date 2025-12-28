// src/utils/payroll/calculateActivityAmount.ts
import {
  multiplyMoney,
  calculatePercentage,
  roundMoney,
} from "./moneyUtils";

export function calculateActivityAmount(
  activity: any,
  hours: number = 0,
  contextData: Record<string, any> = {},
  locationType?: "Local" | "Outstation"
): number {
  if (!activity.isSelected) return 0;

  let calculatedAmount = 0;
  // Remove the incorrect check for "Commission" pay type

  switch (activity.rateUnit) {
    case "Hour":
      // For overtime pay codes, use hoursApplied if provided (for monthly entries)
      // Otherwise calculate overtime as hours beyond 8 (for daily entries)
      if (activity.payType === "Overtime") {
        if (activity.hoursApplied !== undefined && activity.hoursApplied !== null) {
          // Monthly entry: use the explicitly provided overtime hours
          calculatedAmount = multiplyMoney(activity.rate, activity.hoursApplied);
        } else {
          // Daily entry: calculate overtime as hours beyond 8
          const overtimeHours = Math.max(0, hours - 8);
          calculatedAmount = multiplyMoney(activity.rate, overtimeHours);
        }
      } else {
        calculatedAmount = multiplyMoney(activity.rate, hours);
      }
      break;

    case "Day":
    case "Bag":
    case "Trip":
      // Calculate based on units produced
      if (
        activity.unitsProduced !== null &&
        activity.unitsProduced !== undefined
      ) {
        calculatedAmount = multiplyMoney(activity.rate, activity.unitsProduced);
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
      // For fixed rates, use the fixed amount directly
      calculatedAmount = activity.rate || 0;
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
  locationType?: "Local" | "Outstation"
): any[] {
  return activities.map((activity) => {
    const calculatedAmount = calculateActivityAmount(
      activity,
      hours,
      contextData,
      locationType
    );

    // Auto-deselect zero amount activities unless they are context-linked or special types
    // Don't auto-deselect already selected items
    const shouldAutoDeselect =
      calculatedAmount === 0 &&
      !activity.isContextLinked &&
      !activity.isSelected &&
      activity.rateUnit !== "Bag" &&
      activity.rateUnit !== "Trip" &&
      activity.rateUnit !== "Day";

    return {
      ...activity,
      calculatedAmount,
      isSelected: shouldAutoDeselect ? false : activity.isSelected,
    };
  });
}
