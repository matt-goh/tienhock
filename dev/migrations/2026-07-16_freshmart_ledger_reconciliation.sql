-- =============================================================================
-- 2026-07-16_freshmart_ledger_reconciliation.sql
-- Evidence-backed data correction for the duplicate customer codes FRESHMART
-- and NEW FRESHMART (both named NEW DONGGONGON FRESH MART'S).
--
-- Evidence supplied 2026-07-16:
--   * FRESHMART customer-ledger PDF
--     SHA256 DE48118D1B0202D52F8D75DDDD392A456D7181E77DEF7816BE73F118E59614EB
--   * NEW FRESHMART customer-ledger PDF
--     SHA256 E321737F9D3F5CA51E0456700B862E5F4F296F34125DC6CD916A8736C92FA5FE
--
-- Root cause:
--   Invoice 63760 (09/05/2026, RM1,415) was keyed to FRESHMART although the
--   legacy debtor ledger proves it belongs to NEW FRESHMART. Receipt 167 / old
--   journal 3869 then copied the wrong customer to its allocation and credited
--   FRESHMART on 09/06/2026. The imported sale line itself is already correct.
--
-- This migration:
--   1. moves invoice 63760 and its RM1,415 receipt allocation to NEW FRESHMART;
--   2. moves only that receipt credit line to the NEW FRESHMART debtor account;
--   3. restores the exact PDF particulars and Cheque-column values;
--   4. persists INV/NO64011 as invoice 64011's accounting description so a
--      later invoice resync cannot restore the generated description; and
--   5. verifies every FRESHMART and NEW FRESHMART ledger row through 30/06/2026.
--
-- It deliberately does NOT change amounts, opening anchors, payments,
-- receipt/journal totals, tax/product data, or customers.credit_used. The
-- combined Trade Debtors balance is unchanged; RM1,415 is only reclassified
-- between two debtor children.
--
-- Idempotent and fail-closed: only the exact inspected pre-state or the exact
-- final state is accepted. Any drift raises and rolls back the transaction.
-- =============================================================================

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- -----------------------------------------------------------------------------
-- Preflight: pin every source and accounting row before changing anything.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_receipt_id       INTEGER;
  v_receipt_journal  INTEGER;
  v_sales_journal    INTEGER;
  v_repair_reason    CONSTANT TEXT :=
    'Customer-ledger PDF supplied 2026-07-16 proves Cheque column without journal suffix';
BEGIN
  IF (SELECT COUNT(*) FROM customers
       WHERE id IN ('FRESHMART', 'NEW FRESHMART')) <> 2 THEN
    RAISE EXCEPTION 'Freshmart repair requires both exact customer codes';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM invoices i
     WHERE i.id = '63760'
       AND i.customerid IN ('FRESHMART', 'NEW FRESHMART')
       AND (to_timestamp(i.createddate::bigint / 1000.0)
            AT TIME ZONE 'Asia/Kuala_Lumpur')::date = DATE '2026-05-09'
       AND i.paymenttype = 'INVOICE'
       AND i.totalamountpayable = 1415.00
       AND i.balance_due = 0
       AND lower(i.invoice_status) = 'paid'
       AND COALESCE(i.is_consolidated, false) = false
  ) THEN
    RAISE EXCEPTION 'Invoice 63760 no longer matches the approved RM1,415 repair case';
  END IF;

  SELECT r.id, r.journal_entry_id
    INTO STRICT v_receipt_id, v_receipt_journal
    FROM receipts r
   WHERE r.display_reference = 'TF090626-1'
     AND r.cheque_reference = 'TF090626'
     AND r.posting_date = DATE '2026-06-09'
     AND r.status = 'posted'
     AND r.total_amount = 2285.00;

  IF NOT EXISTS (
    SELECT 1
      FROM journal_entries je
     WHERE je.id = v_receipt_journal
       AND je.entry_type = 'REC'
       AND je.entry_date = DATE '2026-06-09'
       AND je.status = 'posted'
       AND je.display_reference = 'TF090626-1'
       AND je.source_type = 'receipt'
       AND je.source_id = v_receipt_id::text
       AND je.total_debit = 2285.00
       AND je.total_credit = 2285.00
  ) THEN
    RAISE EXCEPTION 'TF090626-1 receipt journal no longer matches receipt %', v_receipt_id;
  END IF;

  IF (SELECT COUNT(*) FROM receipt_allocations
       WHERE receipt_id = v_receipt_id) <> 2
     OR (SELECT COUNT(*)
           FROM receipt_allocations ra
          WHERE ra.receipt_id = v_receipt_id
            AND ra.allocation_type = 'invoice'
            AND ra.invoice_id = '63760'
            AND ra.customer_id IN ('FRESHMART', 'NEW FRESHMART')
            AND ra.amount = 1415.00) <> 1
     OR (SELECT COUNT(*)
           FROM receipt_allocations ra
          WHERE ra.receipt_id = v_receipt_id
            AND ra.allocation_type = 'invoice'
            AND ra.invoice_id = '63846'
            AND ra.customer_id = 'NEW FRESHMART'
            AND ra.amount = 870.00) <> 1 THEN
    RAISE EXCEPTION 'TF090626-1 allocation set no longer matches invoices 63760/63846';
  END IF;

  IF (SELECT COUNT(*) FROM journal_entry_lines
       WHERE journal_entry_id = v_receipt_journal) <> 3
     OR NOT EXISTS (
       SELECT 1 FROM journal_entry_lines
        WHERE journal_entry_id = v_receipt_journal
          AND account_code = 'BANK_PBB'
          AND debit_amount = 2285.00 AND credit_amount = 0
     )
     OR NOT EXISTS (
       SELECT 1 FROM journal_entry_lines
        WHERE journal_entry_id = v_receipt_journal
          AND account_code IN ('FRESHMART', 'NEW FRESHMART')
          AND debit_amount = 0 AND credit_amount = 1415.00
          AND particulars IN (
            'INV/NO: 63760 - FRESHMART',
            'INV/NO : 63760/NEW FRESHMART'
          )
          AND (cheque_reference IS NULL OR cheque_reference = 'TF090626')
     )
     OR NOT EXISTS (
       SELECT 1 FROM journal_entry_lines
        WHERE journal_entry_id = v_receipt_journal
          AND account_code = 'NEW FRESHMART'
          AND debit_amount = 0 AND credit_amount = 870.00
          AND particulars IN (
            'INV/NO: 63846 - NEW FRESHMART',
            'INV/NO : 63846/NEW FRESHMART'
          )
          AND (cheque_reference IS NULL OR cheque_reference = 'TF090626')
     ) THEN
    RAISE EXCEPTION 'TF090626-1 journal lines no longer match the inspected three-line receipt';
  END IF;

  -- The paper ledger distinguishes the visible Journal suffix from the
  -- unsuffixed Cheque value. Pin both imported two-line journal groups.
  IF (SELECT COUNT(*) FROM journal_entries
       WHERE source_type = 'legacy_import'
         AND source_id = '2026-01-20|TF200126-1'
         AND entry_type = 'IMP'
         AND entry_date = DATE '2026-01-20'
         AND status = 'posted'
         AND display_reference = 'TF200126-1'
         AND total_debit = 485.00 AND total_credit = 485.00) <> 1
     OR (SELECT COUNT(*) FROM journal_entries
       WHERE source_type = 'legacy_import'
         AND source_id = '2026-04-04|TF040426-1'
         AND entry_type = 'IMP'
         AND entry_date = DATE '2026-04-04'
         AND status = 'posted'
         AND display_reference = 'TF040426-1'
         AND total_debit = 365.00 AND total_credit = 365.00) <> 1
     OR (SELECT COUNT(*)
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.source_type = 'legacy_import'
            AND je.source_id = '2026-01-20|TF200126-1') <> 2
     OR (SELECT COUNT(*)
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.source_type = 'legacy_import'
            AND je.source_id = '2026-04-04|TF040426-1') <> 2
     OR (SELECT COUNT(*)
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.source_type = 'legacy_import'
            AND je.source_id = '2026-01-20|TF200126-1'
            AND (
              (jel.account_code = 'BANK_PBB'
               AND jel.debit_amount = 485.00 AND jel.credit_amount = 0)
              OR
              (jel.account_code = 'FRESHMART'
               AND jel.debit_amount = 0 AND jel.credit_amount = 485.00)
            )
            AND jel.particulars = 'INV/NO : 63115/FRESHMART'
            AND jel.display_reference = 'TF200126-1'
            AND jel.cheque_reference IN ('TF200126-1', 'TF200126')) <> 2
     OR (SELECT COUNT(*)
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.source_type = 'legacy_import'
            AND je.source_id = '2026-04-04|TF040426-1'
            AND (
              (jel.account_code = 'BANK_PBB'
               AND jel.debit_amount = 365.00 AND jel.credit_amount = 0)
              OR
              (jel.account_code = 'FRESHMART'
               AND jel.debit_amount = 0 AND jel.credit_amount = 365.00)
            )
            AND jel.particulars = 'INV/NO : 63535/FRESHMART'
            AND jel.display_reference = 'TF040426-1'
            AND jel.cheque_reference IN ('TF040426-1', 'TF040426')) <> 2 THEN
    RAISE EXCEPTION 'Freshmart imported payment journal groups have drifted';
  END IF;

  IF (SELECT COUNT(*) FROM import_legacy_rows
       WHERE journal_group_key = '2026-01-20|TF200126-1') <> 2
     OR (SELECT COUNT(*) FROM import_legacy_rows
       WHERE journal_group_key = '2026-04-04|TF040426-1') <> 2
     OR (SELECT COUNT(*)
           FROM import_legacy_rows ilr
          WHERE ilr.journal_group_key = '2026-01-20|TF200126-1'
            AND (
              (ilr.account_code = 'BANK_PBB'
               AND ilr.debit_cents = 48500 AND ilr.credit_cents = 0)
              OR
              (ilr.account_code = 'FRESHMART'
               AND ilr.debit_cents = 0 AND ilr.credit_cents = 48500)
            )
            AND ilr.particulars = 'INV/NO : 63115/FRESHMART'
            AND ilr.journal_ref = 'TF200126-1'
            AND ilr.line_display_reference = 'TF200126-1'
            AND ilr.cheque_reference IN ('TF200126-1', 'TF200126')
            AND (ilr.repaired = false OR
              (ilr.repaired = true AND ilr.repair_reason = v_repair_reason))) <> 2
     OR (SELECT COUNT(*)
           FROM import_legacy_rows ilr
          WHERE ilr.journal_group_key = '2026-04-04|TF040426-1'
            AND (
              (ilr.account_code = 'BANK_PBB'
               AND ilr.debit_cents = 36500 AND ilr.credit_cents = 0)
              OR
              (ilr.account_code = 'FRESHMART'
               AND ilr.debit_cents = 0 AND ilr.credit_cents = 36500)
            )
            AND ilr.particulars = 'INV/NO : 63535/FRESHMART'
            AND ilr.journal_ref = 'TF040426-1'
            AND ilr.line_display_reference = 'TF040426-1'
            AND ilr.cheque_reference IN ('TF040426-1', 'TF040426')
            AND (ilr.repaired = false OR
              (ilr.repaired = true AND ilr.repair_reason = v_repair_reason))) <> 2 THEN
    RAISE EXCEPTION 'Freshmart staged legacy payment rows have drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM invoices i
     WHERE i.id = '64011'
       AND i.customerid = 'FRESHMART'
       AND (to_timestamp(i.createddate::bigint / 1000.0)
            AT TIME ZONE 'Asia/Kuala_Lumpur')::date = DATE '2026-06-27'
       AND i.paymenttype = 'INVOICE'
       AND i.totalamountpayable = 485.00
       AND i.balance_due = 485.00
       AND COALESCE(i.is_consolidated, false) = false
       AND (i.accounting_description IS NULL
            OR i.accounting_description = 'INV/NO64011')
  ) THEN
    RAISE EXCEPTION 'Invoice 64011 no longer matches the Freshmart PDF row';
  END IF;

  SELECT je.id INTO STRICT v_sales_journal
    FROM journal_entries je
   WHERE je.source_type = 'invoice'
     AND je.source_id = '64011'
     AND je.entry_type = 'S'
     AND je.entry_date = DATE '2026-06-27'
     AND je.status = 'posted'
     AND je.total_debit = 485.00
     AND je.total_credit = 485.00
     AND COALESCE(je.manual_override, false) = false
     AND je.description IN (
       'INV/NO: 64011 - FRESHMART',
       'INV/NO64011'
     );

  IF (SELECT COUNT(*) FROM journal_entry_lines
       WHERE journal_entry_id = v_sales_journal) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM journal_entry_lines
        WHERE journal_entry_id = v_sales_journal
          AND account_code = 'FRESHMART'
          AND debit_amount = 485.00 AND credit_amount = 0
          AND particulars IN ('INV/NO: 64011 - FRESHMART', 'INV/NO64011')
     )
     OR NOT EXISTS (
       SELECT 1 FROM journal_entry_lines
        WHERE journal_entry_id = v_sales_journal
          AND account_code = 'CR_SALES'
          AND debit_amount = 0 AND credit_amount = 485.00
          AND particulars IN ('INV/NO: 64011 - FRESHMART', 'INV/NO64011')
     ) THEN
    RAISE EXCEPTION 'Invoice 64011 sales journal no longer matches the inspected shape';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Source correction: the legal/operational invoice and its receipt allocation.
