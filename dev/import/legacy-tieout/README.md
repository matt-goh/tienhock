# Monthly legacy-vs-ERP Trial Balance tie-out

Catches keying differences between the legacy program and the ERP in the month
they happen, so a correction is a 10-minute Journal-page edit instead of a
forensic project months later. Read-only against the ERP database.

For December 2026 year-end context recovery or February 2027 audit work, start with
[`docs/Account/AUDIT_2026_READ_FIRST.md`](../../../docs/Account/AUDIT_2026_READ_FIRST.md). This file
is the narrower Tien Hock monthly-comparator guide.

## Monthly procedure (±15 minutes)

1. Ask the coworker for the legacy **Trial Balance as at month-end**, exported
   to **CSV** (from the legacy program's Excel export: Save As CSV). One row
   per account, columns `code,debit,credit` (YTD balances). A header row is
   auto-detected. Scanned PDFs also work but must be transcribed to the JSON
   shape first (see `dev/import/legacy-june-tb/` for the June example) — ask
   for CSV, it saves the transcription step entirely.
2. Run:

   ```bash
   node dev/import/legacy-tieout/tie-out.mjs --month 2026-07 --legacy <path-to-july.csv>
   ```

   Add `--prev-legacy <path-to-june.csv>` to also compare the month's
   **movement** per account (isolates the current month even if an older month
   carries a known residual).
3. Read the summary. **A clean month shows `differing accounts: 0`.** Every
   non-zero row is a real keying difference: our voucher was keyed to a
   different account (or amount) than legacy's.
4. For each differing account: open the ERP Account Ledger for that month,
   compare against the legacy account-ledger detail (ask the coworker for the
   ledger print of just the differing accounts), then fix the miskeyed line on
   the Journal page. Only manual, source-less journals past the period lock
   are editable — exactly the class of journals these differences come from.

## What the output means

- `ytd diff` = ERP YTD balance − legacy YTD balance at month-end.
- `movement diff` (with `--prev-legacy`) = ERP month movement − legacy month
  movement. This is the column to watch: it must be 0.00 for every account.
- The CSV lands in `dev/import/legacy-tieout/out/tie-out-YYYY-MM.csv`.

## Presentation fold (`fold-map.json`)

The legacy print is not a 1:1 code list of our chart. Two presentation rules
are applied before comparing (without them you get pages of false positives):

- `aliases` — codes legacy prints differently: `PBB_1`→`BANK_PBB`,
  `ABB`→`BANK_ABB`, `HPA_SWJ988`→`HPA_SWJ9882`, `HPB_SWJ988`→`HPB_SWJ9882`.
  Add a line here whenever legacy renames a code.
- `foldIntoParent` — `DEBTOR`: legacy prints one DEBTOR control row; the ERP
  carries one child per customer. Children are summed into the control before
  comparing. (This fold is also why the folded ERP grand total ties to the
  printed total: credit-balance debtor children net inside the control instead
  of inflating both TB sides.)

## Proof profile (June 2026, after the reclass migrations)

`--month 2026-06 --legacy dev/import/legacy-june-tb/june-2026-legacy-tb.json`
yields **5 differing accounts**, all expected for that archived print:

```
MBRMF   ytd   +100.00     MBSAF   ytd   -100.00
MBC     ytd    -40.00     MBSM_K  ytd    +40.00
CR_LD   ytd    +40.00
```

- `CR_LD +40.00` — the documented legacy source-document anomaly: the legacy
  print's own credit column foots 40.00 over its own grand total. Not a keying
  difference; see `JUNE_RECLASS_DESIGN.md` §d.3.
- The other four are the **7 Aug 2026 post-print amendments**. That fixture is a
  faithful transcription of the June print, and the coworker corrected two of her
  own legacy keying errors *after* it was printed (KFC LINTAS 40.00 → `MBSM_K`;
  PAUMIN #2606-2133 → `MBRMF` 565.00 / `MBSAF` 144.00). The ERP matches the
  amended legacy, not the print. **Do not "fix" the fixture** — it is evidence.
  Evaluate a fresh export from scratch; do not pre-accept any residual merely because it appeared in
  this old June fixture. See `JUNE_RECLASS_DESIGN.md` §e.

Everything else ties to the cent.

**This is exactly the failure mode the tie-out exists to surface, and it cuts
both ways:** a difference means the two systems disagree, not that legacy is
right. Before editing an ERP line, check the original receipt — three of June's
31 corrections went the wrong way because a print was trusted over the ERP.

## Database

Defaults to the dev Docker DB (`localhost:5434`, `postgres/foodmaker`,
`tienhock`); override with `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` /
`DB_PASSWORD`. To tie out production directly, run on the server with
`DB_HOST=localhost DB_PORT=5432 DB_NAME=tienhock_prod DB_USER=postgres`.

## Future sessions

Do not maintain a separate copy-paste prompt here. Attach the current and immediately preceding
month-end TB files, then mention only:

```text
@docs/Account/AUDIT_2026_READ_FIRST.md
```

That document is the single context-recovery launcher. Its TH §5 routes the session back to this
README for the command/input details and applies the shared read-only, evidence, approval and audit
pack rules.
