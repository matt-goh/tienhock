# Adjustment Documents (Credit / Debit / Refund Notes) — Multi-Company Implementation

## Context

The ERP currently handles only standard sales invoices and payments for Tien Hock, Jelly Polly, and Green Target. Customers occasionally return goods, get overcharged, overpay, or need post-invoice adjustments — and MyInvois Malaysia requires these to be formalised as Credit Notes (type 02), Debit Notes (type 03), and Refund Notes (type 04) referencing the original invoice's UUID. Today the only way to handle a return is to cancel the invoice or manually book a journal entry, which is non-compliant for any invoice that was e-invoiced.

This plan introduces a dedicated **Adjustment Documents** ecosystem across all three companies, fully integrated with the invoice, payment, accounting, and MyInvois e-invoice flows.

## Decisions confirmed

| Decision | Choice |
|---|---|
| Storage | Dedicated `adjustment_documents` + `adjustment_document_lines` tables (per-company schema) |
| Line items | Copied from original invoice, fully editable |
| CN+RN pairing | Single CN form with refund toggle defaulting ON when payments exist; both docs created atomically |
| Accounting | Full integration — updates `balance_due`, `customer.credit_used`, posts journal entries |
| Numbering | `{TYPE_PREFIX}-{YYYY}-{NNNN}` per type per year (per-company prefix for JP/GT) |
| Eligibility | Permissive — DN/CN buttons on any non-cancelled invoice; RN button only when overpaid Payment exists |
| Cancellation | Full reversal cascade. RN must be cancelled before its paired CN. |
| Component reuse | TH and JP share components via `company` prop; GT has its own (different shape) |
| Consolidation grouping | One consolidated adj doc per `(type, parent_consolidated_uuid)`; each child adj doc becomes one InvoiceLine |
| Auto-consolidation timing | Same days 3-7 window, by creation month |
| InvoiceDetailsPage display | New "Adjustment Documents" section between Invoice Info and Payments |
| List button on InvoiceListPage | Pure navigation, no selection filter |
| Routes | `/sales/adjustment-docs` (flat) with per-company prefix |
| RN trigger | Action bar button on InvoiceDetailsPage, visible only when overpaid Payment exists |
| Pairing FK | Self-FK `paired_with_id` on `adjustment_documents` |

---

## Phase status

| Phase | Description | Status |
|---|---|---|
| 1 | Database + Backend Foundation (Tien Hock) | **DONE** |
| 2 | Frontend Pages (TH, shared component scaffolding) | **DONE** |
| 3 | Invoice & Payment Integration (TH) | **DONE** |
| 4 | Individual E-Invoice templates + submission (TH) | **DONE** |
| 5 | Consolidated E-Invoice templates + auto-consolidation (TH) | **DONE** (manual modal tabs deferred) |
| 6 | Jelly Polly Replication | **DONE** |
| 6.5 | Pre-Phase-7 edge case audit + fixes | **DONE** |
| 7 | Green Target Implementation | Not started |

### Phase 1 — what shipped

- `migrations/001_create_adjustment_documents.sql` — tables `adjustment_documents`, `adjustment_document_lines`, indexes, `updated_at` trigger. **Applied to dev DB.**
- `src/routes/sales/adjustment-docs/accounting.js` — journal-entry helpers for CN (Dr RETURN / Cr TR), DN (Dr TR / Cr SLS), RN standalone (Dr CUST_DEP / Cr Bank), RN paired (Dr TR / Cr Bank). Entry types `CN` / `DN` / `RN` with reference numbers `JCN-YYYYMM-NNNN` etc. Cancellation helper marks entry `status='cancelled'`.
- `src/routes/sales/adjustment-docs/index.js` — endpoints:
  - `GET    /api/adjustment-docs` (filters: type, original_invoice_id, customerid, status, einvoice_status, startDate, endDate, search, include_cancelled)
  - `GET    /api/adjustment-docs/:id` (returns doc + lines)
  - `GET    /api/adjustment-docs/next-number/:type` (preview next ID)
  - `POST   /api/adjustment-docs` (atomic create with optional `paired_refund`; updates balance_due, credit_used, posts journal entry; auto-finds parent consolidated invoice id)
  - `POST   /api/adjustment-docs/:id/cancel` (full reversal cascade; blocks CN cancel if paired active RN exists; blocks if e-invoice is valid/pending)
  - `POST   /api/adjustment-docs/:id/clear-einvoice-status` (allow re-submission after rejection)
- `src/routes/index.js` — registered at `/api/adjustment-docs`.
- `CLAUDE.md` and `AGENTS.md` schema sections updated.

### Phase 2 — what shipped

- **Types** added to `src/types/types.ts`: `AdjustmentDocType`, `AdjustmentDocLine`, `AdjustmentDocument` (mirrors backend shape, includes joined fields from list endpoint).
- **Shared component** `src/components/AdjustmentDocs/AdjustmentDocBadge.tsx` exports `AdjustmentDocTypeBadge`, `AdjustmentDocStatusBadge`, and `ADJUSTMENT_DOC_TYPE_META`.
- **Pages** under `src/pages/AdjustmentDocs/`:
  - `AdjustmentDocsListPage.tsx` — 4 filter tabs (All / Debit Notes / Credit Notes / Refund Notes) with counts, search box, DateRangePicker + MonthNavigator, e-invoice status filter, status filter, and a table with click-through to details. Empty state when no results.
  - `AdjustmentDocsFormPage.tsx` — query params `?type=credit|debit|refund&invoiceId=...&paymentId=...`. Loads original invoice + payments, pre-fills lines (copy from original for CN/DN, overpaid-amount-only single line for standalone RN). Live totals (sen-safe via `moneyUtils`). For CN: "Issue paired Refund Note" toggle (defaults ON when active/overpaid payments exist) plus refund-method/bank/reference fields. For RN: required refund method, bank account (when non-cash), reference. Validation blocks empty docs, non-positive totals, RN amount exceeding linked overpaid payment, and missing bank account for non-cash refunds.
  - `AdjustmentDocsDetailsPage.tsx` — read-only view of doc + lines + refund details (RN only), paired-doc panel with link, e-invoice metadata panel, totals panel, cancellation banner when cancelled. "Cancel Document" button visible when status=active and e-invoice not valid/pending; disabled with tooltip when CN is awaiting paired-RN cancellation. (E-invoice action buttons land in Phase 4.)
- **Routing/sidebar** updated in `src/pages/TienHockNavData.tsx` — new entry under Sales, **below Payments**, named "Adjustment Documents". Routes `/sales/adjustment-docs`, `/sales/adjustment-docs/new`, `/sales/adjustment-docs/:id` registered.
- **TypeScript clean** — `tsc --noEmit` runs without errors.

### Phase 3 — what shipped

- **[src/pages/Invoice/InvoiceListPage.tsx](../src/pages/Invoice/InvoiceListPage.tsx)** — `Documents` mini button added between the **Consolidated** and **Refresh** buttons in the action bar. Uses `IconFileText`, pure navigation to `/sales/adjustment-docs`.
- **[src/pages/Invoice/InvoiceDetailsPage.tsx](../src/pages/Invoice/InvoiceDetailsPage.tsx)** action bar — three new buttons inserted **immediately to the left of "Print"**, all gated on `!isCancelled`:
  - **Debit Note** (`IconFilePlus`, amber outline) → `/sales/adjustment-docs/new?type=debit&invoiceId={id}`
  - **Credit Note** (`IconFileMinus`, rose outline) → `/sales/adjustment-docs/new?type=credit&invoiceId={id}`
  - **Refund Note** (`IconRotate2`, sky outline) — visible only when at least one payment in state has `status === "overpaid"`. Navigates with `&paymentId=` set to the overpaid payment id.
- **[src/components/AdjustmentDocs/InvoiceAdjustmentDocsSection.tsx](../src/components/AdjustmentDocs/InvoiceAdjustmentDocsSection.tsx)** — new reusable section component that fetches all adjustment documents for an invoice (`GET /api/adjustment-docs?original_invoice_id=...&include_cancelled=true`) and renders a compact table with type/status badges and click-through navigation. Accepts a `basePath` prop so JP/GT can pass their prefixed paths. Hides itself entirely when there are no related docs (zero-state reduces noise on every invoice).
- **InvoiceDetailsPage** also renders `<InvoiceAdjustmentDocsSection invoiceId={...} />` below the main invoice card (acceptable substitute for the originally-planned position; placing inline would have required restructuring the existing card layout).
- **[src/components/ChangelogModal.tsx](../src/components/ChangelogModal.tsx)** — new bilingual entry dated 2026-05-20 announcing Adjustment Documents to end users.