-- -----------------------------------------------------------------------------
UPDATE invoices
   SET customerid = 'NEW FRESHMART'
 WHERE id = '63760'
   AND customerid = 'FRESHMART';

UPDATE receipt_allocations ra
   SET customer_id = 'NEW FRESHMART'
  FROM receipts r
 WHERE ra.receipt_id = r.id
   AND r.display_reference = 'TF090626-1'
   AND r.cheque_reference = 'TF090626'
   AND r.posting_date = DATE '2026-06-09'
   AND r.status = 'posted'
   AND ra.invoice_id = '63760'
   AND ra.amount = 1415.00
   AND ra.customer_id = 'FRESHMART';

-- Exact NEW FRESHMART PDF rows for the two receipt allocations. The Journal
-- remains TF090626-1; the Cheque column is deliberately TF090626 on both rows.
UPDATE journal_entry_lines jel
   SET account_code = 'NEW FRESHMART',
       particulars = 'INV/NO : 63760/NEW FRESHMART',
       cheque_reference = 'TF090626'
  FROM receipts r
 WHERE jel.journal_entry_id = r.journal_entry_id
   AND r.display_reference = 'TF090626-1'
   AND r.cheque_reference = 'TF090626'
   AND r.posting_date = DATE '2026-06-09'
   AND r.status = 'posted'
   AND jel.debit_amount = 0
   AND jel.credit_amount = 1415.00
   AND jel.account_code IN ('FRESHMART', 'NEW FRESHMART')
   AND (jel.account_code, jel.particulars, jel.cheque_reference)
       IS DISTINCT FROM (
         'NEW FRESHMART'::varchar,
         'INV/NO : 63760/NEW FRESHMART'::text,
         'TF090626'::varchar
       );

