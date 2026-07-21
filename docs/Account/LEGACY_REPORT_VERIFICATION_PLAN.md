# Legacy Report Scans — Verification & 1:1 Parity Plan (Handover)

**Created 17 Jul 2026. Updated 21 Jul 2026. Phases V0–V3 are COMPLETE on development: the May books balance at RM8,980,756.68 with keyed monthly closing stock injected (net assets RM6,090,429.60 = scan RM6,097,691.11 less the named GP-202604-0001 drift), the Trade Debtor list/statement matches the legacy scans 150/150 including FIFO aging, and those ±RM7,261.51 GP-drift lines are the only remaining scan differences anywhere. Production V2/V3 remains a separate approval (rollout order OP→LGP then V2, rehearsed on fresh production copies — see §6); V4 (closeout — parity re-run, docs refresh, permanent scan/fixture retention) is complete (§7).**
Follow-on to the completed Jan–May legacy ledger import
([LEGACY_JAN_MAY_IMPORT_PLAN.md](LEGACY_JAN_MAY_IMPORT_PLAN.md)). That project ended with an
exact, hash-pinned `IMP` journal projection but **no independent way to verify it**, and with the
approved named limitation of a missing **DR RM1,456,480.37** in the opening anchors (the Trial
Balance / Balance Sheet residue). The user has now exported the requested verification documents
from the legacy system as **scanned PDFs** (received 15 Jul 2026, now stored privately under
`dev/import/legacy-report-fixtures/data/`).

**Goal, in order:**

1. **Phase V0** — convert the scans into deterministic CSV fixtures (Claude-vision transcription
   over rendered page images; validated by internal arithmetic before any DB use).
2. **Phase V1** — machine-compare fixtures against the dev DB per account / per customer / per
   statement line, categorising every difference. Expected headline result: the RM1,456,480.37
   residue decomposes into a *named per-account opening-correction set* (evidence in §2).
3. **Phase V2** — ✅ completed and verified on development 20 Jul 2026; production remains a
   separately approved rollout. The guarded migration removes the TB residue and makes the Balance
   Sheet balance at the pre-closing-stock May total **5,389,607.26**.
4. **Phase V3** — ✅ completed and verified on development 21 Jul 2026 (see the §7 execution
   record): users can now *themselves* produce these five reports 1:1 (content parity, never
   visual) from the ERP going forward. Monthly closing stock is keyed on the Material Stock page
   and injected at report level (May reaches **6,090,429.60** = 6,097,691.11 less the named GP
   drift), and the Debtor list/statement has full column/aging parity.

June 2026 is already row-by-row reconciled; this project is about Jan–May plus standing
capability. **House rules inherited from the import project apply throughout: every difference is
named and explained, nothing is plugged; scans/fixtures are private (customer data) and stay out
of Git; hash-pin everything; guarded idempotent SQL with no-op reruns; content parity only.**

---

## 1. Source scans (received 15 Jul 2026)

Nine image-only scans (no text layer — `pdftotext` returns nothing; OCR/vision required).
Dot-matrix print, high quality, ~50 rows/page on the TBs. SHA-256s are pinned both here and in
`source-manifest.json` alongside the completed fixture hashes.

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

- ⚠ **Privacy**: the Trade Debtor List (and TB creditor/director codes) carry real names. The PDFs
  now live under the ignored `dev/import/legacy-report-fixtures/data/`; the temporary root-file
  ignore entries were removed after the move. Both `data/` and `generated/` remain ignored.
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
   `source-manifest.json` pins the PDF and final fixture CSV SHA-256s — same discipline as
   `dev/import/legacy-jan-may/`.
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
3. Transcribe, in value order: **May TB → Debtor/Creditor Lists → BS/IS/CoGM →
   Apr/Mar/Feb/Jan TBs.**
   Fixture schemas:
   - `tb_2026-MM.csv`: `page, row_on_page, acc_code_printed, particular, appx, debit_cents,
     credit_cents` (one row per printed row incl. zeros). The fixture remains a raw scan
     transcription; V1 derives `acc_code_erp` using the normalization rule in §1 and records every
     alias/exception in its comparison output. Grand-total rows are captured in the manifest, not
     as data rows.
   - `trade_debtor_list_2026-05-31.csv`: `page, row_on_page, account_no, particular, bal_bf_cents,
     current_cents, payment_cents, total_due_cents, age_current_cents, age_1m_cents, age_2m_cents,
     age_3m_plus_cents` (+ the printed totals row in the manifest).
   - `bs_2026-05.csv` / `is_2026-05.csv` / `cogm_2026-05.csv`: `line_no, section, particular,
     note, amount_cents, is_subtotal`.
4. **File-only validator** (Node, mirrors `prepare-staging.mjs` philosophy — fail loudly, write a
   JSON validation report). Invariants:
   - **TB-a** per month: Σdebit = Σcredit = printed grand total (May: 16,408,437.78).
   - **TB-b** every printed code is nonblank and unique within a month; V1 owns the exact ERP-code
     mapping and named exception list.
   - **TB-c** account set is consistent across the five months (additions/removals listed, not
     assumed away).
   - **TDL-a** per row: bal_bf + current + payment = total_due; aging buckets sum to total_due.
   - **TDL-b** hard-gate the internally valid printed controls: total due 507,697.72 and the 1m /
     2m / 3m+ aging totals 124,740.50 / 24,055.71 / 42,524.62. The scan's B/F, current, payment and
     current-aging totals include unlisted zero-due accounts and are reported informationally;
     they do not reconcile with the printed rows or even with the scan's own total-due figure.
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

### V0 execution record — completed 20 Jul 2026

**Files changed:** tracked `.gitignore`, `dev/import/legacy-report-fixtures/{render-pdf.mjs,
crop-page.mjs,validate-fixtures.mjs,source-manifest.json}` and this plan. The private PDFs, CSV
fixtures, rendered pages and validation report live in the gitignored `data/` / `generated/`
directories.

- All **nine source PDFs / 108 source pages** were moved and hash-verified. The renderer produced
  **213 PNGs**: standard and high-resolution copies for the 100 TB and five list pages, plus one
  copy of each three statement pages.
- The five TB fixtures each contain **885 account rows**, with identical account sets and no
  duplicates. Their printed controls recompute exactly:

  | Month | Debit | Credit | `DEBTOR` control |
  |---|---:|---:|---:|
  | Jan 2026 | 13,982,350.19 | 13,982,350.19 | 534,531.47 |
  | Feb 2026 | 14,529,026.66 | 14,529,026.66 | 561,710.82 |
  | Mar 2026 | 15,171,186.06 | 15,171,186.06 | 466,791.00 |
  | Apr 2026 | 15,876,445.88 | 15,876,445.88 | 578,661.95 |
  | May 2026 | 16,408,437.78 | 16,408,437.78 | 507,697.72 |

- March–May had zero unexpected non-stock differences in the earlier dev-DB cross-checks;
  January–February have zero unexpected non-stock differences against the independently
  hash-pinned import staging. The only stock-family differences are the expected `OS_*` / `CS_*`
  evidence already described in §2.
- The list fixtures contain **150 debtor rows** plus the scan's bonus **three-creditor** first
  page. Every listed row recomputes. Total due and the older aging buckets tie to the printed
  controls; the scan's inconsistent aggregate-column quirk is preserved and named rather than
  silently adjusted.
- The BS / IS / CoGM fixtures contain **24 / 20 / 14 lines**. Every subtotal chain recomputes;
  the BS balances at 6,097,691.11, IS profit is 284,825.01, CoGM is 2,479,030.27, and closing
  inventories cross-tie across all three reports.
- `node dev/import/legacy-report-fixtures/validate-fixtures.mjs` passes all hard gates and writes
  `generated/validation-report.json`. It also verifies all **nine source hashes** and all **ten
  final fixture hashes** pinned in `source-manifest.json`.

