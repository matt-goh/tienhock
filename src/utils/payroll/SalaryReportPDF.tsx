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

// Color palette for professional appearance
const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  borderDark: "#334155",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  success: "#166534",
  danger: "#b91c1c",
  primary: "#0369a1",
  header: {
    companyName: "#1e293b",
    companyDetails: "#334155",
  },
};

// Compact styles for salary report
const styles = StyleSheet.create({
  // Page and Document Structure
  page: {
    paddingTop: 15,
    paddingBottom: 15,
    paddingLeft: 30,
    paddingRight: 30,
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

  // Report Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  logo: {
    width: 45,
    height: 45,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.header.companyName,
  },
  reportTitle: {
    fontSize: 10,
    marginTop: 4,
    color: colors.header.companyDetails,
    lineHeight: 1.2,
  },

  // Summary Section
  summarySection: {
    marginBottom: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
  },
  summaryTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 20,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 8,
    color: colors.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },

  // Table Styles
  table: {
    width: "100%",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderDark,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
    color: colors.textSecondary,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    minHeight: 18,
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },

  // Table Column Widths - Compact layout
  colNo: {
    width: "4%",
    textAlign: "center",
  },
  colStaffId: {
    width: "35%",
    paddingRight: 4,
  },
  colGajiGenap: {
    width: "15%",
    textAlign: "right",
    paddingRight: 4,
  },
  colPinjam: {
    width: "14%",
    textAlign: "right",
    paddingRight: 4,
  },
  colTotal: {
    width: "17%",
    textAlign: "right",
    paddingRight: 4,
  },
  colPayment: {
    width: "10%",
    textAlign: "center",
  },

  // Text formatting
  bold: { fontFamily: "Helvetica-Bold" },
  textCenter: { textAlign: "center" },
  textRight: { textAlign: "right" },

  // Enhanced Footer Section
  footerSection: {
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 4,
  },
  footerTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  footerMainRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  footerColumn: {
    flex: 1,
    alignItems: "center",
  },
  footerMainLabel: {
    fontSize: 9,
    color: colors.textMuted,
    marginBottom: 3,
    textAlign: "center",
  },
  footerMainValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    textAlign: "center",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  grandTotalAmount: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
  },
});

// Helper Functions
const formatCurrency = (amount: number): string => {
  if (amount === 0) return "0.00";
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getMonthName = (month: number): string => {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months[month - 1] || "";
};

// Interfaces
export interface SalaryReportData {
  no: number;
  staff_id: string;
  staff_name: string;
  payment_preference: string;
  gaji_genap: number;
  total_pinjam: number;
  final_total: number;
  net_pay: number;
  mid_month_amount: number;
}

export interface SalaryReportPDFData {
  year: number;
  month: number;
  data: SalaryReportData[];
  total_records: number;
  summary: {
    total_gaji_genap: number;
    total_pinjam: number;
    total_final: number;
  };
}

// PDF Components
const SalaryRow: React.FC<{
  employee: SalaryReportData;
  isAlternate: boolean;
}> = ({ employee, isAlternate }) => (
  <View
    style={[styles.tableRow, isAlternate ? styles.tableRowAlt : {}]}
    wrap={false}
  >
    <Text style={styles.colNo}>{employee.no}</Text>
    <Text style={styles.colStaffId}>
      {employee.staff_id} - {employee.staff_name}
    </Text>
    <Text style={[styles.colGajiGenap, styles.bold]}>
      {formatCurrency(employee.gaji_genap)}
    </Text>
    <Text
      style={[
        styles.colPinjam,
        {
          color: employee.total_pinjam > 0 ? colors.danger : colors.textPrimary,
        },
      ]}
    >
      {formatCurrency(employee.total_pinjam)}
    </Text>
    <Text style={[styles.colTotal, styles.bold, { color: colors.primary }]}>
      {formatCurrency(employee.final_total)}
    </Text>
    <Text style={styles.colPayment}>{employee.payment_preference}</Text>
  </View>
);

const SalaryReportPDF: React.FC<{
  data: SalaryReportPDFData;
  companyName?: string;
}> = ({ data, companyName = TIENHOCK_INFO.name }) => {
  const reportTitle = `${getMonthName(data.month)} ${data.year} Salary Report`;

  return (
    <Document title={`Salary Report ${getMonthName(data.month)} ${data.year}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>{reportTitle}</Text>
          </View>
        </View>

        {/* Salary Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colNo}>NO.</Text>
            <Text style={styles.colStaffId}>STAFF/ID</Text>
            <Text style={styles.colGajiGenap}>GAJI/GENAP</Text>
            <Text style={styles.colPinjam}>TOTAL PINJAM</Text>
            <Text style={styles.colTotal}>TOTAL</Text>
            <Text style={styles.colPayment}>PAYMENT</Text>
          </View>

          {data.data.map((employee, index) => (
            <SalaryRow
              key={employee.staff_id}
              employee={employee}
              isAlternate={index % 2 === 1}
            />
          ))}
        </View>

        {/* Enhanced Footer Summary */}
        <View style={styles.footerSection}>
          <Text style={styles.footerTitle}>Salary Report Summary</Text>

          {/* Main Summary Row */}
          <View style={styles.footerMainRow}>
            <View style={styles.footerColumn}>
              <Text style={styles.footerMainLabel}>Total Employees</Text>
              <Text style={styles.footerMainValue}>{data.total_records}</Text>
            </View>
            <View style={styles.footerColumn}>
              <Text style={styles.footerMainLabel}>Total Gaji/Genap</Text>
              <Text style={styles.footerMainValue}>
                RM {formatCurrency(data.summary.total_gaji_genap)}
              </Text>
            </View>
            <View style={styles.footerColumn}>
              <Text style={styles.footerMainLabel}>Total Pinjam</Text>
              <Text style={[styles.footerMainValue, { color: colors.danger }]}>
                RM {formatCurrency(data.summary.total_pinjam)}
              </Text>
            </View>
          </View>

          {/* Grand Total Section */}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
            <Text style={styles.grandTotalAmount}>
              RM {formatCurrency(data.summary.total_final)}
            </Text>
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

// PDF Generation Function
export const generateSalaryReportPDF = async (
  data: SalaryReportPDFData,
  action: "download" | "print"
) => {
  try {
    const doc = <SalaryReportPDF data={data} />;
    const pdfBlob = await pdf(doc).toBlob();

    const fileName = `Salary_Report_${getMonthName(data.month)}_${
      data.year
    }.pdf`;

    if (action === "download") {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const url = URL.createObjectURL(pdfBlob);
      const printFrame = document.createElement("iframe");
      printFrame.style.display = "none";
      document.body.appendChild(printFrame);

      printFrame.onload = () => {
        if (printFrame.contentWindow) {
          try {
            printFrame.contentWindow.print();
          } catch (e) {
            console.error("Print failed:", e);
          }
          const cleanup = () => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
            URL.revokeObjectURL(url);
            window.removeEventListener("focus", cleanup);
          };
          window.addEventListener("focus", cleanup, { once: true });
        }
      };
      printFrame.src = url;
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

export default SalaryReportPDF;
