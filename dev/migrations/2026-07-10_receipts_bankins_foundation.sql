-- =============================================================================
-- 2026-07-10_receipts_bankins_foundation.sql
-- Phase 1 (source model) of the Invoice / Payment / Receipt / Bank-In refactor.
-- See docs/Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md (frozen contracts §4)
-- and docs/Account/INVOICE-PAYMENT-ACCOUNT_IMPLEMENTATION_PLAN.md.
--
-- Properties:
--   * Idempotent — safe to rerun (IF NOT EXISTS / IS DISTINCT FROM guards).
--   * Schema + journal source-link backfill only. NO journal amounts, invoice
--     balances, customer credit_used, or e-Invoice fields are touched.
--   * Companion read-only report: 2026-07-10_receipts_bankins_dryrun.sql
--     (run it BEFORE and AFTER this migration; it must show no balance drift).
--
-- Execution: docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
--              < dev/migrations/2026-07-10_receipts_bankins_foundation.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. journal_entries: separate display reference, persisted ledger ordering,
--    and source ownership (traceability + idempotency).
--    display_reference = legacy-visible Journal No. (may repeat, e.g.
--    MBB932037-P twice on 22/06, RV052/06 twice on 24/06). Falls back to
--    reference_no when NULL. posting_sequence = within-day ledger print order
--    (populated from OCR day_ordinal for reconciled history, allocated
--    deterministically for new transactions).
-- -----------------------------------------------------------------------------
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS display_reference VARCHAR(100),
  ADD COLUMN IF NOT EXISTS posting_sequence INTEGER,
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);

COMMENT ON COLUMN journal_entries.display_reference IS
  'Legacy-visible Journal/Reference No. shown in ledgers (repeatable). NULL = fall back to reference_no.';
COMMENT ON COLUMN journal_entries.posting_sequence IS
  'Within-day ledger display/posting order. Backfilled from legacy OCR day ordinal; deterministic for new entries.';
COMMENT ON COLUMN journal_entries.source_type IS
  'Owning source table: invoice | payment | receipt | bank_in | adjustment | jp_adjustment | self_billed_invoice | purchase_invoice | supplier_payment. NULL = manual/legacy journal.';
COMMENT ON COLUMN journal_entries.source_id IS
  'PK of the owning source row (stringified). One posted journal per (source_type, source_id).';

-- -----------------------------------------------------------------------------
-- 2. journal_entry_lines: explicit Cheque/transfer reference (repeatable across
--    rows; e.g. TF040626 shared by TF040626..TF040626-7) and per-ledger display
--    order for journals with several lines in the same account.
--    Reports must read COALESCE(jel.cheque_reference, je.cheque_no) — never
--    substitute the Journal reference.
-- -----------------------------------------------------------------------------
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS cheque_reference VARCHAR(100),
  ADD COLUMN IF NOT EXISTS display_order INTEGER;

COMMENT ON COLUMN journal_entry_lines.cheque_reference IS
  'Cheque/transfer value shown in the ledger Cheque column (repeatable). Fallback: journal_entries.cheque_no.';
COMMENT ON COLUMN journal_entry_lines.display_order IS
  'Display order among lines of the same journal within one account ledger.';

-- -----------------------------------------------------------------------------
-- 3. invoices: persisted description override for the invoice-owned journal
--    (default is "CASH BILL: {id} - {customer_id}" / "INV/NO: ..."). Resync
--    regenerates the default only when this is NULL.
-- -----------------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS accounting_description TEXT;

COMMENT ON COLUMN invoices.accounting_description IS
  'User override for the invoice journal description/particulars. NULL = auto-generated default.';

