// src/components/AdjustmentDocs/useAdjustmentDocsPaths.ts
// Centralised URL/API prefix derivation so the shared Adjustment Docs pages
// can be reused across Tien Hock and Jelly Polly.
export type AdjustmentDocsCompany = "tienhock" | "jellypolly";

export interface AdjustmentDocsPaths {
  company: AdjustmentDocsCompany;
  apiBase: string;            // e.g. "/api/adjustment-docs" or "/jellypolly/api/adjustment-docs"
  invoiceApiBase: string;     // for fetching the original invoice
  paymentsApiBase: string;    // for fetching payments
  invoicesSearchApi: string;  // for picker
  uiBase: string;             // e.g. "/sales/adjustment-docs" or "/jellypolly/sales/adjustment-docs"
  invoiceUiBase: string;      // for back-navigation to invoice details
  listLabel: string;          // small humanised label for UI
}

export function getAdjustmentDocsPaths(
  company: AdjustmentDocsCompany = "tienhock"
): AdjustmentDocsPaths {
  if (company === "jellypolly") {
    return {
      company,
      apiBase: "/jellypolly/api/adjustment-docs",
      invoiceApiBase: "/jellypolly/api/invoices",
      paymentsApiBase: "/jellypolly/api/payments",
      invoicesSearchApi: "/jellypolly/api/invoices",
      uiBase: "/jellypolly/sales/adjustment-docs",
      invoiceUiBase: "/jellypolly/sales/invoice",
      listLabel: "Jelly Polly",
    };
  }
  return {
    company: "tienhock",
    apiBase: "/api/adjustment-docs",
    invoiceApiBase: "/api/invoices",
    paymentsApiBase: "/api/payments",
    invoicesSearchApi: "/api/invoices",
    uiBase: "/sales/adjustment-docs",
    invoiceUiBase: "/sales/invoice",
    listLabel: "Tien Hock",
  };
}
