# May 2026 Bank discrepancy — NISON & AZLIM handover

## Purpose

Three of four staff in the May 2026 Bank report discrepancy are **fixed and
confirmed**. Two remain: **NISON (+16.00)** and **AZLIM (+4.00)**. Their cause
could not be reverse-engineered from our data alone (unlike the others), so we
are **waiting for the user to supply the legacy payslip line items**. This doc
tells you exactly what to do once those numbers arrive.

**Do not change payroll calculation code until you have the legacy numbers and a
rule that produces an EXACT match.** Our system is internally consistent; a wrong
guess would break the ~100 employees who currently match, plus JIRIM/RAMBU which
are already correct.

## Background: what the Bank number is

The Bank report prints, per staff, `setelah_digenapkan - monthly_pinjam`.

Derivation chain (all in the two calc sites below):
```
gross        = consolidated work items + leave + commission + others
EPF base     = (Base + Tambahan work items, EXCLUDING epf_exempt pay codes)
               + leave + commission + (others - overtime others - epf_exempt others)
EPF employee = ceil( getEPFWageCeiling(EPF base) * rate% / 100 )   // ceil per EPF 3rd schedule
SOCSO/SIP    = looked up by FULL gross (current behaviour)
net          = gross - (EPF + SOCSO + SIP + income_tax) - commissionAdvance
setelah      = ceil( net - midMonthAdvance )
Bank         = setelah - monthly_pinjam
```
- `getEPFWageCeiling(w)`: w≤5000 → `ceil(w/20)*20` (round wage UP to next RM20).
- Commission with `is_advance=true` is added to gross AND subtracted as advance
  (so its net effect is roughly just the extra statutory contributions it triggers).
- Leave/commission/others are scoped **by staff name** across sibling IDs.

## The two calculation sites (MUST stay in sync)

1. `src/routes/payroll/monthly-payrolls.js` → `process-all` handler (the bulk path
   the Bank/Salary report depends on). EPF base built around line ~1573.
2. `src/routes/payroll/employee-payrolls.js` → `recalculateAndUpdatePayroll`
   (single-payroll recompute). EPF base built around line ~425.

Any rule change to the EPF/SOCSO/SIP base MUST be applied to BOTH, identically.
There is also a client mirror `src/utils/payroll/contributionCalculations.ts`
(`calculateSOCSO`) — currently unused by the payslip (it reads stored
`payroll_deductions`), but keep it consistent if you touch SOCSO.

Stored values do NOT recompute themselves — the user must **reprocess May 2026**
for any change to take effect.

## Already fixed (do NOT redo — uncommitted in working tree)

1. **JIRIM (+29):** `process-all` scoped commission/others by a single sibling id
   instead of by name. Fixed: both now `WHERE employee_id IN (SELECT id FROM
   staffs WHERE name = $1)` like leave. (monthly-payrolls.js)
2. **RAMBU SOCSO (+21 of 27):** foreign workers were charged employee SOCSO.
   Fixed via `contributionOverrides.js` new `socso.isForeign` (honours
   `epf_nationality_override`, else `staffs.nationality`): foreign → employee
   SOCSO 0, employer on `employer_rate_over_60`. Applied at both calc sites +
   client mirror.
3. **RAMBU EPF (+6, the rest):** added data-driven `pay_codes.epf_exempt`
   (boolean). `BONUS` set true → excluded from EPF base (still in gross/SOCSO/SIP).
   Wired through pay-codes CRUD route, `PayCode` type, and `PayCodeModal` UI
   ("Exclude from EPF" checkbox). EPF base now filters epf_exempt work items and
   subtracts epf_exempt others at both calc sites.

RAMBU and JIRIM now match legacy exactly. Changelog + CLAUDE.md/AGENTS.md schema
docs updated for all three.

Working-tree files touched: `AGENTS.md`, `CLAUDE.md`,
`src/components/ChangelogModal.tsx`, `src/components/Catalogue/PayCodeModal.tsx`,
`src/routes/catalogue/pay-codes.js`, `src/routes/payroll/contributionOverrides.js`,
`src/routes/payroll/employee-payrolls.js`,
`src/routes/payroll/monthly-payrolls.js`, `src/types/types.ts`.
DB (dev): `pay_codes.epf_exempt` column added, `BONUS`=true; `RAMBU_PB`
`epf_nationality_override`='foreign'.

## The two remaining staff — full reconstruction

Both are **local, Malaysian, under 60**. Both reconcile exactly to source records
and to our own formulas — so the gap is a difference vs the **legacy** system, in
the deduction BASES, not a bug in our arithmetic. Reprocessing will NOT change them.

### NISON BIN KOMONG — row `employee_payrolls.id = 281` (employee_id `NISON`)
- Work items: Base 1362.04, Tambahan 289.60, Overtime 590.73.
- Leave: 4 days × 74.32 = 297.28.
- Others (name-scoped): BH_TUGAS47 50.00 (Tambahan), HARI_AHAD_JAM 72.40 ×2 =
  144.80 (Tambahan), IXT 15.00 (Tambahan), OT_DIRECT_GB 264.86 (Overtime).
  othersGross 474.66, of which overtime 264.86.
- Commission: none.
- **Gross 3014.31**; **EPF base 2158.72** (= Base 1362.04 + Tambahan 289.60 +
  leave 297.28 + non-OT others 209.80).
- Deductions: EPF **238** (ceil(2160 × 11%) = ceil(237.6)); SOCSO **15.25** &
  SIP **6.10** (both on full gross 3014.31).
