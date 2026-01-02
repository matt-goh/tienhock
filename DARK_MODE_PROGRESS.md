# Dark Mode Implementation Progress

## Summary
Systematic dark mode implementation for all pages in the Tien Hock ERP system.

## Dark Mode Pattern Reference

### Standard CSS Classes to Apply:

**Backgrounds:**
- `bg-white` → `bg-white dark:bg-gray-800`
- `bg-gray-50` → `bg-gray-50 dark:bg-gray-900`
- `bg-default-100` → `bg-default-100 dark:bg-gray-800`
- `bg-default-50` → `bg-default-50 dark:bg-gray-900/50`

**Text:**
- `text-default-900` → `text-default-900 dark:text-gray-100`
- `text-default-800` → `text-default-800 dark:text-gray-100`
- `text-default-700` → `text-default-700 dark:text-gray-200`
- `text-default-600` → `text-default-600 dark:text-gray-300`
- `text-default-500` → `text-default-500 dark:text-gray-400`

**Borders:**
- `border-default-200` → `border-default-200 dark:border-gray-700`
- `border-default-300` → `border-default-300 dark:border-gray-600`
- `divide-default-200` → `divide-default-200 dark:divide-gray-700`

**Inputs:**
- `bg-white` → `bg-white dark:bg-gray-700`
- Add `text-default-900 dark:text-gray-100`
- Add `border-default-300 dark:border-gray-600`
- Add `disabled:bg-default-100 dark:disabled:bg-gray-800`
- Add `placeholder:text-default-400 dark:placeholder:text-gray-400`

**Hover States:**
- `hover:bg-default-50` → `hover:bg-default-50 dark:hover:bg-gray-700`
- `hover:bg-gray-50` → `hover:bg-gray-50 dark:hover:bg-gray-700`

**Icon/Button Colors:**
- `text-sky-600 hover:text-sky-800` → `text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300`
- `text-rose-600 hover:text-rose-800` → `text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300`

**Dropdown/Listbox:**
- Add `dark:bg-gray-800` to options containers
- Add `dark:bg-gray-700` to buttons
- Active states: `bg-sky-100 dark:bg-sky-900`

## Completed Files ✅

### Catalogue (10/10) ✅ COMPLETE
- [x] CustomerFormPage.tsx - Fully updated with dark mode
- [x] CustomerAddPage.tsx - Fully updated with dark mode
- [x] JobCategoryPage.tsx - Fully updated with dark mode
- [x] ProductPage.tsx - Main elements updated
- [x] JobPage.tsx - Fully updated with dark mode
- [x] PayCodePage.tsx - Fully updated with dark mode
- [x] StaffPage.tsx - Fully updated with dark mode
- [x] TaxPage.tsx - Fully updated with dark mode
- [x] StaffFormPage.tsx - Fully updated with dark mode
- [x] StaffAddPage.tsx - Fully updated with dark mode

### Core Components (Completed)
- [x] App.tsx
- [x] Button.tsx
- [x] ConfirmationDialog.tsx
- [x] FormComponents.tsx
- [x] LoadingSpinner.tsx
- [x] BackButton.tsx
- [x] ToolTip.tsx
- [x] MonthNavigator.tsx
- [x] StatusIndicator.tsx
- [x] Tab.tsx
- [x] Navbar/Navbar.tsx
- [x] Navbar/NavbarMenu.tsx
- [x] Navbar/NavbarDropdown.tsx
- [x] Navbar/NavbarBookmarks.tsx
- [x] Navbar/NavbarUserMenu.tsx
- [x] CompanySwitcher.tsx
- [x] Table/Table.tsx
- [x] Table/TableEditableCell.tsx
- [x] Table/TableHeader.tsx
- [x] Table/TablePagination.tsx
- [x] All 38 Modal components (BackupModal, LocationFormModal, JobCategoryModal, etc.)
- [x] All 6 Tooltip components (CustomersUsingProductTooltip, JobsAndEmployeesUsingPayCodeTooltip, etc.)
- [x] Invoice/InvoiceGrid.tsx - Background fixed for consistency
- [x] Invoice/InvoiceCard.tsx - Reference standard for selection rings and dark mode
- [x] Stock/WorkerEntryGrid.tsx - Comprehensive dark mode update
- [x] index.css
- [x] tailwind.config.js
- [x] src/contexts/ThemeContext.tsx (NEW)

