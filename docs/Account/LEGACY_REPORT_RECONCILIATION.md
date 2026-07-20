# Jan–May 2026 legacy report reconciliation

Date checked: 2026-07-20  
Database: development; its immutable Jan–May journal population matches the guarded production import, while V2 anchors/mappings/report code are development-only  
Status: Phase V1 evidence gate passed with zero unexplained rows; the exact approved Phase V2 package was implemented and verified on development 20 Jul 2026; production remains unchanged pending separate approval

This is the sign-off companion to the
[Legacy Report Verification Plan](LEGACY_REPORT_VERIFICATION_PLAN.md). It independently checks the
completed [Jan–May legacy ledger import](LEGACY_JAN_MAY_IMPORT_PLAN.md) against the nine reports
exported from the legacy system. It does not alter the immutable `IMP` journals or accept a
balancing plug.

## Scope, evidence, and comparison rules

The evidence population is five monthly Trial Balances plus the May Trade Debtor List, Balance
Sheet, detailed Income Statement, and Cost of Goods Manufactured report. The private scans and
transcribed CSVs remain under the gitignored
`dev/import/legacy-report-fixtures/data/` directory. The tracked
[source manifest](../../dev/import/legacy-report-fixtures/source-manifest.json) pins all nine PDF
hashes and ten fixture hashes. The May TB source used for every account-level sign-off row below
has PDF SHA-256
`66d3eaad9651fbc5cc3e4f09ac395afb78d391a068a3e4f09db07ff3b7193c6c` and CSV SHA-256
`38e866134f9848363abea65ebfdb3e13014e3e69f2fa6aa74c95086488cc0f89`.

The comparison rules are deliberately strict:

- Printed account codes normalize spaces to underscores, then resolve by exact ERP code, the
  existing import aliases, or a named exception. No fuzzy match is allowed. Particulars are a
  sanity check, never a join key.
- TB values use the ERP report semantics: latest opening anchor on or before period end plus
  posted movement from that anchor through period end. Trade-debtor children collapse into
  `DEBTOR`.
- Signed account amounts are debit-positive. `Difference` means scan minus ERP.
- `May TB pN rN` is the canonical evidence pointer. Every opening difference is constant from
  January through May, so the May row proves the same level difference at all five month-ends.
- The imported `IMP` journals and their provenance are immutable. V2 may change anchors,
  classifications, and report rendering only after approval.

## Result at a glance

| Gate | Result |
|---|---|
| Source fixtures | 9/9 PDF hashes and 10/10 fixture hashes pass; every arithmetic and cross-report control passes |
| Account mapping | 885 printed codes: 875 exact, 5 named exceptions, 5 unmatched zero-only cosmetic codes; 880 accounts compared |
| Trial Balance | 755 exact, 125 constant opening offsets, 0 non-constant offsets; every monthly offset total is RM1,456,480.37 DR |
| Trade Debtor List | 150/150 customer ledgers and 150/150 reconstructed legacy FIFO aging rows exact; total due RM507,697.72 |
| BS / IS / CoGM | 40 lines compared: 20 exact, 20 fully attributed, 0 unexplained, 0 nonzero report leaks |
| APPX / `fs_note` audit | 31 non-stock and 94 stock mappings require approval; 91 additional mismatches are zero-balance cosmetics |
| Read-only harness | 36 V1 gates pass; `ALL STAGES GREEN` |

The V1 gate is therefore satisfied: imported Jan–May movement is exact, every report difference is
named, and the opening correction set is complete.

## Trial Balance reconciliation

| Month end | Printed debit | Printed credit | Printed / ERP `DEBTOR` |
|---|---:|---:|---:|
| 31 Jan 2026 | RM13,982,350.19 | RM13,982,350.19 | RM534,531.47 |
| 28 Feb 2026 | RM14,529,026.66 | RM14,529,026.66 | RM561,710.82 |
| 31 Mar 2026 | RM15,171,186.06 | RM15,171,186.06 | RM466,791.00 |
| 30 Apr 2026 | RM15,876,445.88 | RM15,876,445.88 | RM578,661.95 |
| 31 May 2026 | RM16,408,437.78 | RM16,408,437.78 | RM507,697.72 |

All 125 differences are constant across the five month-ends. The 63 closing-stock accounts carry
RM829,605.22 of obsolete credit anchors in ERP while the printed TB is zero. The 62 opening-stock
accounts carry RM626,875.15 of printed debit openings while ERP has no anchors. Thus:

`RM829,605.22 + RM626,875.15 = RM1,456,480.37 DR`

There is no in-window movement difference, no nonzero unmatched chart account, and no changing
offset suggesting an OCR or posting error. `scan_only` on an `OS_*` row means absent from the ERP
report population, not absent from `account_codes`; all 62 target accounts already exist.

The stock family was selected by printed APPX notes 14-1/14-2/14-3 and 3-1/3-3/3-7, not by prefix
alone. For example, `CS_SD` is a trade creditor and is not part of this set.

## Trade Debtor List reconciliation

All 150 printed debtors resolve one-to-one to ERP customers. Every row agrees for 30-April
`BAL B/F`, legacy-semantic May `CURRENT` and `PAYMENT`, May net movement, 31-May `TOTAL DUE`,
and the independent 1-June checkpoint. Each path totals RM507,697.72.

The printed aging rules are now proven: May is current, April is one month, March is two months,
and the opening balance plus January/February is three months or older. Signed debtor documents
are carried by month and payments consume positive balances oldest-first. That reconstruction
matches all 150 scan rows exactly.

The current ERP presentation still has three V3 gaps:

- The scan omits 41 customers whose May activity closes at zero. Those rows explain the printed
  body/control differences without changing total due.
- The current General Statement debit/credit split has five named column differences. They total
  RM841.75 in each column and net to zero. The pinned fingerprint is
  `3a9168d26b25a45e8e0048e7758ccf16f95409253fc58c5cddd461eb1d68c61b`.
- Current invoice-linked aging has 11 named allocation-model differences. Their four bucket
  differences net to zero, and the pinned fingerprint is
  `4514569fc2c30814ef505e0737e26fc1c02cbf22a057110f5b8013ea6f0d9817`.

### Five current-column presentation differences

The amounts below are scan minus the current ERP report. The exact debtor close is unchanged.

