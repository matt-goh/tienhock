# Legacy Jan–May 2026 Ledger Import — Plan & Handover

**Created 13 Jul 2026. Updated 13 Jul 2026 — DEVELOPMENT ACCOUNTING IMPORT COMPLETE; SOURCE-INVOICE DECISIONS AND PRODUCTION ROLLOUT PENDING.**
Goal: extend the 1:1 legacy parity already achieved for June 2026 (see [INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md)) backwards to 1 January 2026, by importing the legacy system's Jan–May ledger exports as posted journals, so that **every 2026 report (Trial Balance, Income Statement, Balance Sheet, CoGM, Account Ledger, Customer/General Statements) reads real journal data for the whole year**. June onwards is organic ERP entry (already row-by-row reconciled); Jan–May becomes imported legacy truth; the two meet at the existing 1 June anchors, which become verification checkpoints.

The deterministic preflight, staging load, five monthly `IMP` batches,
independent source-chain acceptance, and 1 January anchors are complete on the
refreshed development snapshot. The import itself reconciles exactly. The
approved HPB interest-in-suspense classification is applied and Balance Sheet
residue is now the exact RM1,456,480.37 opening limitation. The RM483 debit in
manual June journal `PV008/06` remains unchanged because available legacy
evidence proves only its bank credit, not the expense contra. See §10 for the
executed state and remaining source-invoice/production boundary.

Everything below was re-verified against the immutable source hashes and the dev DB on 13 Jul 2026. Re-run the file preflight and the database conflict inventory before continuing because data entry is ongoing.

---

## 1. Source files

Two private Excel-exported CSVs are stored in `dev/import/legacy-jan-may/data/` and gitignored because they contain customer information. Their hashes and structural invariants are pinned in `source-manifest.json`.

| File | Lines | Content | Accounts | Active (has tx) | Nonzero openings | Tx rows |
|---|---|---|---|---|---|---|
| `EXCEL_THLD_(JAN-MAY26).csv` | 12,684 | Full GL ledger report (banks, cash holding, sales, purchases, expenses, creditors, accruals, HP, fixed assets, equity) | 884 | 215 | 140 (37 active + 103 idle) | 8,261 |
| `EXCEL_THDB_(Jan-May26).csv` | 10,271 | Trade-debtor ledger report (one section per customer) | 1,685 | 208 | 152 (97 active + 55 idle) | 1,843 |

### 1a. File anatomy

- Column layout: `row_index, ACC/NO (or date), JOURNAL, PARTICULAR, CHEQUE, DR, CR, BALANCE [, trailing empties]`. One header block at the top only (no page-header repeats).
- Each account is a **section**: a header row (`code,,description`), blank row, a `BALANCE C/FWD` opening row, then transaction rows, then two blank rows.
- **Every transaction row has a JOURNAL ref**; the BALANCE column carries a running balance with `DR`/`CR` suffix (`.00 DR` = zero). Amounts may be quoted with thousands commas or bare with stripped trailing zeros (`99.3`, `30`).
- THLD ends with two out-of-alphabet appended sections: `DEBTOR` (control account, opening only) and `CL_AFI`. THDB ends with `ZURIYAH`. Both files are complete.

### 1b. ⚠ Excel date mangling (CRITICAL parsing rule)

Dates appear in TWO formats, mixed row by row:

- `DD/MM/YYYY` (e.g. `27/01/2026`) — original text, day-first. Excel left these alone because day > 12 made them invalid as US dates.
- `MM-DD-YY` (e.g. `01-12-26` = **12 Jan 2026**, `02-01-26` = **1 Feb 2026**) — Excel silently reinterpreted anything it *could* parse as US month-first and reformatted it.

Proof (triple-checked): particulars text (`K.W.S.P-EPC(01/2026)` on `01-12-26`), PBE cheque batch refs that encode the date (`PBE260112…` on `01-12-26`), all 423 active per-account running-balance chains, and per-account date monotonicity all agree with the MM-DD-YY reading. **Any converter must implement exactly this two-format rule** — a naive day-first parse silently shifts hundreds of rows into wrong months.

