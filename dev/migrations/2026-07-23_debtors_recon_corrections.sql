-- =============================================================================
-- Debtors GL <-> Operations reconciliation — staff-answered corrections
-- (follow-up to docs/Account/DEBTORS_RECON_HANDOVER.md, Buckets 1 & 2)
--
-- This file accumulates the per-case fixes as staff confirm each disputed
-- invoice. Every CASE is an independently guarded, idempotent, fail-closed
-- DO block: re-running the file re-applies each case as a no-op once it has
-- already run, and aborts (rolls back the whole transaction) if any pre- or
-- post-condition no longer matches the approved facts.
--
-- Snapshot note: guard values are pinned to the dev DB as of 2026-07-23. Before
-- running on prod, re-run the §2 recon query in the handover doc and re-pin any
-- value that has drifted (live data entry continues on prod).
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtextextended('debtors_recon_corrections_2026_07_23', 0)
);

-- -----------------------------------------------------------------------------
-- CASE 1 — invoice 2004628 (AFRID MINI MARKET - PAPAR), RM870.00, 25/02/2026
--
-- Staff confirmed the 25/02/2026 sale is actually a CASH sale (paid on the
-- spot), but it was keyed as a credit INVOICE and left outstanding. The Tien
-- Hock accounting period before 2026-06-01 is locked, so the app's
-- INVOICE->CASH button cannot change it.
--
-- Treatment (approved 2026-07-23): OPERATIONAL-ONLY conversion to CASH — flip
-- the payment type, zero the balance, mark it paid, add the automatic cash
-- collection row, and recompute credit_used. NO sales journal is posted.
--
-- Why no journal: there are ZERO invoice-owned 'S' journals before 2026-06-01
-- (the native sales-journal system starts at the cutover); the entire pre-
-- cutover period is represented by the hash-pinned legacy import plus the
-- 2026-06-01 checkpoint anchors, and every one of AFRID's 14 other cash bills
-- carries no sales journal. AFRID's debtor GL balance is already 0.00 (its
-- 2026-06-01 anchor), so the reconciliation gap is entirely operational:
-- flipping the invoice to CASH removes RM870 from the open-invoice total and
-- closes the By-Customer vs By-Salesman gap to 0.00, leaving 2004628
-- indistinguishable from a normally-created pre-cutover cash bill and never
-- touching the locked, pinned Jan-May ledger.
--
-- (2004628 is a child of the LHDN consolidated e-invoice CON-202602-AUTO;
-- cash bills are consolidated too, so that membership is unaffected.)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_paymenttype   VARCHAR;
  v_balance_due   NUMERIC(12,2);
  v_status        VARCHAR;
  v_journal_id    INTEGER;
  v_auto_count    INTEGER;
  v_credit_used   NUMERIC(12,2);
  v_ops_open      NUMERIC(12,2);
  v_gl_balance    NUMERIC(12,2);
