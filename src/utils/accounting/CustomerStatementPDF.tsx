// src/utils/accounting/CustomerStatementPDF.tsx
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

// Types for the statement data
interface Transaction {
  date: string;
  particulars: string;
  type: "debit" | "credit";
  amount: number;
  running_balance: number;
}

interface Aging {
  current_month: number;
  one_month: number;
  two_months: number;
  three_months_plus: number;
}

interface CustomerStatementData {
  customer: {
    id: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    phone_number?: string;
    email?: string;
  };
  statement_date: string;
  statement_month: number;
  statement_year: number;
  previous_balance: number;
  transactions: Transaction[];
  total_amount_due: number;
  aging: Aging;
}

// Color palette
const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  borderDark: "#334155",
  border: "#cbd5e1",
  success: "#166534",
  danger: "#b91c1c",
};

// Styles
const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 30,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: colors.textPrimary,
  },
  // Header Section
  header: {
    alignItems: "center",
    marginBottom: 15,
  },
  logo: {
    width: 50,
    height: 50,
    marginBottom: 8,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 4,
  },
  companyDetails: {
    fontSize: 9,
    textAlign: "center",
    color: colors.textSecondary,
    lineHeight: 1.4,
  },
  // Statement Title
  statementTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    textDecoration: "underline",
    marginTop: 12,
    marginBottom: 15,
  },
  // Customer Info Section
  customerSection: {
    marginBottom: 15,
    marginLeft: 5,
  },
  customerIdRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  customerIdLabel: {
    width: 80,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  customerIdValue: {
    fontSize: 10,
  },
  customerAddress: {
    marginLeft: 80,
    fontSize: 10,
    lineHeight: 1.4,
  },
  // Divider
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
    marginVertical: 8,
  },
  doubleDivider: {
    borderBottomWidth: 2,
    borderBottomColor: colors.borderDark,
    marginVertical: 8,
  },
  // Table
  table: {
    width: "100%",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    fontSize: 9,
  },
  // Column widths
  colDate: { width: "12%" },
  colParticulars: { width: "40%" },
  colDebit: { width: "16%", textAlign: "right", paddingRight: 8 },
  colCredit: { width: "16%", textAlign: "right", paddingRight: 8 },
  colBalance: { width: "16%", textAlign: "right", paddingRight: 4 },
  // Total Section
  totalSection: {
    marginTop: 20,
    marginBottom: 15,
    alignItems: "flex-end",
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginRight: 20,
  },
  totalValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  // Aging Section
  agingSection: {
    marginTop: 15,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  agingHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  agingRow: {
    flexDirection: "row",
  },
  agingCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    textAlign: "center",
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
  },
  agingCellLast: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    textAlign: "center",
  },
  agingHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  agingValueText: {
    fontSize: 9,
  },
  // Page Number
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 15,
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.textMuted,
  },
});

