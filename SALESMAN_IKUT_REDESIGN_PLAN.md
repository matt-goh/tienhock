# SALESMAN_IKUT (Salesman Ikut Lori) Section Redesign Plan

## Overview
Redesign the SALESMAN_IKUT entry section in DailyLogSalesmanEntryPage.tsx with improved UX and new functionality.

---

## Final UI/UX Design

### New Table Layout
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SALESMAN IKUT LORI                                                                                   │
├──────┬─────────┬─────────────────────────────────────────────┬─────────────────┬───────┬────────────┤
│ ID   │ Name    │ Ikut Salesman                               │ Muat (Bags)     │ x2    │ Actions    │
│      │         │                                             │ Mee   │  Bihun  │       │            │
├──────┼─────────┼─────────────────────────────────────────────┼─────────────────┼───────┼────────────┤
│ EMP1 │ John    │ [Ah Cheong] [Ah Wai] [Ah Kiat]  [✕]        │ [50 ] │ [60  ]  │ [✓]   │ [...]      │
│ EMP2 │ Lim     │ [Ah Cheong] [Ah Wai] [Ah Kiat]  [✕]        │ [0  ] │ [0   ]  │ [ ]   │ [...]      │
│ EMP3 │ Tan     │ [Ah Cheong] [Ah Wai] [Ah Kiat]  [✕]        │ [ - ] │ [ -  ]  │ [ ]   │ [...]      │
└──────┴─────────┴─────────────────────────────────────────────┴─────────────────┴───────┴────────────┘

Visual States:
- Selected salesman button: bg-sky-500 text-white (highlighted)
- Unselected salesman buttons: bg-gray-100 dark:bg-gray-700 (muted)
- [✕] Clear button: Small icon button to deselect (appears when a salesman is selected)
- x2 checked row: Muat inputs have amber/orange background, values shown are DOUBLED
- No salesman selected: Muat inputs disabled, show "-"
```

### Key Design Decisions (Based on User Feedback)

1. **Selection via Salesman Buttons** (not checkboxes)
   - No selection checkbox column
   - Click a salesman button to select (employee becomes "selected")
   - Small [✕] clear button to deselect (row becomes inactive)
   - Only shows salesmen who are checked for work that day

2. **x2 Checkbox - Show Doubled Values**
   - Inputs display actual doubled amounts (e.g., 25 becomes 50)
   - Amber/orange background on inputs when x2 active
   - x2 state saved to database (`is_doubled` column)

3. **Product Quantities - Copy from Salesman**
   - SALESMAN_IKUT automatically gets the same product quantities as followed salesman
   - Products mapped to DME-*/DWE-* paycodes

4. **Muat Mee/Bihun Mapping (Hardcoded)**
   - Muat Mee (Bag) → `4-COMM_MUAT_MEE` (rate: RM 0.02/bag)
   - Muat Bihun (Bag) → `5-COMM_MUAT_BH` (rate: RM 0.03/bag)

---

## Implementation Tasks

### Task 1: Database Migration - Add is_doubled Column

```sql
-- Add is_doubled column to daily_work_log_entries
ALTER TABLE daily_work_log_entries
ADD COLUMN IF NOT EXISTS is_doubled BOOLEAN DEFAULT FALSE;
```

### Task 2: Database Migration - Product-to-Paycode Mappings

```sql
-- Product to SALESMAN_IKUT paycode mappings
-- ME-Q products (1-* prefix) → DME-* paycodes
-- WE-QQ products (WE-* prefix) → DWE-* paycodes

INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
-- ME-Q Mee products
('1-2UDG', 'DME-2UDG'),      -- Mi Kuning 2UDG → DME-2UDG
('1-3UDG', 'DME-3UDG'),      -- Mi Kuning 3UDG → DME-3UDG
('1-350G', 'DME-350G'),      -- ME-Q MI 350G → DME-350G
('1-MNL', 'DME-MNL'),        -- Mi No Label → DME-MNL

-- ME-Q Bihun products (2-* prefix for bihun)
('2-APPLE', 'DME-300G'),     -- Mihun Apple 300G → DME-300G
('2-BH', 'DME-300G'),        -- Mihun 3UDG 300G → DME-300G
('2-BH2', 'DME-2H'),         -- Mihun 2UDG 300G → DME-2H
('2-BCM3', 'DME-600G'),      -- Bihun 600G → DME-600G
('2-BNL', 'DME-3.1KG'),      -- Mihun NL 3kg → DME-3.1KG
('2-BNL(5)', 'DME-5KG'),     -- Mihun NL 5kg → DME-5KG
('2-MASAK', 'DME-300G'),     -- Mihun MASAK 300G → DME-300G
('2-PADI', 'DME-300G'),      -- Mihun PADI 300G → DME-300G

