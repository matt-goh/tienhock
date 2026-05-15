-- Migration: Add Self-Billed Line Tax Exemption Field
-- Date: May 15, 2026
-- Description: Adds optional tax exemption reason for self-billed invoice XML

ALTER TABLE self_billed_invoice_lines
  ADD COLUMN IF NOT EXISTS tax_exemption_reason TEXT;
