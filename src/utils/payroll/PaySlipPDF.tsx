// src/utils/payroll/PaySlipPDF.tsx
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { EmployeePayroll, PayrollItem } from "../../types/types";

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  header: {
    marginBottom: 20,
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    textTransform: "uppercase",
  },
  payslipTitle: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 10,
    color: "#444",
  },
  employeeInfoContainer: {
    flexDirection: "row",
    marginTop: 15,
    borderTop: "1px solid #eee",
    borderBottom: "1px solid #eee",
    paddingVertical: 10,
  },
  employeeInfoColumn: {
    flex: 1,
  },
  employeeInfoLabel: {
    fontSize: 8,
    color: "#666",
    marginBottom: 2,
  },
  employeeInfoValue: {
    fontSize: 10,
    fontWeight: "medium",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 15,
    marginBottom: 5,
    paddingBottom: 2,
    borderBottom: "1px solid #eee",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 5,
    backgroundColor: "#f9f9f9",
    paddingTop: 5,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#666",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 6,
  },
  tableCell: {
    fontSize: 9,
  },
  descriptionCell: {
    flex: 3,
  },
  rateCell: {
    flex: 1.5,
    textAlign: "right",
  },
  quantityCell: {
    flex: 1.5,
    textAlign: "right",
  },
  amountCell: {
    flex: 1,
    textAlign: "right",
  },
  totalContainer: {
    marginTop: 20,
    borderTop: "1px solid #ddd",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  totalLabel: {
    fontWeight: "medium",
  },
  totalValue: {
    fontWeight: "bold",
  },
  signatureContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 40,
  },
  signatureColumn: {
    flex: 1,
    maxWidth: "45%",
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#aaa",
    paddingBottom: 20,
  },
  signatureLabel: {
    fontSize: 8,
    textAlign: "center",
    marginTop: 5,
    color: "#666",
  },
  manualItem: {
    fontStyle: "italic",
    color: "#444",
  },
  footnote: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    fontSize: 8,
    color: "#999",
    textAlign: "center",
  },
});

// Helper function to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(amount);
};

// Helper to get month name
const getMonthName = (month: number) => {
  return new Date(2000, month - 1, 1).toLocaleString("default", {
    month: "long",
  });
};

interface PaySlipPDFProps {
  payroll: EmployeePayroll;
  companyName?: string;
}

// Group items by pay type
const groupItemsByType = (items: PayrollItem[]) => {
  const grouped: Record<string, PayrollItem[]> = {
    Base: [],
    Tambahan: [],
    Overtime: [],
  };

  items.forEach((item) => {
    if (
      item.description.toLowerCase().includes("overtime") ||
      item.description.toLowerCase().includes("ot")
    ) {
      grouped["Overtime"].push(item);
    } else if (
      item.is_manual ||
      item.description.toLowerCase().includes("tambahan")
    ) {
      grouped["Tambahan"].push(item);
    } else {
      grouped["Base"].push(item);
    }
  });

  return grouped;
};

