# Debtors GL ↔ Operations Reconciliation — Handover

**Date written:** 2026-07-22 · **Last updated:** 2026-07-24
**Status:**
- Controlled exact-match app workflow DONE (24 Jul 2026) — see §5a. Ordinary locked-period receipts remain blocked; a payment already proven by the immutable import can now be confirmed as a non-posting operational settlement.
- Bucket 3 DONE (dev ✓ / prod ✓) — see §3 and `docs/MIGRATIONS_LOG.md`.
- 2026-07-23 batch DONE (dev ✓ / prod ✓) — **21 invoices reconciled** (all of Bucket 1 + 11 of the 14 Bucket 2 customers + all 6 §6 cases: NEVER-S, A MARKET, CLS, UTEA, and MYSHOP-KM2 ×2), see §4 and `docs/MIGRATIONS_LOG.md`.
- **§6 REMAINING is now EMPTY** — the last 3 bills (UTEA 62155, MYSHOP-KM2 62394 & 62952) were answered and applied on 2026-07-23 as CASES 19-21. The actionable ops-only category is now RM0.00 (re-run §2 filter returns 0 rows). The only recon gap left is the structural "leave alone" categories (legacy-only + mixed differences, §8).
- Documentation for the batch is DONE: changelog, `docs/MIGRATIONS_LOG.md` row, and the AGENTS/CLAUDE dated entry are all written (§10).

**How to use this doc:** the actionable work is complete. If a further disputed invoice surfaces, start a fresh session, paste/reference this doc + the staff answer, apply the matching pattern from §5, and append the case to `dev/migrations/2026-07-23_debtors_recon_corrections.sql`.

> **Numbers are a snapshot, not live truth.** Amounts come from the dev database (a
> production copy as of 20 Jul 2026). Live prod data entry has continued, so current
> totals and some per-customer balances WILL differ. Before running any migration on
> prod, re-run the §2 reconciliation against the CURRENT target DB and re-pin every
> guard value. Treat this doc's amounts as evidence of what each case looked like, and
> its invoice / customer IDs as the stable identifiers.

---

## 1. Background — why two totals disagree

The Debtors report has two views with different data sources:

- **By Customer view** (default) — GL/ledger-based (debtor child account opening anchors + posted journal lines). This is the authoritative accounting position.
- **By Salesman view / invoice list / `customers.credit_used`** — operational subledger (`invoices.balance_due`).

A customer diverges when one side recorded something the other did not. Original 2026-07-22 itemization (**dev DB snapshot — historical**):

| Component | Amount (RM) | Meaning |
|---|---|---|
| GL total (all TD debtor children) | 598,818.18 | |
| Operational open invoices total | 590,983.08 | |
| **Net gap** | **7,835.10** | |
| Legacy-only accounts | +29,147.93 | GL balances for customers with NO keyed invoices — real pre-system debts, **structural, no action** |
| Ops-only invoices (GL = 0) | −12,410.00 | Bucket 1 + Bucket 2 — the actionable category (mostly fixed, see §4/§6) |
| Mixed differences | −8,902.83 | case-by-case, left to users / auditor |

**Current dev status after the 2026-07-23 batch** (re-run of §2, categorized):

| Category | Accounts | Net diff (RM) | Action |
|---|---|---|---|
| Ops-only (GL=0) — **actionable** | 0 | 0.00 | **DONE — all reconciled (CASES 1-21)** |
| Legacy-only (no invoices) | 37 | +33,478.25 | structural, no action (§8) |
| Mixed difference | 44 | −13,233.14 | case-by-case / auditor (§8) |

