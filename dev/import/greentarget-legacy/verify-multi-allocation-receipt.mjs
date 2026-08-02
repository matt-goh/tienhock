#!/usr/bin/env node
/**
 * Rollback-only integration verifier for Green Target receipt groups.
 *
 * The fixture drives the real payment batch and cancellation HTTP handlers.
 * Their transaction boundaries are intercepted so every fixture row remains
 * inside one outer transaction, which is always rolled back.
 *
 * Usage:
 *   node dev/import/greentarget-legacy/verify-multi-allocation-receipt.mjs
 */

import express from "express";

import createGreenTargetPaymentsRouter from "../../../src/routes/greentarget/payments.js";
import { syncGTSalesJournalEntry } from "../../../src/routes/greentarget/accounting/sales-journal.js";
import { createDatabasePool } from "../../../src/routes/utils/db-pool.js";

const FIXTURE_DATE = "2026-07-31";
const suffix = `${process.pid}${Date.now().toString(36)}`.toUpperCase();
const identityA = `VCD-A-${suffix}`;
const identityB = `VCD-B-${suffix}`;
const invoiceNumberA = `VI-A-${suffix}`;
const invoiceNumberB = `VI-B-${suffix}`;
const postedReference = `VR-${suffix}`;
const pendingReference = `VP-${suffix}`;

const pool = createDatabasePool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "tienhock",
  password: process.env.DB_PASSWORD || "REMOVED_SECRET",
  port: Number(process.env.DB_PORT || 5434),
});

let checks = 0;

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {void}
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  checks += 1;
  console.log(`ok  ${message}`);
}

/**
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
function cents(value) {
  return Math.round(Number(value) * 100);
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {{
 *   connect: () => Promise<Record<string, unknown>>,
 *   query: (text: string|Record<string, unknown>, values?: unknown[]) => Promise<import("pg").QueryResult>
 * }}
 */
function createRollbackOnlyRoutePool(client) {
  /**
   * @param {string|Record<string, unknown>} text
   * @param {unknown[]} [values]
   * @returns {Promise<import("pg").QueryResult>}
   */
  async function query(text, values) {
    const sql =
      typeof text === "string" ? text : String(text?.text || "");
    const transactionCommand = sql.trim().replace(/;$/, "").toUpperCase();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(transactionCommand)) {
      return /** @type {import("pg").QueryResult} */ ({
        command: transactionCommand,
        rowCount: null,
        oid: 0,
        fields: [],
        rows: [],
      });
    }
    return client.query(text, values);
  }

  const routeClient = {
    query,
    release: () => {},
  };
  return {
    connect: async () => routeClient,
    query,
  };
}

/**
 * @param {import("http").Server} server
 * @returns {Promise<void>}
 */
function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * @param {string} url
 * @param {"POST"|"PUT"} method
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{status: number, body: Record<string, unknown>}>>}
 */
async function requestJson(url, method, payload) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  /** @type {Record<string, unknown>} */
  const body = await response.json();
  return { status: response.status, body };
}

/**
 * @param {import("pg").PoolClient} client
 * @param {string} identityCode
 * @param {string} customerName
 * @param {string} invoiceNumber
 * @param {number} totalAmount
 * @param {number} sortOrder
 * @param {Array<{account_code: string, amount: number}>} revenueSplits
 * @returns {Promise<Record<string, unknown>>}
 */
