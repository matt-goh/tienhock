-- =============================================================================
-- 2026-07-10_phase5_recon_tool.sql  (DEV ANALYSIS TOOL — not a data migration)
-- Row-by-row June 2026 reconciliation of the five core ledgers against the
-- OCR fixtures. Load the fixtures first (from the repo root):
--
--   docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "CREATE SCHEMA IF NOT EXISTS recon;"
--   for F in JUNE2026_CH_REV1 JUNE2026_CH_REV2 JUNE2026_CASH_SALES JUNE2026_CR_SALES JUNE2026_BANK_PBB; do
--     docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
--       -c "DROP TABLE IF EXISTS recon.fx; CREATE TABLE recon.fx(ledger text, page int, row int, fdate text, journal text, particulars text, cheque text, debit numeric, credit numeric, balance numeric, balance_side text, day_ordinal int, notes text);" \
--       -c "\copy recon.fx FROM STDIN WITH (FORMAT csv, HEADER true)" < docs/Account/fixtures/$F.csv
--     ... (this script expects recon.fixture_rows already assembled; see below)
--   done
--
-- In practice run the loader block used on 10 Jul 2026 (see progress doc §5e),
-- which UNIONs all five files into recon.fixture_rows, then execute this file.
-- =============================================================================

-- ERP ledger lines with resolved visible references (June, posted).
CREATE OR REPLACE VIEW recon.erp_rows AS
SELECT jel.account_code AS ledger,
       je.entry_date,
       UPPER(REPLACE(COALESCE(jel.display_reference, je.display_reference, je.reference_no), ' ', '')) AS ref,
       CASE WHEN jel.debit_amount  > 0 THEN 'D'
            WHEN jel.credit_amount > 0 THEN 'C'
            ELSE 'Z' END AS side,
       CASE WHEN jel.debit_amount > 0 THEN jel.debit_amount ELSE jel.credit_amount END::numeric(12,2) AS amt,
       jel.particulars,
       COALESCE(jel.cheque_reference, je.cheque_no) AS cheque,
       je.id AS journal_entry_id, jel.id AS line_id
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
 WHERE je.status = 'posted'
   AND je.entry_date >= DATE '2026-06-01' AND je.entry_date < DATE '2026-07-01'
   AND jel.account_code IN ('CH_REV1', 'CH_REV2', 'CASH_SALES', 'CR_SALES', 'BANK_PBB');

-- Fixture rows normalized the same way (recon.fixture_rows must exist).
CREATE OR REPLACE VIEW recon.fx_rows AS
SELECT ledger,
       to_date(fdate, 'DD/MM/YYYY') AS entry_date,
       UPPER(REPLACE(COALESCE(journal, ''), ' ', '')) AS ref,
       CASE WHEN debit  IS NOT NULL AND debit  <> 0 THEN 'D'
            WHEN credit IS NOT NULL AND credit <> 0 THEN 'C'
            ELSE 'Z' END AS side,
       COALESCE(NULLIF(debit, 0), NULLIF(credit, 0), 0)::numeric(12,2) AS amt,
       particulars, cheque, day_ordinal, row AS fixture_row
  FROM recon.fixture_rows
 WHERE COALESCE(journal, '') <> ''  -- skip BALANCE C/FWD
;

-- Pairwise match on (ledger, date, side, amount, ref), duplicates by row_number.
CREATE OR REPLACE VIEW recon.matches AS
WITH e AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY ledger, entry_date, side, amt, ref ORDER BY line_id) AS rn
    FROM recon.erp_rows
), f AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY ledger, entry_date, side, amt, ref ORDER BY fixture_row) AS rn
    FROM recon.fx_rows
)
SELECT COALESCE(e.ledger, f.ledger) AS ledger,
       COALESCE(e.entry_date, f.entry_date) AS entry_date,
       COALESCE(e.ref, f.ref) AS ref,
       COALESCE(e.side, f.side) AS side,
       COALESCE(e.amt, f.amt) AS amt,
       (e.line_id IS NOT NULL AND f.fixture_row IS NOT NULL) AS matched,
       (e.line_id IS NOT NULL AND f.fixture_row IS NULL) AS erp_only,
       (e.line_id IS NULL AND f.fixture_row IS NOT NULL) AS legacy_only,
       e.line_id, f.fixture_row, f.day_ordinal
  FROM e
  FULL JOIN f ON f.ledger = e.ledger AND f.entry_date = e.entry_date
             AND f.side = e.side AND f.amt = e.amt AND f.ref = e.ref AND f.rn = e.rn;

-- ============================ REPORTS ============================

\echo '=== Per-ledger match summary ==='
SELECT ledger,
       COUNT(*) FILTER (WHERE matched) AS matched,
       COUNT(*) FILTER (WHERE legacy_only) AS legacy_only,
       COUNT(*) FILTER (WHERE erp_only) AS erp_only,
       ROUND(SUM(amt) FILTER (WHERE legacy_only), 2) AS legacy_only_amt,
       ROUND(SUM(amt) FILTER (WHERE erp_only), 2) AS erp_only_amt
  FROM recon.matches
 GROUP BY ledger ORDER BY ledger;

\echo '=== Unmatched rows (both sides) ==='
SELECT ledger, entry_date, ref, side, amt,
       CASE WHEN legacy_only THEN 'legacy-only' ELSE 'erp-only' END AS which
  FROM recon.matches
 WHERE NOT matched
 ORDER BY ledger, entry_date, amt;

\echo '=== Within-day print-order check (rank among MATCHED rows on both sides) ==='
WITH m AS (
  SELECT * FROM recon.matches WHERE matched
), ranked AS (
  SELECT ledger, entry_date, line_id,
         ROW_NUMBER() OVER (PARTITION BY ledger, entry_date ORDER BY ref, line_id) AS erp_rank,
         ROW_NUMBER() OVER (PARTITION BY ledger, entry_date ORDER BY day_ordinal, fixture_row) AS fx_rank
    FROM m
)
SELECT ledger,
       COUNT(*) AS matched_rows,
       COUNT(*) FILTER (WHERE erp_rank <> fx_rank) AS order_mismatches
  FROM ranked
 GROUP BY ledger ORDER BY ledger;

\echo '=== Order-mismatch detail (first 20) ==='
WITH m AS (
  SELECT * FROM recon.matches WHERE matched
), ranked AS (
  SELECT ledger, entry_date, ref, amt,
         ROW_NUMBER() OVER (PARTITION BY ledger, entry_date ORDER BY ref, line_id) AS erp_rank,
         ROW_NUMBER() OVER (PARTITION BY ledger, entry_date ORDER BY day_ordinal, fixture_row) AS fx_rank
    FROM m
)
SELECT ledger, entry_date, ref, amt, erp_rank, fx_rank
  FROM ranked WHERE erp_rank <> fx_rank
 ORDER BY ledger, entry_date, fx_rank LIMIT 20;