**V0 finding correcting a pre-transcription assumption:** `DEBTOR` is not a static May control.
It moves every month as shown above and matches the corresponding debtor-detail checkpoint. V1
must expect the collapsed ERP TD row to match each month's printed control, not treat Jan–Apr as a
designed difference.

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
   - Confirm the V0 finding that the collapsed ERP TD row equals the moving printed `DEBTOR`
     control at every month-end (534,531.47 / 561,710.82 / 466,791.00 / 578,661.95 / 507,697.72).
     Any difference is now a finding, not a designed control-vs-detail exception.
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

### V1 step 1 execution record — account-code mapping, completed 20 Jul 2026

**Files changed:** tracked `dev/import/legacy-report-fixtures/verify-legacy-reports.mjs`
(the V1 harness; stage `map` implemented, later stages extend it) and
`dev/import/legacy-report-fixtures/scan-code-exceptions.json` (the named exception list).
Output `generated/account-map.json` is gitignored with the rest of `generated/`.

- The V0 validator re-ran fully green first (all 9 source + 10 fixture hashes verified).
- ERP TB report semantics pinned from `financial-reports.js`: per account, latest
  `account_opening_balances` anchor with `as_of_date <= period end`, plus posted journal
  movement from the anchor date (else Jan 1) through period end; population = active accounts
  with an anchor or movement; TD children collapse into the synthetic `DEBTOR` row. Step 2's
  derived balances must reproduce exactly this.
- All **885 printed codes** (identical set across the five months, re-asserted) resolve:
  **875 exact** after space→underscore normalization, **0 via the import alias table**,
  **5 named exceptions**, **5 unmatched**. A collision guard proves no two printed codes land
  on the same ERP code.
- The 5 exceptions (each with evidence in `scan-code-exceptions.json`): `DEBTOR` → synthetic
  TD control row; `HPA SWJ988`/`HPB SWJ988` → `HPA_SWJ9882`/`HPB_SWJ9882` (the TB prints codes
  in a 10-char field — max printed length is exactly 10 — and the Toyota Hilux particulars
  match); `PBB 1` → `BANK_PBB` and `ABB` → `BANK_ABB` (the import redirected these THLD bank
  codes; printed May balances 172,288.16 / 204.26 equal the BS note-19 components, while
  exact-matching the ERP stubs would fabricate a constant offset).
- The 5 unmatched codes (`ARI`, `CR QF`, `DEP SAA453`, `OUTPUT.TAX`, `TAX EXP`) print **.00 in
  all five months** — cosmetic chart differences, no ERP counterpart needed.
- Notable: printed `PBB 2` exact-matches the **inactive** ERP `PBB_2` (zero everywhere on both
  sides — harmless, flagged); printed `HR` is genuinely HIRING OF PLANT (zero), not the HR MART
  debtor.

### V1 step 2 execution record — TB comparison, completed 20 Jul 2026

**Files changed:** `verify-legacy-reports.mjs` (stage `tb` added; run
`node dev/import/legacy-report-fixtures/verify-legacy-reports.mjs` for all stages). Output
`generated/tb-comparison.json` (gitignored) holds full per-account monthly scan/ERP/diff cents
for every non-exact account, with scan evidence pages.

Scanned balance vs ERP derived balance (exact endpoint semantics, TD collapsed into `DEBTOR`),
five month-ends, integer cents. **Result: the residue decomposes perfectly and nothing else
differs.**

- **880 compared accounts: 755 exact, 125 constant offsets, 0 non-constant offsets,
  0 nonzero scan-only or ERP-only findings.** Every offset is identical Jan–May.
- **Σ offsets = DR 1,456,480.37 at every one of the five month-ends** (hard-gated in the
  harness) — the entire difference between scans and ERP is opening-level; the imported
  movement is fully proven at TB level.
- The 125 offsets are exactly the stock family, matching §2's prediction to the cent:
  **63 `CS_*` = +829,605.22** (ERP carries THLD CR anchors; printed TB says `.00` — presence
  "both") and **62 `OS_*` = +626,875.15** (printed TB carries DR openings; ERP has nothing —
  presence "scan_only", though all `OS_*` codes already exist in `account_codes`). The `OS_*`
  set splits by APPX exactly into the statement notes: **3-1 = 84,393.20 · 3-3 = 348,501.50 ·
  3-7 = 193,980.45.**
- **`DEBTOR` control matches the ERP collapsed TD row at all five month-ends** (534,531.47 /
  561,710.82 / 466,791.00 / 578,661.95 / 507,697.72 — hard-gated).
- TB-level answer to the §2 stock question: the printed TBs carry **constant** `OS_*` openings
  and **zero** `CS_*` all five months — the legacy TB records no monthly stock movement at all,
  so the nonzero BS inventories (APPX 14-*) must be injected at report level (step 4/ST-b
  delivers the final proof from the statement side).
- This yields the complete V2 opening-correction candidate set: zero out the 63 `CS_*` CR
  anchors (user decision §8-4: printed TB = truth) and anchor the 62 `OS_*` printed openings —
  per-account amounts and evidence pages in `tb-comparison.json`.

### V1 step 3 execution record — Trade Debtor List, completed 20 Jul 2026

**Files changed:** `verify-legacy-reports.mjs` (stage `tdl` added),
`scan-code-exceptions.json` (one audited TDL customer-code exception added), and this plan.
Output `generated/tdl-comparison.json` (gitignored) holds every named endpoint difference,
the exact scan evidence row, the two deterministic regression fingerprints, and the 150-row
exact-code list.

- **All 150 printed debtors resolve one-to-one:** 148 exact customer ids, existing import alias
  `RS THOYIBAN-PTN` → `RS THOYYIBAN-PTN`, and named scan exception `MYSHOP-KNG` →
  `MYSHOP-KMB` (same -0.10 April/May close; evidence p3 r7). No fuzzy matching.
- **All 150 rows match exactly** for 30-Apr `BAL B/F`, legacy-semantic May `CURRENT` and
  `PAYMENT`, May net movement, 31-May `TOTAL DUE`, and the independent 1-Jun debtor anchor.
  The three control paths all total **507,697.72**. This independently proves every imported
  debtor close, not merely the `DEBTOR` control total.
- The printed column rules are now empirical and exact: `CURRENT` = S/DN/RN debtor debits net
  of CN credits; `PAYMENT` = signed REC movement plus S cash-auto-collection credits; other
  types are excluded. The current ERP General Statement's raw debit/credit split matches
  145/150 rows. Its five named presentation differences total **841.75** in each column with
  zero net effect: four May CNs totaling 301.75 belong in legacy `CURRENT`, and GUI's equal
  540.00 wrong-bank-in/contra pair belongs in neither legacy column. The complete five-row
  difference is hard-pinned by fingerprint
  `3a9168d26b25a45e8e0048e7758ccf16f95409253fc58c5cddd461eb1d68c61b`.
- The ERP ledger has **191** May activity/opening rows: the printed 150 nonzero closes plus
  **41 zero-close rows omitted from the body**. Those 41 contribute 78,085.00 B/F + 68,855.40
  CURRENT - 146,940.40 PAYMENT = zero. They explain why the printed B/F and PAYMENT controls
  exceed the listed-row sums. The printed CURRENT control remains a proven legacy defect:
  316,376.89 vs the complete legacy-semantic 447,122.50. No ERP-only nonzero close exists.
- **Aging boundaries are pinned:** May = current, Apr = 1 month, Mar = 2 months, and opening +
  Jan/Feb = 3 months+. A signed 1-Jan debtor anchor plus monthly debtor-ledger FIFO simulation
  reproduces **all four aging buckets for all 150 customers exactly**: S/CN enter their document
  month; payments normalize carried credits, consume positive balances oldest-first, and leave
  any excess in the payment month.
- The current ERP invoice-linked aging matches 139/150 rows. Its 11 named differences are an
  **allocation-model gap**, not a boundary or balance error: ERP honors explicit payment/invoice
  and CN/original-invoice links, then forces the ledger bridge into 3 months+; legacy uses the
  signed-ledger FIFO rule above. Scan minus ERP totals are current -1,088.85 · 1m +158.75 ·
  2m +1,032.41 · 3m+ -102.31 = zero, hard-pinned by fingerprint
  `4514569fc2c30814ef505e0737e26fc1c02cbf22a057110f5b8013ea6f0d9817`.
