# ARI Balance Sheet review - 8 September 2026

**Reopened 9 September 2026 KL:** the user now says **CL_AFI is under receivables and
ARI is under expenses**. Keep CL_AFI unchanged. The earlier receivables classification
was an inference from the schedule heading; balancing the BS did not establish the
auditor's intended treatment. January's newly supplied statements also reveal missing
closing stock and a separate expense/accrual difference. See the
[core report review](CORE_REPORT_REVIEW_2026-09-09.md) before making another correction.
The production change below remains applied; it has not been reversed.

**Further reply, 9 September KL:** the dated auditor sheet says year ended
31 December 2025 / opening balances at 1 January 2026. The accountant confirms both
ARI 31,495.55 and CL_AFI 25,696.82 are **credits**. Year and signs are now resolved;
do not ask again. This is opening-schedule evidence, not a dated 2026 expense/reversal
journal. The earlier diagnostic counting ARI's opening credit in current-year profit
must not be treated as a correction. Retain both saved amounts/current mappings
while reconciling the expense label and revised opening schedule. January-August
stock totals are now complete. The separate
[stock correction](CLOSING_STOCK_CORRECTION_2026-09-09.md) was applied in dev at
11:32:52 KL and production at 12:02:07 KL; neither allowance was changed. Use the
existing January PDF as explicitly directed by the user.

**Status:** classification correction applied to **dev on 2026-09-08 at 13:03:55 KL**.
Actual dev January-August Balance Sheets and Trial Balances all balance. **Production
applied by the user on 2026-09-08 at 13:21:16 KL**, confirmed by the supplied
`tienhock_prod` execution output. The SQL file was then removed
at the user's request, with its exact contents retained in the migration log.
No report-engine code or accounting amounts were changed.

The supplied production output shows ARI moved from AE / inherited expense Note 5
to root GL / explicit Note 22, with its credit opening still **31,495.55** and CL_AFI
still Note 8 / credit **25,696.82**. For every January-August month, the BS difference
changes from **31,495.55 to 0.00** and the TB difference remains **0.00**. Asset and
liabilities/equity totals agree with the verified dev results. All transaction guards
passed and the output ends with **COMMIT**.

This records the user's terminal output; production report endpoints were not
independently queried by the assistant. The production backup path/hash was not supplied.

## Finding

Before this correction, after the [JP opening correction](JP_OPENING_CORRECTION_2026-09-08.md), Tien Hock's
January-August 2026 Trial Balances balance, but each Balance Sheet has assets exceeding
liabilities plus equity by **RM31,495.55**.

The new `ARI / ALLOWANCE FOR IMPAIRMENT` account has a 1 January credit opening of
**RM31,495.55**. Before correction, its parent was `AE` (Administrative Expenses), with no explicit
`fs_note`, so it inherited **Note 5 / income_statement / expense**. The TB includes the
opening credit. The Balance Sheet excludes expense-note accounts, and current-year
profit includes posted movement plus the recognised fiscal opening-stock amounts,
not other income/expense opening balances. ARI has no posted movement. Its opening
therefore explains the full Balance Sheet gap.

The saved expense mapping and excluded opening explain the mechanical BS gap.
That proof alone does not decide the auditor's intended treatment; see the later
evidence above. The investigation does not establish a general report-calculation
defect or which form interaction selected
the parent. The account form and creation endpoint accept the saved parent/note;
they contain no special rule automatically assigning ARI to AE.

## User-supplied evidence

The user relayed: **"ARI kami add new code...sebab amount ini ada dalam list Audit"**.
The subsequent photograph labelled **"List Auditor"** shows:

- the heading **Allowance of Impairment on Receivables**;
- a customer-by-customer list bracketed with handwritten **ARI**;
- a handwritten total of **31,495.55**;
- a separate **Other Receivables / Third Party** heading below it.

That evidence supports treating ARI as a deduction against receivables. **Note 22 /
Trade Receivables** is the selected ERP placement based on the heading and customer
list; the photograph does not itself print an ERP note number. Its total matches the
saved opening, so this finding does not require changing ARI's amount.

The photo was supplied inline in the conversation, not as a local source file. No
file hash or independent addition of every photographed line is claimed. Its period
is taken from the user's ongoing auditor-opening context; a dated page header is
not visible in this crop.

## Database and historical evidence

Target: local development `tienhock`, schema `public`, on port 5434. The user confirmed
it was freshly copied from production; the earlier JP correction has since been
applied to both. Production was not queried directly for this review.

Inspection: **2026-09-08 12:36:17 KL**, transaction read-only. Report preview:
**2026-09-08 12:41:31 KL**, repeatable-read/read-only. Repository commit:
`eabd03846655c4577c4b23adaa82a9621554c79b`; tracked working tree clean at inspection.

