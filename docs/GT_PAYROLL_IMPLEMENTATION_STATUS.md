# Green Target Payroll Implementation Status

**Last Updated**: 2026-01-11
**Status**: ON HOLD - Pending Verification & Fixes

---

## Overview

Implementation of a comprehensive payroll system for Green Target with configurable rules for PLACEMENT, PICKUP, and manual add-on paycodes, integrated with rental and invoice data.

---

## What Has Been Implemented

### 1. Database Schema ✅
- **Migration File**: `migrations/003_greentarget_payroll_enhancement.sql`
  - `greentarget.pickup_destinations` - Configurable pickup locations (TH, MD, MENGGATAL)
  - `greentarget.payroll_rules` - Configurable PLACEMENT and PICKUP rules
  - `greentarget.rental_addons` - Manual paycodes attached to rentals
  - `greentarget.addon_paycodes` - Configuration for available add-on paycodes
  - `greentarget.payroll_settings` - Global payroll settings
  - Added `pickup_destination` column to `greentarget.rentals`
  - Enhanced `greentarget.payroll_items` with rental tracking fields

### 2. Backend API Routes ✅
- **`src/routes/greentarget/pickup-destinations.js`** - CRUD for pickup destinations
- **`src/routes/greentarget/payroll-rules.js`** - CRUD for payroll rules and addon paycodes
- **`src/routes/greentarget/rental-addons.js`** - CRUD for rental add-ons
- **Updated `src/routes/greentarget/rentals.js`** - Added pickup_destination field handling
- **Updated `src/routes/greentarget/driver-trips.js`** - Rule-based auto-calculation (needs verification)
- **Updated `src/routes/greentarget/monthly-payrolls.js`** - Apply rules during DRIVER processing (needs verification)

### 3. Frontend Components ✅
- **`src/pages/GreenTarget/Payroll/PayrollRulesPage.tsx`** - Admin UI for managing:
  - Pickup destinations
  - Payroll rules (PLACEMENT & PICKUP)
  - Add-on paycodes configuration
  - Global payroll settings
- **`src/components/GreenTarget/RentalAddonModal.tsx`** - Modal for adding manual paycodes to rentals
- **Updated `src/pages/GreenTarget/Rentals/RentalFormPage.tsx`** - Pickup destination dropdown and add-on section
- **Updated `src/pages/GreenTarget/Rentals/RentalListPage.tsx`** - Display pickup destination and add-on indicators

### 4. Recent Bug Fixes ✅
- **Route Ordering Fix**: Moved `/pay-codes` route before `/:id` route in payroll-rules.js to prevent 500 errors
- **Removed Duplicate Route**: Deleted duplicate `/pay-codes` route definition
- **TypeError Fix**: Fixed `addon.default_amount.toFixed()` error by wrapping with `Number()` conversion
- **Invoice Display**: Changed to show actual invoice_number instead of invoice_id in RentalListPage
- **Layout Optimization**: Moved destination and invoice badges to left side of bottom row in RentalCard

---

## What Needs Verification & Fixing

### HIGH PRIORITY

#### 1. Verify All Payroll Rules Configuration ⚠️
**Location**: Database & `PayrollRulesPage.tsx`

**Tasks**:
- [ ] Verify PLACEMENT rules are correct:
  - TRIP5 for invoice amount <= RM180
  - TRIP10 for invoice amount > RM180
- [ ] Verify PICKUP rules are correct:
  - TH: TRIP20 (<=RM200) vs TRIP25 (>RM200)
  - MD: TRIP30 (any amount)
  - MENGGATAL: TRIP20 (any amount)
- [ ] Confirm all pay code IDs exist in `pay_codes` table
- [ ] Verify pay code amounts (rate_biasa) match requirements:
  - TRIP5 = RM5
  - TRIP10 = RM10
  - TRIP20 = RM20
  - TRIP25 = RM25
  - TRIP30 = RM30

**Check Database**:
```sql
-- Check existing payroll rules
SELECT * FROM greentarget.payroll_rules ORDER BY rule_type, priority;

-- Check pay codes
SELECT id, description, rate_biasa, pay_type
FROM pay_codes
WHERE id LIKE 'TRIP%' OR id LIKE 'GT_%' OR id = 'HTRB';
```

#### 2. Verify Add-On Paycodes Configuration ⚠️
**Location**: Database & `PayrollRulesPage.tsx` (Add-ons tab)

