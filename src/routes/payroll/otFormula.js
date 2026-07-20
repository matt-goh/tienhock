// src/routes/payroll/otFormula.js
//
// Shared OT salary-formula contract, effective payroll month July 2026
// (docs/PAYROLL_OT_CALCULATION_JULY_2026_HANDOVER.md, section 8 decisions).
// Used by all three payroll processors (Tien Hock, Green Target, Jelly Polly)
// and their recalculation paths. Pure functions, integer sen (cents) inside.
//
// Formula (rounded to sen at every step — decision 13):
//   numerator (non-OT wage-like earnings, bonus & OT excluded)
//     / divisor days (26 for monthly_26, actual worked days for actual_days)
//     -> daily ordinary rate (sen)
//     / 8 normal hours
//     -> hourly ordinary rate (sen)
//     x 1.5 / 2.0 / 3.0
//     -> Biasa / Ahad / Umum OT rates (sen)

// v2 (2026-07-19, HR model "RAMBU"): paid-leave amounts (Cuti Tahunan / Umum /
// Sakit) are EXCLUDED from the numerator — HR prices leave FROM the derived
// daily rate, so leave can never feed the rate ("holidays are not included in
// the calculation of the overtime rate").
// v3 (2026-07-20, HR model "RAMBU"): "daily log wins" — production dates no
// longer add worked days for a worker whose attendance is on a daily work log.
// See resolveWorkedDayDates below.
export const OT_FORMULA_VERSION = "2026-07.v3";
export const OT_NORMAL_HOURS_PER_DAY = 8;
export const OT_MONTHLY_DIVISOR = 26;
export const OT_MULTIPLIERS = { biasa: 1.5, ahad: 2.0, umum: 3.0 };

/**
 * Effective pay basis for an employee. Priority:
 *   1. explicit staff-form override ('monthly_26' / 'actual_days');
 *   2. actual days when a worked-day source exists (attendance dates from
 *      daily logs/production, or a Worked Days input on the monthly log);
 *   3. ÷26 default for monthly-logged staff with no worked-day source
 *      (monthly work logs are monthly-salaried unless Worked Days is keyed);
 *   4. actual_days otherwise (blocks later with the worked-day error).
 * The staff-form field is therefore OPTIONAL — everything resolves from where
 * the employee's work is recorded; the override exists for odd cases (e.g. a
 * monthly-salaried person with a stray attendance date).
 * @param {string|null|undefined} otPayBasis staffs.ot_pay_basis
 * @param {{hasWorkedDaySource?: boolean, isMonthlyLogged?: boolean}} [context]
 * @returns {'monthly_26'|'actual_days'}
 */
export const resolveOTPayBasis = (
  otPayBasis,
  { hasWorkedDaySource = false, isMonthlyLogged = false } = {},
) => {
  if (otPayBasis === "monthly_26") return "monthly_26";
  if (otPayBasis === "actual_days") return "actual_days";
  if (hasWorkedDaySource) return "actual_days";
  if (isMonthlyLogged) return "monthly_26";
  return "actual_days";
};

/**
 * Worked-day dates for one employee / sibling group, applying "daily log wins".
 *
 * When a daily work log records the worker's attendance for the month, that log
 * IS the attendance record: production rows booked against the worker (or
 * against a packing sibling ID) are piece-work OUTPUT for the month, not extra
 * worked days. Production dates are the attendance FALLBACK only for workers
 * with no daily work log at all that month, so production-only packers keep
 * their divisor unchanged.
 *
 * HR model "RAMBU" (July 2026): 9 dryer daily-log days, plus packing production
 * booked on 4 further dates against her RAMBU_PB sibling ID, is 9 worked days —
 * not 13. Counting the packing-only dates diluted the daily rate (RM97.06
 * instead of RM145.76) because those dates carried piece work worth as little
 * as RM0.35 while adding a full day to the divisor.
 *
 * @param {Array<{d: string, src?: string}>} entries attendance rows for the group
 * @returns {{dates: Set<string>, source: 'attendance'|'production'|null}}
 */
