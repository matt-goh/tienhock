# Journal Voucher Account Code Calculations

This document explains how each account code is calculated in the journal voucher generation system.

## JVDR - Director's Remuneration Voucher

### Debit Accounts (Expenses)

| Account Code | Description | Calculation | Source Field |
|--------------|-------------|-------------|--------------|
| **MBDRS** | Directors Salary Expense | Sum of all directors' gross pay | `gross_pay` |
| **MBDRE** | Directors EPF Expense | Sum of employer EPF contributions | `epf_employer` |
| **MBDRSC** | Directors SOCSO Expense | Sum of employer SOCSO contributions | `socso_employer` |
| **MBDRSIP** | Directors SIP Expense | Sum of employer SIP contributions | `sip_employer` |

### Credit Accounts (Liabilities/Payables)

| Account Code | Description | Calculation | Notes |
|--------------|-------------|-------------|-------|
| **ACD_SAL** | Salary Payable | Individual director's net pay | One line per director |
| **ACD_EPF** | EPF Payable | `epf_employer + epf_employee` | Total EPF (both portions) |
| **ACD_SC** | SOCSO Payable | `socso_employer + socso_employee` | Total SOCSO (both portions) |
| **ACD_SIP** | SIP Payable | `sip_employer + sip_employee` | Total SIP (both portions) |
| **ACD_PCB** | PCB Payable | `employee_amount` for income_tax | Employee tax withheld |

### Balance Formula

```
DEBITS = Gross Salary + EPF Employer + SOCSO Employer + SIP Employer

CREDITS = Net Pay (all directors)
        + EPF Total (employer + employee)
        + SOCSO Total (employer + employee)
        + SIP Total (employer + employee)
        + PCB (employee only)

Balance Verification:
  Gross = Net + EPF_employee + SOCSO_employee + SIP_employee + PCB
```

### Rounding (digenapkan) — added 6 Jul 2026

Legacy convention, now reproduced: each director's net pay is rounded **up to the whole
ringgit** before crediting `ACD_SAL` (e.g. 3,077.05 → 3,078.00), and the total rounding
difference is debited back to the salary expense account (`MBDRS`) as a
**"Rounding Adjustment"** line — exactly like the legacy JVDR print
(Jun 2026: nets 9,819.05 → 9,821.00, rounding 1.95, voucher total 12,940.00).

---

## JVSL - Staff Salary Voucher

### The JVSL is the Salary Report, transposed into GL lines (7 Jul 2026)

The legacy JVSL is the monthly **Salary Report** rendered as journal lines. So the
voucher is now built **directly from the salary report's per-location figures** — the
single source of truth — via `computeMonthlySalaryReport()` (exported from
`payroll/salary-report.js`) and `buildJvslFromSalaryReport()` in
[journal-vouchers.js](../../src/routes/accounting/journal-vouchers.js). This replaces the
6 Jul "fold everything into one Salary line" model and reproduces the legacy print 1:1.

**Department model.** Each legacy department line aggregates one or more salary-report
locations and is composed by component. Lines are ordered by component TYPE across all
departments (all Salary/Commission, then Bonus, OT, RND, then employer EPF/SOCSO/SIP,
then the `ACW_*` accrual credits) — matching the printed voucher.

| Legacy department | Salary-report loc(s) | Debit composition |
|---|---|---|
| Office | 02 | Salary = gaji+comm+cuti; **Bonus** own line (dedicated account); OT own line; RND own line |
| Salesman | 03 | jelly carved out (→ `commission_jelly` = THJ_CK); rest (gaji+cuti+bonus−jelly) **split 50/50** → `commission_mee`/`commission_bh`; OT & RND split 50/50 |
| Ikut Lori | 04 | jelly carved out (→ `commission_jelly` = THJ_SM); 50/50 like Salesman; salary-report **comm column → `others`**; OT & RND split 50/50 |
| Jaga Boiler | 06 | Salary = gaji+comm+cuti+bonus; OT; RND |
| Mesin & Sangkut Mee | 07 | Salary = gaji+comm+cuti; OT; RND |
| Packing Mee | 08 | Salary = gaji+comm+cuti; OT; RND |
| Mesin & Sangkut Bihun | **09 + 10** | Salary = gaji+comm+cuti+bonus; OT; RND |
| Packing Bihun | 11 | Salary = gaji+comm+cuti; RND |
| Tukang Sapu | 13 | Salary = gaji+comm+cuti; OT; RND |
| Maintenance | 14 | Salary = gaji+comm+cuti; OT; RND |