- net 2754.96; midMonth advance **450.00**; **setelah 2305**; monthly pinjam
  89.80; **Bank 2215.20**. **Legacy Bank 2231.20 → setelah 2321 → +16.00.**

Hypotheses tested (none exact):
| Change | setelah | vs 2321 |
|---|--:|--:|
| SOCSO+SIP on OT-excluded base 2158.72 (SOCSO 15.25→10.75, SIP 6.10→4.30) | 2312 | −9 |
| Exclude HARI_AHAD_JAM 144.80 from EPF base (EPF 238→223) | 2320 | −1 |
| HARI_AHAD_JAM out of EPF + SIP on reduced base | 2322 | +1 |

The answer brackets 2320–2322, so it's in the **EPF base and/or SIP base**, but
no single clean rule hits 2321 exactly. Leading lead: `HARI_AHAD_JAM` (Sunday
rest-day pay) excluded from EPF base.

### MOHAMMAD AZLIM BIN SHAFIE — row `employee_payrolls.id = 339` (employee_id `AZLIM`)
- NOTE: `staffs.name` has a DOUBLE space: `'MOHAMMAD  AZLIM BIN SHAFIE'`. Match by
  id `AZLIM` or `name ILIKE '%AZLIM%'`, not a single-spaced literal.
- Work items: Base 1116.16 only (no OT).
- Leave: 3 × 69.76 = 209.28.
- Commission (all `is_advance=true`): 160.00 + 80.24 (Insentif Tidak Tetap) +
  69.76 (Cuti Tahunan) = 310.00.
- Others: none.
- **Gross 1635.44**; EPF base = full gross 1635.44 (no OT).
- Deductions: EPF **181** (ceil(1640 × 11%)); SOCSO **8.25**; SIP **3.30** (all on
  1635.44, commission included in every base).
- net 1132.89; midMonth advance **400.00**; **setelah 733**; no monthly pinjam;
  **Bank 733**. **Legacy 737 → +4.00.**

Hypotheses tested (none exact): excluding commission from SOCSO/SIP bases gives
only +2 (→735); adding EPF exclusion of commission massively overshoots. The
`Cuti Tahunan` 69.76 commission is suspicious (it mirrors the leave amount) but
no clean rule lands on 737.

## WHAT TO DO when the user provides legacy numbers

Ask for / expect, per staff: legacy **EPF**, **SOCSO**, **SIP**, and ideally the
**EPF wage base** printed on the legacy payslip (and the final take-home).

Decision tree (NISON shown; same logic for AZLIM):
1. **Compare legacy EPF to ours.**
   - Legacy EPF ≈ **222–223** (ours 238) → the rule is **EPF-base composition**.
     Find which earning legacy drops from the EPF base. Most likely candidate:
     `HARI_AHAD_JAM` (Sunday pay). Confirm by: legacy EPF base ≈ 2158.72 − 144.80
     = **2013.92** → ceiling 2020 → 11% = 222.2. If so, the fix is to make Sunday
     rest-day pay (and any similar pay code) EPF-exempt — **reuse the existing
     `pay_codes.epf_exempt` flag** (set it on `HARI_AHAD_JAM`); no new code needed
     if it already flows through both calc sites. VERIFY the ceiling/round still
     produces the legacy EPF to the ringgit before committing.
   - Legacy EPF = **238** (same as ours) → it's **SOCSO and/or SIP**. Compare
     legacy SOCSO/SIP to ours:
     - Legacy SOCSO 10.75 / SIP 4.30 → they base SOCSO/SIP on the **OT-excluded
       wage** (2158.72), not full gross. This is a systemic rule (affects everyone
       with OT). Implement by changing the SOCSO/SIP `wage` from `grossPay` to the
       EPF-style OT-excluded base at BOTH calc sites — but FIRST verify it
       reproduces several known-correct staff, not just NISON.
2. **Reproduce the exact legacy `setelah`** by hand with the candidate rule
   (net = gross − new deductions − advances; setelah = ceil(net − midMonth)).
   Only proceed if it matches to the ringgit. If the candidate rule lands ±1,
   check EPF rounding (we use `Math.ceil`; EPF 3rd schedule rounds up — keep ceil
   unless legacy clearly rounds to nearest) and re-examine which earning is
   excluded.
3. **Check generality:** whatever rule you adopt, confirm it does NOT move JIRIM,
   RAMBU, or a sample of currently-correct staff away from their legacy values.
   AZLIM and NISON may have DIFFERENT causes — solve each independently; do not
   force a shared rule that breaks the other.
4. Apply to BOTH calc sites (+ client mirror if SOCSO), add a changelog entry
   (`CHANGELOG_ENTRIES` in `src/components/ChangelogModal.tsx`, newest first, ms+en,
   end-user language), and update CLAUDE.md/AGENTS.md if a pay-code flag or schema
   detail changes. Tell the user to **reprocess May 2026** to apply.

## Verification

- DB access (dev): `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"`.
- After a rule change, the user reprocesses May 2026 from the UI (or POST
  `/api/monthly-payrolls/44/process-all`); then inspect the row:
  `SELECT gross_pay, net_pay, setelah_digenapkan FROM employee_payrolls WHERE id=281;`
  Bank = setelah − monthly_pinjam (NISON pinjam 89.80; AZLIM none).
- `monthly_payrolls.id = 44` is the May 2026 monthly payroll.

## Cautions

- Statutory change: EPF/SOCSO/SIP rules affect all staff — verify broadly.
- Never `toISOString().split('T')[0]` for dates (UTC shift); the repo runs
  Asia/Kuala_Lumpur. Compare `yyyy-MM-dd` strings.
- Do not run build/typecheck/lint unless asked; the user tests manually.
