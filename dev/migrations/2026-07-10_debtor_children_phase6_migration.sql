-- =============================================================================
-- 2026-07-10_debtor_children_phase6_migration.sql
-- Phase 6: rewrite historical receivable (TR) journal lines to each customer's
-- DEBTOR child account, so every customer's Account Ledger shows their real
-- invoice / receipt / adjustment history. Follows
-- docs/Account/CUSTOMER_DEBTOR_SUBLEDGER_JOURNALS_HANDOVER.md.
--
--   * Ensures a debtor child exists for every customer id referenced by
--     invoices/receipt allocations/adjustments (deleted customers get a child
--     named after the id) using the same candidate rule as debtorSync.js
--     (code = id, then -D, -D2...).
--   * Rewrites TR lines via the journal source links (Phase 1 backfill):
--       'invoice'      -> invoices.customerid
--       'receipt'      -> the matching allocation's customer (credit lines are
--                         paired to invoice-type allocations by rank)
--       'payment'      -> payments -> invoices.customerid (legacy pre-cutover)
--       'adjustment'   -> adjustment_documents.customerid
--     Cancelled journals are rewritten too (handover: keep history consistent).
--     jp_adjustment journals keep TR. Manual journals keep TR.
--   * Verifies: no mappable TR line remains; total rewritten DR/CR conserved;
--     the C-CARE(1) June bridge (8,748.00 + 9,835.00 - 6,795.00 = 11,788.00).
--
-- Idempotent: rewritten lines no longer match account_code='TR'.
-- Execution: docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
--              < dev/migrations/2026-07-10_debtor_children_phase6_migration.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure debtor children for every referenced customer id.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  cust RECORD;
  v_code TEXT;
  v_candidate TEXT;
  v_n INTEGER;
BEGIN
  FOR cust IN
    SELECT DISTINCT cid, COALESCE(c.name, cid) AS cname
      FROM (
        SELECT i.customerid AS cid FROM invoices i
         WHERE i.journal_entry_id IS NOT NULL AND i.customerid IS NOT NULL
        UNION
        SELECT ra.customer_id FROM receipt_allocations ra WHERE ra.customer_id IS NOT NULL
        UNION
        SELECT p.invoice_id_customer FROM (
          SELECT i2.customerid AS invoice_id_customer
            FROM payments p2 JOIN invoices i2 ON i2.id = p2.invoice_id
           WHERE p2.journal_entry_id IS NOT NULL
        ) p
        UNION
        SELECT ad.customerid FROM adjustment_documents ad WHERE ad.customerid IS NOT NULL
      ) refs
      LEFT JOIN customers c ON c.id = refs.cid
     WHERE refs.cid IS NOT NULL
  LOOP
    -- resolve existing child (code = id / -D / -Dn under DEBTOR)
    SELECT code INTO v_code FROM account_codes
     WHERE parent_code = 'DEBTOR'
       AND (code = cust.cid OR code LIKE cust.cid || '-D%')
     ORDER BY (code = cust.cid) DESC, code
     LIMIT 1;
    IF v_code IS NOT NULL THEN
      UPDATE account_codes SET is_active = TRUE, updated_at = NOW()
       WHERE code = v_code AND parent_code = 'DEBTOR' AND is_active = FALSE;
      CONTINUE;
    END IF;

    -- create: first free candidate
    v_candidate := cust.cid;
    v_n := 0;
    WHILE EXISTS (SELECT 1 FROM account_codes WHERE code = v_candidate) LOOP
      v_n := v_n + 1;
      v_candidate := cust.cid || CASE WHEN v_n = 1 THEN '-D' ELSE '-D' || v_n END;
      IF v_n > 50 THEN
        RAISE EXCEPTION 'No available debtor code for %', cust.cid;
      END IF;
    END LOOP;
    INSERT INTO account_codes (code, description, ledger_type, parent_code, level, sort_order, is_active, is_system, fs_note)
    VALUES (v_candidate, cust.cname, 'TD', 'DEBTOR', 2,
            (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM account_codes WHERE parent_code = 'DEBTOR'),
            TRUE, FALSE, '22');
  END LOOP;
END $$;

