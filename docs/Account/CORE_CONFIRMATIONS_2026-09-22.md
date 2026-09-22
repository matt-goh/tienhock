# Updated core-report evidence - 22 September 2026 KL

> **JP posting issue resolved in dev,22 September2026:** With explicit user approval, the shared adjustment route now excludes Jelly Polly documents from Tien Hock journal posting. The misplaced258.13 journal is cancelled while its JP credit note and invoice/customer effects stay intact. Dev applied05:44:07 KL, exact rerun05:44:45. Production deployment and SQL pending. Use the [latest combined production script and isolation verification](JP_ADJUSTMENT_ISOLATION_2026-09-22.md); older pending-permission statuses below are historical.


**Confirmed corrections applied to refreshed dev at 2026-09-22 05:33:34 KL; exact rerun verified 2026-09-22 05:34:07. Production not accessed or applied. Remaining differences are not declared resolved.**

## Latest source evidence

The user supplied two invoice photographs and a comparison sheet explicitly updated through19 September2026:

- Invoice1164104918,24 July: printed gross26,833.00; confirmed credits7,000.00 +68.00 =7,068.00; net19,765.00. The printed invoice confirms400 bags at66.50 (26,600), two bags at75.50 (151), one bag at82, and40 free bags with zero amount. The existing journal's65.50 text is a description typo; its26,600 amount is correct. No purchase amount was changed in this task.
- Invoice1164107393,20 August: gross26,600.00; confirmed credit7,000.00; net19,600.00. No70,000 credit is authorized. The52 free bags have zero amount.
- The latest comparison sheet is transcribed in `confirmed-2026-09-19-targets.json`. It gives January TB14,056,981.54 and July/August CoGM3,528,088.43 /3,865,986.90. Use this newly supplied dated sheet as the current comparison, superseding the earlier handwritten red totals; do not ask the user to choose colours again. This resolves the prior January total conflict for the already-approved four-account correction. Source images were supplied inline; no original image file was available to hash.

The current database already contains all confirmed flour credits, correctly allocated between PU_MTEP and CR_JB. All eight CoGM values match the new sheet to the cent. Do not add another supplier credit or request its amount again. Supplier-outstanding workflows are outside scope; this is a purchase-accounting reconciliation.

## User refreshed dev during this turn

The first snapshot at05:27:09 KL already had the corrected July credit notes but lacked the JP June fix. The user then confirmed a fresh production restore. A second snapshot at05:31:43 KL found additional journal changes: August23.90 moved between cash/credit sales without changing total profit, plus newer September postings. The first rehearsal was superseded. Both snapshots remain preserved under `out/audit-2026-core-confirmation-2026-09-22/`; the second was copied as the baseline in `out/audit-2026-core-confirmation-2026-09-22-refreshed/` and all validation rerun there. No earlier snapshot was overwritten.

## Applied scope

A single transaction composes the two already reviewed corrections:

1. JP June checkpoint9,546.10 ->594.10, preserving the explicitly confirmed January JP707.45 / CR_JP8,952 debit split.
2. January journal JV2601-CORR-0913: DR ACW_PCB5,785.25 / CR ACD_PCB5,785.25; DR AC_TM358.30 / CR MBTEL358.30. January results are AC_TM CR261.50, ACD_PCB DR1,446.35, ACW_PCB CR3,329.40, MBTEL DR1,969.90.
3. August journal JV2608-PCB-OFFSET-0913 offsets only the already-posted PCB correction in JV2608-12, preserving August/later PCB balances.

New journal IDs on this refreshed dev copy are13484 /13485. The original guarded scripts' account/source/amount/report checks are retained inside one BEGIN/COMMIT, with distinct temporary-object names. Production may have JP already corrected; the JP part is an exact no-op in that valid state. Conflicting data aborts the whole transaction.

All12 TB/BS controls balance. All eight CoGM targets still match. JP statement/ledger/ageing agree. January profit is110,768.22. The exact rerun changed no fingerprints or JP metadata. Existing journals, both flour invoices, every other opening, account classifications, stock and import staging remain unchanged. Rollback rehearsals can consume journal sequence IDs; gaps are expected and were not reset.

## Comparison after the confirmed corrections

Positive gap means latest user target minus current dev. BS compares legacy net assets (assets minus liabilities), not total assets. All CoGM gaps are zero.