const PaySlipPDF: React.FC<PaySlipPDFProps> = ({
  payroll,
  companyName = "Tien Hock",
}) => {
  const groupedItems = groupItemsByType(payroll.items);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>{companyName}</Text>
          <Text style={styles.payslipTitle}>
            Pay Slip for{" "}
            {getMonthName(payroll.month ?? new Date().getMonth() + 1)}{" "}
            {payroll.year}
          </Text>

          {/* Employee Information */}
          <View style={styles.employeeInfoContainer}>
            <View style={styles.employeeInfoColumn}>
              <Text style={styles.employeeInfoLabel}>Employee ID</Text>
              <Text style={styles.employeeInfoValue}>
                {payroll.employee_id}
              </Text>
            </View>

            <View style={styles.employeeInfoColumn}>
              <Text style={styles.employeeInfoLabel}>Name</Text>
              <Text style={styles.employeeInfoValue}>
                {payroll.employee_name}
              </Text>
            </View>

            <View style={styles.employeeInfoColumn}>
              <Text style={styles.employeeInfoLabel}>Job Type</Text>
              <Text style={styles.employeeInfoValue}>{payroll.job_type}</Text>
            </View>

            <View style={styles.employeeInfoColumn}>
              <Text style={styles.employeeInfoLabel}>Section</Text>
              <Text style={styles.employeeInfoValue}>{payroll.section}</Text>
            </View>
          </View>
        </View>

        {/* Base Pay Items */}
        {groupedItems.Base.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Base Pay</Text>

            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.descriptionCell]}>
                Description
              </Text>
              <Text style={[styles.tableHeaderCell, styles.rateCell]}>
                Rate
              </Text>
              <Text style={[styles.tableHeaderCell, styles.quantityCell]}>
                Quantity
              </Text>
              <Text style={[styles.tableHeaderCell, styles.amountCell]}>
                Amount
              </Text>
            </View>

            {/* Table Rows */}
            {groupedItems.Base.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.descriptionCell]}>
                  {item.description}
                </Text>
                <Text style={[styles.tableCell, styles.rateCell]}>
                  {formatCurrency(item.rate)}/{item.rate_unit}
                </Text>
                <Text style={[styles.tableCell, styles.quantityCell]}>
                  {item.quantity}{" "}
                  {item.rate_unit === "Hour"
                    ? "hrs"
                    : item.rate_unit === "Day"
                    ? "days"
                    : item.rate_unit === "Fixed"
                    ? ""
                    : item.rate_unit.toLowerCase()}
                </Text>
                <Text style={[styles.tableCell, styles.amountCell]}>
                  {formatCurrency(item.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Tambahan Pay Items */}
        {groupedItems.Tambahan.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Tambahan Pay</Text>

            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.descriptionCell]}>
                Description
              </Text>
              <Text style={[styles.tableHeaderCell, styles.rateCell]}>
                Rate
              </Text>
              <Text style={[styles.tableHeaderCell, styles.quantityCell]}>
                Quantity
              </Text>
              <Text style={[styles.tableHeaderCell, styles.amountCell]}>
                Amount
              </Text>
            </View>

            {/* Table Rows */}
            {groupedItems.Tambahan.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.descriptionCell]}>
                  {item.description}
                  {item.is_manual && " (Manual)"}
                </Text>
                <Text style={[styles.tableCell, styles.rateCell]}>
                  {formatCurrency(item.rate)}/{item.rate_unit}
                </Text>
                <Text style={[styles.tableCell, styles.quantityCell]}>
                  {item.quantity}{" "}
                  {item.rate_unit === "Hour"
                    ? "hrs"
                    : item.rate_unit === "Day"
                    ? "days"
                    : item.rate_unit === "Fixed"
                    ? ""
                    : item.rate_unit.toLowerCase()}
                </Text>
                <Text style={[styles.tableCell, styles.amountCell]}>
                  {formatCurrency(item.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Overtime Pay Items */}
        {groupedItems.Overtime.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Overtime Pay</Text>

            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.descriptionCell]}>
                Description
              </Text>
              <Text style={[styles.tableHeaderCell, styles.rateCell]}>
                Rate
              </Text>
              <Text style={[styles.tableHeaderCell, styles.quantityCell]}>
                Quantity
              </Text>
              <Text style={[styles.tableHeaderCell, styles.amountCell]}>
                Amount
              </Text>
            </View>

            {/* Table Rows */}
            {groupedItems.Overtime.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.descriptionCell]}>
                  {item.description}
                </Text>
                <Text style={[styles.tableCell, styles.rateCell]}>
                  {formatCurrency(item.rate)}/{item.rate_unit}
                </Text>
                <Text style={[styles.tableCell, styles.quantityCell]}>
                  {item.quantity}{" "}
                  {item.rate_unit === "Hour"
                    ? "hrs"
                    : item.rate_unit === "Day"
                    ? "days"
                    : item.rate_unit === "Fixed"
                    ? ""
                    : item.rate_unit.toLowerCase()}
                </Text>
                <Text style={[styles.tableCell, styles.amountCell]}>
                  {formatCurrency(item.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Summary Section */}
        <View style={styles.totalContainer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Gross Pay:</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(payroll.gross_pay)}
            </Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Net Pay:</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(payroll.net_pay)}
            </Text>
          </View>
        </View>

        {/* Signature Section */}
        <View style={styles.signatureContainer}>
          <View style={styles.signatureColumn}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Employee Signature</Text>
          </View>

          <View style={styles.signatureColumn}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Employer Signature</Text>
          </View>
        </View>

        {/* Footnote */}
        <Text style={styles.footnote}>
          This pay slip was generated on {new Date().toLocaleDateString()}
        </Text>
      </Page>
    </Document>
  );
};

export default PaySlipPDF;
