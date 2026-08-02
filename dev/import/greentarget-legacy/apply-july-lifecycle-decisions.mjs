// Green Target July 2026 lifecycle decisions (GT-P4, user-approved 31 Jul 2026).
//
// The master-data half of these decisions lives in
// dev/migrations/2026-07-31_greentarget_july_debtor_decisions.sql. This script
// performs the two DOCUMENT-LIFECYCLE actions that migration deliberately does
// not, and it constructs no journal line itself: every posting is delegated to
// the shipped syncGTSalesJournalEntry service.
//
//   Decision 2 - invoices 325 (2026/01012) and 326 (2026/01014) are live but
//     their sales journals 1706/1707 were cancelled by hand, so RM200 of
//     receivable had no GL entry and a paid bill had no journal at all. The
//     user chose RESTORE. Cancellation is a pure status flip that deletes no
//     lines (posting-utils.cancelGTJournal), so restore is its exact inverse;
//     the journal is then re-synced so its lines use the GT-P1 accounts the
//     invoice now snapshots, not the pre-decision CD_SD ones.
//
//   Decision 3 - ERP invoice 342 re-uses reference 2026/01009, which already
//     exists in the immutable June import for the same RM230. The user
//     confirmed it is the same physical bill, so the ERP duplicate is
//     CANCELLED and the imported June entry remains the single record.
//
// Default mode is a SELECT-only dry run. Pass --apply to write.
//
// Usage:
//   node dev/import/greentarget-legacy/apply-july-lifecycle-decisions.mjs
//   node dev/import/greentarget-legacy/apply-july-lifecycle-decisions.mjs --apply
import { createDatabasePool } from "../../../src/routes/utils/db-pool.js";
import { syncGTSalesJournalEntry } from "../../../src/routes/greentarget/accounting/sales-journal.js";

const APPLY = process.argv.includes("--apply");
const ACTOR = "gt-july-parity-backfill";

/** Invoices whose hand-cancelled S journal the user chose to restore. */
const RESTORE_INVOICES = [
  { invoiceId: 325, invoiceNumber: "2026/01012", journalId: 1706 },
  { invoiceId: 326, invoiceNumber: "2026/01014", journalId: 1707 },
];

/** The duplicate ERP bill to cancel, and the locked import it duplicates. */
const DUPLICATE_INVOICE = {
  invoiceId: 342,
  invoiceNumber: "2026/01009",
  amount: 230,
  reason:
    "Duplicate of the 2026-06-30 imported bill 2026/01009 (same reference, same RM230.00);" +
    " cancelled 31 Jul 2026 so the amount is not counted twice.",
};

const results = [];
let blocked = 0;

function record(action, status, detail) {
  if (status === "blocked") blocked++;
  results.push({ action, status, detail });
}

/**
 * Restore one hand-cancelled sales journal and re-sync it through the service.
 *
 * @param {import("pg").PoolClient} client
 * @param {{invoiceId: number, invoiceNumber: string, journalId: number}} target
 */
async function restoreSalesJournal(client, target) {
  const label = `invoice ${target.invoiceId} ${target.invoiceNumber}`;

  const invoiceResult = await client.query(
    `SELECT * FROM greentarget.invoices WHERE invoice_id = $1 FOR UPDATE`,
    [target.invoiceId]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) {
    return record(label, "blocked", "invoice not found");
  }
  if (invoice.invoice_number !== target.invoiceNumber) {
    return record(label, "blocked", `reference is ${invoice.invoice_number}`);
  }
  if (invoice.status === "cancelled") {
    return record(label, "blocked", "invoice is cancelled; restoring its journal would post a cancelled bill");
  }
  const debtor = String(invoice.debtor_account_code || "").trim();
  if (!debtor || debtor === "CD_SD") {
    return record(label, "blocked", `debtor is still ${debtor || "unset"}; run the 2026-07-31 migration first`);
  }

  const journalResult = await client.query(
    `SELECT id, status, entry_type, source_type, source_id, manual_override, entry_date
       FROM greentarget.journal_entries WHERE id = $1 FOR UPDATE`,
    [target.journalId]
  );
  const journal = journalResult.rows[0];
  if (!journal) {
    return record(label, "blocked", `journal ${target.journalId} not found`);
  }
  if (
    journal.entry_type !== "S" ||
    journal.source_type !== "invoice" ||
    String(journal.source_id) !== String(target.invoiceId)
  ) {
    return record(label, "blocked", `journal ${target.journalId} does not belong to this invoice`);
  }
  if (journal.status === "posted") {
    return record(label, "no-op", `journal ${target.journalId} is already posted`);
  }
  if (journal.status !== "cancelled") {
    return record(label, "blocked", `journal ${target.journalId} is ${journal.status}`);
  }

  // The partial unique index allows exactly one POSTED journal per source, so a
  // replacement must not already exist or the restore would violate it.
  const rivalResult = await client.query(
    `SELECT id FROM greentarget.journal_entries
      WHERE source_type = 'invoice' AND source_id = $1
        AND status = 'posted' AND id <> $2`,
    [String(target.invoiceId), target.journalId]
  );
  if (rivalResult.rows.length > 0) {
    return record(
      label,
      "blocked",
      `a replacement journal ${rivalResult.rows[0].id} is already posted for this invoice`
    );
  }

  if (!APPLY) {
    return record(
      label,
      "would apply",
      `restore journal ${target.journalId}, then re-sync to DR ${debtor} / CR ${invoice.revenue_account_code}`
    );
  }

  // Restore = the exact inverse of the status flip cancellation performed.
  await client.query(
    `UPDATE greentarget.journal_entries
        SET status = 'posted', manual_override = false,
            updated_at = NOW(), updated_by = $2
      WHERE id = $1`,
    [target.journalId, ACTOR]
  );
  await client.query(
    "UPDATE greentarget.invoices SET journal_entry_id = $1 WHERE invoice_id = $2",
    [target.journalId, target.invoiceId]
  );

  // Re-read so the service sees the restored back-link, then let it rewrite the
  // lines onto the accounts the invoice now snapshots.
  const refreshed = await client.query(
    "SELECT * FROM greentarget.invoices WHERE invoice_id = $1",
    [target.invoiceId]
  );
  const journalId = await syncGTSalesJournalEntry(client, refreshed.rows[0], ACTOR);
  record(
    label,
    "applied",
    `journal ${journalId} restored and re-synced to DR ${debtor} / CR ${invoice.revenue_account_code}`
  );
}