UPDATE journal_entry_lines jel
   SET particulars = 'INV/NO : 63846/NEW FRESHMART',
       cheque_reference = 'TF090626'
  FROM receipts r
 WHERE jel.journal_entry_id = r.journal_entry_id
   AND r.display_reference = 'TF090626-1'
   AND r.cheque_reference = 'TF090626'
   AND r.posting_date = DATE '2026-06-09'
   AND r.status = 'posted'
   AND jel.account_code = 'NEW FRESHMART'
   AND jel.debit_amount = 0
   AND jel.credit_amount = 870.00
   AND (jel.particulars, jel.cheque_reference)
       IS DISTINCT FROM (
         'INV/NO : 63846/NEW FRESHMART'::text,
         'TF090626'::varchar
       );

-- Exact FRESHMART PDF Cheque values on the imported receipt journals. Change
-- the paired bank line too so one balanced journal carries one cheque value.
UPDATE journal_entry_lines jel
   SET cheque_reference = CASE je.source_id
     WHEN '2026-01-20|TF200126-1' THEN 'TF200126'
     WHEN '2026-04-04|TF040426-1' THEN 'TF040426'
   END
  FROM journal_entries je
 WHERE je.id = jel.journal_entry_id
   AND je.source_type = 'legacy_import'
   AND je.entry_type = 'IMP'
   AND je.status = 'posted'
   AND je.source_id IN (
     '2026-01-20|TF200126-1',
     '2026-04-04|TF040426-1'
   )
   AND (
     (je.source_id = '2026-01-20|TF200126-1'
      AND jel.particulars = 'INV/NO : 63115/FRESHMART'
      AND ((jel.account_code = 'BANK_PBB'
            AND jel.debit_amount = 485.00 AND jel.credit_amount = 0)
        OR (jel.account_code = 'FRESHMART'
            AND jel.debit_amount = 0 AND jel.credit_amount = 485.00)))
     OR
     (je.source_id = '2026-04-04|TF040426-1'
      AND jel.particulars = 'INV/NO : 63535/FRESHMART'
      AND ((jel.account_code = 'BANK_PBB'
            AND jel.debit_amount = 365.00 AND jel.credit_amount = 0)
        OR (jel.account_code = 'FRESHMART'
            AND jel.debit_amount = 0 AND jel.credit_amount = 365.00)))
   )
   AND jel.cheque_reference IS DISTINCT FROM CASE je.source_id
     WHEN '2026-01-20|TF200126-1' THEN 'TF200126'
     WHEN '2026-04-04|TF040426-1' THEN 'TF040426'
   END;

