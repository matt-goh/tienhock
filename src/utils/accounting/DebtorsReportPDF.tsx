import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.4,
  },
  companyHeader: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textAlign: "left",
  },
  reportTitle: {
    fontSize: 11,
    fontFamily: "Helvetica",
    marginBottom: 20,
    textAlign: "left",
    color: "#4B5563",
  },
  salesmanSection: {
    marginBottom: 25,
  },
  salesmanHeader: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 15,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    color: "#111827",
  },
  customerSection: {
    marginBottom: 20,
    marginLeft: 10,
  },
  customerHeader: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E7EB",
  },
  customerName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
    marginBottom: 2,
  },
  customerInfo: {
    fontSize: 8,
    color: "#6B7280",
  },
  creditInfoBox: {
    flexDirection: "row",
    gap: 30,
    marginBottom: 10,
    backgroundColor: "#F9FAFB",
    padding: 8,
    borderRadius: 4,
  },
  creditInfoItem: {
    flexDirection: "row",
    gap: 5,
  },
  creditLabel: {
    fontSize: 8,
    color: "#6B7280",
  },
  creditValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
  },
  table: {
    display: "flex",
    marginBottom: 5,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#374151",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F3F4F6",
  },
  // Updated column widths to match DebtorsReportPage
  colNo: { width: "5%", paddingLeft: 2 },
  colInvoiceNo: { width: "12%", paddingLeft: 2 },
  colDate: { width: "10%", paddingLeft: 2 },
  colAmount: { width: "12%", textAlign: "right", paddingRight: 5 },
  colPayMethod: { width: "12%", paddingLeft: 2 },
  colReference: { width: "12%", paddingLeft: 2 },
  colPayDate: { width: "10%", paddingLeft: 2 },
  colPaidAmount: { width: "12%", textAlign: "right", paddingRight: 5 },
  colBalance: { width: "15%", textAlign: "right", paddingRight: 2 },
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginTop: -0.5,
  },
  grandTotalSection: {
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 2,
    borderTopColor: "#1F2937",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
  },
  grandTotalItem: {
    alignItems: "center",
  },
  grandTotalTitle: {
    fontSize: 8,
    color: "#6B7280",
    marginBottom: 2,
  },
  grandTotalValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
  },
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#9CA3AF",
  },
});

interface DebtorsReportPDFProps {
  data: any;
  companyName?: string;
}

