// src/utils/stock/StockCardPDF.tsx
// PDF printout of the per-product Stock Card, replacing the legacy dot-matrix
// "STOCK CARD : <product> FOR THE MONTH OF MM/YYYY" report.
//
// Column mapping from the live Stock Movement data (confirmed with the user):
//   ADJ/IN   <- adj_in    (ADJ+ keyed on the Stock Adjustments page)
//   RETURN   <- returns   (returnproduct quantity on invoices)
//   DEFECT   <- adj_out   (ADJ- / defect keyed on the Stock Adjustments page)
// Content is 1:1 with the /api/stock/movements response, never hardcoded.
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
import { StockMovement } from "../../types/types";

export interface StockCardTotals {
  production: number;
  adj_in: number;
  returns: number;
  sold_out: number;
  adj_out: number;
  foc: number;
}

export interface StockCardData {
  productId: string;
  productDescription: string;
  // "For the month of 07/2026" or "For the period 01/07/2026 - 31/07/2026"
  periodLabel: string;
  // Month view prints the bare day number like the legacy card; the rolling
  // and custom views can span months, so they print DD/MM instead.
  showDayNumberOnly: boolean;
  movements: StockMovement[];
  totals: StockCardTotals;
  closingBalance: number;
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
    paddingVertical: 2,
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
  colDay: {
    width: 46,
    fontSize: 8.5,
    fontFamily: "Courier",
    color: colors.textSecondary,
  },
  col: {
    flex: 1,
    textAlign: "right",
    fontSize: 8.5,
    fontFamily: "Courier",
    color: colors.textSecondary,
  },
  colBold: {
    flex: 1,
    textAlign: "right",
    fontSize: 8.5,
    fontFamily: "Courier-Bold",
    color: colors.textPrimary,
  },
  thRight: {
    textAlign: "right",
  },
  footNote: {
    marginTop: 10,
    fontSize: 7.5,
    color: colors.textMuted,
  },
});

// Zero prints as "0" exactly like the legacy card, which never blanks a cell.
const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(value);

const formatDayLabel = (
  movement: StockMovement,
  showDayNumberOnly: boolean
): string => {
  if (showDayNumberOnly) return String(movement.day);
  // movement.date is already a plain local YYYY-MM-DD string from the API,
  // so it is split directly rather than parsed through a Date.
  const [, month, day] = movement.date.split("-");
  return `${day}/${month}`;
};

const StockCardTableHeader: React.FC = () => (
  <View style={styles.tableHeader} fixed>
    <Text style={[styles.th, styles.colDay]}>Day</Text>
    <Text style={[styles.th, styles.col, styles.thRight]}>B/F</Text>
    <Text style={[styles.th, styles.col, styles.thRight]}>Production</Text>
    <Text style={[styles.th, styles.col, styles.thRight]}>Adj/In</Text>
    <Text style={[styles.th, styles.col, styles.thRight]}>Return</Text>
    <Text style={[styles.th, styles.col, styles.thRight]}>Sold/Out</Text>
    <Text style={[styles.th, styles.col, styles.thRight]}>Defect</Text>
    <Text style={[styles.th, styles.col, styles.thRight]}>FOC</Text>
    <Text style={[styles.th, styles.col, styles.thRight]}>C/F</Text>
  </View>
);

const StockCardPDFDocument: React.FC<{ data: StockCardData }> = ({ data }) => (
  <Document
    title={`Stock Card ${data.productId}`}
    author={TIENHOCK_INFO.name}
  >
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Image src={TienHockLogo} style={styles.logo} />
        <View style={styles.headerTextContainer}>
          <Text style={styles.companyName}>{TIENHOCK_INFO.name}</Text>
          <Text style={styles.reportTitle}>
            Stock Card: {data.productId} ({data.productDescription})
          </Text>
          <Text style={styles.periodText}>{data.periodLabel}</Text>
        </View>
      </View>

      <StockCardTableHeader />

      {data.movements.map((movement: StockMovement, index: number) => (
        <View
          key={movement.date}
          style={
            index % 2 === 1
              ? [styles.tableRow, styles.tableRowZebra]
              : styles.tableRow
          }
          wrap={false}
        >
          <Text style={styles.colDay}>
            {formatDayLabel(movement, data.showDayNumberOnly)}
          </Text>
          <Text style={styles.col}>{formatNumber(movement.bf)}</Text>
          <Text style={styles.col}>{formatNumber(movement.production)}</Text>
          <Text style={styles.col}>{formatNumber(movement.adj_in)}</Text>
          <Text style={styles.col}>{formatNumber(movement.returns)}</Text>
          <Text style={styles.col}>{formatNumber(movement.sold_out)}</Text>
          <Text style={styles.col}>{formatNumber(movement.adj_out)}</Text>
          <Text style={styles.col}>{formatNumber(movement.foc)}</Text>
          <Text style={styles.colBold}>{formatNumber(movement.cf)}</Text>
        </View>
      ))}

      <View style={styles.totalRow} wrap={false}>
        <Text style={[styles.colDay, { fontFamily: "Helvetica-Bold" }]}>
          Total
        </Text>
        <Text style={styles.col}>-</Text>
        <Text style={styles.colBold}>{formatNumber(data.totals.production)}</Text>
        <Text style={styles.colBold}>{formatNumber(data.totals.adj_in)}</Text>
        <Text style={styles.colBold}>{formatNumber(data.totals.returns)}</Text>
        <Text style={styles.colBold}>{formatNumber(data.totals.sold_out)}</Text>
        <Text style={styles.colBold}>{formatNumber(data.totals.adj_out)}</Text>
        <Text style={styles.colBold}>{formatNumber(data.totals.foc)}</Text>
        <Text style={styles.colBold}>{formatNumber(data.closingBalance)}</Text>
      </View>

      <Text style={styles.footNote}>
        ADJ/IN and DEFECT are the ADJ+ and ADJ- quantities keyed on the Stock
        Adjustments page. RETURN is the returned quantity on invoices.
      </Text>

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

export const generateStockCardPDF = async (
  data: StockCardData
): Promise<void> => {
  const blob: Blob = await pdf(<StockCardPDFDocument data={data} />).toBlob();
  printPdfBlob(
    blob,
    `Stock Card ${data.productId} (${data.productDescription}) - ${data.periodLabel}`
  );
};
