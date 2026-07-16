# Legacy Report Scans — Verification & 1:1 Parity Plan (Handover)

**Created 17 Jul 2026. Status: PLAN ONLY — no fixture, comparison, or database work has started.**
Follow-on to the completed Jan–May legacy ledger import
([LEGACY_JAN_MAY_IMPORT_PLAN.md](LEGACY_JAN_MAY_IMPORT_PLAN.md)). That project ended with an
exact, hash-pinned `IMP` journal projection but **no independent way to verify it**, and with the
approved named limitation of a missing **DR RM1,456,480.37** in the opening anchors (the Trial
Balance / Balance Sheet residue). The user has now exported the requested verification documents
from the legacy system as **scanned PDFs** (received 15 Jul 2026, currently in the repo root).

**Goal, in order:**

1. **Phase V0** — convert the scans into deterministic CSV fixtures (Claude-vision transcription
   over rendered page images; validated by internal arithmetic before any DB use).
2. **Phase V1** — machine-compare fixtures against the dev DB per account / per customer / per
   statement line, categorising every difference. Expected headline result: the RM1,456,480.37
   residue decomposes into a *named per-account opening-correction set* (evidence in §2).
3. **Phase V2** — user-approved guarded migration closing the opening gap (dev → prod). After
   this the Balance Sheet balances (May target: **6,097,691.11**) and the TB residue is gone.
4. **Phase V3** — close remaining report-capability gaps so users can *themselves* produce these
   five reports 1:1 (content parity, never visual) from the ERP going forward — chiefly the
   monthly closing-stock mechanism and Debtor-list column/aging parity.

June 2026 is already row-by-row reconciled; this project is about Jan–May plus standing
capability. **House rules inherited from the import project apply throughout: every difference is
named and explained, nothing is plugged; scans/fixtures are private (customer data) and stay out
of Git; hash-pin everything; guarded idempotent SQL with no-op reruns; content parity only.**

---

## 1. Source scans (received 15 Jul 2026)

Nine image-only scans (no text layer — `pdftotext` returns nothing; OCR/vision required).
Dot-matrix print, high quality, ~50 rows/page on the TBs. SHA-256 pinned here; V0 re-pins them in
a `source-manifest.json` alongside the fixtures.

| File | Pages | Content | SHA-256 |
|---|---:|---|---|
| `Trial_Balance_Jan_2026.pdf` | 20 | TB for month of 01/2026: ACC/CODE · PARTICULAR · APPX · DEBIT · CREDIT | `15a9ce11dc7b18102d8d8751dd794b2289c092febc209020a6457360043d203a` |
| `Trial_Balance_Feb_2026.pdf` | 20 | TB 02/2026 | `6ac3e731b59dabfb7f94fbe87fa46b328f9a55ed80173d78c148a61f010497da` |
| `Trial_Balance_Mar_2026.pdf` | 20 | TB 03/2026 | `22926af36bdc3147c8832b604b84972da19bf0c929a2769421f1b26e9b418d74` |
| `Trial_Balance_Apr_2026.pdf` | 20 | TB 04/2026 | `2724357c2e53499c5e9f1eeeaeb9cce86b1654d17539a8586f4b90e0cffac897` |
| `Trial_Balance_May_2026.pdf` | 20 | TB 05/2026 — grand total **DR = CR 16,408,437.78** | `66d3eaad9651fbc5cc3e4f09ac395afb78d391a068a3e4f09db07ff3b7193c6c` |
| `Balance_Sheet_for_May_2026.pdf` | 1 | BS 05/2026 — **balances at 6,097,691.11** | `f9d6fd2c830cb0b27edfe96fb64ed06e6aaf8028c81ba68348c073e917ad4807` |
| `Income_Statement_for_May_2026.pdf` | 1 | Detail IS 05/2026 (YTD) — profit **284,825.01** | `57f6f31bd7763e35a03cf4f1e74282d6e89e794aad2e1374ea1eb560682e327f` |
| `CoGM_for_May_2026.pdf` | 1 (landscape) | CoGM 05/2026 (YTD) — total **2,479,030.27** | `73d60bd19381d9ba7b0e238cdb1d050dce947bcfce55171f3b7ea22c11aeabc2` |
| `Trade_Debtor_List_as_at_310526.pdf` | 5 (landscape) | Per-customer debtor list + aging — TOTAL DUE **507,697.72** | `13b80235740209c4fecf237f368c2ccb63931381e5f1026e0d6b268d206fcd31` |

