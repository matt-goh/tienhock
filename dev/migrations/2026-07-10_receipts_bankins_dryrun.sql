-- =============================================================================
-- 2026-07-10_receipts_bankins_dryrun.sql
-- READ-ONLY reconciliation / dry-run report for the receipt & bank-in refactor.
-- Surfaces every existing-data case listed in the implementation plan §9 before
-- any data is rewritten (the rewrite itself happens in Phase 2/3 migrations).
-- Safe to run any time:
--   docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
--     < dev/migrations/2026-07-10_receipts_bankins_dryrun.sql
-- =============================================================================

\echo '=== A. payments status census ==='
SELECT status, COUNT(*) AS rows, COUNT(journal_entry_id) AS with_journal,
       ROUND(SUM(amount_paid)::numeric, 2) AS total
  FROM payments GROUP BY status ORDER BY status;

\echo '=== B. June 2026 payment method x invoice paymenttype matrix ==='
SELECT p.payment_method, i.paymenttype, COUNT(*) AS n,
       ROUND(SUM(p.amount_paid)::numeric, 2) AS amt
  FROM payments p JOIN invoices i ON i.id = p.invoice_id
 WHERE p.payment_date >= '2026-06-01' AND p.payment_date < '2026-07-01'
   AND p.status <> 'cancelled'
 GROUP BY 1, 2 ORDER BY 1, 2;

\echo '=== C. Proposed direct-receipt groups (non-cash, shared reference+date+account, >1 row) ==='
SELECT p.payment_reference, p.payment_date::date AS pay_date, p.bank_account,
       COUNT(*) AS rows, ROUND(SUM(p.amount_paid)::numeric, 2) AS group_total,
       array_agg(p.invoice_id ORDER BY p.payment_id) AS invoices
  FROM payments p
 WHERE p.status <> 'cancelled'
   AND p.payment_method <> 'cash'
   AND COALESCE(TRIM(p.payment_reference), '') <> ''
 GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
 ORDER BY group_total DESC
 LIMIT 25;

\echo '=== C2. Spotlight: TF040626 family (plan fixture 6) ==='
SELECT p.payment_id, p.invoice_id, p.payment_date::date, p.amount_paid,
       p.payment_method, p.payment_reference, p.bank_account, p.status,
       p.journal_entry_id
  FROM payments p
 WHERE p.payment_reference ILIKE 'TF040626%'
 ORDER BY p.payment_reference, p.payment_id;

\echo '=== D. Null/blank-reference non-cash payments (must NOT be guessed into groups) ==='
SELECT COUNT(*) AS rows, ROUND(SUM(amount_paid)::numeric, 2) AS total
  FROM payments
 WHERE status <> 'cancelled'
   AND payment_method <> 'cash'
   AND COALESCE(TRIM(payment_reference), '') = '';

\echo '=== E. Overpayment rows (become excess allocations, CR CUST_DEP) ==='
SELECT p.payment_id, p.invoice_id, i.customerid, p.payment_date::date,
       p.amount_paid, p.payment_method, p.status
  FROM payments p JOIN invoices i ON i.id = p.invoice_id
 WHERE p.status = 'overpaid'
 ORDER BY p.payment_date;

