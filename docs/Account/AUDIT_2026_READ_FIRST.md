# 2026 year-end audit and discrepancy reconciliation — READ FIRST

**Created:** 2026-08-22  
**Scope:** Tien Hock (TH) and Green Target (GT) accounting only; Jelly Polly is excluded.  
**Working assumption:** prepare the year-end pack in December 2026 for the auditors' February 2027
work. Confirm the actual financial year and engagement dates with the auditor.

This is the short operational entry point for recovering context after months away. It says what to
preserve, what to run, and how to trace an amount. The linked handovers retain the detailed history.

## What to do next time

Attach the relevant files, then send only:

```text
@docs/Account/AUDIT_2026_READ_FIRST.md
```

No saved prompt is required. This document is the router for a fresh session:

- attached TH month-end TB files -> follow §5 and the linked monthly tie-out README;
- attached GT accounting files -> follow §6;
- an auditor's amount/workpaper question -> follow §4 against the named frozen pack;
- December close preparation -> follow §§2–3 before investigating individual differences.

For a routine TH tie-out, attach both the current month-end legacy TB and the immediately preceding
month-end TB. If only the current file is available, the session may perform a YTD comparison but
must report that movement isolation is incomplete and request the previous file.

The fresh session must start read-only, identify the company/month/database target, hash the inputs,
and follow the approval rules below. If those facts are not unambiguous from the message and files, it
must ask one concise question before accessing a database. A bare mention plus clear attachments is
otherwise sufficient.

## 1. Current map and hard rules

| Company | ERP location | Protected import boundary | Ongoing period |
|---|---|---|---|
| Tien Hock | `public.*` | history through **2026-05-31** | **2026-06-01** onward; TH has a monthly legacy-vs-ERP comparator |
| Green Target | `greentarget.*` | history through **2026-06-30** | **2026-07-01** onward; no generic post-cutover comparator exists |

Those dates protect imported history; they are **not** a 31 December close. A backdated entry can
change a saved December report, so every audit pack needs a frozen database/report version.

1. Keep the companies separate. Reconcile intercompany balances on two independent sides; never
   auto-post between schemas.
2. Production is the authoritative record of **what the ERP contains**, not automatic proof that an
   amount is economically correct. Confirm whether the legacy program continued in parallel and
   which accounting record management designated as the book of record for each company. Original
   invoices, receipts, bank statements, stock counts and approved schedules decide factual disputes.
3. Start read-only and identify the target explicitly. The tools do not share one default: TH's
   tie-out defaults to the dev Docker DB, while some GT harnesses load the root `.env`. Record the
   database, schema, git commit and dirty state before trusting any result.
4. Legacy `IMP` journals, staging, scans, fixtures and manifests are immutable evidence. Correct a
   later error with a separately traceable correction; never rewrite the imported proof.
5. Correct a source-owned journal through its invoice, receipt, payment, adjustment or voucher
   workflow. Treat `manual_override=true` as a deliberate-detachment warning.
6. No balancing plugs, silent tolerances or guessed classifications. A legacy/ERP difference proves
   only that the two records disagree.
7. Production SQL, cancellation, restore, locked-period correction or audit AJE requires explicit
   approval, a reviewed backup, and before/after verification.

For economic correctness, evidence wins. For current implementation/rollout status, check the target
database and shipped code first, then [MIGRATIONS_LOG.md](../MIGRATIONS_LOG.md), then the dated phase
handovers. Old headings saying `prod pending` can be historical.

**TH lock caveat:** Bank-In create/drawing/cancel and TH opening-balance writes are not protected by
the normal cutoff guard. Include both in post-snapshot change checks and never use either as a
shortcut to repair old history.

## 2. Before leaving the office

Private evidence is gitignored or otherwise absent from this checkout. A tracked manifest preserves
names/hashes, not the file contents.

| Evidence to preserve | Expected/private location or current gap |
|---|---|
| TH Jan–May exports | `dev/import/legacy-jan-may/data/` — absent here |
| TH Jan–May report scans | `dev/import/legacy-report-fixtures/data/` — absent here |
| TH June TB/account ledgers | original PDFs such as `JUNE_TIENHOCK_TRIAL_BALANCE.pdf` and `JUNE_MRM&MGT.pdf` are absent; only transcriptions remain |
| TH closing-stock scan | `dev/import/closing-stock-report/ClosingStockReport.pdf` — absent here |
| GT Jan–Jun workbooks | `dev/import/greentarget-legacy/data/` — absent here |
| GT Jan–Jun report scans | `dev/import/greentarget-report-fixtures/data/` — absent here |
| GT debtor authority | repository-root `GT_TRADE_DEBTORS.pdf` — absent; the tracked CSV cannot replace it |
| GT later corrections | annotated `statement.pdf` and support for `JV2606-01` are absent |
| Future month-end/audit files | approved private location and custodian are **not documented yet** |

