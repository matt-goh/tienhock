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
**Dev: applied. Prod: PENDING** — deploy in the exact order below after prod data-entry reaches dev
parity, running each dry-run/verification block before and after.

| # | File | What it did | Status |
|---|------|-------------|--------|
| 1 | `2026-07-10_receipts_bankins_foundation.sql` | Phase 1 schema: created `receipts`, `receipt_allocations`, `rv_registry`, `bank_ins`, `bank_in_groups`, `bank_in_allocations`; added `journal_entries.display_reference/posting_sequence/source_type/source_id`, `journal_entry_lines.cheque_reference/display_order`, `invoices.accounting_description`; journal source-link backfill (525 invoice + 2,890 payment + 21 adjustment + 28 self-billed); partial unique index = one posted journal per source. Idempotent. | dev ✓, prod pending |
| 2 | `2026-07-10_receipts_bankins_dryrun.sql` | **Read-only** dry-run report (plan §6 categories A–Q). Not a data migration — safe to run any time. Run before AND after the Phase 1/2 data migrations to prove no balance drift. | dev tool |
| 3 | `2026-07-10_receipts_phase2_columns.sql` | Phase 2 schema: `payments.is_auto_collection` (seeded from the two historical note texts only while invoice type is still CASH), `payments.receipt_allocation_id`, `journal_entry_lines.display_reference`. Idempotent. | dev ✓, prod pending |
| 4 | `2026-07-10_receipts_phase2_migration.sql` | Phase 2 data rebuild (June-2026+ only): auto-collection flagging, auto rows unlinked/redated, genuine payments grouped into receipts+allocations with new-contract journals, the approved 015361/payment-5229 RM2,880 settlement repair (C2), June+ invoice journals rebuilt to contract shapes, cancelled-payment journals cancelled. Idempotent after the guarded repair. **NOTE: on a full rebuild this MUST run before `2026-07-16_yesokey_015361_phantom_receipt.sql` (already removed) or the phantom returns.** | dev ✓, prod pending |
| 5 | `2026-07-10_bankins_phase3_import.sql` | Phase 3: added `RV` journal type; one `import_opening` CH_REV2 receipt (invoices 34869+34891 TEO, 1,060.00); imported RV001–RV081/06 as real bank_ins/groups/allocations/journals with exact legacy particulars; reserved RV021/022/048/082/083 as manual (no journal). Idempotent (skips if June RVs exist). | dev ✓, prod pending |
| 6 | `2026-07-10_cn_journals_phase4_migration.sql` | Phase 4: rewrote existing Credit Note journals to the frozen contract (DR original revenue ledger + DR OUTPUT_TAX / CR TR), set THCN/26/n display refs, re-dated CN journals to legacy dates, imported the 1 June revenue anchors (CASH_SALES 1,037,680.40 CR, CR_SALES 2,296,968.93 CR). Idempotent. | dev ✓, prod pending |
| 7 | `2026-07-10_phase5_bank_receipts_migration.sql` | Phase 5 data: (A) 14 June cheque-clear rows rebuilt as receipts on clear dates (incl. 7 never-keyed receipts from the bank statement); (B) 4 date-shifted clears re-dated + 2 reference typos fixed; (C) PBB678670 62,543.40 re-split into 4 per-customer receipts. Idempotent. | dev ✓, prod pending |
| 8 | `2026-07-10_phase5_reference_fixes.sql` | Phase 5: deterministic 1:1 visible-reference/date fixes (TT040626-6/-7→TF…, TT190626↔TT190626-3 swap, TF190626-2→TR190626-2, PCE001..008/06 display as PV001..008/06, PBE001/06 re-dated 01/06→04/06). Idempotent. | dev ✓, prod pending |
| 9 | `2026-07-10_phase5_recon_tool.sql` | **Dev analysis tool** (not a data migration): loads the five fixture CSVs into `recon.fixture_rows` and matches every posted ERP line against every fixture row. Re-runnable. | dev tool |
| 10 | `2026-07-10_debtor_children_phase6_migration.sql` | Phase 6: ensured a DEBTOR child for every referenced customer id, then rewrote historical TR lines to per-customer children via journal source links (246 invoice + 224 receipt + 2,890 payment + 21 adjustment lines; cancelled journals included). Idempotent. | dev ✓, prod pending |
| 11 | `2026-07-10_debtor_zero_anchors_phase7.sql` | Phase 7: explicit 0.00 opening anchors @ 2026-06-01 for the 1,416 DEBTOR children not in the legacy 1 June debtor list (all 1,566 children anchored), so the anchor rule supersedes pre-cutover child lines. Idempotent. | dev ✓, prod pending |

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
| 13 | `2026-07-13_legacy_jan_may_staging.sql` | Created the auditable `import_legacy_rows` staging table (hash-pinned provenance for the Jan–May import). Idempotent (`CREATE TABLE IF NOT EXISTS`). | dev ✓, prod pending |
| 14 | `2026-07-13_legacy_jan_may_conflicts.sql` | Import prep (no CSV rows): normalized 2 customer IDs with trailing spaces, corrected Toyota Hilux HP codes to SWJ9882, created 3 missing legacy GL accounts, registered the `IMP` journal type, cancelled superseded pre-cutover REC journals, moved THCN/26/1-16 to exact legacy dates. Guarded, idempotent, fail-closed on mixed state. | dev ✓, prod pending |
| 15 | `2026-07-14_legacy_journal_presentation.sql` | Added `journal_entries.legacy_entry_type`; attached each IMP header to its staging group; replaced artificial header descriptions with source-particular summaries; restored each line's exact legacy-visible reference. Guarded, idempotent, fail-closed. | dev ✓, prod pending |

