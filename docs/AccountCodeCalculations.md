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

---

## JVSL - Staff Salary Voucher

### Debit Accounts (Expenses by Location)

| Account Code Pattern | Description | Calculation | Source |
|---------------------|-------------|-------------|--------|
| **MBS_**** | Salary by location | Base + Tambahan pay (non-product) | `payroll_items` where `pay_type IN ('Base', 'Tambahan')` |
| **MBS_**** (overtime) | Overtime by location | Overtime pay | `payroll_items` where `pay_type = 'Overtime'` |
| **MBS_**** (bonus) | Bonus by location | Bonus amounts | `commission_records` where `location_code IS NULL` |
| **MBS_**** (commission) | Commission by location | Commission amounts (16-24) | `commission_records` where `location_code IS NOT NULL` |
| **MBS_**** (product) | Commission MEE/BH | Product-linked commissions | `payroll_items` linked to `product_pay_codes` |
| **MBE_**** | EPF Employer by location | Employer EPF | `payroll_deductions` where `deduction_type = 'epf'` |
| **MBSC_**** | SOCSO Employer by location | Employer SOCSO | `payroll_deductions` where `deduction_type = 'socso'` |
| **MBSIP_**** | SIP Employer by location | Employer SIP | `payroll_deductions` where `deduction_type = 'sip'` |

**Note:** Product-linked commissions (MEE/BH) go to `commission_mee` and `commission_bh` mapping types for locations 03 and 04.

### Credit Accounts (Aggregate Payables)

| Account Code | Description | Calculation | Notes |
|--------------|-------------|-------------|-------|
| **ACW_SAL** | Salary Payable | Total net pay | Sum of all staff net pay |
| **ACW_EPF** | EPF Payable | `totalEpf + totalEpfEmployee` | Total EPF (both portions) |
| **ACW_SC** | SOCSO Payable | `totalSocso + totalSocsoEmployee` | Total SOCSO (both portions) |
| **ACW_SIP** | SIP Payable | `totalSip + totalSipEmployee` | Total SIP (both portions) |
| **ACW_PCB** | PCB Payable | `totalPcb` | Total employee tax withheld |

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

## Data Sources Summary

### Sources of Gross Pay Components
| Component | Source Table | Condition |
|-----------|--------------|-----------|
| Base Salary | `payroll_items` | `pay_type IN ('Base', 'Tambahan')` AND not product-linked |
| Overtime | `payroll_items` | `pay_type = 'Overtime'` |
| Product Commission | `payroll_items` | Linked to `product_pay_codes` |
| Bonus | `commission_records` | `location_code IS NULL` |
| Commission | `commission_records` | `location_code IS NOT NULL` |

### Account Mapping Types by Location
| Location | salary | overtime | bonus | commission_mee | commission_bh |
|----------|--------|----------|-------|----------------|---------------|
| 02 (Office) | MBS_O | MBS_O | MBS_O | - | - |
| 03 (Salesman) | MBS_SMO | MBS_SMO | MS_SM | (product) | (product) |
| 04 (Ikut Lori) | MBS_ILO | MBS_ILO | - | (product) | (product) |
| 16-24 (Commission) | MBS_M | - | - | - | - |