Before departure:

- where a `source-manifest.json` exists, inventory every file and verify its SHA-256; otherwise create
  a checksum inventory without modifying the source;
- place one encrypted copy in an approved location, name its custodian, and test retrieval from the
  actual non-office setup;
- scan paper-only vouchers, bank advice, stock counts, asset invoices, financing documents and other
  evidence likely to decide a material difference;
- record the legacy-export operator, physical-document custodian, server-access holder and
  accountant/auditor contact;
- do not commit private evidence or secrets. `GT_TRADE_DEBTORS.pdf` at repository root is not covered
  by the current ignore rules, so check the full untracked-file status before every commit;
- do not send confidential scans to an external OCR service without approval.

## 3. December close pack

### Freeze a reproducible version

Record together for each company:

- period/as-of date and Asia/Kuala_Lumpur extraction timestamp;
- production database/server, deployed `git rev-parse HEAD`, and
  `git status --porcelain=v1 --untracked-files=all`;
- actual stored backup object/filename, database, timestamp, byte size, SHA-256, custodian and
  retention date. Download that same object, verify its hash, run `pg_restore --list`, restore it to
  an isolated non-production database, and record the restore/core-control result. Never rehearse by
  restoring over production. Do not rely only on local rotation: `backup.sh` deletes local backups
  after 180 days;
- report/source filenames and hashes, last included journal/reference, and any later backdated change;
- whether parallel legacy keying continued and the last signed-off comparison month;
- PBC/request list, approver/materiality if supplied, and pack version such as
  `2026-FYE-v1-pre-audit`.

Never overwrite a pack. An approved later adjustment creates `v2`, with the changed journals and
reports named in the discrepancy log.

Before reconciling 2026 movement, obtain the final signed 31 December 2025 TB and complete prior-year
AJE schedule. Prove pre-audit close + approved AJEs = final signed close = 1 January 2026 ERP opening,
using DR-positive/CR-negative signs. Prove `RP`/`RP_MTH` and prior-year profit separately so profit is
transferred exactly once. Historical scan parity alone does not prove the audited opening. After the
2026 AJEs are final, repeat the bridge to 1 January 2027: BS accounts carry, income/expense accounts
reset, and profit must not be duplicated as both report-derived Current Year Profit and an opening.

### Export and control

| Tien Hock pack | Green Target pack |
|---|---|
| TB, IS, BS and CoGM | TB, IS and BS |
| Three December closing-stock values and count support | Account/bank ledgers |
| Material account and bank ledgers; external bank statements/reconciliations | Debtors and `CD_SD` sub-schedule |
| Debtors/customer statements and control reconciliation | Journal list/detail and July–December source-completeness listing |
| Year journal list/detail and supporting documents | Supporting documents and external schedules |

Retain invoices, receipts, payment/bank vouchers, payroll/statutory support, supplier statements,
inventory counts, asset/financing support and tax schedules. Confirm the auditor's final request list.

Minimum controls:

1. Each TB balances; each BS balances; IS profit agrees with BS Current Year Profit.
2. Each material balance proves applicable opening + posted movement = close.
3. TH debtor-child detail agrees with its GL control. [DEBTORS_RECON_HANDOVER.md](DEBTORS_RECON_HANDOVER.md)
   §2 defines the check: **By Customer** is GL/accounting and **By Salesman** is operational. Recheck
   frozen production; do not copy the old zero-gap result.
4. Reconcile TH `CUST_DEP` separately: posted excess receipts minus active applications/refunds =
   remaining customer-owned excess. That schedule bridges to the absolute credit balance of
   `CUST_DEP`, with any anchor/manual deposit item separate. Never net the display-only unapplied
   overpayment badge into debtor control or aging.
5. GT's named/`CD_SD` sub-schedule agrees with the `CD_SD` control, preserving signed credits.
6. Each bank ledger agrees with its external statement after named outstanding cheques, deposits in
   transit, charges and timing items.
7. TH closing stock agrees with physical/count support and the three keyed statement values. Closing
   stock is report-level injection, not a GL journal.
8. GT July–December completeness is proved from source registers; a balanced TB does not prove every
   sale, receipt, payroll voucher or manual bank/cash item entered the GL.
9. GT `TH` and the TH-side intercompany account (likely `CL_GT`; verify its meaning) are reconciled by
   document and timing. At 30 June the historical starting evidence did **not** mirror: GT `TH` was
   RM3,931.25 DR while the older TH `CL_GT` baseline was RM12,415.60 DR. Do not force equality.
