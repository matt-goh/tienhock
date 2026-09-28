# Worker advance, March telephone and ARI confirmations - 22 September 2026

> **Latest,28 September2026 KL:** Document143.pdf directly shows January ARI -31,495.55 in APPX5 and total expenses111,242.04. The report fix and ARI Note5/AE restoration plus worker-advance correction are now applied in dev; January and February core totals match the supplied sheet. Production deployment/new SQL pending. The old ARI evidence hold and worker-prepared statuses below are superseded. March onward still differs422.25; March payments remain MBTEL. The user deferred obtaining March, so do not request it again now. See [January Note5 resolution and current production handoff](JANUARY_NOTE5_RESOLUTION_2026-09-28.md).


**Status: prepared and rollback-verified; not applied to dev or production.**

## Confirmed facts

The accountant answered the remaining source-account questions:

- PV007/02, 19 February 2026, DRAWING WORKERS RM2,500 belongs to **CA_WA**. The current imported voucher instead debits ACW_SAL. This authorizes the account reclassification, not a change to the payment amount.
- PV002/03, 6 March, RM85.15 and RM168.55, and PBE037/03, 11 March, RM168.55 belong to **MBTEL** (written MB_TEL in the reply). The actual database code is MBTEL; there is no MB_TEL account. All three current postings already match. Do not transfer them to AC_TM or ask this question again.
- The auditor allowance schedule and legacy opening print confirm **ARI opening credit RM31,495.55 at January 2026**. The user explicitly says the legacy opening was entered from the auditor's figures. The current ARI opening is already -31,495.55, and there is no posted ARI movement. Do not change its sign, date or amount, or ask again whether it is an opening balance.

The images are inline conversation evidence, not locally hashed originals. The prior January TB transcription is historical: it showed ARI at zero under APPX5 before the later auditor opening was keyed. It does not establish how the updated legacy expense report uses that credit.

## Prepared correction

Local-only SQL and SSH paste: `out/audit-2026-worker-advance-correction-2026-09-22/`.

Journal `JV2602-WA-CORR-0922`, dated **19 February 2026**:

| Account | Debit | Credit |
|---|---:|---:|
| CA_WA - worker advances | 2,500.00 | 0.00 |
| ACW_SAL - salary accrual | 0.00 | 2,500.00 |

The original imported journal5238 (`IMP-20260219-0002`, visible PV007/02), original line12851, bank payment, other salary/bonus lines, opening balances and import staging remain unchanged. This separate journal preserves import provenance. January reports, all monthly income statements/CoGM, BS net assets and JP statements/ledgers remain unchanged. From February, total assets and liabilities both rise RM2,500; net assets do not change.

The earlier production corrections were already confirmed by the user's final COMMIT (journals13499/13500 and JP isolation). **Do not replay the older bundle as a new requirement.** The dev database still predates that production run. Verification reconstructs that baseline in one rollback transaction, then rehearses only the new correction. The new production paste contains only the worker-advance correction and checks the earlier corrections are present. No production connection is made.

## Report implications

| Month | TB each side after new correction | Latest target | Target minus corrected TB |
|---|---:|---:|---:|
| January | 14,056,981.54 | 14,056,981.54 | 0.00 |
| February | 14,585,854.01 | 14,585,854.01 | 0.00 |
| March | 15,207,709.41 | 15,207,287.16 | -422.25 |
| August | 18,249,730.64 | 18,249,308.39 | -422.25 |

April-July also remain RM422.25 above the supplied TB targets. Equal values do not justify moving the telephone payments: the accountant has now confirmed their current expense account. For September and later, the current incomplete salary account has a debit balance; the reclassification shifts amounts between two debit balances without increasing TB totals. The guards calculate the expected debit/credit change from the actual account signs rather than assuming every month's TB totals rise RM2,500.

January/February profit remains RM31,495.55 below the supplied targets; March-August profit remains RM31,917.80 below. All eight CoGM targets still match. The worker-advance reclassification has no profit effect.

## ARI: input confirmed, report treatment still unresolved

The current report implementation includes posted year-to-date income/expenses and only fiscal opening **stock** anchors in profit (`financial-reports.js`, exact fiscal opening stock CTE and income statement period activity). The ARI credit is currently mapped to BS Note22 and does not reduce Note5 expenses. That mapping was applied on 8 September and later disputed by the user, who says ARI belongs under expenses; it remains under review.

After the confirmed January phone correction, ERP expenses are RM142,737.59. Deducting the ARI opening credit mathematically gives RM111,242.04, exactly the photographed legacy expenses. This is strong evidence of a difference in how the legacy report treats the opening credit, but these opening photographs do not show the updated Note5 calculation. No new ARI reversal journal or general rule adding all P&L openings to current-year profit is justified by this evidence alone. No report code or ARI mapping was changed in this task.

The remaining request is the **latest January and March 2026 expense breakdown (Note5) from the legacy system**, after the auditor openings were entered and corresponding to the latest profit comparison. January should show the RM111,242.04 expense total. This checks both the ARI treatment and the residual RM422.25 from March without re-asking settled payment/account questions. Plain BM draft: `out/audit-2026-worker-advance-correction-2026-09-22/WHATSAPP_BM.txt`; the previous active draft was updated too.

## Verification and production use

Rollback verification completed **2026-09-22 13:01:43 KL**. Actual TB, BS, income statement, CoGM, JP statement and JP ledger handlers were exercised across12 months before/after the correction, on exact rerun and after rollback. All12 TB/BS checks balance. Only CA_WA/ACW_SAL account balances change, by the approved signed amounts; full income statements/CoGM and JP reports stay identical. Protected-table fingerprints match, and all original accounting-table fingerprints and reports are restored after rollback. An altered source voucher and an altered existing correction both reject. The test accounts for the later-month salary debit balance; an initial fixed-TB-delta expectation was corrected after investigating that balance. No database changes were committed; rolled-back inserts can consume sequence numbers. No build, lint or typecheck was run.

The new paste is `out/audit-2026-worker-advance-correction-2026-09-22/paste-production-ssh.sh`. It uses native `sudo -u postgres psql` on `tienhock_prod`, includes no backup command, and requires no SQL commit/upload. It checks the source voucher, account mappings/openings, completed prior corrections, exact February baseline and monthly report effects. Existing exact correction is a no-op; conflicts abort. It does not alter ARI or telephone postings. Run this new paste once when ready, then retain the terminal output including final COMMIT for production confirmation.

SQL SHA-256: `7b34ab218d34d94a4056c6135133aa6d5287556bde2ad3c264b6172c2c6cde1d`. Local evidence: `verification.json`, `corrected-baseline.json`, `rehearsed-reports.json` and `verify.mjs` in the same directory. No application-code change or shipped UI behaviour was introduced; this is a prepared data correction awaiting production execution.
