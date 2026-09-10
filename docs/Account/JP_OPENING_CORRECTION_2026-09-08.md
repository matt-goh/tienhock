# JP opening correction - 8 September 2026

**Status:** applied to development on 2026-09-08 at 11:58:36 Asia/Kuala_Lumpur;
an immediate rerun made no changes. **Production applied by the user on 2026-09-08
at 12:30:59 Asia/Kuala_Lumpur**, confirmed by the supplied `tienhock_prod` terminal output.
The user confirmed that the development database was freshly copied 1:1 from production.
The assistant did not access production or deploy; the user ran the prepared SQL through
`sudo -u postgres psql` from the SSH shell.

## Production completion evidence

The supplied output identifies `tienhock_prod` and shows January JP 9,659.45 unchanged,
June JP **594.10 -> 9,546.10**, all eight January-August `after_difference` values
**0.00**, and final **COMMIT**. Before the update, June-August each showed -8,952.00.
Production TB debit/credit totals match the verified development totals below. The
script's checkpoint, balanced-journal and unchanged-other-opening checks all passed.

This records the user's execution output; production report endpoints were not independently
called by the assistant. The production backup filename/hash was not included in the supplied
output and remains unrecorded here. The separate ARI finding is unaffected.

## Evidence and cause

The user supplied the photograph labelled **"Senarai Auditor"** in response to the
request for JP's 1 January 2026 opening. It shows **JP / JELLY POLLY FOOD INDUSTRIES,
RM9,659.45 in the debit column**. The earlier message says CR_JP's RM8,952 was removed
because it was absent from the auditor's opening list. The images were supplied inline;
no local source-image file was available for a SHA-256 inventory.

| Opening / movement | RM, debit positive |
|---|---:|
| Original imported CR_JP January opening | 8,952.00 |
| Original imported JP January opening | 707.45 |
| Auditor-confirmed, already-keyed JP January opening | 9,659.45 |
| Posted JP January-May movement | -113.35 |
| Required JP 1 June opening | **9,546.10** |
| Old JP 1 June opening | 594.10 |
| Lost debit balance from June onward | **8,952.00** |

The original staged evidence remains in `import_legacy_rows`: CR_JP is physical line
4289 of `EXCEL_THLD_(JAN-MAY26).csv`; JP is line 4536 of
`EXCEL_THDB_(Jan-May26).csv`. This migration does not rewrite either import.

The latest-anchor report rule explains why January-May balanced while June-August did
not: JP's old June checkpoint superseded the revised January roll-forward. Only JP
disagreed in the May-to-June checkpoint comparison. The June opening date contains a
**partial checkpoint set**, so its standalone total must not be forced to balance.

## Applied change and guards

[2026-09-08_jp_june_opening_correction.sql](../../dev/migrations/2026-09-08_jp_june_opening_correction.sql)
updates one existing `public.account_opening_balances` row:
`account_code = 'JP'`, `as_of_date = '2026-06-01'`, debit **594.10 -> 9,546.10**,
plus a dated explanatory note and `updated_at`.

It preserves the already-keyed January amount and deleted CR_JP opening. It changes no
journals, source documents, chart mappings, import staging, or other company's records.
The January row's original import note remains historical metadata; the June correction
note and this document explain why the revised January value differs from the import.

The script requires the expected company/database, JP debtor classification, exactly the
two JP opening dates, January 9,659.45, Jan-May movement -113.35, no CR_JP openings or
January-August posted movement, balanced January openings, no unrelated June checkpoint
mismatch, balanced posted journals, and the reviewed monthly TB difference pattern. It
verifies all January-August TBs and June checkpoint continuity before committing and
compares every other opening row against its before-image. If June is already 9,546.10,
it verifies the result without changing notes or timestamps.

The transaction briefly locks accounting tables against concurrent writes; it stops
after five seconds if a lock cannot be obtained. A failed guard rolls the transaction
back; review the reported difference instead of weakening the guard.

## Production: user-run procedure

Use `sudo -u postgres` for production database access. The shell-paste method below
does not require deploying or uploading the SQL file. The procedure below is retained
for the audit record; the completed correction does not need another run.

