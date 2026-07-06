-- ============================================================================
-- Data fix: phantom auto-payments left active by the CASH->INVOICE
-- payment-type conversion bug (note-text mismatch: the conversion looked for
-- notes LIKE '%Automatic payment%' but the invoice form writes
-- 'Payment automatically recorded for CASH invoices').
--
-- Run AFTER deploying the code fix in:
--   src/routes/sales/invoices/invoices.js  (PUT /:id/paymenttype)
--   src/routes/sales/invoices/payments.js  (PUT /:payment_id/cancel)
--   src/routes/jellypolly/invoices.js / payments.js (same fixes)
--
-- Idempotent: safe to re-run.
--
-- Affected invoices:
--   015375  - keyed as CASH on 30/6, converted to INVOICE. Customer still owes
--             RM 34. Cancelling the phantom payment inflated balance to RM 68.
--             All payments recorded on it are phantom/correction attempts, so
--             every active payment is cancelled and the balance restored to
--             the full total (RM 34, Unpaid).
--   34123, 2004040, 026498, 026214
--           - same conversion bug historically; each still carries an ACTIVE
--             phantom auto-payment on top of the real payment that settled it
--             (active payments = 2x invoice total). Only the phantom
--             auto-payment is cancelled; balance stays 0 / paid.
--             >>> Confirm with accounts that each of these was settled by the
--             customer ONCE before running. <<<
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- BEFORE snapshot (for the run log)
-- ---------------------------------------------------------------------------
SELECT 'BEFORE' AS phase, i.id, i.paymenttype, i.invoice_status, i.totalamountpayable,
       i.balance_due,
       COALESCE(SUM(p.amount_paid) FILTER (WHERE p.status = 'active' OR p.status IS NULL), 0) AS active_paid
FROM invoices i
LEFT JOIN payments p ON p.invoice_id = i.id
WHERE i.id IN ('015375', '34123', '2004040', '026498', '026214')
GROUP BY i.id
ORDER BY i.id;

-- ---------------------------------------------------------------------------
-- 1. Invoice 015375: cancel ALL active payments (phantom + correction
--    attempts) and reverse their posted receipt journals
-- ---------------------------------------------------------------------------
WITH cancelled AS (
  UPDATE payments
     SET status = 'cancelled',
         cancellation_date = NOW(),
         cancellation_reason = 'Data fix: phantom/correction payment from CASH-to-INVOICE conversion bug (invoice 015375)'
   WHERE invoice_id = '015375'
     AND (status IS NULL OR status = 'active')
  RETURNING payment_id, journal_entry_id
)
UPDATE journal_entries je
   SET status = 'cancelled',
       updated_at = NOW()
  FROM cancelled c
 WHERE je.id = c.journal_entry_id
   AND je.entry_type = 'REC'
   AND je.status = 'posted';

-- Restore the true state: customer owes the full RM 34
UPDATE invoices
   SET balance_due = totalamountpayable,
       invoice_status = 'Unpaid'
 WHERE id = '015375';

-- ---------------------------------------------------------------------------
-- 2. Older invoices: cancel only the phantom auto-payment (the real payment
--    stays active; balance remains 0 / paid)
-- ---------------------------------------------------------------------------
WITH cancelled AS (
  UPDATE payments
     SET status = 'cancelled',
         cancellation_date = NOW(),
         cancellation_reason = 'Data fix: phantom auto-payment left active by CASH-to-INVOICE conversion bug'
   WHERE invoice_id IN ('34123', '2004040', '026498', '026214')
     AND (status IS NULL OR status = 'active')
     AND notes LIKE 'Payment automatically recorded%'
  RETURNING payment_id, journal_entry_id
)
UPDATE journal_entries je
   SET status = 'cancelled',
       updated_at = NOW()
  FROM cancelled c
 WHERE je.id = c.journal_entry_id
   AND je.entry_type = 'REC'
   AND je.status = 'posted';

-- ---------------------------------------------------------------------------
-- 3. Recompute credit_used for the affected customers from their open
--    INVOICE-type balances (the bug also skewed credit_used via the
--    conversion/cancellation cycles)
-- ---------------------------------------------------------------------------
UPDATE customers c
   SET credit_used = COALESCE((
         SELECT SUM(i.balance_due)
           FROM invoices i
          WHERE i.customerid = c.id
            AND i.paymenttype = 'INVOICE'
            AND i.invoice_status <> 'cancelled'
       ), 0)
 WHERE c.id IN (
         SELECT DISTINCT customerid
           FROM invoices
          WHERE id IN ('015375', '34123', '2004040', '026498', '026214')
       );

-- ---------------------------------------------------------------------------
-- AFTER snapshot: for every listed invoice, balance_due + active payments
-- must equal the invoice total
-- ---------------------------------------------------------------------------
SELECT 'AFTER' AS phase, i.id, i.paymenttype, i.invoice_status, i.totalamountpayable,
       i.balance_due,
       COALESCE(SUM(p.amount_paid) FILTER (WHERE p.status = 'active' OR p.status IS NULL), 0) AS active_paid
FROM invoices i
LEFT JOIN payments p ON p.invoice_id = i.id
WHERE i.id IN ('015375', '34123', '2004040', '026498', '026214')
GROUP BY i.id
ORDER BY i.id;

SELECT 'AFTER credit' AS phase, c.id, c.credit_used,
       (SELECT COALESCE(SUM(balance_due), 0)
          FROM invoices
         WHERE customerid = c.id AND paymenttype = 'INVOICE'
           AND invoice_status <> 'cancelled') AS open_balance
FROM customers c
WHERE c.id IN (
        SELECT DISTINCT customerid
          FROM invoices
         WHERE id IN ('015375', '34123', '2004040', '026498', '026214')
      );

COMMIT;
