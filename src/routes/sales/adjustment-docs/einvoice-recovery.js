import { formatAdjustmentDocId } from "../../../utils/adjustments/formatDocId.js";

/**
 * @typedef {{uuid?: string, internalId?: string, status?: string, typeName?: string,
 * issuerTin?: string, totalPayableAmount?: number|string, longId?: string,
 * submissionUid?: string, dateTimeValidated?: string, dateTimeValidation?: string}} RemoteDocument
 * @typedef {{makeApiCall: (method: string, path: string) => Promise<any>}} ApiClient
 * @typedef {{id: string, display_id?: string, uuid?: string|null,
 * submission_uid?: string|null}} DocumentLink
 */

/**
 * Recover missing UUIDs using the submission reference, matching the actual
 * document number rather than assuming the first result belongs to this note.
 * @param {ApiClient|null} apiClient
 * @param {DocumentLink} doc
 * @returns {Promise<RemoteDocument>}
 */
export async function getAdjustmentRemoteDocument(apiClient, doc) {
  if (!apiClient) throw new Error("MyInvois API client is not configured");
  if (doc.uuid) {
    return apiClient.makeApiCall("GET", `/api/v1.0/documents/${encodeURIComponent(doc.uuid)}/details`);
  }
  if (!doc.submission_uid) {
    throw new Error("No MyInvois UUID or submission ID. Enter the UUID to link an existing e-Invoice.");
  }
  /** @type {string} */
  const expectedId = formatAdjustmentDocId(doc.display_id || doc.id);
  /** @type {number} */
  let pageNo = 1;
  /** @type {number} */
  let seen = 0;
  do {
    /** @type {{overallStatus?: string, documentCount?: number, documentSummary?: RemoteDocument[]}} */
    const submission = await apiClient.makeApiCall(
      "GET", `/api/v1.0/documentsubmissions/${encodeURIComponent(doc.submission_uid)}?pageNo=${pageNo}&pageSize=100`
    );
    /** @type {RemoteDocument[]} */
    const documents = submission.documentSummary || [];
    /** @type {RemoteDocument|undefined} */
    const match = documents.find((/** @type {RemoteDocument} */ item) =>
      formatAdjustmentDocId(item.internalId) === expectedId
    );
    if (match) return match;
    // A completed, wholly rejected submission has no accepted document UUIDs.
    if (submission.overallStatus?.toLowerCase() === "invalid" && submission.documentCount === 0 && documents.length === 0) {
      return { status: "Invalid" };
    }
    seen += documents.length;
    if (documents.length === 0 || seen >= Number(submission.documentCount || 0)) break;
    pageNo++;
  } while (pageNo <= 100);
  throw new Error("MyInvois has not returned this document's status. Nothing was cleared. Enter its UUID if it is already valid in MyInvois.");
}

/**
 * @param {import('express').Router} router
 * @param {import('pg').Pool} pool
 * @param {ApiClient|null} apiClient
 * @param {string} table Trusted company table from the route configuration.
 * @param {{tin: string}} supplier
 * @returns {void}
 */