const DebtorsReportPDF: React.FC<DebtorsReportPDFProps> = ({
  data,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
}) => {
  // Helper function to format currency
  const formatCurrency = (amount: number): string => {
    return `RM ${amount.toLocaleString("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Helper function to format date
  const formatDate = (dateString: string): string => {
    if (!dateString || dateString === "N/A") return "-";

    if (/^\d+$/.test(dateString)) {
      const date = new Date(parseInt(dateString, 10));
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }

    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Format payment method
  const formatPaymentMethod = (method: string): string => {
    if (!method) return "-";
    return method.charAt(0).toUpperCase() + method.slice(1);
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <Text style={styles.companyHeader}>{companyName}</Text>
        <Text style={styles.reportTitle}>
          Unpaid Bills by Salesman as at {data.report_date}
        </Text>

        {/* Salesmen Sections */}
        {data.salesmen.map((salesman: any, salesmanIndex: number) => (
          <View
            key={salesman.salesman_id}
            style={styles.salesmanSection}
            wrap={false}
            break={salesmanIndex > 0 && salesmanIndex % 2 === 0}
          >
            <Text style={styles.salesmanHeader}>
              {salesman.salesman_name} • {salesman.customers.length} Customer
              {salesman.customers.length !== 1 ? "s" : ""} • Total Outstanding:{" "}
              {formatCurrency(salesman.total_balance)}
            </Text>

            {/* Customers */}
            {salesman.customers.map((customer: any) => (
              <View
                key={customer.customer_id}
                style={styles.customerSection}
                wrap={false}
              >
                {/* Customer Header with Credit Info */}
                <View style={styles.customerHeader}>
                  <Text style={styles.customerName}>
                    {customer.customer_name || customer.customer_id}
                  </Text>
                  <Text style={styles.customerInfo}>
                    ID: {customer.customer_id} • {customer.invoices.length}{" "}
                    Invoice{customer.invoices.length !== 1 ? "s" : ""}
                    {customer.phone_number &&
                      ` • Tel: ${customer.phone_number}`}
                  </Text>
                </View>

                {/* Credit Info Box */}
                <View style={styles.creditInfoBox}>
                  <View style={styles.creditInfoItem}>
                    <Text style={styles.creditLabel}>Credit Limit:</Text>
                    <Text style={styles.creditValue}>
                      {formatCurrency(customer.credit_limit)}
                    </Text>
                  </View>
                  <View style={styles.creditInfoItem}>
                    <Text style={styles.creditLabel}>Credit Balance:</Text>
                    <Text style={styles.creditValue}>
                      {formatCurrency(customer.credit_balance)}
                    </Text>
                  </View>
                  <View style={styles.creditInfoItem}>
                    <Text style={styles.creditLabel}>Outstanding:</Text>
                    <Text style={[styles.creditValue, { color: "#DC2626" }]}>
                      {formatCurrency(customer.total_balance)}
                    </Text>
                  </View>
                </View>

                {/* Invoice Table */}
                <View style={styles.table}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <Text style={styles.colNo}>#</Text>
                    <Text style={styles.colInvoiceNo}>Invoice No.</Text>
                    <Text style={styles.colDate}>Date</Text>
                    <Text style={styles.colAmount}>Amount</Text>
                    <Text style={styles.colPayMethod}>Payment</Text>
                    <Text style={styles.colReference}>Reference</Text>
                    <Text style={styles.colPayDate}>Paid Date</Text>
                    <Text style={styles.colPaidAmount}>Paid Amount</Text>
                    <Text style={styles.colBalance}>Balance</Text>
                  </View>

                  {/* Invoice Rows */}
                  {customer.invoices.map((invoice: any, index: number) => {
                    if (invoice.payments.length === 0) {
                      return (
                        <View key={invoice.invoice_id} style={styles.tableRow}>
                          <Text style={styles.colNo}>{index + 1}</Text>
                          <Text style={styles.colInvoiceNo}>
                            {invoice.invoice_number}
                          </Text>
                          <Text style={styles.colDate}>
                            {formatDate(invoice.date)}
                          </Text>
                          <Text style={styles.colAmount}>
                            {formatCurrency(invoice.amount)}
                          </Text>
                          <Text style={styles.colPayMethod}>-</Text>
                          <Text style={styles.colReference}>-</Text>
                          <Text style={styles.colPayDate}>-</Text>
                          <Text style={styles.colPaidAmount}>-</Text>
                          <Text
                            style={[styles.colBalance, { color: "#DC2626" }]}
                          >
                            {formatCurrency(invoice.balance)}
                          </Text>
                        </View>
                      );
                    }

                    return invoice.payments.map(
                      (payment: any, payIndex: number) => (
                        <View
                          key={`${invoice.invoice_id}-${payment.payment_id}`}
                          style={styles.tableRow}
                        >
                          {payIndex === 0 ? (
                            <>
                              <Text style={styles.colNo}>{index + 1}</Text>
                              <Text style={styles.colInvoiceNo}>
                                {invoice.invoice_number}
                              </Text>
                              <Text style={styles.colDate}>
                                {formatDate(invoice.date)}
                              </Text>
                              <Text style={styles.colAmount}>
                                {formatCurrency(invoice.amount)}
                              </Text>
                            </>
                          ) : (
                            <>
                              <Text style={styles.colNo}></Text>
                              <Text style={styles.colInvoiceNo}></Text>
                              <Text style={styles.colDate}></Text>
                              <Text style={styles.colAmount}></Text>
                            </>
                          )}
                          <Text style={styles.colPayMethod}>
                            {formatPaymentMethod(payment.payment_method)}
                          </Text>
                          <Text style={styles.colReference}>
                            {payment.payment_reference || "-"}
                          </Text>
                          <Text style={styles.colPayDate}>
                            {formatDate(payment.date)}
                          </Text>
                          <Text
                            style={[styles.colPaidAmount, { color: "#059669" }]}
                          >
                            {formatCurrency(payment.amount)}
                          </Text>
                          {payIndex === 0 && (
                            <Text
                              style={[
                                styles.colBalance,
                                {
                                  color:
                                    invoice.balance > 0 ? "#DC2626" : "#059669",
                                },
                              ]}
                            >
                              {formatCurrency(invoice.balance)}
                            </Text>
                          )}
                          {payIndex > 0 && (
                            <Text style={styles.colBalance}></Text>
                          )}
                        </View>
                      )
                    );
                  })}

                  {/* Customer Subtotal */}
                  <View style={styles.subtotalRow}>
                    <Text
                      style={[styles.colNo, { fontFamily: "Helvetica" }]}
                    ></Text>
                    <Text style={[styles.colInvoiceNo, styles.colDate]}>
                      Subtotal
                    </Text>
                    <Text style={styles.colAmount}>
                      {formatCurrency(customer.total_amount)}
                    </Text>
                    <Text
                      style={[
                        styles.colPayMethod,
                        styles.colReference,
                        styles.colPayDate,
                      ]}
                    ></Text>
                    <Text style={[styles.colPaidAmount, { color: "#059669" }]}>
                      {formatCurrency(customer.total_paid)}
                    </Text>
                    <Text style={[styles.colBalance, { color: "#DC2626" }]}>
                      {formatCurrency(customer.total_balance)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))}

        {/* Grand Total */}
        <View style={styles.grandTotalSection}>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
            <View style={styles.grandTotalItem}>
              <Text style={styles.grandTotalTitle}>Total Amount</Text>
              <Text style={styles.grandTotalValue}>
                {formatCurrency(data.grand_total_amount)}
              </Text>
            </View>
            <View style={styles.grandTotalItem}>
              <Text style={styles.grandTotalTitle}>Total Paid</Text>
              <Text style={[styles.grandTotalValue, { color: "#059669" }]}>
                {formatCurrency(data.grand_total_paid)}
              </Text>
            </View>
            <View style={styles.grandTotalItem}>
              <Text style={styles.grandTotalTitle}>Total Outstanding</Text>
              <Text style={[styles.grandTotalValue, { color: "#DC2626" }]}>
                {formatCurrency(data.grand_total_balance)}
              </Text>
            </View>
          </View>
        </View>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
};

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
      // Print
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
          } finally {
            // Cleanup
            const cleanup = () => {
              window.removeEventListener("focus", cleanupFocus);
              if (document.body.contains(printFrame)) {
                document.body.removeChild(printFrame);
              }
              URL.revokeObjectURL(url);
            };

            const cleanupFocus = () => {
              setTimeout(cleanup, 100);
            };

            window.addEventListener("focus", cleanupFocus);
          }
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
