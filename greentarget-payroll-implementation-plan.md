# Green Target Payroll Integration - Implementation Plan

## Overview
Integrate 8 Green Target employees (4 OFFICE + 4 DRIVER) into a separate payroll system at `/greentarget/payroll`.

## Key Decisions (User Confirmed)

1. **OFFICE Workers (4 employees)**: Reuse existing `MonthlyLogEntryPage.tsx` - already company-agnostic
2. **DRIVER Workers (4 employees)**: New trip-based entry system - auto-count from completed rentals
3. **Completely separate payroll**: Independent from Tien Hock at `/greentarget/payroll`
4. **Staff flagging**: Modal to add/remove employees from GT payroll using `useStaffsCache`

## Database Schema Changes

### New Tables in `greentarget` Schema

```sql
-- 1. Payroll membership tracking
CREATE TABLE greentarget.payroll_employees (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50) REFERENCES public.staffs(id),
  job_type VARCHAR(50) CHECK (job_type IN ('OFFICE', 'DRIVER')),
  date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  UNIQUE(employee_id, job_type)
);

-- 2. Monthly payroll records
CREATE TABLE greentarget.monthly_payrolls (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  status VARCHAR(20) CHECK (status IN ('Processing', 'Finalized')) DEFAULT 'Processing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(50),
  UNIQUE(year, month)
);

-- 3. Employee payroll details
CREATE TABLE greentarget.employee_payrolls (
  id SERIAL PRIMARY KEY,
  monthly_payroll_id INTEGER REFERENCES greentarget.monthly_payrolls(id) ON DELETE CASCADE,
  employee_id VARCHAR(50) REFERENCES public.staffs(id),
  job_type VARCHAR(50),
  section VARCHAR(50),
  gross_pay NUMERIC(10,2) DEFAULT 0,
  net_pay NUMERIC(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  employee_job_mapping JSONB
);

-- 4. Payroll line items
CREATE TABLE greentarget.payroll_items (
  id SERIAL PRIMARY KEY,
  employee_payroll_id INTEGER REFERENCES greentarget.employee_payrolls(id) ON DELETE CASCADE,
  pay_code_id VARCHAR(50) REFERENCES public.pay_codes(id),
  description TEXT,
  rate NUMERIC(10,2),
  rate_unit VARCHAR(20),
  quantity NUMERIC(10,2),
  amount NUMERIC(10,2),
  is_manual BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  job_type VARCHAR(50),
  source_employee_id VARCHAR(50),
  source_date DATE,
  work_log_id INTEGER,
  work_log_type VARCHAR(20)
);

-- 5. Statutory deductions
CREATE TABLE greentarget.payroll_deductions (
  id SERIAL PRIMARY KEY,
  employee_payroll_id INTEGER REFERENCES greentarget.employee_payrolls(id) ON DELETE CASCADE,
  deduction_type VARCHAR(20) CHECK (deduction_type IN ('epf', 'socso', 'sip', 'income_tax')),
  employee_amount NUMERIC(10,2),
  employer_amount NUMERIC(10,2),
  wage_amount NUMERIC(10,2),
  rate_info JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Monthly work logs (for OFFICE workers)
CREATE TABLE greentarget.monthly_work_logs (
  id SERIAL PRIMARY KEY,
  log_month INTEGER NOT NULL CHECK (log_month >= 1 AND log_month <= 12),
  log_year INTEGER NOT NULL,
  section VARCHAR(50),
  context_data JSONB,
  status VARCHAR(20) DEFAULT 'Draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(log_month, log_year, section)
);

-- 7. Work log entries
CREATE TABLE greentarget.monthly_work_log_entries (
  id SERIAL PRIMARY KEY,
  monthly_log_id INTEGER REFERENCES greentarget.monthly_work_logs(id) ON DELETE CASCADE,
  employee_id VARCHAR(50) REFERENCES public.staffs(id),
  job_id VARCHAR(50) REFERENCES public.jobs(id),
  total_hours NUMERIC(10,2),
  overtime_hours NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Work log activities (pay codes applied)
CREATE TABLE greentarget.monthly_work_log_activities (
  id SERIAL PRIMARY KEY,
  monthly_entry_id INTEGER REFERENCES greentarget.monthly_work_log_entries(id) ON DELETE CASCADE,
  pay_code_id VARCHAR(50) REFERENCES public.pay_codes(id),
  hours_applied NUMERIC(10,2),
  rate_used NUMERIC(10,2),
  calculated_amount NUMERIC(10,2),
  is_manually_added BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Driver trip tracking
CREATE TABLE greentarget.driver_trips (
  id SERIAL PRIMARY KEY,
  driver_id VARCHAR(50) REFERENCES public.staffs(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  trip_count INTEGER DEFAULT 0,
  completed_rental_ids INTEGER[], -- Array of rental IDs counted
  auto_calculated BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(driver_id, year, month)
);
```

