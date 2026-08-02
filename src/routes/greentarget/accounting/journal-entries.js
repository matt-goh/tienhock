// src/routes/greentarget/accounting/journal-entries.js
//
// Green Target Journal routes. Clone of Tien Hock's
// `src/routes/accounting/journal-entries.js`, pointing at the `greentarget`
// schema, with response payloads kept field-for-field compatible so the
// shared Journal pages work unchanged on a base-path swap (handover R7).
//
// G6 shipped the read-only half (GET / and GET /:id). G7 adds the mutation
// half: GET /types, GET /next-reference/:type, POST /, PUT /:id,
// POST /:id/cancel and POST /:id/restore — all behind the R8 posting lock
// (GT's open date is 2026-07-01). GT deliberately has no next-cheque-no /
// cheque-usage / receipt-voucher endpoints (GT cheque references are
// per-LINE and the voucher is TH-only), and no DELETE (GT journals are
// posted-on-create; there is no draft state to delete). GET /:id resolves the
// owning document of an organic journal into a "View Source" link, like Tien
// Hock; imported (legacy_import) journals have no source page.
//
// Editing a system-owned journal (an S/REC/CN/DN/RN type, or any journal
// with a source document) DETACHES it: manual_override is set, the entry
// type is preserved, and the owning service stops re-syncing it — the same
// detach rule as Tien Hock. Imported (IMP) journals stay immutable.
import { Router } from "express";
import {
  assertGreenTargetAccountingDateUnlocked,
  isAccountingPeriodLockedError,
  toLocalAccountingDateString,
} from "./posting-lock.js";
import {
  ensureGTAccountsExist,
  nextGTPostingSequence,
  insertGTJournal,
} from "./posting-utils.js";

const LEGACY_IMPORT_ENTRY_TYPE = "IMP";
// Entry types owned by the operational services; hand-editing one detaches it.
const GT_SYSTEM_ENTRY_TYPES = ["S", "REC", "CN", "DN", "RN"];

const GT_ADJUSTMENT_DOC_TYPE_LABELS = {
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  refund_note: "Refund Note",
};

/**
 * @typedef {Object} GTManualJournalLinePayload
 * @property {string} account_code
 * @property {number|string|null|undefined} debit_amount
 * @property {number|string|null|undefined} credit_amount
 * @property {string|null|undefined} [reference] General line reference.
 * @property {string|null|undefined} [cheque_reference] Per-line cheque or transaction reference.
 * @property {string|null|undefined} [debtor_subledger_code] Logical debtor
 * identity for a CD_SD control-account line.
 * @property {string|null|undefined} [particulars]
 */

/**
 * @typedef {Object} GTManualJournalPayload
 * @property {string} reference_no
 * @property {string} entry_type
 * @property {string} entry_date
 * @property {GTManualJournalLinePayload[]} lines
 */

/**
 * Resolve the document that auto-created an organic GT journal into a display
 * label and frontend path for the Journal Details "View Source" link. Returns
 * null for manual journals, legacy imports, or when the source row is gone.
 *
 * @param {import("pg").Pool} pool
 * @param {{ source_type?: string | null, source_id?: string | null }} entry
 * @returns {Promise<{ type: string, label: string, path: string } | null>}
 */
