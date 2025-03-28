// src/utils/greenTarget/einvoice/GTDbUtil.js

/**
 * Inserts a submitted e-Invoice into the database
 * @param {Object} pool - Database connection pool
 * @param {Object} document - Document from MyInvois API response
 * @param {Object} invoice - Original invoice data
 * @returns {Promise<Object>} - The inserted record
 */
export async function insertEInvoiceRecord(pool, document, invoice) {
  const query = `
      INSERT INTO greentarget.einvoices (
        uuid, 
        submission_uid, 
        long_id, 
        internal_id, 
        type_name, 
        status,
        invoice_id,
        datetime_validated,
        total_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(query, [
      document.uuid,
      document.submissionUid,
      document.longId || null,
      invoice.invoice_number,
      "Invoice", // Default type name
      document.status || "Submitted",
      invoice.invoice_id,
      document.dateTimeValidated || new Date().toISOString(),
      invoice.total_amount,
    ]);

    // Update the invoice to mark it as submitted
    await client.query(
      `UPDATE greentarget.invoices 
         SET einvoice_status = $1
         WHERE invoice_id = $2`,
      ["submitted", invoice.invoice_id]
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
