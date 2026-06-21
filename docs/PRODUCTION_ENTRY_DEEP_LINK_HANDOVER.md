# Production Entry Deep-Link Integration — Handover

**Date:** 2026-06-21
**Scope:** Linking production/packing payroll rows back to the Production Entry page, with worker-search pre-fill.
**Primary files:**
- [src/pages/Stock/ProductionEntryPage.tsx](../src/pages/Stock/ProductionEntryPage.tsx) — receives the deep link.
- [src/pages/Payroll/PayrollDetailsPage.tsx](../src/pages/Payroll/PayrollDetailsPage.tsx) — emits the deep link.

---

## 1. Why this exists

In the **Payroll Details** page (detailed view), every pay row now carries a clickable
date that opens the page where the underlying record was entered. Production / packing
pay (base packing + threshold bonuses) is derived from **production entries**, so those
rows link back to the **Production Entry** page.

Because the whole Payroll Details page is for a single employee, the link also carries
that employee's **name** so the Production Entry worker grid can land already filtered to
them — matching the `?search=` pre-fill convention used by the Bonus / Others / Commission
pages.

This was deliberately scoped to **date-only** precision (no product in the URL). Production
payroll items do not store a `product_id`; the base item only embeds it inside the
description string (`"<desc> - <productId>"`) and bonus items don't carry it at all. Parsing
that was judged too fragile, so the link opens the product-selection screen for the date and
the user picks the product.

---

## 2. The link (emitter side — PayrollDetailsPage)

Production payroll items become `PayrollItem`s during payroll processing with:
- `work_log_type`: `"production"` (base packing), `"production_bonus"` or `"prod_bonus_rosak"` (bonuses)
- `work_log_id`: **null** (production entries are not work logs)
- `source_date`: `YYYY-MM-DD`
- `source_employee_id`: the worker

The link is produced inside `getWorkLogUrl(item)`:

```ts
if (item.work_log_type?.startsWith("prod") && item.source_date) {
  return `/stock/production?date=${item.source_date}&search=${encodeURIComponent(
    payroll.employee_name || "",
  )}`;
}
```

- `startsWith("prod")` matches all three production types.
- `source_date` is already `YYYY-MM-DD`, exactly what the Production Entry page expects.
- `search` = the payroll's employee name.

The date cell only renders as a `<Link>` in the **detailed** view (`renderDetailedRow`); the
consolidated view aggregates items and has no date column, so no link there.

---

## 3. The receiver side — ProductionEntryPage

The page already read `date` and `product` from the URL on mount. Two things were added:

### 3a. Read `?search=` into the worker search

```ts
const getInitialSearch = (): string => {
  const params = new URLSearchParams(window.location.search);
  return params.get("search") || "";
};
...
const [workerSearchQuery, setWorkerSearchQuery] = useState(getInitialSearch);
```

### 3b. One-shot preservation across the first product selection (the important part)

The worker search box is **product-scoped** — it is only visible once a product is
selected, and `handleProductSelect` historically cleared the search every time the product
changed (`setWorkerSearchQuery("")`). For a date-only deep link the user lands on the
**product-selection screen** (no product yet, search box not visible), then clicks a product.
Without intervention, that click would wipe the pre-filled name before the grid ever shows it.

To fix this, a one-shot ref preserves the URL-provided search through the **first** product
selection only:

```ts
const preserveInitialWorkerSearchRef = useRef<boolean>(getInitialSearch() !== "");

const resetWorkerSearchOnProductChange = (): void => {
  if (preserveInitialWorkerSearchRef.current) {
    preserveInitialWorkerSearchRef.current = false; // consume once
    return;                                          // keep the pre-filled search
  }
  setWorkerSearchQuery("");                          // normal behaviour afterwards
};
```

All three `setWorkerSearchQuery("")` calls inside `handleProductSelect` (the HANCUR branch,
the BUNDLE branch, and the normal-product branch) were replaced with
`resetWorkerSearchOnProductChange()`.

**Net behaviour:**
1. Land on `/stock/production?date=X&search=Name` → product selection screen, `workerSearchQuery = "Name"`, ref = `true`.
2. User clicks a product → search **preserved**, ref flips to `false`. Worker grid renders filtered to "Name".
3. Any later product change → search clears as before.

The clear-button (×) on the search box still works at any time.

---

## 4. Edge cases & notes

- **Deep link already includes a product** (not produced by payroll today, but supported):
  the worker grid shows immediately with the search pre-filled; the ref is simply never consumed.
- **`handleSpecialSelect`** (the Back-to-selection / tab switches) does **not** clear the
  worker search and was left untouched.
- **Bonus rows** (`production_bonus`) can aggregate multiple products in a day and carry no
  product — they intentionally link date-only, same as base rows.
- **No URL write-back:** ProductionEntryPage reads the URL once on mount; navigating within
  the page (date navigator etc.) does not rewrite the query string, so `?search=` is consumed
  once and not persisted. This matches the other entry pages.
- **`work_log_type` typing:** the production values (`"production"`, etc.) were never in the
  old `"daily" | "monthly" | null` union. `PayrollItem.work_log_type` was widened to
  `string | null` in both the local interface in PayrollDetailsPage and the shared
  [src/types/types.ts](../src/types/types.ts) `PayrollItem`. All existing usages are equality
  comparisons or `null` assignments, so widening is safe.

---

## 5. Manual verification

1. `dev.bat`; open a payroll detail (detailed view) for an employee with packing production
   that month.
2. A base packing row and a threshold-bonus row should each have a **clickable date**.
3. Click it → lands on `/stock/production?date=<that date>&search=<employee name>`, showing
   the product-selection screen for that date.
4. Pick the product → the worker grid is **already filtered to that employee**.
5. Change to another product → the search clears (normal behaviour).
6. Confirm the date carried over correctly (no off-by-one — `source_date` is passed through
   as a plain `YYYY-MM-DD` string, not round-tripped through `Date`).

---

## 6. Related work (same change set)

This was the last piece of a broader pass that added source links to the Payroll Details
detailed view:
- Bonus / Insentif, Others (Kerja Luar OT), Cuti Tahunan rows link to their entry pages.
- IXT items entered via a daily/monthly **work log** link to that work log (via
  `getWorkLogUrl`), not the Bonus page.
- Bonus and Others (Advance) pages gained a search box that reads `?search=`.

See the 2026-06-21 entry in [src/components/ChangelogModal.tsx](../src/components/ChangelogModal.tsx).
