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
import GreenTargetLogo from "../GreenTargetLogo.png";
import { GREENTARGET_INFO } from "../invoice/einvoice/companyInfo";
import { printPdfBlob } from "../pdfPrintFallback";
import {
  GTStatementBlock,
  GTStatementItem,
  GTUnmappedAccount,
  GTOverrideAuditEntry,
} from "./GTIncomeStatementPDF";
import {
  getPaperSizePreference,
  getReactPdfPageSize,
  type PdfPaperSize,
} from "../pdf/paperSize";

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
  balanceStatus: {
    marginTop: 8,
    marginBottom: 10,
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
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  lineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    paddingLeft: 15,
  },
  lineItemLabel: {
    flex: 1,
    fontSize: 9,
    color: colors.textSecondary,
  },
  lineItemAmount: {
    width: 100,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier",
  },
  ruleTotal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 3,
    marginTop: 3,
    marginLeft: 15,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  ruleTotalAmount: {
    width: 100,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier-Bold",
  },
  subtotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    marginTop: 3,
    paddingLeft: 15,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  subtotalLabel: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textSecondary,
  },
  subtotalAmount: {
    width: 100,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier-Bold",
  },
  majorTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    marginTop: 6,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: colors.borderDark,
  },
  majorTotalLabel: {
    flex: 1,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    paddingLeft: 4,
  },
  majorTotalAmount: {
    width: 100,
    textAlign: "right",
    fontSize: 10,
    fontFamily: "Courier-Bold",
    paddingRight: 4,
  },
  generatedAt: {
    marginTop: 15,
    fontSize: 7,
    color: colors.textMuted,
    textAlign: "right",
  },
});

// ---------------------------------------------------------------------------
// Green Target block-keyed payload (GET /greentarget/api/financial-reports/
// balance-sheet/:year/:month). Mirrors buildBalanceSheet in
// src/routes/greentarget/accounting/report-engine.js.
// ---------------------------------------------------------------------------

export interface GTBalanceSheetSubtotals {
  non_current_assets_total: number;
  current_assets_total: number;
  current_liabilities_total: number;
  net_current_assets: number;
  net_assets: number;
  shareholders_funds_total: number;
  long_term_liabilities_total: number;
  financed_by: number;
}

export interface GTBalanceSheetData {
  period: {
    year: number;
    month: number;
    start_date: string;
    as_of_date: string;
  };
  blocks: GTStatementBlock[];
  subtotals: GTBalanceSheetSubtotals;
  profit_for_the_financial_year: number;
  unmapped_accounts: GTUnmappedAccount[];
  override_audit: GTOverrideAuditEntry[];
  is_balanced: boolean;
}

/**
 * Figures printed BETWEEN blocks, in printed order (transcribed from
 * GT_BALANCE_SHEET.pdf). NET ASSETS follows the current-liabilities block;
 * the financed-by total closes the statement.
 */
interface GTBSAfterBlockFigure {
  label: string;
  ref: keyof GTBalanceSheetSubtotals;
  style: "subtotal" | "major";
}

const GT_BS_AFTER_BLOCK: Partial<Record<string, GTBSAfterBlockFigure[]>> = {
  current_liabilities: [
    {
      label: "NET CURRENT ASSETS/(LIABILITIES)",
      ref: "net_current_assets",
      style: "subtotal",
    },
    { label: "NET ASSETS", ref: "net_assets", style: "major" },
  ],
  long_term_liabilities: [
    { label: "TOTAL FINANCED BY", ref: "financed_by", style: "major" },
  ],
};

const formatCurrency = (amount: number): string => {
  const formatted = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
};

const formatLineItemLabel = (item: GTStatementItem): string => {
  if (item.note) return `${item.name} (Note ${item.note})`;
  if (item.note_marker) return `${item.name} (${item.note_marker})`;
  return item.name;
};

interface GTBalanceSheetPDFDocumentProps {
  data: GTBalanceSheetData;
  paperSize?: PdfPaperSize;
}

const GTBalanceSheetPDFDocument: React.FC<GTBalanceSheetPDFDocumentProps> = ({
  data,
  paperSize,
}) => {
  const effectivePaperSize = paperSize ?? getPaperSizePreference();
  const renderAfterBlockFigure = (
    figure: GTBSAfterBlockFigure
  ): React.ReactNode => {
    const amount = data.subtotals[figure.ref];
    if (figure.style === "subtotal") {
      return (
        <View key={figure.ref} style={styles.subtotal}>
          <Text style={styles.subtotalLabel}>{figure.label}</Text>
          <Text style={styles.subtotalAmount}>{formatCurrency(amount)}</Text>
        </View>
      );
    }
    return (
      <View key={figure.ref} style={styles.majorTotal}>
        <Text style={styles.majorTotalLabel}>{figure.label}</Text>
        <Text style={styles.majorTotalAmount}>{formatCurrency(amount)}</Text>
      </View>
    );
  };

  return (
    <Document>
      <Page size={getReactPdfPageSize(effectivePaperSize)} style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={GreenTargetLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{GREENTARGET_INFO.name}</Text>
            <Text style={styles.reportTitle}>BALANCE SHEET</Text>
            <Text style={styles.periodText}>
              As at {data.period.as_of_date}
            </Text>
          </View>
        </View>

        {/* Balance Status */}
        <View
          style={[
            styles.balanceStatus,
            data.is_balanced
              ? styles.balanceStatusBalanced
              : styles.balanceStatusUnbalanced,
          ]}
        >
          <Text
            style={[
              styles.balanceStatusText,
              { color: data.is_balanced ? colors.success : colors.danger },
            ]}
          >
            {data.is_balanced
              ? "BALANCE SHEET IS BALANCED (NET ASSETS = FINANCED BY)"
              : `BALANCE SHEET IS NOT BALANCED (Difference: RM ${formatCurrency(
                  Math.abs(
                    data.subtotals.net_assets - data.subtotals.financed_by
                  )
                )})`}
          </Text>
        </View>

        {/* Blocks in printed order */}
        {data.blocks.map((block) => (
          <React.Fragment key={block.block}>
            <View style={styles.section}>
              {block.headings.map((heading) => (
                <Text key={heading} style={styles.sectionTitle}>
                  {heading}
                </Text>
              ))}
              {block.items.map((item) => (
                <View
                  key={`${item.note ?? item.note_marker ?? "no-note"}-${item.name}`}
                  style={styles.lineItem}
                >
                  <Text style={styles.lineItemLabel}>
                    {formatLineItemLabel(item)}
                  </Text>
                  <Text style={styles.lineItemAmount}>
                    {formatCurrency(item.amount)}
                  </Text>
                </View>
              ))}
              {block.subtotal_ref && (
                <View style={styles.ruleTotal}>
                  <Text style={styles.ruleTotalAmount}>
                    {formatCurrency(block.total)}
                  </Text>
                </View>
              )}
            </View>
            {(GT_BS_AFTER_BLOCK[block.block] ?? []).map((figure) =>
              renderAfterBlockFigure(figure)
            )}
          </React.Fragment>
        ))}

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

export const generateGTBalanceSheetPDF = async (
  data: GTBalanceSheetData,
  paperSize?: PdfPaperSize
): Promise<void> => {
  const blob = await pdf(
    <GTBalanceSheetPDFDocument data={data} paperSize={paperSize} />
  ).toBlob();

  printPdfBlob(blob, "balance sheet PDF");
};
