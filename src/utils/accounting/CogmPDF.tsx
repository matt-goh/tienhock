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
import { printPdfBlob } from "../pdfPrintFallback";
import { formatCogmAmount, getCogmLayoutRows } from "./cogmLayout";
import type { CogmData, CogmLayoutRow } from "./cogmLayout";

const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  border: "#64748b",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
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
    marginBottom: 12,
    gap: 12,
  },
  logo: { width: 50, height: 50 },
  headerTextContainer: { flex: 1 },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  reportTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 6,
    color: colors.textSecondary,
  },
  periodText: { fontSize: 9, color: colors.textMuted, marginTop: 3 },
  columnHeader: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.border,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  lineItem: { flexDirection: "row", paddingVertical: 3 },
  spacedItem: { marginTop: 22 },
  lineItemLabel: { flex: 1, paddingRight: 8 },
  note: { width: 50, textAlign: "center" },
  amount: { width: 110, textAlign: "right", fontFamily: "Courier" },
  subtotal: { flexDirection: "row", marginTop: 3, marginBottom: 6 },
  subtotalSpacer: { flex: 1 },
  subtotalAmount: {
    width: 110,
    textAlign: "right",
    fontFamily: "Courier-Bold",
    paddingTop: 5,
    borderTopWidth: 0.75,
    borderTopColor: colors.border,
  },
  finalTotal: { flexDirection: "row", marginTop: 4 },
  finalTotalLabel: { flex: 1, fontFamily: "Helvetica-Bold", paddingTop: 8 },
  finalAmountBox: {
    width: 110,
    paddingBottom: 2,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.textPrimary,
  },
  finalTotalAmount: {
    textAlign: "right",
    fontSize: 10,
    fontFamily: "Courier-Bold",
    paddingTop: 7,
    paddingBottom: 5,
    borderTopWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: colors.textPrimary,
  },
  generatedAt: { marginTop: 12, fontSize: 7, color: colors.textMuted, textAlign: "right" },
});

interface CogmPDFDocumentProps {
  data: CogmData;
}

const CogmPDFDocument: React.FC<CogmPDFDocumentProps> = ({ data }) => {
  return (
    <Document
      title={`COGM ${data.period.start_date} to ${data.period.end_date} - ${TIENHOCK_INFO.name}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{TIENHOCK_INFO.name}</Text>
            <Text style={styles.reportTitle}>COST OF GOODS MANUFACTURED</Text>
            <Text style={styles.periodText}>
              For the period {data.period.start_date} to {data.period.end_date}
            </Text>
          </View>
        </View>

        <View style={styles.columnHeader}>
          <Text style={styles.lineItemLabel}>PARTICULAR</Text>
          <Text style={styles.note}>NOTE</Text>
          <Text style={styles.amount}>RM</Text>
        </View>

        {getCogmLayoutRows(data).map((row: CogmLayoutRow): React.ReactNode => {
          if (row.kind === "heading") {
            return <Text key={row.key} style={styles.sectionTitle} minPresenceAhead={40}>{row.label}</Text>;
          }
          if (row.kind === "subtotal") {
            return (
              <View key={row.key} style={styles.subtotal} wrap={false}>
                <View style={styles.subtotalSpacer} />
                <Text style={styles.subtotalAmount}>{formatCogmAmount(row.amount)}</Text>
              </View>
            );
          }
          return (
            <View key={row.key} style={row.spaceBefore ? [styles.lineItem, styles.spacedItem] : styles.lineItem} wrap={false}>
              <Text style={styles.lineItemLabel}>{row.label}</Text>
              <Text style={styles.note}>{row.note}</Text>
              <Text style={styles.amount}>{formatCogmAmount(row.amount)}</Text>
            </View>
          );
        })}

        <View style={styles.finalTotal} wrap={false}>
          <Text style={styles.finalTotalLabel}>COST OF GOODS MANUFACTURED</Text>
          <View style={styles.finalAmountBox}>
            <Text style={styles.finalTotalAmount}>{formatCogmAmount(data.total_cogm)}</Text>
          </View>
        </View>

        {/* Generated At */}
        <Text style={styles.generatedAt}>
          Generated on {new Date().toLocaleString("en-MY")}
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

export const generateCogmPDF = async (data: CogmData): Promise<void> => {
  const blob = await pdf(<CogmPDFDocument data={data} />).toBlob();

  printPdfBlob(
    blob,
    `COGM ${data.period.start_date} to ${data.period.end_date} - ${TIENHOCK_INFO.name}`
  );
};
