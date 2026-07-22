-- =============================================================================
-- GL-settled invoice reconciliation ("bucket 3" debtors-report gap)
--
-- Six operational invoices still carry an outstanding balance even though the
-- authoritative debtor ledger proves each one was settled in full: the GL
-- contains both the S-sale debit AND the matching settlement credit (from the
-- hash-pinned Jan-May 2026 legacy import), but the operational payment was
-- never keyed (5 cases) or was keyed as a pending cheque that was never
-- confirmed (LAI 34367). For every customer the GL-vs-operations reconciliation
-- difference equals EXACTLY that invoice's residual balance:
--
--   invoice   customer     residual  GL sale (DR)        GL settlement (CR)
--   2004676   CHANKOPI     1080.00   14/03/2026 1080.00  16/03/2026 TR160326  1080.00
--   15309     AMY           135.00   11/04/2026  135.00  13/04/2026 C015309    135.00
--   026127    LEE YX         57.00   16/01/2026   57.00  26/01/2026 C026127     57.00
--   34704     SHAB          870.00   09/04/2026  870.00  09/04/2026 TT090426   870.00
--   63599     HIAPLEE-SC    561.00   10/04/2026  561.00  15/04/2026 PBB112550  561.00
--   34367     LAI          1642.00   20/01/2026 2709.20  27/04/2026 MIB000628 1642.00
--            (34367 total 2709.20; the 09/04/2026 MIB000627 1067.20 receipt is
--             already keyed as active payment 4649, leaving exactly 1642.00)
--
-- Posting new receipt journals would DUPLICATE credits the ledger already
-- holds, so this guarded correction only aligns the operational subledger:
--   1. inserts five NON-POSTING `contra` payment-history projections (the
--      MYSHOP-SKT mechanism: payment already present in the debtor ledger,
--      never a cash receipt, protected from cash cancellation); and
--   2. converts LAI's never-confirmed pending cheque payment 5469
--      (MIB000628, RM1,642.00) in place into the same contra class. The row
--      keeps its genuine cheque reference but is NOT linked to the posted IMP
--      journal 6945, so a future cancellation can never attack the immutable
--      legacy import journal (which also settles invoice 34520).
-- It then clears the six invoice balances and recomputes credit_used.
--
-- Explicitly preserved: SHAB's cancelled cash payment 4213 (the TT090426 bank
-- transfer is the true settlement), LAI's cancelled payments 2969/1782-link,
-- HIAPLEE-SC invoices 62588 and 64082 (genuinely open), and every GL row.
-- No journal is created, modified or cancelled by this script.
--
-- LAI carries a harmless PRE-EXISTING reconciliation residual of RM0.35
-- (GL 6399.86 vs operational 6399.51 after this correction) that predates the
-- legacy import and is out of scope here.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtextextended('gl_settled_invoices_contra_2026_07_22', 0)
);

-- Contra is a subledger application of credit already present in accounting;
-- it is intentionally not one of the receipt methods accepted by the API.
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_payment_method_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'cheque', 'bank_transfer', 'online', 'contra'));

DO $$
DECLARE
  v_contra_count INTEGER;
  v_credit_used NUMERIC(12,2);
  v_open_invoice_total NUMERIC(12,2);
  v_gl_balance NUMERIC(12,2);
  v_diff NUMERIC(12,2);
  v_rec RECORD;
