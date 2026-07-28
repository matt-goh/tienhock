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

Full narrative: [Account/LEGACY_JAN_MAY_IMPORT_PLAN.md](Account/LEGACY_JAN_MAY_IMPORT_PLAN.md).

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