### Components Needing Dark Mode (Priority Order)

**High Priority - Frequently Used:**
- [ ] StyledListbox.tsx - Used throughout the app for dropdowns
- [ ] YearNavigator.tsx - Companion to MonthNavigator
- [ ] DateNavigator.tsx - Date selection component
- [ ] DateRangePicker.tsx - Date range selection
- [ ] Checkbox.tsx - Checkbox component
- [ ] SafeLink.tsx - Link wrapper component

**Invoice Components:**
- [ ] Invoice/InvoiceHeader.tsx
- [ ] Invoice/InvoiceTotals.tsx
- [ ] Invoice/CustomerCombobox.tsx
- [ ] Invoice/MultiCustomerCombobox.tsx
- [ ] Invoice/InvoiceSelectionTable.tsx
- [ ] Invoice/PaymentForm.tsx
- [ ] Invoice/PaymentTable.tsx
- [ ] Invoice/LineItemsTable.tsx
- [ ] Invoice/InvoiceFilterMenu.tsx
- [ ] Invoice/Pagination.tsx
- [ ] Invoice/InvoiceDailyPrintMenu.tsx

**Payroll Components:**
- [ ] Payroll/ContextLinkedBadge.tsx
- [ ] Payroll/ContextLinkMessages.tsx
- [ ] Payroll/FinalizePayrollDialog.tsx
- [ ] Payroll/LoadingOverlay.tsx
- [ ] Payroll/DynamicContextForm.tsx
- [ ] Payroll/MissingIncomeTaxRatesDialog.tsx
- [ ] Payroll/MissingEPFNumberDialog.tsx
- [ ] Payroll/PayrollJobGroupTable.tsx
- [ ] Payroll/PayrollUnifiedTable.tsx
- [ ] Payroll/EmployeePayrollTableRow.tsx
- [ ] Payroll/ContributionRates/EPFRatesTab.tsx
- [ ] Payroll/ContributionRates/IncomeTaxRatesTab.tsx
- [ ] Payroll/ContributionRates/SIPRatesTab.tsx
- [ ] Payroll/ContributionRates/SOCSORatesTab.tsx

**Catalogue Components:**
- [ ] Catalogue/CustomerCard.tsx
- [ ] Catalogue/SelectedTagsDisplay.tsx
- [ ] Catalogue/CustomerProductsTab.tsx
- [ ] Catalogue/StaffFilterMenu.tsx

**Stock Components:**
- [ ] Stock/ProductSelector.tsx
- [ ] Stock/StockMovementTable.tsx

**GreenTarget Components:**
- [ ] GreenTarget/GreenTargetInvoiceSelectionTable.tsx
- [ ] GreenTarget/GreenTargetPaymentTable.tsx
- [ ] GreenTarget/GreenTargetPaymentForm.tsx
- [ ] GreenTarget/AssociatedInvoiceDisplay.tsx

**JellyPolly Components:**
- [ ] JellyPolly/InvoiceDailyPrintMenu.tsx

**Table Components:**
- [ ] Table/DeleteButton.tsx
- [ ] Table/ColumnResizer.tsx

**Navbar Components:**
- [ ] Navbar/NavbarMobileMenu.tsx

**Other Components:**
- [ ] Auth/ProtectedRoute.tsx

## Files Requiring Dark Mode Update 📝

### Priority 1: Catalogue Pages ✅ COMPLETE (10/10)
- [x] JobPage.tsx
- [x] PayCodePage.tsx
- [x] StaffPage.tsx
- [x] TaxPage.tsx
- [x] StaffFormPage.tsx
- [x] StaffAddPage.tsx

