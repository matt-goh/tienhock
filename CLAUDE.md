# CLAUDE.md

This file provides guidance to Codex when working with code in this repository.

## Rules

1. Think Before Coding. State assumptions explicitly. Ask rather than guess, always ask permission before modifying components not specifically mentioned. Push back when a simpler approach exists. Stop when confused.
2. Simplicity First. Minimum code that solves the problem. Nothing speculative. No abstractions for single-use code.
3. Surgical Changes. Touch only what you must. Don't improve adjacent code. Match existing style. Don't refactor what isn't broken.
4. Goal-Driven Execution. Define success criteria. Loop until verified. Strong success criteria let GPT loop independently
5. Break down large tasks and ask clarifying questions when needed.
6. Read before you write. Before adding code, read exports, immediate callers, shared utilities.
   If unsure why existing code is structured a certain way, ask.
7. Always add appropriate types to all function parameters, variables, and return types.
8. Fix all TypeScript errors immediately - don't leave them for the user to fix.
9. Identify potential edge cases or limitations in your implementation.
10. Don't run or ask to run npm run build, type checks or lint commands unless explicitly requested by the user. The user will do the tests manually.
11. Use rm instead of del when deleting files.
12. If needed during planning, access the dev database to understand the system better, use Docker: `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"` or pipe SQL files with `< file.sql`.
13. Anytime any changes need to be made to the database, please update the Database Schema in AGENTS.md and CLAUDE.md.
14. After you have implemented any changes in a system that intertwines with other parts of the system, briefly check and notice the user if you find any changes needed in those connected parts.
15. After you're done implementing a new moderately to extremely complex system, ask me if I want you to scan through all the files/code you have created or modified, and find any bugs, limitations, or holes that you can improve upon/fix.
16. Update the changelog (`CHANGELOG_ENTRIES` in `src/components/ChangelogModal.tsx`) when you ship a change big enough for users to notice. **Add an entry for:** new pages/features, renamed or removed user-facing fields/buttons/menus, changes to how data is calculated, processed, stored, imported, or exported, bug fixes that change visible numbers/behaviour, and anything that changes a workflow the user already knows. **Do not add an entry for:** spacing/padding/colour tweaks, dark-mode-only adjustments, refactors with no behavioural change, internal renames, comment/typo edits, dependency bumps, or other purely cosmetic/internal work. Each entry must have a `date` (ISO `yyyy-mm-dd`, the date the change is implemented), an `ms` (Bahasa Melayu) field, and an `en` (English) field, be written from the end-user's perspective with no technical jargon, and be **prepended** to the array (newest first).

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

#### Database Schema (76 tables)

**Accounting & Finance:**

