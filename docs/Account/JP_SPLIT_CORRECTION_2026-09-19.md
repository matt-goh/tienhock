# JP split carry-forward correction - 19 September 2026

> **Latest,22 September2026 KL:** User supplied corrected flour credit notes and a comparison sheet updated19 September. Both flour purchases already match; all eight CoGM values match. The sheet gives January TB14,056,981.54, superseding the prior handwritten targets. After another dev refresh, JP plus the confirmed January four-account correction were applied together and verified in dev; production pending. Older applied/hold/question statuses below are historical. See [latest evidence, remaining differences and combined production paste](CORE_CONFIRMATIONS_2026-09-22.md).


**Dev applied 2026-09-19 13:05:52 Asia/Kuala_Lumpur; exact rerun verified 2026-09-19 13:06:21. Production is pending and was not accessed.**

## Confirmed user instruction

The user supplied the earlier request to split January JP debit9,659.45 into **JP debit707.45 and CR_JP debit8,952.00**, and confirmed that they told the accountant to proceed. Both are debit balances. This supersedes the prior consolidated allocation for current reporting; do not ask for this confirmation again.

The split was present in the refreshed production copy, but JP's June checkpoint still included the full consolidated amount. Only that stale checkpoint is corrected:

| Row | Before | After |
|---|---:|---:|
| JP, 1 January | DR707.45 | DR707.45 |
| CR_JP, 1 January | DR8,952.00 | DR8,952.00 |
| JP, 1 June | DR9,546.10 | **DR594.10** |

JP's posted January-May movement is -113.35, so707.45 -113.35 =594.10. CR_JP retains its separate8,952 debit. The new June note preserves the previous correction note as history and explains the newly confirmed split. No opening row is deleted; only June JP amount, notes and updated_at change.

This is a correction to Tien Hock's JP debtor account, not to the Jelly Polly company's own database schema. No schema, journal, stock, invoice, receipt, imported source, account mapping, ARI/CL_AFI or January four-account adjustment changes.

## Verified results

| Month | TB debit and credit after JP correction | Red target | Difference to red |
|---|---:|---:|---:|
| 01/2026 | 14,063,125.09 | 14,063,125.09 | 0.00 |
| 02/2026 | 14,589,497.56 | 14,589,497.56 | 0.00 |
| 03/2026 | 15,211,352.96 | 15,211,352.96 | 0.00 |
| 04/2026 | 15,896,308.78 | 15,896,308.78 | 0.00 |
| 05/2026 | 16,393,446.08 | 16,393,446.08 | 0.00 |
| 06/2026 | 17,085,889.42 | 17,085,889.42 | 0.00 |
| 07/2026 | 17,904,606.29 | 17,897,606.29 | 7,000.00 |
| 08/2026 | 18,254,398.81 | 18,207,498.81 | 46,900.00 |

All12 actual TB/BS report checks now balance. September-December reflects currently posted data, not certified future-month accounts. January-May reports are byte-for-byte unchanged; Income Statement and CoGM responses are unchanged in every month. January profit remains110,409.92.

JP statement, account ledger and ageing now agree: June738.40, July751.40, August790.40, September onward0.00. The latter previously retained a spurious8,952 after the real invoices were paid. No changes to those connected report components are needed.

The red monthly targets and the four January account amounts are already confirmed. The old four-account script is still **on hold** because its January result would be14,056,981.54 instead of red14,063,125.09. After fixing JP, its former imbalance guard may no longer block it, so that guard must not be treated as permission to run it. July/August flour source questions remain; matching an aggregate target is not authority to change their disputed amounts.

## Guards and verification

The correction checks database identity, the exact JP/CR_JP account classifications (JP is TD/Note22; CR_JP is TC/Note13), all three opening dates/amounts, exact January-May movement, no CR_JP2026 movements, continuity of every other June checkpoint and the complete12-month before-state difference pattern. Account/opening/journal/report configuration tables are locked during the short transaction. Only a June checkpoint of9,546.10 or an already-correct594.10 is accepted. Conflicting state aborts; an already-correct rerun preserves metadata.

The SQL verifies all12 after-state TB/BS differences, unchanged credit totals/profit/CoGM/liabilities-equity, the precise debit/asset decrease and unchanged other openings before COMMIT. Actual report-handler verification covers72 responses per phase: TB, BS, IS, CoGM, JP statement and JP ledger for12 months. A wrong-January-split guard test rejected and rolled back. The exact SQL rollback rehearsal passed. All protected-table fingerprints except the one opening table are unchanged; every other opening row is identical. The rerun preserves all fingerprints and JP row metadata.

## Production: separate paste, no SQL commit required

Use the entire contents of **`out/audit-2026-jp-split-correction-2026-09-19/paste-production-ssh.sh`** in the normal Linux SSH shell. This is the new **JP-only** script, not the old January four-account file currently open in the IDE. It contains the complete SQL and uses `sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d tienhock_prod -f -` with a quoted heredoc. It needs no repository commit, upload or backup command; the user manages the production backup separately.

Expect January JP707.45, CR_JP8,952 and June JP594.10,12 balanced report rows, a notice whether it was already correct and final COMMIT. If a guard rejects, stop and review the reported state rather than removing the guard. Production is not marked applied until the user's execution result is available.

Private artifacts are in the directory above: local SQL, the self-contained SSH paste, before reports, rehearsal/apply/rerun verification, rollback rehearsal and wrong-split guard output. SQL SHA-256:

`2235cadc8c5a70228990aa4ad3bcfcaf780b79ef7eb583f2fbc11cc9f282ac2b`

The initial draft guard incorrectly expected CR_JP ledger type GL; rehearsal rejected before any change. After read-only verification of the actual TC classification, the guard was corrected to require TC/CL_TP/Note13 and all subsequent rehearsals passed. This corrected guard is included in the recorded hash and production paste.

No build, lint or typecheck was run. Application calculation code is unchanged. The changelog records the visible correction in English and BM.
