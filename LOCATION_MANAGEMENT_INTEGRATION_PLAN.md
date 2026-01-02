# Location Management Integration Plan

## Overview
Consolidate location and job-location mapping management into the LocationPage by:
1. Enhancing LocationModal to include job mapping management
2. Replacing all hard-coded location references with database-driven data
3. Deprecating the standalone JobLocationMappingsPage
4. Maintaining backward compatibility with existing salary report structure

---

## Phase 1: Enhance LocationModal with Job Mappings

### Goal
Add job mapping management directly to the location edit modal, eliminating the need for a separate page.

### File: `src/components/Catalogue/LocationModal.tsx`

**Key Changes:**

1. **Add imports and state:**
   ```typescript
   import { useJobsCache } from "../../utils/catalogue/useJobsCache";
   import { useJobLocationMappings } from "../../utils/catalogue/useJobLocationMappings";
   import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";

   const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
   const [isSavingMappings, setIsSavingMappings] = useState(false);
   const { jobs } = useJobsCache();
   const { byLocation, refreshData: refreshMappings } = useJobLocationMappings();
   ```

2. **Load existing job mappings on modal open:**
   ```typescript
   useEffect(() => {
     if (isOpen && initialData) {
       const mappedJobs = byLocation[initialData.id] || [];
       setSelectedJobs(mappedJobs);
     } else if (isOpen) {
       setSelectedJobs([]);
     }
   }, [isOpen, initialData, byLocation]);
   ```

3. **Add job selection UI (after name field):**
   - Multi-select Listbox for job selection
   - Show selected jobs count
   - Display selected jobs as badges with job ID and name
   - Help text explaining job mappings impact on salary reports

4. **Update save handler to include job mappings:**
   - For editing: Calculate jobs to add/remove, update via API
   - For new locations: Create mappings after location creation
   - Refresh job mappings cache after saving
   - Show appropriate loading states

5. **Update button states:**
   - Show "Saving Location...", "Saving Job Mappings...", or action text
   - Disable during both saving operations

---

## Phase 2: Replace Hard-Coded Locations

### 2.1 File: `src/pages/Payroll/SalaryReportPage.tsx`

**Replace hard-coded LOCATION_ORDER array (lines 45-69):**

```typescript
const LOCATION_ORDER: LocationOrderItem[] = useMemo(() => {
  if (locations.length === 0) return [];

  const orderStructure: LocationOrderItem[] = [];

  const addLocation = (id: string) => {
    if (locations.find(loc => loc.id === id)) {
      orderStructure.push({ type: "location", id });
    }
  };

  // Build order based on existing structure
  // Directors & Office
  addLocation("01"); addLocation("02"); addLocation("03");
  addLocation("04"); addLocation("06"); addLocation("07");
  addLocation("08"); addLocation("09"); addLocation("10");
  addLocation("11"); addLocation("13");

  // Maintenance section
  if (locations.find(loc => loc.id === "14")) {
    orderStructure.push({ type: "header", text: "KERJA LUAR MAINTENANCE" });
    addLocation("14");
  }

  // Commission section
  const commissionLocs = ["16", "17", "18", "19", "20", "21"];
  if (commissionLocs.some(id => locations.find(loc => loc.id === id))) {
    orderStructure.push({ type: "header", text: "COMMISSION" });
    commissionLocs.forEach(addLocation);
  }

  // Other locations
  addLocation("22"); addLocation("23"); addLocation("24");

  // Add any new locations not in the predefined list (at the end)
  locations.forEach(loc => {
    const alreadyAdded = orderStructure.some(
      item => item.type === "location" && item.id === loc.id
    );
    if (!alreadyAdded) {
      orderStructure.push({ type: "location", id: loc.id });
    }
  });

  return orderStructure;
}, [locations]);
```

**Note:** This maintains existing display order while making it dynamic. New locations automatically appear at the end.

### 2.2 File: `src/configs/journalVoucherMappings.ts`

**Replace static LOCATION_MAP with hook-based approach:**

Remove the static export and update all consuming components to use:
```typescript
const { locations } = useLocationsCache();
const LOCATION_MAP = useMemo(() => {
  const map: { [key: string]: string } = {};
  locations.forEach((loc) => {
    map[loc.id] = loc.name;
  });
  return map;
}, [locations]);
```

**Components to update:**
- Any component importing `LOCATION_MAP` from `journalVoucherMappings.ts`

### 2.3 Backend Default Locations

**Files:**
- `src/routes/payroll/salary-report.js` (line 37, 250-251)
- `src/routes/accounting/journal-vouchers.js` (line 330, 526)

**Action:** Add comments to document the default location '02':
```sql
-- Default to '02' (OFFICE) for unmapped jobs
COALESCE(jlm.location_code, '02') as location_code
```

**No code changes needed** - keep existing default for backward compatibility.

---

## Phase 3: Remove Deprecated Code

### 3.1 Delete Files
- **DELETE:** `src/pages/Payroll/Settings/JobLocationMappingsPage.tsx`

### 3.2 Update Navigation

**File:** `src/pages/TienHockNavData.tsx`

1. Remove import:
   ```typescript
   // REMOVE THIS LINE
   import JobLocationMappingsPage from "./Payroll/Settings/JobLocationMappingsPage";
   ```

2. Remove route from Payroll Settings section:
   ```typescript
   // REMOVE THIS ROUTE:
   {
     name: "Job Location Mappings",
     path: "/payroll/settings/job-location-mappings",
     component: JobLocationMappingsPage,
   },
   ```

**Keep:** LocationAccountMappingsPage route (different feature, still needed)

### 3.3 Cleanup Settings Tabs (if applicable)

