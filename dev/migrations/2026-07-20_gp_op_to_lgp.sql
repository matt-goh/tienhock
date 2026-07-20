\set ON_ERROR_STOP on

-- GP purchase-account handover: OP (Overseas Purchases, deprecated) -> LGP
-- (Local General Purchases), 20 Jul 2026.
--
-- Context: OP was deprecated in production on 20 Jul 2026 (its fs_note was
-- cleared) and LGP was created the same day as the successor purchase
-- account. All 63 OP self-billed foreign-purchase invoices (56 posted / 7
-- cancelled GP journals) are machine spare-parts / general-stock purchases
-- that should post to LGP instead. This migration:
--   * maps LGP to fs_note 5 (mirrors the audited OP classification; the only
--     general Income Statement expense note — a CoGM purchase note would
--     distort the pinned CoGM);
--   * repoints every OP self-billed invoice (header and line level) to LGP;
--   * repoints every GP journal line from OP to LGP (posted and cancelled);
--   * marks OP deprecated in its description.
-- OP is left with zero movement, no anchors and no fs_note, so it drops out
-- of all report populations. Journal amounts, dates, references and
-- particulars are unchanged. Idempotent: a rerun verifies the final state
-- and performs zero writes.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

SELECT pg_advisory_xact_lock(
  hashtextextended('gp_op_to_lgp_20260720', 0)
);

LOCK TABLE self_billed_invoices IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE self_billed_invoice_lines IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE journal_entries IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE journal_entry_lines IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE account_codes IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE gp_state (
  mode varchar(10) PRIMARY KEY CHECK (mode IN ('fresh', 'final'))
) ON COMMIT DROP;

DO $preflight$
DECLARE
  v_op_anchor_count bigint;
  v_op_invoices bigint;
  v_lgp_invoices bigint;
  v_op_posted_lines bigint;
  v_op_cancelled_lines bigint;
  v_op_other_lines bigint;
  v_op_posted_debit numeric;
  v_op_cancelled_debit numeric;
  v_lgp_posted_lines bigint;
  v_lgp_cancelled_lines bigint;
  v_lgp_posted_debit numeric;
  v_lgp_cancelled_debit numeric;
  v_op_line_level bigint;
  v_lgp_fs_note varchar(50);
  v_op_description varchar;
  v_is_fresh boolean;
  v_is_final boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'OP' AND is_active) THEN
    RAISE EXCEPTION 'OP account is missing or inactive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'LGP' AND is_active) THEN
    RAISE EXCEPTION 'LGP account is missing or inactive';
  END IF;

  SELECT COUNT(*) INTO v_op_anchor_count
    FROM account_opening_balances WHERE account_code = 'OP';

  IF v_op_anchor_count <> 0 THEN
    RAISE EXCEPTION 'OP has % opening-balance anchors; aborting', v_op_anchor_count;
  END IF;

  SELECT COUNT(*) INTO v_op_invoices
    FROM self_billed_invoices WHERE account_code = 'OP';
  SELECT COUNT(*) INTO v_lgp_invoices
    FROM self_billed_invoices WHERE account_code = 'LGP';

  SELECT COUNT(*), COALESCE(SUM(l.debit_amount), 0)
    INTO v_op_posted_lines, v_op_posted_debit
    FROM journal_entry_lines l
    JOIN journal_entries h ON h.id = l.journal_entry_id
   WHERE l.account_code = 'OP' AND h.entry_type = 'GP' AND h.status = 'posted';

  SELECT COUNT(*), COALESCE(SUM(l.debit_amount), 0)
    INTO v_op_cancelled_lines, v_op_cancelled_debit
    FROM journal_entry_lines l
    JOIN journal_entries h ON h.id = l.journal_entry_id
   WHERE l.account_code = 'OP' AND h.entry_type = 'GP' AND h.status = 'cancelled';

  SELECT COUNT(*) INTO v_op_other_lines
    FROM journal_entry_lines l
    JOIN journal_entries h ON h.id = l.journal_entry_id
   WHERE l.account_code = 'OP' AND h.entry_type <> 'GP';

  IF v_op_other_lines <> 0 THEN
    RAISE EXCEPTION 'OP has % lines on non-GP journals; aborting', v_op_other_lines;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(l.debit_amount), 0)
    INTO v_lgp_posted_lines, v_lgp_posted_debit
    FROM journal_entry_lines l
    JOIN journal_entries h ON h.id = l.journal_entry_id
   WHERE l.account_code = 'LGP' AND h.entry_type = 'GP' AND h.status = 'posted';

  SELECT COUNT(*), COALESCE(SUM(l.debit_amount), 0)
    INTO v_lgp_cancelled_lines, v_lgp_cancelled_debit
    FROM journal_entry_lines l
    JOIN journal_entries h ON h.id = l.journal_entry_id
   WHERE l.account_code = 'LGP' AND h.entry_type = 'GP' AND h.status = 'cancelled';

  SELECT COUNT(*) INTO v_op_line_level
    FROM self_billed_invoice_lines WHERE account_code = 'OP';

  SELECT description INTO v_op_description FROM account_codes WHERE code = 'OP';
  SELECT fs_note INTO v_lgp_fs_note FROM account_codes WHERE code = 'LGP';

  v_is_fresh :=
    v_op_invoices = 63
    AND v_lgp_invoices = 0
    AND v_op_posted_lines = 56
    AND v_op_cancelled_lines = 7
    AND v_op_line_level = 23
    AND v_lgp_posted_lines = 0
    AND v_lgp_cancelled_lines = 0
    AND v_op_posted_debit = 28632.92
    AND v_op_cancelled_debit = 1322.92
    AND v_lgp_fs_note IS NULL
    AND v_op_description = 'Overseas Purchases';

  v_is_final :=
    v_op_invoices = 0
    AND v_lgp_invoices = 63
    AND v_op_posted_lines = 0
    AND v_op_cancelled_lines = 0
    AND v_op_line_level = 0
    AND v_lgp_posted_lines = 56
    AND v_lgp_cancelled_lines = 7
    AND v_lgp_posted_debit = 28632.92
    AND v_lgp_cancelled_debit = 1322.92
    AND v_lgp_fs_note = '5'
    AND v_op_description = 'Overseas Purchases (DEPRECATED - use LGP)';

  IF v_is_fresh = v_is_final OR NOT (v_is_fresh OR v_is_final) THEN
    RAISE EXCEPTION
      'GP OP->LGP preflight requires one exact wholly fresh or wholly final state (fresh %, final %)',
      v_is_fresh,
      v_is_final;
  END IF;

  INSERT INTO gp_state (mode)
  VALUES (CASE WHEN v_is_fresh THEN 'fresh' ELSE 'final' END);
