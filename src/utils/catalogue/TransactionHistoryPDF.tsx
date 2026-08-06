// src/utils/catalogue/TransactionHistoryPDF.tsx
// PDF for a customer's Transaction History (the CustomerTransactionsTab view):
// a merged, date-sorted list of invoices, payments and adjustment documents over
// a selected period. Mirrors the print/download pattern of CustomerStatementPDF.
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
import { printPdfFrameWithFallback } from "../pdfPrintFallback";

export interface TxnHistoryRow {
  date: string; // formatted dd/mm/yyyy
  typeLabel: string; // "Invoice" | "Payment" | "Credit Note" | ...
  reference: string;
  relatedInvoice: string | null;
  amount: number;
  direction: "debit" | "credit";
  status: string | null;
}

export interface TransactionHistoryData {
  customer: { id: string; name: string };
  periodLabel: string; // e.g. "01/06/2026 – 28/06/2026"
  rows: TxnHistoryRow[];
  summary: { invoiced: number; paid: number; adjustments: number };
}

const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  borderDark: "#334155",
  border: "#cbd5e1",
  success: "#166534",
  danger: "#b91c1c",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 30,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: colors.textPrimary,
  },
  header: { alignItems: "center", marginBottom: 12 },
  logo: { width: 46, height: 46, marginBottom: 6 },
  companyName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 3,
  },
  companyDetails: {
    fontSize: 8,
    textAlign: "center",
    color: colors.textSecondary,
    lineHeight: 1.4,
  },
  title: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    textDecoration: "underline",
    marginTop: 10,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  metaLabel: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  metaValue: { fontSize: 9 },
  // Summary strip
  summary: {
    flexDirection: "row",
    marginTop: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  summaryCellLast: { flex: 1, paddingVertical: 5, paddingHorizontal: 6 },
  summaryLabel: { fontSize: 7, color: colors.textMuted, marginBottom: 2 },
  summaryValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderDark,
    paddingVertical: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    fontSize: 8,
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderDark,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  colDate: { width: "12%", paddingHorizontal: 3 },
  colType: { width: "14%", paddingHorizontal: 3 },
  colRef: { width: "21%", paddingHorizontal: 3 },
  colInv: { width: "15%", paddingHorizontal: 3 },
  colDebit: { width: "14%", textAlign: "right", paddingHorizontal: 3 },
  colCredit: { width: "14%", textAlign: "right", paddingHorizontal: 3 },
  colStatus: { width: "10%", paddingHorizontal: 3, textAlign: "right" },
  credit: { color: colors.success },
  debit: { color: colors.danger },
  emptyState: {
    textAlign: "center",
    paddingVertical: 20,
    color: colors.textMuted,
    fontSize: 9,
  },
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 14,
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.textMuted,
  },
});

const fmt = (amount: number): string =>
  (Number(amount) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const TransactionHistoryPDF: React.FC<{ data: TransactionHistoryData }> = ({
  data,
}) => {
  const { customer, periodLabel, rows, summary } = data;

  const totalDebit = rows.reduce(
    (s, r) => s + (r.direction === "debit" ? r.amount : 0),
    0
  );
  const totalCredit = rows.reduce(
    (s, r) => s + (r.direction === "credit" ? r.amount : 0),
    0
  );

  return (
    <Document title={`Transaction History - ${customer.id} - ${periodLabel}`}>
      <Page size="A4" style={styles.page}>
        {/* Company Header */}
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <Text style={styles.companyName}>
            TIEN HOCK FOOD INDUSTRIES SDN BHD (953309-T)
          </Text>
          <Text style={styles.companyDetails}>{TIENHOCK_INFO.address_pdf}</Text>
          <Text style={styles.companyDetails}>
            TEL : {TIENHOCK_INFO.phone} & 714306
          </Text>
        </View>

        <Text style={styles.title}>TRANSACTION HISTORY</Text>

        {/* Customer + period meta */}
        <View style={styles.metaRow}>
          <Text style={styles.metaValue}>
            <Text style={styles.metaLabel}>{customer.id}</Text> :{" "}
            {customer.name || "UNNAMED CUSTOMER"}
          </Text>
          <Text style={styles.metaValue}>
            <Text style={styles.metaLabel}>Period: </Text>
            {periodLabel}
          </Text>
        </View>

        {/* Summary strip */}
        <View style={styles.summary}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>TOTAL INVOICED (RM)</Text>
            <Text style={styles.summaryValue}>{fmt(summary.invoiced)}</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>TOTAL PAID (RM)</Text>
            <Text style={[styles.summaryValue, styles.credit]}>
              {fmt(summary.paid)}
            </Text>
          </View>
          <View style={styles.summaryCellLast}>
            <Text style={styles.summaryLabel}>ADJUSTMENTS</Text>
            <Text style={styles.summaryValue}>{summary.adjustments}</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader} fixed>
          <Text style={styles.colDate}>DATE</Text>
          <Text style={styles.colType}>TYPE</Text>
          <Text style={styles.colRef}>REFERENCE</Text>
          <Text style={styles.colInv}>RELATED INV.</Text>
          <Text style={styles.colDebit}>DEBIT</Text>
          <Text style={styles.colCredit}>CREDIT</Text>
          <Text style={styles.colStatus}>STATUS</Text>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.emptyState}>
            No transactions found for this period.
          </Text>
        ) : (
          <>
            {rows.map((row, index) => (
              <View key={index} style={styles.tableRow} wrap={false}>
                <Text style={styles.colDate}>{row.date}</Text>
                <Text style={styles.colType}>{row.typeLabel}</Text>
                <Text style={styles.colRef}>{row.reference}</Text>
                <Text style={styles.colInv}>{row.relatedInvoice || "-"}</Text>
                <Text style={[styles.colDebit, styles.debit]}>
                  {row.direction === "debit" ? fmt(row.amount) : ""}
                </Text>
                <Text style={[styles.colCredit, styles.credit]}>
                  {row.direction === "credit" ? fmt(row.amount) : ""}
                </Text>
                <Text style={styles.colStatus}>{row.status || "-"}</Text>
              </View>
            ))}

            {/* Totals */}
            <View style={styles.totalRow}>
              <Text style={styles.colDate}></Text>
              <Text style={styles.colType}></Text>
              <Text style={styles.colRef}>TOTAL</Text>
              <Text style={styles.colInv}></Text>
              <Text style={[styles.colDebit, styles.debit]}>
                {fmt(totalDebit)}
              </Text>
              <Text style={[styles.colCredit, styles.credit]}>
                {fmt(totalCredit)}
              </Text>
              <Text style={styles.colStatus}></Text>
            </View>
          </>
        )}

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

export const generateTransactionHistoryPDF = async (
  data: TransactionHistoryData,
  action: "download" | "print"
): Promise<void> => {
  const doc = <TransactionHistoryPDF data={data} />;
  const pdfBlob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(pdfBlob);

  if (action === "download") {
    const link = document.createElement("a");
    link.href = url;
    link.download = `Transaction_History_${data.customer.id}_${data.periodLabel.replace(
      /[^0-9A-Za-z]+/g,
      "_"
    )}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    const printFrame = document.createElement("iframe");
    printFrame.style.display = "none";
    document.body.appendChild(printFrame);
    printFrame.onload = () => {
      if (printFrame.contentWindow) {
        printPdfFrameWithFallback(printFrame, url, {
          logLabel: "transaction history PDF",
        });
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
};

export default TransactionHistoryPDF;