export const resolveWorkedDayDates = (entries) => {
  const daily = new Set();
  const production = new Set();
  (entries || []).forEach((entry) => {
    if (!entry || !entry.d) return;
    if (entry.src === "production") production.add(entry.d);
    else daily.add(entry.d);
  });
  if (daily.size > 0) return { dates: daily, source: "attendance" };
  if (production.size > 0) return { dates: production, source: "production" };
  return { dates: new Set(), source: null };
};

/**
 * Formula cutoff: payroll year/month (NOT work-log creation or payment date).
 * @param {number|string} year
 * @param {number|string} month 1-12
 * @returns {boolean}
 */
export const isOTFormulaEffective = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  return y > 2026 || (y === 2026 && m >= 7);
};

/**
 * Whether a payroll item is priced by the salary formula.
 * Scope (decision 10): pay_type Overtime, hourly quantity, not a manual/hand
 * edited item (decision 16), and the pay code has not opted out to 'fixed'.
 * Items outside this scope always keep their configured/keyed rate & amount
 * (Day/Fixed special OT payments, manual items, opted-out codes).
 * @param {{pay_type?: string, rate_unit?: string, is_manual?: boolean, pay_code_id?: string|null}} item
 * @param {Map<string, string>|null} otRateModeByPayCode pay_code_id -> 'salary_formula'|'fixed'
 * @returns {boolean}
 */
export const isFormulaOTItem = (item, otRateModeByPayCode) => {
  if ((item.pay_type || "") !== "Overtime") return false;
  if ((item.rate_unit || "") !== "Hour") return false;
  if (item.is_manual) return false;
  if (item.pay_code_id && otRateModeByPayCode) {
    const mode = otRateModeByPayCode.get(item.pay_code_id);
    if (mode === "fixed") return false;
  }
  return true;
};

/**
 * Derives the month's OT rates. All money in integer sen.
 * Never returns zero/Infinity rates silently: invalid input yields errors and
 * the caller must block that employee (decision 15).
 *
 * @param {object} args
 * @param {'monthly_26'|'actual_days'|null|undefined} args.payBasis
 * @param {number} args.numeratorCents wage-like earnings in sen (bonus/OT excluded)
 * @param {number|null} [args.workedDays] required when payBasis = 'actual_days'
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   divisorDays: number|null,
 *   dailyRateCents: number,
 *   hourlyRateCents: number,
 *   rateCents: { biasa: number, ahad: number, umum: number },
 * }}
 */
export const computeOTRates = ({ payBasis, numeratorCents, workedDays }) => {
  const errors = [];

  if (payBasis !== "monthly_26" && payBasis !== "actual_days") {
    errors.push(
      "OT Pay Basis pekerja belum ditetapkan. Tetapkan OT Pay Basis (Monthly ÷ 26 atau Actual worked days) pada borang pekerja, kemudian proses semula.",
    );
  }

  let divisorDays = null;
  if (payBasis === "monthly_26") {
    divisorDays = OT_MONTHLY_DIVISOR;
  } else if (payBasis === "actual_days") {
    const days = Number(workedDays);
    if (!Number.isFinite(days) || days <= 0) {
      errors.push(
        "Tiada kiraan hari bekerja untuk bulan ini. Tarikh kehadiran tidak dijumpai; isi Worked Days pada log kerja bulanan, atau jika pekerja ini bergaji bulan, tetapkan OT Pay Basis kepada Monthly (÷26) pada borang pekerja, kemudian proses semula.",
      );
    } else if (days > 31) {
      errors.push(
        `Kiraan hari bekerja ${days} bukan bilangan hari sebulan yang sah.`,
      );
    } else {
      divisorDays = days;
    }
  }

  if (!Number.isFinite(numeratorCents) || numeratorCents <= 0) {
    errors.push(
      "Asas gaji OT (gaji + tambahan layak) ialah sifar untuk bulan ini, jadi kadar OT tidak dapat dikira. Semak pendapatan pekerja atau tetapkan kod gaji OT kepada mod kadar Fixed.",
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      divisorDays,
      dailyRateCents: 0,
      hourlyRateCents: 0,
      rateCents: { biasa: 0, ahad: 0, umum: 0 },
    };
  }

  // Sen-rounded at each intermediate step (decision 13; HR worked example
  // RM2,500 -> 96.15 -> 12.02 -> 18.03).
  const dailyRateCents = Math.round(numeratorCents / divisorDays);
  const hourlyRateCents = Math.round(dailyRateCents / OT_NORMAL_HOURS_PER_DAY);
  const rateCents = {
    biasa: Math.round(hourlyRateCents * OT_MULTIPLIERS.biasa),
    ahad: Math.round(hourlyRateCents * OT_MULTIPLIERS.ahad),
    umum: Math.round(hourlyRateCents * OT_MULTIPLIERS.umum),
  };

  return {
    ok: true,
    errors,
    divisorDays,
    dailyRateCents,
    hourlyRateCents,
    rateCents,
  };
};

