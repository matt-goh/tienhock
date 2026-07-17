# Payroll OT Calculation Change From July 2026 — Implementation Handover

Prepared: 2026-07-17  
Updated: 2026-07-18 — all sixteen section 8 decisions confirmed by the user, with HR input recorded in section 4.1  
Status: discovery and planning complete; policy decisions confirmed; ready for implementation  
Implementation status: **no payroll code, database schema, rates, or existing payroll records were changed**

## 1. Objective

Change only the overtime-rate calculation for payroll periods starting in July, while leaving ordinary salary and non-OT earning calculations unchanged.

The requested rule is employee- and month-dependent:

- Hourly/daily/piece worker:

      (earned salary + eligible additional earnings)
      ÷ actual days worked
      ÷ 8 normal hours
      × OT multiplier

- Monthly office worker:

      (monthly salary + eligible additional earnings)
      ÷ 26
      ÷ 8 normal hours
      × OT multiplier

- Multipliers:

  - ordinary working day: 1.5
  - Sunday/rest day OT: 2.0
  - public-holiday OT: 3.0

- Bonus is payable as usual but must not increase the OT rate.
- Existing OT pay must also be excluded from its own numerator to prevent a circular calculation.

All blocking decisions in section 8 were confirmed on 2026-07-18. Section 8 is now the authoritative policy record; implementation may proceed on those recorded answers.

## 2. Executive Finding

The current ERP does **not** calculate an OT rate from salary or monthly earnings. It calculates:

    configured OT rate × OT hours

The configured rate comes from a pay code, job override, employee override, or an effective-month rate schedule. The three values for Biasa, Ahad, and Umum are independent configured amounts; the system does not enforce 1.5, 2.0, and 3.0 multipliers.

The requested method is materially different because the rate must be rebuilt for every employee and payroll month after salary and all eligible additional earnings are known.

This cannot be implemented correctly by changing only the OT pay-code catalogue. It belongs in the authoritative payroll processors and their recalculation paths.

## 3. Attached CSV: Exact Reconstruction and Defects

Source inspected:

    C:\Users\NCSTi\Downloads\NEW_OT_CALCULATION_EXAMPLE.csv

The file is a 26-row, comma-delimited example headed PEKERJA BERGAJI JAM. It contains literal text and values, not spreadsheet formulas.

### Values shown

| Input | CSV value |
| --- | ---: |
| Example month | 06/2026 |
| Stated hourly rate | RM8.72 |
| Incentive/commission/allowance/additional-work payment | RM1,500.00 |
| Monthly OT | 40 hours |
| Ordinary work | 168 hours |
| Actual worked days | 21 |
| Normal hours per day | 8 |

### Calculation shown by the CSV

1. Earned salary: 168 × RM8.00 = RM1,344.00
2. Salary plus additions: RM1,344.00 + RM1,500.00 = RM2,844.00
3. Daily ordinary rate: RM2,844.00 ÷ 21 = RM135.43
4. Hourly ordinary rate: RM135.43 ÷ 8 = RM16.93
5. OT rates:

   - RM16.93 × 1.5 = RM25.40
   - RM16.93 × 2.0 = RM33.86
   - RM16.93 × 3.0 = RM50.79

### CSV defects — resolved 2026-07-18

1. **RM8.72 is stated but RM8.00 is used.**  
   The displayed RM1,344 salary is 168 × RM8.00, not 168 × RM8.72.  
   **Resolved:** RM8.72 is the correct hourly wage (decision 14). The corrected table below is authoritative.

2. **The step-one label is dimensionally wrong.**  
   It says 168 JAM × 8 JAM. The second value should be a money rate, not hours.  
   **Resolved:** the user confirmed the 8 is the 8 JAM normal-hours-per-day value mistakenly used in the multiplication; the wage is RM8.72 (decision 14).

3. **The 40 OT hours are never used.**  
   The sheet calculates three hourly OT rates but does not allocate the 40 hours across Biasa/Ahad/Umum or calculate total OT pay.

4. **The sheet rounds an intermediate rate.**  
   Full precision gives RM2,844 ÷ 21 ÷ 8 × 1.5 = RM25.392857, normally RM25.39. The displayed RM25.40 results from first rounding the hourly ordinary rate to RM16.93 and then multiplying.  
   **Resolved:** rounding each intermediate rate to sen is the intended contract (decision 13); HR's own worked example in section 4.1 rounds the same way.

