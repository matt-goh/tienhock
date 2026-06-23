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
  // Whole employee block (main row + its pinjam breakdown). The separating
  // line lives here so it sits below the breakdown, not between it and the row.
  employeeBlock: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    paddingBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    minHeight: 18,
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

  // Pinjam detail sub-rows
  detailRow: {
    flexDirection: "row",
    paddingHorizontal: 3,
    paddingBottom: 1.5,
    marginTop: -2,
  },
  detailSpacer: {
    width: "4%",
  },
  detailDesc: {
    width: "50%",
    fontSize: 7.5,
    fontFamily: "Helvetica-Oblique",
    color: colors.textMuted,
    paddingLeft: 10,
  },
  detailAmount: {
    width: "14%",
    fontSize: 7.5,
    color: colors.textMuted,
    textAlign: "right",
    paddingRight: 4,
  },

  // Text formatting
  bold: { fontFamily: "Helvetica-Bold" },
  textCenter: { textAlign: "center" },
  textRight: { textAlign: "right" },

  // Pinjam by Type card
  byTypeSection: {
    marginBottom: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
  },
  byTypeTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  byTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  byTypeItem: {
    width: "50%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1.5,
    paddingRight: 12,
  },
  byTypeLabel: {
    fontSize: 8.5,
    color: colors.textSecondary,
    paddingRight: 6,
  },
  byTypeValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: colors.danger,
  },
  byTypeTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  byTypeTotalLabel: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  byTypeTotalValue: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: colors.danger,
  },

  // Pinjam Breakdown page (contributors grouped by type)
  typeGroup: {
    marginBottom: 10,
  },
  typeGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
    marginBottom: 4,
  },
  typeGroupName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  typeGroupCount: {
    fontSize: 8,
    fontFamily: "Helvetica",
    color: colors.textMuted,
  },
  typeGroupTotal: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.danger,
  },
  contribGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  contribItem: {
    width: "50%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1.5,
    paddingRight: 14,
    paddingLeft: 4,
  },
  contribName: {
    flex: 1,
    fontSize: 8.5,
    color: colors.textSecondary,
    paddingRight: 6,
  },
  contribAmount: {
    fontSize: 8.5,
    color: colors.textPrimary,
    textAlign: "right",
  },

  // Enhanced Footer Section
  footerSection: {
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
export interface PinjamDetail {
  description: string;
  amount: number;
}

// Roll the per-employee pinjam details up into per-type totals (grouped by
// description, case-insensitive), sorted by amount descending. The summed
// total equals summary.total_pinjam since every pinjam record yields a detail.
export const aggregatePinjamByType = (
  rows: PinjamReportData[]
): PinjamDetail[] => {
  const map = new Map<string, PinjamDetail>();
  for (const row of rows) {
    for (const d of row.pinjam_details ?? []) {
      const description = d.description.trim();
      const key = description.toUpperCase();
      const existing = map.get(key);
      if (existing) existing.amount += d.amount;
      else map.set(key, { description, amount: d.amount });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
};

export interface PinjamTypeContributors {
  description: string;
  total: number;
  contributors: { staff_id: string; staff_name: string; amount: number }[];
}

// Group pinjam by type (description), listing the staff who contributed to each
// type with their summed amount. Types sorted by total desc, contributors by
// amount desc. Drives the on-screen breakdown and the PDF "Pinjam Breakdown" page.
export const aggregatePinjamContributorsByType = (
  rows: PinjamReportData[]
): PinjamTypeContributors[] => {
  const typeMap = new Map<
    string,
    {
      description: string;
      total: number;
      staff: Map<
        string,
        { staff_id: string; staff_name: string; amount: number }
      >;
    }
  >();
  for (const row of rows) {
    for (const d of row.pinjam_details ?? []) {
      const description = d.description.trim();
      const key = description.toUpperCase();
      let entry = typeMap.get(key);
      if (!entry) {
        entry = { description, total: 0, staff: new Map() };
        typeMap.set(key, entry);
      }
      entry.total += d.amount;
      const existing = entry.staff.get(row.staff_id);
      if (existing) existing.amount += d.amount;
      else
        entry.staff.set(row.staff_id, {
          staff_id: row.staff_id,
          staff_name: row.staff_name,
          amount: d.amount,
        });
    }
  }
  return Array.from(typeMap.values())
    .map((e) => ({
      description: e.description,
      total: e.total,
      contributors: Array.from(e.staff.values()).sort(
        (a, b) => b.amount - a.amount
      ),
    }))
    .sort((a, b) => b.total - a.total);
};

export interface PinjamReportData {
  no: number;
  staff_id: string;
  staff_name: string;
  payment_preference: string;
  gaji_genap: number;
  total_pinjam: number;
  pinjam_details?: PinjamDetail[];
  final_total: number;
  net_pay: number;
  mid_month_amount: number;
}

export interface PinjamReportPDFData {
  year: number;
  month: number;
  data: PinjamReportData[];
  total_records: number;
  summary: {
    total_gaji_genap: number;
    total_pinjam: number;
    total_final: number;
  };
}

// PDF Components
const PinjamRow: React.FC<{
  employee: PinjamReportData;
}> = ({ employee }) => {
  const details = employee.pinjam_details ?? [];
  return (
    <View style={styles.employeeBlock} wrap={false}>
      <View style={styles.tableRow}>
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
              color:
                employee.total_pinjam > 0 ? colors.danger : colors.textPrimary,
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
      {details.map((detail, index) => (
        <View style={styles.detailRow} key={index}>
          <Text style={styles.detailSpacer} />
          <Text style={styles.detailDesc}>{`•  ${detail.description}`}</Text>
          <Text style={styles.detailAmount}>
            {formatCurrency(detail.amount)}
          </Text>
        </View>
      ))}
    </View>
  );
};

const PinjamReportPDF: React.FC<{
  data: PinjamReportPDFData;
  companyName?: string;
}> = ({ data, companyName = TIENHOCK_INFO.name }) => {
  const reportTitle = `${getMonthName(data.month)} ${data.year} Pinjam Report`;
  const pinjamByType = aggregatePinjamByType(data.data);

  return (
    <Document title={`Pinjam Report ${getMonthName(data.month)} ${data.year}`}>
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

          {data.data.map((employee) => (
            <PinjamRow
              key={employee.staff_id}
              employee={employee}
            />
          ))}
        </View>

        {/* Pinjam by Type */}
        {pinjamByType.length > 0 && (
          <View style={styles.byTypeSection} wrap={false}>
            <Text style={styles.byTypeTitle}>Pinjam by Type</Text>
            <View style={styles.byTypeGrid}>
              {pinjamByType.map((type, index) => (
                <View style={styles.byTypeItem} key={index}>
                  <Text style={styles.byTypeLabel}>{type.description}</Text>
                  <Text style={styles.byTypeValue}>
                    {formatCurrency(type.amount)}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.byTypeTotalRow}>
              <Text style={styles.byTypeTotalLabel}>TOTAL PINJAM</Text>
              <Text style={styles.byTypeTotalValue}>
                {formatCurrency(data.summary.total_pinjam)}
              </Text>
            </View>
          </View>
        )}

        {/* Enhanced Footer Summary */}
        <View style={styles.footerSection} wrap={false}>
          <Text style={styles.footerTitle}>Pinjam Report Summary</Text>

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

// Pinjam Breakdown PDF - "Pinjam by Type" overview + contributors grouped by type
const PinjamBreakdownPDF: React.FC<{
  data: PinjamReportPDFData;
  companyName?: string;
}> = ({ data, companyName = TIENHOCK_INFO.name }) => {
  const reportTitle = `${getMonthName(data.month)} ${data.year} Pinjam Breakdown`;
  const pinjamByType = aggregatePinjamByType(data.data);
  const contributorsByType = aggregatePinjamContributorsByType(data.data);

  return (
    <Document
      title={`Pinjam Breakdown ${getMonthName(data.month)} ${data.year}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>{reportTitle}</Text>
          </View>
        </View>

        {/* Pinjam by Type overview */}
        {pinjamByType.length > 0 && (
          <View style={styles.byTypeSection} wrap={false}>
            <Text style={styles.byTypeTitle}>Pinjam by Type</Text>
            <View style={styles.byTypeGrid}>
              {pinjamByType.map((type, index) => (
                <View style={styles.byTypeItem} key={index}>
                  <Text style={styles.byTypeLabel}>{type.description}</Text>
                  <Text style={styles.byTypeValue}>
                    {formatCurrency(type.amount)}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.byTypeTotalRow}>
              <Text style={styles.byTypeTotalLabel}>TOTAL PINJAM</Text>
              <Text style={styles.byTypeTotalValue}>
                {formatCurrency(data.summary.total_pinjam)}
              </Text>
            </View>
          </View>
        )}

        {/* Contributors grouped by type */}
        {contributorsByType.map((type, index) => (
          <View style={styles.typeGroup} key={index}>
            <View style={styles.typeGroupHeader} wrap={false}>
              <Text style={styles.typeGroupName}>
                {type.description}{" "}
                <Text style={styles.typeGroupCount}>
                  ({type.contributors.length})
                </Text>
              </Text>
              <Text style={styles.typeGroupTotal}>
                {formatCurrency(type.total)}
              </Text>
            </View>
            <View style={styles.contribGrid}>
              {type.contributors.map((c, cIndex) => (
                <View style={styles.contribItem} key={cIndex}>
                  <Text style={styles.contribName}>{c.staff_name}</Text>
                  <Text style={styles.contribAmount}>
                    {formatCurrency(c.amount)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

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
const outputPdf = async (
  doc: React.ReactElement,
  fileName: string,
  action: "download" | "print",
  logLabel: string
) => {
  const pdfBlob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(pdfBlob);

  if (action === "download") {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    const printFrame = document.createElement("iframe");
    printFrame.style.display = "none";
    document.body.appendChild(printFrame);

    printFrame.onload = () => {
      if (printFrame.contentWindow) {
        printPdfFrameWithFallback(printFrame, url, { logLabel });
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
};

export const generatePinjamReportPDF = async (
  data: PinjamReportPDFData,
  action: "download" | "print"
) => {
  try {
    await outputPdf(
      <PinjamReportPDF data={data} />,
      `Pinjam_Report_${getMonthName(data.month)}_${data.year}.pdf`,
      action,
      "pinjam report PDF"
    );
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

export const generatePinjamBreakdownPDF = async (
  data: PinjamReportPDFData,
  action: "download" | "print"
) => {
  try {
    await outputPdf(
      <PinjamBreakdownPDF data={data} />,
      `Pinjam_Breakdown_${getMonthName(data.month)}_${data.year}.pdf`,
      action,
      "pinjam breakdown PDF"
    );
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

export default PinjamReportPDF;
