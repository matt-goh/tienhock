# Migrations Applied & Removed — Ledger

This file is the durable record of one-time SQL migrations that have been **run and then removed**
from `dev/migrations/`. The project convention is: run a migration on the dev database, document it
fully (schema in `CLAUDE.md`/`AGENTS.md` + the relevant handover doc), then **delete the `.sql`
file** and rely on git history for the exact SQL. This ledger tells a future implementer what has
already executed, on which environment, and where to recover the script from.

> **Recovering a removed script:** each entry below states the git commit where its `.sql` file
> last existed — recover with `git show <commit>:dev/migrations/<filename>` (or
> `git log -- dev/migrations/<filename>` for its full history). The SQL embedded in the 7 Aug and
> 11 Aug sections of this file is the **only** record of those scripts (they were never fully
> committed), and the 24 Jul backfill statement is likewise preserved inline. Docs that link to
> `../../dev/migrations/<file>` resolve through git history only — intentional historical
> pointers, not live files.

**Status legend:** **dev** = applied to the `tienhock` dev database (which since 20 Jul 2026 is a
production copy). **prod** = applied to the live production server database (separate PM2 window,
requires separate approval).

> **2026-08-21 cleanup:** entries dated 6 Aug 2026 and earlier were condensed into the single
> "Previously removed" section near the bottom of this file — every migration there is applied to
> dev and production, recoverable from the stated git commit, and documented in the referenced
> handover docs. Nothing new was executed during the cleanup; it is documentation + file removal
> only.

---

## Removed 27 Aug 2026 — 1 file (2UDG 300g red/M production pay-code links)

Applied to dev and production on 2026-08-27 (dev first with an idempotent re-run, then the user
ran the same guarded file on production), then removed per the project convention. Recover with
`git show 7f6590d6:dev/migrations/2026-08-27_link_2_bh2_2um_production_pay_codes.sql`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-27_link_2_bh2_2um_production_pay_codes.sql` | Added the six confirmed red/M production links `PBH_2UM`, `PBH_2UM_BAG`, `FULL_B2UM`, `FULL_B2UM_140`, `FULL_2UM_40` and `FULL_2UM_60` to product `2-BH2`, alongside its six existing green/H links. It verifies and preserves Salesman `2-BH2` and Ikut Lori `DME-2H`. No rate, employee assignment, production entry, daily log or processed payroll was changed. The existing production-entry model records only `2-BH2`, not an H/M variant; a worker assigned both families therefore resolves to the first matching code, while the confirmed H/M counterpart rates are currently equal. Guarded, idempotent and fail-closed. | dev ✓ (2026-08-27, idempotence verified), prod ✓ (2026-08-27) |

---

## Removed 27 Aug 2026 — 1 file (2UDG 300g Ikut Lori mapping repair)

Applied to dev on 2026-08-26 and to production on 2026-08-27 (the user ran the same guarded file
on production), then removed per the project convention. Recover with
`git show b96d0225:dev/migrations/2026-08-26_restore_2_bh2_dme_2h_ikut_mapping.sql`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-26_restore_2_bh2_dme_2h_ikut_mapping.sql` | Restored the missing `2-BH2` → `DME-2H` automatic Ikut Lori mapping and connected the existing `DME-2H` pay code to the `SALESMAN_IKUT` job. The 24 Aug conditional backfill had skipped this pair because that job link was missing. It verifies that the separate `2-BH` → `DME-300G` rule remains unchanged. No rate, production mapping, previously saved daily log or processed payroll was changed. Guarded, idempotent and fail-closed; the dev re-run was verified before production use. | dev ✓ (2026-08-26, idempotence verified), prod ✓ (2026-08-27) |

---

## Removed 24 Aug 2026 — 2 files (RAMEN identifier/payroll repair + Jelly Polly PKT/PCS units; Ikut Lori mapping table)

Applied to dev and production on 2026-08-24 (dev first, then the user ran both guarded files on
production), then removed per the project convention. Recover with
`git show f357ad39:dev/migrations/2026-08-24_repair_ramen_product_and_jp_pkt_pcs.sql` and
`git show 393c9765:dev/migrations/2026-08-24_product_paycode_auto_setup.sql`.

