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
  qrCode: {
    width: 70,
    height: 70,
    alignSelf: "flex-start",
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
    marginTop: 10,
    marginBottom: 5,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  table: {
    marginTop: 10,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 4,
    backgroundColor: "#f3f4f6",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#d1d5db",
    paddingVertical: 4,
  },
  evenRow: {
    backgroundColor: "#f9fafb",
  },
  dateCol: {
    width: "15%",
    paddingLeft: 4,
  },
  descriptionCol: {
    width: "45%",
    paddingLeft: 4,
  },
  invoiceNoCol: {
    width: "15%",
    paddingLeft: 4,
  },
  amountCol: {
    width: "12.5%",
    textAlign: "right",
    paddingRight: 4,
  },
  balanceCol: {
    width: "12.5%",
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
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  summaryLeftCol: {
    flex: 1,
    paddingRight: 20,
  },
  summaryRightCol: {
    alignItems: "flex-end",
    paddingLeft: 20,
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
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  summaryLabel: {
    width: 160,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  summaryValue: {
    width: 60,
    textAlign: "right",
  },
  summaryTotal: {
    fontFamily: "Helvetica-Bold",
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: "#000",
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
  qrCodeData,
  statementDetails = [],
}) => {
  const hasValidEInvoice =
    invoice.uuid && invoice.long_id && invoice.einvoice_status === "valid";

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
        {hasValidEInvoice && qrCodeData && (
          <Image src={qrCodeData} style={styles.qrCode} />
        )}
      </View>

      {/* Statement Title */}
      <Text style={styles.title}>
        {hasValidEInvoice
          ? "Statement of Account (e-Invoice)"
          : "Statement of Account"}
      </Text>

      {/* Key Statement Details */}
      <View style={styles.invoiceDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Statement No.</Text>
          <Text style={styles.detailValue}>{invoice.invoice_number}</Text>
        </View>
        {hasValidEInvoice && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Unique ID No.</Text>
            <Text style={styles.detailValue}>{invoice.uuid}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Statement Date</Text>
          <Text style={styles.detailValue}>
            {formatDate(invoice.date_issued)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Currency</Text>
          <Text style={styles.detailValue}>MYR</Text>
        </View>
      </View>

      {/* FROM and BILLING TO Containers */}
      <View style={styles.infoContainer}>
        {/* FROM Container */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>FROM</Text>
          <View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier TIN</Text>
              <Text style={styles.infoValue}>{GREENTARGET_INFO.tin}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier Name</Text>
              <Text style={styles.infoValue}>{GREENTARGET_INFO.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier BRN:</Text>
              <Text style={styles.infoValue}>{GREENTARGET_INFO.reg_no}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier SST No.</Text>
              <Text style={styles.infoValue}>
                {GREENTARGET_INFO.sst_id_pdf || "N/A"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Billing Address</Text>
              <Text style={styles.infoValue}>
                {GREENTARGET_INFO.address_pdf}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Contact No.</Text>
              <Text style={styles.infoValue}>{GREENTARGET_INFO.phone}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{GREENTARGET_INFO.email}</Text>
            </View>
          </View>
        </View>

        {/* BILLING TO Container */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>BILLING TO</Text>
          <View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer TIN</Text>
              <Text style={styles.infoValue}>{invoice.tin_number || "-"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer Name</Text>
              <Text style={styles.infoValue}>
                {invoice.customer_name || "Customer"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer Reg No.</Text>
              <Text style={styles.infoValue}>{invoice.id_number || "-"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer SST No.</Text>
              <Text style={styles.infoValue}>-</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Billing Address</Text>
              <Text style={styles.infoValue}>
                {invoice.location_address || "-"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Contact No.</Text>
              <Text style={styles.infoValue}>
                {invoice.customer_phone_number || "-"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>-</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Statement Period */}
      {invoice.statement_period_start && invoice.statement_period_end && (
        <Text style={styles.statementPeriod}>
          Statement Period: {formatDate(invoice.statement_period_start)} to{" "}
          {formatDate(invoice.statement_period_end)}
        </Text>
      )}

      {/* Statement Table */}
      <View style={styles.table}>
        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.dateCol, styles.headerText]}>Date</Text>
          <Text style={[styles.descriptionCol, styles.headerText]}>
            Description
          </Text>
          <Text style={[styles.invoiceNoCol, styles.headerText]}>
            Invoice No.
          </Text>
          <Text style={[styles.amountCol, styles.headerText]}>Amount</Text>
          <Text style={[styles.balanceCol, styles.headerText]}>Balance</Text>
        </View>

        {/* Table Rows */}
        {finalStatementDetails.map((item, index) => (
          <View
            key={index}
            style={[styles.tableRow, index % 2 === 1 ? styles.evenRow : {}]}
          >
            <Text style={[styles.dateCol, styles.cellText]}>
              {formatDate(item.date)}
            </Text>
            <Text style={[styles.descriptionCol, styles.cellText]}>
              {item.description}
            </Text>
            <Text style={[styles.invoiceNoCol, styles.cellText]}>
              {item.invoiceNo}
            </Text>
            <Text style={[styles.amountCol, styles.cellText]}>
              {formatCurrency(item.amount)}
            </Text>
            <Text style={[styles.balanceCol, styles.cellText]}>
              {formatCurrency(item.balance)}
            </Text>
          </View>
        ))}
      </View>

      {/* Summary Section */}
      <View style={styles.summary}>
        {/* Payment Info - Left column */}
        <View style={styles.summaryLeftCol}>
          <Text style={styles.paymentTitle}>
            All payments are to be made payable to:
          </Text>
          <Text style={styles.paymentInfo}>
            Green Target Waste Treatment Industries S/B{"\n"}
            Public Bank Berhad{"\n"}
            3137836814
          </Text>
        </View>

        {/* Summary info - Right column */}
        <View style={styles.summaryRightCol}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Excl. Tax (MYR)</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(invoice.amount_before_tax)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax Amount (MYR)</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(invoice.tax_amount)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryLabel}>Current Balance (MYR)</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(invoice.total_amount)}
            </Text>
          </View>
        </View>
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

      {/* Footer */}
      <Text style={styles.footer}>
        {hasValidEInvoice
          ? "This document is a computer generated e-Invoice statement."
          : "This is a computer generated statement."}
        {hasValidEInvoice && invoice.datetime_validated && (
          <>
            {"\n"}
            Validated on {new Date(invoice.datetime_validated).toLocaleString()}
          </>
        )}
      </Text>
    </Page>
  );
};

export default GTStatementPDF;
