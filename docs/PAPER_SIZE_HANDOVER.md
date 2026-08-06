# Paper Size Support (A4 / 9.5×11 Computer Form) — Handover

Date: 2026-08-05. Status: **COMPLETE (code-side), awaiting user's manual test-print**. The original 45 files are committed (`230b5703`); the continuation work below is uncommitted in the working tree.

## Continuation result (2026-08-05, second session)

All remaining items done:

1. **4 remaining overlays converted** to the PrintPDFOverlay pattern (auto-print at selected size; post-print panel with PaperSizePicker + "Print Again" + "Close"): `GTPrintPDFOverlay.tsx`, `AdjustmentDocPrintOverlay.tsx`, `GTAdjustmentDocPrintOverlay.tsx`, `EInvoicePrintHandler.tsx`. The old focus-return/60s-timeout auto-close was removed in each — it would have shut the post-print panel the moment the OS print dialog returned focus. `generateAdjustmentDocPDFBlob` / `buildAdjustmentDocPDFDocument` and the GT pair gained an optional trailing `paperSize?: PdfPaperSize` (all pre-existing callers pass 2 args, unaffected).
2. **Changelog entry prepended** (2026-08-05, en+ms) in `src/components/ChangelogModal.tsx`.
3. **AGENTS.md rule 19** extended: page sizes must come from `src/utils/pdf/paperSize.ts`, never hardcode `"A4"`.
4. **Layout verification done** via a throwaway esbuild harness (since removed) that rendered both sizes for every known-risky generator and rasterized the pages for visual inspection. `render-pdf.mjs` gained `standardFontDataUrl` (without it standard-14 Helvetica/Courier text rasterized invisible). Results: InvoicePDF, SalesSummaryPDF, both GT debtor schedules, EstimatedReportPDF all fit the 792pt form with slack — no changes. **Two real fixes:**
   - `src/utils/pdf/paperSize.ts` — **landscape bug in the feature itself**: @react-pdf/renderer v4 flips page size UNCONDITIONALLY when `orientation="landscape"`, including explicit `[w,h]` arrays, so the pre-swapped `[792,684]` got flipped back to portrait. `getReactPdfPageSize(size, true)` now returns the portrait array `[684,792]` and lets the orientation prop do the one flip. Fixes all 3 landscape callers (SalaryReportPDF, CutiReportPDF, GeneralStatementPDF). A4 path untouched.
   - `src/utils/accounting/AccountLedgerPDFMake.ts:304` — letterhead rule `x2` was hardcoded 559 (A4 content width); now `ruleWidth = paperSize === "computerForm" ? COMPUTER_FORM_WIDTH - 36 : 559`.
5. **Final greps clean**: no `size="A4"` / `pageSize: "A4"` left anywhere in `src/`.

User must still: run the app and exercise the 6 print overlays (compile check — no tsc/build was run, per rule 10), and test-print on the LQ-2190 (browser "fit to printable area" handles tractor margins; if edges clip, bump left/right margins for computerForm). Watch: landscape docs rotating correctly in the print dialog (the flip fix), dense invoice pages (~40pt bottom slack), 6.5pt salary-table font legibility on dot-matrix.

## Goal

Support the legacy dot-matrix printer (Epson LQ-2190) with 9.5×11in fanfold computer forms alongside A4. Browser JS cannot detect the printer, so the UX is: a **per-machine global default** (localStorage, navbar user menu) + a **per-print override** on the invoice/adjustment print overlays. Approved plan file: `C:/Users/matia/.kimi-code/sessions/wd_tienhock_9b135d8c2fae/session_d4025a02-aabf-4534-96cd-0d52091b8684/agents/main/plans/fire-america-chavez-sandman.md`.

## What is DONE (45 files, staged)

