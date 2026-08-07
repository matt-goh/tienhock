# June 2026 TB / Bihun Estimated-Unit-Cost Reconciliation — Handover

**Created 5 Aug 2026. Entry point for continuing this project in a fresh session.** Parent context: [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md) §7 (read it first — this doc only covers the continuation planned on 5 Aug 2026).

## ✅ DONE 7 Aug 2026 — June estimated unit cost is closed

**Resolved.** The coworker confirmed she also updated the **estimated unit cost inside the legacy program**, so legacy and the ERP now carry the same June classification and the bottom line agrees on both sides: expenses subtotal **64,238.82**, **FINAL 14.0504**.

Production keeps the 7 Aug state — KFC 40.00 in `MBSM_K`, PAUMIN `MBRMF` 565.00 / `MBSAF` 144.00 — and the BIHUN line items stand at MBC **459.55** · MBRMF **2,567.80** · MBSAF **664.78** · Staff Messing **2,689.10**. **No data change was made**, and the repo already matches. Nothing below this section is actionable.

The 4 Aug annotated scans (MBC 479.55 · MBRMF 2,517.80 · MBSAF 714.78 · Staff Messing 2,669.10) are the pre-amendment snapshot and are superseded — treat any future sighting of them as stale.

**Next work: the P&L** — re-opened 7 Aug 2026 with the user's June MEE/BIHUN discrepancy lists. Root-cause notes are in the new section immediately below; **status: analysis complete, coworker questions sent, awaiting answers. No data or code change has been made yet.**

## June Estimated P&L discrepancies — root-cause notes (7 Aug 2026, investigation only)

**Status: investigated, NOT fixed — awaiting coworker answers (questions sent 7 Aug).** The user re-opened the June Estimated P&L after the unit-cost close and supplied the target figures for both lines. "Current (page)" = the live page values the user quoted (sales match the legacy print); "Current (dev)" = the 7 Aug dev engine output; "Target" = the legacy print / boss-corrected values in `dev/import/closing-stock-report/expected-june-2026.json` **unless overridden by the user's later confirmations (see #5/#6)**. The page derives everything from source data — every difference below is a **source-data or legacy-formula difference, not a page bug**. The engine's P&L math itself is internally consistent (verified: usage = OS+PU+RET−CS, P/L = gross−expenses, accumulative = anchor + P/L trail, final = P/L + add back).

### MEE June

| row | current (page) | current (dev) | target | delta vs page | cause |
|---|---:|---:|---:|---:|---|
| Sales | 176,035.10 | 176,028.10 | 176,035.10 | 0.00 (dev −7.00) | dev-only June sales drift, see #1 below |
| MRET (returns) | 1,517.80 | 1,517.80 | 1,519.10 | **−1.30** | sales-return source difference, see #2 |
| Opening stock | 216,152.12 | 216,152.12 | 216,152.20 | −0.08 | OS_MPMS May keying noise, see #3 |
| Purchases | 49,900.00 | 49,900.00 | 50,440.00 | −540.00 | PU_MSD legacy-only, Q11 closed decision, see #4 |
| Opening+Purchase+Returns | 267,569.92 | 267,569.92 | 268,111.30 | −541.38 | sum of MRET/OS/PU rows |
| USAGE | 88,430.44 | 88,430.44 | **87,603.28** | +827.16 | **USER-CONFIRMED 7 Aug: boss's manual figure after printout is 87,603.28; do NOT follow the printed/crossed-out 87,063.28. See #5 — this conflicts with the accum/final targets.** |
| GROSS | 87,604.66 | 87,597.66 | **88,431.82** (derived: sales − usage) | −827.16 (dev −834.16) | derived once usage = 87,603.28; the printed row (87,063.28 / struck 87,603.28) is superseded by the user's confirmation, see #5 |
| Total expenses | 119,618.02 | 119,618.02 | 119,401.41 | **+216.61** | Q10 legacy page-to-page residue, see #6 |
| PROFIT/(LOSS) | −32,013.36 | −32,020.36 | −32,338.13 (earlier target) | +324.77 (dev +317.77) | follows from gross + expenses; **superseded if 87,603.28 stands (then −30,969.59), see #5** |
| FINAL P/L | −22,354.53 | −22,361.53 | −22,679.30 (earlier target) | +324.77 (dev +317.77) | P/L + add back 9,658.83; **superseded if 87,603.28 stands (then −21,310.76), see #5** |
| ACCUMULATIVE | −198,913.67 | −198,920.67 | −199,238.44 (earlier target) | +324.77 (dev +317.77) | anchor −166,900.31 + P/L; **superseded if 87,603.28 stands (then −197,869.90), see #5** |

### BIHUN June

