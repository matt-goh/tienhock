// src/utils/greenTarget/PDF/GTInvoicePDF.tsx
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
  infoColumns: {
    flexDirection: "row",
    marginTop: 6,
  },
  column: {
    flex: 1,
    paddingRight: 15,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
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
  classCol: {
    width: "8%",
  },
  itemNameCol: {
    width: "44%",
  },
  qtyCol: {
    width: "5%",
    textAlign: "center",
  },
  priceCol: {
    width: "11%",
    textAlign: "right",
  },
  subtotalCol: {
    width: "11%",
    textAlign: "right",
  },
  taxCol: {
    width: "10%",
    textAlign: "right",
  },
  totalCol: {
    width: "11%",
    textAlign: "right",
  },
  headerText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  cellText: {
    fontSize: 9,
  },
  summary: {
    alignItems: "flex-end",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  summaryLabel: {
    width: 160,
    textAlign: "right",
  },
  summaryValue: {
    width: 60,
    textAlign: "right",
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
  statusBanner: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    opacity: 0.8,
  },
  statusText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    textTransform: "uppercase",
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

// Generate a basic description based on invoice type and details
const generateDescription = (invoice: InvoiceGT): string => {
  if (invoice.type === "statement") {
    return `Statement of Account for the period ${formatDate(
      invoice.statement_period_start
    )} to ${formatDate(invoice.statement_period_end)}.`;
  }
  if (invoice.type === "regular" && invoice.rental_id) {
    let desc = `Rental Service Fee for Rental #${invoice.rental_id}`;
    if (invoice.tong_no) {
      desc += ` (Dumpster: ${invoice.tong_no})`;
    }
    if (invoice.date_placed) {
      desc += ` placed on ${formatDate(invoice.date_placed)}`;
    }
    if (invoice.date_picked) {
      desc += `, picked up on ${formatDate(invoice.date_picked)}`;
    }
    desc += ".";
    return desc;
  }
  return "Invoice for services rendered.";
};

interface GTInvoicePDFProps {
  invoice: InvoiceGT;
  qrCodeData?: string; // Allow passing in pre-generated QR code data
}

const GTInvoicePDF: React.FC<GTInvoicePDFProps> = ({ invoice, qrCodeData }) => {
  const description = generateDescription(invoice);
  const hasValidEInvoice =
    invoice.uuid && invoice.long_id && invoice.einvoice_status === "valid";
  const isConsolidated = invoice.is_consolidated;

  // Create order details for the table
  const orderDetails = [
    {
      description: description,
      qty: 1,
      price: invoice.amount_before_tax,
      total: invoice.amount_before_tax,
      tax: invoice.tax_amount,
    },
  ];

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
              Tel: {GREENTARGET_INFO.phone}
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

      {/* E-Invoice Title */}
      <Text style={styles.title}>
        {hasValidEInvoice
          ? isConsolidated
            ? "Consolidated e-Invoice"
            : "e-Invoice"
          : "Invoice"}
      </Text>

      {/* Key Invoice Details */}
      <View style={styles.invoiceDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Invoice No.</Text>
          <Text style={styles.detailValue}>{invoice.invoice_number}</Text>
        </View>
        {hasValidEInvoice && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Unique ID No.</Text>
            <Text style={styles.detailValue}>{invoice.uuid}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Invoice Date & Time</Text>
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
              <Text style={styles.infoValue}>
                {invoice.tin_number || "N/A"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer Name</Text>
              <Text style={styles.infoValue}>{invoice.customer_name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer Reg No.</Text>
              <Text style={styles.infoValue}>{invoice.id_number || "N/A"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer SST No.</Text>
              <Text style={styles.infoValue}>N/A</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Billing Address</Text>
              <Text style={styles.infoValue}>
                {invoice.location_address || "N/A"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Contact No.</Text>
              <Text style={styles.infoValue}>
                {invoice.customer_phone_number || "N/A"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>N/A</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Table */}
      <View style={styles.table}>
        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.classCol, styles.headerText]}>Class</Text>
          <Text style={[styles.itemNameCol, styles.headerText]}>
            Product Name
          </Text>
          <Text style={[styles.qtyCol, styles.headerText]}>Qty</Text>
          <Text style={[styles.priceCol, styles.headerText]}>U. Price</Text>
          <Text style={[styles.subtotalCol, styles.headerText]}>Subtotal</Text>
          <Text style={[styles.taxCol, styles.headerText]}>Tax</Text>
          <Text style={[styles.totalCol, styles.headerText]}>Total</Text>
        </View>

        {/* Table Rows */}
        {orderDetails && orderDetails.length > 0 ? (
          orderDetails.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.classCol, styles.cellText]}>022</Text>
              <Text style={[styles.itemNameCol, styles.cellText]}>
                {item.description}
              </Text>
              <Text style={[styles.qtyCol, styles.cellText]}>{item.qty}</Text>
              <Text style={[styles.priceCol, styles.cellText]}>
                {formatCurrency(item.price)}
              </Text>
              <Text style={[styles.subtotalCol, styles.cellText]}>
                {formatCurrency(item.price)}
              </Text>
              <Text style={[styles.taxCol, styles.cellText]}>
                {formatCurrency(item.tax || 0)}
              </Text>
              <Text style={[styles.totalCol, styles.cellText]}>
                {formatCurrency(Number(item.price) + Number(item.tax || 0))}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.tableRow}>
            <Text
              style={[
                styles.itemNameCol,
                styles.cellText,
                { textAlign: "center" },
              ]}
            >
              No item details available
            </Text>
            <Text style={[styles.qtyCol, styles.cellText]}></Text>
            <Text style={[styles.priceCol, styles.cellText]}></Text>
            <Text style={[styles.subtotalCol, styles.cellText]}></Text>
            <Text style={[styles.taxCol, styles.cellText]}></Text>
            <Text style={[styles.totalCol, styles.cellText]}></Text>
          </View>
        )}
      </View>

      {/* Summary Section */}
      <View style={styles.summary}>
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
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Incl. Tax (MYR)</Text>
          <Text style={styles.summaryValue}>
            {formatCurrency(invoice.total_amount)}
          </Text>
        </View>
        {invoice.amount_paid > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount Paid (MYR)</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(invoice.amount_paid)}
            </Text>
          </View>
        )}
        <View style={[styles.summaryRow, styles.bold]}>
          <Text style={styles.summaryLabel}>Balance Due (MYR)</Text>
          <Text style={styles.summaryValue}>
            {formatCurrency(invoice.current_balance)}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        {hasValidEInvoice
          ? "This document is computer generated e-Invoice."
          : "This is a computer generated invoice."}
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

export default GTInvoicePDF;