| File | What it does | Status |
|------|-----------------|--------|
| `2026-08-24_repair_ramen_product_and_jp_pkt_pcs.sql` | Fails closed unless finished-good `1-PR`, packing mapping `1-PR` → `PM_PR`, direct salesman packet commission `SALESMAN` → `1-PR`, and compatible RAMEN/PKT product mappings are present, then idempotently sets `1-PR` to product type `RAMEN`. It connects the existing user-set `DME-RA` rate to `SALESMAN_IKUT` as PKT without changing the rate, refusing conversion if legacy daily/monthly work-log rows exist, and expands `jellypolly.pay_codes.rate_unit` to accept `PKT` and `PCS`. It never treats `PM_PR` as a product. | dev ✓ (2026-08-24, idempotence verified), prod ✓ (2026-08-24) |
| `2026-08-24_product_paycode_auto_setup.sql` | Creates `product_salesman_ikut_pay_codes` (product → Ikut Lori DME/DWE pay code, one per product) and backfills the pairs the daily-log pages were hardcoding, inserting only pairs whose product, pay code and `SALESMAN_IKUT` job association all exist. The daily-log pages now read this table instead of a hardcoded map, and `POST /api/products/with-paycode-setup` writes new rows when the Add Product Ikut Lori option is used. No rate, price, pay code or job mapping is changed. | dev ✓ (2026-08-24), prod ✓ (2026-08-24) |

---

## Removed 22 Aug 2026 — 1 file (PKT/PCS rate units + RAMEN product line)

Applied to dev and production on 2026-08-22 (the user ran the same script on prod), then removed
per the project convention. Recover with
`git show c8aff31:dev/migrations/2026-08-22_ramen_product_line_and_pkt_pcs.sql`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-22_ramen_product_line_and_pkt_pcs.sql` | Added `PKT` (Packet) and `PCS` (Pieces) to the public `pay_codes.rate_unit` CHECK constraint. Its product update targeted `PM_PR`; the current model uses `1-PR` as the finished-goods product and `PM_PR` as its pay code, so that statement did not reliably establish the intended RAMEN product type. The 24 Aug guarded correction above repairs and verifies the identifier and also aligns Jelly Polly's separate constraint. | dev ✓ (2026-08-22; repaired 2026-08-24), prod ✓ (2026-08-22; 24 Aug correction pending) |

---

## Removed 21 Aug 2026 — 1 file (Green Target June bank charges)

Applied to dev and production on 2026-08-21 (the user ran the same guarded file on prod), then
removed per the project convention. Recover with
`git show 2ab081d8:dev/migrations/2026-08-21_greentarget_june_bank_charges_jv.sql`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-21_greentarget_june_bank_charges_jv.sql` | Posts the user-supplied missing Green Target journal `JV2606-01` (type JV, 30/06/2026): DR `BWBC` / CR `PBB_1` RM2.70 for the June cheque-process fee RM1.50 plus bank-handling charges RM1.20. The application cutoff stays at 1 July; this exact source-less correction uses the documented guarded-migration bypass and appends June `posting_sequence` 279 without changing any of the 1,705 imported journals or 4,401 imported lines. Corrected June figures: BWBC RM120.10, PBB_1/Cash at Bank RM28,465.67, Schedule 5 RM72,114.04, FY profit RM16,366.91, net assets/financed by RM280,383.44; the Trial Balance stays balanced with the same RM2,896,808.53 printed-control total. SERIALIZABLE, advisory-locked, idempotent only against the exact header/two-line fingerprint, and fail-closed on account/import/balance drift or an equivalent duplicate. | dev ✓ (2026-08-21), prod ✓ (2026-08-21) |

---

## Removed 20 Aug 2026 — 1 file (Green Target July debtor audit correction)

