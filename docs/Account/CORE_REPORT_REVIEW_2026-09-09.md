# Core accounting report review - 9 September 2026 KL

**Status:** stock correction applied to refreshed **dev at 11:32:52 KL** on
9 September; **production applied by the user at 12:02:07 KL**, confirmed by supplied output and COMMIT. See the
[correction and production instructions](CLOSING_STOCK_CORRECTION_2026-09-09.md).
All 21 missing stock rows are saved, May is preserved, eight report checks and the
zero-insert rerun passed. Report layouts and the remaining reconciliation are open.
No report-engine code has changed. The earlier ARI classification
is **under review** following the user's explicit expense interpretation; its
production execution remains a historical fact, not proof of the intended treatment.
**Latest reply:** both allowance amounts are confirmed credits in the 1 January 2026
opening schedule for the year ended 31 December 2025. January-August closing stock
has now been supplied and applied in dev. The user directs us to use the existing January
PDF because no Excel export is available; do not repeat the export request.

## Latest evidence and stock preview - 9 September, 11:13 KL

The accountant confirms **ARI 31,495.55 CR** and **CL_AFI 25,696.82 CR**. The new
header photograph reads **Year ended: 31 December 2025 / Opening balances (as at
1 Jan 2026)**, with **As per ledger / Debit / Credit** columns. The receivables page
shows the ARI-bracketed allowance schedule and credit total; the separate CL_AFI row
shows credit 25,696.82. The year and signs are now answered, not pending questions.

This is opening-balance evidence, not a dated 2026 expense/reversal journal. It does
not justify the earlier diagnostic that added ARI's opening credit to 2026 profit.
Keep that diagnostic as historical arithmetic only; **31,853.85 remains the January
expense/profit difference after stock**, not an established residual of only 358.30.
The 358.30 accrual difference remains a separate clue. Keep the saved allowance
amounts and current mappings unchanged during comparison. The earlier statement
"ARI under expenses" still needs to be reconciled with this dated opening allowance
schedule; the new photos do not provide the original adjusting journal/counterpart.
Do not manufacture such a journal or repeat questions about the already confirmed signs/year.

The stock table is complete. Values below are MYR at the end of each individual
month, not quantities or cumulative stock amounts:

| 2026 month | Finished goods, 14-1 | Raw materials, 14-2 | Packing, 14-3 |
|---|---:|---:|---:|
| January | 131,705.70 | 511,650.28 | 186,249.24 |
| February | 136,032.50 | 406,967.93 | 168,003.48 |
| March | 111,351.40 | 453,547.80 | 167,829.37 |
| April | 182,292.50 | 359,123.77 | 180,756.74 |
| May | 188,979.60 | 336,909.82 | 182,194.43 |
| June | 139,687.22 | 300,295.04 | 153,303.09 |
| July | 233,983.20 | 406,576.18 | 166,472.89 |
| August | 110,801.50 | 475,764.17 | 147,811.49 |

All 24 values were transcribed into a private integer-cent fixture. The new January
values match the previously supplied January statements; May exactly matches the
three saved DB rows. At this read-only snapshot, the other **21 rows are absent**.
No new monthly-stock clarification is needed.

`stock-preview.mjs` invokes the actual four report handlers in a repeatable-read,
read-only transaction and substitutes only the stock SELECT result. It leaves ARI
on Note 22 and CL_AFI on Note 8. Database: `127.0.0.1:5434 / tienhock / public`,
server `172.18.0.2:5432`, extracted **2026-09-09 11:13:51 KL**. Source commit, dirty
state, fixture hash and report-handler hash are recorded in `stock-preview.json`.

| Month | CoGM with confirmed stock | Profit with confirmed stock |
|---|---:|---:|
| January | 537,223.39 | 110,409.92 |
| February | 997,601.52 | 157,001.61 |
| March | 1,470,730.05 | 117,855.18 |
| April | 2,003,332.41 | 227,440.51 |
| May | 2,479,030.27 | 284,825.01 |
| June | 2,998,097.33 | 324,311.79 |
| July | 3,528,156.43 | 423,212.98 |
| August | 3,803,054.90 | 499,311.90 |

These are **existing-handler YTD previews**, not all certified against legacy
statements. January CoGM and gross profit match the photograph exactly. For all
eight months, TB responses are unchanged, BS differences stay zero, expenses are
unchanged, and stock deductions / asset and profit increases match each month's
supplied values to the cent. May's four report responses are entirely unchanged.
No data was changed in this 11:13 preview. Subsequently, the 21 missing stock rows
were applied to the user's refreshed dev copy at 11:32:52 KL and the actual reports
matched these previews. Allowance mappings, openings and journals remain unchanged.
Production applied at 12:02:07 KL with matching results; report presentation remains outstanding.

Private artifacts in `out/audit-2026-core-review/`:

- `closing-stock-2026-01-08.user-confirmed.json`, SHA-256
  `4fe2eca54aa8a53efd1fef56fb01914dccaa44ab71a8faa8380bcfcaedc55e43`.
- `stock-preview.mjs` and `stock-preview.json`; output SHA-256
  `55de0827079f7426406de55f88c528d39fd0454582bf0b9b29ac998bd2c172ae`.

These hashes identify the transcription/output files, **not** the inline photos,
whose original files are unavailable to hash. No full ledger conversion or 100-page
OCR was run. January PDF pages 1-3 and 20 have now been visually inspected: page 1
prints ARI under APPX 5 at zero, while page 20 prints CL AFI under APPX 8 at credit
25,696.82. This establishes the historical printed classification/amount, not the
treatment of the later ARI opening credit. Full January row transcription remains
in the [Terra handover](CORE_FIXTURE_CONVERSION_HANDOVER_2026-09-09.md).

## New evidence and scope

The user relayed: **"Baki lama memang tidak ubah sebab CL_AFI under receivable...
ARI under expenses"**. Keep CL_AFI unchanged. This clarifies the user's intended
distinction between the accounts. The later dated opening schedule above confirms
the year and signs; the original adjusting journal has not been supplied.

Five inline images were supplied:

1. Legacy CoGM for January 2026: **537,223.39**.
2. New-program CoGM for January 2026: **1,235,122.91**, printed 8 September 2026.
3. Legacy Detail Income Statement for January 2026: profit **142,263.77**.
4. Legacy Balance Sheet for January 2026: net assets / financed by **5,712,941.51**.
5. Handwritten January-August TB totals: the purple figures exactly match the ERP
   totals; the blue figures are treated as the user's legacy comparison figures.

The photos are inline conversation evidence, not local files. Their contents cannot
be file-hashed here. Transcribed January CoGM, IS and BS arithmetic was independently
checked to the cent, including every printed subtotal. Do not replace the older
hash-pinned fixtures with these newer reports; they represent different states.

Target: `127.0.0.1:5434 / tienhock / public`, server reports `172.18.0.2:5432`.
The Docker CLI's named-pipe connection was unavailable, but the documented dev TCP
connection was available. All database work used repeatable-read/read-only transactions.
Inspection: **2026-09-09 01:57:30 KL**. Actual-route proof: **01:59:37 KL**.
Source commit: `eabd03846655c4577c4b23adaa82a9621554c79b`; the working tree contains
the prior ARI documentation/changelog changes. The proof records the dirty state
and report-source hashes. No production connection was used.

This dev state has 9,291 journal headers / 23,385 lines, compared with 9,272 / 23,329
in the earlier ARI verification. The January-August report totals nevertheless match
the earlier results. Do not call the earlier snapshot an unchanged current snapshot.

## 1. January CoGM: missing stock values explain the full amount difference

The openings, purchases and factory wages in both photographs agree exactly.

| Component | Before closing stock | Closing stock to deduct | Net used |
|---|---:|---:|---:|
| Raw materials, including chemicals and freight | 865,809.50 | 511,650.28 | 354,159.22 |
| Packing materials | 215,940.85 | 186,249.24 | 29,691.61 |
| Factory wages | 153,372.56 | - | 153,372.56 |
| CoGM | 1,235,122.91 | 697,899.52 | **537,223.39** |

At investigation time, `closing_stock_values` contained only May 2026 rows. January had no rows for 14-1,
14-2 or 14-3. The report engine already subtracts keyed 14-2/14-3 values in CoGM;
it cannot infer missing values from a print layout.

A SELECT-only injection of the photographed January values into the actual report
handler produces **537,223.39**, exactly matching the legacy CoGM. The correct data
path is the existing monthly Closing Stock (Financial Statements) values, not an
opening-anchor change or a balancing journal. January's supported values are:

- Finished goods, 14-1: **131,705.70**.
- Raw materials, 14-2: **511,650.28**.
- Packing materials, 14-3: **186,249.24**.

These values and the supplied February-April/June-August figures are now saved in
dev and production. All 24 exact-month values were verified. Do not
carry January or May forward in place of each month's evidenced values.

## 2. Income Statement: stock fixes gross profit, but expenses still differ

| January line | Current ERP | Preview with January stock | Legacy photo |
|---|---:|---:|---:|
| Revenue | 743,416.70 | 743,416.70 | 743,416.70 |
| CoGM | 1,235,122.91 | 537,223.39 | 537,223.39 |
| Cost of sales | 1,319,516.11 | 489,910.89 | 489,910.89 |
| Gross profit | -576,099.41 | 253,505.81 | 253,505.81 |
| Administrative expenses, Note 5 | 143,095.89 | 143,095.89 | 111,242.04 |
| Profit for the year | -719,195.30 | 110,409.92 | 142,263.77 |

