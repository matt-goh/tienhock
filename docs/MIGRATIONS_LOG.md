# Migrations Applied & Removed — Ledger

This file is the durable record of one-time SQL migrations that have been **run and then removed**
from `dev/migrations/`. The project convention is: run a migration on the dev database, document it
fully (schema in `CLAUDE.md`/`AGENTS.md` + the relevant handover doc), then **delete the `.sql`
file** and rely on git history for the exact SQL. This ledger tells a future implementer what has
already executed, on which environment, and where to recover the script from.

> **Recovering a removed script:** every file below existed at git commit **`5cfd925b`** (the HEAD
> immediately before this cleanup). Recover any one with:
> `git show 5cfd925b:dev/migrations/<filename>` (or `git log -- dev/migrations/<filename>` to find
> its full history). Docs that still link to `../../dev/migrations/<file>` now resolve through git
> history only — the links are intentional historical pointers, not live files.

**Status legend:** **dev** = applied to the `tienhock` dev database (which since 20 Jul 2026 is a
production copy). **prod** = applied to the live production server database (separate PM2 window,
requires separate approval).

> **2026-07-28 prod-status sweep:** tonight's fresh production dump (restored into dev for the GT
> G8 rehearsal) proved that most entries historically labelled "prod PENDING" below had in fact
> already been applied to production by the user — the dump contains the receipts Phase 1–7 tables
> (247 receipts), the V2/V3 anchors (`account_opening_balances` = 2,213 incl. the 62
> `legacy-report-v2` rows; `closing_stock_values` seeded), the foreign-GP unlink (OP/LGP `fs_note`
> NULL), the JP cancelled-invoice zeroing (0 cancelled JP invoices with non-zero amounts), the
> journal 2991 restore (`posted`, stamped `restore_journal_015375` 2026-07-28 16:44), the
> estimated-report foundation (135 lines), and GT G2+G3 (503 accounts / 34 notes, applied
> 2026-07-27 15:18). Those statuses are corrected below. **Remaining genuinely-prod-pending
> entries: none as of 2026-07-28 EOD** — GT G4/G7 and the estimated parity fixes were applied to
> production the same night (see the last section).

---

## Removed 11 Aug 2026 — 1 file (bill C026524 duplicate removal + re-date)

Applied to **production** in two passes on 2026-08-11 — Parts A and B first, then Part C after it was
added — then removed per the project convention. Never applied to dev: the dev database is a
production copy predating these bills (it ends 2026-07-31), so there was nothing there to fix. All
three parts were rehearsed on dev against a fabricated copy of both bills inside a rolled-back
transaction — a full apply, a re-run for idempotency, a run against the exact A+B-only production
state, and a fail-closed guard test on a non-cancelled bill.

> **Recover from the block below, NOT from git.** Commit `46d0d95a` contains an earlier 232-line
> version of this file with only Parts A and B — that is the version that was run in the first pass.
> Part C was added afterwards and the completed file was never committed, so the SQL embedded below
> is the only record of what production actually received in full.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-11_invoice_026524_duplicate_removal_and_redate.sql` | Cash bill `026524` (cancelled) was keyed on 10/08/2026 but belongs on 07/08/2026. Because the invoice page hid the date-edit button on a cancelled bill, it could not be corrected and was re-issued as `026524A`, leaving two cancelled bills for one sale, both printing on the 10/08 sales summary. **Part A** hard-deleted `026524A` (order details + payment rows cascade off `invoices`; its cancelled `S` journal and lines deleted separately) — there is no application path, `DELETE /api/invoices/:id` is a soft cancel that refuses an already-cancelled bill. **Part B** moved `026524`'s `createddate` to 07/08/2026, keeping its time of day. **Part C** dragged that bill's own cancelled `S` journal (`entry_date`) and cancelled auto-collection `payments` row (`payment_date`) onto 07/08/2026 too. | dev n/a, prod ✓ (A+B and C, both 2026-08-11) |

**Ledger effect: none, in any part.** Both bills were cancelled and zeroed and both of their journals
were cancelled — every report engine filters `je.status = 'posted'` (`financial-reports.js`,
`bank-statement.js`), so no posted line, debtor balance or customer credit moved on either date. The
only visible effect of Part C is that the Journal Entries list (which has no default status filter,
`journal-entries.js`) stopped showing the entry under 10/08 for a bill dated 07/08.

**Shipped in the same change (code, not SQL):** the Date/Time edit button is no longer hidden on a
cancelled bill (`src/pages/Invoice/InvoiceDetailsPage.tsx` — it was the only thing blocking this;
`PUT /api/invoices/:id/datetime` never checked for cancellation), and `syncSalesJournalEntry`'s
cancelled branch now re-dates the cancelled journal and cancelled auto-collection row along with the
invoice (`src/routes/accounting/sales-journal.js`), guarded on `status = 'cancelled'` so it can never
touch a posted journal and on `manual_override = false` so a detached human-owned journal keeps its
own date. Parts B and C are therefore exactly what the UI itself now does; this script was only ever
needed for the one bill that was already stuck. Jelly Polly's invoice page already allowed this, so
Tien Hock now matches it.

Exact SQL:

```sql
-- 2026-08-11 Tien Hock: bill C026524 -- remove the duplicate C026524A and
-- re-date the original from 10/08/2026 back to 07/08/2026.
--
-- WHAT HAPPENED
-- Cash bill 026524 was keyed on 10/08/2026 but belongs on 07/08/2026. It was
-- already cancelled, and until today the invoice page hid the date-edit button
-- on a cancelled bill, so the date could not be corrected. Rosa re-issued the
-- same bill as 026524A instead, leaving TWO cancelled bills for one sale, both
-- printing on the 10/08 sales summary.
--
-- WHAT THIS DOES
--   Part A -- hard-deletes invoice 026524A and everything it owns: its order
--             details and payment rows (both cascade off invoices), and its
--             cancelled sales journal with its lines. There is no application
--             path for this: DELETE /api/invoices/:id is a SOFT cancel and
--             refuses an already-cancelled bill outright.
--   Part B -- moves invoice 026524's createddate from 10/08/2026 to
--             07/08/2026, keeping its original time of day.
--   Part C -- drags that bill's own CANCELLED sales journal and CANCELLED
--             automatic collection row onto 07/08/2026 too, so the Journal
--             Entries list and the payment history agree with the bill.
--
-- Parts B and C are exactly what the invoice page's "Change Date & Time" dialog
-- now does for a cancelled bill: the button was restored in the same change,
-- and syncSalesJournalEntry's cancelled branch now drags the cancelled journal
-- and the cancelled auto-collection row along with the bill. So once that code
-- is deployed this script is only needed for the bill that was already stuck --
-- and running it changes nothing that the UI would not have done.
--
-- LEDGER EFFECT: none. Both bills are cancelled, both are zeroed, both of
-- their journals are cancelled, and a cancelled journal is excluded from every
-- report. No posted line, no debtor balance and no customer credit moves.
--
-- Guarded, idempotent and fail-closed: one transaction, every precondition
-- asserted. Part A refuses to run if 026524A turns out to be live, non-zero,
-- receipted, adjusted, consolidated, still valid at MyInvois, or if any journal
-- it owns is still posted or is referenced by another document.
--
-- ============================================================================
-- APPLICATION STATUS -- READ BEFORE RUNNING
--
--   Parts A and B were applied to PRODUCTION on 2026-08-11, from the version of
--   this file that did not yet contain Part C. So in production right now:
--     * 026524A is deleted,
--     * 026524 is dated 07/08/2026,
--     * BUT its cancelled journal and cancelled auto-collection row are still
--       sitting on 10/08/2026.
--
--   TO FINISH: re-run this whole file against production. It is idempotent --
--   Part A finds no 026524A and skips with a NOTICE, Part B finds 026524
--   already on 07/08 and skips with a NOTICE, and only Part C does work. Expect
--   exactly this output:
--     NOTICE:  Part A: invoice 026524A does not exist - already deleted, no change
--     NOTICE:  Part B: invoice 026524 is already dated 2026-08-07 - no change
--     NOTICE:  Part C: journal <id> re-dated (1 row)
--     NOTICE:  Part C: 1 cancelled auto-collection row(s) re-dated
--
--   Never applied to dev: the dev database is a production copy taken before
--   these bills existed (it ends 2026-07-31), so there is nothing there to fix.
--   All three parts were rehearsed on dev against a fabricated copy of both
--   bills inside a rolled-back transaction -- apply, re-run, and a fail-closed
--   guard test on a non-cancelled bill.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  -- "C" on the printed bill is the cash-bill prefix; the stored ids carry no C.
  v_dup_id       CONSTANT varchar := '026524A';
  v_keep_id      CONSTANT varchar := '026524';
  v_wrong_date   CONSTANT date    := DATE '2026-08-10';
  v_right_date   CONSTANT date    := DATE '2026-08-07';

  v_inv          record;
  v_count        integer;
  v_journal_ids  integer[];
  v_jid          integer;
  v_old_epoch    bigint;
  v_new_epoch    bigint;
  v_local_ts     timestamp;
