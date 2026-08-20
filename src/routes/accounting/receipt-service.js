// src/routes/accounting/receipt-service.js
// Atomic receipt service: one receipt header + itemized allocations owning one
// journal (docs/Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §4).
//
// Journal shapes:
//   Physical cash (payment_method 'cash'):
//     one DR holding line PER invoice allocation, each with its own visible
//     C{invoice} reference (legacy prints one holding-ledger row per invoice),
//     then CR TR per allocation. The holding account is chosen by DATE, not by
//     document type (see resolveCashHoldingAccount): CH_REV1 when the cash is
//     taken on the invoice's own sale day, CH_REV2 when it is collected later.
//     Cash stays in its holding account until an RV bank-in.
//   Direct bank / online / cleared cheque:
//     ONE aggregated DR bank line (visible Journal ref like TF040626-2,
//     Cheque ref like TF040626), then CR TR itemized per allocation.
//   Excess (overpayment): CR CUST_DEP, customer-owned, no extra debit.
//   Account allocation: CR the given debtor/GL account with a free-text
//     external reference (e.g. Jelly Polly debtor `JP`, ref 004697/JP).
//
// Pending cheques: header + allocations + pending compat payment rows are
// stored, but NO journal, balance, or credit_used change happens until
// confirmation, which posts on the actual clearance date.
//
// Compat: each invoice/excess allocation also writes a legacy `payments` row
// (the invoice payment-history projection). Those rows carry
// receipt_allocation_id, never their own journal, and are cancelled/confirmed
// only through the receipt lifecycle.

import { generateReceiptReference } from "./payment-journal.js";
import { determineBankAccount } from "../../utils/payment-helpers.js";
import { getCustomerDebtorAccountCode } from "./debtorSync.js";
import {
  assertTienHockAccountingDateUnlocked,
  toLocalAccountingDateString,
} from "./posting-lock.js";
import {
  IMPORTED_PAYMENT_EVIDENCE_NOT_FOUND_CODE,
  IMPORTED_PAYMENT_RECONCILIATION_MATCH_CODE,
  assertNoExactImportedAccountCredit,
  assertNoExactImportedDebitMovement,
  assertNoUnrepresentedImportedPaymentEvidence,
  previewImportedPaymentReconciliation,
} from "./imported-payment-reconciliation.js";
import { requireChequeClearanceDate } from "../utils/cheque-clearance-date.js";
import {
  syncSalesJournalEntry,
  invoiceLocalDateString,
} from "./sales-journal.js";
import { getCashSalesPools } from "./bank-in-service.js";
import { resolveCashHoldingAccount } from "./cash-holding-account.js";

const round2 = (v) => Math.round(parseFloat(v || 0) * 100) / 100;

/**
 * SQL for the money on an invoice already spoken for by uncleared cheques:
 * pending receipt allocations plus legacy standalone pending payment rows
 * (pending rows owned by a receipt are excluded via receipt_allocation_id so
 * the same money is never counted twice).
 *
 * Alias note: expects `invoices` aliased as `i`, like SETTLEABLE_AMOUNT_SQL.
 */
export const PENDING_SETTLEMENT_SQL = `
  COALESCE((
         SELECT SUM(ra.amount) FROM receipt_allocations ra
          JOIN receipts r ON r.id = ra.receipt_id
         WHERE ra.invoice_id = i.id
           AND ra.allocation_type = 'invoice'
           AND r.status = 'pending'
       ), 0)
  + COALESCE((
         SELECT SUM(p2.amount_paid) FROM payments p2
          WHERE p2.invoice_id = i.id
            AND p2.status = 'pending'
            AND p2.receipt_allocation_id IS NULL
            AND p2.is_auto_collection = false
       ), 0)`;

/**
 * SQL for the amount of an invoice a receipt may still settle.
 *
 * A credit INVOICE simply exposes its outstanding balance. A settled CASH bill
 * carries balance_due 0 because syncSalesJournalEntry auto-collects it into
 * CH_REV1, so what it can still take is that automatic collection: recording a
 * genuine bank/online receipt against a cash bill re-classifies part of the
 * counter cash as banked money (the CH_REV1 line shrinks by the same amount).
 *
 * The two are ADDED rather than switched between, because a cash bill is not
 * always in its settled state: while it is being created its balance is still
 * its full total and no auto-collection row exists yet, which is exactly when
 * the split-tender receipts are written.
 *
 * Money an uncleared cheque already covers is SUBTRACTED (M6): a pending
 * cheque does not reduce balance_due until it clears, so without this the same
 * amount could be paid a second time and the cheque confirmation would then
 * hard-fail, leaving a stuck pending receipt.
 */
export const SETTLEABLE_AMOUNT_SQL = `
  GREATEST(0,
    CASE WHEN i.paymenttype = 'CASH' THEN COALESCE(i.balance_due, 0) + COALESCE((
           SELECT SUM(p.amount_paid) FROM payments p
            WHERE p.invoice_id = i.id
              AND p.is_auto_collection = true
              AND (p.status IS NULL OR p.status = 'active')
         ), 0)
         ELSE COALESCE(i.balance_due, 0) END
    - (${PENDING_SETTLEMENT_SQL})
  )`;

/**
 * The settleable amount of already-locked invoice rows, keyed by invoice id.
 * `rows` must carry id, paymenttype and balance_due.
 *
 * Mirrors SETTLEABLE_AMOUNT_SQL (which cannot express an exclusion): money an
 * uncleared cheque already covers is subtracted, EXCLUDING the receipt being
 * confirmed/amended (`excludeReceiptIds`) so pending receipts never veto
 * themselves.
 * Returns { settleable, pending } maps so callers can explain a refusal.
 */
async function getSettleableAmounts(client, rows, excludeReceiptIds = []) {
  const map = {};
  const pending = {};
  const cashIds = [];
  const excludedReceiptIds = (
    Array.isArray(excludeReceiptIds) ? excludeReceiptIds : [excludeReceiptIds]
  ).filter((id) => Number.isInteger(id) && id > 0);
  for (const row of rows) {
    map[row.id] = round2(row.balance_due);
    if (row.paymenttype === "CASH") cashIds.push(row.id);
  }
  if (cashIds.length > 0) {
    const result = await client.query(
      `SELECT invoice_id, COALESCE(SUM(amount_paid), 0) AS auto_collected
         FROM payments
        WHERE invoice_id = ANY($1::varchar[])
          AND is_auto_collection = true
          AND (status IS NULL OR status = 'active')
        GROUP BY invoice_id`,
      [cashIds]
    );
    for (const row of result.rows) {
      map[row.invoice_id] = round2(
        (map[row.invoice_id] || 0) + parseFloat(row.auto_collected)
      );
    }
  }
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    const pendingResult = await client.query(
      `SELECT invoice_id, SUM(amount) AS pending_amount FROM (
         SELECT ra.invoice_id, ra.amount
           FROM receipt_allocations ra
           JOIN receipts r ON r.id = ra.receipt_id
          WHERE ra.allocation_type = 'invoice'
            AND ra.invoice_id = ANY($1::varchar[])
            AND r.status = 'pending'
            AND NOT (r.id = ANY($2::int[]))
         UNION ALL
         SELECT p.invoice_id, p.amount_paid
           FROM payments p
          WHERE p.invoice_id = ANY($1::varchar[])
            AND p.status = 'pending'
            AND p.receipt_allocation_id IS NULL
            AND p.is_auto_collection = false
       ) spoken_for
       GROUP BY invoice_id`,
      [ids, excludedReceiptIds]
    );
    for (const row of pendingResult.rows) {
      pending[row.invoice_id] = round2(row.pending_amount);
      map[row.invoice_id] = round2(
        Math.max(0, (map[row.invoice_id] || 0) - pending[row.invoice_id])
      );
    }
  }
  return { settleable: map, pending };
}

/**
 * Re-syncs the invoice-owned 'S' journal of every CASH bill a receipt touched,
 * then restores that bill's balance invariant.
 *
 * Genuine receipts shrink the automatic CH_REV1 collection (and cancelling one
 * restores it), so the sales journal must be rebuilt after any receipt
 * lifecycle event that changed what a cash bill has genuinely collected. A cash
 * bill then carries no balance at all, because the rebuilt collection absorbs
 * whatever the receipts do not cover — unless an uncleared cheque suppresses
 * auto-collection entirely, in which case the uncollected remainder stays due
 * until it clears (the same rule the invoice edit path applies).
 *
 * Must be called AFTER the compat payment rows reach their final status, since
 * that is what syncSalesJournalEntry measures.
 */
