# Handover — scroll & filter preservation rollout

## Goal
Give data-heavy pages the same behaviour `src/pages/Accounting/JournalEntryListPage.tsx` already has:
returning to a list restores its **filters** (search, month/date range, pills, page) and its
**scroll position**.

## Infrastructure (already in place — reuse, don't reinvent)

- `src/hooks/useScrollRestoration.ts` — pre-existing. `useScrollRestoration(key, ready)`.
  `main` in `src/App.tsx:111` is the **only** scroll container in the app, so the default
  selector always works. `ready` must be true only once the list has actually rendered,
  otherwise `scrollTop` is clamped to 0 against an empty list.
- `src/hooks/usePersistedFilters.ts` — **new, created this session**. Exports:
  - `usePersistedFilters<T>(key, getDefaults, revive?)` — localStorage-backed state.
    `revive` rebuilds anything JSON can't represent (Dates!) and returns `null` to fall back
    to `getDefaults()`.
  - `reviveDate(value)` — ISO string → local `Date`, or `null`.
  - `usePersistedMonth(key)` — month normalised to the 1st, for the monthly reports.

## Conventions established (follow these)

1. **Storage keys**: `const FILTERS_STORAGE_KEY = "<page>List"` and
   `const SCROLL_RESTORATION_KEY = "<page>-list"` as module consts.
2. **Multi-company shared pages** get one key per company — never a shared cache.
   See `FILTERS_STORAGE_KEYS` / `SCROLL_RESTORATION_KEYS` maps in
   `AccountCodeListPage.tsx` and `TrialBalancePage.tsx`, or the `${paths.company}` prefix in
   `AdjustmentDocsListPage.tsx`.
3. **The page-reset trap** — many pages have
   `useEffect(() => setCurrentPage(1), [searchTerm, filters])`, which fires on mount and
   wipes the restored page number. Guard it with a ref so it only fires on a real change:
   ```tsx
   const filterSignature = `${a}|${b}`;
   const prevFilterSignatureRef = useRef<string | null>(null);
   useEffect(() => {
     if (prev !== null && prev !== filterSignature) setCurrentPage(1);
     prevFilterSignatureRef.current = filterSignature;
   }, [filterSignature]);
   ```
   Working examples: `AccountCodeListPage`, `CustomerPage`, `StaffPage`, `JobCategoryPage`,
   `TrialBalancePage` (debounced variant uses a boolean `searchSeenRef`).
4. When you replace `useState` with a derived setter over a persisted object, the setter takes
   a **plain value**, so convert any `setX(prev => prev + 1)` call sites (already done in
   `PayCodePage`, `JPPayCodePage`, `JobCategoryPage` pagination handlers).
5. CLAUDE.md rule 17 still applies: never slice an ISO string to get `yyyy-MM-dd`.

## Done (all typechecked clean with `npx tsc --noEmit`)

| Page | Added |
|---|---|
| `Payments/PaymentPage.tsx` | filters (had scroll already) |
| `JellyPolly/PaymentPage.tsx` | filters + scroll |
| `GreenTarget/Payments/GreenTargetPaymentPage.tsx` | filters + scroll |
| `JellyPolly/InvoiceListPage.tsx` | scroll (+ page-change scroll reset, mirrors TH) |
| `AdjustmentDocs/AdjustmentDocsListPage.tsx` (TH + JP) | filters + scroll, company-scoped |
| `GreenTarget/AdjustmentDocs/GTAdjustmentDocsListPage.tsx` | filters + scroll |
| `Accounting/AccountCodeListPage.tsx` (TH + GT) | filters incl. expanded tree nodes + page + scroll |
| `Accounting/BankInPage.tsx` | date-range filter + scroll |
| `Accounting/Purchases/GeneralPurchaseInvoiceListPage.tsx` | search term added to existing cache + scroll |
| `Accounting/Purchases/SupplierPaymentListPage.tsx` | filters + scroll |
| `Accounting/Purchases/SuppliersListPage.tsx` | filters + scroll |
| `Accounting/Reports/TrialBalancePage.tsx` (TH + GT) | month/search/ledger-type/hide-zero/page + scroll |
| `Accounting/Reports/BalanceSheetPage.tsx` (TH + GT) | month + scroll |
| `Accounting/Reports/IncomeStatementPage.tsx` (TH + GT) | month + scroll |
| `Accounting/Reports/CogmPage.tsx` | month + scroll |
| `Stock/Reports/EstimatedReportPage.tsx` (pl + unitCost views) | month + MEE/BIHUN line + scroll |
| `Catalogue/CustomerPage.tsx` | salesman + page + scroll (search was already in sessionStorage) |
| `Catalogue/StaffPage.tsx` / `JellyPolly/Catalogue/JPStaffPage.tsx` | search + filter menu + page + scroll |
| `Catalogue/ProductPage.tsx` | type filter + scroll |
| `Catalogue/JobCategoryPage.tsx` | section + search + page + scroll |
| `Catalogue/PayCodePage.tsx` / `JPPayCodePage.tsx` | type/job/search/page + scroll |
| `GreenTarget/Customers/CustomerListPage.tsx` | signup tab + search + inactive toggle + scroll |
| `GreenTarget/Dumpsters/DumpsterListPage.tsx` | search/status/month/page + scroll |