| Account | January opening | Effective note before correction | Evidence |
|---|---:|---|---|
| ARI | -31,495.55 | 5, inherited from AE | Newly created 8 Sep; original staged opening was zero |
| CL_AFI | -25,696.82 | 8, explicit | Existing legacy opening; original staged amount agrees |
| IN_AI | No opening | 18-2, explicit | Original staged opening was zero |

There are no journal lines for these three codes. ARI was the only nonzero January
opening outside Balance Sheet notes and the recognised fiscal opening-stock notes.
All 641 January openings still balance at **RM13,281,760.08 per side**.

The [legacy report verification plan](LEGACY_REPORT_VERIFICATION_PLAN.md) records
ARI as zero in the original January-May reports. It also records CL_AFI under
printed APPX 8, with gross trade debtors in Note 22. The June TB transcription agrees:
ARI zero under APPX 5, CL_AFI credit 25,696.82 under APPX 8. Preserve those original
classifications as historical evidence; they do not decide the revised auditor list.

## Read-only report proof

The private harness invokes the actual handlers in
`src/routes/accounting/financial-reports.js` for TB, BS, Income Statement and CoGM.
For the proposed placement, it substitutes an explicit Note 22 for ARI only in the
report's SELECT expression. It does not UPDATE the account or opening tables.

| Month 2026 | Current BS difference | Preview with ARI in Note 22 | Preview net trade receivables |
|---|---:|---:|---:|
| January | 31,495.55 | 0.00 | 511,987.92 |
| February | 31,495.55 | 0.00 | 539,167.27 |
| March | 31,495.55 | 0.00 | 444,247.45 |
| April | 31,495.55 | 0.00 | 556,118.40 |
| May | 31,495.55 | 0.00 | 485,154.17 |
| June | 31,495.55 | 0.00 | 534,885.33 |
| July | 31,495.55 | 0.00 | 483,674.78 |
| August | 31,495.55 | 0.00 | 419,359.02 |

For every month, the preview reduces assets by 31,495.55, leaves liabilities/equity
unchanged, preserves TB totals and zero difference, and returns identical Income
Statement and CoGM responses. Comparisons use cents. A diagnostic Note 8 preview
also balances, demonstrating that balance alone cannot choose the correct note;
the supplied schedule supports the proposed receivables placement.

Private artifacts (gitignored): `out/audit-2026-ari/inspect.sql`, `inspection.txt`,
`prove-report.mjs`, and `report-proof.json`. The JSON records source-file hashes;
its SHA-256 is `fd6b008f62208fd186a84ee3e65d032f3a6d12c9a083af05ce9bfcc826399b56`.
No build, type check or lint was run.

## Applied dev correction and verification

The user authorised proceeding with the ARI fix after the classification and separate
CL_AFI concern had been explained. The reviewed implementation,
`2026-09-08_ari_receivables_classification.sql`, was removed after the user's production
confirmation. Its exact SQL is archived in [MIGRATIONS_LOG.md](../MIGRATIONS_LOG.md).
SQL SHA-256: `efdfec41610057bc9de2669949614b7efeaf242d3de09f9daab8ef073991a2e3`.

It changes only the existing ARI account: `parent_code AE -> NULL`, `level 2 -> 1`,
`fs_note NULL -> 22`, plus an appended explanatory note, `updated_by = migration` and
`updated_at`. ARI stays an active GL account and its opening stays **-31,495.55**.
It is a root allowance account, not a customer under the auto-maintained DEBTOR parent.
The hierarchy view reflects the new root placement automatically. No journal or
opening-balance update is part of this correction.

Dev backup: `out/audit-2026-ari/account-codes-before-20260908.dump`, custom-format
`public.account_codes` archive, created **2026-09-08 12:58:37 KL**. SHA-256:
`e88bc8b0f46b6766bd8261a6921354d3feb1117afe7e09b94367b904a2c9fa70`.
The archive listing and extracted ARI/CL_AFI rows were reviewed before the write.
The private before snapshot was captured at **13:02:52 KL**.

Verification completed:

- Rollback rehearsal: all eight BS differences became zero; final `ROLLBACK`.
- Changed-opening rejection: an uncommitted altered ARI amount caused the guard to
  fail; the test transaction rolled back on disconnect.
- Actual dev application: **13:03:55 KL**, final `COMMIT`.
- Actual financial-report and ARI account-ledger handlers: all eight TB and BS
  differences zero; only asset Note 22 decreases by 31,495.55; liabilities, equity,
  all other asset notes, full Income Statement and CoGM responses unchanged.
  ARI ledger closing remains **-31,495.55** for every month.
