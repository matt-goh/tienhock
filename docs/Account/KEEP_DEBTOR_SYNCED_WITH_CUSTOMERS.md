# Handover: Keep DEBTOR child accounts 1:1 with customers

## Context

Users report that some customers are **missing from the account ledger** (the chart-of-accounts
list of Trade Debtors). Under the `DEBTOR` parent in `account_codes`, there is meant to be one
child account per customer (`code = customer.id`, `description = customer.name`,
`ledger_type = 'TD'`, `parent_code = 'DEBTOR'`, `level = 2`).

These children were created **once** by a migration (`003_insert_debtors_from_customers.sql`,
since removed in commit `75140286`) that copied every customer into `account_codes`. Nothing in
[customers.js](src/routes/catalogue/customers.js) has maintained them since — so as customers are
added / renamed / re-IDed / deleted, the two tables drift apart.

**Confirmed gap (dev DB):**
- 1,565 customers vs 1,509 `DEBTOR` children → **56 customers have no child account**.
- **0 orphans** in the other direction (every child still maps to a customer).
- The 56 missing are all recently-created customers, most with invoices — exactly what users are
  looking for and not finding.

**Decisions (confirmed with user):**
1. **Auto-sync + backfill** — hook the customer lifecycle so it never drifts again, plus a
   one-time backfill of the current 56.
2. **Suffix collisions with `-D`** — 4 missing customers (`CASH`, `SUN`, `HR`, `SER`) have IDs that
   already exist as *other* account codes (`CASH`=CASH IN HAND, `SUN`=SUNDRY EXPENSES,
   `HR`=HIRING OF PLANT, `SER`=SERVICE). Since `account_codes.code` is globally unique, these get a
   `-D` suffix (`CASH-D`, `SUN-D`, `HR-D`, `SER-D` — all verified free).

## Known limitation to flag (out of scope)

All trade receivables post to a **single `TR` control account** (see
[sales-journal.js](src/routes/accounting/sales-journal.js) `debitAccount = "TR"` and
[payment-journal.js](src/routes/accounting/payment-journal.js) `creditAccount = 'TR'`). No journal
line ever posts to a `DEBTOR` child. So [bank-statement.js](src/routes/accounting/bank-statement.js)
(the generic account-ledger backend behind
[AccountLedgerPage.tsx](src/pages/Accounting/Reports/AccountLedgerPage.tsx)) will render an **empty
running ledger** for any `DEBTOR` child. This work makes every customer **appear** in the ledger's
account list (fixing the reported complaint) but does **not** populate a per-customer running
ledger — that would require a separate per-customer sub-ledger design and is a larger, separate
task. Per-customer receivable detail today comes from [debtors.js](src/routes/accounting/debtors.js)
(the debtor report / customer statement), which already reads `customers`/`invoices` directly and
therefore already includes all 56.

## Implementation

### 1. New shared helper — `src/routes/accounting/debtorSync.js`

