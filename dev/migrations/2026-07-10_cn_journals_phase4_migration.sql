-- =============================================================================
-- 2026-07-10_cn_journals_phase4_migration.sql
-- Phase 4: rewrite the existing Credit Note journals to the frozen contract
-- and align their accounting dates with the legacy books (user decisions
-- §8-2/§8-10 in docs/Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md).
--
--   * Journal shape: DR original revenue ledger (CR_SALES / CASH_SALES per the
--     invoice's paymenttype) for net+rounding, DR OUTPUT_TAX when tax > 0,
--     CR TR for the total (replaces the old DR RETURN / CR TR).
--   * Visible reference: THCN/26/{n} (legacy numbering) in display_reference;
--     internal JCN reference_no unchanged.
--   * Dates (docs re-dated internally too; e-Invoice fields untouched):
--       CN-2026-0001..0016  -> 2026-05-31 (approximate pre-cutover date; the
--                              CR_SALES anchor supersedes them, killing the
--                              RM1,834.92 double-count)
--       CN-2026-0017..0019  -> 2026-06-10 (legacy THCN/26/17-19)
--       TH-CN-26-2 (=THCN/26/20), TH-CN-26-1 (=THCN/26/21) -> 2026-06-30
--   * Imports the approved 1 June revenue anchors: CASH_SALES 1,037,680.40 CR
--     and CR_SALES 2,296,968.93 CR (stored negative per the signed DR-positive
--     convention).
--
-- Idempotent: recomputes to the same end state on rerun.
-- Execution: docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
--              < dev/migrations/2026-07-10_cn_journals_phase4_migration.sql
-- =============================================================================

BEGIN;

-- Revenue opening anchors at the cutover (credit balances stored negative).
INSERT INTO account_opening_balances (account_code, as_of_date, amount, notes, created_by)
VALUES
  ('CASH_SALES', DATE '2026-06-01', -1037680.40,
   'Legacy CASH SALES opening at cutover (CR); imported Phase 4', 'migration'),
  ('CR_SALES', DATE '2026-06-01', -2296968.93,
   'Legacy CREDIT SALES opening at cutover (CR); imported Phase 4', 'migration')
ON CONFLICT (account_code, as_of_date) DO NOTHING;

DO $$
DECLARE
  cn RECORD;
  v_target_date DATE;
  v_display VARCHAR(100);
  v_desc TEXT;
  v_net NUMERIC(12,2);
  v_tax NUMERIC(12,2);
  v_total NUMERIC(12,2);
  v_revenue VARCHAR(50);
  v_line INTEGER;
  v_seq INTEGER;
BEGIN
  FOR cn IN
    SELECT ad.id AS doc_id, ad.reason, ad.original_invoice_id,
           ad.total_excluding_tax::numeric(12,2) AS net_amt,
           ad.tax_amount::numeric(12,2) AS tax_amt,
           ad.rounding::numeric(12,2) AS rounding_amt,
           ad.totalamountpayable::numeric(12,2) AS total_amt,
           ad.journal_entry_id, ad.status AS doc_status,
           je.reference_no, i.paymenttype
      FROM adjustment_documents ad
      JOIN journal_entries je ON je.id = ad.journal_entry_id
      JOIN invoices i ON i.id = ad.original_invoice_id
     WHERE ad.type = 'credit_note'
       AND (ad.id LIKE 'CN-2026-%' OR ad.id IN ('TH-CN-26-1', 'TH-CN-26-2'))
     ORDER BY je.reference_no
  LOOP
    -- Legacy THCN sequence + target accounting date.
    IF cn.doc_id LIKE 'CN-2026-%' THEN
      v_seq := substring(cn.doc_id FROM 'CN-2026-0*(\d+)$')::int;
    ELSIF cn.doc_id = 'TH-CN-26-2' THEN
      v_seq := 20;
    ELSIF cn.doc_id = 'TH-CN-26-1' THEN
      v_seq := 21;
    END IF;
    v_display := 'THCN/26/' || v_seq;
    v_target_date := CASE
      WHEN v_seq <= 16 THEN DATE '2026-05-31'
      WHEN v_seq <= 19 THEN DATE '2026-06-10'
      ELSE DATE '2026-06-30'
    END;

    v_net := cn.net_amt + cn.rounding_amt;
    v_tax := cn.tax_amt;
    v_total := cn.total_amt;
    IF ABS(v_net + v_tax - v_total) > 0.005 THEN
      RAISE EXCEPTION 'CN %: net+rounding (%) + tax (%) <> total (%)', cn.doc_id, v_net, v_tax, v_total;
    END IF;
    v_revenue := CASE WHEN cn.paymenttype = 'CASH' THEN 'CASH_SALES' ELSE 'CR_SALES' END;
    v_desc := v_display || ': ' || COALESCE(NULLIF(TRIM(cn.reason), ''), 'Credit Note')
              || ' - INV/NO: ' || cn.original_invoice_id;

    UPDATE journal_entries
       SET entry_date = v_target_date,
           description = v_desc,
           display_reference = v_display,
           total_debit = v_total, total_credit = v_total,
           source_type = 'adjustment', source_id = cn.doc_id,
           updated_at = NOW()
     WHERE id = cn.journal_entry_id;

    DELETE FROM journal_entry_lines WHERE journal_entry_id = cn.journal_entry_id;
    v_line := 1;
    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, display_order, created_at)
    VALUES (cn.journal_entry_id, v_line, v_revenue, v_net, 0, cn.reference_no, v_desc, v_line, NOW());
    IF v_tax > 0 THEN
      v_line := v_line + 1;
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, display_order, created_at)
      VALUES (cn.journal_entry_id, v_line, 'OUTPUT_TAX', v_tax, 0, cn.reference_no, v_desc, v_line, NOW());
    END IF;
    v_line := v_line + 1;
    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, reference, particulars, display_order, created_at)
    VALUES (cn.journal_entry_id, v_line, 'TR', 0, v_total, cn.reference_no, v_desc, v_line, NOW());

    -- Re-date the document itself (internal date only; e-Invoice fields untouched).
    UPDATE adjustment_documents
       SET createddate = (EXTRACT(EPOCH FROM ((v_target_date + TIME '12:00') AT TIME ZONE 'Asia/Kuala_Lumpur')) * 1000)::bigint,
           updated_at = NOW()
     WHERE id = cn.doc_id
       AND createddate IS DISTINCT FROM (EXTRACT(EPOCH FROM ((v_target_date + TIME '12:00') AT TIME ZONE 'Asia/Kuala_Lumpur')) * 1000)::bigint;
  END LOOP;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification. Expect: June THCN debits in CR_SALES = 158.35 (17-19 @ 10/06 +
-- 20-21 @ 30/06); May 31 carries 1,834.92 (behind the anchor); June CR_SALES
-- closing = 2,296,968.93 CR + 513,062.80 credits - 158.35 = 2,809,873.38 CR.
-- -----------------------------------------------------------------------------
SELECT je.entry_date, COUNT(*) AS cns, SUM(jel.debit_amount)::numeric(12,2) AS cr_sales_debits
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
 WHERE je.entry_type = 'CN' AND je.status = 'posted' AND jel.account_code = 'CR_SALES'
 GROUP BY je.entry_date ORDER BY je.entry_date;

-- Signed DR-positive convention: closing = anchor + debits - credits.
-- Expect -2,809,873.38 (i.e. 2,809,873.38 CR, the legacy June close).
SELECT (-2296968.93 + SUM(jel.debit_amount) - SUM(jel.credit_amount))::numeric(14,2) AS june_closing_signed
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
 WHERE je.status = 'posted' AND jel.account_code = 'CR_SALES'
   AND je.entry_date >= DATE '2026-06-01' AND je.entry_date < DATE '2026-07-01';