### Pay Codes - Use Existing Mappings

**IMPORTANT**: Pay codes for DRIVER and OFFICE jobs already exist and are migrated.

- **OFFICE pay codes**: Query `job_pay_codes` table where `job_id = 'OFFICE'`
- **DRIVER pay codes**: Query `job_pay_codes` table where `job_id = 'DRIVER'`

No new pay codes need to be created. The system will use existing pay codes mapped to these jobs.

## Implementation Plan

### Phase 1: Backend Foundation (Week 1)

#### Step 1.1: Create Database Schema
- **Execute**: SQL migrations for 9 new tables
- **Update**: `CLAUDE.md` database schema section

#### Step 1.2: Create Payroll Employee Management Routes
- **New File**: `src/routes/greentarget/payroll-employees.js`
  ```javascript
  GET    /greentarget/api/payroll-employees       // List flagged employees
  POST   /greentarget/api/payroll-employees       // Add employee to GT payroll
  DELETE /greentarget/api/payroll-employees/:id   // Remove employee
  ```

#### Step 1.3: Create Monthly Payroll Routes
- **New File**: `src/routes/greentarget/monthly-payrolls.js`
  - Pattern: Copy from `src/routes/payroll/monthly-payrolls.js`
  - Adapt queries to use `greentarget` schema
  ```javascript
  GET    /greentarget/api/monthly-payrolls                  // List payrolls
  GET    /greentarget/api/monthly-payrolls/:id              // Get details
  POST   /greentarget/api/monthly-payrolls                  // Create new
  PUT    /greentarget/api/monthly-payrolls/:id/status       // Update status
  POST   /greentarget/api/monthly-payrolls/:id/process-all  // Process payroll
  ```

#### Step 1.4: Create Work Log Routes (OFFICE workers)
- **New File**: `src/routes/greentarget/monthly-work-logs.js`
  - Pattern: Copy from `src/routes/payroll/monthly-work-logs.js`
  - Change schema references to `greentarget.monthly_work_logs`
  ```javascript
  GET    /greentarget/api/monthly-work-logs       // List work logs
  POST   /greentarget/api/monthly-work-logs       // Create/update
  GET    /greentarget/api/monthly-work-logs/:id   // Get details
  PUT    /greentarget/api/monthly-work-logs/:id   // Update
  DELETE /greentarget/api/monthly-work-logs/:id   // Delete
  ```

#### Step 1.5: Create Driver Trip Routes
- **New File**: `src/routes/greentarget/driver-trips.js`
  ```javascript
  GET    /greentarget/api/driver-trips?year=X&month=Y&driver_id=Z  // Get trip data
  POST   /greentarget/api/driver-trips                             // Save trips
  GET    /greentarget/api/driver-trips/auto-calculate              // Auto-count from rentals
  ```
  - Auto-calculate logic:
    ```sql
    SELECT driver, COUNT(*) as trip_count
    FROM greentarget.rentals
    WHERE date_picked IS NOT NULL
      AND EXTRACT(YEAR FROM date_placed) = $1
      AND EXTRACT(MONTH FROM date_placed) = $2
    GROUP BY driver
    ```

#### Step 1.6: Register Routes
- **Modify**: `src/routes/index.js`
  ```javascript
  import gtPayrollEmployeesRouter from "./greentarget/payroll-employees.js";
  import gtMonthlyPayrollsRouter from "./greentarget/monthly-payrolls.js";
  import gtMonthlyWorkLogsRouter from "./greentarget/monthly-work-logs.js";
  import gtDriverTripsRouter from "./greentarget/driver-trips.js";

  // Register routes
  app.use("/greentarget/api/payroll-employees", gtPayrollEmployeesRouter(pool));
  app.use("/greentarget/api/monthly-payrolls", gtMonthlyPayrollsRouter(pool));
  app.use("/greentarget/api/monthly-work-logs", gtMonthlyWorkLogsRouter(pool));
  app.use("/greentarget/api/driver-trips", gtDriverTripsRouter(pool));
  ```

