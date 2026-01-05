# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules
1. Implement only what is explicitly requested, Always ask permission before modifying components not specifically mentioned.
2. Write clean code and use best practice.
3. Break down large tasks and ask clarifying questions when needed.
4. Try your best to code your designs in clean and good-looking manner, but still professional, and then adjust the layouts to be symmetrical.
5. Always add appropriate types to all function parameters, variables, and return types.
6. Fix all TypeScript errors immediately - don't leave them for the user to fix.
7. Identify potential edge cases or limitations in your implementation.
8. Don't run or ask to run npm run build, type checks or lint commands unless explicitly requested by the user. The user will do the tests manually.
9. When it is used, write space-y-3 instead of space-y-6.
10. Use rm instead of del when deleting files.
11. If needed during planning, access the dev database to understand the system better, use Docker: `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"` or pipe SQL files with `< file.sql`.
12. Anytime any changes need to be made to the database, please update the Database Schema in this markdown too.
13. After you have implemented any changes in a system that intertwines with other parts of the system, briefly check and notice the user if you find any changes needed in those connected parts.
14. After you're done implementing a new moderately to extremely complex system, ask me if I want you to scan through all the files you have created or modified, and find any bugs, limitations, or holes that you can improve upon/fix.

## Architecture Overview

### Multi-Company ERP System
This is a comprehensive ERP system supporting three companies:
- **Tien Hock** (main/default company) - routes without prefix
- **Green Target** - routes prefixed with `/greentarget`
- **Jelly Polly** - routes prefixed with `/jellypolly`

### Frontend Architecture (React + TypeScript)
- **Main App**: `src/App.tsx` - Handles routing, authentication, and layout
- **Routing**: `src/pages/pagesRoute.tsx` - Dynamically generates routes for all companies
- **Contexts**: 
  - `AuthContext.tsx` - User authentication state
  - `CompanyContext.tsx` - Multi-company switching logic
- **Company-specific Sidebar Data**:
  - `TienHockSidebarData.tsx`
  - `GreenTargetSidebarData.tsx` 
  - `JellyPollySidebarData.tsx`

### Backend Architecture (Node.js + Express)
- **Main Server**: `server.js` - Express app with PostgreSQL pool, CORS, scheduled jobs
- **Database**: PostgreSQL with enhanced connection pooling (`src/routes/utils/db-pool.js`)
- **Route Organization**: `src/routes/index.js` sets up all API routes
- **Company-specific Routes**: Each company has separate route handlers under their respective directories

### Database
- PostgreSQL with connection pooling
- Maintenance mode support for database operations
- Environment variables for database configuration

#### Database Schema (69 tables)

**Accounting & Finance:**
- `account_codes` - id, code, description, ledger_type, parent_code, level, sort_order, is_active, is_system, notes, created_at, updated_at, created_by, updated_by
- `account_codes_hierarchy` - id, code, description, ledger_type, parent_code, level, sort_order, is_active, is_system, path, path_array, depth
- `journal_entries` - id, reference_no, entry_type, entry_date, description, total_debit, total_credit, status, created_at, updated_at, created_by, updated_by, posted_at, posted_by
- `journal_entry_lines` - id, journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, created_at
- `journal_entry_types` - code, name, description, is_active
- `ledger_types` - code, name, description, is_system, is_active, created_at, updated_at
- `location_account_mappings` - id, location_id, location_name, mapping_type, account_code, voucher_type, is_active, created_at, updated_at, created_by, updated_by

**Customers & Sales:**
- `customers` - id, name, closeness, salesman, tin_number, id_type, state, email, address, city, id_number, phone_number, credit_limit, credit_used, updated_at
- `customer_branch_groups` - id, group_name, created_at
- `customer_branch_mappings` - id, group_id, customer_id, is_main_branch, created_at
- `customer_products` - id, customer_id, product_id, custom_price, is_available
- `invoices` - id, salespersonid, customerid, createddate, paymenttype, total_excluding_tax, rounding, totalamountpayable, uuid, submission_uid, long_id, datetime_validated, is_consolidated, consolidated_invoices, invoice_status, einvoice_status, tax_amount, balance_due
- `order_details` - id, invoiceid, code, price, quantity, freeproduct, returnproduct, description, tax, total, issubtotal
- `payments` - payment_id, invoice_id, payment_date, amount_paid, payment_method, payment_reference, internal_reference, notes, created_at, status, cancellation_date, cancellation_reason
- `consolidation_settings` - company_id, auto_consolidation_enabled, last_updated, updated_by
- `consolidation_tracking` - id, company_id, year, month, status, consolidated_invoice_id, last_attempt, next_attempt, attempt_count, error