| Account | Scan - current ERP CURRENT | Scan - current ERP PAYMENT | Evidence | Named cause |
|---|---:|---:|---|---|
| `GUI` | -RM540.00 | +RM540.00 | TDL p2 r7 | Legacy excludes wrong-bank-in RV078/05 and its reversing contra PBE066/05 from both columns; the GL report includes the equal credit/debit. |
| `MEEWOO-K` | -RM218.75 | +RM218.75 | TDL p2 r27 | Legacy nets May credit note THCN/26/13 out of CURRENT; the GL report puts its credit in PAYMENT. |
| `MYSHOP(KM)` | -RM6.85 | +RM6.85 | TDL p2 r41 | Legacy nets May credit note THCN/26/15 out of CURRENT; the GL report puts its credit in PAYMENT. |
| `MYSHOP-KM2` | -RM24.85 | +RM24.85 | TDL p3 r6 | Legacy nets May credit note THCN/26/16 out of CURRENT; the GL report puts its credit in PAYMENT. |
| `MYSHOP-SKT` | -RM51.30 | +RM51.30 | TDL p3 r12 | Legacy nets May credit note THCN/26/14 out of CURRENT; the GL report puts its credit in PAYMENT. |

### Eleven current-aging allocation differences

| Account | Current | 1 month | 2 months | 3 months+ | Evidence | Named cause |
|---|---:|---:|---:|---:|---|---|
| `GUI` | -RM0.15 | RM0.00 | RM0.00 | +RM0.15 | TDL p2 r7 | Legacy rolls signed debtor-ledger documents through the month buckets and applies receipts FIFO; ERP uses explicit invoice allocations and puts the remaining ledger bridge in 3 months+. |
| `GUI(3)` | +RM0.15 | RM0.00 | RM0.00 | -RM0.15 | TDL p2 r8 | Legacy rolls signed debtor-ledger documents through the month buckets and applies receipts FIFO; ERP uses explicit invoice allocations and puts the remaining ledger bridge in 3 months+. |
| `KLIAS` | -RM0.10 | RM0.00 | RM0.00 | +RM0.10 | TDL p2 r22 | Legacy rolls signed debtor-ledger documents through the month buckets and applies receipts FIFO; ERP uses explicit invoice allocations and puts the remaining ledger bridge in 3 months+. |
| `LAI` | RM0.00 | RM0.00 | +RM0.36 | -RM0.36 | TDL p2 r23 | Legacy rolls signed debtor-ledger documents through the month buckets and applies receipts FIFO; ERP uses explicit invoice allocations and puts the remaining ledger bridge in 3 months+. |
| `MEEWOO-K` | -RM218.75 | +RM218.75 | RM0.00 | RM0.00 | TDL p2 r27 | Legacy puts May credit note THCN/26/13 in CURRENT; ERP applies it to its linked April invoice, reducing 1 month instead. |
| `MYSHOP(1)` | RM0.00 | RM0.00 | +RM1.80 | -RM1.80 | TDL p2 r33 | Legacy rolls signed debtor-ledger documents through the month buckets and applies receipts FIFO; ERP uses explicit invoice allocations and puts the remaining ledger bridge in 3 months+. |
| `MYSHOP(K2)` | RM0.00 | -RM60.00 | RM0.00 | +RM60.00 | TDL p2 r38 | Legacy carries the April -60.00 credit in 1 month; ERP has no positive invoice outstanding and puts the ledger bridge in 3 months+. |
| `MYSHOP(KM)` | RM0.00 | RM0.00 | -RM8.50 | +RM8.50 | TDL p2 r41 | Legacy rolls signed debtor-ledger documents through the month buckets and applies receipts FIFO; ERP uses explicit invoice allocations and puts the remaining ledger bridge in 3 months+. |
| `MYSHOP(P)` | RM0.00 | RM0.00 | +RM54.15 | -RM54.15 | TDL p2 r45 | Legacy FIFO clears the older 54.15 first and leaves March debt in 2 months; ERP's explicit payment allocation clears March and leaves the older invoice in 3 months+. |
| `MYSHOP-P4` | RM0.00 | RM0.00 | +RM984.60 | -RM984.60 | TDL p3 r10 | Legacy FIFO clears January first and leaves 984.60 of March debt in 2 months; ERP's explicit payment allocation clears March and leaves January in 3 months+. |
| `SENANG` | -RM870.00 | RM0.00 | RM0.00 | +RM870.00 | TDL p3 r25 | ERP invoice aging includes unjournaled May invoice 2004882 (870.00), then offsets it through the oldest ledger bridge; the legacy ledger-based scan has only one 870.00 current balance. |

The scan's aggregate `CURRENT` control is itself defective: RM316,376.89 printed versus the
complete 191-row legacy-semantic RM447,122.50. It is preserved as source evidence, not silently
forced to reconcile. The bonus three-creditor page is internally checked but supplier/AP parity is
outside this project.

## May Balance Sheet, Income Statement, and CoGM reconciliation

The comparison reproduces the three current report engines query-for-query. Twenty of 40 lines are
already exact. Every other line belongs to one of three proven causes:

1. the 63 obsolete `CS_*` anchors and 62 missing `OS_*` anchors;
2. the six closing-inventory lines that legacy injects at report level, even though every monthly
   TB prints zero stock movement; or
3. the named APPX / `fs_note` classification set.

