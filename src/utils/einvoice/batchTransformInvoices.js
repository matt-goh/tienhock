// batchTransformInvoices.js
import { transformInvoiceToMyInvoisFormat } from "./transformInvoiceData";

export async function batchTransformInvoices(invoices) {
  if (!Array.isArray(invoices)) {
    throw new Error("Input must be an array of invoices");
  }

  const results = {
    transformedInvoices: [],
    errors: [],
  };

  for (let i = 0; i < invoices.length; i++) {
    try {
      const transformedInvoice = transformInvoiceToMyInvoisFormat(invoices[i]);
      results.transformedInvoices.push(transformedInvoice);
    } catch (error) {
      results.errors.push({
        invoiceNo: invoices[i]?.invoiceno || `Invoice at index ${i}`,
        error: error.message,
      });
    }
  }

  // If no invoices were successfully transformed, throw an error
  if (results.transformedInvoices.length === 0) {
    const error = new Error(`Failed to transform any invoices`);
    error.errors = results.errors; // Attach individual errors
    error.type = "batch_validation";
    throw error;
  }

  // Return both successful transformations and any errors
  return results;
}

// Helper function to chunk invoices into smaller batches if needed
export function chunkInvoices(invoices, chunkSize = 10) {
  return Array.from(
    { length: Math.ceil(invoices.length / chunkSize) },
    (_, index) => invoices.slice(index * chunkSize, (index + 1) * chunkSize)
  );
}
