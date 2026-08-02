-- Green Target: reconcile the ERP against the legacy ledger (phase GT-P8).
--
-- User's decision, 31 Jul 2026: THE LEGACY LEDGER IS THE SOURCE OF TRUTH. The
-- Green Target ERP was only ever used to issue e-Invoices, so its "open"
-- balances are not receivables - the sale and its counter-cash collection are
-- both already in the imported Jan-Jun ledger, and only the ERP never recorded
-- the payment.
--
-- Part A - link 13 customers to the legacy account whose description matches
--          their ERP name EXACTLY (not a lookalike). Master data only.
-- Part B - close 24 stale ERP invoices (RM5,270.00) with NON-POSTING historical
--          receipts. SINOFLEX keeps ONE bill open (2026/01000, RM230.00),
--          matching K-TRANSPORT's 30-Jun balance of exactly RM230.00.
--
-- This migration POSTS NO JOURNAL and MODIFIES NO JOURNAL. Every receipt it
-- writes is `origin = 'legacy_operational'` dated before the 2026-07-01
-- cutover, which `syncGTReceiptJournalEntry` explicitly refuses to post - the
-- same shape the GT-P1 migration already used for all 130 historical receipts.
-- The hash-pinned Jan-Jun ledger is provably untouched; re-run
-- verify-import.mjs (66 gates) and verify-chart.mjs (59 gates) after applying.
--
-- Guarded, idempotent and fail-closed: a second run is a clean no-op, and any
-- divergence from the evidence below aborts the whole transaction.

BEGIN;

-- Journal state before, so the closing assertion can prove nothing moved.
CREATE TEMP TABLE gt_recon_journal_baseline ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM greentarget.journal_entries)      AS journal_count,
  (SELECT COUNT(*) FROM greentarget.journal_entry_lines)  AS line_count,
  (SELECT COALESCE(SUM(total_debit), 0)
     FROM greentarget.journal_entries WHERE status = 'posted') AS posted_debit;

-- ---------------------------------------------------------------------------
-- Part A - 13 exact-name customer -> legacy account links
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE gt_recon_links (
  customer_name text NOT NULL,
  account_code  text NOT NULL
) ON COMMIT DROP;

INSERT INTO gt_recon_links (customer_name, account_code) VALUES
  ('SYARIKAT WARISAN',               'WARISAN'),
  ('SUTERA SERIMEWAH SDN BHD',       'SERIMEWAH'),
  ('EVER BEST ENGINEERING SDN BHD',  'CD-EVERBEST'),
  ('SINOFLEX LOGISTICS SDN BHD',     'K-TRANSPORT'),
  ('BIGWHEEL GREEN TYRES SDN BHD',   'BWL'),
  ('BONUSOON TRADING SDN BHD',       'BONUSOON'),
  ('FOREGAL WOOD PRODUCTS SDN BHD',  'FOREGAL'),
  ('GANSPACE EAST MALAYSIA SDN BHD', 'CD-GANSPACE'),
  ('KK EVENT HOUSE SDN BHD',         'CD-EVENT'),
  ('MAPS LOGISTICS (M) SDN BHD',     'CD-MAPS'),
  ('NEW TECH FURNITURE SDN BHD',     'CD-NEWTECH'),
  ('STELLAR PLASTIK SDN BHD',        'CD-STELLAR'),
  ('SUCCESS REALTY SDN BHD',         'CD-TRACY');

DO $$
DECLARE
  link         record;
  customer_row record;
  account_row  record;
  linked_count integer := 0;
