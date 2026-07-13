# Legacy Jan-May 2026 staging preflight

This directory contains the deterministic preparation and guarded database
runbook for the legacy THLD and THDB ledger exports. The preparation script
itself is file-only: it validates the immutable source files and emits a
normalized staging CSV plus an audit report without connecting to PostgreSQL.
The separate loader and SQL files perform the reviewed database phases.

**Status:** the guarded Jan-May import was successfully applied to production
on 2026-07-13. Production contains the exact 3,863 imported journals and
10,068 lines, with DR = CR RM13,503,516.15. The proof and pristine rollback
databases were retained, the rollback and post-import backups were validated,
and the production accounting/application checks passed. The 2026-07-14
presentation migration described below is the final layer over that unchanged
accounting projection.

## Source placement

Place the two private exports in `data/` without editing or re-saving them:

- `EXCEL_THLD_(JAN-MAY26).csv`
- `EXCEL_THDB_(Jan-May26).csv`

The files and generated artifacts are gitignored because the exports contain
customer information. `source-manifest.json` pins each source's SHA-256, byte
length, CRLF record count, column count, DOS Ctrl-Z sentinel, and audited
exceptions. A changed source fails before any output is written.

For the current audited files:

| Source | Bytes | CRLF records | SHA-256 |
|---|---:|---:|---|
| THLD | 861,967 | 12,684 | `6230d4613768f3f1b51c6195852560446103e39b57b2deb8ac575d8c8ecaa918` |
| THDB | 330,107 | 10,271 | `6ef5ee949cca9b7903cff5ede201bea5d6e6bc8d341c45e91ea060aeac905a81` |

## Run

After placing the files in `data/`:

```powershell
node dev/import/legacy-jan-may/prepare-staging.mjs
```

To validate the currently untracked root copies without moving them:

```powershell
node dev/import/legacy-jan-may/prepare-staging.mjs `
  --thld "EXCEL_THLD_(JAN-MAY26).csv" `
  --thdb "EXCEL_THDB_(Jan-May26).csv"
```

Use `--check-only` to perform the complete parse and transformation in memory
without writing artifacts. Use `--output-dir PATH` to select another output
directory. Unknown or duplicate options fail.

The default outputs are:

- `generated/legacy_jan_may_staging.csv`
- `generated/validation-report.json`

## What is enforced

- The parser accepts exactly one physical CSV record per CRLF line and uses no
  locale-dependent date or floating-point money parsing.
- `DD/MM/YYYY` is day-first. `MM-DD-YY` is Excel's mangled month-first form.
  Dates are emitted directly as `yyyy-MM-dd` strings.
- DR, CR, and running balances are represented as integer cents.
- Every source row index must equal its physical line number.
- Every account must have exactly one `BALANCE C/FWD`, dates cannot move
  backwards within an account, and every printed running-balance chain must
  reconcile exactly.
- THLD `HR` and `DEBTOR` are excluded. THDB `HR` remains and maps to `HR-D`.
- All 32 CSV projections belonging to the 16 source-owned
  `THCN/26/01`-`THCN/26/16` journals are excluded.
- Aliases and exact-code decisions are read from `account-aliases.json`; there
  are no fuzzy matches or whitespace trimming.
- Invoice `015347` becomes one four-line logical group routed through
  `CHARLES-C`, preserving line display references `15347` and `T260526`.
- Every final `journal_group_key` must balance to zero cents.
- The serialized staging CSV must match the approved SHA-256 pinned in
  `source-manifest.json`; count- or total-preserving row drift also fails.

## Corrected malformed-row finding

THLD physical lines 7262 and 12049 are the only malformed CSV records. Each is
matched by its exact raw-line SHA-256 before a declared field-level
normalization is applied:

- Line 7262 is MBRM `PV012/01`, a real **DR 194.40** row.
- Line 12049 is ROTH `PV005/03`, a real **DR 225.00** row.

The earlier throw-away parser treated line 7262 as DR 3.00 and shifted line
12049's DR 225.00 into CR. Those two parse errors created the false apparent
DR gaps of 191.40 and 450.00. Correct parsing produces source totals of
DR = CR 1,350,848,707 cents, so no MBRM or ROTH row is injected.

The manifest also records two non-structural source oddities rather than hiding
them: an audited unit-separator byte in THLD line 4417 PARTICULAR, and the idle,
zero-balance THDB `SUN` section whose C/FWD row is dated 2026-05-31. The latter
is retained in staging; a later opening-anchor import must intentionally select
nonzero openings plus zero-balance active-account fences, as specified by the
main plan.

## Current deterministic result

The audited run produces:

| Check | Result |
|---|---:|
| Physical source transaction rows | 10,104 |
| Staged opening rows | 2,567 |
| Staged transaction lines | 10,068 |
| Balanced logical journal groups | 3,863 |
| Staged debit | 1,350,351,615 cents |
| Staged credit | 1,350,351,615 cents |
| Unbalanced groups | 0 |

The staging CSV has 12,635 data rows. Four carry `repaired=true`: the two
exactly normalized physical lines and the two user-approved derived
`CHARLES-C` routing lines. The validation report names every exclusion, alias,
repair, special-case row, source imbalance that is resolved by those declared
transformations, and the final staging SHA-256.

## Staging columns

The output columns are:

```text
stage_sequence, record_kind, source_file, source_kind, source_sha256,
source_physical_line, source_row_index, injected_after_physical_line,
legacy_account_code, account_code, account_description, entry_date,
journal_ref, journal_group_key, line_display_reference, particulars,
cheque_reference, debit_cents, credit_cents, running_balance_cents,
provenance, repaired, repair_reason, special_case
```

`source_kind=DERIVED` is used only for the two approved `CHARLES-C` routing
lines. Their source line columns and `running_balance_cents` are blank because
the legacy projection did not print those debtor lines; provenance and the
anchor source line are explicit instead.

For `record_kind=opening`, the authoritative signed C/FWD value is
`running_balance_cents` (DR positive, CR negative). Do not derive anchors from
`debit_cents`/`credit_cents`: THDB commonly prints its opening only in the
BALANCE column, leaving both amount columns blank.

## Guarded database execution

Only run these steps after restoring a fresh production snapshot and reviewing
`generated/validation-report.json`. The database scripts abort on any source,
schema, population, amount, ownership, or checkpoint drift.

1. Apply the conflict migration, fs-note remap, approved HPB classification,
   and staging-table migration in that order:

   - `dev/migrations/2026-07-13_legacy_jan_may_conflicts.sql`
   - `dev/migrations/fs_note_remap_2026-07.sql`
   - `dev/migrations/2026-07-13_hpb_interest_suspense_note16.sql`
   - `dev/migrations/2026-07-13_legacy_jan_may_staging.sql`

2. Load the hash-validated CSV into staging:

   ```powershell
   node dev/import/legacy-jan-may/load-staging.mjs
   ```

   The loader verifies the approved staging CSV SHA-256 before opening Docker,
   then checks its embedded source hashes and performs `TRUNCATE`, `COPY`, and
   every staging invariant in one transaction. The 180 unmapped accounts it
   permits are all zero-opening-only provenance sections; no transaction or
   nonzero opening uses a missing account. Run `prepare-staging.mjs` first when
   the private source files themselves need to be revalidated.

   Docker is the default. For a disposable proof database or the system
   PostgreSQL used by production, select direct mode and export every
   connection setting explicitly; the loader deliberately does not guess or
   load `.env` itself:

   ```bash
   export LEGACY_IMPORT_DB_MODE=direct
   export DB_HOST=localhost
   export DB_PORT=5432
   export DB_USER=postgres
   export DB_NAME=tienhock_prod_proof
   read -rsp 'PostgreSQL password: ' DB_PASSWORD
   export DB_PASSWORD
   printf '\n'
   node dev/import/legacy-jan-may/load-staging.mjs
   ```

   Do not point direct mode at the live database until the production
   read-only inventory, proof-database rehearsal, final backup, and maintenance
   cutover gates have passed.

3. Copy `post-monthly-journals.sql` into the database container and execute it
   once per month, changing `month_start` from January through May:

   ```powershell
   docker cp dev/import/legacy-jan-may/post-monthly-journals.sql tienhock_dev_db:/tmp/post-monthly-journals.sql
   docker exec -i tienhock_dev_db psql -U postgres -d tienhock --no-psqlrc -v ON_ERROR_STOP=1 -v month_start=2026-01-01 -f /tmp/post-monthly-journals.sql
   ```

4. Run the independent acceptance suite. It reconstructs all source running
   balances, checks every staged header/line and source-owned CN, verifies all
   five cumulative per-account closes, and compares the 31 May close with every
   1 June checkpoint:

   ```powershell
   docker cp dev/import/legacy-jan-may/verify-import.sql tienhock_dev_db:/tmp/verify-import.sql
   docker exec -i tienhock_dev_db psql -U postgres -d tienhock --no-psqlrc -v ON_ERROR_STOP=1 -f /tmp/verify-import.sql
   ```

5. Only after that passes, insert the 1 January anchors and rerun both scripts
   to prove their no-op behavior:

   ```powershell
   docker cp dev/import/legacy-jan-may/insert-opening-anchors.sql tienhock_dev_db:/tmp/insert-opening-anchors.sql
   docker exec -i tienhock_dev_db psql -U postgres -d tienhock --no-psqlrc -v ON_ERROR_STOP=1 -f /tmp/insert-opening-anchors.sql
   ```

