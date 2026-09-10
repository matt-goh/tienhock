-- Tien Hock: user-confirmed exact-month closing stock for January-August 2026.
-- Source: inline stock table received 2026-09-09; all 24 amounts recorded in
-- docs/Account/CLOSING_STOCK_CORRECTION_2026-09-09.md.
-- Insert missing values only; preserve matching values and all their metadata.
-- Expected reviewed state: May already matches, 21 rows missing in other months.
-- Reruns/partially keyed matching values are accepted; conflicting values abort.
-- Back up public.closing_stock_values first. User executes production SQL.
-- psql -X -v ON_ERROR_STOP=1 -d <tienhock|tienhock_prod> -f <this file>
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL search_path = public, pg_temp;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
BEGIN
  IF current_database() NOT IN ('tienhock', 'tienhock_prod') THEN
    RAISE EXCEPTION 'Unexpected database: %', current_database();
  END IF;
END
$guard$;

-- Keep note definitions, ledger data and report verification consistent.
LOCK TABLE public.financial_statement_notes, public.account_codes,
  public.account_opening_balances, public.journal_entries, public.journal_entry_lines IN SHARE MODE;
LOCK TABLE public.closing_stock_values IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE stock_2026_expected (
  year integer NOT NULL, month smallint NOT NULL, fs_note varchar NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount >= 0), PRIMARY KEY (year, month, fs_note)
) ON COMMIT DROP;
INSERT INTO stock_2026_expected (year, month, fs_note, amount) VALUES
  (2026, 1, '14-1', 131705.70),
  (2026, 1, '14-2', 511650.28),
  (2026, 1, '14-3', 186249.24),
  (2026, 2, '14-1', 136032.50),
  (2026, 2, '14-2', 406967.93),
  (2026, 2, '14-3', 168003.48),
  (2026, 3, '14-1', 111351.40),
  (2026, 3, '14-2', 453547.80),
  (2026, 3, '14-3', 167829.37),
  (2026, 4, '14-1', 182292.50),
  (2026, 4, '14-2', 359123.77),
  (2026, 4, '14-3', 180756.74),
  (2026, 5, '14-1', 188979.60),
  (2026, 5, '14-2', 336909.82),
  (2026, 5, '14-3', 182194.43),
  (2026, 6, '14-1', 139687.22),
  (2026, 6, '14-2', 300295.04),
  (2026, 6, '14-3', 153303.09),
  (2026, 7, '14-1', 233983.20),
  (2026, 7, '14-2', 406576.18),
  (2026, 7, '14-3', 166472.89),
  (2026, 8, '14-1', 110801.50),
  (2026, 8, '14-2', 475764.17),
  (2026, 8, '14-3', 147811.49);

CREATE TEMP TABLE stock_2026_before ON COMMIT DROP AS
SELECT * FROM public.closing_stock_values;

