# Account Code Mapping Enhancement Plan

## Summary
Enhance the journal voucher system and `LocationAccountMappingsPage.tsx` to handle:
1. **MEE vs BH commission split** for Salesman (Loc 03) and Ikut Lori (Loc 04)
2. **Individual director salary breakdown** for JVDR (GTH, WSF, WG)
3. **Jelly company accounts** (THJ_CK, THJ_SM)

---

## Current State Analysis

### Identified Gaps (Account Codes Without Accurate Data)

| # | Account Code | Expected Behavior | Current State | Issue |
|---|--------------|------------------|---------------|-------|
| 1 | **MS_SM** | Salesman Commission from MEE products | Maps to all commission for Loc 03 | No MEE/BH split |
| 2 | **BS_SM** | Salesman Commission from BH products | Not mapped | Missing entirely |
| 3 | **MS_IL** | Ikut Lori Commission from MEE products | Maps to all commission for Loc 04 | No MEE/BH split |
| 4 | **BS_IL** | Ikut Lori Commission from BH products | Not mapped | Missing entirely |
| 5 | **ACD_SAL** (JVDR) | Individual director salary accruals (GTH, WSF, WG) | Single entry for all directors | No per-director breakdown |
| 6 | **THJ_CK** | Commission Jelly | Not mapped | Need mapping for Jelly |
| 7 | **THJ_SM** | Tien Hock (Jelly) Salary Salesman | Not mapped | Need mapping for Jelly |

### Root Cause
1. **Commission type** - The mapping uses generic `commission` without MEE/BH distinction
2. **Director identity** - JVDR doesn't split by individual director (GOH, WONG, WINNIE)
3. **Data source** - MEE/BH split exists in payroll_items via pay_code_id patterns but isn't used for journal vouchers

---

## Data Sources (CRITICAL)

Understanding where each component comes from:

| Component | Data Source | Table | Filter/Query |
|-----------|-------------|-------|--------------|
| **Salary** | Payroll items | `payroll_items` | pay_type = 'Base' or 'Tambahan' |
| **Overtime** | Payroll items | `payroll_items` | pay_type = 'Overtime' |
| **MEE Commission** | Payroll items | `payroll_items` | pay_code_id LIKE '1-%' (for Salesman/Ikut Lori) |
| **BH Commission** | Payroll items | `payroll_items` | pay_code_id LIKE '2-%' (for Salesman/Ikut Lori) |
| **BONUS** | **Incentives page** | `commission_records` | description LIKE '%BONUS%', location_code IS NULL |
| **Location Commission** | Incentives page | `commission_records` | description LIKE '%COMMISSION%', has location_code (16-24) |
| **EPF/SOCSO/SIP/PCB** | Payroll deductions | `payroll_deductions` | by deduction_type |
| **Cuti Tahunan** | Leave records | `leave_records` | leave_type = 'cuti_tahunan', status = 'approved' |

**Note:** The salary report (`src/routes/payroll/salary-report.js`) already groups:
- `bonus_total`: `SUM WHERE UPPER(description) LIKE '%BONUS%'` from commission_records
- `commission_total`: `SUM WHERE UPPER(description) LIKE '%COMMISSION%'` from commission_records

---

## Proposed Solution

### Part 1: MEE vs BH Commission Split

**Discovery:** MEE/BH split data already exists in `payroll_items` table via pay_code_id patterns:
- **MEE products**: Pay codes starting with `1-*` (e.g., `1-2UDG`, `1-3UDG`, `1-MNL`)
- **BH products**: Pay codes starting with `2-*` (e.g., `2-BCM3`, `2-BH`, `2-BNL`)

**Approach:** Query payroll_items for Salesman/Ikut Lori employees and aggregate by pay_code pattern:

```sql
-- Get MEE vs BH breakdown for salesman payroll
SELECT
  ep.employee_id,
  SUM(CASE WHEN pi.pay_code_id LIKE '1-%' THEN pi.amount ELSE 0 END) as mee_amount,
  SUM(CASE WHEN pi.pay_code_id LIKE '2-%' THEN pi.amount ELSE 0 END) as bh_amount
FROM payroll_items pi
JOIN employee_payrolls ep ON pi.employee_payroll_id = ep.id
JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
WHERE mp.year = $1 AND mp.month = $2
  AND ep.job_type IN ('SALESMAN', 'IKUT_LORI')
GROUP BY ep.employee_id
```

### Part 2: BONUS Handling for JVSL

**Data Source:** BONUS comes from `commission_records` table, NOT from pay_codes.