Rules: a department's **Salary** line = gaji + comm + cuti (+ bonus, **unless** a dedicated
`bonus` account is mapped, e.g. Office). **OT** is always its own line (account =
`overtime` mapping, else the salary account). **RND** = the department's per-employee
`digenapkan` from the salary report, its own line on the primary salary account.
**Jelly** (Ice-Polly cup) SALES pay is carved OUT of the salesman/ikut-lori 50/50 split
into its own `commission_jelly` line — Salesman → "Commission Jelly" (THJ_CK), Ikut Lori →
"Salary Salesman (Jelly)" (THJ_SM). Jelly is identified by pay-code description (an
`ICE-POLLY` **SALES** code — excludes the `MUAT` loading codes and the ME-Q mee/bihun/
ramen codes; `computeJellyByLocation()`), so newly-added Ice-Polly sales codes are picked
up automatically. **Directors** (location 01) are excluded (→ JVDR).

**Mapping types per department** (`location_account_mappings`, editable on the Account Code
Mappings page): `salary`, `epf_employer`, `socso_employer`, `sip_employer`; optional
`overtime`/`bonus` overrides; Salesman/Ikut Lori use `commission_mee` + `commission_bh` +
`commission_jelly` (+ `others` for Ikut Lori). Accruals stay at location `00`.

### Credit Accounts (Aggregate Payables)

| Account Code | Description | Calculation |
|--------------|-------------|-------------|
| **ACW_EPF** | EPF Payable | `Σ(epf_employer + epf_employee)` (staff) |
| **ACW_SC** | SOCSO Payable | `Σ(socso_employer + socso_employee)` (staff) |
| **ACW_SIP** | SIP Payable | `Σ(sip_employer + sip_employee)` (staff) |
| **ACW_PCB** | PCB Payable | `Σ pcb` (staff) |
| **ACW_SAL** | Salary Payable | **Balancing figure** = total debit − (ACW_EPF + ACW_SC + ACW_SIP + ACW_PCB) |

`ACW_SAL` is the net salary payable — computed as the balancing plug so the voucher always
ties out (this is how the legacy guarantees balance; it equals Σ net + rounding before
advance/mid-month deductions). Each department's Salary line is anchored to actual
`gross_pay` (`gaji_kasar`) — **not** the salary report's re-rounded GAJI/COMM/CUTI columns,
which can drift a few cents from real gross (Salary = gross − OT − any separate bonus/jelly/
others lines). Jun 2026: total debit **181,699.10** (= staff gross 161,984.54 + rounding
35.36 + employer statutory 19,679.20) → ACW_SAL **143,513.00** + accruals 38,186.10 =
181,699.10 — matching the legacy print to the cent (RND total 35.36, Office RND 3.99,
Mesin & Sangkut Bihun RND 6.98 = loc 09 + loc 10, Mesin & Sangkut Mee 14,608.92). (JVDR
keeps its separate "Rounding Adjustment" line to `MBDRS`; JVSL does not.)

---

## Account Code Prefix Meanings

### Expense Accounts (Debits)
- **MB** = Manufacturing/Business expense
- **DRS** = Directors Salary
- **DRE** = Directors EPF
- **DRSC** = Directors SOCSO
- **DRSIP** = Directors SIP
- **S_** = Staff Salary (by location)
- **E_** = EPF (by location)
- **SC_** = SOCSO (by location)
- **SIP_** = SIP (by location)

### Payable Accounts (Credits)
- **ACD_** = Accrual Directors
- **ACW_** = Accrual Workers/Staff
- **SAL** = Salary
- **EPF** = EPF contribution
- **SC** = SOCSO contribution
- **SIP** = SIP/EIS contribution
- **PCB** = Income Tax (Potongan Cukai Bulanan)

---

## Location Codes

| Code | Location |
|------|----------|
| 01 | Director's Remuneration |
| 02 | Office |
| 03 | Salesman |
| 04 | Ikut Lori |
| 06 | Jaga Boiler |
| 07 | Mesin & Sangkut Mee |
| 08 | Packing Mee |
| 09 | Mesin Bihun |
| 10 | Sangkut Bihun |
| 11 | Packing Bihun |
| 13 | Tukang Sapu |
| 14 | Kilang Kerja Luar |
| 16-21 | Commission locations |
| 22 | Kilang Habuk |
| 23 | Cuti Tahunan |
| 24 | Special OT |

