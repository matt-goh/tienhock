# Handover — Replacing dropdowns with pill selectors (`PillSelect`)

**Date:** 2026-08-02
**Status:** shared component built and 3 places converted. The rest of this doc is a
surveyed backlog — nothing below the "Done" section has been touched.

---

## 1. What already exists

### `src/components/PillSelect.tsx` (new)

Single-select pill row. Styled to match the Journal Entries filter pills
(`src/pages/Accounting/JournalEntryListPage.tsx:599-620`) but behaves as a **radio
group**, not a toggle: one option is always selected and clicking the active pill is a
no-op (it cannot be turned off).

```tsx
import PillSelect, { PillSelectOption } from "../../components/PillSelect";

const OPTIONS: ReadonlyArray<PillSelectOption<LeaveType>> = [
  { value: "cuti_sakit", label: "Cuti Sakit" },
  // { value, label, title?, disabled? }
];

<PillSelect<LeaveType>
  value={leaveType}
  onChange={(value: LeaveType) => setLeaveType(value)}
  options={OPTIONS}
  disabled={isSaving}
  ariaLabel="Leave type"
  className="min-h-[38px]"   // optional; helps align with adjacent inputs
/>;
```

Props: `value`, `onChange`, `options`, `disabled?`, `ariaLabel?`, `className?`.
`title` renders as a hover tooltip (used for abbreviations like `TGA`); a per-option
`disabled` keeps an inherited-but-unselectable value visible.

### Done so far

| File | What changed |
| --- | --- |
| `src/components/GreenTarget/GTRevenueSplitEditor.tsx:289` | Revenue account `<select>` → `TGA` / `TGB` / `WS_OTH` pills (full description on hover). Feeds the GT invoice form, the Dumpster/rental quick-create modal and the GT Credit/Debit Note form. |
| `src/pages/Payroll/Leave/PackingCutiEntryPage.tsx` | Bulk leave type (~L483) and per-worker leave type in the table (~L615). |
| `src/pages/JellyPolly/Payroll/JPPackingCutiEntryPage.tsx` | Same two (L481, L613). The per-row `anchor="bottom start"` portal workaround was removed — pills cannot be clipped by the table's scroll container. |

Changelog entry added under `2026-08-02` in `src/components/ChangelogModal.tsx`.

---

## 2. Selection criteria used

Convert when **all** of these hold:

1. **≤ 5 options**, and the set is static/enumerable (not fetched master data).
2. Labels are short (≈ ≤ 14 chars) so the row does not wrap awkwardly.
3. Seeing all options at once is genuinely useful — entry screens, per-row table
   fields, quick filters.

Do **not** convert: master-data pickers (products, customers, staff, accounts,
nationality/race/bank/job), month/year pickers, or anything with a search box. Those
stay `FormListbox` / `FormCombobox`.

Scale of the survey: **75 `<FormListbox>` across 44 files**, **9 raw `<select>` across
9 files**. Everything worth converting is listed below; everything not listed was
checked and rejected by the criteria above.

---

## 3. Backlog — Tier 1 (direct analogues of the work already done)

Counts marked ✔ were read from the source; the rest are noted as "verify".

### 3.1 Leave type — same field, other pages

| File | Line | Notes |
| --- | --- | --- |
| `src/pages/GreenTarget/Payroll/GTLeaveSection.tsx` | 641 | `GT_LEAVE_TYPES` (4 ✔, defined L42). |
| `src/pages/JellyPolly/Payroll/JPLeaveSection.tsx` | 584 | `JP_LEAVE_TYPES` (4 ✔, L32) filtered to 3 unless `dayType === "Umum"`. Option list is dynamic — make sure `value` stays valid when the filter drops the current selection. |
| `src/pages/Payroll/DailyLog/DailyLogEntryPage.tsx` | 3466 (bulk), 3674 (per-row) | `leaveOptions` (3, +`cuti_umum` on Umum days ✔, L740). **Caveat:** these are raw Headless `Listbox`es, not `FormListbox`, and the bulk value can be the pseudo-value `"mixed"` (`bulkLeaveTypeValue`, L758) when the selected workers differ. `PillSelect` has no neutral state — either add `"mixed"` as a `disabled` option or extend the component to accept `value: T \| null`. Do this one last. |

