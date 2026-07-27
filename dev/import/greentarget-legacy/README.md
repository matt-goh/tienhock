# Green Target legacy ledger import — Jan–Jun 2026

Source intake and staging for the Green Target (GT) accounting build-out. This is the analogue of
[`dev/import/legacy-jan-may/`](../legacy-jan-may/), which did the same job for Tien Hock.

Plan and phase gates: [`docs/Account/GT_ACCOUNTING_HANDOVER.md`](../../../docs/Account/GT_ACCOUNTING_HANDOVER.md).
**Phases G0, G3 and G4 are complete.** G0 is file-only; G3 loads the chart of accounts; G4 imports the
Jan–Jun 2026 ledger as 1,705 posted journals plus 501 opening anchors.

```
node dev/import/greentarget-legacy/prepare-staging.mjs              # G0: write staging + report
node dev/import/greentarget-legacy/prepare-staging.mjs --check-only # G0: verify without writing
node dev/import/greentarget-legacy/prove-date-rule.mjs              # G0: why the date swap exists

node dev/import/greentarget-legacy/build-chart.mjs                  # G3: regenerate chart + migration
node dev/import/greentarget-legacy/build-chart.mjs --check-only     # G3: is the migration still derivable?
node dev/import/greentarget-legacy/verify-chart.mjs                 # G3: 55 gates against the database

node dev/import/greentarget-legacy/build-import-staging.mjs             # G4: derive staging + anchors
node dev/import/greentarget-legacy/build-import-staging.mjs --check-only # G4: still derivable?
node dev/import/greentarget-legacy/load-staging.mjs                     # G4: hash-validated load
node dev/import/greentarget-legacy/verify-import.mjs                    # G4: 62 gates vs the printed scans
```

## G4 runbook — the order matters

```
# 1. schema: the date_encoding provenance column
docker exec -i tienhock_dev_db psql -U postgres -d tienhock -v ON_ERROR_STOP=1 \
  -f - < dev/migrations/2026-07-27_greentarget_import_date_encoding.sql

# 2. derive the import staging population (3,469 source + 1,434 derived = 4,903 rows)
node dev/import/greentarget-legacy/build-import-staging.mjs

# 3. load it, hash-validated, in one transaction
node dev/import/greentarget-legacy/load-staging.mjs

# 4. post the six monthly batches (idempotent; rerunning any month is an exact no-op)
for m in 2026-01-01 2026-02-01 2026-03-01 2026-04-01 2026-05-01 2026-06-01; do
  docker exec -i tienhock_dev_db psql -U postgres -d tienhock -v ON_ERROR_STOP=1 \
    -v month_start=$m -f - < dev/import/greentarget-legacy/post-monthly-journals.sql
done

# 5. the 501 opening anchors
docker exec -i tienhock_dev_db psql -U postgres -d tienhock -v ON_ERROR_STOP=1 \
  -f - < dev/migrations/2026-07-27_greentarget_opening_anchors.sql

# 6. both verifiers
docker exec -i tienhock_dev_db psql -U postgres -d tienhock -v ON_ERROR_STOP=1 \
  -f - < dev/import/greentarget-legacy/verify-import.sql
node dev/import/greentarget-legacy/verify-import.mjs
```

`verify-import.sql` proves the database is a faithful projection of staging — header and line
fidelity, per-journal balance, anchors, per-account month-end closes, Tien Hock isolation.
`verify-import.mjs` proves something independent: that the imported ledger reproduces the **six
printed Trial Balance scans**, account by account, 2,850 exact comparisons. Run both; they catch
different classes of error, and during G4's own fault injection the SQL verifier caught a per-line
regression the JS one did not.

## ⚠ The 1,433 derived CD_SD lines

The legacy export **prints no cash-in-hand leg at all.** Counter sales credit revenue with no debit
(`#/#`, 1,011 groups, 218,360.00 CR); bankings debit the bank with no credit (`RV#/#/#` 421 groups
plus `JV26/06/77`, 229,070.00 DR). 1,433 of 1,705 journal groups are therefore unbalanced in the
source. G0 staged that verbatim and flagged it **"NAMED, NOT RESOLVED — do not synthesise these rows
without user approval."**