BEGIN
  FOR link IN SELECT * FROM gt_recon_links LOOP
    -- Matched on the NORMALIZED name (the same rule the evidence used), because
    -- stored ERP names carry stray punctuation and trailing spaces - e.g.
    -- "SUTERA SERIMEWAH SDN BHD " has a trailing space. Customer ids are
    -- deliberately not used: they differ between dev and production.
    SELECT customer_id, name, debtor_account_code
      INTO customer_row
      FROM greentarget.customers
     WHERE UPPER(REGEXP_REPLACE(name, '[^A-Za-z0-9]', '', 'g'))
         = UPPER(REGEXP_REPLACE(link.customer_name, '[^A-Za-z0-9]', '', 'g'));
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GT-P8 aborted: customer "%" not found', link.customer_name;
    END IF;
    IF (SELECT COUNT(*) FROM greentarget.customers
         WHERE UPPER(REGEXP_REPLACE(name, '[^A-Za-z0-9]', '', 'g'))
             = UPPER(REGEXP_REPLACE(link.customer_name, '[^A-Za-z0-9]', '', 'g'))) <> 1 THEN
      RAISE EXCEPTION
        'GT-P8 aborted: customer name "%" is ambiguous', link.customer_name;
    END IF;

    SELECT code, description, ledger_type, is_active
      INTO account_row
      FROM greentarget.account_codes
     WHERE code = link.account_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GT-P8 aborted: account "%" not found', link.account_code;
    END IF;
    IF account_row.ledger_type <> 'TD' OR account_row.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'GT-P8 aborted: account "%" is not an active trade-debtor account',
        link.account_code;
    END IF;

    -- The evidence for this link IS the exact description match. Re-prove it
    -- here so a renamed customer or account can never be silently mis-linked.
    IF UPPER(REGEXP_REPLACE(account_row.description, '[^A-Za-z0-9]', '', 'g'))
       <> UPPER(REGEXP_REPLACE(customer_row.name,   '[^A-Za-z0-9]', '', 'g')) THEN
      RAISE EXCEPTION
        'GT-P8 aborted: "%" does not exactly match account % ("%")',
        customer_row.name, account_row.code, account_row.description;
    END IF;

    IF customer_row.debtor_account_code IS NULL THEN
      UPDATE greentarget.customers
         SET debtor_account_code = account_row.code
       WHERE customer_id = customer_row.customer_id;
      linked_count := linked_count + 1;
    ELSIF customer_row.debtor_account_code <> account_row.code THEN
      RAISE EXCEPTION
        'GT-P8 aborted: customer "%" is already linked to % (expected %)',
        customer_row.name, customer_row.debtor_account_code, account_row.code;
    END IF;
  END LOOP;

  RAISE NOTICE 'GT-P8 part A: % customer link(s) written (0 on a re-run)', linked_count;
END
$$;

-- ---------------------------------------------------------------------------
-- Part B - 24 stale ERP invoices closed by NON-POSTING historical receipts
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE gt_recon_invoices (
  invoice_number text NOT NULL,
  customer_name  text NOT NULL,
  amount         numeric(10,2) NOT NULL
) ON COMMIT DROP;