6. Run the read-only invoice reconciliation. It hard-pins the local-date
   scope, consolidated-wrapper exclusion, every exact and corrected-reference
   match, all named differences, and both zero-value populations:

   ```powershell
   docker cp dev/import/legacy-jan-may/verify-invoice-reconciliation.sql tienhock_dev_db:/tmp/verify-invoice-reconciliation.sql
   docker exec -i tienhock_dev_db psql -U postgres -d tienhock --no-psqlrc -v ON_ERROR_STOP=1 -f /tmp/verify-invoice-reconciliation.sql
   ```

   The human-readable acceptance record is
   [LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md](../../../docs/Account/LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md).

7. After the final successful run of the original `verify-import.sql`, apply
   the auditor-facing presentation migration and immediately rerun it to prove
   its no-op/idempotent path:

   ```powershell
   docker cp dev/migrations/2026-07-14_legacy_journal_presentation.sql tienhock_dev_db:/tmp/2026-07-14_legacy_journal_presentation.sql
   docker exec -i tienhock_dev_db psql -U postgres -d tienhock --no-psqlrc -v ON_ERROR_STOP=1 -f /tmp/2026-07-14_legacy_journal_presentation.sql
   docker exec -i tienhock_dev_db psql -U postgres -d tienhock --no-psqlrc -v ON_ERROR_STOP=1 -f /tmp/2026-07-14_legacy_journal_presentation.sql
   ```

   The original `post-monthly-journals.sql`, `verify-import.sql`, and anchor
   scripts intentionally describe and verify the pre-presentation `IMP`
   projection: artificial line/header references, `source_type/source_id` NULL,
   and the original import description. Run all of their required first-run and
   no-op checks before this step. Do not run those old scripts after presentation.
   `2026-07-14_legacy_journal_presentation.sql` is the final idempotent verifier
   for the presented state and must itself pass twice.

   The presentation migration does not change dates, accounts, amounts, status,
   line order, cheque references, or the hidden unique `IMP-*` header key. It:

   - keeps `entry_type='IMP'` for immutable internal ownership while assigning
     semantic `legacy_entry_type` values: `S` 2,121; `PUR` 83; `B` 383; `C` 45;
     `RV` 410; `REC` 758; `J` 53; `JVDR` 5; `JVSL` 5;
   - sets `source_type='legacy_import'` and `source_id=journal_group_key`, giving
     every imported header a unique direct link to its hash-pinned staging group;
   - preserves the repeatable legacy reference for display. For example `34847`
     legitimately identifies a purchase on 7 May and a sale on 8 May, so it
     cannot replace the globally unique internal `IMP-*` key;
   - restores every line's exact legacy-visible reference. The approved special
     four-line `015347` group retains both `15347` and `T260526`;
   - replaces `Legacy import {ref}` with a deterministic source-particular
     summary. The export has no journal-header description field: when a group
     has several distinct PARTICULAR values, the header is only the first
     source particular plus `(+N more particulars)`. Exact source text remains
     on every line and the summary must not be described as a source header.

## 2026-07-13 development and production execution result

- Staging: 12,635 rows; 2,567 openings; 10,068 transaction lines;
  3,863 balanced groups; DR = CR RM13,503,516.15.
- Posted `IMP`: 3,863 journals / 10,068 lines, with each monthly batch matching
  its pinned count and amount. A January batch rerun inserted no duplicates.
- Source proof: 12,665 reconstructed rows including the 32 source-owned CN
  projections; zero running-balance mismatches.
- 31 May checkpoint proof: 2,568 source accounts; all 1,571 June anchors match;
  the 52 June anchors absent from the export are deliberate zero debtor fences.
- 1 January anchors: 580 total = 291 nonzero + 289 explicit zero fences. The
  existing `C-CARE(1)` RM7,635.00 row was preserved; 579 rows were inserted.
  Signed opening net is RM1,456,480.37 CR, the approved named residue.
- The anchor rerun inserted zero rows, and the independent acceptance suite
  passed again after anchor insertion.

The development result was reproduced successfully on production on
2026-07-13. The live inventory passed, the complete sequence was rehearsed on a
fresh proof restore, PM2 was stopped for the guarded write, and byte-validated
pre- and post-import backups plus the pristine rollback database were retained.
Production was then verified through the database acceptance gates, January-
June report checkpoints, PM2 health, and internal/external HTTP checks. The
separate operational-invoice differences remain open until the original legacy
invoice/item evidence is available; they do not alter the exact imported ledger
projection.

## Production cutover record and reproduction runbook (system PostgreSQL)

