# Trial Balance Account Ordering — Handover

Date: 2026-08-07 · Scope: Tien Hock + Green Target Trial Balance (screen and PDF)

## What changed

Users can now control the order of accounts in the Trial Balance report:

- A new **order button** sits in the report toolbar, immediately to the left of
  the Panduan/Guide button (it is shown for Green Target too; GT has no Guide
  button, so it is simply the first action there).
- **Hovering** the button shows the Manual Order / Standard Order mode
  selection plus an "Edit order…" entry. Clicking the button itself opens the
  order modal.
- The modal is wide (`max-w-5xl`) and tall (`85vh`) with compact rows so many
  account codes can be seen at once. In Manual Order mode each row can be
  reordered by **drag & drop** (same pattern as
  `src/components/Catalogue/ProductOrderModal.tsx`) or with **up/down arrows**.
- The modal lists **every active chart account code** for the company — not
  just the rows currently visible in the report — so ordering works even when
  the report is filtered, searching, or hiding zero-balance accounts.
- Large sub-ledger groups are collapsed into **one draggable row per group**:
  Trade Debtors (`TD`), Closing Stock (`CS`), Opening Stock (`OS`) and Trade
  Creditors (`TC`). Each group row shows its label, a "Group" badge and the
  number of member accounts (e.g. Tien Hock Trade Debtors ≈ 1,577). The group
  moves as a unit; members always stay in their natural order inside it. This
  applies to both Manual and Standard mode (Standard stays read-only).
- Hovering a group row opens a **preview tooltip** showing the first 20 member
  accounts (code + description) with the group's total count; groups with 20
  or fewer members show all of them, and larger groups end with a "..." row
  plus a "First 20 of N" footer. The tooltip is rendered with `position:
  fixed` so it is never clipped by the modal's scroll container.
- The **Standard tab is organised into collapsible category sections**
  (Assets, Liabilities, Equity, Drawings, Revenues, Cost of Goods Sold,
  Expenses, Unclassified — only categories that actually contain items are
  shown). Clicking a section header collapses/expands it; section headers are
  sticky while scrolling. `buildStandardOrderSections` in
  `trialBalanceOrder.ts` returns each section's category + items.
- A **"Only show accounts in the selected month's Trial Balance" checkbox**
  (checked by default) filters the modal's list to the accounts that actually
  appear in the currently selected month's report (the full filtered server
  set, including grouped `DEBTOR`). Group rows show only their month members
  and counts while the filter is on. The checkbox state is stored in the same
  per-company `trialBalanceFilters` / `gtTrialBalanceFilters` localStorage
  cache as the month, so it is remembered together with the rest of the view.
- Saving while the month filter is on uses
  `mergeFilteredOrderToFullCodes`: the visible items are written back into the
  full saved order slot-by-slot, so accounts hidden by the filter keep their
  saved positions (and group blocks stay contiguous) instead of being dropped
  or dumped at the end.