INSERT INTO gt_recon_invoices (invoice_number, customer_name, amount) VALUES
  -- FOREGAL WOOD PRODUCTS - legacy balance 0.00, all 5 already collected
  ('2026/00098',    'FOREGAL WOOD PRODUCTS SDN BHD', 180.00),
  ('2026/00099',    'FOREGAL WOOD PRODUCTS SDN BHD', 180.00),
  ('2026/00221',    'FOREGAL WOOD PRODUCTS SDN BHD', 180.00),
  ('2026/00327',    'FOREGAL WOOD PRODUCTS SDN BHD', 180.00),
  ('2026/00498',    'FOREGAL WOOD PRODUCTS SDN BHD', 180.00),
  -- MEKAR INDAH JADI - no legacy account at all, so no recorded receivable
  ('2025/01842',    'MEKAR INDAH JADI',              230.00),
  -- NEW TECH FURNITURE - legacy balance 0.00
  ('2025/02258(a)', 'NEW TECH FURNITURE SDN BHD',    230.00),
  ('2026/00223',    'NEW TECH FURNITURE SDN BHD',    230.00),
  ('2026/00391',    'NEW TECH FURNITURE SDN BHD',    230.00),
  -- SINOFLEX LOGISTICS - K-TRANSPORT carried 230.00 at 30 Jun, i.e. exactly
  -- ONE bill. Under FIFO the newest is the one still open, so 2026/01000
  -- (29 Jun) is deliberately ABSENT from this list and stays outstanding.
  ('2026/00005',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00020',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00022',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00029',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00113',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00164',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00356',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00404',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00501',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00509',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00520',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00562',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  ('2026/00617',    'SINOFLEX LOGISTICS SDN BHD',    230.00),
  -- YNH JAYA MARKETING - no legacy account at all
  ('2026/00255',    'YNH JAYA MARKETING SDN BHD',    230.00),
  ('2026/00616',    'YNH JAYA MARKETING SDN BHD',    230.00);

DO $$
DECLARE
  target        record;
  invoice_row   record;
  new_receipt   integer;
  reference_key text;
  closed_count  integer := 0;
BEGIN
  IF (SELECT COUNT(*) FROM gt_recon_invoices) <> 24 THEN
    RAISE EXCEPTION 'GT-P8 aborted: expected 24 stale invoices, found %',
      (SELECT COUNT(*) FROM gt_recon_invoices);
  END IF;
  IF (SELECT SUM(amount) FROM gt_recon_invoices) <> 5270.00 THEN
    RAISE EXCEPTION 'GT-P8 aborted: expected RM5,270.00 of stale invoices, found %',
      (SELECT SUM(amount) FROM gt_recon_invoices);
  END IF;
  IF EXISTS (SELECT 1 FROM gt_recon_invoices WHERE invoice_number = '2026/01000') THEN
    RAISE EXCEPTION
      'GT-P8 aborted: 2026/01000 must stay open (it is K-TRANSPORT''s 30-Jun balance)';
  END IF;

  FOR target IN SELECT * FROM gt_recon_invoices ORDER BY invoice_number LOOP
    SELECT i.invoice_id, i.invoice_number, i.customer_id, i.date_issued,
           i.total_amount, i.balance_due, i.status, i.journal_entry_id, c.name
      INTO invoice_row
      FROM greentarget.invoices i
      JOIN greentarget.customers c ON c.customer_id = i.customer_id
     WHERE i.invoice_number = target.invoice_number
     FOR UPDATE OF i;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GT-P8 aborted: invoice % not found', target.invoice_number;
    END IF;
    IF UPPER(REGEXP_REPLACE(invoice_row.name, '[^A-Za-z0-9]', '', 'g'))
       <> UPPER(REGEXP_REPLACE(target.customer_name, '[^A-Za-z0-9]', '', 'g')) THEN
      RAISE EXCEPTION
        'GT-P8 aborted: invoice % belongs to "%" but the evidence says "%"',
        target.invoice_number, invoice_row.name, target.customer_name;
    END IF;

    reference_key := 'RECON/' || target.invoice_number;

    -- Idempotency: a completed row is left exactly as it is.
    IF EXISTS (
      SELECT 1 FROM greentarget.receipts
       WHERE UPPER(TRIM(display_reference)) = UPPER(reference_key)
    ) THEN
      CONTINUE;
    END IF;

    IF invoice_row.status = 'cancelled' THEN
      RAISE EXCEPTION 'GT-P8 aborted: invoice % is cancelled', target.invoice_number;
    END IF;
    IF invoice_row.balance_due <> target.amount THEN
      RAISE EXCEPTION
        'GT-P8 aborted: invoice % has balance % but the evidence says %',
        target.invoice_number, invoice_row.balance_due, target.amount;
    END IF;
    IF invoice_row.date_issued >= DATE '2026-07-01' THEN
      RAISE EXCEPTION
        'GT-P8 aborted: invoice % is dated on/after the cutover and is not stale history',
        target.invoice_number;
    END IF;
    IF EXISTS (
      SELECT 1 FROM greentarget.payments p
       WHERE p.invoice_id = invoice_row.invoice_id
         AND (p.status IS NULL OR p.status <> 'cancelled')
    ) THEN
      RAISE EXCEPTION
        'GT-P8 aborted: invoice % already has a live payment', target.invoice_number;
    END IF;
    IF EXISTS (
      SELECT 1 FROM greentarget.adjustment_documents
       WHERE original_invoice_id = invoice_row.invoice_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION
        'GT-P8 aborted: invoice % has an active adjustment document',
        target.invoice_number;
    END IF;

    -- A pre-cutover `legacy_operational` receipt: the counter cash the legacy
    -- ledger already recorded and banked. journal_entry_id stays NULL, so this
    -- posts nothing and the locked Jan-Jun ledger is untouched.
    INSERT INTO greentarget.receipts (
      display_reference, received_date, posting_date, payment_method,
      payment_reference, bank_account, status, origin, total_amount,
      journal_entry_id, created_by, updated_by
    ) VALUES (
      reference_key, invoice_row.date_issued, invoice_row.date_issued, 'cash',
      NULL, 'PBB_1', 'posted', 'legacy_operational', target.amount,
      NULL, 'gt-p8-erp-ledger-recon', 'gt-p8-erp-ledger-recon'
    )
    RETURNING id INTO new_receipt;

    INSERT INTO greentarget.payments (
      invoice_id, payment_date, amount_paid, payment_method,
      payment_reference, internal_reference, status, receipt_id,
      bank_account, journal_entry_id
    ) VALUES (
      invoice_row.invoice_id, invoice_row.date_issued, target.amount, 'cash',
      NULL, reference_key, 'active', new_receipt,
      'PBB_1', NULL
    );

    UPDATE greentarget.invoices
       SET balance_due = 0, status = 'paid'
     WHERE invoice_id = invoice_row.invoice_id;

    closed_count := closed_count + 1;
  END LOOP;

  RAISE NOTICE 'GT-P8 part B: % invoice(s) closed (0 on a re-run)', closed_count;
END
$$;

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  still_open_count  integer;
  still_open_total  numeric(12,2);
  baseline          record;
BEGIN
  -- All 24 are closed.
  IF EXISTS (
    SELECT 1
      FROM gt_recon_invoices t
      JOIN greentarget.invoices i ON i.invoice_number = t.invoice_number
     WHERE i.balance_due <> 0 OR i.status <> 'paid'
  ) THEN
    RAISE EXCEPTION 'GT-P8 aborted: a target invoice is still open';
  END IF;

  -- 2026/01000 is the ONLY survivor of the original 25, at exactly RM230.00,
  -- which is K-TRANSPORT's 1-Jul opening balance.
  SELECT COUNT(*), COALESCE(SUM(balance_due), 0)
    INTO still_open_count, still_open_total
    FROM greentarget.invoices
   WHERE status <> 'cancelled'
     AND balance_due > 0
     AND date_issued < DATE '2026-07-01';
  IF still_open_count <> 1 OR still_open_total <> 230.00 THEN
    RAISE EXCEPTION
      'GT-P8 aborted: expected 1 open pre-cutover invoice of RM230.00, found % of RM%',
      still_open_count, still_open_total;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM greentarget.invoices
     WHERE invoice_number = '2026/01000' AND balance_due = 230.00 AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'GT-P8 aborted: 2026/01000 is not the surviving open invoice';
  END IF;

  -- All 13 links landed.
  IF EXISTS (
    SELECT 1
      FROM gt_recon_links l
      JOIN greentarget.customers c
        ON UPPER(REGEXP_REPLACE(c.name, '[^A-Za-z0-9]', '', 'g'))
         = UPPER(REGEXP_REPLACE(l.customer_name, '[^A-Za-z0-9]', '', 'g'))
     WHERE c.debtor_account_code IS DISTINCT FROM l.account_code
  ) THEN
    RAISE EXCEPTION 'GT-P8 aborted: a customer link did not take effect';
  END IF;

  -- Nothing was posted, changed or cancelled in the ledger.
  SELECT * INTO baseline FROM gt_recon_journal_baseline;
  IF (SELECT COUNT(*) FROM greentarget.journal_entries) <> baseline.journal_count
     OR (SELECT COUNT(*) FROM greentarget.journal_entry_lines) <> baseline.line_count
     OR (SELECT COALESCE(SUM(total_debit), 0) FROM greentarget.journal_entries
          WHERE status = 'posted') <> baseline.posted_debit THEN
    RAISE EXCEPTION 'GT-P8 aborted: the general ledger changed; it must not';
  END IF;

  -- Every receipt this migration writes must be non-posting.
  IF EXISTS (
    SELECT 1 FROM greentarget.receipts
     WHERE created_by = 'gt-p8-erp-ledger-recon'
       AND (journal_entry_id IS NOT NULL OR origin <> 'legacy_operational')
  ) THEN
    RAISE EXCEPTION 'GT-P8 aborted: a reconciliation receipt owns a journal';
  END IF;

  RAISE NOTICE 'GT-P8 assertions passed.';
END
$$;

COMMIT;