### 1c. Journal reference families seen (row counts)

THLD: PV 1,612 · PBE 862 · RV 840 · JVSL 366 · TF 192 · JV 159 · TT 129 · TR 108 · C{inv} 95 · T 82 · F (zero-amount bills) 78 · PBB 62 · JVDR 60 · IV 34 · PIB 19 · THCN 16 · MBB 16 · MIB 13 · TS 12 · JVA 12 (ABB loan JVs) · RHB 9 · IN 9 · CIMBI 9 · ALB 7 · TJ 4 · CV 4 · HLB 3 · plus ~3,4k bare invoice-number refs (cash bills in CH_REV1/CASH_SALES, credit invoices in CR_SALES).
THDB: T-families + external-bank refs + C{inv} 95 + ~890 bare invoice numbers.

Volumes cross-check with June: ~178 credit invoices/month (June: 179), ~19 physical-cash C-receipts/month (June: 20). Legacy Jan–May **cash bills post DR CH_REV1 / CR CASH_SALES directly and do NOT touch the debtor ledger** (unlike the ERP's June 4-line contract) — the import reproduces legacy rows as-is, so this difference is expected and harmless.

---

## 2. Import model (core design)

The two files are per-account **projections of one journal population**. The double-entry pairs are split across files (e.g. credit invoice `63371`: DR customer in THDB + CR `CR_SALES` in THLD). The import therefore:

1. Loads both files into one staging table (`import_legacy_rows`).
2. **Groups rows by `(journal_ref, date)` across both files** → each group becomes ONE `journal_entries` row with its `journal_entry_lines`. The raw source has **3,880 groups, 3,872 balanced**; the eight declared projection/routing exceptions in §3 transform to **3,863 final groups, all balanced to the sen**. Two distinct legacy journals sharing ref+date would merge into one journal — acceptable (both balanced, identical display ref; June evidence `MBB932037-P` already proved display refs are not unique keys).
3. Journal fields:
   - `entry_type` = **`IMP`** (new row in `journal_entry_types`, name "Legacy Import"). `IMP` is reserved for the migration: the manual form hides it and the journal API rejects manual creation, edit, cancellation, or deletion so the verified source projection remains immutable.
   - `reference_no` = deterministic unique internal ref (`IMP-{yyyymmdd}-{seq}`) — `journal_entries.reference_no` has a DB UNIQUE constraint; the repeatable legacy ref goes to **`display_reference`** (header), which every ledger/report already resolves first.
   - `entry_date` = row date; `status` = `posted`; `source_type/source_id` = NULL (manual-like); `description` = `Legacy import {ref}` or dominant particulars.
   - Lines: `account_code` (mapped, §4), `debit/credit`, `particulars` = PARTICULAR, `cheque_reference` = CHEQUE column (real cheque nos for PV rows e.g. `PB350751`, batch refs for PBE rows), `display_order` = file order within the account so within-day ledger print order can reproduce legacy. Do **NOT** set header `cheque_no` (keeps the C-type auto-sequence PBB350779+ untouched).
   - Zero-amount informational rows (`F013562` pattern) import as 0.00 lines — June recon already treats zero rows as first-class ledger content.
4. Openings become **per-account anchors at 2026-01-01** + statement-engine wiring (§5 — the one code deliverable of this project).
5. Batched by month (5 SQL batches), each batch re-runnable/idempotent (keyed on the deterministic `reference_no`), each followed by a month-end balance check against the CSV BALANCE column.

Implementation shape: the completed Node preflight under
`dev/import/legacy-jan-may/` verifies source hashes and parsing rules, then
emits a normalized staging CSV plus JSON audit report. The guarded PostgreSQL
loader, five idempotent monthly transforms, opening-anchor insert, independent
source-chain verification, and invoice reconciliation have all been written
and run on development. All exceptions remain explicit in the report; nothing
is silently dropped.

---

## 3. Validation results (13 Jul 2026, full-file parse)

**Balance chains: 423 of 423 active accounts walk perfectly** from C/FWD through every row to the printed balance after exact field-level normalization of the two malformed physical CSV records:

| Account | Physical line | Correct source row | Previous parser error |
|---|---:|---|---|
| `MBRM` | 7262 | `PV012/01`, 30/01/2026, DR **194.40** | Unquoted commas shifted fields and made the row look like DR 3.00, creating a false 191.40 gap. |
| `ROTH` | 12049 | `PV005/03`, 27/03/2026, DR **225.00** | The 3/4-inch particulars text shifted DR 225.00 into CR, creating a false 450.00 gap. |

The raw source transaction totals are **DR = CR 13,508,487.07**. No source rows are missing and no synthetic MBRM/ROTH debit repairs are permitted; adding the former 191.40 + 450.00 proposal would corrupt the source by RM641.40.

**Grouping test: 3,880 raw `(ref,date)` groups → 3,872 balanced.** The eight raw unbalanced groups decompose entirely into:

1. **Six groups from account `HR` ("HR MART") being exported in BOTH files** — the only THLD∩THDB code overlap. THLD's HR section duplicates THDB's HR rows 1:1 (invoices 63371/63509/63647 + TF settlements). Fix: **exclude the THLD HR section**, keep THDB and map its `HR` to ERP debtor `HR-D`.
2. `15347` (CR_SALES CR 170.00, 26/05) + `T260526` (PBB_1 DR 170.00, 26/05) — approved as one four-line logical group for invoice `015347`: DR `CHARLES-C` / CR `CR_SALES`, then DR `BANK_PBB` / CR `CHARLES-C`, preserving both line display references.

After excluding THLD HR, DEBTOR, and the 32 CSV projections of the 16 source-owned CN journals, then adding the two approved `CHARLES-C` routing lines, the deterministic result is **10,068 transaction lines + 2,567 opening rows in 3,863 balanced groups; DR = CR 13,503,516.15**. The staging SHA-256 is `08dae08b3f730716000d3f27a5407686b05ca2a4df0cd242ef93a836fd4e8b7f`.

**Openings (BALANCE C/FWD):**

| Set | DR | CR | Net |
|---|---|---|---|
| THLD (884 accounts, incl. DEBTOR control 507,697.72 DR) | 12,557,673.25 | 14,006,590.22 | **−1,448,916.97** |
| THDB (1,685 customers) | 503,830.50 | 3,696.18 | **+500,134.32** |
| Combined | 13,061,503.75 | 14,010,286.40 | **−948,782.65** |
| **Selected anchor population** (combined less DEBTOR control; excluded THLD HR opening is zero) | **12,553,806.03** | **14,010,286.40** | **−1,456,480.37** |

Family sums (THLD): NCA fixed assets +11,284,675.98 · AD accum-depr −3,836,900.73 · CL creditors/directors −2,673,511.48 · RP retained profit −5,612,866.10 · SC share capital −200,000.00 · CS_* closing-stock credits −829,605.22 (all OS_* are 0.00 — legacy had not rolled the year-start stock swap) · ACD −70,022.74 · ACW −118,151.80 · HP −139,651.84. Key singles: `PBB_1` +275,918.00 · `ABB` +36,563.77 · `CH_REV1` +19,629.95 · `CASH` 0.00 · `CL_TAX` +149,709.97 · `CL_AFI` −25,696.82 · `HPA_SWJ9882` −125,087.68.

⚠ **The selected opening set does NOT balance.** RM1,448,916.97 is THLD's control-level missing debit, but replacing the excluded RM507,697.72 DEBTOR control with RM500,134.32 of THDB customer detail adds the named RM7,563.40 subledger drift. The actual anchor population therefore has a missing **DR RM1,456,480.37**. The likely omitted source is the balance-sheet **STOCK asset** (CS_* credits alone are 829,605.22) plus other balances absent from this export. No supporting opening TB was supplied, so the approved treatment is to preserve RM1,456,480.37 as the named Trial Balance/Balance Sheet residue and never invent a balancing figure. Journal movements, ledgers, IS, and CoGM remain independently verifiable.

**DEBTOR control account:** opening 507,697.72 DR, **zero transaction rows** (static in legacy). Exclude it entirely — THDB per-customer openings are the approved authoritative detail. Its 507,697.72 equals *exactly* the "legacy 1 June debtor list" total imported as the June General-Statement B/F, while THDB per-customer openings net to 500,134.32 (**7,563.40 below the control**). Preserve that legacy control-vs-subledger drift as a named verification difference (§8-3).

---

## 4. ERP-side conflicts & account mapping (dev DB, 13 Jul 2026)

### 4a. Existing journals inside the import window (would double-count)

| Population | Count / amount | Resolution |
|---|---|---|
| Posted `REC` journals dated Jan–May 2026 (old-model receipts, all `source_type='payment'`, none receipt-owned) | **2,074 / 3,259,534.63** | **Applied on dev:** cancelled by the guarded L2 migration. The `payments` rows remain as subledger history. Imported THDB/THLD rows are now the ledger truth. |
| Posted `CN` journals parked at 2026-05-31 (THCN/26/1–16) | 16 / 1,834.92 | **Applied on dev:** the 16 adjustment-owned journal headers now use the exact legacy dates while documents/e-Invoice state remain untouched. The preflight excludes all 32 matching THLD/THDB projection rows so the CN journals stay source-owned. |
| Cancelled REC (248) / 2025 RECs (20 posted) | — | No action. The applied 01-01 active-account anchors fence off the 2025 rows. |

At the completed L2 checkpoint, the only posted Jan–May journals in dev were
the 16 source-owned CN journals and there were zero `IMP` journals. L3B then
added the exact 3,863 guarded `IMP` population. Re-run the pre-L3B inventory
when reproducing the sequence on production.

### 4b. Account code mapping

- **Alias map (import onto ERP codes):** `PBB_1` → `BANK_PBB` · `ABB` → `BANK_ABB` · THDB `HR` → `HR-D` · `CRYISTELLY` → `CRYISTELLYN` · `RS THOYIBAN-PTN` → `RS THOYYIBAN-PTN` · `SABRINA` → `SABRINA_F`. `DEBTOR` and THLD `HR` are excluded.
- **THDB codes = ERP debtor-child codes** (code = customer id per debtorSync). Exact-match wins; never post to `TR`.
- **Applied identifier normalization:** existing `AMY ` / `STELLA ` customer and account IDs were moved to exact `AMY` / `STELLA`; existing shortened `HPA_SWJ988` / `HPB_SWJ988` were moved to the approved `HPA_SWJ9882` / `HPB_SWJ9882` codes.
- **Created GL codes:** `CA_HINO` (note 8), `OIL920` (note 5), and contra-receivable `CL_AFI` (note 22). No speculative duplicate customer/account codes were created.
- The restored `fs_note_remap_2026-07.sql` migration has been applied on dev; all 2,814 current account codes have a non-null direct `fs_note`. Statement engines still retain parent-note inheritance for future child accounts.

### 4c. Cross-checks with ERP source documents

The completed reconciliation excludes five consolidated wrappers and compares
2,163 ERP source invoices / RM3,335,065.85 with 2,121 imported sales lines /
RM3,336,484.25. The complete bridge—including every unmatched, zero-value,
reference, amount, date, sale-term, and debtor difference—is pinned in
[LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md](LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md).
Pre-cutover ERP invoices have **no S journals** (confirmed), so nothing
collides; imported rows are the Jan–May sales ledger.

---

## 5. Openings & statement wiring — implemented on development

**Applied mechanism:** anchors at 2026-01-01 + `account_opening_balances` in the
TB/BS engines. Development now has 580 January anchors: 291 nonzero balances
and 289 explicit zero fences. The guarded insert preserved the pre-existing
`C-CARE(1)` RM7,635.00 row, inserted 579 rows, and inserted zero rows on rerun:

1. Per-account anchors use `as_of_date = 2026-01-01`, with signed DR-positive
   amounts for every selected nonzero C/FWD and explicit **0.00 anchors** for
   imported-active zero-opening accounts. This fences off pre-2026 organic
   noise such as the 20 posted 2025 RECs.
2. Account Ledger / Bank Statement / Customer & General Statements need **no changes** — they already implement the latest-anchor-≤-start rule, so January ledgers show `BALANCE C/FWD` exactly like legacy.
3. **Implemented in [financial-reports.js](../../src/routes/accounting/financial-reports.js):** Trial Balance and Balance Sheet use the latest anchor ≤ period end plus posted movement in `[anchor_date, period_end]`, then roll up through the effective inherited `fs_note`. Anchor-only and explicit zero-fence accounts remain present. With both 01-01 and 06-01 anchors, June reads the 06-01 checkpoint + June movement. IS/CoGM remain pure journal-based YTD movement.
4. Keep the existing 1,571 anchors @ 2026-06-01 — after import they become **checkpoints**: derived 31-May close must equal each 06-01 anchor (§7).

The giant synthetic opening-journal fallback was not selected and must not be introduced.

**Balance Sheet completeness implemented:** the BS adds **Current Year Profit** from the same journal-only income-statement formula. The Note 22 / Note 7 invoice overrides and their response metadata were removed; journal data and anchors are authoritative.

**Bank ledger cutover implemented:** [bank-statement.js](../../src/routes/accounting/bank-statement.js) now limits the synthetic CH_REV1/CH_REV2→BANK_PBB projection to dates before **2026-01-01**, preventing double-counting once real January bank rows are imported.

**Posting lock implemented:** Tien Hock sales, receipt/payment, and adjustment accounting mutations dated before **2026-06-01** fail with HTTP 409 / `ACCOUNTING_PERIOD_LOCKED`. JP is explicitly excluded. Direct SQL, manual journals, and bank-in mutations remain outside this narrow application guard (§9).

---

## 6. Phase plan

| Phase | Content | Gate to next |
|---|---|---|
| **L0** ✅ | Re-parse both immutable files, prove all 423 active balance chains, correct the malformed-line finding, inventory openings and DB conflicts | corrected results in §3–§4 |
| **L1** ✅ | Resolve every user decision in §8; accept the opening gap only as a named limitation, never a fabricated balance | decisions recorded |
| **L2** ✅ dev | Apply the guarded conflict migration: normalize IDs/codes, create three GL codes + `IMP`, cancel 2,074 superseded RECs, and re-date 16 CN journal headers | only 16 posted CNs remain in Jan–May; zero IMP journals |
| **L3A** ✅ | Hash-pinned file-only parser → declared exclusions/aliases → exact malformed-line normalization → approved `CHARLES-C` routing → deterministic staging CSV/report | 3,863 groups balanced; staging SHA in §3/§10 |
| **L3B** ✅ dev | Re-audit DB, apply the staging table, load the hash-validated CSV, and post five idempotent monthly journal batches | 3,863 journals / 10,068 lines; every monthly and per-account gate passes |
| **L4** ◐ accounting exact; source decision pending | Insert 01-01 anchors, run §7, and reconcile ERP invoices to imported rows | 580 anchors and exact accounting gates pass; literal source-record parity requires the evidence/decisions in the reconciliation document |
| **L5** ✅ dev | TB/BS anchor engine, Current Year Profit, journal-only Note 7/22, bank cutoff, fs-note remap, HPB Note 16, guide, posting lock, and changelog | Jan–Jun BS residue exactly RM1,456,480.37; manual `PV008/06` RM483 retained as unproven contra |
| **L6** ◐ rollout preparation | Audit live state, rehearse on a fresh proof database, stop writes, back up/prepare rollback, then reproduce L2→L5 with direct system PostgreSQL | June refactor is already present in the 13 July prod snapshot and must be verified—not blindly rerun; live access and fresh drift inventory still required |

---

## 7. Verification targets (Phase L4 acceptance)

Every one of these is a hard equality; any residual must be explained and user-approved (June precedent: 015375 +34.00, 015361 +2,880.00).

| Check | Expected |
|---|---|
| Derived close 31 May per account (01-01 anchor + imported movement) vs the **1 June anchor**, for all 1,571 anchored accounts | equal |
| `BANK_PBB`: 275,918.00 @ 01/01 → close 31/05 | **172,288.16 DR** |
| `BANK_ABB` (imported from ABB): 36,563.77 @ 01/01 → close 26/05 | **204.26 DR** |
| `CH_REV1`: 19,629.95 @ 01/01 → close | **35,644.35 DR** |
| `CH_REV2` → close | **1,060.05 DR** |
| `CASH_SALES` movement Jan–May | **1,037,680.40 CR** (its 06-01 anchor) |
| `CR_SALES` movement Jan–May (after THCN re-date, incl. THCN/26/1–16 debits 1,834.92 at their legacy dates) | **2,296,968.93 CR** |
| `C-CARE(1)`: 7,635.00 @ 01/01 → 23/05 close | **8,748.00 DR** (matches the Jan–Jun fixture chain) |
| Sum of imported journal DR = CR globally | **13,503,516.15** each from 10,068 staged transaction lines; diff 0.00 |
| Every imported journal balanced; reference_no unique; display_reference = legacy ref | invariant queries |
| Debtor children: Σ derived 31-May closes vs the June General-Statement B/F total | 507,697.72 (any residual = the §8-3 control drift, named) |
| ERP invoices Jan–May ↔ imported sales rows | zero unexplained rows: every exact match, evidence alias, operational-only document, and source-only row is hard-pinned; literal source-table rewriting requires additional invoice/item evidence |
| Imported journal movement balances for every month Jan–May | monthly DR = CR; cumulative TB/BS difference is exactly the named RM1,456,480.37 opening residue |
| June five-ledger recon re-run unchanged | June numbers identical to the frozen §5e results |

### 7a. Development acceptance result — 13 July 2026

- The source/import gates pass: 12,665 reconstructed source rows, zero running-
  balance mismatches, 3,863 `IMP` journals / 10,068 lines, and DR = CR
  RM13,503,516.15. Every monthly and cumulative per-account check passes.
- The 580 January anchors are exact (291 nonzero + 289 zero fences), with the
  named RM1,456,480.37 CR opening residue. All 1,571 June checkpoints match the
  report-semantics 31 May close; 52 source-absent checkpoints are deliberate
  0.00 debtor fences.
- The named bank/holding/customer targets and June General Statement B/F
  RM507,697.72 all pass. Trial Balance carries exactly RM1,456,480.37 more
  credit than debit for every January–June month.
- The ERP-invoice reconciliation is fully enumerated in
  [LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md](LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md).
  Imported legacy sales exceed ERP numeric invoices by RM1,418.40: RM1,391.00
  from eight positive source-only invoices plus RM27.40 net across two matched
  amount differences. All remaining date, sale-term, debtor, reference, and
  zero-value projection differences are named there.
- **Resolved — Balance Sheet:** `HPB`, `CL_HPB`, and all `HPB_*` suspense
  accounts now use Balance Sheet Note 16 while released interest `HPI` remains
  P&L Note 23. January–June assets are exactly RM1,456,480.37 below liabilities
  and equity in every month, matching the approved missing-opening residue.
- **Retained — frozen June recon:** journal 3563 / `PV008/06` is a pre-import
  manual June cash-payment journal already present in the production dump. The
  legacy bank fixture proves its RM11,764.40 credit but not the RM483 contra;
  `R9882` is only a plausible guess from manually keyed particulars. The RM483
  `BANK_PBB` debit remains unchanged and explicitly unproven.

---

## 8. Approved decisions (Phase L1 complete)

1. **Opening gap:** no legacy TB/Balance Sheet was supplied. Preserve the exact selected-anchor missing debit of RM1,456,480.37 as a named limitation; do not invent a balancing account or amount. RM1,448,916.97 is only the THLD control-level gap before the RM7,563.40 DEBTOR/detail replacement drift.
2. **REC conflicts:** cancel the 2,074 posted Jan–May payment-owned REC journals while preserving payment history. Applied on dev.
3. **DEBTOR control:** exclude the static THLD control and treat THDB per-customer detail as authoritative. Keep the existing 1 June anchors as checkpoints; any 7,563.40 control/detail drift remains named.
4. **Invoice 015347:** route through `CHARLES-C` as four logical lines: DR customer / CR sales, then DR bank / CR customer.
5. **Banks:** map `ABB` → `BANK_ABB` and `PBB_1` → `BANK_PBB`.
6. **Financial statements:** retire the Note 22 / Note 7 invoice overrides; journals and anchors are authoritative.
7. **Posting lock:** enforce the narrow Tien Hock application guard before 2026-06-01; do not apply it to JP.
8. **Identifiers/accounts:** use exact `AMY` and `STELLA` without trailing spaces; use exact `HPA_SWJ9882` / `HPB_SWJ9882`; apply the audited aliases in §4b; create only the three genuinely missing GL codes. Applied on dev.
9. **CSV storage:** move both private files to `dev/import/legacy-jan-may/data/` and gitignore both source and generated artifacts. Applied locally.
10. **CN dates:** move only the 16 source-owned CN journal headers to their exact legacy dates; leave adjustment documents and e-Invoice fields untouched. Applied on dev.
11. **HP interest in suspense:** present `HPB`, `CL_HPB`, and `HPB_*` with the
    paired HP payable in Balance Sheet Note 16; keep released interest `HPI` in
    P&L Note 23. Applied on dev; Jan–Jun report residue is exact.
12. **Manual June `PV008/06`:** do not reclassify its RM483 `BANK_PBB` debit
    without contra-ledger evidence. It predates this import and did not come
    from the Jan–May Excel files.

L3B and the anchor mutation are complete on development. The remaining decisions are the explicitly evidenced L4/L5 acceptance items recorded in §10; no import row or anchor is awaiting repair.

## 9. Known limitations / expected named differences

- The completed ERP-invoice↔ledger comparison found the exact named
  source-versus-ERP differences recorded in
  [LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md](LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md).
  None was hidden with a fake counter-entry.
- Within-day ledger print order: default ordering sorts by visible Journal ref (June rule); `display_order` preserves per-account file order. Residual cosmetic order differences are reported, not chased with per-row `posting_sequence` overrides unless the user asks.
- Two legacy journals sharing (ref, date) merge into one imported journal — same visible rows, one entry behind them.
- The `IMP` journals are standalone (no source links): invoice/payment detail pages for Jan–May won't deep-link to them (subledger detail stays in `invoices`/`payments` rows). Acceptable for historical months; June+ unaffected.
- The posting lock is intentionally application-level and narrow, not a full period close. Direct SQL/migrations, manual journals, bank-ins, purchase invoices, self-billed/general purchases, supplier payments, payroll bank payments, and journal-voucher generation bypass it. A pre-cutoff pending receipt also remains locked even if its proposed clearance date is after the cutoff.
- Pre-existing connected hole: changing an invoice's customer does not currently resync an already-posted sales journal to the new debtor account. This was not broadened into the import work.
- Pre-existing connected bug: the invoice datetime-edit success response references an undefined `paymentsResult`. The posting-lock preflight is safe, but that response path still needs a separate fix.
- Connected data warning outside the import window: `HPA_SWJ9882` currently has a 6 Jun RM2,000 line whose particulars name a Perodua Ativa; it likely belongs to `HPA_QCV920`. It was not changed because the Jan–May import does not authorize altering June data.
- Active accounts without an effective `fs_note` remain visible in Trial Balance but cannot roll into financial statements. Dev currently has zero such accounts after the restored remap; recheck after future account additions.
- GT is outside the shared ledger; JP appears only as debtor `JP` (TJ-family receipts) exactly like June.

---

## 10. Development execution checkpoint

### 10a. Applied to the development database

- The supplied 13 July production SQL was first restored into an isolated
  restricted-role proof database, validated as 154 base tables plus the
  required hierarchy view (155 user relations), with unique journal IDs and
  zero unvalidated constraints, then promoted as a clean local replacement.
  The corrupt prior local database was removed only after proof.
- [2026-07-13_legacy_jan_may_conflicts.sql](../../dev/migrations/2026-07-13_legacy_jan_may_conflicts.sql)
  cancelled the exact 2,074 superseded RECs, re-dated the 16 source-owned CNs,
  normalized identifiers, created three required codes, and registered `IMP`.
- [fs_note_remap_2026-07.sql](../../dev/migrations/fs_note_remap_2026-07.sql)
  and [2026-07-13_legacy_jan_may_staging.sql](../../dev/migrations/2026-07-13_legacy_jan_may_staging.sql)
  were applied. Dev has 2,814 account codes, zero null direct `fs_note` values,
  and the documented 86th table, `import_legacy_rows`.
- [load-staging.mjs](../../dev/import/legacy-jan-may/load-staging.mjs) loaded
  the exact 12,635 rows in one transaction after rechecking source hashes.
- [post-monthly-journals.sql](../../dev/import/legacy-jan-may/post-monthly-journals.sql)
  posted January–May separately: 3,863 journals / 10,068 lines / DR = CR
  RM13,503,516.15. January was rerun as an exact no-op.
- [verify-import.sql](../../dev/import/legacy-jan-may/verify-import.sql) passes
  every source-chain, CN, header/line, monthly account-close, and June-anchor
  gate. It passed again after anchors were inserted.
- [insert-opening-anchors.sql](../../dev/import/legacy-jan-may/insert-opening-anchors.sql)
  inserted 579 rows and preserved the exact pre-existing `C-CARE(1)` row. The
  final 580-row set has 291 nonzero anchors and 289 zero fences; its rerun
  inserted zero rows.

### 10b. Current database truth

- Posted legacy population in Jan–May: 3,863 `IMP` + 16 source-owned `CN`
  journals = 3,879 journals / 10,100 lines / DR = CR RM13,505,351.07.
- Cancelled Jan–May REC population: 2,322 (248 pre-existing + 2,074 migration).
- All 1,571 June checkpoints equal the report-semantics 31 May close. June
  anchor net is −RM2,617,959.05; source opening net is −RM1,456,480.37.
- Trial Balance, named account closes, imported monthly balance, source running
  chains, and June General Statement B/F RM507,697.72 pass exactly.
- The complete sales-document bridge is in
  [LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md](LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md).

### 10c. Remaining boundary

The accounting import and L5 report work are complete on development. Before a
production mutation:

1. The user confirmed that all source-record differences must ultimately be
   reconciled rather than accepted as permanent bridges. That work remains
   blocked by missing legacy item/quantity/salesperson evidence and valid
   MyInvois wrapper history; the exact evidence and decisions required are in
   the reconciliation document. This does not block deploying the already
   exact ledger/report projection, because later source repairs must remain
   nonposting and leave `IMP` untouched.
2. Commit and review every rollout script while keeping the private source CSV,
   generated staging CSV/report, and production dump untracked.
3. Re-audit the live database. The 13 July production snapshot already has the
   June refactor end-state, so those broad June migrations must be verified and
   skipped rather than blindly rerun.
4. Rehearse against a fresh proof restore, stop PM2 writes, take and validate a
   final rollback backup/database, then run the guarded direct-PostgreSQL
   sequence. No direct production credential is available in this workspace.

No build, TypeScript check, or lint command was run, in accordance with
repository instructions.

---

*Update this file as phases execute (per-phase "files changed" + verification results, following the INVOICE_PAYMENT doc convention). Entry point remains [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md).*
