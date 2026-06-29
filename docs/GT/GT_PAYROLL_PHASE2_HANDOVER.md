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

## Phase 2 — DONE (2026-06-29)

GT now has Bonus, Others (Advance), and Others (Kerja Luar OT) entry pages with full payroll integration.

- **DB:** `migrations/006_gt_addon_tables.sql` (applied to dev) — new `greentarget.commission_records` (Bonus/Advance; no location_code, Bonus vs Advance split by `is_advance`) and `greentarget.others_records` (mirror of public, keeps link_id/report_column). Schema added to CLAUDE.md + AGENTS.md.
- **Routes:** `src/routes/greentarget/incentives.js` (filters by `is_advance` instead of TH's location/type) and `src/routes/greentarget/others-records.js` (clone of TH others-records on the GT table). Mounted at `/greentarget/api/incentives` and `/greentarget/api/others-records` in `src/routes/index.js`.
- **Processing:** `monthly-payrolls.js` (process-all) fetches the month's commission/others, pushes them into `combinedItems` as payroll_items (Bonus/Advance→Tambahan tagged work_log_type 'bonus'/'advance'; Kerja Luar OT→pay_code pay_type, work_log_type 'others'), raising gross + EPF base. Net subtracts only the `is_advance` commission total. `employee-payrolls.js` recalc mirrors this by summing stored items where work_log_type='advance'. Math matches TH `employee-payrolls.js` (commission all-to-gross, advances-from-net; Kerja Luar OT gross-only, NOT net-deducted — authoritative per TH code lines 616–620, which the older CLAUDE schema note contradicted).
- **Frontend:** `GTBonusPage` (is_advance=false), `GTOthersAdvancePage` (is_advance=true, no location column), `GTOthersKerjaLuarOtPage` — thin clones of the TH pages under `src/pages/GreenTarget/Payroll/`, scoped to GT payroll employees via `useGTPayrollEmployees`.
- **Shared modals (additive, TH unchanged via defaults):** `AddIncentiveModal`/`EditIncentiveModal` gained `apiBasePath`, `forceIsAdvance` (hides Advance toggle + forces value), `allowedEmployeeIds`. `AddOthersModal` gained `apiBasePath` + `allowedEmployeeIds`; `EditOthersModal` gained `apiBasePath`. (Others pay-code list is NOT GT-job-scoped — same as TH, which lists all active pay codes.)
- **Nav:** three items added under the GT Payroll group in `GreenTargetNavData.tsx`.
- **Changelog:** entry added (2026-06-29).

**Follow-up for Phase 4 (Details/payslip parity):** advances are stored as gross payroll_items and netted out via net_pay, but the GT payslip does not yet show an explicit "advance deduction" line (TH does). Numbers (gross/net) are correct; the itemised deduction display is deferred to the Details parity phase.

## Phase 3 — DONE (2026-06-29)

Daily Lori Habuk driver entry + DRIVER processing rewired to read saved daily logs.

- **DB:** `migrations/007_gt_daily_lori_habuk.sql` (applied to dev) — `greentarget.daily_lori_habuk_logs` (header per driver/day, unique (log_date, employee_id)) + `greentarget.daily_lori_habuk_lines` (trip lines; source_type PLACEMENT/PICKUP/ADDON/MANUAL/DERIVED). Schema added to CLAUDE.md + AGENTS.md; `driver_trips` note updated (superseded).
- **Shared helper:** `src/routes/greentarget/driverTripRules.js` — date-aware rental→trip-line derivation (`buildPrefillLinesForDriverDate`, `evaluateCondition`, `deriveTripLb6Line`) extracted from the old process-all DRIVER calc; used by the prefill GET.
- **Route:** `src/routes/greentarget/daily-lori-habuk.js` (mounted `/greentarget/api/daily-lori-habuk`): GET `?date=` returns each active DRIVER's saved log or rentals-prefill; POST upserts one driver-day (ON CONFLICT, full-replace lines); DELETE clears a driver-day.
- **Processing rewire:** `monthly-payrolls.js` DRIVER branch now reads `habukLinesByDriver` (from `daily_lori_habuk_lines` where `log_date` in month AND status='Submitted'), pushing each line as a payroll_item (`work_log_type='daily_habuk'`). Base-salary (Month) logic kept. The old rentals query / `rentalsByDriver` / `addonsByRental` / `evaluateCondition` / `placementRules`/`pickupRules`/`defaultInvoiceAmount` were **removed in the Phase 4 cleanup (2026-06-30)** — the rental→trip rule engine now lives only in `driverTripRules.js` (used by the daily prefill). `greentarget.payroll_rules`/`payroll_settings`/`rental_addons` are still configured via the Settings page and consumed by the prefill, just not by process-all.
- **Frontend:** `src/pages/GreenTarget/Payroll/GTDailyLoriHabukEntryPage.tsx` — date-centric (`TimeNavigator` day mode) driver cards; each card lists trip lines (DRIVER pay-code `<select>` from `useJobPayCodeMappings` `detailedMappings["DRIVER"]`, editable rate/qty, computed amount, source badges); add manual trip; auto TRIP_LB6 DERIVED line (live re-derive on edit, >6 Trip-unit qty); per-driver Save (POST). Nav item "Daily Lori Habuk" added under GT Payroll.
- **Changelog:** entry added (2026-06-29) flagging the saved-log-only behaviour.

**⚠️ Behaviour change (decision #2):** DRIVER trip pay is now strictly from the saved daily log. Months not entered = base salary only (no rental-derived trip pay). The `amount = rate × quantity` convention is used uniformly (matches the old placement/pickup/addon math; differs from `calculateAmount`'s Fixed branch, deliberately).

**Post-Phase-3 fixes (2026-06-29):**
- **Prefill was empty** because `greentarget.rentals.driver` stores the staff **name** (e.g. "YONUS CHAN CHOON FAH"), not the staff id. The daily-habuk prefill GET now matches rentals by `employee_name`, not `employee_id` (`daily-lori-habuk.js`). (The old process-all DRIVER calc had the same latent mismatch — now moot since processing reads the saved daily log keyed by id.)
- **Empty-pay-code rules** (the PICKUP rules currently have no `pay_code_id`) no longer create junk prefill lines — `driverTripRules.js` skips placement/pickup rules whose `pay_code_id` is blank.
- **Daily entry pay-code picker** switched from a native `<select>` to the shared `FormCombobox` (searchable, single mode, per-line query); empty saves are blocked (use Clear instead); a per-driver **Clear** button (with confirm) deletes a saved driver-day via the DELETE endpoint.
- **Payroll Settings pay-code dropdown** (`payroll-rules.js` GET `/pay-codes`) was hardcoded to `id LIKE 'TRIP%'`, hiding the new COMM_TARIK/COMM_TAMBAHAN/TBH5/etc. It now returns every pay code mapped to DRIVER/DRIVER_IKUT plus any configured as an addon paycode, so all habuk codes are selectable when configuring rules & addons.

**Open items for confirmation/Phase 4:**
- TRIP_LB6 trigger = sum of Trip-unit line quantities > 6 (assumption — confirm with user).
- ADDON lines prefill on the rental's `date_placed` (assumption).
- Payslip display of advances (Phase 2 carry-over) + remove now-dead rentals calc from `monthly-payrolls.js`.

## Phase 4 — DONE (2026-06-30)

Payrolls + Details parity: payslip advance display, batch payslip printing, Pinjam PDF, Mid-month PDF + PBB bank export.

- **Backend (no schema change):** `employee-payrolls.js` GET `/:id` items now expose `pi.work_log_type`; `monthly-payrolls.js` GET `/:id` now attaches per-employee `items` (incl. work_log_type/pay_type) + `deductions` (parsed) so batch printing has full data.
- **Shared helper** `src/utils/greenTarget/buildGTPayslipPayroll.ts`: moves add-on items (work_log_type 'advance'/'bonus'→`commission_records` with is_advance; 'others'→`others_records`) out of `items`, leaving only work items — so `PaySlipPDFMake` renders them in dedicated sections + the advance deduction (no double count). Returns `commissionAdvanceTotal`.
- **Details** (`GTPayrollDetailsPage.tsx`): `buildPayslipData` uses the helper; Net Pay summary shows a Gross → Statutory → Advance breakdown when an advance exists (reconciles to stored net_pay).
- **Batch payslips** (`GTPayrollPage.tsx`): `PrintBatchPayslipsButton` + `DownloadBatchPayslipsButton`, payrolls mapped via the helper, `companyName="GREEN TARGET SDN. BHD."`.
- **Pinjam PDF** (`GTPinjamListPage.tsx`): Print/Download via `generatePinjamPDF` from the existing `employeeData` + totals. `PinjamPDF.tsx` gained an optional `companyName` (TH default unchanged).
- **Mid-month** (`GTMidMonthPayrollPage.tsx`): Print/Download report via `generateMidMonthPayrollReportPDF` (net = advance − mid-month pinjam, using `pinjamByEmp` already on the page) + a "Bank File" export porting TH's PBB/IBG `.txt` (Bank-payment only, GT single-ID so one row per employee, sender "GREEN TARGET SDN. BHD."). `MidMonthPayrollReportPDF.tsx` gained an optional `companyName` (threaded via the data object).
- **Changelog** entry added (2026-06-30).

**Known minor gaps (acceptable):** batch payslips don't itemise the mid-month advance line (the enriched monthly GET doesn't return per-employee mid-month; `setelah_digenapkan` is still correct) — the single payslip on the Details page does show it. Batch payslip `jobName` falls back to the GT job_type (TH jobs cache has no OFFICE/DRIVER) — cosmetic.

## Phase 5 — DONE (2026-06-30)

GT Salary Report — monthly + annual (summary + breakdown), grouped by job (OFFICE/DRIVER), auto column bucketing.

- **Backend (no schema change):** `src/routes/greentarget/salary-report.js` (mounted `/greentarget/api/salary-report`). GT has no locations/leave, so the 2444-line TH location SQL is NOT reused; buckets are computed in JS from `employee_payrolls` + `payroll_items` (join `pay_codes` for pay_type/report_column) + `payroll_deductions` + `mid_month_payrolls`. Endpoints: `GET /?year&month` (comprehensive, `location`=job group), `GET /annual?year` (summary), `GET /annual-breakdown?year`. Shared `buildRow` + `loadYearRows` helpers.
- **Auto bucketing:** `pay_codes.report_column` override wins (GAJI/OT/BONUS/CIO→comm/CUTI), else `work_log_type='bonus'`→bonus, `'advance'`→comm (C/I/O), `pay_type='Overtime'`→ot, else gaji. cuti=0. Statutory split majikan/pekerja from deductions; gross/net/mid-month/rounding from stored values.
- **PDF:** `SalaryReportPDF.tsx` gained optional `companyName` (additive, TH default). GT passes "GREEN TARGET SDN. BHD." and `locationMap={OFFICE:"Office",DRIVER:"Driver Lori Habuk"}`. Monthly uses `reportType:"employee-grouped"`; annual `"annual"` / `"annual-breakdown"`.
- **Frontend:** `src/pages/GreenTarget/Payroll/GTSalaryReportPage.tsx` — Monthly/Annual tabs (annual: Summary/Breakdown sub-views), on-screen 18-column table grouped by OFFICE/DRIVER with subtotals + grand total, Print/Download via `generateSalaryReportPDF`. Nav item "Salary Report" added under GT Payroll.
- **Changelog** entry added (2026-06-30).

**Known limitation:** `payroll_items` don't persist `report_column`, so the per-entry `others_records.report_column` override is lost once processed (only `pay_codes.report_column` applies in the report). Acceptable v1.

## Phase 6 — DONE (2026-06-30)

GT E-Caruman — EPF (CSV) + combined SOCSO/EIS/SIP (PERKESO) + PCB (LHDN CP39) exports.

- **Backend (no schema change):** `src/routes/greentarget/e-caruman.js` (mounted `/greentarget/api/e-caruman`). The fixed-width/CSV format generators + helpers are **copied verbatim** from `src/routes/payroll/e-caruman.js` (TH route untouched — statutory formats must stay byte-identical); queries mirror TH but on `greentarget.employee_payrolls`/`monthly_payrolls`/`payroll_deductions` joined to `public.staffs`. Endpoints: `GET /preview`, `GET /epf/export`, `GET /socso-sip/export` (needs employerCode+myCoId), `GET /income-tax/export` (needs eNumber). GT SOCSO deductions already carry `rate_info.keilatan_amount`/`skbbk_amount`.
- **Codes in DB:** `GET /settings` + `PUT /settings` upsert 3 keys into `greentarget.payroll_settings` (`ecaruman_perkeso_employer_code`, `ecaruman_mycoid_ssm`, `ecaruman_lhdn_e_number`) — `ON CONFLICT (setting_key)`. Self-contained; no migration; existing payroll-rules settings endpoint untouched.
- **Frontend:** `src/pages/GreenTarget/Payroll/GTECarumanPage.tsx` — month nav, editable+DB-persisted code fields (Save), preview cards (EPF / SOCSO+EIS / PCB) with counts+totals, simple Blob downloads (all browsers, vs TH's File-System-Access folder picker), missing-EPF inline warning. Nav item "E-Caruman" added under GT Payroll.
- **Changelog** entry added (2026-06-30).

**Tech debt:** the statutory format generators are duplicated between `payroll/e-caruman.js` and `greentarget/e-caruman.js` (deliberate — TH isolation over DRY for compliance code). A future refactor can extract a shared `eCarumanFormats.js` used by both.

## Post-build review (2026-06-30)

Comprehensive scan of Phases 0–6 financial logic. One real bug found + fixed; rest verified sound.

- **BUG FIXED — payslip subtracted the Advance twice.** `PaySlipPDFMake` expects `net_pay = gross − statutory only` and computes `finalPayment = net_pay − midMonth − commissionAdvance`. GT's stored `net_pay` already had the advance removed, so passing it straight through double-deducted the advance on every GT payslip (single + batch) that had an Advance. Fix: `buildGTPayslipPayroll` now re-adds `commissionAdvanceTotal` to `net_pay` so it matches the generator's convention (`net_pay = stored_net + advance = gross − statutory`). Verified correct for no-advance, bonus-only, and advance cases; single slip keeps the mid-month line, batch omits it (already-flagged gap).
- **Verified consistent:** process-all vs `employee-payrolls.js` recalc compute gross/EPF-base/advance/net identically (advance items tagged `work_log_type='advance'`, EPF base excludes Overtime, bonus/advance/non-OT-others in EPF base — matches TH). Add-on items re-inserted with `work_log_type` and are `is_manual=false` (cleared/re-derived on reprocess). Salary-report buckets sum to gross; gaji_bersih/setelah from stored values. E-Caruman GT preview correctly sources EIS from `deduction_type='sip'`; SOCSO Keilatan/SKBBK from `rate_info`. Daily-habuk TRIP_LB6 derivation uses the same >6 Trip-unit rule on backend prefill and frontend live-edit.
- **Pre-existing (not introduced here, out of scope):** GT process-all computes gross from non-manual `combinedItems` and keeps existing manual items on reprocess, so a fresh process-all undercounts gross by any manual items until a recalc runs (adding/editing a manual item triggers the correct recalc). Unchanged by this build.

## Phase status

- [x] Phase 0 — Pay codes & DRIVER mapping (done)
- [x] Phase 1 — GT Office monthly entry with pay codes (done)
- [x] Phase 2 — GT Others / Advance / Bonus (done)
- [x] Phase 3 — Daily Lori Habuk driver entry + rewire DRIVER processing (done)
- [x] Phase 4 — Payrolls + Details parity (done)
- [x] Phase 5 — GT Salary Report (done)
- [x] Phase 6 — GT E-Caruman (done)

**🎉 GT payroll parity build complete (Phases 0–6).** Next session: process a real GT month and verify Phases 3–6 end-to-end (nothing has been processed in dev yet).

## Reminders / repo rules in effect

- Every schema change → update `AGENTS.md` + `CLAUDE.md` schema sections.
- User-facing changes → prepend a `CHANGELOG_ENTRIES` entry (date/ms/en) in `src/components/ChangelogModal.tsx`.
- Dev DB access: `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "..."`.
- Don't run build/lint/typecheck unless asked; user tests manually.