- **Trade Debtors anchor rule**: the printed report collapses all TD children
  into the single `DEBTOR` row, so in the Standard view the TD group is
  positioned by the `DEBTOR` account code — never by its first customer child
  (codes like `-1` / `1378 MARKETING` sort before every other account and
  would otherwise place the group at the very top while the report still
  starts with e.g. `AD_FB`). Manual mode keeps the group wherever the user
  saved it (first saved member's position).
- The chosen mode and (for Manual Order) the saved code sequence are cached in
  `localStorage` per company and applied to both the on-screen table and the
  PDF printout.

## Files

| File | Role |
| --- | --- |
| `src/utils/accounting/trialBalanceOrder.ts` | Shared ordering logic: mode/preference types, localStorage load/save, natural order per company, locked standard order, sort helpers, modal list builders. |
| `src/components/Accounting/TrialBalanceOrderModal.tsx` | Wide/tall order modal (drag & drop + arrows, Manual/Standard switch, Save/Cancel). |
| `src/components/Accounting/TrialBalanceOrderButton.tsx` | Hover dropdown toolbar button (mode selection + open modal). |
| `src/pages/Accounting/Reports/TrialBalancePage.tsx` | State, notes fetch, client-side ordering + pagination, PDF ordering, toolbar button + modal wiring. |
| `src/utils/accounting/TrialBalancePDF.tsx` | Contract documented: `accounts` is printed exactly in the supplied order; the page pre-orders before calling. |
| `src/components/ChangelogModal.tsx` | Changelog entry (2026-08-07). |
| `src/i18n/locales/{ms,zh-Hans}/common.json` | New UI strings. |

## Order modes

### Manual Order (default, key `"custom"`)

- The user's own ordering of every active chart code.
- With no saved order yet (`codes: []`), the report keeps each company's
  natural default order:
  - **Tien Hock**: one alphabetical code sequence with the grouped Trade
    Debtors row (`DEBTOR`) last — the exact current server order
    (`ORDER BY (ledger_type = 'TD') ASC, code`).
  - **Green Target**: `account_codes.sort_order` ascending (the legacy printed
    Trial Balance line number), then code.
- Saved codes win. Accounts created after the order was saved are appended at
  the end in the company's natural order until the user reopens the modal and
  saves again.

### Standard Order (key `"standard"`)

- Locked accounting-practice order, **intentionally not editable in the UI**.
- Implementation (in `trialBalanceOrder.ts`):
  1. Group by financial-statement note category:
     `asset → liability → equity → drawings → revenue → cogs → expense`;
     accounts with no resolvable note go last.
  2. Ascending account code (`localeCompare` with numeric collation) inside
     each group.
- The `STANDARD_CATEGORY_ORDER` array in `trialBalanceOrder.ts` is the single
  place to adjust this sequence in code.
- Three Green Target accounts carry the printed APPX `fs_note` instead of the
  statement category (`INPUT.TAX` → asset, `FC_TL`/`FC_HP` → expense), so a
  locked `STANDARD_ORDER_CATEGORY_OVERRIDES` map in `trialBalanceOrder.ts`
  corrects them for standard ordering.
- The modal renders it read-only (no drag, no arrows, Save disabled).

## How the standard order resolves account notes

- Trial Balance rows already carry the backend's **effective** `fs_note`, so
  they sort directly by that note's category.
- The modal's full chart list uses each account's direct `fs_note`; when that
  is null it walks `parent_code` to the nearest ancestor with a note — the
  same resolution the backend uses (`EFFECTIVE_FS_NOTES_CTES`).
- The page fetches the notes catalogue once per company
  (`/api/financial-reports/notes` or
  `/greentarget/api/financial-reports/notes`) to map note → category.

## Storage

`localStorage` keys (per company, mirroring the existing per-company filter
cache convention):

- Tien Hock: `trialBalanceOrder`
- Green Target: `gtTrialBalanceOrder`

Value shape:

```json
{ "mode": "custom", "codes": ["ABB", "CH_REV1", "..."] }
```

Default is `{ mode: "custom", codes: [] }`. Mode changes are persisted
immediately (from either the hover menu or the modal); manual reordering is
persisted only when the user presses Save in the modal.

The stored `codes` array stays **flat per-account** even though the modal
shows groups: saving expands every group into its member codes (natural
order) at the group's position, so the report sorter and PDF need no changes.
`buildCustomOrderItems` / `buildStandardOrderItems` / `expandOrderItemsToCodes`
in `trialBalanceOrder.ts` handle the group ⇄ flat-code conversion.

Old saved orders that had sub-ledger codes scattered individually (possible
before grouping) collapse each group at the position of its first saved
member; the internal order of sub-ledger members is intentionally normalised
to natural order because those items don't need ordering.

## Behaviour notes / edge cases

- **Client-side pagination**: the page now fetches the full filtered set (no
  `limit`/`offset`) and paginates in the browser so ordering is stable across
  pages. Server-side search/hide-zero/ledger-type filters are unchanged; the
  totals still come from the server.
- **No backend change was needed for grouping**: the account-codes API already
  returns `ledger_type` for every code, and the report/PDF sorters still
  consume the flat saved `codes` array.
- The modal includes **active** accounts only (`is_active !== false`);
  inactive codes can never appear in the report so they are not orderable.
- Tien Hock groups Trade Debtors into one `DEBTOR` row on screen; the modal
  includes the `DEBTOR` control code (plus every TD child), and the grouped
  row follows the position of the `DEBTOR` code in the saved order. With the
  `TD` ledger-type filter selected, individual TD children follow their own
  saved positions.
- Stale codes in a saved order (deleted/deactivated accounts) are ignored for
  display and pruned when the modal next opens.
- Mode/label naming: "Manual Order" (custom) vs "Standard Order" — chosen so
  "custom" is not confused with the standard accounting practice.

## Verification

1. Open Trial Balance (TH), hover the order button → menu shows Manual/Standard
   and Edit order.
2. Open the modal, drag a row and/or use the arrows, Save → table order
   changes immediately and persists after refresh.
3. Switch to Standard Order from the hover menu (or inside the modal) → table
   and PDF print the fixed standard order; modal list is read-only.
4. Print PDF in both modes and confirm the account sequence matches the screen.
5. Repeat on `/greentarget/.../trial-balance` — GT keeps its own saved order
   and uses `sort_order` as its natural fallback.
6. `npm run i18n:report` passes (new keys added to ms and zh-Hans `common`).