10. Every external schedule names its exact GL accounts/notes and shows opening + additions/charges −
    disposals/payments/releases = close. Its signed close ties to the frozen TB or remains a named,
    evidenced reconciling item with owner/approval.

## 4. One discrepancy: repeatable trace

`report line -> statement note/APPX -> contributing accounts -> account ledger -> journal header/lines -> owning ERP source -> original evidence`

1. Hash the auditor's file. Record company, exact period, filters, line, amount/sign, pack version and
   whether it is monthly movement, YTD or a closing balance.
2. Reproduce the frozen pack version before looking at today's report. If today differs, list entries
   created, edited, cancelled, restored or backdated since the snapshot.
3. Reconcile the full account set feeding the line. Prove opening and movement separately.
4. Capture journal reference/display reference, date/status, `source_type/source_id`,
   `manual_override`, accounts, amounts, particulars and cheque reference.
5. Retrieve the owning document and original evidence. Classify the cause: presentation, timing,
   missing/duplicate journal, wrong account/amount, opening, GL/subledger, incomplete feed or manual
   schedule.
6. Write the treatment and downstream effects before changing anything. Missing/ambiguous evidence,
   unclear ownership, imported/locked history, intercompany items or an unbalanced proposal stops the
   work for approval.
7. After approval, retain before/after evidence and rerun the narrow report, TB, BS, relevant
   subledger/control and applicable historical gate.

| ID | Company | Report/period | Difference/sign | Accounts/journals | Evidence/cause | Decision/approver | Correction/AJE | Pack | Status |
|---|---|---|---:|---|---|---|---|---|---|
| A-001 | TH/GT | | | | | | | | Open |

## 5. Tien Hock

Historical imported baseline: 3,863 posted `IMP` journals / 10,068 lines and 642 January anchors.
Organic June–December activity sits beside it; these counts do not prove later completeness.

### Monthly comparison

Run every not-yet-signed month **sequentially** from the last reconciled month through December. If
June is the last signed month, run July against June, August against July, and so on. The previous
file must be the immediately preceding month, not merely the last month checked.

```text
node dev/import/legacy-tieout/tie-out.mjs --month <YYYY-MM> --legacy <month-tb.csv> --prev-legacy <previous-month-tb.csv>
```

Use a fresh legacy month-end TB CSV (`code,debit,credit`, YTD). Require zero unexplained
`movement_diff` for every pair; a named older YTD difference may remain without affecting current
movement. Hash/archive both inputs and the output under `dev/import/legacy-tieout/out/`. If legacy
reopens a month, version its export and rerun that month plus every later pair affected. See the
[tie-out README](../../dev/import/legacy-tieout/README.md).

This tool alone defaults to the dev Docker DB. For production, set the README's production `DB_*`
values on the server or use a documented fresh production clone. Before trusting output, confirm
`current_database() = tienhock_prod` and `current_schema() = public`, then record the commit/dirty
state. The tool reads the DB but writes a private diff CSV.

### Historical proof gate

After restoring the private fixture data, run on the documented dev/proof database:

```text
node dev/import/legacy-report-fixtures/validate-fixtures.mjs
node dev/import/legacy-report-fixtures/verify-legacy-reports.mjs
```

Require `ALL CHECKS PASSED` and `ALL STAGES GREEN`. The current baseline is scan-exact; an old note
about tolerated `GP-202604-0001` statement drift is superseded.

Interpretation traps: statement accounts inherit the nearest ancestor's effective `fs_note`; TB/BS
use applicable anchors; IS/CoGM use exact 1 January stock anchors; monthly closing stock is injected
only into statements; and the default TB folds TD children into `DEBTOR`.

## 6. Green Target

Historical imported baseline: 1,705 posted legacy journals / 4,401 lines and **500 live** January
anchors after the approved dormant-`PBB1` removal. The imported subset matches the original Jan–Jun
prints; approved corrections such as `JV2606-01` are separately verified live overlays.

### Historical proof gates

Restore the private GT `data/` directories and use a documented dev/proof database. The first and
fixture-validation commands below write only regenerable files under `generated/`; the others are
verification reads. Preflight the DB target because the report harness loads root `.env`.

```powershell
node dev/import/greentarget-legacy/prepare-staging.mjs
node dev/import/greentarget-report-fixtures/validate-fixtures.mjs
node dev/import/greentarget-legacy/verify-chart.mjs
Get-Content -Raw -LiteralPath dev/import/greentarget-legacy/verify-import.sql | docker exec -i tienhock_dev_db psql -U postgres -d tienhock -v ON_ERROR_STOP=1 -f -
node dev/import/greentarget-legacy/verify-import.mjs
node dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs
node dev/import/greentarget-legacy/verify-trade-debtor-list.mjs
```

