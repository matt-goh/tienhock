This is a large multi-phase Jelly Polly payroll and production implementation project. Start by understanding the existing Tien Hock payroll/production systems and the Green Target payroll handover before coding. Then produce a phased implementation plan and call out any assumptions, risks, TH-specific logic, or places where reuse may be harder than expected.

Core goal:
Implement Jelly Polly's own payroll, staff/paycode, work-log, report, PDF, and production systems, using Tien Hock as the main 1:1 reference wherever possible, but keeping JP-specific data and workflows properly separated.

Important reference files:
- `src/pages/Payroll/MonthlyLog/MonthlyLogEntryPage.tsx`
- `src/pages/Payroll/DailyLog/DailyLogEntryPage.tsx`
- `src/pages/Payroll/PayrollDetailsPage.tsx`
- `src/pages/Stock/ProductionEntryPage.tsx`
- `src/pages/Catalogue/ProductPage.tsx`
- `docs/GT/GT_PAYROLL_PHASE2_HANDOVER.md`

Follow existing repo rules and architecture. Read before writing. Reuse existing components, routes, helpers, cache patterns, and payroll logic where practical. If reuse requires too many conditionals or makes the code messy, create a clean JP-specific version instead.

## Phase 1: JP Staff And Paycode Foundation

Implement Jelly Polly's own staff and paycode system.

It should be 1:1 with Tien Hock's system wherever possible, including:
- staff records,
- pay codes,
- staff/job assignments,
- employee pay-code overrides,
- job pay-code mappings,
- pay-code scheduling,
- effective rate schedules,
- statutory contribution handling,
- payroll overrides,
- and the HEAD/sub-ID system for staff with multiple IDs but the same name.

The HEAD system is important:
- JP must support the same multi-ID same-name staff handling as Tien Hock.
- If a staff member has multiple IDs, work entered under sub IDs should be attributable correctly to the HEAD where the TH system already does that.

If any part of the Tien Hock staff/paycode logic is TH-specific and should not be copied directly, identify it clearly before deciding how to adapt it.

For now, JP staff and paycodes can use mock/test data so I can test the system. Real staff/paycodes will be entered by staff later after the project is implemented.

## Phase 2: JP Staff Assignment Interface

Build an interface that lets users assign JP staff to their job/page responsibilities.

Requirements:
- Let users assign staff to JP Office payroll, Maintenance, Salesman, daily machine pages, Plastic, and Production.
- Some pages may only have one assigned staff.
- Staff may have one or multiple jobs/pages assigned.
- Use user-managed mappings instead of hardcoded staff lists.

## Phase 3: JP Monthly Payroll Pages

Implement the following JP pages/systems 1:1 with Tien Hock, except they must use JP's own staff/paycodes/mappings:
- Office
- Maintenance
- Salesman
- Others / Kerja Luar OT
- Others / Advance
- Bonus
- Pinjam
- Mid-month pay
- Payroll calculation
- Payroll details
- Salary report
- E-Caruman
- PDFs for the relevant payroll/report outputs

Office and Maintenance should use the same system as `src/pages/Payroll/MonthlyLog/MonthlyLogEntryPage.tsx`.

Salesman should also be 1:1 with Tien Hock, including salesman ikut, but product unit should be carton instead of bag. This should come from the paycode unit where possible.

JP payroll data is small, so JP should reprocess only affected staff whenever a JP work log or payroll-related entry is saved instead of copying TH's full reprocess flow.

## Phase 4: JP Daily Machine Pages

Add these JP daily menus/pages:
- Daily Ice-Polly Machine
- Daily Jelly Cup Machine

These should be based 1:1 on Tien Hock's BIHUN and MEE daily machine system, with JP-specific tweaks:
- only show the shift toggle,
- default shift should be day,
- include bungkusan input,
- no paycode mapping is needed for bungkusan.

## Phase 5: JP Daily Machine Plastic Page

Create a JP-exclusive Daily Machine Plastic entry page.

For each staff row, the entry page should have exactly these inputs:
- number of 30ml cartons produced,
- number of 70ml cartons produced,
- day/night shift toggle.

