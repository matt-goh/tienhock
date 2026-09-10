# Core accounting source conversion handover - 9 September 2026 KL

**For Terra:** inspect and convert local evidence into reusable private fixtures only
where it advances the current reconciliation. Do not change accounting data or report
code. The user requested a lower-usage handover if substantial conversion is needed;
no other model has been run as part of this handover.

Start with [the current findings](CORE_REPORT_REVIEW_2026-09-09.md) and
[READ FIRST](AUDIT_2026_READ_FIRST.md). **Latest replies:** ARI 31,495.55 and CL_AFI
25,696.82 are both credits in the 1 January 2026 opening schedule for the year ended
31 December 2025. All January-August closing stocks have been supplied, transcribed
and applied to refreshed **dev at 11:32:52 KL**, with actual-handler checks and a
zero-insert rerun. Production applied by the user at 12:02:07 KL; supplied output confirms the same values and eight zero TB/BS differences. See the
[stock correction](CLOSING_STOCK_CORRECTION_2026-09-09.md) for source values, hashes
and production steps; **no further stock conversion is needed**. The adjusting journal was
not supplied, and the earlier ARI profit-opening diagnostic is not a supported fix.

**Latest user instruction:** no January Excel export is available. Use root
`Trial_Balance_Jan_2026.pdf`; do not wait for another file or repeat the export
request. January PDF transcription and comparison are now the priority. The older
PDF totals remain their own historical baseline; document the bridge to the revised
auditor openings separately rather than relabelling the PDF as the newer state.

## What has already been checked

On 9 September KL, the seven root files were read locally and SHA-256 checked.
Private inspection output is `out/audit-2026-core-review/source-inventory.json`.
No database connection or write was made for this file inspection.

- All five PDFs are **byte-identical to the July-received historical scans** pinned
  in `dev/import/legacy-report-fixtures/source-manifest.json`. Each has 20 pages;
  first and last pages have no extractable text. Do not OCR all 100 pages just to
  discover their identity again.
- January PDF page 20 was rendered and visually checked. Its debit and credit totals
  are both **13,982,350.19**, not the latest handwritten **14,056,981.54**. It also
  shows DEBTOR debit **534,531.47**, APPX 22, and CL AFI credit **25,696.82**, APPX 8.
  The render is `out/audit-2026-core-review/january-tb-p20.png`.
- January pages 1-3 have also been rendered and visually inspected (same prefix,
  `-p01.png` through `-p03.png`). Page 1 shows ARI / APPX 5 / debit `.00`; page 20
  shows CL AFI / APPX 8 / credit 25,696.82. The January CSV has not yet been transcribed.
- Both XLSX files contain readable XML; no OCR is needed. Each has one populated
  worksheet, `Sheet1`, and empty `Sheet2`/`Sheet3`. No formulas were found.
- THLD has **12,684 rows**, dimension `A1:J12684`; THDB has **10,271 rows**,
  dimension `A1:H10271`. These counts and the specific malformed rows below match
  the historical ledger import description. This is not a byte-equivalence claim
  between XLSX and the missing original CSVs.
- Workbooks contain the older opening figures, not the September auditor changes:

| Workbook / Sheet1 cells | Account | Evidence |
|---|---|---|
| THLD B391, H393 | ARI | Opening `.00 DR`; no transaction rows before next account |
| THLD B12679, H12681 | CL_AFI | Opening `25,696.82 CR`; no subsequent transactions |
| THLD B4287, H4289 | CR_JP | Opening `8,952.00 DR`; no transaction rows before next account |
| THDB B4534, F4536/H4536 | JP | Opening `707.45 DR`; last balance H4546 is `594.10 DR` |

ARI already exists in this **legacy workbook** with zero balance. That does not
contradict the accountant having added ARI to the ERP later. Its new 31,495.55 amount
is now confirmed as a credit in the dated opening schedule. That does not supply a
2026 expense/reversal journal or authorize adding the opening credit to 2026 profit.

## Source pins

All paths in this table are relative to repository root. Preserve the originals.

