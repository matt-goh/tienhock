import React from "react";
import { Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { InvoiceData, OrderDetail } from "../../types/types";

const ROWS_PER_PAGE = 28;
const HEADER_ROWS = 3;
const TABLE_HEADER_ROWS = 3;
const SUMMARY_ROWS = 4;

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
    paddingVertical: 35,
    paddingLeft: 40,
    paddingRight: 40,
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
    paddingBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.table.borderDark,
    borderBottomStyle: "solid",
    minHeight: 20,
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
    paddingTop: 6,
    paddingRight: 8,
  },
  summary: {
    marginTop: -2,
  },
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
    minHeight: 20,
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

const InvoisPDF: React.FC<{ invoices: InvoiceData[] }> = ({ invoices }) => {
  const getProcessedOrderDetails = (details: OrderDetail[]) => {
    // Keep track of all rows in their original order
    const orderedRows: OrderDetail[] = [];

    // Map to store regular items with their FOC and returned quantities
    const regularDetails = new Map<
      string,
      {
        detail: OrderDetail;
        foc: number;
        returned: number;
      }
    >();

    // First pass: Process regular items to combine FOC and returned quantities
    details.forEach((detail) => {
      // Skip special rows and total rows in first pass
      if (
        detail.isless ||
        detail.istax ||
        detail.issubtotal ||
        detail.istotal
      ) {
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

    // Second pass: Build the ordered rows while maintaining original sequence
    details.forEach((detail) => {
      if (detail.istotal) return; // Skip total rows

      if (detail.isless || detail.istax || detail.issubtotal) {
        // Format description for special rows
        let formattedDescription = detail.productname || "";

        if (detail.issubtotal) {
          formattedDescription = "Subtotal";
        } else if (detail.isless) {
          formattedDescription = `${formattedDescription} (Less)`;
        } else if (detail.istax) {
          formattedDescription = `${formattedDescription} (Tax)`;
        }

        const specialRow = {
          ...detail,
          productname: formattedDescription,
          issubtotal: detail.issubtotal,
        };
        orderedRows.push(specialRow);
      } else if (!detail.isfoc && !detail.isreturned) {
        // Only process regular items once (not FOC or returned versions)
        const key = `${detail.code}-${detail.productname}`;
        const item = regularDetails.get(key);
        if (item && !orderedRows.some((row) => row.code === detail.code)) {
          orderedRows.push(item.detail);
        }
      }
    });

    return {
      regularItems: Array.from(regularDetails.values()),
      orderedRows: orderedRows,
    };
  };

  const calculateInvoiceRows = (invoice: InvoiceData) => {
    const { orderedRows } = getProcessedOrderDetails(invoice.orderDetails);
    return TABLE_HEADER_ROWS + orderedRows.length + 1; // +1 for the total row
  };

  const paginateInvoices = (invoices: InvoiceData[]) => {
    const pages: InvoiceData[][] = [];
    let currentPage: InvoiceData[] = [];
    let currentPageRows = HEADER_ROWS;
    let remainingSpace = 0;

    // Calculate total rows needed for summary
    const summaryNeededRows = SUMMARY_ROWS;

    invoices.forEach((invoice, index) => {
      const invoiceRows = calculateInvoiceRows(invoice);
      const isLastInvoice = index === invoices.length - 1;

      // Check if adding this invoice would exceed page limit
      if (currentPageRows + invoiceRows > ROWS_PER_PAGE) {
        // If this is the last invoice, check if we need a new page for summary
        if (isLastInvoice) {
          remainingSpace = ROWS_PER_PAGE - currentPageRows;
          // If not enough space for both invoice and summary, start a new page
          if (remainingSpace < invoiceRows + summaryNeededRows) {
            pages.push(currentPage);
            currentPage = [invoice];
            currentPageRows = HEADER_ROWS + invoiceRows;
          } else {
            currentPage.push(invoice);
            currentPageRows += invoiceRows;
          }
        } else {
          // Not the last invoice, simply start a new page
          pages.push(currentPage);
          currentPage = [invoice];
          currentPageRows = HEADER_ROWS + invoiceRows;
        }
      } else {
        // Check if this is the last invoice and if we have enough space for summary
        if (
          isLastInvoice &&
          currentPageRows + invoiceRows + summaryNeededRows > ROWS_PER_PAGE
        ) {
          // Not enough space for summary, push current page and start new one
          pages.push(currentPage);
          currentPage = [invoice];
          currentPageRows = HEADER_ROWS + invoiceRows;
        } else {
          // Enough space, add to current page
          currentPage.push(invoice);
          currentPageRows += invoiceRows;
        }
      }
    });

    // Push the last page if it has any invoices
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    return pages;
  };

  const renderTableRow = (
    detail: OrderDetail & { issubtotal?: boolean },
    foc: number = 0,
    returned: number = 0,
    isSpecialRow: boolean = false,
    index: number
  ) => (
    <View
      key={`row-${index}`}
      style={detail.issubtotal ? styles.subtotalRow : styles.tableRow}
    >
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
    <>
      {pages.map((pageInvoices, pageIndex) => (
        <Page key={`page-${pageIndex}`} size="A4" style={styles.page}>
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

          {pageInvoices.map((invoice, invoiceIndex) => {
            const { regularItems, orderedRows } = getProcessedOrderDetails(
              invoice.orderDetails
            );

            return (
              <View
                key={`invoice-${pageIndex}-${invoiceIndex}`}
                style={styles.invoice}
              >
                <View style={styles.table}>
                  {renderInvoiceInfoRows(invoice)}
                  <View style={styles.tableContent}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                      <Text style={[styles.tableCell, styles.descriptionCell]}>
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

                    {orderedRows.map((row, rowIndex) => {
                      if (row.isless || row.istax || row.issubtotal) {
                        return renderTableRow(row, 0, 0, true, rowIndex);
                      } else {
                        const item = regularItems.find(
                          (item) => item.detail.code === row.code
                        );
                        return renderTableRow(
                          row,
                          item?.foc || 0,
                          item?.returned || 0,
                          false,
                          rowIndex
                        );
                      }
                    })}

                    {/* Total row */}
                    <View key={`total-${invoiceIndex}`} style={styles.totalRow}>
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
    </>
  );
};

export default InvoisPDF;