**Products & Inventory:**
- `products` - id, description, price_per_unit, type, tax
- `production_entries` - id, entry_date, product_id, worker_id, bags_packed, created_at, updated_at, created_by
- `product_pay_codes` - id, product_id, pay_code_id, created_at, updated_at
- `stock_adjustments` - id, entry_date, product_id, adjustment_type, quantity, reason, created_at, created_by, reference
- `stock_opening_balances` - id, product_id, balance, effective_date, created_at, updated_at, created_by, notes
- `taxes` - name, rate

**Staff & Employees:**
- `staffs` - id, name, telephone_no, email, gender, nationality, birthdate, address, job, location, date_joined, ic_no, bank_account_number, epf_no, income_tax_no, socso_no, document, payment_type, payment_preference, race, agama, date_resigned, password, updated_at, marital_status, spouse_employment_status, number_of_children, kwsp_number, department, head_staff_id (references staffs.id - for same-name staff, indicates who is the "Head" for location determination in salary reports)
- `active_sessions` - session_id, staff_id, last_active, created_at, status
- `bookmarks` - id, staff_id, name

**Jobs & Work:**
- `jobs` - id, name, section
- `job_categories` - id, category, section, gaji, ikut, jv
- `job_details` - id, description, amount, remark, type
- `jobs_job_details` - job_id, job_detail_id
- `job_location_mappings` - id, job_id, location_code, is_active, created_at, updated_at
- `job_pay_codes` - id, job_id, pay_code_id, is_default, override_rate_biasa, override_rate_ahad, override_rate_umum
- `locations` - id, name
- `sections` - id, name
- `employee_job_location_exclusions` - id, employee_id, job_id, location_code, reason, created_at, created_by (excludes employee-job combinations from appearing in specific location salary reports)

**Payroll:**
- `pay_codes` - id, description, pay_type, rate_unit, rate_biasa, rate_ahad, rate_umum, is_active, requires_units_input, created_at, updated_at
- `employee_pay_codes` - id, employee_id, pay_code_id, is_default, override_rate_biasa, override_rate_ahad, override_rate_umum
- `monthly_payrolls` - id, year, month, status, created_at, updated_at, created_by
- `employee_payrolls` - id, monthly_payroll_id, employee_id, job_type, section, gross_pay, net_pay, status, created_at, employee_job_mapping
- `payroll_items` - id, employee_payroll_id, pay_code_id, description, rate, rate_unit, quantity, amount, is_manual, created_at, job_type, source_employee_id, source_date, work_log_id, work_log_type
- `payroll_deductions` - id, employee_payroll_id, deduction_type, employee_amount, employer_amount, wage_amount, rate_info, created_at
- `mid_month_payrolls` - id, employee_id, year, month, amount, payment_method, status, created_at, updated_at, created_by, paid_at, notes
- `pinjam_records` - id, employee_id, year, month, amount, description, pinjam_type, created_by, created_at, updated_at
- `commission_records` - id, employee_id, commission_date, amount, description, created_by, created_at, updated_at, location_code (location 16-24 for commission entries, NULL for bonus)

**Statutory Rates:**
- `epf_rates` - id, employee_type, wage_threshold, employee_rate_percentage, employer_rate_percentage, employer_fixed_amount, is_active, created_at, updated_at
- `socso_rates` - id, wage_from, wage_to, employee_rate, employer_rate, employer_rate_over_60, is_active, created_at, updated_at
- `sip_rates` - id, wage_from, wage_to, employee_rate, employer_rate, is_active, created_at, updated_at
- `income_tax_rates` - id, wage_from, wage_to, base_rate, unemployed_spouse_k0-k10, employed_spouse_k0-k10, is_active, created_at, updated_at