### Priority 2: Invoice Pages ✅ COMPLETE (5/5)
- [x] Invoice/InvoiceListPage.tsx - Fully updated with dark mode (search, filters, batch actions, loading states)
- [x] Invoice/InvoiceFormPage.tsx - Fully updated with dark mode (headers, sections, checkboxes)
- [x] Invoice/InvoiceDetailsPage.tsx - Fully updated with dark mode (status badges, edit buttons, payment form, sections)
- [x] Auth/Login.tsx - Fully updated with dark mode
- [x] HomePage.tsx - Fully updated with dark mode

### Priority 3: Payment Pages ✅ COMPLETE (3/3)
- [x] Payments/PaymentPage.tsx - Fully updated with dark mode (search, filters, borders)
- [x] JellyPolly/PaymentPage.tsx - Fully updated with dark mode (search, month selector, filters)
- [x] GreenTarget/Payments/GreenTargetPaymentPage.tsx - Fully updated with dark mode (search, month selector, filters)

### Priority 4: Sales Pages ✅ COMPLETE (3/3)
- [x] Sales/SalesSummaryPage.tsx - Fully updated with dark mode
- [x] Sales/SalesBySalesmanPage.tsx - Comprehensive dark mode (summary cards, tables, charts)
- [x] Sales/SalesByProductsPage.tsx - Comprehensive dark mode (summary cards, tables, charts)

### Priority 5: Stock Pages ✅ COMPLETE (3/3)
- [x] Stock/StockMovementPage.tsx - Comprehensive dark mode (summary, views, favorites, tables)
- [x] Stock/StockAdjustmentEntryPage.tsx - Comprehensive dark mode (references, tabs, product tables, input fields)
- [x] Stock/ProductionEntryPage.tsx - Fully updated with dark mode (date selector, product badges, favorites)

### Priority 6: Payroll Pages ✅ COMPLETE (21/21 files - 100%)
**All Completed (21/21):**
- [x] Payroll/PayrollPage.tsx - Comprehensive dark mode update
- [x] Payroll/PayrollDetailsPage.tsx - Comprehensive dark mode update (large file with all payroll items)
- [x] Payroll/SalaryReportPage.tsx - Comprehensive dark mode update
- [x] Payroll/AddOn/MidMonthPayrollPage.tsx - Comprehensive dark mode update
- [x] Payroll/AddOn/IncentivesPage.tsx - Comprehensive dark mode update
- [x] Payroll/AddOn/PinjamListPage.tsx - Comprehensive dark mode with selection ring colors
- [x] Payroll/DailyLog/DailyLogListPage.tsx - Comprehensive dark mode update
- [x] Payroll/DailyLog/DailyLogEntryPage.tsx - Comprehensive dark mode (4078 lines - large file)
- [x] Payroll/DailyLog/DailyLogEditPage.tsx - Simple wrapper, dark mode added
- [x] Payroll/DailyLog/DailyLogDetailsPage.tsx - Comprehensive dark mode with day types, status badges, tables
- [x] Payroll/MonthlyLog/MonthlyLogListPage.tsx - Comprehensive dark mode (status badges, filters, action buttons, empty states)
- [x] Payroll/MonthlyLog/MonthlyLogEntryPage.tsx - Comprehensive dark mode (leave badges, modals, bulk selections, dividers)
- [x] Payroll/MonthlyLog/MonthlyLogDetailsPage.tsx - Comprehensive dark mode (section headers, stats, tables, badges, footers)
- [x] Payroll/MonthlyLog/MonthlyLogEditPage.tsx - Simple wrapper (already had dark mode on error message)
- [x] Payroll/Leave/CutiManagementPage.tsx - Simple wrapper with tabs (already had dark mode)
- [x] Payroll/Leave/CutiReportPage.tsx - Comprehensive dark mode (employee cards, search, leave balances, monthly tables with color-coded sections, PDF generation)
- [x] Payroll/Leave/HolidayCalendarPage.tsx - Comprehensive dark mode (year navigation, table, import functionality)
- [x] Payroll/Settings/LocationAccountMappingsPage.tsx - Comprehensive dark mode (tabs, search, filters, listbox, table, status badges, modal)
- [x] Payroll/Settings/JobLocationMappingsPage.tsx - Comprehensive dark mode (tabs, warning box, search, filters, listbox, table, conditional styling)
- [x] Payroll/Statutory/ContributionRatesPage.tsx - Simple wrapper with tabs (already had complete dark mode)
- [x] Payroll/Statutory/ECarumanPage.tsx - Comprehensive dark mode (contribution cards with hover tooltips, period selection, preview tables for EPF/SOCSO/SIP/Income Tax)