-- -----------------------------------------------------------------------------
-- 4. receipts: one atomic receipt (header) covering one or many invoices /
--    customers. Replaces the one-payments-row-per-invoice model.
--    debit_account: CH_REV2 for physical cash against old credit invoices;
--    BANK_PBB / BANK_ABB for direct transfer / online / cleared cheque.
--    (CH_REV1 money is invoice-owned cash-bill collection — NOT a receipt.)
--    origin='import_opening' rows carry pre-cutover unbanked cash proven by the
--    legacy PDFs (selectable in RV bank-ins, but they post no journal — their
--    cash is inside the CH_REV1/CH_REV2 opening anchors).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id                  SERIAL PRIMARY KEY,
  payment_method      VARCHAR(20)  NOT NULL CHECK (payment_method IN ('cash','cheque','bank_transfer','online')),
  debit_account       VARCHAR(50)  NOT NULL REFERENCES account_codes(code),
  display_reference   VARCHAR(100),
  cheque_reference    VARCHAR(100),
  received_date       DATE         NOT NULL,
  posting_date        DATE,
  status              VARCHAR(20)  NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','cancelled')),
  origin              VARCHAR(20)  NOT NULL DEFAULT 'erp' CHECK (origin IN ('erp','import_opening')),
  total_amount        NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  description         TEXT,
  description_overridden BOOLEAN   NOT NULL DEFAULT false,
  journal_entry_id    INTEGER REFERENCES journal_entries(id),
  notes               TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by          VARCHAR(255),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by          VARCHAR(255),
  cancellation_date   TIMESTAMP,
  cancellation_reason TEXT,
  cancelled_by        VARCHAR(255),
  -- pending cheques have no journal; posted receipts must own one
  -- (import_opening rows are exempt: their cash sits inside the opening anchor)
  CONSTRAINT receipts_posted_needs_journal
    CHECK (status <> 'posted' OR journal_entry_id IS NOT NULL OR origin = 'import_opening'),
  CONSTRAINT receipts_pending_has_no_journal
    CHECK (status <> 'pending' OR journal_entry_id IS NULL),
  CONSTRAINT receipts_posted_needs_posting_date
    CHECK (status <> 'posted' OR posting_date IS NOT NULL OR origin = 'import_opening')
);