/**
 * Cancel the duplicate ERP invoice and cascade to its journal.
 *
 * @param {import("pg").PoolClient} client
 */
async function cancelDuplicateInvoice(client) {
  const target = DUPLICATE_INVOICE;
  const label = `invoice ${target.invoiceId} ${target.invoiceNumber}`;

  const invoiceResult = await client.query(
    "SELECT * FROM greentarget.invoices WHERE invoice_id = $1 FOR UPDATE",
    [target.invoiceId]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) {
    return record(label, "blocked", "invoice not found");
  }
  if (invoice.invoice_number !== target.invoiceNumber) {
    return record(label, "blocked", `reference is ${invoice.invoice_number}`);
  }
  if (invoice.status === "cancelled") {
    return record(label, "no-op", "invoice is already cancelled");
  }
  if (Math.abs(Number(invoice.total_amount) - target.amount) > 0.005) {
    return record(label, "blocked", `amount is ${invoice.total_amount}, expected ${target.amount}`);
  }

  // Re-prove the duplication against the immutable import rather than trusting
  // the decision note: same visible reference, same amount, inside the import.
  const importedResult = await client.query(
    `SELECT j.id, SUM(l.debit_amount) AS debit
       FROM greentarget.journal_entries j
       JOIN greentarget.journal_entry_lines l ON l.journal_entry_id = j.id
      WHERE j.display_reference = $1
        AND j.source_type = 'legacy_import'
        AND j.status = 'posted'
      GROUP BY j.id`,
    [target.invoiceNumber]
  );
  if (importedResult.rows.length !== 1) {
    return record(
      label,
      "blocked",
      `expected exactly one imported ${target.invoiceNumber}, found ${importedResult.rows.length}`
    );
  }
  if (Math.abs(Number(importedResult.rows[0].debit) - target.amount) > 0.005) {
    return record(
      label,
      "blocked",
      `imported journal ${importedResult.rows[0].id} is ${importedResult.rows[0].debit}, not ${target.amount}`
    );
  }

  // Same guards the /:invoice_id/cancel route enforces.
  const adjustments = await client.query(
    `SELECT id FROM greentarget.adjustment_documents
      WHERE original_invoice_id = $1 AND status = 'active'
        AND COALESCE(is_consolidated, false) = false`,
    [target.invoiceId]
  );
  if (adjustments.rows.length > 0) {
    return record(label, "blocked", `active adjustment document(s): ${adjustments.rows.map((r) => r.id).join(", ")}`);
  }
  const allocations = await client.query(
    `SELECT p.payment_id, r.display_reference, r.status
       FROM greentarget.payments p
       JOIN greentarget.receipts r ON r.id = p.receipt_id
      WHERE p.invoice_id = $1 AND r.status <> 'cancelled'`,
    [target.invoiceId]
  );
  if (allocations.rows.length > 0) {
    return record(
      label,
      "blocked",
      `receipt allocation(s) still live: ${allocations.rows.map((r) => r.display_reference).join(", ")}`
    );
  }

  if (!APPLY) {
    return record(
      label,
      "would apply",
      `cancel the duplicate and cascade-cancel journal ${invoice.journal_entry_id}` +
        ` (duplicates imported journal ${importedResult.rows[0].id})`
    );
  }

  const updated = await client.query(
    `UPDATE greentarget.invoices
        SET status = 'cancelled', balance_due = 0,
            cancellation_date = NOW(), cancellation_reason = $2
      WHERE invoice_id = $1
      RETURNING *`,
    [target.invoiceId, target.reason]
  );
  // The service cancels the invoice-owned journal when the invoice is cancelled.
  await syncGTSalesJournalEntry(client, updated.rows[0], ACTOR);
  record(
    label,
    "applied",
    `cancelled; journal ${invoice.journal_entry_id} cancelled (duplicates imported journal ${importedResult.rows[0].id})`
  );
}

async function main() {
  const pool = createDatabasePool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "tienhock",
    password: process.env.DB_PASSWORD || "REMOVED_SECRET",
    port: Number(process.env.DB_PORT || 5434),
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");

    for (const target of RESTORE_INVOICES) {
      await restoreSalesJournal(client, target);
    }
    await cancelDuplicateInvoice(client);

    console.table(results);

    if (blocked > 0) {
      await client.query("ROLLBACK");
      console.log(`\nABORTED: ${blocked} blocked action(s); nothing was written.`);
      process.exitCode = 1;
      return;
    }
    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("\nDRY RUN COMPLETE: no database rows were written.");
      return;
    }
    await client.query("COMMIT");
    console.log("\nAPPLIED: all July lifecycle decisions committed.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
