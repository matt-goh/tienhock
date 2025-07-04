import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

// A refined color palette focusing on text and borders for a classic report look
const colors = {
  textPrimary: "#0f172a", // Dark Slate
  textSecondary: "#475569", // Medium Slate
  textMuted: "#64748b", // Light Slate
  borderDark: "#334155",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  success: "#166534", // Dark Green
  danger: "#b91c1c", // Dark Red
};

// Styles re-architected for hierarchy without background colors
const styles = StyleSheet.create({
  // Page and Document Structure
  page: {
    paddingTop: 35,
    paddingBottom: 40,
    paddingHorizontal: 35,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: colors.textPrimary,
  },
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.textMuted,
  },

  // Report Header
  reportHeader: {
    marginBottom: 25,
  },
  companyName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  reportTitle: {
    fontSize: 12,
    fontFamily: "Helvetica",
    color: colors.textSecondary,
  },

  // Salesman Section
  salesmanSection: {
    marginBottom: 25,
  },
  salesmanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.borderDark,
    marginBottom: 15,
  },
  salesmanName: {
    color: colors.textPrimary,
  },
  salesmanTotal: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: colors.textSecondary,
  },

  // Customer Section
  customerSection: {
    marginBottom: 20,
    paddingLeft: 5, // A subtle indent for customers
  },
  customerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 8,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  customerInfo: {
    flex: 1,
    paddingRight: 10,
  },
  customerNameText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  customerMetaText: {
    fontSize: 9,
    color: colors.textMuted,
  },
  customerCreditInfo: {
    flexShrink: 0,
    width: "35%",
  },
  creditRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
    fontSize: 9,
  },
  creditLabel: {
    color: colors.textMuted,
  },
  creditValue: {
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },

  // Invoice Table
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderDark,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
    color: colors.textSecondary,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },

  // Table Column Widths
  colNo: { width: "5%" },
  colInvoiceNo: { width: "12%" },
  colDate: { width: "10%" },
  colAmount: { width: "12%", textAlign: "right", paddingRight: 4 },
  colPayMethod: { width: "10%", textAlign: "center" },
  colReference: { width: "15%" },
  colPayDate: { width: "10%" },
  colPaidAmount: { width: "13%", textAlign: "right", paddingRight: 4 },
  colBalance: { width: "13%", textAlign: "right", paddingRight: 4 },

  bold: { fontFamily: "Helvetica-Bold" },

  // Subtotal and Grand Total
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    borderTopWidth: 1.5,
    borderTopColor: colors.borderDark,
    marginTop: -0.5, // Overlap the last row's border
    marginBottom: 10,
  },
  grandTotalSection: {
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 2,
    borderTopColor: colors.textPrimary,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.textSecondary,
  },
  grandTotalValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
});

// --- Helper Functions ---

