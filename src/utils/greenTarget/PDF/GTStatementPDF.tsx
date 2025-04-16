// src/utils/greenTarget/PDF/GTStatementPDF.tsx
import React from "react";
import { Page, StyleSheet, View, Text, Image } from "@react-pdf/renderer";
import { InvoiceGT } from "../../../types/types";
import { GREENTARGET_INFO } from "../../invoice/einvoice/companyInfo";
import GreenTargetLogo from "../../GreenTargetLogo.png";

// Define styles
const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  companySection: {
    flexDirection: "row",
    flex: 1,
    marginRight: 15,
  },
  logo: {
    width: 80,
    height: 80,
    marginRight: 10,
  },
  companyInfo: {
    flex: 1,
    justifyContent: "center",
    color: "#111827",
  },
  companyName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 9,
    marginBottom: 1,
    lineHeight: 1.3,
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4, // Reduced margin to bring period closer
    textAlign: "right",
  },
  // Updated statementPeriod style
  statementPeriod: {
    fontSize: 10,
    textAlign: "right", // Align with the title
    marginBottom: 8, // Space before customer info
  },
  customerInfo: {
    marginBottom: 15,
    marginLeft: 5, // Kept small left margin for customer block
  },
  customerName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  customerDetail: {
    fontSize: 10,
    marginBottom: 1,
    lineHeight: 1.3,
  },
  invoiceDetails: {
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  detailLabel: {
    fontFamily: "Helvetica-Bold",
    width: 120,
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
  },
  infoContainer: {
    flexDirection: "row",
    gap: 8,
  },
  infoBox: {
    flex: 1,
    border: "1 solid #9CA3AF",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  infoRow: {
    flexDirection: "row",
    lineHeight: 0.75,
  },
  infoLabel: {
    width: "35%",
    paddingRight: 6,
  },
  infoValue: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#666",
    paddingVertical: 4,
  },
  lastTableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingVertical: 4,
  },
  dateCol: {
    width: "12%",
    paddingLeft: 4,
  },
  referenceCol: {
    width: "13%",
    paddingLeft: 4,
  },
  descriptionCol: {
    width: "35%",
    paddingLeft: 4,
  },
  debitCol: {
    width: "12%",
    textAlign: "right",
    paddingRight: 4,
  },
  creditCol: {
    width: "12%",
    textAlign: "right",
    paddingRight: 4,
  },
  balanceCol: {
    width: "16%", // Keep track of this width for summary alignment
    textAlign: "right",
    paddingRight: 4, // Keep track of this padding for summary alignment
  },
  headerText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  cellText: {
    fontSize: 9,
  },
  // Updated simpleSummary styles for alignment
  simpleSummary: {
    flexDirection: "row", // Keep as row
    // Removed justifyContent: 'flex-end'
    marginTop: 10, // Added margin top for spacing
  },
  // Updated summaryLabel styles
  summaryLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    // Calculate width to push value to the right: 100% - balanceCol width (16%) = 84%
    width: "84%",
    textAlign: "right", // Align text to the right within its space
    paddingRight: 10, // Add padding for separation from value
  },
  // Updated summaryTotalValue styles
  summaryTotalValue: {
    // Match the width of the balance column
    width: "16%",
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    paddingRight: 4,
  },
  agingSection: {
    marginTop: 20,
    marginBottom: 10,
  },
  agingTable: {
    borderWidth: 0.5,
    borderColor: "#000",
    borderBottomWidth: 0,
  },
  agingHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
  },
  agingRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
  },
  agingCell: {
    padding: 4,
    flex: 1,
    textAlign: "center",
    borderRightWidth: 0.5,
    borderRightColor: "#000",
  },
  agingCellLast: {
    padding: 4,
    flex: 1,
    textAlign: "center",
  },
  agingHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  agingCellText: {
    fontSize: 8,
  },
  footerSection: {
    marginTop: 30,
    flexDirection: "row",
    borderTop: "1 solid #e5e7eb",
    paddingTop: 15,
    paddingBottom: 15,
  },
  footerColumn: {
    flex: 1,
    paddingHorizontal: 10,
  },
  footerHeading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    color: "#4b5563",
  },
  paymentDetails: {
    fontSize: 9,
  },
  paymentRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  paymentLabel: {
    fontSize: 9,
    width: 80,
    color: "#4b5563",
  },
  paymentValue: {
    fontSize: 9,
    flex: 1,
  },
  noteText: {
    fontSize: 9,
    marginBottom: 4,
    color: "#4b5563",
  },
  footerDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#d1d5db",
    marginBottom: 10,
  },
  documentFooter: {
    marginTop: 10,
    padding: 10,
    textAlign: "center",
  },
  footerText: {
    fontSize: 8,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 2,
  },
});