Small module of client-scoped functions (all take a transaction `client`) so both the customer
routes and the backfill can reuse one code path. Model naming/idioms on the existing
`syncEInvoiceFields` helper already inside [customers.js](src/routes/catalogue/customers.js#L9).

- `resolveDebtorChildCode(client, customerId)` → returns the existing `DEBTOR` child code for a
  customer, checking `code = customerId` first, then `code = customerId + '-D'`; `null` if none.
- `computeDebtorCode(client, customerId)` → for a **new** child: return `customerId` if globally
  free, else `customerId + '-D'` (loop `-D2`, `-D3`… on the rare chance the suffix also collides).
- `ensureDebtorAccount(client, { id, name })` → upsert: if a child exists (via
  `resolveDebtorChildCode`) update its `description = name`; else `INSERT` a new child with
  `computeDebtorCode`, `ledger_type='TD'`, `parent_code='DEBTOR'`, `level=2`,
  `sort_order = (MAX(sort_order) over DEBTOR children) + 1`, `is_active=true`, `is_system=false`.
- `changeDebtorCode(client, oldId, newId, name)` → for a customer **ID change**: find the child by
  `resolveDebtorChildCode(oldId)`, then update its `code` (via `computeDebtorCode(newId)`) and
  `description`.
- `removeDebtorAccount(client, customerId)` → resolve the child and `DELETE` it (scoped to
  `parent_code='DEBTOR'`). Guard: if that code is referenced in `journal_entry_lines`, set
  `is_active=false` instead of deleting (defensive — currently none are referenced).

### 2. Wire into `src/routes/catalogue/customers.js`

- **POST `/` (create):** wrap the current single `pool.query` insert in a `client` transaction and
  call `ensureDebtorAccount(client, { id, name })` after the customer insert (mirrors how PUT/DELETE
  already use a transaction). Keep the existing `cache.invalidate(CACHE_KEYS.CUSTOMERS)`.
- **PUT `/:id` regular update:** after the existing `UPDATE customers …`, call
  `ensureDebtorAccount(client, { id, name })` (keeps `description` in sync on rename).
- **PUT `/:id` ID-change branch:** after moving `customer_products` / deleting the old row, call
  `changeDebtorCode(client, id, newId, name)`.
- **DELETE `/:id`:** call `removeDebtorAccount(client, id)` inside the existing transaction.

All four already run inside (or will run inside) a transaction, so customer + debtor-account changes
commit atomically.

### 3. One-time backfill — `dev/migrations/NNN_backfill_debtor_accounts.sql`

Idempotent insert for every customer lacking a `DEBTOR` child, applying the `-D` suffix on
collision and continuing `sort_order` after the current max:

```sql
INSERT INTO account_codes (code, description, ledger_type, parent_code, level, sort_order, is_active, is_system)
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM account_codes a WHERE a.code = c.id) THEN c.id || '-D' ELSE c.id END,
  c.name, 'TD', 'DEBTOR', 2,
  (SELECT COALESCE(MAX(sort_order),0) FROM account_codes WHERE parent_code='DEBTOR')
    + ROW_NUMBER() OVER (ORDER BY c.id),
  TRUE, FALSE
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM account_codes d WHERE d.parent_code='DEBTOR' AND d.code = c.id
);
```

Re-running is a no-op (the `NOT EXISTS` guard skips anyone already mapped). Expect **56 rows**
inserted (52 plain + 4 suffixed).

### 4. Docs & changelog

- **Changelog** ([ChangelogModal.tsx](src/components/ChangelogModal.tsx) `CHANGELOG_ENTRIES`,
  prepend, dated `2026-07-08`): new customers now automatically appear in the account ledger /
  Trade Debtors list, and previously-missing customers have been added. Include `ms` + `en`, no
  jargon.
- **CLAUDE.md / AGENTS.md** (per repo rule 13/14): add a one-line note on the `account_codes` schema
  entry that `DEBTOR` children are auto-maintained 1:1 from `customers` (code=id, desc=name, TD) via
  `debtorSync.js`, with `-D` suffix on code collisions.

## Critical files

- `src/routes/accounting/debtorSync.js` — **new** shared sync helper.
- [src/routes/catalogue/customers.js](src/routes/catalogue/customers.js) — wire sync into POST / PUT
  (both branches) / DELETE.
- `dev/migrations/NNN_backfill_debtor_accounts.sql` — **new** one-time backfill.
- [src/components/ChangelogModal.tsx](src/components/ChangelogModal.tsx) — changelog entry.
- CLAUDE.md + AGENTS.md — schema note.

Reference (no change needed): [account-codes.js](src/routes/accounting/account-codes.js) for the
`account_codes` insert shape/constraints; [debtors.js](src/routes/accounting/debtors.js) for the
existing invoice-based debtor detail.

## Verification

1. **Backfill:** run the migration against the dev DB, then confirm the counts reconcile:
   ```
   docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "
   SELECT
     (SELECT COUNT(*) FROM customers) AS customers,
     (SELECT COUNT(*) FROM account_codes WHERE parent_code='DEBTOR') AS children,
     (SELECT COUNT(*) FROM customers c WHERE NOT EXISTS
        (SELECT 1 FROM account_codes a WHERE a.parent_code='DEBTOR'
           AND a.code IN (c.id, c.id||'-D'))) AS unmapped;"
   ```
   Expect `unmapped = 0` and `children = customers`. Confirm `CASH-D`, `SUN-D`, `HR-D`, `SER-D`
   exist under `DEBTOR`.
2. **Create:** add a new customer via the UI (or `POST /api/customers`); confirm a matching `DEBTOR`
   child appears (and shows up in the AccountLedgerPage account picker).
3. **Rename:** change a customer's name; confirm the child's `description` updates.
4. **ID change:** change a customer's ID; confirm the child's `code` moves to the new ID (and gets
   `-D` only if the new ID collides).
5. **Delete:** delete a test customer; confirm its `DEBTOR` child is removed.
6. Re-run the migration; confirm it inserts 0 rows (idempotent).