G1 resolved it by evidence, and **the user approved synthesising the legs on 26 Jul 2026.** The cash
sits in `CD_SD` "CASH DEBTORS (SUNDRY DEBTORS)", whose GTDB section prints only a static 2026-06-30
snapshot of 65,705.40 with zero transaction detail — which is exactly why G0 first read it as an
opening-date anomaly.

**The derivation is forced, not chosen.** No RV group is mixed: every one is either fully balanced
against a debtor (51) or has no debtor leg at all (421). So each unbalanced group gets exactly one
CD_SD line for its own imbalance, there is no allocation judgement anywhere, and every imported
journal balances individually.

**It is falsifiable, and four independent gates test it.** A single mis-allocated line breaks at
least one of these:

| Prediction | Result |
|---|---|
| CD_SD month-ends 85,915.40 / 72,895.40 / 69,377.40 / 71,955.40 / 66,445.40 / 65,705.40 | exact, all six |
| The 2026-01-01 opening anchor set sums to **exactly 0.00** | exact — no named residue |
| All six month-end trial balances balance DR = CR | exact |
| The 28 debtor children equal the printed DEBTOR control, all six months | exact |

Derived rows are unmistakable in `greentarget.import_legacy_rows`: `source_kind='DERIVED'`,
`date_encoding='derived'`, `provenance='derived_cash_debtors_leg'`, `repaired=true`,
`special_case='cd_sd_unbanked_counter_cash'`, `source_physical_line` NULL and
`injected_after_physical_line` pointing at the printed row they follow. Their `particulars` echo the
printed particular with `(DERIVED - COUNTER CASH RECEIVED)` or `(DERIVED - COUNTER CASH BANKED)`
appended, so they cannot read as transcribed source in a printed ledger either.

## ⚠ `posting_sequence` is a within-MONTH ordinal, not within-day

Green Target's legacy report orders an account's rows by **month, then document type** — not by date.
`JWDR/06/26` dated 30 Jun prints *before* `PBEB004/06` dated 12 Jun; only 477 of 502 sections are
date-monotonic while all 502 are month-monotonic. Neither a date sort nor the staging row order
reproduces the printed order (10–24 violations per month).

Measured in G4: ordering journals by **`(month, journal_ref)` in C collation** reproduces every one
of the 502 printed account sections with **zero violations on all six months**. That ordinal is what
`greentarget.journal_entries.posting_sequence` stores, dense 1..N within each month. G5 must order a
ledger by `(DATE_TRUNC('month', entry_date), posting_sequence, journal_entry_lines.display_order)`.

## Files

| Path | Tracked | What it is |
|---|---|---|
| `data/` | no (gitignored) | The two source `.xlsx` exports. **Contains customer data — never commit, never upload, never open in Excel** (see below). |
| `generated/` | no (gitignored) | `greentarget_jan_jun_staging.csv`, `validation-report.json`, `gt-chart-of-accounts.csv`. |
| `source-manifest.json` | yes | SHA-256 + byte-length + expected-count pins for all 11 handed-over sources (2 workbooks, 9 scans). |
| `account-aliases.json` | yes | Every audited decision: excluded sections, opening-date exceptions, decoded journal families, the named cash-in-hand gap. |
| `read-xlsx.mjs` | yes | Dependency-free ZIP + sheet-XML reader that returns **raw** cell values. |
| `prepare-staging.mjs` | yes | The intake pipeline and all its gates. |
| `prove-date-rule.mjs` | yes | Standalone demonstration that the date swap is load-bearing. |
| `build-chart.mjs` | yes | **G3.** Derives the 503-account chart from the G1 Trial Balance fixtures + the G0 ledger and writes `dev/migrations/2026-07-26_greentarget_chart_of_accounts.sql`. |
| `verify-chart.mjs` | yes | **G3.** 55 property-based gates read out of the database. Written *before* the loader. |
| `debtor-map.json` | yes | **G3.** R6 artifact: legacy debtor code → `greentarget.customers`. 28 debtors, 2 candidates, **0 approved** — needs the user before G7 consumes it. |
| `build-import-staging.mjs` | yes | **G4.** Derives the 1,434 CD_SD rows from the pinned G0 staging and writes `generated/greentarget_import_staging.csv`, the derivation report, and `dev/migrations/2026-07-27_greentarget_opening_anchors.sql`. |
| `load-staging.mjs` | yes | **G4.** Hash-validated `\copy` into `greentarget.import_legacy_rows`, in one transaction, with a validation block that refuses to commit an unapproved population. |
| `post-monthly-journals.sql` | yes | **G4.** One idempotent monthly batch, parameterised by `-v month_start=`. Run six times. |
| `verify-import.sql` | yes | **G4.** Written *before* the loader. Proves the database is a faithful projection of staging; read-only. |
| `verify-import.mjs` | yes | **G4.** 62 gates and 2,850 per-account comparisons against the six printed Trial Balance scans. Never reads staging. |