**Tasks**:
- [ ] Verify all add-on paycodes are configured correctly:
  - HTRB - Hantar Barang
  - GT_1BERAS - 1 Beras (1 Tong)
  - GT_2BERAS - 2 Beras (2 Tong)
  - GT_TH_MINYAK - TH Minyak
  - GT_MGGT_MINYAK - Menggatal Minyak
  - GT_TLAIN - Muatan/Sisa Lain
- [ ] Verify default amounts match requirements
- [ ] Verify which paycodes should be "variable amount" vs "fixed"
- [ ] Check sort order for logical display

**Check Database**:
```sql
-- Check addon paycodes configuration
SELECT ap.*, pc.description, pc.rate_biasa
FROM greentarget.addon_paycodes ap
JOIN pay_codes pc ON ap.pay_code_id = pc.id
ORDER BY ap.sort_order;
```

#### 3. Fix Listbox Fields in PayrollRulesPage.tsx ⚠️
**Location**: `src/pages/GreenTarget/Payroll/PayrollRulesPage.tsx`

**Issues**:
- Listbox components may not be rendering correctly
- Need to verify dropdown functionality for:
  - Pay code selection in rule forms
  - Condition field selection
  - Operator selection
  - Add-on paycode selection

**Check Lines**:
- Rule modal form (lines ~1100-1300)
- Addon modal form (lines ~1400-1600)
- Look for `<Listbox>` components

#### 4. Verify Amount Conditions Logic ⚠️
**Location**: `src/routes/greentarget/payroll-rules.js`

**Tasks**:
- [ ] Review `evaluateCondition()` function (bottom of file)
- [ ] Verify operators work correctly: `<=`, `>`, `=`, `<`, `>=`, `ANY`
- [ ] Test with sample invoice amounts
- [ ] Ensure secondary conditions work for complex rules (e.g., TH destination + amount threshold)

---

### MEDIUM PRIORITY

#### 5. Test Rental Creation Flow
**Location**: `src/pages/GreenTarget/Rentals/RentalFormPage.tsx`

**Tasks**:
- [ ] Test creating rental with pickup destination
- [ ] Verify pickup destination dropdown only shows when date_picked is set
- [ ] Test adding manual add-ons to rental
- [ ] Verify add-ons save correctly
- [ ] Check that add-on amounts can be overridden if needed

#### 6. Test Driver Trip Auto-Calculation
**Location**: `src/routes/greentarget/driver-trips.js`

**Tasks**:
- [ ] Test auto-calculation of driver trips for a month
- [ ] Verify PLACEMENT rules apply correctly based on invoice amounts
- [ ] Verify PICKUP rules apply correctly based on destination
- [ ] Check handling of rentals without invoices (should use default RM200)
- [ ] Verify rental add-ons are included in calculation

#### 7. Test Payroll Processing
**Location**: `src/routes/greentarget/monthly-payrolls.js`

**Tasks**:
- [ ] Process a test payroll for DRIVER job type
- [ ] Verify payroll_items are created correctly
- [ ] Check that placement, pickup, and add-on codes all appear
- [ ] Verify amounts are calculated correctly
- [ ] Check `has_invoice` flag is set correctly

---

## Known Issues

### 1. Pickup Destination Options
**Current**: TH, MD, MENGGATAL
**Question**: User mentioned "KILANG" in plan but current implementation has "TH". Need to clarify:
- Is TH = Tien Hock correct?
- Should KILANG be added as an option?
- Are the current destinations complete?

### 2. Default Invoice Amount
**Current**: RM200 (hardcoded in driver-trips.js)
**Question**: Should this be configurable in `greentarget.payroll_settings`?

### 3. Rental Add-ons UI
**Status**: Component created but needs testing
- Verify modal opens correctly from RentalFormPage
- Check that add-ons display in RentalListPage
- Test edit/delete functionality

---

## Files Modified (Reference)

### Backend
- ✅ `migrations/003_greentarget_payroll_enhancement.sql` (NEW)
- ✅ `src/routes/greentarget/pickup-destinations.js` (NEW)
- ✅ `src/routes/greentarget/payroll-rules.js` (NEW)
- ✅ `src/routes/greentarget/rental-addons.js` (NEW)
- ✅ `src/routes/greentarget/rentals.js` (MODIFIED)
- ⚠️ `src/routes/greentarget/driver-trips.js` (MODIFIED - needs verification)
- ⚠️ `src/routes/greentarget/monthly-payrolls.js` (MODIFIED - needs verification)
- ✅ `src/routes/greentarget/api.ts` (MODIFIED - added new endpoints)
- ✅ `src/routes/index.js` (MODIFIED - registered new routes)