BEGIN
  -- Lock the rows this case touches.
  PERFORM id FROM invoices  WHERE id = '2004628' FOR UPDATE;
  PERFORM id FROM customers WHERE id = 'AFRID'   FOR UPDATE;
  PERFORM payment_id FROM payments WHERE invoice_id = '2004628' ORDER BY payment_id FOR UPDATE;

  IF NOT EXISTS (SELECT 1 FROM invoices WHERE id = '2004628') THEN
    RAISE EXCEPTION 'CASE 1: invoice 2004628 not found';
  END IF;

  SELECT paymenttype, balance_due::numeric(12,2), invoice_status, journal_entry_id
    INTO v_paymenttype, v_balance_due, v_status, v_journal_id
    FROM invoices WHERE id = '2004628';

  SELECT COUNT(*) INTO v_auto_count
    FROM payments
   WHERE invoice_id = '2004628'
     AND is_auto_collection = true
     AND (status IS NULL OR status = 'active');

  -- ----- Idempotent success path: already converted -----
  IF v_paymenttype = 'CASH' THEN
    -- Verify the applied state is fully consistent, else abort.
    IF v_balance_due <> 0
       OR LOWER(v_status) <> 'paid'
       OR v_journal_id IS NOT NULL
       OR v_auto_count <> 1 THEN
      RAISE EXCEPTION 'CASE 1: invoice 2004628 is CASH but the applied state has drifted '
        '(balance %, status %, journal %, auto rows %)',
        v_balance_due, v_status, v_journal_id, v_auto_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM payments
       WHERE invoice_id = '2004628' AND is_auto_collection = true
         AND (status IS NULL OR status = 'active')
         AND payment_method = 'cash' AND amount_paid = 870.00
         AND journal_entry_id IS NULL
    ) THEN
      RAISE EXCEPTION 'CASE 1: invoice 2004628 auto-collection row does not match';
    END IF;

    SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'AFRID';
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
      FROM invoices
     WHERE customerid = 'AFRID' AND paymenttype = 'INVOICE'
       AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
      RAISE EXCEPTION 'CASE 1: AFRID credit_used % differs from open-invoice total % after prior run',
        v_credit_used, v_ops_open;
    END IF;
    RETURN;  -- nothing to do
  END IF;

  -- ----- Pre-condition guards: the exact approved before-state -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '2004628' AND customerid = 'AFRID' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 870.00 AND balance_due = 870.00
       AND tax_amount = 0.00 AND invoice_status = 'Overdue'
       AND journal_entry_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CASE 1: invoice 2004628 no longer matches the approved before-state';
  END IF;

  IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = '2004628') THEN
    RAISE EXCEPTION 'CASE 1: invoice 2004628 unexpectedly already has payment rows';
  END IF;

  IF EXISTS (
    SELECT 1 FROM journal_entries
     WHERE reference_no = '2004628'
        OR (source_type = 'invoice' AND source_id = '2004628')
  ) THEN
    RAISE EXCEPTION 'CASE 1: a journal already references invoice 2004628';
  END IF;

  -- Accounts the auto-collection row references must exist and be active.
  IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'AFRID' AND ledger_type = 'TD' AND is_active)
     OR NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'CASH' AND is_active) THEN
    RAISE EXCEPTION 'CASE 1: required accounts (AFRID / CASH) missing or inactive';
  END IF;

  -- AFRID GL debtor balance must already be 0.00 (latest anchor + posted
  -- lines from that anchor); the whole gap is the un-flipped operational
  -- invoice. credit_used must equal the current open-invoice total (870).
  SELECT anchor.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted' AND jel.account_code = 'AFRID'
              AND je.entry_date >= anchor.as_of_date), 0)
    INTO v_gl_balance
    FROM (
      SELECT as_of_date, amount FROM account_opening_balances
       WHERE account_code = 'AFRID' AND as_of_date <= CURRENT_DATE
       ORDER BY as_of_date DESC LIMIT 1
    ) anchor;
  IF v_gl_balance IS NULL OR ABS(v_gl_balance) > 0.005 THEN
    RAISE EXCEPTION 'CASE 1: AFRID GL balance is %, expected 0.00 (fix would not close the gap)', v_gl_balance;
  END IF;

  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'AFRID';
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices
   WHERE customerid = 'AFRID' AND paymenttype = 'INVOICE'
     AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  IF ABS(v_credit_used - 870.00) > 0.005 OR ABS(v_ops_open - 870.00) > 0.005 THEN
    RAISE EXCEPTION 'CASE 1: AFRID pre-state credit_used %/open-invoice total % expected 870.00',
      v_credit_used, v_ops_open;
  END IF;

  -- ----- Mutation: operational INVOICE -> CASH (no journal) -----
  UPDATE invoices
     SET paymenttype = 'CASH', balance_due = 0, invoice_status = 'paid'
   WHERE id = '2004628';

  -- Automatic cash collection row (non-posting; journal_entry_id NULL), dated
  -- to the invoice's local date — identical shape to a normal cash bill's row.
  INSERT INTO payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, bank_account, notes, status, is_auto_collection
  ) VALUES (
    '2004628', DATE '2026-02-25', 870.00, 'cash',
    NULL, 'CASH', 'Automatic payment for CASH invoice', 'active', true
  );

  UPDATE customers c
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = c.id
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE c.id = 'AFRID';

  -- ----- Post-condition verification -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '2004628' AND paymenttype = 'CASH' AND balance_due = 0
       AND LOWER(invoice_status) = 'paid' AND journal_entry_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CASE 1: post-state invoice 2004628 is invalid';
  END IF;

  SELECT COUNT(*) INTO v_auto_count
    FROM payments
   WHERE invoice_id = '2004628' AND is_auto_collection = true
     AND (status IS NULL OR status = 'active')
     AND payment_method = 'cash' AND amount_paid = 870.00
     AND journal_entry_id IS NULL;
  IF v_auto_count <> 1 THEN
    RAISE EXCEPTION 'CASE 1: expected exactly one auto-collection row, found %', v_auto_count;
  END IF;

  -- Recon must now close: AFRID GL 0.00 == operational open 0.00, and
  -- credit_used == open-invoice total (0.00).
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices
   WHERE customerid = 'AFRID' AND paymenttype = 'INVOICE'
     AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'AFRID';
  IF ABS(v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 1: AFRID open-invoice total is %, expected 0.00', v_ops_open;
  END IF;
  IF ABS(v_gl_balance - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 1: AFRID recon diff is %, expected 0.00', (v_gl_balance - v_ops_open);
  END IF;
  IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 1: AFRID credit_used % differs from open-invoice total %',
      v_credit_used, v_ops_open;
  END IF;

  RAISE NOTICE 'CASE 1 applied: invoice 2004628 AFRID reclassified INVOICE->CASH (operational only); AFRID recon 0.00';
END $$;

-- -----------------------------------------------------------------------------
-- CASES 2-6 and 11-17 — more pre-cutover sales keyed as credit INVOICEs but
-- actually CASH sales (staff-confirmed; same treatment and rationale as CASE 1).
-- The pre-2026-06-01 period lock blocks the app's INVOICE->CASH button.
--
--   CASE  invoice   customer    name                          amount     date        bucket
--   2     2004559   KY          KEDAI KY, KG.BARU              115.80   30/01/2026   1
--   3     2004601   1M          MINI MARKET 1 MALAYSIA,PAPAR    34.80   10/02/2026   1
--   4     33909     SABANAH-S   SABANAH SUPPLIER              1916.00   03/10/2025   2
--   5     34135     SABANAH-S   SABANAH SUPPLIER              1576.00   26/11/2025   2
--   6     2004297   ANGELA      ANGELA ENTERPRISE             1608.00   01/11/2025   2
--   11    62681     83 MM       83 MINI MARKET                 88.50   18/10/2025   2
--   12    34094     BARAKAH     AL BARAKAH,TAMAN LOK KAWI      348.00   17/11/2025   2
--   13    62866     A&A         A&A MART - TAMPARULI           372.00   24/11/2025   2
--   14    2004275   MING-P      MING TRADING PAPAR             867.00   28/10/2025   2
--   15    2004424   TAY         TAY ENG HWA COLD STORAGE        17.40   16/12/2025   2
--   16    2004285   NEVER-S     NEVER CLOSE SUPERMARKET-KB    1086.00   29/10/2025   §6
--   17    2004226   A MARKET    A MARKET - BENONI              365.00   08/10/2025   §6
--
-- Each customer's debtor GL balance is already 0.00, so flipping these invoices
-- to CASH (operational only, no journal) removes them from the open-invoice
-- total and closes each customer's reconciliation gap to 0.00 without touching
-- the locked, hash-pinned pre-cutover ledger. SABANAH-S has TWO such invoices,
-- so the block converts every invoice first (Pass 1) and only then verifies the
-- recon per DISTINCT customer (Pass 2) — a multi-invoice customer must not be
-- asserted to zero mid-way. (2004297 carries a valid individual e-Invoice;
-- payment type is internal and does not affect the e-Invoice, left untouched.
-- A&A's credit_used was already 0.00 despite its open invoice — a pre-existing
-- drift that Pass 2's recompute corrects to the right post-conversion value.)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_paymenttype   VARCHAR;
  v_balance_due   NUMERIC(12,2);
  v_status        VARCHAR;
  v_journal_id    INTEGER;
  v_auto_count    INTEGER;
  v_credit_used   NUMERIC(12,2);
  v_ops_open      NUMERIC(12,2);
  v_gl_balance    NUMERIC(12,2);
  v_case          TEXT;
  c               RECORD;
  cust            RECORD;
BEGIN
  -- Case table shared by both passes; dropped automatically when this
  -- transaction commits.
  CREATE TEMP TABLE _recon_cash_cases (
    case_label   TEXT,
    invoice_id   VARCHAR,
    customer_id  VARCHAR,
    amount       NUMERIC(12,2),
    invoice_date DATE
  ) ON COMMIT DROP;
  INSERT INTO _recon_cash_cases VALUES
    ('CASE 2',  '2004559', 'KY',        115.80,  DATE '2026-01-30'),
    ('CASE 3',  '2004601', '1M',         34.80,  DATE '2026-02-10'),
    ('CASE 4',  '33909',   'SABANAH-S', 1916.00, DATE '2025-10-03'),
    ('CASE 5',  '34135',   'SABANAH-S', 1576.00, DATE '2025-11-26'),
    ('CASE 6',  '2004297', 'ANGELA',    1608.00, DATE '2025-11-01'),
    ('CASE 11', '62681',   '83 MM',       88.50, DATE '2025-10-18'),
    ('CASE 12', '34094',   'BARAKAH',    348.00, DATE '2025-11-17'),
    ('CASE 13', '62866',   'A&A',        372.00, DATE '2025-11-24'),
    ('CASE 14', '2004275', 'MING-P',     867.00, DATE '2025-10-28'),
    ('CASE 15', '2004424', 'TAY',         17.40, DATE '2025-12-16'),
    ('CASE 16', '2004285', 'NEVER-S',   1086.00, DATE '2025-10-29'),
    ('CASE 17', '2004226', 'A MARKET',   365.00, DATE '2025-10-08');

  -- ===== Pass 1: convert each invoice INVOICE -> CASH (invoice-level checks) =====
  FOR c IN SELECT * FROM _recon_cash_cases ORDER BY case_label LOOP
    v_case := c.case_label;

    -- Lock the rows this case touches.
    PERFORM id FROM invoices  WHERE id = c.invoice_id  FOR UPDATE;
    PERFORM id FROM customers WHERE id = c.customer_id FOR UPDATE;
    PERFORM payment_id FROM payments WHERE invoice_id = c.invoice_id ORDER BY payment_id FOR UPDATE;

    IF NOT EXISTS (SELECT 1 FROM invoices WHERE id = c.invoice_id) THEN
      RAISE EXCEPTION '%: invoice % not found', v_case, c.invoice_id;
    END IF;

    SELECT paymenttype, balance_due::numeric(12,2), invoice_status, journal_entry_id
      INTO v_paymenttype, v_balance_due, v_status, v_journal_id
      FROM invoices WHERE id = c.invoice_id;

    SELECT COUNT(*) INTO v_auto_count
      FROM payments
     WHERE invoice_id = c.invoice_id
       AND is_auto_collection = true
       AND (status IS NULL OR status = 'active');

    -- ----- Idempotent success path: this invoice already converted (invoice-level) -----
    IF v_paymenttype = 'CASH' THEN
      IF v_balance_due <> 0
         OR LOWER(v_status) <> 'paid'
         OR v_journal_id IS NOT NULL
         OR v_auto_count <> 1
         OR NOT EXISTS (
           SELECT 1 FROM payments
            WHERE invoice_id = c.invoice_id AND is_auto_collection = true
              AND (status IS NULL OR status = 'active')
              AND payment_method = 'cash' AND amount_paid = c.amount
              AND journal_entry_id IS NULL) THEN
        RAISE EXCEPTION '%: invoice % is CASH but the applied state has drifted '
          '(balance %, status %, journal %, auto rows %)',
          v_case, c.invoice_id, v_balance_due, v_status, v_journal_id, v_auto_count;
      END IF;
      CONTINUE;  -- nothing to do; Pass 2 verifies the customer recon
    END IF;

    -- ----- Pre-condition guards: the exact approved before-state -----
    IF NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE id = c.invoice_id AND customerid = c.customer_id AND paymenttype = 'INVOICE'
         AND totalamountpayable = c.amount AND balance_due = c.amount
         AND tax_amount = 0.00 AND invoice_status = 'Overdue'
         AND journal_entry_id IS NULL
    ) THEN
      RAISE EXCEPTION '%: invoice % no longer matches the approved before-state', v_case, c.invoice_id;
    END IF;

    IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = c.invoice_id) THEN
      RAISE EXCEPTION '%: invoice % unexpectedly already has payment rows', v_case, c.invoice_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM journal_entries
       WHERE reference_no = c.invoice_id
          OR (source_type = 'invoice' AND source_id = c.invoice_id)
    ) THEN
      RAISE EXCEPTION '%: a journal already references invoice %', v_case, c.invoice_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = c.customer_id AND ledger_type = 'TD' AND is_active)
       OR NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'CASH' AND is_active) THEN
      RAISE EXCEPTION '%: required accounts (% / CASH) missing or inactive', v_case, c.customer_id;
    END IF;

    -- Debtor GL balance must already be 0.00; whole gap is the un-flipped invoice.
    SELECT anchor.amount + COALESCE((
             SELECT SUM(jel.debit_amount - jel.credit_amount)
               FROM journal_entry_lines jel
               JOIN journal_entries je ON je.id = jel.journal_entry_id
              WHERE je.status = 'posted' AND jel.account_code = c.customer_id
                AND je.entry_date >= anchor.as_of_date), 0)
      INTO v_gl_balance
      FROM (
        SELECT as_of_date, amount FROM account_opening_balances
         WHERE account_code = c.customer_id AND as_of_date <= CURRENT_DATE
         ORDER BY as_of_date DESC LIMIT 1
      ) anchor;
    IF v_gl_balance IS NULL OR ABS(v_gl_balance) > 0.005 THEN
      RAISE EXCEPTION '%: % GL balance is %, expected 0.00 (fix would not close the gap)',
        v_case, c.customer_id, v_gl_balance;
    END IF;

    -- ----- Mutation: operational INVOICE -> CASH (no journal) -----
    UPDATE invoices
       SET paymenttype = 'CASH', balance_due = 0, invoice_status = 'paid'
     WHERE id = c.invoice_id;

    INSERT INTO payments (
      invoice_id, payment_date, amount_paid, payment_method,
      payment_reference, bank_account, notes, status, is_auto_collection
    ) VALUES (
      c.invoice_id, c.invoice_date, c.amount, 'cash',
      NULL, 'CASH', 'Automatic payment for CASH invoice', 'active', true
    );

    -- ----- Post-condition (invoice-level) -----
    IF NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE id = c.invoice_id AND paymenttype = 'CASH' AND balance_due = 0
         AND LOWER(invoice_status) = 'paid' AND journal_entry_id IS NULL
    ) THEN
      RAISE EXCEPTION '%: post-state invoice % is invalid', v_case, c.invoice_id;
    END IF;

    SELECT COUNT(*) INTO v_auto_count
      FROM payments
     WHERE invoice_id = c.invoice_id AND is_auto_collection = true
       AND (status IS NULL OR status = 'active')
       AND payment_method = 'cash' AND amount_paid = c.amount
       AND journal_entry_id IS NULL;
    IF v_auto_count <> 1 THEN
      RAISE EXCEPTION '%: expected exactly one auto-collection row for %, found %',
        v_case, c.invoice_id, v_auto_count;
    END IF;

    RAISE NOTICE '% applied: invoice % % reclassified INVOICE->CASH (operational only)',
      v_case, c.invoice_id, c.customer_id;
  END LOOP;

  -- ===== Pass 2: per DISTINCT customer — recompute credit_used and verify recon =====
  -- Done only after every invoice is converted, so a customer with more than one
  -- target invoice (SABANAH-S) is never asserted to zero mid-conversion.
  FOR cust IN SELECT DISTINCT customer_id FROM _recon_cash_cases ORDER BY customer_id LOOP
    UPDATE customers cu
       SET credit_used = (
         SELECT COALESCE(SUM(i.balance_due), 0)
           FROM invoices i
          WHERE i.customerid = cu.id
            AND i.paymenttype = 'INVOICE'
            AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
       )
     WHERE cu.id = cust.customer_id;

    SELECT anchor.amount + COALESCE((
             SELECT SUM(jel.debit_amount - jel.credit_amount)
               FROM journal_entry_lines jel
               JOIN journal_entries je ON je.id = jel.journal_entry_id
              WHERE je.status = 'posted' AND jel.account_code = cust.customer_id
                AND je.entry_date >= anchor.as_of_date), 0)
      INTO v_gl_balance
      FROM (
        SELECT as_of_date, amount FROM account_opening_balances
         WHERE account_code = cust.customer_id AND as_of_date <= CURRENT_DATE
         ORDER BY as_of_date DESC LIMIT 1
      ) anchor;
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
      FROM invoices
     WHERE customerid = cust.customer_id AND paymenttype = 'INVOICE'
       AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = cust.customer_id;

    IF ABS(COALESCE(v_gl_balance, 0) - v_ops_open) > 0.005 THEN
      RAISE EXCEPTION '%: recon diff is %, expected 0.00',
        cust.customer_id, (COALESCE(v_gl_balance, 0) - v_ops_open);
    END IF;
    IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
      RAISE EXCEPTION '%: credit_used % differs from open-invoice total %',
        cust.customer_id, v_credit_used, v_ops_open;
    END IF;

    RAISE NOTICE '% recon verified: GL % = ops % (credit_used %)',
      cust.customer_id, v_gl_balance, v_ops_open, v_credit_used;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- CASE 7 — invoice 62959 (PASAR MINI MY SHOP KUDAT 2 / "MYSHOP-KD2"), residual