| row | current (page) | current (dev) | target | delta vs page | cause |
|---|---:|---:|---:|---:|---|
| Sales | 541,667.60 | 541,651.70 | 541,667.60 | 0.00 (dev −15.90) | same dev-only drift, #1 |
| BRET (returns) | 268.30 | 268.30 | 265.10 | **+3.20** | sales-return source difference, #2 |
| Opening stock | 486,311.65 | 486,311.65 | 486,311.65 | 0.00 | exact |
| Purchases | 255,491.40 | 255,491.40 | 255,491.40 | 0.00 | exact |
| Opening+Purchase+Returns | 742,071.35 | 742,071.35 | 742,068.15 | +3.20 | BRET only |
| USAGE | 327,385.49 | 327,385.49 | 327,382.29 | +3.20 | BRET only |
| GROSS | 214,282.11 | 214,266.21 | 214,285.31 | −3.20 (dev −19.10) | BRET + dev sales |
| Total expenses | 137,810.09 | 137,810.09 | 137,602.88 | **+207.21** | Q10, #6 |
| PROFIT/(LOSS) | 76,472.02 | 76,456.12 | 76,682.43 | −210.41 (dev −226.31) | follows |
| FINAL P/L | 83,134.68 | 83,118.78 | 83,345.09 | −210.41 (dev −226.31) | P/L + add back 6,662.66 |
| ACCUMULATIVE | 481,407.46 | 481,391.56 | **481,617.87?** | — | **user quoted 475,457.87 — that is the pre-JAGUNG print; anchor 404,935.44 + target P/L 76,682.43 = 481,617.87. Question sent to coworker; AWAITING, #5** |

### Root causes

