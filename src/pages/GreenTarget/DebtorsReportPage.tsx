// src/pages/GreenTarget/DebtorsReportPage.tsx
import React from "react";
import AccountingDebtorsReportPage, {
  type DebtorsReportPageConfig,
} from "../Accounting/DebtorsReportPage";
import { GREENTARGET_INFO } from "../../utils/invoice/einvoice/companyInfo";

const GREEN_TARGET_DEBTORS_CONFIG: DebtorsReportPageConfig = {
  debtorsEndpoint: "/greentarget/api/payments/debtors",
  statementEndpoint: (
    customerId: string,
    month: number,
    year: number
  ): string =>
    `/greentarget/api/payments/debtors/statement/${customerId}?month=${month}&year=${year}`,
  generalStatementEndpoint: (month: number, year: number): string =>
    `/greentarget/api/payments/debtors/general-statement?month=${month}&year=${year}`,
  customerDetailsPath: (customerId: string): string =>
    `/greentarget/customers/${customerId}`,
  customerInvoicesPath: (customerId: string): string =>
    `/greentarget/invoices?customer_id=${customerId}&status=active,overdue`,
  invoiceDetailsPath: (invoiceId: string): string =>
    `/greentarget/invoices/${invoiceId}`,
  companyName: GREENTARGET_INFO.name,
  statementCompanyInfo: GREENTARGET_INFO,
  statementCompanyName: `${GREENTARGET_INFO.name} (${GREENTARGET_INFO.reg_no})`,
};

const DebtorsReportPage: React.FC = () => {
  return <AccountingDebtorsReportPage config={GREEN_TARGET_DEBTORS_CONFIG} />;
};

export default DebtorsReportPage;
