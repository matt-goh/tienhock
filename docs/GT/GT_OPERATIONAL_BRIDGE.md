# Green Target — legacy ledger ↔ ERP operational bridge (Jan–Jun 2026)

**Written 27 Jul 2026 as part of Phase G5.** Companion to
[GT_ACCOUNTING_HANDOVER.md](GT_ACCOUNTING_HANDOVER.md) §3d.

Tien Hock needed a whole reconciliation project to bridge its legacy ledger to its ERP
([LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md](LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md)), because its ERP
held 2,163 invoices against 2,121 legacy sales rows — near-parity, so every gap was a question that
had to be answered one document at a time. **Green Target needs no such project, and this page is the
whole deliverable.** Not because the bridge is clean, but because it is so lopsided that
document-level reconciliation would be meaningless: the GT ERP was only ever used to submit
e-Invoices, so it is a deliberate ~3% sample of GT's trading, not a parallel record of it.

Every figure below is asserted as a gate by the `bridge` stage of
`dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs`, so none of it can rot silently:

```bash
node dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs bridge
```

---

## 1. The finding that makes this bridge exact rather than approximate

**`greentarget.invoices.invoice_number` IS the legacy document reference.** ERP invoice 287 carries
`2026/00054`; legacy journal `2026/00054` is a counter-sale crediting `TGA` 230.00 on 9 January. The
ERP is not a second sales system that happens to overlap — it is an **e-Invoice submission register
laid over the legacy `#/#` counter-sales family**, keyed by the legacy reference.

That was not obvious, and matching on the natural keys hides it completely: an ERP invoice's
`date_issued` is its *e-Invoice submission* date, which lags the legacy sale by **0 to 47 days
(mean 12.7)**. A (date, amount) match therefore finds only **2 of 36** pairs, while an exact
reference match finds **35 of 37**. Anyone re-deriving this by date will conclude the two systems are
unrelated. They are not.

---

## 2. Sales

| | Documents | Value |
|---|---:|---:|
| Legacy counter sales (`#/#`) | 1,011 | 218,360.00 |
| Legacy credit sales (`I#/#`) | 89 | 46,848.20 |
| **Legacy sales documents, Jan–Jun 2026** | **1,100** | **265,208.20** (= Note 7 revenue) |
| ERP invoices dated Jan–Jun 2026 | 37 | |
| — with an exact legacy counterpart | **35** | 7,700.00 |
| — without | 2 | see below |

**35 of 1,100 legacy sales documents have an ERP counterpart — 3.2% by count, 2.9% by value.** The
other 1,065 were never entered. That is the expected result of §3d, quantified.

**None of the 89 credit sales has an ERP counterpart — zero, not "few".** Every ERP invoice maps to
the counter-sales family. So the ERP has never recorded a Green Target credit sale, and the entire
trade receivable of **156,782.22** at 30 June exists only in the imported ledger's 28 debtor children.
This is the single most consequential line on this page: **the debtors report and the receivable are
ledger facts with no operational counterpart at all.**

### The two ERP invoices with no legacy journal — both explained, neither missing

| ERP invoice_number | Date issued | What it is |
|---|---|---|
| `2026/00496(A)` | 2026-04-23 | An `(A)`-suffixed **re-submission** of legacy `2026/00496`. The original ERP invoice against that document (id 303) is `cancelled`/`einvoice_status=cancelled`; id 311 replaces it. The legacy document exists and is imported once. |
| `2025/02258(a)` | 2026-02-06 | A **2025** legacy document, e-Invoiced in February 2026. It falls outside the Jan–Jun 2026 import window entirely, so no counterpart can exist in the imported ledger. |

Neither is a missing sale, and neither is fabricated to close a gap.

### One named amount disagreement — RM50.00, not reconciled

| Reference | ERP | Imported ledger | Difference |
|---|---:|---:|---:|
| `2026/00099` | 180.00 | 230.00 | **50.00** |

