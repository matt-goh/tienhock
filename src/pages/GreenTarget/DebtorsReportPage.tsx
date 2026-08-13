// src/pages/GreenTarget/DebtorsReportPage.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { IconHierarchy } from "@tabler/icons-react";
import AccountingDebtorsReportPage, {
  type DebtorsReportPageConfig,
} from "../Accounting/DebtorsReportPage";
import Button from "../../components/Button";
import { api } from "../../routes/utils/api";
import type { GreenTargetTradeDebtorListResponse } from "../../types/greenTargetTradeDebtorList";
import { printGreenTargetTradeDebtorListPDF } from "../../utils/accounting/GreenTargetTradeDebtorListPDF";
import { GREENTARGET_INFO } from "../../utils/invoice/einvoice/companyInfo";

const printGreenTargetLegacyDebtorList = async (params: {
  month: number;
  year: number;
  hideZero: boolean;
}): Promise<void> => {
  const report: GreenTargetTradeDebtorListResponse =
    await api.get<GreenTargetTradeDebtorListResponse>(
      `/greentarget/api/debtors/legacy-list?month=${params.month}` +
        `&year=${params.year}&hideZero=${params.hideZero ? "1" : "0"}`
    );
  await printGreenTargetTradeDebtorListPDF(report);
};

// Ledger-backed GT debtors (phase G6): the receivable lives in the imported
// legacy ledger's 28 DEBTOR child accounts, not in the operational
// invoice/payment subledger (see docs/Account/GT_OPERATIONAL_BRIDGE.md).
// customerDetailsPath deep-links the debtor's account ledger (or the CD/SD
// sub-schedule). Operational invoice drill-down is omitted because these rows
// are legacy journal references rather than ERP invoices.
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
  accountLedgerPath: "/greentarget/accounting/reports/account-ledger",
  customerDetailsPath: (customerId: string): string =>
    customerId === "CD_SD"
      ? "/greentarget/debtors/cd-sd"
      : `/greentarget/accounting/reports/account-ledger?account=${encodeURIComponent(
          customerId
        )}`,
  companyName: GREENTARGET_INFO.name,
  statementCompanyInfo: GREENTARGET_INFO,
  statementCompanyName: `${GREENTARGET_INFO.name} (${GREENTARGET_INFO.reg_no})`,
  printGeneralStatement: printGreenTargetLegacyDebtorList,
  hideZeroLabel: "Hide all-zero customers",
  hideZeroActiveLabel: "All-zero customers hidden",
};

const DebtorsReportPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-800 dark:bg-emerald-900/20">
        <div>
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            CD/SD debtor sub-schedule
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Open the named sundry-debtor schedule reconciled to the CD_SD
            control account.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          color="teal"
          icon={IconHierarchy}
          onClick={() => navigate("/greentarget/debtors/cd-sd")}
        >
          Open CD/SD Schedule
        </Button>
      </div>
      <AccountingDebtorsReportPage config={GREEN_TARGET_DEBTORS_CONFIG} />
    </div>
  );
};

export default DebtorsReportPage;