export function registerAdjustmentRecoveryRoutes(router, pool, apiClient, table, supplier) {
  router.put("/:id/uuid", async (req, res) => {
    /** @type {string} */
    const uuid = typeof req.body?.uuid === "string" ? req.body.uuid.trim() : "";
    if (!/^[A-Za-z0-9]{1,64}$/.test(uuid)) {
      return res.status(400).json({ message: "Enter a valid MyInvois UUID" });
    }
    /** @type {import('pg').PoolClient} */
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${table}:uuid:${uuid}`]);
      /** @type {import('pg').QueryResult} */
      const result = await client.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [req.params.id]);
      /** @type {Record<string, any>|undefined} */
      const doc = result.rows[0];
      if (!doc) throw new Error("Document not found");
      if (doc.status !== "active" || doc.einvoice_status === "valid") {
        throw new Error("Only active adjustment documents without a valid e-Invoice can be linked.");
      }
      if (doc.uuid && doc.uuid !== uuid && doc.einvoice_status === "pending") {
        throw new Error("This document has a different pending UUID. Update its status before replacing its link.");
      }
      /** @type {import('pg').QueryResult} */
      const consolidated = await client.query(
        `SELECT id FROM ${table} WHERE is_consolidated = TRUE AND status = 'active'
           AND consolidated_adjustments::jsonb ? $1 LIMIT 1`, [doc.id]
      );
      if (doc.is_consolidated || consolidated.rows.length > 0) {
        throw new Error("Individual UUID linking is not available for consolidated adjustment documents. Update the consolidated document's status.");
      }
      /** @type {import('pg').QueryResult} */
      const duplicate = await client.query(`SELECT id FROM ${table} WHERE uuid = $1 AND id <> $2 LIMIT 1`, [uuid, doc.id]);
      if (duplicate.rows.length > 0) throw new Error("This UUID is already linked to another adjustment document.");
      /** @type {RemoteDocument} */
      const remote = await getAdjustmentRemoteDocument(apiClient, { id: doc.id, uuid });
      /** @type {Record<string, string>} */
      const types = { credit_note: "credit note", debit_note: "debit note", refund_note: "refund note" };
      if (remote.uuid !== uuid || remote.status?.toLowerCase() !== "valid") {
        throw new Error("MyInvois must confirm this UUID is valid before it can be linked.");
      }
      if (formatAdjustmentDocId(remote.internalId) !== formatAdjustmentDocId(doc.display_id || doc.id) ||
          !types[doc.type] || remote.typeName?.toLowerCase() !== types[doc.type] || remote.issuerTin !== supplier.tin) {
        throw new Error("The MyInvois document number, adjustment type or supplier does not match this document.");
      }
      if (remote.totalPayableAmount == null || !Number.isFinite(Number(remote.totalPayableAmount)) ||
          !Number.isFinite(Number(doc.totalamountpayable ?? doc.total_amount)) ||
          Math.abs(Number(remote.totalPayableAmount) - Number(doc.totalamountpayable ?? doc.total_amount)) > 0.005) {
        throw new Error("The MyInvois total does not match this adjustment document.");
      }
      if (!remote.longId || !remote.submissionUid || !remote.dateTimeValidated || !Number.isFinite(Date.parse(remote.dateTimeValidated))) {
        throw new Error("MyInvois returned incomplete validation details. No link was saved.");
      }
      await client.query(
        `UPDATE ${table} SET uuid = $1, submission_uid = $2, long_id = $3,
           datetime_validated = $4, einvoice_status = 'valid' WHERE id = $5`,
        [uuid, remote.submissionUid, remote.longId, remote.dateTimeValidated, doc.id]
      );
      await client.query("COMMIT");
      res.json({ message: "Valid e-Invoice linked successfully", uuid, status: "valid" });
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(400).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  router.post("/:id/clear-einvoice-status", async (req, res) => {
    /** @type {import('pg').PoolClient} */
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      /** @type {import('pg').QueryResult} */
      const result = await client.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [req.params.id]);
      /** @type {Record<string, any>|undefined} */
      const doc = result.rows[0];
      if (!doc || doc.status !== "active" || ![null, "invalid", "pending"].includes(doc.einvoice_status)) {
        throw new Error("Document not in a clearable e-invoice state");
      }
      if (doc.einvoice_status === "pending") {
        /** @type {import('pg').QueryResult} */
        const consolidated = await client.query(
          `SELECT id FROM ${table} WHERE is_consolidated = TRUE AND status = 'active'
             AND consolidated_adjustments::jsonb ? $1 LIMIT 1`, [doc.id]
        );
        if (doc.is_consolidated || consolidated.rows.length > 0) {
          throw new Error("Update the consolidated document's status before clearing its adjustment documents.");
        }
        if (doc.long_id || doc.datetime_validated) {
          throw new Error("This document has validation details. Update its status or link its valid UUID instead.");
        }
        if (doc.uuid || doc.submission_uid) {
          /** @type {RemoteDocument} */
          const remote = await getAdjustmentRemoteDocument(apiClient, doc);
          if (!["invalid", "cancelled"].includes(remote.status?.toLowerCase())) {
            throw new Error("MyInvois has not confirmed a failed or cancelled document. Update Status or enter its valid UUID instead of clearing it.");
          }
        }
      }
      /** @type {import('pg').QueryResult} */
      const cleared = await client.query(
        `UPDATE ${table} SET einvoice_status = NULL, uuid = NULL, submission_uid = NULL,
           long_id = NULL, datetime_validated = NULL WHERE id = $1 RETURNING id, einvoice_status`, [doc.id]
      );
      await client.query("COMMIT");
      res.json({ message: "E-invoice status cleared", document: cleared.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(400).json({ message: error.message });
    } finally {
      client.release();
    }
  });
}
