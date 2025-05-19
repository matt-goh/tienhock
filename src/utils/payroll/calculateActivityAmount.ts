// src/utils/payroll/calculateActivityAmount.ts
export function calculateActivityAmount(
  activity: any,
  hours: number = 0,
  contextData: Record<string, any> = {},
  locationType?: "Local" | "Outstation"
): number {
  if (!activity.isSelected) return 0;

  let calculatedAmount = 0;
  const isSalesman = activity.payType === "Commission"; // Add a flag to check if this is a salesman activity

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
    case "Product": // New rate unit for salesmen
      calculatedAmount = activity.rate * (activity.unitsProduced || 0);
      break;

    case "Percent":
      // For percentage-based rates, calculate based on units produced
      calculatedAmount = (activity.rate * (activity.unitsProduced || 0)) / 100;
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

// Helper function to recalculate all activities in a list
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
    const shouldAutoDeselect =
      calculatedAmount === 0 &&
      !activity.isContextLinked &&
      activity.rateUnit !== "Bag" &&
      activity.rateUnit !== "Trip" &&
      activity.rateUnit !== "Day" &&
      activity.rateUnit !== "Product"; // Add new Product rate unit

    return {
      ...activity,
      calculatedAmount,
      isSelected: shouldAutoDeselect ? false : activity.isSelected,
    };
  });
}
