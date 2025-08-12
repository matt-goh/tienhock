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
    height: "100%", // Essential for flexGrow to work against page height
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

  // MODIFIED: Wrapper for the main variable content area
  contentArea: {
    flexGrow: 1, // Allow this area to expand vertically to fill space
    flexShrink: 0, // Prevent this area itself from shrinking
    flexDirection: "column", // Arrange children (table, summary, spacer, aging...) vertically
  },

  // Statement Table styles (now inside contentArea)
  statementTableContainer: {
    flexShrink: 0, // Prevent table block from shrinking
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
  referenceCol: { width: "12%", paddingLeft: 4 },
  descriptionCol: { width: "46%", paddingLeft: 4 },
  debitCol: { width: "10%", textAlign: "right", paddingRight: 4 },
  creditCol: { width: "10%", textAlign: "right", paddingRight: 4 },
  balanceCol: { width: "10%", textAlign: "right", paddingRight: 4 },
  headerText: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  cellText: { fontSize: 9 },

  // Summary Styles (now inside contentArea)
  simpleSummary: {
    flexDirection: "row",
    marginTop: 10,
    flexShrink: 0, // Prevent summary block from shrinking
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

  // Spacer View: Now INSIDE contentArea, sibling to summary, aging etc.
  spacer: {
    flexGrow: 1, // Takes up available vertical space WITHIN contentArea
    minHeight: 10, // Good for debugging if needed
    // backgroundColor: "rgba(0, 255, 0, 0.2)", // Optional debugging color
  },

  // Aging Section Styles (now inside contentArea)
  agingSection: {
    marginTop: 6, // Keep existing margin for spacing after spacer
    marginBottom: 10,
    flexShrink: 0, // Prevent aging block from shrinking
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
    marginTop: 6,
    marginBottom: 4,
    alignItems: "center",
    flexShrink: 0, // Prevent note block from shrinking
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
    flexShrink: 0, // Prevent payment info block from shrinking
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
  },

  // Document Footer: Sibling to header, title, customerInfo, contentArea
  documentFooter: {
    paddingTop: 12, // Space above footer text
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

// Generate description based on rental details for statements
const generateStatementDescription = (invoice: InvoiceGT): string[] => {
  // For invoices with rental details (both regular and statement types)
  if (invoice.rental_details && invoice.rental_details.length > 0) {
    // Group rentals by dumpster type (A or B)
    const groupedByType: { [key: string]: number } = {};
    
    invoice.rental_details.forEach(rental => {
      if (rental.tong_no) {
        const dumpsterNumber = rental.tong_no.trim();
        const type = dumpsterNumber.startsWith("B") ? "B" : "A";
        groupedByType[type] = (groupedByType[type] || 0) + 1;
      }
    });

    // Create descriptions for each type
    const descriptions: string[] = [];
    Object.entries(groupedByType).forEach(([type, quantity]) => {
      const desc = quantity === 1 
        ? `1x Rental Tong (${type})`
        : `${quantity}x Rental Tong (${type})`;
      descriptions.push(desc);
    });

    return descriptions;
  }
  
  // Fallback to legacy single rental fields for backward compatibility (only for regular invoices)
  if (invoice.type === "regular" && invoice.rental_id && invoice.tong_no) {
    const dumpsterNumber = invoice.tong_no.trim();
    const type = dumpsterNumber.startsWith("B") ? "B" : "A";
    return [`Rental Tong (${type})`];
  }

  // Default fallback for statement type or invoices without rental details
  if (invoice.type === "statement") {
    return ["Statement of Account"];
  }
  return ["Waste Management Service"];
};

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
  // Generate dynamic descriptions based on rental details
  const descriptions = generateStatementDescription(invoice);
  
  const finalStatementDetails =
    statementDetails.length > 0
      ? statementDetails
      : [
          {
            date: invoice.date_issued,
            description: "Balance Brought Forward",
            invoiceNo: "-",
            amount: 0,
            balance: 0,
          },
          {
            date: invoice.date_issued,
            description: descriptions.length === 1 
              ? `${descriptions[0]}` 
              : `${descriptions.join(", ")}`,
            invoiceNo: invoice.invoice_number,
            amount: invoice.total_amount,
            balance: invoice.total_amount,
          }
        ];

  const currentBalance =
    finalStatementDetails.length > 0
      ? finalStatementDetails[finalStatementDetails.length - 1].balance
      : 0;

  const hasAgingData = !!invoice.agingData;

  return (
    // Page is the main flex container (column)
    <Page size="A4" style={styles.page}>
      {/* --- Static Header Content (flexShrink: 0) --- */}
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

      {/* --- Main Content Area Wrapper (flexGrow: 1, flexDirection: 'column') --- */}
      {/* This area expands vertically between header and footer */}
      <View style={styles.contentArea}>
        {/* --- Statement Table (flexShrink: 0) --- */}
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

        {/* --- Spacer View (flexGrow: 1) --- */}
        {/* Takes up space WITHIN contentArea, pushing subsequent items down */}
        <View style={styles.spacer} />
        {/* --- End Spacer View --- */}

        {/* --- Interest Rate Note --- */}
        <View style={styles.interestNoteContainer}>
          <Text style={styles.interestNoteText}>
            We reserve the rights to charge interest at the rate of 1.5% per
            month on overdue accounts.
          </Text>
        </View>
        {/* --- End Interest Rate Note --- */}

        {/* --- Aging Section --- */}
        {/* This section and below are pushed down by the spacer */}
        {hasAgingData && (
          <View style={styles.agingSection}>
            <View style={styles.agingTable}>
              {/* Aging Header */}
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
              {/* Aging Row */}
              <View style={styles.agingRow}>
                <Text style={[styles.agingCell, styles.agingCellText]}>
                  {formatCurrency(invoice.agingData?.month3Plus)}
                </Text>
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

        {/* --- Payment and Info Section --- */}
        <View style={styles.paymentAndInfoSection}>
          {/* Column 1: Payment Instructions */}
          <View style={styles.footerColumn}>
            <Text style={styles.footerHeading}>Payment</Text>
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

      {/* --- Fixed Footer Area (flexShrink: 0) --- */}
      {/* Sits below the contentArea */}
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