### Phase 6.5 — Pre-Phase-7 edge case audit and hardening (2026-05-21)

Critical and high-severity edge cases identified in the audit ([plans/alright-we-need-to-wiggly-spring.md](../../plans/alright-we-need-to-wiggly-spring.md)) have been fixed. All changes are **scoped to the buggy edge cases** — happy-path / single-user behaviour for normal CN/DN/RN flows is byte-identical.

**Backend ([src/routes/sales/adjustment-docs/index.js](../src/routes/sales/adjustment-docs/index.js)):**
- `#1 Wrapper cancellation` — `/:id/cancel` now branches on `doc.is_consolidated`. Wrapper cancellation skips balance/credit/journal reversal (children own those) and instead clears the children's `uuid`/`submission_uid`/`long_id`/`datetime_validated`/`einvoice_status` so they're re-consolidate-able. Previously corrupted the parent invoice's balance_due.
- `#2 Concurrent submit-einvoice` — `/:id/submit-einvoice` now wraps the whole flow in `BEGIN ... COMMIT` and fetches the doc row with `FOR UPDATE`. Concurrent clicks on the same doc serialise; the second sees the first's status update and bails with a clear "already has e-invoice status" error.
- `#3 Multi-RN cumulative cap` — Standalone Refund Note creation now sums all prior active RNs against the same `linked_payment_id` and rejects if `prior_total + new_amount > overpaid_amount`. Single-RN flows unaffected (sum is 0).
- `#5 Wrapper cancel-einvoice cascade` — `/:id/cancel-einvoice` now, when the target is a wrapper, propagates `einvoice_status='cancelled'` to all children sharing the wrapper's UUID. Non-wrapper docs unaffected.
- `#6 Snapshot refresh` — `resolveReferencedDocument` detects stale `references_consolidated_id` (parent cancelled or invalidated), falls through to live JSONB lookup, and persists the refreshed parent id back to the doc. Reports and subsequent operations see the live parent.
- `#7 Linked payment status surfaced` — `GET /:id` now joins `payments` and includes a `linked_payment` object on the response so the UI can warn when a standalone RN's source payment has been cancelled.
- `#8 Parent re-validation pre-submit` — `/submit-consolidated` re-queries the parent consolidated invoice immediately before the MyInvois network call and aborts if the parent was cancelled mid-flow.
- `#10 Validation tightening` — `validateLineItems` now rejects `qty <= 0` (except OTH/LESS/REFUND, which are amount-only) and `price < 0` (except LESS, which by convention is negative). Same rule mirrored in the form's `validate()`.

**Invoice cancel handler (TH + JP):**
- `#4 Block invoice cancel when active adjustment docs exist` — `DELETE /:id` on both [src/routes/sales/invoices/invoices.js](../src/routes/sales/invoices/invoices.js) and [src/routes/jellypolly/invoices.js](../src/routes/jellypolly/invoices.js) now queries active adjustment_documents for the invoice and returns a clear 400 error listing the offending document IDs. Cascade-cancel is intentionally NOT implemented (riskier) — users cancel docs first.

**Auto-consolidation cron ([src/utils/invoice/autoAdjustmentConsolidation.js](../src/utils/invoice/autoAdjustmentConsolidation.js)):**
- `#9 Idempotency guard` — When a group's eligible children carry a non-null `submission_uid` (suggests a prior partial run), the group is skipped with a warning logged for manual review. Prevents accidental double-submission to MyInvois.

**Frontend:**
- `#7 Stale linked payment warning` — [src/pages/AdjustmentDocs/AdjustmentDocsDetailsPage.tsx](../src/pages/AdjustmentDocs/AdjustmentDocsDetailsPage.tsx) now renders an amber warning banner on Refund Note details when `linked_payment.status === 'cancelled'`.
- `#10 Form validation` — [src/pages/AdjustmentDocs/AdjustmentDocsFormPage.tsx](../src/pages/AdjustmentDocs/AdjustmentDocsFormPage.tsx) `validate()` rejects qty<=0 / negative price with line-specific error messages.

**Types ([src/types/types.ts](../src/types/types.ts)):**
- `AdjustmentDocument` interface gained the optional `linked_payment` joined field.

**Deferred (low risk, would change intended behaviour):**
- `#11 Cumulative CN cap vs invoice total` — Would block legitimate partial-CN-over-time workflows; only the over-credit case is buggy and is rare.
- `#13 Wrapper pill on list page` — Pure UX, no behaviour change required.
- `#14 Remove credit_used clamp` — Behaviour shift that affects how customer reports compute "amount owed"; needs explicit user direction.
- `#15-20` — Polish items; safe to ship later.

**Verification done:**
- `node --check` passes on all modified backend files.
- `tsc --noEmit` runs clean (no new TypeScript errors).
- Code review confirms no edits to the happy-path code; all changes are guarded by `is_consolidated`, `paired_with_id`, `linked_payment_id`, transaction wrappers, or specific status checks.

### Phase 3.1 (post-Phase-3 fix) — Invoice picker on the form page

- **[src/pages/AdjustmentDocs/AdjustmentDocsFormPage.tsx](../src/pages/AdjustmentDocs/AdjustmentDocsFormPage.tsx)** — when the URL has `?type=...` but no `invoiceId`, the form now shows an in-place invoice picker (search by invoice number / customer name / amount) instead of bouncing back to the list with an error. Selection writes `invoiceId` into the URL and proceeds with the normal form load. List-page "New Debit Note" / "New Credit Note" buttons now work end-to-end.

### Phase 4 — what shipped

- **[src/utils/invoice/einvoice/EInvoiceAdjustmentNoteTemplate.js](../src/utils/invoice/einvoice/EInvoiceAdjustmentNoteTemplate.js)** — single shared template that emits the right `InvoiceTypeCode` (02 / 03 / 04) based on the doc's `type`. Populates `cac:BillingReference > cac:InvoiceDocumentReference > cbc:UUID` with the referenced source document's UUID. Forks the helper functions from `EInvoiceTemplate.js` (date validation, tax/totals computation, line generation) and reuses `TIENHOCK_INFO` for the supplier party.
- **[src/routes/sales/adjustment-docs/index.js](../src/routes/sales/adjustment-docs/index.js)** — three new endpoints:
  - `POST /api/adjustment-docs/:id/submit-einvoice` — builds XML, calls `EInvoiceSubmissionHandler.submitAndPollDocuments`, persists `uuid`/`submission_uid`/`long_id`/`datetime_validated`/`einvoice_status`. Resolves the referenced UUID by first checking the original invoice's own UUID (valid e-invoice) then falling back to `references_consolidated_id` then to a live JSONB lookup. Refuses to submit when customer has no TIN/ID, when source has no valid UUID, or when doc is already valid/pending. Persists `'invalid'` on submission failure so the user can clear-and-retry.
  - `POST /api/adjustment-docs/:id/update-status` — polls `GET /api/v1.0/documents/:uuid/details` and updates `einvoice_status`/`long_id`/`datetime_validated` based on the remote response.
  - `POST /api/adjustment-docs/:id/cancel-einvoice` — calls `PUT /api/v1.0/documents/state/:uuid/state` with `{ status: 'cancelled', reason }`, then sets local `einvoice_status='cancelled'`. Does NOT cancel the document itself — that's a separate call. Tolerates MyInvois API quirks (proceeds with local cleanup even when the remote returns an error).
- **Router signature updated** ([src/routes/index.js](../src/routes/index.js)) — adjustment-docs router now receives `myInvoisConfig` and instantiates the API client via `EInvoiceApiClientFactory.getInstance()`.
- **[src/pages/AdjustmentDocs/AdjustmentDocsDetailsPage.tsx](../src/pages/AdjustmentDocs/AdjustmentDocsDetailsPage.tsx)** — action bar now renders the right e-invoice action depending on state:
  - `einvoice_status === null` → **Submit e-Invoice**
  - `einvoice_status === 'invalid'` → **Clear & Retry** + **Re-submit**
  - `einvoice_status === 'pending'` → **Update Status**
  - `einvoice_status === 'valid' | 'invalid'` → **Cancel e-Invoice**
  - **Cancel Document** stays available when status is active and e-invoice is not valid/pending. New confirmation dialog for e-invoice cancellation.
