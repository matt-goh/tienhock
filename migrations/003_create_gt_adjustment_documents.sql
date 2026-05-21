-- Phase 7 — Green Target Adjustment Documents
-- Mirrors the Tien Hock / Jelly Polly tables but with GT field names
-- (invoice_id/integer + invoice_number/string, date_issued/date, amount_before_tax
-- + total_amount totals, customer_id/integer). No journal_entry_id column
-- because GT lives outside the shared journal_entries ledger. No
-- linked_payment_id because standalone refund notes are out of scope for GT
-- (paired RN only — there's no 'overpaid' payment status on GT to trigger them).

CREATE TABLE IF NOT EXISTS greentarget.adjustment_documents (
  id                          VARCHAR PRIMARY KEY,
  type                        VARCHAR(20) NOT NULL,
  original_invoice_id         INTEGER REFERENCES greentarget.invoices(invoice_id),
  original_invoice_number     VARCHAR(20) NOT NULL,
  customer_id                 INTEGER REFERENCES greentarget.customers(customer_id),
  customer_name               VARCHAR(255),
  date_issued                 DATE NOT NULL,
  reason                      TEXT,
  paired_with_id              VARCHAR REFERENCES greentarget.adjustment_documents(id),
  references_consolidated_id  INTEGER,
  amount_before_tax           NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount                NUMERIC(10,2) NOT NULL DEFAULT 0,
  refund_method               VARCHAR(20),
  refund_reference            VARCHAR(50),
  bank_account                VARCHAR(20),
  uuid                        VARCHAR(255),
  submission_uid              VARCHAR(255),
  long_id                     VARCHAR(255),
  datetime_validated          TIMESTAMP,
  einvoice_status             VARCHAR(50),
  is_consolidated             BOOLEAN DEFAULT FALSE,
  consolidated_adjustments    JSONB,
  status                      VARCHAR(20) DEFAULT 'active',
  cancellation_reason         TEXT,
  cancellation_date           TIMESTAMP,
  created_by                  VARCHAR,
  created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS greentarget.adjustment_document_lines (
  id                 SERIAL PRIMARY KEY,
  adjustment_doc_id  VARCHAR NOT NULL REFERENCES greentarget.adjustment_documents(id) ON DELETE CASCADE,
  line_number        INTEGER,
  description        TEXT,
  quantity           NUMERIC,
  price              NUMERIC(10,2),
  tax                NUMERIC(10,2),
  total              NUMERIC(10,2),
  issubtotal         BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_gt_adj_docs_orig_inv     ON greentarget.adjustment_documents(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_gt_adj_docs_orig_num     ON greentarget.adjustment_documents(original_invoice_number);
CREATE INDEX IF NOT EXISTS idx_gt_adj_docs_paired       ON greentarget.adjustment_documents(paired_with_id);
CREATE INDEX IF NOT EXISTS idx_gt_adj_docs_type_created ON greentarget.adjustment_documents(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gt_adj_docs_einvoice     ON greentarget.adjustment_documents(einvoice_status);
CREATE INDEX IF NOT EXISTS idx_gt_adj_docs_status       ON greentarget.adjustment_documents(status);

-- Reuse the shared trigger function created by migration 001 (TH/JP).
DROP TRIGGER IF EXISTS gt_adjustment_documents_touch_updated_at
  ON greentarget.adjustment_documents;
CREATE TRIGGER gt_adjustment_documents_touch_updated_at
  BEFORE UPDATE ON greentarget.adjustment_documents
  FOR EACH ROW EXECUTE FUNCTION adjustment_documents_touch_updated_at();
