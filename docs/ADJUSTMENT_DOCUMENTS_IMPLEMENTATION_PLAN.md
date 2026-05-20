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
| 2 | Frontend Pages (TH, shared component scaffolding) | Not started |
| 3 | Invoice & Payment Integration (TH) | Not started |
| 4 | Individual E-Invoice templates + submission (TH) | Not started |
| 5 | Consolidated E-Invoice templates + auto-consolidation (TH) | Not started |
| 6 | Jelly Polly Replication | Not started |
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
