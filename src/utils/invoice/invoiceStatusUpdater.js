// src/utils/invoice/invoiceStatusUpdater.js
import { pool } from "../../../server.js"; // Assuming pool is exported from server.js or accessible globally

/**
 * Updates the status of invoices to 'Overdue' if they meet the criteria.
 * Checks both Tien Hock (public) and GreenTarget schemas.
 */
export const updateInvoiceStatuses = async () => {
  // Use the globally accessible pool from server.js
  if (!pool) {
    console.error("Database pool is not available for invoice status update.");
    return;
  }

  const client = await pool.connect(); // Get a client from the main pool
  try {
    await client.query("BEGIN");

    // --- Update Tien Hock Invoices ---
    // Invoices are overdue if older than 30 days AND Unpaid AND balance > 0
    const thirtyDaysAgoTimestamp = (
      Date.now() -
      30 * 24 * 60 * 60 * 1000
    ).toString();
    const tienHockUpdateQuery = `
      UPDATE public.invoices
      SET invoice_status = 'Overdue'
      WHERE invoice_status = 'Unpaid'        -- Only update unpaid ones
        AND COALESCE(balance_due, 0) > 0  -- Must have a balance due
        AND CAST(createddate AS bigint) < $1; -- Older than 30 days
    `;
    await client.query(tienHockUpdateQuery, [
      thirtyDaysAgoTimestamp,
    ]);

    // --- Update GreenTarget Invoices ---
    // Invoices are overdue if older than 30 days AND active AND balance > 0
    // Using INTERVAL for date comparison as date_issued is DATE type
    const greenTargetUpdateQuery = `
      UPDATE greentarget.invoices
      SET status = 'overdue'
      WHERE status = 'active'                 -- Only update active ones
        AND COALESCE(balance_due, 0) > 0   -- Must have a balance due
        AND date_issued < (CURRENT_DATE - INTERVAL '30 days'); -- Older than 30 days
    `;
    const greenTargetResult = await client.query(greenTargetUpdateQuery);

    // --- Update Jellypolly Invoices ---
    const jellypollyUpdateQuery = `
    UPDATE jellypolly.invoices
    SET invoice_status = 'Overdue'
    WHERE invoice_status = 'Unpaid'        -- Only update unpaid ones
      AND COALESCE(balance_due, 0) > 0     -- Must have a balance due
      AND CAST(createddate AS bigint) < $1; -- Older than 30 days
    `;
    const jellypollyResult = await client.query(jellypollyUpdateQuery, [
      thirtyDaysAgoTimestamp,
    ]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating invoice statuses:", error);
    // Don't re-throw here, let the cron job log the failure
  } finally {
    client.release();
  }
};
