// src/utils/invoice/autoConsolidation.js
import { EInvoiceConsolidatedTemplate } from "../invoice/einvoice/EInvoiceConsolidatedTemplate.js";
import { GTEInvoiceConsolidatedTemplate } from "../greenTarget/einvoice/GTEInvoiceConsolidatedTemplate.js";
import { JPEInvoiceConsolidatedTemplate } from "../JellyPolly/einvoice/JPEInvoiceConsolidatedTemplate.js";
import EInvoiceApiClientFactory from "../invoice/einvoice/EInvoiceApiClientFactory.js";
import EInvoiceSubmissionHandler from "../invoice/einvoice/EInvoiceSubmissionHandler.js";
import GTEInvoiceApiClientFactory from "../greenTarget/einvoice/GTEInvoiceApiClientFactory.js";
import GTEInvoiceSubmissionHandler from "../greenTarget/einvoice/GTEInvoiceSubmissionHandler.js";
import JPEInvoiceApiClientFactory from "../JellyPolly/einvoice/JPEInvoiceApiClientFactory.js";
import JPEInvoiceSubmissionHandler from "../JellyPolly/einvoice/JPEInvoiceSubmissionHandler.js";
import {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
  MYINVOIS_GT_CLIENT_ID,
  MYINVOIS_GT_CLIENT_SECRET,
  MYINVOIS_JP_CLIENT_ID,
  MYINVOIS_JP_CLIENT_SECRET,
} from "../../configs/config.js";

/**
 * Checks for consolidations that should be processed and handles them
 * Now includes immediate processing for eligible invoices in the 7-day window after month-end
 */
