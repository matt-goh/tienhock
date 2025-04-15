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
  customerInfo: {
    marginBottom: 15,
    marginLeft: 5,
  },
  customerName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  customerDetail: {
    fontSize: 9,
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
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
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
  statementPeriod: {
    marginTop: 15,
    marginBottom: 15,
    padding: 6,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
  },
  table: {
    marginTop: 20,
    marginBottom: 20,
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
    width: "16%",
    textAlign: "right",
    paddingRight: 4,
  },
  headerText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  cellText: {
    fontSize: 9,
  },
  simpleSummary: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  summaryLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  summaryTotalValue: {
    width: 100,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginLeft: 10,
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
  // If no statement details are provided, create a sample one from the invoice itself
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
            description: "Statement of Account",
            invoiceNo: invoice.invoice_number,
            amount: invoice.amount_before_tax + (invoice.tax_amount || 0),
            balance: invoice.amount_before_tax + (invoice.tax_amount || 0),
          },
        ];

  return (
    <Page size="A4" style={styles.page}>
      {/* Header Section - Reused from GTInvoicePDF */}
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

      {/* Customer Information - New Section */}
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

      {/* Statement Period */}
      {invoice.statement_period_start && invoice.statement_period_end && (
        <Text style={styles.statementPeriod}>
          {formatDate(invoice.statement_period_start)} to{" "}
          {formatDate(invoice.statement_period_end)}
        </Text>
      )}

      {/* Statement Table */}
      <View style={styles.table}>
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
        {finalStatementDetails.map((item, index) => (
          <View
            key={index}
            style={[
              index === finalStatementDetails.length - 1
                ? styles.lastTableRow
                : styles.tableRow,
              index % 2 === 1 ? styles.evenRow : {},
            ]}
          >
            <Text style={[styles.dateCol, styles.cellText]}>
              {formatDate(item.date)}
            </Text>
            <Text style={[styles.referenceCol, styles.cellText]}>
              {item.invoiceNo}
            </Text>
            <Text style={[styles.descriptionCol, styles.cellText]}>
              {item.description}
            </Text>
            <Text style={[styles.debitCol, styles.cellText]}>
              {item.amount > 0 ? formatCurrency(item.amount) : ""}
            </Text>
            <Text style={[styles.creditCol, styles.cellText]}>
              {item.amount < 0 ? formatCurrency(Math.abs(item.amount)) : ""}
            </Text>
            <Text style={[styles.balanceCol, styles.cellText]}>
              {formatCurrency(item.balance)}
            </Text>
          </View>
        ))}
      </View>

      {/* Summary Section */}
      <View style={styles.simpleSummary}>
        <Text style={styles.summaryLabel}>Current Balance (MYR):</Text>
        <Text style={styles.summaryTotalValue}>
          {formatCurrency(invoice.total_amount)}
        </Text>
      </View>

      {/* Note Section */}
      <View style={styles.note}>
        <Text style={styles.noteTitle}>Note:</Text>
        <Text>
          This statement reflects your account status as of{" "}
          {formatDate(invoice.date_issued)}. Please remit payment promptly to
          avoid service interruptions. If you have already made a payment,
          please disregard this statement with our thanks.
        </Text>
      </View>

      {/* Payment Info */}
      <View style={{ marginTop: 10 }}>
        <Text style={styles.paymentTitle}>
          All payments are to be made payable to:
        </Text>
        <Text style={styles.paymentInfo}>
          Green Target Waste Treatment Industries S/B{"\n"}
          Public Bank Berhad{"\n"}
          3137836814
        </Text>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>This is a computer generated statement.</Text>
    </Page>
  );
};

export default GTStatementPDF;