| Report line | Note | Scan | Current ERP | Attribution |
|---|---|---:|---:|---|
| BS L2 — INVENTORIES (FINISHED GOODS) | `14-1` | RM188,979.60 | -RM408,919.39 | superseded CS anchor plus missing closing-stock injection |
| BS L3 — INVENTORIES (CHEMICAL & RAW METETIAL) | `14-2` | RM336,909.82 | -RM420,006.23 | superseded CS anchor plus missing closing-stock injection |
| BS L4 — INVENTORIES (PACKING MATERIAL) | `14-3` | RM182,194.43 | -RM679.60 | superseded CS anchor plus missing closing-stock injection |
| BS L5 — TRADE RECEIVABLES | `22` | RM507,697.72 | RM482,000.90 | named fs_note mapping set |
| BS L6 — NON-TRADE RECEIVABLES,DEPOSIT & PREPAYMENT | `8` | RM108,003.04 | RM89,587.44 | named fs_note mapping set |
| BS L12 — ACCRUALS | `1` | RM229,123.32 | RM205,684.78 | named fs_note mapping set |
| BS L13 — OTHER CREDITORS | `10` | RM7,458.85 | -RM195,815.41 | named fs_note mapping set |
| BS L16 — TERM LOANS | `11` | RM71,576.75 | RM254,177.13 | named fs_note mapping set |
| BS L23 — PROFIT FOR THE FINANCIAL YEAR | `DN` | RM284,825.01 | RM203,616.31 | opening/closing-stock profit cross-reference |
| IS L2 — OPENING INVENTORIES | `3-1` | RM84,393.20 | RM0.00 | OS anchor absent and engine ignores anchors |
| IS L3 — COST OF GOODS MANUFACTURED | `CH` | RM2,479,030.27 | RM2,145,322.61 | CoGM opening/closing stock plus salary mapping |
| IS L5 — LESS:CLOSING INVENTORIES | `14-1` | RM188,979.60 | not rendered | closing stock injected by legacy report only |
| IS L12 — EXPENSES (SALARIES AND WAGES) | `5` | RM675,380.45 | RM985,710.41 | named fs_note mapping set |
| IS L20 — PROFIT FOR THE FINANCIAL YEAR | — | RM284,825.01 | RM203,616.31 | opening/closing-stock profit cross-reference |
| COGM L1 — OPENING INVENTORIES | `3-3` | RM348,501.50 | RM0.00 | OS anchor absent and engine ignores anchors |
| COGM L6 — LESS:CLOSING INVENTORIES,RAW MATERIALS | `14-2` | RM336,909.82 | not rendered | closing stock injected by legacy report only |
| COGM L8 — OPENING INVENTORIES/PACKING MATERIAL | `3-7` | RM193,980.45 | RM0.00 | OS anchor absent and engine ignores anchors |
| COGM L11 — LESS:CLOSING INVENTORIES (PACKING MATERIAL) | `14-3` | RM182,194.43 | not rendered | closing stock injected by legacy report only |
| COGM L13 — SALARIES AND WAGES (FACTORY WORKER) | `5-1` | RM763,126.23 | RM452,796.27 | named fs_note mapping set |
| COGM L14 — TOTAL COST OF GOODS MANUFACTURED | — | RM2,479,030.27 | RM2,145,322.61 | CoGM opening/closing stock plus salary mapping |

The controlling identities all close:

- Printed profit RM284,825.01 minus current ERP profit RM203,616.31 is RM81,208.70, exactly
  closing inventories RM708,083.85 minus opening inventories RM626,875.15.
- Printed CoGM RM2,479,030.27 minus ERP RM2,145,322.61 is RM333,707.66, exactly the
  opening-minus-closing stock effect RM23,377.70 plus the RM310,329.96 salary reclassification.
- The current ERP Balance Sheet is short by exactly RM1,456,480.37, the TB opening residue.
- Every nonzero 31-May balance reaches an active BS, IS, or CoGM note; there are no mapping leaks.

This settles the stock-roll question. The legacy TB holds constant opening inventory and no closing
stock movement. The six May closing-stock statement lines are sourced outside the TB at report
level. Their values are finished goods RM188,979.60, raw materials RM336,909.82, and packing
materials RM182,194.43.

## V2 opening-correction set

The proposed anchor mutation is exact and uses explicit zero fences, matching the existing import
discipline.

| Family / printed APPX | Accounts | Current anchors | Printed target anchors | Required change |
|---|---:|---:|---:|---:|
| CS / 14-1 | 8 | RM131,705.70 CR | RM0.00 | RM131,705.70 DR |
| CS / 14-2 | 11 | RM511,650.28 CR | RM0.00 | RM511,650.28 DR |
| CS / 14-3 | 44 | RM186,249.24 CR | RM0.00 | RM186,249.24 DR |
| **CS total** | **63** | **RM829,605.22 CR** | **RM0.00** | **RM829,605.22 DR** |
| OS / 3-1 | 8 | RM0.00 | RM84,393.20 DR | RM84,393.20 DR |
| OS / 3-3 | 10 | RM0.00 | RM348,501.50 DR | RM348,501.50 DR |
| OS / 3-7 | 44 | RM0.00 | RM193,980.45 DR | RM193,980.45 DR |
| **OS total** | **62** | **RM0.00** | **RM626,875.15 DR** | **RM626,875.15 DR** |
| **Combined correction** | **125** |  |  | **RM1,456,480.37 DR** |

After the package, the January anchor population projects from 580 to 642 rows: 290 nonzero and
352 explicit zero fences, with debit and credit both RM13,180,681.18. The V2 migration must assert
those counts and totals, plus every current and target row, before changing anything.

A read-only development check also confirms that **none of these 125 stock accounts has a
2026-06-01 checkpoint anchor**. The corrected January anchors therefore remain the latest stock
anchors through June; the existing 1,571 June checkpoints are outside this set and remain
untouched.

### Complete per-account anchor table

The `fs_note` column also carries all 94 stock-family mapping changes. An arrow means the current
effective note differs from the printed APPX target; `unchanged` means no mapping mutation for that
account. These 94 mappings overlap the 125 anchor rows and are not a second stock population.