async function resyncCashBillSalesJournals(client, invoiceIds, userId) {
  const ids = [...new Set(invoiceIds)].filter(Boolean).sort();
  if (ids.length === 0) return;
  const result = await client.query(
    `SELECT * FROM invoices
      WHERE id = ANY($1::varchar[]) AND paymenttype = 'CASH'
        AND invoice_status <> 'cancelled'
      ORDER BY id
        FOR UPDATE`,
    [ids]
  );
  if (result.rows.length === 0) return;

  // Shrinking a day's CH_REV1 collection cannot take it below the cash already
  // banked in from that day's pool, or the RV would be over-banked. Lock the
  // affected pools first so a concurrent bank-in cannot slip in between the
  // rebuild and the check.
  const affectedDates = [
    ...new Set(
      result.rows.map((invoice) => invoiceLocalDateString(invoice.createddate))
    ),
  ].sort();
  for (const date of affectedDates) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('chrev1_pool_' || $1::text))`,
      [date]
    );
  }

  for (const invoice of result.rows) {
    await syncSalesJournalEntry(client, invoice, userId || null);

    const genuine = await client.query(
      `SELECT
          COALESCE(SUM(amount_paid) FILTER (WHERE status IS NULL OR status = 'active'), 0) AS paid,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending
         FROM payments
        WHERE invoice_id = $1
          AND is_auto_collection = false
          AND (status IS NULL OR status IN ('active', 'pending'))`,
      [invoice.id]
    );
    const balanceDue =
      parseInt(genuine.rows[0].pending, 10) > 0
        ? round2(
            Math.max(
              0,
              round2(invoice.totalamountpayable) - round2(genuine.rows[0].paid)
            )
          )
        : 0;
    await client.query(
      `UPDATE invoices SET balance_due = $1, invoice_status = $2 WHERE id = $3`,
      [balanceDue, balanceDue <= 0 ? "paid" : "Unpaid", invoice.id]
    );
  }

  const { pools } = await getCashSalesPools(client);
  const poolByDate = Object.fromEntries(pools.map((pool) => [pool.source_date, pool]));
  for (const date of affectedDates) {
    const pool = poolByDate[date];
    if (pool && pool.remaining < -0.005) {
      throw new Error(
        `Cash sales for ${date} have already been banked in. RM${Math.abs(pool.remaining).toFixed(2)} more was banked than this change leaves as counter cash — reverse that bank-in first.`
      );
    }
  }
}

/** Normalize a date input (yyyy-MM-dd string, ISO timestamp, unix ms, Date) to a LOCAL yyyy-MM-dd string. */
export function toLocalDateString(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const d =
    typeof value === "string" && /^\d+$/.test(value)
      ? new Date(Number(value))
      : new Date(value);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Guard both the receipt date and its accounting posting date when present.
 *
 * @param {object} receipt
 * @param {string} operation
 * @returns {void}
 */
function assertReceiptDatesUnlocked(receipt, operation) {
  assertTienHockAccountingDateUnlocked(
    receipt.received_date,
    `${operation} (receipt date)`
  );
  if (receipt.posting_date) {
    assertTienHockAccountingDateUnlocked(
      receipt.posting_date,
      `${operation} (posting date)`
    );
  }
}

async function ensureAccountsExist(client, codes) {
  const unique = [...new Set(codes)];
  const result = await client.query(
    `SELECT code FROM account_codes WHERE code = ANY($1::varchar[]) AND is_active = true`,
    [unique]
  );
  const found = result.rows.map((r) => r.code);
  const missing = unique.filter((c) => !found.includes(c));
  if (missing.length > 0) {
    throw new Error(`Required account codes not found or inactive: ${missing.join(", ")}`);
  }
}

/**
 * Validates and normalizes the allocations array.
 * Each: { type: 'invoice'|'excess'|'account', invoice_id?, customer_id?,
 *         target_account?, external_reference?, amount }
 */
function normalizeAllocations(allocations) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error("At least one allocation is required");
  }
  return allocations.map((a, i) => {
    const type = a.type || "invoice";
    const amount = round2(a.amount);
    if (!["invoice", "excess", "account"].includes(type)) {
      throw new Error(`Allocation ${i + 1}: unknown type "${a.type}"`);
    }
    if (!(amount > 0)) {
      throw new Error(`Allocation ${i + 1}: amount must be a positive number`);
    }
    if (type === "invoice" && !a.invoice_id) {
      throw new Error(`Allocation ${i + 1}: invoice_id is required`);
    }
    if (type === "excess" && !a.customer_id) {
      throw new Error(`Allocation ${i + 1}: customer_id is required for an excess allocation`);
    }
    if (type === "account" && !a.target_account) {
      throw new Error(`Allocation ${i + 1}: target_account is required for an account allocation`);
    }
    return {
      type,
      invoice_id:
        type === "invoice" && a.invoice_id ? String(a.invoice_id) : null,
      customer_id: a.customer_id ? String(a.customer_id) : null,
      target_account: a.target_account || null,
      external_reference: a.external_reference || null,
      amount,
    };
  });
}

/**
 * Normalizes a user-entered amendment amount without silently rounding away
 * extra decimal places.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function normalizeAmendmentAmount(value, label) {
  const amount =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(amount) || !(amount > 0)) {
    throw new Error(`${label}: amount must be a positive number`);
  }
  const cents = amount * 100;
  if (
    !Number.isSafeInteger(Math.round(cents)) ||
    Math.abs(cents - Math.round(cents)) > 0.000001
  ) {
    throw new Error(`${label}: amount must have no more than 2 decimal places`);
  }
  return Math.round(cents) / 100;
}

/** Builds the default receipt description from the allocation groups (customer IDs, not names). */
function defaultDescription(allocs) {
  const invoiceAllocs = allocs.filter((a) => a.type === "invoice");
  const groups = [];
  for (const a of invoiceAllocs) {
    const key = a.customer_id || "?";
    let g = groups.find((x) => x.customer === key);
    if (!g) {
      g = { customer: key, invoices: [] };
      groups.push(g);
    }
    g.invoices.push(a.invoice_id);
  }
  const parts = groups.map((g) => `${g.invoices.join("/")} - ${g.customer}`);
  if (parts.length === 0) {
    const acct = allocs.find((a) => a.type === "account");
    if (acct) return `INV/NO: ${acct.external_reference || ""} - ${acct.target_account}`;
    return "Receipt";
  }
  return `INV/NO: ${parts.join(" & ")}`;
}

/**
 * Locks and validates the allocated invoices inside the current transaction.
 * Returns a map invoice_id -> { balance_due, paymenttype, customerid, invoice_status }.
 */
async function lockInvoices(client, allocs, excludeReceiptIds = []) {
  const ids = [...new Set(allocs.filter((a) => a.type === "invoice").map((a) => a.invoice_id))].sort();
  const map = {};
  if (ids.length === 0) return map;
  const result = await client.query(
    `SELECT id, balance_due, paymenttype, customerid, invoice_status
       FROM invoices WHERE id = ANY($1::varchar[])
      ORDER BY id
      FOR UPDATE`,
    [ids]
  );
  for (const row of result.rows) map[row.id] = row;
  for (const id of ids) {
    if (!map[id]) throw new Error(`Invoice ${id} not found`);
    if (map[id].invoice_status === "cancelled") {
      throw new Error(`Invoice ${id} is cancelled and cannot receive payments`);
    }
  }
  // Per-invoice over-settlement check (sum of this receipt's allocations per
  // invoice), measured against the settleable amount: the outstanding balance
  // for a credit invoice, the automatic CH_REV1 collection for a cash bill —
  // both net of money an uncleared cheque already covers.
  const { settleable, pending } = await getSettleableAmounts(
    client,
    result.rows,
    excludeReceiptIds
  );
  for (const id of ids) map[id].settleable_amount = settleable[id] || 0;
  const perInvoice = {};
  for (const a of allocs) {
    if (a.type !== "invoice") continue;
    perInvoice[a.invoice_id] = round2((perInvoice[a.invoice_id] || 0) + a.amount);
  }
  for (const [id, amt] of Object.entries(perInvoice)) {
    const limit = round2(map[id].settleable_amount);
    if (amt > limit + 0.005) {
      const pendingNote =
        round2(pending[id] || 0) > 0
          ? ` RM${round2(pending[id]).toFixed(2)} is already covered by an uncleared cheque — confirm or cancel that cheque first.`
          : "";
      throw new Error(
        map[id].paymenttype === "CASH"
          ? `Cash bill ${id}: allocation ${amt.toFixed(2)} exceeds the ${limit.toFixed(2)} still recorded as counter cash.${pendingNote} A cash bill can only re-classify money it has already collected.`
          : `Invoice ${id}: allocation ${amt.toFixed(2)} exceeds the RM${limit.toFixed(2)} still settleable.${pendingNote} Record any genuine excess as an overpayment allocation instead.`
      );
    }
  }
  return map;
}

/**
 * Posts the journal for a receipt and applies invoice balance / customer
 * credit effects. Assumes invoices and the receipt date are already validated;
 * the accounting posting date is guarded again at the mutation boundary.
 */
async function postReceiptJournal(client, receipt, allocs, invoiceMap, userId) {
  assertTienHockAccountingDateUnlocked(
    receipt.posting_date,
    `Receipt ${receipt.id} (posting date)`
  );
  const isCash = receipt.payment_method === "cash";
  const debitAccount = receipt.debit_account;
  const total = round2(allocs.reduce((s, a) => s + a.amount, 0));

  // Phase 6: each invoice allocation credits the CUSTOMER's debtor child.
  const debtorByAlloc = {};
  for (const a of allocs) {
    if (a.type !== "invoice") continue;
    const cust = a.customer_id || invoiceMap[a.invoice_id]?.customerid || null;
    debtorByAlloc[a.allocation_id ?? `${a.invoice_id}:${a.amount}`] =
      await getCustomerDebtorAccountCode(client, cust);
  }
  const debtorFor = (a) =>
    debtorByAlloc[a.allocation_id ?? `${a.invoice_id}:${a.amount}`] || "TR";

  const accounts = [debitAccount, ...Object.values(debtorByAlloc)];
  if (allocs.some((a) => a.type === "excess")) accounts.push("CUST_DEP");
  for (const a of allocs) if (a.type === "account") accounts.push(a.target_account);
  await ensureAccountsExist(client, accounts);

  const reference_no = await generateReceiptReference(client, receipt.posting_date);

  const lineParticulars = (a) => {
    if (a.type === "invoice") {
      const cust = a.customer_id || invoiceMap[a.invoice_id]?.customerid || "";
      return `INV/NO: ${a.invoice_id}${cust ? ` - ${cust}` : ""}`;
    }
    if (a.type === "excess") return `Overpayment held for ${a.customer_id}`;
    return `INV/NO: ${a.external_reference || ""} - ${a.target_account}`;
  };
  const cashLineRef = (a) => (a.type === "invoice" ? `C${a.invoice_id}` : null);

  // ----- Build lines: debits first, then credits -----
  // [account, debit, credit, display_reference, cheque_reference, particulars]
  const lines = [];
  if (isCash) {
    for (const a of allocs) {
      lines.push([debitAccount, a.amount, 0, cashLineRef(a), null, lineParticulars(a)]);
    }
  } else {
    lines.push([debitAccount, total, 0, null, receipt.cheque_reference || null, receipt.description]);
  }
  for (const a of allocs) {
    const creditAccount =
      a.type === "invoice" ? debtorFor(a) : a.type === "excess" ? "CUST_DEP" : a.target_account;
    lines.push([creditAccount, 0, a.amount, isCash ? cashLineRef(a) : null, null, lineParticulars(a)]);
  }

  const entryResult = await client.query(
    `INSERT INTO journal_entries (
       reference_no, entry_type, entry_date, description,
       total_debit, total_credit, status, display_reference,
       source_type, source_id, created_at, created_by
     ) VALUES ($1, 'REC', $2, $3, $4, $4, 'posted', $5, 'receipt', $6, NOW(), $7)
     RETURNING id`,
    [
      reference_no,
      receipt.posting_date,
      receipt.description,
      total,
      receipt.display_reference || null,
      String(receipt.id),
      userId || null,
    ]
  );
  const journalEntryId = entryResult.rows[0].id;

  for (let i = 0; i < lines.length; i++) {
    const [account, debit, credit, displayRef, chequeRef, particulars] = lines[i];
    await client.query(
      `INSERT INTO journal_entry_lines (
         journal_entry_id, line_number, account_code, debit_amount, credit_amount,
         reference, particulars, display_reference, cheque_reference, display_order, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [journalEntryId, i + 1, account, debit, credit, reference_no, particulars, displayRef, chequeRef, i + 1]
    );
  }

  // ----- Apply invoice balances + customer credit -----
  for (const a of allocs) {
    if (a.type !== "invoice") continue;
    const inv = invoiceMap[a.invoice_id];
    const newBalance = round2(Math.max(0, round2(inv.balance_due) - a.amount));
    inv.balance_due = newBalance;
    const newStatus =
      newBalance <= 0 ? "paid" : inv.invoice_status === "Overdue" ? "Overdue" : "Unpaid";
    inv.invoice_status = newStatus;
    await client.query(`UPDATE invoices SET balance_due = $1, invoice_status = $2 WHERE id = $3`, [
      newBalance,
      newStatus,
      a.invoice_id,
    ]);
    if (inv.paymenttype === "INVOICE") {
      await client.query(
        `UPDATE customers SET credit_used = GREATEST(0, COALESCE(credit_used, 0) - $1) WHERE id = $2`,
        [a.amount, inv.customerid]
      );
    }
  }

  await client.query(
    `UPDATE receipts SET journal_entry_id = $1, status = 'posted', posting_date = $2, updated_at = NOW(), updated_by = $3 WHERE id = $4`,
    [journalEntryId, receipt.posting_date, userId || null, receipt.id]
  );

  return journalEntryId;
}