Applied to production and dev on 2026-08-20 (same script on both), then removed per the project
convention (commit `3cc20400`). Recover with
`git show e8ce67ba:dev/migrations/2026-08-20_greentarget_july_debtor_audit_correction.sql`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-20_greentarget_july_debtor_audit_correction.sql` | Green Target July 2026 debtor audit correction from the user-approved annotated `statement.pdf` (SHA-256 `15a83afe…`). The pencil annotations correct only the **YEAR-TO-DATE** column of the carried May/June `debtor_subledger_snapshots`: CD-CASH 16,054.00 (was 15,834.00), CD-DURA 1,100.00 (was -700.00), CD-LIST 16,440.00 (was 16,660.00), CD-SITI -10.00 (was -70.00). July movements stay exactly as printed (CD-CASH 920.00, CD-DURA 200.00, CD-LIST 2,630.00, CD-SITI 0.00) and no invoice or journal changes. The four deltas net to +RM1,860.00, exactly allocating the former `CD_SD (UNALLOCATED)` closing residual (1,860.00 → 0.00) while preserving each month's control total; the `CD_SD` 2026-07-01 opening anchor stays RM65,705.40 (note text updated). Updates 10 snapshot rows (5 May + 5 June) and one anchor note. Guarded, idempotent, fail-closed; the verifier re-checks May/June row/close/movement totals (747 rows; 66,445.40 / 65,705.40 closes; -5,510.00 / -740.00 movements), May→June roll-forwards, the four handwritten July closes against unchanged July movement, and the CD_SD control (July movement 18,025.00, close 83,730.40). | dev ✓ (2026-08-20), prod ✓ (2026-08-20) |

## Removed 19 Aug 2026 — 1 file (PBE041/01 workers' PCB reclassification)

Applied to production and dev on 2026-08-19, then removed per the project convention. The script
was committed before removal, so the exact SQL is recoverable directly:

Recover with `git show 684ff75e:dev/migrations/2026-08-19_reclass_pbe04101_workers_pcb.sql`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-19_reclass_pbe04101_workers_pcb.sql` | Posted reclassification journal `JV2608-12` (type J, 31/08/2026: DR `ACW_PCB` / CR `ACD_PCB` RM5,785.25) moving the workers' PCB out of the directors' accrual account. The immutable legacy import `4204` (`PBE041/01`, 13/01/2026) mis-keyed both directors' and workers' PCB into `ACD_PCB` in the legacy source itself; the import is left untouched and the fix mirrors Helen's own `JV2608-10` pattern (approved via WhatsApp 2026-08-19). Guarded (verifies journal 4204's identity and the mis-keyed line, and both target accounts), idempotent, fail-closed. | dev ✓ (2026-08-19), prod ✓ (2026-08-19) |

---

## Removed 19 Aug 2026 — 1 file (GT + JP CP8D yearly employee particulars)

Applied to production and dev on 2026-08-19, then removed per the project convention. Recover via git history
(`git log -- dev/migrations/2026-08-19_gt_jp_cp8d_records.sql`). Design: `docs/CP8D_HANDOVER.md`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-19_gt_jp_cp8d_records.sql` | Created `greentarget.cp8d_records` (employee_id FK `public.staffs`) and `jellypolly.cp8d_records` (employee_id FK `jellypolly.staffs`) — schema-isolated clones of the TH `public.cp8d_records` yearly CP8D dataset. Guarded and idempotent; no data seeded. | dev ✓ (2026-08-19), prod ✓ (2026-08-19) |

---

## Removed 18 Aug 2026 — 1 file (CP8D yearly employee particulars)

Applied to dev on 2026-08-18 and to production on 2026-08-19, then removed per the project convention. Recover via git history
(`git log -- dev/migrations/2026-08-18_cp8d_records.sql`). Design + layout transcription +
GT/JP plan: `docs/CP8D_HANDOVER.md`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-18_cp8d_records.sql` | Created `public.cp8d_records` — the Tien Hock CP8D yearly per-employee dataset (unique year+employee; editable snapshot of staff particulars, CP8D category/status codes, and 14 money columns, of which gross/EPF/SOCSO/MTD are payroll-derived at prefill time). Guarded and idempotent; no data seeded. | dev ✓ (2026-08-18), prod ✓ (2026-08-19) |

---

## Removed 14 Aug 2026 — 1 file (Green Target stored invoice lines)

Applied to production on 2026-08-11 and to dev on 2026-08-14, then removed per the project
convention. The dev run created the table with zero rows; no historical invoice lines were backfilled.

