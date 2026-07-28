\set ON_ERROR_STOP on

-- Phase 3 parity corrections for the June 2026 Estimated P&L & Unit Cost report.
--
-- These are source-data corrections supported by the original particulars and
-- stock calculation. The guards accept only the exact old state or the exact
-- final state; any partial/unexpected state aborts the whole transaction.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';

-- FIX-1: journal 000199 says 300 bags x RM135 = RM40,500, not RM405,000.
DO $$
DECLARE
  v_header journal_entries%ROWTYPE;
  v_purchase_line journal_entry_lines%ROWTYPE;
  v_control_line journal_entry_lines%ROWTYPE;
  v_line_count INTEGER;
  v_owner_count INTEGER;
  v_rows_updated INTEGER;
  v_is_old BOOLEAN;
  v_is_final BOOLEAN;
BEGIN
  SELECT *
    INTO STRICT v_header
    FROM journal_entries
   WHERE id = 3902
   FOR UPDATE;

  SELECT *
    INTO STRICT v_purchase_line
    FROM journal_entry_lines
   WHERE id = 10535
     AND journal_entry_id = 3902
   FOR UPDATE;

  SELECT *
    INTO STRICT v_control_line
    FROM journal_entry_lines
   WHERE id = 10536
     AND journal_entry_id = 3902
   FOR UPDATE;

  SELECT COUNT(*)
    INTO v_line_count
    FROM journal_entry_lines
   WHERE journal_entry_id = 3902;

  IF v_header.reference_no IS DISTINCT FROM '000199'
     OR v_header.entry_type IS DISTINCT FROM 'PUR'
     OR v_header.entry_date IS DISTINCT FROM DATE '2026-06-22'
     OR v_header.status IS DISTINCT FROM 'posted'
     OR v_header.display_reference IS NOT NULL
     OR v_header.source_type IS NOT NULL
     OR v_header.source_id IS NOT NULL
     OR v_header.manual_override IS DISTINCT FROM FALSE
     OR v_header.description IS DISTINCT FROM 'BERAS(300BAG XRM135)'
     OR v_line_count <> 2 THEN
    RAISE EXCEPTION 'FIX-1 journal 3902 identity or ownership has drifted';
  END IF;

  IF v_purchase_line.account_code IS DISTINCT FROM 'PU_BBER'
     OR v_purchase_line.particulars IS DISTINCT FROM 'PUNCAK NIAGA(300BAG XRM135)'
     OR v_purchase_line.credit_amount IS DISTINCT FROM 0
     OR v_control_line.account_code IS DISTINCT FROM 'CR_PN'
     OR v_control_line.particulars IS DISTINCT FROM 'BERAS(300BAG XRM135)'
     OR v_control_line.debit_amount IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FIX-1 journal 3902 line identity has drifted';
  END IF;

  SELECT
      (SELECT COUNT(*) FROM adjustment_documents WHERE journal_entry_id = 3902)
    + (SELECT COUNT(*) FROM bank_ins WHERE journal_entry_id = 3902)
    + (SELECT COUNT(*) FROM invoices WHERE journal_entry_id = 3902)
    + (SELECT COUNT(*) FROM payments WHERE journal_entry_id = 3902)
    + (SELECT COUNT(*) FROM purchase_invoices WHERE journal_entry_id = 3902)
    + (SELECT COUNT(*) FROM receipts WHERE journal_entry_id = 3902)
    + (SELECT COUNT(*) FROM rv_registry WHERE journal_entry_id = 3902)
    + (SELECT COUNT(*) FROM self_billed_invoices WHERE journal_entry_id = 3902)
    + (SELECT COUNT(*) FROM supplier_payments WHERE journal_entry_id = 3902)
    INTO v_owner_count;

  IF v_owner_count <> 0 THEN
    RAISE EXCEPTION 'FIX-1 journal 3902 unexpectedly belongs to a source document';
  END IF;

  v_is_old :=
    v_header.total_debit IS NOT DISTINCT FROM 405000.00
    AND v_header.total_credit IS NOT DISTINCT FROM 405000.00
    AND v_purchase_line.debit_amount IS NOT DISTINCT FROM 405000.00
    AND v_control_line.credit_amount IS NOT DISTINCT FROM 405000.00;

  v_is_final :=
    v_header.total_debit IS NOT DISTINCT FROM 40500.00
    AND v_header.total_credit IS NOT DISTINCT FROM 40500.00
    AND v_purchase_line.debit_amount IS NOT DISTINCT FROM 40500.00
    AND v_control_line.credit_amount IS NOT DISTINCT FROM 40500.00;

  IF v_is_old THEN
    UPDATE journal_entry_lines
       SET debit_amount = 40500.00
     WHERE id = 10535;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated <> 1 THEN
      RAISE EXCEPTION 'FIX-1 expected to update purchase line 10535 once';
    END IF;

    UPDATE journal_entry_lines
       SET credit_amount = 40500.00
     WHERE id = 10536;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated <> 1 THEN
      RAISE EXCEPTION 'FIX-1 expected to update control line 10536 once';
    END IF;

    UPDATE journal_entries
       SET total_debit = 40500.00,
           total_credit = 40500.00,
           updated_at = NOW(),
           updated_by = 'estimated_report_phase3_fix'
     WHERE id = 3902;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated <> 1 THEN
      RAISE EXCEPTION 'FIX-1 expected to update journal header 3902 once';
    END IF;
    RAISE NOTICE 'FIX-1 APPLIED: journal 000199 corrected to RM40,500.00';
  ELSIF NOT v_is_final THEN
    RAISE EXCEPTION
      'FIX-1 journal 3902 is neither the complete old state nor complete final state';
  ELSE
    RAISE NOTICE 'FIX-1 ALREADY FINAL: journal 000199 is RM40,500.00';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM journal_entries je
      JOIN journal_entry_lines purchase_line
        ON purchase_line.id = 10535
       AND purchase_line.journal_entry_id = je.id
      JOIN journal_entry_lines control_line
        ON control_line.id = 10536
       AND control_line.journal_entry_id = je.id
     WHERE je.id = 3902
       AND je.total_debit = 40500.00
       AND je.total_credit = 40500.00
       AND purchase_line.debit_amount = 40500.00
       AND purchase_line.credit_amount = 0
       AND control_line.debit_amount = 0
       AND control_line.credit_amount = 40500.00
       AND (SELECT COUNT(*) FROM journal_entry_lines WHERE journal_entry_id = je.id) = 2
  ) THEN
    RAISE EXCEPTION 'FIX-1 postflight failed for journal 3902';
  END IF;
