-- Green Target July 2026 debtor audit correction (2026-08-20)
--
-- User-approved evidence:
--   statement.pdf
--   SHA-256 15a83afe4617366cdeeeb03befa6d81cc13f6e32bc9bc4aa8dfdc939a4cb4a0
--
-- The pencil annotations correct only the YEAR-TO-DATE column:
--   CD-CASH  16,054.00  (was 15,834.00)
--   CD-DURA    1,100.00  (was   -700.00)
--   CD-LIST   16,440.00  (was 16,660.00)
--   CD-SITI      -10.00  (was    -70.00)
--
-- Therefore all four changes belong to the carried May/June snapshots. July
-- movements remain exactly as printed (CD-CASH 920.00, CD-DURA 200.00,
-- CD-LIST 2,630.00 and CD-SITI 0.00), and no invoice or journal is changed.
-- The four deltas net to +RM1,860.00, exactly allocating the former unnamed
-- closing residual while preserving each month's control total.
--
-- This migration is serializable, guarded, idempotent and fail-closed.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL search_path TO greentarget, public;

CREATE TEMP TABLE gt_july_debtor_audit_targets (
  as_of_month date NOT NULL,
  account_code text NOT NULL,
  old_closing numeric(14,2) NOT NULL,
  new_closing numeric(14,2) NOT NULL,
  expected_movement numeric(14,2) NOT NULL,
  expected_source_page integer NOT NULL,
  expected_source_row integer,
  old_provenance text NOT NULL,
  new_provenance text NOT NULL,
  PRIMARY KEY (as_of_month, account_code)
) ON COMMIT DROP;

INSERT INTO gt_july_debtor_audit_targets (
  as_of_month,
  account_code,
  old_closing,
  new_closing,
  expected_movement,
  expected_source_page,
  expected_source_row,
  old_provenance,
  new_provenance
)
VALUES
  (DATE '2026-05-01', 'CD-CASH', 12034.00, 12254.00, -830.00, 4, 10,
   'derived_visible_child_prior_close', 'user_confirmed_audit_correction_20260820'),
  (DATE '2026-05-01', 'CD-DURA', -1080.00, 720.00, 180.00, 5, 4,
   'derived_visible_child_prior_close', 'user_confirmed_audit_correction_20260820'),
  (DATE '2026-05-01', 'CD-LIST', 14010.00, 13790.00, -570.00, 9, 18,
   'derived_visible_child_prior_close', 'user_confirmed_audit_correction_20260820'),
  (DATE '2026-05-01', 'CD-SITI', -70.00, -10.00, 0.00, 15, 10,
   'derived_visible_child_prior_close', 'user_confirmed_audit_correction_20260820'),
  (DATE '2026-05-01', 'CD_SD (UNALLOCATED)', 1860.00, 0.00, -160.00, 18, NULL,
   'derived_unallocated_control_residual',
   'derived_user_confirmed_reconciliation_20260820'),
  (DATE '2026-06-01', 'CD-CASH', 14914.00, 15134.00, 2880.00, 4, 10,
   'legacy_visible_child_schedule', 'user_confirmed_audit_correction_20260820'),
  (DATE '2026-06-01', 'CD-DURA', -900.00, 900.00, 180.00, 5, 4,
   'legacy_visible_child_schedule', 'user_confirmed_audit_correction_20260820'),
  (DATE '2026-06-01', 'CD-LIST', 14030.00, 13810.00, 20.00, 9, 18,
   'legacy_visible_child_schedule', 'user_confirmed_audit_correction_20260820'),
  (DATE '2026-06-01', 'CD-SITI', -70.00, -10.00, 0.00, 15, 10,
   'legacy_visible_child_schedule', 'user_confirmed_audit_correction_20260820'),
  (DATE '2026-06-01', 'CD_SD (UNALLOCATED)', 1860.00, 0.00, 0.00, 18, NULL,
   'derived_unallocated_control_residual',
   'derived_user_confirmed_reconciliation_20260820');

DO $audit$
DECLARE
  v_actor CONSTANT varchar(50) := 'GT_DEBTOR_AUDIT_20260820';
  v_legacy_hash CONSTANT text :=
    'fe0b5989e73d11aa7dcfe0b062b4fec0405beefc79b2ad1d18322d52a80a29d0';
  v_audit_hash CONSTANT text :=
    '15a83afe4617366cdeeeb03befa6d81cc13f6e32bc9bc4aa8dfdc939a4cb4a0';
  v_old_anchor_note CONSTANT text :=
    'GT CD_SD consolidated control checkpoint at 2026-07-01: RM63,845.40 evidenced named sub-schedule plus RM1,860.00 printed-control residual. Logical identities live in greentarget.debtor_subledger_registry.';
  v_new_anchor_note CONSTANT text :=
    'GT CD_SD consolidated control checkpoint at 2026-07-01: RM65,705.40 user-confirmed named sub-schedule after the 2026-08-20 annotated-statement audit. Logical identities live in greentarget.debtor_subledger_registry; the GL control amount is unchanged.';
  v_snapshot_rows bigint;
  v_old_snapshots bigint;
  v_new_snapshots bigint;
  v_anchor_old boolean;
  v_anchor_new boolean;