| Account | Current 01-Jan anchor | Printed target anchor | Required change | ERP effective `fs_note` → printed APPX | May TB evidence |
|---|---:|---:|---:|---|---|
| `CS_B21` | RM4,306.25 CR | RM0.00 | RM4,306.25 DR | `14-1` → `14-3` | May TB p5 r31 |
| `CS_B23` | RM2,887.50 CR | RM0.00 | RM2,887.50 DR | `14-1` → `14-3` | May TB p5 r33 |
| `CS_B24` | RM3,162.50 CR | RM0.00 | RM3,162.50 DR | `14-1` → `14-3` | May TB p5 r35 |
| `CS_B31` | RM712.50 CR | RM0.00 | RM712.50 DR | `14-1` → `14-3` | May TB p5 r37 |
| `CS_B32` | RM11,550.00 CR | RM0.00 | RM11,550.00 DR | `14-1` → `14-3` | May TB p5 r38 |
| `CS_B33` | RM6,542.80 CR | RM0.00 | RM6,542.80 DR | `14-1` → `14-3` | May TB p5 r39 |
| `CS_B34` | RM1,707.56 CR | RM0.00 | RM1,707.56 DR | `14-1` → `14-3` | May TB p5 r40 |
| `CS_B36` | RM2,375.00 CR | RM0.00 | RM2,375.00 DR | `14-1` → `14-3` | May TB p5 r42 |
| `CS_B37` | RM14,941.30 CR | RM0.00 | RM14,941.30 DR | `14-1` → `14-3` | May TB p5 r43 |
| `CS_B3UD` | RM16,978.50 CR | RM0.00 | RM16,978.50 DR | `14-1` (unchanged) | May TB p5 r44 |
| `CS_B5KG1` | RM425.00 CR | RM0.00 | RM425.00 DR | `14-1` → `14-3` | May TB p5 r45 |
| `CS_B600G` | RM48,873.00 CR | RM0.00 | RM48,873.00 DR | `14-1` (unchanged) | May TB p5 r46 |
| `CS_BBER1` | RM50,877.50 CR | RM0.00 | RM50,877.50 DR | `14-2` (unchanged) | May TB p6 r2 |
| `CS_BBER2` | RM162,032.50 CR | RM0.00 | RM162,032.50 DR | `14-2` (unchanged) | May TB p6 r3 |
| `CS_BBER4` | RM70,735.00 CR | RM0.00 | RM70,735.00 DR | `14-2` (unchanged) | May TB p6 r5 |
| `CS_BBER5` | RM70,852.50 CR | RM0.00 | RM70,852.50 DR | `14-2` (unchanged) | May TB p6 r6 |
| `CS_BJAG1` | RM64,750.00 CR | RM0.00 | RM64,750.00 DR | `14-2` (unchanged) | May TB p6 r8 |
| `CS_BLS1` | RM43,973.70 CR | RM0.00 | RM43,973.70 DR | `14-1` → `14-2` | May TB p6 r13 |
| `CS_BNL3` | RM2,015.00 CR | RM0.00 | RM2,015.00 DR | `14-1` (unchanged) | May TB p6 r15 |
| `CS_BNL5` | RM585.20 CR | RM0.00 | RM585.20 DR | `14-1` (unchanged) | May TB p6 r16 |
| `CS_BP1` | RM2,018.75 CR | RM0.00 | RM2,018.75 DR | `14-1` → `14-3` | May TB p6 r17 |
| `CS_BP2` | RM10,696.40 CR | RM0.00 | RM10,696.40 DR | `14-1` → `14-3` | May TB p6 r18 |
| `CS_BP600` | RM883.40 CR | RM0.00 | RM883.40 DR | `14-1` → `14-3` | May TB p5 r34 |
| `CS_BPB1` | RM4,356.25 CR | RM0.00 | RM4,356.25 DR | `14-1` → `14-3` | May TB p6 r20 |
| `CS_BPB2` | RM234.60 CR | RM0.00 | RM234.60 DR | `14-1` → `14-3` | May TB p6 r21 |
| `CS_BPT1` | RM3,740.00 CR | RM0.00 | RM3,740.00 DR | `14-1` → `14-3` | May TB p6 r22 |
| `CS_BSDM1` | RM758.73 CR | RM0.00 | RM758.73 DR | `14-2` (unchanged) | May TB p6 r25 |
| `CS_BTAP1` | RM579.15 CR | RM0.00 | RM579.15 DR | `14-3` (unchanged) | May TB p6 r27 |
| `CS_BTM1` | RM5,275.00 CR | RM0.00 | RM5,275.00 DR | `14-1` → `14-3` | May TB p6 r31 |
| `CS_BUP1` | RM2,493.75 CR | RM0.00 | RM2,493.75 DR | `14-1` → `14-3` | May TB p6 r33 |
| `CS_M2` | RM2,381.25 CR | RM0.00 | RM2,381.25 DR | `14-1` → `14-3` | May TB p6 r37 |
| `CS_M21` | RM3,836.25 CR | RM0.00 | RM3,836.25 DR | `14-1` → `14-3` | May TB p6 r38 |
| `CS_M25` | RM1,061.20 CR | RM0.00 | RM1,061.20 DR | `14-1` → `14-3` | May TB p6 r42 |
| `CS_M2UD` | RM5,586.00 CR | RM0.00 | RM5,586.00 DR | `14-1` (unchanged) | May TB p7 r1 |
| `CS_M31` | RM3,255.00 CR | RM0.00 | RM3,255.00 DR | `14-1` → `14-3` | May TB p7 r5 |
| `CS_M32` | RM348.80 CR | RM0.00 | RM348.80 DR | `14-1` → `14-3` | May TB p7 r6 |
| `CS_M33` | RM5,040.00 CR | RM0.00 | RM5,040.00 DR | `14-1` → `14-3` | May TB p7 r7 |
| `CS_M39` | RM575.00 CR | RM0.00 | RM575.00 DR | `14-1` → `14-3` | May TB p7 r13 |
| `CS_M3UD` | RM15,283.50 CR | RM0.00 | RM15,283.50 DR | `14-1` (unchanged) | May TB p7 r14 |
| `CS_M41` | RM1,375.00 CR | RM0.00 | RM1,375.00 DR | `14-1` → `14-3` | May TB p7 r16 |
| `CS_M42` | RM2,709.60 CR | RM0.00 | RM2,709.60 DR | `14-1` → `14-3` | May TB p7 r17 |
| `CS_M43` | RM9,490.26 CR | RM0.00 | RM9,490.26 DR | `14-1` → `14-3` | May TB p7 r18 |
| `CS_M45` | RM7,783.90 CR | RM0.00 | RM7,783.90 DR | `14-1` → `14-3` | May TB p7 r20 |
| `CS_M46` | RM2,256.25 CR | RM0.00 | RM2,256.25 DR | `14-1` → `14-3` | May TB p7 r21 |
| `CS_M47` | RM2,493.75 CR | RM0.00 | RM2,493.75 DR | `14-1` → `14-3` | May TB p7 r22 |
| `CS_M48` | RM3,590.92 CR | RM0.00 | RM3,590.92 DR | `14-1` → `14-3` | May TB p7 r23 |
| `CS_M49` | RM2,612.50 CR | RM0.00 | RM2,612.50 DR | `14-1` → `14-3` | May TB p7 r24 |
| `CS_M50` | RM15,939.00 CR | RM0.00 | RM15,939.00 DR | `14-1` → `14-3` | May TB p7 r25 |
| `CS_M51` | RM7,392.00 CR | RM0.00 | RM7,392.00 DR | `14-1` → `14-3` | May TB p7 r26 |
| `CS_M52` | RM7,656.00 CR | RM0.00 | RM7,656.00 DR | `14-1` → `14-3` | May TB p7 r27 |
| `CS_MGRM1` | RM545.75 CR | RM0.00 | RM545.75 DR | `14-1` → `14-2` | May TB p7 r31 |
| `CS_MK5` | RM3,093.50 CR | RM0.00 | RM3,093.50 DR | `14-1` (unchanged) | May TB p7 r3 |
| `CS_ML1` | RM8,707.60 CR | RM0.00 | RM8,707.60 DR | `14-1` → `14-3` | May TB p7 r33 |
| `CS_MM1` | RM9,410.00 CR | RM0.00 | RM9,410.00 DR | `14-1` → `14-3` | May TB p7 r35 |
| `CS_MM2` | RM132.00 CR | RM0.00 | RM132.00 DR | `14-1` → `14-3` | May TB p7 r36 |
| `CS_MNL1` | RM39,291.00 CR | RM0.00 | RM39,291.00 DR | `14-1` (unchanged) | May TB p7 r39 |
| `CS_MP1` | RM1,872.30 CR | RM0.00 | RM1,872.30 DR | `14-1` → `14-3` | May TB p7 r40 |
| `CS_MP2` | RM5,280.00 CR | RM0.00 | RM5,280.00 DR | `14-1` → `14-3` | May TB p7 r41 |
| `CS_MSOD1` | RM348.48 CR | RM0.00 | RM348.48 DR | `14-1` → `14-2` | May TB p7 r42 |
| `CS_MT1` | RM2,062.50 CR | RM0.00 | RM2,062.50 DR | `14-1` → `14-3` | May TB p7 r44 |
| `CS_MTAP1` | RM100.45 CR | RM0.00 | RM100.45 DR | `14-3` (unchanged) | May TB p7 r45 |
| `CS_MTEP1` | RM26,456.76 CR | RM0.00 | RM26,456.76 DR | `14-1` → `14-2` | May TB p7 r46 |
| `CS_MTEP3` | RM20,319.36 CR | RM0.00 | RM20,319.36 DR | `14-1` → `14-2` | May TB p8 r2 |
| `OS_B21` | RM0.00 | RM4,306.25 DR | RM4,306.25 DR | `3-1` → `3-7` | May TB p13 r9 |
| `OS_B23` | RM0.00 | RM2,887.50 DR | RM2,887.50 DR | `3-1` → `3-7` | May TB p13 r11 |
| `OS_B24` | RM0.00 | RM3,162.50 DR | RM3,162.50 DR | `3-1` → `3-7` | May TB p13 r12 |
| `OS_B31` | RM0.00 | RM712.50 DR | RM712.50 DR | `3-1` → `3-7` | May TB p13 r15 |
| `OS_B32` | RM0.00 | RM11,275.00 DR | RM11,275.00 DR | `3-1` → `3-7` | May TB p13 r16 |
| `OS_B33` | RM0.00 | RM7,510.80 DR | RM7,510.80 DR | `3-1` → `3-7` | May TB p13 r17 |
| `OS_B34` | RM0.00 | RM1,939.00 DR | RM1,939.00 DR | `3-1` → `3-7` | May TB p13 r18 |
| `OS_B36` | RM0.00 | RM2,375.00 DR | RM2,375.00 DR | `3-1` → `3-7` | May TB p13 r20 |
| `OS_B37` | RM0.00 | RM16,145.60 DR | RM16,145.60 DR | `3-1` → `3-7` | May TB p13 r21 |
| `OS_B3UD` | RM0.00 | RM18,463.50 DR | RM18,463.50 DR | `3-1` (unchanged) | May TB p13 r22 |
| `OS_B5KG1` | RM0.00 | RM743.75 DR | RM743.75 DR | `3-1` → `3-7` | May TB p13 r23 |
| `OS_B600G` | RM0.00 | RM12,276.00 DR | RM12,276.00 DR | `3-1` (unchanged) | May TB p13 r24 |
| `OS_BBER2` | RM0.00 | RM22,442.50 DR | RM22,442.50 DR | `3-3` (unchanged) | May TB p13 r27 |
| `OS_BBER4` | RM0.00 | RM122,082.50 DR | RM122,082.50 DR | `3-3` (unchanged) | May TB p13 r29 |
| `OS_BBER5` | RM0.00 | RM113,975.00 DR | RM113,975.00 DR | `3-3` (unchanged) | May TB p13 r30 |
| `OS_BJAG4` | RM0.00 | RM11,872.00 DR | RM11,872.00 DR | `3-3` (unchanged) | May TB p13 r35 |
| `OS_BLS1` | RM0.00 | RM52,180.00 DR | RM52,180.00 DR | `3-1` → `3-3` | May TB p13 r37 |
| `OS_BNL3` | RM0.00 | RM573.50 DR | RM573.50 DR | `3-1` (unchanged) | May TB p13 r39 |
| `OS_BNL5` | RM0.00 | RM3,059.00 DR | RM3,059.00 DR | `3-1` (unchanged) | May TB p13 r40 |
| `OS_BP1` | RM0.00 | RM2,137.50 DR | RM2,137.50 DR | `3-1` → `3-7` | May TB p13 r41 |
| `OS_BP2` | RM0.00 | RM6,375.60 DR | RM6,375.60 DR | `3-1` → `3-7` | May TB p13 r42 |
| `OS_BP600` | RM0.00 | RM883.40 DR | RM883.40 DR | `3-1` → `3-7` | May TB p13 r13 |
| `OS_BPB1` | RM0.00 | RM5,100.00 DR | RM5,100.00 DR | `3-1` → `3-7` | May TB p13 r44 |
| `OS_BPB2` | RM0.00 | RM234.60 DR | RM234.60 DR | `3-1` → `3-7` | May TB p13 r45 |
| `OS_BPT1` | RM0.00 | RM4,090.63 DR | RM4,090.63 DR | `3-1` → `3-7` | May TB p13 r46 |
| `OS_BSDM1` | RM0.00 | RM948.75 DR | RM948.75 DR | `3-3` (unchanged) | May TB p14 r3 |
| `OS_BTAP1` | RM0.00 | RM1,384.50 DR | RM1,384.50 DR | `3-7` (unchanged) | May TB p14 r5 |
| `OS_BTM1` | RM0.00 | RM5,275.00 DR | RM5,275.00 DR | `3-1` → `3-7` | May TB p14 r10 |
| `OS_BUP1` | RM0.00 | RM2,493.75 DR | RM2,493.75 DR | `3-1` → `3-7` | May TB p14 r12 |
| `OS_M2` | RM0.00 | RM2,381.25 DR | RM2,381.25 DR | `3-1` → `3-7` | May TB p14 r16 |
| `OS_M21` | RM0.00 | RM3,836.25 DR | RM3,836.25 DR | `3-1` → `3-7` | May TB p14 r17 |
| `OS_M25` | RM0.00 | RM1,061.20 DR | RM1,061.20 DR | `3-1` → `3-7` | May TB p14 r21 |
| `OS_M2UD` | RM0.00 | RM3,763.20 DR | RM3,763.20 DR | `3-1` (unchanged) | May TB p14 r26 |
| `OS_M31` | RM0.00 | RM3,255.00 DR | RM3,255.00 DR | `3-1` → `3-7` | May TB p14 r30 |
| `OS_M32` | RM0.00 | RM348.80 DR | RM348.80 DR | `3-1` → `3-7` | May TB p14 r31 |
| `OS_M33` | RM0.00 | RM5,775.00 DR | RM5,775.00 DR | `3-1` → `3-7` | May TB p14 r32 |
| `OS_M39` | RM0.00 | RM575.00 DR | RM575.00 DR | `3-1` → `3-7` | May TB p14 r38 |
| `OS_M3UD` | RM0.00 | RM5,566.00 DR | RM5,566.00 DR | `3-1` (unchanged) | May TB p14 r39 |
| `OS_M41` | RM0.00 | RM1,650.00 DR | RM1,650.00 DR | `3-1` → `3-7` | May TB p14 r41 |
| `OS_M42` | RM0.00 | RM2,709.60 DR | RM2,709.60 DR | `3-1` → `3-7` | May TB p14 r42 |
| `OS_M43` | RM0.00 | RM9,490.26 DR | RM9,490.26 DR | `3-1` → `3-7` | May TB p14 r43 |
| `OS_M45` | RM0.00 | RM7,783.90 DR | RM7,783.90 DR | `3-1` → `3-7` | May TB p14 r45 |
| `OS_M46` | RM0.00 | RM2,256.25 DR | RM2,256.25 DR | `3-1` → `3-7` | May TB p14 r46 |
| `OS_M47` | RM0.00 | RM2,493.75 DR | RM2,493.75 DR | `3-1` → `3-7` | May TB p15 r1 |
| `OS_M48` | RM0.00 | RM3,590.92 DR | RM3,590.92 DR | `3-1` → `3-7` | May TB p15 r2 |
| `OS_M49` | RM0.00 | RM2,612.50 DR | RM2,612.50 DR | `3-1` → `3-7` | May TB p15 r3 |
| `OS_M50` | RM0.00 | RM15,939.00 DR | RM15,939.00 DR | `3-1` → `3-7` | May TB p15 r4 |
| `OS_M51` | RM0.00 | RM8,844.00 DR | RM8,844.00 DR | `3-1` → `3-7` | May TB p15 r5 |
| `OS_M52` | RM0.00 | RM9,372.00 DR | RM9,372.00 DR | `3-1` → `3-7` | May TB p15 r6 |
| `OS_MGRM1` | RM0.00 | RM195.47 DR | RM195.47 DR | `3-1` → `3-3` | May TB p15 r10 |
| `OS_MK5` | RM0.00 | RM4,600.00 DR | RM4,600.00 DR | `3-1` (unchanged) | May TB p14 r28 |
| `OS_ML1` | RM0.00 | RM11,121.44 DR | RM11,121.44 DR | `3-1` → `3-7` | May TB p15 r12 |
| `OS_MM1` | RM0.00 | RM9,960.00 DR | RM9,960.00 DR | `3-1` → `3-7` | May TB p15 r14 |
| `OS_MM2` | RM0.00 | RM132.00 DR | RM132.00 DR | `3-1` → `3-7` | May TB p15 r15 |
| `OS_MNL1` | RM0.00 | RM36,092.00 DR | RM36,092.00 DR | `3-1` (unchanged) | May TB p15 r17 |
| `OS_MP1` | RM0.00 | RM1,872.30 DR | RM1,872.30 DR | `3-1` → `3-7` | May TB p15 r19 |
| `OS_MP2` | RM0.00 | RM5,720.00 DR | RM5,720.00 DR | `3-1` → `3-7` | May TB p15 r20 |
| `OS_MSOD1` | RM0.00 | RM660.96 DR | RM660.96 DR | `3-1` → `3-3` | May TB p15 r21 |
| `OS_MT1` | RM0.00 | RM2,062.50 DR | RM2,062.50 DR | `3-1` → `3-7` | May TB p15 r23 |
| `OS_MTAP1` | RM0.00 | RM104.65 DR | RM104.65 DR | `3-7` (unchanged) | May TB p15 r24 |
| `OS_MTEP1` | RM0.00 | RM16,034.40 DR | RM16,034.40 DR | `3-1` → `3-3` | May TB p15 r25 |
| `OS_MTEP3` | RM0.00 | RM8,109.92 DR | RM8,109.92 DR | `3-1` → `3-3` | May TB p15 r27 |