### Priority 7: GreenTarget Pages (10+ files)
- [ ] GreenTarget/GreenTargetDashboardPage.tsx
- [ ] GreenTarget/DebtorsReportPage.tsx
- [ ] GreenTarget/Customers/CustomerListPage.tsx
- [ ] GreenTarget/Customers/CustomerFormPage.tsx
- [ ] GreenTarget/Dumpsters/DumpsterListPage.tsx
- [ ] GreenTarget/Dumpsters/DumpsterFormPage.tsx
- [ ] GreenTarget/Rentals/RentalListPage.tsx
- [ ] GreenTarget/Rentals/RentalFormPage.tsx
- [ ] GreenTarget/Rentals/DeliveryOrderPage.tsx
- [ ] GreenTarget/Invoices/InvoiceListPage.tsx
- [ ] GreenTarget/Invoices/InvoiceFormPage.tsx
- [ ] GreenTarget/Invoices/InvoiceDetailsPage.tsx

### Priority 8: JellyPolly Pages (5+ files)
- [ ] JellyPolly/InvoiceListPage.tsx
- [ ] JellyPolly/InvoiceFormPage.tsx
- [ ] JellyPolly/InvoiceDetailsPage.tsx
- [ ] JellyPolly/DebtorsReportPage.tsx

### Priority 9: Accounting Pages (7 files)
- [ ] Accounting/AccountCodeListPage.tsx
- [ ] Accounting/AccountCodeFormPage.tsx
- [ ] Accounting/JournalEntryPage.tsx
- [ ] Accounting/JournalEntryListPage.tsx
- [ ] Accounting/DebtorsReportPage.tsx
- [ ] Accounting/VoucherGeneratorPage.tsx

### Priority 10: Additional Catalogue Pages (3 files)
- [ ] Catalogue/BasicPage.tsx
- [ ] Catalogue/CustomerPage.tsx
- [ ] Catalogue/StaffRecords.tsx

## Implementation Notes

### For Each File:
1. Search for `className=` containing background colors
2. Add `dark:` variants for all color-related classes
3. Pay special attention to:
   - Table headers and rows
   - Input fields
   - Buttons and interactive elements
   - Borders and dividers
   - Text colors (especially headings)
   - Hover states
   - Loading overlays
   - Modal/dialog backgrounds

### Common Patterns:

**Table Pattern:**
```tsx
<table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
  <thead className="bg-default-100 dark:bg-gray-800">
    <tr>
      <th className="px-4 py-3 text-default-600 dark:text-gray-300">
        Header
      </th>
    </tr>
  </thead>
  <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
    <tr className="hover:bg-default-50 dark:hover:bg-gray-700">
      <td className="text-default-700 dark:text-gray-200">
        Content
      </td>
    </tr>
  </tbody>
</table>
```

**Card Pattern:**
```tsx
<div className="bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg shadow-sm">
  <div className="border-b border-default-200 dark:border-gray-700 px-6 py-4">
    <h2 className="text-default-900 dark:text-gray-100">Title</h2>
  </div>
  <div className="p-6">
    <p className="text-default-700 dark:text-gray-200">Content</p>
  </div>
</div>
```

**Search Input Pattern:**
```tsx
<input
  type="text"
  className="rounded-full border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400"
  placeholder="Search..."
/>
```

