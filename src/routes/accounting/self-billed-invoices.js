import express, { Router } from "express";
import path from "path";
import EInvoiceApiClientFactory from "../../utils/invoice/einvoice/EInvoiceApiClientFactory.js";
import EInvoiceSubmissionHandler from "../../utils/invoice/einvoice/EInvoiceSubmissionHandler.js";
import { SelfBilledInvoiceTemplate } from "../../utils/invoice/einvoice/SelfBilledInvoiceTemplate.js";
import {
  deleteObjectFromS3,
  getObjectFromS3,
  isS3ObjectStorageEnabled,
  uploadObjectToS3,
} from "../../utils/s3-backup.js";
import { NODE_ENV } from "../../configs/config.js";

const FOREIGN_SUPPLIER_TIN = "EI00000000030";
const DEFAULT_TRANSACTION_TYPE = "Importation of goods";
const DEFAULT_CURRENCY = "CNY";
const DEFAULT_CLASSIFICATION = "034";
const DEFAULT_TAX_TYPE = "06";
const PURCHASE_KIND_FOREIGN = "foreign";
const PURCHASE_KIND_LOCAL = "local";
const LOCAL_STATUS_ACTIVE = "active";
const LOCAL_STATUS_CANCELLED = "cancelled";
const MAX_SUPPORTING_DOCUMENT_BYTES = 25 * 1024 * 1024;
const ALLOWED_SUPPORTING_DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
]);
const ALLOWED_SUPPORTING_DOCUMENT_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

