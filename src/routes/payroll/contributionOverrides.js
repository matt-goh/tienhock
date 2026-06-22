// src/routes/payroll/contributionOverrides.js
// Resolves the effective EPF/SOCSO/SIP treatment for a staff, honouring per-staff
// overrides stored on the staffs table. All override fields are strings or null/undefined;
// NULL/'' => auto (derive from birthdate-based age + nationality).
//
// Override values:
//   *_age_override:           'under_60' | 'over_60' | 'none' (not eligible) | null (auto)
//   epf_nationality_override: 'local' | 'foreign' | null (auto)

// Integer age on the last day of a payroll month (year, 1-based month). Used for
// the SIP/EIS minimum-age check so eligibility follows the employee's age during
// the payroll period rather than the date processing happens to run.
export function ageAtPayrollMonth(birthdate, year, month) {
  const ref = new Date(year, month, 0); // day 0 of next month = last day of this one
  const birth = new Date(birthdate);
  let age = ref.getFullYear() - birth.getFullYear();
  if (
    ref.getMonth() < birth.getMonth() ||
    (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age;
}

// `sipAge` defaults to `age` so callers that don't track a payroll month keep
// their previous behaviour; the payroll calc sites pass the payroll-month age.
export function resolveContributionContext(staff, age, sipAge = age) {
  const derivedLocal = (staff.nationality || "").toLowerCase() === "malaysian";
  const derivedUnder60 = age < 60;

  const pickUnder60 = (ov, fallback) =>
    ov === "under_60" ? true : ov === "over_60" ? false : fallback;

  // EPF
  const epfEligible = staff.epf_age_override !== "none";
  const epfLocal = staff.epf_nationality_override
    ? staff.epf_nationality_override === "local"
    : derivedLocal;
  const epfUnder60 = pickUnder60(staff.epf_age_override, derivedUnder60);
  const epfType = `${epfLocal ? "local" : "foreign"}_${
    epfUnder60 ? "under_60" : "over_60"
  }`;

  // SOCSO
  const socsoEligible = staff.socso_age_override !== "none";
  const socsoOver60 = !pickUnder60(staff.socso_age_override, derivedUnder60);

  // SIP (Malaysian-only stays auto-derived from nationality). EIS covers ages
  // 18-60: the under-60 bound honours the override, while the age-18 lower bound
  // is automatic from the payroll-month age (an employee turning 18 next month
  // is not charged SIP this month).
  const sipEligible = staff.sip_age_override !== "none" && sipAge >= 18;
  const sipUnder60 = pickUnder60(staff.sip_age_override, derivedUnder60);

  return {
    isMalaysian: derivedLocal,
    epf: { eligible: epfEligible, employeeType: epfType },
    socso: { eligible: socsoEligible, isOver60: socsoOver60 },
    sip: { eligible: sipEligible, under60: sipUnder60 },
  };
}