export const checkAndProcessDueConsolidations = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get current date in UTC (since server is UTC)
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD

    console.log(
      `[${now.toISOString()}] Starting auto-consolidation check for ${currentDate}`
    );

    // Check if we're in the 7-day window after month-end
    const isInConsolidationWindow = checkIfInConsolidationWindow(now);
    console.log(
      `[${now.toISOString()}] In consolidation window: ${
        isInConsolidationWindow.inWindow
      }`
    );

    if (isInConsolidationWindow.inWindow) {
      console.log(
        `[${now.toISOString()}] Processing consolidations for ${
          isInConsolidationWindow.targetMonth
        }/${isInConsolidationWindow.targetYear}`
      );

      // Get companies with auto-consolidation enabled
      const settingsQuery = `SELECT * FROM consolidation_settings WHERE auto_consolidation_enabled = true`;
      const settingsResult = await client.query(settingsQuery);

      for (const settings of settingsResult.rows) {
        const company = settings.company_id;
        console.log(
          `[${now.toISOString()}] Checking ${company} for eligible invoices...`
        );

        try {
          // Check if we already have a completed consolidation for this month
          const existingConsolidationQuery = `
            SELECT * FROM consolidation_tracking 
            WHERE company_id = $1 AND year = $2 AND month = $3 AND status = 'completed'
          `;

          const existingResult = await client.query(
            existingConsolidationQuery,
            [
              company,
              isInConsolidationWindow.targetYear,
              isInConsolidationWindow.targetMonth,
            ]
          );

          if (existingResult.rows.length > 0) {
            console.log(
              `[${now.toISOString()}] ${company} already has completed consolidation for ${
                isInConsolidationWindow.targetYear
              }-${isInConsolidationWindow.targetMonth + 1}`
            );
            continue;
          }

          // Get eligible invoices that haven't been consolidated yet
          let eligibleInvoices = [];

          if (company === "greentarget") {
            eligibleInvoices = await getEligibleGreentargetInvoices(
              client,
              isInConsolidationWindow.targetMonth,
              isInConsolidationWindow.targetYear
            );
          } else if (company === "jellypolly") {
            eligibleInvoices = await getEligibleJellypollyInvoices(
              client,
              isInConsolidationWindow.targetMonth,
              isInConsolidationWindow.targetYear
            );
          } else {
            eligibleInvoices = await getEligibleTienhockInvoices(
              client,
              isInConsolidationWindow.targetMonth,
              isInConsolidationWindow.targetYear
            );
          }

          console.log(
            `[${now.toISOString()}] Found ${
              eligibleInvoices.length
            } eligible invoices for ${company}`
          );

          if (eligibleInvoices.length === 0) {
            console.log(
              `[${now.toISOString()}] No eligible invoices found for ${company}`
            );

            // Create or update tracking record as skipped
            await upsertConsolidationTracking(
              client,
              company,
              isInConsolidationWindow.targetYear,
              isInConsolidationWindow.targetMonth,
              "skipped",
              "No eligible invoices found"
            );
            continue;
          }

          // Create or update tracking record as processing
          await upsertConsolidationTracking(
            client,
            company,
            isInConsolidationWindow.targetYear,
            isInConsolidationWindow.targetMonth,
            "processing",
            null
          );

          // Perform the actual consolidation
          let result;
          if (company === "greentarget") {
            result = await processGreentargetConsolidation(
              client,
              eligibleInvoices,
              isInConsolidationWindow.targetMonth,
              isInConsolidationWindow.targetYear
            );
          } else if (company === "jellypolly") {
            result = await processJellypollyConsolidation(
              client,
              eligibleInvoices,
              isInConsolidationWindow.targetMonth,
              isInConsolidationWindow.targetYear
            );
          } else {
            result = await processTienhockConsolidation(
              client,
              eligibleInvoices,
              isInConsolidationWindow.targetMonth,
              isInConsolidationWindow.targetYear
            );
          }

          // Update tracking record with result
          if (result.success) {
            await upsertConsolidationTracking(
              client,
              company,
              isInConsolidationWindow.targetYear,
              isInConsolidationWindow.targetMonth,
              "completed",
              null,
              result.consolidated_invoice_id
            );
            console.log(
              `[${now.toISOString()}] Successfully consolidated ${company} invoices into ${
                result.consolidated_invoice_id
              }`
            );
          } else {
            throw new Error(result.message || "Consolidation failed");
          }
        } catch (error) {
          console.error(
            `[${now.toISOString()}] Error consolidating ${company}:`,
            error
          );

          await upsertConsolidationTracking(
            client,
            company,
            isInConsolidationWindow.targetYear,
            isInConsolidationWindow.targetMonth,
            "failed",
            error.message || "Consolidation error"
          );
        }
      }
    } else {
      console.log(
        `[${now.toISOString()}] Not in consolidation window, skipping auto-consolidation`
      );
    }

    await client.query("COMMIT");
    console.log(`[${now.toISOString()}] Auto-consolidation check completed`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      `[${now.toISOString()}] Error in auto-consolidation check:`,
      error
    );
  } finally {
    client.release();
  }
};

/**
 * Check if current date is within 7 days after month-end
 */
function checkIfInConsolidationWindow(currentDate) {
  const now = new Date(currentDate);
  const currentDay = now.getUTCDate();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();

  // Check if we're in the first 7 days of the month (consolidating previous month)
  if (currentDay <= 7) {
    // We're in the consolidation window for the previous month
    let targetMonth = currentMonth - 1;
    let targetYear = currentYear;

    if (targetMonth < 0) {
      targetMonth = 11; // December
      targetYear = currentYear - 1;
    }

    return {
      inWindow: true,
      targetMonth,
      targetYear,
      dayInWindow: currentDay,
    };
  }

  return {
    inWindow: false,
    targetMonth: null,
    targetYear: null,
    dayInWindow: null,
  };
}

/**
 * Upsert consolidation tracking record
 */
async function upsertConsolidationTracking(
  client,
  companyId,
  year,
  month,
  status,
  error = null,
  consolidatedInvoiceId = null
) {
  const upsertQuery = `
    INSERT INTO consolidation_tracking (company_id, year, month, status, error, consolidated_invoice_id, last_attempt, attempt_count)
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, 1)
    ON CONFLICT (company_id, year, month)
    DO UPDATE SET 
      status = EXCLUDED.status,
      error = EXCLUDED.error,
      consolidated_invoice_id = COALESCE(EXCLUDED.consolidated_invoice_id, consolidation_tracking.consolidated_invoice_id),
      last_attempt = CURRENT_TIMESTAMP,
      attempt_count = consolidation_tracking.attempt_count + 1
  `;

  await client.query(upsertQuery, [
    companyId,
    year,
    month,
    status,
    error,
    consolidatedInvoiceId,
  ]);
}