The remaining expense/profit difference after stock is **31,853.85**. All current
January Note 5 movement is imported; the only posted non-IMP January journals are
two previously documented sales credit notes (22.90 and 25.65), not expense entries.
There is no evidence here for inventing a missing January expense journal.

### ARI interpretation reopened

The earlier [ARI review](ARI_BALANCE_SHEET_REVIEW_2026-09-08.md) inferred a receivables
classification from the schedule heading and proved that it balanced the BS. That
inference was premature as a conclusion about the auditor's intended treatment.
The user now explicitly says ARI belongs under expenses. A balanced BS alone does
not establish a correct classification or audited profit.

The actual handlers were previewed in three ways, all without writes:

| January preview | Expense Note 5 | Profit | BS difference |
|---|---:|---:|---:|
| January stock, currently applied ARI Note 22 | 143,095.89 | 110,409.92 | 0.00 |
| January stock, ARI mapped back to expense Note 5 only | 143,095.89 | 110,409.92 | 31,495.55 |
| January stock, expense mapping plus ARI credit opening counted in profit | 111,600.34 | 141,905.47 | 0.00 |

The last row is a **diagnostic hypothesis**, not an approved treatment. It explains
31,495.55 of the 31,853.85 difference and leaves **358.30**. Simply restoring ARI's
expense mapping recreates the original BS gap because the engine excludes non-stock
P&L opening amounts. The later reply confirms a prior-year opening credit, not a
2026 expense/reversal journal; see the latest-evidence section above. That diagnostic
must not become a correction without supporting adjustment evidence. Do not globally include all P&L opening
balances or alter retained profit solely to make this one comparison balance.

## 3. Balance Sheet: amount differences and a different presentation

The photographed BS adds current assets to PPE, subtracts the listed liabilities,
then compares net assets with share capital, retained profit and current-year profit.
Its **5,712,941.51** is net assets, not the ERP's **8,269,068.75** total-assets figure.
Its total assets are **9,121,217.52**, including January stock **829,605.22**.

After the diagnostic expense treatment and January stock, the remaining note differences are:

| January note | ERP diagnostic | Legacy photo | ERP minus legacy |
|---|---:|---:|---:|
| Trade receivables, 22 | 543,483.47 | 534,531.47 | +8,952.00 |
| Trade payables, 13 | 210,032.19 | 201,080.19 | +8,952.00 |
| Accruals, 1 | 268,905.99 | 268,547.69 | +358.30 |
| Profit | 141,905.47 | 142,263.77 | -358.30 |

All other photographed BS note amounts match that diagnostic. The 8,952 differences
are exactly consistent with the separately evidenced transfer of the original CR_JP
debit to JP in the revised opening: receivables and net payables both rise. The legacy
Note 22 total also matches the old gross debtor total recorded in the historical
verification plan. This does not justify undoing the auditor-supported JP correction.

The **358.30 accrual difference** equals the remaining expense/profit difference.
This is a reconciliation clue, not evidence naming the account or authorising an
adjustment. Obtain the current legacy account rows before choosing any correction.
CL_AFI remains on Note 8; both reports' Note 8 total is **98,333.92**.

## 4. Confirmed format issues

The current Tien Hock templates do not reproduce the supplied layout:

- **CoGM — layout implemented 10 Sep KL:** the user confirmed all January-August
  amounts are correct and requested the photographed legacy sequence. The screen
  and PDF now share `src/utils/accounting/cogmLayout.ts`: raw opening, chemicals,
  raw purchases and freight; subtotal; LESS closing raw stock; net materials used;
  packing opening before purchases, subtotal and LESS closing packing stock;
  factory wages; final CoGM. Notes have a separate column. Negative ordinary
  amounts retain parentheses; closing stock displays its deduction magnitude with
  an explicit LESS label. Unknown extra costs remain visible. The API, saved
  stock, final total and YTD period basis are unchanged. January's four subtotals
  match the photo and all eight saved report totals are preserved. January/August
  PDFs render on one page. Preview PDFs and checks are in
  `out/audit-2026-cogm-format/`; manual browser review and deployment remain with
  the user. Malay/Chinese key symmetry passed; no build/typecheck/lint was run.
- **Detail IS:** the ERP prints individual manufacturing components in cost of
  sales rather than one CoGM total, and groups other income with revenue. It lacks
  the legacy separate other-income, administrative-expense, finance-cost and tax
  blocks with operating profit and profit-before-tax subtotals. Its PDF also uses
  absolute values for individual lines, which conceals credit/deduction signs.
- **BS:** the ERP prints total assets versus liabilities plus equity, with a
  separate non-current-loan section. The supplied form prints net current assets,
  net assets and FINANCED BY; it includes Notes 11/16 in its liability deduction.
  These structures need an explicit matching presentation rather than comparing
  unlike grand totals. No loan-account or journal reclassification is implied here.

