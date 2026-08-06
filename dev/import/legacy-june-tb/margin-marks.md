# Left-margin marks — `JUNE_TIENHOCK_TRIAL_BALANCE.pdf`

Phase 0 finding, 5 Aug 2026.

## Result

**No row on any of the 20 pages carries a handwritten margin mark.** Every row in
`june-2026-legacy-tb.json` therefore has `margin_mark: false`, and the
`(page, code)` list this file was meant to hold is empty.

Everything visible in the left margin of the scan is a **binding/punch artefact of
the paper**, not an annotation. There is no pen, pencil, highlighter, tick, circle,
arrow or figure anywhere on the printout.

## What the marks actually are

Three distinct artefacts, all mechanical:

1. **Spiral/comb binding rings and punch holes** — dark crescent, ring or solid
   round blobs hugging the extreme left edge of the sheet. These are the dominant
   artefact and appear on 19 of 20 pages (page 20, the landscape grand-total page,
   has none).
2. **A faint vertical dashed rule** roughly 100–200 px in from the edge on some
   pages — the tractor-feed perforation line of the continuous-form stationery.
3. **Isolated dust specks**, one or two per page at most (e.g. page 5, a single
   comma-sized speck around the `CR ST` row).

## Evidence

Rendered at scale 5 (`dev/pdf-render/out/june-tb-hi`, 2975×4210 px, essentially the
native 3036×4073 scan resolution), then every ink blob left of x = 260 px was
clustered and measured. Two properties settle it:

- **Position.** Every blob sits at x ≈ 0–200 px of a 2975 px-wide page — inside the
  first ~0.5 inch of the sheet, well outside the printed area. The `ACC/CODE`
  column starts at x ≈ 324–1055 px depending on how each sheet fed through the
  scanner. Nothing was found in the white band between the sheet edge and the code
  column. (On the left-shifted pages 3, 5 and 14 the cluster pass at x = 213–259
  picks up the *printed* leading `C`/`O` of `CS …` / `OS …`, at exactly the 64–72 px
  text-row pitch — printed text, not marks.)
- **Pitch.** The blobs repeat at a median vertical spacing of **~180–230 px**,
  constant down each page and constant across pages. The printed text rows are
  **~66–75 px** apart. The marks are therefore on a ~3-row lattice that ignores row
  boundaries entirely — the signature of a binding comb, not of someone marking
  specific accounts.

Per-page blob counts and pitches (x < 260 px, blobs ≥ 80 px):

| page | blobs | x range | median pitch |
|---|---|---|---|
| 1 | 15 | 15–58 | 194 |
| 2 | 29 | 0–186 | 193 |
| 4 | 34 | 0–117 | 178 |
| 6 | 35 | 44–189 | 169 |
| 7 | 42 | 4–97 | ~200 |
| 8 | 29 | 36–188 | 181 |
| 9 | 29 | 10–122 | 194 |
| 10 | 24 | 36–179 | 205 |
| 11 | 26 | 132–203 | 204 |
| 12 | 25 | 0–112 | 195 |
| 15 | 29 | 66–137 | 214 |
| 16 | 38 | 0–135 | ~200 |
| 17 | 24 | 55–206 | 217 |
| 18 | 27 | 25–104 | 191 |
| 19 | 24 | 45–114 | 216 |
| 20 | 0 | — | — |

(Pages 3, 5, 13 and 14 are the left-shifted scans described above; their clusters in
this band are printed characters, and their true margin — x < 200 — is empty.)

This matches the conclusion already recorded for the earlier annotated printout in
`docs/Account/ACCOUNTING_PROGRESS.md` §7, where the corner/edge marks on
`CORRECTED_JUNE_TRIAL_BALANCE.pdf` were resolved with the user on 5 Aug 2026 as
staple/scan artefacts.

## Separate finding: the printed credit column does not foot to its own total

Not a margin mark, but recorded here because it is the one place the transcription
could not be made to tie and it must not be silently "fixed" in a later phase.

- Printed grand total (page 20): **17,102,880.87** on both sides.
- Transcribed **debit** column: **17,102,880.87** — exact to the cent.
- Transcribed **credit** column: **17,102,920.87** — **40.00 over** the printed total.

The credit side has only 37 non-zero rows. Their column placement was verified
mechanically (rightmost-ink clustering per printed row on every page: 37 credit
cells detected, 37 transcribed, page-by-page match), and **36 of the 37 agree to the
cent with our dev June YTD balances**. The single exception is:

- `CR LD` — LAHAD DATU FLOUR MILL SDN BHD, page 4 row 35: printed **25,492.43 CR**,
  dev **25,452.43 CR**, difference exactly **40.00**.

That figure was re-read three times at increasing fidelity, ending with a 5× crop of
the **native embedded raster** (`2944×4112`, no resampling). The fourth digit is
unambiguously a `9` (closed bowl with a straight descender), not a `5` (flat top bar,
open upper left). The printed value is 25,492.43.

So the transcription is faithful and the discrepancy is in the source document: the
legacy program's credit column as printed exceeds its own printed grand total by
40.00, and the sole reconciling item is `CR LD`. The debit column has no such
problem. **Do not adjust the transcription to force the credit gate; resolve it with
the coworker's legacy CR LD ledger detail.**

## Other transcription notes carried forward

- The printed `ACC/CODE` field is **10 characters wide and truncates**. Three codes
  are cut off: `HPA SWJ988` and `HPB SWJ988` (dev `HPA_SWJ9882` / `HPB_SWJ9882`)
  and `DEP SAA453` (dev `DEP_SAA4531E`). The transcription records what is printed.
- The print renders a stored underscore as a **space** (`ACD EPF` on paper =
  `ACD_EPF` in `account_codes`); `diff-june-tb.mjs` joins on the underscore form.
  878 of the 885 transcribed codes exist verbatim in `account_codes` under that rule.
- Four printed codes have no counterpart in our chart at all — `ARI`, `CR QF`,
  `TAX EXP`, and `OUTPUT.TAX` (the legacy code really carries a full stop; dev
  stores `OUTPUT_TAX`). All four are zero-balance rows.
- `TAX EXP` (page 19 row 15, ROAD TAX OTHERS) prints with **both money cells
  genuinely blank** rather than `.00`; per the agreed rule it is recorded as 0 / 0.
