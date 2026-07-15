# Pinjam / Salary Report Parity (TH ↔ JP ↔ GT) — Handover

**Session date:** 2026-07-15 → 2026-07-16
**Status:** Salary Report parity **DONE & VERIFIED**. Mid-month pinjam breakdown **NOT STARTED** (spec below).
**Scope:** Tien Hock (TH), Jelly Polly (JP), Green Target (GT).

---

## 1. Original request

The JP and GT Salary Reports were missing most of TH's tabs — they only had `monthly` + `annual`, so **Employee, Bank, Pinjam and Cuti did not exist at all**. Goal: make all three companies 1:1 (tabs, amounts, PDFs, and UI/UX), except the Location tab, which legitimately differs per company.

---

## 2. What shipped (DONE — do not redo)

### 2.1 Backend — JP & GT salary report

`src/routes/jellypolly/salary-report.js`, `src/routes/greentarget/salary-report.js`

`GET /{company}/api/salary-report?year&month` now additionally returns (matching TH's shape):

| field | feeds |
|---|---|
| `data[]` (`PinjamReportData`) + `total_records` + `summary{total_gaji_genap,total_pinjam,total_final}` | Pinjam tab |
| `employees[]` + `employees_grand_totals` | Employee tab |
| `bank_data[]` (filtered to `final_total > 0`) | Bank tab |

- **Pinjam source:** `{schema}.pinjam_records` where `pinjam_type = 'monthly'` (mid-month deliberately excluded — see §4.1).
- **JP HEAD rollup:** pinjam rolls up via `COALESCE(NULLIF(s.head_staff_id,''), pr.employee_id)` — JP payroll rows exist only for the canonical HEAD id, so a sub-ID pinjam would otherwise vanish. GT needs no rollup (employee ids are direct).
- **Bank fields:** JP reads `ic_no`/`bank_account_number`/`payment_preference` from `jellypolly.staffs`; GT from `public.staffs`.
- JP/GT rows are already one-per-employee-per-month, so no TH-style dedup pass is needed.

### 2.2 Advance add-back (changes visible numbers — TH semantics adopted)

Both processors already deduct commission/bonus advances inside `net_pay`. The reports previously did **not** add them back; now they do, exactly like TH:

```
advanceTotal   = Σ payroll_items where work_log_type = 'advance'   (== processor's commissionAdvanceCents)
gaji_bersih    = net_pay + advanceTotal          // full earned salary
jumlah         = gaji_bersih − mid_month
setelah_digenapkan = ceil(jumlah)                // DERIVED, not read from the stored row
digenapkan     = setelah_digenapkan − jumlah
gaji_genap     = setelah_digenapkan − advanceTotal   // Bank/Pinjam = actual take-home
final_total    = gaji_genap − total_pinjam
```

Invariant (same as TH): **`gaji_genap + advances = setelah_digenapkan`**.

- JP previously read the **stored** `ep.setelah_digenapkan`; it now derives it. Safe: those columns are only ever written by the processors (never hand-edited), and with no advance the derived value equals the stored one.
- Salary/Employee/Location/Annual tabs now show **full earned salary**; Bank/Pinjam show **cash-in-hand**. Only staff with advance records are affected.

### 2.3 Shared UI

**New:** `src/components/Payroll/CompanySalaryReportTables.tsx` — used by JP **and** GT (TH keeps its own inline copies; not touched):
`BankReportTable`, `PinjamReportTable`, `PinjamBreakdownCard`, `PinjamBreakdownButton`, `CutiReportTable`, type `CutiBatchEmployee`.

### 2.4 PDF generators — logo/company made per-company

`PinjamReportPDF.tsx`, `BankReportPDF.tsx`, `CutiReportPDF.tsx` now take **`companyName?` and `logoSrc?` on their `*PDFData` interface** (matching the existing `SalaryReportPDF` convention, so the `generate*` functions forward them automatically). Defaults are unchanged → **TH output is byte-identical**.

**Decision (user):** GT passes `GreenTargetLogo` (`src/utils/GreenTargetLogo.png`); **JP uses the TH logo** (the default).

### 2.5 Page UI — JP/GT now mirror TH

`JPSalaryReportPage.tsx`, `GTSalaryReportPage.tsx`:
- Tabs: `employee | monthly | bank | pinjam | cuti | annual`.
- Page **titles removed**; `TimeNavigator` **moved into the card header** next to the tabs; employee-count + total readout in the header — all matching TH.
- TH's square tab strip (`bg-sky-500` active, `border-l` dividers) replaces the old pill style; Annual summary/breakdown toggle restyled to match.
- Bank/Pinjam/Cuti tables use TH's `px-6 pt-2 pb-2` padding. Employee/Location/Annual stay full-bleed (existing JP/GT wide-table design).
- Pinjam tab has TH's teal **Breakdown** button (hover → Print / Download PDF) calling `generatePinjamBreakdownPDF`.

**Tab labels differ by company (intentional, user-approved):** JP `monthly` → **"Location"** (JP has real locations); GT `monthly` → **"Job"** (GT groups OFFICE/DRIVER, no locations).

**Cuti tab is year-scoped** (TimeNavigator switches to year) since leave entitlements are annual. Backend already existed: `POST /{company}/api/leave-management/batch-reports` `{employeeIds, year}` → `{employees[], summary}`. JP sources ids from `useJPStaffsCache`; GT from `useStaffsCache` filtered by `/greentarget/api/payroll-employees`; both deduped via `groupStaffsByName` (multi-ID staff share one leave bucket).

### 2.6 Changelog

Two entries added at the top of `CHANGELOG_ENTRIES` in `src/components/ChangelogModal.tsx` (2026-07-15): one for the new tabs, one for the advance add-back number change.

---

## 3. Verification already performed (evidence, not assumption)

- **Typecheck:** `npx tsc --noEmit` → **0 errors** project-wide.
- **Endpoints** (`api-key: foodmaker`) against real July 2026 payroll: JP 7 employees, GT 8; totals reconcile (`Σ final_total == summary.total_final`); GT `bank_data` is 6 of 8 because it filters zero payouts (correct).
- **JP HEAD rollup:** temp pinjam under sub-ID `HAFIZ_MP` (120.50) merged with `HAFIZ`'s own (80.00) into one 200.50 row. ✔
- **mid_month exclusion:** a `mid_month` row never leaked into the report. ✔
- **Advance add-back (end-to-end, via the real processor):** created a RM50 advance for FAREL through `POST /jellypolly/api/incentives` → gaji_bersih 167.96→217.96, setelah 68, gaji_genap 18; `18 + 50 = 68` ✔; and 18 matched the processor's independently stored `setelah_digenapkan` ✔. Advance then deleted; baseline restored.
- **All test data removed.** JP's only two real rows (HAFIZ mid-month 100 + 200) are intact. Verify with:
  `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SELECT * FROM jellypolly.pinjam_records;"`

---

## 4. Critical findings (read before touching pinjam)

### 4.1 ⚠ Mid-month pinjam must NOT enter the month-end Pinjam report

It is **already fully collected from the mid-month advance**. Proven with live JP July data:

| | |
|---|---|
| HAFIZ mid-month advance (`jellypolly.mid_month_payrolls`) | **RM300** |
| HAFIZ mid-month pinjam (`jellypolly.pinjam_records`, both `mid_month`) | **RM300** (ANTI ROSE 200 + PINJAM (OFFICE) 100) |
| Mid-Month Payroll report row | 300 − 300 = **net 0** |

Adding it to the month-end Pinjam tab would deduct HAFIZ twice and understate his bank payout. TH filters `pinjam_type='monthly'` for exactly this reason; JP/GT now match.

### 4.2 The "empty JP pinjam PDF" was correct behaviour, not a bug

JP has **zero `monthly` pinjam rows** — its only two records are `mid_month`. So `total_pinjam = 0`, `pinjam_details = []`, the "Pinjam by Type" card self-hides, and the Breakdown document renders as a header-only blank page. The Pinjam PDF is the **same shared file TH uses**; detail sub-rows and the breakdown were never missing code, only data. Confirmed by inserting monthly pinjam → full TH-style output appeared; then removed.

### 4.3 The mid-month pinjam report ALREADY EXISTS in all 3 companies

`src/pages/Payroll/AddOn/MidMonthPayrollPage.tsx`, `src/pages/JellyPolly/Payroll/JPMidMonthPayrollPage.tsx`, `src/pages/GreenTarget/Payroll/GTMidMonthPayrollPage.tsx`.

All three already: fetch `/{company}/api/pinjam-records/summary?year&month`, build `pinjamByEmp` from **`entry.mid_month.total_amount`**, compute `netAmount = midMonthAmount − pinjamAmount`, and print `MidMonthPayrollReportPDF` with columns `NO. / STAFF NAME / IC NO. / GROSS / PINJAM / NET`.

**What's missing is only the per-employee breakdown** — see §5.

---

## 5. PENDING WORK — mid-month pinjam breakdown

**User decision (verbatim):** *"we'll do detailed sub-rows and the new pinjam subtab, make it another subview instead of a new tab"*

### 5.1 Deliverable A — detail sub-rows in the mid-month PDF

`src/utils/payroll/MidMonthPayrollReportPDF.tsx` — under each staff row, render the italic bullet sub-rows exactly like the month-end report does:

```
HAFIZ - MOHAMMAD HAFIZ    300.00    300.00    0.00   Bank
   • ANTI ROSE                        200.00
   • PINJAM  (OFFICE)                 100.00
```

Copy the pattern from `PinjamReportPDF.tsx`: the `employeeBlock` wrapper (`wrap={false}`, bottom border sits **below** the details) + `detailRow`/`detailSpacer`/`detailDesc`/`detailAmount` styles, and the `details.map(...)` inside `PinjamRow`. Add `pinjamDetails?: PinjamDetail[]` to `MidMonthPayrollReportData`.

Applies to **all 3 companies** (the PDF is shared; all three pages build the same `rows`).

### 5.2 Deliverable B — Pinjam **subview** on the Mid-Month Payroll page

**Not a new tab — a subview toggle**, styled like the Annual `summary | breakdown` toggle now in `JPSalaryReportPage.tsx` (square strip, `bg-sky-500` active, `border-l` divider). Reuse `PinjamReportTable` + `PinjamBreakdownCard` from `src/components/Payroll/CompanySalaryReportTables.tsx`, scoped to **mid-month** figures:

- `gaji_genap` → the mid-month advance (`mid_month_payrolls.amount`)
- `total_pinjam` → mid-month pinjam total
- `final_total` → advance − mid-month pinjam
- `pinjam_details` → the mid-month details

Do this for all 3 mid-month pages (TH/JP/GT).

### 5.3 ⚠ Blocker — `/pinjam-records/summary` returns details as **strings**

`src/routes/{payroll,jellypolly,greentarget}/pinjam-records.js` (`GET /summary`) currently does:

```sql
STRING_AGG(p.description || ': ' || p.amount::text, ', ' ORDER BY p.description) AS details
```

→ `details: ["ANTI ROSE: 200.00", "PINJAM  (OFFICE): 100.00"]` (frontend does `row.details.split(', ')`).

This is **fragile and not parseable safely** — a description containing `, ` or `: ` breaks it (note the real data already has a double space: `"PINJAM  (OFFICE)"`).

**Recommended:** add a structured field alongside the existing one (don't remove `details` — the Pinjam List pages consume it):

```sql
json_agg(json_build_object(
  'description', COALESCE(NULLIF(btrim(p.description), ''), 'Pinjam'),
  'amount', p.amount
) ORDER BY p.amount DESC) AS detail_rows
```

That yields `PinjamDetail[]` directly, matching what `PinjamReportTable` / `aggregatePinjamByType` / `aggregatePinjamContributorsByType` already expect. Apply to all 3 `pinjam-records.js` files (they are near-identical clones).

### 5.4 Nice-to-have spotted, not done

- `MidMonthPayrollReportPDF.tsx` **hardcodes `TienHockLogo`**, so GT's mid-month PDF prints the TH logo above "GREEN TARGET SDN. BHD." — inconsistent with the logo decision in §2.4. Fix identically: add `companyName?`/`logoSrc?` to `MidMonthPayrollReportPDFData`, resolve with `??` defaults, and pass `GreenTargetLogo` from `GTMidMonthPayrollPage.tsx`. (JP correctly uses the TH logo.)
- `JPMidMonthPayrollPage.tsx` line ~46 has a misnamed constant `const GT_COMPANY_NAME = "JELLY POLLY"` — **value is correct**, name is copy-paste residue. Cosmetic only.

---

## 6. Open question deferred

TH additionally has a **Monthly/Yearly period toggle** on its Employee/Location/Cuti tabs. JP/GT have no `periodType` concept (their monthly tabs have always been month-only), so it was **not** added. This is the one remaining UX difference from TH. Raise with the user before building — it touches the existing tabs.

---

## 7. Dev / test recipes

```bash
# Auth-free API calls (middleware accepts an api-key header)
curl -s -H "api-key: foodmaker" \
  "http://localhost:5000/jellypolly/api/salary-report?year=2026&month=7"
curl -s -H "api-key: foodmaker" \
  "http://localhost:5000/jellypolly/api/pinjam-records/summary?year=2026&month=7"

# DB
docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"
```

**Data landscape (as of handover):** only **July 2026** has processed JP (7 staff) and GT (8 staff) payroll. JP pinjam = 2 `mid_month` rows (HAFIZ). GT pinjam = **none**. So the month-end Pinjam tab renders empty for both until `monthly` pinjam is entered — that is expected.

**Gotchas when seeding test pinjam:**
- `greentarget.pinjam_records.created_by` has an FK to `staffs` — use a real staff id (e.g. `'AFRED'`), not `'test'`.
- To exercise the **advance** path use the real processor (`POST /{company}/api/incentives` with `is_advance: true`), which reprocesses payroll — don't hand-write `payroll_items`.
- `npx vite-node` is **broken in this environment** (`Cannot find native binding … @rolldown/binding-win32-x64-msvc`) — unrelated to this work; verify via the HTTP endpoints instead.
- Always clean up seeded rows; JP's two real HAFIZ rows must survive.

---

## 8. Files touched this session

```
M src/routes/jellypolly/salary-report.js          # pinjam/bank/employees + advance add-back
M src/routes/greentarget/salary-report.js         # pinjam/bank/employees + advance add-back
M src/pages/JellyPolly/Payroll/JPSalaryReportPage.tsx    # 6 tabs + TH header/UI
M src/pages/GreenTarget/Payroll/GTSalaryReportPage.tsx   # 6 tabs + TH header/UI + GT logo
M src/utils/payroll/PinjamReportPDF.tsx           # companyName/logoSrc on PDFData
M src/utils/payroll/BankReportPDF.tsx             # companyName/logoSrc on PDFData
M src/utils/payroll/CutiReportPDF.tsx             # companyName/logoSrc on PDFData
M src/components/ChangelogModal.tsx               # 2 entries
A src/components/Payroll/CompanySalaryReportTables.tsx   # shared JP+GT tables/button
```

TH's `SalaryReportPage.tsx` and its backend were **not modified**.
