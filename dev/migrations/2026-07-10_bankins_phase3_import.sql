-- =============================================================================
-- 2026-07-10_bankins_phase3_import.sql
-- Phase 3 import: the June 2026 RV bank-ins proven by the legacy PDFs
-- (docs/Account/fixtures/JUNE2026_BANK_PBB.csv + JUNE2026_CH_REV2.csv).
--
--   * Adds the 'RV' journal entry type.
--   * Seeds ONE import_opening CH_REV2 receipt (invoices 34869 + 34891, TEO,
--     530.00 + 530.00 = 1,060.00) — the proven component of the 1,060.05
--     anchor; the 0.05 residual stays unanalysed. Posts NO journal and touches
--     no balances (the cash sits inside the opening anchor).
--   * Imports RV001/06–RV081/06 cash bank-ins as real bank_ins + groups +
--     allocations + posted RV journals (DR BANK_PBB per display group, CR
--     holding aggregated), with the exact legacy particulars.
--   * Reserves RV021/022/048 (FROM DRAWING WORKERS) and RV082/083 (refunds) in
--     the shared registry WITHOUT journals — they are manual non-sales RVs the
--     user must key with a confirmed contra account (plan §7 Manual entries).
--
-- Idempotent: skips entirely when June 2026 RVs already exist in rv_registry.
-- Execution: docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
--              < dev/migrations/2026-07-10_bankins_phase3_import.sql
-- =============================================================================

BEGIN;

INSERT INTO journal_entry_types (code, name)
SELECT 'RV', 'Cash Bank-In (RV)'
 WHERE NOT EXISTS (SELECT 1 FROM journal_entry_types WHERE code = 'RV');

