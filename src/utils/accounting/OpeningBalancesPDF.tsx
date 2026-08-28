// src/utils/accounting/OpeningBalancesPDF.tsx
// Prints the opening-balance anchors as the auditor's schedule: a Client /
// Year ended / Subject header block, a two-column "As per ledger" money area
// (Debit RM, Credit RM), account rows grouped under their financial-statement
// note heading, and a double-ruled grand total that must tie Dr to Cr.
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";
import { printPdfBlob } from "../pdfPrintFallback";

export interface OpeningBalancesPDFRow {
  code: string;
  description: string;
  // Signed anchor amount: DR-positive, CR-negative.
  amount: number;
}

export interface OpeningBalancesPDFSection {
  note: string | null;
  name: string;
  rows: OpeningBalancesPDFRow[];
}

export interface OpeningBalancesPDFData {
  asOfDate: string;
  sections: OpeningBalancesPDFSection[];
  companyName?: string;
}

const colors = {
  text: "#000000",
  muted: "#444444",
  rule: "#000000",
};

// Width of each money column. Two of them sit under the "As per ledger" banner.
// 68pt with the page's 66pt right margin puts the Debit and Credit columns
// where the auditor's schedule prints them on A4.
const MONEY_COLUMN_WIDTH: number = 68;

const styles = StyleSheet.create({
  // Margins match the auditor's schedule: a wide right margin so the Credit
  // column stops about an inch short of the page edge.
  page: {
    paddingTop: 40,
    paddingBottom: 36,
    paddingLeft: 50,
    paddingRight: 66,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: colors.text,
  },
  headerLine: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 3,
  },
  headerLabel: {
    width: 90,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  // Indented block with a common underline width, as the auditor types it.
  headerValue: {
    width: 205,
    marginLeft: 55,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.rule,
    paddingBottom: 1.5,
  },
  columnHeader: {
    flexDirection: "row",
    marginTop: 12,
  },
  ledgerBanner: {
    width: MONEY_COLUMN_WIDTH * 2,
    borderWidth: 0.75,
    borderColor: colors.rule,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingVertical: 1.5,
  },
  cellCode: {
    width: 64,
    paddingRight: 4,
    fontSize: 7.5,
  },
  cellDescription: {
    flex: 1,
    paddingRight: 8,
  },
  cellMoney: {
    width: MONEY_COLUMN_WIDTH,
    textAlign: "right",
    paddingRight: 4,
  },
  // Column captions sit centred over their column, unlike the right-aligned
  // figures below them.
  moneyCaption: {
    width: MONEY_COLUMN_WIDTH,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    lineHeight: 0.5,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 2,
  },
  // No flex: the underline should hug the words, not span the column.
  sectionHeading: {
    fontFamily: "Helvetica-Bold",
    textDecoration: "underline",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 0.5,
  },
  // The grand total is ruled above and double-ruled below, and — as on the
  // auditor's schedule — those rules span only the two money columns.
  totalRow: {
    flexDirection: "row",
    marginTop: 14,
  },
  totalMoney: {
    width: MONEY_COLUMN_WIDTH,
    textAlign: "right",
    paddingRight: 4,
    paddingTop: 2,
    paddingBottom: 1,
    fontFamily: "Helvetica-Bold",
    borderTopWidth: 0.75,
    borderTopColor: colors.rule,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.rule,
  },
  totalRowUnderline: {
    flexDirection: "row",
    marginTop: 1.5,
  },
  doubleRule: {
    width: MONEY_COLUMN_WIDTH,
    borderTopWidth: 0.75,
    borderTopColor: colors.rule,
  },
  pageNumber: {
    position: "absolute",
    fontSize: 7.5,
    bottom: 18,
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.muted,
  },
});

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

// 'yyyy-MM-dd' -> '1 Jan 2026' without a Date round-trip (avoids TZ shift)
const MONTHS: string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatLongDate = (iso: string): string => {
  const parts: string[] = iso.split("-");
  if (parts.length !== 3) return iso;
  const day: number = Number(parts[2]);
  const monthIndex: number = Number(parts[1]) - 1;
  return `${day} ${MONTHS[monthIndex] || parts[1]} ${parts[0]}`;
};