| File | SHA-256 |
|---|---|
| `EXCEL_THDB_(Jan-May26).xlsx` | `78ed27b1d091b2c91adcaca173c6028d881e7e4eff7770850630a0ecb870d7bc` |
| `EXCEL_THLD_(JAN-MAY26).xlsx` | `c2c1549a1dfa8085e4038458554017fd91c386508053b6abfae570f9d8126242` |
| `Trial_Balance_Jan_2026.pdf` | `15a9ce11dc7b18102d8d8751dd794b2289c092febc209020a6457360043d203a` |
| `Trial_Balance_Feb_2026.pdf` | `6ac3e731b59dabfb7f94fbe87fa46b328f9a55ed80173d78c148a61f010497da` |
| `Trial_Balance_Mar_2026.pdf` | `22926af36bdc3147c8832b604b84972da19bf0c929a2769421f1b26e9b418d74` |
| `Trial_Balance_Apr_2026.pdf` | `2724357c2e53499c5e9f1eeeaeb9cce86b1654d17539a8586f4b90e0cffac897` |
| `Trial_Balance_May_2026.pdf` | `66d3eaad9651fbc5cc3e4f09ac395afb78d391a068a3e4f09db07ff3b7193c6c` |

| Month | Historical PDF total per side, from pinned manifest | Latest handwritten comparison |
|---|---:|---:|
| January | 13,982,350.19 | 14,056,981.54 |
| February | 14,529,026.66 | 14,585,854.01 |
| March | 15,171,186.06 | 15,207,287.16 |
| April | 15,876,445.88 | 15,892,242.98 |
| May | 16,408,437.78 | 16,389,380.28 |

February-May totals above are taken from the hash-matching historical manifest;
only January's total was re-read visually in this inspection. No July/August source
TB was supplied in this batch. June has an older repository transcription, not a
new source PDF. The January CoGM/IS/BS and auditor schedules are still inline photos
in the conversation; their transcribed controls are in the core report review.

## Conversion scope and order

1. Prioritize **January's existing 20-page PDF** under the user's latest direction.
   Transcribe its account rows using the format below and validate both printed
   totals at 13,982,350.19. Preserve a separate exception/source-version report for
   differences from the newer handwritten total and revised auditor openings.
   Do not start the other four PDFs unless January findings require them.
   Read `dev/import/legacy-jan-may/README.md`, its `source-manifest.json`, and
   `prepare-staging.mjs` before interpreting the workbooks. Read the report-fixtures
   README, manifest, validator and `scan-code-exceptions.json` before interpreting
   a PDF. Do not modify any of these historical manifests or import inputs.
2. Check for surviving private original CSV/transcription fixtures first. They were
   absent at this inspection; root workbooks/PDFs have now been recovered. If a
   fixture is found, verify its original hash before reusing it.
3. If workbook conversion is needed, use local ZIP/XML or an already installed XLSX
   reader. Python stdlib `zipfile`/`xml.etree.ElementTree` can read these files without
   dependencies. Preserve a raw layer containing source filename/hash, sheet, row,
   cell address, XML type/style and raw value before deriving any accounting fields.
   Shared strings can contain multiple text runs and OOXML control escapes.
4. Write new output under ignored `out/audit-2026-core-review/fixtures/`, with a new
   source/output hash manifest. Include openings and transactions with source row,
   printed account, mapped account if evidenced, original date, resolved date and
   its evidence, reference, particulars, cheque, integer debit/credit cents and
   signed running-balance cents. Preserve blank versus explicit zero.
5. Validate source row coverage, section counts, exact money parsing, opening and
   transaction classification, and running-balance changes. The original source
   controls are THLD 884 sections / 8,261 transactions, THDB 1,685 sections / 1,843
   transactions. Their combined transaction debit and credit each total
   **1,350,848,707 cents**. Check these as historical comparison controls, never
   force a transformed workbook to pass them by dropping or inventing rows.
6. Emit an exception list for unresolved dates/shifted fields or other differences.
   Do not label the normalized fixture verified until those exceptions are resolved.
   A raw extraction with clear exceptions is preferable to invented dates or amounts.
7. Use old PDFs only for a specific unresolved printed account/note or missing
   historical fixture. Start with the necessary January pages, not all months.
   If full scan transcription becomes necessary, give Luna a bounded month/page
   range; Terra should validate row coverage, signs and totals. A new transcription
   belongs in a new manifest even if it represents the same old scan.

### Known XLSX conversion traps