DO $$
DECLARE
  rec RECORD;
  g RECORD;
  v_registry_id INTEGER;
  v_bank_in_id INTEGER;
  v_journal_id INTEGER;
  v_group_id INTEGER;
  v_receipt_id INTEGER;
  v_opening_receipt_id INTEGER;
  v_total NUMERIC(12,2);
  v_line INTEGER;
  v_rv_number VARCHAR(20);
  v_existing_registry INTEGER;
  v_existing_bank_registry INTEGER;
  v_existing_reservations INTEGER;
  v_existing_bank_ins INTEGER;
  v_existing_exact BOOLEAN;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE source_type = 'bank_in'),
         COUNT(*) FILTER (WHERE source_type IN ('import', 'manual_journal'))
    INTO v_existing_registry, v_existing_bank_registry, v_existing_reservations
    FROM rv_registry
   WHERE rv_year = 2026 AND rv_month = 6;
  SELECT COUNT(*) INTO v_existing_bank_ins
    FROM bank_ins bi
    JOIN rv_registry rv ON rv.id = bi.rv_registry_id
   WHERE rv.rv_year = 2026 AND rv.rv_month = 6;

  IF v_existing_registry > 0 THEN
    SELECT NOT EXISTS (
      SELECT 1
        FROM generate_series(1, 83) expected(seq)
        LEFT JOIN rv_registry rv
          ON rv.rv_year = 2026 AND rv.rv_month = 6 AND rv.rv_seq = expected.seq
        LEFT JOIN bank_ins bi ON bi.rv_registry_id = rv.id
       WHERE rv.id IS NULL
          OR rv.rv_number <> 'RV' || lpad(expected.seq::text, 3, '0') || '/06'
          OR (expected.seq NOT IN (21, 22, 48, 82, 83)
              AND rv.source_type <> 'bank_in')
          OR (expected.seq IN (21, 22, 48, 82, 83)
              AND rv.source_type NOT IN ('import', 'manual_journal'))
          OR (expected.seq NOT IN (21, 22, 48, 82, 83) AND bi.id IS NULL)
          OR (expected.seq IN (21, 22, 48, 82, 83) AND bi.id IS NOT NULL)
    ) INTO v_existing_exact;

    IF v_existing_registry = 83
       AND v_existing_bank_registry = 78
       AND v_existing_reservations = 5
       AND v_existing_bank_ins = 78
       AND v_existing_exact THEN
      RAISE NOTICE 'Complete June 2026 RV import already exists - skipping';
      RETURN;
    END IF;
    RAISE EXCEPTION
      'Partial/conflicting June 2026 RV state: registry %, bank registry %, reservations %, bank-ins %',
      v_existing_registry, v_existing_bank_registry,
      v_existing_reservations, v_existing_bank_ins;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Opening-pool receipt: pre-cutover unbanked CH_REV2 cash for 34869/34891.
  -- ---------------------------------------------------------------------------
  SELECT id INTO v_opening_receipt_id FROM receipts
   WHERE origin = 'import_opening' AND description = 'INV/NO : 34869/34891/TEO';
  IF v_opening_receipt_id IS NULL THEN
    INSERT INTO receipts (
      payment_method, debit_account, display_reference, cheque_reference,
      received_date, posting_date, status, origin, total_amount,
      description, description_overridden, notes, created_by, updated_by
    ) VALUES (
      'cash', 'CH_REV2', NULL, NULL,
      DATE '2026-05-31', NULL, 'posted', 'import_opening', 1060.00,
      'INV/NO : 34869/34891/TEO', true,
      'Pre-cutover unbanked cash proven by the legacy PDFs (CH_REV2 opening anchor component; 0.05 residual stays unanalysed)',
      'migration', 'migration'
    ) RETURNING id INTO v_opening_receipt_id;
    INSERT INTO receipt_allocations (receipt_id, line_number, allocation_type, invoice_id, customer_id, amount)
    VALUES (v_opening_receipt_id, 1, 'invoice', '34869', 'TEO', 530.00),
           (v_opening_receipt_id, 2, 'invoice', '34891', 'TEO', 530.00);
  END IF;

  -- ---------------------------------------------------------------------------
  -- Cash-sales RVs (single CH_REV1 group; legacy particulars "SALES DD/MM/YYYY").
  -- ---------------------------------------------------------------------------
  FOR rec IN
    SELECT * FROM (VALUES
      (1,  DATE '2026-06-04', DATE '2026-05-14',   200.00),
      (2,  DATE '2026-06-04', DATE '2026-05-19',   500.00),
      (3,  DATE '2026-06-04', DATE '2026-05-28',  1000.00),
      (4,  DATE '2026-06-04', DATE '2026-05-29',  8000.00),
      (5,  DATE '2026-06-04', DATE '2026-06-04',  1000.00),
      (6,  DATE '2026-06-04', DATE '2026-06-04',  4830.00),
      (7,  DATE '2026-06-04', DATE '2026-06-04',   950.00),
      (8,  DATE '2026-06-04', DATE '2026-06-04',  3000.00),
      (9,  DATE '2026-06-04', DATE '2026-06-04',  3500.00),
      (10, DATE '2026-06-09', DATE '2026-06-06',  1200.00),
      (11, DATE '2026-06-09', DATE '2026-06-08',  1400.00),
      (12, DATE '2026-06-10', DATE '2026-05-19',  4311.00),
      (13, DATE '2026-06-10', DATE '2026-05-20',   395.60),
      (14, DATE '2026-06-10', DATE '2026-05-21',  4980.50),
      (15, DATE '2026-06-10', DATE '2026-05-22',  2722.00),
      (16, DATE '2026-06-10', DATE '2026-05-23',  3983.90),
      (17, DATE '2026-06-10', DATE '2026-05-25',  2148.50),
      (18, DATE '2026-06-10', DATE '2026-05-26',  4014.00),
      (19, DATE '2026-06-10', DATE '2026-05-28',   715.00),
      (20, DATE '2026-06-10', DATE '2026-05-29',   374.00),
      (24, DATE '2026-06-10', DATE '2026-06-04',  3367.60),
      (25, DATE '2026-06-10', DATE '2026-06-04',  1100.00),
      (26, DATE '2026-06-10', DATE '2026-06-05', 11826.70),
      (27, DATE '2026-06-10', DATE '2026-06-06',  5933.85),
      (28, DATE '2026-06-10', DATE '2026-06-10',  7600.00),
      (29, DATE '2026-06-10', DATE '2026-06-09',  2500.00),
      (30, DATE '2026-06-10', DATE '2026-06-10',  4400.00),
      (31, DATE '2026-06-12', DATE '2026-06-11',  4000.00),
      (32, DATE '2026-06-12', DATE '2026-06-12',  4700.00),
      (33, DATE '2026-06-15', DATE '2026-06-11',  1600.00),
      (34, DATE '2026-06-18', DATE '2026-06-10',   900.00),
      (35, DATE '2026-06-18', DATE '2026-06-18',  8600.00),
      (36, DATE '2026-06-19', DATE '2026-06-16',  5900.00),
      (37, DATE '2026-06-19', DATE '2026-06-18',  3500.00),
      (38, DATE '2026-06-19', DATE '2026-06-19',  2400.00),
      (39, DATE '2026-06-20', DATE '2026-06-18',  3000.00),
      (40, DATE '2026-06-20', DATE '2026-06-19',  4450.00),
      (41, DATE '2026-06-20', DATE '2026-06-20',  3550.00),
      (42, DATE '2026-06-22', DATE '2026-06-20',  1400.00),
      (43, DATE '2026-06-23', DATE '2026-06-18',   700.00),
      (44, DATE '2026-06-23', DATE '2026-06-22',  5000.00),
      (45, DATE '2026-06-23', DATE '2026-06-22',  6000.00),
      (46, DATE '2026-06-23', DATE '2026-06-23',  5000.00),
      (47, DATE '2026-06-24', DATE '2026-05-09',  4445.50),
      (54, DATE '2026-06-24', DATE '2026-06-06',  2408.75),
      (55, DATE '2026-06-24', DATE '2026-06-08',  9145.70),
      (56, DATE '2026-06-24', DATE '2026-06-10',   717.60),
      (57, DATE '2026-06-24', DATE '2026-06-16',   780.10),
      (58, DATE '2026-06-24', DATE '2026-06-18',   709.90),
      (59, DATE '2026-06-24', DATE '2026-06-19',   834.20),
      (60, DATE '2026-06-24', DATE '2026-06-20',  2814.10),
      (61, DATE '2026-06-25', DATE '2026-06-24',  5000.00),
      (62, DATE '2026-06-26', DATE '2026-06-22',  1000.00),
      (63, DATE '2026-06-26', DATE '2026-06-25',  2600.00),
      (64, DATE '2026-06-26', DATE '2026-06-26',  5850.00),
      (65, DATE '2026-06-26', DATE '2026-06-26',    50.00),
      (66, DATE '2026-06-28', DATE '2026-06-23',   600.00),
      (67, DATE '2026-06-28', DATE '2026-06-25',  3000.00),
      (68, DATE '2026-06-28', DATE '2026-06-27',  3500.00),
      (69, DATE '2026-06-29', DATE '2026-06-27',   600.00),
      (70, DATE '2026-06-29', DATE '2026-06-29',  7000.00),
      (71, DATE '2026-06-30', DATE '2026-06-11',  4700.80),
      (72, DATE '2026-06-30', DATE '2026-06-12',  2467.60),
      (75, DATE '2026-06-30', DATE '2026-06-22',  1094.20),
      (76, DATE '2026-06-30', DATE '2026-06-23',   258.80),
      (77, DATE '2026-06-30', DATE '2026-06-24',   555.00),
      (78, DATE '2026-06-30', DATE '2026-06-27',   700.00),
      (79, DATE '2026-06-30', DATE '2026-06-29',   700.00),
      (80, DATE '2026-06-30', DATE '2026-06-30',  3000.00),
      (81, DATE '2026-06-30', DATE '2026-06-30',  3600.00)
    ) AS t(seq, pdate, sdate, amt)
    ORDER BY 1
  LOOP
    v_rv_number := 'RV' || lpad(rec.seq::text, 3, '0') || '/06';
    INSERT INTO rv_registry (rv_year, rv_month, rv_seq, rv_number, source_type, status, created_by)
    VALUES (2026, 6, rec.seq, v_rv_number, 'bank_in', 'active', 'migration')
    RETURNING id INTO v_registry_id;

    INSERT INTO journal_entries (
      reference_no, entry_type, entry_date, description, total_debit, total_credit,
      status, display_reference, created_at, created_by
    ) VALUES (
      'BI-' || v_registry_id, 'RV', rec.pdate,
      'SALES ' || to_char(rec.sdate, 'DD/MM/YYYY'),
      rec.amt, rec.amt, 'posted', v_rv_number, NOW(), 'migration'
    ) RETURNING id INTO v_journal_id;

    INSERT INTO bank_ins (rv_registry_id, posting_date, bank_account, total_amount, status, journal_entry_id, notes, created_by, updated_by)
    VALUES (v_registry_id, rec.pdate, 'BANK_PBB', rec.amt, 'posted', v_journal_id, 'Imported from legacy June 2026 PDFs', 'migration', 'migration')
    RETURNING id INTO v_bank_in_id;

    UPDATE journal_entries SET source_type = 'bank_in', source_id = v_bank_in_id::text WHERE id = v_journal_id;

    INSERT INTO bank_in_groups (bank_in_id, group_number, holding_account, amount, description, description_overridden)
    VALUES (v_bank_in_id, 1, 'CH_REV1', rec.amt, 'SALES ' || to_char(rec.sdate, 'DD/MM/YYYY'), true)
    RETURNING id INTO v_group_id;

    INSERT INTO bank_in_allocations (group_id, source_type, source_date, amount)
    VALUES (v_group_id, 'cash_sales_pool', rec.sdate, rec.amt);

    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, display_order, created_at)
    VALUES (v_journal_id, 1, 'BANK_PBB', rec.amt, 0, v_rv_number, 'SALES ' || to_char(rec.sdate, 'DD/MM/YYYY'), 1, NOW()),
           (v_journal_id, 2, 'CH_REV1', 0, rec.amt, v_rv_number, 'SALES ' || to_char(rec.sdate, 'DD/MM/YYYY'), 2, NOW());
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- CH_REV2 RVs (receipt-backed; groups per legacy bank row; exact particulars).
  --   fields: seq, posting_date, group_number, bank-row particulars,
  --           receipt display_reference lookup ('' = opening receipt), amount,
  --           aggregated CH_REV2 credit particulars (only on group 1).
  -- ---------------------------------------------------------------------------
  FOR rec IN
    SELECT * FROM (VALUES
      (23, DATE '2026-06-10', 1, 'INV/NO : 34869/34891/TEO', '', 1060.00,
           'INV/NO : 34869/34891/TEO'),
      (49, DATE '2026-06-24', 1, 'INV/NO : 34923/TEO', 'C34923', 795.00,
           'INV/NO : 34923/TEO'),
      (50, DATE '2026-06-24', 1, 'INV/NO : 63825/CITY', 'C63825', 1710.00,
           'INV/NO : 63825/CITY'),
      (51, DATE '2026-06-24', 1, 'INV/NO : 34945/TEO', 'C34945', 795.00,
           'INV/NO : 34945/TEO'),
      (52, DATE '2026-06-24', 1, 'INV/NO : 34908/TEO', 'C34908', 530.00,
           'INV/NO :34908/TEO & 015333/015337/015346 /ROSE'),
      (52, DATE '2026-06-24', 2, 'INV/NO :015333/015337/015346/ROSE', 'C015333/C015337/C015346', 52.80,
           NULL),
      (53, DATE '2026-06-24', 1, 'INV/NO : 63740/YEEBEE', 'C63740', 1590.00,
           'INV/NO : 63740/YEEBEE'),
      (73, DATE '2026-06-30', 1, 'INV/NO : 34993/TEO', 'C34993', 530.00,
           'INV/NO : 34993/TEO'),
      (74, DATE '2026-06-30', 1, 'INV/NO :63468/KELUARGA', 'C63468', 870.00,
           'INV/NO :63468/KELUARGA & 63771/PUBLIC'),
      (74, DATE '2026-06-30', 2, 'INV/NO :63771/PUBLIC', 'C63771', 212.40,
           NULL)
    ) AS t(seq, pdate, gnum, bank_particulars, receipt_ref, amt, credit_particulars)
    ORDER BY 1, 3
  LOOP
    v_rv_number := 'RV' || lpad(rec.seq::text, 3, '0') || '/06';

    IF rec.gnum = 1 THEN
      -- New RV: registry + header journal + bank_in.
      SELECT COALESCE(SUM(t2.amt), 0) INTO v_total FROM (VALUES
        (23, 1060.00), (49, 795.00), (50, 1710.00), (51, 795.00),
        (52, 582.80), (53, 1590.00), (73, 530.00), (74, 1082.40)
      ) AS t2(seq, amt) WHERE t2.seq = rec.seq;

      INSERT INTO rv_registry (rv_year, rv_month, rv_seq, rv_number, source_type, status, created_by)
      VALUES (2026, 6, rec.seq, v_rv_number, 'bank_in', 'active', 'migration')
      RETURNING id INTO v_registry_id;

      INSERT INTO journal_entries (
        reference_no, entry_type, entry_date, description, total_debit, total_credit,
        status, display_reference, created_at, created_by
      ) VALUES (
        'BI-' || v_registry_id, 'RV', rec.pdate, rec.credit_particulars,
        v_total, v_total, 'posted', v_rv_number, NOW(), 'migration'
      ) RETURNING id INTO v_journal_id;

      INSERT INTO bank_ins (rv_registry_id, posting_date, bank_account, total_amount, status, journal_entry_id, notes, created_by, updated_by)
      VALUES (v_registry_id, rec.pdate, 'BANK_PBB', v_total, 'posted', v_journal_id, 'Imported from legacy June 2026 PDFs', 'migration', 'migration')
      RETURNING id INTO v_bank_in_id;

      UPDATE journal_entries SET source_type = 'bank_in', source_id = v_bank_in_id::text WHERE id = v_journal_id;

      -- Aggregated CH_REV2 credit line (one per RV, legacy text) as the LAST
      -- line; bank debit lines are inserted per group before it via display_order.
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, display_order, created_at)
      VALUES (v_journal_id, 99, 'CH_REV2', 0, v_total, v_rv_number, rec.credit_particulars, 99, NOW());
    ELSE
      -- Continuation group of the same RV.
      SELECT bi.id, bi.journal_entry_id INTO v_bank_in_id, v_journal_id
        FROM bank_ins bi JOIN rv_registry rv ON rv.id = bi.rv_registry_id
       WHERE rv.rv_year = 2026 AND rv.rv_month = 6 AND rv.rv_seq = rec.seq;
    END IF;

    -- Resolve the source receipt.
    IF rec.receipt_ref = '' THEN
      v_receipt_id := v_opening_receipt_id;
    ELSE
      SELECT id INTO v_receipt_id FROM receipts
       WHERE display_reference = rec.receipt_ref AND debit_account = 'CH_REV2' AND status = 'posted';
      IF v_receipt_id IS NULL THEN
        RAISE EXCEPTION 'Receipt with display_reference % not found for %', rec.receipt_ref, v_rv_number;
      END IF;
    END IF;

    INSERT INTO bank_in_groups (bank_in_id, group_number, holding_account, amount, description, description_overridden)
    VALUES (v_bank_in_id, rec.gnum, 'CH_REV2', rec.amt, rec.bank_particulars, true)
    RETURNING id INTO v_group_id;

    INSERT INTO bank_in_allocations (group_id, source_type, receipt_id, amount)
    VALUES (v_group_id, 'cash_receipt', v_receipt_id, rec.amt);

    -- One bank debit line per group (line_number = group number).
    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, display_order, created_at)
    VALUES (v_journal_id, rec.gnum, 'BANK_PBB', rec.amt, 0, v_rv_number, rec.bank_particulars, rec.gnum, NOW());
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- Non-sales RVs: reserve the numbers only. The user keys the manual journals
  -- with confirmed contra accounts (drawing workers / refunds).
  -- ---------------------------------------------------------------------------
  INSERT INTO rv_registry (rv_year, rv_month, rv_seq, rv_number, source_type, status, created_by)
  VALUES (2026, 6, 21, 'RV021/06', 'import', 'active', 'migration'),
         (2026, 6, 22, 'RV022/06', 'import', 'active', 'migration'),
         (2026, 6, 48, 'RV048/06', 'import', 'active', 'migration'),
         (2026, 6, 82, 'RV082/06', 'import', 'active', 'migration'),
         (2026, 6, 83, 'RV083/06', 'import', 'active', 'migration');
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification: June sums (posted). Expect CH_REV1 CR 214,784.90 and CH_REV2
-- CR 8,145.20 (legacy exact); BANK_PBB DR grows by 222,930.10 of RV debits.
-- -----------------------------------------------------------------------------
SELECT jel.account_code,
       COUNT(*) AS lines,
       ROUND(SUM(jel.debit_amount)::numeric, 2) AS dr,
       ROUND(SUM(jel.credit_amount)::numeric, 2) AS cr
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
 WHERE je.status = 'posted'
   AND je.entry_date >= DATE '2026-06-01' AND je.entry_date < DATE '2026-07-01'
   AND jel.account_code IN ('CH_REV1', 'CH_REV2', 'CASH_SALES', 'CR_SALES', 'BANK_PBB')
 GROUP BY jel.account_code
 ORDER BY jel.account_code;

SELECT COUNT(*) AS june_rv_registry, COUNT(*) FILTER (WHERE source_type = 'bank_in') AS bank_ins,
       COUNT(*) FILTER (WHERE source_type = 'import') AS manual_reservations
  FROM rv_registry WHERE rv_year = 2026 AND rv_month = 6;