- `account_codes` - id, code, description, ledger_type, parent_code, level, sort_order, is_active, is_system, notes, created_at, updated_at, created_by, updated_by, fs_note (financial statement note reference)
- `account_codes_hierarchy` - id, code, description, ledger_type, parent_code, level, sort_order, is_active, is_system, path, path_array, depth
- `financial_statement_notes` - code (PK), name, description, category (asset/liability/equity/revenue/expense/cogs), report_section (balance_sheet/income_statement/cogm), normal_balance (debit/credit), sort_order, parent_note, is_active, created_at, updated_at
- `journal_entries` - id, reference_no, entry_type, entry_date, description, total_debit, total_credit, status, created_at, updated_at, created_by, updated_by, posted_at, posted_by
- `journal_entry_lines` - id, journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, created_at
- `journal_entry_types` - code, name, description, is_active
- `ledger_types` - code, name, description, is_system, is_active, created_at, updated_at
- `location_account_mappings` - id, location_id, location_name, mapping_type, account_code, voucher_type, is_active, created_at, updated_at, created_by, updated_by
- `suppliers` - id, code (unique), name, contact_person, phone, email, is_active, created_at, updated_at
- `purchase_invoices` - id, supplier_id (FK suppliers), invoice_number, invoice_date, total_amount, payment_status (unpaid/partial/paid), amount_paid, journal_entry_id (FK journal_entries), notes, created_at, updated_at, created_by (unique: supplier_id, invoice_number)
- `purchase_invoice_lines` - id, purchase_invoice_id (FK purchase_invoices CASCADE), line_number, material_id (FK materials), variant_id (nullable FK material_variants), stock_bucket (mee/bihun/shared/null; null means accounting-only), quantity, unit_cost, amount, notes, created_at (material purchase lines for tracking raw material/ingredient/packing purchases and derived stock purchases)
- `material_purchase_account_mappings` - id, material_category (unique), purchase_account_code (FK account_codes), description, is_active, created_at (maps material categories to GL purchase accounts for auto-journaling: ingredient→PUR, raw_material→PUR, packing_material→PM)
- `self_billed_foreign_suppliers` - id, supplier_name (unique), tin_number (default EI00000000030), id_type, id_number, sst_number, ttx_number, msic_code, business_activity_description, address_line_0-2, city, postcode, state_code, country_code, contact_number, email, notes, is_active, created_at, updated_at (foreign seller profiles for manual self-billed e-invoices)
- `self_billed_invoices` - id, purchase_kind (foreign/local; compatibility field for General Purchases), foreign_supplier_id (nullable FK self_billed_foreign_suppliers for foreign purchases), local_supplier_name (free-text supplier for local purchases), self_billed_no (unique internal purchase no.; SB prefix for foreign, GP prefix for local), purchase_date, transaction_type, platform, order_no, payment_reference, shipping_method, shipping_number, has_supporting_document, supporting_document_notes, supporting_document_s3_key, supporting_document_filename, supporting_document_content_type, supporting_document_size, supporting_document_uploaded_at, supporting_document_uploaded_by, currency_code, fx_rate, total_foreign_amount, total_excluding_tax_myr, tax_amount_myr, total_including_tax_myr, payable_amount_myr, uuid, submission_uid, long_id, datetime_validated, invoice_status, einvoice_status, cancellation_reason, notes, created_at, updated_at, created_by
- `self_billed_invoice_lines` - id, self_billed_invoice_id (FK self_billed_invoices CASCADE), line_number, description, quantity, balance_quantity (source balance for General stock), general_stock_category_id (nullable FK general_stock_categories), unit_price_foreign, amount_foreign, amount_myr, classification_code, tax_type, tax_rate, tax_amount_myr, tax_exemption_reason, customs_form_reference, notes, created_at
- `general_stock_categories` - id, name (unique), sort_order, is_active, created_at, updated_at, created_by, updated_by (user-managed subcategories for General stock such as Bearing)
- `general_stock_adjustments` - id, self_billed_invoice_line_id (nullable FK self_billed_invoice_lines CASCADE), general_stock_category_id (nullable FK general_stock_categories), adjustment_date, adjustment_quantity, notes, created_at, updated_at, created_by, updated_by (General stock usage/adjustment ledger; positive source-linked adjustments increase invoice line balance_quantity, negative adjustments reduce General stock only)

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
- `adjustment_documents` - id (e.g. CN-2026-0001 / DN-2026-0001 / RN-2026-0001), type (credit_note/debit_note/refund_note), original_invoice_id (FK invoices), customerid, salespersonid, createddate (unix ms), reason, paired_with_id (self-FK; CN<->RN pairing), linked_payment_id (FK payments; standalone RN tied to overpaid payment), references_consolidated_id (CON-* parent id when original was consolidated), total_excluding_tax, tax_amount, rounding, totalamountpayable, refund_method, refund_reference, bank_account (RN-only fields), uuid, submission_uid, long_id, datetime_validated, einvoice_status (valid/pending/invalid/cancelled), is_consolidated, consolidated_adjustments (JSONB array of child adj doc IDs when wrapper), status (active/cancelled), cancellation_reason, cancellation_date, journal_entry_id (FK journal_entries), created_by, created_at, updated_at. Tien Hock Credit Notes / Debit Notes / Refund Notes against sales invoices. Atomic create updates invoices.balance_due and customers.credit_used and posts a journal entry; cancellation reverses all three.
- `adjustment_document_lines` - id, adjustment_doc_id (FK adjustment_documents CASCADE), line_number, code, description, quantity, price, tax, total, issubtotal