Recover with `git show d0bef31a:dev/migrations/2026-08-11_greentarget_invoice_lines.sql`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-11_greentarget_invoice_lines.sql` | Created `greentarget.invoice_lines` (invoice_id + line_number PK, FK invoices ON DELETE CASCADE; description / quantity / unit_price / amount numeric(14,2) with CHECKs) — stored, user-editable display lines for GT invoices. No backfill: invoices without rows keep rendering through the legacy PDF/e-Invoice description generators. Guarded and idempotent. | dev ✓ (2026-08-14), prod ✓ (2026-08-11) |

---

## Removed 14 Aug 2026 — 1 file (Jelly Polly debtor opening balances)

Applied to production and dev on 2026-08-14, then removed per the project convention. The dev run
validated the already-existing correctly shaped table and left its one existing opening anchor
unchanged; the migration does not seed or backfill anchors.

Recover with `git show c082e81f:dev/migrations/2026-08-14_jellypolly_debtor_opening_balances.sql`.

| File | What it did | Status |
|------|-------------|--------|
| `2026-08-14_jellypolly_debtor_opening_balances.sql` | Creates `jellypolly.debtor_opening_balances`, one signed DR-positive `numeric(15,2)` opening anchor per customer and effective date, with notes and audit fields. `customer_id` is a logical reference to the shared customer catalogue (no FK), and the customer/date pair is unique. Zero anchors are meaningful fences. Guarded and idempotent. | dev ✓ (2026-08-14), prod ✓ (2026-08-14) |

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

## Previously removed — 6 Aug 2026 and earlier (condensed 21 Aug 2026)

Every migration below was applied to **dev and production**, then removed per the project
convention. Recover any file with `git show <commit>:dev/migrations/<filename>` using the batch's
commit below (or `git log -- dev/migrations/<filename>` for its full history). The SQL blocks
embedded in the 7 Aug and 11 Aug sections above are the **only** records of those scripts (they
were never fully committed), and the 24 Jul backfill statement below is likewise preserved
inline. Full narratives live in the referenced handover docs.

| Batch | File(s) | What they did | Status | Recover at |
|-------|---------|---------------|--------|------------|
| 6 Aug (2nd) | `2026-08-06_invoice_2005042_same_day_cash_chrev1.sql` | Bill 2005042 same-day counter cash: repointed receipt 257 / journal 12165 debit CH_REV2→CH_REV1 (RM392) and fixed the mis-keyed reference C2005041→C2005042. An earlier CASH-bill attempt was reverted before this ran. | dev ✓, prod ✓ | `cb895076` |
| 6 Aug | `2026-08-05_june_legacy_reclass.sql` + `2026-08-06_june_legacy_reclass_e1_e7_mrm_mgt.sql` | June 2026 legacy reclassification: 14 account moves + E1–E11 amount edits + MRM/MGT offsets on manual June C/B journals. **Do not re-run either file** — see warning below. | dev ✓, prod ✓ | `8bd5e45f` |
| 6 Aug | `2026-08-06_greentarget_rentals_optional_fields.sql` | Made `greentarget.rentals.date_placed` nullable (tong/dates are optional metadata). | dev ✓, prod ✓ | `8bd5e45f` |
| 5 Aug | `2026-08-05_pce002_acwj_sal_reclass.sql` | Repointed PCE002/06 settlement lines ACWJ_SAL→ACW_SAL (RM3,460.00); June TB 17,109,996.00→17,106,536.00/side. | dev ✓, prod ✓ | `a92104dd` |
| 5 Aug | `2026-08-05_greentarget_employee_pay_rates.sql` | GT per-employee pay-rate override tables; seeded GOH/WONG RM1,700/month (vs the shared RM3,500). | dev ✓, prod ✓ | `a92104dd` |
| 2 Aug | GT-P5 v2 — 6 files | Full production rollout of invoice/receipt parity → debtor dimension (details below). | dev ✓, prod ✓ | `050110d0` |
| 30 Jul (4th) | `2026-07-30_estimated_report_jagung_stock_fixes.sql` | JAGUNG physical-count fixes (May 276→196, June 399→409) + June Add Backs (MEE 9,658.83 / BIHUN 6,662.66). | dev ✓, prod ✓ | `eaaaa45c` |
| 30 Jul (3rd) | `2026-07-30_greentarget_customer_billing_address.sql` + `2026-07-30_greentarget_remove_pbb1.sql` | Customer `billing_address` column; removed dormant duplicate `PBB1` (**do not re-run the G3 chart load** — it would re-create PBB1; the verifiers carry the removal). | dev ✓, prod ✓ | `971c157c` |
| 30 Jul (2nd) | `2026-07-30_greentarget_manual_payment_types.sql` + `2026-07-30_greentarget_remove_rental_addons.sql` | Seeded GT B/C/J journal types; dropped the never-used rental add-ons feature. | dev ✓, prod ✓ | `09596c44` |
| 30 Jul | `2026-07-30_greentarget_orphan_invoice_journals.sql` | Deleted cancelled orphaned GT sales journals (freed reused invoice numbers like 2026/01013); the delete path now removes them too. | dev ✓, prod ✓ | `ee180c6d` |
| 29 Jul | `2026-07-28_greentarget_salary_vouchers.sql` | JBSL/JWDR journal types + `salary_voucher_branches` — Voucher Generator foundation. | dev ✓, prod ✓ | `2f4860b6` |
| 28 Jul (3rd) | 8 files — GT G2/G3/G4/G7, estimated parity, unit-cost precision | GT accounting foundation, 503-account chart, legacy import date encoding + opening anchors, G7 organic posting, estimated-report parity fixes, `numeric(10,4)` unit-cost widening. | dev ✓, prod ✓ | `50e63344` |
| 28 Jul (2nd) | `2026-07-28_jellypolly_zero_cancelled_invoices.sql` + `2026-07-28_restore_journal_015375.sql` | Zeroed cancelled JP invoices (statement/back-balance fix); restored sales journal 2991 (invoice 015375, VIVIANA RM34.00). | dev ✓, prod ✓ | `a88079b2` |
| 28 Jul | 3 files — Estimated report Phase 1 + GT G2/G3 | Estimated P&L/unit-cost foundation (135 lines); GT accounting foundation + 503-account chart. | dev ✓, prod ✓ | `26afc11b` |
| 23 Jul | `2026-07-22_products_sort_order.sql` + `2026-07-22_gl_settled_invoices_contra.sql` + `2026-07-23_debtors_recon_corrections.sql` | Product display order; Bucket 3 contra; Buckets 1-2 + §6 debtors recon (21 invoices, RM12,410.00). | dev ✓, prod ✓ | `de070f2f^` |
| 21 Jul | 20 files — receipts/bank-ins Phases 1–7, fs_note remap, Jan–May legacy import, HPB Note 16, V2/V3 + OP→LGP | Full receipt/bank-in/debtor sub-ledger refactor + legacy-report parity package (list below). | dev ✓, prod ✓ | `5cfd925b` |

**Warnings preserved from the condensed entries:**

- **June reclass — do not re-run either file.** Three corrections were wrong and were reversed by
  the coworker on 2026-08-07 (journals `PCE004/06` 00:29, `PBE054/06` 00:46): move #3 (KFC LINTAS
  40.00 stays in `MBSM_K`, not `MBC`) and E10+E11 (PAUMIN #2606-2133 splits `MBRMF` 565.00 /
  `MBSAF` 144.00, not 465.00/244.00). Everything else stands; a re-run trips the files' own
  guards. Narrative: [Account/JUNE_RECLASS_DESIGN.md](Account/JUNE_RECLASS_DESIGN.md) §e.
- **Bill 2005042:** the first attempt (`2026-08-06_invoice_2005042_cash_bill_restore.sql`) wrongly
  converted the bill to a CASH bill and was reverted before the shipped file ran — do not
  resurrect it. The CH_REV1/CH_REV2 split is a **date** rule, not a document-type rule (evidence:
  95 same-day CH_REV1 receipts vs 90 later-collection CH_REV2 receipts in the immutable import).
- **Prod server access (Hetzner):** the prod DB is `tienhock_prod`; the `tienhock` OS user reaches
  it via peer auth (`psql -d tienhock_prod …`), `sudo -u postgres` needs a terminal, the
  `postgres` user needs `chmod a+rX` on the app directory, and verifier scripts run with
  `GT_IMPORT_DB_MODE=direct` (no Docker on the server).
- **Never paste a migration into interactive psql** — always run it from a file with `-f` (the
  JAGUNG first prod attempt failed on psql's backslash-parser reading header comments; nothing
  executed).
- **Estimated-report foundation** must be re-applied after any prod→dev DB import that drops the
  `estimated_report_*` tables ([Account/ESTIMATED_REPORT_HANDOVER.md](Account/ESTIMATED_REPORT_HANDOVER.md) §9.4).
- **fs_note remap** (`fs_note_remap_2026-07.sql`) is prod-conditional: re-run whenever prod's
  `fs_note` is missing/stale ([Account/FINANCIAL_STATEMENTS_MAPPING.md](Account/FINANCIAL_STATEMENTS_MAPPING.md)).
- **GT rebuild order after a dev DB refresh** ([GT/GT_ACCOUNTING_HANDOVER.md](GT/GT_ACCOUNTING_HANDOVER.md) §10c):
  G2 → G3 → G4 (date encoding + staging load + opening anchors) → G7; G2/G3 apply as-is at any
  baseline; the G4/G7 files require the §10b TH-baseline re-pin.

**GT-P5 v2 (2 Aug 2026) files** (runbook: [GT/GT_ACCOUNTING_HANDOVER.md](GT/GT_ACCOUNTING_HANDOVER.md) §GT-P5 v2):

| # | File | What it did |
|---|------|-------------|
| 1 | `2026-07-30_greentarget_invoice_receipt_parity.sql` | Receipt headers + snapshot account choices; grouped referenced payments into 130 durable receipts. |
| 2 | `2026-07-30_greentarget_cd_sd_subledger.sql` | CD_SD cutover: control account, 1,494 snapshot rows, 747 opening anchors (RM65,705.40). |
| 3 | `2026-07-31_greentarget_erp_ledger_reconciliation.sql` | 13 customer→account links; closed 24 stale ERP invoices as `legacy_operational` (no journal). |
| 4 | `2026-07-31_greentarget_july_debtor_decisions.sql` | 6 new CD_SD leaves + 10 July invoice snapshot resolutions. |
| 5 | `2026-08-01_greentarget_debtor_dimension.sql` | Debtor registry (780 identities) + real CD_SD control anchor; retired 752 GL shells. |
| 6 | `2026-08-01_greentarget_invoice_revenue_splits.sql` | Invoice/adjustment revenue splits + invoice number sequences; backfilled 15 invoices. |

Two `.mjs` steps ran between files 2 and 4 (`backfill-july-automatic-journals.mjs`,
`apply-july-lifecycle-decisions.mjs`). Verification after deploy: `verify-import.mjs` 66 gates /
2,844 comparisons, `verify-chart.mjs` 59 gates, `verify-multi-allocation-receipt.mjs` 21 gates.

**Cleanup of 21 Jul 2026 — 20 files removed** (nothing executed; documentation + file removal
only). Full narrative: [Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md)
§5a–§5i and [Account/LEGACY_REPORT_VERIFICATION_PLAN.md](Account/LEGACY_REPORT_VERIFICATION_PLAN.md).

| # | File | What it did |
|---|------|-------------|
| 1 | `2026-07-10_receipts_bankins_foundation.sql` | Phase 1 schema: receipts/allocations/rv_registry/bank_ins/groups/allocations; journal display_reference, posting_sequence, source links. |
| 2 | `2026-07-10_receipts_bankins_dryrun.sql` | Read-only dry-run report (plan §6 A–Q); dev tool. |
| 3 | `2026-07-10_receipts_phase2_columns.sql` | Phase 2 schema: is_auto_collection, receipt_allocation_id, line display_reference. |
| 4 | `2026-07-10_receipts_phase2_migration.sql` | Phase 2 data rebuild (June+): auto-collection flagging, genuine payments → receipts, 015361 repair. **Must run before the YESOKEY phantom fix on rebuild.** |
| 5 | `2026-07-10_bankins_phase3_import.sql` | Phase 3: RV type + RV001–RV081/06 imported as real bank-ins; TEO import_opening receipt. |
| 6 | `2026-07-10_cn_journals_phase4_migration.sql` | Phase 4: rewrote CN journals to the frozen contract; June revenue anchors. |
| 7 | `2026-07-10_phase5_bank_receipts_migration.sql` | Phase 5: 14 June cheque-clear rows rebuilt as receipts; PBB678670 re-split into 4. |
| 8 | `2026-07-10_phase5_reference_fixes.sql` | Phase 5: deterministic visible-reference/date fixes. |
| 9 | `2026-07-10_phase5_recon_tool.sql` | Dev analysis tool: loads fixture CSVs into recon.fixture_rows. |
| 10 | `2026-07-10_debtor_children_phase6_migration.sql` | Phase 6: per-customer DEBTOR children; historical TR lines rewritten to children. |
| 11 | `2026-07-10_debtor_zero_anchors_phase7.sql` | Phase 7: explicit 0.00 opening anchors @ 2026-06-01 for 1,416 DEBTOR children. |
| 12 | `fs_note_remap_2026-07.sql` | Re-tagged account_codes.fs_note from the documented legacy rules; prod conditional. |
| 13–15 | `2026-07-13_legacy_jan_may_staging.sql` + `…_conflicts.sql` + `2026-07-14_legacy_journal_presentation.sql` | Jan–May 2026 legacy import: staging table, conflict prep, presentation/legacy_entry_type. |
| 16 | `2026-07-13_hpb_interest_suspense_note16.sql` | HP interest-in-suspense on Balance Sheet Note 16; HPI stays IS Note 23. |
| 17 | `2026-07-20_gp_op_to_lgp.sql` | Repointed OP self-billed invoices/journals to LGP (superseded in part by the §8-7 unlink). |
| 18 | `2026-07-20_legacy_report_v2_opening_stock.sql` | V2 dev variant: 63 CS_* fences + 62 OS_* anchors, 125 fs_note changes, 3-1 → IS. |
| 19 | `2026-07-20_legacy_report_v2_opening_stock_prod.sql` | V2 production variant (re-pinned chart). |
| 20 | `2026-07-21_closing_stock_values.sql` | Phase V3: closing_stock_values + May 2026 seed (708,083.85). |

Prod deployment order (from the progress doc §7): dry-run → 1 → 2 → 3 → 4 → 5 → 7 → 8 → 6 → 11 →
cheque-clearance dates → dry-run. **§8-7 supersession:** foreign purchases are NOT linked to any
note (`OP`/`LGP` fs_note NULL) — implemented by `2026-07-21_foreign_gp_unlink.sql` (removed at
`5cfd925b^`), live in prod.

**Ran 28 Jul 2026 on PRODUCTION — GT G4/G7 rollout (G8) + estimated parity fixes**
(narrative: [GT/GT_ACCOUNTING_HANDOVER.md](GT/GT_ACCOUNTING_HANDOVER.md) §10f; TH baseline at
apply time 2,827 accounts / 8,238 journals / 33 notes; files recovered at `50e63344`): date
encoding → staging load (4,903 rows) → monthly journals (1,705 / 4,401 lines) → opening anchors
(501, summing 0.00) → G7 → 3 organic journals backfilled → all verifiers green (G4 VERIFY OK;
59 gates; 64 gates + 2,850 comparisons; 123 gates) → parity fixes FIX-1/FIX-2 APPLIED (rerun
reports ALREADY FINAL). Browser spot-check on the live site passed.

**Ran 24 Jul 2026 — REC journals display_reference backfill (no migration file kept):** dev
updated 932 rows (20 posted + 912 cancelled). Exact statement:

```sql
UPDATE journal_entries je SET display_reference = p.payment_reference FROM payments p
 WHERE p.journal_entry_id = je.id AND je.entry_type = 'REC' AND je.display_reference IS NULL
   AND p.payment_reference IS NOT NULL AND BTRIM(p.payment_reference) <> '';