## V2 APPX / `fs_note` correction set

The whole-chart audit found 216 APPX differences:

- 31 nonzero, non-stock mappings listed below;
- 94 nonzero stock mappings already marked by arrows in the opening table: 47 closing-stock and
  47 corresponding opening-stock accounts; and
- 91 zero-balance cosmetic mappings that do not affect any report and are not proposed for V2.

The 125 actionable mapping rows have fingerprint
`c83f4ef40c85ea3716fdecdace37dbfffbc53f51d23d8b2da02fc006fd8d2088`.
Together with the anchor set, the package affects 156 unique accounts because 94 stock accounts
appear in both change types.

| Current effective note | Printed target | Accounts | Relevant signed amount |
|---:|---:|---:|---:|
| 22 | 8 | 1 | RM25,696.82 CR |
| 10 | 8 | 2 | RM44,112.42 DR |
| 10 | 11 | 1 | RM182,600.38 DR |
| 10 | 1 | 2 | RM23,438.54 CR |
| 5 | 5-1 | 24 | RM323,038.45 DR |
| 5-1 | 5 | 1 | RM12,708.49 DR |
| 14-1 | 14-2 | 5 | RM91,644.05 CR anchors |
| 14-1 | 14-3 | 42 | RM185,569.64 CR anchors |
| 3-1 | 3-3 | 5 | RM77,180.75 DR openings |
| 3-1 | 3-7 | 42 | RM192,491.30 DR openings |