- Connected-path audit for V3: current aging uses today's active/cancelled state for historical
  reports, ignores paired Refund Notes, includes unjournaled invoices, drops non-positive invoice
  outstanding before bridging, and puts the entire bridge in 3m+. That last behavior contradicts
  the old "no buckets fabricated from scalar anchors" note in
  [INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md); reconcile the
  documentation and intended policy when the user-facing parity work is designed, not in this
  read-only verification step.
- The PDF's bonus three-creditor page remains informational/file-arithmetic evidence only;
  supplier/AP comparison is outside debtor Step 3. **Every Step 3 difference is named; the
  `tdl` stage is green.** V3 must close the five column-presentation differences, 41-row body
  filtering difference, and 11-row current-aging allocation gap if the user-facing printout is
  to reproduce the legacy report 1:1.

**Verification rerun:** `node dev/import/legacy-report-fixtures/validate-fixtures.mjs` passed all
nine source hashes, ten fixture hashes and arithmetic/cross-report controls; the default
`node dev/import/legacy-report-fixtures/verify-legacy-reports.mjs` run passed `map`, `tb` and
`tdl` together (`ALL STAGES GREEN`). No build, lint or type-check command was run.

### V1 step 4 execution record — BS / IS / CoGM statements, completed 20 Jul 2026

**Files changed:** `verify-legacy-reports.mjs` (stage `statements` added; the default
no-argument run now executes `map`, `tb`, `tdl` and `statements` together) and this plan.
Output `generated/statements-comparison.json` (gitignored) holds all 40 line comparisons with
attributions, the named fs_note move set, the whole-chart APPX audit and the V2 design
projection figures.

The stage reproduces the three engines query-for-query (BS: anchored balances grouped by
effective fs_note + the synthetic movement-only Current Year Profit row; IS/CoGM: posted
journal movement only) and compares each printed note line. **Result: 40 compared lines —
20 exact, 20 attributed, zero unexplained.** Every difference lands in exactly the three
allowed categories:

- **(a) The CS/OS opening set (stage-2 residue).** The ERP BS inventory notes carry exactly
  the superseded CS anchors (14-1 −408,919.39 · 14-2 −420,006.23 · 14-3 −679.60 =
  −829,605.22, anchor-only, no posted movement, no other contributor), and the ERP renders
  0.00 for opening-inventory notes 3-1/3-3/3-7 because the IS/CoGM engines read journal
  movement only — the §8-2 engine consequence is now empirically confirmed, not inferred.
- **(b) Report-level stock injection — ST-b settled.** Every printed statement line is backed
  by printed TB rows (per-APPX sums recompute to the cent, incl. the misprint-prone CA DPO
  row) **except the six closing-inventory lines** (BS 14-1/14-2/14-3, IS 14-1, CoGM
  14-2/14-3). Legacy injects month-end closing stock at report level from its stock module;
  the printed TB itself records no stock movement at all.
- **(c) Named fs_note mapping differences — NEW finding, fingerprint-pinned**
  (`c83f4ef40c85ea3716fdecdace37dbfffbc53f51d23d8b2da02fc006fd8d2088`). 31 nonzero accounts
  are classified under a different note by the printed TB APPX than by the ERP fs_note:
  `CL_ABB` 182,600.38 DR (printed 11 TERM LOANS, ERP 10), `CL_AFI` −25,696.82 (printed 8 —
  the legacy BS shows note 22 as GROSS trade debtors, 507,697.72, and buries the impairment
  allowance in note 8; ERP nets it in 22), `CL_GF` 31,696.82 / `CL_GT` 12,415.60 debit
  balances (printed 8 — settles the §9 open classification question), `OC_CMK` 10,200.00 /
  `OC_MIL` −33,638.54 (printed 1 ACCRUALS), and a 25-account payroll family whose 5 ↔ 5-1
  moves net to exactly **310,329.96** (scan IS note 5 = 675,380.45 vs ERP 985,710.41; scan
  CoGM 5-1 = 763,126.23 vs ERP 452,796.27). With these named moves applied, notes 22, 8, 1,
  10, 11, 5 and 5-1 all close to the cent. The account balances themselves are identical —
  only the note classification differs.

Hard-gated identities, all green: scan profit 284,825.01 − ERP 203,616.31 = **+81,208.70 =
closings 708,083.85 − openings 626,875.15** exactly; CoGM difference 333,707.66 = 23,377.70
(its openings − closings) + 310,329.96 (the salary moves) exactly; the ERP May BS is out of
balance by **exactly the named residue** (assets short 1,456,480.37); every nonzero 31-May
balance reaches the statements through an active BS/IS/CoGM note (no leaks); revenue
3,334,649.33, PPE, debtors, cash, director, taxation, share capital, retained profit B/F etc.
are exact. Notes 3-1/3-3/3-7 (report_section `cogm`) and 14-1/14-2/14-3 (`balance_sheet`)
all exist and are active; legacy prints the 3-1 opening on the IS while ERP's note 3-1 is
cogm-section — presentation only, since the ERP IS folds cogm notes into its COGS bucket.

Also recorded: 216 of the 880 mapped accounts print an APPX differing from the ERP effective
fs_note — the 31 named moves above, 94 splits **within** the stock family (47 anchored CS
accounts, e.g. ERP 14-1 vs printed 14-3, and their 47 OS mirror accounts, e.g. ERP 3-1 vs
printed 3-7), and 91 zero-balance cosmetic cases. The stock-family splits are invisible in
today's statements but matter for V2: per-account OS anchors would render under the wrong
3-1/3-3/3-7 note unless the fs_notes are aligned to the printed APPX first.

**V2 design consequences (projection figures in `statements-comparison.json`):** inserting
the OS anchors and zeroing the CS anchors alone makes the TB residue 0 for every month, but
the BS stays unbalanced by −626,875.15 because anchors on P&L-type notes never reach the
engines; with the §8-2 engine change (render anchor-backed opening notes into IS/CoGM and the
BS Current Year Profit) the BS balances at 5,389,607.26; reaching the legacy May target
6,097,691.11 additionally requires the V3-1 closing-stock injection (708,083.85 on both
sides). The fs_note corrections (31 named + 94 stock-family) are part of the V2 sign-off
package.

**Verification rerun:** `node dev/import/legacy-report-fixtures/validate-fixtures.mjs` passed
(all nine source + ten fixture hashes and every arithmetic gate), and the default
`node dev/import/legacy-report-fixtures/verify-legacy-reports.mjs` run passed `map`, `tb`,
`tdl` and `statements` together (36 ok gates, `ALL STAGES GREEN`). No build, lint or
type-check command was run.

### V1 step 5 execution record — consolidation and V2 sign-off, completed 20 Jul 2026

**Files changed:** tracked
[LEGACY_REPORT_RECONCILIATION.md](LEGACY_REPORT_RECONCILIATION.md) (the durable findings and
sign-off document) and this plan. No database, report-engine, production, or user-facing state
was changed.

- The reconciliation copies every sign-off-critical row out of the private generated JSON: all
  **125 anchor corrections** with amount and May scan page/row, all **94 overlapping stock
  `fs_note` moves**, and all **31 non-stock `fs_note` moves** with evidence. Their union is 156
  accounts. The mapping set remains fingerprint-pinned at
  `c83f4ef40c85ea3716fdecdace37dbfffbc53f51d23d8b2da02fc006fd8d2088`.
- The exact package is now pinned: set 63 existing CS anchors (CR 829,605.22) to zero, insert 62
  OS anchors (DR 626,875.15), apply the 31 + 94 printed APPX targets, route note 3-1 to the Income
  Statement rather than CoGM, and teach only the opening-stock report semantics to read anchors.
  The projected January population is 642 anchors, DR = CR 13,180,681.18.
- A read-only dev check confirms zero overlap between the 125 stock accounts and the 1,571
  2026-06-01 checkpoint anchors. The January corrections therefore remain effective through June
  without mutating or invalidating any existing June checkpoint.