async function resolveGTJournalSource(pool, entry) {
  const { source_type, source_id } = entry;
  if (!source_type || source_type === "legacy_import" || !source_id) {
    return null;
  }

  switch (source_type) {
    case "invoice": {
      const invoiceResult = await pool.query(
        "SELECT invoice_number FROM greentarget.invoices WHERE invoice_id = $1",
        [source_id]
      );
      if (invoiceResult.rows.length === 0) return null;
      return {
        type: "invoice",
        label: `Invoice ${invoiceResult.rows[0].invoice_number}`,
        path: `/greentarget/invoices/${encodeURIComponent(source_id)}`,
      };
    }
    case "payment": {
      const paymentResult = await pool.query(
        `SELECT p.invoice_id, p.internal_reference, i.invoice_number
           FROM greentarget.payments p
           LEFT JOIN greentarget.invoices i ON i.invoice_id = p.invoice_id
          WHERE p.payment_id = $1`,
        [source_id]
      );
      if (paymentResult.rows.length === 0 || !paymentResult.rows[0].invoice_id)
        return null;
      const payment = paymentResult.rows[0];
      const ref = payment.internal_reference
        ? `${payment.internal_reference} `
        : "";
      return {
        type: "payment",
        label: `Payment ${ref}→ Invoice ${
          payment.invoice_number || payment.invoice_id
        }`,
        path: `/greentarget/invoices/${encodeURIComponent(payment.invoice_id)}`,
      };
    }
    case "receipt": {
      const receiptResult = await pool.query(
        `SELECT display_reference
           FROM greentarget.receipts
          WHERE id = $1`,
        [source_id]
      );
      if (receiptResult.rows.length === 0) return null;
      return {
        type: "receipt",
        label: `Receipt ${receiptResult.rows[0].display_reference}`,
        path: "/greentarget/payments",
      };
    }
    case "adjustment": {
      const docResult = await pool.query(
        "SELECT type FROM greentarget.adjustment_documents WHERE id = $1",
        [source_id]
      );
      if (docResult.rows.length === 0) return null;
      const docLabel =
        GT_ADJUSTMENT_DOC_TYPE_LABELS[docResult.rows[0].type] || "Adjustment";
      return {
        type: "adjustment",
        label: `${docLabel} ${source_id}`,
        path: `/greentarget/adjustment-docs/${encodeURIComponent(source_id)}`,
      };
    }
    default:
      return null;
  }
}

// Imported journals keep their operational IMP type, while source_type is the
// durable provenance marker. Display falls back to legacy_entry_type exactly
// like Tien Hock, so the printed legacy family (RV#/#/#, PBEB#/#, ...) shows.
const LEGACY_IMPORT_SQL =
  "(je.entry_type = 'IMP' OR je.source_type = 'legacy_import')";
const VISIBLE_REFERENCE_SQL = "COALESCE(je.display_reference, je.reference_no)";
const DISPLAY_ENTRY_TYPE_SQL =
  `CASE WHEN ${LEGACY_IMPORT_SQL} ` +
  "THEN COALESCE(je.legacy_entry_type, je.entry_type) " +
  "ELSE je.entry_type END";

/**
 * @param {import("pg").Pool} pool
 * @returns {import("express").Router}
 */