### D. Hire-purchase interest-in-suspense classification

| # | File | What it did | Status |
|---|------|-------------|--------|
| 16 | `2026-07-13_hpb_interest_suspense_note16.sql` | Classified HP interest-in-suspense balances (`HPB`, `CL_HPB`, `HPB_*`) with their hire-purchase payable contracts on Balance Sheet Note 16; `HPI` (released finance cost) stays on Income Statement Note 23. Guarded, idempotent. | dev ✓, prod pending |

### E. Legacy-report parity V2/V3 + OP→LGP purchase account

Full narrative: [Account/LEGACY_REPORT_VERIFICATION_PLAN.md](Account/LEGACY_REPORT_VERIFICATION_PLAN.md)
(§6, §7, §8-7). **The dev database is a 20 Jul production copy; these were applied there and
rehearsed on fresh prod clones. The real production-server rollout is a SEPARATE, still-PENDING step
requiring approval + a PM2 window.** The standing regression gate is the harness
(`dev/import/legacy-report-fixtures/validate-fixtures.mjs` + `verify-legacy-reports.mjs`), **not** a
migration rerun — a final-state rerun of the V2 scripts will legitimately fail once the chart drifts.

| # | File | What it did | Status |
|---|------|-------------|--------|
| 17 | `2026-07-20_gp_op_to_lgp.sql` | Repointed all 63 `OP` (Overseas Purchases, deprecated) self-billed invoices and GP journal lines to `LGP` (Local General Purchases); mapped `LGP.fs_note = '5'`; left `OP` with zero movement/no fs_note. Guarded, idempotent. **Superseded in part by the §8-7 decision** (see note below). | dev ✓, prod PENDING |
| 18 | `2026-07-20_legacy_report_v2_opening_stock.sql` | Phase V2 (dev variant): closed the RM1,456,480.37 TB residue with 63 `CS_*` zero fences + 62 `OS_*` debit anchors, applied 125 approved direct `fs_note` changes, routed finished-goods opening stock (3-1) to the Income Statement. Guarded whole-chart fingerprint; one-time gate. | dev ✓ |
| 19 | `2026-07-20_legacy_report_v2_opening_stock_prod.sql` | Phase V2 **PRODUCTION variant** — identical package re-pinned to the production chart (named drift: SUJAYU, NG-SC, LGP, OP). **Prod rollout order: run #17 first, then this.** Applied to the dev-that-is-a-prod-copy + rehearsed on fresh prod clones; real prod PENDING. | dev ✓, prod PENDING |
| 20 | `2026-07-21_closing_stock_values.sql` | Phase V3: created `closing_stock_values` (report-level month-end closing-stock injection, never a GL posting) and seeded May 2026 (14-1 = 188,979.60, 14-2 = 336,909.82, 14-3 = 182,194.43; total 708,083.85). Guarded, idempotent. Later months keyed by users on the Material Stock page. | dev ✓, prod PENDING |

**Prod rollout order for group E (LEGACY_REPORT_VERIFICATION_PLAN §6/§V4):** fresh read-only
inventory → `2026-07-20_gp_op_to_lgp.sql` → `2026-07-20_legacy_report_v2_opening_stock_prod.sql` →
`2026-07-21_closing_stock_values.sql`, re-pinning if production has drifted.

> **§8-7 supersession (foreign purchases, 21 Jul 2026):** the interim `LGP → fs_note 5` mapping in
> #17 was later superseded — foreign purchases are NOT linked to any note (`OP` and `LGP` →
> `fs_note = NULL`); real accounting is the user's separate manual purchase journals. This was
> implemented on dev by `2026-07-21_foreign_gp_unlink.sql` (already removed at commit `5cfd925b`).
> The production OP→LGP migration (#17) is therefore to be **dropped/revised** under this decision;
> confirm the final foreign-purchase handling before the group-E prod rollout.

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
