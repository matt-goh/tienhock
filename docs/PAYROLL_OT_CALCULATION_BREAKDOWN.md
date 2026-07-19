# Payroll OT Calculation Breakdown — July 2026 Salary Formula

Implemented: 2026-07-19
Policy record: docs/PAYROLL_OT_CALCULATION_JULY_2026_HANDOVER.md (section 8 decisions, confirmed 2026-07-18)
Shared calculation code: `src/routes/payroll/otFormula.js` (formula version `2026-07.v1`)

This document explains, in plain language with worked numbers, exactly how the
system calculates overtime pay for payroll months **July 2026 and later**. It is
the auditor-facing description of what the code does.

## 1. When the formula applies

The cutoff is the **payroll month**, not the date the work log was entered or
the date wages are paid:

- **June 2026 and earlier** — nothing changes. OT keeps the old configured
  rates (pay code / job / employee overrides and effective-month rate
  schedules). Reprocessing an old month reproduces the old numbers.
- **July 2026 and later** — OT rates are derived fresh for every employee and
  every month from that month's earnings, using the formula below. All three
  companies use it: Tien Hock, Green Target, and Jelly Polly.

## 2. The formula

Every step is rounded to the sen before the next step (this matches HR's own
worked example and the confirmed CSV):

```
Step 1  Wage basis   = earned salary + eligible additions   (see section 3)
Step 2  Daily rate   = Wage basis ÷ divisor days            → rounded to sen
Step 3  Hourly rate  = Daily rate ÷ 8                       → rounded to sen
Step 4  OT rates     = Hourly rate × 1.5 / 2.0 / 3.0        → each rounded to sen
Step 5  OT amount    = OT rate × OT hours in that category  → rounded to sen
```

The divisor in Step 2 depends on the employee's **OT Pay Basis**, set on the
staff form (Catalogue → Staff → contribution overrides section):

The divisor resolves **fully automatically** from where the employee's work is
recorded — there is nothing to set for anyone:

| Situation | Divisor |
| --- | --- |
| Attendance dates exist (daily work logs / production / GT lori habuk) | actual worked days, counted automatically |
| **Worked Days** keyed on the monthly work log (hourly staff logged monthly) | that keyed day count |
| On a monthly work log with no Worked Days keyed | **26** (monthly-salaried default) |

The staff form still has an **OT Pay Basis** field, but it is an optional
override for odd cases only (e.g. a monthly-salaried person who also has a
stray attendance date would otherwise be divided by that day count — set them
to Monthly ÷ 26 explicitly). Left on "Auto (from work records)", the table
above applies.

The ÷ 8 in Step 3 is **always 8**, even for the short 5-hour Saturday. The
Saturday 5-hour threshold still decides *how many hours count as OT*; the
divisor that prices those hours stays 8 (HR confirmation, handover section 4.1).

The three multipliers map to the existing day-type categories:

| Category | Multiplier | Hours priced |
| --- | --- | --- |
| Biasa (ordinary working day) | × 1.5 | daily-log OT hours on Biasa days; monthly-log Biasa OT hours; all Green Target office OT |
| Ahad (Sunday / rest day) | × 2.0 | daily-log OT hours on Ahad days; monthly-log Ahad OT hours |
| Umum (public holiday) | × 3.0 | daily-log OT hours on Umum days; monthly-log Umum OT hours |

Entered hours keep their existing meanings — the formula only changes the
**rate** applied to hour quantities the system already captures (decision 11).

## 3. What goes into the wage basis (Step 1)

**Included** (wage-like earnings of the same payroll month):

- Base salary items (monthly salary, hourly base pay, daily base pay)
- Fixed monthly work payments keyed as work items (e.g. Jaga Gate)
- Piece-rate / production earnings (bags, kg, karung, trips, etc.), including
  production daily-threshold incentives (F/HARIAN etc.)
- Tambahan work-log items and manual Tambahan/Base items added on the payroll
- Tien Hock **Commission** records (the Commission page, locations 16–24)
- Green Target / Jelly Polly **Advance** records (earned pay taken early)
- Non-OT Others / Kerja Luar records

**Excluded**:

- **All paid-leave amounts** (Cuti Tahunan / Cuti Umum / Cuti Sakit /
  Cuti Rawatan). HR prices leave FROM the derived daily rate, so leave can
  never feed the rate — "holidays are not included in the calculation of the
  overtime rate". Leave is still paid and still in gross pay. (Confirmed by
  HR's July 2026 RAMBU model: the RM1,194.77 basis contains no Cuti, and the
  Cuti Tahunan itself is repriced to the derived RM132.75 daily wage.)