### Phase 2: Staff Management Modal (Week 2)

#### Step 2.1: Create GT Payroll Employees Hook
- **New File**: `src/utils/greenTarget/useGTPayrollEmployees.ts`
  ```typescript
  export const useGTPayrollEmployees = () => {
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchEmployees = async () => { /* ... */ };
    const addEmployee = async (employeeId, jobType) => { /* ... */ };
    const removeEmployee = async (id) => { /* ... */ };

    return { employees, isLoading, fetchEmployees, addEmployee, removeEmployee };
  };
  ```

#### Step 2.2: Create Payroll Employee Management Modal
- **New File**: `src/components/GreenTarget/PayrollEmployeeManagementModal.tsx`
  - Use `useStaffsCache()` for employee data
  - Filter: `staffs.filter(s => s.job?.includes('OFFICE') || s.job?.includes('DRIVER'))`
  - Two-column layout: Available Staff | GT Payroll Members
  - Add/Remove buttons with confirmation
  - Job type selector when adding (OFFICE/DRIVER)

#### Step 2.3: Integrate Modal into Staff Page
- **Modify**: `src/pages/Catalogue/StaffPage.tsx`
  - Add "Manage GT Payroll" button in header
  - Display GT badge on staff cards for flagged employees
  - Import and render `PayrollEmployeeManagementModal`

### Phase 3: OFFICE Workers - Reuse Existing System (Week 2)

**OFFICE Hours Entry**: The existing `MonthlyLogEntryPage.tsx` supports TWO types of hours:
- **Regular Hours**: Default 176 hours (22 days × 8 hours)
- **Overtime Hours**: Default 0 hours (optional, can be entered if overtime worked)

#### Step 3.1: Add Job Config (if needed)
- **Modify**: `src/configs/payrollJobConfigs.ts`
  - Verify OFFICE config exists (it does at line 164-172)
  - No changes needed

#### Step 3.2: Create GT-Specific Routes
- **New File**: `src/pages/GreenTarget/Payroll/GTMonthlyLogListPage.tsx`
  - Wrapper around existing `MonthlyLogListPage.tsx`
  - Change API calls to use `/greentarget/api/monthly-work-logs`
  - Filter to show only GT OFFICE section

- **New File**: `src/pages/GreenTarget/Payroll/GTMonthlyLogEntryPage.tsx`
  - Wrapper around existing `MonthlyLogEntryPage.tsx`
  - Use GT API endpoints
  - Pre-filter employees to GT payroll members only

#### Step 3.3: Update Navigation
- **Modify**: `src/pages/GreenTargetNavData.tsx`
  ```typescript
  {
    name: "Payroll",
    icon: IconCash,
    path: "/payroll",
    component: GTPayrollPage,
    subItems: [
      {
        name: "Monthly Payroll",
        path: "/payroll",
        component: GTPayrollPage,
      },
      {
        name: "OFFICE Work Log",
        path: "/payroll/office-log",
        component: GTMonthlyLogEntryPage,
      },
      // ... more routes
    ],
  }
  ```

### Phase 4: DRIVER Workers - Trip Entry System (Week 3)

#### Step 4.1: Add DRIVER Job Config
- **Modify**: `src/configs/payrollJobConfigs.ts`
  ```typescript
  DRIVER: {
    id: "DRIVER",
    name: "Driver",
    section: ["DRIVER"],  // Section is "DRIVER" not "GT_DRIVER"
    entryMode: "monthly",
    defaultHours: 176,
    replaceUnits: "Trip",  // Like SALESMAN uses "Bag"
    jobIds: ["DRIVER"],
    contextFields: [
      {
        id: "completedTrips",
        label: "Completed Trips",
        type: "number",
        required: true,
        // linkedPayCode will use existing DRIVER pay codes from job_pay_codes mapping
      }
    ],
  }
  ```

#### Step 4.2: Create Driver Trip Entry Page
- **New File**: `src/pages/GreenTarget/Payroll/DriverTripEntryPage.tsx`
  - Month/Year selector
  - Driver selector (dropdown)
  - Auto-calculate button: "Load Rentals from System"
  - Rentals grid showing:
    - Date Placed, Date Picked, Customer, Dumpster, Location
    - Checkbox to include/exclude from trip count
  - Trip count display
  - Save button to store in `driver_trips` table

  **Key Logic**:
  ```typescript
  const autoCalculateTrips = async () => {
    const rentals = await greenTargetApi.getRentals({
      start_date: `${year}-${month.toString().padStart(2, '0')}-01`,
      end_date: lastDayOfMonth,
    });

    const completedRentals = rentals.filter(r =>
      r.date_picked !== null && r.driver === selectedDriver
    );

    setTripCount(completedRentals.length);
    setIncludedRentals(completedRentals.map(r => r.rental_id));
  };
  ```