-- Helper mapping: customer id -> debtor child code (session temp view).
CREATE OR REPLACE VIEW pg_temp.debtor_map AS
SELECT DISTINCT ON (refs.cid) refs.cid AS customer_id, ac.code AS debtor_code
  FROM (SELECT DISTINCT customerid AS cid FROM invoices WHERE customerid IS NOT NULL
        UNION SELECT DISTINCT customer_id FROM receipt_allocations WHERE customer_id IS NOT NULL
        UNION SELECT DISTINCT customerid FROM adjustment_documents WHERE customerid IS NOT NULL) refs
  JOIN account_codes ac
    ON ac.parent_code = 'DEBTOR'
   AND (ac.code = refs.cid OR ac.code LIKE refs.cid || '-D%')
 ORDER BY refs.cid, (ac.code = refs.cid) DESC, ac.code;

-- -----------------------------------------------------------------------------
-- 2a. Invoice-owned S journals: every TR line -> the invoice's customer child.
-- -----------------------------------------------------------------------------
UPDATE journal_entry_lines jel
   SET account_code = dm.debtor_code
  FROM journal_entries je, invoices i, pg_temp.debtor_map dm
 WHERE jel.journal_entry_id = je.id
   AND jel.account_code = 'TR'
   AND je.source_type = 'invoice' AND je.source_id = i.id
   AND dm.customer_id = i.customerid;

-- -----------------------------------------------------------------------------
-- 2b. Receipt journals: TR credit lines paired to invoice-type allocations by
--     rank within each journal (both were written in allocation order).
-- -----------------------------------------------------------------------------
WITH tr_lines AS (
  SELECT jel.id AS line_id, je.source_id::int AS receipt_id,
         ROW_NUMBER() OVER (PARTITION BY je.id ORDER BY jel.line_number) AS rn
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
   WHERE jel.account_code = 'TR'
     AND je.source_type = 'receipt'
), allocs AS (
  SELECT ra.receipt_id, ra.customer_id,
         ROW_NUMBER() OVER (PARTITION BY ra.receipt_id ORDER BY ra.line_number) AS rn
    FROM receipt_allocations ra
   WHERE ra.allocation_type = 'invoice'
)
UPDATE journal_entry_lines jel
   SET account_code = dm.debtor_code
  FROM tr_lines t
  JOIN allocs a ON a.receipt_id = t.receipt_id AND a.rn = t.rn
  JOIN pg_temp.debtor_map dm ON dm.customer_id = a.customer_id
 WHERE jel.id = t.line_id;

-- -----------------------------------------------------------------------------
-- 2c. Legacy payment-owned REC journals (pre-cutover): TR lines -> the paying
--     invoice's customer child.
-- -----------------------------------------------------------------------------
UPDATE journal_entry_lines jel
   SET account_code = dm.debtor_code
  FROM journal_entries je, payments p, invoices i, pg_temp.debtor_map dm
 WHERE jel.journal_entry_id = je.id
   AND jel.account_code = 'TR'
   AND je.source_type = 'payment' AND je.source_id = p.payment_id::text
   AND i.id = p.invoice_id
   AND dm.customer_id = i.customerid;

-- -----------------------------------------------------------------------------
-- 2d. Adjustment journals (TH): TR lines -> the document's customer child.
-- -----------------------------------------------------------------------------
UPDATE journal_entry_lines jel
   SET account_code = dm.debtor_code
  FROM journal_entries je, adjustment_documents ad, pg_temp.debtor_map dm
 WHERE jel.journal_entry_id = je.id
   AND jel.account_code = 'TR'
   AND je.source_type = 'adjustment' AND je.source_id = ad.id
   AND dm.customer_id = ad.customerid;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
\echo '=== Remaining TR lines by journal source (mappable must be manual/jp only) ==='
SELECT COALESCE(je.source_type, 'manual') AS source_type, je.status, COUNT(*) AS tr_lines
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
 WHERE jel.account_code = 'TR'
 GROUP BY 1, 2 ORDER BY 1, 2;

\echo '=== C-CARE(1) June bridge: expect DR 9835.00 / CR 6795.00 / closing 11788.00 ==='
SELECT SUM(jel.debit_amount)::numeric(12,2) AS june_dr,
       SUM(jel.credit_amount)::numeric(12,2) AS june_cr,
       (8748.00 + SUM(jel.debit_amount) - SUM(jel.credit_amount))::numeric(12,2) AS closing
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
 WHERE je.status = 'posted' AND jel.account_code = 'C-CARE(1)'
   AND je.entry_date >= DATE '2026-06-01' AND je.entry_date < DATE '2026-07-01';

\echo '=== Posted journals must all still balance ==='
SELECT COUNT(*) AS unbalanced
  FROM (SELECT jel.journal_entry_id
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
         WHERE je.status = 'posted'
         GROUP BY 1
        HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.005) x;