- A generic "include every 3-* anchor in CoGM" design was rejected: finished-goods opening note
  3-1 prints on the IS, while the legacy CoGM contains only raw-material and packing openings
  3-3/3-7. The sign-off package uses the note metadata to keep that boundary explicit.
- The phase boundary is now stated honestly: V2 removes the TB residue and makes the BS API
  difference 0.00 at a legacy-format May total of **5,389,607.26**. The final printed
  **6,097,691.11** additionally needs 708,083.85 of monthly closing stock, whose architecture
  remains V3 unless the user explicitly expands V2.
- The standing commands are documented in the reconciliation. On this final V1 run,
  `validate-fixtures.mjs` passed all hashes/arithmetic gates and
  `verify-legacy-reports.mjs` passed all four stages / 36 gates (`ALL STAGES GREEN`). The current
  harness intentionally pins the pre-V2 state and must move to final-state expectations during
  an approved V2 without weakening the old evidence.

**V1 is complete.** The exact V2 development package is presented for approval in the
reconciliation; production remains a later, separate approval after development proof.

## 6. Phase V2 — close the opening gap (✅ development complete 20 Jul 2026)

The package in [LEGACY_REPORT_RECONCILIATION.md](LEGACY_REPORT_RECONCILIATION.md) was explicitly
approved for development and implemented at the exact boundary below. Production was not changed.
The evidence and settled §8 choices pin the delivered shape:

- Update the 63 existing 01-01 CS anchors to explicit zero fences and insert the 62 printed 01-01
  OS anchors. Apply the 31 non-stock + 94 stock effective-`fs_note` targets, plus the guarded
  note-3-1 report-section correction. No account code or journal is created; `IMP` stays
  immutable. Abort if any correction account has acquired a 2026-06-01 anchor.
- **The anchor decision is settled:** opening inventories use `account_opening_balances`, not a
  synthetic 01-01 journal. For report year `YYYY`, add only the exact `YYYY-01-01` opening-stock
  anchor once to the existing posted YTD movement through the selected period end; later anchors
  do not replace a fiscal-year opening. The IS and BS Current Year Profit include 3-1/3-3/3-7;
  CoGM includes 3-3/3-7 only. Do not generically include every P&L anchor.
- Delivery discipline exactly as the import: `dev/migrations/2026-MM-DD_*.sql`, precondition
  checks on the current anchor/journal population, exact expected counts/amounts, idempotent
  no-op rerun, rehearsal on a fresh restore, validated rollback backup for prod, PM2 window.
- ⚠ **The old acceptance scripts pin the current anchor set.** `verify-import.sql` /
  `insert-opening-anchors.sql` expect 580 anchors and the RM1,456,480.37 residue; after V2 they
  will (correctly) no longer pass as written. Follow the presentation-migration precedent: the V2
  migration itself becomes the new final verifier, and the old scripts are documented as
  pre-V2-state only. Never weaken the old scripts in place.
- Transition and re-run the harness after mutation: 880/880 TB accounts exact, all offsets zero,
  the residue gone Jan–Jun, DEBTOR/TDL proofs unchanged, all 125 actionable APPX mismatches gone,
  BS API difference 0.00, and 30/40 statement lines exact. The remaining ten are only the six
  V3 closing-stock lines and their profit/CoGM cross-totals. Re-run the frozen June five-ledger
  recon (movement must be unchanged), name the legitimate June TB/BS level changes, and re-prove
  all 1,571 June checkpoint equalities.
- Update docs ([ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md),
  [LEGACY_JAN_MAY_IMPORT_PLAN.md](LEGACY_JAN_MAY_IMPORT_PLAN.md) §3/§8-1) and add a changelog
  entry (user-visible: Balance Sheet now balances / opening stock loaded).

### V2 development execution record — completed 20 Jul 2026

- Added guarded migration
  [`2026-07-20_legacy_report_v2_opening_stock.sql`](../../dev/migrations/2026-07-20_legacy_report_v2_opening_stock.sql).
  Its literal target tables fingerprint the exact 125 anchors and 125 direct mapping changes; the
  union is 156 accounts. It accepts only the wholly audited fresh state or the wholly audited final
  state, snapshots every staging/IMP row, locks the affected tables, and aborts on any mixed state,
  June overlap, account/note drift, journal drift, or checkpoint mismatch.
- Rehearsed on isolated development clone `tienhock_v2_rehearsal_20260720`. The fresh pass reported
  exactly 63 CS updates, 62 OS inserts, 125 `fs_note` updates and one note-3-1 update. The immediate
  final-state rerun reported **0 / 0 / 0 / 0** writes. The identical two-pass sequence then succeeded
  on database `tienhock`; production was not accessed or modified.
- Final January state is 642 anchors: 290 nonzero, 352 zero, 230 debit and 60 credit rows, with
  DR = CR **RM13,180,681.18**. All 63 target `CS_*` anchors are explicit zero, all 62 `OS_*`
  anchors equal the scan values totalling **RM626,875.15**, and none of the 125 codes has a
  2026-06-01 checkpoint.
- [financial-reports.js](../../src/routes/accounting/financial-reports.js) now adds exact fiscal-year
  opening stock once: IS and BS Current Year Profit use 3-1/3-3/3-7; CoGM uses 3-3/3-7. A direct
  invocation of the actual May route handlers returned revenue RM3,334,649.33, COGS
  RM3,082,527.72, expenses RM675,380.45, profit **-RM423,258.84**, CoGM
  **RM2,998,134.52**, and a BS difference below one billionth of a ringgit (floating-point display;
  accounting-cents difference RM0.00).
- `validate-fixtures.mjs` ended `ALL CHECKS PASSED`. The transitioned
  `verify-legacy-reports.mjs` ended `ALL STAGES GREEN`: TB **880/880 exact** with all five monthly
  offsets zero; TDL 150/150 exact; all 156 approved effective mappings exact; statements **30/40
  exact**, with precisely the six V3 closing-stock lines and four related cross-totals remaining;
  May legacy-format net assets and financed by both **RM5,389,607.26**.
- Immutable/regression proof remains exact: staging 12,635 rows; `IMP` 3,863 headers / 10,068 lines
  / DR = CR RM13,503,516.15; all 1,571 June checkpoint equalities; June derived TB balanced; the
  frozen five-ledger movement remains 1,030 lines. The standing portable fingerprints are IMP
  `9c0d5c6b141af5d102f5a31c590f6f82`, June anchors
  `147c022cef7b4a4c90735718860a60eb`, and June five-ledger movement
  `c27dbd5a5db93bf08823ae4e0f22cad4`.
- The legitimate June level change is now explicit: the unchanged journals plus corrected opening
  stock move the derived TB from the pre-V2 DR RM16,752,953.37 / CR RM18,209,433.74 to **DR = CR
  RM17,379,828.52**. After the approved note reclassifications, June BS assets and
  liabilities-plus-equity are both **RM8,368,289.50**; legacy-format net assets/financed by are
  **RM5,353,125.52**, with Current Year Profit **-RM459,740.58**. This is a level/classification
  change only: June journal movement and all five reconciled ledgers are unchanged.
- The old `verify-import.sql` and `insert-opening-anchors.sql` remain untouched and intentionally
  describe the pre-V2 580-anchor/residue state. No build, lint or type-check command was run.

**V2 is complete on development.** The remaining RM708,083.85 May closing stock, the exact ten
statement differences, and the debtor presentation/aging items remain V3. A production rollout must
start with a fresh read-only inventory and separate approval; do not weaken the development guards
to force a drifted production state through.

### V2 production-rollout rehearsal execution record — 20 Jul 2026 (on a fresh production copy)

**Files changed:** tracked
[`2026-07-20_legacy_report_v2_opening_stock_prod.sql`](../../dev/migrations/2026-07-20_legacy_report_v2_opening_stock_prod.sql)
(production-rollout variant) and this plan. The development-pinned migration is untouched.