## Testing Checklist
- [ ] All text is readable in dark mode
- [ ] No white flash on page transitions
- [ ] Borders are visible but not too bright
- [ ] Hover states work properly
- [ ] Input fields are clearly distinguishable
- [ ] Modals/dialogs have proper dark backgrounds
- [ ] Tables are readable with proper contrast
- [ ] Icons are visible
- [ ] Loading states are visible
- [ ] Status badges have appropriate colors

## Total Progress

### Components:
- **Completed:** ~30 core components (Button, Table, Navbar, Modals, Tooltips, etc.)
- **Remaining:** ~50 feature-specific components (Invoice, Payroll, Catalogue, Stock, etc.)
- **Status:** Core UI components complete, feature components in progress

### Pages:
- **Completed:** 45 pages
  - Catalogue: 10/10 ✅
  - Invoice: 5/5 ✅
  - Payment: 3/3 ✅
  - Sales: 3/3 ✅
  - Stock: 3/3 ✅
  - Payroll: 21/21 ✅
- **Remaining:** ~39 pages
  - GreenTarget: 12+ pages
  - JellyPolly: 5+ pages
  - Accounting: 7 pages
  - Additional Catalogue: 3 pages

### Overall Status:
✅ **Core Infrastructure:** Complete (ThemeContext, base components, styling)
✅ **Catalogue Section:** Complete (10/10 pages)
✅ **Invoice Section:** Complete (5/5 pages)
✅ **Payment Section:** Complete (3/3 pages)
✅ **Sales Section:** Complete (3/3 pages)
✅ **Stock Section:** Complete (3/3 pages)
✅ **Payroll Section:** Complete (21/21 pages - 100% complete)
📝 **Components:** High-priority shared components done, feature components pending
🔜 **Next:** GreenTarget pages (12+ files), JellyPolly pages (5+ files), Accounting pages (7 files)

## Next Steps
1. ~~Complete remaining Catalogue pages~~ ✅ DONE
2. ~~Update all Invoice pages~~ ✅ COMPLETE
3. ~~Update Payment pages~~ ✅ COMPLETE
4. ~~Update Sales pages~~ ✅ COMPLETE
5. ~~Update Stock pages~~ ✅ COMPLETE
6. ~~Complete remaining Payroll pages~~ ✅ COMPLETE (21/21)
   - ~~MonthlyLog section~~ ✅ COMPLETE
   - ~~Leave section~~ ✅ COMPLETE
   - ~~Settings section~~ ✅ COMPLETE
   - ~~Statutory section~~ ✅ COMPLETE (ContributionRatesPage.tsx, ECarumanPage.tsx)
7. Update high-priority shared components (StyledListbox, YearNavigator, DateNavigator, etc.)
8. Update GreenTarget pages (12+ files)
9. Update JellyPolly pages (5+ files)
10. Update Accounting pages (7 files)
11. Update remaining feature-specific components
12. Final testing and adjustments

## Notes for Continuation
- **Current Focus:** All Payroll pages are now complete! ✅ (21/21 files - 100%)
- **MonthlyLog Section:** ✅ Complete (all 4 files)
- **Leave Section:** ✅ Complete (CutiManagementPage, CutiReportPage with color-coded sections, HolidayCalendarPage)
- **Settings Section:** ✅ Complete (LocationAccountMappingsPage, JobLocationMappingsPage with comprehensive dark mode)
- **Statutory Section:** ✅ Complete (ContributionRatesPage wrapper, ECarumanPage with contribution cards and preview tooltips)
- **Recent Completions:** ContributionRatesPage (simple tabs wrapper), ECarumanPage (contribution cards for EPF/SOCSO/SIP/Income Tax with hover tooltips, preview tables, period selection)
- **Major Milestone:** First 6 page sections complete (45 pages total) - Catalogue, Invoice, Payment, Sales, Stock, and Payroll all done!
- **Pattern Reference:** Use [InvoiceCard.tsx](src/components/Invoice/InvoiceCard.tsx) as the standard for selection rings (`ring-blue-500 dark:ring-blue-400`)
- **Next Focus:** Move to GreenTarget pages (12+ files), then JellyPolly (5+ files), then Accounting (7 files)