Relevant scope: `src/routes/accounting/financial-reports.js`, the CoGM / Income
Statement / Balance Sheet pages under `src/pages/Accounting/Reports/`, and the
corresponding PDFs under `src/utils/accounting/`. The existing Green Target statement
layouts are separate company implementations and should retain their current behaviour.

## 5. Trial Balance: balanced internally, different from the comparison totals

**Latest user direction: the BLUE figures below are the required target totals.
TB reconciliation remains OPEN.** Internal balance and the completed historical
January PDF bridge do not close this issue. The amounts themselves are confirmed;
do not repeat the request for confirmation or a photo of only the grand totals.
The missing evidence is January's account breakdown behind RM14,056,981.54. Request
that report as PDF/photos first, without requesting Excel or all eight months.

The actual January-August ERP handlers still return equal debits and credits.
Changing ARI's statement note or adding closing-stock report values does not change
those TB totals. The handwritten comparison transcribes as follows:

| Month | ERP / purple | Comparison / blue | ERP minus comparison |
|---|---:|---:|---:|
| January | 14,063,125.09 | 14,056,981.54 | +6,143.55 |
| February | 14,589,497.56 | 14,585,854.01 | +3,643.55 |
| March | 15,211,352.96 | 15,207,287.16 | +4,065.80 |
| April | 15,896,308.78 | 15,892,242.98 | +4,065.80 |
| May | 16,393,446.08 | 16,389,380.28 | +4,065.80 |
| June | 17,085,889.42 | 17,081,823.62 | +4,065.80 |
| July | 17,897,606.29 | 17,893,540.49 | +4,065.80 |
| August | 18,207,498.81 | 18,249,376.39 | -41,877.58 |

A grand total cannot identify which accounts, signs or postings differ. The old
hash-pinned January-May fixture totals differ from the newly handwritten totals,
and the original CSV fixtures remain absent from this checkout. **Source recovery
later on 9 Sep KL:** the five root PDFs were supplied and match the historical hashes;
the two root XLSX files contain earlier ledger balances. These are not updated TBs.
See the [conversion handover](CORE_FIXTURE_CONVERSION_HANDOVER_2026-09-09.md). The archived
June transcription likewise must not substitute for the current legacy export.
**Latest user direction:** no Excel export is available; use root
`Trial_Balance_Jan_2026.pdf`. Its conversion and historical opening bridge are now
complete: all 30 account differences are explained by revised January openings.
Do not request an Excel export or repeat that completed conversion. Its RM13,982,350.19 total is
not evidence of the handwritten RM14,056,981.54 state. Full January-August agreement
is not established by those old files; compare consecutive months by account using the
[monthly tie-out workflow](../../dev/import/legacy-tieout/README.md).
Do not accept old named residuals as the explanation for a new export.

## Next steps and needed evidence

1. CoGM screen/PDF layout is implemented locally; the Income Statement and Balance
   Sheet layouts remain pending. Keep layout, stock values and accounting changes
   separate.
2. **Dev and production stock correction completed.** Production output and backup
   details are recorded. The user confirmed January-August CoGM amounts and then
   confirmed the temporary production backup cleanup was already done.
3. Keep both confirmed allowance credit openings and current mappings unchanged
   during comparison. The period/sign questions are answered; do not use the old
   ARI profit diagnostic as a proposed fix. Any further change must reconcile the
   expense label with the dated opening schedule and adjustment evidence.
4. Use the supplied January PDF as instructed. Separate historical PDF balances,
   revised openings and current ERP results; investigate the remaining 31,853.85
   expense difference and the independent 358.30 accrual clue without a balancing plug.

The earlier January Excel request remains withdrawn. Following confirmation of the
blue targets, the next evidence request is specifically the January account balances
that total RM14,056,981.54. Later July/August movement isolation also lacks the relevant
source account rows; start with January rather than requesting broad document packs.

## Verification artifacts

Private files under `out/audit-2026-core-review/`: `inspect.mjs`, `inspection.json`,
`report-review.mjs`, `report-review.json`. The report harness invokes the actual
handlers and substitutes only SELECT results/expressions for the diagnostic previews;
no UPDATE, INSERT, DELETE or temporary DB object is used.

- `inspection.json` SHA-256: `7d609bb9526dc381be6e36111dc4594fbb52c45ed6419526f1f2e3c0bdef7d4b`.
- `report-review.json` SHA-256: `78bce7da4e745bfc5a9bf0156421107b8a08828020ce72a63c236f45c9d8789b`.
- All photographed January subtotal arithmetic passed independent decimal checks.
- All eight current TB/BS balances and the three January diagnostic scenarios passed
  assertions against the actual report handlers. No build, type check or lint was run.