END $$;

-- FIX-2: B14 is 1 bag x 8.50/kg x 33.2 kg = RM282.20.
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
   WHERE id = 171
   FOR UPDATE;

  PERFORM m.id
    FROM materials m
    JOIN material_variants v ON v.material_id = m.id
   WHERE m.id = 82
     AND m.code = 'B14'
     AND m.is_active = TRUE
     AND v.id = 118
     AND v.variant_name = '8.50 x 33.2KG (SG)'
     AND v.is_active = TRUE
   FOR SHARE OF m, v;

  SELECT COUNT(*)
    INTO v_variant_count
    FROM materials m
    JOIN material_variants v ON v.material_id = m.id
   WHERE m.id = 82
     AND m.code = 'B14'
     AND m.is_active = TRUE
     AND v.id = 118
     AND v.variant_name = '8.50 x 33.2KG (SG)'
     AND v.is_active = TRUE;

  SELECT COUNT(*)
    INTO v_logical_row_count
    FROM material_stock_entries
   WHERE year = 2026
     AND month = 6
     AND product_line = 'bihun'
     AND material_id = 82
     AND variant_id = 118;

  IF v_stock.year IS DISTINCT FROM 2026
     OR v_stock.month IS DISTINCT FROM 6
     OR v_stock.product_line IS DISTINCT FROM 'bihun'
     OR v_stock.material_id IS DISTINCT FROM 82
     OR v_stock.variant_id IS DISTINCT FROM 118
     OR v_stock.adjustment_quantity IS DISTINCT FROM 1.0000
     OR v_stock.quantity IS DISTINCT FROM 0.0000
     OR v_stock.custom_name IS NOT NULL
     OR v_stock.custom_description IS NOT NULL
     OR v_stock.notes IS NOT NULL
     OR v_variant_count <> 1
     OR v_logical_row_count <> 1 THEN
    RAISE EXCEPTION 'FIX-2 material stock row 171 identity has drifted';
  END IF;

  v_is_old :=
    v_stock.unit_cost IS NOT DISTINCT FROM 282.50
    AND v_stock.adjustment_value IS NOT DISTINCT FROM 282.50;
  v_is_final :=
    v_stock.unit_cost IS NOT DISTINCT FROM 282.20
    AND v_stock.adjustment_value IS NOT DISTINCT FROM 282.20;

  IF v_is_old THEN
    UPDATE material_stock_entries
       SET unit_cost = 282.20,
           adjustment_value = 282.20,
           updated_at = NOW()
     WHERE id = 171;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated <> 1 THEN
      RAISE EXCEPTION 'FIX-2 expected to update material stock row 171 once';
    END IF;
    RAISE NOTICE 'FIX-2 APPLIED: June BIHUN B14 stock corrected to RM282.20';
  ELSIF NOT v_is_final THEN
    RAISE EXCEPTION
      'FIX-2 material stock row 171 is neither the complete old state nor complete final state';
  ELSE
    RAISE NOTICE 'FIX-2 ALREADY FINAL: June BIHUN B14 stock is RM282.20';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM material_stock_entries
     WHERE id = 171
       AND year = 2026
       AND month = 6
       AND product_line = 'bihun'
       AND material_id = 82
       AND variant_id = 118
       AND adjustment_quantity = 1.0000
       AND unit_cost = 282.20
       AND adjustment_value = adjustment_quantity * unit_cost
  ) THEN
    RAISE EXCEPTION 'FIX-2 postflight failed for material stock row 171';
  END IF;
END $$;

COMMIT;

-- Human-readable postflight evidence when run through psql.
SELECT je.id, je.reference_no, je.total_debit, je.total_credit,
       purchase_line.account_code AS purchase_account,
       purchase_line.debit_amount AS purchase_debit,
       control_line.account_code AS control_account,
       control_line.credit_amount AS control_credit
  FROM journal_entries je
  JOIN journal_entry_lines purchase_line ON purchase_line.id = 10535
  JOIN journal_entry_lines control_line ON control_line.id = 10536
 WHERE je.id = 3902;

SELECT id, year, month, product_line, material_id, variant_id,
       adjustment_quantity, unit_cost, adjustment_value
  FROM material_stock_entries
 WHERE id = 171;