---

## Historical Bug Notes

### Bug #1: Missing Employee Deductions in Credits (Jan 2025)
**Issue:** EPF/SOCSO/SIP payable accounts only credited the employer portions, causing journal entries to be out of balance.

**Root Cause:** Queries only retrieved `employer_amount` for EPF, SOCSO, and SIP deductions.

**Fix:** Added `employee_amount` columns to all queries and updated credit line calculations to include both portions: `amount = employer + employee`.

---

### Bug #2: Net Pay Discrepancy (Jan 2025)
**Issue:** Even after fix #1, JVSL entries were still out of balance because the stored `net_pay` in `employee_payrolls` didn't match `gross_pay - employee_deductions`.

**Root Cause:** The `net_pay` stored in the database was rounded/adjusted differently during payroll processing, causing it to not equal `gross_pay - (EPF_emp + SOCSO_emp + SIP_emp + PCB)`.

**Fix:** Changed salary payable calculation to use **calculated net pay** instead of stored `net_pay`:
```javascript
calculatedNet = grossPay - epfEmployee - socsoEmployee - sipEmployee - pcb
```

This ensures the journal entry always balances mathematically:
- Debits = Gross + EPF_employer + SOCSO_employer + SIP_employer
- Credits = (Gross - Employee_Deductions) + (EPF_emp + EPF_empr) + (SOCSO_emp + SOCSO_empr) + (SIP_emp + SIP_empr) + PCB
- Credits = Gross + EPF_empr + SOCSO_empr + SIP_empr = Debits ✓

**Affected Files:**
- `src/routes/accounting/journal-vouchers.js` - JVSL processing (lines ~1122-1137), JVDR processing (lines ~1020-1066)

---

### Bug #3: Missing Commission Records in Debits (Jan 2026)
**Issue:** JVSL/01/26 was out of balance by 73.00 (Debits 5337.72 vs Credits 5410.72).

**Root Cause:** The `commission_records` table stores bonus and commission entries that are included in `gross_pay` during payroll processing, but the voucher generation's debit side only queried `payroll_items`. This caused:
- Bonus entries (location_code IS NULL) - not debited
- Commission entries (location_code 16-24) - not debited

**Example:** MATTHEW had:
- gross_pay: 3118.42
- payroll_items sum: 3045.42 (Base 3000 + OT 45.42)
- commission_records: 73.00 (Bonus 50.00 + Commission 23.00)
- Difference: 73.00 (exactly the voucher imbalance)

**Fix:** Added two new CTEs to the voucher generation query:
1. `bonus_by_location` - Groups bonus amounts by employee's primary location (uses `bonus` mapping type)
2. `commission_by_location` - Groups commission amounts by their location_code (uses `salary` mapping type for locations 16-24)

Added corresponding debit lines:
```javascript
// For bonus (goes to employee's primary location)
{ account: locationMappings.bonus, amount: bonusAmount, desc: "Bonus - Location XX" }

// For commission_records with location codes (goes to commission location)
{ account: commissionMappings.salary, amount: commissionAmount, desc: "Commission - Location XX" }
```

**Balance Formula (Updated):**
```
DEBITS = Salary (payroll_items Base/Tambahan)
       + Overtime (payroll_items Overtime)
       + Commission Product (payroll_items linked to products)
       + Bonus (commission_records where location_code IS NULL)
       + Commission Records (commission_records where location_code IS NOT NULL)
       + EPF Employer + SOCSO Employer + SIP Employer

CREDITS = Calculated Net Pay (gross - employee deductions)
        + EPF Total (employer + employee)
        + SOCSO Total (employer + employee)
        + SIP Total (employer + employee)
        + PCB
```

**Affected Files:**
- `src/routes/accounting/journal-vouchers.js` - Added bonus_by_location and commission_by_location CTEs, added debit lines for both

---

### Bug #4: Gross Pay vs Payroll Items Mismatch (Jan 2026)
**Issue:** JVSL/12/25 was out of balance by 0.49 (Debits 54886.11 vs Credits 54885.62).

