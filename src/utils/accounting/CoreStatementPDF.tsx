import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import TienHockLogo from "../tienhock.png";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";
import { formatStatementAmount, type StatementLayoutRow } from "./coreStatementLayout";

const colors: Record<string, string> = {
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
    marginTop: 14,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  lineItem: { flexDirection: "row", paddingVertical: 2 },
  spacedItem: { marginTop: 14 },
  lineItemLabel: { flex: 1, paddingRight: 8 },
  note: { width: 50, textAlign: "center" },
  amount: { width: 110, textAlign: "right", fontFamily: "Courier" },
  subtotal: { flexDirection: "row", marginTop: 3, marginBottom: 6 },
  subtotalLabel: { flex: 1, fontFamily: "Helvetica-Bold", paddingTop: 5, paddingRight: 8 },
  subtotalAmount: {
    width: 110,
    textAlign: "right",
    fontFamily: "Courier-Bold",
    paddingTop: 5,
    borderTopWidth: 0.75,
    borderTopColor: colors.border,
  },
  finalTotal: { flexDirection: "row", marginTop: 4 },
  finalTotalLabel: { flex: 1, fontFamily: "Helvetica-Bold", paddingTop: 8, paddingRight: 8 },
  warning: { fontSize: 8, color: "#b91c1c", marginBottom: 8 },
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

interface CoreStatementPDFDocumentProps {
  title: string;
  period: string;
  documentTitle: string;
  rows: StatementLayoutRow[];
  warning?: string;
}

export const CoreStatementPDFDocument: React.FC<CoreStatementPDFDocumentProps> = ({
  title, period, documentTitle, rows, warning,
}) => (
  <Document title={documentTitle}>
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        <Image src={TienHockLogo} style={styles.logo} />
        <View style={styles.headerTextContainer}>
          <Text style={styles.companyName}>{TIENHOCK_INFO.name}</Text>
          <Text style={styles.reportTitle}>{title}</Text>
          <Text style={styles.periodText}>{period}</Text>
        </View>
      </View>
      {warning && <Text style={styles.warning}>{warning}</Text>}
      <View style={styles.columnHeader} fixed>
        <Text style={styles.lineItemLabel}>PARTICULAR</Text>
        <Text style={styles.note}>NOTE</Text>
        <Text style={styles.amount}>RM</Text>
      </View>
      {rows.map((row: StatementLayoutRow, index: number): React.ReactNode => {
        if (row.kind === "heading") {
          return <Text key={row.key} style={styles.sectionTitle} minPresenceAhead={40}>{row.label}</Text>;
        }
        if (row.kind === "total") {
          return row.doubleRule ? (
            <View key={row.key} style={styles.finalTotal} wrap={false}>
              <Text style={styles.finalTotalLabel}>{row.label}</Text>
              <View style={styles.finalAmountBox}>
                <Text style={styles.finalTotalAmount}>{formatStatementAmount(row.amount)}</Text>
              </View>
            </View>
          ) : (
            <View key={row.key} style={styles.subtotal} wrap={false}>
              <Text style={styles.subtotalLabel}>{row.label}</Text>
              <Text style={styles.subtotalAmount}>{formatStatementAmount(row.amount)}</Text>
            </View>
          );
        }
        return (
          <View key={row.key} style={row.spaceBefore ? [styles.lineItem, styles.spacedItem] : styles.lineItem}
            wrap={false} minPresenceAhead={rows[index + 1]?.kind === "total" ? 28 : 0}>
            <Text style={styles.lineItemLabel}>{row.label}</Text>
            <Text style={styles.note}>{row.note}</Text>
            <Text style={styles.amount}>{formatStatementAmount(row.amount)}</Text>
          </View>
        );
      })}
      <Text style={styles.generatedAt}>Generated on {new Date().toLocaleString("en-MY")}</Text>
      <Text style={styles.pageNumber}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }): string => `Page ${pageNumber} of ${totalPages}`}
        fixed />
    </Page>
  </Document>
);