-- Matches the current TH endpoints: latest TB/BS anchor, fiscal-opening stock
-- for YTD profit/CoGM, TD folding, and exact-month report-level closing stock.
CREATE TEMP VIEW stock_2026_report_controls AS
WITH RECURSIVE months AS (
  SELECT (make_date(2026, month_no, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end
  FROM generate_series(1, 8) month_no
), note_walk AS (
  SELECT code AS origin, parent_code, fs_note, 0 AS depth FROM public.account_codes
  UNION ALL
  SELECT w.origin, p.parent_code, p.fs_note, w.depth + 1
  FROM note_walk w JOIN public.account_codes p ON p.code = w.parent_code
  WHERE w.fs_note IS NULL
), effective AS (
  SELECT DISTINCT ON (origin) origin AS code, fs_note
  FROM note_walk WHERE fs_note IS NOT NULL ORDER BY origin, depth
), periods AS (
  SELECT m.month_end, ac.code, ac.ledger_type, a.amount,
         COALESCE(a.as_of_date, DATE '2026-01-01') AS movement_start
  FROM months m CROSS JOIN public.account_codes ac
  LEFT JOIN LATERAL (
    SELECT amount, as_of_date FROM public.account_opening_balances
    WHERE account_code = ac.code AND as_of_date <= m.month_end
    ORDER BY as_of_date DESC LIMIT 1
  ) a ON true
  WHERE ac.is_active = true
), movement AS (
  SELECT p.month_end, p.code, SUM(jel.debit_amount - jel.credit_amount) AS net
  FROM periods p JOIN public.journal_entry_lines jel ON jel.account_code = p.code
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.status = 'posted' AND je.entry_date >= p.movement_start AND je.entry_date <= p.month_end
  GROUP BY p.month_end, p.code
), balances AS (
  SELECT p.month_end, p.code, p.ledger_type, COALESCE(p.amount, 0) + COALESCE(m.net, 0) AS net
  FROM periods p LEFT JOIN movement m ON m.month_end = p.month_end AND m.code = p.code
), folded AS (
  SELECT month_end, CASE WHEN ledger_type = 'TD' THEN 'DEBTOR' ELSE code END AS code, SUM(net) AS net
  FROM balances GROUP BY month_end, CASE WHEN ledger_type = 'TD' THEN 'DEBTOR' ELSE code END
), tb AS (
  SELECT month_end, SUM(GREATEST(net, 0)) AS debit, SUM(GREATEST(-net, 0)) AS credit
  FROM folded GROUP BY month_end
), statement_balances AS (
  SELECT b.month_end, e.fs_note, SUM(b.net) AS net
  FROM balances b JOIN effective e ON e.code = b.code GROUP BY b.month_end, e.fs_note
), fiscal_stock AS (
  SELECT e.fs_note, SUM(a.amount) AS net
  FROM public.account_opening_balances a JOIN effective e ON e.code = a.account_code
  WHERE a.as_of_date = DATE '2026-01-01' AND e.fs_note IN ('3-1', '3-3', '3-7')
  GROUP BY e.fs_note
), pnl_activity AS (
  SELECT m.month_end, e.fs_note, SUM(jel.debit_amount - jel.credit_amount) AS net
  FROM months m JOIN public.journal_entries je
    ON je.status = 'posted' AND je.entry_date >= DATE '2026-01-01' AND je.entry_date <= m.month_end
  JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN effective e ON e.code = jel.account_code
  GROUP BY m.month_end, e.fs_note
  UNION ALL
  SELECT m.month_end, s.fs_note, s.net FROM months m CROSS JOIN fiscal_stock s
), pnl AS (
  SELECT month_end, fs_note, SUM(net) AS net FROM pnl_activity GROUP BY month_end, fs_note
), closing_stock AS (
  SELECT m.month_end, csv.fs_note, csv.amount
  FROM months m JOIN public.closing_stock_values csv
    ON csv.year = 2026 AND csv.month = EXTRACT(MONTH FROM m.month_end)
  JOIN public.financial_statement_notes fsn ON fsn.code = csv.fs_note
), profit AS (
  SELECT m.month_end, COALESCE(SUM(
    CASE WHEN n.category = 'revenue' THEN
      CASE WHEN n.normal_balance = 'debit' THEN COALESCE(p.net, 0) ELSE -COALESCE(p.net, 0) END
    WHEN n.category IN ('expense', 'cogs') THEN
      -CASE WHEN n.normal_balance = 'debit' THEN COALESCE(p.net, 0) ELSE -COALESCE(p.net, 0) END
    ELSE 0 END
  ), 0) + COALESCE((SELECT SUM(amount) FROM closing_stock WHERE month_end = m.month_end), 0) AS amount
  FROM months m CROSS JOIN public.financial_statement_notes n
  LEFT JOIN pnl p ON p.month_end = m.month_end AND p.fs_note = n.code
  WHERE n.is_active = true AND n.report_section IN ('income_statement', 'cogm')
  GROUP BY m.month_end
), cogm AS (
  SELECT m.month_end, COALESCE(SUM(
    CASE WHEN n.normal_balance = 'debit' THEN COALESCE(p.net, 0) ELSE -COALESCE(p.net, 0) END
  ), 0) - COALESCE((SELECT SUM(amount) FROM closing_stock
      WHERE month_end = m.month_end AND fs_note IN ('14-2', '14-3')), 0) AS amount
  FROM months m CROSS JOIN public.financial_statement_notes n
  LEFT JOIN pnl p ON p.month_end = m.month_end AND p.fs_note = n.code
  WHERE n.is_active = true AND n.report_section = 'cogm'
  GROUP BY m.month_end
), bs_notes AS (
  SELECT m.month_end, n.category,
    CASE WHEN n.normal_balance = 'credit' THEN -COALESCE(s.net, 0) ELSE COALESCE(s.net, 0) END
      + COALESCE(c.amount, 0) AS amount
  FROM months m CROSS JOIN public.financial_statement_notes n
  LEFT JOIN statement_balances s ON s.month_end = m.month_end AND s.fs_note = n.code
  LEFT JOIN closing_stock c ON c.month_end = m.month_end AND c.fs_note = n.code
  WHERE n.is_active = true AND n.report_section = 'balance_sheet'
), bs AS (
  SELECT month_end, COALESCE(SUM(amount) FILTER (WHERE category = 'asset'), 0) AS assets,
    COALESCE(SUM(amount) FILTER (WHERE category IN ('liability', 'equity')), 0) AS liabilities_equity
  FROM bs_notes GROUP BY month_end
)
SELECT t.month_end, t.debit AS tb_debit, t.credit AS tb_credit, t.debit - t.credit AS tb_difference,
  b.assets, b.liabilities_equity + p.amount AS liabilities_equity, p.amount AS current_year_profit,
  b.assets - b.liabilities_equity - p.amount AS bs_difference, c.amount AS cogm,
  COALESCE((SELECT SUM(ABS(s.net)) FROM statement_balances s
    WHERE s.month_end = t.month_end AND s.fs_note IN ('14-1','14-2','14-3')), 0) AS closing_stock_gl_abs
FROM tb t JOIN bs b USING (month_end) JOIN profit p USING (month_end) JOIN cogm c USING (month_end);

CREATE TEMP TABLE stock_2026_reports_before ON COMMIT DROP AS
SELECT * FROM stock_2026_report_controls;

CREATE TEMP VIEW stock_2026_deltas AS
SELECT e.month,
  SUM(e.amount - COALESCE(b.amount, 0)) AS total_stock_added,
  SUM(CASE WHEN e.fs_note IN ('14-2', '14-3') THEN e.amount - COALESCE(b.amount, 0) ELSE 0 END) AS manufacturing_stock_added
FROM stock_2026_expected e
LEFT JOIN stock_2026_before b USING (year, month, fs_note)
GROUP BY e.month;

DO $correction$
DECLARE
  v_missing integer;
  v_inserted integer;
BEGIN
  IF (SELECT COUNT(*) FROM public.financial_statement_notes
      WHERE code IN ('14-1','14-2','14-3') AND category = 'asset'
        AND report_section = 'balance_sheet' AND normal_balance = 'debit' AND is_active = true) <> 3 THEN
    RAISE EXCEPTION 'Closing-stock note definitions changed; review before applying';
  END IF;

  IF (SELECT COUNT(*) FROM public.account_codes
      WHERE (code = 'ARI' AND fs_note = '22' AND parent_code IS NULL AND is_active = true)
         OR (code = 'CL_AFI' AND fs_note = '8' AND parent_code IS NULL AND is_active = true)) <> 2
     OR (SELECT COUNT(*) FROM public.account_opening_balances
      WHERE as_of_date = DATE '2026-01-01'
        AND ((account_code = 'ARI' AND amount = -31495.55)
          OR (account_code = 'CL_AFI' AND amount = -25696.82)
          OR (account_code = 'JP' AND amount = 9659.45))) <> 3 THEN
    RAISE EXCEPTION 'Reviewed Tien Hock allowance/opening context changed; this migration does not change it';
  END IF;

  IF EXISTS (
    SELECT 1 FROM stock_2026_expected e JOIN public.closing_stock_values s USING (year, month, fs_note)
    WHERE s.amount IS DISTINCT FROM e.amount
  ) THEN
    RAISE EXCEPTION 'A supplied month has a conflicting saved closing-stock amount; nothing will be overwritten';
  END IF;
  IF (SELECT COUNT(*) FROM stock_2026_expected e JOIN public.closing_stock_values s USING (year, month, fs_note)
      WHERE e.month = 5 AND s.amount = e.amount) <> 3 THEN
    RAISE EXCEPTION 'The three reviewed May values are missing or changed';
  END IF;
  IF (SELECT COUNT(*) FROM stock_2026_reports_before) <> 8
     OR EXISTS (SELECT 1 FROM stock_2026_reports_before
                WHERE tb_difference <> 0 OR bs_difference <> 0 OR closing_stock_gl_abs <> 0) THEN
    RAISE EXCEPTION 'Before-state TB/BS is unbalanced or closing-stock GL amounts would be counted twice';
  END IF;

  SELECT COUNT(*) INTO v_missing FROM stock_2026_expected e
  WHERE NOT EXISTS (SELECT 1 FROM public.closing_stock_values s
    WHERE s.year = e.year AND s.month = e.month AND s.fs_note = e.fs_note);

  INSERT INTO public.closing_stock_values (year, month, fs_note, amount, created_by, updated_by)
  SELECT e.year, e.month, e.fs_note, e.amount, NULL, NULL FROM stock_2026_expected e
  WHERE NOT EXISTS (SELECT 1 FROM public.closing_stock_values s
    WHERE s.year = e.year AND s.month = e.month AND s.fs_note = e.fs_note)
  ORDER BY e.year, e.month, e.fs_note;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> v_missing THEN
    RAISE EXCEPTION 'Expected % missing stock rows, inserted %', v_missing, v_inserted;
  END IF;

  IF (SELECT COUNT(*) FROM stock_2026_expected e JOIN public.closing_stock_values s USING (year, month, fs_note)
      WHERE s.amount = e.amount) <> 24 THEN
    RAISE EXCEPTION 'After-state does not contain all 24 confirmed closing-stock values';
  END IF;
  IF EXISTS (SELECT * FROM stock_2026_before EXCEPT SELECT * FROM public.closing_stock_values)
     OR (SELECT COUNT(*) FROM public.closing_stock_values) <> (SELECT COUNT(*) + v_missing FROM stock_2026_before)
     OR EXISTS (
       SELECT 1 FROM public.closing_stock_values s LEFT JOIN stock_2026_before b USING (id)
       WHERE b.id IS NULL AND NOT EXISTS (
         SELECT 1 FROM stock_2026_expected e WHERE e.year=s.year AND e.month=s.month AND e.fs_note=s.fs_note AND e.amount=s.amount)
     ) THEN
    RAISE EXCEPTION 'An existing stock row changed or an unrelated row was inserted';
  END IF;

  IF (SELECT COUNT(*) FROM stock_2026_report_controls) <> 8 OR EXISTS (
    SELECT 1 FROM stock_2026_report_controls a
    JOIN stock_2026_reports_before b USING (month_end)
    JOIN stock_2026_deltas d ON d.month = EXTRACT(MONTH FROM a.month_end)
    WHERE a.tb_difference <> 0 OR a.bs_difference <> 0 OR a.closing_stock_gl_abs <> 0
      OR a.tb_debit <> b.tb_debit OR a.tb_credit <> b.tb_credit
      OR a.assets <> b.assets + d.total_stock_added
      OR a.liabilities_equity <> b.liabilities_equity + d.total_stock_added
      OR a.current_year_profit <> b.current_year_profit + d.total_stock_added
      OR a.cogm <> b.cogm - d.manufacturing_stock_added
  ) THEN
    RAISE EXCEPTION 'After-state report verification failed';
  END IF;
  RAISE NOTICE 'Inserted % missing closing-stock rows; all 24 values verified; existing rows unchanged', v_inserted;
END
$correction$;

SELECT current_database() AS database,
       to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI:SS') AS verified_kl;
SELECT e.year, e.month, e.fs_note, b.amount AS before_amount, s.amount AS after_amount,
       CASE WHEN b.id IS NULL THEN 'inserted' ELSE 'already matches' END AS result
FROM stock_2026_expected e JOIN public.closing_stock_values s USING (year, month, fs_note)
LEFT JOIN stock_2026_before b USING (year, month, fs_note)
ORDER BY e.month, e.fs_note;
SELECT to_char(a.month_end,'YYYY-MM-DD') AS month_end, a.tb_difference, a.bs_difference,
       b.cogm AS cogm_before, a.cogm AS cogm_after,
       b.current_year_profit AS profit_before, a.current_year_profit AS profit_after,
       a.assets, a.liabilities_equity
FROM stock_2026_report_controls a JOIN stock_2026_reports_before b USING (month_end)
ORDER BY a.month_end;

DROP VIEW stock_2026_deltas, stock_2026_report_controls;
COMMIT;
