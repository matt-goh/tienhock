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
  majorSection: {
    marginBottom: 12,
  },
  majorSectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.borderDark,
    textTransform: "uppercase",
  },
  subSection: {
    marginBottom: 8,
  },
  subSectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textSecondary,
    marginBottom: 4,
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
    borderTopColor: colors.borderDark,
  },
  majorTotalLabel: {
    flex: 1,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  majorTotalAmount: {
    width: 100,
    textAlign: "right",
    fontSize: 10,
    fontFamily: "Courier-Bold",
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

interface BalanceSheetData {
  period: {
    year: number;
    month: number;
    as_of_date: string;
  };
  assets: {
    current: {
      items: LineItem[];
      total: number;
    };
    non_current: {
      items: LineItem[];
      total: number;
    };
    total: number;
  };
  liabilities: {
    current: {
      items: LineItem[];
      total: number;
    };
    non_current: {
      items: LineItem[];
      total: number;
    };
    total: number;
  };
  equity: {
    items: LineItem[];
    total: number;
  };
  totals: {
    total_assets: number;
    total_liabilities_equity: number;
    is_balanced: boolean;
  };
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
};

interface BalanceSheetPDFDocumentProps {
  data: BalanceSheetData;
}

const BalanceSheetPDFDocument: React.FC<BalanceSheetPDFDocumentProps> = ({
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
            <Text style={styles.reportTitle}>STATEMENT OF FINANCIAL POSITION</Text>
            <Text style={styles.periodText}>As at {data.period.as_of_date}</Text>
          </View>
        </View>

        {/* Balance Status */}
        <View
          style={[
            styles.balanceStatus,
            data.totals.is_balanced
              ? styles.balanceStatusBalanced
              : styles.balanceStatusUnbalanced,
          ]}
        >
          <Text
            style={[
              styles.balanceStatusText,
              { color: data.totals.is_balanced ? colors.success : colors.danger },
            ]}
          >
            {data.totals.is_balanced
              ? "BALANCE SHEET IS BALANCED"
              : `BALANCE SHEET IS NOT BALANCED (Difference: RM ${formatCurrency(
                  Math.abs(data.totals.total_assets - data.totals.total_liabilities_equity)
                )})`}
          </Text>
        </View>

        {/* ASSETS */}
        <View style={styles.majorSection}>
          <Text style={styles.majorSectionTitle}>ASSETS</Text>

          {/* Non-Current Assets */}
          {data.assets.non_current.items.length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Non-Current Assets</Text>
              {data.assets.non_current.items.map((item) => (
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
                <Text style={styles.subtotalLabel}>Total Non-Current Assets</Text>
                <Text style={styles.subtotalAmount}>
                  {formatCurrency(data.assets.non_current.total)}
                </Text>
              </View>
            </View>
          )}

          {/* Current Assets */}
          {data.assets.current.items.length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Current Assets</Text>
              {data.assets.current.items.map((item) => (
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
                <Text style={styles.subtotalLabel}>Total Current Assets</Text>
                <Text style={styles.subtotalAmount}>
                  {formatCurrency(data.assets.current.total)}
                </Text>
              </View>
            </View>
          )}

          {/* Total Assets */}
          <View style={styles.majorTotal}>
            <Text style={styles.majorTotalLabel}>TOTAL ASSETS</Text>
            <Text style={styles.majorTotalAmount}>
              RM {formatCurrency(data.assets.total)}
            </Text>
          </View>
        </View>

        {/* LIABILITIES & EQUITY */}
        <View style={styles.majorSection}>
          <Text style={styles.majorSectionTitle}>LIABILITIES & EQUITY</Text>

          {/* Non-Current Liabilities */}
          {data.liabilities.non_current.items.length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Non-Current Liabilities</Text>
              {data.liabilities.non_current.items.map((item) => (
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
                <Text style={styles.subtotalLabel}>Total Non-Current Liabilities</Text>
                <Text style={styles.subtotalAmount}>
                  {formatCurrency(data.liabilities.non_current.total)}
                </Text>
              </View>
            </View>
          )}

          {/* Current Liabilities */}
          {data.liabilities.current.items.length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Current Liabilities</Text>
              {data.liabilities.current.items.map((item) => (
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
                <Text style={styles.subtotalLabel}>Total Current Liabilities</Text>
                <Text style={styles.subtotalAmount}>
                  {formatCurrency(data.liabilities.current.total)}
                </Text>
              </View>
            </View>
          )}

          {/* Equity */}
          {data.equity.items.length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Equity</Text>
              {data.equity.items.map((item) => (
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
                <Text style={styles.subtotalLabel}>Total Equity</Text>
                <Text style={styles.subtotalAmount}>
                  {formatCurrency(data.equity.total)}
                </Text>
              </View>
            </View>
          )}

          {/* Total Liabilities & Equity */}
          <View style={styles.majorTotal}>
            <Text style={styles.majorTotalLabel}>TOTAL LIABILITIES & EQUITY</Text>
            <Text style={styles.majorTotalAmount}>
              RM {formatCurrency(data.totals.total_liabilities_equity)}
            </Text>
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

export const generateBalanceSheetPDF = async (
  data: BalanceSheetData
): Promise<void> => {
  const blob = await pdf(
    <BalanceSheetPDFDocument data={data} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Balance_Sheet_${data.period.year}_${String(data.period.month).padStart(2, "0")}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