BEGIN
  PERFORM id
    FROM customers
   WHERE id = ANY(ARRAY['CHANKOPI', 'AMY', 'LEE YX', 'SHAB', 'HIAPLEE-SC', 'LAI']::varchar[])
     ORDER BY id
     FOR UPDATE;
  IF (SELECT COUNT(*) FROM customers
       WHERE id IN ('CHANKOPI', 'AMY', 'LEE YX', 'SHAB', 'HIAPLEE-SC', 'LAI')) <> 6 THEN
    RAISE EXCEPTION 'Expected the six approved customers';
  END IF;

  PERFORM id
    FROM invoices
   WHERE id = ANY(ARRAY['2004676', '15309', '026127', '34704', '63599', '34367']::varchar[])
     ORDER BY id
     FOR UPDATE;
  IF (SELECT COUNT(*) FROM invoices
       WHERE id IN ('2004676', '15309', '026127', '34704', '63599', '34367')) <> 6 THEN
    RAISE EXCEPTION 'Expected the six approved invoices';
  END IF;

  PERFORM payment_id
    FROM payments
   WHERE invoice_id IN ('2004676', '15309', '026127', '34704', '63599', '34367')
     ORDER BY payment_id
     FOR UPDATE;

  SELECT COUNT(*)
    INTO v_contra_count
    FROM payments
   WHERE internal_reference IN (
     'CONTRA-CHANKOPI-2004676',
     'CONTRA-AMY-15309',
     'CONTRA-LEE YX-026127',
     'CONTRA-SHAB-34704',
     'CONTRA-HIAPLEE-SC-63599',
     'CONTRA-LAI-34367'
   );

  -- Idempotent success path after the correction has already run.
  IF v_contra_count = 6 THEN
    IF EXISTS (
      SELECT 1
        FROM payments
       WHERE internal_reference IN (
         'CONTRA-CHANKOPI-2004676',
         'CONTRA-AMY-15309',
         'CONTRA-LEE YX-026127',
         'CONTRA-SHAB-34704',
         'CONTRA-HIAPLEE-SC-63599',
         'CONTRA-LAI-34367'
       )
         AND (payment_method <> 'contra'
              OR status <> 'active'
              OR journal_entry_id IS NOT NULL
              OR receipt_allocation_id IS NOT NULL)
    ) OR NOT EXISTS (
      SELECT 1
        FROM payments
       WHERE payment_id = 5469
         AND internal_reference = 'CONTRA-LAI-34367'
         AND invoice_id = '34367'
         AND payment_reference = 'MIB000628'
    ) OR EXISTS (
      SELECT 1
        FROM invoices
       WHERE id IN ('2004676', '15309', '026127', '34704', '63599', '34367')
         AND (balance_due <> 0 OR LOWER(invoice_status) <> 'paid')
    ) THEN
      RAISE EXCEPTION 'Existing GL-settled contra correction has drifted';
    END IF;

    FOR v_rec IN
      SELECT * FROM (VALUES
        ('CHANKOPI'::varchar), ('AMY'), ('LEE YX'), ('SHAB'), ('HIAPLEE-SC'), ('LAI')
      ) AS t(customer_id)
    LOOP
      SELECT credit_used::numeric(12,2)
        INTO v_credit_used
        FROM customers
       WHERE id = v_rec.customer_id;
      SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2)
        INTO v_open_invoice_total
        FROM invoices
       WHERE customerid = v_rec.customer_id
         AND paymenttype = 'INVOICE'
         AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
      IF ABS(v_credit_used - v_open_invoice_total) > 0.005 THEN
        RAISE EXCEPTION
          '% credit_used % differs from invoice balance % after prior correction',
          v_rec.customer_id, v_credit_used, v_open_invoice_total;
      END IF;
    END LOOP;
    RETURN;
  ELSIF v_contra_count <> 0 THEN
    RAISE EXCEPTION 'Partial GL-settled contra correction found (% rows)', v_contra_count;
  END IF;

  -- Guard the six operational invoice residues being repaired.
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '2004676' AND customerid = 'CHANKOPI' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 1080.00 AND balance_due = 1080.00 AND invoice_status = 'Overdue'
  ) OR NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '15309' AND customerid = 'AMY' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 135.00 AND balance_due = 135.00 AND invoice_status = 'Overdue'
  ) OR NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '026127' AND customerid = 'LEE YX' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 57.00 AND balance_due = 57.00 AND invoice_status = 'Overdue'
  ) OR NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '34704' AND customerid = 'SHAB' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 870.00 AND balance_due = 870.00 AND invoice_status = 'Overdue'
  ) OR NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '63599' AND customerid = 'HIAPLEE-SC' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 561.00 AND balance_due = 561.00 AND invoice_status = 'Overdue'
  ) OR NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '34367' AND customerid = 'LAI' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 2709.20 AND balance_due = 1642.00 AND invoice_status = 'Overdue'
  ) THEN
    RAISE EXCEPTION 'Invoice balances/statuses no longer match the approved cases';
  END IF;

  -- Guard the GL proof: every sale debit AND its exact settlement credit must
  -- be present in posted journals (legacy IMP import lines).
  IF NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'CHANKOPI'
       AND jel.debit_amount = 1080.00 AND je.entry_date = DATE '2026-03-14'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'CHANKOPI'
       AND jel.credit_amount = 1080.00 AND je.entry_date = DATE '2026-03-16'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'AMY'
       AND jel.debit_amount = 135.00 AND je.entry_date = DATE '2026-04-11'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'AMY'
       AND jel.credit_amount = 135.00 AND je.entry_date = DATE '2026-04-13'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'LEE YX'
       AND jel.debit_amount = 57.00 AND je.entry_date = DATE '2026-01-16'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'LEE YX'
       AND jel.credit_amount = 57.00 AND je.entry_date = DATE '2026-01-26'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'SHAB'
       AND jel.debit_amount = 870.00 AND je.entry_date = DATE '2026-04-09'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'SHAB'
       AND jel.credit_amount = 870.00 AND je.entry_date = DATE '2026-04-09'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'HIAPLEE-SC'
       AND jel.debit_amount = 561.00 AND je.entry_date = DATE '2026-04-10'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'HIAPLEE-SC'
       AND jel.credit_amount = 561.00 AND je.entry_date = DATE '2026-04-15'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'LAI'
       AND jel.debit_amount = 2709.20 AND je.entry_date = DATE '2026-01-20'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.status = 'posted' AND jel.account_code = 'LAI'
       AND jel.credit_amount = 1067.20 AND je.entry_date = DATE '2026-04-09'
  ) OR NOT EXISTS (
    SELECT 1 FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
     WHERE je.id = 6945 AND je.entry_type = 'IMP' AND je.status = 'posted'
       AND je.entry_date = DATE '2026-04-27'
       AND jel.account_code = 'LAI' AND jel.credit_amount = 1642.00
  ) THEN
    RAISE EXCEPTION 'GL sale/settlement evidence no longer matches the approved cases';
  END IF;

  -- Guard the operational payment evidence.
  -- LAI: the keyed 1067.20 receipt stays active; the never-confirmed pending
  -- cheque for the 1642.00 settlement is the row converted below.
  IF NOT EXISTS (
    SELECT 1 FROM payments
     WHERE payment_id = 4649 AND invoice_id = '34367'
       AND payment_date::date = DATE '2026-04-09' AND amount_paid = 1067.20
       AND payment_method = 'cheque' AND payment_reference = 'MBB000627'
       AND status = 'active'
  ) OR NOT EXISTS (
    SELECT 1 FROM payments
     WHERE payment_id = 5469 AND invoice_id = '34367'
       AND payment_date::date = DATE '2026-04-25' AND amount_paid = 1642.00
       AND payment_method = 'cheque' AND payment_reference = 'MIB000628'
       AND status = 'pending'
       AND journal_entry_id IS NULL AND receipt_allocation_id IS NULL
  ) OR NOT EXISTS (
    -- SHAB: the cancelled cash row proves the money never moved through cash;
    -- it is preserved untouched.
    SELECT 1 FROM payments
     WHERE payment_id = 4213 AND invoice_id = '34704'
       AND amount_paid = 870.00 AND payment_method = 'cash'
       AND status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Operational payment evidence no longer matches the approved cases';
  END IF;

  -- Guard the per-customer reconciliation difference: for the five clean
  -- cases it must equal EXACTLY the invoice residue (GL behind operations by
  -- precisely the un-keyed settlement). LAI additionally carries a documented
  -- pre-existing residual (currently RM0.35), so it is guarded with slack.
  FOR v_rec IN
    SELECT * FROM (VALUES
      ('CHANKOPI'::varchar, 1080.00::numeric, 0.005::numeric),
      ('AMY', 135.00, 0.005),
      ('LEE YX', 57.00, 0.005),
      ('SHAB', 870.00, 0.005),
      ('HIAPLEE-SC', 561.00, 0.005),
      ('LAI', 1642.00, 0.50)
    ) AS t(customer_id, residue, tolerance)
  LOOP
    SELECT anchor.amount + COALESCE((
             SELECT SUM(jel.debit_amount - jel.credit_amount)
               FROM journal_entry_lines jel
               JOIN journal_entries je ON je.id = jel.journal_entry_id
              WHERE je.status = 'posted'
                AND jel.account_code = anchor.account_code
                AND je.entry_date >= anchor.as_of_date
           ), 0)
      INTO v_gl_balance
      FROM (
        SELECT account_code, as_of_date, amount
          FROM account_opening_balances
         WHERE account_code = v_rec.customer_id
           AND as_of_date <= CURRENT_DATE
         ORDER BY as_of_date DESC
         LIMIT 1
      ) anchor;
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2)
      INTO v_open_invoice_total
      FROM invoices
     WHERE customerid = v_rec.customer_id
       AND paymenttype = 'INVOICE'
       AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    v_diff := v_gl_balance - v_open_invoice_total;
    IF ABS(v_diff + v_rec.residue) > v_rec.tolerance THEN
      RAISE EXCEPTION
        '% reconciliation difference is %, expected % (+- %)',
        v_rec.customer_id, v_diff, -v_rec.residue, v_rec.tolerance;
    END IF;

    SELECT credit_used::numeric(12,2)
      INTO v_credit_used
      FROM customers
     WHERE id = v_rec.customer_id;
    IF ABS(v_credit_used - v_open_invoice_total) > 0.005 THEN
      RAISE EXCEPTION
        '% credit_used % differs from invoice balance % before correction',
        v_rec.customer_id, v_credit_used, v_open_invoice_total;
    END IF;
  END LOOP;

  INSERT INTO payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, internal_reference, bank_account, journal_entry_id,
    notes, status, is_auto_collection, receipt_allocation_id
  ) VALUES
  (
    '2004676', DATE '2026-03-16', 1080.00, 'contra',
    'TR160326', 'CONTRA-CHANKOPI-2004676', NULL, NULL,
    'Settlement already present in the debtor ledger (16/03/2026, TR160326) but never keyed operationally. Non-posting contra: no journal is created.',
    'active', false, NULL
  ),
  (
    '15309', DATE '2026-04-13', 135.00, 'contra',
    'C015309', 'CONTRA-AMY-15309', NULL, NULL,
    'Settlement already present in the debtor ledger (13/04/2026, C015309) but never keyed operationally. Non-posting contra: no journal is created.',
    'active', false, NULL
  ),
  (
    '026127', DATE '2026-01-26', 57.00, 'contra',
    'C026127', 'CONTRA-LEE YX-026127', NULL, NULL,
    'Settlement already present in the debtor ledger (26/01/2026, C026127) but never keyed operationally. Non-posting contra: no journal is created.',
    'active', false, NULL
  ),
  (
    '34704', DATE '2026-04-09', 870.00, 'contra',
    'TT090426', 'CONTRA-SHAB-34704', NULL, NULL,
    'Settlement already present in the debtor ledger (09/04/2026, TT090426 bank transfer) but never keyed operationally; the keyed cash payment 4213 was correctly cancelled. Non-posting contra: no journal is created.',
    'active', false, NULL
  ),
  (
    '63599', DATE '2026-04-15', 561.00, 'contra',
    'PBB112550', 'CONTRA-HIAPLEE-SC-63599', NULL, NULL,
    'Settlement already present in the debtor ledger (15/04/2026, PBB112550) but never keyed operationally. Non-posting contra: no journal is created.',
    'active', false, NULL
  );

  -- LAI: convert the never-confirmed pending cheque into the same non-posting
  -- contra class. The GL settlement was posted by the legacy import journal
  -- 6945 (MIB000628, 27/04/2026), so confirming the cheque through the app
  -- would duplicate the credit. The row keeps its genuine cheque reference and
  -- is deliberately left without a journal link.
  UPDATE payments
     SET payment_method = 'contra',
         payment_date = DATE '2026-04-27',
         internal_reference = 'CONTRA-LAI-34367',
         notes = 'Pending cheque MIB000628 was never confirmed; the settlement is already present in the debtor ledger (27/04/2026, import journal 6945). Converted in place to a non-posting contra: no journal is created or linked.',
         status = 'active'
   WHERE payment_id = 5469
     AND invoice_id = '34367'
     AND amount_paid = 1642.00
     AND payment_method = 'cheque'
     AND payment_reference = 'MIB000628'
     AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LAI pending payment 5469 no longer matches the approved case';
  END IF;

  UPDATE invoices
     SET balance_due = 0,
         invoice_status = 'paid'
   WHERE id IN ('2004676', '15309', '026127', '34704', '63599', '34367');

  UPDATE customers c
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = c.id
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE c.id IN ('CHANKOPI', 'AMY', 'LEE YX', 'SHAB', 'HIAPLEE-SC', 'LAI');

  -- Post-correction settlement totals must equal each invoice total exactly.
  FOR v_rec IN
    SELECT * FROM (VALUES
      ('2004676'::varchar, 1080.00::numeric),
      ('15309', 135.00),
      ('026127', 57.00),
      ('34704', 870.00),
      ('63599', 561.00),
      ('34367', 2709.20)
    ) AS t(invoice_id, expected_total)
  LOOP
    IF (
      SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2)
        FROM payments
       WHERE invoice_id = v_rec.invoice_id
         AND (status IS NULL OR status = 'active')
    ) <> v_rec.expected_total THEN
      RAISE EXCEPTION
        'Invoice % settlement total is %, expected %',
        v_rec.invoice_id,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM payments
          WHERE invoice_id = v_rec.invoice_id AND (status IS NULL OR status = 'active')),
        v_rec.expected_total;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM invoices
     WHERE id IN ('2004676', '15309', '026127', '34704', '63599', '34367')
       AND (balance_due <> 0 OR LOWER(invoice_status) <> 'paid')
  ) OR EXISTS (
    SELECT 1
      FROM payments
     WHERE internal_reference IN (
       'CONTRA-CHANKOPI-2004676',
       'CONTRA-AMY-15309',
       'CONTRA-LEE YX-026127',
       'CONTRA-SHAB-34704',
       'CONTRA-HIAPLEE-SC-63599',
       'CONTRA-LAI-34367'
     )
       AND (payment_method <> 'contra'
            OR status <> 'active'
            OR journal_entry_id IS NOT NULL
            OR receipt_allocation_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Post-correction invoice/payment state is invalid';
  END IF;

  FOR v_rec IN
    SELECT * FROM (VALUES
      ('CHANKOPI'::varchar), ('AMY'), ('LEE YX'), ('SHAB'), ('HIAPLEE-SC'), ('LAI')
    ) AS t(customer_id)
  LOOP
    SELECT credit_used::numeric(12,2)
      INTO v_credit_used
      FROM customers
     WHERE id = v_rec.customer_id;
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2)
      INTO v_open_invoice_total
      FROM invoices
     WHERE customerid = v_rec.customer_id
       AND paymenttype = 'INVOICE'
       AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    IF ABS(v_credit_used - v_open_invoice_total) > 0.005 THEN
      RAISE EXCEPTION
        '% credit_used % differs from invoice balance % after correction',
        v_rec.customer_id, v_credit_used, v_open_invoice_total;
    END IF;
  END LOOP;
END $$;

COMMIT;

SELECT i.id, i.customerid, i.balance_due, i.invoice_status
  FROM invoices i
 WHERE i.id IN ('2004676', '15309', '026127', '34704', '63599', '34367')
 ORDER BY i.id;

SELECT payment_id, invoice_id, payment_date::date, amount_paid,
       payment_method, payment_reference, internal_reference, status
  FROM payments
 WHERE internal_reference IN (
   'CONTRA-CHANKOPI-2004676',
   'CONTRA-AMY-15309',
   'CONTRA-LEE YX-026127',
   'CONTRA-SHAB-34704',
   'CONTRA-HIAPLEE-SC-63599',
   'CONTRA-LAI-34367'
 )
 ORDER BY invoice_id;

SELECT id, credit_used
  FROM customers
 WHERE id IN ('CHANKOPI', 'AMY', 'LEE YX', 'SHAB', 'HIAPLEE-SC', 'LAI')
 ORDER BY id;