Notes on the scans themselves:

- ⚠ **Privacy**: the Trade Debtor List (and TB creditor/director codes) carry real names. On
  17 Jul the nine root filenames plus `dev/import/legacy-report-fixtures/{data,generated}/` were
  added to `.gitignore`; V0 step 1 moves the PDFs into `data/` and the root entries can then be
  dropped.
- The legacy system clock is broken — the Debtor List prints `REPORT DATE : 01 MAR 2010`.
  Ignore printed report dates; trust report titles/content only.
- The TB `PARTICULAR` column is misaligned against `ACC/CODE` on at least the May TB final page
  (descriptions shifted one row around the appended `DEBTOR` / `CL AFI` sections). **Match on
  account code only; use descriptions as a fuzzy sanity check, never a join key.**
- Printed codes use spaces where the ERP uses underscores: `ACD EPF` → `ACD_EPF`,
  `CASH SALES` → `CASH_SALES`, `CA 6389` → `CA_6389`. Normalization rule: internal spaces →
  underscore, then exact-match against `account_codes`, then the import alias table
  (`dev/import/legacy-jan-may/account-aliases.json`), then a named exception list. No fuzzy
  matching (house rule).

## 2. What was already verified this session (17 Jul, by direct inspection of rendered pages)

These facts ground the plan; the transcription will re-prove them mechanically.

**The scans tie to the imported ledger.** Spot-checked printed May figures that equal
already-pinned import targets exactly:

| Printed on scan | Value | Matches |
|---|---:|---|
| TB `CASH SALES` | 1,037,680.40 CR | imported Jan–May CASH_SALES movement / its 06-01 anchor |
| BS `CASH AT BANK` (note 19) | 172,492.42 | BANK_PBB 172,288.16 + BANK_ABB 204.26 |
| BS `CASH IN HAND` (note 6) | 36,704.40 | CH_REV1 35,644.35 + CH_REV2 1,060.05 |
| BS `TRADE RECEIVABLES` (note 22) | 507,697.72 | DEBTOR control = June General-Statement B/F |
| BS `RETAINED PROFIT - B/F` (note 20) | 5,612,866.10 | THLD `RP` opening |
| IS `REVENUE` (note 7) | 3,334,649.33 | imported sales 3,336,484.25 − THCN/26/1–16 CNs 1,834.92 |
| TB grand total | 16,408,437.78 both sides | the legacy TB **balances** — the missing openings exist in these scans |
| Debtor List `TOTAL BALANCE TO DATE` | 507,697.72 | June B/F; aging row: 245,412.66 / 124,740.50 / 24,055.71 / 42,524.62 |

**The residue decomposes exactly.** The scans supply, for the first time, the missing opening
figures:

- IS `OPENING INVENTORIES` (note 3-1): **84,393.20** (finished goods)
- CoGM `OPENING INVENTORIES` (note 3-3): **348,501.50** (raw material) and
  `OPENING INVENTORIES/PACKING MATERIAL` (note 3-7): **193,980.45**
- Opening inventories total **626,875.15**; THLD's exported `CS_*` credits total **829,605.22**;
  **626,875.15 + 829,605.22 = 1,456,480.37 — exactly the named residue.**