1. **Core module `src/utils/pdf/paperSize.ts`** (new): `PdfPaperSize` ("a4" | "computerForm"), `getPaperSizePreference()` / `setPaperSizePreference()` (localStorage key `pdf-paper-size`, window event `pdf-paper-size-changed`), `usePaperSizePreference()` hook, `getReactPdfPageSize(size, landscape?)` ("A4" or `[684, 792]` / `[792, 684]`), `getPdfMakePageSize(size)` ("A4" or `{width: 684, height: 792}`).
2. **All 31 PDF generators converted** — every one accepts optional `paperSize?: PdfPaperSize` (prop on react-pdf document components, trailing param on generate functions / options object), defaulting to the global preference at generation time. A4 path is byte-identical (`"A4"` string as before). Landscape docs pass `landscape=true` to `getReactPdfPageSize` and keep their `orientation` prop; pdfmake docs keep `pageOrientation`.
   - react-pdf: 13 accounting reports, 6 payroll reports, 5 stock/sales/catalogue, 6 invoice/e-invoice/adjustment docs, GTStatementPDF.
   - pdfmake: `PaySlipPDFMake.ts` (3 doc defs + `PaySlipPDFProps.paperSize`), `JournalVoucherPDFMake.ts`, `AccountLedgerPDFMake.ts` (options obj), `PayrollSummaryPDFMake.ts`. `PayslipManager.ts` threads the param through print/download.
3. **Navbar global toggle** in `src/components/Navbar/NavbarUserMenu.tsx` — "Paper Size" pill row (A4 / 9.5×11 Form) modeled on the Language selector, using shared component **`src/components/PaperSizePicker.tsx`** (new; props `value`, `onChange`, optional styling).
4. **i18n keys added** to en/ms/zh-Hans `common.json` AND `nav.json`: "Paper Size", "9.5×11 Form", "Print Again" (check exact keys with grep before re-adding).
5. **2 of 6 print overlays converted** (auto-print with selected size; after print fires, dialog stays open with PaperSizePicker + "Print Again" + "Close"; Print Again regenerates at the new size and updates the global pref):
   - `src/utils/invoice/PDF/PrintPDFOverlay.tsx` (reference implementation — copy its pattern)
   - `src/utils/invoice/PDF/InvoiceSoloPrintOverlay.tsx`

## What REMAINS (the continuation task)

### 1. Convert the remaining 4 overlays (same pattern as PrintPDFOverlay.tsx)

- `src/utils/greenTarget/PDF/GTPrintPDFOverlay.tsx` (renders `GTInvoicePDF`, prop `paperSize`)
- `src/utils/adjustments/PDF/AdjustmentDocPrintOverlay.tsx` (renders `AdjustmentDocPDF`)
- `src/utils/greenTarget/PDF/AdjustmentDocs/GTAdjustmentDocPrintOverlay.tsx` (renders `GTAdjustmentDocPDF`)
- `src/utils/invoice/einvoice/EInvoicePrintHandler.tsx` (a handler, not an overlay — read it first; it has two print flows ~lines 148/210. If it has no dialog today, add the same post-print dialog visual style as PrintPDFOverlay.)

All target components already accept `paperSize?: PdfPaperSize`. Reuse `PaperSizePicker` + `usePaperSizePreference` + existing i18n keys. Keep existing cleanup/fallback logic intact. Minimal diffs, dark-mode classes, TS types, no build/tsc runs (user tests manually).

### 2. Changelog entry (AGENTS.md rule 16 — mandatory)

Prepend to `CHANGELOG_ENTRIES` in `src/components/ChangelogModal.tsx`, date `2026-08-05`, e.g.:
- en: "Printing: you can now choose A4 or 9.5×11 computer form paper size from the user menu (top right). Invoice and adjustment print dialogs also let you switch size and reprint."
- ms: "Cetakan: anda kini boleh memilih saiz kertas A4 atau borang komputer 9.5×11 dari menu pengguna (atas kanan). Dialog cetak invois dan pelarasan juga membolehkan anda menukar saiz dan mencetak semula."

