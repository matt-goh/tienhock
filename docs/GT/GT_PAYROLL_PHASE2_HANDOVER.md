# Green Target Payroll — Phase 2 Build: Handover / Progress / Context

**Started:** 2026-06-29
**Status:** IN PROGRESS — Phase 0 (pay-code groundwork)
**Plan file (working):** `C:\Users\matia\.claude\plans\stop-and-let-me-prancy-nest.md`
**Prior context:** `GT_PAYROLL_AUDIT.md` (the first GT payroll upgrade), `GT_PAYROLL_USER_GUIDE_EN.md`.

This document is the living progress/context record for completing the Green Target (GT) payroll system to parity with Tien Hock (TH), plus the net-new **Daily Lori Habuk** driver entry. Update it as each phase lands.

---

## Goal

Bring GT payroll to TH parity and build the missing Daily Lori Habuk piece. Modules: Office/Maintenance monthly entry **with pay codes**, Others (Kerja Luar OT), Others (Advance), Bonus, Pinjam (done), Mid-month (done), Payrolls + Details, Salary Report, E-Caruman, and the net-new Daily Lori Habuk driver entry.

## Confirmed design decisions (from user, 2026-06-29)

1. **Habuk + rentals unified in ONE driver entry.** Rentals-derived trips auto-**prefill** into the daily entry (editable, step=1); manual habuk trips added on top; both feed DRIVER gross. Derivable items (e.g. >6-trip `TRIP_LB6`) auto-prefill. Processing reads the **saved daily log**, not live rentals.
2. **Mixed code-sharing:** configurable shared components (`apiBasePath` prop) for simple pages; separate GT versions reusing sub-components + `gtStatutoryCalc.js` for complex pages; all GT data in `greentarget.*` tables.
3. **GT Salary Report** grouped by OFFICE/DRIVER (no locations) + **GT E-Caruman** with GT codes — both in scope.
4. **UI/UX:** match TH design language exactly — compact spacing, responsive patterns, `TimeNavigator` for list-page month nav (`MonthNavigator` only where TH uses it), full dark mode, reuse shared primitives.

## System facts discovered

- GT jobs: `DRIVER` ("Driver Lori Habuk"), `OFFICE` ("Office"), and `DRIVER_IKUT` (lorry follower). No `staffs.job` rows use DRIVER/OFFICE — GT employees are registered in `greentarget.payroll_employees` (currently: AFRED, JULPAKAL, MASTIN, YONUS = DRIVER; TRACY = OFFICE).
- The TRIP/habuk pay codes are referenced **only** by DRIVER/DRIVER_IKUT job mappings and **no** `employee_pay_codes` — so editing them is low-risk for TH.
- GT `monthly-work-logs` backend already stores pay-code activities (`greentarget.monthly_work_log_activities`); `process-all` already consumes them. Adding Office pay-code support is mostly **frontend**.
- DRIVER pay is currently derived from rentals at process time (`monthly-payrolls.js` lines ~328-431, 512-641). Phase 3 changes this to read saved daily logs.

## Pay-code inventory (Phase 0) — NEEDS USER CONFIRMATION

Legacy DAILY LORI HABUK codes vs current `public.pay_codes`. **Rates in the DB disagree with the legacy screens for several codes — confirm before seeding.**

