# Legacy Jan-May 2026 staging preflight

This directory contains deterministic, file-only preparation for the legacy
THLD and THDB ledger exports. It validates the immutable source files and emits
a normalized staging CSV plus an audit report. It does **not** connect to
PostgreSQL, create tables, post journals, or run any import SQL.

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

## Stop boundary

Successful generation is the end of this preparation step. Review
`validation-report.json` before designing or running a database load. Do not
COPY the staging file, apply migrations, cancel journals, create anchors, or
post import journals as part of this runbook.
