-- ============================================================================
-- Estimated P&L / Unit Cost report (MEE & BIHUN) - Phase 1 foundation
-- Doc: docs/Account/ESTIMATED_REPORT_HANDOVER.md
-- Fixtures: dev/import/closing-stock-report/
--
-- Creates the report definition + mapping tables and seeds them from the
-- legacy formula pages (ClosingStockReport.pdf p3-p8) and the June 2026
-- printed report (p1, p2, p9, p10).
--
-- Idempotent: re-running rebuilds the seeded lines and their source members.
-- User-keyed data (estimated_report_inputs) is never touched; anchors are
-- inserted only when absent.
--
-- NOTE: this migration creates SCHEMA + MAPPINGS only. It posts no journals,
-- changes no stock/journal/sales data, and computes no report values.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Report line definitions (every printed row of both pages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimated_report_lines (
  id                  SERIAL PRIMARY KEY,
  line_key            VARCHAR(64)  NOT NULL UNIQUE,
  product_line        VARCHAR(10)  NOT NULL CHECK (product_line IN ('mee', 'bihun', 'shared')),
  page                VARCHAR(12)  NOT NULL CHECK (page IN ('pl', 'unit_cost')),
  section             VARCHAR(24)  NOT NULL CHECK (section IN (
                        -- page = 'pl'
                        'product', 'stock', 'purchase',
                        -- page = 'unit_cost'
                        'production', 'ingredient', 'packing', 'salary',
                        'salesman', 'habuk', 'expenses', 'machine_repair')),
  code                VARCHAR(32),
  description         VARCHAR(255) NOT NULL,
  opening_code        VARCHAR(32),
  opening_description VARCHAR(255),
  sort_order          INTEGER      NOT NULL,
  source_kind         VARCHAR(24)  NOT NULL CHECK (source_kind IN (
                        'sales_products',   -- expands to one row per product with activity
                        'sales_group',      -- aggregates its product members into one row
                        'sales_foc',        -- free-product bags only, no amount
                        'sales_returns',    -- returnproduct x invoice-line price
                        'material_stock',   -- material_stock_entries for the mapped materials
                        'kilang_stock',     -- material_stock_kilang_entries for the bucket
                        'journal_accounts', -- posted journal lines, SUM(debit - credit)
                        'production_bags',  -- production_entries bags_packed
                        'stock_flow')),     -- (opening - closing) of referenced stock lines + purchases
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- only 'stock' rows carry an opening presentation; opening stock of month M
  -- is by definition the closing stock of month M-1, so both share one mapping
  CONSTRAINT estimated_report_lines_opening_ck CHECK (
    (section = 'stock' AND opening_code IS NOT NULL AND opening_description IS NOT NULL)
    OR (section <> 'stock' AND opening_code IS NULL AND opening_description IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS estimated_report_lines_order_uq
  ON estimated_report_lines (page, section, product_line, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS estimated_report_lines_code_uq
  ON estimated_report_lines (page, section, product_line, code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS estimated_report_lines_page_idx
  ON estimated_report_lines (page, section, sort_order);

-- ---------------------------------------------------------------------------
-- 2. What each line is made of (materials / accounts / products / other lines)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimated_report_line_sources (
  id            SERIAL PRIMARY KEY,
  line_id       INTEGER      NOT NULL REFERENCES estimated_report_lines(id) ON DELETE CASCADE,
  source_type   VARCHAR(16)  NOT NULL CHECK (source_type IN (
                  'material', 'kilang', 'account', 'product', 'product_type', 'line')),
  sign          SMALLINT     NOT NULL DEFAULT 1 CHECK (sign IN (-1, 1)),
  percentage    NUMERIC(6,2) NOT NULL DEFAULT 100.00 CHECK (percentage >= 0 AND percentage <= 100),
  material_id   INTEGER      REFERENCES materials(id) ON DELETE CASCADE,
  variant_id    INTEGER      REFERENCES material_variants(id) ON DELETE CASCADE,
  stock_bucket  VARCHAR(10)  CHECK (stock_bucket IN ('mee', 'bihun', 'shared')),
  account_code  VARCHAR(50)  REFERENCES account_codes(code) ON UPDATE CASCADE ON DELETE CASCADE,
  product_id    VARCHAR(255) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_type  VARCHAR(50),
  ref_line_id   INTEGER      REFERENCES estimated_report_lines(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT estimated_report_line_sources_shape_ck CHECK (
       (source_type = 'material'     AND material_id IS NOT NULL AND stock_bucket IS NOT NULL
                                     AND account_code IS NULL AND product_id IS NULL
                                     AND product_type IS NULL AND ref_line_id IS NULL)
    OR (source_type = 'kilang'       AND stock_bucket IS NOT NULL AND material_id IS NULL
                                     AND variant_id IS NULL AND account_code IS NULL
                                     AND product_id IS NULL AND product_type IS NULL AND ref_line_id IS NULL)
    OR (source_type = 'account'      AND account_code IS NOT NULL AND material_id IS NULL
                                     AND variant_id IS NULL AND stock_bucket IS NULL
                                     AND product_id IS NULL AND product_type IS NULL AND ref_line_id IS NULL)
    OR (source_type = 'product'      AND product_id IS NOT NULL AND material_id IS NULL
                                     AND variant_id IS NULL AND stock_bucket IS NULL
                                     AND account_code IS NULL AND product_type IS NULL AND ref_line_id IS NULL)
    OR (source_type = 'product_type' AND product_type IS NOT NULL AND material_id IS NULL
                                     AND variant_id IS NULL AND stock_bucket IS NULL
                                     AND account_code IS NULL AND product_id IS NULL AND ref_line_id IS NULL)
    OR (source_type = 'line'         AND ref_line_id IS NOT NULL AND material_id IS NULL
                                     AND variant_id IS NULL AND stock_bucket IS NULL
                                     AND account_code IS NULL AND product_id IS NULL AND product_type IS NULL)
  ),
  -- a variant may only be named together with its own material
  CONSTRAINT estimated_report_line_sources_variant_ck CHECK (
    variant_id IS NULL OR material_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS estimated_report_line_sources_line_idx
  ON estimated_report_line_sources (line_id);
CREATE UNIQUE INDEX IF NOT EXISTS estimated_report_line_sources_material_uq
  ON estimated_report_line_sources (line_id, material_id, COALESCE(variant_id, -1), stock_bucket)
  WHERE source_type = 'material';
CREATE UNIQUE INDEX IF NOT EXISTS estimated_report_line_sources_account_uq
  ON estimated_report_line_sources (line_id, account_code) WHERE source_type = 'account';
CREATE UNIQUE INDEX IF NOT EXISTS estimated_report_line_sources_product_uq
  ON estimated_report_line_sources (line_id, product_id) WHERE source_type = 'product';
CREATE UNIQUE INDEX IF NOT EXISTS estimated_report_line_sources_line_ref_uq
  ON estimated_report_line_sources (line_id, ref_line_id) WHERE source_type = 'line';

-- ---------------------------------------------------------------------------
-- 3. Per-month keyed inputs (the "Add Back" the boss writes on the printout)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimated_report_inputs (
  id           SERIAL PRIMARY KEY,
  product_line VARCHAR(10)   NOT NULL CHECK (product_line IN ('mee', 'bihun')),
  year         INTEGER       NOT NULL,
  month        INTEGER       NOT NULL CHECK (month BETWEEN 1 AND 12),
  add_back     NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by   VARCHAR(255),
  updated_by   VARCHAR(255),
  CONSTRAINT estimated_report_inputs_uq UNIQUE (product_line, year, month)
);

-- ---------------------------------------------------------------------------
-- 4. Accumulative P/L seeds (pre-system carry-forward)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimated_report_anchors (
  id           SERIAL PRIMARY KEY,
  product_line VARCHAR(10)   NOT NULL CHECK (product_line IN ('mee', 'bihun')),
  as_of_date   DATE          NOT NULL,
  accumulative NUMERIC(15,2) NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by   VARCHAR(255),
  CONSTRAINT estimated_report_anchors_uq UNIQUE (product_line, as_of_date)
);

-- ===========================================================================
-- SEEDS
-- ===========================================================================

-- Staging tables keep the seed readable; dropped at the end of the migration.
CREATE TEMP TABLE seed_lines (
  line_key VARCHAR(64), product_line VARCHAR(10), page VARCHAR(12), section VARCHAR(24),
  code VARCHAR(32), description VARCHAR(255),
  opening_code VARCHAR(32), opening_description VARCHAR(255),
  sort_order INTEGER, source_kind VARCHAR(24), notes TEXT
) ON COMMIT DROP;

CREATE TEMP TABLE seed_accounts (line_key VARCHAR(64), account_code VARCHAR(50), percentage NUMERIC(6,2)) ON COMMIT DROP;
CREATE TEMP TABLE seed_materials (line_key VARCHAR(64), material_code VARCHAR(50), variant_name VARCHAR(255), stock_bucket VARCHAR(10)) ON COMMIT DROP;
CREATE TEMP TABLE seed_products (line_key VARCHAR(64), product_id VARCHAR(255), sign SMALLINT, percentage NUMERIC(6,2)) ON COMMIT DROP;
CREATE TEMP TABLE seed_product_types (line_key VARCHAR(64), product_type VARCHAR(50)) ON COMMIT DROP;
CREATE TEMP TABLE seed_line_refs (line_key VARCHAR(64), ref_line_key VARCHAR(64)) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- 5.1 P&L page - PRODUCT section
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, sort_order, source_kind, notes) VALUES
 ('mee.pl.product.products',  'mee',  'pl', 'product', NULL,     'PRODUCT',      10, 'sales_products', 'Expands to one row per MEE product with June-style sales activity'),
 ('mee.pl.product.foc',       'mee',  'pl', 'product', 'FOC',    'FOC',          20, 'sales_foc',      'Free-product bags, counted in the bag total only'),
 ('mee.pl.product.sisa',      'mee',  'pl', 'product', 'SISA',   'SISA MEE',     30, 'sales_group',    NULL),
 ('mee.pl.product.others',    'mee',  'pl', 'product', 'OTHERS', 'OTHERS',       40, 'sales_group',    'Empty-bag sales, split 50/50 between MEE and BIHUN (Q4)'),
 ('bihun.pl.product.products','bihun','pl', 'product', NULL,     'PRODUCT',      10, 'sales_products', 'Expands to one row per BIHUN product with June-style sales activity'),
 ('bihun.pl.product.foc',     'bihun','pl', 'product', 'FOC',    'FOC',          20, 'sales_foc',      'Free-product bags, counted in the bag total only'),
 ('bihun.pl.product.sisa',    'bihun','pl', 'product', 'SISA',   'SISA BIHOON',  30, 'sales_group',    NULL),
 ('bihun.pl.product.others',  'bihun','pl', 'product', 'OTHERS', 'OTHERS',       40, 'sales_group',    'Empty-bag sales, split 50/50 between MEE and BIHUN (Q4)');

INSERT INTO seed_product_types (line_key, product_type) VALUES
 ('mee.pl.product.products',  'MEE'),
 ('mee.pl.product.foc',       'MEE'),
 ('bihun.pl.product.products','BH'),
 ('bihun.pl.product.foc',     'BH');

INSERT INTO seed_products (line_key, product_id, sign, percentage) VALUES
 ('mee.pl.product.sisa',     'SMEE',          1, 100.00),
 ('bihun.pl.product.sisa',   'SBH',           1, 100.00),
 ('mee.pl.product.others',   'EMPTY_BAG',     1,  50.00),
 ('mee.pl.product.others',   'EMPTY_BAG(S)',  1,  50.00),
 ('bihun.pl.product.others', 'EMPTY_BAG',     1,  50.00),
 ('bihun.pl.product.others', 'EMPTY_BAG(S)',  1,  50.00);

-- ---------------------------------------------------------------------------
-- 5.2 P&L page - STOCK section (closing + opening share one mapping)
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, opening_code, opening_description, sort_order, source_kind, notes) VALUES
 ('mee.pl.stock.MGRM1', 'mee', 'pl', 'stock', 'CS_MGRM1', 'GARAM',                    'OS_MGRM1', 'GARAM',                     10, 'material_stock', NULL),
 ('mee.pl.stock.MTH11', 'mee', 'pl', 'stock', 'CS_MTH11', 'TH-1',                     'OS_MTH11', 'TH-1',                      20, 'material_stock', NULL),
 ('mee.pl.stock.MSOD1', 'mee', 'pl', 'stock', 'CS_MSOD1', 'SODA ASH',                 'OS_MSOD1', 'SODA ASH',                  30, 'material_stock', NULL),
 ('mee.pl.stock.MSOD2', 'mee', 'pl', 'stock', 'CS_MSOD2', 'SODA ASH',                 'OS_MSOD2', 'SODA ASH',                  40, 'material_stock', NULL),
 ('mee.pl.stock.MSD',   'mee', 'pl', 'stock', 'CS_MSD',   'SODIUM TRIPOLYPHOSPHATE',  'OS_MSD',   'SODIUM TRIPOLYPHOSPHATE',   50, 'material_stock', 'Q11 ANSWERED: no longer used for Mee and never purchased. Retained but permanently zero - never warn'),
 ('mee.pl.stock.MTEP1', 'mee', 'pl', 'stock', 'CS_MTEP1', 'TEPUNG',                   'OS_MTEP1', 'TEPUNG 50KG',               60, 'material_stock', NULL),
 ('mee.pl.stock.MTEP2', 'mee', 'pl', 'stock', 'CS_MTEP2', 'TEPUNG',                   'OS_MTEP2', 'TEPUNG 50KG',               70, 'material_stock', NULL),
 ('mee.pl.stock.MTEP3', 'mee', 'pl', 'stock', 'CS_MTEP3', 'STORK W',                  'OS_MTEP3', 'STORK W 25KG',              80, 'material_stock', NULL),
 ('mee.pl.stock.MPMS',  'mee', 'pl', 'stock', 'CS_MPMS',  'PACKING MATERIAL SMALL',   'OS_MPMS',  'SMALL PLASTIC-MEE',         90, 'material_stock', NULL),
 ('mee.pl.stock.MPMB',  'mee', 'pl', 'stock', 'CS_MPMB',  'PACKING MATERIAL BIG',     'OS_MPMB',  'BIG PLASTIC-MEE',          100, 'material_stock', 'BIG membership confirmed by the user (Q8)'),
 ('mee.pl.stock.MTAP',  'mee', 'pl', 'stock', 'CS_MTAP',  'SELOTAPE',                 'OS_MTAP',  'SELOTAPE-MEE',             110, 'material_stock', NULL),
 ('mee.pl.stock.MFIN',  'mee', 'pl', 'stock', 'CS_MFIN',  'STOCK LORRY & KILANG',     'OS_MFIN',  'FINISH PRODUCTS',          120, 'kilang_stock',   NULL),
 ('bihun.pl.stock.BJAG', 'bihun', 'pl', 'stock', 'CS_BJAG', 'JAGUNG',                          'OS_BJAG', 'JAGUNG',                          10, 'material_stock', NULL),
 ('bihun.pl.stock.BSDM', 'bihun', 'pl', 'stock', 'CS_BSDM', 'SODIUM METALBISULPHITE',          'OS_BSDM', 'SODIUM METALBISULPHITE',          20, 'material_stock', NULL),
 ('bihun.pl.stock.BTH2', 'bihun', 'pl', 'stock', 'CS_BTH2', 'TH-2',                            'OS_BTH2', 'TH-2',                            30, 'material_stock', NULL),
 ('bihun.pl.stock.BBER', 'bihun', 'pl', 'stock', 'CS_BBER', 'BERAS',                           'OS_BBER', 'BERAS',                           40, 'material_stock', NULL),
 ('bihun.pl.stock.BSAG', 'bihun', 'pl', 'stock', 'CS_BSAG', 'SAGO',                            'OS_BSAG', 'SAGO',                            50, 'material_stock', NULL),
 ('bihun.pl.stock.KOW',  'bihun', 'pl', 'stock', 'CS_KOW',  'KOWAS TRANSPORT SDN BHD',         'OS_KOW',  'KOWAS TRANSPORT SDN BHD',         60, 'material_stock', 'No material mapped - legacy transport line, zero since the system start'),
 ('bihun.pl.stock.LS',   'bihun', 'pl', 'stock', 'CS_LS',   'LEASING LOGISTIC (EM) SDN BHD',   'OS_LS',   'LEASING LOGISTIC (EM) SDN BHD',   70, 'material_stock', 'Carries the whole Sago + Transport family (Q9)'),
 ('bihun.pl.stock.BPMS', 'bihun', 'pl', 'stock', 'CS_BPMS', 'PACKING MATERIAL SMALL',          'OS_BPMS', 'SMALL PLASTIC-BIHUN',             80, 'material_stock', NULL),
 ('bihun.pl.stock.BPMB', 'bihun', 'pl', 'stock', 'CS_BPMB', 'PACKING MATERIAL BIG',            'OS_BPMB', 'BIG PLASTIC-BIHUN',               90, 'material_stock', 'BIG membership confirmed by the user (Q8)'),
 ('bihun.pl.stock.BTAP', 'bihun', 'pl', 'stock', 'CS_BTAP', 'SELOTAPE',                        'OS_BTAP', 'SELOTAPE-BIHUN',                 100, 'material_stock', NULL),
 ('bihun.pl.stock.BFIN', 'bihun', 'pl', 'stock', 'CS_BFIN', 'STOCK LORRY & KILANG',            'OS_BFIN', 'FINISH PRODUCTS',                110, 'kilang_stock',   NULL);

-- Stock line -> material mapping. Variant names are resolved against
-- material_variants; NULL variant means "every entry for that material in the bucket".
INSERT INTO seed_materials (line_key, material_code, variant_name, stock_bucket) VALUES
 -- MEE ingredients / raw materials
 ('mee.pl.stock.MGRM1', 'M1',          NULL,                'mee'),
 ('mee.pl.stock.MTH11', 'M2',          NULL,                'mee'),
 ('mee.pl.stock.MSOD1', 'M3',          'RM 120 / 50kg/bag', 'mee'),
 ('mee.pl.stock.MSOD2', 'M3',          'RM 160 / 50kg/bag', 'mee'),
 ('mee.pl.stock.MSD',   'M3B',         NULL,                'mee'),
 ('mee.pl.stock.MSD',   'SODIUM_TRIP', NULL,                'mee'),
 ('mee.pl.stock.MTEP1', 'M23B',        NULL,                'mee'),
 ('mee.pl.stock.MTEP2', 'M23C',        NULL,                'mee'),
 ('mee.pl.stock.MTEP3', 'M23',         NULL,                'mee'),
 ('mee.pl.stock.MTEP3', 'M23D',        NULL,                'mee'),
 -- MEE packing: BIG is the user-confirmed set (Q8), SELOTAPE is its own line,
 -- every other mee packing material is SMALL.
 ('mee.pl.stock.MPMB',  'M14',  NULL, 'mee'),
 ('mee.pl.stock.MPMB',  'M15',  NULL, 'mee'),
 ('mee.pl.stock.MPMB',  'M16',  NULL, 'mee'),
 ('mee.pl.stock.MPMB',  'M17',  NULL, 'mee'),
 ('mee.pl.stock.MPMB',  'M20',  NULL, 'mee'),
 ('mee.pl.stock.MPMB',  'M21',  NULL, 'mee'),
 ('mee.pl.stock.MPMB',  'M28',  NULL, 'mee'),
 ('mee.pl.stock.MPMB',  'M29',  NULL, 'mee'),
 ('mee.pl.stock.MPMB',  'M31',  NULL, 'mee'),
 ('mee.pl.stock.MPMB',  'PM_BIG', NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M4',   NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M5',   NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M33',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M6',   NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M6B',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M42',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M43',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M8',   NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M40',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M35',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M9',   NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M36',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M37',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M34',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M10',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M11',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M11B', NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M32',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M30',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M12',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M13',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M18',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'M19',  NULL, 'mee'),
 ('mee.pl.stock.MPMS',  'PM_SMALL', NULL, 'mee'),
 ('mee.pl.stock.MTAP',  'M22',      NULL, 'mee'),
 ('mee.pl.stock.MTAP',  'SELOTAPE', NULL, 'mee'),
 -- BIHUN ingredients / raw materials
 ('bihun.pl.stock.BJAG', 'B3',       NULL, 'bihun'),
 ('bihun.pl.stock.BJAG', 'JAGUNG_1', NULL, 'bihun'),
 ('bihun.pl.stock.BJAG', 'JAGUNG_2', NULL, 'bihun'),
 ('bihun.pl.stock.BJAG', 'JAGUNG_3', NULL, 'bihun'),
 ('bihun.pl.stock.BJAG', 'JAGUNG_4', NULL, 'bihun'),
 ('bihun.pl.stock.BSDM', 'SODIUM_1', NULL, 'bihun'),
 ('bihun.pl.stock.BSDM', 'SODIUM_2', NULL, 'bihun'),
 ('bihun.pl.stock.BSDM', 'B1',       NULL, 'bihun'),
 ('bihun.pl.stock.BTH2', 'B2',       NULL, 'bihun'),
 ('bihun.pl.stock.BTH2', 'TH2',      NULL, 'bihun'),
 ('bihun.pl.stock.BTH2', 'TH2_2',    NULL, 'bihun'),
 ('bihun.pl.stock.BBER', 'B19',      NULL, 'bihun'),
 ('bihun.pl.stock.BBER', 'BERAS',    NULL, 'bihun'),
 ('bihun.pl.stock.BSAG', 'SAGO',     NULL, 'bihun'),
 ('bihun.pl.stock.LS',   'B20',      NULL, 'bihun'),
 -- BIHUN packing
 ('bihun.pl.stock.BPMB', 'B12',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMB', 'B13',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMB', 'B14',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMB', 'B15',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMB', 'B18A',  NULL, 'bihun'),
 ('bihun.pl.stock.BPMB', 'B29',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMB', 'B31',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMB', 'PM_BIG', NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B4',    NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B5',    NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B30',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B28',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B6',    NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B6B',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B7',    NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B8',    NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B9',    NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B10',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B11',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'B16',   NULL, 'bihun'),
 ('bihun.pl.stock.BPMS', 'PM_SMALL', NULL, 'bihun'),
 ('bihun.pl.stock.BTAP', 'B17',      NULL, 'bihun'),
 ('bihun.pl.stock.BTAP', 'SELOTAPE', NULL, 'bihun');

-- ---------------------------------------------------------------------------
-- 5.3 P&L page - PURCHASE section
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, sort_order, source_kind, notes) VALUES
 ('mee.pl.purchase.PU_MGRM', 'mee', 'pl', 'purchase', 'PU_MGRM', 'GARAM',                   10, 'journal_accounts', NULL),
 ('mee.pl.purchase.PU_MTH1', 'mee', 'pl', 'purchase', 'PU_MTH1', 'TH-1',                    20, 'journal_accounts', NULL),
 ('mee.pl.purchase.PU_MSOD', 'mee', 'pl', 'purchase', 'PU_MSOD', 'SODA ASH',                30, 'journal_accounts', NULL),
 ('mee.pl.purchase.PU_MSD',  'mee', 'pl', 'purchase', 'PU_MSD',  'SODIUM TRIPOLYPHOSPHATE', 40, 'journal_accounts', 'Q11 ANSWERED: material discontinued for Mee, no purchase exists or is expected. Permanently zero - never warn, never key a journal'),
 ('mee.pl.purchase.PU_MTEP', 'mee', 'pl', 'purchase', 'PU_MTEP', 'TEPUNG',                  50, 'journal_accounts', NULL),
 ('mee.pl.purchase.PM_MPMS', 'mee', 'pl', 'purchase', 'PM_MPMS', 'SMALL PLASTIC-MEE',       60, 'journal_accounts', NULL),
 ('mee.pl.purchase.PM_MPMB', 'mee', 'pl', 'purchase', 'PM_MPMB', 'BIG PLASTIC-MEE',         70, 'journal_accounts', NULL),
 ('mee.pl.purchase.PM_MTAP', 'mee', 'pl', 'purchase', 'PM_MTAP', 'SELOTAPE-MEE',            80, 'journal_accounts', NULL),
 ('mee.pl.purchase.MRET',    'mee', 'pl', 'purchase', 'MRET',    'RETURN OFF OF GOODS',     90, 'sales_returns',    'Physical sales returns, never a manual journal (Q11)'),
 ('bihun.pl.purchase.PU_BJAG', 'bihun', 'pl', 'purchase', 'PU_BJAG', 'JAGUNG',                        10, 'journal_accounts', NULL),
 ('bihun.pl.purchase.PU_BSDM', 'bihun', 'pl', 'purchase', 'PU_BSDM', 'SODIUM METALBISULPHITE',        20, 'journal_accounts', NULL),
 ('bihun.pl.purchase.PU_BTH2', 'bihun', 'pl', 'purchase', 'PU_BTH2', 'TH-2',                          30, 'journal_accounts', NULL),
 ('bihun.pl.purchase.PU_BBER', 'bihun', 'pl', 'purchase', 'PU_BBER', 'BERAS',                         40, 'journal_accounts', NULL),
 ('bihun.pl.purchase.PU_BSAG', 'bihun', 'pl', 'purchase', 'PU_BSAG', 'SAGO',                          50, 'journal_accounts', NULL),
 ('bihun.pl.purchase.BFT_KOW', 'bihun', 'pl', 'purchase', 'BFT_KOW', 'KOWAS TRANSPORT SDN BHD',       60, 'journal_accounts', NULL),
 ('bihun.pl.purchase.BFT_LS',  'bihun', 'pl', 'purchase', 'BFT_LS',  'LEASING LOGISTIC (EM) SDN BHD', 70, 'journal_accounts', NULL),
 ('bihun.pl.purchase.PM_BPMS', 'bihun', 'pl', 'purchase', 'PM_BPMS', 'SMALL PLASTIC-BIHUN',           80, 'journal_accounts', NULL),
 ('bihun.pl.purchase.PM_BPMB', 'bihun', 'pl', 'purchase', 'PM_BPMB', 'BIG PLASTIC-BIHUN',             90, 'journal_accounts', NULL),
 ('bihun.pl.purchase.PM_BTAP', 'bihun', 'pl', 'purchase', 'PM_BTAP', 'SELOTAPE-BIHUN',               100, 'journal_accounts', NULL),
 ('bihun.pl.purchase.BRET',    'bihun', 'pl', 'purchase', 'BRET',    'RETURN OFF OF GOODS',          110, 'sales_returns',    'Physical sales returns, never a manual journal (Q11)');

INSERT INTO seed_accounts (line_key, account_code, percentage) VALUES
 ('mee.pl.purchase.PU_MGRM', 'PU_MGRM', 100.00),
 ('mee.pl.purchase.PU_MTH1', 'PU_MTH1', 100.00),
 ('mee.pl.purchase.PU_MSOD', 'PU_MSOD', 100.00),
 ('mee.pl.purchase.PU_MSD',  'PU_MSD',  100.00),
 ('mee.pl.purchase.PU_MTEP', 'PU_MTEP', 100.00),
 ('mee.pl.purchase.PM_MPMS', 'PM_MPMS', 100.00),
 ('mee.pl.purchase.PM_MPMB', 'PM_MPMB', 100.00),
 ('mee.pl.purchase.PM_MTAP', 'PM_MTAP', 100.00),
 ('bihun.pl.purchase.PU_BJAG', 'PU_BJAG', 100.00),
 ('bihun.pl.purchase.PU_BSDM', 'PU_BSDM', 100.00),
 ('bihun.pl.purchase.PU_BTH2', 'PU_BTH2', 100.00),
 ('bihun.pl.purchase.PU_BBER', 'PU_BBER', 100.00),
 ('bihun.pl.purchase.PU_BSAG', 'PU_BSAG', 100.00),
 ('bihun.pl.purchase.BFT_KOW', 'BFT_KOW', 100.00),
 ('bihun.pl.purchase.BFT_LS',  'BFT_LS',  100.00),
 ('bihun.pl.purchase.PM_BPMS', 'PM_BPMS', 100.00),
 ('bihun.pl.purchase.PM_BPMB', 'PM_BPMB', 100.00),
 ('bihun.pl.purchase.PM_BTAP', 'PM_BTAP', 100.00);

INSERT INTO seed_product_types (line_key, product_type) VALUES
 ('mee.pl.purchase.MRET',   'MEE'),
 ('bihun.pl.purchase.BRET', 'BH');

-- ---------------------------------------------------------------------------
-- 5.4 Unit-cost page - PRODUCTION
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, sort_order, source_kind, notes) VALUES
 ('mee.uc.production',   'mee',   'unit_cost', 'production', NULL, 'PRODUCTION', 10, 'production_bags', 'Divisor for every unit cost except SALES'),
 ('bihun.uc.production', 'bihun', 'unit_cost', 'production', NULL, 'PRODUCTION', 10, 'production_bags', 'Divisor for every unit cost except SALES');

INSERT INTO seed_product_types (line_key, product_type) VALUES
 ('mee.uc.production',   'MEE'),
 ('bihun.uc.production', 'BH');

-- Zero-price by-products are produced but not saleable output
INSERT INTO seed_products (line_key, product_id, sign, percentage) VALUES
 ('bihun.uc.production', 'HANCUR_BH',     -1, 100.00),
 ('bihun.uc.production', 'KARUNG_HANCUR', -1, 100.00);

-- ---------------------------------------------------------------------------
-- 5.5 Unit-cost page - INGREDIENT + PACKING (opening - closing + purchases)
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, sort_order, source_kind) VALUES
 ('mee.uc.ing.tepung',   'mee', 'unit_cost', 'ingredient', NULL, 'TEPUNG',                  10, 'stock_flow'),
 ('mee.uc.ing.garam',    'mee', 'unit_cost', 'ingredient', NULL, 'GARAM',                   20, 'stock_flow'),
 ('mee.uc.ing.th1',      'mee', 'unit_cost', 'ingredient', NULL, 'TH-1',                    30, 'stock_flow'),
 ('mee.uc.ing.soda',     'mee', 'unit_cost', 'ingredient', NULL, 'SODA ASH',                40, 'stock_flow'),
 ('mee.uc.ing.sodium',   'mee', 'unit_cost', 'ingredient', NULL, 'SODIUM TRIPOLYPHOSPHATE', 50, 'stock_flow'),
 ('mee.uc.pack.selotape','mee', 'unit_cost', 'packing',    NULL, 'SELOTAPE',                10, 'stock_flow'),
 ('mee.uc.pack.small',   'mee', 'unit_cost', 'packing',    NULL, 'PLASTIC (SMALL)',         20, 'stock_flow'),
 ('mee.uc.pack.big',     'mee', 'unit_cost', 'packing',    NULL, 'PLASTIC (BIG)',           30, 'stock_flow'),
 ('bihun.uc.ing.jagung', 'bihun', 'unit_cost', 'ingredient', NULL, 'JAGUNG',                 10, 'stock_flow'),
 ('bihun.uc.ing.sago',   'bihun', 'unit_cost', 'ingredient', NULL, 'SAGO',                   20, 'stock_flow'),
 ('bihun.uc.ing.beras',  'bihun', 'unit_cost', 'ingredient', NULL, 'BERAS',                  30, 'stock_flow'),
 ('bihun.uc.ing.sodium', 'bihun', 'unit_cost', 'ingredient', NULL, 'SODIUM METALBISULPHITE', 40, 'stock_flow'),
 ('bihun.uc.ing.th2',    'bihun', 'unit_cost', 'ingredient', NULL, 'TH-2',                   50, 'stock_flow'),
 ('bihun.uc.pack.selotape','bihun','unit_cost','packing',   NULL, 'SELOTAPE',                10, 'stock_flow'),
 ('bihun.uc.pack.small', 'bihun', 'unit_cost', 'packing',    NULL, 'PLASTIC (SMALL)',        20, 'stock_flow'),
 ('bihun.uc.pack.big',   'bihun', 'unit_cost', 'packing',    NULL, 'PLASTIC (BIG)',          30, 'stock_flow');

INSERT INTO seed_line_refs (line_key, ref_line_key) VALUES
 ('mee.uc.ing.tepung',   'mee.pl.stock.MTEP1'), ('mee.uc.ing.tepung', 'mee.pl.stock.MTEP2'),
 ('mee.uc.ing.tepung',   'mee.pl.stock.MTEP3'), ('mee.uc.ing.tepung', 'mee.pl.purchase.PU_MTEP'),
 ('mee.uc.ing.garam',    'mee.pl.stock.MGRM1'), ('mee.uc.ing.garam',  'mee.pl.purchase.PU_MGRM'),
 ('mee.uc.ing.th1',      'mee.pl.stock.MTH11'), ('mee.uc.ing.th1',    'mee.pl.purchase.PU_MTH1'),
 ('mee.uc.ing.soda',     'mee.pl.stock.MSOD1'), ('mee.uc.ing.soda',   'mee.pl.stock.MSOD2'),
 ('mee.uc.ing.soda',     'mee.pl.purchase.PU_MSOD'),
 ('mee.uc.ing.sodium',   'mee.pl.stock.MSD'),   ('mee.uc.ing.sodium', 'mee.pl.purchase.PU_MSD'),
 ('mee.uc.pack.selotape','mee.pl.stock.MTAP'),  ('mee.uc.pack.selotape','mee.pl.purchase.PM_MTAP'),
 ('mee.uc.pack.small',   'mee.pl.stock.MPMS'),  ('mee.uc.pack.small', 'mee.pl.purchase.PM_MPMS'),
 ('mee.uc.pack.big',     'mee.pl.stock.MPMB'),  ('mee.uc.pack.big',   'mee.pl.purchase.PM_MPMB'),
 ('bihun.uc.ing.jagung', 'bihun.pl.stock.BJAG'), ('bihun.uc.ing.jagung','bihun.pl.purchase.PU_BJAG'),
 ('bihun.uc.ing.sago',   'bihun.pl.stock.BSAG'), ('bihun.uc.ing.sago', 'bihun.pl.stock.KOW'),
 ('bihun.uc.ing.sago',   'bihun.pl.stock.LS'),   ('bihun.uc.ing.sago', 'bihun.pl.purchase.PU_BSAG'),
 ('bihun.uc.ing.sago',   'bihun.pl.purchase.BFT_KOW'), ('bihun.uc.ing.sago','bihun.pl.purchase.BFT_LS'),
 ('bihun.uc.ing.beras',  'bihun.pl.stock.BBER'), ('bihun.uc.ing.beras','bihun.pl.purchase.PU_BBER'),
 ('bihun.uc.ing.sodium', 'bihun.pl.stock.BSDM'), ('bihun.uc.ing.sodium','bihun.pl.purchase.PU_BSDM'),
 ('bihun.uc.ing.th2',    'bihun.pl.stock.BTH2'), ('bihun.uc.ing.th2',  'bihun.pl.purchase.PU_BTH2'),
 ('bihun.uc.pack.selotape','bihun.pl.stock.BTAP'), ('bihun.uc.pack.selotape','bihun.pl.purchase.PM_BTAP'),
 ('bihun.uc.pack.small', 'bihun.pl.stock.BPMS'), ('bihun.uc.pack.small','bihun.pl.purchase.PM_BPMS'),
 ('bihun.uc.pack.big',   'bihun.pl.stock.BPMB'), ('bihun.uc.pack.big', 'bihun.pl.purchase.PM_BPMB');

-- ---------------------------------------------------------------------------
-- 5.6 Unit-cost page - SALARY MACHINE / PACKING
-- Q12 ANSWERED: the report reads these accounts from posted journals, with NO
-- payroll fallback. Salary/EPF/SOCSO/SIP reach them through the JVSL payroll
-- voucher generator (location_account_mappings), which maps to exactly these
-- codes; levy (ML_*/BL_*) is keyed by hand and must not be entered twice.
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, sort_order, source_kind, notes) VALUES
 ('mee.uc.salary.machine',   'mee',   'unit_cost', 'salary', NULL, 'SALARY MACHINE', 10, 'journal_accounts', 'JVSL voucher supplies salary/EPF/SOCSO/SIP; ML_MM levy is keyed manually'),
 ('mee.uc.salary.packing',   'mee',   'unit_cost', 'salary', NULL, 'SALARY PACKING', 20, 'journal_accounts', 'JVSL voucher supplies salary/EPF/SOCSO/SIP; ML_PM levy is keyed manually'),
 ('bihun.uc.salary.machine', 'bihun', 'unit_cost', 'salary', NULL, 'SALARY MACHINE', 10, 'journal_accounts', 'JVSL voucher supplies salary/EPF/SOCSO/SIP; BL_MB levy is keyed manually'),
 ('bihun.uc.salary.packing', 'bihun', 'unit_cost', 'salary', NULL, 'SALARY PACKING', 20, 'journal_accounts', 'JVSL voucher supplies salary/EPF/SOCSO/SIP; BL_PB levy is keyed manually');

INSERT INTO seed_accounts (line_key, account_code, percentage) VALUES
 ('mee.uc.salary.machine',  'MS_MM',    100.00),
 ('mee.uc.salary.machine',  'ME_MM',    100.00),
 ('mee.uc.salary.machine',  'MSC_MM',   100.00),
 ('mee.uc.salary.machine',  'ML_MM',    100.00),
 ('mee.uc.salary.machine',  'MBSIP_MM', 100.00),
 ('mee.uc.salary.packing',  'MS_PM',    100.00),
 ('mee.uc.salary.packing',  'ME_PM',    100.00),
 ('mee.uc.salary.packing',  'MSC_PM',   100.00),
 ('mee.uc.salary.packing',  'ML_PM',    100.00),
 ('mee.uc.salary.packing',  'MBSIP_PM', 100.00),
 ('bihun.uc.salary.machine','BS_MB',    100.00),
 ('bihun.uc.salary.machine','BE_MB',    100.00),
 ('bihun.uc.salary.machine','BSC_MB',   100.00),
 ('bihun.uc.salary.machine','BL_MB',    100.00),
 ('bihun.uc.salary.machine','BSIP_MB',  100.00),
 ('bihun.uc.salary.packing','BS_PB',    100.00),
 ('bihun.uc.salary.packing','BE_PB',    100.00),
 ('bihun.uc.salary.packing','BSC_PB',   100.00),
 ('bihun.uc.salary.packing','BL_PB',    100.00),
 ('bihun.uc.salary.packing','BSIP_PB',  100.00);

-- ---------------------------------------------------------------------------
-- 5.7 Unit-cost page - SALESMAN group
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, sort_order, source_kind) VALUES
 ('mee.uc.sm.salary',      'mee',    'unit_cost', 'salesman', NULL, 'SALARY SALESMAN',                    10, 'journal_accounts'),
 ('bihun.uc.sm.salary',    'bihun',  'unit_cost', 'salesman', NULL, 'SALARY SALESMAN',                    10, 'journal_accounts'),
 ('mee.uc.sm.ikut',        'mee',    'unit_cost', 'salesman', NULL, 'SALARY IKUT LORI',                   20, 'journal_accounts'),
 ('bihun.uc.sm.ikut',      'bihun',  'unit_cost', 'salesman', NULL, 'SALARY IKUT LORI',                   20, 'journal_accounts'),
 ('shared.uc.sm.messing',  'shared', 'unit_cost', 'salesman', NULL, 'STAFF MESSING',                      30, 'journal_accounts'),
 ('shared.uc.sm.diesel',   'shared', 'unit_cost', 'salesman', NULL, 'VRE-DIESEL (LORI SALESMAN SAHAJA)',  40, 'journal_accounts'),
 ('shared.uc.sm.others',   'shared', 'unit_cost', 'salesman', NULL, 'VRE-OTHERS (LORI SALESMAN SAHAJA)',  50, 'journal_accounts'),
 ('shared.uc.sm.baddebts', 'shared', 'unit_cost', 'salesman', NULL, 'BAD DEBTS WRITTEN OFF',              60, 'journal_accounts');

INSERT INTO seed_accounts (line_key, account_code, percentage) VALUES
 ('mee.uc.sm.salary',   'MBS_SMO',  50.00), ('mee.uc.sm.salary',   'MBE_SM',   50.00),
 ('mee.uc.sm.salary',   'MBSC_SM',  50.00), ('mee.uc.sm.salary',   'MBL_SM',   50.00),
 ('mee.uc.sm.salary',   'MBSIP_SM', 50.00), ('mee.uc.sm.salary',   'MS_SM',   100.00),
 ('bihun.uc.sm.salary', 'MBS_SMO',  50.00), ('bihun.uc.sm.salary', 'MBE_SM',   50.00),
 ('bihun.uc.sm.salary', 'MBSC_SM',  50.00), ('bihun.uc.sm.salary', 'MBL_SM',   50.00),
 ('bihun.uc.sm.salary', 'MBSIP_SM', 50.00), ('bihun.uc.sm.salary', 'BS_SM',   100.00),
 ('mee.uc.sm.ikut',     'MBS_ILO',  50.00), ('mee.uc.sm.ikut',     'MBE_IL',   50.00),
 ('mee.uc.sm.ikut',     'MBSC_IL',  50.00), ('mee.uc.sm.ikut',     'MBL_IL',   50.00),
 ('mee.uc.sm.ikut',     'MBSIP_IL', 50.00), ('mee.uc.sm.ikut',     'MS_IL',   100.00),
 ('bihun.uc.sm.ikut',   'MBS_ILO',  50.00), ('bihun.uc.sm.ikut',   'MBE_IL',   50.00),
 ('bihun.uc.sm.ikut',   'MBSC_IL',  50.00), ('bihun.uc.sm.ikut',   'MBL_IL',   50.00),
 ('bihun.uc.sm.ikut',   'MBSIP_IL', 50.00), ('bihun.uc.sm.ikut',   'BS_IL',   100.00),
 ('shared.uc.sm.messing',  'MBSM_SM', 50.00),
 ('shared.uc.sm.baddebts', 'MBD',     50.00);

-- Salesman fleet: SAB2962, SAB6893, SAB6389, SAB4688, SAB9901Y, SD1016T
INSERT INTO seed_accounts (line_key, account_code, percentage)
SELECT 'shared.uc.sm.diesel', 'OIL' || f.veh, 50.00
  FROM unnest(ARRAY['2962','6893','6389','4688','9901','1016']) AS f(veh);
INSERT INTO seed_accounts (line_key, account_code, percentage)
SELECT 'shared.uc.sm.others', k.prefix || f.veh, 50.00
  FROM unnest(ARRAY['INS','SV','TAX','TY','BT','R']) AS k(prefix),
       unnest(ARRAY['2962','6893','6389','4688','9901','1016']) AS f(veh);

-- ---------------------------------------------------------------------------
-- 5.8 Unit-cost page - HABUK group (entirely shared 50/50)
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, sort_order, source_kind) VALUES
 ('shared.uc.hb.habuk',  'shared', 'unit_cost', 'habuk', NULL, 'SALARY HABUK',                   10, 'journal_accounts'),
 ('shared.uc.hb.jagaapi','shared', 'unit_cost', 'habuk', NULL, 'SALARY JAGA API',                20, 'journal_accounts'),
 ('shared.uc.hb.burning','shared', 'unit_cost', 'habuk', NULL, 'BURNING MATERIALS (HABUK/KAYU)', 30, 'journal_accounts'),
 ('shared.uc.hb.diesel', 'shared', 'unit_cost', 'habuk', NULL, 'VRE-DIESEL (LORI HABUK SAHAJA)', 40, 'journal_accounts'),
 ('shared.uc.hb.others', 'shared', 'unit_cost', 'habuk', NULL, 'VRE-OTHERS (LORI HABUK SAHAJA)', 50, 'journal_accounts');

INSERT INTO seed_accounts (line_key, account_code, percentage) VALUES
 ('shared.uc.hb.habuk',   'MBS_LH',    50.00), ('shared.uc.hb.habuk',   'MBE_LH',    50.00),
 ('shared.uc.hb.habuk',   'MBSC_LH',   50.00), ('shared.uc.hb.habuk',   'MBL_LH',    50.00),
 ('shared.uc.hb.habuk',   'MBSIP_LH',  50.00),
 ('shared.uc.hb.jagaapi', 'MBS_JB',    50.00), ('shared.uc.hb.jagaapi', 'MBE_JB',    50.00),
 ('shared.uc.hb.jagaapi', 'MBSC_JB',   50.00), ('shared.uc.hb.jagaapi', 'MBL_JB',    50.00),
 ('shared.uc.hb.jagaapi', 'MBSIP_JB',  50.00),
 ('shared.uc.hb.burning', 'MBKH',      50.00);

-- Habuk fleet: SAB2035, SAB1325, SAB830
INSERT INTO seed_accounts (line_key, account_code, percentage)
SELECT 'shared.uc.hb.diesel', 'OIL' || f.veh, 50.00
  FROM unnest(ARRAY['2035','1325','830']) AS f(veh);
INSERT INTO seed_accounts (line_key, account_code, percentage)
SELECT 'shared.uc.hb.others', k.prefix || f.veh, 50.00
  FROM unnest(ARRAY['INS','SV','TAX','TY','BT','R']) AS k(prefix),
       unnest(ARRAY['2035','1325','830']) AS f(veh);

-- ---------------------------------------------------------------------------
-- 5.9 Unit-cost page - EXPENSES (the shared 50/50 pool, legacy row order)
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, sort_order, source_kind, notes) VALUES
 ('shared.uc.exp.advertisement', 'shared', 'unit_cost', 'expenses', 'MBADV',  'ADVERTISEMENT',                     10, 'journal_accounts', NULL),
 ('shared.uc.exp.auditors',      'shared', 'unit_cost', 'expenses', 'MBAR',   'AUDITORS REMUNERATION',             20, 'journal_accounts', NULL),
 ('shared.uc.exp.bankcharges',   'shared', 'unit_cost', 'expenses', 'MBBC',   'BANK CHARGES',                      30, 'journal_accounts', NULL),
 ('shared.uc.exp.cleaning',      'shared', 'unit_cost', 'expenses', 'MBC',    'CLEANING EXPENSES',                 40, 'journal_accounts', NULL),
 ('shared.uc.exp.directors',     'shared', 'unit_cost', 'expenses', NULL,     'DIRECTORS REMUNERATION',            50, 'journal_accounts', NULL),
 ('shared.uc.exp.donations',     'shared', 'unit_cost', 'expenses', 'MBDON',  'DONATIONS',                         60, 'journal_accounts', NULL),
 ('shared.uc.exp.electricity',   'shared', 'unit_cost', 'expenses', 'MBEW',   'ELECTRICITY AND WATER',             70, 'journal_accounts', NULL),
 ('shared.uc.exp.entertainment', 'shared', 'unit_cost', 'expenses', 'MBEN',   'ENTERTAINMENT',                     80, 'journal_accounts', NULL),
 ('shared.uc.exp.insurance',     'shared', 'unit_cost', 'expenses', 'MBINS',  'INSURANCE',                         90, 'journal_accounts', NULL),
 ('shared.uc.exp.inspection',    'shared', 'unit_cost', 'expenses', 'MBIF',   'INSPECTION FEE',                   100, 'journal_accounts', NULL),
 ('shared.uc.exp.legal',         'shared', 'unit_cost', 'expenses', 'MBLP',   'LEGAL AND PROFESSIONAL FEE',       110, 'journal_accounts', NULL),
 ('shared.uc.exp.levy',          'shared', 'unit_cost', 'expenses', NULL,     'LEVY',                             120, 'journal_accounts', NULL),
 ('shared.uc.exp.licence',       'shared', 'unit_cost', 'expenses', 'MBLC',   'LICENCE FEE',                      130, 'journal_accounts', NULL),
 ('shared.uc.exp.medical',       'shared', 'unit_cost', 'expenses', 'MBMED',  'MEDICAL FEE',                      140, 'journal_accounts', NULL),
 ('shared.uc.exp.newspaper',     'shared', 'unit_cost', 'expenses', 'MBNEW',  'NEWSPAPER AND PERIODICALS',        150, 'journal_accounts', NULL),
 ('shared.uc.exp.refreshment',   'shared', 'unit_cost', 'expenses', 'MBOR',   'OFFICE REFRESHMENT',               160, 'journal_accounts', NULL),
 ('shared.uc.exp.penalty',       'shared', 'unit_cost', 'expenses', 'MBPEN',  'PENALTY',                          170, 'journal_accounts', NULL),
 ('shared.uc.exp.postage',       'shared', 'unit_cost', 'expenses', 'MBTEL',  'POSTAGE AND TELEPHONE',            180, 'journal_accounts', NULL),
 ('shared.uc.exp.printing',      'shared', 'unit_cost', 'expenses', 'MBPS',   'PRINTING AND STATIONERY',          190, 'journal_accounts', NULL),
 ('shared.uc.exp.rent',          'shared', 'unit_cost', 'expenses', 'MBREN',  'RENT AND RATES',                   200, 'journal_accounts', NULL),
 ('shared.uc.exp.repairfactory', 'shared', 'unit_cost', 'expenses', 'MBRMF',  'REPAIR AND MAINTENANCE (FACTORY)', 210, 'journal_accounts', NULL),
 ('shared.uc.exp.repairoffice',  'shared', 'unit_cost', 'expenses', 'MBRMO',  'REPAIR AND MAINTENANCE (OFFICE)',  220, 'journal_accounts', NULL),
 ('shared.uc.exp.repairboiler',  'shared', 'unit_cost', 'expenses', NULL,     'REPAIR AND MAINTENANCE (BOILER)',  230, 'journal_accounts', 'Q13 ANSWERED: MBRMB belongs here at 50%, never in MACHINE REPAIR. Legacy also counts MBKH here, which the HABUK group counts again'),
 ('shared.uc.exp.safety',        'shared', 'unit_cost', 'expenses', 'MBSAF',  'SAFETY & HEALTH EXPENSES',         240, 'journal_accounts', NULL),
 ('shared.uc.exp.salary',        'shared', 'unit_cost', 'expenses', NULL,     'SALARY & WAGES',                   250, 'journal_accounts', 'Supplied by the JVSL payroll voucher (location_account_mappings)'),
 ('shared.uc.exp.epf',           'shared', 'unit_cost', 'expenses', NULL,     'EPF (EMPLOYEES PROVIDENT FUND CONTRIBUTIONS)', 260, 'journal_accounts', 'Supplied by the JVSL payroll voucher (location_account_mappings)'),
 ('shared.uc.exp.socso',         'shared', 'unit_cost', 'expenses', NULL,     'SOCSO CONTRIBUTIONS',              270, 'journal_accounts', 'Supplied by the JVSL payroll voucher (location_account_mappings)'),
 ('shared.uc.exp.sip',           'shared', 'unit_cost', 'expenses', NULL,     'SIP CONTRIBUTIONS',                280, 'journal_accounts', 'Supplied by the JVSL payroll voucher; legacy formula omits MBSIP_PK, unlike SALARY/EPF/SOCSO'),
 ('shared.uc.exp.secretarial',   'shared', 'unit_cost', 'expenses', 'MBSEC',  'SECRETARIAL AND FILLING FEES',     290, 'journal_accounts', NULL),
 ('shared.uc.exp.sundry',        'shared', 'unit_cost', 'expenses', 'MBSUN',  'SUNDRY EXPENSES',                  300, 'journal_accounts', NULL),
 ('shared.uc.exp.messing',       'shared', 'unit_cost', 'expenses', NULL,     'STAFF MESSING',                    310, 'journal_accounts', NULL),
 ('shared.uc.exp.training',      'shared', 'unit_cost', 'expenses', 'MBST',   'STAFF TRAINING',                   320, 'journal_accounts', NULL),
 ('shared.uc.exp.travelling',    'shared', 'unit_cost', 'expenses', 'MBTRV',  'TRAVELLING AND ACCOMMODATION',     330, 'journal_accounts', NULL),
 ('mee.uc.exp.transportation',   'mee',    'unit_cost', 'expenses', NULL,     'TRANSPORTATION',                   340, 'journal_accounts', NULL),
 ('bihun.uc.exp.transportation', 'bihun',  'unit_cost', 'expenses', NULL,     'TRANSPORTATION',                   340, 'journal_accounts', NULL),
 ('shared.uc.exp.upkeepfactory', 'shared', 'unit_cost', 'expenses', 'MBUF',   'UPKEEP OF FACTORY',                370, 'journal_accounts', NULL),
 ('shared.uc.exp.upkeepmachf',   'shared', 'unit_cost', 'expenses', 'MBUMF',  'UPKEEP OF MACHINERY (FACTORY)',    380, 'journal_accounts', NULL),
 ('shared.uc.exp.upkeepmacho',   'shared', 'unit_cost', 'expenses', 'MBUMO',  'UPKEEP OF MACHINERY (OFFICE)',     390, 'journal_accounts', NULL),
 ('shared.uc.exp.upkeepmachb',   'shared', 'unit_cost', 'expenses', 'MBUMB',  'UPKEEP OF MACHINERY (BOILER)',     400, 'journal_accounts', NULL),
 ('shared.uc.exp.vrediesel',     'shared', 'unit_cost', 'expenses', NULL,     'VRE-DIESEL',                       410, 'journal_accounts', 'Legacy formula has no OILBFORK, and no such account exists'),
 ('shared.uc.exp.vreinsurance',  'shared', 'unit_cost', 'expenses', NULL,     'VRE-INSURANCE',                    420, 'journal_accounts', NULL),
 ('shared.uc.exp.vreservice',    'shared', 'unit_cost', 'expenses', NULL,     'VRE-SERVICE',                      430, 'journal_accounts', NULL),
 ('shared.uc.exp.vreroadtax',    'shared', 'unit_cost', 'expenses', NULL,     'VRE-ROAD TAX',                     440, 'journal_accounts', NULL),
 ('shared.uc.exp.vretyre',       'shared', 'unit_cost', 'expenses', NULL,     'VRE-TYRE',                         450, 'journal_accounts', NULL),
 ('shared.uc.exp.vrebattery',    'shared', 'unit_cost', 'expenses', NULL,     'VRE-BATTERY',                      460, 'journal_accounts', NULL),
 ('shared.uc.exp.vrerepair',     'shared', 'unit_cost', 'expenses', NULL,     'VRE-REPAIR',                       470, 'journal_accounts', NULL),
 ('shared.uc.exp.workpass',      'shared', 'unit_cost', 'expenses', 'MBWP',   'WORKPASS',                         480, 'journal_accounts', NULL);

-- One-account expense rows
INSERT INTO seed_accounts (line_key, account_code, percentage)
SELECT s.line_key, s.code, 50.00 FROM (VALUES
 ('shared.uc.exp.advertisement', 'MBADV'), ('shared.uc.exp.auditors',      'MBAR'),
 ('shared.uc.exp.bankcharges',   'MBBC'),  ('shared.uc.exp.cleaning',      'MBC'),
 ('shared.uc.exp.donations',     'MBDON'), ('shared.uc.exp.electricity',   'MBEW'),
 ('shared.uc.exp.entertainment', 'MBEN'),  ('shared.uc.exp.insurance',     'MBINS'),
 ('shared.uc.exp.inspection',    'MBIF'),  ('shared.uc.exp.legal',         'MBLP'),
 ('shared.uc.exp.licence',       'MBLC'),  ('shared.uc.exp.medical',       'MBMED'),
 ('shared.uc.exp.newspaper',     'MBNEW'), ('shared.uc.exp.refreshment',   'MBOR'),
 ('shared.uc.exp.penalty',       'MBPEN'), ('shared.uc.exp.postage',       'MBTEL'),
 ('shared.uc.exp.printing',      'MBPS'),  ('shared.uc.exp.rent',          'MBREN'),
 ('shared.uc.exp.repairfactory', 'MBRMF'), ('shared.uc.exp.repairoffice',  'MBRMO'),
 ('shared.uc.exp.safety',        'MBSAF'), ('shared.uc.exp.secretarial',   'MBSEC'),
 ('shared.uc.exp.sundry',        'MBSUN'), ('shared.uc.exp.training',      'MBST'),
 ('shared.uc.exp.travelling',    'MBTRV'), ('shared.uc.exp.upkeepfactory', 'MBUF'),
 ('shared.uc.exp.upkeepmachf',   'MBUMF'), ('shared.uc.exp.upkeepmacho',   'MBUMO'),
 ('shared.uc.exp.upkeepmachb',   'MBUMB'), ('shared.uc.exp.workpass',      'MBWP')
) AS s(line_key, code);

-- Multi-account expense rows
INSERT INTO seed_accounts (line_key, account_code, percentage) VALUES
 ('shared.uc.exp.directors',    'MBDRB',    50.00), ('shared.uc.exp.directors',    'MBDRE',    50.00),
 ('shared.uc.exp.directors',    'MBDRS',    50.00), ('shared.uc.exp.directors',    'MBDRSC',   50.00),
 ('shared.uc.exp.directors',    'MBDRSIP',  50.00),
 ('shared.uc.exp.levy',         'MBL_O',    50.00), ('shared.uc.exp.levy',         'MBL_PK',   50.00),
 ('shared.uc.exp.levy',         'MBL_TS',   50.00), ('shared.uc.exp.levy',         'MBL_M',    50.00),
 ('shared.uc.exp.repairboiler', 'MBRMB',    50.00), ('shared.uc.exp.repairboiler', 'PU_CHEM',  50.00),
 ('shared.uc.exp.repairboiler', 'MBKH',     50.00),
 ('shared.uc.exp.salary',       'MBS_O',    50.00), ('shared.uc.exp.salary',       'MBS_PK',   50.00),
 ('shared.uc.exp.salary',       'MBS_TS',   50.00), ('shared.uc.exp.salary',       'MBS_M',    50.00),
 ('shared.uc.exp.epf',          'MBE_O',    50.00), ('shared.uc.exp.epf',          'MBE_PK',   50.00),
 ('shared.uc.exp.epf',          'MBE_TS',   50.00), ('shared.uc.exp.epf',          'MBE_M',    50.00),
 ('shared.uc.exp.socso',        'MBSC_O',   50.00), ('shared.uc.exp.socso',        'MBSC_PK',  50.00),
 ('shared.uc.exp.socso',        'MBSC_TS',  50.00), ('shared.uc.exp.socso',        'MBSC_M',   50.00),
 ('shared.uc.exp.sip',          'MBSIP_O',  50.00), ('shared.uc.exp.sip',          'MBSIP_TS', 50.00),
 ('shared.uc.exp.sip',          'MBSIP_M',  50.00),
 ('shared.uc.exp.messing',      'MBSM_O',   50.00), ('shared.uc.exp.messing',      'MBSM_K',   50.00),
 ('mee.uc.exp.transportation',   'MBTRA',   50.00), ('mee.uc.exp.transportation',   'MTRA',  100.00),
 ('bihun.uc.exp.transportation', 'MBTRA',   50.00), ('bihun.uc.exp.transportation', 'BTRA',  100.00);

-- Shared fleet VRE rows. OIL has no BFORK account, exactly as the legacy formula prints.
INSERT INTO seed_accounts (line_key, account_code, percentage)
SELECT 'shared.uc.exp.vrediesel', 'OIL' || f.veh, 50.00
  FROM unnest(ARRAY['9922','9698','6323','7369','5163','OTH','FORK','CASE','HT18','HT15','JCB','9753','9897']) AS f(veh);
INSERT INTO seed_accounts (line_key, account_code, percentage)
SELECT t.k, t.prefix || f.veh, 50.00
  FROM (VALUES ('shared.uc.exp.vreinsurance','INS'), ('shared.uc.exp.vreservice','SV'),
               ('shared.uc.exp.vreroadtax','TAX'),   ('shared.uc.exp.vretyre','TY'),
               ('shared.uc.exp.vrebattery','BT'),    ('shared.uc.exp.vrerepair','R')) AS t(k, prefix),
       unnest(ARRAY['9922','9698','6323','7369','5163','OTH','FORK','BFORK','CASE','HT18','HT15','JCB','9753','9897']) AS f(veh);

-- ---------------------------------------------------------------------------
-- 5.10 Unit-cost page - MACHINE REPAIR
-- Q13 ANSWERED, formula confirmed verbatim: MBRM + MBUM at 50%, MRM/MUM (mee)
-- and BRM/BUM (bihun) at 100%, and MBRMB stays out of this row entirely.
-- ---------------------------------------------------------------------------
INSERT INTO seed_lines (line_key, product_line, page, section, code, description, sort_order, source_kind, notes) VALUES
 ('mee.uc.repair',   'mee',   'unit_cost', 'machine_repair', NULL, 'MEE MACHINE REPAIR',   10, 'journal_accounts', 'Q13 ANSWERED: formula confirmed. Residual vs the June print is a source-classification delta, not a formula issue'),
 ('bihun.uc.repair', 'bihun', 'unit_cost', 'machine_repair', NULL, 'BIHUN MACHINE REPAIR', 10, 'journal_accounts', 'Q13 ANSWERED: formula confirmed. Residual vs the June print is a source-classification delta, not a formula issue');

INSERT INTO seed_accounts (line_key, account_code, percentage) VALUES
 ('mee.uc.repair',   'MBRM',  50.00), ('mee.uc.repair',   'MBUM',  50.00),
 ('mee.uc.repair',   'MRM',  100.00), ('mee.uc.repair',   'MUM',  100.00),
 ('bihun.uc.repair', 'MBRM',  50.00), ('bihun.uc.repair', 'MBUM',  50.00),
 ('bihun.uc.repair', 'BRM',  100.00), ('bihun.uc.repair', 'BUM',  100.00);

-- ===========================================================================
-- 6. Apply the seed
-- ===========================================================================
INSERT INTO estimated_report_lines
  (line_key, product_line, page, section, code, description,
   opening_code, opening_description, sort_order, source_kind, notes)
SELECT line_key, product_line, page, section, code, description,
       opening_code, opening_description, sort_order, source_kind, notes
  FROM seed_lines
ON CONFLICT (line_key) DO UPDATE SET
  product_line        = EXCLUDED.product_line,
  page                = EXCLUDED.page,
  section             = EXCLUDED.section,
  code                = EXCLUDED.code,
  description         = EXCLUDED.description,
  opening_code        = EXCLUDED.opening_code,
  opening_description = EXCLUDED.opening_description,
  sort_order          = EXCLUDED.sort_order,
  source_kind         = EXCLUDED.source_kind,
  notes               = EXCLUDED.notes,
  updated_at          = NOW();

-- Re-running the migration restores the default mappings for the seeded lines.
DELETE FROM estimated_report_line_sources s
 USING estimated_report_lines l
 WHERE s.line_id = l.id AND l.line_key IN (SELECT line_key FROM seed_lines);

INSERT INTO estimated_report_line_sources (line_id, source_type, sign, percentage, account_code)
SELECT l.id, 'account', 1, a.percentage, a.account_code
  FROM seed_accounts a JOIN estimated_report_lines l ON l.line_key = a.line_key;

INSERT INTO estimated_report_line_sources (line_id, source_type, sign, percentage, material_id, variant_id, stock_bucket)
SELECT l.id, 'material', 1, 100.00, m.id, v.id, s.stock_bucket
  FROM seed_materials s
  JOIN estimated_report_lines l ON l.line_key = s.line_key
  JOIN materials m ON m.code = s.material_code
  LEFT JOIN material_variants v ON v.material_id = m.id AND v.variant_name = s.variant_name;

INSERT INTO estimated_report_line_sources (line_id, source_type, sign, percentage, stock_bucket)
SELECT l.id, 'kilang', 1, 100.00, l.product_line
  FROM estimated_report_lines l
 WHERE l.line_key IN (SELECT line_key FROM seed_lines WHERE source_kind = 'kilang_stock');

INSERT INTO estimated_report_line_sources (line_id, source_type, sign, percentage, product_id)
SELECT l.id, 'product', p.sign, p.percentage, p.product_id
  FROM seed_products p JOIN estimated_report_lines l ON l.line_key = p.line_key;

INSERT INTO estimated_report_line_sources (line_id, source_type, sign, percentage, product_type)
SELECT l.id, 'product_type', 1, 100.00, t.product_type
  FROM seed_product_types t JOIN estimated_report_lines l ON l.line_key = t.line_key;

INSERT INTO estimated_report_line_sources (line_id, source_type, sign, percentage, ref_line_id)
SELECT l.id, 'line', 1, 100.00, r.id
  FROM seed_line_refs f
  JOIN estimated_report_lines l ON l.line_key = f.line_key
  JOIN estimated_report_lines r ON r.line_key = f.ref_line_key;

-- ---------------------------------------------------------------------------
-- 7. Accumulative anchors (user-confirmed, Q7)
-- ---------------------------------------------------------------------------
INSERT INTO estimated_report_anchors (product_line, as_of_date, accumulative, notes, created_by)
VALUES
 ('mee',   DATE '2026-06-01', -166900.31, 'Printed June accumulative -199,238.44 less printed June P/L -32,338.13 (confirmed by the user, Q7)', 'migration'),
 ('bihun', DATE '2026-06-01',  404935.44, 'Printed June accumulative 475,457.87 less printed June P/L 70,522.43 (confirmed by the user, Q7)',  'migration')
ON CONFLICT (product_line, as_of_date) DO NOTHING;

-- ===========================================================================
-- 8. Guards - fail closed if the seed did not resolve cleanly
-- ===========================================================================
DO $$
DECLARE
  v_missing_account INTEGER;
  v_missing_material INTEGER;
  v_missing_variant INTEGER;
  v_missing_product INTEGER;
  v_missing_ref INTEGER;
  v_lines INTEGER;
  v_sources INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing_account
    FROM seed_accounts a LEFT JOIN account_codes c ON c.code = a.account_code
   WHERE c.code IS NULL;
  SELECT COUNT(*) INTO v_missing_material
    FROM seed_materials s LEFT JOIN materials m ON m.code = s.material_code
   WHERE m.id IS NULL;
  SELECT COUNT(*) INTO v_missing_variant
    FROM seed_materials s
    JOIN materials m ON m.code = s.material_code
    LEFT JOIN material_variants v ON v.material_id = m.id AND v.variant_name = s.variant_name
   WHERE s.variant_name IS NOT NULL AND v.id IS NULL;
  SELECT COUNT(*) INTO v_missing_product
    FROM seed_products p LEFT JOIN products pr ON pr.id = p.product_id
   WHERE pr.id IS NULL;
  SELECT COUNT(*) INTO v_missing_ref
    FROM seed_line_refs f LEFT JOIN estimated_report_lines l ON l.line_key = f.ref_line_key
   WHERE l.id IS NULL;

  IF v_missing_account > 0 THEN RAISE EXCEPTION 'seed references % unknown account code(s)', v_missing_account; END IF;
  IF v_missing_material > 0 THEN RAISE EXCEPTION 'seed references % unknown material code(s)', v_missing_material; END IF;
  IF v_missing_variant > 0 THEN RAISE EXCEPTION 'seed references % unknown material variant(s)', v_missing_variant; END IF;
  IF v_missing_product > 0 THEN RAISE EXCEPTION 'seed references % unknown product id(s)', v_missing_product; END IF;
  IF v_missing_ref > 0 THEN RAISE EXCEPTION 'seed references % unknown line key(s)', v_missing_ref; END IF;

  SELECT COUNT(*) INTO v_lines FROM estimated_report_lines;
  SELECT COUNT(*) INTO v_sources FROM estimated_report_line_sources;
  RAISE NOTICE 'estimated report seed: % lines, % source members', v_lines, v_sources;
END $$;

COMMIT;