**Work Logs (Daily):**
- `daily_work_logs` - id, log_date, shift, day_type, context_data, status, created_at, updated_at, section
- `daily_work_log_entries` - id, work_log_id, employee_id, total_hours, job_id, is_on_leave, leave_type, following_salesman_id, muat_mee_bags, muat_bihun_bags, location_type
- `daily_work_log_activities` - id, log_entry_id, pay_code_id, hours_applied, units_produced, rate_used, calculated_amount, is_manually_added

**Work Logs (Monthly):**
- `monthly_work_logs` - id, log_month, log_year, section, context_data, status, created_at, updated_at
- `monthly_work_log_entries` - id, monthly_log_id, employee_id, job_id, total_hours, overtime_hours, created_at
- `monthly_work_log_activities` - id, monthly_entry_id, pay_code_id, hours_applied, rate_used, calculated_amount, is_manually_added, created_at

**Leave Management:**
- `employee_leave_balances` - id, employee_id, year, cuti_umum_total, cuti_tahunan_total, cuti_sakit_total, created_at, updated_at
- `leave_records` - id, employee_id, leave_date, leave_type, work_log_id, days_taken, amount_paid, status, notes, created_by, created_at, updated_at
- `holiday_calendar` - id, holiday_date, description, is_active

**Reference Data:**
- `agama` - id, name
- `banks` - id, name
- `nationalities` - id, name
- `races` - id, name

**Green Target Payroll (greentarget schema):**
- `greentarget.payroll_employees` - id, employee_id, job_type, date_added, is_active, notes
- `greentarget.monthly_payrolls` - id, year, month, status, created_at, updated_at, created_by
- `greentarget.employee_payrolls` - id, monthly_payroll_id, employee_id, job_type, section, gross_pay, net_pay, status, created_at, employee_job_mapping
- `greentarget.payroll_items` - id, employee_payroll_id, pay_code_id, description, rate, rate_unit, quantity, amount, is_manual, created_at, job_type, source_employee_id, source_date, work_log_id, work_log_type
- `greentarget.payroll_deductions` - id, employee_payroll_id, deduction_type, employee_amount, employer_amount, wage_amount, rate_info, created_at
- `greentarget.monthly_work_logs` - id, log_month, log_year, section, context_data, status, created_at, updated_at
- `greentarget.monthly_work_log_entries` - id, monthly_log_id, employee_id, job_id, total_hours, overtime_hours, created_at
- `greentarget.monthly_work_log_activities` - id, monthly_entry_id, pay_code_id, hours_applied, rate_used, calculated_amount, is_manually_added, created_at
- `greentarget.driver_trips` - id, driver_id, year, month, trip_count, completed_rental_ids, auto_calculated, notes, created_at, updated_at

### Styling
- Tailwind CSS with custom color palette
- Segoe UI font family
- Responsive design with desktop optimization
- **Dark Mode**: Fully implemented across the application
  - Toggle available in navbar user menu
  - State managed via `ThemeContext.tsx`
  - Uses Tailwind's `dark:` variant with `class` strategy

### File Structure Patterns
- **Pages**: Organized by company and functionality in `src/pages/`
- **Components**: Reusable components in `src/components/` with feature-specific subdirectories
- **Utils**: Business logic utilities in `src/utils/` organized by feature
- **Routes**: Backend API routes in `src/routes/` mirroring frontend page structure
- **Types**: TypeScript definitions in `src/types/types.ts`

### Development Setup
The project uses a hybrid setup: Docker for the database, native Node.js for the server and Vite for the frontend.

**Prerequisites:**
- Node.js (via NVM recommended)
- Docker Desktop

**Starting Development:**
```bash
# First time only - install dependencies
npm install --legacy-peer-deps

# Start development environment
dev.bat
```

This starts:
- **PostgreSQL** in Docker (port 5434)
- **API Server** with nodemon (port 5000) - auto-restarts on backend changes
- **Vite Frontend** (port 3000) - fast HMR for frontend changes

**Useful Commands:**
- `Ctrl+C` - Stop all services
- Type `rs` + Enter - Restart API server only
- `cd dev && docker compose down` - Stop database

**Environment Variables:**
- Development: `.env` file in project root
- Production: Server environment variables (not from .env)