RM8.72 is confirmed as the intended wage, so the corrected figures below are authoritative:

| Step | Corrected value |
| --- | ---: |
| Earned salary | RM1,464.96 |
| Numerator including RM1,500 | RM2,964.96 |
| Daily rate, rounded | RM141.19 |
| Hourly rate, rounded | RM17.65 |
| 1.5 OT rate | RM26.48 |
| 2.0 OT rate | RM35.30 |
| 3.0 OT rate | RM52.95 |

## 4. Official Source Check

This section is context for HR/payroll review, not legal advice.

The current JTKSM copy of the Employment Act 1955 supports the general divisor structure:

- section 60I states monthly ordinary rate of pay as monthly rate ÷ 26;
- daily/hourly/piece-rate ordinary rate is based on wages earned divided by actual days worked, with stated exclusions;
- hourly rate is ordinary daily rate divided by normal daily hours;
- section 60A states at least 1.5 times the hourly rate for overtime beyond normal hours;
- section 60 provides 2 times the hourly rate for hours beyond normal hours on a rest day;
- section 60D provides 3 times the hourly rate for hours beyond normal hours on a paid public holiday;
- the definition of wages excludes annual bonus, travelling allowance, and payments for special work expenses;
- section 60I separately excludes payments under an approved incentive payment scheme from ordinary-rate calculations.

