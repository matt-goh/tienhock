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
    minHeight: 20,
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
  grandTotalRow: {
    borderTopWidth: 2,
    borderTopColor: "#000",
  },
  grandTotalText: {
    fontFamily: "Helvetica-Bold",
  },
  paymentsSection: {
    marginTop: 10,
  },
  deductionsRow: {
    flexDirection: "row",
    marginTop: 3,
  },
  deductionLabel: {
    width: "30%",
    fontSize: 9,
  },
  deductionValue: {
    width: "15%",
    fontSize: 9,
    textAlign: "right",
  },
  deductionDesc: {
    width: "40%",
    fontSize: 9,
    paddingLeft: 10,
  },
  deductionAmount: {
    width: "15%",
    fontSize: 9,
    textAlign: "right",
  },
  bracketText: {
    textAlign: "right",
  },
  finalSection: {
    marginTop: 15,
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
  signatureLabel: {
    fontSize: 8,
    textAlign: "center",
    width: "80%",
  },
  notesSection: {
    marginTop: 20,
    fontSize: 8,
    fontStyle: "italic",
  },
  summaryCol: {
    textAlign: "right",
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "bold",
  },
  footnote: {
    marginTop: 20,
    fontSize: 8,
    textAlign: "center",
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

  // Group additional items by hours
  const overtimeGroupedByHours = groupItemsByHours(groupedItems.Overtime);
  const overtimeTotalAmount = groupedItems.Overtime.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  // Calculate total hours across all unique hour groups
  const totalUniqueHours = baseGroupedByHours.reduce(
    (sum, group) => sum + group.hours,
    0
  );
  const averageBaseRate =
    totalUniqueHours > 0 ? baseTotalAmount / totalUniqueHours : 0;

  // Calculate total deductions (for demo purposes - you'll need to add real deductions)
  const epfAmount = (payroll.gross_pay * 0.11).toFixed(2);
  const socsoAmount = (payroll.gross_pay * 0.005).toFixed(2);
  const sipAmount = (payroll.gross_pay * 0.002).toFixed(2);

  // Calculate total deductions
  const totalDeductions =
    parseFloat(epfAmount) + parseFloat(socsoAmount) + parseFloat(sipAmount);

  // First payment (mid-month) - for demo purposes, set to 500
  const firstPayment = 500;

  // Final payment
  const finalPayment = payroll.net_pay - firstPayment;
  const roundedFinalPayment = Math.round(finalPayment * 100) / 100; // Round to 2 decimal places

  // Track if we've already shown "JAM" for hour-based pay codes
  const jamLabelBaseRef = React.useRef(false);
  const jamLabelTambahanRef = React.useRef(false);
  const jamLabelOTRef = React.useRef(false);

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Helper function to format description based on rate unit
  const formatDescription = (
    item: any,
    isOT: boolean = false,
    flagRef: { current: boolean }
  ) => {
    switch (item.rate_unit) {
      case "Hour":
        if (!flagRef.current) {
          flagRef.current = true;
          return `${item.quantity.toFixed(2)} Jam${isOT ? " OT" : ""}`;
        }
        return "";
      case "Bag":
        return `${item.quantity.toFixed(0)} Bag`;
      case "Trip":
        return `${item.quantity.toFixed(0)} Trip${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Day":
        return `${item.quantity.toFixed(0)} Day${item.quantity > 1 ? "s" : ""}`;
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
                <Text>{item.rate.toFixed(2)}</Text>
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
              <Text></Text>
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
                  <Text>{item.rate.toFixed(2)}</Text>
                </View>
                <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                  <Text>
                    {item.is_manual && item.rate_unit !== "Hour"
                      ? "Manual"
                      : formatDescription(item, false, jamLabelTambahanRef)}
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
                    <Text>{item.rate.toFixed(2)}</Text>
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
            <View style={[styles.tableRow, styles.subtotalRow]}>
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  Subtotal
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
                  {formatCurrency(overtimeTotalAmount)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Grand Total Row */}
        <View style={[styles.tableRow, styles.grandTotalRow]}>
          <View style={[styles.tableCol, styles.descriptionCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.rateCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.descriptionNoteCol]}>
            <Text style={styles.grandTotalText}>Jumlah Gaji Kasar</Text>
          </View>
          <View
            style={[styles.tableCol, styles.amountCol, { borderRightWidth: 0 }]}
          >
            <Text style={styles.grandTotalText}>
              {formatCurrency(payroll.gross_pay)}
            </Text>
          </View>
        </View>
      </View>

      {/* Deductions Section */}
      <View style={styles.paymentsSection}>
        <View style={styles.deductionsRow}>
          <Text style={styles.deductionLabel}>EPF (MAJIKAN)</Text>
          <Text style={styles.deductionValue}>
            {parseFloat(epfAmount).toFixed(2)}
          </Text>
          <Text style={styles.deductionDesc}>EPF (PEKERJA)</Text>
          <Text style={styles.deductionAmount}>
            (
            <Text style={styles.bracketText}>
              {parseFloat(epfAmount).toFixed(2)}
            </Text>
            )
          </Text>
        </View>

        <View style={styles.deductionsRow}>
          <Text style={styles.deductionLabel}>SOCSO (MAJIKAN)</Text>
          <Text style={styles.deductionValue}>
            {parseFloat(socsoAmount).toFixed(2)}
          </Text>
          <Text style={styles.deductionDesc}>SOCSO (PEKERJA)</Text>
          <Text style={styles.deductionAmount}>
            (
            <Text style={styles.bracketText}>
              {parseFloat(socsoAmount).toFixed(2)}
            </Text>
            )
          </Text>
        </View>

        <View style={styles.deductionsRow}>
          <Text style={styles.deductionLabel}>SIP (MAJIKAN)</Text>
          <Text style={styles.deductionValue}>
            {parseFloat(sipAmount).toFixed(2)}
          </Text>
          <Text style={styles.deductionDesc}>SIP (PEKERJA)</Text>
          <Text style={styles.deductionAmount}>
            (
            <Text style={styles.bracketText}>
              {parseFloat(sipAmount).toFixed(2)}
            </Text>
            )
          </Text>
        </View>

        {/* Net Pay */}
        <View style={[styles.deductionsRow, { marginTop: 8 }]}>
          <Text style={[styles.deductionLabel, { fontWeight: "bold" }]}></Text>
          <Text style={styles.deductionValue}></Text>
          <Text style={[styles.deductionDesc, { fontWeight: "bold" }]}>
            JUMLAH GAJI BERSIH=
          </Text>
          <Text style={[styles.deductionAmount, { fontWeight: "bold" }]}>
            {formatCurrency(payroll.net_pay)}
          </Text>
        </View>
      </View>

      {/* Payment Schedule Section */}
      <View style={styles.finalSection}>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={[styles.tableCol, { flex: 3, borderRightWidth: 0 }]}>
              <Text>GAJI</Text>
            </View>
            <View style={[styles.tableCol, { flex: 1 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 2.5 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 1.5, borderRightWidth: 0 }]}>
              <Text></Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={[styles.tableCol, { flex: 3, borderRightWidth: 0 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 1 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 2.5 }]}>
              <Text>BAYARAN PERTAMA (1) GAJI PERTENGAHAN BULAN =</Text>
            </View>
            <View style={[styles.tableCol, { flex: 1.5, borderRightWidth: 0 }]}>
              <Text>({formatCurrency(firstPayment)})</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={[styles.tableCol, { flex: 3, borderRightWidth: 0 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 1 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 2.5 }]}>
              <Text>BAYARAN PERTAMA (1) KE 2 PERTENGAHAN BULAN =</Text>
            </View>
            <View style={[styles.tableCol, { flex: 1.5, borderRightWidth: 0 }]}>
              <Text>({formatCurrency(0)})</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={[styles.tableCol, { flex: 3, borderRightWidth: 0 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 1 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 2.5, fontWeight: "bold" }]}>
              <Text>JUMLAH -</Text>
            </View>
            <View
              style={[
                styles.tableCol,
                { flex: 1.5, borderRightWidth: 0, fontWeight: "bold" },
              ]}
            >
              <Text>{formatCurrency(roundedFinalPayment)}</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={[styles.tableCol, { flex: 3, borderRightWidth: 0 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 1 }]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, { flex: 2.5, fontWeight: "bold" }]}>
              <Text>JUMLAH DIGENAPKAN =</Text>
            </View>
            <View
              style={[
                styles.tableCol,
                { flex: 1.5, borderRightWidth: 0, fontWeight: "bold" },
              ]}
            >
              <Text>{formatCurrency(Math.round(roundedFinalPayment))}</Text>
            </View>
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
