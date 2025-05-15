// src/utils/payroll/PaySlipPDF.tsx
import React from "react";
import { Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { EmployeePayroll } from "../../types/types";
import { groupItemsByType, getMonthName } from "./payrollUtils";

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.3,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  companySection: {
    flex: 1,
    marginRight: 15,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  employeeInfoTable: {
    marginTop: 5,
  },
  employeeInfoRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  employeeInfoLabel: {
    width: 55,
  },
  employeeInfoColon: {
    width: 10,
  },
  employeeInfoValue: {
    flex: 1,
  },
  payslipTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  table: {
    display: "flex",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#000",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    backgroundColor: "#f0f0f0",
    minHeight: 14,
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableColHeader: {
    borderRightWidth: 1,
    borderRightColor: "#000",
    paddingHorizontal: 5,
  },
  tableCol: {
    borderRightWidth: 1,
    borderRightColor: "#000",
    paddingHorizontal: 5,
    paddingTop: 3,
    fontSize: 8,
  },
  descriptionCol: {
    flex: 3,
  },
  rateCol: {
    flex: 1,
    textAlign: "right",
  },
  descriptionNoteCol: {
    flex: 1.5,
    textAlign: "left",
  },
  amountCol: {
    flex: 1,
    textAlign: "right",
  },
  subtotalRow: {
    backgroundColor: "#f8f9fa", // Very light gray background
    borderTopWidth: 0.5,
  },
  sectionTitleRow: {
    backgroundColor: "#e9ecef", // Light gray background for section titles
    borderTopWidth: 1,
    borderTopColor: "#000",
  },
  sectionTitleText: {
    fontFamily: "Helvetica-Bold",
  },
  totalRow: {
    borderTopWidth: 2,
    borderTopColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  totalText: {
    fontFamily: "Helvetica-Bold",
  },
  signatureSection: {
    marginTop: 40,
    flexDirection: "row",
  },
  signatureBlock: {
    flex: 1,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    width: "80%",
    marginBottom: 5,
  },
  notesSection: {
    marginTop: 20,
    fontSize: 8,
    fontStyle: "italic",
  },
});

interface PaySlipPDFProps {
  payroll: EmployeePayroll;
  companyName?: string;
  staffDetails?: {
    name: string;
    icNo: string;
    jobName: string;
    section: string;
  };
}

const PaySlipPDF: React.FC<PaySlipPDFProps> = ({
  payroll,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  staffDetails,
}) => {
  const groupedItems = groupItemsByType(payroll.items || []);
  const year = payroll.year ?? new Date().getFullYear();
  const month = payroll.month ?? new Date().getMonth() + 1;
  const monthName = getMonthName(month);

  // Helper function to group items by hours and maintain order
  const groupItemsByHours = (items: any[]) => {
    const groupsArray: { hours: number; items: any[] }[] = [];
    const groupsMap = new Map<number, any[]>();

    // First pass: group items by hours
    items.forEach((item) => {
      const hours = item.quantity;
      if (!groupsMap.has(hours)) {
        groupsMap.set(hours, []);
      }
      groupsMap.get(hours)!.push(item);
    });

    // Convert to array format maintaining the order of first appearance
    items.forEach((item) => {
      const hours = item.quantity;
      if (!groupsArray.some((group) => group.hours === hours)) {
        groupsArray.push({
          hours,
          items: groupsMap.get(hours)!,
        });
      }
    });

    return groupsArray;
  };

  // Group base items by hours
  const baseGroupedByHours = groupItemsByHours(groupedItems.Base);
  const baseTotalAmount = groupedItems.Base.reduce(
    (sum, item) => sum + item.amount,
    0
  );
  const baseTotalRates = groupedItems.Base.reduce(
    (sum, item) => sum + item.rate,
    0
  );

  // Group additional items by hours
  const overtimeGroupedByHours = groupItemsByHours(groupedItems.Overtime);
  const overtimeTotalAmount = groupedItems.Overtime.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  // Find the hour group with the maximum hours (latest/most hours)
  const maxHoursGroup = baseGroupedByHours.reduce((maxGroup, currentGroup) => {
    return currentGroup.hours > maxGroup.hours ? currentGroup : maxGroup;
  }, baseGroupedByHours[0]);

  // Calculate rate using the maximum hours group
  const averageBaseRate =
    maxHoursGroup && maxHoursGroup.hours > 0
      ? baseTotalAmount / maxHoursGroup.hours
      : 0;

  // First payment (mid-month) - for demo purposes, set to 500
  const firstPayment = 500;

  // Final payment
  const finalPayment = payroll.net_pay - firstPayment;
  const roundedFinalPayment = Math.round(finalPayment * 100) / 100; // Round to 2 decimal places

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Helper function to format description based on rate unit
  const formatDescription = (item: any) => {
    switch (item.rate_unit) {
      case "Hour":
        return `${item.quantity.toFixed(0)} Hour${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Bag":
        return `${item.quantity.toFixed(0)} Bag${item.quantity > 1 ? "s" : ""}`;
      case "Trip":
        return `${item.quantity.toFixed(0)} Trip${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Day":
        return `${item.quantity.toFixed(0)} Day${item.quantity > 1 ? "s" : ""}`;
      case "Percent":
        return `${item.quantity.toFixed(0)} Unit${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Fixed":
        return monthName;
      default:
        return "";
    }
  };

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.companySection}>
          <Text style={styles.companyName}>{companyName}</Text>
          {/* Employee Information */}
          <View style={styles.employeeInfoTable}>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>Employee</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.name || payroll.employee_name}
              </Text>
            </View>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>IC no</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.icNo || "N/A"}
              </Text>
            </View>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>Kerja</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.jobName || payroll.job_type}
              </Text>
            </View>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>Bahagian</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.section || payroll.section}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Pay Slip Title - Now separate from header */}
      <Text style={styles.payslipTitle}>
        Slip Gaji Pajak (Jam/Bag/Commission) Untuk Bulan {monthName} {year}
      </Text>

      {/* Main Table */}
      <View style={styles.table}>
        {/* Table Header */}
        <View style={styles.tableHeaderRow}>
          <View style={[styles.tableColHeader, styles.descriptionCol]}>
            <Text>Kerja</Text>
          </View>
          <View style={[styles.tableColHeader, styles.rateCol]}>
            <Text>Rate</Text>
          </View>
          <View style={[styles.tableColHeader, styles.descriptionNoteCol]}>
            <Text>Description</Text>
          </View>
          <View
            style={[
              styles.tableColHeader,
              styles.amountCol,
              { borderRightWidth: 0 },
            ]}
          >
            <Text>Amount</Text>
          </View>
        </View>

        {/* Base Pay Items - Grouped by hours */}
        {baseGroupedByHours.map((group, groupIndex) =>
          group.items.map((item, itemIndex) => (
            <View
              key={`base-${group.hours}-${itemIndex}`}
              style={styles.tableRow}
            >
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <View style={{ height: 12, overflow: "hidden" }}>
                  <Text>{item.description}</Text>
                </View>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text>
                  {item.rate_unit === "Percent"
                    ? `${item.rate}%`
                    : item.rate.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text>{itemIndex === 0 ? `${group.hours} Jam` : ""}</Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text>{formatCurrency(item.amount)}</Text>
              </View>
            </View>
          ))
        )}

        {/* Base Pay Subtotal Row */}
        {groupedItems.Base.length > 0 && (
          <View style={[styles.tableRow, styles.subtotalRow]}>
            <View style={[styles.tableCol, styles.descriptionCol]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, styles.rateCol]}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {baseTotalRates.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.tableCol, styles.descriptionNoteCol]}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                Rate/Jam : {averageBaseRate.toFixed(2)}
              </Text>
            </View>
            <View
              style={[
                styles.tableCol,
                styles.amountCol,
                { borderRightWidth: 0 },
              ]}
            >
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {formatCurrency(baseTotalAmount)}
              </Text>
            </View>
          </View>
        )}

        {/* Tambahan Pay Items */}
        {groupedItems["Tambahan"].length > 0 && (
          <>
            {/* Tambahan Title Row */}
            <View style={[styles.tableRow, styles.sectionTitleRow]}>
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <Text style={styles.sectionTitleText}>Tambahan</Text>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text></Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text></Text>
              </View>
            </View>

            {/* Tambahan Items */}
            {groupedItems["Tambahan"].map((item, index) => (
              <View key={`tambahan-${index}`} style={styles.tableRow}>
                <View style={[styles.tableCol, styles.descriptionCol]}>
                  <View style={{ height: 12, overflow: "hidden" }}>
                    <Text>{item.description}</Text>
                  </View>
                </View>
                <View style={[styles.tableCol, styles.rateCol]}>
                  <Text>
                    {item.rate_unit === "Percent"
                      ? `${item.rate}%`
                      : item.rate.toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                  <Text>{formatDescription(item)}</Text>
                </View>
                <View
                  style={[
                    styles.tableCol,
                    styles.amountCol,
                    { borderRightWidth: 0 },
                  ]}
                >
                  <Text>{formatCurrency(item.amount)}</Text>
                </View>
              </View>
            ))}

            {/* Tambahan Subtotal Row */}
            <View style={[styles.tableRow, styles.subtotalRow]}>
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Subtotal</Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  {formatCurrency(
                    groupedItems["Tambahan"].reduce(
                      (sum, item) => sum + item.amount,
                      0
                    )
                  )}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Overtime Pay Items */}
        {groupedItems.Overtime.length > 0 && (
          <>
            {/* Overtime Title Row */}
            <View style={[styles.tableRow, styles.sectionTitleRow]}>
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <Text style={styles.sectionTitleText}>Overtime</Text>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text></Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text></Text>
              </View>
            </View>

            {/* Overtime Items - Grouped by hours */}
            {overtimeGroupedByHours.map((group, groupIndex) =>
              group.items.map((item, itemIndex) => (
                <View
                  key={`overtime-${group.hours}-${itemIndex}`}
                  style={styles.tableRow}
                >
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <View style={{ height: 12, overflow: "hidden" }}>
                      <Text>{item.description}</Text>
                    </View>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text>
                      {item.rate_unit === "Percent"
                        ? `${item.rate}%`
                        : item.rate.toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text>
                      {itemIndex === 0 ? `${group.hours} Jam OT` : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>{formatCurrency(item.amount)}</Text>
                  </View>
                </View>
              ))
            )}

            {/* Overtime Subtotal Row */}
            {groupedItems.Overtime.length > 0 && (
              <View style={[styles.tableRow, styles.subtotalRow]}>
                <View style={[styles.tableCol, styles.descriptionCol]}>
                  <Text></Text>
                </View>
                <View style={[styles.tableCol, styles.rateCol]}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>
                    {groupedItems.Overtime.reduce(
                      (sum, item) => sum + item.rate,
                      0
                    ).toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>Subtotal</Text>
                </View>
                <View
                  style={[
                    styles.tableCol,
                    styles.amountCol,
                    { borderRightWidth: 0 },
                  ]}
                >
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>
                    {formatCurrency(overtimeTotalAmount)}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* Grand Total Row */}
        <View style={[styles.tableRow, styles.totalRow]}>
          <View style={[styles.tableCol, styles.descriptionCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.rateCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.descriptionNoteCol]}>
            <Text style={styles.totalText}>Jumlah Gaji Kasar</Text>
          </View>
          <View
            style={[styles.tableCol, styles.amountCol, { borderRightWidth: 0 }]}
          >
            <Text style={styles.totalText}>
              {formatCurrency(payroll.gross_pay)}
            </Text>
          </View>
        </View>

        {/* Deductions Rows */}
        {payroll.deductions && payroll.deductions.length > 0 && (
          <>
            {/* EPF Deduction */}
            {payroll.deductions
              .filter((d) => d.deduction_type.toUpperCase() === "EPF")
              .map((deduction, index) => (
                <View key="deduction-epf" style={styles.tableRow}>
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <Text>EPF (Majikan)</Text>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text>{deduction.employer_amount.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text>EPF (Pekerja)</Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>({deduction.employee_amount.toFixed(2)})</Text>
                  </View>
                </View>
              ))}

            {/* SOCSO Deduction */}
            {payroll.deductions
              .filter((d) => d.deduction_type.toUpperCase() === "SOCSO")
              .map((deduction, index) => (
                <View key="deduction-socso" style={styles.tableRow}>
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <Text>SOCSO (Majikan)</Text>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text>{deduction.employer_amount.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text>SOCSO (Pekerja)</Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>({deduction.employee_amount.toFixed(2)})</Text>
                  </View>
                </View>
              ))}

            {/* SIP Deduction */}
            {payroll.deductions
              .filter((d) => d.deduction_type.toUpperCase() === "SIP")
              .map((deduction, index) => (
                <View key="deduction-sip" style={styles.tableRow}>
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <Text>SIP (Majikan)</Text>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text>{deduction.employer_amount.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text>SIP (Pekerja)</Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>({deduction.employee_amount.toFixed(2)})</Text>
                  </View>
                </View>
              ))}
          </>
        )}

        {/* Net Pay Row */}
        <View style={[styles.tableRow, styles.totalRow]}>
          <View style={[styles.tableCol, styles.descriptionCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.rateCol]}>
            <Text></Text>
          </View>{" "}
        </View>
        <View style={[styles.tableCol, styles.descriptionNoteCol]}>
          <Text style={styles.totalText}>Jumlah Gaji Bersih</Text>
        </View>
        <View
          style={[styles.tableCol, styles.amountCol, { borderRightWidth: 0 }]}
        >
          <Text style={styles.totalText}>
            {formatCurrency(payroll.net_pay)}
          </Text>
        </View>

        {/* Mid Month Payment Deduction - To Be Implemented Soon */}
        <View style={styles.tableRow}>
          <View style={[styles.tableCol]}>
            <Text>Bayaran Pertama (1) Gaji Pertengahan Bulan</Text>
          </View>
          <View style={[styles.tableCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol]}>
            <Text>({formatCurrency(firstPayment)})</Text>
          </View>
        </View>

        <View style={styles.tableRow}>
          <View style={[styles.tableCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, { fontWeight: "bold" }]}>
            <Text>Jumlah</Text>
          </View>
          <View style={[styles.tableCol, { fontWeight: "bold" }]}>
            <Text>{formatCurrency(finalPayment)}</Text>
          </View>
        </View>

        <View style={styles.tableRow}>
          <View style={[styles.tableCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, { fontWeight: "bold" }]}>
            <Text>Jumlah Digenapkan</Text>
          </View>
          <View style={[styles.tableCol, { fontWeight: "bold" }]}>
            <Text>{formatCurrency(Math.round(roundedFinalPayment))}</Text>
          </View>
        </View>
      </View>

      {/* Notice Section */}
      <View style={styles.notesSection}>
        <Text>
          *** Perhatian : Sila kembalikan selepas tandatangan slip ini
        </Text>
      </View>

      {/* Signature Section */}
      <View style={styles.signatureSection}>
        <View style={styles.signatureBlock}></View>
        <View style={styles.signatureBlock}>
          <Text style={{ textAlign: "right", marginRight: 10 }}>
            RECEIVED BY
          </Text>
          <View
            style={[
              styles.signatureLine,
              { marginLeft: "auto", marginRight: 10 },
            ]}
          ></View>
        </View>
      </View>
    </Page>
  );
};

export default PaySlipPDF;
