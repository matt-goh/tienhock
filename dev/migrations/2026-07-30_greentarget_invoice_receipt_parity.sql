-- Green Target invoice / receipt accounting parity.
--
-- Phase GT-P1:
--   * snapshot the receivable and revenue account selected for each invoice;
--   * map a customer to its default trade-debtor account;
--   * promote the existing payment allocation rows into a real receipt-header
--     model, so one GT reference owns one status and one consolidated journal.
--
-- This migration is intentionally data-preserving. Historical operational
-- payment rows are grouped into headers but do not receive journals; the
-- imported Jan-Jun ledger remains authoritative. July journal creation is a
-- separate guarded backfill after customer/account mappings are approved.

\set ON_ERROR_STOP on

BEGIN;

-- A normalized reference is one durable receipt identity. Fail before any
-- schema change if the legacy allocations cannot form one unambiguous header.
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM (
        SELECT UPPER(TRIM(p.internal_reference)) AS reference_key
          FROM greentarget.payments p
         WHERE COALESCE(TRIM(p.internal_reference), '') <> ''
         GROUP BY UPPER(TRIM(p.internal_reference)),
                  p.payment_date,
                  p.payment_method
      ) payment_shapes
     GROUP BY payment_shapes.reference_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'GT invoice/receipt migration aborted: a normalized payment reference spans multiple payment dates or methods';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM greentarget.payments p
     WHERE COALESCE(TRIM(p.internal_reference), '') <> ''
     GROUP BY UPPER(TRIM(p.internal_reference)),
              p.payment_date,
              p.payment_method
    HAVING COUNT(DISTINCT COALESCE(p.status, 'active')) > 1
  ) THEN
    RAISE EXCEPTION
      'GT invoice/receipt migration aborted: allocations for one receipt have mixed statuses';
  END IF;
END
$guard$;

ALTER TABLE greentarget.customers
  ADD COLUMN IF NOT EXISTS debtor_account_code varchar(50);