- The development database was replaced with a fresh production restore; the development-pinned
  migration correctly refused it (`Chart of accounts differs from the exact V2 structure`). A full
  read-only inventory (every guard domain, rolled back) proved the production state identical to
  the audited development state **except four named chart facts**:
  - `SUJAYU` / `NG-SC` — new DEBTOR child accounts from live production use (17/18 Jul 2026);
    no Jan–Jun activity;
  - `LGP` — "Local General Purchases" root account created manually in production 20 Jul 2026;
  - `OP` (Overseas Purchases) — fs_note NULL: the account is deprecated (user-confirmed 20 Jul
    2026); the audited development state had `OP` → note `5`.
  - Everything else verified fingerprint-identical: the 2,821-account structure fingerprint after
    excluding the three additions; the full mapping fingerprint after restoring `OP` → `5`; all 156
    targets; the 580-row January anchor population and provenance; notes metadata; staging; IMP
    journals; June anchors, all 1,571 checkpoint equalities and the June five-ledger movement.
- The prod variant carries the byte-identical approved package (63 CS zero fences / 62 OS anchors /
  125 fs_note changes / note 3-1 reroute); only the four whole-chart guard constants are re-pinned
  (2,824 accounts, structure `47b88863017669feb7dd3356eba3e051`, fresh mapping
  `4b0fcae87ac56abeb20146e484a8add0`, final mapping `4d05a7a82a5080872a8dd6493734d98a`).
- Rehearsed on clone `tienhock_v2_prod_rehearsal_20260720` (fresh pass 63/62/125/1, rerun
  0/0/0/0), then applied to `tienhock` with the identical two-pass result.
- `validate-fixtures.mjs` passed all hashes/arithmetic gates. `verify-legacy-reports.mjs`: `map`,
  `tdl` and `regressions` stages fully green; `tb` and `statements` stages show six failures that
  decompose into exactly **two named post-audit production facts**:
  1. **`GP-202604-0001`** (journal 11829) — self-billed foreign purchase from SHANDONG STANDARD
     METAL PRODUCTS CO.,LTD, e-invoice `SB2026070025`, DR `OP` / CR `TP` **RM7,261.51**, entry_date
     2026-04-30, **created in production 20 Jul 2026** — a genuine April supplier invoice keyed
     after the scans and after the development audit. It alone makes TB `OP`/`TP` non-exact at
     Apr–May (±7,261.51) and BS note 13 print 89,972.54 vs the scanned 82,711.03.
  2. **OP deprecation** (fs_note NULL) — with a nonzero OP balance (at May, entirely from
     `GP-202604-0001`), OP is invisible to the statement engines: May BS imbalance −7,261.51 and
     net assets 5,382,345.75 vs the pinned 5,389,607.26. OP is still the live posting account for
     foreign GP journals (24 journals in June, 31 in July), so the imbalance grows monthly until
     the balance is reclassed and the posting account changes.
- **Open decisions (user):** confirm `GP-202604-0001` is a genuine late April invoice rather than a
  keying error (if corrected to a current date, all six failures disappear and the harness is green
  as-is, since a zero-balance unmapped OP breaks nothing); decide the OP end-state (reclass the
  balance to `LGP`/another purchase account with a current-dated journal, give `LGP` an fs_note,
  stop posting to OP); then re-pin the harness expectations with these named deviations for the
  production track.
