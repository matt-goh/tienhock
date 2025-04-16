// src/utils/greenTarget/PDF/GTStatementPDF.tsx
import React from "react";
import { Page, StyleSheet, View, Text, Image } from "@react-pdf/renderer";
import { InvoiceGT } from "../../../types/types";
import { GREENTARGET_INFO } from "../../invoice/einvoice/companyInfo";
import GreenTargetLogo from "../../GreenTargetLogo.png";

// Define styles
const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 0, // Footer handles bottom padding
    fontSize: 9,
    fontFamily: "Helvetica",
    flexDirection: "column", // Essential for vertical flex layout
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    flexShrink: 0, // Prevent header from shrinking
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
    marginBottom: 4,
    textAlign: "right",
    flexShrink: 0, // Prevent from shrinking
  },
  statementPeriod: {
    fontSize: 10,
    textAlign: "right",
    marginBottom: 8,
    flexShrink: 0, // Prevent from shrinking
  },
  customerInfo: {
    marginBottom: 15,
    marginLeft: 5,
    flexShrink: 0, // Prevent from shrinking
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

  // NEW: Wrapper for the main variable content area
  contentArea: {
    flexShrink: 0, // Prevent this whole block from shrinking vertically
    // No flexGrow here, its height is determined by its content
  },

  // Statement Table styles (now inside contentArea)
  statementTableContainer: {
    // flexShrink: 0, // Removed, handled by contentArea
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
  dateCol: { width: "12%", paddingLeft: 4 },
  referenceCol: { width: "13%", paddingLeft: 4 },
  descriptionCol: { width: "35%", paddingLeft: 4 },
  debitCol: { width: "12%", textAlign: "right", paddingRight: 4 },
  creditCol: { width: "12%", textAlign: "right", paddingRight: 4 },
  balanceCol: { width: "16%", textAlign: "right", paddingRight: 4 },
  headerText: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  cellText: { fontSize: 9 },

  // Summary Styles (now inside contentArea)
  simpleSummary: {
    flexDirection: "row",
    marginTop: 10,
    // flexShrink: 0, // Removed, handled by contentArea
  },
  summaryLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    width: "84%",
    textAlign: "right",
    paddingRight: 10,
  },
  summaryTotalValue: {
    width: "16%",
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    paddingRight: 4,
  },

  // Aging Section Styles (now inside contentArea)
  agingSection: {
    marginTop: 20,
    // flexShrink: 0, // Removed, handled by contentArea
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

  // Interest Note Styles (now inside contentArea)
  interestNoteContainer: {
    marginTop: 8,
    marginBottom: 15, // Added bottom margin for spacing before payment info
    alignItems: "center",
    // flexShrink: 0, // Removed, handled by contentArea
  },
  interestNoteText: {
    fontSize: 8.5,
    fontStyle: "italic",
    color: "#4b5563",
    textAlign: "center",
  },

  // Payment and Info Section (now inside contentArea)
  paymentAndInfoSection: {
    flexDirection: "row",
    marginTop: 10, // Keep spacing if needed
    // flexShrink: 0, // Removed, handled by contentArea
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

  // Spacer View: Sibling to contentArea and documentFooter
  spacer: {
    flexGrow: 1, // Takes up all available vertical space
    // Add minHeight if needed for debugging, e.g., minHeight: 10, backgroundColor: 'red'
  },

  // Document Footer: Sibling to contentArea and spacer
  documentFooter: {
    paddingTop: 10, // Space above footer text
    paddingBottom: 15, // Generous space at the very bottom
    paddingHorizontal: 10,
    textAlign: "center",
    width: "100%",
    flexShrink: 0, // Prevent footer from shrinking
  },
  footerText: {
    fontSize: 8,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 2,
  },
});

// Helper functions (formatDate, formatCurrency, isDebit) remain the same...
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

const formatCurrency = (amount: number | string | null | undefined) => {
  const num = Number(amount);
  if (amount === null || amount === undefined || isNaN(num)) {
    return "0.00";
  }
  return num.toFixed(2);
};

const isDebit = (amount: number) => amount >= 0;

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
}