*(Ops-only is now empty after CASES 19-21 closed the last 3 §6 bills; the actionable category totalled exactly RM12,410.00 across CASES 1-21, matching the §1 snapshot's −12,410.00 ops-only line. The legacy-only / mixed rows are the original snapshot and unaffected by this batch.)*

## 2. Re-run the reconciliation (exact SQL)

Against the dev DB (`docker exec -i tienhock_dev_db psql -U postgres -d tienhock`):

```sql
WITH accts AS (
  SELECT code FROM account_codes WHERE ledger_type = 'TD' AND is_active
), gl AS (
  SELECT a.code,
         COALESCE(an.amount, 0) + COALESCE((
           SELECT SUM(jel.debit_amount - jel.credit_amount)
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.status='posted' AND jel.account_code=a.code
              AND je.entry_date >= COALESCE(an.as_of_date, DATE '1970-01-01')), 0) AS gl_balance
    FROM accts a
    LEFT JOIN LATERAL (
      SELECT as_of_date, amount FROM account_opening_balances
       WHERE account_code = a.code AND as_of_date <= CURRENT_DATE
       ORDER BY as_of_date DESC LIMIT 1
    ) an ON true
), ops AS (
  SELECT customerid AS code, SUM(balance_due) AS open_total
    FROM invoices
   WHERE paymenttype='INVOICE' AND LOWER(COALESCE(invoice_status,'')) <> 'cancelled'
   GROUP BY customerid
)
SELECT COALESCE(g.code, o.code) AS acct, g.gl_balance, o.open_total,
       (COALESCE(g.gl_balance,0) - COALESCE(o.open_total,0)) AS diff
  FROM gl g FULL OUTER JOIN ops o ON o.code = g.code
 WHERE ABS(COALESCE(g.gl_balance,0) - COALESCE(o.open_total,0)) > 0.01
 ORDER BY ABS(COALESCE(g.gl_balance,0) - COALESCE(o.open_total,0)) DESC;
```

To list only the **actionable** ops-only gaps (GL = 0, ops > 0), wrap the same `gl`/`ops`
CTEs and filter `WHERE ABS(gl_balance) < 0.01 AND open_total > 0.01`.

## 3. DONE — Bucket 3 (2026-07-22, dev ✓ / prod ✓)

Six invoices whose settlements already existed in the GL (legacy import) but were never keyed/confirmed operationally were closed with NON-POSTING `contra` payment rows (MYSHOP-SKT pattern). No journal was created/modified/cancelled.

- Migration: `dev/migrations/2026-07-22_gl_settled_invoices_contra.sql` (guarded, idempotent, fail-closed). **This migration also adds `contra` to the `payments.payment_method` CHECK constraint** — a prerequisite for every contra below.
- Invoices: CHANKOPI `2004676` 1,080.00 · AMY `15309` 135.00 · LEE YX `026127` 57.00 · SHAB `34704` 870.00 · HIAPLEE-SC `63599` 561.00 · LAI `34367` 1,642.00 (LAI via in-place conversion of pending cheque payment `5469`, deliberately NOT linked to IMP journal `6945`)
- Post-fix recon: five customers diff 0.00; LAI keeps a documented pre-existing RM0.35 residual (out of scope)
- Documented in: `AGENTS.md` / `CLAUDE.md` dated entry, `docs/MIGRATIONS_LOG.md` ("Applied 22 Jul 2026"), changelog
- **Prod rollout: completed** (recorded in `docs/MIGRATIONS_LOG.md`). Re-pin guard values before applying to any rebuilt or different database.

## 4. DONE — 2026-07-23 recon corrections (dev ✓ / prod ✓)

**Migration: `dev/migrations/2026-07-23_debtors_recon_corrections.sql`** (guarded, idempotent, fail-closed; one atomic `BEGIN…COMMIT`). 21 invoices reconciled: all of Bucket 1, 11 of the 14 Bucket 2 customers, and all 6 staff-answered §6 cases (CASES 16-21).

Every case is **operational-only** — the debtor GL balance was already 0.00, so **no journal is posted** into the locked, hash-pinned pre-cutover ledger; only the operational subledger is aligned. Two patterns (see §5 for when to use which):

| CASE | Invoice | Customer | Amount | Pattern | Note |
|---|---|---|---|---|---|
| 1 | 2004628 | AFRID | 870.00 | A cash | Bucket 1 |
| 2 | 2004559 | KY | 115.80 | A cash | Bucket 1 |
| 3 | 2004601 | 1M | 34.80 | A cash | Bucket 1 |
| 4 | 33909 | SABANAH-S | 1,916.00 | A cash | Bucket 2 |
| 5 | 34135 | SABANAH-S | 1,576.00 | A cash | Bucket 2 (2nd invoice — drove the two-pass design) |
| 6 | 2004297 | ANGELA | 1,608.00 | A cash | valid individual e-Invoice, untouched |
| 7 | 62959 | MYSHOP-KD2 | 15.40 | B contra | residual offset by CN `TH/CN/41`; anchor 497.60 = 513 − 15.40; kept TF pmt 3352 |
| 8 | 2004210 | KOPI 148 | 330.00 | B contra | transfer `TR041025` 04/10/2025; anchors 0.00 |
| 9 | 62643 | KELUARGA | 435.00 | B contra | cash 11/12/2025; anchors 1235/870 net to 0; cancelled pmt 1444 preserved |
| 10 | 013543 | WONG-KM | 975.00 | B contra | cash 10/12/2025; anchors 0.00 |
| 11 | 62681 | 83 MM | 88.50 | A cash | Bucket 2 |
| 12 | 34094 | BARAKAH | 348.00 | A cash | Bucket 2 |
| 13 | 62866 | A&A | 372.00 | A cash | `credit_used` drift (was 0) corrected by recompute |
| 14 | 2004275 | MING-P | 867.00 | A cash | Bucket 2 |
| 15 | 2004424 | TAY | 17.40 | A cash | Bucket 2 |
| 16 | 2004285 | NEVER-S | 1,086.00 | A cash | §6 staff answer: cash sale (was Consolidated child) |
| 17 | 2004226 | A MARKET | 365.00 | A cash | §6 staff answer: cash sale |
| 18 | 026261 | CLS | 976.00 | B contra | §6 staff answer: online 04/11/2025 (salesman book); anchor 2026-06-01=0.00 (no 2026-01-01 anchor) |
| 19 | 62155 | UTEA | 342.00 | B contra | §6: whole bill, online 15/07/2025 `TF150725-1`; anchor 2026-01-01=0.00; preserved cancelled bank_transfer pmt 174 |
| 20 | 62394 | MYSHOP-KM2 | 50.15 | B contra | §6: residual after RM1,621.35 online (`TF161225-3`, pmt 2553); 3% discount CN `TH/CN/25/38` (26/08/2025) |
| 21 | 62952 | MYSHOP-KM2 | 21.95 | B contra | §6: residual after RM709.55 online (`TF110226-5`, pmt 3351); 3% discount CN `TH/CN/25/49`. Latest anchor 2026-06-01=803.65 nets to GL 0.00 |

**File structure (how to extend it):**
- **CASE 1** — standalone `DO` block (AFRID).
- **CASES 2-6, 11-15, 16, 17** — one two-pass `DO` block driven by a `_recon_cash_cases` temp table: Pass 1 converts each invoice INVOICE→CASH; Pass 2 verifies the recon per **DISTINCT** customer (so a customer with two invoices, like SABANAH-S, isn't asserted to zero mid-way). **To add a Pattern-A case: append one row to the `INSERT INTO _recon_cash_cases VALUES` list** — Pass 2 picks up the customer automatically.
- **CASES 7, 8, 9, 10, 18, 19** — separate `DO` blocks (single-invoice Pattern B contras). **To add a Pattern-B case: copy the closest block** (CASE 8 = zero-anchor/no-prior-payment with a 2026-01-01 anchor; CASE 18 = settled by online transfer where the customer has ONLY a 2026-06-01 anchor at 0.00, no 2026-01-01 anchor — pins the latest anchor instead; CASE 9 = non-zero anchors + a preserved cancelled payment; CASE 19 = whole-bill contra with a preserved cancelled payment AND a 2026-01-01 anchor at 0.00; CASE 7 = partial residual with a prior active payment).
- **CASES 20-21** — one two-pass `DO` block for MYSHOP-KM2's two partial residual contras (both 3% prompt-payment-discount CNs), driven by a `_km2_contra_cases` temp table: Pass 1 inserts each residual contra + closes the invoice; Pass 2 recomputes `credit_used` once and verifies the customer recon (pins the latest 2026-06-01 anchor 803.65, netted to GL 0.00). Same "don't assert a multi-invoice customer to zero mid-way" design as the cash block. **To add another same-customer residual contra: append a row to the `INSERT INTO _km2_contra_cases VALUES` list.**
- Remember to add the new invoice/customer IDs to the three verification `SELECT`s at the bottom.
- Re-apply after each edit: `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -v ON_ERROR_STOP=1 < dev/migrations/2026-07-23_debtors_recon_corrections.sql` — already-applied cases no-op; new cases apply; any drift aborts the whole transaction.

## 5. Decision guide — how to treat a staff answer

Always **verify the debtor GL balance is 0.00 first** (or that an opening anchor covers the settlement). If the GL still shows the debt, closing it is a **write-off** → flag back to the user, do NOT apply.

| Staff answer | Treatment |
|---|---|
| "It's a **cash sale**" (paid at point of sale; invoice mis-keyed as credit) | **Pattern A** — flip `paymenttype` INVOICE→CASH, add a non-posting auto-collection `cash` payment dated to the invoice, recompute `credit_used`. (CASE 1-6, 11-15.) |
| "**Paid later** by transfer / online / cheque / cash" (with ref + date) | **Pattern B** — keep INVOICE, add a non-posting `contra` payment citing the ref+date, invoice→paid, recompute `credit_used`. (CASE 8, 9, 10.) |
| "Offset by a **CN / 3% prompt-payment discount**" | **Pattern B** — contra citing the CN/discount. (CASE 7.) |
| "**Not real** / test / duplicate / undelivered" | Cancel the invoice via the app (or a guarded cancellation migration if the period lock blocks it) — restores balance/credit, cancels any invoice-owned journal. |
| "**Still owed**" (customer genuinely hasn't paid) | Leave the invoice open; the books never captured the receivable. Flag for the auditor; do NOT force-post without approval. |

Both patterns are **operational-only, non-posting** here because the settlement (if any) is already in the pre-cutover GL / opening anchors; posting a fresh journal would double-count in the locked, hash-pinned ledger. The `contra` method is the system marker for "already in accounting, non-posting subledger alignment" (regardless of the original cash/transfer/CN method).

## 5a. Controlled app workflow for an exact imported receipt (24 Jul 2026)

Payment Management now handles the narrow Pattern-B case without a one-off migration when all evidence is exact. Normal receipt creation first checks a single selected invoice/reference/amount against the immutable Jan-May import. If one match is proven, the UI shows the imported ledger date and asks the user to confirm that existing payment. Confirmation calls `POST /api/payments/reconcile-imported`; it inserts one non-posting, immutable `contra` payment projection, sets the invoice paid, and recomputes `customers.credit_used`. It creates and links **no receipt and no journal**.

This is not a period unlock. The match fails closed unless all of these agree:

- one open, unconsolidated INVOICE with no owned journal, payment/receipt history, or adjustment-document history;
- full invoice total = current balance = selected amount;
- one active TD account for the invoice customer;
- one posted pre-2026-06-01 `IMP`/legacy-`REC` journal with the exact visible reference;
- exactly two nonzero journal lines: the selected bank/holding-account debit and customer-debtor credit, both with exact invoice/customer particulars;
- exactly two matching `import_legacy_rows` transaction rows, both unrepaired `source_csv` rows with pinned hashes, exact date/reference/accounts/cents/particulars;
- invoice date ≤ entered received date ≤ imported ledger date; and
- current operational open invoices minus the customer's debtor GL equals exactly this invoice amount, with both totals equal after the simulated close.

Ambiguous, partial, previously adjusted, mixed-difference, chronology-invalid, or multi-invoice cases remain manual review. The preflight runs even when the user enters an open-period date, so changing the date cannot post a duplicate of an imported receipt. Confirmation is idempotent and deliberately leaves `payments.journal_entry_id`, `receipt_allocation_id`, `bank_account`, and `internal_reference` NULL so the projection can never claim ownership of or cancel the immutable imported journal.

The duplicate-evidence boundary also runs before held-overpayment application and pending-cheque confirmation. Pure customer-deposit (`excess`) receipts and debtor `account` allocations cannot replay an exact approved imported debit/credit reference and amount. These guards block duplicate accounting; only the exact single-invoice workflow above can create a non-posting confirmation candidate.

First proven case: HIAPLEE-M invoice `62586`, RM523.50. Imported journal `6645` already contains `PBB111306` on 15/04/2026 (DR `BANK_PBB`, CR `HIAPLEE-M`) while the user entered 13/04/2026. The confirmation uses 15/04/2026 in payment history, retains 13/04/2026 in the audit note, and changes operations from RM1,857.90 to RM1,334.40, exactly matching the unchanged debtor GL RM1,334.40.

## 6. DONE — the last staff-answered bills (2 customers / 3 bills, RM414.10)

All answered and applied on 2026-07-23 (CASES 16-21, §4). This section is now empty of pending work.

| # | Customer | Bill | Amount (RM) | Answer → treatment | CASE |
|---|---|---|---|---|---|
| 1 | UTEA (U TEA RESOURCES) | 62155 | 342.00 | Paid online 15/07/2025 `TF150725-1` (original pmt 174 was cancelled) → Pattern B contra, whole bill | 19 |
| 2 | MYSHOP-KM2 (MY SHOP-KOTA MARUDU 2) | 62394 | 50.15 | RM1,621.35 paid online 16/12/2025 (`TF161225`); residual = 3% prompt-payment discount, CN `TH/CN/25/38` (26/08/2025) → Pattern B contra | 20 |
| 3 | MYSHOP-KM2 | 62952 | 21.95 | RM709.55 paid online 11/02/2026; residual = 3% prompt-payment discount, CN `TH/CN/25/49` → Pattern B contra | 21 |

`UTEA` and `MYSHOP-KM2` were **not** in the original §5 Bucket 2 list (its 20 Jul numbers weren't exhaustive). MYSHOP-KM2's two residuals were **partial** balances after large online payments and equal exactly 3% of each bill — confirmed prompt-payment discounts, closed as Pattern B contras citing the CN.

**Earlier that day** (CASES 16-18, §4): NEVER-S `2004285` RM1,086.00 → cash sale (Pattern A); A MARKET `2004226` RM365.00 → cash sale (Pattern A); CLS `026261` RM976.00 → online transfer 04/11/2025 per the salesman's cash/cheque book (Pattern B contra).

BM message sent to staff on 2026-07-23 to collect these answers (paid? how/when/ref? discount/contra? or still owed?):

```
Salam, ada 6 bil lagi yang masih outstanding dalam sistem tapi mungkin dah selesai. Mohon semak rekod & maklumkan untuk setiap bil sama ada:
(a) sudah dibayar — nyatakan cara (tunai / bank transfer / online / cheque), tarikh, & no rujukan;
(b) ada diskaun / potongan / contra (cth CN atau prompt payment 3%); atau
(c) memang masih belum bayar (customer berhutang lagi).

1. NEVER CLOSE SUPERMARKET (Kota Belud) — Bil 2004285, 29/10/2025 — RM1,086.00
2. CLS GEMILANG ENTERPRISE — Bil 026261, 27/10/2025 — RM976.00
3. A MARKET - BENONI — Bil 2004226, 08/10/2025 — RM365.00
4. U TEA RESOURCES S/B — Bil 62155, 12/07/2025 — RM342.00
5. MY SHOP - KOTA MARUDU 2 — Bil 62394, 25/08/2025 — baki RM50.15 (drpd RM1,671.50)
6. MY SHOP - KOTA MARUDU 2 — Bil 62952, 08/12/2025 — baki RM21.95 (drpd RM731.50)

Nota: baki #5 & #6 tepat 3% drpd jumlah bil — kemungkinan besar diskaun prompt payment. Mohon sahkan.

Terima kasih.
```

## 7. Prod rollout (completed)

Both migrations are recorded as **dev ✓ / prod ✓** in `docs/MIGRATIONS_LOG.md`:
1. `2026-07-22_gl_settled_invoices_contra.sql` (Bucket 3) — **must run first**, because it enables the `contra` payment method that the 2026-07-23 contras depend on.
2. `2026-07-23_debtors_recon_corrections.sql` (this batch, CASES 1-21) — its contra cases (7-10, 18-21) guard-check that `contra` is permitted and abort with a clear message if it isn't.

For a future rebuild or another environment:
- **Re-pin** every guard value against the CURRENT prod DB (re-run §2). Both files are **fail-closed and atomic** — if any before-state doesn't match, the whole transaction rolls back (nothing changes) and names the failing case. Fix that case's pinned values and re-run; already-correct cases no-op.
- The 2026-07-23 file is final (all 21 cases in; §6 is empty).

## 8. Explicitly NOT to do

- Do not force an ordinary receipt through the app to "fix" any of the above — it would post a real receipt journal on top of the mismatch. Use the controlled §5a confirmation only when the app presents an exact imported-ledger match; otherwise flag the case for review.
- Do not touch the **legacy-only accounts** (37 accts, ~+33k) — real pre-system debts with no keyed invoices; the By Customer view surfaces them correctly.
- Do not chase the **mixed-difference** customers (44 accts, ~−13k) or sub-RM100 residuals without a specific user request / staff answer.

## 9. Optional cosmetic — self-cancelling sibling pairs (~RM77)

Receipts posted to the wrong sibling account; combined Trade Debtors unaffected:

- MYSHOP-TLD (−71.50) ↔ MYSHOP-MTP (+71.50)
- CKS-T (−5.60) ↔ CKS-I (+5.60)

Fix = small re-point migration in the style of `2026-07-16_myshop_km5_64072_debtor_reassign.sql` (git history). Only do it if the user asks.

## 10. Definition of done for any fix above

1. Guarded, idempotent migration in `dev/migrations/`, applied to dev with all guards passing.
2. §2 recon re-run: affected customers diff 0.00 (or a documented, pre-existing residual).
3. `credit_used` recomputed and equal to each customer's open-invoice total.
4. Dated entries in `AGENTS.md` + `CLAUDE.md`, row in `docs/MIGRATIONS_LOG.md`, changelog entry (`CHANGELOG_ENTRIES` in `src/components/ChangelogModal.tsx`, ms + en, prepended).
5. Prod rollout status recorded in `docs/MIGRATIONS_LOG.md`; any future target is re-pinned and approved separately.

**DONE for the 2026-07-23 batch** (2026-07-23, batch now final at CASES 1-21): item 4 above is complete — changelog entry prepended (`CHANGELOG_ENTRIES`, ms + en, RM12,410.00 summary), `docs/MIGRATIONS_LOG.md` row added, and the "Debtors recon corrections (2026-07-23)" dated entry written into `AGENTS.md` + `CLAUDE.md`. Only the prod rollout (§7) remains, as a separate approved step with guard re-pinning.