This page must support staff with multiple IDs but the same name. If cartons are entered under sub IDs, carton production should roll up into the HEAD ID.

## Phase 6: JP Production System

Build Jelly Polly's production system like `src/pages/Stock/ProductionEntryPage.tsx`.

Differences:
- JP production products come from the existing shared product catalogue.
- Only JP products from that catalogue should appear in JP production.
- Production staff are Jelly Polly-exclusive staff.
- Production staff assignment must be supported in the staff assignment interface.
- Keep the drag-and-drop worker ordering mechanism.
- Reuse the existing product cache where possible.

## Data And Architecture Expectations

Before implementing, inspect the existing database/schema patterns for Tien Hock payroll, Green Target payroll, Jelly Polly existing tables/routes, staff/paycode/payroll relationships, production entries, product catalogue structure, payroll reports, and PDFs.

Use the Green Target payroll implementation and `docs/GT/GT_PAYROLL_PHASE2_HANDOVER.md` as a reference for how a second company payroll system was separated from Tien Hock.

If database changes are needed, keep JP data separated where appropriate and update schema documentation in `AGENTS.md` and `CLAUDE.md`.

## Primary Success Criteria

- JP has its own staff/paycode/payroll foundation.
- JP can assign staff to Office, Maintenance, Salesman, daily machine, plastic machine, and production workflows.
- JP monthly payroll flows match Tien Hock behavior where intended.
- JP daily machine pages work with their JP-specific inputs.
- JP plastic machine production rolls sub-ID entries into HEAD IDs.
- JP production pages work with JP products from the shared catalogue.
- Payroll calculations, payslips, reports, e-caruman, and PDFs are available for JP.
- The system avoids unnecessary TH-style full reprocessing and reprocesses affected JP staff when entries are saved.

---

# Progress Log

## Confirmed Design Decisions

1. ~~(v1)~~ **Superseded by the v2 pivot below:** JP now has its OWN catalogue (jellypolly.staffs/jobs/pay_codes/mappings/rate schedules/leave). JP membership is managed by `jellypolly.payroll_employees`.
2. Plastic carton pay uses `JP_CTN_30ML` and `JP_CTN_70ML` with `rate_unit='Ctn'`; sub-ID work rolls up to HEAD payroll rows.
3. ~~(v1)~~ **Superseded:** JP production entries/worker orders live in `jellypolly.production_entries` / `jellypolly.production_worker_orders`; products stay shared (`products.type='JP'`); stock movement branches by product type.
4. JP Salesman rows come from JP invoices through `/jellypolly/api/invoices/salesman-products`.
5. Statutory contributions are computed per company on that company's gross. Combined TH+JP statutory contribution calculation is out of scope for v1.
6. Payslip/report display name is "JELLY POLLY"; GOH THAI HO remains relevant only to e-invoice submission context.
7. JP leave/cuti is 1:1 with TH but on JP's own ledger (`jellypolly.leave_records` + `jellypolly.employee_leave_balances`) since the catalogues are separate.

## Completed Work

- Phase 0 DB foundation: `dev/migrations/008_jp_payroll_foundation.sql`, `009_jp_seed_mock_data.sql`, `010_jp_leave_link.sql`, and `011_jp_leave_company.sql` were applied to dev. `dev/migrations/JP_PROD_DEPLOY.sql` bundles the production schema/data setup without mock `JPT_*` staff, test assignments, employee overrides, or dev payroll data.
- Phase 1+2 staff assignment: added JP job configs, `/jellypolly/api/payroll-employees`, `useJPPayrollEmployees`, `JPStaffAssignmentPage`, and JP nav entries.
- Phase 3 payroll: added JP payroll processor, monthly payroll routes, employee payroll details, manual items, cross-company take-home card, salary report, e-caruman, add-on routes/pages, payslip support, salesman payroll flow, and per-staff reprocess hooks.
- Phase 4 daily machine pages: added JP Ice-Polly and Jelly Cup daily log pages with shift toggle, bungkusan context data, JP staff assignments, and JP auto-reprocess.
- Phase 5 plastic machine page: added JP Plastic daily entry with 30ml/70ml carton inputs, day/night shift, saved JP daily-log rows, and HEAD rollup through the processor.
- Phase 6 production: added JP Production Entry with JP products, JP production staff, `JP_PRODUCTION` worker ordering, shared production save endpoints, and JP Product Stock / Production Records / Product Adjustments nav.
- Follow-up flag 7: JP Production Entry now uses `TimeNavigator`, exposes Product Pay Code Mapping filtered to JP products, and JP payroll consumes `product_pay_codes` for JP production entries.
- Follow-up flag 9: removed the Office Entry button from `src/pages/JellyPolly/Payroll/JPPayrollPage.tsx`.
- Schema docs updated in `AGENTS.md` and `CLAUDE.md`, including `leave_records.jp_work_log_id`, `leave_records.company`, and the JP payroll tables.
- Changelog entry added for the user-visible JP payroll and production rollout.

