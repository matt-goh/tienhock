// src/routes/accounting/journal-entries.js
import { Router } from "express";
import {
  assertTienHockAccountingDateUnlocked,
  isAccountingPeriodLockedError,
} from "./posting-lock.js";

const LEGACY_IMPORT_ENTRY_TYPE = "IMP";
const LEGACY_IMPORT_SOURCE_TYPE = "legacy_import";
// Entry types that carry a cheque number: Cash Payment (C) and Bank Payment (B)
const CHEQUE_NO_ENTRY_TYPES = ["C", "B"];
// Only Cash Payment (C) draws on the physical cheque book; Bank Payment (B)
// keys the bank's transaction id into the same column.
const PHYSICAL_CHEQUE_ENTRY_TYPE = "C";

const LEGACY_IMPORT_SQL =
  `(je.entry_type = '${LEGACY_IMPORT_ENTRY_TYPE}' OR ` +
  `je.source_type = '${LEGACY_IMPORT_SOURCE_TYPE}')`;
// Every journal type may carry a repeatable auditor-facing display_reference
// (legacy imports, bank-in RVs, receipts keyed with the real payment reference
// like T130726, adjustment doc numbers, ...). reference_no stays the hidden
// unique internal tracking id (IMP-… / BI-… / REC-…).
const VISIBLE_REFERENCE_SQL = "COALESCE(je.display_reference, je.reference_no)";
const DISPLAY_ENTRY_TYPE_SQL =
  `CASE WHEN ${LEGACY_IMPORT_SQL} ` +
  "THEN COALESCE(je.legacy_entry_type, je.entry_type) " +
  "ELSE je.entry_type END";

// A cheque number is only tracked for re-use when it is a full instrument
// reference: a physical cheque (PBB350779) or a bank transaction id
// (PBE2607170362129269). Shorter values are the bare "PBE" prefill or the
// June 2026 shorthand batch (PBE26060, keyed once as a batch marker across 23
// payments with the real reference in each description), so they are ignored
// rather than flagging 60 historical entries that were never actually re-used.
const MIN_TRACKED_CHEQUE_LENGTH = 9;
const TRACKED_CHEQUE_SQL =
  `je.cheque_no IS NOT NULL AND ` +
  `LENGTH(TRIM(je.cheque_no)) >= ${MIN_TRACKED_CHEQUE_LENGTH}`;
// Journals sharing one cheque number, joined so the list can flag re-use
// without a subquery in the SELECT list (the count query rewrites that list).
const CHEQUE_DUPLICATE_JOIN_SQL = `
        LEFT JOIN (
          SELECT UPPER(TRIM(je.cheque_no)) AS cheque_key, COUNT(*) - 1 AS other_count
          FROM journal_entries je
          WHERE ${TRACKED_CHEQUE_SQL}
          GROUP BY 1
          HAVING COUNT(*) > 1
        ) chq ON chq.cheque_key = UPPER(TRIM(je.cheque_no))`;

/**
 * Normalise a cheque number for re-use matching, or return null when it is
 * blank or too short to be a real instrument reference.
 *
 * @param {string | null | undefined} chequeNo
 * @returns {string | null}
 */
function normaliseChequeNo(chequeNo) {
  const trimmed = String(chequeNo ?? "").trim().toUpperCase();
  return trimmed.length >= MIN_TRACKED_CHEQUE_LENGTH ? trimmed : null;
}

/**
 * Other Cash Payment (C) / Bank Payment (B) journals already carrying this
 * cheque number — the legacy programme's "CHEQUE … ALREADY ISSUED ON …" check.
 * Cancelled journals are included and carry their status, so a cheque that was
 * legitimately voided and re-issued reads as such instead of as a clash.
 *
 * @param {import("pg").Pool} pool
 * @param {string | null | undefined} chequeNo
 * @param {number | null} excludeId Journal being viewed/edited, excluded from its own match
 * @returns {Promise<Array<object>>}
 */
async function fetchChequeDuplicates(pool, chequeNo, excludeId) {
  const chequeKey = normaliseChequeNo(chequeNo);
  if (!chequeKey) return [];

  const result = await pool.query(
    `SELECT
       je.id,
       ${VISIBLE_REFERENCE_SQL} AS reference_no,
       ${DISPLAY_ENTRY_TYPE_SQL} AS entry_type,
       je.entry_date,
       je.description,
       je.status,
       je.cheque_no
     FROM journal_entries je
     WHERE UPPER(TRIM(je.cheque_no)) = $1
       AND ($2::integer IS NULL OR je.id <> $2::integer)
     ORDER BY je.entry_date, ${VISIBLE_REFERENCE_SQL}`,
    [chequeKey, excludeId ?? null]
  );
  return result.rows;
}

/**
 * Imported journals keep their operational IMP type, while source_type is the
 * durable provenance marker after the legacy presentation migration. Accept
 * either marker so entries remain immutable during a rolling deployment.
 *
 * @param {{ entry_type?: string | null, source_type?: string | null }} entry
 * @returns {boolean}
 */
function isLegacyImportEntry(entry) {
  return (
    entry.entry_type === LEGACY_IMPORT_ENTRY_TYPE ||
    entry.source_type === LEGACY_IMPORT_SOURCE_TYPE
  );
}

/**
 * Translate an accounting-period-lock failure into its API response so every
 * mutation reports the locked period identically.
 *
 * @param {unknown} error
 * @param {import("express").Response} res
 * @returns {boolean} true when the error was handled
 */
function handleAccountingPeriodLock(error, res) {
  if (!isAccountingPeriodLockedError(error)) return false;
  res.status(error.status).json({ code: error.code, message: error.message });
  return true;
}

const ADJUSTMENT_DOC_TYPE_LABELS = {
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  refund_note: "Refund Note",
};

