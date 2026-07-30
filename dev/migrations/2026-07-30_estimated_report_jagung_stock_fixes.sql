\set ON_ERROR_STOP on

-- This is ran in prod but unsure if it correctly applied

-- June 2026 Estimated P&L corrections: JAGUNG (Tepung Jagung, material 27/B3,
-- bihun bucket) physical stock counts were mis-keyed by one digit, and the
-- boss's June Add Back values were never keyed.
--
-- Evidence (all four independent sources agree):
--   * Boss's handwritten corrections on the legacy June 2026 print:
--     CS JAGUNG 22,086.00; OS JAGUNG working 33,209.00.
--   * Printed totals reproduce EXACTLY only with the corrected values:
--     closing total 414,685.86 = 414,145.86 - 21,546.00 + 22,086.00
--     opening total 486,311.65 = 491,931.65 - 38,829.00 + 33,209.00
--   * Boss's handwritten unit-cost JAGUNG usage 28,403.00
--       = 33,209.00 (OS) + 17,280.00 (PU) - 22,086.00 (CS).
--   * Clean bag arithmetic at the keyed unit costs:
--     June HOMCO 409 x 54.00 = 22,086.00 (was 399 bags = 21,546.00)
--     May KK RICE + TRANSPORT 196 x 70.25 = 13,769.00 (was 276 bags = 19,389.00)
--     May jagung total 13,769.00 + 19,440.00 (HOMCO 360 x 54.00) = 33,209.00.
--
-- The legacy print's amount column is shifted one row up in the stock
-- sections, which is why 1,269.95 (SODIUM closing) prints beside JAGUNG and
-- the boss's OS figure 34,636.09 = 33,209.00 + 1,427.09 (May SODIUM) adds the
-- shifted sodium value back in. SODIUM rows are correct as keyed and are NOT
-- touched.
--
-- The guards accept only the exact old state or the exact final state; any
-- partial/unexpected state aborts the whole transaction.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';

-- FIX-1: May 2026 B3 KK RICE + TRANSPORT is 196 bags x RM70.25 = RM13,769.00,
-- not 276 bags = RM19,389.00.
DO $$
DECLARE
  v_stock material_stock_entries%ROWTYPE;
  v_variant_count INTEGER;
  v_logical_row_count INTEGER;
  v_rows_updated INTEGER;
  v_is_old BOOLEAN;
  v_is_final BOOLEAN;
BEGIN
  SELECT *
    INTO STRICT v_stock
    FROM material_stock_entries
   WHERE id = 294
   FOR UPDATE;

  SELECT COUNT(*)
    INTO v_variant_count
    FROM materials m
    JOIN material_variants v ON v.material_id = m.id
   WHERE m.id = 27
     AND m.code = 'B3'
     AND m.is_active = TRUE
     AND v.id = 11
     AND v.variant_name = 'KK RICE + TRANSPORT'
     AND v.is_active = TRUE;

  SELECT COUNT(*)
    INTO v_logical_row_count
    FROM material_stock_entries
   WHERE year = 2026
     AND month = 5
     AND product_line = 'bihun'
     AND material_id = 27
     AND variant_id = 11;

  IF v_stock.year IS DISTINCT FROM 2026
     OR v_stock.month IS DISTINCT FROM 5
     OR v_stock.product_line IS DISTINCT FROM 'bihun'
     OR v_stock.material_id IS DISTINCT FROM 27
     OR v_stock.variant_id IS DISTINCT FROM 11
     OR v_stock.unit_cost IS DISTINCT FROM 70.2500
     OR v_stock.quantity IS DISTINCT FROM 0.0000
     OR v_stock.custom_name IS NOT NULL
     OR v_stock.custom_description IS NOT NULL
     OR v_stock.notes IS NOT NULL
     OR v_variant_count <> 1
     OR v_logical_row_count <> 1 THEN
    RAISE EXCEPTION 'FIX-1 material stock row 294 identity has drifted';
  END IF;

  v_is_old :=
    v_stock.adjustment_quantity IS NOT DISTINCT FROM 276.0000
    AND v_stock.adjustment_value IS NOT DISTINCT FROM 19389.00;
  v_is_final :=
    v_stock.adjustment_quantity IS NOT DISTINCT FROM 196.0000
    AND v_stock.adjustment_value IS NOT DISTINCT FROM 13769.00;

  IF v_is_old THEN
    UPDATE material_stock_entries
       SET adjustment_quantity = 196.0000,
           adjustment_value = 13769.00,
           updated_at = NOW()
     WHERE id = 294;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated <> 1 THEN
      RAISE EXCEPTION 'FIX-1 expected to update material stock row 294 once';
    END IF;
    RAISE NOTICE 'FIX-1 APPLIED: May BIHUN B3 KK RICE + TRANSPORT stock corrected to 196 bags / RM13,769.00';
  ELSIF NOT v_is_final THEN
    RAISE EXCEPTION
      'FIX-1 material stock row 294 is neither the complete old state nor complete final state';
  ELSE
    RAISE NOTICE 'FIX-1 ALREADY FINAL: May BIHUN B3 KK RICE + TRANSPORT stock is 196 bags / RM13,769.00';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM material_stock_entries
     WHERE id = 294
       AND year = 2026
       AND month = 5
       AND product_line = 'bihun'
       AND material_id = 27
       AND variant_id = 11
       AND adjustment_quantity = 196.0000
       AND unit_cost = 70.2500
       AND adjustment_value = 13769.00
  ) THEN
    RAISE EXCEPTION 'FIX-1 postflight failed for material stock row 294';
  END IF;
