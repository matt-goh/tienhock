# Handover — Replacing dropdowns with pill selectors (`PillSelect`)

**Date:** 2026-08-02
**Status:** Tier 1 complete (Phases 1-4). Every leave-type and payment-method selector
across Tien Hock, Green Target and Jelly Polly is now a pill row. **Tier 2 (§4) is the
only backlog left.**

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

**Phase 1 (2026-08-02)** — §3.1 leave type (except `DailyLogEntryPage`) + §3.2 shift:

| File | What changed |
| --- | --- |
| `src/pages/GreenTarget/Payroll/GTLeaveSection.tsx` | Add Leave modal type field → `GT_LEAVE_TYPES` pills. The modal's `grid-cols-3` was cut to `grid-cols-2` (Date + Amount) and Type moved to its own full-width row below — at one third of a `max-w-lg` modal the 4 pills stacked vertically. |
| `src/pages/JellyPolly/Payroll/JPLeaveSection.tsx` | Same field and same modal re-layout, over the `dayType`-filtered `leaveTypeOptions`. Added a `useEffect` that resets `formLeaveType` when the filter drops the current value (gotcha 4) — the dropdown showed a blank, pills would show nothing selected. |
| `src/pages/Payroll/DailyLog/DailyLogEntryPage.tsx` | Shift (L3112) → `SHIFT_OPTIONS` pills. `FormListbox` rendered its own label, so the label markup was copied from the adjacent Date field; the `w-32` wrapper was dropped (too narrow for two pills). |
| `src/pages/JellyPolly/Payroll/JPDailyLogEntryPage.tsx` | Same shift field (L3128). |

`FormListbox` is no longer imported in any of those four files.

**Phase 2 (2026-08-02)** — §3.3 payment method + bank account, all 13 sites:

| File | What changed |
| --- | --- |
| `src/components/Invoice/PaymentForm.tsx` | Method + Deposit To. Local `paymentMethodOptions` / `bankAccountOptions` became module-level `PAYMENT_METHOD_OPTIONS` / `BANK_ACCOUNT_OPTIONS`, typed `PillSelectOption<RecordablePaymentMethod>` / `<string>`. |
| `src/components/Invoice/PaymentTable.tsx` | Deposit To inside the cheque-confirmation dialog. |
| `src/pages/Invoice/InvoiceDetailsPage.tsx` | Method + Deposit To on the inline Record Payment panel, and Deposit To in the confirm-payment dialog. |
| `src/pages/JellyPolly/InvoiceDetailsPage.tsx` | Method. Its row is `lg:grid-cols-4`, so the field got `lg:col-span-2` — a quarter column wrapped the four pills onto two lines. |
| `src/pages/Invoice/InvoiceFormPage.tsx`, `src/pages/JellyPolly/InvoiceFormPage.tsx` | Method. `w-2/3` dropped and the row changed to `flex flex-wrap items-end`. `optionsPosition="top"` disappears with the dropdown — these sit at the bottom of the form and no longer need it. |
| `src/components/GreenTarget/GreenTargetPaymentForm.tsx` | Method. |
| `src/pages/Accounting/Purchases/SupplierPaymentFormPage.tsx` | Method + Bank Account (option order `bank_transfer, cheque, cash, online` preserved). |
| `src/components/Accounting/SupplierPaymentInlineSection.tsx` | Same pair, typed to `SupplierPaymentMethod` / `SupplierBankAccount` so the `as` casts in `updateDraft` could go. |
| `AddMidMonthPayrollModal.tsx`, `EditMidMonthPayrollModal.tsx`, `GTMidMonthPayrollPage.tsx`, `JPMidMonthPayrollPage.tsx` | Cash / Bank / Cheque. Each file gained a local `MidMonthPaymentMethod` type so the inline `"Cash" | "Bank" | "Cheque"` union and its `as` cast are stated once. |

**Phase 3 (2026-08-02)** — §3.4, §3.5, §3.6:

| File | What changed |
| --- | --- |
| `src/pages/AdjustmentDocs/AdjustmentDocsFormPage.tsx` | Refund Method + Bank Account. Labels kept verbatim ("Public Bank Berhad" / "Alliance Bank Berhad") even though they are longer than the 14-char guideline — they sit in a `md:grid-cols-2` half column and fit. |
| `src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage.tsx` | Same pair. |
| `src/components/Invoice/InvoiceHeader.tsx` | Type. The `{id:"I"\|"C"}` ↔ `INVOICE`/`CASH` mapping is untouched; the codes are now a named `InvoiceTypeCode`. |
| `src/pages/Invoice/InvoiceDetailsPage.tsx`, `src/pages/JellyPolly/InvoiceDetailsPage.tsx` | "Select Payment Type" in the Change Payment Type modal (done alongside Phase 2 since both files were already open). |
| `src/pages/Stock/Materials/MaterialFormPage.tsx` | Category, Applies To, Status, **and** the raw `<select>` in the variant edit row. The three option arrays moved from `SelectOption[]` to `PillSelectOption<string>[]`; the duplicated Active/Inactive lists were merged into one `statusOptions`. |

**Phase 4 (2026-08-02)** — leave type everywhere it is recorded, all three companies.
This closes §3.1, including the `"mixed"` case that was deferred:

| File | What changed |
| --- | --- |
| `src/pages/Payroll/MonthlyLog/MonthlyLogEntryPage.tsx`, `src/pages/JellyPolly/Payroll/JPMonthlyLogEntryPage.tsx` | Add Leave modal, `StyledListbox` → pills. Same re-layout as Phase 1's leave modals: `sm:grid-cols-3` → `sm:grid-cols-2` (Date + Amount), Leave Type on its own row. `max-w-2xl` ÷ 3 ≈ 190px vs ~410px of pills. GT already had this via `GTLeaveSection`. |
| `DailyLogEntryPage.tsx`, `JPDailyLogEntryPage.tsx`, `DailyLogSalesmanEntryPage.tsx`, `JPDailyLogSalesmanEntryPage.tsx` | Both leave selectors: the header "SET ALL" and the per-row one. Each file's local `interface LeaveOption {id,name}` became `type LeaveOption = PillSelectOption<LeaveType>`, so `leaveOptions` feeds `PillSelect` directly and the two `.find(o => o.id === …)?.name` label lookups disappear with the `ListboxButton`. The four blocks were byte-identical across the four files. |

**The `"mixed"` problem was a non-problem.** `PillSelect` marks a pill active with
`option.value === value`, so a value matching no option renders with *nothing*
highlighted — exactly the neutral state a bulk control needs. `PillSelect<BulkLeaveTypeValue>`
accepts `leaveOptions` (a `PillSelectOption<LeaveType>[]`) because the option type is
covariant in `value`. No component change was needed; the behaviour is now documented in
`src/components/PillSelect.tsx` because four call sites depend on it. This also removed
the old "Set selected" placeholder, which existed only because a dropdown cannot show
"no answer".

Dead after this pass, and removed from all four daily-log files: the `@headlessui/react`
`Listbox*`/`Transition` imports, `Fragment`, `IconChevronDown` and `IconCheck`.

Deliberately left as-is in these files: the Salesman `FormListbox` in both InvoiceDetails
pages and in `InvoiceHeader` (master data), and the `disabled` prop on any control that
did not already have one — several of these had a `disabled` gap next to their siblings,
but adding it would be a behaviour change, not a control swap.

Changelog entries added under `2026-08-02` in `src/components/ChangelogModal.tsx` — the
pill rollout has one entry covering every converted screen; **extend that entry in later
phases instead of adding a new one per phase**.

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

~~### 3.1 Leave type~~ — done in Phase 4.
~~### 3.2 Shift~~ — done in Phase 1.

~~### 3.3 Payment method / bank account~~ — done in Phase 2.
~~### 3.4 Refund method + bank account~~ — done in Phase 3.
~~### 3.5 Invoice payment type~~ — done in Phase 3.
~~### 3.6 Material form~~ — done in Phase 3.

Tier 1 is finished apart from §3.1's `DailyLogEntryPage`, which is deferred until
`PillSelect` can express a neutral value.

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

## 6. Gotchas (1-6 first pass, 7-9 Phases 2-3, 10-11 Phase 4)

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
5. **Width.** A dropdown fits any column; a pill row does not. Check the container
   the control sits in — both leave modals needed their `grid-cols-3` cut to
   `grid-cols-2` with the pills on their own full-width row, and both Shift fields
   needed a fixed `w-32` wrapper removed. Budget roughly `8 × label chars + 26px`
   per pill plus a `6px` gap.
6. **`FormListbox` renders its own `label`.** `PillSelect` does not — when replacing
   one that used the `label` prop, add the `<label>` markup, copying the classes from
   a neighbouring field so the sizes match (`text-sm` on form rows, `text-xs` in the
   compact modals). The exact markup `FormListbox` produces
   (`src/components/FormComponents.tsx:190-199`), which is what most of the converted
   sites now use verbatim:

   ```tsx
   <div className="space-y-2">
     <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
       Payment Method <span className="text-red-500">*</span>   {/* only if it was `required` */}
     </label>
     <PillSelect … />
   </div>
   ```

7. **Width, part 2 — the fixes that worked in Phase 2/3.** Three patterns, in order of
   preference: (a) leave it alone when the container is a half column of a full-width
   page (`md:grid-cols-2` on an unconstrained page is ~500px — everything fitted);
   (b) span more columns (`lg:col-span-2` on JP Invoice Details' `lg:grid-cols-4` row);
   (c) move the field to its own full-width row (both leave modals). Removing a fixed
   width (`w-32`, `w-2/3`) is almost always right — pills size to their content.
8. **Props that disappear with the dropdown.** `placeholder` (a pill row always has a
   selection), `optionsPosition="top"` (nothing pops open), `name`/`required`
   (`required` becomes the `*` in the label above), and per-row portal `anchor`
   workarounds. Delete them; don't try to map them onto `PillSelect`.
9. **Resist widening the change.** Several converted fields had no `disabled` prop
   while every sibling field in the same form did. That looks like an oversight, but
   adding it is a behaviour change — these are control swaps. Leave it, and say so.
10. **Row-click tables, part 2.** Gotcha 1 only holds where the table routes clicks
    through `isInteractiveClickTarget`. The four daily-log leave tables do **not** —
    their `<tr onClick>` toggles selection and the old `ListboxButton` carried a
    manual `onClick={(e) => e.stopPropagation()}`. `PillSelect` does not stop
    propagation, so wrap it: `<div onClick={(e) => e.stopPropagation()}>`. Miss this
    and every pill click also toggles the row.
11. **No selection is a valid state.** A `value` matching no option renders with
    nothing highlighted — use it for "mixed"/indeterminate bulk controls instead of
    inventing a placeholder option. Gotcha 4 still applies in the opposite direction:
    where a blank is *not* wanted, reset the value.

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