| Legacy code | Description | Legacy RATE | DB rate_biasa | DB unit | DB pay_type | Status |
|---|---|---|---|---|---|---|
| TRIP5 | TRIP RM 5 | 5.00 | **1.50** | Hour | Tambahan | exists, rate mismatch |
| TRIP7 | TRIP RM 7 | 7.00 | 7.00 | Hour | Tambahan | exists ✓ |
| TRIP8 | TRIP RM 8 | 8.00 | 8.00 | Hour | Tambahan | exists ✓ |
| TRIP9 | TRIP RM 9 | 9.00 | 9.00 | Hour | Tambahan | exists ✓ |
| TRIP10 | TRIP RM 10 | 10.00 | 10.00 | Hour | Tambahan | exists ✓ |
| TRIP6 | TRIP RM 6 | 6.00 | **2.50** | Hour | Tambahan | exists, rate mismatch |
| TRIP_HS | TRIP (HAP SENG) | 6.66? | 6.66 | Hour | Tambahan | exists ✓ |
| TRIP_LB6 | > 6 TRIP SISA KAYU & HABUK | 5.00 | 5.00 | Day | Tambahan | exists ✓ |
| TRIP_CUCUK | CUCUK HABUK (PEMANDU) | 5.00 | **1.00** | Hour | Tambahan | exists, rate mismatch |
| 1ORG | 1 ORANG BEKERJA | — | 0.00 | Day | Overtime | exists |
| TRIP11..TRIP16 | TRIP RM 11..16 | 11..16 | — | — | — | **MISSING** |
| TRIP17,18,19 | TRIP RM 17,18,19 | 17,18,19? | — | — | — | **MISSING** (screen 4 blurry) |
| TRIP20 | TRIP RM 20 | 20.00 | — | — | — | **MISSING** |
| TRIP25 | TRIP RM 25 | 25.00 | — | — | — | **MISSING** |
| TRIP30 | TRIP RM 30 | 30.00 | — | — | — | **MISSING** |
| TRIP35 | TRIP RM 35 | 35.00 | — | — | — | **MISSING** |
| TRIP_LB6_IL | > 6 TRIP SISA KAYU & HABUK (ikut) | 3.00 | — | — | — | **MISSING** |
| TRIP_BIASA_LB6 | TRIP TAMBAHAN BIASA LB6 | 5.00 | — | — | — | **MISSING** |
| TRIP6_IKUT | > LEBIH TRIP RM 6 (IKUT LORI) | 2.50 | — | — | — | **MISSING** |
| TRIP5_IKUT | TRIP RM 5 (IKUT LORI) | 1.50 | — | — | — | **MISSING** |
| COMM_TARIK | TARIK TONG (BERBAYAR) | 5.00? | — | — | — | **MISSING** (screen 4 blurry) |
| COMM_TAMBAHAN | COMM TAMBAHAN: IN-CHARGE ALL D | 20.00? | — | — | — | **MISSING** (screen 4 blurry) |
| TRIP_MASA | TRIP: MASA/CUKUP 6 TRIPS KEATAS | 17.00? | — | — | — | **MISSING** (screen 4 blurry) |
| TBH5 | TAMBAHAN TRIP RM 5 (BAYARAN RM..) | 5.00? | — | — | — | **MISSING** (screen 4 blurry) |

