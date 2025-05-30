// src/utils/invoice/autoConsolidation.js
import { EInvoiceConsolidatedTemplate } from "../invoice/einvoice/EInvoiceConsolidatedTemplate.js";
import { GTEInvoiceConsolidatedTemplate } from "../greenTarget/einvoice/GTEInvoiceConsolidatedTemplate.js";
import EInvoiceApiClientFactory from "../invoice/einvoice/EInvoiceApiClientFactory.js";
import EInvoiceSubmissionHandler from "../invoice/einvoice/EInvoiceSubmissionHandler.js";
import GTEInvoiceApiClientFactory from "../greenTarget/einvoice/GTEInvoiceApiClientFactory.js";
import GTEInvoiceSubmissionHandler from "../greenTarget/einvoice/GTEInvoiceSubmissionHandler.js";
import { JPEInvoiceConsolidatedTemplate } from "../jellypolly/einvoice/JPEInvoiceConsolidatedTemplate.js";
import JPEInvoiceApiClientFactory from "../jellypolly/einvoice/JPEInvoiceApiClientFactory.js";
import JPEInvoiceSubmissionHandler from "../jellypolly/einvoice/JPEInvoiceSubmissionHandler.js";
import {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
  MYINVOIS_GT_CLIENT_ID,
  MYINVOIS_GT_CLIENT_SECRET,
  MYINVOIS_JP_CLIENT_ID,
  MYINVOIS_JP_CLIENT_SECRET,
} from "../../configs/config.js";

// Hard-coded values
const CONSOLIDATION_DAY = 1; // 1 day after month end
const RETRY_DAYS = 7; // Retry for 7 days

/**
 * Checks for consolidations that should be processed today and handles them
 */