// Helper functions
const formatCurrency = (amount: number): string => {
  if (amount === 0) return ".00";
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatCurrencyFull = (amount: number): string => {
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// PDF Component
const CustomerStatementPDF: React.FC<{ data: CustomerStatementData }> = ({
  data,
}) => {
  const { customer, statement_date, previous_balance, transactions, total_amount_due, aging } = data;

  // Build customer address string
  const addressLines: string[] = [];
  if (customer.address) addressLines.push(customer.address);
  if (customer.city || customer.state) {
    const cityState = [customer.city, customer.state].filter(Boolean).join(", ");
    addressLines.push(cityState);
  }

  return (
    <Document title={`Statement of Account - ${customer.id} - ${statement_date}`}>
      <Page size="A4" style={styles.page}>
        {/* Company Header */}
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <Text style={styles.companyName}>
            TIEN HOCK FOOD INDUSTRIES SDN BHD (953309-T)
          </Text>
          <Text style={styles.companyDetails}>
            {TIENHOCK_INFO.address_pdf}
          </Text>
          <Text style={styles.companyDetails}>
            P.O.BOX 11090, {TIENHOCK_INFO.postcode} {TIENHOCK_INFO.city_pdf}, {TIENHOCK_INFO.state_pdf}
          </Text>
          <Text style={styles.companyDetails}>
            TEL : {TIENHOCK_INFO.phone} & 714306
          </Text>
          <Text style={styles.companyDetails}>
            FAX : 088-726452 H/P : 016-8328244
          </Text>
          <Text style={styles.companyDetails}>
            GST ID NO : 000397869056
          </Text>
        </View>

        {/* Statement Title */}
        <Text style={styles.statementTitle}>
          STATEMENT OF ACCOUNT AS AT {statement_date}
        </Text>

        {/* Customer Info */}
        <View style={styles.customerSection}>
          <View style={styles.customerIdRow}>
            <Text style={styles.customerIdLabel}>{customer.id}</Text>
            <Text style={styles.customerIdValue}>
              : {customer.name || "UNNAMED CUSTOMER"}
            </Text>
          </View>
          {addressLines.map((line, index) => (
            <Text key={index} style={styles.customerAddress}>
              {line}
            </Text>
          ))}
        </View>

        {/* Double Divider */}
        <View style={styles.doubleDivider} />

        {/* Table Header */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDate}>DATE</Text>
            <Text style={styles.colParticulars}>PARTICULARS</Text>
            <Text style={styles.colDebit}>DEBIT</Text>
            <Text style={styles.colCredit}>CREDIT</Text>
            <Text style={styles.colBalance}>BALANCE</Text>
          </View>

          <View style={styles.doubleDivider} />

          {/* Previous Balance Row - Always shown */}
          <View style={styles.tableRow}>
            <Text style={styles.colDate}>01/{String(data.statement_month).padStart(2, '0')}/{data.statement_year}</Text>
            <Text style={styles.colParticulars}>BALANCE FROM PREVIOUS STATEMENT</Text>
            <Text style={styles.colDebit}></Text>
            <Text style={styles.colCredit}></Text>
            <Text style={styles.colBalance}>{formatCurrencyFull(previous_balance)}</Text>
          </View>

          {/* Transaction Rows */}
          {transactions.map((txn, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colDate}>{txn.date}</Text>
              <Text style={styles.colParticulars}>{txn.particulars}</Text>
              <Text style={styles.colDebit}>
                {txn.type === "debit" ? formatCurrency(txn.amount) : ""}
              </Text>
              <Text style={styles.colCredit}>
                {txn.type === "credit" ? formatCurrency(txn.amount) : ""}
              </Text>
              <Text style={styles.colBalance}>{formatCurrency(txn.running_balance)}</Text>
            </View>
          ))}
        </View>

        {/* Total Amount Due */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL AMOUNT DUE ($)</Text>
            <Text style={styles.totalValue}>{formatCurrency(total_amount_due)}</Text>
          </View>
        </View>

        {/* Divider before Aging */}
        <View style={styles.doubleDivider} />

        {/* Aging Section */}
        <View style={styles.agingSection}>
          <View style={styles.agingHeader}>
            <View style={styles.agingCell}>
              <Text style={styles.agingHeaderText}>CURRENT MONTH</Text>
            </View>
            <View style={styles.agingCell}>
              <Text style={styles.agingHeaderText}>ONE MONTH</Text>
            </View>
            <View style={styles.agingCell}>
              <Text style={styles.agingHeaderText}>TWO MONTHS</Text>
            </View>
            <View style={styles.agingCellLast}>
              <Text style={styles.agingHeaderText}>THREE MONTHS & OVER</Text>
            </View>
          </View>
          <View style={styles.agingRow}>
            <View style={styles.agingCell}>
              <Text style={styles.agingValueText}>{formatCurrency(aging.current_month)}</Text>
            </View>
            <View style={styles.agingCell}>
              <Text style={styles.agingValueText}>{formatCurrency(aging.one_month)}</Text>
            </View>
            <View style={styles.agingCell}>
              <Text style={styles.agingValueText}>{formatCurrency(aging.two_months)}</Text>
            </View>
            <View style={styles.agingCellLast}>
              <Text style={styles.agingValueText}>{formatCurrency(aging.three_months_plus)}</Text>
            </View>
          </View>
        </View>

        {/* Divider after Aging */}
        <View style={styles.doubleDivider} />

        {/* Page Number */}
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

// PDF Generation Function
export const generateCustomerStatementPDF = async (
  data: CustomerStatementData,
  action: "download" | "print"
): Promise<void> => {
  try {
    const doc = <CustomerStatementPDF data={data} />;
    const pdfBlob = await pdf(doc).toBlob();

    if (action === "download") {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Statement_${data.customer.id}_${data.statement_date.replace(/\//g, "_")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const url = URL.createObjectURL(pdfBlob);
      const printFrame = document.createElement("iframe");
      printFrame.style.display = "none";
      document.body.appendChild(printFrame);
      printFrame.onload = () => {
        if (printFrame.contentWindow) {
          try {
            printFrame.contentWindow.print();
          } catch (e) {
            console.error("Print failed:", e);
          }
          const cleanup = () => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
            URL.revokeObjectURL(url);
            window.removeEventListener("focus", cleanup);
          };
          window.addEventListener("focus", cleanup, { once: true });
        }
      };
      printFrame.src = url;
    }
  } catch (error) {
    console.error("Error generating customer statement PDF:", error);
    throw error;
  }
};

export default CustomerStatementPDF;