The 25 payroll moves transfer a net RM310,329.96 from administrative salaries to factory-worker
CoGM. The other six non-stock rows put the impairment allowance in note 8, the debit balances
`CL_GF`/`CL_GT` in note 8, `CL_ABB` in term loans, and `OC_CMK`/`OC_MIL` in accruals, exactly as
printed.

### Complete 31-account non-stock mapping table

| Account | May balance | ERP effective `fs_note` → printed APPX target | May TB evidence |
|---|---:|---|---|
| `BS_IL` | RM13,673.85 DR | `5` → `5-1` | May TB p1 r44 |
| `BS_SM` | RM32,831.72 DR | `5` → `5-1` | May TB p2 r2 |
| `CL_ABB` | RM182,600.38 DR | `10` → `11` | May TB p3 r24 |
| `CL_AFI` | RM25,696.82 CR | `22` → `8` | May TB p20 r13 |
| `CL_GF` | RM31,696.82 DR | `10` → `8` | May TB p3 r28 |
| `CL_GT` | RM12,415.60 DR | `10` → `8` | May TB p3 r25 |
| `MBE_IL` | RM6,701.00 DR | `5` → `5-1` | May TB p10 r8 |
| `MBE_M` | RM7,823.00 DR | `5` → `5-1` | May TB p10 r11 |
| `MBE_SM` | RM8,636.00 DR | `5` → `5-1` | May TB p10 r14 |
| `MBE_TS` | RM1,004.00 DR | `5` → `5-1` | May TB p10 r15 |
| `MBL_IL` | RM511.25 DR | `5` → `5-1` | May TB p10 r22 |
| `MBL_M` | RM366.68 DR | `5` → `5-1` | May TB p10 r25 |
| `MBL_SM` | RM622.66 DR | `5` → `5-1` | May TB p10 r28 |
| `MBL_TS` | RM76.54 DR | `5` → `5-1` | May TB p10 r29 |
| `MBS_ILO` | RM28,294.51 DR | `5` → `5-1` | May TB p11 r21 |
| `MBS_M` | RM167,464.57 DR | `5` → `5-1` | May TB p11 r24 |
| `MBS_SMO` | RM10,615.94 DR | `5` → `5-1` | May TB p11 r27 |
| `MBS_TS` | RM8,900.60 DR | `5` → `5-1` | May TB p11 r28 |
| `MBSC_IL` | RM899.40 DR | `5` → `5-1` | May TB p10 r41 |
| `MBSC_M` | RM2,115.05 DR | `5` → `5-1` | May TB p10 r44 |
| `MBSC_SM` | RM1,021.70 DR | `5` → `5-1` | May TB p11 r1 |
| `MBSC_TS` | RM154.00 DR | `5` → `5-1` | May TB p11 r2 |
| `MBSIP_IL` | RM102.80 DR | `5` → `5-1` | May TB p11 r7 |
| `MBSIP_M` | RM146.75 DR | `5` → `5-1` | May TB p11 r11 |
| `MBSIP_SM` | RM84.40 DR | `5` → `5-1` | May TB p11 r6 |
| `MBSIP_TS` | RM17.60 DR | `5` → `5-1` | May TB p11 r12 |
| `MBSM_K` | RM12,708.49 DR | `5-1` → `5` | May TB p11 r15 |
| `MS_IL` | RM8,288.59 DR | `5` → `5-1` | May TB p12 r2 |
| `MS_SM` | RM22,685.84 DR | `5` → `5-1` | May TB p12 r5 |
| `OC_CMK` | RM10,200.00 DR | `10` → `1` | May TB p12 r18 |
| `OC_MIL` | RM33,638.54 CR | `10` → `1` | May TB p12 r19 |