export const checkAndProcessDueConsolidations = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get current date in Malaysia timezone
    const now = new Date();
    const malaysiaTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" })
    );
    const currentDate = malaysiaTime.toISOString().split("T")[0]; // YYYY-MM-DD

    // Find consolidations scheduled for today
    const pendingQuery = `
      SELECT ct.*
      FROM consolidation_tracking ct
      JOIN consolidation_settings cs ON ct.company_id = cs.company_id
      WHERE ct.status = 'pending'
      AND cs.auto_consolidation_enabled = true
      AND (
        -- Either it's scheduled for today
        DATE(ct.next_attempt) = DATE($1)
        -- Or it failed previously and is within the retry window
        OR (
          ct.status = 'pending' 
          AND ct.attempt_count > 0
          AND DATE(ct.next_attempt) <= DATE($1)
          AND DATE($1) <= (DATE_TRUNC('month', ct.next_attempt) + INTERVAL '1 month' + INTERVAL '${RETRY_DAYS} days')
        )
      )
    `;

    const pendingResult = await client.query(pendingQuery, [currentDate]);

    for (const task of pendingResult.rows) {
      try {
        const company = task.company_id;
        const year = task.year;
        const month = task.month;

        // Check if we're still within the retry window
        const monthEndDate = new Date(year, month + 1, 0); // Last day of the target month
        const cutoffDate = new Date(monthEndDate);
        cutoffDate.setDate(cutoffDate.getDate() + RETRY_DAYS);

        if (malaysiaTime > cutoffDate) {
          await client.query(
            `UPDATE consolidation_tracking SET 
              status = 'expired', 
              error = 'Consolidation window expired',
              last_attempt = CURRENT_TIMESTAMP
            WHERE id = $1`,
            [task.id]
          );
          continue;
        }

        // Get eligible invoices
        const isGreentarget = company === "greentarget";
        let eligibleInvoices = [];

        try {
          // Mark task as in progress
          await client.query(
            `UPDATE consolidation_tracking SET 
              status = 'processing',
              last_attempt = CURRENT_TIMESTAMP,
              attempt_count = attempt_count + 1
            WHERE id = $1`,
            [task.id]
          );

          // Get eligible invoices based on company
          if (isGreentarget) {
            // Green Target logic
            const invoiceQuery = `
              SELECT i.*, c.name as customer_name, c.phone_number, c.tin_number, c.id_type, c.id_number 
              FROM greentarget.invoices i
              JOIN greentarget.customers c ON i.customer_id = c.customer_id
              WHERE EXTRACT(MONTH FROM i.date_issued) = $1 + 1
              AND EXTRACT(YEAR FROM i.date_issued) = $2
              AND (i.einvoice_status IS NULL OR i.einvoice_status = 'invalid' OR i.einvoice_status = 'pending')
              AND i.status != 'cancelled'
              AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
            `;

            const invoiceResult = await client.query(invoiceQuery, [
              month,
              year,
            ]);
            eligibleInvoices = invoiceResult.rows;
          } else if (company === "jellypolly") {
            // Jellypolly logic
            const startOfMonth = new Date(year, month, 1).getTime().toString();
            const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999)
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
            `;

            const invoiceResult = await client.query(invoiceQuery, [
              startOfMonth,
              endOfMonth,
            ]);

            // Also get order details for each invoice
            for (const invoice of invoiceResult.rows) {
              const orderDetailsQuery = `
                SELECT *
                FROM jellypolly.order_details
                WHERE invoiceid = $1
                ORDER BY id
              `;

              const orderDetailsResult = await client.query(orderDetailsQuery, [
                invoice.id,
              ]);
              invoice.orderDetails = orderDetailsResult.rows;
            }

            eligibleInvoices = invoiceResult.rows;
          } else {
            // Tien Hock logic
            const startOfMonth = new Date(year, month, 1).getTime().toString();
            const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999)
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
            `;

            const invoiceResult = await client.query(invoiceQuery, [
              startOfMonth,
              endOfMonth,
            ]);

            // Also get order details for each invoice
            for (const invoice of invoiceResult.rows) {
              const orderDetailsQuery = `
                SELECT *
                FROM order_details
                WHERE invoiceid = $1
                ORDER BY id
              `;

              const orderDetailsResult = await client.query(orderDetailsQuery, [
                invoice.id,
              ]);
              invoice.orderDetails = orderDetailsResult.rows;
            }

            eligibleInvoices = invoiceResult.rows;
          }
        } catch (error) {
          console.error(
            `Error getting eligible invoices for ${company} ${year}-${
              month + 1
            }:`,
            error
          );
          throw new Error(`Failed to get eligible invoices: ${error.message}`);
        }

        if (eligibleInvoices.length === 0) {
          await client.query(
            `UPDATE consolidation_tracking SET 
              status = 'skipped', 
              error = 'No eligible invoices found',
              last_attempt = CURRENT_TIMESTAMP
            WHERE id = $1`,
            [task.id]
          );
          continue;
        }

        try {
          // Perform the actual consolidation based on company
          let result;
          if (isGreentarget) {
            result = await processGreentargetConsolidation(
              client,
              eligibleInvoices,
              month,
              year
            );
          } else if (company === "jellypolly") {
            result = await processJellypollyConsolidation(
              client,
              eligibleInvoices,
              month,
              year
            );
          } else {
            result = await processTienhockConsolidation(
              client,
              eligibleInvoices,
              month,
              year
            );
          }

          // Update tracking record with result
          if (result.success) {
            await client.query(
              `UPDATE consolidation_tracking SET 
                status = 'completed',
                consolidated_invoice_id = $2,
                error = NULL
              WHERE id = $1`,
              [task.id, result.consolidated_invoice_id]
            );
          } else {
            throw new Error(result.message || "Consolidation failed");
          }
        } catch (error) {
          console.error(
            `Error during consolidation for ${company} ${year}-${month + 1}:`,
            error
          );

          // Schedule retry if still within window
          const nextRetry = new Date(malaysiaTime);
          nextRetry.setDate(nextRetry.getDate() + 1);

          if (nextRetry <= cutoffDate) {
            await client.query(
              `UPDATE consolidation_tracking SET 
                status = 'pending',
                error = $2,
                next_attempt = $3
              WHERE id = $1`,
              [task.id, error.message || "Consolidation error", nextRetry]
            );
          } else {
            await client.query(
              `UPDATE consolidation_tracking SET 
                status = 'failed',
                error = $2
              WHERE id = $1`,
              [task.id, error.message || "Consolidation error"]
            );
          }
        }
      } catch (error) {
        console.error(
          `Error processing ${task.company_id} consolidation:`,
          error
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in auto-consolidation check:", error);
  } finally {
    client.release();
  }
};

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

    // Get consolidation details from the response
    const documentDetails = submissionResult.acceptedDocuments[0];
    const status = documentDetails.longId ? "valid" : "pending";

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
        documentDetails.uuid,
        submissionResult.submissionUid,
        documentDetails.longId || null,
        documentDetails.dateTimeValidated || null,
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

    // Get consolidation details from the response
    const documentDetails = submissionResult.document;
    const status = documentDetails.longId ? "valid" : "pending";

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
        documentDetails.uuid,
        submissionResult.submissionUid,
        documentDetails.longId || null,
        documentDetails.dateTimeValidated || null,
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

    // Get consolidation details from the response
    const documentDetails = submissionResult.document;
    const status = documentDetails.longId ? "valid" : "pending";

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
        documentDetails.uuid,
        submissionResult.submissionUid,
        documentDetails.longId || null,
        documentDetails.dateTimeValidated || null,
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

/**
 * Schedules next month's consolidation
 */
export const scheduleNextMonthConsolidation = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get settings for all companies
    const settingsQuery = `SELECT * FROM consolidation_settings WHERE auto_consolidation_enabled = true`;
    const settingsResult = await client.query(settingsQuery);

    // Calculate next month
    const now = new Date();
    const nextMonth = (now.getMonth() + 1) % 12;
    const nextYear =
      now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

    for (const settings of settingsResult.rows) {
      const company = settings.company_id;

      // Check if already scheduled
      const existingQuery = `
        SELECT * FROM consolidation_tracking 
        WHERE company_id = $1 AND year = $2 AND month = $3
      `;

      const existingResult = await client.query(existingQuery, [
        company,
        nextYear,
        nextMonth,
      ]);

      if (existingResult.rows.length > 0) {
        continue;
      }

      // Calculate the scheduled date (N days after month end)
      const monthEndDate = new Date(nextYear, nextMonth + 1, 0); // Last day of the target month
      const scheduledDate = new Date(monthEndDate);
      scheduledDate.setDate(scheduledDate.getDate() + CONSOLIDATION_DAY);

      // Create the tracking record
      await client.query(
        `INSERT INTO consolidation_tracking 
          (company_id, year, month, status, next_attempt) 
         VALUES ($1, $2, $3, 'pending', $4)`,
        [company, nextYear, nextMonth, scheduledDate]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error scheduling next month consolidation:", error);
  } finally {
    client.release();
  }
};