-- a journal belongs to at most one receipt
CREATE UNIQUE INDEX IF NOT EXISTS receipts_journal_entry_uq
  ON receipts (journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS receipts_received_date_idx ON receipts (received_date);
CREATE INDEX IF NOT EXISTS receipts_status_idx ON receipts (status);
CREATE INDEX IF NOT EXISTS receipts_display_reference_idx ON receipts (display_reference);

-- -----------------------------------------------------------------------------
-- 5. receipt_allocations: itemized allocations under one receipt.
--    allocation_type:
--      'invoice' — settles a TH invoice (invoice_id required);
--      'excess'  — customer-owned unapplied overpayment (CR CUST_DEP; customer
--                  required; remaining = amount - applied_amount - refunded_amount);
--      'account' — allocation to a debtor/GL account with a free-text external
--                  reference (e.g. Jelly Polly debtor account `JP`, ref 004697/JP).
--    target_account is resolved at posting for invoice/excess (TR pre-Phase-6,
--    customer debtor child after; CUST_DEP for excess) and explicit for 'account'.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_allocations (
  id                 SERIAL PRIMARY KEY,
  receipt_id         INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  line_number        INTEGER NOT NULL,
  allocation_type    VARCHAR(20) NOT NULL CHECK (allocation_type IN ('invoice','excess','account')),
  invoice_id         VARCHAR(255) REFERENCES invoices(id),
  customer_id        VARCHAR(50)  REFERENCES customers(id),
  target_account     VARCHAR(50)  REFERENCES account_codes(code),
  external_reference VARCHAR(255),
  amount             NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  applied_amount     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (applied_amount >= 0),
  refunded_amount    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  legacy_payment_id  INTEGER,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT receipt_alloc_line_uq UNIQUE (receipt_id, line_number),
  CONSTRAINT receipt_alloc_invoice_required
    CHECK (allocation_type <> 'invoice' OR invoice_id IS NOT NULL),
  CONSTRAINT receipt_alloc_excess_needs_customer
    CHECK (allocation_type <> 'excess' OR customer_id IS NOT NULL),
  CONSTRAINT receipt_alloc_account_needs_target
    CHECK (allocation_type <> 'account' OR target_account IS NOT NULL),
  CONSTRAINT receipt_alloc_excess_within_amount
    CHECK (applied_amount + refunded_amount <= amount)
);

CREATE INDEX IF NOT EXISTS receipt_alloc_invoice_idx  ON receipt_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS receipt_alloc_customer_idx ON receipt_allocations (customer_id);
CREATE INDEX IF NOT EXISTS receipt_alloc_legacy_idx   ON receipt_allocations (legacy_payment_id);

-- -----------------------------------------------------------------------------
-- 6. rv_registry: ONE transactional RV namespace shared by structured bank-ins
--    AND manual/imported RV journal headers (non-sales RVs like worker
--    repayments/refunds reserve numbers here too). Duplicate scope =
--    company (TH) + accounting year + month; visible format RV{seq>=3digits}/{MM}.
--    Cancelled RVs stay reserved (uniqueness covers all statuses). Gaps allowed.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rv_registry (
  id               SERIAL PRIMARY KEY,
  rv_year          INTEGER NOT NULL CHECK (rv_year BETWEEN 2000 AND 2100),
  rv_month         INTEGER NOT NULL CHECK (rv_month BETWEEN 1 AND 12),
  rv_seq           INTEGER NOT NULL CHECK (rv_seq > 0),
  rv_number        VARCHAR(20) NOT NULL CHECK (rv_number ~ '^RV\d{3,}/\d{2}$'),
  source_type      VARCHAR(20) NOT NULL CHECK (source_type IN ('bank_in','manual_journal','import')),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  status           VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by       VARCHAR(255),
  CONSTRAINT rv_registry_scope_uq UNIQUE (rv_year, rv_number),
  CONSTRAINT rv_registry_seq_uq   UNIQUE (rv_year, rv_month, rv_seq)
);

-- -----------------------------------------------------------------------------
-- 7. bank_ins: RV cash bank-in header. One shared RV number (via rv_registry),
--    one posting date, one target bank, one source-owned journal.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_ins (
  id                  SERIAL PRIMARY KEY,
  rv_registry_id      INTEGER NOT NULL REFERENCES rv_registry(id),
  posting_date        DATE NOT NULL,
  bank_account        VARCHAR(50) NOT NULL REFERENCES account_codes(code),
  total_amount        NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','cancelled')),
  journal_entry_id    INTEGER REFERENCES journal_entries(id),
  notes               TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by          VARCHAR(255),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by          VARCHAR(255),
  cancellation_date   TIMESTAMP,
  cancellation_reason TEXT,
  cancelled_by        VARCHAR(255),
  CONSTRAINT bank_ins_registry_uq UNIQUE (rv_registry_id),
  CONSTRAINT bank_ins_posted_needs_journal
    CHECK (status <> 'posted' OR journal_entry_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_ins_journal_entry_uq
  ON bank_ins (journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_ins_posting_date_idx ON bank_ins (posting_date);

-- -----------------------------------------------------------------------------
-- 8. bank_in_groups: display groups under one RV. Each group carries its
--    holding account (CH_REV1 or CH_REV2), its own editable description, and
--    becomes one bank debit line (legacy proof: RV052/06 & RV074/06 print one
--    bank row per customer group while CH_REV2 aggregates one credit).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_in_groups (
  id                     SERIAL PRIMARY KEY,
  bank_in_id             INTEGER NOT NULL REFERENCES bank_ins(id) ON DELETE CASCADE,
  group_number           INTEGER NOT NULL,
  holding_account        VARCHAR(50) NOT NULL REFERENCES account_codes(code),
  amount                 NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description            TEXT,
  description_overridden BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT bank_in_groups_number_uq UNIQUE (bank_in_id, group_number)
);

-- -----------------------------------------------------------------------------
-- 9. bank_in_allocations: sources feeding a group.
--      'cash_sales_pool' — partial amount from a CH_REV1 cash-sales date pool
--                          (source_date required; pre-cutover dates allowed —
--                          availability is seeded from the opening anchor);
--      'cash_receipt'    — a CH_REV2 receipt (receipt_id required; partial
--                          residual allowed; over-banking blocked in service
--                          with row locks — sum of posted allocations per
--                          receipt must never exceed the receipt total).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_in_allocations (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES bank_in_groups(id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('cash_sales_pool','cash_receipt')),
  source_date DATE,
  receipt_id  INTEGER REFERENCES receipts(id),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT bank_in_alloc_pool_needs_date
    CHECK (source_type <> 'cash_sales_pool' OR source_date IS NOT NULL),
  CONSTRAINT bank_in_alloc_receipt_needs_id
    CHECK (source_type <> 'cash_receipt' OR receipt_id IS NOT NULL)
);

-- same source may not repeat inside one group (partial re-banking of the same
-- source in a LATER RV/group remains allowed)
CREATE UNIQUE INDEX IF NOT EXISTS bank_in_alloc_group_receipt_uq
  ON bank_in_allocations (group_id, receipt_id) WHERE receipt_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bank_in_alloc_group_pool_uq
  ON bank_in_allocations (group_id, source_date) WHERE source_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_in_alloc_receipt_idx ON bank_in_allocations (receipt_id);
CREATE INDEX IF NOT EXISTS bank_in_alloc_source_date_idx ON bank_in_allocations (source_date);

-- -----------------------------------------------------------------------------
-- 10. Backfill journal source links (traceability). Idempotent; only touches
--     source_type/source_id; never amounts or statuses.
-- -----------------------------------------------------------------------------
UPDATE journal_entries je SET source_type = 'invoice', source_id = i.id
  FROM invoices i
 WHERE i.journal_entry_id = je.id
   AND (je.source_type IS DISTINCT FROM 'invoice' OR je.source_id IS DISTINCT FROM i.id);

UPDATE journal_entries je SET source_type = 'payment', source_id = p.payment_id::varchar
  FROM payments p
 WHERE p.journal_entry_id = je.id
   AND (je.source_type IS DISTINCT FROM 'payment' OR je.source_id IS DISTINCT FROM p.payment_id::varchar);

UPDATE journal_entries je SET source_type = 'adjustment', source_id = ad.id
  FROM adjustment_documents ad
 WHERE ad.journal_entry_id = je.id
   AND (je.source_type IS DISTINCT FROM 'adjustment' OR je.source_id IS DISTINCT FROM ad.id);

UPDATE journal_entries je SET source_type = 'jp_adjustment', source_id = jad.id
  FROM jellypolly.adjustment_documents jad
 WHERE jad.journal_entry_id = je.id
   AND (je.source_type IS DISTINCT FROM 'jp_adjustment' OR je.source_id IS DISTINCT FROM jad.id);

UPDATE journal_entries je SET source_type = 'self_billed_invoice', source_id = sbi.id::varchar
  FROM self_billed_invoices sbi
 WHERE sbi.journal_entry_id = je.id
   AND (je.source_type IS DISTINCT FROM 'self_billed_invoice' OR je.source_id IS DISTINCT FROM sbi.id::varchar);

UPDATE journal_entries je SET source_type = 'purchase_invoice', source_id = pi.id::varchar
  FROM purchase_invoices pi
 WHERE pi.journal_entry_id = je.id
   AND (je.source_type IS DISTINCT FROM 'purchase_invoice' OR je.source_id IS DISTINCT FROM pi.id::varchar);

UPDATE journal_entries je SET source_type = 'supplier_payment', source_id = sp.payment_id::varchar
  FROM supplier_payments sp
 WHERE sp.journal_entry_id = je.id
   AND (je.source_type IS DISTINCT FROM 'supplier_payment' OR je.source_id IS DISTINCT FROM sp.payment_id::varchar);

-- -----------------------------------------------------------------------------
-- 11. One posted journal per source. Guard first so a rerun on corrupted data
--     fails loudly instead of silently skipping.
-- -----------------------------------------------------------------------------
DO $$
DECLARE dup RECORD;
BEGIN
  SELECT source_type, source_id, COUNT(*) AS n INTO dup
    FROM journal_entries
   WHERE status = 'posted' AND source_type IS NOT NULL
   GROUP BY source_type, source_id
  HAVING COUNT(*) > 1
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Duplicate posted journals for source %/% (% rows) — resolve before creating uniqueness index',
      dup.source_type, dup.source_id, dup.n;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_posted_uq
  ON journal_entries (source_type, source_id)
  WHERE status = 'posted' AND source_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS journal_entries_source_idx
  ON journal_entries (source_type, source_id);

COMMIT;
