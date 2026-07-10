-- =============================================================================
-- 2026-07-10_receipts_phase2_migration.sql
-- Phase 2 data migration: rebuild June-2026+ receipt/invoice accounting onto
-- the frozen contract (docs/Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §4).
--
-- Scope: on/after the 1 June 2026 cutover ONLY. Pre-cutover journals keep
-- their old shape — the imported opening anchors supersede them.
--
-- What it does (idempotent; run the dry-run before and after):
--   A. Marks June+ cash-method payments on CASH invoices as automatic
--      collections (their money is the invoice-owned CH_REV1 collection).
--   B. Auto rows: cancels their legacy REC journals, unlinks them, aligns
--      their date to the invoice's local date. Auto rows are non-posting.
--   C. Groups June+ genuine payments (shared reference+date+method+account)
--      into `receipts` + `receipt_allocations`, links the payment rows,
--      cancels their old REC journals, and posts ONE new-contract journal per
--      receipt (cash -> DR CH_REV2 per invoice with C{invoice} line refs;
--      bank -> one aggregated DR bank + itemized CR TR; overpaid -> CR
--      CUST_DEP). NO invoice balance or customer credit is touched — those
--      effects were applied when the payments were first recorded.
--   D. Rebuilds June+ invoice-owned S journals: CASH bills become
--      DR CH_REV1 / CR CASH_SALES (4-line TR form when genuine receipts
--      exist); INVOICE journals keep DR TR / CR CR_SALES; descriptions become
--      the contract defaults; zero bills get informational zero journals.
--   E. Cancels every posted journal still attached to a cancelled payment.
--   F. Prints June verification sums for the five core ledgers.
--
-- Execution: docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
--              < dev/migrations/2026-07-10_receipts_phase2_migration.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- A. June+ cash-method payments on CASH invoices = automatic collections.
--    (Scope by the INVOICE's local date — the collection belongs to the bill.)
-- -----------------------------------------------------------------------------
UPDATE payments p
   SET is_auto_collection = true
  FROM invoices i
 WHERE i.id = p.invoice_id
   AND p.is_auto_collection = false
   AND p.receipt_allocation_id IS NULL
   AND p.payment_method = 'cash'
   AND i.paymenttype = 'CASH'
   AND (p.status IS NULL OR p.status = 'active')
   AND (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= DATE '2026-06-01';

-- -----------------------------------------------------------------------------
-- B. Auto-collection rows of June+ CASH invoices: non-posting from now on.
-- -----------------------------------------------------------------------------
-- Cancel their legacy REC journals (the CH_REV1 collection now lives inside
-- the invoice journal rebuilt in step D).
UPDATE journal_entries je
   SET status = 'cancelled', updated_at = NOW()
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
 WHERE p.journal_entry_id = je.id
   AND p.is_auto_collection = true
   AND je.status = 'posted'
   AND (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= DATE '2026-06-01';

UPDATE payments p
   SET journal_entry_id = NULL
  FROM invoices i
 WHERE i.id = p.invoice_id
   AND p.is_auto_collection = true
   AND p.journal_entry_id IS NOT NULL
   AND (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= DATE '2026-06-01';

-- The automatic collection follows the invoice's LOCAL date.
UPDATE payments p
   SET payment_date = (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  FROM invoices i
 WHERE i.id = p.invoice_id
   AND p.is_auto_collection = true
   AND (p.status IS NULL OR p.status = 'active')
   AND (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= DATE '2026-06-01'
   AND p.payment_date::date <> (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date;

-- -----------------------------------------------------------------------------
-- C. Group June+ genuine payments into receipts and repost their journals.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  grp RECORD;
  pay RECORD;
  v_receipt_id INTEGER;
  v_journal_id INTEGER;
  v_debit_account VARCHAR(50);
  v_display_ref VARCHAR(100);
  v_cheque_ref VARCHAR(100);
  v_description TEXT;
  v_total NUMERIC(12, 2);
  v_line INTEGER;
  v_alloc_id INTEGER;
  v_invoice_count INTEGER;
  v_single_invoice VARCHAR(255);
  v_is_pending BOOLEAN;
BEGIN
  FOR grp IN
    SELECT
      COALESCE(NULLIF(TRIM(p.payment_reference), ''), '#' || p.payment_id::text) AS gkey,
      p.payment_date::date AS pdate,
      p.payment_method AS method,
      COALESCE(p.bank_account, '') AS bank,
      (p.status = 'pending') AS is_pending,
      array_agg(p.payment_id ORDER BY p.payment_id) AS payment_ids
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE p.receipt_allocation_id IS NULL
      AND p.is_auto_collection = false
      AND (p.status IS NULL OR p.status IN ('active', 'pending', 'overpaid'))
      AND p.payment_date >= DATE '2026-06-01'
      AND p.amount_paid > 0
      AND i.invoice_status <> 'cancelled'
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 2, 1
  LOOP
    v_is_pending := grp.is_pending;
    v_debit_account := CASE
      WHEN grp.method = 'cash' THEN 'CH_REV2'
      WHEN grp.bank IN ('BANK_PBB', 'BANK_ABB') THEN grp.bank
      ELSE 'BANK_PBB'
    END;

    -- Visible Journal reference and Cheque heuristics (editable later):
    --   T-family (T/TF/TR/TT/TS/TJ + ddmmyy [-n]) -> cheque = base without suffix
    --   External-bank refs (ALB/MBB/MIB/PBB/PIB/RHB + no.) -> cheque = ref minus prefix
    v_display_ref := NULLIF(regexp_replace(grp.gkey, '^#\d+$', ''), '');
    v_cheque_ref := CASE
      WHEN v_display_ref ~ '^(T|TF|TR|TT|TS|TJ)\d{6}(-\d+)?$'
        THEN regexp_replace(v_display_ref, '-\d+$', '')
      WHEN v_display_ref ~ '^(ALB|MBB|MIB|PBB|PIB|RHB)\d'
        THEN regexp_replace(v_display_ref, '^(ALB|MBB|MIB|PBB|PIB|RHB)', '')
      ELSE NULL
    END;

    -- Default description: same-customer group "INV/NO: a/b - CUST",
    -- mixed groups joined with " & ".
    SELECT COALESCE('INV/NO: ' || string_agg(part, ' & '), 'Receipt')
      INTO v_description
      FROM (
        SELECT string_agg(DISTINCT p.invoice_id, '/' ORDER BY p.invoice_id)
               || ' - ' || i.customerid AS part
          FROM payments p
          JOIN invoices i ON i.id = p.invoice_id
         WHERE p.payment_id = ANY (grp.payment_ids)
           AND NOT (COALESCE(p.notes, '') LIKE '%Overpaid amount%')
         GROUP BY i.customerid
      ) s;

    SELECT COALESCE(SUM(p.amount_paid), 0)::numeric(12,2)
      INTO v_total
      FROM payments p WHERE p.payment_id = ANY (grp.payment_ids);

    SELECT COUNT(DISTINCT p.invoice_id), MIN(p.invoice_id)
      INTO v_invoice_count, v_single_invoice
      FROM payments p
     WHERE p.payment_id = ANY (grp.payment_ids)
       AND NOT (COALESCE(p.notes, '') LIKE '%Overpaid amount%');

    IF v_display_ref IS NULL AND grp.method = 'cash' AND v_invoice_count = 1 THEN
      v_display_ref := 'C' || v_single_invoice;
    END IF;

    -- Inserted as 'pending'; flipped to 'posted' together with the journal
    -- below (the posted-needs-journal CHECK is evaluated per statement).
    INSERT INTO receipts (
      payment_method, debit_account, display_reference, cheque_reference,
      received_date, posting_date, status, origin, total_amount,
      description, description_overridden, notes, created_by, updated_by
    ) VALUES (
      grp.method, v_debit_account, v_display_ref, v_cheque_ref,
      grp.pdate, NULL, 'pending', 'erp', v_total,
      v_description, false, 'Migrated from payments (Phase 2)', 'migration', 'migration'
    ) RETURNING id INTO v_receipt_id;

    -- Allocations + payment links + old-journal cancellation.
    v_line := 0;
    FOR pay IN
      SELECT p.payment_id, p.invoice_id, p.amount_paid::numeric(12,2) AS amount,
             p.journal_entry_id,
             (COALESCE(p.notes, '') LIKE '%Overpaid amount%' OR p.status = 'overpaid') AS is_excess,
             i.customerid, i.paymenttype
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
       WHERE p.payment_id = ANY (grp.payment_ids)
       ORDER BY p.payment_id
    LOOP
      v_line := v_line + 1;
      INSERT INTO receipt_allocations (
        receipt_id, line_number, allocation_type, invoice_id, customer_id,
        target_account, external_reference, amount, legacy_payment_id
      ) VALUES (
        v_receipt_id, v_line,
        CASE WHEN pay.is_excess THEN 'excess' ELSE 'invoice' END,
        CASE WHEN pay.is_excess THEN NULL ELSE pay.invoice_id END,
        pay.customerid, NULL, NULL, pay.amount, pay.payment_id
      ) RETURNING id INTO v_alloc_id;

      UPDATE payments SET receipt_allocation_id = v_alloc_id WHERE payment_id = pay.payment_id;

      IF pay.journal_entry_id IS NOT NULL THEN
        UPDATE journal_entries SET status = 'cancelled', updated_at = NOW()
         WHERE id = pay.journal_entry_id AND status = 'posted';
        UPDATE payments SET journal_entry_id = NULL WHERE payment_id = pay.payment_id;
      END IF;
    END LOOP;

    -- Post the replacement journal (posted receipts only; balances untouched).
    IF NOT v_is_pending THEN
      INSERT INTO journal_entries (
        reference_no, entry_type, entry_date, description,
        total_debit, total_credit, status, display_reference,
        source_type, source_id, created_at, created_by
      ) VALUES (
        'REC-M' || v_receipt_id, 'REC', grp.pdate, v_description,
        v_total, v_total, 'posted', v_display_ref,
        'receipt', v_receipt_id::text, NOW(), 'migration'
      ) RETURNING id INTO v_journal_id;

      v_line := 0;
      IF grp.method = 'cash' THEN
        -- One CH_REV2 debit row per allocation, each with its own C{invoice} ref.
        FOR pay IN
          SELECT ra.*, COALESCE(ra.customer_id, '') AS cust
            FROM receipt_allocations ra
           WHERE ra.receipt_id = v_receipt_id ORDER BY ra.line_number
        LOOP
          v_line := v_line + 1;
          INSERT INTO journal_entry_lines (
            journal_entry_id, line_number, account_code, debit_amount, credit_amount,
            reference, particulars, display_reference, cheque_reference, display_order, created_at
          ) VALUES (
            v_journal_id, v_line, 'CH_REV2', pay.amount, 0,
            'REC-M' || v_receipt_id,
            CASE WHEN pay.allocation_type = 'excess'
                 THEN 'Overpayment held for ' || pay.cust
                 ELSE 'INV/NO: ' || pay.invoice_id || ' - ' || pay.cust END,
            CASE WHEN pay.allocation_type = 'invoice' THEN 'C' || pay.invoice_id ELSE NULL END,
            NULL, v_line, NOW()
          );
        END LOOP;
      ELSE
        v_line := v_line + 1;
        INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_code, debit_amount, credit_amount,
          reference, particulars, display_reference, cheque_reference, display_order, created_at
        ) VALUES (
          v_journal_id, v_line, v_debit_account, v_total, 0,
          'REC-M' || v_receipt_id, v_description, NULL, v_cheque_ref, v_line, NOW()
        );
      END IF;

      FOR pay IN
        SELECT ra.*, COALESCE(ra.customer_id, '') AS cust
          FROM receipt_allocations ra
         WHERE ra.receipt_id = v_receipt_id ORDER BY ra.line_number
      LOOP
        v_line := v_line + 1;
        INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_code, debit_amount, credit_amount,
          reference, particulars, display_reference, cheque_reference, display_order, created_at
        ) VALUES (
          v_journal_id, v_line,
          CASE WHEN pay.allocation_type = 'excess' THEN 'CUST_DEP' ELSE 'TR' END,
          0, pay.amount,
          'REC-M' || v_receipt_id,
          CASE WHEN pay.allocation_type = 'excess'
               THEN 'Overpayment held for ' || pay.cust
               ELSE 'INV/NO: ' || pay.invoice_id || ' - ' || pay.cust END,
          CASE WHEN grp.method = 'cash' AND pay.allocation_type = 'invoice'
               THEN 'C' || pay.invoice_id ELSE NULL END,
          NULL, v_line, NOW()
        );
      END LOOP;

      UPDATE receipts
         SET journal_entry_id = v_journal_id, status = 'posted', posting_date = grp.pdate
       WHERE id = v_receipt_id;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- D. Rebuild June+ invoice-owned S journals to the contract shapes/descriptions.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  inv RECORD;
  v_journal_id INTEGER;
  v_total NUMERIC(12, 2);
  v_genuine NUMERIC(12, 2);
  v_pending INTEGER;
  v_auto NUMERIC(12, 2);
  v_desc TEXT;
  v_date DATE;
  v_line INTEGER;
BEGIN
  FOR inv IN
    SELECT i.id, i.paymenttype, i.totalamountpayable::numeric(12,2) AS total,
           i.customerid, i.journal_entry_id, i.balance_due::numeric(12,2) AS balance,
           i.accounting_description,
           (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS local_date
      FROM invoices i
     WHERE COALESCE(i.is_consolidated, false) = false
       AND i.invoice_status <> 'cancelled'
       AND (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= DATE '2026-06-01'
     ORDER BY 1
  LOOP
    v_total := COALESCE(inv.total, 0);
    v_date := inv.local_date;
    v_desc := COALESCE(
      inv.accounting_description,
      CASE WHEN inv.paymenttype = 'CASH'
           THEN 'CASH BILL: ' || inv.id || COALESCE(' - ' || inv.customerid, '')
           ELSE 'INV/NO: ' || inv.id || COALESCE(' - ' || inv.customerid, '') END
    );

    SELECT COALESCE(SUM(p.amount_paid) FILTER (WHERE p.status IS NULL OR p.status = 'active'), 0)::numeric(12,2),
           COUNT(*) FILTER (WHERE p.status = 'pending')
      INTO v_genuine, v_pending
      FROM payments p
     WHERE p.invoice_id = inv.id AND p.is_auto_collection = false
       AND (p.status IS NULL OR p.status IN ('active', 'pending'));

    v_auto := CASE
      WHEN inv.paymenttype <> 'CASH' THEN 0
      WHEN v_pending > 0 AND inv.balance > 0 THEN 0
      ELSE GREATEST(0, v_total - v_genuine)
    END;

    -- Find/adopt the journal (by link, then by reference).
    v_journal_id := inv.journal_entry_id;
    IF v_journal_id IS NULL THEN
      SELECT id INTO v_journal_id FROM journal_entries
       WHERE reference_no = inv.id AND entry_type = 'S' LIMIT 1;
    END IF;

    IF v_journal_id IS NULL THEN
      INSERT INTO journal_entries (
        reference_no, entry_type, entry_date, description, total_debit, total_credit,
        status, display_reference, source_type, source_id, created_at, created_by
      ) VALUES (inv.id, 'S', v_date, v_desc, 0, 0, 'posted', inv.id, 'invoice', inv.id, NOW(), 'migration')
      RETURNING id INTO v_journal_id;
      UPDATE invoices SET journal_entry_id = v_journal_id WHERE id = inv.id;
    END IF;

    UPDATE journal_entries
       SET entry_date = v_date, description = v_desc,
           status = 'posted', display_reference = inv.id,
           source_type = 'invoice', source_id = inv.id, updated_at = NOW()
     WHERE id = v_journal_id;

    DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;

    v_line := 0;
    IF inv.paymenttype <> 'CASH' THEN
      -- DR TR / CR CR_SALES
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, created_at)
      VALUES (v_journal_id, 1, 'TR', v_total, 0, inv.id, v_desc, NOW()),
             (v_journal_id, 2, 'CR_SALES', 0, v_total, inv.id, v_desc, NOW());
      UPDATE journal_entries SET total_debit = v_total, total_credit = v_total WHERE id = v_journal_id;
    ELSIF v_genuine > 0 OR v_pending > 0 THEN
      -- 4-line form: DR TR total / CR CASH_SALES total (+ auto collection pair)
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, created_at)
      VALUES (v_journal_id, 1, 'TR', v_total, 0, inv.id, v_desc, NOW()),
             (v_journal_id, 2, 'CASH_SALES', 0, v_total, inv.id, v_desc, NOW());
      IF v_auto > 0 THEN
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, created_at)
        VALUES (v_journal_id, 3, 'CH_REV1', v_auto, 0, inv.id, v_desc, NOW()),
               (v_journal_id, 4, 'TR', 0, v_auto, inv.id, v_desc, NOW());
      END IF;
      UPDATE journal_entries SET total_debit = v_total + v_auto, total_credit = v_total + v_auto WHERE id = v_journal_id;
    ELSE
      -- Core pair (includes zero bills as informational rows)
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, created_at)
      VALUES (v_journal_id, 1, 'CH_REV1', v_total, 0, inv.id, v_desc, NOW()),
             (v_journal_id, 2, 'CASH_SALES', 0, v_total, inv.id, v_desc, NOW());
      UPDATE journal_entries SET total_debit = v_total, total_credit = v_total WHERE id = v_journal_id;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- E. A cancelled payment may not retain a posted journal (all dates).
-- -----------------------------------------------------------------------------
UPDATE journal_entries je
   SET status = 'cancelled', updated_at = NOW()
  FROM payments p
 WHERE p.journal_entry_id = je.id
   AND p.status = 'cancelled'
   AND je.status = 'posted';

COMMIT;

-- -----------------------------------------------------------------------------
-- F. Verification: June sums for the five core ledgers (posted lines only).
--    Compare to docs/Account/fixtures/ (see progress doc §7 for the named
--    approved differences: 015375 +34.00 CH_REV1; 015361 +2,880.00 CH_REV2).
-- -----------------------------------------------------------------------------
SELECT jel.account_code,
       COUNT(*) AS lines,
       ROUND(SUM(jel.debit_amount)::numeric, 2) AS dr,
       ROUND(SUM(jel.credit_amount)::numeric, 2) AS cr
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
 WHERE je.status = 'posted'
   AND je.entry_date >= DATE '2026-06-01' AND je.entry_date < DATE '2026-07-01'
   AND jel.account_code IN ('CH_REV1', 'CH_REV2', 'CASH_SALES', 'CR_SALES', 'BANK_PBB', 'TR', 'CUST_DEP')
 GROUP BY jel.account_code
 ORDER BY jel.account_code;
