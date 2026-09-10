# Confirmed closing-stock correction - 9 September 2026 KL

**Status:** applied to refreshed **dev `tienhock` at 11:32:52 KL**.
**Production applied by the user at 12:02:07 KL**, confirmed by their supplied
`tienhock_prod` execution output and final `COMMIT`. No report-code deployment is needed
for these saved stock values to affect the existing reports.

The user confirmed the latest production data had been imported into dev before
application. Inspection at **11:30:30 KL** found 9,304 journal headers / 23,421 lines
and only the three May stock rows, exactly matching the supplied May figures. The
prior JP and ARI corrections were present. All verification used `public` in local
`tienhock`, accessed through `tienhock_dev_db` / `127.0.0.1:5434`; the DB reports
`172.18.0.2:5432`. No production connection was made by the assistant.

The supplied production results confirm **21 inserts**, **24 verified amounts**,
unchanged May values and **eight zero TB/BS differences**. Every displayed CoGM,
profit and asset/equity total matches the dev proof below. Output retained privately
as `out/audit-2026-stock-correction/production-applied.txt`, SHA-256
`4295eb43152f2242ceb6b0e58ca23f37dbacef00454afc4e7bfec6b94c9a2b90`.
`production-verification.json` records the comparison. The transcript's paste echo
is incomplete; verification rests on the complete PostgreSQL result tables and
final COMMIT, not reconstruction of the echoed SQL. Refreshed app-report confirmation
has not yet been supplied.

## Change and source

Migration: [`2026-09-09_confirmed_closing_stock_jan_aug.sql`](../../dev/migrations/2026-09-09_confirmed_closing_stock_jan_aug.sql).
SHA-256: `4e60ab1a9a55511cf8121895012c6f090b065c04d9f5966f516006f471eab6f1`.

The user supplied a photograph of monthly finished-products, raw-materials and
packing-materials values. These are exact-month closing stock in MYR. January
agrees with the earlier photographed CoGM/IS/BS and May agrees with existing data.

| Month 2026 | Finished goods, 14-1 | Raw materials, 14-2 | Packing materials, 14-3 |
|---|---:|---:|---:|
| January | 131,705.70 | 511,650.28 | 186,249.24 |
| February | 136,032.50 | 406,967.93 | 168,003.48 |
| March | 111,351.40 | 453,547.80 | 167,829.37 |
| April | 182,292.50 | 359,123.77 | 180,756.74 |
| May | 188,979.60 | 336,909.82 | 182,194.43 |
| June | 139,687.22 | 300,295.04 | 153,303.09 |
| July | 233,983.20 | 406,576.18 | 166,472.89 |
| August | 110,801.50 | 475,764.17 | 147,811.49 |

Inserted **21** missing `public.closing_stock_values` rows; all **24** January-August
values are now present in dev. May's amounts, IDs and timestamps are unchanged.
Matching existing rows are always preserved, so a partially completed manual entry
is accepted. Any conflicting saved amount causes an exception and transaction rollback.
The script also requires May's three previously reviewed rows to be present.

This is a data correction only, with no schema change. New rows use the table's
normal ID/timestamp defaults and NULL actor IDs, as no application staff identity
was supplied for the SQL execution. The migration, source fixture and execution log
provide its provenance. The rollback rehearsal consumed sequence values; gaps in
generated IDs are expected and were not reset.

No opening anchors, GL journals, stock quantities, ARI/CL_AFI classifications or
amounts, or other company data were changed. The reports already read monthly
closing-stock values: CoGM deducts raw/packing stock; IS deducts all three stock
categories from cost of sales; BS includes the stock assets and the corresponding
increase in current-year profit. TB does not use this table.

## Verification completed

- Reviewed a custom-format backup of the entire stock table and its sequence.
- Compared the migration's SQL TB/BS/profit/CoGM controls with the actual report
  handlers in all eight months before and after application.
- Rehearsed all 21 inserts and eight report checks, then rolled back. The original
  table fingerprint was preserved.
- Deliberately changed a May value by RM0.01 inside a test transaction; the migration
  rejected the conflict and the original table fingerprint was preserved.
- Applied at **11:32:52 KL**, ending with `COMMIT`. Actual-handler checks passed at
  **11:33:01 KL**; all responses matched the pre-application stock preview.
- Reran the same SQL: **zero inserts**. Verification at **11:33:20 KL** confirmed
  all stock rows, including their metadata, were identical to the first application.
- Fingerprints of account codes, opening balances, journal headers/lines, imported
  staging and statement notes were identical before/after. May's four full report
  responses were unchanged. All eight full TB responses were unchanged and balanced;
  every BS difference remained zero.

| Month | CoGM after correction | Current-year profit after correction | BS assets = liabilities + equity |
|---|---:|---:|---:|
| January | 537,223.39 | 110,409.92 | 9,098,673.97 |
| February | 997,601.52 | 157,001.61 | 9,023,266.68 |
| March | 1,470,730.05 | 117,855.18 | 8,963,871.47 |
| April | 2,003,332.41 | 227,440.51 | 9,037,714.32 |
| May | 2,479,030.27 | 284,825.01 | 8,939,709.38 |
| June | 2,998,097.33 | 324,311.79 | 8,920,487.55 |
| July | 3,528,156.43 | 423,212.98 | 9,162,066.21 |
| August | 3,803,054.90 | 499,311.90 | 8,930,160.71 |