--          RM15.40 settled by contra against credit note TH/CN/41 (09/10/2025)
--
-- Invoice 62959 (10/12/2025, RM513.00) was paid RM497.60 by bank transfer
-- (TF110226-4, 11/02/2026, active payment 3352) — exactly RM15.40 short — because
-- credit note TH/CN/41 (RM15.40, 09/10/2025) offsets the balance. That CN is
-- already in the GL: MYSHOP-KD2's 2026-01-01 opening anchor is 497.60 =
-- 513.00 - 15.40, and posted import journal 5101 records the RM497.60 payment,
-- leaving the debtor at 0.00 (confirmed by the 2026-06-01 anchor). Only the
-- operational subledger still shows RM15.40 open, because the CN offset was
-- never keyed. This is the legitimate §5 contra (GL settlement evidence = an
-- opening anchor covering it) — a NON-POSTING contra (Bucket 3 / MYSHOP-SKT
-- pattern) citing TH/CN/41; no journal is created because the GL already holds
-- the credit. Unlike CASES 1-6 the invoice stays INVOICE type (it is a genuine
-- credit sale, not a cash sale). The contra is dated to the settlement date
-- (11/02/2026) so the payment history reads chronologically; TH/CN/41's own
-- 09/10/2025 date is recorded in the reference and notes.
--
-- Preserved untouched: active TF payment 3352 (497.60) and the earlier
-- cancelled full-amount payment 3350 (513.00). After the contra the two active
-- rows total exactly 513.00. (62959 carries a valid individual e-Invoice, left
-- untouched.)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_contra_count INTEGER;
  v_credit_used  NUMERIC(12,2);
  v_ops_open     NUMERIC(12,2);
  v_gl_balance   NUMERIC(12,2);
  v_active_paid  NUMERIC(12,2);