Open questions for user:
- **Authoritative rate per code** (the DB TRIP5=1.50 / TRIP6=2.50 match the *IKUT* variants on screen 3 — likely a legacy mis-map; need the true per-trip RM amounts).
- **rate_unit**: should TRIP codes be `Trip` (quantity = #trips, amount = rate×qty) rather than `Hour`? Legacy entry is trip-quantity based. Likely yes.
- **Screen-4 codes** (TRIP17-19, COMM_TARIK, COMM_TAMBAHAN, TRIP_MASA, TBH5): exact rates/descriptions (screenshot too blurry to trust).

## Phase 0 — DONE (migration `migrations/005_gt_habuk_paycodes.sql`, applied to dev 2026-06-29)

Decisions: re-rate shared codes to legacy values (GT payroll is incomplete everywhere — only TH May is verified — so changes are safe); trip codes → `rate_unit='Trip'`; dedicated `_IKUT` codes for followers.

- Re-rated/converted existing DRIVER codes to Trip unit: TRIP5→5, TRIP6→6, TRIP7/8/9/10, TRIP_HS (6.66), TRIP_CUCUK→5; TRIP_LB6 kept Day/5.
- Added: TRIP11–TRIP35, COMM_TARIK(5,Trip), COMM_TAMBAHAN(20,Fixed), TRIP_MASA(17,Day), TRIP_BIASA_LB6(5,Day), TBH5(5,Trip); follower codes TRIP5_IKUT(1.50), TRIP6_IKUT(2.50), TRIP_LB6_IL(3.00,Day).
- DRIVER job now maps all 31 driver-side codes; DRIVER_IKUT remapped to the 3 `_IKUT` codes (driver-rate codes removed from the follower job).
- No schema (table/column) change → no AGENTS.md/CLAUDE.md schema edit needed. Rental PLACEMENT rule now pays TRIP5=RM5 / TRIP10=RM10 (intended).

**Open (low priority):** confirm rate_unit/pay_type intent for the 3 special codes if the user disagrees (COMM_TARIK per-tong, TRIP_MASA daily, COMM_TAMBAHAN fixed) — all editable in the Pay Codes catalogue.

## Phase 1 — DONE (2026-06-29)

GT Office monthly entry now supports pay codes (parity with TH `MonthlyLogEntryPage`).

- `src/pages/GreenTarget/Payroll/GTMonthlyLogEntryPage.tsx` rewritten: merges OFFICE job pay codes **+ employee pay codes** (employee wins — this is where the office salary `BULAN_BM` Fixed RM lives, which the old page ignored), generates activities, integrates `ManageActivitiesModal` via a per-row "Activities" button, recomputes Hour amounts on hours change, restores saved selections/units on edit. Single Biasa+OT hours model (no Ahad/Umum), no leave (office Fixed base ignores hours; OT uses overtime hours).
- `src/routes/greentarget/monthly-work-logs.js`: POST + PUT now persist `units_produced` (column already existed; GET already returns it via `mwla.*`).
- `process-all` already consumes office activities by stored `calculated_amount` — no backend processing change needed.
- Changelog entry added (`src/components/ChangelogModal.tsx`, 2026-06-29).
- **Maintenance skipped:** GT has no Maintenance staff (only OFFICE/DRIVER).

**Verify next session:** open `/greentarget/payroll/office-log`, select TRACY, click Activities → BULAN_BM (RM1700) should be selectable/selected, set OT hours and confirm OT_OFFICE amount, Save, then Process the month and confirm TRACY's gross = RM1700 (+OT) with correct EPF/SOCSO.

## PDF & export systems — parity with TH (DO NOT FORGET)

GT must reach TH parity on all printed/exported documents. Reuse the TH generators where possible (mixed strategy):

- **Payslip PDF** (per-employee + batch) — already reused in `GTPayrollDetailsPage` via `PrintPayslipButton`/`DownloadPayslipButton`. Add a **batch payslip** action on `GTPayrollPage` (TH has `PrintBatchPayslipsButton` / `PayrollSectionPrintMenu`). (Phase 4)
- **Salary Report PDF** — reuse `src/utils/payroll/SalaryReportPDF.tsx`; GT grouping = OFFICE/DRIVER. (Phase 5)
- **Pinjam summary PDF** — TH has `src/utils/payroll/PinjamPDF.tsx` + print/download on the Pinjam page; GT Pinjam page currently has NO PDF (audit gap). Add it. (fold into Phase 4)
- **Mid-month report PDF + bank text (.txt) export** — TH `MidMonthPayrollPage` has both (`MidMonthPayrollReportPDF` + PBB bank file); GT Mid-month page currently has NEITHER (audit gap). Add both with GT bank details. (fold into Phase 4)
- **E-Caruman export files** — EPF/SOCSO/SIP/PCB text/CSV files with GT registration codes. (Phase 6)

When building each, mirror the TH PDF layout/typography and the print-vs-download + bank-export UX exactly (compact, responsive, dark-mode N/A for PDFs but the trigger buttons follow TH styling).

## Phase status

- [x] Phase 0 — Pay codes & DRIVER mapping (done)
- [x] Phase 1 — GT Office monthly entry with pay codes (done)
- [ ] Phase 2 — GT Others / Advance / Bonus
- [ ] Phase 3 — Daily Lori Habuk driver entry + rewire DRIVER processing
- [ ] Phase 4 — Payrolls + Details parity
- [ ] Phase 5 — GT Salary Report
- [ ] Phase 6 — GT E-Caruman

## Reminders / repo rules in effect

- Every schema change → update `AGENTS.md` + `CLAUDE.md` schema sections.
- User-facing changes → prepend a `CHANGELOG_ENTRIES` entry (date/ms/en) in `src/components/ChangelogModal.tsx`.
- Dev DB access: `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "..."`.
- Don't run build/lint/typecheck unless asked; user tests manually.
