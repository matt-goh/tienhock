import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  PDFViewer,
  Image,
} from "@react-pdf/renderer";
import { InvoiceData, OrderDetail } from "../../types/types";

const ROWS_PER_PAGE = 28;
const HEADER_ROWS = 3;
const TABLE_HEADER_ROWS = 3;

// Color palette for easy customization
const colors = {
  background: "#ffffff",
  header: {
    background: "#F3F4F6",
    companyName: "#1e293b",
    companyDetails: "#334155",
  },
  table: {
    headerBackground: "#F3F4F6",
    border: "#D1D5DB",
    borderDark: "#D1D5DB",
  },
  text: {
    primary: "#111827",
    secondary: "#374151",
    bold: "#030712",
  },
  borders: {
    invoice: "#27272A",
  },
};

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    backgroundColor: colors.background,
  },
  headerContainer: {
    backgroundColor: colors.header.background,
    borderRadius: 6,
    padding: 15,
    marginBottom: 15,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 15,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.header.companyName,
  },
  companyDetails: {
    fontSize: 10,
    marginTop: 4,
    color: colors.header.companyDetails,
    lineHeight: 1,
  },
  invoice: {
    marginBottom: 12,
    borderBottom: `1pt solid ${colors.borders.invoice}`,
    paddingBottom: 8,
  },
  table: {
    width: "100%",
    marginBottom: 15,
  },
  tableContent: {
    border: `1pt solid ${colors.table.border}`,
    paddingBottom: 7,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.table.borderDark,
    borderBottomStyle: "solid",
    minHeight: 24,
    alignItems: "center",
  },
  invoiceInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  tableHeader: {
    backgroundColor: colors.table.headerBackground,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.table.border,
  },
  tableCell: {
    padding: "6 8",
  },
  infoCell: {
    padding: "3 8",
  },
  customerInfo: {
    fontSize: 10,
    color: colors.text.primary,
    fontFamily: "Helvetica",
  },
  customerLabel: {
    color: colors.text.secondary,
    marginRight: 5,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  descriptionCell: {
    width: "45%",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  focCell: {
    width: "10%",
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  returnCell: {
    width: "10%",
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  qtyCell: {
    width: "10%",
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  priceCell: {
    width: "12%",
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  amountCell: {
    width: "13%",
    textAlign: "right",
  },
  infoLeftCell: {
    width: "65%",
  },
  infoRightCell: {
    width: "35%",
    textAlign: "right",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  infoLeftSection: {
    width: "65%",
  },
  infoRightSection: {
    width: "35%",
    alignItems: "flex-end",
  },
  infoRightContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 8,
    paddingRight: 8,
  },
  summary: {},
  summaryTitle: {
    paddingBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 10,
    color: colors.text.primary,
  },
  grandTotal: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.text.primary,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
    color: colors.text.bold,
  },
  logo: {
    width: 45,
    height: 45,
    marginTop: 2,
  },
  headerTextContainer: {
    flex: 1,
  },
  subtotalRow: {
    backgroundColor: colors.table.headerBackground,
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.table.borderDark,
    borderBottomStyle: "solid",
    minHeight: 24,
    alignItems: "center",
  },
  subtotalText: {
    padding: "6 8",
    width: "45%",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
    fontFamily: "Helvetica-Bold",
  },
});

interface InvoicePDFProps {
  invoices: InvoiceData[];
}

const InvoisPDF: React.FC<InvoicePDFProps> = ({ invoices }) => {
  const getProcessedOrderDetails = (details: OrderDetail[]) => {
    const regularDetails = new Map<
      string,
      {
        detail: OrderDetail;
        foc: number;
        returned: number;
      }
    >();
    const specialRows: OrderDetail[] = [];

    // Keep track of order
    const orderedRows: OrderDetail[] = [];

    details.forEach((detail) => {
      if (detail.isless || detail.istax) {
        // Check if it's a subtotal row
        const isSubtotalRow = detail.code?.toLowerCase()?.includes("subtotal");

        const specialRow = {
          ...detail,
          productname: `${detail.productname}${
            isSubtotalRow ? " Subtotal" : ""
          } (${detail.isless ? "Less" : "Tax"})`,
          issubtotal: isSubtotalRow,
        };
        specialRows.push(specialRow);
        return;
      }

      const key = `${detail.code}-${detail.productname}`;
      if (!regularDetails.has(key)) {
        regularDetails.set(key, {
          detail: { ...detail, isfoc: false, isreturned: false },
          foc: 0,
          returned: 0,
        });
      }

      const item = regularDetails.get(key)!;
      if (detail.isfoc) {
        item.foc += Math.round(detail.qty);
      } else if (detail.isreturned) {
        item.returned += Math.round(detail.qty);
      } else {
        item.detail = { ...detail, qty: Math.round(detail.qty) };
      }
    });

    // First, add regular items
    const regularItems = Array.from(regularDetails.values());
    orderedRows.push(...regularItems.map((item) => item.detail));

    // Then add special rows in their original order
    orderedRows.push(...specialRows);

    return {
      regularItems: regularItems,
      specialRows: specialRows,
    };
  };

  const calculateInvoiceRows = (invoice: InvoiceData) => {
    const { regularItems, specialRows } = getProcessedOrderDetails(
      invoice.orderDetails
    );
    return TABLE_HEADER_ROWS + regularItems.length + specialRows.length + 1;
  };

  const paginateInvoices = (invoices: InvoiceData[]) => {
    const pages: InvoiceData[][] = [];
    let currentPage: InvoiceData[] = [];
    let currentPageRows = HEADER_ROWS;

    invoices.forEach((invoice) => {
      const invoiceRows = calculateInvoiceRows(invoice);

      if (currentPageRows + invoiceRows > ROWS_PER_PAGE) {
        if (currentPage.length > 0) {
          pages.push(currentPage);
          currentPage = [];
          currentPageRows = HEADER_ROWS;
        }
      }

      currentPage.push(invoice);
      currentPageRows += invoiceRows;
    });

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    return pages;
  };

  const renderTableRow = (
    detail: OrderDetail & { issubtotal?: boolean },
    foc: number = 0,
    returned: number = 0,
    isSpecialRow: boolean = false
  ) => (
    <View style={detail.issubtotal ? styles.subtotalRow : styles.tableRow}>
      <Text
        style={
          detail.issubtotal
            ? styles.subtotalText
            : [styles.tableCell, styles.descriptionCell]
        }
      >
        {detail.productname}
      </Text>
      <Text style={[styles.tableCell, styles.focCell]}>
        {!isSpecialRow && !detail.issubtotal ? foc || "" : ""}
      </Text>
      <Text style={[styles.tableCell, styles.returnCell]}>
        {!isSpecialRow && !detail.issubtotal ? returned || "" : ""}
      </Text>
      <Text style={[styles.tableCell, styles.qtyCell]}>
        {!isSpecialRow && !detail.issubtotal ? Math.round(detail.qty) : ""}
      </Text>
      <Text style={[styles.tableCell, styles.priceCell]}>
        {!isSpecialRow && !detail.issubtotal
          ? Number(detail.price).toFixed(2)
          : ""}
      </Text>
      <Text style={[styles.tableCell, styles.amountCell]}>
        {Number(detail.total).toFixed(2)}
      </Text>
    </View>
  );

  const pages = paginateInvoices(invoices);

  const totals = invoices.reduce(
    (acc, invoice) => {
      if (invoice.type === "C") {
        acc.cashTotal += parseFloat(invoice.totalAmount);
        acc.cashCount++;
      } else {
        acc.invoiceTotal += parseFloat(invoice.totalAmount);
        acc.invoiceCount++;
      }
      return acc;
    },
    { cashTotal: 0, invoiceTotal: 0, cashCount: 0, invoiceCount: 0 }
  );

  const renderInvoiceInfoRows = (invoice: InvoiceData) => (
    <>
      <View style={styles.infoRow}>
        <View style={styles.infoLeftSection}>
          <Text style={styles.customerInfo}>
            <Text style={styles.customerLabel}>Customer: </Text>
            {invoice.customername}
          </Text>
        </View>
        <View style={styles.infoRightSection}>
          <View style={styles.infoRightContainer}>
            <Text style={[styles.customerInfo]}>
              <Text style={styles.customerLabel}>Type: </Text>
              {invoice.type === "C" ? "Cash" : "Invoice"}
            </Text>
            <Text style={styles.customerInfo}>
              <Text style={styles.customerLabel}>Invoice No: </Text>
              {invoice.invoiceno}
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.infoRow, { marginBottom: 10 }]}>
        <View style={styles.infoLeftSection}>
          <Text style={styles.customerInfo}>
            <Text style={styles.customerLabel}>Salesman: </Text>
            {invoice.salesman}
          </Text>
        </View>
        <View style={styles.infoRightSection}>
          <View style={styles.infoRightContainer}>
            <Text style={[styles.customerInfo]}>
              <Text style={styles.customerLabel}>Time: </Text>
              {invoice.time}
            </Text>
            <Text style={styles.customerInfo}>
              <Text style={styles.customerLabel}>Date: </Text>
              {invoice.date}
            </Text>
          </View>
        </View>
      </View>
    </>
  );

  return (
    <PDFViewer style={{ width: "100%", height: "100%" }}>
      <Document>
        {pages.map((pageInvoices, pageIndex) => (
          <Page key={pageIndex} size="A4" style={styles.page}>
            {pageIndex === 0 && (
              <View style={styles.headerContainer}>
                <View style={styles.header}>
                  <Image src="/tienhock.png" style={styles.logo} />
                  <View style={styles.headerTextContainer}>
                    <Text style={styles.companyName}>
                      TIEN HOCK FOOD INDUSTRIES S/B (953309-T)
                    </Text>
                    <Text style={styles.companyDetails}>
                      Kg. Kibabaig, Penampang, Kota Kinabalu, Sabah
                    </Text>
                    <Text style={styles.companyDetails}>
                      Tel: (088)719715, 719799 Fax:(088)72645
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {pageInvoices.map((invoice, index) => {
              const { regularItems, specialRows } = getProcessedOrderDetails(
                invoice.orderDetails
              );

              return (
                <View key={index} style={styles.invoice}>
                  <View style={styles.table}>
                    {renderInvoiceInfoRows(invoice)}
                    <View style={styles.tableContent}>
                      <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text
                          style={[styles.tableCell, styles.descriptionCell]}
                        >
                          Description
                        </Text>
                        <Text style={[styles.tableCell, styles.focCell]}>
                          Foc
                        </Text>
                        <Text style={[styles.tableCell, styles.returnCell]}>
                          Return
                        </Text>
                        <Text style={[styles.tableCell, styles.qtyCell]}>
                          Qty
                        </Text>
                        <Text style={[styles.tableCell, styles.priceCell]}>
                          Unit/Price
                        </Text>
                        <Text style={[styles.tableCell, styles.amountCell]}>
                          Amount
                        </Text>
                      </View>

                      {regularItems.map(
                        ({ detail, foc, returned }, detailIndex) =>
                          renderTableRow(
                            detail, // Pass the detail object directly, since it already contains all properties
                            foc,
                            returned
                          )
                      )}

                      {specialRows.map((specialRow, index) =>
                        renderTableRow(specialRow, 0, 0, true)
                      )}

                      <View style={styles.totalRow}>
                        <Text style={styles.bold}>
                          Total Amount Payable: RM{" "}
                          {Number(invoice.totalAmount).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}

            {pageIndex === pages.length - 1 && (
              <View style={styles.summary}>
                <Text style={[styles.bold, styles.summaryTitle]}>Summary</Text>
                <View style={styles.summaryRow}>
                  <Text>Cash Invoices ({totals.cashCount}):</Text>
                  <Text>RM {totals.cashTotal.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text>Credit Invoices ({totals.invoiceCount}):</Text>
                  <Text>RM {totals.invoiceTotal.toFixed(2)}</Text>
                </View>
                <View style={[styles.summaryRow, styles.grandTotal]}>
                  <Text style={styles.bold}>Grand Total:</Text>
                  <Text style={styles.bold}>
                    RM {(totals.cashTotal + totals.invoiceTotal).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </Page>
        ))}
      </Document>
    </PDFViewer>
  );
};

export default InvoisPDF;