**Root Cause:** The `gross_pay` stored in `employee_payrolls` doesn't exactly match the sum of `payroll_items.amount` for some employees due to rounding during payroll generation. For example:
- JASSON_ROLL: gross_pay 243.60 vs items 243.72 (diff -0.12)
- MASRUN_S: gross_pay 403.35 vs items 403.43 (diff -0.08)
- Multiple other employees with small differences totaling -0.49

The credit side used `gross_pay` to calculate net pay, while the debit side used `payroll_items`. This caused a small imbalance.

**Fix:** Changed net pay calculation to explicitly sum payroll components (same source as debits) instead of using `gross_pay`:
```javascript
// Calculate gross pay from payroll_items (same source as debits) for audit consistency
// Gross = salary + overtime + commission_mee + commission_bh + bonus + commission_records
let totalGrossFromItems = 0;
for (const location of staffData) {
  totalGrossFromItems += parseFloat(location.salary_amount) || 0;
  totalGrossFromItems += parseFloat(location.overtime_amount) || 0;
  totalGrossFromItems += parseFloat(location.commission_mee) || 0;
  totalGrossFromItems += parseFloat(location.commission_bh) || 0;
  totalGrossFromItems += parseFloat(location.bonus_amount) || 0;
}
// Add commission_records amounts (locations 16-24)
for (const amount of Object.values(commissionByLocation)) {
  totalGrossFromItems += amount;
}

// Net Pay = Gross (from payroll items) - Employee Deductions - PCB
const calculatedTotalNet = round2(totalGrossFromItems - totalEpfEmployee - totalSocsoEmployee - totalSipEmployee - totalPcb);
```

**Why this approach is audit-compliant:**
1. **Traceable** - Gross pay is explicitly calculated from individual payroll components
2. **Consistent** - Both debit and credit sides use the same source data (payroll_items + commission_records)
3. **Transparent** - Net pay formula is clear: Gross - Employee Deductions - PCB
4. **No "plugging"** - We're not forcing balance by working backwards from totals

**Affected Files:**
- `src/routes/accounting/journal-vouchers.js` - Changed net pay calculation in JVSL credit lines

---

### Bug #5: Bonus Location Mismatch (Jan 2026)
**Issue:** JVSL/12/25 was out of balance by 100.00 (Debits 56366.11 vs Credits 56466.11).