**The stock-account anomaly (KEY open question).** In the May TB scan the `CS *` accounts print
**.00** with APPX 14-1/14-2/14-3 — yet the THLD export (the basis of our 01-01 anchors) carried
them as CR 829,605.22 openings, with zero transaction rows. Meanwhile the BS shows nonzero
inventories (14-1: 188,979.60 · 14-2: 336,909.82 · 14-3: 182,194.43 = 708,083.85) and the IS/CoGM
carry both opening- and closing-inventory lines. Conclusion: **the legacy operator ran the
year-start stock roll (and possibly monthly stock updates) in the legacy system *after* the
Jan–May Excel export was taken**, and/or legacy injects month-end stock into the BS/IS/CoGM from
its stock module rather than from TB rows. Which of these it is — and exactly which accounts carry
what, month by month — is precisely what the TB transcription will pin down. Do **not** design the
V2 correction before V1 answers this.

**Other structure facts:** the TB prints the full chart including zero-balance accounts (~1,000
rows/month); `DEBTOR` prints as one control row (507,697.72, APPX 22) — conveniently the ERP TB
endpoint also collapses TD debtor children into one `DEBTOR` row; `BTRA` prints 2,230.00 DR
APPX 5 (one of the old open classification questions — the scans may settle several of those,
see [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md) open questions 1–4).

## 3. Settled design decisions (do not re-litigate)

1. **Transcription method: Claude-vision over rendered page PNGs.** The proven renderer is
   handed over at `dev/import/legacy-report-fixtures/render-pdf.mjs` (pdfjs-dist 4.8.69 legacy
   build + node-canvas, both already in `node_modules`; no new dependencies, no system installs).
   Scale 2 (~1190×1684) is comfortably readable. **No cloud OCR** — the scans contain customer
   data. Tesseract is not installed and is weak on dot-matrix anyway. Vision-transcription errors
   are bounded by the V0 arithmetic invariants plus the V1 per-account DB cross-check (§5) —
   virtually every row has an independent expected value, so silent corruption cannot survive
   the gates.
2. **Layout parity is explicitly NOT a goal** (standing rule since the bank statement build):
   content, accounting meaning, calculations, reconciliation logic only.
3. **Fixture home:** `dev/import/legacy-report-fixtures/` with `data/` (PDFs + transcribed CSVs)
   and `generated/` (rendered pages, validation reports) both gitignored; a tracked
   `source-manifest.json` pins the PDF SHA-256s (§1) and, once approved, each fixture CSV's
   SHA-256 — same discipline as `dev/import/legacy-jan-may/`.
4. **Amounts are integer cents** in fixtures; dates/periods as literal strings; no locale parsing.
5. **The imported `IMP` journals are immutable.** Whatever V1 finds, the correction path is new
   anchors and/or new user-approved journals/migrations — never edits to imported rows
   (import-plan §8/§10 boundaries stand).
6. **Every fixture row keeps `page` + `row_on_page` provenance** so any dispute goes straight
   back to the scan image.

## 4. Phase V0 — scans → validated CSV fixtures (file-only, no DB)

1. Move the nine PDFs from the repo root into `dev/import/legacy-report-fixtures/data/`
   (then simplify the root `.gitignore` entries added 17 Jul). Write `source-manifest.json`.
2. Render all pages (~108) to `generated/pages/` via `render-pdf.mjs <pdf> <prefix> all 2`.
3. Transcribe, in value order: **May TB → Debtor List → BS/IS/CoGM → Apr/Mar/Feb/Jan TBs.**
   Fixture schemas:
   - `tb_2026-MM.csv`: `page, row_on_page, acc_code_printed, acc_code_erp, particular, appx,
     debit_cents, credit_cents` (one row per printed row incl. zeros; `acc_code_erp` filled by the
     normalization rule in §1, blank = named unmapped exception). Grand-total row captured
     separately in the manifest, not as a data row.
   - `trade_debtor_list_2026-05-31.csv`: `page, row_on_page, account_no, particular, bal_bf_cents,
     current_cents, payment_cents, total_due_cents, age_current_cents, age_1m_cents, age_2m_cents,
     age_3m_plus_cents` (+ the printed totals row in the manifest).
   - `bs_2026-05.csv` / `is_2026-05.csv` / `cogm_2026-05.csv`: `line_no, section, particular,
     note, amount_cents, is_subtotal`.