Read both GT READMEs for current success strings. The file-only validator's documented green result
is unusual and exits nonzero: it is green only at **12 FAIL + 6 WARN, all `BTFS`, with zero balance
mismatches**. Any other failure is real. The debtor gate requires the absent root
`GT_TRADE_DEBTORS.pdf`.

Do **not** run chart/import builders, staging loaders, monthly posting SQL or historical migrations
during an audit investigation.

### July–December

There is no GT equivalent of TH's generic comparator; the TH script contains TH-only tables, aliases
and debtor folding. If a parallel GT legacy/accounting record exists, obtain every month-end TB from
the last reconciled month and compare balances and movements sequentially through December. For each
difference, request only the affected GT ledger detail and use §4. If the exercise is material, build
a reviewed GT-specific read-only comparator—do not repoint the TH script. Independently reconcile
source registers to posted journals for all July–December sales, receipts, payroll vouchers and
manual cash/bank items.

## 7. Known items and unbuilt schedules

| Scope | Known historical item | Treatment |
|---|---|---|
| TH old June print | `CR_LD` +RM40 and `MBC`/`MBSM_K`/`MBRMF`/`MBSAF` are confined to the archived print/post-print amendments. | Do not carry them into a fresh month without source evidence. |
| GT Jan–Jun TB | Itemised debtors are RM1.01 above the printed grand total because the printed `DEBTOR` control nets two credits. | Exact presentation rule, not a tolerance. |
| GT file validator | 12 `BTFS` failures and 6 warnings. | Green only when every message is `BTFS` and balances match. |
| GT June live overlay | `JV2606-01`: DR `BWBC` / CR `PBB_1` RM2.70. | Dev + prod 2026-08-21; original scan remains immutable. |
| GT invoice `2026/00099` | ERP RM180 vs imported ledger RM230. | Named RM50 historical disagreement; no fabricated adjustment. |
| GT July debtors | Approved identity reallocation removed RM1,860 unallocated without changing `CD_SD`. | Dev + prod 2026-08-20; do not rerun an old pending runbook. |

Review newer [migration-log](../MIGRATIONS_LOG.md) entries before relying on this table.

**Open TH blocker, not an accepted exception:** repository history says active credit note
`TH-CN-26-1` (RM21.55) owns cancelled journal `2786`. Verify production and, if still present, resolve
it through the reviewed source/journal restore workflow before freezing the year-end pack.

The repository still does not create a complete statutory/auditor pack. Assign owners for Cash Flow,
Changes in Equity, prior-year comparatives, Schedule B, fixed assets/depreciation, HP, structured bank
reconciliations, AP/supplier/PV support and tax schedules. These are deliverable gaps, not reasons for
GL plugs; every completed schedule must reconcile to its GL control.

## 8. February workflow and references

For each auditor question, require company, report/workpaper, date, line, amount/sign and pack version.
Reproduce the frozen version, return a short evidence table, and separate book corrections from audit
reclasses/disclosures. Post only an approved, separately referenced AJE; then regenerate and hash all
affected reports, increment the pack version and close the log item only when evidence, decision,
approver and final output are named.

Detailed references—open only as needed:

- TH: [monthly tie-out](../../dev/import/legacy-tieout/README.md),
  [why differences recur](LEGACY_TIEOUT_STRATEGY.md), [keying rules](KEYING_GUIDE.md), and the
  [worked June example](JUNE_RECLASS_DESIGN.md).
- TH controls: [legacy report gate](../../dev/import/legacy-report-fixtures/README.md),
  [debtor reconciliation](DEBTORS_RECON_HANDOVER.md), and
  [journal/source ownership audit](INVOICE_PAYMENT_JOURNAL_FLOW_AUDIT.md).
- Current TH overview/gaps: [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md) and
  [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md).
- GT: [historical accounting handover](../GT/GT_ACCOUNTING_HANDOVER.md),
  [operational bridge](../GT/GT_OPERATIONAL_BRIDGE.md),
  [legacy import README](../../dev/import/greentarget-legacy/README.md), and
  [report fixture README](../../dev/import/greentarget-report-fixtures/README.md).

The handoff is complete only when both companies have separate versioned/hashed packs, audited
openings and core controls tie, private evidence is retrievable, every exception/schedule has an
owner, and no answer depends on an unexplained mutation or inaccessible office-only document.
