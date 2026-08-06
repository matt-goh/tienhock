import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type {
  GreenTargetTradeDebtorListResponse,
  GreenTargetTradeDebtorListRow,
  GreenTargetTradeDebtorListTotals,
} from "../../types/greenTargetTradeDebtorList";
import { printPdfFrameWithFallback } from "../pdfPrintFallback";

const CHILD_ROWS_PER_PAGE = 44;
const LEGACY_COMPANY_HEADER =
  "GREEN TARGET WASTE TREATMENT IND.SDN BHD (712282-M)";

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 34,
    paddingHorizontal: 28,
    fontFamily: "Courier",
    fontSize: 8,
    color: "#000000",
  },
  company: {
    fontSize: 9,
    textAlign: "center",
  },
  title: {
    marginTop: 2,
    fontSize: 9,
    textAlign: "center",
  },
  reportDate: {
    marginTop: 18,
    marginBottom: 8,
  },
  columns: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 30,
    marginBottom: 6,
  },
  sectionRow: {
    flexDirection: "row",
    minHeight: 17,
    paddingTop: 2,
    paddingBottom: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 12,
    fontSize: 7.2,
  },
  account: {
    width: "18%",
    paddingRight: 4,
  },
  particular: {
    width: "34%",
    paddingRight: 5,
  },
  amount: {
    width: "16%",
    paddingLeft: 3,
    textAlign: "right",
  },
  columnAmount: {
    width: "16%",
    paddingLeft: 3,
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    marginTop: 5,
  },
  footerAmount: {
    width: "16%",
    paddingLeft: 3,
    paddingTop: 4,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    textAlign: "right",
  },
  footerSpacer: {
    width: "52%",
  },
});

const formatAmount = (amount: number): string => {
  const normalizedAmount: number = Number(amount || 0);
  if (Math.abs(normalizedAmount) <= 0.005) return ".00";
  const formattedAmount: string = Math.abs(normalizedAmount).toLocaleString(
    "en-MY",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );
  return normalizedAmount < 0 ? `-${formattedAmount}` : formattedAmount;
};

const chunkChildRows = (
  rows: GreenTargetTradeDebtorListRow[]
): GreenTargetTradeDebtorListRow[][] => {
  if (rows.length === 0) return [[]];
  const pages: GreenTargetTradeDebtorListRow[][] = [];
  for (
    let index: number = 0;
    index < rows.length;
    index += CHILD_ROWS_PER_PAGE
  ) {
    pages.push(rows.slice(index, index + CHILD_ROWS_PER_PAGE));
  }
  return pages;
};

interface LegacyPageHeaderProps {
  statementDate: string;
  previousStatementDate: string;
  reportDateTime: string;
}

const LegacyPageHeader: React.FC<LegacyPageHeaderProps> = ({
  statementDate,
  previousStatementDate,
  reportDateTime,
}) => (
  <>
    <Text style={styles.company}>{LEGACY_COMPANY_HEADER}</Text>
    <Text style={styles.title}>SUB-SCHEDULES AS AT {statementDate}</Text>
    <Text style={styles.reportDate}>REPORT DATE : {reportDateTime}</Text>
    <View style={styles.columns} fixed>
      <Text style={styles.account}>A/C NO.</Text>
      <Text style={styles.particular}>PARTICULAR</Text>
      <Text style={styles.columnAmount}>YEAR-TO{"\n"}-DATE</Text>
      <Text style={styles.columnAmount}>THIS{"\n"}MONTH</Text>
      <Text style={styles.columnAmount}>
        MONTH OF{"\n"}{previousStatementDate}
      </Text>
    </View>
  </>
);

interface SectionHeaderProps {
  accountNo: string;
  particular: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  accountNo,
  particular,
}) => (
  <View style={styles.sectionRow} wrap={false}>
    <Text style={styles.account}>{accountNo}</Text>
    <Text style={styles.particular}>{particular}</Text>
    <Text style={styles.amount} />
    <Text style={styles.amount} />
    <Text style={styles.amount} />
  </View>
);

