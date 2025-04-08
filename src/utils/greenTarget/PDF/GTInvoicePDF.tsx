import React from "react";
import { Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";
import { InvoiceGT } from "../../../types/types";
import { GREENTARGET_INFO } from "../../invoice/einvoice/companyInfo";
// Import the logo directly
import GreenTargetLogo from "../../GreenTargetLogo.png"; // Adjust path as necessary

// --- Font Registration (Recommended) ---
// If Helvetica isn't standard on your PDF generation environment (like a server),
// you might need to register font files. Example:
// Font.register({
//   family: 'Helvetica',
//   fonts: [
//     { src: '/path/to/helvetica.ttf' }, // Regular
//     { src: '/path/to/helvetica-bold.ttf', fontWeight: 'bold' }, // Bold
//     // Add italic, bold-italic if needed
//   ],
// });
// Ensure the font files are accessible where the PDF is generated.

interface GTInvoicePDFProps {
  invoice: InvoiceGT; // Expecting a single, detailed invoice object
}

// Color palette (remains the same)
const colors = {
  background: "#ffffff",
  header: {
    companyName: "#107C10", // Green Target Green
    companyDetails: "#334155",
  },
  text: {
    primary: "#111827",
    secondary: "#374151",
    bold: "#030712",
  },
  borders: {
    invoice: "#4CAF50", // Green Target Green
    table: "#D1D5DB", // Lighter gray
  },
  status: {
    paid: "#16A34A",
    unpaid: "#F59E0B",
    overdue: "#DC2626",
    cancelled: "#6B7280",
  },
};

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    padding: 30,
    fontFamily: "Helvetica", // Ensure this font is available or registered
    fontSize: 9,
    color: colors.text.primary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.borders.invoice,
  },
  companyInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 2,
  },
  logo: {
    width: 55,
    height: 55,
    marginRight: 12,
    objectFit: "contain", // Adjust how the image fits
  },
  companyText: {
    flex: 1,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.header.companyName,
    marginBottom: 3,
  },
  companyDetails: {
    fontSize: 9,
    lineHeight: 1.3,
    color: colors.header.companyDetails,
  },
  invoiceTitleSection: {
    flex: 1,
    textAlign: "right",
  },
  invoiceTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: colors.text.bold,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  invoiceNumber: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  invoiceDate: {
    fontSize: 9,
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    gap: 20, // Add gap between Bill To and Site Info
  },
  infoBox: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borders.table,
    borderRadius: 4,
    minHeight: 100, // Ensure boxes have some height
  },
  infoTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borders.table,
    textTransform: "uppercase",
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  infoLabel: {
    fontFamily: "Helvetica-Bold",
    width: "35%",
    marginRight: 5,
  },
  infoValue: {
    flex: 1,
    maxWidth: "65%", // Prevent long text overflow issues
  },
  // Style for the description section replacing the table
  descriptionSection: {
    marginTop: 20,
    marginBottom: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borders.table,
    borderRadius: 4,
    minHeight: 50, // Give it some space
  },
  descriptionTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
    fontSize: 10,
  },
  descriptionText: {
    fontSize: 9,
    lineHeight: 1.4,
  },
  // Summary styles remain similar
  summarySection: {
    marginTop: 15, // Adjusted margin
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  summaryBox: {
    width: "45%",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borders.table,
  },
  summaryLabel: {
    fontFamily: "Helvetica",
    textAlign: "right",
    flex: 1,
    paddingRight: 10,
  },
  summaryValue: {
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    minWidth: 80, // Ensure space for value
  },
  finalTotalRow: {
    backgroundColor: "#E5E7EB", // Slightly darker gray
    borderTopWidth: 1,
    borderTopColor: colors.borders.table,
  },
  notesSection: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borders.invoice,
    fontSize: 8,
    color: colors.text.secondary,
  },
  statusBanner: {
    position: "absolute",
    top: 10, // Adjust position as needed
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
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 15,
    left: 0,
    right: 30,
    textAlign: "right",
    color: colors.text.secondary,
  },
});

// Helper to format date (remains the same)
const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleDateString("en-GB", {
      // DD/MM/YYYY
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "Invalid Date";
  }
};

// Helper to format currency (remains the same)
const formatCurrency = (amount: number | string | null | undefined) => {
  const num = Number(amount);
  if (amount === null || amount === undefined || isNaN(num)) {
    return "0.00";
  }
  return num.toFixed(2);
};

// Get status styles (remains the same)
const getStatusStyle = (status: string | undefined, balance: number) => {
  if (status === "cancelled")
    return { backgroundColor: colors.status.cancelled };
  if (balance <= 0 && status !== "cancelled")
    return { backgroundColor: colors.status.paid }; // Check status isn't cancelled
  if (status === "overdue") return { backgroundColor: colors.status.overdue };
  return { backgroundColor: colors.status.unpaid }; // Default to unpaid
};

const getStatusText = (status: string | undefined, balance: number) => {
  if (status === "cancelled") return "Cancelled";
  if (balance <= 0 && status !== "cancelled") return "Paid";
  if (status === "overdue") return "Overdue";
  return "Unpaid";
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
  // Fallback generic description
  return "Invoice for services rendered.";
};

