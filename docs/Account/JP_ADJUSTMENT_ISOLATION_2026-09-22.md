# Jelly Polly adjustment isolation - 22 September 2026 KL

**Production confirmed by user-supplied SSH output on 22 September 2026:** the combined correction completed with final `COMMIT`. JP June is DR594.10; January correction journal13499 (`JV2601-CORR-0913`) and August PCB offset journal13500 (`JV2608-PCB-OFFSET-0913`) were created. All four January account targets match. Misplaced journal `JCN-202608-0007` is cancelled; JP credit note `JP-CN-26-7` remains active with its journal link cleared. All12 monthly TB/BS differences are zero. January TB14,056,981.54/profit110,768.22; August TB18,247,230.64/profit436,996.33. Flour purchases remain19,765 and19,600. This confirms the SQL outcome, not full reconciliation of the remaining2,500/422.25/ARI31,495.55 questions. Execution timestamp was not included in the pasted output. Local evidence: `out/audit-2026-jp-ledger-isolation-2026-09-22/production-confirmation.txt`. Earlier pending/dev entries below are historical; the latest dev refresh was only rehearsed and rolled back.


**Code fix implemented; dev data correction applied at 2026-09-22 05:44:07 KL and exact rerun verified at 2026-09-22 05:44:45. Production code deployment and SQL execution remain pending.** The user explicitly approved the proposed route fix and existing journal correction after the accounting effect was explained.

## Problem and resulting behaviour

Jelly Polly credit note JP/CN/26/7 (internal JP-CN-26-7) belongs to its own invoice003844 for BESTWISE, amount258.13, damaged-goods return, accounting date29 August2026. Its shared adjustment route created public journal13062/JCN-202608-0007, DR CR_SALES258.13 / CR TR258.13, even though Jelly Polly's original invoice does not post sales to this Tien Hock ledger. This incorrectly reduced Tien Hock revenue, profit and net assets from August.

`src/routes/sales/adjustment-docs/index.js` now invokes the CN/DN/RN journal helpers only for the default Tien Hock document table. Jelly Polly retains its existing invoice balance, customer credit and refund behaviour and stores no new shared journal link. Tien Hock's posting-date lock, journals and refund-allocation behaviour remain in place. Green Target has a separate adjustment route and is unchanged.

The existing misplaced journal is **cancelled, not deleted**; both original lines, reference, source link and monetary values are preserved. The description appends an explicit company-isolation explanation; updated_by identifies `audit-jp-isolation-20260922`. Only the JP source document's journal_entry_id is cleared and updated_at refreshed. Its status remains active, amount258.13, source invoice, lines, reason, e-invoice fields and all other fields are unchanged. No invoice, customer, payment or credit-note financial effect is reversed.

This is separate from the valid Tien Hock debtor account named JP and its January split/June checkpoint. Those earlier fixes remain in place.

## Verified report effect

January-July actual report responses are unchanged. From August, each TB column, revenue, profit and BS net assets increase258.13. CoGM, expenses, liabilities and Tien Hock's JP customer statement/ledger remain unchanged. All12 monthly TB/BS checks balance.

| August2026 report | Corrected dev | Latest user target | Still to reconcile |
|---|---:|---:|---:|
| TB, each side | 18,247,230.64 | 18,249,308.39 | 2,077.75 |
| CoGM | 3,865,986.90 | 3,865,986.90 | 0.00 |
| Profit | 436,996.33 | 468,914.13 | 31,917.80 |
| BS net assets | 6,007,674.07 | 6,039,591.87 | 31,917.80 |

The August-specific258.13 discrepancy is resolved in dev. Remaining2,500 February and422.25 March account-allocation questions and ARI31,495.55 treatment are unchanged. Do not change amounts simply to force the remaining targets. All eight CoGM targets already match; flour credits must not be added again.

## Validation and guards

-16 behaviour cases execute the changed accounting orchestration function with instrumented dependencies: TH/JP x credit/cash invoice x CN/DN/paired-RN/standalone-RN. Tien Hock still invokes the correct journal helper; Jelly Polly invokes none. Signed invoice/customer updates, TH posting locks and standalone-refund allocation consumption are checked. This isolates the changed function; it is not a full HTTP/browser test.
- Exact SQL rollback rehearsal and a one-transaction production-bundle rehearsal passed. A partial state (posted TH journal with already-cleared JP document link) rejected and rolled back.
- Each dev rehearsal/apply/rerun validates72 actual report responses across12 months: TB, BS, IS, CoGM, JP statement and JP ledger. TB account deltas are checked through the DEBTOR aggregate because TR is a TD account. An initial test expectation incorrectly looked for a separate TR row; it was corrected after verifying the account type, with that failed attempt rolled back.
- Complete fingerprints verify no changes to journal lines, account codes/openings, financial notes, stock, staging, JP invoices/payments/document lines or shared customers. Inside SQL, all other journal headers and JP documents are compared against before-images. The affected document is compared excluding only journal_entry_id/updated_at.
- Exact rerun changes no table fingerprints, journal metadata or document metadata. Future-month reports use currently recorded postings, not completed future-month accounts.

The guarded SQL checks the database, exact source document/header/line identity, amount and date, the original or exact already-corrected state, no additional posted jp_adjustment journals and balanced baseline reports. A new conflicting JP posting aborts instead of silently cancelling an unreviewed document. It validates the precise report effect before COMMIT. Transaction-local locks and timeouts protect against concurrent changes.

## Production

1. Deploy the change to `src/routes/sales/adjustment-docs/index.js` through the existing code deployment process so new JP adjustments stop creating Tien Hock journals.
2. Paste the entire **`out/audit-2026-jp-ledger-isolation-2026-09-22/paste-production-ssh.sh`** into the normal Linux SSH shell. This newest script runs the JP June correction, four January account correction/August PCB offset, and this company-isolation correction in one transaction. Already-applied portions verify as no-ops. It uses native `sudo -u postgres psql` against `tienhock_prod`.
3. Confirm final COMMIT, cancelled JCN-202608-0007, active JP-CN-26-7 with journal link NULL, and balanced monthly controls. A guard failure needs review; do not remove guards. Record user-supplied production output before marking it complete.

The SQL is local-only under out; it does not need a Git commit or server upload. No backup commands are included, as requested. The user handles production backups. Application code deployment remains necessary for preventing recurrence; running SQL alone only cleans existing data.

Standalone cleanup SHA-256: `9179134ed93bb874d05b80880870130e7dc10c8164ec4702ae74f533cf3f00da`.
Atomic production bundle SHA-256: `5b4ba62bdb4085dc9a56b1d0af0e2b4739841630fdada5b3027787ac6e96751f`.

Evidence: `before-reports.json`, `posting-checks.json`, `rehearse-verification.json`, `apply-verification.json`, `rerun-verification.json`, `production-bundle-rehearsal.txt` and `partial-state-rejected.txt` in the local artifact directory above. No build, lint or TypeScript check was run; no new translation keys are needed because no UI text was added. The visible change is recorded in the bilingual changelog.
