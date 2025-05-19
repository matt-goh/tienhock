// src/utils/payroll/calculateActivityAmount.ts
export function calculateActivityAmount(
  activity: any,
  hours: number = 0,
  contextData: Record<string, any> = {},
  locationType?: "Local" | "Outstation"
): number {
  if (!activity.isSelected) return 0;

  let calculatedAmount = 0;
  const isSalesman = activity.payType === "Commission";

  switch (activity.rateUnit) {
    case "Hour":
      // Skip hour-based calculations for salesmen
      if (isSalesman) {
        calculatedAmount = 0;
      } else {
        // For overtime pay codes, only apply to hours beyond 8
        if (activity.payType === "Overtime") {
          const overtimeHours = Math.max(0, hours - 8);
          calculatedAmount = activity.rate * overtimeHours;
        } else {
          calculatedAmount = activity.rate * hours;
        }
      }
      break;

    case "Day":
    case "Bag":
    case "Trip":
      // Important: For salesman with products, units should be calculated
      // even if they're "Commission" type
      if (
        activity.unitsProduced !== null &&
        activity.unitsProduced !== undefined
      ) {
        calculatedAmount = activity.rate * activity.unitsProduced;
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
        calculatedAmount = (activity.rate * activity.unitsProduced) / 100;
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

  return Number(calculatedAmount.toFixed(2));
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
    const isSalesman = activity.payType === "Commission";

    // IMPORTANT: Only auto-deselect Hour-based activities for salesmen
    // Don't auto-deselect activities with units or selected activities
    const shouldAutoDeselect =
      (!activity.isSelected &&
        calculatedAmount === 0 &&
        !activity.isContextLinked) ||
      (isSalesman && activity.rateUnit === "Hour"); // Only auto-deselect Hour for salesmen

    return {
      ...activity,
      calculatedAmount,
      isSelected: shouldAutoDeselect ? false : activity.isSelected,
    };
  });
}
