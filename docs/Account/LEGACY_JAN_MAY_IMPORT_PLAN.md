# Legacy Jan–May 2026 Ledger Import — Plan & Handover

**Created 13 Jul 2026 (planning session — NOTHING EXECUTED YET).**
Goal: extend the 1:1 legacy parity already achieved for June 2026 (see [INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md)) backwards to 1 January 2026, by importing the legacy system's Jan–May ledger exports as posted journals, so that **every 2026 report (Trial Balance, Income Statement, Balance Sheet, CoGM, Account Ledger, Customer/General Statements) reads real journal data for the whole year**. June onwards is organic ERP entry (already row-by-row reconciled); Jan–May becomes imported legacy truth; the two meet at the existing 1 June anchors, which become verification checkpoints.

Everything below was verified against the actual CSVs and the dev DB on 13 Jul 2026 with a throw-away parser (validation results in §3). Re-run the analysis before executing — data entry is ongoing.

---

## 1. Source files

Two Excel-exported CSVs currently in the project root (untracked). Recommend moving to `dev/import/legacy-jan-may/data/` before starting (they contain customer names — user decides whether they are committed or gitignored).

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

Proof (triple-checked): particulars text (`K.W.S.P-EPC(01/2026)` on `01-12-26`), PBE cheque batch refs that encode the date (`PBE260112…` on `01-12-26`), all 421 per-account running-balance chains, and per-account date monotonicity all agree with the MM-DD-YY reading. **Any converter must implement exactly this two-format rule** — a naive day-first parse silently shifts hundreds of rows into wrong months.

### 1c. Journal reference families seen (row counts)

THLD: PV 1,612 · PBE 862 · RV 840 · JVSL 366 · TF 192 · JV 159 · TT 129 · TR 108 · C{inv} 95 · T 82 · F (zero-amount bills) 78 · PBB 62 · JVDR 60 · IV 34 · PIB 19 · THCN 16 · MBB 16 · MIB 13 · TS 12 · JVA 12 (ABB loan JVs) · RHB 9 · IN 9 · CIMBI 9 · ALB 7 · TJ 4 · CV 4 · HLB 3 · plus ~3,4k bare invoice-number refs (cash bills in CH_REV1/CASH_SALES, credit invoices in CR_SALES).
THDB: T-families + external-bank refs + C{inv} 95 + ~890 bare invoice numbers.