```

Guarded by a pre-check (no journal linked to payments with conflicting refs) and a post-check (no
posted REC journal left with NULL display_reference); idempotent. Companion code:
`VISIBLE_REFERENCE_SQL` in `src/routes/accounting/journal-entries.js` resolves
COALESCE(display_reference, reference_no) for all journal types.

**Previously removed (documented in the handover docs, listed here for completeness):**

| File | Recover at | Reference |
|------|-----------|-----------|
| `2026-07-14_cheque_clearance_dates.sql` + `_dryrun.sql` | pre-`5cfd925b` | INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §5j |
| `2026-07-14_pce008_display_reference_sync.sql` | pre-`5cfd925b` | INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §5j |
| `2026-07-14_jp_cheque_clearance_dates.sql` | pre-`5cfd925b` | INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §5j |
| `2026-07-21_foreign_gp_unlink.sql` | `5cfd925b^` | LEGACY_REPORT_VERIFICATION_PLAN.md §8-7 |
| `2026-07-21_overpayment_applications.sql` | `5cfd925b^` | CUSTOMER_CREDIT_APPLICATION_HANDOVER.md |
| `2026-07-21_revert_payroll_ot_formula.sql` | `5cfd925b^` | PAYROLL_OT_REVERT_HANDOVER.md |
| Data corrections (Freshmart, YESOKEY phantom, MYSHOP-KM5, MYSHOP-SKT contra) | git history | `CLAUDE.md` schema notes (dated entries) |
