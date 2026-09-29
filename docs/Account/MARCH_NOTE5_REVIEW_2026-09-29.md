# March Note 5 comparison - 29 September 2026 KL

> **Superseded by Document146.pdf:** The latest MBTEL and AC_TM ledgers now directly show all three payments under AC_TM. The earlier verbal MBTEL confirmation and remaining evidence request below are historical. See [resolved root cause, correction and production handoff](MARCH_TELEPHONE_CORRECTION_2026-09-29.md).

**Read-only review: the entire RM422.25 expense difference is localized to MBTEL. No March correction has been applied or added to the production paste.** The correcting entry still needs the latest legacy telephone-account transaction detail because the accountant previously confirmed all three questioned payments as MBTEL.

## New evidence

The user supplied `C:/Users/matia/Downloads/Document 145.pdf`, an eight-page legacy APPX5 summary for03/2026. Page1 includes ARI credit31,495.55, page3 shows MBTEL4,523.45, and page8 totals391,908.20. These are year-to-date figures through March, not March-only expenses.

PDF SHA-256: `0d2a88a10bf83312514d3446484645270216ea166479c6a19ab098a5f0a4f333`.

All96 nonzero rows were visually transcribed and sum exactly to the printed total. Of those,95 match the refreshed development database exactly. Printed zero rows were inspected but not individually transcribed; the database has the same96 nonzero Note5 accounts.

| Account / total | Legacy PDF | Current dev | Dev minus legacy |
|---|---:|---:|---:|
| MBTEL | 4,523.45 | 4,945.70 | 422.25 |
| Note5 expenses | 391,908.20 | 392,330.45 | 422.25 |
| ARI, included above | -31,495.55 | -31,495.55 | 0.00 |

Verification ran at2026-09-29 11:30:15 KL in a PostgreSQL REPEATABLE READ, READ ONLY transaction against local database `tienhock`, ending in ROLLBACK. The actual March income-statement, trial-balance, balance-sheet and CoGM handlers were also read. March profit remains149,709.03 against target150,131.28; CoGM remains1,470,730.05. This supports the January ARI resolution and isolates the remaining expense variance; it does not indicate a new report-calculation defect.

## Telephone entries and evidence limits

Current MBTEL monthly movement is January1,969.90, February1,329.10 and March1,646.70, totalling4,945.70. The PDF implies March movement1,224.45 if the January/February amounts are retained.

The previously confirmed three payments total exactly422.25:

| Date | Visible reference | Amount | Current line ID |
|---|---|---:|---:|
| 6 March | PV002/03 | 85.15 | 15869 |
| 6 March | PV002/03 | 168.55 | 15870 |
| 11 March | PBE037/03 | 168.55 | 15871 |

There is evidence of expense recognition at both payment and month-end:

- PBE037/03 debits MBTEL168.55 for invoice2026030415630050, account7026510748. Month-end JV26/03/08 also debits MBTEL168.55 for the same invoice/account (line15878), with AC_TM credited as part of the211.85 monthly bill entry.
- The85.15 payment equals January42.40 plus February42.75 landline accruals. This is a numerical relationship, not a confirmed invoice-level match: the imported payment account text differs from the bill text.
- The other168.55 payment refers to February office Wi-Fi; February's monthly entry also includes168.55. Imported bill/account references differ, so identity cannot be asserted from the amount alone.

March payment and bill entries agree with stored legacy import staging, all marked unrepaired, from `EXCEL_THLD_(JAN-MAY26).csv`: physical lines8261-8271 for MBTEL and347 for AC_TM. Current postings therefore reflect that imported source; this PDF cannot show which later legacy adjustment or reallocation accounts for the difference.

AC_TM opens January at credit408.85. After the confirmed January correction, it ends January at credit261.50, February at credit472.80 and March at credit684.65. Neither AC_TM nor MBTEL has a later opening anchor through March. A transfer of422.25 from MBTEL to AC_TM would mathematically explain the variance, but **is not approved or established by this summary**. The prior explicit MBTEL confirmation remains in force. Do not edit imported payment lines, remove a valid payment or insert a balancing entry solely to reach the target.

## Remaining evidence request

Ask for the latest legacy **March transaction lists for MBTEL and AC_TM, including opening/closing balances and any adjustments**. This is narrower than another expense summary or asking again which code the payments belong to. It should show how legacy reaches4,523.45 and which counterpart account is involved.

The January/February correction remains separate. Current dev contains ARI Note5 and worker journal13663; production execution has not been confirmed by new user-supplied output in this review. The existing `out/audit-2026-january-note5-2026-09-28/paste-production-ssh.sh` is unchanged. This read-only review does not certify it against a future production state.

Private evidence under `out/audit-2026-march-note5-review/`: rendered pages, `march-note5-nonzero.json`, `verify.mjs`, `verification.json` and `WHATSAPP_BM.txt`. No database, application code, production script or changelog changes were made for this review.