The guarded cutover completed successfully on 2026-07-13. The commands below
remain the exact recovery/reproduction runbook; they are not permission to rerun
the import against the live database. Do not use the database-replacement upload
for this work and do not rerun the broad June refactor migrations. The 13 July
production snapshot already contained the June receipt, bank-in, debtor, and
visible-reference end state. The completed rollout added only the guarded
Jan-May phases listed above.

The production checkout must first contain the anchor-aware report code, the
pre-June application posting lock, and API/UI guards that identify immutable
historical rows through `source_type='legacy_import'`, retaining `IMP` as the
compatibility fallback. Keep the private source CSV, generated
staging/report, inventory output, and database backups outside Git with mode
`0600`/a restrictive umask.

On the server, configure standard libpq variables without putting the password
on a command line. A `~/.pgpass` file with mode `0600` is preferred; otherwise
read it interactively:

```bash
set -euo pipefail
umask 077
export PGHOST=localhost
export PGPORT=5432
export PGUSER=postgres
export PGDATABASE=tienhock_prod
read -rsp 'PostgreSQL password: ' PGPASSWORD
export PGPASSWORD
printf '\n'
```

Before any write, run the repeatable-read inventory and retain its output:

```bash
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/import/legacy-jan-may/production-readonly-inventory.sql \
  | tee legacy-jan-may-inventory-before.txt
```

Require the audited pre-rollout account and REC fingerprints, zero ownership
exceptions, zero `IMP` journals, the exact 16-CN source population, the June
end-state indicators, and the expected invoice census. Any false comparison or
unexpected row is a stop, not permission to weaken a guard.

Rehearse the complete sequence below against a fresh disposable restore of a
new production dump. Then start the maintenance window, stop `tienhock-server`
with PM2, take a final custom-format `pg_dump`, validate it with
`pg_restore --list`, restore it into a disposable rollback database, and rerun
the inventory there. Run the live inventory once more only after PM2 is
stopped. Do not continue unless both the backup restore and final inventory
pass.

Apply the guarded database phases in this exact order:

```bash
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/migrations/2026-07-13_legacy_jan_may_conflicts.sql
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/migrations/fs_note_remap_2026-07.sql
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/migrations/2026-07-13_hpb_interest_suspense_note16.sql
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/migrations/2026-07-13_legacy_jan_may_staging.sql
```

Load the private, hash-pinned staging CSV through direct mode:

```bash
export LEGACY_IMPORT_DB_MODE=direct
export DB_HOST="$PGHOST"
export DB_PORT="$PGPORT"
export DB_USER="$PGUSER"
export DB_NAME="$PGDATABASE"
node dev/import/legacy-jan-may/load-staging.mjs \
  --csv dev/import/legacy-jan-may/generated/legacy_jan_may_staging.csv
```

Post and verify all five months, insert anchors only after the first acceptance
pass, then rerun every idempotent phase:

```bash
for month in 2026-01-01 2026-02-01 2026-03-01 2026-04-01 2026-05-01; do
  psql --no-psqlrc --set ON_ERROR_STOP=1 --set month_start="$month" \
    --file dev/import/legacy-jan-may/post-monthly-journals.sql
done

psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/import/legacy-jan-may/verify-import.sql
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/import/legacy-jan-may/insert-opening-anchors.sql

for month in 2026-01-01 2026-02-01 2026-03-01 2026-04-01 2026-05-01; do
  psql --no-psqlrc --set ON_ERROR_STOP=1 --set month_start="$month" \
    --file dev/import/legacy-jan-may/post-monthly-journals.sql
done

psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/import/legacy-jan-may/insert-opening-anchors.sql
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/import/legacy-jan-may/verify-import.sql
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/migrations/2026-07-14_legacy_journal_presentation.sql
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/migrations/2026-07-14_legacy_journal_presentation.sql
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/import/legacy-jan-may/verify-invoice-reconciliation.sql
psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file dev/import/legacy-jan-may/production-readonly-inventory.sql \
  | tee legacy-jan-may-inventory-after.txt
```

Every command above commits independently. If any command, comparison, or
database-level post-import check fails, do not improvise and do not restart
PM2. Restore or swap back to the already validated pristine rollback database,
confirm the pre-rollout inventory, and only then restart the application. Once
all database checks pass, restart PM2 and immediately perform read-only
January-June Trial Balance, Balance Sheet, account-ledger, bank, and General
Statement spot checks through the app. Stop PM2 again before investigating any
failed application-level check.

That procedure passed in production on 2026-07-13 for the accounting import.
The proof database and pristine rollback database were intentionally retained
for sign-off. For the 2026-07-14 presentation change, begin from the already
verified production projection, take another backup, then run/re-run only the
final presentation migration after confirming the old `verify-import.sql`
acceptance record from the cutover.