#### Step 4.3: Create Driver Trip List Page
- **New File**: `src/pages/GreenTarget/Payroll/DriverTripListPage.tsx`
  - Summary table by driver
  - Month navigation
  - Show: Driver Name, Trip Count, Status (Saved/Draft)
  - Edit button to open entry page

### Phase 5: Payroll Processing (Week 4)

#### Step 5.1: Create Main Payroll Page
- **New File**: `src/pages/GreenTarget/Payroll/GTPayrollPage.tsx`
  - **Pattern**: Copy structure from `src/pages/Payroll/PayrollPage.tsx`
  - Adapt to use GT API endpoints
  - Show only OFFICE and DRIVER job types
  - Month navigator
  - Create/Process/Finalize workflow
  - Employee list grouped by job type
  - Batch payslip printing

#### Step 5.2: Create Payroll Details Page
- **New File**: `src/pages/GreenTarget/Payroll/GTPayrollDetailsPage.tsx`
  - **Pattern**: Copy from `src/pages/Payroll/PayrollDetailsPage.tsx`
  - Individual employee payroll breakdown
  - Manual item addition
  - Deduction details
  - Print payslip button

#### Step 5.3: Create GT Payroll Utilities
- **New File**: `src/utils/greenTarget/payrollUtils.ts`
  ```typescript
  export const createGTMonthlyPayroll = async (year: number, month: number) => {
    return await greenTargetApi.createMonthlyPayroll(year, month);
  };

  export const getGTMonthlyPayrollByYearMonth = async (year: number, month: number) => {
    return await greenTargetApi.getMonthlyPayroll({ year, month });
  };

  export const processGTMonthlyPayroll = async (payrollId: number) => {
    return await greenTargetApi.processMonthlyPayroll(payrollId);
  };
  ```

#### Step 5.4: Backend Processing Logic
- **File**: `src/routes/greentarget/monthly-payrolls.js`
- **Endpoint**: `POST /greentarget/api/monthly-payrolls/:id/process-all`

  **Processing Steps**:
  1. Fetch GT payroll employees from `greentarget.payroll_employees`
  2. For OFFICE employees:
     - Get hours from `greentarget.monthly_work_log_entries`
     - Apply pay codes linked to OFFICE job
  3. For DRIVER employees:
     - Get trip count from `greentarget.driver_trips`
     - Apply `GT_DRIVER_TRIP` pay code: amount = trip_count × rate
     - Apply base hours if configured
  4. Calculate gross pay (sum of all items)
  5. Calculate deductions (EPF, SOCSO, Income Tax) - **reuse existing logic**
  6. Calculate net pay
  7. Save to `employee_payrolls` and `payroll_items`

#### Step 5.5: Update API Client
- **Modify**: `src/routes/greentarget/api.ts`
  ```typescript
  // Add payroll endpoints
  createMonthlyPayroll: (year, month) =>
    api.post('/greentarget/api/monthly-payrolls', { year, month }),
  getMonthlyPayroll: (filters) =>
    api.get('/greentarget/api/monthly-payrolls', { params: filters }),
  processMonthlyPayroll: (id) =>
    api.post(`/greentarget/api/monthly-payrolls/${id}/process-all`),
  // ... more endpoints
  ```

### Phase 6: PDF Generation & Polish (Week 5)

#### Step 6.1: Create GT Payslip PDF Generator
- **New File**: `src/utils/greenTarget/PaySlipPDFMake.ts`
  - **Pattern**: Copy from `src/utils/payroll/PaySlipPDFMake.ts`
  - Update branding to Green Target
  - Use `GreenTargetLogo` component
  - Same calculation display logic

#### Step 6.2: Create Payslip Button Components
- **New File**: `src/utils/greenTarget/PayslipButtons.tsx`
  - Export `PrintGTPayslipButton`
  - Export `PrintBatchGTPayslipsButton`
  - Integrate with PDF generator