UPDATE import_legacy_rows ilr
   SET cheque_reference = CASE ilr.journal_group_key
         WHEN '2026-01-20|TF200126-1' THEN 'TF200126'
         WHEN '2026-04-04|TF040426-1' THEN 'TF040426'
       END,
       repaired = true,
       repair_reason =
         'Customer-ledger PDF supplied 2026-07-16 proves Cheque column without journal suffix'
 WHERE ilr.journal_group_key IN (
     '2026-01-20|TF200126-1',
     '2026-04-04|TF040426-1'
   )
   AND (
     (ilr.journal_group_key = '2026-01-20|TF200126-1'
      AND ilr.particulars = 'INV/NO : 63115/FRESHMART'
      AND ((ilr.account_code = 'BANK_PBB'
            AND ilr.debit_cents = 48500 AND ilr.credit_cents = 0)
        OR (ilr.account_code = 'FRESHMART'
            AND ilr.debit_cents = 0 AND ilr.credit_cents = 48500)))
     OR
     (ilr.journal_group_key = '2026-04-04|TF040426-1'
      AND ilr.particulars = 'INV/NO : 63535/FRESHMART'
      AND ((ilr.account_code = 'BANK_PBB'
            AND ilr.debit_cents = 36500 AND ilr.credit_cents = 0)
        OR (ilr.account_code = 'FRESHMART'
            AND ilr.debit_cents = 0 AND ilr.credit_cents = 36500)))
   )
   AND (
     ilr.cheque_reference IS DISTINCT FROM CASE ilr.journal_group_key
       WHEN '2026-01-20|TF200126-1' THEN 'TF200126'
       WHEN '2026-04-04|TF040426-1' THEN 'TF040426'
     END
     OR ilr.repaired IS DISTINCT FROM true
     OR ilr.repair_reason IS DISTINCT FROM
       'Customer-ledger PDF supplied 2026-07-16 proves Cheque column without journal suffix'
   );