- The migration's SQL controls match actual route TB totals, BS totals and profit
  to the cent, both before and after application.
- Fingerprints unchanged for all **2,840 other accounts**, **2,212 openings**,
  **9,272 journal headers**, **23,329 lines**, **12,635 staged import rows**, all
  **33 statement notes** and all **3 closing-stock rows**. CL_AFI is unchanged.
- Rerun at **13:04:25 KL**: no row changed; ARI notes/timestamps and complete report
  results agree with the first successful application.

Private verification artifacts: `verify-correction.mjs`, `before-correction.json`,
`after-correction.json`, `rerun-correction.json`, `backup-review.txt`, `rehearsal.txt`,
`guard-rejection.txt`, `applied-dev.txt`, and `rerun-dev.txt`, all under
`out/audit-2026-ari/`. The earlier preview remains historical evidence; it expects
the uncorrected classification and should not be rerun against the corrected DB.
The correction harness also expects the migration file at its original path; recover
that file from the archived SQL if a later authorised verification needs the harness.

The SQL stops on unexpected ARI metadata, opening dates/amount, children or journal
lines, changed note definitions, or different January-August report differences.
It checks the asset reduction, unchanged TB/profit, all openings and all other
accounts before committing. Short locks keep the checks consistent; failure to
obtain a lock within five seconds aborts the transaction. Reruns at the corrected
state do not rewrite audit metadata. Later changes to ARI may require a new review
instead of rerunning this historical correction.

## Production: completed user-run procedure (historical)

The supplied output confirms production application at **2026-09-08 13:21:16 KL**. The completed correction
does not need another run. The steps below are retained as the execution record;
the exact SQL now lives in the migration log. Application deployment does not execute
this data correction; the existing report engine reads the corrected mapping immediately.

First create and review a private backup from the **normal SSH Bash shell**:

```bash
set -euo pipefail
umask 077
ari_audit_dir=$(mktemp -d "$HOME/tienhock-ari-audit-20260908-XXXXXX")
sudo -u postgres pg_dump -Fc -d tienhock_prod --table=public.account_codes > "$ari_audit_dir/account-codes-before.dump"
pg_restore --list "$ari_audit_dir/account-codes-before.dump" > "$ari_audit_dir/backup-contents.txt"
sha256sum "$ari_audit_dir/account-codes-before.dump"
cat "$ari_audit_dir/backup-contents.txt"
sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d tienhock_prod -c "SELECT current_database(); SELECT code, parent_code, level, fs_note, notes FROM public.account_codes WHERE code IN ('ARI','CL_AFI') ORDER BY code; SELECT account_code, to_char(as_of_date,'YYYY-MM-DD') AS as_of_date, amount FROM public.account_opening_balances WHERE account_code IN ('ARI','CL_AFI') ORDER BY account_code, as_of_date;" | tee "$ari_audit_dir/rows-before.txt"
```

Confirm the archive contains `public.account_codes` table data and the current rows
match the reviewed before-state above. Then copy the **entire contents** of
`out/audit-2026-ari/paste-production.sh` into the normal SSH shell. This is a complete
quoted heredoc containing the exact SQL above; no file upload or deployment is needed.
If inside `psql`, press Ctrl+C and enter `\q` first. Keep the heredoc delimiter intact.

To reconstruct the wrapper if the private file is unavailable, paste this line,
the complete archived SQL from the migration log, then `ARI_CLASSIFICATION_SQL` alone on a new line:

```bash
sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d tienhock_prod -f - <<'ARI_CLASSIFICATION_SQL'
```

Expected output: ARI root/level 1/Note 22, unchanged credit **31,495.55**, CL_AFI still
Note 8/credit **25,696.82**, all eight `after_bs_difference` and `tb_difference` values
**0.00**, and final **COMMIT**. A rerun reports no row changed. If a guard fails, retain
the output and review the changed state rather than removing the guard. Refresh the
January-August Balance Sheets after applying. Record the production time, output and
backup path/hash here and in [MIGRATIONS_LOG.md](../MIGRATIONS_LOG.md).

## CL_AFI reply and reopened ARI treatment

The user answered the earlier question: **"Baki lama memang tidak ubah sebab CL_AFI
under receivable... ARI under expenses"**. CL_AFI stays unchanged; do not repeat the
replacement question or delete it based on the similar descriptions.

The remaining clarification concerns **ARI's adjustment year, debit/credit sign and
matching entry**, not whether the user intentionally retained CL_AFI. The new report
review records the diagnostic expense interpretation and questions. Do not reverse
the mapping alone: the existing profit engine would then recreate the 31,495.55 BS gap.