const formatCurrency = (amount: number): string => {
  if (amount === 0) return "0.00";
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (dateString: string): string => {
  if (!dateString || dateString === "N/A") return "-";
  try {
    const date = new Date(
      /^\d+$/.test(dateString) ? parseInt(dateString, 10) : dateString
    );
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (e) {
    return "-";
  }
};

const formatPaymentMethod = (method: string): string => {
  if (!method) return "-";
  return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
};

// --- PDF Components ---

const InvoiceRow = ({ invoice, index }: { invoice: any; index: number }) => (
  <>
    <View style={styles.tableRow} wrap={false}>
      <Text style={styles.colNo}>{index + 1}</Text>
      <Text style={styles.colInvoiceNo}>{invoice.invoice_number}</Text>
      <Text style={styles.colDate}>{formatDate(invoice.date)}</Text>
      <Text style={styles.colAmount}>{formatCurrency(invoice.amount)}</Text>
      <Text style={styles.colPayMethod}>
        {formatPaymentMethod(invoice.payments[0]?.payment_method)}
      </Text>
      <Text style={styles.colReference}>
        {invoice.payments[0]?.payment_reference || "-"}
      </Text>
      <Text style={styles.colPayDate}>
        {formatDate(invoice.payments[0]?.date)}
      </Text>
      <Text style={[styles.colPaidAmount, { color: colors.success }]}>
        {invoice.payments[0] ? formatCurrency(invoice.payments[0].amount) : "-"}
      </Text>
      <Text
        style={[
          styles.colBalance,
          styles.bold,
          { color: invoice.balance > 0 ? colors.danger : colors.success },
        ]}
      >
        {formatCurrency(invoice.balance)}
      </Text>
    </View>
    {invoice.payments.slice(1).map((payment: any) => (
      <View key={payment.payment_id} style={styles.tableRow} wrap={false}>
        <Text style={styles.colNo}></Text>
        <Text style={styles.colInvoiceNo}></Text>
        <Text style={styles.colDate}></Text>
        <Text style={styles.colAmount}></Text>
        <Text style={styles.colPayMethod}>
          {formatPaymentMethod(payment.payment_method)}
        </Text>
        <Text style={styles.colReference}>
          {payment.payment_reference || "-"}
        </Text>
        <Text style={styles.colPayDate}>{formatDate(payment.date)}</Text>
        <Text style={[styles.colPaidAmount, { color: colors.success }]}>
          {formatCurrency(payment.amount)}
        </Text>
        <Text style={styles.colBalance}></Text>
      </View>
    ))}
  </>
);

const CustomerSection = ({
  customer,
  reportDate,
}: {
  customer: any;
  reportDate: string;
}) => (
  <View style={styles.customerSection} wrap={false}>
    <View style={styles.customerHeader}>
      <View style={styles.customerInfo}>
        <Text style={styles.customerNameText}>
          {customer.customer_id} -{" "}
          {customer.customer_name || "UNNAMED CUSTOMER"}
        </Text>
        <Text style={styles.customerMetaText}>
          {customer.invoices.length} Invoice
          {customer.invoices.length !== 1 ? "s" : ""}
          {customer.phone_number && `  •  Tel: ${customer.phone_number}`}
        </Text>
      </View>
      <View style={styles.customerCreditInfo}>
        <View style={styles.creditRow}>
          <Text style={styles.creditLabel}>Credit Limit:</Text>
          <Text style={styles.creditValue}>
            {formatCurrency(customer.credit_limit || 0)}
          </Text>
        </View>
        <View style={styles.creditRow}>
          <Text style={styles.creditLabel}>Outstanding:</Text>
          <Text style={[styles.creditValue, { color: colors.danger }]}>
            {formatCurrency(customer.credit_balance || 0)}
          </Text>
        </View>
        <View style={styles.creditRow}>
          <Text style={styles.creditLabel}>As at:</Text>
          <Text style={styles.creditValue}>{reportDate}</Text>
        </View>
      </View>
    </View>
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={styles.colNo}>#</Text>
        <Text style={styles.colInvoiceNo}>Invoice No.</Text>
        <Text style={styles.colDate}>Date</Text>
        <Text style={styles.colAmount}>Amount</Text>
        <Text style={styles.colPayMethod}>Payment</Text>
        <Text style={styles.colReference}>Reference</Text>
        <Text style={styles.colPayDate}>Paid Date</Text>
        <Text style={styles.colPaidAmount}>Paid</Text>
        <Text style={styles.colBalance}>Balance</Text>
      </View>
      {customer.invoices.map((invoice: any, index: number) => (
        <InvoiceRow key={invoice.invoice_id} invoice={invoice} index={index} />
      ))}
    </View>
    <View style={styles.subtotalRow}>
      <Text style={{ flex: 1, paddingLeft: 4 }}>
        Subtotal for {customer.customer_id}
      </Text>
      <Text style={[styles.colAmount, { flexShrink: 0 }]}>
        {formatCurrency(customer.total_amount)}
      </Text>
      <Text
        style={{
          width:
            styles.colPayMethod.width +
            styles.colReference.width +
            styles.colPayDate.width,
          flexShrink: 0,
        }}
      ></Text>
      <Text
        style={[styles.colPaidAmount, { color: colors.success, flexShrink: 0 }]}
      >
        {formatCurrency(customer.total_paid)}
      </Text>
      <Text
        style={[styles.colBalance, { color: colors.danger, flexShrink: 0 }]}
      >
        {formatCurrency(customer.total_balance)}
      </Text>
    </View>
  </View>
);

const DebtorsReportPDF: React.FC<{ data: any; companyName?: string }> = ({
  data,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
}) => {
  return (
    <Document title={`Tien Hock Debtors Report ${data.report_date}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.reportHeader}>
          <Text style={styles.companyName}>{companyName}</Text>
          <Text style={styles.reportTitle}>
            Unpaid Bills by Salesman as at {data.report_date}
          </Text>
        </View>
        {data.salesmen.map((salesman: any, index: number) => (
          <View
            key={salesman.salesman_id}
            style={styles.salesmanSection}
            break={index > 0}
          >
            <View style={styles.salesmanHeader}>
              <Text style={styles.salesmanName}>{salesman.salesman_name}</Text>
              <Text style={styles.salesmanTotal}>
                Total Outstanding: {formatCurrency(salesman.total_balance)}
              </Text>
            </View>
            {salesman.customers.map((customer: any) => (
              <CustomerSection
                key={customer.customer_id}
                customer={customer}
                reportDate={data.report_date}
              />
            ))}
          </View>
        ))}
        <View style={styles.grandTotalSection} break>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Grand Total Amount</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(data.grand_total_amount)}
            </Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Grand Total Paid</Text>
            <Text style={[styles.grandTotalValue, { color: colors.success }]}>
              {formatCurrency(data.grand_total_paid)}
            </Text>
          </View>
          <View style={[styles.grandTotalRow, { marginTop: 4 }]}>
            <Text
              style={[
                styles.grandTotalLabel,
                { fontSize: 14, color: colors.textPrimary },
              ]}
            >
              TOTAL OUTSTANDING
            </Text>
            <Text
              style={[
                styles.grandTotalValue,
                { fontSize: 14, color: colors.danger },
              ]}
            >
              {formatCurrency(data.grand_total_balance)}
            </Text>
          </View>
        </View>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
};

// --- PDF Generation Function ---

export const generateDebtorsReportPDF = async (
  data: any,
  action: "download" | "print"
) => {
  try {
    const doc = <DebtorsReportPDF data={data} />;
    const pdfBlob = await pdf(doc).toBlob();
    if (action === "download") {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Debtors_Report_${data.report_date.replace(
        /\//g,
        "_"
      )}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const url = URL.createObjectURL(pdfBlob);
      const printFrame = document.createElement("iframe");
      printFrame.style.display = "none";
      document.body.appendChild(printFrame);
      printFrame.onload = () => {
        if (printFrame.contentWindow) {
          try {
            printFrame.contentWindow.print();
          } catch (e) {
            console.error("Print failed:", e);
          }
          const cleanup = () => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
            URL.revokeObjectURL(url);
            window.removeEventListener("focus", cleanup);
          };
          window.addEventListener("focus", cleanup, { once: true });
        }
      };
      printFrame.src = url;
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

export default DebtorsReportPDF;