BEGIN
  PERFORM id FROM invoices  WHERE id = '62959'      FOR UPDATE;
  PERFORM id FROM customers WHERE id = 'MYSHOP-KD2' FOR UPDATE;
  PERFORM payment_id FROM payments WHERE invoice_id = '62959' ORDER BY payment_id FOR UPDATE;

  -- 'contra' must be an accepted payment_method (enabled by the Bucket 3 contra
  -- migration). Fail closed with a clear instruction if it is not — do NOT alter
  -- the constraint here, to avoid dropping other permitted methods.
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'payments'::regclass
          AND conname = 'payments_payment_method_check') NOT LIKE '%contra%' THEN
    RAISE EXCEPTION 'CASE 7: payment_method ''contra'' is not permitted by '
      'payments_payment_method_check — enable it first (Bucket 3 contra migration)';
  END IF;

  SELECT COUNT(*) INTO v_contra_count
    FROM payments WHERE internal_reference = 'CONTRA-MYSHOP-KD2-62959';

  -- ----- Idempotent success path -----
  IF v_contra_count = 1 THEN
    IF NOT EXISTS (
      SELECT 1 FROM payments
       WHERE internal_reference = 'CONTRA-MYSHOP-KD2-62959'
         AND invoice_id = '62959' AND payment_method = 'contra'
         AND amount_paid = 15.40 AND status = 'active'
         AND journal_entry_id IS NULL AND receipt_allocation_id IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE id = '62959' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
    ) THEN
      RAISE EXCEPTION 'CASE 7: existing MYSHOP-KD2 contra correction has drifted';
    END IF;
    SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'MYSHOP-KD2';
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
      FROM invoices WHERE customerid = 'MYSHOP-KD2' AND paymenttype = 'INVOICE'
        AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
      RAISE EXCEPTION 'CASE 7: MYSHOP-KD2 credit_used % differs from open-invoice total % after prior run',
        v_credit_used, v_ops_open;
    END IF;
    RETURN;
  ELSIF v_contra_count <> 0 THEN
    RAISE EXCEPTION 'CASE 7: partial MYSHOP-KD2 contra correction found (% rows)', v_contra_count;
  END IF;

  -- ----- Pre-condition guards -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '62959' AND customerid = 'MYSHOP-KD2' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 513.00 AND balance_due = 15.40 AND invoice_status = 'Overdue'
  ) THEN
    RAISE EXCEPTION 'CASE 7: invoice 62959 no longer matches the approved before-state';
  END IF;

  -- The RM497.60 transfer must already be recorded and active, so the contra
  -- completes settlement instead of double-counting.
  IF NOT EXISTS (
    SELECT 1 FROM payments
     WHERE payment_id = 3352 AND invoice_id = '62959' AND amount_paid = 497.60
       AND payment_method = 'bank_transfer' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'CASE 7: the active RM497.60 transfer (payment 3352) no longer matches';
  END IF;

  IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = '62959' AND payment_method = 'contra') THEN
    RAISE EXCEPTION 'CASE 7: invoice 62959 already has a contra payment';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'MYSHOP-KD2' AND ledger_type = 'TD' AND is_active) THEN
    RAISE EXCEPTION 'CASE 7: MYSHOP-KD2 debtor account missing or inactive';
  END IF;

  -- GL evidence: the CN is embedded in the 2026-01-01 opening anchor
  -- (497.60 = 513.00 - 15.40), the RM497.60 payment is posted (import journal
  -- 5101), and the debtor GL balance is currently 0.00.
  IF NOT EXISTS (
    SELECT 1 FROM account_opening_balances
     WHERE account_code = 'MYSHOP-KD2' AND as_of_date = DATE '2026-01-01' AND amount = 497.60
  ) THEN
    RAISE EXCEPTION 'CASE 7: MYSHOP-KD2 2026-01-01 opening anchor is not 497.60 (CN evidence missing)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.id = 5101 AND je.entry_type = 'IMP' AND je.status = 'posted'
       AND jel.account_code = 'MYSHOP-KD2' AND jel.credit_amount = 497.60
  ) THEN
    RAISE EXCEPTION 'CASE 7: posted import settlement (journal 5101, 497.60) no longer matches';
  END IF;

  SELECT anchor.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted' AND jel.account_code = 'MYSHOP-KD2'
              AND je.entry_date >= anchor.as_of_date), 0)
    INTO v_gl_balance
    FROM (
      SELECT as_of_date, amount FROM account_opening_balances
       WHERE account_code = 'MYSHOP-KD2' AND as_of_date <= CURRENT_DATE
       ORDER BY as_of_date DESC LIMIT 1
    ) anchor;
  IF v_gl_balance IS NULL OR ABS(v_gl_balance) > 0.005 THEN
    RAISE EXCEPTION 'CASE 7: MYSHOP-KD2 GL balance is %, expected 0.00', v_gl_balance;
  END IF;

  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'MYSHOP-KD2';
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'MYSHOP-KD2' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  IF ABS(v_credit_used - 15.40) > 0.005 OR ABS(v_ops_open - 15.40) > 0.005 THEN
    RAISE EXCEPTION 'CASE 7: MYSHOP-KD2 pre-state credit_used %/open %, expected 15.40',
      v_credit_used, v_ops_open;
  END IF;

  -- ----- Mutation: non-posting contra + close the invoice -----
  INSERT INTO payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, internal_reference, bank_account, journal_entry_id,
    notes, status, is_auto_collection, receipt_allocation_id
  ) VALUES (
    '62959', DATE '2026-02-11', 15.40, 'contra',
    'TH/CN/41', 'CONTRA-MYSHOP-KD2-62959', NULL, NULL,
    'Residual after the RM497.60 transfer (11/02/2026) is offset by credit note TH/CN/41 (09/10/2025). The CN is already in the debtor ledger (2026-01-01 opening anchor 497.60 = 513.00 - 15.40; RM497.60 payment posted by import journal 5101), so this is a non-posting contra: no journal is created.',
    'active', false, NULL
  );

  UPDATE invoices SET balance_due = 0, invoice_status = 'paid' WHERE id = '62959';

  UPDATE customers cu
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = cu.id
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE cu.id = 'MYSHOP-KD2';

  -- ----- Post-condition verification -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = '62959' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
  ) THEN
    RAISE EXCEPTION 'CASE 7: post-state invoice 62959 is invalid';
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2) INTO v_active_paid
    FROM payments WHERE invoice_id = '62959' AND (status IS NULL OR status = 'active');
  IF v_active_paid <> 513.00 THEN
    RAISE EXCEPTION 'CASE 7: active payments on 62959 total %, expected 513.00', v_active_paid;
  END IF;

  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'MYSHOP-KD2' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'MYSHOP-KD2';
  IF ABS(v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 7: MYSHOP-KD2 open-invoice total is %, expected 0.00', v_ops_open;
  END IF;
  IF ABS(v_gl_balance - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 7: MYSHOP-KD2 recon diff is %, expected 0.00', (v_gl_balance - v_ops_open);
  END IF;
  IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 7: MYSHOP-KD2 credit_used % differs from open-invoice total %',
      v_credit_used, v_ops_open;
  END IF;

  RAISE NOTICE 'CASE 7 applied: invoice 62959 MYSHOP-KD2 RM15.40 contra (TH/CN/41); recon 0.00';
END $$;

-- -----------------------------------------------------------------------------
-- CASE 8 — invoice 2004210 (KEDAI KOPI 148, BEVERLY HILLS / "KOPI 148"),
--          RM330.00, settled by bank transfer TR041025 (04/10/2025), never keyed
--
-- Invoice 2004210 (06/10/2025, RM330.00) was actually paid in full by online
-- transfer TR041025 on 04/10/2025, but the receipt was never keyed and the
-- pre-2026-06-01 period lock now blocks it. KOPI 148's debtor GL balance is
-- 0.00 with both opening anchors (2026-01-01 and 2026-06-01) at 0.00 — the
-- customer's ledger already shows no outstanding debt at cutover, so the
-- pre-cutover transfer is reflected in that settled position. Only the
-- operational subledger still shows RM330 open because the transfer was never
-- recorded there.
--
-- This is the Bucket 3 / SHAB pattern: a bank transfer already reflected in the
-- debtor ledger but never keyed operationally. Because posting a fresh receipt
-- journal into the locked, hash-pinned pre-cutover ledger would risk
-- duplicating a credit the books already hold, this closes the operational
-- residual with a NON-POSTING contra citing TR041025 — no journal is created.
-- The invoice stays INVOICE type (a genuine credit sale paid by transfer). The
-- contra carries the transfer's own date (04/10/2025); note it is two days
-- before the invoice's system date (06/10/2025), per the staff's record.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_contra_count INTEGER;
  v_credit_used  NUMERIC(12,2);
  v_ops_open     NUMERIC(12,2);
  v_gl_balance   NUMERIC(12,2);
  v_active_paid  NUMERIC(12,2);
BEGIN
  PERFORM id FROM invoices  WHERE id = '2004210'  FOR UPDATE;
  PERFORM id FROM customers WHERE id = 'KOPI 148' FOR UPDATE;
  PERFORM payment_id FROM payments WHERE invoice_id = '2004210' ORDER BY payment_id FOR UPDATE;

  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'payments'::regclass
          AND conname = 'payments_payment_method_check') NOT LIKE '%contra%' THEN
    RAISE EXCEPTION 'CASE 8: payment_method ''contra'' is not permitted by '
      'payments_payment_method_check — enable it first (Bucket 3 contra migration)';
  END IF;

  SELECT COUNT(*) INTO v_contra_count
    FROM payments WHERE internal_reference = 'CONTRA-KOPI 148-2004210';

  -- ----- Idempotent success path -----
  IF v_contra_count = 1 THEN
    IF NOT EXISTS (
      SELECT 1 FROM payments
       WHERE internal_reference = 'CONTRA-KOPI 148-2004210'
         AND invoice_id = '2004210' AND payment_method = 'contra'
         AND amount_paid = 330.00 AND status = 'active'
         AND journal_entry_id IS NULL AND receipt_allocation_id IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE id = '2004210' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
    ) THEN
      RAISE EXCEPTION 'CASE 8: existing KOPI 148 contra correction has drifted';
    END IF;
    SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'KOPI 148';
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
      FROM invoices WHERE customerid = 'KOPI 148' AND paymenttype = 'INVOICE'
        AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
      RAISE EXCEPTION 'CASE 8: KOPI 148 credit_used % differs from open-invoice total % after prior run',
        v_credit_used, v_ops_open;
    END IF;
    RETURN;
  ELSIF v_contra_count <> 0 THEN
    RAISE EXCEPTION 'CASE 8: partial KOPI 148 contra correction found (% rows)', v_contra_count;
  END IF;

  -- ----- Pre-condition guards -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '2004210' AND customerid = 'KOPI 148' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 330.00 AND balance_due = 330.00
       AND tax_amount = 0.00 AND invoice_status = 'Overdue' AND journal_entry_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CASE 8: invoice 2004210 no longer matches the approved before-state';
  END IF;

  IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = '2004210') THEN
    RAISE EXCEPTION 'CASE 8: invoice 2004210 unexpectedly already has payment rows';
  END IF;

  IF EXISTS (
    SELECT 1 FROM journal_entries
     WHERE reference_no = '2004210' OR (source_type = 'invoice' AND source_id = '2004210')
  ) THEN
    RAISE EXCEPTION 'CASE 8: a journal already references invoice 2004210';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'KOPI 148' AND ledger_type = 'TD' AND is_active) THEN
    RAISE EXCEPTION 'CASE 8: KOPI 148 debtor account missing or inactive';
  END IF;

  -- GL evidence: the debtor is already settled — GL balance 0.00 and no debt
  -- carried into 2026 (2026-01-01 opening anchor 0.00). The pre-cutover invoice
  -- is therefore reflected as settled; closing the operational residual aligns
  -- the subledger rather than writing off a live debt.
  IF NOT EXISTS (
    SELECT 1 FROM account_opening_balances
     WHERE account_code = 'KOPI 148' AND as_of_date = DATE '2026-01-01' AND amount = 0.00
  ) THEN
    RAISE EXCEPTION 'CASE 8: KOPI 148 2026-01-01 opening anchor is not 0.00';
  END IF;

  SELECT anchor.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted' AND jel.account_code = 'KOPI 148'
              AND je.entry_date >= anchor.as_of_date), 0)
    INTO v_gl_balance
    FROM (
      SELECT as_of_date, amount FROM account_opening_balances
       WHERE account_code = 'KOPI 148' AND as_of_date <= CURRENT_DATE
       ORDER BY as_of_date DESC LIMIT 1
    ) anchor;
  IF v_gl_balance IS NULL OR ABS(v_gl_balance) > 0.005 THEN
    RAISE EXCEPTION 'CASE 8: KOPI 148 GL balance is %, expected 0.00 (would be a write-off, not a contra)', v_gl_balance;
  END IF;

  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'KOPI 148';
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'KOPI 148' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  IF ABS(v_credit_used - 330.00) > 0.005 OR ABS(v_ops_open - 330.00) > 0.005 THEN
    RAISE EXCEPTION 'CASE 8: KOPI 148 pre-state credit_used %/open %, expected 330.00',
      v_credit_used, v_ops_open;
  END IF;

  -- ----- Mutation: non-posting contra + close the invoice -----
  INSERT INTO payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, internal_reference, bank_account, journal_entry_id,
    notes, status, is_auto_collection, receipt_allocation_id
  ) VALUES (
    '2004210', DATE '2025-10-04', 330.00, 'contra',
    'TR041025', 'CONTRA-KOPI 148-2004210', NULL, NULL,
    'Settled in full by online transfer TR041025 on 04/10/2025 but never keyed; the pre-2026-06-01 period lock blocks the receipt. KOPI 148 is already settled in the debtor ledger (GL 0.00; 2026-01-01 opening anchor 0.00), so this is a non-posting contra: no journal is created.',
    'active', false, NULL
  );

  UPDATE invoices SET balance_due = 0, invoice_status = 'paid' WHERE id = '2004210';

  UPDATE customers cu
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = cu.id
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE cu.id = 'KOPI 148';

  -- ----- Post-condition verification -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = '2004210' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
  ) THEN
    RAISE EXCEPTION 'CASE 8: post-state invoice 2004210 is invalid';
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2) INTO v_active_paid
    FROM payments WHERE invoice_id = '2004210' AND (status IS NULL OR status = 'active');
  IF v_active_paid <> 330.00 THEN
    RAISE EXCEPTION 'CASE 8: active payments on 2004210 total %, expected 330.00', v_active_paid;
  END IF;

  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'KOPI 148' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'KOPI 148';
  IF ABS(v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 8: KOPI 148 open-invoice total is %, expected 0.00', v_ops_open;
  END IF;
  IF ABS(v_gl_balance - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 8: KOPI 148 recon diff is %, expected 0.00', (v_gl_balance - v_ops_open);
  END IF;
  IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 8: KOPI 148 credit_used % differs from open-invoice total %',
      v_credit_used, v_ops_open;
  END IF;

  RAISE NOTICE 'CASE 8 applied: invoice 2004210 KOPI 148 RM330.00 contra (TR041025); recon 0.00';
END $$;

-- -----------------------------------------------------------------------------
-- CASE 9 — invoice 62643 (KELUARGA FRESH MART / "KELUARGA"), RM435.00, settled
--          by cash on 11/12/2025, never keyed
--
-- Invoice 62643 (13/10/2025, RM435.00) was paid in full by cash on 11/12/2025
-- (staff record + the salesman's "cash received" sheet), ~2 months after issue —
-- a genuine credit sale settled later, not a point-of-sale cash sale, so unlike
-- CASES 1-6 it stays INVOICE type. The receipt was never keyed and the
-- pre-2026-06-01 period lock now blocks it.
--
-- KELUARGA's debtor GL balance is 0.00 even though its opening anchors are
-- non-zero (2026-01-01 = 1235.00, 2026-06-01 = 870.00): the posted lines net
-- exactly to -1235.00, fully settling the opening, and NONE of them reference
-- 62643. So 62643 was settled before cutover (the 11/12/2025 cash) and the GL
-- carries no debt for it — the customer owes nothing. Only the operational
-- subledger still shows RM435 open. This closes it with a NON-POSTING contra
-- (Bucket 3 pattern), dated to the 11/12/2025 cash payment; no journal is
-- created, so the locked, hash-pinned pre-cutover ledger is untouched.
--
-- Preserved untouched: the earlier CANCELLED cash payment 1444 (13/10/2025,
-- RM435.00), a stale artifact from when the invoice was first keyed.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_contra_count INTEGER;
  v_credit_used  NUMERIC(12,2);
  v_ops_open     NUMERIC(12,2);
  v_gl_balance   NUMERIC(12,2);
  v_active_paid  NUMERIC(12,2);
BEGIN
  PERFORM id FROM invoices  WHERE id = '62643'    FOR UPDATE;
  PERFORM id FROM customers WHERE id = 'KELUARGA' FOR UPDATE;
  PERFORM payment_id FROM payments WHERE invoice_id = '62643' ORDER BY payment_id FOR UPDATE;

  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'payments'::regclass
          AND conname = 'payments_payment_method_check') NOT LIKE '%contra%' THEN
    RAISE EXCEPTION 'CASE 9: payment_method ''contra'' is not permitted by '
      'payments_payment_method_check — enable it first (Bucket 3 contra migration)';
  END IF;

  SELECT COUNT(*) INTO v_contra_count
    FROM payments WHERE internal_reference = 'CONTRA-KELUARGA-62643';

  -- ----- Idempotent success path -----
  IF v_contra_count = 1 THEN
    IF NOT EXISTS (
      SELECT 1 FROM payments
       WHERE internal_reference = 'CONTRA-KELUARGA-62643'
         AND invoice_id = '62643' AND payment_method = 'contra'
         AND amount_paid = 435.00 AND status = 'active'
         AND journal_entry_id IS NULL AND receipt_allocation_id IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE id = '62643' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
    ) THEN
      RAISE EXCEPTION 'CASE 9: existing KELUARGA contra correction has drifted';
    END IF;
    SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'KELUARGA';
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
      FROM invoices WHERE customerid = 'KELUARGA' AND paymenttype = 'INVOICE'
        AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
      RAISE EXCEPTION 'CASE 9: KELUARGA credit_used % differs from open-invoice total % after prior run',
        v_credit_used, v_ops_open;
    END IF;
    RETURN;
  ELSIF v_contra_count <> 0 THEN
    RAISE EXCEPTION 'CASE 9: partial KELUARGA contra correction found (% rows)', v_contra_count;
  END IF;

  -- ----- Pre-condition guards -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '62643' AND customerid = 'KELUARGA' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 435.00 AND balance_due = 435.00
       AND tax_amount = 0.00 AND invoice_status = 'Overdue' AND journal_entry_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CASE 9: invoice 62643 no longer matches the approved before-state';
  END IF;

  -- No ACTIVE payment (the only existing row is the cancelled 1444, preserved).
  IF EXISTS (
    SELECT 1 FROM payments WHERE invoice_id = '62643' AND (status IS NULL OR status = 'active')
  ) THEN
    RAISE EXCEPTION 'CASE 9: invoice 62643 unexpectedly has an active payment';
  END IF;

  IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = '62643' AND payment_method = 'contra') THEN
    RAISE EXCEPTION 'CASE 9: invoice 62643 already has a contra payment';
  END IF;

  IF EXISTS (
    SELECT 1 FROM journal_entries
     WHERE reference_no = '62643' OR (source_type = 'invoice' AND source_id = '62643')
  ) THEN
    RAISE EXCEPTION 'CASE 9: a journal already references invoice 62643';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'KELUARGA' AND ledger_type = 'TD' AND is_active) THEN
    RAISE EXCEPTION 'CASE 9: KELUARGA debtor account missing or inactive';
  END IF;

  -- GL evidence: the debtor is fully settled (GL balance 0.00), so closing the
  -- operational residual aligns the subledger rather than writing off a debt.
  -- (62643 is a pre-cutover invoice; if it were still an open GL item the
  -- balance would be >= 435, not 0.)
  SELECT anchor.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted' AND jel.account_code = 'KELUARGA'
              AND je.entry_date >= anchor.as_of_date), 0)
    INTO v_gl_balance
    FROM (
      SELECT as_of_date, amount FROM account_opening_balances
       WHERE account_code = 'KELUARGA' AND as_of_date <= CURRENT_DATE
       ORDER BY as_of_date DESC LIMIT 1
    ) anchor;
  IF v_gl_balance IS NULL OR ABS(v_gl_balance) > 0.005 THEN
    RAISE EXCEPTION 'CASE 9: KELUARGA GL balance is %, expected 0.00 (would be a write-off, not a contra)', v_gl_balance;
  END IF;

  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'KELUARGA';
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'KELUARGA' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  IF ABS(v_credit_used - 435.00) > 0.005 OR ABS(v_ops_open - 435.00) > 0.005 THEN
    RAISE EXCEPTION 'CASE 9: KELUARGA pre-state credit_used %/open %, expected 435.00',
      v_credit_used, v_ops_open;
  END IF;

  -- ----- Mutation: non-posting contra + close the invoice -----
  INSERT INTO payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, internal_reference, bank_account, journal_entry_id,
    notes, status, is_auto_collection, receipt_allocation_id
  ) VALUES (
    '62643', DATE '2025-12-11', 435.00, 'contra',
    NULL, 'CONTRA-KELUARGA-62643', NULL, NULL,
    'Settled in full by cash on 11/12/2025 (staff cash-received record) but never keyed; the pre-2026-06-01 period lock blocks the receipt. KELUARGA is fully settled in the debtor ledger (GL 0.00) and 62643 is a pre-cutover invoice carried as no open GL item, so this is a non-posting contra: no journal is created. The earlier cancelled cash payment 1444 (13/10/2025) is preserved.',
    'active', false, NULL
  );

  UPDATE invoices SET balance_due = 0, invoice_status = 'paid' WHERE id = '62643';

  UPDATE customers cu
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = cu.id
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE cu.id = 'KELUARGA';

  -- ----- Post-condition verification -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = '62643' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
  ) THEN
    RAISE EXCEPTION 'CASE 9: post-state invoice 62643 is invalid';
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2) INTO v_active_paid
    FROM payments WHERE invoice_id = '62643' AND (status IS NULL OR status = 'active');
  IF v_active_paid <> 435.00 THEN
    RAISE EXCEPTION 'CASE 9: active payments on 62643 total %, expected 435.00', v_active_paid;
  END IF;

  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'KELUARGA' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'KELUARGA';
  IF ABS(v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 9: KELUARGA open-invoice total is %, expected 0.00', v_ops_open;
  END IF;
  IF ABS(v_gl_balance - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 9: KELUARGA recon diff is %, expected 0.00', (v_gl_balance - v_ops_open);
  END IF;
  IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 9: KELUARGA credit_used % differs from open-invoice total %',
      v_credit_used, v_ops_open;
  END IF;

  RAISE NOTICE 'CASE 9 applied: invoice 62643 KELUARGA RM435.00 contra (cash 11/12/2025); recon 0.00';
END $$;

-- -----------------------------------------------------------------------------
-- CASE 10 — invoice 013543 (WONG KUI MIN / "WONG-KM"), RM975.00, settled by cash
--           on 10/12/2025, never keyed
--
-- Invoice 013543 (09/12/2025, RM975.00) was paid in full by cash on 10/12/2025
-- (staff record + the salesman's "cash received" sheet), the day after issue —
-- a credit sale settled later, so it stays INVOICE type. The receipt was never
-- keyed and the pre-2026-06-01 period lock now blocks it.
--
-- Same clean pattern as CASE 8 (KOPI 148): both of WONG-KM's opening anchors
-- (2026-01-01 and 2026-06-01) are 0.00 and the debtor GL balance is 0.00 — the
-- customer's ledger shows no debt carried into 2026, so this pre-cutover invoice
-- is reflected as settled (no GL line references 013543). Only the operational
-- subledger still shows RM975 open. This closes it with a NON-POSTING contra
-- dated to the 10/12/2025 cash payment; no journal is created. (The salesman
-- sheet's red "journal" annotation never produced an actual journal — none
-- references 013543 by reference, source or particulars.)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_contra_count INTEGER;
  v_credit_used  NUMERIC(12,2);
  v_ops_open     NUMERIC(12,2);
  v_gl_balance   NUMERIC(12,2);
  v_active_paid  NUMERIC(12,2);
BEGIN
  PERFORM id FROM invoices  WHERE id = '013543'  FOR UPDATE;
  PERFORM id FROM customers WHERE id = 'WONG-KM' FOR UPDATE;
  PERFORM payment_id FROM payments WHERE invoice_id = '013543' ORDER BY payment_id FOR UPDATE;

  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'payments'::regclass
          AND conname = 'payments_payment_method_check') NOT LIKE '%contra%' THEN
    RAISE EXCEPTION 'CASE 10: payment_method ''contra'' is not permitted by '
      'payments_payment_method_check — enable it first (Bucket 3 contra migration)';
  END IF;

  SELECT COUNT(*) INTO v_contra_count
    FROM payments WHERE internal_reference = 'CONTRA-WONG-KM-013543';

  -- ----- Idempotent success path -----
  IF v_contra_count = 1 THEN
    IF NOT EXISTS (
      SELECT 1 FROM payments
       WHERE internal_reference = 'CONTRA-WONG-KM-013543'
         AND invoice_id = '013543' AND payment_method = 'contra'
         AND amount_paid = 975.00 AND status = 'active'
         AND journal_entry_id IS NULL AND receipt_allocation_id IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE id = '013543' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
    ) THEN
      RAISE EXCEPTION 'CASE 10: existing WONG-KM contra correction has drifted';
    END IF;
    SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'WONG-KM';
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
      FROM invoices WHERE customerid = 'WONG-KM' AND paymenttype = 'INVOICE'
        AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
      RAISE EXCEPTION 'CASE 10: WONG-KM credit_used % differs from open-invoice total % after prior run',
        v_credit_used, v_ops_open;
    END IF;
    RETURN;
  ELSIF v_contra_count <> 0 THEN
    RAISE EXCEPTION 'CASE 10: partial WONG-KM contra correction found (% rows)', v_contra_count;
  END IF;

  -- ----- Pre-condition guards -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '013543' AND customerid = 'WONG-KM' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 975.00 AND balance_due = 975.00
       AND tax_amount = 0.00 AND invoice_status = 'Overdue' AND journal_entry_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CASE 10: invoice 013543 no longer matches the approved before-state';
  END IF;

  IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = '013543') THEN
    RAISE EXCEPTION 'CASE 10: invoice 013543 unexpectedly already has payment rows';
  END IF;

  IF EXISTS (
    SELECT 1 FROM journal_entries
     WHERE reference_no = '013543' OR (source_type = 'invoice' AND source_id = '013543')
  ) THEN
    RAISE EXCEPTION 'CASE 10: a journal already references invoice 013543';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'WONG-KM' AND ledger_type = 'TD' AND is_active) THEN
    RAISE EXCEPTION 'CASE 10: WONG-KM debtor account missing or inactive';
  END IF;

  -- GL evidence: debtor already settled — GL balance 0.00 and no debt carried
  -- into 2026 (2026-01-01 opening anchor 0.00). Closing the operational residual
  -- aligns the subledger rather than writing off a live debt.
  IF NOT EXISTS (
    SELECT 1 FROM account_opening_balances
     WHERE account_code = 'WONG-KM' AND as_of_date = DATE '2026-01-01' AND amount = 0.00
  ) THEN
    RAISE EXCEPTION 'CASE 10: WONG-KM 2026-01-01 opening anchor is not 0.00';
  END IF;

  SELECT anchor.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted' AND jel.account_code = 'WONG-KM'
              AND je.entry_date >= anchor.as_of_date), 0)
    INTO v_gl_balance
    FROM (
      SELECT as_of_date, amount FROM account_opening_balances
       WHERE account_code = 'WONG-KM' AND as_of_date <= CURRENT_DATE
       ORDER BY as_of_date DESC LIMIT 1
    ) anchor;
  IF v_gl_balance IS NULL OR ABS(v_gl_balance) > 0.005 THEN
    RAISE EXCEPTION 'CASE 10: WONG-KM GL balance is %, expected 0.00 (would be a write-off, not a contra)', v_gl_balance;
  END IF;

  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'WONG-KM';
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'WONG-KM' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  IF ABS(v_credit_used - 975.00) > 0.005 OR ABS(v_ops_open - 975.00) > 0.005 THEN
    RAISE EXCEPTION 'CASE 10: WONG-KM pre-state credit_used %/open %, expected 975.00',
      v_credit_used, v_ops_open;
  END IF;

  -- ----- Mutation: non-posting contra + close the invoice -----
  INSERT INTO payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, internal_reference, bank_account, journal_entry_id,
    notes, status, is_auto_collection, receipt_allocation_id
  ) VALUES (
    '013543', DATE '2025-12-10', 975.00, 'contra',
    NULL, 'CONTRA-WONG-KM-013543', NULL, NULL,
    'Settled in full by cash on 10/12/2025 (staff cash-received record) but never keyed; the pre-2026-06-01 period lock blocks the receipt. WONG-KM is already settled in the debtor ledger (GL 0.00; 2026-01-01 opening anchor 0.00), so this is a non-posting contra: no journal is created.',
    'active', false, NULL
  );

  UPDATE invoices SET balance_due = 0, invoice_status = 'paid' WHERE id = '013543';

  UPDATE customers cu
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = cu.id
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE cu.id = 'WONG-KM';

  -- ----- Post-condition verification -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = '013543' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
  ) THEN
    RAISE EXCEPTION 'CASE 10: post-state invoice 013543 is invalid';
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2) INTO v_active_paid
    FROM payments WHERE invoice_id = '013543' AND (status IS NULL OR status = 'active');
  IF v_active_paid <> 975.00 THEN
    RAISE EXCEPTION 'CASE 10: active payments on 013543 total %, expected 975.00', v_active_paid;
  END IF;

  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'WONG-KM' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'WONG-KM';
  IF ABS(v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 10: WONG-KM open-invoice total is %, expected 0.00', v_ops_open;
  END IF;
  IF ABS(v_gl_balance - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 10: WONG-KM recon diff is %, expected 0.00', (v_gl_balance - v_ops_open);
  END IF;
  IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 10: WONG-KM credit_used % differs from open-invoice total %',
      v_credit_used, v_ops_open;
  END IF;

  RAISE NOTICE 'CASE 10 applied: invoice 013543 WONG-KM RM975.00 contra (cash 10/12/2025); recon 0.00';
END $$;

-- -----------------------------------------------------------------------------
-- CASE 18 — invoice 026261 (CLS GEMILANG ENTERPRISE / "CLS"), RM976.00, settled
--           by online transfer on 04/11/2025, never keyed
--
-- Invoice 026261 (27/10/2025, RM976.00) was actually paid in full by online
-- transfer on 04/11/2025 — proven by the salesman's cash/cheque-received book
-- ("NO:026261  CLS GEMILANG ENT.  ONLINE 04/11") — a genuine credit sale settled
-- ~1 week later, so unlike the CASH cases it stays INVOICE type. The receipt was
-- never keyed and the pre-2026-06-01 period lock now blocks it.
--
-- CLS's debtor GL balance is 0.00 with its latest opening anchor (2026-06-01)
-- at 0.00, so the pre-cutover transfer is reflected in that settled position;
-- the debtor carries no debt for 026261. (CLS has no 2026-01-01 anchor — its
-- carried-in balance was zero at that checkpoint — so, unlike CASES 8/10, this
-- guard pins the latest 2026-06-01 anchor instead.) Only the operational
-- subledger still shows RM976 open because the transfer was never recorded
-- there.
--
-- Treatment: Bucket 3 / SHAB pattern — a bank/online transfer already reflected
-- in the debtor ledger but never keyed. Closing the operational residual with a
-- NON-POSTING contra citing the 04/11/2025 online transfer; no journal is
-- created, so the locked, hash-pinned pre-cutover ledger is untouched. The
-- contra is dated to the transfer date (04/11/2025).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_contra_count INTEGER;
  v_credit_used  NUMERIC(12,2);
  v_ops_open     NUMERIC(12,2);
  v_gl_balance   NUMERIC(12,2);
  v_active_paid  NUMERIC(12,2);
  v_anchor_date  DATE;
  v_anchor_amt   NUMERIC(12,2);
BEGIN
  PERFORM id FROM invoices  WHERE id = '026261' FOR UPDATE;
  PERFORM id FROM customers WHERE id = 'CLS'    FOR UPDATE;
  PERFORM payment_id FROM payments WHERE invoice_id = '026261' ORDER BY payment_id FOR UPDATE;

  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'payments'::regclass
          AND conname = 'payments_payment_method_check') NOT LIKE '%contra%' THEN
    RAISE EXCEPTION 'CASE 18: payment_method ''contra'' is not permitted by '
      'payments_payment_method_check — enable it first (Bucket 3 contra migration)';
  END IF;

  SELECT COUNT(*) INTO v_contra_count
    FROM payments WHERE internal_reference = 'CONTRA-CLS-026261';

  -- ----- Idempotent success path -----
  IF v_contra_count = 1 THEN
    IF NOT EXISTS (
      SELECT 1 FROM payments
       WHERE internal_reference = 'CONTRA-CLS-026261'
         AND invoice_id = '026261' AND payment_method = 'contra'
         AND amount_paid = 976.00 AND status = 'active'
         AND journal_entry_id IS NULL AND receipt_allocation_id IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE id = '026261' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
    ) THEN
      RAISE EXCEPTION 'CASE 18: existing CLS contra correction has drifted';
    END IF;
    SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'CLS';
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
      FROM invoices WHERE customerid = 'CLS' AND paymenttype = 'INVOICE'
        AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
      RAISE EXCEPTION 'CASE 18: CLS credit_used % differs from open-invoice total % after prior run',
        v_credit_used, v_ops_open;
    END IF;
    RETURN;
  ELSIF v_contra_count <> 0 THEN
    RAISE EXCEPTION 'CASE 18: partial CLS contra correction found (% rows)', v_contra_count;
  END IF;

  -- ----- Pre-condition guards -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '026261' AND customerid = 'CLS' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 976.00 AND balance_due = 976.00
       AND tax_amount = 0.00 AND invoice_status = 'Overdue' AND journal_entry_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CASE 18: invoice 026261 no longer matches the approved before-state';
  END IF;

  IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = '026261') THEN
    RAISE EXCEPTION 'CASE 18: invoice 026261 unexpectedly already has payment rows';
  END IF;

  IF EXISTS (
    SELECT 1 FROM journal_entries
     WHERE reference_no = '026261' OR (source_type = 'invoice' AND source_id = '026261')
  ) THEN
    RAISE EXCEPTION 'CASE 18: a journal already references invoice 026261';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'CLS' AND ledger_type = 'TD' AND is_active) THEN
    RAISE EXCEPTION 'CASE 18: CLS debtor account missing or inactive';
  END IF;

  -- GL evidence: the debtor is already settled. CLS's LATEST opening anchor
  -- (2026-06-01) is 0.00 and the GL balance is 0.00; the pre-cutover online
  -- transfer is reflected in that settled position, so closing the operational
  -- residual aligns the subledger rather than writing off a live debt. (CLS has
  -- no 2026-01-01 anchor, so pin the latest anchor rather than that checkpoint.)
  SELECT as_of_date, amount INTO v_anchor_date, v_anchor_amt
    FROM account_opening_balances
   WHERE account_code = 'CLS' AND as_of_date <= CURRENT_DATE
   ORDER BY as_of_date DESC LIMIT 1;
  IF v_anchor_date IS DISTINCT FROM DATE '2026-06-01' OR v_anchor_amt IS DISTINCT FROM 0.00 THEN
    RAISE EXCEPTION 'CASE 18: CLS latest opening anchor is % / %, expected 2026-06-01 / 0.00',
      v_anchor_date, v_anchor_amt;
  END IF;

  SELECT v_anchor_amt + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted' AND jel.account_code = 'CLS'
              AND je.entry_date >= v_anchor_date), 0)
    INTO v_gl_balance;
  IF v_gl_balance IS NULL OR ABS(v_gl_balance) > 0.005 THEN
    RAISE EXCEPTION 'CASE 18: CLS GL balance is %, expected 0.00 (would be a write-off, not a contra)', v_gl_balance;
  END IF;

  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'CLS';
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'CLS' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  IF ABS(v_credit_used - 976.00) > 0.005 OR ABS(v_ops_open - 976.00) > 0.005 THEN
    RAISE EXCEPTION 'CASE 18: CLS pre-state credit_used %/open %, expected 976.00',
      v_credit_used, v_ops_open;
  END IF;

  -- ----- Mutation: non-posting contra + close the invoice -----
  INSERT INTO payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, internal_reference, bank_account, journal_entry_id,
    notes, status, is_auto_collection, receipt_allocation_id
  ) VALUES (
    '026261', DATE '2025-11-04', 976.00, 'contra',
    'ONLINE 04/11/2025', 'CONTRA-CLS-026261', NULL, NULL,
    'Settled in full by online transfer on 04/11/2025 (salesman cash/cheque-received book "NO:026261 CLS GEMILANG ENT. ONLINE 04/11") but never keyed; the pre-2026-06-01 period lock blocks the receipt. CLS is already settled in the debtor ledger (GL 0.00; latest 2026-06-01 opening anchor 0.00), so this is a non-posting contra: no journal is created.',
    'active', false, NULL
  );

  UPDATE invoices SET balance_due = 0, invoice_status = 'paid' WHERE id = '026261';

  UPDATE customers cu
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = cu.id
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE cu.id = 'CLS';

  -- ----- Post-condition verification -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = '026261' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
  ) THEN
    RAISE EXCEPTION 'CASE 18: post-state invoice 026261 is invalid';
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2) INTO v_active_paid
    FROM payments WHERE invoice_id = '026261' AND (status IS NULL OR status = 'active');
  IF v_active_paid <> 976.00 THEN
    RAISE EXCEPTION 'CASE 18: active payments on 026261 total %, expected 976.00', v_active_paid;
  END IF;

  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'CLS' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'CLS';
  IF ABS(v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 18: CLS open-invoice total is %, expected 0.00', v_ops_open;
  END IF;
  IF ABS(v_gl_balance - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 18: CLS recon diff is %, expected 0.00', (v_gl_balance - v_ops_open);
  END IF;
  IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 18: CLS credit_used % differs from open-invoice total %',
      v_credit_used, v_ops_open;
  END IF;

  RAISE NOTICE 'CASE 18 applied: invoice 026261 CLS RM976.00 contra (ONLINE 04/11/2025); recon 0.00';
END $$;

-- -----------------------------------------------------------------------------
-- CASE 19 — invoice 62155 (U TEA RESOURCES S/B / "UTEA"), RM342.00, settled by
--           online transfer TF150725-1 on 15/07/2025, never keyed as active
--
-- Invoice 62155 (issued 12/07/2025, RM342.00) was paid in full by online
-- transfer TF150725-1 on 15/07/2025 (staff record), a few days after issue — a
-- genuine credit sale settled shortly after, so it stays INVOICE type. A matching
-- bank_transfer payment (174, 15/07/2025, RM342.00, ref TF150725-1) was keyed and
-- later CANCELLED, so the invoice was left outstanding operationally; the
-- pre-2026-06-01 period lock now blocks re-keying it.
--
-- UTEA's debtor GL balance is 0.00 with both opening anchors (2026-01-01 and
-- 2026-06-01) at 0.00 — no debt carried at either checkpoint, so the pre-cutover
-- transfer is reflected in that settled position. Only the operational subledger
-- still shows RM342 open. This closes it with a NON-POSTING contra (Bucket 3 /
-- SHAB pattern) citing TF150725-1, dated to the 15/07/2025 transfer; no journal
-- is created, so the locked, hash-pinned pre-cutover ledger is untouched.
--
-- Preserved untouched: the earlier CANCELLED bank_transfer payment 174
-- (15/07/2025, RM342.00, TF150725-1) — a stale artifact of the un-cancelled
-- keying. After the contra the single active row totals exactly RM342.00.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_contra_count INTEGER;
  v_credit_used  NUMERIC(12,2);
  v_ops_open     NUMERIC(12,2);
  v_gl_balance   NUMERIC(12,2);
  v_active_paid  NUMERIC(12,2);
BEGIN
  PERFORM id FROM invoices  WHERE id = '62155' FOR UPDATE;
  PERFORM id FROM customers WHERE id = 'UTEA'  FOR UPDATE;
  PERFORM payment_id FROM payments WHERE invoice_id = '62155' ORDER BY payment_id FOR UPDATE;

  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'payments'::regclass
          AND conname = 'payments_payment_method_check') NOT LIKE '%contra%' THEN
    RAISE EXCEPTION 'CASE 19: payment_method ''contra'' is not permitted by '
      'payments_payment_method_check — enable it first (Bucket 3 contra migration)';
  END IF;

  SELECT COUNT(*) INTO v_contra_count
    FROM payments WHERE internal_reference = 'CONTRA-UTEA-62155';

  -- ----- Idempotent success path -----
  IF v_contra_count = 1 THEN
    IF NOT EXISTS (
      SELECT 1 FROM payments
       WHERE internal_reference = 'CONTRA-UTEA-62155'
         AND invoice_id = '62155' AND payment_method = 'contra'
         AND amount_paid = 342.00 AND status = 'active'
         AND journal_entry_id IS NULL AND receipt_allocation_id IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE id = '62155' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
    ) THEN
      RAISE EXCEPTION 'CASE 19: existing UTEA contra correction has drifted';
    END IF;
    SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'UTEA';
    SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
      FROM invoices WHERE customerid = 'UTEA' AND paymenttype = 'INVOICE'
        AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
    IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
      RAISE EXCEPTION 'CASE 19: UTEA credit_used % differs from open-invoice total % after prior run',
        v_credit_used, v_ops_open;
    END IF;
    RETURN;
  ELSIF v_contra_count <> 0 THEN
    RAISE EXCEPTION 'CASE 19: partial UTEA contra correction found (% rows)', v_contra_count;
  END IF;

  -- ----- Pre-condition guards -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices
     WHERE id = '62155' AND customerid = 'UTEA' AND paymenttype = 'INVOICE'
       AND totalamountpayable = 342.00 AND balance_due = 342.00
       AND tax_amount = 0.00 AND invoice_status = 'Overdue' AND journal_entry_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CASE 19: invoice 62155 no longer matches the approved before-state';
  END IF;

  -- The only existing payment must be the cancelled RM342.00 transfer (174);
  -- there must be no active or contra row yet.
  IF NOT EXISTS (
    SELECT 1 FROM payments
     WHERE payment_id = 174 AND invoice_id = '62155' AND amount_paid = 342.00
       AND payment_method = 'bank_transfer' AND status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'CASE 19: the cancelled RM342.00 transfer (payment 174) no longer matches';
  END IF;
  IF EXISTS (
    SELECT 1 FROM payments
     WHERE invoice_id = '62155' AND (payment_method = 'contra' OR status = 'active' OR status IS NULL)
  ) THEN
    RAISE EXCEPTION 'CASE 19: invoice 62155 unexpectedly already has an active or contra payment';
  END IF;

  IF EXISTS (
    SELECT 1 FROM journal_entries
     WHERE reference_no = '62155' OR (source_type = 'invoice' AND source_id = '62155')
  ) THEN
    RAISE EXCEPTION 'CASE 19: a journal already references invoice 62155';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'UTEA' AND ledger_type = 'TD' AND is_active) THEN
    RAISE EXCEPTION 'CASE 19: UTEA debtor account missing or inactive';
  END IF;

  -- GL evidence: debtor already settled — GL balance 0.00 and no debt carried
  -- into 2026 (2026-01-01 opening anchor 0.00). Closing the operational residual
  -- aligns the subledger rather than writing off a live debt.
  IF NOT EXISTS (
    SELECT 1 FROM account_opening_balances
     WHERE account_code = 'UTEA' AND as_of_date = DATE '2026-01-01' AND amount = 0.00
  ) THEN
    RAISE EXCEPTION 'CASE 19: UTEA 2026-01-01 opening anchor is not 0.00';
  END IF;

  SELECT anchor.amount + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted' AND jel.account_code = 'UTEA'
              AND je.entry_date >= anchor.as_of_date), 0)
    INTO v_gl_balance
    FROM (
      SELECT as_of_date, amount FROM account_opening_balances
       WHERE account_code = 'UTEA' AND as_of_date <= CURRENT_DATE
       ORDER BY as_of_date DESC LIMIT 1
    ) anchor;
  IF v_gl_balance IS NULL OR ABS(v_gl_balance) > 0.005 THEN
    RAISE EXCEPTION 'CASE 19: UTEA GL balance is %, expected 0.00 (would be a write-off, not a contra)', v_gl_balance;
  END IF;

  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'UTEA';
  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'UTEA' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  IF ABS(v_credit_used - 342.00) > 0.005 OR ABS(v_ops_open - 342.00) > 0.005 THEN
    RAISE EXCEPTION 'CASE 19: UTEA pre-state credit_used %/open %, expected 342.00',
      v_credit_used, v_ops_open;
  END IF;

  -- ----- Mutation: non-posting contra + close the invoice -----
  INSERT INTO payments (
    invoice_id, payment_date, amount_paid, payment_method,
    payment_reference, internal_reference, bank_account, journal_entry_id,
    notes, status, is_auto_collection, receipt_allocation_id
  ) VALUES (
    '62155', DATE '2025-07-15', 342.00, 'contra',
    'TF150725-1', 'CONTRA-UTEA-62155', NULL, NULL,
    'Settled in full by online transfer TF150725-1 on 15/07/2025 but the original payment (174) was cancelled and the invoice left open; the pre-2026-06-01 period lock blocks re-keying it. UTEA is already settled in the debtor ledger (GL 0.00; 2026-01-01 opening anchor 0.00), so this is a non-posting contra: no journal is created.',
    'active', false, NULL
  );

  UPDATE invoices SET balance_due = 0, invoice_status = 'paid' WHERE id = '62155';

  UPDATE customers cu
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = cu.id
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE cu.id = 'UTEA';

  -- ----- Post-condition verification -----
  IF NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = '62155' AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
  ) THEN
    RAISE EXCEPTION 'CASE 19: post-state invoice 62155 is invalid';
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2) INTO v_active_paid
    FROM payments WHERE invoice_id = '62155' AND (status IS NULL OR status = 'active');
  IF v_active_paid <> 342.00 THEN
    RAISE EXCEPTION 'CASE 19: active payments on 62155 total %, expected 342.00', v_active_paid;
  END IF;

  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'UTEA' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'UTEA';
  IF ABS(v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 19: UTEA open-invoice total is %, expected 0.00', v_ops_open;
  END IF;
  IF ABS(v_gl_balance - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 19: UTEA recon diff is %, expected 0.00', (v_gl_balance - v_ops_open);
  END IF;
  IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASE 19: UTEA credit_used % differs from open-invoice total %',
      v_credit_used, v_ops_open;
  END IF;

  RAISE NOTICE 'CASE 19 applied: invoice 62155 UTEA RM342.00 contra (TF150725-1, 15/07/2025); recon 0.00';
END $$;

-- -----------------------------------------------------------------------------
-- CASES 20-21 — MY SHOP-KOTA MARUDU 2 ("MYSHOP-KM2"), two partial residuals each
--   left after a large online transfer and offset by a credit note (3% prompt-
--   payment discount), never keyed:
--
--     CASE  invoice   total      paid (active)                              residual   CN
--     20    62394     1671.50    1621.35 online TF161225-3 (16/12/2025, p2553)   50.15  TH/CN/25/38 (26/08/2025)
--     21    62952      731.50     709.55 online TF110226-5 (11/02/2026, p3351)   21.95  TH/CN/25/49
--
-- Each residual is exactly 3% of the bill (50.15 ≈ 3% of 1671.50; 21.95 = 3% of
-- 731.50), a prompt-payment discount confirmed by staff, offset by the cited CN.
-- Both invoices stay INVOICE type (genuine credit sales; the large payment is a
-- real transfer, the residual a discount contra). This is the §5 residual-contra
-- pattern (Bucket 3 / CASE 7): the discount CN is already reflected in the debtor
-- ledger, so the residual is closed with a NON-POSTING contra — no journal is
-- created. Each contra is dated to its transfer settlement date; the CN's own
-- reference/date is recorded in the payment reference and notes.
--
-- MYSHOP-KM2's debtor GL balance is 0.00 (latest opening anchor 2026-06-01 =
-- 803.65, fully netted by posted REC journal 11721); only the operational
-- subledger still carries the two 3% residuals (credit_used 72.10 = 50.15 +
-- 21.95). Because MYSHOP-KM2 has TWO target invoices, both contras are applied
-- first and the customer recon is verified only ONCE at the end (like the
-- SABANAH-S two-pass block) — the customer is never asserted to zero mid-way.
--
-- Preserved untouched: the active large-transfer payments 2553 and 3351. (Payment
-- 3351 carries a CANCELLED REC journal 496, which does not affect the GL; the
-- payment itself stays active.) After each contra the invoice's active rows total
-- exactly its bill amount.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_credit_used  NUMERIC(12,2);
  v_ops_open     NUMERIC(12,2);
  v_gl_balance   NUMERIC(12,2);
  v_active_paid  NUMERIC(12,2);
  v_contra_count INTEGER;
  v_anchor_date  DATE;
  v_anchor_amt   NUMERIC(12,2);
  c              RECORD;
BEGIN
  PERFORM id FROM customers WHERE id = 'MYSHOP-KM2' FOR UPDATE;

  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'payments'::regclass
          AND conname = 'payments_payment_method_check') NOT LIKE '%contra%' THEN
    RAISE EXCEPTION 'CASES 20-21: payment_method ''contra'' is not permitted by '
      'payments_payment_method_check — enable it first (Bucket 3 contra migration)';
  END IF;

  CREATE TEMP TABLE _km2_contra_cases (
    case_label     TEXT,
    invoice_id     VARCHAR,
    invoice_total  NUMERIC(12,2),
    residual       NUMERIC(12,2),
    active_pmt_id  INTEGER,
    active_pmt_amt NUMERIC(12,2),
    active_method  TEXT,
    cn_ref         TEXT,
    contra_date    DATE,
    contra_note    TEXT
  ) ON COMMIT DROP;
  INSERT INTO _km2_contra_cases VALUES
    ('CASE 20', '62394', 1671.50, 50.15, 2553, 1621.35, 'online', 'TH/CN/25/38', DATE '2025-12-16',
     'Residual after the RM1,621.35 online transfer (TF161225-3, 16/12/2025) is offset by credit note TH/CN/25/38 (26/08/2025) — a 3% prompt-payment discount. The CN is already reflected in the debtor ledger (GL 0.00), so this is a non-posting contra: no journal is created.'),
    ('CASE 21', '62952',  731.50, 21.95, 3351,  709.55, 'bank_transfer', 'TH/CN/25/49', DATE '2026-02-11',
     'Residual after the RM709.55 online transfer (TF110226-5, 11/02/2026) is offset by credit note TH/CN/25/49 — a 3% prompt-payment discount. The CN is already reflected in the debtor ledger (GL 0.00), so this is a non-posting contra: no journal is created.');

  -- ===== Pass 1: per invoice — insert the residual contra and close the invoice =====
  FOR c IN SELECT * FROM _km2_contra_cases ORDER BY case_label LOOP
    PERFORM id FROM invoices WHERE id = c.invoice_id FOR UPDATE;
    PERFORM payment_id FROM payments WHERE invoice_id = c.invoice_id ORDER BY payment_id FOR UPDATE;

    SELECT COUNT(*) INTO v_contra_count
      FROM payments WHERE internal_reference = 'CONTRA-MYSHOP-KM2-' || c.invoice_id;

    -- ----- Idempotent success path (invoice-level) -----
    IF v_contra_count = 1 THEN
      IF NOT EXISTS (
        SELECT 1 FROM payments
         WHERE internal_reference = 'CONTRA-MYSHOP-KM2-' || c.invoice_id
           AND invoice_id = c.invoice_id AND payment_method = 'contra'
           AND amount_paid = c.residual AND status = 'active'
           AND journal_entry_id IS NULL AND receipt_allocation_id IS NULL
      ) OR NOT EXISTS (
        SELECT 1 FROM invoices
         WHERE id = c.invoice_id AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
      ) THEN
        RAISE EXCEPTION '%: existing MYSHOP-KM2 contra correction has drifted', c.case_label;
      END IF;
      CONTINUE;  -- nothing to do; recon is verified after the loop
    ELSIF v_contra_count <> 0 THEN
      RAISE EXCEPTION '%: partial MYSHOP-KM2 contra correction found (% rows)', c.case_label, v_contra_count;
    END IF;

    -- ----- Pre-condition guards -----
    IF NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE id = c.invoice_id AND customerid = 'MYSHOP-KM2' AND paymenttype = 'INVOICE'
         AND totalamountpayable = c.invoice_total AND balance_due = c.residual
         AND tax_amount = 0.00 AND invoice_status = 'Overdue' AND journal_entry_id IS NULL
    ) THEN
      RAISE EXCEPTION '%: invoice % no longer matches the approved before-state', c.case_label, c.invoice_id;
    END IF;

    -- The large online transfer must already be recorded and active, so the
    -- contra completes settlement instead of double-counting.
    IF NOT EXISTS (
      SELECT 1 FROM payments
       WHERE payment_id = c.active_pmt_id AND invoice_id = c.invoice_id
         AND amount_paid = c.active_pmt_amt AND payment_method = c.active_method
         AND status = 'active'
    ) THEN
      RAISE EXCEPTION '%: the active RM% transfer (payment %) no longer matches',
        c.case_label, c.active_pmt_amt, c.active_pmt_id;
    END IF;

    IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = c.invoice_id AND payment_method = 'contra') THEN
      RAISE EXCEPTION '%: invoice % already has a contra payment', c.case_label, c.invoice_id;
    END IF;

    -- ----- Mutation: non-posting residual contra + close the invoice -----
    INSERT INTO payments (
      invoice_id, payment_date, amount_paid, payment_method,
      payment_reference, internal_reference, bank_account, journal_entry_id,
      notes, status, is_auto_collection, receipt_allocation_id
    ) VALUES (
      c.invoice_id, c.contra_date, c.residual, 'contra',
      c.cn_ref, 'CONTRA-MYSHOP-KM2-' || c.invoice_id, NULL, NULL,
      c.contra_note, 'active', false, NULL
    );

    UPDATE invoices SET balance_due = 0, invoice_status = 'paid' WHERE id = c.invoice_id;

    -- ----- Post-condition (invoice-level) -----
    IF NOT EXISTS (
      SELECT 1 FROM invoices WHERE id = c.invoice_id AND balance_due = 0 AND LOWER(invoice_status) = 'paid'
    ) THEN
      RAISE EXCEPTION '%: post-state invoice % is invalid', c.case_label, c.invoice_id;
    END IF;

    SELECT COALESCE(SUM(amount_paid), 0)::numeric(12,2) INTO v_active_paid
      FROM payments WHERE invoice_id = c.invoice_id AND (status IS NULL OR status = 'active');
    IF v_active_paid <> c.invoice_total THEN
      RAISE EXCEPTION '%: active payments on % total %, expected %',
        c.case_label, c.invoice_id, v_active_paid, c.invoice_total;
    END IF;

    RAISE NOTICE '% applied: invoice % MYSHOP-KM2 RM% contra (%); invoice closed',
      c.case_label, c.invoice_id, c.residual, c.cn_ref;
  END LOOP;

  -- ===== Pass 2: recompute credit_used once and verify the customer recon =====
  UPDATE customers cu
     SET credit_used = (
       SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
        WHERE i.customerid = cu.id
          AND i.paymenttype = 'INVOICE'
          AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
     )
   WHERE cu.id = 'MYSHOP-KM2';

  -- GL evidence: MYSHOP-KM2 has no 2026-01-01 checkpoint at 0.00 (its 2026-01-01
  -- anchor is 709.55); its LATEST anchor (2026-06-01 = 803.65) is fully netted by
  -- posted lines to a GL balance of 0.00, so pin the latest anchor (like CASE 18).
  SELECT as_of_date, amount INTO v_anchor_date, v_anchor_amt
    FROM account_opening_balances
   WHERE account_code = 'MYSHOP-KM2' AND as_of_date <= CURRENT_DATE
   ORDER BY as_of_date DESC LIMIT 1;
  IF v_anchor_date IS DISTINCT FROM DATE '2026-06-01' OR v_anchor_amt IS DISTINCT FROM 803.65 THEN
    RAISE EXCEPTION 'CASES 20-21: MYSHOP-KM2 latest opening anchor is % / %, expected 2026-06-01 / 803.65',
      v_anchor_date, v_anchor_amt;
  END IF;

  SELECT v_anchor_amt + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status = 'posted' AND jel.account_code = 'MYSHOP-KM2'
              AND je.entry_date >= v_anchor_date), 0)
    INTO v_gl_balance;
  IF v_gl_balance IS NULL OR ABS(v_gl_balance) > 0.005 THEN
    RAISE EXCEPTION 'CASES 20-21: MYSHOP-KM2 GL balance is %, expected 0.00 (would be a write-off, not a contra)', v_gl_balance;
  END IF;

  SELECT COALESCE(SUM(balance_due), 0)::numeric(12,2) INTO v_ops_open
    FROM invoices WHERE customerid = 'MYSHOP-KM2' AND paymenttype = 'INVOICE'
      AND LOWER(COALESCE(invoice_status, '')) <> 'cancelled';
  SELECT credit_used::numeric(12,2) INTO v_credit_used FROM customers WHERE id = 'MYSHOP-KM2';
  IF ABS(v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASES 20-21: MYSHOP-KM2 open-invoice total is %, expected 0.00', v_ops_open;
  END IF;
  IF ABS(v_gl_balance - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASES 20-21: MYSHOP-KM2 recon diff is %, expected 0.00', (v_gl_balance - v_ops_open);
  END IF;
  IF ABS(v_credit_used - v_ops_open) > 0.005 THEN
    RAISE EXCEPTION 'CASES 20-21: MYSHOP-KM2 credit_used % differs from open-invoice total %',
      v_credit_used, v_ops_open;
  END IF;

  RAISE NOTICE 'CASES 20-21 verified: MYSHOP-KM2 GL % = ops % (credit_used %)',
    v_gl_balance, v_ops_open, v_credit_used;
END $$;

COMMIT;

-- Verification (read-only)
SELECT id, customerid, paymenttype, balance_due, invoice_status, journal_entry_id
  FROM invoices
 WHERE id IN ('2004628', '2004559', '2004601', '33909', '34135', '2004297', '62959', '2004210', '62643', '013543',
              '62681', '34094', '62866', '2004275', '2004424', '2004285', '2004226', '026261',
              '62155', '62394', '62952')
 ORDER BY customerid, id;

SELECT payment_id, invoice_id, payment_date::date, amount_paid, payment_method,
       payment_reference, internal_reference, status, is_auto_collection, journal_entry_id
  FROM payments
 WHERE invoice_id IN ('2004628', '2004559', '2004601', '33909', '34135', '2004297', '62959', '2004210', '62643', '013543',
                      '62681', '34094', '62866', '2004275', '2004424', '2004285', '2004226', '026261',
                      '62155', '62394', '62952')
 ORDER BY invoice_id, payment_id;

SELECT id, credit_used FROM customers
 WHERE id IN ('AFRID', 'KY', '1M', 'SABANAH-S', 'ANGELA', 'MYSHOP-KD2', 'KOPI 148', 'KELUARGA', 'WONG-KM',
              '83 MM', 'BARAKAH', 'A&A', 'MING-P', 'TAY', 'NEVER-S', 'A MARKET', 'CLS',
              'UTEA', 'MYSHOP-KM2') ORDER BY id;