- **Bonus** (TH Bonus records — commission records without a location; GT/JP
  Bonus page records). Bonus is still paid and still in gross pay; it just does
  not raise the OT rate (decision 8).
- **All overtime pay itself** — the rate can never feed back into itself
  (anti-circularity).
- Pure expense / travel reimbursements are not payroll earnings in this system
  and therefore never enter the basis.

The full ringgit breakdown of the basis actually used is stored per employee
per month (section 7).

## 4. The worked-day rule (actual_days divisor)

A worked day is **one distinct calendar date with any recorded ordinary-work
attendance**:

- a submitted daily work-log entry that is not a leave entry, or
- a production entry with bags packed, or
- (Green Target drivers) a submitted Daily Lori Habuk log that is not on a
  leave day.

Rules:

- The same date counts **once**, across multiple shifts, multiple jobs, and
  grouped sibling staff IDs.
- Partial days and the short Saturday count as one full worked day.
- Attended Sundays and public holidays count as worked days.
- A date covered by an **approved leave record never counts** as a worked day,
  even when a daily work entry was also keyed on that date — the day is paid
  via Cuti and its daily work items already pay nothing (HR's RAMBU model:
  the Cuti Tahunan date stays outside the 9 worked days).
- A daily entry keyed with **all zeros** (no hours and no paid activity) does
  **not** count as a worked day (HR's RAMBU model: a zero day stays outside
  the 9 worked days).

For staff whose hours are logged only as monthly totals, dates cannot be
reconstructed, so the monthly work-log entry pages now have a **Worked Days**
input per employee. The system never approximates with hours ÷ 8 (HR's example
week is 45 ordinary hours but 6 worked days).

When both attendance dates and a Worked Days input exist, the larger of the two
is used; the source is recorded in the stored snapshot
(`attendance`, `monthly_input`, or `attendance+monthly_input`).

## 5. Which OT items the formula reprices

By default, every system-generated work-log OT item is formula-priced. The
precise scope is:

| Condition | Requirement |
| --- | --- |
| Pay type | `Overtime` |
| Rate unit | `Hour` (Day/Fixed special OT payments always keep their own amounts) |
| Origin | generated from a daily/monthly work log (not a manual payroll item) |
| Pay code OT Rate Mode | `Salary formula` (the default) |

Items **outside** the scope keep their configured/keyed rates:

- **Manual payroll items** (added on the payroll details page) — a manual OT
  edit made under the new system wins over the formula and survives
  reprocessing (decision 16).
- **Others / Kerja Luar OT records** — these are user-keyed rate × quantity
  entries, so the keyed value stands (decision 16). They remain classified as
  OT: excluded from the wage basis and from the EPF base. To pay Kerja Luar OT
  at the formula rate, read the rate from the payroll details breakdown and key
  it, or ask for auto-repricing to be enabled later.
- **Pay codes set to `Fixed configured rate`** in the pay code form's
  "OT Rate Mode (July 2026 onwards)" field — for special payments that must
  stay at a fixed rate.

Configured overrides and rate schedules created before this change do **not**
override the formula for July 2026+; they remain authoritative for June 2026
and earlier only (decision 16).

## 6. Blocking errors (never a silent fallback)

Processing an employee with formula OT hours **stops for that employee** (other
employees continue) and reports a clear error when:

- the basis resolves to actual days but **no worked-day count** could be
  derived — this is now rare, since monthly-logged staff default to ÷26; it
  mainly occurs when the staff form explicitly forces "Actual worked days"
  and no attendance/Worked Days exists;
- the wage basis is **zero** (an OT rate cannot be derived from nothing).

The fix is stated in the error: enter Worked Days on the monthly log, set the
employee's OT Pay Basis to Monthly (÷26) if they are monthly-salaried, or set
the OT pay code to Fixed — then process again. The same rule applies when a manual item edit triggers a recalculation:
the save is rejected with the blocking message.

## 7. What is stored for audit

Each processed employee-month with formula OT stores a snapshot in
`employee_payrolls.ot_calculation` (all three companies): formula version, pay
basis, the full wage-basis breakdown in RM, excluded bonus and OT totals,
divisor days and their source, the 8-hour divisor, the rounded daily and hourly
rates, and the three final OT rates. The payroll details pages display this as
an "OT Rate Calculation" panel, so any July rate can be explained line by line
against June.

The OT payroll items themselves store the derived rate, the hours, and the
rounded amount, exactly like configured-rate items always have — payslips,
salary reports, E-Caruman, bank totals and payroll journals all read these
stored results and never recalculate OT independently.

