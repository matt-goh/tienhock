-- Migration: Self-Billed E-Invoice System (Complete)
-- Description: Creates all tables for the manual-entry self-billed e-invoice system
--              for foreign suppliers. Merged from:
--                1. add_self_billed_einvoice_system.sql
--                2. add_self_billed_invoice_status.sql
--                3. add_self_billed_line_tax_exemption.sql
--                4. remove_self_billed_source_document_no.sql
--                5. add_self_billed_record_fields.sql

-- =====================================================
-- 1. Foreign Supplier Profiles
-- =====================================================
CREATE TABLE IF NOT EXISTS self_billed_foreign_suppliers (
  id SERIAL PRIMARY KEY,
  supplier_name VARCHAR(300) NOT NULL,
  tin_number VARCHAR(20) NOT NULL DEFAULT 'EI00000000030',
  id_type VARCHAR(20) NOT NULL DEFAULT 'BRN',
  id_number VARCHAR(50) NOT NULL DEFAULT 'NA',
  sst_number VARCHAR(50) NOT NULL DEFAULT 'NA',
  ttx_number VARCHAR(50) NOT NULL DEFAULT 'NA',
  msic_code VARCHAR(10) NOT NULL DEFAULT '00000',
  business_activity_description VARCHAR(300) NOT NULL DEFAULT 'NA',
  address_line_0 TEXT NOT NULL,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city VARCHAR(100) NOT NULL,
  postcode VARCHAR(20),
  state_code VARCHAR(5) NOT NULL DEFAULT '17',
  country_code VARCHAR(3) NOT NULL DEFAULT 'CHN',
  contact_number VARCHAR(50) NOT NULL DEFAULT 'NA',
  email VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_name)
);

CREATE INDEX IF NOT EXISTS idx_self_billed_foreign_suppliers_name
  ON self_billed_foreign_suppliers(supplier_name);
CREATE INDEX IF NOT EXISTS idx_self_billed_foreign_suppliers_active
  ON self_billed_foreign_suppliers(is_active);

-- =====================================================
-- 2. Self-Billed Invoice Headers
-- =====================================================
CREATE TABLE IF NOT EXISTS self_billed_invoices (
  id SERIAL PRIMARY KEY,
  foreign_supplier_id INTEGER NOT NULL REFERENCES self_billed_foreign_suppliers(id),
  self_billed_no VARCHAR(50) NOT NULL UNIQUE,
  purchase_date DATE NOT NULL,
  transaction_type VARCHAR(100) NOT NULL DEFAULT 'Importation of goods',
  platform VARCHAR(100),
  order_no VARCHAR(150),
  payment_reference VARCHAR(150),
  shipping_method VARCHAR(100),
  shipping_number VARCHAR(150),
  -- Supporting document fields
  has_supporting_document BOOLEAN NOT NULL DEFAULT false,
  supporting_document_notes TEXT,
  supporting_document_s3_key TEXT,
  supporting_document_filename VARCHAR(255),
  supporting_document_content_type VARCHAR(100),
  supporting_document_size BIGINT,
  supporting_document_uploaded_at TIMESTAMP,
  supporting_document_uploaded_by VARCHAR(50) REFERENCES staffs(id),
  -- Currency & amounts
  currency_code VARCHAR(3) NOT NULL DEFAULT 'CNY',
  fx_rate DECIMAL(18,8) NOT NULL DEFAULT 1,
  total_foreign_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_excluding_tax_myr DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount_myr DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_including_tax_myr DECIMAL(15,2) NOT NULL DEFAULT 0,
  payable_amount_myr DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- MyInvois e-invoice fields
  uuid VARCHAR(100),
  submission_uid VARCHAR(100),
  long_id VARCHAR(255),
  datetime_validated TIMESTAMP,
  -- Status fields (local and e-invoice are separate)
  invoice_status VARCHAR(20) NOT NULL DEFAULT 'active',
  einvoice_status VARCHAR(20),
  cancellation_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(50) REFERENCES staffs(id)
);

CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_supplier
  ON self_billed_invoices(foreign_supplier_id);
CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_purchase_date
  ON self_billed_invoices(purchase_date);
CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_invoice_status
  ON self_billed_invoices(invoice_status);
CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_einvoice_status
  ON self_billed_invoices(einvoice_status);
CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_uuid
  ON self_billed_invoices(uuid);
CREATE INDEX IF NOT EXISTS idx_self_billed_invoices_supporting_document
  ON self_billed_invoices(supporting_document_s3_key)
  WHERE supporting_document_s3_key IS NOT NULL;

-- =====================================================
-- 3. Self-Billed Invoice Lines
-- =====================================================
CREATE TABLE IF NOT EXISTS self_billed_invoice_lines (
  id SERIAL PRIMARY KEY,
  self_billed_invoice_id INTEGER NOT NULL REFERENCES self_billed_invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(15,3) NOT NULL DEFAULT 1,
  balance_quantity DECIMAL(15,3),
  unit_price_foreign DECIMAL(15,4) NOT NULL DEFAULT 0,
  amount_foreign DECIMAL(15,2) NOT NULL DEFAULT 0,
  amount_myr DECIMAL(15,2) NOT NULL DEFAULT 0,
  classification_code VARCHAR(3) NOT NULL DEFAULT '034',
  tax_type VARCHAR(2) NOT NULL DEFAULT '06',
  tax_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  tax_amount_myr DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_exemption_reason TEXT,
  customs_form_reference VARCHAR(1000),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_billed_invoice_lines_invoice
  ON self_billed_invoice_lines(self_billed_invoice_id);
