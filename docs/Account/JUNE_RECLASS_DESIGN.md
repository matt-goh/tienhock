# June 2026 Reclassification Design (Phase 1)

> **PARTIALLY SUPERSEDED 7 Aug 2026 — read [§e](#e-post-print-legacy-amendments-7-aug-2026) before acting on this document.** Three of the corrections below (move **#3**, edits **E10** and **E11**) were derived from the June legacy **print**, which itself carried keying errors. The coworker corrected them in the legacy program and in the ERP on 7 Aug 2026. Everything else in this document stands and is verified in production.

**Created 5 Aug 2026. Phase 2 EXECUTED on dev 6 Aug 2026** — both migrations applied and verified (see the migration note at the bottom); §d.1 resolved by `JUNE_MRM&MGT.pdf`. Phase 2 turns this into the guarded migrations `dev/migrations/2026-08-05_june_legacy_reclass.sql` (moves + E8–E11) and `dev/migrations/2026-08-06_june_legacy_reclass_e1_e7_mrm_mgt.sql` (E1–E7 + MRM/MGT offsets). Parent plan: [JUNE_TB_BIHUN_RECON_HANDOVER.md](JUNE_TB_BIHUN_RECON_HANDOVER.md); Phase 0 artifacts: `dev/import/legacy-june-tb/`; corrected premises A–E from the Phase 1 brief apply (no margin marks; tie-target 17,102,880.87 already met when dev is folded into legacy's presentation; real scope = 18 classification diffs netting exactly 40.00 = CR_LD; CR_LD is a source-document anomaly and out of scope).

## Method and validation

Dev June lines (296 lines, 24 accounts) were dumped from the dev DB and matched to the 253 legacy ledger lines in `june-2026-legacy-ledgers.json` on date + journal (legacy `PV00n/06` = dev `PCE00n/06`; `PBEnnn/06` identical) + amount, with particulars/cheque as disambiguators. Journal mapping: legacy `PB3507xx` = dev header `cheque_no` `PBB3507xx`; legacy `PBE2606x` = dev `PBE2606x`.

**Control validation (premise E):** the seven tying accounts with legacy detail — OIL9897, OILFORK, OILHT15, OILHT18, R9922, ROTH, RBFORK — matched 1:1 with zero residuals (39/39 lines). The matcher was then trusted on the 13 that differ.

Every proposed move below was simulated against the fixture: **all 23 accounts land on legacy's June movement AND legacy's printed June YTD to the cent** (the 13 detailed accounts exactly; OIL9882/OIL920/MRM/MGT exactly subject to §d; controls unchanged). Net change across all accounts is 0.00, so the June TB stays at 17,102,880.87/side.

## (a) Per-account gaps (gap = dev − legacy June movement)

| account | legacy move | dev move | gap | resolution |
|---|---:|---:|---:|---|
| BRM | 1,413.74 | 940.48 | −473.26 | moves #1, #14 + edits E6, E7 |
| MBC | 959.10 | 913.55 | −45.55 | moves #2, #3 + edit E1 — **§e: legacy amended to 919.10; move #3 dropped** |
| MBOR | 1,598.80 | 2,044.71 | +445.91 | moves #1, #2 out; #4, #5 in |
| MBRM | 1,810.95 | 2,211.00 | +400.05 | move #8 out + edits E2, E8, E9 |
| MBRMF | 5,035.60 | 4,735.60 | −300.00 | move #8 in + edit E10 — **§e: legacy amended to 5,135.60; E10 dropped** |
| MBSAF | 1,429.55 | 1,329.56 | −99.99 | edits E3, E11 — **§e: legacy amended to 1,329.55; E11 dropped** |
| MBSM_K | 3,086.49 | 3,249.20 | +162.71 | moves #3, #4, #5, #7 out; #6 in + edits E4, E5 — **§e: legacy amended to 3,126.49; move #3 dropped** |
| MBSM_O | 2,251.70 | 2,170.50 | −81.20 | moves #6 out, #7 in |
| OIL6323 | 370.35 | 340.35 | −30.00 | move #11 in |
| OIL9698 | 315.50 | 468.50 | +153.00 | moves #9, #10, #11 out |
| OILOTH | 450.00 | 490.00 | +40.00 | move #13 out |
| OIL9922 | 619.48 | 539.48 | −80.00 | move #12 in |
| R9698 | 623.00 | 500.00 | −123.00 | moves #9, #10 in |
| OIL9882 | 282.15 | 362.15 | +80.00 | move #12 out (no legacy detail — derived) |
| OIL920 | 40.00 | 0.00 | −40.00 | move #13 in (no legacy detail — inferred, §d.4) |
| MRM | 3,294.82 | 3,286.09 | −8.73 | move #14 in + four amount edits (§d.1 — resolved 6 Aug) |
| MGT | 8,908.02 | 8,908.08 | +0.06 | two amount edits (§d.1 — resolved 6 Aug) |
| CR_LD | — | — | +40.00 | **OUT OF SCOPE — source anomaly (§d.3)** |

Subtotal of the 17 in-scope gaps: **0.00**. The +40.00 net in `june-tb-diff.csv` is entirely CR_LD.

## (b) The line-move table

All 14 lines sit on **manual, source-less C/B journals** (`source_type` NULL, `manual_override` false) dated June 2026 — outside the 2026-06-01 period lock and safe to edit without detaching any system journal. Amounts are debits; no credit lines are touched. Moves change only `account_code`; journal totals are unaffected by moves.

| # | jel.id | journal (legacy ref) | date | amount | from → to | justifying legacy ledger line |
|---|---|---|---|---:|---|---|
| 1 | 7779 | PCE004/06 (PV004/06) | 2026-06-10 | 482.30¹ | MBOR → BRM | BRM seq5 — TAOBAO-JING XIAN YOU #51124865792222003605 (BIHUN food-grade rubber; dev miskeyed to Office Refreshment) |
| 2 | 7668 | PCE004/06 (PV004/06) | 2026-06-10 | 5.50 | MBOR → MBC | MBC seq2 — EMART 54.30; dev split the same receipt (LJP08202603240094) into MBC 48.80 + this 5.50 leg; 48.80 + 5.50 = 54.30 exactly |
| ~~3~~ | 7696 | PCE004/06 (PV004/06) | 2026-06-10 | 40.00 | ~~MBSM_K → MBC~~ | ~~MBC seq8 — KFC LINTAS JAYA BOULEVARD #130134-14/03/2026~~ **REVERSED — see §e. Legacy's MBC placement was its own keying error; KFC is factory staff food and stays in `MBSM_K`.** |
| 4 | 7760 | PCE004/06 (PV004/06) | 2026-06-10 | 29.00 | MBSM_K → MBOR | MBOR seq21 — LIDO MARKET #400256-15/05/2026 |
| 5 | 21055 | PCE008/06 (PV008/06) | 2026-06-30 | 12.90 | MBSM_K → MBOR | MBOR seq43 — MIX STORE #79002112261660070037 |
| 6 | 7689 | PCE004/06 (PV004/06) | 2026-06-10 | 26.50 | MBSM_O → MBSM_K | MBSM_K seq18 — HO KEE HAINANESE CHICKEN RICE #SLHQ01CT01202600008640 |
| 7 | 8017 | PCE007/06 (PV007/06) | 2026-06-23 | 107.70 | MBSM_K → MBSM_O | MBSM_O seq6 — ORIENTAL COFFEE (KL) S/B #SS04/06180 |
| 8 | 21051 | PCE008/06 (PV008/06) | 2026-06-30 | 400.00 | MBRM → MBRMF | MBRMF seq11 — HV ELECTRICAL #CS-260600975 (SINO copper cable; factory, not MEE+BIHUN machine) |
| 9 | 5993 | PCE002/06 (PV002/06) | 2026-06-10 | 23.00 | OIL9698 → R9698 | R9698 seq2 — K.K SEAL #CSA-21897 (repair parts keyed as diesel) |
| 10 | 5994 | PCE002/06 (PV002/06) | 2026-06-10 | 100.00 | OIL9698 → R9698 | R9698 seq3 — DIGNITY BRAND #CS-D081338 (spark plugs keyed as diesel) |
| 11 | 7731 | PCE004/06 (PV004/06) | 2026-06-10 | 30.00 | OIL9698 → OIL6323 | OIL6323 seq11 — SHELL BUNDUSAN #01001886-22/03/2026; **particulars match verbatim** (wrong vehicle account SAB9698C vs SAB6323H) |
| 12 | 21038 | PCE008/06 (PV008/06) | 2026-06-30 | 80.00 | OIL9882 → OIL9922 | OIL9922 seq5 — SHELL SYT.EXCEL SERVICE #01003038-03/06/2026 (keyed to the SWJ9882 Hilux instead of SD9922H) |
| 13 | 8016 | PCE007/06 (PV007/06) | 2026-06-23 | 40.00 | OILOTH → OIL920 | **Inferred** (OIL920 has no legacy detail): dev OIL920 has zero June lines but legacy movement is 40.00; dev OILOTH carries exactly one line legacy lacks — SHELL BUNDUSAN #01002075-23/05/2026, 40.00. See §d.4 |
| 14 | 7780 | PCE004/06 (PV004/06) | 2026-06-10 | 9.05 | BRM → MRM | **Inferred, coworker-gated** (§d.1): legacy has no TAOBAO-SHUANG MEI HARDWARE 9.05 line in BRM; MRM is the only account whose gap can absorb it |

¹ Move 1 carries amount edit E7 (482.31 → 482.30) so the line equals legacy's keyed amount.

### Amount corrections (same line, dev amount miskeyed vs legacy)

| # | jel.id | account | journal | dev → legacy | justifying legacy line |
|---|---|---|---|---|---|
| E1 | 7765 | MBC | PCE004/06 | 46.60 → 46.65 | MBC seq20 — 100% SUPER SHOP #000024 |
| E2 | 7806 | MBRM | PCE004/06 | 13.60 → 13.55 | MBRM seq3 — TAOBAO order 260525-496500743803406 (bearing grease parts) |
| E3 | 7784 | MBSAF | PCE004/06 | 160.56 → 160.55 | MBSAF seq2 — TAOBAO-WEI ER DUN safety boots |
| E4 | 7759 | MBSM_K | PCE004/06 | 54.00 → 54.40 | MBSM_K seq35 — HONG JIA TING #20260428-0243 |
| E5 | 7800 | MBSM_K | PCE004/06 | 19.30 → 19.29 | MBSM_K seq43 — BOWL & SUPERFOOD 28/05/2026 |
| E6 | 7788 | BRM | PCE004/06 | 26.70 → 26.71 | BRM seq7 — TAOBAO-PIN SHANG MEI SHUO #5114942534480212835 |
| E7 | 7779 | BRM (with move 1) | PCE004/06 | 482.31 → 482.30 | BRM seq5 — TAOBAO-JING XIAN YOU |
| E8 | 21042 | MBRM | PCE008/06 | 43.85 → 43.90 | MBRM seq9 — TAOBAO-GU DE LI QI HANG (compressor air gun) |
| E9 | 21047 | MBRM | PCE008/06 | 629.50 → 629.45 | MBRM seq11 — TAOBAO-HANG ZHOU JIN XIN gearbox RV63 |
| ~~E10~~ | 20956 | MBRMF | PBE054/06 | ~~565.00 → 465.00~~ | ~~MBRMF seq10 — PAUMIN #2606-2133 cutting-disc leg~~ **REVERSED — see §e. 565.00 is the receipt's real disc/drill-bit/tape total.** |
| ~~E11~~ | 20955 | MBSAF | PBE054/06 | ~~144.00 → 244.00~~ | ~~MBSAF seq4 — PAUMIN #2606-2133 gloves/spectacles leg~~ **REVERSED — see §e. 144.00 is the receipt's real gloves/spectacles total.** |

E10+E11 are one receipt whose two legs dev keyed 565/144 where legacy keyed 465/244 — same total 709.00, so PBE054/06 stays balanced either way. **§e: dev was right and legacy was wrong; both are now 565/144.**

### Journal-total invariants (constraint: no journal's total may change)

| journal | moves | amount edits | net |
|---|---|---|---|
| PCE002/06 | #9, #10 | — | 0.00 ✓ |
| PCE004/06 | #1, #2, #3, #4, #6, #11, #14 | E1 +0.05, E2 −0.05, E3 −0.01, E4 +0.40, E5 −0.01, E6 +0.01, E7 −0.01 | **+0.38 — requires §d.1** |
| PCE007/06 | #7, #13 | — | 0.00 ✓ |
| PCE008/06 | #5, #8, #12 | E8 +0.05, E9 −0.05 | 0.00 ✓ |
| PBE054/06 | — | E10 −100.00, E11 +100.00 | 0.00 ✓ |

PCE004/06's forced edits net +0.38. The offset is exactly the MRM (−0.32) + MGT (−0.06) corrections of §d.1, which land on PV004/06 and PV008/06 lines, keeping both vouchers total-neutral. **RESOLVED 6 Aug 2026:** E1–E7 were applied together with the §d.1 offsets in the follow-up migration (see below) — PCE004/06's total and CASH never drifted.

## (c) Post-move assertions

For every affected account, expected June movement and June YTD after the migration (verified by simulation; YTD = legacy's printed TB row):

| account | June movement | June YTD (DR) |
|---|---:|---:|
| BRM | 1,413.74 | 14,890.36 |
| MBC | 959.10 | 4,954.85 |
| MBOR | 1,598.80 | 7,972.20 |
| MBRM | 1,810.95 | 5,382.11 |
| MBRMF | 5,035.60 | 36,069.39 |
| MBSAF | 1,429.55 | 9,557.01 |
| MBSM_K | 3,086.49 | 15,794.98 |
| MBSM_O | 2,251.70 | 11,242.00 |
| OIL6323 | 370.35 | 758.50 |
| OIL9698 | 315.50 | 849.80 |
| OIL9882 | 282.15 | 1,212.15 |
| OIL920 | 40.00 | 203.30 |
| OIL9922 | 619.48 | 3,813.09 |
| OILOTH | 450.00 | 8,369.40 |
| R9698 | 623.00 | 1,870.00 |
| MRM | 3,294.82 | 23,078.62 |
| MGT | 8,908.02 | 28,139.45 |

Global assertions: (i) the seven control accounts (OIL9897 530.00 / OILFORK 172.00 / OILHT15 346.00 / OILHT18 308.00 / R9922 562.00 / ROTH 1,907.00 / RBFORK 415.00 movements) are untouched; (ii) every touched journal keeps its exact total debit and credit; (iii) June TB grand totals stay 17,102,880.87/side (net change 0.00); (iv) no row dated before 2026-06-01 is touched; (v) all 25 touched lines are on source-less manual journals — `manual_override` stays false, nothing detaches.

### BIHUN estimated-unit-cost check (task 5)

**§e re-pin (7 Aug 2026):** four of these rows moved when move #3 / E10 / E11 were reversed — MBC 919.10/2 = **459.55** · MBRMF 5,135.60/2 = **2,567.80** · MBSAF 1,329.55/2 = 664.775 ≈ **664.78** · Staff Messing (2,251.70+3,126.49)/2 = 2,689.095 ≈ **2,689.10**. The four deltas (−20 / +50 / −50 / +20) net to zero, so the expenses subtotal and FINAL below are unchanged. `dump-bihun-june.mjs` carries the re-pinned targets.

Post-move June movements reproduce the boss's corrected rows through the existing engine mappings (`estimated_report_line_sources`): MBC 959.10/2 = **479.55** · MBOR 1,598.80/2 = **799.40** · MBRMF 5,035.60/2 = **2,517.80** · MBSAF 1,429.55/2 = 714.775 ≈ **714.78** · Staff Messing (2,251.70+3,086.49)/2 = 2,669.095 ≈ **2,669.10** · VRE-Diesel (OIL9922+OIL9698+OIL6323+OILOTH+OILFORK+OILHT18+OILHT15+OIL9897; OIL7369/5163/CASE/JCB/9753 have zero June movement — verified) 3,111.33/2 = 1,555.665 ≈ **1,555.67** · VRE-Repair (R9922+R9698+ROTH+RBFORK) 3,507.00/2 = **1,753.50** exact · machine repair BRM + MBRM/2 = 1,413.74 + 905.475 = 2,319.215 ≈ **2,319.22**. The expenses subtotal (64,238.82) and FINAL (≈14.0504) follow by construction — every mapped account's movement now equals legacy's, which is what the boss's figures were derived from. Phase 2 verifies with `node dev/pdf-render/dump-bihun-june.mjs`. Note: the four exact-half-sen rows (714.775 / 2,669.095 / 1,555.665 / 2,319.215) may *display* 1 sen below the boss's handwritten figure under JS float rounding — a display artifact, not a data gap.

## (d) Unresolved / left open

1. **MRM (−8.73) and MGT (+0.06) — RESOLVED 6 Aug 2026 by the coworker's legacy June ledgers (`JUNE_MRM&MGT.pdf`, printed 06 AUG 2026; every digit below re-verified at full raster fidelity).** Legacy keyed the SHUANG MEI HARDWARE line itself at exactly **9.05** in MRM (particulars `#511330410139 6030433-30/04/2026 (SS 304 SPRING 1.2X12X120MM)` match dev's verbatim), so move #14 is now fixture-verified and the "8.73 variant" is disproved. The remaining −0.32 MRM / −0.06 MGT are six dev amount miskeys, confirmed line-by-line against the legacy prints:
   - MRM, PCE004/06: HU HAO FLAGSHIP 21.29→**21.25** · SHUANG MEI HARDWARE #511494253448 89.10→**89.12** · FOSHAN NAN FANG 23.00→**22.65** (= −0.37 on the voucher)
   - MRM, PCE008/06: ZHE JIANG SHEN HONG 24.55→**24.60** (+0.05)
   - MGT, PCE004/06: ZHI CHENG ZHOU CHENG 88.21→**88.20** (−0.01)
   - MGT, PCE008/06: YI HAO QI HANG #51201609508500360 80.50→**80.45** (−0.05)
   PCE004/06 offsets total −0.38 — exactly cancelling E1–E7's forced +0.38 — and the two PCE008/06 edits net 0.00, so both vouchers stay total-neutral. Applied with E1–E7 in `dev/migrations/2026-08-06_june_legacy_reclass_e1_e7_mrm_mgt.sql`; post-assertions tie all 24 accounts' June movement AND all 17 affected accounts' June YTD to the legacy prints to the cent, and `dump-bihun-june.mjs` lands every boss target including FINAL 14.0504. (Original text: leading hypothesis interlocked move #14 with pending −0.32 MRM / −0.06 MGT amount over-keying — confirmed, with the exact lines now identified above.)
2. **~~If the coworker's evidence contradicts the hypothesis~~ — moot:** the evidence (§d.1) CONFIRMED the hypothesis; no plug was needed. (Original: had legacy never keyed the SHUANG MEI receipt in June, BRM could not tie without a plug and the brief said stop and re-consult.)
3. **CR_LD +40.00 — source-document anomaly, out of scope.** Printed 25,492.43 CR vs dev 25,452.43 CR; the digit was verified as an unambiguous 9 on the native raster (see `margin-marks.md`). The legacy print's own credit column foots 40.00 over its own grand total. No reclassification, no plug. Flag for the coworker (legacy CR_LD ledger detail).
4. **OIL920 (move #13) is inference, not fixture-verified** — OIL920 has no legacy line detail. It is arithmetically exact (dev OIL920 has zero June lines; legacy movement 40.00; dev OILOTH has exactly one line legacy lacks, for exactly 40.00), and OIL920 is outside the VRE-Diesel mapping so the BIHUN targets are unaffected. Low risk, but the coworker's OIL920 June ledger would confirm.
5. **Premise-pair corrections (task 4):** the guessed pairs were verified and one was wrong — OIL9882 +80.00 pairs with **OIL9922** (not OIL920): fixture-exact (OIL9922 seq5 = dev OIL9882 line id21038). OIL920 −40.00 pairs with OILOTH +40.00 as guessed. OIL6323 −30.00 pairs with **OIL9698**, not OILOTH: the dev OIL9698 line id7731 is the verbatim receipt (#01001886-22/03/2026) of legacy OIL6323 seq11.
6. **Observed, deliberately NOT proposed for change** (same-account/same-total or cosmetic): dev MBOR splits OWL TEA 35.30 into two 17.65 lines where legacy prints one (same account, same total); PCE008/06's `display_reference` is `PCE008/06` while legacy prints `PV008/06` (display only); a few dev particulars carry harmless receipt-text typos (e.g. OIL6323 `#01007826` vs legacy `#01001826`, `#01001990` vs `#01001996`, PETRON `24/02` vs `24/06`). None affects any balance; listing them here so Phase 2 does not "fix" them opportunistically.

## (e) Post-print legacy amendments (7 Aug 2026)

The coworker was shown [KEYING_GUIDE_BM.md](KEYING_GUIDE_BM.md) and flagged three of its rows. Two were real: **the June print we reconciled against contained keying errors of her own**, so aligning our ledger to it moved two correct classifications to wrong ones. She corrected both in the legacy program *and* in the ERP (journals `PCE004/06` at 2026-08-07 00:29 and `PBE054/06` at 00:46), which reverses move #3, E10 and E11.

| # | line | what the print said | what is actually correct | why |
|---|---|---|---|---|
| move #3 | `PCE004/06` KFC LINTAS JAYA #130134, 40.00 | `MBC` (Cleaning Expenses) | **`MBSM_K`** | KFC is a meal for factory staff. It cannot be a cleaning expense — rule 4 of the keying guide. |
| E10 | `PBE054/06` PAUMIN #2606-2133 disc leg | 465.00 | **565.00** | The receipt's cutting/grinding discs, non-woven wheel, flap disc, roller refill, drill bits, holesaw and insulating tape total 565.00. |
| E11 | `PBE054/06` PAUMIN #2606-2133 PPE leg | 244.00 | **144.00** | 2 doz batik cotton gloves + 12 spectacles total 144.00. |

E10+E11 are one receipt (709.00 either way) so no voucher total moved; move #3 is a pure account change. All five reconciled vouchers still foot exactly, `manual_override` is still false on all of them, and the June TB is unchanged at 17,106,536.00/side.

**The result is arithmetically self-confirming.** Amend the legacy targets the way she describes, drop those three corrections, and every affected account still ties to the cent — no plug, nothing left over:

| account | amended legacy | ERP now (prod, verified 7 Aug) | |
|---|---:|---:|---|
| MBC | 959.10 − 40 = 919.10 | 913.55 + 5.50 (move #2) + 0.05 (E1) = **919.10** | ✓ |
| MBSM_K | 3,086.49 + 40 = 3,126.49 | 3,249.20 − 29.00 − 12.90 − 107.70 + 26.50 + 0.40 − 0.01 = **3,126.49** | ✓ |
| MBRMF | 5,035.60 + 100 = 5,135.60 | 4,735.60 + 400.00 (move #8) = **5,135.60** | ✓ |
| MBSAF | 1,429.55 − 100 = 1,329.55 | 1,329.56 − 0.01 (E3) = **1,329.55** | ✓ |

Her third flag — `PCE004/06`'s sen-level edits — needed no action: her screenshots show the legacy program and the ERP both at 21.25 / 160.55 / 88.20 / 61.93 / 26.71 / 89.12 / 46.65 / 482.30 / 9.05. E1–E7 and the §d.1 MRM/MGT offsets were right and are already in on both sides. "It seems it amended already" was our 6 Aug migration.

### §e resolution — it flipped twice; `MBSM_K` / 565-144 stands

Later on 7 Aug the coworker, asked to reconcile §e against her own 4 Aug annotated scans (`CORRECTED_BIHUN_JUNE_ESTIMATED_UNIT_COST.pdf`, which shows MBC 479.55 · MBRMF 2,517.80 · MBSAF 714.78 · Staff Messing 2,669.10), said the **4 Aug figures** were right — which would have required reversing move #3, E10 and E11 again. A reversal handover was drafted and then withdrawn: **a second person independently confirmed KFC belongs in `MBSM_K`**, and MBC 479.55 is arithmetically nothing other than KFC 40.00 sitting in Cleaning Expenses. The 4 Aug scans predate the correction and are stale on exactly these four lines, in the same way the June TB print is stale on the four matching accounts.

**Outcome — CLOSED 7 Aug 2026: no data change.** She re-confirmed the 4 Aug figures once more, and the contradiction was then resolved by the missing fact: **she had also updated the estimated unit cost inside the legacy program**. Legacy and the ERP therefore carry the same June classification, and the bottom line agrees on both sides (expenses subtotal 64,238.82, FINAL 14.0504). Production keeps the 7 Aug state (KFC 40.00 in `MBSM_K`; PAUMIN `MBRMF` 565.00 / `MBSAF` 144.00), the re-pinned targets stand, and the 4 Aug annotated scans are a superseded pre-amendment snapshot. June estimated unit cost is done; see [JUNE_TB_BIHUN_RECON_HANDOVER.md](JUNE_TB_BIHUN_RECON_HANDOVER.md).

One thing to watch:

- **The 4 Aug paper scans are still the old figures.** Legacy's own estimated unit cost was updated, but the annotated printout in circulation was not. If it resurfaces, it is stale — the current figures are 459.55 / 2,567.80 / 664.78 / 2,689.10.

**Do not use the subtotal, FINAL or the Trial Balance total to adjudicate this.** The four deltas are −20 / +50 / −50 / +20 and net to zero, so 64,238.82, 14.0504 and 17,102,880.87 are identical under both classifications. Only the receipt settles it.

**Method lesson.** Every row of the keying guide and every correction in this document was derived from a single printed source. A print is evidence of *what was keyed*, not of *what is correct* — where legacy and the ERP disagreed, we assumed legacy was right by default. For the 28 rows backed by an unambiguous vendor/part rule that assumption held; for these three it inverted a correct ERP entry. Future reconciliations should treat a legacy-vs-ERP difference as a question for the receipt, and prefer a fresh month-end export over a print that the coworker may still be editing.

### Migration shape note for Phase 2 — EXECUTED on dev 6 Aug 2026

Two guarded, idempotent, fail-closed transactions in the style of `dev/migrations/2026-08-05_pce002_acwj_sal_reclass.sql`: `dev/migrations/2026-08-05_june_legacy_reclass.sql` (14 moves + E8–E11, the independent-safe scope) and `dev/migrations/2026-08-06_june_legacy_reclass_e1_e7_mrm_mgt.sql` (E1–E7 + the six §d.1 MRM/MGT offsets, applied together once `JUNE_MRM&MGT.pdf` confirmed them). Each asserts every line's current journal/account/amount/particulars before updating; the post-assertions re-verify the (c) table per account (June movement AND June YTD), per-journal totals, and net 0.00 change. Dev result: all assertions pass; `dump-bihun-june.mjs` lands every boss target (MBC 479.55 · MBOR 799.40 · MBRMF 2,517.80 · MBSAF 714.78 · Staff Messing 2,669.10 · VRE-Diesel 1,555.67 · VRE-Repair 1,753.50 · expenses 64,238.82 · machine repair 2,319.22 · FINAL 14.0504). Prod applies the same two files in Phase 4 after user sign-off. **Prod caveat:** the jel.id values above are dev ids — both migrations resolve lines by (journal reference, account, amount, particulars), not by id, so they port to prod unchanged.

**Do not re-run either migration.** Both are applied in production, and §e has since reversed move #3, E10 and E11 by hand. Re-running would re-assert the pre-edit line state, fail its own guards, and — if forced — reintroduce the three wrong classifications. The current production state is correct; the files are kept only as the historical record.