These are current-handler **YTD** results. January CoGM matches the legacy
photograph exactly. This does **not** close the remaining January expense/profit
difference of **31,853.85**, certify the handwritten TB totals, or implement the
requested legacy report layouts. Those remain separate tasks in the
[core review](CORE_REPORT_REVIEW_2026-09-09.md). Keep both confirmed allowance credits
unchanged; the earlier ARI profit-opening diagnostic is not an approved correction.
No build, typecheck or lint was run; validation was targeted to the data correction.

## Production: paste from the normal SSH shell

The user executes these steps after reviewing the result. There is no need to deploy
the SQL file or restart the application.

1. Paste [`backup-production.sh`](../../out/audit-2026-stock-correction/backup-production.sh).
   It creates a private `closing-stock-20260909-...` directory under the SSH user's
   home and displays the archive listing and SHA-256. Review the table data and
   sequence entries and retain the printed backup directory/hash.
2. Paste the entire [`paste-production.sh`](../../out/audit-2026-stock-correction/paste-production.sh)
   block into the **normal SSH shell**, not inside an existing `psql` prompt. It
   contains the exact hashed migration and runs
   `sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d tienhock_prod -f -`.
3. Confirm `database = tienhock_prod`, the expected inserts (21 for the reviewed
   state), all 24 matching stock amounts, eight zero TB/BS differences and final
   **`COMMIT`**. The notice `Inserted 0 missing...` on a later run is the intended
   idempotent result. Report figures can reflect later legitimate ledger changes;
   the script verifies the stock effect against its own locked before-state.
4. Refresh January-August statements. Record the production output, backup
   path/hash and verification time in [MIGRATIONS_LOG.md](../MIGRATIONS_LOG.md).

The script checks the reviewed allowance/opening context, note definitions, existing
stock values, balanced starting reports and zero closing-stock GL note balances.
It holds short table locks with a 5-second lock timeout and 60-second statement
timeout. A failed guard leaves the transaction unapplied; investigate the named
condition instead of removing guards or replacing saved values blindly.

The two paste helpers are private generated files under ignored `out/`. If absent
in a later checkout, regenerate the SQL wrapper from the tracked migration without
altering its contents. Do not delete the migration until production application is
confirmed and its exact contents remain recoverable.

### Production backup recorded; temporary retention

The user supplied a successful backup listing on 9 September 2026:

- Database: `tienhock_prod`; archive created **11:59:00 +08**.
- Directory: `/home/tienhock/closing-stock-20260909-20260909-115857`.
- File: `closing-stock-before.dump`.
- SHA-256: `e553422ad1908895769439a00001c20a1fb58d984769710d7bf84a0f7bbc1ba0`.
- The readable custom-format archive lists the table, table data, sequence and its
  value, constraints and production ACLs. This is the supplied archive-list output,
  not an independently performed restore test. Production SQL execution subsequently
  committed at 12:02:07 KL and all its checks passed.

**User preference:** this temporary rollback backup must not remain on the server
or in storage indefinitely. Keep it through production execution and verification.
Once the SQL has committed with all 24 values correct, eight zero TB/BS differences,
and the refreshed app reports confirm the stock correction (January CoGM
RM537,223.39 and unchanged May), tell the user that this specific temporary backup
directory can be removed. Do not tie cleanup to completion of the separate ARI/TB
investigation or year-end audit, or require another permanent copy of this same dump.
Retain the migration, supplied values, execution results and backup path/hash in the
audit documentation. The application's routine backups have their own retention policy.

Cleanup status: **completed by the user**, following confirmation that January-August
CoGM amounts are correct. The user replied that cleanup was already done before
authorising the CoGM layout work. This is user confirmation, not a separate server
inspection. Retain the path/hash above as audit evidence; do not request another
copy of this temporary dump. The recorded
[`cleanup-production-backup.sh`](../../out/audit-2026-stock-correction/cleanup-production-backup.sh)
names only the two known backup files and removes the directory only if empty.

## Retained evidence

Private directory: `out/audit-2026-stock-correction/`. The verification JSON records
the source commit, dirty state, report-handler hash and migration hash for the
refreshed snapshot. This supersedes the earlier read-only preview as application proof.

| Artifact | SHA-256 |
|---|---|
| `stock-before-20260909-113030.dump` | `91b2d564114e9a3d834ae39989e96a41f963a6ed3b327d297baecf8011242529` |
| `before.json` | `b27dd9a61fdbab22e60e502b1f044f1bfb6a263d549ec0f7a0305bcfeca3666f` |
| `after.json` | `4e6acd4f74d66624364357842f6c1fae550ad3b5b5ddc12dd37f5980cf517026` |
| `rerun.json` | `2a1a0d8461c804f7d738f38344d74ef36b4c8f46ff66ab2ccdce8d590c65d207` |

Also retained: `verify-stock.mjs`, `rehearsal.txt`, `conflicting-value-rejected.txt`,
`applied.txt`, `rerun.txt`, both production helpers and `artifact-manifest.json`.
The source transcription remains
`out/audit-2026-core-review/closing-stock-2026-01-08.user-confirmed.json`, SHA-256
`4fe2eca54aa8a53efd1fef56fb01914dccaa44ab71a8faa8380bcfcaedc55e43`.
That hash identifies the transcription, not the unavailable original inline image.
