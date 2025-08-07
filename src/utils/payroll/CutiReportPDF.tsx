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
  sky: "#0284c7",
  amber: "#d97706",
  emerald: "#059669",
  header: {
    companyName: "#1e293b",
    companyDetails: "#334155",
  },
};

// Styles for cuti report
const styles = StyleSheet.create({
  // Page and Document Structure
  page: {
    paddingTop: 15,
    paddingBottom: 15,
    paddingLeft: 25,
    paddingRight: 25,
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
    marginBottom: 10,
    gap: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  logo: {
    width: 40,
    height: 40,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.header.companyName,
  },
  reportTitle: {
    fontSize: 11,
    marginTop: 3,
    color: colors.header.companyDetails,
    lineHeight: 1.2,
  },

  // Employee Header Section
  employeeHeader: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  employeeHeaderTop: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  employeeName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  employeeId: {
    fontSize: 9,
    color: "#e0f2fe",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  employeeDetailsContainer: {
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 8,
    backgroundColor: "#fafbfc",
  },
  employeeDetailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  employeeDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: "30%",
    marginBottom: 2,
    paddingRight: 8,
  },
  employeeDetailLabel: {
    fontSize: 7,
    color: colors.textMuted,
    fontFamily: "Helvetica-Bold",
    marginRight: 4,
    minWidth: 35,
  },
  employeeDetailValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    flex: 1,
  },
  yearsOfServiceBadge: {
    backgroundColor: colors.success,
    color: "#ffffff",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },

  // Leave Balance Summary
  balanceSection: {
    marginBottom: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
  },
  balanceTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 6,
    textAlign: "center",
  },
  balanceGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 10,
  },
  balanceItem: {
    flex: 1,
    alignItems: "center",
    padding: 6,
    borderRadius: 3,
  },
  balanceItemTahunan: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  balanceItemSakit: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  balanceItemUmum: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  balanceLeaveType: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
    textAlign: "center",
  },
  balanceValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  balanceTotal: {
    fontSize: 7,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 2,
  },

  // Monthly Table Styles
  table: {
    width: "100%",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 3,
    overflow: "hidden",
  },
  tableTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.primary,
    paddingVertical: 4,
  },
  tableSubHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f1f5f9",
    paddingVertical: 3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    minHeight: 20,
  },
  tableRowAlt: {
    backgroundColor: "#fafbfc",
  },
  tableTotalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderTopWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: "#f1f5f9",
    fontFamily: "Helvetica-Bold",
  },

  // Column widths for monthly table
  colMonth: {
    width: "13%",
    paddingHorizontal: 3,
    textAlign: "center",
    justifyContent: "center",
  },
  colDays: {
    width: "8%",
    paddingHorizontal: 2,
    textAlign: "center",
    justifyContent: "center",
  },
  colAmount: {
    width: "11%",
    paddingHorizontal: 2,
    textAlign: "center",
    justifyContent: "center",
  },
  colBalance: {
    width: "10%",
    paddingHorizontal: 2,
    textAlign: "center",
    justifyContent: "center",
  },

  // Header columns
  colCategoryHeader: {
    width: "29%",
    paddingHorizontal: 3,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    justifyContent: "center",
  },

  // Column Borders
  colBorder: {
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
  },
  colBorderSub: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  colBorderRow: {
    borderRightWidth: 0.5,
    borderRightColor: colors.borderLight,
  },
  colBorderTotal: {
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
  },

  // Text formatting
  bold: { fontFamily: "Helvetica-Bold" },
  textCenter: { textAlign: "center" },
  textRight: { textAlign: "right" },
  textSky: { color: colors.sky },
  textAmber: { color: colors.amber },
  textEmerald: { color: colors.emerald },

  // Summary footer
  summarySection: {
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 4,
    backgroundColor: "#f8fafc",
  },
  summaryTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 5,
    textAlign: "center",
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 10,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
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
});

// Helper Functions
const formatCurrency = (amount: number): string => {
  if (amount === 0) return "0.00";
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString("en-GB");
};