**Query for BONUS data:**
```sql
SELECT
  employee_id,
  COALESCE(SUM(amount), 0) as bonus_amount
FROM commission_records
WHERE EXTRACT(YEAR FROM commission_date) = $1
  AND EXTRACT(MONTH FROM commission_date) = $2
  AND UPPER(description) LIKE '%BONUS%'
GROUP BY employee_id
```

**Account Code Assignment:** Use location_account_mappings with `mapping_type = 'bonus'`:
- MBS_O: Office employees bonus
- MS_SM: Salesman bonus (MEE portion - if split needed)
- BS_SM: Salesman bonus (BH portion - if split needed)

**Note:** The incentives page already stores BONUS in commission_records. The frontend (PayrollDetailsPage) fetches this via `/api/incentives` and shows it in the payroll details.

---

### Part 3: Director Identification for JVDR

**Discovery:** Directors are identified by staff IDs:
- **GOH** (GOH THAI HO) - staff_id: 'GOH'
- **WONG** (WONG SHUK FUN) - staff_id: 'WONG'
- **WINNIE** (WINNIE GOH CHING TING) - staff_id: 'WINNIE'

Currently they have `job_type = 'OFFICE'` which maps to Location 02. For JVDR:
1. Filter these 3 directors from regular OFFICE payroll
2. Generate JVDR entries with individual salary credit lines
3. JVSL (Location 02 OFFICE) should exclude these 3 directors

### New Mapping Types

| New Type | Description | Account Code |
|----------|-------------|--------------|
| `commission_mee` | Commission from MEE products | MS_SM (Loc 03), MS_IL (Loc 04) |
| `commission_bh` | Commission from BH products | BS_SM (Loc 03), BS_IL (Loc 04) |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Accounting/LocationAccountMappingsPage.tsx` | Add new mapping types (`commission_mee`, `commission_bh`), update JVSL_ACCOUNT_CODES |
| `src/routes/accounting/journal-vouchers.js` | Major rewrite: MEE/BH split logic, director individual breakdown |

---

## Implementation Steps

### Step 1: Update LocationAccountMappingsPage.tsx

**1.1 Add new mapping type labels:**
```typescript
const getMappingTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    // ... existing labels
    commission: "Comm",
    commission_mee: "Comm-MEE",  // NEW
    commission_bh: "Comm-BH",    // NEW
  };
  return labels[type] || type;
};
```

**1.2 Update JVSL_ACCOUNT_CODES for commission entries:**
```typescript
// Replace single commission entry with MEE/BH split:
{
  code: "MS_SM",
  description: "Salesman-Commission Mee",
  category: "salary",
  mappingTypes: ["commission_mee"],  // Changed from ["commission"]
},
{
  code: "BS_SM",
  description: "Salesman-Commission Bihun",
  category: "salary",
  mappingTypes: ["commission_bh"],  // NEW entry
},
// Same for Ikut Lori:
{
  code: "MS_IL",
  description: "Ikut Lori-Commission Mee",
  category: "salary",
  mappingTypes: ["commission_mee"],
},
{
  code: "BS_IL",
  description: "Ikut Lori-Commission Bihun",
  category: "salary",
  mappingTypes: ["commission_bh"],
},
```

### Step 2: Update Backend journal-vouchers.js

**2.1 Add director constants:**
```javascript
const DIRECTOR_IDS = ['GOH', 'WONG', 'WINNIE'];
const DIRECTOR_MAP = {
  'GOH': { code: 'GTH', display: 'GOH', type: 'DIRECTOR' },
  'WONG': { code: 'WSF', display: 'WONG', type: 'DIRECTOR' },
  'WINNIE': { code: 'WG', display: 'WINNIE.G', type: 'EX.DIRECTOR' }
};
```

**2.2 Modify JVSL query to get MEE/BH split from payroll_items:**
```sql
-- For Salesman (Location 03) and Ikut Lori (Location 04):
salesman_product_split AS (
  SELECT
    jlm.location_code,
    SUM(CASE WHEN pi.pay_code_id LIKE '1-%' THEN pi.amount ELSE 0 END) as mee_amount,
    SUM(CASE WHEN pi.pay_code_id LIKE '2-%' THEN pi.amount ELSE 0 END) as bh_amount
  FROM payroll_items pi
  JOIN employee_payrolls ep ON pi.employee_payroll_id = ep.id
  JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
  JOIN job_location_mappings jlm ON ep.job_type = jlm.job_id
  WHERE mp.year = $1 AND mp.month = $2
    AND jlm.location_code IN ('03', '04')
  GROUP BY jlm.location_code
)
```

**2.3 Add BONUS query from commission_records (NOT from pay_codes):**
```sql
-- BONUS data comes from incentives page, stored in commission_records
bonus_data AS (
  SELECT
    cr.employee_id,
    jlm.location_code,
    COALESCE(SUM(cr.amount), 0) as bonus_amount
  FROM commission_records cr
  JOIN employee_payrolls ep ON cr.employee_id = ep.employee_id
  JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
  JOIN job_location_mappings jlm ON ep.job_type = jlm.job_id
  WHERE mp.year = $1 AND mp.month = $2
    AND EXTRACT(YEAR FROM cr.commission_date) = $1
    AND EXTRACT(MONTH FROM cr.commission_date) = $2
    AND UPPER(cr.description) LIKE '%BONUS%'
  GROUP BY cr.employee_id, jlm.location_code
)
```

**2.4 Modify JVDR query to get individual director data:**
```sql
-- Fetch directors separately from OFFICE
director_data AS (
  SELECT
    ep.employee_id,
    s.name as employee_name,
    ep.gross_pay,
    ep.net_pay,
    pd.deduction_type,
    pd.employee_amount,
    pd.employer_amount
  FROM employee_payrolls ep
  JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
  JOIN staffs s ON ep.employee_id = s.id
  LEFT JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
  WHERE mp.year = $1 AND mp.month = $2
    AND ep.employee_id IN ('GOH', 'WONG', 'WINNIE')
)
```

**2.5 Exclude directors from JVSL Location 02 (Office):**
```sql
-- In the JVSL query, exclude director IDs
WHERE ep.employee_id NOT IN ('GOH', 'WONG', 'WINNIE')
```

### Step 3: Update Database Mappings

**Run SQL to add new commission mappings:**
```sql
-- Update existing commission mapping to commission_mee for Salesman
UPDATE location_account_mappings
SET mapping_type = 'commission_mee'
WHERE location_id = '03' AND mapping_type = 'commission' AND voucher_type = 'JVSL';

