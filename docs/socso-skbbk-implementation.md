# SOCSO SKBBK Implementation — Progress Tracker

Full plan lives at `C:\Users\NCSTi\.claude\plans\okay-it-s-time-to-dazzling-stearns.md`. This file is a slim live tracker — update checkboxes after each phase.

## Background (short)

PERKESO gazetted a new sub-rate **SKBBK** (Skim Bencana Bukan Kerja) that adds an employee-side amount on top of the existing KEILATAN. They also published a new **combined SOCSO + EIS + SKBBK** fixed-width text file (278 chars/line) that replaces both BRG8A.TXT and SIP*.TXT/SIPE*.TXT submissions.

SKBBK rates apply only to payroll periods from **June 2026 onward**. New/recalculated payrolls before June 2026 keep SKBBK at RM0. Historical `payroll_deductions` rows are not touched unless that payroll is recalculated.

## Decisions locked in

- Payslip + Salary Report keep one combined "SOCSO (Pekerja)" line. The KEILATAN/SKBBK split is tracked in `payroll_deductions.rate_info` JSON.
- SKBBK effective date is based on the payroll year/month, not the date the payroll is calculated.
- New export folder: `SOCSO-SIP/{year}/TH/{MM}/`. New filename: `SOCSO-SIP{MMYY}.TXT`.
- Both SOCSO and SIP preview cards on e-Caruman trigger the same combined download.
- One new DB column: `socso_rates.employee_rate_skbbk numeric(10,2) NOT NULL`.

## Phases

- [x] **Phase 0** — Create this tracking doc
- [x] **Phase 1** — DB: add `employee_rate_skbbk` column, backfill 65 rows from PDF, apply to dev DB
- [x] **Phase 2** — Type: add `employee_rate_skbbk` to `SOCSORRate`; PUT `/socso/:id` accepts new field
- [x] **Phase 3** — UI: `SOCSORatesTab` grouped headers, `SOCSORateEditModal` SKBBK input
- [x] **Phase 4** — Calc: update 5 sites (canonical `calculateSOCSO` + orchestrator + 3 inline duplicates incl. greentarget); extend `rate_info` with `keilatan_amount`/`skbbk_amount`
- [x] **Phase 5a** — Backend: `generateCombinedSOCSOSIPContent`, new route `/api/e-caruman/socso-sip/export`, extend `/preview` SOCSO row, deprecate old `/socso/export` and `/sip/export` (return 410 Gone)
- [x] **Phase 5b** — Frontend: both cards call new endpoint, write to `SOCSO-SIP/...`, SOCSO tooltip adds KEILATAN+SKBBK columns, "Combined file" chip on both cards
- [x] **Phase 6** — Changelog entry (2026-05-24); schema line updated in CLAUDE.md + AGENTS.md
- [ ] **Verification** — manual end-to-end test (10 steps in the plan)

## Critical files

| Layer | Path |
|---|---|
| Migration | `dev/migrations/2026_05_24_add_skbbk_rate.sql` |
| Type | `src/types/types.ts` |
| Rate API | `src/routes/payroll/contribution-rates.js` |
| Rate Tab | `src/components/Payroll/ContributionRates/SOCSORatesTab.tsx` |
| Rate Modal | `src/components/Payroll/ContributionRates/SOCSORateEditModal.tsx` |
| Calc canonical | `src/utils/payroll/contributionCalculations.ts` |
| Calc orchestrator | `src/utils/payroll/payrollCalculationService.ts` |
| Calc inline 1 | `src/routes/payroll/employee-payrolls.js` |
| Calc inline 2 | `src/routes/payroll/monthly-payrolls.js` |
| Calc inline 3 (GT) | `src/routes/greentarget/monthly-payrolls.js` |
| Export backend | `src/routes/payroll/e-caruman.js` |
| Export UI | `src/pages/Payroll/Statutory/ECarumanPage.tsx` |
| Changelog | `src/components/ChangelogModal.tsx` |

## Session log

- 2026-05-24 — plan approved, tracker created.