#### Step 6.3: Update Navigation (Complete)
- **Modify**: `src/pages/GreenTargetNavData.tsx`
  - Add all payroll routes under Payroll section
  - Import all new components

#### Step 6.4: UI Polish
- Consistent styling with GT branding
- Loading states for all API calls
- Error handling with toast notifications
- Responsive design verification

### Phase 7: Testing & Documentation (Week 6)

#### Step 7.1: Integration Testing
- Flag 8 employees (4 OFFICE, 4 DRIVER)
- Enter OFFICE work logs for a month
- Enter DRIVER trips for a month
- Process payroll
- Verify calculations
- Print payslips
- Finalize payroll

#### Step 7.2: Edge Case Testing
- No work logs entered
- Partial month data
- Deduction calculation edge cases
- Status transitions (Processing ↔ Finalized)

#### Step 7.3: Documentation
- Update `CLAUDE.md` with new tables
- Add inline code comments
- Create user guide for GT payroll workflow

## Critical Files Reference

### Study These Files (Patterns to Follow)

1. **src/pages/Payroll/PayrollPage.tsx** - Main payroll page structure
2. **src/pages/Payroll/MonthlyLog/MonthlyLogEntryPage.tsx** - OFFICE work log entry
3. **src/routes/payroll/monthly-payrolls.js** - Backend payroll processing
4. **src/routes/payroll/monthly-work-logs.js** - Backend work log CRUD
5. **src/utils/catalogue/useStaffsCache.ts** - Staff data hook pattern
6. **src/configs/payrollJobConfigs.ts** - Job configuration system

### Files to Create

**Backend (7 files)**:
1. `src/routes/greentarget/payroll-employees.js`
2. `src/routes/greentarget/monthly-payrolls.js`
3. `src/routes/greentarget/monthly-work-logs.js`
4. `src/routes/greentarget/driver-trips.js`

**Frontend Components (8 files)**:
5. `src/components/GreenTarget/PayrollEmployeeManagementModal.tsx`
6. `src/pages/GreenTarget/Payroll/GTPayrollPage.tsx`
7. `src/pages/GreenTarget/Payroll/GTPayrollDetailsPage.tsx`
8. `src/pages/GreenTarget/Payroll/GTMonthlyLogListPage.tsx`
9. `src/pages/GreenTarget/Payroll/GTMonthlyLogEntryPage.tsx`
10. `src/pages/GreenTarget/Payroll/DriverTripEntryPage.tsx`
11. `src/pages/GreenTarget/Payroll/DriverTripListPage.tsx`

**Utilities (4 files)**:
12. `src/utils/greenTarget/useGTPayrollEmployees.ts`
13. `src/utils/greenTarget/payrollUtils.ts`
14. `src/utils/greenTarget/PaySlipPDFMake.ts`
15. `src/utils/greenTarget/PayslipButtons.tsx`

**Modified Files (5 files)**:
16. `src/routes/index.js` - Register GT payroll routes
17. `src/pages/GreenTargetNavData.tsx` - Add payroll navigation
18. `src/pages/Catalogue/StaffPage.tsx` - Add GT payroll modal
19. `src/routes/greentarget/api.ts` - Add payroll API methods
20. `src/configs/payrollJobConfigs.ts` - Add DRIVER config (section: ["DRIVER"])

## Key Implementation Notes

### OFFICE Workers - Zero Customization Needed
- Existing `MonthlyLogEntryPage.tsx` is already company-agnostic
- Just change API endpoints to GT schema
- No UI changes required

### DRIVER Workers - New Trip System
- Auto-calculate trips from `greentarget.rentals` table
- Use "Trip" rate_unit (already exists in system)
- Follow SALESMAN pattern (replaceUnits)
- Monthly entry, not daily

### Payroll Processing - Reuse Existing Logic
- EPF, SOCSO, Income Tax calculations are identical
- Same `contributionCalculations.ts` utilities
- No duplication needed

### Data Isolation
- All GT payroll data in `greentarget` schema
- No impact on Tien Hock payroll
- Shared reference data: staffs, pay_codes, contribution rates

## Timeline Summary

- **Week 1**: Backend foundation + database schema
- **Week 2**: Staff management modal + OFFICE system setup
- **Week 3**: DRIVER trip entry system
- **Week 4**: Payroll processing + calculations
- **Week 5**: PDF generation + UI polish
- **Week 6**: Testing + documentation

**Total**: 6 weeks for complete implementation
