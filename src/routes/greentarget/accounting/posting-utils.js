// src/routes/greentarget/accounting/posting-utils.js
//
// Shared low-level posting helpers for Green Target's organic journal
// services (phase G7). One journal = one balanced header + its lines, posted
// immediately (GT has no draft flow). Cancellation is a status flip, never a
// delete or a reversal journal — same invariant as Tien Hock.
import {
  assertGreenTargetAccountingDateUnlocked,
  toLocalAccountingDateString,
} from "./posting-lock.js";

/**
 * Fail loudly unless every account code exists in GT's own chart. GT never
 * falls back to a control account (no TH-style TR warning): a missing account
 * means the chart and the posting rule disagree, which must abort the
 * transaction, not post somewhere approximate.
 *
 * @param {import("pg").PoolClient} client
 * @param {string[]} accountCodes
 */
export async function ensureGTAccountsExist(client, accountCodes) {
  const uniqueCodes = [...new Set(accountCodes)];
  const result = await client.query(
    "SELECT code FROM greentarget.account_codes WHERE code = ANY($1)",
    [uniqueCodes]
  );
  const existing = new Set(result.rows.map((row) => row.code));
  const missing = uniqueCodes.filter((code) => !existing.has(code));
  if (missing.length > 0) {
    throw new Error(
      `Green Target account code(s) not found: ${missing.join(", ")}`
    );
  }
}

/**
 * GT's ledger print order is (month, posting_sequence, display_order), never
 * the date (handover G4). Organic journals get the next dense sequence within
 * their entry month at posting time; because the legacy import ends in June
 * 2026 and the lock blocks earlier dates, an organic month contains only
 * organic journals and chronological assignment is well-defined.
 *
 * @param {import("pg").PoolClient} client
 * @param {string} entryDate yyyy-MM-dd
 * @returns {Promise<number>}
 */
export async function nextGTPostingSequence(client, entryDate) {
  const result = await client.query(
    `SELECT COALESCE(MAX(posting_sequence), 0) + 1 AS next_seq
       FROM greentarget.journal_entries
      WHERE date_trunc('month', entry_date) = date_trunc('month', $1::date)`,
    [entryDate]
  );
  return result.rows[0].next_seq;
}

/**
 * Insert a posted journal with lines. Validates DR = CR before writing.
 *
 * @param {import("pg").PoolClient} client
 * @param {object} journal
 * @param {string} journal.referenceNo Unique internal reference.
 * @param {string} journal.entryType
 * @param {string} journal.entryDate yyyy-MM-dd
 * @param {string} journal.description
 * @param {string|null} [journal.displayReference]
 * @param {string|null} [journal.sourceType]
 * @param {string|null} [journal.sourceId]
 * @param {string|null} [journal.createdBy]
 * @param {Array<{accountCode: string, debit?: number, credit?: number,
 *   reference?: string|null, particulars?: string|null,
 *   chequeReference?: string|null, displayReference?: string|null}>} journal.lines
 * @returns {Promise<number>} The new journal id.
 */
export async function insertGTJournal(client, journal) {
  const totalDebit = journal.lines.reduce(
    (sum, line) => sum + Number(line.debit || 0),
    0
  );
  const totalCredit = journal.lines.reduce(
    (sum, line) => sum + Number(line.credit || 0),
    0
  );
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Unbalanced Green Target journal ${journal.referenceNo}: DR ${totalDebit.toFixed(
        2
      )} != CR ${totalCredit.toFixed(2)}`
    );
  }

  const postingSequence = await nextGTPostingSequence(client, journal.entryDate);
  const headerResult = await client.query(
    `INSERT INTO greentarget.journal_entries (
       reference_no, entry_type, entry_date, description,
       total_debit, total_credit, status,
       display_reference, posting_sequence, source_type, source_id,
       manual_override, created_by, updated_by, posted_at, posted_by
     ) VALUES ($1,$2,$3,$4,$5,$6,'posted',$7,$8,$9,$10,false,$11,$11,NOW(),$11)
     RETURNING id`,
    [
      journal.referenceNo,
      journal.entryType,
      journal.entryDate,
      journal.description,
      totalDebit.toFixed(2),
      totalCredit.toFixed(2),
      journal.displayReference ?? null,
      postingSequence,
      journal.sourceType ?? null,
      journal.sourceId ?? null,
      journal.createdBy ?? null,
    ]
  );
  const journalId = headerResult.rows[0].id;
  await insertGTJournalLines(client, journalId, journal.lines);
  return journalId;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} journalId
 * @param {Array} lines Same shape as insertGTJournal's lines.
 */
export async function insertGTJournalLines(client, journalId, lines) {
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    await client.query(
      `INSERT INTO greentarget.journal_entry_lines (
         journal_entry_id, line_number, account_code,
         debit_amount, credit_amount, reference, particulars,
         cheque_reference, display_order, display_reference
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        journalId,
        index + 1,
        line.accountCode,
        Number(line.debit || 0).toFixed(2),
        Number(line.credit || 0).toFixed(2),
        line.reference ?? null,
        line.particulars ?? null,
        line.chequeReference ?? null,
        index + 1,
        line.displayReference ?? null,
      ]
    );
  }
}