const GTInvoicePDF: React.FC<GTInvoicePDFProps> = ({ invoice }) => {
  const statusStyle = getStatusStyle(invoice.status, invoice.current_balance);
  const statusText = getStatusText(invoice.status, invoice.current_balance);
  const description = generateDescription(invoice);

  return (
    <Page size="A4" style={styles.page}>
      {/* Status Banner */}
      <View style={[styles.statusBanner, statusStyle]} fixed>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      {/* Header */}
      <View style={styles.header} fixed>
        <View style={styles.companyInfoContainer}>
          {/* Use the imported logo */}
          <Image src={GreenTargetLogo} style={styles.logo} />
          <View style={styles.companyText}>
            <Text style={styles.companyName}>{GREENTARGET_INFO.name}</Text>
            <Text style={styles.companyDetails}>
              {`Reg. No: ${GREENTARGET_INFO.reg_no} | TIN: ${GREENTARGET_INFO.tin}`}
            </Text>
            <Text style={styles.companyDetails}>
              {`${GREENTARGET_INFO.address_pdf}, ${GREENTARGET_INFO.postcode} ${GREENTARGET_INFO.city_pdf}, ${GREENTARGET_INFO.state_pdf}`}
            </Text>
            <Text
              style={styles.companyDetails}
            >{`Tel: ${GREENTARGET_INFO.phone} | Email: ${GREENTARGET_INFO.email}`}</Text>
          </View>
        </View>
        <View style={styles.invoiceTitleSection}>
          <Text style={styles.invoiceTitle}>
            {invoice.type === "statement" ? "Statement" : "Invoice"}
          </Text>
          <Text style={styles.invoiceNumber}>#{invoice.invoice_number}</Text>
          <Text style={styles.invoiceDate}>
            Date Issued: {formatDate(invoice.date_issued)}
          </Text>
          {invoice.type === "statement" && (
            <Text style={styles.invoiceDate}>
              Period: {formatDate(invoice.statement_period_start)} -{" "}
              {formatDate(invoice.statement_period_end)}
            </Text>
          )}
        </View>
      </View>

      {/* Info Section (remains the same) */}
      <View style={styles.infoSection}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Bill To</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Customer:</Text>
            <Text style={styles.infoValue}>{invoice.customer_name}</Text>
          </View>
          {invoice.customer_phone_number && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone:</Text>
              <Text style={styles.infoValue}>
                {invoice.customer_phone_number}
              </Text>
            </View>
          )}
          {(invoice.tin_number || invoice.id_number) && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ID:</Text>
              <Text style={styles.infoValue}>{`${
                invoice.tin_number ? `TIN: ${invoice.tin_number}` : ""
              }${invoice.tin_number && invoice.id_number ? " | " : ""}${
                invoice.id_number ? `Reg: ${invoice.id_number}` : ""
              }`}</Text>
            </View>
          )}
        </View>
        {/* Site/Rental Info Box (remains the same) */}
        {(invoice.location_address ||
          invoice.driver ||
          invoice.tong_no ||
          invoice.rental_id) && (
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Site / Rental Info</Text>
            {invoice.rental_id && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Rental ID:</Text>
                <Text style={styles.infoValue}>{invoice.rental_id}</Text>
              </View>
            )}
            {invoice.location_address && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Location:</Text>
                <Text style={styles.infoValue}>{invoice.location_address}</Text>
              </View>
            )}
            {invoice.location_phone_number && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Site Phone:</Text>
                <Text style={styles.infoValue}>
                  {invoice.location_phone_number}
                </Text>
              </View>
            )}
            {invoice.driver && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Driver:</Text>
                <Text style={styles.infoValue}>{invoice.driver}</Text>
              </View>
            )}
            {invoice.tong_no && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Dumpster:</Text>
                <Text style={styles.infoValue}>{invoice.tong_no}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ---- REMOVED Line Items Table ---- */}

      {/* ++++ NEW Description Section ++++ */}
      <View style={styles.descriptionSection}>
        <Text style={styles.descriptionTitle}>Description</Text>
        <Text style={styles.descriptionText}>{description}</Text>
      </View>
      {/* ++++ END Description Section ++++ */}

      {/* Summary Section (remains mostly the same) */}
      <View style={styles.summarySection}>
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal (RM):</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(invoice.amount_before_tax)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Tax (RM):</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(invoice.tax_amount)}
            </Text>
          </View>
          {/* Only show rounding if it's non-zero - Assuming 'rounding' field exists on InvoiceGT now */}
          {/* If 'rounding' is not on InvoiceGT, remove this section or calculate it */}
          {/* {Number(invoice.rounding || 0) !== 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Rounding (RM):</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(invoice.rounding)}
              </Text>
            </View>
          )} */}
          <View style={[styles.summaryRow, styles.finalTotalRow]}>
            <Text
              style={[styles.summaryLabel, { fontFamily: "Helvetica-Bold" }]}
            >
              Total Amount (RM):
            </Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(invoice.total_amount)}
            </Text>
          </View>
          {/* Show Amount Paid only if > 0 */}
          {Number(invoice.amount_paid) > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount Paid (RM):</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(invoice.amount_paid)}
              </Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text
              style={[styles.summaryLabel, { fontFamily: "Helvetica-Bold" }]}
            >
              Balance Due (RM):
            </Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(invoice.current_balance)}
            </Text>
          </View>
        </View>
      </View>

      {/* Notes/Footer (remains the same) */}
      <View style={styles.notesSection} fixed>
        <Text>Thank you for your business!</Text>
        <Text>Payment can be made via Bank Transfer to:</Text>
        <Text>Bank: [Your Bank Name Here]</Text>
        <Text>Account Name: GREEN TARGET WASTE TREATMENT IND. SDN BHD</Text>
        <Text>Account Number: [Your Account Number Here]</Text>
        {invoice.status === "cancelled" && invoice.cancellation_reason && (
          <Text style={{ marginTop: 5 }}>
            Reason for Cancellation: {invoice.cancellation_reason}
          </Text>
        )}
      </View>

      {/* Page Number (remains the same) */}
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        fixed
      />
    </Page>
  );
};

export default GTInvoicePDF;
