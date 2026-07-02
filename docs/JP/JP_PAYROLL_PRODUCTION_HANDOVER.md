This is a large multi-phase Jelly Polly payroll and production implementation project. Start by understanding the existing Tien Hock payroll/production systems and the Green Target payroll handover before coding. Then produce a phased implementation plan and call out any assumptions, risks, TH-specific logic, or places where reuse may be harder than expected.

Core goal:
Implement Jelly Polly’s own payroll, staff/paycode, work-log, report, PDF, and production systems, using Tien Hock as the main 1:1 reference wherever possible, but keeping JP-specific data and workflows properly separated.

Important reference files:
- `src/pages/Payroll/MonthlyLog/MonthlyLogEntryPage.tsx`
- `src/pages/Payroll/DailyLog/DailyLogEntryPage.tsx`
- `src/pages/Payroll/PayrollDetailsPage.tsx`
- `src/pages/Stock/ProductionEntryPage.tsx`
- `src/pages/Catalogue/ProductPage.tsx`
- `docs/GT/GT_PAYROLL_PHASE2_HANDOVER.md`

Follow existing repo rules and architecture. Read before writing. Reuse existing components, routes, helpers, cache patterns, and payroll logic where practical. If reuse requires too many conditionals or makes the code messy, create a clean JP-specific version instead.

## Phase 1: JP Staff And Paycode Foundation

Implement Jelly Polly’s own staff and paycode system.

It should be 1:1 with Tien Hock’s system wherever possible, including:
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

We need user-managed staff-job/page mappings because not every TH staff member applies to JP.

Requirements:
- Let users assign staff to JP Office payroll.
- Office should start from the original OFFICE job/staff lineup, but only one of those staff is in JP, so the user must be able to choose who belongs to JP Office.
- Do the same for Maintenance.
- Do the same for Salesman.
- New JP-specific daily pages should also have assignable staff.
- Some pages may only have one assigned staff.
- JP production staff are Jelly Polly-exclusive and must also be included in this assignment interface.
- Staff may have one or multiple jobs/pages assigned.

Use an approach that can support the JP payroll pages, JP daily pages, and JP production pages without needing hardcoded staff lists.

## Phase 3: JP Monthly Payroll Pages

Implement the following JP pages/systems 1:1 with Tien Hock, except they must use JP’s own staff/paycodes/mappings:

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

Office and Maintenance should use the same system as:
- `src/pages/Payroll/MonthlyLog/MonthlyLogEntryPage.tsx`

Salesman should also be 1:1 with Tien Hock, including:
- salesman ikut,
- same calculation behavior,
- same flow and structure,
- but product unit should be carton instead of bag.
This should ideally come naturally from the paycode unit if the paycode is configured correctly.

JP Salesman products should come from the shared/original product catalogue, similar to how JP production products come from the TH catalogue.

Calculations, payslips, contribution calculations, payroll details, and reports should behave the same as Tien Hock, but scoped to Jelly Polly.

Payroll UX improvement:
- In `src/pages/Payroll/PayrollDetailsPage.tsx`, add a final take-home pay info card after the pinjam amount section, underneath the existing pinjam/take-home-pay card.
- This should help when a staff member works for both companies and has pay in both places.
- Apply this carefully so it works for staff with cross-company pay without confusing single-company staff.

JP payroll data is always small, so do not copy Tien Hock’s full reprocess mechanism if it is unnecessarily heavy.
Instead:
- whenever a JP work log or payroll-related entry is saved,
- reprocess only the affected staff’s payroll.

## Phase 4: JP Daily Machine Pages

Add these JP daily menus/pages:

- Daily Ice-Polly Machine
- Daily Jelly Cup Machine

These should be based 1:1 on Tien Hock’s BIHUN and MEE daily machine system:
- `src/pages/Payroll/DailyLog/DailyLogEntryPage.tsx`

Required JP-specific tweaks:
- only show the shift toggle,
- default shift should be day,
- include bungkusan input,
- no paycode mapping is needed for bungkusan.

Keep the rest of the behavior as close to TH’s daily log system as practical.

## Phase 5: JP Daily Machine Plastic Page

Create a JP-exclusive Daily Machine Plastic entry page.

For each staff row, the entry page should have exactly these inputs:
- number of 30ml cartons produced,
- number of 70ml cartons produced,
- day/night shift toggle.

This page must support staff with multiple IDs but the same name:
- If cartons are entered under sub IDs,
- the carton production should roll up into the HEAD ID,
- same spirit as the Tien Hock HEAD/sub-ID handling.

This page is unique to JP, so reuse shared logic where it helps, but create a clean JP-specific implementation if adapting TH’s daily log page becomes too awkward.

## Phase 6: JP Production System

Build Jelly Polly’s production system like:
- `src/pages/Stock/ProductionEntryPage.tsx`

Every page under the existing "PRODUCTS" group in the navbar should be implemented 1:1 for JP where applicable.

Differences:
- JP production products come from the existing shared product catalogue in `src/pages/Catalogue/ProductPage.tsx`.
- Only JP products from that catalogue should appear in JP production.
- Production staff are Jelly Polly-exclusive staff.
- Production staff assignment must be supported in the staff assignment interface described earlier.
- Do not leave out the drag-and-drop worker ordering mechanism.
- Reuse the existing product cache where possible.
- Also consider caching JP staff data similarly to how Tien Hock staff caching works.

## Data And Architecture Expectations

Before implementing, inspect the existing database/schema patterns for:
- Tien Hock payroll,
- Green Target payroll,
- Jelly Polly existing tables/routes,
- staff/paycode/payroll relationships,
- production entries,
- product catalogue structure,
- payroll reports and PDFs.

Use the Green Target payroll implementation and `docs/GT/GT_PAYROLL_PHASE2_HANDOVER.md` as a reference for how a second company payroll system was separated from Tien Hock.

If database changes are needed:
- propose the schema cleanly,
- keep JP data separated where appropriate,
- update schema documentation in `AGENTS.md` and `CLAUDE.md` as required by repo rules.

## Deliverables Expected From The Agent

First deliver a phased technical plan before implementation.

The plan should include:
- recommended phases,
- database/table changes,
- frontend pages to add or adapt,
- backend routes/services to add or adapt,
- reusable TH/GT components and utilities,
- places where JP should get a fresh implementation,
- cache strategy,
- mock data strategy,
- migration/seed strategy,
- PDF/report generation plan,
- edge cases around HEAD/sub-ID staff,
- and any TH-specific logic that should not be blindly copied.

Then, when implementation begins, proceed phase by phase and keep changes surgical.

Primary success criteria:
- JP has its own staff/paycode/payroll foundation.
- JP can assign staff to Office, Maintenance, Salesman, daily machine, plastic machine, and production workflows.
- JP monthly payroll flows match Tien Hock behavior where intended.
- JP daily machine pages work with their JP-specific inputs.
- JP plastic machine production rolls sub-ID entries into HEAD IDs.
- JP production pages work with JP products from the shared catalogue.
- Payroll calculations, payslips, reports, e-caruman, and PDFs are available for JP.
- The system avoids unnecessary TH-style full reprocessing and reprocesses affected JP staff when entries are saved.
