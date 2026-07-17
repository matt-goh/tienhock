# Payroll OT Calculation Change From July 2026 — Implementation Handover

Prepared: 2026-07-17  
Status: discovery and planning only  
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

The implementation is not ready to code safely until the decisions in section 8 are confirmed.

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

### CSV defects that require confirmation

1. **RM8.72 is stated but RM8.00 is used.**  
   The displayed RM1,344 salary is 168 × RM8.00, not 168 × RM8.72.

2. **The step-one label is dimensionally wrong.**  
   It says 168 JAM × 8 JAM. The second value should be a money rate, not hours.

3. **The 40 OT hours are never used.**  
   The sheet calculates three hourly OT rates but does not allocate the 40 hours across Biasa/Ahad/Umum or calculate total OT pay.

4. **The sheet rounds an intermediate rate.**  
   Full precision gives RM2,844 ÷ 21 ÷ 8 × 1.5 = RM25.392857, normally RM25.39. The displayed RM25.40 results from first rounding the hourly ordinary rate to RM16.93 and then multiplying.

If RM8.72 is the intended wage, the corrected figures are:

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

This official text does **not** by itself prove that every ERP item labelled incentive, commission, or allowance must be included. The seminar instruction and the company's intended earning classification must therefore be confirmed by the payroll officer before coding.

The simple Sunday ×2 wording also applies specifically to work beyond normal hours on the rest day. The ERP must know whether the user is entering only those excess hours or all Sunday hours.

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
| Daily-hours denominator | None | 8 | Confirm whether always 8 or contractual normal hours |
| Day multipliers | Three independent configured rates | 1.5 / 2.0 / 3.0 | Existing overrides may be bypassed |
| Timing | Calculated when work log is entered | Final only after all month earnings exist | Entry preview cannot be authoritative |
| Effective date | Static schedules only | New method from July | Add formula-version cutoff |
| Audit data | Stored rate, quantity, amount | Derived from several totals | Consider persisting basis breakdown |

## 7. Data Gaps and Edge Cases

### 7.1 No reliable employee pay-basis field

staffs.payment_type is not a monthly/hourly employment classification. Salary is usually represented by Base payroll items or employee pay-code overrides rather than a salary column.

Deriving pay basis from job name or rate unit would be fragile. One employee may work several jobs and TH/JP may group sibling staff IDs into one payroll row.

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

### 7.3 Office lacks complete OT day categories

- TH and JP Office deliberately hide Ahad and Umum hour inputs.
- GT Office stores only total hours and one generic OT-hours value.

If office OT can occur on Sundays or public holidays, separate OT hour inputs are required before the ×2 and ×3 rules can be applied accurately.

### 7.4 Special and manual OT codes

The public catalogue currently has many Overtime pay codes, including Hour and Day units, special task payments, zero-rate placeholders, forced-OT codes, and manual Kerja Luar records.

Applying a salary-derived rate to every item whose pay_type is Overtime could incorrectly overwrite fixed special payments. The scope must be explicit.

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

## 8. Decisions Required Before Coding

The items below are blocking policy questions. Recommended choices are stated only to make confirmation faster.

1. **Effective period**  
   Does “starting July” mean payroll month **July 2026 and every later month**, while June 2026 and earlier retain the legacy configured rates?  
   Recommended: yes.

2. **Company scope**  
   Does “all payrolls” mean Tien Hock, Green Target, and Jelly Polly, or only Tien Hock?

3. **Existing July payrolls**  
   Must the already-processed July 2026 payrolls be reprocessed? If July bank payments or accounting journals were already generated, may those derived documents be regenerated?

4. **Employee pay basis**  
   Which employees use fixed 26 and which use actual worked days?  
   Recommended: add/confirm an explicit company-specific setting such as monthly_26, actual_days, or legacy_fixed instead of inferring it from job names.

5. **Worked-day definition**  
   For actual-days employees, should a day be:

   - one distinct ordinary-work attendance date;
   - total ordinary hours ÷ 8;
   - a manually entered payroll value; or
   - another rule?

   Also confirm treatment of partial days, Saturday, multiple shifts, leave, Sunday, and public holidays.

6. **Eight-hour divisor**  
   Is the divisor always 8, including employees whose normal Saturday threshold is currently 5 hours, or should it use each employee's contractual normal daily hours?

7. **Earnings included in the numerator**  
   Confirm each category independently:

   - all Base payroll items;
   - fixed monthly salary items;
   - hourly/daily base earnings;
   - piece-rate/production earnings;
   - TH Commission records;
   - allowances and incentive pay codes;
   - non-OT Others/Kerja Luar records;
   - manual Tambahan items;
   - approved paid leave;
   - advances that are earned in the month but paid earlier;
   - travel or expense reimbursements.

8. **Bonus exclusion**  
   Does the statement mean bonus is excluded only from the OT numerator, while it continues to be paid and included in gross pay normally?  
   Recommended: yes.