BEGIN
  -- Lock every mutable row before deciding whether this is the first run or a
  -- no-op rerun. A partial/mixed state is never repaired by assumption.
  PERFORM snapshot.id
    FROM debtor_subledger_snapshots snapshot
    JOIN gt_july_debtor_audit_targets target
      ON target.as_of_month = snapshot.as_of_month
     AND target.account_code = snapshot.account_code
   ORDER BY snapshot.as_of_month, snapshot.account_code
     FOR UPDATE OF snapshot;

  PERFORM id
    FROM account_opening_balances
   WHERE account_code = 'CD_SD'
     AND as_of_date = DATE '2026-07-01'
     FOR UPDATE;

  SELECT COUNT(*)
    INTO v_snapshot_rows
    FROM debtor_subledger_snapshots snapshot
    JOIN gt_july_debtor_audit_targets target
      ON target.as_of_month = snapshot.as_of_month
     AND target.account_code = snapshot.account_code;
  IF v_snapshot_rows <> 10 THEN
    RAISE EXCEPTION
      'GT debtor audit expected 10 snapshot rows, found %; aborting.',
      v_snapshot_rows;
  END IF;

  IF (
    SELECT COUNT(*)
      FROM debtor_subledger_registry
     WHERE code IN ('CD-CASH', 'CD-DURA', 'CD-LIST', 'CD-SITI')
       AND control_account_code = 'CD_SD'
       AND kind = 'sundry'
       AND is_active
       AND is_selectable
  ) <> 4 THEN
    RAISE EXCEPTION
      'One or more audited debtor identities are missing, inactive or not selectable; aborting.';
  END IF;

  SELECT COUNT(*)
    INTO v_old_snapshots
    FROM debtor_subledger_snapshots snapshot
    JOIN gt_july_debtor_audit_targets target
      ON target.as_of_month = snapshot.as_of_month
     AND target.account_code = snapshot.account_code
   WHERE snapshot.closing_balance = target.old_closing
     AND snapshot.movement = target.expected_movement
     AND snapshot.source_file = 'GT_TRADE_DEBTORS.pdf'
     AND snapshot.source_sha256 = v_legacy_hash
     AND snapshot.source_page = target.expected_source_page
     AND snapshot.source_row IS NOT DISTINCT FROM target.expected_source_row
     AND snapshot.provenance = target.old_provenance;

  SELECT COUNT(*)
    INTO v_new_snapshots
    FROM debtor_subledger_snapshots snapshot
    JOIN gt_july_debtor_audit_targets target
      ON target.as_of_month = snapshot.as_of_month
     AND target.account_code = snapshot.account_code
   WHERE snapshot.closing_balance = target.new_closing
     AND snapshot.movement = target.expected_movement
     AND snapshot.source_file = 'GT_TRADE_DEBTORS.pdf'
     AND snapshot.source_sha256 = v_legacy_hash
     AND snapshot.source_page = target.expected_source_page
     AND snapshot.source_row IS NOT DISTINCT FROM target.expected_source_row
     AND snapshot.provenance = target.new_provenance
     AND snapshot.updated_by = v_actor
     AND snapshot.notes LIKE '%' || v_audit_hash || '%';

  SELECT EXISTS (
    SELECT 1
      FROM account_opening_balances
     WHERE account_code = 'CD_SD'
       AND as_of_date = DATE '2026-07-01'
       AND amount = 65705.40
       AND notes = v_old_anchor_note
  ) INTO v_anchor_old;

  SELECT EXISTS (
    SELECT 1
      FROM account_opening_balances
     WHERE account_code = 'CD_SD'
       AND as_of_date = DATE '2026-07-01'
       AND amount = 65705.40
       AND notes = v_new_anchor_note
  ) INTO v_anchor_new;

  IF v_old_snapshots = 10 AND v_anchor_old THEN
    UPDATE debtor_subledger_snapshots snapshot
       SET closing_balance = target.new_closing,
           provenance = target.new_provenance,
           notes = CASE
             WHEN target.account_code = 'CD_SD (UNALLOCATED)' THEN
               FORMAT(
                 'The 2026-08-20 annotated-statement audit allocated the former RM1,860.00 closing residual across CD-CASH (+RM220.00), CD-DURA (+RM1,800.00), CD-LIST (-RM220.00) and CD-SITI (+RM60.00), so the closing residual is zero. The movement remains %s. Evidence SHA-256: %s.',
                 TO_CHAR(target.expected_movement, 'FM999,999,990.00'),
                 v_audit_hash
               )
             ELSE
               FORMAT(
                 'User-confirmed 2026-08-20 correction from annotated statement.pdf (SHA-256 %s): the carried close was adjusted while movement remained %s. Original GT_TRADE_DEBTORS.pdf coordinates are retained for stable report order and legacy movement provenance.',
                 v_audit_hash,
                 TO_CHAR(target.expected_movement, 'FM999,999,990.00')
               )
           END,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor
      FROM gt_july_debtor_audit_targets target
     WHERE snapshot.as_of_month = target.as_of_month
       AND snapshot.account_code = target.account_code;

    UPDATE account_opening_balances
       SET notes = v_new_anchor_note,
           updated_at = CURRENT_TIMESTAMP
     WHERE account_code = 'CD_SD'
       AND as_of_date = DATE '2026-07-01';
  ELSIF v_new_snapshots = 10 AND v_anchor_new THEN
    RAISE NOTICE 'GT July debtor audit correction is already applied; no rows changed.';
  ELSE
    RAISE EXCEPTION
      'GT July debtor audit state is mixed or has drifted (old snapshots %, new snapshots %, old anchor %, new anchor %); aborting.',
      v_old_snapshots, v_new_snapshots, v_anchor_old, v_anchor_new;
  END IF;
