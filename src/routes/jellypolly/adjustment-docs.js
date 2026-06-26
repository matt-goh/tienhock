// src/routes/jellypolly/adjustment-docs.js
// Jelly Polly Adjustment Documents — thin wrapper around the parameterised
// Tien Hock route factory. Points at the `jellypolly.*` schema tables and
// uses JELLYPOLLY_INFO as the e-invoice supplier party.
import createAdjustmentDocsRouter from "../sales/adjustment-docs/index.js";
import { JELLYPOLLY_INFO } from "../../utils/invoice/einvoice/companyInfo.js";

export default function (pool, myInvoisConfig) {
  return createAdjustmentDocsRouter(pool, myInvoisConfig, {
    tables: {
      docs: "jellypolly.adjustment_documents",
      lines: "jellypolly.adjustment_document_lines",
      invoices: "jellypolly.invoices",
      payments: "jellypolly.payments",
    },
    supplierInfo: JELLYPOLLY_INFO,
    companyPrefix: "JP",
  });
}
