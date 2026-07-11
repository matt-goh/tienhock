-- =============================================================================
-- 2026-07-10_phase5_bank_receipts_migration.sql
-- Phase 5 bank-ledger corrections (worklist §5c of the progress doc), all
-- proven row-by-row by docs/Account/fixtures/JUNE2026_BANK_PBB.csv:
--
--   A. Pre-cutover-received cheques/transfers that CLEARED in June: their ERP
--      payments are May-dated with old-model REC journals hiding behind the
--      1 June anchor. Builds receipts posted on the LEGACY CLEAR DATE (one
--      receipt per reference+customer, matching the legacy row granularity),
--      cancels the old journals, links the payments. No balance changes.
--   B. Date-shifted clears: re-dates four existing receipts (and their
--      journals) from the keyed received-date to the legacy clear date, and
--      corrects two reference typos (ALB00106 -> ALB000106, MBB000757 ->
--      MIB000757).
--   C. PBB678670: re-splits the one merged 62,543.40 receipt into the four
--      per-customer legacy rows (PBB678670 / -1 / -2 / -3).
--
-- Idempotent: every step is guarded by current-state checks; reruns no-op.
-- Execution: docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
--              < dev/migrations/2026-07-10_phase5_bank_receipts_migration.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- A. Cheques cleared in June per the legacy bank statement -> receipts posted
--    on the clear date. Matched by the legacy row's INVOICE LIST (references in
--    the ERP were keyed inconsistently). Three source cases:
--      * ACTIVE payments (balances already applied): link only, cancel their
--        old journals — no balance change.
--      * PENDING cheque payments (balances never applied): this IS their
--        clearance — link, activate, and apply invoice balance/credit effects.
--      * NO payments keyed: the bank statement is the source document — create
--        the receipt, compat payment rows, and apply balance/credit effects,
--        allocating each invoice its balance_due (validated against the total).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  pay RECORD;
  inv RECORD;
  v_sum NUMERIC(12,2);
  v_receipt_id INTEGER;
  v_journal_id INTEGER;
  v_alloc_id INTEGER;
  v_pay_id INTEGER;
  v_line INTEGER;
  v_desc TEXT;
  v_received DATE;
  v_found INTEGER;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      (DATE '2026-06-03', 'TF030626',    'TF030626', 'DESSERT',       ARRAY['63810'],          206.40),
      (DATE '2026-06-06', 'PIB439770',   '439770',   'ZENITH',        ARRAY['34530'],         2088.00),
      (DATE '2026-06-06', 'RHB022790',   '022790',   'SD',            ARRAY['63801','63844'], 9604.90),
      (DATE '2026-06-09', 'TF090626-1',  'TF090626', 'NEW FRESHMART', ARRAY['63760','63846'], 2285.00),
      (DATE '2026-06-09', 'TF090626-2',  'TF090626', 'ONESTOP',       ARRAY['63913'],          870.00),
      (DATE '2026-06-09', 'TR090626',    'TR090626', 'KIM(1)',        ARRAY['2004892'],       3431.00),
      (DATE '2026-06-09', 'TT090626',    'TT090626', 'HOCKSENG',      ARRAY['34922'],         1505.00),
      (DATE '2026-06-11', 'ALB001088',   '001088',   'MORE',          ARRAY['63702'],        20668.60),
      (DATE '2026-06-18', 'TT180626-1',  'TT180626', 'SKY',           ARRAY['34985'],         1325.00),
      (DATE '2026-06-22', 'MBB932037-J', '932037-J', 'TETAPJAYA(M)',  ARRAY['63574','63649'],15128.40),
      (DATE '2026-06-22', 'MBB932037-P', '932037-P', 'TETAPJAYA(I)',  ARRAY['34680','34768'], 1983.60),
      (DATE '2026-06-22', 'MBB932037-P', '932037-P', 'TETAPJAYA(N)',  ARRAY['34709'],          769.50),
      (DATE '2026-06-22', 'PBB152961',   '152961',   'SHAJAHAN',      ARRAY['2004879'],       2460.00),
      (DATE '2026-06-23', 'PIB437391',   '437391',   'TSEN',          ARRAY['63592','63685'], 2142.50)
    ) AS t(clear_date, display_ref, cheque_ref, customer, invoice_ids, amount)
  LOOP
    -- Already imported? (a posted receipt with this ref+amount on the clear date)
    IF EXISTS (
      SELECT 1 FROM receipts r
       WHERE r.display_reference = rec.display_ref AND r.posting_date = rec.clear_date
         AND r.total_amount = rec.amount AND r.status = 'posted'
    ) THEN
      CONTINUE;
    END IF;

    v_desc := 'INV/NO: ' || array_to_string(rec.invoice_ids, '/') || ' - ' || rec.customer;

    -- Existing linkable payments for these invoices (active or pending).
    SELECT COALESCE(SUM(p.amount_paid), 0)::numeric(12,2), COUNT(*), MIN(p.payment_date)::date
      INTO v_sum, v_found, v_received
      FROM payments p
     WHERE p.invoice_id = ANY(rec.invoice_ids)
       AND p.receipt_allocation_id IS NULL
       AND p.is_auto_collection = false
       AND (p.status IS NULL OR p.status IN ('active', 'pending'));

    IF v_found > 0 AND ABS(v_sum - rec.amount) > 0.005 THEN
      RAISE WARNING 'Phase5A %/%: ERP payments sum % <> legacy % — skipped (resolve manually)',
        rec.display_ref, rec.customer, v_sum, rec.amount;
      CONTINUE;
    END IF;

    IF v_found = 0 THEN
      -- Nothing keyed: the invoices must still carry the amount as balance due.
      SELECT COALESCE(SUM(i.balance_due), 0)::numeric(12,2) INTO v_sum
        FROM invoices i WHERE i.id = ANY(rec.invoice_ids) AND i.invoice_status <> 'cancelled';
      IF ABS(v_sum - rec.amount) > 0.005 THEN
        RAISE WARNING 'Phase5A %/%: no payments and invoice balances % <> legacy % — skipped (resolve manually)',
          rec.display_ref, rec.customer, v_sum, rec.amount;
        CONTINUE;
      END IF;
      v_received := rec.clear_date;
    END IF;

    INSERT INTO receipts (
      payment_method, debit_account, display_reference, cheque_reference,
      received_date, posting_date, status, origin, total_amount,
      description, description_overridden, notes, created_by, updated_by
    ) VALUES (
      'cheque', 'BANK_PBB', rec.display_ref, rec.cheque_ref,
      COALESCE(v_received, rec.clear_date), NULL, 'pending', 'erp', rec.amount,
      v_desc, false, 'Cheque cleared in June per legacy bank statement (Phase 5 rebuild)', 'migration', 'migration'
    ) RETURNING id INTO v_receipt_id;

    INSERT INTO journal_entries (
      reference_no, entry_type, entry_date, description, total_debit, total_credit,
      status, display_reference, source_type, source_id, created_at, created_by
    ) VALUES (
      'REC-M' || v_receipt_id, 'REC', rec.clear_date, v_desc, rec.amount, rec.amount,
      'posted', rec.display_ref, 'receipt', v_receipt_id::text, NOW(), 'migration'
    ) RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, cheque_reference, display_order, created_at)
    VALUES (v_journal_id, 1, 'BANK_PBB', rec.amount, 0, 'REC-M' || v_receipt_id, v_desc, rec.cheque_ref, 1, NOW());

    v_line := 1;
    IF v_found > 0 THEN
      -- Link existing payments; pending ones are being cleared NOW, so their
      -- balance/credit effects apply here (active ones were applied long ago).
      FOR pay IN
        SELECT p.payment_id, p.invoice_id, p.amount_paid::numeric(12,2) AS amount,
               p.journal_entry_id, p.status, i.customerid, i.paymenttype
          FROM payments p JOIN invoices i ON i.id = p.invoice_id
         WHERE p.invoice_id = ANY(rec.invoice_ids)
           AND p.receipt_allocation_id IS NULL AND p.is_auto_collection = false
           AND (p.status IS NULL OR p.status IN ('active', 'pending'))
         ORDER BY p.payment_id
      LOOP
        INSERT INTO receipt_allocations (receipt_id, line_number, allocation_type, invoice_id, customer_id, amount, legacy_payment_id)
        VALUES (v_receipt_id, v_line, 'invoice', pay.invoice_id, pay.customerid, pay.amount, pay.payment_id)
        RETURNING id INTO v_alloc_id;

        IF pay.status = 'pending' THEN
          UPDATE invoices
             SET balance_due = GREATEST(0, round((balance_due - pay.amount)::numeric, 2)),
                 invoice_status = CASE WHEN balance_due - pay.amount <= 0.005 THEN 'paid' ELSE invoice_status END
           WHERE id = pay.invoice_id;
          IF pay.paymenttype = 'INVOICE' THEN
            UPDATE customers SET credit_used = GREATEST(0, COALESCE(credit_used, 0) - pay.amount)
             WHERE id = pay.customerid;
          END IF;
        END IF;

        UPDATE payments
           SET receipt_allocation_id = v_alloc_id, status = 'active',
               payment_reference = rec.display_ref
         WHERE payment_id = pay.payment_id;
        IF pay.journal_entry_id IS NOT NULL THEN
          UPDATE journal_entries SET status = 'cancelled', updated_at = NOW()
           WHERE id = pay.journal_entry_id AND status = 'posted';
          UPDATE payments SET journal_entry_id = NULL WHERE payment_id = pay.payment_id;
        END IF;

        v_line := v_line + 1;
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, display_order, created_at)
        VALUES (v_journal_id, v_line, 'TR', 0, pay.amount, 'REC-M' || v_receipt_id,
                'INV/NO: ' || pay.invoice_id || ' - ' || pay.customerid, v_line, NOW());
      END LOOP;
    ELSE
      -- No payments were ever keyed: settle each invoice's balance due.
      FOR inv IN
        SELECT i.id, i.customerid, i.paymenttype, i.balance_due::numeric(12,2) AS amount
          FROM invoices i WHERE i.id = ANY(rec.invoice_ids) AND i.balance_due > 0
         ORDER BY i.id
      LOOP
        INSERT INTO receipt_allocations (receipt_id, line_number, allocation_type, invoice_id, customer_id, amount)
        VALUES (v_receipt_id, v_line, 'invoice', inv.id, inv.customerid, inv.amount)
        RETURNING id INTO v_alloc_id;

        INSERT INTO payments (
          invoice_id, payment_date, amount_paid, payment_method, payment_reference,
          bank_account, notes, status, is_auto_collection, receipt_allocation_id
        ) VALUES (
          inv.id, rec.clear_date, inv.amount, 'cheque', rec.display_ref,
          'BANK_PBB', 'Backfilled from legacy June bank statement (Phase 5)', 'active', false, v_alloc_id
        ) RETURNING payment_id INTO v_pay_id;
        UPDATE receipt_allocations SET legacy_payment_id = v_pay_id WHERE id = v_alloc_id;

        UPDATE invoices SET balance_due = 0, invoice_status = 'paid' WHERE id = inv.id;
        IF inv.paymenttype = 'INVOICE' THEN
          UPDATE customers SET credit_used = GREATEST(0, COALESCE(credit_used, 0) - inv.amount)
           WHERE id = inv.customerid;
        END IF;

        v_line := v_line + 1;
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, display_order, created_at)
        VALUES (v_journal_id, v_line, 'TR', 0, inv.amount, 'REC-M' || v_receipt_id,
                'INV/NO: ' || inv.id || ' - ' || inv.customerid, v_line, NOW());
      END LOOP;
    END IF;

    UPDATE receipts SET journal_entry_id = v_journal_id, status = 'posted', posting_date = rec.clear_date
     WHERE id = v_receipt_id;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- B. Date-shifted clears + reference typo fixes on existing receipts.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  r RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('PBB023159', 1392.00, DATE '2026-06-15', 'PBB023159', '023159'),
      ('MBB000750', 2183.50, DATE '2026-06-22', 'MBB000750', '000750'),
      ('ALB00106',  2070.00, DATE '2026-06-24', 'ALB000106', '000106'),
      ('MBB000757', 2735.60, DATE '2026-06-29', 'MIB000757', '000757')
    ) AS t(old_ref, amount, clear_date, new_ref, cheque_ref)
  LOOP
    SELECT * INTO r FROM receipts
     WHERE display_reference = rec.old_ref AND total_amount = rec.amount AND status = 'posted'
     LIMIT 1;
    IF r.id IS NULL THEN
      -- already corrected (rerun) or missing
      CONTINUE;
    END IF;
    UPDATE receipts
       SET posting_date = rec.clear_date, display_reference = rec.new_ref,
           cheque_reference = rec.cheque_ref, updated_at = NOW(), updated_by = 'migration'
     WHERE id = r.id;
    UPDATE journal_entries
       SET entry_date = rec.clear_date, display_reference = rec.new_ref, updated_at = NOW()
     WHERE id = r.journal_entry_id;
    UPDATE journal_entry_lines
       SET cheque_reference = rec.cheque_ref
     WHERE journal_entry_id = r.journal_entry_id AND debit_amount > 0;
    UPDATE payments p
       SET payment_reference = rec.new_ref
      FROM receipt_allocations ra
     WHERE ra.receipt_id = r.id AND p.receipt_allocation_id = ra.id
       AND p.payment_reference = rec.old_ref;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- C. PBB678670: re-split the merged receipt into the four legacy per-customer
