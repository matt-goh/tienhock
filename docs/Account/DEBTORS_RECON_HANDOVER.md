# Debtors GL ↔ Operations Reconciliation — Handover

**Date written:** 2026-07-22
**Status:** Bucket 3 DONE (dev; prod PENDING). Buckets 1 & 2 await staff answers. Everything else is documented noise or user-level cleanup.
**How to use this doc:** when the staff answers arrive, start a fresh session, paste/reference this doc together with the answers, and ask for the corresponding fix in §4/§5.

> **Numbers are a snapshot, not live truth.** Every amount in this doc comes from the
> dev database, which is a production copy as of 20 Jul 2026. Live prod data entry has
> continued since, so current outstanding totals (and possibly some per-customer
> balances) WILL differ. Before applying any fix below — and before running the
> bucket-3 migration on prod — re-run the §2 reconciliation against the CURRENT
> target database and re-pin every guard value to what it returns. Treat this doc's
> amounts as evidence of what each case looked like on 2026-07-22, and its invoice /
> customer IDs as the stable identifiers.

---

## 1. Background — why two totals disagree

The Debtors report has two views with different data sources:

- **By Customer view** (default) — GL/ledger-based (debtor child account opening anchors + posted journal lines). This is the authoritative accounting position.
- **By Salesman view / invoice list / `customers.credit_used`** — operational subledger (`invoices.balance_due`).

A customer can diverge when one side recorded something the other did not. On 2026-07-22 the full population was itemized (**dev DB snapshot — expect drift on live prod**):

| Component | Amount (RM) | Meaning |
|---|---|---|
| GL total (all TD debtor children) | 598,818.18 | |
| Operational open invoices total | 590,983.08 | |
| **Net gap** | **7,835.10** | = the three rows below |
| Legacy-only accounts | +29,147.93 | GL balances for customers with NO keyed invoices (BTS-*, SHIFANA, MADINAH-N, FOOKHING, YNWA, AC, ALDIE, DYNASTY, 68-K, etc.) — real pre-system debts, **structural, not an error, no action** |
| Ops-only invoices (GL = 0) | −12,410.00 | Bucket 1 + Bucket 2 below |
| Mixed differences | −8,902.83 | NOOR, SHOP(1), SABINDO-K, SENANG, RED, HIAPLEE-M, SHOP(2), MYSHOP(2), PUBLIC, C-CARE(3), MYSHOP-QL, … — case-by-case, left to users |

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

## 3. DONE — Bucket 3 (2026-07-22, dev ✓ / prod PENDING)

Six invoices whose settlements already existed in the GL (legacy import) but were never keyed/confirmed operationally were closed with NON-POSTING `contra` payment rows (MYSHOP-SKT pattern). No journal was created/modified/cancelled.

- Migration: `dev/migrations/2026-07-22_gl_settled_invoices_contra.sql` (guarded, idempotent, fail-closed)
- Invoices: CHANKOPI `2004676` 1,080.00 · AMY `15309` 135.00 · LEE YX `026127` 57.00 · SHAB `34704` 870.00 · HIAPLEE-SC `63599` 561.00 · LAI `34367` 1,642.00 (LAI via in-place conversion of pending cheque payment `5469`, deliberately NOT linked to IMP journal `6945`)
- Post-fix recon: five customers diff 0.00; LAI keeps a documented pre-existing RM0.35 residual (out of scope)
- Documented in: `AGENTS.md` / `CLAUDE.md` dated entry, `docs/MIGRATIONS_LOG.md` ("Applied 22 Jul 2026"), changelog
- **Prod rollout: PENDING — re-pin guard values against live data before running.**

## 4. Bucket 1 — 2026 sales MISSING from the GL (RM1,020.60) — awaits staff answers

The only remaining item where the audited books themselves are wrong (receivables + revenue understated). All three are 2026 operational invoices with NO GL posting at all:

