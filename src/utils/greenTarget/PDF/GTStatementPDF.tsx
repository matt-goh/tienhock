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
    marginBottom: 15, // Space before customer info
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
  evenRow: {
    backgroundColor: "#f9fafb",
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
  paymentTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 4,
  },
  paymentInfo: {
    fontSize: 9,
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#6B7280",
    fontSize: 8,
    lineHeight: 1.5,
  },
  note: {
    marginTop: 20,
    padding: 10,
    borderWidth: 0.5,
    borderColor: "#d1d5db",
    borderRadius: 4,
    fontSize: 9,
    lineHeight: 1.4,
  },
  noteTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
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
    amount: number; // Use amount for debit/credit distinction
    balance: number;
  }>;
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

      {/* Statement Period - MOVED AND RESTYLED */}
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
                index % 2 !== 0 ? styles.evenRow : {},
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

      {/* Summary Section - UPDATED FOR ALIGNMENT */}
      <View style={styles.simpleSummary}>
        <Text style={styles.summaryLabel}>Current Balance (MYR):</Text>
        <Text style={styles.summaryTotalValue}>
          {formatCurrency(currentBalance)}
        </Text>
      </View>

      {/* Note Section */}
      <View style={styles.note}>
        <Text style={styles.noteTitle}>Note:</Text>
        <Text>
          This statement reflects your account status as of{" "}
          {/* Use statement end date or issue date if available */}
          {formatDate(invoice.statement_period_end || invoice.date_issued)}.
          Please remit payment promptly. If you have already made a payment,
          please disregard this statement with our thanks. For inquiries, please
          contact us.
        </Text>
      </View>

      {/* Payment Info */}
      <View style={{ marginTop: 15 }}>
        <Text style={styles.paymentTitle}>Payment Instructions:</Text>
        <Text style={styles.paymentInfo}>
          Account Name: Green Target Waste Treatment Industries S/B{"\n"}
          Bank: Public Bank Berhad{"\n"}
          Account No: 3137836814
        </Text>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>This is a computer-generated statement.</Text>
    </Page>
  );
};

export default GTStatementPDF;
