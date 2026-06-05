// src/routes/payroll/contributionOverrides.js
// Resolves the effective EPF/SOCSO/SIP treatment for a staff, honouring per-staff
// overrides stored on the staffs table. All override fields are strings or null/undefined;
// NULL/'' => auto (derive from birthdate-based age + nationality).
//
// Override values:
//   *_age_override:           'under_60' | 'over_60' | 'none' (not eligible) | null (auto)
//   epf_nationality_override: 'local' | 'foreign' | null (auto)

export function resolveContributionContext(staff, age) {
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

  // SIP (Malaysian-only stays auto-derived from nationality)
  const sipEligible = staff.sip_age_override !== "none";
  const sipUnder60 = pickUnder60(staff.sip_age_override, derivedUnder60);

  return {
    isMalaysian: derivedLocal,
    epf: { eligible: epfEligible, employeeType: epfType },
    socso: { eligible: socsoEligible, isOver60: socsoOver60 },
    sip: { eligible: sipEligible, under60: sipUnder60 },
  };
}