### Frontend
- ✅ `src/pages/GreenTarget/Payroll/PayrollRulesPage.tsx` (NEW - needs listbox fixes)
- ✅ `src/components/GreenTarget/RentalAddonModal.tsx` (NEW - needs testing)
- ✅ `src/pages/GreenTarget/Rentals/RentalFormPage.tsx` (MODIFIED)
- ✅ `src/pages/GreenTarget/Rentals/RentalListPage.tsx` (MODIFIED)
- ✅ `src/pages/GreenTargetNavData.tsx` (MODIFIED - added Payroll Settings menu)
- ✅ `src/types/types.ts` (MODIFIED - added new types)

---

## Next Steps (Recommended Order)

1. **Verify Database State**
   - Check if migration was run
   - Verify all tables exist
   - Check seed data for rules and destinations

2. **Fix Listbox Fields**
   - Review PayrollRulesPage.tsx listbox components
   - Fix any rendering or selection issues
   - Test all dropdowns work correctly

3. **Verify Payroll Rules**
   - Review database records for PLACEMENT and PICKUP rules
   - Confirm amounts and conditions match requirements
   - Test rule evaluation logic

4. **Verify Add-On Paycodes**
   - Check addon_paycodes table configuration
   - Verify amounts and variable/fixed settings
   - Test add-on UI in RentalFormPage

5. **End-to-End Testing**
   - Create test rentals with various scenarios
   - Run driver trip auto-calculation
   - Process a test payroll
   - Verify all amounts and codes are correct

---

## Questions for User

1. **Pickup Destinations**: Are TH, MD, MENGGATAL the correct options? Should KILANG be added?
2. **Default Invoice Amount**: Should RM200 be configurable or remain hardcoded?
3. **Add-On Paycodes**: Which add-ons should be "variable amount" vs "fixed amount"?
4. **Payroll Rule Amounts**: Confirm all threshold amounts (RM180, RM200) are correct
5. **Pay Code Rates**: Confirm all TRIP amounts are correct (TRIP5=RM5, TRIP10=RM10, etc.)

---

## Technical Notes

### Rule Evaluation Priority
- Rules are evaluated by `priority` field (lower number = higher priority)
- For PICKUP rules with multiple conditions, both primary and secondary must match
- If no rule matches, no paycode is added (intentional)

### Invoice Amount Lookup
- System queries `greentarget.invoice_rentals` to get invoice_id
- Then queries `invoices` table to get `total_excluding_tax`
- If no invoice found, uses default RM200

### Add-On Behavior
- Can be added at rental level (in RentalFormPage)
- Can also be added during payroll processing (manually)
- Rental add-ons automatically flow into payroll_items during processing

### Database Types
- PostgreSQL DECIMAL fields return as strings in Node.js
- Frontend must use `Number()` conversion before calling `.toFixed()`
- Backend doesn't need conversion (pg-promise handles it)

---

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] PayrollRulesPage loads without errors
- [ ] All listbox fields work correctly
- [ ] Can create/edit pickup destinations
- [ ] Can create/edit payroll rules
- [ ] Can configure add-on paycodes
- [ ] Rental creation with pickup destination works
- [ ] Adding add-ons to rental works
- [ ] RentalListPage displays destination and add-on badges
- [ ] Driver trip auto-calculation applies correct rules
- [ ] Payroll processing includes all expected codes
- [ ] Invoice number displays correctly (not ID)
- [ ] No console errors in browser or server

---

## Contact Points for Questions

If confused about business logic:
- **Pickup Destinations**: What locations drivers pick up from
- **PLACEMENT Rules**: Pay code for placing/delivering containers to customer
- **PICKUP Rules**: Pay code for picking up containers from customer
- **Add-Ons**: Additional tasks/items that earn extra pay (rice delivery, oil, etc.)

If stuck on technical issues:
- Review the plan file at: `C:\Users\NCSTi\.claude\plans\agile-sprouting-panda.md`
- Check this status file for current state
- All Green Target routes use `/greentarget` prefix
- Database schema is in `greentarget` schema (not public)