- **TypeScript clean** — `tsc --noEmit` passes.

### Phase 5 — what shipped

- **[src/utils/invoice/einvoice/EInvoiceConsolidatedAdjustmentTemplate.js](../src/utils/invoice/einvoice/EInvoiceConsolidatedAdjustmentTemplate.js)** — generates a consolidated UBL for a single (type, parent_consolidated_uuid) group. Each child adjustment doc becomes one `cac:InvoiceLine` whose description is `"Adjustment {childId} for Invoice {original_invoice_id} — {reason}"`. Uses the "Consolidated Customers" placeholder customer party (TIN `EI00000000010`) and populates BillingReference with the parent consolidated invoice's UUID.
- **[src/routes/sales/adjustment-docs/index.js](../src/routes/sales/adjustment-docs/index.js)** — three new consolidated endpoints:
  - `GET /api/adjustment-docs/eligible-for-consolidation?type=&month=&year=` — returns active adjustment docs whose original invoice has a parent consolidated invoice with a valid UUID, scoped to the given month.
  - `POST /api/adjustment-docs/submit-consolidated` — body `{ type, adjustmentDocIds[] }`. Verifies same type + same parent, generates `CON-{CN|DN|RN}-{YYYYMM}-{N}`, submits to MyInvois, inserts a wrapper row in `adjustment_documents` with `is_consolidated=true` + `consolidated_adjustments` JSONB array, propagates the e-invoice uuid/submission_uid/status to each child.
  - `GET /api/adjustment-docs/consolidated-history?year=` — list of wrapper rows.
- **[src/utils/invoice/autoAdjustmentConsolidation.js](../src/utils/invoice/autoAdjustmentConsolidation.js)** — new module. `checkAndProcessDueAdjustmentConsolidations(pool)` runs in the days 3-7 window, finds eligible adjustment docs grouped by `(type, parent_consolidated_id)`, generates IDs of the form `CON-{TYPE}-{YYYYMM}-{N}-AUTO`, and submits each group as its own consolidated wrapper. Uses the Tien Hock MyInvois client (JP/GT modules will mirror this in their phases).
- **[server.js](../server.js)** — the existing daily auto-consolidation cron now also calls `checkAndProcessDueAdjustmentConsolidations(pool)` after the regular invoice consolidation pass.
- **Deferred to a follow-up**: tabs on `ConsolidatedInvoiceModal.tsx` for manually triggering consolidation of adjustment docs by type. The auto-consolidation cron handles the common case; the manual modal extension can land as a small follow-up when needed.

### Phase 6 — Jelly Polly — DONE

**Backend:**
- `migrations/002_create_jp_adjustment_documents.sql` applied — `jellypolly.adjustment_documents` and `jellypolly.adjustment_document_lines` mirror the TH schema, FKs point at `jellypolly.invoices` and `jellypolly.payments`. Shares `customers`, `account_codes`, `journal_entries` with TH.
- **TH route refactored into a parameterised factory** at [src/routes/sales/adjustment-docs/index.js](../src/routes/sales/adjustment-docs/index.js) — `export default function (pool, myInvoisConfig, options = {})` accepts `options.tables` (per-table override) and `options.supplierInfo`. Helpers and inline SQL use `${T.docs}` / `${T.lines}` / `${T.invoices}` / `${T.payments}` via closure. All helpers moved inside the factory function.
- **EInvoiceAdjustmentNoteTemplate** and **EInvoiceConsolidatedAdjustmentTemplate** accept `supplierInfo` and default to `TIENHOCK_INFO` for back-compat.
- **JP route wrapper** at [src/routes/jellypolly/adjustment-docs.js](../src/routes/jellypolly/adjustment-docs.js) — 12-line file that calls the factory with `jellypolly.*` tables and `JELLYPOLLY_INFO`. Registered in `routes/index.js` under `/jellypolly/api/adjustment-docs` with `myInvoisJPConfig`.
- **Auto-consolidation extended for JP** — [src/utils/invoice/autoAdjustmentConsolidation.js](../src/utils/invoice/autoAdjustmentConsolidation.js) rewritten with a `processCompany(pool, cfg)` helper. The cron entry point calls it twice: once with the TH client (`EInvoiceApiClientFactory` + `EInvoiceSubmissionHandler` + TH credentials + TH tables) and once with the JP client (`JPEInvoiceApiClientFactory` + `JPEInvoiceSubmissionHandler` + JP credentials + JP tables).

**Frontend:**
- **Path helper** at [src/components/AdjustmentDocs/useAdjustmentDocsPaths.ts](../src/components/AdjustmentDocs/useAdjustmentDocsPaths.ts) — `getAdjustmentDocsPaths(company)` returns `{ apiBase, invoiceApiBase, paymentsApiBase, invoicesSearchApi, uiBase, invoiceUiBase }`.
- **Shared pages accept `company` prop**: `AdjustmentDocsListPage`, `AdjustmentDocsFormPage`, `AdjustmentDocsDetailsPage`, `InvoiceAdjustmentDocsSection`. All API calls and navigate() targets derive from the paths helper.
- **JP page wrappers** at `src/pages/JellyPolly/AdjustmentDocs/JPAdjustmentDocsListPage.tsx`, `…/JPAdjustmentDocsFormPage.tsx`, `…/JPAdjustmentDocsDetailsPage.tsx` — thin one-liners that render the shared page with `company="jellypolly"`.
- **JP sidebar** entry added in [src/pages/JellyPollyNavData.tsx](../src/pages/JellyPollyNavData.tsx) under Sales > Adjustment Documents (registers `/jellypolly/sales/adjustment-docs`, `/new`, `/:id`).
- **JP invoice integration**:
  - [src/pages/JellyPolly/InvoiceListPage.tsx](../src/pages/JellyPolly/InvoiceListPage.tsx) — `Documents` mini button between Consolidated and Refresh.
  - [src/pages/JellyPolly/InvoiceDetailsPage.tsx](../src/pages/JellyPolly/InvoiceDetailsPage.tsx) — Debit / Credit / Refund Note buttons (visibility-gated like TH) plus `<InvoiceAdjustmentDocsSection company="jellypolly" />` below the main card.

