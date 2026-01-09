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
  subtotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  subtotalLabel: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
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

interface LineItem {
  note: string;
  name: string;
  amount: number;
}

interface IncomeStatementData {
  period: {
    year: number;
    month: number;
    start_date: string;
    end_date: string;
  };
  revenue: {
    items: LineItem[];
    total: number;
  };
  cost_of_goods_sold: {
    items: LineItem[];
    total: number;
  };
  gross_profit: number;
  expenses: {
    items: LineItem[];
    total: number;
  };
  net_profit: number;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
};

interface IncomeStatementPDFDocumentProps {
  data: IncomeStatementData;
}

const IncomeStatementPDFDocument: React.FC<IncomeStatementPDFDocumentProps> = ({
  data,
}) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{TIENHOCK_INFO.name}</Text>
            <Text style={styles.reportTitle}>INCOME STATEMENT</Text>
            <Text style={styles.periodText}>
              For the period {data.period.start_date} to {data.period.end_date}
            </Text>
          </View>
        </View>

        {/* Revenue Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revenue</Text>
          {data.revenue.items.map((item) => (
            <View key={item.note} style={styles.lineItem}>
              <Text style={styles.lineItemLabel}>
                {item.name} (Note {item.note})
              </Text>
              <Text style={styles.lineItemAmount}>
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}
          <View style={styles.subtotal}>
            <Text style={styles.subtotalLabel}>Total Revenue</Text>
            <Text style={styles.subtotalAmount}>
              {formatCurrency(data.revenue.total)}
            </Text>
          </View>
        </View>

        {/* COGS Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Less: Cost of Goods Sold</Text>
          {data.cost_of_goods_sold.items.map((item) => (
            <View key={item.note} style={styles.lineItem}>
              <Text style={styles.lineItemLabel}>
                {item.name} (Note {item.note})
              </Text>
              <Text style={styles.lineItemAmount}>
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}
          <View style={styles.subtotal}>
            <Text style={styles.subtotalLabel}>Total Cost of Goods Sold</Text>
            <Text style={styles.subtotalAmount}>
              ({formatCurrency(data.cost_of_goods_sold.total)})
            </Text>
          </View>
        </View>

        {/* Gross Profit */}
        <View style={styles.majorTotal}>
          <Text style={styles.majorTotalLabel}>GROSS PROFIT</Text>
          <Text
            style={[
              styles.majorTotalAmount,
              { color: data.gross_profit >= 0 ? colors.success : colors.danger },
            ]}
          >
            {data.gross_profit >= 0 ? "" : "("}
            {formatCurrency(data.gross_profit)}
            {data.gross_profit >= 0 ? "" : ")"}
          </Text>
        </View>

        {/* Expenses Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Less: Operating Expenses</Text>
          {data.expenses.items.map((item) => (
            <View key={item.note} style={styles.lineItem}>
              <Text style={styles.lineItemLabel}>
                {item.name} (Note {item.note})
              </Text>
              <Text style={styles.lineItemAmount}>
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}
          <View style={styles.subtotal}>
            <Text style={styles.subtotalLabel}>Total Operating Expenses</Text>
            <Text style={styles.subtotalAmount}>
              ({formatCurrency(data.expenses.total)})
            </Text>
          </View>
        </View>

        {/* Net Profit */}
        <View style={styles.finalTotal}>
          <Text style={styles.finalTotalLabel}>NET PROFIT / (LOSS)</Text>
          <Text
            style={[
              styles.finalTotalAmount,
              { color: data.net_profit >= 0 ? colors.success : colors.danger },
            ]}
          >
            {data.net_profit >= 0 ? "" : "("}RM {formatCurrency(data.net_profit)}
            {data.net_profit >= 0 ? "" : ")"}
          </Text>
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

export const generateIncomeStatementPDF = async (
  data: IncomeStatementData
): Promise<void> => {
  const blob = await pdf(
    <IncomeStatementPDFDocument data={data} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Income_Statement_${data.period.year}_${String(data.period.month).padStart(2, "0")}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