ALTER TABLE greentarget.invoices
  ADD COLUMN IF NOT EXISTS debtor_account_code varchar(50),
  ADD COLUMN IF NOT EXISTS revenue_account_code varchar(50);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE connamespace = 'greentarget'::regnamespace
       AND conname = 'gt_customers_debtor_account_code_fkey'
  ) THEN
    ALTER TABLE greentarget.customers
      ADD CONSTRAINT gt_customers_debtor_account_code_fkey
      FOREIGN KEY (debtor_account_code)
      REFERENCES greentarget.account_codes(code)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE connamespace = 'greentarget'::regnamespace
       AND conname = 'gt_invoices_debtor_account_code_fkey'
  ) THEN
    ALTER TABLE greentarget.invoices
      ADD CONSTRAINT gt_invoices_debtor_account_code_fkey
      FOREIGN KEY (debtor_account_code)
      REFERENCES greentarget.account_codes(code)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE connamespace = 'greentarget'::regnamespace
       AND conname = 'gt_invoices_revenue_account_code_fkey'
  ) THEN
    ALTER TABLE greentarget.invoices
      ADD CONSTRAINT gt_invoices_revenue_account_code_fkey
      FOREIGN KEY (revenue_account_code)
      REFERENCES greentarget.account_codes(code)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE connamespace = 'greentarget'::regnamespace
       AND conname = 'gt_invoices_revenue_account_code_check'
  ) THEN
    ALTER TABLE greentarget.invoices
      ADD CONSTRAINT gt_invoices_revenue_account_code_check
      CHECK (
        revenue_account_code IS NULL
        OR revenue_account_code IN ('TGA', 'TGB', 'WS_OTH')
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_gt_customers_debtor_account
  ON greentarget.customers(debtor_account_code);

CREATE INDEX IF NOT EXISTS idx_gt_invoices_debtor_account
  ON greentarget.invoices(debtor_account_code);

CREATE INDEX IF NOT EXISTS idx_gt_invoices_revenue_account
  ON greentarget.invoices(revenue_account_code);

-- Preserve the account choices already evidenced by an existing S journal.
-- The debtor value may still be CD_SD here; the later controlled CD_SD split
-- replaces only mappings that can be tied to an evidenced child account.
UPDATE greentarget.invoices i
   SET debtor_account_code = resolved.debtor_account_code,
       revenue_account_code = resolved.revenue_account_code
  FROM (
    SELECT i2.invoice_id,
           (
             SELECT jel.account_code
               FROM greentarget.journal_entry_lines jel
               JOIN greentarget.account_codes ac ON ac.code = jel.account_code
              WHERE jel.journal_entry_id = i2.journal_entry_id
                AND jel.debit_amount > 0
                AND ac.ledger_type = 'TD'
              ORDER BY jel.line_number, jel.id
              LIMIT 1
           ) AS debtor_account_code,
           (
             SELECT jel.account_code
               FROM greentarget.journal_entry_lines jel
              WHERE jel.journal_entry_id = i2.journal_entry_id
                AND jel.credit_amount > 0
                AND jel.account_code IN ('TGA', 'TGB', 'WS_OTH')
              ORDER BY jel.line_number, jel.id
              LIMIT 1
           ) AS revenue_account_code
      FROM greentarget.invoices i2
     WHERE i2.journal_entry_id IS NOT NULL
  ) resolved
 WHERE resolved.invoice_id = i.invoice_id
   AND (resolved.debtor_account_code IS NOT NULL
        OR resolved.revenue_account_code IS NOT NULL);

CREATE TABLE IF NOT EXISTS greentarget.receipts (
  id                    serial PRIMARY KEY,
  display_reference     varchar(50) NOT NULL,
  received_date         date NOT NULL,
  posting_date          date,
  payment_method        varchar(30) NOT NULL,
  payment_reference     varchar(50),
  bank_account          varchar(50) NOT NULL DEFAULT 'PBB_1',
  status                varchar(20) NOT NULL,
  origin                varchar(30) NOT NULL DEFAULT 'erp',
  total_amount          numeric(14,2) NOT NULL,
  journal_entry_id      integer,
  created_at            timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by            varchar(100),
  updated_at            timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by            varchar(100),
  cancellation_date     timestamp without time zone,
  cancellation_reason   text,
  CONSTRAINT gt_receipts_payment_method_check
    CHECK (payment_method IN ('cash', 'cheque', 'bank_transfer', 'online')),
  CONSTRAINT gt_receipts_status_check
    CHECK (status IN ('pending', 'posted', 'cancelled')),
  CONSTRAINT gt_receipts_origin_check
    CHECK (origin IN ('erp', 'legacy_operational')),
  CONSTRAINT gt_receipts_total_amount_check
    CHECK (total_amount > 0),
  CONSTRAINT gt_receipts_bank_account_fkey
    FOREIGN KEY (bank_account)
    REFERENCES greentarget.account_codes(code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT gt_receipts_journal_entry_id_fkey
    FOREIGN KEY (journal_entry_id)
    REFERENCES greentarget.journal_entries(id)
    ON DELETE RESTRICT,
  CONSTRAINT gt_receipts_journal_entry_id_key UNIQUE (journal_entry_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS gt_receipts_display_reference_uq
  ON greentarget.receipts (UPPER(TRIM(display_reference)));

CREATE INDEX IF NOT EXISTS idx_gt_receipts_received_date
  ON greentarget.receipts(received_date);

CREATE INDEX IF NOT EXISTS idx_gt_receipts_status
  ON greentarget.receipts(status);

ALTER TABLE greentarget.payments
  ADD COLUMN IF NOT EXISTS receipt_id integer;

-- All rows sharing the visible legacy receipt identity become allocations of
-- one header. A cancelled reference remains reserved because the header is
-- retained and the expression index covers every status.
WITH payment_groups AS (
  SELECT UPPER(TRIM(p.internal_reference)) AS reference_key,
         MIN(TRIM(p.internal_reference)) AS display_reference,
         p.payment_date AS received_date,
         p.payment_method,
         MIN(NULLIF(TRIM(p.payment_reference), '')) AS payment_reference,
         CASE
           WHEN BOOL_AND(p.status = 'cancelled') THEN 'cancelled'
           WHEN BOOL_OR(p.status = 'pending') THEN 'pending'
           ELSE 'posted'
         END AS receipt_status,
         CASE
           WHEN p.payment_date < DATE '2026-07-01' THEN 'legacy_operational'
           ELSE 'erp'
         END AS origin,
         SUM(p.amount_paid)::numeric(14,2) AS total_amount,
         MIN(p.journal_entry_id) FILTER (WHERE p.journal_entry_id IS NOT NULL)
           AS journal_entry_id,
         MIN(p.cancellation_date) AS cancellation_date,
         MIN(p.cancellation_reason) AS cancellation_reason
    FROM greentarget.payments p
   WHERE COALESCE(TRIM(p.internal_reference), '') <> ''
   GROUP BY UPPER(TRIM(p.internal_reference)), p.payment_date, p.payment_method
), inserted AS (
  INSERT INTO greentarget.receipts (
    display_reference, received_date, posting_date, payment_method,
    payment_reference, bank_account, status, origin, total_amount,
    journal_entry_id, cancellation_date, cancellation_reason
  )
  SELECT pg.display_reference,
         pg.received_date,
         CASE WHEN pg.receipt_status = 'posted' THEN pg.received_date ELSE NULL END,
         pg.payment_method,
         pg.payment_reference,
         'PBB_1',
         pg.receipt_status,
         pg.origin,
         pg.total_amount,
         pg.journal_entry_id,
         pg.cancellation_date,
         pg.cancellation_reason
    FROM payment_groups pg
   WHERE NOT EXISTS (
     SELECT 1
       FROM greentarget.receipts r
      WHERE UPPER(TRIM(r.display_reference)) = pg.reference_key
   )
  RETURNING id, UPPER(TRIM(display_reference)) AS reference_key
)
SELECT COUNT(*) FROM inserted;

UPDATE greentarget.payments p
   SET receipt_id = r.id,
       bank_account = COALESCE(p.bank_account, r.bank_account),
       journal_entry_id = COALESCE(p.journal_entry_id, r.journal_entry_id)
  FROM greentarget.receipts r
 WHERE p.receipt_id IS NULL
   AND COALESCE(TRIM(p.internal_reference), '') <> ''
   AND UPPER(TRIM(p.internal_reference)) = UPPER(TRIM(r.display_reference));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM greentarget.payments WHERE receipt_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'GT invoice/receipt migration aborted: payment rows remain without receipt headers';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM greentarget.receipts r
      JOIN (
        SELECT receipt_id, SUM(amount_paid)::numeric(14,2) AS allocated
          FROM greentarget.payments
         GROUP BY receipt_id
      ) p ON p.receipt_id = r.id
     WHERE p.allocated <> r.total_amount
  ) THEN
    RAISE EXCEPTION
      'GT invoice/receipt migration aborted: receipt totals do not match allocations';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE connamespace = 'greentarget'::regnamespace
       AND conname = 'gt_payments_receipt_id_fkey'
  ) THEN
    ALTER TABLE greentarget.payments
      ADD CONSTRAINT gt_payments_receipt_id_fkey
      FOREIGN KEY (receipt_id)
      REFERENCES greentarget.receipts(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

ALTER TABLE greentarget.payments
  ALTER COLUMN receipt_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gt_payments_receipt
  ON greentarget.payments(receipt_id);

COMMIT;