## Current Open Items / Flags

1. ~~TH salesman double-pay risk~~ **RESOLVED (2026-07-03): double pay is INTENDED, confirmed with the user.** TH's `/api/invoices/salesman-products` keeps merging TH + Jelly Polly invoices (TH salesmen are paid for JP sales through the TH product-named pay codes / public.product_pay_codes), AND the JP salesman page pays the same JP sales again from JP invoices via the JP catalogue's product-named pay codes on the JP_SALESMAN/JP_SALESMAN_IKUT job mappings. Do not "fix" this.
2. E-Caruman registration codes must be entered on the JP E-Caruman page before exports work.
3. Mock rates in `009_jp_seed_mock_data.sql` and `JP_PROD_DEPLOY.sql` are placeholders; real pay codes/rates should be configured in the shared Pay Codes catalogue before first real payroll.
4. Mock staff cleanup in dev: `DELETE FROM public.staffs WHERE id LIKE 'JPT_%'` (assignments/logs cascade), plus `DELETE FROM jellypolly.monthly_payrolls;` for test payroll data.
5. Browser verification is still pending; dev server restart (`rs`) is needed to pick up new routes before end-to-end testing.

## Verification Notes

- Backend syntax checks previously passed for `src/routes/jellypolly/jpPayrollProcessor.js`, `src/routes/jellypolly/monthly-work-logs.js`, and `src/routes/jellypolly/daily-work-logs.js`.
- Dev DB spot checks previously verified office fixed salary processing, plastic carton HEAD rollup, JP leave pay, and JP production pay through mapped product pay codes.

## v2 Pivot — JP OWN Catalogue (2026-07-03)

Per user direction, JP no longer shares the TH staff/pay-code catalogue. Everything JP now lives in the jellypolly schema; only products (`public.products`, type='JP') and the holiday calendar stay shared.

**DB (fresh dev migrations, applied 2026-07-03):**
- `008_jp_payroll_foundation.sql` (v2) — Section 0 cleans the old shared-catalogue build (drops v1 jellypolly payroll tables, deletes the JP rows/mock staff from the public catalogue by EXACT ids — `JP_IP`/`JP_STOCK`/`JPTOCK` are real TH codes and untouched — restores the TH worker-order scope, drops `leave_records.jp_work_log_id`; `leave_records.company` stays as an inert TH-side marker). Then creates: `jellypolly.staffs/jobs/pay_codes/job_pay_codes/employee_pay_codes/pay_rate_schedules` + `jellypolly.get_effective_pay_rate()` + `jellypolly.product_pay_codes`, the payroll/work-log/add-on tables (FKs now to the JP catalogue), `jellypolly.leave_records` (work_log_id FK jellypolly.daily_work_logs CASCADE) + `jellypolly.employee_leave_balances`, and `jellypolly.production_entries` + `jellypolly.production_worker_orders` (scope JP_PRODUCTION).
- `009_jp_seed_mock_data.sql` (v2) — JP jobs (JP_* ids kept so code refs stay stable), JP pay codes incl. product-named salesman Ctn codes (S-25ML, MEQ-25ML, MEQ-60ML, S-60ML, AQ-60ML; ikut via job_pay_codes override rates on JP_SALESMAN_IKUT), mappings, mock JPT_* staff (now in jellypolly.staffs; cleanup `DELETE FROM jellypolly.staffs WHERE id LIKE 'JPT_%'`), leave balances, one product mapping.
- `010_jp_leave_link.sql` deleted (superseded); `011_jp_leave_company.sql` kept for the record (user ran the company ALTER manually).
- `JP_PROD_DEPLOY.sql` rewritten (v2): guarded company ALTER + full schema + structural seeds (jobs/pay codes/mappings), NO mock data.

