// src/utils/invoice/autoAdjustmentConsolidation.js
// Auto-consolidate adjustment documents (Credit / Debit / Refund Notes)
// whose original invoice was consolidated. Runs in the same days 3-7 window
// as the regular invoice auto-consolidation. Groups by
// (type, references_consolidated_id) and submits one consolidated adjustment
// doc per group via MyInvois.
//
// Companies: Tien Hock + Jelly Polly. Each has its own table set, MyInvois
// credentials, and supplier party.
import { EInvoiceConsolidatedAdjustmentTemplate } from "./einvoice/EInvoiceConsolidatedAdjustmentTemplate.js";
import EInvoiceApiClientFactory from "./einvoice/EInvoiceApiClientFactory.js";
import EInvoiceSubmissionHandler from "./einvoice/EInvoiceSubmissionHandler.js";
import JPEInvoiceApiClientFactory from "../JellyPolly/einvoice/JPEInvoiceApiClientFactory.js";
import JPEInvoiceSubmissionHandler from "../JellyPolly/einvoice/JPEInvoiceSubmissionHandler.js";
import GTEInvoiceApiClientFactory from "../greenTarget/einvoice/GTEInvoiceApiClientFactory.js";
import GTEInvoiceSubmissionHandler from "../greenTarget/einvoice/GTEInvoiceSubmissionHandler.js";
import { GTEInvoiceConsolidatedAdjustmentTemplate } from "../greenTarget/einvoice/GTEInvoiceConsolidatedAdjustmentTemplate.js";
import {
  TIENHOCK_INFO,
  JELLYPOLLY_INFO,
  GREENTARGET_INFO,
} from "./einvoice/companyInfo.js";
import {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
  MYINVOIS_JP_CLIENT_ID,
  MYINVOIS_JP_CLIENT_SECRET,
  MYINVOIS_GT_CLIENT_ID,
  MYINVOIS_GT_CLIENT_SECRET,
} from "../../configs/config.js";

const TYPES = ["credit_note", "debit_note", "refund_note"];
const TYPE_PREFIX = {
  credit_note: "CN",
  debit_note: "DN",
  refund_note: "RN",
};

function checkIfInWindow(now) {
  const malaysia = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const d = malaysia.getUTCDate();
  const month = malaysia.getUTCMonth();
  const year = malaysia.getUTCFullYear();
  if (d < 3 || d > 7) return { inWindow: false };
  let targetMonth = month - 1;
  let targetYear = year;
  if (targetMonth < 0) {
    targetMonth = 11;
    targetYear = year - 1;
  }
  return { inWindow: true, targetMonth, targetYear };
}