/**
 * Re-sync helper: rewrite a system-owned journal's header and lines in place
 * (mirrors TH's delete+reinsert re-sync). Keeps reference_no stable unless a
 * new one is supplied; reassigns posting_sequence when the entry month moved.
 *
 * @param {import("pg").PoolClient} client
 * @param {number} journalId
 * @param {object} journal Same fields as insertGTJournal (referenceNo optional).
 */
export async function replaceGTJournal(client, journalId, journal) {
  const totalDebit = journal.lines.reduce(
    (sum, line) => sum + Number(line.debit || 0),
    0
  );
  const totalCredit = journal.lines.reduce(
    (sum, line) => sum + Number(line.credit || 0),
    0
  );
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Unbalanced Green Target journal rewrite ${journal.referenceNo}: DR ${totalDebit.toFixed(
        2
      )} != CR ${totalCredit.toFixed(2)}`
    );
  }

  const existing = await client.query(
    "SELECT reference_no, entry_date, posting_sequence FROM greentarget.journal_entries WHERE id = $1",
    [journalId]
  );
  if (existing.rows.length === 0) {
    throw new Error(`Green Target journal ${journalId} not found for rewrite`);
  }
  const previous = existing.rows[0];
  let postingSequence = previous.posting_sequence;
  const previousMonth = previous.entry_date
    ? toLocalAccountingDateString(previous.entry_date).slice(0, 7)
    : null;
  const nextMonth = journal.entryDate.slice(0, 7);
  if (previousMonth !== nextMonth || postingSequence === null) {
    postingSequence = await nextGTPostingSequence(client, journal.entryDate);
  }

  await client.query(
    `UPDATE greentarget.journal_entries
        SET reference_no = $2, entry_date = $3, description = $4,
            total_debit = $5, total_credit = $6,
            display_reference = $7, posting_sequence = $8, updated_at = NOW()
      WHERE id = $1`,
    [
      journalId,
      journal.referenceNo ?? previous.reference_no,
      journal.entryDate,
      journal.description,
      totalDebit.toFixed(2),
      totalCredit.toFixed(2),
      journal.displayReference ?? null,
      postingSequence,
    ]
  );
  await client.query(
    "DELETE FROM greentarget.journal_entry_lines WHERE journal_entry_id = $1",
    [journalId]
  );
  await insertGTJournalLines(client, journalId, journal.lines);
}

/**
 * Cancel a posted system journal (status flip). Guards: must exist, must be
 * posted, must be one of the expected entry types, and its entry_date must be
 * in the open period.
 *
 * @param {import("pg").PoolClient} client
 * @param {number} journalEntryId
 * @param {object} options
 * @param {string[]} options.entryTypes Allowed entry types (safety rail so a
 *   service can never cancel another service's journal).
 * @param {string} options.operation For the lock error message.
 * @returns {Promise<boolean>} True when a journal was cancelled.
 */
export async function cancelGTJournal(client, journalEntryId, options) {
  const result = await client.query(
    `SELECT id, entry_type, entry_date, status
       FROM greentarget.journal_entries
      WHERE id = $1
      FOR UPDATE`,
    [journalEntryId]
  );
  if (result.rows.length === 0) {
    return false;
  }
  const journal = result.rows[0];
  if (!options.entryTypes.includes(journal.entry_type)) {
    throw new Error(
      `Refusing to cancel Green Target journal ${journalEntryId}: entry_type ${journal.entry_type} is not one of ${options.entryTypes.join(
        ", "
      )}`
    );
  }
  if (journal.status !== "posted") {
    return false;
  }
  assertGreenTargetAccountingDateUnlocked(
    journal.entry_date,
    options.operation
  );
  await client.query(
    "UPDATE greentarget.journal_entries SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
    [journalEntryId]
  );
  return true;
}
