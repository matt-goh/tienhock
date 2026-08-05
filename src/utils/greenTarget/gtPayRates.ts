// src/utils/greenTarget/gtPayRates.ts
// Green Target pay-rate resolution.
//
// GT payroll employees' rates come from the SHARED Tien Hock catalogue by
// default. On top of that, GT keeps its own override rows and scheduled rate
// changes (served at /greentarget/api/employee-pay-codes) so an employee —
// e.g. a director on both companies' payrolls — can earn a different GT rate.
//
// Precedence per sub-rate (biasa/ahad/umum):
//   GT schedule (latest row with (effective_year, effective_month) <= target
//   month) > GT override > shared (Tien Hock) rate.
// A NULL sub-rate at any level means "no override here" and falls through to
// the next level for that sub-rate only.

export type GTRateSource = "gt_schedule" | "gt_override" | "shared";

/** The three per-day-type rates every pay code carries. */
export interface GTSubRates {
  biasa: number | string | null;
  ahad: number | string | null;
  umum: number | string | null;
}

/** One GT-scoped employee pay-code override row (GET /greentarget/api/employee-pay-codes). */
export interface GTPayCodeOverride {
  id: number;
  employee_id: string;
  pay_code_id: string;
  is_default: boolean;
  override_rate_biasa: number | string | null;
  override_rate_ahad: number | string | null;
  override_rate_umum: number | string | null;
}

/** One GT scheduled rate change (GET /:employeeId/schedules). */
export interface GTPayRateSchedule {
  id: number;
  employee_id: string;
  pay_code_id: string;
  effective_year: number;
  effective_month: number;
  rate_biasa: number | string | null;
  rate_ahad: number | string | null;
  rate_umum: number | string | null;
  notes: string | null;
  created_at?: string;
  created_by?: string | null;
}

export interface ResolvedGTPayRates {
  rate_biasa: number;
  rate_ahad: number;
  rate_umum: number;
  source: GTRateSource;
}

export interface ResolveGTPayRatesParams {
  /** Pay code being resolved (schedules are filtered by it). */
  payCodeId: string;
  /** Shared (Tien Hock) rates after the public employee/job/base merge. */
  shared: GTSubRates;
  /** The employee's GT override row for this pay code, if any. */
  gtOverride?: GTPayCodeOverride | null;
  /** The employee's GT schedules (all pay codes; filtered here). */
  gtSchedules?: GTPayRateSchedule[] | null;
  /** Target payroll month. */
  year: number;
  month: number;
}

/** Numeric columns arrive from pg as strings; null/blank stays null. */
export const toNullableNumber = (
  value: number | string | null | undefined
): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const monthIndex = (year: number, month: number): number => year * 12 + month;

/** Latest schedule row for a pay code effective on/before the target month. */
export const findApplicableSchedule = (
  schedules: GTPayRateSchedule[] | null | undefined,
  payCodeId: string,
  year: number,
  month: number
): GTPayRateSchedule | null => {
  if (!schedules || schedules.length === 0) return null;
  const target = monthIndex(year, month);
  let best: GTPayRateSchedule | null = null;
  for (const schedule of schedules) {
    if (schedule.pay_code_id !== payCodeId) continue;
    const effective = monthIndex(
      schedule.effective_year,
      schedule.effective_month
    );
    if (effective > target) continue;
    if (
      !best ||
      effective > monthIndex(best.effective_year, best.effective_month)
    ) {
      best = schedule;
    }
  }
  return best;
};

/**
 * Resolve the effective GT rates for one employee + pay code + month.
 * The winning source is the highest level any sub-rate came from
 * (schedule > override > shared), which drives the UI source badge.
 */
export const resolveGTPayRates = (
  params: ResolveGTPayRatesParams
): ResolvedGTPayRates => {
  const { payCodeId, shared, gtOverride, gtSchedules, year, month } = params;
  const schedule = findApplicableSchedule(gtSchedules, payCodeId, year, month);

  const pick = (
    scheduledValue: number | string | null | undefined,
    overrideValue: number | string | null | undefined,
    sharedValue: number | string | null
  ): { value: number; source: GTRateSource } => {
    const scheduledRate = toNullableNumber(scheduledValue);
    if (scheduledRate !== null) return { value: scheduledRate, source: "gt_schedule" };
    const overrideRate = toNullableNumber(overrideValue);
    if (overrideRate !== null) return { value: overrideRate, source: "gt_override" };
    return { value: toNullableNumber(sharedValue) ?? 0, source: "shared" };
  };

  const biasa = pick(schedule?.rate_biasa, gtOverride?.override_rate_biasa, shared.biasa);
  const ahad = pick(schedule?.rate_ahad, gtOverride?.override_rate_ahad, shared.ahad);
  const umum = pick(schedule?.rate_umum, gtOverride?.override_rate_umum, shared.umum);

  const source: GTRateSource =
    biasa.source === "gt_schedule" ||
    ahad.source === "gt_schedule" ||
    umum.source === "gt_schedule"
      ? "gt_schedule"
      : biasa.source === "gt_override" ||
        ahad.source === "gt_override" ||
        umum.source === "gt_override"
      ? "gt_override"
      : "shared";

  return {
    rate_biasa: biasa.value,
    rate_ahad: ahad.value,
    rate_umum: umum.value,
    source,
  };
};

/**
 * Group a flat GT override list (GET /greentarget/api/employee-pay-codes/)
 * into employee_id -> pay_code_id -> override for O(1) lookups.
 */
export const groupGTOverridesByEmployee = (
  mappings: GTPayCodeOverride[]
): Record<string, Record<string, GTPayCodeOverride>> => {
  const grouped: Record<string, Record<string, GTPayCodeOverride>> = {};
  for (const mapping of mappings) {
    if (!grouped[mapping.employee_id]) grouped[mapping.employee_id] = {};
    grouped[mapping.employee_id][mapping.pay_code_id] = mapping;
  }
  return grouped;
};
