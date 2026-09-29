# March telephone correction - 29 September 2026 KL

**Applied in dev; production pending.** Document146.pdf resolves the remaining RM422.25 difference. Committed state verified at **2026-09-30 01:56:14 KL**, journal **13720**. This direct account-ledger evidence supersedes the earlier message assigning all three payments to MBTEL and the evidence request in [March Note5 review](MARCH_NOTE5_REVIEW_2026-09-29.md).

## Source and root cause

The user supplied `C:/Users/matia/Downloads/Document 146.pdf`, two scanned ledger pages. SHA-256: `4f111a07cd55841df262baba45d77489c63addbbd8af251f14f24452db0cb88c`.

- Page1, MBTEL: opening debit3,299.00, eight March expense lines totalling1,224.45, closing debit4,523.45. The three questioned payments are absent; monthly bill expenses remain.
- Page2, AC_TM: opening credit472.80; debit85.15 and168.55 for PV002/03 on6 March; debit168.55 for PBE037/03 on11 March; credit211.85 for JV26/03/08 on31 March; closing credit262.40.
- Both opening balances match current dev. All eight remaining MBTEL transactions and the AC_TM month-end bill match. The only allocation difference is those three payments, totalling422.25.
- The page header says `01 MAR 2010`, but every transaction is explicitly dated March2026 and the vouchers/balances match the March2026 expense PDF. The stale print-header date is not used as the accounting date.

The imported legacy CSV placed the payment debits in MBTEL while also retaining the bill expense entries. The new ledger places those payments in AC_TM, settling amounts already accrued. Thus the ERP counted422.25 twice as expense relative to this corrected legacy ledger. There is no remaining ambiguity about the counterpart account and no need to ask the accountant the same question again.

## Correction and scope

Standalone month-end journal `JV2603-TM-CORR-0929`, dated31 March2026: **DR AC_TM422.25 / CR MBTEL422.25**. Its description/line references identify Document146, PV002/03 and PBE037/03. Original imported journals, payments, staging, openings and bill accruals remain intact. This is a month-end audit adjustment, so original intra-month ledger rows/running balances are retained; month-end balances and subsequent reports reconcile.

Only the two telephone accounts change. January/February reports and all CoGM values remain unchanged. From March onward expenses fall422.25 and profit rises422.25; the telephone liability falls by the same amount. Bank/cash payments and debtor/supplier documents are unaffected.

The local-only SQL and SSH paste are under `out/audit-2026-march-telephone-detail/`. SQL is not committed. The script locks the relevant tables, checks source voucher fingerprints, classifications, opening balances, prior corrections, all eight historical target totals and all12 TB/BS balances. It preserves every pre-existing journal/line and validates exact correction content on rerun. Changed baselines abort the whole transaction for review. Later-month TB changes are derived from account signs rather than assuming every account remains on its original side.

## Production sequence

1. The September28 financial-report code and ARI/worker correction must already be present. If that SQL is still pending, use `out/audit-2026-january-note5-2026-09-28/paste-production-ssh.sh` first.
2. Run the new `out/audit-2026-march-telephone-detail/paste-production-ssh.sh` through the normal production Linux SSH session. It uses native `sudo -u postgres psql` for `tienhock_prod` and includes one transaction.
3. Retain output ending in COMMIT and the monthly validation results before marking production applied. Do not rerun the older September28 bundle after this March correction: its historical report-baseline guards predate this adjustment. The new March script supports its own exact rerun.

No new financial-report code is needed for this correction. User manages production backups; none are included. The assistant has not connected to or modified production. A future dev refresh replaces the local application, so recheck its state before inferring that the correction exists in production.

## Verified results

| Month | TB each side | Profit | BS net assets | CoGM |
|---|---:|---:|---:|---:|
| 1 | 14,056,981.54 | 142,263.77 | 5,712,941.51 | 537,223.39 |
| 2 | 14,585,854.01 | 188,855.46 | 5,759,533.20 | 997,601.52 |
| 3 | 15,207,287.16 | 150,131.28 | 5,720,809.02 | 1,470,730.05 |
| 4 | 15,892,242.98 | 259,716.61 | 5,830,394.35 | 2,003,332.41 |
| 5 | 16,389,380.28 | 317,101.11 | 5,887,778.85 | 2,479,030.27 |
| 6 | 17,081,823.62 | 356,587.89 | 5,927,265.63 | 2,998,097.33 |
| 7 | 17,893,472.49 | 455,557.08 | 6,026,234.82 | 3,528,088.43 |
| 8 | 18,249,308.39 | 468,914.13 | 6,039,591.87 | 3,865,986.90 |

All eight months match the supplied19 September target sheet. All96 nonzero March Note5 accounts now match Document145 exactly, totalling391,908.20. All12 TB/BS checks balance; September onward remains incomplete, not certified year-end accounts. CoGM, revenue, cost of sales and connected JP statement/ledger responses are unchanged. Only AC_TM/MBTEL balances change; protected table fingerprints and every pre-existing journal/line remain unchanged.

The atomic script was rehearsed with ROLLBACK, then committed in dev and verified from a fresh read-only transaction. The SSH paste contains the same SQL and passes Bash syntax parsing. Initial verification attempts rolled back: one fingerprint separator used Windows CRLF instead of LF, then two JavaScript checks compared zero against negative zero. The verifier now normalizes those checks; no failed attempt committed accounting changes. Sequence IDs can advance during rolled-back rehearsals. No build, lint or typecheck was run.

Local SQL SHA-256: `3fb7ca9ca1b7999cb0ad7f775bb5202a04a0700a5d7fd6c826712f206206d417`. Evidence: `rehearse-verification.json`, `apply-verification.json`, before/after report snapshots, `legacy-telephone-ledgers.json` and the verifier under the local output directory.

An independent committed-state rerun at **2026-09-30 01:56:58 KL** reused journal13720 and changed no protected fingerprints, report results or connected JP responses. Evidence: `rerun-verification.json`.