const OpeningBalancesPDFDocument: React.FC<{
  data: OpeningBalancesPDFData;
}> = ({ data }) => {
  const year: string = data.asOfDate.split("-")[0] || "";

  const totals = data.sections.reduce(
    (acc, section) => {
      section.rows.forEach((row) => {
        if (row.amount >= 0) acc.debit += row.amount;
        else acc.credit += Math.abs(row.amount);
      });
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  return (
    <Document
      title={`Opening Balances as at ${data.asOfDate} - ${
        data.companyName ?? TIENHOCK_INFO.name
      }`}
    >
      <Page size="A4" style={styles.page}>
        {/* Auditor header block */}
        <View>
          <View style={styles.headerLine}>
            <Text style={styles.headerLabel}>Client :</Text>
            <Text style={styles.headerValue}>
              {data.companyName ?? TIENHOCK_INFO.name}
            </Text>
          </View>
          <View style={styles.headerLine}>
            <Text style={styles.headerLabel}>Year ended :</Text>
            <Text style={styles.headerValue}>31 December {year}</Text>
          </View>
          <View style={styles.headerLine}>
            <Text style={styles.headerLabel}>Subject :</Text>
            <Text style={styles.headerValue}>
              Opening balances (as at {formatLongDate(data.asOfDate)})
            </Text>
          </View>
        </View>

        {/* Column headers: "As per ledger" spans the two money columns */}
        <View style={styles.columnHeader} fixed>
          <Text style={styles.cellCode} />
          <Text
            style={[styles.cellDescription, { fontFamily: "Helvetica-Bold" }]}
          >
            Particulars
          </Text>
          <Text style={styles.ledgerBanner}>As per ledger</Text>
        </View>
        <View
          style={[styles.columnHeader, { marginTop: 3}]}
          fixed
        >
          <Text style={styles.cellCode} />
          <Text style={styles.cellDescription} />
          <Text style={styles.moneyCaption}>Debit{"\n"}RM</Text>
          <Text style={styles.moneyCaption}>Credit{"\n"}RM</Text>
        </View>

        {/* Sections */}
        {data.sections.map((section) => (
          <View key={section.note || section.name} wrap>
            {/* Headings are indented to the Particulars column, not the code column */}
            <View style={styles.sectionHeadingRow} wrap={false}>
              <Text style={styles.cellCode} />
              <Text style={styles.sectionHeading}>{section.name}</Text>
            </View>
            {section.rows.map((row) => (
              <View key={row.code} style={styles.row} wrap={false}>
                <Text style={styles.cellCode}>{row.code}</Text>
                <Text style={styles.cellDescription}>{row.description}</Text>
                <Text style={styles.cellMoney}>
                  {row.amount >= 0 ? formatCurrency(row.amount) : ""}
                </Text>
                <Text style={styles.cellMoney}>
                  {row.amount < 0 ? formatCurrency(Math.abs(row.amount)) : ""}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {/* Grand total, double-ruled like the auditor's schedule. The rule sits
            in the same unbreakable block as the figures, otherwise it can spill
            onto a page of its own. */}
        <View wrap={false}>
          <View style={styles.totalRow}>
            <Text style={styles.cellCode} />
            <Text style={styles.cellDescription} />
            <Text style={styles.totalMoney}>{formatCurrency(totals.debit)}</Text>
            <Text style={styles.totalMoney}>
              {formatCurrency(totals.credit)}
            </Text>
          </View>
          <View style={styles.totalRowUnderline}>
            <View style={styles.cellCode} />
            <View style={styles.cellDescription} />
            <View style={styles.doubleRule} />
            <View style={styles.doubleRule} />
          </View>
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
};

export const generateOpeningBalancesPDF = async (
  data: OpeningBalancesPDFData
): Promise<void> => {
  const blob: Blob = await pdf(
    <OpeningBalancesPDFDocument data={data} />
  ).toBlob();

  printPdfBlob(
    blob,
    `Opening Balances as at ${data.asOfDate} - ${
      data.companyName ?? TIENHOCK_INFO.name
    }`
  );
};