/**
 * Creates a receipt atomically inside the caller's transaction.
 * Cheque receipts are stored as 'pending' (no journal / balance effect).
 *
 * @returns { receipt, allocations, payments } (payments = compat rows created)
 */
export async function createReceipt(client, payload, userId) {
  const method = payload.payment_method;
  if (!["cash", "cheque", "bank_transfer", "online"].includes(method || "")) {
    throw new Error("payment_method must be cash, cheque, bank_transfer, or online");
  }
  const allocs = normalizeAllocations(payload.allocations);
  const total = round2(allocs.reduce((s, a) => s + a.amount, 0));
  const receivedDate = toLocalDateString(payload.received_date);
  const isPending = method === "cheque" && payload.post_immediately !== true;
  let postingDate = null;
  if (!isPending) {
    postingDate =
      method === "cheque"
        ? requireChequeClearanceDate(payload.posting_date, receivedDate)
        : toLocalDateString(payload.posting_date || payload.received_date);
  }
  const debitAccount =
    method === "cash"
      ? await resolveCashHoldingAccount(client, allocs, receivedDate)
      : determineBankAccount(method, payload.bank_account);

  // Never post a second receipt when the same invoice/reference/amount is
  // already proven by the immutable legacy import. This preflight runs before
  // the period guard and for open-period dates too, so changing the entered
  // date cannot bypass the duplicate-ledger protection.
  const importedCandidateAllocations = allocs.filter(
    (allocation) => allocation.type === "invoice"
  );
  for (const importedCandidateAllocation of importedCandidateAllocations) {
    const importedCandidateReference =
      method === "cash"
        ? `C${importedCandidateAllocation.invoice_id}`
        : String(
            payload.display_reference || payload.payment_reference || ""
          ).trim();
    try {
      const candidate = await previewImportedPaymentReconciliation(client, {
        allocations: [
          {
            type: "invoice",
            invoice_id: importedCandidateAllocation.invoice_id,
            amount: importedCandidateAllocation.amount,
          },
        ],
        payment_reference: importedCandidateReference,
        received_date: receivedDate,
        payment_method: method,
        bank_account: payload.bank_account || null,
        notes: payload.notes || null,
      });
      const recordSeparately =
        allocs.length === 1
          ? ""
          : ` Record invoice ${candidate.invoice_id} by itself to review and confirm the imported match.`;
      const error = new Error(
        `Payment ${candidate.payment_reference} is already in the imported ledger on ${candidate.ledger_payment_date}. Confirm the match to clear invoice ${candidate.invoice_id} without creating another receipt or journal.${recordSeparately}`
      );
      error.status = 409;
      error.code = IMPORTED_PAYMENT_RECONCILIATION_MATCH_CODE;
      error.requires_confirmation = true;
      error.candidate = candidate;
      throw error;
    } catch (error) {
      if (error.code !== IMPORTED_PAYMENT_EVIDENCE_NOT_FOUND_CODE) {
        throw error;
      }
    }
  }

  const importedDebitReference =
    String(
      payload.display_reference || payload.payment_reference || ""
    ).trim() ||
    (method === "cash" && importedCandidateAllocations.length === 1
      ? `C${importedCandidateAllocations[0].invoice_id}`
      : "");
  for (const accountAllocation of allocs.filter(
    (allocation) => allocation.type === "account"
  )) {
    await assertNoExactImportedAccountCredit(
      client,
      accountAllocation.target_account,
      accountAllocation.amount,
      importedDebitReference
    );
  }
  if (method === "cash") {
    for (const allocation of allocs.filter(
      (candidate) => candidate.type !== "invoice"
    )) {
      await assertNoExactImportedDebitMovement(
        client,
        debitAccount,
        allocation.amount,
        importedDebitReference
      );
    }
  } else {
    await assertNoExactImportedDebitMovement(
      client,
      debitAccount,
      total,
      importedDebitReference
    );
  }

  // A posted-immediately cheque is the compatibility conversion of an
  // existing pending payment. Its received date is historical; only its new
  // clearance posting must be in an open accounting period.
  if (isPending || method !== "cheque") {
    assertTienHockAccountingDateUnlocked(receivedDate, "Receipt (receipt date)");
  }
  if (!isPending) {
    assertTienHockAccountingDateUnlocked(postingDate, "Receipt (posting date)");
  }

  // Lock invoice allocations before snapshotting their customer or inserting
  // any receipt rows. This also validates pending receipts against the same
  // invoice state used by immediately posted receipts.
  const invoiceMap = await lockInvoices(client, allocs);
  for (const a of allocs) {
    if (a.type === "invoice") {
      a.customer_id = invoiceMap[a.invoice_id]?.customerid || null;
    }
  }
  const invoiceIds = [
    ...new Set(allocs.filter((a) => a.type === "invoice").map((a) => a.invoice_id)),
  ].sort();

  // A cash bill's own collection already sits in CH_REV1. Only a non-cash
  // receipt says something new about it (that part of the money was banked
  // instead), and only an immediately posting one: a pending cheque would
  // suppress the whole automatic collection until it clears, which is the
  // credit-invoice workflow, not a counter sale.
  const cashBillIds = invoiceIds.filter((id) => invoiceMap[id]?.paymenttype === "CASH");
  if (cashBillIds.length > 0) {
    if (method === "cash") {
      throw Object.assign(
        new Error(
          `Cash bill ${cashBillIds[0]} already records its cash collection. Only a bank transfer, online payment or cleared cheque can be recorded against a cash bill.`
        ),
        { status: 400 }
      );
    }
    if (isPending) {
      throw Object.assign(
        new Error(
          `Cash bill ${cashBillIds[0]} cannot hold an uncleared cheque. Enter the cheque's bank clearance date to record it, or key the sale as a credit invoice instead.`
        ),
        { status: 400 }
      );
    }
  }

  const description = (payload.description || "").trim() || defaultDescription(allocs);
  const descriptionOverridden = Boolean((payload.description || "").trim());
  // The visible Journal No. Users normally key the real bank reference
  // (TF060826, PBB029289, ...), but it is optional, and `reference_no` is the
  // hidden internal REC-YYYYMM-NNNN id that must never surface — so when
  // nothing is keyed we derive a user-facing value from the invoices settled.
  // Cash keeps its legacy `C` prefix (C13414 = counter collection); a bank or
  // online receipt gets the bare invoice number, because a `C` there would
  // misread as cash taken at the counter.
  const displayReference =
    (payload.display_reference || payload.payment_reference || "").trim() ||
    (invoiceIds.length > 0
      ? `${method === "cash" ? "C" : ""}${invoiceIds.join("/")}`
      : null);

  // Insert as 'pending' first — the posted-needs-journal CHECK requires the
  // journal to exist before the status can become 'posted'
  // (postReceiptJournal flips status + posting_date atomically below).
  const receiptResult = await client.query(
    `INSERT INTO receipts (
       payment_method, debit_account, display_reference, cheque_reference,
       received_date, posting_date, status, origin, total_amount,
       description, description_overridden, notes, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, NULL, 'pending', 'erp', $6, $7, $8, $9, $10, $10)
     RETURNING *`,
    [
      method,
      debitAccount,
      displayReference,
      (payload.cheque_reference || "").trim() || null,
      receivedDate,
      total,
      description,
      descriptionOverridden,
      payload.notes || null,
      userId || null,
    ]
  );
  const receipt = receiptResult.rows[0];
  receipt.posting_date = postingDate;

  const allocationRows = [];
  for (let i = 0; i < allocs.length; i++) {
    const a = allocs[i];
    const allocResult = await client.query(
      `INSERT INTO receipt_allocations (
         receipt_id, line_number, allocation_type, invoice_id, customer_id,
         target_account, external_reference, amount
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [receipt.id, i + 1, a.type, a.invoice_id, a.customer_id, a.target_account, a.external_reference, a.amount]
    );
    allocationRows.push(allocResult.rows[0]);
    a.allocation_id = allocResult.rows[0].id;
  }

  // Compat payment-history rows (invoice + excess allocations only). An excess
  // row is attached to the receipt's first invoice for display compatibility.
  const paymentRows = [];
  for (const a of allocs) {
    if (a.type === "account") continue;
    const compatInvoiceId = a.invoice_id || invoiceIds[0] || null;
    if (!compatInvoiceId) continue; // excess with no invoice context: allocation row only
    const rowStatus = isPending ? "pending" : a.type === "excess" ? "overpaid" : "active";
    const rowRef =
      method === "cash" && a.type === "invoice" ? `C${a.invoice_id}` : displayReference;
    const payResult = await client.query(
      `INSERT INTO payments (
         invoice_id, payment_date, amount_paid, payment_method, payment_reference,
         bank_account, notes, status, is_auto_collection, receipt_allocation_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
       RETURNING *`,
      [
        compatInvoiceId,
        receivedDate,
        a.amount,
        method,
        rowRef || null,
        method === "cash" ? "CASH" : debitAccount,
        payload.notes || (a.type === "excess" ? "Overpaid amount" : null),
        rowStatus,
        a.allocation_id,
      ]
    );
    paymentRows.push(payResult.rows[0]);
  }

  if (!isPending) {
    await postReceiptJournal(client, receipt, allocs, invoiceMap, userId);
    // The genuine receipt now covers part of a cash bill, so its automatic
    // CH_REV1 collection must shrink by the same amount.
    await resyncCashBillSalesJournals(client, cashBillIds, userId);
  }

  const fresh = await client.query(`SELECT * FROM receipts WHERE id = $1`, [receipt.id]);
  return { receipt: fresh.rows[0], allocations: allocationRows, payments: paymentRows };
}

/**
 * Updates a receipt reference group without changing its accounting. Receipts
 * sharing the current reference/date/method/account are renamed together so a
 * visible Payment Management group never splits. Receipt rows, payment-history
 * projections, and posted journal headers stay in sync in one transaction.
 * Cash and imported opening receipts keep their fixed historical semantics.
 */
export async function updateReceiptReference(
  client,
  receiptId,
  expectedReference,
  reference,
  userId
) {
  const nextReference = String(reference || "").trim();
  if (!nextReference) {
    throw new Error("Payment reference is required");
  }
  if (nextReference.length > 100) {
    throw new Error("Payment reference must be 100 characters or fewer");
  }

  const receiptResult = await client.query(`SELECT * FROM receipts WHERE id = $1`, [
    receiptId,
  ]);
  if (receiptResult.rows.length === 0) {
    const error = new Error("Payment group not found");
    error.status = 404;
    throw error;
  }

  const receipt = receiptResult.rows[0];
  assertReceiptDatesUnlocked(receipt, `Payment group ${receiptId}`);
  if (receipt.status === "cancelled") {
    throw new Error("This payment group is cancelled and cannot be changed");
  }
  if (receipt.origin !== "erp") {
    throw new Error("Imported opening payment groups cannot be changed");
  }
  if (receipt.payment_method === "cash") {
    throw new Error(
      "Cash payment references are invoice-specific and cannot be changed"
    );
  }

  const normalizedExpectedReference =
    expectedReference === null || expectedReference === undefined
      ? null
      : String(expectedReference).trim();
  if (receipt.display_reference !== normalizedExpectedReference) {
    const error = new Error(
      "This payment group reference changed after you opened it. Reload and try again."
    );
    error.status = 409;
    error.code = "RECEIPT_REFERENCE_CHANGED";
    throw error;
  }

  const groupResult = await client.query(
    `SELECT id, journal_entry_id, received_date, posting_date
       FROM receipts
      WHERE display_reference IS NOT DISTINCT FROM $1
        AND received_date = $2
        AND payment_method = $3
        AND debit_account = $4
        AND origin = 'erp'
        AND status IN ('pending', 'posted')
      ORDER BY id
      FOR UPDATE`,
    [
      receipt.display_reference,
      receipt.received_date,
      receipt.payment_method,
      receipt.debit_account,
    ]
  );
  const receiptIds = groupResult.rows.map((row) => row.id);
  if (!receiptIds.includes(receiptId)) {
    const error = new Error(
      "This payment group reference changed after you opened it. Reload and try again."
    );
    error.status = 409;
    error.code = "RECEIPT_REFERENCE_CHANGED";
    throw error;
  }
  for (const groupReceipt of groupResult.rows) {
    assertReceiptDatesUnlocked(
      groupReceipt,
      `Payment group ${receipt.display_reference || receiptId}`
    );
  }

  if (receipt.display_reference === nextReference) {
    return {
      receipt,
      receipt_ids: receiptIds,
      updated_receipt_count: 0,
      updated_payment_count: 0,
    };
  }

  await client.query(
    `UPDATE receipts
        SET display_reference = $2, updated_at = NOW(), updated_by = $3
      WHERE id = ANY($1::int[])`,
    [receiptIds, nextReference, userId || null]
  );

  const paymentUpdate = await client.query(
    `UPDATE payments p
        SET payment_reference = $2
       FROM receipt_allocations ra
      WHERE p.receipt_allocation_id = ra.id
        AND ra.receipt_id = ANY($1::int[])`,
    [receiptIds, nextReference]
  );

  const journalEntryIds = groupResult.rows
    .map((row) => row.journal_entry_id)
    .filter((journalEntryId) => journalEntryId !== null);
  if (journalEntryIds.length > 0) {
    await client.query(
      `UPDATE journal_entries
          SET display_reference = $2, updated_at = NOW(), updated_by = $3
        WHERE id = ANY($1::int[])`,
      [journalEntryIds, nextReference, userId || null]
    );
  }

  const fresh = await client.query(`SELECT * FROM receipts WHERE id = $1`, [
    receiptId,
  ]);
  return {
    receipt: fresh.rows[0],
    receipt_ids: receiptIds,
    updated_receipt_count: receiptIds.length,
    updated_payment_count: paymentUpdate.rowCount,
  };
}

/**
 * Corrects a mis-keyed receipt date.
 *
 * Cheque receipts: only received_date moves (pure payment history). The ledger
 * stays untouched because a cheque posts on its separately captured clearance
 * date (posting_date), and a cheque cannot clear before it was received.
 *
 * Cash / bank transfer / online receipts: the received date IS the accounting
 * date, so the receipt's posting_date, the posted REC journal's entry_date and
 * every compat payment row move together in one transaction. For cash, the
 * holding account is re-resolved against the invoices' sale days:
 *   - moved ONTO a sale day: CH_REV2 -> CH_REV1 (joins that day's cash pool),
 *   - moved OFF a sale day:  CH_REV1 -> CH_REV2 (must leave enough unbanked
 *     cash in the old pool, so an already-banked pool is refused),
 *   - a CH_REV2 receipt already in a posted bank-in may only move to a date on
 *     or before the bank-in's posting date, so cash is never banked before it
 *     was received.
 *
 * Receipts sharing the current reference/date/method/account move together so a
 * visible Payment Management group never splits, and their payment-history
 * projections follow in the same transaction.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} receiptId
 * @param {string|null|undefined} expectedReceivedDate
 * @param {string} receivedDate
 * @param {string|null} userId
 * @returns {Promise<{receipt: object, receipt_ids: number[], received_date: string, updated_receipt_count: number, updated_payment_count: number}>}
 */
export async function updateReceiptDate(
  client,
  receiptId,
  expectedReceivedDate,
  receivedDate,
  userId
) {
  const rawNextDate = typeof receivedDate === "string" ? receivedDate.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawNextDate)) {
    const error = new Error(
      "Payment date must be a valid date in yyyy-MM-dd format."
    );
    error.status = 400;
    throw error;
  }
  const nextDate = toLocalAccountingDateString(rawNextDate);

  const receiptResult = await client.query(
    `SELECT * FROM receipts WHERE id = $1 FOR UPDATE`,
    [receiptId]
  );
  if (receiptResult.rows.length === 0) {
    const error = new Error("Payment group not found");
    error.status = 404;
    throw error;
  }

  const receipt = receiptResult.rows[0];
  if (receipt.status === "cancelled") {
    throw new Error("This payment group is cancelled and cannot be changed");
  }
  if (receipt.origin !== "erp") {
    throw new Error("Imported opening payment groups cannot be changed");
  }
  const isCheque = receipt.payment_method === "cheque";
  if (
    !["cash", "cheque", "bank_transfer", "online"].includes(
      receipt.payment_method
    )
  ) {
    throw new Error(
      `Payment method ${receipt.payment_method} cannot have its date corrected here`
    );
  }

  // Guard the stored dates and the new one, so a receipt can be moved neither
  // into nor out of the locked pre-cutover period.
  assertReceiptDatesUnlocked(receipt, `Payment group ${receiptId}`);
  assertTienHockAccountingDateUnlocked(
    nextDate,
    `Payment group ${receiptId} (new payment date)`
  );

  // No future-date guard: a post-dated cheque is legitimately received now and
  // dated later. Only the clearance date, checked per group member below, is
  // constrained — money cannot have cleared the bank in the future.
  const currentDate = toLocalDateString(receipt.received_date);
  const normalizedExpectedDate =
    expectedReceivedDate === null || expectedReceivedDate === undefined
      ? null
      : toLocalAccountingDateString(expectedReceivedDate);
  if (normalizedExpectedDate && normalizedExpectedDate !== currentDate) {
    const error = new Error(
      "This payment group changed after you opened it. Reload and try again."
    );
    error.status = 409;
    error.code = "RECEIPT_DATE_CHANGED";
    throw error;
  }

  const groupResult = await client.query(
    `SELECT id, journal_entry_id, received_date, posting_date,
            payment_method, debit_account, status, total_amount
       FROM receipts
      WHERE display_reference IS NOT DISTINCT FROM $1
        AND received_date = $2
        AND payment_method = $3
        AND debit_account = $4
        AND origin = 'erp'
        AND status IN ('pending', 'posted')
      ORDER BY id
      FOR UPDATE`,
    [
      receipt.display_reference,
      receipt.received_date,
      receipt.payment_method,
      receipt.debit_account,
    ]
  );
  const receiptIds = groupResult.rows.map((row) => row.id);
  if (!receiptIds.includes(receiptId)) {
    const error = new Error(
      "This payment group changed after you opened it. Reload and try again."
    );
    error.status = 409;
    error.code = "RECEIPT_DATE_CHANGED";
    throw error;
  }
  for (const groupReceipt of groupResult.rows) {
    assertReceiptDatesUnlocked(
      groupReceipt,
      `Payment group ${receipt.display_reference || receiptId}`
    );
    // A cheque cannot clear the bank before it was received.
    if (isCheque && groupReceipt.posting_date) {
      const clearanceDate = toLocalDateString(groupReceipt.posting_date);
      if (clearanceDate < nextDate) {
        const error = new Error(
          `This cheque cleared on ${clearanceDate}, before the new payment date (${nextDate}). Choose a payment date on or before the clearance date.`
        );
        error.status = 400;
        throw error;
      }
    }
  }

  if (currentDate === nextDate) {
    return {
      receipt,
      receipt_ids: receiptIds,
      received_date: nextDate,
      updated_receipt_count: 0,
      updated_payment_count: 0,
    };
  }

  // A hand-edited (manual_override) journal is detached: its source stops
  // rebuilding it. The journal rewrite below would silently re-date (and for
  // cash re-account) exactly such a journal, so refuse and let the user move
  // the journal by hand from the Journal page.
  if (!isCheque) {
    const journalIds = groupResult.rows
      .filter((row) => row.status === "posted" && row.journal_entry_id)
      .map((row) => row.journal_entry_id);
    if (journalIds.length > 0) {
      const detachedResult = await client.query(
        `SELECT id FROM journal_entries
          WHERE id = ANY($1::int[]) AND manual_override = TRUE`,
        [journalIds]
      );
      if (detachedResult.rows.length > 0) {
        const error = new Error(
          `Journal ${detachedResult.rows[0].id} for this payment group was manually edited and detached from the payment. Correct the journal's date from the Journal Entries page instead.`
        );
        error.status = 409;
        throw error;
      }
    }
  }

  // Load allocations once for cash holding-account resolution.
  const allocationsByReceipt = {};
  if (!isCheque) {
    const allocResult = await client.query(
      `SELECT receipt_id, allocation_type, invoice_id
         FROM receipt_allocations
        WHERE receipt_id = ANY($1::int[])
        ORDER BY receipt_id, line_number`,
      [receiptIds]
    );
    for (const row of allocResult.rows) {
      if (!allocationsByReceipt[row.receipt_id]) {
        allocationsByReceipt[row.receipt_id] = [];
      }
      allocationsByReceipt[row.receipt_id].push({
        type: row.allocation_type,
        invoice_id: row.invoice_id,
      });
    }
  }

  // Resolve the new holding account per cash receipt and run the bank-in /
  // cash-pool guards BEFORE anything is mutated.
  const newDebitAccountByReceipt = {};
  const poolDatesToLock = new Set();
  for (const groupReceipt of groupResult.rows) {
    if (groupReceipt.payment_method !== "cash") {
      newDebitAccountByReceipt[groupReceipt.id] = groupReceipt.debit_account;
      continue;
    }
    const oldAccount = groupReceipt.debit_account;
    const newAccount = await resolveCashHoldingAccount(
      client,
      allocationsByReceipt[groupReceipt.id] || [],
      nextDate
    );
    newDebitAccountByReceipt[groupReceipt.id] = newAccount;

    if (oldAccount === newAccount) {
      // CH_REV2 -> CH_REV2: cash already in a posted bank-in may only move
      // earlier (or stay), never after the money was banked.
      if (oldAccount === "CH_REV2") {
        const bankInResult = await client.query(
          `SELECT MIN(bi.posting_date)::text AS earliest_banked
             FROM bank_in_allocations bia
             JOIN bank_in_groups big ON big.id = bia.group_id
             JOIN bank_ins bi ON bi.id = big.bank_in_id
            WHERE bia.receipt_id = $1 AND bi.status = 'posted'`,
          [groupReceipt.id]
        );
        const earliestBanked = bankInResult.rows[0]?.earliest_banked || null;
        if (earliestBanked && nextDate > earliestBanked) {
          throw new Error(
            `This cash was banked in on ${earliestBanked}. Choose a date on or before ${earliestBanked}, or reverse the bank-in first.`
          );
        }
      }
      continue;
    }

    if (oldAccount === "CH_REV1" && newAccount === "CH_REV2") {
      // Leaving a same-day pool: serialize with RV bank-ins of that pool and
      // re-check below that enough unbanked cash remains.
      poolDatesToLock.add(currentDate);
    } else if (oldAccount === "CH_REV2" && newAccount === "CH_REV1") {
      // Joining a same-day pool: the cash must not already have been banked
      // as a CH_REV2 receipt.
      const bankInResult = await client.query(
        `SELECT 1
           FROM bank_in_allocations bia
           JOIN bank_in_groups big ON big.id = bia.group_id
           JOIN bank_ins bi ON bi.id = big.bank_in_id
          WHERE bia.receipt_id = $1 AND bi.status = 'posted'
          LIMIT 1`,
        [groupReceipt.id]
      );
      if (bankInResult.rows.length > 0) {
        throw new Error(
          `Payment group ${receipt.display_reference || receiptId} has already been included in a bank-in. Reverse that bank-in first.`
        );
      }
    }
  }

  for (const dateStr of poolDatesToLock) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('chrev1_pool_' || $1::text))`,
      [dateStr]
    );
  }
  if (poolDatesToLock.size > 0) {
    const { pools } = await getCashSalesPools(client);
    const poolMap = Object.fromEntries(
      pools.map((pool) => [pool.source_date, pool])
    );
    const leavingByDate = {};
    for (const groupReceipt of groupResult.rows) {
      if (
        groupReceipt.payment_method === "cash" &&
        groupReceipt.debit_account === "CH_REV1" &&
        newDebitAccountByReceipt[groupReceipt.id] === "CH_REV2"
      ) {
        leavingByDate[currentDate] = round2(
          (leavingByDate[currentDate] || 0) + round2(groupReceipt.total_amount)
        );
      }
    }
    for (const [dateStr, amount] of Object.entries(leavingByDate)) {
      const pool = poolMap[dateStr];
      const remaining = pool ? pool.remaining : 0;
      if (amount > remaining + 0.005) {
        throw new Error(
          `The cash-sales pool for ${dateStr} has already been banked in (unbanked remainder ${remaining.toFixed(2)}). Reverse that bank-in first or keep the payment on the sale day.`
        );
      }
    }
  }

  // Move the date. Amounts, references and statuses are untouched; for cash
  // the holding account and its journal lines follow the same-day rule.
  for (const groupReceipt of groupResult.rows) {
    const newAccount = newDebitAccountByReceipt[groupReceipt.id];
    const postingDate = isCheque ? groupReceipt.posting_date : nextDate;

    await client.query(
      `UPDATE receipts
          SET received_date = $2::date,
              posting_date = $3::date,
              debit_account = $4,
              updated_at = NOW(),
              updated_by = $5
        WHERE id = $1`,
      [groupReceipt.id, nextDate, postingDate, newAccount, userId || null]
    );

    if (
      !isCheque &&
      groupReceipt.status === "posted" &&
      groupReceipt.journal_entry_id
    ) {
      await client.query(
        `UPDATE journal_entries
            SET entry_date = $2::date, updated_at = NOW(), updated_by = $3
          WHERE id = $1 AND status = 'posted'`,
        [groupReceipt.journal_entry_id, nextDate, userId || null]
      );
      if (
        groupReceipt.payment_method === "cash" &&
        newAccount !== groupReceipt.debit_account
      ) {
        await client.query(
          `UPDATE journal_entry_lines
              SET account_code = $3
            WHERE journal_entry_id = $1
              AND account_code = $2
              AND debit_amount > 0`,
          [
            groupReceipt.journal_entry_id,
            groupReceipt.debit_account,
            newAccount,
          ]
        );
      }
    }
  }

  const paymentUpdate = await client.query(
    `UPDATE payments p
        SET payment_date = $2::date
       FROM receipt_allocations ra
      WHERE p.receipt_allocation_id = ra.id
        AND ra.receipt_id = ANY($1::int[])
        AND COALESCE(p.status, 'active') != 'cancelled'`,
    [receiptIds, nextDate]
  );

  const fresh = await client.query(`SELECT * FROM receipts WHERE id = $1`, [
    receiptId,
  ]);
  return {
    receipt: fresh.rows[0],
    receipt_ids: receiptIds,
    received_date: nextDate,
    updated_receipt_count: receiptIds.length,
    updated_payment_count: paymentUpdate.rowCount,
  };
}

/**
 * Amends every member of one still-pending cheque group atomically. Allocation
 * identities stay fixed; only their amounts and the group payment method may
 * change. Switching to bank transfer or online posts the corrected receipts on
 * their received date immediately. Cash is deliberately excluded because its
 * CH_REV1/CH_REV2 and bank-in lifecycle needs a separate workflow.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} receiptId
 * @param {{
 *   expected_reference?: unknown,
 *   expected_received_date?: unknown,
 *   expected_payment_method?: unknown,
 *   expected_debit_account?: unknown,
 *   payment_method?: unknown,
 *   allocations?: Array<{id?: unknown, expected_amount?: unknown, amount?: unknown}>
 * }} payload
 * @param {string|null} userId
 * @returns {Promise<{
 *   amended_receipt_count: number,
 *   amended_payment_count: number,
 *   posted_receipt_count: number,
 *   payment_group: object
 * }>}
 */
export async function amendPendingReceiptGroup(
  client,
  receiptId,
  payload,
  userId
) {
  const request = payload && typeof payload === "object" ? payload : {};
  const nextMethod = String(request.payment_method || "").trim();
  if (!["cheque", "bank_transfer", "online"].includes(nextMethod)) {
    throw new Error(
      "Payment method must be cheque, bank transfer, or online"
    );
  }
  if (!Array.isArray(request.allocations) || request.allocations.length === 0) {
    throw new Error("Every payment amount in this group is required");
  }

  const changedError = () => {
    const error = new Error(
      "This payment group changed after you opened it. Reload and try again."
    );
    error.status = 409;
    error.code = "PAYMENT_GROUP_CHANGED";
    return error;
  };

  const requestedByAllocationId = new Map();
  for (let index = 0; index < request.allocations.length; index += 1) {
    const candidate = request.allocations[index] || {};
    const allocationId = Number(candidate.id);
    if (!Number.isInteger(allocationId) || allocationId <= 0) {
      throw new Error(`Payment ${index + 1}: invalid allocation`);
    }
    if (requestedByAllocationId.has(allocationId)) {
      throw new Error(`Payment allocation ${allocationId} was included twice`);
    }
    requestedByAllocationId.set(allocationId, {
      expected_amount: normalizeAmendmentAmount(
        candidate.expected_amount,
        `Payment allocation ${allocationId}`
      ),
      amount: normalizeAmendmentAmount(
        candidate.amount,
        `Payment allocation ${allocationId}`
      ),
    });
  }

  const anchorResult = await client.query(
    `SELECT * FROM receipts WHERE id = $1 FOR UPDATE`,
    [receiptId]
  );
  if (anchorResult.rows.length === 0) {
    const error = new Error("Payment group not found");
    error.status = 404;
    throw error;
  }
  const anchor = anchorResult.rows[0];
  if (anchor.origin !== "erp") {
    throw new Error("Imported opening payment groups cannot be changed");
  }
  if (anchor.status !== "pending") {
    throw new Error("Only a fully pending payment group can be amended");
  }
  if (anchor.payment_method !== "cheque") {
    throw new Error("Only a pending cheque payment group can be amended");
  }
  if (
    String(request.expected_payment_method || "").trim() !==
    anchor.payment_method
  ) {
    throw changedError();
  }
  const expectedReference =
    request.expected_reference === null ||
    request.expected_reference === undefined
      ? null
      : String(request.expected_reference).trim();
  const expectedReceivedDate = String(
    request.expected_received_date || ""
  ).trim();
  const expectedDebitAccount = String(
    request.expected_debit_account || ""
  ).trim();
  if (
    expectedReference !== anchor.display_reference ||
    expectedReceivedDate !== toLocalDateString(anchor.received_date) ||
    expectedDebitAccount !== anchor.debit_account
  ) {
    throw changedError();
  }
  assertReceiptDatesUnlocked(anchor, `Payment group ${receiptId}`);

  const groupResult = await client.query(
    `SELECT *
       FROM receipts
      WHERE display_reference IS NOT DISTINCT FROM $1
        AND received_date = $2
        AND payment_method = $3
        AND debit_account = $4
        AND origin = 'erp'
        AND status IN ('pending', 'posted')
      ORDER BY id
      FOR UPDATE`,
    [
      anchor.display_reference,
      anchor.received_date,
      anchor.payment_method,
      anchor.debit_account,
    ]
  );
  const receiptIds = groupResult.rows.map((receipt) => receipt.id);
  if (!receiptIds.includes(receiptId)) throw changedError();
  if (
    groupResult.rows.some(
      (receipt) =>
        receipt.status !== "pending" || receipt.journal_entry_id !== null
    )
  ) {
    throw new Error(
      "This payment group has already been partly posted and can no longer be amended"
    );
  }
  for (const receipt of groupResult.rows) {
    assertReceiptDatesUnlocked(
      receipt,
      `Payment group ${anchor.display_reference || receiptId}`
    );
  }

  const allocationResult = await client.query(
    `SELECT *
       FROM receipt_allocations
      WHERE receipt_id = ANY($1::int[])
      ORDER BY receipt_id, line_number
      FOR UPDATE`,
    [receiptIds]
  );
  if (allocationResult.rows.length !== requestedByAllocationId.size) {
    throw changedError();
  }

  const amendedAllocations = [];
  for (const allocation of allocationResult.rows) {
    const requested = requestedByAllocationId.get(allocation.id);
    if (!requested) throw changedError();
    if (
      Math.abs(requested.expected_amount - round2(allocation.amount)) > 0.005
    ) {
      throw changedError();
    }
    if (
      round2(allocation.applied_amount) > 0 ||
      round2(allocation.refunded_amount) > 0
    ) {
      throw new Error(
        `Payment allocation ${allocation.id} has already been applied or refunded and cannot be amended`
      );
    }
    amendedAllocations.push({
      receipt_id: allocation.receipt_id,
      type: allocation.allocation_type,
      invoice_id: allocation.invoice_id,
      customer_id: allocation.customer_id,
      target_account: allocation.target_account,
      external_reference: allocation.external_reference,
      amount: requested.amount,
      allocation_id: allocation.id,
    });
  }

  const projectionCandidateIds = amendedAllocations
    .filter((allocation) => allocation.type !== "account")
    .map((allocation) => allocation.allocation_id)
    .sort((left, right) => left - right);
  const projectionResult = await client.query(
    `SELECT payment_id, receipt_allocation_id
       FROM payments
      WHERE receipt_allocation_id = ANY($1::int[])
        AND status = 'pending'
      ORDER BY receipt_allocation_id, payment_id
      FOR UPDATE`,
    [projectionCandidateIds]
  );
  const projectionByAllocationId = new Map();
  for (const payment of projectionResult.rows) {
    if (projectionByAllocationId.has(payment.receipt_allocation_id)) {
      throw new Error(
        "The payment-history records for this group changed. Reload and try again."
      );
    }
    projectionByAllocationId.set(payment.receipt_allocation_id, payment);
  }
  for (const allocation of amendedAllocations) {
    // Invoice allocations always have a payment-history projection. A pure
    // excess receipt can legitimately have none because there is no invoice to
    // attach that compatibility row to.
    if (
      allocation.type === "invoice" &&
      !projectionByAllocationId.has(allocation.allocation_id)
    ) {
      throw new Error(
        "The payment-history records for this group changed. Reload and try again."
      );
    }
  }

  // Exclude every member of the group being replaced, but retain all other
  // pending receipts in the settleable check. Active credit/debit notes are
  // already reflected in the locked invoices' current balance_due.
  const invoiceMap = await lockInvoices(
    client,
    amendedAllocations,
    receiptIds
  );
  const nextDebitAccount = anchor.debit_account;

  if (nextMethod !== "cheque") {
    // Changing the method must not silently merge this corrected group into a
    // separate live banking event that already has the target identity.
    const collisionResult = await client.query(
      `SELECT id
         FROM receipts
        WHERE display_reference IS NOT DISTINCT FROM $1
          AND received_date = $2
          AND payment_method = $3
          AND debit_account = $4
          AND origin = 'erp'
          AND status IN ('pending', 'posted')
          AND NOT (id = ANY($5::int[]))
        LIMIT 1
        FOR UPDATE`,
      [
        anchor.display_reference,
        anchor.received_date,
        nextMethod,
        nextDebitAccount,
        receiptIds,
      ]
    );
    if (collisionResult.rows.length > 0) {
      const error = new Error(
        "Another live payment group already uses this reference, date, method, and bank account"
      );
      error.status = 409;
      error.code = "PAYMENT_GROUP_TARGET_EXISTS";
      throw error;
    }

    for (const receipt of groupResult.rows) {
      const receiptAllocations = amendedAllocations.filter(
        (allocation) => allocation.receipt_id === receipt.id
      );
      for (const allocation of receiptAllocations.filter(
        (candidate) => candidate.type === "invoice"
      )) {
        await assertNoUnrepresentedImportedPaymentEvidence(
          client,
          {
            allocations: [
              {
                type: "invoice",
                invoice_id: allocation.invoice_id,
                amount: allocation.amount,
              },
            ],
            payment_reference: String(receipt.display_reference || "").trim(),
            received_date: receipt.received_date,
            payment_method: nextMethod,
            bank_account: nextDebitAccount,
          },
          `Payment group ${anchor.display_reference || receiptId} amendment`
        );
      }
      for (const allocation of receiptAllocations.filter(
        (candidate) => candidate.type === "account"
      )) {
        await assertNoExactImportedAccountCredit(
          client,
          allocation.target_account,
          allocation.amount,
          receipt.display_reference
        );
      }
      await assertNoExactImportedDebitMovement(
        client,
        nextDebitAccount,
        round2(
          receiptAllocations.reduce(
            (total, allocation) => total + allocation.amount,
            0
          )
        ),
        receipt.display_reference
      );
    }
  }

  const totalByReceiptId = new Map();
  for (const allocation of amendedAllocations) {
    totalByReceiptId.set(
      allocation.receipt_id,
      round2(
        (totalByReceiptId.get(allocation.receipt_id) || 0) + allocation.amount
      )
    );
  }
  if (groupResult.rows.some((receipt) => !totalByReceiptId.has(receipt.id))) {
    throw changedError();
  }
  for (const allocation of amendedAllocations) {
    await client.query(
      `UPDATE receipt_allocations SET amount = $2 WHERE id = $1`,
      [allocation.allocation_id, allocation.amount]
    );
  }

  for (const receipt of groupResult.rows) {
    const postingDate =
      nextMethod === "cheque"
        ? null
        : toLocalAccountingDateString(receipt.received_date);
    await client.query(
      `UPDATE receipts
          SET payment_method = $2::varchar,
              debit_account = $3,
              total_amount = $4,
              cheque_reference = CASE WHEN $2::varchar = 'cheque' THEN cheque_reference ELSE NULL END,
              posting_date = NULL,
              updated_at = NOW(),
              updated_by = $5
        WHERE id = $1`,
      [
        receipt.id,
        nextMethod,
        nextDebitAccount,
        totalByReceiptId.get(receipt.id),
        userId || null,
      ]
    );
    receipt.payment_method = nextMethod;
    receipt.debit_account = nextDebitAccount;
    receipt.total_amount = totalByReceiptId.get(receipt.id);
    receipt.cheque_reference = nextMethod === "cheque" ? receipt.cheque_reference : null;
    receipt.posting_date = postingDate;
  }

  let amendedPaymentCount = 0;
  for (const allocation of amendedAllocations.filter(
    (candidate) => projectionByAllocationId.has(candidate.allocation_id)
  )) {
    const paymentUpdate = await client.query(
      `UPDATE payments
          SET amount_paid = $2,
              payment_method = $3,
              bank_account = $4
        WHERE receipt_allocation_id = $1
          AND status = 'pending'`,
      [
        allocation.allocation_id,
        allocation.amount,
        nextMethod,
        nextDebitAccount,
      ]
    );
    if (paymentUpdate.rowCount !== 1) throw changedError();
    amendedPaymentCount += paymentUpdate.rowCount;
  }

  let postedReceiptCount = 0;
  if (nextMethod !== "cheque") {
    for (const receipt of groupResult.rows) {
      const receiptAllocations = amendedAllocations.filter(
        (allocation) => allocation.receipt_id === receipt.id
      );
      await postReceiptJournal(
        client,
        receipt,
        receiptAllocations,
        invoiceMap,
        userId
      );
      await client.query(
        `UPDATE payments
            SET status = CASE
                  WHEN receipt_alloc.allocation_type = 'excess' THEN 'overpaid'
                  ELSE 'active'
                END
           FROM receipt_allocations receipt_alloc
          WHERE payments.receipt_allocation_id = receipt_alloc.id
            AND receipt_alloc.receipt_id = $1
            AND payments.status = 'pending'`,
        [receipt.id]
      );
      postedReceiptCount += 1;
    }

    await resyncCashBillSalesJournals(
      client,
      Object.values(invoiceMap)
        .filter((invoice) => invoice.paymenttype === "CASH")
        .map((invoice) => invoice.id),
      userId
    );
  }

  return {
    amended_receipt_count: receiptIds.length,
    amended_payment_count: amendedPaymentCount,
    posted_receipt_count: postedReceiptCount,
    payment_group: await getReceiptGroup(client, receiptId),
  };
}

/**
 * Loads the user-visible payment group that contains a receipt. Live groups
 * include pending and posted members; a cancelled anchor loads the matching
 * cancelled history instead.
 */
export async function getReceiptGroup(client, receiptId) {
  const anchorResult = await client.query(
    `SELECT * FROM receipts WHERE id = $1`,
    [receiptId]
  );
  if (anchorResult.rows.length === 0) {
    const error = new Error("Payment group not found");
    error.status = 404;
    throw error;
  }

  const anchor = anchorResult.rows[0];
  const groupStatuses =
    anchor.status === "cancelled" ? ["cancelled"] : ["pending", "posted"];
  const receiptResult = await client.query(
    `SELECT r.*, je.reference_no AS journal_reference_no
       FROM receipts r
       LEFT JOIN journal_entries je ON je.id = r.journal_entry_id
      WHERE r.display_reference IS NOT DISTINCT FROM $1
        AND r.received_date = $2
        AND r.payment_method = $3
        AND r.debit_account = $4
        AND r.origin = $5
        AND r.status = ANY($6::varchar[])
      ORDER BY r.id`,
    [
      anchor.display_reference,
      anchor.received_date,
      anchor.payment_method,
      anchor.debit_account,
      anchor.origin,
      groupStatuses,
    ]
  );
  const receiptIds = receiptResult.rows.map((receipt) => receipt.id);
  if (receiptIds.length === 0) {
    const error = new Error("Payment group not found");
    error.status = 404;
    throw error;
  }

  const allocationResult = await client.query(
    `SELECT ra.id, ra.line_number, ra.allocation_type, ra.invoice_id,
            ra.customer_id, ra.target_account, ra.external_reference,
            ra.amount, ra.applied_amount, ra.refunded_amount
       FROM receipt_allocations ra
      WHERE ra.receipt_id = ANY($1::int[])
      ORDER BY ra.receipt_id, ra.line_number`,
    [receiptIds]
  );
  const statuses = [
    ...new Set(receiptResult.rows.map((receipt) => receipt.status)),
  ];
  const chequeReferences = [
    ...new Set(
      receiptResult.rows
        .map((receipt) => receipt.cheque_reference)
        .filter((reference) => Boolean(reference))
    ),
  ];
  const cancellationReasons = [
    ...new Set(
      receiptResult.rows
        .map((receipt) => receipt.cancellation_reason)
        .filter((reason) => Boolean(reason))
    ),
  ];

  return {
    display_reference: anchor.display_reference,
    payment_method: anchor.payment_method,
    debit_account: anchor.debit_account,
    received_date: anchor.received_date,
    status: statuses.length === 1 ? statuses[0] : "mixed",
    origin: anchor.origin,
    total_amount: round2(
      receiptResult.rows.reduce(
        (total, receipt) => total + parseFloat(receipt.total_amount || 0),
        0
      )
    ),
    cheque_references: chequeReferences,
    cancellation_reasons: cancellationReasons,
    journals: receiptResult.rows
      .filter((receipt) => receipt.journal_entry_id !== null)
      .map((receipt) => ({
        id: receipt.journal_entry_id,
        reference_no: receipt.journal_reference_no,
      })),
    allocations: allocationResult.rows,
  };
}

/**
 * Confirms every pending receipt behind one visible payment group atomically.
 * Posted members are left unchanged so partly confirmed groups can safely
 * finish the remaining payments in one action.
 */
export async function confirmReceiptGroup(
  client,
  receiptId,
  options,
  userId
) {
  const anchorResult = await client.query(
    `SELECT * FROM receipts WHERE id = $1`,
    [receiptId]
  );
  if (anchorResult.rows.length === 0) {
    const error = new Error("Payment group not found");
    error.status = 404;
    throw error;
  }

  const anchor = anchorResult.rows[0];
  const groupLabel = anchor.display_reference || "this payment";
  if (anchor.status === "cancelled") {
    throw new Error(`Payment group ${groupLabel} is cancelled and cannot be confirmed`);
  }
  if (anchor.origin !== "erp") {
    throw new Error("Imported opening payment groups cannot be confirmed");
  }

  const groupResult = await client.query(
    `SELECT id, status
       FROM receipts
      WHERE display_reference IS NOT DISTINCT FROM $1
        AND received_date = $2
        AND payment_method = $3
        AND debit_account = $4
        AND origin = 'erp'
        AND status IN ('pending', 'posted')
      ORDER BY id
      FOR UPDATE`,
    [
      anchor.display_reference,
      anchor.received_date,
      anchor.payment_method,
      anchor.debit_account,
    ]
  );
  const receiptIds = groupResult.rows.map((receipt) => receipt.id);
  if (!receiptIds.includes(receiptId)) {
    const error = new Error(
      "This payment group changed after you opened it. Reload and try again."
    );
    error.status = 409;
    throw error;
  }

  const pendingReceiptIds = groupResult.rows
    .filter((receipt) => receipt.status === "pending")
    .map((receipt) => receipt.id);
  if (pendingReceiptIds.length === 0) {
    throw new Error(`Payment group ${groupLabel} has already been confirmed`);
  }

  const pendingPaymentResult = await client.query(
    `SELECT COUNT(*)::integer AS count
       FROM payments p
       JOIN receipt_allocations ra ON ra.id = p.receipt_allocation_id
      WHERE ra.receipt_id = ANY($1::int[])
        AND p.status = 'pending'`,
    [pendingReceiptIds]
  );

  for (const pendingReceiptId of pendingReceiptIds) {
    await confirmReceipt(client, pendingReceiptId, options || {}, userId);
  }

  return {
    confirmed_receipt_count: pendingReceiptIds.length,
    confirmed_payment_count: pendingPaymentResult.rows[0]?.count || 0,
    payment_group: await getReceiptGroup(client, receiptId),
  };
}

/**
 * Cancels every live receipt behind one visible payment group atomically.
 */
export async function cancelReceiptGroup(client, receiptId, reason, userId) {
  const anchorResult = await client.query(
    `SELECT * FROM receipts WHERE id = $1`,
    [receiptId]
  );
  if (anchorResult.rows.length === 0) {
    const error = new Error("Payment group not found");
    error.status = 404;
    throw error;
  }

  const anchor = anchorResult.rows[0];
  assertReceiptDatesUnlocked(anchor, `Payment group ${receiptId}`);
  const groupLabel = anchor.display_reference || "this payment";
  if (anchor.status === "cancelled") {
    throw new Error(`Payment group ${groupLabel} is already cancelled`);
  }
  if (anchor.origin !== "erp") {
    throw new Error("Imported opening payment groups cannot be cancelled");
  }

  const groupResult = await client.query(
    `SELECT id
       FROM receipts
      WHERE display_reference IS NOT DISTINCT FROM $1
        AND received_date = $2
        AND payment_method = $3
        AND debit_account = $4
        AND origin = 'erp'
        AND status IN ('pending', 'posted')
      ORDER BY id
      FOR UPDATE`,
    [
      anchor.display_reference,
      anchor.received_date,
      anchor.payment_method,
      anchor.debit_account,
    ]
  );
  const receiptIds = groupResult.rows.map((receipt) => receipt.id);
  if (!receiptIds.includes(receiptId)) {
    const error = new Error(
      "This payment group changed after you opened it. Reload and try again."
    );
    error.status = 409;
    throw error;
  }

  const bankInCheck = await client.query(
    `SELECT 1
       FROM bank_in_allocations bia
       JOIN bank_in_groups big ON big.id = bia.group_id
       JOIN bank_ins bi ON bi.id = big.bank_in_id
      WHERE bia.receipt_id = ANY($1::int[]) AND bi.status = 'posted'
      LIMIT 1`,
    [receiptIds]
  );
  if (bankInCheck.rows.length > 0) {
    throw new Error(
      `Payment group ${groupLabel} has already been included in a bank-in. Reverse that bank-in first.`
    );
  }

  const adjustmentCheck = await client.query(
    `SELECT ad.id, ad.original_invoice_id
       FROM adjustment_documents ad
      WHERE ad.original_invoice_id IN (
              SELECT invoice_id
                FROM receipt_allocations
               WHERE receipt_id = ANY($1::int[]) AND invoice_id IS NOT NULL)
        AND ad.status = 'active'
        AND COALESCE(ad.is_consolidated, false) = false
      LIMIT 1`,
    [receiptIds]
  );
  if (adjustmentCheck.rows.length > 0) {
    throw new Error(
      `Payment group ${groupLabel} includes invoice ${adjustmentCheck.rows[0].original_invoice_id}, which has active adjustment document ${adjustmentCheck.rows[0].id}. Cancel the adjustment document first.`
    );
  }

  const excessCheck = await client.query(
    `SELECT 1
       FROM receipt_allocations
      WHERE receipt_id = ANY($1::int[])
        AND allocation_type = 'excess'
        AND (COALESCE(applied_amount, 0) > 0 OR COALESCE(refunded_amount, 0) > 0)
      LIMIT 1`,
    [receiptIds]
  );
  if (excessCheck.rows.length > 0) {
    throw new Error(
      `Payment group ${groupLabel} includes an overpayment excess that has already been applied to invoices or refunded. Reverse those applications/refunds before cancelling this payment.`
    );
  }

  const cancellationReason =
    reason || `Payment group ${groupLabel} cancelled`;
  for (const memberReceiptId of receiptIds) {
    await cancelReceipt(client, memberReceiptId, cancellationReason, userId);
  }

  return {
    display_reference: anchor.display_reference,
    status: "cancelled",
  };
}

/**
 * Confirms a pending (cheque) receipt: posts the journal on the clearance date
 * and applies balances. Re-validates allocations against CURRENT balances.
 */
export async function confirmReceipt(client, receiptId, options, userId) {
  const receiptResult = await client.query(
    `SELECT * FROM receipts WHERE id = $1 FOR UPDATE`,
    [receiptId]
  );
  if (receiptResult.rows.length === 0) throw new Error("Payment group not found");
  const receipt = receiptResult.rows[0];
  if (receipt.status !== "pending") {
    throw new Error(`This payment is ${receipt.status}, not pending`);
  }

  const postingDate = requireChequeClearanceDate(
    options && options.posting_date,
    receipt.received_date
  );
  assertTienHockAccountingDateUnlocked(
    postingDate,
    `Receipt ${receiptId} (cheque clearance date)`
  );

  const allocResult = await client.query(
    `SELECT * FROM receipt_allocations WHERE receipt_id = $1 ORDER BY line_number`,
    [receiptId]
  );
  const allocs = allocResult.rows.map((r) => ({
    type: r.allocation_type,
    invoice_id: r.invoice_id,
    customer_id: r.customer_id,
    target_account: r.target_account,
    external_reference: r.external_reference,
    amount: round2(r.amount),
    allocation_id: r.id,
  }));

  for (const allocation of allocs.filter(
    (candidate) => candidate.type === "invoice"
  )) {
    await assertNoUnrepresentedImportedPaymentEvidence(
      client,
      {
        allocations: [
          {
            type: "invoice",
            invoice_id: allocation.invoice_id,
            amount: allocation.amount,
          },
        ],
        payment_reference: String(receipt.display_reference || "").trim(),
        received_date: receipt.received_date,
        payment_method: receipt.payment_method,
        bank_account: receipt.debit_account,
      },
      `Cheque receipt ${receiptId} confirmation`
    );
  }
  for (const allocation of allocs.filter(
    (candidate) => candidate.type === "account"
  )) {
    await assertNoExactImportedAccountCredit(
      client,
      allocation.target_account,
      allocation.amount,
      receipt.display_reference
    );
  }
  if (receipt.payment_method === "cash") {
    for (const allocation of allocs.filter(
      (candidate) => candidate.type !== "invoice"
    )) {
      await assertNoExactImportedDebitMovement(
        client,
        receipt.debit_account,
        allocation.amount,
        receipt.display_reference
      );
    }
  } else {
    await assertNoExactImportedDebitMovement(
      client,
      receipt.debit_account,
      round2(allocs.reduce((sum, allocation) => sum + allocation.amount, 0)),
      receipt.display_reference
    );
  }

  receipt.posting_date = postingDate;
  if (options && options.cheque_reference) {
    await client.query(`UPDATE receipts SET cheque_reference = $1 WHERE id = $2`, [
      options.cheque_reference,
      receiptId,
    ]);
    receipt.cheque_reference = options.cheque_reference;
  }

  // The pending receipt being confirmed must not veto itself: its own
  // allocations are excluded from the pending-settlement netting.
  const invoiceMap = await lockInvoices(client, allocs, receiptId);
  const journalEntryId = await postReceiptJournal(client, receipt, allocs, invoiceMap, userId);

  await client.query(
    `UPDATE payments SET status = CASE WHEN p_alloc.allocation_type = 'excess' THEN 'overpaid' ELSE 'active' END
       FROM receipt_allocations p_alloc
      WHERE payments.receipt_allocation_id = p_alloc.id
        AND p_alloc.receipt_id = $1
        AND payments.status = 'pending'`,
    [receiptId]
  );

  await resyncCashBillSalesJournals(
    client,
    Object.values(invoiceMap)
      .filter((invoice) => invoice.paymenttype === "CASH")
      .map((invoice) => invoice.id),
    userId
  );

  const fresh = await client.query(`SELECT * FROM receipts WHERE id = $1`, [receiptId]);
  return { receipt: fresh.rows[0], journal_entry_id: journalEntryId };
}

/**
 * Cancels a receipt: reverses invoice balances / customer credit, cancels the
 * journal, and cancels the compat payment rows. Blocked while a posted RV
 * bank-in still allocates this receipt's cash.
 */
export async function cancelReceipt(client, receiptId, reason, userId) {
  const receiptResult = await client.query(
    `SELECT * FROM receipts WHERE id = $1 FOR UPDATE`,
    [receiptId]
  );
  if (receiptResult.rows.length === 0) throw new Error("Payment group not found");
  const receipt = receiptResult.rows[0];
  assertReceiptDatesUnlocked(receipt, `Receipt ${receiptId}`);
  if (receipt.status === "cancelled") {
    throw new Error("This payment is already cancelled");
  }

  const bankInCheck = await client.query(
    `SELECT bi.id
       FROM bank_in_allocations bia
       JOIN bank_in_groups big ON big.id = bia.group_id
       JOIN bank_ins bi ON bi.id = big.bank_in_id
      WHERE bia.receipt_id = $1 AND bi.status = 'posted'
      LIMIT 1`,
    [receiptId]
  );
  if (bankInCheck.rows.length > 0) {
    throw new Error(
      `This payment has been included in bank-in #${bankInCheck.rows[0].id}. Reverse that bank-in first.`
    );
  }

  const adjCheck = await client.query(
    `SELECT ad.id, ad.original_invoice_id
       FROM adjustment_documents ad
      WHERE ad.original_invoice_id IN (
              SELECT invoice_id FROM receipt_allocations
               WHERE receipt_id = $1 AND invoice_id IS NOT NULL)
        AND ad.status = 'active'
        AND COALESCE(ad.is_consolidated, false) = false
      LIMIT 1`,
    [receiptId]
  );
  if (adjCheck.rows.length > 0) {
    throw new Error(
      `Cannot cancel this payment: active adjustment document ${adjCheck.rows[0].id} references invoice ${adjCheck.rows[0].original_invoice_id}. Cancel the adjustment document first.`
    );
  }

  const excessCheck = await client.query(
    `SELECT 1
       FROM receipt_allocations
      WHERE receipt_id = $1
        AND allocation_type = 'excess'
        AND (COALESCE(applied_amount, 0) > 0 OR COALESCE(refunded_amount, 0) > 0)
      LIMIT 1`,
    [receiptId]
  );
  if (excessCheck.rows.length > 0) {
    throw new Error(
      "Cannot cancel this payment: its overpayment excess has already been applied to invoices or refunded. Reverse those applications/refunds before cancelling this payment."
    );
  }

  const allocResult = await client.query(
    `SELECT * FROM receipt_allocations WHERE receipt_id = $1 ORDER BY line_number`,
    [receiptId]
  );

  if (receipt.status === "posted") {
    // Reverse invoice balances and customer credit.
    const ids = [...new Set(allocResult.rows.filter((r) => r.allocation_type === "invoice").map((r) => r.invoice_id))].sort();
    if (ids.length > 0) {
      const invRes = await client.query(
        `SELECT id, balance_due, totalamountpayable, paymenttype, customerid, invoice_status
           FROM invoices WHERE id = ANY($1::varchar[]) ORDER BY id FOR UPDATE`,
        [ids]
      );
      const invoiceMap = {};
      for (const row of invRes.rows) invoiceMap[row.id] = row;
      for (const r of allocResult.rows) {
        if (r.allocation_type !== "invoice") continue;
        const inv = invoiceMap[r.invoice_id];
        if (!inv) continue;
        const amount = round2(r.amount);
        // A cash bill stays fully settled: the cancelled receipt's amount goes
        // back to its automatic CH_REV1 collection, not to a balance due.
        if (inv.paymenttype === "CASH") continue;
        const newBalance = round2(
          Math.min(parseFloat(inv.totalamountpayable || 0), round2(inv.balance_due) + amount)
        );
        inv.balance_due = newBalance;
        const newStatus = newBalance <= 0 ? "paid" : "Unpaid";
        await client.query(
          `UPDATE invoices SET balance_due = $1, invoice_status = $2 WHERE id = $3`,
          [newBalance, newStatus, r.invoice_id]
        );
        if (inv.paymenttype === "INVOICE") {
          await client.query(
            `UPDATE customers SET credit_used = GREATEST(0, COALESCE(credit_used, 0) + $1) WHERE id = $2`,
            [amount, inv.customerid]
          );
        }
      }
    }

    if (receipt.journal_entry_id) {
      await client.query(
        `UPDATE journal_entries SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND status = 'posted'`,
        [receipt.journal_entry_id]
      );
    }
  }

  await client.query(
    `UPDATE payments
        SET status = 'cancelled', cancellation_date = NOW(), cancellation_reason = $2
      WHERE receipt_allocation_id IN (SELECT id FROM receipt_allocations WHERE receipt_id = $1)
        AND status <> 'cancelled'`,
    [receiptId, reason || "Payment cancelled"]
  );

  await client.query(
    `UPDATE receipts
        SET status = 'cancelled', cancellation_date = NOW(), cancellation_reason = $2,
            cancelled_by = $3, updated_at = NOW(), updated_by = $3
      WHERE id = $1`,
    [receiptId, reason || null, userId || null]
  );

  // Only once the compat payment rows are cancelled does the sales journal see
  // the money as no longer genuinely collected — the cash bills' automatic
  // CH_REV1 collection grows back by exactly the cancelled amount.
  await resyncCashBillSalesJournals(
    client,
    allocResult.rows
      .filter((row) => row.allocation_type === "invoice")
      .map((row) => row.invoice_id),
    userId
  );

  const fresh = await client.query(`SELECT * FROM receipts WHERE id = $1`, [receiptId]);
  return { receipt: fresh.rows[0] };
}