/**
 * Get eligible Tien Hock invoices that haven't been consolidated
 */
async function getEligibleTienhockInvoices(client, month, year) {
  const startOfMonth = new Date(Date.UTC(year, month, 1)).getTime().toString();
  const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    .getTime()
    .toString();

  const invoiceQuery = `
    SELECT i.*, c.name, c.tin_number, c.id_number, c.phone_number, c.address, c.state, c.city
    FROM invoices i
    JOIN customers c ON i.customerid = c.id
    WHERE i.createddate::bigint >= $1
    AND i.createddate::bigint <= $2
    AND (i.einvoice_status IS NULL OR i.einvoice_status = 'invalid' OR i.einvoice_status = 'pending')
    AND i.invoice_status != 'cancelled'
    AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM invoices con 
      WHERE con.is_consolidated = true 
      AND con.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
      AND con.invoice_status != 'cancelled'
    )
  `;

  const invoiceResult = await client.query(invoiceQuery, [
    startOfMonth,
    endOfMonth,
  ]);

  // Get order details for each invoice
  for (const invoice of invoiceResult.rows) {
    const orderDetailsQuery = `
      SELECT * FROM order_details WHERE invoiceid = $1 ORDER BY id
    `;
    const orderDetailsResult = await client.query(orderDetailsQuery, [
      invoice.id,
    ]);
    invoice.orderDetails = orderDetailsResult.rows;
  }

  return invoiceResult.rows;
}

/**
 * Get eligible Jellypolly invoices that haven't been consolidated
 */
async function getEligibleJellypollyInvoices(client, month, year) {
  const startOfMonth = new Date(Date.UTC(year, month, 1)).getTime().toString();
  const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    .getTime()
    .toString();

  const invoiceQuery = `
    SELECT i.*, c.name, c.tin_number, c.id_number, c.phone_number, c.address, c.state, c.city
    FROM jellypolly.invoices i
    JOIN customers c ON i.customerid = c.id
    WHERE i.createddate::bigint >= $1
    AND i.createddate::bigint <= $2
    AND (i.einvoice_status IS NULL OR i.einvoice_status = 'invalid' OR i.einvoice_status = 'pending')
    AND i.invoice_status != 'cancelled'
    AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM jellypolly.invoices con 
      WHERE con.is_consolidated = true 
      AND con.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
      AND con.invoice_status != 'cancelled'
    )
  `;

  const invoiceResult = await client.query(invoiceQuery, [
    startOfMonth,
    endOfMonth,
  ]);

  // Get order details for each invoice
  for (const invoice of invoiceResult.rows) {
    const orderDetailsQuery = `
      SELECT * FROM jellypolly.order_details WHERE invoiceid = $1 ORDER BY id
    `;
    const orderDetailsResult = await client.query(orderDetailsQuery, [
      invoice.id,
    ]);
    invoice.orderDetails = orderDetailsResult.rows;
  }

  return invoiceResult.rows;
}

/**
 * Get eligible Green Target invoices that haven't been consolidated
 */
async function getEligibleGreentargetInvoices(client, month, year) {
  const invoiceQuery = `
    SELECT i.*, c.name as customer_name, c.phone_number, c.tin_number, c.id_type, c.id_number 
    FROM greentarget.invoices i
    JOIN greentarget.customers c ON i.customer_id = c.customer_id
    WHERE EXTRACT(MONTH FROM i.date_issued) = $1 + 1
    AND EXTRACT(YEAR FROM i.date_issued) = $2
    AND (i.einvoice_status IS NULL OR i.einvoice_status = 'invalid' OR i.einvoice_status = 'pending')
    AND i.status != 'cancelled'
    AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM greentarget.invoices con 
      WHERE con.is_consolidated = true 
      AND con.consolidated_invoices::jsonb ? CAST(i.invoice_number AS TEXT)
      AND con.status != 'cancelled'
    )
  `;

  const invoiceResult = await client.query(invoiceQuery, [month, year]);
  return invoiceResult.rows;
}