function normalizeText(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const trimmed = value.toString().trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeStockDescription(value) {
  return normalizeText(value, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeUpper(value, fallback) {
  const normalized = normalizeText(value, fallback);
  return normalized ? normalized.toUpperCase() : fallback;
}

function parseDecimal(value, fallback = 0) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNullableDecimal(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isLockedInvoice(invoice) {
  return (
    invoice?.invoice_status === LOCAL_STATUS_CANCELLED ||
    invoice?.einvoice_status === "pending" ||
    invoice?.einvoice_status === "valid" ||
    invoice?.einvoice_status === "cancelled"
  );
}

function isCancelledInvoice(invoice) {
  return invoice?.invoice_status === LOCAL_STATUS_CANCELLED;
}

function sanitizeFilename(filename) {
  const basename = path.basename(normalizeText(filename, "supporting-document"));
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

function isAllowedSupportingDocument(filename, contentType) {
  const extension = path.extname(filename).toLowerCase();
  const normalizedContentType = normalizeText(contentType, "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!ALLOWED_SUPPORTING_DOCUMENT_EXTENSIONS.has(extension)) {
    return false;
  }

  return (
    ALLOWED_SUPPORTING_DOCUMENT_CONTENT_TYPES.has(normalizedContentType) ||
    normalizedContentType === "application/octet-stream"
  );
}

function buildSupportingDocumentKey(invoiceId, filename) {
  const env = NODE_ENV || "development";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${env}/self-billed-invoices/${invoiceId}/supporting-document/${timestamp}-${sanitizeFilename(filename)}`;
}

function setDownloadHeaders(res, invoice, s3Object) {
  const filename = sanitizeFilename(invoice.supporting_document_filename);
  const contentType =
    invoice.supporting_document_content_type ||
    s3Object.ContentType ||
    "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/"/g, "")}"`
  );
  if (invoice.supporting_document_size || s3Object.ContentLength) {
    res.setHeader(
      "Content-Length",
      String(invoice.supporting_document_size || s3Object.ContentLength)
    );
  }
}

async function generatePurchaseNo(client, purchaseKind = PURCHASE_KIND_FOREIGN) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = purchaseKind === PURCHASE_KIND_LOCAL ? `GP${year}${month}` : `SB${year}${month}`;
  const result = await client.query(
    `SELECT self_billed_no
     FROM self_billed_invoices
     WHERE self_billed_no LIKE $1
     ORDER BY self_billed_no DESC
     LIMIT 1`,
    [`${prefix}%`]
  );

  if (result.rows.length === 0) {
    return `${prefix}0001`;
  }

  const lastNumber = Number.parseInt(
    result.rows[0].self_billed_no.replace(prefix, ""),
    10
  );
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

async function generateSelfBilledNo(client) {
  return generatePurchaseNo(client, PURCHASE_KIND_FOREIGN);
}

function sanitizeSupplierPayload(payload = {}) {
  return {
    supplier_name: normalizeText(payload.supplier_name || payload.name),
    tin_number: FOREIGN_SUPPLIER_TIN,
    id_type: normalizeUpper(payload.id_type, "BRN"),
    id_number: normalizeText(payload.id_number, "NA"),
    sst_number: normalizeText(payload.sst_number, "NA"),
    ttx_number: normalizeText(payload.ttx_number, "NA"),
    msic_code: normalizeText(payload.msic_code, "00000"),
    business_activity_description: normalizeText(
      payload.business_activity_description,
      "NA"
    ),
    address_line_0: normalizeText(payload.address_line_0),
    address_line_1: normalizeText(payload.address_line_1),
    address_line_2: normalizeText(payload.address_line_2),
    city: normalizeText(payload.city),
    postcode: normalizeText(payload.postcode),
    state_code: normalizeText(payload.state_code, "17"),
    country_code: normalizeUpper(payload.country_code, "CHN"),
    contact_number: normalizeText(payload.contact_number, "NA"),
    email: normalizeText(payload.email),
    notes: normalizeText(payload.notes),
    is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
  };
}

function validateSupplier(supplier) {
  const errors = [];
  if (!supplier.supplier_name) errors.push("Supplier name is required");
  if (!supplier.address_line_0) errors.push("Supplier address is required");
  if (!supplier.city) errors.push("Supplier city is required");
  if (!supplier.country_code) errors.push("Supplier country code is required");
  return errors;
}

function sanitizeLines(lines, fxRate, purchaseKind = PURCHASE_KIND_FOREIGN) {
  return lines.map((line, index) => {
    const lineId = Number.parseInt(line.id, 10);
    const quantity = parseDecimal(line.quantity, 1);
    const unitPriceForeign = parseDecimal(line.unit_price_foreign, 0);
    const amountForeign = parseDecimal(line.amount_foreign, 0);
    const amountMyr = parseDecimal(line.amount_myr, 0);
    const stockAppendTargetLineId = Number.parseInt(
      line.stock_append_target_line_id,
      10
    );

    return {
      id: Number.isInteger(lineId) ? lineId : null,
      line_number: Number.parseInt(line.line_number || index + 1, 10),
      description: normalizeText(line.description),
      quantity,
      balance_quantity: parseNullableDecimal(line.balance_quantity),
      unit_price_foreign: unitPriceForeign,
      amount_foreign: amountForeign,
      amount_myr: amountMyr,
      classification_code: normalizeText(line.classification_code, DEFAULT_CLASSIFICATION),
      tax_type: normalizeText(line.tax_type, DEFAULT_TAX_TYPE),
      tax_rate: parseDecimal(line.tax_rate, 0),
      tax_amount_myr: parseDecimal(line.tax_amount_myr, 0),
      tax_exemption_reason: normalizeText(line.tax_exemption_reason),
      customs_form_reference: normalizeText(line.customs_form_reference),
      general_stock_category_id: line.general_stock_category_id
        ? Number.parseInt(line.general_stock_category_id, 10)
        : null,
      account_code: normalizeText(line.account_code),
      stock_append_target_line_id: Number.isInteger(stockAppendTargetLineId)
        ? stockAppendTargetLineId
        : null,
      notes: normalizeText(line.notes),
    };
  });
}

function sanitizeInvoicePayload(payload = {}) {
  const purchaseKind =
    payload.purchase_kind === PURCHASE_KIND_LOCAL ? PURCHASE_KIND_LOCAL : PURCHASE_KIND_FOREIGN;
  const fxRate = purchaseKind === PURCHASE_KIND_LOCAL ? 1 : parseDecimal(payload.fx_rate, 1);
  const lines = sanitizeLines(Array.isArray(payload.lines) ? payload.lines : [], fxRate, purchaseKind);
  const lineTotalForeignAmount = lines.reduce(
    (sum, line) => sum + line.amount_foreign,
    0
  );
  const lineTotalExcludingTaxMyr = lines.reduce((sum, line) => sum + line.amount_myr, 0);
  const lineTaxAmountMyr = lines.reduce((sum, line) => sum + line.tax_amount_myr, 0);
  const payloadTotalForeignAmount = parseDecimal(payload.total_foreign_amount, Number.NaN);
  const payloadTotalExcludingTaxMyr = parseDecimal(payload.total_excluding_tax_myr, Number.NaN);
  const payloadTaxAmountMyr = parseDecimal(payload.tax_amount_myr, Number.NaN);
  const totalExcludingTaxMyr = Number.isFinite(payloadTotalExcludingTaxMyr)
    ? payloadTotalExcludingTaxMyr
    : lineTotalExcludingTaxMyr;
  const taxAmountMyr = Number.isFinite(payloadTaxAmountMyr)
    ? payloadTaxAmountMyr
    : lineTaxAmountMyr;
  const totalForeignAmount = Number.isFinite(payloadTotalForeignAmount)
    ? payloadTotalForeignAmount
    : purchaseKind === PURCHASE_KIND_LOCAL
    ? totalExcludingTaxMyr
    : lineTotalForeignAmount || (fxRate > 0 ? totalExcludingTaxMyr / fxRate : totalExcludingTaxMyr);
  const accountCode =
    normalizeText(payload.account_code) ||
    lines.find((line) => line.account_code)?.account_code ||
    null;

  return {
    purchase_kind: purchaseKind,
    foreign_supplier_id: payload.foreign_supplier_id
      ? Number.parseInt(payload.foreign_supplier_id, 10)
      : null,
    supplier: sanitizeSupplierPayload(payload.supplier || {}),
    local_supplier_name: normalizeText(payload.local_supplier_name),
    self_billed_no: normalizeText(payload.self_billed_no),
    purchase_date: normalizeText(payload.purchase_date),
    transaction_type: normalizeText(
      payload.transaction_type,
      purchaseKind === PURCHASE_KIND_LOCAL ? "Local general purchase" : DEFAULT_TRANSACTION_TYPE
    ),
    platform: normalizeText(payload.platform),
    order_no: normalizeText(payload.order_no),
    payment_reference: normalizeText(payload.payment_reference),
    shipping_method: normalizeText(payload.shipping_method),
    shipping_number: normalizeText(payload.shipping_number),
    has_supporting_document: Boolean(payload.has_supporting_document),
    supporting_document_notes: normalizeText(payload.supporting_document_notes),
    currency_code: normalizeUpper(
      payload.currency_code,
      purchaseKind === PURCHASE_KIND_LOCAL ? "MYR" : DEFAULT_CURRENCY
    ),
    fx_rate: fxRate,
    account_code: accountCode,
    total_foreign_amount: totalForeignAmount,
    total_excluding_tax_myr: totalExcludingTaxMyr,
    tax_amount_myr: taxAmountMyr,
    total_including_tax_myr: totalExcludingTaxMyr + taxAmountMyr,
    payable_amount_myr: totalExcludingTaxMyr + taxAmountMyr,
    notes: normalizeText(payload.notes),
    lines,
  };
}

function validateInvoice(input) {
  const errors = [];
  if (!input.purchase_date) errors.push("Purchase date is required");
  if (input.purchase_kind === PURCHASE_KIND_LOCAL && !input.local_supplier_name) {
    errors.push("Supplier name is required");
  }
  if (!input.currency_code) errors.push("Currency is required");
  if (input.fx_rate <= 0) errors.push("FX rate must be greater than zero");
  if (!input.account_code) errors.push("GL account is required");
  if (input.purchase_kind !== PURCHASE_KIND_LOCAL && input.total_foreign_amount <= 0) {
    errors.push("Foreign total must be greater than zero");
  }
  if (input.total_excluding_tax_myr <= 0) {
    errors.push("MYR subtotal must be greater than zero");
  }
  if (input.tax_amount_myr < 0) {
    errors.push("Tax amount cannot be negative");
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    errors.push("At least one line item is required");
  }

  input.lines.forEach((line, index) => {
    const label = `Line ${index + 1}`;
    if (!line.description) errors.push(`${label}: description is required`);
    if (line.quantity <= 0) errors.push(`${label}: quantity must be greater than zero`);
    if (input.purchase_kind !== PURCHASE_KIND_LOCAL && !line.classification_code) {
      errors.push(`${label}: classification is required`);
    }
    if (input.purchase_kind !== PURCHASE_KIND_LOCAL && !line.tax_type) {
      errors.push(`${label}: tax type is required`);
    }
    if (line.stock_append_target_line_id && !(line.balance_quantity > 0)) {
      errors.push(`${label}: appended balance quantity must be greater than zero`);
    }
  });

  return errors;
}

async function upsertSupplier(client, input) {
  const supplier = sanitizeSupplierPayload(input);
  const validationErrors = validateSupplier(supplier);
  if (validationErrors.length > 0) {
    const error = new Error(validationErrors.join("; "));
    error.status = 400;
    throw error;
  }

  if (input.id) {
    const result = await client.query(
      `UPDATE self_billed_foreign_suppliers
       SET supplier_name = $1, tin_number = $2, id_type = $3, id_number = $4,
           sst_number = $5, ttx_number = $6, msic_code = $7,
           business_activity_description = $8, address_line_0 = $9,
           address_line_1 = $10, address_line_2 = $11, city = $12,
           postcode = $13, state_code = $14, country_code = $15,
           contact_number = $16, email = $17, notes = $18,
           is_active = $19, updated_at = CURRENT_TIMESTAMP
       WHERE id = $20
       RETURNING *`,
      [
        supplier.supplier_name,
        supplier.tin_number,
        supplier.id_type,
        supplier.id_number,
        supplier.sst_number,
        supplier.ttx_number,
        supplier.msic_code,
        supplier.business_activity_description,
        supplier.address_line_0,
        supplier.address_line_1,
        supplier.address_line_2,
        supplier.city,
        supplier.postcode,
        supplier.state_code,
        supplier.country_code,
        supplier.contact_number,
        supplier.email,
        supplier.notes,
        supplier.is_active,
        input.id,
      ]
    );

    if (result.rows.length === 0) {
      const error = new Error("Foreign supplier not found");
      error.status = 404;
      throw error;
    }
    return result.rows[0];
  }

  const existingResult = await client.query(
    "SELECT id FROM self_billed_foreign_suppliers WHERE supplier_name = $1",
    [supplier.supplier_name]
  );

  if (existingResult.rows.length > 0) {
    return upsertSupplier(client, { ...supplier, id: existingResult.rows[0].id });
  }

  const result = await client.query(
    `INSERT INTO self_billed_foreign_suppliers (
       supplier_name, tin_number, id_type, id_number, sst_number, ttx_number,
       msic_code, business_activity_description, address_line_0,
       address_line_1, address_line_2, city, postcode, state_code,
       country_code, contact_number, email, notes, is_active
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19
     )
     RETURNING *`,
    [
      supplier.supplier_name,
      supplier.tin_number,
      supplier.id_type,
      supplier.id_number,
      supplier.sst_number,
      supplier.ttx_number,
      supplier.msic_code,
      supplier.business_activity_description,
      supplier.address_line_0,
      supplier.address_line_1,
      supplier.address_line_2,
      supplier.city,
      supplier.postcode,
      supplier.state_code,
      supplier.country_code,
      supplier.contact_number,
      supplier.email,
      supplier.notes,
      supplier.is_active,
    ]
  );

  return result.rows[0];
}

async function getFullInvoice(poolOrClient, id) {
  const invoiceResult = await poolOrClient.query(
    `SELECT
       sbi.*, sbi.purchase_date::text AS purchase_date,
       fs.supplier_name, fs.tin_number, fs.id_type, fs.id_number,
       fs.sst_number, fs.ttx_number, fs.msic_code,
       fs.business_activity_description, fs.address_line_0,
       fs.address_line_1, fs.address_line_2, fs.city, fs.postcode,
       fs.state_code, fs.country_code, fs.contact_number, fs.email,
       fs.notes AS supplier_notes, fs.is_active AS supplier_is_active
     FROM self_billed_invoices sbi
     LEFT JOIN self_billed_foreign_suppliers fs ON sbi.foreign_supplier_id = fs.id
     WHERE sbi.id = $1`,
    [id]
  );

  if (invoiceResult.rows.length === 0) return null;

  const row = invoiceResult.rows[0];
  const linesResult = await poolOrClient.query(
    `SELECT
       sbil.*,
       append_link.self_billed_invoice_line_id AS stock_append_target_line_id
     FROM self_billed_invoice_lines sbil
     LEFT JOIN general_stock_adjustments append_link
       ON append_link.source_self_billed_invoice_line_id = sbil.id
      AND append_link.adjustment_quantity > 0
     WHERE sbil.self_billed_invoice_id = $1
     ORDER BY sbil.line_number ASC, sbil.id ASC`,
    [id]
  );

  const supplier = {
    id: row.foreign_supplier_id,
    supplier_name: row.supplier_name,
    tin_number: row.tin_number,
    id_type: row.id_type,
    id_number: row.id_number,
    sst_number: row.sst_number,
    ttx_number: row.ttx_number,
    msic_code: row.msic_code,
    business_activity_description: row.business_activity_description,
    address_line_0: row.address_line_0,
    address_line_1: row.address_line_1,
    address_line_2: row.address_line_2,
    city: row.city,
    postcode: row.postcode,
    state_code: row.state_code,
    country_code: row.country_code,
    contact_number: row.contact_number,
    email: row.email,
    notes: row.supplier_notes,
    is_active: row.supplier_is_active,
  };

  const customsLine = linesResult.rows.find((line) => line.customs_form_reference);

  return {
    id: row.id,
    purchase_kind: row.purchase_kind || PURCHASE_KIND_FOREIGN,
    foreign_supplier_id: row.foreign_supplier_id,
    local_supplier_name: row.local_supplier_name,
    self_billed_no: row.self_billed_no,
    purchase_no: row.self_billed_no,
    purchase_date: row.purchase_date,
    transaction_type: row.transaction_type,
    platform: row.platform,
    order_no: row.order_no,
    payment_reference: row.payment_reference,
    shipping_method: row.shipping_method,
    shipping_number: row.shipping_number,
    has_supporting_document: Boolean(row.supporting_document_s3_key),
    supporting_document_notes: row.supporting_document_notes,
    supporting_document_s3_key: row.supporting_document_s3_key,
    supporting_document_filename: row.supporting_document_filename,
    supporting_document_content_type: row.supporting_document_content_type,
    supporting_document_size: row.supporting_document_size,
    supporting_document_uploaded_at: row.supporting_document_uploaded_at,
    supporting_document_uploaded_by: row.supporting_document_uploaded_by,
    currency_code: row.currency_code,
    fx_rate: row.fx_rate,
    account_code:
      row.account_code ||
      linesResult.rows.find((line) => line.account_code)?.account_code ||
      null,
    total_foreign_amount: row.total_foreign_amount,
    total_excluding_tax_myr: row.total_excluding_tax_myr,
    tax_amount_myr: row.tax_amount_myr,
    total_including_tax_myr: row.total_including_tax_myr,
    payable_amount_myr: row.payable_amount_myr,
    uuid: row.uuid,
    submission_uid: row.submission_uid,
    long_id: row.long_id,
    datetime_validated: row.datetime_validated,
    invoice_status: row.invoice_status || LOCAL_STATUS_ACTIVE,
    einvoice_status: row.einvoice_status,
    cancellation_reason: row.cancellation_reason,
    notes: row.notes,
    journal_entry_id: row.journal_entry_id || null,
    amount_paid: row.amount_paid !== undefined ? Number(row.amount_paid) : 0,
    payment_status: row.payment_status || "unpaid",
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    supplier,
    customs_form_reference: customsLine?.customs_form_reference || null,
    lines: linesResult.rows,
  };
}

async function upsertStockAppendAdjustment(client, line, staffId) {
  const sourceLineId = Number.parseInt(line.id, 10);
  const targetLineId = Number.parseInt(line.stock_append_target_line_id, 10);

  if (!Number.isInteger(sourceLineId)) return;

  if (!Number.isInteger(targetLineId)) {
    await client.query(
      `DELETE FROM general_stock_adjustments
       WHERE source_self_billed_invoice_line_id = $1`,
      [sourceLineId]
    );
    return;
  }

  if (sourceLineId === targetLineId) {
    const error = new Error("A General stock item cannot append to itself");
    error.status = 400;
    throw error;
  }

  const targetResult = await client.query(
    `SELECT id, description, general_stock_category_id
     FROM self_billed_invoice_lines
     WHERE id = $1`,
    [targetLineId]
  );
  if (targetResult.rows.length === 0) {
    const error = new Error("Selected General stock item was not found");
    error.status = 400;
    throw error;
  }

  const adjustmentQuantity = parseDecimal(line.balance_quantity, 0);
  if (!(adjustmentQuantity > 0)) {
    const error = new Error("Appended General stock quantity must be greater than zero");
    error.status = 400;
    throw error;
  }

  const categoryId =
    line.general_stock_category_id ||
    targetResult.rows[0].general_stock_category_id ||
    null;

  await client.query(
    `UPDATE self_billed_invoice_lines
     SET description = $1,
         general_stock_category_id = $2
     WHERE id = $3`,
    [targetResult.rows[0].description, categoryId, sourceLineId]
  );

  await client.query(
    `INSERT INTO general_stock_adjustments (
       self_billed_invoice_line_id, source_self_billed_invoice_line_id,
       general_stock_category_id, adjustment_quantity, notes, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_self_billed_invoice_line_id)
       WHERE source_self_billed_invoice_line_id IS NOT NULL
     DO UPDATE SET
       self_billed_invoice_line_id = EXCLUDED.self_billed_invoice_line_id,
       general_stock_category_id = EXCLUDED.general_stock_category_id,
       adjustment_quantity = EXCLUDED.adjustment_quantity,
       notes = EXCLUDED.notes,
       updated_by = EXCLUDED.created_by,
       updated_at = CURRENT_TIMESTAMP`,
    [
      targetLineId,
      sourceLineId,
      categoryId,
      adjustmentQuantity,
      `Appended from line ${line.line_number}`,
      staffId || null,
    ]
  );
}

async function validateNewStockLineDescriptions(client, invoiceId, lines) {
  const retainedLineIds = new Set(
    lines
      .map((line) => Number.parseInt(line.id, 10))
      .filter((lineId) => Number.isInteger(lineId))
  );
  const existingResult = await client.query(
    `WITH append_sources AS (
       SELECT DISTINCT source_self_billed_invoice_line_id
       FROM general_stock_adjustments
       WHERE source_self_billed_invoice_line_id IS NOT NULL
         AND adjustment_quantity > 0
     )
     SELECT sbil.id, sbil.self_billed_invoice_id, sbil.description
     FROM self_billed_invoice_lines sbil
     LEFT JOIN append_sources aps ON aps.source_self_billed_invoice_line_id = sbil.id
     WHERE (sbil.balance_quantity IS NOT NULL
        OR sbil.general_stock_category_id IS NOT NULL)
       AND aps.source_self_billed_invoice_line_id IS NULL`
  );
  const existingRows = existingResult.rows.filter((row) => {
    if (Number(row.self_billed_invoice_id) !== Number(invoiceId)) return true;
    return retainedLineIds.has(Number(row.id));
  });
  const seenNewDescriptions = new Map();

  for (const line of lines) {
    if (line.stock_append_target_line_id) continue;
    if (
      line.balance_quantity === null &&
      line.general_stock_category_id === null
    ) {
      continue;
    }

    const normalizedDescription = normalizeStockDescription(line.description);
    if (!normalizedDescription) continue;

    const lineId = Number.parseInt(line.id, 10);
    const originalRow = Number.isInteger(lineId)
      ? existingRows.find((row) => Number(row.id) === lineId)
      : null;
    if (
      originalRow &&
      normalizeStockDescription(originalRow.description) === normalizedDescription
    ) {
      continue;
    }

    const existingDuplicate = existingRows.find(
      (row) =>
        Number(row.id) !== lineId &&
        normalizeStockDescription(row.description) === normalizedDescription
    );
    const duplicateLineNumber = seenNewDescriptions.get(normalizedDescription);

    if (existingDuplicate || duplicateLineNumber !== undefined) {
      const duplicateLabel = existingDuplicate
        ? `"${existingDuplicate.description}"`
        : `line ${duplicateLineNumber}`;
      const error = new Error(
        `Line ${line.line_number}: General stock item already exists as ${duplicateLabel}. Select the existing Stock Item to append balance instead.`
      );
      error.status = 400;
      throw error;
    }

    seenNewDescriptions.set(normalizedDescription, line.line_number);
  }
}

async function saveInvoiceLines(client, invoiceId, lines, staffId) {
  await validateNewStockLineDescriptions(client, invoiceId, lines);

  const insertLineQuery = `
    INSERT INTO self_billed_invoice_lines (
      self_billed_invoice_id, line_number, description, quantity,
      balance_quantity, unit_price_foreign, amount_foreign, amount_myr, classification_code,
      tax_type, tax_rate, tax_amount_myr, tax_exemption_reason,
      customs_form_reference, general_stock_category_id, account_code, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id
  `;
  const updateLineQuery = `
    UPDATE self_billed_invoice_lines
    SET line_number = $1,
        description = $2,
        quantity = $3,
        balance_quantity = $4,
        unit_price_foreign = $5,
        amount_foreign = $6,
        amount_myr = $7,
        classification_code = $8,
        tax_type = $9,
        tax_rate = $10,
        tax_amount_myr = $11,
        tax_exemption_reason = $12,
        customs_form_reference = $13,
        general_stock_category_id = $14,
        account_code = $15,
        notes = $16
    WHERE id = $17 AND self_billed_invoice_id = $18
    RETURNING id
  `;
  const existingResult = await client.query(
    `SELECT id
     FROM self_billed_invoice_lines
     WHERE self_billed_invoice_id = $1`,
    [invoiceId]
  );
  const existingIds = new Set(existingResult.rows.map((row) => Number(row.id)));
  const retainedIds = new Set();
  const savedLines = [];

  for (const line of lines) {
    const lineId = Number.parseInt(line.id, 10);
    let savedId = null;

    if (Number.isInteger(lineId) && existingIds.has(lineId)) {
      const result = await client.query(updateLineQuery, [
        line.line_number,
        line.description,
        line.quantity,
        line.balance_quantity,
        line.unit_price_foreign,
        line.amount_foreign,
        line.amount_myr,
        line.classification_code,
        line.tax_type,
        line.tax_rate,
        line.tax_amount_myr,
        line.tax_exemption_reason,
        line.customs_form_reference,
        line.general_stock_category_id,
        line.account_code,
        line.notes,
        lineId,
        invoiceId,
      ]);
      savedId = result.rows[0]?.id || null;
    } else {
      const result = await client.query(insertLineQuery, [
        invoiceId,
        line.line_number,
        line.description,
        line.quantity,
        line.balance_quantity,
        line.unit_price_foreign,
        line.amount_foreign,
        line.amount_myr,
        line.classification_code,
        line.tax_type,
        line.tax_rate,
        line.tax_amount_myr,
        line.tax_exemption_reason,
        line.customs_form_reference,
        line.general_stock_category_id,
        line.account_code,
        line.notes,
      ]);
      savedId = result.rows[0]?.id || null;
    }

    if (savedId) {
      retainedIds.add(Number(savedId));
      savedLines.push({ ...line, id: Number(savedId) });
    }
  }

  const removedIds = [...existingIds].filter((existingId) => !retainedIds.has(existingId));
  if (removedIds.length > 0) {
    await client.query(
      `DELETE FROM self_billed_invoice_lines
       WHERE self_billed_invoice_id = $1
         AND id = ANY($2::int[])`,
      [invoiceId, removedIds]
    );
  }

  for (const line of savedLines) {
    await upsertStockAppendAdjustment(client, line, staffId);
  }

  return savedLines;
}

async function generateGPReference(client, purchaseDate) {
  const date = new Date(purchaseDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid purchase date: ${purchaseDate}`);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const yearMonth = `${year}${month}`;
  const pattern = `GP-${yearMonth}-%`;

  const result = await client.query(
    `SELECT reference_no
     FROM journal_entries
     WHERE reference_no LIKE $1 AND entry_type = 'GP'
     ORDER BY reference_no DESC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [pattern]
  );

  let nextNumber = 1;
  if (result.rows.length > 0) {
    const match = result.rows[0].reference_no.match(/^GP-\d{6}-(\d+)$/);
    if (match) nextNumber = Number.parseInt(match[1], 10) + 1;
  }
  return `GP-${yearMonth}-${String(nextNumber).padStart(4, "0")}`;
}

async function validateAccountCode(client, accountCode) {
  const code = normalizeText(accountCode);
  if (!code) {
    const error = new Error("GL account is required");
    error.status = 400;
    throw error;
  }
  const result = await client.query(
    `SELECT code FROM account_codes WHERE code = $1 AND is_active = true`,
    [code]
  );
  if (result.rows.length === 0) {
    const error = new Error(`Unknown or inactive GL account code: ${code}`);
    error.status = 400;
    throw error;
  }
  return code;
}

function buildGPDescription(invoice, supplierName) {
  const trimmedSupplier = normalizeText(supplierName, "Unknown supplier");
  return `General purchase from ${trimmedSupplier} - ${invoice.self_billed_no}`;
}

async function createGPJournalEntry(
  client,
  invoice,
  lines,
  supplierName,
  staffId
) {
  const accountCode = await validateAccountCode(client, invoice.account_code);

  const totalAmount = Math.round(
    parseFloat(invoice.payable_amount_myr || 0) * 100
  ) / 100;
  if (!(totalAmount > 0)) {
    const error = new Error("Cannot post GP journal: payable amount must be greater than zero");
    error.status = 400;
    throw error;
  }

  // Verify Trade Payables exists (CR side)
  const tpResult = await client.query(
    `SELECT code FROM account_codes WHERE code = 'TP' AND is_active = true`
  );
  if (tpResult.rows.length === 0) {
    throw new Error("Trade Payables account 'TP' not found or inactive");
  }

  const referenceNo = await generateGPReference(client, invoice.purchase_date);

  const entryResult = await client.query(
    `INSERT INTO journal_entries (
       reference_no, entry_type, entry_date, description,
       total_debit, total_credit, status, created_at, created_by
     ) VALUES ($1, 'GP', $2, $3, $4, $5, 'posted', NOW(), $6)
     RETURNING id`,
    [
      referenceNo,
      invoice.purchase_date,
      buildGPDescription(invoice, supplierName),
      totalAmount,
      totalAmount,
      staffId || null,
    ]
  );
  const journalEntryId = entryResult.rows[0].id;

  const insertLineQuery = `
    INSERT INTO journal_entry_lines (
      journal_entry_id, line_number, account_code,
      debit_amount, credit_amount, reference, particulars, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  `;

  const particulars =
    lines
      .map((line) => line.description)
      .filter(Boolean)
      .join("; ")
      .slice(0, 500) || `General purchase - ${invoice.self_billed_no}`;

  await client.query(insertLineQuery, [
    journalEntryId,
    1,
    accountCode,
    totalAmount,
    0,
    invoice.self_billed_no,
    particulars,
  ]);

  await client.query(insertLineQuery, [
    journalEntryId,
    2,
    "TP",
    0,
    totalAmount,
    invoice.self_billed_no,
    `Payable to ${normalizeText(supplierName, "supplier")}`,
  ]);

  return journalEntryId;
}

async function updateGPJournalEntry(
  client,
  invoice,
  lines,
  supplierName,
  staffId
) {
  if (!invoice.journal_entry_id) {
    return createGPJournalEntry(client, invoice, lines, supplierName, staffId);
  }

  const accountCode = await validateAccountCode(client, invoice.account_code);

  const totalAmount = Math.round(
    parseFloat(invoice.payable_amount_myr || 0) * 100
  ) / 100;
  if (!(totalAmount > 0)) {
    const error = new Error("Cannot update GP journal: payable amount must be greater than zero");
    error.status = 400;
    throw error;
  }

  await client.query(
    `UPDATE journal_entries
     SET entry_date = $1, description = $2,
         total_debit = $3, total_credit = $4,
         status = 'posted', updated_at = NOW()
     WHERE id = $5 AND entry_type = 'GP'`,
    [
      invoice.purchase_date,
      buildGPDescription(invoice, supplierName),
      totalAmount,
      totalAmount,
      invoice.journal_entry_id,
    ]
  );

  await client.query(
    `DELETE FROM journal_entry_lines WHERE journal_entry_id = $1`,
    [invoice.journal_entry_id]
  );

  const insertLineQuery = `
    INSERT INTO journal_entry_lines (
      journal_entry_id, line_number, account_code,
      debit_amount, credit_amount, reference, particulars, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  `;

  const particulars =
    lines
      .map((line) => line.description)
      .filter(Boolean)
      .join("; ")
      .slice(0, 500) || `General purchase - ${invoice.self_billed_no}`;

  await client.query(insertLineQuery, [
    invoice.journal_entry_id,
    1,
    accountCode,
    totalAmount,
    0,
    invoice.self_billed_no,
    particulars,
  ]);

  await client.query(insertLineQuery, [
    invoice.journal_entry_id,
    2,
    "TP",
    0,
    totalAmount,
    invoice.self_billed_no,
    `Payable to ${normalizeText(supplierName, "supplier")}`,
  ]);

  return invoice.journal_entry_id;
}

async function cancelGPJournalEntry(client, journalEntryId) {
  if (!journalEntryId) return false;
  const result = await client.query(
    `UPDATE journal_entries
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND entry_type = 'GP' AND status = 'posted'
     RETURNING id`,
    [journalEntryId]
  );
  return result.rows.length > 0;
}

function statusFromDocumentDetails(documentDetails, fallbackStatus = "pending") {
  const remoteStatus = normalizeText(documentDetails.status, "").toLowerCase();
  if (remoteStatus === "cancelled") return "cancelled";
  if (remoteStatus === "valid") return "valid";
  if (remoteStatus === "invalid" || remoteStatus === "rejected") return "invalid";
  if (documentDetails.longId) return "valid";
  return fallbackStatus;
}

function getDocumentCode(document) {
  return (
    document?.internalId ||
    document?.invoiceCodeNumber ||
    document?.codeNumber ||
    null
  );
}

export default function (pool, config) {
  const router = Router();
  const apiClient = EInvoiceApiClientFactory.getInstance(config);
  const submissionHandler = new EInvoiceSubmissionHandler(apiClient);

  router.get("/features", (req, res) => {
    res.json({ s3Enabled: isS3ObjectStorageEnabled() });
  });

  router.get("/init", async (req, res) => {
    try {
      const categoriesResult = await pool.query(
        `SELECT id, name, sort_order, is_active, created_at, updated_at
         FROM general_stock_categories
         WHERE is_active = true
         ORDER BY sort_order ASC, name ASC`
      );
      res.json({
        s3Enabled: isS3ObjectStorageEnabled(),
        categories: categoriesResult.rows,
      });
    } catch (error) {
      console.error("Error fetching init data:", error);
      res.status(500).json({ message: "Error fetching init data", error: error.message });
    }
  });

  router.get("/foreign-suppliers", async (req, res) => {
    try {
      const { search = "", limit = 20 } = req.query;
      const params = [];
      let query = `
        SELECT *
        FROM self_billed_foreign_suppliers
        WHERE is_active = true
      `;

      if (search) {
        params.push(`%${search}%`);
        query += ` AND supplier_name ILIKE $${params.length}`;
      }

      params.push(Number.parseInt(limit, 10) || 20);
      query += ` ORDER BY supplier_name ASC LIMIT $${params.length}`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching self-billed foreign suppliers:", error);
      res.status(500).json({
        message: "Error fetching foreign suppliers",
        error: error.message,
      });
    }
  });

  router.post("/foreign-suppliers", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const supplier = await upsertSupplier(client, req.body);
      await client.query("COMMIT");
      res.status(201).json({ message: "Foreign supplier saved", supplier });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving self-billed foreign supplier:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error saving foreign supplier",
      });
    } finally {
      client.release();
    }
  });

  router.put("/foreign-suppliers/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const supplier = await upsertSupplier(client, {
        ...req.body,
        id: req.params.id,
      });
      await client.query("COMMIT");
      res.json({ message: "Foreign supplier updated", supplier });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating self-billed foreign supplier:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error updating foreign supplier",
      });
    } finally {
      client.release();
    }
  });

  router.get("/", async (req, res) => {
    try {
      const {
        search,
        status,
        invoice_status,
        einvoice_status,
        supplier_id,
        purchase_kind,
        start_date,
        end_date,
        limit = 100,
        offset = 0,
      } = req.query;

      const params = [];
      let query = `
        SELECT
          sbi.id, sbi.self_billed_no, sbi.self_billed_no AS purchase_no,
          COALESCE(sbi.purchase_kind, '${PURCHASE_KIND_FOREIGN}') AS purchase_kind,
          sbi.local_supplier_name,
          sbi.purchase_date::text AS purchase_date,
          sbi.transaction_type, sbi.platform, sbi.order_no, sbi.currency_code,
          sbi.total_foreign_amount, sbi.payable_amount_myr, sbi.uuid,
          sbi.long_id,
          COALESCE(sbi.invoice_status, '${LOCAL_STATUS_ACTIVE}') AS invoice_status,
          sbi.einvoice_status, sbi.created_at,
          (sbi.supporting_document_s3_key IS NOT NULL) AS has_supporting_document,
          sbi.supporting_document_filename, sbi.supporting_document_content_type,
          sbi.supporting_document_size, sbi.supporting_document_uploaded_at,
          COALESCE(fs.supplier_name, sbi.local_supplier_name) AS supplier_name
        FROM self_billed_invoices sbi
        LEFT JOIN self_billed_foreign_suppliers fs ON sbi.foreign_supplier_id = fs.id
        WHERE 1=1
      `;

      if (search) {
        params.push(`%${search}%`);
        query += ` AND (
          sbi.self_billed_no ILIKE $${params.length}
          OR fs.supplier_name ILIKE $${params.length}
          OR sbi.local_supplier_name ILIKE $${params.length}
          OR sbi.order_no ILIKE $${params.length}
          OR sbi.platform ILIKE $${params.length}
        )`;
      }

      if (purchase_kind) {
        params.push(purchase_kind);
        query += ` AND COALESCE(sbi.purchase_kind, '${PURCHASE_KIND_FOREIGN}') = $${params.length}`;
      }

      const invoiceStatusFilter = invoice_status;
      const eInvoiceStatusFilter = einvoice_status || status;

      if (invoiceStatusFilter) {
        params.push(invoiceStatusFilter);
        query += ` AND COALESCE(sbi.invoice_status, '${LOCAL_STATUS_ACTIVE}') = $${params.length}`;
      }

      if (eInvoiceStatusFilter === "draft") {
        query += " AND sbi.einvoice_status IS NULL";
      } else if (eInvoiceStatusFilter) {
        params.push(eInvoiceStatusFilter);
        query += ` AND sbi.einvoice_status = $${params.length}`;
      }

      if (supplier_id) {
        params.push(Number.parseInt(supplier_id, 10));
        query += ` AND sbi.foreign_supplier_id = $${params.length}`;
      }

      if (start_date) {
        params.push(start_date);
        query += ` AND sbi.purchase_date >= $${params.length}`;
      }

      if (end_date) {
        params.push(end_date);
        query += ` AND sbi.purchase_date <= $${params.length}`;
      }

      const countQuery = `SELECT COUNT(*) AS total FROM (${query}) counted`;
      const countResult = await pool.query(countQuery, params);

      params.push(Number.parseInt(limit, 10) || 100);
      query += ` ORDER BY sbi.purchase_date DESC, sbi.id DESC LIMIT $${params.length}`;
      params.push(Number.parseInt(offset, 10) || 0);
      query += ` OFFSET $${params.length}`;

      const result = await pool.query(query, params);
      res.json({
        invoices: result.rows,
        total: Number.parseInt(countResult.rows[0].total, 10),
      });
    } catch (error) {
      console.error("Error fetching self-billed invoices:", error);
      res.status(500).json({
        message: "Error fetching self-billed invoices",
        error: error.message,
      });
    }
  });

  router.post("/submit", async (req, res) => {
    const invoiceIds = Array.isArray(req.body?.invoiceIds)
      ? req.body.invoiceIds
          .map((invoiceId) => Number.parseInt(invoiceId, 10))
          .filter((invoiceId) => Number.isInteger(invoiceId))
      : [];

    if (invoiceIds.length === 0) {
      return res.status(400).json({ message: "No self-billed invoices selected" });
    }

    try {
      const transformedInvoices = [];
      const validationErrors = [];
      const invoiceCodeToId = new Map();

      for (const invoiceId of invoiceIds) {
        const invoice = await getFullInvoice(pool, invoiceId);
        const internalId = invoice?.self_billed_no || String(invoiceId);

        if (!invoice) {
          validationErrors.push({
            internalId,
            error: {
              code: "NOT_FOUND",
              message: `Self-billed invoice ${invoiceId} was not found`,
            },
          });
          continue;
        }

        if (invoice.purchase_kind === PURCHASE_KIND_LOCAL) {
          validationErrors.push({
            internalId,
            error: {
              code: "LOCAL_PURCHASE",
              message: "Local general purchases do not require e-invoice submission",
            },
          });
          continue;
        }

        if (isLockedInvoice(invoice)) {
          validationErrors.push({
            internalId,
            error: {
              code: "LOCKED_INVOICE",
              message:
                "Cancelled local invoices and pending, valid, or cancelled e-invoices cannot be submitted",
            },
          });
          continue;
        }

        const supplierErrors = validateSupplier(
          sanitizeSupplierPayload(invoice.supplier)
        );
        const invoiceErrors = validateInvoice(
          sanitizeInvoicePayload({
            ...invoice,
            supplier: invoice.supplier,
            lines: invoice.lines,
          })
        );

        if (supplierErrors.length > 0 || invoiceErrors.length > 0) {
          validationErrors.push({
            internalId,
            error: {
              code: "VALIDATION_ERROR",
              message: [...supplierErrors, ...invoiceErrors].join("; "),
            },
          });
          continue;
        }

        const xml = await SelfBilledInvoiceTemplate(invoice);
        transformedInvoices.push(xml);
        invoiceCodeToId.set(invoice.self_billed_no, invoice.id);
      }

      if (transformedInvoices.length === 0) {
        return res.json({
          success: false,
          message: "No eligible self-billed invoices to submit",
          shouldStopAtValidation: true,
          acceptedDocuments: [],
          rejectedDocuments: validationErrors,
          documentCount: invoiceIds.length,
          dateTimeReceived: new Date().toISOString(),
          overallStatus: "Invalid",
        });
      }

      const submissionResult = await submissionHandler.submitAndPollDocuments(
        transformedInvoices
      );

      if (validationErrors.length > 0) {
        submissionResult.rejectedDocuments = [
          ...(submissionResult.rejectedDocuments || []),
          ...validationErrors,
        ];
        submissionResult.overallStatus = "Partial";
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const document of submissionResult.acceptedDocuments || []) {
          const documentCode = getDocumentCode(document);
          const invoiceId = invoiceCodeToId.get(documentCode);
          if (!invoiceId) continue;

          const status = document.longId ? "valid" : "pending";
          await client.query(
            `UPDATE self_billed_invoices
             SET uuid = $1, submission_uid = $2, long_id = $3,
                 datetime_validated = $4, einvoice_status = $5,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [
              document.uuid || null,
              document.submissionUid || submissionResult.submissionUid || null,
              document.longId || null,
              document.dateTimeValidated || null,
              status,
              invoiceId,
            ]
          );
        }

        for (const document of submissionResult.rejectedDocuments || []) {
          const documentCode = getDocumentCode(document);
          const invoiceId = invoiceCodeToId.get(documentCode);
          if (!invoiceId) continue;

          await client.query(
            `UPDATE self_billed_invoices
             SET einvoice_status = 'invalid', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [invoiceId]
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      const acceptedCount = submissionResult.acceptedDocuments?.length || 0;
      const rejectedCount = submissionResult.rejectedDocuments?.length || 0;
      const statusCode =
        acceptedCount > 0 && rejectedCount > 0
          ? 202
          : acceptedCount > 0
          ? 201
          : 200;

      res.status(statusCode).json({
        ...submissionResult,
        message:
          acceptedCount > 0
            ? `Submitted ${acceptedCount} self-billed invoice(s) to MyInvois`
            : "Self-billed e-invoice submission failed",
      });
    } catch (error) {
      console.error("Error bulk submitting self-billed invoices:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error submitting self-billed invoices",
        error: error.response || null,
      });
    }
  });

  router.patch("/:id/record-fields", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await getFullInvoice(client, req.params.id);
      if (!existing) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      if (isCancelledInvoice(existing)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cancelled self-billed invoices cannot be edited",
        });
      }

      const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
      for (const line of lines) {
        const balanceQuantity = parseNullableDecimal(line.balance_quantity);
        const generalStockCategoryId = line.general_stock_category_id
          ? Number.parseInt(line.general_stock_category_id, 10)
          : null;
        const lineId = Number.parseInt(line.id, 10);
        const lineNumber = Number.parseInt(line.line_number, 10);
        const stockAppendTargetLineId = Number.parseInt(
          line.stock_append_target_line_id,
          10
        );
        let updatedLineId = null;

        if (Number.isInteger(lineId)) {
          const result = await client.query(
            `UPDATE self_billed_invoice_lines
             SET balance_quantity = $1, general_stock_category_id = $2
             WHERE id = $3 AND self_billed_invoice_id = $4
             RETURNING id, line_number, description, quantity, balance_quantity,
                       unit_price_foreign, amount_foreign, amount_myr,
                       classification_code, tax_type, tax_rate, tax_amount_myr,
                       tax_exemption_reason, customs_form_reference,
                       general_stock_category_id, account_code, notes`,
            [balanceQuantity, generalStockCategoryId, lineId, req.params.id]
          );
          updatedLineId = result.rows[0]?.id || null;
        } else if (Number.isInteger(lineNumber)) {
          const result = await client.query(
            `UPDATE self_billed_invoice_lines
             SET balance_quantity = $1, general_stock_category_id = $2
             WHERE self_billed_invoice_id = $3 AND line_number = $4
             RETURNING id, line_number, description, quantity, balance_quantity,
                       unit_price_foreign, amount_foreign, amount_myr,
                       classification_code, tax_type, tax_rate, tax_amount_myr,
                       tax_exemption_reason, customs_form_reference,
                       general_stock_category_id, account_code, notes`,
            [balanceQuantity, generalStockCategoryId, req.params.id, lineNumber]
          );
          updatedLineId = result.rows[0]?.id || null;
        }

        if (updatedLineId) {
          await upsertStockAppendAdjustment(
            client,
            {
              id: updatedLineId,
              line_number: lineNumber,
              balance_quantity: balanceQuantity,
              general_stock_category_id: generalStockCategoryId,
              stock_append_target_line_id: Number.isInteger(stockAppendTargetLineId)
                ? stockAppendTargetLineId
                : null,
            },
            req.staffId
          );
        }
      }

      await client.query(
        "UPDATE self_billed_invoices SET updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [req.params.id]
      );
      await client.query("COMMIT");
      res.json({ message: "Self-billed invoice record fields updated" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating self-billed record fields:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error updating self-billed record fields",
      });
    } finally {
      client.release();
    }
  });

  router.post(
    "/:id/supporting-document",
    express.raw({ type: "*/*", limit: MAX_SUPPORTING_DOCUMENT_BYTES }),
    async (req, res) => {
      try {
        const existing = await getFullInvoice(pool, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Self-billed invoice not found" });
        }
        if (isCancelledInvoice(existing)) {
          return res.status(400).json({
            message: "Cancelled self-billed invoices cannot be edited",
          });
        }
        if (!isS3ObjectStorageEnabled()) {
          return res.status(503).json({ message: "S3 storage is not configured" });
        }
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({ message: "Supporting document file is required" });
        }

        const filename = sanitizeFilename(req.query.filename);
        const contentType = normalizeText(req.headers["content-type"], "application/octet-stream")
          .split(";")[0]
          .trim()
          .toLowerCase();

        if (!isAllowedSupportingDocument(filename, contentType)) {
          return res.status(400).json({
            message: "Only PDF, Word document, and image files are supported",
          });
        }

        const s3Key = buildSupportingDocumentKey(req.params.id, filename);
        await uploadObjectToS3(s3Key, req.body, {
          contentType,
          metadata: {
            "self-billed-invoice-id": String(req.params.id),
            "original-filename": filename,
            "uploaded-by": String(req.staffId || ""),
          },
        });

        try {
          const result = await pool.query(
            `UPDATE self_billed_invoices
             SET has_supporting_document = true,
                 supporting_document_s3_key = $1,
                 supporting_document_filename = $2,
                 supporting_document_content_type = $3,
                 supporting_document_size = $4,
                 supporting_document_uploaded_at = CURRENT_TIMESTAMP,
                 supporting_document_uploaded_by = $5,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING has_supporting_document, supporting_document_filename,
               supporting_document_content_type, supporting_document_size,
               supporting_document_uploaded_at, supporting_document_uploaded_by`,
            [
              s3Key,
              filename,
              contentType,
              req.body.length,
              req.staffId || null,
              req.params.id,
            ]
          );

          if (
            existing.supporting_document_s3_key &&
            existing.supporting_document_s3_key !== s3Key
          ) {
            deleteObjectFromS3(existing.supporting_document_s3_key).catch((error) => {
              console.warn(
                `Failed to delete replaced self-billed supporting document: ${error.message}`
              );
            });
          }

          res.json({
            message: "Supporting document uploaded",
            document: result.rows[0],
          });
        } catch (error) {
          await deleteObjectFromS3(s3Key).catch(() => {});
          throw error;
        }
      } catch (error) {
        console.error("Error uploading self-billed supporting document:", error);
        res.status(error.status || 500).json({
          message: error.message || "Error uploading supporting document",
        });
      }
    }
  );

  router.get("/:id/supporting-document", async (req, res) => {
    try {
      const invoice = await getFullInvoice(pool, req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      if (!invoice.supporting_document_s3_key) {
        return res.status(404).json({ message: "No supporting document uploaded" });
      }

      const s3Object = await getObjectFromS3(invoice.supporting_document_s3_key);
      setDownloadHeaders(res, invoice, s3Object);

      if (s3Object.Body?.pipe) {
        s3Object.Body.pipe(res);
        return;
      }

      const chunks = [];
      for await (const chunk of s3Object.Body) {
        chunks.push(chunk);
      }
      res.end(Buffer.concat(chunks));
    } catch (error) {
      console.error("Error downloading self-billed supporting document:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error downloading supporting document",
      });
    }
  });

  router.delete("/:id/supporting-document", async (req, res) => {
    try {
      const existing = await getFullInvoice(pool, req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      if (isCancelledInvoice(existing)) {
        return res.status(400).json({
          message: "Cancelled self-billed invoices cannot be edited",
        });
      }

      if (existing.supporting_document_s3_key) {
        await deleteObjectFromS3(existing.supporting_document_s3_key);
      }

      await pool.query(
        `UPDATE self_billed_invoices
         SET has_supporting_document = false,
             supporting_document_s3_key = NULL,
             supporting_document_filename = NULL,
             supporting_document_content_type = NULL,
             supporting_document_size = NULL,
             supporting_document_uploaded_at = NULL,
             supporting_document_uploaded_by = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [req.params.id]
      );

      res.json({ message: "Supporting document removed" });
    } catch (error) {
      console.error("Error deleting self-billed supporting document:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error deleting supporting document",
      });
    }
  });

  router.get("/general-stock/categories", async (req, res) => {
    try {
      const includeInactive = req.query.include_inactive === "true";
      const result = await pool.query(
        `SELECT id, name, sort_order, is_active, created_at, updated_at
         FROM general_stock_categories
         WHERE $1::boolean = true OR is_active = true
         ORDER BY sort_order ASC, name ASC`,
        [includeInactive]
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching general stock categories:", error);
      res.status(500).json({
        message: "Error fetching general stock categories",
        error: error.message,
      });
    }
  });

  router.post("/general-stock/categories", async (req, res) => {
    try {
      const name = normalizeText(req.body?.name);
      const sortOrder = Number.parseInt(req.body?.sort_order, 10) || 0;
      if (!name) {
        return res.status(400).json({ message: "Category name is required" });
      }

      const result = await pool.query(
        `INSERT INTO general_stock_categories (name, sort_order, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (name)
         DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order,
                       updated_by = EXCLUDED.created_by, updated_at = CURRENT_TIMESTAMP
         RETURNING id, name, sort_order, is_active, created_at, updated_at`,
        [name, sortOrder, req.staffId || null]
      );

      res.status(201).json({ message: "General stock category saved", category: result.rows[0] });
    } catch (error) {
      console.error("Error saving general stock category:", error);
      res.status(500).json({
        message: "Error saving general stock category",
        error: error.message,
      });
    }
  });

  router.put("/general-stock/categories/:categoryId", async (req, res) => {
    try {
      const name = normalizeText(req.body?.name);
      const sortOrder = Number.parseInt(req.body?.sort_order, 10) || 0;
      const isActive = req.body?.is_active !== undefined ? Boolean(req.body.is_active) : true;
      if (!name) {
        return res.status(400).json({ message: "Category name is required" });
      }

      const result = await pool.query(
        `UPDATE general_stock_categories
         SET name = $1, sort_order = $2, is_active = $3,
             updated_by = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING id, name, sort_order, is_active, created_at, updated_at`,
        [name, sortOrder, isActive, req.staffId || null, req.params.categoryId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "General stock category not found" });
      }

      res.json({ message: "General stock category updated", category: result.rows[0] });
    } catch (error) {
      console.error("Error updating general stock category:", error);
      res.status(500).json({
        message: "Error updating general stock category",
        error: error.message,
      });
    }
  });

  router.delete("/general-stock/categories/:categoryId", async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE general_stock_categories
         SET is_active = false, updated_by = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id`,
        [req.staffId || null, req.params.categoryId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "General stock category not found" });
      }

      res.json({ message: "General stock category archived" });
    } catch (error) {
      console.error("Error archiving general stock category:", error);
      res.status(500).json({
        message: "Error archiving general stock category",
        error: error.message,
      });
    }
  });

  router.get("/general-stock/search", async (req, res) => {
    try {
      const search = normalizeText(req.query.search, "");
      const limit = Math.min(Number.parseInt(req.query.limit, 10) || 100, 200);
      const params = [];
      let searchClause = "";

      if (search) {
        params.push(`%${search}%`);
        searchClause = `AND (
          sbil.description ILIKE $${params.length}
          OR sbi.self_billed_no ILIKE $${params.length}
          OR COALESCE(fs.supplier_name, sbi.local_supplier_name, '') ILIKE $${params.length}
          OR COALESCE(gsc.name, 'Uncategorised') ILIKE $${params.length}
        )`;
      }

      params.push(limit);
      const result = await pool.query(
        `WITH stock_adjustment_totals AS (
           SELECT
             self_billed_invoice_line_id,
             SUM(adjustment_quantity) FILTER (WHERE adjustment_quantity > 0) AS appended_quantity,
             SUM(adjustment_quantity) FILTER (WHERE adjustment_quantity < 0) AS used_quantity
           FROM general_stock_adjustments
           GROUP BY self_billed_invoice_line_id
         ),
         append_sources AS (
           SELECT DISTINCT source_self_billed_invoice_line_id
           FROM general_stock_adjustments
           WHERE source_self_billed_invoice_line_id IS NOT NULL
             AND adjustment_quantity > 0
         )
         SELECT
           sbil.id AS line_id,
           sbil.self_billed_invoice_id,
           sbil.line_number,
           sbil.description,
           sbil.balance_quantity,
           COALESCE(sbil.balance_quantity, 0) AS base_balance_quantity,
           sbil.amount_myr,
           sbil.general_stock_category_id,
           COALESCE(gsc.name, 'Uncategorised') AS category_name,
           COALESCE(gsc.sort_order, 9999) AS category_sort_order,
           sbi.self_billed_no AS purchase_no,
           sbi.purchase_date::text AS purchase_date,
           COALESCE(sbi.purchase_kind, '${PURCHASE_KIND_FOREIGN}') AS purchase_kind,
           COALESCE(fs.supplier_name, sbi.local_supplier_name) AS supplier_name,
           COALESCE(sat.appended_quantity, 0) AS appended_quantity,
           COALESCE(sat.used_quantity, 0) AS used_quantity,
           COALESCE(sat.used_quantity, 0) AS adjustment_quantity,
           COALESCE(sbil.balance_quantity, 0)
             + COALESCE(sat.appended_quantity, 0)
             + COALESCE(sat.used_quantity, 0) AS current_stock
         FROM self_billed_invoice_lines sbil
         JOIN self_billed_invoices sbi ON sbi.id = sbil.self_billed_invoice_id
         LEFT JOIN self_billed_foreign_suppliers fs ON fs.id = sbi.foreign_supplier_id
         LEFT JOIN general_stock_categories gsc ON gsc.id = sbil.general_stock_category_id
         LEFT JOIN stock_adjustment_totals sat ON sat.self_billed_invoice_line_id = sbil.id
         LEFT JOIN append_sources aps ON aps.source_self_billed_invoice_line_id = sbil.id
         WHERE (sbil.balance_quantity IS NOT NULL
            OR sbil.general_stock_category_id IS NOT NULL)
           AND aps.source_self_billed_invoice_line_id IS NULL
           ${searchClause}
         ORDER BY sbi.purchase_date DESC, sbi.id DESC, sbil.line_number ASC
         LIMIT $${params.length}`,
        params
      );

      res.json({ rows: result.rows });
    } catch (error) {
      console.error("Error searching general stock:", error);
      res.status(500).json({
        message: "Error searching general stock",
        error: error.message,
      });
    }
  });

  router.get("/general-stock", async (req, res) => {
    try {
      const year = Number.parseInt(req.query.year, 10);
      const month = Number.parseInt(req.query.month, 10);
      const hasMonthFilter =
        Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;

      const monthFilterClause = hasMonthFilter
        ? `AND EXTRACT(YEAR FROM sbi.purchase_date) = $1
              AND EXTRACT(MONTH FROM sbi.purchase_date) = $2`
        : "";
      const monthFilterParams = hasMonthFilter ? [year, month] : [];

      const [result, categoriesResult] = await Promise.all([
        pool.query(
          `WITH stock_adjustment_totals AS (
             SELECT
               self_billed_invoice_line_id,
               SUM(adjustment_quantity) FILTER (WHERE adjustment_quantity > 0) AS appended_quantity,
               SUM(adjustment_quantity) FILTER (WHERE adjustment_quantity < 0) AS used_quantity
             FROM general_stock_adjustments
             GROUP BY self_billed_invoice_line_id
           ),
           used_adjustments AS (
             SELECT
               self_billed_invoice_line_id,
               json_agg(
                 json_build_object(
                   'id', id,
                   'adjustment_date', adjustment_date::text,
                   'adjustment_quantity', adjustment_quantity,
                   'notes', notes,
                   'created_at', created_at
                 )
                 ORDER BY created_at DESC, id DESC
               ) FILTER (WHERE adjustment_quantity < 0) AS used_adjustments
             FROM general_stock_adjustments
             GROUP BY self_billed_invoice_line_id
           ),
           append_sources AS (
             SELECT DISTINCT source_self_billed_invoice_line_id
             FROM general_stock_adjustments
             WHERE source_self_billed_invoice_line_id IS NOT NULL
               AND adjustment_quantity > 0
           )
           SELECT
             sbil.id AS line_id,
             sbil.self_billed_invoice_id,
             sbil.line_number,
             sbil.description,
             sbil.balance_quantity,
             COALESCE(sbil.balance_quantity, 0) AS base_balance_quantity,
             sbil.amount_myr,
             sbil.general_stock_category_id,
             COALESCE(gsc.name, 'Uncategorised') AS category_name,
             COALESCE(gsc.sort_order, 9999) AS category_sort_order,
             sbi.self_billed_no AS purchase_no,
             sbi.purchase_date::text AS purchase_date,
             COALESCE(sbi.purchase_kind, '${PURCHASE_KIND_FOREIGN}') AS purchase_kind,
             COALESCE(fs.supplier_name, sbi.local_supplier_name) AS supplier_name,
             COALESCE(sat.appended_quantity, 0) AS appended_quantity,
             COALESCE(sat.used_quantity, 0) AS used_quantity,
             COALESCE(sat.used_quantity, 0) AS adjustment_quantity,
             COALESCE(sbil.balance_quantity, 0)
               + COALESCE(sat.appended_quantity, 0)
               + COALESCE(sat.used_quantity, 0) AS current_stock,
             COALESCE(ua.used_adjustments, '[]'::json) AS used_adjustments
           FROM self_billed_invoice_lines sbil
           JOIN self_billed_invoices sbi ON sbi.id = sbil.self_billed_invoice_id
           LEFT JOIN self_billed_foreign_suppliers fs ON fs.id = sbi.foreign_supplier_id
           LEFT JOIN general_stock_categories gsc ON gsc.id = sbil.general_stock_category_id
           LEFT JOIN stock_adjustment_totals sat ON sat.self_billed_invoice_line_id = sbil.id
           LEFT JOIN used_adjustments ua ON ua.self_billed_invoice_line_id = sbil.id
           LEFT JOIN append_sources aps ON aps.source_self_billed_invoice_line_id = sbil.id
           WHERE (sbil.balance_quantity IS NOT NULL
              OR sbil.general_stock_category_id IS NOT NULL)
             AND aps.source_self_billed_invoice_line_id IS NULL
             ${monthFilterClause}
           ORDER BY COALESCE(gsc.sort_order, 9999), COALESCE(gsc.name, 'Uncategorised'),
                    sbi.purchase_date DESC, sbi.id DESC, sbil.line_number ASC`,
          monthFilterParams
        ),
        pool.query(
          `SELECT id, name, sort_order, is_active, created_at, updated_at
           FROM general_stock_categories
           WHERE is_active = true
           ORDER BY sort_order ASC, name ASC`
        ),
      ]);

      res.json({ rows: result.rows, categories: categoriesResult.rows });
    } catch (error) {
      console.error("Error fetching general stock:", error);
      res.status(500).json({
        message: "Error fetching general stock",
        error: error.message,
      });
    }
  });

  router.post("/general-stock/adjustments", async (req, res) => {
    const adjustments = Array.isArray(req.body?.adjustments)
      ? req.body.adjustments
      : [];

    if (adjustments.length === 0) {
      return res.status(400).json({ message: "At least one adjustment is required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let insertedCount = 0;
      let balanceUpdateCount = 0;

      for (const adjustment of adjustments) {
        const lineId = Number.parseInt(adjustment.self_billed_invoice_line_id || adjustment.line_id, 10);
        const categoryId = adjustment.general_stock_category_id
          ? Number.parseInt(adjustment.general_stock_category_id, 10)
          : null;
        const adjustmentQuantity = parseDecimal(adjustment.adjustment_quantity, 0);
        const notes = normalizeText(adjustment.notes);

        if (!Number.isInteger(lineId) || adjustmentQuantity === 0) continue;

        const lineResult = await client.query(
          `SELECT id, general_stock_category_id
           FROM self_billed_invoice_lines
           WHERE id = $1`,
          [lineId]
        );
        if (lineResult.rows.length === 0) continue;

        const finalCategoryId = categoryId || lineResult.rows[0].general_stock_category_id;

        if (adjustmentQuantity > 0) {
          await client.query(
            `UPDATE self_billed_invoice_lines
             SET balance_quantity = COALESCE(balance_quantity, 0) + $1,
                 general_stock_category_id = COALESCE($2, general_stock_category_id)
             WHERE id = $3`,
            [adjustmentQuantity, finalCategoryId, lineId]
          );
          balanceUpdateCount++;
        } else {
          await client.query(
            `INSERT INTO general_stock_adjustments (
               self_billed_invoice_line_id, general_stock_category_id,
               adjustment_quantity, notes, created_by
             ) VALUES ($1, $2, $3, $4, $5)`,
            [lineId, finalCategoryId, adjustmentQuantity, notes, req.staffId || null]
          );
          insertedCount++;
        }
      }

      await client.query("COMMIT");
      res.json({
        message: "General stock adjustments saved",
        inserted: insertedCount,
        balance_updates: balanceUpdateCount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving general stock adjustments:", error);
      res.status(500).json({
        message: "Error saving general stock adjustments",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  router.delete("/general-stock/adjustments/:adjustmentId", async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM general_stock_adjustments
         WHERE id = $1 AND adjustment_quantity < 0
         RETURNING id`,
        [req.params.adjustmentId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Used adjustment not found" });
      }

      res.json({ message: "Used adjustment reverted" });
    } catch (error) {
      console.error("Error reverting general stock adjustment:", error);
      res.status(500).json({
        message: "Error reverting general stock adjustment",
        error: error.message,
      });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const [invoice, categoriesResult] = await Promise.all([
        getFullInvoice(pool, req.params.id),
        pool.query(
          `SELECT id, name, sort_order, is_active, created_at, updated_at
           FROM general_stock_categories
           WHERE is_active = true
           ORDER BY sort_order ASC, name ASC`
        ),
      ]);
      if (!invoice) {
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      res.json({
        invoice,
        s3Enabled: isS3ObjectStorageEnabled(),
        categories: categoriesResult.rows,
      });
    } catch (error) {
      console.error("Error fetching self-billed invoice:", error);
      res.status(500).json({
        message: "Error fetching self-billed invoice",
        error: error.message,
      });
    }
  });

  router.post("/", async (req, res) => {
    const input = sanitizeInvoicePayload(req.body);
    const validationErrors = [
      ...(input.purchase_kind === PURCHASE_KIND_FOREIGN ? validateSupplier(input.supplier) : []),
      ...validateInvoice(input),
    ];

    if (validationErrors.length > 0) {
      return res.status(400).json({ message: validationErrors.join("; ") });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const supplier =
        input.purchase_kind === PURCHASE_KIND_LOCAL
          ? { id: null }
          : input.foreign_supplier_id && !input.supplier.supplier_name
          ? { id: input.foreign_supplier_id }
          : await upsertSupplier(client, {
              ...input.supplier,
              id: input.foreign_supplier_id || input.supplier.id,
            });
      const supplierId = supplier.id || input.foreign_supplier_id;
      const selfBilledNo = await generatePurchaseNo(client, input.purchase_kind);

      const duplicateResult = await client.query(
        "SELECT 1 FROM self_billed_invoices WHERE self_billed_no = $1",
        [selfBilledNo]
      );
      if (duplicateResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Self-billed number '${selfBilledNo}' already exists`,
        });
      }

      const invoiceResult = await client.query(
        `INSERT INTO self_billed_invoices (
           purchase_kind, foreign_supplier_id, local_supplier_name,
           self_billed_no, purchase_date, transaction_type,
           platform, order_no, payment_reference, shipping_method,
           shipping_number, has_supporting_document, supporting_document_notes,
           currency_code, fx_rate, account_code,
           total_foreign_amount, total_excluding_tax_myr, tax_amount_myr,
           total_including_tax_myr, payable_amount_myr, notes, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
         )
        RETURNING id`,
        [
          input.purchase_kind,
          supplierId,
          input.local_supplier_name,
          selfBilledNo,
          input.purchase_date,
          input.transaction_type,
          input.platform,
          input.order_no,
          input.payment_reference,
          input.shipping_method,
          input.shipping_number,
          false,
          input.supporting_document_notes,
          input.currency_code,
          input.fx_rate,
          input.account_code,
          input.total_foreign_amount,
          input.total_excluding_tax_myr,
          input.tax_amount_myr,
          input.total_including_tax_myr,
          input.payable_amount_myr,
          input.notes,
          req.staffId || null,
        ]
      );

      const invoiceId = invoiceResult.rows[0].id;
      const savedLines = await saveInvoiceLines(client, invoiceId, input.lines, req.staffId);

      const supplierName =
        input.purchase_kind === PURCHASE_KIND_LOCAL
          ? input.local_supplier_name
          : supplier?.supplier_name || input.supplier?.supplier_name;
      const journalEntryId = await createGPJournalEntry(
        client,
        {
          self_billed_no: selfBilledNo,
          purchase_date: input.purchase_date,
          account_code: input.account_code,
          payable_amount_myr: input.payable_amount_myr,
        },
        savedLines,
        supplierName,
        req.staffId
      );
      await client.query(
        `UPDATE self_billed_invoices SET journal_entry_id = $1 WHERE id = $2`,
        [journalEntryId, invoiceId]
      );
      await client.query("COMMIT");

      res.status(201).json({
        message: "General purchase created successfully",
        invoice: {
          id: invoiceId,
          self_billed_no: selfBilledNo,
          purchase_no: selfBilledNo,
          journal_entry_id: journalEntryId,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating self-billed invoice:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error creating self-billed invoice",
      });
    } finally {
      client.release();
    }
  });

  router.put("/:id", async (req, res) => {
    const input = sanitizeInvoicePayload(req.body);
    const validationErrors = [
      ...(input.purchase_kind === PURCHASE_KIND_FOREIGN ? validateSupplier(input.supplier) : []),
      ...validateInvoice(input),
    ];

    if (validationErrors.length > 0) {
      return res.status(400).json({ message: validationErrors.join("; ") });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await getFullInvoice(client, req.params.id);
      if (!existing) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      if (isLockedInvoice(existing)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Cancelled local invoices and pending, valid, or cancelled e-invoices cannot be edited",
        });
      }

      const supplier =
        input.purchase_kind === PURCHASE_KIND_LOCAL
          ? { id: null }
          : await upsertSupplier(client, {
              ...input.supplier,
              id: input.foreign_supplier_id || input.supplier.id || existing.foreign_supplier_id,
            });

      await client.query(
        `UPDATE self_billed_invoices
         SET purchase_kind = $1, foreign_supplier_id = $2, local_supplier_name = $3,
             self_billed_no = $4, purchase_date = $5,
             transaction_type = $6, platform = $7, order_no = $8,
             payment_reference = $9, shipping_method = $10, shipping_number = $11,
             has_supporting_document = $12, supporting_document_notes = $13,
             currency_code = $14, fx_rate = $15, account_code = $16,
             total_foreign_amount = $17, total_excluding_tax_myr = $18,
             tax_amount_myr = $19, total_including_tax_myr = $20,
             payable_amount_myr = $21, notes = $22,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $23`,
        [
          input.purchase_kind,
          supplier.id,
          input.local_supplier_name,
          existing.self_billed_no,
          input.purchase_date,
          input.transaction_type,
          input.platform,
          input.order_no,
          input.payment_reference,
          input.shipping_method,
          input.shipping_number,
          Boolean(existing.supporting_document_s3_key),
          input.supporting_document_notes,
          input.currency_code,
          input.fx_rate,
          input.account_code,
          input.total_foreign_amount,
          input.total_excluding_tax_myr,
          input.tax_amount_myr,
          input.total_including_tax_myr,
          input.payable_amount_myr,
          input.notes,
          req.params.id,
        ]
      );

      const savedLines = await saveInvoiceLines(
        client,
        req.params.id,
        input.lines,
        req.staffId
      );

      const supplierName =
        input.purchase_kind === PURCHASE_KIND_LOCAL
          ? input.local_supplier_name
          : supplier?.supplier_name ||
            input.supplier?.supplier_name ||
            existing.supplier?.supplier_name;
      const journalEntryId = await updateGPJournalEntry(
        client,
        {
          self_billed_no: existing.self_billed_no,
          purchase_date: input.purchase_date,
          account_code: input.account_code,
          payable_amount_myr: input.payable_amount_myr,
          journal_entry_id: existing.journal_entry_id,
        },
        savedLines,
        supplierName,
        req.staffId
      );
      if (!existing.journal_entry_id) {
        await client.query(
          `UPDATE self_billed_invoices SET journal_entry_id = $1 WHERE id = $2`,
          [journalEntryId, req.params.id]
        );
      }
      await client.query("COMMIT");

      res.json({
        message: "Self-billed invoice updated successfully",
        invoice: {
          id: Number.parseInt(req.params.id, 10),
          self_billed_no: existing.self_billed_no,
          journal_entry_id: journalEntryId,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating self-billed invoice:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error updating self-billed invoice",
      });
    } finally {
      client.release();
    }
  });

  router.delete("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await getFullInvoice(client, req.params.id);
      if (!existing) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      if (isLockedInvoice(existing)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Cancelled local invoices and pending, valid, or cancelled e-invoices cannot be deleted",
        });
      }

      const paymentBlock = await client.query(
        `SELECT 1 FROM supplier_payments
         WHERE invoice_source = 'self_billed_invoices'
           AND invoice_id = $1
           AND status <> 'cancelled'
         LIMIT 1`,
        [req.params.id]
      );
      if (paymentBlock.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cancel the linked supplier payment before deleting this invoice.",
        });
      }

      await cancelGPJournalEntry(client, existing.journal_entry_id);
      await client.query("DELETE FROM self_billed_invoices WHERE id = $1", [
        req.params.id,
      ]);
      await client.query("COMMIT");
      if (existing.supporting_document_s3_key) {
        deleteObjectFromS3(existing.supporting_document_s3_key).catch((error) => {
          console.warn(
            `Failed to delete self-billed supporting document after invoice delete: ${error.message}`
          );
        });
      }
      res.json({ message: `Self-billed invoice '${existing.self_billed_no}' deleted` });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting self-billed invoice:", error);
      res.status(500).json({
        message: "Error deleting self-billed invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  router.post("/:id/submit", async (req, res) => {
    try {
      const invoice = await getFullInvoice(pool, req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      if (invoice.purchase_kind === PURCHASE_KIND_LOCAL) {
        return res.status(400).json({
          message: "Local general purchases do not require e-invoice submission",
        });
      }
      if (isLockedInvoice(invoice)) {
        return res.status(400).json({
          message:
            "Cancelled local invoices and pending, valid, or cancelled e-invoices cannot be submitted",
        });
      }

      const supplierErrors = validateSupplier(sanitizeSupplierPayload(invoice.supplier));
      const invoiceErrors = validateInvoice(
        sanitizeInvoicePayload({
          ...invoice,
          supplier: invoice.supplier,
          lines: invoice.lines,
        })
      );
      if (supplierErrors.length > 0 || invoiceErrors.length > 0) {
        return res.status(400).json({
          message: [...supplierErrors, ...invoiceErrors].join("; "),
        });
      }

      const xml = await SelfBilledInvoiceTemplate(invoice);
      const submissionResult = await submissionHandler.submitAndPollDocuments([xml]);
      const acceptedDocument = submissionResult.acceptedDocuments?.[0];
      const rejectedDocument = submissionResult.rejectedDocuments?.[0];

      if (submissionResult.success && acceptedDocument) {
        const status = acceptedDocument.longId ? "valid" : "pending";
        await pool.query(
          `UPDATE self_billed_invoices
           SET uuid = $1, submission_uid = $2, long_id = $3,
               datetime_validated = $4, einvoice_status = $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $6`,
          [
            acceptedDocument.uuid || null,
            acceptedDocument.submissionUid || submissionResult.submissionUid || null,
            acceptedDocument.longId || null,
            acceptedDocument.dateTimeValidated || null,
            status,
            req.params.id,
          ]
        );
      } else if (rejectedDocument) {
        await pool.query(
          `UPDATE self_billed_invoices
           SET einvoice_status = 'invalid', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [req.params.id]
        );
      }

      res.status(submissionResult.success ? 201 : 422).json(submissionResult);
    } catch (error) {
      console.error("Error submitting self-billed invoice:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error submitting self-billed invoice",
        error: error.response || null,
      });
    }
  });

  router.put("/:id/refresh-status", async (req, res) => {
    try {
      const invoice = await getFullInvoice(pool, req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      if (!invoice.uuid) {
        return res.status(400).json({ message: "No MyInvois UUID to refresh" });
      }

      const documentDetails = await apiClient.makeApiCall(
        "GET",
        `/api/v1.0/documents/${invoice.uuid}/details`
      );
      const newStatus = statusFromDocumentDetails(
        documentDetails,
        invoice.einvoice_status || "pending"
      );

      await pool.query(
        `UPDATE self_billed_invoices
         SET einvoice_status = $1, long_id = $2, datetime_validated = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [
          newStatus,
          documentDetails.longId || invoice.long_id || null,
          documentDetails.dateTimeValidated || invoice.datetime_validated || null,
          req.params.id,
        ]
      );

      res.json({
        message: "Self-billed e-invoice status refreshed",
        status: newStatus,
        documentDetails,
      });
    } catch (error) {
      console.error("Error refreshing self-billed invoice status:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error refreshing self-billed invoice status",
        error: error.response || null,
      });
    }
  });

  router.post("/:id/cancel", async (req, res) => {
    const reason = normalizeText(req.body?.reason, "Cancelled via system");

    try {
      const invoice = await getFullInvoice(pool, req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      if (invoice.invoice_status === LOCAL_STATUS_CANCELLED) {
        return res.json({ message: "Self-billed invoice is already cancelled" });
      }

      const paymentBlock = await pool.query(
        `SELECT 1 FROM supplier_payments
         WHERE invoice_source = 'self_billed_invoices'
           AND invoice_id = $1
           AND status <> 'cancelled'
         LIMIT 1`,
        [req.params.id]
      );
      if (paymentBlock.rows.length > 0) {
        return res.status(400).json({
          message: "Cancel the linked supplier payment before cancelling this invoice.",
        });
      }

      let apiMessage = "No MyInvois UUID; local status updated only.";
      let nextEInvoiceStatus = invoice.einvoice_status;
      if (invoice.uuid && invoice.einvoice_status !== "cancelled") {
        try {
          await apiClient.makeApiCall(
            "PUT",
            `/api/v1.0/documents/state/${invoice.uuid}/state`,
            { status: "cancelled", reason }
          );
          apiMessage = "MyInvois document cancelled.";
          nextEInvoiceStatus = "cancelled";
        } catch (cancelError) {
          apiMessage = `Could not cancel in MyInvois: ${cancelError.message}`;
          if (cancelError.status === 400) {
            nextEInvoiceStatus = "cancelled";
            apiMessage =
              "MyInvois document may already be cancelled or no longer cancellable.";
          }
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await cancelGPJournalEntry(client, invoice.journal_entry_id);
        await client.query(
          `UPDATE self_billed_invoices
           SET invoice_status = $1, einvoice_status = $2, cancellation_reason = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [LOCAL_STATUS_CANCELLED, nextEInvoiceStatus, reason, req.params.id]
        );
        await client.query("COMMIT");
      } catch (txError) {
        await client.query("ROLLBACK");
        throw txError;
      } finally {
        client.release();
      }

      res.json({
        message: "Self-billed invoice cancelled",
        apiMessage,
      });
    } catch (error) {
      console.error("Error cancelling self-billed invoice:", error);
      res.status(error.status || 500).json({
        message: error.message || "Error cancelling self-billed invoice",
        error: error.response || null,
      });
    }
  });

  router.post("/:id/clear-status", async (req, res) => {
    try {
      const invoice = await getFullInvoice(pool, req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Self-billed invoice not found" });
      }
      if (invoice.invoice_status === LOCAL_STATUS_CANCELLED) {
        return res.status(400).json({
          message: "Cannot clear e-invoice status for a cancelled self-billed invoice",
        });
      }
      if (
        invoice.einvoice_status === "valid" ||
        invoice.einvoice_status === "cancelled"
      ) {
        return res.status(400).json({
          message: "Cannot clear a valid or cancelled MyInvois document status",
        });
      }

      await pool.query(
        `UPDATE self_billed_invoices
         SET uuid = NULL, submission_uid = NULL, long_id = NULL,
             datetime_validated = NULL, einvoice_status = NULL,
             cancellation_reason = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [req.params.id]
      );

      res.json({ message: "Self-billed e-invoice status cleared" });
    } catch (error) {
      console.error("Error clearing self-billed invoice status:", error);
      res.status(500).json({
        message: "Error clearing self-billed invoice status",
        error: error.message,
      });
    }
  });

  return router;
}
