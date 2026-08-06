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
  majorTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginVertical: 8,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: colors.borderDark,
    backgroundColor: "#f8fafc",
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
  finalTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginTop: 10,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: "#eff6ff",
  },
  finalTotalLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    paddingLeft: 4,
  },
  finalTotalAmount: {
    width: 100,
    textAlign: "right",
    fontSize: 11,
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
// income-statement/:year/:month). Mirrors buildIncomeStatement in
// src/routes/greentarget/accounting/report-engine.js.
// ---------------------------------------------------------------------------

export interface GTStatementItem {
  note: string | null;
  note_marker: string | null;
  name: string;
  amount: number;
  accounts: string[];
}

export interface GTStatementBlock {
  block: string;
  headings: string[];
  subtotal_ref: string | null;
  items: GTStatementItem[];
  total: number;
}

export interface GTUnmappedAccount {
  code: string;
  description: string;
  fs_note: string | null;
  amount: number;
  reason: string;
}

export interface GTOverrideAuditEntry {
  account: string;
  appx_note: string;
  statement_note: string | null;
  statement_block: string;
  statement_line: string;
  amount: number;
}

export interface GTIncomeStatementSubtotals {
  direct_costs_total: number;
  gross_profit: number;
  other_income_total: number;
  after_other_income: number;
  administrative_expenses_total: number;
  operating_profit: number;
  finance_costs_total: number;
  profit_before_taxation: number;
  tax_total: number;
  profit_for_the_financial_year: number;
}

export interface GTIncomeStatementData {
  period: {
    year: number;
    month: number;
    start_date: string;
    end_date: string;
    basis: string;
  };
  blocks: GTStatementBlock[];
  subtotals: GTIncomeStatementSubtotals;
  unmapped_accounts: GTUnmappedAccount[];
  override_audit: GTOverrideAuditEntry[];
}

/**
 * Figures printed BETWEEN blocks, in printed order (transcribed from
 * GT_INCOME_STATEMENT.pdf). "rule" is the legacy bare rule-line amount;
 * "major"/"final" are the labelled bands.
 */
interface GTISAfterBlockFigure {
  label: string | null;
  ref: keyof GTIncomeStatementSubtotals;
  style: "rule" | "major" | "final";
}

const GT_IS_AFTER_BLOCK: Partial<Record<string, GTISAfterBlockFigure[]>> = {
  direct_costs: [
    { label: "GROSS (LOSS)/ PROFIT", ref: "gross_profit", style: "major" },
  ],
  other_operating_income: [
    { label: null, ref: "after_other_income", style: "rule" },
  ],
  administrative_expenses: [
    { label: "OPERATING PROFIT", ref: "operating_profit", style: "major" },
  ],
  finance_costs: [
    {
      label: "PROFIT BEFORE TAXATION",
      ref: "profit_before_taxation",
      style: "major",
    },
  ],
  tax: [
    {
      label: "PROFIT FOR THE FINANCIAL YEAR",
      ref: "profit_for_the_financial_year",
      style: "final",
    },
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

interface GTIncomeStatementPDFDocumentProps {
  data: GTIncomeStatementData;
}

const GTIncomeStatementPDFDocument: React.FC<
  GTIncomeStatementPDFDocumentProps
> = ({ data }) => {
  const renderAfterBlockFigure = (
    figure: GTISAfterBlockFigure,
    index: number
  ): React.ReactNode => {
    const amount = data.subtotals[figure.ref];
    if (figure.style === "rule") {
      return (
        <View key={figure.ref} style={styles.ruleTotal}>
          <Text style={styles.ruleTotalAmount}>{formatCurrency(amount)}</Text>
        </View>
      );
    }
    if (figure.style === "final") {
      return (
        <View key={figure.ref} style={styles.finalTotal}>
          <Text style={styles.finalTotalLabel}>{figure.label}</Text>
          <Text
            style={[
              styles.finalTotalAmount,
              { color: amount >= 0 ? colors.success : colors.danger },
            ]}
          >
            {formatCurrency(amount)}
          </Text>
        </View>
      );
    }
    return (
      <View key={`${figure.ref}-${index}`} style={styles.majorTotal}>
        <Text style={styles.majorTotalLabel}>{figure.label}</Text>
        <Text
          style={[
            styles.majorTotalAmount,
            { color: amount >= 0 ? colors.success : colors.danger },
          ]}
        >
          {formatCurrency(amount)}
        </Text>
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={GreenTargetLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{GREENTARGET_INFO.name}</Text>
            <Text style={styles.reportTitle}>INCOME STATEMENT</Text>
            <Text style={styles.periodText}>
              For the period {data.period.start_date} to {data.period.end_date}
              {data.period.basis === "year_to_date" ? " (Year to date)" : ""}
            </Text>
          </View>
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
            {(GT_IS_AFTER_BLOCK[block.block] ?? []).map((figure, index) =>
              renderAfterBlockFigure(figure, index)
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

export const generateGTIncomeStatementPDF = async (
  data: GTIncomeStatementData
): Promise<void> => {
  const blob = await pdf(
    <GTIncomeStatementPDFDocument data={data} />
  ).toBlob();

  printPdfBlob(blob, "income statement PDF");
};