async function createInvoiceFixture(
  client,
  identityCode,
  customerName,
  invoiceNumber,
  totalAmount,
  sortOrder,
  revenueSplits
) {
  await client.query(
    `INSERT INTO greentarget.debtor_subledger_registry (
       code, description, control_account_code, kind,
       effective_from, sort_order, is_active, is_selectable,
       provenance, notes
     ) VALUES ($1, $2, 'CD_SD', 'sundry', $3, $4, true, true,
               'rollback_verifier_fixture',
               'Temporary multi-allocation receipt verifier identity')`,
    [identityCode, customerName, FIXTURE_DATE, sortOrder]
  );
  const customerResult = await client.query(
    `INSERT INTO greentarget.customers (name, debtor_account_code)
     VALUES ($1, $2)
     RETURNING customer_id`,
    [customerName, identityCode]
  );
  const invoiceResult = await client.query(
    `INSERT INTO greentarget.invoices (
       invoice_number, type, customer_id,
       amount_before_tax, tax_amount, total_amount,
       date_issued, balance_due, status,
       debtor_account_code, receivable_account_code, revenue_account_code
     ) VALUES ($1, 'regular', $2, $3, 0, $3, $4, $3, 'active',
               $5, 'CD_SD', $6)
     RETURNING *`,
    [
      invoiceNumber,
      customerResult.rows[0].customer_id,
      totalAmount,
      FIXTURE_DATE,
      identityCode,
      new Set(revenueSplits.map((split) => split.account_code)).size === 1
        ? revenueSplits[0].account_code
        : null,
    ]
  );
  const invoice = invoiceResult.rows[0];
  for (let index = 0; index < revenueSplits.length; index += 1) {
    const split = revenueSplits[index];
    await client.query(
      `INSERT INTO greentarget.invoice_revenue_splits (
         invoice_id, line_number, account_code, amount
       ) VALUES ($1, $2, $3, $4)`,
      [invoice.invoice_id, index + 1, split.account_code, split.amount]
    );
  }
  const journalId = await syncGTSalesJournalEntry(
    client,
    invoice,
    "rollback-verifier"
  );
  assert(
    Number.isInteger(Number(journalId)),
    `fixture invoice ${invoiceNumber} owns a posted sales journal`
  );
  return invoice;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number[]} invoiceIds
 * @returns {Promise<Map<number, {balance: number, status: string}>>}
 */
