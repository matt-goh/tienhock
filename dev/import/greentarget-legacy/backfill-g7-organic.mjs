// dev/import/greentarget-legacy/backfill-g7-organic.mjs
//
// Phase G7 backfill: post the organic journals for the Green Target documents
// that were keyed between the 2026-07-01 cutover and G7 going live, by calling
// the REAL shipped services (never hand-built SQL), so the backfill proves the
// same code path every future document takes:
//
//   invoice 325 (2026/01012, RM200, active)  -> syncGTSalesJournalEntry
//   invoice 326 (2026/01014, RM250, paid)    -> syncGTSalesJournalEntry
//   payment 197 (invoice 326, RV26/07/01)    -> syncGTPaymentJournalEntry
//
// Idempotent: the services adopt an existing posted journal by back-link /
// source ownership, so a re-run re-syncs instead of duplicating.
//
// Usage: node dev/import/greentarget-legacy/backfill-g7-organic.mjs
import { createDatabasePool } from "../../../src/routes/utils/db-pool.js";
import { syncGTSalesJournalEntry } from "../../../src/routes/greentarget/accounting/sales-journal.js";
import { syncGTPaymentJournalEntry } from "../../../src/routes/greentarget/accounting/payment-journal.js";

const BACKFILL_INVOICE_IDS = [325, 326];
const BACKFILL_PAYMENT_IDS = [197];

const pool = createDatabasePool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "tienhock",
  password: process.env.DB_PASSWORD || "foodmaker",
  port: process.env.DB_PORT || 5434,
});

const createdJournalIds = [];

async function backfillInvoice(invoiceId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoiceResult = await client.query(
      "SELECT * FROM greentarget.invoices WHERE invoice_id = $1",
      [invoiceId]
    );
    if (invoiceResult.rows.length === 0) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }
    const journalId = await syncGTSalesJournalEntry(
      client,
      invoiceResult.rows[0],
      "g7-backfill"
    );
    await client.query("COMMIT");
    console.log(
      `invoice ${invoiceId} (${invoiceResult.rows[0].invoice_number}) -> journal ${journalId}`
    );
    if (journalId) createdJournalIds.push(journalId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function backfillPayment(paymentId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query(
      "SELECT * FROM greentarget.payments WHERE payment_id = $1",
      [paymentId]
    );
    if (paymentResult.rows.length === 0) {
      throw new Error(`Payment ${paymentId} not found`);
    }
    const invoiceResult = await client.query(
      "SELECT * FROM greentarget.invoices WHERE invoice_id = $1",
      [paymentResult.rows[0].invoice_id]
    );
    if (invoiceResult.rows.length === 0) {
      throw new Error(`Payment ${paymentId} owner invoice not found`);
    }
    const journalId = await syncGTPaymentJournalEntry(
      client,
      paymentResult.rows[0],
      invoiceResult.rows[0],
      "g7-backfill"
    );
    await client.query("COMMIT");
    console.log(
      `payment ${paymentId} (${paymentResult.rows[0].internal_reference}) -> journal ${journalId}`
    );
    if (journalId) createdJournalIds.push(journalId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function verify() {
  const journals = await pool.query(
    `SELECT je.id, je.reference_no, je.entry_type, je.entry_date,
            je.display_reference, je.total_debit, je.total_credit, je.status,
            je.source_type, je.source_id, je.posting_sequence
       FROM greentarget.journal_entries je
      WHERE je.id = ANY($1::int[])
      ORDER BY je.id`,
    [createdJournalIds]
  );
  console.log("\n=== backfilled journals ===");
  console.table(journals.rows);

  if (journals.rows.length !== createdJournalIds.length) {
    throw new Error("A backfilled journal is missing");
  }
  for (const journal of journals.rows) {
    if (journal.status !== "posted") {
      throw new Error(`Journal ${journal.id} is not posted`);
    }
    if (
      Number(journal.total_debit) !== Number(journal.total_credit) ||
      Number(journal.total_debit) <= 0
    ) {
      throw new Error(`Journal ${journal.id} is unbalanced`);
    }
  }

  const lines = await pool.query(
    `SELECT jel.journal_entry_id, jel.line_number, jel.account_code,
            jel.debit_amount, jel.credit_amount
       FROM greentarget.journal_entry_lines jel
      WHERE jel.journal_entry_id = ANY($1::int[])
      ORDER BY jel.journal_entry_id, jel.line_number`,
    [createdJournalIds]
  );
  console.log("=== backfilled lines ===");
  console.table(lines.rows);

  const backLinks = await pool.query(
    `SELECT (SELECT COUNT(*) FROM greentarget.invoices
              WHERE journal_entry_id = ANY($1::int[])) AS invoice_links,
            (SELECT COUNT(*) FROM greentarget.payments
              WHERE journal_entry_id = ANY($1::int[])
                AND bank_account = 'PBB_1') AS payment_links`,
    [createdJournalIds]
  );
  const { invoice_links, payment_links } = backLinks.rows[0];
  console.log(
    `back-links: ${invoice_links} invoice(s), ${payment_links} payment(s)`
  );
  if (Number(invoice_links) !== 2 || Number(payment_links) !== 1) {
    throw new Error("Back-links are incomplete");
  }

  // The payment must be on the exact REC-{payment_id} reference.
  const recJournal = journals.rows.find((j) => j.entry_type === "REC");
  if (!recJournal || recJournal.reference_no !== "REC-197") {
    throw new Error("Payment journal reference_no is not REC-197");
  }
  if (recJournal.display_reference !== "RV26/07/01") {
    throw new Error("Payment journal display_reference is not RV26/07/01");
  }
}

async function main() {
  for (const invoiceId of BACKFILL_INVOICE_IDS) {
    await backfillInvoice(invoiceId);
  }
  for (const paymentId of BACKFILL_PAYMENT_IDS) {
    await backfillPayment(paymentId);
  }
  await verify();
  console.log("\nG7 backfill complete: 3 journals posted, balanced, linked.");
}

main()
  .catch((error) => {
    console.error("\nBACKFILL FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