/**
 * Process Tien Hock consolidation
 */
async function processTienhockConsolidation(client, invoices, month, year) {
  try {
    // Use config from environment variables/imports
    const apiConfig = {
      MYINVOIS_API_BASE_URL,
      MYINVOIS_CLIENT_ID,
      MYINVOIS_CLIENT_SECRET,
    };

    // Initialize API client and submission handler
    const apiClient = EInvoiceApiClientFactory.getInstance(apiConfig);
    const submissionHandler = new EInvoiceSubmissionHandler(apiClient);

    // Generate consolidated XML
    const consolidatedXml = await EInvoiceConsolidatedTemplate(
      invoices,
      month,
      year
    );

    // Generate consolidated invoice ID
    const baseConsolidatedId = `CON-${year}${String(month + 1).padStart(
      2,
      "0"
    )}`;

    // Check for existing consolidated invoices with the same base ID pattern
    const existingIdsQuery = `
      SELECT id FROM invoices 
      WHERE id LIKE $1 
      ORDER BY id DESC
    `;

    const existingIdsResult = await client.query(existingIdsQuery, [
      `${baseConsolidatedId}%`,
    ]);

    let consolidatedId;
    if (existingIdsResult.rows.length === 0) {
      consolidatedId = `${baseConsolidatedId}-AUTO`;
    } else {
      let maxSuffix = 0;
      for (const row of existingIdsResult.rows) {
        const id = row.id;
        const match = id.match(new RegExp(`^${baseConsolidatedId}-(\\d+)$`));
        if (match && match[1]) {
          const suffix = parseInt(match[1]);
          if (suffix > maxSuffix) {
            maxSuffix = suffix;
          }
        }
      }
      consolidatedId = `${baseConsolidatedId}-${maxSuffix + 1}`;
    }

    // Calculate totals
    const totalExcludingTax = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.total_excluding_tax || 0),
      0
    );
    const taxAmount = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.tax_amount || 0),
      0
    );
    const rounding = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.rounding || 0),
      0
    );
    const totalPayable = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.totalamountpayable || 0),
      0
    );

    // Prepare document for submission using the XML
    const submissionResult = await submissionHandler.submitAndPollDocuments(
      consolidatedXml
    );

    if (!submissionResult.success) {
      throw new Error(
        submissionResult.message ||
          "Failed to submit consolidated invoice to MyInvois"
      );
    }

    // Get consolidation details from the response with proper null checks
    let documentDetails = null;
    let uuid = null;
    let longId = null;
    let dateTimeValidated = null;
    let status = "pending"; // Default to pending

    if (
      submissionResult.acceptedDocuments &&
      submissionResult.acceptedDocuments.length > 0
    ) {
      documentDetails = submissionResult.acceptedDocuments[0];
      uuid = documentDetails.uuid || null;
      longId = documentDetails.longId || null;
      dateTimeValidated = documentDetails.dateTimeValidated || null;
      status = longId ? "valid" : "pending";
    }

    // Insert consolidated record with API response details
    const invoiceIds = invoices.map((inv) => inv.id);

    await client.query(
      `INSERT INTO invoices (
        id, uuid, submission_uid, long_id, datetime_validated,
        total_excluding_tax, tax_amount, rounding, totalamountpayable,
        invoice_status, einvoice_status, is_consolidated, consolidated_invoices,
        customerid, salespersonid, createddate, paymenttype, balance_due
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        consolidatedId,
        uuid,
        submissionResult.submissionUid || null,
        longId,
        dateTimeValidated ? new Date(dateTimeValidated) : null,
        totalExcludingTax,
        taxAmount,
        rounding,
        totalPayable,
        "paid", // invoice_status
        status, // einvoice_status based on API response
        true, // is_consolidated
        JSON.stringify(invoiceIds),
        "Consolidated customers", // customerid
        "SYSTEM-AUTO", // salespersonid
        new Date().getTime().toString(), // createddate
        "INVOICE", // paymenttype
        0, // balance_due
      ]
    );

    return {
      success: true,
      message: "Consolidation successful",
      consolidated_invoice_id: consolidatedId,
    };
  } catch (error) {
    console.error("Error in Tien Hock consolidation:", error);
    return {
      success: false,
      message: error.message || "Unknown error during Tien Hock consolidation",
    };
  }
}

/**
 * Process Green Target consolidation
 */
async function processGreentargetConsolidation(client, invoices, month, year) {
  try {
    const apiConfig = {
      MYINVOIS_API_BASE_URL,
      MYINVOIS_GT_CLIENT_ID,
      MYINVOIS_GT_CLIENT_SECRET,
    };

    // Initialize API client and submission handler
    const apiClient = GTEInvoiceApiClientFactory.getInstance(apiConfig);
    const submissionHandler = new GTEInvoiceSubmissionHandler(apiClient);

    // Generate consolidated XML
    const consolidatedXml = await GTEInvoiceConsolidatedTemplate(
      invoices,
      month,
      year
    );

    // Generate consolidated invoice number
    const datePrefix = `${year}${String(month + 1).padStart(2, "0")}`;
    const consolidatedSequenceQuery = `
      SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '^CON-\\d{6}-(\\d+)$', '\\1'), '')), '0')::int + 1 as next_seq
      FROM greentarget.invoices
      WHERE invoice_number LIKE 'CON-${datePrefix}-%'
    `;

    const sequenceResult = await client.query(consolidatedSequenceQuery);
    const sequence = sequenceResult.rows[0].next_seq;
    const consolidatedInvoiceNumber = `CON-${datePrefix}-${sequence}-AUTO`;

    // Calculate totals
    const totalExcludingTax = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.amount_before_tax || 0),
      0
    );
    const taxAmount = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.tax_amount || 0),
      0
    );
    const totalAmount = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.total_amount || 0),
      0
    );

    // Prepare document for submission
    const submissionResult = await submissionHandler.submitAndPollDocument(
      consolidatedXml
    );

    if (!submissionResult.success) {
      throw new Error(
        submissionResult.message ||
          "Failed to submit consolidated invoice to MyInvois"
      );
    }

    // Get consolidation details from the response with proper null checks
    let documentDetails = null;
    let uuid = null;
    let longId = null;
    let dateTimeValidated = null;
    let status = "pending"; // Default to pending

    if (submissionResult.document) {
      documentDetails = submissionResult.document;
      uuid = documentDetails.uuid || null;
      longId = documentDetails.longId || null;
      dateTimeValidated = documentDetails.dateTimeValidated || null;
      status = longId ? "valid" : "pending";
    }

    // Insert consolidated record with API response details
    const invoiceIds = invoices.map((inv) => inv.invoice_number);

    await client.query(
      `INSERT INTO greentarget.invoices (
        invoice_number, type, customer_id,
        amount_before_tax, tax_amount, total_amount, date_issued,
        balance_due, status, is_consolidated, consolidated_invoices,
        uuid, submission_uid, long_id, datetime_validated, einvoice_status
      )
      VALUES ($1, 'consolidated', NULL, $2, $3, $4, CURRENT_DATE, $5, 'active', true, $6, $7, $8, $9, $10, $11)
      RETURNING invoice_id`,
      [
        consolidatedInvoiceNumber,
        totalExcludingTax.toFixed(2),
        taxAmount.toFixed(2),
        totalAmount.toFixed(2),
        totalAmount.toFixed(2), // Initial balance due equals total
        JSON.stringify(invoiceIds),
        uuid,
        submissionResult.submissionUid || null,
        longId,
        dateTimeValidated ? new Date(dateTimeValidated) : null,
        status, // einvoice_status based on API response
      ]
    );

    return {
      success: true,
      message: "Consolidation successful",
      consolidated_invoice_id: consolidatedInvoiceNumber,
    };
  } catch (error) {
    console.error("Error in Green Target consolidation:", error);
    return {
      success: false,
      message:
        error.message || "Unknown error during Green Target consolidation",
    };
  }
}

/**
 * Process Jellypolly consolidation
 */
async function processJellypollyConsolidation(client, invoices, month, year) {
  try {
    // Use config from environment variables/imports
    const apiConfig = {
      MYINVOIS_API_BASE_URL,
      MYINVOIS_JP_CLIENT_ID,
      MYINVOIS_JP_CLIENT_SECRET,
    };

    // Initialize API client and submission handler
    const apiClient = JPEInvoiceApiClientFactory.getInstance(apiConfig);
    const submissionHandler = new JPEInvoiceSubmissionHandler(apiClient);

    // Generate consolidated XML
    const consolidatedXml = await JPEInvoiceConsolidatedTemplate(
      invoices,
      month,
      year
    );

    // Generate consolidated invoice number
    const datePrefix = `${year}${String(month + 1).padStart(2, "0")}`;
    const consolidatedSequenceQuery = `
      SELECT COALESCE(MAX(NULLIF(regexp_replace(id, '^CON-\\d{6}-(\\d+)$', '\\1'), '')), '0')::int + 1 as next_seq
      FROM jellypolly.invoices
      WHERE id LIKE 'CON-${datePrefix}-%'
    `;

    const sequenceResult = await client.query(consolidatedSequenceQuery);
    const sequence = sequenceResult.rows[0].next_seq;
    const consolidatedInvoiceNumber = `CON-${datePrefix}-${sequence}`;

    // Calculate totals
    const totalExcludingTax = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.total_excluding_tax || 0),
      0
    );
    const taxAmount = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.tax_amount || 0),
      0
    );
    const rounding = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.rounding || 0),
      0
    );
    const totalPayable = invoices.reduce(
      (sum, inv) => sum + parseFloat(inv.totalamountpayable || 0),
      0
    );

    // Prepare document for submission
    const submissionResult = await submissionHandler.submitAndPollDocuments(
      consolidatedXml
    );

    if (!submissionResult.success) {
      throw new Error(
        submissionResult.message ||
          "Failed to submit consolidated invoice to MyInvois"
      );
    }

    // Get consolidation details from the response with proper null checks
    let documentDetails = null;
    let uuid = null;
    let longId = null;
    let dateTimeValidated = null;
    let status = "pending"; // Default to pending

    // Check if we have document details in the response
    if (submissionResult.document) {
      documentDetails = submissionResult.document;
      uuid = documentDetails.uuid || null;
      longId = documentDetails.longId || null;
      dateTimeValidated = documentDetails.dateTimeValidated || null;
      status = longId ? "valid" : "pending";
    } else if (
      submissionResult.acceptedDocuments &&
      submissionResult.acceptedDocuments.length > 0
    ) {
      documentDetails = submissionResult.acceptedDocuments[0];
      uuid = documentDetails.uuid || null;
      longId = documentDetails.longId || null;
      dateTimeValidated = documentDetails.dateTimeValidated || null;
      status = longId ? "valid" : "pending";
    }

    // Insert consolidated record with API response details
    const invoiceIds = invoices.map((inv) => inv.id);

    await client.query(
      `INSERT INTO jellypolly.invoices (
        id, uuid, submission_uid, long_id, datetime_validated,
        total_excluding_tax, tax_amount, rounding, totalamountpayable,
        invoice_status, einvoice_status, is_consolidated, consolidated_invoices,
        customerid, salespersonid, createddate, paymenttype, balance_due
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        consolidatedInvoiceNumber,
        uuid,
        submissionResult.submissionUid || null,
        longId,
        dateTimeValidated ? new Date(dateTimeValidated) : null,
        totalExcludingTax,
        taxAmount,
        rounding,
        totalPayable,
        "paid", // invoice_status
        status, // einvoice_status based on API response
        true, // is_consolidated
        JSON.stringify(invoiceIds),
        "Consolidated customers", // customerid
        "SYSTEM-AUTO", // salespersonid
        new Date().getTime().toString(), // createddate
        "INVOICE", // paymenttype
        0, // balance_due
      ]
    );

    return {
      success: true,
      message: "Consolidation successful",
      consolidated_invoice_id: consolidatedInvoiceNumber,
    };
  } catch (error) {
    console.error("Error in Jellypolly consolidation:", error);
    return {
      success: false,
      message: error.message || "Unknown error during Jellypolly consolidation",
    };
  }
}