1. **Dev-only June sales drift (1-MNL −1 bag/−7.00, 2-BNL −1 bag/−15.90).** Phase 3 (25 Jul) matched the print to the cent, so a June 1-MNL 1×7.00 line and a 2-BNL 1×15.90 line left the June window afterwards. **Invoice `015377` (ROSE, total 22.90, createddate 2026-07-01 11:16:33 KL) contains exactly those two lines.** Its S journal (id 2993) was created 2026-07-08 with `entry_date` 2026-07-01, and its payment (6096, ref `C015377`) was recorded 2026-08-06. The user's page still shows the print sales, so this looks like a re-date that dev picked up and prod may not have (or vice versa). Verify which database is correct and whether `015377` belongs to June (legacy print counted it) or July.
2. **MRET −1.30 / BRET +3.20.** Returns are derived (`returnproduct × price`, product type MEE/BH, same invoice filters as sales). All 57 MEE and 13 BIHUN return rows are present; there are no cancelled/consolidated/subtotal rows hiding returns. No single row explains ±1.30 / ±3.20, so this is either multiple small price/count differences or a legacy-only return row. Needs the legacy sales-return detail (or confirmation that the print's MRET/BRET are stale).
3. **OS_MPMS −0.08.** May 2026 MEE small-packing sum = 85,789.29 vs printed 85,789.37. June CS_MPMS is exact (81,885.94). Long-documented "May keying noise" — the exact row still to be identified if we want to clear it.
4. **PU_MSD −540.00.** Closed decision (Q11, 2026-07-30): no PUR journal will ever be keyed; the boss absorbs the legacy-only 540 in the Add Back. Permanent documented delta unless the user reverses that decision.
5. **Two target conflicts — status 7 Aug:**
   - **MEE 87,603.28 — RESOLVED as the target, with a knock-on conflict still open.** The user confirmed on 7 Aug that 87,603.28 is correct (the boss's **manual figure written after printout**; do NOT use the printed/crossed-out 87,063.28). Consequence the user was shown: with sales 176,035.10 and expenses 119,401.41, P/L becomes **−30,969.59**, ACCUMULATIVE **−197,869.90**, FINAL **−21,310.76** — NOT the user's earlier targets (−32,338.13 / −199,238.44 / −22,679.30, which require 87,063.28). **Decision still needed: which set is authoritative** (a BM question was drafted 7 Aug — the user may not have sent it).
   **Implementation note (MEE 87,603.28):** it cannot be derived from the printed components (O+P+R 268,111.30 − CS 179,139.48 = 88,971.82), so reproducing it on the page requires an explicit override input (like Add Back) or different confirmed components — flag to the user before coding.
   - **BIHUN ACCUMULATIVE 475,457.87 vs 481,617.87 — AWAITING.** 475,457.87 is the pre-JAGUNG print (`accumulative_struck`); anchor 404,935.44 + the user's own P/L target 76,682.43 = 481,617.87. Question sent to the coworker.
6. **Expenses +216.61 / +207.21 (Q10).** The legacy unit-cost pages' expense rows sum exactly to the current engine values (MEE 119,618.02 = salary 31,620.54 + salesman 15,518.40 + habuk 4,548.96 + expenses 63,729.82 + machine 4,200.30; BIHUN 137,810.09 = 51,184.66 + 15,518.43 + 4,548.96 + 64,238.82 + 2,319.22 — all verified against dev journals), while the legacy **P&L pages print 119,401.41 / 137,602.88**. The engine intentionally keeps `P&L EXPENSES = unit-cost sum` so the two pages stay mutually auditable. **User confirmed 7 Aug that the legacy footer is formula-driven (NOT keyed manually).** To show the footer value we need the legacy **P&L page's own formula/report definition** (pages 1–2) — this is the remaining ask, sent to the coworker.
   - **2026-08-07 — formula received and analysed:** the user supplied `dev/import/closing-stock-report/FORMULA_estimated_unit_cost.csv` + `.txt` (legacy "ESTIMATED/UNIT COST (FORMAT)" print, report date 01 MAR 2010). It covers only the unit-cost pages (INGREDIENT / SALARY / EXPENSES / SALESMAN / HABUK / MACHINE REPAIR) — there is no P&L-footer section in it. Account sets match our seeded mappings exactly. Two differences noted: (a) TRANSPORTATION shows MBTRA **50%** + MTRA/BTRA **50%** whereas our seeds use MTRA/BTRA **100%** — the June print proves 100% (BIHUN expenses_line 64,238.82 = shared pool 63,729.82 + BTRA 509.00; at 50% it would be 63,984.32), so the 2010 format print differs from the live config (or the % column is not applied to line-specific rows); (b) MEE machine-repair row 1 shows a blank % while BIHUN's shows 50.00 — Q13 + the printed amounts confirm 50% for both, so this is a scan artifact. Reproducing the formula with June movements gives the unit-cost rows (119,618.02 / 137,810.09), NOT the P&L footer (119,401.41 / 137,602.88); no subset of rows or accounts (tested up to 4) sums to the 216.61 / 207.21 gaps. **Conclusion: the unit-cost formula is already exact; the P&L EXPENSES footer needs the legacy P&L page's own report definition/config (pages 1–2).**

### Coworker questions sent 7 Aug 2026 (answers awaited — these are the next session's inputs)

1. **Legacy June sales-return detail** for MRET 1,519.10 / BRET 265.10 (which invoices/returns; screenshot/print of the return list) — to close MRET −1.30 / BRET +3.20.
2. **Invoice `015377` (ROSE, 22.90)** — June or July? It holds the exact missing June lines (1-MNL 1×7.00, 2-BNL 1×15.90). Also verify prod vs dev (user's page still shows the print sales).
3. **P&L page EXPENSES formula/settings** (MEE 119,401.41 / BIHUN 137,602.88) — user confirmed it is formula-calculated, not keyed; ask for the report definition/screenshot for pages 1–2 (not the unit-cost format). Include the 216.61 / 207.21 arithmetic and the BTRA 50%-vs-100% question.
4. **BIHUN ACCUMULATIVE** 475,457.87 vs 481,617.87 (sent with question 2/3; may need follow-up).
5. **MEE 87,603.28 vs accum/final** — BM question drafted but possibly not sent (user said they did not ask this one); the user's own direction is 87,603.28 is correct. **The contradiction with −199,238.44 / −22,679.30 is still unresolved — flag to the user next session before changing anything.**

### Resuming in a fresh session (read this first)

State: June estimated P&L re-opened by the user; root causes documented above; **no data/code changes made**; coworker answers pending. The unit-cost reconciliation (top section) is CLOSED and unrelated to the pending P&L work. Read `docs/Account/ESTIMATED_REPORT_HANDOVER.md` §1/§2/§7.3/§9.3 for engine context, and this section for the P&L deltas. Dev DB: `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"`. Evidence: `dev/import/closing-stock-report/expected-june-2026.json`, `verify-estimated-report.mjs`, `FORMULA_estimated_unit_cost.csv/.txt`.

Next session steps (once the answers arrive):
1. Collect the four/five answers and map each to a root cause (#1 sales, #2 returns, #5 targets, #6 expenses).
2. Returns: identify the exact legacy return rows/prices, then correct the ERP rows (deferred-fix protocol — key into June, never July) or document the print as stale.
3. Sales: if `015377` belongs to June, re-date it (verify prod first); if July, update the fixture/verifier targets.
4. Targets: get a definitive decision on MEE 87,603.28 vs accum/final, and BIHUN accumulative; then the P&L engine follows automatically (no hardcoding).
5. Expenses: once the P&L page formula/config arrives, decide whether to (a) add a separate P&L-expenses mapping set (unit-cost page unchanged), or (b) implement whatever the legacy config shows; only then touch `estimated-report-engine.js`.
6. Re-run `node dev/import/closing-stock-report/verify-estimated-report.mjs`, retire stale expected deltas, update `expected-june-2026.json` only with evidence, and update ESTIMATED_REPORT_HANDOVER.md Q10/Q11.
7. Changelog entry (`src/components/ChangelogModal.tsx`) once visible numbers change.

Copy-paste prompt for the next session:

```text
You are continuing the June 2026 Estimated P&L reconciliation in C:/tienhock.
Read docs/Account/JUNE_TB_BIHUN_RECON_HANDOVER.md first — specifically the
"June Estimated P&L discrepancies — root-cause notes (7 Aug 2026)" section and its
"Resuming in a fresh session" block, then docs/Account/ESTIMATED_REPORT_HANDOVER.md.
The coworker's answers to the four/five WhatsApp questions are attached below.
Apply each answer to its root cause, make the minimal data/mapping/engine changes
needed for the June MEE and BIHUN P&L to land on the confirmed targets (MRET
1,519.10 / BRET 265.10, MEE 87,603.28 decision, expenses 119,401.41 / 137,602.88,
accumulative and final per the user's final decision), without hardcoding anything.
Re-run dev/import/closing-stock-report/verify-estimated-report.mjs, update
expected-june-2026.json only where evidence supports it, update both handovers and
the changelog, and report what was changed and what remains open.
```

### What would fix it (next steps, not yet done)

- Sales: re-date `015377` into June if it belongs there (deferred-fix protocol: key the fix into the month it belongs to) or confirm July and update the fixture target.
- Returns: identify the legacy return rows/prices from the legacy sales system, then correct the ERP rows (or document as stale print).
- OS_MPMS: correct the May stock row(s) once identified.
- Expenses: replicate the legacy P&L page formula as its own mapping set (unit-cost page unchanged) once the coworker's config arrives — user confirmed it is formula-calculated, not manual.
- MEE 87,603.28: decide the override mechanism (it is not derivable from components) AND resolve the accumulative/final conflict before touching the engine.
- Page code: no change expected for items 1–4 (data-driven); only the expenses formula (#6) and the 87,603.28 override (#5) would touch the engine/page.
- After data fixes: re-run `node dev/import/closing-stock-report/verify-estimated-report.mjs`, retire the stale expected deltas, update `expected-june-2026.json` only where evidence supports it, and update ESTIMATED_REPORT_HANDOVER.md Q10/Q11.

### How it got here (context, no longer actionable)

She has stated both positions, three days apart. On 7 Aug she said KFC belongs in `MBSM_K` ("KFC cannot be in cleaning code") and PAUMIN is 565/144, and edited both the legacy program and prod accordingly. Later the same day she confirmed her 4 Aug annotated BIHUN scans (MBC 479.55 · MBRMF 2,517.80 · MBSAF 714.78 · Staff Messing 2,669.10) are right — but those four figures **are** the opposite scenario. A second person has since independently confirmed KFC belongs in `MBSM_K` (KFC only; PAUMIN was not covered).

**Do not adjudicate this with the totals.** The four deltas are −20 / +50 / −50 / +20 and net to zero, so the expenses subtotal **64,238.82**, **FINAL 14.0504** and the Trial Balance total (**17,102,880.87** folded / 17,106,536.00 raw) come out identical under both classifications. Only the original receipts settle it.

### What each answer means

| her answer | BIHUN June figures | action |
|---|---|---|
| **`MBSM_K`** + **565/144** (current prod state) | MBC 459.55 · MBRMF 2,567.80 · MBSAF 664.78 · Staff Messing 2,689.10 | **Nothing to do.** Everything in this repo already matches. Ask her to reprint the 4 Aug BIHUN sheet from legacy so the stale scan stops resurfacing. |
| **`MBC`** + **465/244** (the 4 Aug scans) | MBC 479.55 · MBRMF 2,517.80 · MBSAF 714.78 · Staff Messing 2,669.10 | Apply the reversal below, then revert the repo changes listed after it. |
| a **split** answer (e.g. KFC `MBSM_K` but PAUMIN 465/244) | mix of the two rows | Apply only the matching half. The KFC pair (MBC ↔ Staff Messing) and the PAUMIN pair (MBRMF ↔ MBSAF) are independent. |

### If this ever reopens — the reversal, kept for reference (NOT needed)

Three lines, two journals, applied identically to **dev and prod** as a guarded, idempotent, fail-closed migration (pattern: `git show 8bd5e45f:dev/migrations/2026-08-05_june_legacy_reclass.sql`; run with `psql -v ON_ERROR_STOP=1`).

| # | journal | change | line identity |
|---|---|---|---|
| 1 | `PCE004/06` (display `PV004/06`, 2026-06-10) | `MBSM_K` → `MBC`, amount 40.00 unchanged | particulars `KFC LINTAS JAYA BOULEVARD #130134-14/03/2026` |
| 2 | `PBE054/06` (2026-06-25) | `MBRMF` 565.00 → **465.00** | particulars start `PAUMIN HARDWARE S/B #2606-2133-23/06/2026 (CUTTING DISC` |
| 3 | `PBE054/06` (2026-06-25) | `MBSAF` 144.00 → **244.00** | particulars start `PAUMIN HARDWARE S/B #2606-2133-23/06/2026 (BATIK COTTON` |

- **Resolve lines by (reference_no, account_code, debit_amount, particulars), never by `jel.id`** — prod ids differ. Dev ids for reference: journal 2964 line 7696; journal 2949 lines 20956 / 20955.
- Both journals are source-less manual C/B entries (`source_type` NULL, `manual_override` false). Assert `manual_override` stays **false**.
- Journal totals must not move: `PCE004/06` **8,740.25**, `PBE054/06` **709.00**.
- June 2026 is past the 2026-06-01 open date, so `assertTienHockAccountingDateUnlocked` permits it.
- **Never re-run the two 6 Aug migrations** — still applied; they would trip their own guards.
- Expected June movements after a full reversal: MBC **959.10** · MBSM_K **3,086.49** · MBRMF **5,035.60** · MBSAF **1,429.55**. Unchanged and re-assert: BRM 1,413.74 · MBOR 1,598.80 · MBRM 1,810.95 · MBSM_O 2,251.70 · MGT 8,908.02 · MRM 3,294.82.

### Repo changes to revert alongside a full reversal

`dev/pdf-render/dump-bihun-june.mjs` (restore MBC 479.55 / MBRMF 2517.8 / MBSAF 714.78 / STAFF MESSING 2669.1 and drop the re-pin comment) · [KEYING_GUIDE.md](KEYING_GUIDE.md) and [KEYING_GUIDE_BM.md](KEYING_GUIDE_BM.md) (restore the KFC row and rule 5's 465/244 example, drop the 7 Aug note) · [JUNE_RECLASS_DESIGN.md](JUNE_RECLASS_DESIGN.md) (un-strike move #3, E10, E11 and the four gap-table rows; rewrite §e) · [../MIGRATIONS_LOG.md](../MIGRATIONS_LOG.md) · this file · [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md) §7 · [LEGACY_TIEOUT_STRATEGY.md](LEGACY_TIEOUT_STRATEGY.md) and `dev/import/legacy-tieout/README.md` (restore the 1-row June proof profile, **keep** the added caution paragraphs) · `src/components/ChangelogModal.tsx` (delete the 2026-08-07 "Pembetulan lanjut akaun Jun 2026" entry — net effect versus 6 Aug becomes zero).

### Verification either way

```bash
node dev/pdf-render/dump-bihun-june.mjs                      # all targets OK, SUBTOTAL 64238.82, FINAL 14.0504
node dev/import/closing-stock-report/verify-estimated-report.mjs   # 432 exact / 40 documented / 0 failures
node dev/import/legacy-tieout/tie-out.mjs --month 2026-06 \
  --legacy dev/import/legacy-june-tb/june-2026-legacy-tb.json
#   5 differing accounts = current state (CR_LD + the 4 post-print amendments)
#   1 differing account  = after a full reversal (CR_LD +40.00 only)
```

Best evidence available: a **fresh** legacy TB export as at 2026-06-30 run through the tie-out. Whichever way those four accounts land in a fresh export is what legacy actually holds today.

Environment: dev `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"` (fresh prod copy taken 7 Aug, contains her edits) · prod `ssh tienhock@5.223.55.190`, db `tienhock_prod` on `localhost:5432` as `postgres` — **`pg_dump` backup before applying** (precedent `~/tienhock_prod_pre_june_reclass_20260806.sql.gz`).

## Status 7 Aug 2026 — the reconciliation itself (dev + prod)

**7 Aug 2026 — post-print legacy amendments.** The coworker reviewed [KEYING_GUIDE_BM.md](KEYING_GUIDE_BM.md) and flagged three rows. Two were genuine: the June **print** this whole reconciliation was tied to contained keying errors of her own, so we had moved two correct ERP classifications to wrong ones. She fixed both in the legacy program and in the ERP overnight — **move #3** (KFC LINTAS 40.00 belongs in `MBSM_K`, not `MBC`) and **E10+E11** (PAUMIN #2606-2133 splits `MBRMF` 565.00 / `MBSAF` 144.00, not 465.00 / 244.00). Her third flag (`PCE004/06`'s sen edits) needed no action — legacy and the ERP already agree at 46.65 / 21.25 / 160.55 / 88.20 / 89.12 / 482.30 / 9.05.

Verified read-only against production on 7 Aug: June movements MBC **919.10** · MBSM_K **3,126.49** · MBRMF **5,135.60** · MBSAF **1,329.55**, every other reconciled account unchanged and still exactly at legacy, all five vouchers footing, June TB **17,106,536.00/side**. The amended figures tie to the cent with no plug (arithmetic in [JUNE_RECLASS_DESIGN.md](JUNE_RECLASS_DESIGN.md) §e). Re-pinned/updated in the same pass: `dump-bihun-june.mjs` targets (MBC 459.55 · MBRMF 2,567.80 · MBSAF 664.78 · Staff Messing 2,689.10 — the four deltas net zero, so expenses subtotal 64,238.82 and FINAL 14.0504 are unchanged), both keying guides, `JUNE_RECLASS_DESIGN.md` §e, MIGRATIONS_LOG.md and the tie-out README. `verify-estimated-report.mjs` needed no change — still 432 exact / 40 documented deltas / 0 failures. **Neither migration may be re-run.**

**Challenged and upheld the same day.** The coworker's 4 Aug annotated BIHUN scans show the pre-amendment figures (MBC 479.55 · MBRMF 2,517.80 · MBSAF 714.78 · Staff Messing 2,669.10) and she initially said those were right, which would have reversed the reversal. A second person then independently confirmed KFC belongs in `MBSM_K`, and MBC 479.55 is arithmetically just KFC 40.00 sitting in Cleaning Expenses — so the 4 Aug scans are stale on these four lines. **No data change; production keeps the 7 Aug state.** Detail and the two open follow-ups (reprint the 4 Aug sheet; PAUMIN's 565/144 split was never independently confirmed) are in [JUNE_RECLASS_DESIGN.md](JUNE_RECLASS_DESIGN.md) §e resolution.

**Known consequence:** the June tie-out now reports 5 differing accounts instead of 1, because its fixture `dev/import/legacy-june-tb/june-2026-legacy-tb.json` is a faithful transcription of the pre-amendment print. That fixture is evidence and must not be edited — see the tie-out README's June proof profile.

## Status 6 Aug 2026 — ALL PHASES DONE (dev + prod)

**Phase 4 completed 6 Aug 2026:** both migrations applied to `tienhock_prod` on the Hetzner server over SSH (fresh `pg_dump` backup first: `~/tienhock_prod_pre_june_reclass_20260806.sql.gz`). Post-verification on prod: June TB 17,106,536.00 = 17,106,536.00/side (unchanged and balanced), all five touched journals still foot, both SHUANG MEI lines sit in MRM at 9.05/89.12. Prod applied the files unchanged — the (reference, account, amount, particulars) line resolution ported cleanly (prod jel ids differ from dev's). The two `.sql` files remain in `dev/migrations/` until they are committed; after commit they can be removed per convention and logged in MIGRATIONS_LOG.md.

- **§d.1 resolved:** the coworker sent `JUNE_MRM&MGT.pdf` (legacy June ledgers for MRM + MGT, printed 06 AUG 2026). It confirms move #14 verbatim (SHUANG MEI HARDWARE keyed at exactly 9.05 in MRM) and identifies the six residual amount miskeys (MRM 21.29→21.25 / 89.10→89.12 / 23.00→22.65 / 24.55→24.60; MGT 88.21→88.20 / 80.50→80.45). The PCE004/06 offsets net −0.38, exactly cancelling E1–E7. Full detail in [JUNE_RECLASS_DESIGN.md](JUNE_RECLASS_DESIGN.md) §d.1.
- **Both migrations applied to dev and verified:** `dev/migrations/2026-08-05_june_legacy_reclass.sql` (14 moves + E8–E11) and `dev/migrations/2026-08-06_june_legacy_reclass_e1_e7_mrm_mgt.sql` (E1–E7 + 6 MRM/MGT edits). Post-assertions tie all 24 accounts' June movement and all 17 affected accounts' June YTD to the legacy prints to the cent; `node dev/pdf-render/dump-bihun-june.mjs` lands every boss target including FINAL 14.0504. Dev June TB total stays 17,106,536.00/side by design (net-0.00 reclass; the 3,655.13 gap to the print is her post-print keying 3,460.00 + the known 195.13 residual + out-of-scope CR_LD 40.00 accounting — see premises).
- **Dev DB anomaly noted:** the 2026-08-05 migration was found reverted in dev on 6 Aug ~19:40 local (no active sessions, nothing in the postgres logs — cause unknown; user was informed and approved re-applying both migrations).
- **Remaining:** nothing. Both `.sql` files remain in `dev/migrations/` until committed; after commit they can be removed per convention and logged in MIGRATIONS_LOG.md.
- **Follow-ups delivered 6 Aug 2026:** the monthly tie-out tool `dev/import/legacy-tieout/tie-out.mjs` (one command → account-level legacy-vs-ERP diff; June re-run showed exactly one row, the documented CR_LD +40.00 anomaly, and the folded ERP grand total ties to the print at 2 × 17,102,880.87 — **as of 7 Aug it shows five rows**, CR_LD plus the four post-print amendments in the status section above) and the prevention strategy [LEGACY_TIEOUT_STRATEGY.md](LEGACY_TIEOUT_STRATEGY.md) (monthly detection → optional vendor→account memory → single-keying end state).

## Trigger state

The coworker answered the three WhatsApp asks (recorded at the end of §7) by sending `JUNE_TIENHOCK_TRIAL_BALANCE.pdf` (repo root, 20 pages, scanned) — the full legacy June 2026 Trial Balance. Evidence sampling on 5 Aug 2026 (pages 1, 10, 20 rendered at scale 2 to `dev/pdf-render/out/june-tb-sample/`) established:

1. **Layout:** one row per account, columns `ACC/CODE · PARTICULAR · APPX · DEBIT · CREDIT` — **YTD balances**, no June-movement columns, no voucher line detail. June movement per account must be derived: legacy June YTD (this print) − dev May YTD (ties exactly to legacy May, boss-verified 5 Aug 2026).
2. **Total discrepancy:** print grand total = **17,102,880.87/side** (page 20), NOT the 17,106,340.87 of the boss's "@ 4/8" handwritten note on `CORRECTED_JUNE_TRIAL_BALANCE.pdf`. Gap = exactly **3,460.00/side** — she either keyed ~3,460 more after printing or reversed some. Dev is at 17,106,536.00/side = print + 3,655.13 (= 3,460.00 + the known 195.13 residual). The tie-target must be resolved in Phase 1.
3. **Margin marks:** small handwritten dots/circles in the left margin next to specific rows (~6/page seen on pages 1 and 10). Unlike the staple/scan artifacts resolved 5 Aug (§7), these look deliberate — possibly her "changed / to-check" markers. Must be recorded per row during transcription.
4. **Spot-checks already match known targets** (print postdates her Bihun corrections): `BRM 14,890.36` DR (boss's corrected YTD) · `MBRM 5,382.11` · `MBRMF 36,069.39` · `MBSAF 9,557.01` · `MBOR 7,972.20` (page 10) · `ABB 204.26` · `ACW_SAL 59,027.75` CR (page 1).

## Objective (unchanged from §7)

(a) Reclassify our June voucher lines so BRM, MBRM, MBC, MBOR, MBRMF, MBSAF, MBSM_O, MBSM_K, OIL*, R* match legacy's June movements exactly — real data alignment, **no hardcoded plugs**. (b) June TB ties at legacy's final total (resolve 17,106,340.87 vs 17,102,880.87 — see finding 2). (c) June BIHUN estimated unit cost lands on the boss's corrected rows: MBC 479.55 · MBOR 799.40 · MBRMF 2,517.80 · MBSAF 714.78 · Staff Messing 2,669.10 · VRE-Diesel 1,555.67 · VRE-Repair 1,753.50 · expenses 64,238.82 · machine repair 2,319.22 · FINAL ≈ 14.0504. (d) Re-pin `dev/import/closing-stock-report/expected-june-2026.json` and `verify-estimated-report.mjs`. (e) Update §7 and apply the same data fixes to production via guarded migrations.

## Phased plan (compute split: Kimi = complex design, Opus = mechanical)

**Phase 0 — Opus (mechanical). DONE PENDING CONFIRMATION.** Render/transcribe the 20-page PDF into a validated JSON fixture + margin-mark list + dev-side YTD dump + account-level diff CSV. Full prompt is in the Appendix below; artifacts land in `dev/import/legacy-june-tb/` (`june-2026-legacy-tb.json`, `margin-marks.md`, `dev-june-2026-ytd.json`, `diff-june-tb.mjs`, `june-tb-diff.csv`).

**Phase 1 — Kimi (complex, next).** Reclassification design from the Phase 0 diff artifact:
- Derive legacy June movement per account (legacy June YTD − dev May YTD).
- Split the 3,655.13/side total gap into (i) her post-print keying (3,460.00/side — likely the margin-marked rows; may need one more confirmation from her before locking the tie-target) vs (ii) genuine classification diffs (195.13/side + the known Bihun voucher rows).
- For each affected account, pull our June journal lines from the dev DB and decide exact line moves so our June movements equal legacy's derived movements AND the Bihun engine lands on the boss's corrected rows (targets above).
- Output: an explicit line-move table (journal_entry_lines id → from account → to account, with amount assertions).

**Phase 2 — Kimi writes, Opus executes.** Guarded, idempotent, fail-closed migration `dev/migrations/2026-08-XX_june_legacy_reclass.sql` (same pattern as `dev/migrations/2026-08-05_pce002_acwj_sal_reclass.sql`; run with `psql -v ON_ERROR_STOP=1`). Opus applies it to dev and verifies: June TB tie-out vs the resolved legacy total; `node dev/pdf-render/dump-bihun-june.mjs` against the boss's targets.

**Phase 3 — Opus (mechanical).** Re-pin `dev/import/closing-stock-report/expected-june-2026.json` and `verify-estimated-report.mjs`; update ACCOUNTING_PROGRESS.md §7; changelog entry in `src/components/ChangelogModal.tsx` (visible numbers change — AGENTS.md rule 16); MIGRATIONS_LOG.md entry.

**Phase 4 — user-gated.** Apply the same guarded migration(s) to production after dev verification and user sign-off.

## Resuming in a fresh session

If the user says Phase 0 Opus is done: verify the artifacts exist and the validation gates were reported passed (debit sum = credit sum = 17,102,880.87; spot rows BRM 14,890.36 / MBRM 5,382.11 / MBRMF 36,069.39 / MBSAF 9,557.01 / MBOR 7,972.20; diff net = 3,655.13/side; BRM diff −473.26 = dev 14,417.10 vs legacy 14,890.36), read `june-tb-diff.csv` + `margin-marks.md`, then start Phase 1. Dev DB: `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"`.

## Appendix — Phase 0 Opus prompt (as dispatched 5 Aug 2026)

```
You are working in the repo C:/tienhock (Windows, Git Bash). This is Phase 0 (data extraction) of the June 2026 TB / Bihun reconciliation. Read docs/Account/ACCOUNTING_PROGRESS.md §7 first for context. Do NOT modify the database, any source file, or any doc — this phase only produces two new data artifacts under dev/import/legacy-june-tb/.

BACKGROUND
- JUNE_TIENHOCK_TRIAL_BALANCE.pdf (repo root, 20 pages, scanned) is the coworker's FULL legacy June 2026 Trial Balance: one row per account, columns ACC/CODE · PARTICULAR · APPX · DEBIT · CREDIT (YTD balances, not June movements). Page 20 grand total = 17,102,880.87 per side.
- Some rows have small handwritten dots/circles in the left page margin. These are potentially meaningful (possibly rows the coworker changed after printing) and MUST be recorded.
- Dev DB access: docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"

TASK 1 — Render and transcribe
1. node dev/pdf-render/render-pdf.mjs JUNE_TIENHOCK_TRIAL_BALANCE.pdf dev/pdf-render/out/june-tb-full 2
2. Transcribe EVERY row of all 20 pages into dev/import/legacy-june-tb/june-2026-legacy-tb.json: an array of objects { code, particular, appx, debit, credit, page, row, margin_mark } where debit/credit are numbers (0 when the printed cell is ".00" or blank), row is the 1-based row index on the page, margin_mark is true only when a handwritten mark sits in the left margin next to that row.
3. The rendered PNGs are downsampled when read whole; for any digit you are not 100% sure of, re-read the page image with the region parameter (original-image pixel coordinates) to view that row's crop at full fidelity. Never guess a digit.
4. Validation gate, all must pass before you finish Task 1: (a) sum(debit) == 17,102,880.87 and sum(credit) == 17,102,880.87 to the cent; (b) these spot rows match: BRM debit 14,890.36 · MBRM 5,382.11 · MBRMF 36,069.39 · MBSAF 9,557.01 · MBOR 7,972.20 (page 10) · ABB 204.26 and ACW_SAL credit 59,027.75 (page 1); (c) account codes unique except DEBTOR. If the sums are off, find and fix the misread rows — do not proceed until exact.
5. Also write dev/import/legacy-june-tb/margin-marks.md listing every (page, code) with margin_mark=true, with a one-line note on what the mark looks like.

TASK 2 — Dev-side June YTD dump and account-level diff
1. Dump our dev June YTD balance per account (positive = debit balance) to dev/import/legacy-june-tb/dev-june-2026-ytd.json using this SQL against the dev DB (anchors + posted lines, anchor-date-aware):

WITH anchors AS (
  SELECT DISTINCT ON (account_code) account_code, as_of_date, amount
  FROM account_opening_balances
  WHERE as_of_date <= '2026-06-30'
  ORDER BY account_code, as_of_date DESC
),
movement AS (
  SELECT jel.account_code, SUM(jel.debit_amount - jel.credit_amount) AS net
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  LEFT JOIN anchors a ON a.account_code = jel.account_code
  WHERE je.status = 'posted'
    AND je.entry_date <= '2026-06-30'
    AND (a.as_of_date IS NULL OR je.entry_date >= a.as_of_date)
  GROUP BY jel.account_code
)
SELECT ac.code, COALESCE(a.amount,0) + COALESCE(m.net,0) AS ytd_balance
FROM account_codes ac
LEFT JOIN anchors a ON a.account_code = ac.code
LEFT JOIN movement m ON m.account_code = ac.code
WHERE COALESCE(a.amount,0) + COALESCE(m.net,0) <> 0
ORDER BY ac.code;

2. Write a small node script dev/import/legacy-june-tb/diff-june-tb.mjs that joins the two JSONs (legacy balance = debit − credit) and writes dev/import/legacy-june-tb/june-tb-diff.csv with columns code, legacy_balance, dev_balance, diff, margin_mark — only rows where abs(diff) >= 0.005, sorted by abs(diff) descending — plus a summary line: total |diff| per sign, and how much of it is on margin-marked rows.
3. Expected sanity anchors: our dev June TB total is 17,106,536.00/side vs the print's 17,102,880.87, so the signed diffs should net to 3,655.13/side; BRM should show dev 14,417.10 vs legacy 14,890.36 (diff −473.26). Report whether those hold.

DELIVERABLES (report back)
- Confirmation both validation gates passed, with the actual sums.
- The full diff CSV content (or top 40 rows if long), grouped: rows with margin marks vs without.
- Any rows you could not transcribe with certainty.
- Do not draw conclusions about WHY accounts differ and do not change any data — the reclassification design is the next phase and is not yours.
```