**File:** `src/pages/Payroll/Settings/LocationAccountMappingsPage.tsx`

If there's a SettingsTabs component showing both pages, remove it since only one page remains.

### 3.4 Keep Backend Infrastructure

**DO NOT DELETE:**
- `src/routes/catalogue/job-location-mappings.js` - Used by LocationModal API calls
- `src/utils/catalogue/useJobLocationMappings.ts` - Used by LocationModal

---

## Phase 4: Polish & Documentation

### 4.1 File: `src/pages/Catalogue/LocationPage.tsx`

**Add help banner at top of page:**

```typescript
{/* Info Banner */}
<div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded-lg p-4 mb-3">
  <div className="flex items-start gap-3">
    <IconInfoCircle size={20} className="text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
    <div className="text-sm text-sky-800 dark:text-sky-200">
      <p className="font-medium mb-1">Location Management</p>
      <p className="text-sky-700 dark:text-sky-300">
        Locations organize payroll data in salary reports. When you edit a location,
        you can also assign which jobs belong to it. Mapped jobs will automatically
        appear under the correct location in salary reports and journal vouchers.
      </p>
    </div>
  </div>
</div>
```

---

## Testing Checklist

### Critical Path Tests

- [ ] **Location Creation with Job Mappings**
  - Create new location with ID "99", name "Test Location"
  - Select 2-3 jobs from dropdown
  - Verify location appears with job badges

- [ ] **Location Update with Job Changes**
  - Edit existing location
  - Add new jobs, remove existing jobs
  - Verify changes reflected in list and salary reports

- [ ] **Location Deletion with Dependencies**
  - Try deleting location with mapped jobs
  - Verify deletion blocked with accurate dependency count

- [ ] **Salary Report Generation**
  - Select month with data
  - Verify locations appear in correct order
  - Verify section headers (MAINTENANCE, COMMISSION) appear
  - Verify new locations appear at bottom
  - Verify employees grouped by job's location

- [ ] **Journal Voucher Generation**
  - Preview JVDR and JVSL
  - Verify location groupings correct
  - Verify account mappings work for all locations

- [ ] **Backward Compatibility**
  - Check existing salary reports (previous months)
  - Verify data displays correctly
  - Verify totals match

### Edge Cases

- [ ] **Unmapped Job Default**
  - Create job without location mapping
  - Process payroll
  - Verify defaults to location "02" (OFFICE)

- [ ] **Multiple Jobs Same Location**
  - Assign 5-10 jobs to one location
  - Verify badges wrap properly
  - Verify search by job name works

- [ ] **Location ID Change**
  - Change location ID
  - Verify job mappings update
  - Verify account mappings update
  - Verify staff assignments update

### Navigation Tests

- [ ] Accessing `/payroll/settings/job-location-mappings` redirects or 404s
- [ ] No broken links in navigation
- [ ] Catalogue > Locations page loads and functions

---

## Implementation Sequence

1. **Phase 1** - Update LocationModal (1-2 hours)
   - Add job mapping UI and save logic
   - Test standalone

2. **Phase 2** - Replace hard-coded locations (1 hour)
   - Update SalaryReportPage LOCATION_ORDER
   - Update journalVoucherMappings consumers
   - Test salary reports and vouchers

3. **Phase 3** - Remove deprecated code (15 mins)
   - Delete JobLocationMappingsPage
   - Update navigation
   - Verify no broken links

4. **Phase 4** - Polish (30 mins)
   - Add help text
   - Test end-to-end

5. **Testing** - Comprehensive validation (2-3 hours)
   - Run all test cases
   - Verify backward compatibility

**Total Estimated Time:** 5-7 hours

---

## Critical Files

1. **src/components/Catalogue/LocationModal.tsx** - Core enhancement
2. **src/pages/Payroll/SalaryReportPage.tsx** - Dynamic LOCATION_ORDER
3. **src/pages/TienHockNavData.tsx** - Remove deprecated route
4. **src/configs/journalVoucherMappings.ts** - Convert to hook-based
5. **src/pages/Catalogue/LocationPage.tsx** - Add help text, refresh mappings

---

## Rollback Plan

**Quick Rollback (10-15 mins):**
1. Revert LocationModal.tsx
2. Restore JobLocationMappingsPage.tsx
3. Restore navigation in TienHockNavData.tsx
4. Redeploy frontend

**Full Rollback (20-30 mins):**
1. All quick rollback steps
2. Restore journalVoucherMappings.ts
3. Restore SalaryReportPage.tsx LOCATION_ORDER

**No database changes needed** - existing schema supports all features.

---

## Risk Assessment

### High Risk
- **Salary Report Generation** - Critical monthly payroll function
  - Mitigation: Extensive testing, maintain structure
  - Rollback: Easy - revert LOCATION_ORDER

### Medium Risk
- **LocationModal Save Logic** - New transactional operations
  - Mitigation: Error handling, test edge cases
  - Rollback: Easy - revert modal

### Low Risk
- Navigation changes - simple removal
- UI enhancements - visual only
- Backend defaults - no change

---

## Post-Implementation Checklist

- [ ] LocationModal allows managing job mappings
- [ ] Location list shows job badges
- [ ] Salary reports build LOCATION_ORDER from database
- [ ] Salary reports display correctly with headers
- [ ] Journal vouchers use database locations
- [ ] JobLocationMappingsPage deleted
- [ ] Navigation updated (no broken links)
- [ ] Hard-coded LOCATION_MAP references converted
- [ ] Cache invalidation works
- [ ] Dependency checking prevents deletion
- [ ] All tests pass
- [ ] No console errors
- [ ] Performance acceptable