// Every document that owns a journal links back through its own
// journal_entry_id, so one reverse lookup answers both questions a restore
// asks: is this journal still owned, and does that owner still WANT a live
// journal? A cancelled owner cancelled this journal as part of its own
// lifecycle, and a foreign self-billed purchase never posts a GP journal at all
// (decision 21 Jul 2026) — in both cases the cancellation was deliberate and
// must not be undone from the Journal page.
const JOURNAL_OWNER_LOOKUP_SQL = `
  SELECT 'invoice' AS owner_type, id AS owner_ref,
         invoice_status IS DISTINCT FROM 'cancelled' AS owner_wants_journal
    FROM invoices WHERE journal_entry_id = $1
  UNION ALL
  SELECT 'receipt', id::text, status IS DISTINCT FROM 'cancelled'
    FROM receipts WHERE journal_entry_id = $1
  UNION ALL
  SELECT 'payment', payment_id::text, status IS DISTINCT FROM 'cancelled'
    FROM payments WHERE journal_entry_id = $1
  UNION ALL
  SELECT 'bank-in', id::text, status IS DISTINCT FROM 'cancelled'
    FROM bank_ins WHERE journal_entry_id = $1
  UNION ALL
  SELECT 'RV', rv_number, status IS DISTINCT FROM 'cancelled'
    FROM rv_registry WHERE journal_entry_id = $1
  UNION ALL
  SELECT 'adjustment document', display_id, status IS DISTINCT FROM 'cancelled'
    FROM adjustment_documents WHERE journal_entry_id = $1
  UNION ALL
  SELECT 'Jelly Polly adjustment document', display_id,
         status IS DISTINCT FROM 'cancelled'
    FROM jellypolly.adjustment_documents WHERE journal_entry_id = $1
  UNION ALL
  SELECT 'purchase', self_billed_no,
         invoice_status IS DISTINCT FROM 'cancelled'
         AND purchase_kind = 'local'
    FROM self_billed_invoices WHERE journal_entry_id = $1
  UNION ALL
  SELECT 'supplier payment', COALESCE(internal_reference, payment_id::text),
         status IS DISTINCT FROM 'cancelled'
    FROM supplier_payments WHERE journal_entry_id = $1
  UNION ALL
  SELECT 'purchase invoice', invoice_number, TRUE
    FROM purchase_invoices WHERE journal_entry_id = $1
`;

/**
 * Resolve the document that auto-created a journal entry into a display label
 * and frontend path for the Journal Details "View Source" link. Returns null
 * for manual journals, legacy imports, or when the source row no longer exists.
 *
 * @param {import("pg").Pool} pool
 * @param {{ id: number, source_type?: string | null, source_id?: string | null }} entry
 * @returns {Promise<{ type: string, label: string, path: string } | null>}
 */
async function resolveJournalSource(pool, entry) {
  const { id, source_type, source_id } = entry;

  if (source_type && source_type !== LEGACY_IMPORT_SOURCE_TYPE && source_id) {
    switch (source_type) {
      case "invoice":
        return {
          type: "invoice",
          label: `Invoice ${source_id}`,
          path: `/sales/invoice/${encodeURIComponent(source_id)}`,
        };
      case "adjustment":
      case "jp_adjustment": {
        const isJp = source_type === "jp_adjustment";
        const table = isJp
          ? "jellypolly.adjustment_documents"
          : "adjustment_documents";
        const basePath = isJp
          ? "/jellypolly/sales/adjustment-docs"
          : "/sales/adjustment-docs";
        const docResult = await pool.query(
          `SELECT display_id, type FROM ${table} WHERE id = $1`,
          [source_id]
        );
        if (docResult.rows.length === 0) return null;
        const doc = docResult.rows[0];
        const docLabel = ADJUSTMENT_DOC_TYPE_LABELS[doc.type] || "Adjustment";
        return {
          type: source_type,
          label: `${docLabel} ${doc.display_id || source_id}`,
          path: `${basePath}/${encodeURIComponent(source_id)}`,
        };
      }
      case "receipt": {
        const receiptResult = await pool.query(
          "SELECT display_reference FROM receipts WHERE id = $1::int",
          [source_id]
        );
        if (receiptResult.rows.length === 0) return null;
        const ref = receiptResult.rows[0].display_reference || source_id;
        return {
          type: "receipt",
          label: `Receipt ${ref}`,
          path: `/sales/payments?receipt=${encodeURIComponent(source_id)}`,
        };
      }
      case "bank_in": {
        const bankInResult = await pool.query(
          `SELECT r.rv_number
             FROM bank_ins bi
             JOIN rv_registry r ON r.id = bi.rv_registry_id
            WHERE bi.id = $1::int`,
          [source_id]
        );
        if (bankInResult.rows.length === 0) return null;
        return {
          type: "bank_in",
          label: `Bank-In ${bankInResult.rows[0].rv_number}`,
          path: "/accounting/bank-in",
        };
      }
      case "payment": {
        const paymentResult = await pool.query(
          "SELECT invoice_id, internal_reference FROM payments WHERE payment_id = $1::int",
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
          label: `Payment ${ref}→ Invoice ${payment.invoice_id}`,
          path: `/sales/invoice/${encodeURIComponent(payment.invoice_id)}`,
        };
      }
      default:
        return null;
    }
  }

  // Reverse lookups: sources that only link back via their journal_entry_id FK.
  const gpResult = await pool.query(
    `SELECT id, self_billed_no, purchase_kind
       FROM self_billed_invoices
      WHERE journal_entry_id = $1`,
    [id]
  );
  if (gpResult.rows.length > 0) {
    const gp = gpResult.rows[0];
    const basePath =
      gp.purchase_kind === "local"
        ? "/stock/general-purchases/local"
        : "/stock/general-purchases";
    return {
      type: "self_billed_invoice",
      label: `Purchase ${gp.self_billed_no}`,
      path: `${basePath}/${gp.id}`,
    };
  }

  const spResult = await pool.query(
    `SELECT payment_id, internal_reference
       FROM supplier_payments
      WHERE journal_entry_id = $1`,
    [id]
  );
  if (spResult.rows.length > 0) {
    const sp = spResult.rows[0];
    return {
      type: "supplier_payment",
      label: `Supplier Payment ${sp.internal_reference || sp.payment_id}`,
      path: `/accounting/supplier-payments/${sp.payment_id}`,
    };
  }

  // Legacy pre-cutover payments own their REC journal via journal_entry_id.
  const legacyPaymentResult = await pool.query(
    `SELECT invoice_id FROM payments
      WHERE journal_entry_id = $1 AND invoice_id IS NOT NULL`,
    [id]
  );
  if (legacyPaymentResult.rows.length > 0) {
    const invoiceId = legacyPaymentResult.rows[0].invoice_id;
    return {
      type: "payment",
      label: `Payment → Invoice ${invoiceId}`,
      path: `/sales/invoice/${encodeURIComponent(invoiceId)}`,
    };
  }

  // Manual/drawing RV journals reserved a number in the RV registry.
  const rvResult = await pool.query(
    "SELECT rv_number FROM rv_registry WHERE journal_entry_id = $1",
    [id]
  );
  if (rvResult.rows.length > 0) {
    return {
      type: "bank_in",
      label: `Bank-In ${rvResult.rows[0].rv_number}`,
      path: "/accounting/bank-in",
    };
  }

  return null;
}

