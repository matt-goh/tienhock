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
import { printPdfFrameWithFallback } from "../pdfPrintFallback";

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

const styles = StyleSheet.create({
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

  table: {
    width: "100%",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
    color: colors.textSecondary,
  },
  tableHeaderTopRule: {
    height: 1,
    backgroundColor: colors.borderDark,
    marginBottom: 2,
  },
  tableHeaderBottomRule: {
    height: 1,
    backgroundColor: colors.borderDark,
    marginTop: 2,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    minHeight: 18,
  },

  colNo: {
    width: "6%",
    textAlign: "center",
  },
  colStaffName: {
    width: "30%",
    paddingRight: 4,
  },
  colIcNo: {
    width: "19%",
    textAlign: "center",
    paddingRight: 4,
  },
  colMidMonth: {
    width: "15%",
    textAlign: "right",
    paddingRight: 4,
  },
  colPinjam: {
    width: "15%",
    textAlign: "right",
    paddingRight: 4,
  },
  colNet: {
    width: "15%",
    textAlign: "right",
    paddingRight: 4,
  },

  bold: { fontFamily: "Helvetica-Bold" },
  textCenter: { textAlign: "center" },
  textRight: { textAlign: "right" },

  footerSection: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 6,
  },
  footerTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 12,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  footerMainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  footerColumn: {
    flex: 1,
    alignItems: "center",
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  footerMainLabel: {
    fontSize: 8,
    color: colors.textMuted,
    marginBottom: 4,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  footerMainValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 2,
  },
  footerMainAmount: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    textAlign: "center",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderDark,
  },
  grandTotalLabel: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  grandTotalAmount: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
  },

  groupSection: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 6,
  },
  groupHeader: {
    backgroundColor: colors.borderLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  groupTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  groupSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  groupSummaryText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textSecondary,
  },
});

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

const groupByPaymentPreference = (data: MidMonthPayrollReportData[]) => {
  return {
    Bank: data.filter((item) => item.payment_preference === "Bank"),
    Cash: data.filter((item) => item.payment_preference === "Cash"),
    Cheque: data.filter((item) => item.payment_preference === "Cheque"),
  };
};

const calculateGroupTotal = (group: MidMonthPayrollReportData[]) => {
  return group.reduce((sum, item) => sum + item.total, 0);
};

export interface MidMonthPayrollReportData {
  no: number;
  staff_name: string;
  icNo: string;
  midMonthAmount: number;
  pinjamAmount: number;
  netAmount: number;
  total: number;
  payment_preference: string;
}

export interface MidMonthPayrollReportPDFData {
  year: number;
  month: number;
  data: MidMonthPayrollReportData[];
  total_records: number;
  summary: {
    total_final: number;
  };
}

const MidMonthRow: React.FC<{
  employee: MidMonthPayrollReportData;
}> = ({ employee }) => (
  <View style={styles.tableRow} wrap={false}>
    <Text style={styles.colNo}>{employee.no}</Text>
    <Text style={styles.colStaffName}>{employee.staff_name}</Text>
    <Text style={styles.colIcNo}>{employee.icNo}</Text>
    <Text style={styles.colMidMonth}>
      {formatCurrency(employee.midMonthAmount)}
    </Text>
    <Text
      style={[
        styles.colPinjam,
        employee.pinjamAmount > 0 ? { color: colors.danger } : {},
      ]}
    >
      {formatCurrency(employee.pinjamAmount)}
    </Text>
    <Text style={[styles.colNet, styles.bold, { color: colors.primary }]}>
      {formatCurrency(employee.netAmount)}
    </Text>
  </View>
);