--    rows. The merged receipt/journal are cancelled WITHOUT balance reversal
--    (this is a regrouping, not a business cancellation).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  merged RECORD;
  rec RECORD;
  pay RECORD;
  v_receipt_id INTEGER;
  v_journal_id INTEGER;
  v_alloc_id INTEGER;
  v_line INTEGER;
  v_desc TEXT;
  v_sum NUMERIC(12,2);
  v_received DATE;
BEGIN
  SELECT * INTO merged FROM receipts
   WHERE display_reference = 'PBB678670' AND total_amount = 62543.40 AND status = 'posted'
   LIMIT 1;
  IF merged.id IS NULL THEN
    RAISE NOTICE 'PBB678670 merged receipt not found (already re-split) - skipping';
    RETURN;
  END IF;

  -- Free the payments, cancel the merged journal + receipt (no balance effects).
  UPDATE payments p SET receipt_allocation_id = NULL
    FROM receipt_allocations ra
   WHERE ra.receipt_id = merged.id AND p.receipt_allocation_id = ra.id;
  UPDATE journal_entries SET status = 'cancelled', updated_at = NOW()
   WHERE id = merged.journal_entry_id AND status = 'posted';
  UPDATE receipts
     SET status = 'cancelled', cancellation_date = NOW(),
         cancellation_reason = 'Re-split into per-customer receipts PBB678670/-1/-2/-3 (Phase 5)',
         cancelled_by = 'migration', updated_at = NOW(), updated_by = 'migration'
   WHERE id = merged.id;

  FOR rec IN
    SELECT * FROM (VALUES
      ('PBB678670',   'GUI',    27242.00, '678670'),
      ('PBB678670-1', 'GUI(2)', 10999.00, '678670-1'),
      ('PBB678670-2', 'GUI(3)',  8248.00, '678670-2'),
      ('PBB678670-3', 'GUI(5)', 16054.40, '678670-3')
    ) AS t(display_ref, customer, amount, cheque_ref)
  LOOP
    SELECT COALESCE(SUM(p.amount_paid), 0)::numeric(12,2), MIN(p.payment_date)::date
      INTO v_sum, v_received
      FROM payments p JOIN invoices i ON i.id = p.invoice_id
     WHERE p.payment_reference = 'PBB678670' AND i.customerid = rec.customer
       AND p.receipt_allocation_id IS NULL AND p.is_auto_collection = false
       AND (p.status IS NULL OR p.status = 'active');
    IF ABS(v_sum - rec.amount) > 0.005 THEN
      RAISE EXCEPTION 'PBB678670 split %: payments sum % <> legacy %', rec.customer, v_sum, rec.amount;
    END IF;

    SELECT 'INV/NO: ' || string_agg(DISTINCT p.invoice_id, '/' ORDER BY p.invoice_id) || ' - ' || rec.customer
      INTO v_desc
      FROM payments p JOIN invoices i ON i.id = p.invoice_id
     WHERE p.payment_reference = 'PBB678670' AND i.customerid = rec.customer
       AND p.receipt_allocation_id IS NULL AND p.is_auto_collection = false
       AND (p.status IS NULL OR p.status = 'active');

    INSERT INTO receipts (
      payment_method, debit_account, display_reference, cheque_reference,
      received_date, posting_date, status, origin, total_amount,
      description, description_overridden, notes, created_by, updated_by
    ) VALUES (
      'cheque', 'BANK_PBB', rec.display_ref, rec.cheque_ref,
      COALESCE(v_received, DATE '2026-06-29'), NULL, 'pending', 'erp', rec.amount,
      v_desc, false, 'Per-customer split of cheque 678670 (Phase 5)', 'migration', 'migration'
    ) RETURNING id INTO v_receipt_id;

    INSERT INTO journal_entries (
      reference_no, entry_type, entry_date, description, total_debit, total_credit,
      status, display_reference, source_type, source_id, created_at, created_by
    ) VALUES (
      'REC-M' || v_receipt_id, 'REC', DATE '2026-06-29', v_desc, rec.amount, rec.amount,
      'posted', rec.display_ref, 'receipt', v_receipt_id::text, NOW(), 'migration'
    ) RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, cheque_reference, display_order, created_at)
    VALUES (v_journal_id, 1, 'BANK_PBB', rec.amount, 0, 'REC-M' || v_receipt_id, v_desc, rec.cheque_ref, 1, NOW());

    v_line := 1;
    FOR pay IN
      SELECT p.payment_id, p.invoice_id, p.amount_paid::numeric(12,2) AS amount, i.customerid
        FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE p.payment_reference = 'PBB678670' AND i.customerid = rec.customer
         AND p.receipt_allocation_id IS NULL AND p.is_auto_collection = false
         AND (p.status IS NULL OR p.status = 'active')
       ORDER BY p.payment_id
    LOOP
      INSERT INTO receipt_allocations (receipt_id, line_number, allocation_type, invoice_id, customer_id, amount, legacy_payment_id)
      VALUES (v_receipt_id, v_line, 'invoice', pay.invoice_id, pay.customerid, pay.amount, pay.payment_id)
      RETURNING id INTO v_alloc_id;
      UPDATE payments SET receipt_allocation_id = v_alloc_id, payment_reference = rec.display_ref
       WHERE payment_id = pay.payment_id;

      v_line := v_line + 1;
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, display_order, created_at)
      VALUES (v_journal_id, v_line, 'TR', 0, pay.amount, 'REC-M' || v_receipt_id,
              'INV/NO: ' || pay.invoice_id || ' - ' || pay.customerid, v_line, NOW());
    END LOOP;

    UPDATE receipts SET journal_entry_id = v_journal_id, status = 'posted', posting_date = DATE '2026-06-29'
     WHERE id = v_receipt_id;
  END LOOP;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification: June BANK_PBB debits. Remaining gap vs legacy 685,388.69 should
-- be exactly: manual RVs 6,454.00 + TJ050626 594.10 (user entries) MINUS the
-- ERP-only July-clear rows 39,090.10 (CIMBI008054 + MBB932202 family).
-- -----------------------------------------------------------------------------
SELECT ROUND(SUM(jel.debit_amount)::numeric, 2) AS june_bank_dr,
       ROUND((685388.69 - SUM(jel.debit_amount))::numeric, 2) AS gap_vs_legacy
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
 WHERE je.status = 'posted' AND jel.account_code = 'BANK_PBB' AND jel.debit_amount > 0
   AND je.entry_date >= DATE '2026-06-01' AND je.entry_date < DATE '2026-07-01';