## ⚠ Do not hand-edit the chart or its migration

The chart is **generated**. `2026-07-26_greentarget_chart_of_accounts.sql` is written by
`build-chart.mjs`, and `--check-only` fails if the file on disk stops matching what the sources say.
Editing it by hand breaks the one property that makes 503 accounts trustworthy: that every field came
from a validated source and can be re-derived from it. If the chart is wrong, fix the source or the
generator, regenerate, re-apply, and re-run `verify-chart.mjs`.

`fs_note` holds the **printed Trial Balance APPX, verbatim** — the legacy system's own per-account
note field. The Balance Sheet / Income Statement line notes are a separate statement layout and they
disagree for exactly three dormant accounts (`INPUT.TAX`, `FC TL`, `FC HP`), which record that fact in
`account_codes.notes`. **G5's note→line mapping must never assume APPX equals the statement note.**

## ⚠ Do not "fix" the date handling

Column B holds entry dates in **two** cell kinds, and the difference is the only thing that recovers
the true date:

| Cell kind | Why | Recovery |
|---|---|---|
| numeric, style `s=2` (`numFmtId 14`, `mm-dd-yy`) — 1,570 cells | The original text was `DD/MM/YYYY` with **day ≤ 12**, so Excel parsed it US-style and **transposed day and month**. | Convert the serial (1900 system), then swap month and day back. |
| shared string — 1,900 cells | Original text had **day > 12**, so Excel could not read it as a US date and left it verbatim. | Parse literally as `DD/MM/YYYY`. |

`prove-date-rule.mjs` output: **614 of 1,570** numeric cells land outside Jan–Jun 2026 without the
swap. The other 956 land *inside* the period while being silently wrong (e.g. 2 May read as 5 Feb) —
which is why the balance-chain and range gates exist as well as the swap.

Therefore: **never** re-save these workbooks from Excel, **never** read them with `cellDates: true`,
and **never** convert them to CSV first. `read-xlsx.mjs` deliberately performs no date interpretation
at all.

## What G0 proved

Run `--check-only` to reproduce all of it. Every line below is asserted in code, not just reported.

| Check | Result |
|---|---|
| Both source SHA-256 / byte length / sheet dimension pins | match |
| Worksheet layout, title row, column headers, `date1904=false`, `numFmtId 14` style present | match |
| Per-source counts (worksheet rows, sections, transaction rows, numeric vs text date cells) | match |
| §3a invariant 1 — every numeric serial renders with both components ≤ 12 | 1,570 / 1,570 |
| §3a invariant 2 — every text date has day > 12 | 1,900 / 1,900 |
| §3a invariant 3 — every recovered transaction date inside 2026-01-01 … 2026-06-30 | 2,968 / 2,968 |
| Every `BALANCE C/FWD` dated 2026-01-01, or declared as an exception | 501 + 1 declared |
| §3a invariant 4 — every section's DR/CR chain walks `BALANCE C/FWD` → printed close | **502 / 502** |
| `BALANCE C/FWD` DR/CR cell, when printed, is a pure echo of the balance | 64 / 64 |
| Month order non-decreasing within every section | 502 / 502 |
| **2026-06-30 closing trial balance** | **DR = CR = 2,896,809.54** |
| Opening + movement reconciles to closing | exact |
| Journal families all documented in `account-aliases.json` with matching row counts and balance flags | 9 / 9 |
| Balance Sheet tie-outs (below) | 7 / 7 exact |
| Staging CSV SHA-256 stable across runs | `6945530…7a2ffecd` |

