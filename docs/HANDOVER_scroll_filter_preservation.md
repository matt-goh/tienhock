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
- `src/hooks/usePersistedFilters.ts`. Exports:
  - `usePersistedFilters<T>(key, getDefaults, revive?)` — localStorage-backed state.
    `revive` rebuilds anything JSON can't represent (Dates!) and returns `null` to fall back
    to `getDefaults()`. The returned setter is a full React dispatch, so `setX(prev => …)`
    call sites keep working.
  - `reviveDate(value)` — ISO string → local `Date`, or `null`.
  - `usePersistedMonth(key)` — month normalised to the 1st, for the monthly reports.
  - `usePersistedDate(key, getDefault)` — day-granularity date picker.
  - `usePersistedNumber(key, min, max, getDefault)` / `usePersistedSearch(key)` — the plain
    single-value cases (year/month numbers, tab indices, search boxes).
  - `usePersistedUrlNumber(key, param, min, max, getDefault)` /
    `usePersistedUrlSearch(key)` — same, but a query param on the **current URL wins on
    mount**. Needed by every payroll add-on list, because `PayrollDetailsPage` /
    `GTPayrollDetailsPage` / `JPPayrollDetailsPage` deep-link into them with
    `?year=&month=&search=` and that link must beat the cached value.

  `JSON.stringify` cannot represent a `Set` (it serialises to `{}`), so never hand one to
  `usePersistedFilters` — persist a `string[]` and derive the Set, as
  `AccountCodeListPage` does.

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
   `PayCodePage`, `JPPayCodePage`, `JobCategoryPage` pagination handlers). The single-value
   hooks above don't have this problem — they return the real dispatch.
5. CLAUDE.md rule 17 still applies: never slice an ISO string to get `yyyy-MM-dd`.
6. **`ready` must be data-dependent, not just `!isLoading`.** Several pages initialise
   `isLoading` to `false`, so `!isLoading` is true at mount and the restore clamps to 0
   against an empty page. Use `!isLoading && rows.length > 0` (or `!== null` on the payload).
7. **One component, several routes** → scope every key by the props that distinguish the
   instances, or the routes fight over one cache. See `storageScope` in
   `ProductionListPage` (6 routes), `ProductStockMovementPage` (TH + JP), the `scope` suffix
   in `SalesSummaryPage`/`SalesByProductsPage`/`SalesBySalesmanPage`, the `jobType` suffix on
   the work-log lists, and `config.debtorsEndpoint` in `DebtorsReportPage`.
8. Don't persist state that a `useEffect` recomputes from freshly fetched data — it gets
   overwritten on the next load, so the cache is dead weight. Both Kerja Luar OT pages
   re-expand every employee group after each fetch, so their expansion is deliberately
   **not** persisted.
9. Pages whose whole body is an internal `overflow-y-auto` box need an `id` on that box and
   the selector passed as the hook's 3rd argument — `main` never scrolls there. See
   `#monthly-log-list-scroll` / `#jp-monthly-log-list-scroll`.

## Done (all typechecked clean with `npx tsc --noEmit`)

### Session 2 (payroll, stock, sales, catalogue leftovers)

