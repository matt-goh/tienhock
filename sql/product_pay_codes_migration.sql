-- Product Pay Codes Migration Script
-- This script creates the product_pay_codes table and inserts initial mappings
-- for linking MEE/BH products to their associated pay codes.

-- ============================================
-- 1. Create the product_pay_codes table
-- ============================================
CREATE TABLE IF NOT EXISTS product_pay_codes (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL,
  pay_code_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, pay_code_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (pay_code_id) REFERENCES pay_codes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_pay_codes_product ON product_pay_codes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_pay_codes_pay_code ON product_pay_codes(pay_code_id);

-- ============================================
-- 2. Insert BH (Bihun) product mappings
-- ============================================

-- 2-APPLE (MIHUN CAP APPLE 300G X 10PKT)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('2-APPLE', '2-APPLE'),
('2-APPLE', 'PBH_APPLE'),
('2-APPLE', 'PBH_APPLE_BAG'),
('2-APPLE', 'FULL_APPLE_40'),
('2-APPLE', 'FULL_APPLE_60'),
('2-APPLE', 'FULL_BAPPLE'),
('2-APPLE', 'FULL_BAPPLE_140')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 2-BCM3 (BIHUN 3 UDANG 600G ME-Q)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('2-BCM3', '2-BCM3'),
('2-BCM3', 'PBH_BCM3'),
('2-BCM3', 'PBH_3U(600G)_BAG'),
('2-BCM3', 'PBH_600G_A'),
('2-BCM3', 'FULL_3U(600G)_40'),
('2-BCM3', 'FULL_3U(600G)_60'),
('2-BCM3', 'FULL_B3U(600G)'),
('2-BCM3', 'FULL_B3U(600G)_140')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 2-BH (Mihun Cap 3UDG 300g x 10pkt)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('2-BH', '2-BH'),
('2-BH', 'PBH_3U'),
('2-BH', 'PBH_3U_BAG'),
('2-BH', 'FULL_3U_40'),
('2-BH', 'FULL_3U_60'),
('2-BH', 'FULL_B3U'),
('2-BH', 'FULL_B3U_140')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 2-BH2 (Mihun Cap 2UDG 300g x 10pkt - Hijau)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('2-BH2', '2-BH2'),
('2-BH2', 'PBH_2UH'),
('2-BH2', 'PBH_2UH_BAG'),
('2-BH2', 'FULL_2UH_40'),
('2-BH2', 'FULL_2UH_60'),
('2-BH2', 'FULL_B2UH'),
('2-BH2', 'FULL_B2UH_140')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 2-BNL (Mihun NL Cap 3UDG 3kg x 1bag)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('2-BNL', '2-BNL'),
('2-BNL', 'PBH_BNL(3.1)'),
('2-BNL', 'PBH_BNL(3.1)_BAG'),
('2-BNL', 'PBH_3.1KG_A'),
('2-BNL', 'FULL_BNL_40'),
('2-BNL', 'FULL_BNL_60'),
('2-BNL', 'FULL_BBNL(3.1)'),
('2-BNL', 'FULL_BBNL(3.1)_140')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 2-BNL(5) (Mihun NL Cap 3UDG 5kg x 1bag)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('2-BNL(5)', '2-BNL(5)'),
('2-BNL(5)', 'PBH_BNL(5)'),
('2-BNL(5)', 'PBH_BNL(5)_BAG'),
('2-BNL(5)', 'PBH_5KG_A'),
('2-BNL(5)', 'FULL_BNL(5)_40'),
('2-BNL(5)', 'FULL_BNL(5)_60'),
('2-BNL(5)', 'FULL_BBNL(5)'),
('2-BNL(5)', 'FULL_BBNL(5)_140')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 2-MASAK (Mihun TKG MASAK 300g x 10pkt)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('2-MASAK', '2-MASAK'),
('2-MASAK', 'PBH_MASAK'),
('2-MASAK', 'PBH_MASAK_BAG'),
('2-MASAK', 'FULL_MASAK_40'),
('2-MASAK', 'FULL_MASAK_60'),
('2-MASAK', 'FULL_BMASAK'),
('2-MASAK', 'FULL_BMASAK_140')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 2-PADI (Mihun Cap UDG PADI 300g x 10pkt)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('2-PADI', '2-PADI'),
('2-PADI', 'PBHADI'),
('2-PADI', 'PBHADI_BAG'),
('2-PADI', 'FULLADI_40'),
('2-PADI', 'FULLADI_60'),
('2-PADI', 'FULL_BPADI'),
('2-PADI', 'FULL_BPADI_140')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- WE-300G (WE-QQ BIHUN 3UDG 1BAG=10PKT)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('WE-300G', 'WE-300G'),
('WE-300G', 'PWE_300G'),
('WE-300G', 'FULL_WE_300G'),
('WE-300G', 'FULL_WE_300G_140'),
('WE-300G', 'FULL_WE_300G_40'),
('WE-300G', 'FULL_WE_300G_60'),
('WE-300G', 'FULL_WE_300G_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- WE-600G (WE-QQ BIHUN 3UDG 1BAG=5PKT)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('WE-600G', 'WE-600G'),
('WE-600G', 'PWE_600G'),
('WE-600G', 'FULL_WE_600G'),
('WE-600G', 'FULL_WE_600G_140'),
('WE-600G', 'FULL_WE_600G_40'),
('WE-600G', 'FULL_WE_600G_60'),
('WE-600G', 'FULL_WE_600G_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- ============================================
-- 3. Insert MEE product mappings
-- ============================================

-- 1-2UDG (Mi Kuning Cap 2UDG 150g x 10pkt)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('1-2UDG', '1-2UDG'),
('1-2UDG', 'PM_2U'),
('1-2UDG', 'PM_2U(M)'),
('1-2UDG', 'FULL_2U'),
('1-2UDG', 'FULL_2U_E'),
('1-2UDG', 'FULL_2U_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 1-350G (ME-Q MI 3 UDG 350G x 5 PKT)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('1-350G', '1-350G'),
('1-350G', 'PM_350G'),
('1-350G', 'FULL_350G'),
('1-350G', 'FULL_350G_E'),
('1-350G', 'FULL_350G_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 1-3UDG (Mi Kuning Cap 3UDG 180g x 10pkt)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('1-3UDG', '1-3UDG'),
('1-3UDG', 'PM_3U'),
('1-3UDG', 'PM_3U(M)'),
('1-3UDG', 'FULL_3U'),
('1-3UDG', 'FULL_3U_E'),
('1-3UDG', 'FULL_3U_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- 1-MNL (Mi No Label 1.5kg x 1bag)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('1-MNL', '1-MNL'),
('1-MNL', '1-MNL2'),
('1-MNL', 'PM_MNL(1.5)'),
('1-MNL', 'FULL_MNL'),
('1-MNL', 'FULL_MNL_E'),
('1-MNL', 'FULLNL_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- WE-2UDG (MEE 2 UDG WE-QQ)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('WE-2UDG', 'WE-2UDG'),
('WE-2UDG', 'WE_2U'),
('WE-2UDG', 'FULL_WE_2U'),
('WE-2UDG', 'FULL_WE_2U_E'),
('WE-2UDG', 'FULL_WE_2U_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- WE-360 (WE-QQ 3UDG 360G x 10 PKT)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('WE-360', 'WE-360'),
('WE-360', 'WE_350G'),
('WE-360', 'FULL_WE_350'),
('WE-360', 'FULL_WE_350_E'),
('WE-360', 'FULL_WE_350_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- WE-360(5PK) (WE-QQ MI 3 UDG 360G x 5 PKT)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('WE-360(5PK)', 'WE-360(5PKT)'),
('WE-360(5PK)', 'WE_360G'),
('WE-360(5PK)', 'FULL_WE_360'),
('WE-360(5PK)', 'FULL_WE_360_E'),
('WE-360(5PK)', 'FULL_WE_360_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- WE-3UDG (WE-QQ MEE 3UDG)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('WE-3UDG', 'WE-3UDG'),
('WE-3UDG', 'WE_3U'),
('WE-3UDG', 'FULL_WE_3U'),
('WE-3UDG', 'FULL_WE_3U_E'),
('WE-3UDG', 'FULL_WE_3U_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- WE-420 (WE-QQ MEE 420G)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('WE-420', 'WE-420'),
('WE-420', 'WE_420G'),
('WE-420', 'FULL_WE_420'),
('WE-420', 'FULL_WE_420_E'),
('WE-420', 'FULL_WE_420_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- WE-MNL (WE-QQ MEE MNL 1.5KG)
INSERT INTO product_pay_codes (product_id, pay_code_id) VALUES
('WE-MNL', 'WE-MNL'),
('WE-MNL', 'WE_MNL'),
('WE-MNL', 'FULL_WE_MNL'),
('WE-MNL', 'FULL_WE_MNL_E'),
('WE-MNL', 'FULL_WENL_UM')
ON CONFLICT (product_id, pay_code_id) DO NOTHING;

-- ============================================
-- Verification query (optional)
-- ============================================
-- SELECT p.id as product_id, p.description, p.type, COUNT(ppc.pay_code_id) as pay_code_count
-- FROM products p
-- LEFT JOIN product_pay_codes ppc ON p.id = ppc.product_id
-- WHERE p.type IN ('MEE', 'BH')
-- GROUP BY p.id, p.description, p.type
-- ORDER BY p.type, p.id;