const GTStatementPDF: React.FC<GTStatementPDFProps> = ({
  invoice,
  statementDetails = [],
}) => {
  const finalStatementDetails =
    statementDetails.length > 0
      ? statementDetails
      : [
          {
            date: invoice.date_issued,
            description: "Opening Balance",
            invoiceNo: "-",
            amount: 0,
            balance: 0,
          },
          {
            date: invoice.date_issued,
            description: `Invoice ${invoice.invoice_number}`,
            invoiceNo: invoice.invoice_number,
            amount: invoice.total_amount,
            balance: invoice.total_amount,
          },
          // Simulate a few more rows for testing short tables
          // { date: "2023-10-05", description: "Short Item 1", invoiceNo: "INV-001", amount: 50, balance: invoice.total_amount + 50 },
          // { date: "2023-10-10", description: "Payment Received", invoiceNo: "PMT-001", amount: -20, balance: invoice.total_amount + 30 },
        ];

  const currentBalance =
    finalStatementDetails.length > 0
      ? finalStatementDetails[finalStatementDetails.length - 1].balance
      : 0;

  const hasAgingData = !!invoice.agingData;

  return (
    <Page size="A4" style={styles.page}>
      {/* --- Static Header Content --- */}
      <View style={styles.header}>
        <View style={styles.companySection}>
          <Image src={GreenTargetLogo} style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{GREENTARGET_INFO.name}</Text>
            {/* Other company details... */}
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
      <Text style={styles.title}>Statement of Account</Text>
      {invoice.statement_period_start && invoice.statement_period_end && (
        <Text style={styles.statementPeriod}>
          {formatDate(invoice.statement_period_start)} to{" "}
          {formatDate(invoice.statement_period_end)}
        </Text>
      )}
      <View style={styles.customerInfo}>
        <Text style={styles.customerName}>
          {invoice.customer_name || "Customer"}
        </Text>
        {/* Other customer details... */}
        {invoice.customer_phone_number && (
          <Text style={styles.customerDetail}>
            Tel: {invoice.customer_phone_number}
          </Text>
        )}
        {invoice.additional_info && (
          <Text style={styles.customerDetail}>{invoice.additional_info}</Text>
        )}
      </View>
      {/* --- End Static Header Content --- */}

      {/* --- Main Content Area Wrapper --- */}
      <View style={styles.contentArea}>
        {/* --- Statement Table --- */}
        <View style={styles.statementTableContainer}>
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
            const displayDebit =
              item.amount !== 0 && isDebitItem
                ? formatCurrency(Math.abs(item.amount))
                : "";
            const displayCredit =
              item.amount !== 0 && !isDebitItem
                ? formatCurrency(Math.abs(item.amount))
                : "";
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
                <Text style={[styles.debitCol, styles.cellText]}>
                  {displayDebit}
                </Text>
                <Text style={[styles.creditCol, styles.cellText]}>
                  {displayCredit}
                </Text>
                <Text style={[styles.balanceCol, styles.cellText]}>
                  {formatCurrency(item.balance)}
                </Text>
              </View>
            );
          })}
        </View>
        {/* --- End Statement Table --- */}

        {/* --- Summary Section --- */}
        <View style={styles.simpleSummary}>
          <Text style={styles.summaryLabel}>Current Balance (MYR):</Text>
          <Text style={styles.summaryTotalValue}>
            {formatCurrency(currentBalance)}
          </Text>
        </View>
        {/* --- End Summary Section --- */}

        {/* --- Aging Section (Conditional) --- */}
        {hasAgingData && (
          <View style={styles.agingSection}>
            <View style={styles.agingTable}>
              {/* Aging Header */}
              <View style={styles.agingHeader}>
                <Text style={[styles.agingCell, styles.agingHeaderText]}>
                  Over 3 Months
                </Text>
                {/* Other aging headers... */}
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
              {/* Aging Row */}
              <View style={styles.agingRow}>
                <Text style={[styles.agingCell, styles.agingCellText]}>
                  {formatCurrency(invoice.agingData?.month3Plus)}
                </Text>
                {/* Other aging data... */}
                <Text style={[styles.agingCell, styles.agingCellText]}>
                  {formatCurrency(invoice.agingData?.month2)}
                </Text>
                <Text style={[styles.agingCell, styles.agingCellText]}>
                  {formatCurrency(invoice.agingData?.month1)}
                </Text>
                <Text style={[styles.agingCellLast, styles.agingCellText]}>
                  {formatCurrency(invoice.agingData?.current)}
                </Text>
              </View>
            </View>
          </View>
        )}
        {/* --- End Aging Section --- */}

        {/* --- Interest Rate Note --- */}
        <View style={styles.interestNoteContainer}>
          <Text style={styles.interestNoteText}>
            We reserve the rights to charge interest at the rate of 1.5% per
            month on overdue accounts.
          </Text>
        </View>
        {/* --- End Interest Rate Note --- */}

        {/* --- Payment and Info Section --- */}
        <View style={styles.paymentAndInfoSection}>
          {/* Column 1: Payment Instructions */}
          <View style={styles.footerColumn}>
            <Text style={styles.footerHeading}>Payment Instructions</Text>
            <View style={styles.paymentDetails}>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Account Name:</Text>
                <Text style={styles.paymentValue}>
                  Green Target Waste Treatment Industries S/B
                </Text>
              </View>
              {/* Other payment details... */}
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
          {/* Column 2: Information */}
          <View style={styles.footerColumn}>
            <Text style={styles.footerHeading}>Information</Text>
            <Text style={styles.noteText}>
              This statement reflects your account status as of{" "}
              {formatDate(invoice.statement_period_end || invoice.date_issued)}.
            </Text>
            <Text style={styles.noteText}>
              If you have already made a payment, please disregard this
              statement with our thanks.
            </Text>
          </View>
        </View>
        {/* --- End Payment and Info Section --- */}
      </View>
      {/* --- End Main Content Area Wrapper --- */}

      {/* --- Spacer View - Pushes Footer Down --- */}
      <View style={styles.spacer} />
      {/* --- End Spacer View --- */}

      {/* --- Fixed Footer Area --- */}
      <View style={styles.documentFooter}>
        <Text style={styles.footerText}>
          This is a computer-generated statement and requires no signature.
        </Text>
        <Text style={styles.footerText}>
          © {new Date().getFullYear()} Green Target Waste Treatment Industries
          S/B.
        </Text>
      </View>
      {/* --- End Fixed Footer Area --- */}
    </Page>
  );
};

export default GTStatementPDF;
