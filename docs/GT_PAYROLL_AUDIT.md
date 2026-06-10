# Green Target Payroll — Audit Findings & Fixes

**Date**: 2026-06-10
**Scope**: Full scan of the GT payroll system against the Tien Hock (TH) payroll as the reference standard, followed by fixes ("fix everything feasible") and pinjam/mid-month parity.

---

## What was already correct (no change needed)

The statutory deduction core was verified **identical to Tien Hock**:

- **EPF**: same wage ceiling steps (RM20 increments up to RM5,000, then RM100 increments), `Math.ceil` on both employee and employer contributions, EPF wage base = Base + Tambahan (Overtime excluded).
- **SOCSO**: same rate table lookup on full gross, Keilatan skipped for 60+, SKBBK applied from June 2026 payrolls onward.
- **SIP**: Malaysian, under-60 only.
- **Income tax (PCB)**: fixed-amount lookup with marital status / spouse employment / children (K0–K10) categories.
- **Per-staff overrides** honoured via the shared `resolveContributionContext` (`epf_age_override`, `epf_nationality_override`, `socso_age_override`, `sip_age_override`).

---

## Findings and their resolutions

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | `process-all` had **no Finalized guard** — a finalized GT payroll could be silently re-processed and overwritten | High | Fixed: status checked before the transaction; returns 400 (`monthly-payrolls.js`) |
| 2 | Payroll items INSERT built by **string concatenation** (quote-escaping only) | High | Fixed: per-item parameterized INSERT |
| 3 | Manual item add/delete **did not recalculate statutory deductions** — EPF/SOCSO/SIP/PCB went stale after edits | High | Fixed: `recalculateGTPayroll()` in `employee-payrolls.js` recomputes gross, deductions, net, and rounding on every item change |
| 4 | **No pinjam support** at all, although GT staff take pinjam | High | Fixed: new `greentarget.pinjam_records` table, GT Pinjam page (`/greentarget/payroll/pinjam`), pinjam shown on the payroll details page with final pay after deduction |
| 5 | **No mid-month advance** handling | High | Fixed: new `greentarget.mid_month_payrolls` table, GT Mid-month page (`/greentarget/payroll/mid-month`), advance deducted before rounding and shown on payslip as BAYARAN PENDAHULUAN |
| 6 | **No rounding (digenapkan)** — net pay was raw `gross − deductions` with no whole-ringgit rounding | Medium | Fixed: `digenapkan` + `setelah_digenapkan` columns added; `setelah_digenapkan = CEIL(net − mid-month)` exactly like TH |
| 7 | Gross pay summed as **raw floats** (possible cent drift) | Medium | Fixed: integer-cent summation for gross and EPF gross |
| 8 | "Add Item" button was a **stub** ("coming soon") though the backend endpoint existed | Medium | Fixed: wired to the shared `AddManualItemModal` (now endpoint-configurable via `apiBasePath`) |
| 9 | Payslip download passed `midMonthPayroll: null` and no rounding fields | Medium | Fixed: payslip now receives the GT mid-month advance and stored rounding values |
| 10 | `GET /batch` in `greentarget/employee-payrolls.js` was **unreachable** (registered after `GET /:id`, so "batch" matched as an id) | Low | Fixed: `/batch` registered first |

## Design decisions

- **Separate GT tables** (`greentarget.pinjam_records`, `greentarget.mid_month_payrolls`) instead of sharing the TH tables, so GT records never appear in TH pinjam lists, mid-month reports, or bank exports.
- **Pinjam is not part of net pay** (same as TH): monthly pinjam is deducted from *Jumlah Digenapkan* for the displayed/printed final pay; mid-month pinjam is deducted from the mid-month advance. Pinjam does not appear on the payslip PDF (matches TH).
- The statutory calculation was extracted to `src/routes/greentarget/gtStatutoryCalc.js` so `process-all` and item add/delete recalculation share one source of truth. It intentionally does **not** reuse TH's `recalculateAndUpdatePayroll` (that function carries TH-only concepts: leave records, commissions, Others, grouped same-name payrolls).
- Shared frontend components were made configurable rather than cloned where they were large: `PinjamFormModal` and `AddManualItemModal` accept an optional `apiBasePath` (and `employeeOptions` for pinjam). Defaults keep TH behaviour byte-identical.