END
$audit$;

DO $verify$
DECLARE
  v_may_rows bigint;
  v_may_close bigint;
  v_may_movement bigint;
  v_may_visible_close bigint;
  v_june_rows bigint;
  v_june_close bigint;
  v_june_movement bigint;
  v_june_visible_close bigint;
  v_bad_membership bigint;
  v_bad_rollforwards bigint;
  v_bad_targets bigint;
  v_july_control_movement bigint;
  v_july_tagged_movement bigint;
  v_july_control_close bigint;
BEGIN
  SELECT COUNT(*) FILTER (WHERE as_of_month = DATE '2026-05-01'),
         SUM(ROUND(closing_balance * 100)) FILTER (
           WHERE as_of_month = DATE '2026-05-01')::bigint,
         SUM(ROUND(movement * 100)) FILTER (
           WHERE as_of_month = DATE '2026-05-01')::bigint,
         SUM(ROUND(closing_balance * 100)) FILTER (
           WHERE as_of_month = DATE '2026-05-01'
             AND account_code <> 'CD_SD (UNALLOCATED)')::bigint,
         COUNT(*) FILTER (WHERE as_of_month = DATE '2026-06-01'),
         SUM(ROUND(closing_balance * 100)) FILTER (
           WHERE as_of_month = DATE '2026-06-01')::bigint,
         SUM(ROUND(movement * 100)) FILTER (
           WHERE as_of_month = DATE '2026-06-01')::bigint,
         SUM(ROUND(closing_balance * 100)) FILTER (
           WHERE as_of_month = DATE '2026-06-01'
             AND account_code <> 'CD_SD (UNALLOCATED)')::bigint
    INTO v_may_rows, v_may_close, v_may_movement, v_may_visible_close,
         v_june_rows, v_june_close, v_june_movement, v_june_visible_close
    FROM debtor_subledger_snapshots
   WHERE as_of_month IN (DATE '2026-05-01', DATE '2026-06-01');

  IF (
    v_may_rows, v_may_close, v_may_movement, v_may_visible_close,
    v_june_rows, v_june_close, v_june_movement, v_june_visible_close
  ) IS DISTINCT FROM (
    747::bigint, 6644540::bigint, -551000::bigint, 6644540::bigint,
    747::bigint, 6570540::bigint, -74000::bigint, 6570540::bigint
  ) THEN
    RAISE EXCEPTION
      'GT debtor snapshot totals failed after audit correction: May rows/close/movement/visible %/%/%/%, June %/%/%/%.',
      v_may_rows, v_may_close, v_may_movement, v_may_visible_close,
      v_june_rows, v_june_close, v_june_movement, v_june_visible_close;
  END IF;

  WITH may_codes AS (
    SELECT account_code
      FROM debtor_subledger_snapshots
     WHERE as_of_month = DATE '2026-05-01'
  ),
  june_codes AS (
    SELECT account_code
      FROM debtor_subledger_snapshots
     WHERE as_of_month = DATE '2026-06-01'
  )
  SELECT COUNT(*)
    INTO v_bad_membership
    FROM may_codes
    FULL OUTER JOIN june_codes USING (account_code)
   WHERE may_codes.account_code IS NULL OR june_codes.account_code IS NULL;
  IF v_bad_membership <> 0 THEN
    RAISE EXCEPTION
      'GT debtor audit found % May/June membership mismatch(es); aborting.',
      v_bad_membership;
  END IF;

  SELECT COUNT(*)
    INTO v_bad_rollforwards
    FROM debtor_subledger_snapshots may_snapshot
    JOIN debtor_subledger_snapshots june_snapshot
      ON june_snapshot.account_code = may_snapshot.account_code
     AND june_snapshot.as_of_month = DATE '2026-06-01'
   WHERE may_snapshot.as_of_month = DATE '2026-05-01'
     AND june_snapshot.closing_balance IS DISTINCT FROM
         may_snapshot.closing_balance + june_snapshot.movement;
  IF v_bad_rollforwards <> 0 THEN
    RAISE EXCEPTION
      'GT debtor audit left % May-to-June roll-forward mismatch(es); aborting.',
      v_bad_rollforwards;
  END IF;

  WITH targets(account_code, expected_close_cents, expected_movement_cents) AS (
    VALUES
      ('CD-CASH'::text, 1605400::bigint, 92000::bigint),
      ('CD-DURA'::text, 110000::bigint, 20000::bigint),
      ('CD-LIST'::text, 1644000::bigint, 263000::bigint),
      ('CD-SITI'::text, -1000::bigint, 0::bigint)
  ),
  july_movement AS (
    SELECT line.debtor_subledger_code AS account_code,
           SUM(ROUND((line.debit_amount - line.credit_amount) * 100))::bigint
             AS movement_cents
      FROM journal_entry_lines line
      JOIN journal_entries journal ON journal.id = line.journal_entry_id
     WHERE journal.status = 'posted'
       AND journal.entry_date BETWEEN DATE '2026-07-01' AND DATE '2026-07-31'
       AND line.account_code = 'CD_SD'
     GROUP BY line.debtor_subledger_code
  )
  SELECT COUNT(*)
    INTO v_bad_targets
    FROM targets target
    LEFT JOIN debtor_subledger_snapshots snapshot
      ON snapshot.as_of_month = DATE '2026-06-01'
     AND snapshot.account_code = target.account_code
    LEFT JOIN july_movement movement
      ON movement.account_code = target.account_code
   WHERE (
     ROUND(snapshot.closing_balance * 100)::bigint
       + COALESCE(movement.movement_cents, 0)
   ) IS DISTINCT FROM target.expected_close_cents
      OR COALESCE(movement.movement_cents, 0)
         IS DISTINCT FROM target.expected_movement_cents;
  IF v_bad_targets <> 0 THEN
    RAISE EXCEPTION
      'GT debtor audit left % handwritten-close or printed-movement mismatch(es); aborting.',
      v_bad_targets;
  END IF;

  SELECT SUM(ROUND((line.debit_amount - line.credit_amount) * 100))::bigint,
         SUM(ROUND((line.debit_amount - line.credit_amount) * 100)) FILTER (
           WHERE line.debtor_subledger_code IS NOT NULL)::bigint
    INTO v_july_control_movement, v_july_tagged_movement
    FROM journal_entry_lines line
    JOIN journal_entries journal ON journal.id = line.journal_entry_id
   WHERE journal.status = 'posted'
     AND journal.entry_date BETWEEN DATE '2026-07-01' AND DATE '2026-07-31'
     AND line.account_code = 'CD_SD';

  SELECT ROUND(opening.amount * 100)::bigint + v_july_control_movement
    INTO v_july_control_close
    FROM account_opening_balances opening
   WHERE opening.account_code = 'CD_SD'
     AND opening.as_of_date = DATE '2026-07-01';

  IF (v_july_control_movement, v_july_tagged_movement, v_july_control_close)
       IS DISTINCT FROM
     (1802500::bigint, 1802500::bigint, 8373040::bigint) THEN
    RAISE EXCEPTION
      'GT CD_SD control failed after audit correction: movement %, tagged %, close % cents.',
      v_july_control_movement, v_july_tagged_movement, v_july_control_close;
  END IF;

  RAISE NOTICE
    'GT July debtor audit OK: CD-CASH 16,054.00; CD-DURA 1,100.00; CD-LIST 16,440.00; CD-SITI -10.00; CD_SD 83,730.40; July movements unchanged.';
END
$verify$;

COMMIT;
