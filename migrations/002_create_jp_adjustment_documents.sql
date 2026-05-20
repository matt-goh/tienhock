-- ============================================================================
-- Migration: Adjustment Documents for Jelly Polly. Phase 6.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS jellypolly.adjustment_documents (
  id                          VARCHAR PRIMARY KEY,
  type                        VARCHAR(20) NOT NULL CHECK (type IN ('credit_note', 'debit_note', 'refund_note')),
  original_invoice_id         VARCHAR NOT NULL REFERENCES jellypolly.invoices(id),
  customerid                  VARCHAR NOT NULL,
  salespersonid               VARCHAR,
  createddate                 BIGINT NOT NULL,
  reason                      TEXT,
  paired_with_id              VARCHAR REFERENCES jellypolly.adjustment_documents(id),
  linked_payment_id           INTEGER REFERENCES jellypolly.payments(payment_id),
  references_consolidated_id  VARCHAR,
  total_excluding_tax         NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  rounding                    NUMERIC(12,2) NOT NULL DEFAULT 0,
  totalamountpayable          NUMERIC(12,2) NOT NULL DEFAULT 0,
  refund_method               VARCHAR,
  refund_reference            VARCHAR,
  bank_account                VARCHAR,
  uuid                        VARCHAR,
  submission_uid              VARCHAR,
  long_id                     VARCHAR,
  datetime_validated          TIMESTAMP,
  einvoice_status             VARCHAR CHECK (einvoice_status IN ('valid','pending','invalid','cancelled') OR einvoice_status IS NULL),
  is_consolidated             BOOLEAN NOT NULL DEFAULT FALSE,
  consolidated_adjustments    JSONB,
  status                      VARCHAR NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  cancellation_reason         TEXT,
  cancellation_date           TIMESTAMP,
  journal_entry_id            INTEGER,
  created_by                  VARCHAR,
  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jellypolly.adjustment_document_lines (
  id                  SERIAL PRIMARY KEY,
  adjustment_doc_id   VARCHAR NOT NULL REFERENCES jellypolly.adjustment_documents(id) ON DELETE CASCADE,
  line_number         INTEGER NOT NULL DEFAULT 1,
  code                VARCHAR,
  description         TEXT,
  quantity            NUMERIC,
  price               NUMERIC(12,2),
  tax                 NUMERIC(12,2) DEFAULT 0,
  total               NUMERIC(12,2) DEFAULT 0,
  issubtotal          BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_jp_adj_docs_orig_inv      ON jellypolly.adjustment_documents(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_jp_adj_docs_paired        ON jellypolly.adjustment_documents(paired_with_id);
CREATE INDEX IF NOT EXISTS idx_jp_adj_docs_linked_pay    ON jellypolly.adjustment_documents(linked_payment_id);
CREATE INDEX IF NOT EXISTS idx_jp_adj_docs_type_created  ON jellypolly.adjustment_documents(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jp_adj_docs_einvoice      ON jellypolly.adjustment_documents(einvoice_status);
CREATE INDEX IF NOT EXISTS idx_jp_adj_docs_status        ON jellypolly.adjustment_documents(status);
CREATE INDEX IF NOT EXISTS idx_jp_adj_docs_ref_cons      ON jellypolly.adjustment_documents(references_consolidated_id);
CREATE INDEX IF NOT EXISTS idx_jp_adj_doc_lines_doc_id   ON jellypolly.adjustment_document_lines(adjustment_doc_id);

DROP TRIGGER IF EXISTS trg_jp_adj_docs_touch_updated_at ON jellypolly.adjustment_documents;
CREATE TRIGGER trg_jp_adj_docs_touch_updated_at
  BEFORE UPDATE ON jellypolly.adjustment_documents
  FOR EACH ROW
  EXECUTE FUNCTION adjustment_documents_touch_updated_at();

COMMIT;