## Post-rollout fixes (2026-06-10, after initial testing)

- **GT invoice column mismatch**: the DRIVER rental queries referenced TH-style columns (`total_excluding_tax`, `invoice_status`) that don't exist on `greentarget.invoices` — fixed to `amount_before_tax` / `status != 'cancelled'`. This bug predated the upgrade; the DRIVER flow had never run with invoices.
- **Orphan payroll pruning**: `process-all` now deletes payroll rows (plus items/deductions) for employees removed from the GT employee list; previously they lingered after re-processing.
- **Driver Trips page removed**: DRIVER pay is derived directly from rentals during `process-all` (the `greentarget.driver_trips` table was queried but never used). The entry page, its `/greentarget/api/driver-trips` routes, and the dead query were removed. The `greentarget.driver_trips` table remains in the database but is unused.
- **GT staff excluded from TH entry**: staff on the GT payroll list (OFFICE and DRIVER) no longer appear in Tien Hock's `MonthlyLogEntryPage` eligible list, preventing double payroll.
- **Navbar**: the GT Payroll menu is now a dropdown (Monthly Payroll, Office, Mid-month Payroll, Pinjam, Payroll Settings); the GT Office entry page was restyled to match the TH monthly entry page and is also reachable via an "Office Entry" button on the Payroll page.

## Remaining gaps (intentional / out of scope)

- GT has **no leave, commission, or Others (Kerja Luar)** concepts — by design; GT pay is monthly work logs (OFFICE) + trip rules and add-ons (DRIVER) + manual items.
- The GT Mid-month page has **no PDF report or bank text export** (the TH page has both). Add later if GT needs bank-file payments for advances.
- The GT Pinjam page has **no printable pinjam summary PDF** (TH has one). The same data is visible on screen and on the payroll details page.
- `mid_month_payrolls.status` (Pending/Paid/Cancelled) exists in the GT table and API but is not surfaced in the GT UI (TH's page doesn't surface it either). Note: like TH, a *Cancelled* advance row would still be deducted during processing — delete the row instead of relying on status.
- GT payroll continues to process per `employee_id` — no same-name sibling grouping (TH groups multi-ID staff). GT staff each have a single ID, so this is fine today.

## Database changes (migration `migrations/004_gt_payroll_pinjam_midmonth.sql`)

- `greentarget.employee_payrolls`: added `digenapkan NUMERIC(10,2) DEFAULT 0`, `setelah_digenapkan NUMERIC(10,2)`.
- New `greentarget.pinjam_records` (clone of `public.pinjam_records`).
- New `greentarget.mid_month_payrolls` (clone of `public.mid_month_payrolls`).

Run on dev: `docker exec -i tienhock_dev_db psql -U postgres -d tienhock < migrations/004_gt_payroll_pinjam_midmonth.sql` (already applied to dev on 2026-06-10; pending production).

## Files changed

**Backend**
- `src/routes/greentarget/gtStatutoryCalc.js` (NEW — shared statutory calc)
- `src/routes/greentarget/monthly-payrolls.js` (guard, parameterized inserts, cent math, mid-month + digenapkan)
- `src/routes/greentarget/employee-payrolls.js` (route order, enriched GET, recalculation)
- `src/routes/greentarget/pinjam-records.js` (NEW)
- `src/routes/greentarget/mid-month-payrolls.js` (NEW)
- `src/routes/index.js` (route registration)

**Frontend**
- `src/pages/GreenTarget/Payroll/GTPayrollDetailsPage.tsx` (Add Item, rounding card, pinjam card, payslip data)
- `src/pages/GreenTarget/Payroll/GTPinjamListPage.tsx` (NEW)
- `src/pages/GreenTarget/Payroll/GTMidMonthPayrollPage.tsx` (NEW)
- `src/pages/GreenTargetNavData.tsx` (nav entries)
- `src/components/Payroll/PinjamFormModal.tsx` (optional `apiBasePath` / `employeeOptions` props)
- `src/components/Payroll/AddManualItemModal.tsx` + `src/utils/payroll/payrollUtils.ts` (optional `apiBasePath`)
