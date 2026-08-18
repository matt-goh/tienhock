# CP8D Handover — Yearly LHDN Employee Particulars File

**Status (2026-08-18):** Tien Hock implemented. Green Target and Jelly Polly are **designed below but not yet implemented**.

CP8D is the annual statement of employee remuneration and tax deduction particulars submitted to
LHDN (via e-Data Praisi/e-CP8D), prepared for the previous remuneration year around February.
The authoritative layout is the scanned LHDN document `docs/C.P.8D_FORMAT.pdf`
("C.P.8D INFORMATION LAYOUT - Pin. 2023", 4 pages, no text layer — transcribed below).
Field-by-field ERP coverage analysis: `docs/cp8d-field-gap-analysis.md`.

## 1. TXT layout (transcribed from the PDF — source of truth)

- One employee per line, fields separated by `|`, **no header/trailer records**.
- Filename: `P{Eno}_{Year}.TXT` (P = employee's information, E no. = 10-digit employer number,
  Year = remuneration year). Example: `P2900030000_2023.txt`.
- Lines in the PDF's own examples end with a **trailing delimiter**.
- "Excludes sen" fields are truncated toward zero (PDF: RM50000.70 and RM50000.20 both report
  as `50000`). Decimal fields keep sen with 2 decimals.
- Not-applicable optional money fields are emitted **blank** (empty between pipes), not `0`
  (PDF example 2 leaves living accommodation, ESOS and CP38 empty).

| # | Field | Type | Len | Rule |
|--:|---|---|--:|---|
| 1 | Name of employee | varchar | 60 | compulsory, as per identity card |
| 2 | Tax Identification No. (TIN) | integer | 11 | blank if the employee has no TIN |
| 3 | Identification / passport no. | varchar | 12 | compulsory; priority new IC > Police > Army > Passport; `000000000000` if none |
| 4 | Category of employee | int | 1 | 1 single; 2 married + spouse not working; 3 married + spouse working / divorced / widowed / single with adopted child. Latest category |
| 5 | Employee Status | int | 1 | compulsory; 1 management, 2 permanent, 3 contract, 4 part time, 5 interns, 6 others. Latest status |
| 6 | Date of Retirement / End of Contract | date | 10 | `dd-mm-yyyy`; retirement/contract-end/termination date in the remuneration year |
| 7 | Tax borne by employer | int | 1 | 1 = Yes, 2 = No |
| 8 | Number of children qualified for tax relief | int | 2 | |
| 9 | Total qualifying child relief | int | 7 | excludes sen |
| 10 | Total gross remuneration | int | 11 | excludes sen |
| 11 | Benefits in kind | int | 11 | excludes sen |
| 12 | Value of living accommodation | int | 11 | excludes sen |
| 13 | ESOS benefit | int | 11 | excludes sen |
| 14 | Tax exempt allowances / perquisites / gifts / benefits | int | 11 | excludes sen |
| 15 | Total claim for relief via Form TP1 | int | 11 | excludes sen |
| 16 | Total claim on payment of Zakat via Form TP1 | decimal | 11 | keeps sen |
| 17 | Contribution to EPF (employee) | int | 11 | excludes sen |
| 18 | Zakat paid via salary deduction | decimal | 11 | keeps sen |
| 19 | MTD | decimal | 11 | keeps sen |
| 20 | CP38 | decimal | 11 | keeps sen |
| 21 | Medical insurance | int | 6 | excludes sen |
| 22 | SOCSO contribution (employee) | int | 6 | excludes sen |

Verified PDF example 1 (all fields populated):

```
Ali bin Ahmad|03770324020|730510125580|3|2|15-12-2025|2|1|2000|50000|4200|12000|1300|445|2200|1400.30|3600|1700.20|2555.25|1822.63|2210|150
```

## 2. Design (all three companies)

Each company owns a **yearly, per-employee CP8D dataset table**. Rows are created by a
"prefill" action that snapshots staff particulars and sums the year's payroll, after which
**every field is user-editable** — the CP8D row is deliberately decoupled from the live
staff/payroll records so LHDN-specific corrections never touch payroll.

Common shape (per company; schema-qualified clone for GT/JP):

- One row per `(year, employee_id)`.
- Particulars snapshot: name, TIN, identification no.
- Codes: employee category (1–3), employee status (1–6, default 2 = permanent),
  retirement/contract-end date, tax borne by employer (default 2 = No), children count.
- 14 money columns (child relief, gross, BIK, living accommodation, ESOS, tax-exempt benefits,
  TP1 relief, TP1 zakat, EPF, zakat via salary, MTD, CP38, medical insurance, SOCSO).
- `derived_at` marks the last payroll re-derivation; audit columns throughout.

Prefill sources per company:

