-- Migration: Add Purchases System
-- Date: January 14, 2026
-- Description: Creates suppliers, purchase_invoices, and purchase_invoice_lines tables

-- =====================================================
-- 1. Create Suppliers Table
-- =====================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

-- =====================================================
-- 2. Create Purchase Invoices Table
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'unpaid', -- unpaid, partial, paid
  amount_paid DECIMAL(15,2) DEFAULT 0,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(50) REFERENCES staffs(id),
  UNIQUE(supplier_id, invoice_number) -- Same supplier can't have duplicate invoice numbers
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date ON purchase_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_journal ON purchase_invoices(journal_entry_id);

-- =====================================================
-- 3. Create Material Purchase Lines Table
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
  id SERIAL PRIMARY KEY,
  purchase_invoice_id INTEGER REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  material_id INTEGER REFERENCES materials(id) NOT NULL,
  quantity DECIMAL(15,3),  -- Optional: for reference/tracking
  unit_cost DECIMAL(15,4), -- Optional: calculated from amount/quantity
  amount DECIMAL(15,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_invoice ON purchase_invoice_lines(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_material ON purchase_invoice_lines(material_id);

-- =====================================================
-- 3b. Material Category to Account Code Mapping
-- =====================================================
-- Maps material categories to purchase account codes for auto-journaling
CREATE TABLE IF NOT EXISTS material_purchase_account_mappings (
  id SERIAL PRIMARY KEY,
  material_category VARCHAR(50) NOT NULL UNIQUE,
  purchase_account_code VARCHAR(20) REFERENCES account_codes(code) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed default mappings
INSERT INTO material_purchase_account_mappings (material_category, purchase_account_code, description) VALUES
  ('ingredient', 'PUR', 'Purchase of ingredients (flour, rice, etc.)'),
  ('raw_material', 'PUR', 'Purchase of raw materials'),
  ('packing_material', 'PM', 'Purchase of packing materials')
ON CONFLICT (material_category) DO NOTHING;

-- =====================================================
-- 4. Add Journal Entry Type for Purchases
-- =====================================================
INSERT INTO journal_entry_types (code, name, description, is_active)
VALUES ('PUR', 'Purchase Invoice', 'Auto-generated from supplier purchase invoices', true)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 5. Ensure Trade Payables Account Exists
-- =====================================================
INSERT INTO account_codes (code, description, ledger_type, is_active)
VALUES ('TP', 'Trade Payables', 'GL', true)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 6. Seed Supplier Data (79 suppliers)
-- =====================================================
INSERT INTO suppliers (code, name, is_active) VALUES
('AGRICORE', 'AGRICORE CS SDN BHD', true),
('ALLWIN', 'ALLWIN STATIONERY', true),
('BORNEO_FLEX', 'BORNEO FLEXIBLE PACKAGING SDN BHD', true),
('BUKIT_RAYA', 'BUKIT RAYA SDN BHD', true),
('BESTWISE', 'BESTWISE SDN BHD', true),
('BORNEO_REGAL', 'BORNEO REGAL SDN BHD', true),
('BIGWHEEL', 'BIGWHEEL MARKETING SDN BHD', true),
('CHEMECH', 'CHEMECH VENTURES', true),
('CLS_GEM', 'CLS GEMILANG ENTERPRISE', true),
('CHOO_BEE', 'CHOO BEE HARDWARE (SABAH) S/B', true),
('CESB', 'C.E.S.B', true),
('COMCOBEST', 'COMCOBEST SDN BHD', true),
('DERNYPACK', 'DERNYPACK PLASTIC (M) SDN BHD', true),
('DE_HOME', 'DE HOME LEGEND SDN BHD', true),
('DINXINGS', 'DINXINGS (M) SDN BHD', true),
('DELIG', 'DELIG SDN BHD', true),
('LEBERI', 'LEBERI @ FRANCIS B MARIAN', true),
('GEN_PLASTIC', 'GENERAL PLASTIC TRADING CO', true),
('GREEN_TARGET', 'GREEN TARGET WASTE TREATMENT IND S/B', true),
('EXPOGAYA', 'EXPOGAYA SDN BHD', true),
('HONCO', 'HONCO NARKETING', true),
('HARRISONS', 'HARRISONS SABAH SDN BHD', true),
('HARBOUR_LINK', 'HARBOUR-LINK LINES SDN BHD', true),
('EVERGREEN', 'EVERGREEN MARINE CORP (N) S/B', true),
('JELLY_POLLY', 'JELLY-POLLY FOOD INDUSTRIES', true),
('INBASJAYA', 'INBASJAYA SDN BHD', true),
('IBS_PLASTIC', 'IBS PLACTIC TRD SDN BHD', true),
('INDAHMANIS', 'INDAHMANIS LABEL STICKER & PACKAGING S', true),
('JB_FLOUR', 'JOHOR BAHRU FLOUR MILL S/B', true),
('JOO_LOONG', 'JOO LOONG TRADING CO', true),
('JONG_NA', 'JONG NA CHEMICAL SDN BHD', true),
('KILANG_BERAS', 'KILANG BERAS RAKYAT SEKINCHAN S/B', true),
('KOTABOX', 'KOTABOX PACKAGING SDN BHD', true),
('KB_RICE', 'KB RICE', true),
('KONG_LONG', 'KONG LONG HUAT CHEMICALS SDN BHD', true),
('KK_MACHINERY', 'K.K.MACHINERY SDN BHD', true),
('KK_RICE', 'KK RICE VERNICELLI SDN BHD', true),
('KOWAS', 'KOWAS TRANPSORT SDN BHD', true),
('LEESING', 'LEESING LOGISTICS (EM) S/B', true),
('LAHAD_DATU', 'LAHAD DATU FLOUR MILL SDN BHD', true),
('LEONG_YUN', 'LEONG YUN FAH SDN BHD', true),
('MULTI_BEST', 'MULTI-BEST TRADING SDN BHD', true),
('MIBA', 'MIBA LOGISTICS & FORWARDING SDN BHD', true),
('MARITIME', 'MARITIME & INDUSTRIAL ENGINEERS SDN BH', true),
('MOON_JADE', 'MOON JADE TRADING', true),
('MYCO2', 'MYCO2 (PG) SDN BHD', true),
('NITSEI_SAGO', 'NITSEI SAGO INDUSTRIES SDN BHD', true),
('UNIMECH', 'UNIMECH ENGINEERING (JB) S/B', true),
('PERCETAKAN', 'PERCETAKAN KOLOMBONG RIA SDN BHD', true),
('UNIMEKAR', 'UNIMEKAR CHEMICALS SDN BHD', true),
('PAC_SELATAN', 'PACIFIC SELATAN AGENCY SDN BHD', true),
('PHOUNG_HUAT', 'PHOUNG HUAT ENTERPRISE S/B', true),
('PAUMIN', 'PAUMIN HARDWARE SDN BHD', true),
('PUNCAK_NIAGA', 'PUNCAK NIAGA', true),
('RESOURCE', 'RESOURCE FOOD SUPPLIES (M) SDN BHD', true),
('REDOX', 'REDOX CHEMICALS SDN BHD', true),
('SWEE_HIN', 'SWEE HIN CHAN CO SDN BHD', true),
('CREDIT_SALES', 'CREDIT SALES', true),
('SHANDONG', 'SHANDONG HAOFUXING INTERNATIONAL TRD C', true),
('SA_GENERAL', 'SA GENERAL PLASTICS TRD SDN BHD', true),
('SAGO_LINK', 'SAGO-LINK SDN BHD', true),
('SHAH_JAYA', 'SYARIKAT SHAH JAYA', true),
('STELLAR', 'STELLAR PLASTIK SDN BHD', true),
('SERBA_WANGI', 'SERBA WANGI SDN BHD', true),
('TAN_KIEN', 'TAN KIEN CHONG (SABAH) SDN BHD', true),
('SHIN_YANG', 'SHIN YANG SHIPPING SDN BHD', true),
('SAN_SENG', 'SAN SENG LEE (KEDAH) SDN BHD', true),
('SUDI_LAJU', 'SUDI LAJU SDN BHD', true),
('SAZARICE', 'SAZARICE SDN BHD', true),
('SRI_NAJU', 'SRI NAJU JAYA TRADING', true),
('UNIANG', 'UNIANG PLASTIC INDUSTRIES (SABAH) SDN', true),
('UNIRAW', 'UNIRAW DAIRIES & FOOD S/B', true),
('WIN_HIN', 'WIN HIN MACHINERY (M) SDN BHD', true),
('QINGDAO_H', 'QINGDAO HONGFULEI TRADE CO,.LTD', true),
('Q_FLEX', 'Q-FLEX IND (M) SDN BHD', true),
('QINGDAO_S', 'QINGDAO SHENGDA COMMERCIAL & TRADE CO.', true),
('NCT', 'NCT FORWARDING & SHIPPING S/B', true),
('PAC_SELATAN2', 'PACIFIC SELATAN AGENCY S/B', true),
('NTT', 'NTT SHIPPING SDN BHD', true),
('YESOKEY', 'YESOKEY FOOD SDN BHD', true),
('TOMBER', 'TOMBER INDUSTRIAL SDN BHD', true)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- Verification Queries (run these to confirm success)
-- =====================================================
-- SELECT COUNT(*) FROM suppliers;
-- SELECT * FROM journal_entry_types WHERE code = 'PUR';
-- SELECT * FROM account_codes WHERE code = 'TP';