## 8. Recalculation behaviour

After a July+ payroll exists, changing anything that feeds the wage basis
re-derives the OT rate and updates the stored OT items **before** gross,
EPF/SOCSO/SIP/tax, net pay and rounding are recomputed:

- Tien Hock / Green Target: adding or deleting a manual payroll item
  recalculates the whole employee payroll, including OT repricing. Commission /
  Others / leave edits are reflected the next time the month is processed (the
  normal "Process payroll" flow) or when a manual-item recalculation runs.
- Jelly Polly: every save (work logs, incentives, others, mid-month, pinjam)
  already auto-reprocesses the affected employees, so OT follows immediately.
- Reprocessing the same unchanged month is idempotent — same numerator, same
  divisor, same rates, same amounts.

The already-processed July 2026 payrolls remain on the old numbers until a user
reprocesses them (decision 3). Before doing that, set OT Pay Basis to Monthly
(÷26) for the monthly-salaried staff; everyone else works automatically.
Processing lists exactly which employees are still blocked and why.

## 9. Worked examples

### Example A — HR's monthly example (basis for acceptance)

Monthly office worker, RM1,500 basic + RM1,000 incentive, monthly_26:

```
Wage basis    1,500.00 + 1,000.00           = RM2,500.00
Daily rate    2,500.00 ÷ 26 = 96.153…       → RM96.15
Hourly rate   96.15 ÷ 8   = 12.019…         → RM12.02
OT rates      12.02 × 1.5 = RM18.03 (Biasa)
              12.02 × 2.0 = RM24.04 (Ahad)
              12.02 × 3.0 = RM36.06 (Umum)
```

### Example B — the corrected CSV example (RM8.72 wage)

Hourly worker, 168 ordinary hours × RM8.72, plus RM1,500 eligible additions,
21 actual worked days:

```
Earned salary 168 × 8.72                    = RM1,464.96
Wage basis    1,464.96 + 1,500.00           = RM2,964.96
Daily rate    2,964.96 ÷ 21 = 141.188…      → RM141.19
Hourly rate   141.19 ÷ 8  = 17.648…         → RM17.65
OT rates      17.65 × 1.5 = RM26.48 (Biasa)
              17.65 × 2.0 = RM35.30 (Ahad)
              17.65 × 3.0 = RM52.95 (Umum)
```

If this worker's 40 OT hours were 30 Biasa + 6 Ahad + 4 Umum, OT pay would be
30 × 26.48 + 6 × 35.30 + 4 × 52.95 = 794.40 + 211.80 + 211.80 = **RM1,218.00**.

### Example B2 — HR's July 2026 model (RAMBU, daily-logged worker)

Dryer hours 66 × RM8.72 = RM575.52, Jaga Gate RM300.00, packing/hancur/timbang
piece work RM319.25, **9 actual worked days**, 37.5 OT hours, 1 day Cuti
Tahunan:

```
Wage basis    575.52 + 300.00 + 319.25      = RM1,194.77   (Cuti NOT included)
Daily rate    1,194.77 ÷ 9 = 132.752…       → RM132.75
Hourly rate   132.75 ÷ 8  = 16.593…         → RM16.59
OT rate       16.59 × 1.5                   = RM24.89 (Biasa)
OT pay        24.89 × 37.5 hours            = RM933.38
Cuti Tahunan  keyed at the daily rate       = RM132.75 (paid, outside the basis)
```

Every displayed step matches HR's worksheet (132.75 / 16.59 / 24.89). Note on
the final line: HR's Excel shows RM933.41 because Excel carries unrounded
decimals internally; the system pays at the sen-rounded RM24.89 rate that the
worksheet itself displays, giving 24.89 × 37.5 = RM933.38. The stored rate and
the amount always agree.

### Example C — monthly salary without additions

RM2,600 monthly salary, no eligible additions:

```
Daily rate    2,600.00 ÷ 26 = RM100.00
Hourly rate   100.00 ÷ 8   = RM12.50
OT rates      RM18.75 / RM25.00 / RM37.50
```

Adding a RM520 eligible allowance raises the basis to RM3,120 → hourly RM15.00
→ OT rates RM22.50 / RM30.00 / RM45.00. Adding a RM520 **Bonus** instead
changes nothing: the OT rates stay RM18.75 / RM25.00 / RM37.50 while gross pay
still includes the bonus.

All four examples are covered by the automated checks that were run against
`computeOTRates` during implementation (all passing).
