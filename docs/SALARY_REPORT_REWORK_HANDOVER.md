# Salary Report rework + per-entry override — handover

_Last updated 2026-06-19. Context for the Salary Report column logic, the Others `report_column` override, and the recurring "is this a report bug?" questions._

## What the Salary Report is

`src/routes/payroll/salary-report.js` builds the data for the Salary Report (three views: by-name/individual, by-location/grouped, location totals), monthly (`GET /`) and yearly (`GET /yearly`). The PDF is `src/utils/payroll/SalaryReportPDF.tsx`. Columns: **GAJI, OT, BONUS, C/I/O, CUTI**, then G.KASAR (gross), EPF/SOCSO/SIP/PCB, G.BERSIH, ½ BULAN, JUMLAH, DIGENAP, S.DIGENAP.

The report is **read-only** — it reflects whatever payroll processing stored. `G.KASAR` = stored `employee_payrolls.gross_pay`; contributions = stored `payroll_deductions`. If those look wrong, the **payroll itself** is wrong/stale — **re-process that staff** (see Gotchas), don't "fix" the report.

## Column bucketing rule (the core logic, monthly + yearly queries are kept identical)

Each earning is bucketed by **pay_type + rate_unit + an explicit code list + a per-entry override**:

- **OT** = all overtime (payroll `Overtime` items + Kerja-Luar/Others `Overtime`). Shown only here; BONUS does NOT duplicate it.
- **BONUS** = real bonuses only: `BONUS` paycode items + location-null commission (+ Others overridden to BONUS). _Not_ OT.
- **CUTI** = leave_records + Cuti-Tahunan recorded as commission (`location_code='23'` OR `description='cuti tahunan'`) + Cuti-Tahunan in payroll items/Others (description `cuti tahunan`).
- **C/I/O** = incentive/allowance code list `('IXT','ADD_COMM','T-SALESMAN','FULL','HADIR_MEETING','IKUT_BX','JAGA_GATE','BH_JG_FORKLIFT','BH_SUSUN','T_KERJA')` + location commission (loc not null, not 23) + piece-rate "extra".
- **GAJI** = the rest (regular wage). Mechanics: a worker **with an Hour/Day base** → GAJI = all non-piece-rate work (base + Hour/Day maintenance/Sunday), piece-rate (packing) → C/I/O. A worker with **no** Hour/Day base (pure-piece / office monthly salary) → GAJI = their **Base** only, everything else → C/I/O.
- "Piece-rate" = any rate_unit NOT in `('Hour','Day','Fixed')` (Bag/Bundle/Kg/Karung/Tray/Trip/Bill/Percent…). "Wage" rate units = Hour/Day/Fixed.

This rule was reverse-engineered against boss-confirmed staff: ASRI, JAINJAM, MILTI, JEFFERY, JICKSON, ABEN, JEFFRY, JASSON. If you change it, re-validate against those.

## Per-entry override (`others_records.report_column`)

Because the *same* paycode can belong in different columns for different workers (e.g. `FULL` → GAJI for JIRIM but C/I/O for ABEN), there's a manual override:

- DB: `others_records.report_column` (nullable, CHECK in `GAJI/OT/BONUS/CIO/CUTI`). Migration: `migrations/2026-06-19_add_others_records_report_column.sql` (run on prod).
- Report: each Others bucket is `report_column = '<col>' OR (report_column IS NULL AND <automatic rule>)`. NULL = automatic; an override sends the amount to exactly that column. Additive — blank changes nothing.
- API: `src/routes/payroll/others-records.js` (POST + PUT single + PUT linked-propagate) persists it.
- UI: "Salary report column" dropdown in `AddOthersModal.tsx` + `EditOthersModal.tsx`; type in `types.ts` (`OthersRecord.report_column`).
- Scope: **Others/Kerja-Luar entries only** (work-log-generated payroll items follow the automatic rule).

## Sibling-ID aggregation (multi-ID staff)

Many staff have multiple IDs (e.g. JIRIM / JIRIM_PB / JIRIM_PM) combined into one payroll under one head ID. The report aggregates **leave, Others, and commission by NAME** (`employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)`) so amounts recorded under a sibling roll into the one row. Mid-month + pinjam already used this pattern. Payroll items are already combined under the one payroll, so they match by `employee_id`.

Also fixed: the commission post-processing that builds "commission-only" rows now matches **by name** and **skips anyone who already has a payroll** (else a sibling-recorded commission created a duplicate GAJI=0 row).

Processing side: `src/routes/payroll/employee-payrolls.js` `recalculateAndUpdatePayroll` now fetches Others + commission **by name** too (leave already did), so re-processing picks up sibling Kerja-Luar into gross/contributions.

## Decisions the boss made (don't silently reverse these)

- **JUMLAH / S.DIGENAP = total salary INCLUDING advances** (add commission/bonus advances back: `gajiBersih = net + commissionAdvance`). The Bank tab + payslip + Details still show actual take-home (advance deducted) — the report uses a separate `takeHomeSetelah` for those. So report S.DIGENAP can be higher than the payslip; that's intended.
- **BONUS = real bonuses only** (OT never duplicated into BONUS).
- `FULL`, `HADIR_MEETING`, and the 5 Fixed duty codes (IKUT_BX/JAGA_GATE/BH_JG_FORKLIFT/BH_SUSUN/T_KERJA) → C/I/O by default; use the override for exceptions.

## Gotchas / common "is this a bug?" answers

1. **Wrong G.KASAR / contributions / 0 deductions** → almost always a **stale or partially-processed payroll**. Re-process that staff (the report mirrors stored values). 0 contributions can also be legit: foreign staff with `epf/socso/sip` overrides = `none` (e.g. ALSAIH, PETRUS, SAHIRIN) correctly get zero.
2. **Numbers don't match the May-15 printout** → the printout is a snapshot; commission/work data has been edited since. Compare against **current** data, not the printout (e.g. ALSAIH's loc-18 commission is now 1241.48 vs the printout's 2482.96 — a data edit, not a report fault).
3. **A person appears twice / a GAJI=0 row** → sibling commission creating a commission-only row; should be fixed (see above) — verify the by-name skip.
4. **Re-combination changes gross** → re-processing combines same-name siblings under the senior head ID; gross can change if work/production data changed. Not a report issue.

## Validating changes

`node --check src/routes/payroll/salary-report.js`, then extract the query and run it against dev DB:
`docker exec -i tienhock_dev_db psql -U postgres -d tienhock` (port 5434, db `tienhock`, pw in `.env`). Compare bucket sums for the confirmed staff above. To test a re-process, a throwaway script that imports `recalculateAndUpdatePayroll` and calls it with a single pg Client works (BEGIN/COMMIT must stay on one connection).

## Still open

- Verification across all ~77 staff is ongoing; the boss verifies and reports discrepancies. Most remaining ones are data/stale-payroll, not code.
- Changelog entries for this rework + the override are in `ChangelogModal.tsx` (2026-06-19).
