// src/routes/accounting/receipt-service.js
// Atomic receipt service: one receipt header + itemized allocations owning one
// journal (docs/Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §4).
//
// Journal shapes:
//   Physical cash for old credit invoices (payment_method 'cash'):
//     one DR CH_REV2 line PER invoice allocation, each with its own visible
//     C{invoice} reference (legacy prints one holding-ledger row per invoice),
//     then CR TR per allocation. Cash stays in CH_REV2 until an RV bank-in.
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

const round2 = (v) => Math.round(parseFloat(v || 0) * 100) / 100;

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
      invoice_id: a.invoice_id ? String(a.invoice_id) : null,
      customer_id: a.customer_id ? String(a.customer_id) : null,
      target_account: a.target_account || null,
      external_reference: a.external_reference || null,
      amount,
    };
  });
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
async function lockInvoices(client, allocs) {
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
  // Per-invoice over-settlement check (sum of this receipt's allocations per invoice)
  const perInvoice = {};
  for (const a of allocs) {
    if (a.type !== "invoice") continue;
    perInvoice[a.invoice_id] = round2((perInvoice[a.invoice_id] || 0) + a.amount);
  }
  for (const [id, amt] of Object.entries(perInvoice)) {
    const balance = round2(map[id].balance_due);
    if (amt > balance + 0.005) {
      throw new Error(
        `Invoice ${id}: allocation ${amt.toFixed(2)} exceeds balance due ${balance.toFixed(2)}. Record the excess as an overpayment allocation instead.`
      );
    }
  }
  return map;
}

/**
 * Posts the journal for a receipt and applies invoice balance / customer
 * credit effects. Assumes invoices are already locked and validated.
 */
async function postReceiptJournal(client, receipt, allocs, invoiceMap, userId) {
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
  const postingDate = toLocalDateString(payload.posting_date || payload.received_date);
  const isPending = method === "cheque" && payload.post_immediately !== true;
  const debitAccount = method === "cash" ? "CH_REV2" : determineBankAccount(method, payload.bank_account);

  // Fill customer ids for invoice allocations + description default.
  const preMap = {};
  const ids = [...new Set(allocs.filter((a) => a.type === "invoice").map((a) => a.invoice_id))];
  if (ids.length > 0) {
    const invRes = await client.query(
      `SELECT id, customerid FROM invoices WHERE id = ANY($1::varchar[])`,
      [ids]
    );
    for (const row of invRes.rows) preMap[row.id] = row.customerid;
  }
  for (const a of allocs) {
    if (a.type === "invoice" && !a.customer_id) a.customer_id = preMap[a.invoice_id] || null;
  }

  const description = (payload.description || "").trim() || defaultDescription(allocs);
  const descriptionOverridden = Boolean((payload.description || "").trim());
  const displayReference =
    (payload.display_reference || payload.payment_reference || "").trim() ||
    (method === "cash" && ids.length === 1 ? `C${ids[0]}` : null);

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
  receipt.posting_date = isPending ? null : postingDate;

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
    const compatInvoiceId = a.invoice_id || ids[0] || null;
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
        debitAccount === "CH_REV2" ? "CASH" : debitAccount,
        payload.notes || (a.type === "excess" ? "Overpaid amount" : null),
        rowStatus,
        a.allocation_id,
      ]
    );
    paymentRows.push(payResult.rows[0]);
  }

  if (!isPending) {
    const invoiceMap = await lockInvoices(client, allocs);
    await postReceiptJournal(client, receipt, allocs, invoiceMap, userId);
  }

  const fresh = await client.query(`SELECT * FROM receipts WHERE id = $1`, [receipt.id]);
  return { receipt: fresh.rows[0], allocations: allocationRows, payments: paymentRows };
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
  if (receiptResult.rows.length === 0) throw new Error(`Receipt ${receiptId} not found`);
  const receipt = receiptResult.rows[0];
  if (receipt.status !== "pending") {
    throw new Error(`Receipt ${receiptId} is ${receipt.status}, not pending`);
  }

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

  receipt.posting_date = toLocalDateString(
    (options && options.posting_date) || new Date()
  );
  if (options && options.cheque_reference) {
    await client.query(`UPDATE receipts SET cheque_reference = $1 WHERE id = $2`, [
      options.cheque_reference,
      receiptId,
    ]);
    receipt.cheque_reference = options.cheque_reference;
  }

  const invoiceMap = await lockInvoices(client, allocs);
  const journalEntryId = await postReceiptJournal(client, receipt, allocs, invoiceMap, userId);

  await client.query(
    `UPDATE payments SET status = CASE WHEN p_alloc.allocation_type = 'excess' THEN 'overpaid' ELSE 'active' END
       FROM receipt_allocations p_alloc
      WHERE payments.receipt_allocation_id = p_alloc.id
        AND p_alloc.receipt_id = $1
        AND payments.status = 'pending'`,
    [receiptId]
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
  if (receiptResult.rows.length === 0) throw new Error(`Receipt ${receiptId} not found`);
  const receipt = receiptResult.rows[0];
  if (receipt.status === "cancelled") {
    throw new Error(`Receipt ${receiptId} is already cancelled`);
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
      `Receipt ${receiptId} has been banked in (bank-in #${bankInCheck.rows[0].id}). Reverse that bank-in first.`
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
      `Cannot cancel receipt ${receiptId}: active adjustment document ${adjCheck.rows[0].id} references invoice ${adjCheck.rows[0].original_invoice_id}. Cancel the adjustment document first.`
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
    [receiptId, reason || `Receipt ${receiptId} cancelled`]
  );

  await client.query(
    `UPDATE receipts
        SET status = 'cancelled', cancellation_date = NOW(), cancellation_reason = $2,
            cancelled_by = $3, updated_at = NOW(), updated_by = $3
      WHERE id = $1`,
    [receiptId, reason || null, userId || null]
  );

  const fresh = await client.query(`SELECT * FROM receipts WHERE id = $1`, [receiptId]);
  return { receipt: fresh.rows[0] };
}
