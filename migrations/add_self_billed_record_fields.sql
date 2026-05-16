-- Migration: Add Self-Billed Record Fields
-- Date: May 16, 2026
-- Description: Adds local-only stock balance and supporting document metadata

ALTER TABLE self_billed_invoice_lines
  ADD COLUMN IF NOT EXISTS balance_quantity DECIMAL(15,3);

ALTER TABLE self_billed_invoices
  ADD COLUMN IF NOT EXISTS supporting_document_s3_key TEXT,
  ADD COLUMN IF NOT EXISTS supporting_document_filename VARCHAR(255),
  ADD COLUMN IF NOT EXISTS supporting_document_content_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS supporting_document_size BIGINT,
  ADD COLUMN IF NOT EXISTS supporting_document_uploaded_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS supporting_document_uploaded_by VARCHAR(50) REFERENCES staffs(id);

UPDATE self_billed_invoices
SET has_supporting_document = (supporting_document_s3_key IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_supporting_document
  ON self_billed_invoices(supporting_document_s3_key)
  WHERE supporting_document_s3_key IS NOT NULL;
