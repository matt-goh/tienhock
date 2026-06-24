# Employee by Location yearly totals - handover

Created 2026-06-24. This document is for the next task: fix the Employee -> Location Yearly view so an employee assigned to more than one location does not make location subtotals disagree with the grand total.

## Problem

In `SalaryReportPage`, choose **Employee -> Location -> Yearly**. The location subtotals do not add up to the displayed grand total when one staff member is associated with multiple locations.

This is caused by the current data model, not by Pinjam or a missing mid-month deduction:

- The salary-report route intentionally puts an employee in both their direct `staffs.location` mappings and their job-derived location mapping (`employee_all_locations`).
- The full annual pay row is then added to every applicable location subtotal.
- The grand total deliberately adds that employee only once by `staff_id`.
- The UI additionally merges commission locations `16`-`24` into location `14` (Kerja Luar Maintenance).

Therefore the displayed location subtotals are non-additive while the grand total is deduplicated. This is confusing and should be changed for the requested view.

## Scope requested

Make the **Employee -> Location yearly view** assign each employee's annual row to exactly one reporting location, so the sum of its location subtotals equals its grand total for every displayed column.

Do not change the payroll calculation, Bank, Pinjam, PDF, individual Employee view, or the separate Location tab unless the user explicitly expands the scope.

## Important: decide the allocation policy first

The code currently treats multiple locations as intentional. The next model must determine the desired single-location rule before changing the query. Do not silently invent a financial allocation/split.

The most likely policy to confirm with the user is:

1. Use the job-derived location (or the head staff's job location for combined/sibling payroll) when one exists.
2. Otherwise use the first direct `staffs.location` mapping.
3. Otherwise fall back to location `02`, as today.

If the business instead wants to select a specific direct location over the job location, use an explicit, deterministic priority rule. The current `staffs.location` value is a JSONB array, so an arbitrary SQL join order must not decide the outcome.

## Relevant implementation

Backend: `src/routes/payroll/salary-report.js`

- Monthly route: `GET /api/salary-report` begins near line 8.
- Yearly route: `GET /api/salary-report/yearly` begins near line 1000.
- In both routes, `employee_all_locations` uses `UNION ALL` to include direct locations and job locations.
- `employee_base_data` then keeps one copy per `(employee_id, location_code)`, not one row per employee.
- The yearly aggregation is around lines 1593-1644:
  - add every resulting row into `locationData[loc].totals`;
  - add to `grandTotals` only when `processedUniqueEmployees` has not seen the `staff_id`.
- Those two different rules are the direct source of the mismatch.

Frontend: `src/pages/Payroll/SalaryReportPage.tsx`

- `LocationGroupedTable` begins near line 1230.
- It uses `activeComprehensiveData.locations` from the route above.
- It merges locations `16`-`24` into location `14`, deduplicating rows for display but adding all source totals into location 14.
- It deliberately uses `activeReportData.employees_grand_totals` for the final grand-total footer.

Existing broader background: `docs/SALARY_REPORT_REWORK_HANDOVER.md`. It covers report columns and sibling-ID aggregation; avoid altering that established behaviour.

## Recommended minimal implementation direction

After confirming the allocation policy, change the **yearly route only** so its location-source CTE produces one deterministic `location_code` per annual employee row. A good shape is a single `employee_reporting_location` CTE that calculates the preferred location, followed by one `employee_base_data` row per `employee_id`.

Keep the existing yearly calculations and `processedUniqueEmployees` protection initially. With one location row per staff, the deduplicated grand totals and the sum of all location totals should naturally match. Do not try to fix this by summing location subtotals into the grand total; that would double-count salary.

Consider whether commission-only staff need the same policy. Commission-only rows are already attributed to the commission record's `location_code`; the frontend later rolls locations `16`-`24` into 14. They do not originate from the multi-location payroll-row duplication, but must still be included in the final reconciliation check.

## Things that are not the cause

- **Pinjam:** not included in the Employee -> Location table's `SUBTOTAL` / `GRAND TOTAL` columns. It belongs to the Bank/Pinjam response fields.
- **Mid-month:** included normally as `1/2 BULAN`; it does not cause the location-versus-grand-total gap. It will be duplicated only because the entire employee row is duplicated by location.
- **Yearly rounding:** yearly `SETELAH DIGENAPKAN` is calculated from the annual `JUMLAH`, so it can differ slightly from the sum of twelve separately rounded monthly figures. That is a different issue from location subtotal reconciliation.
- **Sibling IDs:** name-based aggregation for leave, Others, commission, mid-month, and Pinjam is intentional. Preserve it.

## Acceptance criteria

For a selected year in **Employee -> Location**:

1. Every payroll employee appears under one displayed reporting location only.
2. The sum of all location `SUBTOTAL` values equals the page `GRAND TOTAL` for every column, including `GAJI BERSIH`, `1/2 BULAN`, `JUMLAH`, `DIGENAPKAN`, and `SETELAH DIGENAPKAN`.
3. A staff member with direct locations plus a job-derived location is placed according to the confirmed deterministic policy.
4. Commission-only rows remain visible and the location-14 merge still works.
5. Monthly report behaviour remains unchanged unless the user asks to align it too.
6. No changes to stored payroll data or database schema are required.

## Verification ideas

The repository instruction says not to run builds, type checks, or lint unless explicitly requested. Do not run them by default.

For implementation verification, inspect the yearly API response for a staff known to have multiple direct/job locations:

- confirm that staff occurs in exactly one `comprehensive.locations[*].employees` list;
- calculate the sum of the `locations[*].totals` fields after the same frontend location-14 merge; and
- compare it to `employees_grand_totals` / `comprehensive.grand_totals`.

If database inspection is needed, use the documented dev container command from `AGENTS.md` and only read data.

## Changelog

This is a user-visible reporting behaviour change. If implemented, prepend a 2026-06-24 Bahasa Melayu + English entry to `CHANGELOG_ENTRIES` in `src/components/ChangelogModal.tsx`.