4. **File-only validator** (Node, mirrors `prepare-staging.mjs` philosophy — fail loudly, write a
   JSON validation report). Invariants:
   - **TB-a** per month: Σdebit = Σcredit = printed grand total (May: 16,408,437.78).
   - **TB-b** every printed code maps to exactly one ERP code or a named exception; no duplicate
     codes within a month.
   - **TB-c** account set is consistent across the five months (additions/removals listed, not
     assumed away).
   - **TDL-a** per row: bal_bf + current + payment = total_due; aging buckets sum to total_due.
   - **TDL-b** column sums equal the printed totals row (578,661.95 · 316,376.89 · −518,086.73 ·
     507,697.72 · 245,412.66 · 124,740.50 · 24,055.71 · 42,524.62).
   - **ST-a** BS/IS/CoGM printed subtotals recompute exactly; BS balances (6,097,691.11 both
     sides); IS profit = BS "profit for the financial year" (284,825.01); CoGM total = IS CoGM
     line (2,479,030.27); closing inventories agree across BS/IS/CoGM (188,979.60 / 336,909.82 /
     182,194.43).
   - **ST-b** TB rows grouped by APPX vs the BS/IS/CoGM lines: reconcile where possible and
     **record exactly which statement lines are NOT backed by TB rows** — this empirically pins
     the stock-injection question from §2 (e.g. if no TB rows carry APPX 14-* balances, legacy
     injects closing stock at report level).
   - Cross: TB May `DEBTOR` = TDL total = 507,697.72.

   **Gate to V1:** validator green; fixture SHA-256s pinned in the manifest.

## 5. Phase V1 — automated comparison against the DB (read-only)

Dev and prod carry identical Jan–May accounting data (both ran the guarded import), so V1 runs on
dev. Build one rerunnable harness (SQL via `docker exec … psql`, or Node against the same pool)
plus a human-readable diff report doc. Comparisons:

1. **TB per account per month** — scanned balance vs ERP derived balance under *report semantics*
   (latest anchor ≤ period end + posted movement to month-end; i.e. what
   `GET /api/financial-reports/trial-balance/:y/:m` reads). Every account lands in exactly one
   category:
   - **exact** (expected for the overwhelming majority — all 1,571 June checkpoints already
     equal derived 31-May closes);
   - **constant offset** — `scan − ERP` identical across all five month-ends ⇒ a missing/incorrect
     01-01 opening of exactly that amount (movement is proven; only the level is off). This is
     the mechanism that converts the residue into a per-account correction set;
   - **non-constant offset** ⇒ OCR suspect or genuine data difference — re-inspect the page image
     first, then explain;
   - **scan-only / ERP-only accounts** (zero rows are cosmetic chart differences; nonzero ones are
     findings).
   - **Global check: Σ(all offsets) must equal net DR 1,456,480.37 at every month-end** — proving
     the residue is entirely opening-level and nothing is wrong in-window.
   - Named expected difference: `DEBTOR` control is static 507,697.72 in legacy while the ERP's
     collapsed TD row moves monthly with the true subledger; Jan–Apr TB `DEBTOR` rows will
     disagree by design (the known control-vs-detail drift family, import-plan §8-3). Verify the
     legacy row really is static and record per-month ERP TD totals beside it.
2. **Trade Debtor List** — per-customer `total_due` vs derived debtor-child 31-May close (expect
   exact: June anchors already equal those closes; this now proves them against legacy print
   rather than against the legacy list total alone). Reconcile `bal_bf`/`current`/`payment`
   against per-customer April close and May movement. Compare aging buckets against the Debtors
   report's rules — bucket definitions must be pinned (current = May invoices, 1 month = Apr, …)
   before calling differences bugs.