The legacy journal credits `TGA` 230.00 with particulars `INV/NO : 2026/00099 /CD-LIST` on
17 January; the ERP invoice (id 292, `NEW TECH FURNITURE SDN BHD`, submitted 6 February) carries
180.00. **The ledger is authoritative** — it is the hash-pinned legacy export and it reconciles to the
printed Trial Balance to the cent, whereas the ERP figure participates in no total that is
independently evidenced. No adjustment was made in either direction, and nothing was invented to
close it. It is the only such disagreement among the 35 matched pairs.

---

## 3. Receipts

| | Documents |
|---|---:|
| Legacy receipt vouchers (`RV#/#/#`) | 472 |
| — settling a trade debtor | 51 |
| — banking counter cash (no debtor leg) | 421 |
| ERP payments dated Jan–Jun 2026 | 15 |
| — matching a legacy receipt voucher | **0** |

**Zero is the correct and expected answer here, and it is structural rather than a data gap.** Every
ERP invoice is a *counter sale*, which the legacy system collects at the counter: the `#/#` journal
debits `CD_SD` (cash debtors) on the sale date, so the money is already collected and there is no
separate receipt document to match. An ERP "payment" against one of these invoices is an artifact of
the ERP modelling a cash sale as invoice-plus-payment; it has no legacy counterpart by construction,
and 3 of the 15 settle pre-2026 invoices anyway (590.00 of the 3,200.00).

The 51 legacy receipts that *do* settle a trade debtor belong to the credit-sales population, which
the ERP has never held (§2). Both sides of the receipt bridge are therefore empty for the same single
reason.

---

## 4. Customers

The 28 legacy debtor codes and the 47 `greentarget.customers` rows are effectively disjoint
(handover §3e): only **2** have a candidate, and **neither is proven** — `PAUMIN` matches "PAUMIN
HARDWARE SDN BHD" modulo punctuation, while `SUTERA`'s ledger description is "SUTERA MEGAH SDN BHD"
against ERP customer #20 "SUTERA SERIMEWAH SDN BHD", **a different company name**.

There is also nothing to match *on* for the counter-sales side: a legacy `#/#` journal credits
revenue and debits `CD_SD` and **names no customer at all**, so the 35 matched documents carry no
customer identity to reconcile. Customer-level parity is not merely absent — for 1,011 of the 1,100
legacy sales documents it is not a well-formed question.

`dev/import/greentarget-legacy/debtor-map.json` records this with **0 approved mappings**. It is
consumed by G7's non-destructive debtor sync (R6), not by G5, and still needs the user's approval.

---

## 5. What this means, and what has to change

- **The imported ledger is the only complete record of Jan–Jun 2026 GT trading.** Every report engine
  built in G5 reads it and nothing else. The operational tables are not a cross-check on it — they
  cover 2.9% of revenue and 0% of receivables.
- **Do not attempt document-level parity, and never fabricate an ERP invoice to match a legacy row.**
  That was settled in §3d and this page is the quantified version of it.
- **⚠ The organic ledger will be incomplete from day one unless data entry changes.** This is handover
  §7's operational risk and it belongs to the user, not to engineering. From 1 July 2026 the GL is
  fed by the operational screens, so if GT continues entering only e-Invoice sales, the post-cutover
  Trial Balance will describe ~3% of the business while looking exactly as authoritative as the
  imported one. Either **every** GT invoice and payment gets entered from 1 July, or GT keeps posting
  its ledger from manually keyed journals and the operational screens stay an explicit partial feed.
  **That choice has to be made before G7 ships**, because it changes what the Trial Balance means
  after the cutover — and no amount of engineering compensates for it.

---

## 6. Re-deriving any figure on this page

```sql
-- the exact-reference match that this whole bridge rests on
SELECT i.invoice_number, i.date_issued, j.entry_date, j.legacy_entry_type, i.total_amount
  FROM greentarget.invoices i
  LEFT JOIN greentarget.journal_entries j ON j.display_reference = i.invoice_number
 WHERE i.date_issued BETWEEN DATE '2026-01-01' AND DATE '2026-06-30'
 ORDER BY i.date_issued;
```

The `bridge` harness stage asserts all of it — 37/15 ERP counts, 35 matched, 1,011/89/472/51 legacy
counts, 0 credit-sale counterparts, the 2 named suffixes, and the single 2026/00099 disagreement. If
a figure here ever stops being true, that stage names it.