| Page | Added |
|---|---|
| `Payroll/DailyLog/DailyLogListPage.tsx` / `JellyPolly/Payroll/JPDailyLogListPage.tsx` | scroll (date range was already cached); key suffixed with `jobType` |
| `Payroll/MonthlyLog/MonthlyLogListPage.tsx` / `JPMonthlyLogListPage.tsx` | year/month/status filters + scroll on the inner `overflow-y-auto` box |
| `Payroll/SalaryReportPage.tsx` | scroll + Employee/Annual sub-view toggles (month & tab were already cached via `payrollPageStorage`) |
| `GreenTarget/Payroll/GTSalaryReportPage.tsx` / `JellyPolly/Payroll/JPSalaryReportPage.tsx` | tab + annual view + pinjam view + year + month + scroll |
| `GreenTarget/Payroll/GTPayrollPage.tsx` | replaced its hand-rolled scroll effect with `useScrollRestoration` (same storage key) |
| `JellyPolly/Payroll/JPPayrollPage.tsx` | scroll, keyed by year-month (it had none; TH/GT did) |
| `Payroll/AddOn/BonusPage.tsx` + `GTBonusPage` + `JPBonusPage` | year/month/search now persisted (URL still wins) + scroll |
| `Payroll/AddOn/OthersAdvancePage.tsx` + GT + JP | same |
| `Payroll/AddOn/OthersKerjaLuarOtPage.tsx` + GT + JP | same, plus the employee and pay-code filters |
| `Payroll/AddOn/MidMonthPayrollPage.tsx` + GT + JP | same, plus the Summary/Pinjam sub-view |
| `Payroll/AddOn/PinjamListPage.tsx` + GT + JP | same |
| `Payroll/Leave/CutiReportPage.tsx` / `JPCutiReportPage` / `GTCutiReportPage` | search + scroll |
| `Payroll/Leave/HolidayCalendarPage.tsx` | year + scroll |
| `Payroll/Leave/CutiManagementPage.tsx` / `JPCutiManagementPage.tsx` | active tab (via `Tab`'s `defaultActiveTab`/`onTabChange`) |
| `Payroll/Statutory/ContributionRatesPage.tsx` | tab (`?tab=` still wins) + scroll |
| `Payroll/Statutory/ECarumanPage.tsx` / `GTECarumanPage` / `JPECarumanPage` | month + year |
| `GreenTarget/Payroll/PayrollRulesPage.tsx` | tab + search + scroll |
| `Stock/ProductionListPage.tsx` (6 routes) | view mode + day/month/year + product + search + scroll, all scoped per route |
| `Stock/ProductStockMovementPage.tsx` (TH + JP) | product + view type + month + custom range + scroll, scoped per company |
| `Stock/Materials/MaterialsListPage.tsx` | search + category + show-inactive + scroll |
| `Sales/SalesSummaryPage.tsx` (+ `JellyPollySalesSummaryPage`) | active tab, scoped per company |
| `Sales/SalesByProductsPage.tsx` / `SalesBySalesmanPage.tsx` | month + date range + scroll, scoped per company |
| `Catalogue/StaffRecords.tsx` | scroll |
| `Catalogue/OthersPage.tsx` | scroll |
| `Catalogue/LocationPage.tsx` / `JellyPolly/Catalogue/JPLocationPage.tsx` | search + scroll |
| `Accounting/LocationAccountMappingsPage.tsx` | search + JVDR/JVSL tab + scroll |
| `Accounting/VoucherGeneratorPage.tsx` | scroll (month was already cached) |
| `GreenTarget/Accounting/GTVoucherGeneratorPage.tsx` | month + scroll |

### Session 1

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

Already had it, left alone: `Invoice/InvoiceListPage`,
`GreenTarget/Invoices/InvoiceListPage`, `GreenTarget/Rentals/RentalListPage`,
`Accounting/Reports/AccountLedgerPage`, `Accounting/JournalEntryListPage`,
`Payroll/PayrollPage`, `Payroll/PayrollDetailsPage`,
`GreenTarget/Payroll/GTPayrollDetailsPage`, plus two already fully covered and re-verified
this session:
- `Accounting/DebtorsReportPage` — search / expansion / view mode / hide-zero / page /
  month / scroll, all keyed by `config.debtorsEndpoint`, so the TH, GT and JP wrappers
  already have separate caches.
- `Stock/Materials/StockAdjustmentEntryPage` — month, tab and scroll, keyed by `mode`.
  `MaterialStockPage` and `GeneralStockPage` are thin wrappers over it, so both are done.

## Remaining — deliberately not done

- `Catalogue/JobPage.tsx` / `JellyPolly/Catalogue/JPJobPage.tsx`. Reassessed and skipped
  again: the selected job is already round-tripped through the URL (`?id=…`, read back on
  mount), and `currentPage` is a pay-code sub-list *inside* the selected job, not a list
  filter. Scroll restoration is the only thing left to add, and one key would have to serve
  two very different views (the job card grid and a selected job's pay-code table) because
  `selectedJob` is still `null` on the first render — so a deep scroll in the pay-code table
  would be replayed onto the card grid. Not worth it.
- Form / detail / entry pages generally. They are destinations, not lists.

## Changelog
A single entry dated `2026-07-30` in `CHANGELOG_ENTRIES`
(`src/components/ChangelogModal.tsx`) covers this whole feature and its page list has been
extended with the session-2 pages, in both `ms` and `en`. If more pages are ever added,
**extend that same entry** — do not add a second entry for the same feature.

## Verification
`npx tsc --noEmit -p tsconfig.json` clean. `npm run build` and lint were not run
(CLAUDE.md rule 10).