END $$;

-- FIX-2: June 2026 B3 HOMCO is 409 bags x RM54.00 = RM22,086.00, not
-- 399 bags = RM21,546.00.
DO $$
DECLARE
  v_stock material_stock_entries%ROWTYPE;
  v_variant_count INTEGER;
  v_logical_row_count INTEGER;
  v_rows_updated INTEGER;
  v_is_old BOOLEAN;
  v_is_final BOOLEAN;
BEGIN
  SELECT *
    INTO STRICT v_stock
    FROM material_stock_entries
   WHERE id = 141
   FOR UPDATE;

  SELECT COUNT(*)
    INTO v_variant_count
    FROM materials m
    JOIN material_variants v ON v.material_id = m.id
   WHERE m.id = 27
     AND m.code = 'B3'
     AND m.is_active = TRUE
     AND v.id = 12
     AND v.variant_name = 'HOMCO'
     AND v.is_active = TRUE;

  SELECT COUNT(*)
    INTO v_logical_row_count
    FROM material_stock_entries
   WHERE year = 2026
     AND month = 6
     AND product_line = 'bihun'
     AND material_id = 27
     AND variant_id = 12;

  IF v_stock.year IS DISTINCT FROM 2026
     OR v_stock.month IS DISTINCT FROM 6
     OR v_stock.product_line IS DISTINCT FROM 'bihun'
     OR v_stock.material_id IS DISTINCT FROM 27
     OR v_stock.variant_id IS DISTINCT FROM 12
     OR v_stock.unit_cost IS DISTINCT FROM 54.0000
     OR v_stock.quantity IS DISTINCT FROM 0.0000
     OR v_stock.custom_name IS NOT NULL
     OR v_stock.custom_description IS NOT NULL
     OR v_stock.notes IS NOT NULL
     OR v_variant_count <> 1
     OR v_logical_row_count <> 1 THEN
    RAISE EXCEPTION 'FIX-2 material stock row 141 identity has drifted';
  END IF;

  v_is_old :=
    v_stock.adjustment_quantity IS NOT DISTINCT FROM 399.0000
    AND v_stock.adjustment_value IS NOT DISTINCT FROM 21546.00;
  v_is_final :=
    v_stock.adjustment_quantity IS NOT DISTINCT FROM 409.0000
    AND v_stock.adjustment_value IS NOT DISTINCT FROM 22086.00;

  IF v_is_old THEN
    UPDATE material_stock_entries
       SET adjustment_quantity = 409.0000,
           adjustment_value = 22086.00,
           updated_at = NOW()
     WHERE id = 141;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated <> 1 THEN
      RAISE EXCEPTION 'FIX-2 expected to update material stock row 141 once';
    END IF;
    RAISE NOTICE 'FIX-2 APPLIED: June BIHUN B3 HOMCO stock corrected to 409 bags / RM22,086.00';
  ELSIF NOT v_is_final THEN
    RAISE EXCEPTION
      'FIX-2 material stock row 141 is neither the complete old state nor complete final state';
  ELSE
    RAISE NOTICE 'FIX-2 ALREADY FINAL: June BIHUN B3 HOMCO stock is 409 bags / RM22,086.00';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM material_stock_entries
     WHERE id = 141
       AND year = 2026
       AND month = 6
       AND product_line = 'bihun'
       AND material_id = 27
       AND variant_id = 12
       AND adjustment_quantity = 409.0000
       AND unit_cost = 54.0000
       AND adjustment_value = 22086.00
  ) THEN
    RAISE EXCEPTION 'FIX-2 postflight failed for material stock row 141';
  END IF;