Volumes cross-check with June: ~178 credit invoices/month (June: 179), ~19 physical-cash C-receipts/month (June: 20). Legacy Jan–May **cash bills post DR CH_REV1 / CR CASH_SALES directly and do NOT touch the debtor ledger** (unlike the ERP's June 4-line contract) — the import reproduces legacy rows as-is, so this difference is expected and harmless.

---

## 2. Import model (core design)

The two files are per-account **projections of one journal population**. The double-entry pairs are split across files (e.g. credit invoice `63371`: DR customer in THDB + CR `CR_SALES` in THLD). The import therefore:

1. Loads both files into one staging table (`import_legacy_rows`).
2. **Groups rows by `(journal_ref, date)` across both files** → each group becomes ONE `journal_entries` row with its `journal_entry_lines`. Validated: **3,880 groups, 3,870 balance to the sen** (§3). Two distinct legacy journals sharing ref+date would merge into one journal — acceptable (both balanced, identical display ref; June evidence `MBB932037-P` already proved display refs are not unique keys).
3. Journal fields:
   - `entry_type` = **`IMP`** (new row in `journal_entry_types`, name "Legacy Import"). Not added to `SYSTEM_ENTRY_TYPES` in [journal-entries.js](../../src/routes/accounting/journal-entries.js), so rows stay hand-fixable during verification; consider locking after sign-off.
   - `reference_no` = deterministic unique internal ref (`IMP-{yyyymmdd}-{seq}`) — `journal_entries.reference_no` has a DB UNIQUE constraint; the repeatable legacy ref goes to **`display_reference`** (header), which every ledger/report already resolves first.
   - `entry_date` = row date; `status` = `posted`; `source_type/source_id` = NULL (manual-like); `description` = `Legacy import {ref}` or dominant particulars.
   - Lines: `account_code` (mapped, §4), `debit/credit`, `particulars` = PARTICULAR, `cheque_reference` = CHEQUE column (real cheque nos for PV rows e.g. `PB350751`, batch refs for PBE rows), `display_order` = file order within the account so within-day ledger print order can reproduce legacy. Do **NOT** set header `cheque_no` (keeps the C-type auto-sequence PBB350779+ untouched).
   - Zero-amount informational rows (`F013562` pattern) import as 0.00 lines — June recon already treats zero rows as first-class ledger content.
4. Openings become **per-account anchors at 2026-01-01** + statement-engine wiring (§5 — the one code deliverable of this project).
5. Batched by month (5 SQL batches), each batch re-runnable/idempotent (keyed on the deterministic `reference_no`), each followed by a month-end balance check against the CSV BALANCE column.

Implementation shape: Node parser (reuse the validated session parser — parsing rules in §1b; recreate under `dev/import/legacy-jan-may/`) → emits staging COPY + transform SQL; grouping/exclusions/repairs done in SQL where they're auditable. All exceptions land in report tables, never silently dropped.

---

## 3. Validation results (13 Jul 2026, full-file parse)

**Balance chains: 421 of 423 active accounts walk perfectly** from C/FWD through every row to the printed balance. The 2 failures are **rows dropped by the Excel export**, recoverable exactly:

| Account | Where | Missing row | Proof |
|---|---|---|---|
| `MBRM` | after line 7263 | DR **191.40**, journal `PV012/01`, 30/01/2026 | chain gap 191.40 = PV012/01 group imbalance 191.40 |
| `ROTH` | after line 12050 | DR **450.00**, journal `PV005/03`, 27/03/2026 | chain gap 450.00 = PV005/03 group imbalance 450.00 |

Global tx totals: DR 13,508,070.67 vs CR 13,508,712.07 → diff −641.40 = exactly those two rows. After repair the whole population balances to 0.00.

**Grouping test: 3,880 (ref,date) groups → 3,870 balanced.** The 10 unbalanced decompose entirely into:

1. The 2 dropped-row PV groups above (repair: insert the missing lines, flagged `repaired=true`).
2. **6 groups from account `HR` ("HR MART") being exported in BOTH files** — the only THLD∩THDB code overlap. THLD's HR section duplicates THDB's HR rows 1:1 (invoices 63371/63509/63647 + TF settlements). Fix: **drop the THLD HR section**, keep THDB.
3. `15347` (CR_SALES CR 170.00, 26/05) + `T260526` (PBB_1 DR 170.00, 26/05) — a sale credited to CR_SALES and banked the same day with **no debtor row anywhere** (customer absent from the THDB export). Fix: merge into one journal DR BANK_PBB / CR CR_SALES 170.00 carrying both display refs (or route through the right debtor if the user can name the customer — open question §8-4).

**Openings (BALANCE C/FWD):**

| Set | DR | CR | Net |
|---|---|---|---|
| THLD (884 accounts, incl. DEBTOR control 507,697.72 DR) | 12,557,673.25 | 14,006,590.22 | **−1,448,916.97** |
| THDB (1,685 customers) | 503,830.50 | 3,696.18 | **+500,134.32** |
| Combined | 13,061,503.75 | 14,010,286.40 | **−948,782.65** |

Family sums (THLD): NCA fixed assets +11,284,675.98 · AD accum-depr −3,836,900.73 · CL creditors/directors −2,673,511.48 · RP retained profit −5,612,866.10 · SC share capital −200,000.00 · CS_* closing-stock credits −829,605.22 (all OS_* are 0.00 — legacy had not rolled the year-start stock swap) · ACD −70,022.74 · ACW −118,151.80 · HP −139,651.84. Key singles: `PBB_1` +275,918.00 · `ABB` +36,563.77 · `CH_REV1` +19,629.95 · `CASH` 0.00 · `CL_TAX` +149,709.97 · `CL_AFI` −25,696.82 · `HPA_SWJ9882` −125,087.68.

⚠ **The opening set does NOT balance.** Excluding the DEBTOR control (superseded by THDB detail), the true gap is a missing **DR ≈ 1,448,916.97** (THLD's own imbalance; the THDB detail replaces the control almost 1:1). The likely candidate is the balance-sheet **STOCK asset** (CS_* credits alone are 829,605.22) plus whatever else the legacy opening TB carries that this export omits. **The user must supply the legacy Trial Balance / Balance Sheet as at 01/01/2026** to close this gap (open question §8-1). Until then the Balance Sheet cannot balance — everything else (ledgers, TB movement, IS, CoGM) is unaffected.

**DEBTOR control account:** opening 507,697.72 DR, **zero transaction rows** (static in legacy). Exclude it entirely — THDB per-customer openings are the authoritative detail. Two follow-ups: (a) its 507,697.72 equals *exactly* the "legacy 1 June debtor list" total imported as the June General-Statement B/F — same number at 1 Jan and 1 Jun is suspicious; (b) THDB per-customer openings net to 500,134.32, i.e. **7,563.40 below the control** — legacy's own control-vs-subledger drift. Both flagged to the user (§8-3); the ERP imports the per-customer truth.

---

## 4. ERP-side conflicts & account mapping (dev DB, 13 Jul 2026)

### 4a. Existing journals inside the import window (would double-count)

| Population | Count / amount | Resolution |
|---|---|---|
| Posted `REC` journals dated Jan–May 2026 (old-model receipts, all `source_type='payment'`, none receipt-owned) | **2,074 / 3,259,534.63** | **Cancel all** before import (same treatment Phase 2 gave cancelled-payment journals). The `payments` rows stay as subledger history — matching the ~2,385 pre-cutover payments that already have no journal. Imported THDB/THLD rows become the ledger truth. |
| Posted `CN` journals parked at 2026-05-31 (THCN/26/1–16) | 16 / 1,834.92 | The CSVs now reveal the **true legacy dates** of THCN/26/1–16. Recommended: **re-date these 16 adjustment-owned journals to the legacy dates** (and keep display refs THCN/26/n), then **skip the 16 matching THCN rows during import** so the CN journals stay source-owned (documents & e-Invoice state untouched — same rule as Phase 4). Alternative (worse): import THCN rows as IMP and cancel the CN journals — breaks adjustment-doc ownership. |
| Cancelled REC (248) / 2025 RECs (20 posted) | — | No action. 2025 rows are fenced off by the new 01-01 anchors. |

There are **no** S, B, C, J, JV, GP, PUR, PAY journals dated Jan–May in dev — the window is clean apart from the two rows above. (Re-verify on prod before executing there.)

### 4b. Account code mapping

- **Alias map (import onto ERP codes):** `PBB_1` → `BANK_PBB` (PBB_1 exists but inactive; all June+ flows/anchors live on BANK_PBB) · `ABB` → `BANK_ABB` (both exist, both currently carry ZERO journal lines; mapping keeps all bank activity on the codes the receipt/payment screens write to — confirm §8-5) · `DEBTOR` → excluded (control) · THLD `HR` → excluded (duplicate of THDB HR).
- **THDB codes = ERP debtor-child codes** (code = customer id per debtorSync). Exact-match wins; never post to `TR`.
- **Codes to create** (active or nonzero-opening only — idle missing codes are skipped): THLD `CA_HINO`, `CL_AFI` (opening −25,696.82), `HPA_SWJ9882` / `HPB_SWJ9882` (Toyota Hilux HP pair; the Ativa pair HPA_QCV920/HPB_QCV920 already exists as the pattern), `OIL920`; THDB customers `AMY`, `CRYISTELLY`, `RS THOYIBAN-PTN`, `SABRINA`, `STELLA` (absent from `customers` — create as plain TD account codes, or as customers first if the user wants them selectable; note `RS THOYIBAN-PTN` contains a space, which the manual quick-add UI pattern disallows but the DB accepts — SQL-create like the existing `C-CARE(1)`).
- Everything else needed already exists: THLD 318 needed codes → 5 missing/1 inactive; THDB 263 needed → 5 missing.

### 4c. Cross-checks with ERP source documents

ERP `invoices` Jan–May (non-cancelled): 2,168 / 4,661,888.65 vs legacy CASH_SALES 1,229 rows + CR_SALES 908 rows — same magnitude; Phase L4 does the exact invoice-by-invoice diff (every ERP invoice should have exactly one imported sales row; differences become a named list like June's 015375/015359). Pre-cutover ERP invoices have **no S journals** (confirmed), so nothing collides; imported rows simply ARE the Jan–May sales ledger.

---

## 5. Openings & statement wiring — the one real code deliverable

**Recommended mechanism (Option B): anchors at 2026-01-01 + wire `account_opening_balances` into the TB/BS engines** (this finally executes gap 1A-7, the long-standing #1 priority):

1. Insert per-account anchors `as_of_date = 2026-01-01` for every nonzero C/FWD (THLD ~140 excl. DEBTOR + THDB ~152; `C-CARE(1)` already has exactly this anchor: 7,635.00 — precedent set). Signed DR-positive, same convention as the June revenue anchors. Also insert explicit **0.00 anchors** for imported-active accounts whose C/FWD is zero, so pre-2026 organic noise (the 20 posted 2025 RECs, etc.) can never leak into a derived opening.
2. Account Ledger / Bank Statement / Customer & General Statements need **no changes** — they already implement the latest-anchor-≤-start rule, so January ledgers show `BALANCE C/FWD` exactly like legacy.
3. **[financial-reports.js](../../src/routes/accounting/financial-reports.js) changes** (Trial Balance + Balance Sheet): balance = latest anchor ≤ period end + posted movement in `[anchor_date, period_end]` (per account, then rolled up by fs_note). With both 01-01 and 06-01 anchor sets present, a June TB reads the 06-01 anchor + June movement — the frozen June recon stays shielded from any Jan–May import imperfection, and no month double-counts. IS/CoGM stay pure YTD movement (P&L accounts have no anchors; their C/FWD is 0.00 in the export — verified for CASH_SALES/CR_SALES).
4. Keep the existing 1,571 anchors @ 2026-06-01 — after import they become **checkpoints**: derived 31-May close must equal each 06-01 anchor (§7).

Fallback (Option A, zero engine work): one giant opening journal dated 2026-01-01 + 0.00 anchors at 01-01. Works with today's engines but the Jan ledgers show the opening as a transaction row instead of a B/F line (not 1:1), and January's journal list gets a 290-line synthetic entry. Only choose this if the TB/BS engine change is deferred.

**Balance Sheet completeness (both options):** two engine gaps surface once real data flows —
- `equity` never receives current-year profit: the BS only sums fs_note balance-sheet notes, so it can only balance when YTD net profit = 0. Add a computed **"Current Year Profit"** equity line = the income-statement net profit for the same period.
- **Note 22 / Note 7 invoice-based overrides**: the BS overrides Trade Receivables with a live `invoices`-computed figure and the TB reports invoice-based revenue/receivables side-figures. After the import the journal-based numbers are authoritative (per-customer children + anchors); the overrides will disagree with the ledger (they know nothing of legacy openings). Decide: retire the overrides (recommended) or demote them to an informational "per invoices" footnote (§8-6).

**Bank ledger cutover flip:** [bank-statement.js](../../src/routes/accounting/bank-statement.js) still applies the synthetic `BANK_LINKED_ACCOUNTS` CH_REV1/CH_REV2→BANK_PBB projection to lines dated **before 2026-06-01**. After the import, real BANK_PBB rows exist from 1 Jan — the projection would DOUBLE every pre-June bank-in. **Move the projection cutoff to 2026-01-01 (or remove the projection entirely)** in the same release as the import. This is mandatory, not optional.

**Post-import edit guard (recommended):** editing a pre-June invoice/payment/adjustment today would make the sync services post a NEW journal into an imported month (pre-cutover documents currently have no journals, so any edit creates one) → instant double-count. Add a minimal **posting-lock date** (config, e.g. `< 2026-06-01`) checked by sales-journal / receipt-service / adjustment accounting before creating or mutating journals, with a clear error. This is gap 1A-8 surfacing exactly as predicted; scope it as a small guard, not a full period-close feature (§8-7).

---

## 6. Phase plan

| Phase | Content | Gate to next |
|---|---|---|
| **L0** ✅ (this session) | Full-file parse, balance chains, grouping test, opening TB, DB conflict inventory — results in §3–§4 | — |
| **L1** | User decisions + missing data: all open questions in §8 (esp. the 1.45M opening gap, REC cancellation, CN re-date, ABB mapping) | every §8 item answered |
| **L2** | Conflict-clearing migration: cancel the 2,074 Jan–May REC journals; re-date the 16 CN journals to their legacy dates; create the 10 missing account codes; add `IMP` journal type | dev DB shows zero posted non-IMP journals dated Jan–May other than the 16 CNs |
| **L3** | Importer: parser (§1b rules) → staging table → exclusions (THLD HR, DEBTOR, 16 THCN rows) → repairs (2 dropped rows, 15347+T260526 merge) → alias map → (ref,date) grouping → 5 monthly journal batches, idempotent | all groups balanced; per-month per-account closes = CSV BALANCE column |
| **L4** | Openings: 01-01 anchors (+ 0.00 fences); full verification suite (§7); ERP-invoice↔imported-row diff with named-differences list | §7 checks pass or every difference named & user-approved |
| **L5** | Statement wiring: TB/BS anchor rule; Current-Year-Profit equity line; Note 22/7 override decision; bank-statement projection cutoff → 2026-01-01; fs_note coverage sweep (imported-active accounts with journal activity but no effective fs_note → remap per [FINANCIAL_STATEMENTS_MAPPING.md](FINANCIAL_STATEMENTS_MAPPING.md)); posting-lock guard; Panduan/guide text + changelog entry (BM+EN) | TB balanced every month Jan–Dec; BS balanced (or gap = the named §8-1 residue); reports spot-checked vs legacy monthly statements if available |
| **L6** | Prod rollout: prod must FIRST receive the June-refactor migration chain (INVOICE_PAYMENT doc §9-3), then L2→L5 re-run against prod data (re-quantify §4a populations there — prod counts WILL differ) | prod verification = dev results |

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
| Sum of imported journal DR = CR globally | ~13.51M each, diff 0.00 after repairs |
| Every imported journal balanced; reference_no unique; display_reference = legacy ref | invariant queries |
| Debtor children: Σ derived 31-May closes vs the June General-Statement B/F total | 507,697.72 (any residual = the §8-3 control drift, named) |
| ERP invoices Jan–May (2,168 / 4,661,888.65) ↔ imported sales rows | 1:1 with named-difference list |
| TB balanced for every month Jan–June; June five-ledger recon re-run unchanged | June numbers identical to the frozen §5e results |

---

## 8. Open questions for the user (Phase L1 — blocking)

1. **Opening gap ≈ 1,448,916.97 DR missing** (§3). Supply the legacy TB/Balance Sheet as at 01/01/2026 (or 31/12/2025 close). Prime suspect: the STOCK balance-sheet asset (CS_* credits alone are 829,605.22; OS_* all zero because legacy hadn't rolled the year-start stock swap). Without it the BS carries a named unbalanced residue; ledgers/TB movement/IS/CoGM are unaffected.
2. **Approve cancelling the 2,074 posted Jan–May REC journals** (3.26M) so imported rows become the sole Jan–May ledger truth (payments rows keep their history, like the existing pre-cutover population).
3. **DEBTOR control anomalies**: control @ 01/01 = 507,697.72 = *exactly* the 1 June debtor-list total previously imported as June B/F, while THDB per-customer openings net 500,134.32 (drift 7,563.40). Confirm the per-customer THDB figures are the truth to import, and whether the June per-customer anchors need re-derivation from a genuine 1 June legacy list (C-CARE(1) June anchor 8,748.00 does check out against the CSV chain, so likely only the *total* coincidence needs explaining).
4. **Invoice 15347 / T260526 (170.00, 26/05)**: no debtor row in either file. Import as DR BANK_PBB / CR CR_SALES directly, or name the customer to route it through their child.
5. **Bank mapping**: confirm ABB→`BANK_ABB` and PBB_1→`BANK_PBB` (all legacy bank history lands on the ERP codes the screens use; legacy codes stay inactive/empty).
6. **Note 22 / Note 7 invoice-based overrides**: retire in favour of journal-based figures, or keep as informational footnotes?
7. **Posting-lock guard** for documents dated before 2026-06-01 (prevents edits from double-posting into imported months): approve the minimal config guard?
8. **Missing THDB customers** (AMY, CRYISTELLY, RS THOYIBAN-PTN, SABRINA, STELLA): create as bare TD account codes, or as full `customers` rows (which auto-creates the children via debtorSync)?
9. **CSV storage**: move both files to `dev/import/legacy-jan-may/data/`; commit or gitignore?
10. **THCN/26/1–16 re-date approval** (adjustment journals move from the parked 2026-05-31 to their true legacy dates found in the CSVs; documents/e-Invoice untouched).

## 9. Known limitations / expected named differences

- Legacy internal inconsistencies (June's RM34 015375 pattern) may exist in Jan–May; the chain/grouping checks found only the two dropped-export rows, but the ERP-invoice↔ledger diff (L4) may surface more — each becomes a named difference, never a fake counter-entry (June precedent).
- Within-day ledger print order: default ordering sorts by visible Journal ref (June rule); `display_order` preserves per-account file order. Residual cosmetic order differences are reported, not chased with per-row `posting_sequence` overrides unless the user asks.
- Two legacy journals sharing (ref, date) merge into one imported journal — same visible rows, one entry behind them.
- The `IMP` journals are standalone (no source links): invoice/payment detail pages for Jan–May won't deep-link to them (subledger detail stays in `invoices`/`payments` rows). Acceptable for historical months; June+ unaffected.
- GT is outside the shared ledger; JP appears only as debtor `JP` (TJ-family receipts) exactly like June.

---

*Update this file as phases execute (per-phase "files changed" + verification results, following the INVOICE_PAYMENT doc convention). Entry point remains [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md).*
