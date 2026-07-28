// src/routes/greentarget/accounting/journal-entries.js
//
// Green Target Journal routes (phase G6). Read-only clone of Tien Hock's
// `src/routes/accounting/journal-entries.js` GET / and GET /:id, pointing at
// the `greentarget` schema, with response payloads kept field-for-field
// compatible so the shared Journal pages work unchanged on a base-path swap
// (handover R7).
//
// Every GT journal today is an untouched legacy import (entry_type 'IMP',
// source_type 'legacy_import', cheque_no always NULL), so the cheque-book
// extras TH carries (next-cheque-no, cheque-usage, receipt vouchers) and all
// mutating endpoints are deliberately absent, and `source` is always null —
// no operational source page exists on the GT side. Mutations arrive with
// G7's posting lock (handover R8).
import { Router } from "express";

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

  // GET /:id - Single journal entry with its lines. `source` is always null:
  // every GT journal is a legacy import with no operational source page.
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
          ac.description as account_description
        FROM greentarget.journal_entry_lines jel
        JOIN greentarget.journal_entries je ON je.id = jel.journal_entry_id
        LEFT JOIN greentarget.account_codes ac ON jel.account_code = ac.code
        WHERE jel.journal_entry_id = $1
        ORDER BY jel.line_number
      `;
      const linesResult = await pool.query(linesQuery, [id]);

      res.json({
        ...entryResult.rows[0],
        lines: linesResult.rows,
        source: null,
      });
    } catch (error) {
      console.error("Error fetching Green Target journal entry:", error);
      res.status(500).json({
        message: "Error fetching Green Target journal entry",
        error: error.message,
      });
    }
  });

  return router;
}