// Helper to format date
const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "Invalid Date";
  }
};

// Helper to format currency
const formatCurrency = (amount: number | string | null | undefined) => {
  const num = Number(amount);
  if (amount === null || amount === undefined || isNaN(num)) {
    return "0.00";
  }
  return num.toFixed(2);
};

const isDebit = (amount: number) => amount > 0;

interface GTStatementPDFProps {
  invoice: InvoiceGT;
  qrCodeData?: string | null;
  statementDetails?: Array<{
    date: string;
    description: string;
    invoiceNo: string;
    amount: number;
    balance: number;
  }>;
  agingData?: {
    current: number;
    month1: number;
    month2: number;
    month3Plus: number;
    total: number;
  };
}

const GTStatementPDF: React.FC<GTStatementPDFProps> = ({
  invoice,
  statementDetails = [],
}) => {
  // If no statement details are provided, create a sample one from the invoice itself
  const finalStatementDetails =
    statementDetails.length > 0
      ? statementDetails
      : [
          {
            date: invoice.date_issued,
            description: "Opening Balance",
            invoiceNo: "-",
            amount: 0, // Represents neither debit nor credit initially
            balance: 0,
          },
          {
            date: invoice.date_issued,
            description: `Invoice ${invoice.invoice_number}`, // More specific description
            invoiceNo: invoice.invoice_number,
            amount: invoice.total_amount, // Positive amount represents a debit (amount owed)
            balance: invoice.total_amount,
          },
        ];

  // Calculate the final balance from the last statement detail item
  const currentBalance =
    finalStatementDetails.length > 0
      ? finalStatementDetails[finalStatementDetails.length - 1].balance
      : 0;

  return (
    <Page size="A4" style={styles.page}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.companySection}>
          <Image src={GreenTargetLogo} style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{GREENTARGET_INFO.name}</Text>
            <Text style={styles.companyDetail}>
              Reg. No: {GREENTARGET_INFO.reg_no}
            </Text>
            <Text style={styles.companyDetail}>
              {GREENTARGET_INFO.address_pdf}
            </Text>
            <Text style={styles.companyDetail}>
              {GREENTARGET_INFO.postcode}, {GREENTARGET_INFO.city_pdf},{" "}
              {GREENTARGET_INFO.state_pdf}
            </Text>
            <Text style={styles.companyDetail}>
              Tel: {GREENTARGET_INFO.phone}, {GREENTARGET_INFO.office_phone_pdf}
            </Text>
            <Text style={styles.companyDetail}>
              Email: {GREENTARGET_INFO.email}
            </Text>
          </View>
        </View>
      </View>

      {/* Statement Title */}
      <Text style={styles.title}>Statement of Account</Text>

      {/* Statement Period */}
      {invoice.statement_period_start && invoice.statement_period_end && (
        <Text style={styles.statementPeriod}>
          {formatDate(invoice.statement_period_start)} to{" "}
          {formatDate(invoice.statement_period_end)}
        </Text>
      )}

      {/* Customer Information */}
      <View style={styles.customerInfo}>
        <Text style={styles.customerName}>
          {invoice.customer_name || "Customer"}
        </Text>
        {invoice.customer_phone_number && (
          <Text style={styles.customerDetail}>
            Tel: {invoice.customer_phone_number}
          </Text>
        )}
        {invoice.additional_info && (
          <Text style={styles.customerDetail}>{invoice.additional_info}</Text>
        )}
      </View>

      {/* Statement Table */}
      <View>
        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.dateCol, styles.headerText]}>Date</Text>
          <Text style={[styles.referenceCol, styles.headerText]}>
            Reference
          </Text>
          <Text style={[styles.descriptionCol, styles.headerText]}>
            Description
          </Text>
          <Text style={[styles.debitCol, styles.headerText]}>Debit</Text>
          <Text style={[styles.creditCol, styles.headerText]}>Credit</Text>
          <Text style={[styles.balanceCol, styles.headerText]}>Balance</Text>
        </View>

        {/* Table Rows */}
        {finalStatementDetails.map((item, index) => {
          const isDebitItem = isDebit(item.amount);
          return (
            <View
              key={index}
              style={[
                index === finalStatementDetails.length - 1
                  ? styles.lastTableRow
                  : styles.tableRow,
              ]}
            >
              <Text style={[styles.dateCol, styles.cellText]}>
                {formatDate(item.date)}
              </Text>
              <Text style={[styles.referenceCol, styles.cellText]}>
                {item.invoiceNo || "-"}
              </Text>
              <Text style={[styles.descriptionCol, styles.cellText]}>
                {item.description}
              </Text>
              {/* Debit column - show amount if positive */}
              <Text style={[styles.debitCol, styles.cellText]}>
                {item.amount !== 0 && isDebitItem
                  ? formatCurrency(Math.abs(item.amount))
                  : ""}
              </Text>
              {/* Credit column - show amount if negative (converted to positive) */}
              <Text style={[styles.creditCol, styles.cellText]}>
                {item.amount !== 0 && !isDebitItem
                  ? formatCurrency(Math.abs(item.amount))
                  : ""}
              </Text>
              <Text style={[styles.balanceCol, styles.cellText]}>
                {formatCurrency(item.balance)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Summary Section */}
      <View style={styles.simpleSummary}>
        <Text style={styles.summaryLabel}>Current Balance (MYR):</Text>
        <Text style={styles.summaryTotalValue}>
          {formatCurrency(currentBalance)}
        </Text>
      </View>

      {/* Aging Section */}
      {invoice.agingData && (
        <View style={styles.agingSection}>
          <View style={styles.agingTable}>
            <View style={styles.agingHeader}>
              <Text style={[styles.agingCell, styles.agingHeaderText]}>
                Over 3 Months
              </Text>
              <Text style={[styles.agingCell, styles.agingHeaderText]}>
                2 Months
              </Text>
              <Text style={[styles.agingCell, styles.agingHeaderText]}>
                1 Month
              </Text>
              <Text style={[styles.agingCellLast, styles.agingHeaderText]}>
                Current
              </Text>
            </View>
            <View style={styles.agingRow}>
              <Text style={[styles.agingCell, styles.agingCellText]}>
                {formatCurrency(invoice.agingData.month3Plus)}
              </Text>
              <Text style={[styles.agingCell, styles.agingCellText]}>
                {formatCurrency(invoice.agingData.month2)}
              </Text>
              <Text style={[styles.agingCell, styles.agingCellText]}>
                {formatCurrency(invoice.agingData.month1)}
              </Text>
              <Text style={[styles.agingCellLast, styles.agingCellText]}>
                {formatCurrency(invoice.agingData.current)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Notes and Payment Section */}
      <View style={styles.footerSection}>
        <View style={styles.footerColumn}>
          <Text style={styles.footerHeading}>Payment Instructions</Text>
          <View style={styles.paymentDetails}>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Account Name:</Text>
              <Text style={styles.paymentValue}>
                Green Target Waste Treatment Industries S/B
              </Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Bank:</Text>
              <Text style={styles.paymentValue}>Public Bank Berhad</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Account No:</Text>
              <Text style={styles.paymentValue}>3137836814</Text>
            </View>
          </View>
        </View>

        <View style={styles.footerColumn}>
          <Text style={styles.footerHeading}>Information</Text>
          <Text style={styles.noteText}>
            This statement reflects your account status as of{" "}
            {formatDate(invoice.statement_period_end || invoice.date_issued)}.
          </Text>
          <Text style={styles.noteText}>
            If you have already made a payment, please disregard this statement
            with our thanks.
          </Text>
        </View>
      </View>

      {/* Divider line */}
      <View style={styles.footerDivider} />

      {/* Footer */}
      <View style={styles.documentFooter}>
        <Text style={styles.footerText}>
          This is a computer-generated statement and requires no signature.
        </Text>
        <Text style={styles.footerText}>
          © {new Date().getFullYear()} Green Target Waste Treatment Industries
          S/B.
        </Text>
      </View>
    </Page>
  );
};

export default GTStatementPDF;