**Products & Inventory:**

- `products` - id, description, price_per_unit, type, tax, is_active
- `production_entries` - id, entry_date, product_id, worker_id (nullable for stock-only OTH production records), bags_packed, created_at, updated_at, created_by
- `production_machine_status` - id, entry_date, product_id (FK products), machine_broken, notes, created_at, updated_at, created_by (tracks machine broken status per date/product for production bonus threshold override - when machine_broken=true, workers below threshold still receive bonus pay codes)
- `product_pay_codes` - id, product_id, pay_code_id, created_at, updated_at
- `stock_adjustments` - id, entry_date, product_id, adjustment_type, quantity, reason, created_at, created_by, reference
- `stock_opening_balances` - id, product_id, balance, effective_date, created_at, updated_at, created_by, notes
- `taxes` - name, rate

**Materials (Ingredients/Raw/Packing):**

- `materials` - id, code (unique), name, category (ingredient/raw_material/packing_material), default_unit_cost, applies_to (mee/bihun/both), sort_order, is_active, created_at, updated_at, created_by
- `material_variants` - id, material_id (FK), variant_name, default_unit_cost, sort_order, is_active, created_at, updated_at (unique: material_id, variant_name). For materials with multiple suppliers/types like "Beras 50KG" having Vietnam Coklat, Vietnam Hijau, etc.
- `material_stock_entries` - id, year, month, material_id, product_line (mee/bihun/shared), variant_id (nullable FK to material_variants), custom_name, custom_description, adjustment_quantity (manual plus/minus stock adjustment), unit_cost, adjustment_value (adjustment_quantity \* unit_cost), notes, created_at, updated_at, created_by (unique: year, month, material_id, product_line, COALESCE(variant_id::text, custom_description, 'default')). Closing stock is derived from cumulative opening + purchase_invoice_lines for the bucket + adjustment_quantity.

**Staff & Employees:**

- `staffs` - id (no whitespace allowed), name, telephone_no, email, gender, nationality, birthdate, address, job, location, date_joined, ic_no, bank_account_number, epf_no, income_tax_no, socso_no, document, payment_type, payment_preference, race, agama, date_resigned, password, updated_at, marital_status, spouse_employment_status, number_of_children, kwsp_number, department, head_staff_id (references staffs.id - for same-name staff, indicates who is the "Head" for location determination in salary reports)
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

- `pay_codes` - id, description, pay_type, rate_unit (constraint: Hour/Bill/Day/Bag/Trip/Fixed/Percent), rate_biasa, rate_ahad, rate_umum, is_active, requires_units_input, created_at, updated_at
- `employee_pay_codes` - id, employee_id, pay_code_id, is_default, override_rate_biasa, override_rate_ahad, override_rate_umum
- `monthly_payrolls` - id, year, month, status, created_at, updated_at, created_by
- `employee_payrolls` - id, monthly_payroll_id, employee_id, job_type, section, gross_pay, net_pay, status, created_at, employee_job_mapping, digenapkan, setelah_digenapkan
- `payroll_items` - id, employee_payroll_id, pay_code_id, description, rate, rate_unit, quantity, foc_units, amount, is_manual, created_at, job_type, source_employee_id, source_date, work_log_id, work_log_type
- `payroll_deductions` - id, employee_payroll_id, deduction_type, employee_amount, employer_amount, wage_amount, rate_info, created_at
- `mid_month_payrolls` - id, employee_id, year, month, amount, payment_method, status, created_at, updated_at, created_by, paid_at, notes
- `pinjam_records` - id, employee_id, year, month, amount, description, pinjam_type, created_by, created_at, updated_at
- `commission_records` - id, employee_id, commission_date, amount, description, created_by, created_at, updated_at, location_code (location 16-24 for commission entries, NULL for bonus)
- `others_records` - id, employee_id (FK staffs), record_date, pay_code_id (FK pay_codes), description, rate, rate_unit, quantity, amount, created_by, created_at, updated_at (Others (Kerja Luar OT) entries; entry uses pay_code+rate+quantity like Add Manual Item, then is added to gross pay and deducted as advance on the payslip — same flow as commission_records)

**Statutory Rates:**