async function fetchInvoiceStates(client, invoiceIds) {
  const result = await client.query(
    `SELECT invoice_id, balance_due, status
       FROM greentarget.invoices
      WHERE invoice_id = ANY($1::int[])
      ORDER BY invoice_id`,
    [invoiceIds]
  );
  return new Map(
    result.rows.map((row) => [
      Number(row.invoice_id),
      { balance: Number(row.balance_due), status: String(row.status) },
    ])
  );
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  /** @type {import("pg").PoolClient|null} */
  let client = null;
  /** @type {import("http").Server|null} */
  let server = null;
  let fixtureRolledBack = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const prerequisites = await client.query(
      `SELECT to_regclass('greentarget.debtor_subledger_registry') IS NOT NULL
                AS has_registry,
              EXISTS (
                SELECT 1
                  FROM information_schema.columns
                 WHERE table_schema = 'greentarget'
                   AND table_name = 'invoices'
                   AND column_name = 'receivable_account_code'
              ) AS has_receivable_snapshot,
              EXISTS (
                SELECT 1
                  FROM information_schema.columns
                 WHERE table_schema = 'greentarget'
                   AND table_name = 'journal_entry_lines'
                   AND column_name = 'debtor_subledger_code'
              ) AS has_subledger_dimension`
    );
    assert(
      prerequisites.rows[0]?.has_registry === true &&
        prerequisites.rows[0]?.has_receivable_snapshot === true &&
        prerequisites.rows[0]?.has_subledger_dimension === true,
      "debtor-dimension migration prerequisites are installed"
    );

    const sortOrderResult = await client.query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS first_sort_order
         FROM greentarget.debtor_subledger_registry`
    );
    const firstSortOrder = Number(sortOrderResult.rows[0].first_sort_order);
    const invoiceA = await createInvoiceFixture(
      client,
      identityA,
      `VERIFY CUSTOMER A ${suffix}`,
      invoiceNumberA,
      230,
      firstSortOrder,
      [
        { account_code: "TGA", amount: 100 },
        { account_code: "WS_OTH", amount: 130 },
      ]
    );
    const invoiceB = await createInvoiceFixture(
      client,
      identityB,
      `VERIFY CUSTOMER B ${suffix}`,
      invoiceNumberB,
      180,
      firstSortOrder + 1,
      [
        { account_code: "TGA", amount: 80 },
        { account_code: "TGA", amount: 100 },
      ]
    );
    const invoiceIds = [
      Number(invoiceA.invoice_id),
      Number(invoiceB.invoice_id),
    ];
    const salesShapeResult = await client.query(
      `SELECT journal.source_id, line.line_number, line.account_code,
              line.debit_amount, line.credit_amount,
              line.debtor_subledger_code
         FROM greentarget.journal_entries journal
         JOIN greentarget.journal_entry_lines line
           ON line.journal_entry_id = journal.id
        WHERE journal.source_type = 'invoice'
          AND journal.source_id = ANY($1::text[])
        ORDER BY journal.source_id, line.line_number`,
      [invoiceIds.map(String)]
    );
    const salesLinesByInvoice = new Map(
      invoiceIds.map((invoiceId) => [
        String(invoiceId),
        salesShapeResult.rows.filter(
          (line) => line.source_id === String(invoiceId)
        ),
      ])
    );
    const mixedLines = salesLinesByInvoice.get(String(invoiceA.invoice_id));
    const duplicateLines = salesLinesByInvoice.get(String(invoiceB.invoice_id));
    assert(
      mixedLines.length === 3 &&
        mixedLines[0].account_code === "CD_SD" &&
        mixedLines[0].debtor_subledger_code === identityA &&
        cents(mixedLines[0].debit_amount) === 23_000 &&
        mixedLines[1].account_code === "TGA" &&
        cents(mixedLines[1].credit_amount) === 10_000 &&
        mixedLines[2].account_code === "WS_OTH" &&
        cents(mixedLines[2].credit_amount) === 13_000,
      "mixed invoice preserves ordered TGA/WS_OTH credits and its CD_SD identity tag"
    );
    assert(
      duplicateLines.length === 3 &&
        duplicateLines[1].account_code === "TGA" &&
        cents(duplicateLines[1].credit_amount) === 8_000 &&
        duplicateLines[2].account_code === "TGA" &&
        cents(duplicateLines[2].credit_amount) === 10_000,
      "duplicate same-account invoice credits remain two ordered journal lines"
    );

    const app = express();
    app.use(express.json());
    app.use(
      "/",
      createGreenTargetPaymentsRouter(createRollbackOnlyRoutePool(client))
    );
    server = await new Promise((resolve, reject) => {
      const listeningServer = app.listen(0, "127.0.0.1", () =>
        resolve(listeningServer)
      );
      listeningServer.on("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("FAIL: verifier HTTP server did not expose a TCP port");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const postedResponse = await requestJson(`${baseUrl}/batch`, "POST", {
      payment_date: FIXTURE_DATE,
      payment_method: "bank_transfer",
      payment_reference: `TX-${suffix}`,
      internal_reference: postedReference,
      allocations: [
        { invoice_id: invoiceA.invoice_id, amount_paid: 100 },
        { invoice_id: invoiceB.invoice_id, amount_paid: 80 },
      ],
    });
    assert(
      postedResponse.status === 201,
      `real batch endpoint accepts two allocations (${postedResponse.status}: ${
        postedResponse.body.message || "no message"
      })`
    );
    const postedPayments = Array.isArray(postedResponse.body.payments)
      ? postedResponse.body.payments
      : [];
    assert(postedPayments.length === 2, "one receipt returns two payment allocations");

    const postedReceiptResult = await client.query(
      `SELECT *
         FROM greentarget.receipts
        WHERE display_reference = $1`,
      [postedReference]
    );
    const postedReceipt = postedReceiptResult.rows[0];
    assert(
      postedReceipt?.status === "posted" &&
        cents(postedReceipt.total_amount) === 18_000 &&
        Number.isInteger(Number(postedReceipt.journal_entry_id)),
      "posted receipt header totals RM180 and owns one journal"
    );

    const journalResult = await client.query(
      `SELECT je.id AS journal_id, je.entry_type, je.status,
              je.total_debit, je.total_credit,
              jel.account_code, jel.debit_amount, jel.credit_amount,
              jel.reference, jel.debtor_subledger_code
         FROM greentarget.journal_entries je
         JOIN greentarget.journal_entry_lines jel
           ON jel.journal_entry_id = je.id
        WHERE je.id = $1
        ORDER BY jel.line_number, jel.id`,
      [postedReceipt.journal_entry_id]
    );
    assert(
      journalResult.rows.length === 3 &&
        journalResult.rows.every(
          (row) => row.entry_type === "REC" && row.status === "posted"
        ) &&
        cents(journalResult.rows[0].total_debit) === 18_000 &&
        cents(journalResult.rows[0].total_credit) === 18_000,
      "one balanced REC journal contains exactly three lines"
    );
    const bankLines = journalResult.rows.filter(
      (row) => row.account_code === "PBB_1"
    );
    assert(
      bankLines.length === 1 &&
        cents(bankLines[0].debit_amount) === 18_000 &&
        cents(bankLines[0].credit_amount) === 0 &&
        bankLines[0].debtor_subledger_code === null,
      "REC journal has one aggregate PBB_1 debit of RM180"
    );
    const debtorCredits = journalResult.rows.filter(
      (row) => row.account_code === "CD_SD"
    );
    const creditByIdentity = new Map(
      debtorCredits.map((row) => [
        String(row.debtor_subledger_code),
        {
          amount: cents(row.credit_amount),
          debit: cents(row.debit_amount),
          reference: String(row.reference),
        },
      ])
    );
    assert(
      debtorCredits.length === 2 &&
        creditByIdentity.get(identityA)?.amount === 10_000 &&
        creditByIdentity.get(identityA)?.debit === 0 &&
        creditByIdentity.get(identityA)?.reference === invoiceNumberA &&
        creditByIdentity.get(identityB)?.amount === 8_000 &&
        creditByIdentity.get(identityB)?.debit === 0 &&
        creditByIdentity.get(identityB)?.reference === invoiceNumberB,
      "two CD_SD credits retain their RM100/RM80 logical debtor tags"
    );

    let invoiceStates = await fetchInvoiceStates(client, invoiceIds);
    assert(
      cents(invoiceStates.get(invoiceIds[0])?.balance) === 13_000 &&
        invoiceStates.get(invoiceIds[0])?.status === "active" &&
        cents(invoiceStates.get(invoiceIds[1])?.balance) === 10_000 &&
        invoiceStates.get(invoiceIds[1])?.status === "active",
      "partial receipt leaves invoice balances RM130/RM100 and statuses active"
    );
    const postedAllocationState = await client.query(
      `SELECT COUNT(*)::integer AS allocation_count,
              COUNT(DISTINCT receipt_id)::integer AS receipt_count,
              COUNT(DISTINCT journal_entry_id)::integer AS journal_count,
              BOOL_AND(status = 'active') AS all_active,
              BOOL_AND(bank_account = 'PBB_1') AS all_pbb_1
         FROM greentarget.payments
        WHERE receipt_id = $1`,
      [postedReceipt.id]
    );
    assert(
      postedAllocationState.rows[0].allocation_count === 2 &&
        postedAllocationState.rows[0].receipt_count === 1 &&
        postedAllocationState.rows[0].journal_count === 1 &&
        postedAllocationState.rows[0].all_active === true &&
        postedAllocationState.rows[0].all_pbb_1 === true,
      "both active allocations share the receipt-owned PBB_1 journal"
    );

    const firstPaymentId = Number(postedPayments[0].payment_id);
    const cancelResponse = await requestJson(
      `${baseUrl}/${firstPaymentId}/cancel`,
      "PUT",
      { reason: "Rollback verifier cancellation" }
    );
    assert(
      cancelResponse.status === 200,
      `real cancellation endpoint cancels the whole group (${cancelResponse.status}: ${
        cancelResponse.body.message || "no message"
      })`
    );
    const cancelledState = await client.query(
      `SELECT r.status AS receipt_status,
              je.status AS journal_status,
              COUNT(p.payment_id)::integer AS allocation_count,
              BOOL_AND(p.status = 'cancelled') AS all_allocations_cancelled
         FROM greentarget.receipts r
         LEFT JOIN greentarget.journal_entries je
           ON je.id = r.journal_entry_id
         JOIN greentarget.payments p ON p.receipt_id = r.id
        WHERE r.id = $1
        GROUP BY r.status, je.status`,
      [postedReceipt.id]
    );
    assert(
      cancelledState.rows[0]?.receipt_status === "cancelled" &&
        cancelledState.rows[0]?.journal_status === "cancelled" &&
        cancelledState.rows[0]?.allocation_count === 2 &&
        cancelledState.rows[0]?.all_allocations_cancelled === true,
      "group cancellation cancels the header, both allocations and REC journal"
    );
    invoiceStates = await fetchInvoiceStates(client, invoiceIds);
    assert(
      cents(invoiceStates.get(invoiceIds[0])?.balance) === 23_000 &&
        invoiceStates.get(invoiceIds[0])?.status === "active" &&
        cents(invoiceStates.get(invoiceIds[1])?.balance) === 18_000 &&
        invoiceStates.get(invoiceIds[1])?.status === "active",
      "group cancellation restores invoice balances RM230/RM180 and active statuses"
    );

    const pendingResponse = await requestJson(`${baseUrl}/batch`, "POST", {
      payment_date: FIXTURE_DATE,
      payment_method: "cheque",
      payment_reference: `CQ-${suffix}`,
      internal_reference: pendingReference,
      allocations: [
        { invoice_id: invoiceA.invoice_id, amount_paid: 100 },
        { invoice_id: invoiceB.invoice_id, amount_paid: 80 },
      ],
    });
    assert(
      pendingResponse.status === 201,
      `real batch endpoint accepts a pending cheque group (${pendingResponse.status}: ${
        pendingResponse.body.message || "no message"
      })`
    );
    const pendingReceiptResult = await client.query(
      `SELECT r.*,
              COUNT(p.payment_id)::integer AS allocation_count,
              BOOL_AND(p.status = 'pending') AS all_pending,
              BOOL_AND(p.journal_entry_id IS NULL) AS allocation_journals_null
         FROM greentarget.receipts r
         JOIN greentarget.payments p ON p.receipt_id = r.id
        WHERE r.display_reference = $1
        GROUP BY r.id`,
      [pendingReference]
    );
    const pendingReceipt = pendingReceiptResult.rows[0];
    const strayPendingJournal = await client.query(
      `SELECT COUNT(*)::integer AS journal_count
         FROM greentarget.journal_entries
        WHERE source_type = 'receipt'
          AND source_id = $1`,
      [String(pendingReceipt.id)]
    );
    assert(
      pendingReceipt.status === "pending" &&
        pendingReceipt.posting_date === null &&
        pendingReceipt.journal_entry_id === null &&
        pendingReceipt.allocation_count === 2 &&
        pendingReceipt.all_pending === true &&
        pendingReceipt.allocation_journals_null === true &&
        strayPendingJournal.rows[0].journal_count === 0,
      "pending cheque leaves the receipt and allocations without any journal"
    );
    invoiceStates = await fetchInvoiceStates(client, invoiceIds);
    assert(
      cents(invoiceStates.get(invoiceIds[0])?.balance) === 23_000 &&
        cents(invoiceStates.get(invoiceIds[1])?.balance) === 18_000 &&
        [...invoiceStates.values()].every((state) => state.status === "active"),
      "pending cheque does not change either invoice balance or status"
    );
  } finally {
    try {
      if (server) {
        await closeServer(server);
      }
    } finally {
      if (client) {
        try {
          await client.query("ROLLBACK");
          fixtureRolledBack = true;
        } finally {
          client.release();
        }
      }
    }
  }

  assert(fixtureRolledBack, "outer fixture transaction was rolled back");
  const residueResult = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM greentarget.debtor_subledger_registry
         WHERE code = ANY($1::text[]))
       +
       (SELECT COUNT(*) FROM greentarget.invoices
         WHERE invoice_number = ANY($2::text[]))
       +
       (SELECT COUNT(*) FROM greentarget.receipts
         WHERE display_reference = ANY($3::text[]))
       +
       (SELECT COUNT(*) FROM greentarget.journal_entries
         WHERE reference_no = ANY($2::text[])) AS residue_count`,
    [
      [identityA, identityB],
      [invoiceNumberA, invoiceNumberB],
      [postedReference, pendingReference],
    ]
  );
  assert(
    Number(residueResult.rows[0].residue_count) === 0,
    "no fixture identity, invoice, receipt or journal remains after rollback"
  );

  console.log(`PASS: ${checks} multi-allocation receipt checks passed.`);
}

try {
  await main();
} finally {
  await pool.end();
}