### June 2026 Balance Sheet tie-outs, straight from the raw workbooks

| Line | Note | Computed | Printed |
|---|---|---:|---:|
| Trade receivable (Σ GTDB debtor closes) | 22 | 156,782.22 | 156,782.22 |
| Cash at bank (`PBB_1`) | 19 | 28,468.37 | 28,468.37 |
| Tax recoverable (`CA_TAX`) | 25 | 24,139.50 | 24,139.50 |
| Deferred tax liabilities (`CL_TAX`) | 12 | 62,928.00 | 62,928.00 |
| Share capital (`SC`) | 21 | 100,000.00 | 100,000.00 |
| Retained profit b/f (`RP`) | 20 | 226,944.53 | 226,944.53 |
| Cash in hand | 6 | .00 | .00 |

## Journal families (decoded in G0)

| Family | Rows | Meaning | Balances? |
|---|---:|---|---|
| `#/#` e.g. `2026/00001` | 1,015 | **Cash / counter sales invoice.** Credits revenue only — `TGA` (906) and `TGB` (109). | no — see gap |
| `PB#/#` e.g. `PB005/03` | 789 | **Cheque payment voucher.** Every row carries a physical cheque number in column E. | yes |
| `RV#/#/#` e.g. `RV26/01/01` | 566 | **Receipt voucher.** Always debits `PBB_1`; credits GTDB debtors for credit sales. | no — see gap |
| `PBEB#/#` e.g. `PBEB011/06` | 223 | **Electronic bank payment.** Column E is the bank transaction id. | yes |
| `I#/#` e.g. `I2026/0001` | 189 | **Credit sales invoice.** GTLD credits revenue, GTDB debits the debtor — both sides exactly 46,848.20. | yes |
| `JBSL/#/#` | 130 | Monthly **payroll journal**. | yes |
| `JWDR/#/#` | 43 | Monthly **directors' remuneration journal**. | yes |
| `JV#/#/#` | 11 | Journal vouchers: five monthly bank-charge pairs, plus `JV26/06/77`. | no — see gap |
| `PBE#/#` | 2 | One electronic payment whose reference was keyed `PBE` instead of `PBEB`. | yes |

## Named exceptions — carry these into G3/G4

**No malformed rows, no line normalizations, no control bytes, no unparsable dates or balances.**
Tien Hock needed all of those; Green Target needs none. What it does have:

1. **`GTLD DEBTOR` — excluded.** A static trade-debtor *control* section with zero transactions whose
   printed `BALANCE C/FWD` is 156,782.22 — the **30 June** debtor total, not a 1 January opening (the
   GTDB detail opens at 159,409.32 and moves −2,627.10 to close at exactly 156,782.22). Importing
   both would double-count the receivable. Tien Hock excluded its own `DEBTOR` section for the same
   reason.

2. **`GTDB CD_SD` — opening-date exception.** "CASH DEBTORS (SUNDRY DEBTORS)", 65,705.40, zero
   transactions, and the only section in either workbook whose `BALANCE C/FWD` is dated **2026-06-30**
   rather than 2026-01-01. It is part of the June receivable that reconciles to 156,782.22, but the
   export does not evidence its true 1 January opening. Tien Hock had the same class of exception
   (`THDB SUN` at 2026-05-31). **Ask the user which date to anchor it at before G4.**

