# January Note5 resolution and worker advance - 28 September 2026 KL

**Implemented and applied in dev. Committed state verified at 2026-09-28 13:15:28 KL, worker journal 13664. Production code deployment and this new SQL remain pending.** The user supplied the latest production data in dev and asked to continue the core-report reconciliation. Earlier September production corrections are already present; they were not recreated.

## Direct source evidence resolves the ARI question

The accountant supplied `Document 143.pdf` as the January expenses totalling **RM111,242.04**. The eight-page scan was read locally and rendered for inspection. Page1 explicitly shows **ARI / ALLOWANCE FOR IMPAIRMENT / -31,495.55 under APPX5 ADMIN. EXPENSES**. Page3 shows MBTEL1,969.90. Page8 totals111,242.04.

All **75 nonzero rows** were visually transcribed, with source page numbers, and total exactly111,242.04. They match the current January expense accounts plus the ARI fiscal opening credit, account by account. Zero rows were visually inspected but not individually transcribed into the fixture. The source is not an instruction to change other accounts.

Original path: `C:/Users/matia/Downloads/Document 143.pdf`.
PDF SHA-256: `a414536275867fa87f1bbc6e1f5d333f6cfeb6692d5afd949e36d1c519a93c30`.
Private fixture: `out/audit-2026-january-note5-2026-09-28/january-note5-nonzero.json`, with rendered pages alongside it.

This supersedes the earlier ARI hold based only on matching amounts and opening photographs. The separate opening evidence already established ARI as a January2026 credit of31,495.55; this PDF now proves how the legacy January expense report uses it. No further January breakdown or repeated sign/year question is needed.

## Resulting behaviour

`src/routes/accounting/financial-reports.js` includes the stored ARI fiscal opening once in both Income Statement and Balance Sheet current-year profit, only when the report is for **2026**, the opening is exactly **2026-01-01**, and ARI's effective note is **5**. This is an evidenced legacy-migration exception, not a new general rule treating every prior-year P&L opening as current-year activity. The amount comes from the database, not a hardcoded profit target. Posted ARI movements continue to count once; later checkpoints do not replace the fiscal opening. Other report years and CoGM retain their existing calculation.

The paired guarded data correction restores ARI to **AE / level2 / Note5**. Its credit opening remains31,495.55; no ARI journal is fabricated, no retained profit is changed, and CL_AFI stays unchanged. Removing ARI's credit from Note22 increases BS assets by31,495.55 while the same amount increases current-year profit. The two reports therefore remain consistent and the Balance Sheet stays balanced. Code deployment alone has no amount effect while the existing Note22 mapping remains, allowing code to be deployed before the SQL.

The same atomic SQL adds the already user-confirmed worker-advance correction: **JV2602-WA-CORR-0922, 19 February2026, DR CA_WA2,500 / CR ACW_SAL2,500**. Original PV007/02/import journal5238 and all its payment/salary/bonus lines remain unchanged. No opening amounts, imported staging, stock, telephone payment or JP documents are changed.

## Verified report totals

| Month | TB each side | Profit | BS net assets | CoGM | Comparison with latest supplied sheet |
|---|---:|---:|---:|---:|---|
| January | 14,056,981.54 | 142,263.77 | 5,712,941.51 | 537,223.39 | All match |
| February | 14,585,854.01 | 188,855.46 | 5,759,533.20 | 997,601.52 | All match |
| March | 15,207,709.41 | 149,709.03 | 5,720,386.77 | 1,470,730.05 | TB422.25 high; profit/net assets422.25 low |
| August | 18,249,730.64 | 468,491.88 | 6,039,169.62 | 3,865,986.90 | TB422.25 high; profit/net assets422.25 low |

April-July have the same422.25 remaining differences. All12 monthly TB/BS checks balance with currently recorded activity; future/incomplete months are not certified final accounts. All eight supplied CoGM targets match.

The accountant's newly repeated differences (February2,500; March2,077.75) describe the **before-correction** state. Once2,500 is corrected, February agrees, while March's signed target-minus-ERP difference changes from+2,077.75 to-422.25. These are not two additional adjustments. The previously suggested telephone reclassification is ruled out by the explicit MBTEL confirmation; all three March payments stay where they are.

The accountant offered March, but the user said January was sufficient for now. **Do not request March again at this stage.** Retain the422.25 discrepancy for later evidence; it does not block the now-evidenced January/February corrections.

## Validation

- Actual application route handlers were used for TB, BS, income statement, CoGM, JP statement and JP ledger across12 months. The same API values feed the report pages and PDFs; no frontend/PDF formatting change was needed. Green Target uses a separate report route.
- All75 nonzero PDF rows match; January expense total111,242.04, profit142,263.77 and BS net assets5,712,941.51 are asserted exactly to cents. February targets match after the worker correction.
- Confirmed code-only deployment is inert before the Note5 mapping. Tested that later ARI checkpoints are ignored for profit, new posted ARI activity counts once, a zero opening changes the result (no hardcoded amount), and2027 openings are not swept into this2026 exception.
- All protected account-opening, stock, staging, customer and JP data fingerprints remain unchanged. Only the ARI classification/audit metadata and the worker correction journal/two lines change. Original journals are retained.
- The full combined bundle was rehearsed with rollback, then applied in dev. A separate committed-state rerun verified at **2026-09-28 13:16:21 KL** changed no fingerprints or report responses, including the worker step when ARI is already Note5. Earlier standalone worker SQL uses the old report-control policy; use the new combined paste for this state.
- An initial fixture comparison sorted SQL and JavaScript account codes differently around underscores; the test was corrected to compare both in the same order. No production/database correction came from that test failure.
- Tracked-tree secret scan with Gitleaks8.30.1 passed with no leaks. No build, lint or typecheck was run. No new translation keys; the visible behaviour is described in the bilingual changelog.

## Production handoff

1. Deploy `src/routes/accounting/financial-reports.js` through the normal deployment workflow first.
2. Paste the entire **`out/audit-2026-january-note5-2026-09-28/paste-production-ssh.sh`** into the normal production Linux SSH shell. It uses native `sudo -u postgres psql` on `tienhock_prod`, runs only the pending worker/ARI corrections in one transaction, and preserves all guards. It supports the worker correction already being present. Do not use the older worker-only paste after the ARI mapping changes.
3. Retain output ending in COMMIT. Verify ARI Note5/AE, worker journal, January/February totals and zero monthly TB/BS differences before marking production complete. Conflicting source/opening/baseline states abort for review.

SQL stays local under out; no SQL commit/upload or backup command is required. The user handles production backups. No production connection or execution was performed by the assistant.

Atomic bundle SHA-256: `050e99325298a3fe918efedac98c3f2a255dc9fe859034a0dc3fccc7cb455fa2`.
Evidence under the same private directory: `verification.json`, `bundle-rehearse-verification.json`, `bundle-apply-verification.json`, `bundle-rerun-verification.json`, `bundle-*-before.json`, `bundle-*-after.json`, and the verifier scripts. The local source comparison/preview files are historical artifacts; the committed-source candidate is the actual route file.