3. **BS / IS / CoGM (May)** — note-level fixture lines vs
   `GET /api/financial-reports/{balance-sheet,income-statement,cogm}/2026/5`. Every line diff
   must be attributable to (a) the opening-correction set, or (b) the stock-injection mechanism
   (ST-b), or (c) a named fs_note mapping issue. Check `financial_statement_notes` actually
   carries 3-1/3-3/3-7/14-1/14-2/14-3 and how `CS_*`/`OS_*` fs_notes are mapped today.

   **Gate to V2:** zero unexplained rows; a complete named opening-correction table (account →
   exact amount → evidence page) presented for user sign-off, together with the answer to the
   stock-roll question (§6-1).

**Deliverable style:** a `verify-legacy-reports` script that stays green forever (like
`verify-import.sql` did for the import) so future fs_note edits, anchor changes, or engine
changes cannot silently break scan parity — plus a findings doc
(`LEGACY_REPORT_RECONCILIATION.md`, mirroring
[LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md](LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md)).

## 6. Phase V2 — close the opening gap (guarded mutation, dev → prod)

Blocked on V1's evidence and the user decisions in §8. Expected shape (verify, don't assume):

- Insert the missing 01-01 openings for the stock family (and anything else V1 surfaces), and/or
  supersede the existing `CS_*` CR anchors, replacing the named RM1,456,480.37 residue with real
  balances.
- **Anchor vs journal is a real decision, not a detail:** the IS/CoGM engines read *journal
  movement only* — an anchor on a P&L-type account (opening inventories, notes 3-*) will fix the
  TB/BS but will **never** render on the Income Statement/CoGM. If the legacy year-start roll was
  itself a journal (posted in legacy after the export), the faithful reproduction is a
  user-approved 01-01 journal; it must balance, which the transcribed per-account amounts will
  prove one way or the other.
- Delivery discipline exactly as the import: `dev/migrations/2026-MM-DD_*.sql`, precondition
  checks on the current anchor/journal population, exact expected counts/amounts, idempotent
  no-op rerun, rehearsal on a fresh restore, validated rollback backup for prod, PM2 window.
- ⚠ **The old acceptance scripts pin the current anchor set.** `verify-import.sql` /
  `insert-opening-anchors.sql` expect 580 anchors and the RM1,456,480.37 residue; after V2 they
  will (correctly) no longer pass as written. Follow the presentation-migration precedent: the V2
  migration itself becomes the new final verifier, and the old scripts are documented as
  pre-V2-state only. Never weaken the old scripts in place.
- Re-run after mutation: V1 harness (all offsets → 0; May BS balances at 6,097,691.11; TB residue
  gone for every month Jan–Jun), the frozen June five-ledger recon (must be unchanged — the
  correction touches openings, not June movement… but `CS_*`/stock anchors DO affect June-period
  TB/BS levels, so June statement figures will legitimately change; name them), and the
  1,571 June checkpoint equality.
- Update docs ([ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md),
  [LEGACY_JAN_MAY_IMPORT_PLAN.md](LEGACY_JAN_MAY_IMPORT_PLAN.md) §3/§8-1) and add a changelog
  entry (user-visible: Balance Sheet now balances / opening stock loaded).

## 7. Phase V3 — standing 1:1 report capability for users

What "the user can create those 1:1 data" still needs after V2 (enumerate precisely from V1's
findings; expected items):

1. **Monthly closing-stock mechanism** — the BS inventories (14-*) and IS/CoGM closing-inventory
   lines change monthly; legacy sources them from its stock module (per §2/ST-b evidence). The ERP
   equivalent: either a structured monthly stock-valuation journal (user keys/confirms month-end
   values; ties to the existing Material Stock / `material_stock_entries` +
   `material_stock_kilang_entries` figures) or report-level injection from those tables. This is
   gap item #4 in [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md) §4 — design it against the
   scanned figures as acceptance targets (May: 188,979.60 / 336,909.82 / 182,194.43).
