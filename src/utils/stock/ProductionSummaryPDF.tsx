// src/utils/stock/ProductionSummaryPDF.tsx
// PDF printout of the monthly production summary, replacing the legacy
// dot-matrix "SUMMARY MONTHLY MEE PRODUCTION AS AT (07/2026)" report.
//
// One sheet per Production Records page: the Mee page prints the MEE sheet,
// the Bihun page the BIHUN sheet, and so on. Rows are the products that have
// production entries in the selected period, in the shared product display
// order, with a grand total. Content comes from the entries already loaded by
// the page, never hardcoded.
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
import { printPdfBlob } from "../pdfPrintFallback";

export interface ProductionSummaryRow {
  productId: string;
  description: string;
  quantity: number;
}

export interface ProductionSummaryData {
  companyName: string;
  // e.g. "Summary Monthly Mee Production"
  reportTitle: string;
  // e.g. "As at (07/2026)"
  periodLabel: string;
  // Column heading for the quantity column: "Bags", "Pcs", or "Quantity" when
  // the sheet mixes units.
  unitLabel: string;
  rows: ProductionSummaryRow[];
  total: number;
}

const colors = {
  textPrimary: "#111827",
  textSecondary: "#374151",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  borderDark: "#9CA3AF",
  zebra: "#F9FAFB",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 40,
    paddingLeft: 40,
    paddingRight: 40,
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
    marginBottom: 15,
    gap: 12,
  },
  logo: {
    width: 50,
    height: 50,
  },
  headerTextContainer: {
    flex: 1,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  reportTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 6,
    color: colors.textSecondary,
  },
  periodText: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 3,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: colors.borderDark,
    paddingVertical: 3,
  },
  th: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 2.5,
    borderBottomWidth: 0.25,
    borderBottomColor: colors.border,
  },
  tableRowZebra: {
    backgroundColor: colors.zebra,
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    marginTop: 2,
    borderTopWidth: 0.75,
    borderTopColor: colors.borderDark,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.borderDark,
  },
  colCode: {
    width: 110,
    fontSize: 8.5,
    fontFamily: "Courier",
    color: colors.textSecondary,
  },
  colDesc: {
    flex: 1,
    fontSize: 8.5,
    color: colors.textSecondary,
    paddingRight: 6,
  },
  thQty: {
    width: 90,
    textAlign: "right",
  },
  colQty: {
    width: 90,
    textAlign: "right",
    fontSize: 8.5,
    fontFamily: "Courier",
    color: colors.textSecondary,
  },
  colQtyBold: {
    width: 90,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier-Bold",
    color: colors.textPrimary,
  },
  totalLabel: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 8.5,
    color: colors.textMuted,
  },
});

const formatQuantity = (value: number): string =>
  new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value);

const ProductionSummaryPDFDocument: React.FC<{
  data: ProductionSummaryData;
}> = ({ data }) => (
  <Document
    title={`${data.reportTitle} ${data.periodLabel}`}
    author={data.companyName}
  >
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Image src={TienHockLogo} style={styles.logo} />
        <View style={styles.headerTextContainer}>
          <Text style={styles.companyName}>{data.companyName}</Text>
          <Text style={styles.reportTitle}>{data.reportTitle}</Text>
          <Text style={styles.periodText}>{data.periodLabel}</Text>
        </View>
      </View>

      <View style={styles.tableHeader} fixed>
        <Text style={[styles.th, styles.colCode]}>Product</Text>
        <Text style={[styles.th, styles.colDesc]}>Description</Text>
        <Text style={[styles.th, styles.thQty]}>{data.unitLabel}</Text>
      </View>

      {data.rows.map((row: ProductionSummaryRow, index: number) => (
        <View
          key={row.productId}
          style={
            index % 2 === 1
              ? [styles.tableRow, styles.tableRowZebra]
              : styles.tableRow
          }
          wrap={false}
        >
          <Text style={styles.colCode}>{row.productId}</Text>
          <Text style={styles.colDesc}>{row.description}</Text>
          <Text style={styles.colQty}>{formatQuantity(row.quantity)}</Text>
        </View>
      ))}

      {data.rows.length === 0 && (
        <Text style={styles.emptyText}>
          No production recorded for this period.
        </Text>
      )}

      <View style={styles.totalRow} wrap={false}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.colQtyBold}>{formatQuantity(data.total)}</Text>
      </View>

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

export const generateProductionSummaryPDF = async (
  data: ProductionSummaryData
): Promise<void> => {
  const blob: Blob = await pdf(
    <ProductionSummaryPDFDocument data={data} />
  ).toBlob();
  printPdfBlob(
    blob,
    `${data.reportTitle} ${data.periodLabel} - ${data.companyName}`
  );
};