-- Add BH commission mapping for Salesman
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES ('03', 'SALESMAN', 'commission_bh', 'BS_SM', 'JVSL', true);

-- Update existing commission mapping to commission_mee for Ikut Lori
UPDATE location_account_mappings
SET mapping_type = 'commission_mee'
WHERE location_id = '04' AND mapping_type = 'commission' AND voucher_type = 'JVSL';

-- Add BH commission mapping for Ikut Lori
INSERT INTO location_account_mappings (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES ('04', 'IKUT LORI', 'commission_bh', 'BS_IL', 'JVSL', true);
```

---

## JVDR Output Format (Individual Directors)

**Credit Lines Generated:**
| Line | Account | Description | Amount |
|------|---------|-------------|--------|
| 1 | ACD_SAL | SALARY DIRECTOR (GTH), ,MMM-YYYY | GOH's net salary |
| 2 | ACD_SAL | SALARY DIRECTOR (WSF), ,MMM-YYYY | WONG's net salary |
| 3 | ACD_SAL | SALARY EX.DIRECTOR (WG), ,MMM-YYYY | WINNIE's net salary |

---

## JVSL Commission Output Format

**For Location 03 (Salesman):**
| Line | Account | Description | Amount |
|------|---------|-------------|--------|
| 1 | MS_SM | SALESMAN-COMMISSION MEE, ,MMM-YYYY | MEE product commission |
| 2 | BS_SM | SALESMAN-COMMISSION BIHUN, ,MMM-YYYY | BH product commission |

**For Location 04 (Ikut Lori):**
| Line | Account | Description | Amount |
|------|---------|-------------|--------|
| 1 | MS_IL | IKUT LORI-COMMISSION MEE, ,MMM-YYYY | MEE product commission |
| 2 | BS_IL | IKUT LORI-COMMISSION BIHUN, ,MMM-YYYY | BH product commission |

---

## Jelly Company Accounts

Keep THJ_CK and THJ_SM in the expected account codes list. Add mappings when data is available:

| Account | Description | Location | Notes |
|---------|-------------|----------|-------|
| THJ_CK | Commission Jelly | TBD | Need to identify Jelly commission location |
| THJ_SM | Tien Hock (Jelly) Salary Salesman | TBD | Need to identify Jelly salesman location |

---

## Validation Checklist

After implementation, verify:
- [ ] MS_SM only receives MEE product commission amounts (pay_code LIKE '1-%')
- [ ] BS_SM only receives BH product commission amounts (pay_code LIKE '2-%')
- [ ] MS_IL only receives MEE product commission amounts
- [ ] BS_IL only receives BH product commission amounts
- [ ] JVDR shows 3 individual director salary credit lines (GTH, WSF, WG)
- [ ] JVSL Location 02 (Office) excludes directors GOH, WONG, WINNIE
- [ ] BONUS amounts match data in incentives page (commission_records table)
- [ ] BONUS is NOT sourced from pay_codes
- [ ] Journal voucher total debits = total credits