const DebtorRow: React.FC<{ row: GreenTargetTradeDebtorListRow }> = ({ row }) => (
  <View style={styles.row} wrap={false}>
    <Text style={styles.account}>{row.account_no.slice(0, 16)}</Text>
    <Text style={styles.particular}>{row.particular.slice(0, 40)}</Text>
    <Text style={styles.amount}>{formatAmount(row.closing_balance)}</Text>
    <Text style={styles.amount}>{formatAmount(row.current_month)}</Text>
    <Text style={styles.amount}>{formatAmount(row.previous_month)}</Text>
  </View>
);

const ControlFooter: React.FC<{ totals: GreenTargetTradeDebtorListTotals }> = ({
  totals,
}) => (
  <View style={styles.footer} wrap={false}>
    <View style={styles.footerSpacer} />
    <Text style={styles.footerAmount}>
      {formatAmount(totals.closing_balance)}
    </Text>
    <Text style={styles.footerAmount}>{formatAmount(totals.current_month)}</Text>
    <Text style={styles.footerAmount}>{formatAmount(totals.previous_month)}</Text>
  </View>
);

interface GreenTargetTradeDebtorListPDFProps {
  data: GreenTargetTradeDebtorListResponse;
}

const GreenTargetTradeDebtorListPDF: React.FC<
  GreenTargetTradeDebtorListPDFProps
> = ({ data }) => {
  const childPages: GreenTargetTradeDebtorListRow[][] = chunkChildRows(
    data.cd_sd.rows
  );

  return (
    <Document title={`GT Sub-Schedules as at ${data.statement_date}`}>
      <Page size="A4" style={styles.page}>
        <LegacyPageHeader
          statementDate={data.statement_date}
          previousStatementDate={data.previous_statement_date}
          reportDateTime={data.report_datetime}
        />
        <SectionHeader accountNo="DEBTOR" particular="TRADE DEBTOR" />
        {data.direct.rows.map((row: GreenTargetTradeDebtorListRow) => (
          <DebtorRow key={row.account_no} row={row} />
        ))}
        <ControlFooter totals={data.direct.control_totals} />
      </Page>

      {childPages.map(
        (
          pageRows: GreenTargetTradeDebtorListRow[],
          pageIndex: number
        ) => (
          <Page key={pageIndex} size="A4" style={styles.page}>
            <LegacyPageHeader
              statementDate={data.statement_date}
              previousStatementDate={data.previous_statement_date}
              reportDateTime={data.report_datetime}
            />
            <SectionHeader
              accountNo="CD SD"
              particular="CASH DEBTORS (SUNDRY DEBTORS)"
            />
            {pageRows.map((row: GreenTargetTradeDebtorListRow) => (
              <DebtorRow key={row.account_no} row={row} />
            ))}
            {pageIndex === childPages.length - 1 && (
              <ControlFooter totals={data.cd_sd.control_totals} />
            )}
          </Page>
        )
      )}
    </Document>
  );
};

export const printGreenTargetTradeDebtorListPDF = async (
  data: GreenTargetTradeDebtorListResponse
): Promise<void> => {
  const pdfBlob: Blob = await pdf(
    <GreenTargetTradeDebtorListPDF data={data} />
  ).toBlob();
  const pdfUrl: string = URL.createObjectURL(pdfBlob);
  const printFrame: HTMLIFrameElement = document.createElement("iframe");
  printFrame.style.display = "none";
  document.body.appendChild(printFrame);

  const cleanup = (): void => {
    if (document.body.contains(printFrame)) document.body.removeChild(printFrame);
    URL.revokeObjectURL(pdfUrl);
    window.removeEventListener("focus", cleanup);
  };

  printFrame.onload = (): void => {
    if (!printFrame.contentWindow) {
      cleanup();
      return;
    }
    printPdfFrameWithFallback(printFrame, pdfUrl, {
      logLabel: "Green Target legacy Trade Debtor List PDF",
    });
    window.addEventListener("focus", cleanup, { once: true });
  };
  printFrame.src = pdfUrl;
};

export default GreenTargetTradeDebtorListPDF;