async function generateConsolidatedId(client, type, yearMonth, T) {
  const prefix = `CON-${TYPE_PREFIX[type]}-${yearMonth}`;
  const result = await client.query(
    `SELECT id FROM ${T.docs}
      WHERE id LIKE $1 AND is_consolidated = true
      ORDER BY id DESC LIMIT 1`,
    [`${prefix}-%`]
  );
  let n = 1;
  if (result.rows.length > 0) {
    const m = result.rows[0].id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${n}-AUTO`;
}

/**
 * Process auto-consolidation for one company (TH or JP).
 *
 * @param {Object} pool - PostgreSQL pool
 * @param {Object} cfg
 * @param {string} cfg.label - "Tien Hock" / "Jelly Polly" — for logs
 * @param {Object} cfg.tables - { docs, invoices }
 * @param {Object} cfg.supplierInfo - TIENHOCK_INFO or JELLYPOLLY_INFO
 * @param {Object} cfg.submissionHandler
 */
async function processCompany(pool, cfg) {
  const now = new Date();
  const window = checkIfInWindow(now);
  if (!window.inWindow) return;

  const monthStart = new Date(
    `${window.targetYear}-${String(window.targetMonth + 1).padStart(
      2,
      "0"
    )}-01T00:00:00+08:00`
  );
  const endY =
    window.targetMonth === 11 ? window.targetYear + 1 : window.targetYear;
  const endM = window.targetMonth === 11 ? 0 : window.targetMonth + 1;
  const monthEnd = new Date(
    `${endY}-${String(endM + 1).padStart(2, "0")}-01T00:00:00+08:00`
  );

  const T = cfg.tables;

  for (const type of TYPES) {
    const client = await pool.connect();
    try {
      const eligible = await client.query(
        `SELECT a.*, con.id AS parent_id, con.uuid AS parent_uuid
           FROM ${T.docs} a
           JOIN ${T.invoices} con
                ON con.is_consolidated = true
               AND con.invoice_status != 'cancelled'
               AND con.einvoice_status = 'valid'
               AND con.consolidated_invoices IS NOT NULL
               AND con.consolidated_invoices::jsonb ? CAST(a.original_invoice_id AS TEXT)
          WHERE a.type = $1
            AND a.status = 'active'
            AND a.is_consolidated = false
            AND (a.einvoice_status IS NULL OR a.einvoice_status = 'invalid')
            AND CAST(a.createddate AS bigint) >= $2::bigint
            AND CAST(a.createddate AS bigint) < $3::bigint
          ORDER BY con.id, a.created_at ASC`,
        [type, monthStart.getTime().toString(), monthEnd.getTime().toString()]
      );

      if (eligible.rows.length === 0) {
        console.log(
          `[${now.toISOString()}] ${cfg.label}: no eligible ${type}s for consolidation`
        );
        continue;
      }

      // Group by parent
      const groups = new Map();
      for (const row of eligible.rows) {
        const key = row.parent_id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }

      for (const [parentId, docs] of groups.entries()) {
        try {
          await client.query("BEGIN");

          const ids = docs.map((d) => d.id);
          const lockResult = await client.query(
            `SELECT * FROM ${T.docs}
              WHERE id = ANY($1::text[])
                AND status = 'active'
                AND is_consolidated = false
                AND (einvoice_status IS NULL OR einvoice_status = 'invalid')
              FOR UPDATE`,
            [ids]
          );
          if (lockResult.rows.length !== ids.length) {
            console.warn(
              `[${now.toISOString()}] ${cfg.label}: skipping group ${parentId}/${type} — some docs no longer eligible`
            );
            await client.query("ROLLBACK");
            continue;
          }

          // Idempotency guard: if any child already carries a submission_uid
          // we treat the group as needing manual review and skip — re-submission
          // could create a MyInvois duplicate.
          const stuckIds = lockResult.rows
            .filter((r) => r.submission_uid)
            .map((r) => r.id);
          if (stuckIds.length > 0) {
            console.warn(
              `[${now.toISOString()}] ${cfg.label}: skipping group ${parentId}/${type} — children with prior submission attempts need manual review: ${stuckIds.join(", ")}`
            );
            await client.query("ROLLBACK");
            continue;
          }
          const lockedDocs = lockResult.rows;
          const parent = { id: parentId, uuid: docs[0].parent_uuid };

          const yyyymm = `${window.targetYear}${String(
            window.targetMonth + 1
          ).padStart(2, "0")}`;
          const consolidatedId = await generateConsolidatedId(
            client,
            type,
            yyyymm,
            T
          );

          const xml = await EInvoiceConsolidatedAdjustmentTemplate({
            consolidatedId,
            type,
            childDocs: lockedDocs,
            parent,
            supplierInfo: cfg.supplierInfo,
          });

          const submissionResult =
            await cfg.submissionHandler.submitAndPollDocuments(xml);
          if (!submissionResult.success) {
            throw new Error(submissionResult.message || "Submission failed");
          }

          let uuid = null;
          let longId = null;
          let dateTimeValidated = null;
          let status = "pending";
          if (
            submissionResult.acceptedDocuments &&
            submissionResult.acceptedDocuments.length > 0
          ) {
            const acc = submissionResult.acceptedDocuments[0];
            uuid = acc.uuid || null;
            longId = acc.longId || null;
            dateTimeValidated = acc.dateTimeValidated || null;
            status = longId ? "valid" : "pending";
          }

          const totals = lockedDocs.reduce(
            (acc, d) => ({
              subtotal: acc.subtotal + Number(d.total_excluding_tax || 0),
              tax: acc.tax + Number(d.tax_amount || 0),
              rounding: acc.rounding + Number(d.rounding || 0),
              total: acc.total + Number(d.totalamountpayable || 0),
            }),
            { subtotal: 0, tax: 0, rounding: 0, total: 0 }
          );

          await client.query(
            `INSERT INTO ${T.docs} (
               id, type, original_invoice_id, customerid, salespersonid,
               createddate, reason,
               total_excluding_tax, tax_amount, rounding, totalamountpayable,
               uuid, submission_uid, long_id, datetime_validated, einvoice_status,
               is_consolidated, consolidated_adjustments,
               references_consolidated_id, status, created_by
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$18,'active',$19
             )`,
            [
              consolidatedId,
              type,
              parent.id,
              "Consolidated customers",
              "SYSTEM-AUTO",
              Date.now().toString(),
              `Auto-consolidated ${lockedDocs.length} ${TYPE_PREFIX[type]}(s) for ${parent.id}`,
              totals.subtotal,
              totals.tax,
              totals.rounding,
              totals.total,
              uuid,
              submissionResult.submissionUid || null,
              longId,
              dateTimeValidated ? new Date(dateTimeValidated) : null,
              status,
              JSON.stringify(ids),
              parent.id,
              null,
            ]
          );

          await client.query(
            `UPDATE ${T.docs}
                SET uuid = $1,
                    submission_uid = $2,
                    long_id = $3,
                    datetime_validated = $4,
                    einvoice_status = $5
              WHERE id = ANY($6::text[])`,
            [
              uuid,
              submissionResult.submissionUid || null,
              longId,
              dateTimeValidated ? new Date(dateTimeValidated) : null,
              status,
              ids,
            ]
          );

          await client.query("COMMIT");
          console.log(
            `[${now.toISOString()}] ${cfg.label}: auto-consolidated ${
              lockedDocs.length
            } ${type}(s) into ${consolidatedId} (status: ${status})`
          );
        } catch (groupError) {
          await client.query("ROLLBACK");
          console.error(
            `[${now.toISOString()}] ${cfg.label}: failed to consolidate ${type} group ${parentId}:`,
            groupError.message
          );
        }
      }
    } catch (typeError) {
      console.error(
        `[${now.toISOString()}] ${cfg.label}: error processing ${type} consolidation:`,
        typeError
      );
    } finally {
      client.release();
    }
  }
}

/**
 * Green Target processor. Forked from processCompany because GT diverges on
 * almost every column: integer invoice_id PK + invoice_number snapshot,
 * date_issued (date) instead of createddate (unix ms text), amount_before_tax
 * / total_amount totals, customer_id (int), no salesperson, no rounding, and
 * the submission handler returns a single `document` object rather than
 * `acceptedDocuments[0]`.
 */
async function processGreenTargetAdjustmentConsolidation(pool, cfg) {
  const now = new Date();
  const window = checkIfInWindow(now);
  if (!window.inWindow) return;

  const monthStart = `${window.targetYear}-${String(
    window.targetMonth + 1
  ).padStart(2, "0")}-01`;
  const endY =
    window.targetMonth === 11 ? window.targetYear + 1 : window.targetYear;
  const endM = window.targetMonth === 11 ? 0 : window.targetMonth + 1;
  const monthEnd = `${endY}-${String(endM + 1).padStart(2, "0")}-01`;

  for (const type of TYPES) {
    const client = await pool.connect();
    try {
      const eligible = await client.query(
        `SELECT a.*, con.invoice_id AS parent_id,
                con.invoice_number AS parent_invoice_number,
                con.uuid AS parent_uuid
           FROM greentarget.adjustment_documents a
           JOIN greentarget.invoices con
                ON con.is_consolidated = TRUE
               AND con.status != 'cancelled'
               AND con.einvoice_status = 'valid'
               AND con.consolidated_invoices IS NOT NULL
               AND con.consolidated_invoices::jsonb ? CAST(a.original_invoice_number AS TEXT)
          WHERE a.type = $1
            AND a.status = 'active'
            AND a.is_consolidated = FALSE
            AND (a.einvoice_status IS NULL OR a.einvoice_status = 'invalid')
            AND a.date_issued >= $2::date
            AND a.date_issued < $3::date
          ORDER BY con.invoice_id, a.created_at ASC`,
        [type, monthStart, monthEnd]
      );

      if (eligible.rows.length === 0) {
        console.log(
          `[${now.toISOString()}] ${cfg.label}: no eligible ${type}s for consolidation`
        );
        continue;
      }

      const groups = new Map();
      for (const row of eligible.rows) {
        const key = row.parent_id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }

      for (const [parentId, docs] of groups.entries()) {
        try {
          await client.query("BEGIN");

          const ids = docs.map((d) => d.id);
          const lockResult = await client.query(
            `SELECT * FROM greentarget.adjustment_documents
              WHERE id = ANY($1::text[])
                AND status = 'active'
                AND is_consolidated = FALSE
                AND (einvoice_status IS NULL OR einvoice_status = 'invalid')
              FOR UPDATE`,
            [ids]
          );
          if (lockResult.rows.length !== ids.length) {
            console.warn(
              `[${now.toISOString()}] ${cfg.label}: skipping group ${parentId}/${type} — some docs no longer eligible`
            );
            await client.query("ROLLBACK");
            continue;
          }
          const stuckIds = lockResult.rows
            .filter((r) => r.submission_uid)
            .map((r) => r.id);
          if (stuckIds.length > 0) {
            console.warn(
              `[${now.toISOString()}] ${cfg.label}: skipping group ${parentId}/${type} — children with prior submission attempts need manual review: ${stuckIds.join(", ")}`
            );
            await client.query("ROLLBACK");
            continue;
          }
          const lockedDocs = lockResult.rows;

          // Hydrate lines for each child for the template.
          for (const d of lockedDocs) {
            const linesResult = await client.query(
              `SELECT line_number, description, quantity, price, tax, total, issubtotal
                 FROM greentarget.adjustment_document_lines
                WHERE adjustment_doc_id = $1
                ORDER BY line_number ASC`,
              [d.id]
            );
            d.lines = linesResult.rows;
          }

          const parent = {
            id: docs[0].parent_invoice_number,
            uuid: docs[0].parent_uuid,
          };

          const yyyymm = `${window.targetYear}${String(
            window.targetMonth + 1
          ).padStart(2, "0")}`;
          const consolPrefix = `CON-GT-${TYPE_PREFIX[type]}-${yyyymm}`;
          const seqResult = await client.query(
            `SELECT id FROM greentarget.adjustment_documents
              WHERE id LIKE $1 AND is_consolidated = TRUE
              ORDER BY id DESC LIMIT 1`,
            [`${consolPrefix}-%`]
          );
          let n = 1;
          if (seqResult.rows.length > 0) {
            const m = seqResult.rows[0].id.match(
              new RegExp(`^${consolPrefix}-(\\d+)`)
            );
            if (m) n = parseInt(m[1], 10) + 1;
          }
          const consolidatedId = `${consolPrefix}-${n}-AUTO`;

          const xml = await GTEInvoiceConsolidatedAdjustmentTemplate({
            consolidatedId,
            type,
            childDocs: lockedDocs,
            parent,
            supplierInfo: cfg.supplierInfo,
          });

          const submissionResult =
            await cfg.submissionHandler.submitAndPollDocument(xml);
          if (!submissionResult.success) {
            throw new Error(submissionResult.message || "Submission failed");
          }

          const docObj = submissionResult.document || {};
          const uuid = docObj.uuid || null;
          const longId = docObj.longId || null;
          const dateTimeValidated = docObj.dateTimeValidated || null;
          const status = longId ? "valid" : "pending";

          const totals = lockedDocs.reduce(
            (acc, d) => ({
              subtotal: acc.subtotal + Number(d.amount_before_tax || 0),
              tax: acc.tax + Number(d.tax_amount || 0),
              total: acc.total + Number(d.total_amount || 0),
            }),
            { subtotal: 0, tax: 0, total: 0 }
          );

          const todayIso = new Date().toISOString().slice(0, 10);

          await client.query(
            `INSERT INTO greentarget.adjustment_documents (
               id, type, original_invoice_id, original_invoice_number,
               customer_id, customer_name, date_issued, reason,
               amount_before_tax, tax_amount, total_amount,
               uuid, submission_uid, long_id, datetime_validated, einvoice_status,
               is_consolidated, consolidated_adjustments,
               references_consolidated_id, status, created_by
             ) VALUES (
               $1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,$16,$17,'active',$18
             )`,
            [
              consolidatedId,
              type,
              parentId,                  // FK -> greentarget.invoices.invoice_id
              parent.id,                 // invoice_number snapshot
              "Consolidated customers",
              todayIso,
              `Auto-consolidated ${lockedDocs.length} ${TYPE_PREFIX[type]}(s) for ${parent.id}`,
              totals.subtotal,
              totals.tax,
              totals.total,
              uuid,
              submissionResult.submissionUid || null,
              longId,
              dateTimeValidated ? new Date(dateTimeValidated) : null,
              status,
              JSON.stringify(ids),
              parentId,                  // references_consolidated_id snapshot
              "SYSTEM-AUTO",
            ]
          );

          await client.query(
            `UPDATE greentarget.adjustment_documents
                SET uuid = $1,
                    submission_uid = $2,
                    long_id = $3,
                    datetime_validated = $4,
                    einvoice_status = $5
              WHERE id = ANY($6::text[])`,
            [
              uuid,
              submissionResult.submissionUid || null,
              longId,
              dateTimeValidated ? new Date(dateTimeValidated) : null,
              status,
              ids,
            ]
          );

          await client.query("COMMIT");
          console.log(
            `[${now.toISOString()}] ${cfg.label}: auto-consolidated ${
              lockedDocs.length
            } ${type}(s) into ${consolidatedId} (status: ${status})`
          );
        } catch (groupError) {
          await client.query("ROLLBACK");
          console.error(
            `[${now.toISOString()}] ${cfg.label}: failed to consolidate ${type} group ${parentId}:`,
            groupError.message
          );
        }
      }
    } catch (typeError) {
      console.error(
        `[${now.toISOString()}] ${cfg.label}: error processing ${type} consolidation:`,
        typeError
      );
    } finally {
      client.release();
    }
  }
}

/**
 * Server cron entry point — processes adjustment doc consolidation for both
 * Tien Hock and Jelly Polly. Skips early if not in the days 3-7 window.
 */
export async function checkAndProcessDueAdjustmentConsolidations(pool) {
  const now = new Date();
  const window = checkIfInWindow(now);
  if (!window.inWindow) {
    console.log(
      `[${now.toISOString()}] Adjustment consolidation: not in window, skipping`
    );
    return;
  }

  // Tien Hock
  const thApiClient = EInvoiceApiClientFactory.getInstance({
    MYINVOIS_API_BASE_URL,
    MYINVOIS_CLIENT_ID,
    MYINVOIS_CLIENT_SECRET,
  });
  const thSubmissionHandler = new EInvoiceSubmissionHandler(thApiClient);

  await processCompany(pool, {
    label: "Tien Hock",
    tables: { docs: "adjustment_documents", invoices: "invoices" },
    supplierInfo: TIENHOCK_INFO,
    submissionHandler: thSubmissionHandler,
  });

  // Jelly Polly
  const jpApiClient = JPEInvoiceApiClientFactory.getInstance({
    MYINVOIS_API_BASE_URL,
    MYINVOIS_JP_CLIENT_ID,
    MYINVOIS_JP_CLIENT_SECRET,
  });
  const jpSubmissionHandler = new JPEInvoiceSubmissionHandler(jpApiClient);

  await processCompany(pool, {
    label: "Jelly Polly",
    tables: {
      docs: "jellypolly.adjustment_documents",
      invoices: "jellypolly.invoices",
    },
    supplierInfo: JELLYPOLLY_INFO,
    submissionHandler: jpSubmissionHandler,
  });

  // Green Target — separate processor (column names diverge).
  const gtApiClient = GTEInvoiceApiClientFactory.getInstance({
    MYINVOIS_API_BASE_URL,
    MYINVOIS_GT_CLIENT_ID,
    MYINVOIS_GT_CLIENT_SECRET,
  });
  const gtSubmissionHandler = new GTEInvoiceSubmissionHandler(gtApiClient);

  await processGreenTargetAdjustmentConsolidation(pool, {
    label: "Green Target",
    supplierInfo: GREENTARGET_INFO,
    submissionHandler: gtSubmissionHandler,
  });
}