### 3. AGENTS.md note (rule 13-style upkeep)

Append to rule 19 in `AGENTS.md`: page sizes must come from `src/utils/pdf/paperSize.ts` (never hardcode `"A4"` in new generators).

### 4. Verification (important — known layout risks on the shorter/wider form)

Generate sample PDFs at computerForm and rasterize with `dev/pdf-render/render-pdf.mjs`; inspect visually. Known risks flagged by the implementers:
- `InvoicePDF.tsx` — `ROWS_PER_PAGE = 30` hard-paging tuned to A4 height; 30 rows may overflow 792pt and desync its explicit pagination.
- `SalesSummaryPDF.tsx` — `paginateSections` with `ROWS_PER_PAGE = 60` + per-section costs tuned to A4; sections may overflow and hard-split.
- `GreenTargetDebtorSubSchedulePDF.tsx` (`ROWS_PER_PAGE = 44`) and `GreenTargetTradeDebtorListPDF.tsx` chunking — may clip past 792pt.
- `EstimatedReportPDF.tsx` — tall MEE/BIHUN sheets nearly fill A4; may spill to 2 pages per line.
- `SalaryReportPDF.tsx` (landscape) — form landscape is 792×684 vs A4 842×595: **narrower**; wide fixed-column tables may exceed width.
- `AccountLedgerPDFMake.ts` — canvas divider hardcoded `x2: 559` (A4 content width); stops ~89pt short on the form (cosmetic).
- Payslips: no fixed heights (verified) — degrade gracefully, but dense slips may gain a page.

If any of these visibly break, apply a **targeted** fix only for computerForm (e.g. reduce ROWS_PER_PAGE when `paperSize === "computerForm"`), keeping A4 output unchanged.

### 5. Final checks

- `grep -rn 'size="A4"' src/utils` and `grep -rn 'pageSize: "A4"' src/utils` should return nothing (except possibly the untouched `DeliveryOrderPage.tsx` HTML print path, which is out of scope).
- Confirm overlay conversions compile (user runs the app; per AGENTS rule 10 do NOT run npm build/tsc yourself).
- Remind the user to test-print on the LQ-2190 (browser print dialog "fit to printable area" handles tractor margins; if edges clip, bump left/right margins for computerForm later).

## Continuation prompt for the next model

> Continue the paper-size feature in C:/tienhock. Read `docs/PAPER_SIZE_HANDOVER.md` first — it lists exactly what is done (45 staged files: core module `src/utils/pdf/paperSize.ts`, all 31 PDF generators converted to accept `paperSize?: PdfPaperSize`, navbar toggle, i18n keys, 2 of 6 print overlays converted) and what remains: (1) convert the last 4 overlays (`GTPrintPDFOverlay.tsx`, `AdjustmentDocPrintOverlay.tsx`, `GTAdjustmentDocPrintOverlay.tsx`, `EInvoicePrintHandler.tsx`) following the reference pattern in the already-converted `src/utils/invoice/PDF/PrintPDFOverlay.tsx` (auto-print with selected size; post-print dialog with `PaperSizePicker` + "Print Again" + "Close"; picking a new size updates the global pref via `usePaperSizePreference`'s setter and Print Again regenerates at that size); (2) prepend the changelog entry in `src/components/ChangelogModal.tsx`; (3) add the AGENTS.md rule-19 note; (4) verify computerForm layout with `dev/pdf-render/render-pdf.mjs`, checking the known risks listed in the handover (InvoicePDF ROWS_PER_PAGE=30, SalesSummaryPDF paginator, GT debtor schedules, EstimatedReportPDF, landscape SalaryReportPDF width) and applying targeted computerForm-only fixes where needed, keeping A4 output unchanged. Follow AGENTS.md rules: minimal diffs, typed params, i18n for new UI strings (keys already exist in common.json/nav.json), no npm build/tsc runs.
