// src/utils/greenTarget/PDF/GTSalesSummaryPDF.tsx
// Prints the GT Sales Summary page's active tab (Debtor Listing / Sales
// Details) exactly as a running-numbered list for cross-checking. PDF
// generators stay English-only by project convention.
import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { printPdfBlob } from "../../pdfPrintFallback";

export interface GTSalesSummaryPdfColumn {
  key: string;
  label: string;
  width: string;
  align?: "left" | "right";
}

export interface GTSalesSummaryPdfRow {
  cells: string[];
  cancelled?: boolean;
}

export interface GTSalesSummaryPdfInput {
  companyName: string;
  title: string;
  subtitle: string;
  columns: GTSalesSummaryPdfColumn[];
  rows: GTSalesSummaryPdfRow[];
  totalsRow?: string[];
  documentTitle: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 24,
    fontFamily: "Helvetica",
    fontSize: 7.5,
    color: "#000000",
  },
  header: {
    marginBottom: 8,
  },
  company: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  title: {
    marginTop: 2,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    textTransform: "uppercase",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 8,
    textAlign: "center",
    color: "#333333",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableHeaderText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#999999",
    paddingVertical: 2.5,
  },
  cellText: {
    fontSize: 7.5,
  },
  cancelledRow: {
    color: "#666666",
    textDecoration: "line-through",
  },
  totalsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#000000",
    paddingVertical: 3,
    marginTop: 1,
  },
  totalsText: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 12,
    left: 24,
    right: 24,
    textAlign: "center",
    fontSize: 7,
    color: "#666666",
  },
});

const GTSalesSummaryPDFDocument: React.FC<GTSalesSummaryPdfInput> = ({
  companyName,
  title,
  subtitle,
  columns,
  rows,
  totalsRow,
}) => (
  <Page size="A4" orientation="landscape" style={styles.page}>
    <View style={styles.header} fixed>
      <Text style={styles.company}>{companyName}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
    <View style={styles.tableHeader} fixed>
      {columns.map((column: GTSalesSummaryPdfColumn) => (
        <Text
          key={column.key}
          style={[
            styles.tableHeaderText,
            {
              width: column.width,
              textAlign: column.align === "right" ? "right" : "left",
              paddingRight: 4,
            },
          ]}
        >
          {column.label}
        </Text>
      ))}
    </View>
    {rows.map((row: GTSalesSummaryPdfRow, rowIndex: number) => (
      <View
        key={rowIndex}
        style={styles.row}
        wrap={false}
      >
        {row.cells.map((cell: string, cellIndex: number) => {
          const column: GTSalesSummaryPdfColumn = columns[cellIndex];
          return (
            <Text
              key={column.key}
              style={[
                styles.cellText,
                row.cancelled ? styles.cancelledRow : {},
                {
                  width: column.width,
                  textAlign: column.align === "right" ? "right" : "left",
                  paddingRight: 4,
                },
              ]}
            >
              {cell}
            </Text>
          );
        })}
      </View>
    ))}
    {totalsRow && (
      <View style={styles.totalsRow} wrap={false}>
        {totalsRow.map((cell: string, cellIndex: number) => {
          const column: GTSalesSummaryPdfColumn = columns[cellIndex];
          return (
            <Text
              key={column.key}
              style={[
                styles.totalsText,
                {
                  width: column.width,
                  textAlign: column.align === "right" ? "right" : "left",
                  paddingRight: 4,
                },
              ]}
            >
              {cell}
            </Text>
          );
        })}
      </View>
    )}
    <Text
      style={styles.footer}
      render={({ pageNumber, totalPages }): string =>
        `Page ${pageNumber} of ${totalPages}`
      }
      fixed
    />
  </Page>
);

export const printGTSalesSummaryPDF = async (
  input: GTSalesSummaryPdfInput
): Promise<void> => {
  const document = (
    <Document title={input.documentTitle}>
      <GTSalesSummaryPDFDocument {...input} />
    </Document>
  );
  const blob: Blob = await pdf(document).toBlob();
  printPdfBlob(blob, input.documentTitle);
};