**Root Cause:** The `bonus_by_location` CTE was grouping bonuses by `staffs.location[0]` (employee's assigned location from the staffs table), but employee payroll data was grouped by `job_location_mappings.location_code` (job-based location).

This caused a mismatch when an employee's job location differed from their staffs.location:
- BOY: bonus went to location 04 (staffs.location), but payroll was under location 03 (job mapping)
- GLEN: bonus went to location 08 (staffs.location), but payroll was under location 03 (job mapping)

Additionally, location 04 had no `bonus` account mapping, so even though BOY's 100.00 bonus was included in `totalGrossFromItems` (credits), it was filtered out from debit lines (no mapping = no debit).

| Employee | Bonus | Old Location (staffs) | New Location (job) |
|----------|-------|----------------------|-------------------|
| BOY | 100.00 | 04 (no bonus mapping) | 03 (has bonus mapping) |
| GLEN | 75.00 | 08 (no staff) | 03 (has bonus mapping) |

**Fix:** Changed `bonus_by_location` CTE to join with `staff_data` and group by job-based location instead of `staffs.location`:
```sql
-- OLD (buggy):
bonus_by_location AS (
  SELECT
    TRIM(BOTH '"' FROM (s.location::jsonb->0)::text) as location_id,
    COALESCE(SUM(cr.amount), 0) as bonus_amount
  FROM commission_records cr
  JOIN staffs s ON cr.employee_id = s.id
  ...
  GROUP BY TRIM(BOTH '"' FROM (s.location::jsonb->0)::text)
)

-- NEW (fixed):
bonus_by_location AS (
  SELECT
    sd.location_id,  -- Uses job-based location from staff_data
    COALESCE(SUM(cr.amount), 0) as bonus_amount
  FROM commission_records cr
  JOIN staff_data sd ON cr.employee_id = sd.employee_id
  ...
  GROUP BY sd.location_id
)
```

**Why this fix is correct:**
1. Bonuses now align with the same location as the employee's payroll data
2. All bonuses go to locations that have account mappings (since staff_data uses job_location_mappings)
3. Both debit and credit sides use consistent location grouping

**Affected Files:**
- `src/routes/accounting/journal-vouchers.js` - Changed `bonus_by_location` CTE to use job-based location

---

### Bug #6: Voucher gross far below payroll gross (Jul 2026) — FIXED

The JVSL captured only pattern-matched components (Base/Tambahan non-product items,
OT, MEE/BH product items at locations 03/04, commission_records). Everything else fell
through on BOTH sides: product/packing per-bag pay outside 03/04 (Jun 2026: 27,552.46
at locations 02/08/11), non-cuti-tahunan leave pay (10,851.64), Others records
(10,711.71) — so the voucher (181,699.10 in legacy) generated at ~30k less even when
balanced. **Fix:** the salary line per location is now the residual of
`employee_payrolls.gross_pay` after the classified components, and the credit-side
gross is Σ `gross_pay` directly — both sides equal full payroll gross by construction.
The out-of-balance guard also lists the exact unmapped location/component amounts.

### Shared line builders

JVDR is built by `buildJvdrLines()`. **JVSL** is built by `buildJvslFromSalaryReport()`
(consuming `computeMonthlySalaryReport()`) in
[journal-vouchers.js](../../src/routes/accounting/journal-vouchers.js). Both `/preview` and
`/generate` call the same builders, so the `/preview` response's `lines` (account_code ·
particulars · debit · credit), `total_debit`, `total_credit`, `balanced` and `unmapped`
are identical to what `/generate` posts — the Voucher Generator renders the journal 1:1.
Any future change to JVSL composition must be made in `buildJvslFromSalaryReport()` (and,
where a component's source changes, in the salary report), never duplicated.
(The old `buildJvslLines()`/`computeJvslRoundingByLocation()` are superseded.)

## Data Sources Summary

### JVSL per-location figures (from the Salary Report)
Every JVSL number comes from `computeMonthlySalaryReport().comprehensive.locations[].totals`:
`gaji`, `ot`, `bonus`, `comm`, `cuti`, `epf_majikan/pekerja`, `socso_majikan/pekerja`,
`sip_majikan/pekerja`, `pcb`, `gaji_bersih`, `digenapkan`. See the Salary Report's own
GAJI/OT/BONUS/COMM/CUTI bucketing rules for how each column is derived from
`payroll_items` / `commission_records` / `others_records` / `leave_records`.

### JVSL account mapping types by department (`location_account_mappings`, voucher `JVSL`)
| Department (loc) | salary | bonus | overtime | commission_mee | commission_bh | commission_jelly | others | epf/socso/sip_employer |
|---|---|---|---|---|---|---|---|---|
| Office (02) | MBS_O | MBS_O | MBS_O | - | - | - | - | MBE_O / MBSC_O / MBSIP_O |
| Salesman (03) | (unused) | - | - | MS_SM | BS_SM | THJ_CK | - | MBE_SM / MBSC_SM / MBSIP_SM |
| Ikut Lori (04) | (unused) | - | - | MS_IL | BS_IL | THJ_SM | MBS_ILO | MBE_IL / MBSC_IL / MBSIP_IL |
| Jaga Boiler (06) | MBS_JB | - | MBS_JB | - | - | - | MBE_JB / MBSC_JB / MBSIP_JB |
| Mesin & Sangkut Mee (07) | MS_MM | - | MS_MM | - | - | - | ME_MM / MSC_MM / MBSIP_MM |
| Packing Mee (08) | MS_PM | - | MS_PM | - | - | - | ME_PM / MSC_PM / MBSIP_PM |
| Mesin & Sangkut Bihun (09+10) | BS_MB | - | BS_MB | - | - | - | BE_MB / BSC_MB / BSIP_MB |
| Packing Bihun (11) | BS_PB | - | - | - | - | - | BE_PB / BSC_PB / BSIP_PB |
| Tukang Sapu (13) | MBS_TS | - | MBS_TS | - | - | - | MBE_TS / MBSC_TS / MBSIP_TS |
| Maintenance (14) | MBS_M | - | MBS_M | - | - | - | MBE_M / MBSC_M / MBSIP_M |
| Accruals (00) | — | — | — | — | — | — | accrual_salary/epf/socso/sip/pcb → ACW_* |
