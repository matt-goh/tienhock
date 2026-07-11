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

SELECT COUNT(*) AS debtor_children,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM account_opening_balances aob
          WHERE aob.account_code = ac.code AND aob.as_of_date <= DATE '2026-06-01'
       )) AS with_cutover_anchor
  FROM account_codes ac WHERE ac.parent_code = 'DEBTOR';