Already had scroll restoration before this session (left alone):
`Invoice/InvoiceListPage`, `GreenTarget/Invoices/InvoiceListPage`,
`GreenTarget/Rentals/RentalListPage`, `Accounting/Reports/AccountLedgerPage`,
`Accounting/DebtorsReportPage`, `Accounting/JournalEntryListPage`, `Payroll/PayrollPage`,
`Payroll/PayrollDetailsPage`, `GreenTarget/Payroll/GTPayrollDetailsPage`.

## Remaining — TODO

### 1. Payroll lists & reports
- `Payroll/DailyLog/DailyLogListPage.tsx` and `JellyPolly/Payroll/JPDailyLogListPage.tsx`
  — both already cache a date range in localStorage (`dateRangeCacheKey`); they need
  **scroll restoration only**.
- `Payroll/MonthlyLog/MonthlyLogListPage.tsx`, `JellyPolly/Payroll/JPMonthlyLogListPage.tsx`
- `Payroll/SalaryReportPage.tsx`, `GreenTarget/Payroll/GTSalaryReportPage.tsx`,
  `JellyPolly/Payroll/JPSalaryReportPage.tsx` — long reports; persist month + any
  location/section filter, add scroll.
- `GreenTarget/Payroll/GTPayrollPage.tsx` — caches recency but has **no** scroll restoration
  (TH `PayrollPage.tsx` does; copy its call).
- Add-on lists (persist month + scroll), TH / GT / JP triplets:
  `Payroll/AddOn/{BonusPage,MidMonthPayrollPage,OthersAdvancePage,OthersKerjaLuarOtPage,PinjamListPage}.tsx`
  + `GreenTarget/Payroll/GT*` + `JellyPolly/Payroll/JP*` equivalents.
- Leave: `Payroll/Leave/{CutiManagementPage,CutiReportPage,HolidayCalendarPage}.tsx`,
  `JellyPolly/Catalogue/{JPCutiManagementPage,JPCutiReportPage}.tsx`,
  `GreenTarget/Payroll/GTCutiReportPage.tsx`.
- Statutory: `Payroll/Statutory/{ContributionRatesPage,ECarumanPage}.tsx`,
  `GTECarumanPage.tsx`, `JPECarumanPage.tsx`.
- `GreenTarget/Payroll/PayrollRulesPage.tsx`.

### 2. Stock & sales
- `Stock/ProductionListPage.tsx`, `Stock/ProductStockMovementPage.tsx`
- `Stock/Materials/{MaterialsListPage,MaterialStockPage,GeneralStockPage}.tsx`
  (`MaterialStockPage` / `StockAdjustmentEntryPage` already cache the selected month and tab
  — those two need scroll only.)
- `Sales/{SalesSummaryPage,SalesByProductsPage,SalesBySalesmanPage,JellyPollySalesSummaryPage}.tsx`

### 3. Lower priority / judgement call
- `Catalogue/{StaffRecords,OthersPage,LocationPage}.tsx`, `JellyPolly/Catalogue/JPLocationPage.tsx`
- `Accounting/LocationAccountMappingsPage.tsx`
- `Catalogue/JobPage.tsx` / `JellyPolly/Catalogue/JPJobPage.tsx` — their `currentPage` is a
  pay-code sub-list *inside* a selected job, not a list filter. I deliberately skipped these;
  reassess whether persisting the selected job is actually useful.
- `Accounting/VoucherGeneratorPage.tsx` (month already cached) and
  `GreenTarget/Accounting/GTVoucherGeneratorPage.tsx`.

## Changelog
A single entry dated `2026-07-30` is **already prepended** to `CHANGELOG_ENTRIES` in
`src/components/ChangelogModal.tsx` listing the pages covered so far (both `ms` and `en`).
**Extend that entry's page list** as you finish the rest — do not add a second entry for the
same feature.

## Verification
`npx tsc --noEmit -p tsconfig.json` was clean at handover. Do not run `npm run build` or lint
unless the user asks (CLAUDE.md rule 10). Note several files unrelated to this task were
already modified in the working tree before this session (form pages, entry pages,
`GreenTargetPaymentTable.tsx`) — leave them alone.
