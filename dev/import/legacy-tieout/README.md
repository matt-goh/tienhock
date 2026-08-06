# Monthly legacy-vs-ERP Trial Balance tie-out

Catches keying differences between the legacy program and the ERP in the month
they happen, so a correction is a 10-minute Journal-page edit instead of a
forensic project months later. Read-only against the ERP database.

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
yields **1 differing account: CR_LD +40.00** — the documented legacy
source-document anomaly (the legacy print's own credit column foots 40.00 over
its own grand total). Everything else ties to the cent, and the folded ERP abs
total (34,205,761.74 = 2 × 17,102,880.87) equals the printed grand total
exactly.

## Database

Defaults to the dev Docker DB (`localhost:5434`, `postgres/foodmaker`,
`tienhock`); override with `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` /
`DB_PASSWORD`. To tie out production directly, run on the server with
`DB_HOST=localhost DB_PORT=5432 DB_NAME=tienhock_prod DB_USER=postgres`.

## Handover prompt — copy-paste for a fresh session

```
You are working in C:/tienhock (Windows, Git Bash), a multi-company ERP. Task:
monthly tie-out of the Tien Hock Trial Balance against the legacy program.

READ FIRST (short): dev/import/legacy-tieout/README.md. Reference if needed:
docs/Account/LEGACY_TIEOUT_STRATEGY.md (why), docs/Account/KEYING_GUIDE.md
(proven vendor→account rules for fixing), docs/Account/JUNE_RECLASS_DESIGN.md
(the worked June 2026 example).

INPUT: I will give you the legacy month-end Trial Balance (CSV preferred:
code,debit,credit YTD columns; if it is a scanned PDF, render with
node dev/pdf-render/render-pdf.mjs <pdf> <outdir> 2 and transcribe to JSON —
{code, debit, credit} rows — verifying the column sums against the printed
grand total before trusting it; never guess a digit, re-read crops at full
fidelity).

STEPS:
1. Run: node dev/import/legacy-tieout/tie-out.mjs --month <YYYY-MM> --legacy <file>
   (add --prev-legacy <prev file> if last month's TB is available, for
   movement-level isolation). It reads the dev Docker DB by default; if I say
   the books are on prod, use DB_HOST=localhost DB_PORT=5432
   DB_NAME=tienhock_prod DB_USER=postgres on the server
   (ssh tienhock@5.223.55.190).
2. A clean month prints "differing accounts: 0". Known permanent exception:
   CR_LD +40.00 (documented legacy print anomaly — ignore it).
3. For each differing account: pull the ERP account-ledger lines for the month
   (dev DB: docker exec -i tienhock_dev_db psql -U postgres -d tienhock), ask
   me for the legacy ledger detail of just those accounts, match line by line,
   and identify the miskeyed voucher lines. docs/Account/KEYING_GUIDE.md
   already covers the recurring vendors.
4. Fix by editing the miskeyed lines (Journal page, or a guarded idempotent
   SQL migration in the style of dev/migrations/2026-08-06_june_legacy_reclass_e1_e7_mrm_mgt.sql
   if there are many). HARD RULES: only manual, source-less journals past the
   accounting period lock may be touched; never create, delete, or
   cancel journals; every journal's total debit/credit must stay EXACTLY the
   same (move lines between accounts; amount edits must net 0.00 per journal);
   never invent balancing plugs — if an account cannot be tied from evidence,
   stop and ask me.
5. Re-run the tie-out until only documented exceptions remain. Report the
   final diff CSV path and each fix made.
```