First back up the affected table and inspect the archive contents and current JP rows
(the following is a Bash example; all artifacts stay in the user's private home directory):

```bash
set -euo pipefail
umask 077
jp_audit_dir="$HOME/tienhock-audit/jp-opening-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$jp_audit_dir"
sudo -u postgres pg_dump -Fc -d tienhock_prod --table=public.account_opening_balances > "$jp_audit_dir/openings-before.dump"
pg_restore --list "$jp_audit_dir/openings-before.dump" > "$jp_audit_dir/backup-contents.txt"
sha256sum "$jp_audit_dir/openings-before.dump"
cat "$jp_audit_dir/backup-contents.txt"
sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d tienhock_prod -c "SELECT current_database(); SELECT account_code, to_char(as_of_date,'YYYY-MM-DD') AS as_of_date, amount, notes FROM public.account_opening_balances WHERE account_code IN ('JP','CR_JP') ORDER BY account_code, as_of_date;" | tee "$jp_audit_dir/rows-before.txt"
```

The archive must contain `public.account_opening_balances` table data. Review the JP
rows against the table above, then use either method below.

### Paste from the local editor without deploying a file

If still inside an interactive `psql` session from the failed paste, press Ctrl+C to
clear the input, then enter `\q` to return to the normal SSH shell. Disconnecting
rolls back any still-open transaction; the current-row query above establishes whether
an earlier attempt had already committed.

In the **normal SSH shell**, enter:

```bash
sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d tienhock_prod -f - <<'JP_OPENING_SQL'
```

Paste the complete contents of the local migration SQL, then enter `JP_OPENING_SQL`
alone on a new line and press Enter. The shell sends the collected text to `psql`
through standard input in file mode. Keep the delimiter quoted as shown so dollar
signs in the SQL blocks are preserved. This retains every guard and creates no server file.

A complete ready-to-paste wrapper was also generated locally at
`out/audit-2026-jp-opening/paste-production.sh` (gitignored). Copy its entire contents
into the SSH shell after the backup review. It includes the current JP opening query
before the unchanged migration. The same heredoc transport was verified against dev;
the already-corrected row produced a no-op and eight zero TB differences.

### If the SQL file is already on the server

From the repository root, the current shell can read the file and pass it to postgres:

```bash
sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d tienhock_prod -f - < dev/migrations/2026-09-08_jp_june_opening_correction.sql | tee "$jp_audit_dir/correction-result.txt"
```

Expected: one updated JP June row, January still 9,659.45, June now 9,546.10, all eight
`after_difference` values 0.00, and final `COMMIT`. A repeat execution reports no row
changed. Refresh the reports after the SQL; application deployment alone does not apply
this data correction.

In the app, verify January-May unchanged, June-August TBs balanced, and JP statement
closing/ageing balances as below. The existing Balance Sheet issue described next is
separate. Production execution is recorded above and in
[MIGRATIONS_LOG.md](../MIGRATIONS_LOG.md); add the production backup identity when available.

## Verification on the fresh production copy

All checks ran on `tienhock_dev_db / tienhock / public` with local commit
`aa7b3e575691e98b56eaff2bb1bda793ffc7949d`. The actual financial-report, customer-statement
and account-ledger route handlers were called in read-only database transactions before
and after the data correction.

| Month | Corrected TB debit = credit | JP statement / ledger / ageing total |
|---|---:|---:|
| June 2026 | 17,085,889.42 | 9,690.40 |
| July 2026 | 17,897,606.29 | 9,703.40 |
| August 2026 | 18,207,498.81 | 9,742.40 |

January-May reports are unchanged. All eight TBs balance and JP ageing agrees with the
statement and ledger. All eight Income Statement and CoGM responses are unchanged.
Balance Sheet Note 22 increases by exactly 8,952.00 in June-August.

Before/after full-row fingerprints are identical for the other **2,211 opening rows**,
**9,272 journal headers**, **23,329 journal lines**, and **12,635 staged import rows**.
A transaction rehearsal rolled back successfully before the committed run; the committed
migration's rerun was a no-op.

Private local evidence is under `out/audit-2026-jp-opening/` (gitignored):
`before-reports.json`, `after-reports.json`, the verification harness, and the reviewed
table backup `jp-opening-before-20260908T0352.dump`.
Backup SHA-256: `d3de3f4b2969cdf37713a1878ffe7ca9236beaafbb7b75a8b323c048848e4043`.
The archive listing and its original JP rows were inspected before applying the update.

The original legacy fixture baseline is historical evidence, not an assertion that the
new auditor-keyed openings must still equal the old scans. Original fixture files are
absent locally; full scan-parity gates were not run or rewritten. The current January
set has **641 rows, debit = credit RM13,281,760.08**, rather than the historical V2
642-row baseline. This session confirms the JP correction, not every auditor-keyed row.

No build, TypeScript check or lint was run.

## Separate finding: Balance Sheet RM31,495.55

Before this correction, assets exceeded liabilities plus equity by **31,495.55** in
January-May and **22,543.55** in June-August. Correcting JP restores the June-August
difference to the same **31,495.55** already present in January-May.

The narrow trace finds `ARI / ALLOWANCE FOR IMPAIRMENT` with a January credit opening
of **31,495.55**, mapped to **Note 5, income_statement, expense**. It is the only nonzero
January opening on a non-Balance-Sheet note outside the recognised opening-stock notes.
The TB includes this credit, while the Balance Sheet's profit calculation does not
consume non-stock P&L opening balances.

The subsequently supplied auditor photograph identifies ARI as **Allowance of Impairment
on Receivables**, with a handwritten total of **31,495.55**. A read-only preview placing
ARI in Note 22 balances January-August Balance Sheets while preserving TB totals and
profit. The separate ARI classification correction was subsequently applied to dev on
**2026-09-08 at 13:03:55 KL**; production applied at **2026-09-08 13:21:16 KL**, confirmed
by the supplied output showing eight zero BS/TB differences and final `COMMIT`. No ARI amount was
changed. The user subsequently stated that CL_AFI belongs under receivables and ARI
under expenses. Keep CL_AFI unchanged; ARI's intended treatment is reopened pending
its adjustment year/sign/entry. The applied ARI mapping has not been reversed. See the
[core report review](CORE_REPORT_REVIEW_2026-09-09.md) and
[ARI execution record](ARI_BALANCE_SHEET_REVIEW_2026-09-08.md). The independently
auditor-supported JP correction remains applied.
