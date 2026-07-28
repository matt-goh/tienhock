# Green Target legacy report fixtures — Phases G1 and G5

The nine scanned legacy reports, the CSV fixtures transcribed from them (**G1**), and the two
harnesses that keep them honest. Analogue of
[`dev/import/legacy-report-fixtures/`](../legacy-report-fixtures/).

- `validate-fixtures.mjs` (**G1**) — are the fixtures a faithful transcription of the scans?
  Checks each scan's own printed arithmetic and compares every figure to the G0 ledger.
- `verify-legacy-reports.mjs` (**G5**) — do the shipped **report engines** reproduce those scans?
  See [below](#the-g5-harness).

Plan: [`docs/Account/GT_ACCOUNTING_HANDOVER.md`](../../../docs/Account/GT_ACCOUNTING_HANDOVER.md) §5 and §9.

```bash
# G0's ledger report is a prerequisite — run it first if generated/ is empty
node dev/import/greentarget-legacy/prepare-staging.mjs

node dev/import/greentarget-report-fixtures/validate-fixtures.mjs
node dev/import/greentarget-report-fixtures/validate-fixtures.mjs --only 2026-03

node dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs          # G5, all stages
node dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs tb       # one stage

# render pages to read
node dev/import/legacy-report-fixtures/render-pdf.mjs \
  dev/import/greentarget-report-fixtures/data/GT_TRIAL_BALANCE_MAR26.pdf \
  dev/import/greentarget-report-fixtures/generated/pages/TB_MAR26 all 2
```

## The G5 harness

`verify-legacy-reports.mjs` **imports and runs**
[`src/routes/greentarget/accounting/report-engine.js`](../../../src/routes/greentarget/accounting/report-engine.js)
— the same functions the Express routes serve — against the dev database, and compares the result to
these fixtures. Tien Hock's harness re-implements its engines' SQL query-for-query; this one does
not, so the verified logic and the served logic cannot diverge. It connects with `pg` using the
`DB_*` values in the repo-root `.env`, and is strictly read-only.

The exact `tb` and `statements` comparisons apply while the live G3 seed fields still match the
pinned evidence. If a user intentionally changes a seeded description, ledger type, parent, report
note, sort order or active status, those two stages report the affected codes and pass as explicitly
not applicable: current reports are then expected to follow the approved live chart. Notes-only edits
or a field restored to its evidence value do not disable the comparisons. `verify-chart.mjs` and
`verify-import.mjs` continue to prove the immutable 503-code payload, imported ledger and historical
closes independently, while the `ledger`, `bridge` and `regressions` stages still run normally.

| Stage | What it proves | Gates |
|---|---|---:|
| `tb` | `buildTrialBalance` vs all six printed Trial Balances — every printed line, **in printed order**, the netted DEBTOR control, and grand totals | 54 |
| `statements` | `buildIncomeStatement` + `buildBalanceSheet` vs the printed June statements, line by line, incl. the three APPX overrides and each line's account composition | 17 |
| `ledger` | `buildAccountLedger` for **all 501 accounts**: printed row order, month-end running balances, derived-row flagging, the five bank statements | 17 |
| `bridge` | the §3d operational-bridge counts, so [`GT_OPERATIONAL_BRIDGE.md`](../../../docs/Account/GT_OPERATIONAL_BRIDGE.md) cannot rot | 12 |
| `regressions` | the engines + the G7 posting services are schema-isolated (static scan), the LEGACY population is unmoved (organic journals may accrue beside it), no organic journal predates the 2026-07-01 open date, Tien Hock is untouched | 24 |

Two gates are worth knowing about because they look surprising:

- **The engine's Trial Balance grand total equals the printed grand total EXACTLY** — not 1.01 above
  it. Netting the 28 debtor children into the printed DEBTOR control absorbs the two credit balances
  (KBOX −0.01, RUMAH MERAH −1.00). Running with `ledger_type=TD` itemises them and the harness
  asserts that run carries exactly 1.01 of credit. Both figures are right; they are different reports.
- **The `ledger` stage takes ~90 seconds.** It runs the real engine once per account rather than
  sampling, which is what makes the printed-row-order gate exhaustive (2,968 rows).

`BTFS` is absent from the engine's output on purpose — see below.

## Status

| Fixture | Pages | State |
|---|---:|---|
| `gt-bs-2026-06.csv` | 1 | **done** (Opus exemplar) |
| `gt-is-2026-06.csv` | 2 | **done** (Opus exemplar) |
| `gt-tb-2026-01.csv` … `gt-tb-2026-06.csv` | 11 each | **done** (Sonnet, 25 Jul 2026) — see finding below |
| `GT_ACCOUNTCODE.pdf` | 24 | **do not transcribe** (see below) |

All 66 pages transcribed. `validate-fixtures.mjs` (no `--only`) reports every fixture PASS except one
recurring, genuine, expected failure — see "BTFS" below — plus a matching coverage WARN on each TB.

**Expected `validate-fixtures.mjs` result: 12 FAIL + 6 WARN, every one of them the `BTFS` line, with
`473 balances compared to the ledger, 0 mismatched` on all six months.** That is the green state. It
is *not* the same thing as the G5 harness passing — `verify-legacy-reports.mjs` reports
`ALL STAGES GREEN` with zero failures, because `BTFS` correctly never reaches the report engines.

## Finding: `BTFS` has no G0 ledger counterpart (all six months)

Every one of the six Trial Balances prints a `BTFS` / `BATTERY FORKLIFT (KB)` row (APPX `2-10`,
immediately after `BTJCB`) with **both DEBIT and CREDIT genuinely blank** — not `.00` like every other
zero-balance row. It does not exist anywhere in the G0 ledger: not as a GTLD section, not as any row in
`greentarget_jan_jun_staging.csv` (confirmed by grep, not just the summary JSON). Every other prefix
family that has a "Forklift Shovel" account (`BT`, `INS`, `OIL`, `R`, `SV`, `TY`) has exactly one such
account and no separate KB-side "Forklift (KB)" variant either — so this isn't a class of account G0
missed, it is this one specific code. It reads as a 2026 chart-of-accounts entry that was never
exercised and never got a section header in the raw GTLD workbook. Per the house rule, the fixtures
transcribe it verbatim (blank/blank) rather than omitting it or forcing a match; `validate-fixtures.mjs`
fails this one line on every month by design.

**Settled in G3/G4/G5.** G3 carries `BTFS` in the chart (active, APPX `2-10`); G4 gave it **no opening
anchor and no journal line**; G5's engines only surface accounts that have one or the other, so its
*absence* from the report output is precisely what reproduces the blank/blank printing, distinct from
the `.00` every other zero account prints. The G5 harness asserts it both ways — the fixture must
still print blank, and the engine must still emit no row — and fault injection confirms that removing
the anchored-balance filter, or giving `BTFS` a zero anchor, breaks four gates at once. **These 12
`validate-fixtures.mjs` failures are permanent and correct; they are not yours to clear.**

All three Mar/Apr/May pinned predictions in `source-manifest.json` (`debtorControlCents`,
`grandTotalCents`) were independently confirmed against the scans during this pass — they now match
`scanConfirmed: true` in spirit, though the manifest field itself was left untouched since updating the
manifest is a G1-scaffolding concern, not part of this transcription pass.

## The two house rules

1. **Never edit a fixture to make a gate pass.** If a gate fails, the fixture is right until the scan
   image proves otherwise. Re-render the page and look at it.
2. **Stop and ask** if a figure is illegible, a column is ambiguous, or a printed code will not
   resolve. A named question costs one message; a wrong inference poisons a phase.

## Why the gates are hard to fool

Each fixture is checked twice over:

- **Internal** — the scan's own printed arithmetic must recompute: each TB's DEBIT and CREDIT columns
  must sum to the printed grand total and to each other; the statements' subtotals must recompute.
- **External** — every transcribed figure is compared against the **G0 ledger**, which was
  independently proven in [`../greentarget-legacy/`](../greentarget-legacy/) (502/502 balance chains,
  closing TB DR = CR = 2,896,809.54). That is ~2,800 exact per-account comparisons across the six
  months, so a single misread digit fails and names the account:

  ```
  FAIL  gt-tb-2026-01.csv line 1: AC 2010 (AC_2010) printed 9,999.99
        but the G0 ledger closes 2026-01 at 0.00 (delta 9,999.99)
  ```

The validator runs incrementally — untranscribed fixtures report `MISSING`, not `FAIL` — so run it
after every page.

## Column models (established from the scans, 25 Jul 2026)

### Trial Balance — `gt-tb-YYYY-MM.csv`

Printed columns: `ACC/CODE  PARTICULAR  APPX  DEBIT  CREDIT`.

```csv
page,line_no,record_type,acc_code,particular,appx,debit,credit
1,1,account,AC 2010,ACCRUAL-2010,1,.00,
1,4,account,AC GST,GST,10,"639.23",
11,470,account,DEBTOR,TRADE DEBTOR,22,"181,166.72",
11,471,grand_total,,,,"2,681,186.33","2,681,186.33"
```

- `record_type` is `account` or `grand_total`.
- Transcribe `acc_code` **exactly as printed**, with spaces. The validator maps printed space →
  ledger underscore (`AC 2010` → `AC_2010`, `BKSC KH` → `BKSC_KH`, `WS OTH4` → `WS_OTH4`).
- **`APPX` is the financial-statement note number** — this is the column G3 needs, so get it right.
  Values include hierarchical notes (`2-1`, `2-10`, `18-3`). It must be identical for the same
  account across all six months; the validator checks that.
- Amounts go in `debit` **or** `credit`, never both. Blank means the column was empty. `.00` is a
  printed zero and must be recorded, not dropped.
- The TB lists the **whole chart** including zero-balance accounts — 474 accounts + the `DEBTOR`
  control line.

### Income Statement / Balance Sheet — `gt-is-2026-06.csv`, `gt-bs-2026-06.csv`

```csv
page,line_no,record_type,ref,particular,note,amount
1,4,line,,TRADE RECEIVABLE,22,"156,782.22"
1,11,subtotal,current_assets_total,,,"348,202.19"
```

- `record_type`: `heading` (no amount), `line`, `subtotal`, `total`.
- `particular` is **verbatim**, uppercase as printed, commas preserved (quote the field).
- `ref` is a stable machine key used **only** for the report's unlabelled rule-lines — the scan prints
  those as a bare amount under a horizontal rule with no text. Labelled rows leave `ref` empty and are
  matched on `particular`.
- Brackets are transcribed as printed. The parser reads a bracket as negative.

Both are already done; use them as the reference for formatting.

## Findings from the scaffolding pass — read these before transcribing

**1. The Income Statement is YEAR-TO-DATE, not the month of June.** The header says
"FOR THE MONTH OF 06/2026", but revenue 265,208.20 is the six-month movement of `TGA` + `TGB` +
`WS_OTH` + `WS_OTH4`, and page 2 is titled "PROFIT FOR THE FINANCIAL YEAR". This **corrects** the
answer to open question 6 in the handover §4. Every one of its lines was reconstructed exactly from
the G0 ledger, which validates the G3 account-to-note mapping in advance — see
`printedIncomeStatementExpectations.lines[].ledgerAccounts` in `source-manifest.json`.

**2. The Trial Balance nets all debtors into a single `DEBTOR / TRADE DEBTOR / APPX 22` line**, and
that line carries the unbanked counter-sale cash as well as trade debtors. Expected values for all
six months are pinned in `source-manifest.json`; Jan, Feb and Jun were confirmed against their scans
during scaffolding, Mar/Apr/May are predictions **G1 must confirm**.

**3. `GT_ACCOUNTCODE.pdf` is not worth transcribing.** Its header reads `PAGE 1  09:47:12  01 MAR 2010`
— a 2010-vintage GL master with only two columns (`GL.MASTER`, `PARTICULAR`) and **no note column**,
listing accounts that no longer exist. The six 2026 Trial Balances carry the full chart *with*
descriptions *and* the APPX note, so they supersede it entirely for G3. Keep it as historical
reference; transcribe only if the user asks. This removes 24 of the plan's 93 pages.

**4. The Balance Sheet's brackets mean two different things** — a sign on line items, "less" on
subtotals. Recorded as `bracketConvention` in `source-manifest.json`; G5's Balance Sheet engine must
reproduce it.

## Retention

The scans and fixtures are permanent audit evidence: `data/` and `generated/` are gitignored and must
never be committed, uploaded, or sent to an external OCR service. Render and read them locally.