const PaymentGroup: React.FC<{
  title: string;
  data: MidMonthPayrollReportData[];
  total: number;
}> = ({ title, data, total }) => {
  if (data.length === 0) return null;

  return (
    <View style={styles.groupSection}>
      <View wrap={false} minPresenceAhead={40}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle}>{title} Payment</Text>
        </View>

        <View style={styles.groupSummary}>
          <Text style={styles.groupSummaryText}>
            {data.length} employee{data.length !== 1 ? "s" : ""}
          </Text>
          <Text style={styles.groupSummaryText}>
            Total: RM {formatCurrency(total)}
          </Text>
        </View>

        <View style={styles.tableHeaderTopRule} />
        <View style={styles.tableHeader}>
          <Text style={styles.colNo}>NO.</Text>
          <Text style={styles.colStaffName}>STAFF NAME</Text>
          <Text style={styles.colIcNo}>IC NO.</Text>
          <Text style={styles.colMidMonth}>GROSS</Text>
          <Text style={styles.colPinjam}>PINJAM</Text>
          <Text style={styles.colNet}>NET</Text>
        </View>
        <View style={styles.tableHeaderBottomRule} />
      </View>

      <View style={styles.table}>
        {data.map((employee, index) => (
          <MidMonthRow
            key={index}
            employee={{ ...employee, no: index + 1 }}
          />
        ))}
      </View>
    </View>
  );
};

const MidMonthPayrollReportPDF: React.FC<{
  data: MidMonthPayrollReportPDFData;
  companyName?: string;
}> = ({ data, companyName = TIENHOCK_INFO.name }) => {
  const reportTitle = `${getMonthName(data.month)} ${data.year} Mid-Month Payroll Report`;

  const groupedData = groupByPaymentPreference(data.data);
  const bankTotal = calculateGroupTotal(groupedData.Bank);
  const cashTotal = calculateGroupTotal(groupedData.Cash);
  const chequeTotal = calculateGroupTotal(groupedData.Cheque);

  return (
    <Document
      title={`Mid-Month Payroll Report ${getMonthName(data.month)} ${data.year}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>{reportTitle}</Text>
          </View>
        </View>

        <PaymentGroup title="Bank" data={groupedData.Bank} total={bankTotal} />
        <PaymentGroup title="Cash" data={groupedData.Cash} total={cashTotal} />
        <PaymentGroup
          title="Cheque"
          data={groupedData.Cheque}
          total={chequeTotal}
        />

        <View
          style={{
            height: 1,
            backgroundColor: colors.borderDark,
            marginVertical: 15,
          }}
        />

        <View style={styles.footerSection} wrap={false}>
          <Text style={styles.footerTitle}>
            Mid-Month Payroll Report Summary
          </Text>

          <View style={styles.footerMainRow}>
            <View style={styles.footerColumn}>
              <Text style={styles.footerMainLabel}>Bank</Text>
              <Text style={styles.footerMainValue}>
                {groupedData.Bank.length} employee
                {groupedData.Bank.length !== 1 ? "s" : ""}
              </Text>
              <Text style={styles.footerMainAmount}>
                RM {formatCurrency(bankTotal)}
              </Text>
            </View>
            <View style={styles.footerColumn}>
              <Text style={styles.footerMainLabel}>Cash</Text>
              <Text style={styles.footerMainValue}>
                {groupedData.Cash.length} employee
                {groupedData.Cash.length !== 1 ? "s" : ""}
              </Text>
              <Text style={styles.footerMainAmount}>
                RM {formatCurrency(cashTotal)}
              </Text>
            </View>
            <View style={styles.footerColumn}>
              <Text style={styles.footerMainLabel}>Cheque</Text>
              <Text style={styles.footerMainValue}>
                {groupedData.Cheque.length} employee
                {groupedData.Cheque.length !== 1 ? "s" : ""}
              </Text>
              <Text style={styles.footerMainAmount}>
                RM {formatCurrency(chequeTotal)}
              </Text>
            </View>
          </View>

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>GRAND TOTAL (NET)</Text>
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

export const generateMidMonthPayrollReportPDF = async (
  data: MidMonthPayrollReportPDFData,
  action: "download" | "print"
) => {
  try {
    const doc = <MidMonthPayrollReportPDF data={data} />;
    const pdfBlob = await pdf(doc).toBlob();

    const fileName = `Mid_Month_Payroll_Report_${getMonthName(data.month)}_${data.year}.pdf`;

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
          printPdfFrameWithFallback(printFrame, url, {
            logLabel: "mid-month payroll report PDF",
          });
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

export default MidMonthPayrollReportPDF;
