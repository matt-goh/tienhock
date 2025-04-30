// src/utils/payroll/calculateActivityAmount.ts
export function calculateActivityAmount(
  activity: any,
  hours: number = 0,
  contextData: Record<string, any> = {}
): number {
  if (!activity.isSelected) return 0;

  let calculatedAmount = 0;

  switch (activity.rateUnit) {
    case "Hour":
      // For overtime pay codes, only apply to hours beyond 8
      if (activity.payType === "Overtime") {
        const overtimeHours = Math.max(0, hours - 8);
        calculatedAmount = activity.rate * overtimeHours;
      } else {
        calculatedAmount = activity.rate * hours;
      }
      break;
    case "Day":
      calculatedAmount = activity.rate * (activity.unitsProduced || 0);
      break;
    case "Bag":
      calculatedAmount = activity.rate * (activity.unitsProduced || 0);
      break;
    case "Trip":
      // Trip is calculated based on number of trips (stored in unitsProduced)
      calculatedAmount = activity.rate * (activity.unitsProduced || 0);
      break;
    case "Percent":
      // For percentage-based rates, calculate based on units produced
      calculatedAmount = (activity.rate * (activity.unitsProduced || 0)) / 100;
      break;
    case "Fixed":
      // Fixed rate - just use the rate value directly
      calculatedAmount = activity.rate;
      break;
  }

  return Number(calculatedAmount.toFixed(2));
}

// Helper function to recalculate all activities in a list
export function calculateActivitiesAmounts(
  activities: any[],
  hours: number = 0,
  contextData: Record<string, any> = {}
): any[] {
  return activities.map((activity) => {
    const calculatedAmount = calculateActivityAmount(
      activity,
      hours,
      contextData
    );

    // Auto-deselect zero amount activities unless they are context-linked or Bag type
    const shouldAutoDeselect =
      calculatedAmount === 0 &&
      !activity.isContextLinked &&
      activity.rateUnit !== "Bag";

    return {
      ...activity,
      calculatedAmount,
      isSelected: shouldAutoDeselect ? false : activity.isSelected,
    };
  });
}
