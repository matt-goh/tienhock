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
  amber: "#92400e",
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
  finalTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginTop: 10,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: "#fef3c7",
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
    color: colors.amber,
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

interface CogmData {
  period: {
    year: number;
    month: number;
    start_date: string;
    end_date: string;
  };
  raw_materials: {
    items: LineItem[];
    total: number;
  };
  packing_materials: {
    items: LineItem[];
    total: number;
  };
  labor_costs: {
    items: LineItem[];
    total: number;
  };
  other_costs: {
    items: LineItem[];
    total: number;
  };
  total_cogm: number;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
};

interface CogmPDFDocumentProps {
  data: CogmData;
}

const CogmPDFDocument: React.FC<CogmPDFDocumentProps> = ({ data }) => {
  return (
    <Document>
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

        {/* Raw Materials Section */}
        {data.raw_materials.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Raw Materials</Text>
            {data.raw_materials.items.map((item) => (
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
              <Text style={styles.subtotalLabel}>Total Raw Materials</Text>
              <Text style={styles.subtotalAmount}>
                {formatCurrency(data.raw_materials.total)}
              </Text>
            </View>
          </View>
        )}

        {/* Packing Materials Section */}
        {data.packing_materials.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Packing Materials</Text>
            {data.packing_materials.items.map((item) => (
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
              <Text style={styles.subtotalLabel}>Total Packing Materials</Text>
              <Text style={styles.subtotalAmount}>
                {formatCurrency(data.packing_materials.total)}
              </Text>
            </View>
          </View>
        )}

        {/* Labor Costs Section */}
        {data.labor_costs.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Direct Labor</Text>
            {data.labor_costs.items.map((item) => (
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
              <Text style={styles.subtotalLabel}>Total Direct Labor</Text>
              <Text style={styles.subtotalAmount}>
                {formatCurrency(data.labor_costs.total)}
              </Text>
            </View>
          </View>
        )}

        {/* Other Costs Section */}
        {data.other_costs.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Other Manufacturing Costs</Text>
            {data.other_costs.items.map((item) => (
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
              <Text style={styles.subtotalLabel}>Total Other Costs</Text>
              <Text style={styles.subtotalAmount}>
                {formatCurrency(data.other_costs.total)}
              </Text>
            </View>
          </View>
        )}

        {/* Total COGM */}
        <View style={styles.finalTotal}>
          <Text style={styles.finalTotalLabel}>COST OF GOODS MANUFACTURED</Text>
          <Text style={styles.finalTotalAmount}>
            RM {formatCurrency(data.total_cogm)}
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

export const generateCogmPDF = async (data: CogmData): Promise<void> => {
  const blob = await pdf(<CogmPDFDocument data={data} />).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `COGM_${data.period.year}_${String(data.period.month).padStart(2, "0")}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
