# Closing Stock / Estimated Unit Cost Report — Legacy Fixtures

Fixtures for the new **Estimated P&L & Unit Cost** report (Stock → Reports). The report
replicates the legacy "MEE/BIHUN ESTIMATED" and "ESTIMATED/COST" printouts, starting
from period **06/2026**.

## Contents

- `ClosingStockReport.pdf` — original 10-page scanned legacy report (no text layer).
  - p1: MEE ESTIMATED (monthly P&L)
  - p2: BIHOON ESTIMATED (monthly P&L)
  - p3–5: MEE (REPORT) ESTIMATED/COST (FORMAT) — formula definitions
  - p6–8: BIHUN (REPORT) ESTIMATED/COST (FORMAT) — formula definitions
  - p9: BIHUN (REPORT) ESTIMATED/COST — per-production-bag unit cost
  - p10: MEE (REPORT) ESTIMATED/COST — per-production-bag unit cost
- `expected-june-2026.json` — full transcription of every printed value with
  `verified_db` flags showing which values the dev DB already reproduces, plus
  handwritten boss corrections (`*_handwritten`). Transcription is complete: no
  value is left `ocr_uncertain`.

The rendered page PNGs (`pages/cs-p01..p10.png`) were deleted on 2026-07-25 once the
transcription was complete. Regenerate them from the PDF whenever a page needs
re-reading:
`node ../legacy-report-fixtures/render-pdf.mjs ClosingStockReport.pdf pages/cs all 2`

## Parity target

1:1 content parity with the June 2026 printed values, derived from system data
(sales, material stock, posted journals, processed payroll) via the seeded formula
and mapping tables — never hardcoded. Known documented deltas are listed in
`expected-june-2026.json` → `data_issues_confirmed` and tracked in
`docs/Account/ESTIMATED_REPORT_HANDOVER.md`.