END
$preflight$;

DO $apply$
DECLARE
  v_mode varchar(10);
  v_lgp_note integer := 0;
  v_op_desc integer := 0;
  v_invoices integer := 0;
  v_line_level integer := 0;
  v_journal_lines integer := 0;
BEGIN
  SELECT mode INTO STRICT v_mode FROM gp_state;

  IF v_mode = 'fresh' THEN
    UPDATE account_codes
       SET fs_note = '5', updated_at = CURRENT_TIMESTAMP
     WHERE code = 'LGP' AND fs_note IS NULL;
    GET DIAGNOSTICS v_lgp_note = ROW_COUNT;

    UPDATE account_codes
       SET description = 'Overseas Purchases (DEPRECATED - use LGP)',
           updated_at = CURRENT_TIMESTAMP
     WHERE code = 'OP' AND description = 'Overseas Purchases';
    GET DIAGNOSTICS v_op_desc = ROW_COUNT;

    UPDATE self_billed_invoices
       SET account_code = 'LGP', updated_at = CURRENT_TIMESTAMP
     WHERE account_code = 'OP';
    GET DIAGNOSTICS v_invoices = ROW_COUNT;

    UPDATE self_billed_invoice_lines
       SET account_code = 'LGP'
     WHERE account_code = 'OP';
    GET DIAGNOSTICS v_line_level = ROW_COUNT;

    UPDATE journal_entry_lines l
       SET account_code = 'LGP'
      FROM journal_entries h
     WHERE l.journal_entry_id = h.id
       AND l.account_code = 'OP'
       AND h.entry_type = 'GP';
    GET DIAGNOSTICS v_journal_lines = ROW_COUNT;

    IF (
         v_lgp_note,
         v_op_desc,
         v_invoices,
         v_line_level,
         v_journal_lines
       ) IS DISTINCT FROM (
         1,
         1,
         63,
         23,
         63
       ) THEN
      RAISE EXCEPTION
        'GP OP->LGP mutation count mismatch (note %, description %, invoices %, line level %, journal lines %)',
        v_lgp_note,
        v_op_desc,
        v_invoices,
        v_line_level,
        v_journal_lines;
    END IF;
  END IF;

  RAISE NOTICE
    'GP OP->LGP state %: LGP note %, OP description %, invoices %, line level %, journal lines %',
    v_mode,
    v_lgp_note,
    v_op_desc,
    v_invoices,
    v_line_level,
    v_journal_lines;
END
$apply$;

DO $postconditions$
DECLARE
  v_mode varchar(10);
BEGIN
  SELECT mode INTO STRICT v_mode FROM gp_state;

  IF EXISTS (SELECT 1 FROM journal_entry_lines WHERE account_code = 'OP') THEN
    RAISE EXCEPTION 'OP still carries journal lines after the handover';
  END IF;

  IF EXISTS (SELECT 1 FROM self_billed_invoices WHERE account_code = 'OP')
     OR EXISTS (SELECT 1 FROM self_billed_invoice_lines WHERE account_code = 'OP') THEN
    RAISE EXCEPTION 'OP still carries self-billed invoice references after the handover';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM account_codes
    WHERE code = 'LGP' AND fs_note = '5' AND is_active
  ) THEN
    RAISE EXCEPTION 'LGP final fs_note mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM account_codes
    WHERE code = 'OP'
      AND fs_note IS NULL
      AND description = 'Overseas Purchases (DEPRECATED - use LGP)'
  ) THEN
    RAISE EXCEPTION 'OP final deprecation state mismatch';
  END IF;

  IF (
       (SELECT COUNT(*) FROM journal_entry_lines l
         JOIN journal_entries h ON h.id = l.journal_entry_id
        WHERE l.account_code = 'LGP' AND h.entry_type = 'GP' AND h.status = 'posted'),
       (SELECT COUNT(*) FROM journal_entry_lines l
         JOIN journal_entries h ON h.id = l.journal_entry_id
        WHERE l.account_code = 'LGP' AND h.entry_type = 'GP' AND h.status = 'cancelled'),
       (SELECT COALESCE(SUM(l.debit_amount), 0) FROM journal_entry_lines l
         JOIN journal_entries h ON h.id = l.journal_entry_id
        WHERE l.account_code = 'LGP' AND h.entry_type = 'GP' AND h.status = 'posted')
     ) IS DISTINCT FROM (
       56::bigint,
       7::bigint,
       28632.92::numeric
     ) THEN
    RAISE EXCEPTION 'LGP final journal population mismatch';
  END IF;

  RAISE NOTICE
    'GP OP->LGP verified in % mode: 56 posted / 7 cancelled GP journals (RM28,632.92 posted) now debit LGP (note 5); OP is an unmapped empty shell',
    v_mode;
END
$postconditions$;

COMMIT;