- A future real production rollout must re-run this read-only inventory: production keeps drifting
  (today's activity proved it within hours), and the variant's chart pins reflect 20 Jul 2026 only.

### GP purchase-account handover execution record — 20 Jul 2026 (OP → LGP)

**Files changed:** tracked
[`2026-07-20_gp_op_to_lgp.sql`](../../dev/migrations/2026-07-20_gp_op_to_lgp.sql),
`dev/import/legacy-report-fixtures/verify-legacy-reports.mjs` (named-deviation re-pin) and this
plan.

- **Decision inputs:** `GP-202604-0001` / `SB2026070025` was user-confirmed as a genuine April
  invoice keyed late — it stays April-dated. The OP end-state: OP is deprecated (user-confirmed);
  its 63 self-billed foreign-purchase invoices (all machine spare-parts / general-stock purchases:
  bearings, pulleys, motors, seals, conveyor belting, GI mesh, packaging stickers) were repointed
  to `LGP` as the interim successor account. **The account naming (`LGP` = "Local General
  Purchases" for what are entirely *foreign* purchases) and the final purchase-account structure
  remain subject to end-user confirmation** — the developer flagged this explicitly; a later rename
  is description-only and fingerprint-safe. **⚠ UPDATE (21 Jul 2026, user decision — §8-7):** the
  end-user has since confirmed that foreign purchases are **not** to be linked to any
  financial-statement note (neither `OP` nor `LGP` gets an `fs_note`); their real accounting is done
  via the user's separate manual purchase journals. The interim `LGP → 5` mapping recorded above is
  therefore **superseded** — `LGP.fs_note` is reset to NULL. Implemented on dev 21 Jul 2026 (migration
  `2026-07-21_foreign_gp_unlink.sql` unmapped `LGP`/`OP` and cancelled the 56 unpaid foreign `GP`
  journals; code stops auto-posting foreign `GP`). The `verify-legacy-reports.mjs` re-pin and the
  production rollout (incl. dropping/revising this OP→LGP prod migration) remain follow-ups; see
  §8-7.
- The guarded migration (advisory-locked, fresh/final two-state, exact expected counts): mapped
  `LGP` → fs_note `5` (mirrors the audited OP classification; the only general Income Statement
  expense note — a CoGM purchase note would distort the pinned CoGM), repointed all 63 invoice
  headers, 23 invoice lines and all 63 GP journal lines (56 posted RM28,632.92 + 7 cancelled
  RM1,322.92) from OP to LGP, and marked OP deprecated in its description. Amounts, dates,
  references and particulars are unchanged. Rehearsed on `tienhock_v2_prod_rehearsal_20260720`,
  then applied to `tienhock`; the immediate rerun verified the final state with **0 writes**.
  OP is left with zero movement, no anchors and no fs_note — an empty shell outside every report
  population.
- **Harness re-pin (named deviation, evidence-backed):** every remaining scan-vs-ERP difference is
  exactly ±RM7,261.51 from `GP-202604-0001`, user-confirmed genuine, keyed after the May scans were
  exported — the scans can never contain it. `verify-legacy-reports.mjs` now pins it by name:
  TB `LGP`/`TP` Apr–May diff profiles, IS note 5 and BS note 13 drift lines, and the shifted engine
  totals (expenses 682,641.96 · profit **-430,520.35** · net assets/financed-by **5,382,345.75** =
  5,389,607.26 − 7,261.51 · profit identity 715,345.36 = closings 708,083.85 + 7,261.51).
- Final verification 20 Jul 2026: `validate-fixtures.mjs` ALL CHECKS PASSED;
  `verify-legacy-reports.mjs` **ALL STAGES GREEN** — TB 880/880 exact + 2 named drift rows; TDL
  150/150 exact; statements 28/40 exact + 2 named drift lines + the exact ten V3-only lines; the
  May BS balances; every nonzero 31-May balance reaches an active note; all immutable/regression
  gates unchanged (staging, IMP, 1,571 June checkpoints, five-ledger movement). No build, lint or
  type-check command was run.
- **Production note:** the same OP→LGP correction must run on real production (or be redone there
  per the end-users' final account decision) — this dev database is a 20 Jul production copy and
  the live system has continued keying foreign purchases against OP since.

### Variant re-pin execution record — 21 Jul 2026 (rollout order OP→LGP, then V2)

**Files changed:** tracked
[`2026-07-20_legacy_report_v2_opening_stock_prod.sql`](../../dev/migrations/2026-07-20_legacy_report_v2_opening_stock_prod.sql)
(guard constants + header only) and this plan. The development-pinned migration remains untouched.

- The development database was again replaced with a fresh 21 Jul production copy and
  `2026-07-20_gp_op_to_lgp.sql` was run **first** (succeeded with its exact expected counts: 63
  invoices / 56 posted / 7 cancelled / RM28,632.92 / RM1,322.92 / 23 lines). The V2 prod variant
  then refused the database (`V2 preflight requires one exact wholly fresh or wholly final state`):
  OP→LGP sets `LGP.fs_note = '5'`, but the variant's 20 Jul pins had LGP at NULL.
- Read-only re-inventory proved the **only** drift versus the 20 Jul pins is that one
  `LGP.fs_note` value: the 2,824-account structure fingerprint `47b88863017669feb7dd3356eba3e051`
  passed unchanged, and only `LGP`/`OP` carried post-20-Jul `updated_at` stamps. The variant's
  two full-mapping guard constants were re-pinned to the post-OP→LGP states (fresh
  `6bafd6262089d7b217ab4ab2b5b1e4b4`, final `bd034913a5df1c2b9f54e7937cc9b87b` — the final value
  re-computed by rolled-back simulation of the 125 fs_note changes). **Rollout order is now fixed:
  OP→LGP first, then V2.**
- Rehearsed on clone `tienhock_v2_prod_rehearsal_20260720` (fresh pass 63/62/125/1, rerun
  0/0/0/0), then applied to `tienhock` with the identical two-pass result. All guard domains —
  including the June preflight that had not yet run on the 21 Jul copy — passed.
- Final verification 21 Jul 2026 on the V2-applied 21 Jul production copy:
  `validate-fixtures.mjs` ALL CHECKS PASSED; `verify-legacy-reports.mjs` **ALL STAGES GREEN**
  with the pinned named deviations unchanged (GP-202604-0001 ±RM7,261.51; the exact ten V3-only
  statement lines). No new drift since 20 Jul surfaced anywhere.
- A future real production rollout must still re-run the read-only inventory and re-pin if
  production has drifted again: these pins reflect the 21 Jul 2026 production copy only.

## 7. Phase V3 — standing 1:1 report capability for users

**V3 entry criteria — met 20 Jul 2026, re-confirmed 21 Jul 2026** on a fresh 21 Jul production
copy (rollout order OP→LGP then V2, per the §6 re-pin record). V2 is applied and verified on the
(production-copy) development database, and the standing gate is green: `node
dev/import/legacy-report-fixtures/validate-fixtures.mjs` and `node
dev/import/legacy-report-fixtures/verify-legacy-reports.mjs` both pass fully (see the §6 GP
handover record). The overseas-purchase account question (`LGP` naming / final fs_note /
one-account-vs-several) — **now decided 21 Jul 2026 (§8-7): foreign purchases are NOT linked to any
note (`OP`/`LGP` get no `fs_note`); the real accounting is the user's separate manual purchase
journals; implemented on dev 21 Jul (migration `2026-07-21_foreign_gp_unlink.sql` + code, §8-7),
harness re-pin + production pending** — is **explicitly non-blocking for V3**: it lives entirely inside the named
`GP-202604-0001` deviation (notes 5/13, accounts LGP/TP) and is orthogonal to the closing-stock
notes (14-*/3-*) and debtor-parity work below. A later rename is description-only; a later
account/note move is a mechanical re-pin of the same ±7,261.51 named drift. (Exception to note:
if the final decision routes any of these purchases to a *CoGM* note, the CoGM identity gates move
too — same arithmetic, one more named shift.)

What "the user can create those 1:1 data" still needs after V2 (enumerate precisely from V1's
findings; expected items):

1. **Monthly closing-stock mechanism** — the BS inventories (14-*) and IS/CoGM closing-inventory
   lines change monthly; legacy sources them from its stock module (per §2/ST-b evidence). The ERP
   equivalent: either a structured monthly stock-valuation journal (user keys/confirms month-end
   values; ties to the existing Material Stock / `material_stock_entries` +
   `material_stock_kilang_entries` figures) or report-level injection from those tables. This is
   gap item #4 in [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md) §4 — design it against the
   scanned figures as acceptance targets (May: 188,979.60 / 336,909.82 / 182,194.43).
2. **Debtor list parity** — Step 3 proved the balances and exact legacy rules. Make the
   user-facing print path (a) classify CNs and the GUI contra like the legacy CURRENT/PAYMENT
   columns, (b) omit zero-close body rows while keeping the intended aggregate population clear,
   and (c) offer/reproduce the signed-ledger monthly FIFO aging model rather than the current
   explicit-invoice-allocation + forced-oldest-bridge model. Acceptance target: all 150 May rows
   and all four buckets equal `tdl-comparison.json`; the five/11-row fingerprints disappear.
3. Keep the transitioned V1/V2 harness as a regression gate (documented run command, like the
   import's verification suite).

### V3 execution record — completed 21 Jul 2026 (development)

**Files changed:** migration
[`2026-07-21_closing_stock_values.sql`](../../dev/migrations/2026-07-21_closing_stock_values.sql)
(new `closing_stock_values` table + guarded May seed);
[`financial-reports.js`](../../src/routes/accounting/financial-reports.js) (exact-month
`getClosingStockValues`, GET/PUT `/api/financial-reports/closing-stock/:year/:month`, and the
three engine injections); [`materials.js`](../../src/routes/accounting/materials.js)
(`/api/materials/closing-stock-reference`); [`debtors.js`](../../src/routes/accounting/debtors.js)
(legacy CURRENT/PAYMENT semantics, zero-close body filter, `computeLegacyFifoAging` replacing the
invoice-allocation + forced-oldest-bridge model);
[`StockAdjustmentEntryPage.tsx`](../../src/pages/Stock/Materials/StockAdjustmentEntryPage.tsx)
("Closing Stock (Financial Statements)" card) and
[`ReportSourceGuide.tsx`](../../src/components/Accounting/ReportSourceGuide.tsx) (caveat texts);
the verification harness `verify-legacy-reports.mjs` (tdl + statements stage transitions).

- **Item 1 — monthly closing stock:** exact-month values are keyed in `closing_stock_values`
  (UNIQUE year/month/fs_note; fs_note CHECK 14-1/14-2/14-3) via the Material Stock page card;
  each field's "Page total" chip references the page's own stock accumulation as a suggestion.
  The engines inject the keyed values at report level only — the GL 14-* notes stay zero (the 63
  explicit-zero CS anchors are untouched and still gated): BS 14-* assets plus Current Year
  Profit, IS all three as negative cogs, CoGM 14-2/14-3 as negative raw/packing materials. May
  2026 is seeded from the scans (188,979.60 / 336,909.82 / 182,194.43); months with no keyed row
  show no injection (April verified zero).
- **Item 2 — debtor parity:** the general statement now computes the legacy columns directly
  (CURRENT = S/DN/RN debits − CN credits; PAYMENT = S+REC credits − REC debits, via
  `COALESCE(legacy_entry_type, entry_type)`), totals over the full 191-child population, and
  prints only non-zero-close body rows (the 41 zero-close rows drop out, exactly like the scan).
  `computeLegacyFifoAging` (signed 1-Jan anchor + monthly document buckets consumed FIFO, a
  negative-payment month folded into current) drives both the list and the per-customer statement
  aging box. The five column-presentation rows and the 11 aging rows named in §5 step 3 all
  disappear, as designed.
- **Verified figures (May 2026, 21 Jul production copy):** BS balances at RM8,980,756.68 both
  sides; net assets = financed-by = RM6,090,429.60 = scan RM6,097,691.11 − the named drift. IS
  net profit RM277,563.50 = scan RM284,825.01 − drift; cogs RM2,374,443.87; CoGM RM2,479,030.27
  (exact). Trade Debtor list: 150 body rows; bal b/f 578,661.95 / current 447,122.50 / payment
  518,086.73 / total due 507,697.72; full-population FIFO aging 316,376.89 / 124,740.50 /
  24,055.71 / 42,524.62, reconciling to total due exactly (the printed scan current-aging total
  omits zero-close rows' buckets and stays informational).
- **Item 3 — harness:** the tdl stage now hard-fails on any column/aging difference and pins the
  full-population FIFO totals; the statements stage reproduces the injection, gates
  `closing_stock_values` 2026-05 = the scanned figures, and expects 36/40 compared lines exact +
  4 named post-scan GP-drift lines (BS note 13, IS note 5, and both profit cross-totals) — the
  only scan differences left anywhere. Final run 21 Jul 2026: `validate-fixtures.mjs` ALL CHECKS
  PASSED; `verify-legacy-reports.mjs` ALL STAGES GREEN.

### V4 execution record — completed 21 Jul 2026 (development closeout)

**Files changed:** tracked `dev/import/legacy-report-fixtures/README.md` (permanent-retention
rule + gate runbook); docs refresh across
[ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md),
[LEGACY_JAN_MAY_IMPORT_PLAN.md](LEGACY_JAN_MAY_IMPORT_PLAN.md),
[LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md](LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md),
[INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md),
[ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md),
[LEGACY_SYSTEM_REFERENCE.md](LEGACY_SYSTEM_REFERENCE.md) and
[FINANCIAL_STATEMENTS_MAPPING.md](FINANCIAL_STATEMENTS_MAPPING.md); and this plan. No database,
report-engine, production, or user-facing state was changed.

- **Prod parity re-run:** on the 21 Jul 2026 production-copy development database (OP→LGP + V2 +
  V3 applied), `validate-fixtures.mjs` passed all nine source hashes, ten fixture hashes and
  every arithmetic/cross-report gate; `verify-legacy-reports.mjs` passed all stages — TB
  880/880 exact + 2 named GP-drift rows; TDL 150/150 exact including FIFO aging; statements
  36/40 exact + 4 named `GP-202604-0001` drift lines; May BS RM8,980,756.68 / net assets
  RM6,090,429.60; all immutable/regression gates unchanged (staging, IMP
  `9c0d5c6b141af5d102f5a31c590f6f82`, 1,571 June checkpoints
  `147c022cef7b4a4c90735718860a60eb`, five-ledger movement
  `c27dbd5a5db93bf08823ae4e0f22cad4`).
- **Docs refresh:** the scan-settled classifications (`BTRA`/`MBTRA` → APPX 5; `NT_7484` →
  APPX 5, zero balance; `THJ_CK`/`THJ_SM`/`THJ_E`/`THJ_L`/`THJ_SC` → APPX 5-1; `CL_GT` DR
  12,415.60 / `CL_GF` DR 31,696.82 → APPX 8) are harvested into the TB code analysis (new 21 Jul
  addendum), the legacy system reference (Q1–4 resolved) and the gap analysis (Q1–4 settled plus
  the V2/V3 engine closings). The import plan records the Report V3 phase row and the post-V2
  verifier status; the invoice/payment progress doc gains §5l (V2/V3 postscripts, the post-V2
  June levels, the aging-model supersession); the mapping guide's closing-stock gap row now
  records the V3 mechanism. Changelog entries for V2 (20 Jul) and V3 (21 Jul) were already
  present in `CHANGELOG_ENTRIES`; no new entry was needed for this docs-only phase.
- **Permanent retention:** the nine scans, ten fixtures, rendered pages and generated reports
  under `dev/import/legacy-report-fixtures/` (`data/` + `generated/`, both gitignored — private
  customer data) are permanent audit evidence and the only independent proof of the Jan–May
  books; they must never be deleted or committed. The tracked manifest, harness and README pin
  and document them.
- **Remaining boundary:** the production rollout itself (fresh read-only inventory → OP→LGP →
  V2 prod variant → V3 migration, re-pinning if production has drifted) still requires separate
  approval and a PM2 window (§6). Nothing in V4 touches production.

### V4 production-rollout readiness rehearsal — 21 Jul 2026 (fresh production copy)

**Files changed:** `verify-legacy-reports.mjs` (read-only `VERIFY_DB` override for clone
rehearsals; default `tienhock` unchanged) and this plan. The development database was replaced
with a fresh 21 Jul 2026 production import for this rehearsal and was left byte-untouched.

- Fresh-copy inventory: 2,824 accounts; **zero** account/anchor changes after 21 Jul; OP
  population exactly the pinned 63 invoices / 56 posted + 7 cancelled GP lines / 23 invoice
  lines / RM28,632.92 + RM1,322.92; 580 January anchors with the 63 `CS_*` CR anchors intact;
  no `closing_stock_values`; OP→LGP/V2/V3 all absent. **No drift against the 21 Jul pins
  anywhere.**
- Rehearsed on clone `tienhock_prod_rehearsal_20260721` in rollout order:
  `2026-07-20_gp_op_to_lgp.sql` fresh pass (1/1/63/23/63) then final rerun (0 writes);
  `2026-07-20_legacy_report_v2_opening_stock_prod.sql` fresh pass (63/62/125/1) then final
  rerun (0/0/0/0); `2026-07-21_closing_stock_values.sql` seed (3 rows, RM708,083.85) then final
  rerun (0 writes). Every guard domain passed: chart structure
  `47b88863017669feb7dd3356eba3e051`, fresh mapping `6bafd6262089d7b217ab4ab2b5b1e4b4`, final
  mapping `bd034913a5df1c2b9f54e7937cc9b87b`, 156 targets, staging, IMP, June checkpoints,
  five-ledger movement.
- End-state proof on the clone: `verify-legacy-reports.mjs` (VERIFY_DB override) **ALL STAGES
  GREEN** — TB 880/880 exact + 2 named drift rows, TDL 150/150 exact, statements 36/40 + 4
  named GP-drift lines, May BS RM8,980,756.68 / net assets RM6,090,429.60, all immutable gates
  unchanged. Clone then dropped.
- **Verdict: safe to run on production** in the rehearsed order (OP→LGP → V2 prod variant →
  V3) inside a PM2 window, with the standard validated rollback backup. Re-verify only if
  production drifts before the window (new accounts/anchors or backdated Jan–May journals would
  trip the guards loudly anyway).

### Foreign-purchase unlink execution record — 21 Jul 2026 (development)

**Decision:** §8-7 (user, 21 Jul 2026) — foreign/overseas purchases are NOT linked to any
financial-statement note; the real accounting is the user's separate manual purchase journals.
This supersedes the OP→LGP handover's interim `LGP → 5` mapping (§6).

**Files changed:** tracked
[`self-billed-invoices.js`](../../src/routes/accounting/self-billed-invoices.js) (create/update
paths gate the `GP` journal to LOCAL purchases only; a local→foreign switch cancels + detaches the
old journal), new migration
[`2026-07-21_foreign_gp_unlink.sql`](../../dev/migrations/2026-07-21_foreign_gp_unlink.sql), and
the docs ([this plan](LEGACY_REPORT_VERIFICATION_PLAN.md) §6/§7/§8-7/§9,
[ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md),
[ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md),
[FINANCIAL_STATEMENTS_MAPPING.md](FINANCIAL_STATEMENTS_MAPPING.md)).

- Migration (guarded, idempotent, atomic) applied to dev `tienhock`: unmapped `LGP` and `OP` to
  `fs_note = NULL` (1 row) and cancelled **56** posted foreign `GP` journals (all unpaid, zero
  linked supplier payments; a safety gate aborts if any foreign invoice still holds a posted `GP`
  journal, e.g. a paid one). Immediate rerun wrote 0 rows.
- Post-state verified by direct query: `OP`/`LGP` both `fs_note = NULL`; all 63 LGP `GP` lines now
  sit on cancelled journals (56 newly + 7 previously); **zero posted `OP`/`LGP` lines** and **zero
  posted foreign `TP`** remain (so no Balance Sheet imbalance); the foreign self-billed invoice
  records and their unpaid payables are intact (invoices keep the now-cancelled `journal_entry_id`
  for audit).
- **Not done here (needs the private `data/` fixtures, absent from this checkout):** re-pin
  `verify-legacy-reports.mjs`. Its current pins *expect* the `GP-202604-0001` ±RM7,261.51 named
  deviation, which this change removes, so on a re-run the May statements become **scan-exact**
  (net assets → 6,097,691.11; TB `LGP`/`TP` Apr–May exact; statements 40/40) and the June
  derived-TB pin drops by the June foreign-GP total **RM8,016.49** (July foreign-GP RM13,354.92 is
  outside the June window). Re-pin to scan-exact, don't weaken the gate.
- **Production:** unchanged. Real production still posts foreign purchases to the unmapped `OP`;
  the rollout there is the same code deploy plus an equivalent cancellation migration, and the
  planned OP→LGP production migration (assigns `LGP → 5`) is dropped/revised under this decision
  (§6/§8-7). No build, lint or type-check command was run.

## 8. User decisions / questions — ANSWERED 17 Jul 2026 (item 7 added 21 Jul 2026)

1. **Stock roll in legacy after the export?** — *User: no idea; just make the ERP 1:1 with the
   printed reports, then the question is moot.* → The printed TBs are the target state; V1 derives
   the correction empirically instead of from legacy-operator testimony.
2. **Anchor vs 01-01 journal** — *User: definitely use anchors; users should be able to set an
   anchor to correct amounts.* → Corrections use the existing Opening Balances UI/API and
   `account_opening_balances`, never a synthetic journal. The V2 package adds each exact
   `YYYY-01-01` stock-opening anchor once to posted YTD movement: IS/BS profit include
   3-1/3-3/3-7, while CoGM includes only 3-3/3-7.
3. **Scan-only account codes** — *User: do the logical, accounting-standard thing as long as it
   brings the data closer to 1:1.* → Create genuinely missing codes with correct fs_note; alias
   only provable identity matches; name every case in the reconciliation doc.
4. **Supersede `CS_*` CR anchors** — *User: yes, printed TB = truth.*
5. **Aging bucket definitions** — answered by V1 Step 3: calendar-month boundaries are May =
   current, Apr = 1m, Mar = 2m, and opening + Jan/Feb = 3m+. The legacy scan allocates signed
   debtor-ledger documents FIFO; the current ERP report instead follows explicit invoice links
   and puts its reconciliation bridge in 3m+. Both rules are now reproduced and regression-pinned.
6. **Jan–Apr statement prints** — unanswered; optional (monthly TBs give per-account coverage).
7. **Overseas/foreign purchase account classification** (the OP→LGP handover's open question;
   §6/§7/§9) — *User (21 Jul 2026): foreign purchases are NOT to be linked to any financial-statement
   note — neither `OP` nor `LGP` carries an `fs_note`.* The actual purchase/expense for these items
   is recorded separately through **manual purchase journals the user keys**, so classifying the
   auto-posted foreign `GP` journals under a note (the interim `LGP → 5`) would double-count them.
   This supersedes the OP→LGP handover's interim `LGP → 5` mapping (§6), which was applied only to
   rebalance the May BS. **Target state:** `LGP.fs_note = NULL` (matching `OP`); the foreign `GP`
   journals stay in the GL/subledger for the e-invoice + payable record but drop out of the
   IS/CoGM/BS roll-up. **IMPLEMENTED on development 21 Jul 2026** (production separate — see below).
   The resolution kept the *whole* foreign `GP` journal off the statements: (i) **code** — foreign
   self-billed invoices no longer auto-post a `GP` journal
   ([self-billed-invoices.js](../../src/routes/accounting/self-billed-invoices.js) create/update
   paths; local general purchases are unchanged); (ii) **data** — guarded idempotent migration
   [`2026-07-21_foreign_gp_unlink.sql`](../../dev/migrations/2026-07-21_foreign_gp_unlink.sql)
   unmapped `LGP` and `OP` to `fs_note = NULL` and cancelled the 56 posted foreign `GP` journals
   (all unpaid, zero linked supplier payments → both the DR `LGP` and CR `TP` legs removed, so no BS
   imbalance; invoices keep their now-cancelled `journal_entry_id` for audit). Verified on dev: zero
   posted `OP`/`LGP` lines remain, zero posted foreign `TP`, the foreign invoice records and payables
   are intact (unpaid), and the migration rerun is a no-op. **Still to do:** (a) **re-pin the standing
   `verify-legacy-reports.mjs` gate** — it currently *expects* the `GP-202604-0001` ±RM7,261.51 named
   deviation, which is now gone, so the May statements become scan-exact (net assets → 6,097,691.11)
   and the June derived-TB pin drops by the June foreign-GP total RM8,016.49; the re-pin needs the
   private fixtures under `data/` (absent from this checkout) and is therefore a follow-up; (b) the
   **production rollout** — real production still posts foreign purchases to the unmapped `OP`, so it
   needs the same code deploy plus an equivalent cancellation migration, and the planned OP→LGP
   production migration (which assigns `LGP → 5`) is now dropped/revised under this decision.

## 9. Risks & notes for the next session

- **Do not trust the printed PARTICULAR/report-date fields** (§1). Join on code; capture text for
  provenance only.
- **OCR risk is structurally bounded**: TB-a totals, TDL row arithmetic, ST-a recomputation, and
  the V1 constant-offset invariant mean an undetected mis-read requires multiple compensating
  errors. Treat every non-constant offset as "re-read the page" before "data problem".
- V0 transcription is complete and hash-pinned. Do not edit a private scan/fixture unless a hash
  or arithmetic gate first proves it is wrong; every zero row remains deliberate evidence.
- The final V1 DB-backed run passed all 36 gates. Future runs still require the
  `tienhock_dev_db` container and use read-only `docker exec … psql` queries per CLAUDE.md.
- The renderer (`dev/import/legacy-report-fixtures/render-pdf.mjs`) was smoke-tested 17 Jul
  against all nine PDFs from the repo root; page counts in §1 come from it.
- When V2 changes June-period statement *levels* via stock accounts (§6), the frozen June recon
  numbers in [INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md](INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md)
  stay valid for ledgers/movements but the June TB/BS totals cited anywhere must be re-derived —
  update docs rather than leaving stale figures.
- The scans may also settle old classification questions (`BTRA` = APPX 5, `NT_7484`, `THJ_CK`/
  `THJ_SM`, `CL_GT`/`CL_GF` debit balances) — harvest those answers into
  [LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md](LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md) during the V2
  documentation refresh.
- **The development database is now a 20 Jul 2026 production copy** with the V2 prod-variant and
  the OP→LGP handover applied; the original audited development database no longer exists. The two
  V2 migrations (`..._v2_opening_stock.sql` dev, `..._v2_opening_stock_prod.sql` prod variant) are
  historical one-time gates: their whole-chart fingerprints reflect their respective 20 Jul states
  and will legitimately fail a final-state rerun once the chart drifts further (the `LGP` fs_note
  assignment already moved the prod-variant's final pin). **The standing regression gate is the
  harness** (`validate-fixtures.mjs` + `verify-legacy-reports.mjs`), not a migration rerun.
- `GP-202604-0001` is pinned in the harness **by name**. Any further backdated Jan–May entry keyed
  in production will fail the gate loudly — that is the gate working: confirm genuineness, then
  re-pin as another named deviation; never silence it.
- **Overseas-purchase classification — IMPLEMENTED on dev 21 Jul 2026 (§8-7); harness re-pin +
  production pending:** foreign purchases are not linked to any financial-statement note (`OP` and
  `LGP` are now `fs_note = NULL`); the real accounting is the user's separate manual purchase
  journals. On dev, migration `2026-07-21_foreign_gp_unlink.sql` unmapped `LGP`/`OP` and cancelled
  the 56 posted (unpaid) foreign `GP` journals — both legs off the statements, no BS imbalance — and
  the code no longer auto-posts foreign `GP` journals. This supersedes the interim `LGP → 5` mapping
  and removes the `GP-202604-0001` drift, so the `verify-legacy-reports.mjs` pins tied to it must be
  re-pinned to scan-exact (needs the private fixtures under `data/`). On real production `OP` is
  still the live, unmapped posting account, so it needs the same code deploy plus an equivalent
  cancellation migration; the planned OP→LGP production migration (it assigns `LGP → 5`) is
  dropped/revised under this decision. Production V2 rollout itself still requires the fresh
  read-only inventory + re-pinned variant + separate approval (§6).

---

*Update this file as phases execute (per-phase "files changed" + verification results, following
the import-plan convention). Entry point remains [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md).*
