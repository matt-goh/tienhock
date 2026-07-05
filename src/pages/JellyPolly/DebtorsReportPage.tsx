// src/pages/JellyPolly/DebtorsReportPage.tsx
import React from "react";
import AccountingDebtorsReportPage, {
  type DebtorsReportPageConfig,
} from "../Accounting/DebtorsReportPage";
import { JELLYPOLLY_INFO } from "../../utils/invoice/einvoice/companyInfo";

const JELLY_POLLY_COMPANY_NAME = "JELLY POLLY FOOD INDUSTRIES";

const JELLY_POLLY_DEBTORS_CONFIG: DebtorsReportPageConfig = {
  debtorsEndpoint: "/jellypolly/api/debtors",
  statementEndpoint: (
    customerId: string,
    month: number,
    year: number
  ): string =>
    `/jellypolly/api/debtors/statement/${customerId}?month=${month}&year=${year}`,
  generalStatementEndpoint: (month: number, year: number): string =>
    `/jellypolly/api/debtors/general-statement?month=${month}&year=${year}`,
  customerDetailsPath: (customerId: string): string =>
    `/catalogue/customer/${customerId}`,
  customerInvoicesPath: (customerId: string): string =>
    `/jellypolly/sales/invoice?customerId=${customerId}`,
  invoiceDetailsPath: (invoiceId: string): string =>
    `/jellypolly/sales/invoice/${invoiceId}`,
  companyName: JELLY_POLLY_COMPANY_NAME,
  statementCompanyInfo: JELLYPOLLY_INFO,
  statementCompanyName: JELLY_POLLY_COMPANY_NAME,
  monthPickerPlacement: "bottom-left-button",
};

const DebtorsReportPage: React.FC = () => {
  return <AccountingDebtorsReportPage config={JELLY_POLLY_DEBTORS_CONFIG} />;
};

export default DebtorsReportPage;
