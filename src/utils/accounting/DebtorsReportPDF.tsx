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
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.5,
  },
  companyHeader: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    textAlign: "left",
    letterSpacing: 0.5,
  },
  reportTitle: {
    fontSize: 12,
    fontFamily: "Helvetica",
    marginBottom: 25,
    textAlign: "left",
    color: "#333333",
    letterSpacing: 0.3,
  },
  salesmanSection: {
    marginBottom: 30,
  },
  salesmanHeader: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#000000",
    color: "#000000",
    letterSpacing: 0.3,
  },
  customerSection: {
    marginBottom: 25,
    marginLeft: 0,
  },
  customerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#CCCCCC",
  },
  customerNameBlock: {
    flex: 1,
  },
  customerName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#000000",
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  customerInfo: {
    fontSize: 9,
    color: "#555555",
    flexDirection: "row",
    gap: 15,
  },
  creditInfoBlock: {
    alignItems: "flex-end",
  },
  creditInfoRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
  },
  creditLabel: {
    fontSize: 9,
    color: "#666666",
  },
  creditValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#000000",
    minWidth: 70,
    textAlign: "right",
  },
  table: {
    display: "flex",
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F5F5F5",
    paddingVertical: 8,
    paddingHorizontal: 0,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#000000",
    borderTopWidth: 1,
    borderTopColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 0,
    fontSize: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E0E0E0",
  },
  // Column widths optimized for better space utilization
  colNo: { width: "6%", paddingLeft: 4, textAlign: "center" },
  colInvoiceNo: { width: "11%", paddingLeft: 4 },
  colDate: { width: "10%", paddingLeft: 4 },
  colAmount: { width: "13%", textAlign: "right", paddingRight: 8 },
  colPayMethod: { width: "10%", paddingLeft: 4, textAlign: "center" },
  colReference: { width: "14%", paddingLeft: 4 },
  colPayDate: { width: "10%", paddingLeft: 4 },
  colPaidAmount: { width: "13%", textAlign: "right", paddingRight: 8 },
  colBalance: { width: "13%", textAlign: "right", paddingRight: 4 },
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 0,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    backgroundColor: "#F8F8F8",
    borderTopWidth: 2,
    borderTopColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    marginTop: -0.5,
  },
  grandTotalSection: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 3,
    borderTopColor: "#000000",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: "#F0F0F0",
    borderWidth: 1,
    borderColor: "#000000",
  },
  grandTotalLabel: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#000000",
    letterSpacing: 0.5,
  },
  grandTotalItem: {
    alignItems: "center",
  },
  grandTotalTitle: {
    fontSize: 9,
    color: "#666666",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  grandTotalValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#000000",
  },
  pageNumber: {
    position: "absolute",
    fontSize: 9,
    bottom: 25,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#666666",
  },
  // New styles for better organization
  invoiceCell: {
    fontSize: 9,
  },
  dashedLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#CCCCCC",
    borderStyle: "dashed",
    marginVertical: 2,
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
                  <View style={styles.customerNameBlock}>
                    <Text style={styles.customerName}>
                      {customer.customer_id} -{" "}
                      {customer.customer_name || "UNNAMED"}
                    </Text>
                    <View style={styles.customerInfo}>
                      <Text>
                        {customer.invoices.length} Invoice
                        {customer.invoices.length !== 1 ? "s" : ""}
                      </Text>
                      {customer.phone_number && (
                        <Text>Tel: {customer.phone_number}</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.creditInfoBlock}>
                    <View style={styles.creditInfoRow}>
                      <Text style={styles.creditLabel}>Credit Limit:</Text>
                      <Text style={styles.creditValue}>
                        {formatCurrency(customer.credit_limit || 0)}
                      </Text>
                    </View>
                    <View style={styles.creditInfoRow}>
                      <Text style={styles.creditLabel}>Credit Bal:</Text>
                      <Text style={styles.creditValue}>
                        {formatCurrency(customer.credit_balance || 0)}
                      </Text>
                    </View>
                    <View style={styles.creditInfoRow}>
                      <Text style={styles.creditLabel}>As at:</Text>
                      <Text style={styles.creditValue}>{data.report_date}</Text>
                    </View>
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