- `epf_rates` - id, employee_type, wage_threshold, employee_rate_percentage, employer_rate_percentage, employer_fixed_amount, is_active, created_at, updated_at
- `socso_rates` - id, wage_from, wage_to, employee_rate, employer_rate, employer_rate_over_60, is_active, created_at, updated_at
- `sip_rates` - id, wage_from, wage_to, employee_rate, employer_rate, is_active, created_at, updated_at
- `income_tax_rates` - id, wage_from, wage_to, base_rate, unemployed_spouse_k0-k10, employed_spouse_k0-k10, is_active, created_at, updated_at

**Work Logs (Daily):**

- `daily_work_logs` - id, log_date, shift, day_type, context_data, status, created_at, updated_at, section
- `daily_work_log_entries` - id, work_log_id, employee_id, total_hours, job_id, is_on_leave, leave_type, following_salesman_id, muat_mee_bags, muat_bihun_bags, location_type, is_doubled (boolean, for SALESMAN_IKUT x2 doubling feature), force_ot_hours (numeric(4,2), forced overtime hours for BIHUN page)
- `daily_work_log_activities` - id, log_entry_id, pay_code_id, hours_applied, units_produced, rate_used, calculated_amount, is_manually_added, foc_units (FOC quantity from invoices, used for SALESMAN product activities)

**Work Logs (Monthly):**

- `monthly_work_logs` - id, log_month, log_year, section, context_data, status, created_at, updated_at
- `monthly_work_log_entries` - id, monthly_log_id, employee_id, job_id, total_hours (regular/Biasa hours), overtime_hours (regular/Biasa OT), ahad_hours (Ahad non-OT), ahad_overtime_hours (Ahad OT), umum_hours (Umum non-OT), umum_overtime_hours (Umum OT), created_at
- `monthly_work_log_activities` - id, monthly_entry_id, pay_code_id, description (stored activity variant label such as OT (Ahad)), hours_applied, units_produced, rate_used, calculated_amount, is_manually_added, created_at

**Leave Management:**

- `employee_leave_balances` - id, employee_id, year, cuti_umum_total, cuti_tahunan_total, cuti_sakit_total, cuti_rawatan_total (default 60, fixed for all employees - Hospital Leave), created_at, updated_at. NOTE: leave allowances and usage are aggregated by `staffs.name` across sibling IDs — the canonical row is tied to the senior sibling (earliest date_joined; tie-breaker: lowest id). Multi-ID employees share one entitlement bucket.
- `leave_records` - id, employee_id, leave_date, leave_type ('cuti_umum' | 'cuti_sakit' | 'cuti_tahunan' | 'cuti_rawatan'), work_log_id, days_taken, amount_paid, status, notes, created_by, created_at, updated_at
- `holiday_calendar` - id, holiday_date, description, is_active, is_cuti_umum (checked holidays count toward yearly Cuti Umum entitlement)

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
- `greentarget.monthly_work_log_activities` - id, monthly_entry_id, pay_code_id, hours_applied, units_produced, rate_used, calculated_amount, is_manually_added, created_at
- `greentarget.driver_trips` - id, driver_id, year, month, trip_count, completed_rental_ids, auto_calculated, notes, created_at, updated_at
- `greentarget.pickup_destinations` - id, code (unique), name, is_default, sort_order, is_active, created_at, updated_at (configurable pickup destination options: KILANG, MD, MENGGATAL)
- `greentarget.payroll_rules` - id, rule_type (PLACEMENT/PICKUP), condition_field, condition_operator, condition_value, secondary_condition_field, secondary_condition_operator, secondary_condition_value, pay_code_id, priority, is_active, description, created_at, updated_at
- `greentarget.rental_addons` - id, rental_id, pay_code_id, quantity, amount, notes, created_at, created_by (manual add-on paycodes per rental)
- `greentarget.addon_paycodes` - id, pay_code_id, display_name, default_amount, is_variable_amount, sort_order, is_active, created_at, updated_at (configuration for available add-on paycodes)
- `greentarget.payroll_settings` - id, setting_key (unique), setting_value, description, created_at, updated_at (global payroll settings)

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