| Month | Current TB each side | Target TB | TB gap | Current profit | Target profit | Profit / BS net-assets gap |
|---|---:|---:|---:|---:|---:|---:|
| 01/2026 | 14,056,981.54 | 14,056,981.54 | 0.00 | 110,768.22 | 142,263.77 | 31,495.55 |
| 02/2026 | 14,583,354.01 | 14,585,854.01 | 2,500.00 | 157,359.91 | 188,855.46 | 31,495.55 |
| 03/2026 | 15,205,209.41 | 15,207,287.16 | 2,077.75 | 118,213.48 | 150,131.28 | 31,917.80 |
| 04/2026 | 15,890,165.23 | 15,892,242.98 | 2,077.75 | 227,798.81 | 259,716.61 | 31,917.80 |
| 05/2026 | 16,387,302.53 | 16,389,380.28 | 2,077.75 | 285,183.31 | 317,101.11 | 31,917.80 |
| 06/2026 | 17,079,745.87 | 17,081,823.62 | 2,077.75 | 324,670.09 | 356,587.89 | 31,917.80 |
| 07/2026 | 17,891,394.74 | 17,893,472.49 | 2,077.75 | 423,639.28 | 455,557.08 | 31,917.80 |
| 08/2026 | 18,246,972.51 | 18,249,308.39 | 2,335.88 | 436,738.20 | 468,914.13 | 32,175.93 |

## Remaining evidence, hypotheses and confirmed software issue

- February TB gap2,500.00: imported PV007/02 on19 February has one DR ACW_SAL2,500 line labelled DRAWING WORKERS. Moving that amount to workers' advances CA_WA would explain the gap without changing profit/CoGM. This is a candidate, not an approved correction: original staging also says ACW_SAL, so it is not an import transcription error. Ask which account the latest legacy books use.
- March onward adds422.25 to the profit gap and reduces the TB gap from2,500 to2,077.75. Three TM payments total exactly422.25: PV002/03 on6 March85.15 and168.55, plus PBE037/03 on11 March168.55, all currently MBTEL. Monthly TM accruals also exist. Reclassifying these payments to AC_TM would explain the pattern, but source account confirmation is required; equal amounts alone are insufficient. Preserve original imports.
- August adds258.13 to both remaining gaps. This is a concrete cross-company posting: public journal13062/JCN-202608-0007 (visible JP/CN/26/7,29 August) is sourced from active `jellypolly.adjustment_documents` row JP-CN-26-7 for BESTWISE/invoice003844, damaged-goods return258.13. It debits Tien Hock CR_SALES and credits TR. Only one posted jp_adjustment journal exists. The shared adjustment factory calls all three journal helpers even for Jelly Polly, whose invoices/payments do not otherwise post to this Tien Hock ledger. A small route patch has been prepared under `proposed-jp-ledger-isolation.patch`, preserving invoice/customer balance updates while skipping shared journals for JP CN/DN/RN. User permission was requested under AGENTS rule1 before modifying that additional component. **Patch not applied; existing JP credit note/journal untouched while approval is pending.** This is not a supplier credit note and must not be sent to the accountant as a flour-amount question.
- January/February residual profit and BS difference31,495.55 equals ARI's confirmed January opening credit. ARI's prior-year opening date/sign and intended expense label were already answered. Those facts still do not identify a2026 expense reversal or authorize treating a prior-year opening as current-year profit. Request the current January expense calculation or ARI adjusting-entry evidence, without re-asking year/sign/classification. ARI/CL_AFI remain unchanged.

Arithmetic check: February TB gap2,500; March-July2,500 -422.25 =2,077.75; August2,077.75 +258.13 =2,335.88. Profit/BS gap is31,495.55 through February, plus422.25 from March, plus258.13 from August. This explains the observed differences numerically but does not replace source confirmation for the first two reclassifications or ARI treatment.

## Production command and verification

New local-only, self-contained paste: **`out/audit-2026-core-confirmation-2026-09-22-refreshed/paste-production-ssh.sh`**. It runs the JP and four-account corrections atomically through `sudo -u postgres psql` on `tienhock_prod`. No repository commit, upload or backup command is included. The user handles production backups. This script does not claim to resolve the remaining items above and does not change either flour purchase. Prefer this combined reviewed paste over running the old files separately.

SQL SHA-256: `44318f8dc2eabd9cc01be8ad5bc176b2daedab191fd13ff2b1289ecbf4ef2024`.

Artifacts: baseline `before-reports.json`, `rehearse-verification.json`, `apply-verification.json`, `rerun-verification.json`, `remaining-comparison.json` and `confirmed-2026-09-19-targets.json`. Each route-verification phase checks72 actual monthly responses: TB, BS, IS, CoGM, JP statement and JP ledger across12 months; all report deltas are checked account by account, protected-table fingerprints are checked, and all other opening rows compared. The original migration also compares every existing journal header/line inside the transaction. Future-month checks use current postings, not certified future accounts. No build, lint or typecheck was run.
