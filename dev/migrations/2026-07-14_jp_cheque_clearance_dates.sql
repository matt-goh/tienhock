-- Jelly Polly cheque timing foundation.
-- payment_date remains the date the payment/cheque was received.
-- posting_date is the accounting/report date and stays NULL while a cheque is
-- pending. Historical cleared-cheque dates are not invented: old active cheque
-- rows remain NULL and report queries fall back to their received date.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE jellypolly.payments
  ADD COLUMN IF NOT EXISTS posting_date DATE;

COMMENT ON COLUMN jellypolly.payments.posting_date IS
  'Accounting/report date. NULL while a cheque is pending; set to the actual bank-clearance date on confirmation. Historical active cheques without clearance evidence may remain NULL and fall back to payment_date.';

-- For non-cheque payments, receipt and posting happen on the same date.
UPDATE jellypolly.payments
   SET posting_date = payment_date::date
 WHERE posting_date IS NULL
   AND payment_method <> 'cheque'
   AND status IS DISTINCT FROM 'pending';

COMMIT;

SELECT payment_method,
       status,
       COUNT(*) AS payment_count,
       COUNT(*) FILTER (WHERE posting_date IS NOT NULL) AS with_posting_date,
       COUNT(*) FILTER (WHERE posting_date IS NULL) AS without_posting_date
  FROM jellypolly.payments
 GROUP BY payment_method, status
 ORDER BY payment_method, status;