export default function createGreenTargetJournalEntriesRouter(pool) {
  const router = Router();

  // GET / - Journal entries with filters. Envelope and row shape mirror Tien
  // Hock's list exactly (minus cheque_duplicate_count: GT cheque_no is always
  // NULL, so the re-use scan has nothing to count).
  router.get("/", async (req, res) => {
    try {
      const {
        start_date,
        end_date,
        entry_type,
        status,
        search,
        limit = 50,
        offset = 0,
      } = req.query;

      let query = `
        SELECT
          je.id,
          ${VISIBLE_REFERENCE_SQL} AS reference_no,
          je.reference_no AS internal_reference_no,
          je.entry_type,
          ${DISPLAY_ENTRY_TYPE_SQL} AS display_entry_type,
          je.legacy_entry_type,
          ${LEGACY_IMPORT_SQL} AS is_legacy_import,
          je.display_reference,
          je.source_type,
          je.entry_date,
          je.description, je.total_debit, je.total_credit, je.status,
          je.cheque_no, je.created_at, je.updated_at, je.posted_at,
          jet.name as entry_type_name
        FROM greentarget.journal_entries je
        LEFT JOIN greentarget.journal_entry_types jet ON ${DISPLAY_ENTRY_TYPE_SQL} = jet.code
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (start_date) {
        query += ` AND je.entry_date >= $${paramIndex}`;
        params.push(start_date);
        paramIndex++;
      }

      if (end_date) {
        query += ` AND je.entry_date <= $${paramIndex}`;
        params.push(end_date);
        paramIndex++;
      }

      if (entry_type) {
        // Supports a single value or a comma-separated list (multi-toggle pills)
        const types = String(entry_type)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (types.length > 0) {
          query += ` AND ${DISPLAY_ENTRY_TYPE_SQL} = ANY($${paramIndex})`;
          params.push(types);
          paramIndex++;
        }
      }

      if (status) {
        // Supports a single value or a comma-separated list (multi-toggle pills)
        const statuses = String(status)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (statuses.length > 0) {
          query += ` AND je.status = ANY($${paramIndex})`;
          params.push(statuses);
          paramIndex++;
        }
      }

      if (search) {
        query += ` AND (
          ${VISIBLE_REFERENCE_SQL} ILIKE $${paramIndex}
          OR je.reference_no ILIKE $${paramIndex}
          OR je.description ILIKE $${paramIndex}
          OR (${LEGACY_IMPORT_SQL} AND ${DISPLAY_ENTRY_TYPE_SQL} ILIKE $${paramIndex})
          OR (${LEGACY_IMPORT_SQL} AND jet.name ILIKE $${paramIndex})
          OR EXISTS (
            SELECT 1 FROM greentarget.journal_entry_lines jel
            WHERE jel.journal_entry_id = je.id
              AND (jel.particulars ILIKE $${paramIndex}
                OR jel.account_code ILIKE $${paramIndex}
                OR jel.cheque_reference ILIKE $${paramIndex})
          )
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Get total count
      const countQuery = query.replace(
        /SELECT[\s\S]*?FROM/,
        "SELECT COUNT(*) as total FROM"
      );
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Add ordering and pagination (same as Tien Hock: newest date first)
      query += ` ORDER BY je.entry_date DESC, ${VISIBLE_REFERENCE_SQL} DESC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, params);

      res.json({
        entries: result.rows,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (error) {
      console.error("Error fetching Green Target journal entries:", error);
      res.status(500).json({
        message: "Error fetching Green Target journal entries",
        error: error.message,
      });
    }
  });

  // GET /types - Journal entry types (mirrors TH: all active types; the form
  // filters IMP client-side).
  router.get("/types", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT code, name, description, is_active
           FROM greentarget.journal_entry_types
          WHERE is_active = true
          ORDER BY code`
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target journal entry types:", error);
      res.status(500).json({
        message: "Error fetching Green Target journal entry types",
        error: error.message,
      });
    }
  });

  // GET /next-reference/:type - Next reference for a manual entry. GT's
  // organic system journals own their natural keys (invoice number,
  // GTR-{receipt_id}, doc id), so this sequence only serves hand-keyed
  // journals; the shape mirrors TH's PREFIXnnn/MM algorithm.
  router.get("/next-reference/:type", async (req, res) => {
    try {
      const { type } = req.params;
      if (type === LEGACY_IMPORT_ENTRY_TYPE) {
        return res.status(400).json({
          message:
            "IMP reference numbers are generated only by the legacy import migration",
        });
      }

      const currentMonth = new Date().getMonth() + 1;
      const prefixMap = {
        S: "SLE",
        REC: "REC",
        CN: "CRN",
        DN: "DRN",
        RN: "RFN",
        JV: "JV",
        C: "PCE",
        B: "PBE",
        J: "JNL",
      };
      const prefix = prefixMap[type] || "JV";
      const pattern = `${prefix}%/${String(currentMonth).padStart(2, "0")}`;

      const result = await pool.query(
        `SELECT reference_no
           FROM greentarget.journal_entries
          WHERE reference_no LIKE $1
          ORDER BY reference_no DESC
          LIMIT 1`,
        [pattern]
      );

      let nextNumber = 1;
      if (result.rows.length > 0) {
        const lastRef = result.rows[0].reference_no;
        const match = lastRef.match(/^[A-Z]+(\d+)\//);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const nextReference = `${prefix}${String(nextNumber).padStart(
        3,
        "0"
      )}/${String(currentMonth).padStart(2, "0")}`;
      res.json({ reference_no: nextReference });
    } catch (error) {
      console.error("Error generating Green Target next reference:", error);
      res.status(500).json({
        message: "Error generating next reference",
        error: error.message,
      });
    }
  });

  // GET /:id - Single journal entry with its lines. `source` deep-links an
  // organic journal back to its owning invoice/payment/adjustment page
  // (null for manual journals and legacy imports).
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      // Get entry header
      const entryQuery = `
        SELECT
          je.id,
          ${VISIBLE_REFERENCE_SQL} AS reference_no,
          je.reference_no AS internal_reference_no,
          je.entry_type,
          ${DISPLAY_ENTRY_TYPE_SQL} AS display_entry_type,
          je.legacy_entry_type,
          ${LEGACY_IMPORT_SQL} AS is_legacy_import,
          je.display_reference,
          je.source_type,
          je.source_id,
          je.manual_override,
          je.entry_date,
          je.description, je.total_debit, je.total_credit, je.status,
          je.cheque_no, je.created_at, je.updated_at, je.posted_at,
          je.created_by, je.updated_by, je.posted_by,
          jet.name as entry_type_name
        FROM greentarget.journal_entries je
        LEFT JOIN greentarget.journal_entry_types jet ON ${DISPLAY_ENTRY_TYPE_SQL} = jet.code
        WHERE je.id = $1
      `;
      const entryResult = await pool.query(entryQuery, [id]);

      if (entryResult.rows.length === 0) {
        return res.status(404).json({ message: "Journal entry not found" });
      }

      // Get entry lines (per-line display reference resolution like Tien Hock)
      const linesQuery = `
        SELECT
          jel.id, jel.line_number, jel.account_code, jel.debit_amount,
          jel.credit_amount,
          COALESCE(jel.display_reference, je.display_reference, jel.reference) AS reference,
          jel.reference AS internal_reference,
          jel.display_reference,
          jel.particulars,
          jel.cheque_reference,
          jel.display_order,
          jel.debtor_subledger_code,
          registry.description AS debtor_subledger_description,
          ac.description as account_description
        FROM greentarget.journal_entry_lines jel
        JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
        LEFT JOIN greentarget.account_codes ac ON jel.account_code = ac.code
        LEFT JOIN greentarget.debtor_subledger_registry registry
          ON registry.code = jel.debtor_subledger_code
        WHERE jel.journal_entry_id = $1
        ORDER BY jel.line_number
      `;
      const linesResult = await pool.query(linesQuery, [id]);

      const source = await resolveGTJournalSource(pool, entryResult.rows[0]);

      res.json({
        ...entryResult.rows[0],
        lines: linesResult.rows,
        source,
      });
    } catch (error) {
      console.error("Error fetching Green Target journal entry:", error);
      res.status(500).json({
        message: "Error fetching Green Target journal entry",
        error: error.message,
      });
    }
  });

  // ==================== MUTATIONS (G7, all behind the R8 posting lock) ====

  const handleAccountingPeriodLock = (error, res) => {
    if (isAccountingPeriodLockedError(error)) {
      res.status(409).json({ code: error.code, message: error.message });
      return true;
    }
    return false;
  };

  /**
   * @param {GTManualJournalPayload} body
   * @param {import("express").Response} res
   * @returns {GTManualJournalPayload | null}
   */
  const validateJournalPayload = (body, res) => {
    const { reference_no, entry_type, entry_date, lines } = body;
    if (entry_type === LEGACY_IMPORT_ENTRY_TYPE) {
      res.status(400).json({
        message:
          "IMP journal entries can only be created by the legacy import migration",
      });
      return null;
    }
    if (!reference_no || !entry_type || !entry_date) {
      res
        .status(400)
        .json({ message: "Reference number, entry type, and date are required" });
      return null;
    }
    if (!Array.isArray(lines) || lines.length < 2) {
      res.status(400).json({ message: "At least two line items are required" });
      return null;
    }
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      const debit = parseFloat(line.debit_amount) || 0;
      const credit = parseFloat(line.credit_amount) || 0;
      if (debit > 0 && credit > 0) {
        res.status(400).json({
          message: "Each line must be either a debit or a credit, not both",
        });
        return null;
      }
      if (debit === 0 && credit === 0) {
        res.status(400).json({
          message: "Each line item must have either a debit or credit amount",
        });
        return null;
      }
      if (!line.account_code) {
        res
          .status(400)
          .json({ message: "Each line item must have an account code" });
        return null;
      }
      totalDebit += debit;
      totalCredit += credit;
    }
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      res.status(400).json({
        message: `Total debits (${totalDebit.toFixed(
          2
        )}) must equal total credits (${totalCredit.toFixed(2)})`,
      });
      return null;
    }
    return { reference_no, entry_type, entry_date, lines };
  };

  /**
   * @param {import("pg").PoolClient} client
   * @param {GTManualJournalLinePayload[]} lines
   * @param {string} entryDate
   * @returns {Promise<void>}
   */
  const validateDebtorSubledgerLines = async (client, lines, entryDate) => {
    const requestedCodes = [
      ...new Set(
        lines
          .map((line) => String(line.debtor_subledger_code || "").trim())
          .filter(Boolean)
      ),
    ];
    const registryResult = requestedCodes.length
      ? await client.query(
          `SELECT code, control_account_code, effective_from, effective_to,
                  is_active, is_selectable
             FROM greentarget.debtor_subledger_registry
            WHERE code = ANY($1)
            FOR SHARE`,
          [requestedCodes]
        )
      : { rows: [] };
    const registryByCode = new Map(
      registryResult.rows.map((row) => [row.code, row])
    );

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const accountCode = String(line.account_code || "").trim();
      const debtorCode = String(line.debtor_subledger_code || "").trim();
      if (accountCode === "CD_SD" && !debtorCode) {
        throw Object.assign(
          new Error(
            `Line ${index + 1}: select the CD/SD debtor identity represented by this CD_SD movement`
          ),
          { statusCode: 400 }
        );
      }
      if (!debtorCode) continue;
      const registry = registryByCode.get(debtorCode);
      if (!registry) {
        throw Object.assign(
          new Error(`Line ${index + 1}: debtor identity ${debtorCode} does not exist`),
          { statusCode: 400 }
        );
      }
      if (
        registry.is_active !== true ||
        registry.is_selectable !== true ||
        registry.control_account_code !== accountCode
      ) {
        throw Object.assign(
          new Error(
            `Line ${index + 1}: debtor identity ${debtorCode} does not post to ${accountCode}`
          ),
          { statusCode: 400 }
        );
      }
      const effectiveFrom = toLocalAccountingDateString(
        registry.effective_from
      );
      const effectiveTo = registry.effective_to
        ? toLocalAccountingDateString(registry.effective_to)
        : null;
      if (
        entryDate < effectiveFrom ||
        (effectiveTo !== null && entryDate >= effectiveTo)
      ) {
        throw Object.assign(
          new Error(
            `Line ${index + 1}: debtor identity ${debtorCode} is not effective on ${entryDate}`
          ),
          { statusCode: 400 }
        );
      }
    }
  };

  // POST / - Create a manual journal entry (posted immediately).
  router.post("/", async (req, res) => {
    const payload = validateJournalPayload(req.body, res);
    if (!payload) return;
    const { reference_no, entry_type, entry_date, lines } = payload;
    const description = req.body.description;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Manual entries post immediately, so a backdated one would write
      // straight into the imported history the lock protects.
      const entryDate = assertGreenTargetAccountingDateUnlocked(
        entry_date,
        `Journal entry ${reference_no}`
      );

      const typeCheck = await client.query(
        "SELECT 1 FROM greentarget.journal_entry_types WHERE code = $1 AND is_active = true",
        [entry_type]
      );
      if (typeCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: `Unknown journal entry type '${entry_type}'` });
      }

      const duplicateCheck = await client.query(
        "SELECT 1 FROM greentarget.journal_entries WHERE reference_no = $1",
        [reference_no]
      );
      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Reference number '${reference_no}' already exists`,
        });
      }

      await ensureGTAccountsExist(
        client,
        lines.map((line) => line.account_code)
      );
      await validateDebtorSubledgerLines(client, lines, entryDate);

      const journalId = await insertGTJournal(client, {
        referenceNo: reference_no.trim(),
        entryType: entry_type,
        entryDate,
        description: description?.trim() || null,
        createdBy: req.staffId || null,
        lines: lines.map((line) => ({
          accountCode: line.account_code,
          debit: parseFloat(line.debit_amount) || 0,
          credit: parseFloat(line.credit_amount) || 0,
          reference: line.reference || null,
          chequeReference: line.cheque_reference || null,
          debtorSubledgerCode: line.debtor_subledger_code || null,
          particulars: line.particulars || null,
        })),
      });

      await client.query("COMMIT");

      res.status(201).json({
        message: "Journal entry created successfully",
        entry: { id: journalId, reference_no },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error creating Green Target journal entry:", error);
      res.status(error.statusCode || error.status || 500).json({
        message: "Error creating Green Target journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // PUT /:id - Update a journal entry. System-owned journals (an S/REC/CN/DN/
  // RN type, or any journal with a source document) DETACH on edit:
  // manual_override is set, the entry type is preserved, and the owning
  // service stops re-syncing it. IMP journals stay immutable.
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const payload = validateJournalPayload(req.body, res);
    if (!payload) return;
    const { reference_no, entry_type, entry_date, lines } = payload;
    const description = req.body.description;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        "SELECT * FROM greentarget.journal_entries WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }
      const existing = existingResult.rows[0];

      if (
        existing.entry_type === LEGACY_IMPORT_ENTRY_TYPE ||
        existing.source_type === "legacy_import"
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Imported legacy journals are immutable evidence and cannot be edited",
        });
      }
      if (existing.status === "cancelled") {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "Cannot edit a cancelled journal entry" });
      }

      const entryDate = assertGreenTargetAccountingDateUnlocked(
        entry_date,
        `Journal entry ${reference_no}`
      );

      const duplicateCheck = await client.query(
        "SELECT 1 FROM greentarget.journal_entries WHERE reference_no = $1 AND id != $2",
        [reference_no, id]
      );
      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Reference number '${reference_no}' already exists`,
        });
      }

      await ensureGTAccountsExist(
        client,
        lines.map((line) => line.account_code)
      );
      await validateDebtorSubledgerLines(client, lines, entryDate);

      const isSystemOwned =
        existing.source_type !== null ||
        GT_SYSTEM_ENTRY_TYPES.includes(existing.entry_type);
      const finalEntryType = isSystemOwned ? existing.entry_type : entry_type;

      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of lines) {
        totalDebit += parseFloat(line.debit_amount) || 0;
        totalCredit += parseFloat(line.credit_amount) || 0;
      }

      // Keep the within-month print sequence unless the entry moved months.
      const previousMonth = toLocalAccountingDateString(
        existing.entry_date
      ).slice(0, 7);
      const nextMonth = entryDate.slice(0, 7);
      const postingSequence =
        previousMonth !== nextMonth
          ? await nextGTPostingSequence(client, entryDate)
          : existing.posting_sequence;

      await client.query(
        `UPDATE greentarget.journal_entries
            SET reference_no = $2, entry_type = $3, entry_date = $4,
                description = $5, total_debit = $6, total_credit = $7,
                posting_sequence = $8, manual_override = $9,
                updated_at = NOW(), updated_by = $10
          WHERE id = $1`,
        [
          id,
          reference_no.trim(),
          finalEntryType,
          entryDate,
          description?.trim() || null,
          totalDebit.toFixed(2),
          totalCredit.toFixed(2),
          postingSequence,
          isSystemOwned ? true : existing.manual_override,
          req.staffId || null,
        ]
      );

      await client.query(
        "DELETE FROM greentarget.journal_entry_lines WHERE journal_entry_id = $1",
        [id]
      );
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        await client.query(
          `INSERT INTO greentarget.journal_entry_lines (
             journal_entry_id, line_number, account_code,
             debit_amount, credit_amount, reference, particulars,
             cheque_reference, display_order, debtor_subledger_code
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id,
            index + 1,
            line.account_code,
            (parseFloat(line.debit_amount) || 0).toFixed(2),
            (parseFloat(line.credit_amount) || 0).toFixed(2),
            line.reference || null,
            line.particulars || null,
            line.cheque_reference || null,
            index + 1,
            line.debtor_subledger_code || null,
          ]
        );
      }

      await client.query("COMMIT");

      res.json({
        message: isSystemOwned
          ? "Journal entry updated and detached from its source document"
          : "Journal entry updated successfully",
        entry: { id: Number(id), reference_no },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error updating Green Target journal entry:", error);
      res.status(error.statusCode || error.status || 500).json({
        message: "Error updating Green Target journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // POST /:id/cancel - Cancel a journal entry (status flip, never a delete).
  router.post("/:id/cancel", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        "SELECT * FROM greentarget.journal_entries WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }
      const existing = existingResult.rows[0];

      if (
        existing.entry_type === LEGACY_IMPORT_ENTRY_TYPE ||
        existing.source_type === "legacy_import"
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Imported legacy journals are immutable evidence and cannot be cancelled",
        });
      }
      if (existing.status === "cancelled") {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "Journal entry is already cancelled" });
      }
      if (existing.source_type !== null) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `This journal is owned by a ${existing.source_type} document. Cancel the source document or receipt instead so its operational balance and journal remain in sync.`,
          detail: `source_type: ${existing.source_type}, source_id: ${existing.source_id}`,
        });
      }

      assertGreenTargetAccountingDateUnlocked(
        existing.entry_date,
        `Journal entry ${existing.reference_no} cancellation`
      );

      await client.query(
        "UPDATE greentarget.journal_entries SET status = 'cancelled', updated_at = NOW(), updated_by = $2 WHERE id = $1",
        [id, req.staffId || null]
      );

      await client.query("COMMIT");
      res.json({ message: "Journal entry cancelled successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error cancelling Green Target journal entry:", error);
      res.status(500).json({
        message: "Error cancelling Green Target journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // POST /:id/restore - Undo a cancellation. A journal cancelled BY its source
  // document (invoice/payment/adjustment) stays cancelled with that document:
  // GT sources cannot be un-cancelled, so restoring would orphan the journal.
  router.post("/:id/restore", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        "SELECT * FROM greentarget.journal_entries WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }
      const existing = existingResult.rows[0];

      if (
        existing.entry_type === LEGACY_IMPORT_ENTRY_TYPE ||
        existing.source_type === "legacy_import"
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Imported legacy journals are immutable evidence and cannot be restored",
        });
      }
      if (existing.status !== "cancelled") {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "Journal entry is not cancelled" });
      }
      if (existing.source_type !== null) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `This journal is owned by a ${existing.source_type} document and was cancelled with it. Green Target source documents cannot be un-cancelled, so the journal stays cancelled.`,
          detail: `source_type: ${existing.source_type}, source_id: ${existing.source_id}`,
        });
      }

      assertGreenTargetAccountingDateUnlocked(
        existing.entry_date,
        `Journal entry ${existing.reference_no} restore`
      );

      const restoreLinesResult = await client.query(
        `SELECT account_code, debit_amount, credit_amount,
                reference, cheque_reference, particulars,
                debtor_subledger_code
           FROM greentarget.journal_entry_lines
          WHERE journal_entry_id = $1
          ORDER BY line_number`,
        [id]
      );
      await validateDebtorSubledgerLines(
        client,
        restoreLinesResult.rows,
        toLocalAccountingDateString(existing.entry_date)
      );

      await client.query(
        "UPDATE greentarget.journal_entries SET status = 'posted', updated_at = NOW(), updated_by = $2 WHERE id = $1",
        [id, req.staffId || null]
      );

      await client.query("COMMIT");
      res.json({ message: "Journal entry restored successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error restoring Green Target journal entry:", error);
      res.status(error.statusCode || 500).json({
        message: "Error restoring Green Target journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