END $$;

-- FIX-3: key the boss's handwritten June 2026 Add Back values (legacy print:
-- MEE "Add Back + 9658.83", BIHUN "Add Back + 6662.66"). Never overwrites a
-- different user-keyed value.
DO $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  INSERT INTO estimated_report_inputs
         (product_line, year, month, add_back, notes, created_by, updated_by)
  VALUES ('mee', 2026, 6, 9658.83,
          'Boss handwritten add back on the legacy June 2026 print',
          'estimated_report_2026-07-30_fix', 'estimated_report_2026-07-30_fix')
  ON CONFLICT (product_line, year, month) DO NOTHING;

  INSERT INTO estimated_report_inputs
         (product_line, year, month, add_back, notes, created_by, updated_by)
  VALUES ('bihun', 2026, 6, 6662.66,
          'Boss handwritten add back on the legacy June 2026 print',
          'estimated_report_2026-07-30_fix', 'estimated_report_2026-07-30_fix')
  ON CONFLICT (product_line, year, month) DO NOTHING;

  IF EXISTS (
    SELECT 1
      FROM estimated_report_inputs
     WHERE (product_line, year, month) IN (('mee', 2026, 6), ('bihun', 2026, 6))
       AND add_back NOT IN (9658.83, 6662.66)
  ) THEN
    RAISE EXCEPTION 'FIX-3 a different June 2026 add back is already keyed - not overwriting user input';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM estimated_report_inputs
     WHERE product_line = 'mee' AND year = 2026 AND month = 6 AND add_back = 9658.83
  ) OR NOT EXISTS (
    SELECT 1 FROM estimated_report_inputs
     WHERE product_line = 'bihun' AND year = 2026 AND month = 6 AND add_back = 6662.66
  ) THEN
    RAISE EXCEPTION 'FIX-3 postflight failed for June 2026 add backs';
  END IF;

  RAISE NOTICE 'FIX-3 APPLIED: June 2026 add backs keyed (MEE 9,658.83 / BIHUN 6,662.66)';
END $$;

-- Report-level postflight: the corrected stock rows must reproduce the
-- printed JAGUNG line values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM material_stock_entries
     WHERE year = 2026 AND month = 6 AND product_line = 'bihun'
       AND material_id IN (14, 15, 16, 17, 27)
    HAVING ROUND(SUM(adjustment_value), 2) = 22086.00
  ) THEN
    RAISE EXCEPTION 'postflight failed: June BIHUN JAGUNG closing stock is not RM22,086.00';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM material_stock_entries
     WHERE year = 2026 AND month = 5 AND product_line = 'bihun'
       AND material_id IN (14, 15, 16, 17, 27)
    HAVING ROUND(SUM(adjustment_value), 2) = 33209.00
  ) THEN
    RAISE EXCEPTION 'postflight failed: May BIHUN JAGUNG closing stock is not RM33,209.00';
  END IF;

  RAISE NOTICE 'postflight OK: JAGUNG May 33,209.00 / June 22,086.00';
END $$;

COMMIT;