3. **The unprinted cash-in-hand account — one structural gap explains every imbalance in both
   workbooks.** Counter sales credit revenue with no debit; bankings debit the bank with no credit:

   | | Cents |
   |---|---:|
   | Cash-sale revenue credits (`#/#` → `TGA`/`TGB`) | CR 218,360.00 |
   | Banked out of cash in hand (RV bank debits − GTDB debtor credits, + `JV26/06/77`) | DR 229,070.00 |
   | Implied cash-in-hand movement | 10,710.00 CR |
   | **Implied 2026-01-01 opening for a .00 close** | **DR 10,710.00** |

   The chart *has* an account for this — `CH_REV2` "CAH RECEIVED (2)" — but the export prints it with
   a 0.00 opening and **zero transactions**. Consequences: the **closing** trial balance balances
   exactly with no adjustment, but the 1 January opening set is short 10,710.00 DR and the Jan–May
   month-end trial balances do not balance. The implied month-end cash-in-hand balances are a
   **falsifiable prediction G1 must test against the six Trial Balance scans**:

   | 31 Jan | 28 Feb | 31 Mar | 30 Apr | 31 May | 30 Jun |
   |---:|---:|---:|---:|---:|---:|
   | 20,210.00 | 7,190.00 | 3,672.00 | 6,250.00 | 740.00 | .00 |

   The June Balance Sheet independently prints "Cash in hand (note 6) .00", which agrees.
   **G0 deliberately did not synthesise these rows.** Whether to derive them, and under which account
   code, is a user decision — see the open questions below.

4. **Four `#/#` reference collisions — REVIEWED IN G4, merge confirmed (user, 26 Jul 2026).** Grouping
   by `(entry_date, journal_ref)` per handover decision R3 merges two rows into one journal at
   `2026-03-11|2026/00401`, `2026-03-24|2026/00472`, `2026-04-23|2026/00631` and
   `2026-05-22|2026/00806`. Handover §7 asked whether the large `#/#` family makes this common: it
   does not — 1,015 rows collapse to 1,011 groups. **Reading the four pairs settles it: each is one
   invoice printed on two rows** — same reference, same date, same revenue account, *identical*
   particulars (`2026/00401` is TGB 200.00 + 36.00, both `/CD-LIST`). Merging produces the document
   that actually exists; splitting would assert two invoices share one invoice number.

## Open questions — both ANSWERED (26 Jul 2026)

1. ~~**Cash in hand.** Should the import derive a GT cash-in-hand account…~~ **Resolved.** There is no
   missing account: the cash is inside `CD_SD`, and `CH_REV2` is genuinely dormant. The user approved
   deriving one CD_SD leg per unbalanced journal group — see "The 1,433 derived CD_SD lines" above.
2. ~~**`CD_SD`.** Its `BALANCE C/FWD` is dated 30 June…~~ **Resolved.** That 65,705.40 is its
   2026-06-30 **close**, not an opening. It is anchored at 2026-01-01 with its evidenced
   **76,415.40**, and that is what makes the opening set balance to exactly zero.
3. **Still open, and it belongs to G7, not G4:** `debtor-map.json` has 0 approved mappings. Only 2 of
   28 legacy debtors have an ERP candidate and neither is proven — `SUTERA`'s ledger description is
   "SUTERA MEGAH SDN BHD" while ERP customer #20 is "SUTERA SERIMEWAH SDN BHD", a different company.
   Nothing consumes the file yet.

## Staging output

`generated/greentarget_jan_jun_staging.csv` — 3,469 rows (501 `opening`, 2,968 `transaction`),
CRLF, deterministic, SHA-256 pinned in `source-manifest.json`. Column shape mirrors Tien Hock's
`import_legacy_rows` so the GT clone of that table can load it directly in G4, plus a `date_encoding`
column recording which §3a branch recovered each date.

Every row keeps `source_file` + `source_sha256` + `source_physical_line` + `source_row_index`, so any
imported figure can be traced back to an exact cell in a hash-pinned workbook.
`generated/validation-report.json` additionally carries `perSectionChains` — per-account opening, all
six month-end balances, and closing — which is what G5 will compare against the transcribed Trial
Balances.
