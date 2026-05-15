-- Migration: Remove Self-Billed Source Document Number
-- Date: May 15, 2026
-- Description: Removes the unused source document number field from self-billed invoices

ALTER TABLE IF EXISTS self_billed_invoices
  DROP COLUMN IF EXISTS source_document_no;
