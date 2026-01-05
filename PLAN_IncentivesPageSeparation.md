# Incentives Page Separation Plan

## Summary
Separate the current `IncentivesPage.tsx` (which combines Commission & Bonus) into two distinct pages:
1. **CommissionPage** - For commission entries with location_code (16-24)
2. **BonusPage** - For bonus entries without location_code

---

## Current State

### Single Combined Page
- **File:** `src/pages/Payroll/AddOn/IncentivesPage.tsx`
- **Route:** `/payroll/incentives`
- **Features:**
  - Shows all incentives (commission & bonus) in one table
  - Two "Add" buttons: "Add Commission" and "Add Bonus"
  - Both stored in `commission_records` table

### Data Differentiation
| Type | location_code | Description Pattern |
|------|---------------|---------------------|
| Commission | 16-24 (has value) | Contains "COMMISSION" |
| Bonus | NULL | Contains "BONUS" |

### Commission Location Codes (16-24)
- 16: COMM-SALESMAN
- 17: COMM-IKUT_LORI
- 18: COMM-KILANG (default)
- 19-24: Other commission locations

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/pages/Payroll/AddOn/IncentivesPage.tsx` | **DELETE** | Remove combined page |
| `src/pages/Payroll/AddOn/CommissionPage.tsx` | **CREATE** | Commission-only page |
| `src/pages/Payroll/AddOn/BonusPage.tsx` | **CREATE** | Bonus-only page |
| `src/components/Payroll/AddIncentiveModal.tsx` | **KEEP** | Already supports `incentiveType` prop |
| `src/components/Payroll/EditIncentiveModal.tsx` | **KEEP** | Already auto-detects type |
| `src/routes/payroll/incentives.js` | **MODIFY** | Add `type` filter parameter |
| `src/pages/TienHockNavData.tsx` | **MODIFY** | Update navigation to show 2 items |

---

## Implementation Steps

### Step 1: Update Backend API

**File:** `src/routes/payroll/incentives.js`

Add `type` query parameter to filter by commission or bonus:

```javascript
router.get("/", async (req, res) => {
  const { start_date, end_date, employee_id, type } = req.query;

  let query = `
    SELECT cr.*, s.name as employee_name, l.name as location_name
    FROM commission_records cr
    JOIN staffs s ON cr.employee_id = s.id
    LEFT JOIN locations l ON cr.location_code = l.id
    WHERE 1=1
  `;

  // Filter by type
  if (type === 'commission') {
    query += ` AND cr.location_code IS NOT NULL`;
  } else if (type === 'bonus') {
    query += ` AND cr.location_code IS NULL`;
  }
  // ... rest of filters
});
```

### Step 2: Create CommissionPage.tsx

**File:** `src/pages/Payroll/AddOn/CommissionPage.tsx`

Key differences from IncentivesPage:
- Title: "Commission Records"
- Single "Add Commission" button (no bonus button)
- Fetch with `type=commission` filter
- Shows Location column prominently
- Color theme: Sky blue

```typescript
const fetchCommissions = async () => {
  const url = `/api/incentives?type=commission&start_date=${startDate}&end_date=${endDate}`;
  // ...
};
```

### Step 3: Create BonusPage.tsx

**File:** `src/pages/Payroll/AddOn/BonusPage.tsx`

Key differences:
- Title: "Bonus Records"
- Single "Add Bonus" button (no commission button)
- Fetch with `type=bonus` filter
- No Location column (always NULL for bonus)
- Color theme: Teal green

```typescript
const fetchBonuses = async () => {
  const url = `/api/incentives?type=bonus&start_date=${startDate}&end_date=${endDate}`;
  // ...
};
```

### Step 4: Update Navigation

**File:** `src/pages/TienHockNavData.tsx`

Replace single "Incentives" item with two items:

```typescript
// Before:
payrollSubItems.push({
  name: "Incentives",
  path: "/payroll/incentives",
  component: IncentivesPage,
});

// After:
payrollSubItems.push({
  name: "Commission",
  path: "/payroll/commission",
  component: CommissionPage,
});

payrollSubItems.push({
  name: "Bonus",
  path: "/payroll/bonus",
  component: BonusPage,
});
```

### Step 5: Delete Old Page

Remove `src/pages/Payroll/AddOn/IncentivesPage.tsx` after new pages are working.

---

## UI Design

### CommissionPage Layout
```
┌─────────────────────────────────────────────────────────┐
│ Commission Records                    [Refresh] [+ Add] │
├─────────────────────────────────────────────────────────┤
│ Year: [2025 ▼]  Month: [January ▼]                      │
│                              Total: X records | RM X.XX │
├─────────────────────────────────────────────────────────┤
│ ID │ Name │ Location │ Amount │ Desc │ Date │ Actions  │
├────┼──────┼──────────┼────────┼──────┼──────┼──────────┤
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

### BonusPage Layout
```
┌─────────────────────────────────────────────────────────┐
│ Bonus Records                         [Refresh] [+ Add] │
├─────────────────────────────────────────────────────────┤
│ Year: [2025 ▼]  Month: [January ▼]                      │
│                              Total: X records | RM X.XX │
├─────────────────────────────────────────────────────────┤
│ ID │ Name │ Amount │ Description │ Date │ Actions      │
├────┼──────┼────────┼─────────────┼──────┼──────────────┤
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

**Note:** BonusPage doesn't show Location column since bonus entries always have location_code = NULL.

---

## Reusable Components

The existing modals can be reused without changes:

| Component | Usage |
|-----------|-------|
| `AddIncentiveModal` | Pass `incentiveType="Commission"` or `"Bonus"` |
| `EditIncentiveModal` | Auto-detects type from `location_code` |

---

## Validation Checklist

After implementation, verify:
- [ ] CommissionPage only shows entries with location_code (16-24)
- [ ] BonusPage only shows entries with location_code = NULL
- [ ] Adding commission requires location selection
- [ ] Adding bonus does NOT show location field
- [ ] Edit modal works correctly for both types
- [ ] Navigation shows "Commission" and "Bonus" as separate items
- [ ] Old "/payroll/incentives" route is removed or redirects
