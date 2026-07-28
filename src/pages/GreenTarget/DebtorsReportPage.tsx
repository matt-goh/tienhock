// src/pages/GreenTarget/DebtorsReportPage.tsx
import React from "react";
import AccountingDebtorsReportPage, {
  type DebtorsReportPageConfig,
} from "../Accounting/DebtorsReportPage";
import { GREENTARGET_INFO } from "../../utils/invoice/einvoice/companyInfo";

// Ledger-backed GT debtors (phase G6): the receivable lives in the imported
// legacy ledger's 28 DEBTOR child accounts, not in the operational
// invoice/payment subledger (see docs/Account/GT_OPERATIONAL_BRIDGE.md).
// customerDetailsPath/customerInvoicesPath deep-link the debtor's account
// ledger; invoiceDetailsPath is omitted because the bill rows are legacy
// journal references, not ERP invoices, so row clicks stay inert.
const GREEN_TARGET_DEBTORS_CONFIG: DebtorsReportPageConfig = {
  debtorsEndpoint: "/greentarget/api/debtors",
  statementEndpoint: (
    customerId: string,
    month: number,
    year: number
  ): string =>
    `/greentarget/api/debtors/statement/${customerId}?month=${month}&year=${year}`,
  generalStatementEndpoint: (month: number, year: number): string =>
    `/greentarget/api/debtors/general-statement?month=${month}&year=${year}`,
  customerDetailsPath: (customerId: string): string =>
    `/greentarget/accounting/reports/account-ledger?account=${encodeURIComponent(
      customerId
    )}`,
  customerInvoicesPath: (customerId: string): string =>
    `/greentarget/accounting/reports/account-ledger?account=${encodeURIComponent(
      customerId
    )}`,
  companyName: GREENTARGET_INFO.name,
  statementCompanyInfo: GREENTARGET_INFO,
  statementCompanyName: `${GREENTARGET_INFO.name} (${GREENTARGET_INFO.reg_no})`,
};

const DebtorsReportPage: React.FC = () => {
  return <AccountingDebtorsReportPage config={GREEN_TARGET_DEBTORS_CONFIG} />;
};

export default DebtorsReportPage;