- **Dates:** column B mixes text `DD/MM/YYYY` with numeric Excel dates using built-in
  format 14. Numeric dates cannot be blindly trusted as accounting dates. Example:
  THDB B4537 is serial **46174** (1900-system calendar date **2026-06-01**) beside
  reference `TJ060126`, despite the Jan-May source window; B4541 is **46026** beside
  `TE010426`, and B4545 is **46270** beside `TE090526`. Retain the raw serial and
  investigate the historical conversion. Reference text or staying inside Jan-May
  alone is insufficient proof for swapping day/month. The original CSV parser treats
  slash dates as day-first and dash dates as month-first; it cannot consume raw
  Excel serials. Do not change the original date parser to accept guessed dates.
- **Money:** XML contains binary-float residue such as `36563.769999999997` and
  `1121.9000000000001`. Use decimal parsing and explicit cent normalization, check
  only representation noise was removed, and compare with printed running balances.
- **THLD row 7262:** particulars spill across D-F, cheque is G, debit H, balance J.
  **Row 12049:** particulars spill D-E, cheque F, debit G, balance I. The source
  manifest documents the original two CSV repairs. Confirm all source fields before
  applying equivalent workbook repairs; CSV line hashes do not pin XLSX cells.
- THLD row 4417 contains `_x001F_` in particulars; the final row contains `_x001A_`
  (Ctrl-Z sentinel). Preserve raw OOXML text and any decoded value distinctly.
- Opening rows can have blank debit/credit and a nonzero signed **balance**; do not
  lose CR_JP/CL_AFI. SUN's historical May 31 zero opening is an explicit exception.
- Historical HR/HR-D, DEBTOR control exclusion, native-credit-note overlap and CHARLES
  transformations are documented in the import tooling. Raw ledger fixtures must
  retain source rows even when the later import intentionally transforms/excludes them.

### Existing PDF tooling and fixture format

The repo renderer was successfully used for January page 20:

```powershell
node dev/import/legacy-report-fixtures/render-pdf.mjs Trial_Balance_Jan_2026.pdf out/audit-2026-core-review/january-tb 20 1.6
```

It uses existing `pdfjs-dist` and `canvas`. `pdfplumber` is installed for text checks;
`openpyxl`, `pandas`, `pypdf`, `fitz` and command-line OCR utilities were not available
in the inspection environment. No external OCR service is authorized.

The historical TB CSV format is:

```csv
page,row_on_page,acc_code_printed,particular,appx,debit_cents,credit_cents
```

Transcribe zero/blank rows too; retain printed codes and document aliases separately.
Every row needs a source page/position; unresolved glyphs need an exception, not a
guess based on the current ERP. Compare sum of debit and sum of credit independently
with the printed controls. Matching grand totals alone cannot establish row accuracy.

The old `validate-fixtures.mjs` expects all nine sources and ten CSVs, including missing
May statement/debtor sources. Do not claim that full gate passed using only these five
PDFs, and do not update its pinned hashes to accept a replacement transcription.
The historical DB parity harness also predates the approved September openings.

## Boundaries and return deliverable

- No DB writes, production access, SQL migration, report changes, or changelog changes.
  Do not undo the approved JP correction or infer a new ARI journal from a balancing
  result. CL_AFI stays unchanged; ARI's applied mapping remains under review.
- Fixtures derived from ERP/staging are comparison data, not independent legacy scan
  proof. If a read-only staging comparison is needed, record its DB/snapshot and
  keep it separate from direct workbook/PDF extraction.
- Do not overwrite the original CSVs, staging, source manifests or historical fixtures.
  Do not commit private ledgers, scans or per-customer extraction output. Root PDFs
  are protected by local `.git/info/exclude`; XLSX and `out/` are already gitignored.
- Return a short file/count/hash summary, validation result and exception list;
  distinguish raw extraction from verified semantic fixtures. Do not flood the model
  context with full ledgers or scan pages. No build/typecheck/lint is needed.

## Evidence limits and questions

**Do not send the former January Excel/CSV request.** The user directs us to use
the existing PDF. Proceed with it and document what its older account balances prove.
The year and credit signs of both allowances, and all eight months' stock totals,
are now answered. No repeated clarification is needed to begin conversion/comparison.

First compare the PDF to the historical import, then explicitly account for the
approved opening revisions and later entries when comparing with the current ERP.
Do not change the fixture to match 14,056,981.54, fill unreadable amounts from ERP
data, or erase legitimate auditor corrections just to recover the old printed total.
Report any remaining difference that cannot be resolved from the supplied evidence.

Full January-August agreement is still unverified. Isolating August's new change
eventually requires current July/August account data or sufficient movement detail;
that limit does not block this January PDF task. Ask later only for a specific
unresolved item after using the evidence already supplied.