2. **IS/CoGM opening-inventory lines** — however V2 lands (journal vs anchor), the engines must
   actually render notes 3-1/3-3/3-7 with 626,875.15 total for every 2026 month.
3. **Debtor list parity** — the ERP Debtors report already has aging; verify/extend the
   month-statement columns (BAL B/F · CURRENT · PAYMENT · TOTAL DUE) and bucket rules so a user
   can print the 31-May list and match the scan per customer.
4. Keep the V1 harness as a regression gate (documented run command, like the import's
   verification suite).

**Phase V4 — closeout:** prod parity re-run, docs refresh, retain scans + fixtures permanently as
audit evidence (they are the only independent proof of the Jan–May books).

## 8. User decisions / questions to resolve (record answers here before V2)

1. **Ask the co-worker:** was the year-start stock roll (and/or year-end 2025 close) run in the
   legacy system *after* the Jan–May Excel export was taken? What exactly did it post (accounts,
   amounts, date)? Were monthly stock values also updated in legacy? This explains the `CS_* = .00`
   TB rows and decides the V2 correction's shape and dating.
2. **Anchor vs 01-01 journal** for the opening-stock correction (IS/CoGM visibility — §6).
3. If the TB scans reveal account codes missing from the ERP chart: create them (with fs_note) or
   alias them to existing codes?
4. Approve superseding the existing `CS_*` CR anchors (they came from the hash-pinned THLD export;
   changing them departs from "export = truth" in favour of "printed TB = truth" — needs explicit
   sign-off since the two now provably differ).
5. Debtor-aging bucket definitions for TDL parity (before treating bucket diffs as bugs).
6. Only May BS/IS/CoGM/TDL were scanned. Jan–Apr statement prints (and Jan–Apr debtor lists) would
   add four more checkpoints each — worth exporting if cheap, but the monthly TBs already give
   per-account coverage, so this is optional.

## 9. Risks & notes for the next session

- **Do not trust the printed PARTICULAR/report-date fields** (§1). Join on code; capture text for
  provenance only.
- **OCR risk is structurally bounded**: TB-a totals, TDL row arithmetic, ST-a recomputation, and
  the V1 constant-offset invariant mean an undetected mis-read requires multiple compensating
  errors. Treat every non-constant offset as "re-read the page" before "data problem".
- ~108 pages ≈ 5,400 TB rows (mostly `.00`) + ~200 debtor rows + ~60 statement lines. Transcribe
  full pages (zero rows included — `CS_* = .00` is itself a finding); batch by page; validate
  incrementally per month so errors surface early, not after 100 pages.
- The dev DB Docker container wasn't running this session (`dev.bat` / `cd dev && docker compose
  up` first); all V1 queries go through `docker exec -i tienhock_dev_db psql …` per CLAUDE.md.
- The renderer (`dev/import/legacy-report-fixtures/render-pdf.mjs`) was smoke-tested 17 Jul
  against all nine PDFs from the repo root; page counts in §1 come from it.
- When V2 changes June-period statement *levels* via stock accounts (§6), the frozen June recon
  numbers in [INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md)
  stay valid for ledgers/movements but the June TB/BS totals cited anywhere must be re-derived —
  update docs rather than leaving stale figures.
- The scans may also settle old classification questions (`BTRA` = APPX 5, `NT_7484`, `THJ_CK`/
  `THJ_SM`, `CL_GT`/`CL_GF` debit balances) — harvest those answers into
  [LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md](LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md) while
  transcribing, they cost nothing extra.

---

*Update this file as phases execute (per-phase "files changed" + verification results, following
the import-plan convention). Entry point remains [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md).*