| Source | TH | GT | JP |
|---|---|---|---|
| Payroll years/months | `public.monthly_payrolls` | `greentarget.monthly_payrolls` | `jellypolly.monthly_payrolls` |
| Gross pay | `public.employee_payrolls.gross_pay` | `greentarget.employee_payrolls.gross_pay` | `jellypolly.employee_payrolls.gross_pay` |
| EPF / SOCSO / MTD | `public.payroll_deductions.employee_amount` (`epf`/`socso`/`income_tax`) | `greentarget.payroll_deductions` | `jellypolly.payroll_deductions` |
| Staff particulars | `public.staffs` | `public.staffs` (shared) | `jellypolly.staffs` |
| Employer E number | backend constant `9112779708` (same value as the TH e-Caruman page hardcode) | `greentarget.payroll_settings` key `ecaruman_lhdn_e_number` | `jellypolly.payroll_settings` key `ecaruman_lhdn_e_number` |

Derivation rules (all companies):

- `employee_category`: Single → 1; Married + spouse Unemployed → 2; Married + spouse Employed → 3.
  Divorced/widowed/adopted-child cases are not tracked in staff records — the user edits the field.
- `retirement_date`: the staff `date_resigned`, only when it falls inside the CP8D year.
- `children_count` ← `number_of_children`.
- Gross/EPF/SOCSO/MTD: `SUM` over all payroll rows of the year (an employee can have several
  `employee_payrolls` rows per month across job sections — all are summed).
- No payroll source exists for BIK, living accommodation, ESOS, tax-exempt benefits, TP1 relief,
  TP1 zakat, zakat via salary, CP38 or medical insurance — these prefill as 0 and are keyed by
  the user when applicable (exported blank while 0).

## 3. Tien Hock implementation (done 2026-08-18)

- **Table:** `public.cp8d_records` (migration `2026-08-18_cp8d_records.sql`, applied to dev;
  see `docs/MIGRATIONS_LOG.md`; schema documented in `AGENTS.md`/`CLAUDE.md`).
- **Backend:** `src/routes/payroll/cp8d.js`, mounted at `/api/cp8d` in `src/routes/index.js`
  (auth via the global `/api` middleware; `req.staffId` feeds audit columns).
  - `GET /:year` — list records for the year.
  - `POST /:year/prefill` — insert rows for every employee with payroll in the year who does not
    already have a CP8D row (existing rows are never touched).
  - `POST /:year/records` `{ employee_id }` — manually add one staff member.
  - `POST /records/:id/derive` — re-snapshot particulars + recompute the 4 derived money sums for
    one record (explicit per-row refresh).
  - `PUT /records/:id` — edit any field.
  - `DELETE /records/:id` — remove a row.
  - `GET /:year/export` — `{ filename, content, count, warnings[] }`; filename
    `P9112779708_{year}.TXT`. Warnings are non-blocking: missing TIN, IC fallback to 12 zeros,
    blank retirement date, zero gross.
- **Frontend:** `src/pages/Payroll/Statutory/CP8DPage.tsx` (nav: Payroll → CP8D,
  `/payroll/cp8d`) + edit modal `src/components/Payroll/CP8DRecordFormModal.tsx`.
  Year selector (defaults to the previous year), Prefill/Add Employee/Export actions, per-row
  edit / re-derive / delete. All labels through `t()` (namespace `payroll`).
- **Export formatting:** integer fields `Math.trunc`; decimal fields `toFixed(2)`; optional money
  fields blank when 0; `retirement_date` formatted `dd-MM-yyyy` via date-fns `format` (never ISO
  slicing — AGENTS.md rule 17); trailing `|` per line; `\r\n` line endings.

## 4. Green Target / Jelly Polly implementation (NOT done yet)

When implementing, follow the TH code as the template with these differences:

1. **Schema-isolated table:** `greentarget.cp8d_records` / `jellypolly.cp8d_records` — a clone,
   never a share (same principle as the GT ledger). JP's `employee_id` FK points at
   `jellypolly.staffs`; GT's points at `public.staffs`.
2. **Routes:** clone under `src/routes/greentarget/cp8d.js` / `src/routes/jellypolly/cp8d.js`,
   mounted at `/greentarget/api/cp8d` / `/jellypolly/api/cp8d` with inline
   `authMiddleware(pool), checkRestoreState` (GT/JP mounts are NOT covered by the global `/api`
   middleware).
3. **E number:** read from the company's `payroll_settings` (`ecaruman_lhdn_e_number`), same key
   the GT/JP e-Caruman pages already use — not a hardcode.
4. **Pages:** `GTCP8DPage` / `JPCP8DPage` clones registered in `GreenTargetSidebarData.tsx` /
   the JP nav data, mirroring the GT/JP e-Caruman page wiring.
5. JP payroll sums its own `jellypolly.*` payroll tables; GT sums `greentarget.*`.

## 5. Known limitations

- Employee category 3 sub-cases (divorced/widowed/adopted child) cannot be derived from the
  staff record; prefill applies the simple mapping and the user edits exceptions.
- Blank `retirement_date` for active permanent staff is exported blank and surfaced as an
  export warning; if LHDN's uploader rejects blanks, key a contract/retirement date in the edit
  modal.
- CP8D field lengths (name 60, IC 12, TIN 11, etc.) are validated on input but the export
  truncates over-length values rather than failing.