-- WE-QQ products → DWE-* paycodes
('WE-2UDG', 'DWE-2UDG'),     -- WE-QQ 2UDG → DWE-2UDG
('WE-3UDG', 'DWE-3UDG'),     -- WE-QQ 3UDG → DWE-3UDG
('WE-300G', 'DWE-300G'),     -- WE-QQ Bihun 300G → DWE-300G
('WE-360', 'DWE-350G'),      -- WE-QQ 360G → DWE-350G
('WE-360(5PK)', 'DWE-350G'), -- WE-QQ 360G 5pk → DWE-350G
('WE-420', 'DWE-420G'),      -- WE-QQ 420G → DWE-420G
('WE-600G', 'DWE-600G'),     -- WE-QQ Bihun 600G → DWE-600G
('WE-MNL', 'DWE-MNL')        -- WE-QQ MNL → DWE-MNL
ON CONFLICT DO NOTHING;
```

### Task 3: UI Redesign - SALESMAN_IKUT Table
**File:** `src/pages/Payroll/DailyLog/DailyLogSalesmanEntryPage.tsx` (lines 3093-3482)

1. **Remove columns:**
   - Selection checkbox column
   - Job column (make it a header label instead)

2. **New table header:**
   - ID | Name | Ikut Salesman | Muat (Bags) [Mee | Bihun] | x2 | Actions

3. **Replace Listbox with Toggle Buttons:**
   - Show all selected salesmen as inline buttons
   - Clicking a button selects that salesman
   - Add [✕] clear button when a salesman is selected

4. **Combine Muat inputs in one cell:**
   - Two side-by-side inputs for Mee and Bihun
   - Apply amber background when x2 is active

5. **Add x2 checkbox column:**
   - Checkbox with amber color when checked
   - Disabled when no salesman selected

### Task 4: Add x2 State Management
**File:** `src/pages/Payroll/DailyLog/DailyLogSalesmanEntryPage.tsx`

1. Add new state: `const [ikutDoubled, setIkutDoubled] = useState<Record<string, boolean>>({});`
2. Add handler: `handleDoubleToggle(rowKey: string)`
3. Modify display values to show doubled amounts when x2 is checked
4. Modify input handlers to store base values (divide by 2 if x2 active)

### Task 5: Map Muat Inputs to Paycodes (Hardcoded)
**File:** `src/pages/Payroll/DailyLog/DailyLogSalesmanEntryPage.tsx`

```typescript
const MUAT_MEE_PAYCODE = '4-COMM_MUAT_MEE';
const MUAT_BIHUN_PAYCODE = '5-COMM_MUAT_BH';
```

- When ikutBagCounts changes, update activities with payCodeId matching these constants
- Apply x2 multiplier if `ikutDoubled[rowKey]` is true
- Auto-select these paycodes when quantities > 0

### Task 6: Copy Product Quantities from Salesman
**File:** `src/pages/Payroll/DailyLog/DailyLogSalesmanEntryPage.tsx`

- When SALESMAN_IKUT follows a salesman, fetch that salesman's product quantities
- Map products to DME-*/DWE-* paycodes using product_pay_codes table
- Apply x2 multiplier if active

### Task 7: Save/Restore x2 State
**Files:**
- `src/pages/Payroll/DailyLog/DailyLogSalesmanEntryPage.tsx`
- `src/routes/payroll/daily-work-logs.js`

1. Save `is_doubled` in payload when submitting work log
2. Restore `is_doubled` when editing existing work log
3. Backend route update to save/retrieve is_doubled field

### Task 8: Update Initial State for Unsaved Changes Detection
**File:** `src/pages/Payroll/DailyLog/DailyLogSalesmanEntryPage.tsx`

Add `ikutDoubled` to:
- Initial state capture
- `hasUnsavedChanges` comparison
- Reset after save

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Payroll/DailyLog/DailyLogSalesmanEntryPage.tsx` | Main UI redesign, state management, activity linking |
| `src/routes/payroll/daily-work-logs.js` | Save/restore is_doubled field |
| Database | Add `is_doubled` column, insert product_pay_codes mappings |
| `CLAUDE.md` | Update schema documentation |

---

## Notes

- **4-COMM_MUAT_MEE** and **5-COMM_MUAT_BH** are hardcoded mappings
- The x2 feature stores BASE values in state, displays DOUBLED values to user
- Selection is determined by which salesman is followed (no checkbox needed)
- When no salesman selected, row is inactive (inputs disabled, grayed out)
- Only shows salesmen who are selected for work that day in the toggle buttons