-- Persist the scan's exact invoice wording at the source, then keep the posted
-- S journal in sync. A later syncSalesJournalEntry call will retain this text.
UPDATE invoices
   SET accounting_description = 'INV/NO64011'
 WHERE id = '64011'
   AND accounting_description IS DISTINCT FROM 'INV/NO64011';

UPDATE journal_entries
   SET description = 'INV/NO64011',
       updated_at = NOW(),
       updated_by = 'data-fix'
 WHERE source_type = 'invoice'
   AND source_id = '64011'
   AND entry_type = 'S'
   AND status = 'posted'
   AND description IS DISTINCT FROM 'INV/NO64011';

UPDATE journal_entry_lines jel
   SET particulars = 'INV/NO64011'
  FROM journal_entries je
 WHERE je.id = jel.journal_entry_id
   AND je.source_type = 'invoice'
   AND je.source_id = '64011'
   AND je.entry_type = 'S'
   AND je.status = 'posted'
   AND jel.particulars IS DISTINCT FROM 'INV/NO64011';

-- -----------------------------------------------------------------------------
-- Postflight: exact row-by-row parity with both PDFs and requested balances.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_fresh_balance  NUMERIC(12,2);
  v_new_balance    NUMERIC(12,2);
  v_fresh_june_balance NUMERIC(12,2);
  v_new_june_balance   NUMERIC(12,2);
  v_diff_count     INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '63760' AND customerid = 'NEW FRESHMART'
  ) OR (SELECT COUNT(*)
          FROM receipt_allocations ra
          JOIN receipts r ON r.id = ra.receipt_id
         WHERE r.display_reference = 'TF090626-1'
           AND r.posting_date = DATE '2026-06-09'
           AND ra.invoice_id = '63760'
           AND ra.customer_id = 'NEW FRESHMART'
           AND ra.amount = 1415.00) <> 1
     OR (SELECT COUNT(*)
          FROM receipt_allocations ra
          JOIN receipts r ON r.id = ra.receipt_id
         WHERE r.display_reference = 'TF090626-1'
           AND r.posting_date = DATE '2026-06-09'
           AND ra.invoice_id = '63846'
           AND ra.customer_id = 'NEW FRESHMART'
           AND ra.amount = 870.00) <> 1 THEN
    RAISE EXCEPTION 'Invoice 63760 source chain was not fully reassigned';
  END IF;

  -- FRESHMART: five transactions after the 0.00 opening row.
  WITH expected (
    ordinal, entry_date, visible_ref, particulars, cheque_reference,
    debit_amount, credit_amount
  ) AS (
    VALUES
      (1, DATE '2026-01-10', '63115'::text, 'INV/NO63115'::text,
       NULL::text, 485.00::numeric, 0.00::numeric),
      (2, DATE '2026-01-20', 'TF200126-1', 'INV/NO : 63115/FRESHMART',
       'TF200126', 0.00, 485.00),
      (3, DATE '2026-03-28', '63535', 'INV/NO63535',
       NULL, 365.00, 0.00),
      (4, DATE '2026-04-04', 'TF040426-1', 'INV/NO : 63535/FRESHMART',
       'TF040426', 0.00, 365.00),
      (5, DATE '2026-06-27', '64011', 'INV/NO64011',
       NULL, 485.00, 0.00)
  ),
  actual AS (
    SELECT ROW_NUMBER() OVER (
             ORDER BY je.entry_date,
                      je.posting_sequence ASC NULLS LAST,
                      COALESCE(jel.display_reference, je.display_reference, je.reference_no),
                      je.id,
                      jel.display_order ASC NULLS LAST,
                      jel.line_number
           )::integer AS ordinal,
           je.entry_date,
           COALESCE(jel.display_reference, je.display_reference, je.reference_no)::text
             AS visible_ref,
           jel.particulars::text,
           COALESCE(jel.cheque_reference, je.cheque_no)::text AS cheque_reference,
           jel.debit_amount::numeric AS debit_amount,
           jel.credit_amount::numeric AS credit_amount
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted'
       AND jel.account_code = 'FRESHMART'
       AND je.entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-06-30'
  ),
  differences AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  )
  SELECT COUNT(*) INTO v_diff_count FROM differences;

  IF v_diff_count <> 0 THEN
    RAISE EXCEPTION 'FRESHMART ledger still differs from the supplied PDF (% row differences)',
      v_diff_count;
  END IF;

  -- NEW FRESHMART: nine transactions after the 870.00 opening row.
  WITH expected (
    ordinal, entry_date, visible_ref, particulars, cheque_reference,
    debit_amount, credit_amount
  ) AS (
    VALUES
      (1, DATE '2026-01-05', 'TF050126'::text,
       'INV/NO : 63021/NEW FRESHMART'::text, 'TF050126'::text,
       0.00::numeric, 870.00::numeric),
      (2, DATE '2026-01-26', '63201', 'INV/NO63201', NULL, 990.00, 0.00),
      (3, DATE '2026-02-23', 'TF230226',
       'INV/NO : 63201/NEW FRESHMART', 'TF230226', 0.00, 990.00),
      (4, DATE '2026-02-28', '63388', 'INV/NO63388', NULL, 1295.00, 0.00),
      (5, DATE '2026-04-04', 'TF040426',
       'INV/NO : 63388/NEW FRESHMART', 'TF040426', 0.00, 1295.00),
      (6, DATE '2026-05-09', '63760', 'INV/NO : 63760', NULL, 1415.00, 0.00),
      (7, DATE '2026-05-23', '63846', 'INV/NO63846', NULL, 870.00, 0.00),
      (8, DATE '2026-06-09', 'TF090626-1',
       'INV/NO : 63760/NEW FRESHMART', 'TF090626', 0.00, 1415.00),
      (9, DATE '2026-06-09', 'TF090626-1',
       'INV/NO : 63846/NEW FRESHMART', 'TF090626', 0.00, 870.00)
  ),
  actual AS (
    SELECT ROW_NUMBER() OVER (
             ORDER BY je.entry_date,
                      je.posting_sequence ASC NULLS LAST,
                      COALESCE(jel.display_reference, je.display_reference, je.reference_no),
                      je.id,
                      jel.display_order ASC NULLS LAST,
                      jel.line_number
           )::integer AS ordinal,
           je.entry_date,
           COALESCE(jel.display_reference, je.display_reference, je.reference_no)::text
             AS visible_ref,
           jel.particulars::text,
           COALESCE(jel.cheque_reference, je.cheque_no)::text AS cheque_reference,
           jel.debit_amount::numeric AS debit_amount,
           jel.credit_amount::numeric AS credit_amount
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted'
       AND jel.account_code = 'NEW FRESHMART'
       AND je.entry_date BETWEEN DATE '2026-01-01' AND DATE '2026-06-30'
  ),
  differences AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  )
  SELECT COUNT(*) INTO v_diff_count FROM differences;

  IF v_diff_count <> 0 THEN
    RAISE EXCEPTION 'NEW FRESHMART ledger still differs from the supplied PDF (% row differences)',
      v_diff_count;
  END IF;

  SELECT aob.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_code = aob.account_code
              AND je.status = 'posted'
              AND je.entry_date >= aob.as_of_date
              AND je.entry_date <= DATE '2026-06-30'
         ), 0)
    INTO v_fresh_balance
    FROM account_opening_balances aob
   WHERE aob.account_code = 'FRESHMART'
     AND aob.as_of_date = DATE '2026-01-01';

  SELECT aob.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_code = aob.account_code
              AND je.status = 'posted'
              AND je.entry_date >= aob.as_of_date
              AND je.entry_date <= DATE '2026-06-30'
         ), 0)
    INTO v_new_balance
    FROM account_opening_balances aob
   WHERE aob.account_code = 'NEW FRESHMART'
     AND aob.as_of_date = DATE '2026-01-01';

  IF v_fresh_balance IS DISTINCT FROM 485.00 THEN
    RAISE EXCEPTION 'FRESHMART closing balance is %, expected 485.00', v_fresh_balance;
  END IF;
  IF v_new_balance IS DISTINCT FROM 0.00 THEN
    RAISE EXCEPTION 'NEW FRESHMART closing balance is %, expected 0.00', v_new_balance;
  END IF;

  IF (SELECT COUNT(*)
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.source_type = 'legacy_import'
         AND je.source_id IN (
           '2026-01-20|TF200126-1',
           '2026-04-04|TF040426-1'
         )
         AND jel.cheque_reference = CASE je.source_id
           WHEN '2026-01-20|TF200126-1' THEN 'TF200126'
           WHEN '2026-04-04|TF040426-1' THEN 'TF040426'
         END) <> 4
     OR (SELECT COUNT(*)
        FROM import_legacy_rows ilr
       WHERE ilr.journal_group_key IN (
           '2026-01-20|TF200126-1',
           '2026-04-04|TF040426-1'
         )
         AND ilr.cheque_reference = CASE ilr.journal_group_key
           WHEN '2026-01-20|TF200126-1' THEN 'TF200126'
           WHEN '2026-04-04|TF040426-1' THEN 'TF040426'
         END
         AND ilr.repaired = true
         AND ilr.repair_reason =
           'Customer-ledger PDF supplied 2026-07-16 proves Cheque column without journal suffix') <> 4 THEN
    RAISE EXCEPTION 'Freshmart cheque-reference provenance did not reach its exact final state';
  END IF;

  -- The customer-statement route uses the latest 1 June anchor, so verify the
  -- same closing balances through that production calculation path as well.
  SELECT aob.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_code = aob.account_code
              AND je.status = 'posted'
              AND je.entry_date >= aob.as_of_date
              AND je.entry_date <= DATE '2026-06-30'
         ), 0)
    INTO v_fresh_june_balance
    FROM account_opening_balances aob
   WHERE aob.account_code = 'FRESHMART'
     AND aob.as_of_date = DATE '2026-06-01';

  SELECT aob.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_code = aob.account_code
              AND je.status = 'posted'
              AND je.entry_date >= aob.as_of_date
              AND je.entry_date <= DATE '2026-06-30'
         ), 0)
    INTO v_new_june_balance
    FROM account_opening_balances aob
   WHERE aob.account_code = 'NEW FRESHMART'
     AND aob.as_of_date = DATE '2026-06-01';

  IF v_fresh_june_balance IS DISTINCT FROM 485.00
     OR v_new_june_balance IS DISTINCT FROM 0.00 THEN
    RAISE EXCEPTION 'June-anchor balances are %/%, expected 485.00/0.00',
      v_fresh_june_balance, v_new_june_balance;
  END IF;

  IF (SELECT credit_used FROM customers WHERE id = 'FRESHMART')
       IS DISTINCT FROM 485.00
     OR (SELECT credit_used FROM customers WHERE id = 'NEW FRESHMART')
       IS DISTINCT FROM 0.00 THEN
    RAISE EXCEPTION 'Freshmart customer credit-used values no longer match 485.00/0.00';
  END IF;

  IF (SELECT COALESCE(SUM(balance_due), 0) FROM invoices
       WHERE customerid = 'FRESHMART' AND invoice_status <> 'cancelled')
       IS DISTINCT FROM 485.00
     OR (SELECT COALESCE(SUM(balance_due), 0) FROM invoices
       WHERE customerid = 'NEW FRESHMART' AND invoice_status <> 'cancelled')
       IS DISTINCT FROM 0.00 THEN
    RAISE EXCEPTION 'Freshmart open invoice balances no longer match 485.00/0.00';
  END IF;

  RAISE NOTICE 'Freshmart reconciliation passed: FRESHMART %, NEW FRESHMART %',
    v_fresh_balance, v_new_balance;
END $$;

COMMIT;