const getMonthName = (month: number): string => {
  const months = [
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
  return months[month - 1] || "";
};

// Interfaces
export interface CutiReportEmployee {
  id: string;
  name: string;
  job: string[];
  dateJoined: string;
  icNo: string;
  nationality: string;
}

export interface CutiLeaveBalance {
  cuti_umum_total: number;
  cuti_tahunan_total: number;
  cuti_sakit_total: number;
}

export interface CutiLeaveTaken {
  cuti_umum?: number;
  cuti_sakit?: number;
  cuti_tahunan?: number;
}

export interface CutiMonthlyData {
  cuti_umum: { days: number; amount: number };
  cuti_sakit: { days: number; amount: number };
  cuti_tahunan: { days: number; amount: number };
}

export interface CutiReportData {
  employee: CutiReportEmployee;
  year: number;
  yearsOfService: number;
  leaveBalance: CutiLeaveBalance;
  leaveTaken: CutiLeaveTaken;
  monthlySummary: Record<number, CutiMonthlyData>;
}

export interface CutiBatchReportData {
  year: number;
  employees: CutiReportData[];
  summary: {
    totalEmployees: number;
    totalDaysUsed: {
      cuti_tahunan: number;
      cuti_sakit: number;
      cuti_umum: number;
    };
    totalAmountPaid: {
      cuti_tahunan: number;
      cuti_sakit: number;
      cuti_umum: number;
    };
  };
}

// PDF Components
const EmployeeHeader: React.FC<{
  employee: CutiReportEmployee;
  year: number;
  yearsOfService: number;
}> = ({ employee, year, yearsOfService }) => (
  <View style={styles.employeeHeader}>
    {/* Compact Header with Name and ID */}
    <View style={styles.employeeHeaderTop}>
      <Text style={styles.employeeName}>{employee.name}</Text>
      <Text style={styles.employeeId}>ID: {employee.id}</Text>
    </View>

    {/* Compact Details in Horizontal Layout */}
    <View style={styles.employeeDetailsContainer}>
      <View style={styles.employeeDetailsGrid}>
        <View style={styles.employeeDetailItem}>
          <Text style={styles.employeeDetailLabel}>Job:</Text>
          <Text style={styles.employeeDetailValue}>
            {employee.job.join(", ") || "N/A"}
          </Text>
        </View>

        <View style={styles.employeeDetailItem}>
          <Text style={styles.employeeDetailLabel}>Joined:</Text>
          <Text style={styles.employeeDetailValue}>
            {formatDate(employee.dateJoined)}
          </Text>
        </View>

        <View style={styles.employeeDetailItem}>
          <Text style={styles.employeeDetailLabel}>Service:</Text>
          <Text style={styles.yearsOfServiceBadge}>{yearsOfService}y</Text>
        </View>

        <View style={styles.employeeDetailItem}>
          <Text style={styles.employeeDetailLabel}>IC:</Text>
          <Text style={styles.employeeDetailValue}>
            {employee.icNo || "N/A"}
          </Text>
        </View>

        <View style={styles.employeeDetailItem}>
          <Text style={styles.employeeDetailLabel}>Nation:</Text>
          <Text style={styles.employeeDetailValue}>
            {employee.nationality || "N/A"}
          </Text>
        </View>

        <View style={styles.employeeDetailItem}>
          <Text style={styles.employeeDetailLabel}>Year:</Text>
          <Text style={[styles.employeeDetailValue, { color: colors.primary }]}>
            {year}
          </Text>
        </View>
      </View>
    </View>
  </View>
);

const LeaveBalanceSummary: React.FC<{
  leaveBalance: CutiLeaveBalance;
  leaveTaken: CutiLeaveTaken;
  year: number;
}> = ({ leaveBalance, leaveTaken, year }) => {
  const remainingTahunan =
    leaveBalance.cuti_tahunan_total - (leaveTaken.cuti_tahunan || 0);
  const remainingSakit =
    leaveBalance.cuti_sakit_total - (leaveTaken.cuti_sakit || 0);
  const remainingUmum =
    leaveBalance.cuti_umum_total - (leaveTaken.cuti_umum || 0);

  return (
    <View style={styles.balanceSection}>
      <Text style={styles.balanceTitle}>Leave Balances ({year})</Text>
      <View style={styles.balanceGrid}>
        <View style={[styles.balanceItem, styles.balanceItemTahunan]}>
          <Text style={[styles.balanceLeaveType, styles.textSky]}>
            Cuti Tahunan
          </Text>
          <Text style={[styles.balanceValue, styles.textSky]}>
            {remainingTahunan}
          </Text>
          <Text style={styles.balanceTotal}>
            / {leaveBalance.cuti_tahunan_total} days
          </Text>
        </View>
        <View style={[styles.balanceItem, styles.balanceItemSakit]}>
          <Text style={[styles.balanceLeaveType, styles.textAmber]}>
            Cuti Sakit
          </Text>
          <Text style={[styles.balanceValue, styles.textAmber]}>
            {remainingSakit}
          </Text>
          <Text style={styles.balanceTotal}>
            / {leaveBalance.cuti_sakit_total} days
          </Text>
        </View>
        <View style={[styles.balanceItem, styles.balanceItemUmum]}>
          <Text style={[styles.balanceLeaveType, styles.textEmerald]}>
            Cuti Umum
          </Text>
          <Text style={[styles.balanceValue, styles.textEmerald]}>
            {remainingUmum}
          </Text>
          <Text style={styles.balanceTotal}>
            / {leaveBalance.cuti_umum_total} days
          </Text>
        </View>
      </View>
    </View>
  );
};

const MonthlyLeaveTable: React.FC<{
  monthlySummary: Record<number, CutiMonthlyData>;
  leaveBalance: CutiLeaveBalance;
  year: number;
}> = ({ monthlySummary, leaveBalance, year }) => {
  // Calculate running balances
  const calculateRunningBalances = () => {
    const results: Record<
      number,
      {
        tahunanBalance: number;
        sakitBalance: number;
        umumBalance: number;
      }
    > = {};

    let cumulativeTahunan = 0;
    let cumulativeSakit = 0;
    let cumulativeUmum = 0;

    for (let month = 1; month <= 12; month++) {
      const monthData = monthlySummary[month];

      cumulativeTahunan += monthData.cuti_tahunan.days;
      cumulativeSakit += monthData.cuti_sakit.days;
      cumulativeUmum += monthData.cuti_umum.days;

      results[month] = {
        tahunanBalance: leaveBalance.cuti_tahunan_total - cumulativeTahunan,
        sakitBalance: leaveBalance.cuti_sakit_total - cumulativeSakit,
        umumBalance: leaveBalance.cuti_umum_total - cumulativeUmum,
      };
    }

    return results;
  };

  const runningBalances = calculateRunningBalances();

  return (
    <View style={styles.table}>
      <Text style={styles.tableTitle}>Monthly Leave Details ({year})</Text>
      {/* Category Headers */}
      <View style={styles.tableHeader}>
        <View style={[styles.colMonth, styles.colBorder]}>
          <Text style={[styles.bold, { fontSize: 8, color: "#ffffff" }]}>
            MONTH
          </Text>
        </View>
        <View style={[styles.colCategoryHeader, styles.colBorder]}>
          <Text style={[styles.bold, { fontSize: 8, color: "#ffffff" }]}>
            CUTI TAHUNAN
          </Text>
        </View>
        <View style={[styles.colCategoryHeader, styles.colBorder]}>
          <Text style={[styles.bold, { fontSize: 8, color: "#ffffff" }]}>
            CUTI SAKIT
          </Text>
        </View>
        <View style={styles.colCategoryHeader}>
          <Text style={[styles.bold, { fontSize: 8, color: "#ffffff" }]}>
            CUTI UMUM
          </Text>
        </View>
      </View>

      {/* Sub Headers */}
      <View style={styles.tableSubHeader}>
        <View style={[styles.colMonth, styles.colBorderSub]}></View>
        {/* Cuti Tahunan */}
        <View style={styles.colDays}>
          <Text style={{ fontSize: 7, color: colors.sky }}>Days</Text>
        </View>
        <View style={styles.colAmount}>
          <Text style={{ fontSize: 7, color: colors.sky }}>Amount</Text>
        </View>
        <View style={[styles.colBalance, styles.colBorderSub]}>
          <Text style={{ fontSize: 7, color: colors.sky }}>Balance</Text>
        </View>
        {/* Cuti Sakit */}
        <View style={styles.colDays}>
          <Text style={{ fontSize: 7, color: colors.amber }}>Days</Text>
        </View>
        <View style={styles.colAmount}>
          <Text style={{ fontSize: 7, color: colors.amber }}>Amount</Text>
        </View>
        <View style={[styles.colBalance, styles.colBorderSub]}>
          <Text style={{ fontSize: 7, color: colors.amber }}>Balance</Text>
        </View>
        {/* Cuti Umum */}
        <View style={styles.colDays}>
          <Text style={{ fontSize: 7, color: colors.emerald }}>Days</Text>
        </View>
        <View style={styles.colAmount}>
          <Text style={{ fontSize: 7, color: colors.emerald }}>Amount</Text>
        </View>
        <View style={styles.colBalance}>
          <Text style={{ fontSize: 7, color: colors.emerald }}>Balance</Text>
        </View>
      </View>

      {/* Data Rows */}
      {Object.entries(monthlySummary).map(([month, summary], index) => {
        const monthNum = parseInt(month);
        const balances = runningBalances[monthNum];

        return (
          <View
            key={month}
            style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
            wrap={false}
          >
            <View style={styles.colMonth}>
              <Text style={[styles.bold, { fontSize: 8 }]}>
                {getMonthName(monthNum)}
              </Text>
            </View>

            {/* Cuti Tahunan */}
            <View style={styles.colDays}>
              <Text style={{ fontSize: 8, color: colors.sky }}>
                {summary.cuti_tahunan.days || "0"}
              </Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={{ fontSize: 8, color: colors.sky }}>
                {formatCurrency(summary.cuti_tahunan.amount)}
              </Text>
            </View>
            <View style={styles.colBalance}>
              <Text
                style={[
                  styles.bold,
                  {
                    fontSize: 8,
                    color:
                      balances.tahunanBalance < 0 ? colors.danger : colors.sky,
                  },
                ]}
              >
                {balances.tahunanBalance}
              </Text>
            </View>

            {/* Cuti Sakit */}
            <View style={styles.colDays}>
              <Text style={{ fontSize: 8, color: colors.amber }}>
                {summary.cuti_sakit.days || "0"}
              </Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={{ fontSize: 8, color: colors.amber }}>
                {formatCurrency(summary.cuti_sakit.amount)}
              </Text>
            </View>
            <View style={styles.colBalance}>
              <Text
                style={[
                  styles.bold,
                  {
                    fontSize: 8,
                    color:
                      balances.sakitBalance < 0 ? colors.danger : colors.amber,
                  },
                ]}
              >
                {balances.sakitBalance}
              </Text>
            </View>

            {/* Cuti Umum */}
            <View style={styles.colDays}>
              <Text style={{ fontSize: 8, color: colors.emerald }}>
                {summary.cuti_umum.days || "0"}
              </Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={{ fontSize: 8, color: colors.emerald }}>
                {formatCurrency(summary.cuti_umum.amount)}
              </Text>
            </View>
            <View style={styles.colBalance}>
              <Text
                style={[
                  styles.bold,
                  {
                    fontSize: 8,
                    color:
                      balances.umumBalance < 0 ? colors.danger : colors.emerald,
                  },
                ]}
              >
                {balances.umumBalance}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Totals Row */}
      <View style={styles.tableTotalRow}>
        <View style={styles.colMonth}>
          <Text style={[styles.bold, { fontSize: 8 }]}>TOTAL</Text>
        </View>

        {/* Cuti Tahunan Totals */}
        <View style={styles.colDays}>
          <Text style={[styles.bold, { fontSize: 8, color: colors.sky }]}>
            {Object.values(monthlySummary).reduce(
              (sum, month) => sum + month.cuti_tahunan.days,
              0
            )}
          </Text>
        </View>
        <View style={styles.colAmount}>
          <Text style={[styles.bold, { fontSize: 8, color: colors.sky }]}>
            {formatCurrency(
              Object.values(monthlySummary).reduce(
                (sum, month) => sum + month.cuti_tahunan.amount,
                0
              )
            )}
          </Text>
        </View>
        <View style={styles.colBalance}>
          <Text style={[styles.bold, { fontSize: 8, color: colors.sky }]}>
            {leaveBalance.cuti_tahunan_total -
              Object.values(monthlySummary).reduce(
                (sum, month) => sum + month.cuti_tahunan.days,
                0
              )}
          </Text>
        </View>

        {/* Cuti Sakit Totals */}
        <View style={styles.colDays}>
          <Text style={[styles.bold, { fontSize: 8, color: colors.amber }]}>
            {Object.values(monthlySummary).reduce(
              (sum, month) => sum + month.cuti_sakit.days,
              0
            )}
          </Text>
        </View>
        <View style={styles.colAmount}>
          <Text style={[styles.bold, { fontSize: 8, color: colors.amber }]}>
            {formatCurrency(
              Object.values(monthlySummary).reduce(
                (sum, month) => sum + month.cuti_sakit.amount,
                0
              )
            )}
          </Text>
        </View>
        <View style={styles.colBalance}>
          <Text style={[styles.bold, { fontSize: 8, color: colors.amber }]}>
            {leaveBalance.cuti_sakit_total -
              Object.values(monthlySummary).reduce(
                (sum, month) => sum + month.cuti_sakit.days,
                0
              )}
          </Text>
        </View>

        {/* Cuti Umum Totals */}
        <View style={styles.colDays}>
          <Text style={[styles.bold, { fontSize: 8, color: colors.emerald }]}>
            {Object.values(monthlySummary).reduce(
              (sum, month) => sum + month.cuti_umum.days,
              0
            )}
          </Text>
        </View>
        <View style={styles.colAmount}>
          <Text style={[styles.bold, { fontSize: 8, color: colors.emerald }]}>
            {formatCurrency(
              Object.values(monthlySummary).reduce(
                (sum, month) => sum + month.cuti_umum.amount,
                0
              )
            )}
          </Text>
        </View>
        <View style={styles.colBalance}>
          <Text style={[styles.bold, { fontSize: 8, color: colors.emerald }]}>
            {leaveBalance.cuti_umum_total -
              Object.values(monthlySummary).reduce(
                (sum, month) => sum + month.cuti_umum.days,
                0
              )}
          </Text>
        </View>
      </View>
    </View>
  );
};

// Single Employee Report PDF
const SingleCutiReportPDF: React.FC<{
  data: CutiReportData;
  companyName?: string;
}> = ({ data, companyName = TIENHOCK_INFO.name }) => {
  const reportTitle = `${data.employee.name} - Leave Report ${data.year}`;

  return (
    <Document title={`Leave Report ${data.employee.name} ${data.year}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>{reportTitle}</Text>
          </View>
        </View>

        <EmployeeHeader
          employee={data.employee}
          year={data.year}
          yearsOfService={data.yearsOfService}
        />

        <LeaveBalanceSummary
          leaveBalance={data.leaveBalance}
          leaveTaken={data.leaveTaken}
          year={data.year}
        />

        <MonthlyLeaveTable
          monthlySummary={data.monthlySummary}
          leaveBalance={data.leaveBalance}
          year={data.year}
        />

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

// Batch Report PDF
const BatchCutiReportPDF: React.FC<{
  data: CutiBatchReportData;
  companyName?: string;
}> = ({ data, companyName = TIENHOCK_INFO.name }) => {
  const reportTitle = `Batch Leave Report ${data.year} - ${data.summary.totalEmployees} Employees`;

  return (
    <Document title={`Batch Leave Report ${data.year}`}>
      {data.employees.map((employeeData, index) => (
        <Page key={employeeData.employee.id} size="A4" style={styles.page}>
          {/* Header */}
          <View style={styles.header}>
            <Image src={TienHockLogo} style={styles.logo} />
            <View style={styles.headerTextContainer}>
              <Text style={styles.companyName}>{companyName}</Text>
              <Text style={styles.reportTitle}>
                {employeeData.employee.name} - Leave Report {data.year}
              </Text>
            </View>
          </View>

          <EmployeeHeader
            employee={employeeData.employee}
            year={data.year}
            yearsOfService={employeeData.yearsOfService}
          />

          <LeaveBalanceSummary
            leaveBalance={employeeData.leaveBalance}
            leaveTaken={employeeData.leaveTaken}
            year={data.year}
          />

          <MonthlyLeaveTable
            monthlySummary={employeeData.monthlySummary}
            leaveBalance={employeeData.leaveBalance}
            year={data.year}
          />

          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages} - Employee ${index + 1} of ${
                data.employees.length
              }`
            }
            fixed
          />
        </Page>
      ))}
    </Document>
  );
};

// PDF Generation Functions
export const generateSingleCutiReportPDF = async (
  data: CutiReportData,
  action: "download" | "print"
) => {
  try {
    const doc = <SingleCutiReportPDF data={data} />;
    const pdfBlob = await pdf(doc).toBlob();

    const fileName = `Leave_Report_${data.employee.name.replace(/\s+/g, "_")}_${
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

export const generateBatchCutiReportPDF = async (
  data: CutiBatchReportData,
  action: "download" | "print"
) => {
  try {
    const doc = <BatchCutiReportPDF data={data} />;
    const pdfBlob = await pdf(doc).toBlob();

    const fileName = `Batch_Leave_Report_${data.year}_${data.summary.totalEmployees}_Employees.pdf`;

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

export default SingleCutiReportPDF;