export default function (pool) {
  const router = Router();

  // ==================== JOURNAL ENTRY TYPES ====================

  // GET /types - Get all journal entry types
  router.get("/types", async (req, res) => {
    try {
      const query = `
        SELECT code, name, description, is_active
        FROM journal_entry_types
        WHERE is_active = true
        ORDER BY code
      `;
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching journal entry types:", error);
      res.status(500).json({
        message: "Error fetching journal entry types",
        error: error.message,
      });
    }
  });

  // ==================== JOURNAL ENTRIES ====================

  // GET / - Get all journal entries with filters
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
          COALESCE(chq.other_count, 0) AS cheque_duplicate_count,
          jet.name as entry_type_name
        FROM journal_entries je
        LEFT JOIN journal_entry_types jet ON ${DISPLAY_ENTRY_TYPE_SQL} = jet.code${CHEQUE_DUPLICATE_JOIN_SQL}
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

      // Add ordering and pagination
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
      console.error("Error fetching journal entries:", error);
      res.status(500).json({
        message: "Error fetching journal entries",
        error: error.message,
      });
    }
  });

  // GET /next-reference/:type - Get next reference number for entry type
  router.get("/next-reference/:type", async (req, res) => {
    try {
      const { type } = req.params;
      if (type === LEGACY_IMPORT_ENTRY_TYPE) {
        return res.status(400).json({
          message: "IMP reference numbers are generated only by the legacy import migration",
        });
      }

      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();

      // Get the prefix based on entry type
      const prefixMap = {
        B: "PBE", // Payment Bank Entry
        C: "PCE", // Payment Cash Entry
        I: "INV", // Invoice
        S: "SLE", // Sales Entry
        J: "JNL", // Journal
        R: "REC", // Receipt
        DR: "DRN", // Debit Note
        CR: "CRN", // Credit Note
        O: "OPB", // Opening Balance
      };

      const prefix = prefixMap[type] || "JNL";
      const pattern = `${prefix}%/${String(currentMonth).padStart(2, "0")}`;

      const query = `
        SELECT reference_no
        FROM journal_entries
        WHERE reference_no LIKE $1
        ORDER BY reference_no DESC
        LIMIT 1
      `;

      const result = await pool.query(query, [pattern]);

      let nextNumber = 1;
      if (result.rows.length > 0) {
        // Extract number from reference like "PBE001/06"
        const lastRef = result.rows[0].reference_no;
        const match = lastRef.match(/^[A-Z]+(\d+)\//);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const nextReference = `${prefix}${String(nextNumber).padStart(3, "0")}/${String(currentMonth).padStart(2, "0")}`;

      res.json({ reference_no: nextReference });
    } catch (error) {
      console.error("Error generating next reference:", error);
      res.status(500).json({
        message: "Error generating next reference",
        error: error.message,
      });
    }
  });

  // GET /next-cheque-no - Get next sequential cheque number (for Cash Payment / C entries)
  // Cheque numbers are a continuous physical cheque-book sequence (e.g. PBB350779 -> PBB350780),
  // independent of month/reference. Returns the seed PBB350779 when none exist yet.
  // Scoped to Cash Payment (C) entries: Bank Payment (B) entries store bank
  // transaction ids in the same column (PBE2607240364268553), whose numeric
  // suffix dwarfs the cheque book and would otherwise win this scan.
  router.get("/next-cheque-no", async (req, res) => {
    const SEED_CHEQUE_NO = "PBB350779";
    try {
      const result = await pool.query(
        `SELECT cheque_no FROM journal_entries
          WHERE entry_type = $1 AND cheque_no IS NOT NULL AND cheque_no <> ''`,
        [PHYSICAL_CHEQUE_ENTRY_TYPE]
      );

      let best = null; // { prefix, num, width }
      for (const row of result.rows) {
        const match = String(row.cheque_no).match(/^(.*?)(\d+)$/);
        if (!match) continue;
        const prefix = match[1];
        const num = parseInt(match[2], 10);
        const width = match[2].length;
        if (!best || num > best.num) {
          best = { prefix, num, width };
        }
      }

      let nextChequeNo;
      if (!best) {
        nextChequeNo = SEED_CHEQUE_NO;
      } else {
        const nextNum = best.num + 1;
        nextChequeNo = `${best.prefix}${String(nextNum).padStart(best.width, "0")}`;
      }

      res.json({ cheque_no: nextChequeNo });
    } catch (error) {
      console.error("Error generating next cheque number:", error);
      res.status(500).json({
        message: "Error generating next cheque number",
        error: error.message,
      });
    }
  });

  // GET /cheque-usage - Report other Cash/Bank Payment journals already using a
  // cheque number, so the entry form can warn while it is being keyed. Warning
  // only: the legacy programme allowed the save and so does this.
  // Declared before /:id so the literal path is not swallowed by the id route.
  router.get("/cheque-usage", async (req, res) => {
    try {
      const { cheque_no, exclude_id } = req.query;
      const parsedExcludeId = Number.parseInt(exclude_id, 10);
      const duplicates = await fetchChequeDuplicates(
        pool,
        cheque_no,
        Number.isNaN(parsedExcludeId) ? null : parsedExcludeId
      );
      res.json({ duplicates });
    } catch (error) {
      console.error("Error checking cheque usage:", error);
      res.status(500).json({
        message: "Error checking cheque usage",
        error: error.message,
      });
    }
  });

  // GET /:id - Get single journal entry with lines
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
        FROM journal_entries je
        LEFT JOIN journal_entry_types jet ON ${DISPLAY_ENTRY_TYPE_SQL} = jet.code
        WHERE je.id = $1
      `;
      const entryResult = await pool.query(entryQuery, [id]);

      if (entryResult.rows.length === 0) {
        return res.status(404).json({ message: "Journal entry not found" });
      }

      // Get entry lines
      const linesQuery = `
        SELECT
          jel.id, jel.line_number, jel.account_code, jel.debit_amount,
          jel.credit_amount,
          COALESCE(jel.display_reference, je.display_reference, jel.reference) AS reference,
          jel.reference AS internal_reference,
          jel.display_reference,
          jel.particulars,
          ac.description as account_description
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        LEFT JOIN account_codes ac ON jel.account_code = ac.code
        WHERE jel.journal_entry_id = $1
        ORDER BY jel.line_number
      `;
      const linesResult = await pool.query(linesQuery, [id]);

      const source = await resolveJournalSource(pool, entryResult.rows[0]);
      const chequeDuplicates = await fetchChequeDuplicates(
        pool,
        entryResult.rows[0].cheque_no,
        entryResult.rows[0].id
      );

      // Surface the journals this entry is related to, so the details page can
      // link between an invoice's sale journal and its adjustment journals:
      // - invoice sales journal (S) -> the invoice's CN/DN/RN journals
      // - adjustment journal -> the invoice's S journal + sibling adjustments
      const entryRow = entryResult.rows[0];
      let relatedInvoiceId = null;
      let relatedJournals = [];
      const mapAdjustmentJournals = (rows) =>
        rows.map((r) => ({
          kind: "adjustment",
          doc_id: r.doc_id,
          doc_type: r.doc_type,
          doc_status: r.doc_status,
          amount: parseFloat(r.amount || 0),
          journal_entry_id: r.journal_entry_id,
          journal_reference: r.journal_reference,
          journal_status: r.journal_status,
          journal_date: r.journal_date,
        }));
      if (entryRow.source_type === "invoice" && entryRow.source_id) {
        relatedInvoiceId = entryRow.source_id;
        const adjResult = await pool.query(
          `SELECT a.id AS doc_id, a.type AS doc_type, a.status AS doc_status,
                  a.totalamountpayable AS amount,
                  a.journal_entry_id,
                  COALESCE(je.display_reference, je.reference_no) AS journal_reference,
                  je.status AS journal_status,
                  je.entry_date AS journal_date
             FROM adjustment_documents a
             JOIN journal_entries je ON je.id = a.journal_entry_id
            WHERE a.original_invoice_id = $1
              AND COALESCE(a.is_consolidated, false) = false
            ORDER BY a.created_at DESC`,
          [relatedInvoiceId]
        );
        relatedJournals = mapAdjustmentJournals(adjResult.rows);
      } else if (entryRow.source_type === "adjustment" && entryRow.source_id) {
        const docResult = await pool.query(
          `SELECT id, type, status, totalamountpayable, original_invoice_id, journal_entry_id
             FROM adjustment_documents
            WHERE id = $1`,
          [entryRow.source_id]
        );
        if (docResult.rows.length > 0) {
          relatedInvoiceId = docResult.rows[0].original_invoice_id || null;
          if (relatedInvoiceId) {
            const salesResult = await pool.query(
              `SELECT je.id AS journal_entry_id,
                      COALESCE(je.display_reference, je.reference_no) AS journal_reference,
                      je.status AS journal_status,
                      je.entry_date AS journal_date,
                      je.total_debit AS amount
                 FROM journal_entries je
                WHERE je.source_type = 'invoice'
                  AND je.source_id = $1
                  AND je.entry_type = 'S'`,
              [relatedInvoiceId]
            );
            if (salesResult.rows.length > 0) {
              relatedJournals.push({
                kind: "sales",
                doc_id: null,
                doc_type: null,
                doc_status: null,
                amount: parseFloat(salesResult.rows[0].amount || 0),
                journal_entry_id: salesResult.rows[0].journal_entry_id,
                journal_reference: salesResult.rows[0].journal_reference,
                journal_status: salesResult.rows[0].journal_status,
                journal_date: salesResult.rows[0].journal_date,
              });
            }
            const adjResult = await pool.query(
              `SELECT a.id AS doc_id, a.type AS doc_type, a.status AS doc_status,
                      a.totalamountpayable AS amount,
                      a.journal_entry_id,
                      COALESCE(je.display_reference, je.reference_no) AS journal_reference,
                      je.status AS journal_status,
                      je.entry_date AS journal_date
                 FROM adjustment_documents a
                 JOIN journal_entries je ON je.id = a.journal_entry_id
                WHERE a.original_invoice_id = $1
                  AND COALESCE(a.is_consolidated, false) = false
                  AND a.journal_entry_id <> $2
                ORDER BY a.created_at DESC`,
              [relatedInvoiceId, entryRow.id]
            );
            relatedJournals = relatedJournals.concat(
              mapAdjustmentJournals(adjResult.rows)
            );
          }
        }
      }

      res.json({
        ...entryResult.rows[0],
        lines: linesResult.rows,
        source,
        cheque_duplicates: chequeDuplicates,
        related_invoice_id: relatedInvoiceId,
        related_journals: relatedJournals,
      });
    } catch (error) {
      console.error("Error fetching journal entry:", error);
      res.status(500).json({
        message: "Error fetching journal entry",
        error: error.message,
      });
    }
  });

  // GET /:id/receipt-voucher - Get receipt voucher data for REC journal entries
  router.get("/:id/receipt-voucher", async (req, res) => {
    try {
      const { id } = req.params;

      // First, get the journal entry and verify it's a REC type
      const entryQuery = `
        SELECT
          je.id, je.reference_no, je.entry_type, je.entry_date,
          je.description, je.status, je.created_at, je.created_by,
          je.display_reference, je.source_type, je.source_id
        FROM journal_entries je
        WHERE je.id = $1
      `;
      const entryResult = await pool.query(entryQuery, [id]);

      if (entryResult.rows.length === 0) {
        return res.status(404).json({ message: "Journal entry not found" });
      }

      const entry = entryResult.rows[0];

      // Only allow REC type entries
      if (isLegacyImportEntry(entry) || entry.entry_type !== "REC") {
        return res.status(400).json({
          message: "Receipt voucher is only available for REC (Receipt) journal entries",
        });
      }

      // Check if entry is cancelled
      if (entry.status === "cancelled") {
        return res.status(400).json({
          message: "Cannot generate voucher for cancelled journal entry",
        });
      }

      // Journal lines with account descriptions (shared by both paths)
      const linesResult = await pool.query(
        `SELECT
            jel.account_code,
            COALESCE(ac.description, jel.account_code) as account_description,
            jel.debit_amount,
            jel.credit_amount
          FROM journal_entry_lines jel
          LEFT JOIN account_codes ac ON jel.account_code = ac.code
          WHERE jel.journal_entry_id = $1
          ORDER BY jel.line_number`,
        [id]
      );
      const lines = linesResult.rows.map((line) => ({
        account_code: line.account_code,
        account_description: line.account_description,
        debit_amount: parseFloat(line.debit_amount) || 0,
        credit_amount: parseFloat(line.credit_amount) || 0,
      }));

      // ----- Receipt-owned journal (header + allocations model) -----
      if (entry.source_type === "receipt") {
        const receiptResult = await pool.query(
          `SELECT r.*, ac.description AS debit_account_description
             FROM receipts r
             LEFT JOIN account_codes ac ON ac.code = r.debit_account
            WHERE r.id = $1::int`,
          [entry.source_id]
        );
        if (receiptResult.rows.length === 0) {
          return res.status(404).json({ message: "Receipt not found for this journal entry" });
        }
        const receipt = receiptResult.rows[0];

        const allocResult = await pool.query(
          `SELECT ra.line_number, ra.allocation_type, ra.invoice_id, ra.customer_id,
                  ra.target_account, ra.external_reference, ra.amount,
                  ra.legacy_payment_id,
                  COALESCE(c.name, ra.customer_id) AS customer_name
             FROM receipt_allocations ra
             LEFT JOIN customers c ON c.id = ra.customer_id
            WHERE ra.receipt_id = $1
            ORDER BY ra.line_number`,
          [receipt.id]
        );

        const customers = [
          ...new Set(allocResult.rows.map((a) => a.customer_name).filter(Boolean)),
        ];
        const invoiceIds = allocResult.rows
          .filter((a) => a.invoice_id)
          .map((a) => a.invoice_id);
        const isUndepositedCash = ["CH_REV1", "CH_REV2"].includes(receipt.debit_account);

        return res.json({
          voucher_number: entry.display_reference || receipt.display_reference || entry.reference_no,
          voucher_date: receipt.posting_date || receipt.received_date,
          payment_id: allocResult.rows.find((a) => a.legacy_payment_id)?.legacy_payment_id || null,
          amount: parseFloat(receipt.total_amount),
          payment_method: receipt.payment_method,
          payment_reference: receipt.display_reference || null,
          cheque_reference: receipt.cheque_reference || null,
          bank_account: receipt.debit_account,
          bank_account_description: receipt.debit_account_description || receipt.debit_account,
          is_undeposited_cash: isUndepositedCash,
          customer_name: customers.join(", ") || "Unknown Customer",
          invoice_id: invoiceIds.join("/"),
          journal_entry_id: parseInt(id),
          description: receipt.description || entry.description,
          allocations: allocResult.rows.map((a) => ({
            allocation_type: a.allocation_type,
            invoice_id: a.invoice_id,
            customer_name: a.customer_name,
            external_reference: a.external_reference,
            amount: parseFloat(a.amount),
          })),
          lines,
          created_at: receipt.created_at,
          created_by: receipt.created_by,
        });
      }

      // ----- Legacy payment-owned REC journal -----
      const paymentQuery = `
        SELECT
          p.payment_id, p.invoice_id, p.payment_date, p.amount_paid,
          p.payment_method, p.payment_reference, p.bank_account,
          p.created_at,
          c.name as customer_name,
          ac.description as bank_account_description
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        LEFT JOIN customers c ON i.customerid = c.id
        LEFT JOIN account_codes ac ON p.bank_account = ac.code
        WHERE p.journal_entry_id = $1
      `;
      const paymentResult = await pool.query(paymentQuery, [id]);

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({
          message: "No payment found linked to this journal entry",
        });
      }

      const payment = paymentResult.rows[0];

      // Construct the voucher data
      const voucherData = {
        voucher_number: entry.display_reference || entry.reference_no,
        voucher_date: payment.payment_date,
        payment_id: payment.payment_id,
        amount: parseFloat(payment.amount_paid),
        payment_method: payment.payment_method,
        payment_reference: payment.payment_reference || null,
        cheque_reference: null,
        bank_account: payment.bank_account,
        bank_account_description: payment.bank_account_description || payment.bank_account,
        is_undeposited_cash: payment.bank_account === "CASH",
        customer_name: payment.customer_name || "Unknown Customer",
        invoice_id: payment.invoice_id,
        journal_entry_id: parseInt(id),
        description: entry.description,
        lines,
        created_at: payment.created_at,
        created_by: null,
      };

      res.json(voucherData);
    } catch (error) {
      console.error("Error fetching receipt voucher data:", error);
      res.status(500).json({
        message: "Error fetching receipt voucher data",
        error: error.message,
      });
    }
  });

  // POST / - Create new journal entry
  router.post("/", async (req, res) => {
    const { reference_no, entry_type, entry_date, description, cheque_no, lines } =
      req.body;

    if (entry_type === LEGACY_IMPORT_ENTRY_TYPE) {
      return res.status(400).json({
        message: "IMP journal entries can only be created by the legacy import migration",
      });
    }

    // Cheque number applies to Cash Payment (C) and Bank Payment (B) entries
    const normalizedChequeNo =
      CHEQUE_NO_ENTRY_TYPES.includes(entry_type) &&
      cheque_no &&
      String(cheque_no).trim()
        ? String(cheque_no).trim()
        : null;

    // Validation
    if (!reference_no || !entry_type || !entry_date) {
      return res.status(400).json({
        message: "Reference number, entry type, and date are required",
      });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        message: "At least one line item is required",
      });
    }

    // Calculate totals
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += parseFloat(line.debit_amount) || 0;
      totalCredit += parseFloat(line.credit_amount) || 0;
    }

    // Validate debits = credits (with small tolerance for rounding)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({
        message: `Total debits (${totalDebit.toFixed(2)}) must equal total credits (${totalCredit.toFixed(2)})`,
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Manual entries post immediately, so a backdated one would write
      // straight into the imported history the lock protects.
      assertTienHockAccountingDateUnlocked(
        entry_date,
        `Journal entry ${reference_no}`
      );

      // Check if reference already exists
      const checkQuery =
        "SELECT 1 FROM journal_entries WHERE reference_no = $1";
      const checkResult = await client.query(checkQuery, [reference_no]);
      if (checkResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Reference number '${reference_no}' already exists`,
        });
      }

      // Validate all account codes exist
      for (const line of lines) {
        const acQuery = "SELECT 1 FROM account_codes WHERE code = $1";
        const acResult = await client.query(acQuery, [line.account_code]);
        if (acResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Account code '${line.account_code}' does not exist`,
          });
        }
      }

      // Insert entry header. Manual entries are live ("Active") immediately — the UI
      // has no draft/post step, and reports only read posted entries.
      const insertEntryQuery = `
        INSERT INTO journal_entries (
          reference_no, entry_type, entry_date, description,
          total_debit, total_credit, status, cheque_no, created_by,
          posted_at, posted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'posted', $7, $8, CURRENT_TIMESTAMP, $8)
        RETURNING id
      `;

      const entryResult = await client.query(insertEntryQuery, [
        reference_no,
        entry_type,
        entry_date,
        description || null,
        totalDebit,
        totalCredit,
        normalizedChequeNo,
        req.staffId || null,
      ]);

      const entryId = entryResult.rows[0].id;

      // Insert lines
      const insertLineQuery = `
        INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_code,
          debit_amount, credit_amount, reference, particulars
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      for (const line of lines) {
        await client.query(insertLineQuery, [
          entryId,
          line.line_number,
          line.account_code,
          parseFloat(line.debit_amount) || 0,
          parseFloat(line.credit_amount) || 0,
          line.reference || null,
          line.particulars || null,
        ]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Journal entry created successfully",
        entry: { id: entryId, reference_no },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error creating journal entry:", error);
      res.status(500).json({
        message: "Error creating journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // PUT /:id - Update journal entry
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { reference_no, entry_type, entry_date, description, cheque_no, lines } =
      req.body;

    if (entry_type === LEGACY_IMPORT_ENTRY_TYPE) {
      return res.status(400).json({
        message: "IMP journal entries cannot be created or edited manually",
      });
    }

    // Cheque number applies to Cash Payment (C) and Bank Payment (B) entries
    const normalizedChequeNo =
      CHEQUE_NO_ENTRY_TYPES.includes(entry_type) &&
      cheque_no &&
      String(cheque_no).trim()
        ? String(cheque_no).trim()
        : null;

    if (!reference_no || !entry_type || !entry_date) {
      return res.status(400).json({
        message: "Reference number, entry type, and date are required",
      });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        message: "At least one line item is required",
      });
    }

    // Calculate totals
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += parseFloat(line.debit_amount) || 0;
      totalCredit += parseFloat(line.credit_amount) || 0;
    }

    // Validate debits = credits
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({
        message: `Total debits (${totalDebit.toFixed(2)}) must equal total credits (${totalCredit.toFixed(2)})`,
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if entry exists and is editable
      const checkQuery = `
        SELECT status, entry_type, source_type, description, entry_date
        FROM journal_entries
        WHERE id = $1
        FOR UPDATE`;
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      const existing = checkResult.rows[0];
      if (isLegacyImportEntry(existing)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Legacy import journal entries cannot be edited manually",
        });
      }

      if (existing.status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot edit a cancelled journal entry",
        });
      }

      // Both dates are checked: the entry may be neither rewritten where it
      // already sits in locked history nor moved into it from the open period.
      assertTienHockAccountingDateUnlocked(
        existing.entry_date,
        `Journal entry ${reference_no}`
      );
      assertTienHockAccountingDateUnlocked(
        entry_date,
        `Journal entry ${reference_no}`
      );

      // Editing a system-owned journal DETACHES it rather than being blocked:
      // manual_override stops its source from rebuilding it (the sales, GP and
      // purchase-invoice syncs back off; create-once sources — receipts, supplier
      // payments, adjustment/payroll vouchers — have nothing to rebuild), and the
      // entry_type is preserved so the source's cancellation cascade still finds
      // it (cancelSalesJournalEntry filters 'S', cancelGPJournalEntry 'GP',
      // cancelSupplierPaymentJournalEntry 'PAY', cancelAdjustmentJournalEntry
      // CN/DN/RN, …). Plain manual journals ('J' …) stay fully free-form; legacy
      // IMP is blocked above. See syncSalesJournalEntry / updateGPJournalEntry.
      // The entry type alone does NOT make a journal source-owned: users key
      // manual journals with system-looking types (e.g. a CN created straight
      // from the Journal page), and those stay free-form so the type can be
      // changed to J. A journal is source-owned only when a document depends
      // on it: source_type is set, a GP/PUR/PAY journal is linked from its
      // owning table (those post without source_type), it is a B payment with
      // a PRP: description, or it is a system payroll voucher (JVDR/JVSL).
      const isSourceOwned =
        existing.source_type != null ||
        (existing.entry_type === "B" &&
          String(existing.description || "").startsWith("PRP:")) ||
        (existing.entry_type === "JVDR" || existing.entry_type === "JVSL") ||
        (existing.entry_type === "GP" &&
          (
            await client.query(
              "SELECT 1 FROM self_billed_invoices WHERE journal_entry_id = $1",
              [id]
            )
          ).rows.length > 0) ||
        (existing.entry_type === "PUR" &&
          (
            await client.query(
              "SELECT 1 FROM purchase_invoices WHERE journal_entry_id = $1",
              [id]
            )
          ).rows.length > 0) ||
        (existing.entry_type === "PAY" &&
          (
            await client.query(
              "SELECT 1 FROM supplier_payments WHERE journal_entry_id = $1",
              [id]
            )
          ).rows.length > 0);
      const effectiveEntryType = isSourceOwned ? existing.entry_type : entry_type;

      // Check if reference_no is unique (excluding current entry)
      const refCheckQuery =
        "SELECT 1 FROM journal_entries WHERE reference_no = $1 AND id != $2";
      const refCheckResult = await client.query(refCheckQuery, [
        reference_no,
        id,
      ]);
      if (refCheckResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Reference number '${reference_no}' already exists`,
        });
      }

      // Validate all account codes exist
      for (const line of lines) {
        const acQuery = "SELECT 1 FROM account_codes WHERE code = $1";
        const acResult = await client.query(acQuery, [line.account_code]);
        if (acResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Account code '${line.account_code}' does not exist`,
          });
        }
      }

      // Update entry header
      const updateEntryQuery = `
        UPDATE journal_entries
        SET reference_no = $1::varchar, entry_type = $2, entry_date = $3,
            description = $4, total_debit = $5, total_credit = $6,
            cheque_no = $7,
            display_reference = CASE
              WHEN source_type IS NULL
                AND display_reference IS NOT NULL
                AND reference_no IS DISTINCT FROM $1
              THEN $1
              ELSE display_reference
            END,
            manual_override = CASE WHEN $8::boolean THEN true ELSE manual_override END,
            updated_by = $9, updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
      `;

      await client.query(updateEntryQuery, [
        reference_no,
        effectiveEntryType,
        entry_date,
        description || null,
        totalDebit,
        totalCredit,
        normalizedChequeNo,
        isSourceOwned,
        req.staffId || null,
        id,
      ]);

      // Load the current lines before deleting them so an unchanged line can
      // keep its per-line receipt/cheque metadata (receipt journals are
      // create-once and nothing rebuilds these refs after a hand edit).
      const existingLinesResult = await client.query(
        `SELECT id, line_number, account_code, debit_amount, credit_amount,
                reference, particulars, cheque_reference, display_reference,
                display_order
           FROM journal_entry_lines
          WHERE journal_entry_id = $1`,
        [id]
      );
      const existingLinesById = new Map(
        existingLinesResult.rows.map((row) => [Number(row.id), row])
      );

      // Delete existing lines and re-insert
      await client.query(
        "DELETE FROM journal_entry_lines WHERE journal_entry_id = $1",
        [id]
      );

      const insertLineQuery = `
        INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_code,
          debit_amount, credit_amount, reference, particulars,
          cheque_reference, display_reference, display_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      for (const line of lines) {
        const existingLine =
          line.id === undefined ? null : existingLinesById.get(Number(line.id));
        const lineIsUnchanged =
          existingLine !== null &&
          existingLine.account_code === line.account_code &&
          parseFloat(existingLine.debit_amount) ===
            (parseFloat(line.debit_amount) || 0) &&
          parseFloat(existingLine.credit_amount) ===
            (parseFloat(line.credit_amount) || 0) &&
          (existingLine.reference ?? null) === (line.reference || null) &&
          (existingLine.particulars ?? null) === (line.particulars || null);

        await client.query(insertLineQuery, [
          id,
          line.line_number,
          line.account_code,
          parseFloat(line.debit_amount) || 0,
          parseFloat(line.credit_amount) || 0,
          line.reference || null,
          line.particulars || null,
          lineIsUnchanged ? existingLine.cheque_reference : null,
          lineIsUnchanged ? existingLine.display_reference : null,
          lineIsUnchanged ? existingLine.display_order : null,
        ]);
      }

      await client.query("COMMIT");

      res.json({
        message: "Journal entry updated successfully",
        entry: { id: parseInt(id), reference_no },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error updating journal entry:", error);
      res.status(500).json({
        message: "Error updating journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // POST /:id/post - Post a journal entry
  router.post("/:id/post", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if entry exists and is draft
      const checkQuery =
        "SELECT status, entry_type, source_type, total_debit, total_credit, entry_date, reference_no FROM journal_entries WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      if (isLegacyImportEntry(checkResult.rows[0])) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Legacy import journal entries cannot be posted manually",
        });
      }

      if (checkResult.rows[0].status !== "draft") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Cannot post entry with status '${checkResult.rows[0].status}'`,
        });
      }

      // Posting is what puts the entry on the ledger, so it must land in the
      // open period.
      assertTienHockAccountingDateUnlocked(
        checkResult.rows[0].entry_date,
        `Journal entry ${checkResult.rows[0].reference_no}`
      );

      // Verify debits equal credits
      const { total_debit, total_credit } = checkResult.rows[0];
      if (Math.abs(parseFloat(total_debit) - parseFloat(total_credit)) > 0.01) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Total debits must equal total credits to post",
        });
      }

      // Update status to posted
      const updateQuery = `
        UPDATE journal_entries
        SET status = 'posted', posted_at = CURRENT_TIMESTAMP, posted_by = $1
        WHERE id = $2
      `;

      await client.query(updateQuery, [req.staffId || null, id]);

      await client.query("COMMIT");

      res.json({ message: "Journal entry posted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error posting journal entry:", error);
      res.status(500).json({
        message: "Error posting journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // POST /:id/cancel - Cancel a journal entry
  router.post("/:id/cancel", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const checkQuery =
        "SELECT status, entry_type, source_type, source_id, entry_date, reference_no FROM journal_entries WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      if (isLegacyImportEntry(checkResult.rows[0])) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Legacy import journal entries cannot be cancelled manually",
        });
      }

      if (checkResult.rows[0].status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Entry is already cancelled",
        });
      }

      if (checkResult.rows[0].source_type !== null) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `This journal is owned by a ${checkResult.rows[0].source_type} document. Cancel the source document or receipt instead so its operational balance and journal remain in sync.`,
          detail: `source_type: ${checkResult.rows[0].source_type}, source_id: ${checkResult.rows[0].source_id}`,
        });
      }

      // Cancelling takes the entry off the ledger, which rewrites reported
      // history just as surely as editing it would.
      assertTienHockAccountingDateUnlocked(
        checkResult.rows[0].entry_date,
        `Journal entry ${checkResult.rows[0].reference_no}`
      );

      const updateQuery = `
        UPDATE journal_entries
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP, updated_by = $1
        WHERE id = $2
      `;

      await client.query(updateQuery, [req.staffId || null, id]);

      await client.query("COMMIT");

      res.json({ message: "Journal entry cancelled successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error cancelling journal entry:", error);
      res.status(500).json({
        message: "Error cancelling journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // POST /:id/restore - Undo a cancellation (put a cancelled entry back on the
  // ledger). Cancelling posts no reversing entry and deletes no lines, so this
  // is its exact inverse: the entry returns to the state it held before. It is
  // only offered where the ledger is genuinely missing an entry it should have
  // — never where the system cancelled the journal on purpose.
  router.post("/:id/restore", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const checkResult = await client.query(
        `SELECT id, status, entry_type, entry_date, source_type, source_id,
                ${VISIBLE_REFERENCE_SQL} AS visible_reference
           FROM journal_entries je
          WHERE id = $1
          FOR UPDATE`,
        [id]
      );

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      const entry = checkResult.rows[0];

      if (isLegacyImportEntry(entry)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Legacy import journal entries cannot be restored manually",
        });
      }

      if (entry.status !== "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Only a cancelled journal entry can be restored",
        });
      }

      // Never put an entry back into locked pre-cutover history.
      assertTienHockAccountingDateUnlocked(
        entry.entry_date,
        `Journal entry ${entry.visible_reference}`
      );

      const ownerResult = await client.query(JOURNAL_OWNER_LOOKUP_SQL, [id]);
      const blockingOwner = ownerResult.rows.find(
        (row) => !row.owner_wants_journal
      );

      if (blockingOwner) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "This journal was cancelled by its source document",
          detail:
            `The ${blockingOwner.owner_type} (${blockingOwner.owner_ref}) that owns ` +
            "this journal no longer keeps a live journal entry, so restoring it " +
            "would put an entry back on the ledger that the source document " +
            "deliberately removed.",
          suggestion:
            "Work from the source document instead — its journal follows automatically.",
        });
      }

      // A journal that still names a source but that no document points back at
      // has been detached on purpose (for example a purchase switched from local
      // to foreign). Restoring it would duplicate an entry the source dropped.
      if (ownerResult.rows.length === 0 && entry.source_type) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "This journal has been detached from its source document",
          detail:
            `This entry was created from a ${entry.source_type.replace(/_/g, " ")} ` +
            "that no longer links to it, so it was cancelled deliberately rather " +
            "than by mistake.",
          suggestion:
            "Work from the source document instead, or key a new journal entry.",
        });
      }

      // journal_entries_source_posted_uq allows exactly one posted journal per
      // source. Report a replacement clearly instead of failing on the index.
      if (entry.source_type && entry.source_id) {
        const competing = await client.query(
          `SELECT id, ${VISIBLE_REFERENCE_SQL} AS visible_reference
             FROM journal_entries je
            WHERE source_type = $1 AND source_id = $2
              AND status = 'posted' AND id <> $3`,
          [entry.source_type, entry.source_id, id]
        );
        if (competing.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message: "The source document already has a live journal entry",
            detail:
              `Entry ${competing.rows[0].visible_reference} has since replaced this ` +
              "one, so restoring it would post the same transaction twice.",
            suggestion: "Review the replacement entry instead.",
          });
        }
      }

      await client.query(
        `UPDATE journal_entries
            SET status = 'posted', updated_at = CURRENT_TIMESTAMP, updated_by = $1
          WHERE id = $2`,
        [req.staffId || null, id]
      );

      await client.query("COMMIT");

      res.json({ message: "Journal entry restored successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      if (handleAccountingPeriodLock(error, res)) return;
      console.error("Error restoring journal entry:", error);
      res.status(500).json({
        message: "Error restoring journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // DELETE /:id - Delete a journal entry (except posted)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const checkQuery =
        "SELECT status, entry_type, source_type, reference_no FROM journal_entries WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Journal entry not found" });
      }

      const { status, entry_type, source_type, reference_no } = checkResult.rows[0];

      if (isLegacyImportEntry({ entry_type, source_type })) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Legacy import journal entries cannot be deleted manually",
        });
      }

      // Special handling for auto-generated receipt (REC) entries
      if (entry_type === "REC" && status === "posted") {
        // Check if this is linked to a payment
        const paymentQuery = `
          SELECT payment_id, invoice_id, payment_date, amount_paid
          FROM payments
          WHERE journal_entry_id = $1
        `;
        const paymentResult = await client.query(paymentQuery, [id]);

        if (paymentResult.rows.length > 0) {
          const payment = paymentResult.rows[0];
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: "Cannot delete auto-generated receipt journal",
            detail: `This journal entry (${reference_no}) was auto-generated from a customer payment. To remove it, cancel the originating payment instead.`,
            payment_id: payment.payment_id,
            invoice_id: payment.invoice_id,
            suggestion: "Go to the invoice and cancel the payment to cancel this journal entry",
          });
        }
      }

      // General check for posted entries
      if (status === "posted") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete posted entries",
          detail: "Posted journal entries cannot be deleted. Use the Cancel option instead to maintain audit trail.",
        });
      }

      // Adjustment documents (Credit/Debit/Refund Notes) reference this journal
      // via journal_entry_id (a NO ACTION FK that would otherwise block the
      // delete). Staff monitor these journals and documents directly, so detach
      // the link from any owning document — active or cancelled — before removing
      // the journal. A later cancellation of that document safely skips the
      // already-removed journal (cancelAdjustmentJournalEntry no-ops on NULL).
      await client.query(
        "UPDATE adjustment_documents SET journal_entry_id = NULL WHERE journal_entry_id = $1",
        [id]
      );
      await client.query(
        "UPDATE jellypolly.adjustment_documents SET journal_entry_id = NULL WHERE journal_entry_id = $1",
        [id]
      );

      // Lines will be deleted by CASCADE
      await client.query("DELETE FROM journal_entries WHERE id = $1", [id]);

      await client.query("COMMIT");

      res.json({ message: "Journal entry deleted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting journal entry:", error);
      // A foreign-key violation means another source record (invoice, receipt,
      // payment, bank-in, supplier/purchase invoice, RV) still owns this journal.
      // Surface a clean message instead of the raw constraint error.
      if (error.code === "23503") {
        return res.status(400).json({
          message: "Cannot delete this journal entry",
          detail:
            "This journal is linked to another record (such as an invoice, receipt, payment, or bank-in) and is managed through that source document.",
          suggestion:
            "Cancel or remove the source document, and its journal will be handled automatically.",
        });
      }
      res.status(500).json({
        message: "Error deleting journal entry",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