\echo '=== F. Automatic cash-bill collections vs genuine receipts (cash payments on CASH invoices) ==='
SELECT CASE WHEN p.payment_date::date =
              (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date
            THEN 'same-day (auto candidate)' ELSE 'different-day (genuine?)' END AS class,
       COUNT(*) AS rows, ROUND(SUM(p.amount_paid)::numeric, 2) AS total
  FROM payments p JOIN invoices i ON i.id = p.invoice_id
 WHERE p.status <> 'cancelled' AND p.payment_method = 'cash' AND i.paymenttype = 'CASH'
 GROUP BY 1;

\echo '=== G. ACTIVE payments with NO journal (backfill list) ==='
SELECT p.payment_id, p.invoice_id, p.payment_date::date, p.amount_paid,
       p.payment_method, p.status
  FROM payments p
 WHERE p.status = 'active' AND p.journal_entry_id IS NULL
 ORDER BY p.payment_date;

\echo '=== H. CANCELLED payments whose journal is still POSTED (must be cancelled) ==='
SELECT COUNT(*) AS rows, ROUND(SUM(p.amount_paid)::numeric, 2) AS total,
       MIN(p.payment_date::date) AS earliest, MAX(p.payment_date::date) AS latest
  FROM payments p JOIN journal_entries je ON je.id = p.journal_entry_id
 WHERE p.status = 'cancelled' AND je.status = 'posted';

\echo '=== I. payment_reference values reused across different dates ==='
SELECT payment_reference, COUNT(DISTINCT payment_date::date) AS dates,
       COUNT(*) AS rows, ROUND(SUM(amount_paid)::numeric, 2) AS total
  FROM payments
 WHERE COALESCE(TRIM(payment_reference), '') <> '' AND status <> 'cancelled'
 GROUP BY payment_reference
HAVING COUNT(DISTINCT payment_date::date) > 1
 ORDER BY rows DESC
 LIMIT 15;

\echo '=== J. Journal census by type with source-link coverage (post-foundation) ==='
SELECT je.entry_type, je.status, COUNT(*) AS rows,
       COUNT(*) FILTER (WHERE (to_jsonb(je) ->> 'source_type') IS NOT NULL) AS source_linked
  FROM journal_entries je
 GROUP BY je.entry_type, je.status
 ORDER BY je.entry_type, je.status;

\echo '=== K. Journals referenced by MORE THAN ONE payment (corruption check) ==='
SELECT p.journal_entry_id, COUNT(*) AS payments,
       array_agg(p.payment_id) AS payment_ids
  FROM payments p
 WHERE p.journal_entry_id IS NOT NULL
 GROUP BY p.journal_entry_id
HAVING COUNT(*) > 1;

\echo '=== L. CN journals vs legacy accounting rows (date/ref/account mismatches; Phase 4 worksheet) ==='
SELECT ad.display_id, ad.id AS doc_id, ad.status AS doc_status,
       ad.totalamountpayable, ad.original_invoice_id,
       je.reference_no, je.entry_date AS erp_journal_date, je.status AS je_status,
       (SELECT jel.account_code FROM journal_entry_lines jel
         WHERE jel.journal_entry_id = je.id AND jel.debit_amount > 0 LIMIT 1) AS debit_account
  FROM adjustment_documents ad
  LEFT JOIN journal_entries je ON je.id = ad.journal_entry_id
 WHERE ad.type = 'credit_note'
 ORDER BY je.entry_date, je.reference_no;

\echo '=== M. REC journals outside the June window (pre-cutover + future-dated) ==='
SELECT CASE WHEN entry_date < '2026-06-01' THEN 'pre-cutover (< 2026-06-01)'
            WHEN entry_date >= CURRENT_DATE THEN 'future-dated (typo?)'
            ELSE 'normal' END AS class,
       status, COUNT(*) AS rows, MIN(entry_date) AS earliest, MAX(entry_date) AS latest,
       ROUND(SUM(total_debit)::numeric, 2) AS total
  FROM journal_entries
 WHERE entry_type = 'REC'
 GROUP BY 1, 2 ORDER BY 1, 2;

\echo '=== N. Reclassification worksheet: June cash-method payments on CREDIT invoices ==='
\echo '    (legacy says physical cash was only RM7,202.70; the rest are bank transfers keyed as cash)'
SELECT p.payment_id, p.invoice_id, i.customerid, p.payment_date::date,
       p.amount_paid, p.payment_reference, p.status, je.reference_no AS journal_ref
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  LEFT JOIN journal_entries je ON je.id = p.journal_entry_id
 WHERE p.payment_method = 'cash' AND i.paymenttype = 'INVOICE'
   AND p.payment_date >= '2026-06-01' AND p.payment_date < '2026-07-01'
   AND p.status <> 'cancelled'
 ORDER BY p.payment_date, p.payment_id;

\echo '=== O. Manual journals whose reference matches the RV pattern (registry collisions) ==='
SELECT id, reference_no, entry_type, entry_date, status
  FROM journal_entries
 WHERE reference_no ~ '^RV\d{3,}/\d{2}$'
 ORDER BY entry_date;

\echo '=== P. June CH_REV1 cash pool by CASH-invoice local date (compare to fixture pools) ==='
SELECT (to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS sale_date,
       COUNT(*) AS bills, ROUND(SUM(p.amount_paid)::numeric, 2) AS collected
  FROM payments p JOIN invoices i ON i.id = p.invoice_id
 WHERE p.payment_method = 'cash' AND i.paymenttype = 'CASH' AND p.status <> 'cancelled'
   AND to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur'
       >= '2026-06-01' AND
       to_timestamp(i.createddate::bigint / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur' < '2026-07-01'
 GROUP BY 1 ORDER BY 1;

\echo '=== Q. Balance-invariant snapshot (must be identical before/after the foundation migration) ==='
SELECT jel.account_code, COUNT(*) AS lines,
       ROUND(SUM(jel.debit_amount)::numeric, 2) AS dr,
       ROUND(SUM(jel.credit_amount)::numeric, 2) AS cr
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
 WHERE je.status = 'posted'
   AND jel.account_code IN ('CH_REV1','CH_REV2','CASH_SALES','CR_SALES','BANK_PBB','TR','CUST_DEP')
 GROUP BY jel.account_code ORDER BY jel.account_code;