### 3.2 Shift (2 options ✔)

- `src/pages/Payroll/DailyLog/DailyLogEntryPage.tsx:3112` — Day Shift / Night Shift.
- `src/pages/JellyPolly/Payroll/JPDailyLogEntryPage.tsx:3128` — same.

### 3.3 Payment method (4 ✔: Cash / Cheque / Bank Transfer / Online) and Bank Account / "Deposit To" (2–3 ✔)

Reference list: `src/components/Invoice/PaymentForm.tsx:234-244`.

| File | Lines |
| --- | --- |
| `src/components/Invoice/PaymentForm.tsx` | 853 (method), 867 (deposit to) |
| `src/components/Invoice/PaymentTable.tsx` | 905 (deposit to) |
| `src/pages/Invoice/InvoiceDetailsPage.tsx` | 2199, 2209, 2893 |
| `src/pages/JellyPolly/InvoiceDetailsPage.tsx` | 1752 |
| `src/pages/Invoice/InvoiceFormPage.tsx` | 888 |
| `src/pages/JellyPolly/InvoiceFormPage.tsx` | 876 |
| `src/components/GreenTarget/GreenTargetPaymentForm.tsx` | 429 |
| `src/pages/Accounting/Purchases/SupplierPaymentFormPage.tsx` | 509, 521 |
| `src/components/Accounting/SupplierPaymentInlineSection.tsx` | 227, 239 |

Mid-month payroll payment method (Cash / Bank / Cheque — verify):
`src/components/Payroll/AddMidMonthPayrollModal.tsx:203`,
`src/components/Payroll/EditMidMonthPayrollModal.tsx:147`,
`src/pages/GreenTarget/Payroll/GTMidMonthPayrollPage.tsx:266`,
`src/pages/JellyPolly/Payroll/JPMidMonthPayrollPage.tsx:268`.

> Note: the bank-account field is conditional on the method in most of these forms.
> Keep that conditional rendering exactly as it is — only the control changes.

### 3.4 Refund method + bank account (Refund Notes)

- `src/pages/AdjustmentDocs/AdjustmentDocsFormPage.tsx:1497, 1508`
- `src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage.tsx:1439, 1448`

### 3.5 Invoice payment type — Cash / Invoice (2 ✔)

- `src/components/Invoice/InvoiceHeader.tsx:126` (`{id:"I"|"C"}` mapped to `INVOICE`/`CASH` — keep the mapping).
- `src/pages/Invoice/InvoiceDetailsPage.tsx:3301` ("Select Payment Type").
- `src/pages/JellyPolly/InvoiceDetailsPage.tsx:2743` (same).

Changing an invoice's payment type has accounting consequences (auto-collection row,
journal re-sync) — this is a **control swap only**, do not touch the handlers.

### 3.6 Material form

`src/pages/Stock/Materials/MaterialFormPage.tsx`
— 508 category (3 ✔, L61), 518 applies_to (3 ✔, L68), 548 status (2), plus a raw
`<select>` Active/Inactive at 643.

---

## 4. Backlog — Tier 2 (good fit, lower priority)

