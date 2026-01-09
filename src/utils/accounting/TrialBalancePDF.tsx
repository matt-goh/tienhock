import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Image,
} from "@react-pdf/renderer";
import TienHockLogo from "../tienhock.png";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";

const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  borderDark: "#334155",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  success: "#166534",
  danger: "#b91c1c",
  header: {
    companyName: "#1e293b",
    companyDetails: "#334155",
  },
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 15,
    paddingBottom: 40,
    paddingLeft: 30,
    paddingRight: 30,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: colors.textPrimary,
  },
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.textMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  logo: {
    width: 45,
    height: 45,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.header.companyName,
  },
  reportTitle: {
    fontSize: 10,
    marginTop: 4,
    color: colors.header.companyDetails,
    lineHeight: 1.2,
  },
  periodText: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 2,
  },
  balanceStatus: {
    marginTop: 8,
    marginBottom: 8,
    padding: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  balanceStatusBalanced: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
  balanceStatusUnbalanced: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
  },
  balanceStatusText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  table: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  tableRowAlt: {
    backgroundColor: "#fafafa",
  },
  tableFooter: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderTopWidth: 1.5,
    borderTopColor: colors.borderDark,
  },
  cellCode: {
    width: "15%",
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontFamily: "Courier",
    fontSize: 7,
  },
  cellDescription: {
    width: "37%",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  cellType: {
    width: "8%",
    paddingVertical: 4,
    paddingHorizontal: 4,
    textAlign: "center",
  },
  cellNote: {
    width: "8%",
    paddingVertical: 4,
    paddingHorizontal: 4,
    textAlign: "center",
  },
  cellDebit: {
    width: "16%",
    paddingVertical: 4,
    paddingHorizontal: 4,
    textAlign: "right",
    fontFamily: "Courier",
    fontSize: 7,
  },
  cellCredit: {
    width: "16%",
    paddingVertical: 4,
    paddingHorizontal: 4,
    textAlign: "right",
    fontFamily: "Courier",
    fontSize: 7,
  },
  headerCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: colors.textPrimary,
  },
  footerCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  totalLabel: {
    width: "68%",
    paddingVertical: 5,
    paddingHorizontal: 4,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  generatedAt: {
    marginTop: 10,
    fontSize: 7,
    color: colors.textMuted,
    textAlign: "right",
  },
});

interface TrialBalanceAccount {
  code: string;
  description: string;
  ledger_type: string;
  fs_note: string | null;
  note_name: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface TrialBalanceTotals {
  debit: number;
  credit: number;
  difference: number;
  is_balanced: boolean;
}

interface TrialBalanceData {
  period: {
    year: number;
    month: number;
    end_date: string;
  };
  accounts: TrialBalanceAccount[];
  totals: TrialBalanceTotals;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const getMonthName = (year: number, month: number): string => {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString("default", { month: "long", year: "numeric" });
};

interface TrialBalancePDFDocumentProps {
  data: TrialBalanceData;
  accounts: TrialBalanceAccount[];
}

const TrialBalancePDFDocument: React.FC<TrialBalancePDFDocumentProps> = ({
  data,
  accounts,
}) => {
  // Calculate totals from filtered accounts
  const filteredTotals = accounts.reduce(
    (acc, account) => ({
      debit: acc.debit + account.debit,
      credit: acc.credit + account.credit,
    }),
    { debit: 0, credit: 0 }
  );

  const isBalanced = Math.abs(filteredTotals.debit - filteredTotals.credit) < 0.01;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{TIENHOCK_INFO.name}</Text>
            <Text style={styles.reportTitle}>TRIAL BALANCE</Text>
            <Text style={styles.periodText}>
              As at {data.period.end_date} | Period: {getMonthName(data.period.year, data.period.month)}
            </Text>
          </View>
        </View>

        {/* Balance Status */}
        <View
          style={[
            styles.balanceStatus,
            isBalanced
              ? styles.balanceStatusBalanced
              : styles.balanceStatusUnbalanced,
          ]}
        >
          <Text
            style={[
              styles.balanceStatusText,
              { color: isBalanced ? colors.success : colors.danger },
            ]}
          >
            {isBalanced
              ? "TRIAL BALANCE IS BALANCED"
              : `TRIAL BALANCE IS NOT BALANCED (Difference: RM ${formatCurrency(
                  Math.abs(filteredTotals.debit - filteredTotals.credit)
                )})`}
          </Text>
        </View>

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.cellCode, styles.headerCell]}>
              Account Code
            </Text>
            <Text style={[styles.cellDescription, styles.headerCell]}>
              Description
            </Text>
            <Text style={[styles.cellType, styles.headerCell]}>Type</Text>
            <Text style={[styles.cellNote, styles.headerCell]}>Note</Text>
            <Text style={[styles.cellDebit, styles.headerCell]}>Debit (RM)</Text>
            <Text style={[styles.cellCredit, styles.headerCell]}>
              Credit (RM)
            </Text>
          </View>

          {/* Table Body */}
          {accounts.map((account, index) => (
            <View
              key={account.code}
              style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
            >
              <Text style={styles.cellCode}>{account.code}</Text>
              <Text style={styles.cellDescription}>{account.description}</Text>
              <Text style={styles.cellType}>{account.ledger_type}</Text>
              <Text style={styles.cellNote}>{account.fs_note || "-"}</Text>
              <Text style={styles.cellDebit}>
                {account.debit > 0 ? formatCurrency(account.debit) : "-"}
              </Text>
              <Text style={styles.cellCredit}>
                {account.credit > 0 ? formatCurrency(account.credit) : "-"}
              </Text>
            </View>
          ))}

          {/* Table Footer - Totals */}
          <View style={styles.tableFooter}>
            <Text style={styles.totalLabel}>TOTALS:</Text>
            <Text style={[styles.cellDebit, styles.footerCell]}>
              {formatCurrency(filteredTotals.debit)}
            </Text>
            <Text style={[styles.cellCredit, styles.footerCell]}>
              {formatCurrency(filteredTotals.credit)}
            </Text>
          </View>
        </View>

        {/* Generated At */}
        <Text style={styles.generatedAt}>
          Generated on {new Date().toLocaleString("en-MY")} | {accounts.length}{" "}
          accounts
        </Text>

        {/* Page Numbers */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
};

export const generateTrialBalancePDF = async (
  data: TrialBalanceData,
  accounts: TrialBalanceAccount[]
): Promise<void> => {
  const blob = await pdf(
    <TrialBalancePDFDocument data={data} accounts={accounts} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Trial_Balance_${data.period.year}_${String(data.period.month).padStart(2, "0")}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