**Bugs found and fixed during refactor:**
- The TH `findConsolidatedParentId` and `resolveReferencedDocument` helpers ordered `invoices` by `created_at` (column doesn't exist). Changed to `CAST(createddate AS bigint) DESC NULLS LAST`.
- The initial `DEFAULT_TABLES` constant got accidentally caught by the `replace_all` of `adjustment_documents` → `${T.docs}`, which made `T.docs` resolve to the literal string `"${T.docs}"`. Restored to literal table names.

### Phase 6 — earlier scratch notes (kept for reference)

**What shipped:**
- **[migrations/002_create_jp_adjustment_documents.sql](../migrations/002_create_jp_adjustment_documents.sql)** — `jellypolly.adjustment_documents` and `jellypolly.adjustment_document_lines` with FKs to `jellypolly.invoices` and `jellypolly.payments`. Reuses the shared `adjustment_documents_touch_updated_at()` trigger function. **Applied to dev DB.**
- **Templates parameterised**:
  - [`EInvoiceAdjustmentNoteTemplate.js`](../src/utils/invoice/einvoice/EInvoiceAdjustmentNoteTemplate.js) now accepts an optional `supplierInfo` 4th argument (defaults to `TIENHOCK_INFO`).
  - [`EInvoiceConsolidatedAdjustmentTemplate.js`](../src/utils/invoice/einvoice/EInvoiceConsolidatedAdjustmentTemplate.js) `args.supplierInfo` works the same way.
  - JP can pass `JELLYPOLLY_INFO` from `companyInfo.js` without forking the template files.
- **CLAUDE.md** and **AGENTS.md** schema sections updated.

**What still remains for Phase 6:**

1. **JP route file** — `src/routes/jellypolly/adjustment-docs.js`. Easiest path is to refactor `src/routes/sales/adjustment-docs/index.js` to accept a 3rd `options` param `{ tables: { docs, lines, invoices, payments }, supplierInfo }` and template-literal-ize the SQL table names, then create a tiny JP wrapper:
   ```js
   import createAdjustmentDocsRouter from "../sales/adjustment-docs/index.js";
   import { JELLYPOLLY_INFO } from "../../utils/invoice/einvoice/companyInfo.js";
   export default (pool, myInvoisConfig) => createAdjustmentDocsRouter(pool, myInvoisConfig, {
     tables: {
       docs: "jellypolly.adjustment_documents",
       lines: "jellypolly.adjustment_document_lines",
       invoices: "jellypolly.invoices",
       payments: "jellypolly.payments",
     },
     supplierInfo: JELLYPOLLY_INFO,
   });
   ```
   Inside the TH file, replace all hardcoded `adjustment_documents` / `adjustment_document_lines` / `invoices` / `payments` SQL references with `${T.docs}` / `${T.lines}` / `${T.invoices}` / `${T.payments}` (the helpers `generateNextDocId`, `findConsolidatedParentId`, `applyBalanceDelta`, `insertDoc`, `fetchDocWithRelations`, `resolveReferencedDocument` need to either be moved inside the factory closure or accept a `T` parameter). The helper modules `accounting.js` is shared (uses `journal_entries`, `account_codes`, `customers` which are all shared tables).
2. **Wire JP route** in `src/routes/index.js`:
   ```js
   import jellypollyAdjustmentDocsRouter from "./jellypolly/adjustment-docs.js";
   ...
   app.use("/jellypolly/api/adjustment-docs", jellypollyAdjustmentDocsRouter(pool, myInvoisJPConfig));
   ```
3. **Extend auto-consolidation** — `src/utils/invoice/autoAdjustmentConsolidation.js` currently only processes Tien Hock. Add a parallel `processJellypollyAdjustmentConsolidations(pool)` that queries `jellypolly.adjustment_documents` against `jellypolly.invoices` using `MYINVOIS_JP_CLIENT_ID/SECRET` and JPEInvoiceApiClientFactory + JPEInvoiceSubmissionHandler. Server cron call it after TH.
4. **JP page wrappers** — easiest path is to make the existing pages accept a `company` prop with TH default that controls API base path (`/api/adjustment-docs` vs `/jellypolly/api/adjustment-docs`) and UI base path (`/sales/...` vs `/jellypolly/sales/...`). Then create thin JP page files that pass `company="jellypolly"`. Affected pages: `AdjustmentDocsListPage`, `AdjustmentDocsFormPage`, `AdjustmentDocsDetailsPage`. Update `InvoiceAdjustmentDocsSection.tsx` so it derives the API path from the company prop (currently only takes `basePath` for navigation).
5. **JP sidebar entry** — add to `src/pages/JellyPollyNavData.tsx` under Sales (same position as TH).
6. **JP invoice integration** — mirror Phase 3's `Documents` mini button + DN/CN/RN buttons + InvoiceAdjustmentDocsSection on JP InvoiceListPage and InvoiceDetailsPage.

**Critical files to read first when resuming Phase 6**:
- `src/routes/jellypolly/invoices.js` (mirror this pattern)
- `src/routes/jellypolly/payments.js` (confirm payment-status semantics match TH — especially the `'overpaid'` status used by Refund Notes)
- `src/utils/JellyPolly/einvoice/JPEInvoiceApiClientFactory.js` and `JPEInvoiceSubmissionHandler.js` (for the auto-consolidation extension)
- `src/pages/JellyPolly/Invoice/*` and `src/pages/JellyPolly/Payments/*` for page integration points
- `src/pages/JellyPollyNavData.tsx` for sidebar position

Phase 7 (Green Target) has not been started — its database schema and field names diverge significantly from TH/JP, so it needs its own design pass and templates (see Phase 7 section above for the diverging fields).

# Phase 7 — Green Target Adjustment Documents (CN / DN / RN)

## Status (handover snapshot)

| Sub-phase | Status | Files touched |
|---|---|---|
| 7.1 — DB migration + GT router + invoice cancel blocks | ✅ done | see "What's done" |
| 7.2 — E-invoice templates + route registration | ✅ done | see "What's done" |
| 7.3 — Auto-consolidation extension for GT | ✅ done | see "What's done" |
| 7.4 — Forked GT pages (List / Form / Details) + inline section | ✅ done | see "What's done" |
| 7.5 — GT invoice page integration (DN/CN buttons + embedded section + Documents button) | ⏳ **next** | not started |
| 7.6 — Sidebar entry + register the 3 routes in `pagesRoute.tsx` | ⏳ pending | not started |
| 7.7 — Cross-cutting (CHANGELOG, CLAUDE.md/AGENTS.md, types) | ⏳ pending | not started |

---

## Context (why)

Phases 1–6 of the Adjustment Documents project shipped CN/DN/RN for Tien Hock and Jelly Polly. Both share a single factory router and three shared React pages. Phase 6.5 hardened concurrent submission, wrapper cancellation, cumulative RN caps, snapshot refresh, invoice-cancel blocks, and form validation. Recent uncommitted polish (InvoiceCard / InvoiceTotals / both InvoiceDetailsPage files) made invoice cards and totals adjustment-aware (strikethrough original total, ± DN/CN lines, new "Refunded / Partially Refunded / Credited / Credit Balance" badges).

**Green Target is forked, not shared**, because nearly every column name differs (invoice_id integer vs string id, date_issued date vs createddate unix ms text, amount_before_tax / total_amount vs total_excluding_tax / totalamountpayable, no salesperson, no journal_entries table, no customers.credit_used, no 'overpaid' payment status, line items are description-driven with no code system, no rounding column).

**Decisions confirmed with user (2026-05-21):**
1. **Refund Notes**: paired-RN only — no standalone "overpaid payment" trigger. CN form has the same "Issue paired Refund Note" toggle when invoice has any active payment.
2. **Accounting**: no journals, no customer credit cascade. GT adjustment docs only mutate `greentarget.invoices.balance_due` and re-derive invoice status.
3. **Pages**: forked under `src/pages/GreenTarget/AdjustmentDocs/`. Match GT inline-edit + confirmation-dialog conventions.
4. **Auto-consolidation**: add a GT block to `autoAdjustmentConsolidation.js` even though GT invoices aren't auto-consolidated today — future-proofs the cron.

---

## What's done

### 7.1 — Database + backend router + invoice cancel blocks

**Migration applied to dev DB:**
- [migrations/003_create_gt_adjustment_documents.sql](../../tienhock/migrations/003_create_gt_adjustment_documents.sql) — creates `greentarget.adjustment_documents` and `greentarget.adjustment_document_lines`, indexes, and reuses the shared `adjustment_documents_touch_updated_at()` trigger function from migration 001. **Applied.**
- Schema diffs vs TH/JP: `original_invoice_id` is `INTEGER` (FK to `greentarget.invoices.invoice_id`), `original_invoice_number` snapshot column, `customer_id` integer (nullable), `customer_name` snapshot, `date_issued` DATE, `amount_before_tax` / `tax_amount` / `total_amount` (no `rounding`), no `salespersonid`, no `journal_entry_id`, no `linked_payment_id` (paired-RN only). All e-invoice/wrapper columns mirror TH.

**Backend router:**
- [src/routes/greentarget/adjustment-docs.js](../../tienhock/src/routes/greentarget/adjustment-docs.js) — full fork of TH's router (~1100 lines). All 11 endpoints implemented: `next-number/:type`, `GET /`, `GET /:id`, `POST /`, `POST /:id/cancel`, `POST /:id/submit-einvoice`, `POST /:id/update-status`, `POST /:id/cancel-einvoice`, `POST /:id/clear-einvoice-status`, `GET /eligible-for-consolidation`, `POST /submit-consolidated`, `GET /consolidated-history`.
- **No journal posting, no customer credit updates** — only `applyBalanceDelta` mutates `greentarget.invoices.balance_due` and re-derives status (`paid` if ≤ tolerance, preserves `cancelled`/`overdue`, otherwise `active`).
- Paired-RN only: standalone-RN guard rejects when `paired_credit_note_id` is missing for `type=refund_note`.
- GT submission handler returns `{ success, submissionUid, document: { uuid, longId, dateTimeValidated } }` (singular `document`, not `acceptedDocuments[0]`) — handled in `submit-einvoice` and `submit-consolidated`.
- ID prefixes: `GT-CN-YYYY-NNNN`, `GT-DN-...`, `GT-RN-...`. Consolidated wrapper: `CON-GT-{CN|DN|RN}-YYYYMM-N`.
- All Phase 6.5 hardenings carried forward: `FOR UPDATE` lock on submit, wrapper cancellation behaviour split, snapshot refresh in `resolveReferencedDocument`, parent re-validation before consolidated MyInvois call.

**Invoice cancel blocks:**
- [src/routes/greentarget/invoices.js](../../tienhock/src/routes/greentarget/invoices.js) — both `PUT /:invoice_id/cancel` (~line 982) and `DELETE /:invoice_id` (~line 1111) now reject when active (non-consolidated) adjustment documents reference the invoice, returning a 400 with the offending doc IDs.

### 7.2 — E-invoice templates + route registration

**Templates:**
- [src/utils/greenTarget/einvoice/GTEInvoiceAdjustmentNoteTemplate.js](../../tienhock/src/utils/greenTarget/einvoice/GTEInvoiceAdjustmentNoteTemplate.js) — fork of TH's adjustment template. Uses `GREENTARGET_INFO`, `date_issued` (DATE), no rounding, description-driven lines (no OTH/LESS/REFUND code handling).
- [src/utils/greenTarget/einvoice/GTEInvoiceConsolidatedAdjustmentTemplate.js](../../tienhock/src/utils/greenTarget/einvoice/GTEInvoiceConsolidatedAdjustmentTemplate.js) — fork of TH's consolidated template. Each child becomes one InvoiceLine; description includes `original_invoice_number` (not numeric `original_invoice_id`).

**Route registration:**
- [src/routes/index.js](../../tienhock/src/routes/index.js) — imports `greenTargetAdjustmentDocsRouter` (lowercase `./greentarget/` to match disk convention; `utils/greenTarget/` is capitalised, routes/`greentarget/` is lowercase) and mounts at `/greentarget/api/adjustment-docs` with `myInvoisGTConfig`.
- Smoke tested via `node -e "import(...).then(...)"`.

### 7.3 — Auto-consolidation extension for GT

- [src/utils/invoice/autoAdjustmentConsolidation.js](../../tienhock/src/utils/invoice/autoAdjustmentConsolidation.js) gained:
  - New imports: `GTEInvoiceApiClientFactory`, `GTEInvoiceSubmissionHandler`, `GTEInvoiceConsolidatedAdjustmentTemplate`, `GREENTARGET_INFO`, `MYINVOIS_GT_CLIENT_ID/SECRET`.
  - New `processGreenTargetAdjustmentConsolidation(pool, cfg)` function (parallel to `processCompany`, not a parameterised reuse — too many column differences) that uses GT field names (`date_issued`, `amount_before_tax`, `total_amount`, `original_invoice_number`, `invoice_id`), GT submission handler shape, and `CON-GT-...-AUTO` ID prefix.
  - Cron entry point `checkAndProcessDueAdjustmentConsolidations(pool)` now calls it after TH and JP.
- All TH/JP behaviour is untouched.

### 7.4 — Forked GT frontend pages

- [src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsListPage.tsx](../../tienhock/src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsListPage.tsx) — list with 4 type tabs, date_issued filter, search, status/einvoice-status dropdowns, table. Reuses the shared `AdjustmentDocTypeBadge` / `AdjustmentDocStatusBadge` from `src/components/AdjustmentDocs/AdjustmentDocBadge` (same shape works for GT). No "New Refund Note" button (paired-only).
- [src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage.tsx](../../tienhock/src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage.tsx) — create form with invoice picker (queries `/greentarget/api/invoices`), date_issued picker (defaults today), description-driven line table (no code column), CN paired-refund toggle (default ON when invoice has any active payment), refund-method/bank/reference fields, sen-safe totals. Pre-fills a single line for CN/DN using rental description summary. For replacement RN (`?creditNoteId=...`), pre-fills REFUND line with refundable excess.
- [src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsDetailsPage.tsx](../../tienhock/src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsDetailsPage.tsx) — read-only view with all the e-invoice action buttons (Submit / Clear & Retry / Re-submit / Update Status / Cancel e-Invoice / Cancel Document / Reissue Refund Note). Paired-doc panel, refund details panel, line items table, totals + e-invoice metadata.
- [src/components/AdjustmentDocs/GTInvoiceAdjustmentDocsSection.tsx](../../tienhock/src/components/AdjustmentDocs/GTInvoiceAdjustmentDocsSection.tsx) — forked inline section to render on GT InvoiceDetailsPage. Hides itself when no docs exist.

All pages use direct paths (no path helper):
- API base: `/greentarget/api/adjustment-docs`
- UI base: `/greentarget/adjustment-docs`
- Invoice API: `/greentarget/api/invoices`
- Invoice UI: `/greentarget/invoice/{invoice_id}` (GT navigates by integer invoice_id)

---

## What's left

### 7.5 — GT invoice page integration  ← **NEXT**

**File**: [src/pages/GreenTarget/Invoices/InvoiceListPage.tsx](../../tienhock/src/pages/GreenTarget/Invoices/InvoiceListPage.tsx)
- Add a **"Documents"** mini button in the action bar (look for the existing Consolidated / Refresh cluster; match TH's pattern at `src/pages/Invoice/InvoiceListPage.tsx`). Pure navigation to `/greentarget/adjustment-docs`. Use `IconFileText`, size `sm`, variant `outline`.

**File**: [src/pages/GreenTarget/Invoices/InvoiceDetailsPage.tsx](../../tienhock/src/pages/GreenTarget/Invoices/InvoiceDetailsPage.tsx)
- Action bar (next to existing Print/Pay/Cancel cluster — find by grepping for the existing button cluster around line 590–650 per the original explore report) — add two buttons, both gated on `invoice.status !== 'cancelled'`:
  - **Debit Note** (`IconFilePlus`, amber outline) → `/greentarget/adjustment-docs/new?type=debit&invoiceId={invoice_id}`
  - **Credit Note** (`IconFileMinus`, rose outline) → `/greentarget/adjustment-docs/new?type=credit&invoiceId={invoice_id}`
  - **No Refund Note button** (paired-only model — RN is reached through the CN form or via the "Issue/Reissue Refund Note" action on a CN's details page).
- Render `<GTInvoiceAdjustmentDocsSection invoiceId={invoice.invoice_id} />` below the main invoice card (or in a sensible spot near the Payments section). Import from `../../../components/AdjustmentDocs/GTInvoiceAdjustmentDocsSection`.

### 7.6 — Sidebar + routes

**File**: [src/pages/pagesRoute.tsx](../../tienhock/src/pages/pagesRoute.tsx)
- Register three routes:
  - `/greentarget/adjustment-docs` → `GTAdjustmentDocsListPage`
  - `/greentarget/adjustment-docs/new` → `GTAdjustmentDocsFormPage`
  - `/greentarget/adjustment-docs/:id` → `GTAdjustmentDocsDetailsPage`

**File**: GT sidebar — check whether the active file is `src/pages/GreenTarget/GreenTargetSidebarData.tsx` or `src/pages/GreenTargetNavData.tsx` (the explore report flagged both; check which one is actually imported in `App.tsx` / `pagesRoute.tsx`). Add a "Adjustment Documents" entry between **Invoices** and **Payments**, path `/greentarget/adjustment-docs`. Use `IconFileText` or `IconFileInvoice` for the icon.

### 7.7 — Cross-cutting

- **CHANGELOG**: prepend a bilingual (ms + en) entry to `CHANGELOG_ENTRIES` in [src/components/ChangelogModal.tsx](../../tienhock/src/components/ChangelogModal.tsx), dated when shipped. End-user phrasing — mirror the existing TH and JP adjustment-docs entries (commits `c5843932` for TH and `d043f62c` for JP).
- **CLAUDE.md / AGENTS.md** schema sections: add `greentarget.adjustment_documents` and `greentarget.adjustment_document_lines` under the Green Target subsection. Per CLAUDE.md rule 13.
- **Types** ([src/types/types.ts](../../tienhock/src/types/types.ts)): optional — add `GTAdjustmentDocument` interface if it would clean up the inline types in the GT pages. Currently each page defines its own interface inline; that's acceptable for forked pages, but a shared interface might be tidier.

---

## Critical files / patterns to remember

### Backend
- [src/routes/sales/adjustment-docs/index.js](../../tienhock/src/routes/sales/adjustment-docs/index.js) — TH source of truth. GT router was a careful fork; behaviour should match endpoint-for-endpoint except for the documented divergences (no journals, no credit cascade, paired-RN only).
- [src/routes/greentarget/adjustment-docs.js](../../tienhock/src/routes/greentarget/adjustment-docs.js) — the GT router itself.
- [src/utils/invoice/autoAdjustmentConsolidation.js](../../tienhock/src/utils/invoice/autoAdjustmentConsolidation.js) — `processGreenTargetAdjustmentConsolidation` is the GT-specific function; `processCompany` is unchanged and still handles TH + JP.

### Templates
- [src/utils/greenTarget/einvoice/GTEInvoiceAdjustmentNoteTemplate.js](../../tienhock/src/utils/greenTarget/einvoice/GTEInvoiceAdjustmentNoteTemplate.js)
- [src/utils/greenTarget/einvoice/GTEInvoiceConsolidatedAdjustmentTemplate.js](../../tienhock/src/utils/greenTarget/einvoice/GTEInvoiceConsolidatedAdjustmentTemplate.js)

### Frontend
- [src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsListPage.tsx](../../tienhock/src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsListPage.tsx)
- [src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage.tsx](../../tienhock/src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage.tsx)
- [src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsDetailsPage.tsx](../../tienhock/src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsDetailsPage.tsx)
- [src/components/AdjustmentDocs/GTInvoiceAdjustmentDocsSection.tsx](../../tienhock/src/components/AdjustmentDocs/GTInvoiceAdjustmentDocsSection.tsx)

### Shared (used unchanged by GT)
- [src/components/AdjustmentDocs/AdjustmentDocBadge.tsx](../../tienhock/src/components/AdjustmentDocs/AdjustmentDocBadge.tsx) — `AdjustmentDocTypeBadge`, `AdjustmentDocStatusBadge`, `ADJUSTMENT_DOC_TYPE_META`. Same shape works for GT.
- [src/components/ConfirmationDialog.tsx](../../tienhock/src/components/ConfirmationDialog.tsx) — used for cancel confirmations.

### GT integration reference (read before doing 7.5)
- [src/pages/Invoice/InvoiceDetailsPage.tsx](../../tienhock/src/pages/Invoice/InvoiceDetailsPage.tsx) and [src/pages/JellyPolly/InvoiceDetailsPage.tsx](../../tienhock/src/pages/JellyPolly/InvoiceDetailsPage.tsx) — TH/JP patterns for the DN/CN/RN button cluster and `<InvoiceAdjustmentDocsSection ... />` placement.
- [src/pages/Invoice/InvoiceListPage.tsx](../../tienhock/src/pages/Invoice/InvoiceListPage.tsx) — the "Documents" mini button between Consolidated and Refresh.

---

## Smoke tests already done

- `node --check` clean on all new/modified JS files.
- `node -e "import('./src/routes/greentarget/adjustment-docs.js')..."` resolves all imports.
- `node -e "import('./src/utils/invoice/autoAdjustmentConsolidation.js')..."` resolves all imports.
- Migration successfully applied to dev DB.

---

## Verification once 7.5–7.7 are done

1. Open `/greentarget/adjustment-docs` → list page loads (empty until first doc is created).
2. From any non-cancelled GT invoice, click **Credit Note** → form loads with the invoice pre-selected; pre-filled with one line. Submit → CN row appears, `greentarget.invoices.balance_due` drops by the CN amount.
3. From a paid GT invoice, create a Credit Note with paired-refund toggle ON → CN + RN both inserted with matched `paired_with_id`s; net balance change = (CN − RN).
4. Cancel RN (must come first), then CN → balance reversed to original. **Verify no `journal_entries` row was ever touched** (GT is outside the ledger).
5. Cancel a GT invoice that has an active adjustment doc → 400 with `adjustment_documents: ['GT-CN-...']` list.
6. Submit individual e-invoice for a CN against a GT invoice with a valid UUID → BillingReference XML contains `original_invoice_number` + UUID; persisted uuid/long_id/status.
7. Days-3-7 cron window: manually invoke `checkAndProcessDueAdjustmentConsolidations(pool)` and confirm GT block executes (label "Green Target" appears in logs).
8. CHANGELOG modal shows the new entry in both BM and EN.

## Out of scope (deferred)

- Standalone Refund Notes for GT (would require an "overpaid" payment status concept that doesn't exist today).
- Customer credit cascade on GT (no `credit_used` column).
- `greentarget.journal_entries` table (GT remains outside the shared ledger).
- Bulk e-invoice batch submit on the GT list page.
- Sales summary / aging report netting of GT adjustments.

---

## Phase 1 — Database + Backend Foundation (Tien Hock)

### Schema

```sql
CREATE TABLE adjustment_documents (
  id              VARCHAR PRIMARY KEY,            -- DN-2026-0001 / CN-2026-0001 / RN-2026-0001
  type            VARCHAR(20) NOT NULL,           -- credit_note | debit_note | refund_note
  original_invoice_id VARCHAR NOT NULL REFERENCES invoices(id),
  customerid      VARCHAR NOT NULL,               -- snapshot for reporting/filter
  salespersonid   VARCHAR,                        -- snapshot
  createddate     BIGINT NOT NULL,                -- unix ms, matches invoices.createddate
  reason          TEXT,                           -- user-entered reason / description
  paired_with_id  VARCHAR REFERENCES adjustment_documents(id),  -- CN<->RN pairing
  linked_payment_id INTEGER REFERENCES payments(payment_id),    -- standalone RN against overpaid payment
  references_consolidated_id VARCHAR,             -- CON-* parent id when original was consolidated
  -- Totals
  total_excluding_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  rounding        NUMERIC(12,2) NOT NULL DEFAULT 0,
  totalamountpayable NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Refund-specific
  refund_method   VARCHAR,                        -- cash | cheque | bank_transfer | online (RN only)
  refund_reference VARCHAR,                       -- RN only
  bank_account    VARCHAR,                        -- RN only, mirrors payments table
  -- E-invoice
  uuid            VARCHAR,
  submission_uid  VARCHAR,
  long_id         VARCHAR,
  datetime_validated TIMESTAMP,
  einvoice_status VARCHAR,                        -- valid | pending | invalid | cancelled | null
  -- Consolidation (when this row IS the consolidated wrapper)
  is_consolidated BOOLEAN DEFAULT FALSE,
  consolidated_adjustments JSONB,                 -- array of child adj doc IDs when is_consolidated
  -- Local status
  status          VARCHAR DEFAULT 'active',       -- active | cancelled
  cancellation_reason TEXT,
  cancellation_date TIMESTAMP,
  -- Accounting
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  -- Audit
  created_by      VARCHAR,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE adjustment_document_lines (
  id              SERIAL PRIMARY KEY,
  adjustment_doc_id VARCHAR NOT NULL REFERENCES adjustment_documents(id) ON DELETE CASCADE,
  code            VARCHAR,
  description     TEXT,
  quantity        NUMERIC,
  price           NUMERIC(12,2),
  tax             NUMERIC(12,2),
  total           NUMERIC(12,2),
  issubtotal      BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_adj_docs_orig_inv     ON adjustment_documents(original_invoice_id);
CREATE INDEX idx_adj_docs_paired       ON adjustment_documents(paired_with_id);
CREATE INDEX idx_adj_docs_type_created ON adjustment_documents(type, created_at DESC);
CREATE INDEX idx_adj_docs_einvoice     ON adjustment_documents(einvoice_status);
CREATE INDEX idx_adj_docs_status       ON adjustment_documents(status);
```

Update CLAUDE.md / AGENTS.md database schema sections to reflect these tables.

### Routes — create `src/routes/sales/adjustment-docs/`

- `index.js` — main router: GET list / GET :id / POST / POST :id/cancel / POST :id/clear-status / GET next-number/:type
- `accounting.js` — helpers for journal entry creation/reversal (Dr Sales Returns / Cr A/R for CN; reverse for DN; Dr A/R or Bank refund / Cr Cash for RN). Reuse pattern from `src/routes/sales/invoices/payments.js` `createOverpaidJournalEntry`.
- Register under `src/routes/index.js` at `/api/adjustment-docs`.

### Atomic create transaction must:

1. Generate next ID (`SELECT MAX(...) WHERE id LIKE 'CN-2026-%'` + 1).
2. Validate original invoice exists and is not cancelled.
3. Validate line items (price, quantity).
4. INSERT `adjustment_documents` + `adjustment_document_lines`.
5. UPDATE `invoices.balance_due` (CN: -=, DN: +=).
6. UPDATE `customers.credit_used` (CN: -=, DN: +=).
7. INSERT journal entry + journal entry lines.
8. If CN form had refund toggle ON, recursively create paired RN (set `paired_with_id` both ways).
9. Commit.

### Cancellation must:

1. If CN has paired_with_id → block unless paired RN is already cancelled.
2. Reverse balance_due, credit_used, journal entry.
3. If e-invoice was submitted (valid/pending), call MyInvois cancel via `EInvoiceSubmissionHandler` (PUT `/documents/state/:uuid/state`).
4. UPDATE status='cancelled', cancellation_reason/date.

### Critical files to reuse / reference

- `src/routes/sales/invoices/payments.js` — overpayment + journal entry patterns
- `src/routes/utils/db-pool.js` — `BEGIN`/`COMMIT`/`ROLLBACK` transaction pattern
- `src/routes/sales/invoices/invoices.js` — duplicate-id check pattern; cancellation cascade reference

---

## Phase 2 — Frontend Pages (Tien Hock, with shared-component scaffolding)

### Shared components (`src/components/AdjustmentDocs/`)

Build with `company: 'tienhock' | 'jellypolly'` prop. (GT has its own components in Phase 7.)

- `AdjustmentDocBadge.tsx` — type pill (CN/DN/RN) + status pill
- `AdjustmentDocLineItemsTable.tsx` — fork from `LineItemsTable` ([src/components/Invoice/LineItemsTable.tsx](../src/components/Invoice/LineItemsTable.tsx)), with "Copy from original" button
- `ConsolidatedAdjustmentDocsModal.tsx` — fork from [src/components/Invoice/ConsolidatedInvoiceModal.tsx](../src/components/Invoice/ConsolidatedInvoiceModal.tsx) (used in Phase 5)

### Pages (`src/pages/AdjustmentDocs/`)

- **AdjustmentDocsListPage.tsx** — 4 filter tabs (All / Debit / Credit / Refund), sorted newest-first, columns: ID, Type, Original Invoice, Customer, Amount, e-Invoice Status, Created. Reuse filters from [src/pages/Payments/PaymentPage.tsx](../src/pages/Payments/PaymentPage.tsx). Batch e-invoice submission mirror from [src/pages/Invoice/InvoiceListPage.tsx](../src/pages/Invoice/InvoiceListPage.tsx) lines 1682-1884.
- **AdjustmentDocsFormPage.tsx** — accepts `?type=credit|debit|refund&invoiceId=...`. Loads original invoice + customer + line items. CN form shows "Issue paired Refund Note" toggle (defaults ON if any active payment exists). RN form when arrived via `&paymentId=` (standalone overpayment) OR within CN paired flow. Reuses `LineItemsTable`, `InvoiceTotals`.
- **AdjustmentDocsDetailsPage.tsx** — full doc view, lines, paired doc link, journal entry preview, e-invoice status box with Submit/Update/Cancel. Reuse `EInvoicePrintHandler`, `SubmissionResultsModal`.

### Routing + sidebar

- Add route entries in [src/pages/pagesRoute.tsx](../src/pages/pagesRoute.tsx) — flat under `/sales/adjustment-docs`, `/sales/adjustment-docs/new`, `/sales/adjustment-docs/:id`.
- Add sidebar entry in [src/pages/Sales/TienHockSidebarData.tsx](../src/pages/Sales/TienHockSidebarData.tsx) under Sales, below "Payments", name: "Adjustment Documents".

---

## Phase 3 — Invoice & Payment Integration (Tien Hock)

### [src/pages/Invoice/InvoiceListPage.tsx](../src/pages/Invoice/InvoiceListPage.tsx)

Add a "Documents" mini button in the action bar between "Consolidated" (~line 1850) and "Refresh" (~line 1861). Pure navigation to `/sales/adjustment-docs`. Use `IconNotes` or `IconFileDescription`. Size `sm`, variant `outline`.

### [src/pages/Invoice/InvoiceDetailsPage.tsx](../src/pages/Invoice/InvoiceDetailsPage.tsx)

**Action bar (~line 1517, immediately to the left of "Print")** — add three buttons:

1. **Debit Note** — visible when `invoice_status !== 'cancelled'`. Navigates to `/sales/adjustment-docs/new?type=debit&invoiceId={id}`.
2. **Credit Note** — same visibility rule. Navigates to `/sales/adjustment-docs/new?type=credit&invoiceId={id}`.
3. **Refund Note** — visible only when an overpaid Payment exists and has no active linked RN. Navigates to `/sales/adjustment-docs/new?type=refund&invoiceId={id}&paymentId={overpaidPaymentId}`.

**New "Adjustment Documents" section** between Invoice Info card and Payments section. Fetches `GET /api/adjustment-docs?original_invoice_id={id}`. Table with type badge, ID, amount, e-invoice status, created date, click-through to details page. Empty state: "No adjustment documents for this invoice."

### Payment page integration

[src/pages/Payments/PaymentPage.tsx](../src/pages/Payments/PaymentPage.tsx) — no structural change required for Phase 3. Consider "Refunded" badge on overpaid payment rows once Phase 4 RN is live (small follow-up).

---

## Phase 4 — Individual E-Invoice (Tien Hock)

### New templates (`src/utils/invoice/einvoice/`)

- **EInvoiceCreditNoteTemplate.js** — fork from [src/utils/invoice/einvoice/EInvoiceTemplate.js](../src/utils/invoice/einvoice/EInvoiceTemplate.js). `InvoiceTypeCode` = `02`. Populate `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>{original_invoice_id}</cbc:ID><cbc:UUID>{original_uuid}</cbc:UUID></cac:InvoiceDocumentReference></cac:BillingReference>`. Match [1.0-Credit-Note-Sample.xml](../1.0-Credit-Note-Sample.xml).
- **EInvoiceDebitNoteTemplate.js** — `InvoiceTypeCode` = `03`. Match [1.0-Debit-Note-Sample.xml](../1.0-Debit-Note-Sample.xml).
- **EInvoiceRefundNoteTemplate.js** — `InvoiceTypeCode` = `04`. Match [1.0-Refund-Note-Sample.xml](../1.0-Refund-Note-Sample.xml).

All three reuse `formatAmount`, `formatDate`, `formatPhoneNumber`, `escapeXml`, `calculateTaxAndTotals`, `generateInvoiceLines`, `generateTaxSubtotals` from `EInvoiceTemplate.js`. Extract to a shared `eInvoiceCommon.js` if duplication becomes noisy.

### Submission endpoint

`POST /api/adjustment-docs/:id/submit-einvoice`:
1. Fetch adj doc + original invoice + customer.
2. Validate: original has a UUID (either via `einvoice_status='valid'` OR via `references_consolidated_id` pointing to a consolidated invoice with UUID). If neither, return clear error.
3. Build XML from matching template.
4. Reuse `EInvoiceApiClientFactory.getInstance(apiConfig)` and `EInvoiceSubmissionHandler.submitAndPollDocuments(xml)`.
5. Persist response (uuid, long_id, status, submission_uid, datetime_validated).

Batch submit on list page reuses the same handler, looping per doc.

### Status update + cancellation

- `POST /api/adjustment-docs/:id/update-status` — calls MyInvois `GET /documents/:uuid/details`, updates local row.
- `POST /api/adjustment-docs/:id/cancel` — calls MyInvois `PUT /documents/state/:uuid/state`, then full reversal cascade (Phase 1).

---

## Phase 5 — Consolidated E-Invoice (Tien Hock)

### Template `EInvoiceConsolidatedAdjustmentTemplate.js`

Fork from [src/utils/invoice/einvoice/EInvoiceConsolidatedTemplate.js](../src/utils/invoice/einvoice/EInvoiceConsolidatedTemplate.js). Differences:

- `InvoiceTypeCode` parameterised: `02` CN / `03` DN / `04` RN
- **BillingReference** populated with the parent consolidated invoice's UUID
- Each child adjustment doc becomes one `<cac:InvoiceLine>` (description e.g. "Adjustment for CN-2026-0001 (Invoice INV123)")
- Customer party uses "Consolidated Customers" placeholder (TIN `EI00000000010`)

### Grouping logic

New helper `createConsolidatedAdjustmentGroups(adjDocs)`:

- Group by `(type, references_consolidated_id)` — each group → one consolidated submission
- IDs: `CON-CN-{YYYYMM}-{seq}` / `CON-DN-{YYYYMM}-{seq}` / `CON-RN-{YYYYMM}-{seq}`

### Auto-consolidation extension

Extend [src/utils/invoice/autoConsolidation.js](../src/utils/invoice/autoConsolidation.js):

- `getEligibleTienhockAdjustmentDocs(client, month, year)` — `references_consolidated_id IS NOT NULL`, parent has UUID, doc has no UUID, doc not cancelled, doc created in target month
- `processTienhockAdjustmentConsolidation(client, adjDocs, month, year)` — template + submit + persist
- Runs after existing invoice consolidation in same days 3-7 window

### Manual consolidation UI

Extend [src/components/Invoice/ConsolidatedInvoiceModal.tsx](../src/components/Invoice/ConsolidatedInvoiceModal.tsx) — new tabs/sub-filters for CN / DN / RN consolidation.

New API endpoints:
- `GET  /api/adjustment-docs/eligible-for-consolidation?type=&month=&year=`
- `POST /api/adjustment-docs/submit-consolidated`
- `GET  /api/adjustment-docs/consolidated-history?year=`
- `POST /api/adjustment-docs/consolidated/:id/update-status`
- `POST /api/adjustment-docs/consolidated/:id/cancel`

---

## Phase 6 — Jelly Polly Replication

JP shares ~95% of TH's shape:

- DB: `jellypolly.adjustment_documents` + `jellypolly.adjustment_document_lines`
- Routes: `src/routes/jellypolly/adjustment-docs/` — copy of TH routes, scoped to `jellypolly.*`
- Templates: `src/utils/JellyPolly/einvoice/JPEInvoiceCreditNoteTemplate.js` (+ DN, RN, consolidated)
- Shared frontend components from Phase 2 used with `company='jellypolly'` prop
- New JP-specific pages (thin wrappers) at `/jellypolly/sales/adjustment-docs/*`
- Sidebar update: [src/pages/JellyPolly/JellyPollySidebarData.tsx](../src/pages/JellyPolly/JellyPollySidebarData.tsx)
- Integrate into JP InvoiceListPage / InvoiceDetailsPage (same patterns as Phase 3)
- Auto-consolidation: add `processJellypollyAdjustmentConsolidation`

---

## Phase 7 — Green Target Implementation

GT diverges meaningfully (different schema, field names, page layout). Cannot share components with TH/JP.

### Schema

`greentarget.adjustment_documents`:
- PK: `adjustment_number` (string, e.g., `GT-CN-2026-0001`)
- `original_invoice_number` references `greentarget.invoices(invoice_number)`
- `customer_id` nullable
- `date_issued` (date, not timestamp)
- Field name parity with `greentarget.invoices`: `amount_before_tax`, `tax_amount`, `total_amount`, `balance_due`
- Same e-invoice/consolidation columns as TH
- Same `paired_with_id` self-FK

### Routes & templates

- `src/routes/greenTarget/adjustment-docs/`
- `src/utils/greenTarget/einvoice/GTEInvoiceCreditNoteTemplate.js` + DN, RN, consolidated
- Reuse `GTEInvoiceApiClientFactory` and `GTEInvoiceSubmissionHandler`

### Pages (separate from TH/JP)

- `src/pages/GreenTarget/AdjustmentDocs/AdjustmentDocsListPage.tsx`
- `src/pages/GreenTarget/AdjustmentDocs/AdjustmentDocsFormPage.tsx`
- `src/pages/GreenTarget/AdjustmentDocs/AdjustmentDocsDetailsPage.tsx`

GT specifics:
- Invoice details page uses inline editing with confirmation dialogs — adjustment doc buttons follow same pattern
- Rental-based invoices typically single-line
- Customer is nullable on GT invoices

### Integration

- [src/pages/GreenTarget/Invoices/InvoiceListPage.tsx](../src/pages/GreenTarget/Invoices/InvoiceListPage.tsx) — Documents mini button
- GT InvoiceDetailsPage — DN/CN/RN buttons following its confirmation-dialog convention
- `processGreentargetAdjustmentConsolidation` in `autoConsolidation.js`
- Sidebar: [src/pages/GreenTarget/GreenTargetSidebarData.tsx](../src/pages/GreenTarget/GreenTargetSidebarData.tsx)

---

## Cross-cutting concerns

### Customer credit cascade

`customers.credit_used` updated on every adjustment doc create/cancel. Verify against existing credit-limit enforcement.

### Reports / Sales Summary

Sales summary pages currently aggregate invoices. After this work, summaries should net adjustments. **Out of scope** for this plan — flag as a follow-up.

### CHANGELOG_ENTRIES

Prepend a multilingual entry per CLAUDE.md rule 16 to `src/components/ChangelogModal.tsx` when each phase ships.

### Database schema docs

Update **AGENTS.md** and **CLAUDE.md** "Database Schema" sections at the end of Phase 1, 6, and 7 (per CLAUDE.md rule 13).

---

## Verification

### Phase 1
- Create adjustment doc via direct API call, confirm tables + balance_due + credit_used + journal entry all update atomically. Confirm rollback on injected failure.

### Phase 2-3
- TH InvoiceDetailsPage: create a CN against a paid invoice → confirm paired RN auto-created → cancel RN → confirm CN now cancellable → cancel CN → confirm balance_due reverted, journal reversed.
- InvoiceListPage Documents button → confirm navigation to new list page.
- Standalone RN path: trigger payment overpayment → confirm overpaid Payment row exists → confirm RN button visible → click → form pre-filled.

### Phase 4
- Submit individual CN for an e-invoiced original → confirm BillingReference contains correct UUID in submitted XML.
- Cancel within 72h → confirm MyInvois state changes + local reversal cascade.
- Attempt submission before original has UUID → confirm clear error message.

### Phase 5
- During days 3-7 (or simulate): create adjustments for an already-consolidated month → run auto-consolidation → confirm one wrapper doc per (type, parent) appears with `is_consolidated=true` and child adj docs all have submission_uid.
- Open ConsolidatedInvoiceModal → confirm new tabs show eligible adj docs → manual submit works.

### Phase 6
- Run Phase 2-5 verification on `/jellypolly` routes.

### Phase 7
- Run Phase 2-5 verification on `/greentarget` routes, paying attention to inline-editing confirmation dialogs and the rental-invoice single-line case.

### Regression
- Create new invoice, submit e-invoice, cancel — confirm nothing broken.
- Pay an invoice + overpay — confirm overpaid Payment record still creates correctly.
- Run consolidation for a month with no adjustment docs — confirm existing behaviour preserved.

---

## Critical files to read before starting each phase

| Phase | Files |
|---|---|
| 1 | `src/routes/sales/invoices/payments.js`, `src/routes/sales/invoices/invoices.js`, `src/routes/utils/db-pool.js`, `src/routes/accounting/payment-journal.js` |
| 2 | `src/components/Invoice/LineItemsTable.tsx`, `src/components/Invoice/InvoiceTotals.tsx`, `src/components/Invoice/SubmissionResultsModal.tsx`, `src/pages/Payments/PaymentPage.tsx`, `src/pages/pagesRoute.tsx`, `src/pages/Sales/TienHockSidebarData.tsx` |
| 3 | `src/pages/Invoice/InvoiceListPage.tsx` (~1682-1884), `src/pages/Invoice/InvoiceDetailsPage.tsx` (~1453-1560, 1683-1823), `src/types/types.ts` |
| 4 | `src/utils/invoice/einvoice/EInvoiceTemplate.js`, `src/utils/invoice/einvoice/EInvoiceSubmissionHandler.js`, `src/utils/invoice/einvoice/EInvoiceApiClientFactory.js`, the three sample XMLs |
| 5 | `src/utils/invoice/einvoice/EInvoiceConsolidatedTemplate.js`, `src/utils/invoice/einvoice/consolidatedReceiptGrouping.js`, `src/utils/invoice/autoConsolidation.js`, `src/components/Invoice/ConsolidatedInvoiceModal.tsx` |
| 6 | `src/pages/JellyPolly/`, `src/routes/jellypolly/`, `src/utils/JellyPolly/einvoice/` |
| 7 | `src/pages/GreenTarget/Invoices/InvoiceDetailsPage.tsx` (inline editing 158-760), `src/routes/greenTarget/invoices.js`, `src/utils/greenTarget/einvoice/*` |

---

## Open follow-ups (out of scope)

- Sales Summary pages netting adjustments
- "Refunded" badge on overpaid payment rows in PaymentTable / PaymentForm
- Bulk PDF export of adjustment docs
- Adjustment doc impact on Aging reports
- Whether to surface adjustment docs in the customer portal (if/when one exists)