| File / line | Field | Count |
| --- | --- | --- |
| `src/pages/Accounting/Purchases/SupplierPaymentListPage.tsx:207, 235` | Source / Status filters | 3 ✔ + 2 ✔ (L52, L58). Both include an explicit "All"/"Include cancelled" option — keep it as a real pill, `PillSelect` has no empty state. |
| `src/components/Payroll/AddOthersModal.tsx:946`, `src/components/Payroll/EditOthersModal.tsx` (same block) | Salary report column | 6 ✔ incl. "Automatic (by rule)" (L55). Raw `<select>`. |
| `src/components/Catalogue/PayCodeModal.tsx:415` | Salary Report Column | same 5 + none (verify) |
| `src/components/Catalogue/PayCodeModal.tsx:381` | Pay Type | verify (≈3) |
| `src/pages/Catalogue/CustomerFormPage.tsx:833`, `src/pages/Catalogue/CustomerAddPage.tsx:443`, `src/pages/Accounting/Purchases/LocalGeneralPurchaseFormPage.tsx:1336` | ID Type | 4 (BRN/NRIC/PASSPORT/ARMY ✔) |
| `src/pages/Accounting/Purchases/LocalGeneralPurchaseFormPage.tsx:1324` | Seller Type | 3 (verify) |
| `src/pages/GreenTarget/PublicForm/CustomerSignupPage.tsx:575` | ID Type, raw `<select>` | 4 ✔ (L47). **Public unauthenticated form with its own green styling and BM/EN `t.*` strings — `PillSelect`'s sky palette will look foreign here. Either skip or restyle.** |
| `src/pages/Catalogue/ProductPage.tsx:302` | Product type filter | verify |
| `src/components/Catalogue/ProductModal.tsx:203` | Tax | few, but sourced from the `taxes` table (dynamic) |
| `src/pages/Accounting/Purchases/GeneralPurchaseInvoiceFormPage.tsx:1825` | Tax Type | verify |

---

## 5. Explicitly rejected (do not convert)

`AccountCodeFormPage` fs_note and `JournalEntryPage` entry_type/ledger_type (long
lists); `GTStatementModal` start/end month-year; `SalaryReportPage` year/month;
`AddIncentiveModal`/`EditIncentiveModal` location (9 locations); `CustomerProductsTab`
product picker; `JobCategoryModal` section; `PayRateScheduleManager` month `<select>`
(12); `DynamicContextForm` (config-driven, generic); all Staff/Customer form fields
rendered through the shared `renderListbox` helper (`StaffFormPage`, `StaffAddPage`,
`JPStaffFormPage`, `JPStaffAddPage`, `CustomerFormPage`, `CustomerAddPage`,
`GreenTarget/CustomerFormPage`) — that helper feeds nationality/race/bank/agama/job,
which are all master-data lists. Gender (2) and marital status (3) would qualify on
their own, but they go through the same helper, so converting them means special-casing
per field — decide before starting.

---

## 6. Gotchas learned during the first pass

1. **Row-click tables.** `PackingCutiEntryPage`/`JPPackingCutiEntryPage` toggle row
   selection on click and skip interactive targets via `isInteractiveClickTarget`,
   which matches `button` — pills are `<button>`, so they are already excluded. Any
   other table with a click handler needs the same check.
2. **Disabled state.** When the whole control is disabled every pill renders at
   `opacity-60`, including unselected ones — a disabled dropdown used to show only the
   chosen value. Acceptable so far, but check it on read-only screens.
3. **Alignment.** In grid/flex rows next to inputs, pass `className="min-h-[38px]"` so
   the pill row lines up with a 38px-tall input.
4. **Dynamic option lists.** If options are filtered by another field (JP leave types
   by `dayType`), make sure the current `value` is still present or reset it —
   a dropdown showed a blank placeholder, pills will just show nothing selected.

---

## 7. Related — Bahasa Melayu translation (done 2026-08-02)

Translated on the user's instruction:

- `src/components/GreenTarget/GTInvoiceAccountFields.tsx` — whole panel.
- `src/components/GreenTarget/GTRevenueSplitEditor.tsx` — whole box, including the
  `TGA`/`TGB`/`WS_OTH` tooltip descriptions and the default `totalLabel`
  ("Jumlah invois").
- `src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage.tsx:1380` —
  `totalLabel="Jumlah pelarasan"`.
- `src/routes/greentarget/accounting/account-codes.js` — the **`POST
  /debtor-subledger`** validation / duplicate / failure messages (the only consumer is
  the "Cipta Identiti CD/SD" dialog).

**Known mixed-language state:** the GT Credit/Debit Note form
(`GTAdjustmentDocsFormPage.tsx`) is otherwise English, so its revenue allocation box is
now BM inside an English page — see the explanatory paragraph at L1345-1364, which was
deliberately left alone. If that page is translated later, start there. The rest of the
GT invoice form outside the Accounting panel is also still English.

`console.error` logs and the `error: error.message` field (raw PostgreSQL text) stay
English by design; the frontend prefers `message`, so users see the BM string.
