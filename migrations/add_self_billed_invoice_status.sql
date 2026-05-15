-- Migration: Add Self-Billed Invoice Local Status
-- Date: May 15, 2026
-- Description: Separates local invoice status from MyInvois e-invoice status

ALTER TABLE IF EXISTS self_billed_invoices
  ADD COLUMN IF NOT EXISTS invoice_status VARCHAR(20) NOT NULL DEFAULT 'active';

UPDATE self_billed_invoices
SET invoice_status = 'active'
WHERE invoice_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_invoice_status
  ON self_billed_invoices(invoice_status);

CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_einvoice_status
  ON self_billed_invoices(einvoice_status);