**Backend:**
- New JP catalogue routes (clones of the TH ones, schema-qualified): `src/routes/jellypolly/{staffs,jobs,pay-codes,job-pay-codes,employee-pay-codes,pay-rate-schedules,product-pay-codes,leave-management,production-entries}.js`, mounted under `/jellypolly/api/*`.
- All existing jellypolly routes + `jpPayrollProcessor.js` repointed to the JP catalogue (staffs/pay_codes/jobs joins, `jellypolly.get_effective_pay_rate`, `jellypolly.product_pay_codes`, `jellypolly.production_entries`); leave reads/writes `jellypolly.leave_records` (no company column, `work_log_id` link).
- Public `stock/production-entries.js` fully reverted to pre-JP state. `stock/stock.js` movements + closing-batch branch by product type: JP products read `jellypolly.production_entries` and union sales from BOTH companies' invoices (TH products keep byte-identical semantics via an equivalent subquery form).
- Cross-company endpoint reworked: matches the person BY NAME across `public.staffs` and `jellypolly.staffs` (per-catalogue sibling id sets).
- TH `company <> 'JP'` leave filters kept (inert no-ops; column exists).

**Frontend:**
- New JP cache hooks in `src/utils/JellyPolly/`: `useJPStaffsCache`, `useJPJobsCache`, `useJPJobPayCodeMappings`, `useJPEffectiveRates` (own localStorage keys). All JP pages swapped onto them.
- Shared components gained a `company?: "tienhock" | "jellypolly"` (or `apiBase`) prop, defaults unchanged for TH: `AddIncentiveModal`, `AddOthersModal`, `EditOthersModal`, `AddManualItemModal`, `StaffPayCodesSection` (+ its nested `BatchManageEmployeePayCodesModal`, `EditEmployeePayCodeRatesModal`, `EditPayCodeRatesModal`, `BatchManageJobPayCodesModal`), `AssociatePayCodesWithJobsModal`, `AssociatePayCodesWithEmployeesModal`, `ProductPayCodeMappingModal`, the four PayslipButtons, and `WorkerEntryGrid` (`workerOrderApiBase`). JP pages pass the JP values.
- New JP Catalogue pages (clones on `/jellypolly/api/*`): `src/pages/JellyPolly/Catalogue/{JPStaffPage,JPStaffAddPage,JPStaffFormPage,JPStaffDetailsPage,JPPayCodePage,JPCutiManagementPage,JPCutiReportPage}.tsx`; JP nav gained a Catalogue group (Staff / Pay Codes / Cuti Management — holiday calendar tab is the shared TH page).
- `ProductionListPage` gained `apiBasePath` + a "Jelly Polly" category (JP nav passes `/jellypolly/api/production-entries`); JP Production Entry fully on JP endpoints.

**Verified on dev DB (2026-07-03):** processor run over the new schema — office fixed salary via jellypolly.employee_pay_codes override (1800 → net 1576.60), JP leave pay from jellypolly.leave_records (55), JP production pay via jellypolly.product_pay_codes + jellypolly.get_effective_pay_rate (40 ctn × 0.50 = 20).

**Consequences to note:**
- Dual-company staff exist as separate rows in each catalogue; the cross-company card matches by NAME (exact, case/space-insensitive).
- Leave entitlements are now per company (a dual-company person has separate JP and TH balance buckets).
- Flag #1 resolved: intended double pay (see Open Items). JP product→pay-code mapping systems: salesman pay resolves via the JP_SALESMAN job mappings (product-named codes, seeded); production packing pay maps via the Mappings button on JP Production Entry → `jellypolly.product_pay_codes` + JP_PACKING Ctn codes (mirror of TH's ProductPayCodeMappingModal flow).
