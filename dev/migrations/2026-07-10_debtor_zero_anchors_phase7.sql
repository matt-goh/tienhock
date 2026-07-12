-- =============================================================================
-- 2026-07-10_debtor_zero_anchors_phase7.sql
-- Phase 7: explicit ZERO opening anchors (2026-06-01) for every DEBTOR child
-- that has no cutover anchor.
--
-- Why: the legacy debtor list at 1 June 2026 is exactly the 150 imported
-- customer anchors (RM507,697.72). Every other customer owed nothing at the
-- cutover. Phase 6 rewrote pre-cutover RECEIPT journals onto the children for
-- display history, but pre-cutover INVOICES never had journals — so a derived
-- (no-anchor) opening would count one-sided credits and misstate those
-- customers. A 0.00 anchor makes the standard anchor rule ignore everything
-- before the cutover, exactly like the bank/cash accounts.
--
-- Children created AFTER the cutover only ever carry post-cutover lines, so
-- new customers need no anchor. Idempotent (ON CONFLICT DO NOTHING).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_children INTEGER;
  v_anchored INTEGER;
  v_total NUMERIC(14,2);
BEGIN
  SELECT COUNT(*) INTO v_children
    FROM account_codes WHERE parent_code = 'DEBTOR';

  WITH latest AS (
    SELECT DISTINCT ON (aob.account_code) aob.account_code, aob.amount
      FROM account_opening_balances aob
      JOIN account_codes ac ON ac.code = aob.account_code
     WHERE ac.parent_code = 'DEBTOR'
       AND aob.as_of_date <= DATE '2026-06-01'
     ORDER BY aob.account_code, aob.as_of_date DESC
  )
  SELECT COUNT(*), COALESCE(SUM(amount), 0)::numeric(14,2)
    INTO v_anchored, v_total
    FROM latest;

  IF v_total <> 507697.72 OR v_anchored < 150 OR v_anchored > v_children THEN
    RAISE EXCEPTION
      'Unexpected debtor cutover anchors: % of % children totaling % (expected at least 150 and no more than all children, total 507697.72)',
      v_anchored, v_children, v_total;
  END IF;
END $$;

INSERT INTO account_opening_balances (account_code, as_of_date, amount, notes, created_by)
SELECT ac.code, DATE '2026-06-01', 0,
       'Zero debtor opening at cutover (customer not in the legacy 1 June debtor list)',
       'migration'
  FROM account_codes ac
 WHERE ac.parent_code = 'DEBTOR'
   AND NOT EXISTS (
     SELECT 1 FROM account_opening_balances aob
      WHERE aob.account_code = ac.code AND aob.as_of_date <= DATE '2026-06-01'
   )
ON CONFLICT (account_code, as_of_date) DO NOTHING;

DO $$
DECLARE
  v_children INTEGER;
  v_anchored INTEGER;
  v_total NUMERIC(14,2);
BEGIN
  SELECT COUNT(*) INTO v_children
    FROM account_codes WHERE parent_code = 'DEBTOR';
  WITH latest AS (
    SELECT DISTINCT ON (aob.account_code) aob.account_code, aob.amount
      FROM account_opening_balances aob
      JOIN account_codes ac ON ac.code = aob.account_code
     WHERE ac.parent_code = 'DEBTOR'
       AND aob.as_of_date <= DATE '2026-06-01'
     ORDER BY aob.account_code, aob.as_of_date DESC
  )
  SELECT COUNT(*), COALESCE(SUM(amount), 0)::numeric(14,2)
    INTO v_anchored, v_total
    FROM latest;
  IF v_anchored <> v_children OR v_total <> 507697.72 THEN
    RAISE EXCEPTION
      'Debtor zero-anchor result invalid: % of % children totaling %',
      v_anchored, v_children, v_total;
  END IF;
END $$;

COMMIT;

SELECT COUNT(*) AS debtor_children,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM account_opening_balances aob
          WHERE aob.account_code = ac.code AND aob.as_of_date <= DATE '2026-06-01'
       )) AS with_cutover_anchor
  FROM account_codes ac WHERE ac.parent_code = 'DEBTOR';