`ERP effective fs_note` is intentional wording: an account may inherit its current note from an
ancestor. V2 must set or otherwise guard the direct account classification so that the effective
target is stable.

## Exact V2 sign-off package

The settled choices are not being reopened: use 2026-01-01 anchors rather than a journal, treat the
printed TB as truth, set the 63 CS targets to zero, and keep every `IMP` row immutable.

The approved development package was:

1. Guardedly update the 63 existing CS anchors to explicit RM0.00 and insert the 62 OS anchors in
   the table above. All 62 OS accounts already exist; no new account code is needed. Abort if any
   of the 125 accounts has acquired a 2026-06-01 anchor, preserving the 1,571 checkpoints.
2. Guardedly apply the 31 non-stock plus 94 stock `fs_note` targets above.
3. Correct financial-statement note 3-1 from the `cogm` report section to
   `income_statement` while retaining category `cogs`. This is the simplest accounting-aligned
   routing: finished-goods opening stock appears on the IS, not in the legacy CoGM.
4. Teach only the opening-stock report semantics to read anchors. For report year `YYYY`, add
   each targeted account's anchor with `as_of_date = YYYY-01-01` exactly once to the existing
   posted YTD movement in `[YYYY-01-01, period_end]`; do not substitute a later-dated anchor.
   The IS and Balance Sheet Current Year Profit calculation include notes 3-1, 3-3, and 3-7;
   CoGM includes 3-3 and 3-7. Do not generically add all P&L anchors or count journal movement
   twice.
5. Ship the database and engine work first on development with guarded preconditions, exact
   fingerprints, an idempotent no-op rerun, and post-change regression gates. Production remains a
   separate approval after development proof.
6. During V2, transition the read-only harness from its deliberately pre-V2 baseline to final-state
   expectations, update the bilingual report-source guide and accounting docs, and add the required
   user-visible changelog entry.

The verified phase boundary is:

| State | TB opening residue | BS API balance difference | Legacy-format net-assets / financed-by total | Profit |
|---|---:|---:|---:|---:|
| Current ERP baseline | RM1,456,480.37 DR missing | Assets short RM1,456,480.37 | Not comparable while unbalanced | RM203,616.31 |
| Anchor rows changed, old engine unchanged | RM0.00 | RM626,875.15 short | Not valid while unbalanced | RM203,616.31 |
| **V2 with narrow anchor rendering** | **RM0.00** | **RM0.00** | **RM5,389,607.26** | **-RM423,258.84** |
| **V3 with May closing stock** | **RM0.00** | **RM0.00** | **RM6,097,691.11** | **RM284,825.01** |

RM5,389,607.26 is the legacy-format net-assets / financed-by total, not the API's raw
`total_assets` field. It equals the printed RM6,097,691.11 less the still-deferred closing stock
RM708,083.85.

The recommended boundary is to keep monthly closing-stock architecture in V3, as the plan
currently assigns it. Under that boundary V2 makes the books balance and closes the opening gap;
V3 supplies the user-managed monthly closing-stock source and reaches full May statement parity.
Expanding V2 to reach RM6,097,691.11 would first require a separate choice between structured
stock-valuation entries and report-level injection.

Expected post-V2 evidence, before V3 closing stock, is 880/880 TB accounts exact with zero offsets,
unchanged `DEBTOR` and debtor-list proofs, no actionable APPX mismatches, a zero BS difference,
and 30/40 exact statement lines. The remaining ten lines are only the six deferred closing-stock
lines plus their two profit and two CoGM cross-totals. Jan–June movement and the frozen June
ledgers must remain unchanged; TB/BS levels legitimately change.

### Development execution result — 20 Jul 2026

The package above was applied exactly through
[`2026-07-20_legacy_report_v2_opening_stock.sql`](../../dev/migrations/2026-07-20_legacy_report_v2_opening_stock.sql).
It first passed a fresh-clone rehearsal and no-op rerun, then the same two passes on development:
fresh **63 CS updates / 62 OS inserts / 125 mappings / one note update**; final rerun
**0 / 0 / 0 / 0**. Production was not accessed or modified.

Final evidence:

- January anchors: 642 total, 290 nonzero, 352 zero, 230 debit, 60 credit;
  DR = CR **RM13,180,681.18**.
- Trial Balance: **880/880 exact** for every January–May scan and zero global offset each month.
- APPX: all 156 approved accounts resolve to their exact target; zero actionable mismatches remain
  (91 all-zero cosmetic rows remain explicitly outside V2).
- May statements: **30/40 exact**; the ten remaining rows are exactly the six deferred V3 closing
  values and four profit/CoGM cross-totals. Profit is **-RM423,258.84**, CoGM is
  **RM2,998,134.52**, and legacy-format net assets = financed by = **RM5,389,607.26**.
- `IMP` remains 3,863 headers / 10,068 lines / DR = CR RM13,503,516.15. All 1,571 June
  checkpoint equalities and the frozen 1,030-line five-ledger movement remain exact. June TB is now
  DR = CR RM17,379,828.52; June BS is balanced at raw assets/liabilities-plus-equity
  RM8,368,289.50 and legacy-format net assets/financed by RM5,353,125.52. These are the approved
  opening/mapping level changes; journal movement did not change.
- The actual report handlers were invoked directly against development and returned the exact May
  V2 profit/CoGM totals and a zero accounting-cents BS difference. The bilingual guide and schema,
  mapping, progress, import-handoff, code-analysis and changelog documentation were advanced to the
  same boundary.

## Standing verification and audit artifacts

With the development database running as `tienhock_dev_db`, run from the repository root:

```powershell
node dev/import/legacy-report-fixtures/validate-fixtures.mjs
node dev/import/legacy-report-fixtures/verify-legacy-reports.mjs
```

The first command must end with `ALL CHECKS PASSED`. The transitioned V1/V2 harness must end with
`ALL STAGES GREEN`. It writes the ignored local outputs
`generated/account-map.json`, `tb-comparison.json`, `tdl-comparison.json`, and
`statements-comparison.json`, plus `v2-regression.json`.

Tracked audit machinery:

- [validate-fixtures.mjs](../../dev/import/legacy-report-fixtures/validate-fixtures.mjs)
- [verify-legacy-reports.mjs](../../dev/import/legacy-report-fixtures/verify-legacy-reports.mjs)
- [source-manifest.json](../../dev/import/legacy-report-fixtures/source-manifest.json)
- [scan-code-exceptions.json](../../dev/import/legacy-report-fixtures/scan-code-exceptions.json)

The current harness now pins the final V2 state: 880 exact TB accounts, 642 balanced January
anchors, all 156 approved mappings, the exact ten V3-only statement residuals, immutable IMP and
the June regressions. The old `verify-import.sql` and `insert-opening-anchors.sql` remain immutable
pre-V2 evidence and will correctly fail against the 642-anchor final state; the guarded V2
migration and transitioned harness are the final verifier.

## Boundaries and remaining work

- Only May BS/IS/CoGM scans exist. Jan–April statement parity and monthly closing-stock values are
  not independently evidenced; the five TBs still prove every account movement and opening level.
- V3 must design the monthly closing-stock mechanism, then reproduce May values
  RM188,979.60 / RM336,909.82 / RM182,194.43.
- V3 must close the five debtor column-presentation differences, omit the 41 zero-close body rows
  under the intended control policy, and offer the proven signed-ledger FIFO aging model for the
  11 allocation differences.
- The bonus creditor page and supplier/AP comparison remain outside scope.
- Content and accounting parity are the goal; visual layout parity is not.
- V2 `fs_note` changes affect historical and future report levels. The standing harness therefore
  freezes June journals/five-ledger movement and rechecks the balanced June TB/BS levels and all
  1,571 checkpoints.
- The private scans, customer fixtures, and generated comparison JSON must remain out of Git.

## Next decision: production remains separate

The recommended option was selected and is complete on development: balanced RM5,389,607.26 V2,
with the RM708,083.85 closing-stock mechanism left to V3. Expanding V2 to closing stock was not
selected. No production database, process or deployment was changed; any production rollout needs
a fresh read-only inventory, validated rollback and separate approval before this guarded migration
or report engine is deployed there.