BEGIN
  ------------------------------------------------------------------
  -- PART A -- delete the duplicate bill 026524A.
  ------------------------------------------------------------------
  SELECT * INTO v_inv FROM invoices WHERE id = v_dup_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'Part A: invoice % does not exist - already deleted, no change', v_dup_id;
  ELSE
    -- It must be a cancelled, fully zeroed bill. We never delete live money.
    IF v_inv.invoice_status <> 'cancelled' THEN
      RAISE EXCEPTION 'Invoice % is % , not cancelled - refusing to delete',
        v_dup_id, v_inv.invoice_status;
    END IF;

    IF COALESCE(v_inv.totalamountpayable, 0) <> 0
       OR COALESCE(v_inv.balance_due, 0) <> 0
       OR COALESCE(v_inv.total_excluding_tax, 0) <> 0
       OR COALESCE(v_inv.tax_amount, 0) <> 0 THEN
      RAISE EXCEPTION 'Invoice % is not fully zeroed (total %, balance %) - refusing to delete',
        v_dup_id, v_inv.totalamountpayable, v_inv.balance_due;
    END IF;

    IF COALESCE(v_inv.is_consolidated, false) THEN
      RAISE EXCEPTION 'Invoice % is a consolidated wrapper - refusing to delete', v_dup_id;
    END IF;

    -- A live e-Invoice at MyInvois must be cancelled there first, or deleting
    -- the local row orphans a valid government document.
    IF v_inv.uuid IS NOT NULL
       AND COALESCE(v_inv.einvoice_status, '') NOT IN ('cancelled', 'invalid') THEN
      RAISE EXCEPTION 'Invoice % still has e-Invoice % in status % - cancel it at MyInvois first',
        v_dup_id, v_inv.uuid, v_inv.einvoice_status;
    END IF;

    -- No other document may reference it.
    SELECT COUNT(*) INTO v_count FROM receipt_allocations WHERE invoice_id = v_dup_id;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Invoice % is allocated by % receipt line(s) - refusing to delete',
        v_dup_id, v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM adjustment_documents WHERE original_invoice_id = v_dup_id;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Invoice % is referenced by % adjustment document(s) - refusing to delete',
        v_dup_id, v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM invoices
     WHERE is_consolidated = true
       AND consolidated_invoices::jsonb ? v_dup_id;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Invoice % is part of % consolidated submission(s) - refusing to delete',
        v_dup_id, v_count;
    END IF;

    -- Every payment row on it must already be cancelled (the invoice
    -- cancellation cascade does this; an active row means something is wrong).
    SELECT COUNT(*) INTO v_count FROM payments
     WHERE invoice_id = v_dup_id AND (status IS NULL OR status = 'active');
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Invoice % still has % active payment row(s) - refusing to delete',
        v_dup_id, v_count;
    END IF;

    ------------------------------------------------------------------
    -- Collect every journal this bill owns: its sales journal, anything
    -- source-linked to it, and any journal hanging off its payment rows.
    ------------------------------------------------------------------
    SELECT ARRAY(
      SELECT DISTINCT j FROM (
        SELECT v_inv.journal_entry_id AS j
        UNION
        SELECT id FROM journal_entries
         WHERE source_type = 'invoice' AND source_id = v_dup_id
        UNION
        SELECT journal_entry_id FROM payments WHERE invoice_id = v_dup_id
      ) s WHERE j IS NOT NULL
    ) INTO v_journal_ids;

    FOREACH v_jid IN ARRAY COALESCE(v_journal_ids, ARRAY[]::integer[]) LOOP
      SELECT COUNT(*) INTO v_count FROM journal_entries
       WHERE id = v_jid AND status = 'cancelled';
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'Journal % owned by invoice % is not cancelled - refusing to delete',
          v_jid, v_dup_id;
      END IF;

      -- Never delete a journal another document still points at.
      SELECT
        (SELECT COUNT(*) FROM receipts             WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM bank_ins             WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM rv_registry          WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM adjustment_documents WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM purchase_invoices    WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM self_billed_invoices WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM supplier_payments    WHERE journal_entry_id = v_jid)
      + (SELECT COUNT(*) FROM invoices             WHERE journal_entry_id = v_jid
                                                     AND id <> v_dup_id)
      + (SELECT COUNT(*) FROM payments             WHERE journal_entry_id = v_jid
                                                     AND invoice_id IS DISTINCT FROM v_dup_id)
        INTO v_count;
      IF v_count > 0 THEN
        RAISE EXCEPTION 'Journal % is referenced by % other document(s) - refusing to delete',
          v_jid, v_count;
      END IF;
    END LOOP;

    ------------------------------------------------------------------
    -- Delete. order_details and payments cascade off invoices;
    -- journal_entry_lines cascades off journal_entries.
    ------------------------------------------------------------------
    UPDATE invoices SET journal_entry_id = NULL WHERE id = v_dup_id;

    DELETE FROM invoices WHERE id = v_dup_id;

    IF v_journal_ids IS NOT NULL AND array_length(v_journal_ids, 1) > 0 THEN
      DELETE FROM journal_entries WHERE id = ANY(v_journal_ids);
    END IF;

    RAISE NOTICE 'Part A: deleted invoice % and journal(s) %',
      v_dup_id, COALESCE(v_journal_ids, ARRAY[]::integer[]);
  END IF;

  ------------------------------------------------------------------
  -- PART B -- re-date the surviving bill 026524 to 07/08/2026.
  ------------------------------------------------------------------
  SELECT * INTO v_inv FROM invoices WHERE id = v_keep_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found - nothing to re-date', v_keep_id;
  END IF;

  v_old_epoch := v_inv.createddate::bigint;
  v_local_ts  := to_timestamp(v_old_epoch / 1000.0) AT TIME ZONE 'Asia/Kuala_Lumpur';

  IF v_local_ts::date = v_right_date THEN
    RAISE NOTICE 'Part B: invoice % is already dated % - no change', v_keep_id, v_right_date;
  ELSE
    IF v_local_ts::date <> v_wrong_date THEN
      RAISE EXCEPTION 'Invoice % is dated % , expected % - refusing to re-date',
        v_keep_id, v_local_ts::date, v_wrong_date;
    END IF;

    -- Keep the original time of day; only the calendar day moves.
    v_new_epoch := (EXTRACT(EPOCH FROM
                      ((v_right_date + v_local_ts::time) AT TIME ZONE 'Asia/Kuala_Lumpur')
                    ) * 1000)::bigint;

    UPDATE invoices SET createddate = v_new_epoch::text WHERE id = v_keep_id;

    RAISE NOTICE 'Part B: invoice % re-dated % -> % (epoch % -> %)',
      v_keep_id, v_wrong_date, v_right_date, v_old_epoch, v_new_epoch;
  END IF;

  ------------------------------------------------------------------
  -- PART C -- drag 026524's own cancelled records onto the same day.
  --
  -- Its sales journal and its automatic collection row were both dated 10/08
  -- with the bill. Both are CANCELLED, so this moves nothing in the ledger:
  -- every report engine filters je.status = 'posted'. It is done purely so the
  -- Journal Entries list and the bill's payment history stop showing 10/08 for
  -- a bill dated 07/08. Refuses outright if the journal is still posted.
  ------------------------------------------------------------------
  -- Find the journal the same three ways Part A and syncSalesJournalEntry do:
  -- the invoice's own link, the source back-reference, and the pre-column
  -- legacy convention reference_no = the invoice id.
  SELECT ARRAY(
    SELECT DISTINCT j FROM (
      SELECT v_inv.journal_entry_id AS j
      UNION
      SELECT id FROM journal_entries
       WHERE source_type = 'invoice' AND source_id = v_keep_id
      UNION
      SELECT id FROM journal_entries
       WHERE reference_no = v_keep_id AND entry_type = 'S'
    ) s WHERE j IS NOT NULL
  ) INTO v_journal_ids;

  IF v_journal_ids IS NULL OR array_length(v_journal_ids, 1) IS NULL THEN
    RAISE NOTICE 'Part C: invoice % owns no journal - nothing to re-date', v_keep_id;
  ELSE
    FOREACH v_jid IN ARRAY v_journal_ids LOOP
      -- Never move a posted journal: that WOULD shift the ledger, and it is not
      -- this script's job. A cancelled bill should never have one.
      SELECT COUNT(*) INTO v_count FROM journal_entries
       WHERE id = v_jid AND status = 'cancelled';
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'Journal % of invoice % is not cancelled - refusing to re-date it',
          v_jid, v_keep_id;
      END IF;

      UPDATE journal_entries
         SET entry_date = v_right_date, updated_at = NOW()
       WHERE id = v_jid
         AND entry_date = v_wrong_date;

      GET DIAGNOSTICS v_count = ROW_COUNT;
      RAISE NOTICE 'Part C: journal % re-dated (% row)', v_jid, v_count;
    END LOOP;
  END IF;

  -- Only the invoice-owned automatic collection row follows the bill. A genuine
  -- receipt keeps its own date: when the money arrived is a separate fact.
  UPDATE payments
     SET payment_date = v_right_date
   WHERE invoice_id = v_keep_id
     AND is_auto_collection = true
     AND status = 'cancelled'
     AND payment_date::date = v_wrong_date;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Part C: % cancelled auto-collection row(s) re-dated', v_count;

  ------------------------------------------------------------------
  -- Post-conditions.
  ------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count FROM invoices WHERE id = v_dup_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Post-check failed: invoice % still exists', v_dup_id;
  END IF;

  SELECT COUNT(*) INTO v_count FROM invoices
   WHERE id = v_keep_id
     AND (to_timestamp(createddate::bigint / 1000.0) AT TIME ZONE 'Asia/Kuala_Lumpur')::date
         = v_right_date;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Post-check failed: invoice % is not dated %', v_keep_id, v_right_date;
  END IF;
END $$;

COMMIT;