/**
 * Normalizes a day-type label to the multiplier key.
 * @param {string|null|undefined} dayType 'Biasa'|'Ahad'|'Umum' (any case)
 * @returns {'biasa'|'ahad'|'umum'}
 */
export const normalizeDayType = (dayType) => {
  const value = String(dayType || "").toLowerCase();
  if (value === "ahad") return "ahad";
  if (value === "umum") return "umum";
  return "biasa";
};

/**
 * @param {{biasa:number, ahad:number, umum:number}} rateCents
 * @param {string|null|undefined} dayType
 * @returns {number} sen
 */
export const otRateCentsForDayType = (rateCents, dayType) =>
  rateCents[normalizeDayType(dayType)];

/**
 * Day type of a calendar date: 'Umum' if in the holiday set, 'Ahad' on Sunday,
 * else 'Biasa'. Mirrors the processors' existing getDayType helpers.
 * @param {string} ymd 'YYYY-MM-DD'
 * @param {Set<string>} holidaySet 'YYYY-MM-DD' entries
 * @returns {'Biasa'|'Ahad'|'Umum'}
 */
export const dayTypeFromDate = (ymd, holidaySet) => {
  if (holidaySet && holidaySet.has(ymd)) return "Umum";
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y || !m || !d) return "Biasa";
  return new Date(y, m - 1, d).getDay() === 0 ? "Ahad" : "Biasa";
};

/**
 * Audit snapshot persisted on employee_payrolls.ot_calculation (section 9.4).
 * Money fields in RM for readability; the source arithmetic is exact sen.
 *
 * @param {object} args
 * @param {'monthly_26'|'actual_days'} args.payBasis
 * @param {number} args.numeratorCents
 * @param {Object<string, number>} args.numeratorBreakdownCents label -> sen
 * @param {number} args.excludedBonusCents
 * @param {number} args.excludedOtCents
 * @param {number} [args.excludedLeaveCents] paid-leave amounts kept out of the basis
 * @param {ReturnType<typeof computeOTRates>} args.rates
 * @param {string|null} [args.workedDaysSource]
 * @returns {object}
 */
export const buildOTSnapshot = ({
  payBasis,
  numeratorCents,
  numeratorBreakdownCents,
  excludedBonusCents,
  excludedOtCents,
  excludedLeaveCents = 0,
  rates,
  workedDaysSource = null,
}) => {
  const rm = (cents) => Math.round(cents) / 100;
  const breakdown = {};
  Object.entries(numeratorBreakdownCents || {}).forEach(([label, cents]) => {
    if (cents) breakdown[label] = rm(cents);
  });
  return {
    version: OT_FORMULA_VERSION,
    pay_basis: payBasis,
    numerator: rm(numeratorCents),
    numerator_breakdown: breakdown,
    excluded_bonus: rm(excludedBonusCents || 0),
    excluded_overtime: rm(excludedOtCents || 0),
    excluded_leave: rm(excludedLeaveCents || 0),
    divisor_days: rates.divisorDays,
    worked_days_source: workedDaysSource,
    normal_hours_per_day: OT_NORMAL_HOURS_PER_DAY,
    daily_rate: rm(rates.dailyRateCents),
    hourly_rate: rm(rates.hourlyRateCents),
    multipliers: OT_MULTIPLIERS,
    rates: {
      biasa: rm(rates.rateCents.biasa),
      ahad: rm(rates.rateCents.ahad),
      umum: rm(rates.rateCents.umum),
    },
  };
};