9. **Incentive wording versus official source**  
   Should every incentive be included, or only incentives that are wages and are not under an approved incentive-payment scheme? Payroll/HR should record the approved classification.

10. **OT item scope**  
    Should the new rate replace:

    - all Hour items with pay_type Overtime;
    - only a curated set of statutory OT pay codes;
    - Others/Kerja Luar OT;
    - manually added OT items; and/or
    - Day-unit special OT items?

    Recommended: give pay codes/records an explicit salary_formula versus fixed/manual mode.

11. **Sunday and public-holiday hours**  
    Are the entered Ahad/Umum hours only hours beyond the normal daily hours? If Office can earn those rates, should separate fields be added to TH, JP, and GT Office entry?

12. **Wage period**  
    For a July payroll, should the numerator and worked days come from July itself, as the CSV appears to do, or from the immediately preceding completed wage period?

13. **Rounding contract**  
    Confirm whether the CSV's intermediate rounding is authoritative:

    - round daily rate to sen;
    - then hourly rate to sen;
    - then multiplied OT rate to sen;
    - then rate × category hours to sen.

14. **CSV rate error**  
    Is RM8.72 the correct base hourly wage, or is RM8.00 correct?

15. **Zero-day and incomplete-input behavior**  
    If an actual-days worker has OT but no valid worked-day count, should payroll block processing with a clear error?  
    Recommended: block; never fall back silently or produce zero/Infinity.

16. **Manual override behavior**  
    If a payroll user manually changes an OT item, should that item stay fixed on later reprocessing, or should the salary formula always replace it?

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

The exact tables/columns should be chosen only after company scope and category rules are confirmed. Any schema change must update both AGENTS.md and CLAUDE.md.

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

## 11. Backfill and Release Plan

1. Freeze the policy decisions in section 8.
2. Add schema/classification metadata only if required.
3. Implement and unit-test the shared calculation contract.
4. Integrate TH, GT, and JP processors in the confirmed scope.
5. Integrate every employee-payroll/manual-item recalculation path.
6. Add Office Ahad/Umum inputs if required.
7. Add source-change reprocessing or a visible stale-payroll state.
8. Verify downstream reports, bank totals, contributions, and journals.
9. Reprocess July 2026 payrolls in a controlled transaction/workflow.
10. Regenerate July derived accounting/payment documents only with explicit approval.
11. Add the user-facing changelog entry.

Do not rewrite June or earlier work logs/payrolls. Do not use pay-rate schedules to fake variable monthly rates.

## 12. Acceptance and Verification Matrix

No automated payroll/OT tests were found in the repository. The implementation should add focused calculation tests and then run manual end-to-end verification.

### Formula tests

1. **CSV at RM8.00, if confirmed**

   - salary RM1,344
   - additions RM1,500
   - 21 worked days
   - rates RM25.40 / RM33.86 / RM50.79 using the CSV rounding order

2. **CSV at RM8.72, if confirmed**

   - salary RM1,464.96
   - additions RM1,500
   - 21 worked days
   - rates RM26.48 / RM35.30 / RM52.95 using rounded intermediates

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
- Multiple shifts on one date follow the confirmed worked-day rule.
- Partial days, Saturday, leave, Sunday, and public holidays follow the confirmed rule.
- Zero worked days blocks processing with an actionable employee-level error.
- Biasa, Ahad, and Umum hours receive only their own rate.
- Fixed/special/manual OT remains unchanged where configured as fixed.

### Recalculation tests

- Adding/editing/deleting an eligible earning changes OT, gross, deductions, net, and rounding once.
- Adding/editing/deleting a bonus does not change OT.
- Changing worked days changes OT and all dependent totals.
- Reprocessing the same unchanged payroll is idempotent.
- Manual payroll items survive or are replaced according to the confirmed override rule.

### Reconciliation tests

- Payroll details and payslip show the same OT rate, hours, and total.
- Monthly and annual Salary Report OT totals match payroll items.
- E-Caruman wage/contribution values match the rebuilt payroll.
- Bank/payment totals match net pay.
- Payroll accounting journal totals match the final payroll.

## 13. Success Criteria

The change is complete only when:

- the CSV inconsistency and all policy questions are resolved;
- the formula is gated by payroll period from the confirmed July cutoff;
- every in-scope company uses the same calculation contract;
- all eligible additions and exclusions are explicit and auditable;
- actual-days employees have a reliable divisor;
- monthly employees use fixed 26;
- Biasa/Ahad/Umum rates use the confirmed multipliers and hours;
- June history remains unchanged;
- existing July payrolls are handled under an approved reprocessing policy;
- all recalculation paths and downstream reports reconcile; and
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

Intentionally not done:

- no code changes;
- no database migration;
- no rate edits;
- no payroll reprocessing;
- no build, type check, lint, or application test command;
- no changelog entry, because the user-visible behavior has not shipped.
