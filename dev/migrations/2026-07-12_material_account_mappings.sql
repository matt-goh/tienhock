-- 2026-07-12: Material purchases move from the removed Material Purchases form
-- to journal entries (PUR-type). This mapping table links journal account codes
-- (e.g. PU_BBER, PU_MTEP, PM_BPMS) to material stock records so the Material
-- Stock page can derive its Purchases column from posted journal lines.
-- Also assigns fs_note to the purchase parent accounts so journal-keyed
-- purchases flow into the Income Statement / COGM reports (children without a
-- note inherit the nearest ancestor's note in the report queries).

BEGIN;

CREATE TABLE IF NOT EXISTS material_account_mappings (
  id SERIAL PRIMARY KEY,
  account_code VARCHAR(50) NOT NULL REFERENCES account_codes(code) ON UPDATE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES material_variants(id) ON DELETE SET NULL,
  product_line VARCHAR(10) NOT NULL CHECK (product_line IN ('mee', 'bihun', 'shared')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  CONSTRAINT material_account_mappings_account_unique UNIQUE (account_code)
);

-- Financial statement note linkage for purchase accounts.
-- 3-5 = Purchase of Raw Material, 3-2 = Purchases (Packing Material),
-- 3-4 = Purchase of Chemical. Children (PU_BBER, PM_BPMS, ...) inherit
-- via the nearest-ancestor resolution in financial-reports.js.
UPDATE account_codes SET fs_note = '3-5', updated_at = CURRENT_TIMESTAMP WHERE code = 'PUR' AND fs_note IS NULL;
UPDATE account_codes SET fs_note = '3-2', updated_at = CURRENT_TIMESTAMP WHERE code = 'PM' AND fs_note IS NULL;
UPDATE account_codes SET fs_note = '3-2', updated_at = CURRENT_TIMESTAMP WHERE code = 'PUR_PM' AND fs_note IS NULL;
UPDATE account_codes SET fs_note = '3-4', updated_at = CURRENT_TIMESTAMP WHERE code = 'PU_CHEM' AND fs_note IS NULL;

COMMIT;