-- Verify afterwards:
--   SELECT id, invoice_status, totalamountpayable, journal_entry_id,
--          to_char(to_timestamp(createddate::bigint / 1000.0)
--                  AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI') AS kl_datetime
--     FROM invoices WHERE id IN ('026524', '026524A');
--   -- expect exactly one row: 026524, cancelled, 2026-08-07.
```

---

## Removed 7 Aug 2026 — 1 file (receipt 162 C015353/C015360/C015364/C015372 received-date correction)

Applied to **dev and production** on 2026-08-07, then removed per the project
convention. The exact SQL is embedded below for recovery.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-07_receipt_162_received_date_correction.sql` | Cash receipt 162 (ROSE, RM91.60 across invoices 015353/015360/015364/015372) was keyed as received 2026-08-07 but was actually received 2026-07-07 and banked in on 2026-07-10. Corrected `receipts.received_date`/`posting_date` for receipt 162, the owning REC journal 3743's `entry_date`, and the four `payments` rows (5584-5587) to 2026-07-07. No amounts, accounts, references, statuses or totals changed; the bank-in (bank_in 94, posted 2026-07-10) is untouched. | dev ✓, prod ✓ (both 2026-08-07) |

Exact SQL:

```sql
-- 2026-08-07 Tien Hock: cash receipt 162 (ROSE, RM91.60 across invoices
-- 015353 / 015360 / 015364 / 015372) was keyed with the wrong received date:
-- 2026-08-07. The cash was actually received on 2026-07-07 and was banked in
-- on 2026-07-10 (posted bank-in 94 / RV), so the receipt, its journal and its
-- payment rows are moved to 2026-07-07.
--
-- WHAT THIS DOES
--   * receipts 162: received_date and posting_date 2026-08-07 -> 2026-07-07,
--   * journal_entries 3743 (the posted REC journal): entry_date
--     2026-08-07 -> 2026-07-07,
--   * payments 5584-5587 (one row per invoice allocation): payment_date
--     2026-08-07 -> 2026-07-07.
-- No amounts, accounts, references, statuses, balances or totals change --
-- only the date. The bank-in itself (bank_in 94, posted 2026-07-10) is
-- untouched and remains after the corrected receipt date.
--
-- Guarded, idempotent, fail-closed: one transaction, pre- and post-state
-- asserted.

BEGIN;

DO $$
DECLARE
  v_receipt_id CONSTANT integer := 162;
  v_journal_id CONSTANT integer := 3743;
  v_from       CONSTANT date    := DATE '2026-08-07';
  v_to         CONSTANT date    := DATE '2026-07-07';
  v_count      integer;
BEGIN
  ------------------------------------------------------------------
  -- Idempotency: already corrected -> no-op.
  ------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count FROM receipts
   WHERE id = v_receipt_id
     AND received_date = v_to AND posting_date = v_to
     AND status = 'posted' AND journal_entry_id = v_journal_id;
  IF v_count = 1 THEN
    RAISE NOTICE 'Receipt % already dated % - correction already applied, no change',
      v_receipt_id, v_to;
    RETURN;
  END IF;

  ------------------------------------------------------------------
  -- Preconditions: exact pre-state.
  ------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count FROM receipts
   WHERE id = v_receipt_id
     AND received_date = v_from AND posting_date = v_from
     AND status = 'posted' AND journal_entry_id = v_journal_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Receipt % is not the expected posted receipt dated %',
      v_receipt_id, v_from;
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entries
   WHERE id = v_journal_id
     AND status = 'posted' AND entry_type = 'REC'
     AND source_type = 'receipt' AND source_id = v_receipt_id::text
     AND entry_date = v_from AND COALESCE(manual_override, false) = false;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Journal % is not the expected posted, unmodified REC journal dated %',
      v_journal_id, v_from;
  END IF;

  SELECT COUNT(*) INTO v_count FROM payments
   WHERE receipt_allocation_id IN (
           SELECT id FROM receipt_allocations WHERE receipt_id = v_receipt_id)
     AND payment_date = v_from::timestamp;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 payment rows dated % for receipt %, found %',
      v_from, v_receipt_id, v_count;
  END IF;

  ------------------------------------------------------------------
  -- Move the date. Amounts, accounts, references and status are untouched.
  ------------------------------------------------------------------
  UPDATE receipts
     SET received_date = v_to, posting_date = v_to, updated_at = NOW()
   WHERE id = v_receipt_id;

  UPDATE journal_entries
     SET entry_date = v_to, updated_at = NOW()
   WHERE id = v_journal_id;

  UPDATE payments
     SET payment_date = v_to::timestamp
   WHERE receipt_allocation_id IN (
           SELECT id FROM receipt_allocations WHERE receipt_id = v_receipt_id)
     AND payment_date = v_from::timestamp;

  RAISE NOTICE 'Receipt % / journal % / 4 payment rows moved from % to %',
    v_receipt_id, v_journal_id, v_from, v_to;
END
$$;

------------------------------------------------------------------
-- Post-conditions.
------------------------------------------------------------------
DO $$
DECLARE
  v_count integer;
  v_debit numeric;
  v_credit numeric;
BEGIN
  SELECT COUNT(*) INTO v_count FROM receipts
   WHERE id = 162 AND received_date = DATE '2026-07-07'
     AND posting_date = DATE '2026-07-07' AND status = 'posted';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Receipt 162 is not dated 2026-07-07';
  END IF;

  SELECT COUNT(*) INTO v_count FROM journal_entries
   WHERE id = 3743 AND entry_date = DATE '2026-07-07' AND status = 'posted';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Journal 3743 is not dated 2026-07-07';
  END IF;

  SELECT COUNT(*) INTO v_count FROM payments
   WHERE receipt_allocation_id IN (
           SELECT id FROM receipt_allocations WHERE receipt_id = 162)
     AND payment_date = TIMESTAMP '2026-07-07 00:00:00';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 payment rows dated 2026-07-07, found %', v_count;
  END IF;

  SELECT SUM(debit_amount), SUM(credit_amount) INTO v_debit, v_credit
    FROM journal_entry_lines WHERE journal_entry_id = 3743;
  IF v_debit IS DISTINCT FROM v_credit OR v_debit <> 91.60 THEN
    RAISE EXCEPTION 'Journal 3743 unbalanced: DR % / CR %', v_debit, v_credit;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM bank_in_allocations bia
    JOIN bank_in_groups big ON big.id = bia.group_id
    JOIN bank_ins bi ON bi.id = big.bank_in_id
   WHERE bia.receipt_id = 162 AND bi.status = 'posted';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected receipt 162 in one posted bank-in, found %', v_count;
  END IF;

  RAISE NOTICE 'All post-conditions passed';
END
$$;

COMMIT;
```

---

## Removed 7 Aug 2026 - 1 file (Green Target invoice Delivery Order reference)

Applied to **dev** on 2026-08-07. The file was removed per the project
convention, then **restored on 2026-08-07** because production had not run it
yet; the exact SQL is also embedded below for recovery.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-07_greentarget_invoice_delivery_order.sql` | Added nullable `delivery_order varchar(100)` to `greentarget.invoices` — an optional record-only Delivery Order (DO) reference keyed on the invoice form and shown on the invoice list cards / details page. No accounting, e-Invoice, rental or payment effect. Companion code: invoice POST/PUT in `src/routes/greentarget/invoices.js`; the old rental-based GT Delivery Order page/route/endpoint were removed at the same time. | dev ✓, prod ✓ (both 2026-08-07) |

Exact SQL:

```sql
-- Add an optional Delivery Order (DO) reference to Green Target invoices.
-- Record-only field: the user keys any DO number linked to an invoice; it has
-- no effect on accounting, e-invoice, rental or payment logic.

ALTER TABLE greentarget.invoices
  ADD COLUMN IF NOT EXISTS delivery_order character varying(100);
```

**Production:** applied on 2026-08-07.

---

## Removed 6 Aug 2026 (second batch) — 1 file (bill 2005042 same-day counter cash → CH_REV1)

Applied to **dev and production** on 2026-08-06, then removed per the project convention. The file
existed at commit **`cb895076`** — recover with
`git show cb895076:dev/migrations/2026-08-06_invoice_2005042_same_day_cash_chrev1.sql`.

Production pre-state was verified to match dev **exactly** before the run (same ids `257`/`12100`/
`12164`/`12165`, same amounts, dates and shapes), which matters because this file resolves rows by
hardcoded id rather than by fingerprint. Run over SSH as the `tienhock` OS user with
`psql -d tienhock_prod -v ON_ERROR_STOP=1 -f /tmp/chrev1_2005042.sql`, sha256 of the copied file
checked against the local one first (`3c60971d…`), temp file deleted afterwards.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-06_invoice_2005042_same_day_cash_chrev1.sql` | Bill `2005042` (DKJ, RM988, 28/07/2026) was paid RM392 physical cash at the counter **on its own sale day** plus RM596 online. `receipt-service.js` hardcoded `method === 'cash' ? 'CH_REV2'` with no date test, so the counter cash was filed as a late debtor collection. This repoints receipt `257` and its journal `12165` debit line from **CH_REV2 to CH_REV1**, and corrects the mis-keyed reference `C2005041` → `C2005042` on the receipt, the journal header, the journal line and the `payments` row (`2005041` is a different customer's bill, NEVER-S). The bill stays a credit **INVOICE** and its revenue stays in **CR_SALES** — only *where the cash sits* changes. Net ledger effect: CH_REV2 −392.00, CH_REV1 +392.00 on 28/07/2026; totals unchanged. Guarded, idempotent (`ALREADY APPLIED` no-op branch confirmed by a second dev run), fail-closed, one transaction. Companion code: `resolveCashHoldingAccount` in `src/routes/accounting/cash-holding-account.js`, shared by receipt posting and imported-payment duplicate lookup. | dev ✓, prod ✓ (both 2026-08-06) |

**Evidence for the rule** (re-derived from the immutable Jan–May legacy import, not assumed).
Cash-holding **debit** lines split cleanly by date with **no exceptions**: CH_REV1 holds 1,184
`CASH BILL…` lines **plus 5 receipts against an invoice, all same-day**; CH_REV2 holds **90
receipts, every one a later collection**, and **zero** `CASH BILL` lines. The five same-day CH_REV1
receipts — `C2004611` KITANI 200.00, `C63366` YONGMAJU 3.00, `C026174` IRENE 0.30, `C2004725` 1M
761.70, `C2004791` BIG-T 1,217.50 — are all against credit **INVOICES** whose sales were credited to
**CR_SALES**, which is exactly bill 2005042's shape. So the CH_REV1/CH_REV2 split is a **date** rule,
not a document-type rule: bill type decides the revenue account, payment date decides the cash
account. (The code comment saying "91 cash receipts against invoices" undercounts — the real total is
**95**; 4 were missed by a zero-padded/pre-2026 reference match: `023384`, `026135-1`, `015309`,
`015306`. All four resolve to **later** collections, reinforcing the rule.)

> **Superseded first attempt:** an earlier file in this series,
> `2026-08-06_invoice_2005042_cash_bill_restore.sql`, converted the bill to a **CASH** bill and moved
> the full RM988 from CR_SALES to CASH_SALES. That was based on a wrong reading of CH_REV1 (assuming
> it was for cash bills only) and **was reverted before this file ran**; the shipped migration opens
> with a precondition that refuses to run unless the bill is back in its correct INVOICE/CR_SALES
> shape. No revenue reclassification was ever needed, and the confirmation requested from AMY on that
> point is moot.

**Production verification after the run** (independent queries, not the migration's own notices):
journal `12165` = DR `CH_REV1` 392.00 / CR `DKJ` 392.00, header **and** line `display_reference`
`C2005042`; receipt `257` = `CH_REV1` / `C2005042` / posted; payment `5970` reference `C2005042`;
journal `12100` untouched (DR `DKJ` 988.00 / CR `CR_SALES` 988.00); online receipt `256` / journal
`12164` untouched (DR `BANK_PBB` 596.00 / CR `DKJ` 596.00); invoice still `INVOICE` / `paid` /
`balance_due` 0; `DKJ.credit_used` 0.00; **zero** `C2005041` references remain database-wide;
28/07/2026 posted holding movement now CH_REV1 DR 10,187.00 / CH_REV2 DR 720.00.

> **Server-access note (corrects gotcha (a) in the 2 Aug GT-P5 section):** `sudo` on the Hetzner box
> requires a password, so `sudo -u postgres psql …` **cannot** be run over a non-interactive SSH
> session (`sudo: a terminal is required to read the password`); the only NOPASSWD rule is
> `/usr/local/sbin/deploy-tienhock-nginx`. The `tienhock` OS user, however, connects to the
> production database directly via peer auth — `psql -d tienhock_prod -c "…"` works with no sudo and
> no `.env` sourcing. The earlier "the `tienhock` user has no matching role" note was only about
> psql's *default database name*: `-d tienhock_prod` is all that was missing.

---

## Removed 6 Aug 2026 — 2 files (June 2026 legacy reclassification: moves + E8–E11, then E1–E7 + MRM/MGT offsets)

Applied to **dev and production** on 2026-08-06 (dev via the Phase 2 execution, prod by the user),
then removed per the project convention. Both existed at commit **`8bd5e45f`** — recover either
with `git show 8bd5e45f:dev/migrations/<filename>`.

Full narrative: [Account/JUNE_RECLASS_DESIGN.md](Account/JUNE_RECLASS_DESIGN.md) (Phase 1 design +
Phase 2 execution note). Evidence: `JUNE_MRM&MGT.pdf` at repo root (printed 06 AUG 2026 — the
coworker's legacy June ledgers for MRM/MGT), the boss-annotated `CORRECTED_JUNE_TRIAL_BALANCE.pdf`,
and the `dev/import/legacy-june-tb/june-2026-legacy-ledgers.json` fixture. Run in this order — file
2 has a prerequisite guard that aborts unless file 1's move #14 is already present.

> **PARTIALLY REVERSED 7 Aug 2026 — do not re-run either file.** Three corrections below turned out
> to be wrong: the June legacy **print** they were derived from carried keying errors of the
> coworker's own. She corrected them in the legacy program and in the ERP on 2026-08-07 (journals
> `PCE004/06` 00:29, `PBE054/06` 00:46), reversing **move #3** (KFC LINTAS 40.00 stays in `MBSM_K`,
> not `MBC`) and **E10+E11** (PAUMIN #2606-2133 splits `MBRMF` 565.00 / `MBSAF` 144.00, not
> 465.00 / 244.00). Everything else in both files stands and is verified in production. Re-running
> would trip the files' own guards and, if forced, reintroduce the three wrong classifications.
> June movements are now MBC 919.10 · MBSM_K 3,126.49 · MBRMF 5,135.60 · MBSAF 1,329.55; every
> other reconciled account is unchanged, all five vouchers still foot, and the June TB is still
> 17,106,536.00/side. Full narrative:
> [Account/JUNE_RECLASS_DESIGN.md](Account/JUNE_RECLASS_DESIGN.md) §e.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-05_june_legacy_reclass.sql` | June 2026 legacy reclassification — SAFE SCOPE ONLY. Applied the **14 fixture-verified account_code moves** on manual source-less June C/B journals (PCE002/06, PCE004/06, PCE007/06, PCE008/06, PBE054/06) plus amount edits **E8–E11**. Moves: PCE004/06 MBOR→BRM 482.31 (JING XIAN YOU BIHUN food-grade rubber), MBOR→MBC 5.50 (EMART leg), MBSM_K→MBC 40.00 (KFC LINTAS), MBSM_K→MBOR 29.00 (LIDO MARKET), MBSM_O→MBSM_K 26.50 (HO KEE), OIL9698→OIL6323 30.00 (SHELL BUNDUSAN #01001886), BRM→MRM 9.05 (SHUANG MEI HARDWARE); PCE007/06 MBSM_K→MBSM_O 107.70 (ORIENTAL COFFEE), OILOTH→OIL920 40.00 (SHELL BUNDUSAN #01002075, inferred — no legacy OIL920 detail); PCE008/06 MBSM_K→MBOR 12.90 (MIX STORE), MBRM→MBRMF 400.00 (HV ELECTRICAL SINO copper cable), OIL9882→OIL9922 80.00 (SHELL SYT. EXCEL); PCE002/06 OIL9698→R9698 23.00 (KK SEAL) and 100.00 (DIGNITY BRAND). Edits: PCE008/06 MBRM 43.85→43.90 and 629.50→629.45; PBE054/06 MBRMF 565.00→465.00 + MBSAF 144.00→244.00 (one PAUMIN receipt, total 709.00 unchanged). **E1–E7 deliberately excluded** — they net +0.38 on PCE004/06 and only land together with the MRM (−0.32)/MGT (−0.06) offsets in file 2. Lines resolved by (journal reference, account, amount, particulars), never dev jel.id, so the file ports to prod unchanged. Post-assertions: every journal header total unchanged and still footing, 24 accounts at expected June movement (six with inline PENDING deltas), untouched controls, June TB stays 17,102,880.87/side. CR_LD +40.00 remains out of scope (source-document anomaly, design §d.3). Data correction only, no schema change. | dev ✓, prod ✓ (both 2026-08-06) |
| `2026-08-06_june_legacy_reclass_e1_e7_mrm_mgt.sql` | Follow-up: **13 amount edits** landing E1–E7 together with the MRM/MGT offsets, once `JUNE_MRM&MGT.pdf` confirmed the legacy detail. E1–E7 on PCE004/06 (net +0.38): MBC 46.60→46.65, MBRM 13.60→13.55, MBSAF 160.56→160.55, MBSM_K 54.00→54.40 and 19.30→19.29, BRM 26.70→26.71, BRM 482.31→482.30 (move #1's line). MRM offsets (−0.32 total): PCE004/06 21.29→21.25 (HU HAO), 89.10→89.12 (SHUANG MEI #511494253448), 23.00→22.65 (FOSHAN NAN FANG) = −0.37; PCE008/06 24.55→24.60 (ZHE JIANG SHEN HONG) = +0.05. MGT offsets (−0.06 total): PCE004/06 88.21→88.20 = −0.01; PCE008/06 80.50→80.45 = −0.05. PCE004/06 nets 0.00 (+0.38 −0.38) and PCE008/06 nets 0.00, so both vouchers stay total-neutral and CASH never drifts. The legacy MRM ledger shows SHUANG MEI keyed at exactly 9.05, disproving the design's "8.73 variant" and making move #14 fixture-verified. Post-assertions: journal totals unchanged and footing, **all 24 accounts at exact legacy June movement, all 17 affected accounts' 2026-06-30 YTD tie the legacy printed June TB to the cent**. `dump-bihun-june.mjs` lands every boss target (MBC 479.55 · MBOR 799.40 · MBRMF 2,517.80 · MBSAF 714.78 · Staff Messing 2,669.10 · VRE-Diesel 1,555.67 · VRE-Repair 1,753.50 · expenses 64,238.82 · machine repair 2,319.22 · FINAL 14.0504). No account moves, no credit lines touched; guarded, idempotent, fail-closed; data correction only. | dev ✓, prod ✓ (both 2026-08-06) |

---

## Removed 6 Aug 2026 — 1 file (Green Target rentals optional fields)

Applied to **dev and production** on 2026-08-06, then removed per the project convention. The file
existed at commit **`8bd5e45f`** — recover with
`git show 8bd5e45f:dev/migrations/2026-08-06_greentarget_rentals_optional_fields.sql`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-06_greentarget_rentals_optional_fields.sql` | Made `greentarget.rentals.date_placed` nullable. GT rentals no longer track physical tong movement (that is kept in Excel) — a rental now exists to hold the customer's site/address and carry the invoice → payment → journal chain, so the dumpster and both dates are optional metadata. `tong_no` was already nullable; `date_placed` was the only remaining `NOT NULL` column. Single guarded, idempotent `ALTER TABLE greentarget.rentals ALTER COLUMN date_placed DROP NOT NULL` (skips when already nullable), one transaction, no data written. The rental form already treats the fields as optional (empty values are sent as explicit `null`s). | dev ✓, prod ✓ (both 2026-08-06) |

---

## Removed 5 Aug 2026 — 2 files (TH PCE002/06 reclass + GT employee pay rates)

Both existed at commit **`a92104dd`** — recover either with
`git show a92104dd:dev/migrations/<filename>`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-05_pce002_acwj_sal_reclass.sql` | TH June 2026 TB reconciliation (boss-annotated `CORRECTED_JUNE_TRIAL_BALANCE.pdf`; full narrative in [ACCOUNTING_PROGRESS.md §7](Account/ACCOUNTING_PROGRESS.md)). Re-pointed the two settlement lines on manual C journal `PCE002/06` (id `2850`, display `PV002/06`, 10/06/2026) from `ACWJ_SAL` to `ACW_SAL`: DR 3,110.48 `INCENTIVES WORKERS(06/2026)` and DR 349.52 `ANNUAL LEAVE WORKRS(06/2026)`. `ACWJ_SAL` ("ACCRUAL THJ (SALARY PAYABLES)") is an account no voucher ever accrues to, so the debits had created a spurious 3,460.00 DR balance; the legacy program settled the same items against `ACW_SAL`. After the fix `ACWJ_SAL` has zero lines database-wide and both accounts match the legacy June TB exactly (`ACWJ_SAL` 0.00, `ACW_SAL` 59,027.75 CR at 2026-06-30); the June TB totals drop from 17,109,996.00 to 17,106,536.00 per side (legacy final 17,106,340.87 — the remaining 195.13/side residual is tracked separately in §7). Guarded, idempotent, fail-closed; data correction only, no schema change. Prod application independently re-verified over SSH after the run: journal 2850 lines correct and still balanced (17,462.00/17,462.00), zero `ACWJ_SAL` lines remain, June-30 balances exact. | dev ✓, prod ✓ (both) |
| `2026-08-05_greentarget_employee_pay_rates.sql` | Created `greentarget.employee_pay_codes` and `greentarget.pay_rate_schedules` — GT-scoped per-employee pay-rate overrides layered over the SHARED `public.staffs` / `public.pay_codes` catalogue (exact column-shape mirrors of the public tables), so staff on both companies' payrolls can hold different rates per company. Rate precedence: GT schedule > GT override > public employee override > public job/base rate. Seeded the user-confirmed first overrides: directors GOH and WONG draw RM1,700/month `BULAN_BM` at Green Target versus the shared RM3,500 at Tien Hock (previously keyed manually into each GT monthly log); guarded to seed only while the shared RM3,500 override exists, `ON CONFLICT DO NOTHING`. Served by `/greentarget/api/employee-pay-codes` (`src/routes/greentarget/employee-pay-codes.js`). Prod application verified over SSH: both tables present, both seed rows at 1,700.00, schedules table empty. | dev ✓, prod ✓ (both) |

---

## Removed 2 Aug 2026 — 6 files (GT-P5 v2 production rollout: invoice/receipt parity → debtor dimension)

The **entire GT-P1…GT-P12 sequence** was applied to `tienhock_prod` on the Hetzner server on
2026-08-02 in one maintenance window, in the [GT-P5 v2 runbook](GT/GT_ACCOUNTING_HANDOVER.md#gt-p5-v2--corrected-production-rollout-runbook-2-aug-2026)
order, then removed per the project convention. All six existed at commit **`050110d0`** — recover
any one with `git show 050110d0:dev/migrations/<filename>`.

Dev had already been refreshed from a production dump and the whole sequence replayed on it
(handover §GT-P5 v2), so production matched the rehearsal exactly: 15 July invoices, journal ids
`1706`/`1707`/`1724` identical, no divergence anywhere.

| Order | File | What it did | Status |
|-------|------|-------------|--------|
| 1 | `2026-07-30_greentarget_invoice_receipt_parity.sql` | GT-P1 schema + durable receipt headers. Added `greentarget.customers.debtor_account_code`, `greentarget.invoices.debtor_account_code`/`revenue_account_code` (CHECK: TGA/TGB/WS_OTH), created `greentarget.receipts` and `greentarget.payments.receipt_id`. Snapshotted the account choices already evidenced by each invoice's `S` journal (**15 invoices**), then grouped every referenced payment into **130 durable receipt headers** and linked **130** payment rows, so one keyed GT reference owns one consolidated `REC` journal. Opens with the two receipt-identity guards that the runbook's step 0b pre-flight duplicates — a normalized reference spanning multiple dates/methods, or mixed allocation statuses, aborts before any DDL. | dev ✓, prod ✓ (both) |
| 2 | `2026-07-30_greentarget_cd_sd_subledger.sql` | GT-P2 CD_SD cutover. Made `CD_SD` a protected active/system TD account on note `22` and parent of the **746** evidenced legacy trade-debtor children; loaded **1,494** May/June `debtor_subledger_snapshots` rows from the hash-pinned `cd_sd_subledger_evidence.csv`; wrote **747** 2026-07-01 opening anchors totalling **RM65,705.40** (746 children + the RM1,860.00 unallocated residual on the control). Pre-July anchors and all Jan–Jun journals untouched. | dev ✓, prod ✓ (both) |
| 3 | `2026-07-31_greentarget_erp_ledger_reconciliation.sql` | GT-P8. Records that the legacy ledger is the source of truth — the GT ERP only ever issued e-Invoices, so its open balances are not receivables. Wrote **13** exact-name customer→account links (incl. `SUTERA SERIMEWAH SDN BHD` → `SERIMEWAH`, resolving the old `debtor-map.json` SUTERA ambiguity) and closed **24** stale ERP invoices (RM5,270.00) with `origin='legacy_operational'` receipt headers carrying `journal_entry_id` NULL — a shape `syncGTReceiptJournalEntry` refuses to post, so **no journal was created, modified or cancelled**. SINOFLEX keeps one genuine bill open (`2026/01000` RM230.00). Names matched NORMALIZED, never by customer id. **Must precede file 4**, which asserts these links. | dev ✓, prod ✓ (both) |
| 4 | `2026-07-31_greentarget_july_debtor_decisions.sql` | GT-P4 master data, posts no journal. Created the **6** new post-cutover `CD_SD` leaves (`CD-ZEXIE`, `CD-MIZAN`, `CD-ALISWODI`, `CD-ABE`, `CD-KELVINYAP`, `CD-MIMIEE`), approved `PAUMIN`/`NURI` onto their genuine legacy leaves (**UPDATE 2**), and resolved **10** July invoice snapshots — every live July invoice except the four already given audited leaves by the step-3 script and the duplicate `342`. | dev ✓, prod ✓ (both) |
| 5 | `2026-08-01_greentarget_debtor_dimension.sql` | GT-P9. Created `greentarget.debtor_subledger_registry` (**780** logical identities, **779** selectable; `CD_SD (UNALLOCATED)` stays snapshot metadata only) and `journal_entry_lines.debtor_subledger_code`; rewrote every post-cutover `CD_SD` movement onto the real GL control with a logical identity tag, sourced only from document ownership (invoice/receipt/payment/adjustment) — never from particulars or a formatted reference; retired the **752** GL child shells and consolidated their July openings into one **RM65,705.40** control anchor. Fail-closed: an untagged or non-selectable post-cutover `CD_SD` line aborts the whole transaction. Prod notice: `July money unchanged: TD movement 2320.00, of which CD_SD 1910.00, PBB_1 movement 730.00, CD_SD close 67615.40, TD close 159102.22`. | dev ✓, prod ✓ (both) |
| 6 | `2026-08-01_greentarget_invoice_revenue_splits.sql` | GT-P10. Created `invoice_revenue_splits` / `adjustment_revenue_splits` (dense ordered account/amount rows; duplicate accounts deliberate, totals must balance exactly) and `invoice_number_sequences`. Backfilled **15** invoice splits from the existing journals. New entry allows TGA/TGB/WS_OTH; `WS_OTH4` is inherited historical data only. | dev ✓, prod ✓ (both) |

**Two `.mjs` steps run between the migrations** (both open their own `pg` pool, neither is a
migration file, both remain in `dev/import/greentarget-legacy/`):

- After file 2, pinned to pre-GT-P9 services (`git checkout de09f185 -- src/routes/greentarget dev/import/greentarget-legacy`):
  `backfill-july-automatic-journals.mjs --apply-safe` — applied only the **4** audited debtor
  mappings (`CD-ENRICH` 338, `HUNG TAI` 341, `CD-MS` 343, `CD-DCH` 345) and left all 14 review
  blockers untouched.
- After file 4: `apply-july-lifecycle-decisions.mjs --apply` — restored journals `1706`/`1707`
  (cancellation is a status flip that deletes no lines, so restore is its exact inverse) and
  re-synced them to DR `CD-MS` / CR `TGB` and DR `CD-ZEXIE` / CR `TGA`; cancelled invoice `342`
  and journal `1724`, the duplicate of locked imported reference `2026/01009` (journal `1590`).
  Then `backfill-july-automatic-journals.mjs --apply` with **zero blockers** — 8 invoice re-syncs,
  3 consolidated `REC` journals, 4 no-ops, 2 cancelled receipts correctly skipped.
  Finally `git checkout HEAD -- src/routes/greentarget dev/import/greentarget-legacy` before files 5–6.

**Verification after deploy** (`GT_IMPORT_DB_MODE=direct`): `verify-import.mjs` **66 gates /
2,844 per-account comparisons**, `verify-chart.mjs` **59 gates**,
`verify-multi-allocation-receipt.mjs` **21 gates**. `verify-trade-debtor-list.mjs` was **not run** —
it hash-pins `GT_TRADE_DEBTORS.pdf` at the repo root as its *first* gate and that gitignored scan is
not on the server, so it aborted before opening a database connection. Its unique coverage is
presentation-layer (row order, hide-zero 14 direct / 83 child rows, residual not rendered as a
customer row, PDF pagination); every data invariant it asserts is already covered by the two green
verifiers plus the migrations' own post-conditions, and the presentation behaviour was confirmed on
screen instead. Tien Hock isolation gates all passed (`public.account_codes` above the 2,827 floor,
`financial_statement_notes` 33, `journal_entries` above 8,238, no TH line referencing a GT account).

> **Three server-environment gotchas this run added to the runbook:**
> (a) **The production database is `tienhock_prod`**, and the `tienhock` OS user has no matching
> role — a bare `psql -f …` fails with `FATAL: database "tienhock" does not exist`. Every SQL step
> must be `sudo -u postgres psql -d tienhock_prod -v ON_ERROR_STOP=1 -f …`, run from
> `~/tienhock-app` (sudo preserves the working directory, so a relative path resolves against
> wherever you actually are).
> (b) **The `.mjs` scripts do not read `.env`** and default to `tienhock@localhost:5434` — the dev
> Docker database. Run `set -a; . ./.env; set +a` first. Source the *whole* file, not just the
> `DB_*` lines: it also sets `NODE_ENV=production`, which `db-pool.js` uses to enable SSL, and
> that is how the live server connects.
> (c) **Blocker 2 was already tripped before the window opened.** The GT-P9 code was merged to
> `production` and auto-deployed at 10:19 that morning, hours before the migrations ran, so the
> deployed services were querying a `debtor_subledger_registry` that did not exist. Nothing broke
> in practice only because nobody opened a GT accounting page in between. The runbook says deploy
> **last** for exactly this reason.

---

## Removed 30 Jul 2026 (fourth batch) — 1 file (Estimated report JAGUNG stock fixes + June Add Backs)

Applied to **dev and production** on 2026-07-30, then removed per the project convention. The file
existed at commit **`eaaaa45c`** — recover with
`git show eaaaa45c:dev/migrations/2026-07-30_estimated_report_jagung_stock_fixes.sql`.

Verified after both runs: `material_stock_entries` id `294` = 196 × 70.2500 = 13,769.00 and id `141`
= 409 × 54.0000 = 22,086.00; `estimated_report_inputs` holds the two June 2026 rows stamped
`created_by = estimated_report_2026-07-30_fix`; BIHUN JAGUNG totals May **33,209.00** / June
**22,086.00**. A rerun reports `FIX-1 ALREADY FINAL` / `FIX-2 ALREADY FINAL` and re-passes both
postflights (confirmed on dev).

| File | What it did | Status |
|------|-------------|--------|
| `2026-07-30_estimated_report_jagung_stock_fixes.sql` | June 2026 Estimated P&L corrections. **FIX-1/FIX-2:** the BIHUN JAGUNG (Tepung Jagung, material 27/`B3`) physical stock counts were keyed with one-digit typos — May `KK RICE + TRANSPORT` 276 → **196** bags (19,389.00 → **13,769.00**) and June `HOMCO` 399 → **409** bags (21,546.00 → **22,086.00**) — confirmed by the boss's handwritten counts on the legacy print and by four independent arithmetic checks (closing total 414,685.86, opening total 486,311.65, unit-cost JAGUNG usage 28,403.00). Only `adjustment_quantity`/`adjustment_value`/`updated_at` change; unit costs, SODIUM rows and every other material are untouched. **FIX-3:** keyed the boss's handwritten June Add Backs into `estimated_report_inputs` (MEE 9,658.83 / BIHUN 6,662.66) with `ON CONFLICT DO NOTHING` plus a guard that aborts rather than overwrite a different user-keyed value. No journal is posted and no GL account moves — the Estimated report derives everything at read time. Guarded, idempotent, fail-closed: each fix accepts **only** the exact old state or the exact final state (full identity fingerprint on year/month/product line/material/variant/unit cost/quantity/custom fields, plus material+variant existence and a single logical row), and a report-level postflight asserts both monthly JAGUNG totals. SERIALIZABLE, `lock_timeout 5s`, one transaction. Narrative: [Account/ESTIMATED_REPORT_HANDOVER.md](Account/ESTIMATED_REPORT_HANDOVER.md) §9.5; changelog entry shipped 2026-07-30. | dev ✓, prod ✓ (both 2026-07-30) |

> **Why this needed two attempts:** the first production run was pasted into an *interactive* `psql`
> session. The file opens with the meta-command `\set ON_ERROR_STOP on`, and psql's backslash-command
> argument parser hit the unbalanced apostrophes in the header comments ("boss's…"), swallowing the
> entire remaining file as one argument and failing with
> `unrecognized value "on--Thisisraninprod…" for "ON_ERROR_STOP": Boolean expected`. **Nothing
> executed** — no `BEGIN`, no `COMMIT`, and the target rows kept their 2026-07-21 `updated_at`, so the
> database was never touched. The successful run used
> `sudo -u postgres psql -d tienhock_prod -v ON_ERROR_STOP=1 -f /tmp/jagung.sql` after copying the
> file out of `~/tienhock-app/dev/migrations/` to `/tmp` (the `postgres` user cannot read the app
> directory — the same `chmod a+rX` snag as the GT G8 rollout). **Never paste a migration into
> interactive psql; always run it from a file with `-f`.**

---

## Removed 30 Jul 2026 (third batch) — 2 files (GT customer billing address + PBB1 removal)

Applied to **dev and production** on 2026-07-30 (prod runs by the user), then removed per the project
convention. Both existed at commit **`971c157c`** — recover with
`git show 971c157c:dev/migrations/<filename>`.

Dev state verified at removal: `greentarget.customers.billing_address` exists as nullable `text`
(0 customers have one keyed yet, so every invoice/e-Invoice still bills to its rental locations);
`greentarget.account_codes` = **502** rows with no `PBB1`, and
`greentarget.account_opening_balances` = **500** rows summing to exactly **0.00** with no `PBB1`
fence. Reruns are clean no-ops (`ADD COLUMN IF NOT EXISTS`; `PBB1 already removed - nothing to do`).

| File | What it did | Status |
|------|-------------|--------|
| `2026-07-30_greentarget_customer_billing_address.sql` | Added `greentarget.customers.billing_address` (nullable `text`) — a customer's office/billing address, separate from their service/pickup locations. When set, GT invoice PDFs and individual sales/adjustment e-Invoices bill to it instead of the rental location addresses, and pickup Sites are **not** appended to the e-Invoice address lines; NULL = the previous behaviour (bill to the rental location address(es)). Single `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — no data written, no default, no constraint, nothing else touched, so a rerun is an exact no-op. Companion code: the GT customer form field, `GTInvoicePDF.tsx`, and the individual e-Invoice address builder. Schema note: `CLAUDE.md`/`AGENTS.md` `greentarget.customers`; changelog entry shipped 2026-07-30. | dev ✓, prod ✓ (both 2026-07-30) |
| `2026-07-30_greentarget_remove_pbb1.sql` | Removed the dormant duplicate bank account **`PBB1`** from the GT chart. `PBB_1` is the real, active account (594 journal lines, opening anchor 19,797.31); `PBB1` was a G3-seeded lookalike with the **identical** description (`PBB-A/C:3137836814 (BW)`), **zero** journal lines and a single **0.00** opening fence, so its removal changes no balance and no report total — it simply stops printing as a 0.00 Trial Balance row. Deleted the zero fence, then the account, through the same guards as the new GT delete endpoint: refuses a system account, an account with children, an account with any journal line, and an account whose opening anchors are multiple or non-zero; post-check asserts the anchor set still sums to exactly 0.00. Guarded, idempotent, fail-closed, one transaction. **Do not rerun the G3 chart load after this** — `ON CONFLICT DO NOTHING` would re-create `PBB1`; the removal is instead recorded as approved in the verifiers (`REMOVED_SEEDS` in `verify-chart.mjs`, `REMOVED_ZERO_FENCES` in `verify-import.mjs`, and the `NOT IN (VALUES ('PBB1'))` filters in `verify-import.sql`, whose G4 gate now expects 500 anchors), and `build-chart.mjs` trap 2 still requires both codes in the *generated* payload. Schema notes: `CLAUDE.md`/`AGENTS.md` `greentarget.account_codes` + `greentarget.account_opening_balances`. Narrative: [Account/GT_ACCOUNTING_HANDOVER.md](Account/GT_ACCOUNTING_HANDOVER.md) "Post-G7 — Chart of Accounts maintenance"; changelog entry shipped 2026-07-30. | dev ✓, prod ✓ (both 2026-07-30) |

---

## Removed 30 Jul 2026 (second batch) — 2 files (GT manual payment types + rental add-ons removal)

Applied to **dev and production** on 2026-07-30 (prod runs by the user), then removed per the project
convention. Both existed at commit **`09596c44`** — recover with
`git show 09596c44:dev/migrations/<filename>`.

Dev state verified at removal: `greentarget.journal_entry_types` = 12 rows including `B`/`C`/`J`;
`greentarget.rental_addons` and `greentarget.addon_paycodes` both gone (`to_regclass` NULL);
`daily_lori_habuk_lines_source_type_chk` = PLACEMENT/PICKUP/MANUAL/DERIVED only, and all 359 existing
lines are `MANUAL` (zero ADDON rows). Reruns are clean no-ops.

| File | What it did | Status |
|------|-------------|--------|
| `2026-07-30_greentarget_manual_payment_types.sql` | Seeded the three Tien Hock manual journal entry types into `greentarget.journal_entry_types` — `B` (Bank Payment), `C` (Cash Payment), `J` (Journal) — names/descriptions copied verbatim from `public.journal_entry_types`, so staff can key GT payment vouchers on the Journal Entries page exactly like TH (request 29–30 Jul 2026). GT keeps its own design: **no header `cheque_no` machinery** — cheque/transaction references stay per LINE, the shared Journal form hides the TH cheque field for GT, and next-reference prefixes are C→PCE, B→PBE, J→JNL. `ON CONFLICT (code) DO NOTHING`, so a rerun is an exact no-op. Schema note: `CLAUDE.md`/`AGENTS.md` `greentarget.journal_entry_types`. | dev ✓, prod ✓ (both 2026-07-30) |
| `2026-07-30_greentarget_remove_rental_addons.sql` | Removed the GT **rental add-ons** feature, which was never used — extra driver pay is keyed with the **Manual Item** button on the payroll details page, which reads the shared `pay_codes` catalogue and never touched these tables. Dropped `greentarget.rental_addons` + `greentarget.addon_paycodes` and rebuilt `daily_lori_habuk_lines_source_type_chk` without the `ADDON` value (now PLACEMENT/PICKUP/MANUAL/DERIVED). Guarded and fail-closed: aborts before dropping anything if any `greentarget.daily_lori_habuk_lines` row still carries `source_type='ADDON'`. Idempotent (`DROP TABLE IF EXISTS` + `DROP CONSTRAINT IF EXISTS` then re-add). Companion code removals: the `/greentarget/api/rental-addons` router, the addon-paycode CRUD in `payroll-rules.js`, the ADDON prefill branch in `driverTripRules.js`, the rentals `addon_count` column expression, `RentalAddonModal.tsx`, the rental form Add-ons section, the rental list add-on badge, and the Addon Paycodes section/modal on the Payroll Settings page. Narrative: [GT/GT_PAYROLL_PHASE2_HANDOVER.md](GT/GT_PAYROLL_PHASE2_HANDOVER.md) "Rental add-ons REMOVED (2026-07-30)" — add-on references in its Phase 2/3 sections are historical. | dev ✓, prod ✓ (both 2026-07-30) |

---

## Removed 30 Jul 2026 — 1 file (GT orphaned invoice journals)

Applied to **dev and production** on 2026-07-30 (prod run by the user), then removed per the project
convention. Recover with
`git show ee180c6d:dev/migrations/2026-07-30_greentarget_orphan_invoice_journals.sql`.

Dev state at removal: journal `1709` and its 2 lines gone; zero cancelled `greentarget`
`entry_type='S'` journals whose source invoice no longer exists; `2026/01013` free to key again.
A rerun is a clean no-op (`Orphaned GT sales journals to remove: none`).

| File | What it did | Status |
|------|-------------|--------|
| `2026-07-30_greentarget_orphan_invoice_journals.sql` | Deleted cancelled Green Target sales journals whose invoice had been hard-deleted. `DELETE /greentarget/api/invoices/:invoice_id` (reachable only for a **cancelled** invoice, in the open period) used to remove the invoice row alone, leaving its invoice-owned `S` journal behind as `status='cancelled'` still holding `reference_no` = the invoice number. `journal_entries_reference_no_key` is unique across **all** statuses while the invoice-number availability check only reads `greentarget.invoices`, so the UI reported "Invoice number is available" and the create then failed with `duplicate key value violates unique constraint "journal_entries_reference_no_key"` — **any GT invoice number that was ever cancelled + deleted was permanently unusable**. Observed on `2026/01013` (invoice 327, RIDZUAN, RM250, journal 1709, DR CD_SD / CR TGA). Scope: `entry_type='S'` + `source_type='invoice'` + `status='cancelled'` + the source invoice genuinely gone + no invoice back-linking to it, so a legacy `IMP` import, a receipt/adjustment journal and a source-less manual journal are all excluded by construction; lines cascade. No ledger effect — a cancelled journal is read by no report, trial balance or account ledger, and it was unrestorable anyway (the restore endpoint refuses a journal whose owning document is gone). Guarded, idempotent, fail-closed (aborts if any GT payment or adjustment document still references an orphan); post-check asserts none remain. Companion code change: the delete path in `src/routes/greentarget/invoices.js` now removes the invoice's own cancelled sales journal in the same transaction, so no new orphan can be created. Narrative: GT_ACCOUNTING_HANDOVER.md §10h; changelog entry shipped 2026-07-30. | dev ✓, prod ✓ (both 2026-07-30) |

---

## Removed 29 Jul 2026 — 1 file (GT salary voucher generator foundation)

Applied and verified on dev, then removed per the project convention. Recover with
`git show 2f4860b6:dev/migrations/2026-07-28_greentarget_salary_vouchers.sql`.

Confirmed present in the dev database at removal time: `greentarget.journal_entry_types` has `JBSL`
(Staff Salary Wages) and `JWDR` (Director Remuneration); `greentarget.salary_voucher_branches` has 4
seeded driver rows (AFRED, JULPAKAL, MASTIN, YONUS), all branch `BW`. Also applied to production by
the user (2026-07-29).

| File | What it did | Status |
|------|-------------|--------|
| `2026-07-28_greentarget_salary_vouchers.sql` | Foundation for the GT Voucher Generator (`src/routes/greentarget/accounting/journal-vouchers.js`, page `GTVoucherGeneratorPage.tsx` under Accounting → Generation): added journal entry types `JBSL` (Staff Salary Wages) and `JWDR` (Director Remuneration), continuing the imported legacy `JBSL/MM/YY` / `JWDR/MM/YY` voucher series; created `greentarget.salary_voucher_branches` (per-driver Lori Habuk branch mapping, BW/SS, used to split DRIVER wages between the BW\_\* and SS\_\* account families), seeded with all 4 current drivers in BW (movable from the Voucher Generator page without a code change). Guarded, idempotent (`ON CONFLICT DO NOTHING` + post-check asserting both types and all 4 seed rows exist). | dev ✓, prod ✓ (applied by the user 2026-07-29) |

---

## Removed 28 Jul 2026 (third batch) — 8 files (GT G2/G3/G4/G7 + estimated report + unit-cost precision, post-G8)

All eight were applied to **both dev and production** (prod: G2/G3 on 2026-07-27 15:18 by the user;
the rest during the 28 Jul G8 window — see the prod-rollout section at the bottom of this file;
the unit-cost precision widening was applied to prod later the same night), so
per the project convention the `.sql` files are deleted and recovered from git history when needed:
all eight are tracked at commit **`50e63344`** — `git show 50e63344:dev/migrations/<filename>`.
The three foundation files (estimated + GT G2/G3) had already been removed once (the "3 files"
section below) and were restored to the working tree for the G8 rehearsal/rollout; this is their
second, final removal.

| File | Reference |
|------|-----------|
| `2026-07-25_estimated_report_foundation.sql` | ESTIMATED_REPORT_HANDOVER.md §9.4 |
| `2026-07-26_greentarget_accounting_foundation.sql` | GT_ACCOUNTING_HANDOVER.md §9 (G2) |
| `2026-07-26_greentarget_chart_of_accounts.sql` | GT §9 (G3); regenerable via `build-chart.mjs` |
| `2026-07-27_greentarget_import_date_encoding.sql` | GT §10b/§10f; needs the TH-baseline re-pin on any rerun |
| `2026-07-27_greentarget_opening_anchors.sql` | GT §10b/§10f; GENERATED — regenerate via `build-import-staging.mjs`, never hand-edit |
| `2026-07-28_greentarget_g7_organic_posting.sql` | GT §9 (G7)/§10f |
| `2026-07-28_estimated_report_parity_data_fixes.sql` | ESTIMATED_REPORT_HANDOVER.md §5 |
| `2026-07-28_material_unit_cost_precision.sql` | Widened the four material unit-cost columns from `numeric(10,2)` to `numeric(10,4)` (`materials.default_unit_cost`, `material_variants.default_unit_cost`, `material_stock_entries.unit_cost`, `material_stock_kilang_entries.unit_cost`) so rates like 0.035 store exactly; RM value columns stay at 2 decimals. Metadata-compatible widening — existing values untouched. **Prod application was verified by evidence before it ran:** the 2026-07-28 prod dump showed 2-decimal display (`282.50`) vs dev's 4-decimal (`282.5000`). |

---

## Removed 28 Jul 2026 (second batch) — 2 files (JP cancelled-invoice zeroing + journal 015375 restore)

Both files below were removed from `dev/migrations/` on 2026-07-28, after the batch immediately
below. **Nothing new was executed — documentation + file removal only.** **Recover either with
`git show a88079b2:dev/migrations/<filename>`** (`a88079b2` is the HEAD immediately before this
removal).

Dev state verified at removal time: 1 cancelled `jellypolly.invoices` row, 0 cancelled JP invoices or
order-detail lines carrying a non-zero amount; journal `2991` `posted`, 2 lines, 34.00 DR = 34.00 CR.

| File | What it did | Status |
|------|-------------|--------|
| `2026-07-28_jellypolly_zero_cancelled_invoices.sql` | Backfill for invoices cancelled **before** the JP cancel handler was brought in line with Tien Hock's: zeroed `jellypolly.order_details` (quantity, price, total, freeproduct, returnproduct, tax) and `jellypolly.invoices` (total_excluding_tax, tax_amount, rounding, totalamountpayable, balance_due) for every `invoice_status = 'cancelled'` row, **preserving each line's product code and description** (TH behaviour). TH's handler always zeroed both; the JP clone only ever set `balance_due = 0`, so a cancelled JP invoice kept its full Total Payable and line amounts. Beyond display this corrected a real number — the JP customer-statement previous-balance query (`src/routes/jellypolly/debtors.js`) sums `totalamountpayable` with no `invoice_status` filter, so cancelled invoices were inflating brought-forward balances. `customers.credit_used` deliberately **not** touched (JP maintains it incrementally and the cancel handler already reversed it). Guards: aborts if any cancelled invoice still has an ACTIVE payment or an active non-consolidated adjustment document; SERIALIZABLE + `lock_timeout 5s`; post-check that no cancelled invoice retains a non-zero amount. **Destructive and irreversible by design** (billed quantities/prices of cancelled invoices are discarded). Idempotent, fail-closed. Companion code change: the JP cancel handler in `src/routes/jellypolly/invoices.js`. Changelog entry shipped 2026-07-28. | dev ✓, prod ✓ (confirmed in the 2026-07-28 prod dump: 0 cancelled JP invoices with non-zero amounts) |
| `2026-07-28_restore_journal_015375.sql` | Restored sales journal `2991` — invoice `015375`, VIVIANA, RM34.00, `entry_date` 2026-06-29, DR `VIVIANA` / CR `CR_SALES` — cancelled by mistake. It is `source_type='invoice'` AND `manual_override=true`, so `syncSalesJournalEntry` returns early and would never rebuild it, leaving an active **paid** invoice with no GL presence and no workflow able to restore it. Cancellation is a pure status flag (no reversing entry posted, no lines deleted), so flipping `status` back to `posted` restores the exact pre-cancel state. Guards: full header + line identity fingerprint (refs, type, date, source, amounts, description, both accounts, exactly 2 lines), never restores into the locked pre-2026-06-01 period, invoice still active and still pointing at journal 2991, and no competing posted journal on the same source (`journal_entries_source_posted_uq`). Idempotent — the ALREADY-FINAL branch no-ops when the entry is already posted. | dev ✓ (see note), prod ✓ (confirmed in the 2026-07-28 prod dump: journal 2991 `posted`, stamped `restore_journal_015375` at 2026-07-28 16:44 — applied via the migration on prod) |

> **Note on the dev state of journal 2991:** it is posted and balanced, but `updated_by` is NULL
> rather than the migration's `restore_journal_015375` stamp (`updated_at` 2026-07-28 02:29:41), so
> the dev restore most likely went through the new **Restore Entry** button
> (`POST /api/journal-entries/:id/restore`), which implements the same guards generally — leaving the
> migration's ALREADY-FINAL no-op branch as the path taken on dev. The end state is what the
> migration asserts either way. On production the migration itself was run (the stamp and timestamp
> above prove it).
>
> **Known remaining instance of the same defect** (not covered by this migration, restorable through
> the button): journal `2786` / `JCN-202607-0001`, cancelled while its credit note `TH-CN-26-1`
> (RM21.55) is still active. See the `CLAUDE.md` / `AGENTS.md` "Journal restore + journal 015375
> correction (2026-07-28)" schema note.

---

## Removed 28 Jul 2026 — 3 files (Estimated report Phase 1 + Green Target G2/G3)

All three files below were removed from `dev/migrations/` on 2026-07-28 after being applied and
verified on dev. **Nothing new was executed — documentation + file removal only.** They were created
after `5cfd925b`, so **recover them with `git show 26afc11b:dev/migrations/<filename>`** (`26afc11b`
is the HEAD immediately before this removal).

Confirmed present in the dev database at removal time: 135 `estimated_report_lines` + 447
`estimated_report_line_sources`; 503 `greentarget.account_codes` + 34
`greentarget.financial_statement_notes`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-07-25_estimated_report_foundation.sql` | Estimated P&L / Unit Cost report (MEE & BIHUN) **Phase 1**: created `estimated_report_lines`, `estimated_report_line_sources`, `estimated_report_inputs`, `estimated_report_anchors` and seeded 135 lines / 447 source members from the legacy formula pages (ClosingStockReport.pdf p3–p8) + the June 2026 printed report; seeded the 2026-06-01 accumulative anchors (MEE −166,900.31, BIHUN 404,935.44). Schema + mappings only — posts no journal, changes no stock/sales data, computes no report value. Idempotent (rebuilds seeded lines/members; never touches user-keyed `estimated_report_inputs`; anchors inserted only when absent). **Must also be re-applied after any production→dev DB import that drops the `estimated_report_*` tables** — see ESTIMATED_REPORT_HANDOVER.md §9.4 "Deployment / DB-refresh note". | dev ✓, prod ✓ (present in the 2026-07-28 prod dump — 135 lines; the user applied it directly to prod before the dump was taken) |
| `2026-07-26_greentarget_accounting_foundation.sql` | Green Target **Phase G2**: cloned the accounting layer into the `greentarget` schema — 8 tables (`ledger_types`, `journal_entry_types`, `financial_statement_notes`, `account_codes`, `journal_entries`, `journal_entry_lines`, `account_opening_balances`, `import_legacy_rows`) + the `account_codes_hierarchy` **VIEW** — and seeded the 6 ledger types, the `IMP` journal type and the **34-note** GT financial-statement catalogue (incl. the GT-only `statement_block` column and the three GT/TH semantic collisions: note `9`, `18-2`, `23`). Creates no account code, journal or anchor; touches no `public` table. **Baseline-independent** (snapshots the TH counts into a temp table inside its own transaction and asserts them unmoved), so it applies cleanly to any database — unlike the G4 migrations. Idempotent; an unchanged rerun is an exact no-op. | dev ✓, prod ✓ (applied to prod by the user 2026-07-27 15:18; confirmed in the 2026-07-28 prod dump) |
| `2026-07-26_greentarget_chart_of_accounts.sql` | Green Target **Phase G3**: loaded the **503-account** legacy seed chart into `greentarget.account_codes` (473 GTLD ledger accounts + `BTFS` + the `DEBTOR` control + 28 GTDB debtor children), with `fs_note` = the printed Trial Balance APPX verbatim and `ledger_type` derived from printed evidence (BK 5 / GL 440 / TC 29 / TD 29). **GENERATED FILE — never hand-edited**: regenerate with `node dev/import/greentarget-legacy/build-chart.mjs`, verify with `verify-chart.mjs` (55 gates); sha256 at removal `abe56e5f…`. Creates no journal/line/anchor and touches no `public` table (tail asserts the TH baseline unmoved). **Baseline-independent.** Rerun is `ON CONFLICT DO NOTHING` — preserves user overrides and tolerates extra live rows. | dev ✓, prod ✓ (applied to prod by the user 2026-07-27 15:18; confirmed in the 2026-07-28 prod dump) |

**Rebuild order after a dev DB refresh (GT_ACCOUNTING_HANDOVER.md §10c):** G2 → G3 → G4
(`2026-07-27_greentarget_import_date_encoding.sql` + staging load + `…_opening_anchors.sql` —
recover from git history at `50e63344`; they require the §10b TH-baseline re-pin) → G7
(`2026-07-28_greentarget_g7_organic_posting.sql`). G2 and G3 apply as-is at any baseline.

**Prod:** GT — G2/G3 were applied to production by the user on 2026-07-27 15:18 (before G8 was even
defined); G4 + G7 followed on 2026-07-28 during the G8 rollout — see the last section of this file.
Estimated report — the foundation migration was likewise already in prod (2026-07-28 dump), and
`2026-07-28_estimated_report_parity_data_fixes.sql` was applied to prod on 2026-07-28.

---

## Ran 24 Jul 2026 — REC journals display_reference backfill (no migration file kept)

One-time data backfill executed directly (never committed as a `.sql` file — the exact statement is
preserved below). Companion code change: `VISIBLE_REFERENCE_SQL` in
`src/routes/accounting/journal-entries.js` now resolves `COALESCE(display_reference, reference_no)`
for ALL journal types, so receipt (REC) journals display/search the keyed payment reference (e.g.
`T130726`) like legacy imports while `REC-YYYYMM-NNNN` stays the hidden unique internal id.
Receipt-owned REC journals already carried `display_reference`; this backfill covered the
payment-owned ones (pre-Phase-2 payment journals and overpayment journals) from the linked
`payments.payment_reference`. Dev updated 932 rows (20 posted + 912 cancelled); remaining NULLs are
cancelled cash-payment journals with no keyed reference — expected. Only `display_reference` was
touched (repeatable, auditor-facing); no amounts, lines, `reference_no` or status changed.

| What it did | Status |
|-------------|--------|
| `UPDATE journal_entries je SET display_reference = p.payment_reference FROM payments p WHERE p.journal_entry_id = je.id AND je.entry_type = 'REC' AND je.display_reference IS NULL AND p.payment_reference IS NOT NULL AND BTRIM(p.payment_reference) <> '';` — guarded by a pre-check (no journal linked to payments with conflicting refs) and a post-check (no posted REC journal left with NULL display_reference). Idempotent. | dev ✓, prod ✓ |

---

## Removed 23 Jul 2026 — applied 22 Jul 2026 on dev, prod applied 23 Jul 2026

Both files below were removed from `dev/migrations/` on 2026-07-23 (commit `de070f2f`) after being
applied/verified on dev, then applied to the live production database on 2026-07-23. **Recover either
with `git show de070f2f^:dev/migrations/<filename>`** (they were created after `5cfd925b`, so they
are not recoverable from that commit — use `de070f2f^`).

| File | What it did | Status |
|------|-------------|--------|
| `2026-07-22_products_sort_order.sql` | Added `products.sort_order` (nullable integer) — the shared per-type product display order used by all product/production pickers, managed via PUT /api/products/order and the Catalogue Product page Reorder modal. Seeded the default Mee order: 1-350G=0, 1-3UDG=1, 1-2UDG=2, 1-MNL=3 (guarded, idempotent). | dev ✓, prod ✓ |
| `2026-07-22_gl_settled_invoices_contra.sql` | "Bucket 3" debtors-report reconciliation: closed six operational invoices whose settlements already exist in the debtor ledger (per-customer GL↔operations difference equalled exactly the invoice residue) — `2004676` CHANKOPI 1,080.00, `15309` AMY 135.00, `026127` LEE YX 57.00, `34704` SHAB 870.00, `63599` HIAPLEE-SC 561.00, `34367` LAI 1,642.00. Five guarded NON-POSTING `contra` payment projections inserted; LAI's never-confirmed pending cheque payment `5469` converted in place to contra (NOT linked to IMP journal `6945`). No journal created/modified/cancelled; invoices set paid, `credit_used` recomputed. Guarded, idempotent, fail-closed. | dev ✓, prod ✓ |
| `2026-07-23_debtors_recon_corrections.sql` | Buckets 1-2 + §6 debtors-report reconciliation (21 operational-only invoices, GL already 0.00, no journals posted; total RM12,410.00 — the whole ops-only actionable category). **Pattern A** (mis-keyed CASH sale → flip INVOICE→CASH + non-posting auto-collection `cash` payment): `2004628` AFRID, `2004559` KY, `2004601` 1M, `33909`/`34135` SABANAH-S, `2004297` ANGELA, `62681` 83 MM, `34094` BARAKAH, `62866` A&A, `2004275` MING-P, `2004424` TAY, `2004285` NEVER-S, `2004226` A MARKET. **Pattern B** (settled by later transfer/online/cash or offset by CN/discount → non-posting `contra`): `62959` MYSHOP-KD2 15.40 (CN TH/CN/41), `2004210` KOPI 148 330.00 (TR041025), `62643` KELUARGA 435.00 (cash), `013543` WONG-KM 975.00 (cash), `026261` CLS 976.00 (online), `62155` UTEA 342.00 (online TF150725-1), `62394` MYSHOP-KM2 50.15 (3% discount CN TH/CN/25/38), `62952` MYSHOP-KM2 21.95 (3% discount CN TH/CN/25/49). Invoices set paid, `credit_used` recomputed; no journal created/modified/cancelled. Depends on the Bucket 3 migration having enabled `contra`. Guarded, idempotent, fail-closed, one atomic transaction. | dev ✓, prod ✓ |

---

## Cleanup of 21 Jul 2026 — 20 files removed

All twenty `.sql` files listed below were removed from `dev/migrations/` on 2026-07-21 after being
applied/verified on dev. **Nothing new was executed during this cleanup — it is documentation +
file removal only.**

### A. Receipt / Bank-In / Debtor sub-ledger refactor (Phases 1–7)

Full narrative: [Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md)
(§5a–§5i) and [Account/INVOICE-PAYMENT-ACCOUNT_IMPLEMENTATION_PLAN.md](Account/INVOICE-PAYMENT-ACCOUNT_IMPLEMENTATION_PLAN.md).
**Dev and prod: applied** — confirmed live in the 2026-07-28 production dump (247 `receipts`,
130 `bank_ins`, full receipt/RV/bank-in population).

| # | File | What it did | Status |
|---|------|-------------|--------|
| 1 | `2026-07-10_receipts_bankins_foundation.sql` | Phase 1 schema: created `receipts`, `receipt_allocations`, `rv_registry`, `bank_ins`, `bank_in_groups`, `bank_in_allocations`; added `journal_entries.display_reference/posting_sequence/source_type/source_id`, `journal_entry_lines.cheque_reference/display_order`, `invoices.accounting_description`; journal source-link backfill (525 invoice + 2,890 payment + 21 adjustment + 28 self-billed); partial unique index = one posted journal per source. Idempotent. | dev ✓, prod ✓ |
| 2 | `2026-07-10_receipts_bankins_dryrun.sql` | **Read-only** dry-run report (plan §6 categories A–Q). Not a data migration — safe to run any time. Run before AND after the Phase 1/2 data migrations to prove no balance drift. | dev tool |
| 3 | `2026-07-10_receipts_phase2_columns.sql` | Phase 2 schema: `payments.is_auto_collection` (seeded from the two historical note texts only while invoice type is still CASH), `payments.receipt_allocation_id`, `journal_entry_lines.display_reference`. Idempotent. | dev ✓, prod ✓ |
| 4 | `2026-07-10_receipts_phase2_migration.sql` | Phase 2 data rebuild (June-2026+ only): auto-collection flagging, auto rows unlinked/redated, genuine payments grouped into receipts+allocations with new-contract journals, the approved 015361/payment-5229 RM2,880 settlement repair (C2), June+ invoice journals rebuilt to contract shapes, cancelled-payment journals cancelled. Idempotent after the guarded repair. **NOTE: on a full rebuild this MUST run before `2026-07-16_yesokey_015361_phantom_receipt.sql` (already removed) or the phantom returns.** | dev ✓, prod ✓ |
| 5 | `2026-07-10_bankins_phase3_import.sql` | Phase 3: added `RV` journal type; one `import_opening` CH_REV2 receipt (invoices 34869+34891 TEO, 1,060.00); imported RV001–RV081/06 as real bank_ins/groups/allocations/journals with exact legacy particulars; reserved RV021/022/048/082/083 as manual (no journal). Idempotent (skips if June RVs exist). | dev ✓, prod ✓ |
| 6 | `2026-07-10_cn_journals_phase4_migration.sql` | Phase 4: rewrote existing Credit Note journals to the frozen contract (DR original revenue ledger + DR OUTPUT_TAX / CR TR), set THCN/26/n display refs, re-dated CN journals to legacy dates, imported the 1 June revenue anchors (CASH_SALES 1,037,680.40 CR, CR_SALES 2,296,968.93 CR). Idempotent. | dev ✓, prod ✓ |
| 7 | `2026-07-10_phase5_bank_receipts_migration.sql` | Phase 5 data: (A) 14 June cheque-clear rows rebuilt as receipts on clear dates (incl. 7 never-keyed receipts from the bank statement); (B) 4 date-shifted clears re-dated + 2 reference typos fixed; (C) PBB678670 62,543.40 re-split into 4 per-customer receipts. Idempotent. | dev ✓, prod ✓ |
| 8 | `2026-07-10_phase5_reference_fixes.sql` | Phase 5: deterministic 1:1 visible-reference/date fixes (TT040626-6/-7→TF…, TT190626↔TT190626-3 swap, TF190626-2→TR190626-2, PCE001..008/06 display as PV001..008/06, PBE001/06 re-dated 01/06→04/06). Idempotent. | dev ✓, prod ✓ |
| 9 | `2026-07-10_phase5_recon_tool.sql` | **Dev analysis tool** (not a data migration): loads the five fixture CSVs into `recon.fixture_rows` and matches every posted ERP line against every fixture row. Re-runnable. | dev tool |
| 10 | `2026-07-10_debtor_children_phase6_migration.sql` | Phase 6: ensured a DEBTOR child for every referenced customer id, then rewrote historical TR lines to per-customer children via journal source links (246 invoice + 224 receipt + 2,890 payment + 21 adjustment lines; cancelled journals included). Idempotent. | dev ✓, prod ✓ |
| 11 | `2026-07-10_debtor_zero_anchors_phase7.sql` | Phase 7: explicit 0.00 opening anchors @ 2026-06-01 for the 1,416 DEBTOR children not in the legacy 1 June debtor list (all 1,566 children anchored), so the anchor rule supersedes pre-cutover child lines. Idempotent. | dev ✓, prod ✓ |

**Prod deployment order (from INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §7):** dry-run (before) → 1 →
2 → 3 → 4 → 5 → 7 → 8 → 6 → 11 → (then the already-removed `2026-07-14_cheque_clearance_dates.sql`)
→ dry-run (after). Compare to the §5a–§5i numbers.

### B. Financial-statement note remap

| # | File | What it did | Status |
|---|------|-------------|--------|
| 12 | `fs_note_remap_2026-07.sql` | Re-tagged `account_codes.fs_note` for the audited account population from the documented legacy rules (guarded by a whole-chart fingerprint). Applied to fix statements showing zero after a dev-DB refresh wiped fs_note. **Must also be run in prod whenever prod's fs_note is missing/stale.** Details: [Account/FINANCIAL_STATEMENTS_MAPPING.md](Account/FINANCIAL_STATEMENTS_MAPPING.md). | dev ✓, prod conditional |

### C. Jan–May 2026 legacy ledger import

Full narrative: [Account/ACCOUNTING_PROGRESS.md](Account/ACCOUNTING_PROGRESS.md) §6 (the standalone import plan `LEGACY_JAN_MAY_IMPORT_PLAN.md` was removed 5 Aug 2026 after the boss confirmed the Jan–May 2026 TB totals tally exactly between legacy and ERP; recoverable from git history).

| # | File | What it did | Status |
|---|------|-------------|--------|
| 13 | `2026-07-13_legacy_jan_may_staging.sql` | Created the auditable `import_legacy_rows` staging table (hash-pinned provenance for the Jan–May import). Idempotent (`CREATE TABLE IF NOT EXISTS`). | dev ✓, prod ✓ |
| 14 | `2026-07-13_legacy_jan_may_conflicts.sql` | Import prep (no CSV rows): normalized 2 customer IDs with trailing spaces, corrected Toyota Hilux HP codes to SWJ9882, created 3 missing legacy GL accounts, registered the `IMP` journal type, cancelled superseded pre-cutover REC journals, moved THCN/26/1-16 to exact legacy dates. Guarded, idempotent, fail-closed on mixed state. | dev ✓, prod ✓ |
| 15 | `2026-07-14_legacy_journal_presentation.sql` | Added `journal_entries.legacy_entry_type`; attached each IMP header to its staging group; replaced artificial header descriptions with source-particular summaries; restored each line's exact legacy-visible reference. Guarded, idempotent, fail-closed. | dev ✓, prod ✓ |

### D. Hire-purchase interest-in-suspense classification

| # | File | What it did | Status |
|---|------|-------------|--------|
| 16 | `2026-07-13_hpb_interest_suspense_note16.sql` | Classified HP interest-in-suspense balances (`HPB`, `CL_HPB`, `HPB_*`) with their hire-purchase payable contracts on Balance Sheet Note 16; `HPI` (released finance cost) stays on Income Statement Note 23. Guarded, idempotent. | dev ✓, prod ✓ |

### E. Legacy-report parity V2/V3 + OP→LGP purchase account

Full narrative: [Account/LEGACY_REPORT_VERIFICATION_PLAN.md](Account/LEGACY_REPORT_VERIFICATION_PLAN.md)
(§6, §7, §8-7). **Dev and prod: applied** — the 2026-07-28 production dump contains the full V2/V3
end state (62 `legacy-report-v2` anchors, `closing_stock_values` May seed, OP/LGP `fs_note` NULL per
the §8-7 unlink), so the user had already run this group on production. The standing regression gate
is the harness
(`dev/import/legacy-report-fixtures/validate-fixtures.mjs` + `verify-legacy-reports.mjs`), **not** a
migration rerun — a final-state rerun of the V2 scripts will legitimately fail once the chart drifts.

| # | File | What it did | Status |
|---|------|-------------|--------|
| 17 | `2026-07-20_gp_op_to_lgp.sql` | Repointed all 63 `OP` (Overseas Purchases, deprecated) self-billed invoices and GP journal lines to `LGP` (Local General Purchases); mapped `LGP.fs_note = '5'`; left `OP` with zero movement/no fs_note. Guarded, idempotent. **Superseded in part by the §8-7 decision** (see note below). | dev ✓, prod ✓ |
| 18 | `2026-07-20_legacy_report_v2_opening_stock.sql` | Phase V2 (dev variant): closed the RM1,456,480.37 TB residue with 63 `CS_*` zero fences + 62 `OS_*` debit anchors, applied 125 approved direct `fs_note` changes, routed finished-goods opening stock (3-1) to the Income Statement. Guarded whole-chart fingerprint; one-time gate. | dev ✓ |
| 19 | `2026-07-20_legacy_report_v2_opening_stock_prod.sql` | Phase V2 **PRODUCTION variant** — identical package re-pinned to the production chart (named drift: SUJAYU, NG-SC, LGP, OP). Applied to production (order: #17, then this) — confirmed by the 2026-07-28 prod dump. | dev ✓, prod ✓ |
| 20 | `2026-07-21_closing_stock_values.sql` | Phase V3: created `closing_stock_values` (report-level month-end closing-stock injection, never a GL posting) and seeded May 2026 (14-1 = 188,979.60, 14-2 = 336,909.82, 14-3 = 182,194.43; total 708,083.85). Guarded, idempotent. Later months keyed by users on the Material Stock page. | dev ✓, prod ✓ |

> **§8-7 supersession (foreign purchases, 21 Jul 2026):** the interim `LGP → fs_note 5` mapping in
> #17 was later superseded — foreign purchases are NOT linked to any note (`OP` and `LGP` →
> `fs_note = NULL`); real accounting is the user's separate manual purchase journals. This was
> implemented by `2026-07-21_foreign_gp_unlink.sql` (already removed at commit `5cfd925b`) and is
> live in production (confirmed in the 2026-07-28 dump: `LGP.fs_note` IS NULL).

---

## Ran 28 Jul 2026 on PRODUCTION — GT G4/G7 rollout (G8) + estimated parity fixes

Applied to `tienhock_prod` on the Hetzner server after office hours, against the same scripts
rehearsed on a fresh prod copy earlier that night (full narrative: GT_ACCOUNTING_HANDOVER.md §10f).
TH baseline at apply time: 2,827 `public.account_codes` / 8,238 `public.journal_entries` / 33
`public.financial_statement_notes` (the §10e re-pin). The `.sql` files were removed from
`dev/migrations/` after the rollout (recover at commit `50e63344`):

| Step | What ran | Result |
|------|----------|--------|
| 1 | `2026-07-27_greentarget_import_date_encoding.sql` | `G4 date_encoding OK` |
| 2 | `load-staging.mjs` (`GT_IMPORT_DB_MODE=direct`, staging CSV sha256 `6e42b830…` scp'd to the server) | COPY 4,903, staging summary matched dev exactly |
| 3 | `post-monthly-journals.sql` × 6 (Jan–Jun) | 1,705 journals / 4,401 lines |
| 4 | `2026-07-27_greentarget_opening_anchors.sql` | 501 anchors summing to exactly 0.00 |
| 5 | `2026-07-28_greentarget_g7_organic_posting.sql` | G7 schema/organic-posting enablement |
| 6 | `backfill-g7-organic.mjs` | 3 organic journals posted (ids 1706/1707/1708: invoices 325/326, payment 197), balanced, back-linked |
| 7 | All four verifiers with `GT_IMPORT_DB_MODE=direct` | `verify-import.sql` **G4 VERIFY OK**; `verify-chart.mjs` **59 gates**; `verify-import.mjs` **64 gates + 2,850 comparisons**; `verify-legacy-reports.mjs` **ALL STAGES GREEN (123 gates)** |
| 8 | `2026-07-28_estimated_report_parity_data_fixes.sql` (run twice) | FIX-1/FIX-2 APPLIED, then ALREADY FINAL on rerun — journal `000199` = RM40,500.00, June BIHUN stock row 171 = RM282.20 |

Notes for future reruns: `verify-chart.mjs` / `verify-import.mjs` gained the same
`GT_IMPORT_DB_MODE=direct` support `load-staging.mjs` already had (default remains dev docker —
required because the production server has no docker). The gitignored fixture files
(`generated/validation-report.json`, `greentarget-report-fixtures/data/*.csv`) had to be scp'd to
the server, and the home/app directories needed `chmod a+rX` so the `postgres` user could read
them. Browser spot-check on the live site passed (GT TB/ledger/debtors; TH estimated June P&L:
PU_BBER purchases 130,631.40 and CS_BBER closing 194,663.40 — both the verifier-pinned values).

---

## Previously removed (documented in the handover docs, listed here for completeness)

These were already deleted before this cleanup; recover them from git history at the commit noted.

| File | Recover at | Reference |
|------|-----------|-----------|
| `2026-07-14_cheque_clearance_dates.sql` + `_dryrun.sql` | pre-`5cfd925b` | INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §5j |
| `2026-07-14_pce008_display_reference_sync.sql` | pre-`5cfd925b` | INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §5j |
| `2026-07-14_jp_cheque_clearance_dates.sql` | pre-`5cfd925b` | INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §5j |
| `2026-07-21_foreign_gp_unlink.sql` | `5cfd925b^` | LEGACY_REPORT_VERIFICATION_PLAN.md §8-7 |
| `2026-07-21_overpayment_applications.sql` | `5cfd925b^` | CUSTOMER_CREDIT_APPLICATION_HANDOVER.md |
| `2026-07-21_revert_payroll_ot_formula.sql` | `5cfd925b^` | PAYROLL_OT_REVERT_HANDOVER.md |
| Data corrections (Freshmart, YESOKEY phantom, MYSHOP-KM5, MYSHOP-SKT contra) | git history | `CLAUDE.md` schema notes (dated entries) |