| Invoice | Customer | Amount (RM) |
|---|---|---|
| `2004628` | AFRID | 870.00 |
| `2004559` | KY | 115.80 |
| `2004601` | 1M | 34.80 |

**Question asked of staff:** did the sale really happen and goods delivered?

- **If REAL** → post the missing S-sale journals, dated to the invoice dates, matching the contract shape (DR debtor child / CR CR_SALES or CASH_SALES per payment type, tax lines as on the invoice). Use a guarded migration; verify each customer's recon diff closes to 0.00 afterwards.
- **If NOT real (test/duplicate/undelivered)** → cancel the operational invoice through the normal app flow (or a guarded cancellation migration if the app blocks it), which restores balance/credit and cancels any invoice-owned journal.

Useful evidence when deciding: `invoices` row (`einvoice_status`, `uuid`, `createddate`), `order_details` lines, who keyed it, and whether the customer remembers the delivery.

## 5. Bucket 2 — 2025 bills with GL = 0 (~RM11,396.90) — awaits staff answers

Operational invoices still showing outstanding while the customer's ledger balance is exactly zero. Either genuinely owed (pre-system debt never captured in the books) or long settled.

| Customer | Open (RM) | | Customer | Open (RM) |
|---|---|---|---|---|
| SABANAH-S | 3,492.00 | | A&A | 372.00 |
| ANGELA | 1,608.00 | | A MARKET | 365.00 |
| NEVER-S | 1,086.00 | | BARAKAH | 348.00 |
| CLS | 976.00 | | KOPI 148 | 330.00 |
| WONG-KM | 975.00 | | 83 MM | 88.50 |
| MING-P | 867.00 | | TAY | 17.40 |
| KELUARGA | 435.00 | | MYSHOP-KD2 | 15.40 |

**Per customer, staff answers "still owed" or "settled":**

- **"Settled"** → same safe treatment as Bucket 3: guarded NON-POSTING `contra` payment row citing the settlement evidence, invoice → paid, `credit_used` recomputed. Copy the pattern from `dev/migrations/2026-07-22_gl_settled_invoices_contra.sql`. IMPORTANT: a contra is only legitimate when GL settlement evidence exists (receipt credit or an opening anchor covering it) — verify per customer first, exactly like Bucket 3; if NO evidence exists, closing would be a write-off and must be flagged back to the user instead.
- **"Still owed"** → leave the invoice open; the books never captured the receivable. Keep on a list for the auditor conversation; do NOT force a posting without user approval.

## 6. Optional cosmetic — self-cancelling sibling pairs (~RM77)

Receipts posted to the wrong sibling account; combined Trade Debtors unaffected:

- MYSHOP-TLD (−71.50) ↔ MYSHOP-MTP (+71.50)
- CKS-T (−5.60) ↔ CKS-I (+5.60)

Fix = small re-point migration in the style of `2026-07-16_myshop_km5_64072_debtor_reassign.sql` (git history). Only do it if the user asks.

## 7. Explicitly NOT to do

- Do not key payments through the app to "fix" any of the above — a keyed payment posts a real receipt journal on top of the mismatch. Staff have been told (BM notice sent 2026-07-22) to flag, not fix.
- Do not touch the legacy-only accounts (+29,147.93) — real pre-system debts with no keyed invoices; the By Customer view surfaces them correctly.
- Do not chase the mixed-difference customers (§1) or sub-RM100 residuals without a specific user request.

## 8. Definition of done for any fix above

1. Guarded, idempotent migration file in `dev/migrations/`, applied to dev with all guards passing.
2. §2 recon query re-run: affected customers diff 0.00 (or a documented, pre-existing residual).
3. `credit_used` recomputed and equal to each customer's open-invoice total.
4. Dated entries in `AGENTS.md` + `CLAUDE.md`, row in `docs/MIGRATIONS_LOG.md`, changelog entry (`CHANGELOG_ENTRIES` in `src/components/ChangelogModal.tsx`, ms + en, prepended).
5. Prod marked PENDING with a re-pin note — prod rollout is a separate approved step.
