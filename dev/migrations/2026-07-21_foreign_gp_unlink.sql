-- 2026-07-21_foreign_gp_unlink.sql
--
-- Decision (21 Jul 2026 — docs/Account/LEGACY_REPORT_VERIFICATION_PLAN.md §8-7):
-- Foreign (overseas) self-billed purchases are NOT linked to any financial-statement
-- note. Neither OP nor LGP carries an fs_note; the real accounting for these purchases
-- is keyed by the user as SEPARATE MANUAL purchase journals, so the auto-posted foreign
-- GP journals (DR LGP / CR TP) double-count and must be removed.
--
-- This migration is idempotent (a rerun is a clean no-op) and does two things:
--   1. Unmaps LGP (account_codes.fs_note -> NULL), matching the already-unmapped OP,
--      so any LGP line drops out of the IS/CoGM/BS roll-up.
--   2. Cancels the posted auto GP journals owned by FOREIGN self-billed invoices.
--      All such invoices are currently UNPAID with zero linked supplier payments, so
--      both the DR LGP and CR TP legs are safely removed with no orphaned PAY journal.
--      The invoice keeps its (now cancelled) journal_entry_id for audit provenance.
--
-- Going forward, foreign self-billed invoices no longer auto-post a GP journal
-- (src/routes/accounting/self-billed-invoices.js create/update paths). LOCAL general
-- purchases are UNCHANGED — they still auto-post DR <expense account> / CR TP.
--
-- NOTE: this is the DEVELOPMENT migration. Real production still posts foreign
-- purchases to the unmapped OP; the equivalent cleanup there is part of the separate,
-- approved production rollout (LEGACY_REPORT_VERIFICATION_PLAN §6/§8-7).

BEGIN;

-- 1. Unmap the foreign-purchase accounts (LGP now, OP defensively — already NULL).
UPDATE account_codes
SET fs_note = NULL, updated_at = NOW()
WHERE code IN ('LGP', 'OP') AND fs_note IS NOT NULL;

-- 2. Cancel the posted foreign GP journals (unpaid invoices only).
WITH cancelled AS (
  UPDATE journal_entries je
  SET status = 'cancelled', updated_at = NOW()
  FROM self_billed_invoices sbi
  WHERE sbi.journal_entry_id = je.id
    AND COALESCE(sbi.purchase_kind, 'foreign') = 'foreign'
    AND je.entry_type = 'GP'
    AND je.status = 'posted'
    AND NOT EXISTS (
      SELECT 1 FROM supplier_payments sp
      WHERE sp.invoice_source = 'self_billed_invoices'
        AND sp.invoice_id = sbi.id
        AND sp.status <> 'cancelled'
    )
  RETURNING je.id
)
SELECT COUNT(*) AS foreign_gp_journals_cancelled FROM cancelled;

-- Safety gate: no foreign self-billed invoice may be left with a POSTED GP journal.
-- (If a foreign invoice were paid, its journal is skipped above and this aborts the
-- whole migration loudly so the paid case is handled by hand rather than silently.)
DO $$
DECLARE leftover INT;
BEGIN
  SELECT COUNT(*) INTO leftover
  FROM self_billed_invoices sbi
  JOIN journal_entries je ON je.id = sbi.journal_entry_id
  WHERE COALESCE(sbi.purchase_kind, 'foreign') = 'foreign'
    AND je.entry_type = 'GP'
    AND je.status = 'posted';
  IF leftover > 0 THEN
    RAISE EXCEPTION 'Foreign GP unlink incomplete: % foreign invoice(s) still have a posted GP journal (paid?) — resolve by hand', leftover;
  END IF;
END $$;

COMMIT;

-- Verification (read-only, run manually):
--   SELECT code, fs_note FROM account_codes WHERE code IN ('OP','LGP');  -- both NULL
--   SELECT je.status, COUNT(*), SUM(jel.debit_amount)
--     FROM journal_entries je
--     JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id AND jel.account_code = 'LGP'
--     WHERE je.entry_type = 'GP' GROUP BY je.status;                     -- all 'cancelled'