Official source: [JTKSM Employment Act 1955 PDF](https://jtksm.mohr.gov.my/sites/default/files/2022-11/akta_kerja1955_bi.pdf).

This official text does **not** by itself prove that every ERP item labelled incentive, commission, or allowance must be included. The seminar instruction and the company's intended earning classification were therefore confirmed with the payroll officer; the outcome is recorded in section 4.1 and section 8.

The simple Sunday ×2 wording also applies specifically to work beyond normal hours on the rest day. The ERP must know whether the user is entering only those excess hours or all Sunday hours.

### 4.1 HR confirmation received 2026-07-18

The HR/payroll staff confirmed the divisor rules with a worked week and Bahasa Melayu guidance notes based on the Akta Kerja 1955:

| Day | Clocked | Ordinary hours | OT hours |
| --- | --- | ---: | ---: |
| Monday | 8am–5pm | 8 | 0 |
| Tuesday | 8am–5pm | 8 | 0 |
| Wednesday | 8am–7pm | 8 | 2 |
| Thursday | 8am–8pm | 8 | 3 |
| Friday | 8am–5pm | 8 | 0 |
| Saturday | 8am–3pm | 5 | 1 |
| **Week total** | | **45** | **6** |

Worked days for the week: **6**. (Observed pattern, not stated by HR: every counted total is one hour less than the clock span, consistent with an unpaid one-hour break.)

Key rules stated in the HR material:

- The hourly-rate divisor is **always 8**, even on the short Saturday. The 5-hour Saturday is company scheduling to complete the standard 45-hour week under the Akta Kerja 1955; the daily rate is still averaged over 8 hours and may not switch to a 5-hour divisor.
- For hourly-paid staff, the daily-rate divisor is the **actual attendance days** in the month (HR's example: 22).
- For monthly-paid staff, the divisor is **always 26**, regardless of whether the month has 28, 30, or 31 days.
- HR's worked example: RM1,500 basic + RM1,000 incentive = RM2,500 ÷ 26 = RM96.15 ÷ 8 = RM12.02 × 1.5 = RM18.03 ordinary-day OT rate — confirming both the incentive-in-numerator rule and rounding to sen at each intermediate step.
- The mandated calculation order: (1) Gaji Pokok + Insentif = Jumlah Pendapatan; (2) ÷ worked days (or 26) = Gaji Sehari; (3) ÷ 8 = Gaji Sejam; (4) × 1.5 = OT rate.

This confirms decision 6 and supports decisions 5, 7, 9, and 13 in section 8. Note the Saturday row: the existing 5-hour Saturday threshold continues to decide **how many hours are OT**, while the divisor that prices those hours stays 8.

## 5. Current ERP Behaviour

### 5.1 Rate calculation

The shared frontend calculation in src/utils/payroll/calculateActivityAmount.ts:31-49 multiplies the selected rate by the OT hours and rounds to sen.

It does not read:

- salary;
- allowances;
- incentives;
- commissions;
- bonuses;
- actual days worked;
- a divisor of 26;
- a divisor of 8 for rate derivation; or
- statutory multipliers.

### 5.2 OT hours

- Daily TH/JP entries treat hours over 8 as OT.
- Saturday uses the existing special threshold of hours over 5.
- BH_OT_STIM uses forced OT hours instead of natural OT hours.
- Monthly TH/JP entries accept explicit OT-hour totals.
- GT Office accepts a single explicit OT-hour total.

The threshold logic is in src/utils/payroll/calculateActivityAmount.ts:8-15 and :41-49.

### 5.3 Rate source and precedence

TH and JP use configured pay-code rates with optional job/employee overrides and effective-month schedules. Existing schedule precedence is employee, then job, then pay code.

Relevant paths:

- src/utils/payroll/useEffectiveRates.ts
- src/routes/catalogue/pay-rate-schedules.js
- src/routes/jellypolly/pay-rate-schedules.js
- AGENTS.md:167 and :253

These schedules can change a static rate from a month onward. They cannot represent a rate that changes with each employee's monthly earnings.

### 5.4 Existing office-rate example

The development data confirms that several existing office overrides already encode the old salary-only formula:

| Employee example | Base salary used by payroll | Current ordinary-day OT rate | Derivation |
| --- | ---: | ---: | --- |
| AMY | RM1,700 | RM12.26 | 1,700 ÷ 26 ÷ 8 × 1.5 |
| MATTHEW | RM3,000 | RM21.63 | 3,000 ÷ 26 ÷ 8 × 1.5 |
| MILTI | RM3,100 across two Base items | RM22.36 | 3,100 ÷ 26 ÷ 8 × 1.5 |

This proves the old configured rates sometimes reflect salary ÷ 26, but variable earnings do not automatically change them.

### 5.5 Earning classification

The canonical pay types are only:

- Base
- Tambahan
- Overtime

There is no canonical OT-basis classification for allowance, incentive, commission, bonus, or additional-work payment.

Important current distinctions:

- TH commission_records uses location_code IS NOT NULL for Commission and NULL for Bonus.
- JP/GT commission_records mainly represents Bonus and Advance through is_advance and page context.
- others_records may contain either Overtime or non-OT extra work.
- manual payroll items can be Base, Tambahan, or Overtime.
- Salary Report has CIO presentation heuristics in src/routes/payroll/salary-report.js:321-405, but those heuristics are not a safe payroll-rule source of truth.

### 5.6 Three separate authoritative processors

| Company | Authoritative processor | Current OT source |
| --- | --- | --- |
| Tien Hock | src/routes/payroll/monthly-payrolls.js | Mix of re-resolved daily configured rates and saved monthly activity snapshots |
| Green Target | src/routes/greentarget/monthly-payrolls.js | Saved monthly activity rate/amount |
| Jelly Polly | src/routes/jellypolly/jpPayrollProcessor.js | Saved monthly/daily activity rate/amount |

The corresponding employee-payroll recalculation routes also need to remain consistent:

- src/routes/payroll/employee-payrolls.js
- src/routes/greentarget/employee-payrolls.js
- src/routes/jellypolly/employee-payrolls.js

### 5.7 July already contains processed payroll data

At discovery time, the development database already contained July 2026 payroll rows:

| Company | July employee payroll rows |
| --- | ---: |
| Tien Hock | 76 |
| Green Target | 8 |
| Jelly Polly | 7 |

The existing July rows were produced by the old method. “Starting July” therefore requires an explicit decision to reprocess existing July payrolls, not only a forward-looking code cutoff.

The discovery query did not modify any database data.

Decision 3 now confirms these July payrolls must be reprocessed under the new method; the users will trigger the reprocessing and derived-document regeneration themselves (see section 8).

## 6. Current Method Versus Requested Method

| Concern | Current ERP | Requested method | Consequence |
| --- | --- | --- | --- |
| OT rate | Static configured rate | Dynamic employee/month rate | Must calculate during payroll processing |
| Salary input | Not read by OT logic | Included in numerator | Must classify and total salary items |
| Additions | Unrelated to OT rate | Selected allowances/incentives/commissions/additional work included | Needs explicit eligibility rules |
| Bonus | Unrelated to OT rate | Explicitly excluded | Must identify bonuses reliably |
| Existing OT | Unrelated to next rate | Must be excluded from basis | Prevent circular calculation |
| Hourly denominator | None | Actual days worked | No first-class worked-days field exists |
| Monthly denominator | None | Fixed 26 | Need explicit employee pay basis |
| Daily-hours denominator | None | 8 | Confirmed: always 8 (decision 6) |
| Day multipliers | Three independent configured rates | 1.5 / 2.0 / 3.0 | Existing overrides may be bypassed |
| Timing | Calculated when work log is entered | Final only after all month earnings exist | Entry preview cannot be authoritative |
| Effective date | Static schedules only | New method from July | Add formula-version cutoff |
| Audit data | Stored rate, quantity, amount | Derived from several totals | Consider persisting basis breakdown |

## 7. Data Gaps and Edge Cases

These gaps were identified during discovery. Section 8 now records the confirmed resolution for each; this section is retained as context for why each decision was needed.

### 7.1 No reliable employee pay-basis field

staffs.payment_type is not a monthly/hourly employment classification. Salary is usually represented by Base payroll items or employee pay-code overrides rather than a salary column.

Deriving pay basis from job name or rate unit would be fragile. One employee may work several jobs and TH/JP may group sibling staff IDs into one payroll row.

Resolution: explicit pay-basis classification with company-specific settings (decision 4).

### 7.2 No worked-days field

Daily sources contain dates, but monthly sources contain aggregate hours only.

Potential sources have different semantics:

- daily_work_logs: distinct submitted work dates;
- production_entries: distinct production dates;
- monthly_work_log_entries: total hours, not dates;
- approved leave: date exists, but whether it counts is undecided;
- grouped sibling IDs: the same calendar date must not be counted twice;
- multiple shifts/jobs on one date: normally one day, but this must be confirmed.

For monthly-logged hourly staff, actual days cannot be reconstructed exactly unless the business accepts total ordinary hours ÷ 8 or adds a worked-days input.

Resolution: attendance-date rule with a worked-days input for monthly-logged actual-days staff (decision 5). Note HR's example week is 45 ordinary hours yet 6 worked days, so hours ÷ 8 is **not** an acceptable approximation.

### 7.3 Office lacks complete OT day categories

- TH and JP Office deliberately hide Ahad and Umum hour inputs.
- GT Office stores only total hours and one generic OT-hours value.

If office OT can occur on Sundays or public holidays, separate OT hour inputs are required before the ×2 and ×3 rules can be applied accurately.

Resolution: adding Office Ahad/Umum inputs is out of scope (decision 11).

### 7.4 Special and manual OT codes

The public catalogue currently has many Overtime pay codes, including Hour and Day units, special task payments, zero-rate placeholders, forced-OT codes, and manual Kerja Luar records.

Applying a salary-derived rate to every item whose pay_type is Overtime could incorrectly overwrite fixed special payments. The scope must be explicit.

Resolution: formula by default for everything previously classified Overtime, with a per-code/per-item fixed/manual opt-out (decision 10).

### 7.5 Recalculation dependency

Changing an eligible allowance or commission after payroll processing must also rebuild:

- OT rate and OT amount;
- gross pay;
- SOCSO/SIP/PCB amounts where affected;
- net pay and rounding;
- bank/payment totals;
- salary reports and payslips;
- payroll accounting summaries and journal values.

TH and GT add-on routes do not currently perform the same broad automatic reprocessing that JP already performs.

### 7.6 Rounding

The CSV appears to round:

1. daily ordinary rate to two decimals;
2. hourly ordinary rate to two decimals;
3. OT hourly rate to two decimals;
4. eventual OT amount separately.

The current ERP sometimes consolidates quantities by pay code and rounded rate before rounding the total. A formal rounding contract is necessary to prevent one-sen differences among payroll, payslip, salary report, and journals.

Resolution: sen-rounding at each intermediate step, matching existing ERP conventions, the CSV order, and HR's worked example (decision 13).

## 8. Decisions — Confirmed 2026-07-18

Every blocking policy question below was answered by the user on 2026-07-18, with HR input for the divisor question (section 4.1). These recorded answers are the authoritative policy for implementation.

1. **Effective period — confirmed.**  
   The new formula applies to payroll month July 2026 and every later month. June 2026 and earlier keep the legacy configured rates.

2. **Company scope — confirmed.**  
   All three companies: Tien Hock, Green Target, and Jelly Polly.

3. **Existing July payrolls — confirmed, reprocess.**  
   The already-processed July 2026 payrolls must be reprocessed under the new method, and the derived documents including all accounting journals must reflect the reprocessed values. The users will take care of triggering the reprocessing and regeneration themselves; the implementation must make reprocessing and the resulting journal/report refresh possible and correct, not run an unattended backfill.

4. **Employee pay basis — confirmed, explicit and flexible.**  
   Add an explicit pay-basis classification (monthly_26 versus actual_days) with company-specific settings rather than inferring from job names. Entry UX generally stays as it is today: daily work logs and monthly work logs continue to record OT hours the way users already know. The implementer has discretion to adjust entry/preview UI where the new calculation genuinely requires it, choosing the cleanest UX.

5. **Worked-day definition — confirmed; implementer defines the most logical rule and flags real issues.**  
   Default rule to implement:

   - a worked day is one distinct calendar date with any recorded ordinary-work attendance (daily work log entry not fully on leave, or production attendance);
   - the same date counts once across multiple shifts, jobs, and grouped sibling staff IDs;
   - partial days and the short Saturday count as one full worked day (HR's example counts Saturday as a day; the correction happens through the fixed 8-hour divisor, not the day count);
   - attended Sundays and public holidays count as worked days;
   - paid-leave days without attendance do not count as worked days;
   - for hourly staff logged only in monthly aggregate hours, dates cannot be reconstructed, so a worked-days input is required at entry/processing time (per decision 4 the exact UX is the implementer's choice); do not silently approximate with ordinary hours ÷ 8, because HR's example week is 45 ordinary hours yet 6 worked days.

   Known interaction to watch: decision 7 includes paid-leave pay in the numerator while leave days are excluded from the divisor, which slightly raises the rate for actual-days employees with leave. If implementation or HR verification shows any part of this rule to be materially wrong, stop and raise it with the user again instead of guessing. Everything not OT-related stays unchanged.

6. **Eight-hour divisor — confirmed, always 8.**  
   HR confirmed with the worked week and Akta Kerja 1955 guidance in section 4.1: the rate divisor is always 8, including for employees whose Saturday ordinary threshold is 5 hours. The Saturday 5-hour threshold continues to decide how many hours are OT; the divisor pricing those hours stays 8.

7. **Earnings included in the numerator — confirmed, include all wage-like earnings.**  
   All the listed earning categories are included: Base payroll items, fixed monthly salary items, hourly/daily base earnings, piece-rate/production earnings, TH Commission records, allowances and incentive pay codes, non-OT Others/Kerja Luar records, manual Tambahan items, approved paid-leave pay, and advances that are earned in the month but paid earlier. Excluded: bonus (decision 8), existing OT pay (anti-circularity), and pure expense/travel reimbursements (statutory wage exclusion). During implementation, any item whose classification is genuinely ambiguous must be surfaced to the user, not silently decided.

8. **Bonus exclusion — confirmed.**  
   Bonus is excluded only from the OT numerator. It continues to be paid and included in gross pay normally.

9. **Incentive wording — confirmed, unchanged handling.**  
   Incentives keep working exactly as they do today everywhere else; for the OT rate they are included in the numerator, matching HR's Gaji Pokok + Insentif formula (section 4.1). No approved-incentive-payment-scheme carve-out is modelled unless the new calculation is later shown to require it.

10. **OT item scope — confirmed, flexible with formula as the default.**  
    Every item the system identified as OT before (pay_type Overtime, including Others/Kerja Luar OT and manually added OT items) is by default an OT item under the new calculation. Add a flexible per-code/per-item rate mode (salary_formula versus fixed/manual) so users can keep specific special payments fixed. Items the user opts out of stay untouched by the formula.

11. **Sunday and public-holiday hour semantics — out of scope.**  
    Adding Office Ahad/Umum entry fields is out of scope. Entered hours keep their current semantics; the new rates apply only to hour quantities the system already captures. Revisit only if the new calculation is genuinely broken without it.

12. **Wage period — confirmed, same month.**  
    The numerator and worked days come from the payroll month itself, as the CSV does and as the system behaves today. No preceding-wage-period lookback.

13. **Rounding contract — confirmed, same conventions as before.**  
    Keep the ERP's existing money conventions: derived rates are stored to sen exactly as configured rates always were — daily ordinary rate to sen, then hourly ordinary rate to sen, then each multiplied OT rate to sen — and each OT amount (rate × category hours) rounds to sen. This matches both the CSV's rounding order and HR's worked example (RM96.15 → RM12.02 → RM18.03). The exact final contract must be spelled out in the post-implementation breakdown document (section 9.7).

14. **CSV rate — confirmed, RM8.72.**  
    RM8.72 is the correct base hourly wage. The CSV's ×8 was the 8 JAM (normal hours per day) value misused as a money rate. The corrected RM8.72 table in section 3 is authoritative; the RM8.00 variant is dropped from acceptance tests.

15. **Zero-day and incomplete-input behavior — confirmed, block.**  
    If an actual-days employee has OT but no valid worked-day count, payroll processing must block with a clear employee-level error. Never fall back silently or produce zero/Infinity rates.

16. **Manual override behavior — confirmed, post-cutoff manual edits win.**  
    The existing effective-month pay-rate schedule system stays in place and keeps governing legacy months and non-formula items; the formula cutoff itself is month-versioned so future formula revisions can be introduced the same effective-month way. For July 2026 and later, a manual OT edit made knowingly under the new system takes priority over the formula and stays fixed on later reprocessing. Configured overrides and schedules created before the new OT calculation existed do not override the formula for July 2026+; they remain authoritative for June 2026 and earlier only.

## 9. Recommended Implementation Shape After Decisions

### 9.1 One calculation contract

Create one pure, typed/JSDoc-described OT calculation contract used by all three processors. It should accept integer cents and return:

- formula version;
- employee pay basis;
- salary numerator;
- eligible-additions numerator with a source breakdown;
- excluded bonus and excluded OT totals;
- divisor days;
- normal hours per day;
- rounded ordinary daily/hourly rates;
- Biasa/Ahad/Umum multipliers and rates;
- validation errors.

Do not copy the formula into three route files or into reports.

### 9.2 Authoritative processing order

For July 2026 onward:

1. Build all non-OT salary and earning items.
2. Load commission, allowance, incentive, Others, manual, leave, and bonus sources.
3. Classify included and excluded amounts.
4. Determine employee pay basis and divisor.
5. Calculate one month-level ordinary hourly rate.
6. Apply the three multipliers to statutory OT hour quantities.
7. Store the derived OT item rate and amount.
8. Calculate gross, deductions, net pay, rounding, reports, and accounting consumers from the stored results.

For June 2026 and earlier, preserve the current configured-rate path.

The cutoff should use payroll year/month, not work-log creation time or payment date:

    year > 2026 OR (year = 2026 AND month >= 7)

### 9.3 Explicit classification instead of descriptions

Avoid rules such as description contains BONUS or code starts with OT.

The safest model is explicit metadata for:

- employee OT basis: monthly_26, actual_days, or legacy_fixed;
- earning OT-basis eligibility: include, exclude_bonus, exclude_ot, expense, or fixed_special;
- OT rate mode: salary_formula or fixed/manual.

Decisions 4, 7, and 10 confirm this model: pay basis is explicit with company-specific settings, numerator eligibility follows decision 7's include/exclude lists, and OT rate mode defaults to salary_formula for everything previously classified Overtime, with a per-code/per-item opt-out to fixed/manual. The exact tables/columns are the implementer's choice. Any schema change must update both AGENTS.md and CLAUDE.md.

### 9.4 Persistence and audit

payroll_items already snapshots rate, quantity, and amount. That is enough to print the result but not enough to explain it.

Recommended: persist a compact per-employee/month OT calculation snapshot containing at least formula version, numerator, divisor, normal hours, and three final rates. This allows a payroll user or auditor to explain why a July rate differs from June.

### 9.5 Entry-page previews

Month-wide additions may be entered after a work log. Therefore:

- work-log pages may show an estimate;
- payroll processing must remain authoritative;
- UI should label an estimate clearly if eligible additions are not final;
- payroll details should show the final stored rate and an optional calculation breakdown.

### 9.6 Reprocessing triggers

After an affected July-or-later payroll exists, changes to these sources must trigger full employee/month reprocessing or mark payroll as needing reprocessing:

- salary/base item;
- eligible allowance/incentive/commission/additional work;
- bonus classification;
- worked-day input/attendance;
- OT hours/day category;
- manual item;
- leave where included or used in day counting.

### 9.7 Required post-implementation deliverable: calculation breakdown document

When the implementation is finished, the implementer must write a **separate markdown file** (suggested: docs/PAYROLL_OT_CALCULATION_BREAKDOWN.md) giving the user a detailed but straightforward breakdown of the calculations inside the new calculation contract. It must cover, in plain language with worked numbers:

- the formula per pay basis (monthly_26 and actual_days) and the July 2026 cutoff;
- exactly which earning categories enter the numerator and which are excluded;
- the worked-day rule actually implemented;
- the fixed 8-hour divisor and the 1.5 / 2.0 / 3.0 multipliers;
- the rounding applied at every step;
- the manual-override and reprocessing behavior;
- at least two end-to-end worked examples (HR's RM1,500 + RM1,000 monthly example and the corrected RM8.72 CSV example).

This document is part of the definition of done (section 13), not an optional extra.

## 10. Files Expected to Change During Implementation

This is a planning list, not permission to edit every file automatically.

### Shared calculation and types

- src/utils/payroll/calculateActivityAmount.ts — preview behavior only; no longer authoritative for final dynamic OT.
- src/utils/payroll/moneyUtils.ts — reuse the established money-rounding helpers where the confirmed contract matches.
- src/types/types.ts — add typed calculation/breakdown fields used by UI.
- A new small shared backend OT calculation helper — exact location to be chosen during implementation.

### Tien Hock

- src/routes/payroll/monthly-payrolls.js
- src/routes/payroll/employee-payrolls.js
- src/pages/Payroll/MonthlyLog/MonthlyLogEntryPage.tsx
- src/routes/payroll/monthly-work-logs.js if new worked-day/day-category inputs are required
- src/routes/payroll/incentives.js and src/routes/payroll/others-records.js if automatic reprocessing is chosen
- Daily entry paths only as needed for preview and preserved OT-hour categorisation

### Green Target

- src/routes/greentarget/monthly-payrolls.js
- src/routes/greentarget/employee-payrolls.js
- src/pages/GreenTarget/Payroll/GTMonthlyLogEntryPage.tsx
- src/routes/greentarget/monthly-work-logs.js
- GT incentive/Others routes if automatic reprocessing is chosen

### Jelly Polly

- src/routes/jellypolly/jpPayrollProcessor.js
- src/routes/jellypolly/employee-payrolls.js
- src/pages/JellyPolly/Payroll/JPMonthlyLogEntryPage.tsx
- src/routes/jellypolly/monthly-work-logs.js if new fields are required
- Existing JP source-change reprocessing must call the new calculation contract

### Downstream verification, preferably no duplicate formula

- src/routes/payroll/salary-report.js
- src/routes/greentarget/salary-report.js
- src/routes/jellypolly/salary-report.js
- src/utils/payroll/PaySlipPDFMake.ts
- src/utils/payroll/SalaryReportPDF.tsx
- E-Caruman routes
- src/routes/accounting/journal-vouchers.js
- payroll bank/payment summaries

These consumers should read the rebuilt stored results rather than recalculate OT independently.

### Documentation and changelog

- AGENTS.md and CLAUDE.md if the database schema changes
- src/components/ChangelogModal.tsx when the user-visible calculation ships
- docs/PAYROLL_OT_CALCULATION_BREAKDOWN.md — the required post-implementation calculation breakdown (section 9.7)

## 11. Backfill and Release Plan

1. ~~Freeze the policy decisions in section 8.~~ Done 2026-07-18; section 8 is the record.
2. Add the schema/classification metadata confirmed by decisions 4, 7, and 10.
3. Implement and unit-test the shared calculation contract.
4. Integrate the TH, GT, and JP processors (all three companies are in scope per decision 2).
5. Integrate every employee-payroll/manual-item recalculation path.
6. Office Ahad/Umum inputs are out of scope (decision 11) — skip unless the calculation is proven broken without them.
7. Add source-change reprocessing or a visible stale-payroll state.
8. Verify downstream reports, bank totals, contributions, and journals.
9. Make July 2026 reprocessing available in a controlled transaction/workflow; the users will trigger the reprocessing and the regeneration of derived accounting/payment documents themselves (decision 3).
10. Write the calculation breakdown document (section 9.7).
11. Add the user-facing changelog entry.

Do not rewrite June or earlier work logs/payrolls. Do not use pay-rate schedules to fake variable monthly rates.

## 12. Acceptance and Verification Matrix

No automated payroll/OT tests were found in the repository. The implementation should add focused calculation tests and then run manual end-to-end verification.

### Formula tests

1. **CSV example at the confirmed RM8.72 wage** (the RM8.00 variant is dropped — decision 14)

   - salary RM1,464.96
   - additions RM1,500
   - 21 worked days
   - rates RM26.48 / RM35.30 / RM52.95 using rounded intermediates

2. **HR monthly worked example (section 4.1)**

   - monthly salary RM1,500, eligible incentive RM1,000
   - numerator RM2,500, divisor 26, normal hours 8
   - daily rate RM96.15, hourly rate RM12.02, ordinary-day OT rate RM18.03

3. **Monthly salary without additions**

   - monthly salary RM2,600
   - ordinary daily rate RM100
   - ordinary hourly rate RM12.50
   - OT rates RM18.75 / RM25.00 / RM37.50

4. **Monthly salary with eligible allowance**

   - monthly salary RM2,600
   - eligible allowance RM520
   - numerator RM3,120
   - ordinary hourly rate RM15
   - OT rates RM22.50 / RM30.00 / RM45.00

5. A bonus changes gross pay but does not change any OT rate.
6. Existing OT pay never increases the next OT rate.
7. Excluded expense/travel payments do not change the rate.

### Period and source tests

- June 2026 reprocessing keeps configured legacy rates.
- July 2026 and later use the new formula.
- Same employee/date across multiple jobs or sibling IDs counts once.
- Multiple shifts on one date count as one worked day (decision 5).
- Partial days, Saturday, leave, Sunday, and public holidays follow the decision 5 rule.
- HR's example week produces 45 ordinary hours, 6 OT hours, and 6 worked days (section 4.1).
- Zero worked days blocks processing with an actionable employee-level error (decision 15).
- Biasa, Ahad, and Umum hours receive only their own rate.
- Fixed/special/manual OT remains unchanged where configured as fixed (decision 10).

### Recalculation tests

- Adding/editing/deleting an eligible earning changes OT, gross, deductions, net, and rounding once.
- Adding/editing/deleting a bonus does not change OT.
- Changing worked days changes OT and all dependent totals.
- Reprocessing the same unchanged payroll is idempotent.
- Manual payroll items survive or are replaced per decision 16: post-cutoff manual edits survive reprocessing; pre-cutoff configured values do not beat the formula for July 2026+.

### Reconciliation tests

- Payroll details and payslip show the same OT rate, hours, and total.
- Monthly and annual Salary Report OT totals match payroll items.
- E-Caruman wage/contribution values match the rebuilt payroll.
- Bank/payment totals match net pay.
- Payroll accounting journal totals match the final payroll.

## 13. Success Criteria

The change is complete only when:

- the CSV inconsistency and all policy questions are resolved (**done 2026-07-18**; recorded in sections 4.1 and 8);
- the formula is gated by payroll period from the confirmed July 2026 cutoff;
- every in-scope company (TH, GT, JP) uses the same calculation contract;
- all eligible additions and exclusions are explicit and auditable;
- actual-days employees have a reliable divisor;
- monthly employees use fixed 26;
- Biasa/Ahad/Umum rates use the confirmed multipliers and hours;
- June history remains unchanged;
- existing July payrolls are reprocessable under decision 3, with users triggering the reprocessing and derived-document regeneration;
- all recalculation paths and downstream reports reconcile;
- the calculation breakdown document described in section 9.7 is delivered as a separate markdown file; and
- a user-facing changelog entry is added when the behavior ships.

## 14. Handover State

Completed in this discovery pass:

- inspected the supplied CSV;
- reconstructed both possible calculations;
- traced the current TH, GT, and JP OT paths;
- inspected the relevant development schema and current configured OT behavior;
- identified July payrolls already processed under the old method;
- checked the current official JTKSM source for divisor/multiplier context;
- listed policy blockers, implementation touchpoints, release risks, and verification cases.

Update 2026-07-18:

- all sixteen section 8 policy questions were answered by the user; section 8 now records the confirmed decisions;
- HR supplied the worked week and Akta Kerja 1955 guidance recorded in section 4.1;
- the CSV wage ambiguity is resolved as RM8.72; the RM8.00 acceptance variant is dropped;
- the post-implementation calculation breakdown document (section 9.7) was added as a required deliverable;
- still no code, schema, rate, or payroll-record changes — the next step is implementation per sections 9–11.

Intentionally not done:

- no code changes;
- no database migration;
- no rate edits;
- no payroll reprocessing;
- no build, type check, lint, or application test command;
- no changelog entry, because the user-visible behavior has not shipped.
